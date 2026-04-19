/**
 * `diagnoses` — Phase 4 Plan 04 implementation of HELPERS-06. One entry per
 * DG1 segment in document order.
 *
 * Design decisions enforced here:
 *   - D-01: `Object.freeze` applied to each entry and to the outer array.
 *   - D-05: returns `[]` when no DG1 present.
 *   - D-06: NOT memoized — each call re-walks `msg.segments("DG1")`.
 *   - D-18: `dateTime` is a flat `Date | undefined`, not a `{ raw, date }` composite.
 *   - D-22: never throws — empty / malformed fields surface as omitted keys.
 *
 * Lean v1 field set (callers wanting more can drop to `msg.segments("DG1")`):
 *   - `code`        ← DG1-3 (CWE)
 *   - `description` ← DG1-4 (ST)
 *   - `dateTime`    ← DG1-5 (TS/DT → flat Date, D-18)
 *   - `type`        ← DG1-6 (IS — "A"=admit, "W"=working, "F"=final)
 */

import type { Hl7Message } from "../model/message.js";
import type { Diagnosis } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer (D-22). @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/**
 * Every DG1 as a `Diagnosis` entry in document order. D-05: returns `[]` when
 * no DG1 is present. D-06: NOT memoized. HELPERS-07: never throws.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * for (const dg of msg.diagnoses()) {
 *   console.log(dg.code?.identifier, dg.description, dg.type);
 * }
 * ```
 *
 * @internal
 */
export function diagnoses(msg: Hl7Message): readonly Diagnosis[] {
  const out: Diagnosis[] = [];
  for (const dg1 of msg.segments("DG1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<Diagnosis> = {};

    const code = dg1.field(3).asCwe();
    if (Object.keys(code).length > 0) entry.code = code;

    const description = stringOrUndefined(dg1.field(4).value);
    if (description !== undefined) entry.description = description;

    const dt = dg1.field(5).asTs();
    if (dt.date !== undefined) entry.dateTime = dt.date;

    const type = stringOrUndefined(dg1.field(6).value);
    if (type !== undefined) entry.type = type;

    out.push(Object.freeze(entry) as Diagnosis);
  }
  return Object.freeze(out) as readonly Diagnosis[];
}
