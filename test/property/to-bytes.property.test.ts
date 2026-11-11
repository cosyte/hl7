/**
 * Property tests for `Hl7Message.toBytes()`, per character set the parser reads:
 *
 *   1. **Byte round trip.** Synthetic message bytes whose field content is any run of bytes the
 *      set defines are read with `parseHL7` and written back with `toBytes()` as the same bytes.
 *
 *   2. **Never a substitute.** For any field value, `toBytes()` either refuses with an
 *      `Hl7EncodeError` naming that field, or writes bytes that an independent decoder of the set
 *      reads as exactly the text `toString()` writes. The oracle is not the library's reading: it
 *      is the definition of the set (ASCII and 8859/1 map a byte to the code point of its value),
 *      the platform's WHATWG decoder for UTF-8, windows-1252 and the ISO 8859 sets, and, for a set
 *      the library does not decode, ASCII alone, the one part every such set shares.
 *
 *   3. **An edit to a byte reading.** A message read from bytes in a set the library does not
 *      decode, with one segment replaced by an edit, is either refused at that segment or written
 *      as the bytes it was read from with the edited segment in ASCII.
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

/** The MSH-18 values written as UTF-8: blank (the ASCII default) and UTF-8. */
const UTF8_SETS = ["", "UNICODE UTF-8"] as const;

/** The sets the library does not decode, which a message from text may use only in ASCII. */
const UNDECODED_SETS = ["8859/9", "8859/11", "ISO IR87", "SYNTH-SET"] as const;

/** The sets no single-byte writing can be, ASCII included. */
const WIDE_SETS = ["UNICODE UTF-16", "UNICODE UTF-32"] as const;

/**
 * The strict `TextDecoder` the reader uses for `label`, or `undefined` when it uses none: a set it
 * reads as latin1 bytes, windows-1252 (its own table), UTF-8, or a set this runtime has no decoder
 * for (Node.js 22 has none for `8859/16`), which the reader also keeps as a latin1 byte reading.
 */
function strictDecoder(label: string): InstanceType<typeof TextDecoder> | undefined {
  const { treatment, decoder } = resolveCharset(label);
  if (treatment === "verbatim" || ["latin1", "windows-1252", "utf-8"].includes(decoder)) {
    return undefined;
  }
  try {
    return new TextDecoder(decoder, { fatal: true });
  } catch {
    return undefined;
  }
}

/** Whether this runtime lacks the decoder the reader would use for `label`. */
function decoderMissing(label: string): boolean {
  const { treatment, decoder } = resolveCharset(label);
  return (
    treatment === "decode" &&
    !["latin1", "windows-1252", "utf-8"].includes(decoder) &&
    strictDecoder(label) === undefined
  );
}

