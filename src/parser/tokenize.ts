/**
 * Tokenizer stage for the `@cosyte/hl7` parser pipeline. Decomposes
 * an ordered list of segment strings into the nested positional tree that
 * `Hl7Message` holds: `RawSegment` -> `RawField` -> `RawRepetition` ->
 * `RawComponent` -> subcomponent strings. Honors custom encoding characters
 * so non-default delimiters flow through downstream stages
 * without re-derivation.
 *
 * Adopts the unified HL7 1-indexed convention for ALL segments:
 * `fields[0]` is the segment-name / separator placeholder slot (never a
 * data field); `fields[N]` for N >= 1 is the HL7 N-th field. MSH: `fields[0]`
 * holds the field separator char (MSH-1), `fields[1]` holds the encoding
 * chars string (MSH-2). Non-MSH (PID, EVN, ZPI, ...): `fields[0]` holds the
 * segment name, `fields[1]` holds the HL7 first field (PID-1).
 *
 * Escape expansion (the round-trip contract): each subcomponent is run
 * through `unescape()` during tokenization, so the raw tree holds DECODED
 * strings (e.g. `Smith|Jones`, not `Smith\F\Jones`). This is the exact
 * inverse of `reescape()` in `src/serialize/emit-field.ts`, which is how the
 * serializer produces spec-clean output and how structural round-trip
 * equivalence holds: `parseHL7(msg.toString()).rawSegments` deeply equals
 * `msg.rawSegments`. `UNKNOWN_ESCAPE_SEQUENCE` warnings from `unescape`
 * propagate through the `emit` callback.
 *
 * Escape-fidelity overlay: `reescape` is a faithful inverse only for
 * the delimiter/newline escapes: recognize-and-preserve escapes (`\H\`,
 * charset, formatting, `\Z..\`) and hex escapes (`\X41\`) decode to plain
 * characters that would re-emit canonicalized (`\H\` → `\E\H\E\`; `\X41\` → `A`),
 * not byte-verbatim. So tokenization also records the **original wire bytes** of
 * exactly those subcomponents in `RawComponent.rawSubcomponents`, which the
 * serializer emits verbatim. The decoded `subcomponents` surface is unchanged;
 * only emit consults the overlay. The MSH-1 / MSH-2 positional
 * placeholders (`fields[0]`, `fields[1]`) are intentionally NOT unescaped,
 * they hold the literal delimiter / encoding chars and participate in
 * serialization via the serializer's MSH special-case path, not via `emitField`.
 *
 * Memory: the tree is most of what a parse holds, so it is built without waste. Each level reuses
 * the array `String.prototype.split` returns, writing the parsed node over the string it came from,
 * so every array is exactly as long as its content (an array grown by `push` reserves room for
 * about 17 entries, which made array storage more than half of a parsed message). A warning's
 * position object is built only when a warning is emitted. Every empty field shares one frozen
 * node, every explicit null another, and every segment of one name one frozen `fields[0]`.
 */

