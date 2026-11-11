/**
 * The internal helpers `parseHL7` is built from in `src/parser/index.ts`, called directly.
 *
 * That file holds the parser itself, not re-exports, so it is measured by coverage and mutation
 * like every other source file. The suite reaches these helpers through `parseHL7`, and a message
 * the tokenizer produced can never hold some of the shapes they guard against (an MSH without a
 * field 12, a field with no repetition). So each guard is held here, on a synthetic segment.
 */

import { describe, expect, it } from "vitest";

import {
  extractMessageType,
  extractMsh18FromTentativeDecode,
  extractVersion,
  makeEmitter,
  mergeDateFormats,
} from "../src/parser/index.js";
import type { Profile, RawField, RawSegment } from "../src/parser/types.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

/** A field of one repetition whose components each hold the given subcomponents. */
function field(...components: (readonly string[])[]): RawField {
  return {
    repetitions: [{ components: components.map((subcomponents) => ({ subcomponents })) }],
    isNull: false,
  };
}

/** An MSH whose field `index` is `value`, every field before it empty. */
function msh(index: number, value: RawField): RawSegment {
  const fields: RawField[] = [];
  for (let i = 0; i < index; i++) fields.push(field([""]));
  fields.push(value);
  return { name: "MSH", fields };
}

const warning: Hl7ParseWarning = {
  code: WARNING_CODES.MLLP_FRAMING_STRIPPED,
  message: "a synthetic warning",
  position: { segmentIndex: 0 },
};

describe("makeEmitter", () => {
  it("contains a profile handler that throws, and still calls the caller's handler", () => {
    const warnings: Hl7ParseWarning[] = [];
    const seen: string[] = [];
    const profile: Profile = {
      name: "throwing-profile",
      onWarning: () => {
        seen.push("profile");
        throw new Error("profile handler failed");
      },
    };
    const emit = makeEmitter(
      warnings,
      {
        onWarning: () => {
          seen.push("caller");
          throw new Error("caller handler failed");
        },
      },
      "MSH|^~\\&|",
      profile,
    );
    expect(() => {
      emit(warning);
    }).not.toThrow();
    expect(seen).toEqual(["profile", "caller"]);
    expect(warnings).toEqual([warning]);
  });
});

describe("extractMsh18FromTentativeDecode", () => {
  it("finds no field separator in a bare MSH", () => {
    expect(extractMsh18FromTentativeDecode("MSH")).toBeUndefined();
  });

  it("splits repetitions on the separator MSH-2 names, not only ~", () => {
    const fields = ["MSH", "^#\\&", ...Array<string>(15).fill(""), "UNICODE UTF-8#8859/1"];
    expect(extractMsh18FromTentativeDecode(fields.join("|"))).toBe("UNICODE UTF-8");
  });

  it("splits repetitions on ~ when MSH-2 is too short to name a repetition separator", () => {
    const fields = ["MSH", "^", ...Array<string>(15).fill(""), "UNICODE UTF-8~8859/1"];
    expect(extractMsh18FromTentativeDecode(fields.join("|"))).toBe("UNICODE UTF-8");
  });
});

describe("extractVersion", () => {
  it("is empty for a segment that is not MSH, or no segment", () => {
    expect(extractVersion(undefined)).toBe("");
    expect(extractVersion({ name: "PID", fields: [] })).toBe("");
  });

  it("is empty when MSH-12 is missing", () => {
    expect(extractVersion(msh(5, field(["x"])))).toBe("");
  });

  it("is empty when MSH-12 has no repetition, no component or no subcomponent", () => {
    expect(extractVersion(msh(11, { repetitions: [], isNull: false }))).toBe("");
    expect(extractVersion(msh(11, { repetitions: [{ components: [] }], isNull: false }))).toBe("");
    expect(extractVersion(msh(11, field([])))).toBe("");
  });

  it("reads the first subcomponent of MSH-12", () => {
    expect(extractVersion(msh(11, field(["2.5.1", "x"])))).toBe("2.5.1");
  });
});

describe("extractMessageType", () => {
  const empty = { messageCode: "", triggerEvent: "" };

  it("is empty for a segment that is not MSH, or no segment", () => {
    expect(extractMessageType(undefined)).toEqual(empty);
    expect(extractMessageType({ name: "PID", fields: [] })).toEqual(empty);
  });

  it("is empty when MSH-9 is missing or has no repetition", () => {
    expect(extractMessageType(msh(4, field(["x"])))).toEqual(empty);
    expect(extractMessageType(msh(8, { repetitions: [], isNull: false }))).toEqual(empty);
  });

  it("reads a missing component or subcomponent as empty", () => {
    expect(extractMessageType(msh(8, field([])))).toEqual(empty);
    expect(extractMessageType(msh(8, field(["ADT"])))).toEqual({
      messageCode: "ADT",
      triggerEvent: "",
    });
    expect(extractMessageType(msh(8, field(["ADT"], ["A01"])))).toEqual({
      messageCode: "ADT",
      triggerEvent: "A01",
    });
  });
});

describe("mergeDateFormats", () => {
  it("keeps the option formats first and drops every repeat, from either list", () => {
    const profile: Profile = { name: "dates", dateFormats: ["YYYYMMDD", "MM/DD/YYYY"] };
    expect(mergeDateFormats({ dateFormats: ["YYYYMMDD", "YYYYMMDD"] }, profile)).toEqual([
      "YYYYMMDD",
      "MM/DD/YYYY",
    ]);
  });

  it("is undefined when neither names a format", () => {
    expect(mergeDateFormats({}, undefined)).toBeUndefined();
  });
});
