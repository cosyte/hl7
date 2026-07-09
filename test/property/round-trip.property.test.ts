/**
 * Property tests for the Postel's-Law SERIALIZE side: every spec-valid message
 * the builder can construct must survive `serialize → parse` with structural
 * equality, and must be byte-idempotent from the second serialization onward.
 *
 * These are generative analogues of the example-based `test/round-trip.test.ts`
 * sweep. Where that file pins a handful of canonical fixtures, this file
 * generates thousands of messages whose fields exercise repetitions,
 * components, subcomponents, and all five HL7 escape sequences
 * (`\F\ \S\ \T\ \R\ \E\`) plus the `\.br\` newline shorthand.
 *
 * Invariants:
 *   1. Structural equality — `parse(serialize(m)).rawSegments` deep-equals
 *      `m.rawSegments` (and encodingCharacters match).
 *   2. Idempotency — `serialize(parse(serialize(m))) === serialize(m)`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { WARNING_CODES, parseHL7 } from "../../src/index.js";

import { specCleanMessageRaw } from "./_arbitraries.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 400, seed: 0x05_17_2026 } as const;

describe("property: round-trip (serialize → parse) structural equality", () => {
  it("parse(serialize(m)) deep-equals m for every spec-valid message", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), (raw) => {
        // `raw` is already once-serialized output of buildMessage/addSegment,
        // so it is itself spec-clean HL7. Parse it, re-serialize, re-parse.
        const original = parseHL7(raw);
        const emitted = original.toString();
        const roundTripped = parseHL7(emitted);

        expect(roundTripped.rawSegments).toEqual(original.rawSegments);
        expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
      }),
      RUN_CONFIG,
    );
  });

  it("serialization is idempotent from the second pass onward", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), (raw) => {
        const once = parseHL7(raw).toString();
        const twice = parseHL7(once).toString();
        expect(twice).toBe(once);
      }),
      RUN_CONFIG,
    );
  });

  it("spec-clean generation never produces BYTE-changing parser warnings (the generator is honest)", () => {
    // This guards the GENERATOR, not the parser: if a spec-clean message ever
    // warns a BYTE-changing warning, the round-trip invariant above could be
    // masking a lossy transform (whitespace trim, unknown escape) rather than
    // proving fidelity. MISSING_EXPECTED_GROUP (Phase G) is excluded: the
    // generator builds recognized message types with arbitrary segments and so
    // legitimately omits Required groups, but that warning is purely structural
    // advice — it changes no bytes and is orthogonal to round-trip fidelity.
    fc.assert(
      fc.property(specCleanMessageRaw(), (raw) => {
        const msg = parseHL7(raw);
        const byteChanging = msg.warnings
          .map((w) => w.code)
          .filter((c) => c !== WARNING_CODES.MISSING_EXPECTED_GROUP);
        expect(byteChanging).toEqual([]);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: HL7-ESC full-alphabet byte-verbatim fidelity", () => {
  // Escape tokens spanning EVERY family the parser recognizes. Emitting a
  // parsed field must reproduce these bytes verbatim — delimiter escapes via
  // reescape, preserve/hex escapes via the rawSubcomponents overlay.
  const escapeToken = fc.constantFrom(
    "\\F\\",
    "\\S\\",
    "\\T\\",
    "\\R\\",
    "\\E\\",
    "\\.br\\",
    "\\X41\\",
    "\\X0d\\",
    "\\X0D\\",
    "\\X48656C6C6F\\",
    "\\H\\",
    "\\N\\",
    "\\.in\\",
    "\\.sp\\",
    "\\.ce\\",
    "\\C2842\\",
    "\\M824041\\",
    "\\Z99\\",
    "\\Zvendor\\",
  );
  // Plain runs use an alphabet with NO reserved delimiter/escape chars — and
  // no whitespace (the default `trimFields` would strip a leading/trailing
  // space, which is orthogonal to escape fidelity) — so the generated OBX-5
  // stays a single spec-clean subcomponent whose only escapes are the tokens
  // above.
  const plainRun = fc.stringOf(fc.constantFrom(..."abcXYZ0189".split("")), { maxLength: 6 });
  const escapedContent = fc
    .array(fc.tuple(plainRun, escapeToken), { minLength: 1, maxLength: 8 })
    .map((pairs) => pairs.map(([p, e]) => p + e).join(""));

  it("parse→emit reproduces the escape alphabet byte-verbatim in OBX-5", () => {
    fc.assert(
      fc.property(escapedContent, (content) => {
        const raw =
          "MSH|^~\\&|LAB|MAIN|EHR|REF|20260101100000||ORU^R01|MSG1|P|2.5\r" +
          `OBX|1|TX|CODE^Text^L||${content}||||||F`;
        const emittedObx = parseHL7(raw)
          .toString()
          .split("\r")
          .find((l) => l.startsWith("OBX"));
        expect(emittedObx).toBe(`OBX|1|TX|CODE^Text^L||${content}||||||F`);
        // And the whole message is a fixpoint from the second pass.
        const once = parseHL7(raw).toString();
        expect(parseHL7(once).toString()).toBe(once);
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: round-trip escape-sequence fidelity", () => {
  it("decoded delimiter/newline values re-escape and re-decode to the same string", () => {
    // Targeted: a single NTE field whose value is delimiter-laden. Asserts the
    // decoded leaf survives a full serialize→parse cycle unchanged, which is
    // the load-bearing claim behind reescape/unescape being inverses.
    fc.assert(
      fc.property(specCleanMessageRaw(), (raw) => {
        const original = parseHL7(raw);
        const roundTripped = parseHL7(original.toString());
        // Compare every leaf subcomponent across the whole tree.
        const leaves = (segs: typeof original.rawSegments): string[] => {
          const out: string[] = [];
          for (const seg of segs) {
            for (const field of seg.fields) {
              for (const rep of field.repetitions) {
                for (const comp of rep.components) {
                  for (const sub of comp.subcomponents) out.push(sub);
                }
              }
            }
          }
          return out;
        };
        expect(leaves(roundTripped.rawSegments)).toEqual(leaves(original.rawSegments));
      }),
      RUN_CONFIG,
    );
  });
});
