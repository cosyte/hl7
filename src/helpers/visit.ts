/**
 * `buildVisit` — Phase 4 Plan 03 (visit-and-observations) implementation of
 * HELPERS-03. Reads the first PV1 segment (if any) and projects the 7 locked
 * v1 fields as a deeply frozen `Visit` object, composing on Phase 3's public
 * read surface (`msg.segments("PV1")[0].field(n).asXxx()`).
 *
 * Design decisions enforced here:
 *   - D-04 nullable: returns `undefined` when no PV1 segment is present.
 *   - D-18 flat Date: admit/discharge timestamps are `Date | undefined`,
 *     never `{ raw, date }`.
 *   - D-24 option (a): attendingDoctor/referringDoctor use the Plan 01
 *     `Field.asXcn()` coercion (composite, not flat string).
 *   - D-01 freeze at boundary: the returned Visit is frozen.
 *   - D-22 never-throws: every field reaches a safe default when absent or
 *     malformed (empty strings and empty composites are omitted via
 *     `exactOptionalPropertyTypes`).
 *   - D-02 memoization is handled by the `Hl7Message.visit` getter — this
 *     function is invoked lazily on first access and its result is cached.
 */

import type { Hl7Message } from "../model/message.js";
import type { PL } from "../model/types/pl.js";
import type { XCN } from "../model/types/xcn.js";
import type { Visit } from "./types.js";

/** Return `undefined` when an empty-composite parse (`{}`) leaks through. @internal */
function nonEmptyPl(pl: PL): PL | undefined {
  return Object.keys(pl).length === 0 ? undefined : pl;
}

/** Return `undefined` when an empty-composite XCN parse (`{}`) leaks through. @internal */
function nonEmptyXcn(xcn: XCN): XCN | undefined {
  return Object.keys(xcn).length === 0 ? undefined : xcn;
}

/**
 * Build the immutable `Visit` view for a parsed message, or `undefined`
 * when no PV1 segment exists (HELPERS-03 nullable). Memoized by
 * `Hl7Message.visit` (D-02); mutations drop the cache wholesale via
 * `invalidateCaches()`.
 *
 * Doctors (attendingDoctor/referringDoctor) are XCN composites per D-24
 * option (a). admitDateTime/dischargeDateTime are flat `Date | undefined`
 * per D-18.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * console.log(msg.visit?.patientClass);                 // "I"
 * console.log(msg.visit?.location?.pointOfCare);        // "ICU"
 * console.log(msg.visit?.admitDateTime?.toISOString()); // flat Date per D-18
 * console.log(msg.visit?.attendingDoctor?.familyName);  // XCN via D-24(a)
 * ```
 *
 * @internal
 */
export function buildVisit(msg: Hl7Message): Visit | undefined {
  const pv1 = msg.segments("PV1")[0];
  if (pv1 === undefined) return undefined; // HELPERS-03 nullable

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Visit> = {};

  // PV1-2: patientClass (flat string)
  const patientClass = pv1.field(2).value;
  if (patientClass !== "") out.patientClass = patientClass;

  // PV1-3: location (PL)
  const location = nonEmptyPl(pv1.field(3).asPl());
  if (location !== undefined) out.location = location;

  // PV1-7: attendingDoctor (XCN — D-24 option (a))
  const attending = nonEmptyXcn(pv1.field(7).asXcn());
  if (attending !== undefined) out.attendingDoctor = attending;

  // PV1-8: referringDoctor (XCN)
  const referring = nonEmptyXcn(pv1.field(8).asXcn());
  if (referring !== undefined) out.referringDoctor = referring;

  // PV1-19: visitNumber. Spec-wise PV1-19 is a CX — the lean v1 shape surfaces
  // the first component (idNumber) via `.value`. Callers needing the full CX
  // can reach msg.segments("PV1")[0].field(19).asCx().
  const visitNumber = pv1.field(19).value;
  if (visitNumber !== "") out.visitNumber = visitNumber;

  // PV1-44: admitDateTime (flat Date per D-18)
  const admit = pv1.field(44).asTs();
  if (admit.date !== undefined) out.admitDateTime = admit.date;

  // PV1-45: dischargeDateTime (flat Date per D-18)
  const discharge = pv1.field(45).asTs();
  if (discharge.date !== undefined) out.dischargeDateTime = discharge.date;

  return Object.freeze(out) as Visit;
}
