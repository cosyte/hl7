import { describe, expect, it } from "vitest";

import { parsePl } from "../src/model/types/pl.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

/** Build a RawRepetition from a 2-D array: outer = components, inner = subcomponents. */
function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/pl: parsePl", () => {
  it("extracts first 3 components (pointOfCare, room, bed)", () => {
    const out = parsePl(rep([["ICU"], ["101"], ["A"]]), enc);
    expect(out).toStrictEqual({ pointOfCare: "ICU", room: "101", bed: "A" });
  });

  it("parses nested HD in component 4 (facility)", () => {
    const out = parsePl(
      rep([[""], [""], [""], ["APP", "1.2.3", "UUID"]]),
      enc,
    );
    expect(out.facility).toStrictEqual({
      namespaceId: "APP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it("omits facility when component 4 is all empty", () => {
    const out = parsePl(rep([["ICU"], [""], [""], ["", "", ""]]), enc);
    expect("facility" in out).toBe(false);
    expect(out.pointOfCare).toBe("ICU");
  });

  it("omits facility when component 4 is missing entirely", () => {
    const out = parsePl(rep([["ICU"], [""], [""]]), enc);
    expect("facility" in out).toBe(false);
  });

  it("populates all 11 components including nested HD", () => {
    const out = parsePl(
      rep([
        ["ICU"],
        ["101"],
        ["A"],
        ["HOSP", "1.2.3", "UUID"],
        ["O"],
        ["N"],
        ["BldgA"],
        ["3"],
        ["West wing ICU"],
        ["COMP-LOC-1"],
        ["Auth-Str"],
      ]),
      enc,
    );
    expect(out).toStrictEqual({
      pointOfCare: "ICU",
      room: "101",
      bed: "A",
      facility: { namespaceId: "HOSP", universalId: "1.2.3", universalIdType: "UUID" },
      locationStatus: "O",
      personLocationType: "N",
      building: "BldgA",
      floor: "3",
      locationDescription: "West wing ICU",
      comprehensiveLocationId: "COMP-LOC-1",
      assigningAuthorityForLocation: "Auth-Str",
    });
  });

  it("returns {} on empty repetition", () => {
    expect(parsePl({ components: [] }, enc)).toStrictEqual({});
  });

  it("auto-unescapes subcomponent content", () => {
    const out = parsePl(rep([["ICU\\F\\A"]]), enc);
    expect(out.pointOfCare).toBe("ICU|A");
  });

  it("partial HD with only namespaceId populates facility correctly", () => {
    const out = parsePl(rep([[""], [""], [""], ["APP"]]), enc);
    expect(out.facility).toStrictEqual({ namespaceId: "APP" });
  });

  it("omits empty-string components (exactOptionalPropertyTypes)", () => {
    const out = parsePl(rep([["ICU"], [""], ["A"]]), enc);
    expect(out.pointOfCare).toBe("ICU");
    expect("room" in out).toBe(false);
    expect(out.bed).toBe("A");
  });
});
