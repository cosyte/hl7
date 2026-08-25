/**
 * Public types for the conformance-profile engine. A
 * **consumer authors** a declarative {@link ConformanceProfile}: a bounded
 * subset of the HL7 v2 Message-Profile / NIST-IGAMT model (usage codes,
 * cardinality, length, value-set binding against a consumer-supplied code
 * list, condition predicates read against the message itself): and
 * {@link validateAgainstProfile} runs it against a parsed message, returning
 * typed {@link ConformanceFinding}s.
 *
 * This is the **sanctioned functionality-plane replacement for the retired
 * vendor-corpus arc**: instead of hl7 shipping vendor/IHE/regulatory profiles
 * or code sets, the consumer brings their own interface spec and hl7 validates
 * against it. hl7 ships **no** profile, **no** code set, and makes **no**
 * network call: the profile and every value set are supplied by the caller.
 *
 * Two invariants govern the whole surface:
 *
 * 1. **"No findings" is NOT a conformance attestation.** An empty
 *    {@link ConformanceResult.findings} means "nothing THIS profile checked was
 *    violated": never "this message is conformant." The profile only covers
 *    what the author declared; everything undeclared is unchecked.
 * 2. **No PHI in findings.** A finding names the structural **locus** (segment
 *    name, field / component index, repetition, occurrence) and the rule that
 *    fired: **never** the offending field value. A "value not in set" finding
 *    says *where* and *which value set*, never *what the value was*.
 *
 * @see validateAgainstProfile
 */

/**
 * The seven **simple** HL7 v2 conformance usage codes (HL7 Conformance
 * Methodology, Message Profiles; IHE ITI TF Vol.2 Appendix C). They constrain
 * whether an element must, may, or must not appear:
 *
 * - **`R`**: Required. The element SHALL be present (with a value). Absent →
 *   {@link FINDING_CODES.PROFILE_REQUIRED_ABSENT}.
 * - **`RE`**: Required but may be Empty. The element is supported and SHALL be
 *   sent when the sender has the data; its **absence is never a violation**
 *   (this engine cannot know whether the sender had the data).
 * - **`C`**: Conditional. Presence depends on a condition predicate. A rule
 *   that declares one on its `condition` is evaluated by it: predicate true is
 *   Required, predicate false is Not-permitted, which are the outcomes IHE
 *   specifies for `C`. A rule that declares NO predicate has its **presence
 *   not evaluated** (treated as optional); its length / value-set /
 *   cardinality rules still apply when it IS present.
 * - **`CE`**: Conditional but may be Empty. With a predicate, true is
 *   Required-but-may-be-Empty and false is Not-permitted, again IHE's
 *   outcomes. With no predicate, the same non-evaluation as `C`.
 * - **`O`**: Optional. No presence constraint.
 * - **`X`**: Not supported / not permitted. The element SHALL NOT be present.
 *   Present → {@link FINDING_CODES.PROFILE_NOT_PERMITTED}.
 * - **`B`**: Backward Compatible. Presence is **not evaluated**, exactly as for
 *   `C`; the element's length / value-set / cardinality rules still apply when
 *   it IS present. See the note below on where that behaviour comes from.
 *
 * ## Two bounded decisions this library makes rather than inherits
 *
 * **`B`'s presence behaviour is this library's decision, not a sourced
 * requirement.** The HL7 conformance methodology's table of usage indicators
 * allowable in a message profile lists `B` among them and carries no definition
 * text for it, so no source settles what a validator should do with a `B`
 * element. This library chooses the reading that imposes no presence obligation
 * (so `B` behaves as `C` does on presence) while preserving the author's
 * declared intent in the profile. A later, separate change may revisit it
 * against a source that defines the code.
 *
 * **A declared conditional's outcome domain is unrestricted HERE, and that is a
 * level-scoped choice.** {@link DeclaredConditionalUsage} admits any simple code
 * as either outcome, because this engine targets the CONSTRAINABLE profile
 * level, whose vocabulary is the full indicator set. The methodology separately
 * restricts an IMPLEMENTABLE profile to `R`, `RE` or `X` per element, and its
 * conditional outcomes likewise. That restriction is not enforced here: a
 * profile cannot yet declare which level it claims, and enforcing it belongs to
 * the later, separate change that adds that declaration.
 *
 * @example
 * ```ts
 * import type { SimpleUsageCode } from "@cosyte/hl7";
 * const usage: SimpleUsageCode = "R";
 * ```
 */
