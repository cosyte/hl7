/**
 * Phase Q — integration tests for `msg.charges()` (DFT^P03: one Charge per FT1).
 * Covers the FT1 field map (FT1-6 transaction type, FT1-7 code, FT1-11/12
 * extended/unit amount as VERBATIM wire text — never money-as-float, FT1-19
 * repeating diagnosis linkage), one-per-FT1 document order, and the
 * HELPERS-07 / D-01 / D-06 contracts.
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

const MSH = "MSH|^~\\&|BILLAPP|HOSP|FIN|MAIN|20260419170000||DFT^P03^DFT_P03|M1|P|2.5.1\r";

describe("helpers/charges: structure", () => {
  it("returns [] when no FT1 segment present (D-05)", () => {
    expect(parseHL7(MSH + "PID|||X\r").charges()).toEqual([]);
  });

  it("returns one Charge per FT1, in document order", () => {
    expect(parseHL7(loadFixture("dft-p03-charge")).charges()).toHaveLength(2);
  });

  it("the result and its child arrays are frozen (D-01); not memoized (D-06)", () => {
    const msg = parseHL7(loadFixture("dft-p03-charge"));
    const a = msg.charges();
    const b = msg.charges();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(Object.isFrozen(a[0]?.diagnoses)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("helpers/charges: FT1 field map", () => {
  const charge = parseHL7(loadFixture("dft-p03-charge")).charges()[0];

  it("FT1-6 transaction type (Table 0017) verbatim", () => {
    expect(charge?.transactionType).toBe("CG");
  });

  it("FT1-7 transaction code (institution charge code) as a CWE", () => {
    expect(charge?.transactionCode?.identifier).toBe("80053");
    expect(charge?.transactionCode?.text).toBe("Comprehensive metabolic panel");
  });

  it("FT1-4 transaction date (fidelity TS); FT1-10 quantity (NM)", () => {
    expect(charge?.transactionDate?.raw).toBe("20260419");
    expect(charge?.quantity).toBe(1);
  });

  it("FT1-19 repeating diagnosis linkage — all repetitions surface", () => {
    expect(charge?.diagnoses).toHaveLength(2);
    expect(charge?.diagnoses[0]?.identifier).toBe("E11.9");
    expect(charge?.diagnoses[1]?.identifier).toBe("I10");
  });
});

describe("helpers/charges: amounts are verbatim wire text, never money-as-float", () => {
  const charge = parseHL7(loadFixture("dft-p03-charge")).charges()[0];

  it("FT1-11 extended amount surfaced as the full CP wire text (price^currency)", () => {
    expect(charge?.amountExtended).toBe("150.00^USD");
    expect(typeof charge?.amountExtended).toBe("string"); // never coerced to a number
  });

  it("FT1-12 unit amount surfaced as the full CP wire text", () => {
    expect(charge?.amountUnit).toBe("150.00^USD");
  });

  it("a high-precision amount is preserved digit-for-digit (no float rounding)", () => {
    const seg = "FT1|1|T||20260419||CG|CODE^d^L|||1|0.1^USD|0.1^USD\r";
    const c = parseHL7(MSH + seg).charges()[0];
    expect(c?.amountExtended).toBe("0.1^USD"); // not 0.10000000000000001
  });
});

describe("helpers/charges: never throws (HELPERS-07)", () => {
  it("tolerates a bare FT1 with no fields", () => {
    expect(() => parseHL7(MSH + "FT1\r").charges()).not.toThrow();
    expect(parseHL7(MSH + "FT1|1\r").charges()[0]?.diagnoses).toEqual([]);
  });
});
