/**
 * Unit tests for `src/serialize/emit-field.ts` — the D-02/D-04 emit
 * primitive that every other serializer composes on. Covers:
 * - D-02 trailing-empty strip + isNull preservation.
 * - D-04 reescape chokepoint across all 5 active delimiters + `\n`.
 * - D-06 MSH guard throw (the one deliberate deviation from D-07 purity).
 * - D-07 purity for non-MSH inputs.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type {
  EncodingCharacters,
  RawField,
  RawRepetition,
  RawSegment,
} from "../src/parser/types.js";
import { emitField, emitSegment } from "../src/serialize/emit-field.js";

const ENC = DEFAULT_ENCODING_CHARACTERS;

function field(repetitions: readonly RawRepetition[], isNull = false): RawField {
  return { repetitions, isNull };
}

function sub(...subcomponents: string[]): { readonly subcomponents: readonly string[] } {
  return { subcomponents };
}

function rep(...components: Array<{ readonly subcomponents: readonly string[] }>): RawRepetition {
  return { components };
}

describe("emitField — D-02 behavior", () => {
  it("absent field → empty string", () => {
    expect(emitField(field([]), ENC)).toBe("");
  });

  it('isNull preserved as the two-character literal ""', () => {
    expect(emitField(field([], true), ENC)).toBe('""');
  });

  it("isNull wins over repetitions content", () => {
    const f: RawField = {
      repetitions: [rep(sub("should be ignored"))],
      isNull: true,
    };
    expect(emitField(f, ENC)).toBe('""');
  });

  it("single subcomponent → verbatim", () => {
    expect(emitField(field([rep(sub("Doe"))]), ENC)).toBe("Doe");
  });

  it("multiple components", () => {
    expect(emitField(field([rep(sub("Smith"), sub("John"), sub("Q"))]), ENC)).toBe("Smith^John^Q");
  });

  it("trailing empty components stripped", () => {
    expect(emitField(field([rep(sub("Doe"), sub(""), sub(""))]), ENC)).toBe("Doe");
  });

  it("internal empty components preserved", () => {
    expect(emitField(field([rep(sub("A"), sub(""), sub("C"))]), ENC)).toBe("A^^C");
  });

  it("trailing empty subcomponents stripped", () => {
    expect(emitField(field([rep(sub("HOSP", "", ""))]), ENC)).toBe("HOSP");
  });

  it("internal empty subcomponents preserved", () => {
    expect(emitField(field([rep(sub("A", "", "C"))]), ENC)).toBe("A&&C");
  });

  it("multiple repetitions joined by enc.repetition", () => {
    expect(emitField(field([rep(sub("R1")), rep(sub("R2"))]), ENC)).toBe("R1~R2");
  });

  it("complex nested — multi-rep, multi-comp, multi-sub", () => {
    const f: RawField = {
      repetitions: [rep(sub("A", "B"), sub("C")), rep(sub("D"))],
      isNull: false,
    };
    expect(emitField(f, ENC)).toBe("A&B^C~D");
  });

  it("empty field with zero repetitions (not null) → empty string", () => {
    expect(emitField(field([], false), ENC)).toBe("");
  });
});

describe("emitField — D-04 reescape", () => {
  it("subcomponent containing field delimiter → reescaped", () => {
    expect(emitField(field([rep(sub("Smith|Jones"))]), ENC)).toBe("Smith\\F\\Jones");
  });

  it("subcomponent containing component delimiter → reescaped", () => {
    expect(emitField(field([rep(sub("a^b"))]), ENC)).toBe("a\\S\\b");
  });

  it("subcomponent containing repetition delimiter → reescaped", () => {
    expect(emitField(field([rep(sub("a~b"))]), ENC)).toBe("a\\R\\b");
  });

  it("subcomponent containing escape delimiter → reescaped", () => {
    expect(emitField(field([rep(sub("a\\b"))]), ENC)).toBe("a\\E\\b");
  });

  it("subcomponent containing subcomponent delimiter → reescaped", () => {
    expect(emitField(field([rep(sub("a&b"))]), ENC)).toBe("a\\T\\b");
  });

  it("subcomponent containing newline → `\\.br\\`", () => {
    expect(emitField(field([rep(sub("line1\nline2"))]), ENC)).toBe("line1\\.br\\line2");
  });

  it("custom encoding characters honoured", () => {
    const enc2: EncodingCharacters = {
      field: "#",
      component: "@",
      repetition: "!",
      escape: "$",
      subcomponent: "+",
    };
    expect(emitField(field([rep(sub("a#b"))]), enc2)).toBe("a$F$b");
  });
});

describe("emitSegment — basics", () => {
  const placeholder: RawField = { repetitions: [], isNull: false };

  it("simple PID with one simple field and one null field", () => {
    const seg: RawSegment = {
      name: "PID",
      fields: [placeholder, field([rep(sub("1"))]), field([], true)],
    };
    expect(emitSegment(seg, ENC)).toBe('PID|1|""');
  });

  it("fields[0] placeholder contents ignored", () => {
    const seg1: RawSegment = {
      name: "PID",
      fields: [
        { repetitions: [rep(sub("placeholder-noise"))], isNull: false },
        field([rep(sub("1"))]),
      ],
    };
    const seg2: RawSegment = {
      name: "PID",
      fields: [placeholder, field([rep(sub("1"))])],
    };
    expect(emitSegment(seg1, ENC)).toBe(emitSegment(seg2, ENC));
  });

  it("empty segment (just name placeholder) → segment name only", () => {
    expect(emitSegment({ name: "NTE", fields: [placeholder] }, ENC)).toBe("NTE");
  });

  it("D-04 reescape applied through emitField for non-MSH segments", () => {
    const seg: RawSegment = {
      name: "PID",
      fields: [placeholder, field([rep(sub("Smith|Jones"))])],
    };
    expect(emitSegment(seg, ENC)).toBe("PID|Smith\\F\\Jones");
  });
});

describe("emitSegment — MSH guard (D-06)", () => {
  const placeholder: RawField = { repetitions: [], isNull: false };

  it("throws an Error on MSH input", () => {
    expect(() => emitSegment({ name: "MSH", fields: [placeholder] }, ENC)).toThrow(
      /MSH must be routed/,
    );
    let caught: unknown;
    try {
      emitSegment({ name: "MSH", fields: [placeholder] }, ENC);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
  });

  it("guard fires before any field processing even when fields are populated", () => {
    const seg: RawSegment = {
      name: "MSH",
      fields: [placeholder, field([rep(sub("^~\\&"))]), field([rep(sub("SENDAPP"))])],
    };
    expect(() => emitSegment(seg, ENC)).toThrow(/MSH/);
  });
});

describe("emitSegment / emitField — purity", () => {
  const placeholder: RawField = { repetitions: [], isNull: false };

  it("emitSegment returns just the name when fields array is empty (non-MSH)", () => {
    expect(emitSegment({ name: "XXX", fields: [] }, ENC)).toBe("XXX");
  });

  it("does not mutate input (deeply frozen)", () => {
    const rf: RawField = Object.freeze({
      repetitions: Object.freeze([
        Object.freeze({
          components: Object.freeze([Object.freeze({ subcomponents: Object.freeze(["A", "B"]) })]),
        }),
      ]),
      isNull: false,
    });
    const snapshot = JSON.stringify(rf);
    emitField(rf, ENC);
    expect(JSON.stringify(rf)).toBe(snapshot);
  });

  it("deterministic — two back-to-back calls return identical strings", () => {
    const f = field([rep(sub("a"), sub("b", "c")), rep(sub("d"))]);
    expect(emitField(f, ENC)).toBe(emitField(f, ENC));
  });

  it("emitSegment deterministic", () => {
    const seg: RawSegment = {
      name: "OBX",
      fields: [placeholder, field([rep(sub("1"))]), field([rep(sub("NM"))])],
    };
    expect(emitSegment(seg, ENC)).toBe(emitSegment(seg, ENC));
  });
});
