/**
 * TS/DTM: HL7 v2 Time Stamp composite. Delegates parsing to the parser
 * helper `src/parser/dates.ts::parseDtmDeclared` (D-10 "zero duplicate date
 * logic").
 *
 * The composite is fidelity-preserving: rather than a `{ raw, date }` shape
 * that would zero-fill truncations and assume UTC for a missing offset, it is
 * a {@link DtmParts}: raw string + typed parts + stated precision + timezone
 * presence, with **no eager `Date`**. Callers that need an absolute instant
 * opt in explicitly via `dtmToDate(ts, opts)`: which refuses to guess a zone
 * for an offset-less value rather than silently defaulting to UTC.
 *
 * Zero runtime deps: delegates to `parseDtmDeclared` + `unescape`.
 */

import { parseDtmDeclared } from "../../parser/dates.js";
import type { DtmParts } from "../../parser/dates.js";
import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

/**
 * HL7 v2 Time Stamp (TS) / Date Time (DTM) composite: the raw HL7 string plus
 * its parsed parts, preserving the **stated precision** and **timezone
 * fidelity**. This is a {@link DtmParts}: `valid` is `false` (with no parts)
 * for unparseable input: NEVER throws (TYPES-04 no-throw guarantee).
 *
 * There is deliberately **no `date` field**: a day-only value coerced to a JS
 * `Date` at UTC midnight silently shifts the calendar day in negative-offset
 * zones. To obtain an absolute instant, call `dtmToDate(ts)` explicitly (and
 * supply `assumeOffsetMinutes` for an offset-less value).
 *
 * @example
 * ```ts
 * import type { TS } from "@cosyte/hl7";
 * import { dtmToDate } from "@cosyte/hl7";
 * const dob: TS = { raw: "19880705", valid: true, precision: "day",
 *   year: 1988, month: 7, day: 5, hasTimezone: false };
 * console.log(dob.precision);          // "day": not a full timestamp
 * console.log(dtmToDate(dob));         // undefined: refuses to guess the zone
 * ```
 */
export type TS = DtmParts;

/**
 * Parse an HL7 v2 TS/DTM repetition into fidelity {@link TS} parts. The
 * canonical HL7 shape is tried first; `dateFormats`, when the caller declared
 * any, is then tried in order and a match reports itself on `matchedFormat`.
 * Nothing else is tried: the library's built-in fallback list is reserved for
 * the non-composite `msg.meta.timestamp` path, because guessing `MM/DD/YYYY`
 * on a date of birth a vendor wrote day-first produces a plausible wrong date
 * rather than a visible failure.
 *
 * `dateFormats` reaches this parser from `Hl7Message.dateFormats`, which is
 * `ParseOptions.dateFormats` followed by the applied profile's, deduplicated
 * first-occurrence-wins. Omit it (or pass an empty list) and the parse is
 * exactly the strict HL7 one.
 *
 * The result is frozen so the immutability guarantee holds for callers that
 * destructure or retain it.
 *
 * @example
 * ```ts
 * import { parseTs, DEFAULT_ENCODING_CHARACTERS, dtmToDate } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["20250102153045-0500"] }] };
 * const ts = parseTs(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(ts.raw);                     // "20250102153045-0500"
 * console.log(ts.precision, ts.hasTimezone); // "second" true
 * console.log(dtmToDate(ts)?.toISOString()); // "2025-01-02T20:30:45.000Z"
 *
 * const vendor = { components: [{ subcomponents: ["07/05/1988"] }] };
 * const dob = parseTs(vendor, DEFAULT_ENCODING_CHARACTERS, ["MM/DD/YYYY"]);
 * console.log(dob.month, dob.matchedFormat); // 7 "MM/DD/YYYY"
 * ```
 */
export function parseTs(
  rep: RawRepetition,
  _enc: EncodingCharacters,
  dateFormats?: readonly string[],
): TS {
  const comp = rep.components[0];
  // The tokenizer already unescaped every subcomponent on parse (parser-02), so
  // the stored value is decoded: use it directly, never a second unescape (that
  // would double-decode a value whose bytes look like an escape). `_enc` is kept
  // for composite-parser signature uniformity.
  const raw = comp?.subcomponents[0] ?? "";
  // `parseDtmDeclared` already returns a frozen `DtmParts`.
  return parseDtmDeclared(raw, dateFormats);
}
