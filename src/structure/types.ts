/**
 * Public types for the **published-structure validator**: the opt-in check that
 * asks whether a parsed message follows the shape HL7 publishes for its trigger
 * event, in the published order, with each segment appearing as many times as
 * the publication allows.
 *
 * It is a third, distinct thing beside the two structural surfaces this package
 * already ships, and the distinction is the whole point:
 *
 * - `Hl7Message.structure` is a parse-time **presence** net. It asks only
 *   whether a segment the publication gives a minimum of one is present at all,
 *   it runs on every parse, and it is the source of the additive
 *   `MISSING_EXPECTED_GROUP` warning. It reads no order and no maximum.
 * - `validateAgainstProfile` runs a profile the **caller authored**: usage,
 *   cardinality, length and a caller-supplied value set, down to the component.
 *   It knows nothing about HL7's published message structures.
 * - {@link validateMessageStructure}, here, runs HL7's **own published**
 *   structure against the message, at segment granularity: order, occurrence
 *   counts, and segments the published structure does not name. Nobody authors
 *   it and nobody can tune it, because it is read off the vendored publication.
 *
 * Four invariants govern it, and they are the conformance engine's, restated
 * for this surface rather than re-derived:
 *
 * 1. **It never throws.** Every input the parser produced, and every message
 *    type the registry does not model, yields a result.
 * 2. **Zero findings is NOT an attestation.** It means the published structure
 *    was not violated in the three ways checked here. It says nothing about
 *    field content, datatypes, value sets or clinical correctness, and nothing
 *    at all about a message type the registry does not model.
 * 3. **No PHI in a finding.** A finding names a segment name, an occurrence
 *    index and a published structure id, and nothing read out of a field.
 * 4. **It is read-only.** Validating a message changes nothing about it: not
 *    its segments, not its warnings, not its serialization.
 *
 * @see validateMessageStructure
 */

import type { FindingSeverity } from "../conformance/types.js";

/**
 * The frozen registry of published-structure finding codes. Stable, additive
 * string codes: a consumer compares
 * `finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY`.
 *
 * Deliberately separate from the conformance engine's `FINDING_CODES`. Those
 * report a violation of a profile the CALLER wrote; these report a divergence
 * from the publication itself, and a consumer routing the two to the same place
 * is making a decision rather than inheriting one.
 *
 * @example
 * ```ts
 * import { validateMessageStructure, STRUCTURE_FINDING_CODES } from "@cosyte/hl7";
 * const { findings } = validateMessageStructure(msg);
 * const misordered = findings.filter(
 *   (f) => f.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
 * );
 * ```
 */
export const STRUCTURE_FINDING_CODES = {
  /**
   * A segment appears where the published structure does not allow it: the
   * message's segment sequence stops being a beginning the published order
   * allows.
   *
   * The order is read against the publication's own bounds, at every locus: a
   * node may occur as few and as many times as the publication says there, so a
   * group's required leading segment cannot be skipped on one occurrence and
   * consumed on the next, whether or not that group repeats. The one bound
   * dropped for a segment name is the one the cardinality check already
   * reported for it, so that too few or too many occurrences is one finding
   * rather than two.
   *
   * Where two segments arrive in an order the publication does not allow, the
   * finding names the one that arrived late: the segment the published order
   * puts first and the message delivered second, at the occurrence the message
   * carries it. That is not always where the reading stopped, because the
   * publication is often free to skip past the segment a message delayed, so an
   * adjacent pair whose exchange the publication derives is what identifies the
   * two. Every adjacent pair is asked, not a shortlist near the stop: in a
   * message that repeats a group the pair can sit well in front of it. Where
   * more than one pair would do, the earliest is named. Where no exchange
   * derives, the defect is not two segments in the wrong order: the finding then
   * names the segment that belonged where the reading stopped, and failing that
   * the one that could not be placed.
   */
  STRUCTURE_SEGMENT_OUT_OF_ORDER: "STRUCTURE_SEGMENT_OUT_OF_ORDER",
  /**
   * A segment occurs fewer times than the published structure's minimum along
   * the path from the structure root, or more times than its maximum.
   */
  STRUCTURE_SEGMENT_CARDINALITY: "STRUCTURE_SEGMENT_CARDINALITY",
  /**
   * A segment the published structure does not name anywhere, a `Z` segment
   * included. Distinct from the other two on purpose: a segment the publication
   * never mentions has no position to be out of and no count to exceed.
   *
   * A line carrying no segment name at all is not one of these. A message
   * ending with a segment terminator parses as a trailing segment whose type is
   * the empty string, and the publication names segments rather than blank
   * lines; the parse reports that line, under `UNKNOWN_SEGMENT`.
   */
  STRUCTURE_SEGMENT_UNEXPECTED: "STRUCTURE_SEGMENT_UNEXPECTED",
} as const;

