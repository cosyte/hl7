/**
 * The shared datetime CONVERSION surface for `@cosyte/hl7`: `toObject`,
 * `toISO` and `toDate`.
 *
 * Every `@cosyte` parser exposes these same three names with the same
 * semantics, so a developer who learns the conversion story once knows it in
 * all of them. Because the names are identical everywhere, a file consuming
 * two parsers must alias its imports
 * (`import { toISO as hl7ToISO } from "@cosyte/hl7"`) or namespace-import.
 *
 * The surface is a READ LAYER over {@link DtmParts}. It converts, it never
 * re-parses, and it changes nothing about how a value was parsed:
 *
 *  - `toObject(value)` projects the stated calendar components onto a frozen
 *    plain object whose keys are exactly what the value stated. Nothing is
 *    zero-filled, so the value's precision is recoverable from
 *    `Object.keys()`. `month` is spec-native 1 to 12, matching what
 *    `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject` accept.
 *  - `toISO(value)` renders ISO-8601 truncated to the stated precision, with
 *    the fractional digits verbatim. A stated zero offset renders `Z`, so this
 *    is deliberately NOT a byte round trip: `formatDtm` remains the round-trip
 *    route and is unchanged.
 *  - `toDate(value, options)` delegates to {@link dtmToDate}, which is where
 *    the timezone honesty and the sub-100 year handling already live.
 *
 * None of the three ever throws, for any input, and none of them reads the
 * host machine's timezone.
 *
 * Zero runtime deps: JS stdlib only, exactly like the module it sits beside.
 */

import { dtmToDate } from "./dates.js";
import type { DtmParts, DtmToDateOptions } from "./dates.js";

/**
 * The options bag {@link toDate} accepts: `{ assumeOffsetMinutes?: number }`
 * and nothing else. An ALIAS of the pre-existing {@link DtmToDateOptions},
 * which is unchanged and still exported, so the two names denote one type and
 * a caller may use either.
 *
 * It exists because every `@cosyte` parser spells this options type
 * `ToDateOptions`, and a consumer writing across two of them should be able to
 * spell it the same way in both. Adding the alias costs nothing at runtime:
 * it is erased at compile time and no value changes.
 *
 * @example
 * ```ts
 * import { parseDtm, toDate } from "@cosyte/hl7";
 * import type { ToDateOptions } from "@cosyte/hl7";
 *
 * const assumeUtc: ToDateOptions = { assumeOffsetMinutes: 0 };
 * toDate(parseDtm("20250102"), assumeUtc)?.toISOString();
 * // "2025-01-02T00:00:00.000Z"
 * ```
 */
export type ToDateOptions = DtmToDateOptions;

/**
 * The calendar components a datetime actually STATED, as a frozen plain
 * object. A component the value did not state is ABSENT: the key is not
 * present at all rather than present with `undefined`, so `Object.keys()` is
 * exactly the set of stated components and the value's precision is
 * recoverable from it. There is no `raw`, `valid` or `precision` key here:
 * that fidelity metadata stays on {@link DtmParts}.
 *
 * `month` is SPEC-NATIVE 1 to 12, never the JS `Date` 0 to 11. Delete
 * `offsetMinutes` and what is left is accepted as-is by
 * `Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject`, with no key
 * rename and no value adjustment. That compatibility is the reason for the
 * shape; neither library is a dependency here, and neither needs to be.
 *
 * @example
 * ```ts
 * import { parseDtm, toObject } from "@cosyte/hl7";
 *
 * toObject(parseDtm("19880705"));
 * // { year: 1988, month: 7, day: 5 }: three keys, no zero-fill
 *
 * Object.keys(toObject(parseDtm("1970")) ?? {});
 * // ["year"]: a year-precision value states one component
 * ```
 */
