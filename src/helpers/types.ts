/**
 * Phase 4 helper type declarations — the 9 typed shapes returned by
 * `Hl7Message.meta`/`.patient`/`.visit` getters and the 6 collection methods
 * (`observations()`, `orders()`, `nextOfKin()`, `allergies()`, `diagnoses()`,
 * `insurance()`). Every field is `readonly`; every optional key is
 * `exactOptionalPropertyTypes`-safe (never `| undefined` on the declaration).
 *
 * Types compose on the 11 v1 composites from `src/model/types/*.ts` (XPN, XAD,
 * CX, CWE, CE, XTN, PL, XCN) — helpers are pure views on top of Phase 3's
 * composite coercions, never re-parsing the raw tree.
 *
 * Field lists locked by Phase 4 CONTEXT.md decisions D-01..D-24. Nine interfaces:
 * `Meta`, `Patient`, `Visit`, `Observation` (discriminated union + `ObservationBase`),
 * `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance`.
 */

import type { CE } from "../model/types/ce.js";
import type { CWE } from "../model/types/cwe.js";
import type { CX } from "../model/types/cx.js";
import type { PL } from "../model/types/pl.js";
import type { SN } from "../model/types/sn.js";
import type { XAD } from "../model/types/xad.js";
import type { XCN } from "../model/types/xcn.js";
import type { XPN } from "../model/types/xpn.js";
import type { XTN } from "../model/types/xtn.js";

/**
 * MSH-derived message metadata (HELPERS-01). D-03: always defined on
 * `Hl7Message.meta` (MSH absence throws `NO_MSH_SEGMENT` at parse time);
 * individual fields are optional because vendor-quirky messages routinely
 * omit pieces of MSH. D-18: `timestamp` is a flat `Date | undefined`, not
 * a `{ raw, date }` composite.
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
 * console.log(meta.timestamp?.toISOString());
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
  /** MSH-10 message control ID — unique per message per sender. */
  readonly controlId?: string;
  /** MSH-7 message date/time as a flat `Date` (D-18). */
  readonly timestamp?: Date;
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
 * (D-09 / D-20) — empty when the underlying field is absent. `name` is
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
 * console.log(p.dateOfBirth?.toISOString());
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
  /** PID-7 date of birth as flat `Date` (D-18). */
  readonly dateOfBirth?: Date;
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
}

/**
 * PV1-derived visit view (HELPERS-03). `msg.visit` is `undefined` when no PV1
 * segment exists; this interface describes the shape when present. D-24a:
 * doctor fields use XCN (not flat strings). D-18: date/time fields are flat
 * `Date | undefined`.
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
 * console.log(v.admitDateTime?.toISOString());
 * ```
 */
export interface Visit {
  /** PV1-2 patient class ("I"=inpatient, "O"=outpatient, "E"=ER, ...). */
  readonly patientClass?: string;
  /** PV1-3 assigned patient location (ward / room / bed) as PL. */
  readonly location?: PL;
  /** PV1-44 admit date/time (D-18 flat). */
  readonly admitDateTime?: Date;
  /** PV1-45 discharge date/time (D-18 flat). */
  readonly dischargeDateTime?: Date;
  /** PV1-7 attending doctor (D-24a XCN). */
  readonly attendingDoctor?: XCN;
  /** PV1-8 referring doctor (D-24a XCN). */
  readonly referringDoctor?: XCN;
  /** PV1-19 visit number. */
  readonly visitNumber?: string;
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
 * };
 * ```
 */
export interface ObservationBase {
  /** OBX-1 set id (string — typically sequential "1", "2", ...). */
  readonly setId?: string;
  /** OBX-3 observation identifier. Always present (may be `{}` if OBX-3 absent). */
  readonly identifier: CWE;
  /** OBX-6 units. */
  readonly units?: CWE;
  /**
   * `true` iff OBX-6's coding system (CWE.3, "name of coding system") is
   * exactly `UCUM` (HL7 Table 0396) — i.e. the unit is declared UCUM and is
   * safe to interpret as a computable unit. `false` means a unit IS present
   * but is NOT declared UCUM (e.g. a local code or free text) and is surfaced
   * as-is, never coerced. OMITTED when OBX-6 is absent. This is a *claim* check
   * only — the library does not validate UCUM grammar or check the alternate
   * coding system (CWE.6).
   */
  readonly unitsAreUcum?: boolean;
  /** OBX-7 reference range (e.g. "80-110"). */
  readonly referenceRange?: string;
  /** OBX-8 abnormal flags (e.g. "H", "HH", "L", "LL"). */
  readonly abnormalFlags?: string;
  /** OBX-11 observation result status (e.g. "F"=final, "P"=preliminary). */
  readonly status?: string;
  /** OBX-14 date/time of observation (D-18 flat). */
  readonly observedDateTime?: Date;
}

/**
 * One OBX segment as a typed Observation. `value` is discriminated by
 * `valueType` (OBX-2) per D-13:
 * - `"NM"` → `number | undefined`
 * - `"SN"` → `SN | undefined` (structured numeric: comparator / range / ratio)
 * - `"TS" | "DT"` → `Date | undefined` (flat per D-18)
 * - `"CWE" | "CE"` → `CWE | CE | undefined` (full composite per D-14)
 * - other (`"ST"`, `"TX"`, `"FT"`, `"ID"`, `"IS"`, `"NA"`, unknown) →
 *   `string | undefined` (auto-unescaped, D-23)
 *
 * D-22: `value` is `undefined` when OBX-5 is empty OR malformed for its
 * declared type (never throws, never Invalid Date, never `NaN`).
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
 * };
 * ```
 */
