/**
 * `orders` — Phase 4 Plan 04 implementation of HELPERS-05. Walks the message
 * in document order and groups OBX segments positionally under their
 * preceding OBR (D-12). An ORC segment that precedes an OBR contributes its
 * ORC-1 as the order's `orderControl` (D-16); unmatched trailing ORCs are
 * dropped.
 *
 * Design decisions enforced here:
 *   - D-01: `Object.freeze` applied to each Order and to the outer array.
 *   - D-05: returns `[]` when no OBR is present.
 *   - D-06: NOT memoized — each call re-walks `msg.allSegments()`.
 *   - D-12: OBX attached positionally to the preceding OBR; pre-OBR OBX are
 *     NOT grouped here (but still surface via `msg.observations()`).
 *   - D-16: Order field contract (placerOrderNumber, fillerOrderNumber,
 *     universalServiceId, orderStatus, orderControl, orderedBy, observations).
 *   - D-18: `orderStatus` uses OBR-25 (resultStatus) for v1; Phase 7 may revisit.
 *   - D-22: never throws — malformed OBR/OBX surface as omitted keys.
 *   - D-24 (a): `orderedBy` is an XCN composite (not a flat string).
 *   - Reuses `buildObservation` from `./observations.ts` (Plan 03) — never
 *     re-implement OBX → Observation construction here.
 *
 * State-machine shape: two ORC slots.
 *   - `pendingOrc` accumulates ORCs seen since the last OBR.
 *   - `currentOrc` is the ORC attached to the currently-open OBR group.
 * When an OBR is seen, close the previous group with `currentOrc`, then
 * promote `pendingOrc` → `currentOrc` for the new group and reset
 * `pendingOrc`. A trailing ORC after the last OBR stays in `pendingOrc` and
 * is implicitly dropped (never promoted).
 */

import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CWE } from "../model/types/cwe.js";
import type { XCN } from "../model/types/xcn.js";

import { buildObservation } from "./observations.js";
import type { Observation, Order } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer (D-22). @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Build a frozen `Order` from the accumulated OBR / attached ORC / observations. @internal */
function finalizeOrder(
  obr: Segment,
  attachedOrc: Segment | undefined,
  observations: readonly Observation[],
): Order {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Order> = { observations };

  const placer = stringOrUndefined(obr.field(2).value);
  if (placer !== undefined) out.placerOrderNumber = placer;

  const filler = stringOrUndefined(obr.field(3).value);
  if (filler !== undefined) out.fillerOrderNumber = filler;

  const usvc: CWE = obr.field(4).asCwe();
  if (Object.keys(usvc).length > 0) out.universalServiceId = usvc;

  // D-16: orderStatus from OBR-25 (resultStatus) for v1; Phase 7 may revisit.
  const status = stringOrUndefined(obr.field(25).value);
  if (status !== undefined) out.orderStatus = status;

  // D-16: orderControl from the attached ORC-1 (when an ORC preceded this OBR).
  if (attachedOrc !== undefined) {
    const oc = stringOrUndefined(attachedOrc.field(1).value);
    if (oc !== undefined) out.orderControl = oc;
  }

  // D-24 (a): orderedBy is an XCN composite read from OBR-16.
  const orderedBy: XCN = obr.field(16).asXcn();
  if (Object.keys(orderedBy).length > 0) out.orderedBy = orderedBy;

  return Object.freeze(out) as Order;
}

/**
 * Every OBR as an Order with its OBX children grouped positionally (D-12).
 * OBX segments that precede any OBR are NOT attached to an order (they still
 * surface in `msg.observations()` which walks all OBX regardless). An ORC
 * segment preceding an OBR contributes its `orderControl` (ORC-1) to that
 * order; unmatched ORCs (trailing after the last OBR) are dropped.
 *
 * D-05: returns `[]` when no OBR is present. D-06: NOT memoized.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * for (const order of msg.orders()) {
 *   console.log(order.placerOrderNumber, order.observations.length);
 *   for (const obs of order.observations) console.log(obs.value);
 * }
 * ```
 *
 * @internal
 */
export function orders(msg: Hl7Message): readonly Order[] {
  const out: Order[] = [];
  let pendingOrc: Segment | undefined;  // accumulates ORCs since last OBR
  let currentObr: Segment | undefined;
  let currentOrc: Segment | undefined;  // ORC attached to the open OBR group
  let currentObservations: Observation[] = [];

  for (const seg of msg.allSegments()) {
    if (seg.type === "ORC") {
      pendingOrc = seg;
      continue;
    }
    if (seg.type === "OBR") {
      // Close previous group using THAT group's attached ORC.
      if (currentObr !== undefined) {
        out.push(
          finalizeOrder(
            currentObr,
            currentOrc,
            Object.freeze(currentObservations.slice()) as readonly Observation[],
          ),
        );
      }
      // Open new group; promote pendingOrc → currentOrc; reset pending.
      currentObr = seg;
      currentOrc = pendingOrc;
      pendingOrc = undefined;
      currentObservations = [];
      continue;
    }
    if (seg.type === "OBX" && currentObr !== undefined) {
      currentObservations.push(buildObservation(seg));
    }
  }

  // Finalize the trailing order. A trailing ORC after the last OBR stays in
  // pendingOrc and is implicitly dropped (never promoted to currentOrc).
  if (currentObr !== undefined) {
    out.push(
      finalizeOrder(
        currentObr,
        currentOrc,
        Object.freeze(currentObservations.slice()) as readonly Observation[],
      ),
    );
  }

  return Object.freeze(out) as readonly Order[];
}
