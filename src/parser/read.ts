/**
 * The streaming readers: `readMessages()` reads a batch or a stream of messages and yields each
 * message as soon as it is complete, and `readSegments()` reads one message, however large, and
 * yields each segment as soon as it is complete. Both read a string, a `Uint8Array`, a Node
 * `Readable`, a web `ReadableStream`, or any async or plain iterable of string or byte chunks, and
 * both pull the next chunk only when the caller asks for the next item, so a slow consumer holds
 * the source back rather than letting it pile up.
 *
 * Neither has a grammar of its own. `readMessages()` finds where each message starts and ends and
 * hands those exact bytes to `parseHL7`, so each message is the one `parseHL7` gives for them,
 * warnings and errors included. `readSegments()` runs the same steps `parseHL7` runs on a whole
 * message (decode, framing, line endings, delimiters, the scanner, the build, the segment-name
 * and structure checks) one segment at a time, with the scanner every parse uses.
 *
 * @internal
 */

import { Buffer } from "node:buffer";

import { isBlankLine } from "./blank-line.js";
import { readDelimiters } from "./delimiters.js";
import { FATAL_CODES, Hl7ParseError } from "./errors.js";
import {
  chooseBufferCharset,
  discriminateOptionsOrProfile,
  emitSegmentNameWarning,
  emitStructureWarnings,
  extractMessageType,
  extractMsh18FromTentativeDecode,
  makeEmitter,
  mergeDateFormats,
  parseHL7,
  resolveEffectiveProfile,
} from "./index.js";
import { canonicalSegmentName } from "./known-segments.js";
import { chunkDecoder, normalize } from "./normalize.js";
import type { ChunkDecoder } from "./normalize.js";
import { Scanner } from "./scan.js";
import { markAltered } from "./segment-source.js";
import { buildScannedSegment } from "./tokenize.js";
import type {
  EncodingCharacters,
  Hl7Position,
  ParseOptions,
  Profile,
  RawField,
  RawSegment,
} from "./types.js";
import { mllpFramingStripped, unterminatedStreamMessage } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";

import type { Hl7Message } from "../model/message.js";
import { segmentFieldMap } from "../model/message.js";
import { Segment } from "../model/segment.js";
import type { ProfiledMessage } from "../profiles/typed-fields.js";

/**
 * What `readMessages()` and `readSegments()` read: the whole input as one string or one
 * `Uint8Array` (a Node `Buffer` is one), or its chunks from a web `ReadableStream`, a Node
 * `Readable`, or any async or plain iterable. Chunks are all strings or all bytes. Bytes are read
 * as `parseHL7` reads a `Buffer`: in the character set MSH-18 declares, or `options.charset`.
 *
 * @example
 * ```ts
 * import { createReadStream } from "node:fs";
 * import type { Hl7ReadSource } from "@cosyte/hl7";
 *
 * const fromFile: Hl7ReadSource = createReadStream("feed.hl7");
 * const fromFetch: Hl7ReadSource = (await fetch(url)).body!;
 * const fromText: Hl7ReadSource = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r";
 * ```
 */
export type Hl7ReadSource =
  | string
  | Uint8Array
  | ReadableStream<string | Uint8Array>
  | AsyncIterable<string | Uint8Array>
  | Iterable<string | Uint8Array>;

/**
 * One item `readMessages()` yields: a message, or a message that failed to parse. Both say where
 * the message sits in the source: `byteOffset` and `byteLength` count bytes (of the UTF-8 text,
 * for a string source), `index` counts the items yielded before this one, and `position` is the
 * message's first segment among every segment of the source, blank lines and batch envelope
 * segments included.
 *
 * An `ok` item carries the message `parseHL7` gives for its bytes, built a segment at a time on
 * first read unless `{ lazy: false }` was given. A failed item carries the `Hl7ParseError` that
 * `parseHL7` threw and the message's text in `raw` (bytes for a byte source), so it can be set
 * aside: it may hold patient data.
 *
 * `streamWarnings` is empty but on a last message whose last segment has no terminator, where it
 * holds `UNTERMINATED_STREAM_MESSAGE`: the source may have been cut off.
 *
 * @template M - the message type an `ok` item carries.
 *
 * @example
 * ```ts
 * import { readMessages } from "@cosyte/hl7";
 *
 * for await (const item of readMessages(source)) {
 *   if (item.ok) handle(item.message);
 *   else quarantine(item.raw, item.error.code, item.byteOffset);
 * }
 * ```
 */
