/**
 * Finding factories for the conformance-profile engine.
 * Every {@link ConformanceFinding} the engine emits is built here so that
 * message wording, severity, and (critically) **PHI safety** stay consistent
 * across the engine.
 *
 * The one rule every factory obeys: **a finding message names the structural
 * locus and the rule, never the offending value.** A value-set miss reports the
 * SIZE of the value set and the locus; a length overflow reports the declared
 * limit and the locus; neither ever embeds the field's content. This mirrors
 * the parser's warning discipline (`src/parser/warnings.ts`): the locus is the
 * PHI-free coordinate; the value stays in the (unmodified) message.
 *
 * @internal
 */

import {
  FINDING_CODES,
  type ConformanceFinding,
  type FindingLocus,
  type FindingSeverity,
} from "./types.js";

/**
 * Render a {@link FindingLocus} as a compact human string for a finding
 * message: `PID`, `PID-3`, `PID-8 component 1`, `PID[1]-3 rep 2`. Structural
 * indices only; never a value. Used only to build the PHI-safe `message`.
 *
 * @internal
 */
export function describeLocus(locus: FindingLocus): string {
  let s = locus.segment;
  if (locus.occurrence !== undefined && locus.occurrence > 0) {
    s += `[occurrence ${String(locus.occurrence)}]`;
  }
  if (locus.field !== undefined) {
    s += `-${String(locus.field)}`;
  }
  if (locus.repetition !== undefined) {
    s += ` rep ${String(locus.repetition)}`;
  }
  if (locus.component !== undefined) {
    s += ` component ${String(locus.component)}`;
  }
  return s;
}

/**
 * A Required (`R`) element is absent. Segment-level when `locus.field` is
 * absent; field-level otherwise.
 *
 * @internal
 */
export function requiredAbsent(locus: FindingLocus, severity: FindingSeverity): ConformanceFinding {
  return {
    code: FINDING_CODES.PROFILE_REQUIRED_ABSENT,
    severity,
    locus,
    message: `Required ${elementKind(locus)} ${describeLocus(locus)} is absent or empty (usage R).`,
  };
}

/**
 * A Not-permitted (`X`) element is present. Segment- or field-level per
 * `locus.field`.
 *
 * @internal
 */
