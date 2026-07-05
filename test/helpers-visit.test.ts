/**
 * Phase 4 Plan 03 — integration tests for `msg.visit` (HELPERS-03 + HELPERS-07).
 * Verifies the 7 locked fields (patientClass, location, admitDateTime,
 * dischargeDateTime, attendingDoctor, referringDoctor, visitNumber), D-04
 * nullable (undefined on missing PV1), D-18 flat Date, D-24 option (a) XCN
 * for doctors, D-01 frozen, and HELPERS-07 never-throws.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r";
const PID = "PID|||X|||Smith^Jane\r";

// PV1 positions (HL7 v2.5): 1=setId, 2=patientClass, 3=assignedPatientLocation,
// 7=attendingDoctor, 8=referringDoctor, 19=visitNumber, 44=admitDateTime,
// 45=dischargeDateTime.
// Build FULL_PV1 by concatenating field groups separated by "|".
// Pipe count matters — each "|" advances the field index by 1.
const FULL_PV1 =
  "PV1|" + // segment name — field 0 is the name, field 1 starts after first "|"
  "1|" + // 1 setId
  "I|" + // 2 patientClass
  "ICU^101^A^HOSP|" + // 3 location (PL)
  "|" + // 4
  "|" + // 5
  "|" + // 6
  "XCN123^Doe^John^^^^MD^^HOSP^L^^^NPI|" + // 7 attendingDoctor
  "XCN999^Referrer^Mary|" + // 8 referringDoctor
  "|||||||||" + // 9-17
  "|" + // 18
  "VISIT001|" + // 19 visitNumber
  "||||||||||||||||||||||||" + // 20-43 (24 pipes → 24 empty fields)
  "20250102153045|" + // 44 admitDateTime
  "20250103120000"; // 45 dischargeDateTime

const FULL = MSH + PID + FULL_PV1;
const NO_PV1 = MSH + PID;
const MIN_PV1 = MSH + PID + "PV1|1|O";

describe("helpers/visit: msg.visit (HELPERS-03)", () => {
  it("returns undefined when no PV1 exists (HELPERS-03 nullable)", () => {
    expect(parseHL7(NO_PV1).visit).toBeUndefined();
  });

  it("returns a frozen Visit object when PV1 exists (D-01)", () => {
    const v = parseHL7(FULL).visit;
    expect(v).toBeDefined();
    expect(Object.isFrozen(v)).toBe(true);
  });

  it("exposes PV1-2 patientClass as a flat string", () => {
    expect(parseHL7(FULL).visit?.patientClass).toBe("I");
  });

  it("exposes PV1-3 location as PL", () => {
    const loc = parseHL7(FULL).visit?.location;
    expect(loc?.pointOfCare).toBe("ICU");
    expect(loc?.room).toBe("101");
    expect(loc?.bed).toBe("A");
    expect(loc?.facility?.namespaceId).toBe("HOSP");
  });

  it("exposes PV1-7 attendingDoctor as XCN (D-24 option a)", () => {
    const doc = parseHL7(FULL).visit?.attendingDoctor;
    expect(doc?.idNumber).toBe("XCN123");
    expect(doc?.familyName).toBe("Doe");
    expect(doc?.givenName).toBe("John");
    expect(doc?.degree).toBe("MD");
    expect(doc?.assigningAuthority?.namespaceId).toBe("HOSP");
    expect(doc?.nameTypeCode).toBe("L");
    expect(doc?.identifierTypeCode).toBe("NPI");
  });

  it("exposes PV1-8 referringDoctor as XCN", () => {
    const doc = parseHL7(FULL).visit?.referringDoctor;
    expect(doc?.idNumber).toBe("XCN999");
    expect(doc?.familyName).toBe("Referrer");
    expect(doc?.givenName).toBe("Mary");
  });

  it("exposes PV1-19 visitNumber as a lean flat string", () => {
    expect(parseHL7(FULL).visit?.visitNumber).toBe("VISIT001");
  });

  it("exposes PV1-44 admitDateTime as the fidelity TS (Phase N)", () => {
    const v = parseHL7(FULL).visit;
    expect(v?.admitDateTime).toMatchObject({
      raw: "20250102153045",
      precision: "second",
      year: 2025,
      month: 1,
      day: 2,
      hasTimezone: false,
    });
  });

  it("exposes PV1-45 dischargeDateTime as the fidelity TS", () => {
    const v = parseHL7(FULL).visit;
    expect(v?.dischargeDateTime).toMatchObject({ raw: "20250103120000", precision: "second" });
  });

  it("omits absent fields (exactOptionalPropertyTypes)", () => {
    const v = parseHL7(MIN_PV1).visit;
    expect(v?.patientClass).toBe("O");
    expect("location" in (v ?? {})).toBe(false);
    expect("attendingDoctor" in (v ?? {})).toBe(false);
    expect("referringDoctor" in (v ?? {})).toBe(false);
    expect("admitDateTime" in (v ?? {})).toBe(false);
    expect("dischargeDateTime" in (v ?? {})).toBe(false);
    expect("visitNumber" in (v ?? {})).toBe(false);
  });

  it("never throws on any PV1 content (HELPERS-07)", () => {
    expect(() => {
      const v = parseHL7(MIN_PV1).visit;
      void v?.patientClass;
      void v?.location;
      void v?.attendingDoctor;
      void v?.referringDoctor;
      void v?.admitDateTime;
      void v?.dischargeDateTime;
      void v?.visitNumber;
    }).not.toThrow();
  });

  it("returns the same reference across reads (D-02 memoization)", () => {
    const msg = parseHL7(FULL);
    expect(msg.visit).toBe(msg.visit);
  });
});