export type SimpleUsageCode = "R" | "RE" | "C" | "CE" | "O" | "X" | "B";

/**
 * A **declared conditional** usage token: `C(t/f)`, where `t` is the usage that
 * applies when the condition is true and `f` the usage that applies when it is
 * false. Both outcomes are {@link SimpleUsageCode}s; the token is uppercase,
 * carries no whitespace, and does not nest (`C(C(R/X)/O)` is not one).
 *
 * A rule declared `C(R/X)` is Required when the condition holds and
 * Not-permitted when it does not. Two sources can decide that, and a rule uses
 * exactly one of them: the {@link ConditionPredicate} on its `condition`, which
 * the engine evaluates against the message, or a caller-supplied
 * {@link UsageResolution}. Declaring both at one locus is
 * {@link FINDING_CODES.PROFILE_MALFORMED}, never a silent preference.
 *
 * With neither supplied, the rule is evaluated exactly as a `C` rule with no
 * predicate is: presence not evaluated, every other constraint applied as
 * usual.
 *
 * @example
 * ```ts
 * import type { DeclaredConditionalUsage } from "@cosyte/hl7";
 * const usage: DeclaredConditionalUsage = "C(RE/X)";
 * ```
 */
export type DeclaredConditionalUsage = `C(${SimpleUsageCode}/${SimpleUsageCode})`;

/**
 * Everything a rule's `usage` may be declared as: one of the seven
 * {@link SimpleUsageCode}s, or a {@link DeclaredConditionalUsage} token.
 *
 * **This is not the same type as {@link UsageCodeRegistryEntry}.** The
 * registry publishes `C(a/b)` as the NOTATION for the declared-conditional
 * family, and `a` / `b` are placeholders rather than usage codes, so the
 * literal `"C(a/b)"` is deliberately NOT assignable here. Neither type widens
 * to a bare `string`: a typo such as `"RQ"` is a compile error, and
 * {@link defineConformanceProfile} is the runtime backstop rather than the
 * replacement.
 *
 * @example
 * ```ts
 * import type { UsageCode } from "@cosyte/hl7";
 * const simple: UsageCode = "R";
 * const conditional: UsageCode = "C(RE/X)";
 * ```
 */
export type UsageCode = SimpleUsageCode | DeclaredConditionalUsage;

/**
 * One entry of the exported {@link USAGE_CODES} vocabulary listing: a
 * {@link SimpleUsageCode}, or the literal notation `"C(a/b)"` that stands for
 * the whole declared-conditional family.
 *
 * Distinct from {@link UsageCode} on purpose, so the placeholder can be listed
 * without ever becoming assignable where a rule's usage is expected.
 *
 * @example
 * ```ts
 * import type { UsageCodeRegistryEntry } from "@cosyte/hl7";
 * const entry: UsageCodeRegistryEntry = "C(a/b)";
 * ```
 */
export type UsageCodeRegistryEntry = SimpleUsageCode | "C(a/b)";

/**
 * The frozen, ordered registry of HL7 v2 usage indicators a message profile may
 * use: `R`, `RE`, `C`, `CE`, `O`, `X`, `C(a/b)`, `B`.
 *
 * **It is a published vocabulary LISTING, not a membership oracle for what a
 * rule may declare.** The two questions are different and neither answers the
 * other:
 *
 * - `C(a/b)` is listed here and is REFUSED on a rule, because `a` and `b` are
 *   placeholders for usage codes rather than usage codes.
 * - `C(RE/X)` is accepted on a rule and is NOT listed here, because the listing
 *   carries the family's notation once instead of all of its members.
 *
 * What a rule may declare is answered by {@link UsageCode} at compile time and
 * by {@link defineConformanceProfile} / {@link validateAgainstProfile} at run
 * time. Do not re-derive this array as an accept-set.
 *
 * @example
 * ```ts
 * import { USAGE_CODES } from "@cosyte/hl7";
 * USAGE_CODES.length; // 8
 * USAGE_CODES[0]; // "R"
 * ```
 */
