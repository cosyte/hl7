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
 * It also notes what lets a build skip work, so the build repeats none of the scan's: whether each
 * segment holds the escape character at all, which of its fields hold no repetition, component or
 * subcomponent separator, and where each field of the segment just scanned starts.
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
 * What a scan of a whole message found: where each segment starts, what the build of each needs
 * to know, and each segment's name.
 *
 * @internal
 */
export interface ScannedMessage {
  /**
   * Two entries per segment, then one more. Entry `2 * i` is where segment `i` starts in the text,
   * and entry `2 * i + 2` is one past its end, so segment `i` is the text from `table[2 * i]` to
   * `table[2 * i + 2] - 1`, its terminating `\r` excluded. Entry `2 * i + 1` is the segment's scan
   * flags (`Scanner.flags`). Entries past `2 * count` are spare room.
   */
  readonly table: Uint32Array;
  /** How many segments the text holds. */
  readonly count: number;
  /** Each segment's name, as the text before its first field separator. */
  readonly names: readonly string[];
}

/** The flag bit set for a segment that holds the escape character anywhere (MSH-2 included). */
export const HOLDS_ESCAPE = 0x80000000;

/** The highest field index a plain-field bit is kept for (bits 0 to 30 are fields 1 to 31). */
export const PLAIN_FIELD_LIMIT = 31;

/** Segment names kept for reuse, so a hundred OBX lines share one name string. */
const NAME_CACHE_LIMIT = 32;

/**
 * How far the scanner reads a field one character at a time before it searches for its end with
 * `indexOf`. Most fields are a few characters long, and a call to `indexOf` costs more than reading
 * them; a long field (a base64 document) is searched natively, so it is not read a character at a
 * time. Any length gives the same boundaries.
 */
