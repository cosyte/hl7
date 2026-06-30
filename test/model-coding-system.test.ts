import { describe, expect, it } from "vitest";

import type { CE } from "../src/model/types/ce.js";
import type { CWE } from "../src/model/types/cwe.js";
import {
  KNOWN_CODING_SYSTEMS,
  alternateCodingSystemOf,
  codingSystem,
  codingSystemOf,
} from "../src/model/coding-system.js";

describe("model/coding-system: KNOWN_CODING_SYSTEMS map", () => {
  it("carries the safety-relevant Table 0396 subset with registered names", () => {
    const byId = new Map(KNOWN_CODING_SYSTEMS.map((s) => [s.id, s.name]));
    expect(byId.get("LN")).toBe("LOINC");
    expect(byId.get("SCT")).toBe("SNOMED CT");
    expect(byId.get("I10")).toBe("ICD-10");
    expect(byId.get("I10P")).toBe("ICD-10-PCS");
    expect(byId.get("RXN")).toBe("RxNorm");
    expect(byId.get("NDC")).toBe("National Drug Codes");
    expect(byId.get("CVX")).toBe("CDC Vaccine Codes");
    expect(byId.get("MVX")).toBe("CDC Vaccine Manufacturer Codes");
    expect(byId.get("UCUM")).toBe("Unified Code for Units of Measure");
  });

  it("registers I10 as the WHO base ICD-10, NOT a guessed ICD-10-CM (fail-safe)", () => {
    const i10 = KNOWN_CODING_SYSTEMS.find((s) => s.id === "I10");
    expect(i10?.name).toBe("ICD-10");
    expect(i10?.name).not.toContain("CM");
  });

  it("is deeply frozen (read-only map, no mutation risk)", () => {
    expect(Object.isFrozen(KNOWN_CODING_SYSTEMS)).toBe(true);
    expect(KNOWN_CODING_SYSTEMS.every((s) => Object.isFrozen(s))).toBe(true);
    expect(KNOWN_CODING_SYSTEMS.every((s) => Object.isFrozen(s.aliases))).toBe(true);
  });

  it("has no duplicate ids or alias collisions across entries", () => {
    const keys = new Set<string>();
    for (const s of KNOWN_CODING_SYSTEMS) {
      for (const k of [s.id, ...s.aliases].map((x) => x.toUpperCase())) {
        expect(keys.has(k)).toBe(false);
        keys.add(k);
      }
    }
  });
});

describe("model/coding-system: codingSystem() resolver", () => {
  it("resolves a registered acronym directly", () => {
    expect(codingSystem("LN")).toStrictEqual({
      claimed: "LN",
      known: true,
      id: "LN",
      name: "LOINC",
    });
  });

  it("normalizes name aliases to the registered acronym", () => {
    expect(codingSystem("LOINC")).toStrictEqual({
      claimed: "LOINC",
      known: true,
      id: "LN",
      name: "LOINC",
    });
    expect(codingSystem("SNOMED")?.id).toBe("SCT");
    expect(codingSystem("SNM")?.id).toBe("SCT");
    expect(codingSystem("RxNorm")?.id).toBe("RXN");
  });

  it("matches case-insensitively and tolerates surrounding whitespace", () => {
    expect(codingSystem("ln")?.id).toBe("LN");
    expect(codingSystem("  sct ")?.id).toBe("SCT");
    expect(codingSystem("UcUm")?.id).toBe("UCUM");
  });

  it("preserves the claimed value verbatim (original case/spelling)", () => {
    const info = codingSystem("  LoInC ");
    expect(info?.claimed).toBe("  LoInC ");
    expect(info?.id).toBe("LN");
  });

  it("surfaces an unknown system verbatim with known:false — never dropped, never guessed", () => {
    expect(codingSystem("99zL")).toStrictEqual({ claimed: "99zL", known: false });
    // A local/proprietary system claim is reported, not silently discarded.
    const local = codingSystem("L");
    expect(local?.known).toBe(false);
    expect(local?.claimed).toBe("L");
    expect("id" in (local ?? {})).toBe(false);
    expect("name" in (local ?? {})).toBe(false);
  });

  it("does NOT upgrade a bare I10 claim to ICD-10-CM", () => {
    expect(codingSystem("I10")?.name).toBe("ICD-10");
    expect(codingSystem("ICD-10")?.id).toBe("I10");
  });

  it("returns undefined when there is no claim to resolve", () => {
    expect(codingSystem(undefined)).toBeUndefined();
    expect(codingSystem("")).toBeUndefined();
    expect(codingSystem("   ")).toBeUndefined();
  });

  it("returns a frozen result", () => {
    expect(Object.isFrozen(codingSystem("LN"))).toBe(true);
    expect(Object.isFrozen(codingSystem("zzz"))).toBe(true);
  });
});

describe("model/coding-system: accessors over CWE/CE", () => {
  it("codingSystemOf reads the primary system of a CWE", () => {
    const cwe: CWE = { identifier: "1234-5", nameOfCodingSystem: "LN" };
    expect(codingSystemOf(cwe)).toStrictEqual({
      claimed: "LN",
      known: true,
      id: "LN",
      name: "LOINC",
    });
  });

  it("codingSystemOf reads the primary system of a CE", () => {
    const ce: CE = { identifier: "E11.9", nameOfCodingSystem: "I10" };
    expect(codingSystemOf(ce)?.name).toBe("ICD-10");
  });

  it("alternateCodingSystemOf reads the alternate system (dual coding)", () => {
    // A problem dual-coded SNOMED (primary) + ICD-10 (alternate).
    const cwe: CWE = {
      identifier: "44054006",
      nameOfCodingSystem: "SCT",
      alternateIdentifier: "E11.9",
      nameOfAlternateCodingSystem: "I10",
    };
    expect(codingSystemOf(cwe)?.id).toBe("SCT");
    expect(alternateCodingSystemOf(cwe)?.id).toBe("I10");
  });

  it("returns undefined when the coded element claims no system", () => {
    const cwe: CWE = { identifier: "X" };
    expect(codingSystemOf(cwe)).toBeUndefined();
    expect(alternateCodingSystemOf(cwe)).toBeUndefined();
  });
});
