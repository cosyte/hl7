/**
 * Batch / file envelope splitting for the `@cosyte/hl7` parser (roadmap
 * Phase L). Real lab / ELR / IIS feeds ship many messages wrapped in the HL7
 * v2 batch protocol envelope (Ch. 2 §2.10.3):
 *
 * ```
 * [FHS]                 file header      (optional)
 *   { [BHS]             batch header     (optional, repeats)
 *       { MSH … }       messages         (repeat)
 *     [BTS] }           batch trailer    (optional)
 * [FTS]                 file trailer     (optional)
 * ```
 *
 * `splitBatch()` demarcates the individual `MSH`-led messages by **MSH
 * boundaries**, parses each one with {@link parseHL7} (so every message is
 * returned either as a parsed `Hl7Message` **or** as a typed failure entry —
 * a malformed message mid-stream is isolated, never suppresses its siblings),
 * and reconciles the declared envelope counts (BTS-1 batch message count,
 * FTS-1 file batch count) against the actual counts — surfacing a
 * {@link batchCountMismatch} warning on any mismatch **without ever dropping
 * the tail**. A bare single message with no envelope passes straight through
 * as a one-message result.
 *
 * This is a **separate surface** from `parseHL7` on purpose: `parseHL7` rejects
 * non-`MSH`-first input outright (that is correct for a single-message
 * parser), so batch demarcation lives here. `splitBatch` is a **splitter**, not
 * an enforcer — it does not send batch ACKs, does not enforce any profile's
 * mandatory-envelope rule (it warns via {@link batchMissingTrailer}; the caller
 * decides to reject), and does not de-batch across transport framing (that is
 * `@cosyte/mllp`). See `docs-content/spec-notes-batch.md`.
 */

import { Buffer } from "node:buffer";

import { parseHL7 } from "./index.js";
import { Hl7ParseError } from "./errors.js";
import { normalize } from "./normalize.js";
import { splitSegments } from "./segments.js";
import type { Hl7Position, ParseOptions, Profile } from "./types.js";
import { batchCountMismatch, batchMissingTrailer } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";

import type { Hl7Message } from "../model/message.js";

/**
 * The four HL7 batch-protocol envelope segment names (Ch. 2 §2.10.3).
 *
 * @example
 * ```ts
 * import type { BatchEnvelopeName } from "@cosyte/hl7";
 * const trailer: BatchEnvelopeName = "BTS";
 * ```
 */
export type BatchEnvelopeName = "FHS" | "BHS" | "BTS" | "FTS";

/**
 * A raw batch-envelope segment (`FHS`/`BHS`/`BTS`/`FTS`) surfaced by
 * {@link splitBatch}. `fields` is the segment split on its own field separator
 * with `fields[0]` holding the segment name — deliberately the raw token
 * array, not a typed model: first-class FHS/BHS field helpers are deferred
 * (roadmap Phase L defers "typed FHS/BHS helpers beyond raw fields"). Note the
 * HL7 MSH-family indexing quirk: for `FHS`/`BHS`, `fields[1]` is the
 * encoding-characters field (FHS-2/BHS-2); for `BTS`/`FTS`, `fields[1]` is
 * field 1 (BTS-1 batch message count / FTS-1 file batch count).
 *
 * @example
 * ```ts
 * import { splitBatch } from "@cosyte/hl7";
 * const { fileHeader } = splitBatch("FHS|^~\\&|SENDER\r...");
 * fileHeader?.name; // "FHS"
 * fileHeader?.fields[2]; // "SENDER" (FHS-3, the File Sending Application)
 * ```
 */
export interface BatchEnvelopeSegment {
  readonly name: BatchEnvelopeName;
  /** The verbatim segment string (line-ending normalized). */
  readonly raw: string;
  /** Raw field tokens; `fields[0]` is the segment name. */
  readonly fields: readonly string[];
  /** Position of this envelope segment in the split stream. */
  readonly position: Hl7Position;
}

