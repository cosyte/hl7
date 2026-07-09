/**
 * Dedicated fuzz harness (HL7-J Part B): the single "never throw except a
 * 4-fatal `Hl7ParseError`" invariant, run at a high iteration count across
 * three distinct hostile-input shapes that the existing
 * `lenient.property.test.ts` doesn't already generate:
 *
 *   1. arbitrary byte/char strings (no HL7 structure at all);
 *   2. delimiter-mutation of REAL canonical corpus messages — randomly
 *      inject/duplicate/drop the five HL7 delimiter characters (`| ^ ~ \ &`)
 *      and the segment terminator (`\r`) into a message that started out
 *      spec-clean;
 *   3. truncations of those same canonical messages, at every possible cut
 *      point.
 *
 * This file also snapshots `FATAL_CODES`/`WARNING_CODES` membership (both
 * are declared `as const` — compile-time-locked, not runtime-frozen — so a
 * silent registry change is caught here, independent of any single parse
 * outcome) and asserts the "survivor round-trip" property: every message
 * that DOES parse can be `toString()`'d and re-parsed without throwing.
 *
 * Complements (does not replace) `lenient.property.test.ts` — that file
 * covers the same core invariant against `hostileInput()`/`quirkyMessageRaw()`;
 * this file adds real-corpus delimiter mutation + truncation at fuzz-scale
 * run counts, per HL7-J Part B.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { FATAL_CODES, Hl7ParseError, WARNING_CODES, parseHL7 } from "../../src/index.js";

/** High run count, fixed seed — deterministic fuzz-scale reproduction. */
const RUN_CONFIG = { numRuns: 1000, seed: 0x07_09_2026 } as const;

const FATAL_CODE_SET: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "canonical",
);

/** Every canonical `.hl7` fixture, loaded once at module init. */
const CANONICAL_MESSAGES: readonly string[] = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".hl7"))
  .map((f) => readFileSync(path.join(FIXTURE_DIR, f), "utf8"))
  .filter((s) => s.length > 0);

/**
 * Core invariant: `parseHL7(input)` either returns an `Hl7Message`, or
 * throws an `Hl7ParseError` whose `.code` is one of the 4 fatal codes. Any
 * other throw (wrong error class, or an `Hl7ParseError` with a non-fatal
 * code) fails the property immediately.
 */
function assertNeverThrowsExceptFatal(raw: string): ReturnType<typeof parseHL7> | undefined {
  try {
    return parseHL7(raw);
  } catch (err) {
    expect(err).toBeInstanceOf(Hl7ParseError);
    if (err instanceof Hl7ParseError) {
      expect(
        FATAL_CODE_SET.has(err.code),
        `Hl7ParseError threw with unregistered code ${JSON.stringify(err.code)}`,
      ).toBe(true);
    }
    return undefined;
  }
}

/** The five reserved HL7 delimiters plus the segment-terminator `\r`. */
const MUTATION_CHARS = ["|", "^", "~", "\\", "&", "\r"] as const;

/**
 * Delimiter-mutation arbitrary: pick a canonical message, then apply a
 * sequence of random point mutations — each either INJECTS a random
 * delimiter char at a random offset, DUPLICATES the char already at a
 * random offset, or DROPS (deletes) the char at a random offset. Produces
 * malformed-but-delimiter-shaped input derived from real, spec-clean
 * messages rather than pure noise.
 */
function delimiterMutatedMessage(): fc.Arbitrary<string> {
  const mutationOp = fc.constantFrom("inject", "duplicate", "drop");
  const mutation = fc.record({
    op: mutationOp,
    offsetFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    char: fc.constantFrom(...MUTATION_CHARS),
  });

  return fc
    .record({
      base: fc.constantFrom(...CANONICAL_MESSAGES),
      mutations: fc.array(mutation, { minLength: 1, maxLength: 12 }),
    })
    .map(({ base, mutations }) => {
      let s = base;
      for (const m of mutations) {
        if (s.length === 0) break;
        const offset = Math.min(s.length - 1, Math.floor(m.offsetFrac * s.length));
        switch (m.op) {
          case "inject":
            s = s.slice(0, offset) + m.char + s.slice(offset);
            break;
          case "duplicate":
            s = s.slice(0, offset) + s[offset] + s.slice(offset);
            break;
          case "drop":
            s = s.slice(0, offset) + s.slice(offset + 1);
            break;
        }
      }
      return s;
    });
}

/**
 * Truncation arbitrary: pick a canonical message and cut it at a random
 * point (from 0 chars up to the full length), so every prefix length —
 * including mid-segment and mid-field cuts — is exercised across runs.
 */
