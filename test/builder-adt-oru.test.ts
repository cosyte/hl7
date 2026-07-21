/**
 * Tests for the Phase T typed message builders `buildAdt` / `buildOru`.
 *
 * Acceptance exercised here (roadmap Phase T):
 *   - **spec-clean golden** — the builder emits byte-for-byte the recorded
 *     golden for fixed inputs.
 *   - **zero-warning + structurally complete** — a built message re-parses with
 *     `warnings: []` and `msg.structure.missingGroups` empty.
 *   - **emit ∘ parse identity** — `parse → typed → buildX(typed) → parse`
 *     preserves the modelled fields.
 *   - **never fabricate** — required-but-absent inputs are a typed error; an
 *     omitted optional field is never defaulted.
 *
 * All values are synthetic.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildAdt,
  buildOru,
  parseHL7,
  type BuildAdtInit,
  type BuildOruInit,
} from "../src/index.js";

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/build/${name}`, import.meta.url)), "utf8");
}

/** Serialize to the diff-friendly `\n`-joined form the goldens are stored in. */
function toGoldenForm(hl7: string): string {
  return hl7.replaceAll("\r", "\n") + "\n";
}

const ADT_INIT: BuildAdtInit = {
  sendingApp: "CLINIC",
  sendingFacility: "MAIN",
  receivingApp: "LAB",
  receivingFacility: "REF",
  controlId: "CTRL0000001",
  timestamp: "20260721101500",
  version: "2.5",
  processingId: "P",
  event: { recordedDateTime: "20260721101500" },
  patient: {
    setId: "1",
    identifiers: [
      { idNumber: "MRN001", assigningAuthority: { namespaceId: "HOSP" }, identifierTypeCode: "MR" },
    ],
    name: { familyName: "Test", givenName: "Jane" },
    birthDateTime: "19880705",
    administrativeSex: "F",
    address: {
      street: "123 Main St",
      city: "Boston",
      stateOrProvince: "MA",
      zipOrPostalCode: "02101",
    },
  },
  visit: {
    patientClass: "I",
    assignedLocation: { pointOfCare: "ICU", room: "1", bed: "A" },
    attendingDoctor: {
      idNumber: "9990",
      familyName: "Welby",
      givenName: "Marcus",
      identifierTypeCode: "NPI",
    },
    visitNumber: { idNumber: "V123", identifierTypeCode: "VN" },
    admitDateTime: "202607210900",
  },
};

const ORU_INIT: BuildOruInit = {
  sendingApp: "LAB",
  sendingFacility: "MAIN",
  receivingApp: "EHR",
  receivingFacility: "HOSP",
  controlId: "CTRL0000002",
  timestamp: "20260721101500",
  version: "2.5",
  processingId: "P",
  patient: {
    identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
    name: { familyName: "Test", givenName: "Jane" },
    birthDateTime: "19880705",
    administrativeSex: "F",
  },
  order: {
    setId: "1",
    universalServiceId: {
      identifier: "CBC",
      text: "Complete Blood Count",
      nameOfCodingSystem: "L",
    },
    observationDateTime: "202607210800",
    resultStatus: "F",
  },
  observations: [
    {
      setId: "1",
      valueType: "NM",
      identifier: { identifier: "WBC", text: "White Blood Cells", nameOfCodingSystem: "LN" },
      value: "7.2",
      units: { identifier: "10*3/uL" },
      referenceRange: "4.0-11.0",
      abnormalFlags: "N",
      observationResultStatus: "F",
    },
    {
      setId: "2",
      valueType: "NM",
      identifier: { identifier: "HGB", text: "Hemoglobin", nameOfCodingSystem: "LN" },
      value: "13.5",
      units: { identifier: "g/dL" },
      referenceRange: "12.0-16.0",
      abnormalFlags: "N",
      observationResultStatus: "F",
    },
  ],
};

