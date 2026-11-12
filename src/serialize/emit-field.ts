/**
 * HL7 emit primitives for the `@cosyte/hl7` serializer pipeline,
 * walks a `RawField` / `RawSegment` tree and produces spec-clean HL7 text
 * by joining repetitions, components, and subcomponents with the active
 * delimiters and re-escaping user content via `reescape`.
 *
 * Decisions honored:
 * - Trailing empty components and subcomponents are stripped;
 *   `RawField.isNull === true` is preserved as the two-character literal `""`.
 * - A subcomponent with no fidelity overlay passes through
 *   `reescape(sub, enc)`: the 5 active delimiters + `\n` (via `\.br\`) + a
 *   decoded CR (via `\X0D\`) are re-escaped; other already-decoded text passes
 *   through as plain characters. A subcomponent whose parse recorded original
 *   wire bytes in `RawComponent.rawSubcomponents` (a recognize-and-
 *   preserve escape like `\H\`/`\Z..\`, or a hex escape like `\X41\`) is
 *   emitted from that overlay **verbatim**, so those families round-trip
 *   byte-for-byte instead of canonicalizing.
 * - MSH guard: `emitSegment` throws when called with an MSH segment,
 *   MSH must be routed through `to-string.ts`'s special-case path, which
 *   inlines MSH-1 and MSH-2 instead of running them through `emitField`
 *   (running MSH-2 through `emitField` would re-escape the encoding chars
 *   and produce garbage). The throw is a deliberate deviation from
 *   purity: it catches programmer misuse at the call site instead of
 *   silently corrupting wire output.
 * - Pure for all non-MSH inputs: never warns, never throws.
 *
 * Not part of the public API (no re-export from `src/index.ts`). Profile
 * hooks may compose around `emitSegment` / `emitField`.
 * @internal
 */

import { reescape } from "../parser/escapes.js";
import type {
  EncodingCharacters,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "../parser/types.js";

/**
 * Emit a single HL7 field as its spec-clean string fragment. Joins
 * repetitions with `enc.repetition`; each repetition renders its
 * components (joined with `enc.component`), each component renders its
 * subcomponents (joined with `enc.subcomponent`), and each subcomponent
 * runs through `reescape`.
 *
 * Trailing-empty rules:
 * - `field.isNull === true` returns the two-character string `""` (literal
 *   quote-quote: HL7 explicit null), regardless of repetitions content.
 * - Trailing empty subcomponents inside a component are stripped.
 * - Trailing empty components inside a repetition are stripped.
 * - A field with zero repetitions renders as the empty string.
 *
 * @internal
 */
export function emitField(field: RawField, enc: EncodingCharacters): string {
  if (field.isNull) return '""';
  // Written by concatenation rather than collected and joined: a parsed field is most often one
  // value, and an array per repetition, component and subcomponent cost several times the bytes
  // written. Read by index, so a hole in a field built by hand reaches the emitter as `undefined`
  // and, like a `null`, emits as an empty position.
  let out = "";
  for (let r = 0; r < field.repetitions.length; r++) {
    if (r > 0) out += enc.repetition;
    out += emitRepetition(field.repetitions[r], enc);
  }
  return out;
}

/**
 * A repetition's components joined by the component separator, the empty components at its end
 * dropped with their separators: a separator is written only when a component after it writes
 * something.
 *
 * @internal
 */
function emitRepetition(rep: RawRepetition | undefined, enc: EncodingCharacters): string {
  const components = rep?.components ?? [];
  let out = "";
  let owed = 0;
  // Stryker disable next-line EqualityOperator: one past the end reads undefined, which writes nothing
  for (let c = 0; c < components.length; c++) {
    if (c > 0) owed++;
    const text = emitComponent(components[c], enc);
    if (text === "") continue;
    for (; owed > 0; owed--) out += enc.component;
    out += text;
  }
  return out;
}

/**
 * A component's subcomponents joined by the subcomponent separator, the empty subcomponents at its
 * end dropped with their separators, as `emitRepetition` drops components.
 *
 * @internal
 */
function emitComponent(comp: RawComponent | undefined, enc: EncodingCharacters): string {
  const overlay = comp?.rawSubcomponents;
  const subcomponents = comp?.subcomponents ?? [];
  let out = "";
  let owed = 0;
  // Stryker disable next-line EqualityOperator: one past the end reads undefined, which writes nothing
  for (let i = 0; i < subcomponents.length; i++) {
    if (i > 0) owed++;
    // Escape-fidelity overlay (HL7-ESC): when the tokenizer recorded the
    // subcomponent's original wire bytes (a preserve-or-hex escape whose
    // decoded form does not re-escape byte-verbatim), emit them verbatim,
    // otherwise re-escape the decoded value. Delimiter escapes have no
    // overlay and take the reescape path, exactly as before.
    const text = overlay?.[i] ?? reescape(subcomponents[i] ?? "", enc);
    if (text === "") continue;
    for (; owed > 0; owed--) out += enc.subcomponent;
    out += text;
  }
  return out;
}

/**
 * Emit a single non-MSH HL7 segment as its spec-clean string fragment:
 * `<seg.name>` + `enc.field` + `<fields[1..N] joined by enc.field>`.
 *
 * **IMPORTANT: MSH guard:** If `seg.name === "MSH"` this function
 * THROWS. MSH requires the special-case emission (MSH-1 = single
 * delimiter char, MSH-2 = 4 literal encoding chars: neither is routed
 * through `emitField`, because running MSH-2 through `emitField` would
 * re-escape the encoding chars and produce garbage output). The only
 * correct caller for MSH is `to-string.ts::emitMessage`, which inlines
 * MSH-1/MSH-2 before handing MSH-3..N off to `emitField`. This guard
 * is a deliberate deviation from "never throws": it catches
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
      "emitSegment: MSH must be routed through to-string.ts's MSH path " +
        "(special-case MSH-1/MSH-2 encoding-char emission). Running MSH through " +
        "emitSegment would re-escape the encoding chars and produce garbage output.",
    );
  }
  let region = "";
  for (let i = 1; i < seg.fields.length; i++) {
    if (i > 1) region += enc.field;
    const f = seg.fields[i];
    region += f === undefined ? "" : emitField(f, enc);
  }
  // The parser reads a segment whose field region is empty (`PV1|`) as a segment with no fields,
  // so a region that writes as nothing is written with no separator either. Otherwise a lone
  // field holding only empty components (`PV1|^`) would write as `PV1|`, which reads back as `PV1`,
  // and serializing a parsed message a second time would change its text.
  return region === "" ? seg.name : seg.name + enc.field + region;
}
