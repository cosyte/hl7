/**
 * EIP: HL7 v2 Entity Identifier Pair composite, parsed from a `RawRepetition`
 * on demand by `Field.asEip()`. Each of its two components is a whole EI,
 * whose parts arrive as subcomponents. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readExtraComponents, readNestedComposite } from "./_shared.js";
import { parseEi, type EI } from "./ei.js";

/**
 * HL7 v2 Entity Identifier Pair (EIP): the placer's and the filler's
 * identifier for the same thing, per HL7 Chapter 2. Both components are
 * optional nested EIs.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. placerAssignedIdentifier (nested EI: its 4 parts are subcomponents)
 * 2. fillerAssignedIdentifier (nested EI)
 *
 * Used by ORC-8 (parent order), OBR-29 (parent), SPM-2 (specimen identifier)
 * and others.
 *
 * @example
 * ```ts
 * import type { EIP } from "@cosyte/hl7";
 * const parent: EIP = {
 *   placerAssignedIdentifier: { entityIdentifier: "PL-1001", namespaceId: "CLINIC" },
 *   fillerAssignedIdentifier: { entityIdentifier: "FL-2002", namespaceId: "LAB" },
 * };
 * ```
 */
export interface EIP {
  /** EIP.1 Placer Assigned Identifier (EI). */
  readonly placerAssignedIdentifier?: EI;
  /** EIP.2 Filler Assigned Identifier (EI). */
  readonly fillerAssignedIdentifier?: EI;
  /**
   * Components past the 2nd, preserved verbatim (first subcomponent of each)
   * and in order. OMITTED when there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 EIP repetition into a structured `EIP` object. Each
 * component is read as a nested EI from its subcomponents; an empty one is
 * OMITTED.
 *
 * @example
 * ```ts
 * import { parseEip, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["PL-1001", "CLINIC"] },
 *   { subcomponents: ["FL-2002", "LAB"] },
 * ] };
 * const eip = parseEip(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(eip.fillerAssignedIdentifier?.entityIdentifier); // "FL-2002"
 * ```
 */
export function parseEip(rep: RawRepetition, enc: EncodingCharacters): EIP {
  const out: { -readonly [K in keyof EIP]?: EIP[K] } = {};
  const placer = readNestedComposite(rep.components[0], parseEi, enc);
  if (placer !== undefined) out.placerAssignedIdentifier = placer;
  const filler = readNestedComposite(rep.components[1], parseEi, enc);
  if (filler !== undefined) out.fillerAssignedIdentifier = filler;
  const extraComponents = readExtraComponents(rep, 2, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