export const USAGE_CODES: readonly UsageCodeRegistryEntry[] = Object.freeze([
  "R",
  "RE",
  "C",
  "CE",
  "O",
  "X",
  "C(a/b)",
  "B",
]);

/**
 * The two usage outcomes a {@link DeclaredConditionalUsage} token records: the
 * usage that applies when the condition is true, and the one that applies when
 * it is false. Both are simple codes.
 *
 * @example
 * ```ts
 * import type { UsageOutcomes } from "@cosyte/hl7";
 * const outcomes: UsageOutcomes = { whenTrue: "RE", whenFalse: "X" };
 * ```
 */
export interface UsageOutcomes {
  /** The usage that applies when the condition is resolved true. */
  readonly whenTrue: SimpleUsageCode;
  /** The usage that applies when the condition is resolved false. */
  readonly whenFalse: SimpleUsageCode;
}

/**
 * A caller-supplied resolution of one declared-conditional rule. The engine
 * evaluates no condition predicate and reads nothing from the message to decide
 * an outcome: **the caller decides**, and passes an ordered list of these
 * alongside the message and the profile.
 *
 * The `segment` name plus the 1-indexed `field` (absent when the target is a
 * segment rule) is the LOCUS the resolution applies to. It applies to the RULE
 * at that locus, hence to every occurrence of the segment and every repetition
 * of the field: there is no per-occurrence resolution.
 *
 * A resolution whose locus matches no declared rule, matches more than one, or
 * matches a rule whose usage is not a declared conditional is a profile defect
 * ({@link FINDING_CODES.PROFILE_MALFORMED}), never a silent no-op.
 *
 * @example
 * ```ts
 * import type { UsageResolution } from "@cosyte/hl7";
 * // "PID-8's condition is true for this message."
 * const resolution: UsageResolution = { segment: "PID", field: 8, outcome: true };
 * ```
 */
export interface UsageResolution {
  /** Segment name of the target rule (e.g. `"PID"`). */
  readonly segment: string;
  /** 1-indexed field position when the target is a field rule; absent for a segment rule. */
  readonly field?: number;
  /** `true` applies the token's true outcome, `false` its false outcome. */
  readonly outcome: boolean;
}

/**
 * Where in the message a condition predicate reads: a structural coordinate,
 * a segment name plus the 1-indexed field, component and subcomponent
 * positions that narrow it. Every member is a name or an index, so a location
 * is inherently PHI-free and is safe to name in a finding.
 *
 * The coordinate narrows from the outside in: a `component` needs a `field`,
 * and a `subcomponent` needs a `component`. A location that skips a level names
 * no addressable element and is refused as
 * {@link FINDING_CODES.PROFILE_MALFORMED}, as is a location whose `segment` is
 * not a valid segment name.
 *
 * **A comparison statement needs a `field`.** A segment on its own has no
 * single content to compare, so a {@link ComparisonPredicate} whose location
 * stops at the segment is also `PROFILE_MALFORMED`. A
 * {@link PresencePredicate} may stop there: it asks whether the segment occurs.
 *
 * @example
 * ```ts
 * import type { PredicateLocation } from "@cosyte/hl7";
 * const completionStatus: PredicateLocation = { segment: "RXA", field: 20 };
 * const identifier: PredicateLocation = { segment: "RXA", field: 9, component: 1 };
 * ```
 */
export interface PredicateLocation {
  /** Segment name: 3 chars, `[A-Z][A-Z0-9]{2}` (standard or `Z…` segment). */
  readonly segment: string;
  /** 1-indexed HL7 field position (e.g. `20` for RXA-20). Omitted targets the segment itself. */
  readonly field?: number;
  /** 1-indexed component within the field. Requires `field`. */
  readonly component?: number;
  /** 1-indexed subcomponent within the component. Requires `component`. */
  readonly subcomponent?: number;
}

/**
 * The two proposition statements that ask whether an element carries content,
 * from the published condition-predicate language (`IF CWE.1 (Identifier) is
 * valued`).
 *
 * **A presence statement is always determinate**: an element the message does
 * not carry is simply not valued, which is an answer rather than a gap. That is
 * what separates it from a comparison, which needs content to compare and has
 * none when the element is absent.
 *
 * @example
 * ```ts
 * import type { PredicatePresence } from "@cosyte/hl7";
 * const statement: PredicatePresence = "is valued";
 * ```
 */
