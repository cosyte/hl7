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
export const VERSION: string = "0.0.10";

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
  missingRequiredSegment,
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
export {
  AMBIGUOUS_DATE_ORDER,
  BUILTIN_DATE_FALLBACKS,
  parseDtm,
  formatDtm,
  dtmToDate,
} from "./parser/dates.js";
export type {
  DtmAmbiguity,
  DtmAmbiguityCandidate,
  DtmParts,
  DtmPrecision,
  DtmToDateOptions,
} from "./parser/dates.js";
export { unescape, reescape } from "./parser/escapes.js";

// Phase R: formatted-text rendering + first-class text codec. `renderText`
// turns §2.7 escape/formatting-bearing content into a normalized display model
// (never fabricating: unrenderable escapes are preserved + flagged); the
// `decodeText`/`encodeText` codec is the ergonomic decode + encode-safe (no
// delimiter injection) pair. All three are also bundled under the `text`
// namespace object. This is a read/encode LAYER: raw parse output is unchanged.
export { renderText } from "./text/render.js";
export type { RenderedText, TextRun, RenderTextOptions } from "./text/render.js";
export { decodeText, encodeText } from "./text/codec.js";
export * as text from "./text/index.js";

// Phase 3 structural model: read-path foundation.
export { Segment } from "./model/segment.js";
export { Field } from "./model/field.js";
export { parsePath, resolvePath } from "./model/dot-path.js";
export type { DotPath } from "./model/dot-path.js";

// Phase 3 typed composites: named exports for the 10 v1 composites
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

// Phase 4: XCN composite (11th v1 composite: D-24 option (a)). Used by
// helpers for `visit.attendingDoctor` / `visit.referringDoctor` (PV1-7/8)
// and `order.orderedBy` (OBR-16). Structurally XPN + ID prefix + nested HD.
export type { XCN } from "./model/types/xcn.js";
export { parseXcn } from "./model/types/xcn.js";

// Phase 3 HL7 namespace re-export (D-13): `HL7.XPN`, `HL7.XAD`, ..., `HL7.XCN`.
export * as HL7 from "./model/types/namespace.js";

// Phase 4 named helpers: type-only exports. Runtime behavior lives on
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
// namespace: that namespace is composite-type territory).
// The three emit methods (`toString`, `toJSON`, `prettyPrint`) land as
// instance methods on the already-exported `Hl7Message` class: no new
// named exports needed for them.
export { buildMessage } from "./builder/build-message.js";
export type { BuildMessageInit } from "./builder/build-message.js";
export type { SerializedMessage } from "./serialize/to-json.js";

// Phase T: typed emit symmetry: the conservative-emit mirror of the read
// helpers. `encodeComposite` (and the per-type `encodeXpn`/`encodeCx`/… it
// dispatches to) turn a typed composite into a spec-clean field using the
// HL7-R encode-safe path (no delimiter injection); the same encoding powers
// `Hl7Message.setComposite(path, kind, value)`. `buildAdt`/`buildOru` author
// spec-clean, zero-warning, structurally-complete ADT / ORU^R01 messages from
// typed inputs: never fabricating a value the caller did not supply.
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
export type {
  AdtEvent,
  AdtPatient,
  AdtPriorIdentity,
  AdtVisit,
  BuildAdtInit,
} from "./builder/build-adt.js";
export { buildOru } from "./builder/build-oru.js";
export type { BuildOruInit, OruObservation, OruOrder, OruPatient } from "./builder/build-oru.js";

export { buildDft } from "./builder/build-dft.js";
export type { BuildDftInit, DftAmount, DftCharge, DftPatient } from "./builder/build-dft.js";
export { buildMdm } from "./builder/build-mdm.js";
export type { BuildMdmInit, MdmDocument, MdmObservation, MdmPatient } from "./builder/build-mdm.js";
export { buildOrm } from "./builder/build-orm.js";
export type { BuildOrmInit, OrmObservation, OrmOrder, OrmPatient } from "./builder/build-orm.js";
export { buildSiu } from "./builder/build-siu.js";
export type {
  BuildSiuInit,
  SiuAppointment,
  SiuPatient,
  SiuResource,
  SiuResourceGroup,
  SiuResourceKind,
} from "./builder/build-siu.js";
export { buildVxu } from "./builder/build-vxu.js";
export type {
  BuildVxuInit,
  VxuImmunization,
  VxuObservation,
  VxuPatient,
  VxuRoute,
} from "./builder/build-vxu.js";

