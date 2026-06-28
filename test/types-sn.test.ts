import { describe, expect, it } from "vitest";

import { parseSn } from "../src/model/types/sn.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

/** Build an SN repetition from its positional component strings (SN.1..SN.4). */
function rep(...components: string[]): RawRepetition {
  return { components: components.map((s) => ({ subcomponents: [s] })) };
}

describe("model/types/sn: parseSn", () => {
  it("parses a comparator + value (`>^100`)", () => {
    expect(parseSn(rep(">", "100"), enc)).toStrictEqual({
      comparator: ">",
      num1: 100,
      num2: undefined,
    });
  });

  it("parses `<^10` (the classic dropped-comparator bug)", () => {
    expect(parseSn(rep("<", "10"), enc)).toStrictEqual({
      comparator: "<",
      num1: 10,
      num2: undefined,
    });
  });

  it("parses a range (`^100^-^200`)", () => {
    expect(parseSn(rep("", "100", "-", "200"), enc)).toStrictEqual({
      num1: 100,
      separatorOrSuffix: "-",
      num2: 200,
    });
  });

  it("parses a ratio / titer (`^1^:^128`)", () => {
    expect(parseSn(rep("", "1", ":", "128"), enc)).toStrictEqual({
      num1: 1,
      separatorOrSuffix: ":",
      num2: 128,
    });
  });

  it("parses a suffix form (`^2^+`)", () => {
    expect(parseSn(rep("", "2", "+"), enc)).toStrictEqual({
      num1: 2,
      separatorOrSuffix: "+",
      num2: undefined,
    });
  });

  it("accepts every canonical comparator operator", () => {
    for (const op of [">", "<", ">=", "<=", "=", "<>"]) {
      expect(parseSn(rep(op, "5"), enc)?.comparator).toBe(op);
    }
  });

  it("drops a non-operator value in the comparator slot (fail-safe — never a wrong relation)", () => {
    // A bare number mislabeled as SN: `120` sits in SN.1, not SN.2. We refuse to
    // surface "120" as a comparator AND there is no SN.2 → nothing usable → undefined.
    expect(parseSn(rep("120"), enc)).toBeUndefined();
  });

  it("non-numeric SN.2 → num1 undefined, never NaN (still surfaced if a comparator is present)", () => {
    expect(parseSn(rep(">", "abc"), enc)).toStrictEqual({
      comparator: ">",
      num1: undefined,
      num2: undefined,
    });
  });

  it("empty field → undefined", () => {
    expect(parseSn(rep(), enc)).toBeUndefined();
    expect(parseSn(rep("", "", "", ""), enc)).toBeUndefined();
  });

  it("auto-unescapes components before numeric parse", () => {
    // "12\F\5" unescapes to "12|5" → Number("12|5") is NaN → num1 undefined.
    expect(parseSn(rep("", "12\\F\\5"), enc)).toBeUndefined();
  });

  it("num1/num2 are always-present keys; comparator/separator omitted when absent", () => {
    const sn = parseSn(rep(">", "90"), enc);
    expect(sn).toBeDefined();
    expect("num1" in (sn ?? {})).toBe(true);
    expect("num2" in (sn ?? {})).toBe(true);
    expect("separatorOrSuffix" in (sn ?? {})).toBe(false);
  });

  it("a numeric value alone in SN.2 is recovered even without a comparator (`^60`)", () => {
    // GFR-style open value where the comparator was left to the spec default `=`.
    expect(parseSn(rep("", "60"), enc)).toStrictEqual({ num1: 60, num2: undefined });
  });
});
