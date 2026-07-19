import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseHL7, profiles, WARNING_CODES, defineProfile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadFixture = (relPath: string): string =>
  readFileSync(join(__dirname, "fixtures/vendor-shapes", relPath), "utf-8");

describe("Public surface (D-26 barrel export shape)", () => {
  it("profiles exposes all 8 built-ins", () => {
    expect(profiles.epic.name).toBe("epic");
    expect(profiles.cerner.name).toBe("cerner");
    expect(profiles.meditech.name).toBe("meditech");
    expect(profiles.athena.name).toBe("athena");
    expect(profiles.genericLab.name).toBe("genericLab");
    expect(profiles.visage.name).toBe("visage");
    expect(profiles.philips.name).toBe("philips");
    expect(profiles.va.name).toBe("va");
  });

  it("each built-in's lineage is [name]", () => {
    expect(profiles.epic.lineage).toEqual(["epic"]);
    expect(profiles.cerner.lineage).toEqual(["cerner"]);
  });

  it("defineProfile is exported as a top-level value", () => {
    const p = defineProfile({ name: "smoke" });
    expect(p.name).toBe("smoke");
  });

  it("each built-in is frozen", () => {
    expect(Object.isFrozen(profiles.epic)).toBe(true);
    expect(Object.isFrozen(profiles.cerner)).toBe(true);
    expect(Object.isFrozen(profiles.meditech)).toBe(true);
    expect(Object.isFrozen(profiles.athena)).toBe(true);
    expect(Object.isFrozen(profiles.genericLab)).toBe(true);
    expect(Object.isFrozen(profiles.visage)).toBe(true);
    expect(Object.isFrozen(profiles.philips)).toBe(true);
    expect(Object.isFrozen(profiles.va)).toBe(true);
  });

  it("profiles namespace itself is frozen", () => {
    expect(Object.isFrozen(profiles)).toBe(true);
  });
});