export type PredicatePresence = "is valued" | "is not valued";

/**
 * The closed set of verbs a comparison statement may use, from the published
 * condition-predicate language's verb table. Each pairs the element's content
 * against the statement's value list:
 *
 * - **`is` / `is not`**: the value equals (does not equal) a listed value,
 *   whole and case-sensitive.
 * - **`contains` / `does not contain`**: the value carries (does not carry) a
 *   listed value as a substring, case-sensitive.
 * - **`matches` / `does not match`**: the value matches (does not match) a
 *   listed value read as a regular expression, anchored over the whole value.
 *
 * **A negative verb negates the COMPARISON, not the statement.** Each pair is an
 * exact complement value by value, and both halves are quantified the same way:
 * existentially, over every repetition of the field and every occurrence of the
 * segment the location names (see {@link ComparisonPredicate}). Three
 * consequences, and the second is the one that surprises:
 *
 * - Where the message carries exactly ONE value at that location, the pair
 *   behaves as an exact complement: one of the two decides true and the other
 *   false.
 * - Where the location REPEATS, both halves can decide true at once, because
 *   both are existential. `PID-3.1 is 'MRN1'` asks whether SOME identifier is
 *   `MRN1`, and `PID-3.1 is not 'MRN1'` asks whether SOME identifier is not
 *   `MRN1`; for `MRN1~MRN2` the answer to both is yes. So a negative verb is
 *   NOT a way to ask whether no repetition is a listed value: the language
 *   carries no negation connector, so that question cannot be written at all,
 *   and `AL1-3.1 is not 'PENICILLIN'` decides true for a patient who has that
 *   allergy and one other.
 * - Where the message carries no value at that location, neither half decides.
 *   The comparison is unevaluatable whichever verb it uses.
 *
 * @example
 * ```ts
 * import type { PredicateVerb } from "@cosyte/hl7";
 * const verb: PredicateVerb = "contains";
 * ```
 */
export type PredicateVerb =
  | "is"
  | "is not"
  | "contains"
  | "does not contain"
  | "matches"
  | "does not match";

/**
 * The frozen, ordered listing of the comparison verbs a condition predicate may
 * use: `is`, `is not`, `contains`, `does not contain`, `matches`,
 * `does not match`.
 *
 * Unlike {@link USAGE_CODES}, this listing IS the accept-set: a verb outside it
 * is `PROFILE_MALFORMED`, and the {@link PredicateVerb} type refuses it at
 * compile time where the author writes TypeScript.
 *
 * @example
 * ```ts
 * import { PREDICATE_VERBS } from "@cosyte/hl7";
 * PREDICATE_VERBS.length; // 6
 * PREDICATE_VERBS[0]; // "is"
 * ```
 */
export const PREDICATE_VERBS: readonly PredicateVerb[] = Object.freeze([
  "is",
  "is not",
  "contains",
  "does not contain",
  "matches",
  "does not match",
]);

/**
 * The connectors that join two condition-predicate statements, with the
 * published semantics: `AND` is true only when both operands are true, `OR`
 * when at least one is, `XOR` when exactly one is.
 *
 * @example
 * ```ts
 * import type { PredicateConnector } from "@cosyte/hl7";
 * const connector: PredicateConnector = "AND";
 * ```
 */
export type PredicateConnector = "AND" | "OR" | "XOR";

/**
 * The frozen, ordered listing of the connectors a condition predicate may use:
 * `AND`, `OR`, `XOR`. Like {@link PREDICATE_VERBS} this listing IS the
 * accept-set.
 *
 * @example
 * ```ts
 * import { PREDICATE_CONNECTORS } from "@cosyte/hl7";
 * PREDICATE_CONNECTORS.length; // 3
 * PREDICATE_CONNECTORS[2]; // "XOR"
 * ```
 */
export const PREDICATE_CONNECTORS: readonly PredicateConnector[] = Object.freeze([
  "AND",
  "OR",
  "XOR",
]);

