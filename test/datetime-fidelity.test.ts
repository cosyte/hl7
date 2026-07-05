/**
 * Phase N accuracy sweep — datetime precision + timezone fidelity against the
 * three `test/fixtures/datetime/*.hl7` fixtures. These assert the reader-facing
 * contract: precision is preserved (no zero-fill), a missing offset is flagged
 * (never silently UTC, never day-rolled), and an explicit offset survives.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dtmToDate, parseHL7 } from "../src/index.js";

function load(name: string): string {
  return readFileSync(join(__dirname, "fixtures", "datetime", name), "utf8");
}

describe("datetime fidelity: precision-year.hl7 (|1970| DOB stays a year)", () => {
  it("preserves year-only precision on the DOB — never a full instant", () => {
    const dob = parseHL7(load("precision-year.hl7")).patient?.dateOfBirth;
    expect(dob?.valid).toBe(true);
    expect(dob?.precision).toBe("year");
    expect(dob?.year).toBe(1970);
    expect(dob?.month).toBeUndefined();
    expect(dob?.raw).toBe("1970");
    // Refuses to invent a day/zone: no absolute instant without an assumption.
    expect(dob === undefined ? undefined : dtmToDate(dob)).toBeUndefined();
  });
});

describe("datetime fidelity: no-timezone-midnight.hl7 (|198807050000| must not roll the day)", () => {
  it("keeps day 5 at minute precision with no timezone resolution", () => {
    const dob = parseHL7(load("no-timezone-midnight.hl7")).patient?.dateOfBirth;
    expect(dob?.precision).toBe("minute");
    expect(dob).toMatchObject({ year: 1988, month: 7, day: 5, hour: 0, minute: 0 });
    expect(dob?.hasTimezone).toBe(false);
    // No silent UTC. The consumer must supply the sender's zone to get an instant.
    expect(dob === undefined ? undefined : dtmToDate(dob)).toBeUndefined();
    // With an explicit assumption the day never rolls backward.
    const assumed = dob === undefined ? undefined : dtmToDate(dob, { assumeOffsetMinutes: 0 });
    expect(assumed?.toISOString()).toBe("1988-07-05T00:00:00.000Z");
  });
});

describe("datetime fidelity: tz-offset.hl7 (explicit offset preserved)", () => {
  it("surfaces the MSH-7 message time with its offset", () => {
    const ts = parseHL7(load("tz-offset.hl7")).meta.timestamp;
    expect(ts?.hasTimezone).toBe(true);
    expect(ts?.offsetMinutes).toBe(-300);
    expect(ts === undefined ? undefined : dtmToDate(ts)?.toISOString()).toBe(
      "2025-01-02T20:30:45.000Z",
    );
  });

  it("surfaces the OBX-14 observation time with its +offset as a TS value", () => {
    const msg = parseHL7(load("tz-offset.hl7"));
    const observed = msg.orders()[0]?.observations[0]?.observedDateTime;
    expect(observed).toMatchObject({ hasTimezone: true, offsetMinutes: 300 });
    expect(observed === undefined ? undefined : dtmToDate(observed)?.toISOString()).toBe(
      "2025-01-02T10:30:45.000Z",
    );
  });
});