export type Observation = ObservationBase &
  (
    | { readonly valueType: "NM"; readonly value: number | undefined }
    | { readonly valueType: "SN"; readonly value: SN | undefined }
    | { readonly valueType: "TS" | "DT"; readonly value: Date | undefined }
    | { readonly valueType: "CWE" | "CE"; readonly value: CWE | CE | undefined }
    | { readonly valueType: string; readonly value: string | undefined }
  );

/**
 * OBR-derived order (HELPERS-05, D-16) with positionally-grouped OBX children
 * (D-12). `observations` is ALWAYS present — empty when no OBX follows this
 * OBR before the next OBR or end-of-message.
 *
 * @example
 * ```ts
 * import type { Order } from "@cosyte/hl7";
 * const order: Order = {
 *   placerOrderNumber: "PLACER1",
 *   fillerOrderNumber: "FILLER1",
 *   universalServiceId: { identifier: "GLU", text: "Glucose" },
 *   orderStatus: "F",
 *   observations: [],
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
  /** OBR-5 order status (v1 — Phase 7 may reconcile with OBR-25). */
  readonly orderStatus?: string;
  /** ORC-1 order control when an ORC precedes this OBR. */
  readonly orderControl?: string;
  /** OBR-16 ordering provider (D-24a XCN). */
  readonly orderedBy?: XCN;
  /** OBX children grouped under this OBR (D-12 positional grouping). Always present. */
  readonly observations: readonly Observation[];
}

/**
 * NK1-derived next-of-kin entry (HELPERS-06). Lean subset — callers can
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
 * AL1-derived allergy entry (HELPERS-06). D-18: `onsetDate` is flat.
 *
 * @example
 * ```ts
 * import type { Allergy } from "@cosyte/hl7";
 * const al: Allergy = {
 *   type: "DA",
 *   code: { identifier: "PEN", text: "Penicillin" },
 *   severity: "SV",
 *   reaction: "Hives",
 * };
 * ```
 */
export interface Allergy {
  /** AL1-2 allergy type (DA=drug, FA=food, EA=environmental, ...). */
  readonly type?: string;
  /** AL1-3 allergen code. */
  readonly code?: CWE;
  /** AL1-4 severity (SV=severe, MO=moderate, MI=mild). */
  readonly severity?: string;
  /** AL1-5 allergy reaction description (first value). */
  readonly reaction?: string;
  /** AL1-6 onset date (D-18 flat). */
  readonly onsetDate?: Date;
}

/**
 * DG1-derived diagnosis entry (HELPERS-06). D-18: `dateTime` is flat.
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
  /** DG1-5 diagnosis date/time (D-18 flat). */
  readonly dateTime?: Date;
  /** DG1-6 diagnosis type (A=admitting, W=working, F=final). */
  readonly type?: string;
}

/**
 * Which pharmacy/treatment segment a `Medication` was extracted from — the
 * clinical "phase" of the medication. Each value maps 1:1 to one RX* parent
 * segment (Phase D, Ch. 4A):
 * - `"order"` — **RXO** (Pharmacy/Treatment Order): the originally *requested*
 *   give code/amount/dosage-form, before pharmacy encoding.
 * - `"encoded"` — **RXE** (Encoded Order): the pharmacy-encoded give
 *   code/amount, plus the give *strength* (RXE-25/26) — the only context that
 *   carries a separate strength.
 * - `"dispense"` — **RXD** (Dispense): what was actually dispensed.
 * - `"administration"` — **RXA** (Administration): what was actually given to
 *   the patient.
 *
 * The context is preserved verbatim and never collapsed: an RDE order that
 * carries both an RXO request and an RXE encoded line surfaces as TWO
 * `Medication` entries with distinct contexts — the helper never reconciles
 * one against the other.
 */
export type MedicationContext = "order" | "encoded" | "dispense" | "administration";

