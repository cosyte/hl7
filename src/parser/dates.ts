/**
 * HL7 v2 TS/DTM datetime handling for the `@cosyte/hl7` parser pipeline.
 *
 * Phase N (datetime precision + timezone fidelity) reworked this module from a
 * `Date`-coercing helper into a **fidelity-first** parser. The HL7 v2 Ch. 2A
 * DTM datatype is `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`, where the
 * number of populated characters (excluding the offset) sets the precision and
 * a missing offset "defaults to that of the local time zone of the sender" —
 * NOT UTC and NOT the parser's zone. The old behavior (zero-fill truncations,
 * assume-UTC on a missing offset, eager `Date`) is an architectural defect
 * [S-DTM-IMPL]: it silently shifts a day-only birth date (`|19880705|`) by a
 * day in any negative-offset zone.
 *
 * This module therefore:
 *  - `parseDtm(raw)` decodes the DTM into typed **parts** (`DtmParts`) —
 *    precision preserved, no zero-fill, no `Date`, no UTC assumption.
 *  - `formatDtm(parts)` reconstructs the DTM string from parts (round-trip).
 *  - `dtmToDate(parts, opts)` materializes an absolute `Date` **only on
 *    explicit caller request**, refusing to guess a zone for an offset-less
 *    value unless the caller supplies one.
 *  - `parseDtmCascade(raw, opts)` is the lenient wrapper (strict DTM → user
 *    formats → built-in fallbacks) used by non-composite callers such as
 *    `msg.meta.timestamp`; it emits `TIMESTAMP_FALLBACK_FORMAT` on a fallback.
 *
 * Zero runtime deps — only the JS stdlib `Date` / `Date.UTC` APIs and
 * hand-rolled regex / token matchers. No date-fns, no luxon, no moment.
 */

import { timestampFallbackFormat } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position } from "./types.js";

/**
 * Stated precision of a parsed HL7 DTM value — the number of populated
 * characters (excluding the timezone offset) determines which level applies.
 * A value's precision is preserved verbatim: `|1970|` is `"year"`, never
 * silently promoted to a full timestamp.
 *
 * @example
 * ```ts
 * import { parseDtm } from "@cosyte/hl7";
 * console.log(parseDtm("1970").precision);           // "year"
 * console.log(parseDtm("198807050000").precision);   // "minute"
 * ```
 */
export type DtmPrecision = "year" | "month" | "day" | "hour" | "minute" | "second" | "fraction";

/**
 * Parsed HL7 v2 TS/DTM value — the raw string plus its structural parts, with
 * the stated **precision** and **timezone fidelity** preserved. This is the
 * shape of the `TS` composite (`field.asTs()`) and every helper datetime.
 *
 * The parts are only populated when `valid` is `true`. `month`/`day`/… are
 * **spec-native** (`month` is 1–12, NOT the JS `Date` 0–11). `offsetMinutes`
 * is present iff `hasTimezone` is `true` and is signed minutes east of UTC
 * (`+0500` → `300`, `-0430` → `-270`). A missing offset is **flagged**
 * (`hasTimezone: false`), never resolved to UTC — the consumer decides how to
 * localize with {@link dtmToDate}.
 *
 * @example
 * ```ts
 * import type { DtmParts } from "@cosyte/hl7";
 * const dob: DtmParts = {
 *   raw: "19880705", valid: true, precision: "day",
 *   year: 1988, month: 7, day: 5, hasTimezone: false,
 * };
 * ```
 */
