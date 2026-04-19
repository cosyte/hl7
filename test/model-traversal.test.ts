import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "PID|||123||Smith\\F\\Jr^Jane\r" +
  "OBX|1|TX|GLUC|1|120|mg/dL\r" +
  "OBX|2|TX|HGB|2|14.0|g/dL\r" +
  "OBX|3|TX|PLT|3|200|K/uL";

describe("model/message: traversal methods", () => {
  it("msg.get resolves dot-paths (delegates to resolvePath)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.get("PID.5.1")).toBe("Smith|Jr");
  });

  it("msg.get returns undefined for a missing path", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.get("NOT.9")).toBeUndefined();
  });

  it("msg.getAll returns [] when no segment of that type exists", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.getAll("NK1")).toEqual([]);
  });

  it("msg.getAll returns all segments of that type in document order", () => {
    const msg = parseHL7(FIXTURE);
    const obx = msg.getAll("OBX");
    expect(obx).toHaveLength(3);
    expect(obx[0]?.field(3).value).toBe("GLUC");
    expect(obx[1]?.field(3).value).toBe("HGB");
    expect(obx[2]?.field(3).value).toBe("PLT");
  });

  it("msg.segments is cached — same array reference across calls (D-11)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.segments("OBX")).toBe(msg.segments("OBX"));
  });

  it("individual Segment instances are stable (D-11)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.segments("OBX")[0]).toBe(msg.segments("OBX")[0]);
  });

  it("getAll and segments return the same array reference (D-07)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.getAll("OBX")).toBe(msg.segments("OBX"));
  });

  it("msg.allSegments returns every segment in document order", () => {
    const msg = parseHL7(FIXTURE);
    const all = msg.allSegments();
    expect(all).toHaveLength(5);
    expect(all[0]?.type).toBe("MSH");
    expect(all[1]?.type).toBe("PID");
    expect(all[2]?.type).toBe("OBX");
    expect(all[3]?.type).toBe("OBX");
    expect(all[4]?.type).toBe("OBX");
  });

  it("msg.allSegments is cached", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.allSegments()).toBe(msg.allSegments());
  });

  it("Segment wrappers are stable across segments() and allSegments() caches", () => {
    const msg = parseHL7(FIXTURE);
    const fromSegments = msg.segments("OBX")[0];
    const fromAll = msg.allSegments().find((s) => s.type === "OBX");
    expect(fromSegments).toBe(fromAll);
  });

  it("warnings remain frozen after traversal", () => {
    const msg = parseHL7(FIXTURE);
    msg.get("PID.5.1");
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });

  it("rawSegments is still accessible for direct raw-tree access", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.rawSegments).toBeDefined();
    expect(msg.rawSegments.length).toBe(5);
    expect(msg.rawSegments[0]?.name).toBe("MSH");
  });
});