/**
 * The give / dispense / administered amount of a `Medication` (Phase D).
 * Carries the HL7 min/max amount pair and its units.
 *
 * - For an **order** (RXO-2/3) or **encoded** order (RXE-3/4) the amount is a
 *   genuine min..max range — both keys may be present.
 * - For a **dispense** (RXD-4) or **administration** (RXA-6) there is a SINGLE
 *   amount; it is surfaced as `minimum` with `maximum` OMITTED. This is a
 *   single value, not a range — do not read the absent `maximum` as "no upper
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
 * units) — Phase D. Strength is the concentration of active ingredient (e.g.
 * "250 mg"), distinct from the give *amount* (how much is administered, e.g.
 * "2 tablets"). Only the `"encoded"` (RXE) context carries strength.
 *
 * **Fail-safe (Phase D §4):** strength is surfaced exactly as the explicit
 * RXE-25/26 fields declare it, and is NEVER reconciled against any strength
 * *implied* by the give code (e.g. an NDC that encodes "250 mg"). A consumer
 * that sees both an explicit strength here and a coded drug in `giveCode` must
 * treat a disagreement as a real signal — the library does not silently pick a
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
 * One RXR (Pharmacy/Treatment Route) grouped under its parent RX* segment
 * (Phase D). `route` is HL7 Table 0162 (CWE); `site` is Table 0163 (CWE).
 * Provenance travels on the CWE (`route.nameOfCodingSystem`) — a "PO" route is
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
 * segment (Phase D) — a component of a compound/IV. Surfaced STRUCTURALLY
 * (the component list as authored), NOT pharmacologically resolved.
 *
 * @example
 * ```ts
 * import type { MedicationComponent } from "@cosyte/hl7";
 * const c: MedicationComponent = { type: "B", code: { identifier: "D5W", text: "Dextrose 5%" }, amount: 1000 };
 * ```
 */
export interface MedicationComponent {
  /** RXC-1 component type (e.g. "B"=base, "A"=additive — HL7 Table 0166). */
  readonly type?: string;
  /** RXC-2 component code. */
  readonly code?: CWE;
  /** RXC-3 component amount (strict-parsed; never `NaN`). */
  readonly amount?: number;
  /** RXC-4 component units. */
  readonly units?: CWE;
}

/**
 * A medication extracted from one RXO/RXE/RXD/RXA segment (Phase D, P0
 * safety), with its RXR (route) and RXC (component) children grouped
 * positionally. `context` records which RX* segment this came from (give
 * vs dispense vs administered).
 *
 * **Safety contract.** A wrong drug, strength, or route can harm a real
 * patient, so this view is deliberately conservative:
 * - `giveCode` carries its own coding-system provenance via the CWE
 *   (`giveCode.nameOfCodingSystem` — e.g. `RXN` RxNorm, `NDC`). The helper
 *   surfaces the *claim*; it never validates or looks the code up.
 * - `amount` (how much) and `strength` (concentration) are SEPARATE fields and
 *   are never reconciled — including against any strength a coded drug implies
 *   (Phase D §4). A disagreement is preserved for the consumer to see.
 * - Malformed RX* segments never throw — absent fields are omitted keys.
 *
 * `routes` and `components` are ALWAYS present (possibly empty). Deferred (not
 * v1): sig/frequency interpretation, TQ1 timing normalization, dose-range or
 * interaction checking, pharmacologic resolution of compounds.
 *
 * @example
 * ```ts
 * import type { Medication } from "@cosyte/hl7";
 * const med: Medication = {
 *   context: "encoded",
 *   giveCode: { identifier: "1049630", text: "Acetaminophen 325 MG", nameOfCodingSystem: "RXN" },
 *   amount: { minimum: 2, units: { identifier: "TAB" } },
 *   strength: { value: 325, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } },
 *   routes: [{ route: { identifier: "PO", text: "Oral" } }],
 *   components: [],
 * };
 * ```
 */
export interface Medication {
  /** Which RX* segment this medication came from (give/dispense/administered). */
  readonly context: MedicationContext;
  /** RXO-1 / RXE-2 / RXD-2 / RXA-5 give/dispense/administered drug code, with provenance. */
  readonly giveCode?: CWE;
  /** Give/dispense/administered amount (+ units). See {@link MedicationAmount}. */
  readonly amount?: MedicationAmount;
  /** RXE-25/26 give strength — ENCODED context only; never reconciled with `giveCode`. */
  readonly strength?: MedicationStrength;
  /** RXO-5 requested dosage form (order context). */
  readonly dosageForm?: CWE;
  /** RXR children grouped under this RX* (Table 0162 route). Always present (possibly empty). */
  readonly routes: readonly MedicationRoute[];
  /** RXC children grouped under this RX* (compound components). Always present (possibly empty). */
  readonly components: readonly MedicationComponent[];
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
  /** IN1-12 plan effective date (D-18 flat). */
  readonly effectiveDate?: Date;
  /** IN1-13 plan expiration date (D-18 flat). */
  readonly expirationDate?: Date;
  /** `true` iff an IN2 segment follows this IN1 before the next IN1. */
  readonly hasIn2: boolean;
  /** `true` iff an IN3 segment follows this IN1 before the next IN1. */
  readonly hasIn3: boolean;
}
