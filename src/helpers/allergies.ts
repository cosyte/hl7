/**
 * `allergies` — Phase 4 Plan 04 implementation of HELPERS-06. One entry per
 * AL1 segment in document order.
 *
 * Design decisions enforced here:
 *   - D-01: `Object.freeze` applied to each entry and to the outer array.
 *   - D-05: returns `[]` when no AL1 present.
 *   - D-06: NOT memoized — each call re-walks `msg.segments("AL1")`.
 *   - D-18: `onsetDate` is a flat `Date | undefined`, not a `{ raw, date }` composite.
 *   - D-22: never throws — empty / malformed fields surface as omitted keys.
 *
 * Lean v1 field set (callers wanting more can drop to `msg.segments("AL1")`):
 *   - `type`      ← AL1-2 (IS — "DA"/"FA"/"MA"/"EA"/...)
 *   - `code`      ← AL1-3 (CWE)
 *   - `severity`  ← AL1-4 (IS — "SV"/"MO"/"MI")
 *   - `reaction`  ← AL1-5 (string / CWE first value)
 *   - `onsetDate` ← AL1-6 (TS/DT → flat Date, D-18)
 */

import type { Hl7Message } from "../model/message.js";
import type { Allergy } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer (D-22). @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/**
 * Every AL1 as an `Allergy` entry in document order. D-05: returns `[]` when
 * no AL1 is present. D-06: NOT memoized. HELPERS-07: never throws.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const al of msg.allergies()) {
 *   console.log(al.code?.identifier, al.severity, al.onsetDate?.toISOString());
 * }
 * ```
 *
 * @internal
 */
export function allergies(msg: Hl7Message): readonly Allergy[] {
  const out: Allergy[] = [];
  for (const al1 of msg.segments("AL1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<Allergy> = {};

    const type = stringOrUndefined(al1.field(2).value);
    if (type !== undefined) entry.type = type;

    const code = al1.field(3).asCwe();
    if (Object.keys(code).length > 0) entry.code = code;

    const severity = stringOrUndefined(al1.field(4).value);
    if (severity !== undefined) entry.severity = severity;

    const reaction = stringOrUndefined(al1.field(5).value);
    if (reaction !== undefined) entry.reaction = reaction;

    const onset = al1.field(6).asTs();
    if (onset.date !== undefined) entry.onsetDate = onset.date;

    out.push(Object.freeze(entry) as Allergy);
  }
  return Object.freeze(out) as readonly Allergy[];
}
