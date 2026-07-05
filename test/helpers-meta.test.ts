/**
 * Phase 4 Plan 02 — integration tests for `msg.meta` (HELPERS-01).
 * Verifies the locked field list (D-03, D-18, D-22, D-23) against realistic
 * MSH fixtures. All assertions exercise the public read surface — no
 * reach-through to rawSegments.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const FULL =
  "MSH|^~\\&|SEND_APP|SEND_FAC|REC_APP|REC_FAC|20250102153045||ADT^A01^ADT_A01|MSG001|P|2.5";

const MIN_MSH = "MSH|^~\\&|||||20250102||ADT^A01|1|P|2.5";

describe("helpers/meta: msg.meta (HELPERS-01)", () => {
  it("reads MSH-9 full type string and components", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.type).toBe("ADT^A01^ADT_A01");
    expect(msg.meta.messageCode).toBe("ADT");
    expect(msg.meta.triggerEvent).toBe("A01");
    expect(msg.meta.messageStructure).toBe("ADT_A01");
  });

  it("reads MSH-10 controlId", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.controlId).toBe("MSG001");
  });

  it("reads MSH-7 timestamp as the fidelity TS (Phase N — no eager UTC)", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.timestamp).toMatchObject({
      raw: "20250102153045",
      valid: true,
      precision: "second",
      year: 2025,
      month: 1,
      day: 2,
      hour: 15,
      minute: 30,
      second: 45,
      hasTimezone: false,
    });
  });

  it("reads MSH-12 version", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.version).toBe("2.5");
  });

  it("reads MSH-3/MSH-4 sendingApp + sendingFacility", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.sendingApp).toBe("SEND_APP");
    expect(msg.meta.sendingFacility).toBe("SEND_FAC");
  });

  it("reads MSH-5/MSH-6 receivingApp + receivingFacility", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.receivingApp).toBe("REC_APP");
    expect(msg.meta.receivingFacility).toBe("REC_FAC");
  });

  it("reads MSH-11 processingId", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.processingId).toBe("P");
  });

  it("omits absent optional fields (exactOptionalPropertyTypes)", () => {
    const msg = parseHL7(MIN_MSH);
    expect("sendingApp" in msg.meta).toBe(false);
    expect("sendingFacility" in msg.meta).toBe(false);
    expect("receivingApp" in msg.meta).toBe(false);
    expect("receivingFacility" in msg.meta).toBe(false);
    expect("messageStructure" in msg.meta).toBe(false);
  });

  it("truncates MSH-9 to 'ADT^A01' when no message structure component present", () => {
    const msg = parseHL7(MIN_MSH);
    expect(msg.meta.type).toBe("ADT^A01");
    expect(msg.meta.messageCode).toBe("ADT");
    expect(msg.meta.triggerEvent).toBe("A01");
    expect("messageStructure" in msg.meta).toBe(false);
  });

  it("preserves a date-only MSH-7 at day precision (no zero-fill to midnight)", () => {
    const msg = parseHL7(MIN_MSH);
    expect(msg.meta.timestamp).toMatchObject({
      raw: "20250102",
      precision: "day",
      hasTimezone: false,
    });
    expect(msg.meta.timestamp?.hour).toBeUndefined();
  });

  it("omits timestamp when MSH-7 is unparseable (D-22)", () => {
    const msg = parseHL7("MSH|^~\\&|||||ABC||ADT^A01|1|P|2.5");
    expect("timestamp" in msg.meta).toBe(false);
  });

  it("is frozen at the top level (D-01)", () => {
    const msg = parseHL7(FULL);
    expect(Object.isFrozen(msg.meta)).toBe(true);
  });

  it("never throws on an empty MSH (HELPERS-07, D-22)", () => {
    expect(() => {
      const msg = parseHL7("MSH|^~\\&|||||||ADT^A01|1|P|2.5");
      void msg.meta.type;
      void msg.meta.timestamp;
      void msg.meta.sendingApp;
      void msg.meta.receivingFacility;
    }).not.toThrow();
  });

  it("auto-unescapes string fields (D-23)", () => {
    const msg = parseHL7("MSH|^~\\&|A\\F\\B|FAC|||20250102||ADT^A01|1|P|2.5");
    expect(msg.meta.sendingApp).toBe("A|B");
  });
});
