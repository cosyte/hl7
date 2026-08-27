/**
 * The conformance-profile engine: `validateAgainstProfile`.
 * Runs a **consumer-authored** declarative {@link ConformanceProfile} against a
 * parsed {@link Hl7Message} and returns typed {@link ConformanceFinding}s.
 *
 * The sanctioned functionality-plane replacement for the retired vendor-corpus
 * arc: the consumer brings the profile and every value set; hl7 ships **no**
 * profile, **no** code set, and makes **no** network call. A rule's condition
 * predicate is no exception: it is decided by reading the message in front of
 * it, against values the profile author wrote down. Four invariants the engine
 * holds absolutely:
 *
 * 1. **Never throws.** Any message × any profile × any resolution argument
 *    (even a malformed one, or a value cast through `any`) yields a
 *    {@link ConformanceResult}, never an exception. A malformed profile or
 *    resolution argument becomes `PROFILE_MALFORMED` findings.
 * 2. **Valid ⇒ zero findings**, and **zero findings is NOT an attestation**,
 *    it means no *declared* rule was violated, nothing more (see
 *    {@link ConformanceResult}).
 * 3. **No PHI in findings.** Findings name the structural locus and the rule,
 *    never the offending value (see `src/conformance/findings.ts`).
 * 4. **Read-only.** Validation never mutates the message.
 */

import type { Hl7Message } from "../model/message.js";
import type { RawRepetition } from "../parser/types.js";

import { codingSystem } from "../model/coding-system.js";
import type { Field } from "../model/field.js";
import type { Segment } from "../model/segment.js";
import * as F from "./findings.js";
import { levelInForce } from "./level.js";
import { describeLocation, evaluatePredicate, type PredicateEvaluation } from "./predicate.js";
import { collectProfileDefects } from "./profile-shape.js";
import { analyzeResolutions, locusKey } from "./resolutions.js";
import {
  type Cardinality,
  type ComponentRule,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type FieldRule,
  type FindingLocus,
  type FindingSeverity,
  type SegmentRule,
  type SimpleUsageCode,
  type UsageCode,
  type UsageResolution,
} from "./types.js";
import { parseUsageToken, predicateOutcomes } from "./usage.js";

/**
 * Evaluate a rule's declared condition predicate, at most once per rule per
 * validation run.
 *
 * A predicate's location is message-wide, so its answer is a property of the
 * RULE and not of any one occurrence of the segment the rule sits under. The
 * memo is what makes that literally true: a field rule under a segment that
 * occurs five times is decided once, so it can also be REPORTED once when it
 * cannot be decided at all.
 *
 * @internal
 */
function predicateReader(
  message: Hl7Message,
): (rule: SegmentRule | FieldRule) => PredicateEvaluation | undefined {
  const memo = new Map<SegmentRule | FieldRule, PredicateEvaluation>();
  return (rule) => {
    if (rule.condition === undefined) return undefined;
    const seen = memo.get(rule);
    if (seen !== undefined) return seen;
    const evaluated = evaluatePredicate(message, rule.condition);
    memo.set(rule, evaluated);
    return evaluated;
  };
}

/** A best-effort profile name for the result when the profile may be malformed. @internal */
function safeName(profile: unknown): string {
  if (typeof profile === "object" && profile !== null && !Array.isArray(profile)) {
    const n = (profile as Record<string, unknown>)["name"];
    if (typeof n === "string" && n.trim().length > 0) return n;
  }
  return "(unnamed profile)";
}

/** The decoded value at 1-indexed `component` of a repetition (`""` when absent). @internal */
function componentValue(rep: RawRepetition, component: number): string {
  return rep.components[component - 1]?.subcomponents[0] ?? "";
}

/** Does one repetition carry any non-empty content in any component/subcomponent? @internal */
function repetitionHasValue(rep: RawRepetition): boolean {
  return rep.components.some((comp) => comp.subcomponents.some((sub) => sub !== ""));
}

