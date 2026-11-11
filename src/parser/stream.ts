/**
 * Streaming / incremental parse for the `@cosyte/hl7` parser. Real ELR / IIS
 * / lab feeds and files ship many messages and can be
 * far too large to buffer whole; a live source (an already-de-framed MLLP feed,
 * a growing file) has no "whole" to buffer at all. `parseStream()` consumes a
 * **chunked** byte/string source: a Node `Readable`, an async-iterable, or a
 * plain iterable of chunks: and **yields one {@link StreamMessageEntry} per
 * `MSH`-delimited message** as each boundary completes, holding only
 * **O(one message)** of state (the in-flight message's lines plus the current
 * partial-segment buffer): never the whole stream.
 *
 * Design (HL7 v2 Ch. 2; note this is engineering guidance, not a spec-mandated
 * streaming grammar: the base standard prescribes no incremental parse):
 *
 * - **`MSH` at segment start is the message boundary.** A message runs from an
 *   `MSH` segment up to (but not including) the next `MSH` (or a batch-envelope
 *   segment, or end of stream). This mirrors {@link splitBatch}'s in-memory
 *   demarcation exactly, so the streamed decomposition of a buffer is identical
 *   to the whole-buffer one.
 * - **Batch-aware.** The four batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`,
 *   §2.10.3) act as message boundaries (they flush the current message) and are
 *   **never yielded as messages**, so `yielded count == MSH count`. Envelope
 *   **count reconciliation** (BTS-1 / FTS-1) is {@link splitBatch}'s job, not this
 *   surface's: `parseStream` streams *messages*, not a batch report.
 * - **Chunk-boundary invariant.** Segments (including the `MSH|^~\&` header) are
 *   only demarcated once their terminator arrives, so a message split across two
 *   chunks (mid-segment, mid-field, even mid-`MSH`) is reassembled correctly.
 *   Feeding the same bytes in 1-byte chunks vs. one big chunk yields **identical**
 *   messages. A `\r\n` terminator split across a chunk boundary is not mistaken
 *   for a bare `\r` + empty segment (a trailing `\r` waits for the next chunk).
 * - **Terminator tolerance.** `\r`, `\r\n`, and `\n` are all accepted as segment
 *   terminators (Postel's Law: real feeds mix them), matching the core parser's
 *   `normalize`.
 * - **Isolation, never dropped tails.** Each message is parsed by the shipped
 *   {@link parseHL7} (no second grammar; raw extraction semantics unchanged) and
 *   surfaced as either an `ok` entry (its own `.warnings` hold per-message
 *   deviations) or a typed **failure** entry carrying the `Hl7ParseError`. A
 *   corrupt message mid-stream is isolated: it **never suppresses** the messages
 *   after it. A final message that ends without a segment terminator is still
 *   yielded in full, flagged via a stream-level {@link unterminatedStreamMessage}
 *   warning (never a throw), so a truncated feed is surfaced, never silently
 *   dropped.
 *
 * Transport framing (MLLP `<SB>…<EB><CR>`) is **out of scope**: this consumes an
 * already-de-framed stream; `@cosyte/mllp` owns the wire. See
 * `docs-content/spec-notes-stream.md`.
 */

import { Buffer } from "node:buffer";

import { parseBytesRead, parseHL7 } from "./index.js";
import { isBlankLine } from "./blank-line.js";
import { Hl7ParseError } from "./errors.js";
import type { Hl7Position, ParseOptions, Profile } from "./types.js";
import { unterminatedStreamMessage } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";

import type { Hl7Message } from "../model/message.js";
import type { ProfiledMessage } from "../profiles/typed-fields.js";

