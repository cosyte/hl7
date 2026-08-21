/**
 * Barrel for the conformance-profile engine. Re-exports the
 * engine, the fail-fast profile-authoring gate, and the public types. Also
 * available as the `conformance` namespace object from the package root.
 *
 * @see validateAgainstProfile: run a user-authored profile against a message.
 * @see defineConformanceProfile: optional fail-fast profile-authoring gate.
 * @see usageOutcomes: read a declared conditional's true and false outcomes.
 */

export { validateAgainstProfile } from "./validate-against-profile.js";
export { collectProfileDefects, defineConformanceProfile } from "./profile-shape.js";
export type { ProfileDefect } from "./profile-shape.js";
export { usageOutcomes } from "./usage.js";
export {
  FINDING_CODES,
  USAGE_CODES,
  type Cardinality,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type DeclaredConditionalUsage,
  type FieldRule,
  type FindingCode,
  type FindingLocus,
  type FindingSeverity,
  type SegmentRule,
  type SimpleUsageCode,
  type UsageCode,
  type UsageCodeRegistryEntry,
  type UsageOutcomes,
  type UsageResolution,
} from "./types.js";
