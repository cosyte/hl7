/**
 * Public entry point for the `@cosyte/hl7` package.
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
 * import { VERSION } from "@cosyte/hl7";
 * console.log(VERSION);
 * ```
 */
export const VERSION: string = "0.0.1";

export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
export { FATAL_CODES, Hl7ParseError, ProfileDefinitionError } from "./parser/errors.js";
export type { FatalCode } from "./parser/errors.js";
export {
  WARNING_CODES,
  mllpFramingStripped,
  fieldWhitespaceTrimmed,
  unknownEscapeSequence,
  unterminatedEscapeSequence,
  timestampFallbackFormat,
  segmentCase,
  extraFields,
  unknownSegment,
  duplicateRequiredSegment,
  encodingMismatch,
  missingRequiredField,
  missingExpectedGroup,
  outOfOrderSegment,
  versionMismatch,
  unknownCharset,
  unsupportedCharset,
} from "./parser/warnings.js";
export type { WarningCode, Hl7ParseWarning } from "./parser/warnings.js";

// Phase O additive: the frozen HL7 Table-0211 charset registry, so advanced
// consumers can inspect how an MSH-18 code is treated (decoded vs preserved).
export { resolveCharset, canonicalCharset } from "./parser/charset.js";
export type { CharsetResolution, CharsetTreatment } from "./parser/charset.js";
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
export { BUILTIN_DATE_FALLBACKS, parseDtm, formatDtm, dtmToDate } from "./parser/dates.js";
export type { DtmParts, DtmPrecision, DtmToDateOptions } from "./parser/dates.js";
export { unescape, reescape } from "./parser/escapes.js";

// Phase R: formatted-text rendering + first-class text codec. `renderText`
// turns §2.7 escape/formatting-bearing content into a normalized display model
// (never fabricating — unrenderable escapes are preserved + flagged); the
// `decodeText`/`encodeText` codec is the ergonomic decode + encode-safe (no
// delimiter injection) pair. All three are also bundled under the `text`
// namespace object. This is a read/encode LAYER — raw parse output is unchanged.
export { renderText } from "./text/render.js";
export type { RenderedText, TextRun, RenderTextOptions } from "./text/render.js";
export { decodeText, encodeText } from "./text/codec.js";
export * as text from "./text/index.js";

// Phase 3 structural model — read-path foundation.
export { Segment } from "./model/segment.js";
export { Field } from "./model/field.js";
export { parsePath, resolvePath } from "./model/dot-path.js";
export type { DotPath } from "./model/dot-path.js";

// Phase 3 typed composites — named exports for the 10 v1 composites
// (XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD) alongside their parser
// functions. D-13: these are ALSO re-exported under the `HL7` namespace
// below so `import { HL7 } from "@cosyte/hl7"; type T = HL7.XPN`
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
export type { SN } from "./model/types/sn.js";
export { parseSn } from "./model/types/sn.js";
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
  Appointment,
  AppointmentResource,
  Charge,
  ClinicalDocument,
  Diagnosis,
  Immunization,
  ImmunizationRecordOrigin,
  Insurance,
  Medication,
  MedicationAmount,
  MedicationComponent,
  MedicationContext,
  MedicationRoute,
  MedicationStrength,
  Meta,
  NextOfKin,
  Observation,
  ObservationBase,
  Order,
  OrderTiming,
  Patient,
  RepeatPattern,
  RepeatPatternKind,
  TimingQuantity,
  Visit,
} from "./helpers/types.js";

// Phase 4: `pickMrn` is exposed as a named export so Phase 6 profile override
// hooks can substitute a profile-aware variant without patching the helper
// that calls it (D-07/D-08/D-10 default; Phase 6 hook-point).
export { pickMrn } from "./helpers/pick-mrn.js";

// Roadmap Phase K: patient-identity / merge events. Runtime behavior lives on
// `Hl7Message.identityEvents()`; the typed views + the event-scoped warning
// factory are the named exports.
export type {
  IdentityEvent,
  IdentityEventKind,
  IdentityParty,
  IdentityRole,
} from "./helpers/identity.js";
export { mergeMissingPriorOrSurvivor } from "./parser/warnings.js";

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

