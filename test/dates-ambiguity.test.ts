/**
 * Order-ambiguous slash dates in the built-in fallback cascade.
 *
 * A slash-separated numeric date whose first two components are BOTH in 1-12
 * has two legal readings and the parser has no evidence for either. It must
 * resolve neither and say why, under an identifier of its own that a consumer
 * can tell apart from the generic fallback-format signal.
 *
 * Everything here is observed through the public entry point (`parseHL7`) plus
 * the exported cascade, because that is what a consumer actually holds.
 */

import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS_DATE_ORDER,
  BUILTIN_DATE_FALLBACKS,
  WARNING_CODES,
  defineProfile,
  parseHL7,
} from "../src/index.js";
import type { Hl7ParseWarning, Hl7Position } from "../src/index.js";
// The cascade itself is internal (no barrel export): reached directly so the
// refusal can be observed at the layer that makes it, not only through `meta`.
import { parseDtmCascade } from "../src/parser/dates.js";

/** Build a minimal message whose MSH-7 carries `ts`. */
function messageWith(ts: string): string {
  return `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|${ts}||ADT^A01|MSG001|P|2.5\rEVN|A01\r`;
}

const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 7 };

/** Collect the warnings a cascade call emits. */
function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { emit: (w) => warnings.push(w), warnings };
}

