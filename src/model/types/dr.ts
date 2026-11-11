/**
 * DR: HL7 v2 Date/Time Range composite, parsed from a `RawRepetition` on
 * demand by `Field.asDr()`. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readExtraComponents, readNamedComponents } from "./_shared.js";

/** DR component names in HL7 order. @internal */
const DR_KEYS = ["rangeStartDateTime", "rangeEndDateTime"] as const;

/**
 * HL7 v2 Date/Time Range (DR): per HL7 Chapter 2. Both components are
 * optional, and each is kept as the raw datetime text the sender wrote: read it
 * with the same care as any HL7 datetime (`parseDtm` keeps its precision and
 * timezone). A range with only a start is open-ended.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. rangeStartDateTime (a TS at v2.5, a DTM from v2.6; the time itself)
 * 2. rangeEndDateTime
 *
 * At v2.5 each endpoint is a TS whose second part (degree of precision) is a
 * subcomponent; that part was deprecated at v2.5 and is not read.
 *
 * @example
 * ```ts
 * import type { DR } from "@cosyte/hl7";
 * const range: DR = { rangeStartDateTime: "20260101", rangeEndDateTime: "20261231" };
 * ```
 */
export interface DR {
  /** DR.1 Range Start Date/Time, raw datetime text. */
  readonly rangeStartDateTime?: string;
  /** DR.2 Range End Date/Time, raw datetime text. */
  readonly rangeEndDateTime?: string;
  /**
   * Components past the 2nd, preserved verbatim and in order. OMITTED when
   * there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 DR repetition into a structured `DR` object. Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseDr, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["20260101"] }, { subcomponents: ["20261231"] }] };
 * const dr = parseDr(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(dr.rangeStartDateTime, dr.rangeEndDateTime); // "20260101" "20261231"
 * ```
 */
export function parseDr(rep: RawRepetition, enc: EncodingCharacters): DR {
  const out: { -readonly [K in keyof DR]?: DR[K] } = readNamedComponents(rep, DR_KEYS, enc);
  const extraComponents = readExtraComponents(rep, DR_KEYS.length, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
