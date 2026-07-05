import { describe, expect, it } from "vitest";

import {
  BUILTIN_DATE_FALLBACKS,
  dtmToDate,
  formatDtm,
  parseDtm,
  parseDtmCascade,
} from "../src/parser/dates.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { Hl7Position } from "../src/parser/types.js";

const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 7 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/dates: parseDtm — precision fidelity", () => {
  it("year-only preserves precision without zero-fill", () => {
    const p = parseDtm("1970");
    expect(p).toMatchObject({ valid: true, precision: "year", year: 1970, hasTimezone: false });
    expect(p.month).toBeUndefined();
  });

  it("month precision", () => {
    expect(parseDtm("202501")).toMatchObject({ precision: "month", year: 2025, month: 1 });
  });

  it("day precision (a birth date stays day-only)", () => {
    expect(parseDtm("19880705")).toMatchObject({ precision: "day", year: 1988, month: 7, day: 5 });
  });

  it("hour precision", () => {
    expect(parseDtm("2025010215")).toMatchObject({ precision: "hour", hour: 15 });
  });

  it("minute precision", () => {
    expect(parseDtm("198807050000")).toMatchObject({ precision: "minute", minute: 0, day: 5 });
  });

  it("second precision", () => {
    expect(parseDtm("20250102153045")).toMatchObject({ precision: "second", second: 45 });
  });

  it("fractional precision preserves digits verbatim", () => {
    expect(parseDtm("20250102153045.5")).toMatchObject({
      precision: "fraction",
      fractionalSeconds: "5",
    });
    expect(parseDtm("20250102153045.0500").fractionalSeconds).toBe("0500");
  });

  it("rejects a fractional component without full second precision", () => {
    expect(parseDtm("202501.5").valid).toBe(false);
  });
});

describe("parser/dates: parseDtm — timezone fidelity (never assume UTC)", () => {
  it("flags a missing offset as no-timezone, never resolving it", () => {
    const p = parseDtm("20250102153045");
    expect(p.hasTimezone).toBe(false);
    expect(p.offsetMinutes).toBeUndefined();
  });

  it("captures a positive offset as signed minutes east of UTC", () => {
    expect(parseDtm("20250102153045+0500")).toMatchObject({
      hasTimezone: true,
      offsetMinutes: 300,
    });
  });

  it("captures a fractional-hour negative offset (-0930 → -570)", () => {
    expect(parseDtm("20250102-0930")).toMatchObject({ hasTimezone: true, offsetMinutes: -570 });
  });

  it("treats +0000 as a present zero offset (not a missing zone)", () => {
    expect(parseDtm("20250102153045+0000")).toMatchObject({
      hasTimezone: true,
      offsetMinutes: 0,
    });
  });
});

describe("parser/dates: parseDtm — fail-safe (invalid → valid:false, never a guess)", () => {
  it.each([
    ["month 00", "20250001"],
    ["month 13", "20251301"],
    ["day 00", "20250100"],
    ["day 32", "20250132"],
    ["hour 24", "2025010224"],
    ["minute 60", "202501021560"],
    ["second 60 (no leap seconds)", "20250102153060"],
    ["non-date text", "not-a-date"],
    ["odd digit length", "202501021"],
  ])("rejects %s", (_label, raw) => {
    const p = parseDtm(raw);
    expect(p.valid).toBe(false);
    expect(p.raw).toBe(raw);
    expect(p.year).toBeUndefined();
  });

  it("empty string is invalid with empty raw", () => {
    expect(parseDtm("")).toMatchObject({ raw: "", valid: false, hasTimezone: false });
  });
});

