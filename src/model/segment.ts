/**
 * `Segment`: wrapper class over a `RawSegment` that exposes `field(n)` with
 * referentially stable `Field` instances (D-12). Constructed internally by
 * `Hl7Message.segments(type)` / `Hl7Message.allSegments()`; user code never
 * calls `new Segment(...)` directly.
 *
 * The wrapper does NOT copy `raw.fields`: it holds a reference so mutations
 * through `setField` / `addSegment` / `removeSegment` stay visible.
 */

import { Field } from "./field.js";
import { canonicalSegmentName } from "../parser/known-segments.js";
import { boundedIdentifier } from "../parser/tokens.js";
import type { EncodingCharacters, RawField, RawSegment } from "../parser/types.js";

/**
 * Wrapper over a `RawSegment` exposing typed per-position `Field` instances.
 * `seg.field(3) === seg.field(3)`: referential stability is guaranteed per
 * segment instance.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * const pid = msg.segments("PID")[0];
 * if (pid !== undefined) console.log(pid.field(5).value);
 * ```
 */
export class Segment {
  /**
   * Segment identifier: three characters with a leading letter, e.g. `"PID"`,
   * `"OBX"`, `"ZPI"`.
   *
   * **Canonical ASCII uppercase.** A sender that ships `pid` or `Obx`, which
   * HL7 v2 Ch. 2 §2.5 does not permit but which real feeds do, reports here as
   * `PID` / `OBX`, so `msg.segments("PID")` matches it and a `SEGMENT_CASE`
   * warning records the deviation. Read {@link Segment.raw}`.name` for the
   * spelling that actually arrived.
   *
   * **Bounded, and it is `"<withheld>"` when the raw name is not that shape.**
   * A line with no field separator has its whole content read as a segment
   * name, so an unescaped line break inside a narrative field forges a
   * "segment" whose name is clinical text. This field presents itself as a
   * structural identifier and consumers interpolate it into labels, loci and
   * reports, so it never carries that text. `""` still means absent, which is
   * a different fact from withheld.
   *
   * Use {@link Segment.raw}`.name` when you need the verbatim text: it is the
   * unbounded value, and it is what serialization emits, so the byte-verbatim
   * round-trip is unaffected. One consequence worth knowing: a segment whose
   * raw name fails the shape (a 4-character vendor Z-segment, which HL7 v2
   * Ch. 2 §2.5 does not permit) is not matched by `msg.segments(name)`.
   */
  public readonly type: string;

  /** Reference to the underlying `RawSegment.fields`: 1-indexed per HL7 convention. */
  public readonly fields: readonly RawField[];

  /** The 5 encoding characters for this message. Exposed for composite parsers. @internal */
  public readonly enc: EncodingCharacters;

  /** Absolute index of this segment in `Hl7Message.rawSegments[]`. Used for position tracking. @internal */
  public readonly absoluteIndex: number;

  /** The full `RawSegment` this wrapper wraps. Exposed for mutation methods. @internal */
  public readonly raw: RawSegment;

  /**
   * Lookup map from profile-declared field name → 1-indexed HL7 position.
   * Absent when no profile was applied to the parent message, or when the
   * applied profile does not declare `customSegments` for this segment's
   * type. Consumed by `get(name)` to resolve named-field access (PROF-07).
   * @internal
   */
  public readonly customFields: Readonly<Record<string, number>> | undefined;

  /** Lazy cache of Field wrappers: one per fields[] position. @internal */
  private _fieldWrappers: Field[] | undefined;

