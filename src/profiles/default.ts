/**
 * Process-scoped default profile management (PROF-08 / D-18). This module
 * holds the first mutable module-scoped state in the codebase — an
 * intentional trade-off documented in PROJECT.md Key Decisions:
 * `setDefaultProfile` EXISTS but is DISCOURAGED. It is scoped to the
 * current Node process, NOT shared across workers, NOT a symbol-keyed
 * globalThis registry, and NOT reset between test files automatically.
 *
 * Tests that touch the default profile MUST clean up in `afterEach` /
 * `afterAll` (`setDefaultProfile(null)`) to prevent cross-test bleed.
 *
 * Zero runtime deps. Single `let` variable; no class, no registry object,
 * no magic.
 */

import type { Profile } from "../parser/types.js";

/**
 * Process-scoped default profile. `undefined` means "unset" (the initial
 * state). `null` is not a stable stored value — `setDefaultProfile(null)`
 * resets this to `undefined` per D-18.
 * @internal
 */
let _defaultProfile: Profile | undefined = undefined;

/**
 * Register a process-scoped default profile. `parseHL7(raw)` (with no
 * explicit profile arg) consults `getDefaultProfile()` and applies the
 * returned profile if any. Pass `null` (or `undefined`) to clear.
 *
 * Effects are IDENTICAL to passing the profile explicitly as the second
 * arg of `parseHL7` (D-20): customSegments, dateFormats, onWarning chain,
 * and profile attribution all apply the same way.
 *
 * Explicit args ALWAYS win — `parseHL7(raw, myProfile)` uses `myProfile`
 * regardless of the default; `parseHL7(raw, { profile: null })` opts out
 * of the default for a single call without changing the registered
 * default.
 *
 * **Test hygiene:** This is the ONLY mutable module-scoped state in the
 * library. Tests that call `setDefaultProfile` MUST clean up in
 * `afterEach` (`setDefaultProfile(null)`) or default-profile bleed will
 * infect subsequent tests.
 *
 * @example
 * ```ts
 * import { setDefaultProfile, profiles, parseHL7 } from "@cosyte/hl7-parser";
 *
 * // Set once at app startup
 * setDefaultProfile(profiles.epic);
 *
 * // Every parseHL7 call in the app now uses profiles.epic unless
 * // another profile is passed explicitly.
 * const msg = parseHL7(raw);
 * console.log(msg.profile?.name); // "epic"
 *
 * // Clear when done (or in test teardown):
 * setDefaultProfile(null);
 * ```
 */
export function setDefaultProfile(profile: Profile | null): void {
  // Accept `undefined` defensively — TypeScript narrows to `Profile | null`,
  // but a JS caller may pass `undefined`. Treat it like null (clear).
  _defaultProfile = profile ?? undefined;
}

/**
 * Return the current default profile, or `undefined` if none is
 * registered. Consistent with `msg.profile` convention — `undefined`
 * rather than `null`.
 *
 * @example
 * ```ts
 * import { getDefaultProfile } from "@cosyte/hl7-parser";
 * const p = getDefaultProfile();
 * if (p !== undefined) console.log("default profile:", p.name);
 * ```
 */
export function getDefaultProfile(): Profile | undefined {
  return _defaultProfile;
}
