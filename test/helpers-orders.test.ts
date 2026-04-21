/**
 * Phase 4 Plan 04 — integration tests for `msg.orders()` (HELPERS-05, HELPERS-07).
 * Covers D-12 positional OBX grouping + ORC orderControl attachment.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORM^O01|1|P|2.5\r";
const PID = "PID|||X\r";

const TWO_ORDERS =
  MSH +
  PID +
  "ORC|NW\r" +
  "OBR|1|PLACER1|FILLER1|GLU^Glucose^LN||||||||||||XCN1^Doe^John\r" +
  "OBX|1|NM|GLU^Glucose^LN||120|mg/dL\r" +
  "OBX|2|NM|CR^Creatinine^LN||1.0|mg/dL\r" +
  "OBR|2|PLACER2|FILLER2|HGB^Hemoglobin^LN\r" +
  "OBX|1|NM|HGB^Hemoglobin^LN||14.5|g/dL";

describe("helpers/orders: msg.orders() — HELPERS-05", () => {
  it("returns [] when no OBR present (D-05)", () => {
    const msg = parseHL7(MSH + PID);
    expect(msg.orders()).toEqual([]);
  });

  it("groups 2 orders from 2 OBRs with 2 + 1 OBX", () => {
    const orders = parseHL7(TWO_ORDERS).orders();
    expect(orders).toHaveLength(2);
    expect(orders[0]?.observations).toHaveLength(2);
    expect(orders[1]?.observations).toHaveLength(1);
  });

  it("populates placerOrderNumber/fillerOrderNumber (D-16)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.placerOrderNumber).toBe("PLACER1");
    expect(o?.fillerOrderNumber).toBe("FILLER1");
  });

  it("populates universalServiceId as CWE (D-16)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.universalServiceId?.identifier).toBe("GLU");
    expect(o?.universalServiceId?.text).toBe("Glucose");
    expect(o?.universalServiceId?.nameOfCodingSystem).toBe("LN");
  });

  it("attaches ORC-1 as orderControl when ORC precedes OBR (D-16)", () => {
    const orders = parseHL7(TWO_ORDERS).orders();
    expect(orders[0]?.orderControl).toBe("NW");
    // Second OBR has no preceding ORC — orderControl absent.
    expect("orderControl" in (orders[1] ?? {})).toBe(false);
  });

  it("populates orderedBy as XCN (OBR-16, D-24 option a)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.orderedBy?.idNumber).toBe("XCN1");
    expect(o?.orderedBy?.familyName).toBe("Doe");
    expect(o?.orderedBy?.givenName).toBe("John");
  });

  it("embeds OBX as Observation[] via buildObservation (D-12)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.observations[0]?.valueType).toBe("NM");
    expect(o?.observations[0]?.value).toBe(120);
    expect(o?.observations[0]?.identifier.identifier).toBe("GLU");
  });

  it("OBX before any OBR is NOT attached to an order (D-12)", () => {
    const fx =
      MSH + PID + "OBX|1|NM|EARLY^Early^X||42\r" + "OBR|1|P|F|SVC\r" + "OBX|1|NM|IN^InOrder^X||7";
    const msg = parseHL7(fx);
    const orders = msg.orders();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.observations).toHaveLength(1);
    expect(orders[0]?.observations[0]?.value).toBe(7);
    // But msg.observations() still sees both OBX
    expect(msg.observations()).toHaveLength(2);
  });

  it("OBR with no OBX → empty observations array", () => {
    const fx = MSH + PID + "OBR|1|P|F|SVC";
    const o = parseHL7(fx).orders()[0];
    expect(o?.observations).toEqual([]);
    expect(Object.isFrozen(o?.observations)).toBe(true);
  });

  it("trailing ORC without OBR is dropped", () => {
    const fx = MSH + PID + "OBR|1|P|F|SVC\r" + "OBX|1|NM|X||1\r" + "ORC|CA";
    const orders = parseHL7(fx).orders();
    expect(orders).toHaveLength(1); // No phantom order from trailing ORC.
    expect("orderControl" in (orders[0] ?? {})).toBe(false);
  });

  it("returned array is frozen and not memoized (D-06)", () => {
    const msg = parseHL7(TWO_ORDERS);
    const a = msg.orders();
    const b = msg.orders();
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).toStrictEqual(b);
  });

  it("never throws on malformed OBR/OBX (HELPERS-07)", () => {
    expect(() => {
      const msg = parseHL7(MSH + PID + "OBR\r" + "OBX\r");
      void msg.orders();
    }).not.toThrow();
  });
});
