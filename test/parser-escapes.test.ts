import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import { reescape, unescape } from "../src/parser/escapes.js";
import type { EncodingCharacters, Hl7Position } from "../src/parser/types.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

const enc = DEFAULT_ENCODING_CHARACTERS;
const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 1 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/escapes: unescape", () => {
  it("passes through strings with no escape char unchanged", () => {
    const { emit, warnings } = collect();
    expect(unescape("abc", enc, emit, pos)).toBe("abc");
    expect(warnings).toHaveLength(0);
  });

  it("expands \\F\\ to field separator", () => {
    const { emit, warnings } = collect();
    expect(unescape("a\\F\\b", enc, emit, pos)).toBe("a|b");
    expect(warnings).toHaveLength(0);
  });

  it("expands \\S\\ \\T\\ \\R\\ \\E\\ to component, subcomponent, repetition, escape", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\S\\\\T\\\\R\\\\E\\", enc, emit, pos)).toBe("^&~\\");
    expect(warnings).toHaveLength(0);
  });

  it("expands \\.br\\ to newline", () => {
    const { emit, warnings } = collect();
    expect(unescape("line1\\.br\\line2", enc, emit, pos)).toBe("line1\nline2");
    expect(warnings).toHaveLength(0);
  });

  it("expands \\X0A\\ to a single LF character", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\X0A\\", enc, emit, pos)).toBe("\n");
    expect(warnings).toHaveLength(0);
  });

  it("expands \\X48656C6C6F\\ to 'Hello'", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\X48656C6C6F\\", enc, emit, pos)).toBe("Hello");
    expect(warnings).toHaveLength(0);
  });

  it("preserves \\Z99\\ verbatim and emits UNKNOWN_ESCAPE_SEQUENCE", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\Z99\\", enc, emit, pos)).toBe("\\Z99\\");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("preserves \\UNKNOWN\\ verbatim and warns", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\UNKNOWN\\", enc, emit, pos)).toBe("\\UNKNOWN\\");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("rejects invalid hex (non-hex chars) and preserves verbatim", () => {
    const { emit, warnings } = collect();
    expect(unescape("a\\Xzz\\b", enc, emit, pos)).toBe("a\\Xzz\\b");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("rejects odd-length hex and preserves verbatim", () => {
    const { emit, warnings } = collect();
    expect(unescape("a\\Xabc\\b", enc, emit, pos)).toBe("a\\Xabc\\b");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("handles unterminated escapes without infinite loop and warns once", () => {
    const { emit, warnings } = collect();
    const out = unescape("lonely \\ backslash", enc, emit, pos);
    expect(out).toBe("lonely \\ backslash");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("\\P\\ decodes to enc.truncation when set (HL7 v2.7+ §2.5.5.2)", () => {
    const v27: EncodingCharacters = { ...enc, truncation: "#" };
    const { emit, warnings } = collect();
    expect(unescape("truncated\\P\\at end", v27, emit, pos)).toBe("truncated#at end");
    expect(warnings).toHaveLength(0);
  });

  it("\\P\\ decodes to the spec default # when no truncation char is declared", () => {
    // Spec §2.5.5.2 default truncation character is `#`. If a sender uses
    // \P\ without declaring one on MSH-2, fall back to the spec default
    // rather than warn — recognized standard sequence, deterministic decode.
    const { emit, warnings } = collect();
    expect(unescape("a\\P\\b", enc, emit, pos)).toBe("a#b");
    expect(warnings).toHaveLength(0);
  });

  it("highlight \\H\\ and \\N\\ are recognized — preserved verbatim, no warning", () => {
    const { emit, warnings } = collect();
    expect(unescape("Critical \\H\\value\\N\\ here", enc, emit, pos)).toBe(
      "Critical \\H\\value\\N\\ here",
    );
    expect(warnings).toHaveLength(0);
  });

  it.each([".sp", ".in", ".ti", ".fi", ".nf", ".ce"])(
    "formatting escape \\%s\\ is recognized — preserved verbatim, no warning",
    (seq) => {
      const { emit, warnings } = collect();
      const input = `before\\${seq}\\after`;
      expect(unescape(input, enc, emit, pos)).toBe(input);
      expect(warnings).toHaveLength(0);
    },
  );

  it("charset switch \\Cxxyy\\ is recognized — preserved verbatim, no warning", () => {
    const { emit, warnings } = collect();
    expect(unescape("text\\C2842\\more", enc, emit, pos)).toBe("text\\C2842\\more");
    expect(warnings).toHaveLength(0);
  });

  it("charset switch \\Mxxyyzz\\ (multi-byte) is recognized — verbatim, no warning", () => {
    const { emit, warnings } = collect();
    // 4-hex and 6-hex multi-byte forms must both be recognized.
    expect(unescape("a\\M2842\\b", enc, emit, pos)).toBe("a\\M2842\\b");
    expect(unescape("a\\M824041\\b", enc, emit, pos)).toBe("a\\M824041\\b");
    expect(warnings).toHaveLength(0);
  });

  it("malformed charset escape (odd-length / non-hex) still warns", () => {
    // \C12\ — only 2 hex digits (single-byte charset switches are 4). Not a
    // recognized form; must still surface UNKNOWN_ESCAPE_SEQUENCE so senders
    // notice malformed declarations rather than getting silent acceptance.
    const { emit, warnings } = collect();
    expect(unescape("\\C12\\", enc, emit, pos)).toBe("\\C12\\");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("honors custom escape character from EncodingCharacters", () => {
    const customEnc: EncodingCharacters = {
      field: "#",
      component: "$",
      repetition: "%",
      escape: "*",
      subcomponent: "@",
    };
    const { emit, warnings } = collect();
    expect(unescape("a*F*b", customEnc, emit, pos)).toBe("a#b");
    expect(warnings).toHaveLength(0);
  });
});

describe("parser/escapes: reescape", () => {
  it("re-escapes field separator to \\F\\", () => {
    expect(reescape("a|b", enc)).toBe("a\\F\\b");
  });

  it("re-escapes all 5 delimiters and newline", () => {
    expect(reescape("|^~\\&", enc)).toBe("\\F\\\\S\\\\R\\\\E\\\\T\\");
    expect(reescape("line1\nline2", enc)).toBe("line1\\.br\\line2");
  });

  it("unescape(reescape(x)) round-trips with zero warnings", () => {
    const { emit, warnings } = collect();
    const original = "Hello|World^Foo~Bar\\Baz&Qux\nNext";
    const roundTripped = unescape(reescape(original, enc), enc, emit, pos);
    expect(roundTripped).toBe(original);
    expect(warnings).toHaveLength(0);
  });

  it("re-escapes the truncation char to \\P\\ when declared (v2.7+)", () => {
    const v27: EncodingCharacters = { ...enc, truncation: "#" };
    expect(reescape("a#b", v27)).toBe("a\\P\\b");
  });

  it("does NOT escape the spec-default # when no truncation char is declared", () => {
    // Pre-v2.7 encodings have no reserved meaning for `#` — round-trip as
    // a literal rather than synthesizing a \P\ the sender never authored.
    expect(reescape("a#b", enc)).toBe("a#b");
  });

  it("truncation round-trip: unescape(reescape(x containing #, v27)) === x", () => {
    const v27: EncodingCharacters = { ...enc, truncation: "#" };
    const { emit, warnings } = collect();
    const original = "value#with#trunc";
    const roundTripped = unescape(reescape(original, v27), v27, emit, pos);
    expect(roundTripped).toBe(original);
    expect(warnings).toHaveLength(0);
  });
});
