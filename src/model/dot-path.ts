/**
 * Dot-path tokenizer and resolver for the `@cosyte/hl7` structural
 * model. Parses strings like `PID.5.1`, `OBX[2].5`, `PID.3[0].1` into a
 * discriminated-token descriptor, then resolves that descriptor against a
 * `readonly RawSegment[]` tree to produce the auto-unescaped leaf string (or
 * `undefined` on missing path). Zero runtime deps — a hand-rolled linear scan
 * (analog: `src/parser/dates.ts::matchTokenFormat`).
 *
 * Indexing conventions (locked in Phase 3 CONTEXT.md):
 * - `[N]` is ALWAYS 0-indexed — applies to segment repeats AND field repeats (D-01).
 * - Dot-numbers are ALWAYS 1-indexed — matches HL7 spec and Phase 2's 1-indexed
 *   `RawSegment.fields` (D-02). `PID.5` → `fields[5]`.
 * - MSH.1 / MSH.2 are the separator char and encoding-chars string, both
 *   stored at `fields[0]` / `fields[1]` by Phase 2 tokenize.ts (D-05).
 * - Missing subcomponent on a single-sub component returns the component
 *   string (depth-collapse, D-04).
 * - Every leaf read passes through `unescape()` with a no-op emitter (D-03).
 */

import { unescape } from "../parser/escapes.js";
import type { EncodingCharacters, Hl7Position, RawSegment } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";

/**
 * Parsed representation of a dot-path string. Produced by `parsePath`,
 * consumed by `resolvePath`. All numeric indices are normalized to the
 * internal convention (segmentIndex = 0-based occurrence, fieldIndex =
 * 1-based HL7 field number, repetitionIndex = 0-based rep, componentIndex
 * and subcomponentIndex = 1-based HL7 positions).
 *
 * @example
 * ```ts
 * import { parsePath } from "@cosyte/hl7";
 * parsePath("OBX[2].5.1");
 * // { segmentType: "OBX", segmentIndex: 2, fieldIndex: 5,
 * //   repetitionIndex: 0, componentIndex: 1 }
 * ```
 */
export interface DotPath {
  /** 3-char segment identifier (e.g. `"PID"`, `"OBX"`, `"ZPI"`). */
  readonly segmentType: string;
  /** 0-based occurrence of this segment type in the message. */
  readonly segmentIndex: number;
  /** 1-based HL7 field number; maps to `RawSegment.fields[fieldIndex]`. */
  readonly fieldIndex: number;
  /** 0-based repetition index; defaults to 0 when `[N]` is omitted. */
  readonly repetitionIndex?: number;
  /** 1-based HL7 component position (within a repetition). */
  readonly componentIndex?: number;
  /** 1-based HL7 subcomponent position (within a component). */
  readonly subcomponentIndex?: number;
}

/** Mutable local view for building a `DotPath` with `exactOptionalPropertyTypes` discipline. @internal */
interface MutableDotPath {
  segmentType: string;
  segmentIndex: number;
  fieldIndex: number;
  repetitionIndex?: number;
  componentIndex?: number;
  subcomponentIndex?: number;
}

/** Segment-name shape — `[A-Z][A-Z0-9]{2}` (D-19 symmetry with addSegment). Matches standard HL7 v2 segment names (PID, PV1, OBX, NK1, DG1, IN1…) and Z-segment customs (ZPI, ZX1…). @internal */
const SEGMENT_NAME_RE = /^[A-Z][A-Z0-9]{2}$/u;

/** Phase 3 auto-unescape pass uses a no-op emitter — no warnings surface on reads. @internal */
const NOOP_EMITTER = (_w: Hl7ParseWarning): void => {
  /* intentionally empty */
};

