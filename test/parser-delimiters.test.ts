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
    const enc = readDelimiters("MSH#$%*@|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5");
    expect(enc).toEqual({
      field: "#",
      component: "$",
      repetition: "%",
      escape: "*",
      subcomponent: "@",
    });
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
