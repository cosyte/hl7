/**
 * `medications` — Phase D (P0 safety) implementation of the pharmacy/treatment
 * extractor. Walks the message in document order and projects each RXO / RXE /
 * RXD / RXA segment into a typed `Medication`, grouping the RXR (route) and
 * RXC (component) segments that follow it positionally under that parent —
 * the same state-machine pattern `orders()` uses for OBR → OBX (D-12).
 *
 * Field map (HL7 Ch. 4A — Pharmacy/Treatment):
 *   - RXO (order):          give RXO-1, amount RXO-2/3, units RXO-4, form RXO-5
 *   - RXE (encoded):        give RXE-2, amount RXE-3/4, units RXE-5,
 *                           strength RXE-25 + units RXE-26
 *   - RXD (dispense):       give RXD-2, amount RXD-4 (single), units RXD-5
 *   - RXA (administration): give RXA-5, amount RXA-6 (single), units RXA-7
 *   - RXR (route, grouped): route RXR-1 (Table 0162), site RXR-2 (Table 0163)
 *   - RXC (component, grouped): type RXC-1, code RXC-2, amount RXC-3, units RXC-4
 *
 * Safety rules enforced here (Phase D §4):
 *   - Never throws — malformed RX* surface as omitted keys (matches the helper
 *     layer contract; HELPERS-07).
 *   - `amount` (how much) and `strength` (concentration) are surfaced as
 *     SEPARATE fields and are NEVER reconciled — including against any strength
 *     a coded drug (e.g. an NDC) implies. A disagreement is preserved.
 *   - Numeric fields are strict-`Number()` parsed via `Field.asNm()` → never
 *     `NaN`; absent/blank → key omitted.
 *   - Code-system provenance rides on the give-code CWE
 *     (`giveCode.nameOfCodingSystem`); the helper reports the claim, never
 *     validates it.
 *   - Output is frozen at the boundary (Order/Observation parity, D-01).
 *
 * Grouping rules:
 *   - Each RXO/RXE/RXD/RXA opens a new `Medication`. RXR/RXC seen before any
 *     RX* parent are dropped (parity with `orders()` dropping a leading OBX /
 *     trailing ORC) — they are not attached to a phantom medication.
 *   - `routes` and `components` are ALWAYS present arrays (empty when none).
 */

import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CWE } from "../model/types/cwe.js";
import type {
  Medication,
  MedicationAmount,
  MedicationComponent,
  MedicationContext,
  MedicationRoute,
  MedicationStrength,
} from "./types.js";

/** The four RX* parent segment types that each open a `Medication`. @internal */
const PARENT_CONTEXT: Readonly<Record<string, MedicationContext>> = {
  RXO: "order",
  RXE: "encoded",
  RXD: "dispense",
  RXA: "administration",
};

/** Drop empty-composite leaks so optional CWE keys stay absent when the field was blank. @internal */
function cweOrUndefined(field: Field): CWE | undefined {
  const cwe = field.asCwe();
  return Object.keys(cwe).length === 0 ? undefined : cwe;
}

/**
 * Build the give/dispense/administered amount from a (min, max, units) field
 * triple. Returns `undefined` when none of the three carries content so the
 * optional `amount` key stays absent. `max` is `undefined` for single-amount
 * (dispense/administration) callers. @internal
 */
function buildAmount(
  minField: Field,
  maxField: Field | undefined,
  unitsField: Field,
): MedicationAmount | undefined {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<MedicationAmount> = {};

  const minimum = minField.asNm().value;
  if (minimum !== undefined) out.minimum = minimum;

  if (maxField !== undefined) {
    const maximum = maxField.asNm().value;
    if (maximum !== undefined) out.maximum = maximum;
  }

  const units = cweOrUndefined(unitsField);
  if (units !== undefined) out.units = units;

  return Object.keys(out).length === 0 ? undefined : Object.freeze(out);
}

/** RXE-25/26 give strength — surfaced verbatim, never reconciled with the give code. @internal */
function buildStrength(rxe: Segment): MedicationStrength | undefined {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<MedicationStrength> = {};

  const value = rxe.field(25).asNm().value;
  if (value !== undefined) out.value = value;

  const units = cweOrUndefined(rxe.field(26));
  if (units !== undefined) out.units = units;

  return Object.keys(out).length === 0 ? undefined : Object.freeze(out);
}

