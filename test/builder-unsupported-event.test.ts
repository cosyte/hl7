/**
 * A trigger event outside the published support set is still EMITTED, never
 * rejected: the support set is a claim about structural completeness, not an
 * allow list, and an event a released version accepts must not become a throw.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildAdt,
  buildDft,
  buildMdm,
  buildSiu,
  findMessageStructureDefinition,
  parseHL7,
  supportsBuilderMessage,
} from "../src/index.js";

import { DFT_INIT, ENVELOPE, PATIENT, SIU_INIT } from "./_helpers/supported-pairs.js";

describe("a trigger event outside the support set still emits", () => {
  it("an ADT event the structure registry does not recognise at all", () => {
    expect(supportsBuilderMessage("ADT", "A99")).toBe(false);
    expect(findMessageStructureDefinition("ADT", "A99")).toBeUndefined();
    const round = parseHL7(buildAdt("A99", { ...ENVELOPE, patient: PATIENT }).toString());
    expect(round.meta.type).toBe("ADT^A99");
    expect(round.patient?.mrn).toBe("MRN001");
    expect(round.structure.recognized).toBe(false);
    expect(round.warnings).toEqual([]);
  });

  it("an ADT event the registry recognises but the support set excludes", () => {
    // A15 requires PRT and A20 requires NPU: no typed init supplies either, so
    // support is not claimed. The builder still emits the content supplied, and
    // the structure net says what is missing rather than the builder refusing.
    for (const event of ["A15", "A20"]) {
      expect(supportsBuilderMessage("ADT", event)).toBe(false);
      const round = parseHL7(buildAdt(event, { ...ENVELOPE, patient: PATIENT }).toString());
      expect(round.meta.type).toBe(`ADT^${event}`);
      expect(round.patient?.mrn).toBe("MRN001");
      expect(round.structure.recognized).toBe(true);
      expect(round.structure.missingGroups.length).toBeGreaterThan(0);
    }
  });

  it("a merge-shaped ADT event outside the support set does not demand an MRG", () => {
    // A39 is a merge in HL7 terms but is not a pair this library claims, so the
    // absent-required-content rule does not fire on it.
    expect(supportsBuilderMessage("ADT", "A39")).toBe(false);
    expect(() => buildAdt("A39", { ...ENVELOPE, patient: PATIENT })).not.toThrow();
  });

  it("a DFT event outside the support set", () => {
    expect(supportsBuilderMessage("DFT", "P99")).toBe(false);
    const round = parseHL7(buildDft("P99", DFT_INIT).toString());
    expect(round.meta.type).toBe("DFT^P99");
    expect(round.charges().length).toBe(2);
  });

  it("an MDM event outside the support set needs no body", () => {
    expect(supportsBuilderMessage("MDM", "T99")).toBe(false);
    const round = parseHL7(
      buildMdm("T99", {
        ...ENVELOPE,
        patient: PATIENT,
        document: { documentType: "DS", uniqueDocumentNumber: "DOC-1" },
      }).toString(),
    );
    expect(round.meta.type).toBe("MDM^T99");
    expect(round.documents()[0]?.uniqueDocumentNumber).toBe("DOC-1");
    expect(round.segments("OBX").length).toBe(0);
  });

  it("an SIU event outside the support set", () => {
    expect(supportsBuilderMessage("SIU", "S99")).toBe(false);
    const round = parseHL7(buildSiu("S99", SIU_INIT).toString());
    expect(round.meta.type).toBe("SIU^S99");
    expect(round.appointments()[0]?.fillerAppointmentId).toBe("FL-2002");
  });

  it("the builders that took a trigger event before this change still accept every one they did", () => {
    // The pre-existing ADT events, invoked exactly as before, are unchanged.
    for (const event of ["A01", "A02", "A03", "A04", "A08"]) {
      const round = parseHL7(buildAdt(event, { ...ENVELOPE, patient: PATIENT }).toString());
      expect(round.warnings, `ADT^${event}`).toEqual([]);
      expect(round.structure.missingGroups).toEqual([]);
    }
  });
});
