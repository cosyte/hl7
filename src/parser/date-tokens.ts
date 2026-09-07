/**
 * The date-format token grammar: one statement of what a `dateFormats` entry
 * may contain, shared by the `defineProfile()` validator that refuses a bad
 * format at definition time and the matcher that honours a good one at parse
 * time. Publishing the vocabulary from a single table is what keeps
 * {@link SUPPORTED_DATE_TOKENS} honest: a token in that list has a spec here,
 * and a token with a spec here is matched.
 *
 * The narrative version, with the tokenisation, escaping, pairing and
 * adjacency rules and the two deliberate exclusions, is `Date token grammar`
 * in the published documentation.
 *
 * Zero runtime deps: string scanning and hand-rolled matchers only.
 */

import type { DtmParts, DtmPrecision } from "./dates.js";

/**
 * Declaration order of the vocabulary. The published list and the matcher's
 * longest-match order are both derived from this one array, so they cannot
 * drift apart.
 *
 * @internal
 */
const TOKEN_ORDER = [
  "YYYY",
  "MM",
  "M",
  "MMM",
  "MMMM",
  "DD",
  "D",
  "HH",
  "H",
  "hh",
  "h",
  "mm",
  "ss",
  "SSSS",
  "A",
] as const;

/**
 * A single date-format token. Token spellings are case-SENSITIVE (`MM` is
 * month, `mm` is minute); the alphabetic content a token matches in the INPUT
 * is compared case-insensitively. The published vocabulary a consumer reads is
 * {@link SUPPORTED_DATE_TOKENS}, which carries the same values as strings.
 *
 * @internal
 */
export type DateFormatToken = (typeof TOKEN_ORDER)[number];

/**
 * Every date-format token the library's format matcher and the
 * `defineProfile()` `dateFormats` validator recognize. Re-exported so profile
 * authors can introspect the valid token set.
 *
 * Every token listed here is honoured by the matcher: none is silently
 * accepted at definition time and then treated as literal characters. The
 * vocabulary carries **no two-digit-year token** (no century window is
 * applied, so a two-digit year cannot be resolved) and **no timezone token**
 * (a value with no offset is flagged, never resolved).
 *
 * @example
 * ```ts
 * import { SUPPORTED_DATE_TOKENS } from "@cosyte/hl7";
 * console.log(SUPPORTED_DATE_TOKENS);
 * // ["YYYY", "MM", "M", "MMM", "MMMM", "DD", "D", "HH", "H", "hh", "h", "mm", "ss", "SSSS", "A"]
 * ```
 */
export const SUPPORTED_DATE_TOKENS: readonly string[] = TOKEN_ORDER;

/**
 * English month names, index 0 = January, in the spec-native 1-12 order the
 * parsed parts use (the number is the index plus one, never a 0-based one).
 *
 * @internal
 */
const MONTH_NAMES_FULL: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** @internal Three-letter English month abbreviations, January first. */
const MONTH_NAMES_ABBREVIATED: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The field a numeric token populates. `hour12` is held separately from
 * `hour24` because it is not a clock reading until the meridiem is applied.
 *
 * @internal
 */
type NumericField = "year" | "month" | "day" | "hour24" | "hour12" | "minute" | "second";

/**
 * What one token matches. `minWidth !== maxWidth` marks a VARIABLE-WIDTH
 * numeric token, which is the property the adjacency rule keys on.
 *
 * @internal
 */
export type DateTokenSpec =
  | {
      readonly kind: "digits";
      readonly field: NumericField;
      readonly minWidth: number;
      readonly maxWidth: number;
      readonly min: number;
      readonly max: number;
    }
  | { readonly kind: "fraction"; readonly minWidth: number; readonly maxWidth: number }
  | { readonly kind: "monthName"; readonly names: readonly string[] }
  | { readonly kind: "meridiem" };

