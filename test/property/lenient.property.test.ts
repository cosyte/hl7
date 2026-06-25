/**
 * Property tests for the Postel's-Law PARSE side: liberal in what we accept.
 *
 * The contract (parser/index.ts + errors.ts): in lenient mode `parseHL7` may
 * throw ONLY an `Hl7ParseError` carrying one of the four Tier-3 fatal codes
 * (`EMPTY_INPUT`, `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
 * `INVALID_ENCODING_CHARACTERS`). Every other deviation — vendor quirks,
 * truncation, weird delimiters, unknown segments, extra fields, random bytes —
 * must be recovered into `msg.warnings`, never thrown.
 *
 * Additional invariants on the warnings themselves:
 *   - every `warning.code` is a member of the public `WARNING_CODES` set
 *     (no ad-hoc / unregistered codes leak out);
 *   - every warning carries positional context (`position.segmentIndex` is a
 *     finite number, per the TOL-02 "positional context present" requirement).
 *
 * This is the generative analogue of `test/parser-malformed-sweep.test.ts`
 * (which pins the 4 fatal fixtures) and `test/parser-warnings.test.ts`.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { FATAL_CODES, Hl7ParseError, WARNING_CODES, parseHL7 } from "../../src/index.js";

import { hostileInput, randomBytes, quirkyMessageRaw } from "./_arbitraries.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 500, seed: 0x06_25_2026 } as const;

/** The set of legal Tier-3 fatal code strings — the ONLY throwable codes. */
const FATAL_CODE_SET: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));

/** The set of legal Tier-2 warning code strings. */
const WARNING_CODE_SET: ReadonlySet<string> = new Set(Object.values(WARNING_CODES));

/**
 * Parse `raw` leniently and return the message, OR rethrow only if the thrown
 * thing is NOT a Tier-3 fatal. Any non-`Hl7ParseError` throw, or an
 * `Hl7ParseError` with a non-fatal code, fails the invariant immediately.
 */
function parseOrAssertFatal(raw: string | Buffer): ReturnType<typeof parseHL7> | undefined {
  try {
    return parseHL7(raw);
  } catch (err) {
    // Only Hl7ParseError is permitted to escape lenient mode.
    expect(err).toBeInstanceOf(Hl7ParseError);
    if (err instanceof Hl7ParseError) {
      // And only with one of the 4 Tier-3 codes.
      expect(FATAL_CODE_SET.has(err.code)).toBe(true);
      // Fatals must still carry positional context + a string snippet (TOL-02).
      expect(typeof err.position).toBe("object");
      expect(typeof err.position.segmentIndex).toBe("number");
      expect(typeof err.snippet).toBe("string");
    }
    return undefined;
  }
}

/** Assert every warning on a parsed message is well-formed (code + position). */
function assertWarningsWellFormed(msg: ReturnType<typeof parseHL7>): void {
  for (const w of msg.warnings) {
    // Stable, registered code — no unknown/ad-hoc codes.
    expect(WARNING_CODE_SET.has(w.code)).toBe(true);
    // Non-empty human message.
    expect(typeof w.message).toBe("string");
    expect(w.message.length).toBeGreaterThan(0);
    // Positional context present: segmentIndex is a finite number.
    expect(Number.isFinite(w.position.segmentIndex)).toBe(true);
  }
}

describe("property: lenient mode never throws except Tier-3 fatals", () => {
  it("hostile string input either parses or throws a Tier-3 fatal — nothing else", () => {
    fc.assert(
      fc.property(hostileInput(), (raw) => {
        const msg = parseOrAssertFatal(raw);
        if (msg !== undefined) assertWarningsWellFormed(msg);
      }),
      RUN_CONFIG,
    );
  });

  it("pure random bytes never throw a non-fatal / non-Hl7ParseError", () => {
    fc.assert(
      fc.property(randomBytes(), (raw) => {
        const msg = parseOrAssertFatal(raw);
        if (msg !== undefined) assertWarningsWellFormed(msg);
      }),
      RUN_CONFIG,
    );
  });

  it("random Buffer input (charset path) never throws a non-fatal", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 200 }), (bytes) => {
        const buf = Buffer.from(bytes);
        const msg = parseOrAssertFatal(buf);
        if (msg !== undefined) assertWarningsWellFormed(msg);
      }),
      RUN_CONFIG,
    );
  });

  it("every warning emitted on quirky input carries a registered code + position", () => {
    fc.assert(
      fc.property(quirkyMessageRaw(), (raw) => {
        const msg = parseOrAssertFatal(raw);
        if (msg !== undefined) {
          assertWarningsWellFormed(msg);
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: lenient vs strict consistency on the same input", () => {
  it("if lenient parse emits >=1 warning, strict parse throws Hl7ParseError", () => {
    // Strict mode escalates the FIRST Tier-2 warning into a throw. So: any
    // input that warns in lenient mode must throw in strict mode; any input
    // that throws a Tier-3 fatal in lenient mode also throws in strict mode.
    fc.assert(
      fc.property(quirkyMessageRaw(), (raw) => {
        let lenient: ReturnType<typeof parseHL7> | undefined;
        let lenientThrew = false;
        try {
          lenient = parseHL7(raw);
        } catch (err) {
          // Tier-3 fatal in lenient mode — strict will throw identically.
          expect(err).toBeInstanceOf(Hl7ParseError);
          lenientThrew = true;
        }

        if (lenientThrew) {
          // Strict must also throw (the same Tier-3 fatal fires pre-warning).
          expect(() => parseHL7(raw, { strict: true })).toThrow(Hl7ParseError);
          return;
        }

        if (lenient !== undefined && lenient.warnings.length > 0) {
          // Lenient produced warnings → strict escalates to a throw.
          expect(() => parseHL7(raw, { strict: true })).toThrow(Hl7ParseError);
        } else {
          // Zero warnings → strict must succeed too (no escalation trigger).
          expect(() => parseHL7(raw, { strict: true })).not.toThrow();
        }
      }),
      RUN_CONFIG,
    );
  });
});
