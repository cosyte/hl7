/**
 * `Segment` — wrapper class over a `RawSegment` that exposes `field(n)` with
 * referentially stable `Field` instances (D-12). Constructed internally by
 * `Hl7Message.segments(type)` / `Hl7Message.allSegments()`; user code never
 * calls `new Segment(...)` directly.
 *
 * The wrapper does NOT copy `raw.fields` — it holds a reference so mutations
 * through Plan 04's `setField` / `addSegment` / `removeSegment` stay visible.
 */

import { Field } from "./field.js";
import type { EncodingCharacters, RawField, RawSegment } from "../parser/types.js";

/**
 * Wrapper over a `RawSegment` exposing typed per-position `Field` instances.
 * `seg.field(3) === seg.field(3)` — referential stability is guaranteed per
 * segment instance.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * const pid = msg.segments("PID")[0];
 * if (pid !== undefined) console.log(pid.field(5).value);
 * ```
 */
export class Segment {
  /** Segment name (3 chars, e.g. `"PID"`, `"OBX"`, `"ZPI"`). */
  public readonly type: string;

  /** Reference to the underlying `RawSegment.fields` — 1-indexed per HL7 convention. */
  public readonly fields: readonly RawField[];

  /** The 5 encoding characters for this message. Exposed for composite parsers. @internal */
  public readonly enc: EncodingCharacters;

  /** Absolute index of this segment in `Hl7Message.rawSegments[]`. Used for position tracking. @internal */
  public readonly absoluteIndex: number;

  /** The full `RawSegment` this wrapper wraps. Exposed for mutation methods (Plan 04). @internal */
  public readonly raw: RawSegment;

  /** Lazy cache of Field wrappers — one per fields[] position. @internal */
  private _fieldWrappers: Field[] | undefined;

  /**
   * Construct a new `Segment`. Called internally by `Hl7Message`; user code
   * should obtain `Segment` instances via `msg.segments(type)` or
   * `msg.allSegments()`.
   * @internal
   */
  public constructor(raw: RawSegment, enc: EncodingCharacters, absoluteIndex: number) {
    this.raw = raw;
    this.type = raw.name;
    this.fields = raw.fields;
    this.enc = enc;
    this.absoluteIndex = absoluteIndex;
  }

  /**
   * Return the `Field` wrapper at HL7 position `n`. Indexing follows the HL7
   * 1-indexed convention — `seg.field(5)` on a PID segment maps to PID-5.
   * MSH segments use the same user-facing convention: `msh.field(1)` returns
   * the field-separator (MSH-1), `msh.field(2)` returns encoding chars
   * (MSH-2), `msh.field(3)` returns MSH-3, and so on — the internal
   * `fields[N-1]` offset for MSH segments is applied here (mirrors the
   * dot-path resolver in `dot-path.ts`, keeping `msg.segments('MSH')[0].field(3)`
   * and `msg.get('MSH.3')` in agreement).
   *
   * Returns a synthetic empty `Field` (`.isNull === false`, `.value === ""`)
   * when `n` is out of range — never throws (MODEL-05). Successive calls with
   * the same `n` return the same `Field` instance (D-12).
   *
   * @example
   * ```ts
   * const pid5 = msg.segments("PID")[0]?.field(5);
   * console.log(pid5?.value); // "Smith"
   * const msh3 = msg.segments("MSH")[0]?.field(3);
   * console.log(msh3?.value); // sending application (HL7 MSH-3)
   * ```
   */
  public field(n: number): Field {
    if (this._fieldWrappers === undefined) {
      // Build the full wrapper array. O(k) where k = fields.length; cached.
      this._fieldWrappers = this.fields.map(
        (rf, i) =>
          new Field(rf, this.enc, {
            segmentIndex: this.absoluteIndex,
            fieldIndex: i,
          }),
      );
    }
    // MSH offset: HL7 MSH-1 lives at fields[0] (separator), MSH-2 at fields[1]
    // (encoding chars), MSH-3 at fields[2], etc. Non-MSH segments use a
    // straight 1:1 mapping because fields[0] is the segment-name placeholder.
    const idx = this.type === "MSH" ? n - 1 : n;
    const f = this._fieldWrappers[idx];
    return f ?? Field.empty(this.enc);
  }
}