/**
 * A chunked source `parseStream` can consume: a Node `Readable`, any
 * async-iterable, or any plain iterable of chunks. Chunks are `string`
 * (text stream) or `Buffer`/`Uint8Array` (binary stream). A real Node stream in
 * binary mode yields `Buffer`s; in text mode it yields `string`s: a source is
 * expected to be **homogeneous** (all-text or all-binary), which every real
 * `Readable` is. A binary chunk is decoded 1:1 via `latin1` (a lossless
 * byte↔codepoint mapping) so each message's own MSH-18 charset resolution runs
 * on its original bytes, exactly as {@link splitBatch} does.
 *
 * @example
 * ```ts
 * import { createReadStream } from "node:fs";
 * import { parseStream } from "@cosyte/hl7";
 *
 * const src: Hl7StreamSource = createReadStream("feed.hl7");
 * for await (const entry of parseStream(src)) {
 *   if (entry.ok) handle(entry.message);
 *   else quarantine(entry.raw, entry.error.code);
 * }
 * ```
 */
export type Hl7StreamSource =
  AsyncIterable<string | Buffer | Uint8Array> | Iterable<string | Buffer | Uint8Array>;

/**
 * One message yielded by {@link parseStream}. Discriminated on `ok`, mirroring
 * {@link splitBatch}'s per-message entry: a successful parse carries the
 * `Hl7Message` (whose own `.warnings` hold per-message Tier-2 deviations); a
 * message that hit one of the four Tier-3 fatals carries the `Hl7ParseError`
 * instead: **isolated**, so the rest of the stream still yields.
 *
 * `raw` is the message's verbatim source (re-parseable by {@link parseHL7});
 * `position.segmentIndex` is the message's `MSH` (or, for stray pre-`MSH`
 * content, its first) segment index in the overall stream: the streaming
 * analogue of {@link splitBatch}'s message position. `streamWarnings` holds
 * **stream-level** diagnostics that are not per-message parse warnings: today
 * only {@link unterminatedStreamMessage} on a final message that lacked a
 * terminator. It is kept separate from `message.warnings` (which stays exactly
 * what a whole-buffer `parseHL7` of the same bytes would produce) and is
 * **empty** for every message but a possibly-truncated final one. Both the entry
 * and `streamWarnings` are frozen.
 *
 * `M` is the parsed-message type each `ok` entry carries. It is `Hl7Message`
 * unless the stream was given a statically known profile, in which case it is
 * that profile's narrowed view and `entry.message.part("ZDP")?.get(name)` is
 * checked against the names the profile declares for `ZDP`.
 *
 * @template M - the message type an `ok` entry carries.
 *
 * @example
 * ```ts
 * import { parseStream, WARNING_CODES } from "@cosyte/hl7";
 * for await (const entry of parseStream(source)) {
 *   for (const w of entry.streamWarnings) {
 *     if (w.code === WARNING_CODES.UNTERMINATED_STREAM_MESSAGE) {
 *       // the feed may have been cut off mid-message
 *     }
 *   }
 * }
 * ```
 */
export type StreamMessageEntry<M extends Hl7Message = Hl7Message> =
  | {
      readonly ok: true;
      readonly message: M;
      readonly raw: string;
      readonly position: Hl7Position;
      readonly streamWarnings: readonly Hl7ParseWarning[];
    }
  | {
      readonly ok: false;
      readonly error: Hl7ParseError;
      readonly raw: string;
      readonly position: Hl7Position;
      readonly streamWarnings: readonly Hl7ParseWarning[];
    };

/** The three batch-envelope names that act as message boundaries in a stream. */
function isEnvelopeName(name: string): boolean {
  return name === "FHS" || name === "BHS" || name === "BTS" || name === "FTS";
}

/**
 * Decode one raw chunk into text. A `string` passes through; a `Buffer` /
 * `Uint8Array` is read as `latin1` (1 byte → 1 codepoint, lossless) so the
 * per-message substring re-encodes to its original bytes for MSH-18 charset
 * resolution. `wasBuffer` records whether the byte path was taken.
 *
 * @internal
 */
function decodeChunk(chunk: unknown): { text: string; wasBuffer: boolean } {
  if (typeof chunk === "string") return { text: chunk, wasBuffer: false };
  if (chunk instanceof Uint8Array) {
    return { text: Buffer.from(chunk).toString("latin1"), wasBuffer: true };
  }
  throw new TypeError(
    "parseStream: each chunk must be a string, Buffer, or Uint8Array; " +
      `received ${chunk === null ? "null" : typeof chunk}.`,
  );
}

