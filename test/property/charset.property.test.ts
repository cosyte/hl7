/**
 * Property tests for Phase O charset decoding — the two safety invariants the
 * fail-safe design guarantees over arbitrary MSH-18 declarations + byte content:
 *
 *   1. **A decodable single-byte set never mojibakes.** For any ISO-8859-1
 *      byte stream declared `8859/1`, the parser reproduces the exact code
 *      points a Latin-1 decode would — no replacement characters, no loss.
 *
 *   2. **An undecoded set preserves bytes losslessly (reversibly).** For any
 *      byte stream under a recognized-but-undecoded set (`ISO IR87`) or an
 *      unrecognized label, the parsed field text re-encodes byte-identical via
 *      `latin1`, and exactly one charset warning (`UNSUPPORTED_CHARSET` /
 *      `UNKNOWN_CHARSET`) is raised — the parser never silently guesses.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Buffer } from "node:buffer";

import { parseHL7, WARNING_CODES } from "../../src/index.js";

const RUN_CONFIG = { numRuns: 300, seed: 0x07_05_2026 } as const;

/**
 * Field-content byte payload: the FULL 0x20–0xFF range — **including the C1
 * range 0x80–0x9F**, which `8859/1` (decoded via `latin1`) now maps byte-exactly
 * (the WHATWG `TextDecoder("iso-8859-1")` = windows-1252 remap is not used).
 * Only the HL7 **structural** bytes are excluded — the field/component/repetition/
 * escape/sub delimiters (`|^~\&`) — because a content byte equal to a structural
 * delimiter is, by definition of the wire format, a delimiter, not content. The
 * segment terminators CR (0x0D) / LF (0x0A) are below 0x20 and thus already out
 * of range; the framing hazard they pose to *multibyte* content is pinned
 * separately as a documented-limitation test in `parser-charset.test.ts`.
 */
const DELIMITER_BYTES = new Set([0x7c, 0x5e, 0x7e, 0x5c, 0x26]); // | ^ ~ \ &
const nameBytes = fc
  .array(
    fc.integer({ min: 0x20, max: 0xff }).filter((b) => !DELIMITER_BYTES.has(b)),
    { minLength: 1, maxLength: 20 },
  )
  .map((codes) => Buffer.from(codes));

/** Build an ADT^A01 Buffer: MSH-18 = `msh18`, PID-5.1 = the given raw bytes. */
function messageBuffer(msh18: string, name: Buffer): Buffer {
  const head = Buffer.from(
    `MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5||||||${msh18}\rPID|1||123||`,
    "latin1",
  );
  const tail = Buffer.from("^^^^^^L\r", "latin1");
  return Buffer.concat([head, name, tail]);
}

describe("charset property: decodable 8859/1 never mojibakes", () => {
  it("reproduces the exact Latin-1 code points, no replacement chars", () => {
    fc.assert(
      fc.property(nameBytes, (name) => {
        const msg = parseHL7(messageBuffer("8859/1", name), { trimFields: false });
        const got = msg.get("PID.5.1") ?? "";
        expect(got).toBe(name.toString("latin1"));
        expect(got).not.toContain("�");
      }),
      RUN_CONFIG,
    );
  });
});

describe("charset property: undecoded set preserves bytes reversibly + warns once", () => {
  it.each([
    ["ISO IR87", WARNING_CODES.UNSUPPORTED_CHARSET],
    ["COBOL-EBCDIC", WARNING_CODES.UNKNOWN_CHARSET],
  ])("%s → bytes re-encode identically and exactly one %s fires", (msh18, expectedCode) => {
    fc.assert(
      fc.property(nameBytes, (name) => {
        const msg = parseHL7(messageBuffer(msh18, name), { trimFields: false });
        const got = msg.get("PID.5.1") ?? "";
        // Lossless: the field re-encodes to the original bytes via latin1.
        expect(Buffer.from(got, "latin1")).toEqual(name);
        const charsetCodes = msg.warnings
          .map((w) => w.code)
          .filter(
            (c) => c === WARNING_CODES.UNSUPPORTED_CHARSET || c === WARNING_CODES.UNKNOWN_CHARSET,
          );
        expect(charsetCodes).toEqual([expectedCode]);
      }),
      RUN_CONFIG,
    );
  });
});
