/**
 * Phase M — integration tests for order / medication timing (`TQ1` + legacy
 * embedded TQ in ORC-7 / RXE-1) surfaced on `order.timings` / `med.timings`.
 *
 * Load-bearing safety claims exercised here:
 *   - The repeat pattern is surfaced VERBATIM (`code`), never resolved to a
 *     schedule; a parametric `Q<n><unit>` integer is never dropped.
 *   - Total occurrences comes from TQ1-14, NOT TQ1-11 (Text Instruction).
 *   - Start/end keep Phase N `TS` precision + timezone fidelity.
 *   - TQ1 and legacy embedded TQ are chosen by presence (never double-counted,
 *     never dropped); the helper never throws.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { classifyRepeatPattern } from "../src/helpers/timing.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);
function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORM^O01|1|P|2.5\r";
const RDE_MSH = "MSH|^~\\&|APP|FAC|||20250102||RDE^O11|1|P|2.5\r";
const PID = "PID|||X\r";

/** Build a `TQ1` segment from a sparse field map so positions are unambiguous. */
function tq1(fields: Record<number, string>): string {
  const max = Math.max(0, ...Object.keys(fields).map(Number));
  const parts = ["TQ1"];
  for (let i = 1; i <= max; i++) parts.push(fields[i] ?? "");
  return parts.join("|");
}

describe("helpers/timing: TQ1 on orders()", () => {
  it("surfaces a named BID pattern, quantity, priority, start/end, and total occurrences", () => {
    const order = parseHL7(loadFixture("tq1-bid")).orders()[0];
    expect(order?.timings).toHaveLength(1);
    const t = order?.timings[0];
    expect(t?.source).toBe("TQ1");
    expect(t?.quantity?.value).toBe(1);
    expect(t?.repeatPattern).toEqual({ code: "BID", kind: "named" });
    expect(t?.priority?.identifier).toBe("R");
    expect(t?.priority?.text).toBe("Routine");
    // Phase N TS fidelity — second precision, no zero-fill.
    expect(t?.startDateTime?.precision).toBe("second");
    expect(t?.startDateTime?.raw).toBe("20260705120000");
    expect(t?.endDateTime?.raw).toBe("20260712120000");
    expect(t?.totalOccurrences).toBe(10);
  });
});

describe("helpers/timing: TQ1 on medications()", () => {
  it("surfaces a parametric Q6H interval verbatim with its load-bearing integer", () => {
    const med = parseHL7(loadFixture("tq1-q6h")).medications()[0];
    expect(med?.timings).toHaveLength(1);
    const t = med?.timings[0];
    expect(t?.source).toBe("TQ1");
    // Verbatim code + provenance classification + load-bearing integer.
    expect(t?.repeatPattern).toEqual({
      code: "Q6H",
      kind: "parametric",
      interval: { count: 6, unit: "H" },
    });
    expect(t?.quantity?.value).toBe(1);
    expect(t?.quantity?.units?.identifier).toBe("tablet");
    expect(t?.totalOccurrences).toBe(24);
  });
});

describe("helpers/timing: legacy embedded TQ", () => {
  it("reads a legacy ORC-7 TQ on an order (pre-v2.5 message)", () => {
    const order = parseHL7(loadFixture("orc7-legacy-tq")).orders()[0];
    expect(order?.timings).toHaveLength(1);
    const t = order?.timings[0];
    expect(t?.source).toBe("legacy");
    expect(t?.quantity?.value).toBe(1);
    expect(t?.quantity?.units?.identifier).toBe("tablet");
    expect(t?.repeatPattern).toEqual({
      code: "Q8H",
      kind: "parametric",
      interval: { count: 8, unit: "H" },
    });
    expect(t?.explicitTime).toBe("0800");
    expect(t?.startDateTime?.raw).toBe("20260705080000");
    expect(t?.endDateTime?.raw).toBe("20260712080000");
    expect(t?.priority?.identifier).toBe("R");
    expect(t?.totalOccurrences).toBe(12);
  });

  it("reads a legacy embedded TQ in RXE-1 on an encoded medication", () => {
    const med = parseHL7(loadFixture("rde-o11-pharmacy")).medications()[0];
    expect(med?.timings).toHaveLength(1);
    expect(med?.timings[0]?.source).toBe("legacy");
    expect(med?.timings[0]?.startDateTime?.raw).toBe("20260419140000");
  });
});

