/**
 * Property tests for PHI safety in error/warning paths.
 *
 * The invariant: `Hl7ParseWarning.message` strings carry only **positional
 * context** plus **bounded metadata** (segment identifiers like `PID`/`ZZZ`,
 * escape sequences, format strings, field counts). They MUST NOT echo the
 * VALUE of a field (patient name, MRN, SSN, phone, address) because warnings
 * routinely flow into application logs, where PHI is a leak.
 *
 * Scope boundary (intentional): `Hl7ParseError.snippet` is a different
 * surface. Its JSDoc at `parser/errors.ts:70-72` documents that snippets may
 * carry up to ~40 bytes of offending input and that **the library does not
 * redact**: consumers must. That is the documented consumer-redaction
 * boundary, not a bug. This file therefore tests two distinct things:
 *
 *   1. warnings never echo field values (the leak we DO defend against), and
 *   2. snippet length is always bounded (the documented contract holds even
 *      for arbitrarily-large adversarial inputs).
 *
 * Why we do NOT use `@cosyte/test-utils`'s `assertNoSecretLeak`: that runner
 * is shaped for `Secret<T>`-style wrappers (the pathways credentials pattern),
 * driving a value through four stringify channels. hl7 has no such wrapper;
 * its PHI surfaces are parser-side, value-by-value, and a per-channel test is
 * the wrong shape. Property-based "no echo" assertions are.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { FATAL_CODES, Hl7ParseError, parseHL7 } from "../../src/index.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 200, seed: 0x06_27_2026 } as const;

/**
 * Snippet bound from `parser/segments.ts:50`: 40 raw chars + 1 ellipsis
 * code point (`…`). Locked here so a regression in the bound surfaces
 * as a test failure, not a silent PHI-exposure blow-out.
 */
const SNIPPET_BOUND = 41;

/**
 * Fixed synthetic PHI-shaped tokens. Each is distinct enough to never
 * accidentally collide with warning-message metadata (segment names,
 * numeric field counts, escape sequences). If one ever appears in a
 * warning's `message`, the parser is echoing a field VALUE: the leak we
 * are guarding against.
 */
const PHI_MARKERS = [
  "JOHNNY-TESTPATIENT", // name shape
  "987-65-4321", // SSN shape (synthetic: `987-XX-XXXX` is in the IRS never-issued range)
  "TESTMRN-901234", // MRN shape
  "555-867-5309", // phone shape
  "TESTBLOB-XYZ123", // generic identifier shape
] as const;

/**
 * Build a quirky HL7 message that (a) parses leniently with warnings, and
 * (b) embeds each given marker as a FIELD VALUE in several places: patient
 * name/MRN, extra fields past the segment end, a lowercase-named segment, a
 * Z-segment, and a value in an OBX. Crucially the markers appear only as
 * field VALUES, never as segment identifiers or escape sequences, so any
 * occurrence in a warning's message is a leak.
 */
function quirkyMessageWithMarkers(markers: readonly string[]): string {
  // noUncheckedIndexedAccess: destructure with defaults so each slot is a
  // narrowed `string`, not `string | undefined`.
  const [m0 = "M0", m1 = "M1", m2 = "M2", m3 = "M3", m4 = "M4"] = markers;

  const segments = [
    // Spec-clean MSH so the parse succeeds.
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20250101||ADT^A01|CTRL1|P|2.5",
    // PID with markers in PID-3 (MRN repetition) and PID-5 (name).
    `PID|||${m2}~${m1}||${m0}^TestFirstName||19800101|M`,
    // PID with extras past the segment end → EXTRA_FIELDS, markers in extras.
    `PID|||X||Y|||${m3}|extra|fields|past|end|with|${m4}`,
    // Lowercase segment with a marker → SEGMENT_CASE warning.
    `pid|||${m0}`,
    // Unknown Z-segment with markers → UNKNOWN_SEGMENT warning.
    `ZZZ|${m1}|${m3}`,
    // Unknown escape sequence (\Z99\) near a marker → UNKNOWN_ESCAPE_SEQUENCE.
    `NTE|1||a note with \\Z99\\ unknown escape near ${m4}`,
    // OBX with a marker in OBX-5 (value).
    `OBX|1|ST|TEST||${m2}|||||F`,
  ];
  return segments.join("\r");
}

/**
 * Build a quirky HL7 message where each marker is embedded with surrounding
 * whitespace (to trigger FIELD_WHITESPACE_TRIMMED) and, separately, behind a
 * stray/unknown escape character (to trigger UNKNOWN_ESCAPE_SEQUENCE): the
 * two leak vectors this fix targets. Markers appear ONLY as field VALUES.
 */
