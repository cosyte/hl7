import { describe, expect, it } from "vitest";

import { parseHl7Timestamp, BUILTIN_DATE_FALLBACKS } from "../src/parser/dates.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { Hl7Position } from "../src/parser/types.js";

const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 7 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/dates: parseHl7Timestamp", () => {
  it("parses HL7 date YYYYMMDD", () => {
    const d = parseHl7Timestamp("20250102", {});
    expect(d?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
  });

  it("parses HL7 date-time YYYYMMDDHHMMSS as UTC", () => {
    const d = parseHl7Timestamp("20250102153045", {});
    expect(d?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("parses HL7 fractional seconds as milliseconds", () => {
    const d = parseHl7Timestamp("20250102153045.5", {});
    expect(d?.getUTCMilliseconds()).toBe(500);
  });

  it("parses HL7 timestamp with trailing timezone offset", () => {
    const d = parseHl7Timestamp("20250102153045+0500", {});
    // Input is 15:30:45 in UTC+5 — UTC equivalent is 10:30:45
    expect(d?.toISOString()).toBe("2025-01-02T10:30:45.000Z");
  });

  it("parses YYYY truncation", () => {
    const d = parseHl7Timestamp("2025", {});
    expect(d?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("parses YYYYMM truncation", () => {
    const d = parseHl7Timestamp("202501", {});
    expect(d?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("emits TIMESTAMP_FALLBACK_FORMAT when a user format matches a non-HL7 input", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("01/02/2025", {
      userFormats: ["MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(d?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("tries user formats in order — second format matches when first fails", () => {
    const { emit, warnings } = collect();
    parseHl7Timestamp("01/02/2025", {
      userFormats: ["YYYY-MM-DD", "MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("falls back to built-ins when userFormats is empty", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("2025-01-02", { userFormats: [], emit, position: pos });
    expect(d?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/YYYY-MM-DD|ISO-8601/);
  });

  it("returns undefined and emits no warning when no pattern matches", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("notadate", { userFormats: [], emit, position: pos });
    expect(d).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("HL7 path never emits a fallback warning", () => {
    const { emit, warnings } = collect();
    parseHl7Timestamp("20250102", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(warnings).toHaveLength(0);
  });

  it("parses ISO-8601 via the built-in fallback", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("2025-01-02T15:30:45Z", {
      userFormats: [],
      emit,
      position: pos,
    });
    expect(d?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/ISO-8601/);
  });

  it("BUILTIN_DATE_FALLBACKS lists all 4 built-in format names in order", () => {
    expect(BUILTIN_DATE_FALLBACKS).toEqual([
      "ISO-8601",
      "YYYY-MM-DD",
      "MM/DD/YYYY",
      "MM/DD/YYYY HH:mm:ss",
    ]);
  });

  it("returns undefined for empty-string input without consulting any format", () => {
    const { emit, warnings } = collect();
    expect(
      parseHl7Timestamp("", { userFormats: ["MM/DD/YYYY"], emit, position: pos }),
    ).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });
});

describe("parser/dates: HL7 TS/DTM out-of-range rejection", () => {
  // The TS/DTM regex matches the digit shape, but the calendar-range guard
  // (month 1-12, day 1-31, hour 0-23, minute/second 0-59) rejects values a
  // sender could plausibly emit. These must fall through to undefined, NOT
  // silently roll over into the next month/day via Date arithmetic.
  it("rejects month 00 (HL7 months are 1-based)", () => {
    expect(parseHl7Timestamp("20250001", {})).toBeUndefined();
  });

  it("rejects month 13", () => {
    expect(parseHl7Timestamp("20251301", {})).toBeUndefined();
  });

  it("rejects day 00", () => {
    expect(parseHl7Timestamp("20250100", {})).toBeUndefined();
  });

  it("rejects day 32", () => {
    expect(parseHl7Timestamp("20250132", {})).toBeUndefined();
  });

  it("rejects hour 24", () => {
    expect(parseHl7Timestamp("2025010224", {})).toBeUndefined();
  });

  it("rejects minute 60", () => {
    expect(parseHl7Timestamp("202501021560", {})).toBeUndefined();
  });

  it("rejects second 60 (no leap-second support)", () => {
    expect(parseHl7Timestamp("20250102153060", {})).toBeUndefined();
  });
});

describe("parser/dates: HL7 TS/DTM negative timezone offset", () => {
  it("applies a negative offset by shifting toward later UTC", () => {
    // 10:30:45 in UTC-05:00 is 15:30:45 UTC.
    const d = parseHl7Timestamp("20250102103045-0500", {});
    expect(d?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("handles a fractional-minute negative offset (e.g. -0930)", () => {
    // 00:00:00 in UTC-09:30 is 09:30:00 UTC.
    const d = parseHl7Timestamp("20250102-0930", {});
    expect(d?.toISOString()).toBe("2025-01-02T09:30:00.000Z");
  });
});

describe("parser/dates: token-format matcher edge cases", () => {
  it("rejects input with trailing characters beyond the format", () => {
    const { emit, warnings } = collect();
    // Format consumes "01/02/2025"; the trailing " 99" makes it a non-match.
    const d = parseHl7Timestamp("01/02/2025 99", {
      userFormats: ["MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(d).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("rejects a token chunk that is not all digits", () => {
    const { emit } = collect();
    // "1X" is not a 2-digit month.
    expect(
      parseHl7Timestamp("1X/02/2025", { userFormats: ["MM/DD/YYYY"], emit, position: pos }),
    ).toBeUndefined();
  });

  it("rejects token-format values that are calendar-out-of-range", () => {
    // Matches the MM/DD/YYYY shape but month 13 is invalid — must not roll over.
    expect(parseHl7Timestamp("13/02/2025", { userFormats: ["MM/DD/YYYY"] })).toBeUndefined();
  });
});
