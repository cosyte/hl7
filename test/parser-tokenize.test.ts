import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import { tokenize } from "../src/parser/tokenize.js";
import type { EncodingCharacters } from "../src/parser/types.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

const defaultEnc = DEFAULT_ENCODING_CHARACTERS;

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return {
    warnings,
    emit: (w) => {
      warnings.push(w);
    },
  };
}

describe("parser/tokenize: structure + ordering", () => {
  it("produces an ordered RawSegment[] with correct names for standard input", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&|APP|FAC", "PID|1||X^Y^Z"], defaultEnc, emit, true);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.name).toBe("MSH");
    expect(tree[1]?.name).toBe("PID");
  });

  it("MSH fields[0] holds the separator char and fields[1] holds the encoding-chars string", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&|APP"], defaultEnc, emit, true);
    const msh = tree[0];
    expect(msh?.fields[0]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("|");
    expect(msh?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("^~\\&");
    expect(msh?.fields[2]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("APP");
  });

  it("non-MSH segments use the unified 1-indexed convention (fields[0] = name placeholder)", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|1|A|B"], defaultEnc, emit, true);
    const pid = tree[1];
    expect(pid?.fields[0]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("PID");
    expect(pid?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("1");
    expect(pid?.fields[2]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("A");
    expect(pid?.fields[3]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("B");
  });
});

describe("parser/tokenize: splits on delimiters", () => {
  it("splits repetitions on ~", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|A~B~C"], defaultEnc, emit, true);
    const pid1 = tree[1]?.fields[1];
    expect(pid1?.repetitions).toHaveLength(3);
    expect(pid1?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("A");
    expect(pid1?.repetitions[2]?.components[0]?.subcomponents[0]).toBe("C");
  });

  it("splits components on ^", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|X^Y^Z"], defaultEnc, emit, true);
    const comps = tree[1]?.fields[1]?.repetitions[0]?.components;
    expect(comps).toHaveLength(3);
    expect(comps?.[0]?.subcomponents[0]).toBe("X");
    expect(comps?.[2]?.subcomponents[0]).toBe("Z");
  });

  it("splits subcomponents on &", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|X&Y&Z"], defaultEnc, emit, true);
    const subs = tree[1]?.fields[1]?.repetitions[0]?.components[0]?.subcomponents;
    expect(subs).toEqual(["X", "Y", "Z"]);
  });

  it("honors custom encoding characters", () => {
    const enc: EncodingCharacters = {
      field: "#",
      component: "$",
      repetition: "%",
      escape: "*",
      subcomponent: "@",
    };
    const { emit } = collect();
    const tree = tokenize(["MSH#$%*@#APP", "PID#A%B%C"], enc, emit, true);
    expect(tree[1]?.name).toBe("PID");
    expect(tree[1]?.fields[1]?.repetitions).toHaveLength(3);
    expect(tree[1]?.fields[1]?.repetitions[1]?.components[0]?.subcomponents[0]).toBe("B");
  });
});

describe("parser/tokenize: empty vs null (PARSE-06)", () => {
  it("empty field || produces isNull=false with zero repetitions", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|A||C"], defaultEnc, emit, true);
    // fields: [0]=name placeholder, [1]="A", [2]=empty, [3]="C"
    const empty = tree[1]?.fields[2];
    expect(empty?.isNull).toBe(false);
    expect(empty?.repetitions).toHaveLength(0);
  });

  it(`explicit null field "" produces isNull=true with zero repetitions`, () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", `PID|A|""|C`], defaultEnc, emit, true);
    const nullField = tree[1]?.fields[2];
    expect(nullField?.isNull).toBe(true);
    expect(nullField?.repetitions).toHaveLength(0);
  });
});

describe("parser/tokenize: whitespace trim (TOL-07)", () => {
  it("emits FIELD_WHITESPACE_TRIMMED when trimFields=true and non-trivial whitespace surrounds content", () => {
    const { emit, warnings } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|  hi  "], defaultEnc, emit, true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.FIELD_WHITESPACE_TRIMMED);
    expect(tree[1]?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("hi");
  });

  it("FIELD_WHITESPACE_TRIMMED message reports counts only — never the PHI field value", () => {
    const { emit, warnings } = collect();
    // "  SECRETPATIENTNAME " — 2 leading spaces, 1 trailing.
    const tree = tokenize(["MSH|^~\\&", "PID|  SECRETPATIENTNAME "], defaultEnc, emit, true);
    expect(warnings).toHaveLength(1);
    const w = warnings[0];
    expect(w?.message).toMatch(/2 leading/);
    expect(w?.message).toMatch(/1 trailing/);
    expect(w?.message.toLowerCase()).not.toContain("secretpatientname");
    // Round-trip fidelity: the trimmed VALUE is still preserved verbatim.
    expect(tree[1]?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe(
      "SECRETPATIENTNAME",
    );
  });

  it("does NOT emit FIELD_WHITESPACE_TRIMMED when trimFields=false", () => {
    const { emit, warnings } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|  hi  "], defaultEnc, emit, false);
    expect(warnings).toHaveLength(0);
    expect(tree[1]?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("  hi  ");
  });

  it("does NOT emit FIELD_WHITESPACE_TRIMMED for an all-whitespace field value", () => {
    const { emit, warnings } = collect();
    tokenize(["MSH|^~\\&", "PID|   "], defaultEnc, emit, true);
    expect(warnings).toHaveLength(0);
  });

  it("warning carries the correct 1-indexed fieldIndex", () => {
    const { emit, warnings } = collect();
    tokenize(["MSH|^~\\&", "PID|A|  hi  "], defaultEnc, emit, true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.position.segmentIndex).toBe(1);
    expect(warnings[0]?.position.fieldIndex).toBe(2);
  });
});

describe("parser/tokenize: miscellaneous", () => {
  it("preserves segment name case (lowercase pid stays lowercase)", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "pid|1"], defaultEnc, emit, true);
    expect(tree[1]?.name).toBe("pid");
  });

  it("preserves empty middle segments as zero-field RawSegment with empty name", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "", "PID|1"], defaultEnc, emit, true);
    expect(tree).toHaveLength(3);
    expect(tree[1]?.name).toBe("");
    expect(tree[1]?.fields).toHaveLength(0);
  });
});