const SHORT_FIELD = 32;

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
        // A subcomponent without the escape character decodes to itself and reports nothing.
        unescape(subcomponents[s] as string, enc, warn, {
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
  /** The field separator's character code. */
  private readonly separatorCode: number;
  /** The repetition separator's character code. */
  private readonly repetitionCode: number;
  /** The component separator's character code. */
  private readonly componentCode: number;
  /** The subcomponent separator's character code. */
  private readonly subcomponentCode: number;
  /** Whether the field the last `fieldEnd` call found is known to hold no structure separator. */
  private fieldPlain = false;
  /**
   * What a build of the segment the last `segment` call scanned needs to know, as one 32-bit
   * number (negative when `HOLDS_ESCAPE` is set; a `Uint32Array` stores it unsigned). Bit `n - 1` (for `n` from 1 to `PLAIN_FIELD_LIMIT`) is set when `fields[n]` is short
   * and holds no repetition, component or subcomponent separator, so its tree is one value; a
   * clear bit says nothing. `HOLDS_ESCAPE` is set when the segment holds the escape character
   * anywhere; one that does not cannot hold an escape sequence, so a build need not look for one.
   */
  public flags = 0;
  /**
   * Where each field of the segment the last `segment` call scanned starts, the name first, then
   * one more entry: one past the segment's end. Field `k` is the text from `fieldStarts[k]` to
   * `fieldStarts[k + 1] - 1`. Reused from segment to segment; entries past `fieldCount` are stale.
   */
  public readonly fieldStarts: number[] = [];
  /** How many fields (the name included) the segment the last `segment` call scanned holds. */
  public fieldCount = 0;

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
  ) {
    this.separatorCode = enc.field.charCodeAt(0);
    this.repetitionCode = enc.repetition.charCodeAt(0);
    this.componentCode = enc.component.charCodeAt(0);
    this.subcomponentCode = enc.subcomponent.charCodeAt(0);
  }

  /** The first field separator at or after `from`, or the text's length when there is none. */
  private nextSeparator(from: number): number {
    if (this.separatorAt < from) {
      const at = this.text.indexOf(this.enc.field, from);
      this.separatorAt = at === -1 ? this.text.length : at;
    }
    return this.separatorAt;
  }

  /**
   * The end of the field that starts at `from` in a segment that ends at `end`: the first field
   * separator at or after `from`, or `end` when there is none before it. A short field is read one
   * character at a time, which also tells whether it holds a structure separator (`fieldPlain`).
   */
  private fieldEnd(from: number, end: number): number {
    const text = this.text;
    const limit = Math.min(end, from + SHORT_FIELD);
    let plain = true;
    for (let i = from; i < limit; i++) {
      const code = text.charCodeAt(i);
      if (code === this.separatorCode) {
        this.fieldPlain = plain;
        return i;
      }
      if (
        code === this.repetitionCode ||
        code === this.componentCode ||
        code === this.subcomponentCode
      ) {
        plain = false;
      }
    }
    this.fieldPlain = plain && limit === end;
    if (limit === end) return end;
    return Math.min(this.nextSeparator(limit), end);
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
    // An indexed loop: `for...of` makes an iterator and a result object per step until the
    // function is optimized, and this runs once per segment.
    for (let i = 0; i < this.names.length; i++) {
      const known = this.names[i] as string;
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
    // Asked before the fields are scanned: the remembered search only moves forward.
    let flags = this.nextEscape(start) < end ? HOLDS_ESCAPE : 0;
    const fieldStarts = this.fieldStarts;
    fieldStarts[0] = start;
    const firstSeparator = this.fieldEnd(start, end);
    if (firstSeparator === end) {
      fieldStarts[1] = end + 1;
      this.fieldCount = 1;
      this.flags = flags;
      return this.name(start, end);
    }
    const name = this.name(start, firstSeparator);
    const isMsh = name === "MSH";
    let fieldStart = firstSeparator + 1;
    for (let rawFieldIndex = 1; ; rawFieldIndex++) {
      fieldStarts[rawFieldIndex] = fieldStart;
      const fieldEnd = this.fieldEnd(fieldStart, end);
      if (this.fieldPlain && rawFieldIndex <= PLAIN_FIELD_LIMIT) flags |= 1 << (rawFieldIndex - 1);
      if (!isMsh) {
        this.field(fieldStart, fieldEnd, segmentIndex, rawFieldIndex, rawFieldIndex);
      } else if (rawFieldIndex > 1) {
        // Warnings number MSH fields as HL7 does (MSH-3 is 3); the tree holds MSH-1 at index 0.
        this.field(fieldStart, fieldEnd, segmentIndex, rawFieldIndex + 1, rawFieldIndex);
      }
      if (fieldEnd === end) {
        fieldStarts[rawFieldIndex + 1] = end + 1;
        this.fieldCount = rawFieldIndex + 1;
        this.flags = flags;
        return name;
      }
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
    }
    // A trimmed field is decoded for its findings whether or not it holds an escape: trimming is
    // rare, and one without an escape reports nothing.
    scanEscapes(value, this.enc, this.sink.warn, segmentIndex, fieldIndex);
  }
}

/**
 * Scan a whole normalized message (line endings already `\r`): every segment's boundaries and
 * name, and every finding, reported to `sink` in order. One trailing `\r` ends the last segment
 * rather than starting an empty one; an empty segment in the middle (`\r\r`) is kept, so segment
 * indices match the text. The text must hold at least one segment: `"\r"` alone holds none.
 * `onSegment`, when given, is called after each segment is scanned, while the scanner still
 * holds that segment's field boundaries, so a caller can build the segment without searching it
 * again.
 *
 * @example
 * ```ts
 * const { table, count, names } = scanMessage("MSH|^~\\&|A\rPID|1\r", enc, true, sink);
 * // count: 2; names: ["MSH", "PID"]; starts in table[0], table[2]: 0, 11; table[4]: 17
 * ```
 *
 * @internal
 */
export function scanMessage(
  text: string,
  enc: EncodingCharacters,
  trimFields: boolean,
  sink: ScanSink,
  onSegment?: (index: number, scanner: Scanner) => void,
): ScannedMessage {
  const scanner = new Scanner(text, enc, trimFields, sink);
  const textEnd = text.endsWith("\r") ? text.length - 1 : text.length;
  // Where each segment starts, found once, then scanned. The table starts at 16 entries, 64
  // bytes, the most V8 keeps inside the heap without a separate buffer, which a short message
  // never outgrows; a longer one grows it by doubling, outside the heap.
  let table = new Uint32Array(16);
  let count = 1;
  for (let at = text.indexOf("\r"); at !== -1 && at < textEnd; at = text.indexOf("\r", at + 1)) {
    if (2 * count + 2 >= table.length) {
      const grown = new Uint32Array(table.length * 2);
      grown.set(table);
      table = grown;
    }
    table[2 * count++] = at + 1;
  }
  table[2 * count] = textEnd + 1;
  const names = new Array<string>(count);
  for (let i = 0; i < count; i++) {
    const start = table[2 * i] as number;
    names[i] = scanner.segment(start, (table[2 * i + 2] as number) - 1, i);
    table[2 * i + 1] = scanner.flags;
    onSegment?.(i, scanner);
  }
  return { table, count, names };
}