/**
 * Does one repetition carry any non-empty content AT a 1-indexed component?
 *
 * Read at or below the coordinate, which is the same reading of "present" the
 * engine's `R` and `X` checks use for a field and its `is valued` presence
 * statement uses for any location: a component is valued when any of its
 * subcomponents carries something. Deliberately NOT
 * {@link componentValue}`(rep, c) !== ""`, which reads only the FIRST
 * subcomponent: a component whose content sits in a later subcomponent is
 * content, and calling it absent would let the undeclared-content check miss
 * exactly the case it exists for.
 *
 * @internal
 */
function componentHasValue(rep: RawRepetition, component: number): boolean {
  return rep.components[component - 1]?.subcomponents.some((sub) => sub !== "") ?? false;
}

/**
 * The empty resolution map component rules are evaluated under. A caller
 * resolution names a segment plus an optional field and can therefore never
 * name a component, so a conditional usage on a component rule is decided by
 * nothing at all: it is evaluated exactly as an undecided conditional, which is
 * what an empty map produces. Passing the run's REAL map here would apply a
 * field's resolution to that field's components, which is a resolution the
 * caller never wrote.
 *
 * @internal
 */
const NO_RESOLUTIONS: ReadonlyMap<string, boolean> = Object.freeze(new Map<string, boolean>());

/** Does the field carry any non-empty content in any repetition/component/subcomponent? @internal */
function fieldHasValue(field: Field): boolean {
  return field.repetitions.some(repetitionHasValue);
}

/**
 * The registered coding-system identity a field rule binds its value set to, or
 * `undefined` when it binds none.
 *
 * Resolution goes through the library's own provenance map, which is what makes
 * the comparison an identity test rather than a string test: an author binding
 * `loinc` and a feed sending `LN` are talking about the same system, and
 * reporting a mismatch there would be a false positive on a correct feed.
 *
 * A binding the map cannot resolve is a profile defect and the engine returns
 * its defects before it evaluates any rule, so `undefined` here means "no
 * binding declared" on every path that can actually reach it.
 *
 * @internal
 */
function boundCodingSystem(rule: FieldRule): string | undefined {
  return codingSystem(rule.codingSystem)?.id;
}

/**
 * Evaluate a presence obligation for a SIMPLE usage code against an observed
 * presence flag, returning the finding kind to emit (or `null`). Shared by the
 * segment- and field-level checks so the R / X / RE / O / C / CE / B semantics
 * are defined in exactly one place.
 *
 * - `R` absent ⇒ `"required-absent"`.
 * - `X` present ⇒ `"not-permitted"`.
 * - `RE` / `O` ⇒ no presence finding (RE absence is never a violation).
 * - `C` / `CE` ⇒ no presence finding, because a conditional code only ever
 *   reaches here UNDECIDED: the rule declared no predicate and no caller
 *   resolution named it, or its predicate could not be decided against this
 *   message. Presence is **not evaluated** for an undecided conditional; its
 *   length / value-set / cardinality rules still apply when present, and an
 *   undecided predicate additionally reports itself.
 * - `B` ⇒ no presence finding, on exactly the terms an undecided `C` gets.
 *
 * A DECIDED conditional never reaches here: {@link effectiveUsage} has already
 * reduced it to the simple code its condition predicate decided or its
 * resolution selected, so a `C(R/X)` whose predicate evaluated true arrives as
 * `R` and is checked on exactly `R`'s terms.
 *
 * @internal
 */
function presenceVerdict(
  usage: SimpleUsageCode | undefined,
  present: boolean,
): "required-absent" | "not-permitted" | null {
  if (usage === "R" && !present) return "required-absent";
  if (usage === "X" && present) return "not-permitted";
  return null;
}

