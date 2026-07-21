/**
 * The conformance-profile engine (roadmap Phase U) — `validateAgainstProfile`.
 * Runs a **consumer-authored** declarative {@link ConformanceProfile} against a
 * parsed {@link Hl7Message} and returns typed {@link ConformanceFinding}s.
 *
 * The sanctioned functionality-plane replacement for the retired vendor-corpus
 * arc: the consumer brings the profile and every value set; hl7 ships **no**
 * profile, **no** code set, and makes **no** network call. Four invariants the
 * engine holds absolutely:
 *
 * 1. **Never throws.** Any message × any profile (even a malformed profile, or a
 *    value cast through `any`) yields a {@link ConformanceResult}, never an
 *    exception. A malformed profile becomes `PROFILE_MALFORMED` findings.
 * 2. **Valid ⇒ zero findings**, and **zero findings is NOT an attestation** —
 *    it means no *declared* rule was violated, nothing more (see
 *    {@link ConformanceResult}).
 * 3. **No PHI in findings.** Findings name the structural locus and the rule —
 *    never the offending value (see `src/conformance/findings.ts`).
 * 4. **Read-only.** Validation never mutates the message.
 */

import type { Hl7Message } from "../model/message.js";
import type { RawRepetition } from "../parser/types.js";

import type { Field } from "../model/field.js";
import type { Segment } from "../model/segment.js";
import * as F from "./findings.js";
import { collectProfileDefects } from "./profile-shape.js";
import {
  type Cardinality,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type FieldRule,
  type FindingLocus,
  type FindingSeverity,
  type SegmentRule,
  type UsageCode,
} from "./types.js";

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
 * Evaluate a presence obligation for a usage code against an observed
 * presence flag, returning the finding kind to emit (or `null`). Shared by the
 * segment- and field-level checks so the R / X / RE / O / C / CE semantics are
 * defined in exactly one place.
 *
 * - `R` absent ⇒ `"required-absent"`.
 * - `X` present ⇒ `"not-permitted"`.
 * - `RE` / `O` ⇒ no presence finding (RE absence is never a violation).
 * - `C` / `CE` ⇒ no presence finding — this bounded engine ships no
 *   predicate language, so a conditional element's presence is **not
 *   evaluated** (a documented defer, roadmap §5). Its length / value-set /
 *   cardinality rules still apply when present.
 *
 * @internal
 */
function presenceVerdict(
  usage: UsageCode | undefined,
  present: boolean,
): "required-absent" | "not-permitted" | null {
  if (usage === "R" && !present) return "required-absent";
  if (usage === "X" && present) return "not-permitted";
  return null;
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
  fields: readonly FieldRule[],
  out: ConformanceFinding[],
): void {
  for (const rule of fields) {
    const severity: FindingSeverity = rule.severity ?? "error";
    const field = seg.field(rule.field);
    const present = fieldHasValue(field);
    const baseLocus: FindingLocus = { segment: seg.type, field: rule.field, occurrence };

    const verdict = presenceVerdict(rule.usage, present);
    if (verdict === "required-absent") {
      out.push(F.requiredAbsent(baseLocus, severity));
      continue; // nothing present to length/value/cardinality-check
    }
    if (verdict === "not-permitted") {
      out.push(F.notPermitted(baseLocus, severity));
      continue; // it should not be here; do not also value-check it
    }
    if (!present) continue; // absent-but-allowed (RE/O/C/CE) — nothing to check

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
function checkSegment(message: Hl7Message, rule: SegmentRule, out: ConformanceFinding[]): void {
  const severity: FindingSeverity = rule.severity ?? "error";
  const occurrences = message.segments(rule.segment);
  const count = occurrences.length;
  const present = count > 0;
  const segLocus: FindingLocus = { segment: rule.segment };

  const verdict = presenceVerdict(rule.usage, present);
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
    checkFields(seg, occ, rule.fields, out);
  }
}

/**
 * Validate a parsed HL7 v2 message against a **user-authored** declarative
 * conformance profile (roadmap Phase U) and return typed findings.
 *
 * **Never throws.** A well-formed profile is evaluated rule by rule; a
 * malformed profile is reported as `PROFILE_MALFORMED` findings (the engine
 * does not validate against a profile it cannot trust — never a silent pass).
 * Either way you get a {@link ConformanceResult}. For fail-fast authoring, run
 * {@link defineConformanceProfile} first — it throws on a malformed profile.
 *
 * **`findings.length === 0` is NOT a conformance attestation.** It means every
 * rule the profile declared was satisfied — nothing about the parts of the
 * message the profile did not cover, and nothing about clinical correctness.
 *
 * **No PHI in findings** — each finding names the structural locus (segment /
 * field / component / repetition) and the rule, never the offending value.
 *
 * **Read-only** — the message is never mutated.
 *
 * @param message - a parsed message from {@link parseHL7}.
 * @param profile - the consumer's declarative {@link ConformanceProfile}.
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
 *       { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
 *     ] },
 *   ],
 * };
 *
 * const msg = parseHL7(raw);
 * const { findings } = validateAgainstProfile(msg, profile);
 * for (const f of findings) console.log(f.severity, f.code, f.message);
 * // findings.length === 0 ⇒ no declared rule violated (NOT an attestation)
 * ```
 */
export function validateAgainstProfile(
  message: Hl7Message,
  profile: ConformanceProfile,
): ConformanceResult {
  const defects = collectProfileDefects(profile);
  if (defects.length > 0) {
    const findings = defects.map((d) => F.malformed(d.locus, d.detail));
    return Object.freeze({ profileName: safeName(profile), findings: Object.freeze(findings) });
  }

  const out: ConformanceFinding[] = [];
  for (const rule of profile.segments) {
    checkSegment(message, rule, out);
  }
  return Object.freeze({ profileName: profile.name, findings: Object.freeze(out) });
}