describe("AC1: an order-ambiguous MSH-7 resolves to no calendar date", () => {
  it("05/07/1988 with no declared format reports no resolved month/day", () => {
    const msg = parseHL7(messageWith("05/07/1988"));
    const ts = msg.meta.timestamp;

    // Either absent, or present and explicitly not valid: never a guess.
    expect(ts?.valid ?? false).toBe(false);
    expect(ts?.month).toBeUndefined();
    expect(ts?.day).toBeUndefined();
    expect(ts?.matchedFormat).toBeUndefined();
    expect(ts?.precision).toBeUndefined();
  });

  it("neither the May-7 nor the July-5 reading is returned", () => {
    const ts = parseHL7(messageWith("05/07/1988")).meta.timestamp;
    expect(ts).not.toMatchObject({ month: 5, day: 7 });
    expect(ts).not.toMatchObject({ month: 7, day: 5 });
  });

  it("the cascade itself declines the value rather than the message layer", () => {
    const p = parseDtmCascade("05/07/1988", { userFormats: [] });
    expect(p.valid).toBe(false);
    expect(p.month).toBeUndefined();
    expect(p.day).toBeUndefined();
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("declining emits no TIMESTAMP_FALLBACK_FORMAT: nothing fell back", () => {
    const { emit, warnings } = collect();
    parseDtmCascade("05/07/1988", { userFormats: [], emit, position: pos });
    expect(warnings).toHaveLength(0);
  });
});

describe("AC2: the reason is discoverable under an identifier of its own", () => {
  it("msg.meta.timestamp carries the ambiguity report", () => {
    const ts = parseHL7(messageWith("05/07/1988")).meta.timestamp;
    expect(ts?.ambiguity).toBeDefined();
    expect(ts?.ambiguity?.code).toBe(AMBIGUOUS_DATE_ORDER);
  });

  it("the identifier is stable and is NOT TIMESTAMP_FALLBACK_FORMAT", () => {
    expect(AMBIGUOUS_DATE_ORDER).toBe("AMBIGUOUS_DATE_ORDER");
    expect(AMBIGUOUS_DATE_ORDER).not.toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
  });

  it("ambiguous, malformed and resolved-via-fallback are three distinguishable states", () => {
    const ambiguous = parseHL7(messageWith("05/07/1988")).meta.timestamp;
    const malformed = parseHL7(messageWith("not-a-date")).meta.timestamp;
    const resolved = parseHL7(messageWith("07/25/1988")).meta.timestamp;

    expect(ambiguous?.valid).toBe(false);
    expect(ambiguous?.ambiguity).toBeDefined();

    // Malformed: no timestamp at all, so nothing to mistake for a refusal.
    expect(malformed).toBeUndefined();

    expect(resolved?.valid).toBe(true);
    expect(resolved?.ambiguity).toBeUndefined();
    expect(resolved?.matchedFormat).toBe("MM/DD/YYYY");
  });

  it("the report is frozen along with the parts that carry it", () => {
    const ts = parseHL7(messageWith("05/07/1988")).meta.timestamp;
    expect(Object.isFrozen(ts)).toBe(true);
    expect(Object.isFrozen(ts?.ambiguity)).toBe(true);
  });
});

describe("AC3: the report names the raw value and BOTH candidate readings", () => {
  it("names the raw value", () => {
    const report = parseHL7(messageWith("05/07/1988")).meta.timestamp?.ambiguity;
    expect(report?.raw).toBe("05/07/1988");
    expect(report?.message).toContain("05/07/1988");
  });

  it("names 1988-05-07 and 1988-07-05 as the two readings, with the format each needs", () => {
    const report = parseHL7(messageWith("05/07/1988")).meta.timestamp?.ambiguity;
    expect(report?.candidates).toHaveLength(2);
    expect(report?.candidates[0]).toEqual({
      format: "MM/DD/YYYY",
      month: 5,
      day: 7,
      isoDate: "1988-05-07",
    });
    expect(report?.candidates[1]).toEqual({
      format: "DD/MM/YYYY",
      month: 7,
      day: 5,
      isoDate: "1988-07-05",
    });
  });

  it("the message shows what was declined and what to declare", () => {
    const report = parseHL7(messageWith("05/07/1988")).meta.timestamp?.ambiguity;
    expect(report?.message).toContain("1988-05-07");
    expect(report?.message).toContain("1988-07-05");
    expect(report?.message).toContain("MM/DD/YYYY");
    expect(report?.message).toContain("DD/MM/YYYY");
    expect(report?.message).toContain("dateFormats");
  });
});

describe("AC4: an ambiguous value with a time component is treated identically", () => {
  it("05/07/1988 13:45:00 resolves to no calendar date", () => {
    const ts = parseHL7(messageWith("05/07/1988 13:45:00")).meta.timestamp;
    expect(ts?.valid).toBe(false);
    expect(ts?.month).toBeUndefined();
    expect(ts?.day).toBeUndefined();
    expect(ts?.hour).toBeUndefined();
  });

  it("it reports the SAME identifier and both readings", () => {
    const report = parseHL7(messageWith("05/07/1988 13:45:00")).meta.timestamp?.ambiguity;
    expect(report?.code).toBe(AMBIGUOUS_DATE_ORDER);
    expect(report?.raw).toBe("05/07/1988 13:45:00");
    expect(report?.candidates.map((c) => c.isoDate)).toEqual(["1988-05-07", "1988-07-05"]);
    expect(report?.candidates.map((c) => c.format)).toEqual([
      "MM/DD/YYYY HH:mm:ss",
      "DD/MM/YYYY HH:mm:ss",
    ]);
  });
});

describe("AC5: a single-reading slash date still resolves exactly as it did", () => {
  it("07/25/1988 is July 25 1988 with matchedFormat MM/DD/YYYY", () => {
    const ts = parseHL7(messageWith("07/25/1988")).meta.timestamp;
    expect(ts).toMatchObject({
      valid: true,
      precision: "day",
      year: 1988,
      month: 7,
      day: 25,
      matchedFormat: "MM/DD/YYYY",
    });
    expect(ts?.ambiguity).toBeUndefined();
  });

  it("a single-reading value with a time component resolves too", () => {
    const ts = parseHL7(messageWith("07/25/1988 13:45:00")).meta.timestamp;
    expect(ts).toMatchObject({
      valid: true,
      month: 7,
      day: 25,
      hour: 13,
      minute: 45,
      second: 0,
      matchedFormat: "MM/DD/YYYY HH:mm:ss",
    });
    expect(ts?.ambiguity).toBeUndefined();
  });

  it("the fallback warning still fires for a single-reading value", () => {
    const { emit, warnings } = collect();
    parseDtmCascade("07/25/1988", { userFormats: [], emit, position: pos });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
    expect(warnings[0]?.message).toContain("MM/DD/YYYY");
  });
});

describe("AC6: when both readings denote the same day there is nothing to refuse", () => {
  it("05/05/1988 resolves to May 5 1988 with no ambiguity report", () => {
    const ts = parseHL7(messageWith("05/05/1988")).meta.timestamp;
    expect(ts).toMatchObject({ valid: true, year: 1988, month: 5, day: 5 });
    expect(ts?.ambiguity).toBeUndefined();
    expect(ts?.matchedFormat).toBe("MM/DD/YYYY");
  });

  it("05/05/1988 13:45:00 resolves too", () => {
    const ts = parseHL7(messageWith("05/05/1988 13:45:00")).meta.timestamp;
    expect(ts).toMatchObject({ valid: true, month: 5, day: 5, hour: 13 });
    expect(ts?.ambiguity).toBeUndefined();
  });
});

describe("AC7: a caller-declared order is the evidence the parser lacked", () => {
  it('options.dateFormats ["DD/MM/YYYY"] reads 05/07/1988 as July 5', () => {
    const msg = parseHL7(messageWith("05/07/1988"), { dateFormats: ["DD/MM/YYYY"] });
    expect(msg.meta.timestamp).toMatchObject({
      valid: true,
      year: 1988,
      month: 7,
      day: 5,
      matchedFormat: "DD/MM/YYYY",
    });
    expect(msg.meta.timestamp?.ambiguity).toBeUndefined();
  });

  it('options.dateFormats ["MM/DD/YYYY"] reads 05/07/1988 as May 7', () => {
    const msg = parseHL7(messageWith("05/07/1988"), { dateFormats: ["MM/DD/YYYY"] });
    expect(msg.meta.timestamp).toMatchObject({
      valid: true,
      year: 1988,
      month: 5,
      day: 7,
      matchedFormat: "MM/DD/YYYY",
    });
    expect(msg.meta.timestamp?.ambiguity).toBeUndefined();
  });

  it("a profile's dateFormats does the same", () => {
    const msg = parseHL7(messageWith("05/07/1988"), {
      profile: defineProfile({ name: "day-first-vendor", dateFormats: ["DD/MM/YYYY"] }),
    });
    expect(msg.meta.timestamp).toMatchObject({ valid: true, month: 7, day: 5 });
    expect(msg.meta.timestamp?.ambiguity).toBeUndefined();
  });

  it("a declared format keeps the existing TIMESTAMP_FALLBACK_FORMAT semantics", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("05/07/1988", {
      userFormats: ["DD/MM/YYYY"],
      emit,
      position: pos,
    });
    expect(p).toMatchObject({ valid: true, month: 7, day: 5, matchedFormat: "DD/MM/YYYY" });
    expect(p.ambiguity).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
    expect(warnings[0]?.message).toContain("DD/MM/YYYY");
    expect(warnings[0]?.position).toEqual(pos);
  });

  it("a declared format that does not match still leaves the built-ins to refuse", () => {
    const msg = parseHL7(messageWith("05/07/1988"), { dateFormats: ["YYYY-MM-DD"] });
    expect(msg.meta.timestamp?.valid).toBe(false);
    expect(msg.meta.timestamp?.ambiguity?.code).toBe(AMBIGUOUS_DATE_ORDER);
  });
});

describe("AC8: an over-complete declaration is still a declaration", () => {
  it("both orders in options: the FIRST wins, deterministically", () => {
    const msg = parseHL7(messageWith("05/07/1988"), {
      dateFormats: ["MM/DD/YYYY", "DD/MM/YYYY"],
    });
    expect(msg.meta.timestamp).toMatchObject({ month: 5, day: 7, matchedFormat: "MM/DD/YYYY" });
    expect(msg.meta.timestamp?.ambiguity).toBeUndefined();
  });

  it("the reversed declaration wins in reverse, and neither reports ambiguity", () => {
    const msg = parseHL7(messageWith("05/07/1988"), {
      dateFormats: ["DD/MM/YYYY", "MM/DD/YYYY"],
    });
    expect(msg.meta.timestamp).toMatchObject({ month: 7, day: 5, matchedFormat: "DD/MM/YYYY" });
    expect(msg.meta.timestamp?.ambiguity).toBeUndefined();
  });

  it("options precede profile in the merged try-order", () => {
    const msg = parseHL7(messageWith("05/07/1988"), {
      dateFormats: ["MM/DD/YYYY"],
      profile: defineProfile({ name: "day-first-vendor", dateFormats: ["DD/MM/YYYY"] }),
    });
    expect(msg.dateFormats).toEqual(["MM/DD/YYYY", "DD/MM/YYYY"]);
    expect(msg.meta.timestamp).toMatchObject({ month: 5, day: 7, matchedFormat: "MM/DD/YYYY" });
    expect(msg.meta.timestamp?.ambiguity).toBeUndefined();
  });
});

describe("AC9: malformed is a different fact from ambiguous", () => {
  it("not-a-date yields no timestamp and no ambiguity report", () => {
    const msg = parseHL7(messageWith("not-a-date"));
    expect(msg.meta.timestamp).toBeUndefined();
    expect(parseDtmCascade("not-a-date", { userFormats: [] }).ambiguity).toBeUndefined();
  });

  it("13/13/1988 is legal under NEITHER reading, so it is malformed, not ambiguous", () => {
    const msg = parseHL7(messageWith("13/13/1988"));
    expect(msg.meta.timestamp).toBeUndefined();
    expect(parseDtmCascade("13/13/1988", { userFormats: [] }).ambiguity).toBeUndefined();
  });

  it("13/02/2025 keeps its existing verdict: invalid, not ambiguous", () => {
    // Only the day-first reading is legal here, and day-first is not a built-in,
    // so this stays the loud failure it has always been.
    const p = parseDtmCascade("13/02/2025", { userFormats: ["MM/DD/YYYY"] });
    expect(p.valid).toBe(false);
    expect(p.ambiguity).toBeUndefined();
  });

  it("an ambiguous date carrying an out-of-range time is malformed, not ambiguous", () => {
    const p = parseDtmCascade("05/07/1988 99:99:99", { userFormats: [] });
    expect(p.valid).toBe(false);
    expect(p.ambiguity).toBeUndefined();
  });

  it("trailing characters beyond the format are malformed, not ambiguous", () => {
    const p = parseDtmCascade("05/07/1988 99", { userFormats: [] });
    expect(p.valid).toBe(false);
    expect(p.ambiguity).toBeUndefined();
  });
});

describe("AC10: an empty MSH-7 behaves exactly as it did", () => {
  it("no timestamp, no ambiguity report, no throw", () => {
    const msg = parseHL7(messageWith(""));
    expect(() => msg.meta).not.toThrow();
    expect(msg.meta.timestamp).toBeUndefined();
    expect(msg.meta.controlId).toBe("MSG001");
  });

  it("the cascade short-circuits on empty input without consulting any format", () => {
    const { emit, warnings } = collect();
    const p = parseDtmCascade("", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(p.valid).toBe(false);
    expect(p.ambiguity).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });
});

describe("the built-in list is unchanged: day-first is a probe, never a fallback", () => {
  it("DD/MM/YYYY is NOT a built-in fallback", () => {
    expect(BUILTIN_DATE_FALLBACKS).not.toContain("DD/MM/YYYY");
    expect(BUILTIN_DATE_FALLBACKS).not.toContain("DD/MM/YYYY HH:mm:ss");
  });

  it("an unambiguous day-first value still fails loudly rather than resolving", () => {
    // 25 is no month, so there is one reading and the built-ins cannot express
    // it. Declaring the order is the route; the parser does not widen for it.
    const msg = parseHL7(messageWith("25/07/1988"));
    expect(msg.meta.timestamp).toBeUndefined();

    const declared = parseHL7(messageWith("25/07/1988"), { dateFormats: ["DD/MM/YYYY"] });
    expect(declared.meta.timestamp).toMatchObject({ valid: true, month: 7, day: 25 });
  });

  it("strict HL7 DTM, ISO-8601 and YYYY-MM-DD are untouched by the ambiguity check", () => {
    expect(parseHL7(messageWith("19880705")).meta.timestamp).toMatchObject({
      valid: true,
      precision: "day",
      year: 1988,
      month: 7,
      day: 5,
    });
    // ISO-8601 is tried first and its shape guard accepts a date-only value,
    // so a hyphenated date never reaches the slash entries at all.
    expect(parseHL7(messageWith("1988-05-07")).meta.timestamp).toMatchObject({
      valid: true,
      month: 5,
      day: 7,
      matchedFormat: "ISO-8601",
    });
    expect(parseDtmCascade("1988-05-07T13:45:00Z", { userFormats: [] })).toMatchObject({
      valid: true,
      month: 5,
      day: 7,
      hasTimezone: true,
      matchedFormat: "ISO-8601",
    });
  });
});