export type ReadMessageItem<M extends Hl7Message = Hl7Message> =
  | {
      readonly ok: true;
      readonly message: M;
      readonly index: number;
      readonly byteOffset: number;
      readonly byteLength: number;
      readonly position: Hl7Position;
      readonly streamWarnings: readonly Hl7ParseWarning[];
    }
  | {
      readonly ok: false;
      readonly error: Hl7ParseError;
      readonly raw: string | Uint8Array;
      readonly index: number;
      readonly byteOffset: number;
      readonly byteLength: number;
      readonly position: Hl7Position;
      readonly streamWarnings: readonly Hl7ParseWarning[];
    };

/**
 * One segment `readSegments()` yields: the segment, its index in the message, and the warnings
 * `parseHL7` reports about it, in the order it reports them. The first item also carries the
 * warnings about the message's bytes and framing that `parseHL7` reports before any segment, and
 * the last item the warnings that need the whole message: a segment its structure requires and
 * that never came, and framing bytes first seen after the first segment.
 *
 * @example
 * ```ts
 * import { readSegments } from "@cosyte/hl7";
 *
 * for await (const { segment, warnings } of readSegments(source)) {
 *   if (segment.type === "OBX") store(segment.field(5).value);
 *   for (const w of warnings) log(w.code);
 * }
 * ```
 */
export interface ReadSegmentItem {
  /** The segment, built in full. */
  readonly segment: Segment;
  /** Its index in the message: 0 is MSH. */
  readonly index: number;
  /** The warnings about it, frozen. */
  readonly warnings: readonly Hl7ParseWarning[];
}

const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;
const LF = 0x0a;

/** No warnings: what nearly every item carries. */
const NONE: readonly Hl7ParseWarning[] = Object.freeze([]);

/**
 * How much of a message's head is kept: a strict-mode error's snippet reads the first 80
 * characters, and shows 40 of them and an ellipsis when there are more than 40.
 */
const HEAD = 82;

/**
 * How long the head must be before the first segment is built. Past 41 characters, dropping the
 * one trailing CR an MLLP frame's end removes still leaves more than 40, so the snippet is known.
 */
const SNIPPET_READY = 42;

/** A UTF-8 byte order mark read one byte to one character. */
const LATIN1_BOM = "\u00ef\u00bb\u00bf";