export interface DtmParts {
  /** The original HL7 string, exactly as it appeared (already unescaped). */
  readonly raw: string;
  /**
   * `true` when `raw` is a well-formed, in-range HL7 DTM (or a matched
   * fallback format). `false` for empty, malformed, or calendar-out-of-range
   * input — in which case only `raw` and `hasTimezone: false` are meaningful.
   */
  readonly valid: boolean;
  /** Stated precision; absent when `valid` is `false`. */
  readonly precision?: DtmPrecision;
  /** Four-digit year. */
  readonly year?: number;
  /** Month, 1–12 (spec-native, NOT JS 0–11). */
  readonly month?: number;
  /** Day of month, 1–31. */
  readonly day?: number;
  /** Hour, 0–23. */
  readonly hour?: number;
  /** Minute, 0–59. */
  readonly minute?: number;
  /** Second, 0–59. */
  readonly second?: number;
  /**
   * Fractional-second digits exactly as populated (no leading dot), e.g.
   * `"5"` (0.5 s), `"0500"` (0.05 s). Preserved verbatim — never rounded.
   */
  readonly fractionalSeconds?: string;
  /** `true` iff an explicit `+/-ZZZZ` offset was present. */
  readonly hasTimezone: boolean;
  /** Signed minutes east of UTC; present iff `hasTimezone` is `true`. */
  readonly offsetMinutes?: number;
  /**
   * The fallback format that matched (`parseDtmCascade` only), e.g.
   * `"MM/DD/YYYY"` or `"ISO-8601"`. Absent for a strict HL7 DTM parse.
   */
  readonly matchedFormat?: string;
}

/**
 * Ordered list of built-in timestamp formats {@link parseDtmCascade} falls
 * back to when neither the strict HL7 DTM match nor any user-supplied format
 * succeeds. ISO-8601 is tried first (most constrained); `MM/DD/YYYY HH:mm:ss`
 * last (it overlaps the date-only form).
 *
 * @example
 * ```ts
 * import { BUILTIN_DATE_FALLBACKS } from "@cosyte/hl7";
 * console.log(BUILTIN_DATE_FALLBACKS);
 * // ["ISO-8601", "YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YYYY HH:mm:ss"]
 * ```
 */
export const BUILTIN_DATE_FALLBACKS: readonly string[] = [
  "ISO-8601",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "MM/DD/YYYY HH:mm:ss",
] as const;

/**
 * Every date-format token the library's format-string matcher and
 * `defineProfile()` D-08 validator recognize. Re-exported so profile authors
 * can introspect the valid token set. `SSSS` (fractional seconds) is
 * recognised by the D-08 validator only.
 *
 * @example
 * ```ts
 * import { SUPPORTED_DATE_TOKENS } from "@cosyte/hl7";
 * console.log(SUPPORTED_DATE_TOKENS);
 * // ["YYYY", "MM", "DD", "HH", "mm", "ss", "SSSS"]
 * ```
 */
export const SUPPORTED_DATE_TOKENS: readonly string[] = [
  "YYYY",
  "MM",
  "DD",
  "HH",
  "mm",
  "ss",
  "SSSS",
] as const;

/**
 * The empty / unparseable result — `valid: false`, no parts, no timezone.
 * Frozen and shared to avoid per-call allocation on the common miss path.
 *
 * @internal
 */
const INVALID_PARTS_BASE = { valid: false as const, hasTimezone: false as const };

/**
 * The frozen invalid/unparseable result for a raw string — `valid: false`, no
 * parts, no timezone. Frozen so every public `DtmParts` is immutable uniformly
 * (matching the composite path and `batch.ts`).
 *
 * @internal
 */
function invalidDtm(raw: string): DtmParts {
  return Object.freeze({ raw, ...INVALID_PARTS_BASE });
}

/**
 * HL7 v2 DTM shape: `YYYY[MM[DD[HH[MM[SS[.SSSS]]]]]]` with an optional trailing
 * `+/-ZZZZ` offset. No separators between digit groups.
 *
 * @internal
 */
const DTM_PATTERN =
  /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,4}))?(?:([+-])(\d{2})(\d{2}))?$/u;

/**
 * Parse an HL7 v2 TS/DTM string into typed {@link DtmParts}, **preserving the
 * stated precision and timezone fidelity**. Never zero-fills a truncation,
 * never coerces to a `Date`, and never assumes UTC for a missing offset.
 *
 * Returns `{ raw, valid: false, hasTimezone: false }` (no parts) for empty,
 * malformed, or calendar-out-of-range input — never throws. A fractional
 * component is only accepted at full second precision.
 *
 * @example
 * ```ts
 * import { parseDtm } from "@cosyte/hl7";
 *
 * parseDtm("1970");
 * // { raw: "1970", valid: true, precision: "year", year: 1970, hasTimezone: false }
 *
 * parseDtm("20250102153045.5-0500");
 * // precision "fraction", fractionalSeconds "5", hasTimezone true, offsetMinutes -300
 *
 * parseDtm("not-a-date");
 * // { raw: "not-a-date", valid: false, hasTimezone: false }
 * ```
 */
