/**
 * Property tests for the Phase H version-sensitivity contract: a coded element
 * (CWE / CE) that grew across HL7 versions is tolerated **without loss or
 * throw**.
 *
 * HL7 composites are append-only across versions — v2.7 grew CWE from 9 to 22
 * components (second-alternate triplet + coding-system / value-set OIDs), and
 * CE was superseded by CWE entirely. A fixed-shape parser that assumed a
 * component count would either throw or silently truncate the newer
 * components. The contract here:
 *
 *   1. No throw — parsing a coded element with an arbitrary number of trailing
 *      components never throws (forward-compatibility with future versions).
 *   2. No loss — every modeled component is unchanged, and every component past
 *      the modeled set is preserved verbatim and in order on `extraComponents`
 *      (up to the last non-empty one).
 *   3. CE↔CWE uniformity — reading a CWE-shaped value through `parseCe` keeps
 *      its components 7+ on `extraComponents` rather than dropping them.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { DEFAULT_ENCODING_CHARACTERS } from "../../src/parser/delimiters.js";
import type { RawRepetition } from "../../src/parser/types.js";
import { parseCe } from "../../src/model/types/ce.js";
import { parseCwe } from "../../src/model/types/cwe.js";

const RUN_CONFIG = { numRuns: 500, seed: 0x06_30_2026 } as const;
const enc = DEFAULT_ENCODING_CHARACTERS;

/** A single-subcomponent value with no active delimiters (escape-clean). */
const valueArb = fc.stringMatching(/^[A-Za-z0-9. -]{0,12}$/);

function rep(values: readonly string[]): RawRepetition {
  return { components: values.map((v) => ({ subcomponents: [v] })) };
}

/** The last index in `values` carrying a non-empty value, or -1 if none. */
function lastContentIndex(values: readonly string[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== "") return i;
  }
  return -1;
}

describe("property: CWE/CE tolerate version component-growth without loss or throw", () => {
  it("parseCwe never throws and preserves components 10+ on extraComponents", () => {
    fc.assert(
      fc.property(fc.array(valueArb, { minLength: 0, maxLength: 25 }), (values) => {
        const out = parseCwe(rep(values), enc);

        const lastContent = lastContentIndex(values);
        const expectedExtra = lastContent < 9 ? undefined : values.slice(9, lastContent + 1);
        expect(out.extraComponents).toEqual(expectedExtra);

        // Modeled component 1 (identifier) is unaffected by trailing growth.
        const id = values[0] ?? "";
        expect(out.identifier).toBe(id === "" ? undefined : id);
      }),
      RUN_CONFIG,
    );
  });

  it("parseCe never throws and preserves components 7+ on extraComponents", () => {
    fc.assert(
      fc.property(fc.array(valueArb, { minLength: 0, maxLength: 25 }), (values) => {
        const out = parseCe(rep(values), enc);

        const lastContent = lastContentIndex(values);
        const expectedExtra = lastContent < 6 ? undefined : values.slice(6, lastContent + 1);
        expect(out.extraComponents).toEqual(expectedExtra);
      }),
      RUN_CONFIG,
    );
  });

  it("CE↔CWE uniformity — reading a CWE through parseCe loses nothing", () => {
    fc.assert(
      fc.property(fc.array(valueArb, { minLength: 6, maxLength: 22 }), (values) => {
        const asCwe = parseCwe(rep(values), enc);
        const asCe = parseCe(rep(values), enc);

        // The 6 shared components agree.
        expect(asCe.identifier).toBe(asCwe.identifier);
        expect(asCe.nameOfAlternateCodingSystem).toBe(asCwe.nameOfAlternateCodingSystem);

        // Everything the CWE view models past component 6 is still recoverable
        // from the CE view (components 7+ live on its extraComponents).
        const lastContent = lastContentIndex(values);
        if (lastContent >= 6) {
          expect(asCe.extraComponents).toEqual(values.slice(6, lastContent + 1));
        }
      }),
      RUN_CONFIG,
    );
  });
});
