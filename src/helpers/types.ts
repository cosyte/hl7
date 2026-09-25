/**
 * Helper type declarations: the 9 typed shapes returned by
 * `Hl7Message.meta`/`.patient`/`.visit` getters and the 6 collection methods
 * (`observations()`, `orders()`, `nextOfKin()`, `allergies()`, `diagnoses()`,
 * `insurance()`). Every field is `readonly`; every optional key is
 * `exactOptionalPropertyTypes`-safe (never `| undefined` on the declaration).
 *
 * Types compose on the 11 v1 composites from `src/model/types/*.ts` (XPN, XAD,
 * CX, CWE, CE, XTN, PL, XCN): helpers are pure views on top of the model layer's
 * composite coercions, never re-parsing the raw tree.
 *
 * Field lists are locked by decisions D-01..D-24. Nine interfaces:
 * `Meta`, `Patient`, `Visit`, `Observation` (discriminated union + `ObservationBase`),
 * `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance`.
 */

import type { CE } from "../model/types/ce.js";
import type { CWE } from "../model/types/cwe.js";
import type { CX } from "../model/types/cx.js";
import type { PL } from "../model/types/pl.js";
import type { SN } from "../model/types/sn.js";
import type { TS } from "../model/types/ts.js";
import type { XAD } from "../model/types/xad.js";
import type { XCN } from "../model/types/xcn.js";
import type { XPN } from "../model/types/xpn.js";
import type { XTN } from "../model/types/xtn.js";

/**
 * MSH-derived message metadata (HELPERS-01). D-03: always defined on
 * `Hl7Message.meta` (MSH absence throws `NO_MSH_SEGMENT` at parse time);
 * individual fields are optional because vendor-quirky messages routinely
 * omit pieces of MSH. `timestamp` is the fidelity `TS` (precision +
 * timezone preserved), not an eager UTC-assuming `Date`.
 *
 * @example
 * ```ts
 * import type { Meta } from "@cosyte/hl7";
 * const meta: Meta = {
 *   type: "ADT^A01",
 *   messageCode: "ADT",
 *   triggerEvent: "A01",
 *   controlId: "MSG001",
 *   version: "2.5",
 * };
 * console.log(meta.timestamp?.raw, meta.timestamp?.precision);
 * ```
 */
export interface Meta {
  /** MSH-9 full message type string, e.g. "ADT^A01" or "ORU^R01^ORU_R01". */
  readonly type?: string;
  /** MSH-9.1 message code (e.g. "ADT", "ORU"). */
  readonly messageCode?: string;
  /** MSH-9.2 trigger event (e.g. "A01", "R01"). */
  readonly triggerEvent?: string;
  /** MSH-9.3 message structure (e.g. "ADT_A01"). */
  readonly messageStructure?: string;
  /** MSH-10 message control ID: unique per message per sender. */
  readonly controlId?: string;
  /**
   * MSH-7 message date/time as the fidelity `TS`. Absent when MSH-7 is empty
   * or unparseable. Present with `valid: false` and an `ambiguity` report when
   * the value is a slash date whose field order cannot be established: check
   * `valid` before reading the parts.
   */
  readonly timestamp?: TS;
  /** MSH-12 HL7 version string (e.g. "2.5", "2.5.1"). */
  readonly version?: string;
  /** MSH-3.1 sending application namespace id. */
  readonly sendingApp?: string;
  /** MSH-4.1 sending facility namespace id. */
  readonly sendingFacility?: string;
  /** MSH-5.1 receiving application namespace id. */
  readonly receivingApp?: string;
  /** MSH-6.1 receiving facility namespace id. */
  readonly receivingFacility?: string;
  /** MSH-11.1 processing id (P=production, T=test, D=debug). */
  readonly processingId?: string;
}

/**
 * PID-derived patient view (HELPERS-02). `msg.patient` is `undefined` (D-04)
 * when no PID segment exists; this interface describes the shape when
 * present. `identifiers` and `phoneNumbers` are ALWAYS present as arrays
 * (D-09 / D-20): empty when the underlying field is absent. `name` is
 * ALWAYS present (D-19) even if `{}` when PID-5 is empty.
 *
 * @example
 * ```ts
 * import type { Patient } from "@cosyte/hl7";
 * const p: Patient = {
 *   mrn: "MRN123",
 *   identifiers: [{ idNumber: "MRN123", identifierTypeCode: "MR" }],
 *   name: { familyName: "Smith", givenName: "Jane" },
 *   familyName: "Smith",
 *   givenName: "Jane",
 *   fullName: "Jane Smith",
 *   phoneNumbers: [],
 * };
 * console.log(p.dateOfBirth?.raw, p.dateOfBirth?.precision);
 * ```
 */
export interface Patient {
  /** Medical record number picked via `pickMrn` (D-07 / D-08). */
  readonly mrn?: string;
  /** Full PID-3 identifier list, each parsed as a CX. Always present (D-09). */
  readonly identifiers: readonly CX[];
  /** Full PID-5 parsed name (first repetition). Always present as `{}` when empty (D-19). */
  readonly name: XPN;
  /** PID-5.1 flat family name convenience (D-19). */
  readonly familyName?: string;
  /** PID-5.2 flat given name convenience (D-19). */
  readonly givenName?: string;
  /** PID-5.3 mapped from `XPN.secondName` (D-19). */
  readonly middleName?: string;
  /** Composed Western-order name "Given Middle Family, Suffix" (D-17). */
  readonly fullName?: string;
  /**
   * PID-7 date of birth as the fidelity `TS`. A day-only DOB keeps
   * `precision: "day"`: never coerced to a UTC-midnight instant that would
   * read as the previous day in a negative-offset zone.
   */
  readonly dateOfBirth?: TS;
  /** PID-8 administrative sex code. */
  readonly sex?: string;
  /** PID-11 home address parsed as XAD. */
  readonly address?: XAD;
  /** PID-13 (home) + PID-14 (business) repetitions concatenated. Always present (D-20). */
  readonly phoneNumbers: readonly XTN[];
  /** PID-10 race. */
  readonly race?: CWE;
  /** PID-22 ethnic group. */
  readonly ethnicity?: CWE;
  /** PID-15 primary language. */
  readonly language?: CE;
  /**
   * NTE note lines positionally attached to the (first) PID: notes
   * immediately following the patient's PID segment, HL7-unescaped, in
   * document order. OMITTED when the patient carries no notes. High-PHI-risk
   * clinical narrative.
   */
  readonly notes?: readonly string[];
}

/**
 * PV1-derived visit view (HELPERS-03). `msg.visit` is `undefined` when no PV1
 * segment exists; this interface describes the shape when present. D-24a:
 * doctor fields use XCN (not flat strings). Date/time fields are the
 * fidelity `TS` (precision + timezone preserved).
 *
 * @example
 * ```ts
 * import type { Visit } from "@cosyte/hl7";
 * const v: Visit = {
 *   patientClass: "I",
 *   location: { pointOfCare: "ICU", room: "101" },
 *   visitNumber: "VISIT001",
 * };
 * console.log(v.attendingDoctor?.familyName);
 * console.log(v.admitDateTime?.raw);
 * ```
 */
export interface Visit {
  /** PV1-2 patient class ("I"=inpatient, "O"=outpatient, "E"=ER, ...). */
  readonly patientClass?: string;
  /** PV1-3 assigned patient location (ward / room / bed) as PL. */
  readonly location?: PL;
  /** PV1-44 admit date/time as the fidelity `TS`. */
  readonly admitDateTime?: TS;
  /** PV1-45 discharge date/time as the fidelity `TS`. */
  readonly dischargeDateTime?: TS;
  /** PV1-7 attending doctor (D-24a XCN). */
  readonly attendingDoctor?: XCN;
  /** PV1-8 referring doctor (D-24a XCN). */
  readonly referringDoctor?: XCN;
  /** PV1-19 visit number. */
  readonly visitNumber?: string;
}

