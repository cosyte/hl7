/**
 * Phase Q — integration tests for `msg.documents()` (MDM: TXA → [OBX] narrative
 * body). The load-bearing case: TXA-17 **completion** status and TXA-19
 * **availability** status are surfaced as DISTINCT fields and NEVER conflated —
 * a document can be *available* (AV) while still only *in progress* (IP); reading
 * a preliminary document as final is the harm. Also covers the TXA field map,
 * positional OBX grouping, and the HELPERS-07 / D-01 / D-06 contracts.
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

const MSH = "MSH|^~\\&|DOCAPP|HOSP|EHR|MAIN|20260419160000||MDM^T02^MDM_T02|M1|P|2.5.1\r";

describe("helpers/documents: structure", () => {
  it("returns [] when no TXA segment present (D-05)", () => {
    expect(parseHL7(MSH + "PID|||X\r").documents()).toEqual([]);
  });

  it("returns one ClinicalDocument per TXA, in document order", () => {
    expect(parseHL7(loadFixture("mdm-t02-document")).documents()).toHaveLength(1);
  });

  it("the result and its child arrays are frozen (D-01); not memoized (D-06)", () => {
    const msg = parseHL7(loadFixture("mdm-t02-document"));
    const a = msg.documents();
    const b = msg.documents();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(Object.isFrozen(a[0]?.observations)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("helpers/documents: TXA field map", () => {
  const doc = parseHL7(loadFixture("mdm-t02-document")).documents()[0];

  it("TXA-2 document type", () => {
    expect(doc?.documentType).toBe("DS");
  });

  it("TXA-4 activity date/time (fidelity TS)", () => {
    expect(doc?.activityDateTime?.raw).toBe("20260419160000");
  });

  it("TXA-12 / TXA-13 unique + parent document numbers", () => {
    expect(doc?.uniqueDocumentNumber).toBe("DOC-Q-001");
    expect(doc?.parentDocumentNumber).toBe("DOC-Q-PARENT-000");
  });

  it("groups the OBX narrative body under the TXA", () => {
    expect(doc?.observations).toHaveLength(1);
    expect(doc?.observations[0]?.value).toContain("Patient evaluated");
  });
});

describe("helpers/documents: TXA-17 completion vs TXA-19 availability are DISTINCT", () => {
  const doc = parseHL7(loadFixture("mdm-t02-document")).documents()[0];

  it("completion status (TXA-17) = IP (in progress) — NOT the availability value", () => {
    expect(doc?.completionStatus).toBe("IP");
  });

  it("availability status (TXA-19) = AV (available) — NOT the completion value", () => {
    expect(doc?.availabilityStatus).toBe("AV");
  });

  it("the two fields are never merged: a preliminary+available doc keeps both axes", () => {
    // A document available (AV) but still in progress (IP) must not read as final.
    expect(doc?.completionStatus).not.toBe(doc?.availabilityStatus);
  });

  it("independently placed: completion present, availability absent stays unmerged", () => {
    // TXA with TXA-17=AU (authenticated) but no TXA-19.
    const seg = `TXA|1|DS|TX|20260419160000${"|".repeat(13)}AU\r`; // AU at TXA-17
    const d = parseHL7(MSH + seg).documents()[0];
    expect(d?.completionStatus).toBe("AU");
    expect(d?.availabilityStatus).toBeUndefined();
  });
});

describe("helpers/documents: never throws (HELPERS-07)", () => {
  it("tolerates a bare TXA with no body", () => {
    expect(() => parseHL7(MSH + "TXA|1\r").documents()).not.toThrow();
    expect(parseHL7(MSH + "TXA|1\r").documents()[0]?.observations).toEqual([]);
  });

  it("drops OBX that precede any TXA (still on msg.observations())", () => {
    const msg = parseHL7(MSH + "OBX|1|TX|C^x^L||before||||||F\rTXA|1|DS\r");
    expect(msg.documents()[0]?.observations).toEqual([]);
    expect(msg.observations()).toHaveLength(1); // the pre-TXA OBX still surfaces here
  });
});