// Phase T: typed emit symmetry — the conservative-emit mirror of the read
// helpers. `encodeComposite` (and the per-type `encodeXpn`/`encodeCx`/… it
// dispatches to) turn a typed composite into a spec-clean field using the
// HL7-R encode-safe path (no delimiter injection); the same encoding powers
// `Hl7Message.setComposite(path, kind, value)`. `buildAdt`/`buildOru` author
// spec-clean, zero-warning, structurally-complete ADT / ORU^R01 messages from
// typed inputs — never fabricating a value the caller did not supply.
export {
  encodeComposite,
  encodeCompositeReps,
  encodeXpn,
  encodeXad,
  encodeCx,
  encodeCwe,
  encodeCe,
  encodeXtn,
  encodePl,
  encodeHd,
  encodeTs,
  encodeNm,
  encodeXcn,
} from "./builder/encode-composite.js";
export type { CompositeKind, CompositeValueByKind } from "./builder/encode-composite.js";
export { buildAdt } from "./builder/build-adt.js";
export type { AdtEvent, AdtPatient, AdtVisit, BuildAdtInit } from "./builder/build-adt.js";
export { buildOru } from "./builder/build-oru.js";
export type { BuildOruInit, OruObservation, OruOrder, OruPatient } from "./builder/build-oru.js";

// Phase C: ACK / response generation. `buildAck` is the single upstream ACK
// *content* primitive (`@cosyte/mllp`'s ack-from-hl7 adapts over it);
// `interpretAck` is the read-side; `detectAckMode` exposes the spec-exact
// original-vs-enhanced detection. Control vocabulary (Tables 0008/0357/0516/
// 0155) ships as frozen read-only enums.
export { buildAck, detectAckMode } from "./builder/build-ack.js";
export type { AckErrorDetail, BuildAckOptions } from "./builder/build-ack.js";
export { interpretAck } from "./helpers/acknowledgment.js";
export type { Acknowledgment, AckErrorEntry } from "./helpers/acknowledgment.js";
export {
  ACK_CODES,
  ACK_CONDITIONS,
  downgradePositiveAck,
  ERR_CONDITION_CODES,
  ERR_CONDITION_CODE_SYSTEM,
  ERR_SEVERITIES,
  isPositiveAck,
} from "./builder/ack-tables.js";
export type { AckCode, AckCondition, AckMode, ErrSeverity } from "./builder/ack-tables.js";
export { ackNoCorrelationId } from "./parser/warnings.js";

// Phase 6: profile system + built-in vendor profiles.
// D-26: defineProfile / setDefaultProfile / getDefaultProfile are top-level
// values; built-ins are exposed under the `profiles` namespace object, not
// as top-level named exports (`epic` is too generic a name for a top-level
// export).
export { defineProfile, setDefaultProfile, getDefaultProfile, profiles } from "./profiles/index.js";
export type { DefineProfileOptions, CustomSegmentDefinition } from "./profiles/index.js";

// Plan 01 additive: SUPPORTED_DATE_TOKENS re-export so profile authors can
// introspect valid date-format tokens without reaching into internals.
export { SUPPORTED_DATE_TOKENS } from "./parser/dates.js";

// Plan 03 additive: KNOWN_SEGMENTS re-export so advanced consumers can
// inspect the UNKNOWN_SEGMENT detection set (read-only).
export { KNOWN_SEGMENTS } from "./parser/known-segments.js";

// Phase F: coding-system provenance (HL7 Table 0396, read-only). A frozen
// acronym→name map plus accessors that answer "what system does this code
// CLAIM?" over CWE/CE — alias-normalized, never validated, unknown surfaced
// verbatim with `known:false`. No lookup, no network, no bundled codeset.
export {
  KNOWN_CODING_SYSTEMS,
  codingSystem,
  codingSystemOf,
  alternateCodingSystemOf,
} from "./model/coding-system.js";
export type {
  KnownCodingSystem,
  CodingSystemInfo,
  CodedSystemFields,
} from "./model/coding-system.js";