/** The content bytes `label` defines: every byte 0x20 to 0xFF its reader accepts, less delimiters. */
function contentBytes(label: string): number[] {
  const strict = strictDecoder(label);
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
  if (resolveCharset(label).decoder === "windows-1252") {
    return new TextDecoder("windows-1252").decode(bytes);
  }
  return strictDecoder(label)?.decode(bytes) ?? Buffer.from(bytes).toString("latin1");
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

  it("7-bit ASCII under MSH-18 ASCII", () => {
    const ascii = fieldOf(contentBytes("8859/1").filter((b) => b < 0x80));
    checkProperty(
      fc.property(fc.tuple(ascii, ascii, ascii), (fields) => {
        const bytes = messageBytes("ASCII", fields);
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

/** Code points of `bytes` one to one: the definition of ASCII and of 8859/1. */
function byteValues(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

/**
 * The text `bytes` stand for in `label`, by an oracle independent of this library, or
 * `undefined` when they are not valid in it. The labels are listed here rather than looked up.
 */
function oracle(label: string, bytes: Uint8Array): string | undefined {
  const allAscii = bytes.every((b) => b < 0x80);
  if (label === "ASCII" || (UNDECODED_SETS as readonly string[]).includes(label)) {
    return allAscii ? byteValues(bytes) : undefined;
  }
  if (label === "8859/1") return byteValues(bytes);
  const whatwg =
    label === "" || label === "UNICODE UTF-8" ? "utf-8" : label.replace("8859/", "iso-8859-");
  try {
    return new TextDecoder(label === "WINDOWS-1252" ? "windows-1252" : whatwg, {
      fatal: true,
    }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** A character from U+0080 to U+00FF: the ones a latin1 byte reading would write as one byte. */
const latin1High = fc
  .integer({ min: 0x80, max: 0xff })
  .map((cp) => String.fromCharCode(cp))
  .chain((c) => fc.string({ minLength: 0, maxLength: 4 }).map((rest) => c + rest));

describe("toBytes property: a character is written as itself or refused, never replaced", () => {
  it.each([...SINGLE_BYTE_SETS, ...UTF8_SETS, "ASCII", "UNICODE UTF-32"])("%j", (label) => {
    const fromSet = fieldOf(contentBytes(label === "" || label === "ASCII" ? "8859/1" : label)).map(
      (b) => textOf(label, b),
    );
    const value = fc
      .oneof(fromSet, latin1High, fc.string({ unit: "binary", minLength: 1, maxLength: 24 }))
      .filter((s) => s !== '""');
    checkProperty(
      fc.property(value, (s) => {
        const msg = parseHL7(
          `MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5||||||${label}\r` +
            `NTE|1||${encodeText(s)}\r`,
          { trimFields: false },
        );
        const text = msg.toString();
        let bytes: Buffer;
        try {
          bytes = msg.toBytes();
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7EncodeError);
          const refusal = err as Hl7EncodeError;
          if (refusal.code === "UNSUPPORTED_CHARSET") {
            // A wide set, or a string read in a set this runtime cannot decode.
            expect((WIDE_SETS as readonly string[]).includes(label) || decoderMissing(label)).toBe(
              true,
            );
            return;
          }
          expect(refusal.code).toBe("UNENCODABLE_CHARACTER");
          expect(refusal.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
          // Only a character above ASCII is ever refused.
          expect([...text].some((c) => c.charCodeAt(0) >= 0x80)).toBe(true);
          return;
        }
        expect((WIDE_SETS as readonly string[]).includes(label)).toBe(false);
        expect(oracle(label, Uint8Array.from(bytes))).toBe(text);
      }),
    );
  });
});

describe("toBytes property: an edit to a byte reading is refused or written in ASCII", () => {
  it.each([...UNDECODED_SETS, ...WIDE_SETS])("%s", (label) => {
    const field = fieldOf(contentBytes(label));
    const value = fc
      .oneof(latin1High, fc.string({ minLength: 1, maxLength: 12 }))
      .filter((s) => s !== '""');
    checkProperty(
      fc.property(fc.tuple(field, field, field), value, (fields, s) => {
        const bytes = messageBytes(label, fields);
        const msg = parseHL7(bytes, { trimFields: false });
        msg.setField("NTE.3", s);
        const nte = (msg.toString().split("\r")[2] ?? "") + "\r";
        let out: Buffer;
        try {
          out = msg.toBytes();
        } catch (err) {
          expect(err).toBeInstanceOf(Hl7EncodeError);
          const refusal = err as Hl7EncodeError;
          if ((WIDE_SETS as readonly string[]).includes(label)) {
            expect(refusal.code).toBe("UNSUPPORTED_CHARSET");
            return;
          }
          expect(refusal.code).toBe("UNENCODABLE_CHARACTER");
          expect(refusal.position).toEqual({ segmentIndex: 2, fieldIndex: 3 });
          expect([...nte].some((c) => c.charCodeAt(0) >= 0x80)).toBe(true);
          return;
        }
        const kept = bytes.subarray(0, bytes.indexOf(Buffer.from("\rNTE|", "latin1")) + 1);
        expect(out).toEqual(Buffer.concat([kept, Buffer.from(nte, "latin1")]));
        expect(out.subarray(kept.length).every((b) => b < 0x80)).toBe(true);
      }),
    );
  });
});