describe("parser/dates: dtmToDate — explicit, opt-in, honest", () => {
  it("uses an embedded offset to compute the exact instant", () => {
    expect(dtmToDate(parseDtm("20250102153045+0500"))?.toISOString()).toBe(
      "2025-01-02T10:30:45.000Z",
    );
    expect(dtmToDate(parseDtm("20250102103045-0500"))?.toISOString()).toBe(
      "2025-01-02T15:30:45.000Z",
    );
  });

  it("refuses to guess a zone for an offset-less value", () => {
    expect(dtmToDate(parseDtm("20250102153045"))).toBeUndefined();
  });

  it("applies a caller-supplied assumed offset (0 = explicit UTC)", () => {
    expect(dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "2025-01-02T00:00:00.000Z",
    );
    // A day-only value with an assumed +offset shifts correctly, no rollover.
    expect(dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 300 })?.toISOString()).toBe(
      "2025-01-01T19:00:00.000Z",
    );
  });

  it("ignores assumeOffsetMinutes when the value carries its own offset", () => {
    expect(
      dtmToDate(parseDtm("20250102153045+0500"), { assumeOffsetMinutes: 0 })?.toISOString(),
    ).toBe("2025-01-02T10:30:45.000Z");
  });

  it("fills truncated fields to their lowest legal value for instant construction", () => {
    expect(dtmToDate(parseDtm("1970"), { assumeOffsetMinutes: 0 })?.toISOString()).toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });

  it("carries fractional seconds into the instant (3-digit ms)", () => {
    const d = dtmToDate(parseDtm("20250102153045.5+0000"));
    expect(d?.getUTCMilliseconds()).toBe(500);
  });

  it("returns undefined for an invalid value", () => {
    expect(dtmToDate(parseDtm("garbage"), { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("does not remap a 1–99 AD year via the Date.UTC two-digit-year legacy", () => {
    // `Date.UTC(50, …)` would yield year 1950; the instant must stay year 50.
    expect(dtmToDate(parseDtm("0050+0000"))?.getUTCFullYear()).toBe(50);
    expect(dtmToDate(parseDtm("00090102+0000"))?.getUTCFullYear()).toBe(9);
  });
});

describe("parser/dates: formatDtm — lossless reconstruction (no zero-fill)", () => {
  it.each([
    "1970",
    "202501",
    "19880705",
    "2025010215",
    "198807050000",
    "20250102153045",
    "20250102153045.5",
    "20250102153045.0500",
    "20250102153045+0500",
    "20250102103045-0930",
    "20250102153045+0000",
    "20250102153045-0000", // byte-preserving: -0000 must not canonicalize to +0000
  ])("round-trips %s exactly", (raw) => {
    expect(formatDtm(parseDtm(raw))).toBe(raw);
  });

  it("returns raw unchanged for an invalid value", () => {
    expect(formatDtm(parseDtm("not-a-date"))).toBe("not-a-date");
  });
});

describe("parser/dates: parseDtm — result is frozen (immutable by default)", () => {
  it("freezes both valid and invalid results", () => {
    expect(Object.isFrozen(parseDtm("20250102153045-0500"))).toBe(true);
    expect(Object.isFrozen(parseDtm("not-a-date"))).toBe(true);
    expect(Object.isFrozen(parseDtm(""))).toBe(true);
  });
});

describe("parser/dates: parseDtmCascade — lenient fallback for non-composite callers", () => {
  it("strict HL7 DTM path never warns and returns full parts", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("20250102", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p).toMatchObject({ valid: true, precision: "day", year: 2025, month: 1, day: 2 });
    expect(p.matchedFormat).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("emits TIMESTAMP_FALLBACK_FORMAT and records the matched format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("01/02/2025", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p).toMatchObject({
      valid: true,
      year: 2025,
      month: 1,
      day: 2,
      matchedFormat: "MM/DD/YYYY",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("tries user formats in order — second matches when first fails", () => {
    const { emit, warnings } = collect();
    parseDtmCascade("01/02/2025", {
      userFormats: ["YYYY-MM-DD", "MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("falls back to built-ins when userFormats is empty", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("2025-01-02", { userFormats: [], emit, position: pos });
    expect(p).toMatchObject({ valid: true, year: 2025, month: 1, day: 2 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/YYYY-MM-DD|ISO-8601/);
  });

  it("parses ISO-8601 with a Z offset as timezone-present", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("2025-01-02T15:30:45Z", { userFormats: [], emit, position: pos });
    expect(p).toMatchObject({ valid: true, hasTimezone: true, offsetMinutes: 0, second: 45 });
    expect(dtmToDate(p)?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
    expect(warnings[0]?.message).toMatch(/ISO-8601/);
  });

  it("parses ISO-8601 with an explicit +HH:MM offset", () => {
    const p = parseDtmCascade("2025-01-02T15:30:45+05:00", { userFormats: [] });
    expect(p).toMatchObject({ hasTimezone: true, offsetMinutes: 300 });
  });

  it("returns invalid + no warning when nothing matches", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("notadate", { userFormats: [], emit, position: pos });
    expect(p.valid).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("empty input is invalid without consulting any format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p.valid).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("rejects trailing characters beyond a token format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("01/02/2025 99", {
      userFormats: ["MM/DD/YYYY"],
      emit,
      position: pos,
    });
    expect(p.valid).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it("rejects a token chunk that is not all digits", () => {
    const p = parseDtmCascade("1X/02/2025", { userFormats: ["MM/DD/YYYY"] });
    expect(p.valid).toBe(false);
  });

  it("rejects a token-format value that is calendar-out-of-range", () => {
    expect(parseDtmCascade("13/02/2025", { userFormats: ["MM/DD/YYYY"] }).valid).toBe(false);
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