/**
 * The vocabulary table. Keyed by token, so a token added to `TOKEN_ORDER`
 * without a spec is a type error rather than a token the matcher ignores.
 *
 * @internal
 */
export const DATE_TOKEN_SPECS: Readonly<Record<DateFormatToken, DateTokenSpec>> = {
  YYYY: { kind: "digits", field: "year", minWidth: 4, maxWidth: 4, min: 1, max: 9999 },
  MM: { kind: "digits", field: "month", minWidth: 2, maxWidth: 2, min: 1, max: 12 },
  M: { kind: "digits", field: "month", minWidth: 1, maxWidth: 2, min: 1, max: 12 },
  MMM: { kind: "monthName", names: MONTH_NAMES_ABBREVIATED },
  MMMM: { kind: "monthName", names: MONTH_NAMES_FULL },
  DD: { kind: "digits", field: "day", minWidth: 2, maxWidth: 2, min: 1, max: 31 },
  D: { kind: "digits", field: "day", minWidth: 1, maxWidth: 2, min: 1, max: 31 },
  HH: { kind: "digits", field: "hour24", minWidth: 2, maxWidth: 2, min: 0, max: 23 },
  H: { kind: "digits", field: "hour24", minWidth: 1, maxWidth: 2, min: 0, max: 23 },
  hh: { kind: "digits", field: "hour12", minWidth: 2, maxWidth: 2, min: 1, max: 12 },
  h: { kind: "digits", field: "hour12", minWidth: 1, maxWidth: 2, min: 1, max: 12 },
  mm: { kind: "digits", field: "minute", minWidth: 2, maxWidth: 2, min: 0, max: 59 },
  ss: { kind: "digits", field: "second", minWidth: 2, maxWidth: 2, min: 0, max: 59 },
  SSSS: { kind: "fraction", minWidth: 1, maxWidth: 4 },
  A: { kind: "meridiem" },
};

/**
 * Tokens ordered longest first, which is what makes tokenisation a longest
 * match (`MMMM` before `MMM` before `MM` before `M`). Derived from
 * `TOKEN_ORDER` by a stable sort, so declaration order breaks ties.
 *
 * @internal
 */
const TOKENS_LONGEST_FIRST: readonly DateFormatToken[] = [...TOKEN_ORDER].sort(
  (a, b) => b.length - a.length,
);

/**
 * One element of a tokenised format. A literal records HOW it was written:
 * `escaped` came from `[...]`, `bare` is a single character taken verbatim,
 * and `unterminated` is a `[` with no closing `]`. The validator refuses two
 * of those three; the matcher treats all three as text to match.
 *
 * @internal
 */
export type DateFormatPart =
  | { readonly kind: "token"; readonly token: DateFormatToken; readonly at: number }
  | {
      readonly kind: "literal";
      readonly value: string;
      readonly at: number;
      readonly source: "escaped" | "bare" | "unterminated";
    };

/** @internal A single ASCII letter or digit, the class rule 2 governs. */
const ASCII_ALPHANUMERIC_RE = /^[A-Za-z0-9]$/u;

/** @internal ASCII-only lowercase fold, so token matching never depends on locale. */
function asciiLower(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    out += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : value.charAt(i);
  }
  return out;
}

/** @internal `true` when every character of `value` is an ASCII letter. */
function isAsciiLetters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const upper = code >= 0x41 && code <= 0x5a;
    const lower = code >= 0x61 && code <= 0x7a;
    if (!upper && !lower) return false;
  }
  return value.length > 0;
}

/** @internal `true` when every character of `value` is an ASCII digit. */
function isAsciiDigits(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x30 || code > 0x39) return false;
  }
  return value.length > 0;
}

/** @internal `true` when the part is a bare (unescaped) ASCII letter or digit. */
export function isBareAlphanumericLiteral(part: DateFormatPart): boolean {
  return (
    part.kind === "literal" && part.source === "bare" && ASCII_ALPHANUMERIC_RE.test(part.value)
  );
}

