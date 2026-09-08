/**
 * Conformance suite for the shared `@cosyte` datetime conversion surface
 * (`toObject` / `toISO` / `toDate`), expressed in HL7 v2 DTM wire syntax.
 *
 * The rows R1 to R11 below are the cross-package case table: every parser in
 * the suite carries this same file at this same path, with the same rows, so a
 * divergence between two packages shows up as a failing row rather than as a
 * surprise in a consumer's code. A row HL7 v2 cannot express is skipped here
 * with a written reason naming the property of the standard that makes it
 * inexpressible; it is never silently dropped.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { toDate, toISO, toObject } from "../src/parser/date-conversion.js";
import type { ToDateOptions } from "../src/parser/date-conversion.js";
import { dtmToDate, formatDtm, parseDtm, parseDtmCascade } from "../src/parser/dates.js";
import type { DtmParts, DtmToDateOptions } from "../src/parser/dates.js";

/** A value the parser marked invalid, without going through `parseDtm`. */
const HAND_BUILT_INVALID: DtmParts = { raw: "20250199", valid: false, hasTimezone: false };

/** A "valid" value that states no calendar component at all. */
const HAND_BUILT_EMPTY: DtmParts = { raw: "", valid: true, hasTimezone: false };

/**
 * A yearless value. HL7 v2 cannot produce one (see the R10 skip), but the
 * interface is structural, so a hand-built one pins the guard.
 */
const HAND_BUILT_YEARLESS: DtmParts = {
  raw: "",
  valid: true,
  precision: "second",
  hour: 9,
  minute: 30,
  second: 45,
  hasTimezone: false,
};