/**
 * What a result status classifies to. The first eight values are the target
 * codes of HL7's published v2-to-FHIR status maps (Table 0085 to Observation
 * Status for OBX-11, Table 0123 to Diagnostic Report Status for OBR-25).
 *
 * `"undetermined"` is this library's fail-safe, not a map target. It covers
 * every code HL7's map leaves unmapped (OBX-11 `B`, `I`, `N`, `O`, `R`, `S`,
 * `V`, `U`; OBR-25 `A`, `Y`, `Z`, `M`, `N`), an absent, empty or `""` (null)
 * field, and any field that is not exactly one code of its table: a lowercase
 * letter, a code with whitespace around it, a code written as an escape
 * sequence, a code outside the table, or a field with more than one
 * repetition, component or subcomponent. An `"undetermined"` value is never a
 * current result by default: read the raw code and decide.
 *
 * @example
 * ```ts
 * import type { ResultStatusClass } from "@cosyte/hl7";
 * const retracted: readonly ResultStatusClass[] = ["entered-in-error", "cancelled"];
 * ```
 */
export type ResultStatusClass =
  | "final"
  | "corrected"
  | "amended"
  | "preliminary"
  | "entered-in-error"
  | "cancelled"
  | "registered"
  | "partial"
  | "undetermined";

/**
 * The HL7 v2 code table a {@link ResultStatusClassification} read: Table 0085
 * (Observation Result Status, OBX-11) or Table 0123 (Result Status, OBR-25),
 * each at the code-system version the map was checked against.
 *
 * @example
 * ```ts
 * import type { ResultStatusTable } from "@cosyte/hl7";
 * const table: ResultStatusTable = { name: "HL7 Table 0085", version: "3.0.0" };
 * ```
 */
export interface ResultStatusTable {
  /** `"HL7 Table 0085"` for OBX-11, `"HL7 Table 0123"` for OBR-25. */
  readonly name: "HL7 Table 0085" | "HL7 Table 0123";
  /** The code-system version the table's codes were taken from. */
  readonly version: "3.0.0";
}

/**
 * The published HL7 v2-to-FHIR map a {@link ResultStatusClassification}
 * followed, by canonical URL and version. The maps come from the HL7 Version 2
 * to FHIR Implementation Guide (STU 1, standards status Informative); a later
 * map revision shows up here as a changed `version`.
 *
 * @example
 * ```ts
 * import type { ResultStatusMap } from "@cosyte/hl7";
 * const map: ResultStatusMap = {
 *   url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
 *   version: "1.0.0",
 * };
 * ```
 */
export interface ResultStatusMap {
  /** Canonical URL of the ConceptMap whose rows the classification follows. */
  readonly url:
    | "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status"
    | "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status";
  /** The ConceptMap version the classification follows. */
  readonly version: "1.0.0";
}

/**
 * A result status read against its HL7 table and classified by HL7's
 * published v2-to-FHIR status map: carried as `resultStatus` on every
 * {@link Observation} (from OBX-11) and every {@link Order} (from OBR-25).
 *
 * **Safety contract.** Each OBX classifies from its own OBX-11 alone and each
 * order from its own OBR-25 alone: nothing is inherited, propagated or
 * reconciled across segments. A status is reported, never applied: an
 * `"entered-in-error"` observation is still returned, and replacing or
 * deleting an earlier result is the caller's decision. `classification` is
 * `"final"` only when the field is exactly `F`; every value HL7's map does not
 * map is `"undetermined"` (see {@link ResultStatusClass}), never a guess.
 *
 * The object is plain data, not a FHIR element: no resource is built and no
 * terminology service is consulted.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const obs of msg.observations()) {
 *   const { classification, code } = obs.resultStatus;
 *   if (classification === "entered-in-error") console.log("posted in error:", code);
 *   else if (classification === "undetermined") console.log("not classifiable:", code);
 * }
 * ```
 */
export interface ResultStatusClassification {
  /** The classification HL7's map gives the code, or `"undetermined"`. */
  readonly classification: ResultStatusClass;
  /**
   * The raw code, byte-identical to the `status` (OBX-11) or `orderStatus`
   * (OBR-25) the same observation or order surfaces: the field's first value,
   * decoded. OMITTED when that field is absent, empty or `""`, exactly when
   * `status` / `orderStatus` is. When the field carries more than one
   * repetition, component or subcomponent this is still only the first value,
   * and `classification` is `"undetermined"`.
   */
  readonly code?: string;
  /** The HL7 table the code was read against. */
  readonly table: ResultStatusTable;
  /** The HL7 v2-to-FHIR map the classification followed. */
  readonly map: ResultStatusMap;
}

/**
 * Fields shared by every `Observation` variant, regardless of the OBX-2
 * value type. Split from the discriminated union to keep the union
 * declaration readable (D-15 locked field list).
 *
 * @example
 * ```ts
 * import type { ObservationBase } from "@cosyte/hl7";
 * const base: ObservationBase = {
 *   setId: "1",
 *   identifier: { identifier: "GLU", text: "Glucose" },
 *   resultStatus: {
 *     classification: "undetermined",
 *     table: { name: "HL7 Table 0085", version: "3.0.0" },
 *     map: {
 *       url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
 *       version: "1.0.0",
 *     },
 *   },
 * };
 * ```
 */
export interface ObservationBase {
  /** OBX-1 set id (string: typically sequential "1", "2", ...). */
  readonly setId?: string;
  /** OBX-3 observation identifier. Always present (may be `{}` if OBX-3 absent). */
  readonly identifier: CWE;
  /** OBX-6 units. */
  readonly units?: CWE;
  /**
   * `true` iff OBX-6's coding system (CWE.3, "name of coding system") is
   * exactly `UCUM` (HL7 Table 0396): i.e. the unit is declared UCUM and is
   * safe to interpret as a computable unit. `false` means a unit IS present
   * but is NOT declared UCUM (e.g. a local code or free text) and is surfaced
   * as-is, never coerced. OMITTED when OBX-6 is absent. This is a *claim* check
   * only: the library does not validate UCUM grammar or check the alternate
   * coding system (CWE.6).
   */
  readonly unitsAreUcum?: boolean;
  /** OBX-7 reference range (e.g. "80-110"). */
  readonly referenceRange?: string;
  /** OBX-8 abnormal flags (e.g. "H", "HH", "L", "LL"). */
  readonly abnormalFlags?: string;
  /** OBX-11 observation result status (e.g. "F"=final, "P"=preliminary). */
  readonly status?: string;
  /**
   * OBX-11 read against HL7 Table 0085 and classified by HL7's Table 0085 to
   * Observation Status map. Always present: `"undetermined"` when OBX-11 is
   * absent, unmapped or not exactly one code. See
   * {@link ResultStatusClassification}.
   */
  readonly resultStatus: ResultStatusClassification;
  /** OBX-14 date/time of observation as the fidelity `TS`. */
  readonly observedDateTime?: TS;
  /**
   * NTE note lines positionally attached to this OBX: each
   * non-empty NTE-3 (Comment, FT) repetition of every NTE immediately
   * following this observation, HL7-unescaped, in document order. OMITTED when
   * the observation carries no notes. High-PHI-risk clinical narrative.
   */
  readonly notes?: readonly string[];
}

/**
 * One OBX segment as a typed Observation. `value` is discriminated by
 * `valueType` (OBX-2) per D-13:
 * - `"NM"` → `number | undefined`
 * - `"SN"` → `SN | undefined` (structured numeric: comparator / range / ratio)
 * - `"TS" | "DT"` → `TS | undefined` (fidelity parts preserved)
 * - `"CWE" | "CE"` → `CWE | CE | undefined` (full composite per D-14)
 * - other (`"ST"`, `"TX"`, `"FT"`, `"ID"`, `"IS"`, `"NA"`, unknown) →
 *   `string | undefined` (decoded, D-23)
 *
 * D-22: `value` is `undefined` when OBX-5 is empty OR malformed for its
 * declared type (never throws, never `NaN`). A `TS`/`DT` value is always the
 * `TS` structure; check its `.valid` flag rather than expecting a `Date`.
 *
 * @example
 * ```ts
 * import type { Observation } from "@cosyte/hl7";
 * const glucose: Observation = {
 *   setId: "1",
 *   identifier: { identifier: "GLU", text: "Glucose" },
 *   valueType: "NM",
 *   value: 120,
 *   units: { identifier: "mg/dL" },
 *   referenceRange: "80-110",
 *   abnormalFlags: "H",
 *   status: "F",
 *   resultStatus: {
 *     classification: "final",
 *     code: "F",
 *     table: { name: "HL7 Table 0085", version: "3.0.0" },
 *     map: {
 *       url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
 *       version: "1.0.0",
 *     },
 *   },
 * };
 * ```
 */