/**
 * Normalize any source (async-iterable, iterable, or Node `Readable`) into a
 * single async iterator of chunks. A `Readable` is an `AsyncIterable`, so the
 * async-iterable branch covers it. Rejects a non-iterable source with a typed
 * error rather than silently yielding nothing.
 *
 * @internal
 */
async function* iterateChunks(source: Hl7StreamSource): AsyncGenerator<unknown> {
  if (source === null || source === undefined) {
    throw new TypeError("parseStream: source must be an async-iterable or iterable of chunks.");
  }
  const asAsync = (source as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator];
  if (typeof asAsync === "function") {
    for await (const chunk of source as AsyncIterable<unknown>) yield chunk;
    return;
  }
  const asSync = (source as { [Symbol.iterator]?: unknown })[Symbol.iterator];
  if (typeof asSync === "function") {
    for (const chunk of source as Iterable<unknown>) yield chunk;
    return;
  }
  throw new TypeError(
    "parseStream: source must be an async-iterable or iterable of chunks (e.g. a Node Readable).",
  );
}

/**
 * Splits text that arrives in chunks into segments, each ended by `\r`, `\r\n` or `\n`. A
 * segment that lies inside one chunk is cut from that chunk, so it keeps at most that chunk alive;
 * one that spans chunks is joined from its pieces once its terminator arrives. The chunks are
 * never joined into one growing buffer: such a buffer, which every segment was cut from, stayed
 * alive while a large message was yielded and doubled what the stream held. Each chunk is searched
 * once for each terminator, however many segments it holds.
 *
 * A `\r` that ends a chunk ends its segment, but the segment waits for the next chunk, whose
 * first character says whether the terminator was `\r\n` (and is consumed) or `\r` alone; at the
 * end of the stream it is a `\r`. Feeding the same text cut anywhere gives the same segments.
 *
 * @internal
 */
class SegmentSplitter {
  /** The segment `next()` last returned, its terminator excluded. */
  public segment = "";
  private chunk = "";
  private pos = 0;
  /** The next `\r` at or after `pos`; -1 for none in the chunk, -2 before the first search. */
  private crAt = -2;
  /** The next `\n` at or after `pos`, the same way. */
  private lfAt = -2;
  /** The start of a segment whose terminator has not arrived yet, in pieces. */
  private carry: string[] = [];
  /** A segment ended by a `\r` at the very end of the last chunk, waiting to see an `\n`. */
  private held: string | undefined;

  /** Take the next chunk, never empty. Call only once `next()` has returned `false`. */
  public feed(chunk: string): void {
    this.chunk = chunk;
    this.pos = 0;
    this.crAt = -2;
    this.lfAt = -2;
  }

  /** There is no more input: a segment held on a trailing `\r` comes out of `next()`. */
  public end(): void {
    this.feed("");
  }

  /** Read the next terminated segment into `segment`; `false` when the chunk is used up. */
  public next(): boolean {
    const chunk = this.chunk;
    if (this.held !== undefined) {
      // A segment is held only at the end of a chunk, and the next chunk is never empty, so its
      // first character says whether the `\r` was the first half of `\r\n`, or the input ended.
      if (this.pos < chunk.length && chunk.charCodeAt(this.pos) === 0x0a) this.pos += 1;
      this.segment = this.held;
      this.held = undefined;
      return true;
    }
    if (this.pos >= chunk.length) return false;
    if (this.crAt !== -1 && this.crAt < this.pos) this.crAt = chunk.indexOf("\r", this.pos);
    if (this.lfAt !== -1 && this.lfAt < this.pos) this.lfAt = chunk.indexOf("\n", this.pos);
    const cr = this.crAt;
    const lf = this.lfAt;
    if (cr === -1 && lf === -1) {
      this.carry.push(this.pos === 0 ? chunk : chunk.slice(this.pos));
      this.pos = chunk.length;
      return false;
    }
    const at = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf);
    const piece = chunk.slice(this.pos, at);
    const segment = this.carry.length === 0 ? piece : this.carry.join("") + piece;
    this.carry = [];
    if (at === lf) {
      this.pos = at + 1;
    } else if (at + 1 < chunk.length) {
      this.pos = at + (chunk.charCodeAt(at + 1) === 0x0a ? 2 : 1);
    } else {
      this.pos = at + 1;
      this.held = segment;
      return false;
    }
    this.segment = segment;
    return true;
  }

  /** The text after the last terminator, with no terminator of its own, and forget it. */
  public rest(): string {
    const rest = this.carry.join("");
    this.carry = [];
    return rest;
  }
}