describe("conversion surface: shared case table", () => {
  it("R1 year-precision value: toObject has exactly {year}, toISO is the 4-digit year", () => {
    const parts = parseDtm("1970");

    expect(toObject(parts)).toEqual({ year: 1970 });
    expect(Object.keys(toObject(parts) ?? {})).toEqual(["year"]);
    expect(toISO(parts)).toBe("1970");
  });

  it("R2 day-precision, no offset: exactly {year,month,day}, no trailing Z, no Date", () => {
    const parts = parseDtm("19880705");

    expect(toObject(parts)).toEqual({ year: 1988, month: 7, day: 5 });
    expect(Object.keys(toObject(parts) ?? {})).toEqual(["year", "month", "day"]);
    expect(toISO(parts)).toBe("1988-07-05");
    expect(toISO(parts)?.endsWith("Z")).toBe(false);
    expect(toDate(parts)).toBeUndefined();
  });

  it("R3 R2 with assumeOffsetMinutes 0: the UTC midnight instant", () => {
    const parts = parseDtm("20250102");

    expect(toDate(parts, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2025-01-02T00:00:00.000Z",
    );
  });

  it("R4 R2 with assumeOffsetMinutes -300: 05:00Z that day", () => {
    const parts = parseDtm("20250102");

    expect(toDate(parts, { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "2025-01-02T05:00:00.000Z",
    );
  });

  it("R5 second precision with a non-zero offset: signed, rendered, and instant-exact", () => {
    const parts = parseDtm("20250102153045-0500");

    expect(toObject(parts)?.offsetMinutes).toBe(-300);
    expect(toISO(parts)).toBe("2025-01-02T15:30:45-05:00");
    expect(toDate(parts)?.toISOString()).toBe("2025-01-02T20:30:45.000Z");
    // The stated offset wins: assumeOffsetMinutes is ignored, never blended.
    expect(toDate(parts, { assumeOffsetMinutes: 600 })?.toISOString()).toBe(
      "2025-01-02T20:30:45.000Z",
    );

    const east = parseDtm("20250102153045+0530");
    expect(toObject(east)?.offsetMinutes).toBe(330);
    expect(toISO(east)).toBe("2025-01-02T15:30:45+05:30");
  });

  it("R6 explicit ZERO offset: offsetMinutes is 0 and present, toISO ends Z", () => {
    const dashZero = parseDtm("20250102153045-0000");
    const plusZero = parseDtm("20250102153045+0000");

    for (const parts of [dashZero, plusZero]) {
      const obj = toObject(parts);
      expect(Object.keys(obj ?? {})).toContain("offsetMinutes");
      // Object.is, not toBe alone: HL7's `-0000` parses to -0 on DtmParts and
      // must surface here as a plain 0.
      expect(Object.is(obj?.offsetMinutes, 0)).toBe(true);
      expect(toISO(parts)?.endsWith("Z")).toBe(true);
      expect(toISO(parts)).toBe("2025-01-02T15:30:45Z");
    }

    // toISO is NOT the round trip, and formatDtm still is: byte-exact `-0000`.
    expect(formatDtm(dashZero)).toBe("20250102153045-0000");
    expect(formatDtm(plusZero)).toBe("20250102153045+0000");
  });

  it("R7 stated fractional seconds: verbatim first-three-digit millisecond and rendering", () => {
    const parts = parseDtm("20250102153045.0500-0430");

    expect(toObject(parts)?.millisecond).toBe(50);
    expect(toISO(parts)).toBe("2025-01-02T15:30:45.0500-04:30");

    // The rule is verbatim digits, not a float multiplication.
    expect(toObject(parseDtm("20250102153045.5"))?.millisecond).toBe(500);
    expect(toObject(parseDtm("20250102153045.05"))?.millisecond).toBe(50);
    expect(toObject(parseDtm("20250102153045.1234"))?.millisecond).toBe(123);
    expect(toObject(parseDtm("20250102153045"))?.millisecond).toBeUndefined();
  });

  it("R8 a value the parser marked invalid: all three undefined, nothing throws", () => {
    const parts = parseDtm("not-a-date");

    expect(parts.valid).toBe(false);
    expect(() => toObject(parts)).not.toThrow();
    expect(() => toISO(parts)).not.toThrow();
    expect(() => toDate(parts)).not.toThrow();
    expect(toObject(parts)).toBeUndefined();
    expect(toISO(parts)).toBeUndefined();
    expect(toDate(parts)).toBeUndefined();
    expect(toDate(parts, { assumeOffsetMinutes: 0 })).toBeUndefined();

    expect(toObject(HAND_BUILT_INVALID)).toBeUndefined();
    expect(toISO(HAND_BUILT_INVALID)).toBeUndefined();
    expect(toDate(HAND_BUILT_INVALID)).toBeUndefined();
  });

  it("R9 undefined as the value: all three undefined, nothing throws", () => {
    expect(() => toObject(undefined)).not.toThrow();
    expect(() => toISO(undefined)).not.toThrow();
    expect(() => toDate(undefined)).not.toThrow();
    expect(toObject(undefined)).toBeUndefined();
    expect(toISO(undefined)).toBeUndefined();
    expect(toDate(undefined, { assumeOffsetMinutes: 0 })).toBeUndefined();

    // null is the same answer, for the same reason.
    expect(toObject(null)).toBeUndefined();
    expect(toISO(null)).toBeUndefined();
    expect(toDate(null)).toBeUndefined();
  });

  // R10 IS SKIPPED, WITH REASON, AND IS NOT OMITTED.
  //
  // R10 asks for a time-only value. HL7 v2's DTM datatype is
  // `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`: the four-digit year is
  // MANDATORY and is the leading component, and every further component is
  // positional after it. A DTM string therefore cannot state a time without
  // also stating a date, so no `parseDtm` input can produce a time-only value
  // and the row is inexpressible in this repo's wire syntax rather than
  // unimplemented. `toISO` returns undefined for a yearless value, which the
  // guard test below pins.
  it.skip("R10 a time-only value: inexpressible, HL7 DTM mandates a leading four-digit year", () => {
    // Kept as the row's assertions so the skip is legible, never as a pass.
    // "093045" is not a time in HL7 v2: the leading four digits are read as the
    // mandatory year (0930) and the next two as the month (45), which is out of
    // range, so the value parses as invalid rather than as 09:30:45.
    const timeOnly = parseDtm("093045");

    expect(toObject(timeOnly)).toEqual({ hour: 9, minute: 30, second: 45 });
    expect(toISO(timeOnly)).toBe("09:30:45");
    expect(toDate(timeOnly)).toBeUndefined();
  });

  it("R11 year 0050 at day precision with a determinate zone: the Date reports year 50", () => {
    const parts = parseDtm("00500101");

    expect(toObject(parts)).toEqual({ year: 50, month: 1, day: 1 });
    expect(toISO(parts)).toBe("0050-01-01");

    const instant = toDate(parts, { assumeOffsetMinutes: 0 });
    expect(instant?.getUTCFullYear()).toBe(50);
    expect(instant?.getUTCFullYear()).not.toBe(1950);
  });
});

describe("conversion surface: toObject", () => {
  it("carries no fidelity metadata: no raw, valid, precision, hasTimezone or matchedFormat", () => {
    const obj = toObject(parseDtm("19880705"));

    expect(obj).toEqual({ year: 1988, month: 7, day: 5 });
    for (const forbidden of ["raw", "valid", "precision", "hasTimezone", "matchedFormat"]) {
      expect(Object.keys(obj ?? {})).not.toContain(forbidden);
    }
    expect(Object.keys(obj ?? {})).not.toContain("offsetMinutes");
  });

  it("gives a fallback-cascade value the same key set as the equivalent strict parse", () => {
    // "07/25/1988" has ONE reading: day 25 is no month, so the cascade resolves
    // it and sets matchedFormat. A slash value whose first two components are
    // both in 1-12 is order-ambiguous and is refused instead, which is the next
    // test rather than this one.
    const cascaded = parseDtmCascade("07/25/1988", {});
    const strict = parseDtm("19880725");

    expect(cascaded.matchedFormat).toBe("MM/DD/YYYY");
    expect(Object.keys(toObject(cascaded) ?? {})).toEqual(Object.keys(toObject(strict) ?? {}));
    expect(Object.keys(toObject(cascaded) ?? {})).not.toContain("matchedFormat");
    expect(toObject(cascaded)).toEqual({ year: 1988, month: 7, day: 25 });

    // An offset-bearing cascade match (ISO-8601) keeps the offset key.
    const iso = parseDtmCascade("1988-07-05T09:30:45Z", {});
    expect(iso.matchedFormat).toBe("ISO-8601");
    expect(Object.is(toObject(iso)?.offsetMinutes, 0)).toBe(true);
    expect(Object.keys(toObject(iso) ?? {})).not.toContain("matchedFormat");
  });

  it("converts an order-ambiguous refusal to nothing, and never leaks its report", () => {
    // The cascade REFUSES an order-ambiguous slash date rather than guessing
    // the field order: valid is false and an `ambiguity` report says why. That
    // is a value the parser marked invalid (R8), so all three answer undefined,
    // and the report is bookkeeping that must never reach DateParts.
    const refused = parseDtmCascade("05/07/1988", {});

    expect(refused.valid).toBe(false);
    expect(refused.ambiguity?.code).toBe("AMBIGUOUS_DATE_ORDER");
    expect(toObject(refused)).toBeUndefined();
    expect(toISO(refused)).toBeUndefined();
    expect(toDate(refused, { assumeOffsetMinutes: 0 })).toBeUndefined();
    expect(() => toObject(refused)).not.toThrow();
  });

  it("states month spec-native 1 to 12, so the object feeds a plain-date constructor as-is", () => {
    // The compatibility target (Temporal.PlainDateTime.from, luxon
    // DateTime.fromObject) is NOT proved by a dependency here: the assertion is
    // the exact key set, the singular names, and the 1-to-12 month.
    const obj = toObject(parseDtm("20251201093000"));

    expect(obj).toEqual({ year: 2025, month: 12, day: 1, hour: 9, minute: 30, second: 0 });
    expect(obj?.month).toBe(12);

    const withOffset = toObject(parseDtm("20251201093000-0500"));
    const { offsetMinutes: _dropped, ...plain } = withOffset ?? {};
    expect(plain).toEqual({ year: 2025, month: 12, day: 1, hour: 9, minute: 30, second: 0 });
  });

  it("returns a frozen object", () => {
    const obj = toObject(parseDtm("19880705"));

    expect(Object.isFrozen(obj)).toBe(true);
  });

  it("recovers the stated precision from the key set alone, with nothing zero-filled", () => {
    expect(Object.keys(toObject(parseDtm("1970")) ?? {})).toEqual(["year"]);
    expect(Object.keys(toObject(parseDtm("197007")) ?? {})).toEqual(["year", "month"]);
    expect(Object.keys(toObject(parseDtm("19700705")) ?? {})).toEqual(["year", "month", "day"]);
    expect(Object.keys(toObject(parseDtm("1970070509")) ?? {})).toEqual([
      "year",
      "month",
      "day",
      "hour",
    ]);
    expect(Object.keys(toObject(parseDtm("197007050930")) ?? {})).toEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
    ]);
    expect(Object.keys(toObject(parseDtm("19700705093045")) ?? {})).toEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ]);
    expect(Object.keys(toObject(parseDtm("19700705093045.5")) ?? {})).toEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "millisecond",
    ]);
  });

  it("returns undefined for a value stating no components at all", () => {
    expect(toObject(HAND_BUILT_EMPTY)).toBeUndefined();
  });

  it("reports the components a yearless value states", () => {
    expect(toObject(HAND_BUILT_YEARLESS)).toEqual({ hour: 9, minute: 30, second: 45 });
  });
});