/**
 * The simple usage code a rule is actually evaluated under.
 *
 * A simple code with no predicate is itself. A conditional usage takes its
 * outcome from exactly one of two sources, and the profile shape check has
 * already guaranteed they cannot both be present at one locus:
 *
 * - the rule's own **condition predicate**, evaluated against the message. True
 *   selects the true outcome and false the false one, for a declared
 *   conditional and for the bare `C` / `CE` codes alike (whose outcomes IHE
 *   states rather than the profile declaring them).
 * - a caller-supplied **resolution** at this rule's locus.
 *
 * With neither, and for a predicate the message could not decide, the answer is
 * `C`: presence not evaluated, every other constraint on the same terms. An
 * undecided predicate additionally emits its own finding, because "presence not
 * evaluated" must be visible rather than silent when the profile asked for it
 * to be evaluated.
 *
 * @internal
 */
function effectiveUsage(
  usage: UsageCode | undefined,
  key: string,
  resolved: ReadonlyMap<string, boolean>,
  predicate: PredicateEvaluation | undefined,
): SimpleUsageCode | undefined {
  if (usage === undefined) return undefined;
  const parsed = parseUsageToken(usage);
  // Unreachable through `validateAgainstProfile`: a token the grammar rejects
  // is a profile defect and the engine returns before evaluating anything.
  if (parsed === undefined) return undefined;
  if (predicate !== undefined) {
    const outcomes = predicateOutcomes(usage);
    // Also unreachable through `validateAgainstProfile`: a predicate on a
    // non-conditional usage is a profile defect and never gets this far.
    if (outcomes === undefined) return parsed.kind === "simple" ? parsed.code : "C";
    if (predicate.outcome === "true") return outcomes.whenTrue;
    if (predicate.outcome === "false") return outcomes.whenFalse;
    return "C";
  }
  if (parsed.kind === "simple") return parsed.code;
  const outcome = resolved.get(key);
  if (outcome === undefined) return "C";
  return outcome ? parsed.whenTrue : parsed.whenFalse;
}

/**
 * The finding an undecided predicate owes, or `null` when there is nothing to
 * report. One per RULE: the caller passes the locus the rule declares, without
 * an occurrence, because the predicate was decided over the whole message.
 *
 * The rendered locations are DEDUPED. A connector tree collects one entry per
 * undecidable leaf, and a leaf's rendering is a structural coordinate that says
 * nothing new when it repeats: a predicate that asks about `RXA-20` on both
 * sides of an `OR` owes the author one mention of `RXA-20`, not two. It also
 * bounds what a consumer persists, which matters because a finding is the part
 * of this engine that gets written to a log or a database: at the nesting depth
 * the language admits, a tree of identical leaves rendered one per leaf reaches
 * a megabyte of message for one finding.
 *
 * @internal
 */
function undecidedFinding(
  predicate: PredicateEvaluation | undefined,
  locus: FindingLocus,
  severity: FindingSeverity,
): ConformanceFinding | null {
  if (predicate === undefined || predicate.outcome !== "unevaluatable") return null;
  const at = [...new Set(predicate.undecided.map(describeLocation))];
  return F.conditionUnevaluatable(locus, at, severity);
}

/** Check a cardinality bound against an observed count; push a finding if out of range. @internal */
function checkCardinality(
  count: number,
  card: Cardinality | undefined,
  locus: FindingLocus,
  unit: "occurrence" | "repetition",
  severity: FindingSeverity,
  out: ConformanceFinding[],
): void {
  if (card === undefined) return;
  const { min, max } = card;
  if (typeof max === "number" && count > max) {
    out.push(F.cardinality(locus, count, card, unit, severity));
    return;
  }
  // `min` is only checked when the element is present (count > 0). An absent
  // Required element is reported as PROFILE_REQUIRED_ABSENT (a usage finding),
  // never a second cardinality finding; an absent optional element is fine.
  if (typeof min === "number" && count > 0 && count < min) {
    out.push(F.cardinality(locus, count, card, unit, severity));
  }
}