describe("helpers/timing: presence-based source choice (never double-count, never drop)", () => {
  it("a TQ1 suppresses the legacy ORC-7 TQ (only TQ1 surfaces)", () => {
    const raw =
      MSH +
      PID +
      "ORC|NW|A|B||||1^Q8H^^20250101^^R^^^^^^9\r" +
      tq1({ 1: "1", 3: "BID", 14: "3" }) +
      "\r" +
      "OBR|1|A|B|CBC^^L\r";
    const timings = parseHL7(raw).orders()[0]?.timings ?? [];
    expect(timings).toHaveLength(1);
    expect(timings[0]?.source).toBe("TQ1");
    expect(timings[0]?.repeatPattern?.code).toBe("BID");
    expect(timings[0]?.totalOccurrences).toBe(3);
  });

  it("multiple TQ1 segments each surface (a tapering schedule)", () => {
    const raw =
      MSH +
      PID +
      "ORC|NW|A|B\r" +
      tq1({ 1: "1", 3: "BID", 8: "20250105" }) +
      "\r" +
      tq1({ 1: "2", 3: "QD" }) +
      "\r" +
      "OBR|1|A|B|VITALS^^L\r";
    const timings = parseHL7(raw).orders()[0]?.timings ?? [];
    expect(timings).toHaveLength(2);
    expect(timings[0]?.repeatPattern?.code).toBe("BID");
    expect(timings[1]?.repeatPattern?.code).toBe("QD");
  });

  it("no TQ1 and no legacy TQ → timings is an empty (but present, frozen) array", () => {
    const order = parseHL7(MSH + PID + "OBR|1|A|B|CBC^^L\r").orders()[0];
    expect(order?.timings).toEqual([]);
    expect(Object.isFrozen(order?.timings)).toBe(true);
    const med = parseHL7(RDE_MSH + PID + "RXO|D^Drug^RXN|1||mg\r").medications()[0];
    expect(med?.timings).toEqual([]);
  });

  it("a legacy ORC-7 timing on an RXO pharmacy order is never dropped by medications()", () => {
    // Pre-v2.5 OMP^O09: timing lives in ORC-7, the med is an RXO (not RXE), and
    // there is no OBR — so orders() surfaces nothing. medications() must still
    // surface the ORC-7 legacy timing (never-dropped safety claim).
    const raw =
      "MSH|^~\\&|APP|FAC|||20250102||OMP^O09|1|P|2.3\r" +
      PID +
      "ORC|NW|A|B||||1&tab^Q8H^^20250101^^R^^^^^^12\r" +
      "RXO|D^Drug^RXN|1||mg\r";
    const med = parseHL7(raw).medications()[0];
    expect(med?.context).toBe("order");
    expect(med?.timings).toHaveLength(1);
    expect(med?.timings[0]?.source).toBe("legacy");
    expect(med?.timings[0]?.repeatPattern?.code).toBe("Q8H");
    expect(med?.timings[0]?.totalOccurrences).toBe(12);
  });

  it("an ORC RXO RXE group never double-surfaces the ORC-7 timing", () => {
    // The ORC-7 legacy timing is consumed by only the first RX* of the group.
    const raw =
      RDE_MSH +
      PID +
      "ORC|NW|A|B||||1^Q8H^^20250101^^R^^^^^^9\r" +
      "RXO|D^Drug^RXN|1||mg\r" +
      "RXE||D^Drug^RXN|1|1|TAB\r"; // RXE-1 (Quantity/Timing) empty
    const meds = parseHL7(raw).medications();
    expect(meds).toHaveLength(2);
    expect(meds[0]?.timings).toHaveLength(1); // RXO gets the ORC-7 timing
    expect(meds[0]?.timings[0]?.source).toBe("legacy");
    expect(meds[1]?.timings).toEqual([]); // RXE (no RXE-1, ORC-7 already consumed)
  });

  it("an intervening ORC re-scopes a following TQ1 to the next order (orders)", () => {
    // ORC1 OBR1 ORC2 TQ1 OBR2: the TQ1 belongs to OBR2, and OBR1 keeps ORC1's
    // legacy timing — the TQ1 must NOT bind to the still-open OBR1.
    const raw =
      MSH +
      PID +
      "ORC|NW|O1|O1||||1^Q8H^^20250101^^R^^^^^^9\r" +
      "OBR|1|O1|O1|CBC^^L\r" +
      "ORC|NW|O2|O2\r" +
      tq1({ 1: "1", 3: "Q6H", 14: "8" }) +
      "\r" +
      "OBR|2|O2|O2|BMP^^L\r";
    const orders = parseHL7(raw).orders();
    expect(orders).toHaveLength(2);
    // OBR1 keeps its own ORC-7 legacy Q8H — not stolen, not overwritten.
    expect(orders[0]?.timings[0]?.source).toBe("legacy");
    expect(orders[0]?.timings[0]?.repeatPattern?.code).toBe("Q8H");
    // OBR2 gets the TQ1 Q6H that followed ORC2.
    expect(orders[1]?.timings[0]?.source).toBe("TQ1");
    expect(orders[1]?.timings[0]?.repeatPattern?.code).toBe("Q6H");
  });

  it("an intervening ORC re-scopes a following TQ1 to the next medication", () => {
    const raw =
      RDE_MSH +
      PID +
      "RXE||D1^Drug1^RXN|1|1|TAB\r" + // RXE-1 (Quantity/Timing) empty
      "ORC|NW|O2|O2\r" +
      tq1({ 1: "1", 3: "Q6H" }) +
      "\r" +
      "RXE||D2^Drug2^RXN|1|1|TAB\r"; // RXE-1 empty
    const meds = parseHL7(raw).medications();
    expect(meds).toHaveLength(2);
    expect(meds[0]?.timings).toEqual([]); // first RXE has no timing
    expect(meds[1]?.timings[0]?.repeatPattern?.code).toBe("Q6H"); // TQ1 binds to second RXE
  });

  it("the repeat-pattern code is the decoded field value (escapes unescaped, never resolved)", () => {
    // An escape sequence in TQ1-3 is unescaped like any field read; the code is
    // still surfaced as-authored (decoded), never normalized to a frequency.
    const raw = MSH + PID + tq1({ 1: "1", 3: "Q6H\\T\\PRN" }) + "\r" + "OBR|1|A|B|X^^L\r";
    const t = parseHL7(raw).orders()[0]?.timings[0];
    expect(t?.repeatPattern?.code).toBe("Q6H&PRN"); // \T\ → subcomponent separator, decoded
    expect(t?.repeatPattern?.kind).toBe("unknown"); // not mapped to any schedule
  });
});

