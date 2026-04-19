import { describe, expect, it } from "vitest";

import { parseNm } from "../src/model/types/nm.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(s: string): RawRepetition {
  return { components: [{ subcomponents: [s] }] };
}

describe("model/types/nm: parseNm", () => {
  it("parses positive integer", () => {
    expect(parseNm(rep("120"), enc)).toStrictEqual({ raw: "120", value: 120 });
  });

  it("parses negative float", () => {
    expect(parseNm(rep("-14.5"), enc)).toStrictEqual({ raw: "-14.5", value: -14.5 });
  });

  it("parses scientific notation", () => {
    expect(parseNm(rep("1.23e2"), enc)).toStrictEqual({ raw: "1.23e2", value: 123 });
  });

  it("returns undefined value for non-numeric (strict)", () => {
    expect(parseNm(rep("not a number"), enc).value).toBeUndefined();
  });

  it("returns undefined value for empty raw", () => {
    expect(parseNm(rep(""), enc)).toStrictEqual({ raw: "", value: undefined });
  });

  it("rejects trailing garbage (Number, not parseFloat)", () => {
    expect(parseNm(rep("12abc"), enc).value).toBeUndefined();
  });

  it("preserves raw string verbatim (with surrounding whitespace)", () => {
    expect(parseNm(rep("  3.14  "), enc).raw).toBe("  3.14  ");
    // Number("  3.14  ") === 3.14 (JS allows surrounding whitespace)
    expect(parseNm(rep("  3.14  "), enc).value).toBe(3.14);
  });

  it("auto-unescapes the raw before numeric parse", () => {
    // "12.0\F\5" unescapes to "12.0|5"; Number("12.0|5") === NaN → undefined
    expect(parseNm(rep("12.0\\F\\5"), enc)).toStrictEqual({ raw: "12.0|5", value: undefined });
  });

  it("handles empty repetition (no components)", () => {
    expect(parseNm({ components: [] }, enc)).toStrictEqual({ raw: "", value: undefined });
  });

  it("result has exactly 2 keys (raw, value)", () => {
    const nm = parseNm(rep("120"), enc);
    expect(Object.keys(nm).sort()).toStrictEqual(["raw", "value"]);
  });
});
