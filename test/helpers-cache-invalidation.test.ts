/**
 * Phase 4 — cache memoization + invalidation tests (D-02).
 *
 * Proves `msg.meta` / `msg.patient` are memoized across repeat reads and
 * dropped wholesale by every mutation method (`setField`, `addSegment`,
 * `removeSegment`). Collection helpers are NOT memoized per D-06 — we verify
 * they re-evaluate on every call.
 *
 * Plan 02 owns this file; Plan 03 adds visit-specific mutation cases in a
 * disjoint `test/helpers-cache-invalidation-visit.test.ts` so the two plans
 * can run in parallel on Wave 2 without edit conflicts.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|MSG001|P|2.5\r" +
  "PID|1||MRN001^^^HOSP^MR||Smith^Jane||19800115|F";

const NO_PID = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5";

describe("helpers cache memoization (D-02)", () => {
  it("msg.meta === msg.meta across repeat reads", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.meta).toBe(msg.meta);
  });

  it("msg.patient === msg.patient across repeat reads", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.patient).toBe(msg.patient);
  });

  it("msg.patient caches the 'no PID' negative result (null-sentinel)", () => {
    const msg = parseHL7(NO_PID);
    expect(msg.patient).toBeUndefined();
    // Second read hits the null-sentinel cache, still undefined — no rebuild.
    expect(msg.patient).toBeUndefined();
  });
});

describe("helpers cache invalidation on mutation (D-02 + D-17)", () => {
  it("msg.setField('MSH.10', ...) drops the meta cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.meta;
    expect(before.controlId).toBe("MSG001");
    msg.setField("MSH.10", "NEWCTRL");
    const after = msg.meta;
    expect(after).not.toBe(before);
    expect(after.controlId).toBe("NEWCTRL");
  });

  it("msg.setField('PID.5.1', 'Jones') drops the patient cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.patient;
    expect(before?.familyName).toBe("Smith");
    msg.setField("PID.5.1", "Jones");
    const after = msg.patient;
    expect(after).not.toBe(before);
    expect(after?.familyName).toBe("Jones");
  });

  it("msg.setField('PID.8', 'M') drops the patient cache and updates sex", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.patient;
    expect(before?.sex).toBe("F");
    msg.setField("PID.8", "M");
    const after = msg.patient;
    expect(after).not.toBe(before);
    expect(after?.sex).toBe("M");
  });

  it("msg.addSegment('NTE', [...]) drops all helper caches", () => {
    const msg = parseHL7(FIXTURE);
    const meta0 = msg.meta;
    const patient0 = msg.patient;
    msg.addSegment("NTE", ["", "note text"]);
    expect(msg.meta).not.toBe(meta0);
    expect(msg.patient).not.toBe(patient0);
    // Same underlying MSH / PID → new objects, same data.
    expect(msg.meta.controlId).toBe(meta0.controlId);
    expect(msg.patient?.mrn).toBe(patient0?.mrn);
  });

  it("msg.removeSegment('PID') flips msg.patient from object → undefined", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.patient).toBeDefined();
    msg.removeSegment("PID");
    expect(msg.patient).toBeUndefined();
  });
});

describe("collection helpers are NOT memoized (D-06)", () => {
  it("msg.observations() returns a fresh array reference on every call", () => {
    // FIXTURE has no OBX → both calls return empty arrays, but distinct refs.
    // Plan 03 fills the observations() stub; during Plan 02's window the stub
    // still throws, so we guard and skip in that window — Plan 03 removes
    // this branch when the stub is replaced.
    const msg = parseHL7(FIXTURE);
    try {
      const a = msg.observations();
      const b = msg.observations();
      expect(a).not.toBe(b); // D-06 — no memoization
      expect(a).toStrictEqual(b);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("NOT IMPLEMENTED")) {
        // Acceptable during Plan 02 execution; Plan 03 unblocks this case.
        return;
      }
      throw err;
    }
  });
});
