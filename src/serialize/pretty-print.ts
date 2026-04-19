/**
 * `emitPrettyPrint` — human-readable multi-line rendering of an `Hl7Message`
 * for logs and debugging (SER-04).
 *
 * Implementation lives in Phase 5 Plan 04 (pretty-print). Stub throws.
 *
 * Decisions (for Plan 04 implementer):
 * - D-22: no options — single opinionated format.
 * - D-23: segment-per-line with labeled fields `[N]=value`. Field values
 *   shown verbatim with active delimiters; empty trailing positions suppressed.
 * - D-24: resolution depth stops at field level — composite values render as
 *   their raw HL7 string (e.g. `Smith^John^Q`).
 * - D-25: first line is a metadata header
 *   `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`.
 * - D-26: pure — never warns or throws.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";
import type { RawSegment } from "../parser/types.js";
import { emitField } from "./emit-field.js";

/**
 * Emit a human-readable multi-line rendering of a parsed `Hl7Message` for
 * logs and debugging (SER-04). Single opinionated format per D-22; no
 * options. Header per D-25; segment lines per D-23; depth stops at field
 * level per D-24; pure per D-26.
 *
 * **Raw-escape rendering (W2):** field values render as their raw HL7
 * string representation, produced via `emitField`. Embedded delimiters in
 * user data appear as HL7 escape sequences — e.g. a patient family name
 * that was decoded from `\F\` on input (literal `|` in `Field.value`)
 * renders in pretty-print as `Smith\F\Jones`, NOT as `Smith|Jones`. This
 * preserves round-trip fidelity: copy-pasting the output into `parseHL7`
 * yields a structurally equivalent message. For un-escaped human display,
 * use typed accessors (e.g. `msg.patient?.familyName`), which return
 * already-decoded strings.
 *
 * @internal
 */
export function emitPrettyPrint(msg: Hl7Message): string {
  const lines: string[] = [];
  lines.push(buildHeaderLine(msg));
  for (const seg of msg.rawSegments) {
    lines.push(buildSegmentLine(seg, msg));
  }
  return lines.join("\n");
}

/**
 * D-25 header:
 *   `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`
 * Missing meta fields render as `-`. Segment count is always a number.
 * Separator between header fields is TWO spaces.
 * @internal
 */
function buildHeaderLine(msg: Hl7Message): string {
  const meta = msg.meta;
  const type = meta.type ?? "-";
  const controlId = meta.controlId ?? "-";
  const timestamp = meta.timestamp?.toISOString() ?? "-";
  const segCount = msg.rawSegments.length;
  return (
    "HL7 " +
    type +
    "  controlId=" +
    controlId +
    "  timestamp=" +
    timestamp +
    "  (" +
    String(segCount) +
    " segments)"
  );
}

/**
 * D-23 segment line:
 *   `<seg.name>  [N]=<emittedFieldValue>  [M]=<emittedFieldValue>  ...`
 * - Non-MSH: start at fields[1] with HL7 index 1.
 * - MSH: start at fields[2] with HL7 index 3 (MSH-1/MSH-2 are the
 *   delimiters themselves and are not labelled — their content is
 *   implicit in the header).
 * - Field rendered via `emitField` (D-24 depth stop + W2 raw-escape).
 * - Empty-emitted values are SUPPRESSED (no `[N]=` entry) so sparse
 *   segments stay terse. `isNull === true` emits `""` (2 chars) and IS
 *   shown.
 * - A segment with only absent fields emits just the segment name
 *   (no trailing spaces).
 * @internal
 */
function buildSegmentLine(seg: RawSegment, msg: Hl7Message): string {
  const enc = msg.encodingCharacters;
  // First data field index and first displayed HL7 field number:
  //   - MSH: fields[2] -> [3]
  //   - non-MSH: fields[1] -> [1]
  const isMsh = seg.name === "MSH";
  const firstFieldIndex = isMsh ? 2 : 1;
  const firstDisplayNumber = isMsh ? 3 : 1;

  const labeledParts: string[] = [];
  for (let i = firstFieldIndex; i < seg.fields.length; i++) {
    const f = seg.fields[i];
    if (f === undefined) continue;
    const emitted = emitField(f, enc);
    if (emitted === "") continue; // suppress absent-field labels
    const displayNumber = firstDisplayNumber + (i - firstFieldIndex);
    labeledParts.push("[" + String(displayNumber) + "]=" + emitted);
  }

  if (labeledParts.length === 0) return seg.name;
  return seg.name + "  " + labeledParts.join("  ");
}
