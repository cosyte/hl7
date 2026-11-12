/**
 * VID: HL7 v2 Version Identifier composite, parsed from a `RawRepetition` on
 * demand by `Field.asVid()`. Its two coded parts are nested coded elements,
 * each read from the subcomponents of one component. Fields are OMITTED when
 * absent (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent, readExtraComponents, readNestedComposite } from "./_shared.js";
import { parseCwe, type CWE } from "./cwe.js";

/**
 * HL7 v2 Version Identifier (VID): the HL7 version a message claims, per HL7
 * Chapter 2. All 3 components are optional.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. versionId (HL7 Table 0104, e.g. "2.5.1")
 * 2. internationalizationCode (nested coded element: a CE at v2.5, a CWE from
 *    v2.6; read as a CWE)
 * 3. internationalVersionId (nested coded element, read as a CWE)
 *
 * Used by MSH-12. `msg.meta.version` keeps reading MSH-12.1 alone.
 *
 * @example
 * ```ts
 * import type { VID } from "@cosyte/hl7";
 * const version: VID = { versionId: "2.5.1" };
 * ```
 */
export interface VID {
  /** VID.1 Version ID. */
  readonly versionId?: string;
  /** VID.2 Internationalization Code (nested coded element). */
  readonly internationalizationCode?: CWE;
  /** VID.3 International Version ID (nested coded element). */
  readonly internationalVersionId?: CWE;
  /**
   * Components past the 3rd, preserved verbatim (first subcomponent of each)
   * and in order. OMITTED when there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 VID repetition into a structured `VID` object. Absent or
 * empty components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseVid, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["2.5.1"] }, { subcomponents: ["USA"] }] };
 * const vid = parseVid(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(vid.versionId, vid.internationalizationCode?.identifier); // "2.5.1" "USA"
 * ```
 */
export function parseVid(rep: RawRepetition, enc: EncodingCharacters): VID {
  const out: { -readonly [K in keyof VID]?: VID[K] } = {};

  const versionId = readComponent(rep, 0, enc);
  if (versionId !== undefined) out.versionId = versionId;

  const internationalizationCode = readNestedComposite(rep.components[1], parseCwe, enc);
  if (internationalizationCode !== undefined) {
    out.internationalizationCode = internationalizationCode;
  }

  const internationalVersionId = readNestedComposite(rep.components[2], parseCwe, enc);
  if (internationalVersionId !== undefined) out.internationalVersionId = internationalVersionId;

  const extraComponents = readExtraComponents(rep, 3, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;

  return out;
}