/**
 * Evaluate a field rule's declared component rules against ONE present
 * repetition of that field: each declared component's usage, then the content
 * the profile never declared.
 *
 * **A component's cardinality is implied by its usage, so the observable is
 * presence.** The methodology associates `[1..1]` with `R`, `[0..1]` with `RE`
 * and `O`, and `[0..0]` with `X`, and a component carries no repetition
 * construct in HL7 v2: `[1..1]` can only mean "valued here", `[0..0]` only
 * "not valued here". So the checks are the field-level `R` and `X` checks read
 * one level in, through the same {@link presenceVerdict} and the same finding
 * factories, and there is never a component cardinality finding to emit.
 *
 * **Declaring component rules CLOSES the field's component set**, which is the
 * whole basis of the undeclared-content check: the methodology counts content
 * in an element the profile does not specify as a conformance violation, and
 * its own worked example is data in a fourth component where the profile
 * defines three. A field rule that declares NO component rules declares no
 * depth and never reaches here, whether it omits the list or carries an EMPTY
 * one, so the check is opt-in per field rule and can never fire on a profile
 * authored before it existed.
 *
 * A conditional usage on a component rule is never decided: a component rule
 * declares no condition predicate and a caller resolution cannot name a
 * component. It is evaluated exactly as an undecided conditional field rule is,
 * which is presence not evaluated.
 *
 * @internal
 */
function checkComponents(
  rules: readonly ComponentRule[],
  rep: RawRepetition,
  base: FindingLocus,
  fieldSeverity: FindingSeverity,
  out: ConformanceFinding[],
): void {
  const declared = new Set<number>();
  for (const rule of rules) {
    declared.add(rule.component);
    const locus: FindingLocus = { ...base, component: rule.component };
    // A component rule inherits its field rule's severity unless it overrides
    // it, so downgrading a field rule downgrades its components with it.
    const severity: FindingSeverity = rule.severity ?? fieldSeverity;
    const usage = effectiveUsage(rule.usage, "", NO_RESOLUTIONS, undefined);
    const verdict = presenceVerdict(usage, componentHasValue(rep, rule.component));
    if (verdict === "required-absent") out.push(F.requiredAbsent(locus, severity));
    else if (verdict === "not-permitted") out.push(F.notPermitted(locus, severity));
  }

  // One finding per undeclared component index that carries content, in
  // ascending index order. An EMPTY undeclared component is not content: the
  // methodology's violation is the PRESENCE of unexpected content, and a
  // trailing separator is not presence.
  for (let index = 1; index <= rep.components.length; index++) {
    if (declared.has(index)) continue;
    if (!componentHasValue(rep, index)) continue;
    out.push(F.undeclaredContent({ ...base, component: index }, declared.size, fieldSeverity));
  }
}

