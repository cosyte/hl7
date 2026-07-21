/**
 * Public types for the conformance-profile engine (roadmap Phase U). A
 * **consumer authors** a declarative {@link ConformanceProfile} — a bounded
 * subset of the HL7 v2 Message-Profile / NIST-IGAMT model (usage codes,
 * cardinality, length, value-set binding against a consumer-supplied code
 * list) — and {@link validateAgainstProfile} runs it against a parsed message,
 * returning typed {@link ConformanceFinding}s.
 *
 * This is the **sanctioned functionality-plane replacement for the retired
 * vendor-corpus arc**: instead of hl7 shipping vendor/IHE/regulatory profiles
 * or code sets, the consumer brings their own interface spec and hl7 validates
 * against it. hl7 ships **no** profile, **no** code set, and makes **no**
 * network call — the profile and every value set are supplied by the caller.
 *
 * Two invariants govern the whole surface:
 *
 * 1. **"No findings" is NOT a conformance attestation.** An empty
 *    {@link ConformanceResult.findings} means "nothing THIS profile checked was
 *    violated" — never "this message is conformant." The profile only covers
 *    what the author declared; everything undeclared is unchecked.
 * 2. **No PHI in findings.** A finding names the structural **locus** (segment
 *    name, field / component index, repetition, occurrence) and the rule that
 *    fired — **never** the offending field value. A "value not in set" finding
 *    says *where* and *which value set*, never *what the value was*.
 *
 * @see validateAgainstProfile
 */

/**
 * The six HL7 v2 conformance **usage codes** (HL7 Conformance Methodology —
 * Message Profiles; IHE ITI TF Vol.2 Appendix C). They constrain whether an
 * element must, may, or must not appear:
 *
 * - **`R`** — Required. The element SHALL be present (with a value). Absent →
 *   {@link FINDING_CODES.PROFILE_REQUIRED_ABSENT}.
 * - **`RE`** — Required but may be Empty. The element is supported and SHALL be
 *   sent when the sender has the data; its **absence is never a violation**
 *   (this engine cannot know whether the sender had the data).
 * - **`C`** — Conditional. Presence depends on a predicate. This bounded engine
 *   ships **no predicate language** (a documented defer — roadmap §5), so a
 *   `C` element's **presence is not evaluated** (treated as optional); its
 *   length / value-set / cardinality rules still apply when it IS present.
 * - **`CE`** — Conditional but may be Empty. Same non-evaluation as `C`.
 * - **`O`** — Optional. No presence constraint.
 * - **`X`** — Not supported / not permitted. The element SHALL NOT be present.
 *   Present → {@link FINDING_CODES.PROFILE_NOT_PERMITTED}.
 *
 * @example
 * ```ts
 * import type { UsageCode } from "@cosyte/hl7";
 * const usage: UsageCode = "R";
 * ```
 */
export type UsageCode = "R" | "RE" | "C" | "CE" | "O" | "X";

/**
 * The frozen set of valid {@link UsageCode}s, for runtime validation and
 * introspection. `USAGE_CODES.R === "R"`.
 *
 * @example
 * ```ts
 * import { USAGE_CODES } from "@cosyte/hl7";
 * USAGE_CODES.includes("R" as const); // true
 * ```
 */
export const USAGE_CODES: readonly UsageCode[] = Object.freeze(["R", "RE", "C", "CE", "O", "X"]);

/**
 * A repetition-count constraint. `min` / `max` are inclusive bounds on the
 * number of repetitions (for a field rule) or occurrences (for a segment
 * rule). `max` may be the literal `"*"` for "unbounded". Omitted bounds are
 * unconstrained on that side.
 *
 * **Cardinality `min` is checked only when the element is present.** An absent
 * **Required** element is reported as {@link FINDING_CODES.PROFILE_REQUIRED_ABSENT}
 * (a usage finding), not a cardinality finding — so a missing `R` field with
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
 * A rule for one **field position** within a segment (roadmap Phase U). Every
 * constraint is optional; a rule with only a `field` index is a no-op.
 *
 * @remarks
 * `field` is the 1-indexed HL7 position (MSH offset handled internally, exactly
 * like `Segment.field(n)` — `{ field: 9 }` on `MSH` targets MSH-9). Length and
 * value-set checks read the value at `component` (default **1**), so a coded
 * field's code (`CWE.1` / `CE.1`) is checked by default; set `component` to
 * check a different component. Both are applied **per present repetition**.
 */
