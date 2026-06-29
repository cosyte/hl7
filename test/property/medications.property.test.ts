/**
 * Property tests for the Phase D medications safety contract.
 *
 * The load-bearing claims, over thousands of generated RX* segments:
 *   1. `medications()` NEVER throws on arbitrary RXO/RXE/RXD/RXA content
 *      (including malformed/empty fields and adversarial give amounts) —
 *      HELPERS-07 holds for the pharmacy extractor.
 *   2. A well-formed give code + amount survives parse → project verbatim
 *      (identifier, coding-system provenance, strict-parsed numeric).
 *   3. The give *amount* and give *strength* are surfaced independently — a
 *      strength is never derived from, reconciled with, or overwritten by the
 *      amount (Phase D §4). When RXE-25 carries an explicit strength it always
 *      survives unchanged regardless of the give amount.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseHL7 } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x0d_5e_2026 } as const;

const MSH = "MSH|^~\\&|APP|FAC|||20250102||RDE^O11|1|P|2.5\r";

// Fields that may contain delimiter-free junk — the parser must tolerate them
// and the helper must never throw.
const junkArb = fc.string({ maxLength: 12 }).filter((s) => !/[|^~\\&\r\n]/u.test(s));
// Identifier-shaped codes: alphanumeric, non-empty, no leading/trailing
// whitespace (the parser trims field whitespace — that's a separate, correct
// behavior we don't want to fight here).
const idArb = fc.stringMatching(/^[A-Za-z0-9]{1,12}$/u);
const numArb = fc.integer({ min: 0, max: 100_000 });
const rxTypeArb = fc.constantFrom("RXO", "RXE", "RXD", "RXA");

describe("property: medications() never throws (HELPERS-07)", () => {
  it("tolerates arbitrary RX* field content across all four contexts", () => {
    fc.assert(
      fc.property(rxTypeArb, junkArb, junkArb, junkArb, junkArb, (rxType, f1, f2, f3, f4) => {
        const seg = `${rxType}|${f1}|${f2}|${f3}|${f4}`;
        expect(() => {
          const meds = parseHL7(`${MSH}PID|||X\r${seg}\r`).medications();
          // Frozen + a single parent → exactly one medication.
          expect(Object.isFrozen(meds)).toBe(true);
        }).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: well-formed give code + amount project verbatim", () => {
  it("RXO give code (identifier + provenance) and min amount survive", () => {
    fc.assert(
      fc.property(idArb, fc.constantFrom("RXN", "NDC"), numArb, (code, system, amount) => {
        const seg = `RXO|${code}^Drug^${system}|${String(amount)}||mg^^UCUM`;
        const m = parseHL7(`${MSH}PID|||X\r${seg}\r`).medications()[0];
        expect(m?.context).toBe("order");
        expect(m?.giveCode?.identifier).toBe(code);
        expect(m?.giveCode?.nameOfCodingSystem).toBe(system);
        expect(m?.amount?.minimum).toBe(amount);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: amount and strength are independent (Phase D §4)", () => {
  it("an explicit RXE-25 strength survives unchanged for any give amount", () => {
    fc.assert(
      fc.property(numArb, numArb, (giveAmount, strength) => {
        // Build RXE by 1-indexed field position so RXE-25/26 land exactly.
        const fields: Record<number, string> = {
          1: "1",
          2: "1100^Drug^RXN",
          3: String(giveAmount),
          4: String(giveAmount),
          5: "TAB",
          25: String(strength),
          26: "mg^^UCUM",
        };
        const max = 26;
        const arr = Array.from({ length: max }, (_, i) => fields[i + 1] ?? "");
        const rxe = `RXE|${arr.join("|")}`;
        const m = parseHL7(`${MSH}PID|||X\r${rxe}\r`).medications()[0];
        // The strength is exactly what RXE-25 declared — never the give amount.
        expect(m?.strength?.value).toBe(strength);
        expect(m?.amount?.minimum).toBe(giveAmount);
      }),
      RUN_CONFIG,
    );
  });
});
