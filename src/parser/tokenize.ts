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
 *
 * Warnings: the build reports none of its own. The scanner (`scan.ts`) finds every trim and escape
 * finding in one pass before anything is built, and `tokenize` runs it on each segment ahead of the
 * build, so the warnings arrive in the same order as when the build reported them itself. That is
 * what lets a parsed message build a segment later, on first read, with nothing left to report.
 */

import { escapeFidelityRaw, unescape } from "./escapes.js";
import { KNOWN_SEGMENTS } from "./known-segments.js";
import { HOLDS_ESCAPE, PLAIN_FIELD_LIMIT, Scanner, splitOn } from "./scan.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type {
  EncodingCharacters,
  Hl7Position,
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

/** Nothing to do: the scanner reported every finding before the build began. */
function ignore(): void {
  // The scanner reported this finding before the build began.
}

/** The position the build hands `unescape`, which only a warning would read. */
const NO_POSITION: Hl7Position = Object.freeze({ segmentIndex: 0 });

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
 * fields and fields without surrounding whitespace do not emit. An unknown or
 * unterminated escape sequence is reported through `emit` as well.
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
  return segments.map((segStr, sIdx) => {
    let trimmed: number[] | undefined;
    const sink = {
      warn: emit,
      trimmed: (_s: number, f: number) => {
        if (trimmed === undefined) trimmed = [f];
        else trimmed.push(f);
      },
    };
    const scanner = new Scanner(segStr, enc, trimFields, sink);
    scanner.segment(0, segStr.length, sIdx);
    return buildSegment(segStr, enc, placeholders, trimmed, scanner.flags);
  });
}

/**
 * The `fields[0]` placeholders of the standard segment names and of the ASCII field separators,
 * made once for the whole process: a placeholder is frozen at every level and holds nothing but
 * its name, so, like the shared empty and null field nodes, it is the same for every message.
 * Freezing a placeholder's six nodes cost a sixth of the parse of a small message when every parse
 * made its own. Bounded: the standard names and the 128 ASCII characters.
 */
const SHARED_PLACEHOLDERS = new Map<string, RawField>();

/**
 * The `fields[0]` placeholder holding `value` (a segment name, or MSH-1's separator), frozen. A
 * standard segment name or an ASCII separator shares one for the process; any other name shares
 * one per parse (`placeholders`), so a result report's hundred `ZRS` segments hold one between them.
 */
function placeholder(placeholders: Map<string, RawField>, value: string): RawField {
  const cache =
    KNOWN_SEGMENTS.has(value) || (value.length === 1 && value.charCodeAt(0) < 128)
      ? SHARED_PLACEHOLDERS
      : placeholders;
  let field = cache.get(value);
  if (field === undefined) {
    const subcomponents = Object.freeze([value]);
    const components = Object.freeze([Object.freeze({ subcomponents })]);
    const repetitions = Object.freeze([Object.freeze({ components })]);
    field = Object.freeze({ repetitions, isNull: false });
    cache.set(value, field);
  }
  return field;
}

/**
 * Build one segment's tree from its text, reporting nothing: the scanner has already reported
 * every finding in it. The segment is split on the field separator once, and that array becomes
 * the segment's `fields`: entry 0 (the name) is replaced by the name placeholder, and each later
 * entry by its parsed field. `placeholders` is the parse's own map of shared `fields[0]` nodes.
 *
 * What the scan found decides what the build does, so it repeats none of the scan's work:
 * `trimmed` lists the fields (by index in `fields`) the scan reported as trimmed, which are
 * exactly the fields whose value is trimmed. `flags` is the scan's word for the segment
 * (`Scanner.flags`): whether its text holds the escape character anywhere, without which no
 * subcomponent needs decoding, and which fields the scan read whole and found no repetition,
 * component or subcomponent separator in, whose tree is one value.
 *
 * MSH is the one segment where the field separator is encoded in-band as MSH-1:
 * `MSH|^~\&|APP|...`. We synthesize `fields[0]` as a single-component holding the separator char
 * and `fields[1]` as a single-component holding the raw MSH-2 encoding chars string; the
 * remainder (MSH-3, MSH-4, ...) is built as any other field.
 *
 * @internal
 */
export function buildSegment(
  segStr: string,
  enc: EncodingCharacters,
  placeholders: Map<string, RawField>,
  trimmed: readonly number[] | undefined,
  flags: number,
): RawSegment {
  // Preserve empty middle segments (from consecutive \r) as zero-field,
  // empty-name RawSegment so segmentIndex stays stable downstream.
  if (segStr.length === 0) return { name: "", fields: [] };
  return buildFields(segStr.split(enc.field), enc, placeholders, trimmed, flags);
}