/**
 * `true` for a token that consumes digits (`MMM`, `MMMM` and `A` consume
 * letters, so they are excluded), which is half of what the adjacency rule
 * asks about.
 *
 * @internal
 */
function isNumericToken(token: DateFormatToken): boolean {
  const spec = DATE_TOKEN_SPECS[token];
  return spec.kind === "digits" || spec.kind === "fraction";
}

/**
 * `true` for a numeric token whose width is not fixed (`M`, `D`, `H`, `h`,
 * `SSSS`). Two adjacent numeric tokens are only ambiguous when one of them is
 * one of these: nothing can split the digit run deterministically.
 *
 * @internal
 */
function isVariableWidthToken(token: DateFormatToken): boolean {
  const spec = DATE_TOKEN_SPECS[token];
  if (spec.kind === "digits" || spec.kind === "fraction") return spec.minWidth !== spec.maxWidth;
  return false;
}

/**
 * `true` for a literal that consumes nothing, which is the empty escape `[]`
 * and nothing else. It is the one literal that cannot separate two tokens.
 *
 * @internal
 */
function isZeroWidthLiteral(part: DateFormatPart): boolean {
  return part.kind === "literal" && part.value.length === 0;
}

/** @internal An unsplittable digit run: which two tokens, and how it was written. */
export interface AmbiguousAdjacency {
  readonly left: DateFormatToken;
  readonly right: DateFormatToken;
  readonly at: number;
  readonly throughEmptyEscape: boolean;
}

/**
 * The first pair of numeric tokens that meet in the INPUT with nothing between
 * them where at least one is variable width, or `undefined` when the format
 * has no such pair. Nothing can split the digit run those two produce, so the
 * grammar refuses the format at definition time and the matcher reports no
 * match for it rather than answering with one of several equally valid
 * readings.
 *
 * Adjacency is a property of the input, not of the part list: a literal that
 * matches the empty string separates nothing, so the scan looks straight
 * through it and `M[]D` is the same digit run as `MD`.
 *
 * @internal
 */
export function ambiguousAdjacency(
  parts: readonly DateFormatPart[],
): AmbiguousAdjacency | undefined {
  let previous: DateFormatPart | undefined;
  let throughEmptyEscape = false;
  for (const part of parts) {
    if (isZeroWidthLiteral(part)) {
      throughEmptyEscape = true;
      continue;
    }
    if (
      previous !== undefined &&
      previous.kind === "token" &&
      part.kind === "token" &&
      isNumericToken(previous.token) &&
      isNumericToken(part.token) &&
      (isVariableWidthToken(previous.token) || isVariableWidthToken(part.token))
    ) {
      return { left: previous.token, right: part.token, at: previous.at, throughEmptyEscape };
    }
    previous = part;
    throughEmptyEscape = false;
  }
  return undefined;
}

/**
 * Split a format string into tokens and literals by longest match. Never
 * throws and never rejects: it reports what the format IS, and the validator
 * decides what is allowed. A `[` opens a literal escape that runs to the next
 * `]` and whose content matches verbatim; a `[` with no `]` is reported as an
 * `unterminated` literal rather than swallowing the rest of the format.
 *
 * @internal
 */
export function tokeniseDateFormat(format: string): readonly DateFormatPart[] {
  const parts: DateFormatPart[] = [];
  let i = 0;
  while (i < format.length) {
    if (format.charAt(i) === "[") {
      const close = format.indexOf("]", i + 1);
      if (close === -1) {
        parts.push({ kind: "literal", value: "[", at: i, source: "unterminated" });
        i += 1;
        continue;
      }
      parts.push({ kind: "literal", value: format.slice(i + 1, close), at: i, source: "escaped" });
      i = close + 1;
      continue;
    }
    const token = TOKENS_LONGEST_FIRST.find((t) => format.startsWith(t, i));
    if (token !== undefined) {
      parts.push({ kind: "token", token, at: i });
      i += token.length;
      continue;
    }
    parts.push({ kind: "literal", value: format.charAt(i), at: i, source: "bare" });
    i += 1;
  }
  return parts;
}