/**
 * Parse one fully-demarcated message and classify it, exactly as `splitBatch`
 * does per message: a successful {@link parseHL7} yields an `ok` entry; one of
 * the four Tier-3 fatals (or, under `strict`, a promoted Tier-2 warning) is
 * caught and returned as a typed failure entry so it never suppresses later
 * messages. Any non-parser throw is genuinely unexpected and re-raised.
 *
 * @internal
 */
function parseStreamEntry(
  rawMessage: string,
  position: Hl7Position,
  wasBuffer: boolean,
  optionsOrProfile: ParseOptions | Profile | undefined,
  streamWarnings: readonly Hl7ParseWarning[],
): StreamMessageEntry {
  try {
    // From bytes, the message keeps `rawMessage` itself as its text wherever decoding the bytes
    // gives those characters, so the entry holds the text once, not as `raw` and again in the
    // message. From text, `parseHL7` keeps the string it is given.
    const message = wasBuffer
      ? parseBytesRead(Buffer.from(rawMessage, "latin1"), rawMessage, optionsOrProfile)
      : optionsOrProfile === undefined
        ? parseHL7(rawMessage)
        : parseHL7(rawMessage, optionsOrProfile as ParseOptions);
    return Object.freeze({ ok: true, message, raw: rawMessage, position, streamWarnings });
  } catch (error) {
    if (error instanceof Hl7ParseError) {
      return Object.freeze({ ok: false, error, raw: rawMessage, position, streamWarnings });
    }
    throw error;
  }
}

/**
 * Incrementally parse a chunked HL7 v2 byte / text stream, yielding one
 * {@link StreamMessageEntry} per `MSH`-delimited message as its boundary
 * completes, with **O(one-message)** memory: the whole stream is never
 * retained. Demarcates by `MSH` boundaries inside the optional
 * `[FHS] { [BHS] { MSH… } [BTS] } [FTS]` batch frame (HL7 v2 Ch. 2 §2.10.3):
 *
 * - a message split across chunk boundaries (mid-segment, mid-field, even
 *   mid-`MSH|^~\&`) is reassembled correctly: feeding the same bytes in 1-byte
 *   chunks vs. one chunk yields **identical** messages;
 * - `\r`, `\r\n`, and `\n` segment terminators are all tolerated (a `\r\n` split
 *   across a chunk boundary is not mistaken for a bare `\r`);
 * - each message is parsed by the shipped {@link parseHL7} (no second grammar),
 *   `ok` entries carry the `Hl7Message`, a Tier-3 fatal is an isolated failure
 *   entry; a **malformed message never suppresses later messages**;
 * - batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) are treated as boundaries
 *   and never yielded as messages, so `yielded count == MSH count` (envelope
 *   count reconciliation is {@link splitBatch}'s job);
 * - a final message with no trailing terminator is still yielded, flagged with a
 *   stream-level {@link unterminatedStreamMessage} warning: **never a throw, the
 *   tail is never dropped**.
 *
 * The second argument, when given, is forwarded verbatim to {@link parseHL7} for
 * **each** message (profile, `strict`, `charset`, `dateFormats`, …), exactly as
 * {@link splitBatch} forwards it.
 *
 * @example
 * ```ts
 * import { parseStream } from "@cosyte/hl7";
 *
 * async function* chunks() {
 *   yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r";
 *   yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r";
 * }
 *
 * let count = 0;
 * for await (const entry of parseStream(chunks())) {
 *   if (entry.ok) count += 1; // 2: one per MSH, streamed, released each time
 * }
 * ```
 *
 * @example
 * ```ts
 * import { defineProfile, parseStream } from "@cosyte/hl7";
 * const vendor = defineProfile({
 *   name: "vendor",
 *   customSegments: { ZDP: { fields: { departmentCode: 3 } } },
 * });
 * // The profile is forwarded to every message, narrowing each one's reader:
 * for await (const entry of parseStream(source, vendor)) {
 *   if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
 * }
 * ```
 */
