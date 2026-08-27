/**
 * Minimal-init suite: an init that supplies ONLY the content its pair requires
 * and omits every optional member.
 *
 * Acceptance exercised here: the message still re-parses with zero warnings and
 * no missing expected group, and the read-side collection returns entries
 * carrying only the supplied values, with no defaulted or fabricated clinical
 * or identity value.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildAdt,
  buildDft,
  buildMdm,
  buildOrm,
  buildSiu,
  buildVxu,
  parseHL7,
  type Hl7Message,
} from "../src/index.js";

/**
 * The one identifier that has to be present for a message to be about anybody.
 * Deliberately the ONLY patient content in every init below.
 */
const MINIMAL_PATIENT = { identifiers: { idNumber: "MRN001" } } as const;

/** MSH-10 and MSH-7 are pinned so the assertions are about the body only. */
const MINIMAL_ENVELOPE = { controlId: "CTRL1", timestamp: "20260801101500" } as const;

function assertClean(msg: Hl7Message, type: string): Hl7Message {
  const round = parseHL7(msg.toString());
  expect(round.warnings, type).toEqual([]);
  expect(round.structure.recognized, type).toBe(true);
  expect(round.structure.missingGroups, type).toEqual([]);
  expect(round.meta.type).toBe(type);
  return round;
}

describe("a minimal init is still spec-clean, and fabricates nothing", () => {
  it("buildVxu with one bare dose", () => {
    const round = assertClean(
      buildVxu({
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        immunizations: [{ vaccineCode: { identifier: "115" } }],
      }),
      "VXU^V04",
    );
    const imm = round.immunizations()[0];
    expect(imm?.vaccineCode).toEqual({ identifier: "115" });
    expect(Object.keys(imm ?? {}).sort()).toEqual(["observations", "routes", "vaccineCode"]);
    expect(round.patient?.mrn).toBe("MRN001");
    expect(round.patient?.familyName).toBeUndefined();
    expect(round.patient?.dateOfBirth).toBeUndefined();
    expect(round.get("PID.8")).toBeUndefined();
  });

  it("buildDft with one bare charge", () => {
    const round = assertClean(
      buildDft("P03", {
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        charges: [{ transactionType: "CG" }],
      }),
      "DFT^P03",
    );
    const charge = round.charges()[0];
    expect(charge?.transactionType).toBe("CG");
    expect(Object.keys(charge ?? {}).sort()).toEqual(["diagnoses", "transactionType"]);
    expect(charge?.diagnoses).toEqual([]);
    expect(round.segments("PV1").length).toBe(0);
  });

  it("buildMdm with a header only, on a notification event", () => {
    const round = assertClean(
      buildMdm("T01", {
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        document: { documentType: "DS" },
      }),
      "MDM^T01",
    );
    const doc = round.documents()[0];
    expect(doc?.documentType).toBe("DS");
    expect(Object.keys(doc ?? {}).sort()).toEqual(["documentType", "observations"]);
    // The visit group is present because the structure requires it, and it
    // carries nothing the caller did not supply.
    expect(round.segments("PV1").length).toBe(1);
    expect(round.visit?.patientClass).toBeUndefined();
    expect(round.visit?.location).toBeUndefined();
  });

  it("buildMdm with a header and one body line, on a content event", () => {
    const round = assertClean(
      buildMdm("T02", {
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        document: { body: [{ value: "Body." }] },
      }),
      "MDM^T02",
    );
    const doc = round.documents()[0];
    expect(Object.keys(doc ?? {}).sort()).toEqual(["observations"]);
    expect(doc?.observations.length).toBe(1);
    expect(doc?.observations[0]?.value).toBe("Body.");
    expect(doc?.completionStatus).toBeUndefined();
    expect(doc?.availabilityStatus).toBeUndefined();
  });

  it("buildSiu with one bare resource group", () => {
    const round = assertClean(
      buildSiu("S12", {
        ...MINIMAL_ENVELOPE,
        appointment: { fillerAppointmentId: "FL-1" },
        resourceGroups: [{ setId: "1" }],
      }),
      "SIU^S12",
    );
    const appt = round.appointments()[0];
    expect(appt?.fillerAppointmentId).toBe("FL-1");
    expect(Object.keys(appt ?? {}).sort()).toEqual(["fillerAppointmentId", "resources"]);
    expect(appt?.resources).toEqual([]);
    expect(round.segments("PID").length).toBe(0);
  });

  it("buildOrm with one bare order", () => {
    const round = assertClean(
      buildOrm({
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        orders: [{ orderControl: "NW" }],
      }),
      "ORM^O01",
    );
    const order = round.orders()[0];
    expect(order?.orderControl).toBe("NW");
    expect(Object.keys(order ?? {}).sort()).toEqual(["observations", "orderControl", "timings"]);
    expect(order?.observations).toEqual([]);
    expect(order?.timings).toEqual([]);
  });

  it("buildAdt for a merge, with the prior identity and nothing else", () => {
    const round = assertClean(
      buildAdt("A40", {
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        priorIdentity: { identifiers: { idNumber: "MRN-OLD" } },
      }),
      "ADT^A40",
    );
    const ev = round.identityEvents()[0];
    expect(ev?.prior?.identifiers).toEqual([{ idNumber: "MRN-OLD" }]);
    expect(ev?.prior?.name).toBeUndefined();
    expect(ev?.prior?.accountNumber).toBeUndefined();
    expect(ev?.prior?.visitNumber).toBeUndefined();
    expect(ev?.surviving?.identifiers).toEqual([{ idNumber: "MRN001" }]);
    expect(ev?.surviving?.name).toBeUndefined();
    expect(ev?.warnings).toEqual([]);
    // PV1 is the structural fail-safe: present, and empty of fabricated data.
    expect(round.segments("PV1").length).toBe(1);
    expect(round.visit?.patientClass).toBeUndefined();
  });

  it("no minimal message carries a defaulted clinical or identity value", () => {
    const messages: readonly Hl7Message[] = [
      buildVxu({
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        immunizations: [{ vaccineCode: { identifier: "115" } }],
      }),
      buildDft("P03", {
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        charges: [{ transactionType: "CG" }],
      }),
      buildMdm("T01", {
        ...MINIMAL_ENVELOPE,
        patient: MINIMAL_PATIENT,
        document: { documentType: "DS" },
      }),
      buildOrm({ ...MINIMAL_ENVELOPE, patient: MINIMAL_PATIENT, orders: [{ orderControl: "NW" }] }),
    ];
    for (const msg of messages) {
      const round = parseHL7(msg.toString());
      // Only MSH-11 (processing id) and MSH-12 (version) carry a documented
      // envelope default; nothing in the body does.
      expect(round.patient?.familyName).toBeUndefined();
      expect(round.patient?.givenName).toBeUndefined();
      expect(round.patient?.dateOfBirth).toBeUndefined();
      expect(round.patient?.sex).toBeUndefined();
      expect(round.get("PID.18")).toBeUndefined();
      expect(round.meta.processingId).toBe("P");
      expect(round.meta.version).toBe("2.5");
    }
  });
});