/**
 * One message extracted from a batch stream. Discriminated on `ok`: a
 * successful parse carries the `Hl7Message` (whose own `.warnings` hold any
 * per-message Tier-2 deviations); a message that hit one of the four Tier-3
 * fatal conditions carries the `Hl7ParseError` instead — **isolated**, so the
 * rest of the batch still yields. `raw` is the message's verbatim source
 * (re-parseable by {@link parseHL7}); `position` is the message's `MSH` (or,
 * for pre-`MSH` stray content, its first) segment index in the stream.
 *
 * @example
 * ```ts
 * import { splitBatch } from "@cosyte/hl7";
 * for (const entry of splitBatch(raw).messages) {
 *   if (entry.ok) handle(entry.message);
 *   else quarantine(entry.raw, entry.error.code);
 * }
 * ```
 */
export type BatchMessageEntry =
  | {
      readonly ok: true;
      readonly message: Hl7Message;
      readonly raw: string;
      readonly position: Hl7Position;
    }
  | {
      readonly ok: false;
      readonly error: Hl7ParseError;
      readonly raw: string;
      readonly position: Hl7Position;
    };

/**
 * One batch within a stream: a run of messages delimited by a `BHS` header
 * and/or a `BTS` trailer (both optional in §2.10.3, so a `BTS` closes a
 * preceding run into a batch even with no `BHS`). A run of messages with
 * **neither** a header nor a trailer is *not* a batch — those messages live in
 * {@link BatchSplitResult.messages} only, so they never inflate a batch count.
 * `declaredMessageCount` is BTS-1 when the trailer declared a usable
 * non-negative integer (it is **optional [0..1]** in the spec, so it may be
 * absent); `actualMessageCount` is always the real count.
 *
 * @example
 * ```ts
 * import { splitBatch } from "@cosyte/hl7";
 * const [batch] = splitBatch(raw).batches;
 * batch?.header?.name; // "BHS" (or undefined for a headerless BTS-closed run)
 * batch?.actualMessageCount; // messages actually in the batch
 * ```
 */
export interface Batch {
  /** The `BHS` header, when this batch was opened by one. */
  readonly header?: BatchEnvelopeSegment;
  /** The `BTS` trailer, when this batch was closed by one. */
  readonly trailer?: BatchEnvelopeSegment;
  /** The messages in this batch, in stream order. */
  readonly messages: readonly BatchMessageEntry[];
  /** BTS-1 batch message count, when declared as a non-negative integer. */
  readonly declaredMessageCount?: number;
  /** The actual number of messages split out of this batch. */
  readonly actualMessageCount: number;
}

/**
 * The result of {@link splitBatch}: the flattened `messages` (every message
 * across every batch, in stream order — the primary surface), the nested
 * `batches`, the raw file envelope segments, and the batch-level `warnings`
 * (count-mismatch / missing-trailer). `hadEnvelope` is `false` for a bare
 * passthrough (no FHS/BHS/BTS/FTS seen).
 *
 * @example
 * ```ts
 * import { splitBatch } from "@cosyte/hl7";
 * const result = splitBatch(rawBatchFile);
 * result.messages.length; // every message, batched or not
 * result.batches.length; // === result.actualBatchCount
 * result.warnings; // BATCH_COUNT_MISMATCH / BATCH_MISSING_TRAILER (counts only)
 * ```
 */
