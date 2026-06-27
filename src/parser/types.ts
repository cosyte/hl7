/**
 * Shared type definitions consumed across the `@cosyte/hl7` parser
 * pipeline. These types are contracts between parser stages (normalize,
 * mllp, segments, delimiters, tokenize) and the `Hl7Message` model shell.
 *
 * Every type here is deliberately readonly — the parser produces immutable
 * data structures and consumers must not mutate them. Narrowing is done via
 * the `Hl7ParseWarning.code` and `Hl7ParseError.code` discriminants defined
 * in sibling files.
 */

// Forward reference to the warning shape owned by `./warnings.ts`. Declared
// with `import type` so it contributes zero runtime cost and `./warnings.ts`
// remains the single source of truth for `Hl7ParseWarning`.
import type { Hl7ParseWarning } from "./warnings.js";

/**
 * Positional context attached to every warning and fatal error. Fields are
 * 1-indexed against the HL7 spec convention (see `RawSegment.fields` for the
 * index 0 slot convention). All fields past `segmentIndex` are optional —
 * for a top-level fatal like `EMPTY_INPUT` only `segmentIndex: 0` is
 * populated; for a tokenizer warning deep inside a subcomponent all five
 * indices may be set.
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, do not pass `fieldIndex: undefined`
 * explicitly — omit the key instead.
 *
 * @example
 * ```ts
 * import type { Hl7Position } from "@cosyte/hl7";
 * const pos: Hl7Position = { segmentIndex: 2, fieldIndex: 5 };
 * ```
 */
export interface Hl7Position {
  readonly segmentIndex: number;
  readonly fieldIndex?: number;
  readonly repetitionIndex?: number;
  readonly componentIndex?: number;
  readonly subcomponentIndex?: number;
}

/**
 * Callback invoked inline each time the parser emits a Tier-2 warning.
 * Always fires BEFORE the warning is appended to `Hl7Message.warnings` so
 * consumers observe warnings in the same order the parser discovered them.
 *
 * @example
 * ```ts
 * import { parseHL7, type OnWarningCallback } from "@cosyte/hl7";
 * const onWarning: OnWarningCallback = (w) => {
 *   console.warn(w.code, w.message);
 * };
 * parseHL7(raw, { onWarning });
 * ```
 */
export type OnWarningCallback = (warning: Hl7ParseWarning) => void;

/**
 * Options accepted by `parseHL7` to tune lenient/strict behaviour, inject a
 * profile, and configure optional preprocessing steps. Every field is
 * optional; `parseHL7(raw, {})` is valid and produces the library defaults.
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, callers cannot pass
 * `{ strict: undefined }` — either omit the key or pass a boolean. The
 * `profile: null` form is the explicit opt-out from the process-scoped
 * default profile (PROF-08 semantics); `profile` omitted means "use the
 * default if one is registered".
 *
 * @example
 * ```ts
 * import { parseHL7, type ParseOptions } from "@cosyte/hl7";
 * const opts: ParseOptions = {
 *   strict: true,
 *   onWarning: (w) => console.warn(w.code),
 *   dateFormats: ["YYYY-MM-DD"],
 * };
 * parseHL7(raw, opts);
 * ```
 */
export interface ParseOptions {
  readonly strict?: boolean;
  readonly onWarning?: OnWarningCallback;
  readonly dateFormats?: readonly string[];
  readonly stripMllpFraming?: boolean;
  readonly trimFields?: boolean;
  readonly profile?: Profile | null;
  /**
   * Override the character set used to decode `Buffer` input. When supplied
   * this wins over MSH-18 auto-discovery. When both are supplied and they
   * disagree (after alias normalization) the parser emits
   * `ENCODING_MISMATCH` and honours this override. Ignored for `string`
   * input.
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7";
   * parseHL7(buf, { charset: "ISO-8859-1" });
   * ```
   */
  readonly charset?: string;
}

/**
 * Shape of a single custom Z-segment declaration used by profile authoring
 * (`defineProfile()`). `fields` maps a caller-visible field NAME to its
 * 1-indexed HL7 position within the segment. Declared here (alongside
 * `Profile`) to keep the parser's type module the single source of truth;
 * `src/profiles/define.ts` re-exports this type so consumers can write
 * `import type { CustomSegmentDefinition } from "@cosyte/hl7"`
 * after Plan 06's barrel-sweep.
 *
 * @example
 * ```ts
 * import type { CustomSegmentDefinition } from "@cosyte/hl7";
 * const zdp: CustomSegmentDefinition = {
 *   fields: { departmentCode: 3, departmentName: 4 },
 * };
 * ```
 */
export interface CustomSegmentDefinition {
  readonly fields: Readonly<Record<string, number>>;
}