describe("conversion surface: toISO", () => {
  it("truncates to the stated precision, appending nothing", () => {
    expect(toISO(parseDtm("1970"))).toBe("1970");
    expect(toISO(parseDtm("197007"))).toBe("1970-07");
    expect(toISO(parseDtm("19700705"))).toBe("1970-07-05");
    expect(toISO(parseDtm("1970070509"))).toBe("1970-07-05T09");
    expect(toISO(parseDtm("197007050930"))).toBe("1970-07-05T09:30");
    expect(toISO(parseDtm("19700705093045"))).toBe("1970-07-05T09:30:45");
  });

  it("renders fractional digits verbatim rather than padding them to three", () => {
    expect(toISO(parseDtm("20250102153045.5-0500"))).toBe("2025-01-02T15:30:45.5-05:00");
    expect(toISO(parseDtm("20250102153045.05"))).toBe("2025-01-02T15:30:45.05");
    expect(toISO(parseDtm("20250102153045.1234"))).toBe("2025-01-02T15:30:45.1234");
  });

  it("fabricates no Z for an offset-less value, at any precision", () => {
    for (const raw of ["1970", "197007", "19700705", "1970070509", "19700705093045.5"]) {
      expect(toISO(parseDtm(raw))?.includes("Z")).toBe(false);
    }
  });

  it("returns undefined for an invalid, empty, yearless, undefined or null value", () => {
    expect(toISO(parseDtm(""))).toBeUndefined();
    expect(toISO(HAND_BUILT_EMPTY)).toBeUndefined();
    // HL7 v2 DTM mandates the leading four-digit year, so this shape never
    // arrives from parseDtm; the guard is here so it can never throw either.
    expect(toISO(HAND_BUILT_YEARLESS)).toBeUndefined();
    expect(toISO(undefined)).toBeUndefined();
    expect(toISO(null)).toBeUndefined();
  });
});

