/**
 * PHI-executable coverage across the FATAL error surface and the serialized
 * output surface (HL7-J Part C — absorbs H-PHI).
 *
 * `test/property/phi-safety.property.test.ts` already covers the WARNING
 * surface (`Hl7ParseWarning.message` never echoes a field VALUE) and pins
 * the `Hl7ParseError.snippet` LENGTH bound. This file covers what that file
 * explicitly scopes out:
 *
 *   1. **Fatal error MESSAGES** (not snippets): over fuzzed PHI-shaped field
 *      values that trigger each of the 4 fatal codes where reachable,
 *      `Hl7ParseError.message` carries only structural/positional facts
 *      (segment name, char counts, the code's own static wording) — never
 *      an arbitrary field VALUE.
 *
 *   2. **The documented snippet nuance**: `errors.ts`'s own JSDoc (lines
 *      66-72) states snippets "may contain PHI when parsing real clinical
 *      messages" and that "the library does not redact — redact at the
 *      call site if required." That is the ACTUAL contract — not "snippets
 *      never carry values." This file asserts the bound the contract DOES
 *      promise (<= 41 chars, per `segments.ts::snippet`) rather than
 *      inventing a stricter no-PHI-ever guarantee the code doesn't make.
 *      This includes the strict-mode escalation path (`index.ts::buildSnippet`),
 *      which is a SEPARATE snippet call site from the direct-fatal path
 *      already covered by `phi-safety.property.test.ts`.
 *
 *   3. **Serialized output honesty note**: `toString()` / `toJSON()` /
 *      `prettyPrint()` are the message content itself (or a debug dump of
 *      it) — they legitimately CONTAIN field values by design. That is not
 *      a leak. This file documents that explicitly with a round-trip
 *      assertion, so a future reader auditing "does hl7 leak PHI anywhere"
 *      doesn't mistake a content surface for a diagnostic/log surface.
 *
 * Same rationale as `phi-safety.property.test.ts` for staying hl7-local +
 * fast-check rather than `@cosyte/test-utils`'s `assertNoSecretLeak`: hl7's
 * PHI surfaces are parser-side and value-by-value, not `Secret<T>`-wrapper
 * shaped.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { FATAL_CODES, Hl7ParseError, parseHL7 } from "../../src/index.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 300, seed: 0x07_09_2026 } as const;

/** Same bound as `phi-safety.property.test.ts`: 40 raw chars + 1 ellipsis. */
const SNIPPET_BOUND = 41;

/** Fixed synthetic PHI-shaped tokens — same shapes as phi-safety.property.test.ts. */
const PHI_MARKERS = [
  "JOHNNY-TESTPATIENT",
  "000-00-0000",
  "TESTMRN-901234",
  "555-867-5309",
] as const;

const markerChar = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split(""));
const markerArb = fc
  .stringOf(markerChar, { minLength: 6, maxLength: 24 })
  .filter((s) => s.length >= 6);

/**
 * Assert an `Hl7ParseError.message` never contains a given PHI-shaped
 * marker. Does NOT touch `.snippet` — that surface's contract is bounded
 * length, not value-absence (see module JSDoc point 2).
 */
function assertMessageNeverEchoesMarker(err: Hl7ParseError, marker: string): void {
  expect(
    err.message.includes(marker),
    `Hl7ParseError(${err.code}).message leaked field VALUE ${JSON.stringify(marker)}: ${err.message}`,
  ).toBe(false);
}

