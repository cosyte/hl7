import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

import { parseXpn } from "../src/model/types/xpn.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/xpn: parseXpn", () => {
  it("extracts familyName from component 1", () => {
    const out = parseXpn(rep([["Smith"]]), enc);
    expect(out.familyName).toBe("Smith");
    expect("givenName" in out).toBe(false);
  });

  it("populates 3 leading components", () => {
    const out = parseXpn(rep([["Smith"], ["Jane"], ["Q"]]), enc);
    expect(out).toStrictEqual({ familyName: "Smith", givenName: "Jane", secondName: "Q" });
  });

  it("auto-unescapes \\F\\ inside a component", () => {
    const out = parseXpn(rep([["Smith\\F\\Jr"]]), enc);
    expect(out.familyName).toBe("Smith|Jr");
  });

  it("omits absent components (exactOptionalPropertyTypes)", () => {
    const out = parseXpn(rep([[""], ["Jane"], [""], [""], ["Mrs."]]), enc);
    expect(out.givenName).toBe("Jane");
    expect(out.prefix).toBe("Mrs.");
    expect("familyName" in out).toBe(false);
    expect("secondName" in out).toBe(false);
    expect("suffix" in out).toBe(false);
    expect("degree" in out).toBe(false);
  });

  it("returns empty object on zero components", () => {
    const out = parseXpn({ components: [] }, enc);
    expect(out).toStrictEqual({});
  });

  it("populates all 14 components when present", () => {
    const fourteen: string[][] = [
      ["Smith"],
      ["Jane"],
      ["Q"],
      ["Jr"],
      ["Mrs."],
      ["MD"],
      ["L"],
      ["A"],
      ["ctx"],
      ["range"],
      ["G"],
      ["20250101"],
      ["20991231"],
      ["Esq"],
    ];
    const out = parseXpn(rep(fourteen), enc);
    expect(out).toStrictEqual({
      familyName: "Smith",
      givenName: "Jane",
      secondName: "Q",
      suffix: "Jr",
      prefix: "Mrs.",
      degree: "MD",
      nameTypeCode: "L",
      nameRepresentationCode: "A",
      nameContext: "ctx",
      nameValidityRange: "range",
      nameAssemblyOrder: "G",
      effectiveDate: "20250101",
      expirationDate: "20991231",
      professionalSuffix: "Esq",
    });
  });

  it("proves exactOptionalPropertyTypes: absent keys are truly missing", () => {
    const out = parseXpn(rep([["Smith"]]), enc);
    expect("familyName" in out).toBe(true);
    expect("givenName" in out).toBe(false);
    expect(Object.keys(out)).toEqual(["familyName"]);
  });
});
