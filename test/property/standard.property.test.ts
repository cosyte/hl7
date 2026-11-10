/**
 * The three properties every Cosyte parser proves, run on the generators this package exports at
 * `@cosyte/hl7/arbitraries`:
 *
 * 1. **Round trip.** For any generated message `m`, `parse(serialize(m))` equals `m`, and
 *    serializing again changes nothing.
 * 2. **Idempotent normalize.** For each normalizer the library has, normalizing twice gives what
 *    normalizing once gave: the message normalizer `serialize(parse(raw))`, line endings, the
 *    MSH-18 character set label, the text codec, and the HL7 timestamp.
 * 3. **Never throws in lenient mode.** Any input, random bytes included, comes back as a message
 *    whose warnings carry registered codes, or is refused with one of the four documented fatal
 *    errors (`EMPTY_INPUT`, `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`),
 *    which are what lenient mode may still throw. Nothing else escapes.
 *
 * Each runs 100 cases by default from a fresh seed; `COSYTE_PROPERTY_RUNS` sets the depth, and a
 * failure prints the seed and path that replay it (see `./_runner.ts`).
 */

import assert from "node:assert/strict";

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

import { assertProperty, propertyTimeout } from "./_runner.js";

/** Each test's budget, scaled to the depth `COSYTE_PROPERTY_RUNS` sets. */
const TIMEOUT = propertyTimeout();

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

/** Every warning carries a registered code and a segment position. */
function assertWarningsRegistered(msg: Hl7Message): void {
  for (const w of msg.warnings) {
    assert.ok(KNOWN.has(w.code), `unregistered warning code ${w.code}`);
    assert.ok(Number.isInteger(w.position.segmentIndex), `warning ${w.code} has no position`);
  }
}

describe("property: round trip", () => {
  it(
    "parse(serialize(m)) equals m for any generated message, and serializing again changes nothing",
    () => {
      assertProperty(
        "round trip",
        fc.property(message(), (m) => {
          const once = m.toString();
          const back = parseHL7(once);
          assert.deepStrictEqual(back.rawSegments, m.rawSegments);
          assert.deepStrictEqual(back.encodingCharacters, m.encodingCharacters);
          assert.equal(back.toString(), once);
        }),
      );
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
      );
    },
    TIMEOUT,
  );
});

describe("property: idempotent normalize", () => {
  const normalizeMessage = (raw: string | Buffer): string | undefined =>
    parseOrFatal(raw)?.toString();

  it(
    "serialize(parse(raw)) is a fixed point for messy message text",
    () => {
      assertProperty(
        "idempotent normalize (message text)",
        fc.property(messageText(), (raw) => {
          const once = normalizeMessage(raw);
          assert.ok(once !== undefined, "messy message text was refused");
          assert.equal(normalizeMessage(once), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "serialize(parse(raw)) is a fixed point for any hostile input the parser accepts",
    () => {
      assertProperty(
        "idempotent normalize (hostile input)",
        fc.property(hostileInput(), (raw) => {
          const once = normalizeMessage(raw);
          if (once === undefined) return;
          assert.equal(normalizeMessage(once), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "line-ending normalization is idempotent",
    () => {
      const text = fc.string({ unit: fc.constantFrom("\r", "\n", "a", "|", " ") });
      assertProperty(
        "idempotent normalize (line endings)",
        fc.property(text, (raw) => {
          const once = normalizeLineEndings(raw);
          assert.equal(normalizeLineEndings(once), once);
          assert.ok(!once.includes("\n"));
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "canonicalCharset is idempotent",
    () => {
      const label = fc.oneof(
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
      );
      assertProperty(
        "idempotent normalize (character set)",
        fc.property(label, (raw) => {
          const once = canonicalCharset(raw);
          assert.equal(canonicalCharset(once), once);
        }),
      );
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
      assertProperty(
        "idempotent normalize (text codec)",
        fc.property(text, encodingCharacters(), (raw, enc) => {
          const once = encodeText(decodeText(raw, enc), enc);
          assert.equal(encodeText(decodeText(once, enc), enc), once);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "formatDtm(parseDtm(x)) is idempotent",
    () => {
      const dtm = fc.oneof(
        fc
          .tuple(
            fc.integer({ min: 1900, max: 2099 }),
            fc.string({ unit: fc.constantFrom(..."0123456789"), maxLength: 10 }),
            fc.constantFrom("", ".1", ".25", ".1234", ".12345"),
            fc.constantFrom("", "+0000", "-0500", "+1400", "+5"),
          )
          .map(([year, rest, frac, offset]) => `${year}${rest}${frac}${offset}`),
        fc.string({ unit: fc.constantFrom(..."0123456789.+- T:"), maxLength: 24 }),
      );
      assertProperty(
        "idempotent normalize (timestamp)",
        fc.property(dtm, (raw) => {
          const once = formatDtm(parseDtm(raw));
          assert.equal(formatDtm(parseDtm(once)), once);
        }),
      );
    },
    TIMEOUT,
  );
});

describe("property: never throws in lenient mode", () => {
  it(
    "any hostile input, random bytes included, parses with registered warnings or is refused with a documented fatal",
    () => {
      assertProperty(
        "never throws in lenient mode",
        fc.property(hostileInput(), (raw) => {
          const msg = parseOrFatal(raw);
          if (msg !== undefined) assertWarningsRegistered(msg);
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "messy message text always parses, with warnings for what was repaired",
    () => {
      assertProperty(
        "never throws in lenient mode (message text)",
        fc.property(messageText(), (raw) => {
          const msg = parseHL7(raw);
          assertWarningsRegistered(msg);
        }),
      );
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
            if (entry.ok) assertWarningsRegistered(entry.message);
            else assert.ok(FATAL.has(entry.error.code));
          }
        }),
      );
    },
    TIMEOUT,
  );
});
