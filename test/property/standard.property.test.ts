/**
 * The three properties every Cosyte parser proves, run with the shared runners in
 * `@cosyte/test-utils` on the generators this package exports at `@cosyte/hl7/arbitraries`:
 *
 * 1. **Round trip** (`roundTripProperty`). For any generated message `m`, `parse(serialize(m))`
 *    equals `m`, and serializing again changes nothing.
 * 2. **Idempotent normalize** (`idempotentNormalizeProperty`). For each normalizer the library has,
 *    normalizing twice gives what normalizing once gave: the message normalizer
 *    `serialize(parse(raw))`, line endings, the MSH-18 character set label, the text codec, and the
 *    HL7 timestamp.
 * 3. **Never throws in lenient mode** (`lenientNeverThrowsProperty`). Any input, random bytes
 *    included, comes back as a message whose warnings carry registered codes and a position, or is
 *    refused with one of the four documented fatal errors (`EMPTY_INPUT`, `NO_MSH_SEGMENT`,
 *    `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`), which are what lenient mode may still throw.
 *    Nothing else escapes.
 *
 * The checks the shared runners have no shape for (the generator is spec-clean, generated segments
 * survive `addSegment`, `splitBatch` never throws) run through the kit's `assertProperty`, so every
 * property here runs the same way: 100 cases by default from a fresh seed, `COSYTE_PROPERTY_RUNS`
 * sets the depth (the nightly run sets 10,000), and a failure prints the seed and path that replay
 * it (`COSYTE_PROPERTY_SEED`, `COSYTE_PROPERTY_PATH`).
 */

import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

import {
  assertProperty,
  idempotentNormalizeProperty,
  lenientNeverThrowsProperty,
  roundTripProperty,
  type LenientWarning,
} from "@cosyte/test-utils";
import fc from "fast-check";
import { describe, it } from "vitest";

import {
  FATAL_CODES,
  Hl7ParseError,
  WARNING_CODES,
  buildMessage,
  canonicalCharset,
  decodeText,
  encodeText,
  formatDtm,
  parseDtm,
  parseHL7,
  splitBatch,
  type EncodingCharacters,
  type Hl7Message,
} from "../../src/index.js";
import {
  encodingCharacters,
  hostileInput,
  message,
  messageText,
  segment,
} from "../../src/arbitraries/index.js";
import { cleanMessageText } from "../../src/arbitraries/message.js";
import { normalize as normalizeLineEndings } from "../../src/parser/normalize.js";
import { propertyTimeout } from "../_helpers/property.js";

/**
 * Each test's budget at the depth this run resolves: the suite's 10 s at 100 cases, scaled with the
 * depth, so a nightly run at 10,000 cases is not cut off by a 100-case budget.
 */
const TIMEOUT = propertyTimeout(10_000);

const FATAL: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));
const KNOWN: ReadonlySet<string> = new Set(Object.values(WARNING_CODES));

/**
 * The warnings a spec-clean message may still carry: advice about its content that changes no
 * byte of it. A generated `Z` segment is not one the library knows, a local `\Z..\` escape is
 * preserved verbatim with a warning, and generated segments need not make a complete structure.
 */
const ADVISORY: ReadonlySet<string> = new Set([
  WARNING_CODES.UNKNOWN_SEGMENT,
  WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
  WARNING_CODES.MISSING_EXPECTED_GROUP,
  WARNING_CODES.OUT_OF_ORDER_SEGMENT,
  WARNING_CODES.DUPLICATE_REQUIRED_SEGMENT,
]);

/** Whether a thrown value is one of the documented fatals lenient mode may still throw. */
function isDocumentedFatal(err: unknown): boolean {
  return err instanceof Hl7ParseError && FATAL.has(err.code);
}

/** Parse leniently: the message, or `undefined` when the parser refused with a documented fatal. */
function parseOrFatal(raw: string | Buffer): Hl7Message | undefined {
  try {
    return parseHL7(raw);
  } catch (err) {
    assert.ok(err instanceof Hl7ParseError, `lenient parse threw ${String(err)}`);
    assert.ok(FATAL.has(err.code), `lenient parse threw the non-fatal code ${err.code}`);
    return undefined;
  }
}

/** The predicates the lenient runner judges a parsed message's warnings by. */
const LENIENT = {
  getWarnings: (parsed: unknown): readonly LenientWarning[] => (parsed as Hl7Message).warnings,
  isKnownCode: (code: string): boolean => KNOWN.has(code),
  hasPositionalContext: (w: LenientWarning): boolean =>
    Number.isInteger((w.position as { segmentIndex?: unknown } | undefined)?.segmentIndex),
} as const;

describe("property: round trip", () => {
  it(
    "parse(serialize(m)) equals m for any generated message, and serializing again changes nothing",
    () => {
      roundTripProperty<Hl7Message>({
        arbitrary: message(),
        serialize: (m) => m.toString(),
        parse: (raw) => parseHL7(raw),
        // The parsed tree and its delimiters: the model also carries warnings and caches, which a
        // fresh parse rebuilds, so whole-object equality would compare those rather than content.
        equals: (a, b) =>
          isDeepStrictEqual(a.rawSegments, b.rawSegments) &&
          isDeepStrictEqual(a.encodingCharacters, b.encodingCharacters),
      });
    },
    TIMEOUT,
  );

  it(
    "a generated message serializes to the exact text it was parsed from, with advisory warnings only",
    () => {
      // This holds the generator to account: if the parser repaired anything in the text, the
      // round trip above could be passing over a repair rather than proving fidelity.
      assertProperty(
        "generator is spec-clean",
        fc.property(cleanMessageText(), (text) => {
          const m = parseHL7(text);
          assert.equal(m.toString(), text);
          const repairs = m.warnings.map((w) => w.code).filter((c) => !ADVISORY.has(c));
          assert.deepStrictEqual(repairs, []);
        }),
        {},
      );
    },
    TIMEOUT,
  );

  it(
    "any generated segment survives addSegment, serialize and parse unchanged",
    () => {
      assertProperty(
        "segment round trip",
        fc.property(fc.array(segment(), { minLength: 1, maxLength: 4 }), (segments) => {
          const m = buildMessage({ type: "ADT^A01", controlId: "PROP1", timestamp: "20260101" });
          for (const seg of segments) m.addSegment(seg.name, seg.fields.slice(1));
          const back = parseHL7(m.toString());
          assert.deepStrictEqual(back.rawSegments.slice(-segments.length), segments);
        }),
        {},
      );
    },
    TIMEOUT,
  );
});

