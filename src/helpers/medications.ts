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
import { buildLegacyTiming, buildTq1Timing } from "./timing.js";
import type {
  Medication,
  MedicationAmount,
  MedicationComponent,
  MedicationContext,
  MedicationRoute,
  MedicationStrength,
  OrderTiming,
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

/**
 * Build the frozen `timings` list for a medication group (Phase M). Every TQ1
 * segment grouped under the RX* parent yields one `OrderTiming`
 * (`source: "TQ1"`). When the group carries no TQ1, the **legacy embedded TQ**
 * is read from RXE-1 (an encoded RXE order) or, failing that, from the preceding
 * ORC's ORC-7 (any pharmacy order — e.g. a pre-v2.5 RXO whose timing lives in
 * ORC-7 with no OBR to surface it via `orders()`). Reading the legacy source
 * only when no TQ1 is present means the same timing is never double-counted; the
 * ORC-7 fallback means a legacy-only timing is never dropped. `orc` is the ORC
 * that opened this group (already consumed for only the first RX* of the group,
 * so an `ORC RXO RXE` group never double-surfaces the ORC-7 timing).
 * @internal
 */
function buildMedTimings(
  tq1Segs: readonly Segment[],
  parent: Segment,
  context: MedicationContext,
  orc: Segment | undefined,
): readonly OrderTiming[] {
  if (tq1Segs.length > 0) {
    return Object.freeze(tq1Segs.map((seg) => buildTq1Timing(seg)));
  }
  if (context === "encoded") {
    const legacy = buildLegacyTiming(parent.field(1)); // RXE-1 Quantity/Timing
    if (legacy !== undefined) return Object.freeze([legacy]);
  }
  if (orc !== undefined) {
    const legacy = buildLegacyTiming(orc.field(7)); // ORC-7 Quantity/Timing
    if (legacy !== undefined) return Object.freeze([legacy]);
  }
  return Object.freeze([]);
}

/** Freeze a Medication and its grouped child arrays at the boundary (D-01). @internal */
function finalize(
  med: Medication,
  parent: Segment,
  orc: Segment | undefined,
  routes: readonly MedicationRoute[],
  components: readonly MedicationComponent[],
  tq1Segs: readonly Segment[],
): Medication {
  const out = med as { -readonly [K in keyof Medication]: Medication[K] };
  out.routes = Object.freeze(routes.slice());
  out.components = Object.freeze(components.slice());
  out.timings = buildMedTimings(tq1Segs, parent, med.context, orc);
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
  let currentParent: Segment | undefined;
  let currentOrc: Segment | undefined; // ORC that opened the current group (ORC-7 legacy source)
  let pendingOrc: Segment | undefined; // ORC seen before the next RX* parent opens
  let routes: MedicationRoute[] = [];
  let components: MedicationComponent[] = [];
  let pendingTq1: Segment[] = []; // TQ1 seen before the next RX* parent opens (Phase M)
  let currentTq1: Segment[] = []; // TQ1 grouped under the open RX* parent (Phase M)
  let awaitingParent = false; // an ORC has begun a group still awaiting its RX* parent (Phase M)

  const closeCurrent = (): void => {
    if (current !== undefined && currentParent !== undefined) {
      out.push(finalize(current, currentParent, currentOrc, routes, components, currentTq1));
    }
  };

  for (const seg of msg.allSegments()) {
    const context = PARENT_CONTEXT[seg.type];
    if (context !== undefined) {
      // Close the previous medication group, then open a new one — promoting
      // any TQ1 seen since the last parent (the order group places TQ1 ahead
      // of the RXE it modifies). The preceding ORC (its ORC-7 legacy timing) is
      // consumed by only this first RX*: `pendingOrc` is cleared so a sibling
      // RX* in the same ORC group never double-surfaces the ORC-7 timing.
      closeCurrent();
      current = buildFromParent(seg, context);
      currentParent = seg;
      currentOrc = pendingOrc;
      pendingOrc = undefined;
      routes = [];
      components = [];
      currentTq1 = pendingTq1;
      pendingTq1 = [];
      awaitingParent = false;
      continue;
    }
    if (seg.type === "ORC") {
      // A new ORC starts a new order group: any following TQ1 (before that
      // group's RX* parent) belongs to the NEXT medication, and its ORC-7
      // carries the legacy timing for that group.
      pendingOrc = seg;
      awaitingParent = true;
      continue;
    }
    if (seg.type === "TQ1") {
      // A TQ1 attaches to the open medication only when no newer ORC has begun a
      // group; otherwise it modifies the next RX* parent.
      if (current !== undefined && !awaitingParent) currentTq1.push(seg);
      else pendingTq1.push(seg);
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
