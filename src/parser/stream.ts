/**
 * Streaming / incremental parse for the `@cosyte/hl7` parser (roadmap
 * Phase S). Real ELR / IIS / lab feeds and files ship many messages and can be
 * far too large to buffer whole; a live source (an already-de-framed MLLP feed,
 * a growing file) has no "whole" to buffer at all. `parseStream()` consumes a
 * **chunked** byte/string source — a Node `Readable`, an async-iterable, or a
 * plain iterable of chunks — and **yields one {@link StreamMessageEntry} per
 * `MSH`-delimited message** as each boundary completes, holding only
 * **O(one message)** of state (the in-flight message's lines plus the current
 * partial-segment buffer) — never the whole stream.
 *
 * Design (HL7 v2 Ch. 2; note this is engineering guidance, not a spec-mandated
 * streaming grammar — the base standard prescribes no incremental parse):
 *
 * - **`MSH` at segment start is the message boundary.** A message runs from an
 *   `MSH` segment up to (but not including) the next `MSH` (or a batch-envelope
 *   segment, or end of stream). This mirrors {@link splitBatch}'s in-memory
 *   demarcation exactly, so the streamed decomposition of a buffer is identical
 *   to the whole-buffer one.
 * - **Batch-aware.** The four batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`,
 *   §2.10.3) act as message boundaries — they flush the current message — and are
 *   **never yielded as messages**, so `yielded count == MSH count`. Envelope
 *   **count reconciliation** (BTS-1 / FTS-1) is {@link splitBatch}'s job, not this
 *   surface's: `parseStream` streams *messages*, not a batch report.
 * - **Chunk-boundary invariant.** Segments — including the `MSH|^~\&` header — are
 *   only demarcated once their terminator arrives, so a message split across two
 *   chunks (mid-segment, mid-field, even mid-`MSH`) is reassembled correctly.
 *   Feeding the same bytes in 1-byte chunks vs. one big chunk yields **identical**
 *   messages. A `\r\n` terminator split across a chunk boundary is not mistaken
 *   for a bare `\r` + empty segment (a trailing `\r` waits for the next chunk).
 * - **Terminator tolerance.** `\r`, `\r\n`, and `\n` are all accepted as segment
 *   terminators (Postel's Law — real feeds mix them), matching the core parser's
 *   `normalize`.
 * - **Isolation, never dropped tails.** Each message is parsed by the shipped
 *   {@link parseHL7} (no second grammar; raw extraction semantics unchanged) and
 *   surfaced as either an `ok` entry (its own `.warnings` hold per-message
 *   deviations) or a typed **failure** entry carrying the `Hl7ParseError`. A
 *   corrupt message mid-stream is isolated — it **never suppresses** the messages
 *   after it. A final message that ends without a segment terminator is still
 *   yielded in full, flagged via a stream-level {@link unterminatedStreamMessage}
 *   warning (never a throw), so a truncated feed is surfaced, never silently
 *   dropped.
 *
 * Transport framing (MLLP `<SB>…<EB><CR>`) is **out of scope** — this consumes an
 * already-de-framed stream; `@cosyte/mllp` owns the wire. See
 * `docs-content/spec-notes-stream.md`.
 */

import { Buffer } from "node:buffer";

import { parseHL7 } from "./index.js";
import { Hl7ParseError } from "./errors.js";
import type { Hl7Position, ParseOptions, Profile } from "./types.js";
import { unterminatedStreamMessage } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";

import type { Hl7Message } from "../model/message.js";