export function parseDtm(raw: string): DtmParts {
  if (raw === "") return invalidDtm(raw);

  const match = DTM_PATTERN.exec(raw);
  if (match === null) return invalidDtm(raw);

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fracStr, sign, offHh, offMm] =
    match;
  if (yearStr === undefined) return invalidDtm(raw);

  // A fractional component is only meaningful at full second precision.
  if (fracStr !== undefined && secondStr === undefined) return invalidDtm(raw);

  const year = parseInt(yearStr, 10);
  const month = monthStr !== undefined ? parseInt(monthStr, 10) : undefined;
  const day = dayStr !== undefined ? parseInt(dayStr, 10) : undefined;
  const hour = hourStr !== undefined ? parseInt(hourStr, 10) : undefined;
  const minute = minuteStr !== undefined ? parseInt(minuteStr, 10) : undefined;
  const second = secondStr !== undefined ? parseInt(secondStr, 10) : undefined;

  // Calendar-range validation — out-of-range is invalid, never a wrong guess.
  if (
    (month !== undefined && (month < 1 || month > 12)) ||
    (day !== undefined && (day < 1 || day > 31)) ||
    (hour !== undefined && hour > 23) ||
    (minute !== undefined && minute > 59) ||
    (second !== undefined && second > 59)
  ) {
    return invalidDtm(raw);
  }

  let hasTimezone = false;
  let offsetMinutes: number | undefined;
  if (sign !== undefined && offHh !== undefined && offMm !== undefined) {
    const offHours = parseInt(offHh, 10);
    const offMins = parseInt(offMm, 10);
    // Offsets range roughly ±14:00; accept up to ±24:00, reject nonsense minutes.
    if (offHours > 24 || offMins > 59) return invalidDtm(raw);
    hasTimezone = true;
    offsetMinutes = (sign === "-" ? -1 : 1) * (offHours * 60 + offMins);
  }

  const precision: DtmPrecision =
    fracStr !== undefined
      ? "fraction"
      : second !== undefined
        ? "second"
        : minute !== undefined
          ? "minute"
          : hour !== undefined
            ? "hour"
            : day !== undefined
              ? "day"
              : month !== undefined
                ? "month"
                : "year";

  return Object.freeze({
    raw,
    valid: true,
    precision,
    year,
    ...(month !== undefined ? { month } : {}),
    ...(day !== undefined ? { day } : {}),
    ...(hour !== undefined ? { hour } : {}),
    ...(minute !== undefined ? { minute } : {}),
    ...(second !== undefined ? { second } : {}),
    ...(fracStr !== undefined ? { fractionalSeconds: fracStr } : {}),
    hasTimezone,
    ...(offsetMinutes !== undefined ? { offsetMinutes } : {}),
  });
}

/**
 * Reconstruct the HL7 DTM string from {@link DtmParts}. The inverse of
 * {@link parseDtm} for a strict HL7 parse — `formatDtm(parseDtm(s)) === s` for
 * any well-formed `s`, including the byte-preserving `-0000` (which HL7, unlike
 * RFC 3339, treats as UTC but whose sign we retain for exact round-trip).
 * Returns the raw string unchanged when `parts.valid` is `false`.
 *
 * Emits exactly the populated precision — no zero-fill — so a year-only value
 * re-serializes to four characters, never `YYYY0101`.
 *
 * @example
 * ```ts
 * import { parseDtm, formatDtm } from "@cosyte/hl7";
 * formatDtm(parseDtm("198807050000")); // "198807050000"
 * formatDtm(parseDtm("1970"));         // "1970"
 * ```
 */