describe("buildAdt", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildAdt("A01", ADT_INIT).toString())).toBe(golden("adt-a01.golden.hl7"));
  });

  it("re-parses with zero warnings", () => {
    const round = parseHL7(buildAdt("A01", ADT_INIT).toString());
    expect(round.warnings).toEqual([]);
  });

  it("is structurally complete (no missing required groups)", () => {
    const round = parseHL7(buildAdt("A01", ADT_INIT).toString());
    expect(round.structure.recognized).toBe(true);
    expect(round.structure.missingGroups).toEqual([]);
  });

  it("reads back the supplied typed fields (patient + visit)", () => {
    const round = parseHL7(buildAdt("A01", ADT_INIT).toString());
    expect(round.meta.type).toBe("ADT^A01");
    expect(round.patient?.familyName).toBe("Test");
    expect(round.patient?.givenName).toBe("Jane");
    expect(round.patient?.mrn).toBe("MRN001");
    expect(round.visit?.patientClass).toBe("I");
  });

  it("emit ∘ parse identity: parse → typed → rebuild → parse preserves modelled fields", () => {
    const first = parseHL7(buildAdt("A01", ADT_INIT).toString());
    const rebuilt = buildAdt("A01", {
      controlId: "CTRL0000001",
      timestamp: "20260721101500",
      patient: {
        setId: "1",
        identifiers: [
          {
            idNumber: first.patient?.mrn ?? "",
            assigningAuthority: { namespaceId: "HOSP" },
            identifierTypeCode: "MR",
          },
        ],
        name: {
          familyName: first.patient?.familyName ?? "",
          givenName: first.patient?.givenName ?? "",
        },
        birthDateTime: first.patient?.dateOfBirth?.raw ?? "",
        administrativeSex: "F",
        address: {
          street: "123 Main St",
          city: "Boston",
          stateOrProvince: "MA",
          zipOrPostalCode: "02101",
        },
      },
      visit: { patientClass: first.visit?.patientClass ?? "" },
    });
    const second = parseHL7(rebuilt.toString());
    expect(second.patient?.mrn).toBe(first.patient?.mrn);
    expect(second.patient?.familyName).toBe(first.patient?.familyName);
    expect(second.patient?.dateOfBirth?.raw).toBe(first.patient?.dateOfBirth?.raw);
    expect(second.visit?.patientClass).toBe(first.visit?.patientClass);
  });

  it("recognizes multiple ADT triggers as structurally complete", () => {
    for (const ev of ["A01", "A04", "A08", "A02", "A03"]) {
      const round = parseHL7(buildAdt(ev, ADT_INIT).toString());
      expect(round.warnings).toEqual([]);
      expect(round.structure.missingGroups).toEqual([]);
    }
  });

  it("never fabricates: an omitted optional PID field stays absent", () => {
    const msg = buildAdt("A01", { patient: { name: { familyName: "Solo" } } });
    const round = parseHL7(msg.toString());
    expect(round.patient?.familyName).toBe("Solo");
    expect(round.patient?.dateOfBirth).toBeUndefined();
    expect(round.get("PID.8")).toBeUndefined();
    // PV1 is still present (structural fail-safe) but empty of fabricated data.
    expect(round.segments("PV1").length).toBe(1);
    expect(round.visit?.patientClass).toBeUndefined();
    expect(round.warnings).toEqual([]);
    expect(round.structure.missingGroups).toEqual([]);
  });

  it("throws a typed error when patient is absent", () => {
    // @ts-expect-error — patient is required
    expect(() => buildAdt("A01", {})).toThrow(TypeError);
  });

  it("throws a typed error when the event is empty", () => {
    expect(() => buildAdt("", ADT_INIT)).toThrow(TypeError);
    expect(() => buildAdt("   ", ADT_INIT)).toThrow(TypeError);
  });
});

describe("buildOru", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildOru(ORU_INIT).toString())).toBe(golden("oru-r01.golden.hl7"));
  });

  it("re-parses with zero warnings and is structurally complete", () => {
    const round = parseHL7(buildOru(ORU_INIT).toString());
    expect(round.warnings).toEqual([]);
    expect(round.structure.recognized).toBe(true);
    expect(round.structure.missingGroups).toEqual([]);
  });

  it("reads back the supplied observations", () => {
    const round = parseHL7(buildOru(ORU_INIT).toString());
    expect(round.meta.type).toBe("ORU^R01");
    const obs = round.observations();
    expect(obs.length).toBe(2);
    // OBX-2 declares NM, so the typed value is a number.
    expect(obs[0]?.value).toBe(7.2);
    expect(obs[1]?.value).toBe(13.5);
    expect(round.get("OBX[0].5")).toBe("7.2");
  });

  it("emit ∘ parse identity: OBX-3 identifier + value survive rebuild", () => {
    const first = parseHL7(buildOru(ORU_INIT).toString());
    const rebuilt = buildOru({
      controlId: "CTRL0000002",
      timestamp: "20260721101500",
      patient: { identifiers: { idNumber: first.patient?.mrn ?? "", identifierTypeCode: "MR" } },
      observations: [
        {
          setId: "1",
          valueType: "NM",
          identifier: { identifier: "WBC", text: "White Blood Cells", nameOfCodingSystem: "LN" },
          // Read the raw OBX-5 wire string (a string), not the typed NM number,
          // so the rebuild feeds the value back verbatim.
          value: first.get("OBX[0].5") ?? "",
          observationResultStatus: "F",
        },
      ],
    });
    const second = parseHL7(rebuilt.toString());
    expect(second.get("OBX.3.1")).toBe("WBC");
    expect(second.get("OBX.3.3")).toBe("LN");
    expect(second.observations()[0]?.value).toBe(7.2);
    expect(second.warnings).toEqual([]);
  });

  it("throws a typed error when observations is empty", () => {
    expect(() => buildOru({ ...ORU_INIT, observations: [] })).toThrow(TypeError);
  });

  it("throws a typed error when observations is absent", () => {
    // @ts-expect-error — observations is required
    expect(() => buildOru({ patient: ORU_INIT.patient })).toThrow(TypeError);
  });

  it("throws a typed error when patient is absent", () => {
    // @ts-expect-error — patient is required
    expect(() => buildOru({ observations: ORU_INIT.observations })).toThrow(TypeError);
  });

  it("a hostile observation value cannot break framing", () => {
    const msg = buildOru({
      patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
      observations: [
        { setId: "1", valueType: "ST", value: "a|b^c~d\\e&f", observationResultStatus: "F" },
      ],
    });
    const round = parseHL7(msg.toString());
    expect(round.get("OBX.5")).toBe("a|b^c~d\\e&f");
    expect(round.warnings).toEqual([]);
  });
});

