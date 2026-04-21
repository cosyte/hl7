/**
 * Timestamp parsing helper for the `@cosyte/hl7` parser pipeline —
 * cascades from HL7 TS/DTM (YYYY[MM[DD[HH[MM[SS[.SSSS]]]]]] with optional
 * trailing offset) to user-supplied format strings to built-in ISO / date /
 * US-style fallbacks. The function emits a `TIMESTAMP_FALLBACK_FORMAT`
 * warning whenever a non-HL7 format matches so consumers can audit lenient
 * parses. Shipped in Phase 2 so the plumbing is stable before Phase 3's
 * typed composites (TS/DTM) begin calling it.
 *
 * Zero runtime deps — the module uses only the JS stdlib `Date` /
 * `Date.UTC` APIs and hand-rolled regex / token matchers. No date-fns, no
 * luxon, no moment.
 */

import { timestampFallbackFormat } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position } from "./types.js";

/**
 * Ordered list of built-in timestamp formats the cascade falls back to when
 * neither the strict HL7 TS/DTM match nor any user-supplied format succeeds.
 * The order is deliberate — ISO-8601 is tried first because it is the most
 * constrained pattern (hyphenated date + optional `T` + offset), and
 * `MM/DD/YYYY HH:mm:ss` is tried last because it overlaps the date-only
 * form and would otherwise mask it.
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
 * Options passed to `parseHl7Timestamp`. `emit` and `position` are required
 * only when the caller wants `TIMESTAMP_FALLBACK_FORMAT` warnings to surface;
 * omitting both is legal (Phase 3's `msg.get(path)` may not always know the
 * positional context when it calls this helper).
 *
 * @internal
 */
export interface ParseHl7TimestampOptions {
  readonly userFormats?: readonly string[];
  readonly emit?: (warning: Hl7ParseWarning) => void;
  readonly position?: Hl7Position;
}

/**
 * Parses an HL7 timestamp string through a deterministic cascade:
 *
 * 1. Strict HL7 TS/DTM (`YYYY[MM[DD[HH[MM[SS[.SSSS]]]]]]` with an optional
 *    trailing `+HHMM` / `-HHMM` offset). No warning on success — this is
 *    the spec-preferred format.
 * 2. User-supplied formats from `opts.userFormats`, tried in order. First
 *    match wins and emits `TIMESTAMP_FALLBACK_FORMAT` naming the format
 *    (TOL-08).
 * 3. Built-in fallbacks from `BUILTIN_DATE_FALLBACKS`, tried in order.
 *    Emits `TIMESTAMP_FALLBACK_FORMAT` naming the built-in on match
 *    (TOL-09 — built-ins are always tried after user formats).
 *
 * Returns `undefined` when no pattern matches — no throw, and no warning is
 * emitted because nothing fell back to (TOL-09's `TIMESTAMP_FALLBACK_FORMAT`
 * fires only on a successful fallback match).
 *
 * Timestamps without an explicit timezone offset are interpreted as UTC, so
 * round-trips via `toISOString()` are stable across host time zones.
 *
 * @example
 * ```ts
 * import { parseHl7Timestamp } from "@cosyte/hl7";
 *
 * // Strict HL7 TS/DTM — no warning
 * const a = parseHl7Timestamp("20250102153045", {});
 * console.log(a?.toISOString()); // "2025-01-02T15:30:45.000Z"
 *
 * // User format, with warning
 * const warnings: unknown[] = [];
 * const b = parseHl7Timestamp("01/02/2025", {
 *   userFormats: ["MM/DD/YYYY"],
 *   emit: (w) => warnings.push(w),
 *   position: { segmentIndex: 1, fieldIndex: 7 },
 * });
 * console.log(b?.toISOString()); // "2025-01-02T00:00:00.000Z"
 * ```
 */
export function parseHl7Timestamp(raw: string, opts: ParseHl7TimestampOptions): Date | undefined {
  if (raw.length === 0) return undefined;

  // 1. HL7 TS/DTM — never warns (this is the spec-preferred format)
  const hl7Result = parseHl7TsDtm(raw);
  if (hl7Result !== undefined) return hl7Result;

  // 2. User-supplied formats, in order
  for (const format of opts.userFormats ?? []) {
    const matched = matchTokenFormat(raw, format);
    if (matched !== undefined) {
      emitFallback(opts, format);
      return matched;
    }
  }

  // 3. Built-in fallbacks, in order. ISO first because it's the most constrained.
  for (const builtin of BUILTIN_DATE_FALLBACKS) {
    const matched = builtin === "ISO-8601" ? parseIso8601(raw) : matchTokenFormat(raw, builtin);
    if (matched !== undefined) {
      emitFallback(opts, builtin);
      return matched;
    }
  }

  return undefined;
}

/**
 * Emit a `TIMESTAMP_FALLBACK_FORMAT` warning when both an `emit` callback
 * and a `position` are supplied. Callers without full positional context
 * (e.g. certain Phase 3 typed-composite call sites) may omit either field
 * to get a silent fallback match.
 *
 * @internal
 */
