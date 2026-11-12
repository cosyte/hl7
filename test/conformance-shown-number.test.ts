/**
 * The one rule for a number a conformance diagnostic shows: a non-negative
 * integer of at most 9999, and a fixed phrase for anything else.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_SHOWN_NUMBER,
  UNSHOWN_NUMBER,
  isShownNumber,
  showNumber,
} from "../src/conformance/shown-number.js";

describe("shown numbers", () => {
  it("shows a non-negative integer of at most 9999", () => {
    expect(MAX_SHOWN_NUMBER).toBe(9999);
    for (const n of [0, 1, 42, 9999]) {
      expect(isShownNumber(n), String(n)).toBe(true);
      expect(showNumber(n)).toBe(String(n));
    }
  });

  it("shows the fixed phrase for anything else", () => {
    expect(UNSHOWN_NUMBER).toBe("(a number above 9999)");
    for (const n of [10000, 19800101, -1, -1234567, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isShownNumber(n), String(n)).toBe(false);
      expect(showNumber(n)).toBe(UNSHOWN_NUMBER);
    }
  });
});