/**
 * Parse an HL7 dot-path string into a `DotPath` descriptor. Accepts shapes
 * like `SEG`, `SEG[n]`, `SEG.N`, `SEG.N[r]`, `SEG.N.C`, `SEG.N.C.S`, and all
 * combinations up to `SEG[n].N[r].C.S`. Throws `TypeError` with the offending
 * path string on any malformed input.
 *
 * @example
 * ```ts
 * import { parsePath } from "@cosyte/hl7";
 * parsePath("PID.5.1");       // { segmentType: "PID", segmentIndex: 0, fieldIndex: 5, componentIndex: 1 }
 * parsePath("OBX[2].5");      // { segmentType: "OBX", segmentIndex: 2, fieldIndex: 5 }
 * parsePath("PID.3[1].1");    // { segmentType: "PID", segmentIndex: 0, fieldIndex: 3, repetitionIndex: 1, componentIndex: 1 }
 * ```
 */
export function parsePath(path: string): DotPath {
  if (path.length === 0) {
    throw new TypeError(`Invalid HL7 dot-path: "" (empty).`);
  }

  // 1. Segment name — must be 3 chars matching [A-Z][A-Z0-9]{2}.
  if (path.length < 3) {
    throw new TypeError(`Invalid HL7 dot-path: "${path}" (segment name too short).`);
  }
  const segmentType = path.slice(0, 3);
  if (!SEGMENT_NAME_RE.test(segmentType)) {
    throw new TypeError(
      `Invalid HL7 dot-path: "${path}" (segment name must match [A-Z][A-Z0-9]{2}).`,
    );
  }
  let i = 3;

  const out: MutableDotPath = {
    segmentType,
    segmentIndex: 0,
    fieldIndex: 0,
  };

  // 2. Optional [n] segment occurrence.
  if (i < path.length && path.charAt(i) === "[") {
    const { value, next } = readBracket(path, i);
    out.segmentIndex = value;
    i = next;
  }

  // If the path ends here, the caller only asked for a segment — the
  // resolver can't produce a string value from a segment-only DotPath,
  // but we accept the shape so callers can probe structure.
  if (i === path.length) {
    // fieldIndex defaults to 0 — sentinel meaning "no field component".
    return freezeDotPath(out);
  }

  // 3. Expect `.` then a field number (1-indexed), plus optional `[r]`.
  if (path.charAt(i) !== ".") {
    throw new TypeError(
      `Invalid HL7 dot-path: "${path}" (expected '.' after segment at position ${String(i)}).`,
    );
  }
  i += 1;
  if (i === path.length) {
    throw new TypeError(`Invalid HL7 dot-path: "${path}" (trailing dot).`);
  }
  {
    const { value, next } = readDigits(path, i);
    out.fieldIndex = value;
    i = next;
  }
  if (i < path.length && path.charAt(i) === "[") {
    const { value, next } = readBracket(path, i);
    out.repetitionIndex = value;
    i = next;
  }

  // 4. Optional `.C` component (1-indexed).
  if (i < path.length) {
    if (path.charAt(i) !== ".") {
      throw new TypeError(
        `Invalid HL7 dot-path: "${path}" (unexpected '${path.charAt(i)}' at position ${String(i)}).`,
      );
    }
    i += 1;
    if (i === path.length) {
      throw new TypeError(`Invalid HL7 dot-path: "${path}" (trailing dot).`);
    }
    const { value, next } = readDigits(path, i);
    out.componentIndex = value;
    i = next;
  }

  // 5. Optional `.S` subcomponent (1-indexed).
  if (i < path.length) {
    if (path.charAt(i) !== ".") {
      throw new TypeError(
        `Invalid HL7 dot-path: "${path}" (unexpected '${path.charAt(i)}' at position ${String(i)}).`,
      );
    }
    i += 1;
    if (i === path.length) {
      throw new TypeError(`Invalid HL7 dot-path: "${path}" (trailing dot).`);
    }
    const { value, next } = readDigits(path, i);
    out.subcomponentIndex = value;
    i = next;
  }

  // 6. Any trailing content → malformed (e.g. `PID.5.1.1.1`, `PID.5xyz`).
  if (i !== path.length) {
    throw new TypeError(
      `Invalid HL7 dot-path: "${path}" (trailing content at position ${String(i)} — too deep or malformed).`,
    );
  }

  return freezeDotPath(out);
}

