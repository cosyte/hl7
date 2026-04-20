/**
 * TEST-04 sweep — for every fixture in `test/fixtures/malformed/`,
 * asserts `parseHL7` throws `Hl7ParseError` with the expected fatal
 * code (filename → code via `fileToCode`), and that the thrown error
 * carries `position` + `snippet` per TOL-02.
 *
 * Tier-3 fatals fire in BOTH lenient and strict mode — the second
 * `it(...)` block per fixture confirms strict-mode equivalence.
 *
 * Adding a new fatal-code fixture (after a v2 code lands in
 * `FATAL_CODES`) auto-joins the sweep via `readdirSync` — no edits
 * to this file required.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { Hl7ParseError } from "../src/parser/errors.js";

import { fileToCode } from "./_helpers/fixture-code.js";

const MALFORMED_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "malformed",
);

const fixtures = readdirSync(MALFORMED_DIR)
  .filter((f) => f.endsWith(".hl7"))
  .sort();

function loadFixture(file: string): string {
  return readFileSync(path.join(MALFORMED_DIR, file), "utf8");
}

describe("TEST-04: malformed fixture sweep", () => {
  it("the directory contains exactly 4 FATAL_CODES fixtures", () => {
    expect(fixtures).toHaveLength(4);
  });

  describe.each(fixtures)("malformed/%s", (file) => {
    const raw = loadFixture(file);
    const expectedCode = fileToCode(file);

    it("lenient mode: throws Hl7ParseError with expected code + position + snippet", () => {
      expect(() => parseHL7(raw)).toThrow(Hl7ParseError);
      try {
        parseHL7(raw);
      } catch (err) {
        expect(err).toBeInstanceOf(Hl7ParseError);
        if (err instanceof Hl7ParseError) {
          expect(err.code).toBe(expectedCode);
          // position is a plain object; just assert it's present and an object.
          expect(err.position).toBeDefined();
          expect(typeof err.position).toBe("object");
          // snippet may be the empty string for EMPTY_INPUT — presence
          // (defined, typed as string) is what TOL-02 requires.
          expect(err.snippet).toBeDefined();
          expect(typeof err.snippet).toBe("string");
        }
      }
    });

    it("strict mode: throws the same way (Tier-3 mode-independent)", () => {
      expect(() => parseHL7(raw, { strict: true })).toThrow(Hl7ParseError);
      try {
        parseHL7(raw, { strict: true });
      } catch (err) {
        expect(err).toBeInstanceOf(Hl7ParseError);
        if (err instanceof Hl7ParseError) {
          expect(err.code).toBe(expectedCode);
        }
      }
    });
  });
});
