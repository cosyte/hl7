/**
 * HL7 emit primitives for the `@cosyte/hl7` serializer pipeline —
 * walks a `RawField` / `RawSegment` tree and produces spec-clean HL7 text
 * by joining repetitions, components, and subcomponents with the active
 * delimiters and re-escaping user content via `reescape`.
 *
 * Decisions honored:
 * - D-02: trailing empty components and subcomponents are stripped;
 *   `RawField.isNull === true` is preserved as the two-character literal `""`.
 * - D-04: a subcomponent with no fidelity overlay passes through
 *   `reescape(sub, enc)` — the 5 active delimiters + `\n` (via `\.br\`) + a
 *   decoded CR (via `\X0D\`) are re-escaped; other already-decoded text passes
 *   through as plain characters. A subcomponent whose parse recorded original
 *   wire bytes in `RawComponent.rawSubcomponents` (HL7-ESC — a recognize-and-
 *   preserve escape like `\H\`/`\Z..\`, or a hex escape like `\X41\`) is
 *   emitted from that overlay **verbatim**, so those families round-trip
 *   byte-for-byte instead of canonicalizing.
 * - D-06 guard: `emitSegment` throws when called with an MSH segment —
 *   MSH must be routed through `to-string.ts`'s special-case path, which
 *   inlines MSH-1 and MSH-2 instead of running them through `emitField`
 *   (running MSH-2 through `emitField` would re-escape the encoding chars
 *   and produce garbage). The throw is a deliberate deviation from D-07
 *   purity — it catches programmer misuse at the call site instead of
 *   silently corrupting wire output.
 * - D-07: pure for all non-MSH inputs — never warns, never throws.
 *
 * Not part of the public API (no re-export from `src/index.ts`). Phase 6
 * profile hooks may compose around `emitSegment` / `emitField`.
 * @internal
 */

import { reescape } from "../parser/escapes.js";
import type { EncodingCharacters, RawField, RawRepetition, RawSegment } from "../parser/types.js";

/**
 * Emit a single HL7 field as its spec-clean string fragment. Joins
 * repetitions with `enc.repetition`; each repetition renders its
 * components (joined with `enc.component`), each component renders its
 * subcomponents (joined with `enc.subcomponent`), and each subcomponent
 * runs through `reescape` (D-04).
 *
 * D-02 rules:
 * - `field.isNull === true` returns the two-character string `""` (literal
 *   quote-quote — HL7 explicit null), regardless of repetitions content.
 * - Trailing empty subcomponents inside a component are stripped.
 * - Trailing empty components inside a repetition are stripped.
 * - A field with zero repetitions renders as the empty string.
 *
 * @internal
 */
export function emitField(field: RawField, enc: EncodingCharacters): string {
  if (field.isNull) return '""';
  if (field.repetitions.length === 0) return "";
  const repStrings: string[] = [];
  for (const rep of field.repetitions) {
    repStrings.push(emitRepetition(rep, enc));
  }
  return repStrings.join(enc.repetition);
}

/** @internal */
function emitRepetition(rep: RawRepetition, enc: EncodingCharacters): string {
  const compStrings: string[] = [];
  for (const comp of rep.components) {
    const overlay = comp.rawSubcomponents;
    const subStrings: string[] = [];
    for (let i = 0; i < comp.subcomponents.length; i++) {
      // Escape-fidelity overlay (HL7-ESC): when the tokenizer recorded the
      // subcomponent's original wire bytes (a preserve-or-hex escape whose
      // decoded form does not re-escape byte-verbatim), emit them verbatim —
      // otherwise re-escape the decoded value. Delimiter escapes have no
      // overlay and take the reescape path, exactly as before.
      const raw = overlay?.[i];
      subStrings.push(raw ?? reescape(comp.subcomponents[i] ?? "", enc));
    }
    // D-02 trailing-empty strip at subcomponent level.
    while (subStrings.length > 0 && subStrings[subStrings.length - 1] === "") {
      subStrings.pop();
    }
    compStrings.push(subStrings.join(enc.subcomponent));
  }
  // D-02 trailing-empty strip at component level.
  while (compStrings.length > 0 && compStrings[compStrings.length - 1] === "") {
    compStrings.pop();
  }
  return compStrings.join(enc.component);
}

/**
 * Emit a single non-MSH HL7 segment as its spec-clean string fragment:
 * `<seg.name>` + `enc.field` + `<fields[1..N] joined by enc.field>`.
 *
 * **IMPORTANT — MSH guard:** If `seg.name === "MSH"` this function
 * THROWS. MSH requires D-06's special-case emission (MSH-1 = single
 * delimiter char, MSH-2 = 4 literal encoding chars — neither is routed
 * through `emitField`, because running MSH-2 through `emitField` would
 * re-escape the encoding chars and produce garbage output). The only
 * correct caller for MSH is `to-string.ts::emitMessage`, which inlines
 * MSH-1/MSH-2 before handing MSH-3..N off to `emitField`. This guard
 * is a deliberate deviation from D-07 "never throws" — it catches
 * programmer misuse loudly at the call site rather than silently
 * corrupting wire output.
 *
 * For non-MSH segments (PID, OBX, etc.) this function is pure: it
 * skips `fields[0]` (name placeholder) and joins `fields[1..N]` via
 * `emitField` with `enc.field` separators.
 *
 * @internal
 */
export function emitSegment(seg: RawSegment, enc: EncodingCharacters): string {
  if (seg.name === "MSH") {
    throw new Error(
      "emitSegment: MSH must be routed through to-string.ts's MSH path per D-06 " +
        "(special-case MSH-1/MSH-2 encoding-char emission). Running MSH through " +
        "emitSegment would re-escape the encoding chars and produce garbage output.",
    );
  }
  const parts: string[] = [seg.name];
  for (let i = 1; i < seg.fields.length; i++) {
    const f = seg.fields[i];
    parts.push(f === undefined ? "" : emitField(f, enc));
  }
  return parts.join(enc.field);
}