export function notPermitted(locus: FindingLocus, severity: FindingSeverity): ConformanceFinding {
  const kind = elementKind(locus);
  return {
    code: FINDING_CODES.PROFILE_NOT_PERMITTED,
    severity,
    locus,
    message: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${describeLocus(
      locus,
    )} is present but the profile marks it not-permitted (usage X).`,
  };
}

/**
 * A present repetition carries a non-empty value at a component index the field
 * rule does not declare.
 *
 * The message names the locus and the NUMBER of components the rule declares,
 * and nothing else. That count is profile shape rather than message content, on
 * exactly the terms {@link valueNotInSet} reports the SIZE of a value set: it
 * tells an author how deep their rule reaches, which is the fact they need to
 * either widen the rule or take the finding seriously.
 *
 * **The surprising value is never named**, and this is the factory most tempted
 * to name it: an author reading "there is content you did not declare" wants to
 * know what it was. The component is undeclared precisely because the profile
 * says nothing about it, so its content is unconstrained message content and
 * therefore PHI until proven otherwise. The locus says where to look in the
 * message the caller already holds.
 *
 * @internal
 */
export function undeclaredContent(
  locus: FindingLocus,
  declaredComponents: number,
  severity: FindingSeverity,
): ConformanceFinding {
  return {
    code: FINDING_CODES.PROFILE_UNDECLARED_CONTENT,
    severity,
    locus,
    message:
      `${describeLocus(locus)} carries content at a component the profile does not declare ` +
      `(the field rule declares ${String(declaredComponents)} component(s)).`,
  };
}

/**
 * Which level of the positional tree a locus names, for a finding message.
 * Component before field before segment, because a locus narrows from the
 * outside in and the innermost index it carries is the element the finding is
 * about.
 *
 * @internal
 */
function elementKind(locus: FindingLocus): "segment" | "field" | "component" {
  if (locus.component !== undefined) return "component";
  return locus.field === undefined ? "segment" : "field";
}

/**
 * A repetition / occurrence count is outside the declared cardinality. `actual`
 * and the `min` / `max` bounds are structural integers: never a value.
 *
 * @internal
 */
export function cardinality(
  locus: FindingLocus,
  actual: number,
  bound: { readonly min?: number; readonly max?: number | "*" },
  unit: "occurrence" | "repetition",
  severity: FindingSeverity,
): ConformanceFinding {
  const parts: string[] = [];
  if (bound.min !== undefined) parts.push(`min ${String(bound.min)}`);
  if (bound.max !== undefined) parts.push(`max ${String(bound.max)}`);
  return {
    code: FINDING_CODES.PROFILE_CARDINALITY,
    severity,
    locus,
    message: `${describeLocus(locus)} has ${String(actual)} ${unit}(s), outside the declared cardinality (${parts.join(
      ", ",
    )}).`,
  };
}

/**
 * A checked component value exceeds the declared maximum length. The message
 * reports the declared `max` and the observed length **count**: never the
 * value, and never any substring of it (a length count is a coarse shape fact,
 * consistent with the parser's `FIELD_WHITESPACE_TRIMMED` count-only policy).
 *
 * @internal
 */
export function length(
  locus: FindingLocus,
  actualLength: number,
  maxLength: number,
  severity: FindingSeverity,
): ConformanceFinding {
  return {
    code: FINDING_CODES.PROFILE_LENGTH,
    severity,
    locus,
    message: `${describeLocus(locus)} value length ${String(
      actualLength,
    )} exceeds the declared maximum of ${String(maxLength)}.`,
  };
}

/**
 * A checked component value is not a member of the consumer-supplied value set.
 * The message reports the locus and the **size** of the value set: never the
 * offending value and never the permitted codes' content beyond their count.
 *
 * @internal
 */
export function valueNotInSet(
  locus: FindingLocus,
  valueSetSize: number,
  severity: FindingSeverity,
): ConformanceFinding {
  return {
    code: FINDING_CODES.PROFILE_VALUE_NOT_IN_SET,
    severity,
    locus,
    message: `${describeLocus(
      locus,
    )} value is not in the profile value set (${String(valueSetSize)} permitted code(s)).`,
  };
}

/**
 * A present repetition does not carry the coding system the rule binds its
 * value set to.
 *
 * The message names the EXPECTED system and the locus, and nothing else. Two
 * halves of that are deliberate:
 *
 * - The `expected` identifier is the RESOLVED registered acronym rather than
 *   whatever spelling the profile author wrote, so the text is drawn from the
 *   library's own frozen provenance map and can carry nothing a caller
 *   supplied. It is what the author needs to see anyway: the identity the
 *   comparison was actually made against.
 * - The OFFENDING claim is never named, on exactly the terms
 *   {@link valueNotInSet} never names the offending code. A coding-system
 *   component is read out of the message, so it is message content, and message
 *   content does not travel into a consumer's logs however innocuous one
 *   instance of it looks.
 *
 * The wording covers a wrong system, an unrecognized one, a blank one and an
 * absent one with one sentence, because they are one finding with one remedy
 * and distinguishing them in the text would have to describe what was found.
 *
 * @internal
 */
export function codingSystemMismatch(
  locus: FindingLocus,
  expected: string,
  severity: FindingSeverity,
): ConformanceFinding {
  return {
    code: FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH,
    severity,
    locus,
    message: `${describeLocus(
      locus,
    )} does not carry the coding system the profile binds this value set to (expected ${expected}).`,
  };
}

/**
 * A rule's declared condition predicate could not be decided against this
 * message, so its usage outcome was never selected and the element's presence
 * was NOT assessed.
 *
 * `undecidedAt` is the pre-rendered, DEDUPED structural description of the
 * location(s) the predicate could not be decided at (`RXA-20`, `PID-5
 * component 1`), which is what an author needs to fix it. A repeated coordinate
 * says nothing new and a finding is what a consumer persists, so the caller
 * collapses repeats before the message is built. Like every other factory here it
 * carries no value read from the message: and, because a predicate's value list
 * is profile content that a consumer's logs must not accumulate either, no
 * value drawn from the predicate's own list.
 *
 * @internal
 */
export function conditionUnevaluatable(
  locus: FindingLocus,
  undecidedAt: readonly string[],
  severity: FindingSeverity,
): ConformanceFinding {
  const kind = locus.field === undefined ? "segment" : "field";
  const at =
    undecidedAt.length === 0 ? "" : ` (no content to compare at ${undecidedAt.join(", ")})`;
  return {
    code: FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE,
    severity,
    locus,
    message:
      `The condition predicate for ${kind} ${describeLocus(locus)} could not be evaluated against this message${at}, ` +
      `so its usage was not decided and its presence was not assessed.`,
  };
}

/**
 * The profile ITSELF is structurally malformed. A diagnostic about the
 * **profile**, not the message: always `error` severity. `detail` describes
 * the shape defect (a profile is author-supplied configuration, not clinical
 * data, so it carries no PHI).
 *
 * @internal
 */
export function malformed(locus: FindingLocus, detail: string): ConformanceFinding {
  return {
    code: FINDING_CODES.PROFILE_MALFORMED,
    severity: "error",
    locus,
    message: `Malformed conformance profile: ${detail}`,
  };
}
