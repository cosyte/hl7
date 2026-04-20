/**
 * CE — HL7 v2 Coded Element composite. 6-component coded-element shape
 * parsed from a `RawRepetition` on demand by `Field.asCe()` (wired in Plan
 * 04). Fields are OMITTED when absent (exactOptionalPropertyTypes) — NEVER
 * set to `undefined`.
 *
 * CE is the older, simpler sibling of CWE — 6 components, no version ids,
 * no originalText. Still common in OBX.3 and similar observation-identifier
 * slots on older messages.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * HL7 v2 Coded Element (CE) — coded element per HL7 Chapter 2. All 6
 * components are optional. Fields are OMITTED when the underlying component
 * is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. identifier (e.g. "GLU")
 * 2. text (human-readable, e.g. "Glucose")
 * 3. nameOfCodingSystem (e.g. "LN" for LOINC)
 * 4. alternateIdentifier
 * 5. alternateText
 * 6. nameOfAlternateCodingSystem
 *
 * @example
 * ```ts
 * import type { CE } from "@cosyte/hl7";
 * const code: CE = { identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" };
 * ```
 */
export interface CE {
  readonly identifier?: string;
  readonly text?: string;
  readonly nameOfCodingSystem?: string;
  readonly alternateIdentifier?: string;
  readonly alternateText?: string;
  readonly nameOfAlternateCodingSystem?: string;
}

/**
 * Parse an HL7 v2 CE repetition into a structured `CE` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseCe, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["GLU"] },
 *   { subcomponents: ["Glucose"] },
 *   { subcomponents: ["LN"] },
 * ] };
 * const ce = parseCe(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(ce.identifier); // "GLU"
 * ```
 */
export function parseCe(rep: RawRepetition, enc: EncodingCharacters): CE {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<CE> = {};

  const identifier = readComponent(rep, 0, enc);
  if (identifier !== undefined) out.identifier = identifier;

  const text = readComponent(rep, 1, enc);
  if (text !== undefined) out.text = text;

  const nameOfCodingSystem = readComponent(rep, 2, enc);
  if (nameOfCodingSystem !== undefined) out.nameOfCodingSystem = nameOfCodingSystem;

  const alternateIdentifier = readComponent(rep, 3, enc);
  if (alternateIdentifier !== undefined) out.alternateIdentifier = alternateIdentifier;

  const alternateText = readComponent(rep, 4, enc);
  if (alternateText !== undefined) out.alternateText = alternateText;

  const nameOfAlternateCodingSystem = readComponent(rep, 5, enc);
  if (nameOfAlternateCodingSystem !== undefined) {
    out.nameOfAlternateCodingSystem = nameOfAlternateCodingSystem;
  }

  return out;
}
