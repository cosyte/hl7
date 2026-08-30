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

import { toDate, toISO, toObject } from "../src/parser/date-conversion.js";
import type { ToDateOptions } from "../src/parser/date-conversion.js";
import { formatDtm, parseDtm, parseDtmCascade } from "../src/parser/dates.js";
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
