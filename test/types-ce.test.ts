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

  it("auto-unescapes text", () => {
    const out = parseCe(rep([["GLU"], ["Glu\\F\\cose"]]), enc);
    expect(out.text).toBe("Glu|cose");
  });

  it("omits absent components", () => {
    const out = parseCe(rep([["GLU"], [""], ["LN"]]), enc);
    expect(out.identifier).toBe("GLU");
    expect(out.nameOfCodingSystem).toBe("LN");
    expect("text" in out).toBe(false);
  });
});
