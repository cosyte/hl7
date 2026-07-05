import { describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";

import { canonicalCharset, resolveCharset } from "../src/parser/charset.js";
import { normalize, normalizeBuffer } from "../src/parser/normalize.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

describe("parser/normalize: string path", () => {
  it("returns input unchanged when already normalized and no BOM", () => {
    const input = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123";
    expect(normalize(input)).toBe(input);
  });

  it("passes a leading UTF-8 BOM through untouched (BOM strip is Plan 06's job)", () => {
    const out = normalize("\uFEFFMSH|^~\\&|X\rPID|1");
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1).startsWith("MSH")).toBe(true);
  });

  it("normalizes \\r\\n, \\n, and mixed line endings to \\r", () => {
    const input = "MSH|A\r\nPID|B\nEVN|C\rZPI|D";
    const out = normalize(input);
    expect(out).not.toMatch(/\n/);
    expect(out).toBe("MSH|A\rPID|B\rEVN|C\rZPI|D");
  });

  it("returns the empty string unchanged (EMPTY_INPUT is Plan 06's job)", () => {
    expect(normalize("")).toBe("");
  });

  it("returns whitespace-only input with line endings normalized (no throw)", () => {
    // \r\n -> \r, \n -> \r; other whitespace (spaces, tabs) is preserved.
    expect(normalize("   \r\n\t ")).toBe("   \r\t ");
  });
});

