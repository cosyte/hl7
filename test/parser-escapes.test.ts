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
});
