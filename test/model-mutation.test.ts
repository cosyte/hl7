/**
 * Mutation API tests — cover setField/addSegment/removeSegment:
 * - D-15 chainability (returns `this`)
 * - D-16 frozen warnings preserved across mutations
 * - D-17 cache invalidation
 * - D-18 minimal setField validation
 * - D-19 addSegment / removeSegment name regex
 * - Auto-create missing rep/comp/sub within existing field; throw on missing segment
 * - removeSegment occurrence / all / no-op / MSH-protected / name-shape rejection
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "EVN|A01|20250101\r" +
  "PID|||123|ALT~ALT2|Smith^Jane|||F\r" +
  "OBX|1|TX|GLUC|1|120\r" +
  "OBX|2|TX|HGB|2|14.0";

describe("model/message: setField", () => {
  it("is chainable", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.setField("PID.8", "M")).toBe(msg);
  });

  it("mutates a field visible on next read", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.get("PID.8")).toBe("F");
    msg.setField("PID.8", "M");
    expect(msg.get("PID.8")).toBe("M");
  });

  it("mutates a component at PID.5.1", () => {
    const msg = parseHL7(FIXTURE);
    msg.setField("PID.5.1", "Jones");
    expect(msg.get("PID.5.1")).toBe("Jones");
  });

  it("creates missing subcomponents within an existing component", () => {
    const msg = parseHL7(FIXTURE);
    msg.setField("PID.5.1.2", "sub-val");
    expect(msg.get("PID.5.1.2")).toBe("sub-val");
  });

  it("creates missing repetitions within an existing field", () => {
    const msg = parseHL7(FIXTURE);
    msg.setField("PID.4[2].1", "ALT3");
    expect(msg.get("PID.4[2].1")).toBe("ALT3");
  });

  it("throws TypeError on missing segment (no auto-create)", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.setField("NOT.5", "x")).toThrow(TypeError);
  });

  it("bubbles parsePath TypeErrors on malformed paths", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.setField("pid.5", "x")).toThrow(TypeError);
  });

  it("invalidates the segment-type cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.segments("PID");
    msg.setField("PID.8", "M");
    const after = msg.segments("PID");
    expect(after).not.toBe(before);
    expect(after[0]?.field(8).value).toBe("M");
  });

  it("does not touch warnings (still frozen, same reference)", () => {
    const msg = parseHL7(FIXTURE);
    const warningsRef = msg.warnings;
    msg.setField("PID.8", "M");
    expect(msg.warnings).toBe(warningsRef);
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });
});

describe("model/message: addSegment", () => {
  it("is chainable and appends a segment", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.addSegment("NTE", ["", "note"])).toBe(msg);
    expect(msg.segments("NTE")).toHaveLength(1);
    expect(msg.get("NTE.2")).toBe("note");
  });

  it("accepts Z-segment names (D-19)", () => {
    const msg = parseHL7(FIXTURE);
    msg.addSegment("ZPI", ["", "custom"]);
    expect(msg.segments("ZPI")).toHaveLength(1);
  });

  it("accepts Z1A (Z + digit + letter)", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.addSegment("Z1A", [])).not.toThrow();
  });

  it.each(["lowercase", "AB", "ABCD", "123", ""])("rejects invalid segment name %s", (bad) => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.addSegment(bad, [])).toThrow(TypeError);
  });

  it("appends at the end (preserves document order)", () => {
    const msg = parseHL7(FIXTURE);
    msg.addSegment("NTE", ["", "note"]);
    const all = msg.allSegments();
    expect(all[all.length - 1]?.type).toBe("NTE");
  });

  it("allows an empty segment (only the name placeholder)", () => {
    const msg = parseHL7(FIXTURE);
    msg.addSegment("NTE", []);
    expect(msg.segments("NTE")[0]?.raw.fields).toHaveLength(1);
  });
});

describe("model/message: removeSegment", () => {
  it("removes the first occurrence by default", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.segments("OBX")).toHaveLength(2);
    msg.removeSegment("OBX");
    expect(msg.segments("OBX")).toHaveLength(1);
    expect(msg.segments("OBX")[0]?.field(3).value).toBe("HGB");
  });

  it("removes by 0-indexed occurrence", () => {
    const msg = parseHL7(FIXTURE);
    msg.removeSegment("OBX", 1);
    expect(msg.segments("OBX")).toHaveLength(1);
    expect(msg.segments("OBX")[0]?.field(3).value).toBe("GLUC");
  });

  it("removes all with { all: true }", () => {
    const msg = parseHL7(FIXTURE);
    msg.removeSegment("OBX", { all: true });
    expect(msg.segments("OBX")).toHaveLength(0);
  });

  it("refuses to remove MSH", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.removeSegment("MSH")).toThrow(TypeError);
  });

  it("is a no-op for unknown segment types", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.allSegments().length;
    expect(() => msg.removeSegment("NOT")).not.toThrow();
    expect(msg.allSegments()).toHaveLength(before);
  });

  it("rejects invalid segment name shape", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.removeSegment("lowercase")).toThrow(TypeError);
  });

  it("invalidates caches", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.segments("OBX");
    msg.removeSegment("OBX");
    expect(msg.segments("OBX")).not.toBe(before);
  });
});

describe("model/message: chainability", () => {
  it("chains setField → addSegment → removeSegment", () => {
    const msg = parseHL7(FIXTURE);
    const result = msg
      .setField("PID.8", "M")
      .addSegment("NTE", ["", "chained note"])
      .removeSegment("EVN");
    expect(result).toBe(msg);
    expect(msg.get("PID.8")).toBe("M");
    expect(msg.get("NTE.2")).toBe("chained note");
    expect(msg.segments("EVN")).toHaveLength(0);
  });

  it("warnings frozen after all mutations (D-16)", () => {
    const msg = parseHL7(FIXTURE);
    const warningsRef = msg.warnings;
    msg.setField("PID.8", "M").addSegment("NTE", [""]).removeSegment("EVN");
    expect(msg.warnings).toBe(warningsRef);
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });
});