/**
 * A presence statement: does the element at `location` carry content?
 *
 * Content is read at or below the location, so a field-only location is valued
 * when any subcomponent of any component of any repetition is non-empty, and a
 * segment-only location is valued when the segment occurs at all. This is the
 * same reading of "present" the engine's `R` and `X` checks use.
 *
 * @example
 * ```ts
 * import type { PresencePredicate } from "@cosyte/hl7";
 * // "IF RXA-9.1 (Identifier) is valued"
 * const predicate: PresencePredicate = {
 *   location: { segment: "RXA", field: 9, component: 1 },
 *   presence: "is valued",
 * };
 * ```
 */
export interface PresencePredicate {
  /** The element the statement asks about. */
  readonly location: PredicateLocation;
  /** Which of the two presence statements this is. */
  readonly presence: PredicatePresence;
}

/**
 * A comparison statement: does the content at `location` stand in the `verb`
 * relation to one of the `values`?
 *
 * The value read at a location is the subcomponent at the coordinate, with an
 * omitted `component` and `subcomponent` both defaulting to `1` (a coded
 * element's code), exactly as a field rule's own `component` default does.
 * `values` must carry at least one entry: a comparison with no value list is
 * `PROFILE_MALFORMED`, and is a compile error where the author writes
 * TypeScript.
 *
 * **A comparison against an element the message does not carry is
 * unevaluatable**, not false: there is no content to compare. It is reported as
 * {@link FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE} rather than silently
 * deciding the conditional.
 *
 * **The statement is quantified over repetitions and occurrences.** Where the
 * location names a repeating field, or a segment that occurs more than once, the
 * comparison reads one value per repetition per occurrence and is true when ONE
 * OR MORE of them stands in the verb's relation to the value list. That is the
 * language's default occurrence semantics, and it covers the negative verbs too:
 * `is not` is true when SOME value is not a listed one, not when every value is
 * not. So at a repeating location a verb and its negative can both decide true
 * against the same value list. {@link PredicateVerb} works the case through.
 *
 * @example
 * ```ts
 * import type { ComparisonPredicate } from "@cosyte/hl7";
 * // "IF RXA-20 (Completion Status) contains one of the values in the list: {'CP', 'PA'}"
 * const predicate: ComparisonPredicate = {
 *   location: { segment: "RXA", field: 20 },
 *   verb: "contains",
 *   values: ["CP", "PA"],
 * };
 * ```
 */
export interface ComparisonPredicate {
  /** The element whose content the statement compares. */
  readonly location: PredicateLocation;
  /** The relation to test. */
  readonly verb: PredicateVerb;
  /**
   * The value list, at least one entry. For `matches` / `does not match` each
   * entry is a regular-expression source; anything the platform cannot compile
   * is `PROFILE_MALFORMED`.
   */
  readonly values: readonly string[];
}

/**
 * Two statements joined by a connector. Nests: either side may itself be a
 * connected predicate.
 *
 * A connected predicate is unevaluatable exactly when its result DEPENDS on an
 * unevaluatable operand. So `AND` is false as soon as one side is false however
 * unevaluatable the other is, `OR` is true as soon as one side is true, and
 * `XOR` needs both sides.
 *
 * @example
 * ```ts
 * import type { ConnectedPredicate } from "@cosyte/hl7";
 * // "IF RXA-9.1 contains '00' AND RXA-20 contains one of the values in the list: {'CP','PA'}"
 * const predicate: ConnectedPredicate = {
 *   connector: "AND",
 *   left: { location: { segment: "RXA", field: 9, component: 1 }, verb: "contains", values: ["00"] },
 *   right: { location: { segment: "RXA", field: 20 }, verb: "contains", values: ["CP", "PA"] },
 * };
 * ```
 */
export interface ConnectedPredicate {
  /** Which connector joins the two operands. */
  readonly connector: PredicateConnector;
  /** The left-hand operand. */
  readonly left: ConditionPredicate;
  /** The right-hand operand. */
  readonly right: ConditionPredicate;
}