function emitFallback(opts: ParseHl7TimestampOptions, matchedFormat: string): void {
  if (opts.emit !== undefined && opts.position !== undefined) {
    opts.emit(timestampFallbackFormat(opts.position, matchedFormat));
  }
}

/**
 * Parse HL7 TS/DTM: `YYYY[MM[DD[HH[MM[SS[.SSSS]]]]]]` with an optional
 * trailing `+HHMM` / `-HHMM` offset. No separators between digit groups.
 * Returns `undefined` when the pattern does not match or when the decoded
 * calendar fields are out of range.
 *
 * @internal
 */
function parseHl7TsDtm(raw: string): Date | undefined {
  const pattern =
    /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,4}))?(?:([+\-])(\d{2})(\d{2}))?$/u;
  const match = pattern.exec(raw);
  if (match === null) return undefined;

  const yearStr = match[1];
  if (yearStr === undefined) return undefined;
  const year = parseInt(yearStr, 10);
  const month = match[2] !== undefined ? parseInt(match[2], 10) - 1 : 0;
  const day = match[3] !== undefined ? parseInt(match[3], 10) : 1;
  const hour = match[4] !== undefined ? parseInt(match[4], 10) : 0;
  const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
  const second = match[6] !== undefined ? parseInt(match[6], 10) : 0;

  // Fractional seconds: "5" means 0.5s = 500ms; "50" means 0.50s = 500ms;
  // "005" means 0.005s = 5ms. Pad right with zeroes then take first 3 digits.
  let milliseconds = 0;
  if (match[7] !== undefined) {
    const padded = (match[7] + "000").slice(0, 3);
    milliseconds = parseInt(padded, 10);
  }

  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }

  let epochMs = Date.UTC(year, month, day, hour, minute, second, milliseconds);
  if (match[8] !== undefined && match[9] !== undefined && match[10] !== undefined) {
    const sign = match[8] === "+" ? 1 : -1;
    const tzMinutes = parseInt(match[9], 10) * 60 + parseInt(match[10], 10);
    // Input is expressed in the offset timezone; shift to UTC by subtracting the offset.
    epochMs -= sign * tzMinutes * 60_000;
  }

  const candidate = new Date(epochMs);
  return isNaN(candidate.getTime()) ? undefined : candidate;
}

/**
 * Parse an ISO-8601 string using the JS `Date` constructor behind a strict
 * shape guard. The guard requires at least `YYYY-MM-DD` (hyphenated date
 * part) so we do not accidentally match raw HL7 TS/DTM digit strings.
 *
 * @internal
 */
function parseIso8601(raw: string): Date | undefined {
  const isoPattern =
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?)?$/u;
  if (!isoPattern.test(raw)) return undefined;
  const candidate = new Date(raw);
  return isNaN(candidate.getTime()) ? undefined : candidate;
}

/**
 * Token set recognised by the minimal format-string matcher. `MM` is month
 * and `mm` is minute (case-sensitive, moment.js-style), matching the
 * spelling `MM/DD/YYYY HH:mm:ss` from REQUIREMENTS.md TOL-09.
 *
 * @internal
 */
const TOKENS = ["YYYY", "MM", "DD", "HH", "mm", "ss"] as const;

/**
 * Every date-format token the library's format-string matcher and
 * `defineProfile()` D-08 validator recognize. Re-exported from
 * `@cosyte/hl7` so profile authors can introspect the valid
 * token set without importing internal modules. `SSSS` (fractional
 * seconds) is recognised by the D-08 validator only — the internal
 * format matcher doesn't consume it because milliseconds already flow
 * through the HL7 TS/DTM strict path (see `parseHl7TsDtm` above).
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
 * Length in digits for each token — used by `matchTokenFormat` to slice a
 * chunk of the input of exactly the right size.
 *
 * @internal
 */
const TOKEN_LENGTHS: Readonly<Record<(typeof TOKENS)[number], number>> = {
  YYYY: 4,
  MM: 2,
  DD: 2,
  HH: 2,
  mm: 2,
  ss: 2,
};

/**
 * Minimal format-string matcher for the tokens `YYYY`, `MM`, `DD`, `HH`,
 * `mm`, `ss`. Anything else in `format` is a literal character (including
 * whitespace and punctuation). Returns `undefined` when the input does not
 * match the template exactly, including any trailing characters. Parsing
 * is strictly linear — O(len(format) + len(input)) — so untrusted format
 * strings cannot cause exponential backtracking.
 *
 * @internal
 */
function matchTokenFormat(input: string, format: string): Date | undefined {
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

  const year = got.YYYY ?? 1970;
  const month = (got.MM ?? 1) - 1;
  const day = got.DD ?? 1;
  const hour = got.HH ?? 0;
  const minute = got.mm ?? 0;
  const second = got.ss ?? 0;
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }

  const candidate = new Date(Date.UTC(year, month, day, hour, minute, second));
  return isNaN(candidate.getTime()) ? undefined : candidate;
}