export type Observation = ObservationBase &
  (
    | { readonly valueType: "NM"; readonly value: number | undefined }
    | { readonly valueType: "SN"; readonly value: SN | undefined }
    | { readonly valueType: "TS" | "DT"; readonly value: TS | undefined }
    | { readonly valueType: "CWE" | "CE"; readonly value: CWE | CE | undefined }
    | { readonly valueType: string; readonly value: string | undefined }
  );

/**
 * How an order/medication `RepeatPattern` code (HL7 Table 0335) is classified,
 * **provenance only, never used to resolve a schedule**. The `code`
 * is always authoritative and surfaced verbatim; this flag only tells a
 * consumer *what kind* of pattern it is looking at so it can decide whether a
 * load-bearing integer is present.
 *
 * - `"parametric"`: a `Q<integer><unit>` template (`Q6H`, `Q30M`, `Q2D`,
 *   `Q1W`, `Q3J5`) whose **integer is load-bearing**: `Q6H` (every 6 hours) is
 *   a different dose count from `Q8H`. The parsed integer + unit ride on
 *   {@link RepeatPattern.interval}.
 * - `"named"`: a recognized fixed Table-0335 mnemonic scheduled at
 *   institution-specified times (`BID`, `TID`, `QID`, `QOD`, `QHS`, `QAM`,
 *   `QPM`, `QSHIFT`, `PRN`, `AC`, `PC`, `HS`, `C`). No numeric interval.
 * - `"unknown"`: anything else (a local code, free text, an unrecognized
 *   mnemonic). Surfaced **verbatim**, never mapped to a frequency.
 */
export type RepeatPatternKind = "parametric" | "named" | "unknown";

/**
 * An order/medication timing **repeat pattern** (HL7 Table 0335): the
 * frequency/SIG field (TQ1-3, or the legacy embedded TQ interval RI.1).
 *
 * **Safety contract.** `code` is the **decoded field value** (HL7 escapes are
 * unescaped as with every field read) and is **never resolved to clock times,
 * normalized, or mapped to a different frequency**: reading `Q6H` as "daily"
 * or silently dropping a `BID` changes the administered dose count, a
 * transcription-class harm. `kind`/`interval` are convenience provenance ONLY;
 * `code` is the authoritative value.
 *
 * @example
 * ```ts
 * import type { RepeatPattern } from "@cosyte/hl7";
 * const q6h: RepeatPattern = { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } };
 * const bid: RepeatPattern = { code: "BID", kind: "named" };
 * ```
 */
export interface RepeatPattern {
  /** The Table-0335 repeat-pattern code exactly as authored (e.g. `"Q6H"`, `"BID"`). Never normalized. */
  readonly code: string;
  /** Provenance classification of `code`: never used to resolve a schedule. See {@link RepeatPatternKind}. */
  readonly kind: RepeatPatternKind;
  /**
   * For a `"parametric"` `Q<integer><unit>` template only: the load-bearing
   * integer and its unit letter (`S`/`M`/`H`/`D`/`W`/`L`, or `J` for
   * day-of-week). OMITTED for `"named"`/`"unknown"` patterns. Informational,
   * `code` remains authoritative.
   */
  readonly interval?: { readonly count: number; readonly unit: string };
}

/**
 * A composite-quantity (CQ) value on an order/medication timing: the TQ1-2
 * service quantity. `value` is strict-`Number()` parsed (`undefined`,
 * never `NaN`); `units` carries any CQ.2 units. Both keys OMITTED when absent.
 *
 * @example
 * ```ts
 * import type { TimingQuantity } from "@cosyte/hl7";
 * const q: TimingQuantity = { value: 1, units: { identifier: "tablet" } };
 * ```
 */
export interface TimingQuantity {
  /** CQ.1 quantity numeric value (strict-parsed; never `NaN`). */
  readonly value?: number;
  /** CQ.2 units. */
  readonly units?: CWE;
}

/**
 * The order/medication **timing** structure: one TQ1 segment (v2.5+) or the
 * legacy embedded TQ in ORC-7 / RXE-1 (pre-v2.5). Attached to
 * {@link Order.timings} and {@link Medication.timings}.
 *
 * **Safety contract.** hl7 surfaces the timing **structure**; it does **not**
 * compute administration schedules, resolve "institution-specified times" to
 * clock times, or interpret sig. The load-bearing {@link repeatPattern} and
 * {@link totalOccurrences} are preserved verbatim (see {@link RepeatPattern});
 * `startDateTime`/`endDateTime` keep the `TS` precision + timezone
 * fidelity. A malformed timing never throws: absent pieces are omitted keys.
 *
 * @example
 * ```ts
 * import type { OrderTiming } from "@cosyte/hl7";
 * const t: OrderTiming = {
 *   source: "TQ1",
 *   quantity: { value: 1 },
 *   repeatPattern: { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } },
 *   totalOccurrences: 20,
 * };
 * ```
 */
export interface OrderTiming {
  /**
   * Which structure this timing was read from: the dedicated **TQ1** segment
   * (v2.5+) or the **legacy** embedded TQ data type in ORC-7 (orders) / RXE-1
   * (encoded medications, pre-v2.5). The library treats the presence of a TQ1
   * segment as the v2.5+ signal: the legacy embedded TQ is surfaced only when
   * no TQ1 accompanies the order, so the same timing is never double-counted
   * and a legacy-only timing is never dropped.
   */
  readonly source: "TQ1" | "legacy";
  /** TQ1-2 / legacy TQ.1 service quantity (CQ). */
  readonly quantity?: TimingQuantity;
  /** TQ1-3 / legacy TQ.2 interval RI.1 repeat pattern (Table 0335): verbatim. See {@link RepeatPattern}. */
  readonly repeatPattern?: RepeatPattern;
  /** TQ1-4 / legacy TQ.2 interval RI.2 explicit time(s): surfaced verbatim (first repetition/value). */
  readonly explicitTime?: string;
  /** TQ1-6 / legacy TQ.3 service duration: surfaced verbatim. */
  readonly serviceDuration?: string;
  /** TQ1-7 / legacy TQ.4 start date/time as the fidelity `TS`. */
  readonly startDateTime?: TS;
  /** TQ1-8 / legacy TQ.5 end date/time as the fidelity `TS`. */
  readonly endDateTime?: TS;
  /** TQ1-9 priority (CWE) / legacy TQ.6 priority (surfaced as a CWE `{ identifier }`). */
  readonly priority?: CWE;
  /**
   * TQ1-14 / legacy TQ.12 total occurrences (NM): how many times the service
   * is to be performed (strict-parsed; never `NaN`). **TQ1-14, not TQ1-11**
   * (TQ1-11 is Text Instruction). Load-bearing: losing it drops the total
   * administered count.
   */
  readonly totalOccurrences?: number;
}

/**
 * OBR-derived order (HELPERS-05, D-16) with positionally-grouped OBX children
 * (D-12). `observations` is ALWAYS present: empty when no OBX follows this
 * OBR before the next OBR or end-of-message. `timings` is ALWAYS present,
 * empty when the order carries no TQ1 / legacy embedded TQ.
 *
 * @example
 * ```ts
 * import type { Order } from "@cosyte/hl7";
 * const order: Order = {
 *   placerOrderNumber: "PLACER1",
 *   fillerOrderNumber: "FILLER1",
 *   universalServiceId: { identifier: "GLU", text: "Glucose" },
 *   orderStatus: "F",
 *   resultStatus: {
 *     classification: "final",
 *     code: "F",
 *     table: { name: "HL7 Table 0123", version: "3.0.0" },
 *     map: {
 *       url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status",
 *       version: "1.0.0",
 *     },
 *   },
 *   observations: [],
 *   timings: [],
 * };
 * ```
 */
