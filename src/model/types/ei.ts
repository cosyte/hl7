/**
 * EI: HL7 v2 Entity Identifier composite, parsed from a `RawRepetition` on
 * demand by `Field.asEi()`. EI names one thing (an order, a message profile, a
 * specimen) by an identifier and the authority that assigned it. Fields are
 * OMITTED when absent (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readExtraComponents, readNamedComponents } from "./_shared.js";

/** EI component names in HL7 order. @internal */
const EI_KEYS = ["entityIdentifier", "namespaceId", "universalId", "universalIdType"] as const;

/**
 * HL7 v2 Entity Identifier (EI): per HL7 Chapter 2. All 4 components are
 * optional. Fields are OMITTED when the underlying component is absent.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. entityIdentifier: the identifier itself (e.g. a placer order number).
 * 2. namespaceId: the assigning authority's local name.
 * 3. universalId: the assigning authority's universal id (an OID, a UUID).
 * 4. universalIdType: what kind of id `universalId` is (ISO, UUID, DNS, ...).
 *
 * Components 2 to 4 are the assigning authority, the same three parts as an
 * `HD`. Used by MSH-21 (message profile identifier), OBR-2 and OBR-3, ORC-2 and
 * ORC-3 (placer and filler order numbers), among many others.
 *
 * @example
 * ```ts
 * import type { EI } from "@cosyte/hl7";
 * const order: EI = { entityIdentifier: "PL-1001", namespaceId: "CLINIC", universalId: "2.16.840.1.113883.19.5", universalIdType: "ISO" };
 * ```
 */
export interface EI {
  /** EI.1 Entity Identifier. */
  readonly entityIdentifier?: string;
  /** EI.2 Namespace ID. */
  readonly namespaceId?: string;
  /** EI.3 Universal ID. */
  readonly universalId?: string;
  /** EI.4 Universal ID Type. */
  readonly universalIdType?: string;
  /**
   * Components past the 4th, preserved verbatim and in order. OMITTED when
   * there are none. `extraComponents[i]` maps to HL7 component `5 + i`.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 EI repetition into a structured `EI` object. Components are
 * returned verbatim (already decoded once by the tokenizer). Absent or empty
 * components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseEi, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["PL-1001"] },
 *   { subcomponents: ["CLINIC"] },
 * ] };
 * const ei = parseEi(rep, DEFAULT_ENCODING_CHARACTERS);
 * const id = ei.entityIdentifier; // "PL-1001", synthetic
 * console.log(ei.namespaceId); // "CLINIC"
 * ```
 */
export function parseEi(rep: RawRepetition, enc: EncodingCharacters): EI {
  const out: { -readonly [K in keyof EI]?: EI[K] } = readNamedComponents(rep, EI_KEYS, enc);
  const extraComponents = readExtraComponents(rep, EI_KEYS.length, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
