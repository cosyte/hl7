import type {
  EncodingCharacters,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "@cosyte/hl7";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

/**
 * The characters a generated value is drawn from: letters, digits, an inner space, every
 * character a delimiter can be (so a value has to be escaped), the line break and carriage
 * return (written `\.br\` and `\X0D\`), the double quote and a few characters outside ASCII.
 * Random by design: nothing here looks like a name, a date or an identifier.
 *
 * @internal
 */
const VALUE_UNITS: readonly string[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  ..."      ",
  ..."|^~\\&#!$%*+/:;<=>?@[]{}`'",
  ...'"._-,',
  "\n",
  "\r",
  "é",
  "ß",
  "Ω",
  "漢",
  "😀",
];

/** Options for {@link value}. */
export interface ValueOptions {
  /** The shortest value, at least 1. Defaults to 1. */
  readonly minLength?: number;
  /** The longest value, in characters. Defaults to 12. */
  readonly maxLength?: number;
}

/**
 * Generate one decoded value, the text of a subcomponent as a reader sees it: never empty, never
 * the explicit null `""`, and never starting or ending with a space, so the parser has nothing
 * to trim. It mixes in the delimiters, the line break and the carriage return, so writing it
 * needs escape sequences.
 *
 * @param options Its length bounds.
 * @returns An arbitrary of the value.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { value } from "@cosyte/hl7/arbitraries";
 *
 * const [text] = fc.sample(value({ maxLength: 4 }), 1);
 * // text is up to four characters, such as "a|Z" or "Q"
 * ```
 */
export function value(options: ValueOptions = {}): Arbitrary<string> {
  const minLength = Math.max(1, options.minLength ?? 1);
  const maxLength = Math.max(minLength, options.maxLength ?? 12);
  return fc
    .array(fc.constantFrom(...VALUE_UNITS), { minLength, maxLength })
    .map((units) => units.join(""))
    .filter(isCleanValue);
}

/**
 * Whether a decoded value is one the parser reads back unchanged: not the explicit null `""`, and
 * no space at either end once any line break or carriage return there is set aside (those are
 * written as escape sequences, so the parser never sees them as whitespace to trim).
 *
 * @internal
 */
export function isCleanValue(text: string): boolean {
  if (text === '""') return false;
  const inner = text.replace(/^[\n\r]+|[\n\r]+$/gu, "");
  return inner.trim() === inner;
}

/** The shape options every level of the tree takes. */
export interface TreeOptions {
  /** The most subcomponents in a component. Defaults to 3. */
  readonly maxSubcomponents?: number;
  /** The most components in a repetition. Defaults to 4. */
  readonly maxComponents?: number;
  /** The most repetitions in a field. Defaults to 3. */
  readonly maxRepetitions?: number;
  /** Whether a field may be the explicit null `""`. Defaults to `true`. */
  readonly nullable?: boolean;
  /** The decoded values at the leaves. Defaults to {@link value}. */
  readonly values?: Arbitrary<string>;
}

/**
 * A field as nested arrays of leaves (repetitions, components, subcomponents), before the leaves
 * are decoded values or wire text.
 *
 * @internal
 */
export interface FieldShape<T> {
  readonly isNull: boolean;
  readonly repetitions: readonly (readonly (readonly T[])[])[];
}

/**
 * A list that may hold empty items anywhere but at its end. A trailing empty item is the one
 * thing the serializer drops (it writes `a^b`, never `a^b^`), so ending every list on a non-empty
 * item keeps a generated tree exactly what parsing its serialized form gives back.
 *
 * @internal
 */
export function endingNonEmpty<T>(
  item: Arbitrary<T>,
  empty: () => T,
  maxLength: number,
): Arbitrary<T[]> {
  const head = fc.oneof(
    { weight: 3, arbitrary: item },
    { weight: 1, arbitrary: fc.constant(null).map(empty) },
  );
  return fc
    .tuple(fc.array(head, { maxLength: Math.max(0, maxLength - 1) }), item)
    .map(([init, last]) => [...init, last]);
}

/**
 * The shape of one non-null field over any leaf.
 *
 * @internal
 */
export function fieldShape<T>(
  leaf: Arbitrary<T>,
  emptyLeaf: () => T,
  options: TreeOptions,
): Arbitrary<FieldShape<T>> {
  const subs = endingNonEmpty(leaf, emptyLeaf, options.maxSubcomponents ?? 3);
  const comps = endingNonEmpty(subs, () => [emptyLeaf()], options.maxComponents ?? 4);
  const reps = endingNonEmpty(comps, () => [[emptyLeaf()]], options.maxRepetitions ?? 3);
  const content = reps.map((repetitions): FieldShape<T> => ({ isNull: false, repetitions }));
  if (options.nullable === false) return content;
  return fc.oneof(
    { weight: 9, arbitrary: content },
    { weight: 1, arbitrary: fc.constant(null).map(() => ({ isNull: true, repetitions: [] })) },
  );
}

/**
 * Turn a field shape over decoded values into the raw tree the parser builds.
 *
 * @internal
 */
function toRawField(shape: FieldShape<string>): RawField {
  return {
    isNull: shape.isNull,
    repetitions: shape.repetitions.map((components): RawRepetition => ({
      components: components.map((subcomponents): RawComponent => ({
        subcomponents: [...subcomponents],
      })),
    })),
  };
}

/**
 * Generate one component: a list of decoded subcomponents, ending on a non-empty one, with empty
 * subcomponents allowed before it.
 *
 * @param options The tree's bounds and its leaf values.
 * @returns An arbitrary of a {@link RawComponent}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { component } from "@cosyte/hl7/arbitraries";
 *
 * const [comp] = fc.sample(component({ maxSubcomponents: 2 }), 1);
 * // comp is like { subcomponents: ["", "x&y"] }
 * ```
 */
export function component(options: TreeOptions = {}): Arbitrary<RawComponent> {
  return endingNonEmpty(options.values ?? value(), () => "", options.maxSubcomponents ?? 3).map(
    (subcomponents) => ({ subcomponents }),
  );
}

/**
 * Generate one repetition: a list of components ending on a non-empty one.
 *
 * @param options The tree's bounds and its leaf values.
 * @returns An arbitrary of a {@link RawRepetition}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { repetition } from "@cosyte/hl7/arbitraries";
 *
 * const [rep] = fc.sample(repetition(), 1);
 * // rep is like { components: [{ subcomponents: ["A1"] }, { subcomponents: ["b"] }] }
 * ```
 */
export function repetition(options: TreeOptions = {}): Arbitrary<RawRepetition> {
  return field({ ...options, maxRepetitions: 1, nullable: false }).map(
    (f) => f.repetitions[0] as RawRepetition,
  );
}

/**
 * Generate one field in the shape the parser builds: repetitions of components of decoded
 * subcomponents, with empty items allowed anywhere but at the end of each list, or, about one
 * time in ten unless `nullable` is `false`, the explicit null `""`.
 *
 * @param options The tree's bounds and its leaf values.
 * @returns An arbitrary of a {@link RawField}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { buildMessage } from "@cosyte/hl7";
 * import { field } from "@cosyte/hl7/arbitraries";
 *
 * const [f] = fc.sample(field({ nullable: false }), 1);
 * const msg = buildMessage({ type: "ADT^A01", controlId: "CTRL1" });
 * msg.addSegment("ZXX", [f]);
 * ```
 */
export function field(options: TreeOptions = {}): Arbitrary<RawField> {
  return fieldShape(options.values ?? value(), () => "", options).map(toRawField);
}

/**
 * The non-MSH segments a generated segment is named from by default: common segments of the
 * message types {@link messageType} generates, and the notes segment.
 *
 * @internal
 */
export const BODY_SEGMENT_NAMES: readonly string[] = [
  "EVN",
  "PID",
  "PD1",
  "PV1",
  "PV2",
  "NK1",
  "AL1",
  "DG1",
  "IN1",
  "ORC",
  "OBR",
  "OBX",
  "NTE",
  "SPM",
  "TXA",
  "FT1",
  "RXA",
  "RXE",
  "SCH",
  "AIS",
];

/** Options for {@link segment}. */
export interface SegmentOptions extends TreeOptions {
  /**
   * The names to draw from. Defaults to common segments and site-defined `Z` segments. A name
   * is three characters; `MSH` and the batch envelope segments are not body segments.
   */
  readonly names?: readonly string[];
  /** The most fields after the name. Defaults to 8. */
  readonly maxFields?: number;
}

/**
 * A segment name: a common one, or a site-defined `Z` segment.
 *
 * @internal
 */
export function segmentName(names: readonly string[] | undefined): Arbitrary<string> {
  if (names !== undefined) return fc.constantFrom(...names);
  const z = fc
    .tuple(
      fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
      fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    )
    .map(([a, b]) => `Z${a}${b}`);
  return fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...BODY_SEGMENT_NAMES) },
    { weight: 1, arbitrary: z },
  );
}