// The published support claim for the typed builders: which (message code,
// trigger event) pairs they can author as spec-clean, zero-warning messages.
// Derived from the structure registry, so a pair whose published structure
// requires a segment no typed init can supply is excluded by construction.
export {
  SUPPORTED_BUILDER_MESSAGES,
  TYPED_BUILDER_COVERAGE,
  supportsBuilderMessage,
} from "./builder/supported-messages.js";
export type {
  SupportedBuilderMessage,
  TypedBuilderCoverage,
} from "./builder/supported-messages.js";

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
// CLAIM?" over CWE/CE: alias-normalized, never validated, unknown surfaced
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

// Typed message overlays: `msg.is("ADT^A01")` answers from the pair the parser
// extracted and narrows the message for the compiler, so a message-type check
// scopes what follows it. The published key set is derived from the structure
// registry at module load, and the narrowed accessors are scoped to the segment
// names that pair's published structure marks required.
export { SUPPORTED_OVERLAY_MESSAGES } from "./model/typed-overlays.js";
export type {
  OverlayKey,
  OverlayMessageCode,
  OverlayRequiredSegment,
  OverlayStructures,
  OverlayTriggerEvent,
  SupportedOverlayMessage,
  TypedMessage,
  TypedMeta,
} from "./model/typed-overlays.js";

// Phase G: message-type & structure awareness: a conservative misroute/
// truncation safety net. `Hl7Message.structure` surfaces the read-side
// summary; the parser emits an additive `MISSING_EXPECTED_GROUP` warning when
// a recognized type lacks a segment the published structure definition gives a
// minimum of one. The derived registry, its provenance and the pure analyzer
// are exposed read-only for introspection.
export {
  MESSAGE_STRUCTURE_DEFINITIONS,
  STRUCTURE_REGISTRY_PROVENANCE,
  analyzeMessageStructure,
  findMessageStructureDefinition,
} from "./parser/message-structure.js";
export type {
  ExpectedSegmentGroup,
  MessageStructureDefinition,
  StructureDerivation,
  StructureFamily,
  StructureGroup,
  StructurePublicationRef,
  StructureRegistryProvenance,
  StructureSnapshotFile,
  StructureSourcePair,
  MessageStructure,
} from "./parser/message-structure.js";

// The OPT-IN published-structure validator, a third structural surface beside
// the two above it. `msg.structure` asks only whether a required segment is
// present and runs on every parse; `validateAgainstProfile` runs a profile the
// CALLER authored. `validateMessageStructure` runs HL7's OWN published
// structure at segment granularity: order, occurrence counts, and segments the
// publication does not name, off the same vendored snapshot the registry is
// derived from. Nobody authors it and nobody tunes it. It is asked for
// explicitly and it changes nothing: no new warning code, no change to a parse,
// and the message is untouched. Where the publication splits a structure into
// variants, findings come back only when EVERY variant is violated, and they
// are one named variant's. `validated: false` means the publication cannot
// answer (unmodelled type, retained transcription, no readable type), which is
// not the same answer as zero findings, and zero findings is still not a
// conformance attestation.
export { validateMessageStructure } from "./structure/validate.js";
export {
  STRUCTURE_FINDING_CODES,
  STRUCTURE_NOT_VALIDATED_REASONS,
  type StructureFinding,
  type StructureFindingCode,
  type StructureFindingLocus,
  type StructureNotValidatedReason,
  type StructureValidationResult,
} from "./structure/types.js";

