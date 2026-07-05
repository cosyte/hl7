import { describe, expect, it } from "vitest";

import { parseTs } from "../src/model/types/ts.js";
import { dtmToDate } from "../src/parser/dates.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(s: string): RawRepetition {
  return { components: [{ subcomponents: [s] }] };
}

describe("model/types/ts: parseTs (Phase N fidelity)", () => {
  it("parses full HL7 DTM to typed parts, no timezone flagged (not UTC)", () => {
    const ts = parseTs(rep("20250102153045"), enc);
    expect(ts.raw).toBe("20250102153045");
    expect(ts.valid).toBe(true);
    expect(ts.precision).toBe("second");
    expect(ts).toMatchObject({ year: 2025, month: 1, day: 2, hour: 15, minute: 30, second: 45 });
    expect(ts.hasTimezone).toBe(false);
    expect(ts.offsetMinutes).toBeUndefined();
  });

  it("preserves year-only precision without zero-fill (|1970| stays a year)", () => {
    const ts = parseTs(rep("1970"), enc);
    expect(ts.precision).toBe("year");
    expect(ts.year).toBe(1970);
    expect(ts.month).toBeUndefined();
    expect(ts.day).toBeUndefined();
  });

  it("preserves day-only precision (a birth date is not a full timestamp)", () => {
    const ts = parseTs(rep("19880705"), enc);
    expect(ts.precision).toBe("day");
    expect(ts).toMatchObject({ year: 1988, month: 7, day: 5 });
    expect(ts.hour).toBeUndefined();
  });

  it("preserves month precision", () => {
    const ts = parseTs(rep("202501"), enc);
    expect(ts.precision).toBe("month");
    expect(ts).toMatchObject({ year: 2025, month: 1 });
    expect(ts.day).toBeUndefined();
  });

  it("captures a signed timezone offset as minutes east of UTC", () => {
    const ts = parseTs(rep("20250102153045+0500"), enc);
    expect(ts.hasTimezone).toBe(true);
    expect(ts.offsetMinutes).toBe(300);
    const west = parseTs(rep("20250102153045-0430"), enc);
    expect(west.offsetMinutes).toBe(-270);
  });

  it("preserves fractional-second digits verbatim (never rounded)", () => {
    const ts = parseTs(rep("20250102153045.5"), enc);
    expect(ts.precision).toBe("fraction");
    expect(ts.fractionalSeconds).toBe("5");
    const ten = parseTs(rep("20250102153045.0500"), enc);
    expect(ten.fractionalSeconds).toBe("0500");
  });

  it("flags an offset-less value — never resolves it to UTC", () => {
    const ts = parseTs(rep("198807050000"), enc);
    expect(ts.hasTimezone).toBe(false);
    // dtmToDate refuses to guess the zone → undefined, never a silent UTC instant.
    expect(dtmToDate(ts)).toBeUndefined();
    // A no-tz midnight must not roll the day: parts keep day 5.
    expect(ts.day).toBe(5);
  });

  it("materializes an absolute instant from an offset value on request", () => {
    const ts = parseTs(rep("20250102153045-0500"), enc);
    expect(dtmToDate(ts)?.toISOString()).toBe("2025-01-02T20:30:45.000Z");
  });

  it("marks unparseable raw as invalid (no-throw), preserving raw", () => {
    const ts = parseTs(rep("not a date"), enc);
    expect(ts.raw).toBe("not a date");
    expect(ts.valid).toBe(false);
    expect(ts.precision).toBeUndefined();
  });

  it("marks a calendar-out-of-range value invalid (month 13)", () => {
    const ts = parseTs(rep("20251301"), enc);
    expect(ts.valid).toBe(false);
    expect(ts.year).toBeUndefined();
  });

  it("handles an empty repetition as invalid + empty raw", () => {
    const ts = parseTs({ components: [] }, enc);
    expect(ts.raw).toBe("");
    expect(ts.valid).toBe(false);
    expect(ts.hasTimezone).toBe(false);
  });

  it("unescapes the raw string before parsing", () => {
    const ts = parseTs(rep("202501\\F\\02"), enc);
    expect(ts.raw).toBe("202501|02"); // unescaped
    expect(ts.valid).toBe(false); // shape no longer valid
  });

  it("freezes the result (immutability)", () => {
    const ts = parseTs(rep("20250102"), enc);
    expect(Object.isFrozen(ts)).toBe(true);
  });
});
