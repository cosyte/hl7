/**
 * Phase G — message-type & structure awareness. Covers the conservative
 * misroute/truncation safety net on both the read-side (`msg.structure`) and
 * the parse-side (`MISSING_EXPECTED_GROUP` warning emission), plus the two
 * accuracy guarantees that make it shippable:
 *
 *   1. ZERO false positives — every well-formed canonical fixture of a
 *      recognized type produces NO structural warning.
 *   2. The truncation signature — a recognized type stripped of an expected
 *      Required group warns ADDITIVELY, exactly once per missing group, and
 *      lenient parse never throws.
 *
 * The warning message carries only structural facts (type, group, anchor
 * names) — never a field value — so the PHI-safety assertion is explicit here.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MESSAGE_STRUCTURE_DEFINITIONS,
  WARNING_CODES,
  analyzeMessageStructure,
  parseHL7,
} from "../src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);
function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

/** Count the MISSING_EXPECTED_GROUP warnings on a parsed message. */
function structuralWarnings(raw: string): readonly { readonly message: string }[] {
  return parseHL7(raw).warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP);
}

describe("Phase G: well-formed messages never warn (zero false positives)", () => {
  it.each([
    ["oru-r01", "ORU^R01"],
    ["adt-a01", "ADT^A01"],
    ["adt-a04", "ADT^A04"],
    ["adt-a08", "ADT^A08"],
    ["orm-o01", "ORM^O01"],
    ["siu-s12", "SIU^S12"],
    ["mdm-t02", "MDM^T02"],
    ["vxu-v04", "VXU^V04"],
  ])("%s (%s) emits no MISSING_EXPECTED_GROUP", (fixture) => {
    expect(structuralWarnings(loadFixture(fixture))).toHaveLength(0);
  });
});

describe("Phase G: truncation signature warns additively", () => {
  it("ORU^R01 with no OBR/OBX result group warns once for 'result'", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\rPID|||X\r";
    const ws = structuralWarnings(raw);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain("result");
    expect(ws[0]?.message).toContain("OBR/OBX");
  });

  it("ADT^A01 missing PV1 warns once for the absent 'visit' group only", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ADT^A01|1|T|2.5.1\rEVN||20250102\rPID|||X\r";
    const ws = structuralWarnings(raw);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain("visit");
  });

  it("ADT^A01 missing both PID and PV1 warns twice (one per group)", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ADT^A01|1|T|2.5.1\rEVN||20250102\r";
    expect(structuralWarnings(raw)).toHaveLength(2);
  });

  it("lenient parse of a truncated recognized message still does not throw", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\r";
    expect(() => parseHL7(raw)).not.toThrow();
  });
});

describe("Phase G: unrecognized types are silent (conservative)", () => {
  it("an unmodelled trigger event emits no structural warning", () => {
    // QRY^A19 is a real type the registry deliberately does not model.
    const raw = "MSH|^~\\&|A|F|||20250102||QRY^A19|1|T|2.5.1\r";
    expect(structuralWarnings(raw)).toHaveLength(0);
  });

  it("an ADT trigger event outside the recognized set is silent", () => {
    // A06 (change outpatient→inpatient) is intentionally not modelled.
    const raw = "MSH|^~\\&|A|F|||20250102||ADT^A06|1|T|2.5.1\r";
    expect(structuralWarnings(raw)).toHaveLength(0);
  });
});

describe("Phase G: warning carries no PHI", () => {
  it("the message never echoes a field value, only structural facts", () => {
    const raw =
      "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\rPID|||MRN-SECRET-001^^^FAC^MR||DOE^JANE\r";
    const ws = structuralWarnings(raw);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).not.toContain("MRN-SECRET-001");
    expect(ws[0]?.message).not.toContain("DOE");
    expect(ws[0]?.message).not.toContain("JANE");
  });
});

describe("Phase G: msg.structure read-side view", () => {
  it("recognized + present groups for a well-formed ORU^R01", () => {
    const s = parseHL7(loadFixture("oru-r01")).structure;
    expect(s.recognized).toBe(true);
    expect(s.messageCode).toBe("ORU");
    expect(s.triggerEvent).toBe("R01");
    expect(s.missingGroups).toEqual([]);
    expect(s.expectedGroups.every((g) => g.present)).toBe(true);
  });

  it("reports the missing group for a truncated ORU^R01", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\rPID|||X\r";
    const s = parseHL7(raw).structure;
    expect(s.recognized).toBe(true);
    expect(s.missingGroups).toEqual(["result"]);
  });

  it("unrecognized type → recognized:false, no expected/missing groups", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||QRY^A19|1|T|2.5.1\r";
    const s = parseHL7(raw).structure;
    expect(s.recognized).toBe(false);
    expect(s.expectedGroups).toEqual([]);
    expect(s.missingGroups).toEqual([]);
  });

  it("is memoized (D-02): same reference across reads", () => {
    const msg = parseHL7(loadFixture("oru-r01"));
    expect(msg.structure).toBe(msg.structure);
  });

  it("is deeply frozen (D-01)", () => {
    const s = parseHL7(loadFixture("oru-r01")).structure;
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.expectedGroups)).toBe(true);
  });
});

describe("Phase G: pure analyzeMessageStructure", () => {
  it("ACK matches on message code alone (empty trigger event)", () => {
    const s = analyzeMessageStructure("ACK", "", new Set(["MSH"]));
    expect(s.recognized).toBe(true);
    expect(s.missingGroups).toEqual(["acknowledgment"]);
  });

  it("ACK with MSA present has no missing group", () => {
    const s = analyzeMessageStructure("ACK", "", new Set(["MSH", "MSA"]));
    expect(s.missingGroups).toEqual([]);
  });

  it("the registry is frozen and recognizes the documented types", () => {
    expect(Object.isFrozen(MESSAGE_STRUCTURE_DEFINITIONS)).toBe(true);
    const codes = new Set(MESSAGE_STRUCTURE_DEFINITIONS.map((d) => d.messageCode));
    for (const code of [
      "ADT",
      "ORU",
      "ORM",
      "OML",
      "OMG",
      "OMP",
      "OMI",
      "SIU",
      "MDM",
      "DFT",
      "VXU",
      "ACK",
    ]) {
      expect(codes.has(code)).toBe(true);
    }
  });
});
