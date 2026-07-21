/**
 * Barrel for the conformance-profile engine (roadmap Phase U). Re-exports the
 * engine, the fail-fast profile-authoring gate, and the public types. Also
 * available as the `conformance` namespace object from the package root.
 *
 * @see validateAgainstProfile — run a user-authored profile against a message.
 * @see defineConformanceProfile — optional fail-fast profile-authoring gate.
 */

export { validateAgainstProfile } from "./validate-against-profile.js";
export { collectProfileDefects, defineConformanceProfile } from "./profile-shape.js";
export type { ProfileDefect } from "./profile-shape.js";
export {
  FINDING_CODES,
  USAGE_CODES,
  type Cardinality,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type FieldRule,
  type FindingCode,
  type FindingLocus,
  type FindingSeverity,
  type SegmentRule,
  type UsageCode,
} from "./types.js";