/**
 * Structural placeholder for HL7 profiles. A profile bundles vendor-specific
 * tolerances, date formats, custom segment definitions, and optional
 * callbacks. Phase 2 ships only the type — the `defineProfile()` builder
 * and runtime effects land in Phase 6.
 *
 * Phase 6 Plan 01 tightens `customSegments` to the locked
 * `CustomSegmentDefinition` shape and adds an optional `describe?` method
 * so `defineProfile()`-produced profiles can be introspected without
 * consumers needing to narrow away from the `Profile` type. The `describe`
 * method is only populated by `defineProfile()` — hand-authored `Profile`
 * objects may omit it.
 *
 * @example
 * ```ts
 * import type { Profile } from "@cosyte/hl7";
 * const epic: Profile = {
 *   name: "epic",
 *   description: "Epic-specific quirks and date formats",
 *   dateFormats: ["YYYYMMDDHHmmss", "YYYYMMDD"],
 *   customSegments: {
 *     ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
 *   },
 * };
 * ```
 */
export interface Profile {
  readonly name: string;
  readonly description?: string;
  readonly lineage?: readonly string[];
  readonly dateFormats?: readonly string[];
  readonly customSegments?: Readonly<Record<string, CustomSegmentDefinition>>;
  readonly onWarning?: OnWarningCallback;
  readonly describe?: () => string;
}

/**
 * The HL7 delimiter characters discovered from MSH-1 (field separator) and
 * MSH-2 (encoding characters). The first four — component, repetition,
 * escape, subcomponent — are mandatory across all HL7 v2 versions. The fifth,
 * `truncation`, is the v2.7+ truncation character (default `#` per spec
 * §2.5.5.2): only present when MSH-2 actually carries 5 encoding characters,
 * so messages that pre-date v2.7 round-trip with a 4-char MSH-2 unchanged.
 *
 * @example
 * ```ts
 * import type { EncodingCharacters } from "@cosyte/hl7";
 * const v25: EncodingCharacters = {
 *   field: "|",
 *   component: "^",
 *   repetition: "~",
 *   escape: "\\",
 *   subcomponent: "&",
 * };
 * const v27: EncodingCharacters = { ...v25, truncation: "#" };
 * ```
 */
export interface EncodingCharacters {
  readonly field: string;
  readonly component: string;
  readonly repetition: string;
  readonly escape: string;
  readonly subcomponent: string;
  readonly truncation?: string;
}

/**
 * A single component inside a repetition — the most deeply nested data
 * layer in the HL7 positional tree. A component is an ordered list of
 * subcomponent strings (subcomponent separator `&` by default).
 *
 * @example
 * ```ts
 * import type { RawComponent } from "@cosyte/hl7";
 * const comp: RawComponent = { subcomponents: ["Smith", "John"] };
 * ```
 */
export interface RawComponent {
  readonly subcomponents: readonly string[];
}

/**
 * A single repetition inside a field — HL7 fields may repeat using the
 * repetition separator (`~` by default). Each repetition is an ordered list
 * of components.
 *
 * @example
 * ```ts
 * import type { RawRepetition } from "@cosyte/hl7";
 * const rep: RawRepetition = { components: [{ subcomponents: ["Smith"] }] };
 * ```
 */
export interface RawRepetition {
  readonly components: readonly RawComponent[];
}

/**
 * A positional field inside a segment. Carries its repetitions plus an
 * `isNull` discriminant that distinguishes the HL7 explicit null (`""`, a
 * two-character literal double quote) from an empty field (no content
 * between delimiters).
 *
 * @example
 * ```ts
 * import type { RawField } from "@cosyte/hl7";
 * const nullField: RawField = { repetitions: [], isNull: true };
 * const emptyField: RawField = { repetitions: [], isNull: false };
 * ```
 */
export interface RawField {
  readonly repetitions: readonly RawRepetition[];
  readonly isNull: boolean;
}

/**
 * A parsed HL7 segment — the top level of the positional tree. The `name`
 * is the three-character segment identifier (`MSH`, `PID`, `ZPI`, ...) and
 * `fields` is the 1-indexed positional field array (see the JSDoc on
 * `fields` for the index 0 slot convention).
 *
 * @example
 * ```ts
 * import type { RawSegment } from "@cosyte/hl7";
 * const pid: RawSegment = {
 *   name: "PID",
 *   fields: [
 *     { repetitions: [], isNull: false },
 *   ],
 * };
 * ```
 */
export interface RawSegment {
  readonly name: string;
  /**
   * Positional fields array using HL7 1-indexed convention for ALL segments.
   *
   * - `fields[0]` is the segment name / separator placeholder slot (never a
   *   data field).
   * - `fields[N]` for N >= 1 is the HL7 N-th field.
   *
   * Examples:
   *
   * - MSH: `fields[0]` = field-separator char, `fields[1]` = MSH-2 (encoding
   *   chars), `fields[2]` = MSH-3, ..., `fields[11]` = MSH-12.
   * - PID: `fields[0]` = "PID" name placeholder, `fields[1]` = PID-1,
   *   `fields[2]` = PID-2, ....
   */
  readonly fields: readonly RawField[];
}
