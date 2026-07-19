/**
 * Public barrel for the `@cosyte/hl7` profile subsystem. Assembles
 * the `profiles` namespace object (8 built-ins) and re-exports the public
 * profile API: `defineProfile`, `setDefaultProfile`, `getDefaultProfile`,
 * plus the two type exports `DefineProfileOptions` and
 * `CustomSegmentDefinition`.
 *
 * D-26 contract: individual built-ins are NOT top-level named exports —
 * consumers access them via `profiles.epic`, `profiles.cerner`, etc.
 * ("epic" is too generic a name for a top-level export.)
 */

export { defineProfile } from "./define.js";
export type { DefineProfileOptions, CustomSegmentDefinition } from "./define.js";
export { setDefaultProfile, getDefaultProfile } from "./default.js";

import { athena } from "./athena.js";
import { cerner } from "./cerner.js";
import { epic } from "./epic.js";
import { genericLab } from "./genericLab.js";
import { meditech } from "./meditech.js";
import { philips } from "./philips.js";
import { va } from "./va.js";
import { visage } from "./visage.js";

/**
 * Namespace object exposing the 8 shipped built-in vendor profiles (epic,
 * cerner, meditech, athena, genericLab, visage, philips, va). Each is authored
 * via the public `defineProfile()` API (BIP-01..09).
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.epic);
 * console.log(msg.profile?.name); // "epic"
 * ```
 */
export const profiles = Object.freeze({
  athena,
  cerner,
  epic,
  genericLab,
  meditech,
  philips,
  va,
  visage,
}) as {
  readonly athena: typeof athena;
  readonly cerner: typeof cerner;
  readonly epic: typeof epic;
  readonly genericLab: typeof genericLab;
  readonly meditech: typeof meditech;
  readonly philips: typeof philips;
  readonly va: typeof va;
  readonly visage: typeof visage;
};