/**
 * A chunked source `parseStream` can consume: a Node `Readable`, any
 * async-iterable, or any plain iterable of chunks. Chunks are `string`
 * (text stream) or `Buffer`/`Uint8Array` (binary stream). A real Node stream in
 * binary mode yields `Buffer`s; in text mode it yields `string`s — a source is
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
  | AsyncIterable<string | Buffer | Uint8Array>
  | Iterable<string | Buffer | Uint8Array>;

/**
 * One message yielded by {@link parseStream}. Discriminated on `ok`, mirroring
 * {@link splitBatch}'s per-message entry: a successful parse carries the
 * `Hl7Message` (whose own `.warnings` hold per-message Tier-2 deviations); a
 * message that hit one of the four Tier-3 fatals carries the `Hl7ParseError`
 * instead — **isolated**, so the rest of the stream still yields.
 *
 * `raw` is the message's verbatim source (re-parseable by {@link parseHL7});
 * `position.segmentIndex` is the message's `MSH` (or, for stray pre-`MSH`
 * content, its first) segment index in the overall stream — the streaming
 * analogue of {@link splitBatch}'s message position. `streamWarnings` holds
 * **stream-level** diagnostics that are not per-message parse warnings — today
 * only {@link unterminatedStreamMessage} on a final message that lacked a
 * terminator. It is kept separate from `message.warnings` (which stays exactly
 * what a whole-buffer `parseHL7` of the same bytes would produce) and is
 * **empty** for every message but a possibly-truncated final one. Both the entry
 * and `streamWarnings` are frozen.
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
export type StreamMessageEntry =
  | {
      readonly ok: true;
      readonly message: Hl7Message;
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
 * per-message slice re-encodes to its original bytes for MSH-18 charset
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
 * Extract the next complete segment from `buf` starting at `cursor`, or `null`
 * when the buffer does not yet hold a full segment (more data is needed).
 * Terminators are `\r`, `\r\n`, or `\n`. A trailing `\r` at the very end of a
 * non-final buffer returns `null` (it may be the first half of a `\r\n` split
 * across a chunk boundary — waiting avoids a spurious empty segment); on the
 * final drain (`final: true`) the trailing `\r` is a real terminator.
 *
 * @internal
 */