describe("parser/normalize: Buffer path", () => {
  const validRaw = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123";

  it("decodes a UTF-8 Buffer without a declared charset and emits no warnings", () => {
    const warnings: Hl7ParseWarning[] = [];
    const out = normalizeBuffer(Buffer.from(validRaw, "utf-8"), undefined, (w) => warnings.push(w));
    expect(out).toBe(validRaw);
    expect(warnings).toHaveLength(0);
  });

  it("decodes a UTF-8 Buffer with explicit charset UTF-8 and emits no warnings", () => {
    const warnings: Hl7ParseWarning[] = [];
    normalizeBuffer(Buffer.from(validRaw, "utf-8"), "UTF-8", (w) => warnings.push(w));
    expect(warnings).toHaveLength(0);
  });

  it("emits UNKNOWN_CHARSET and preserves bytes verbatim on an unrecognized charset", () => {
    const warnings: Hl7ParseWarning[] = [];
    const out = normalizeBuffer(Buffer.from(validRaw, "utf-8"), "ISO IR 999", (w) =>
      warnings.push(w),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_CHARSET);
    expect(warnings[0]?.position.segmentIndex).toBe(0);
    expect(warnings[0]?.position.fieldIndex).toBe(18);
    // ASCII content decodes byte-identically whether verbatim (latin1) or UTF-8.
    expect(out).toBe(validRaw);
  });

  it("emits UNSUPPORTED_CHARSET and preserves bytes verbatim on a recognized multibyte set", () => {
    const warnings: Hl7ParseWarning[] = [];
    // ISO IR87 (JIS X 0208) is a recognized Table-0211 code this parser does
    // not decode — bytes are preserved, never guessed at.
    const out = normalizeBuffer(Buffer.from(validRaw, "utf-8"), "ISO IR87", (w) =>
      warnings.push(w),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNSUPPORTED_CHARSET);
    expect(out).toBe(validRaw);
  });

  it("preserves non-ASCII bytes losslessly (reversibly) on the verbatim fail-safe", () => {
    const warnings: Hl7ParseWarning[] = [];
    // A high byte (0xE9) under an unrecognized charset must round-trip: latin1
    // preservation maps it to U+00E9 and re-encodes byte-identical, unlike a
    // UTF-8 guess that would replace the lone byte with U+FFFD (data loss).
    const bytes = Buffer.from([0x4d, 0x53, 0x48, 0x7c, 0xe9]); // "MSH|<0xE9>"
    const out = normalizeBuffer(bytes, "COBOL-EBCDIC", (w) => warnings.push(w));
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_CHARSET);
    expect(Buffer.from(out, "latin1")).toEqual(bytes);
  });

  it("falls back to verbatim + UNSUPPORTED_CHARSET when the runtime TextDecoder lacks a decodable label", () => {
    // Simulate a minimal-ICU Node build where constructing the 8859/15 decoder
    // throws: the parser must preserve bytes rather than propagate the error.
    const RealTextDecoder = globalThis.TextDecoder;
    vi.stubGlobal(
      "TextDecoder",
      class {
        constructor(label?: string) {
          if (label === "iso-8859-15") throw new RangeError("unsupported label");
          return new RealTextDecoder(label);
        }
      },
    );
    try {
      const warnings: Hl7ParseWarning[] = [];
      const out = normalizeBuffer(Buffer.from("MSH|X", "latin1"), "8859/15", (w) =>
        warnings.push(w),
      );
      expect(warnings[0]?.code).toBe(WARNING_CODES.UNSUPPORTED_CHARSET);
      expect(out).toBe("MSH|X");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("decodes 8859/1 C1-range bytes (0x80-0x9F) byte-exactly via latin1, not windows-1252", () => {
    const warnings: Hl7ParseWarning[] = [];
    // 0x80 is a C1 control (U+0080) in true ISO-8859-1, but '€' (U+20AC) under
    // the WHATWG TextDecoder("iso-8859-1") = windows-1252 alias. latin1 gives
    // the byte-exact code point and re-encodes identically.
    const bytes = Buffer.from([0x4d, 0x53, 0x48, 0x7c, 0x80, 0x9f]); // "MSH|" + 0x80 0x9F
    const out = normalizeBuffer(bytes, "8859/1", (w) => warnings.push(w));
    expect(warnings).toHaveLength(0);
    expect(out.charCodeAt(4)).toBe(0x80);
    expect(out.charCodeAt(5)).toBe(0x9f);
    expect(Buffer.from(out, "latin1")).toEqual(bytes);
  });

  it("preserves 8859/9 verbatim (no silent windows-1254 C1 remap) — 0x80 stays U+0080, not €", () => {
    const warnings: Hl7ParseWarning[] = [];
    // Node's TextDecoder("iso-8859-9") is windows-1254, which would map 0x80 → €
    // (U+20AC) — a wrong, non-recoverable character. 8859/9 is therefore NOT
    // decoded: bytes are preserved as latin1 (byte-recoverable) + flagged.
    const bytes = Buffer.from([0x4d, 0x53, 0x48, 0x7c, 0x80]); // "MSH|" + 0x80
    const out = normalizeBuffer(bytes, "8859/9", (w) => warnings.push(w));
    expect(warnings.map((w) => w.code)).toEqual([WARNING_CODES.UNSUPPORTED_CHARSET]);
    expect(out.charCodeAt(4)).toBe(0x80);
    expect(out).not.toContain("€");
    expect(Buffer.from(out, "latin1")).toEqual(bytes);
  });

  it("decodes a faithful ISO-8859 set (8859/2) with the C1 range mapped to controls, not remapped", () => {
    const warnings: Hl7ParseWarning[] = [];
    // 8859/2 (Latin-2) is decoded via TextDecoder, which maps 0x80 → U+0080
    // (control) — faithful to the true code page, unlike the windows aliases.
    const bytes = Buffer.from([0x4d, 0x53, 0x48, 0x7c, 0x80]); // "MSH|" + 0x80
    const out = normalizeBuffer(bytes, "8859/2", (w) => warnings.push(w));
    expect(warnings).toHaveLength(0);
    expect(out.charCodeAt(4)).toBe(0x80);
  });

  it("strict-decodes ASCII/UTF-8 and falls back to latin1 + UNSUPPORTED_CHARSET on a non-UTF-8 byte (no silent U+FFFD)", () => {
    const warnings: Hl7ParseWarning[] = [];
    // MSH-18 declares ASCII; a lone 0xE9 is invalid UTF-8. The strict decode
    // fails and preserves the byte losslessly (é) rather than emitting U+FFFD.
    const bytes = Buffer.from([0x4d, 0x53, 0x48, 0x7c, 0x52, 0x65, 0x6e, 0xe9]); // "MSH|Ren<0xE9>"
    const out = normalizeBuffer(bytes, "US-ASCII", (w) => warnings.push(w));
    expect(warnings.map((w) => w.code)).toEqual([WARNING_CODES.UNSUPPORTED_CHARSET]);
    expect(out).toBe("MSH|René");
    expect(out).not.toContain("�");
  });

  it("decodes Latin-1 bytes via the ISO-8859-1 alias and emits no warning", () => {
    const warnings: Hl7ParseWarning[] = [];
    // 0xE9 is "é" in ISO-8859-1 but an invalid lone byte in UTF-8 — decoding
    // it as UTF-8 would corrupt the name, so the declared charset must win.
    const latin1 = Buffer.from([
      0x4d,
      0x53,
      0x48,
      0x7c,
      0x52,
      0x65,
      0x6e,
      0xe9, // "MSH|Ren<é>"
    ]);
    const out = normalizeBuffer(latin1, "8859/1", (w) => warnings.push(w));
    expect(warnings).toHaveLength(0);
    expect(out).toBe("MSH|René");
  });
});

describe("parser/charset: Table-0211 resolution", () => {
  it("resolves a blank / absent MSH-18 to the ASCII default (decoded, no warning)", () => {
    for (const raw of [undefined, "", "   "]) {
      const r = resolveCharset(raw);
      expect(r.canonical).toBe("ASCII");
      expect(r.treatment).toBe("decode");
      expect(r.recognized).toBe(true);
    }
  });

  it.each([
    ["UNICODE", "UTF-8"],
    ["UNICODE UTF-8", "UTF-8"],
    ["UTF-8", "UTF-8"],
    ["utf8", "UTF-8"],
    ["ASCII", "ASCII"],
    ["US-ASCII", "ASCII"],
    ["8859/1", "8859/1"],
    ["ISO-8859-1", "8859/1"],
    ["8859/15", "8859/15"],
    ["ISO-8859-15", "8859/15"],
  ])("resolves decodable alias %s -> canonical %s", (alias, canonical) => {
    const r = resolveCharset(alias);
    expect(r.canonical).toBe(canonical);
    expect(r.treatment).toBe("decode");
    expect(r.recognized).toBe(true);
  });

  it.each([
    ["ISO IR87", "ISO IR87"],
    ["JIS X 0208", "ISO IR87"],
    ["GB18030", "GB 18030-2000"],
    ["BIG5", "BIG-5"],
    ["UTF-16", "UNICODE UTF-16"],
    // Windows-aliased ISO-8859 sets: recognized but not faithfully decodable.
    ["8859/9", "8859/9"],
    ["ISO-8859-11", "8859/11"],
  ])("resolves recognized-but-undecoded set %s -> verbatim", (alias, canonical) => {
    const r = resolveCharset(alias);
    expect(r.canonical).toBe(canonical);
    expect(r.treatment).toBe("verbatim");
    expect(r.recognized).toBe(true);
  });

  it("resolves an unrecognized label to verbatim + recognized:false", () => {
    const r = resolveCharset("  windows-1252 ");
    expect(r.canonical).toBe("WINDOWS-1252");
    expect(r.treatment).toBe("verbatim");
    expect(r.recognized).toBe(false);
  });

  it("collapses synonym pairs to one canonical code (no false ENCODING_MISMATCH)", () => {
    expect(canonicalCharset("unicode utf-8")).toBe(canonicalCharset("UTF-8"));
    expect(canonicalCharset("8859/1")).toBe(canonicalCharset("ISO-8859-1"));
    expect(canonicalCharset("ASCII")).not.toBe(canonicalCharset("UTF-8"));
  });
});
