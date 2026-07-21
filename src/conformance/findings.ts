/**
 * Finding factories for the conformance-profile engine (roadmap Phase U).
 * Every {@link ConformanceFinding} the engine emits is built here so that
 * message wording, severity, and — critically — **PHI safety** stay consistent
 * across the engine.
 *
 * The one rule every factory obeys: **a finding message names the structural
 * locus and the rule, never the offending value.** A value-set miss reports the
 * SIZE of the value set and the locus; a length overflow reports the declared
 * limit and the locus; neither ever embeds the field's content. This mirrors
 * the parser's warning discipline (`src/parser/warnings.ts`) — the locus is the
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
 * message — `PID`, `PID-3`, `PID-8 component 1`, `PID[1]-3 rep 2`. Structural
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
  const kind = locus.field === undefined ? "segment" : "field";
  return {
    code: FINDING_CODES.PROFILE_REQUIRED_ABSENT,
    severity,
    locus,
    message: `Required ${kind} ${describeLocus(locus)} is absent or empty (usage R).`,
  };
}

/**
 * A Not-permitted (`X`) element is present. Segment- or field-level per
 * `locus.field`.
 *
 * @internal
 */
export function notPermitted(locus: FindingLocus, severity: FindingSeverity): ConformanceFinding {
  const kind = locus.field === undefined ? "segment" : "field";
  return {
    code: FINDING_CODES.PROFILE_NOT_PERMITTED,
    severity,
    locus,
    message: `${kind === "segment" ? "Segment" : "Field"} ${describeLocus(
      locus,
    )} is present but the profile marks it not-permitted (usage X).`,
  };
}

/**
 * A repetition / occurrence count is outside the declared cardinality. `actual`
 * and the `min` / `max` bounds are structural integers — never a value.
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
 * reports the declared `max` and the observed length **count** — never the
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
 * The message reports the locus and the **size** of the value set — never the
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
 * The profile ITSELF is structurally malformed. A diagnostic about the
 * **profile**, not the message — always `error` severity. `detail` describes
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
