/**
 * The text of a scanned message and the means to build any one of its segments: what a parsed
 * message keeps so a segment's tree can be built when something first reads it, rather than
 * every segment's at once.
 *
 * It holds the normalized text, one `Uint32Array` of segment offsets from the scanner, the
 * encoding characters, whether fields are trimmed, and which fields were altered on the way in.
 * A segment is built from its own text by the same build every parse uses, marked as the parse
 * would have marked it, and only then cached, so no reader ever sees a segment half built. The
 * build reports nothing and calls no caller code (the scanner reported every finding at parse
 * time), so a read that happens while another segment is being built cannot reach this source.
 *
 * Each parse makes its own source. Nothing in it is shared with another message except the frozen
 * empty and null field nodes every parse shares.
 *
 * @internal
 */

import { HOLDS_ESCAPE } from "./scan.js";
import { buildSegment } from "./tokenize.js";
import { markAlteredFields } from "./wire-fidelity.js";
import type { EncodingCharacters, RawField, RawSegment } from "./types.js";

/**
 * A scanned message's segments, each built on first request and then kept.
 *
 * @internal
 */
export class SegmentSource {
  /** Each segment once built, by its index in the text. */
  private readonly built: (RawSegment | undefined)[];
  /** The shared `fields[0]` placeholder of each segment name, for this message alone. */
  private readonly placeholders = new Map<string, RawField>();
  /**
   * What `textAsWritten` reads the encoding characters as: worked out on its first call, then
   * kept; `null` when no segment can be written from its text.
   */
  private codes: WriteCodes | null | undefined;

  /**
   * @param text The normalized text the scanner read.
   * @param table The scanner's table: segment `i` runs from `table[2 * i]` to
   *   `table[2 * i + 2] - 1`, and `table[2 * i + 1]` is its scan flags.
   * @param count How many segments the text holds.
   * @param enc The message's encoding characters.
   * @param trimmed The fields the scanner reported as trimmed, by segment index.
   * @param framing The fields a framing byte was removed from, by segment index.
   */
  public constructor(
    private readonly text: string,
    private readonly table: Uint32Array,
    count: number,
    private readonly enc: EncodingCharacters,
    private readonly trimmed: readonly (readonly number[] | undefined)[],
    private readonly framing: readonly (readonly number[] | undefined)[],
  ) {
    this.built = new Array<RawSegment | undefined>(count);
  }

  /** Whether segment `index` has been built. */
  public has(index: number): boolean {
    return this.built[index] !== undefined;
  }

  /** Segment `index`'s tree, built the first time it is asked for and the same object after. */
  public segment(index: number): RawSegment {
    const cached = this.built[index];
    if (cached !== undefined) return cached;
    const table = this.table;
    const start = table[2 * index] as number;
    const end = (table[2 * index + 2] as number) - 1;
    const trimmed = this.trimmed[index];
    const segment = buildSegment(
      this.text.slice(start, end),
      this.enc,
      this.placeholders,
      trimmed,
      table[2 * index + 1] as number,
    );
    markAltered(segment, trimmed, this.framing[index]);
    this.built[index] = segment;
    return segment;
  }

  /**
   * Segment `index`'s own text, when it has not been built and writing its tree with `enc` would
   * give that same text back; `undefined` otherwise, and the caller writes the built tree. So a
   * message written out before anything reads a segment writes that segment without building it.
   *
   * It answers only when it is sure: never for a segment already built (its tree is what a caller
   * may have changed), one that holds the escape character, had a field trimmed or a framing byte
   * removed, or is written with encoding characters other than the ones it was read with. The text
   * itself must hold nothing the writer changes (see `writesAsRead`).
   */
  public textAsWritten(index: number, enc: EncodingCharacters): string | undefined {
    if (enc !== this.enc || this.built[index] !== undefined) return undefined;
    if (this.trimmed[index] !== undefined || this.framing[index] !== undefined) return undefined;
    const table = this.table;
    if (((table[2 * index + 1] as number) & HOLDS_ESCAPE) !== 0) return undefined;
    this.codes ??= writeCodes(enc) ?? null;
    if (this.codes === null) return undefined;
    const start = table[2 * index] as number;
    const end = (table[2 * index + 2] as number) - 1;
    return writesAsRead(this.text, start, end, this.codes)
      ? this.text.slice(start, end)
      : undefined;
  }
}

/** The codes of the characters the writer treats specially, as `writesAsRead` reads them. */
interface WriteCodes {
  readonly field: number;
  readonly component: number;
  readonly repetition: number;
  readonly subcomponent: number;
  /** The truncation character's code, or `NaN` when the message declares none: equal to no code. */
  readonly truncation: number;
}

