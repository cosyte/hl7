import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

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
});
