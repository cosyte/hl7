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
});