describe("PHI-exec: NO_MSH_SEGMENT fatal message never echoes field values", () => {
  it("property: PHI-shaped content instead of MSH still yields a structural-only message", () => {
    fc.assert(
      fc.property(markerArb, (marker) => {
        // First segment does NOT start with "MSH" — NO_MSH_SEGMENT fires.
        // The marker sits where a naive implementation might echo "the
        // offending content" into the message.
        const raw = `${marker}|foo|bar\rPID|||${marker}\r`;
        try {
          parseHL7(raw);
          throw new Error("expected NO_MSH_SEGMENT to fire");
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7ParseError);
          if (err instanceof Hl7ParseError) {
            expect(err.code).toBe(FATAL_CODES.NO_MSH_SEGMENT);
            assertMessageNeverEchoesMarker(err, marker);
          }
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("PHI-exec: MSH_TOO_SHORT fatal message never echoes field values", () => {
  it("property: a truncated MSH containing PHI-shaped content still yields a structural-only message", () => {
    fc.assert(
      fc.property(markerArb, (marker) => {
        // "MSH" + a short PHI-shaped fragment, kept under the 8-char floor.
        const raw = "MSH" + marker.slice(0, 3);
        try {
          parseHL7(raw);
          throw new Error("expected MSH_TOO_SHORT to fire");
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7ParseError);
          if (err instanceof Hl7ParseError) {
            expect(err.code).toBe(FATAL_CODES.MSH_TOO_SHORT);
            assertMessageNeverEchoesMarker(err, marker);
          }
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("PHI-exec: INVALID_ENCODING_CHARACTERS fatal message never echoes field values", () => {
  it("property: PHI-shaped content used as (invalid) encoding characters yields a count-only message, not the values", () => {
    fc.assert(
      fc.property(markerArb, (marker) => {
        // MSH-2 built from marker chars (deduped, non-whitespace) so the
        // "wrong char count" branch fires with PHI-shaped content sitting
        // exactly where the encoding characters are read from.
        const encodingChars = [...new Set(marker.replace(/[|\s]/gu, ""))].slice(0, 6).join("");
        const raw = `MSH|${encodingChars}|APP|FAC|20250101||ADT^A01|1|P|2.5`;
        try {
          parseHL7(raw);
          // Some marker shapes may coincidentally produce a valid 4/5-char
          // distinct encoding set — that's a legal parse, not a failure of
          // this property (it only asserts the fatal path when it fires).
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7ParseError);
          if (err instanceof Hl7ParseError) {
            expect(err.code).toBe(FATAL_CODES.INVALID_ENCODING_CHARACTERS);
            assertMessageNeverEchoesMarker(err, marker);
            // The message legitimately reports a structural fact about the
            // encoding characters (a count / "distinct" / "whitespace" /
            // "separator" token) — assert one such structural token is present,
            // not absent. Each alternative is a standalone token (grouped so the
            // `\d+` count alternative doesn't bind loosely to the rest).
            expect(err.message).toMatch(
              /(?:\d+ \(v2\.1\))|characters|distinct|whitespace|separator/u,
            );
          }
        }
      }),
      RUN_CONFIG,
    );
  });

  it("fixed case: duplicate MSH-2 encoding chars yield a structural message with the marker absent", () => {
    // MSH-2 "^^\&" repeats "^" — a fixed, reliable trigger for
    // INVALID_ENCODING_CHARACTERS ("...must be 4 distinct characters.").
    // PID carries PHI-shaped markers past the fatal point, proving they
    // can't leak into this specific structural message even though
    // they're present in the raw input the parser is holding when it
    // throws.
    for (const marker of PHI_MARKERS) {
      const raw = `MSH|^^\\&|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||${marker}\r`;
      try {
        parseHL7(raw);
        throw new Error("expected INVALID_ENCODING_CHARACTERS to fire");
      } catch (err) {
        expect(err).toBeInstanceOf(Hl7ParseError);
        if (err instanceof Hl7ParseError) {
          expect(err.code).toBe(FATAL_CODES.INVALID_ENCODING_CHARACTERS);
          assertMessageNeverEchoesMarker(err, marker);
          expect(err.message).toContain("distinct characters");
        }
      }
    }
  });
});

describe("PHI-exec: EMPTY_INPUT fatal carries a static message and empty snippet (trivially PHI-free)", () => {
  it("message is the fixed literal, snippet is exactly empty", () => {
    try {
      parseHL7("");
      throw new Error("expected EMPTY_INPUT to fire");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe(FATAL_CODES.EMPTY_INPUT);
        expect(err.message).toBe("Input is empty.");
        expect(err.snippet).toBe("");
      }
    }
  });
});

describe("PHI-exec: documented snippet contract — bounded, not value-free (errors.ts:66-72)", () => {
  it("property: fatal snippets on PHI-shaped adversarial input stay within the documented 41-char bound", () => {
    // This is the ACTUAL contract: snippet may carry PHI, bounded in length.
    // We assert the bound (what's promised), not absence (what's NOT promised).
    fc.assert(
      fc.property(fc.array(markerArb, { minLength: 1, maxLength: 4 }), (markers) => {
        const raw = markers.join("|") + "X".repeat(50);
        try {
          parseHL7(raw);
        } catch (err) {
          if (err instanceof Hl7ParseError) {
            expect(err.snippet.length).toBeLessThanOrEqual(SNIPPET_BOUND);
          }
        }
      }),
      RUN_CONFIG,
    );
  });

  it("strict-mode escalation snippet (index.ts::buildSnippet, a SEPARATE call site) is also bounded to 41 chars", () => {
    // Strict mode escalates the FIRST Tier-2 warning into an Hl7ParseError
    // via `buildSnippet`, a distinct code path from the direct-fatal
    // `readDelimiters` snippet call already covered above. PHI-shaped
    // content sits in a field that trips a warning (unknown Z-segment),
    // well past the 41-char bound, to prove `buildSnippet`'s 80-char
    // pre-slice still collapses to the same documented final bound.
    fc.assert(
      fc.property(markerArb, (marker) => {
        const raw =
          "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20250101||ADT^A01|CTRL1|P|2.5\r" +
          `ZZZ|${marker}|${marker}|${marker}\r`;
        try {
          parseHL7(raw, { strict: true });
          throw new Error("expected strict mode to escalate UNKNOWN_SEGMENT to a throw");
        } catch (err) {
          if (err instanceof Hl7ParseError) {
            expect(err.snippet.length).toBeLessThanOrEqual(SNIPPET_BOUND);
          } else {
            throw err;
          }
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("Serialized output honesty note: toString()/toJSON()/prettyPrint() legitimately contain field values", () => {
  // These three methods ARE the message (or a structured/pretty dump of
  // it) — NOT a diagnostic or log surface. Field values appearing here is
  // the correct, intended behavior (round-tripping the message), not a PHI
  // leak. Documented explicitly so a reader scanning for "does hl7 leak
  // PHI" doesn't misclassify these as leak paths. Contrast with
  // Hl7ParseWarning.message (never echoes values) and Hl7ParseError.message
  // (never echoes values) — the diagnostic surfaces — asserted elsewhere in
  // this file and in phi-safety.property.test.ts.
  it("toString() round-trips the original field value verbatim (content surface, not a log surface)", () => {
    for (const marker of PHI_MARKERS) {
      const raw = `MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||${marker}||${marker}\r`;
      const msg = parseHL7(raw);
      // Round-trip: the marker DOES appear in toString() — that is correct,
      // not a defect. This assertion is the honesty note, not a leak guard.
      expect(msg.toString()).toContain(marker);
    }
  });

  it("toJSON() round-trips the original field value verbatim (content surface, not a log surface)", () => {
    for (const marker of PHI_MARKERS) {
      const raw = `MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||${marker}\r`;
      const msg = parseHL7(raw);
      const json = JSON.stringify(msg.toJSON());
      expect(json).toContain(marker);
    }
  });

  it("prettyPrint() round-trips the original field value verbatim (debug-dump surface, not a log surface)", () => {
    for (const marker of PHI_MARKERS) {
      const raw = `MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||${marker}\r`;
      const msg = parseHL7(raw);
      // prettyPrint() is a debug/inspection dump — it legitimately CONTAINS the
      // field value (it IS a rendering of the message), which is why it is a
      // deliberate-inspection surface, never a diagnostic/log surface. Asserting
      // the value is present documents that distinction (see the module JSDoc).
      expect(msg.prettyPrint()).toContain(marker);
    }
  });
});
