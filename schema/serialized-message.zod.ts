// Zod schemas for the @cosyte/hl7 serialized message projection: the object
// `Hl7Message.toJSON()` returns.
//
// GENERATED FILE. DO NOT EDIT BY HAND. `@cosyte/hl7` emits it from the shape
// its own serializer produces, so an edit here is an edit the emitter does not
// reproduce. Regenerate with `pnpm generate:schema`.
//
// `zod` is a dependency of YOUR project, not of @cosyte/hl7, which ships none.

import { z } from "zod";

export const SerializedEncodingCharactersSchema = z
  .object({
    field: z.string(),
    component: z.string(),
    repetition: z.string(),
    escape: z.string(),
    subcomponent: z.string(),
  })
  .strict();

export const SerializedComponentSchema = z
  .object({
    subcomponents: z.array(z.string()),
  })
  .strict();

export const SerializedRepetitionSchema = z
  .object({
    components: z.array(SerializedComponentSchema),
  })
  .strict();

export const SerializedFieldSchema = z
  .object({
    repetitions: z.array(SerializedRepetitionSchema),
    isNull: z.boolean(),
  })
  .strict();

export const SerializedSegmentSchema = z
  .object({
    name: z.string(),
    fields: z.array(SerializedFieldSchema),
  })
  .strict();

export const SerializedPositionSchema = z
  .object({
    segmentIndex: z.number().int(),
    fieldIndex: z.number().int().optional(),
    repetitionIndex: z.number().int().optional(),
    componentIndex: z.number().int().optional(),
    subcomponentIndex: z.number().int().optional(),
  })
  .strict();

export const SerializedWarningSchema = z
  .object({
    code: z.enum([
      "ACK_NO_CORRELATION_ID",
      "BATCH_COUNT_MISMATCH",
      "BATCH_MISSING_TRAILER",
      "DUPLICATE_REQUIRED_SEGMENT",
      "ENCODING_MISMATCH",
      "EXTRA_FIELDS",
      "FIELD_WHITESPACE_TRIMMED",
      "MERGE_MISSING_PRIOR_OR_SURVIVOR",
      "MISSING_EXPECTED_GROUP",
      "MISSING_REQUIRED_FIELD",
      "MLLP_FRAMING_STRIPPED",
      "OUT_OF_ORDER_SEGMENT",
      "SEGMENT_CASE",
      "TIMESTAMP_FALLBACK_FORMAT",
      "UNKNOWN_CHARSET",
      "UNKNOWN_ESCAPE_SEQUENCE",
      "UNKNOWN_SEGMENT",
      "UNSUPPORTED_CHARSET",
      "UNTERMINATED_STREAM_MESSAGE",
      "VERSION_MISMATCH",
    ]),
    message: z.string(),
    position: SerializedPositionSchema,
  })
  .strict();

export const SerializedProfileSchema = z
  .object({
    name: z.string(),
    lineage: z.array(z.string()),
  })
  .strict();

export const SerializedMessageSchema = z
  .object({
    encodingCharacters: SerializedEncodingCharactersSchema,
    segments: z.array(SerializedSegmentSchema),
    warnings: z.array(SerializedWarningSchema),
    profile: SerializedProfileSchema.optional(),
  })
  .strict();

export type SerializedMessage = z.infer<typeof SerializedMessageSchema>;