describe("helpers/timing: total occurrences is TQ1-14, not TQ1-11", () => {
  it("reads TQ1-14 and never mistakes the TQ1-11 Text Instruction for the count", () => {
    const raw =
      MSH +
      PID +
      tq1({ 1: "1", 3: "Q6H", 11: "Take with food", 14: "7" }) +
      "\r" +
      "OBR|1|A|B|VITALS^^L\r";
    const t = parseHL7(raw).orders()[0]?.timings[0];
    expect(t?.totalOccurrences).toBe(7);
    // The TX instruction is not modelled and never leaks into a numeric field.
    expect(JSON.stringify(t)).not.toContain("Take with food");
  });
});

describe("helpers/timing: never throws (HELPERS-07)", () => {
  it("tolerates malformed / empty TQ1 fields without throwing", () => {
    for (const body of [
      "TQ1",
      "TQ1|||",
      "TQ1|abc|xyz|Q^weird^stuff|~~~|",
      tq1({ 2: "notanumber", 7: "not-a-date", 14: "NaN" }),
    ]) {
      expect(() => parseHL7(MSH + PID + body + "\rOBR|1|A|B|X^^L\r").orders()).not.toThrow();
    }
  });

  it("adds no new warning code (Phase M is a pure additive read surface)", () => {
    const msg = parseHL7(loadFixture("tq1-bid"));
    expect(msg.warnings).toEqual([]);
  });
});

