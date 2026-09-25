/**
 * `immunizations`: VXU^V04 immunization extractor. Walks the message in
 * document order and projects each RXA (Pharmacy/Treatment Administration)
 * segment into a typed `Immunization`,
 * grouping the RXR (route/site) and OBX (e.g. VFC eligibility / funding) that
 * follow it positionally under that RXA: the same order-group state machine
 * `orders()` uses for ORC → OBR → OBX, specialized to the VXU group
 * `ORC`→`RXA`→`[RXR]`→`[{OBX}]` (one RXA per ORC; CDC v2.5.1 Immunization
 * Messaging IG).
 *
 * Field map (HL7 Ch. 4A: RXA; CDC v2.5.1 Immunization Messaging IG R1.5):
 *   - RXA-3  date/time start of administration (TS)
 *   - RXA-5  administered vaccine code (CWE: CVX, Table 0292) + any alternate
 *   - RXA-6  administered dose amount (NM; `999` = IIS "unknown", surfaced as-is)
 *   - RXA-7  administered dose units (CWE: UCUM)
 *   - RXA-9  immunization information source (CWE: Table NIP001) → recordOrigin
 *   - RXA-15 substance lot number (ST, first repetition)
 *   - RXA-16 substance expiration date (TS, first repetition)
 *   - RXA-17 substance manufacturer (CWE: MVX, Table 0227, first repetition)
 *   - RXA-18 substance/treatment refusal reason (CWE, first repetition)
 *   - RXA-20 completion status (ID: CP/RE/NA/PA)
 *   - RXA-21 action code (ID: A/D/U), preserved verbatim
 *   - RXA-5, RXA-20, RXA-21 → administrationStatus (derived; raw codes beside it)
 *   - RXR-1/2 route (Table 0162) / site (Table 0163), grouped (reuses MedicationRoute)
 *   - ORC-1   order control of the preceding ORC, attached as orderControl
 *
 * Safety rules enforced here:
 *   - Never throws: malformed RXA surfaces as omitted keys (HELPERS-07).
 *   - `actionCode` (RXA-21) is surfaced VERBATIM and never defaulted: a wrong
 *     A/D/U corrupts an IIS add/delete/update dedup.
 *   - `administrationStatus` is `"completed"` only for RXA-20 exactly `CP` or
 *     `PA` with RXA-21 empty or exactly `A`/`U`/`X` and no CVX `998` in RXA-5;
 *     every code not exactly mapped is `"undetermined"`. It is reported, never
 *     applied: a `D` record is still returned and matched against nothing.
 *   - `recordOrigin` is derived ONLY from the well-known NIP001 RXA-9.1 codes
 *     (`00` administered; `01`-`08` historical) and OMITTED otherwise: the raw
 *     RXA-9 claim is always preserved on `informationSource`. Never guessed.
 *   - `doseAmount` is strict-`Number()` parsed via `Field.asNm()` → never `NaN`;
 *     the `999` unknown-dose sentinel is surfaced as the number `999`, not coerced.
 *   - Code-system provenance rides on the CWE fields
 *     (`vaccineCode.nameOfCodingSystem`, `manufacturer.nameOfCodingSystem`,
 *     `route.nameOfCodingSystem`); the helper reports the claim, never validates it.
 *   - Output is frozen at the boundary (D-01).
 *
 * Grouping rules (parity with `orders()`):
 *   - Each RXA opens a new `Immunization`. A preceding ORC contributes its ORC-1
 *     as `orderControl`; an unmatched trailing ORC (after the last RXA) is dropped.
 *   - RXR/OBX seen before any RXA are not attached to a phantom immunization
 *     (pre-RXA OBX still surface via `msg.observations()`).
 *   - `routes` and `observations` are ALWAYS present arrays (empty when none).
 */

import { codingSystem } from "../model/coding-system.js";
import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CWE } from "../model/types/cwe.js";
import { fieldArrivedAltered } from "../parser/wire-fidelity.js";

import { buildObservation } from "./observations.js";
import { soleValue } from "./result-status.js";
import type {
  Immunization,
  ImmunizationAdministrationStatus,
  ImmunizationRecordOrigin,
  ImmunizationStatusBasis,
  ImmunizationStatusClass,
  MedicationRoute,
  Observation,
} from "./types.js";

