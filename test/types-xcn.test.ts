import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseXcn } from "../src/model/types/xcn.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/xcn: parseXcn", () => {
  it("returns {} on empty repetition", () => {
    const out = parseXcn({ components: [] }, enc);
    expect(out).toStrictEqual({});
  });

  it("extracts scalar components (idNumber, familyName, givenName, nameTypeCode, identifierTypeCode)", () => {
    const out = parseXcn(
      rep([
        ["12345"],
        ["Smith"],
        ["Jane"],
        [""],
        [""],
        [""],
        [""],
        [""],
        ["", "", ""],
        ["L"],
        [""],
        [""],
        ["NPI"],
      ]),
      enc,
    );
    expect(out).toStrictEqual({
      idNumber: "12345",
      familyName: "Smith",
      givenName: "Jane",
      nameTypeCode: "L",
      identifierTypeCode: "NPI",
    });
  });

  it("parses assigningAuthority nested HD when component 9 has populated subcomponents", () => {
    const out = parseXcn(
      rep([["12345"], ["Smith"], [""], [""], [""], [""], [""], [""], ["HOSP", "1.2.3", "ISO"]]),
      enc,
    );
    expect(out.assigningAuthority).toStrictEqual({
      namespaceId: "HOSP",
      universalId: "1.2.3",
      universalIdType: "ISO",
    });
  });

  it("omits assigningAuthority when all HD subcomponents are empty strings", () => {
    const out = parseXcn(
      rep([["12345"], ["Smith"], [""], [""], [""], [""], [""], [""], ["", "", ""]]),
      enc,
    );
    expect("assigningAuthority" in out).toBe(false);
  });

  it("never throws on empty components list (undefined component slot)", () => {
    expect(() => parseXcn({ components: [] }, enc)).not.toThrow();
  });

  it("omits keys when a scalar component has only empty subcomponents", () => {
    const out = parseXcn(rep([[""], ["Smith"]]), enc);
    expect("idNumber" in out).toBe(false);
    expect(out.familyName).toBe("Smith");
  });

  it("auto-unescapes component values (A\\F\\B → A|B via readComponent)", () => {
    const out = parseXcn(rep([["A\\F\\B"]]), enc);
    expect(out.idNumber).toBe("A|B");
  });

  it("populates all 13 v1 components when present", () => {
    const out = parseXcn(
      rep([
        ["ID1"],
        ["Fam"],
        ["Giv"],
        ["Sec"],
        ["Suf"],
        ["Pre"],
        ["Deg"],
        ["Src"],
        ["NS", "UNIV", "ISO"],
        ["L"],
        ["9"],
        ["M10"],
        ["NPI"],
      ]),
      enc,
    );
    expect(out).toStrictEqual({
      idNumber: "ID1",
      familyName: "Fam",
      givenName: "Giv",
      secondName: "Sec",
      suffix: "Suf",
      prefix: "Pre",
      degree: "Deg",
      sourceTable: "Src",
      assigningAuthority: {
        namespaceId: "NS",
        universalId: "UNIV",
        universalIdType: "ISO",
      },
      nameTypeCode: "L",
      identifierCheckDigit: "9",
      checkDigitScheme: "M10",
      identifierTypeCode: "NPI",
    });
  });
});
