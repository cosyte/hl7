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
});
