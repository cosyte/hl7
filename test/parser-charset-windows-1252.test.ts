/**
 * Windows-1252 decode at the `Buffer` boundary. `WINDOWS-1252` is not an HL7 Table-0211 code, but
 * senders declare it and channels configure it, and its bytes 0x80 to 0x9F carry typographic
 * characters (the euro sign, curly quotes) that a `latin1` reading turns into C1 controls. The
 * parser decodes it with its own table, the WHATWG Encoding `index-windows-1252` mapping, so the
 * result does not depend on the runtime's ICU build.
 *
 * Expected code points are written as numbers, never as the characters, so this file stays plain
 * ASCII (two of them are dash characters this repository keeps out of its files).
 *
 * All fixtures are synthetic: no PHI.
 */

import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { canonicalCharset, resolveCharset } from "../src/parser/charset.js";
import { parseHL7 } from "../src/parser/index.js";
import { chunkDecoder, normalizeBuffer } from "../src/parser/normalize.js";
import { readMessages, readSegments } from "../src/parser/read.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

/**
 * The WHATWG Encoding index for windows-1252, bytes 0x80 to 0x9F. The five bytes Windows leaves
 * undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to the C1 control of the same value, as the index
 * maps them.
 */
const C1_EXPECTED: readonly (readonly [number, number, boolean])[] = [
  [0x80, 0x20ac, false],
  [0x81, 0x0081, true],
  [0x82, 0x201a, false],
  [0x83, 0x0192, false],
  [0x84, 0x201e, false],
  [0x85, 0x2026, false],
  [0x86, 0x2020, false],
  [0x87, 0x2021, false],
  [0x88, 0x02c6, false],
  [0x89, 0x2030, false],
  [0x8a, 0x0160, false],
  [0x8b, 0x2039, false],
  [0x8c, 0x0152, false],
  [0x8d, 0x008d, true],
  [0x8e, 0x017d, false],
  [0x8f, 0x008f, true],
  [0x90, 0x0090, true],
  [0x91, 0x2018, false],
  [0x92, 0x2019, false],
  [0x93, 0x201c, false],
  [0x94, 0x201d, false],
  [0x95, 0x2022, false],
  [0x96, 0x2013, false],
  [0x97, 0x2014, false],
  [0x98, 0x02dc, false],
  [0x99, 0x2122, false],
  [0x9a, 0x0161, false],
  [0x9b, 0x203a, false],
  [0x9c, 0x0153, false],
  [0x9d, 0x009d, true],
  [0x9e, 0x017e, false],
  [0x9f, 0x0178, false],
];

/** The rows above with hex spellings, for the test titles. */
const C1_CASES = C1_EXPECTED.map(([byte, cp, undef]) => ({
  byte,
  cp,
  undef,
  b: byte.toString(16).toUpperCase(),
  u: cp.toString(16).toUpperCase().padStart(4, "0"),
}));

const MSH_PREFIX = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5||||||";

/** An ADT^A01 whose PID-5.1 is `Doe` followed by `byte`, with MSH-18 set to `msh18`. */
function messageWithByte(msh18: string, byte: number): Buffer {
  return Buffer.concat([
    Buffer.from(`${MSH_PREFIX}${msh18}\rPID|1||SYN123^^^SYNTH^MR||Doe`, "latin1"),
    Buffer.from([byte]),
    Buffer.from("^Test\r", "latin1"),
  ]);
}

/** Codes of the charset-related warnings in `warnings`. */
function charsetCodes(warnings: readonly Hl7ParseWarning[]): string[] {
  return warnings
    .map((w) => w.code)
    .filter(
      (c) =>
        c === WARNING_CODES.UNKNOWN_CHARSET ||
        c === WARNING_CODES.UNSUPPORTED_CHARSET ||
        c === WARNING_CODES.ENCODING_MISMATCH,
    );
}

describe("resolveCharset: WINDOWS-1252 is a recognized, decoded set", () => {
  it.each(["WINDOWS-1252", "windows-1252", " Windows-1252 ", "CP1252", "x-cp1252"])(
    "resolves %j to the WINDOWS-1252 decode entry",
    (label) => {
      expect(resolveCharset(label)).toEqual({
        canonical: "WINDOWS-1252",
        treatment: "decode",
        decoder: "windows-1252",
        recognized: true,
      });
    },
  );

  it("keeps 8859/1 and its synonyms on the latin1 reading, apart from WINDOWS-1252", () => {
    for (const label of ["8859/1", "ISO-8859-1", "ISO 8859-1", "ISO8859-1"]) {
      expect(resolveCharset(label).decoder).toBe("latin1");
      expect(canonicalCharset(label)).not.toBe(canonicalCharset("WINDOWS-1252"));
    }
  });
});