export interface BatchSplitResult {
  /**
   * Every message split out of the stream, in order — the primary surface. This
   * includes messages that belong to no explicit batch (a bare stream, or
   * content outside any `BHS`/`BTS`), so it is a superset of the messages
   * reachable via `batches`.
   */
  readonly messages: readonly BatchMessageEntry[];
  /** The explicit (`BHS`-delimited) batches, in stream order. */
  readonly batches: readonly Batch[];
  /** The **first** `FHS` file header, when present. */
  readonly fileHeader?: BatchEnvelopeSegment;
  /** The **last** `FTS` file trailer, when present. */
  readonly fileTrailer?: BatchEnvelopeSegment;
  /** The last `FTS-1` file batch count, when declared as a non-negative integer. */
  readonly declaredBatchCount?: number;
  /** The number of explicit batches split out of the stream. */
  readonly actualBatchCount: number;
  /** `false` when no envelope segment was seen (bare passthrough). */
  readonly hadEnvelope: boolean;
  /** Batch-level warnings (count mismatch, missing trailer); counts/positions only, never PHI. */
  readonly warnings: readonly Hl7ParseWarning[];
}

/** Mutable batch accumulator used while walking; frozen into a {@link Batch} at the end. */
interface MutableBatch {
  header?: BatchEnvelopeSegment;
  trailer?: BatchEnvelopeSegment;
  readonly messages: BatchMessageEntry[];
  /** BTS-1 once reconciled at close (undefined when absent/non-numeric). */
  declaredMessageCount?: number;
}

/**
 * The 3-character HL7 segment name at the start of a segment string. HL7
 * segment IDs are always exactly three characters, so a fixed slice is correct.
 *
 * Deliberately **case-sensitive** (no upper-casing): the batch-boundary segment
 * names (`FHS`/`BHS`/`BTS`/`FTS`/`MSH`) are only recognized when spelled in
 * their canonical uppercase form. This is a fail-safe against a lenient lowercase
 * body segment (e.g. `fts`) being mistaken for an envelope boundary — the
 * boundary segments cannot be disambiguated from a same-named body segment by
 * anything but their reserved name, so we keep the match strict. A lowercase
 * `msh`-led message is not a valid message anyway (`parseHL7`'s delimiter reader
 * requires an uppercase `MSH`), so declining to treat it as a boundary loses
 * nothing. See the reserved-name limitation in `docs-content/spec-notes-batch.md`.
 *
 * @internal
 */
function segmentName(raw: string): string {
  return raw.slice(0, 3);
}

/** @internal — narrow a 3-char name to a batch-envelope segment name. */
function isEnvelopeName(name: string): name is BatchEnvelopeName {
  return name === "FHS" || name === "BHS" || name === "BTS" || name === "FTS";
}

/**
 * Split an envelope segment into its raw field tokens on its own field
 * separator (the character at index 3, immediately after the 3-char name — the
 * same self-describing convention MSH uses). Returns `[name]` when the segment
 * has no field separator (a bare 3-char segment).
 *
 * @internal
 */
function envelopeFields(raw: string): readonly string[] {
  const separator = raw.charAt(3);
  if (separator === "") return Object.freeze([raw.slice(0, 3)]);
  return Object.freeze(raw.split(separator));
}

/** @internal — build a frozen {@link BatchEnvelopeSegment}. */
function makeEnvelope(
  name: BatchEnvelopeName,
  raw: string,
  segmentIndex: number,
): BatchEnvelopeSegment {
  return Object.freeze({
    name,
    raw,
    fields: envelopeFields(raw),
    position: Object.freeze({ segmentIndex }),
  });
}

/**
 * Parse a declared envelope count. Returns the value only for a trimmed,
 * strictly-numeric, safe non-negative integer; `undefined` for an absent,
 * blank, or non-numeric token — so an absent BTS-1 ([0..1] in the spec) or a
 * garbage count tolerantly disables reconciliation rather than fabricating a
 * mismatch.
 *
 * @internal
 */
