/**
 * `Field` — wrapper over a `RawField` exposing HL7 null/empty discrimination
 * (`isNull`), the raw repetitions tree, and a convenience `value` getter that
 * auto-unescapes the first subcomponent of the first component of the first
 * repetition. Constructed internally by `Segment.field(n)`; user code never
 * calls `new Field(...)` directly.
 *
 * Typed composite coercions (`asXpn`, `asXad`, etc.) are wired in Plan 04
 * after all 10 composite parsers ship in Plans 02 + 03.
 */

import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import { unescape } from "../parser/escapes.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawField,
  RawRepetition,
} from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";

/** Phase 3 leaf reads emit no warnings — the Field.value getter passes this no-op emitter to unescape. @internal */
const NOOP_EMITTER = (_w: Hl7ParseWarning): void => {
  /* intentionally empty */
};

/** Default position used by the shared empty-Field sentinel. @internal */
const DEFAULT_POSITION: Hl7Position = { segmentIndex: 0 };

/**
 * Wrapper over a `RawField` exposing HL7 null/empty discrimination
 * (`isNull`), the repetitions tree, and an auto-unescaped `value` getter.
 * `seg.field(3) === seg.field(3)` — Field instances are referentially stable
 * per segment position (D-12).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * const pid5 = msg.segments("PID")[0]?.field(5);
 * console.log(pid5?.value);              // "Smith" — auto-unescaped
 * console.log(pid5?.isNull);             // false — HL7 explicit null is "", absent is not
 * console.log(pid5?.repetitions.length); // 1
 * ```
 */
export class Field {
  /** HL7 null indicator — `true` iff the underlying field was the two-char literal `""`. */
  public readonly isNull: boolean;

  /** Reference to the underlying `RawField.repetitions` (no defensive copy). */
  public readonly repetitions: readonly RawRepetition[];

  /** The 5 encoding characters for this message. Exposed for composite parsers (Plan 04). @internal */
  public readonly enc: EncodingCharacters;

  /** Position of this field in the parent message — used for position-aware error messages. @internal */
  public readonly position: Hl7Position;

  /** The full `RawField` this wrapper wraps. Exposed for composite parsers (Plan 02/03/04). @internal */
  public readonly raw: RawField;

  /**
   * Construct a new `Field`. Called internally by `Segment.field(n)`; user
   * code should obtain `Field` instances via `msg.segments(type)[i].field(n)`.
   * @internal
   */
  public constructor(raw: RawField, enc: EncodingCharacters, position: Hl7Position) {
    this.raw = raw;
    this.isNull = raw.isNull;
    this.repetitions = raw.repetitions;
    this.enc = enc;
    this.position = position;
  }

  /**
   * First-repetition, first-component, first-subcomponent value as an
   * HL7-unescaped string. Returns `""` when the field is empty or HL7 null.
   * Equivalent to `msg.get('SEG.N')` for a top-level field access.
   *
   * @example
   * ```ts
   * const pid5 = msg.segments("PID")[0]?.field(5);
   * console.log(pid5?.value); // "Smith|Jr" (with \F\ auto-expanded)
   * ```
   */
  public get value(): string {
    const rep = this.repetitions[0];
    if (rep === undefined) return "";
    const comp = rep.components[0];
    if (comp === undefined) return "";
    const sub = comp.subcomponents[0];
    if (sub === undefined) return "";
    return unescape(sub, this.enc, NOOP_EMITTER, this.position);
  }

  /**
   * Return a synthetic empty `Field` sentinel — used by `Segment.field(n)` to
   * honor MODEL-05's "never throws on missing" contract. The returned Field
   * has `isNull === false`, `repetitions === []`, and `value === ""`.
   * Referentially stable across calls (same instance returned each time).
   *
   * The `enc` argument is accepted for API symmetry but ignored — the
   * synthetic field carries no content, so unescape would be a no-op
   * regardless of the active encoding characters.
   *
   * @example
   * ```ts
   * const empty = Field.empty(msg.encodingCharacters);
   * console.log(empty.value); // ""
   * ```
   * @internal
   */
  public static empty(_enc: EncodingCharacters): Field {
    return EMPTY_FIELD;
  }
}

const EMPTY_RAW_FIELD: RawField = Object.freeze({
  repetitions: Object.freeze([]) as readonly RawRepetition[],
  isNull: false,
});

const EMPTY_FIELD = new Field(EMPTY_RAW_FIELD, DEFAULT_ENCODING_CHARACTERS, DEFAULT_POSITION);
