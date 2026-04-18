import { describe, expect, it } from "vitest";

import type {
  EncodingCharacters,
  Hl7Position,
  OnWarningCallback,
  ParseOptions,
  Profile,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "../src/parser/types.js";

describe("parser/types: shared type surface", () => {
  it("Hl7Position accepts the minimum required shape", () => {
    const p: Hl7Position = { segmentIndex: 0 };
    expect(p.segmentIndex).toBe(0);
  });

  it("ParseOptions accepts the empty shape and a fully populated shape", () => {
    const empty: ParseOptions = {};
    const full: ParseOptions = {
      strict: true,
      onWarning: () => {},
      dateFormats: ["YYYY-MM-DD"],
      stripMllpFraming: false,
      trimFields: false,
      profile: null,
    };
    expect(empty).toBeDefined();
    expect(full.profile).toBeNull();
  });

  it("OnWarningCallback is structurally a function taking Hl7ParseWarning", () => {
    const cb: OnWarningCallback = () => {};
    expect(typeof cb).toBe("function");
  });

  it("Profile accepts name-only and fully populated shapes", () => {
    const minimal: Profile = { name: "test" };
    const full: Profile = {
      name: "test",
      description: "d",
      lineage: ["a"],
      dateFormats: [],
      customSegments: {},
      onWarning: () => {},
    };
    expect(minimal.name).toBe("test");
    expect(full.lineage).toEqual(["a"]);
  });

  it("EncodingCharacters and Raw* tree compose structurally", () => {
    const enc: EncodingCharacters = {
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
    };
    const field: RawField = { repetitions: [], isNull: false };
    const rep: RawRepetition = { components: [] };
    const comp: RawComponent = { subcomponents: [] };
    const seg: RawSegment = { name: "MSH", fields: [field] };
    expect(enc.field).toBe("|");
    expect(rep.components.length).toBe(0);
    expect(comp.subcomponents.length).toBe(0);
    expect(seg.fields[0]).toBe(field);
  });
});