/**
 * Build the segment `scanner` has just scanned in `text`, from the field boundaries the scan
 * found, so the segment is not searched again. The same tree {@link buildSegment} builds from the
 * segment's text.
 *
 * @internal
 */
export function buildScannedSegment(
  text: string,
  scanner: Scanner,
  enc: EncodingCharacters,
  placeholders: Map<string, RawField>,
  trimmed: readonly number[] | undefined,
): RawSegment {
  const starts = scanner.fieldStarts;
  const count = scanner.fieldCount;
  // An empty segment: its one "field" (the name) runs from its start to its start.
  if (count === 1 && starts[1] === (starts[0] as number) + 1) return { name: "", fields: [] };
  // Stryker disable next-line ArrayDeclaration: an array grown from empty holds the same entries; the length only allocates it once
  const fields = new Array<string | RawField>(count);
  for (let k = 0; k < count; k++) {
    fields[k] = text.slice(starts[k], (starts[k + 1] as number) - 1);
  }
  return buildFields(fields, enc, placeholders, trimmed, scanner.flags);
}

/**
 * Build a segment from its text split on the field separator, the name first. The array becomes
 * the segment's `fields`, each entry replaced by its node.
 */
function buildFields(
  fields: (string | RawField)[],
  enc: EncodingCharacters,
  placeholders: Map<string, RawField>,
  trimmed: readonly number[] | undefined,
  flags: number,
): RawSegment {
  const name = fields[0] as string;
  const isMsh = name === "MSH";
  // A segment that ends at its last separator (`PID|`, or `MSH|^~\&|`) has no data field after it.
  if (fields[fields.length - 1] === "" && fields.length === (isMsh ? 3 : 2)) fields.pop();

  const hasEscape = (flags & HOLDS_ESCAPE) !== 0;
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
    const trim = trimmed !== undefined && trimmed.includes(fIdx);
    const plain = fIdx <= PLAIN_FIELD_LIMIT && ((flags >>> (fIdx - 1)) & 1) === 1;
    fields[fIdx] = buildField(fields[fIdx] as string, enc, trim, hasEscape, plain);
  }
  return { name, fields: fields as RawField[] };
}

/**
 * Build a single field string into a `RawField`. Handles the empty
 * (`""`-the-JS-empty-string) vs explicit-null (`""`-the-HL7-literal) split,
 * then the whitespace trim of a field the scan reported as trimmed, then
 * builds a plain field (no structure separator in it) directly or delegates
 * repetition splitting.
 *
 * @internal
 */
function buildField(
  raw: string,
  enc: EncodingCharacters,
  trim: boolean,
  hasEscape: boolean,
  plain: boolean,
): RawField {
  if (raw === "") return EMPTY_FIELD;
  if (raw === '""') return NULL_FIELD;

  const value = trim ? raw.trim() : raw;
  if (plain) {
    // One repetition of one component of one subcomponent: the tree the splits below build for
    // a value with no separator in it, without searching it three times.
    const component = hasEscape ? buildComponent(value, enc) : { subcomponents: [value] };
    return { repetitions: [{ components: [component] }], isNull: false };
  }
  const repetitions: (string | RawRepetition)[] = splitOn(value, enc.repetition);
  for (let rIdx = 0; rIdx < repetitions.length; rIdx++) {
    repetitions[rIdx] = buildRepetition(repetitions[rIdx] as string, enc, hasEscape);
  }
  return { repetitions: repetitions as RawRepetition[], isNull: false };
}

/** @internal */
function buildRepetition(raw: string, enc: EncodingCharacters, hasEscape: boolean): RawRepetition {
  const components: (string | RawComponent)[] = splitOn(raw, enc.component);
  for (let cIdx = 0; cIdx < components.length; cIdx++) {
    const component = components[cIdx] as string;
    components[cIdx] = hasEscape
      ? buildComponent(component, enc)
      : { subcomponents: splitOn(component, enc.subcomponent) };
  }
  return { components: components as RawComponent[] };
}

/**
 * Build a single component of a segment that holds the escape character into
 * its subcomponents, running each subcomponent string through `unescape` so the raw tree stores DECODED
 * values (inverse of `reescape` at emit time). This is load-bearing for
 * structural round-trip equivalence: without it, the raw tree would
 * store literal `\F\` / `\E\` / `\.br\` sequences and emit would double-
 * escape them into `\E\F\E\` / etc.
 *
 * @internal
 */
function buildComponent(raw: string, enc: EncodingCharacters): RawComponent {
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
    const decodedSub = unescape(sub, enc, ignore, NO_POSITION);
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
