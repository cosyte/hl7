/**
 * The profile-LEVEL grammar for the conformance engine: which levels a profile
 * may claim, which usage codes a claim of `implementable` admits, and which
 * level a result echoes as the one in force.
 *
 * A profile's level is either one of the three {@link ProfileLevel}s or absent.
 * An ABSENT level is not a level: it is not refused, and it means
 * `constrainable`, the weaker of the two claims a working profile can make. So
 * a profile that says nothing about its level never reads as an implementable
 * one, and no profile authored before the declaration existed is newly refused.
 *
 * @internal (`PROFILE_LEVELS` is re-exported from the package root)
 */

import { PROFILE_LEVELS, type ProfileLevel, type SimpleUsageCode } from "./types.js";
import { isRecord, parseUsageToken } from "./usage.js";

/**
 * The level a result echoes when the profile declares none, and the level a
 * refused `implementable` claim falls back to.
 *
 * `constrainable` on both counts, and for one reason: it is the level at which
 * not all aspects of an interface can be determined, so reading a result at it
 * concedes that parts of the message may never have been assessed. That is the
 * fail-safe direction. The other direction, echoing `implementable` over an
 * assessment nothing verified, is a consumer being told an assessment was
 * complete when it was not.
 *
 * @internal
 */
export const DEFAULT_PROFILE_LEVEL: ProfileLevel = "constrainable";

/**
 * The usage codes an IMPLEMENTABLE profile admits per element. The
 * methodology's own terminus: in an implementable profile ultimately only two
 * possibilities are allowed, either a specific element is supported (`R` or
 * `RE`) or it is not (`X`); and for a conditional usage the true and false
 * outcomes must also be defined only as `R`, `RE` or `X`.
 *
 * @internal
 */
export const IMPLEMENTABLE_USAGE_CODES: readonly SimpleUsageCode[] = Object.freeze([
  "R",
  "RE",
  "X",
]);

/**
 * Is `value` one of the three profile levels? Total over `unknown`, so a value
 * of any type reaching the engine through an unchecked cast answers `false`
 * rather than being narrowed on trust.
 *
 * @internal
 */
export function isProfileLevel(value: unknown): value is ProfileLevel {
  return typeof value === "string" && (PROFILE_LEVELS as readonly string[]).includes(value);
}

/**
 * The level a candidate profile DECLARES, or `undefined` when it declares none
 * the grammar admits.
 *
 * Total over `unknown` and deliberately undiscerning about WHY it declares
 * none: an absent level, a level of the wrong type and a level spelled with a
 * token outside the three all answer `undefined` here, because all three leave
 * the engine with no level it can act on. Which of them it was is the
 * profile-shape collector's question, and it is the one that reports it.
 *
 * @internal
 */
export function declaredLevel(profile: unknown): ProfileLevel | undefined {
  if (!isRecord(profile)) return undefined;
  const level = profile["level"];
  return isProfileLevel(level) ? level : undefined;
}

/**
 * Does this profile claim the implementable level, and so invite the gate?
 *
 * Only an exact claim of `implementable` opens it. The two weaker levels are
 * DEFINED as leaving optionality in place, so neither imposes anything on any
 * element, and a level the grammar does not admit at all is a defect in its own
 * right rather than a claim to be enforced.
 *
 * @internal
 */
export function claimsImplementable(profile: unknown): boolean {
  return declaredLevel(profile) === "implementable";
}

/**
 * The level in force for a result: the level the profile declared, except that
 * a REFUSED `implementable` claim falls back to
 * {@link DEFAULT_PROFILE_LEVEL}.
 *
 * `claimRefused` is "this run returned `PROFILE_MALFORMED` findings instead of
 * assessing the message", which is broader than "a level-derived defect fired"
 * on purpose. A profile the engine refused to run was not assessed at all, and
 * a defect anywhere in it can stop the level gate from ever reaching the rules
 * below it (a segment whose name is unreadable carries field rules nothing
 * walked). Echoing `implementable` over that would report a complete assessment
 * of a message the engine never looked at.
 *
 * A claim of `standard` or `constrainable` is echoed as declared whatever else
 * is wrong with the profile: neither level asserts anything about an element,
 * so neither can be refused.
 *
 * @internal
 */
export function levelInForce(profile: unknown, claimRefused: boolean): ProfileLevel {
  const declared = declaredLevel(profile);
  if (declared === undefined) return DEFAULT_PROFILE_LEVEL;
  if (declared === "implementable" && claimRefused) return DEFAULT_PROFILE_LEVEL;
  return declared;
}

/**
 * Is a usage token one an IMPLEMENTABLE profile admits? A simple code drawn
 * from {@link IMPLEMENTABLE_USAGE_CODES}, or a declared conditional both of
 * whose outcomes are.
 *
 * A token the declarable-usage grammar does not admit at all answers `false`,
 * but the caller reports nothing for it: the usage check has already named it,
 * and a level complaint derived from a token that means nothing would only
 * restate that.
 *
 * @internal
 */
export function usageIsImplementable(token: string): boolean {
  const parsed = parseUsageToken(token);
  if (parsed === undefined) return false;
  const admits = (code: SimpleUsageCode): boolean => IMPLEMENTABLE_USAGE_CODES.includes(code);
  if (parsed.kind === "simple") return admits(parsed.code);
  return admits(parsed.whenTrue) && admits(parsed.whenFalse);
}