export interface DateParts {
  /** Four-digit year, exactly as stated. A year below 100 stays below 100. */
  readonly year?: number;
  /** Month, 1 to 12 (spec-native, NOT the JS `Date` 0 to 11). */
  readonly month?: number;
  /** Day of month, 1 to 31. */
  readonly day?: number;
  /** Hour, 0 to 23. */
  readonly hour?: number;
  /** Minute, 0 to 59. */
  readonly minute?: number;
  /** Second, 0 to 59. */
  readonly second?: number;
  /**
   * Milliseconds, derived from the stated fractional second by taking its
   * first three digits VERBATIM and right-padding with zeroes (`"5"` is 500,
   * `"0500"` is 50, `"123456"` is 123). Never computed by multiplying a
   * floating-point fraction by 1000, which loses the last digit on values such
   * as 0.123. Absent when the value stated no fraction.
   */
  readonly millisecond?: number;
  /**
   * Signed minutes east of UTC, present IF AND ONLY IF the value carried an
   * explicit offset. A stated zero offset (including HL7's `-0000`) is present
   * as `0`. Never synthesised from the host machine's zone.
   */
  readonly offsetMinutes?: number;
}

/**
 * Milliseconds from the stated fractional-second digits: first three digits
 * VERBATIM, right-padded with zeroes. `"5"` is 500 ms, `"0500"` is 50 ms.
 *
 * @internal
 */
function millisecondsFrom(fractionalSeconds: string): number {
  return parseInt(`${fractionalSeconds}000`.slice(0, 3), 10);
}

/**
 * Two-digit zero-padded rendering of a non-negative integer.
 *
 * @internal
 */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Project a parsed HL7 datetime onto the shared {@link DateParts} shape: a
 * frozen plain object carrying ONLY the calendar components the value stated.
 *
 * Returns `undefined` for a value the parser marked invalid, for a value
 * stating no components at all, and for `undefined` / `null`. Never throws.
 *
 * The value's own stated precision is untouched by the call: this is a
 * projection, not a conversion of the parsed value.
 *
 * @example
 * ```ts
 * import { parseDtm, toObject } from "@cosyte/hl7";
 *
 * toObject(parseDtm("19880705"));
 * // { year: 1988, month: 7, day: 5 }
 *
 * toObject(parseDtm("20250102153045.0500-0430"));
 * // { year: 2025, month: 1, day: 2, hour: 15, minute: 30, second: 45,
 * //   millisecond: 50, offsetMinutes: -270 }
 *
 * toObject(parseDtm("not-a-date")); // undefined
 * ```
 */
export function toObject(value: DtmParts | null | undefined): DateParts | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value.valid) return undefined;

  const parts: DateParts = {
    ...(value.year !== undefined ? { year: value.year } : {}),
    ...(value.month !== undefined ? { month: value.month } : {}),
    ...(value.day !== undefined ? { day: value.day } : {}),
    ...(value.hour !== undefined ? { hour: value.hour } : {}),
    ...(value.minute !== undefined ? { minute: value.minute } : {}),
    ...(value.second !== undefined ? { second: value.second } : {}),
    ...(value.fractionalSeconds !== undefined
      ? { millisecond: millisecondsFrom(value.fractionalSeconds) }
      : {}),
    // `+ 0` normalises the `-0` that HL7's `-0000` offset parses to, so a
    // stated zero offset is present as `0` here while `formatDtm` keeps the
    // sign for its byte-exact round trip.
    ...(value.hasTimezone && value.offsetMinutes !== undefined
      ? { offsetMinutes: value.offsetMinutes + 0 }
      : {}),
  };

  if (Object.keys(parts).length === 0) return undefined;
  return Object.freeze(parts);
}

