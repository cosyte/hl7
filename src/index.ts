/**
 * Public entry point for the `@cosyte/hl7-parser` package.
 *
 * The full public API (parseHL7, defineProfile, helpers, types) is populated
 * in subsequent phases. This stub keeps the module resolvable and typed so
 * downstream tooling (tsup, vitest, tsc) can verify the build/typecheck
 * pipeline end-to-end.
 */

/**
 * Library version string, synced with `package.json#version` at build time
 * by downstream phases. Exported now so consumers (and the type-check
 * pipeline) have at least one symbol to resolve through the `exports` map.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/hl7-parser";
 * console.log(VERSION);
 * ```
 */
export const VERSION: string = "0.0.0";

export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
export { FATAL_CODES, Hl7ParseError, ProfileDefinitionError } from "./parser/errors.js";
export type { FatalCode } from "./parser/errors.js";
export {
  WARNING_CODES,
  mllpFramingStripped,
  fieldWhitespaceTrimmed,
  unknownEscapeSequence,
  timestampFallbackFormat,
  segmentCase,
  extraFields,
  unknownSegment,
  duplicateRequiredSegment,
  encodingMismatch,
  missingRequiredField,
  outOfOrderSegment,
  versionMismatch,
  unknownCharset,
} from "./parser/warnings.js";
export type { WarningCode, Hl7ParseWarning } from "./parser/warnings.js";
export { DEFAULT_ENCODING_CHARACTERS } from "./parser/delimiters.js";
export type {
  Hl7Position,
  ParseOptions,
  OnWarningCallback,
  Profile,
  EncodingCharacters,
  RawSegment,
  RawField,
  RawRepetition,
  RawComponent,
} from "./parser/types.js";
export { BUILTIN_DATE_FALLBACKS, parseHl7Timestamp } from "./parser/dates.js";
export type { ParseHl7TimestampOptions } from "./parser/dates.js";
export { unescape, reescape } from "./parser/escapes.js";
