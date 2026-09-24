/**
 * `allergies`: one entry per AL1 and per IAM segment, in one pass in document
 * order. Each entry names the segment it was read from (`source`).
 *
 * Design decisions enforced here:
 *   - D-01: `Object.freeze` applied to each entry and to the outer array.
 *   - D-05: returns `[]` when neither AL1 nor IAM is present.
 *   - D-06: NOT memoized: each call re-walks `msg.allSegments()`.
 *   - `onsetDate` is the fidelity `TS` (precision + timezone preserved).
 *   - D-22: never throws: empty / malformed fields surface as omitted keys.
 *
 * Lean field set (callers wanting more can drop to `msg.segments("AL1")` /
 * `msg.segments("IAM")`):
 *   - `type`      ← AL1-2 / IAM-2 component 1 (Table 0127: "DA"/"FA"/"EA"/...)
 *   - `code`      ← AL1-3 / IAM-3 (CWE)
 *   - `severity`  ← AL1-4 / IAM-4 component 1 (Table 0128: "SV"/"MO"/"MI")
 *   - `reaction`  ← AL1-5 / IAM-5 (first repetition)
 *   - `onsetDate` ← AL1-6 (TS/DT → fidelity `TS`); IAM onset (IAM-11) is not read
 *   - `actionCode`       ← IAM-6 component 1, verbatim (Table 0206)
 *   - `deleteRequested`  ← `true` iff IAM-6 component 1 is exactly "D"
 *   - `uniqueIdentifier` ← IAM-7 components 1 and 2 (EI)
 *
 * An entry reports one segment. A delete, update or snapshot action is never
 * applied to an earlier entry, an AL1 and an IAM describing the same allergen are
 * never merged, and IAM-3 never stands in for an absent IAM-7: the library holds
 * no allergy store, so any of those would be a guess about the receiver's state.
 */

import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { EncodingCharacters, RawComponent } from "../parser/types.js";
import type { Allergy, AllergySource, AllergyUniqueIdentifier } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer (D-22). @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Mutable builder view of a readonly helper shape. @internal */
type Mutable<T> = { -readonly [K in keyof T]?: T[K] };

/** An `Allergy` under construction: `source` set up front, every other key optional. @internal */
type AllergyBuilder = { source: AllergySource } & Mutable<Omit<Allergy, "source">>;

/**
 * The fields AL1 and IAM share at the same positions and in the same shapes:
 * 2 (type, component 1), 3 (code, CWE), 4 (severity, component 1) and
 * 5 (reaction, first repetition). @internal
 */
function readShared(seg: Segment, entry: AllergyBuilder): void {
  const type = stringOrUndefined(seg.field(2).value);
  if (type !== undefined) entry.type = type;

  const code = seg.field(3).asCwe();
  if (Object.keys(code).length > 0) entry.code = code;

  const severity = stringOrUndefined(seg.field(4).value);
  if (severity !== undefined) entry.severity = severity;

  const reaction = stringOrUndefined(seg.field(5).value);
  if (reaction !== undefined) entry.reaction = reaction;
}

/** `parts` with trailing empty strings dropped, joined with `separator`. @internal */
function joinTrimmed(parts: readonly string[], separator: string): string {
  let end = parts.length;
  while (end > 0 && parts[end - 1] === "") end--;
  return parts.slice(0, end).join(separator);
}

/** One component whole: every subcomponent it carries, rejoined. @internal */
function wholeComponent(component: RawComponent | undefined, enc: EncodingCharacters): string {
  return component === undefined ? "" : joinTrimmed(component.subcomponents, enc.subcomponent);
}

/**
 * IAM-6 component 1 exactly as sent, or `undefined` when IAM-6 is empty. The
 * component is read whole, and so is every repetition, rejoined with the
 * message's own separators: IAM-6 does not repeat and CNE-1 has no
 * subcomponents, so a sender's `D~A` or `D&X` is malformed, and it surfaces
 * as it arrived rather than as its first piece. The delete marker keys on the
 * whole value being exactly `D`, so a malformed code is never read as a
 * delete: an unmarked entry still shows the allergy. @internal
 */
function readActionCode(field: Field): string | undefined {
  const perRepetition = field.repetitions.map((rep) => wholeComponent(rep.components[0], field.enc));
  return stringOrUndefined(joinTrimmed(perRepetition, field.enc.repetition));
}

/** IAM-7 (EI) components 1 and 2, or `undefined` when neither was sent. @internal */
function readUniqueIdentifier(seg: Segment): AllergyUniqueIdentifier | undefined {
  const components = seg.field(7).repetitions[0]?.components;
  if (components === undefined) return undefined;
  const id: Mutable<AllergyUniqueIdentifier> = {};

  const entityIdentifier = stringOrUndefined(components[0]?.subcomponents[0] ?? "");
  if (entityIdentifier !== undefined) id.entityIdentifier = entityIdentifier;

  const namespaceId = stringOrUndefined(components[1]?.subcomponents[0] ?? "");
  if (namespaceId !== undefined) id.namespaceId = namespaceId;

  return Object.keys(id).length > 0 ? Object.freeze(id) : undefined;
}

/** Build one frozen entry from an AL1 segment. @internal */
function fromAl1(al1: Segment): Allergy {
  const entry: AllergyBuilder = { source: "AL1" };
  readShared(al1, entry);

  const onset = al1.field(6).asTs();
  if (onset.valid) entry.onsetDate = onset;

  return Object.freeze(entry);
}

/** Build one frozen entry from an IAM segment. @internal */
function fromIam(iam: Segment): Allergy {
  const entry: AllergyBuilder = { source: "IAM" };
  readShared(iam, entry);

  // IAM-6 action code: component 1 verbatim. Omitted when empty, never
  // defaulted to "A"; only an exact "D" marks the entry as a delete request.
  const actionCode = readActionCode(iam.field(6));
  if (actionCode !== undefined) {
    entry.actionCode = actionCode;
    if (actionCode === "D") entry.deleteRequested = true;
  }

  const uniqueIdentifier = readUniqueIdentifier(iam);
  if (uniqueIdentifier !== undefined) entry.uniqueIdentifier = uniqueIdentifier;

  return Object.freeze(entry);
}

/**
 * Every AL1 and IAM as an `Allergy` entry, in one pass in document order, each
 * naming the segment it was read from. D-05: returns `[]` when neither is
 * present. D-06: NOT memoized. HELPERS-07: never throws.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const al of msg.allergies()) {
 *   console.log(al.source, al.code?.identifier, al.severity, al.actionCode);
 * }
 * ```
 *
 * @internal
 */
export function allergies(msg: Hl7Message): readonly Allergy[] {
  const out: Allergy[] = [];
  for (const seg of msg.allSegments()) {
    if (seg.type === "AL1") out.push(fromAl1(seg));
    else if (seg.type === "IAM") out.push(fromIam(seg));
  }
  return Object.freeze(out);
}