// Roadmap Phase L: batch / file envelope splitting. `splitBatch` is a
// top-level utility (symmetric with `parseHL7`) that demarcates the individual
// MSH-led messages inside an `[FHS]{[BHS]{MSH…}[BTS]}[FTS]` stream, parses each
// via parseHL7 (ok / typed-failure entries: a malformed message is isolated,
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
// message and returns typed findings: never throwing, valid⇒zero findings, and
// with NO PHI in findings (locus + rule, never the offending value). hl7 ships
// NO vendor/IHE/regulatory profile and NO code set, makes NO network call, and
// "no findings" is explicitly NOT a conformance attestation. Distinct from the
// PARSE-profile system (`defineProfile`/`profiles`): this validates a message
// against a conformance spec; that shapes how a message is parsed.
// `defineConformanceProfile` is the optional fail-fast authoring gate (throws
// `ProfileDefinitionError` on a malformed profile); the engine itself tolerates
// a raw profile and never throws. Also bundled under the `conformance` namespace.
// A conditionally-used rule may declare a `ConditionPredicate`, which the engine
// EVALUATES against the message to select the rule's usage outcome: a location,
// a verb from the closed set (or a presence statement), a value list the profile
// author supplies, and AND/OR/XOR connectors. Still no network call and still no
// code set; a predicate the message cannot decide is reported as
// PROFILE_CONDITION_UNEVALUATABLE rather than guessed either way.
// A field rule may additionally bind its value set to the coding system its
// codes must come from (`codingSystem`, with `codingSystemComponent` where the
// default code+2 offset does not hold). The message's own coding-system
// component is compared by RESOLVED identity through the Table 0396 provenance
// map this library already ships, so `loinc`/`LOINC`/`LN` all match a binding
// of `LN`; a mismatch, an unrecognized claim, a blank one and an absent one are
// all PROFILE_CODING_SYSTEM_MISMATCH, distinct from PROFILE_VALUE_NOT_IN_SET.
// An identifier the map does not recognize is refused when the profile is
// DEFINED, never compared against a system that cannot be resolved. Still no
// code set and no network call: it checks the sender's claim, not the code.
// A field rule may additionally declare per-component rules (`components`),
// each a 1-indexed index plus an optional usage code whose cardinality is
// IMPLIED rather than declared (`R` is [1..1], `RE`/`O` are [0..1], `X` is
// [0..0]; a component has no repetition construct, so those reduce to presence).
// Declaring them CLOSES the field's component set, so a present repetition
// carrying content at an undeclared index is PROFILE_UNDECLARED_CONTENT. A
// field rule that declares none (the member omitted, or an EMPTY list, which
// carries no component rule and so says the same thing) is checked exactly as
// before and can never emit it. The usage/cardinality coherence the methodology
// states (R needs min >= 1; a non-R usage needs min 0, RE being the documented
// exception; X admits only max 0) is refused when the profile is DEFINED, for
// segment and field rules.
// A profile may declare which of the methodology's three PROFILE LEVELS it
// claims (`level`: standard, constrainable, implementable; `PROFILE_LEVELS`
// lists them least-constrained first), and EVERY result echoes the level in
// force beside the profile name, because an empty findings list means two
// different things at two different levels: only at the implementable level has
// all optionality been removed, so only there is the assessment against that
// profile complete. Declaring none claims constrainable, the weaker claim, so
// silence never reads as implementable. A claim of implementable is CHECKED
// rather than believed: every segment, field and component rule must declare a
// usage, and it must be R/RE/X or a declared conditional whose outcomes are
// drawn from those three, else PROFILE_MALFORMED; a refused claim is never the
// level echoed. Zero findings at implementable level is still not an
// attestation, and the level changes no message check whatsoever.
export { validateAgainstProfile } from "./conformance/validate-against-profile.js";
export { defineConformanceProfile } from "./conformance/profile-shape.js";
export { usageOutcomes } from "./conformance/usage.js";
export {
  FINDING_CODES,
  PREDICATE_CONNECTORS,
  PREDICATE_VERBS,
  PROFILE_LEVELS,
  USAGE_CODES,
  type Cardinality,
  type ComparisonPredicate,
  type ComponentRule,
  type ConditionPredicate,
  type ConformanceFinding,
  type ConformanceProfile,
  type ConformanceResult,
  type ConnectedPredicate,
  type DeclaredConditionalUsage,
  type FieldRule,
  type FindingCode,
  type FindingLocus,
  type FindingSeverity,
  type PredicateConnector,
  type PredicateLocation,
  type PredicatePresence,
  type PredicateVerb,
  type PresencePredicate,
  type ProfileLevel,
  type SegmentRule,
  type SimpleUsageCode,
  type UsageCode,
  type UsageCodeRegistryEntry,
  type UsageOutcomes,
  type UsageResolution,
} from "./conformance/types.js";
export * as conformance from "./conformance/index.js";

// Roadmap Phase S: streaming / incremental parse. `parseStream` consumes a
// chunked byte/string source (a Node `Readable`, an async-iterable, or an
// iterable of chunks) and yields one message per MSH-delimited boundary with
// O(one-message) memory: reassembling messages split across chunk boundaries,
// isolating a malformed message (typed failure entry) without dropping the tail,
// and reusing `parseHL7` for each message (no second grammar). Batch-envelope
// segments are boundaries, never yielded, so yielded count == MSH count. The
// additive `UNTERMINATED_STREAM_MESSAGE` warning surfaces a truncated final
// message on the entry's `streamWarnings` (never on `Hl7Message.warnings`).
export { parseStream } from "./parser/stream.js";
export type { Hl7StreamSource, StreamMessageEntry } from "./parser/stream.js";
export { unterminatedStreamMessage } from "./parser/warnings.js";
