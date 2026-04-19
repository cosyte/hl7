/**
 * CWE — HL7 v2 Coded with Exceptions composite. 9-component coded-element
 * shape parsed from a `RawRepetition` on demand by `Field.asCwe()` (wired in
 * Plan 04). Fields are OMITTED when absent (exactOptionalPropertyTypes) —
 * NEVER set to `undefined`.
 *
 * Note: full HL7 v2.6+ CWE has 22 components. v1 of this library ships the 9
 * core components — identifier, text, coding-system trio + version ids, and
 * originalText — which cover the common HL7 v2.5 use cases. v2 may restore
 * the full shape.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * HL7 v2 Coded with Exceptions (CWE) — coded element per HL7 Chapter 2. All
 * 9 components are optional. Fields are OMITTED when the underlying
 * component is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. identifier (e.g. "GLU")
 * 2. text (human-readable, e.g. "Glucose")
 * 3. nameOfCodingSystem (e.g. "LN" for LOINC, "SCT" for SNOMED CT)
 * 4. alternateIdentifier
 * 5. alternateText
 * 6. nameOfAlternateCodingSystem
 * 7. codingSystemVersionId
 * 8. alternateCodingSystemVersionId
 * 9. originalText
 *
 * @example
 * ```ts
 * import type { CWE } from "@cosyte/hl7-parser";
 * const code: CWE = { identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" };
 * ```
 */
export interface CWE {
  readonly identifier?: string;
  readonly text?: string;
  readonly nameOfCodingSystem?: string;
  readonly alternateIdentifier?: string;
  readonly alternateText?: string;
  readonly nameOfAlternateCodingSystem?: string;
  readonly codingSystemVersionId?: string;
  readonly alternateCodingSystemVersionId?: string;
  readonly originalText?: string;
}

/**
 * Parse an HL7 v2 CWE repetition into a structured `CWE` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseCwe, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const rep = { components: [
 *   { subcomponents: ["GLU"] },
 *   { subcomponents: ["Glucose"] },
 *   { subcomponents: ["LN"] },
 * ] };
 * const cwe = parseCwe(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(cwe.identifier); // "GLU"
 * ```
 */
export function parseCwe(rep: RawRepetition, enc: EncodingCharacters): CWE {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<CWE> = {};

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

  const codingSystemVersionId = readComponent(rep, 6, enc);
  if (codingSystemVersionId !== undefined) out.codingSystemVersionId = codingSystemVersionId;

  const alternateCodingSystemVersionId = readComponent(rep, 7, enc);
  if (alternateCodingSystemVersionId !== undefined) {
    out.alternateCodingSystemVersionId = alternateCodingSystemVersionId;
  }

  const originalText = readComponent(rep, 8, enc);
  if (originalText !== undefined) out.originalText = originalText;

  return out;
}