/** The chunks of a source, each a string or a `Uint8Array`, pulled one at a time. */
async function* chunksOf(source: Hl7ReadSource, reader: string): AsyncGenerator<unknown> {
  if (typeof source === "string" || source instanceof Uint8Array) {
    yield source;
    return;
  }
  if (source === null || typeof source !== "object") {
    throw new TypeError(`${reader}: the source must be a string, bytes, a stream or an iterable.`);
  }
  const getReader = (source as { getReader?: unknown }).getReader;
  if (typeof getReader === "function") {
    // A web ReadableStream, read through its own reader, so a stream without async iteration
    // (older Safari, some polyfills) is read too, and one left early is cancelled.
    const streamReader = (source as ReadableStream<unknown>).getReader();
    let done = false;
    try {
      for (;;) {
        const next = await streamReader.read();
        if (next.done) {
          done = true;
          return;
        }
        yield next.value;
      }
    } finally {
      // Left early, or failed: cancel it, which a stream that failed refuses, and let it go.
      if (!done) await streamReader.cancel().catch(() => undefined);
      streamReader.releaseLock();
    }
  }
  if (
    typeof (source as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  ) {
    // A Node Readable is one: leaving the loop early destroys it.
    for await (const chunk of source as AsyncIterable<unknown>) yield chunk;
    return;
  }
  if (typeof (source as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function") {
    for (const chunk of source as Iterable<unknown>) yield chunk;
    return;
  }
  throw new TypeError(`${reader}: the source must be a string, bytes, a stream or an iterable.`);
}

/**
 * The chunks of a source checked to be all strings or all bytes: `"text"` or `"bytes"` from the
 * first chunk on.
 */
class ChunkKind {
  public kind: "text" | "bytes" | undefined;

  public constructor(private readonly reader: string) {}

  /** `chunk` as a string or as bytes, after checking it matches the chunks before it. */
  public check(chunk: unknown): string | Uint8Array {
    const kind =
      typeof chunk === "string" ? "text" : chunk instanceof Uint8Array ? "bytes" : undefined;
    if (kind === undefined) {
      throw new TypeError(
        `${this.reader}: each chunk must be a string or a Uint8Array; ` +
          `received ${chunk === null ? "null" : typeof chunk}.`,
      );
    }
    if (this.kind === undefined) this.kind = kind;
    else if (this.kind !== kind) {
      throw new TypeError(`${this.reader}: the chunks must be all strings or all bytes, not both.`);
    }
    return chunk as string | Uint8Array;
  }
}

/**
 * Splits text that arrives in chunks into lines, each ended by `\r`, `\n` or `\r\n`, the way
 * `normalize` reads them, wherever the chunks are cut. A `\r` that ends a chunk waits for the next
 * one, which may begin with the `\n` of the same `\r\n`; one that ends a line ending in the MLLP
 * end byte (FS) does not, because that line ends a frame, and a live sender sends nothing more
 * until it is answered; for the same reason an LF after that CR is never part of the line. A line
 * is searched once, however many chunks it spans.
 */
class LineSplitter {
  /** The line `next()` last returned, its terminator excluded. */
  public text = "";
  /** That line's terminator: `"\r"`, `"\n"`, `"\r\n"`, or `""` for a last line without one. */
  public term = "";
  private chunk = "";
  private pos = 0;
  /** The next `\r` at or after `pos`; -1 for none in the chunk, -2 before the first search. */
  private crAt = -2;
  /** The next `\n` at or after `pos`, the same way. */
  private lfAt = -2;
  /** The start of a line whose end has not arrived yet, in pieces. */
  private carry: string[] = [];
  /** A line ended by a `\r` at the very end of the last chunk: `\r` or `\r\n`, the next says. */
  private held: string | undefined;
  private ended = false;

  /** Take the next chunk, never empty. Call only once `next()` has returned `false`. */
  public feed(chunk: string): void {
    this.chunk = chunk;
    this.pos = 0;
    this.crAt = -2;
    this.lfAt = -2;
  }

  /** There is no more input: the lines still waiting come out of `next()`. */
  public end(): void {
    this.ended = true;
    this.feed("");
  }

  /** Read the next whole line into `text` and `term`; `false` when the chunk is used up. */
  public next(): boolean {
    const chunk = this.chunk;
    if (this.held !== undefined) {
      // A line is held only at the end of a chunk, and the next chunk is never empty, so here
      // either the chunk's first character says whether the line ended CR LF, or the input ended.
      const lf = this.pos < chunk.length && chunk.charCodeAt(this.pos) === LF;
      this.text = this.held;
      this.term = lf ? "\r\n" : "\r";
      if (lf) this.pos += 1;
      this.held = undefined;
      return true;
    }
    if (this.pos >= chunk.length) {
      if (!this.ended || this.carry.length === 0) return false;
      this.text = this.carry.join("");
      this.carry = [];
      this.term = "";
      return true;
    }
    if (this.crAt !== -1 && this.crAt < this.pos) this.crAt = chunk.indexOf("\r", this.pos);
    if (this.lfAt !== -1 && this.lfAt < this.pos) this.lfAt = chunk.indexOf("\n", this.pos);
    const cr = this.crAt;
    const lf = this.lfAt;
    if (cr === -1 && lf === -1) {
      this.carry.push(this.pos === 0 ? chunk : chunk.slice(this.pos));
      this.pos = chunk.length;
      return this.next();
    }
    const at = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf);
    const piece = chunk.slice(this.pos, at);
    const line = this.carry.length === 0 ? piece : this.carry.join("") + piece;
    this.carry = [];
    if (at === lf) {
      this.text = line;
      this.term = "\n";
      this.pos = at + 1;
      return true;
    }
    // A line that ends with FS ends an MLLP frame, whose end is FS CR: an LF after it is not its.
    const endsFrame = line.charCodeAt(line.length - 1) === FS;
    if (at + 1 < chunk.length) {
      const crlf = !endsFrame && chunk.charCodeAt(at + 1) === LF;
      this.text = line;
      this.term = crlf ? "\r\n" : "\r";
      this.pos = at + (crlf ? 2 : 1);
      return true;
    }
    this.pos = at + 1;
    if (this.ended || endsFrame) {
      this.text = line;
      this.term = "\r";
      return true;
    }
    this.held = line;
    return false;
  }
}

/**
 * The UTF-8 length of `text`, as `Buffer.byteLength` counts it: a lone surrogate counts three,
 * as the replacement character it is written as.
 */
function utf8Length(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** The three characters that name a line, after any MLLP start bytes (VT) before them. */
function lineName(text: string): string {
  let i = 0;
  while (text.charCodeAt(i) === VT) i += 1;
  return text.slice(i, i + 3);
}

/** Whether a name is one of the four batch envelope segments, which bound messages. */
function isEnvelopeName(name: string): boolean {
  return name === "FHS" || name === "BHS" || name === "BTS" || name === "FTS";
}

/** Whether the options ask for strict mode. A profile alone never does. */
function isStrict(optionsOrProfile: ParseOptions | Profile | undefined): boolean {
  return discriminateOptionsOrProfile(optionsOrProfile).strict === true;
}

/**
 * Read a batch, a file or a stream of HL7 v2 messages, and yield each message as soon as its
 * last segment has arrived. The source is a string, bytes, a Node `Readable`, a web
 * `ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is read
 * only when the next item is asked for. Only the message being read is held, never the source.
 *
 * Messages are found as `splitBatch` finds them. Each starts at an `MSH` segment and runs to the
 * next `MSH`, the next batch envelope segment (`FHS`, `BHS`, `BTS`, `FTS`, which are never
 * yielded), or the end. Blank lines between messages are skipped. Text before the first `MSH` is
 * not dropped: it is yielded as a failed item. An MLLP frame (`VT`, the message, `FS`, `CR`), as
 * `@cosyte/mllp` writes it, is a message of its own: it ends at its `FS` and is yielded at once.
 *
 * Each message is parsed by `parseHL7` with the given options or profile, from exactly its own
 * text or bytes, so it is the message `parseHL7` gives for them, its warnings included, wherever
 * the chunks were cut: inside a terminator, an escape sequence or a multi-byte character. A
 * message that fails to parse is yielded as a failed item with its byte position, and reading goes
 * on. With `{ strict: true }` every warning fails its message, and the first failed item is the
 * last item: reading stops there and the source is released.
 *
 * @example
 * ```ts
 * import { createReadStream } from "node:fs";
 * import { readMessages } from "@cosyte/hl7";
 *
 * for await (const item of readMessages(createReadStream("feed.hl7"))) {
 *   if (item.ok) console.log(item.message.meta.controlId);
 *   else console.error(item.error.code, "at byte", item.byteOffset);
 * }
 * ```
 *
 * @example
 * ```ts
 * import { readMessages } from "@cosyte/hl7";
 *
 * const batch =
 *   "BHS|^~\\&|LAB\r" +
 *   "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|1|P|2.5\rPID|1||MRN1^^^HOSP^MR\r" +
 *   "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|2|P|2.5\rPID|1||MRN2^^^HOSP^MR\r" +
 *   "BTS|2\r";
 * const ids: string[] = [];
 * for await (const item of readMessages(batch)) {
 *   if (item.ok) ids.push(item.message.meta.controlId ?? "");
 * }
 * // ids: ["1", "2"]
 * ```
 */
export function readMessages(source: Hl7ReadSource): AsyncGenerator<ReadMessageItem, void, void>;
export function readMessages<P extends Profile>(
  source: Hl7ReadSource,
  profile: P,
): AsyncGenerator<ReadMessageItem<ProfiledMessage<P>>, void, void>;
export function readMessages<P extends Profile>(
  source: Hl7ReadSource,
  options: ParseOptions & { readonly profile: P },
): AsyncGenerator<ReadMessageItem<ProfiledMessage<P>>, void, void>;
export function readMessages(
  source: Hl7ReadSource,
  options: ParseOptions,
): AsyncGenerator<ReadMessageItem, void, void>;
// The implementation signature; the overloads above carry the public JSDoc.
export async function* readMessages(
  source: Hl7ReadSource,
  optionsOrProfile?: ParseOptions | Profile,
): AsyncGenerator<ReadMessageItem, void, void> {
  const strict = isStrict(optionsOrProfile);
  const kinds = new ChunkKind("readMessages");
  const lines = new LineSplitter();

  // The message being read: its lines, each with its terminator, exactly as they arrived.
  let parts: string[] = [];
  // How many of `parts` the message keeps: blank lines at its end are not part of it.
  let kept = 0;
  let messageOffset = 0;
  let messageBytes = 0;
  let keptBytes = 0;
  let messageSegment = 0;
  // Where the next line starts, in bytes and in lines.
  let offset = 0;
  let lineIndex = 0;
  let index = 0;
  // The start of the source, held until it is long enough to say whether it opens with a BOM.
  let head: string | undefined = "";
  const out: ReadMessageItem[] = [];

  const flush = (unterminated: boolean): void => {
    if (parts.length === 0) return;
    const text = kept === parts.length ? parts.join("") : parts.slice(0, kept).join("");
    parts = [];
    kept = 0;
    const position: Hl7Position = Object.freeze({ segmentIndex: messageSegment });
    const streamWarnings = unterminated
      ? Object.freeze([unterminatedStreamMessage(position)])
      : NONE;
    const raw = kinds.kind === "bytes" ? Buffer.from(text, "latin1") : text;
    const base = { index: index++, byteOffset: messageOffset, byteLength: keptBytes, position };
    try {
      const message =
        optionsOrProfile === undefined
          ? parseHL7(raw)
          : parseHL7(raw, optionsOrProfile as ParseOptions);
      out.push(Object.freeze({ ok: true, message, ...base, streamWarnings }));
    } catch (error) {
      if (!(error instanceof Hl7ParseError)) throw error;
      out.push(Object.freeze({ ok: false, error, raw, ...base, streamWarnings }));
    }
  };

  const line = (text: string, term: string): void => {
    const bytes =
      kinds.kind === "bytes" ? text.length + term.length : utf8Length(text) + term.length;
    const start = offset;
    offset += bytes;
    const segment = lineIndex++;
    const open = parts.length > 0;
    if (!open && isBlankLine(text, kinds.kind === "bytes")) return; // a blank line between messages
    const name = lineName(text);
    if (isEnvelopeName(name)) {
      flush(false);
      return;
    }
    if (name === "MSH" || !open) {
      // A new message, or text before any MSH, kept so it is reported rather than dropped.
      flush(false);
      messageOffset = start;
      messageBytes = 0;
      messageSegment = segment;
    }
    parts.push(term === "" ? text : text + term);
    messageBytes += bytes;
    if (text !== "") {
      kept = parts.length;
      keptBytes = messageBytes;
    }
    // A line that ends with the MLLP end byte ends its frame, and so its message.
    if (text.charCodeAt(text.length - 1) === FS) flush(false);
  };

  for await (const rawChunk of chunksOf(source, "readMessages")) {
    const chunk = kinds.check(rawChunk);
    const bytes = kinds.kind === "bytes";
    let text = typeof chunk === "string" ? chunk : latin1Of(chunk);
    if (head !== undefined) {
      // A byte order mark opens only the source, and three bytes of one may span chunks.
      head += text;
      if (head.length === 0) continue;
      if (bytes && head.length < LATIN1_BOM.length && LATIN1_BOM.startsWith(head)) continue;
      text = stripBom(head, bytes);
      offset = text.length < head.length ? 3 : 0;
      head = undefined;
    }
    if (text.length === 0) continue;
    lines.feed(text);
    while (lines.next()) {
      line(lines.text, lines.term);
      for (const item of out) {
        yield item;
        if (strict && !item.ok) return;
      }
      out.length = 0;
    }
  }
  if (head !== undefined && head.length > 0) {
    // Fewer bytes than a byte order mark has, all of them the start of one: they are not one.
    // They hold no line break, so reading them ends no line: they wait to be the last line, below.
    lines.feed(head);
    lines.next();
  }
  lines.end();
  // The source has ended: the last line may have had no terminator.
  let tail = "";
  while (lines.next()) {
    tail = lines.term === "" ? lines.text : "";
    line(lines.text, lines.term);
  }
  // flush() returns at once when no message is open.
  flush(!isBlankLine(tail, kinds.kind === "bytes"));
  for (const item of out) {
    yield item;
    if (strict && !item.ok) return;
  }
}

/** Bytes read one byte to one character, so a message's bytes are recovered exactly. */
function latin1Of(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
}

/** `text` without the byte order mark it opens with, if it opens with one. */
function stripBom(text: string, bytes: boolean): string {
  if (bytes) return text.startsWith(LATIN1_BOM) ? text.slice(LATIN1_BOM.length) : text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Tracks which fields an MLLP byte (VT or FS) was removed from, as `parseHL7` records them for a
 * whole message (`locateInteriorFramingBytes`), while the text arrives. A VT that opens the message
 * and an FS that closes it (last, or before one last CR) frame it and mark nothing; every other one
 * marks the field it sat in. The field separator is known only once MSH has arrived, so the text
 * before then is kept and counted then.
 *
 * `parseHL7` takes an opening VT as framing only when the message also ends with FS, and marks it
 * otherwise. The opening VT is met before the end is, so it is taken as framing until the end
 * says it was not (`openingVtMarks`): then it marks the name's slot of MSH, field 0.
 */
class FramingTracker {
  private readonly marks = new Map<number, number[]>();
  private separator = -1;
  private waiting: string[] = [];
  private counting = false;
  /** Whether the next text counted starts with the opening VT. */
  private skipFirst = false;
  private seenFirst = false;
  private opensWithVt = false;
  private segment = 0;
  private separators = 0;
  private previous = -1;
  /** An FS that may yet close the message, held until something other than one CR follows it. */
  private pendingFs: readonly [number, number] | undefined;
  private pendingCr = false;

  /** The next text of the message, as it arrived, before any byte is removed from it. */
  public push(text: string): void {
    if (!this.seenFirst) {
      this.seenFirst = true;
      this.opensWithVt = text.charCodeAt(0) === VT;
      this.skipFirst = this.opensWithVt;
    }
    if (this.counting) this.count(text);
    else this.waiting.push(text);
  }

  /** MSH has arrived: count the text kept until now with its field separator. */
  public start(separator: string): void {
    this.separator = separator.charCodeAt(0);
    this.counting = true;
    for (const text of this.waiting) this.count(text);
    this.waiting = [];
  }

  /**
   * The message has ended, its last two characters `lastTwo`: whether its opening VT turns out
   * not to be framing, because it does not end with FS or FS CR.
   */
  public openingVtMarks(lastTwo: string): boolean {
    const framedEnd = lastTwo.endsWith("\u001c") || lastTwo === "\u001c\r";
    return this.opensWithVt && !framedEnd;
  }

  /** Record a mark found after the fact. */
  public add(segment: number, field: number): void {
    this.mark(segment, field);
  }

  /** The fields marked in segment `index`, removed from the tracker. */
  public take(index: number): readonly number[] | undefined {
    const fields = this.marks.get(index);
    if (fields !== undefined) this.marks.delete(index);
    return fields;
  }

  /** Count `text` as `locateInteriorFramingBytes` counts it, a character at a time. */
  private count(text: string): void {
    // The opening VT, taken as framing.
    const from = this.skipFirst ? 1 : 0;
    this.skipFirst = false;
    for (let i = from; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const pending = this.pendingFs;
      if (pending !== undefined) {
        if (code === CR && !this.pendingCr) {
          this.pendingCr = true;
        } else {
          this.pendingFs = undefined;
          this.mark(pending[0], pending[1]);
        }
      }
      if (code === VT || code === FS) {
        if (code === FS && this.opensWithVt) {
          this.pendingFs = [this.segment, this.separators];
          this.pendingCr = false;
        } else {
          this.mark(this.segment, this.separators);
        }
        continue;
      }
      if (code === LF && this.previous === CR) {
        // The LF of a CR LF pair: one segment break, already counted at the CR.
      } else if (code === CR || code === LF) {
        this.segment += 1;
        this.separators = 0;
      } else if (code === this.separator) {
        this.separators += 1;
      }
      this.previous = code;
    }
  }

  /** Record that a framing byte was removed from field `field` of segment `segment`. */
  private mark(segment: number, field: number): void {
    const fields = this.marks.get(segment);
    if (fields === undefined) this.marks.set(segment, [field]);
    else fields.push(field);
  }
}

/**
 * Read one HL7 v2 message, however large, and yield each segment as soon as it has arrived, with
 * the warnings `parseHL7` reports about it. The source is a string, bytes, a Node `Readable`, a
 * web `ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is
 * read only when the next segment is asked for. Only the segment being read, and the one after
 * it, are held: never the message.
 *
 * Each segment and its warnings are the ones `parseHL7` gives for the whole message, wherever the
 * chunks were cut: the same values, the same warnings, and the same `toString()`. The warnings
 * about the message's bytes come with the first segment, and those that need the whole message
 * (a segment its structure requires that never came) with the last. A message `parseHL7` refuses
 * (`NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`) throws the
 * same `Hl7ParseError` before the first segment. With `{ strict: true }` the first warning throws,
 * as `parseHL7` does, though in reading order: the segments before it have been yielded, and when
 * a message has more than one problem the one thrown can differ from the one `parseHL7`, which
 * reads the whole message first, would throw. Bytes in a character set the parser decodes strictly
 * (UTF-8, for one) that turn out not to be valid in it throw `UNSUPPORTED_CHARSET` where they are
 * met: `parseHL7` reads such a message verbatim instead, which a reader that has handed out
 * earlier segments cannot do.
 *
 * @example
 * ```ts
 * import { createReadStream } from "node:fs";
 * import { readSegments } from "@cosyte/hl7";
 *
 * let results = 0;
 * for await (const { segment } of readSegments(createReadStream("large-report.hl7"))) {
 *   if (segment.type === "OBX") results += 1;
 * }
 * ```
 */
export async function* readSegments(
  source: Hl7ReadSource,
  optionsOrProfile?: ParseOptions | Profile,
): AsyncGenerator<ReadSegmentItem, void, void> {
  const options = discriminateOptionsOrProfile(optionsOrProfile);
  const profile = resolveEffectiveProfile(options);
  const kinds = new ChunkKind("readSegments");
  const lines = new LineSplitter();
  const framing = new FramingTracker();

  // Bytes: decoded once MSH-18 is known, from the bytes before the first line break.
  let decoder: ChunkDecoder | undefined;
  let undecoded: Uint8Array[] | undefined;
  // Warnings about the bytes, reported before any other, as parseHL7 reports them.
  const byteWarnings: Hl7ParseWarning[] = [];
  const keepByteWarning = (w: Hl7ParseWarning): void => {
    byteWarnings.push(w);
  };

  // The decoded text: whether any arrived, whether it began, and its last two characters.
  let sawText = false;
  let lastTwo = "";
  // Whether the last decoded byte text ended with CR, whose LF may begin the next chunk.
  let afterCr = false;
  let framed = false;
  let framingReported = false;
  // The first characters of the text as parseHL7 reads it, for a strict-mode error's snippet.
  let head = "";
  // Lines read but not yet built: the first until the head is long enough, then at most two.
  const queue: { text: string; term: string }[] = [];

  // The warnings of the segment being built.
  const bucket: Hl7ParseWarning[] = [];
  const emit = makeEmitter(bucket, options, () => head, profile);
  const mllpReported = (options.stripMllpFraming ?? true) === true;
  const trimFields = options.trimFields ?? true;
  const customSegments = profile?.customSegments;
  const overrides = profile?.segmentOverrides;
  const dateFormats = mergeDateFormats(options, profile) ?? [];
  const placeholders = new Map<string, RawField>();
  const present = new Set<string>();
  let encoding: EncodingCharacters | undefined;
  let messageCode = "";
  let triggerEvent = "";
  let index = 0;
  // MSH once built: an opening VT that turns out not to be framing is marked on it at the end.
  let msh: RawSegment | undefined;

  /** Take decoded text: note framing, drop the BOM and the MLLP bytes, and split it into lines. */
  const take = (decoded: string): void => {
    if (decoded.length === 0) return;
    let text = decoded;
    if (kinds.kind === "bytes") {
      // parseHL7 normalizes a Buffer's line endings as it decodes it, before it strips the MLLP
      // bytes, so a frame that ends FS CR LF or FS LF ends as FS CR does. A CR at the end of one
      // chunk and an LF at the start of the next are one CR LF.
      if (afterCr && text.charCodeAt(0) === LF) text = text.slice(1);
      afterCr = text.endsWith("\r");
      text = normalize(text);
      if (text.length === 0) return;
    }
    if (!sawText) {
      sawText = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      if (text.length === 0) return;
    }
    framing.push(text);
    lastTwo = (lastTwo + text.slice(-2)).slice(-2);
    if (text.includes("\u000b") || text.includes("\u001c")) {
      framed = true;
      text = text.replace(/[\u000b\u001c]/gu, "");
      if (text.length === 0) return;
    }
    lines.feed(text);
    while (lines.next()) queueLine(lines.text, lines.term);
  };

  /** Queue a whole line, and keep the first characters of the text for a snippet. */
  const queueLine = (text: string, term: string): void => {
    queue.push({ text, term });
    if (head.length < HEAD) head = `${head}${text}${term === "" ? "" : "\r"}`.slice(0, HEAD);
  };

  /** Build the segment at the front of the queue and return its item. */
  const build = (last: boolean): ReadSegmentItem => {
    const { text } = queue.shift() as { text: string; term: string };
    const i = index++;
    if (i === 0) {
      for (const w of byteWarnings) emit(w);
      if (framed && mllpReported) emit(mllpFramingStripped({ segmentIndex: 0 }));
      framingReported = framed;
      encoding = readDelimiters(text);
      framing.start(encoding.field);
    }
    const enc = encoding as EncodingCharacters;
    let trimmed: number[] | undefined;
    const scanner = new Scanner(text, enc, trimFields, {
      warn: emit,
      trimmed: (_segment, field) => {
        if (trimmed === undefined) trimmed = [field];
        else trimmed.push(field);
      },
    });
    const name = scanner.segment(0, text.length, i);
    const raw = buildScannedSegment(text, scanner, enc, placeholders, trimmed);
    markAltered(raw, trimmed, framing.take(i));
    emitSegmentNameWarning(name, i, customSegments, emit);
    present.add(canonicalSegmentName(name));
    if (i === 0) {
      msh = raw;
      ({ messageCode, triggerEvent } = extractMessageType(raw));
    }
    if (last) {
      if (framed && !framingReported && mllpReported) {
        emit(mllpFramingStripped({ segmentIndex: 0 }));
      }
      if (messageCode !== "") emitStructureWarnings(messageCode, triggerEvent, present, emit);
    }
    const customFields =
      segmentFieldMap(customSegments, raw.name) ?? segmentFieldMap(overrides, raw.name);
    const segment = new Segment(raw, enc, i, customFields, dateFormats);
    const warnings = bucket.length === 0 ? NONE : Object.freeze(bucket.splice(0));
    return Object.freeze({ segment, index: i, warnings });
  };

  for await (const rawChunk of chunksOf(source, "readSegments")) {
    const chunk = kinds.check(rawChunk);
    if (typeof chunk === "string") {
      take(chunk);
    } else if (decoder !== undefined) {
      take(decoder.decode(chunk, false));
    } else {
      // The bytes before the first line break hold MSH-18, which says how to decode the rest.
      (undecoded ??= []).push(chunk);
      if (!chunk.includes(CR) && !chunk.includes(LF)) continue;
      decoder = startDecoder(undecoded, options, keepByteWarning);
      take(decoder.decode(concatBytes(undecoded), false));
      undecoded = undefined;
    }
    // A segment is built once the one after it has arrived, and the first only once the head is
    // long enough that a strict-mode snippet is what parseHL7 would give.
    if (index === 0 && head.length < SNIPPET_READY) continue;
    while (queue.length > 1) yield build(false);
  }
  if (kinds.kind === "bytes") {
    if (decoder === undefined) {
      // No line break arrived: every chunk is still waiting, and there is at least one.
      const waiting = undecoded as Uint8Array[];
      decoder = startDecoder(waiting, options, keepByteWarning);
      take(decoder.decode(concatBytes(waiting), false));
    }
    take(decoder.decode(new Uint8Array(0), true));
  }
  lines.end();
  while (lines.next()) queueLine(lines.text, lines.term);
  if (!sawText) {
    throw new Hl7ParseError(FATAL_CODES.EMPTY_INPUT, "Input is empty.", { segmentIndex: 0 }, "");
  }
  // An MLLP frame that ends with FS CR: that CR is the frame's, not a segment terminator.
  // The CR came last and was kept, so it ends the last line queued, which is still queued: a line
  // is built only once another follows it.
  if (lastTwo === "\u001c\r") {
    const final = queue[queue.length - 1] as { text: string; term: string };
    if (final.text === "") queue.pop();
    final.term = "";
    if (head.length < HEAD) head = head.slice(0, -1);
  }
  if (queue.length === 0) {
    throw new Hl7ParseError(
      FATAL_CODES.EMPTY_INPUT,
      "Input is empty after MLLP framing was stripped.",
      { segmentIndex: 0 },
      "",
    );
  }
  // The whole text, as parseHL7 reads it, is one line break: no segment at all.
  if (head === "\r") {
    for (const w of byteWarnings) emit(w);
    if (framed && mllpReported) emit(mllpFramingStripped({ segmentIndex: 0 }));
    throw new Hl7ParseError(
      FATAL_CODES.NO_MSH_SEGMENT,
      "No segments found after normalization.",
      { segmentIndex: 0 },
      "",
    );
  }
  if (framing.openingVtMarks(lastTwo)) {
    if (msh === undefined) framing.add(0, 0);
    else markAltered(msh, undefined, [0]);
  }
  while (queue.length > 0) yield build(queue.length === 1);
}

/** Every chunk in `chunks`, in order, as one byte array. */
function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0] as Uint8Array;
  return Buffer.concat(chunks);
}

/**
 * The decoder for a message whose bytes begin with `chunks`: in the charset `parseHL7` would
 * choose, from `options.charset` and the MSH-18 its first line declares.
 */
function startDecoder(
  chunks: readonly Uint8Array[],
  options: ParseOptions,
  emit: (w: Hl7ParseWarning) => void,
): ChunkDecoder {
  const bytes = concatBytes(chunks);
  let end = bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === CR || bytes[i] === LF) {
      end = i;
      break;
    }
  }
  const tentative = new TextDecoder("utf-8").decode(bytes.subarray(0, end));
  const declared = extractMsh18FromTentativeDecode(tentative);
  return chunkDecoder(chooseBufferCharset(declared, options, emit), emit);
}
