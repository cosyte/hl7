/**
 * CWE: HL7 v2 Coded with Exceptions composite, parsed from a `RawRepetition`
 * on demand by `Field.asCwe()`. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * All 22 components are read by name: the 9 of the v2.5 shape and the 13 that
 * v2.7 added (the second-alternate code and the coding-system and value-set
 * OIDs), which v2.8 and v2.9 keep. Every component from the 10th onward is ALSO
 * kept verbatim on `extraComponents`, exactly as before the v2.7 components had
 * names, so code that reads them by position keeps working.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { CODED_ELEMENT_KEYS } from "./_coded.js";
import { readExtraComponents, readNamedComponents } from "./_shared.js";

/**
 * HL7 v2 Coded with Exceptions (CWE): coded element per HL7 Chapter 2. All 22
 * components are optional. Fields are OMITTED when the underlying component is
 * absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
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
 * Added at v2.7:
 * 10. secondAlternateIdentifier
 * 11. secondAlternateText
 * 12. nameOfSecondAlternateCodingSystem
 * 13. secondAlternateCodingSystemVersionId
 * 14. codingSystemOid
 * 15. valueSetOid
 * 16. valueSetVersionId (a DTM, kept as its raw text)
 * 17. alternateCodingSystemOid
 * 18. alternateValueSetOid
 * 19. alternateValueSetVersionId
 * 20. secondAlternateCodingSystemOid
 * 21. secondAlternateValueSetOid
 * 22. secondAlternateValueSetVersionId
 *
 * Components 10 onward are also surfaced verbatim, in order, on
 * `extraComponents`.
 *
 * @example
 * ```ts
 * import type { CWE } from "@cosyte/hl7";
 * const code: CWE = { identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" };
 * ```
 */
export interface CWE {
  /** CWE.1 Identifier. */
  readonly identifier?: string;
  /** CWE.2 Text. */
  readonly text?: string;
  /** CWE.3 Name of Coding System. */
  readonly nameOfCodingSystem?: string;
  /** CWE.4 Alternate Identifier. */
  readonly alternateIdentifier?: string;
  /** CWE.5 Alternate Text. */
  readonly alternateText?: string;
  /** CWE.6 Name of Alternate Coding System. */
  readonly nameOfAlternateCodingSystem?: string;
  /** CWE.7 Coding System Version ID. */
  readonly codingSystemVersionId?: string;
  /** CWE.8 Alternate Coding System Version ID. */
  readonly alternateCodingSystemVersionId?: string;
  /** CWE.9 Original Text. */
  readonly originalText?: string;
  /** CWE.10 Second Alternate Identifier (v2.7 and later). */
  readonly secondAlternateIdentifier?: string;
  /** CWE.11 Second Alternate Text (v2.7 and later). */
  readonly secondAlternateText?: string;
  /** CWE.12 Name of Second Alternate Coding System (v2.7 and later). */
  readonly nameOfSecondAlternateCodingSystem?: string;
  /** CWE.13 Second Alternate Coding System Version ID (v2.7 and later). */
  readonly secondAlternateCodingSystemVersionId?: string;
  /** CWE.14 Coding System OID (v2.7 and later). */
  readonly codingSystemOid?: string;
  /** CWE.15 Value Set OID (v2.7 and later). */
  readonly valueSetOid?: string;
  /** CWE.16 Value Set Version ID, a DTM kept as its raw text (v2.7 and later). */
  readonly valueSetVersionId?: string;
  /** CWE.17 Alternate Coding System OID (v2.7 and later). */
  readonly alternateCodingSystemOid?: string;
  /** CWE.18 Alternate Value Set OID (v2.7 and later). */
  readonly alternateValueSetOid?: string;
  /** CWE.19 Alternate Value Set Version ID, raw DTM text (v2.7 and later). */
  readonly alternateValueSetVersionId?: string;
  /** CWE.20 Second Alternate Coding System OID (v2.7 and later). */
  readonly secondAlternateCodingSystemOid?: string;
  /** CWE.21 Second Alternate Value Set OID (v2.7 and later). */
  readonly secondAlternateValueSetOid?: string;
  /** CWE.22 Second Alternate Value Set Version ID, raw DTM text (v2.7 and later). */
  readonly secondAlternateValueSetVersionId?: string;
  /**
   * Every component from the 10th onward (HL7 component 10 on), preserved
   * verbatim and in order, as it was before components 10 to 22 had names.
   * OMITTED when the element has no components past the 9th. An absent interior
   * component is preserved as `""` so `extraComponents[i]` maps to HL7
   * component `10 + i`. Components 10 to 22 are also on the named fields above;
   * this array is the only place a component past the 22nd appears.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 CWE repetition into a structured `CWE` object. Components
 * are returned verbatim (already decoded once by the tokenizer: never
 * re-unescaped). Absent / empty components are OMITTED
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
  const out: { -readonly [K in keyof CWE]?: CWE[K] } = readNamedComponents(
    rep,
    CODED_ELEMENT_KEYS,
    enc,
  );
  // Kept from the 10th component on, as before components 10 to 22 had names.
  const extraComponents = readExtraComponents(rep, 9, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
