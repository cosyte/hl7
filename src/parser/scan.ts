/**
 * The scanner: one pass over a normalized message that finds every segment and field boundary and
 * every finding the tree build would report (a trimmed field, an unknown or unterminated escape),
 * without building the tree. The parser runs it before it builds anything, so every warning is
 * reported at parse time whether the tree is then built at once or one segment at a time.
 *
 * It reads the text in place: a field is a range of the text, and a field becomes a string only
 * when it has to be looked at more closely (whitespace at an end, or an escape character inside).
 * Every search for the next separator or escape character is remembered, so the whole scan reads
 * each character a bounded number of times however the message is shaped.
 *
 * It works one segment at a time (`Scanner.segment`), so a reader that receives a message in pieces
 * can hand it each segment as it arrives and get the same findings in the same order.
 *
 * @internal
 */

import { unescape } from "./escapes.js";
import { fieldWhitespaceTrimmed } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { EncodingCharacters } from "./types.js";

/**
 * Where the scanner reports what it finds.
 *
 * @internal
 */
export interface ScanSink {
  /** Each warning, in the order a build of the whole tree reports them. */
  readonly warn: (warning: Hl7ParseWarning) => void;
  /**
   * A field whose whitespace was trimmed, as its index in `RawSegment.fields`. Called just before
   * that field's warning is reported, so a warning handler cannot change what is recorded.
   */
  readonly trimmed: (segmentIndex: number, rawFieldIndex: number) => void;
}

/**
 * What a scan of a whole message found: where each segment starts, and each segment's name.
 *
 * @internal
 */
export interface ScannedMessage {
  /**
   * The start of every segment in the text, then one more entry: the end of the last segment plus
   * one. Segment `i` is the text from `offsets[i]` to `offsets[i + 1] - 1`, its terminating `\r`
   * excluded.
   */
  readonly offsets: Uint32Array;
  /** Each segment's name, as the text before its first field separator. */
  readonly names: readonly string[];
}

/** Segment names kept for reuse, so a hundred OBX lines share one name string. */
const NAME_CACHE_LIMIT = 32;

/**
 * Whether a character could be whitespace that `String.prototype.trim` removes. Every such
 * character is at most U+0020 or at least U+00A0, so anything between is never whitespace; a
 * character that might be is checked by `trim` itself.
 */
function mayBeWhitespace(code: number): boolean {
  return code <= 0x20 || code >= 0xa0;
}

/**
 * `text` split on `separator`, as `String.prototype.split` returns it. A text without the separator
 * is an array of itself alone, which is what `split` returns too; most values hold no separator,
 * and `split` costs several times what `includes` and an array literal cost together.
 *
 * @internal
 */
export function splitOn(text: string, separator: string): string[] {
  // Stryker disable next-line ConditionalExpression: split returns the same one-entry array; the test only spares its cost
  return text.includes(separator) ? text.split(separator) : [text];
}

/**
 * The escape findings in one field's value, after trimming: each subcomponent that holds the
 * escape character is decoded only for its warnings, with the position a tree build gives it.
 */
function scanEscapes(
  value: string,
  enc: EncodingCharacters,
  warn: (warning: Hl7ParseWarning) => void,
  segmentIndex: number,
  fieldIndex: number,
): void {
  const repetitions = splitOn(value, enc.repetition);
  for (let r = 0; r < repetitions.length; r++) {
    const components = splitOn(repetitions[r] as string, enc.component);
    for (let c = 0; c < components.length; c++) {
      const subcomponents = splitOn(components[c] as string, enc.subcomponent);
      for (let s = 0; s < subcomponents.length; s++) {
        const sub = subcomponents[s] as string;
        if (!sub.includes(enc.escape)) continue;
        unescape(sub, enc, warn, {
          segmentIndex,
          fieldIndex,
          repetitionIndex: r + 1,
          componentIndex: c + 1,
          subcomponentIndex: s + 1,
        });
      }
    }
  }
}

/**
 * Scans the segments of one text. A new scanner is cheap; keep one for a whole message so its
 * remembered searches carry from one segment to the next.
 *
 * @internal
 */
export class Scanner {
  /** The next field separator at or after the last search, or the text's length. */
  private separatorAt = -1;
  /** The next escape character at or after the last search, or the text's length. */
  private escapeAt = -1;
  /** Names seen so far, reused rather than sliced again. */
  private readonly names: string[] = [];

  /**
   * @param text The normalized text, or one segment of it.
   * @param enc The message's encoding characters.
   * @param trimFields Whether field values are trimmed (and so reported when trimmed).
   * @param sink Where each finding goes.
   */
  public constructor(
    private readonly text: string,
    private readonly enc: EncodingCharacters,
    private readonly trimFields: boolean,
    private readonly sink: ScanSink,
  ) {}

  /** The first field separator at or after `from`, or the text's length when there is none. */
  private nextSeparator(from: number): number {
    if (this.separatorAt < from) {
      const at = this.text.indexOf(this.enc.field, from);
      this.separatorAt = at === -1 ? this.text.length : at;
    }
    return this.separatorAt;
  }

