import { describe, expect, it } from "vitest";

import {
  FATAL_CODES,
  type FatalCode,
  Hl7ParseError,
  ProfileDefinitionError,
} from "../src/parser/errors.js";

describe("parser/errors: fatal codes + error classes", () => {
  it("FATAL_CODES has exactly 4 locked entries with matching key/value strings", () => {
    const entries = Object.entries(FATAL_CODES);
    expect(entries).toHaveLength(4);
    expect(Object.keys(FATAL_CODES).sort()).toEqual([
      "EMPTY_INPUT",
      "INVALID_ENCODING_CHARACTERS",
      "MSH_TOO_SHORT",
      "NO_MSH_SEGMENT",
    ]);
    for (const [k, v] of entries) expect(k).toBe(v);
  });

  it("Hl7ParseError exposes all 4 required fields and is instanceof Error", () => {
    const err = new Hl7ParseError("EMPTY_INPUT", "input empty", { segmentIndex: 0 }, "");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Hl7ParseError);
    expect(err.name).toBe("Hl7ParseError");
    expect(err.code).toBe("EMPTY_INPUT");
    expect(err.message).toBe("input empty");
    expect(err.position.segmentIndex).toBe(0);
    expect(err.snippet).toBe("");
  });

  it("FatalCode narrowing rejects made-up strings at compile time", () => {
    // @ts-expect-error "FOO" is not a FatalCode
    const bad: FatalCode = "FOO";
    expect(bad).toBeDefined();
  });

  it("ProfileDefinitionError is an Error subclass with a stable name", () => {
    const err = new ProfileDefinitionError("bad profile", "myProfile");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProfileDefinitionError);
    expect(err.name).toBe("ProfileDefinitionError");
    expect(err.message).toBe("bad profile");
    expect(err.profileName).toBe("myProfile");
  });
});
