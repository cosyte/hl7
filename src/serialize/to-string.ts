/**
 * `emitMessage`: top-level HL7 string emitter. Composes `emitSegment` from
 * `./emit-field.ts`, special-cases MSH-1 / MSH-2, and joins segments
 * with strict CR (`\r`).
 *
 * Decisions:
 * - Walk `msg.rawSegments` verbatim, or the list a lazy message holds: a segment of it not built
 *   yet whose text writes back as itself is written as that text, without building it.
 * - Every field string passes through `emitField` (which calls
 *   `reescape` internally).
 * - Segments joined by `\r`; trailing `\r` after the last segment.
 * - MSH-1 / MSH-2 inlined (see `emitMshSegment` below).
 * - Pure: never warns, never throws.
 * - No MLLP wrapping.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";
import { PendingSegment } from "../parser/segment-source.js";
import { emitField, emitSegment } from "./emit-field.js";
import type { EncodingCharacters, RawSegment } from "../parser/types.js";

/**
 * Emit a parsed `Hl7Message` as spec-clean HL7. Walks
 * `msg.rawSegments` verbatim. Inlines MSH-1 and MSH-2 from
 * `msg.encodingCharacters`. Joins segments with strict CR (`\r`)
 * and appends a trailing CR. Does NOT wrap in MLLP framing.
 *
 * Trailing-empty semantics: the trailing-empty strip is field-SCOPED
 * (inside `emitField`: trailing empty repetitions/components/subcomponents
 * are stripped). At the SEGMENT level (inside `emitSegment`) trailing empty
 * fields are PRESERVED to maintain HL7 positional addressing. `emitMessage`
 * does not alter either behavior.
 *
 * Pure for all well-formed inputs: never warns on structurally valid
 * messages. Throws a typed `Error` ONLY for the structurally
 * invalid case of `msg.rawSegments.length === 0`: emitting a
 * bare `"\r"` for a zero-segment message would violate the "serializer
 * is conservative (always emits spec-clean HL7)" guardrail, since
 * `parseHL7("\r")` fails with `NO_MSH_SEGMENT`. The throw mirrors the
 * MSH guard in `emitSegment`: catch programmer misuse loudly at
 * the call site rather than silently corrupting wire output. The parser
 * cannot produce an empty `rawSegments`, so this path is only reachable
 * via direct `new Hl7Message({ segments: [] })` construction or post-
 * `removeSegment` edge cases.
 *
 * `segments` is the list to write, `msg.rawSegments` by default. A lazily
 * parsed message hands its own list, pending entries included, so a
 * segment nothing has read is written from its text when that text is
 * exactly what its tree would write (`PendingSegment.textAsWritten`), and
 * built and written from its tree otherwise. Either way the text is the
 * same; writing from the text skips building a tree only to write it out.
 *
 * @internal
 */
export function emitMessage(
  msg: Hl7Message,
  segments: readonly RawSegment[] = msg.rawSegments,
): string {
  if (segments.length === 0) {
    throw new Error(
      "emitMessage: refusing to emit a message with zero segments. " +
        "Every HL7 message must contain at least an MSH segment per HL7 v2 spec.",
    );
  }
  const enc = msg.encodingCharacters;
  const segmentStrings: string[] = [];
  for (const entry of segments) {
    let seg = entry;
    if (entry instanceof PendingSegment) {
      const text = entry.textAsWritten(enc);
      if (text !== undefined) {
        segmentStrings.push(text);
        continue;
      }
      seg = entry.resolve();
    }
    if (seg.name === "MSH") {
      segmentStrings.push(emitMshSegment(seg, enc));
    } else {
      segmentStrings.push(emitSegment(seg, enc));
    }
  }
  return segmentStrings.join("\r") + "\r";
}

/**
 * Emit the MSH segment with its special case: MSH-1 is `enc.field`
 * (one char, inlined immediately after "MSH"), MSH-2 is
 * `enc.component + enc.repetition + enc.escape + enc.subcomponent`
 * (4 chars, fixed order), and MSH-3..N use the normal `emitField` path
 * joined by `enc.field`.
 *
 * This is the exact inverse of the parser's `readDelimiters`:
 *  - `readDelimiters` reads `firstSegment.charAt(3)` as the field separator
 *    and `firstSegment.slice(4, 8)` as MSH-2;
 *  - `emitMshSegment` writes `"MSH" + enc.field + <MSH-2 chars> + enc.field + <rest>`.
 *
 * Trailing empty fields in MSH-3..N are PRESERVED: each field is written
 * after its separator, an empty one included.
 *
 * **IMPORTANT: `seg.fields[0]` and `seg.fields[1]` content is IGNORED**:
 * MSH-1 and MSH-2 are emitted from `msg.encodingCharacters`, which is the
 * single source of truth. This is a deliberate
 * deviation from the general "walk `msg.rawSegments` verbatim"
 * doctrine, because running MSH-2 through `emitField` would re-escape
 * the encoding chars and produce garbage. For parser-produced messages
 * `fields[0]` / `fields[1]` always match `encodingCharacters`. For
 * synthetic messages constructed via `new Hl7Message({...})` directly,
 * the burden is on the caller to keep `encodingCharacters` aligned with
 * the raw tree's MSH-1/MSH-2 placeholders: if they diverge, this
 * emitter silently favors `encodingCharacters`.
 *
 * @internal
 */
function emitMshSegment(seg: RawSegment, enc: EncodingCharacters): string {
  // MSH-2 literal chars (D-06 fixed order). When the parsed encoding carried
  // a v2.7+ truncation char (5-char MSH-2), emit it in the 5th position so
  // the wire form round-trips byte-exact.
  const msh2 =
    enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? "");
  // MSH-3..N: fields[2..N] via emitField, joined by enc.field. Trailing empty fields are kept:
  // each is written after its separator.
  let tail = "";
  for (let i = 2; i < seg.fields.length; i++) {
    if (i > 2) tail += enc.field;
    const f = seg.fields[i];
    tail += f === undefined ? "" : emitField(f, enc);
  }
  // D-06 exact emission trace:
  // "MSH" + enc.field + enc.component + enc.repetition + enc.escape +
  //   enc.subcomponent + enc.field + <tail>
  //   = "MSH" + enc.field + msh2 + enc.field + tail
  return "MSH" + enc.field + msh2 + enc.field + tail;
}
