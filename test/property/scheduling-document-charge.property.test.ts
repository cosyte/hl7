/**
 * Property tests for the Phase Q scheduling / document / charge safety contract.
 *
 * The load-bearing claims, over thousands of generated SCH / TXA / FT1 segments:
 *   1. `appointments()` / `documents()` / `charges()` NEVER throw on arbitrary
 *      segment content (malformed / empty / adversarial fields) — HELPERS-07.
 *   2. **MDM completion (TXA-17) and availability (TXA-19) are never conflated.**
 *      For any two distinct status tokens, the completion value lands on
 *      `completionStatus` and the availability value on `availabilityStatus` —
 *      never swapped, never merged, never one masking the other. Reading a
 *      preliminary document as final is the harm this guards.
 *   3. SCH-25 filler status is surfaced verbatim (provenance-only).
 *   4. FT1 extended/unit amounts are ALWAYS strings (never coerced to a number)
 *      and preserve their exact wire text — no money-as-float.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseHL7 } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x0e_5e_2026 } as const;

const MSH = "MSH|^~\\&|APP|FAC|||20250102||SIU^S12|1|T|2.5.1\r";
const PID = "PID|||X\r";

// Delimiter-free junk the parser must tolerate and the helpers must never throw on.
const junkArb = fc.string({ maxLength: 12 }).filter((s) => !/[|^~\\&\r\n]/u.test(s));
// Identifier-shaped status tokens: alphanumeric, non-empty, no surrounding whitespace.
const idArb = fc.stringMatching(/^[A-Za-z0-9]{1,8}$/u);

/** Build a segment from a 1-indexed field map so a value lands at an exact position. */
function seg(name: string, fields: Record<number, string>, max: number): string {
  const arr = Array.from({ length: max }, (_, i) => fields[i + 1] ?? "");
  return `${name}|${arr.join("|")}`;
}

describe("property: Phase Q helpers never throw (HELPERS-07)", () => {
  it("appointments() tolerates arbitrary SCH + AI* content", () => {
    fc.assert(
      fc.property(junkArb, junkArb, junkArb, (s1, s25, ais3) => {
        const raw = `${MSH}${PID}${seg("SCH", { 1: s1, 25: s25 }, 25)}\rAIS|1||${ais3}\r`;
        expect(() => {
          const appts = parseHL7(raw).appointments();
          expect(Object.isFrozen(appts)).toBe(true);
          expect(appts).toHaveLength(1);
        }).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });

  it("documents() tolerates arbitrary TXA content", () => {
    fc.assert(
      fc.property(junkArb, junkArb, junkArb, (t2, t17, t19) => {
        const raw = `${MSH}${PID}${seg("TXA", { 2: t2, 17: t17, 19: t19 }, 19)}\r`;
        expect(() => {
          const docs = parseHL7(raw).documents();
          expect(Object.isFrozen(docs)).toBe(true);
          expect(docs).toHaveLength(1);
        }).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });

  it("charges() tolerates arbitrary FT1 content", () => {
    fc.assert(
      fc.property(junkArb, junkArb, junkArb, (f6, f7, f11) => {
        const raw = `${MSH}${PID}${seg("FT1", { 1: "1", 6: f6, 7: f7, 11: f11 }, 19)}\r`;
        expect(() => {
          const charges = parseHL7(raw).charges();
          expect(Object.isFrozen(charges)).toBe(true);
          expect(charges).toHaveLength(1);
        }).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: TXA-17 completion and TXA-19 availability are never conflated", () => {
  it("distinct tokens land on their own axis, never swapped or merged", () => {
    fc.assert(
      fc.property(idArb, idArb, (completion, availability) => {
        const raw = `${MSH}${PID}${seg("TXA", { 1: "1", 17: completion, 19: availability }, 19)}\r`;
        const doc = parseHL7(raw).documents()[0];
        // Each value is surfaced on exactly its own field — the completion token
        // never leaks into availability and vice-versa.
        expect(doc?.completionStatus).toBe(completion);
        expect(doc?.availabilityStatus).toBe(availability);
      }),
      RUN_CONFIG,
    );
  });

  it("completion present + availability absent never borrows the completion value", () => {
    fc.assert(
      fc.property(idArb, (completion) => {
        const raw = `${MSH}${PID}${seg("TXA", { 1: "1", 17: completion }, 17)}\r`;
        const doc = parseHL7(raw).documents()[0];
        expect(doc?.completionStatus).toBe(completion);
        expect(doc?.availabilityStatus).toBeUndefined();
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: SCH-25 filler status is surfaced verbatim", () => {
  it("any identifier-shaped SCH-25 token round-trips onto fillerStatusCode.identifier", () => {
    fc.assert(
      fc.property(idArb, (status) => {
        const raw = `${MSH}${PID}${seg("SCH", { 1: "A", 25: status }, 25)}\r`;
        const appt = parseHL7(raw).appointments()[0];
        expect(appt?.fillerStatusCode?.identifier).toBe(status);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: FT1 amounts are always strings, never money-as-float", () => {
  it("a numeric price wire value is preserved exactly, as a string", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{1,6}(\.[0-9]{1,4})?$/u), (price) => {
        const raw = `${MSH}${PID}${seg("FT1", { 1: "1", 6: "CG", 11: price, 12: price }, 12)}\r`;
        const charge = parseHL7(raw).charges()[0];
        expect(typeof charge?.amountExtended).toBe("string");
        expect(charge?.amountExtended).toBe(price); // digit-for-digit, no rounding
        expect(charge?.amountUnit).toBe(price);
      }),
      RUN_CONFIG,
    );
  });
});
