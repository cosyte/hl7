import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseXad } from "../src/model/types/xad.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/xad: parseXad", () => {
  it("populates the 6 common US-address components", () => {
    const out = parseXad(
      rep([["123 Main St"], ["Apt 4"], ["Boston"], ["MA"], ["02101"], ["USA"]]),
      enc,
    );
    expect(out).toStrictEqual({
      street: "123 Main St",
      otherDesignation: "Apt 4",
      city: "Boston",
      stateOrProvince: "MA",
      zipOrPostalCode: "02101",
      country: "USA",
    });
  });

  it("populates all 12 components when present", () => {
    const twelve: string[][] = [
      ["123 Main St"],
      ["Apt 4"],
      ["Boston"],
      ["MA"],
      ["02101"],
      ["USA"],
      ["H"],
      ["Suffolk"],
      ["025"],
      ["1001"],
      ["A"],
      ["range"],
    ];
    const out = parseXad(rep(twelve), enc);
    expect(out).toStrictEqual({
      street: "123 Main St",
      otherDesignation: "Apt 4",
      city: "Boston",
      stateOrProvince: "MA",
      zipOrPostalCode: "02101",
      country: "USA",
      addressType: "H",
      otherGeographicDesignation: "Suffolk",
      countyParishCode: "025",
      censusTract: "1001",
      addressRepresentationCode: "A",
      addressValidityRange: "range",
    });
  });

  it("returns empty object on zero components", () => {
    expect(parseXad({ components: [] }, enc)).toStrictEqual({});
  });

  it("auto-unescapes street", () => {
    const out = parseXad(rep([["123 Main St\\F\\Suite 5"]]), enc);
    expect(out.street).toBe("123 Main St|Suite 5");
  });

  it("omits absent components (exactOptionalPropertyTypes)", () => {
    const out = parseXad(rep([[""], [""], ["Boston"]]), enc);
    expect(out.city).toBe("Boston");
    expect("street" in out).toBe(false);
    expect("otherDesignation" in out).toBe(false);
    expect("stateOrProvince" in out).toBe(false);
  });
});
