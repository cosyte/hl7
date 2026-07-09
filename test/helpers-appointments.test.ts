/**
 * Phase Q — integration tests for `msg.appointments()` (SIU scheduling:
 * SCH → [AIS/AIG/AIL/AIP] resource groups). Covers the SCH field map
 * (placer/filler ids, SCH-11 TQ start/end timing, SCH-25 filler status),
 * positional AI* resource grouping with the service/general/location/personnel
 * `kind`, and the HELPERS-07 never-throws + D-01 frozen / D-06 not-memoized
 * contracts.
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

const MSH = "MSH|^~\\&|SCHEDAPP|HOSP|RECV|FAC|20260419150000||SIU^S12^SIU_S12|M1|P|2.5.1\r";

describe("helpers/appointments: structure", () => {
  it("returns [] when no SCH segment present (D-05)", () => {
    expect(parseHL7(MSH + "PID|||X\r").appointments()).toEqual([]);
  });

  it("returns one Appointment per SCH, in document order", () => {
    const appts = parseHL7(loadFixture("siu-s12-appointment")).appointments();
    expect(appts).toHaveLength(1);
  });

  it("the result and its child arrays are frozen (D-01); not memoized (D-06)", () => {
    const msg = parseHL7(loadFixture("siu-s12-appointment"));
    const a = msg.appointments();
    const b = msg.appointments();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(Object.isFrozen(a[0]?.resources)).toBe(true);
    expect(a).not.toBe(b); // re-walked each call
  });
});

describe("helpers/appointments: SCH field map", () => {
  const appt = parseHL7(loadFixture("siu-s12-appointment")).appointments()[0];

  it("SCH-1 / SCH-2 placer + filler appointment ids", () => {
    expect(appt?.placerAppointmentId).toBe("PLACER-Q-001");
    expect(appt?.fillerAppointmentId).toBe("FILLER-Q-001");
  });

  it("SCH-25 filler status code (Table 0278) surfaced verbatim as a CWE", () => {
    expect(appt?.fillerStatusCode?.identifier).toBe("BOOKED");
    expect(appt?.fillerStatusCode?.text).toBe("Booked");
  });

  it("SCH-11 TQ.4 / TQ.5 start + end timing (fidelity TS)", () => {
    expect(appt?.startDateTime?.raw).toBe("20260501090000");
    expect(appt?.endDateTime?.raw).toBe("20260501093000");
  });
});

describe("helpers/appointments: AI* resource grouping", () => {
  const appt = parseHL7(loadFixture("siu-s12-appointment")).appointments()[0];

  it("groups AIS/AIG/AIL/AIP under the SCH with the right kind", () => {
    const kinds = appt?.resources.map((r) => r.kind);
    expect(kinds).toEqual(["service", "general", "location", "personnel"]);
  });

  it("AIS-3 service resource surfaces as a coded element", () => {
    const service = appt?.resources.find((r) => r.kind === "service");
    expect(service?.code?.identifier).toBe("CONSULT");
    expect(service?.code?.text).toBe("Cardiology Consult");
  });

  it("AIP-3 personnel (provider) surfaces a typed XCN plus the coded id", () => {
    const person = appt?.resources.find((r) => r.kind === "personnel");
    expect(person?.person?.idNumber).toBe("DR-100");
    expect(person?.person?.familyName).toBe("Welby");
    expect(person?.code?.identifier).toBe("DR-100");
  });
});

describe("helpers/appointments: never throws (HELPERS-07)", () => {
  it("tolerates a bare SCH with no resources", () => {
    expect(() => parseHL7(MSH + "SCH|A|B\r").appointments()).not.toThrow();
    const appt = parseHL7(MSH + "SCH|A|B\r").appointments()[0];
    expect(appt?.resources).toEqual([]);
  });

  it("drops AI* segments that precede any SCH (no phantom appointment)", () => {
    const appts = parseHL7(MSH + "AIS|1||X^Svc^L\rSCH|A|B\r").appointments();
    expect(appts).toHaveLength(1);
    expect(appts[0]?.resources).toEqual([]);
  });
});
