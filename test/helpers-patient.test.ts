/**
 * Phase 4 Plan 02 — integration tests for `msg.patient` (HELPERS-02 +
 * HELPERS-07). Verifies D-04 undefined-on-no-PID, D-07/D-08 MRN pick, D-17
 * Western fullName, D-18 flat Date, D-19 locked name shortcuts, D-20 phones
 * concat, D-01 frozen, D-23 auto-unescape, HELPERS-07 never-throw.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5";

const FULL =
  `${MSH}\r` +
  "PID|||MRN123^^^HOSP^MR~ALT456|||Smith^Jane^Q^Jr^Mrs^MD||19800115|F||" +
  "|123 Main St^Apt 4^Boston^MA^02101^USA||" +
  "(555)555-1234^PRN^PH~(555)555-5678^WPN^PH";

const NO_PID = MSH;
const MIN_PID = `${MSH}\r` + "PID|||";

describe("helpers/patient: msg.patient (HELPERS-02)", () => {
  it("returns undefined when no PID exists (D-04)", () => {
    expect(parseHL7(NO_PID).patient).toBeUndefined();
  });

  it("returns a frozen Patient when PID exists (D-01)", () => {
    const p = parseHL7(FULL).patient;
    expect(p).toBeDefined();
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("picks MR-typed MRN from PID-3 (D-07)", () => {
    expect(parseHL7(FULL).patient?.mrn).toBe("MRN123");
  });

  it("falls back to first CX.idNumber when no MR-typed CX (D-08)", () => {
    const fx = `${MSH}\r` + "PID|||X1~ALT";
    expect(parseHL7(fx).patient?.mrn).toBe("X1");
  });

  it("MR match is case-sensitive — lowercase 'mr' falls back (D-10)", () => {
    const fx = `${MSH}\r` + "PID|||ALT~MRN^^^HOSP^mr";
    expect(parseHL7(fx).patient?.mrn).toBe("ALT");
  });

  it("exposes PID-3 identifiers as a frozen readonly CX[] (D-09)", () => {
    const p = parseHL7(FULL).patient;
    expect(p?.identifiers).toHaveLength(2);
    expect(p?.identifiers[0]?.idNumber).toBe("MRN123");
    expect(p?.identifiers[0]?.identifierTypeCode).toBe("MR");
    expect(p?.identifiers[1]?.idNumber).toBe("ALT456");
    expect(Object.isFrozen(p?.identifiers)).toBe(true);
  });

  it("returns empty identifiers array when PID-3 is absent", () => {
    const p = parseHL7(MIN_PID).patient;
    expect(p?.identifiers).toEqual([]);
    expect(Object.isFrozen(p?.identifiers)).toBe(true);
  });

  it("exposes XPN name via .name and flat familyName/givenName/middleName (D-19)", () => {
    const p = parseHL7(FULL).patient;
    expect(p?.name.familyName).toBe("Smith");
    expect(p?.name.givenName).toBe("Jane");
    expect(p?.name.secondName).toBe("Q");
    expect(p?.name.suffix).toBe("Jr");
    expect(p?.familyName).toBe("Smith");
    expect(p?.givenName).toBe("Jane");
    expect(p?.middleName).toBe("Q"); // mapped from XPN.secondName per D-19
  });

  it("returns empty XPN ({}) for .name when PID-5 is absent", () => {
    const p = parseHL7(MIN_PID).patient;
    expect(p?.name).toEqual({});
    expect("familyName" in (p ?? {})).toBe(false);
    expect("givenName" in (p ?? {})).toBe(false);
    expect("middleName" in (p ?? {})).toBe(false);
  });

  it("composes fullName in Western order (D-17)", () => {
    expect(parseHL7(FULL).patient?.fullName).toBe("Jane Q Smith, Jr");
  });

  it("fullName omits missing parts cleanly — no double spaces", () => {
    const fx = `${MSH}\r` + "PID|||X|||Smith^Jane";
    expect(parseHL7(fx).patient?.fullName).toBe("Jane Smith");
  });

  it("fullName with only familyName drops the trailing comma", () => {
    const fx = `${MSH}\r` + "PID|||X|||Smith";
    expect(parseHL7(fx).patient?.fullName).toBe("Smith");
  });

  it("fullName with only suffix has no leading comma", () => {
    const fx = `${MSH}\r` + "PID|||X|||^^^Jr";
    expect(parseHL7(fx).patient?.fullName).toBe("Jr");
  });

  it("fullName is absent when XPN has no usable parts", () => {
    const p = parseHL7(MIN_PID).patient;
    expect("fullName" in (p ?? {})).toBe(false);
  });

  it("exposes flat Date for dateOfBirth (D-18)", () => {
    const p = parseHL7(FULL).patient;
    expect(p?.dateOfBirth).toBeInstanceOf(Date);
    expect(p?.dateOfBirth?.toISOString()).toBe("1980-01-15T00:00:00.000Z");
  });

  it("omits dateOfBirth when PID-7 is absent", () => {
    const p = parseHL7(MIN_PID).patient;
    expect("dateOfBirth" in (p ?? {})).toBe(false);
  });

  it("exposes sex as a flat string from PID-8", () => {
    expect(parseHL7(FULL).patient?.sex).toBe("F");
  });

  it("omits sex when PID-8 is absent", () => {
    const p = parseHL7(MIN_PID).patient;
    expect("sex" in (p ?? {})).toBe(false);
  });

  it("exposes address as XAD (D-19)", () => {
    const addr = parseHL7(FULL).patient?.address;
    expect(addr).toBeDefined();
    expect(addr?.street).toBe("123 Main St");
    expect(addr?.city).toBe("Boston");
    expect(addr?.stateOrProvince).toBe("MA");
    expect(addr?.zipOrPostalCode).toBe("02101");
    expect(addr?.country).toBe("USA");
  });

  it("omits address when PID-11 is absent", () => {
    const p = parseHL7(MIN_PID).patient;
    expect("address" in (p ?? {})).toBe(false);
  });

  it("concatenates PID-13 + PID-14 into frozen phoneNumbers (D-20)", () => {
    const phones = parseHL7(FULL).patient?.phoneNumbers;
    expect(phones).toHaveLength(2);
    expect(phones?.[0]?.telephoneNumber).toBe("(555)555-1234");
    expect(phones?.[0]?.telecommunicationUseCode).toBe("PRN");
    expect(phones?.[1]?.telephoneNumber).toBe("(555)555-5678");
    expect(phones?.[1]?.telecommunicationUseCode).toBe("WPN");
    expect(Object.isFrozen(phones)).toBe(true);
  });

  it("returns empty phoneNumbers array when PID-13 + PID-14 absent", () => {
    const p = parseHL7(MIN_PID).patient;
    expect(p?.phoneNumbers).toEqual([]);
    expect(Object.isFrozen(p?.phoneNumbers)).toBe(true);
  });

  it("PID-13 home phone alone produces a one-element phoneNumbers array", () => {
    const fx = `${MSH}\r` + "PID|||X|||||||||||(555)123-4567^PRN^PH";
    const phones = parseHL7(fx).patient?.phoneNumbers;
    expect(phones).toHaveLength(1);
    expect(phones?.[0]?.telephoneNumber).toBe("(555)123-4567");
  });

  it("never throws on any absent optional fields (HELPERS-07, D-22)", () => {
    expect(() => {
      const p = parseHL7(MIN_PID).patient;
      void p?.mrn;
      void p?.fullName;
      void p?.dateOfBirth;
      void p?.address;
      void p?.race;
      void p?.ethnicity;
      void p?.language;
    }).not.toThrow();
  });

  it("auto-unescapes string fields (D-23)", () => {
    const fx = `${MSH}\r` + "PID|||X|||O\\F\\Brien^Patrick";
    const p = parseHL7(fx).patient;
    expect(p?.familyName).toBe("O|Brien"); // \F\ → "|"
    expect(p?.givenName).toBe("Patrick");
  });
});