/** Build the give-code + amount + (strength/form) for one RX* parent by context. @internal */
function buildFromParent(parent: Segment, context: MedicationContext): Medication {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Medication> = { context, routes: [], components: [] };

  let giveCode: CWE | undefined;
  let amount: MedicationAmount | undefined;

  switch (context) {
    case "order": {
      giveCode = cweOrUndefined(parent.field(1));
      amount = buildAmount(parent.field(2), parent.field(3), parent.field(4));
      const form = cweOrUndefined(parent.field(5));
      if (form !== undefined) out.dosageForm = form;
      break;
    }
    case "encoded": {
      giveCode = cweOrUndefined(parent.field(2));
      amount = buildAmount(parent.field(3), parent.field(4), parent.field(5));
      const strength = buildStrength(parent);
      if (strength !== undefined) out.strength = strength;
      break;
    }
    case "dispense": {
      giveCode = cweOrUndefined(parent.field(2));
      // RXD-4 is a SINGLE actual-dispense amount — no max field.
      amount = buildAmount(parent.field(4), undefined, parent.field(5));
      break;
    }
    case "administration": {
      giveCode = cweOrUndefined(parent.field(5));
      // RXA-6 is a SINGLE administered amount — no max field.
      amount = buildAmount(parent.field(6), undefined, parent.field(7));
      break;
    }
  }

  if (giveCode !== undefined) out.giveCode = giveCode;
  if (amount !== undefined) out.amount = amount;

  return out as Medication;
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

/** One RXC segment → a grouped `MedicationComponent` (structural — not pharmacologically resolved). @internal */
function buildComponent(rxc: Segment): MedicationComponent {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<MedicationComponent> = {};

  const type = rxc.field(1).value;
  if (type !== "") out.type = type;

  const code = cweOrUndefined(rxc.field(2));
  if (code !== undefined) out.code = code;

  const amount = rxc.field(3).asNm().value;
  if (amount !== undefined) out.amount = amount;

  const units = cweOrUndefined(rxc.field(4));
  if (units !== undefined) out.units = units;

  return Object.freeze(out);
}

/** Freeze a Medication and its grouped child arrays at the boundary (D-01). @internal */
function finalize(
  med: Medication,
  routes: readonly MedicationRoute[],
  components: readonly MedicationComponent[],
): Medication {
  const out = med as { -readonly [K in keyof Medication]: Medication[K] };
  out.routes = Object.freeze(routes.slice());
  out.components = Object.freeze(components.slice());
  return Object.freeze(out);
}

/**
 * Every RXO/RXE/RXD/RXA as a typed `Medication`, with RXR (route) and RXC
 * (component) segments grouped positionally under the preceding RX* parent
 * (Phase D, P0 safety). Document order. Returns `[]` when no RX* parent is
 * present. NOT memoized — each call re-walks `msg.allSegments()`. Never throws
 * (HELPERS-07).
 *
 * The give code carries its own coding-system provenance
 * (`giveCode.nameOfCodingSystem`). The give *amount* and the give *strength*
 * are surfaced as separate fields and are never reconciled — a strength a
 * coded drug implies is never used to validate or overwrite the explicit
 * RXE-25/26 strength (Phase D §4).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const med of msg.medications()) {
 *   console.log(med.context, med.giveCode?.identifier, med.giveCode?.nameOfCodingSystem);
 *   console.log(med.amount?.minimum, med.amount?.units?.identifier);
 *   for (const r of med.routes) console.log(r.route?.identifier);
 * }
 * ```
 *
 * @internal
 */
export function medications(msg: Hl7Message): readonly Medication[] {
  const out: Medication[] = [];

  let current: Medication | undefined;
  let routes: MedicationRoute[] = [];
  let components: MedicationComponent[] = [];

  const closeCurrent = (): void => {
    if (current !== undefined) {
      out.push(finalize(current, routes, components));
    }
  };

  for (const seg of msg.allSegments()) {
    const context = PARENT_CONTEXT[seg.type];
    if (context !== undefined) {
      // Close the previous medication group, then open a new one.
      closeCurrent();
      current = buildFromParent(seg, context);
      routes = [];
      components = [];
      continue;
    }
    if (current === undefined) continue; // RXR/RXC before any RX* parent — dropped.
    if (seg.type === "RXR") {
      routes.push(buildRoute(seg));
    } else if (seg.type === "RXC") {
      components.push(buildComponent(seg));
    }
  }

  // Finalize the trailing medication group.
  closeCurrent();

  return Object.freeze(out);
}
