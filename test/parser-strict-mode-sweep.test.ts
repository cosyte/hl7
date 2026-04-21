/**
 * TEST-05 + TEST-06 sweep. For every fixture in
 * `test/fixtures/vendor-quirks/`, asserts:
 *   - lenient parse succeeds (every fixture is a structurally valid
 *     HL7 message that the parser can accept)
 *   - if the target warning code is wired in the current parser (see
 *     `EMITTING_CODES` below), `msg.warnings` contains that code AND
 *     strict-mode parse throws `Hl7ParseError`
 *   - codes whose factory functions exist in `src/parser/warnings.ts`
 *     but have no parser call site today are registered with `it.todo`
 *     so the sweep self-documents the gap and a future plan that wires
 *     an emit site auto-promotes the todo into a passing test without
 *     touching this file.
 *
 * The fixture filename is the kebab-case of its target code (Plan 07-04
 * D-12); adding a new fixture file to the directory auto-joins the
 * sweep (D-15 — `readdirSync` + `describe.each`). See
 * `test/fixtures/vendor-quirks/README.md` for per-fixture notes.
 *
 * Per D-14, co-triggered warnings are permitted; we use `.toContain` on
 * the codes array, not `.toEqual([code])`.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { Hl7ParseError } from "../src/parser/errors.js";
import type { ParseOptions } from "../src/parser/types.js";

import { fileToCode } from "./_helpers/fixture-code.js";

const VQ_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "vendor-quirks");

const fixtures = readdirSync(VQ_DIR)
  .filter((f) => f.endsWith(".hl7"))
  .sort();

/**
 * Warning codes the lenient parser actively emits today. Exhaustive as of
 * Phase 7 baseline — derived by probing every fixture and recording which
 * `msg.warnings` codes surface. Other codes in
 * `src/parser/warnings.ts::WARNING_CODES` have factory functions but no
 * call site in the parser pipeline (SEGMENT_CASE, EXTRA_FIELDS,
 * DUPLICATE_REQUIRED_SEGMENT, MISSING_REQUIRED_FIELD, OUT_OF_ORDER_SEGMENT,
 * VERSION_MISMATCH, TIMESTAMP_FALLBACK_FORMAT).
 *
 * When a future plan wires one of those factories into the parser, move its
 * code from the `NON_EMITTING_CODES` set into `EMITTING_CODES` and the
 * sweep auto-promotes its `it.todo` blocks into full assertions.
 *
 * See `test/fixtures/vendor-quirks/README.md` for the full status matrix.
 */
const EMITTING_CODES: ReadonlySet<string> = new Set<string>([
  "MLLP_FRAMING_STRIPPED",
  "FIELD_WHITESPACE_TRIMMED",
  "UNKNOWN_ESCAPE_SEQUENCE",
  "UNKNOWN_SEGMENT",
  "ENCODING_MISMATCH",
  "UNKNOWN_CHARSET",
]);

/**
 * Per-fixture parse options. Every fixture is read as a Buffer so the
 * UNKNOWN_CHARSET codepath in `normalizeBuffer` is exercised where
 * relevant; most fixtures parse with default options. The
 * `encoding-mismatch.hl7` fixture declares MSH-18=`UTF-8` and requires the
 * caller to override with a disagreeing `options.charset` to trigger the
 * ENCODING_MISMATCH emit site in `resolveBufferCharset`.
 */
const PER_FIXTURE_OPTIONS: Readonly<Record<string, ParseOptions>> = {
  "encoding-mismatch.hl7": { charset: "ASCII" },
};

function readAsBuffer(file: string): Buffer {
  return readFileSync(path.join(VQ_DIR, file));
}

function optionsFor(file: string, extra?: ParseOptions): ParseOptions {
  const base = PER_FIXTURE_OPTIONS[file];
  if (base === undefined && extra === undefined) return {};
  return { ...(base ?? {}), ...(extra ?? {}) };
}

describe("TEST-05 + TEST-06: vendor-quirks fixture sweep", () => {
  it("the directory contains exactly 13 fixtures (one per WARNING_CODES entry)", () => {
    expect(fixtures).toHaveLength(13);
  });

  describe.each(fixtures)("vendor-quirks/%s", (file) => {
    const buf = readAsBuffer(file);
    const expectedCode = fileToCode(file);
    const lenientOptions = optionsFor(file);
    const strictOptions = optionsFor(file, { strict: true });
    const isEmitting = EMITTING_CODES.has(expectedCode);

    it("lenient mode: parse succeeds (fixture is structurally valid HL7)", () => {
      expect(() => parseHL7(buf, lenientOptions)).not.toThrow();
    });

    if (isEmitting) {
      it("lenient mode: msg.warnings contains the expected code", () => {
        const msg = parseHL7(buf, lenientOptions);
        const codes = msg.warnings.map((w) => w.code);
        expect(codes).toContain(expectedCode);
      });

      it("strict mode: throws Hl7ParseError", () => {
        expect(() => parseHL7(buf, strictOptions)).toThrow(Hl7ParseError);
      });
    } else {
      it.todo(
        `lenient mode: msg.warnings contains ${expectedCode} (factory wired, parser call site pending — see vendor-quirks/README.md)`,
      );
      it.todo(
        `strict mode: throws Hl7ParseError for ${expectedCode} (blocked on the lenient emit site landing first)`,
      );
    }
  });
});