export interface FieldRule {
  /** 1-indexed HL7 field position (e.g. `3` for PID-3, `9` for MSH-9). */
  readonly field: number;
  /**
   * Optional human label for the field (e.g. `"Patient Identifier List"`).
   * Structural documentation for the profile author only — findings identify a
   * field by its PHI-free structural locus (segment + index), never by this
   * label, so the label is never echoed into a finding message.
   */
  readonly name?: string;
  /** Usage constraint (see {@link UsageCode}). Omitted ⇒ Optional. */
  readonly usage?: UsageCode;
  /** Repetition-count constraint for this field. */
  readonly cardinality?: Cardinality;
  /** Maximum character length of the checked component value (inclusive). */
  readonly length?: number;
  /**
   * Consumer-supplied permitted-value list. The checked component value must be
   * a member (case-sensitive exact match). **hl7 ships no code set** — this is
   * BYO terminology; membership is a literal string check, never a LOINC /
   * SNOMED / ICD / RxNorm lookup and never a network call.
   */
  readonly valueSet?: readonly string[];
  /**
   * 1-indexed component whose value the `length` / `valueSet` checks read.
   * Defaults to `1` (the first component — a coded element's code).
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
 * A rule for one **segment type** (roadmap Phase U). `usage` constrains whether
 * the segment must / must not appear; `cardinality` constrains how many times;
 * `fields` are the per-field rules, applied to **every** occurrence of the
 * segment.
 */
export interface SegmentRule {
  /** Segment name — 3 chars, `[A-Z][A-Z0-9]{2}` (standard or `Z…` segment). */
  readonly segment: string;
  /**
   * Usage for the segment as a whole. `R` ⇒ at least one occurrence required;
   * `X` ⇒ none permitted; `RE` / `O` ⇒ no presence constraint; `C` / `CE` ⇒
   * presence not evaluated (no predicate language). Omitted ⇒ Optional.
   */
  readonly usage?: UsageCode;
  /** Occurrence-count constraint for this segment across the message. */
  readonly cardinality?: Cardinality;
  /** Per-field rules, applied to each occurrence of this segment. */
  readonly fields?: readonly FieldRule[];
  /** Severity for the segment-level presence / cardinality findings. Default `"error"`. */
  readonly severity?: FindingSeverity;
}

/**
 * A **user-authored, declarative** conformance profile (roadmap Phase U). The
 * consumer supplies this; hl7 ships none. It is a bounded subset of the HL7 v2
 * Message-Profile model — usage / cardinality / length / consumer-supplied
 * value set — with **no** conditional-predicate language, **no** bundled code
 * set, and **no** network binding (all deliberate scope boundaries).
 *
 * @example
 * ```ts
 * import type { ConformanceProfile } from "@cosyte/hl7";
 *
 * // A minimal ADT profile the CONSUMER authors — example, NOT an attestation.
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
  /** A name for provenance — echoed into {@link ConformanceResult.profileName}. */
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
 * The frozen registry of finding codes. Stable, additive string codes — a
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
  /** The profile ITSELF is structurally malformed (a diagnostic, not a message finding). */
  PROFILE_MALFORMED: "PROFILE_MALFORMED",
} as const;

/**
 * Discriminant union of every {@link ConformanceFinding} code. Enables
 * exhaustive `switch` narrowing (the `switch-exhaustiveness-check` lint rule).
 */
export type FindingCode = (typeof FINDING_CODES)[keyof typeof FINDING_CODES];

/**
 * The **structural** locus a finding refers to — segment name plus, where
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
 * **The `message` is PHI-safe by construction** — it names the locus, the rule,
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
 * rule the profile declared was satisfied — nothing about the parts of the
 * message the profile did not cover, and nothing about clinical correctness.
 * Read it as "no declared rule was violated," never as "conformant."
 */
export interface ConformanceResult {
  readonly profileName: string;
  readonly findings: readonly ConformanceFinding[];
}