describe("Phase T — every typed input field is emitted (full population)", () => {
  it("buildAdt emits every supplied PID/PV1/EVN field, zero-warning", () => {
    const msg = buildAdt("A04", {
      sendingApp: "S",
      timestamp: new Date("2026-07-21T10:15:00Z"),
      event: { recordedDateTime: "20260721101500", eventOccurred: "20260721100000" },
      patient: {
        setId: "1",
        identifiers: [
          { idNumber: "MRN001", identifierTypeCode: "MR" },
          { idNumber: "999", identifierTypeCode: "SS" },
        ],
        name: { familyName: "Doe", givenName: "Jane" },
        mothersMaidenName: { familyName: "Roe" },
        birthDateTime: "19700101",
        administrativeSex: "F",
        address: { street: "123 Main St", city: "Boston" },
        phoneHome: { telephoneNumber: "555-0000", telecommunicationUseCode: "PRN" },
        accountNumber: { idNumber: "ACCT-1", identifierTypeCode: "AN" },
      },
      visit: {
        setId: "1",
        patientClass: "I",
        assignedLocation: { pointOfCare: "ICU", room: "1", bed: "A" },
        attendingDoctor: { idNumber: "9990", familyName: "Welby", identifierTypeCode: "NPI" },
        referringDoctor: { idNumber: "8880", familyName: "Roe", identifierTypeCode: "NPI" },
        visitNumber: { idNumber: "V123", identifierTypeCode: "VN" },
        admitDateTime: "202607210900",
      },
    });
    const round = parseHL7(msg.toString());
    expect(round.warnings).toEqual([]);
    expect(round.structure.missingGroups).toEqual([]);
    expect(round.patient?.mrn).toBe("MRN001");
    expect(round.get("PID.6.1")).toBe("Roe");
    expect(round.get("PID.18.1")).toBe("ACCT-1");
    expect(round.get("EVN.6")).toBe("20260721100000");
    expect(round.get("PV1.8.2")).toBe("Roe");
  });

  it("buildOru emits every supplied PID/OBR/OBX field, zero-warning", () => {
    const msg = buildOru({
      sendingApp: "LAB",
      patient: {
        setId: "1",
        identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
        name: { familyName: "Doe", givenName: "Jane" },
        mothersMaidenName: { familyName: "Roe" },
        birthDateTime: "19700101",
        administrativeSex: "F",
        address: { street: "123 Main St", city: "Boston" },
        phoneHome: { telephoneNumber: "555-0000" },
        accountNumber: { idNumber: "ACCT-1", identifierTypeCode: "AN" },
      },
      order: {
        setId: "1",
        placerOrderNumber: "PL1",
        fillerOrderNumber: "FL1",
        universalServiceId: {
          identifier: "CBC",
          text: "Complete Blood Count",
          nameOfCodingSystem: "L",
        },
        observationDateTime: "202607210800",
        orderingProvider: [
          { idNumber: "9990", familyName: "Welby", identifierTypeCode: "NPI" },
          { idNumber: "8880", familyName: "Roe", identifierTypeCode: "NPI" },
        ],
        resultStatus: "F",
      },
      observations: [
        {
          setId: "1",
          valueType: "NM",
          identifier: { identifier: "WBC", nameOfCodingSystem: "LN" },
          value: "7.2",
          units: { identifier: "10*3/uL" },
          referenceRange: "4.0-11.0",
          abnormalFlags: "N",
          observationResultStatus: "F",
          observationDateTime: "202607210800",
        },
      ],
    });
    const round = parseHL7(msg.toString());
    expect(round.warnings).toEqual([]);
    expect(round.structure.missingGroups).toEqual([]);
    expect(round.get("PID.6.1")).toBe("Roe");
    expect(round.get("OBR.2")).toBe("PL1");
    expect(round.get("OBR.16[1].2")).toBe("Roe");
    expect(round.get("OBX.14")).toBe("202607210800");
  });
});
