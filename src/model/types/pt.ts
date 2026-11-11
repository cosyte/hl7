/**
 * PT: HL7 v2 Processing Type composite, parsed from a `RawRepetition` on
 * demand by `Field.asPt()`. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readExtraComponents, readNamedComponents } from "./_shared.js";

/** PT component names in HL7 order. @internal */
const PT_KEYS = ["processingId", "processingMode"] as const;

/**
 * HL7 v2 Processing Type (PT): per HL7 Chapter 2. Both components are
 * optional.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. processingId (HL7 Table 0103: P production, T training, D debugging)
 * 2. processingMode (HL7 Table 0207: A archive, R restore, I initial load,
 *    T current processing; empty means current processing)
 *
 * Used by MSH-11. `msg.meta.processingId` keeps reading MSH-11.1 alone.
 *
 * @example
 * ```ts
 * import type { PT } from "@cosyte/hl7";
 * const processing: PT = { processingId: "P", processingMode: "T" };
 * ```
 */
export interface PT {
  /** PT.1 Processing ID. */
  readonly processingId?: string;
  /** PT.2 Processing Mode. */
  readonly processingMode?: string;
  /**
   * Components past the 2nd, preserved verbatim and in order. OMITTED when
   * there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 PT repetition into a structured `PT` object. Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parsePt, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["P"] }, { subcomponents: ["T"] }] };
 * const pt = parsePt(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(pt.processingId, pt.processingMode); // "P" "T"
 * ```
 */
export function parsePt(rep: RawRepetition, enc: EncodingCharacters): PT {
  const out: { -readonly [K in keyof PT]?: PT[K] } = readNamedComponents(rep, PT_KEYS, enc);
  const extraComponents = readExtraComponents(rep, PT_KEYS.length, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
