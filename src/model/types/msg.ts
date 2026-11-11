/**
 * MSG: HL7 v2 Message Type composite, parsed from a `RawRepetition` on demand
 * by `Field.asMsg()`. Fields are OMITTED when absent
 * (exactOptionalPropertyTypes), NEVER set to `undefined`.
 *
 * Zero runtime deps: pure function over the raw positional tree.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readExtraComponents, readNamedComponents } from "./_shared.js";

/** MSG component names in HL7 order. @internal */
const MSG_KEYS = ["messageCode", "triggerEvent", "messageStructure"] as const;

/**
 * HL7 v2 Message Type (MSG): per HL7 Chapter 2. All 3 components are
 * optional.
 *
 * Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
 * 1. messageCode (HL7 Table 0076, e.g. "ADT")
 * 2. triggerEvent (HL7 Table 0003, e.g. "A01")
 * 3. messageStructure (HL7 Table 0354, e.g. "ADT_A01")
 *
 * Used by MSH-9. `msg.meta` reads the same three parts as flat strings.
 *
 * @example
 * ```ts
 * import type { MSG } from "@cosyte/hl7";
 * const type: MSG = { messageCode: "ADT", triggerEvent: "A01", messageStructure: "ADT_A01" };
 * ```
 */
export interface MSG {
  /** MSG.1 Message Code. */
  readonly messageCode?: string;
  /** MSG.2 Trigger Event. */
  readonly triggerEvent?: string;
  /** MSG.3 Message Structure. */
  readonly messageStructure?: string;
  /**
   * Components past the 3rd, preserved verbatim and in order. OMITTED when
   * there are none.
   */
  readonly extraComponents?: readonly string[];
}

/**
 * Parse an HL7 v2 MSG repetition into a structured `MSG` object. Absent or
 * empty components are OMITTED from the result.
 *
 * @example
 * ```ts
 * import { parseMsg, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["ORU"] }, { subcomponents: ["R01"] }] };
 * const type = parseMsg(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(type.messageCode, type.triggerEvent); // "ORU" "R01"
 * ```
 */
export function parseMsg(rep: RawRepetition, enc: EncodingCharacters): MSG {
  const out: { -readonly [K in keyof MSG]?: MSG[K] } = readNamedComponents(rep, MSG_KEYS, enc);
  const extraComponents = readExtraComponents(rep, MSG_KEYS.length, enc);
  if (extraComponents !== undefined) out.extraComponents = extraComponents;
  return out;
}
