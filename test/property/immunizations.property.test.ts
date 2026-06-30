/**
 * Property tests for the Phase E immunization safety contract.
 *
 * The load-bearing claims, over thousands of generated RXA segments:
 *   1. `immunizations()` NEVER throws on arbitrary RXA content (including
 *      malformed/empty fields and adversarial dose amounts) — HELPERS-07 holds
 *      for the VXU extractor.
 *   2. A well-formed CVX vaccine code + dose amount survives parse → project
 *      verbatim (identifier, coding-system provenance, strict-parsed numeric).
 *   3. The action code (RXA-21) is surfaced VERBATIM and never defaulted — a
 *      mis-keyed A/D/U corrupts an IIS add/delete/update dedup, so the helper
 *      must echo exactly what the wire carried, for any value.
 *   4. `recordOrigin` is derived ONLY from the well-known NIP001 RXA-9.1 codes
 *      (`00` administered; `01`-`08` historical) and OMITTED otherwise — the
 *      classification never guesses.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseHL7 } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x0e_5e_2026 } as const;

const MSH = "MSH|^~\\&|APP|FAC|||20250102||VXU^V04|1|T|2.5.1\r";

// Delimiter-free junk the parser must tolerate and the helper must never throw on.
const junkArb = fc.string({ maxLength: 12 }).filter((s) => !/[|^~\\&\r\n]/u.test(s));
// Identifier-shaped codes: alphanumeric, non-empty, no surrounding whitespace
// (the parser trims field whitespace — a separate, correct behavior).
const idArb = fc.stringMatching(/^[A-Za-z0-9]{1,12}$/u);
const numArb = fc.integer({ min: 0, max: 100_000 });

/** Build an RXA from a 1-indexed field map (so RXA-9/21 land exactly). */
function rxa(fields: Record<number, string>, max = 21): string {
  const arr = Array.from({ length: max }, (_, i) => fields[i + 1] ?? "");
  return `RXA|${arr.join("|")}`;
}

describe("property: immunizations() never throws (HELPERS-07)", () => {
  it("tolerates arbitrary RXA field content", () => {
    fc.assert(
      fc.property(junkArb, junkArb, junkArb, junkArb, (f5, f6, f9, f21) => {
        const seg = rxa({ 5: f5, 6: f6, 9: f9, 21: f21 });
        expect(() => {
          const imms = parseHL7(`${MSH}PID|||X\r${seg}\r`).immunizations();
          expect(Object.isFrozen(imms)).toBe(true);
          expect(imms).toHaveLength(1);
        }).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: a well-formed CVX vaccine + dose project verbatim", () => {
  it("RXA-5 vaccine code (identifier + provenance) and RXA-6 dose survive", () => {
    fc.assert(
      fc.property(idArb, fc.constantFrom("CVX", "NDC"), numArb, (code, system, dose) => {
        const seg = rxa({ 5: `${code}^Vaccine^${system}`, 6: String(dose) });
        const imm = parseHL7(`${MSH}PID|||X\r${seg}\r`).immunizations()[0];
        expect(imm?.vaccineCode?.identifier).toBe(code);
        expect(imm?.vaccineCode?.nameOfCodingSystem).toBe(system);
        expect(imm?.doseAmount).toBe(dose);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: action code (RXA-21) is surfaced verbatim, never defaulted", () => {
  it("any non-empty RXA-21 token round-trips exactly onto actionCode", () => {
    fc.assert(
      fc.property(idArb, (action) => {
        const seg = rxa({ 5: "115^Tdap^CVX", 21: action });
        const imm = parseHL7(`${MSH}PID|||X\r${seg}\r`).immunizations()[0];
        expect(imm?.actionCode).toBe(action);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: recordOrigin derives only from NIP001, else omitted (fail-safe)", () => {
  it("00 → administered; 01-08 → historical; anything else → undefined", () => {
    fc.assert(
      fc.property(idArb, (code) => {
        const seg = rxa({ 5: "115^Tdap^CVX", 9: `${code}^Source^NIP001` });
        const imm = parseHL7(`${MSH}PID|||X\r${seg}\r`).immunizations()[0];
        const expected =
          code === "00" ? "administered" : /^0[1-8]$/u.test(code) ? "historical" : undefined;
        expect(imm?.recordOrigin).toBe(expected);
        // The raw claim is preserved regardless of classification.
        expect(imm?.informationSource?.identifier).toBe(code);
      }),
      RUN_CONFIG,
    );
  });
});
