/**
 * MSH delimiter-discovery stage for the `@cosyte/hl7` parser pipeline.
 * Reads the encoding characters (MSH-1 field separator + MSH-2 component /
 * repetition / escape / subcomponent, and the optional v2.7+ truncation
 * character) from the first segment and throws a Tier-3 `Hl7ParseError` if
 * the structural preconditions fail. Downstream stages (`tokenize.ts`)
 * consume the returned `EncodingCharacters` verbatim and never re-derive
 * them, which keeps custom-delimiter behaviour (PARSE-02) consistent across
 * the pipeline.
 *
 * Only three of the four Tier-3 fatal codes originate here —
 * `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`. The
 * fourth, `EMPTY_INPUT`, is owned by the `normalize.ts` preprocessing stage.
 */

import { FATAL_CODES, Hl7ParseError } from "./errors.js";
import { snippet } from "./segments.js";
import type { EncodingCharacters } from "./types.js";

/**
 * The HL7 default 5-tuple of encoding characters used when a message does
 * not override them via MSH-1 / MSH-2. Re-used by downstream stages (Plan 04
 * escape map, Plan 06 `parseHL7`) as a synthetic-message fallback.
 *
 * @example
 * ```ts
 * import { DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * DEFAULT_ENCODING_CHARACTERS.field; // "|"
 * ```
 */
export const DEFAULT_ENCODING_CHARACTERS: EncodingCharacters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

/**
 * Extract the HL7 encoding characters from the first segment of a message.
 *
 * Accepts a 4-character MSH-2 (HL7 v2.1–v2.6 — component/repetition/escape/
 * subcomponent) or a 5-character MSH-2 (HL7 v2.7+ — adds a truncation
 * character; spec default `#`). Both shapes are spec-conformant and must not
 * fatal.
 *
 * Throws `Hl7ParseError` with one of three Tier-3 fatal codes when the
 * structural preconditions fail:
 *
 * - `NO_MSH_SEGMENT` — first segment does not start with `MSH`.
 * - `MSH_TOO_SHORT` — MSH has fewer than 8 chars (cannot contain the
 *   encoding-characters field).
 * - `INVALID_ENCODING_CHARACTERS` — MSH-1 is whitespace; MSH-2 is not
 *   4 or 5 distinct non-whitespace chars; or the field separator appears
 *   among the MSH-2 encoding chars.
 *
 * @example
 * ```ts
 * import { readDelimiters } from "@cosyte/hl7";
 * const v25 = readDelimiters("MSH|^~\\&|APP|FAC|...");
 * v25.truncation;    // undefined
 * const v27 = readDelimiters("MSH|^~\\&#|APP|FAC|...");
 * v27.truncation;    // "#"
 * ```
 */
export function readDelimiters(firstSegment: string): EncodingCharacters {
  const fatalPosition = { segmentIndex: 0 };
  const snip = snippet(firstSegment);

  if (firstSegment.length < 3 || firstSegment.slice(0, 3) !== "MSH") {
    throw new Hl7ParseError(
      FATAL_CODES.NO_MSH_SEGMENT,
      "First segment is not MSH — HL7 v2 messages must begin with an MSH segment.",
      fatalPosition,
      snip,
    );
  }

  // Need "MSH" + field separator + 4 encoding chars = 8 chars minimum
  // (4-char MSH-2 is the v2.1–v2.6 floor; a 5-char v2.7+ MSH-2 needs 9).
  if (firstSegment.length < 8) {
    throw new Hl7ParseError(
      FATAL_CODES.MSH_TOO_SHORT,
      "MSH segment is truncated — cannot read encoding characters.",
      fatalPosition,
      snip,
    );
  }

  const field = firstSegment.charAt(3);

  if (/\s/u.test(field)) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-1 field separator is whitespace — refusing to parse.",
      fatalPosition,
      snip,
    );
  }

  // MSH-2 spans from char 4 to the next field separator. If no terminator
  // appears, MSH-2 runs to end-of-segment. This lets v2.7+ 5-char MSH-2
  // (e.g. `^~\&#`) parse without hard-coding a slice length.
  const nextFieldSep = firstSegment.indexOf(field, 4);
  const msh2End = nextFieldSep === -1 ? firstSegment.length : nextFieldSep;
  const encodingField = firstSegment.slice(4, msh2End);
  const chars = [...encodingField];

  if (chars.length !== 4 && chars.length !== 5) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      `MSH-2 encoding characters must be 4 (v2.1–v2.6) or 5 (v2.7+ adds truncation) characters (got ${String(chars.length)}).`,
      fatalPosition,
      snip,
    );
  }
  if (new Set(chars).size !== chars.length) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      `MSH-2 encoding characters must be ${String(chars.length)} distinct characters.`,
      fatalPosition,
      snip,
    );
  }
  if (chars.some((c) => /\s/u.test(c))) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-2 encoding characters must not contain whitespace.",
      fatalPosition,
      snip,
    );
  }
  if (chars.includes(field)) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "Field separator must not appear among the MSH-2 encoding characters.",
      fatalPosition,
      snip,
    );
  }

  // `noUncheckedIndexedAccess` requires explicit narrowing even though the
  // length/distinct-count checks above guarantee these are defined.
  const component = chars[0];
  const repetition = chars[1];
  const escape = chars[2];
  const subcomponent = chars[3];
  if (
    component === undefined ||
    repetition === undefined ||
    escape === undefined ||
    subcomponent === undefined
  ) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-2 encoding characters could not be read.",
      fatalPosition,
      snip,
    );
  }

  const truncation = chars.length === 5 ? chars[4] : undefined;
  return truncation === undefined
    ? { field, component, repetition, escape, subcomponent }
    : { field, component, repetition, escape, subcomponent, truncation };
}