function truncatedMessage(): fc.Arbitrary<string> {
  return fc
    .record({
      base: fc.constantFrom(...CANONICAL_MESSAGES),
      cutFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map(({ base, cutFrac }) => base.slice(0, Math.floor(cutFrac * base.length)));
}

describe("fuzz: canonical corpus is loaded", () => {
  it("has at least one non-empty fixture (sanity — a 0-fixture corpus would make every property vacuous)", () => {
    expect(CANONICAL_MESSAGES.length).toBeGreaterThan(0);
  });
});

describe("fuzz: FATAL_CODES / WARNING_CODES registries stay pinned", () => {
  it("FATAL_CODES is exactly the documented 4-code set (locked at 4 per errors.ts JSDoc)", () => {
    // `FATAL_CODES` is declared `as const` (compile-time-readonly, per the
    // errors.ts JSDoc "locked at four codes") — not runtime-`Object.freeze`d,
    // so this snapshot asserts membership, the actual documented contract.
    expect(Object.keys(FATAL_CODES).sort()).toEqual(
      ["EMPTY_INPUT", "INVALID_ENCODING_CHARACTERS", "MSH_TOO_SHORT", "NO_MSH_SEGMENT"].sort(),
    );
  });

  it("WARNING_CODES membership matches the exported registry snapshot", () => {
    expect(Object.keys(WARNING_CODES).sort()).toEqual(
      [
        "MLLP_FRAMING_STRIPPED",
        "FIELD_WHITESPACE_TRIMMED",
        "UNKNOWN_ESCAPE_SEQUENCE",
        "TIMESTAMP_FALLBACK_FORMAT",
        "SEGMENT_CASE",
        "EXTRA_FIELDS",
        "UNKNOWN_SEGMENT",
        "DUPLICATE_REQUIRED_SEGMENT",
        "ENCODING_MISMATCH",
        "MISSING_REQUIRED_FIELD",
        "MISSING_EXPECTED_GROUP",
        "OUT_OF_ORDER_SEGMENT",
        "VERSION_MISMATCH",
        "UNKNOWN_CHARSET",
        "UNSUPPORTED_CHARSET",
        "ACK_NO_CORRELATION_ID",
        "MERGE_MISSING_PRIOR_OR_SURVIVOR",
        "BATCH_COUNT_MISMATCH",
        "BATCH_MISSING_TRAILER",
      ].sort(),
    );
  });
});

describe("fuzz: arbitrary byte/char strings never throw except a 4-fatal Hl7ParseError", () => {
  it("random unicode/binary strings", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500, unit: "binary" }), (raw) => {
        assertNeverThrowsExceptFatal(raw);
      }),
      RUN_CONFIG,
    );
  });

  it("random printable-ASCII strings shaped loosely like segments", () => {
    const segLine = fc.stringOf(
      fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ|^~\\&0123456789 \t".split("")),
      { minLength: 0, maxLength: 80 },
    );
    fc.assert(
      fc.property(fc.array(segLine, { minLength: 0, maxLength: 15 }), (lines) => {
        assertNeverThrowsExceptFatal(lines.join("\r"));
      }),
      RUN_CONFIG,
    );
  });
});

describe("fuzz: delimiter-mutation of valid canonical messages never throws except a 4-fatal Hl7ParseError", () => {
  it("inject/duplicate/drop mutations of the five HL7 delimiters + segment terminator", () => {
    fc.assert(
      fc.property(delimiterMutatedMessage(), (raw) => {
        assertNeverThrowsExceptFatal(raw);
      }),
      RUN_CONFIG,
    );
  });
});

describe("fuzz: truncations of valid canonical messages never throw except a 4-fatal Hl7ParseError", () => {
  it("every truncation length across the canonical corpus", () => {
    fc.assert(
      fc.property(truncatedMessage(), (raw) => {
        assertNeverThrowsExceptFatal(raw);
      }),
      RUN_CONFIG,
    );
  });
});

describe("fuzz: survivor round-trip — anything that parses can be re-parsed", () => {
  it("parseHL7(msg.toString()) never throws for any input that parsed the first time", () => {
    const anyFuzzInput = fc.oneof(
      { weight: 1, arbitrary: fc.string({ minLength: 0, maxLength: 300, unit: "binary" }) },
      { weight: 2, arbitrary: delimiterMutatedMessage() },
      { weight: 2, arbitrary: truncatedMessage() },
    );
    fc.assert(
      fc.property(anyFuzzInput, (raw) => {
        const msg = assertNeverThrowsExceptFatal(raw);
        if (msg === undefined) return; // fatal on first parse — nothing to round-trip
        const serialized = msg.toString();
        // Re-parsing the serialized survivor must not throw — the whole
        // point of a "survivor" is that it already reached a valid
        // Hl7Message, and toString() is the serializer's own conservative
        // (spec-clean) output.
        expect(() => parseHL7(serialized)).not.toThrow();
      }),
      RUN_CONFIG,
    );
  });
});
