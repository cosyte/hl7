/**
 * Phase 4 Plan 04 — integration tests for `msg.nextOfKin()`, `msg.allergies()`,
 * `msg.diagnoses()`, `msg.insurance()` (HELPERS-06 + HELPERS-07).
 * Plus a universal "never throws" sweep covering every Phase 4 helper.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r";
const PID = "PID|||X\r";

describe("helpers/collections: nextOfKin (HELPERS-06, NK1)", () => {
  it("returns [] when no NK1 present (D-05)", () => {
    expect(parseHL7(MSH + PID).nextOfKin()).toEqual([]);
  });

  it("builds one entry per NK1 with full field set", () => {
    const fx = MSH + PID + "NK1|1|Doe^John^^^Mr|FTH|456 Oak St^^Boston^MA|(555)111-2222||FTHR";
    const nk = parseHL7(fx).nextOfKin();
    expect(nk).toHaveLength(1);
    expect(nk[0]?.name?.familyName).toBe("Doe");
    expect(nk[0]?.name?.givenName).toBe("John");
    expect(nk[0]?.relationship?.identifier).toBe("FTH");
    expect(nk[0]?.address?.city).toBe("Boston");
    expect(nk[0]?.phone?.telephoneNumber).toBe("(555)111-2222");
    expect(nk[0]?.contactRole?.identifier).toBe("FTHR");
  });

  it("frozen + NOT memoized (D-06)", () => {
    const msg = parseHL7(MSH + PID + "NK1|1|Doe");
    const a = msg.nextOfKin();
    expect(Object.isFrozen(a)).toBe(true);
    expect(msg.nextOfKin()).not.toBe(a);
  });
});

describe("helpers/collections: allergies (HELPERS-06, AL1)", () => {
  it("returns [] when no AL1 present", () => {
    expect(parseHL7(MSH + PID).allergies()).toEqual([]);
  });

  it("builds one entry per AL1 with type/code/severity/reaction/onsetDate", () => {
    const fx = MSH + PID + "AL1|1|DA|PEN^Penicillin^DRUG|SV|Hives|20250101";
    const a = parseHL7(fx).allergies();
    expect(a).toHaveLength(1);
    expect(a[0]?.type).toBe("DA");
    expect(a[0]?.code?.identifier).toBe("PEN");
    expect(a[0]?.code?.text).toBe("Penicillin");
    expect(a[0]?.severity).toBe("SV");
    expect(a[0]?.reaction).toBe("Hives");
    expect(a[0]?.onsetDate).toBeInstanceOf(Date);
    expect(a[0]?.onsetDate?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("helpers/collections: diagnoses (HELPERS-06, DG1)", () => {
  it("returns [] when no DG1 present", () => {
    expect(parseHL7(MSH + PID).diagnoses()).toEqual([]);
  });

  it("builds one entry per DG1 with code/description/dateTime/type", () => {
    const fx = MSH + PID + "DG1|1|I10|E11.9^Type 2 diabetes^I10|Diabetes description|20250102|W";
    const d = parseHL7(fx).diagnoses();
    expect(d).toHaveLength(1);
    expect(d[0]?.code?.identifier).toBe("E11.9");
    expect(d[0]?.code?.text).toBe("Type 2 diabetes");
    expect(d[0]?.description).toBe("Diabetes description");
    expect(d[0]?.dateTime).toBeInstanceOf(Date);
    expect(d[0]?.type).toBe("W");
  });
});

describe("helpers/collections: insurance (HELPERS-06, IN1 + IN2/IN3 flags)", () => {
  it("returns [] when no IN1 present", () => {
    expect(parseHL7(MSH + PID).insurance()).toEqual([]);
  });

  it("builds one entry per IN1 with full field set", () => {
    // IN1 fields: 1 setId, 2 planId CWE, 3 companyId CX, 4 companyName (flatten),
    // 8 groupNumber, 12 effective, 13 expiration, 16 insuredName XPN, 36 policyNumber.
    const fx =
      MSH +
      PID +
      "IN1|1|PLAN^CompanyPlan^X|CO123^^^HOSP|BlueCross||||GRP001" +
      "||||20250101|20261231|||VIC^Insured" +
      "||||||||||||||||||||POLICY123";
    const ins = parseHL7(fx).insurance();
    expect(ins).toHaveLength(1);
    expect(ins[0]?.planId?.identifier).toBe("PLAN");
    expect(ins[0]?.companyId?.idNumber).toBe("CO123");
    expect(ins[0]?.companyName).toBe("BlueCross");
    expect(ins[0]?.groupNumber).toBe("GRP001");
    expect(ins[0]?.effectiveDate).toBeInstanceOf(Date);
    expect(ins[0]?.expirationDate).toBeInstanceOf(Date);
    expect(ins[0]?.insuredName?.familyName).toBe("VIC");
    expect(ins[0]?.policyNumber).toBe("POLICY123");
    expect(ins[0]?.hasIn2).toBe(false);
    expect(ins[0]?.hasIn3).toBe(false);
  });

  it("hasIn2/hasIn3 flip to true when IN2/IN3 follow IN1", () => {
    const fx = MSH + PID + "IN1|1|PLAN\rIN2|1|SSN123\rIN3|1|CERT456";
    const ins = parseHL7(fx).insurance();
    expect(ins).toHaveLength(1);
    expect(ins[0]?.hasIn2).toBe(true);
    expect(ins[0]?.hasIn3).toBe(true);
  });

  it("second IN1 gets its own hasIn2/hasIn3 independently", () => {
    const fx = MSH + PID + "IN1|1|PLAN1\rIN2|1|SSN\r" + "IN1|2|PLAN2";
    const ins = parseHL7(fx).insurance();
    expect(ins).toHaveLength(2);
    expect(ins[0]?.hasIn2).toBe(true);
    expect(ins[1]?.hasIn2).toBe(false);
  });
});

describe("helpers/collections: universal HELPERS-07 never-throws sweep", () => {
  // HELPERS-07: every helper must return undefined/[]/default on missing/malformed
  // data without throwing.
  const EMPTY_MSH_ONLY = "MSH|^~\\&|||||||ADT^A01|1|P|2.5";

  it("msg.meta never throws on minimal MSH", () => {
    expect(() => {
      const m = parseHL7(EMPTY_MSH_ONLY).meta;
      void m.type;
      void m.timestamp;
      void m.sendingApp;
    }).not.toThrow();
  });

  it("msg.patient returns undefined on no PID without throwing", () => {
    expect(() => {
      const p = parseHL7(EMPTY_MSH_ONLY).patient;
      void p?.mrn;
    }).not.toThrow();
  });

  it("msg.visit returns undefined on no PV1 without throwing", () => {
    expect(() => {
      void parseHL7(EMPTY_MSH_ONLY).visit;
    }).not.toThrow();
  });

  it("all 6 collection helpers return [] on empty input without throwing", () => {
    const msg = parseHL7(EMPTY_MSH_ONLY);
    expect(() => {
      expect(msg.observations()).toEqual([]);
      expect(msg.orders()).toEqual([]);
      expect(msg.nextOfKin()).toEqual([]);
      expect(msg.allergies()).toEqual([]);
      expect(msg.diagnoses()).toEqual([]);
      expect(msg.insurance()).toEqual([]);
    }).not.toThrow();
  });

  it("malformed segments do not crash any helper", () => {
    const fx =
      MSH +
      "PID\r" +
      "PV1\r" +
      "NK1\r" +
      "AL1\r" +
      "DG1\r" +
      "IN1\r" +
      "IN2\r" +
      "OBR\r" +
      "OBX\r" +
      "ORC";
    expect(() => {
      const msg = parseHL7(fx);
      void msg.meta;
      void msg.patient;
      void msg.visit;
      void msg.observations();
      void msg.orders();
      void msg.nextOfKin();
      void msg.allergies();
      void msg.diagnoses();
      void msg.insurance();
    }).not.toThrow();
  });
});