export function parseStream(
  source: Hl7StreamSource,
): AsyncGenerator<StreamMessageEntry, void, void>;
export function parseStream<P extends Profile>(
  source: Hl7StreamSource,
  profile: P,
): AsyncGenerator<StreamMessageEntry<ProfiledMessage<P>>, void, void>;
export function parseStream<P extends Profile>(
  source: Hl7StreamSource,
  options: ParseOptions & { readonly profile: P },
): AsyncGenerator<StreamMessageEntry<ProfiledMessage<P>>, void, void>;
export function parseStream(
  source: Hl7StreamSource,
  options: ParseOptions,
): AsyncGenerator<StreamMessageEntry, void, void>;
// The implementation signature; the overloads above carry the public JSDoc.
export async function* parseStream(
  source: Hl7StreamSource,
  optionsOrProfile?: ParseOptions | Profile,
): AsyncGenerator<StreamMessageEntry, void, void> {
  // A bare string is Iterable<string> (of single characters) and a bare Buffer
  // is Iterable<number> (of bytes): both would be silently mis-consumed as a
  // "stream of chunks". Reject them with a pointer to the right surface: a
  // single message is `parseHL7`'s job, and a whole buffer to stream is wrapped
  // in an array (`parseStream([buffer])`).
  if (typeof source === "string" || source instanceof Uint8Array) {
    throw new TypeError(
      "parseStream expects a stream of chunks (a Node Readable, an async-iterable, or an " +
        "iterable of string/Buffer chunks), not a single string or Buffer. For one message use " +
        "parseHL7; to stream a whole buffer, wrap it: parseStream([buffer]).",
    );
  }

  // The segments, cut from the chunks as each arrives. It holds only the
  // pieces of a segment whose terminator has not arrived yet: never the file.
  const segments = new SegmentSplitter();
  // The start of the stream, held until it is long enough to say whether it
  // opens with a byte order mark; `undefined` once that is settled.
  let head: string | undefined = "";
  // The current in-flight message's completed segment lines. Released on every
  // flush (yield), so at most one message's worth of lines is ever retained.
  let currentLines: string[] = [];
  let messageStartIndex = -1;
  // The running segment index in the overall stream (blanks included), so a
  // message's position mirrors splitBatch's MSH segment index.
  let globalSegmentIndex = 0;
  // Whether the byte path was taken (binary source): governs per-message
  // re-encode. Determined by the first chunk; sources are homogeneous.
  let wasBuffer = false;
  let firstChunkSeen = false;

  /**
   * Finalize `currentLines` into an entry, or `null` when the run is empty.
   * Trailing empty segments are dropped (inter-message whitespace); a run of
   * only-empty lines is nothing. `finalUnterminated` attaches the stream-level
   * unterminated-message warning. Always releases `currentLines`.
   */
  const flush = (finalUnterminated: boolean): StreamMessageEntry | null => {
    while (currentLines.length > 0 && currentLines[currentLines.length - 1] === "") {
      currentLines.pop();
    }
    if (currentLines.length === 0) {
      messageStartIndex = -1;
      return null;
    }
    const position: Hl7Position = Object.freeze({ segmentIndex: messageStartIndex });
    const streamWarnings: readonly Hl7ParseWarning[] = finalUnterminated
      ? Object.freeze([unterminatedStreamMessage(position)])
      : Object.freeze([]);
    const rawMessage = currentLines.join("\r");
    // Let the lines go before the parse, so they are not held beside the text joined from them.
    currentLines = [];
    const entry = parseStreamEntry(
      rawMessage,
      position,
      wasBuffer,
      optionsOrProfile,
      streamWarnings,
    );
    messageStartIndex = -1;
    return entry;
  };

  /**
   * Route one completed segment through MSH-boundary demarcation, returning the
   * PREVIOUS message to yield when this segment closes it (an `MSH` or an
   * envelope boundary), else `null`. Mirrors `splitBatch`'s per-segment walk.
   */
  const processSegment = (seg: string): StreamMessageEntry | null => {
    const thisIndex = globalSegmentIndex;
    globalSegmentIndex += 1;
    const name = seg.slice(0, 3);
    if (isEnvelopeName(name)) {
      // Boundary: close the current message; the envelope itself is not a
      // message and is not yielded.
      return flush(false);
    }
    if (name === "MSH") {
      const flushed = flush(false);
      currentLines = [seg];
      messageStartIndex = thisIndex;
      return flushed;
    }
    // Message body: or stray content before the first MSH, which is kept (never
    // dropped) and surfaces as a NO_MSH_SEGMENT failure entry on flush.
    if (currentLines.length === 0) {
      // A blank line between messages is inter-message whitespace: skip it (its
      // index is still consumed above so positions stay stable).
      if (isBlankLine(seg, wasBuffer)) return null;
      messageStartIndex = thisIndex;
    }
    currentLines.push(seg);
    return null;
  };

  /** Resolve a possibly chunk-split leading BOM before segmenting. */
  /**
   * The text of the stream's start without its byte order mark, once `text`
   * (everything read so far) is long enough to say whether it opens with one;
   * `undefined` while it may still be part of one.
   */
  const settleHead = (text: string): string | undefined => {
    if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
    // UTF-8 BOM read through latin1 (bytes EF BB BF). In text these are three letters.
    if (wasBuffer && text.startsWith("ï»¿")) return text.slice(3);
    // Not a BOM (and not a partial BOM prefix awaiting more bytes).
    if (!"ï»¿".startsWith(text)) return text;
    return undefined;
  };

  for await (const rawChunk of iterateChunks(source)) {
    const decoded = decodeChunk(rawChunk);
    if (!firstChunkSeen) {
      wasBuffer = decoded.wasBuffer;
      firstChunkSeen = true;
    }
    if (decoded.text.length === 0) continue;
    let text: string | undefined = decoded.text;
    if (head !== undefined) {
      head += text;
      text = settleHead(head);
      if (text === undefined) continue; // still disambiguating a split BOM
      head = undefined;
      if (text.length === 0) continue;
    }
    segments.feed(text);
    while (segments.next()) {
      const entry = processSegment(segments.segment);
      if (entry !== null) yield entry;
    }
  }

  // End of stream. A start still too short to say whether it was a byte order
  // mark is not one: it is one or two of the mark's three characters, so it
  // holds no terminator and is the start of the last segment.
  if (head !== undefined && head.length > 0) {
    segments.feed(head);
    segments.next();
  }
  // A segment ended by a `\r` at the very end is a real segment now.
  segments.end();
  while (segments.next()) {
    const entry = processSegment(segments.segment);
    if (entry !== null) yield entry;
  }

  // Whatever is left is a final segment with NO terminator (a
  // truncated tail). Route it through the SAME per-segment logic the rest of the
  // stream uses, so a streamed message stays byte-for-byte identical to what
  // `splitBatch` yields for the same bytes: `splitBatch` keeps a final
  // unterminated segment verbatim (its `flushMessage` pops only exact-empty
  // trailing lines, and `processSegment` here skips a whitespace-only line only
  // when no message is open: the same inter-message-noise rule). The
  // stream-level unterminated flag fires only for a genuine (non-blank) content
  // tail, never for trailing whitespace (which is not a truncation signal).
  const tail = segments.rest();
  let finalUnterminated = false;
  if (tail.length > 0) {
    const flushed = processSegment(tail);
    if (flushed !== null) yield flushed;
    // The message now held in `currentLines` (if any) ends without a terminator.
    // flush() yields nothing when no message is open, whatever the flag says.
    finalUnterminated = !isBlankLine(tail, wasBuffer);
  }
  const finalEntry = flush(finalUnterminated);
  if (finalEntry !== null) yield finalEntry;
}