/**
 * A **condition predicate**: the computable test a conditionally-used element's
 * usage is decided by, expressed in the published condition-predicate language
 * as a presence statement, a comparison statement, or two of those joined by a
 * connector.
 *
 * A rule declares one on its `condition`, and only a rule whose usage is
 * conditional (`C`, `CE`, or a declared conditional such as `C(RE/X)`) may
 * carry one: there is nothing for a predicate to decide anywhere else, so a
 * predicate on any other rule is `PROFILE_MALFORMED` rather than a silent
 * no-op. A rule may not declare a predicate AND take a caller-supplied
 * resolution: that too is `PROFILE_MALFORMED`, so neither source is silently
 * preferred over the other.
 *
 * **The predicate reads the message only.** It never makes a network call and
 * never consults a bundled code set: every value it compares against is one the
 * profile author wrote down.
 *
 * **Declare exactly one of `presence`, `verb` and `connector`, and OMIT the
 * others.** A key set to `undefined` still declares it, so a statement
 * assembled from an options bag has to leave out the keys it does not use
 * rather than pass them through empty. A statement declaring two of them is
 * `PROFILE_MALFORMED`: the engine will not guess which question was meant,
 * because deciding a conditional element's usage from the wrong question turns
 * a required element into a permitted absence.
 *
 * @example
 * ```ts
 * import type { ConditionPredicate } from "@cosyte/hl7";
 * const simple: ConditionPredicate = {
 *   location: { segment: "PID", field: 7 },
 *   presence: "is valued",
 * };
 * const complex: ConditionPredicate = {
 *   connector: "OR",
 *   left: simple,
 *   right: { location: { segment: "PID", field: 8 }, verb: "is", values: ["M", "F"] },
 * };
 * ```
 */
export type ConditionPredicate = PresencePredicate | ComparisonPredicate | ConnectedPredicate;

/**
 * A repetition-count constraint. `min` / `max` are inclusive bounds on the
 * number of repetitions (for a field rule) or occurrences (for a segment
 * rule). `max` may be the literal `"*"` for "unbounded". Omitted bounds are
 * unconstrained on that side.
 *
 * **Cardinality `min` is checked only when the element is present.** An absent
 * **Required** element is reported as {@link FINDING_CODES.PROFILE_REQUIRED_ABSENT}
 * (a usage finding), not a cardinality finding: so a missing `R` field with
 * `cardinality.min = 1` yields exactly one finding, never two.
 *
 * @example
 * ```ts
 * import type { Cardinality } from "@cosyte/hl7";
 * const once: Cardinality = { min: 1, max: 1 };
 * const many: Cardinality = { min: 1, max: "*" };
 * ```
 */
export interface Cardinality {
  readonly min?: number;
  readonly max?: number | "*";
}

/**
 * A rule for one **field position** within a segment. Every
 * constraint is optional; a rule with only a `field` index is a no-op.
 *
 * @remarks
 * `field` is the 1-indexed HL7 position (MSH offset handled internally, exactly
 * like `Segment.field(n)`: `{ field: 9 }` on `MSH` targets MSH-9). Length and
 * value-set checks read the value at `component` (default **1**), so a coded
 * field's code (`CWE.1` / `CE.1`) is checked by default; set `component` to
 * check a different component. Both are applied **per present repetition**.
 */
export interface FieldRule {
  /** 1-indexed HL7 field position (e.g. `3` for PID-3, `9` for MSH-9). */
  readonly field: number;
  /**
   * Optional human label for the field (e.g. `"Patient Identifier List"`).
   * Structural documentation for the profile author only: findings identify a
   * field by its PHI-free structural locus (segment + index), never by this
   * label, so the label is never echoed into a finding message.
   */
  readonly name?: string;
  /**
   * Usage constraint: a simple code, or a declared conditional such as
   * `C(RE/X)` (see {@link UsageCode}). Omitted ⇒ Optional, and an omitted
   * usage is never refused.
   */
  readonly usage?: UsageCode;
  /**
   * The {@link ConditionPredicate} that decides this rule's usage, evaluated
   * against the message. Only a rule whose `usage` is conditional (`C`, `CE`,
   * or a declared conditional) may declare one.
   */
  readonly condition?: ConditionPredicate;
  /** Repetition-count constraint for this field. */
  readonly cardinality?: Cardinality;
  /** Maximum character length of the checked component value (inclusive). */
  readonly length?: number;
  /**
   * Consumer-supplied permitted-value list. The checked component value must be
   * a member (case-sensitive exact match). **hl7 ships no code set**: this is
   * BYO terminology; membership is a literal string check, never a LOINC /
   * SNOMED / ICD / RxNorm lookup and never a network call.
   */
  readonly valueSet?: readonly string[];
  /**
   * 1-indexed component whose value the `length` / `valueSet` checks read.
   * Defaults to `1` (the first component: a coded element's code).
   */
  readonly component?: number;
  /**
   * Severity for findings this rule produces. Defaults to `"error"`. A profile
   * author can downgrade a data-quality rule (e.g. a length or value-set check)
   * to `"warning"` or `"info"` without changing the check itself.
   */
  readonly severity?: FindingSeverity;
}

