/**
 * Public barrel smoke tests — verify that every symbol the plan promised is
 * importable from `@cosyte/hl7` (via the source barrel) as both named
 * and namespace forms. The compile-time checks are implicit: if any import
 * breaks the file fails typecheck, and vitest won't even load it.
 */

import { describe, expect, it } from "vitest";

// Value imports
import {
  parseHL7,
  Hl7Message,
  Segment,
  Field,
  parsePath,
  resolvePath,
  parseXpn,
  parseXad,
  parseCx,
  parseCwe,
  parseCe,
  parseXtn,
  parsePl,
  parseTs,
  parseNm,
  parseHd,
  HL7,
} from "../src/index.js";

// Type-only imports (named)
import type { XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD, DotPath } from "../src/index.js";
import type { MessageStructure, StructureGroup } from "../src/index.js";

describe("public exports: Phase 3 surface", () => {
  it("re-exports 10 composite parsers as values", () => {
    expect(typeof parseXpn).toBe("function");
    expect(typeof parseXad).toBe("function");
    expect(typeof parseCx).toBe("function");
    expect(typeof parseCwe).toBe("function");
    expect(typeof parseCe).toBe("function");
    expect(typeof parseXtn).toBe("function");
    expect(typeof parsePl).toBe("function");
    expect(typeof parseTs).toBe("function");
    expect(typeof parseNm).toBe("function");
    expect(typeof parseHd).toBe("function");
  });

  it("re-exports Segment and Field classes as values", () => {
    expect(typeof Segment).toBe("function");
    expect(typeof Field).toBe("function");
  });

  it("re-exports parsePath and resolvePath as values", () => {
    expect(typeof parsePath).toBe("function");
    expect(typeof resolvePath).toBe("function");
  });

  it("HL7 namespace is a runtime object (even though it's types-only)", () => {
    // `export * as HL7 from namespace.js` emits a runtime object even when
    // the re-exports are all type-only. Verify the runtime binding exists.
    expect(HL7).toBeDefined();
    expect(typeof HL7).toBe("object");
  });

  it("preserves Phase 1/2 exports (parseHL7, Hl7Message)", () => {
    expect(typeof parseHL7).toBe("function");
    expect(typeof Hl7Message).toBe("function");
  });

  it("type-only imports resolve (compile-time check via usage)", () => {
    const xpn: XPN = { familyName: "Smith" };
    const xad: XAD = { street: "1 Main" };
    const ts: TS = {
      raw: "20250101",
      valid: true,
      precision: "day",
      year: 2025,
      month: 1,
      day: 1,
      hasTimezone: false,
    };
    const nm: NM = { raw: "120", value: 120 };
    const cx: CX = { idNumber: "1" };
    const cwe: CWE = { identifier: "X" };
    const ce: CE = { identifier: "X" };
    const xtn: XTN = { telephoneNumber: "555" };
    const pl: PL = { pointOfCare: "ICU" };
    const hd: HD = { namespaceId: "APP" };
    const dp: DotPath = { segmentType: "PID", segmentIndex: 0, fieldIndex: 5 };

    // HL7.XPN namespace-access type also compiles:
    const xpn2: HL7.XPN = { familyName: "Jones" };

    expect(xpn.familyName).toBe("Smith");
    expect(xad.street).toBe("1 Main");
    expect(ts.raw).toBe("20250101");
    expect(nm.value).toBe(120);
    expect(cx.idNumber).toBe("1");
    expect(cwe.identifier).toBe("X");
    expect(ce.identifier).toBe("X");
    expect(xtn.telephoneNumber).toBe("555");
    expect(pl.pointOfCare).toBe("ICU");
    expect(hd.namespaceId).toBe("APP");
    expect(dp.segmentType).toBe("PID");
    expect(xpn2.familyName).toBe("Jones");
  });
});

describe("public exports: Phase G structure surface", () => {
  it("re-exports the structure analyzer + registry + warning factory as values", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.analyzeMessageStructure).toBe("function");
    expect(Array.isArray(mod.MESSAGE_STRUCTURE_DEFINITIONS)).toBe(true);
    expect(typeof mod.missingExpectedGroup).toBe("function");
    expect(mod.WARNING_CODES.MISSING_EXPECTED_GROUP).toBe("MISSING_EXPECTED_GROUP");
  });

  it("structure types resolve (compile-time check via usage)", async () => {
    const { analyzeMessageStructure } = await import("../src/index.js");
    const s: MessageStructure = analyzeMessageStructure("ORU", "R01", new Set(["MSH"]));
    const g: StructureGroup | undefined = s.expectedGroups[0];
    expect(s.recognized).toBe(true);
    expect(g?.present).toBe(false);
  });
});