export interface Order {
  /** OBR-2 placer order number. */
  readonly placerOrderNumber?: string;
  /** OBR-3 filler order number. */
  readonly fillerOrderNumber?: string;
  /** OBR-4 universal service identifier (test code + description). */
  readonly universalServiceId?: CWE;
  /** OBR-25 result status (HL7 Table 0123, e.g. `"F"` final, `"P"` preliminary). */
  readonly orderStatus?: string;
  /**
   * OBR-25 read against HL7 Table 0123 and classified by HL7's Table 0123 to
   * Diagnostic Report Status map. Always present: `"undetermined"` when OBR-25
   * is absent, unmapped or not exactly one code. Classified from OBR-25 alone,
   * never from the statuses of the order's observations, each of which carries
   * its own. See {@link ResultStatusClassification}.
   */
  readonly resultStatus: ResultStatusClassification;
  /** ORC-1 order control when an ORC precedes this OBR. */
  readonly orderControl?: string;
  /** OBR-16 ordering provider (D-24a XCN). */
  readonly orderedBy?: XCN;
  /** OBX children grouped under this OBR (D-12 positional grouping). Always present. */
  readonly observations: readonly Observation[];
  /**
   * TQ1 / legacy embedded-TQ timing(s) grouped under this order.
   * Always present: empty when the order carries no timing. See
   * {@link OrderTiming}.
   */
  readonly timings: readonly OrderTiming[];
  /**
   * NTE note lines positionally attached to this order: the
   * ORC-region notes (before the OBR) followed by the OBR-region notes, in
   * document order. Several ORCs before one OBR all contribute here; nothing is
   * dropped. OMITTED when the order carries no notes. A note on a trailing or
   * dangling ORC that never opens an order is surfaced at message level
   * (`msg.notes()`), not here: still never dropped. High-PHI-risk clinical
   * narrative.
   */
  readonly notes?: readonly string[];
}

/**
 * NK1-derived next-of-kin entry (HELPERS-06). Lean subset: callers can
 * reach for `msg.segments("NK1")` when they need the full NK1 surface.
 *
 * @example
 * ```ts
 * import type { NextOfKin } from "@cosyte/hl7";
 * const nk: NextOfKin = {
 *   name: { familyName: "Doe", givenName: "John" },
 *   relationship: { identifier: "FTH", text: "Father" },
 * };
 * ```
 */
export interface NextOfKin {
  /** NK1-2 next-of-kin name. */
  readonly name?: XPN;
  /** NK1-3 relationship to patient (FTH=father, MTH=mother, SPO=spouse, ...). */
  readonly relationship?: CWE;
  /** NK1-4 address. */
  readonly address?: XAD;
  /** NK1-5 phone (first repetition). */
  readonly phone?: XTN;
  /** NK1-7 contact role. */
  readonly contactRole?: CWE;
}

/**
 * The segment an {@link Allergy} entry was read from: `"AL1"` (Patient Allergy
 * Information) or `"IAM"` (Patient Adverse Reaction Information, the segment an
 * ADT^A60 carries in place of AL1).
 *
 * @example
 * ```ts
 * import type { AllergySource } from "@cosyte/hl7";
 * const source: AllergySource = "IAM";
 * ```
 */
export type AllergySource = "AL1" | "IAM";

/**
 * IAM-7 allergy unique identifier (EI): the sender's identifier for one
 * allergy, which an update or delete for that allergy repeats. Components 1
 * and 2 only; each key is OMITTED when its component is empty. It is never
 * filled from IAM-3 or any other field when IAM-7 is absent.
 *
 * @example
 * ```ts
 * import type { AllergyUniqueIdentifier } from "@cosyte/hl7";
 * const id: AllergyUniqueIdentifier = { entityIdentifier: "ALG-0001", namespaceId: "LAB" };
 * ```
 */
export interface AllergyUniqueIdentifier {
  /**
   * EI-1 entity identifier, verbatim.
   *
   * @example
   * ```ts
   * msg.allergies()[0]?.uniqueIdentifier?.entityIdentifier; // "ALG-0001"
   * ```
   */
  readonly entityIdentifier?: string;
  /**
   * EI-2 namespace ID of the application that assigned the identifier, verbatim.
   *
   * @example
   * ```ts
   * msg.allergies()[0]?.uniqueIdentifier?.namespaceId; // "LAB"
   * ```
   */
  readonly namespaceId?: string;
}

/**
 * One allergy entry, read from an AL1 or an IAM segment (see `source`). Both
 * segments fill `type`, `code`, `severity` and `reaction` in the same shapes;
 * `onsetDate` comes from AL1 only, and `actionCode`, `deleteRequested` and
 * `uniqueIdentifier` from IAM only. Every key but `source` is OMITTED when the
 * field it reads is empty: none is defaulted.
 *
 * An entry is a report of what one segment said, never the result of applying
 * it. An IAM entry whose action code is `D` is a request to delete an allergy
 * sent earlier, and it is still returned: it is marked by `deleteRequested`,
 * and nothing is removed, merged or updated on the caller's behalf.
 *
 * @example
 * ```ts
 * import type { Allergy } from "@cosyte/hl7";
 * const al: Allergy = {
 *   source: "AL1",
 *   type: "DA",
 *   code: { identifier: "PEN", text: "Penicillin" },
 *   severity: "SV",
 *   reaction: "Hives",
 * };
 * ```
 */
export interface Allergy {
  /**
   * The segment this entry was read from. Always present.
   *
   * @example
   * ```ts
   * const fromIam = msg.allergies().filter((al) => al.source === "IAM");
   * ```
   */
  readonly source: AllergySource;
  /** AL1-2 or IAM-2 allergen type, component 1 (DA=drug, FA=food, EA=environmental, ...). */
  readonly type?: string;
  /** AL1-3 or IAM-3 allergen code. */
  readonly code?: CWE;
  /** AL1-4 or IAM-4 severity, component 1 (SV=severe, MO=moderate, MI=mild). */
  readonly severity?: string;
  /** AL1-5 or IAM-5 allergy reaction (first repetition). */
  readonly reaction?: string;
  /** AL1-6 onset date as the fidelity `TS`. */
  readonly onsetDate?: TS;
  /**
   * IAM-6 allergy action code (Table 0206), component 1 exactly as sent: no
   * case-folding, no mapping, and an unlisted code surfaced as it arrived.
   * OMITTED when IAM-6 is empty, never defaulted to `A`. Absent on AL1 entries.
   * IAM-6 does not repeat: a malformed repeated IAM-6 surfaces every
   * repetition's component 1, joined by the message's repetition separator
   * (`D~A`), rather than its first piece.
   *
   * @example
   * ```ts
   * for (const al of msg.allergies()) {
   *   if (al.actionCode === "U") console.log("update to", al.uniqueIdentifier?.entityIdentifier);
   * }
   * ```
   */
  readonly actionCode?: string;
  /**
   * `true` when `actionCode` is exactly `D`: this entry asks the receiver to
   * delete an allergy sent earlier, identified by `uniqueIdentifier`. OMITTED on
   * every other entry, including a lowercase `d`, an unknown or malformed code,
   * an empty IAM-6 and every AL1 entry. The entry itself is still returned, with
   * every field it carries; the delete is never applied here.
   *
   * @example
   * ```ts
   * const current = msg.allergies().filter((al) => al.deleteRequested !== true);
   * ```
   */
  readonly deleteRequested?: true;
  /**
   * IAM-7 allergy unique identifier, components 1 and 2. OMITTED when IAM-7 is
   * empty; never filled from IAM-3. Absent on AL1 entries.
   *
   * @example
   * ```ts
   * msg.allergies()[0]?.uniqueIdentifier?.entityIdentifier; // "ALG-0001"
   * ```
   */
  readonly uniqueIdentifier?: AllergyUniqueIdentifier;
}

/**
 * DG1-derived diagnosis entry (HELPERS-06). `dateTime` is the fidelity `TS`.
 *
 * @example
 * ```ts
 * import type { Diagnosis } from "@cosyte/hl7";
 * const dg: Diagnosis = {
 *   code: { identifier: "E11.9", text: "Type 2 diabetes" },
 *   description: "Type 2 diabetes mellitus without complications",
 *   type: "F",
 * };
 * ```
 */
export interface Diagnosis {
  /** DG1-3 diagnosis code. */
  readonly code?: CWE;
  /** DG1-4 diagnosis description. */
  readonly description?: string;
  /** DG1-5 diagnosis date/time as the fidelity `TS`. */
  readonly dateTime?: TS;
  /** DG1-6 diagnosis type (A=admitting, W=working, F=final). */
  readonly type?: string;
}

