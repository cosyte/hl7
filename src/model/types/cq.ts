/**
 * CQ: HL7 v2 Composite Quantity with Units, parsed from a `RawRepetition` on
 * demand by `Field.asCq()`. Its units are a nested coded element read from the
 * subcomponents of the second component. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent, readExtraComponents, readNestedComposite } from "./_shared.js";
import { parseCwe, type CWE } from "./cwe.js";

/**
 * HL7 v2 Composite Quantity with Units (CQ): a quantity and its unit, per HL7
 * Chapter 2. Both components are optional. The quantity stays the text the
 * sender wrote, never a JavaScript `number`.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. quantity (an NM, kept as its text, e.g. "2")
 * 2. units (nested coded element: a CE at v2.5, a CWE from v2.6; read as a
 *    CWE, whose first six parts are the CE's)
 *
 * Used by TQ1-2 (quantity) and other quantity-with-unit fields.
 *
 * @example
 * ```ts
 * import type { CQ } from "@cosyte/hl7";
 * const dose: CQ = { quantity: "2", units: { identifier: "TAB", text: "tablet" } };
 * ```
 */
export interface CQ {
  /** CQ.1 Quantity, as written. */
  readonly quantity?: string;
  /** CQ.2 Units (nested coded element). */
  readonly units?: CWE;
  /**
   * Components past the 2nd, preserved verbatim (first subcomponent of each)
   * and in order. OMITTED when there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 CQ repetition into a structured `CQ` object. Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseCq, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["2"] }, { subcomponents: ["TAB", "tablet"] }] };
 * const cq = parseCq(rep, DEFAULT_ENCODING_CHARACTERS);
 * cq.quantity; // "2"
 * cq.units?.identifier; // "TAB"
 * ```
 */
export function parseCq(rep: RawRepetition, enc: EncodingCharacters): CQ {
  const out: { -readonly [K in keyof CQ]?: CQ[K] } = {};

  const quantity = readComponent(rep, 0, enc);
  if (quantity !== undefined) out.quantity = quantity;

  const units = readNestedComposite(rep.components[1], parseCwe, enc);
  if (units !== undefined) out.units = units;

  const extraComponents = readExtraComponents(rep, 2, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;

  return out;
}
