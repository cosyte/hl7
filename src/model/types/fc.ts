/**
 * FC: HL7 v2 Financial Class composite, parsed from a `RawRepetition` on
 * demand by `Field.asFc()`. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent, readExtraComponents, readNestedComposite } from "./_shared.js";
import { parseCwe, type CWE } from "./cwe.js";

/**
 * HL7 v2 Financial Class (FC): per HL7 Chapter 2. Both components are
 * optional.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. financialClassCode (User Table 0064). An IS (a bare code) up to v2.6 and a
 *    CWE from v2.7; read as a nested coded element either way, so a v2.5 code
 *    arrives as `financialClassCode.identifier` and a v2.7 one keeps its text
 *    and coding system.
 * 2. effectiveDate (a TS at v2.5, a DTM from v2.6), the raw datetime text.
 *
 * Used by PV1-20.
 *
 * @example
 * ```ts
 * import type { FC } from "@cosyte/hl7";
 * const financialClass: FC = { financialClassCode: { identifier: "SP" }, effectiveDate: "20260101" };
 * ```
 */
export interface FC {
  /** FC.1 Financial Class Code (nested coded element). */
  readonly financialClassCode?: CWE;
  /** FC.2 Effective Date, raw datetime text. */
  readonly effectiveDate?: string;
  /**
   * Components past the 2nd, preserved verbatim (first subcomponent of each)
   * and in order. OMITTED when there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 FC repetition into a structured `FC` object. Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseFc, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["SP"] }, { subcomponents: ["20260101"] }] };
 * const fc = parseFc(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(fc.financialClassCode?.identifier, fc.effectiveDate); // "SP" "20260101"
 * ```
 */
export function parseFc(rep: RawRepetition, enc: EncodingCharacters): FC {
  const out: { -readonly [K in keyof FC]?: FC[K] } = {};

  const financialClassCode = readNestedComposite(rep.components[0], parseCwe, enc);
  if (financialClassCode !== undefined) out.financialClassCode = financialClassCode;

  const effectiveDate = readComponent(rep, 1, enc);
  if (effectiveDate !== undefined) out.effectiveDate = effectiveDate;

  const extraComponents = readExtraComponents(rep, 2, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;

  return out;
}