export function formatDtm(parts: DtmParts): string {
  if (!parts.valid || parts.year === undefined) return parts.raw;

  const pad = (n: number, width: number): string => n.toString().padStart(width, "0");
  let out = pad(parts.year, 4);
  if (parts.month !== undefined) out += pad(parts.month, 2);
  if (parts.day !== undefined) out += pad(parts.day, 2);
  if (parts.hour !== undefined) out += pad(parts.hour, 2);
  if (parts.minute !== undefined) out += pad(parts.minute, 2);
  if (parts.second !== undefined) out += pad(parts.second, 2);
  if (parts.fractionalSeconds !== undefined) out += `.${parts.fractionalSeconds}`;
  if (parts.hasTimezone && parts.offsetMinutes !== undefined) {
    const total = parts.offsetMinutes;
    // `Object.is(total, -0)` catches a `-0000` offset (parsed as -0) so it
    // re-serializes byte-exact as `-0000`, not `+0000`.
    const sign = total < 0 || Object.is(total, -0) ? "-" : "+";
    const abs = Math.abs(total);
    out += `${sign}${pad(Math.floor(abs / 60), 2)}${pad(abs % 60, 2)}`;
  }
  return out;
}

/**
 * Options controlling how {@link dtmToDate} resolves a missing timezone.
 *
 * @example
 * ```ts
 * import { parseDtm, dtmToDate } from "@cosyte/hl7";
 * // Treat an offset-less value as UTC (an explicit caller choice):
 * dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 });
 * // ...or as US Eastern standard time (UTC-05:00):
 * dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: -300 });
 * ```
 */
export interface DtmToDateOptions {
  /**
   * Offset (signed minutes east of UTC) to assume when the value carries **no**
   * timezone. Without it, an offset-less value resolves to `undefined` —
   * {@link dtmToDate} never guesses a zone. Ignored when the value already has
   * an offset. Pass `0` to explicitly treat a naive value as UTC.
   */
  readonly assumeOffsetMinutes?: number;
}

/**
 * Materialize an absolute-instant JS `Date` from {@link DtmParts} — **only on
 * explicit caller request**. Truncated fields fill to their lowest legal value
 * (month → January, day → 1, time → 0) *for instant construction only*; the
 * value's stated `precision` still tells the truth.
 *
 * Timezone resolution is honest:
 *  - has an offset → the exact instant, using that offset;
 *  - no offset + `assumeOffsetMinutes` supplied → that offset is applied;
 *  - no offset + nothing supplied → `undefined` (never a silent UTC guess).
 *
 * Returns `undefined` for an invalid value or an unresolvable zone; never
 * throws.
 *
 * @example
 * ```ts
 * import { parseDtm, dtmToDate } from "@cosyte/hl7";
 *
 * dtmToDate(parseDtm("20250102153045-0500"))?.toISOString();
 * // "2025-01-02T20:30:45.000Z" — exact, offset-derived
 *
 * dtmToDate(parseDtm("20250102"));                       // undefined — refuses to guess the zone
 * dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString();
 * // "2025-01-02T00:00:00.000Z" — caller explicitly assumed UTC
 * ```
 */
export function dtmToDate(parts: DtmParts, options: DtmToDateOptions = {}): Date | undefined {
  if (!parts.valid || parts.year === undefined) return undefined;

  const offset = parts.hasTimezone ? parts.offsetMinutes : options.assumeOffsetMinutes;
  if (offset === undefined) return undefined;

  let ms = 0;
  if (parts.fractionalSeconds !== undefined) {
    ms = parseInt((parts.fractionalSeconds + "000").slice(0, 3), 10);
  }

  // Build via setUTCFullYear so a 1–99 AD year is NOT remapped to 1900–1999 by
  // `Date.UTC`'s legacy two-digit-year behavior (ECMA-262) — a spec-valid
  // 4-digit DTM year like `0050` must stay year 50.
  const utc = new Date(0);
  utc.setUTCFullYear(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1);
  utc.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, ms);
  // The value is expressed in `offset`; shift to UTC by subtracting it.
  const candidate = new Date(utc.getTime() - offset * 60_000);
  return isNaN(candidate.getTime()) ? undefined : candidate;
}

/**
 * Options passed to {@link parseDtmCascade}. `emit` and `position` are needed
 * only when the caller wants `TIMESTAMP_FALLBACK_FORMAT` warnings to surface.
 *
 * @internal
 */
