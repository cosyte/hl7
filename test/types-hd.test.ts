import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseHd } from "../src/model/types/hd.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/hd: parseHd", () => {
  it("populates all 3 components", () => {
    const out = parseHd(rep([["APP"], ["1.2.3"], ["UUID"]]), enc);
    expect(out).toStrictEqual({
      namespaceId: "APP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it("returns only namespaceId when single component present", () => {
    const out = parseHd(rep([["APP"]]), enc);
    expect(out).toStrictEqual({ namespaceId: "APP" });
  });

  it("returns empty object on zero components", () => {
    expect(parseHd({ components: [] }, enc)).toStrictEqual({});
  });

  it("auto-unescapes namespaceId", () => {
    const out = parseHd(rep([["APP\\F\\X"]]), enc);
    expect(out.namespaceId).toBe("APP|X");
  });

  it("omits absent components", () => {
    const out = parseHd(rep([[""], ["1.2.3"], [""]]), enc);
    expect(out.universalId).toBe("1.2.3");
    expect("namespaceId" in out).toBe(false);
    expect("universalIdType" in out).toBe(false);
  });

  it("populates universalIdType only when present", () => {
    const out = parseHd(rep([["APP"], ["1.2.3"]]), enc);
    expect(out).toStrictEqual({ namespaceId: "APP", universalId: "1.2.3" });
  });
});
