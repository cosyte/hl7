/**
 * `immunizations` — Phase E (P0 safety) implementation of the VXU^V04
 * immunization extractor. Walks the message in document order and projects each
 * RXA (Pharmacy/Treatment Administration) segment into a typed `Immunization`,
 * grouping the RXR (route/site) and OBX (e.g. VFC eligibility / funding) that
 * follow it positionally under that RXA — the same order-group state machine
 * `orders()` uses for ORC → OBR → OBX, specialized to the VXU group
 * `ORC`→`RXA`→`[RXR]`→`[{OBX}]` (one RXA per ORC; CDC v2.5.1 Immunization
 * Messaging IG).
 *
 * Field map (HL7 Ch. 4A — RXA; CDC v2.5.1 Immunization Messaging IG R1.5):
 *   - RXA-3  date/time start of administration (TS)
 *   - RXA-5  administered vaccine code (CWE — CVX, Table 0292) + any alternate
 *   - RXA-6  administered dose amount (NM; `999` = IIS "unknown", surfaced as-is)
 *   - RXA-7  administered dose units (CWE — UCUM)
 *   - RXA-9  immunization information source (CWE — Table NIP001) → recordOrigin
 *   - RXA-15 substance lot number (ST, first repetition)
 *   - RXA-16 substance expiration date (TS, first repetition)
 *   - RXA-17 substance manufacturer (CWE — MVX, Table 0227, first repetition)
 *   - RXA-18 substance/treatment refusal reason (CWE, first repetition)
 *   - RXA-20 completion status (ID — CP/RE/NA/PA)
 *   - RXA-21 action code (ID — A/D/U), preserved verbatim
 *   - RXR-1/2 route (Table 0162) / site (Table 0163), grouped (reuses MedicationRoute)
 *   - ORC-1   order control of the preceding ORC, attached as orderControl
 *
 * Safety rules enforced here (Phase E):
 *   - Never throws — malformed RXA surfaces as omitted keys (HELPERS-07).
 *   - `actionCode` (RXA-21) is surfaced VERBATIM and never defaulted — a wrong
 *     A/D/U corrupts an IIS add/delete/update dedup.
 *   - `recordOrigin` is derived ONLY from the well-known NIP001 RXA-9.1 codes
 *     (`00` administered; `01`-`08` historical) and OMITTED otherwise — the raw
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

import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CWE } from "../model/types/cwe.js";

import { buildObservation } from "./observations.js";
import type {
  Immunization,
  ImmunizationRecordOrigin,
  MedicationRoute,
  Observation,
} from "./types.js";

/**
 * NIP001 RXA-9.1 codes that classify a dose as *historical* (sourced from
 * elsewhere, not administered by the reporting system). `00` is the sole
 * administered code; everything outside this set + `00` yields `undefined`
 * (fail-safe — never guessed). @internal
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
 * Classify RXA-9.1 against HL7 Table NIP001 — `00` administered, `01`-`08`
 * historical, anything else (incl. absent) → `undefined` (fail-safe). @internal
 */
function classifyOrigin(infoSource: CWE | undefined): ImmunizationRecordOrigin | undefined {
  const code = infoSource?.identifier;
  if (code === undefined) return undefined;
  if (code === "00") return "administered";
  if (NIP001_HISTORICAL.has(code)) return "historical";
  return undefined;
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

  // RXA-3 administered date/time (D-18 flat Date).
  const administered = rxa.field(3).asTs();
  if (administered.date !== undefined) out.administeredDateTime = administered.date;

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

  // RXA-16 substance expiration date (first repetition; D-18 flat Date).
  const expiration = rxa.field(16).asTs();
  if (expiration.date !== undefined) out.expirationDate = expiration.date;

  // RXA-17 manufacturer (MVX, first repetition).
  const manufacturer = cweOrUndefined(rxa.field(17));
  if (manufacturer !== undefined) out.manufacturer = manufacturer;

  // RXA-18 refusal reason (first repetition).
  const refusalReason = cweOrUndefined(rxa.field(18));
  if (refusalReason !== undefined) out.refusalReason = refusalReason;

  // RXA-20 completion status.
  const completionStatus = stringOrUndefined(rxa.field(20).value);
  if (completionStatus !== undefined) out.completionStatus = completionStatus;

  // RXA-21 action code — VERBATIM, never defaulted.
  const actionCode = stringOrUndefined(rxa.field(21).value);
  if (actionCode !== undefined) out.actionCode = actionCode;

  return Object.freeze(out) as Immunization;
}

/**
 * Every RXA of a VXU^V04 as a typed `Immunization`, with RXR (route/site) and
 * OBX children grouped positionally under the RXA and `orderControl` carried
 * from the preceding ORC of the VXU order group (Phase E, P0 safety). Document
 * order. Returns `[]` when no RXA is present. NOT memoized — each call re-walks
 * `msg.allSegments()`. Never throws (HELPERS-07).
 *
 * The vaccine code carries its own coding-system provenance
 * (`vaccineCode.nameOfCodingSystem` — `CVX`); a dual-coded RXA-5 surfaces its
 * alternate (CVX/NDC) on `vaccineCode.alternateIdentifier`/`…`. The action code
 * (RXA-21) is surfaced verbatim and `recordOrigin` (administered vs historical)
 * is derived only from the well-known NIP001 RXA-9.1 codes — see
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
    if (currentRxa === undefined) continue; // RXR/OBX before any RXA — dropped.
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
