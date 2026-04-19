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

// Phase 3 structural model — read-path foundation.
export { Segment } from "./model/segment.js";
export { Field } from "./model/field.js";
export { parsePath, resolvePath } from "./model/dot-path.js";
export type { DotPath } from "./model/dot-path.js";

// Phase 3 typed composites — named exports for the 10 v1 composites
// (XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD) alongside their parser
// functions. D-13: these are ALSO re-exported under the `HL7` namespace
// below so `import { HL7 } from "@cosyte/hl7-parser"; type T = HL7.XPN`
// resolves to the same interface as the named `XPN` import.
export type { XPN } from "./model/types/xpn.js";
export { parseXpn } from "./model/types/xpn.js";
export type { XAD } from "./model/types/xad.js";
export { parseXad } from "./model/types/xad.js";
export type { CX } from "./model/types/cx.js";
export { parseCx } from "./model/types/cx.js";
export type { CWE } from "./model/types/cwe.js";
export { parseCwe } from "./model/types/cwe.js";
export type { CE } from "./model/types/ce.js";
export { parseCe } from "./model/types/ce.js";
export type { XTN } from "./model/types/xtn.js";
export { parseXtn } from "./model/types/xtn.js";
export type { PL } from "./model/types/pl.js";
export { parsePl } from "./model/types/pl.js";
export type { TS } from "./model/types/ts.js";
export { parseTs } from "./model/types/ts.js";
export type { NM } from "./model/types/nm.js";
export { parseNm } from "./model/types/nm.js";
export type { HD } from "./model/types/hd.js";
export { parseHd } from "./model/types/hd.js";

// Phase 4: XCN composite (11th v1 composite — D-24 option (a)). Used by
// helpers for `visit.attendingDoctor` / `visit.referringDoctor` (PV1-7/8)
// and `order.orderedBy` (OBR-16). Structurally XPN + ID prefix + nested HD.
export type { XCN } from "./model/types/xcn.js";
export { parseXcn } from "./model/types/xcn.js";

// Phase 3 HL7 namespace re-export (D-13) — `HL7.XPN`, `HL7.XAD`, ..., `HL7.XCN`.
export * as HL7 from "./model/types/namespace.js";

// Phase 4 named helpers — type-only exports. Runtime behavior lives on
// `Hl7Message` instance getters (`.meta`, `.patient`, `.visit`) and
// collection methods (`.observations()`, `.orders()`, `.nextOfKin()`,
// `.allergies()`, `.diagnoses()`, `.insurance()`). HELPERS-01..07.
export type {
  Allergy,
  Diagnosis,
  Insurance,
  Meta,
  NextOfKin,
  Observation,
  ObservationBase,
  Order,
  Patient,
  Visit,
} from "./helpers/types.js";

// Phase 4: `pickMrn` is exposed as a named export so Phase 6 profile override
// hooks can substitute a profile-aware variant without patching the helper
// that calls it (D-07/D-08/D-10 default; Phase 6 hook-point).
export { pickMrn } from "./helpers/pick-mrn.js";

// Phase 5: outbound construction + serialization types.
// D-09: `buildMessage` is a top-level named export, symmetric with `parseHL7`.
// D-21: `SerializedMessage` is a top-level type export (not under the HL7
// namespace — that namespace is composite-type territory).
// The three emit methods (`toString`, `toJSON`, `prettyPrint`) land as
// instance methods on the already-exported `Hl7Message` class — no new
// named exports needed for them.
export { buildMessage } from "./builder/build-message.js";
export type { BuildMessageInit } from "./builder/build-message.js";
export type { SerializedMessage } from "./serialize/to-json.js";
