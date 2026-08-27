/**
 * Phase G: message-type & structure awareness. Covers the misroute/truncation
 * safety net on both the read-side (`msg.structure`) and the parse-side
 * (`MISSING_EXPECTED_GROUP` warning emission), plus the two accuracy guarantees
 * that make it shippable:
 *
 *   1. NO WARNING WITHOUT AN ABSENT REQUIRED SEGMENT. A warning fires only when
 *      the message really does lack a segment the published structure gives a
 *      minimum of one; the committed corpus is swept for that property rather
 *      than spot-checked.
 *   2. The truncation signature: a recognized type stripped of a required
 *      segment warns ADDITIVELY, exactly once per missing segment, and lenient
 *      parse never throws.
 *
 * The warning message carries only structural identifiers (type, segment,
 * published structure id), never a field value, so the PHI-safety assertion is
 * explicit here.
 */

import { readFileSync, readdirSync } from "node:fs";
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

describe("Phase G: a warning only ever names a genuinely absent required segment", () => {
  it.each(readdirSync(FIXTURE_DIR).filter((n) => n.endsWith(".hl7")))(
    "%s warns exactly for the required segments it does not carry",
    (fixture) => {
      const msg = parseHL7(readFileSync(path.join(FIXTURE_DIR, fixture), "utf8"));
      const present = new Set(msg.allSegments().map((s) => s.type));
      const genuinelyAbsent = msg.structure.requiredSegments.filter((s) => !present.has(s));
      expect([...msg.structure.missingSegments]).toEqual(genuinelyAbsent);
      expect(
        msg.warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP),
      ).toHaveLength(genuinelyAbsent.length);
    },
  );

  it.each([
    ["oru-r01", "ORU^R01"],
    ["adt-a01", "ADT^A01"],
    ["adt-a04", "ADT^A04"],
    ["adt-a08", "ADT^A08"],
    ["orm-o01", "ORM^O01"],
    ["siu-s12", "SIU^S12"],
    ["vxu-v04", "VXU^V04"],
    ["adt-a24-link", "ADT^A24"],
    ["adt-a43-move", "ADT^A43"],
    ["dft-p03-charge", "DFT^P03"],
  ])("%s (%s) emits no MISSING_EXPECTED_GROUP", (fixture) => {
    expect(structuralWarnings(loadFixture(fixture))).toHaveLength(0);
  });

  it("the MDM^T02 fixtures warn for PV1 only, which they genuinely lack", () => {
    // The published MDM_T02 structure gives PV1 a minimum of one at the top
    // level in every variant. The repo's own canonical documents predate that
    // expectation and carry no PV1, so this is a true positive rather than a
    // false one; it is adjudicated in docs-content/spec-notes-structure.md.
    for (const fixture of ["mdm-t02", "mdm-t02-document"]) {
      const ws = structuralWarnings(loadFixture(fixture));
      expect(ws).toHaveLength(1);
      expect(ws[0]?.message).toContain("PV1");
    }
  });
});

describe("Phase G: truncation signature warns additively", () => {
  it("ORU^R01 with no OBR warns once, naming OBR and its published structure", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\rPID|||X\r";
    const ws = structuralWarnings(raw);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain("OBR");
    expect(ws[0]?.message).toContain("ORU_R01");
  });

  it("ADT^A01 missing PV1 warns once for the absent segment only", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ADT^A01|1|T|2.5.1\rEVN||20250102\rPID|||X\r";
    const ws = structuralWarnings(raw);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain("PV1");
  });

  it("ADT^A01 missing both PID and PV1 warns twice (one per segment)", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ADT^A01|1|T|2.5.1\rEVN||20250102\r";
    expect(structuralWarnings(raw)).toHaveLength(2);
  });

  it("lenient parse of a truncated recognized message still does not throw", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\r";
    expect(() => parseHL7(raw)).not.toThrow();
  });
});

describe("Phase G: unrecognized types are silent (conservative)", () => {
  it("an unmodelled message code emits no structural warning", () => {
    // QRY^A19 is a real type the registry does not cover.
    const raw = "MSH|^~\\&|A|F|||20250102||QRY^A19|1|T|2.5.1\r";
    expect(structuralWarnings(raw)).toHaveLength(0);
  });

  it("an ADT trigger event the publication names no structure for is silent", () => {
    // A18 (merge patient information) is one of the eight pairs the
    // publication's own message list leaves without a structure.
    const raw = "MSH|^~\\&|A|F|||20250102||ADT^A18|1|T|2.5.1\r";
    expect(structuralWarnings(raw)).toHaveLength(0);
    expect(parseHL7(raw).structure.recognized).toBe(false);
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
    expect(s.missingSegments).toEqual([]);
    expect(s.expectedGroups.every((g) => g.present)).toBe(true);
    expect(s.structureIds).toContain("ORU_R01-A");
  });

  it("reports the missing segment for a truncated ORU^R01", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||ORU^R01|1|T|2.5.1\rPID|||X\r";
    const s = parseHL7(raw).structure;
    expect(s.recognized).toBe(true);
    expect(s.missingSegments).toEqual(["OBR"]);
    expect(s.missingGroups).toEqual(["OBR"]);
  });

  it("unrecognized type -> recognized:false, no expected/missing groups", () => {
    const raw = "MSH|^~\\&|A|F|||20250102||QRY^A19|1|T|2.5.1\r";
    const s = parseHL7(raw).structure;
    expect(s.recognized).toBe(false);
    expect(s.expectedGroups).toEqual([]);
    expect(s.missingGroups).toEqual([]);
    expect(s.missingSegments).toEqual([]);
    expect(s.requiredSegments).toEqual([]);
    expect(s.structureIds).toEqual([]);
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
    expect(s.missingSegments).toEqual(["MSA"]);
  });

  it("ACK with MSA present has no missing segment", () => {
    const s = analyzeMessageStructure("ACK", "", new Set(["MSH", "MSA"]));
    expect(s.missingSegments).toEqual([]);
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
