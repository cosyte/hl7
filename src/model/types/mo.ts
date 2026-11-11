/**
 * MO: HL7 v2 Money composite, parsed from a `RawRepetition` on demand by
 * `Field.asMo()`. Fields are OMITTED when absent (exactOptionalPropertyTypes),
 * NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readExtraComponents, readNamedComponents } from "./_shared.js";

/** MO component names in HL7 order. @internal */
const MO_KEYS = ["quantity", "denomination"] as const;

/**
 * HL7 v2 Money (MO): an amount and its currency, per HL7 Chapter 2. Both
 * components are optional.
 *
 * The amount stays the text the sender wrote and is never turned into a
 * JavaScript `number`: a float cannot hold every decimal amount exactly, and a
 * price rounded on the way in is a quiet error nobody sees.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. quantity (an NM, kept as its text, e.g. "150.00")
 * 2. denomination (ISO 4217 currency code, e.g. "USD")
 *
 * @example
 * ```ts
 * import type { MO } from "@cosyte/hl7";
 * const fee: MO = { quantity: "150.00", denomination: "USD" };
 * ```
 */
export interface MO {
  /** MO.1 Quantity, the amount as written. */
  readonly quantity?: string;
  /** MO.2 Denomination, the currency code. */
  readonly denomination?: string;
  /**
   * Components past the 2nd, preserved verbatim and in order. OMITTED when
   * there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 MO repetition into a structured `MO` object. Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseMo, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["150.00"] }, { subcomponents: ["USD"] }] };
 * const mo = parseMo(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(mo.quantity, mo.denomination); // "150.00" "USD"
 * ```
 */
export function parseMo(rep: RawRepetition, enc: EncodingCharacters): MO {
  const out: { -readonly [K in keyof MO]?: MO[K] } = readNamedComponents(rep, MO_KEYS, enc);
  const extraComponents = readExtraComponents(rep, MO_KEYS.length, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
