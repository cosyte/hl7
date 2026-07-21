import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  type WarningCode,
  ackNoCorrelationId,
  duplicateRequiredSegment,
  encodingMismatch,
  extraFields,
  fieldWhitespaceTrimmed,
  missingRequiredField,
  mllpFramingStripped,
  outOfOrderSegment,
  segmentCase,
  timestampFallbackFormat,
  unknownCharset,
  unknownEscapeSequence,
  unknownSegment,
  unterminatedEscapeSequence,
  versionMismatch,
} from "../src/parser/warnings.js";

describe("parser/warnings: registry + factories", () => {
  it("WARNING_CODES has exactly 20 entries with matching key/value strings", () => {
    const entries = Object.entries(WARNING_CODES);
    expect(entries).toHaveLength(20);
    for (const [k, v] of entries) expect(k).toBe(v);
  });

  it("WarningCode narrowing rejects made-up strings at compile time", () => {
    // @ts-expect-error "MADE_UP" is not a WarningCode
    const bad: WarningCode = "MADE_UP";
    expect(bad).toBeDefined();
  });

  it("mllpFramingStripped produces a deterministic warning with position", () => {
    const w = mllpFramingStripped({ segmentIndex: 0 });
    expect(w.code).toBe(WARNING_CODES.MLLP_FRAMING_STRIPPED);
    expect(w.message.length).toBeGreaterThan(0);
    expect(w.position.segmentIndex).toBe(0);
  });

  it("fieldWhitespaceTrimmed reports leading/trailing counts, never field values", () => {
    const w = fieldWhitespaceTrimmed({ segmentIndex: 1, fieldIndex: 5 }, 2, 1);
    expect(w.code).toBe(WARNING_CODES.FIELD_WHITESPACE_TRIMMED);
    expect(w.message).toMatch(/2 leading/);
    expect(w.message).toMatch(/1 trailing/);
  });

  it("all 14 factories produce warnings whose code matches the factory identity", () => {
    const cases = [
      [mllpFramingStripped({ segmentIndex: 0 }), "MLLP_FRAMING_STRIPPED"],
      [fieldWhitespaceTrimmed({ segmentIndex: 0 }, 1, 0), "FIELD_WHITESPACE_TRIMMED"],
      [unknownEscapeSequence({ segmentIndex: 0 }, "Z99"), "UNKNOWN_ESCAPE_SEQUENCE"],
      [timestampFallbackFormat({ segmentIndex: 0 }, "ISO"), "TIMESTAMP_FALLBACK_FORMAT"],
      [segmentCase({ segmentIndex: 0 }, "pid"), "SEGMENT_CASE"],
      [extraFields({ segmentIndex: 0 }, "PID", 3), "EXTRA_FIELDS"],
      [unknownSegment({ segmentIndex: 0 }, "ZZZ"), "UNKNOWN_SEGMENT"],
      [duplicateRequiredSegment({ segmentIndex: 0 }, "MSH"), "DUPLICATE_REQUIRED_SEGMENT"],
      [encodingMismatch({ segmentIndex: 0 }, "detail"), "ENCODING_MISMATCH"],
      [missingRequiredField({ segmentIndex: 0 }, "MSH", 3), "MISSING_REQUIRED_FIELD"],
      [outOfOrderSegment({ segmentIndex: 0 }, "EVN"), "OUT_OF_ORDER_SEGMENT"],
      [versionMismatch({ segmentIndex: 0 }, "2.9", "2.8"), "VERSION_MISMATCH"],
      [unknownCharset({ segmentIndex: 0 }, "ISO IR 999"), "UNKNOWN_CHARSET"],
      [ackNoCorrelationId({ segmentIndex: 0 }), "ACK_NO_CORRELATION_ID"],
    ] as const;
    for (const [w, expected] of cases) expect(w.code).toBe(expected);
    expect(cases).toHaveLength(14);
  });

  it("warning messages are non-empty and carry the contextual payload", () => {
    const w = unknownSegment({ segmentIndex: 2 }, "ZZZ");
    expect(w.message).toMatch(/ZZZ/);
  });

  describe("unknownEscapeSequence: PHI-safe messages", () => {
    it("names the recognized escape-type letter + length for a vendor \\Z..\\ body, never the body text", () => {
      const w = unknownEscapeSequence({ segmentIndex: 2, fieldIndex: 3 }, "Zsecretpatientname");
      expect(w.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
      expect(w.message).toMatch(/type "Z"/);
      expect(w.message).toMatch(/18 chars/);
      expect(w.message).not.toMatch(/secret/i);
      expect(w.message).not.toMatch(/patientname/i);
    });

    it("names no type letter when the body's first char is not a recognized escape letter", () => {
      // A stray escape char landed in front of genuine field text — the first
      // character ("p" of "patientname") is not one of F S T R E X C M Z H N
      // or "." so nothing about the body may be named, only its length.
      const w = unknownEscapeSequence({ segmentIndex: 2, fieldIndex: 3 }, "patientname");
      expect(w.message).not.toMatch(/type "/);
      expect(w.message).toMatch(/11 chars/);
      expect(w.message).not.toMatch(/patient/i);
    });

    it("names the formatting-escape type for a malformed dot-prefixed body", () => {
      const w = unknownEscapeSequence({ segmentIndex: 0 }, ".zz");
      expect(w.message).toMatch(/type "\."/);
      expect(w.message).toMatch(/3 chars/);
    });
  });

  describe("unterminatedEscapeSequence: PHI-safe messages", () => {
    it("carries no field content and no length of the (arbitrary-size) tail", () => {
      const w = unterminatedEscapeSequence({ segmentIndex: 2, fieldIndex: 3 });
      expect(w.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
      expect(w.message).toMatch(/[Uu]nterminated/);
      // No length-of-tail figure and no field content — the only digit that
      // may legitimately appear is the "7" in the structural word "HL7".
      expect(w.message.replace(/HL7/g, "")).not.toMatch(/\d/);
    });
  });
});