describe("helpers/timing: explicit time + service duration (TQ1 and legacy)", () => {
  it("surfaces TQ1-4 explicit time and TQ1-6 service duration verbatim on a TQ1 segment", () => {
    const raw =
      MSH + PID + tq1({ 1: "1", 3: "QID", 4: "0800", 6: "30" }) + "\r" + "OBR|1|A|B|VITALS^^L\r";
    const t = parseHL7(raw).orders()[0]?.timings[0];
    expect(t?.explicitTime).toBe("0800");
    expect(t?.serviceDuration).toBe("30");
  });

  it("surfaces the legacy TQ.3 duration verbatim (ORC-7)", () => {
    // ORC-7 legacy TQ: quantity ^ interval ^ DURATION ^ start ^ end ...
    const raw = MSH + PID + "ORC|NW|A|B||||1^Q8H^45^20250101\rOBR|1|A|B|CBC^^L\r";
    const t = parseHL7(raw).orders()[0]?.timings[0];
    expect(t?.source).toBe("legacy");
    expect(t?.serviceDuration).toBe("45");
  });

  it("a legacy field with no timing content surfaces no timing entry", () => {
    // ORC-7 present but every component empty → not a real timing (source-only).
    const raw = MSH + PID + "ORC|NW|A|B||||^^^^^\rOBR|1|A|B|CBC^^L\r";
    expect(parseHL7(raw).orders()[0]?.timings).toEqual([]);
  });
});

describe("timing/classifyRepeatPattern: verbatim code, provenance-only kind", () => {
  it("classifies parametric Q<n><unit> templates and preserves the integer", () => {
    expect(classifyRepeatPattern("Q6H")).toEqual({
      code: "Q6H",
      kind: "parametric",
      interval: { count: 6, unit: "H" },
    });
    expect(classifyRepeatPattern("Q30M").interval).toEqual({ count: 30, unit: "M" });
    expect(classifyRepeatPattern("Q2D").interval).toEqual({ count: 2, unit: "D" });
    expect(classifyRepeatPattern("Q1W").interval).toEqual({ count: 1, unit: "W" });
    expect(classifyRepeatPattern("Q12L").interval).toEqual({ count: 12, unit: "L" });
    // Q<n>J<dow> — every N weeks on a weekday.
    expect(classifyRepeatPattern("Q1J3").interval).toEqual({ count: 1, unit: "J" });
  });

  it("preserves the verbatim code even when it has a leading-zero integer", () => {
    const r = classifyRepeatPattern("Q06H");
    expect(r.code).toBe("Q06H"); // never normalized
    expect(r.interval).toEqual({ count: 6, unit: "H" });
  });

  it("classifies recognized fixed mnemonics as named (no interval)", () => {
    for (const code of ["BID", "TID", "QID", "QOD", "QHS", "PRN", "AC", "PC"]) {
      const r = classifyRepeatPattern(code);
      expect(r).toEqual({ code, kind: "named" });
    }
    // Case-insensitive membership, but the code stays verbatim.
    expect(classifyRepeatPattern("bid")).toEqual({ code: "bid", kind: "named" });
  });

  it("surfaces an unrecognized pattern verbatim as unknown — never mapped", () => {
    for (const code of ["Q4-6H", "FOO", "EVERY_OTHER_TUESDAY", ""]) {
      expect(classifyRepeatPattern(code)).toEqual({ code, kind: "unknown" });
    }
  });
});