  /**
   * Construct a new `Segment`. Called internally by `Hl7Message`; user code
   * should obtain `Segment` instances via `msg.segments(type)` or
   * `msg.allSegments()`.
   *
   * The optional `customFields` parameter is the per-segment portion of the
   * applied profile's merged `customSegments` map (PROF-07 / D-16). When
   * supplied, `get(name)` resolves names against it; otherwise `get(name)`
   * always returns `undefined`.
   * @internal
   */
  public constructor(
    raw: RawSegment,
    enc: EncodingCharacters,
    absoluteIndex: number,
    customFields?: Readonly<Record<string, number>>,
  ) {
    this.raw = raw;
    // Canonicalized THEN bounded, in that order, and both steps matter.
    //
    // Canonical because `type` is what every lookup compares against: not just
    // `msg.segments(type)`, but the `allSegments()` walkers behind
    // `medications()`, `notes()`, `appointments()` and `msg.structure`. Folding
    // here is what makes a sender's `obx` reach `observations()` instead of
    // vanishing. Folding is ASCII-only (see `canonicalSegmentName`) so a
    // Unicode lookalike cannot forge a segment identifier.
    //
    // Bounded because a consumer reads `type` as a structural identifier and
    // reasonably interpolates it into a label, a locus or a report. An
    // unescaped line break inside a narrative field forges a segment whose
    // "name" is the rest of that field, so this is the field that carried
    // clinical prose into a downstream package's report. Canonicalizing first
    // cannot loosen that guard: the shape test admits both cases already, and
    // ASCII-uppercasing maps `[A-Za-z]` onto `[A-Z]`, so exactly the same set
    // of names passes it. `raw.name` keeps the verbatim text for the byte-exact
    // round-trip; see the `type` field JSDoc.
    this.type = boundedIdentifier(canonicalSegmentName(raw.name), "segmentId");
    this.fields = raw.fields;
    this.enc = enc;
    this.absoluteIndex = absoluteIndex;
    this.customFields = customFields;
  }

  /**
   * Return the `Field` wrapper at HL7 position `n`. Indexing follows the HL7
   * 1-indexed convention: `seg.field(5)` on a PID segment maps to PID-5.
   * MSH segments use the same user-facing convention: `msh.field(1)` returns
   * the field-separator (MSH-1), `msh.field(2)` returns encoding chars
   * (MSH-2), `msh.field(3)` returns MSH-3, and so on: the internal
   * `fields[N-1]` offset for MSH segments is applied here (mirrors the
   * dot-path resolver in `dot-path.ts`, keeping `msg.segments('MSH')[0].field(3)`
   * and `msg.get('MSH.3')` in agreement).
   *
   * Returns a synthetic empty `Field` (`.isNull === false`, `.value === ""`)
   * when `n` is out of range: never throws (MODEL-05). Successive calls with
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

  /**
   * Return the `Field` at the profile-declared position for `name`, or
   * `undefined` when no custom mapping exists (PROF-07). Unlike `field(n)`,
   * missing names return `undefined`, NOT a synthetic empty Field, so
   * typos surface instead of silently resolving to an empty string (D-14).
   *
   * For segments without a profile-declared customSegments slice (most
   * non-Z segments, and any Z-segment whose host message had no profile
   * applied), this method always returns `undefined` (D-15 defense-in-depth
   *: D-05 already rejects standard-segment overlays at `defineProfile()`
   * time).
   *
   * When the declared position is out of range for the underlying
   * `RawSegment.fields`, `get(name)` returns `undefined` (NOT a
   * synthetic-empty Field) so callers can distinguish "name not declared"
   * from "name declared but position missing in the raw message" only at
   * the presence level (both collapse to `undefined` per D-14).
   *
   * @example
   * ```ts
   * const zpi = msg.allSegments().find((s) => s.type === "ZPI");
   * console.log(zpi?.get("encounterId")?.value);
   * ```
   */
  public get(name: string): Field | undefined {
    const position = this.customFields?.[name];
    if (position === undefined) return undefined;
    // Delegate to field(n) for MSH-offset + wrapper-cache consistency.
    // field(n) returns Field.empty(enc) when out-of-range; we check whether
    // the field has content and return undefined for out-of-range so typos
    // surface (not a silent-empty read).
    const f = this.field(position);
    // Treat "field has no repetitions AND not explicit-null" as out-of-range.
    if (f.repetitions.length === 0 && !f.isNull) return undefined;
    return f;
  }
}
