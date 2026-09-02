/**
 * `validateMessageStructure`: the opt-in check that a parsed message follows the
 * shape HL7 publishes for its trigger event.
 *
 * It is asked for explicitly and it changes nothing. A message parsed without
 * asking behaves exactly as it always did: no new warning, no new code, and the
 * presence-only `Hl7Message.structure` summary untouched. That separation is
 * deliberate rather than tidy. Folding these findings into the default parse
 * would start rejecting live traffic in every channel that treats a warning as
 * a rejection, which is the volume incident the last structure change recorded.
 *
 * VARIANT FAMILIES ARE WHY THIS IS NOT A SINGLE WALK. The publication splits
 * some structures into single-letter variants that differ in shape, and a
 * message conforms to the family by conforming to ONE of them. So every variant
 * is walked, and findings are returned only when every variant is violated: the
 * ones returned are exactly one named variant's, never a merge of several, and
 * the variant is chosen the same way every time (the first clean one, else the
 * one with the fewest findings, ties going to the first in the family's sorted
 * order).
 */

import { findMessageStructureDefinition } from "../parser/message-structure.js";
import type { PublishedStructureSchema } from "../parser/structure-types.js";
import { findPublishedStructureSchema } from "./schemas.js";
import {
  STRUCTURE_NOT_VALIDATED_REASONS,
  type StructureFinding,
  type StructureNotValidatedReason,
  type StructureValidationResult,
} from "./types.js";
import { findingsForSchema, type ObservedSegment } from "./walk.js";

import type { Hl7Message } from "../model/message.js";

/** Why validation did not run, in the words the result carries. */
const NOT_VALIDATED_MESSAGES: Readonly<Record<StructureNotValidatedReason, string>> = {
  NO_MESSAGE_TYPE:
    "The message carries no readable message type, so no published structure could be selected.",
  UNRECOGNIZED_MESSAGE_TYPE:
    "The structure registry models no published structure for this message type.",
  RETAINED_TRANSCRIPTION:
    "This message type is recognized through a retained transcription rather than a published " +
    "structure, so the publication carries no order or occurrence limits to validate against.",
  EMPTY_EXPECTATION:
    "The published structure behind this message type carries no ordered expectation, and a " +
    "structure that says nothing is not a structure that forbids everything.",
};

/** A result that reports validation did not run, and why. */
function notValidated(reason: StructureNotValidatedReason): StructureValidationResult {
  return Object.freeze({
    validated: false,
    structureId: "",
    structureIds: Object.freeze([]),
    reason,
    reasonMessage: NOT_VALIDATED_MESSAGES[reason],
    findings: Object.freeze([]),
  });
}

/** Pair every segment name with its 0-indexed occurrence among its namesakes. */
function withOccurrences(segmentNames: readonly string[]): readonly ObservedSegment[] {
  const seen = new Map<string, number>();
  const observed: ObservedSegment[] = [];
  for (const name of segmentNames) {
    const occurrence = seen.get(name) ?? 0;
    seen.set(name, occurrence + 1);
    observed.push({ name, occurrence });
  }
  return observed;
}

/** One variant's verdict, before the family's is settled. */
interface VariantVerdict {
  readonly schema: PublishedStructureSchema;
  readonly findings: readonly StructureFinding[];
}

/**
 * Validate an ordered sequence of segment names against the published structure
 * for a (message code, trigger event) pair.
 *
 * The pure core of {@link validateMessageStructure}: it reads nothing off a
 * message, so the whole decision table is reachable without constructing one.
 * `lookup` exists for the same reason and defaults to the shipped expectations.
 *
 * @internal
 */
export function validateSegmentSequence(
  messageCode: string,
  triggerEvent: string,
  segmentNames: readonly string[],
  lookup: (
    structureId: string,
  ) => PublishedStructureSchema | undefined = findPublishedStructureSchema,
): StructureValidationResult {
  if (messageCode.trim() === "") {
    return notValidated(STRUCTURE_NOT_VALIDATED_REASONS.NO_MESSAGE_TYPE);
  }
  const definition = findMessageStructureDefinition(messageCode, triggerEvent);
  if (definition === undefined) {
    return notValidated(STRUCTURE_NOT_VALIDATED_REASONS.UNRECOGNIZED_MESSAGE_TYPE);
  }
  if (definition.derivation === "retained-transcription") {
    return notValidated(STRUCTURE_NOT_VALIDATED_REASONS.RETAINED_TRANSCRIPTION);
  }

  const schemas: PublishedStructureSchema[] = [];
  for (const structureId of definition.structureIds) {
    const schema = lookup(structureId);
    if (schema !== undefined && schema.nodes.length > 0) schemas.push(schema);
  }
  if (schemas.length === 0) {
    return notValidated(STRUCTURE_NOT_VALIDATED_REASONS.EMPTY_EXPECTATION);
  }

  const observed = withOccurrences(segmentNames);
  const verdicts: VariantVerdict[] = schemas.map((schema) => ({
    schema,
    findings: findingsForSchema(schema, observed),
  }));
  // Conforming to ONE variant is conforming to the family, so a clean variant
  // ends it. Otherwise the family disagrees about nothing that matters here:
  // every member is violated, and the fewest findings is the closest reading of
  // what the message was trying to be.
  const clean = verdicts.find((verdict) => verdict.findings.length === 0);
  const chosen =
    clean ??
    verdicts.reduce((best, next) => (next.findings.length < best.findings.length ? next : best));

  return Object.freeze({
    validated: true,
    structureId: chosen.schema.structureId,
    structureIds: Object.freeze(schemas.map((schema) => schema.structureId)),
    reason: "",
    reasonMessage: "",
    findings: Object.freeze(chosen.findings),
  });
}

/**
 * Validate a parsed message against HL7's own published structure for its
 * trigger event: segment order, segment occurrence counts, and segments the
 * published structure does not name.
 *
 * **Opt-in and read-only.** Nothing calls it for you, it never throws, and it
 * leaves the message exactly as it found it: same segments, same warnings, same
 * serialization.
 *
 * **Check `validated` before you read `findings`.** A message type the registry
 * does not model, one recognized only through a retained transcription, and one
 * carrying no readable message type at all each come back with `validated:
 * false`, a `reason`, and no findings: that is "the publication cannot answer",
 * not "the message is fine".
 *
 * **Zero findings is not a conformance attestation.** It means this message did
 * not break the published structure in the three ways checked here. Field
 * content, datatypes, value sets and HL7 tables are all unchecked, the covered
 * message codes are twelve rather than the whole standard, and the publication
 * behind it is vendored at a fixed commit.
 *
 * @param message - a parsed message. Input the parser rejects never reaches
 *   here: the parse fails first, with the fatal error it always raised.
 *
 * @example
 * ```ts
 * import { parseHL7, validateMessageStructure } from "@cosyte/hl7";
 * const result = validateMessageStructure(parseHL7(raw));
 * result.validated; // false for a message type the registry does not model
 * result.structureId; // e.g. "ADT_A01-A": the variant the findings are against
 * result.findings.map((f) => f.code);
 * ```
 */
export function validateMessageStructure(message: Hl7Message): StructureValidationResult {
  return validateSegmentSequence(
    message.get("MSH.9.1") ?? "",
    message.get("MSH.9.2") ?? "",
    message.allSegments().map((segment) => segment.type),
  );
}