// Phase G: message-type & structure awareness — a conservative misroute/
// truncation safety net. `Hl7Message.structure` surfaces the read-side
// summary; the parser emits an additive `MISSING_EXPECTED_GROUP` warning when
// a recognized type lacks an expected Required segment group. The expected-
// group registry + the pure analyzer are exposed read-only for introspection.
export {
  MESSAGE_STRUCTURE_DEFINITIONS,
  analyzeMessageStructure,
} from "./parser/message-structure.js";
export type {
  ExpectedSegmentGroup,
  MessageStructureDefinition,
  StructureGroup,
  MessageStructure,
} from "./parser/message-structure.js";

// Roadmap Phase L: batch / file envelope splitting. `splitBatch` is a
// top-level utility (symmetric with `parseHL7`) that demarcates the individual
// MSH-led messages inside an `[FHS]{[BHS]{MSH…}[BTS]}[FTS]` stream, parses each
// via parseHL7 (ok / typed-failure entries — a malformed message is isolated,
// never suppresses siblings), and reconciles the declared BTS-1/FTS-1 counts.
// The two additive Tier-2 warnings live on the returned result, never on
// Hl7Message.warnings.
export { splitBatch } from "./parser/batch.js";
export type {
  Batch,
  BatchEnvelopeName,
  BatchEnvelopeSegment,
  BatchMessageEntry,
  BatchSplitResult,
} from "./parser/batch.js";
export { batchCountMismatch, batchMissingTrailer } from "./parser/warnings.js";

// Roadmap Phase U: conformance-profile TOOLING. `validateAgainstProfile` runs a
// USER-AUTHORED declarative conformance profile (usage R/RE/C/CE/O/X,
// cardinality, length, and a CONSUMER-SUPPLIED value set) against a parsed
// message and returns typed findings — never throwing, valid⇒zero findings, and
// with NO PHI in findings (locus + rule, never the offending value). hl7 ships
// NO vendor/IHE/regulatory profile and NO code set, makes NO network call, and
// "no findings" is explicitly NOT a conformance attestation. Distinct from the
// PARSE-profile system (`defineProfile`/`profiles`): this validates a message
// against a conformance spec; that shapes how a message is parsed.
// `defineConformanceProfile` is the optional fail-fast authoring gate (throws
// `ProfileDefinitionError` on a malformed profile); the engine itself tolerates
// a raw profile and never throws. Also bundled under the `conformance` namespace.
export { validateAgainstProfile } from "./conformance/validate-against-profile.js";
export { defineConformanceProfile } from "./conformance/profile-shape.js";
export {
  FINDING_CODES,
  USAGE_CODES,
  type Cardinality,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type FieldRule,
  type FindingCode,
  type FindingLocus,
  type FindingSeverity,
  type SegmentRule,
  type UsageCode,
} from "./conformance/types.js";
export * as conformance from "./conformance/index.js";

// Roadmap Phase S: streaming / incremental parse. `parseStream` consumes a
// chunked byte/string source (a Node `Readable`, an async-iterable, or an
// iterable of chunks) and yields one message per MSH-delimited boundary with
// O(one-message) memory — reassembling messages split across chunk boundaries,
// isolating a malformed message (typed failure entry) without dropping the tail,
// and reusing `parseHL7` for each message (no second grammar). Batch-envelope
// segments are boundaries, never yielded, so yielded count == MSH count. The
// additive `UNTERMINATED_STREAM_MESSAGE` warning surfaces a truncated final
// message on the entry's `streamWarnings` (never on `Hl7Message.warnings`).
export { parseStream } from "./parser/stream.js";
export type { Hl7StreamSource, StreamMessageEntry } from "./parser/stream.js";
export { unterminatedStreamMessage } from "./parser/warnings.js";
