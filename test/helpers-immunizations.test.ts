/**
 * Phase E — integration tests for `msg.immunizations()` (VXU^V04: ORC→RXA→
 * [RXR]→[{OBX}] order groups). Covers the RXA field map, CVX provenance +
 * dual-coding, NCIT route provenance, the NIP001 administered-vs-historical
 * derivation, verbatim action code, the 999 unknown-dose sentinel, positional
 * RXR/OBX grouping, and the HELPERS-07 never-throws contract.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);
function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

const MSH = "MSH|^~\\&|APP|FAC|||20250102||VXU^V04|1|T|2.5.1\r";
const PID = "PID|||X\r";

describe("helpers/immunizations: structure", () => {
  it("returns [] when no RXA segment present (D-05)", () => {
    expect(parseHL7(MSH + PID).immunizations()).toEqual([]);
  });

  it("returns one Immunization per RXA, in document order", () => {
    const imms = parseHL7(loadFixture("vxu-v04")).immunizations();
    expect(imms).toHaveLength(2);
  });

  it("the result and its child arrays are frozen (D-01); not memoized (D-06)", () => {
    const msg = parseHL7(loadFixture("vxu-v04"));
    const a = msg.immunizations();
    const b = msg.immunizations();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(Object.isFrozen(a[0]?.routes)).toBe(true);
    expect(Object.isFrozen(a[0]?.observations)).toBe(true);
    expect(a).not.toBe(b); // re-walked each call
  });
});

describe("helpers/immunizations: administered dose (RXA field map)", () => {
  const imm = parseHL7(loadFixture("vxu-v04")).immunizations()[0];

  it("ORC-1 order control attaches from the preceding ORC", () => {
    expect(imm?.orderControl).toBe("RE");
  });

  it("RXA-5 CVX vaccine code with provenance", () => {
    expect(imm?.vaccineCode?.identifier).toBe("115");
    expect(imm?.vaccineCode?.text).toBe("Tdap");
    expect(imm?.vaccineCode?.nameOfCodingSystem).toBe("CVX");
  });

  it("RXA-6/7 dose amount + UCUM units with the unitsAreUcum claim flag", () => {
    expect(imm?.doseAmount).toBe(0.5);
    expect(imm?.doseUnits?.identifier).toBe("mL");
    expect(imm?.doseUnitsAreUcum).toBe(true);
  });

  it("RXA-9 information source preserved + recordOrigin derived as administered (NIP001 00)", () => {
    expect(imm?.informationSource?.identifier).toBe("00");
    expect(imm?.recordOrigin).toBe("administered");
  });

  it("RXA-3 administered date/time as the fidelity TS (Phase N, spec-native month)", () => {
    expect(imm?.administeredDateTime).toMatchObject({
      raw: "20260615103000",
      precision: "second",
      year: 2026,
      month: 6, // June — 1-based, spec-native (not JS 0-indexed)
      day: 15,
    });
  });

  it("RXA-15/16 lot number + expiration date", () => {
    expect(imm?.lotNumber).toBe("LOT-TEST-001");
    expect(imm?.expirationDate).toMatchObject({ raw: "20271231", precision: "day", year: 2027 });
  });

  it("RXA-17 MVX manufacturer with provenance", () => {
    expect(imm?.manufacturer?.identifier).toBe("PMC");
    expect(imm?.manufacturer?.nameOfCodingSystem).toBe("MVX");
  });

  it("RXA-20 completion status + RXA-21 action code preserved verbatim", () => {
    expect(imm?.completionStatus).toBe("CP");
    expect(imm?.actionCode).toBe("A");
  });

  it("RXR route/site grouped positionally under the RXA (Table 0162/0163)", () => {
    expect(imm?.routes).toHaveLength(1);
    expect(imm?.routes[0]?.route?.identifier).toBe("IM");
    expect(imm?.routes[0]?.route?.nameOfCodingSystem).toBe("HL70162");
    expect(imm?.routes[0]?.site?.identifier).toBe("LD");
  });

  it("OBX (VFC eligibility) grouped positionally under the RXA", () => {
    expect(imm?.observations).toHaveLength(1);
    expect(imm?.observations[0]?.identifier.identifier).toBe("64994-7");
  });
});

describe("helpers/immunizations: real-IIS coding divergence (RXA-5 dual-code + NCIT route)", () => {
  const imm = parseHL7(loadFixture("vxu-v04")).immunizations()[1];

  it("surfaces BOTH triplets of a dual-coded RXA-5 (NDC primary + CVX alternate)", () => {
    expect(imm?.vaccineCode?.identifier).toBe("58160-0842-52");
    expect(imm?.vaccineCode?.nameOfCodingSystem).toBe("NDC");
    expect(imm?.vaccineCode?.alternateIdentifier).toBe("115");
    expect(imm?.vaccineCode?.nameOfAlternateCodingSystem).toBe("CVX");
  });

  it("surfaces an NCIT-coded route via provenance (never assumes Table 0162)", () => {
    expect(imm?.routes[0]?.route?.identifier).toBe("C28161");
    expect(imm?.routes[0]?.route?.nameOfCodingSystem).toBe("NCIT");
    expect("site" in (imm?.routes[0] ?? {})).toBe(false);
  });

  it("an RXA with no OBX has an empty (but always present) observations array", () => {
    expect(imm?.observations).toEqual([]);
  });
});

describe("helpers/immunizations: historical record (RXA-9 NIP001 01)", () => {
  const imm = parseHL7(loadFixture("vxu-v04-historical")).immunizations()[0];

  it("derives recordOrigin = historical and preserves the raw RXA-9 claim", () => {
    expect(imm?.informationSource?.identifier).toBe("01");
    expect(imm?.recordOrigin).toBe("historical");
  });

  it("surfaces the 999 unknown-dose sentinel as the number 999, not coerced", () => {
    expect(imm?.doseAmount).toBe(999);
    expect("doseUnits" in (imm ?? {})).toBe(false);
  });

  it("CVX vaccine + verbatim action code still surface for a historical dose", () => {
    expect(imm?.vaccineCode?.identifier).toBe("03");
    expect(imm?.vaccineCode?.nameOfCodingSystem).toBe("CVX");
    expect(imm?.actionCode).toBe("A");
    expect(imm?.completionStatus).toBe("CP");
  });

  it("absent lot/expiry/manufacturer leave keys omitted (never throws)", () => {
    expect("lotNumber" in (imm ?? {})).toBe(false);
    expect("expirationDate" in (imm ?? {})).toBe(false);
    expect("manufacturer" in (imm ?? {})).toBe(false);
    expect(imm?.routes).toEqual([]);
  });
});

describe("helpers/immunizations: refusal (RXA-18 + completion status RE)", () => {
  const imm = parseHL7(loadFixture("vxu-v04-refusal")).immunizations()[0];

  it("surfaces the refusal reason (RXA-18) with provenance", () => {
    expect(imm?.refusalReason?.identifier).toBe("00");
    expect(imm?.refusalReason?.text).toBe("Parental decision");
    expect(imm?.refusalReason?.nameOfCodingSystem).toBe("NIP002");
  });

  it("RXA-20 completion status = RE (refused), action code preserved", () => {
    expect(imm?.completionStatus).toBe("RE");
    expect(imm?.actionCode).toBe("A");
  });
});

describe("helpers/immunizations: never throws (HELPERS-07)", () => {
  it("returns [] for a non-VXU message with no RXA", () => {
    const adt = "MSH|^~\\&|A|B|||20250102||ADT^A01|1|T|2.5\rPID|||X\r";
    expect(() => parseHL7(adt).immunizations()).not.toThrow();
    expect(parseHL7(adt).immunizations()).toEqual([]);
  });

  it("tolerates a bare RXA with no fields beyond the segment name", () => {
    const imms = parseHL7(`${MSH}${PID}RXA\r`).immunizations();
    expect(imms).toHaveLength(1);
    expect(imms[0]?.routes).toEqual([]);
    expect(imms[0]?.observations).toEqual([]);
    expect("vaccineCode" in (imms[0] ?? {})).toBe(false);
    expect("actionCode" in (imms[0] ?? {})).toBe(false);
  });

  it("drops RXR/OBX seen before any RXA (no phantom immunization)", () => {
    const fx = `${MSH}${PID}RXR|IM^Intramuscular^HL70162\rOBX|1|ST|X||y\r`;
    expect(parseHL7(fx).immunizations()).toEqual([]);
  });

  it("an unknown RXA-9 code leaves recordOrigin omitted but keeps the raw claim", () => {
    const fx = `${MSH}${PID}RXA|0|1|||115^Tdap^CVX|0.5|||99^Local source^LOCAL\r`;
    const imm = parseHL7(fx).immunizations()[0];
    expect(imm?.informationSource?.identifier).toBe("99");
    expect("recordOrigin" in (imm ?? {})).toBe(false);
  });
});