/** Run every field rule of a segment rule against one occurrence of the segment. @internal */
function checkFields(
  seg: Segment,
  occurrence: number,
  declaredSegment: string,
  fields: readonly FieldRule[],
  resolved: ReadonlyMap<string, boolean>,
  readPredicate: (rule: SegmentRule | FieldRule) => PredicateEvaluation | undefined,
  out: ConformanceFinding[],
): void {
  for (const rule of fields) {
    const severity: FindingSeverity = rule.severity ?? "error";
    const field = seg.field(rule.field);
    const present = fieldHasValue(field);
    const baseLocus: FindingLocus = { segment: seg.type, field: rule.field, occurrence };

    // A resolution and a predicate both apply to the RULE, so the resolution is
    // keyed on the locus the PROFILE declares and the predicate is decided over
    // the whole message: both cover every occurrence and every repetition.
    const predicate = readPredicate(rule);
    const usage = effectiveUsage(
      rule.usage,
      locusKey(declaredSegment, rule.field),
      resolved,
      predicate,
    );
    // An undecided predicate is reported once for the rule, not once per
    // occurrence, and at the rule's own locus rather than any one occurrence's.
    if (occurrence === 0) {
      const undecided = undecidedFinding(
        predicate,
        { segment: seg.type, field: rule.field },
        severity,
      );
      if (undecided !== null) out.push(undecided);
    }
    const verdict = presenceVerdict(usage, present);
    if (verdict === "required-absent") {
      out.push(F.requiredAbsent(baseLocus, severity));
      continue; // nothing present to length/value/cardinality-check
    }
    if (verdict === "not-permitted") {
      out.push(F.notPermitted(baseLocus, severity));
      continue; // it should not be here; do not also value-check it
    }
    if (!present) continue; // absent-but-allowed (RE/O/C/CE): nothing to check

    const reps = field.repetitions;
    checkCardinality(reps.length, rule.cardinality, baseLocus, "repetition", severity, out);

    // Component rules are evaluated per PRESENT repetition. An empty repetition
    // (the middle of `A~~B`) carries no content at any component, so every
    // component check it could answer is answered by its emptiness: firing `R`
    // on each one would report the same absent repetition once per declared
    // component, and firing undeclared-content on it would report content that
    // is not there.
    //
    // The gate is "this rule CARRIES component rules", not "the key is set". An
    // EMPTY list declares no component rules, so it declares no depth and is
    // checked exactly as an omitted list is. Reading `[]` as a declaration of
    // depth ZERO would instead make every non-empty component undeclared
    // content, one finding per component per repetition per occurrence, from a
    // rule that constrains nothing; and `[]` is reachable by accident (a list
    // built by a filter, or read from configuration) with no cast at all.
    const componentRules = rule.components;
    if (componentRules !== undefined && componentRules.length > 0) {
      for (let r = 0; r < reps.length; r++) {
        const rep = reps[r];
        if (rep === undefined || !repetitionHasValue(rep)) continue;
        checkComponents(
          componentRules,
          rep,
          { segment: seg.type, field: rule.field, repetition: r, occurrence },
          severity,
          out,
        );
      }
    }

    if (rule.length === undefined && rule.valueSet === undefined) continue;
    const component = rule.component ?? 1;
    // The coding-system component defaults to two positions after the checked
    // one, which is the coded element's own code-to-system relationship: a code
    // at component 1 puts its system at 3, an alternate code at 4 puts its
    // alternate system at 6. A profile with no binding never reads it.
    const expectedSystem = boundCodingSystem(rule);
    const systemComponent = rule.codingSystemComponent ?? component + 2;
    for (let r = 0; r < reps.length; r++) {
      const rep = reps[r];
      if (rep === undefined) continue;
      const value = componentValue(rep, component);
      const locus: FindingLocus = {
        segment: seg.type,
        field: rule.field,
        component,
        repetition: r,
        occurrence,
      };
      if (rule.length !== undefined && value.length > rule.length) {
        out.push(F.length(locus, value.length, rule.length, severity));
      }
      if (rule.valueSet !== undefined && value !== "" && !rule.valueSet.includes(value)) {
        out.push(F.valueNotInSet(locus, rule.valueSet.length, severity));
      }
      // The coding-system check is INDEPENDENT of the membership check above:
      // each fires on its own merits, so a permitted code carried under the
      // wrong system yields exactly one coding-system finding and no value-set
      // finding, and a code wrong on both counts yields one of each.
      //
      // It is scoped to a repetition that carries something. An empty
      // repetition claims no code, so it has no provenance to be wrong about;
      // a repetition that carries a code and no resolvable system does, and
      // that case is a finding rather than a pass.
      if (expectedSystem !== undefined && repetitionHasValue(rep)) {
        const claimed = codingSystem(componentValue(rep, systemComponent));
        if (claimed?.id !== expectedSystem) {
          out.push(
            F.codingSystemMismatch(
              { ...locus, component: systemComponent },
              expectedSystem,
              severity,
            ),
          );
        }
      }
    }
  }
}