/**
 * NIP001 RXA-9.1 codes that classify a dose as *historical* (sourced from
 * elsewhere, not administered by the reporting system). `00` is the sole
 * administered code; everything outside this set + `00` yields `undefined`
 * (fail-safe: never guessed). @internal
 */
const NIP001_HISTORICAL: ReadonlySet<string> = new Set([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
]);

/** Normalize HL7 empty-string to `undefined` for the helper layer. @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Drop empty-composite leaks so optional CWE keys stay absent when the field was blank. @internal */
function cweOrUndefined(field: Field): CWE | undefined {
  const cwe = field.asCwe();
  return Object.keys(cwe).length === 0 ? undefined : cwe;
}

/**
 * Classify RXA-9.1 against HL7 Table NIP001: `00` administered, `01`-`08`
 * historical, anything else (incl. absent) → `undefined` (fail-safe). @internal
 */
function classifyOrigin(infoSource: CWE | undefined): ImmunizationRecordOrigin | undefined {
  const code = infoSource?.identifier;
  if (code === undefined) return undefined;
  if (code === "00") return "administered";
  if (NIP001_HISTORICAL.has(code)) return "historical";
  return undefined;
}

const DECIDED_BY_COMPLETION_STATUS: ImmunizationStatusBasis = Object.freeze({
  field: "RXA-20",
  table: Object.freeze({ name: "HL7 Table 0322", version: "3.0.0" }),
  map: Object.freeze({
    url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status",
    version: "1.0.0",
  }),
});

const DECIDED_BY_ACTION_CODE: ImmunizationStatusBasis = Object.freeze({
  field: "RXA-21",
  table: Object.freeze({ name: "HL7 Table 0323", version: "3.0.0" }),
});

const DECIDED_BY_VACCINE_CODE: ImmunizationStatusBasis = Object.freeze({
  field: "RXA-5",
  codeSet: Object.freeze({ name: "CDC CVX", code: "998", version: "2023-03-09" }),
});

// Every row of the Table 0322 to Event Status map; it maps all four codes. A
// `Map`, not an object literal, so an inherited key can never match.
const COMPLETION_STATUS: ReadonlyMap<string, ImmunizationStatusClass> = new Map([
  ["CP", "completed"],
  ["PA", "completed"],
  ["RE", "not-done"],
  ["NA", "not-done"],
]);

// The Table 0323 codes other than `D`: each leaves the record to the next rule.
const DEFERRING_ACTION_CODES: ReadonlySet<string> = new Set(["A", "U", "X"]);

const CVX_NO_VACCINE_ADMINISTERED = "998";

/**
 * Whether the field arrived with nothing in it: absent, or empty between its
 * delimiters. The HL7 null `""`, a lone delimiter, whitespace, and a VT or FS
 * byte the parser removed are all something. @internal
 */
function arrivedEmpty(field: Field): boolean {
  if (field.isNull || fieldArrivedAltered(field.raw)) return false;
  return field.repetitions.length === 0 || soleValue(field) === "";
}

/**
 * Whether one RXA-5 triplet codes CVX `998`: the identifier is exactly `998`
 * and its coding system resolves to `CVX` by Table 0396 provenance, or, in the
 * primary triplet only, no coding system is named. @internal
 */
function triplet998(
  identifier: string | undefined,
  system: string | undefined,
  primary: boolean,
): boolean {
  if (identifier !== CVX_NO_VACCINE_ADMINISTERED) return false;
  const provenance = codingSystem(system);
  return provenance === undefined ? primary : provenance.id === "CVX";
}

/**
 * RXA-5 read for CVX `998`: `undefined` when neither triplet codes it,
 * `"undetermined"` when the other triplet carries a different, non-empty
 * identifier, `"no-vaccine-administered"` otherwise. @internal
 */
function classifyVaccineCode(code: CWE | undefined): ImmunizationStatusClass | undefined {
  if (code === undefined) return undefined;
  const primary = triplet998(code.identifier, code.nameOfCodingSystem, true);
  const alternate = triplet998(code.alternateIdentifier, code.nameOfAlternateCodingSystem, false);
  if (!primary && !alternate) return undefined;
  const other = primary ? code.alternateIdentifier : code.identifier;
  const contradicted = other !== undefined && other !== "" && other !== CVX_NO_VACCINE_ADMINISTERED;
  return contradicted ? "undetermined" : "no-vaccine-administered";
}

