/**
 * Property tests for Phase R — the first-class text codec and formatted-text
 * renderer.
 *
 * The load-bearing invariant is **encode-safety**: an arbitrary string, once
 * `encodeText`-ed into a field body, re-parses to *exactly* itself with no
 * delimiter injection — it can never forge a component / subcomponent /
 * repetition boundary or break framing. Plus: `renderText` never throws, and a
 * formatting sentinel is never left in the rendered plain text.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { DEFAULT_ENCODING_CHARACTERS } from "../../src/parser/delimiters.js";
import { decodeText, encodeText, parseHL7, renderText } from "../../src/index.js";

const enc = DEFAULT_ENCODING_CHARACTERS;
const RUN_CONFIG = { numRuns: 500, seed: 0x07_21_2026 } as const;

describe("property: text codec encode-safety", () => {
  it("decodeText(encodeText(s)) === s for every arbitrary string", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (s) => {
        expect(decodeText(encodeText(s, enc), enc)).toBe(s);
      }),
      RUN_CONFIG,
    );
  });

  it("an encoded value re-parses to exactly itself — no delimiter injection", () => {
    // Trim-stable (default trimFields would strip edge whitespace, orthogonal to
    // injection) and never the explicit-null token `""`.
    const arbitrary = fc.string({ maxLength: 40 }).filter((s) => s.trim() === s && s !== '""');
    fc.assert(
      fc.property(arbitrary, (s) => {
        const raw = `MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rNTE|1||${encodeText(s, enc)}`;
        const nte3 = parseHL7(raw).segments("NTE")[0]?.field(3);
        // Exact value AND no forged structure: at most one repetition, and its
        // single component has a single subcomponent (or the field is empty).
        expect(nte3?.value).toBe(s);
        const reps = nte3?.repetitions ?? [];
        expect(reps.length).toBeLessThanOrEqual(1);
        if (reps[0] !== undefined) {
          expect(reps[0].components.length).toBeLessThanOrEqual(1);
          expect(reps[0].components[0]?.subcomponents.length ?? 0).toBeLessThanOrEqual(1);
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: renderText is total and sentinel-free", () => {
  it("never throws for any input and always returns a string `text`", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const r = renderText(s, enc);
        expect(typeof r.text).toBe("string");
        // The flat text is exactly the concatenation of the runs' text.
        expect(r.runs.reduce((acc, run) => acc + run.text, "")).toBe(r.text);
      }),
      RUN_CONFIG,
    );
  });

  it("never throws (or OOMs) on an arbitrarily large \\.sp\\/\\.sk\\ count — count is clamped", () => {
    // Guards the fail-safe hole a fixed token list misses: a huge repeat count
    // must clamp, never `RangeError: Invalid string length`. Output length is
    // bounded regardless of the count in the sentinel.
    const bigCount = fc.integer({ min: 0, max: 9_999_999_999 }).map(String);
    const cmd = fc.constantFrom("sp", "sk");
    const input = fc.tuple(cmd, bigCount).map(([c, n]) => `a\\.${c}${n}\\b`);
    fc.assert(
      fc.property(input, (s) => {
        let out = "";
        expect(() => {
          out = renderText(s, enc).text;
        }).not.toThrow();
        expect(out.length).toBeLessThanOrEqual(102); // "a" + ≤100 + "b"
      }),
      RUN_CONFIG,
    );
  });

  it("never leaves a known formatting sentinel in the rendered text", () => {
    const FORMATTING_TOKENS = [
      "\\.br\\",
      "\\.sp\\",
      "\\.sp3\\",
      "\\.in5\\",
      "\\.ti-2\\",
      "\\.fi\\",
      "\\.nf\\",
      "\\.ce\\",
      "\\.sk\\",
      "\\.sk4\\",
    ];
    const safeRun = fc.stringOf(fc.constantFrom(..."abcXYZ ".split("")), { maxLength: 6 });
    const token = fc.constantFrom(...FORMATTING_TOKENS);
    const input = fc
      .array(fc.tuple(safeRun, token), { minLength: 1, maxLength: 10 })
      .map((pairs) => pairs.map(([p, t]) => p + t).join(""));
    fc.assert(
      fc.property(input, (s) => {
        const rendered = renderText(s, enc).text;
        expect(rendered).not.toMatch(/\\\.(?:br|sp|in|ti|fi|nf|ce|sk)/u);
      }),
      RUN_CONFIG,
    );
  });
});
