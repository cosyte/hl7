import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseCx } from "../src/model/types/cx.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/cx: parseCx", () => {
  it("extracts idNumber from component 1", () => {
    const out = parseCx(rep([["123"]]), enc);
    expect(out).toStrictEqual({ idNumber: "123" });
  });

  it("parses nested HD in component 4 (assigningAuthority)", () => {
    const out = parseCx(rep([["123"], [""], [""], ["APP", "1.2.3", "UUID"]]), enc);
    expect(out.idNumber).toBe("123");
    expect(out.assigningAuthority).toStrictEqual({
      namespaceId: "APP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it("omits assigningAuthority when component 4 is all empty subs", () => {
    const out = parseCx(rep([["123"], [""], [""], ["", "", ""]]), enc);
    expect("assigningAuthority" in out).toBe(false);
  });

  it("populates all 10 components when present", () => {
    const out = parseCx(
      rep([
        ["123"],
        ["1"],
        ["M11"],
        ["APP", "1.2.3", "UUID"],
        ["MR"],
        ["FAC"],
        ["20250101"],
        ["20991231"],
        ["Jur"],
        ["Dept"],
      ]),
      enc,
    );
    expect(out).toStrictEqual({
      idNumber: "123",
      checkDigit: "1",
      checkDigitScheme: "M11",
      assigningAuthority: {
        namespaceId: "APP",
        universalId: "1.2.3",
        universalIdType: "UUID",
      },
      identifierTypeCode: "MR",
      assigningFacility: "FAC",
      effectiveDate: "20250101",
      expirationDate: "20991231",
      assigningJurisdiction: "Jur",
      assigningAgencyOrDepartment: "Dept",
    });
  });

  it("returns empty object on zero components", () => {
    expect(parseCx({ components: [] }, enc)).toStrictEqual({});
  });

  it("returns idNumber verbatim (no double-decode)", () => {
    const out = parseCx(rep([["123\\F\\456"]]), enc);
    expect(out.idNumber).toBe("123\\F\\456");
  });

  it("populates partial assigningAuthority (only namespaceId)", () => {
    const out = parseCx(rep([["123"], [""], [""], ["APP"]]), enc);
    expect(out.assigningAuthority).toStrictEqual({ namespaceId: "APP" });
  });
});
