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
 * import { parseHL7, type SerializedMessage } from "@cosyte/hl7-parser";
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
 * Build the `SerializedMessage` snapshot from a parsed message.
 * Implementation lives in Phase 5 Plan 03 (to-json). Stub throws.
 * @internal
 */
export function emitJson(_msg: Hl7Message): SerializedMessage {
  throw new Error(
    "emitJson: NOT IMPLEMENTED — Phase 5 Plan 03 (to-json) will fill this. " +
      "If you see this error, serialize plans are running out of order.",
  );
}
