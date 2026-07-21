/**
 * Shared field/segment assembly primitives for the typed builders
 * (`buildAdt`/`buildOru` — roadmap Phase T). Centralises the MSH synthesis and
 * the sparse positional-segment assembly so each builder stays declarative and
 * every builder emits an identical, spec-clean MSH.
 *
 * Zero runtime deps — pure functions over the raw positional tree.
 */

import { generateControlId } from "./control-id.js";
import { formatHl7Timestamp } from "./format-timestamp.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";

/**
 * The MSH envelope shared by every typed builder — the addressing + control
 * metadata that is independent of the message body. Mirrors `BuildMessageInit`
 * minus `type` (each builder derives MSH-9 from its own trigger).
 */
export interface MessageEnvelope {
  readonly sendingApp?: string;
  readonly sendingFacility?: string;
  readonly receivingApp?: string;
  readonly receivingFacility?: string;
  /** Auto-generated via `generateControlId()` when omitted. */
  readonly controlId?: string;
  /**
   * `Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
   * passes through verbatim. Defaults to `new Date()`.
   */
  readonly timestamp?: Date | string;
  /** Defaults to `"2.5"`. */
  readonly version?: string;
  /** Defaults to `"P"` (production). */
  readonly processingId?: string;
}

/**
 * A single plain-string field. Empty string → absent field (the HL7 wire
 * semantic: empty and omitted are indistinguishable between delimiters).
 * @internal
 */
export function scalarField(value: string | undefined): RawField {
  if (value === undefined || value === "") return { repetitions: [], isNull: false };
  return { repetitions: [{ components: [{ subcomponents: [value] }] }], isNull: false };
}

/**
 * An absent field (no content, not null).
 * @internal
 */
export function absentField(): RawField {
  return { repetitions: [], isNull: false };
}

/**
 * MSH-9 composite from a `^`-delimited type string (e.g. `"ADT^A01"`).
 * @internal
 */
export function typeField(typeString: string): RawField {
  const components = typeString.split("^").map((p) => ({ subcomponents: [p] }));
  return { repetitions: [{ components }], isNull: false };
}

/** Resolve an envelope timestamp: `Date` → formatted, string → verbatim, omitted → now. */
function resolveTimestamp(ts: Date | string | undefined): string {
  if (ts === undefined) return formatHl7Timestamp(new Date());
  if (typeof ts === "string") return ts;
  return formatHl7Timestamp(ts);
}

/**
 * Synthesise the MSH `RawSegment` (fields[0..11]) for a typed builder from an
 * {@link MessageEnvelope} and a `^`-delimited MSH-9 type string. Encoding
 * characters are always the HL7 default set; control id / timestamp default
 * exactly as `buildMessage` does, so the three builders emit identical MSH
 * shapes.
 * @internal
 */
export function buildMshSegment(type: string, envelope: MessageEnvelope): RawSegment {
  const enc = DEFAULT_ENCODING_CHARACTERS;
  const fields: RawField[] = [
    scalarField(enc.field), // fields[0] MSH-1 field separator placeholder
    scalarField(
      enc.component + enc.repetition + enc.escape + enc.subcomponent + (enc.truncation ?? ""),
    ), // MSH-2 encoding characters
    scalarField(envelope.sendingApp), // MSH-3
    scalarField(envelope.sendingFacility), // MSH-4
    scalarField(envelope.receivingApp), // MSH-5
    scalarField(envelope.receivingFacility), // MSH-6
    scalarField(resolveTimestamp(envelope.timestamp)), // MSH-7
    absentField(), // MSH-8
    typeField(type), // MSH-9
    scalarField(envelope.controlId ?? generateControlId()), // MSH-10
    scalarField(envelope.processingId ?? "P"), // MSH-11
    scalarField(envelope.version ?? "2.5"), // MSH-12
  ];
  return { name: "MSH", fields };
}

/**
 * Assemble a non-MSH `RawSegment` from a sparse 1-indexed field map. Gaps
 * between populated positions become absent fields, so a caller can set (say)
 * PID-3, PID-5, and PID-7 without hand-listing the empty positions in between.
 * `fields[0]` (the name placeholder) is synthesised. An entry whose value is
 * `undefined` is skipped (treated as absent).
 * @internal
 */
export function assembleSegment(
  name: string,
  positions: ReadonlyMap<number, RawField | undefined>,
): RawSegment {
  let max = 0;
  for (const [pos, field] of positions) {
    if (field !== undefined && pos > max) max = pos;
  }
  const fields: RawField[] = [absentField()]; // fields[0] name placeholder
  for (let i = 1; i <= max; i++) {
    fields.push(positions.get(i) ?? absentField());
  }
  return { name, fields };
}