/**
 * Which pharmacy/treatment segment a `Medication` was extracted from: the
 * clinical "phase" of the medication. Each value maps 1:1 to one RX* parent
 * segment (Ch. 4A):
 * - `"order"`: **RXO** (Pharmacy/Treatment Order): the originally *requested*
 *   give code/amount/dosage-form, before pharmacy encoding.
 * - `"encoded"`: **RXE** (Encoded Order): the pharmacy-encoded give
 *   code/amount, plus the give *strength* (RXE-25/26): the only context that
 *   carries a separate strength.
 * - `"dispense"`: **RXD** (Dispense): what was actually dispensed.
 * - `"administration"`: **RXA** (Administration): what was actually given to
 *   the patient.
 *
 * The context is preserved verbatim and never collapsed: an RDE order that
 * carries both an RXO request and an RXE encoded line surfaces as TWO
 * `Medication` entries with distinct contexts: the helper never reconciles
 * one against the other.
 */
export type MedicationContext = "order" | "encoded" | "dispense" | "administration";

/**
 * The give / dispense / administered amount of a `Medication`.
 * Carries the HL7 min/max amount pair and its units.
 *
 * - For an **order** (RXO-2/3) or **encoded** order (RXE-3/4) the amount is a
 *   genuine min..max range: both keys may be present.
 * - For a **dispense** (RXD-4) or **administration** (RXA-6) there is a SINGLE
 *   amount; it is surfaced as `minimum` with `maximum` OMITTED. This is a
 *   single value, not a range: do not read the absent `maximum` as "no upper
 *   bound on a range".
 *
 * `minimum`/`maximum` are strict-`Number()` parsed (`undefined`, never `NaN`).
 * `units` is the give/dispense/administered units CWE (RXO-4 / RXE-5 / RXD-5 /
 * RXA-7); check `units.nameOfCodingSystem === "UCUM"` for computable units.
 *
 * @example
 * ```ts
 * import type { MedicationAmount } from "@cosyte/hl7";
 * const amount: MedicationAmount = { minimum: 250, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } };
 * ```
 */
export interface MedicationAmount {
  /** RXO-2 / RXE-3 minimum, or the single dispense (RXD-4) / administered (RXA-6) amount. */
  readonly minimum?: number;
  /** RXO-3 / RXE-4 maximum. OMITTED for single-amount (dispense/administration) contexts. */
  readonly maximum?: number;
  /** RXO-4 / RXE-5 / RXD-5 / RXA-7 give/dispense/administered units. */
  readonly units?: CWE;
}

/**
 * The give *strength* of an **encoded** `Medication` (RXE-25 value + RXE-26
 * units). Strength is the concentration of active ingredient (e.g.
 * "250 mg"), distinct from the give *amount* (how much is administered, e.g.
 * "2 tablets"). Only the `"encoded"` (RXE) context carries strength.
 *
 * **Fail-safe:** strength is surfaced exactly as the explicit
 * RXE-25/26 fields declare it, and is NEVER reconciled against any strength
 * *implied* by the give code (e.g. an NDC that encodes "250 mg"). A consumer
 * that sees both an explicit strength here and a coded drug in `giveCode` must
 * treat a disagreement as a real signal: the library does not silently pick a
 * winner. `value` is strict-`Number()` parsed (`undefined`, never `NaN`).
 *
 * @example
 * ```ts
 * import type { MedicationStrength } from "@cosyte/hl7";
 * const strength: MedicationStrength = { value: 250, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } };
 * ```
 */
export interface MedicationStrength {
  /** RXE-25 give strength numeric value (strict-parsed; never `NaN`). */
  readonly value?: number;
  /** RXE-26 give strength units. */
  readonly units?: CWE;
}

/**
 * One RXR (Pharmacy/Treatment Route) grouped under its parent RX* segment.
 * `route` is HL7 Table 0162 (CWE); `site` is Table 0163 (CWE).
 * Provenance travels on the CWE (`route.nameOfCodingSystem`): a "PO" route is
 * only safe to act on when you know the system it was coded against.
 *
 * @example
 * ```ts
 * import type { MedicationRoute } from "@cosyte/hl7";
 * const r: MedicationRoute = { route: { identifier: "PO", text: "Oral" } };
 * ```
 */
export interface MedicationRoute {
  /** RXR-1 route of administration (HL7 Table 0162). */
  readonly route?: CWE;
  /** RXR-2 administration site (HL7 Table 0163). */
  readonly site?: CWE;
}

/**
 * One RXC (Pharmacy/Treatment Component Order) grouped under its parent RX*
 * segment: a component of a compound/IV. Surfaced STRUCTURALLY
 * (the component list as authored), NOT pharmacologically resolved.
 *
 * @example
 * ```ts
 * import type { MedicationComponent } from "@cosyte/hl7";
 * const c: MedicationComponent = { type: "B", code: { identifier: "D5W", text: "Dextrose 5%" }, amount: 1000 };
 * ```
 */
export interface MedicationComponent {
  /** RXC-1 component type (e.g. "B"=base, "A"=additive: HL7 Table 0166). */
  readonly type?: string;
  /** RXC-2 component code. */
  readonly code?: CWE;
  /** RXC-3 component amount (strict-parsed; never `NaN`). */
  readonly amount?: number;
  /** RXC-4 component units. */
  readonly units?: CWE;
}

/**
 * A medication extracted from one RXO/RXE/RXD/RXA segment, with its RXR
 * (route) and RXC (component) children grouped
 * positionally. `context` records which RX* segment this came from (give
 * vs dispense vs administered).
 *
 * **Safety contract.** A wrong drug, strength, or route can harm a real
 * patient, so this view is deliberately conservative:
 * - `giveCode` carries its own coding-system provenance via the CWE
 *   (`giveCode.nameOfCodingSystem`: e.g. `RXN` RxNorm, `NDC`). The helper
 *   surfaces the *claim*; it never validates or looks the code up.
 * - `amount` (how much) and `strength` (concentration) are SEPARATE fields and
 *   are never reconciled: including against any strength a coded drug
 *   implies. A disagreement is preserved for the consumer to see.
 * - Malformed RX* segments never throw: absent fields are omitted keys.
 *
 * `routes` and `components` are ALWAYS present (possibly empty). So is
 * `timings`: empty when no TQ1 / legacy embedded TQ (RXE-1)
 * accompanies the medication; the repeat pattern is surfaced **verbatim, never
 * normalized to a schedule**. Deferred (not v1): sig/frequency *interpretation*,
 * dose-range or interaction checking, pharmacologic resolution of compounds.
 *
 * `orderControl` is ORC-1 of the ORC that opened this medication's order group,
 * surfaced **verbatim** (`NW`, `DC`, `HD`, an unlisted code, any letter case)
 * and never classified into an active, held or ended state.
 *
 * @example
 * ```ts
 * import type { Medication } from "@cosyte/hl7";
 * const med: Medication = {
 *   orderControl: "NW",
 *   context: "encoded",
 *   giveCode: { identifier: "1049630", text: "Acetaminophen 325 MG", nameOfCodingSystem: "RXN" },
 *   amount: { minimum: 2, units: { identifier: "TAB" } },
 *   strength: { value: 325, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } },
 *   routes: [{ route: { identifier: "PO", text: "Oral" } }],
 *   components: [],
 *   timings: [{ source: "TQ1", repeatPattern: { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } } }],
 * };
 * ```
 */
export interface Medication {
  /**
   * ORC-1 order control of the ORC that opened this medication's order group
   * (the run of segments from that ORC to the next ORC), exactly as sent: never
   * trimmed, case-folded, looked up, or classified into an active, held or ended
   * state. Every RX* segment in one group carries the same value. Omitted when no
   * ORC precedes the RX* segment in the message or that ORC's ORC-1 is empty; it
   * is never carried over from an earlier group.
   */
  readonly orderControl?: string;
  /** Which RX* segment this medication came from (give/dispense/administered). */
  readonly context: MedicationContext;
  /** RXO-1 / RXE-2 / RXD-2 / RXA-5 give/dispense/administered drug code, with provenance. */
  readonly giveCode?: CWE;
  /** Give/dispense/administered amount (+ units). See {@link MedicationAmount}. */
  readonly amount?: MedicationAmount;
  /** RXE-25/26 give strength: ENCODED context only; never reconciled with `giveCode`. */
  readonly strength?: MedicationStrength;
  /** RXO-5 requested dosage form (order context). */
  readonly dosageForm?: CWE;
  /** RXR children grouped under this RX* (Table 0162 route). Always present (possibly empty). */
  readonly routes: readonly MedicationRoute[];
  /** RXC children grouped under this RX* (compound components). Always present (possibly empty). */
  readonly components: readonly MedicationComponent[];
  /**
   * TQ1 / legacy embedded-TQ (RXE-1) timing(s) grouped under this medication.
   * Always present: empty when the medication carries no timing.
   * See {@link OrderTiming}.
   */
  readonly timings: readonly OrderTiming[];
}

