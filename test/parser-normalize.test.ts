import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { mapHl7Charset, normalize, normalizeBuffer } from "../src/parser/normalize.js";
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

  it("emits UNKNOWN_CHARSET and falls back to UTF-8 on an unrecognized charset", () => {
    const warnings: Hl7ParseWarning[] = [];
    const out = normalizeBuffer(Buffer.from(validRaw, "utf-8"), "ISO IR 999", (w) =>
      warnings.push(w),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_CHARSET);
    expect(warnings[0]?.position.segmentIndex).toBe(0);
    expect(out).toBe(validRaw);
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

describe("parser/normalize: mapHl7Charset alias table", () => {
  it("maps the empty MSH-18 (charset unspecified) to utf-8", () => {
    expect(mapHl7Charset("")).toBe("utf-8");
  });

  it.each([
    ["UNICODE", "utf-8"],
    ["UNICODE UTF-8", "utf-8"],
    ["UTF-8", "utf-8"],
    ["utf8", "utf-8"],
    ["ASCII", "ascii"],
    ["US-ASCII", "ascii"],
    ["8859/1", "iso-8859-1"],
    ["ISO-8859-1", "iso-8859-1"],
    ["8859/15", "iso-8859-15"],
    ["ISO-8859-15", "iso-8859-15"],
  ])("maps HL7 alias %s -> %s", (alias, expected) => {
    expect(mapHl7Charset(alias)).toBe(expected);
  });

  it("is case- and whitespace-insensitive on known aliases", () => {
    expect(mapHl7Charset("  unicode utf-8  ")).toBe("utf-8");
    expect(mapHl7Charset("iso-8859-1")).toBe("iso-8859-1");
  });

  it("passes an unknown label through uppercased and trimmed for the caller's try/catch", () => {
    expect(mapHl7Charset("  windows-1252 ")).toBe("WINDOWS-1252");
  });
});
