# conformance

The conformance-profile engine as one namespace object: `validateAgainstProfile`,
`defineConformanceProfile`, `collectProfileDefects`, `usageOutcomes`, the registries and the
profile types, each also a named export of the package.

## Example

```ts
import { conformance, parseHL7 } from "@cosyte/hl7";

const profile: conformance.ConformanceProfile = {
  name: "intake",
  segments: [{ segment: "PID", usage: "R" }],
};
conformance.validateAgainstProfile(parseHL7(raw), profile).findings; // []
```

## References

### Cardinality

Re-exports [Cardinality](../../README.md#cardinality)

***

### ComparisonPredicate

Re-exports [ComparisonPredicate](../../README.md#comparisonpredicate)

***

### ComponentRule

Re-exports [ComponentRule](../../README.md#componentrule)

***

### ConditionPredicate

Re-exports [ConditionPredicate](../../README.md#conditionpredicate)

***

### ConformanceFinding

Re-exports [ConformanceFinding](../../README.md#conformancefinding)

***

### ConformanceProfile

Re-exports [ConformanceProfile](../../README.md#conformanceprofile)

***

### ConformanceResult

Re-exports [ConformanceResult](../../README.md#conformanceresult)

***

### ConnectedPredicate

Re-exports [ConnectedPredicate](../../README.md#connectedpredicate)

***

### DeclaredConditionalUsage

Re-exports [DeclaredConditionalUsage](../../README.md#declaredconditionalusage)

***

### defineConformanceProfile

Re-exports [defineConformanceProfile](../../README.md#defineconformanceprofile)

***

### FieldRule

Re-exports [FieldRule](../../README.md#fieldrule)

***

### FINDING\_CODES

Re-exports [FINDING_CODES](../../README.md#finding_codes)

***

### FindingCode

Re-exports [FindingCode](../../README.md#findingcode)

***

### FindingLocus

Re-exports [FindingLocus](../../README.md#findinglocus)

***

### FindingSeverity

Re-exports [FindingSeverity](../../README.md#findingseverity)

***

### PREDICATE\_CONNECTORS

Re-exports [PREDICATE_CONNECTORS](../../README.md#predicate_connectors)

***

### PREDICATE\_VERBS

Re-exports [PREDICATE_VERBS](../../README.md#predicate_verbs)

***

### PredicateConnector

Re-exports [PredicateConnector](../../README.md#predicateconnector)

***

### PredicateLocation

Re-exports [PredicateLocation](../../README.md#predicatelocation)

***

### PredicatePresence

Re-exports [PredicatePresence](../../README.md#predicatepresence)

***

### PredicateVerb

Re-exports [PredicateVerb](../../README.md#predicateverb)

***

### PresencePredicate

Re-exports [PresencePredicate](../../README.md#presencepredicate)

***

### PROFILE\_LEVELS

Re-exports [PROFILE_LEVELS](../../README.md#profile_levels)

***

### ProfileLevel

Re-exports [ProfileLevel](../../README.md#profilelevel)

***

### SegmentRule

Re-exports [SegmentRule](../../README.md#segmentrule)

***

### SimpleUsageCode

Re-exports [SimpleUsageCode](../../README.md#simpleusagecode)

***

### USAGE\_CODES

Re-exports [USAGE_CODES](../../README.md#usage_codes)

***

### UsageCode

Re-exports [UsageCode](../../README.md#usagecode)

***

### UsageCodeRegistryEntry

Re-exports [UsageCodeRegistryEntry](../../README.md#usagecoderegistryentry)

***

### usageOutcomes

Re-exports [usageOutcomes](../../README.md#usageoutcomes-1)

***

### UsageOutcomes

Re-exports [UsageOutcomes](../../README.md#usageoutcomes)

***

### UsageResolution

Re-exports [UsageResolution](../../README.md#usageresolution)

***

### validateAgainstProfile

Re-exports [validateAgainstProfile](../../README.md#validateagainstprofile)