function nextSegment(
  buf: string,
  cursor: number,
  final: boolean,
): { seg: string; next: number } | null {
  if (cursor >= buf.length) return null;
  const r = buf.indexOf("\r", cursor);
  const n = buf.indexOf("\n", cursor);
  let idx: number;
  let isCr: boolean;
  if (r === -1 && n === -1) return null;
  else if (r === -1) {
    idx = n;
    isCr = false;
  } else if (n === -1) {
    idx = r;
    isCr = true;
  } else if (r < n) {
    idx = r;
    isCr = true;
  } else {
    idx = n;
    isCr = false;
  }
  // A bare trailing \r might be the CR of a \r\n straddling the chunk boundary.
  if (isCr && idx === buf.length - 1 && !final) return null;
  let termLen = 1;
  if (isCr && idx + 1 < buf.length && buf.charCodeAt(idx + 1) === 0x0a) termLen = 2;
  return { seg: buf.slice(cursor, idx), next: idx + termLen };
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
  const input: string | Buffer = wasBuffer ? Buffer.from(rawMessage, "latin1") : rawMessage;
  try {
    const message =
      optionsOrProfile === undefined
        ? parseHL7(input)
        : parseHL7(input, optionsOrProfile as ParseOptions);
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
 * completes, with **O(one-message)** memory — the whole stream is never
 * retained. Demarcates by `MSH` boundaries inside the optional
 * `[FHS] { [BHS] { MSH… } [BTS] } [FTS]` batch frame (HL7 v2 Ch. 2 §2.10.3):
 *
 * - a message split across chunk boundaries (mid-segment, mid-field, even
 *   mid-`MSH|^~\&`) is reassembled correctly — feeding the same bytes in 1-byte
 *   chunks vs. one chunk yields **identical** messages;
 * - `\r`, `\r\n`, and `\n` segment terminators are all tolerated (a `\r\n` split
 *   across a chunk boundary is not mistaken for a bare `\r`);
 * - each message is parsed by the shipped {@link parseHL7} (no second grammar) —
 *   `ok` entries carry the `Hl7Message`, a Tier-3 fatal is an isolated failure
 *   entry; a **malformed message never suppresses later messages**;
 * - batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) are treated as boundaries
 *   and never yielded as messages, so `yielded count == MSH count` (envelope
 *   count reconciliation is {@link splitBatch}'s job);
 * - a final message with no trailing terminator is still yielded, flagged with a
 *   stream-level {@link unterminatedStreamMessage} warning — **never a throw, the
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
 *   if (entry.ok) count += 1; // 2 — one per MSH, streamed, released each time
 * }
 * ```
 */
export function parseStream(
  source: Hl7StreamSource,
): AsyncGenerator<StreamMessageEntry, void, void>;
export function parseStream(
  source: Hl7StreamSource,
  profile: Profile,
): AsyncGenerator<StreamMessageEntry, void, void>;
export function parseStream(
  source: Hl7StreamSource,
  options: ParseOptions,
): AsyncGenerator<StreamMessageEntry, void, void>;
/** @internal — implementation signature; overloads above carry the public JSDoc. */
export async function* parseStream(
  source: Hl7StreamSource,
  optionsOrProfile?: ParseOptions | Profile,
): AsyncGenerator<StreamMessageEntry, void, void> {
  // A bare string is Iterable<string> (of single characters) and a bare Buffer
  // is Iterable<number> (of bytes) — both would be silently mis-consumed as a
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

  // The single partial-segment buffer: text seen but not yet formed into a
  // complete segment. Bounded by one segment (chunked feed) — never the file.
  let pending = "";
  // The current in-flight message's completed segment lines. Released on every
  // flush (yield), so at most one message's worth of lines is ever retained.
  let currentLines: string[] = [];
  let messageStartIndex = -1;
  // The running segment index in the overall stream (blanks included), so a
  // message's position mirrors splitBatch's MSH segment index.
  let globalSegmentIndex = 0;
  // Whether the byte path was taken (binary source) — governs per-message
  // re-encode. Determined by the first chunk; sources are homogeneous.
  let wasBuffer = false;
  let firstChunkSeen = false;
  let bomStripped = false;

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
    const entry = parseStreamEntry(
      currentLines.join("\r"),
      position,
      wasBuffer,
      optionsOrProfile,
      streamWarnings,
    );
    currentLines = [];
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
    // Message body — or stray content before the first MSH, which is kept (never
    // dropped) and surfaces as a NO_MSH_SEGMENT failure entry on flush.
    if (currentLines.length === 0) {
      // A blank line between messages is inter-message whitespace: skip it (its
      // index is still consumed above so positions stay stable).
      if (seg.trim() === "") return null;
      messageStartIndex = thisIndex;
    }
    currentLines.push(seg);
    return null;
  };

  /** Resolve a possibly chunk-split leading BOM before segmenting. */
  const tryStripBom = (final: boolean): void => {
    if (bomStripped || pending.length === 0) return;
    if (pending.charCodeAt(0) === 0xfeff) {
      pending = pending.slice(1);
      bomStripped = true;
    } else if (pending.startsWith("ï»¿")) {
      // UTF-8 BOM read through latin1 (bytes EF BB BF).
      pending = pending.slice(3);
      bomStripped = true;
    } else if (final || !"ï»¿".startsWith(pending)) {
      // Not a BOM (and not a partial BOM prefix awaiting more bytes).
      bomStripped = true;
    }
  };

  for await (const rawChunk of iterateChunks(source)) {
    const { text, wasBuffer: chunkWasBuffer } = decodeChunk(rawChunk);
    if (!firstChunkSeen) {
      wasBuffer = chunkWasBuffer;
      firstChunkSeen = true;
    }
    if (text.length === 0) continue;
    pending += text;
    tryStripBom(false);
    if (!bomStripped) continue; // still disambiguating a split BOM
    let cursor = 0;
    for (;;) {
      const res = nextSegment(pending, cursor, false);
      if (res === null) break;
      cursor = res.next;
      const entry = processSegment(res.seg);
      if (entry !== null) yield entry;
    }
    // Release the consumed prefix; keep only the trailing partial segment.
    pending = pending.slice(cursor);
  }

  // End of stream. Force-resolve any still-pending BOM, then drain every
  // remaining complete segment (final: a trailing \r is now a real terminator).
  tryStripBom(true);
  {
    let cursor = 0;
    for (;;) {
      const res = nextSegment(pending, cursor, true);
      if (res === null) break;
      cursor = res.next;
      const entry = processSegment(res.seg);
      if (entry !== null) yield entry;
    }
    pending = pending.slice(cursor);
  }

  // Whatever is left in `pending` is a final segment with NO terminator (a
  // truncated tail). Route it through the SAME per-segment logic the rest of the
  // stream uses, so a streamed message stays byte-for-byte identical to what
  // `splitBatch` yields for the same bytes: `splitBatch` keeps a final
  // unterminated segment verbatim (its `flushMessage` pops only exact-empty
  // trailing lines, and `processSegment` here skips a whitespace-only line only
  // when no message is open — the same inter-message-noise rule). The
  // stream-level unterminated flag fires only for a genuine (non-blank) content
  // tail, never for trailing whitespace (which is not a truncation signal).
  const tail = pending;
  pending = "";
  let finalUnterminated = false;
  if (tail.length > 0) {
    const flushed = processSegment(tail);
    if (flushed !== null) yield flushed;
    // The message now held in `currentLines` (if any) ends without a terminator.
    finalUnterminated = currentLines.length > 0 && tail.trim() !== "";
  }
  const finalEntry = flush(finalUnterminated);
  if (finalEntry !== null) yield finalEntry;
}