describe("conversion surface: toDate", () => {
  it("refuses to guess a zone, and never reads the host zone", () => {
    expect(toDate(parseDtm("20250102"))).toBeUndefined();
    expect(toDate(parseDtm("20250102153045"))).toBeUndefined();
    expect(toDate(parseDtm("1970"))).toBeUndefined();
  });

  it("applies an explicitly assumed offset, including a zero meaning UTC", () => {
    expect(toDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2025-01-02T00:00:00.000Z",
    );
    expect(toDate(parseDtm("20250102"), { assumeOffsetMinutes: 600 })?.toISOString()).toBe(
      "2025-01-01T14:00:00.000Z",
    );
  });

  it("fills components below the stated precision to their lowest legal value", () => {
    expect(toDate(parseDtm("1970"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    expect(toDate(parseDtm("197007"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1970-07-01T00:00:00.000Z",
    );
  });

  it("leaves the value's stated precision untouched: toObject and toISO are unchanged", () => {
    const parts = parseDtm("19880705");
    const before = { object: toObject(parts), iso: toISO(parts) };

    toDate(parts, { assumeOffsetMinutes: -300 });

    expect(toObject(parts)).toEqual(before.object);
    expect(toISO(parts)).toBe(before.iso);
    expect(parts.precision).toBe("day");
  });

  it("carries the verbatim milliseconds into the instant", () => {
    expect(toDate(parseDtm("20250102153045.0500-0000"))?.toISOString()).toBe(
      "2025-01-02T15:30:45.050Z",
    );
  });
});

describe("conversion surface: package root", () => {
  it("exports the three names, and the pre-existing date surface is untouched", async () => {
    const mod = await import("../src/index.js");

    expect(typeof mod.toObject).toBe("function");
    expect(typeof mod.toISO).toBe("function");
    expect(typeof mod.toDate).toBe("function");

    expect(typeof mod.parseDtm).toBe("function");
    expect(typeof mod.formatDtm).toBe("function");
    expect(typeof mod.dtmToDate).toBe("function");
    expect(mod.BUILTIN_DATE_FALLBACKS).toEqual([
      "ISO-8601",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
      "MM/DD/YYYY HH:mm:ss",
    ]);

    // Behaviour of the pre-existing surface, unchanged.
    expect(mod.formatDtm(mod.parseDtm("20250102153045-0000"))).toBe("20250102153045-0000");
    expect(mod.dtmToDate(mod.parseDtm("20250102"))).toBeUndefined();
    expect(mod.dtmToDate(mod.parseDtm("20250102153045-0500"))?.toISOString()).toBe(
      "2025-01-02T20:30:45.000Z",
    );
  });

  it("aliases cleanly, which is how a consumer combines two @cosyte parsers", async () => {
    const { toISO: hl7ToISO } = await import("../src/index.js");

    expect(hl7ToISO(parseDtm("19880705"))).toBe("1988-07-05");
  });

  it("spells the options type ToDateOptions too, without displacing DtmToDateOptions", async () => {
    const mod = await import("../src/index.js");

    // Every parser in the suite spells this options type `ToDateOptions`, so a
    // consumer writing across two of them spells it the same way in both. The
    // alias and this repo's pre-existing name denote ONE type: each is
    // assignable to the other, so neither widens nor narrows the other, and the
    // pre-existing name is unchanged and still drives the pre-existing
    // function. Types are erased, so the assignments below are the assertion.
    const viaSharedName: ToDateOptions = { assumeOffsetMinutes: -300 };
    const viaRepoName: DtmToDateOptions = viaSharedName;
    const backAgain: ToDateOptions = viaRepoName;

    expect(mod.toDate(parseDtm("20250102"), backAgain)?.toISOString()).toBe(
      "2025-01-02T05:00:00.000Z",
    );
    expect(mod.dtmToDate(parseDtm("20250102"), viaRepoName)?.toISOString()).toBe(
      "2025-01-02T05:00:00.000Z",
    );
  });
});

/**
 * COMPONENT BOUNDS: the out-of-range companion to the shared case table above.
 *
 * Every row R1 to R11 states a well-formed value, so none of them exercises
 * this class, and the class is where a conversion surface answers WRONGLY
 * rather than not at all: `20240230` states a day February does not have, and
 * a converter that projects it produces `"2024-02-30"`, which every ISO-8601
 * reader (`new Date(...)` included) silently moves to 1 March. A date of birth
 * a day out, with nothing thrown and nothing warned, is the failure this
 * surface exists to refuse, so all three functions refuse the WHOLE value.
 *
 * The refusal lives in the conversion layer, not in the parser: `parseDtm`
 * keeps the bounds it has always applied (1 to 31, month-blind), which the
 * first test below pins so the split is deliberate rather than accidental.
 */
describe("conversion surface: component bounds", () => {
  /**
   * Days no calendar has. 1900, 2023 and 2100 are common years and 2000 and
   * 2024 are leap years, so the set also separates the full 4/100/400 rule
   * from a naive divisible-by-four one.
   */
  const IMPOSSIBLE = [
    "20240230",
    "20230229",
    "19000229",
    "21000229",
    "20240431",
    "20240631",
    "20240931",
    "20241131",
  ];

  /** Real days beside them, so the refusal can never be "refuse February". */
  const REAL: readonly (readonly [string, string])[] = [
    ["20240229", "2024-02-29"],
    ["20000229", "2000-02-29"],
    ["20240430", "2024-04-30"],
    ["20240531", "2024-05-31"],
    ["20231231", "2023-12-31"],
  ];

  /** A DtmParts assembled by hand, which is a shape no parse produced. */
  const handBuilt = (stated: Partial<DtmParts>): DtmParts => ({
    raw: "hand-built",
    valid: true,
    precision: "day",
    hasTimezone: false,
    ...stated,
  });

  it("leaves parseDtm exactly as it was: the bound is added by the conversion layer", () => {
    // The parser is unchanged and still accepts a month-blind 1-to-31 day, so
    // `formatDtm` still round-trips the wire bytes and no pinned behaviour
    // moved. What changed is that CONVERTING such a value answers nothing.
    const parts = parseDtm("20240230");

    expect(parts.valid).toBe(true);
    expect(parts.day).toBe(30);
    expect(formatDtm(parts)).toBe("20240230");
  });

  it("refuses a day the month does not have, from all three functions", () => {
    for (const raw of IMPOSSIBLE) {
      const parts = parseDtm(raw);

      expect(() => toObject(parts)).not.toThrow();
      expect(() => toISO(parts)).not.toThrow();
      expect(() => toDate(parts, { assumeOffsetMinutes: 0 })).not.toThrow();

      expect(toObject(parts)).toBeUndefined();
      expect(toISO(parts)).toBeUndefined();
      expect(toDate(parts)).toBeUndefined();
      expect(toDate(parts, { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
  });

  it("still converts every real calendar day, including 29 February in a leap year", () => {
    for (const [raw, iso] of REAL) {
      const parts = parseDtm(raw);

      expect(toObject(parts)).toEqual({
        year: Number(raw.slice(0, 4)),
        month: Number(raw.slice(4, 6)),
        day: Number(raw.slice(6, 8)),
      });
      expect(toISO(parts)).toBe(iso);
      expect(toDate(parts, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(`${iso}T00:00:00.000Z`);
    }
  });

  it("refuses the WHOLE value, never an in-range prefix of it", () => {
    // Second precision with a stated offset: the zone is determinate and every
    // component except the day is in range, and the answer is still nothing.
    const parts = parseDtm("20240230153045-0500");

    expect(parts.valid).toBe(true);
    expect(toObject(parts)).toBeUndefined();
    expect(toISO(parts)).toBeUndefined();
    expect(toDate(parts)).toBeUndefined();
  });

  it("bounds every component, not the day alone", () => {
    // parseDtm already refuses each of these on the wire, so a hand-built
    // value is the only route to them. The bound holds on that route too.
    const outOfRange: readonly Partial<DtmParts>[] = [
      { year: -1, month: 1, day: 1 },
      { year: 10000, month: 1, day: 1 },
      { year: 2024, month: 0, day: 1 },
      { year: 2024, month: 13, day: 1 },
      { year: 2024, month: 1, day: 0 },
      { year: 2024, month: 1, day: 32 },
      { year: 2024, month: 1, day: 1, hour: 24 },
      { year: 2024, month: 1, day: 1, hour: 12, minute: 60 },
      { year: 2024, month: 1, day: 1, hour: 12, minute: 30, second: 60 },
      // Not a whole number of days, which no comparison against a bound
      // catches on its own: NaN fails every comparison and would slip past.
      { year: 2024, month: 1, day: 1.5 },
      { year: 2024, month: 1, day: Number.NaN },
    ];

    for (const stated of outOfRange) {
      const parts = handBuilt(stated);

      expect(toObject(parts)).toBeUndefined();
      expect(toISO(parts)).toBeUndefined();
      expect(toDate(parts, { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
  });

  it("closes the hand-built path: parts the parser never produced are bounded too", () => {
    const impossible = handBuilt({ raw: "20240230", year: 2024, month: 2, day: 30 });
    const real = handBuilt({ raw: "20240229", year: 2024, month: 2, day: 29 });

    expect(toObject(impossible)).toBeUndefined();
    expect(toISO(impossible)).toBeUndefined();
    expect(toDate(impossible, { assumeOffsetMinutes: 0 })).toBeUndefined();

    expect(toObject(real)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(toISO(real)).toBe("2024-02-29");
    expect(toDate(real, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("bounds an unstated year's February at 29, the most permissive real bound", () => {
    // With no year there is no leap rule to apply, so 29 February is allowed
    // and 30 February still is not. HL7 DTM cannot state this shape (the
    // four-digit year is mandatory), so it arrives only by hand.
    expect(toObject(handBuilt({ precision: "day", month: 2, day: 29 }))).toEqual({
      month: 2,
      day: 29,
    });
    expect(toObject(handBuilt({ precision: "day", month: 2, day: 30 }))).toBeUndefined();
  });

  it("never converts a date of birth off a real message into a confident wrong instant", () => {
    // End to end through the public message parser: PID-7 is a date of birth,
    // and this is where the day-shifted answer would reach a patient record.
    const impossibleDob = parseHL7(
      "MSH|^~\\&|SENDER|FAC|RECV|FAC|20240101120000||ADT^A01|MSG1|P|2.5\r" +
        "PID|1||LAB124^^^FAC^MR||Roe^John||20240230|M\r",
    ).patient?.dateOfBirth;

    expect(impossibleDob?.raw).toBe("20240230");
    expect(toObject(impossibleDob)).toBeUndefined();
    expect(toISO(impossibleDob)).toBeUndefined();
    expect(toDate(impossibleDob, { assumeOffsetMinutes: 0 })).toBeUndefined();

    const realDob = parseHL7(
      "MSH|^~\\&|SENDER|FAC|RECV|FAC|20240101120000||ADT^A01|MSG2|P|2.5\r" +
        "PID|1||LAB124^^^FAC^MR||Roe^John||19880705|M\r",
    ).patient?.dateOfBirth;

    expect(toObject(realDob)).toEqual({ year: 1988, month: 7, day: 5 });
    expect(toISO(realDob)).toBe("1988-07-05");
    expect(toDate(realDob, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1988-07-05T00:00:00.000Z",
    );
  });
});

/**
 * THE OPTIONS BAG: the second companion to the shared case table above.
 *
 * Rows R3, R4 and R5 pass `assumeOffsetMinutes` only as a well-formed number,
 * so no row of the shared table states what happens when the SECOND argument
 * is hostile. That matters because this is a published package: TypeScript
 * types the options bag, and a JavaScript consumer can still pass anything at
 * all. Two ways the value can go wrong, both of them silent:
 *
 *  - the bag itself is `null`. A default parameter fires for `undefined` only,
 *    so reading a property off it throws a `TypeError` where the surface
 *    promises never to throw;
 *  - `assumeOffsetMinutes` is a non-number. JavaScript's `*` coerces `null`,
 *    `[]` and `"0"` to 0, so a converter that just multiplies hands back a UTC
 *    instant the caller never asked for, and `true` becomes a one-minute zone
 *    that exists nowhere on Earth.
 *
 * The second is the worse of the two: an offset-less value converting to a
 * confident UTC instant is the exact fabrication the timezone rule exists to
 * refuse, and unlike a throw it leaves nothing behind to notice.
 */
describe("conversion surface: the options bag", () => {
  /** A well-formed, offset-less, day-precision value: 29 February 2024 is real. */
  const OFFSET_LESS = parseDtm("20240229");

  /** The same instant, stated with its own offset, for the precedence rule. */
  const OFFSET_BEARING = parseDtm("20240229120000-0500");

  /**
   * Option shapes a JavaScript caller can pass that the TypeScript type does
   * not admit. Typed `unknown` and cast at the call site, because the point is
   * the runtime behaviour of published JavaScript, not what the compiler
   * allows.
   */
  const UNUSABLE_OPTIONS: readonly (readonly [string, unknown])[] = [
    ["null (the bag itself)", null],
    ['"0" (the bag itself)', "0"],
    ["0 (the bag itself)", 0],
    ["{ assumeOffsetMinutes: null }", { assumeOffsetMinutes: null }],
    ['{ assumeOffsetMinutes: "0" }', { assumeOffsetMinutes: "0" }],
    ['{ assumeOffsetMinutes: "-300" }', { assumeOffsetMinutes: "-300" }],
    ["{ assumeOffsetMinutes: true }", { assumeOffsetMinutes: true }],
    ["{ assumeOffsetMinutes: [] }", { assumeOffsetMinutes: [] }],
    ["{ assumeOffsetMinutes: {} }", { assumeOffsetMinutes: {} }],
    ["{ assumeOffsetMinutes: NaN }", { assumeOffsetMinutes: Number.NaN }],
    ["{ assumeOffsetMinutes: Infinity }", { assumeOffsetMinutes: Number.POSITIVE_INFINITY }],
    ["{ assumeOffsetMinutes: -Infinity }", { assumeOffsetMinutes: Number.NEGATIVE_INFINITY }],
    ["{ assumeOffsetMinutes: 1e15 } (past the representable range)", { assumeOffsetMinutes: 1e15 }],
    ["{ assumeOffsetMinutes: MAX_SAFE_INTEGER }", { assumeOffsetMinutes: Number.MAX_SAFE_INTEGER }],
  ];

  /** Bags that supply no offset at all, which is the R2 answer, not an error. */
  const SILENT_OPTIONS: readonly (readonly [string, unknown])[] = [
    ["undefined", undefined],
    ["{}", {}],
    ["{ assumeOffsetMinutes: undefined }", { assumeOffsetMinutes: undefined }],
    ["{ nope: 1 } (an unknown key only)", { nope: 1 }],
  ];

  const call = (parts: DtmParts, options: unknown): Date | undefined =>
    toDate(parts, options as ToDateOptions);

  it("never throws, whatever the second argument is", () => {
    for (const [label, options] of [...UNUSABLE_OPTIONS, ...SILENT_OPTIONS]) {
      expect(() => call(OFFSET_LESS, options), label).not.toThrow();
      expect(() => call(OFFSET_BEARING, options), label).not.toThrow();
    }
  });

  it("assumes no zone for an option that names none, and never falls back to UTC", () => {
    for (const [label, options] of UNUSABLE_OPTIONS) {
      expect(call(OFFSET_LESS, options), label).toBeUndefined();
    }
  });

  it("answers undefined, never an Invalid Date, for an unusable offset", () => {
    // An Invalid Date satisfies the declared `Date | undefined` return and
    // defeats its point: a caller cannot tell one from a real instant without
    // testing `getTime()` for `NaN`, and `toISOString()` on it throws.
    for (const [label, options] of UNUSABLE_OPTIONS) {
      const out = call(OFFSET_LESS, options);
      expect(out === undefined || !Number.isNaN(out.getTime()), label).toBe(true);
    }
  });

  it("treats a bag that supplies no offset exactly as R2 does: undefined", () => {
    for (const [label, options] of SILENT_OPTIONS) {
      expect(call(OFFSET_LESS, options), label).toBeUndefined();
    }
  });

  it("lets a stated offset win over an unusable assumption, rather than refusing", () => {
    // The Contract says a stated offset wins and the assumption is IGNORED, so
    // the guard on the assumption must never reach a value that carries one.
    const expected = "2024-02-29T17:00:00.000Z";

    expect(toDate(OFFSET_BEARING)?.toISOString()).toBe(expected);
    for (const [label, options] of [...UNUSABLE_OPTIONS, ...SILENT_OPTIONS]) {
      expect(call(OFFSET_BEARING, options)?.toISOString(), label).toBe(expected);
    }
  });

  it("still converts every offset that does name a zone, including the odd ones", () => {
    // Non-vacuity: the guard refuses what carries no zone and nothing else. The
    // last two rows are the boundary of what a JS `Date` represents, computed
    // rather than guessed, which is where an off-by-one in a range check lives.
    const wall = Date.UTC(2024, 1, 29);
    const limit = 8.64e15;

    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: -0 })?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: -300 })?.toISOString()).toBe(
      "2024-02-29T05:00:00.000Z",
    );
    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: 720 })?.toISOString()).toBe(
      "2024-02-28T12:00:00.000Z",
    );
    // Fractional minutes are a real, if unusual, offset: half a minute west.
    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: 30.5 })?.toISOString()).toBe(
      "2024-02-28T23:29:30.000Z",
    );
    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: (wall - limit) / 60_000 })?.getTime()).toBe(
      limit,
    );
    expect(toDate(OFFSET_LESS, { assumeOffsetMinutes: (wall + limit) / 60_000 })?.getTime()).toBe(
      -limit,
    );
    // ...and one minute past each end is not an instant, so it is undefined.
    expect(
      toDate(OFFSET_LESS, { assumeOffsetMinutes: (wall - limit) / 60_000 - 1 }),
    ).toBeUndefined();
    expect(
      toDate(OFFSET_LESS, { assumeOffsetMinutes: (wall + limit) / 60_000 + 1 }),
    ).toBeUndefined();
  });

  it("leaves dtmToDate, the pinned export, exactly as it was", () => {
    // The guard is added by the conversion layer. `dtmToDate` is a published
    // name whose behaviour may not move, so it still coerces as it always did,
    // and this test says so out loud rather than letting the split look like an
    // oversight.
    expect(dtmToDate(OFFSET_LESS, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect(dtmToDate(OFFSET_LESS)).toBeUndefined();
    expect(
      dtmToDate(OFFSET_LESS, { assumeOffsetMinutes: "0" } as unknown as DtmToDateOptions),
    ).toBeInstanceOf(Date);
  });
});

/**
 * THE OFFSET THE VALUE STATES: the other half of the class the options bag
 * covers, and the third companion to the shared case table.
 *
 * Rows R5 and R6 state an offset only as a well-formed number of minutes, and
 * the block above guards only the offset the CALLER supplies. Neither reaches
 * the field the VALUE carries, and two routes populate it without a cast in
 * sight: `DtmParts` is an exported structural interface, so a hand-built value
 * is a supported input, and `msg.meta.timestamp` goes through the lenient
 * fallback cascade, whose ISO-8601 read range-checks the calendar components
 * and not the offset. `2024-02-29T12:00:00+99:99` off the wire is 6039 minutes
 * east of UTC, which is no zone at all.
 *
 * The same field feeds all three functions, and each does something different
 * and silent with an offset that is not one:
 *
 *  - `toObject` reports it in a slot documented as a number of minutes east of
 *    UTC, so `"0"` arrives as a string and `NaN` as a number that is not one;
 *  - `toISO` renders it into the two-digit `+HH:MM` slot, producing `+NaN:NaN`
 *    or a three-digit hour, which every ISO-8601 reader answers an Invalid
 *    Date for, so the value the sender wrote cannot be recovered from it;
 *  - `toDate` multiplies it, and `null`, `"0"` and `[]` all multiply to zero,
 *    which is silent UTC: the one instant the timezone rule exists to refuse.
 *
 * The third is the worst, and it is the same harm the options bag has, one
 * field over: a stated offset wins outright over any assumption, so it has to
 * be a zone before it is allowed to win.
 */
describe("conversion surface: the offset the value states", () => {
  /**
   * A well-formed second-precision value for 29 February 2024 that CLAIMS an
   * explicit offset, with that offset set to `off`. Cast at the boundary
   * because the point is the runtime behaviour of published JavaScript, not
   * what the compiler admits.
   */
  const stating = (off: unknown): DtmParts =>
    ({
      raw: "20240229120000+0000",
      valid: true,
      precision: "second",
      year: 2024,
      month: 2,
      day: 29,
      hour: 12,
      minute: 0,
      second: 0,
      hasTimezone: true,
      offsetMinutes: off,
    }) as unknown as DtmParts;

  /**
   * Offsets that name no zone. The numeric ones are as important as the type
   * confusions: 30.5 is not a whole minute, 1440 is one minute past the widest
   * offset `+HH:MM` can render, and 6039 is what the wire produced above.
   */
  const NOT_A_ZONE: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ['"0" (string)', "0"],
    ['"-300" (string)', "-300"],
    ["true", true],
    ["[] (array)", []],
    ["{} (object)", {}],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["30.5 (not a whole minute)", 30.5],
    ["1440 (one minute past +23:59)", 1440],
    ["-1440 (one minute past -23:59)", -1440],
    ["6039 (the +99:99 a message can state)", 6039],
    ["1e6", 1e6],
    ["MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
  ];

  /**
   * Offsets that do name one, with the rendering and the instant each owes.
   * The last two are the ends of the range, computed from the rendering rather
   * than guessed: `+23:59` is the widest a two-digit hour states, and it is
   * also the widest `new Date` reads back.
   */
  const A_ZONE: readonly (readonly [number, string, string])[] = [
    [0, "2024-02-29T12:00:00Z", "2024-02-29T12:00:00.000Z"],
    [-0, "2024-02-29T12:00:00Z", "2024-02-29T12:00:00.000Z"],
    [-300, "2024-02-29T12:00:00-05:00", "2024-02-29T17:00:00.000Z"],
    [330, "2024-02-29T12:00:00+05:30", "2024-02-29T06:30:00.000Z"],
    [720, "2024-02-29T12:00:00+12:00", "2024-02-29T00:00:00.000Z"],
    [-570, "2024-02-29T12:00:00-09:30", "2024-02-29T21:30:00.000Z"],
    [840, "2024-02-29T12:00:00+14:00", "2024-02-28T22:00:00.000Z"],
    [1439, "2024-02-29T12:00:00+23:59", "2024-02-28T12:01:00.000Z"],
    [-1439, "2024-02-29T12:00:00-23:59", "2024-03-01T11:59:00.000Z"],
  ];

  it("never throws, whatever the value states as its offset", () => {
    for (const [label, off] of NOT_A_ZONE) {
      expect(() => toObject(stating(off)), label).not.toThrow();
      expect(() => toISO(stating(off)), label).not.toThrow();
      expect(() => toDate(stating(off)), label).not.toThrow();
      expect(() => toDate(stating(off), { assumeOffsetMinutes: 0 }), label).not.toThrow();
    }
  });

  it("reports no offset it cannot report as a number of minutes east of UTC", () => {
    for (const [label, off] of NOT_A_ZONE) {
      expect(toObject(stating(off)), label).toBeUndefined();
    }
  });

  it("renders no offset an ISO-8601 reader would answer an Invalid Date for", () => {
    for (const [label, off] of NOT_A_ZONE) {
      const iso = toISO(stating(off));

      expect(iso, label).toBeUndefined();
      expect(iso === undefined || !Number.isNaN(new Date(iso).getTime()), label).toBe(true);
    }
  });

  it("fabricates no zone from a stated offset that names none", () => {
    // The harm the options bag has, on the value's own field: `null`, `"0"`
    // and `[]` all multiply to zero, so an unguarded delegation answers the
    // UTC instant nobody asked for, and an assumption beside it cannot rescue
    // the value because a stated offset wins outright.
    for (const [label, off] of NOT_A_ZONE) {
      expect(toDate(stating(off)), label).toBeUndefined();
      expect(toDate(stating(off), { assumeOffsetMinutes: 0 }), label).toBeUndefined();
    }
  });

  it("still converts every offset that does name a zone, to the ends of the rendering", () => {
    // Non-vacuity: the bound refuses what names no zone and nothing else, and
    // a real stated offset still wins outright, exactly as R5 requires.
    for (const [off, iso, instant] of A_ZONE) {
      const label = `offsetMinutes ${off}`;

      // `0 + off` normalises the negative zero exactly as R6 requires, and
      // `toBe` compares with `Object.is`, which would otherwise separate them.
      expect(toObject(stating(off))?.offsetMinutes, label).toBe(0 + off);
      expect(toISO(stating(off)), label).toBe(iso);
      expect(toDate(stating(off))?.toISOString(), label).toBe(instant);
      expect(toDate(stating(off), { assumeOffsetMinutes: 600 })?.toISOString(), label).toBe(
        instant,
      );
      expect(new Date(iso).toISOString(), label).toBe(instant);
    }
  });

  it("ignores an offset field on a value that claims no zone, rather than refusing it", () => {
    // `offsetMinutes` is present if and only if `hasTimezone`, so a value
    // claiming no zone states no offset whatever that field holds: nothing
    // reads it, nothing renders it, and the day still converts. The bound is
    // on the offset a value CLAIMS, which is the only one that reaches an
    // answer.
    const unclaimed = {
      raw: "20240229",
      valid: true,
      precision: "day",
      year: 2024,
      month: 2,
      day: 29,
      hasTimezone: false,
      offsetMinutes: "nonsense",
    } as unknown as DtmParts;

    expect(toObject(unclaimed)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(toISO(unclaimed)).toBe("2024-02-29");
    expect(toDate(unclaimed)).toBeUndefined();
    expect(toDate(unclaimed, { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("refuses an impossible offset a real message states, with nothing built by hand", () => {
    // End to end through the public message parser. MSH-7 is the message's own
    // timestamp, and this ISO-8601 form reaches the fallback cascade, which
    // range-checks the calendar components and not the offset: no cast, no
    // hand-built value, and 6039 minutes east of UTC.
    const impossible = parseHL7(
      "MSH|^~\\&|SENDER|FAC|RECV|FAC|2024-02-29T12:00:00+99:99||ADT^A01|MSG1|P|2.5\r",
    ).meta.timestamp;

    expect(impossible?.matchedFormat).toBe("ISO-8601");
    expect(impossible?.offsetMinutes).toBe(6039);
    expect(toObject(impossible)).toBeUndefined();
    expect(toISO(impossible)).toBeUndefined();
    expect(toDate(impossible)).toBeUndefined();

    const real = parseHL7(
      "MSH|^~\\&|SENDER|FAC|RECV|FAC|2024-02-29T12:00:00-05:00||ADT^A01|MSG2|P|2.5\r",
    ).meta.timestamp;

    expect(toObject(real)?.offsetMinutes).toBe(-300);
    expect(toISO(real)).toBe("2024-02-29T12:00:00-05:00");
    expect(toDate(real)?.toISOString()).toBe("2024-02-29T17:00:00.000Z");
  });

  it("leaves parseDtm and dtmToDate, the pinned exports, exactly as they were", () => {
    // The parser still accepts every offset it always accepted, up to a stated
    // `+2400`, so `formatDtm` still round-trips those bytes and `dtmToDate`
    // still answers for them: no published behaviour moved. The refusal is the
    // conversion layer's, at the point where an offset that cannot be rendered
    // would otherwise be rendered anyway.
    const pastTheEnd = parseDtm("20250102153045+2400");

    expect(pastTheEnd.valid).toBe(true);
    expect(pastTheEnd.offsetMinutes).toBe(1440);
    expect(formatDtm(pastTheEnd)).toBe("20250102153045+2400");
    expect(dtmToDate(pastTheEnd)?.toISOString()).toBe("2025-01-01T15:30:45.000Z");

    expect(toObject(pastTheEnd)).toBeUndefined();
    expect(toISO(pastTheEnd)).toBeUndefined();
    expect(toDate(pastTheEnd)).toBeUndefined();

    // ...and one minute inside the end still converts, from the same route.
    const atTheEnd = parseDtm("20250102153045+2359");

    expect(toObject(atTheEnd)?.offsetMinutes).toBe(1439);
    expect(toISO(atTheEnd)).toBe("2025-01-02T15:30:45+23:59");
    expect(toDate(atTheEnd)?.toISOString()).toBe("2025-01-01T15:31:45.000Z");
  });
});