import { escapeFidelityRaw, unescape } from "./escapes.js";
import { fieldWhitespaceTrimmed } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type {
  EncodingCharacters,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "./types.js";

/** No repetitions, frozen: shared by the two field nodes below. */
const NO_REPETITIONS: readonly RawRepetition[] = Object.freeze([]);

/**
 * The one node for every empty field (`||`), frozen. The tree is never changed in place (every
 * mutation method rebuilds the path it changes), so the nodes can be shared.
 */
const EMPTY_FIELD: RawField = Object.freeze({ repetitions: NO_REPETITIONS, isNull: false });

/** The one node for every explicit null field (`|""|`), frozen. */
const NULL_FIELD: RawField = Object.freeze({ repetitions: NO_REPETITIONS, isNull: true });

/**
 * `text` split on `separator`. A text without the separator is an array of itself alone, which is
 * what `split` returns too; most values hold no separator, and `split` costs several times what
 * `includes` and an array literal cost together.
 */
function splitOn(text: string, separator: string): string[] {
  // Stryker disable next-line ConditionalExpression: split returns the same one-entry array; the test only spares its cost
  return text.includes(separator) ? text.split(separator) : [text];
}

/** A field holding one plain value: one repetition of one component of one subcomponent. */
function singleValueField(value: string): RawField {
  return { repetitions: [{ components: [{ subcomponents: [value] }] }], isNull: false };
}

/**
 * Decompose an ordered list of segment strings into the raw positional tree
 * consumed by `Hl7Message`. Honors custom encoding characters from `enc`.
 * Empty field (`||`) vs HL7 explicit null (`""`) are distinguished via
 * `RawField.isNull`.
 *
 * When `trimFields` is true and a field value had non-trivial leading or
 * trailing whitespace (i.e. whitespace around non-whitespace content), a
 * `FIELD_WHITESPACE_TRIMMED` warning is emitted via `emit`. All-whitespace
 * fields and fields without surrounding whitespace do not emit. Escape
 * sequence expansion is deferred to the on-access escape stage.
 *
 * @example
 * ```ts
 * import { tokenize, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const tree = tokenize(
 *   ["MSH|^~\\&|APP", "PID|1||Doe^Jane"],
 *   DEFAULT_ENCODING_CHARACTERS,
 *   () => {},
 *   true,
 * );
 * // tree[1].name === "PID"
 * // tree[1].fields[3].repetitions[0].components[0].subcomponents[0] === "Doe"
 * ```
 */
export function tokenize(
  segments: readonly string[],
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  trimFields: boolean,
): readonly RawSegment[] {
  const placeholders = new Map<string, RawField>();
  return segments.map((segStr, sIdx) =>
    tokenizeSegment(segStr, enc, emit, sIdx, trimFields, placeholders),
  );
}

/**
 * The `fields[0]` placeholder holding `value` (a segment name, or MSH-1's separator), frozen and
 * shared by every segment of this parse that has the same one: a result report's hundred OBX
 * segments hold one placeholder between them.
 */
function placeholder(placeholders: Map<string, RawField>, value: string): RawField {
  let field = placeholders.get(value);
  if (field === undefined) {
    const subcomponents = Object.freeze([value]);
    const components = Object.freeze([Object.freeze({ subcomponents })]);
    const repetitions = Object.freeze([Object.freeze({ components })]);
    field = Object.freeze({ repetitions, isNull: false });
    placeholders.set(value, field);
  }
  return field;
}

/**
 * Tokenize one segment string. The segment is split on the field separator once, and that array
 * becomes the segment's `fields`: entry 0 (the name) is replaced by the name placeholder, and each
 * later entry by its parsed field.
 *
 * MSH is the one segment where the field separator is encoded in-band as MSH-1:
 * `MSH|^~\&|APP|...`. We synthesize `fields[0]` as a single-component holding the separator char
 * and `fields[1]` as a single-component holding the raw MSH-2 encoding chars string; the
 * remainder (MSH-3, MSH-4, ...) is parsed with the 1-indexed `fieldIndex` on emitted warnings
 * matching the HL7 position (MSH-3 emits `fieldIndex: 3`). For any other segment, the first data
 * field (PID-1) emits `fieldIndex: 1`.
 *
 * @internal
 */
function tokenizeSegment(
  segStr: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  sIdx: number,
  trimFields: boolean,
  placeholders: Map<string, RawField>,
): RawSegment {
  // Preserve empty middle segments (from consecutive \r) as zero-field,
  // empty-name RawSegment so segmentIndex stays stable downstream.
  if (segStr.length === 0) return { name: "", fields: [] };

  const fields: (string | RawField)[] = segStr.split(enc.field);
  const name = fields[0] as string;
  const isMsh = name === "MSH";
  // A segment that ends at its last separator (`PID|`, or `MSH|^~\&|`) has no data field after it.
  if (fields[fields.length - 1] === "" && fields.length === (isMsh ? 3 : 2)) fields.pop();

  // Warnings number MSH fields as HL7 does (MSH-3 is 3); the tree holds MSH-1 at index 0.
  const fieldIndexOffset = isMsh ? 1 : 0;
  let first = 1;
  if (isMsh) {
    fields[0] = placeholder(placeholders, enc.field);
    // MSH-2 is kept as it arrived: the encoding characters, never unescaped or trimmed. A later
    // segment that is `MSH` alone still gets an empty MSH-2.
    fields[1] = singleValueField((fields[1] as string | undefined) ?? "");
    first = 2;
  } else {
    fields[0] = placeholder(placeholders, name);
  }
  for (let fIdx = first; fIdx < fields.length; fIdx++) {
    fields[fIdx] = tokenizeField(
      fields[fIdx] as string,
      enc,
      emit,
      sIdx,
      fIdx + fieldIndexOffset,
      trimFields,
    );
  }
  return { name, fields: fields as RawField[] };
}

/**
 * Tokenize a single field string into a `RawField`. Handles the empty
 * (`""`-the-JS-empty-string) vs explicit-null (`""`-the-HL7-literal) split,
 * then performs optional whitespace trim with warning
 * emission, then delegates repetition splitting.
 *
 * @internal
 */
function tokenizeField(
  raw: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  segmentIndex: number,
  fieldIndex: number,
  trimFields: boolean,
): RawField {
  if (raw === "") return EMPTY_FIELD;
  if (raw === '""') return NULL_FIELD;

  let value = raw;
  if (trimFields) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && trimmed !== raw) {
      const trimStart = raw.length - raw.trimStart().length;
      const trimEnd = raw.length - raw.trimEnd().length;
      emit(fieldWhitespaceTrimmed({ segmentIndex, fieldIndex }, trimStart, trimEnd));
      value = trimmed;
    }
  }

  const repetitions: (string | RawRepetition)[] = splitOn(value, enc.repetition);
  for (let rIdx = 0; rIdx < repetitions.length; rIdx++) {
    repetitions[rIdx] = tokenizeRepetition(
      repetitions[rIdx] as string,
      enc,
      emit,
      segmentIndex,
      fieldIndex,
      rIdx + 1,
    );
  }
  return { repetitions: repetitions as RawRepetition[], isNull: false };
}

