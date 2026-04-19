/**
 * Phase 4 Plan 03 — cache memoization + invalidation tests for `msg.visit`.
 * Parallel to Plan 02's `helpers-cache-invalidation.test.ts` (which covers
 * meta + patient + the D-06 collection assertion). This file is intentionally
 * disjoint so Plans 02 and 03 can run in parallel on Wave 2 without editing
 * the same test file.
 *
 * Coverage:
 *   - Memoization: `msg.visit === msg.visit` across reads (D-02).
 *   - Null-sentinel cache: `undefined` stays `undefined` across repeat reads
 *     on a no-PV1 message.
 *   - `addSegment("PV1", ...)` flips `visit` from `undefined` to defined.
 *   - `setField("PV1.N", ...)` drops the cache and re-surfaces the new value.
 *   - `removeSegment("PV1")` drops the cache back to `undefined`.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r";
const WITH_PV1 = MSH + "PID|||X\r" + "PV1|1|I";
const WITHOUT_PV1 = MSH + "PID|||X";

describe("helpers cache invalidation — visit (D-02 + HELPERS-03)", () => {
  it("msg.visit === msg.visit across reads (memoization)", () => {
    const msg = parseHL7(WITH_PV1);
    expect(msg.visit).toBe(msg.visit);
  });

  it("msg.visit stays undefined across repeat reads (null-sentinel cache)", () => {
    const msg = parseHL7(WITHOUT_PV1);
    expect(msg.visit).toBeUndefined();
    expect(msg.visit).toBeUndefined();
  });

  it("addSegment('PV1', ['1', 'O']) flips visit from undefined to defined", () => {
    const msg = parseHL7(WITHOUT_PV1);
    expect(msg.visit).toBeUndefined();
    msg.addSegment("PV1", ["1", "O"]);
    expect(msg.visit).toBeDefined();
    expect(msg.visit?.patientClass).toBe("O");
  });

  it("setField('PV1.2', 'E') drops the visit cache and surfaces the new value", () => {
    const msg = parseHL7(WITH_PV1);
    const before = msg.visit;
    expect(before?.patientClass).toBe("I");
    msg.setField("PV1.2", "E");
    const after = msg.visit;
    expect(after).not.toBe(before);
    expect(after?.patientClass).toBe("E");
  });

  it("removeSegment('PV1') drops the visit cache → undefined", () => {
    const msg = parseHL7(WITH_PV1);
    expect(msg.visit).toBeDefined();
    msg.removeSegment("PV1");
    expect(msg.visit).toBeUndefined();
  });
});
