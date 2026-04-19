import { describe, expect, it } from "vitest";

import { parseTs } from "../src/model/types/ts.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(s: string): RawRepetition {
  return { components: [{ subcomponents: [s] }] };
}

describe("model/types/ts: parseTs", () => {
  it("parses full HL7 TS/DTM with all fields (no offset → UTC, D-21)", () => {
    const ts = parseTs(rep("20250102153045"), enc);
    expect(ts.raw).toBe("20250102153045");
    expect(ts.date?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("parses YYYYMMDD truncation to midnight UTC (D-21, D-22)", () => {
    const ts = parseTs(rep("20250102"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
  });

  it("parses YYYYMM truncation to first-of-month (D-22)", () => {
    const ts = parseTs(rep("202501"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("parses YYYY truncation to Jan 1 (D-22)", () => {
    const ts = parseTs(rep("2025"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("honors explicit timezone offset", () => {
    const ts = parseTs(rep("20250102153045+0500"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-02T10:30:45.000Z");
  });

  it("parses fractional seconds (3 digits) per D-23", () => {
    const ts = parseTs(rep("20250102153045.123"), enc);
    expect(ts.date?.getUTCMilliseconds()).toBe(123);
  });

  it("returns undefined date for unparseable raw (TYPES-04 no-throw)", () => {
    const ts = parseTs(rep("not a date"), enc);
    expect(ts.raw).toBe("not a date");
    expect(ts.date).toBeUndefined();
  });

  it("normalizes calendar-invalid Date to undefined (D-24)", () => {
    const ts = parseTs(rep("20251345"), enc); // month 13
    expect(ts.date).toBeUndefined();
  });

  it("handles empty repetition (no components)", () => {
    const ts = parseTs({ components: [] }, enc);
    expect(ts.raw).toBe("");
    expect(ts.date).toBeUndefined();
  });

  it("handles empty subcomponent string", () => {
    const ts = parseTs(rep(""), enc);
    expect(ts.raw).toBe("");
    expect(ts.date).toBeUndefined();
  });

  it("unescapes the raw string before parsing", () => {
    const ts = parseTs(rep("202501\\F\\02"), enc);
    expect(ts.raw).toBe("202501|02"); // unescaped
    expect(ts.date).toBeUndefined(); // shape no longer valid
  });

  it("result has exactly 2 keys (raw, date)", () => {
    const ts = parseTs(rep("20250102"), enc);
    expect(Object.keys(ts).sort()).toStrictEqual(["date", "raw"]);
  });
});