/** @internal */
function tokenizeRepetition(
  raw: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  segmentIndex: number,
  fieldIndex: number,
  repetitionIndex: number,
): RawRepetition {
  const components: (string | RawComponent)[] = splitOn(raw, enc.component);
  for (let cIdx = 0; cIdx < components.length; cIdx++) {
    components[cIdx] = tokenizeComponent(
      components[cIdx] as string,
      enc,
      emit,
      segmentIndex,
      fieldIndex,
      repetitionIndex,
      cIdx + 1,
    );
  }
  return { components: components as RawComponent[] };
}

/**
 * Tokenize a single component into its subcomponents, running each
 * subcomponent string through `unescape` so the raw tree stores DECODED
 * values (inverse of `reescape` at emit time). This is load-bearing for
 * structural round-trip equivalence: without it, the raw tree would
 * store literal `\F\` / `\E\` / `\.br\` sequences and emit would double-
 * escape them into `\E\F\E\` / etc.
 *
 * `UNKNOWN_ESCAPE_SEQUENCE` warnings from `unescape` propagate through the
 * `emit` callback with the full positional context (segment, field, rep,
 * component, subcomponent all 1-indexed).
 *
 * @internal
 */
function tokenizeComponent(
  raw: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  segmentIndex: number,
  fieldIndex: number,
  repetitionIndex: number,
  componentIndex: number,
): RawComponent {
  const subcomponents = splitOn(raw, enc.subcomponent);
  // Escape-fidelity overlay (HL7-ESC): the original wire bytes for any
  // subcomponent whose decoded form does not re-escape back to those exact
  // bytes (recognize-and-preserve escapes like `\H\`; hex escapes like
  // `\X41\`). Stays `undefined`-per-entry for the common case, and the whole
  // array is dropped when nothing needs it: so a plain message's raw tree is
  // shaped exactly as before this overlay existed.
  let rawSubcomponents: (string | undefined)[] | undefined;
  for (let sIdx = 0; sIdx < subcomponents.length; sIdx++) {
    const sub = subcomponents[sIdx] as string;
    // Only an escape-bearing subcomponent can decode to something else or need the overlay; a
    // plain one stays the string split returned.
    if (!sub.includes(enc.escape)) continue;
    const decodedSub = unescape(sub, enc, emit, {
      segmentIndex,
      fieldIndex,
      repetitionIndex,
      componentIndex,
      subcomponentIndex: sIdx + 1,
    });
    subcomponents[sIdx] = decodedSub;
    const fidelity = escapeFidelityRaw(sub, decodedSub, enc);
    if (fidelity !== undefined) {
      (rawSubcomponents ??= new Array<string | undefined>(subcomponents.length).fill(undefined))[
        sIdx
      ] = fidelity;
    }
  }
  return rawSubcomponents === undefined ? { subcomponents } : { subcomponents, rawSubcomponents };
}
