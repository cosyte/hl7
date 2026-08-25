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

import type { Field } from "../model/field.js";
import type { Segment } from "../model/segment.js";
import * as F from "./findings.js";
import { describeLocation, evaluatePredicate, type PredicateEvaluation } from "./predicate.js";
import { collectProfileDefects } from "./profile-shape.js";
import { analyzeResolutions, locusKey } from "./resolutions.js";
import {
  type Cardinality,
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

/** Does the field carry any non-empty content in any repetition/component/subcomponent? @internal */
function fieldHasValue(field: Field): boolean {
  return field.repetitions.some((rep) =>
    rep.components.some((comp) => comp.subcomponents.some((sub) => sub !== "")),
  );
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
 * - `C` / `CE` ⇒ no presence finding: this bounded engine ships no
 *   predicate language, so a conditional element's presence is **not
 *   evaluated** (a documented defer). Its length / value-set / cardinality
 *   rules still apply when present.
 * - `B` ⇒ no presence finding, on exactly the terms `C` gets.
 *
 * A declared conditional never reaches here: {@link effectiveUsage} has already
 * reduced it to the simple code its resolution selects, or to `C` when nothing
 * resolved it.
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
 * @internal
 */
function undecidedFinding(
  predicate: PredicateEvaluation | undefined,
  locus: FindingLocus,
  severity: FindingSeverity,
): ConformanceFinding | null {
  if (predicate === undefined || predicate.outcome !== "unevaluatable") return null;
  return F.conditionUnevaluatable(locus, predicate.undecided.map(describeLocation), severity);
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

    if (rule.length === undefined && rule.valueSet === undefined) continue;
    const component = rule.component ?? 1;
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
 * Omitting `resolutions` (or passing `undefined`) is the same as passing an
 * empty list. Any OTHER value that is not a list of well-formed resolutions is
 * a `PROFILE_MALFORMED` finding, never read as "no resolutions": a mis-typed
 * argument must not return a clean result for elements nothing checked.
 *
 * @param message - a parsed message from {@link parseHL7}.
 * @param profile - the consumer's declarative {@link ConformanceProfile}.
 * @param resolutions - optional caller-supplied outcomes for declared-conditional rules that declare no predicate.
 * @returns the profile name and the ordered findings (empty ⇒ no declared rule violated).
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
    const findings = defects.map((d) => F.malformed(d.locus, d.detail));
    return Object.freeze({ profileName: safeName(profile), findings: Object.freeze(findings) });
  }

  const out: ConformanceFinding[] = [];
  const readPredicate = predicateReader(message);
  for (const rule of profile.segments) {
    checkSegment(message, rule, resolved.applied, readPredicate, out);
  }
  return Object.freeze({ profileName: profile.name, findings: Object.freeze(out) });
}
