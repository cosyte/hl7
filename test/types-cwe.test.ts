import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseCwe } from "../src/model/types/cwe.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/cwe: parseCwe", () => {
  it("populates all 9 components when present", () => {
    const out = parseCwe(
      rep([
        ["GLU"],
        ["Glucose"],
        ["LN"],
        ["GLUC-SER"],
        ["Glucose Serum"],
        ["L"],
        ["v1"],
        ["vA"],
        ["Note"],
      ]),
      enc,
    );
    expect(out).toStrictEqual({
      identifier: "GLU",
      text: "Glucose",
      nameOfCodingSystem: "LN",
      alternateIdentifier: "GLUC-SER",
      alternateText: "Glucose Serum",
      nameOfAlternateCodingSystem: "L",
      codingSystemVersionId: "v1",
      alternateCodingSystemVersionId: "vA",
      originalText: "Note",
    });
  });

  it("extracts identifier only when lone component present", () => {
    const out = parseCwe(rep([["GLU"]]), enc);
    expect(out).toStrictEqual({ identifier: "GLU" });
  });

  it("returns empty object on zero components", () => {
    expect(parseCwe({ components: [] }, enc)).toStrictEqual({});
  });

  it("auto-unescapes text", () => {
    const out = parseCwe(rep([["GLU"], ["Glu\\F\\cose"]]), enc);
    expect(out.text).toBe("Glu|cose");
  });

  it("omits absent components", () => {
    const out = parseCwe(rep([["GLU"], [""], ["LN"]]), enc);
    expect(out.identifier).toBe("GLU");
    expect(out.nameOfCodingSystem).toBe("LN");
    expect("text" in out).toBe(false);
  });

  it("omits extraComponents on a 9-or-fewer component value", () => {
    const out = parseCwe(rep([["GLU"], ["Glucose"], ["LN"]]), enc);
    expect("extraComponents" in out).toBe(false);
  });

  it("preserves v2.7+ components 10+ verbatim instead of truncating", () => {
    // A v2.7 CWE carrying a second-alternate triplet (10–12) + coding-system OID (14).
    const out = parseCwe(
      rep([
        ["73211009"],
        ["Diabetes mellitus"],
        ["SCT"],
        ["E11.9"],
        ["Type 2 diabetes"],
        ["I10C"],
        ["20230901"],
        ["2023"],
        ["Diabetes"],
        ["44054006"], // 10: second-alternate identifier
        ["Type 2 DM"], // 11: second-alternate text
        ["SCT2"], // 12: name of second-alternate coding system
        [""], // 13: absent interior — preserved as ""
        ["2.16.840.1.113883.6.96"], // 14: coding-system OID
      ]),
      enc,
    );
    expect(out.identifier).toBe("73211009");
    expect(out.extraComponents).toEqual([
      "44054006",
      "Type 2 DM",
      "SCT2",
      "",
      "2.16.840.1.113883.6.96",
    ]);
  });

  it("does not throw on an arbitrarily long (future-version) component count", () => {
    const many = Array.from({ length: 30 }, (_v, i) => [`c${String(i)}`]);
    expect(() => parseCwe(rep(many), enc)).not.toThrow();
    const out = parseCwe(rep(many), enc);
    expect(out.extraComponents).toHaveLength(30 - 9);
  });
});