/**
 * A rule for one **segment type**. `usage` constrains whether
 * the segment must / must not appear; `cardinality` constrains how many times;
 * `fields` are the per-field rules, applied to **every** occurrence of the
 * segment.
 */
export interface SegmentRule {
  /** Segment name: 3 chars, `[A-Z][A-Z0-9]{2}` (standard or `Z…` segment). */
  readonly segment: string;
  /**
   * Usage for the segment as a whole. `R` ⇒ at least one occurrence required;
   * `X` ⇒ none permitted; `RE` / `O` ⇒ no presence constraint; `C` / `CE` /
   * `B` ⇒ presence not evaluated (no predicate language). A declared
   * conditional such as `C(R/X)` takes the outcome a caller resolves, and is
   * evaluated exactly as `C` when nothing resolves it. Omitted ⇒ Optional.
   */
  readonly usage?: UsageCode;
  /**
   * The {@link ConditionPredicate} that decides this rule's usage, evaluated
   * against the message. Only a rule whose `usage` is conditional (`C`, `CE`,
   * or a declared conditional) may declare one.
   */
  readonly condition?: ConditionPredicate;
  /** Occurrence-count constraint for this segment across the message. */
  readonly cardinality?: Cardinality;
  /** Per-field rules, applied to each occurrence of this segment. */
  readonly fields?: readonly FieldRule[];
  /** Severity for the segment-level presence / cardinality findings. Default `"error"`. */
  readonly severity?: FindingSeverity;
}

/**
 * A **user-authored, declarative** conformance profile. The
 * consumer supplies this; hl7 ships none. It is a bounded subset of the HL7 v2
 * Message-Profile model: usage / condition predicate / cardinality / length /
 * consumer-supplied value set: with **no** bundled code set and **no** network
 * binding (both deliberate scope boundaries). A condition predicate reads the
 * message in front of it and nothing else.
 *
 * @example
 * ```ts
 * import type { ConformanceProfile } from "@cosyte/hl7";
 *
 * // A minimal ADT profile the CONSUMER authors: example, NOT an attestation.
 * const profile: ConformanceProfile = {
 *   name: "example-adt-min",
 *   segments: [
 *     { segment: "MSH", usage: "R", fields: [{ field: 10, name: "Control ID", usage: "R" }] },
 *     { segment: "PID", usage: "R", cardinality: { min: 1, max: 1 }, fields: [
 *       { field: 3, name: "Patient Identifiers", usage: "R", cardinality: { min: 1, max: 1 } },
 *       { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
 *     ] },
 *     { segment: "ZZZ", usage: "X" },
 *   ],
 * };
 * ```
 */
export interface ConformanceProfile {
  /** A name for provenance: echoed into {@link ConformanceResult.profileName}. */
  readonly name: string;
  /** The segment rules, evaluated in array order (stable finding order). */
  readonly segments: readonly SegmentRule[];
}

/**
 * Severity of a {@link ConformanceFinding}. `error` is a constraint violation;
 * `warning` / `info` are author-downgraded advisories (via a rule's
 * `severity`). {@link FINDING_CODES.PROFILE_MALFORMED} is always `error`.
 */
export type FindingSeverity = "error" | "warning" | "info";

/**
 * The frozen registry of finding codes. Stable, additive string codes: a
 * consumer compares `finding.code === FINDING_CODES.PROFILE_REQUIRED_ABSENT`.
 * Segment-level vs field-level is disambiguated by whether the finding's
 * {@link FindingLocus.field} is present, not by separate codes.
 *
 * @example
 * ```ts
 * import { validateAgainstProfile, FINDING_CODES } from "@cosyte/hl7";
 * const { findings } = validateAgainstProfile(msg, profile);
 * const missing = findings.filter((f) => f.code === FINDING_CODES.PROFILE_REQUIRED_ABSENT);
 * ```
 */
