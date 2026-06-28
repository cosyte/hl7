/**
 * `Field` — wrapper over a `RawField` exposing HL7 null/empty discrimination
 * (`isNull`), the raw repetitions tree, and a convenience `value` getter that
 * auto-unescapes the first subcomponent of the first component of the first
 * repetition. Constructed internally by `Segment.field(n)`; user code never
 * calls `new Field(...)` directly.
 *
 * Typed composite coercions (`asXpn`, `asXad`, `asCx`, `asCwe`, `asCe`,
 * `asXtn`, `asPl`, `asTs`, `asNm`, `asHd`) delegate to the corresponding
 * composite parsers from `./types/*`. Coercions are lazy and NOT memoized
 * in v1 (D-09) — each call re-parses the first repetition. Empty fields
 * return empty typed objects (`{}` for optional-field composites,
 * `{ raw: "", date: undefined }` / `{ raw: "", value: undefined }` for
 * the TS/NM scalar composites).
 */

import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import { unescape } from "../parser/escapes.js";
import type { EncodingCharacters, Hl7Position, RawField, RawRepetition } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";
import { parseCe, type CE } from "./types/ce.js";
import { parseCwe, type CWE } from "./types/cwe.js";
import { parseCx, type CX } from "./types/cx.js";
import { parseHd, type HD } from "./types/hd.js";
import { parseNm, type NM } from "./types/nm.js";
import { parsePl, type PL } from "./types/pl.js";
import { parseSn, type SN } from "./types/sn.js";
import { parseTs, type TS } from "./types/ts.js";
import { parseXad, type XAD } from "./types/xad.js";
import { parseXcn, type XCN } from "./types/xcn.js";
import { parseXpn, type XPN } from "./types/xpn.js";
import { parseXtn, type XTN } from "./types/xtn.js";

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
 * import { parseHL7 } from "@cosyte/hl7";
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

  /**
   * Coerce this field's first repetition to a typed `XPN` (Extended Person
   * Name). Absent components are OMITTED from the result
   * (`exactOptionalPropertyTypes`). Not memoized in v1 — each call re-parses
   * (D-09).
   *
   * @example
   * ```ts
   * const pid5 = msg.segments("PID")[0]?.field(5);
   * const name = pid5?.asXpn();
   * console.log(name?.familyName, name?.givenName);
   * ```
   */
  public asXpn(): XPN {
    return parseXpn(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `XAD` (Extended Address).
   *
   * @example
   * ```ts
   * const addr = msg.segments("PID")[0]?.field(11)?.asXad();
   * console.log(addr?.street, addr?.city, addr?.stateOrProvince);
   * ```
   */
  public asXad(): XAD {
    return parseXad(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `CX` (Extended Composite
   * ID). `assigningAuthority` is a nested `HD`.
   *
   * @example
   * ```ts
   * const mrn = msg.segments("PID")[0]?.field(3)?.asCx();
   * console.log(mrn?.idNumber, mrn?.assigningAuthority?.namespaceId);
   * ```
   */
  public asCx(): CX {
    return parseCx(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `CWE` (Coded With
   * Exceptions).
   *
   * @example
   * ```ts
   * const code = msg.segments("OBX")[0]?.field(3)?.asCwe();
   * console.log(code?.identifier, code?.text);
   * ```
   */
  public asCwe(): CWE {
    return parseCwe(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `CE` (Coded Element).
   *
   * @example
   * ```ts
   * const code = msg.segments("OBX")[0]?.field(3)?.asCe();
   * console.log(code?.identifier, code?.text);
   * ```
   */
  public asCe(): CE {
    return parseCe(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `XTN` (Extended
   * Telecommunication Number).
   *
   * @example
   * ```ts
   * const phone = msg.segments("PID")[0]?.field(13)?.asXtn();
   * console.log(phone?.telephoneNumber);
   * ```
   */
  public asXtn(): XTN {
    return parseXtn(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `PL` (Person Location).
   * `facility` is a nested `HD`.
   *
   * @example
   * ```ts
   * const loc = msg.segments("PV1")[0]?.field(3)?.asPl();
   * console.log(loc?.pointOfCare, loc?.room, loc?.facility?.namespaceId);
   * ```
   */
  public asPl(): PL {
    return parsePl(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `TS` (Time Stamp).
   * `{ raw, date }` — `date` is `undefined` on unparseable input (no throw).
   *
   * @example
   * ```ts
   * const ts = msg.segments("MSH")[0]?.field(7)?.asTs();
   * console.log(ts?.raw, ts?.date?.toISOString());
   * ```
   */
  public asTs(): TS {
    return parseTs(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `NM` (Numeric).
   * `{ raw, value }` — `value` is `undefined` on non-numeric input.
   *
   * @example
   * ```ts
   * const nm = msg.segments("OBX")[0]?.field(5)?.asNm();
   * console.log(nm?.value);
   * ```
   */
  public asNm(): NM {
    return parseNm(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `SN` (Structured Numeric),
   * or `undefined` when the field carries no usable structured-numeric content.
   * Use for an OBX-5 whose OBX-2 value type is `SN` (a comparator like `>90`,
   * a range like `100-200`, or a ratio like `1:128`). `num1`/`num2` are
   * `number | undefined` (never `NaN`); the comparator is surfaced only when
   * SN.1 is a recognized operator.
   *
   * @example
   * ```ts
   * const sn = msg.segments("OBX")[0]?.field(5)?.asSn();
   * console.log(sn?.comparator, sn?.num1); // ">" 90
   * ```
   */
  public asSn(): SN | undefined {
    return parseSn(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `HD` (Hierarchic
   * Designator).
   *
   * @example
   * ```ts
   * const sending = msg.segments("MSH")[0]?.field(3)?.asHd();
   * console.log(sending?.namespaceId);
   * ```
   */
  public asHd(): HD {
    return parseHd(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `XCN` (Extended Composite
   * ID Number and Name for Persons). `assigningAuthority` is a nested `HD`.
   * Common on OBR-16 (ordering provider), PV1-7 (attending doctor), PV1-8
   * (referring doctor). Empty field → `{}` (never throws).
   *
   * @example
   * ```ts
   * const orderedBy = msg.segments("OBR")[0]?.field(16)?.asXcn();
   * console.log(orderedBy?.idNumber, orderedBy?.familyName, orderedBy?.identifierTypeCode);
   * ```
   */
  public asXcn(): XCN {
    return parseXcn(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }
}

const EMPTY_RAW_FIELD: RawField = Object.freeze({
  repetitions: Object.freeze([]),
  isNull: false,
});

const EMPTY_FIELD = new Field(EMPTY_RAW_FIELD, DEFAULT_ENCODING_CHARACTERS, DEFAULT_POSITION);

/**
 * Synthetic empty repetition — feeds composite parsers for empty fields so
 * they return `{}` / empty typed objects instead of throwing. Shared across
 * every `.asXxx()` coercion. Frozen so no parser can mutate the sentinel.
 * @internal
 */
const EMPTY_REP: RawRepetition = Object.freeze({
  components: Object.freeze([]),
});