/** Run one segment rule (presence + cardinality + per-occurrence field rules). @internal */
function checkSegment(
  message: Hl7Message,
  rule: SegmentRule,
  resolved: ReadonlyMap<string, boolean>,
  readPredicate: (r: SegmentRule | FieldRule) => PredicateEvaluation | undefined,
  out: ConformanceFinding[],
): void {
  const severity: FindingSeverity = rule.severity ?? "error";
  const occurrences = message.segments(rule.segment);
  const count = occurrences.length;
  const present = count > 0;
  const segLocus: FindingLocus = { segment: rule.segment };

  const predicate = readPredicate(rule);
  const usage = effectiveUsage(rule.usage, locusKey(rule.segment, undefined), resolved, predicate);
  const undecided = undecidedFinding(predicate, segLocus, severity);
  if (undecided !== null) out.push(undecided);
  const verdict = presenceVerdict(usage, present);
  if (verdict === "required-absent") {
    out.push(F.requiredAbsent(segLocus, severity));
    return; // no occurrences → nothing else to check
  }
  if (verdict === "not-permitted") {
    out.push(F.notPermitted(segLocus, severity));
    return; // present-but-forbidden; do not descend into its fields
  }

  checkCardinality(count, rule.cardinality, segLocus, "occurrence", severity, out);

  if (!present || rule.fields === undefined) return;
  for (let occ = 0; occ < occurrences.length; occ++) {
    const seg = occurrences[occ];
    if (seg === undefined) continue;
    checkFields(seg, occ, rule.segment, rule.fields, resolved, readPredicate, out);
  }
}

/**
 * Validate a parsed HL7 v2 message against a **user-authored** declarative
 * conformance profile and return typed findings.
 *
 * **Never throws.** A well-formed profile is evaluated rule by rule; a
 * malformed profile is reported as `PROFILE_MALFORMED` findings (the engine
 * does not validate against a profile it cannot trust: never a silent pass).
 * Either way you get a {@link ConformanceResult}. For fail-fast authoring, run
 * {@link defineConformanceProfile} first: it throws on a malformed profile.
 *
 * **`findings.length === 0` is NOT a conformance attestation.** It means every
 * rule the profile declared was satisfied: nothing about the parts of the
 * message the profile did not cover, and nothing about clinical correctness.
 *
 * **No PHI in findings**: each finding names the structural locus (segment /
 * field / component / repetition) and the rule, never the offending value.
 *
 * **Read-only**: the message is never mutated.
 *
 * **A conditional usage takes its outcome from one source, never two.** A rule
 * that declares a {@link ConditionPredicate} on its `condition` has it
 * evaluated against the message, and the true or false outcome selects the
 * usage the rest of the rule is checked under: the outcomes a declared
 * conditional such as `C(R/X)` writes down, or the ones IHE states for the bare
 * `C` and `CE` codes. A rule that declares none takes the outcome of a matching
 * {@link UsageResolution} in `resolutions` instead. Declaring both at one locus
 * is `PROFILE_MALFORMED`. With neither, the rule is evaluated exactly as a `C`
 * rule is: presence not evaluated, every other constraint applied as usual.
 *
 * **A predicate the message cannot decide is reported, never guessed.** It
 * yields a `PROFILE_CONDITION_UNEVALUATABLE` finding and the element's presence
 * is not assessed, so an unassessed conditional can never hide inside an empty
 * findings list.
 *
 * **A value set may be bound to the coding system its codes come from.** A rule
 * that declares {@link FieldRule.codingSystem} has the message's own
 * coding-system component compared against it by resolved identity, per present
 * repetition, and a mismatch is `PROFILE_CODING_SYSTEM_MISMATCH`: a distinct
 * code, so "a code we do not accept" and "a code that looks right but claims
 * the wrong system" stop being one answer. The check is additive and opt-in: a
 * rule that declares no binding behaves exactly as it always has. Still no code
 * set and still no network call, because this compares the sender's CLAIM
 * against the profile and never the code against a terminology.
 *
 * **A field rule may declare what its COMPONENTS are, and doing so closes the
 * set.** Each entry of `components` carries a 1-indexed index and an optional
 * usage code whose cardinality is IMPLIED rather than declared (`R` is
 * `[1..1]`, `RE` and `O` are `[0..1]`, `X` is `[0..0]`; a component has no
 * repetition construct, so each reduces to presence). Per present repetition,
 * `R` with nothing at that component is `PROFILE_REQUIRED_ABSENT` and `X` with
 * something there is `PROFILE_NOT_PERMITTED`, both at a locus naming the
 * component. Content at an index the rule does NOT declare is
 * `PROFILE_UNDECLARED_CONTENT`, one finding per undeclared index per
 * repetition: the methodology counts content in an element the profile never
 * specified as a conformance violation rather than harmless extra content. A
 * field rule that declares no `components` declares no depth and is checked
 * exactly as it always was, so this is additive and opt-in per rule.
 *
 * **Every result carries the {@link ProfileLevel} in force**, beside the
 * profile name, because an empty findings list means two different things at
 * two different levels. A profile may declare
 * {@link ConformanceProfile.level}; one that declares none is assessed and
 * echoed as `constrainable`, the weaker claim, so silence never reads as
 * `implementable`. A profile that DOES claim `implementable` is held to the
 * level's own terminus at profile-shape time: every segment, field and
 * component rule must declare a usage, and that usage must be `R`, `RE` or `X`
 * or a declared conditional whose outcomes are drawn from those three. A claim
 * that fails is `PROFILE_MALFORMED`, and a refused claim is never the level
 * echoed on the result. The level changes no message check at all: it decides
 * which findings the PROFILE is refused for, never which findings a MESSAGE
 * produces.
 *
 * Omitting `resolutions` (or passing `undefined`) is the same as passing an
 * empty list. Any OTHER value that is not a list of well-formed resolutions is
 * a `PROFILE_MALFORMED` finding, never read as "no resolutions": a mis-typed
 * argument must not return a clean result for elements nothing checked.
 *
 * @param message - a parsed message from {@link parseHL7}.
 * @param profile - the consumer's declarative {@link ConformanceProfile}.
 * @param resolutions - optional caller-supplied outcomes for declared-conditional rules that declare no predicate.
 * @returns the profile name, the level in force, and the ordered findings (empty ⇒ no declared rule violated).
 *
 * @example
 * ```ts
 * import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";
 *
 * const profile: ConformanceProfile = {
 *   name: "example-adt-min",
 *   segments: [
 *     { segment: "PID", usage: "R", fields: [
 *       { field: 3, name: "Patient Identifiers", usage: "R" },
 *       {
 *         field: 8,
 *         name: "Administrative Sex",
 *         usage: "C(RE/X)",
 *         // "Required but may be empty when a birth date was sent, else not permitted."
 *         condition: { location: { segment: "PID", field: 7 }, presence: "is valued" },
 *         valueSet: ["M", "F", "U"],
 *       },
 *     ] },
 *   ],
 * };
 *
 * const { findings } = validateAgainstProfile(parseHL7(raw), profile);
 * for (const f of findings) console.log(f.severity, f.code, f.message);
 * // findings.length === 0 ⇒ no declared rule violated (NOT an attestation)
 * ```
 */
