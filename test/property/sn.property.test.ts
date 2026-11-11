/**
 * Property tests for the Phase B SN (Structured Numeric) safety contract.
 *
 * The load-bearing clinical claim: a comparator or range carried in an
 * `OBX-2 = SN` result is NEVER silently dropped. The pre-Phase-B parser sent
 * SN through the plain-string branch, where `<^10` collapsed to the bare
 * string "<": a misread result with a documented patient-harm path
 * (OpenSAFELY: ~36% of pathology results carry a comparator).
 *
 * Invariants, over thousands of generated SN values:
 *   1. A recognized comparator survives parse → project: it is never lost and
 *      never mutated into a different operator.
 *   2. `num1`/`num2` are the generated numbers (or `undefined`), never `NaN`
 *      and never a different number.
 *   3. The SN field survives a message serialize → parse round-trip byte-for-byte
 *      (the comparator is preserved on the wire, not just in the projection).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checkProperty } from "../_helpers/property.js";

import type { SN } from "../../src/model/types/sn.js";
import { parseHL7 } from "../../src/index.js";

// The pull-request depth this file ran at before the shared runner, kept; the nightly run's
// COSYTE_PROPERTY_RUNS wins over it (property-depth: kept, not lowered).
const RUN_CONFIG = { numRuns: 500 } as const;

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|P|2.5\r";

const comparatorArb = fc.constantFrom(">", "<", ">=", "<=", "=", "<>", "");
const separatorArb = fc.constantFrom("-", ":", "/", "+", ".", "");
const numArb = fc.integer({ min: -100_000, max: 100_000 });

describe("property: SN comparator/range is never lost", () => {
  it("projected SN preserves comparator and numbers exactly", () => {
    checkProperty(
      fc.property(
        comparatorArb,
        numArb,
        separatorArb,
        fc.option(numArb, { nil: undefined }),
        (comparator, num1, separator, num2) => {
          const obx5 = `${comparator}^${String(num1)}^${separator}^${num2 === undefined ? "" : String(num2)}`;
          const msg = parseHL7(`${MSH}OBX|1|SN|GLU^Glucose^LN||${obx5}|mg/dL^^UCUM\r`);
          const o = msg.observations()[0];
          expect(o?.valueType).toBe("SN");
          const v = o?.value as SN | undefined;

          // 1 + 2: comparator and numbers survive verbatim.
          expect(v?.comparator).toBe(comparator === "" ? undefined : comparator);
          expect(v?.num1).toBe(num1);
          expect(v?.num2).toBe(num2);
          expect(v?.separatorOrSuffix).toBe(separator === "" ? undefined : separator);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a `<`/`>` comparator never silently becomes the opposite or disappears", () => {
    checkProperty(
      fc.property(fc.constantFrom("<", ">", "<=", ">="), numArb, (comparator, num1) => {
        const msg = parseHL7(`${MSH}OBX|1|SN|CRE^Creatinine^LN||${comparator}^${String(num1)}\r`);
        const v = msg.observations()[0]?.value as SN | undefined;
        expect(v?.comparator).toBe(comparator);
        expect(v?.num1).toBe(num1);
      }),
      RUN_CONFIG,
    );
  });

  it("the SN field survives a serialize → parse round-trip byte-for-byte", () => {
    checkProperty(
      fc.property(
        comparatorArb,
        numArb,
        separatorArb,
        numArb,
        (comparator, num1, separator, num2) => {
          const obx5 = `${comparator}^${String(num1)}^${separator}^${String(num2)}`;
          const original = parseHL7(`${MSH}OBX|1|SN|GLU^Glucose^LN||${obx5}\r`);
          const roundTripped = parseHL7(original.toString());
          expect(roundTripped.rawSegments).toEqual(original.rawSegments);
        },
      ),
      RUN_CONFIG,
    );
  });
});