export interface ParseDtmCascadeOptions {
  readonly userFormats?: readonly string[];
  readonly emit?: (warning: Hl7ParseWarning) => void;
  readonly position?: Hl7Position;
}

/**
 * Lenient datetime parse for non-composite callers (e.g. `msg.meta.timestamp`):
 *
 * 1. Strict HL7 DTM via {@link parseDtm} — no warning (spec-preferred).
 * 2. User-supplied formats, in order — first match wins, emits
 *    `TIMESTAMP_FALLBACK_FORMAT`.
 * 3. Built-in {@link BUILTIN_DATE_FALLBACKS}, in order — emits on match.
 *
 * Always returns {@link DtmParts}; a fallback match sets `matchedFormat` and
 * `valid: true` with the parts it could recover. A total miss returns an
 * invalid result (no throw, no warning — nothing fell back to).
 *
 * @internal
 */
export function parseDtmCascade(raw: string, opts: ParseDtmCascadeOptions): DtmParts {
  if (raw === "") return invalidDtm(raw);

  const strict = parseDtm(raw);
  if (strict.valid) return strict;

  for (const format of opts.userFormats ?? []) {
    const matched = matchTokenParts(raw, format);
    if (matched !== undefined) {
      emitFallback(opts, format);
      return Object.freeze({ ...matched, raw, matchedFormat: format });
    }
  }

  for (const builtin of BUILTIN_DATE_FALLBACKS) {
    const matched = builtin === "ISO-8601" ? parseIsoParts(raw) : matchTokenParts(raw, builtin);
    if (matched !== undefined) {
      emitFallback(opts, builtin);
      return Object.freeze({ ...matched, raw, matchedFormat: builtin });
    }
  }

  return invalidDtm(raw);
}

/**
 * Emit a `TIMESTAMP_FALLBACK_FORMAT` warning when both an `emit` callback and a
 * `position` are supplied.
 *
 * @internal
 */
function emitFallback(opts: ParseDtmCascadeOptions, matchedFormat: string): void {
  if (opts.emit !== undefined && opts.position !== undefined) {
    opts.emit(timestampFallbackFormat(opts.position, matchedFormat));
  }
}

/**
 * Token set recognised by the minimal format-string matcher. `MM` is month and
 * `mm` is minute (case-sensitive, moment.js-style).
 *
 * @internal
 */
const TOKENS = ["YYYY", "MM", "DD", "HH", "mm", "ss"] as const;

/** @internal Digit-width of each token. */
const TOKEN_LENGTHS: Readonly<Record<(typeof TOKENS)[number], number>> = {
  YYYY: 4,
  MM: 2,
  DD: 2,
  HH: 2,
  mm: 2,
  ss: 2,
};

/**
 * Minimal format-string matcher over the tokens `YYYY MM DD HH mm ss`. Anything
 * else in `format` is a literal. Returns fidelity {@link DtmParts} (no offset —
 * these formats carry none) or `undefined` on mismatch. Parsing is strictly
 * linear so untrusted format strings cannot cause exponential backtracking.
 *
 * @internal
 */
function matchTokenParts(input: string, format: string): DtmParts | undefined {
  type Token = (typeof TOKENS)[number];
  type Part =
    | { readonly kind: "token"; readonly token: Token }
    | { readonly kind: "lit"; readonly value: string };

  const parts: Part[] = [];
  let i = 0;
  while (i < format.length) {
    let matched: Token | undefined;
    for (const t of TOKENS) {
      if (format.slice(i, i + t.length) === t) {
        matched = t;
        break;
      }
    }
    if (matched !== undefined) {
      parts.push({ kind: "token", token: matched });
      i += matched.length;
    } else {
      parts.push({ kind: "lit", value: format.charAt(i) });
      i += 1;
    }
  }

  const got: Partial<Record<Token, number>> = {};
  let j = 0;
  for (const p of parts) {
    if (p.kind === "lit") {
      if (input.charAt(j) !== p.value) return undefined;
      j += 1;
    } else {
      const len = TOKEN_LENGTHS[p.token];
      const chunk = input.slice(j, j + len);
      if (chunk.length !== len || !/^\d+$/u.test(chunk)) return undefined;
      got[p.token] = parseInt(chunk, 10);
      j += len;
    }
  }
  if (j !== input.length) return undefined; // trailing chars = mismatch

  return buildFallbackParts({
    year: got.YYYY,
    month: got.MM,
    day: got.DD,
    hour: got.HH,
    minute: got.mm,
    second: got.ss,
  });
}

