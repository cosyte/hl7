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
   * @param offsets The scanner's offsets: segment `i` runs from `offsets[i]` to `offsets[i + 1] - 1`.
   * @param enc The message's encoding characters.
   * @param trimFields Whether field values are trimmed.
   * @param altered The fields altered on the way in, by segment index.
   */
  public constructor(
    private readonly text: string,
    private readonly offsets: Uint32Array,
    private readonly enc: EncodingCharacters,
    private readonly trimFields: boolean,
    private readonly altered: ReadonlyMap<number, readonly number[]>,
  ) {
    this.built = new Array<RawSegment | undefined>(offsets.length - 1);
  }

  /** Segment `index`'s tree, built the first time it is asked for and the same object after. */
  public segment(index: number): RawSegment {
    const cached = this.built[index];
    if (cached !== undefined) return cached;
    const start = this.offsets[index] as number;
    const end = (this.offsets[index + 1] as number) - 1;
    const segment = buildSegment(
      this.text.slice(start, end),
      this.enc,
      this.trimFields,
      this.placeholders,
    );
    const altered = this.altered.get(index);
    if (altered !== undefined) markAlteredFields(segment, altered);
    this.built[index] = segment;
    return segment;
  }
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
  /**
   * @param name The segment's name, from the scan.
   * @param source The message's segment source.
   * @param index The segment's index in the source.
   */
  public constructor(
    public readonly name: string,
    private readonly source: SegmentSource,
    private readonly index: number,
  ) {}

  /** The built segment's fields. */
  public get fields(): readonly RawField[] {
    return this.resolve().fields;
  }

  /** The built segment this entry stands for: the same object on every call. */
  public resolve(): RawSegment {
    return this.source.segment(this.index);
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
