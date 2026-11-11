/**
 * Property tests for `Hl7Message.toBytes()`, per character set the parser reads:
 *
 *   1. **Byte round trip.** Synthetic message bytes whose field content is any run of bytes the
 *      set defines are read with `parseHL7` and written back with `toBytes()` as the same bytes.
 *
 *   2. **Never a substitute.** For any field value, `toBytes()` either refuses with an
 *      `UNENCODABLE_CHARACTER` naming that field, or writes bytes that read back to the value the
 *      text `toString()` writes reads back to (the value itself, for one with no C0 control).
 *
 * The content bytes come from the set itself: every byte from 0x20 to 0xFF the reader's own
 * decode accepts, less the five HL7 delimiters, which on the wire are structure rather than
 * content. For UTF-8 the content is any Unicode scalar value from U+0020 up, less the delimiters.
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { Hl7EncodeError, encodeText, parseHL7, resolveCharset } from "../../src/index.js";
import { checkProperty } from "../_helpers/property.js";

/** The five delimiters of `|^~\&`, as bytes and as code points. */
const DELIMITERS = new Set([0x7c, 0x5e, 0x7e, 0x5c, 0x26]);

/** Every MSH-18 value with a single-byte reading: decoded by the parser, or kept as bytes. */
const SINGLE_BYTE_SETS = [
  "8859/1",
  "WINDOWS-1252",
  ...[2, 3, 4, 5, 6, 7, 8, 10, 13, 14, 15, 16].map((n) => `8859/${String(n)}`),
  "8859/9",
  "8859/11",
  "ISO IR87",
  "UNICODE UTF-16",
  "SYNTH-SET",
] as const;

/** The MSH-18 values written as UTF-8: blank (the ASCII default), ASCII and UTF-8. */
const UTF8_SETS = ["", "ASCII", "UNICODE UTF-8"] as const;

/** The content bytes `label` defines: every byte 0x20 to 0xFF its reader accepts, less delimiters. */
function contentBytes(label: string): number[] {
  const { treatment, decoder } = resolveCharset(label);
  const strict =
    treatment === "decode" && decoder !== "latin1" && decoder !== "windows-1252"
      ? new TextDecoder(decoder, { fatal: true })
      : undefined;
  const out: number[] = [];
  for (let byte = 0x20; byte <= 0xff; byte++) {
    if (DELIMITERS.has(byte)) continue;
    try {
      strict?.decode(Uint8Array.of(byte));
    } catch {
      continue;
    }
    out.push(byte);
  }
  return out;
}

/** The text `bytes` stand for in `label`, as the reader decodes them. */
function textOf(label: string, bytes: Uint8Array): string {
  const { treatment, decoder } = resolveCharset(label);
  if (treatment === "verbatim" || decoder === "latin1" || decoder === "utf-8") {
    return Buffer.from(bytes).toString("latin1");
  }
  return new TextDecoder(decoder, { fatal: true }).decode(bytes);
}

/** A synthetic ADT^A01 declaring `msh18`, with three content fields of raw bytes. */
function messageBytes(msh18: string, fields: readonly Uint8Array[]): Buffer {
  const [family, given, note] = fields;
  const text = (s: string): Buffer => Buffer.from(s, "latin1");
  return Buffer.concat([
    text(`MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5||||||${msh18}\r`),
    text("PID|1||SYN123^^^SYN^MR||"),
    family ?? new Uint8Array(0),
    text("^"),
    given ?? new Uint8Array(0),
    text("\rNTE|1||"),
    note ?? new Uint8Array(0),
    text("\r"),
  ]);
}

/** One non-empty field of bytes drawn from `bytes`. */
function fieldOf(bytes: readonly number[]): fc.Arbitrary<Uint8Array> {
  return fc
    .array(fc.constantFrom(...bytes), { minLength: 1, maxLength: 24 })
    .map((b) => Uint8Array.from(b));
}

/** A Unicode scalar value from U+0020 up that is not a delimiter: one UTF-8 content character. */
const scalar = fc
  .integer({ min: 0x20, max: 0x10ffff })
  .filter((cp) => !DELIMITERS.has(cp) && (cp < 0xd800 || cp > 0xdfff))
  .map((cp) => String.fromCodePoint(cp));

/** One non-empty UTF-8 field. */
const utf8Field = fc
  .array(scalar, { minLength: 1, maxLength: 24 })
  .map((chars) => Uint8Array.from(Buffer.from(chars.join(""), "utf8")));

describe("toBytes property: a message read from bytes is written back as those bytes", () => {
  it.each(SINGLE_BYTE_SETS)("%s", (label) => {
    const field = fieldOf(contentBytes(label));
    checkProperty(
      fc.property(fc.tuple(field, field, field), (fields) => {
        const bytes = messageBytes(label, fields);
        expect(parseHL7(bytes, { trimFields: false }).toBytes()).toEqual(bytes);
      }),
    );
  });

  it.each(UTF8_SETS)("UTF-8 under MSH-18 %j", (label) => {
    checkProperty(
      fc.property(fc.tuple(utf8Field, utf8Field, utf8Field), (fields) => {
        const bytes = messageBytes(label, fields);
        expect(parseHL7(bytes, { trimFields: false }).toBytes()).toEqual(bytes);
      }),
    );
  });
});

describe("toBytes property: a character is written as itself or refused, never replaced", () => {
  it.each([...SINGLE_BYTE_SETS, ...UTF8_SETS])("%j", (label) => {
    const fromSet = fieldOf(contentBytes(label === "" ? "8859/1" : label)).map((b) =>
      textOf(label, b),
    );
    const value = fc
      .oneof(fromSet, fc.string({ unit: "binary", minLength: 1, maxLength: 24 }))
      .filter((s) => s !== '""');
    checkProperty(
      fc.property(value, (s) => {
        const msg = parseHL7(
          `MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5||||||${label}\r` +
            `NTE|1||${encodeText(s)}\r`,
          { trimFields: false },
        );
        let bytes: Buffer;
        try {
          bytes = msg.toBytes();
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7EncodeError);
          const refusal = err as Hl7EncodeError;
          expect(refusal.code).toBe("UNENCODABLE_CHARACTER");
          expect(refusal.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
          return;
        }
        // Compared with the text read back as text, so only the encoding is under test: the
        // reader treats a few control characters (the MLLP block start 0x0B) as framing either way.
        const asText = parseHL7(msg.toString(), { trimFields: false }).get("NTE.3");
        expect(parseHL7(bytes, { trimFields: false }).get("NTE.3")).toBe(asText);
        if ([...s].every((c) => c.charCodeAt(0) >= 0x20)) expect(asText).toBe(s);
      }),
    );
  });
});
