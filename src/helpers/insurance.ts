/**
 * `insurance` — Phase 4 Plan 04 implementation of HELPERS-06. One entry per
 * IN1 segment in document order, with positional IN2/IN3 presence flags
 * (`hasIn2` / `hasIn3`). Callers who need the full IN2/IN3 surface can drop
 * to `msg.segments("IN2")[i]` / `msg.segments("IN3")[i]` — the positional
 * index aligns with the IN1 index since we walk `msg.allSegments()` in
 * document order.
 *
 * Design decisions enforced here:
 *   - D-01: `Object.freeze` applied to each entry and to the outer array.
 *   - D-05: returns `[]` when no IN1 present.
 *   - D-06: NOT memoized — each call re-walks `msg.allSegments()`.
 *   - D-18: `effectiveDate` / `expirationDate` are flat `Date | undefined`.
 *   - D-22: never throws — empty / malformed fields surface as omitted keys.
 *
 * Lean v1 field set (callers wanting more can drop to `msg.segments("IN1")`):
 *   - `planId`         ← IN1-2  (CWE)
 *   - `companyId`      ← IN1-3  (CX — first repetition)
 *   - `companyName`    ← IN1-4  (XON first component flattened to string)
 *   - `groupNumber`    ← IN1-8  (string)
 *   - `effectiveDate`  ← IN1-12 (TS/DT → flat Date, D-18)
 *   - `expirationDate` ← IN1-13 (TS/DT → flat Date, D-18)
 *   - `insuredName`    ← IN1-16 (XPN)
 *   - `policyNumber`   ← IN1-36 (string)
 *   - `hasIn2`/`hasIn3` ← positional IN2/IN3 presence booleans
 *
 * State-machine shape (single IN1 slot): open on IN1; attach any intervening
 * IN2/IN3 to flags; close and finalize when the next IN1 is seen or the walk
 * ends. IN2/IN3 appearing before any IN1 are ignored.
 */

import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { Insurance } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer (D-22). @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Build a frozen `Insurance` from an IN1 segment + positional IN2/IN3 flags. @internal */
function finalizeInsurance(in1: Segment, hasIn2: boolean, hasIn3: boolean): Insurance {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const entry: Mutable<Insurance> = { hasIn2, hasIn3 };

  const planId = in1.field(2).asCwe();
  if (Object.keys(planId).length > 0) entry.planId = planId;

  const companyId = in1.field(3).asCx();
  if (Object.keys(companyId).length > 0) entry.companyId = companyId;

  const companyName = stringOrUndefined(in1.field(4).value);
  if (companyName !== undefined) entry.companyName = companyName;

  const groupNumber = stringOrUndefined(in1.field(8).value);
  if (groupNumber !== undefined) entry.groupNumber = groupNumber;

  const effective = in1.field(12).asTs();
  if (effective.date !== undefined) entry.effectiveDate = effective.date;

  const expiration = in1.field(13).asTs();
  if (expiration.date !== undefined) entry.expirationDate = expiration.date;

  const insuredName = in1.field(16).asXpn();
  if (Object.keys(insuredName).length > 0) entry.insuredName = insuredName;

  const policyNumber = stringOrUndefined(in1.field(36).value);
  if (policyNumber !== undefined) entry.policyNumber = policyNumber;

  return Object.freeze(entry) as Insurance;
}

/**
 * Every IN1 as an `Insurance` entry in document order with positional
 * IN2/IN3 flags. `hasIn2` / `hasIn3` become `true` when an IN2 / IN3 appears
 * between this IN1 and the next IN1 (or end of message). D-05: returns `[]`
 * when no IN1 present. D-06: NOT memoized. HELPERS-07: never throws.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const ins of msg.insurance()) {
 *   console.log(ins.companyName, ins.policyNumber, ins.hasIn2);
 * }
 * ```
 *
 * @internal
 */
export function insurance(msg: Hl7Message): readonly Insurance[] {
  const out: Insurance[] = [];
  let currentIn1: Segment | undefined;
  let currentHasIn2 = false;
  let currentHasIn3 = false;

  for (const seg of msg.allSegments()) {
    if (seg.type === "IN1") {
      // Close previous group.
      if (currentIn1 !== undefined) {
        out.push(finalizeInsurance(currentIn1, currentHasIn2, currentHasIn3));
      }
      currentIn1 = seg;
      currentHasIn2 = false;
      currentHasIn3 = false;
      continue;
    }
    if (seg.type === "IN2" && currentIn1 !== undefined) {
      currentHasIn2 = true;
      continue;
    }
    if (seg.type === "IN3" && currentIn1 !== undefined) {
      currentHasIn3 = true;
      continue;
    }
  }

  // Finalize the trailing IN1 group.
  if (currentIn1 !== undefined) {
    out.push(finalizeInsurance(currentIn1, currentHasIn2, currentHasIn3));
  }

  return Object.freeze(out) as readonly Insurance[];
}
