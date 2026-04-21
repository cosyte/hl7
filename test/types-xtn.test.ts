import { describe, expect, it } from "vitest";

import { parseXtn } from "../src/model/types/xtn.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

/** Build a RawRepetition from a 2-D array: outer = components, inner = subcomponents. */
function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/xtn: parseXtn", () => {
  it("extracts telephoneNumber + use code + equipment type", () => {
    const out = parseXtn(rep([["555-1234"], ["PRN"], ["PH"]]), enc);
    expect(out).toStrictEqual({
      telephoneNumber: "555-1234",
      telecommunicationUseCode: "PRN",
      telecommunicationEquipmentType: "PH",
    });
  });

  it("extracts email address without telephoneNumber", () => {
    const out = parseXtn(rep([[""], ["NET"], ["Internet"], ["jane@example.com"]]), enc);
    expect(out).toStrictEqual({
      telecommunicationUseCode: "NET",
      telecommunicationEquipmentType: "Internet",
      emailAddress: "jane@example.com",
    });
    expect("telephoneNumber" in out).toBe(false);
  });

  it("returns {} on empty repetition", () => {
    expect(parseXtn({ components: [] }, enc)).toStrictEqual({});
  });

  it("populates all 12 v1 components", () => {
    const out = parseXtn(
      rep([
        ["(555) 555-1234"],
        ["WPN"],
        ["PH"],
        ["jane@example.com"],
        ["+1"],
        ["555"],
        ["5551234"],
        ["4567"],
        ["after 5pm"],
        ["x"],
        ["42"],
        ["5551234"],
      ]),
      enc,
    );
    expect(out).toStrictEqual({
      telephoneNumber: "(555) 555-1234",
      telecommunicationUseCode: "WPN",
      telecommunicationEquipmentType: "PH",
      emailAddress: "jane@example.com",
      countryCode: "+1",
      areaCityCode: "555",
      localNumber: "5551234",
      extension: "4567",
      anyText: "after 5pm",
      extensionPrefix: "x",
      speedDialCode: "42",
      unformattedTelephoneNumber: "5551234",
    });
  });

  it("auto-unescapes subcomponent content", () => {
    const out = parseXtn(rep([["\\F\\555-1234"]]), enc);
    expect(out.telephoneNumber).toBe("|555-1234");
  });

  it("omits empty-string components (exactOptionalPropertyTypes)", () => {
    const out = parseXtn(rep([["555-1234"], [""], [""]]), enc);
    expect(out.telephoneNumber).toBe("555-1234");
    expect("telecommunicationUseCode" in out).toBe(false);
    expect("telecommunicationEquipmentType" in out).toBe(false);
  });

  it("ignores components past position 12 (v1 trimmed shape)", () => {
    // 14-element input — only first 12 should populate the interface.
    const out = parseXtn(
      rep([
        ["555"],
        ["PRN"],
        ["PH"],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        [""],
        ["extra-13"],
        ["extra-14"],
      ]),
      enc,
    );
    expect(Object.keys(out).sort()).toStrictEqual([
      "telecommunicationEquipmentType",
      "telecommunicationUseCode",
      "telephoneNumber",
    ]);
  });
});