/**
 * Parse an ISO-8601 string into fidelity {@link DtmParts} behind a strict shape
 * guard (requires at least `YYYY-MM-DD` so raw HL7 digit strings never match
 * here). Preserves an explicit `Z`/`+HH:MM` offset as timezone fidelity.
 *
 * @internal
 */
function parseIsoParts(raw: string): DtmParts | undefined {
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?)?$/u.exec(
      raw,
    );
  if (iso === null) return undefined;
  const [, y, mo, d, h, mi, s, frac, tz] = iso;

  let hasTimezone = false;
  let offsetMinutes: number | undefined;
  if (tz !== undefined) {
    hasTimezone = true;
    if (tz === "Z") {
      offsetMinutes = 0;
    } else {
      const sign = tz.startsWith("-") ? -1 : 1;
      const digits = tz.slice(1).replace(":", "");
      offsetMinutes =
        sign * (parseInt(digits.slice(0, 2), 10) * 60 + parseInt(digits.slice(2), 10));
    }
  }

  return buildFallbackParts({
    year: y !== undefined ? parseInt(y, 10) : undefined,
    month: mo !== undefined ? parseInt(mo, 10) : undefined,
    day: d !== undefined ? parseInt(d, 10) : undefined,
    hour: h !== undefined ? parseInt(h, 10) : undefined,
    minute: mi !== undefined ? parseInt(mi, 10) : undefined,
    second: s !== undefined ? parseInt(s, 10) : undefined,
    fractionalSeconds: frac,
    hasTimezone,
    offsetMinutes,
  });
}

/**
 * Assemble validated {@link DtmParts} from a fallback match, computing the
 * precision from which fields are present and range-checking each. Returns
 * `undefined` when any field is out of range.
 *
 * @internal
 */
function buildFallbackParts(f: {
  year: number | undefined;
  month?: number | undefined;
  day?: number | undefined;
  hour?: number | undefined;
  minute?: number | undefined;
  second?: number | undefined;
  fractionalSeconds?: string | undefined;
  hasTimezone?: boolean | undefined;
  offsetMinutes?: number | undefined;
}): DtmParts | undefined {
  if (f.year === undefined) return undefined;
  if (
    (f.month !== undefined && (f.month < 1 || f.month > 12)) ||
    (f.day !== undefined && (f.day < 1 || f.day > 31)) ||
    (f.hour !== undefined && f.hour > 23) ||
    (f.minute !== undefined && f.minute > 59) ||
    (f.second !== undefined && f.second > 59)
  ) {
    return undefined;
  }

  const precision: DtmPrecision =
    f.fractionalSeconds !== undefined
      ? "fraction"
      : f.second !== undefined
        ? "second"
        : f.minute !== undefined
          ? "minute"
          : f.hour !== undefined
            ? "hour"
            : f.day !== undefined
              ? "day"
              : f.month !== undefined
                ? "month"
                : "year";

  return {
    raw: "", // caller overwrites with the real raw string
    valid: true,
    precision,
    year: f.year,
    ...(f.month !== undefined ? { month: f.month } : {}),
    ...(f.day !== undefined ? { day: f.day } : {}),
    ...(f.hour !== undefined ? { hour: f.hour } : {}),
    ...(f.minute !== undefined ? { minute: f.minute } : {}),
    ...(f.second !== undefined ? { second: f.second } : {}),
    ...(f.fractionalSeconds !== undefined ? { fractionalSeconds: f.fractionalSeconds } : {}),
    hasTimezone: f.hasTimezone ?? false,
    ...(f.offsetMinutes !== undefined ? { offsetMinutes: f.offsetMinutes } : {}),
  };
}