/**
 * Render a parsed HL7 datetime as ISO-8601 TRUNCATED TO ITS STATED PRECISION,
 * never padded out: a year-precision value renders four characters, a
 * day-precision value renders ten. Fractional digits are rendered VERBATIM as
 * stated, neither padded to three nor rounded.
 *
 * An explicit offset is appended as `Z` when it is exactly zero (including
 * HL7's `-0000`), otherwise as `+HH:MM` / `-HH:MM`. When the value carried NO
 * offset, NOTHING is appended: the string is deliberately zone-less and no `Z`
 * is fabricated. Because a zero offset renders `Z`, this is NOT a byte round
 * trip of the wire value and is not meant to be; `formatDtm` is the
 * round-trip route and is unchanged.
 *
 * Returns `undefined` for a value the parser marked invalid, for a value with
 * no stated year (the HL7 DTM datatype mandates a leading four-digit year, so
 * this parser produces no time-only value), and for `undefined` / `null`.
 * Never throws.
 *
 * @example
 * ```ts
 * import { parseDtm, toISO } from "@cosyte/hl7";
 *
 * toISO(parseDtm("1970"));                        // "1970"
 * toISO(parseDtm("19700705"));                    // "1970-07-05": no fabricated Z
 * toISO(parseDtm("20250102153045.5-0500"));       // "2025-01-02T15:30:45.5-05:00"
 * toISO(parseDtm("20250102153045-0000"));         // "2025-01-02T15:30:45Z"
 * ```
 */
export function toISO(value: DtmParts | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value.valid || value.year === undefined) return undefined;

  let out = value.year.toString().padStart(4, "0");
  if (value.month !== undefined) {
    out += `-${pad2(value.month)}`;
    if (value.day !== undefined) {
      out += `-${pad2(value.day)}`;
      if (value.hour !== undefined) {
        out += `T${pad2(value.hour)}`;
        if (value.minute !== undefined) {
          out += `:${pad2(value.minute)}`;
          if (value.second !== undefined) {
            out += `:${pad2(value.second)}`;
            if (value.fractionalSeconds !== undefined) out += `.${value.fractionalSeconds}`;
          }
        }
      }
    }
  }

  if (value.hasTimezone && value.offsetMinutes !== undefined) {
    const total = value.offsetMinutes;
    if (total === 0) {
      out += "Z";
    } else {
      const abs = Math.abs(total);
      out += `${total < 0 ? "-" : "+"}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
    }
  }

  return out;
}

/**
 * Materialize an absolute-instant JS `Date` from a parsed HL7 datetime, ONLY
 * when the zone is determinate. Delegates to {@link dtmToDate}, so the rule is
 * the one this parser has always applied:
 *
 *  - the value carries an explicit offset: the exact instant from THAT offset,
 *    and `options.assumeOffsetMinutes` is ignored;
 *  - no offset and `assumeOffsetMinutes` supplied: that offset is applied,
 *    including an explicit `0` meaning "treat this naive value as UTC";
 *  - no offset and no option: `undefined`. The host timezone is NEVER read and
 *    UTC is NEVER assumed.
 *
 * Components below the stated precision fill to their lowest legal value
 * (month to 1, day to 1, time to 0) FOR INSTANT CONSTRUCTION ONLY; the value's
 * stated precision is unchanged, and a later `toObject` or `toISO` on the same
 * value returns exactly what it returned before. A four-digit year below 100
 * stays that year: `0050` is year 50, never 1950.
 *
 * Returns `undefined` for an invalid value, an unresolvable zone, and for
 * `undefined` / `null`. Never throws.
 *
 * @example
 * ```ts
 * import { parseDtm, toDate } from "@cosyte/hl7";
 *
 * toDate(parseDtm("20250102"));                                  // undefined: refuses to guess
 * toDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString();
 * // "2025-01-02T00:00:00.000Z": the caller chose UTC
 * toDate(parseDtm("20250102153045-0500"))?.toISOString();
 * // "2025-01-02T20:30:45.000Z": exact, offset-derived
 * ```
 */
export function toDate(
  value: DtmParts | null | undefined,
  options: ToDateOptions = {},
): Date | undefined {
  if (value === undefined || value === null) return undefined;
  return dtmToDate(value, options);
}