describe("profiles.epic — BIP-01 + BIP-06 fixture parity", () => {
  const fixture = loadFixture("epic/adt-a01.hl7");

  it("parses structurally with AND without profile", () => {
    const without = parseHL7(fixture);
    const withP = parseHL7(fixture, profiles.epic);
    expect(without.rawSegments.length).toBeGreaterThan(0);
    expect(withP.rawSegments.length).toBe(without.rawSegments.length);
  });

  it("without profile: UNKNOWN_SEGMENT present (ZDP, ZRS declared in epic)", () => {
    const without = parseHL7(fixture);
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.epic: UNKNOWN_SEGMENT absent for declared ZDP/ZRS", () => {
    const withP = parseHL7(fixture, profiles.epic);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("profile attribution: msg.profile.name === 'epic'", () => {
    const withP = parseHL7(fixture, profiles.epic);
    expect(withP.profile?.name).toBe("epic");
  });

  it("MSH-7 (01/15/2025 14:30:00) resolves via profile dateFormats", () => {
    const withP = parseHL7(fixture, profiles.epic);
    expect(withP.meta.timestamp?.valid).toBe(true);
  });

  it("ZDP fields resolve by declared name", () => {
    const withP = parseHL7(fixture, profiles.epic);
    const zdp = withP.allSegments().find((s) => s.type === "ZDP");
    expect(zdp?.get("departmentCode")?.value).toBe("CARDIOLOGY");
    expect(zdp?.get("departmentName")?.value).toBe("Cardiology Department");
  });
});

describe("profiles.cerner — BIP-02 + BIP-06 fixture parity", () => {
  const fixture = loadFixture("cerner/oru-r01.hl7");

  it("without profile: UNKNOWN_SEGMENT present for ZDS/ZCO", () => {
    const without = parseHL7(fixture);
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.cerner: UNKNOWN_SEGMENT absent for ZDS/ZCO", () => {
    const withP = parseHL7(fixture, profiles.cerner);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("MSH-7 ISO-8601 resolves", () => {
    const withP = parseHL7(fixture, profiles.cerner);
    expect(withP.meta.timestamp?.valid).toBe(true);
    expect(withP.meta.timestamp).toMatchObject({ year: 2025, month: 1, day: 15 });
  });

  it("profile attribution", () => {
    const withP = parseHL7(fixture, profiles.cerner);
    expect(withP.profile?.name).toBe("cerner");
  });

  it("ZDS summaryText accessible by name", () => {
    const withP = parseHL7(fixture, profiles.cerner);
    const zds = withP.allSegments().find((s) => s.type === "ZDS");
    expect(zds?.get("summaryText")?.value).toBe("Discharge summary text block one");
  });
});

describe("profiles.meditech — BIP-03 + BIP-06 fixture parity", () => {
  // Re-grounded (HL7-I, ADR 0018) to the public MEDITECH Ancillary Charges
  // (LAB/PHA/ITS/IDM) v2.1 spec: a DFT^P03 charge message carrying the
  // spec-documented ZF1/ZF2 Z-segments, with the minute-precision
  // (YYYYMMDDHHMM) timestamps both public MEDITECH specs confirm.
  const fixture = loadFixture("meditech/dft-p03.hl7");

  it("without profile: UNKNOWN_SEGMENT present for ZF1/ZF2", () => {
    const without = parseHL7(fixture);
    // MEDITECH MSH-7 '202501151430' is 12 digits — HL7 strict-TS accepts it
    // (YYYYMMDDHHmm is a valid partial), so NO TIMESTAMP_FALLBACK warning
    // in the without-profile case. But UNKNOWN_SEGMENT IS expected for ZF1/ZF2.
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.meditech: UNKNOWN_SEGMENT absent for ZF1/ZF2", () => {
    const withP = parseHL7(fixture, profiles.meditech);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("ZF1 copay fields accessible by declared name (Ancillary Charges §ZF1)", () => {
    const withP = parseHL7(fixture, profiles.meditech);
    const zf1 = withP.allSegments().find((s) => s.type === "ZF1");
    expect(zf1?.get("providerEncounter")?.value).toBe("55501");
    expect(zf1?.get("misServiceGroup")?.value).toBe("MEDIMAGING");
    expect(zf1?.get("visitCopay")?.value).toBe("2500");
    expect(zf1?.get("copayMaximum")?.value).toBe("5000");
  });

  it("ZF2 encounter-procedure fields accessible by declared name (Ancillary Charges §ZF2)", () => {
    const withP = parseHL7(fixture, profiles.meditech);
    const zf2 = withP.allSegments().find((s) => s.type === "ZF2");
    expect(zf2?.get("setId")?.value).toBe("1");
    expect(zf2?.get("encounterProcedure")?.value).toBe("XRCHEST");
    expect(zf2?.get("encounterProcedureCharge")?.value).toBe("8500");
    expect(zf2?.get("prvProcedureAmountDue")?.value).toBe("6000");
  });

  it("MSH-7 minute-precision YYYYMMDDHHMM resolves", () => {
    const withP = parseHL7(fixture, profiles.meditech);
    expect(withP.meta.timestamp?.valid).toBe(true);
    expect(withP.meta.timestamp).toMatchObject({ year: 2025, month: 1, day: 15 });
  });
});

describe("profiles.athena — BIP-04 + BIP-06 fixture parity", () => {
  const fixture = loadFixture("athena/adt-a01.hl7");

  it("without profile: UNKNOWN_SEGMENT present for ZCA", () => {
    const without = parseHL7(fixture);
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.athena: UNKNOWN_SEGMENT absent for ZCA", () => {
    const withP = parseHL7(fixture, profiles.athena);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("MSH-7 MM/DD/YYYY resolves", () => {
    const withP = parseHL7(fixture, profiles.athena);
    expect(withP.meta.timestamp?.valid).toBe(true);
  });

  it("ZCA careTeamRole + providerId accessible by name", () => {
    // Fixture layout: `ZCA|1|1|PRIMARY|PROV-55|Johnson^Maya^MD` — fields 1..5
    // (ZCA itself is the segment name, not a field). Profile maps:
    //   careTeamRole: 3 -> "PRIMARY" (scalar — .value returns whole thing)
    //   providerId:   5 -> "Johnson^Maya^MD" (composite — .value returns
    //                      auto-unescaped first subcomponent: "Johnson")
    //   providerName: 6 -> undefined (fixture stops at field 5; Plan 6-05
    //                      locked the profile at {..., providerName: 6} —
    //                      returning undefined per D-14 is the contract).
    const withP = parseHL7(fixture, profiles.athena);
    const zca = withP.allSegments().find((s) => s.type === "ZCA");
    expect(zca?.get("careTeamRole")?.value).toBe("PRIMARY");
    // providerId is a composite (XCN-style) — .value is the first subcomponent
    expect(zca?.get("providerId")?.value).toBe("Johnson");
    expect(zca?.get("providerName")).toBeUndefined();
  });
});

describe("profiles.genericLab — BIP-05 + BIP-06 fixture parity", () => {
  const fixture = loadFixture("genericLab/oru-r01.hl7");

  it("without profile: UNKNOWN_SEGMENT present for ZLB/ZNT", () => {
    const without = parseHL7(fixture);
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.genericLab: UNKNOWN_SEGMENT absent", () => {
    const withP = parseHL7(fixture, profiles.genericLab);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("ZNT noteText accessible by name", () => {
    const withP = parseHL7(fixture, profiles.genericLab);
    const znt = withP.allSegments().find((s) => s.type === "ZNT");
    expect(znt?.get("noteText")?.value).toBe("Specimen stable for 48hrs refrigerated");
  });

  it("MSH-7 YYYYMMDD HHmm space-separated format resolves", () => {
    const withP = parseHL7(fixture, profiles.genericLab);
    expect(withP.meta.timestamp?.valid).toBe(true);
  });
});

describe("profiles.visage — BIP-07 fixture parity (Visage 7 imaging/PACS ZDS)", () => {
  const fixture = loadFixture("visage/orm-o01.hl7");

  it("without profile: UNKNOWN_SEGMENT present for ZDS", () => {
    const without = parseHL7(fixture);
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.visage: UNKNOWN_SEGMENT absent for declared ZDS", () => {
    const withP = parseHL7(fixture, profiles.visage);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("profile attribution: msg.profile.name === 'visage'", () => {
    const withP = parseHL7(fixture, profiles.visage);
    expect(withP.profile?.name).toBe("visage");
  });

  it("ZDS studyInstanceUid (DICOM Study Instance UID) accessible by name", () => {
    const withP = parseHL7(fixture, profiles.visage);
    const zds = withP.allSegments().find((s) => s.type === "ZDS");
    expect(zds?.get("studyInstanceUid")?.value).toBe("1.2.826.0.1.3680043.10.99999.20250326.1");
  });

  it("MSH-7 HL7-native YYYYMMDDHHMMSS resolves (profile declares no date override)", () => {
    const withP = parseHL7(fixture, profiles.visage);
    expect(withP.meta.timestamp?.valid).toBe(true);
    expect(withP.meta.timestamp).toMatchObject({ year: 2025, month: 3, day: 26 });
  });
});

describe("profiles.philips — BIP-08 fixture parity (Vue PACS IS Link Z-segments)", () => {
  const orm = loadFixture("philips/orm-o01.hl7");
  const adt = loadFixture("philips/adt-a08.hl7");

  it("without profile: UNKNOWN_SEGMENT present for the Vue PACS Z-segments", () => {
    expect(parseHL7(orm).warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
    expect(parseHL7(adt).warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.philips: UNKNOWN_SEGMENT absent for all declared Z-segments", () => {
    for (const fixture of [orm, adt]) {
      const withP = parseHL7(fixture, profiles.philips);
      const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
      expect(zSegWarnings).toHaveLength(0);
    }
  });

  it("profile attribution: msg.profile.name === 'philips'", () => {
    expect(parseHL7(orm, profiles.philips).profile?.name).toBe("philips");
  });

  it("ZDS studyInstanceUid (DICOM Study Instance UID, §5.11) accessible by name", () => {
    const zds = parseHL7(orm, profiles.philips)
      .allSegments()
      .find((s) => s.type === "ZDS");
    // ZDS-1 is an RP composite (Reference Pointer ^ Application ID ^ Type ^ Subtype);
    // component 1 is the DICOM Study Instance UID, surfaced by `.value`.
    const uid = zds?.get("studyInstanceUid");
    expect(uid?.value).toBe("1.2.826.0.1.3680043.10.99999.20250326.7");
    // Raw-tree access (Field has no `.component()` wrapper): comp 3 = Type, comp 4 = Subtype.
    expect(uid?.repetitions[0]?.components[2]?.subcomponents[0]).toBe("Application");
    expect(uid?.repetitions[0]?.components[3]?.subcomponents[0]).toBe("DICOM");
  });

  it("ZLK linking ids (§5.12) resolve by name", () => {
    const zlk = parseHL7(orm, profiles.philips)
      .allSegments()
      .find((s) => s.type === "ZLK");
    expect(zlk?.get("externalWorkitemId")?.value).toBe("WL-0001");
    expect(zlk?.get("orderLinkId")?.value).toBe("OG-0001");
  });

  it("ZAO order-filler fields (§5.13) resolve at their gapped positions", () => {
    const zao = parseHL7(orm, profiles.philips)
      .allSegments()
      .find((s) => s.type === "ZAO");
    expect(zao?.get("modality")?.value).toBe("CT");
    expect(zao?.get("bodyPart")?.value).toBe("HEAD");
    expect(zao?.get("resultTransferStatus")?.value).toBe("DV");
    // spec has no field 7: device is field 8, section field 9
    expect(zao?.get("device")?.value).toBe("SCANNER01");
    expect(zao?.get("section")?.value).toBe("NEURO");
    expect(zao?.get("technicianId")?.value).toBe("TECH123");
    expect(zao?.get("radiologistId")?.value).toBe("RAD456");
    expect(zao?.get("acquisitionStatus")?.value).toBe("CM");
  });

  it("ZEB/ZAP/ZAV patient/visit-filler fields (§§5.14–5.16) resolve by name", () => {
    const msg = parseHL7(adt, profiles.philips);
    const seg = (t: string): ReturnType<typeof msg.allSegments>[number] | undefined =>
      msg.allSegments().find((s) => s.type === t);
    expect(seg("ZEB")?.get("encryptedPatientInfo")?.value).toBeDefined();
    // ZAP has no field 2: patientCustomString1 is field 3
    expect(seg("ZAP")?.get("patientCustomString1")?.value).toBe("VIP");
    expect(seg("ZAP")?.get("patientCustomString2")?.value).toBe("NEEDS-CONTRAST");
    expect(seg("ZAV")?.get("visitAdditionalDetails")?.value).toBeDefined();
  });

  it("MSH-7 HL7-native YYYYMMDDHHMMSS resolves (profile declares no date override)", () => {
    const withP = parseHL7(orm, profiles.philips);
    expect(withP.meta.timestamp?.valid).toBe(true);
    expect(withP.meta.timestamp).toMatchObject({ year: 2025, month: 3, day: 26 });
  });
});

describe("profiles.va — BIP-09 fixture parity (VA VistA Radiology/NucMed ZDS on ORU)", () => {
  const fixture = loadFixture("va/oru-r01.hl7");

  it("without profile: UNKNOWN_SEGMENT present for ZDS", () => {
    const without = parseHL7(fixture);
    expect(without.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("with profiles.va: UNKNOWN_SEGMENT absent for declared ZDS", () => {
    const withP = parseHL7(fixture, profiles.va);
    const zSegWarnings = withP.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(zSegWarnings).toHaveLength(0);
  });

  it("profile attribution: msg.profile.name === 'va'", () => {
    const withP = parseHL7(fixture, profiles.va);
    expect(withP.profile?.name).toBe("va");
  });

  it("ZDS studyInstanceUid (DICOM Study Instance UID) resolves on an ORU result", () => {
    // The VA Radiology/NucMed v3.6 spec documents "ZDS Segment Fields in ORU
    // and ORM"; this fixture exercises the ORU (result) shape the imaging-
    // vendor profiles' ORM fixtures do not cover. ZDS-1.1 (RP "Pointer") is
    // the Study Instance UID, surfaced by `.value`.
    const withP = parseHL7(fixture, profiles.va);
    const zds = withP.allSegments().find((s) => s.type === "ZDS");
    expect(zds?.get("studyInstanceUid")?.value).toBe("1.2.826.0.1.3680043.10.99999.20250326.9");
  });

  it("MSH-7 HL7-native YYYYMMDDHHMMSS (v2.4) resolves (profile declares no date override)", () => {
    const withP = parseHL7(fixture, profiles.va);
    expect(withP.meta.timestamp?.valid).toBe(true);
    expect(withP.meta.timestamp).toMatchObject({ year: 2025, month: 3, day: 26 });
  });
});

describe("Cross-profile warning-reduction summary (D-28 secondary smoke)", () => {
  it("each built-in's total warning count <= lenient-mode count (belt-and-suspenders)", () => {
    const cases = [
      ["epic/adt-a01.hl7", profiles.epic],
      ["cerner/oru-r01.hl7", profiles.cerner],
      ["meditech/dft-p03.hl7", profiles.meditech],
      ["athena/adt-a01.hl7", profiles.athena],
      ["genericLab/oru-r01.hl7", profiles.genericLab],
      ["visage/orm-o01.hl7", profiles.visage],
      ["philips/orm-o01.hl7", profiles.philips],
      ["philips/adt-a08.hl7", profiles.philips],
      ["va/oru-r01.hl7", profiles.va],
    ] as const;
    for (const [fp, p] of cases) {
      const fixture = loadFixture(fp);
      const without = parseHL7(fixture);
      const withP = parseHL7(fixture, p);
      expect(withP.warnings.length).toBeLessThanOrEqual(without.warnings.length);
    }
  });
});

describe("PROF-09 round-trip remains profile-agnostic for built-ins", () => {
  it("each built-in's parse-serialize round-trip byte-matches the no-profile version", () => {
    const cases = [
      ["epic/adt-a01.hl7", profiles.epic],
      ["cerner/oru-r01.hl7", profiles.cerner],
      ["meditech/dft-p03.hl7", profiles.meditech],
      ["athena/adt-a01.hl7", profiles.athena],
      ["genericLab/oru-r01.hl7", profiles.genericLab],
      ["visage/orm-o01.hl7", profiles.visage],
      ["philips/orm-o01.hl7", profiles.philips],
      ["philips/adt-a08.hl7", profiles.philips],
      ["va/oru-r01.hl7", profiles.va],
    ] as const;
    for (const [fp, p] of cases) {
      const fixture = loadFixture(fp);
      const withoutStr = parseHL7(fixture).toString();
      const withStr = parseHL7(fixture, p).toString();
      expect(withStr).toBe(withoutStr);
    }
  });
});
