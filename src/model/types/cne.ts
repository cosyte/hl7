/**
 * CNE: HL7 v2 Coded with No Exceptions composite, parsed from a
 * `RawRepetition` on demand by `Field.asCne()`. CNE has the same 22 components
 * as CWE; the difference is in the standard's rule, not the shape: a CNE value
 * must come from the named table, with no local code and no free text in place
 * of a code. The parser does not enforce that rule; it reads what was sent.
 *
 * Fields are OMITTED when absent (exactOptionalPropertyTypes), NEVER set to
 * `undefined`. A component past the 22nd is kept verbatim on
 * `extraComponents` rather than dropped.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { CODED_ELEMENT_KEYS } from "./_coded.js";
import { readExtraComponents, readNamedComponents } from "./_shared.js";

/**
 * HL7 v2 Coded with No Exceptions (CNE): coded element per HL7 Chapter 2, used
 * where the value must come from a published table. All 22 components are
 * optional here; they are the CWE components under the same names.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. identifier
 * 2. text
 * 3. nameOfCodingSystem
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
 * @example
 * ```ts
 * import type { CNE } from "@cosyte/hl7";
 * const code: CNE = { identifier: "Y", text: "Yes", nameOfCodingSystem: "HL70136" };
 * ```
 */
export interface CNE {
  /** CNE.1 Identifier. */
  readonly identifier?: string;
  /** CNE.2 Text. */
  readonly text?: string;
  /** CNE.3 Name of Coding System. */
  readonly nameOfCodingSystem?: string;
  /** CNE.4 Alternate Identifier. */
  readonly alternateIdentifier?: string;
  /** CNE.5 Alternate Text. */
  readonly alternateText?: string;
  /** CNE.6 Name of Alternate Coding System. */
  readonly nameOfAlternateCodingSystem?: string;
  /** CNE.7 Coding System Version ID. */
  readonly codingSystemVersionId?: string;
  /** CNE.8 Alternate Coding System Version ID. */
  readonly alternateCodingSystemVersionId?: string;
  /** CNE.9 Original Text. */
  readonly originalText?: string;
  /** CNE.10 Second Alternate Identifier (v2.7 and later). */
  readonly secondAlternateIdentifier?: string;
  /** CNE.11 Second Alternate Text (v2.7 and later). */
  readonly secondAlternateText?: string;
  /** CNE.12 Name of Second Alternate Coding System (v2.7 and later). */
  readonly nameOfSecondAlternateCodingSystem?: string;
  /** CNE.13 Second Alternate Coding System Version ID (v2.7 and later). */
  readonly secondAlternateCodingSystemVersionId?: string;
  /** CNE.14 Coding System OID (v2.7 and later). */
  readonly codingSystemOid?: string;
  /** CNE.15 Value Set OID (v2.7 and later). */
  readonly valueSetOid?: string;
  /** CNE.16 Value Set Version ID, a DTM kept as its raw text (v2.7 and later). */
  readonly valueSetVersionId?: string;
  /** CNE.17 Alternate Coding System OID (v2.7 and later). */
  readonly alternateCodingSystemOid?: string;
  /** CNE.18 Alternate Value Set OID (v2.7 and later). */
  readonly alternateValueSetOid?: string;
  /** CNE.19 Alternate Value Set Version ID, raw DTM text (v2.7 and later). */
  readonly alternateValueSetVersionId?: string;
  /** CNE.20 Second Alternate Coding System OID (v2.7 and later). */
  readonly secondAlternateCodingSystemOid?: string;
  /** CNE.21 Second Alternate Value Set OID (v2.7 and later). */
  readonly secondAlternateValueSetOid?: string;
  /** CNE.22 Second Alternate Value Set Version ID, raw DTM text (v2.7 and later). */
  readonly secondAlternateValueSetVersionId?: string;
  /**
   * Components past the 22nd, preserved verbatim and in order. OMITTED when
   * there are none. An absent interior component is preserved as `""` so
   * `extraComponents[i]` maps to HL7 component `23 + i`.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 CNE repetition into a structured `CNE` object. Components
 * are returned verbatim (already decoded once by the tokenizer). Absent or
 * empty components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseCne, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["Y"] },
 *   { subcomponents: ["Yes"] },
 *   { subcomponents: ["HL70136"] },
 * ] };
 * const cne = parseCne(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(cne.identifier, cne.nameOfCodingSystem); // "Y" "HL70136"
 * ```
 */
export function parseCne(rep: RawRepetition, enc: EncodingCharacters): CNE {
  const out: { -readonly [K in keyof CNE]?: CNE[K] } = readNamedComponents(
    rep,
    CODED_ELEMENT_KEYS,
    enc,
  );
  const extraComponents = readExtraComponents(rep, CODED_ELEMENT_KEYS.length, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