function quirkyMessageWithEscapesAndWhitespace(markers: readonly string[]): string {
  const [m0 = "M0", m1 = "M1", m2 = "M2"] = markers;

  const segments = [
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20250101||ADT^A01|CTRL1|P|2.5",
    // Leading/trailing whitespace around a marker -> FIELD_WHITESPACE_TRIMMED.
    `NTE|1||  ${m0}  `,
    // Marker behind an unknown vendor escape -> UNKNOWN_ESCAPE_SEQUENCE.
    `NTE|2||free text \\Z${m1}\\ more text`,
    // Marker after a stray, unterminated escape char (no closing partner).
    `OBX|1|ST|TEST||free text \\${m2}`,
  ];
  return segments.join("\r");
}

describe("property: PHI safety in warning paths", () => {
  it("warnings never echo fixed synthetic PHI markers (sanity)", () => {
    const raw = quirkyMessageWithMarkers(PHI_MARKERS);
    const msg = parseHL7(raw);

    // Sanity: the fixture is quirky enough to actually trigger warnings,
    // an empty warnings array would make the no-echo check vacuous.
    expect(msg.warnings.length).toBeGreaterThan(0);

    for (const w of msg.warnings) {
      for (const marker of PHI_MARKERS) {
        expect(
          w.message.includes(marker),
          `warning ${w.code} leaked field VALUE marker ${JSON.stringify(marker)}: ${w.message}`,
        ).toBe(false);
      }
    }
  });

  it("property: arbitrary marker-shaped field VALUES never appear in warnings", () => {
    // Generated tokens use uppercase letters + digits + hyphen and are
    // ≥ 6 chars, so they cannot collide with the 3-char HL7 segment names
    // ("PID", "ZZZ", "NTE", "OBX") that warning messages legitimately echo,
    // nor with numeric field counts.
    const markerChar = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split(""));
    const tokenArb = fc
      .stringOf(markerChar, { minLength: 6, maxLength: 24 })
      .filter((s) => s.length >= 6);

    fc.assert(
      fc.property(fc.array(tokenArb, { minLength: 3, maxLength: 5 }), (tokens) => {
        const raw = quirkyMessageWithMarkers(tokens);
        let parsed: ReturnType<typeof parseHL7>;
        try {
          parsed = parseHL7(raw);
        } catch (err) {
          // A Tier-3 fatal is acceptable here: the snippet on a fatal may
          // carry PHI by design (errors.ts JSDoc). This property covers
          // warnings only.
          expect(err).toBeInstanceOf(Hl7ParseError);
          return;
        }
        for (const w of parsed.warnings) {
          for (const token of tokens) {
            expect(
              w.message.includes(token),
              `warning ${w.code} leaked field VALUE ${JSON.stringify(token)}: ${w.message}`,
            ).toBe(false);
          }
        }
      }),
      RUN_CONFIG,
    );
  });

  it("property: escape-char and whitespace-shaped field VALUES never appear in warnings", () => {
    // This is the exact property that would have caught HL7-TOKENIZE-PHI:
    // markers embedded behind a stray/unknown escape character (\Z..\ and an
    // unterminated \..) and surrounded by leading/trailing whitespace, run
    // through the real tokenizer + escape layer.
    const markerChar = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split(""));
    const tokenArb = fc
      .stringOf(markerChar, { minLength: 6, maxLength: 24 })
      .filter((s) => s.length >= 6);

    fc.assert(
      fc.property(fc.array(tokenArb, { minLength: 2, maxLength: 3 }), (tokens) => {
        const raw = quirkyMessageWithEscapesAndWhitespace(tokens);
        let parsed: ReturnType<typeof parseHL7>;
        try {
          parsed = parseHL7(raw);
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7ParseError);
          return;
        }
        for (const w of parsed.warnings) {
          for (const token of tokens) {
            expect(
              w.message.includes(token),
              `warning ${w.code} leaked field VALUE ${JSON.stringify(token)}: ${w.message}`,
            ).toBe(false);
            // Also guard the lowercase form, since markers are uppercase and
            // a case-insensitive substring match would be a stronger leak
            // signal to catch: but message text itself is expected to be
            // lowercase English, so this only trips on an actual echo.
            expect(
              w.message.toLowerCase().includes(token.toLowerCase()),
              `warning ${w.code} leaked (case-insensitive) field VALUE ${JSON.stringify(token)}: ${w.message}`,
            ).toBe(false);
          }
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: PHI safety when a field-internal line break forges a segment", () => {
  /**
   * The position the two generators above **structurally cannot reach**.
   *
   * Every marker they emit sits AFTER a `|` on its line, so it is always a
   * field value in the tokenizer's eyes. The one position that leaks is a
   * line's LEADING token: `tokenize.ts` takes the whole line as the segment
   * `name` when the line contains no field separator, and `unknownSegment`
   * interpolates that name into its message uncapped.
   *
   * This is not a contrived position. `normalize.ts` rewrites every `\r\n`
   * and `\n` in the input to `\r` unconditionally and with no field
   * awareness, BEFORE segment splitting. So an unescaped line break inside a
   * narrative field (HL7 v2 Ch. 2 requires `\.br\` for exactly this reason,
   * and real senders violate it) turns the remainder of that field into a
   * forged segment whose "name" is free-text clinical content.
   *
   * A green suite over a generator that cannot produce this case is
   * indistinguishable from a correct one, which is why it is generated here
   * rather than asserted as a one-off.
   */
  function messageWithFieldInternalLineBreak(marker: string, breakSeq: string): string {
    return [
      "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20250101||ORU^R01|CTRL1|P|2.5",
      "PID|||X||Y||19800101|M",
      // The unescaped break splits OBX-5; everything after it becomes a
      // forged segment whose entire line is read as the segment identifier.
      `OBX|1|TX|IMP||Impression: unremarkable.${breakSeq}${marker} continuation of the narrative`,
    ].join("\r");
  }

  const BREAK_SEQUENCES = ["\n", "\r\n"] as const;

  it("a forged segment name never reaches a warning message (fixed markers)", () => {
    for (const marker of PHI_MARKERS) {
      for (const breakSeq of BREAK_SEQUENCES) {
        const raw = messageWithFieldInternalLineBreak(marker, breakSeq);
        const msg = parseHL7(raw);

        // Sanity: the forged segment must actually raise a warning, or the
        // no-echo assertion below is vacuous.
        expect(
          msg.warnings.length,
          "fixture did not trigger a warning; the no-echo check would be vacuous",
        ).toBeGreaterThan(0);

        for (const w of msg.warnings) {
          expect(
            w.message.includes(marker),
            `warning ${w.code} leaked forged-segment content ${JSON.stringify(marker)}: ${w.message}`,
          ).toBe(false);
        }
      }
    }
  });

  it("property: arbitrary forged-segment content never reaches a warning message", () => {
    const markerChar = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-, ".split(""));
    const tokenArb = fc
      .stringOf(markerChar, { minLength: 6, maxLength: 40 })
      .filter((s) => s.trim().length >= 6);

    fc.assert(
      fc.property(tokenArb, fc.constantFrom(...BREAK_SEQUENCES), (token, breakSeq) => {
        const raw = messageWithFieldInternalLineBreak(token, breakSeq);
        let parsed: ReturnType<typeof parseHL7>;
        try {
          parsed = parseHL7(raw);
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7ParseError);
          return;
        }
        for (const w of parsed.warnings) {
          expect(
            w.message.includes(token),
            `warning ${w.code} leaked forged-segment content ${JSON.stringify(token)}: ${w.message}`,
          ).toBe(false);
        }
      }),
      RUN_CONFIG,
    );
  });
});

describe("Hl7ParseError.snippet length bound", () => {
  it("snippet stays ≤ 41 chars (40 + ellipsis) for arbitrarily-large fatal inputs", () => {
    // Generate adversarially-sized inputs and check the snippet bound on any
    // fatal that fires. By design, snippet CONTENT may carry PHI: the bound
    // is what locks the consumer-redaction contract.
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 4000 }), (raw) => {
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

  it("EMPTY_INPUT fatal carries a bounded (length-0) snippet", () => {
    try {
      parseHL7("");
      // Reaching here is a contract violation; parseHL7("") MUST throw.
      throw new Error("expected parseHL7('') to throw Hl7ParseError but it did not");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe(FATAL_CODES.EMPTY_INPUT);
        expect(err.snippet.length).toBeLessThanOrEqual(SNIPPET_BOUND);
      }
    }
  });

  it("oversized MSH-shaped fatal input yields a bounded snippet", () => {
    // A long line beginning with `MSH` but with bad encoding chars triggers
    // INVALID_ENCODING_CHARACTERS; the input is well over 40 chars so the
    // bound is exercised against truncation, not against short inputs.
    const big = "MSH" + "X".repeat(2000);
    try {
      parseHL7(big);
      throw new Error("expected parseHL7 to throw on bad encoding chars");
    } catch (err) {
      if (err instanceof Hl7ParseError) {
        expect(err.snippet.length).toBeLessThanOrEqual(SNIPPET_BOUND);
        // Snippet must not be the entire 2003-char input.
        expect(err.snippet.length).toBeLessThan(big.length);
      }
    }
  });
});

describe("property: PHI safety on the Buffer / MSH-18 charset path", () => {
  /**
   * The second position a shape test cannot defend, and the one that evaded
   * the first version of this guard.
   *
   * `extractMsh18FromTentativeDecode` reads MSH-18 as `parts[17]` of the text
   * before the first `\r`/`\n`. On a message carrying no segment terminators
   * (the flattened-feed corruption this parser exists to tolerate) that token
   * is not MSH-18 at all but the 18th `|`-token of the whole message, which is
   * routinely a data field. It reaches `UNKNOWN_CHARSET` as the "requested"
   * label.
   *
   * A shape test is the wrong instrument here and no regex can fix it:
   * Table 0211 is a CLOSED enumerated table, `UNKNOWN_CHARSET` fires precisely
   * when the label is absent from it, and `UNICODE UTF-8` and `123 MAIN ST`
   * are shape-siblings. The bound has to be registry membership, not spelling.
   *
   * This path is Buffer-only, so every string-input generator above misses it,
   * and `parseStream`/`splitBatch` re-encode each split message to a Buffer,
   * which is the ordinary MLLP and file ingestion shape.
   */
  function terminatorFreeBufferWithMarkerAtToken17(marker: string): Buffer {
    const parts = [
      "MSH",
      "^~\\&",
      "LAB",
      "LF",
      "EHR",
      "HOSP",
      "20250101120000",
      "",
      "ORU^R01",
      "MSG1",
      "P",
      "2.5",
      "",
      "",
      "",
      "",
      "",
      marker, // index 17, misread as MSH-18
    ];
    return Buffer.from(parts.join("|"), "utf8");
  }

  it("a data field misread as MSH-18 never reaches a warning message (fixed markers)", () => {
    for (const marker of PHI_MARKERS) {
      const msg = parseHL7(terminatorFreeBufferWithMarkerAtToken17(marker));
      expect(
        msg.warnings.length,
        "fixture did not trigger a warning; the no-echo check would be vacuous",
      ).toBeGreaterThan(0);
      for (const w of msg.warnings) {
        expect(
          w.message.includes(marker),
          `warning ${w.code} leaked a data field read as MSH-18 ${JSON.stringify(marker)}: ${w.message}`,
        ).toBe(false);
      }
    }
  });

  it("the same value never reaches .message or .stack under strict mode", () => {
    for (const marker of PHI_MARKERS) {
      try {
        parseHL7(terminatorFreeBufferWithMarkerAtToken17(marker), { strict: true });
        // Without this the whole body is skipped if escalation ever stops
        // firing, and the test passes green having asserted nothing. That is
        // the same vacuity mode pinned in the sibling strict property, and it
        // was missed here when that fix was applied.
        throw new Error("expected strict mode to escalate UNKNOWN_CHARSET to a throw");
      } catch (err) {
        if (!(err instanceof Hl7ParseError)) throw err;
        expect(err.code).toBe("UNKNOWN_CHARSET");
        expect(
          err.message.includes(marker),
          `strict-mode .message leaked ${JSON.stringify(marker)}: ${err.message}`,
        ).toBe(false);
        expect(
          (err.stack ?? "").includes(marker),
          `strict-mode .stack leaked ${JSON.stringify(marker)}`,
        ).toBe(false);
      }
    }
  });

  it("property: arbitrary PHI-shaped values misread as MSH-18 never reach a message", () => {
    const labelChar = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/. ".split(""));
    const labelArb = fc
      .stringOf(labelChar, { minLength: 6, maxLength: 20 })
      .filter((s) => s.trim().length >= 6 && !/^(ASCII|UNICODE|UTF-8)$/i.test(s.trim()));

    fc.assert(
      fc.property(labelArb, (label) => {
        const msg = parseHL7(terminatorFreeBufferWithMarkerAtToken17(label));
        for (const w of msg.warnings) {
          expect(
            w.message.includes(label),
            `warning ${w.code} leaked a data field read as MSH-18 ${JSON.stringify(label)}: ${w.message}`,
          ).toBe(false);
        }
      }),
      RUN_CONFIG,
    );
  });
});
