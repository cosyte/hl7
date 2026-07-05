import { describe, expect, it } from "vitest";
import { formatHl7Timestamp } from "../src/builder/format-timestamp.js";

describe("formatHl7Timestamp (D-13)", () => {
  it("formats a known UTC datetime to YYYYMMDDHHmmss", () => {
    const d = new Date("2026-04-19T10:15:00Z");
    expect(formatHl7Timestamp(d)).toBe("20260419101500");
  });

  it("zero-pads all fields", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(formatHl7Timestamp(d)).toBe("20260101000000");
  });

  it("handles century boundary", () => {
    const d = new Date("1999-12-31T23:59:59Z");
    expect(formatHl7Timestamp(d)).toBe("19991231235959");
  });

  it("truncates sub-second precision (D-13)", () => {
    const d = new Date("2026-04-19T10:15:00.999Z");
    expect(formatHl7Timestamp(d)).toBe("20260419101500");
  });

  it("month is 1-indexed in HL7 output", () => {
    // Jan = month index 0 in Date -> "01" in HL7
    expect(formatHl7Timestamp(new Date("2026-01-15T12:00:00Z"))).toBe("20260115120000");
    // Dec = month index 11 in Date -> "12" in HL7
    expect(formatHl7Timestamp(new Date("2026-12-15T12:00:00Z"))).toBe("20261215120000");
  });

  it("always emits exactly 14 characters", () => {
    expect(formatHl7Timestamp(new Date("2026-04-19T10:15:00Z")).length).toBe(14);
    expect(formatHl7Timestamp(new Date(0)).length).toBe(14);
    expect(formatHl7Timestamp(new Date()).length).toBe(14);
  });

  it("converts non-UTC input to UTC", () => {
    // 2026-04-19T10:15:00-05:00 = 2026-04-19T15:15:00Z
    const d = new Date("2026-04-19T10:15:00-05:00");
    expect(formatHl7Timestamp(d)).toBe("20260419151500");
  });

  it("does not throw on epoch or any valid Date", () => {
    expect(() => formatHl7Timestamp(new Date(0))).not.toThrow();
    expect(() => formatHl7Timestamp(new Date("2099-12-31T23:59:59Z"))).not.toThrow();
    expect(() => formatHl7Timestamp(new Date())).not.toThrow();
  });

  it("parseDtm inverse round-trip (seconds precision, explicit UTC)", async () => {
    const { parseDtm, dtmToDate } = await import("../src/parser/dates.js");
    const original = new Date("2026-04-19T10:15:30Z");
    const formatted = formatHl7Timestamp(original);
    // formatHl7Timestamp emits UTC second-precision with no offset; reading it
    // back to the same instant requires explicitly assuming UTC.
    const reparsed = dtmToDate(parseDtm(formatted), { assumeOffsetMinutes: 0 });
    expect(reparsed?.toISOString()).toBe(original.toISOString());
  });
});
