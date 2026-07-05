/**
 * Phase 4 Plan 03 — integration tests for `msg.observations()` (HELPERS-04,
 * HELPERS-07). Covers the D-13 value-type-discriminated union across every v1
 * valueType (NM / ST / TX / FT / TS / DT / CWE / CE / ID + unknown), D-15
 * common field shape, D-05 empty-list semantics, D-06 no-memoization, D-18
 * flat Date, and D-22 never-throws.
 */

import { describe, expect, it } from "vitest";

import type { CE } from "../src/model/types/ce.js";
import type { CWE } from "../src/model/types/cwe.js";
import type { SN } from "../src/model/types/sn.js";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|P|2.5\r";

// OBX field positions:
// 1=setId, 2=valueType, 3=identifier, 4=subId, 5=value, 6=units, 7=refRange,
// 8=abnormalFlags, 9=probability, 10=natureOfAbnormal, 11=status,
// 12=effectiveDate, 13=userDefined, 14=observedDateTime.
//
// Layout (15 fields including the segment name placeholder):
//   OBX|<setId>|<valueType>|<identifier>||<value>|<units>|<refRange>|<abnormal>||||<status>|||<observedDateTime>
function obx(valueType: string, value: string): string {
  return `OBX|1|${valueType}|GLU^Glucose^LN||${value}|mg/dL|80-110||||F|||20250102153100\r`;
}