/**
 * IN1-derived insurance entry (HELPERS-06) with positional IN2/IN3 presence
 * flags (D-05 extension). `hasIn2` / `hasIn3` are ALWAYS present booleans;
 * callers who need the full IN2/IN3 surface can walk `msg.segments("IN2")`.
 *
 * @example
 * ```ts
 * import type { Insurance } from "@cosyte/hl7";
 * const ins: Insurance = {
 *   planId: { identifier: "PLAN1", text: "Aetna PPO" },
 *   policyNumber: "POL123",
 *   groupNumber: "GRP1",
 *   hasIn2: false,
 *   hasIn3: false,
 * };
 * ```
 */
export interface Insurance {
  /** IN1-2 insurance plan id. */
  readonly planId?: CWE;
  /** IN1-3 insurance company id. */
  readonly companyId?: CX;
  /** IN1-4 insurance company name (first repetition, first component). */
  readonly companyName?: string;
  /** IN1-36 policy number. */
  readonly policyNumber?: string;
  /** IN1-8 group number. */
  readonly groupNumber?: string;
  /** IN1-16 insured's name. */
  readonly insuredName?: XPN;
  /** IN1-12 plan effective date as the fidelity `TS`. */
  readonly effectiveDate?: TS;
  /** IN1-13 plan expiration date as the fidelity `TS`. */
  readonly expirationDate?: TS;
  /** `true` iff an IN2 segment follows this IN1 before the next IN1. */
  readonly hasIn2: boolean;
  /** `true` iff an IN3 segment follows this IN1 before the next IN1. */
  readonly hasIn3: boolean;
}

/**
 * Whether an `Immunization` records a dose that was **administered** by the
 * reporting system or is **historical** information sourced from elsewhere,
 * derived conservatively from RXA-9.1 against HL7 Table NIP001 (Immunization
 * Information Source, CDC v2.5.1 Immunization Messaging IG):
 * - `"administered"`: RXA-9.1 is exactly `"00"` (New immunization record).
 * - `"historical"`: RXA-9.1 is `"01".."08"` (any "Historical information …"
 *   source).
 *
 * **Fail-safe:** this is OMITTED (never guessed) when RXA-9 is absent or carries
 * a code outside the NIP001 administered/historical set. The raw RXA-9 claim is
 * always preserved verbatim on `Immunization.informationSource`, so a consumer
 * can inspect the original code even when `recordOrigin` is undefined. The
 * distinction matters because an IIS de-duplicates a *historical* report
 * differently from a dose it believes was *administered*: guessing corrupts
 * the registry.
 */
export type ImmunizationRecordOrigin = "administered" | "historical";

/**
 * What an immunization record's administration status classifies to.
 * `"completed"` and `"not-done"` are the target codes of HL7's published
 * Table 0322 to Event Status map (RXA-20 `CP` and `PA` are `"completed"`,
 * `RE` and `NA` are `"not-done"`).
 *
 * - `"no-vaccine-administered"`: RXA-5 carries CDC CVX code `998` ("no
 *   vaccine administered"), whatever RXA-20 says.
 * - `"delete-requested"`: RXA-21 is exactly `D`. The record asks the receiver
 *   to delete an administration sent earlier; it is not a dose.
 * - `"undetermined"`: this library's fail-safe, not a map target. It covers an
 *   absent, empty or `""` (null) RXA-20, any RXA-20 or RXA-21 that is not
 *   exactly one code of its table (a lowercase code, whitespace around it, a
 *   code written as an escape sequence, a VT or FS byte inside the field, more
 *   than one repetition, component or subcomponent), and an RXA-5 that codes
 *   CVX `998` in one triplet and a different identifier in the other.
 *
 * Only `"completed"` counts as a dose given. An `"undetermined"` record is
 * never a dose by default: read the raw codes and decide.
 *
 * @example
 * ```ts
 * import type { ImmunizationStatusClass } from "@cosyte/hl7";
 * const notADose: readonly ImmunizationStatusClass[] = [
 *   "not-done",
 *   "no-vaccine-administered",
 *   "delete-requested",
 *   "undetermined",
 * ];
 * ```
 */
export type ImmunizationStatusClass =
  | "completed"
  | "not-done"
  | "no-vaccine-administered"
  | "delete-requested"
  | "undetermined";

/**
 * The HL7 v2 code table an {@link ImmunizationAdministrationStatus} read:
 * Table 0322 (Completion Status, RXA-20) or Table 0323 (Action Code, RXA-21),
 * each at the code-system version its codes were taken from.
 *
 * @example
 * ```ts
 * import type { ImmunizationStatusTable } from "@cosyte/hl7";
 * const table: ImmunizationStatusTable = { name: "HL7 Table 0322", version: "3.0.0" };
 * ```
 */
export interface ImmunizationStatusTable {
  /** `"HL7 Table 0322"` for RXA-20, `"HL7 Table 0323"` for RXA-21. */
  readonly name: "HL7 Table 0322" | "HL7 Table 0323";
  /** The code-system version the table's codes were taken from. */
  readonly version: "3.0.0";
}

/**
 * The published HL7 v2-to-FHIR map an RXA-20 classification followed, by
 * canonical URL and version. The map comes from the HL7 Version 2 to FHIR
 * Implementation Guide (STU 1, standards status Informative); a later map
 * revision shows up here as a changed `version`.
 *
 * @example
 * ```ts
 * import type { ImmunizationStatusMap } from "@cosyte/hl7";
 * const map: ImmunizationStatusMap = {
 *   url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status",
 *   version: "1.0.0",
 * };
 * ```
 */
export interface ImmunizationStatusMap {
  /** Canonical URL of the ConceptMap whose rows the classification follows. */
  readonly url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status";
  /** The ConceptMap version the classification follows. */
  readonly version: "1.0.0";
}

/**
 * The code set an RXA-5 classification read: the CDC's CVX (Vaccines
 * Administered) code set, and the one code of it this library reads, `998`
 * "no vaccine administered". The CVX code set carries no version number of its
 * own; `version` is the date the CDC last updated the `998` entry, so a later
 * change to that entry shows up here as a changed `version`.
 *
 * @example
 * ```ts
 * import type { ImmunizationStatusCodeSet } from "@cosyte/hl7";
 * const codeSet: ImmunizationStatusCodeSet = {
 *   name: "CDC CVX",
 *   code: "998",
 *   version: "2023-03-09",
 * };
 * ```
 */
export interface ImmunizationStatusCodeSet {
  /** The code set: the CDC's CVX (Vaccines Administered) codes. */
  readonly name: "CDC CVX";
  /** The CVX code read: `998`, "no vaccine administered". */
  readonly code: "998";
  /** The date the CDC last updated the `998` entry, as `YYYY-MM-DD`. */
  readonly version: "2023-03-09";
}

/**
 * What decided an {@link ImmunizationAdministrationStatus}: the RXA field the
 * deciding rule read, and the table, map or code set it read that field
 * against. Discriminated on `field`.
 *
 * - `"RXA-21"`: the action code decided (`"delete-requested"`, or
 *   `"undetermined"` for an RXA-21 outside Table 0323).
 * - `"RXA-5"`: the vaccine code decided (`"no-vaccine-administered"`, or
 *   `"undetermined"` for a CVX `998` contradicted by the other triplet).
 * - `"RXA-20"`: the completion status decided, by the Table 0322 map.
 *
 * @example
 * ```ts
 * import type { ImmunizationStatusBasis } from "@cosyte/hl7";
 * const basis: ImmunizationStatusBasis = {
 *   field: "RXA-21",
 *   table: { name: "HL7 Table 0323", version: "3.0.0" },
 * };
 * ```
 */