/**
 * Resolve a dot-path string against a raw segment tree to its auto-unescaped
 * leaf value. Returns `undefined` whenever the path does not resolve (missing
 * segment, out-of-range field/component/subcomponent/repetition), and never
 * throws on a missing value. Throws `TypeError` only when `path` itself is
 * malformed — callers relying on "never throws" should pre-validate or wrap
 * in try/catch.
 *
 * @example
 * ```ts
 * import { parseHL7, resolvePath } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * resolvePath("PID.5.1", msg.rawSegments, msg.encodingCharacters); // "Smith"
 * resolvePath("NOT.9", msg.rawSegments, msg.encodingCharacters);    // undefined
 * ```
 */
export function resolvePath(
  path: string,
  segments: readonly RawSegment[],
  enc: EncodingCharacters,
): string | undefined {
  const parsed = parsePath(path);

  // A segment-only path (no field specified) has no string value.
  if (parsed.fieldIndex === 0) return undefined;

  const found = findSegment(segments, parsed.segmentType, parsed.segmentIndex);
  if (found === undefined) return undefined;

  const { seg, absoluteIndex } = found;

  // MSH indexing is offset by -1 relative to the internal `fields[]` array:
  // Phase 2 tokenize placed the field-separator char at `fields[0]` and the
  // encoding-chars string at `fields[1]`, so MSH-1 → fields[0], MSH-2 →
  // fields[1], MSH-3 → fields[2], ..., MSH-12 → fields[11]. All other
  // segments use a straight 1:1 mapping (PID.5 → fields[5]) because
  // `fields[0]` is the segment-name placeholder (D-02, D-05 in
  // 03-CONTEXT.md; verified by test/parser-tokenize.test.ts:29-36).
  const rawFieldIndex = parsed.segmentType === "MSH" ? parsed.fieldIndex - 1 : parsed.fieldIndex;
  const field = seg.fields[rawFieldIndex];
  if (field === undefined) return undefined;

  const repIndex = parsed.repetitionIndex ?? 0;
  const rep = field.repetitions[repIndex];
  if (rep === undefined) return undefined;

  const compIndex = (parsed.componentIndex ?? 1) - 1;
  const comp = rep.components[compIndex];
  if (comp === undefined) return undefined;

  const subIndex = (parsed.subcomponentIndex ?? 1) - 1;
  const sub = comp.subcomponents[subIndex];

  // Best-effort position for the unescape emitter — segment index is the
  // only reliably known absolute index. The emitter is a no-op anyway;
  // position is kept for forward-compatibility if Phase 7 ever enables
  // warning surfacing on reads.
  const position: Hl7Position = buildPosition(absoluteIndex, parsed);

  if (sub !== undefined) {
    return unescape(sub, enc, NOOP_EMITTER, position);
  }

  // D-04 depth-collapse: when the caller asked for subcomponent 1 and
  // the component has exactly one subcomponent, returning
  // `comp.subcomponents[0]` already covered that case above. The edge
  // case here is when `subIndex > subcomponents.length - 1`: we fall
  // through to `undefined`. No additional branch needed.
  return undefined;
}

/**
 * Locate the `occurrence`-th segment of `segmentType` in document order.
 * Returns the matched `RawSegment` along with its absolute index in the
 * `segments[]` array (used by the `unescape` position argument for
 * forward-compatible warning surfacing).
 *
 * @internal
 */
function findSegment(
  segments: readonly RawSegment[],
  segmentType: string,
  occurrence: number,
): { readonly seg: RawSegment; readonly absoluteIndex: number } | undefined {
  let seen = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s === undefined) continue;
    if (s.name === segmentType) {
      if (seen === occurrence) return { seg: s, absoluteIndex: i };
      seen++;
    }
  }
  return undefined;
}

