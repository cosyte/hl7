/**
 * `nextOfKin` — Phase 4 Plan 04 implementation of HELPERS-06. One entry per
 * NK1 segment in document order.
 *
 * Design decisions enforced here:
 *   - D-01: `Object.freeze` applied to each entry and to the outer array.
 *   - D-05: returns `[]` when no NK1 present.
 *   - D-06: NOT memoized — each call re-walks `msg.segments("NK1")`.
 *   - D-22: never throws — empty / malformed fields surface as omitted keys.
 *
 * Lean v1 field set (callers wanting more can drop to `msg.segments("NK1")`):
 *   - `name`         ← NK1-2 (XPN)
 *   - `relationship` ← NK1-3 (CWE)
 *   - `address`      ← NK1-4 (XAD)
 *   - `phone`        ← NK1-5 first repetition (XTN)
 *   - `contactRole`  ← NK1-7 (CWE)
 */

import type { Hl7Message } from "../model/message.js";
import type { NextOfKin } from "./types.js";

/**
 * Every NK1 as a `NextOfKin` entry in document order. D-05: returns `[]` when
 * no NK1 is present. D-06: NOT memoized. HELPERS-07: never throws.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const nk of msg.nextOfKin()) {
 *   console.log(nk.name?.familyName, nk.relationship?.identifier);
 * }
 * ```
 *
 * @internal
 */
export function nextOfKin(msg: Hl7Message): readonly NextOfKin[] {
  const out: NextOfKin[] = [];
  for (const nk1 of msg.segments("NK1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<NextOfKin> = {};

    const name = nk1.field(2).asXpn();
    if (Object.keys(name).length > 0) entry.name = name;

    const relationship = nk1.field(3).asCwe();
    if (Object.keys(relationship).length > 0) entry.relationship = relationship;

    const address = nk1.field(4).asXad();
    if (Object.keys(address).length > 0) entry.address = address;

    const phone = nk1.field(5).asXtn();
    if (Object.keys(phone).length > 0) entry.phone = phone;

    const contactRole = nk1.field(7).asCwe();
    if (Object.keys(contactRole).length > 0) entry.contactRole = contactRole;

    out.push(Object.freeze(entry));
  }
  return Object.freeze(out);
}
