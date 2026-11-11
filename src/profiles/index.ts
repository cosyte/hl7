/**
 * Public barrel for the `@cosyte/hl7` profile subsystem. Assembles
 * the `profiles` namespace object (8 built-ins) and re-exports the public
 * profile API: `defineProfile`, `setDefaultProfile`, `getDefaultProfile`,
 * the two type exports `DefineProfileOptions` and `CustomSegmentDefinition`,
 * and the typed-field-name types (`DefinedProfile`, `ProfileFieldName`,
 * `ProfiledMessage`) that carry a profile's declarations to the compiler.
 *
 * Individual built-ins are NOT top-level named exports,
 * consumers access them via `profiles.epic`, `profiles.cerner`, etc.
 * ("epic" is too generic a name for a top-level export.)
 */

export { defineProfile } from "./define.js";
export type { DefineProfileOptions, CustomSegmentDefinition } from "./define.js";
export type { DefinedProfile, ProfileFieldName, ProfiledMessage } from "./typed-fields.js";
export { setDefaultProfile, getDefaultProfile } from "./default.js";

import type { Profile } from "../parser/types.js";

import { athena } from "./athena.js";
import { cerner } from "./cerner.js";
import { epic } from "./epic.js";
import { genericLab } from "./genericLab.js";
import { meditech } from "./meditech.js";
import { philips } from "./philips.js";
import { va } from "./va.js";
import { visage } from "./visage.js";

/** Each built-in profile once built, keyed by the function that builds it. */
const built = new Map<() => Profile, Profile>();

/**
 * The built-in profile `make` builds, built on the first read and the same
 * object on every read after it.
 */
function builtIn<P extends Profile>(make: () => P): P {
  let profile = built.get(make) as P | undefined;
  if (profile === undefined) {
    profile = make();
    built.set(make, profile);
  }
  return profile;
}

/**
 * Namespace object exposing the 8 shipped built-in vendor profiles (epic,
 * cerner, meditech, athena, genericLab, visage, philips, va). Each is authored
 * via the public `defineProfile()` API, and built the first time it is read
 * rather than when the package is imported: a read returns the same frozen
 * profile every time.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7";
 * const msg = parseHL7(raw, profiles.epic);
 * console.log(msg.profile?.name); // "epic"
 * ```
 */
export const profiles: {
  readonly athena: ReturnType<typeof athena>;
  readonly cerner: ReturnType<typeof cerner>;
  readonly epic: ReturnType<typeof epic>;
  readonly genericLab: ReturnType<typeof genericLab>;
  readonly meditech: ReturnType<typeof meditech>;
  readonly philips: ReturnType<typeof philips>;
  readonly va: ReturnType<typeof va>;
  readonly visage: ReturnType<typeof visage>;
} = Object.freeze({
  get athena() {
    return builtIn(athena);
  },
  get cerner() {
    return builtIn(cerner);
  },
  get epic() {
    return builtIn(epic);
  },
  get genericLab() {
    return builtIn(genericLab);
  },
  get meditech() {
    return builtIn(meditech);
  },
  get philips() {
    return builtIn(philips);
  },
  get va() {
    return builtIn(va);
  },
  get visage() {
    return builtIn(visage);
  },
});
