import { describe, expect, it } from "vitest";

import type { CX } from "../src/model/types/cx.js";

import { pickMrn } from "../src/helpers/pick-mrn.js";

describe("helpers/pick-mrn: pickMrn", () => {
  it("returns undefined on an empty array", () => {
    expect(pickMrn([])).toBeUndefined();
  });

  it("returns the single MR-typed CX's idNumber", () => {
    const identifiers: readonly CX[] = [
      { idNumber: "MRN001", identifierTypeCode: "MR" },
    ];
    expect(pickMrn(identifiers)).toBe("MRN001");
  });

  it("MR wins over an earlier non-MR entry (D-07)", () => {
    const identifiers: readonly CX[] = [
      { idNumber: "X1" },
      { idNumber: "MRN001", identifierTypeCode: "MR" },
    ];
    expect(pickMrn(identifiers)).toBe("MRN001");
  });

  it("falls back to the first CX's idNumber when no MR-typed entry exists (D-08)", () => {
    const identifiers: readonly CX[] = [
      { idNumber: "X1" },
      { idNumber: "X2", identifierTypeCode: "PI" },
    ];
    expect(pickMrn(identifiers)).toBe("X1");
  });

  it("is case-sensitive on 'MR' — lowercase 'mr' falls through to first idNumber (D-10)", () => {
    const identifiers: readonly CX[] = [
      { idNumber: "mrn001", identifierTypeCode: "mr" },
    ];
    // lowercase 'mr' does NOT match; fallback is the first CX's idNumber.
    expect(pickMrn(identifiers)).toBe("mrn001");
  });

  it("returns undefined when the first CX has no idNumber and no MR anywhere", () => {
    const identifiers: readonly CX[] = [{ checkDigit: "5" }, { idNumber: "X" }];
    // D-08: fallback is the FIRST CX's idNumber. First has none → undefined.
    expect(pickMrn(identifiers)).toBeUndefined();
  });

  it("returns the first CX's idNumber when a second MR-typed entry lacks idNumber (defensive)", () => {
    const identifiers: readonly CX[] = [
      { idNumber: "X1" },
      { identifierTypeCode: "MR" },
    ];
    // The MR-typed entry has no idNumber; MR loop skips, fallback to first.
    expect(pickMrn(identifiers)).toBe("X1");
  });

  it("never throws on any CX[] shape", () => {
    expect(() => pickMrn([])).not.toThrow();
    expect(() => pickMrn([{}])).not.toThrow();
    expect(() => pickMrn([{ idNumber: "X" }])).not.toThrow();
    expect(() =>
      pickMrn([{ idNumber: "X", identifierTypeCode: "MR" }]),
    ).not.toThrow();
    expect(() =>
      pickMrn([{ identifierTypeCode: "MR" }, { idNumber: "Y" }]),
    ).not.toThrow();
  });
});