/**
 * Fields harvested during a match. `hour12` and `meridiem` are held apart from
 * `hour24` until the whole format has matched, because a 12-hour reading is
 * not a clock hour until its meridiem is applied.
 *
 * @internal
 */
interface MatchedFields {
  year?: number | undefined;
  month?: number | undefined;
  day?: number | undefined;
  hour24?: number | undefined;
  hour12?: number | undefined;
  minute?: number | undefined;
  second?: number | undefined;
  fraction?: string | undefined;
  meridiem?: "am" | "pm" | undefined;
}

/**
 * Match `input` against a tokenised format, returning the harvested fields or
 * `undefined` on any mismatch.
 *
 * A variable-width token takes the longest digit run that stays in range AND
 * leaves the rest of the format matchable, so the walk retries shorter runs.
 * **The retry is memoized on (part index, input index)**, which is what keeps
 * a hostile format string from costing exponential time: every token's own
 * check is local (a width and a range), so whether the remainder matches
 * depends on those two indices and nothing else, and a state that failed once
 * can never succeed later.
 *
 * @internal
 */
function matchFields(input: string, parts: readonly DateFormatPart[]): MatchedFields | undefined {
  const fields: MatchedFields = {};
  const stride = input.length + 1;
  const failed = new Set<number>();

  const walk = (p: number, j: number): boolean => {
    if (p === parts.length) return j === input.length;
    const key = p * stride + j;
    if (failed.has(key)) return false;
    const part = parts[p];
    if (part === undefined) return false;

    if (part.kind === "literal") {
      if (input.startsWith(part.value, j) && walk(p + 1, j + part.value.length)) return true;
      failed.add(key);
      return false;
    }

    const spec = DATE_TOKEN_SPECS[part.token];
    if (spec.kind === "digits" || spec.kind === "fraction") {
      for (let width = spec.maxWidth; width >= spec.minWidth; width--) {
        const chunk = input.slice(j, j + width);
        if (chunk.length !== width || !isAsciiDigits(chunk)) continue;
        if (spec.kind === "fraction") {
          const previous = fields.fraction;
          fields.fraction = chunk;
          if (walk(p + 1, j + width)) return true;
          fields.fraction = previous;
          continue;
        }
        const value = parseInt(chunk, 10);
        if (value < spec.min || value > spec.max) continue;
        const previous = fields[spec.field];
        fields[spec.field] = value;
        if (walk(p + 1, j + width)) return true;
        fields[spec.field] = previous;
      }
      failed.add(key);
      return false;
    }

    if (spec.kind === "monthName") {
      for (let index = 0; index < spec.names.length; index++) {
        const name = spec.names[index];
        if (name === undefined) continue;
        const chunk = input.slice(j, name.length + j);
        if (chunk.length !== name.length || !isAsciiLetters(chunk)) continue;
        if (asciiLower(chunk) !== asciiLower(name)) continue;
        const previous = fields.month;
        fields.month = index + 1;
        if (walk(p + 1, j + name.length)) return true;
        fields.month = previous;
      }
      failed.add(key);
      return false;
    }

    const chunk = input.slice(j, j + 2);
    if (chunk.length === 2 && isAsciiLetters(chunk)) {
      const folded = asciiLower(chunk);
      if (folded === "am" || folded === "pm") {
        const previous = fields.meridiem;
        fields.meridiem = folded;
        if (walk(p + 1, j + 2)) return true;
        fields.meridiem = previous;
      }
    }
    failed.add(key);
    return false;
  };

  return walk(0, 0) ? fields : undefined;
}