export const FINDING_CODES = {
  /** A Required (`R`) segment or field is absent (or present-but-empty). */
  PROFILE_REQUIRED_ABSENT: "PROFILE_REQUIRED_ABSENT",
  /** A Not-permitted (`X`) segment or field is present. */
  PROFILE_NOT_PERMITTED: "PROFILE_NOT_PERMITTED",
  /** A segment-occurrence or field-repetition count is outside its cardinality. */
  PROFILE_CARDINALITY: "PROFILE_CARDINALITY",
  /** A checked component value exceeds the declared maximum length. */
  PROFILE_LENGTH: "PROFILE_LENGTH",
  /** A checked component value is not a member of the consumer-supplied value set. */
  PROFILE_VALUE_NOT_IN_SET: "PROFILE_VALUE_NOT_IN_SET",
  /**
   * A rule's declared {@link ConditionPredicate} could not be decided against
   * this message, so the rule's usage was never selected and the element's
   * presence was NOT assessed. A distinct code on purpose: an unassessed
   * conditional is filterable by code, without matching a message string.
   */
  PROFILE_CONDITION_UNEVALUATABLE: "PROFILE_CONDITION_UNEVALUATABLE",
  /** The profile ITSELF is structurally malformed (a diagnostic, not a message finding). */
  PROFILE_MALFORMED: "PROFILE_MALFORMED",
} as const;

/**
 * Discriminant union of every {@link ConformanceFinding} code. Enables
 * exhaustive `switch` narrowing (the `switch-exhaustiveness-check` lint rule).
 */
export type FindingCode = (typeof FINDING_CODES)[keyof typeof FINDING_CODES];

/**
 * The **structural** locus a finding refers to: segment name plus, where
 * applicable, the field position, component, repetition, and segment
 * occurrence. Every member is a name or an index: a locus is **inherently
 * PHI-free** and never carries a field value.
 *
 * A finding with no {@link field} is **segment-level** (presence / cardinality
 * of the segment itself); a finding with a `field` is **field-level**. For a
 * {@link FINDING_CODES.PROFILE_MALFORMED} diagnostic (a defect in the profile,
 * not the message) `segment` may be the sentinel `"(profile)"`.
 */
export interface FindingLocus {
  /** Segment name (e.g. `"PID"`), or `"(profile)"` for a profile-shape defect. */
  readonly segment: string;
  /** 1-indexed field position, when the finding is field-level. */
  readonly field?: number;
  /** 1-indexed component, when a component-scoped check (length / value-set) fired. */
  readonly component?: number;
  /** 0-indexed field repetition, when the finding is repetition-scoped. */
  readonly repetition?: number;
  /** 0-indexed segment occurrence, when the segment type repeats. */
  readonly occurrence?: number;
}

/**
 * One typed conformance finding. Carries the {@link FindingCode}, a
 * {@link FindingSeverity}, the structural {@link FindingLocus}, and a
 * human-readable `message` describing the rule that fired.
 *
 * **The `message` is PHI-safe by construction**: it names the locus, the rule,
 * and (for a value-set miss) the SIZE of the value set, but **never** the
 * offending field value.
 *
 * @example
 * ```ts
 * import type { ConformanceFinding } from "@cosyte/hl7";
 * const f: ConformanceFinding = {
 *   code: "PROFILE_VALUE_NOT_IN_SET",
 *   severity: "error",
 *   locus: { segment: "PID", field: 8, component: 1 },
 *   message: 'PID-8 component 1 value is not in the profile value set (3 permitted codes).',
 * };
 * ```
 */
export interface ConformanceFinding {
  readonly code: FindingCode;
  readonly severity: FindingSeverity;
  readonly locus: FindingLocus;
  readonly message: string;
}

/**
 * The result of {@link validateAgainstProfile}: the profile's `name` and the
 * ordered list of `findings`.
 *
 * **`findings.length === 0` is NOT a conformance attestation.** It means every
 * rule the profile declared was satisfied: nothing about the parts of the
 * message the profile did not cover, and nothing about clinical correctness.
 * Read it as "no declared rule was violated," never as "conformant."
 */
export interface ConformanceResult {
  readonly profileName: string;
  readonly findings: readonly ConformanceFinding[];
}