/**
 * Discriminant union of every {@link StructureFinding} code. Enables exhaustive
 * `switch` narrowing.
 *
 * @example
 * ```ts
 * import type { StructureFindingCode } from "@cosyte/hl7";
 * const code: StructureFindingCode = "STRUCTURE_SEGMENT_UNEXPECTED";
 * ```
 */
export type StructureFindingCode =
  (typeof STRUCTURE_FINDING_CODES)[keyof typeof STRUCTURE_FINDING_CODES];

/**
 * The **structural** locus a published-structure finding refers to: a segment
 * name, the 0-indexed occurrence of that segment where one occurrence is
 * responsible, and the published structure the finding was raised against.
 *
 * Every member is a name or an index, so a locus is **inherently PHI-free** and
 * never carries a field value. The occurrence index counts occurrences of that
 * segment name, the same way a conformance finding's does.
 *
 * @example
 * ```ts
 * import type { StructureFindingLocus } from "@cosyte/hl7";
 * const locus: StructureFindingLocus = { segment: "PID", occurrence: 1, structureId: "ADT_A01-A" };
 * ```
 */
export interface StructureFindingLocus {
  /** Segment name (e.g. `"PID"`), bounded to the shape a segment id may take. */
  readonly segment: string;
  /**
   * 0-indexed occurrence of that segment name, present when one occurrence is
   * responsible. A minimum-cardinality finding names no occurrence: the
   * responsible occurrence is the one that is not there.
   */
  readonly occurrence?: number;
  /** The published structure variant the finding was raised against. */
  readonly structureId: string;
}

/**
 * One typed published-structure finding: the {@link StructureFindingCode}, a
 * severity, the structural {@link StructureFindingLocus}, and a human-readable
 * `message`.
 *
 * **The `message` is PHI-safe by construction**: it names the segment, the
 * occurrence, the published structure and the counts involved, and never a
 * value read out of the message.
 *
 * @example
 * ```ts
 * import type { StructureFinding } from "@cosyte/hl7";
 * const f: StructureFinding = {
 *   code: "STRUCTURE_SEGMENT_CARDINALITY",
 *   severity: "error",
 *   locus: { segment: "EVN", structureId: "ADT_A01-A" },
 *   message: 'Segment "EVN" occurs 0 times; published structure ADT_A01-A requires at least 1.',
 * };
 * ```
 */
export interface StructureFinding {
  /** Which check fired. */
  readonly code: StructureFindingCode;
  /**
   * How hard a finding this is.
   *
   * An ordering or cardinality finding is an `error`: the publication states a
   * constraint and the message breaks it. An unexpected segment is a `warning`,
   * because HL7 reserves `Z` segments for exactly this and a site-defined
   * segment in a live feed is normal traffic rather than a broken message. The
   * check still fires, under its own code, so a consumer that wants it to be an
   * error can make it one.
   */
  readonly severity: FindingSeverity;
  /** Where in the message, structurally. */
  readonly locus: StructureFindingLocus;
  /** Human-readable description of the rule that fired. Carries no field value. */
  readonly message: string;
}