/**
 * Resolve the harvested fields into a single clock reading, or `undefined`
 * when they cannot be resolved honestly. A 12-hour token and a meridiem are
 * only meaningful together, so an unpaired one yields no match rather than a
 * plausible wrong hour; `12 AM` is hour 0 and `12 PM` is hour 12. The meridiem
 * itself never survives into the parsed parts. A fraction with no seconds is
 * refused for the same reason the strict parser refuses it: a fraction is only
 * meaningful at full second precision.
 *
 * @internal
 */
function resolveHour(fields: MatchedFields): { readonly hour: number | undefined } | undefined {
  if (fields.hour12 === undefined && fields.meridiem === undefined) return { hour: fields.hour24 };
  if (fields.hour12 === undefined || fields.meridiem === undefined) return undefined;
  const resolved = (fields.hour12 % 12) + (fields.meridiem === "pm" ? 12 : 0);
  if (fields.hour24 !== undefined && fields.hour24 !== resolved) return undefined;
  return { hour: resolved };
}

/**
 * The calendar fields a format recovered from an input: spec-native (`month`
 * is 1 to 12) and already resolved, so `hour` is a 24-hour clock reading and
 * the meridiem is gone. A field the format does not populate is absent.
 *
 * @internal
 */
export interface MatchedDateFields {
  readonly year?: number | undefined;
  readonly month?: number | undefined;
  readonly day?: number | undefined;
  readonly hour?: number | undefined;
  readonly minute?: number | undefined;
  readonly second?: number | undefined;
  readonly fractionalSeconds?: string | undefined;
}

/**
 * Match `input` against `format` and return the calendar fields it recovered,
 * or `undefined` on any mismatch. Never throws, whatever the format string
 * says. This is the whole grammar in one call, and it is the level a time-only
 * format such as `H:mm` is observable at: a DTM value is a date, so a match
 * carrying no year cannot become {@link DtmParts}.
 *
 * The matcher is deliberately more tolerant than the definition-time
 * validator about TEXT: a character it does not recognise is matched verbatim,
 * so a format supplied through the parse options (which nothing validates)
 * keeps the behaviour it had. What it will NOT do is invent a value. An
 * unpaired 12-hour token or meridiem, a fraction with no seconds, an
 * out-of-range field, and two numeric tokens that meet with nothing between
 * them where either is variable width each report no match rather than a
 * plausible wrong reading. That last one is the adjacency rule, and it holds
 * here as well as at definition time because a digit run nothing can split
 * has no honest answer whichever route the format arrived by.
 *
 * @internal
 */
export function matchDateFormat(input: string, format: string): MatchedDateFields | undefined {
  const parts = tokeniseDateFormat(format);
  if (ambiguousAdjacency(parts) !== undefined) return undefined;

  const fields = matchFields(input, parts);
  if (fields === undefined) return undefined;

  const hour = resolveHour(fields);
  if (hour === undefined) return undefined;
  if (fields.fraction !== undefined && fields.second === undefined) return undefined;

  return {
    year: fields.year,
    month: fields.month,
    day: fields.day,
    hour: hour.hour,
    minute: fields.minute,
    second: fields.second,
    fractionalSeconds: fields.fraction,
  };
}

/**
 * Match `input` against `format` and return fidelity {@link DtmParts} (no
 * offset: these formats carry none), or `undefined` on mismatch. A format that
 * populates no year cannot produce a DTM value, so it reports no match here
 * even when {@link matchDateFormat} recovered its fields.
 *
 * @internal
 */
export function matchTokenParts(input: string, format: string): DtmParts | undefined {
  const matched = matchDateFormat(input, format);
  if (matched === undefined) return undefined;
  return buildFallbackParts(matched);
}

/**
 * Assemble validated {@link DtmParts} from a fallback match, computing the
 * precision from which fields are present and range-checking each. Returns
 * `undefined` when any field is out of range.
 *
 * @internal
 */
export function buildFallbackParts(f: {
  year?: number | undefined;
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
