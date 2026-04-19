/**
 * `emitMessage` — top-level HL7 string emitter. Composes `emitSegment` from
 * `./emit-field.ts`, special-cases MSH-1 / MSH-2 per D-06, and joins segments
 * with strict CR (`\r`) per D-05.
 *
 * Implementation lives in Phase 5 Plan 02 (to-string-and-round-trip). This
 * stub exists so Plan 01 can wire the `Hl7Message.toString` instance method
 * before Plan 02 runs; invoking it throws.
 *
 * Decisions (for Plan 02 implementer):
 * - D-01: walk `msg.rawSegments` verbatim.
 * - D-04: every field string passes through `emitField` (which calls
 *   `reescape` internally).
 * - D-05: segments joined by `\r`; trailing `\r` after the last segment.
 * - D-06: MSH-1 / MSH-2 inlined (see CONTEXT §specifics emission trace).
 * - D-07: pure — never warns, never throws.
 * - D-08: no MLLP wrapping.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";
import { emitField, emitSegment } from "./emit-field.js";
import type { EncodingCharacters, RawSegment } from "../parser/types.js";

/**
 * Emit a parsed `Hl7Message` as spec-clean HL7 (SER-01 + SER-05). Walks
 * `msg.rawSegments` verbatim (D-01). Inlines MSH-1 and MSH-2 from
 * `msg.encodingCharacters` per D-06. Joins segments with strict CR (`\r`)
 * and appends a trailing CR per D-05. Does NOT wrap in MLLP framing (D-08).
 *
 * Trailing-empty semantics: D-02's trailing-empty strip is field-SCOPED
 * (inside `emitField` — trailing empty repetitions/components/subcomponents
 * are stripped). At the SEGMENT level (inside `emitSegment`) trailing empty
 * fields are PRESERVED to maintain HL7 positional addressing. `emitMessage`
 * does not alter either behavior.
 *
 * Pure for all well-formed inputs — never warns on structurally valid
 * messages (D-07). Throws a typed `Error` ONLY for the structurally
 * invalid case of `msg.rawSegments.length === 0` (W1 fix): emitting a
 * bare `"\r"` for a zero-segment message would violate the "serializer
 * is conservative (always emits spec-clean HL7)" guardrail, since
 * `parseHL7("\r")` fails with `NO_MSH_SEGMENT`. The throw mirrors the
 * D-06 MSH guard in `emitSegment` — catch programmer misuse loudly at
 * the call site rather than silently corrupting wire output. The parser
 * cannot produce an empty `rawSegments`, so this path is only reachable
 * via direct `new Hl7Message({ segments: [] })` construction or post-
 * `removeSegment` edge cases.
 *
 * @internal
 */
export function emitMessage(msg: Hl7Message): string {
  if (msg.rawSegments.length === 0) {
    throw new Error(
      "emitMessage: refusing to emit a message with zero segments. " +
        "Every HL7 message must contain at least an MSH segment per HL7 v2 spec.",
    );
  }
  const enc = msg.encodingCharacters;
  const segmentStrings: string[] = [];
  for (const seg of msg.rawSegments) {
    if (seg.name === "MSH") {
      segmentStrings.push(emitMshSegment(seg, enc));
    } else {
      segmentStrings.push(emitSegment(seg, enc));
    }
  }
  return segmentStrings.join("\r") + "\r";
}

/**
 * Emit the MSH segment with the D-06 special case: MSH-1 is `enc.field`
 * (one char, inlined immediately after "MSH"), MSH-2 is
 * `enc.component + enc.repetition + enc.escape + enc.subcomponent`
 * (4 chars, fixed order), and MSH-3..N use the normal `emitField` path
 * joined by `enc.field`.
 *
 * This is the exact inverse of Phase 2 `readDelimiters`:
 *  - `readDelimiters` reads `firstSegment.charAt(3)` as the field separator
 *    and `firstSegment.slice(4, 8)` as MSH-2;
 *  - `emitMshSegment` writes `"MSH" + enc.field + <MSH-2 chars> + enc.field + <rest>`.
 *
 * Trailing empty fields in MSH-3..N are PRESERVED (W3) — no trimming of
 * the `tailParts` array before joining.
 *
 * **IMPORTANT — `seg.fields[0]` and `seg.fields[1]` content is IGNORED**
 * (WR-02): MSH-1 and MSH-2 are emitted from `msg.encodingCharacters` per
 * D-06, which is the single source of truth. This is a deliberate
 * deviation from the general D-01 "walk `msg.rawSegments` verbatim"
 * doctrine, because running MSH-2 through `emitField` would re-escape
 * the encoding chars and produce garbage. For parser-produced messages
 * `fields[0]` / `fields[1]` always match `encodingCharacters`. For
 * synthetic messages constructed via `new Hl7Message({...})` directly,
 * the burden is on the caller to keep `encodingCharacters` aligned with
 * the raw tree's MSH-1/MSH-2 placeholders — if they diverge, this
 * emitter silently favors `encodingCharacters`.
 *
 * @internal
 */
function emitMshSegment(seg: RawSegment, enc: EncodingCharacters): string {
  // MSH-2 literal chars (D-06 fixed order).
  const msh2 = enc.component + enc.repetition + enc.escape + enc.subcomponent;
  // MSH-3..N: fields[2..N] via emitField, joined by enc.field.
  // W3: trailing empty fields preserved — do NOT pop trailing "" off tailParts.
  const tailParts: string[] = [];
  for (let i = 2; i < seg.fields.length; i++) {
    const f = seg.fields[i];
    tailParts.push(f === undefined ? "" : emitField(f, enc));
  }
  const tail = tailParts.join(enc.field);
  // D-06 exact emission trace:
  // "MSH" + enc.field + enc.component + enc.repetition + enc.escape +
  //   enc.subcomponent + enc.field + <tail>
  //   = "MSH" + enc.field + msh2 + enc.field + tail
  return "MSH" + enc.field + msh2 + enc.field + tail;
}