describe("property: idempotent normalize", () => {
  it(
    "serialize(parse(raw)) is a fixed point for messy message text",
    () => {
      idempotentNormalizeProperty<string>({
        arbitrary: messageText(),
        normalize: (raw) => {
          const once = parseOrFatal(raw)?.toString();
          assert.ok(once !== undefined, "messy message text was refused");
          return once;
        },
      });
    },
    TIMEOUT,
  );

  it(
    "serialize(parse(raw)) is a fixed point for any hostile input the parser accepts",
    () => {
      // Input the parser refuses has nothing to normalize, so it is its own fixed point.
      idempotentNormalizeProperty<string | Buffer>({
        arbitrary: hostileInput(),
        normalize: (raw) => parseOrFatal(raw)?.toString() ?? raw,
      });
    },
    TIMEOUT,
  );

  it(
    "line-ending normalization is idempotent",
    () => {
      idempotentNormalizeProperty<string>({
        arbitrary: fc.string({ unit: fc.constantFrom("\r", "\n", "a", "|", " ") }),
        normalize: (raw) => {
          const once = normalizeLineEndings(raw);
          assert.ok(!once.includes("\n"));
          return once;
        },
      });
    },
    TIMEOUT,
  );

  it(
    "canonicalCharset is idempotent",
    () => {
      idempotentNormalizeProperty<string>({
        arbitrary: fc.oneof(
          fc.constantFrom(
            "UNICODE UTF-8",
            "unicode  utf-8",
            " 8859/1 ",
            "ASCII",
            "ISO IR87",
            "UTF-8",
          ),
          fc.string({ unit: fc.constantFrom(..."aZ09-/ _\t") }),
          fc.string(),
        ),
        normalize: (raw) => canonicalCharset(raw),
      });
    },
    TIMEOUT,
  );

  it(
    "encodeText(decodeText(x)) is idempotent under any encoding characters",
    () => {
      const text = fc.string({
        unit: fc.oneof(
          fc.constantFrom(..."|^~\\&#!$%*+/FSTREPXHNZ.br0D4a1 \n\r"),
          fc.string({ maxLength: 1 }),
        ),
        maxLength: 40,
      });
      // The encoding characters ride along with the text so the normalizer can read them; it never
      // changes them, so they compare equal on both passes.
      idempotentNormalizeProperty({
        arbitrary: fc.tuple(text, encodingCharacters()),
        normalize: ([raw, enc]): [string, EncodingCharacters] => [
          encodeText(decodeText(raw, enc), enc),
          enc,
        ],
      });
    },
    TIMEOUT,
  );

  it(
    "formatDtm(parseDtm(x)) is idempotent",
    () => {
      idempotentNormalizeProperty<string>({
        arbitrary: fc.oneof(
          fc
            .tuple(
              fc.integer({ min: 1900, max: 2099 }),
              fc.string({ unit: fc.constantFrom(..."0123456789"), maxLength: 10 }),
              fc.constantFrom("", ".1", ".25", ".1234", ".12345"),
              fc.constantFrom("", "+0000", "-0500", "+1400", "+5"),
            )
            .map(([year, rest, frac, offset]) => `${year}${rest}${frac}${offset}`),
          fc.string({ unit: fc.constantFrom(..."0123456789.+- T:"), maxLength: 24 }),
        ),
        normalize: (raw) => formatDtm(parseDtm(raw)),
      });
    },
    TIMEOUT,
  );
});

describe("property: never throws in lenient mode", () => {
  it(
    "any hostile input, random bytes included, parses with registered warnings or is refused with a documented fatal",
    () => {
      lenientNeverThrowsProperty<string | Buffer>({
        arbitrary: hostileInput(),
        parse: (raw) => parseHL7(raw),
        isFatal: isDocumentedFatal,
        ...LENIENT,
      });
    },
    TIMEOUT,
  );

  it(
    "messy message text always parses, with warnings for what was repaired",
    () => {
      // No fatal is allowed here: messy text is text the parser always accepts.
      lenientNeverThrowsProperty<string>({
        arbitrary: messageText(),
        parse: (raw) => parseHL7(raw),
        isFatal: () => false,
        ...LENIENT,
      });
    },
    TIMEOUT,
  );

  it(
    "splitBatch never throws on hostile input",
    () => {
      assertProperty(
        "never throws in lenient mode (batch)",
        fc.property(hostileInput(), (raw) => {
          const result = splitBatch(raw);
          for (const w of result.warnings) assert.ok(KNOWN.has(w.code), `unregistered ${w.code}`);
          for (const entry of result.messages) {
            if (entry.ok) {
              for (const w of entry.message.warnings) {
                assert.ok(LENIENT.isKnownCode(w.code), `unregistered warning code ${w.code}`);
                assert.ok(LENIENT.hasPositionalContext(w), `warning ${w.code} has no position`);
              }
            } else assert.ok(FATAL.has(entry.error.code));
          }
        }),
        {},
      );
    },
    TIMEOUT,
  );
});
