/**
 * Round-trip tests for the typed `SIU` builder, covering the RGS resource group
 * the published structure requires and all four AI* resource kinds.
 *
 * Acceptance exercised here:
 *   - **spec-clean golden** for fixed inputs.
 *   - **zero-warning + structurally complete** for every recognised event.
 *   - **read-side round trip**: `msg.appointments()` returns the identifiers,
 *     timing and resources supplied, and no appointment value the caller did
 *     not supply.
 *
 * All values are synthetic.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildSiu, findMessageStructureDefinition, parseHL7, type TS } from "../src/index.js";

import { ENVELOPE, SIU_INIT } from "./_helpers/supported-pairs.js";

const SIU_EVENTS = [
  "S12",
  "S13",
  "S14",
  "S15",
  "S16",
  "S17",
  "S18",
  "S19",
  "S20",
  "S21",
  "S22",
  "S23",
  "S24",
  "S26",
  "S27",
];

function golden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/build/${name}`, import.meta.url)), "utf8");
}

function toGoldenForm(hl7: string): string {
  return hl7.replaceAll("\r", "\n") + "\n";
}

describe("buildSiu", () => {
  it("emits the recorded spec-clean golden for fixed inputs", () => {
    expect(toGoldenForm(buildSiu("S12", SIU_INIT).toString())).toBe(golden("siu-s12.golden.hl7"));
  });

  it("is zero-warning and structurally complete for every recognised event", () => {
    for (const event of SIU_EVENTS) {
      const round = parseHL7(buildSiu(event, SIU_INIT).toString());
      expect(round.warnings, `SIU^${event}`).toEqual([]);
      expect(round.structure.recognized).toBe(true);
      expect(round.structure.missingGroups, `SIU^${event}`).toEqual([]);
      expect(round.meta.type).toBe(`SIU^${event}`);
    }
  });

  it("emits the RGS resource group the published structure requires", () => {
    expect(findMessageStructureDefinition("SIU", "S12")?.requiredSegments).toContain("RGS");
    const round = parseHL7(buildSiu("S12", SIU_INIT).toString());
    expect(round.segments("RGS").length).toBe(2);
    expect(round.get("RGS.1")).toBe("1");
    expect(round.get("RGS.3.1")).toBe("RG-1");
  });

  it("reads back the identifiers, timing and resources supplied", () => {
    const round = parseHL7(buildSiu("S12", SIU_INIT).toString());
    const appts = round.appointments();
    expect(appts.length).toBe(1);
    const appt = appts[0];
    expect(appt?.placerAppointmentId).toBe("PL-1001");
    expect(appt?.fillerAppointmentId).toBe("FL-2002");
    expect(appt?.startDateTime?.raw).toBe("20260801090000");
    expect(appt?.endDateTime?.raw).toBe("20260801093000");
    expect(appt?.fillerStatusCode?.identifier).toBe("Booked");
    expect(appt?.fillerStatusCode?.nameOfCodingSystem).toBe("HL70278");

    expect(appt?.resources.map((r) => r.kind)).toEqual([
      "location",
      "personnel",
      "service",
      "general",
    ]);
    expect(appt?.resources[0]?.code?.identifier).toBe("OR-1");
    expect(appt?.resources[1]?.person?.idNumber).toBe("9990");
    expect(appt?.resources[1]?.person?.familyName).toBe("Welby");
    expect(appt?.resources[2]?.code?.identifier).toBe("XR-CHEST");
    expect(appt?.resources[2]?.code?.text).toBe("Chest x-ray");
    expect(appt?.resources[3]?.code?.identifier).toBe("PORTABLE-1");
  });

  it("emits no appointment value the caller did not supply", () => {
    const msg = buildSiu("S12", {
      ...ENVELOPE,
      appointment: { fillerAppointmentId: "FL-1" },
      resourceGroups: [
        { setId: "1", resources: [{ kind: "location", code: { identifier: "R1" } }] },
      ],
    });
    const round = parseHL7(msg.toString());
    const appt = round.appointments()[0];
    expect(appt?.fillerAppointmentId).toBe("FL-1");
    expect(appt?.placerAppointmentId).toBeUndefined();
    expect(appt?.startDateTime).toBeUndefined();
    expect(appt?.endDateTime).toBeUndefined();
    expect(appt?.fillerStatusCode).toBeUndefined();
    expect(appt?.resources.length).toBe(1);
    expect(round.warnings).toEqual([]);
  });

  it("emits a PID only when a patient is supplied", () => {
    const without = parseHL7(
      buildSiu("S12", {
        ...ENVELOPE,
        appointment: { fillerAppointmentId: "FL-1" },
        resourceGroups: [{ setId: "1" }],
      }).toString(),
    );
    expect(without.segments("PID").length).toBe(0);
    expect(without.segments("PV1").length).toBe(0);
    expect(without.warnings).toEqual([]);
    expect(without.structure.missingGroups).toEqual([]);

    const with_ = parseHL7(buildSiu("S12", SIU_INIT).toString());
    expect(with_.segments("PID").length).toBe(1);
    expect(with_.patient?.mrn).toBe("MRN001");
    expect(with_.visit?.patientClass).toBe("O");
  });

  it("only a timed appointment carries SCH-11 at all", () => {
    const untimed = parseHL7(
      buildSiu("S15", {
        ...ENVELOPE,
        appointment: { fillerAppointmentId: "FL-1", fillerStatusCode: { identifier: "Cancelled" } },
        resourceGroups: [{ setId: "1" }],
      }).toString(),
    );
    expect(untimed.get("SCH.11")).toBeUndefined();
    expect(untimed.appointments()[0]?.startDateTime).toBeUndefined();

    // A start with no end still lands at TQ.4 and leaves TQ.5 absent.
    const startOnly = parseHL7(
      buildSiu("S12", {
        ...ENVELOPE,
        appointment: { startDateTime: "20260801090000" },
        resourceGroups: [{ setId: "1" }],
      }).toString(),
    );
    expect(startOnly.get("SCH.11.4")).toBe("20260801090000");
    expect(startOnly.appointments()[0]?.startDateTime?.raw).toBe("20260801090000");
    expect(startOnly.appointments()[0]?.endDateTime).toBeUndefined();
  });

  it("a resource carrying no identity content is emitted, and surfaces as none", () => {
    // The builder emits the AI* segment the caller asked for; the read side
    // declines to surface a resource with no id at all, rather than inventing
    // one. Neither side fabricates.
    const round = parseHL7(
      buildSiu("S12", {
        ...ENVELOPE,
        appointment: { fillerAppointmentId: "FL-1" },
        resourceGroups: [
          {
            setId: "1",
            resources: [
              { kind: "personnel", setId: "1" },
              { kind: "service", setId: "2" },
            ],
          },
        ],
      }).toString(),
    );
    expect(round.segments("AIP").length).toBe(1);
    expect(round.segments("AIS").length).toBe(1);
    expect(round.get("AIP.3")).toBeUndefined();
    expect(round.appointments()[0]?.resources).toEqual([]);
    expect(round.warnings).toEqual([]);
  });

  it("accepts a typed timestamp as well as a pre-formatted one, and a patient with no visit", () => {
    const start: TS = { raw: "20260801090000", valid: true, hasTimezone: false };
    const end: TS = { raw: "20260801093000", valid: true, hasTimezone: false };
    const round = parseHL7(
      buildSiu("S12", {
        ...ENVELOPE,
        patient: { identifiers: { idNumber: "MRN001" } },
        appointment: { startDateTime: start, endDateTime: end },
        resourceGroups: [{ setId: "1" }],
      }).toString(),
    );
    expect(round.segments("PID").length).toBe(1);
    expect(round.segments("PV1").length).toBe(0);
    expect(round.appointments()[0]?.startDateTime?.raw).toBe("20260801090000");
    expect(round.appointments()[0]?.endDateTime?.raw).toBe("20260801093000");
    expect(round.warnings).toEqual([]);
  });

  it("emit then parse then rebuild preserves the modelled appointment fields", () => {
    const first = parseHL7(buildSiu("S14", SIU_INIT).toString());
    const appt = first.appointments()[0];
    const rebuilt = parseHL7(
      buildSiu("S14", {
        ...ENVELOPE,
        appointment: {
          placerAppointmentId: appt?.placerAppointmentId ?? "",
          fillerAppointmentId: appt?.fillerAppointmentId ?? "",
          startDateTime: appt?.startDateTime?.raw ?? "",
          endDateTime: appt?.endDateTime?.raw ?? "",
          fillerStatusCode: appt?.fillerStatusCode ?? {},
        },
        resourceGroups: [
          {
            setId: "1",
            resources: (appt?.resources ?? []).map((r) =>
              r.kind === "personnel"
                ? { kind: r.kind, person: r.person ?? {} }
                : { kind: r.kind, code: r.code ?? {} },
            ),
          },
        ],
      }).toString(),
    );
    const second = rebuilt.appointments()[0];
    expect(second?.placerAppointmentId).toBe(appt?.placerAppointmentId);
    expect(second?.fillerAppointmentId).toBe(appt?.fillerAppointmentId);
    expect(second?.startDateTime?.raw).toBe(appt?.startDateTime?.raw);
    expect(second?.endDateTime?.raw).toBe(appt?.endDateTime?.raw);
    expect(second?.fillerStatusCode?.identifier).toBe(appt?.fillerStatusCode?.identifier);
    expect(second?.resources.map((r) => r.kind)).toEqual(appt?.resources.map((r) => r.kind));
    expect(rebuilt.warnings).toEqual([]);
  });
});
