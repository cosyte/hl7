/**
 * CP: HL7 v2 Composite Price, parsed from a `RawRepetition` on demand by
 * `Field.asCp()`. Its price is a nested MO and its range units a nested coded
 * element, each read from the subcomponents of one component. Fields are
 * OMITTED when absent (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent, readExtraComponents, readNestedComposite } from "./_shared.js";
import { parseCwe, type CWE } from "./cwe.js";
import { parseMo, type MO } from "./mo.js";

/**
 * HL7 v2 Composite Price (CP): a price, optionally for a range of quantities,
 * per HL7 Chapter 2. All 6 components are optional. Amounts and range bounds
 * stay the text the sender wrote, never a JavaScript `number`.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. price (nested MO: quantity and denomination are subcomponents)
 * 2. priceType (HL7 Table 0205, e.g. "UP" unit price)
 * 3. fromValue (an NM, kept as its text)
 * 4. toValue (an NM, kept as its text)
 * 5. rangeUnits (nested coded element: a CE at v2.5, a CWE from v2.6; read as
 *    a CWE, whose first six parts are the CE's)
 * 6. rangeType (HL7 Table 0298, P pro-rate or F flat-rate)
 *
 * Used by FT1-11 and FT1-12 (transaction amounts) and PRC-5 (price).
 *
 * @example
 * ```ts
 * import type { CP } from "@cosyte/hl7";
 * const amount: CP = { price: { quantity: "150.00", denomination: "USD" }, priceType: "UP" };
 * ```
 */
export interface CP {
  /** CP.1 Price (nested MO). */
  readonly price?: MO;
  /** CP.2 Price Type. */
  readonly priceType?: string;
  /** CP.3 From Value, as written. */
  readonly fromValue?: string;
  /** CP.4 To Value, as written. */
  readonly toValue?: string;
  /** CP.5 Range Units (nested coded element). */
  readonly rangeUnits?: CWE;
  /** CP.6 Range Type. */
  readonly rangeType?: string;
  /**
   * Components past the 6th, preserved verbatim (first subcomponent of each)
   * and in order. OMITTED when there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 CP repetition into a structured `CP` object. Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseCp, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["150.00", "USD"] }, { subcomponents: ["UP"] }] };
 * const cp = parseCp(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(cp.price?.quantity, cp.price?.denomination, cp.priceType); // "150.00" "USD" "UP"
 * ```
 */
export function parseCp(rep: RawRepetition, enc: EncodingCharacters): CP {
  const out: { -readonly [K in keyof CP]?: CP[K] } = {};

  const price = readNestedComposite(rep.components[0], parseMo, enc);
  if (price !== undefined) out.price = price;

  const priceType = readComponent(rep, 1, enc);
  if (priceType !== undefined) out.priceType = priceType;

  const fromValue = readComponent(rep, 2, enc);
  if (fromValue !== undefined) out.fromValue = fromValue;

  const toValue = readComponent(rep, 3, enc);
  if (toValue !== undefined) out.toValue = toValue;

  const rangeUnits = readNestedComposite(rep.components[4], parseCwe, enc);
  if (rangeUnits !== undefined) out.rangeUnits = rangeUnits;

  const rangeType = readComponent(rep, 5, enc);
  if (rangeType !== undefined) out.rangeType = rangeType;

  const extraComponents = readExtraComponents(rep, 6, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;

  return out;
}