function parseDeclaredCount(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const trimmed = token.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Parse one demarcated message and classify it. A successful {@link parseHL7}
 * yields an `ok` entry; one of the four Tier-3 fatals (`EMPTY_INPUT`,
 * `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`) — or, under
 * `strict`, a promoted Tier-2 warning — is caught and returned as a typed
 * failure entry so it never suppresses the sibling messages. Any non-parser
 * throw is genuinely unexpected and re-raised.
 *
 * A `Buffer` stream is decoded/re-encoded via `latin1` (a lossless 1:1
 * byte↔codepoint mapping) so each message's own MSH-18 charset resolution runs
 * on its original bytes rather than a stream-wide guess.
 *
 * @internal
 */
function parseEntry(
  rawMessage: string,
  position: Hl7Position,
  wasBuffer: boolean,
  optionsOrProfile: ParseOptions | Profile | undefined,
): BatchMessageEntry {
  const input: string | Buffer = wasBuffer ? Buffer.from(rawMessage, "latin1") : rawMessage;
  try {
    // parseHL7 re-discriminates Profile vs ParseOptions from the argument's
    // runtime shape (its overloads share one implementation), so forwarding the
    // caller's second argument unchanged preserves identical per-message
    // semantics. The cast only selects an overload signature.
    const message =
      optionsOrProfile === undefined
        ? parseHL7(input)
        : parseHL7(input, optionsOrProfile as ParseOptions);
    return { ok: true, message, raw: rawMessage, position };
  } catch (error) {
    if (error instanceof Hl7ParseError) {
      return { ok: false, error, raw: rawMessage, position };
    }
    throw error;
  }
}

/**
 * Split a raw HL7 v2 **batch / file** stream into its individual messages plus
 * the envelope metadata. Demarcates by `MSH` boundaries inside the optional
 * `[FHS] { [BHS] { MSH… } [BTS] } [FTS]` frame (HL7 v2 Ch. 2 §2.10.3):
 *
 * - handles a file with **multiple batches** and a batch with multiple messages;
 * - a **bare single message** (no envelope) passes straight through as one entry;
 * - a **malformed message mid-batch is isolated** (returned as a typed failure
 *   entry) — its siblings are still returned, the tail is never dropped;
 * - reconciles BTS-1 (batch message count) and FTS-1 (file batch count) and
 *   emits {@link batchCountMismatch} on a mismatch — counts only, never PHI;
 * - emits {@link batchMissingTrailer} when a `BHS`/`FHS` header opens a scope no
 *   `BTS`/`FTS` closes — a warning, never a throw (the caller decides to reject).
 *
 * The second argument, when given, is forwarded verbatim to {@link parseHL7}
 * for **each** message (profile, `strict`, `charset`, `dateFormats`, …). Under
 * `strict`, a message that would warn surfaces as a failure entry (still
 * isolated). `splitBatch` itself never throws — an empty stream yields an empty
 * result.
 *
 * @example
 * ```ts
 * import { splitBatch } from "@cosyte/hl7";
 *
 * const { messages, warnings } = splitBatch(
 *   "FHS|^~\\&|SENDER\r" +
 *     "BHS|^~\\&|SENDER\r" +
 *     "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r" +
 *     "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r" +
 *     "BTS|2\rFTS|1\r",
 * );
 * console.log(messages.length); // 2
 * for (const entry of messages) {
 *   if (entry.ok) console.log(entry.message.version); // "2.5"
 * }
 * console.log(warnings.length); // 0 — declared counts match
 * ```
 */
export function splitBatch(raw: string | Buffer): BatchSplitResult;
export function splitBatch(raw: string | Buffer, profile: Profile): BatchSplitResult;
export function splitBatch(raw: string | Buffer, options: ParseOptions): BatchSplitResult;
/** @internal — implementation signature; overloads above carry the public JSDoc. */
export function splitBatch(
  raw: string | Buffer,
  optionsOrProfile?: ParseOptions | Profile,
): BatchSplitResult {
  const wasBuffer = typeof raw !== "string";
  // latin1 is a lossless byte↔codepoint decode: envelope segments + the \r
  // segment terminator are ASCII, so demarcation is exact, and each message
  // slice re-encodes to its original bytes for per-message MSH-18 charset
  // resolution. NB: stream-level line-ending `normalize()` runs before that
  // per-message decode — correct for the single-byte / ASCII-superset charsets
  // HL7 batch framing uses (its \r terminator must be a single 0x0D byte), but
  // not a byte-exact substitute for a multi-byte charset (e.g. UTF-16) whose
  // payload embeds 0x0A/0x0D bytes. Such batch files effectively do not exist.
  let text = wasBuffer ? raw.toString("latin1") : raw;

  // Strip a leading BOM (UTF-8 as a string codepoint, or its raw latin1 bytes)
  // so the first FHS/MSH is still detected. Per-message BOMs are stripped again
  // by parseHL7.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  } else if (text.startsWith("ï»¿")) {
    text = text.slice(3);
  }

  const segments = splitSegments(normalize(text));

  const flattened: BatchMessageEntry[] = [];
  const batches: MutableBatch[] = [];
  const warnings: Hl7ParseWarning[] = [];
  let fileHeader: BatchEnvelopeSegment | undefined;
  let fileTrailer: BatchEnvelopeSegment | undefined;
  let hadEnvelope = false;

  // A batch is a run of messages delimited by a `BHS` header AND/OR a `BTS`
  // trailer — both are optional in the §2.10.3 grammar, so a `BTS` closes the
  // preceding run into a batch even with no `BHS`. `pendingMessages` accumulates
  // the messages since the last boundary; `currentHeader` is the `BHS` that
  // opened the current run, if any. A run with NEITHER a header nor a trailer is
  // stray — kept in `flattened`/`messages` only, so it never inflates the FTS-1
  // batch count.
  let currentHeader: BatchEnvelopeSegment | undefined;
  let pendingMessages: BatchMessageEntry[] = [];
  let messageLines: string[] = [];
  let messageIndex = -1;

  // Per-file scoping so FTS-1 reconciles against the batches of THIS file only
  // (a concatenated second `FHS` resets the count instead of double-counting).
  let openFileHeader: BatchEnvelopeSegment | undefined; // an FHS awaiting its FTS
  let fileBatchCount = 0; // batches seen since the last FHS
  let lastDeclaredBatchCount: number | undefined; // most recent FTS-1

  const flushMessage = (): void => {
    // A blank segment right before a boundary is inter-message whitespace, not
    // part of the message (parseHL7 likewise strips a single trailing CR), so
    // drop trailing empties. Interior empties were already kept below.
    while (messageLines.length > 0 && messageLines[messageLines.length - 1] === "") {
      messageLines.pop();
    }
    if (messageLines.length === 0) {
      messageIndex = -1;
      return;
    }
    const entry = parseEntry(
      messageLines.join("\r"),
      Object.freeze({ segmentIndex: messageIndex }),
      wasBuffer,
      optionsOrProfile,
    );
    flattened.push(entry);
    pendingMessages.push(entry);
    messageLines = [];
    messageIndex = -1;
  };

  // Finalize the pending message run. A `BTS` trailer always closes the run into
  // a batch (headerless or headed) and reconciles BTS-1 — except a lone `BTS`
  // closing nothing (no messages, no header), which is ignorable noise. Without
  // a trailer, only a `BHS`-opened run is a batch (and warns for its missing
  // BTS); a headerless, trailer-less run is stray.
  const finalizeBatch = (trailer?: BatchEnvelopeSegment): void => {
    flushMessage();
    if (trailer !== undefined) {
      if (pendingMessages.length > 0 || currentHeader !== undefined) {
        const batch: MutableBatch = { messages: pendingMessages, trailer };
        if (currentHeader !== undefined) batch.header = currentHeader;
        const declared = parseDeclaredCount(trailer.fields[1]);
        if (declared !== undefined) {
          batch.declaredMessageCount = declared;
          if (declared !== pendingMessages.length) {
            warnings.push(
              batchCountMismatch(trailer.position, "message", declared, pendingMessages.length),
            );
          }
        }
        batches.push(batch);
        fileBatchCount += 1;
      }
    } else if (currentHeader !== undefined) {
      warnings.push(batchMissingTrailer(currentHeader.position, "BHS", "BTS"));
      batches.push({ messages: pendingMessages, header: currentHeader });
      fileBatchCount += 1;
    }
    // else: headerless, trailer-less run -> stray (already in `flattened`).
    pendingMessages = [];
    currentHeader = undefined;
  };

  // Close the current file scope. With an FTS trailer: reconcile FTS-1 against
  // the batches of this file. Without one (a new FHS, or end of stream): if a
  // file header was open, warn that it never got its FTS.
  const closeFile = (trailer?: BatchEnvelopeSegment): void => {
    finalizeBatch();
    if (trailer !== undefined) {
      fileTrailer = trailer;
      const declared = parseDeclaredCount(trailer.fields[1]);
      if (declared !== undefined) {
        lastDeclaredBatchCount = declared;
        if (declared !== fileBatchCount) {
          warnings.push(batchCountMismatch(trailer.position, "batch", declared, fileBatchCount));
        }
      }
    } else if (openFileHeader !== undefined) {
      warnings.push(batchMissingTrailer(openFileHeader.position, "FHS", "FTS"));
    }
    openFileHeader = undefined;
    fileBatchCount = 0;
  };

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment === undefined) continue;
    // Skip a blank / whitespace-only line ONLY between messages — it is
    // inter-message whitespace carrying no segment content (splitBatch is
    // deliberately more tolerant of stream-level whitespace than parseHL7). A
    // blank segment INSIDE an open message is meaningful (HL7 keeps middle empty
    // segments for positional stability) and rides along so the message's `raw`
    // re-parses identically.
    if (messageLines.length === 0 && segment.trim() === "") continue;
    const name = segmentName(segment);

    if (isEnvelopeName(name)) {
      hadEnvelope = true;
      if (name === "FHS") {
        closeFile(); // close any prior file (warns if it had no FTS)
        const env = makeEnvelope("FHS", segment, index);
        if (fileHeader === undefined) fileHeader = env; // result field keeps the first
        openFileHeader = env;
      } else if (name === "FTS") {
        closeFile(makeEnvelope("FTS", segment, index));
      } else if (name === "BHS") {
        finalizeBatch(); // close the prior run before opening a new batch
        currentHeader = makeEnvelope("BHS", segment, index);
      } else {
        finalizeBatch(makeEnvelope("BTS", segment, index));
      }
      continue;
    }

    if (name === "MSH") {
      flushMessage();
      messageLines = [segment];
      messageIndex = index;
      continue;
    }

    // Message body — or stray content before the first MSH / a body segment
    // severed by a reserved-name boundary, which is kept (never dropped) and
    // surfaces as a NO_MSH_SEGMENT failure entry on flush.
    if (messageLines.length === 0) messageIndex = index;
    messageLines.push(segment);
  }

  closeFile(); // flush the final message + batch, and any still-open file header

  const publicBatches: Batch[] = batches.map((batch) => {
    const publicBatch: Batch = {
      messages: Object.freeze(batch.messages),
      actualMessageCount: batch.messages.length,
      ...(batch.header !== undefined ? { header: batch.header } : {}),
      ...(batch.trailer !== undefined ? { trailer: batch.trailer } : {}),
      ...(batch.declaredMessageCount !== undefined
        ? { declaredMessageCount: batch.declaredMessageCount }
        : {}),
    };
    return Object.freeze(publicBatch);
  });

  const result: BatchSplitResult = {
    messages: Object.freeze(flattened),
    batches: Object.freeze(publicBatches),
    actualBatchCount: publicBatches.length,
    hadEnvelope,
    warnings: Object.freeze(warnings),
    ...(fileHeader !== undefined ? { fileHeader } : {}),
    ...(fileTrailer !== undefined ? { fileTrailer } : {}),
    ...(lastDeclaredBatchCount !== undefined ? { declaredBatchCount: lastDeclaredBatchCount } : {}),
  };
  return Object.freeze(result);
}