describe("normalizeBuffer: each byte 0x80 to 0x9F under WINDOWS-1252", () => {
  it.each(C1_CASES)("byte 0x$b decodes to U+$u (undefined in Windows: $undef)", ({ byte, cp }) => {
    const warnings: Hl7ParseWarning[] = [];
    const out = normalizeBuffer(Buffer.from([0x4d, 0x53, 0x48, 0x7c, byte]), "WINDOWS-1252", (w) =>
      warnings.push(w),
    );
    expect(warnings).toEqual([]);
    expect(out.length).toBe(5);
    expect(out.codePointAt(4)).toBe(cp);
  });

  it("covers all 32 bytes, five of them undefined", () => {
    expect(C1_EXPECTED.map(([b]) => b)).toEqual(Array.from({ length: 32 }, (_, i) => 0x80 + i));
    expect(C1_EXPECTED.filter(([, , undef]) => undef).map(([b]) => b)).toEqual([
      0x81, 0x8d, 0x8f, 0x90, 0x9d,
    ]);
  });

  it("reads every byte outside 0x80 to 0x9F as latin1 does", () => {
    const bytes = Buffer.from(
      Array.from({ length: 256 }, (_, i) => i).filter((b) => b < 0x80 || b > 0x9f),
    );
    expect(normalizeBuffer(bytes, "WINDOWS-1252", () => undefined)).toBe(
      normalizeBuffer(bytes, "8859/1", () => undefined),
    );
  });

  it("agrees with this runtime's WHATWG TextDecoder for every byte", () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const ours = normalizeBuffer(all, "WINDOWS-1252", () => undefined);
    const whatwg = new TextDecoder("windows-1252").decode(all).replace(/\r\n|\n/gu, "\r");
    expect(ours).toBe(whatwg);
  });

  it("keeps 8859/1 on latin1: 0x80 to 0x9F stay C1 controls", () => {
    const bytes = Buffer.from(C1_EXPECTED.map(([b]) => b));
    const out = normalizeBuffer(bytes, "8859/1", () => undefined);
    expect([...out].map((c) => c.codePointAt(0))).toEqual(C1_EXPECTED.map(([b]) => b));
  });
});

describe("parseHL7: WINDOWS-1252 declared in MSH-18 or asked for in options.charset", () => {
  it.each(C1_CASES)("MSH-18 WINDOWS-1252 decodes byte 0x$b to U+$u", ({ byte, cp }) => {
    const msg = parseHL7(messageWithByte("WINDOWS-1252", byte));
    expect(charsetCodes(msg.warnings)).toEqual([]);
    const family = msg.get("PID.5.1") ?? "";
    expect(family.slice(0, 3)).toBe("Doe");
    expect(family.codePointAt(3)).toBe(cp);
  });

  it("decodes with options.charset when MSH-18 is blank, without a warning", () => {
    const msg = parseHL7(messageWithByte("", 0x80), { charset: "WINDOWS-1252" });
    expect(charsetCodes(msg.warnings)).toEqual([]);
    expect(msg.get("PID.5.1")?.codePointAt(3)).toBe(0x20ac);
  });

  it("keeps an 8859/1 message on latin1: byte 0x80 stays U+0080", () => {
    const msg = parseHL7(messageWithByte("8859/1", 0x80));
    expect(charsetCodes(msg.warnings)).toEqual([]);
    expect(msg.get("PID.5.1")?.codePointAt(3)).toBe(0x80);
  });

  it("warns ENCODING_MISMATCH when options.charset WINDOWS-1252 disagrees with MSH-18 8859/1, and the option wins", () => {
    const msg = parseHL7(messageWithByte("8859/1", 0x80), { charset: "WINDOWS-1252" });
    expect(charsetCodes(msg.warnings)).toEqual([WARNING_CODES.ENCODING_MISMATCH]);
    expect(msg.get("PID.5.1")?.codePointAt(3)).toBe(0x20ac);
  });

  it("warns ENCODING_MISMATCH the other way round too, and reads latin1", () => {
    const msg = parseHL7(messageWithByte("WINDOWS-1252", 0x80), { charset: "8859/1" });
    expect(charsetCodes(msg.warnings)).toEqual([WARNING_CODES.ENCODING_MISMATCH]);
    expect(msg.get("PID.5.1")?.codePointAt(3)).toBe(0x80);
  });

  it("raises no ENCODING_MISMATCH for a synonym pair (CP1252 vs WINDOWS-1252)", () => {
    const msg = parseHL7(messageWithByte("WINDOWS-1252", 0x93), { charset: "cp1252" });
    expect(charsetCodes(msg.warnings)).toEqual([]);
    expect(msg.get("PID.5.1")?.codePointAt(3)).toBe(0x201c);
  });
});

describe("streamed reads: WINDOWS-1252", () => {
  it("chunkDecoder decodes byte by byte, without a warning", () => {
    const warnings: Hl7ParseWarning[] = [];
    const decoder = chunkDecoder("WINDOWS-1252", (w) => warnings.push(w));
    const text = C1_EXPECTED.map(([b]) => decoder.decode(Uint8Array.of(b), false)).join("");
    expect(text + decoder.decode(new Uint8Array(0), true)).toBe(
      String.fromCodePoint(...C1_EXPECTED.map(([, cp]) => cp)),
    );
    expect(warnings).toEqual([]);
  });

  it("readMessages decodes a declared WINDOWS-1252 message as parseHL7 does", async () => {
    const bytes = messageWithByte("WINDOWS-1252", 0x99);
    const items = [];
    for await (const item of readMessages([bytes.subarray(0, 40), bytes.subarray(40)])) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    const first = items[0];
    expect(first?.ok).toBe(true);
    if (first?.ok === true) {
      expect(first.message.get("PID.5.1")?.codePointAt(3)).toBe(0x2122);
      expect(charsetCodes(first.message.warnings)).toEqual([]);
    }
  });

  it("readSegments decodes a declared WINDOWS-1252 message chunk by chunk", async () => {
    const bytes = messageWithByte("WINDOWS-1252", 0x80);
    const codes: string[] = [];
    let family = "";
    for await (const { segment, warnings } of readSegments([
      bytes.subarray(0, 40),
      bytes.subarray(40, bytes.length - 6),
      bytes.subarray(bytes.length - 6),
    ])) {
      codes.push(...charsetCodes(warnings));
      if (segment.type === "PID") family = segment.field(5).value;
    }
    expect(codes).toEqual([]);
    expect(family.codePointAt(3)).toBe(0x20ac);
  });
});
