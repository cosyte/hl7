/**
 * Round-trip tests for the typed `MDM` builder, across BOTH registry families:
 * the notification events, whose published structure carries the document
 * header alone, and the content events, whose structure additionally requires
 * the transcribed body.
 *
 * Acceptance exercised here:
 *   - **spec-clean golden** for fixed inputs.
 *   - **zero-warning + structurally complete** for every recognised event of
 *     both families.
 *   - **read-side round trip**: `msg.documents()` returns the metadata and body
 *     supplied, and no document value the caller did not supply.
 *   - **completion status and availability status are never conflated.**
 *
 * All values are synthetic.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildMdm, findMessageStructureDefinition, parseHL7 } from "../src/index.js";

import { ENVELOPE, MDM_CONTENT_EVENTS, MDM_INIT, PATIENT } from "./_helpers/supported-pairs.js";

const NOTIFICATION_EVENTS = ["T01", "T03", "T05", "T07", "T09", "T11"];

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/build/${name}`, import.meta.url)), "utf8");
}

function toGoldenForm(hl7: string): string {
  return hl7.replaceAll("\r", "\n") + "\n";
}

describe("buildMdm", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildMdm("T02", MDM_INIT).toString())).toBe(golden("mdm-t02.golden.hl7"));
  });

  it("is zero-warning and structurally complete for both registry families", () => {
    for (const event of [...NOTIFICATION_EVENTS, ...MDM_CONTENT_EVENTS]) {
      const round = parseHL7(buildMdm(event, MDM_INIT).toString());
      expect(round.warnings, `MDM^${event}`).toEqual([]);
      expect(round.structure.recognized).toBe(true);
      expect(round.structure.missingGroups, `MDM^${event}`).toEqual([]);
      expect(round.meta.type).toBe(`MDM^${event}`);
    }
  });

  it("the content family requires OBX and the notification family does not", () => {
    for (const event of MDM_CONTENT_EVENTS) {
      expect(findMessageStructureDefinition("MDM", event)?.requiredSegments).toContain("OBX");
    }
    for (const event of NOTIFICATION_EVENTS) {
      expect(findMessageStructureDefinition("MDM", event)?.requiredSegments).not.toContain("OBX");
    }
    // A notification event needs no body, and stays clean without one.
    const round = parseHL7(
      buildMdm("T01", {
        ...ENVELOPE,
        patient: PATIENT,
        document: { documentType: "DS", uniqueDocumentNumber: "DOC-1" },
      }).toString(),
    );
    expect(round.segments("OBX").length).toBe(0);
    expect(round.warnings).toEqual([]);
    expect(round.structure.missingGroups).toEqual([]);
  });

  it("reads back the document metadata and body supplied", () => {
    const round = parseHL7(buildMdm("T02", MDM_INIT).toString());
    const docs = round.documents();
    expect(docs.length).toBe(1);
    const doc = docs[0];
    expect(doc?.documentType).toBe("DS");
    expect(doc?.activityDateTime?.raw).toBe("20260801100000");
    expect(doc?.uniqueDocumentNumber).toBe("DOC-1001");
    expect(doc?.parentDocumentNumber).toBe("DOC-1000");
    expect(doc?.observations.map((o) => o.value)).toEqual([
      "Discharge summary, line one.",
      "Discharge summary, line two.",
    ]);
    expect(round.get("TXA.1")).toBe("1");
  });

  it("keeps completion status and availability status on distinct positions", () => {
    const round = parseHL7(buildMdm("T02", MDM_INIT).toString());
    const doc = round.documents()[0];
    expect(doc?.completionStatus).toBe("AU");
    expect(doc?.availabilityStatus).toBe("AV");
    expect(round.get("TXA.17")).toBe("AU");
    expect(round.get("TXA.19")).toBe("AV");

    // A still-preliminary document that is already available: the two axes
    // disagree, and both survive without being merged.
    const preliminary = parseHL7(
      buildMdm("T02", {
        ...MDM_INIT,
        document: { ...MDM_INIT.document, completionStatus: "IP", availabilityStatus: "AV" },
      }).toString(),
    ).documents()[0];
    expect(preliminary?.completionStatus).toBe("IP");
    expect(preliminary?.availabilityStatus).toBe("AV");
  });

  it("emits no document value the caller did not supply", () => {
    const msg = buildMdm("T02", {
      ...ENVELOPE,
      patient: PATIENT,
      document: { documentType: "DS", body: [{ setId: "1", valueType: "TX", value: "Body." }] },
    });
    const doc = parseHL7(msg.toString()).documents()[0];
    expect(doc?.documentType).toBe("DS");
    expect(doc?.completionStatus).toBeUndefined();
    expect(doc?.availabilityStatus).toBeUndefined();
    expect(doc?.activityDateTime).toBeUndefined();
    expect(doc?.uniqueDocumentNumber).toBeUndefined();
    expect(doc?.parentDocumentNumber).toBeUndefined();
    expect(doc?.observations.length).toBe(1);
  });

  it("emit then parse then rebuild preserves the modelled document fields", () => {
    const first = parseHL7(buildMdm("T06", MDM_INIT).toString());
    const doc = first.documents()[0];
    const rebuilt = parseHL7(
      buildMdm("T06", {
        ...ENVELOPE,
        patient: PATIENT,
        document: {
          documentType: doc?.documentType ?? "",
          uniqueDocumentNumber: doc?.uniqueDocumentNumber ?? "",
          parentDocumentNumber: doc?.parentDocumentNumber ?? "",
          completionStatus: doc?.completionStatus ?? "",
          availabilityStatus: doc?.availabilityStatus ?? "",
          // OBX-2 declared TX, so the typed value is the narrative string.
          body: (doc?.observations ?? []).map((o, i) => ({
            setId: String(i + 1),
            valueType: "TX",
            value: typeof o.value === "string" ? o.value : "",
          })),
        },
      }).toString(),
    );
    const second = rebuilt.documents()[0];
    expect(second?.documentType).toBe(doc?.documentType);
    expect(second?.uniqueDocumentNumber).toBe(doc?.uniqueDocumentNumber);
    expect(second?.parentDocumentNumber).toBe(doc?.parentDocumentNumber);
    expect(second?.completionStatus).toBe(doc?.completionStatus);
    expect(second?.availabilityStatus).toBe(doc?.availabilityStatus);
    expect(second?.observations.map((o) => o.value)).toEqual(doc?.observations.map((o) => o.value));
    expect(rebuilt.warnings).toEqual([]);
  });
});
