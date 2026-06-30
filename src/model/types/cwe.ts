/**
 * CWE — HL7 v2 Coded with Exceptions composite. 9-component coded-element
 * shape parsed from a `RawRepetition` on demand by `Field.asCwe()` (wired in
 * Plan 04). Fields are OMITTED when absent (exactOptionalPropertyTypes) —
 * NEVER set to `undefined`.
 *
 * Note: full HL7 v2.6+ CWE has 22 components. v1 of this library ships the 9
 * core components — identifier, text, coding-system trio + version ids, and
 * originalText — which cover the common HL7 v2.5 use cases. v2 may restore
 * the full shape. Components 10+ that a newer (v2.7+) sender supplies — the
 * second-alternate triplet and the coding-system / value-set OIDs — are NOT
 * dropped: they are preserved verbatim on `extraComponents` so the typed view
 * is lossless across versions.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent, readExtraComponents } from "./_shared.js";

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
 * Components 10+ (present only on v2.7+ senders) are surfaced verbatim, in
 * order, on `extraComponents` — never silently truncated.
 *
 * @example
 * ```ts
 * import type { CWE } from "@cosyte/hl7";
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
  /**
   * Components beyond the modeled 9 (HL7 component 10 onward), preserved
   * verbatim and in order for forward-compatibility with v2.7+ senders that
   * carry the second-alternate triplet or coding-system / value-set OIDs.
   * OMITTED when the element has no components past the 9th. An absent interior
   * component is preserved as `""` so `extraComponents[i]` maps to HL7
   * component `10 + i`.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 CWE repetition into a structured `CWE` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseCwe, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
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

  const extraComponents = readExtraComponents(rep, 9, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;

  return out;
}
