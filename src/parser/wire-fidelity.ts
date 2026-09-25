/**
 * Which fields of a parsed message did not arrive on the wire as the value the
 * parser stored for them. Two declared parser tolerances change a field's text
 * on the way in, and neither changes here:
 *
 *  - the MLLP strip removes every VT (`0x0B`) and FS (`0x1C`) byte from the
 *    input before segments are split (`MLLP_FRAMING_STRIPPED`), wherever the
 *    byte stood;
 *  - field trimming (on by default) removes whitespace around a field's value
 *    (`FIELD_WHITESPACE_TRIMMED`).
 *
 * This module only remembers WHICH fields those two steps touched, so a reader
 * that must know whether a field arrived as exactly its stored value can ask.
 * Parse output is unchanged: the same tree, the same values, the same warnings.
 *
 * The record is keyed by the field object itself, not by its position. A field
 * keeps its record through `addSegment` / `removeSegment`, which move positions
 * but reuse every untouched field; a field replaced through `setField` is a new
 * object with no record, because its value is then exactly what was set.
 *
 * @internal
 */

import { WARNING_CODES, type Hl7ParseWarning } from "./warnings.js";
import type { RawField, RawSegment } from "./types.js";

const VT = "\u000B";
const FS = "\u001C";

/** Fields the parser altered on the way in. A `WeakSet`, so it never holds a tree alive. */
const ALTERED_ON_THE_WIRE = new WeakSet<RawField>();

/**
 * A field position in the tokenized tree: the segment's index in the split
 * input, and the field's index in `RawSegment.fields` (which, for MSH and every
 * other segment alike, is the number of field separators before it).
 *
 * @internal
 */
export interface RawFieldPosition {
  readonly segmentIndex: number;
  readonly rawFieldIndex: number;
}

/**
 * Locate every VT or FS byte the MLLP strip will remove from INSIDE the
 * payload, as the tree position of the field it stood in. `input` is the text
 * the strip receives; `fieldSeparator` is the message's field separator, read
 * from the stripped text.
 *
 * Only an MLLP block frame is outside the payload, and only when both of its
 * ends are there: a VT as the first character (the start block) together with
 * an FS as the last character or followed only by one final CR (the end
 * block). Every other VT or FS stood inside a segment, and the field it stood
 * in did not arrive as the value stored for it.
 *
 * Segment and field positions are counted exactly as the parser counts them
 * on the stripped text: VT and FS take no part, a CR, an LF or a CR LF pair
 * ends a segment, and the field separator advances the field.
 *
 * @example
 * ```ts
 * locateInteriorFramingBytes("MSH|^~\\&|A\rOBX|1|\u000BF", "|");
 * // [{ segmentIndex: 1, rawFieldIndex: 2 }]
 * ```
 *
 * @internal
 */
export function locateInteriorFramingBytes(
  input: string,
  fieldSeparator: string,
): readonly RawFieldPosition[] {
  const endBlock = input.endsWith(FS) ? 1 : input.endsWith(FS + "\r") ? 2 : 0;
  const framed = input.startsWith(VT) && endBlock > 0;
  const start = framed ? 1 : 0;
  const end = framed ? input.length - endBlock : input.length;

  const payload = input.slice(start, end);
  if (!payload.includes(VT) && !payload.includes(FS)) return [];

  const found: RawFieldPosition[] = [];
  let segmentIndex = 0;
  let separators = 0;
  let previous = "";
  for (let i = start; i < end; i++) {
    const ch = input.charAt(i);
    if (ch === VT || ch === FS) {
      found.push({ segmentIndex, rawFieldIndex: separators });
      continue;
    }
    if (ch === "\n" && previous === "\r") {
      // The LF of a CR LF pair: one segment break, already counted at the CR.
    } else if (ch === "\r" || ch === "\n") {
      segmentIndex++;
      separators = 0;
    } else if (ch === fieldSeparator) {
      separators++;
    }
    previous = ch;
  }
  return found;
}

/**
 * Record, on the tokenized tree, every field the parser altered on the way in:
 * each field a `FIELD_WHITESPACE_TRIMMED` warning names, and each field at a
 * position {@link locateInteriorFramingBytes} returned.
 *
 * @example
 * ```ts
 * recordAlteredFields(rawSegments, warnings, locateInteriorFramingBytes(input, "|"));
 * ```
 *
 * @internal
 */
export function recordAlteredFields(
  segments: readonly RawSegment[],
  warnings: readonly Hl7ParseWarning[],
  framingBytes: readonly RawFieldPosition[],
): void {
  for (const w of warnings) {
    if (w.code !== WARNING_CODES.FIELD_WHITESPACE_TRIMMED) continue;
    const segment = segments[w.position.segmentIndex];
    const fieldIndex = w.position.fieldIndex;
    if (segment === undefined || fieldIndex === undefined) continue;
    // Warnings number MSH fields as HL7 does (MSH-3 is 3); the tree holds MSH-1 at index 0.
    mark(segment.fields[segment.name === "MSH" ? fieldIndex - 1 : fieldIndex]);
  }
  for (const { segmentIndex, rawFieldIndex } of framingBytes) {
    mark(segments[segmentIndex]?.fields[rawFieldIndex]);
  }
}

function mark(field: RawField | undefined): void {
  if (field !== undefined) ALTERED_ON_THE_WIRE.add(field);
}

/**
 * Whether the parser altered this field on the way in: trimmed whitespace off
 * it, or removed a VT or FS byte from inside it. `false` for every field the
 * parser did not produce (built, set or added by a caller).
 *
 * @example
 * ```ts
 * const obx = parseHL7(raw).segments("OBX")[0];
 * if (obx !== undefined) fieldArrivedAltered(obx.field(11).raw); // true for OBX-11 " F"
 * ```
 *
 * @internal
 */
export function fieldArrivedAltered(field: RawField): boolean {
  return ALTERED_ON_THE_WIRE.has(field);
}