describe("helpers/observations: msg.observations() — D-13 value-type dispatch", () => {
  it("NM → value is a number", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("NM");
    expect(o?.value).toBe(120);
  });

  it("NM unparseable → value undefined (D-22 never throws)", () => {
    const msg = parseHL7(MSH + obx("NM", "abc"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("NM");
    expect(o?.value).toBeUndefined();
  });

  it("TS → value is the fidelity TS (Phase N)", () => {
    const msg = parseHL7(MSH + obx("TS", "20250115120000"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("TS");
    expect(o?.value).toMatchObject({
      raw: "20250115120000",
      valid: true,
      precision: "second",
      year: 2025,
      month: 1,
      day: 15,
      hour: 12,
    });
  });

  it("DT → value is the fidelity TS at day precision", () => {
    const msg = parseHL7(MSH + obx("DT", "20250115"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("DT");
    expect(o?.value).toMatchObject({ raw: "20250115", precision: "day", hasTimezone: false });
  });

  it("TS unparseable → value undefined", () => {
    const msg = parseHL7(MSH + obx("TS", "NotADate"));
    expect(msg.observations()[0]?.value).toBeUndefined();
  });

  it("CWE → value is a parsed composite (D-14)", () => {
    const msg = parseHL7(MSH + obx("CWE", "E11.9^Type 2 DM^I10"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("CWE");
    if (o?.valueType === "CWE") {
      // The Observation union's final `{ valueType: string }` catch-all arm
      // prevents TS from ruling out `string` narrowing, so cast the value
      // explicitly to the CWE composite we know it is at runtime.
      const v = o.value as CWE | undefined;
      expect(v?.identifier).toBe("E11.9");
      expect(v?.text).toBe("Type 2 DM");
      expect(v?.nameOfCodingSystem).toBe("I10");
    } else {
      throw new Error("Expected CWE branch");
    }
  });

  it("CE → value is a parsed composite", () => {
    const msg = parseHL7(MSH + obx("CE", "M^Male^HL70001"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("CE");
    if (o?.valueType === "CE") {
      const v = o.value as CE | undefined;
      expect(v?.identifier).toBe("M");
      expect(v?.text).toBe("Male");
    } else {
      throw new Error("Expected CE branch");
    }
  });

  it("ST → value is a raw, auto-unescaped string", () => {
    const msg = parseHL7(MSH + obx("ST", "Hello\\F\\World"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("ST");
    expect(o?.value).toBe("Hello|World"); // \F\ → |
  });

  it("TX → value is a string", () => {
    const msg = parseHL7(MSH + obx("TX", "Note text"));
    expect(msg.observations()[0]?.value).toBe("Note text");
  });

  it("FT → value is a string", () => {
    const msg = parseHL7(MSH + obx("FT", "formatted"));
    expect(msg.observations()[0]?.value).toBe("formatted");
  });

  it("ID → value is a string", () => {
    const msg = parseHL7(MSH + obx("ID", "IDCODE"));
    expect(msg.observations()[0]?.value).toBe("IDCODE");
  });

  it("unknown valueType → value is a string and valueType preserved verbatim", () => {
    const msg = parseHL7(MSH + obx("XX", "something"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("XX");
    expect(o?.value).toBe("something");
  });

  it("empty OBX-5 → value is undefined (all branches)", () => {
    const fx = MSH + "OBX|1|NM|GLU^Glucose^LN|||mg/dL|80-110||||F|||20250102\r";
    expect(parseHL7(fx).observations()[0]?.value).toBeUndefined();
  });
});

describe("helpers/observations: shape + common fields (D-15)", () => {
  it("setId/identifier/units/referenceRange/status/observedDateTime populated", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const o = msg.observations()[0];
    expect(o?.setId).toBe("1");
    expect(o?.identifier.identifier).toBe("GLU");
    expect(o?.identifier.text).toBe("Glucose");
    expect(o?.identifier.nameOfCodingSystem).toBe("LN");
    expect(o?.units?.identifier).toBe("mg/dL");
    expect(o?.referenceRange).toBe("80-110");
    expect(o?.status).toBe("F");
    expect(o?.observedDateTime?.valid).toBe(true);
  });

  it("identifier is always present (D-15 locked — even for an empty OBX-3)", () => {
    const fx = MSH + "OBX|1|NM||||||||||F\r";
    const o = parseHL7(fx).observations()[0];
    expect(o?.identifier).toBeDefined();
    expect(Object.keys(o?.identifier ?? {}).length).toBe(0); // empty CWE
  });

  it("omits absent common fields (exactOptionalPropertyTypes)", () => {
    const fx = MSH + "OBX|||GLU^Glucose^LN\r";
    const o = parseHL7(fx).observations()[0];
    expect(o).toBeDefined();
    expect("setId" in (o ?? {})).toBe(false);
    expect("units" in (o ?? {})).toBe(false);
    expect("referenceRange" in (o ?? {})).toBe(false);
    expect("status" in (o ?? {})).toBe(false);
    expect("observedDateTime" in (o ?? {})).toBe(false);
  });
});

describe("helpers/observations: collection contract (D-05 + D-06 + HELPERS-07)", () => {
  it("returns [] when no OBX (D-05)", () => {
    const msg = parseHL7(MSH + "PID|||X");
    expect(msg.observations()).toEqual([]);
  });

  it("returns a FROZEN array", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    expect(Object.isFrozen(msg.observations())).toBe(true);
  });

  it("returns distinct references on repeat calls (D-06 NOT memoized)", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const a = msg.observations();
    const b = msg.observations();
    expect(a).not.toBe(b);
    expect(a).toStrictEqual(b);
  });

  it("never throws on any OBX shape (HELPERS-07)", () => {
    expect(() => {
      const msg = parseHL7(MSH + "OBX|||||||\r" + "OBX\r");
      void msg.observations();
    }).not.toThrow();
  });

  it("walks OBX in document order with multiple entries", () => {
    const fx = MSH + obx("NM", "120") + obx("ST", "Hello");
    const obs = parseHL7(fx).observations();
    expect(obs.length).toBe(2);
    expect(obs[0]?.valueType).toBe("NM");
    expect(obs[0]?.value).toBe(120);
    expect(obs[1]?.valueType).toBe("ST");
    expect(obs[1]?.value).toBe("Hello");
  });
});

describe("helpers/observations: SN structured-numeric (Phase B, D-13)", () => {
  it("SN comparator+value is typed, not flattened to the bare comparator string", () => {
    const msg = parseHL7(MSH + obx("SN", "<^10"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("SN");
    // The bug this phase fixes: `<^10` must NOT collapse to the string "<".
    expect(typeof o?.value).toBe("object");
    if (o?.valueType === "SN") {
      const v = o.value as SN | undefined;
      expect(v?.comparator).toBe("<");
      expect(v?.num1).toBe(10);
    } else {
      throw new Error("Expected SN branch");
    }
  });

  it("SN range is typed (num1/separator/num2)", () => {
    const msg = parseHL7(MSH + obx("SN", "^100^-^200"));
    const o = msg.observations()[0];
    if (o?.valueType === "SN") {
      const v = o.value as SN | undefined;
      expect(v?.num1).toBe(100);
      expect(v?.separatorOrSuffix).toBe("-");
      expect(v?.num2).toBe(200);
    } else {
      throw new Error("Expected SN branch");
    }
  });

  it("malformed SN → value undefined (never a wrong number)", () => {
    const msg = parseHL7(MSH + obx("SN", "garbage"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("SN");
    expect(o?.value).toBeUndefined();
  });

  it("the inner SN value object is frozen (D-01 deep immutability)", () => {
    const msg = parseHL7(MSH + obx("SN", ">^90"));
    const o = msg.observations()[0];
    expect(Object.isFrozen(o?.value)).toBe(true);
  });
});

describe("helpers/observations: OBX-6 UCUM flag (Phase B)", () => {
  it("unitsAreUcum is true when OBX-6 CWE.3 == UCUM", () => {
    const fx = MSH + "OBX|1|NM|GLU^Glucose^LN||120|mg/dL^^UCUM|80-110||||F\r";
    const o = parseHL7(fx).observations()[0];
    expect(o?.units?.identifier).toBe("mg/dL");
    expect(o?.unitsAreUcum).toBe(true);
  });

  it("unitsAreUcum is false when a unit is present but not declared UCUM (surfaced as-is)", () => {
    // The default obx() fixture sends `mg/dL` with no coding system.
    const o = parseHL7(MSH + obx("NM", "120")).observations()[0];
    expect(o?.units?.identifier).toBe("mg/dL");
    expect(o?.unitsAreUcum).toBe(false);
  });

  it("unitsAreUcum is OMITTED entirely when OBX-6 is absent", () => {
    const fx = MSH + "OBX|1|NM|GLU^Glucose^LN||120||80-110||||F\r";
    const o = parseHL7(fx).observations()[0];
    expect("units" in (o ?? {})).toBe(false);
    expect("unitsAreUcum" in (o ?? {})).toBe(false);
  });
});

describe("helpers/observations: buildObservation export (Plan 04 reuse)", () => {
  it("observations()[0] shape matches per-segment behavior", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const obx0 = msg.segments("OBX")[0];
    expect(obx0).toBeDefined();
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("NM");
    expect(o?.value).toBe(120);
    expect(o?.setId).toBe("1");
  });

  it("each observation is frozen (D-01)", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const o = msg.observations()[0];
    expect(Object.isFrozen(o)).toBe(true);
  });
});