/**
 * The first rule that applies to one RXA, and only that one: RXA-21 exactly
 * `D`; RXA-21 present but not exactly one Table 0323 code; RXA-5 coding CVX
 * `998`; RXA-20 by the Table 0322 map. @internal
 */
function decideAdministration(
  rxa: Segment,
  vaccineCode: CWE | undefined,
): readonly [ImmunizationStatusClass, ImmunizationStatusBasis] {
  const actionField = rxa.field(21);
  const action = soleValue(actionField);
  if (action === "D") return ["delete-requested", DECIDED_BY_ACTION_CODE];
  const deferring = action !== undefined && DEFERRING_ACTION_CODES.has(action);
  if (!deferring && !arrivedEmpty(actionField)) return ["undetermined", DECIDED_BY_ACTION_CODE];

  const noVaccine = classifyVaccineCode(vaccineCode);
  if (noVaccine !== undefined) return [noVaccine, DECIDED_BY_VACCINE_CODE];

  const status = soleValue(rxa.field(20));
  const mapped = status === undefined ? undefined : COMPLETION_STATUS.get(status);
  return [mapped ?? "undetermined", DECIDED_BY_COMPLETION_STATUS];
}

/**
 * The frozen administration status of one RXA, carrying the raw RXA-20 and
 * RXA-21 codes the entry surfaces as `completionStatus` / `actionCode`. @internal
 */
function classifyAdministration(
  rxa: Segment,
  vaccineCode: CWE | undefined,
  completionStatus: string | undefined,
  actionCode: string | undefined,
): ImmunizationAdministrationStatus {
  const [classification, decidedBy] = decideAdministration(rxa, vaccineCode);
  type Mutable<T> = { -readonly [K in keyof T]: T[K] };
  const out: Mutable<ImmunizationAdministrationStatus> = { classification, decidedBy };
  if (completionStatus !== undefined) out.completionStatus = completionStatus;
  if (actionCode !== undefined) out.actionCode = actionCode;
  return Object.freeze(out);
}

/** One RXR segment → a grouped `MedicationRoute` (Table 0162 route + Table 0163 site). @internal */
function buildRoute(rxr: Segment): MedicationRoute {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<MedicationRoute> = {};

  const route = cweOrUndefined(rxr.field(1));
  if (route !== undefined) out.route = route;

  const site = cweOrUndefined(rxr.field(2));
  if (site !== undefined) out.site = site;

  return Object.freeze(out);
}

/** Build a frozen `Immunization` from one RXA + its attached ORC / routes / observations. @internal */
function finalizeImmunization(
  rxa: Segment,
  attachedOrc: Segment | undefined,
  routes: readonly MedicationRoute[],
  observations: readonly Observation[],
): Immunization {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Immunization> = {
    routes: Object.freeze(routes.slice()),
    observations: Object.freeze(observations.slice()),
  };

  // ORC-1 order control (when an ORC preceded this RXA).
  if (attachedOrc !== undefined) {
    const oc = stringOrUndefined(attachedOrc.field(1).value);
    if (oc !== undefined) out.orderControl = oc;
  }

  // RXA-3 administered date/time (fidelity TS, Phase N).
  const administered = rxa.field(3).asTs();
  if (administered.valid) out.administeredDateTime = administered;

  // RXA-5 vaccine code (CVX) with provenance + alternate coding.
  const vaccineCode = cweOrUndefined(rxa.field(5));
  if (vaccineCode !== undefined) out.vaccineCode = vaccineCode;

  // RXA-6 dose amount (strict-parsed; 999 unknown surfaced as-is).
  const doseAmount = rxa.field(6).asNm().value;
  if (doseAmount !== undefined) out.doseAmount = doseAmount;

  // RXA-7 dose units (UCUM) + the unitsAreUcum claim flag.
  const doseUnits = cweOrUndefined(rxa.field(7));
  if (doseUnits !== undefined) {
    out.doseUnits = doseUnits;
    out.doseUnitsAreUcum = doseUnits.nameOfCodingSystem === "UCUM";
  }

  // RXA-9 information source (NIP001) → preserve raw + derive recordOrigin.
  const informationSource = cweOrUndefined(rxa.field(9));
  if (informationSource !== undefined) out.informationSource = informationSource;
  const recordOrigin = classifyOrigin(informationSource);
  if (recordOrigin !== undefined) out.recordOrigin = recordOrigin;

  // RXA-15 lot number (first repetition).
  const lotNumber = stringOrUndefined(rxa.field(15).value);
  if (lotNumber !== undefined) out.lotNumber = lotNumber;

  // RXA-16 substance expiration date (first repetition; fidelity TS, Phase N).
  const expiration = rxa.field(16).asTs();
  if (expiration.valid) out.expirationDate = expiration;

  // RXA-17 manufacturer (MVX, first repetition).
  const manufacturer = cweOrUndefined(rxa.field(17));
  if (manufacturer !== undefined) out.manufacturer = manufacturer;

  // RXA-18 refusal reason (first repetition).
  const refusalReason = cweOrUndefined(rxa.field(18));
  if (refusalReason !== undefined) out.refusalReason = refusalReason;

  // RXA-20 completion status.
  const completionStatus = stringOrUndefined(rxa.field(20).value);
  if (completionStatus !== undefined) out.completionStatus = completionStatus;

  // RXA-21 action code: VERBATIM, never defaulted.
  const actionCode = stringOrUndefined(rxa.field(21).value);
  if (actionCode !== undefined) out.actionCode = actionCode;

  // Derived from RXA-5, RXA-20 and RXA-21 read above; always present.
  out.administrationStatus = classifyAdministration(rxa, vaccineCode, completionStatus, actionCode);

  return Object.freeze(out) as Immunization;
}