/**
 * The frozen registry of reasons validation did not run. Every one of them is a
 * question the publication cannot answer for this message, never a defect
 * found in it.
 *
 * @example
 * ```ts
 * import { validateMessageStructure, STRUCTURE_NOT_VALIDATED_REASONS } from "@cosyte/hl7";
 * const result = validateMessageStructure(msg);
 * const unmodelled =
 *   result.reason === STRUCTURE_NOT_VALIDATED_REASONS.UNRECOGNIZED_MESSAGE_TYPE;
 * ```
 */
export const STRUCTURE_NOT_VALIDATED_REASONS = {
  /** MSH-9.1 is absent or blank, so there is no message type to resolve. */
  NO_MESSAGE_TYPE: "NO_MESSAGE_TYPE",
  /** The structure registry models no published structure for this message type. */
  UNRECOGNIZED_MESSAGE_TYPE: "UNRECOGNIZED_MESSAGE_TYPE",
  /**
   * The message type is recognized only through a retained transcription: the
   * publication carries no structure for it, so there is no published order and
   * no published maximum to check against.
   */
  RETAINED_TRANSCRIPTION: "RETAINED_TRANSCRIPTION",
  /**
   * The registry entry resolves to no ordered expectation at all. A published
   * structure whose expectation is empty says nothing about the message, and
   * treating "says nothing" as "allows nothing" would report every segment as
   * unexpected.
   */
  EMPTY_EXPECTATION: "EMPTY_EXPECTATION",
} as const;

/**
 * Discriminant union of every reason validation did not run.
 *
 * @example
 * ```ts
 * import type { StructureNotValidatedReason } from "@cosyte/hl7";
 * const reason: StructureNotValidatedReason = "RETAINED_TRANSCRIPTION";
 * ```
 */
export type StructureNotValidatedReason =
  (typeof STRUCTURE_NOT_VALIDATED_REASONS)[keyof typeof STRUCTURE_NOT_VALIDATED_REASONS];

/**
 * The result of {@link validateMessageStructure}.
 *
 * **Read `validated` first.** `false` means the publication could not answer
 * for this message and `reason` says why; `findings` is empty and no structure
 * was selected. It is NOT "the message is fine".
 *
 * **`validated: true` with `findings.length === 0` is not a conformance
 * attestation either.** It means the message did not break the published
 * structure in the three ways checked here: segment order, segment occurrence
 * counts, and segments the publication does not name. Field content, datatypes,
 * value sets, tables and clinical correctness are all unchecked, and the
 * publication itself is vendored at a fixed commit.
 *
 * @example
 * ```ts
 * import { parseHL7, validateMessageStructure } from "@cosyte/hl7";
 * const result = validateMessageStructure(parseHL7(raw));
 * if (result.validated && result.findings.length === 0) {
 *   // nothing checked here was violated, against result.structureId
 * }
 * ```
 */
export interface StructureValidationResult {
  /** Whether a published structure was actually validated against. */
  readonly validated: boolean;
  /**
   * The published structure variant the findings were raised against, e.g.
   * `"ADT_A01-A"`. Empty string when `validated` is `false`.
   */
  readonly structureId: string;
  /**
   * Every variant of the family that was considered, sorted. Empty when
   * `validated` is `false`.
   */
  readonly structureIds: readonly string[];
  /** Why validation did not run. Empty string when it did. */
  readonly reason: StructureNotValidatedReason | "";
  /** Human-readable form of `reason`. Empty string when validation ran. */
  readonly reasonMessage: string;
  /**
   * The findings, in a stable order: the ordering finding first, then
   * cardinality findings by segment name, then unexpected segments in the order
   * they appear in the message. Always empty when `validated` is `false`.
   */
  readonly findings: readonly StructureFinding[];
}