export type ImmunizationStatusBasis =
  | {
      /** RXA-20 Completion Status decided. */
      readonly field: "RXA-20";
      /** HL7 Table 0322, the table RXA-20 was read against. */
      readonly table: ImmunizationStatusTable & { readonly name: "HL7 Table 0322" };
      /** The Table 0322 to Event Status map the classification followed. */
      readonly map: ImmunizationStatusMap;
    }
  | {
      /** RXA-21 Action Code decided. */
      readonly field: "RXA-21";
      /** HL7 Table 0323, the table RXA-21 was read against. */
      readonly table: ImmunizationStatusTable & { readonly name: "HL7 Table 0323" };
    }
  | {
      /** RXA-5 Administered Code decided. */
      readonly field: "RXA-5";
      /** The CDC CVX code set, for code `998`. */
      readonly codeSet: ImmunizationStatusCodeSet;
    };

/**
 * An immunization record's administration status, derived from that RXA's own
 * RXA-5, RXA-20 and RXA-21: carried as `administrationStatus` on every
 * {@link Immunization}. It tells a dose given apart from a refused or
 * not-administered record, a CVX `998` "no vaccine administered" placeholder,
 * and a request to delete an administration sent earlier.
 *
 * **Which rule decides.** Exactly one rule decides, the first that applies:
 * 1. RXA-21 exactly `D`: `"delete-requested"`.
 * 2. RXA-21 present but not exactly one of `A`, `D`, `U`, `X` (HL7 Table
 *    0323): `"undetermined"`. RXA-21 `A`, `U`, `X` or empty change nothing.
 * 3. RXA-5 carries CVX `998` in a triplet whose coding system resolves to
 *    `CVX` (or, in the primary triplet, that names no coding system):
 *    `"no-vaccine-administered"`, or `"undetermined"` when the other triplet
 *    carries a different, non-empty identifier.
 * 4. RXA-20 by HL7's Table 0322 to Event Status map: `CP` and `PA`
 *    `"completed"`, `RE` and `NA` `"not-done"`, anything else `"undetermined"`.
 *
 * **Safety contract.** `"completed"` only when RXA-20 is exactly `CP` or `PA`,
 * RXA-21 is empty or exactly `A`, `U` or `X`, and RXA-5 carries no CVX `998`.
 * Each RXA classifies from its own fields alone: nothing is carried across
 * segments. A status is reported, never applied: a `"delete-requested"`
 * record is still returned, is never matched against an earlier message, and
 * removes nothing. The object is plain data, not a FHIR element.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * const given = msg
 *   .immunizations()
 *   .filter((imm) => imm.administrationStatus.classification === "completed");
 * for (const imm of msg.immunizations()) {
 *   const { classification, completionStatus, actionCode, decidedBy } = imm.administrationStatus;
 *   if (classification === "undetermined") {
 *     console.log("not classifiable:", decidedBy.field, completionStatus, actionCode);
 *   }
 * }
 * ```
 */
export interface ImmunizationAdministrationStatus {
  /** The classification the deciding rule gives the record. */
  readonly classification: ImmunizationStatusClass;
  /**
   * The raw RXA-20 code, byte-identical to the `completionStatus` of the same
   * immunization: the field's first value, decoded. OMITTED exactly when
   * `completionStatus` is (the field is absent, empty or `""`).
   */
  readonly completionStatus?: string;
  /**
   * The raw RXA-21 code, byte-identical to the `actionCode` of the same
   * immunization: the field's first value, decoded. OMITTED exactly when
   * `actionCode` is (the field is absent, empty or `""`).
   */
  readonly actionCode?: string;
  /** The field that decided, and the table, map or code set it was read against. */
  readonly decidedBy: ImmunizationStatusBasis;
}

/**
 * A vaccine dose extracted from one RXA (Pharmacy/Treatment Administration)
 * segment of a VXU^V04 immunization message, with its RXR
 * (route/site) and OBX (e.g. VFC eligibility / funding source) children grouped
 * positionally under the RXA, and `orderControl` from the preceding ORC of the
 * VXU order group (`ORC`→`RXA`→`[RXR]`→`[{OBX}]`).
 *
 * **Safety contract.** A wrong vaccine, dose, or mis-keyed action code can harm
 * a patient or corrupt an IIS (Immunization Information System) registry, so
 * this view is deliberately conservative:
 * - `vaccineCode` carries its own coding-system provenance via the CWE
 *   (`vaccineCode.nameOfCodingSystem`: `CVX` HL7 Table 0292; live IIS feeds
 *   frequently *dual-code* RXA-5 with an alternate CVX/NDC in CWE.4-6, surfaced
 *   as `vaccineCode.alternateIdentifier`/`alternateText`/`nameOfAlternateCodingSystem`).
 *   The helper reports the *claim*; it never validates or looks the code up.
 * - `actionCode` (RXA-21, `A`/`D`/`U`) is surfaced **verbatim** and never
 *   defaulted: mis-keying it corrupts a registry's add/delete/update dedup.
 * - `doseAmount` is strict-`Number()` parsed; the IIS "unknown dose" sentinel
 *   `999` is surfaced **as the number `999`**, never specially coerced.
 * - `recordOrigin` (administered vs historical) is derived only from the
 *   well-known NIP001 RXA-9.1 codes and OMITTED otherwise: see
 *   {@link ImmunizationRecordOrigin}.
 * - `administrationStatus` tells a dose given (`"completed"`) apart from a
 *   refused or not-administered record, a CVX `998` "no vaccine administered"
 *   placeholder and a delete request, and is `"undetermined"` rather than a
 *   guess: see {@link ImmunizationAdministrationStatus}. Every record is still
 *   returned, whatever it classifies as.
 * - Malformed RXA segments never throw: absent fields are omitted keys.
 *
 * `routes`, `observations` and `administrationStatus` are ALWAYS present
 * (`routes` and `observations` possibly empty). Deferred (not v1): IIS-specific
 * state profile constraints; CVX/MVX validity checks; the 2nd+ repetition of the
 * repeating RXA-15/16/17 lot/expiry/manufacturer fields (only the first
 * repetition is surfaced).
 *
 * @example
 * ```ts
 * import type { Immunization } from "@cosyte/hl7";
 * const imm: Immunization = {
 *   vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
 *   doseAmount: 0.5,
 *   doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
 *   doseUnitsAreUcum: true,
 *   recordOrigin: "administered",
 *   manufacturer: { identifier: "PMC", text: "Sanofi Pasteur", nameOfCodingSystem: "MVX" },
 *   completionStatus: "CP",
 *   actionCode: "A",
 *   administrationStatus: {
 *     classification: "completed",
 *     completionStatus: "CP",
 *     actionCode: "A",
 *     decidedBy: {
 *       field: "RXA-20",
 *       table: { name: "HL7 Table 0322", version: "3.0.0" },
 *       map: {
 *         url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status",
 *         version: "1.0.0",
 *       },
 *     },
 *   },
 *   routes: [{ route: { identifier: "IM", text: "Intramuscular" } }],
 *   observations: [],
 * };
 * ```
 */
