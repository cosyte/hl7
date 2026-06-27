import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS, readDelimiters } from "../src/parser/delimiters.js";
import { Hl7ParseError } from "../src/parser/errors.js";

describe("parser/delimiters: readDelimiters (happy path)", () => {
  it("reads default HL7 encoding characters from a standard MSH", () => {
    const enc = readDelimiters("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5");
    expect(enc).toEqual({
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
    });
  });

  it("reads custom encoding characters from a non-standard MSH", () => {
    // MSH-1 = "#" is reused as the field separator throughout the segment;
    // the parser bounds MSH-2 by the NEXT field separator (not a hard-coded
    // slice), so a real custom-delimiter sender must be internally consistent.
    const enc = readDelimiters("MSH#$%*@#APP#FAC#APP#FAC#20250101##ADT^A01#1#P#2.5");
    expect(enc).toEqual({
      field: "#",
      component: "$",
      repetition: "%",
      escape: "*",
      subcomponent: "@",
    });
  });

  it("reads a 5-char MSH-2 (v2.7+ truncation char) without fataling", () => {
    const enc = readDelimiters("MSH|^~\\&#|APP|FAC|APP|FAC|20260101||ADT^A01|1|P|2.7");
    expect(enc).toEqual({
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
      truncation: "#",
    });
  });

  it("accepts a custom 5-char MSH-2 with a non-default truncation char", () => {
    // Sender declares `@` as the truncation character.
    const enc = readDelimiters("MSH|^~\\&@|APP|FAC|APP|FAC|20260101||ADT^A01|1|P|2.7");
    expect(enc.truncation).toBe("@");
  });

  it("omits truncation when MSH-2 has 4 chars (back-compat)", () => {
    const enc = readDelimiters("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5");
    expect(enc).not.toHaveProperty("truncation");
  });
});

describe("parser/delimiters: readDelimiters (fatal paths)", () => {
  it("throws NO_MSH_SEGMENT when the first segment is not MSH", () => {
    try {
      readDelimiters("PID|123");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("NO_MSH_SEGMENT");
      }
    }
  });

  it("throws MSH_TOO_SHORT when the MSH segment has fewer than 8 chars", () => {
    try {
      readDelimiters("MSH|^");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("MSH_TOO_SHORT");
      }
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when MSH-2 holds fewer than 4 code points", () => {
    // An astral character (emoji) is two UTF-16 code units, so the 4-unit
    // slice(4,8) decodes to only 3 Unicode code points — not a valid 4-char
    // encoding set. Counting by code point (not code unit) is the correct
    // behavior; this guards against a multi-byte char sneaking into MSH-2.
    try {
      readDelimiters("MSH|^~\u{1F600}|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
        expect(err.message).toMatch(/4 \(v2\.1–v2\.6\) or 5 \(v2\.7\+/u);
      }
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when a 5-char MSH-2 has duplicates", () => {
    // The same distinctness rule applies to the v2.7+ 5-char form — the
    // truncation char must not collide with any of the other four.
    try {
      readDelimiters("MSH|^~\\&^|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
        expect(err.message).toMatch(/5 distinct characters/u);
      }
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when MSH-2 has duplicate chars", () => {
    try {
      readDelimiters("MSH|^^^^|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
      }
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when MSH-1 is whitespace", () => {
    try {
      readDelimiters("MSH abcd|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
      }
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when MSH-2 contains whitespace", () => {
    try {
      readDelimiters("MSH|^ ~\\|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
      }
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when the field separator appears in MSH-2", () => {
    try {
      readDelimiters("MSH||^~\\|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
      }
    }
  });

  it("fatal errors carry segmentIndex=0 and a non-empty snippet", () => {
    try {
      readDelimiters("PID|123");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.position.segmentIndex).toBe(0);
        expect(err.snippet.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("parser/delimiters: DEFAULT_ENCODING_CHARACTERS", () => {
  it("is the HL7 default 5-tuple", () => {
    expect(DEFAULT_ENCODING_CHARACTERS).toEqual({
      field: "|",
      component: "^",
      repetition: "~",
      escape: "\\",
      subcomponent: "&",
    });
  });
});