export function validateAgainstProfile(
  message: Hl7Message,
  profile: ConformanceProfile,
  resolutions?: readonly UsageResolution[],
): ConformanceResult {
  // Profile-shape defects first, in the order the profile declares them;
  // resolution defects after them, in supply order.
  const resolved = analyzeResolutions(resolutions, profile);
  const defects = [...collectProfileDefects(profile), ...resolved.defects];
  if (defects.length > 0) {
    // The level is echoed here too, on a result whose profile may be malformed
    // enough that even its NAME fell back to a sentinel: a consumer reading
    // `level` must never have to check whether it is there. An implementable
    // claim is refused on this branch by construction, so the echo falls back
    // to the weaker claim rather than repeating one nothing verified.
    const findings = defects.map((d) => F.malformed(d.locus, d.detail));
    return Object.freeze({
      profileName: safeName(profile),
      level: levelInForce(profile, true),
      findings: Object.freeze(findings),
    });
  }

  const out: ConformanceFinding[] = [];
  const readPredicate = predicateReader(message);
  for (const rule of profile.segments) {
    checkSegment(message, rule, resolved.applied, readPredicate, out);
  }
  return Object.freeze({
    profileName: profile.name,
    level: levelInForce(profile, false),
    findings: Object.freeze(out),
  });
}