export interface Immunization {
  /** ORC-1 order control when an ORC precedes this RXA in the VXU order group. */
  readonly orderControl?: string;
  /** RXA-5 administered vaccine code (CVX, HL7 Table 0292) with provenance + any alternate coding. */
  readonly vaccineCode?: CWE;
  /** RXA-6 administered dose amount (strict-parsed; never `NaN`). `999` = IIS "unknown", surfaced as-is. */
  readonly doseAmount?: number;
  /** RXA-7 administered dose units (UCUM). */
  readonly doseUnits?: CWE;
  /**
   * `true` iff RXA-7's coding system (CWE.3) is exactly `UCUM` (HL7 Table 0396)
   *: i.e. the dose unit is declared UCUM and safe to interpret as computable.
   * `false` means a unit IS present but is NOT declared UCUM (surfaced as-is,
   * never coerced). OMITTED when RXA-7 is absent. A *claim* check only: UCUM
   * grammar is not validated here.
   */
  readonly doseUnitsAreUcum?: boolean;
  /** RXA-9 immunization information source (HL7 Table NIP001), preserved verbatim. */
  readonly informationSource?: CWE;
  /** Derived administered-vs-historical classification from RXA-9.1. See {@link ImmunizationRecordOrigin}. */
  readonly recordOrigin?: ImmunizationRecordOrigin;
  /** RXA-3 date/time start of administration as the fidelity `TS`. */
  readonly administeredDateTime?: TS;
  /** RXA-15 substance lot number (first repetition). */
  readonly lotNumber?: string;
  /** RXA-16 substance expiration date (first repetition) as the fidelity `TS`. */
  readonly expirationDate?: TS;
  /** RXA-17 substance manufacturer (MVX, HL7 Table 0227; first repetition). */
  readonly manufacturer?: CWE;
  /** RXA-18 substance/treatment refusal reason (first repetition). */
  readonly refusalReason?: CWE;
  /** RXA-20 completion status (`CP`=complete, `RE`=refused, `NA`=not administered, `PA`=partially administered). */
  readonly completionStatus?: string;
  /** RXA-21 action code (`A`=add, `D`=delete, `U`=update): preserved verbatim, NEVER defaulted. */
  readonly actionCode?: string;
  /**
   * The record's administration status, derived from this RXA's own RXA-5,
   * RXA-20 and RXA-21, with the raw RXA-20 and RXA-21 codes beside it and the
   * field and table, map or code set that decided it. Always present:
   * `"undetermined"` when nothing classifies it. See
   * {@link ImmunizationAdministrationStatus}.
   */
  readonly administrationStatus: ImmunizationAdministrationStatus;
  /** RXR children grouped under this RXA (Table 0162 route / Table 0163 site). Always present (possibly empty). */
  readonly routes: readonly MedicationRoute[];
  /** OBX children grouped under this RXA (VFC eligibility, funding source, …). Always present (possibly empty). */
  readonly observations: readonly Observation[];
}

/**
 * One appointment resource grouped under a `SCH`: an AIS (service),
 * AIG (general resource), AIL (location), or AIP (personnel / provider) segment.
 * The resource identifier lives at position 3 of every AI* segment; for the
 * personnel resource (AIP) it is additionally surfaced as a typed `person`
 * (XCN), while the coded `code` (first component verbatim) is always available.
 *
 * @example
 * ```ts
 * import type { AppointmentResource } from "@cosyte/hl7";
 * const r: AppointmentResource = { kind: "location", code: { identifier: "OR-1" } };
 * ```
 */
export interface AppointmentResource {
  /** Which AI* segment sourced this resource: AIS→service, AIG→general, AIL→location, AIP→personnel. */
  readonly kind: "service" | "general" | "location" | "personnel";
  /**
   * The AI*-3 resource identifier surfaced as a coded element: `code.identifier`
   * is the resource id (first component, verbatim). AIS-3 / AIG-3 are coded
   * elements, so `code.text` / `code.nameOfCodingSystem` are meaningful there;
   * AIL-3 is a **PL** (location) rather than a coded element, so only
   * `code.identifier` (the location id, PL.1) is meaningful and the other CWE
   * fields are positional provenance, not a coding system. Provenance-only.
   */
  readonly code?: CWE;
  /** AIP-3 personnel resource as a typed `XCN` (personnel resources only): the appointment provider. */
  readonly person?: XCN;
}

/**
 * SCH-derived appointment entry (SIU scheduling breadth). Surfaces the
 * appointment identifiers, filler status (SCH-25, Table 0278), SCH-11 start/end
 * timing, and the AI* resource groups. NOT a scheduling-workflow state machine.
 *
 * @example
 * ```ts
 * import type { Appointment } from "@cosyte/hl7";
 * const appt: Appointment = {
 *   fillerAppointmentId: "A1001",
 *   fillerStatusCode: { identifier: "Booked" },
 *   resources: [],
 * };
 * ```
 */
export interface Appointment {
  /** SCH-1 placer appointment ID (EI first component, verbatim). */
  readonly placerAppointmentId?: string;
  /** SCH-2 filler appointment ID (EI first component, verbatim). */
  readonly fillerAppointmentId?: string;
  /** SCH-25 filler status code (HL7 Table 0278): the appointment status, verbatim/provenance-only. */
  readonly fillerStatusCode?: CWE;
  /** Appointment start date/time: SCH-11 TQ.4 (fidelity `TS`). */
  readonly startDateTime?: TS;
  /** Appointment end date/time: SCH-11 TQ.5 (fidelity `TS`). */
  readonly endDateTime?: TS;
  /** AIS/AIG/AIL/AIP resources grouped under this SCH. Always present (possibly empty). */
  readonly resources: readonly AppointmentResource[];
}

/**
 * TXA-derived clinical-document entry (MDM document breadth). The
 * load-bearing safety property: **completion status (TXA-17) and availability
 * status (TXA-19) are DISTINCT fields and are never conflated**: a document can
 * be *available* before it is *authenticated*, and reading a preliminary
 * document as final is the clinical harm. Both are verbatim / provenance-only.
 *
 * @example
 * ```ts
 * import type { ClinicalDocument } from "@cosyte/hl7";
 * const doc: ClinicalDocument = {
 *   documentType: "DS",
 *   completionStatus: "IP", // in progress: NOT yet authenticated
 *   availabilityStatus: "AV", // available: a different axis
 *   observations: [],
 * };
 * ```
 */
export interface ClinicalDocument {
  /** TXA-2 document type (HL7 Table 0270), verbatim. */
  readonly documentType?: string;
  /**
   * TXA-17 document **completion** status (HL7 Table 0271: e.g. `DO` documented,
   * `IP` in progress, `AU` authenticated, `LA` legally authenticated, `IN`
   * incomplete). Surfaced DISTINCT from {@link availabilityStatus}; verbatim,
   * never validated, never merged.
   */
  readonly completionStatus?: string;
  /**
   * TXA-19 document **availability** status (HL7 Table 0273: `AV` available,
   * `CA` cancelled, `OB` obsolete, `UN` unavailable). Surfaced DISTINCT from
   * {@link completionStatus}; verbatim, never validated, never merged.
   */
  readonly availabilityStatus?: string;
  /** TXA-4 activity date/time (fidelity `TS`). */
  readonly activityDateTime?: TS;
  /** TXA-12 unique document number (EI first component, verbatim). */
  readonly uniqueDocumentNumber?: string;
  /** TXA-13 parent document number (EI first component): addendum / replacement link. */
  readonly parentDocumentNumber?: string;
  /** OBX narrative body grouped under this TXA. Always present (possibly empty). */
  readonly observations: readonly Observation[];
}

/**
 * FT1-derived charge entry (DFT financial breadth). Billing-critical
 * fields surfaced with **no billing logic and no money-as-float**: the
 * extended/unit amounts are the verbatim CP wire text, never parsed to a number.
 *
 * @example
 * ```ts
 * import type { Charge } from "@cosyte/hl7";
 * const c: Charge = {
 *   transactionType: "CG",
 *   transactionCode: { identifier: "80053", text: "Metabolic panel" },
 *   amountExtended: "150.00^USD",
 *   diagnoses: [{ identifier: "E11.9" }],
 * };
 * ```
 */
export interface Charge {
  /** FT1-4 transaction date (fidelity `TS`). */
  readonly transactionDate?: TS;
  /** FT1-6 transaction type (HL7 Table 0017: `CG` charge, `CD` credit, `PY` payment, `AJ` adjustment). Verbatim. */
  readonly transactionType?: string;
  /** FT1-7 transaction code: the institution charge/procedure code (CWE, provenance-only, never validated). */
  readonly transactionCode?: CWE;
  /** FT1-10 transaction quantity (NM; strict-parsed, never `NaN`). */
  readonly quantity?: number;
  /** FT1-11 transaction amount, extended (CP): canonical wire text (e.g. `150.00^USD`, byte-exact for a plain amount); never parsed to a number. */
  readonly amountExtended?: string;
  /** FT1-12 transaction amount, unit (CP): canonical wire text; never parsed to a number. */
  readonly amountUnit?: string;
  /** FT1-19 diagnosis code(s) linked to this charge (CE, repeating): billing diagnosis linkage. Always present (possibly empty). */
  readonly diagnoses: readonly CWE[];
}