/**
 * Build an `Hl7Position` for the `unescape` emitter. Follows the
 * `exactOptionalPropertyTypes` discipline — optional keys are omitted when
 * their source is absent, never set to `undefined` explicitly.
 *
 * @internal
 */
function buildPosition(segmentIndex: number, parsed: DotPath): Hl7Position {
  const pos: {
    segmentIndex: number;
    fieldIndex?: number;
    repetitionIndex?: number;
    componentIndex?: number;
    subcomponentIndex?: number;
  } = { segmentIndex };
  if (parsed.fieldIndex !== 0) pos.fieldIndex = parsed.fieldIndex;
  if (parsed.repetitionIndex !== undefined) pos.repetitionIndex = parsed.repetitionIndex;
  if (parsed.componentIndex !== undefined) pos.componentIndex = parsed.componentIndex;
  if (parsed.subcomponentIndex !== undefined) pos.subcomponentIndex = parsed.subcomponentIndex;
  return pos;
}

/**
 * Consume a run of ASCII digits from `path` starting at `start`. Returns the
 * parsed non-negative integer and the next cursor position. Throws
 * `TypeError` when `path[start]` is not a digit (e.g. after a trailing dot
 * with no number, or a negative sign).
 *
 * @internal
 */
function readDigits(path: string, start: number): { value: number; next: number } {
  let j = start;
  while (j < path.length) {
    const ch = path.charCodeAt(j);
    if (ch < 0x30 || ch > 0x39) break;
    j += 1;
  }
  if (j === start) {
    throw new TypeError(
      `Invalid HL7 dot-path: "${path}" (expected digit at position ${String(start)}).`,
    );
  }
  const slice = path.slice(start, j);
  // Safe: we just verified every char is 0-9.
  return { value: parseInt(slice, 10), next: j };
}

/**
 * Consume a `[N]` bracket expression from `path` starting at `start` (which
 * must be the `[`). Returns the non-negative integer and the next cursor
 * position. Throws `TypeError` on empty brackets, non-digit content, missing
 * close bracket, or negative index.
 *
 * @internal
 */
function readBracket(path: string, start: number): { value: number; next: number } {
  // Caller guarantees path.charAt(start) === "["
  const close = path.indexOf("]", start + 1);
  if (close === -1) {
    throw new TypeError(
      `Invalid HL7 dot-path: "${path}" (unclosed '[' at position ${String(start)}).`,
    );
  }
  const inner = path.slice(start + 1, close);
  if (inner.length === 0) {
    throw new TypeError(`Invalid HL7 dot-path: "${path}" (empty brackets).`);
  }
  if (!/^\d+$/u.test(inner)) {
    throw new TypeError(
      `Invalid HL7 dot-path: "${path}" (bracket content "${inner}" is not a non-negative integer).`,
    );
  }
  return { value: parseInt(inner, 10), next: close + 1 };
}

/**
 * Return a `DotPath` from a mutable builder, honoring
 * `exactOptionalPropertyTypes` — optional keys are only present on the
 * returned object when their builder value is defined.
 *
 * @internal
 */
function freezeDotPath(m: MutableDotPath): DotPath {
  const base: {
    segmentType: string;
    segmentIndex: number;
    fieldIndex: number;
    repetitionIndex?: number;
    componentIndex?: number;
    subcomponentIndex?: number;
  } = {
    segmentType: m.segmentType,
    segmentIndex: m.segmentIndex,
    fieldIndex: m.fieldIndex,
  };
  if (m.repetitionIndex !== undefined) base.repetitionIndex = m.repetitionIndex;
  if (m.componentIndex !== undefined) base.componentIndex = m.componentIndex;
  if (m.subcomponentIndex !== undefined) base.subcomponentIndex = m.subcomponentIndex;
  return base;
}