/**
 * Every RXA of a VXU^V04 as a typed `Immunization`, with RXR (route/site) and
 * OBX children grouped positionally under the RXA and `orderControl` carried
 * from the preceding ORC of the VXU order group. Document order.
 * Returns `[]` when no RXA is present. NOT memoized: each call re-walks
 * `msg.allSegments()`. Never throws (HELPERS-07).
 *
 * The vaccine code carries its own coding-system provenance
 * (`vaccineCode.nameOfCodingSystem`: `CVX`); a dual-coded RXA-5 surfaces its
 * alternate (CVX/NDC) on `vaccineCode.alternateIdentifier`/`…`. The action code
 * (RXA-21) is surfaced verbatim and `recordOrigin` (administered vs historical)
 * is derived only from the well-known NIP001 RXA-9.1 codes; every entry carries
 * `administrationStatus`, derived from its own RXA-5, RXA-20 and RXA-21: see
 * {@link Immunization}.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const imm of msg.immunizations()) {
 *   console.log(imm.vaccineCode?.identifier, imm.vaccineCode?.nameOfCodingSystem);
 *   console.log(imm.doseAmount, imm.doseUnits?.identifier, imm.recordOrigin);
 *   console.log(imm.actionCode, imm.completionStatus);
 *   console.log(imm.administrationStatus.classification); // "completed" for a dose given
 *   for (const r of imm.routes) console.log(r.route?.identifier);
 * }
 * ```
 *
 * @internal
 */
export function immunizations(msg: Hl7Message): readonly Immunization[] {
  const out: Immunization[] = [];

  let pendingOrc: Segment | undefined; // accumulates ORCs since the last RXA
  let currentRxa: Segment | undefined;
  let currentOrc: Segment | undefined; // ORC attached to the open RXA group
  let routes: MedicationRoute[] = [];
  let observations: Observation[] = [];

  const closeCurrent = (): void => {
    if (currentRxa !== undefined) {
      out.push(finalizeImmunization(currentRxa, currentOrc, routes, observations));
    }
  };

  for (const seg of msg.allSegments()) {
    if (seg.type === "ORC") {
      pendingOrc = seg;
      continue;
    }
    if (seg.type === "RXA") {
      // Close the previous group, then open a new one; promote pendingOrc.
      closeCurrent();
      currentRxa = seg;
      currentOrc = pendingOrc;
      pendingOrc = undefined;
      routes = [];
      observations = [];
      continue;
    }
    if (currentRxa === undefined) continue; // RXR/OBX before any RXA: dropped.
    if (seg.type === "RXR") {
      routes.push(buildRoute(seg));
    } else if (seg.type === "OBX") {
      observations.push(buildObservation(seg));
    }
  }

  // Finalize the trailing immunization group. A trailing ORC stays in
  // pendingOrc and is implicitly dropped (never promoted).
  closeCurrent();

  return Object.freeze(out);
}
