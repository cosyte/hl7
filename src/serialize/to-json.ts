/**
 * `emitJson` + `SerializedMessage` — snapshot-stable JSON projection of an
 * `Hl7Message`. Mirrors `rawSegments` one-for-one; preserves `isNull`;
 * always includes `warnings: []`; omits `profile` when absent.
 *
 * The `SerializedMessage` interface is exported in Plan 01 (this file) so
 * consumers + `src/index.ts` can reference the type immediately. The
 * `emitJson` function body is filled in Phase 5 Plan 03 (to-json).
 *
 * Decisions:
 * - D-17: shape is a raw-tree mirror (encodingCharacters + segments +
 *   warnings + optional profile).
 * - D-18: `Hl7Message.toJSON` delegates here so `JSON.stringify(msg)` Just Works.
 * - D-19: warnings array is ALWAYS present (`warnings: []` when empty).
 * - D-20: `profile` field appears only when `msg.profile` is truthy — then
 *   contains only `name` + `lineage`.
 * - D-21: `SerializedMessage` is exported from `src/index.ts` (not nested
 *   under HL7 namespace).
 *
 * Note on runtime freeze scope: `emitJson` returns an object that is
 * boundary-frozen (top level only — `Object.isFrozen(msg.toJSON()) === true`).
 * Inner arrays are readonly at the TypeScript type level but MUTABLE at
 * runtime — consumers should treat the returned structure as immutable
 * and not mutate nested arrays. Deep-freeze is explicitly rejected per
 * D-30 (emit is hot-path; runtime deep-freeze would add cost with no
 * observable benefit given the type-level readonly contract).
 */

import type { Hl7Message } from "../model/message.js";
import type { EncodingCharacters } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";

/**
 * Snapshot-stable JSON projection of an `Hl7Message` (SER-03). Every field
 * is readonly; segment order is preserved; `isNull` flags are preserved.
 *
 * Runtime immutability: the top-level object is `Object.freeze`d
 * (boundary-frozen). Inner arrays are readonly at the TypeScript type
 * level but mutable at runtime — treat as immutable, do not mutate.
 *
 * @example
 * ```ts
 * import { parseHL7, type SerializedMessage } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * const snap: SerializedMessage = msg.toJSON();
 * console.log(snap.segments[0]?.name);        // "MSH"
 * console.log(snap.warnings.length);          // 0 when clean
 * console.log(JSON.stringify(msg) === JSON.stringify(snap)); // true
 * console.log(Object.isFrozen(snap));         // true (D-30 boundary freeze)
 * ```
 */
export interface SerializedMessage {
  readonly encodingCharacters: EncodingCharacters;
  readonly segments: ReadonlyArray<{
    readonly name: string;
    readonly fields: ReadonlyArray<{
      readonly repetitions: ReadonlyArray<{
        readonly components: ReadonlyArray<{ readonly subcomponents: readonly string[] }>;
      }>;
      readonly isNull: boolean;
    }>;
  }>;
  readonly warnings: readonly Hl7ParseWarning[];
  readonly profile?: { readonly name: string; readonly lineage: readonly string[] };
}

/**
 * Build the `SerializedMessage` snapshot from a parsed message (SER-03).
 * Raw-tree mirror per D-17; warnings array always present (D-19); profile
 * included only when `msg.profile` is truthy (D-20). Pure — never warns,
 * never throws. Not cached (D-30 — each call re-walks `rawSegments`).
 *
 * Boundary-frozen: the top-level returned object passes through
 * `Object.freeze` before return, so `Object.isFrozen(result) === true`.
 * Inner arrays are readonly at the TS type level but NOT runtime-frozen
 * (D-30 cost doctrine — emit is hot-path; deep-freeze would add traversal
 * cost with no observable benefit beyond the type contract).
 *
 * Shared Phase-2 invariant (established by Plan 02): the raw tree stores
 * DECODED subcomponent strings (tokenize now unescapes on parse). emitJson
 * mirrors those decoded strings verbatim — NO re-escape transformation is
 * applied here; the JSON projection reflects the decoded source of truth.
 *
 * @internal
 */
export function emitJson(msg: Hl7Message): SerializedMessage {
  // Raw-tree mirror (D-17). Build fresh plain objects so the output is
  // decoupled from the parser's internal arrays. `subcomponents.slice()`
  // clones the inner string array; primitives are cloned for free.
  const segments = msg.rawSegments.map((seg) => ({
    name: seg.name,
    fields: seg.fields.map((field) => ({
      // D-17 + Claude's-Discretion: `repetitions` is ALWAYS `[]` when the
      // field has zero repetitions — shape-stable, no conditional omission.
      repetitions: field.repetitions.map((rep) => ({
        components: rep.components.map((comp) => ({
          subcomponents: comp.subcomponents.slice(),
        })),
      })),
      isNull: field.isNull,
    })),
  }));

  // exactOptionalPropertyTypes-safe conditional-assign pattern. An absent
  // `profile` key is valid for the optional field; an explicit
  // `profile: undefined` is NOT. Mirrors `src/helpers/meta.ts::buildMeta`.
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<SerializedMessage> = {
    encodingCharacters: {
      field: msg.encodingCharacters.field,
      component: msg.encodingCharacters.component,
      repetition: msg.encodingCharacters.repetition,
      escape: msg.encodingCharacters.escape,
      subcomponent: msg.encodingCharacters.subcomponent,
    },
    segments,
    // D-19: ALWAYS present, even when empty. `msg.warnings` is already frozen
    // at Hl7Message construction (Phase 2) — pass-through is safe.
    warnings: msg.warnings,
  };

  if (msg.profile !== undefined) {
    // D-20 structural contract: EXACTLY `{name, lineage}`. The upstream
    // parser constructor (src/parser/index.ts) already strips any extra
    // `Profile`-descriptor fields (onWarning, customSegments, dateFormats,
    // description) before assigning to `Hl7Message.profile`. `lineage` is
    // REQUIRED (not optional) when profile is defined — straight
    // assignment; no nullish-coalesce fallback (would be dead code given
    // the type guarantee).
    out.profile = {
      name: msg.profile.name,
      lineage: msg.profile.lineage,
    };
  }

  // W5: boundary-freeze at the top level only. Inner arrays remain mutable
  // at runtime by design (D-30 — deep-freeze rejected as hot-path cost with
  // no observable benefit over the TS readonly type contract).
  return Object.freeze(out) as SerializedMessage;
}
