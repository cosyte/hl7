/**
 * Barrel for the conformance-profile engine. Re-exports the
 * engine, the fail-fast profile-authoring gate, and the public types. Also
 * available as the `conformance` namespace object from the package root.
 *
 * @see validateAgainstProfile: run a user-authored profile against a message.
 * @see defineConformanceProfile: optional fail-fast profile-authoring gate.
 * @see usageOutcomes: read a declared conditional's true and false outcomes.
 * @see ConditionPredicate: the computable test that decides a conditional usage.
 */

export { validateAgainstProfile } from "./validate-against-profile.js";
export { collectProfileDefects, defineConformanceProfile } from "./profile-shape.js";
export type { ProfileDefect } from "./profile-shape.js";
export { usageOutcomes } from "./usage.js";
export {
  FINDING_CODES,
  PREDICATE_CONNECTORS,
  PREDICATE_VERBS,
  USAGE_CODES,
  type Cardinality,
  type ComparisonPredicate,
  type ConditionPredicate,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type ConnectedPredicate,
  type DeclaredConditionalUsage,
  type FieldRule,
  type FindingCode,
  type FindingLocus,
  type FindingSeverity,
  type PredicateConnector,
  type PredicateLocation,
  type PredicatePresence,
  type PredicateVerb,
  type PresencePredicate,
  type SegmentRule,
  type SimpleUsageCode,
  type UsageCode,
  type UsageCodeRegistryEntry,
  type UsageOutcomes,
  type UsageResolution,
} from "./types.js";