/**
 * The codes `writesAsRead` reads for `enc`, or `undefined` when a delimiter it reads is more than
 * one UTF-16 code unit (MSH-2 can name a character outside the Basic Multilingual Plane), so no
 * segment is written from its text. MSH-1 is always one code unit, and the parser has already
 * refused encoding characters that repeat.
 */
function writeCodes(enc: EncodingCharacters): WriteCodes | undefined {
  const read = enc.component + enc.repetition + enc.subcomponent + (enc.truncation ?? "");
  if (read.length !== (enc.truncation === undefined ? 3 : 4)) return undefined;
  return {
    field: enc.field.charCodeAt(0),
    component: read.charCodeAt(0),
    repetition: read.charCodeAt(1),
    subcomponent: read.charCodeAt(2),
    truncation: read.charCodeAt(3),
  };
}

/**
 * Whether the segment that runs from `start` to `end` of `text`, holding no escape character, is
 * written back exactly as it reads. The writer joins a tree's values with the delimiters, drops
 * the empty subcomponents and components at the end of a component and a repetition, escapes the
 * delimiters and the truncation character held in a value (and a line feed, which the text never
 * holds: the parser reads every line ending as a segment's end), and writes a segment whose field
 * region is one empty field (`PID|`) as its name alone. So the text is written as it reads unless
 * it holds a component separator before a field or repetition separator or its end, a
 * subcomponent separator before any of those or a component separator, or a truncation character,
 * or is a name and one field separator.
 */
function writesAsRead(text: string, start: number, end: number, codes: WriteCodes): boolean {
  const { field, component, repetition, subcomponent, truncation } = codes;
  let separators = 0;
  // Stryker disable next-line EqualityOperator: one step past the end reads the segment's CR, or past the text, which is no delimiter
  for (let i = start; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === field) {
      separators++;
      continue;
    }
    if (code === truncation) return false;
    if (code !== component && code !== subcomponent) continue;
    // The end of the segment ends a field, as a field separator does.
    const next = i + 1 < end ? text.charCodeAt(i + 1) : field;
    if (next === field || next === repetition) return false;
    if (code === subcomponent && next === component) return false;
  }
  return !(separators === 1 && text.charCodeAt(end - 1) === field);
}

/**
 * Mark, on a segment just built and not yet seen by anything else, the fields the parser altered
 * on the way in: those trimmed, and those a framing byte was removed from.
 *
 * @example
 * ```ts
 * markAltered(segment, [11], undefined);
 * ```
 *
 * @internal
 */
export function markAltered(
  segment: RawSegment,
  trimmed: readonly number[] | undefined,
  framing: readonly number[] | undefined,
): void {
  if (trimmed !== undefined) markAlteredFields(segment, trimmed);
  if (framing !== undefined) markAlteredFields(segment, framing);
}

/**
 * A segment of a lazily parsed message that has not been read yet: its name, known from the scan,
 * and where to build it from. It stands in a message's own list of segments until something reads
 * the segment, and never reaches a caller: `Hl7Message.rawSegments` and `Segment.raw` hand out the
 * built segment instead. Reading `fields` builds the segment (once, through the source's cache), so
 * code that treats it as the segment it stands for still reads the right tree.
 *
 * @internal
 */
export class PendingSegment implements RawSegment {
  /** The segment's name, from the scan. */
  public readonly name: string;
  /** The message's segment source. Private, so enumerating this entry never reaches the text. */
  readonly #source: SegmentSource;
  /** The segment's index in the source. */
  readonly #index: number;

  /**
   * @param name The segment's name, from the scan.
   * @param source The message's segment source.
   * @param index The segment's index in the source.
   */
  public constructor(name: string, source: SegmentSource, index: number) {
    this.name = name;
    this.#source = source;
    this.#index = index;
  }

  /** The built segment's fields. */
  public get fields(): readonly RawField[] {
    return this.resolve().fields;
  }

  /** Whether the segment this entry stands for has been built. */
  public get built(): boolean {
    return this.#source.has(this.#index);
  }

  /** The built segment this entry stands for: the same object on every call. */
  public resolve(): RawSegment {
    return this.#source.segment(this.#index);
  }

  /**
   * The segment's own text, when it has not been built and writing it with `enc` would give that
   * text back, so it can be written without building it; `undefined` otherwise. An `MSH` segment
   * is always built: its first two fields are written from the encoding characters.
   */
  public textAsWritten(enc: EncodingCharacters): string | undefined {
    return this.name === "MSH" ? undefined : this.#source.textAsWritten(this.#index, enc);
  }
}

/**
 * `segment` itself, or the built segment it stands for when it is a pending one.
 *
 * @example
 * ```ts
 * const raw = resolveSegment(entry); // a plain RawSegment
 * ```
 *
 * @internal
 */
export function resolveSegment(segment: RawSegment): RawSegment {
  return segment instanceof PendingSegment ? segment.resolve() : segment;
}
