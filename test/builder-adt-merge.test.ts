/**
 * Tests for the optional prior-identity content on the ADT typed init: the MRG
 * segment that lets the identity-management events be authored spec-clean.
 *
 * Acceptance exercised here:
 *   - **zero-warning + structurally complete** for every trigger event whose
 *     published structure requires MRG.
 *   - **role labelling survives the round trip**: the supplied prior
 *     identifiers come back as `prior`, the supplied patient identifiers as
 *     `surviving`, in the spec-constant direction.
 *   - **no MRG unless asked for**: a non-merge event is byte-identical to what
 *     the builder emitted before this content existed.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import { buildAdt, findMessageStructureDefinition, parseHL7 } from "../src/index.js";

import {
  ENVELOPE,
  MERGE_EVENTS,
  PATIENT,
  PRIOR_IDENTITY,
  adtInit,
} from "./_helpers/supported-pairs.js";

/** The merge and move events the read-side identity helper classifies. */
const READ_SIDE_IDENTITY_EVENTS = ["A40", "A41", "A42", "A43", "A44"];

describe("buildAdt with prior identity", () => {
  it("every merge or move event is zero-warning and structurally complete", () => {
    for (const event of MERGE_EVENTS) {
      expect(findMessageStructureDefinition("ADT", event)?.requiredSegments, event).toContain(
        "MRG",
      );
      const round = parseHL7(buildAdt(event, adtInit(event)).toString());
      expect(round.warnings, `ADT^${event}`).toEqual([]);
      expect(round.structure.recognized).toBe(true);
      expect(round.structure.missingGroups, `ADT^${event}`).toEqual([]);
      expect(round.segments("MRG").length).toBe(1);
    }
  });

  it("names the supplied prior identity as prior and the patient as surviving", () => {
    for (const event of READ_SIDE_IDENTITY_EVENTS) {
      const round = parseHL7(buildAdt(event, adtInit(event)).toString());
      const events = round.identityEvents();
      expect(events.length, `ADT^${event}`).toBe(1);
      const ev = events[0];
      expect(ev?.eventType).toBe(event);
      expect(ev?.direction).toBe("MRG_TO_PID");
      expect(ev?.prior?.sourceSegment).toBe("MRG");
      expect(ev?.surviving?.sourceSegment).toBe("PID");
      expect(ev?.prior?.identifiers.map((c) => c.idNumber)).toEqual(["MRN-OLD"]);
      expect(ev?.prior?.accountNumber?.idNumber).toBe("ACCT-OLD");
      expect(ev?.prior?.visitNumber?.idNumber).toBe("V-OLD");
      expect(ev?.prior?.name?.givenName).toBe("Mary");
      expect(ev?.surviving?.identifiers.map((c) => c.idNumber)).toEqual(["MRN001"]);
      expect(ev?.surviving?.name?.givenName).toBe("Jane");
      // Nothing is left unpaired: no fail-safe warning on the event either.
      expect(ev?.warnings).toEqual([]);
    }
  });

  it("never inverts the merge direction, whatever the identifiers look like", () => {
    const round = parseHL7(
      buildAdt("A40", {
        ...ENVELOPE,
        patient: { identifiers: { idNumber: "AAA" } },
        priorIdentity: { identifiers: { idNumber: "ZZZ" } },
      }).toString(),
    );
    const ev = round.identityEvents()[0];
    expect(ev?.prior?.identifiers[0]?.idNumber).toBe("ZZZ");
    expect(ev?.surviving?.identifiers[0]?.idNumber).toBe("AAA");
  });

  it("emits the MRG between the PID and the PV1", () => {
    const round = parseHL7(buildAdt("A45", adtInit("A45")).toString());
    const order = round.allSegments().map((s) => s.type);
    expect(order).toEqual(["MSH", "EVN", "PID", "MRG", "PV1"]);
  });

  it("emits no MRG when no prior identity is supplied", () => {
    const round = parseHL7(buildAdt("A01", adtInit("A01")).toString());
    expect(round.segments("MRG").length).toBe(0);
    expect(round.warnings).toEqual([]);
    expect(round.identityEvents()).toEqual([]);
  });

  it("carries prior identity onto a non-merge event rather than dropping it", () => {
    // The builder emits what the caller supplies: an A08 is not a merge, but a
    // supplied prior identity is content, not an error, and is never discarded.
    const round = parseHL7(
      buildAdt("A08", { ...ENVELOPE, patient: PATIENT, priorIdentity: PRIOR_IDENTITY }).toString(),
    );
    expect(round.segments("MRG").length).toBe(1);
    expect(round.get("MRG.1.1")).toBe("MRN-OLD");
    expect(round.warnings).toEqual([]);
    expect(round.structure.missingGroups).toEqual([]);
  });

  it("emits no prior-identity value the caller did not supply", () => {
    const round = parseHL7(
      buildAdt("A40", {
        ...ENVELOPE,
        patient: PATIENT,
        priorIdentity: { identifiers: { idNumber: "MRN-OLD" } },
      }).toString(),
    );
    const prior = round.identityEvents()[0]?.prior;
    expect(prior?.identifiers.map((c) => c.idNumber)).toEqual(["MRN-OLD"]);
    expect(prior?.accountNumber).toBeUndefined();
    expect(prior?.visitNumber).toBeUndefined();
    expect(prior?.name).toBeUndefined();
    expect(prior?.legacyPatientId).toBeUndefined();
  });

  it("carries the withdrawn prior patient id only where the version still reads it", () => {
    const init = {
      ...ENVELOPE,
      patient: PATIENT,
      priorIdentity: { legacyPatientId: { idNumber: "LEGACY-1" } },
    };
    const pre27 = parseHL7(buildAdt("A40", { ...init, version: "2.5" }).toString());
    expect(pre27.identityEvents()[0]?.prior?.legacyPatientId?.idNumber).toBe("LEGACY-1");
    expect(pre27.get("MRG.4.1")).toBe("LEGACY-1");

    // On v2.7+ the field is withdrawn: it is still on the wire exactly as
    // supplied, and the read side declines to read it as an identity field.
    const post27 = parseHL7(buildAdt("A40", { ...init, version: "2.7" }).toString());
    expect(post27.get("MRG.4.1")).toBe("LEGACY-1");
    expect(post27.identityEvents()[0]?.prior?.legacyPatientId).toBeUndefined();
  });
});
