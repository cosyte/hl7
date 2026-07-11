import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseCe } from "../src/model/types/ce.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/ce: parseCe", () => {
  it("populates all 6 components when present", () => {
    const out = parseCe(
      rep([["GLU"], ["Glucose"], ["LN"], ["GLUC-SER"], ["Glucose Serum"], ["L"]]),
      enc,
    );
    expect(out).toStrictEqual({
      identifier: "GLU",
      text: "Glucose",
      nameOfCodingSystem: "LN",
      alternateIdentifier: "GLUC-SER",
      alternateText: "Glucose Serum",
      nameOfAlternateCodingSystem: "L",
    });
  });

  it("populates leading 3 components", () => {
    const out = parseCe(rep([["GLU"], ["Glucose"], ["LN"]]), enc);
    expect(out).toStrictEqual({
      identifier: "GLU",
      text: "Glucose",
      nameOfCodingSystem: "LN",
    });
  });

  it("returns empty object on zero components", () => {
    expect(parseCe({ components: [] }, enc)).toStrictEqual({});
  });

  it("returns component text verbatim (no double-decode)", () => {
    const out = parseCe(rep([["GLU"], ["Glu\\F\\cose"]]), enc);
    expect(out.text).toBe("Glu\\F\\cose");
  });

  it("omits absent components", () => {
    const out = parseCe(rep([["GLU"], [""], ["LN"]]), enc);
    expect(out.identifier).toBe("GLU");
    expect(out.nameOfCodingSystem).toBe("LN");
    expect("text" in out).toBe(false);
  });

  it("omits extraComponents on a pure 6-component CE", () => {
    const out = parseCe(rep([["GLU"], ["Glucose"], ["LN"]]), enc);
    expect("extraComponents" in out).toBe(false);
  });

  it("preserves CWE components 7+ when a CWE-shaped value is read through asCe (CE↔CWE uniformity)", () => {
    // The same 9-component CWE, read as a CE: components 7–9 are not dropped.
    const out = parseCe(
      rep([
        ["GLU"],
        ["Glucose"],
        ["LN"],
        ["GLUC-SER"],
        ["Glucose Serum"],
        ["L"],
        ["v1"], // 7: coding-system version id
        ["vA"], // 8: alternate coding-system version id
        ["Note"], // 9: original text
      ]),
      enc,
    );
    expect(out.identifier).toBe("GLU");
    expect(out.nameOfAlternateCodingSystem).toBe("L");
    expect(out.extraComponents).toEqual(["v1", "vA", "Note"]);
  });
});