  /** The first escape character at or after `from`, or the text's length when there is none. */
  private nextEscape(from: number): number {
    if (this.escapeAt < from) {
      const at = this.text.indexOf(this.enc.escape, from);
      this.escapeAt = at === -1 ? this.text.length : at;
    }
    return this.escapeAt;
  }

  /** The text from `start` to `end` as a segment name, reusing one already seen. */
  private name(start: number, end: number): string {
    const length = end - start;
    for (const known of this.names) {
      if (known.length === length && this.text.startsWith(known, start)) return known;
    }
    const name = this.text.slice(start, end);
    if (this.names.length < NAME_CACHE_LIMIT) this.names.push(name);
    return name;
  }

  /**
   * Scan the segment that runs from `start` to `end` (its terminator excluded), as segment
   * `segmentIndex` of the message, and return its name. MSH-2 is the encoding characters and is
   * never trimmed or unescaped, so an MSH segment's findings start at MSH-3.
   */
  public segment(start: number, end: number, segmentIndex: number): string {
    const firstSeparator = this.nextSeparator(start);
    if (firstSeparator >= end) return this.name(start, end);
    const name = this.name(start, firstSeparator);
    const isMsh = name === "MSH";
    let fieldStart = firstSeparator + 1;
    for (let rawFieldIndex = 1; ; rawFieldIndex++) {
      const fieldEnd = Math.min(this.nextSeparator(fieldStart), end);
      if (!isMsh) {
        this.field(fieldStart, fieldEnd, segmentIndex, rawFieldIndex, rawFieldIndex);
      } else if (rawFieldIndex > 1) {
        // Warnings number MSH fields as HL7 does (MSH-3 is 3); the tree holds MSH-1 at index 0.
        this.field(fieldStart, fieldEnd, segmentIndex, rawFieldIndex + 1, rawFieldIndex);
      }
      if (fieldEnd === end) return name;
      fieldStart = fieldEnd + 1;
    }
  }

  /**
   * Scan one field, the text from `start` to `end`: its trim finding first, then its escape
   * findings, as a tree build reports them. An empty field and an explicit null (`""`) have none.
   */
  private field(
    start: number,
    end: number,
    segmentIndex: number,
    fieldIndex: number,
    rawFieldIndex: number,
  ): void {
    const text = this.text;
    if (start === end) return;
    if (end - start === 2 && text.startsWith('""', start)) return;

    let value: string | undefined;
    if (
      this.trimFields &&
      (mayBeWhitespace(text.charCodeAt(start)) || mayBeWhitespace(text.charCodeAt(end - 1)))
    ) {
      const raw = text.slice(start, end);
      const trimmed = raw.trim();
      if (trimmed.length > 0 && trimmed !== raw) {
        const trimStart = raw.length - raw.trimStart().length;
        const trimEnd = raw.length - raw.trimEnd().length;
        this.sink.trimmed(segmentIndex, rawFieldIndex);
        this.sink.warn(fieldWhitespaceTrimmed({ segmentIndex, fieldIndex }, trimStart, trimEnd));
        value = trimmed;
      }
    }
    if (value === undefined) {
      if (this.nextEscape(start) >= end) return;
      value = text.slice(start, end);
    } else if (!value.includes(this.enc.escape)) {
      return;
    }
    scanEscapes(value, this.enc, this.sink.warn, segmentIndex, fieldIndex);
  }
}

/**
 * Scan a whole normalized message (line endings already `\r`): every segment's boundaries and
 * name, and every finding, reported to `sink` in order. One trailing `\r` ends the last segment
 * rather than starting an empty one; an empty segment in the middle (`\r\r`) is kept, so segment
 * indices match the text. The text must hold at least one segment: `"\r"` alone holds none.
 *
 * @example
 * ```ts
 * const { offsets, names } = scanMessage("MSH|^~\\&|A\rPID|1\r", enc, true, sink);
 * // names: ["MSH", "PID"]; offsets: [0, 11, 17]
 * ```
 *
 * @internal
 */
export function scanMessage(
  text: string,
  enc: EncodingCharacters,
  trimFields: boolean,
  sink: ScanSink,
): ScannedMessage {
  const scanner = new Scanner(text, enc, trimFields, sink);
  const textEnd = text.endsWith("\r") ? text.length - 1 : text.length;
  const names: string[] = [];
  let offsets = new Uint32Array(64);
  let start = 0;
  for (;;) {
    if (names.length + 1 >= offsets.length) {
      const grown = new Uint32Array(offsets.length * 2);
      grown.set(offsets);
      offsets = grown;
    }
    offsets[names.length] = start;
    const terminator = text.indexOf("\r", start);
    const end = terminator === -1 || terminator > textEnd ? textEnd : terminator;
    names.push(scanner.segment(start, end, names.length));
    start = end + 1;
    if (end === textEnd) break;
  }
  offsets[names.length] = start;
  return { offsets: offsets.slice(0, names.length + 1), names };
}
