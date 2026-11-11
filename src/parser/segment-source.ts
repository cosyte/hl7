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