/**
 * The slot at `fields[0]` of a non-MSH segment: the segment's name, as the parser fills it.
 *
 * @internal
 */
export function nameSlot(name: string): RawField {
  return { isNull: false, repetitions: [{ components: [{ subcomponents: [name] }] }] };
}

/**
 * Generate one non-MSH segment in the shape the parser builds: `fields[0]` holds the name, and
 * fields 1 and up are generated fields, ending on a non-empty one.
 *
 * @param options The names, the field count and the tree's bounds.
 * @returns An arbitrary of a {@link RawSegment}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { segment } from "@cosyte/hl7/arbitraries";
 *
 * const [seg] = fc.sample(segment({ names: ["NTE"], maxFields: 3 }), 1);
 * seg?.name; // "NTE"
 * ```
 */
export function segment(options: SegmentOptions = {}): Arbitrary<RawSegment> {
  const fields = endingNonEmpty(
    field(options),
    (): RawField => ({ isNull: false, repetitions: [] }),
    options.maxFields ?? 8,
  );
  return fc
    .tuple(segmentName(options.names), fields)
    .map(([name, fs]) => ({ name, fields: [nameSlot(name), ...fs] }));
}

/**
 * Write a decoded value in wire form: each delimiter as its escape sequence, a line break as
 * `\.br\`, a carriage return as `\X0D\`. Written here, apart from the library's serializer, so a
 * generated message is not the serializer's own output.
 *
 * @internal
 */
export function escapeValue(text: string, enc: EncodingCharacters): string {
  let out = "";
  for (const ch of text) {
    const e = enc.escape;
    if (ch === e) out += `${e}E${e}`;
    else if (ch === enc.field) out += `${e}F${e}`;
    else if (ch === enc.component) out += `${e}S${e}`;
    else if (ch === enc.subcomponent) out += `${e}T${e}`;
    else if (ch === enc.repetition) out += `${e}R${e}`;
    else if (ch === enc.truncation) out += `${e}P${e}`;
    else if (ch === "\n") out += `${e}.br${e}`;
    else if (ch === "\r") out += `${e}X0D${e}`;
    else out += ch;
  }
  return out;
}

/**
 * Write a field shape whose leaves are already wire text.
 *
 * @internal
 */
export function writeField(shape: FieldShape<string>, enc: EncodingCharacters): string {
  if (shape.isNull) return '""';
  return shape.repetitions
    .map((comps) => comps.map((subs) => subs.join(enc.subcomponent)).join(enc.component))
    .join(enc.repetition);
}
