---
id: spec-notes-stream
title: "Spec notes: streaming / incremental parse"
sidebar_label: Streaming large files
description: "How parseStream consumes a chunked HL7 v2 source and yields one message per MSH boundary, holding one message of state rather than the whole stream."
---

# Spec notes: streaming / incremental parse

`parseStream(source, optionsOrProfile?)` parses an HL7 v2 byte/text stream
**incrementally**: it consumes a chunked source and yields one message per
`MSH`-delimited boundary as that boundary completes, holding only **one
message** of state, never the whole stream. It is the streaming complement of
[`splitBatch`](./spec-notes-batch.md): `splitBatch` demarcates the messages in a
buffer you already hold in memory; `parseStream` demarcates them as the bytes
arrive, for a feed or file too large to buffer, or a live source.

## Why a separate surface (and what it reuses)

`parseHL7` needs a whole message; `splitBatch` needs a whole file. A feed has
neither. So streaming is its own surface. But it introduces **no second parse
grammar**: once a message's boundaries are known, `parseStream` hands the exact
delimited bytes to `parseHL7` unchanged (forwarding your profile / `strict` /
`charset` / `dateFormats` per message). A streamed message is therefore
byte-for-byte identical to what `splitBatch` produces for the same bytes. The
only new logic is **incremental boundary detection**.

## The source

`parseStream` accepts any of:

- a Node **`Readable`** (a `Readable` is an `AsyncIterable`),
- any **async-iterable** of chunks (`async function*`, a web-stream reader
  adapter, …),
- any plain **iterable** of chunks (an array, a `function*`).

Chunks are `string` (text stream) or `Buffer`/`Uint8Array` (binary stream). A
binary chunk is decoded 1:1 through `latin1` (a lossless byte↔codepoint
mapping) so each message's slice re-encodes to its **original bytes** and its
own MSH-18 charset resolution runs on them, exactly as `splitBatch` does. A
source is expected to be **homogeneous** (all-text or all-binary), which every
real `Readable` is.

A bare `string` or `Buffer` is **rejected** with a `TypeError`: both are
themselves iterable (a string of characters, a Buffer of byte numbers), so
passing one would be silently mis-consumed. Use `parseHL7` for a single message,
or wrap a whole buffer you want to stream: `parseStream([buffer])`.

## Boundary detection: this is engineering, not spec

HL7 v2 Chapter 2 prescribes the message and batch **syntax** but **no
incremental / streaming parse**. The rules below are engineering guidance
justified by the library's Postel's-Law conventions, grounded in the syntax.
They are **not** citable spec mandates.

- **`MSH` at segment start is the message boundary.** A message runs from an
  `MSH` segment up to (but not including) the next `MSH`, the next batch-envelope
  segment, or end of stream. Identical demarcation to `splitBatch`. So the
  streamed decomposition of a buffer equals the whole-buffer one.
- **Batch-aware (§2.10.3).** The four envelope segments `FHS` / `BHS` / `BTS` /
  `FTS` act as boundaries (they close the current message) and are **never
  yielded as messages**. So **`yielded count == MSH count`**. Envelope **count
  reconciliation** (BTS-1 / FTS-1) is `splitBatch`'s job; `parseStream` streams
  *messages*, not a batch report.
- **Terminator tolerance.** `\r`, `\r\n`, and `\n` are all accepted as segment
  terminators (real feeds mix them), matching the core parser's `normalize`.

## Chunk-boundary invariance (the hard part)

A segment (including the `MSH|^~\&` header) is only demarcated once its
**terminator** arrives. Bytes seen before that live in a single bounded
partial-segment buffer. So a message split across two chunks (mid-segment,
mid-field, even mid-`MSH`) is reassembled correctly, and **feeding the same
bytes in 1-byte chunks or one big chunk yields identical messages**
(property-tested across randomized chunk boundaries and 1-byte chunks).

The one subtle case is a **`\r\n` terminator straddling a chunk boundary**: a
`\r` at the very end of the current buffer is *not* yet treated as a terminator:
it waits for the next chunk, because that chunk may begin with the `\n` that
completes a single `\r\n`. Treating it eagerly would invent a spurious empty
segment. (The pathological chunk-split-mid-`MSH|^~\&` and mid-`\r\n` cases are
covered by the property and example suites.)

## Bounded memory (O(one message), not O(file))

`parseStream` retains only the in-flight message's segment lines plus the
partial-segment buffer. A message is flushed (parsed, **yielded, and
released**) the moment the next boundary segment completes; the previous
message is gone before the next is read. The source is pulled **lazily**: to
close message _i_ the stream must read message _i+1_'s `MSH`, so read-ahead is a
**constant one message**, never the whole stream (proven structurally: if it
buffered the file, read-ahead would be O(N)). This is what makes a multi-gigabyte
ELR file or an unbounded live feed tractable, and it keeps PHI from accumulating
in a growing buffer.

## Isolation and fail-safe: never a dropped tail

- A **malformed** message (one of the four Tier-3 fatals, or a `strict`-promoted
  warning) surfaces as a typed **failure entry** carrying the `Hl7ParseError`,
  and the stream **continues**. A bad message never suppresses the messages after
  it (property-tested: inject a malformed message at any position, under any
  chunking → every valid sibling still comes back `ok`, in order).
- An **unterminated final message** (the stream ended while its last segment had
  no terminator) is still yielded **in full**, with an
  `UNTERMINATED_STREAM_MESSAGE` warning on the entry's `streamWarnings`. Never a
  throw, never a dropped tail. Only the *final* message can be unterminated; every
  earlier one is closed by the terminator that precedes the next boundary.

## `streamWarnings` vs `message.warnings`

Per-message parse deviations live on `message.warnings`, exactly as a
whole-buffer `parseHL7` would report them. Streaming changes nothing there. The
entry's separate **`streamWarnings`** carries only *stream-level* diagnostics
(today just `UNTERMINATED_STREAM_MESSAGE`), so the per-message surface stays
identical to the non-streamed parse. Both carry codes + positions only, **never
a field value**, so no PHI is exposed.

## Known limitations

- **Consumes an already-de-framed stream.** MLLP `<SB>…<EB><CR>` framing, ACK
  timing, reconnect, and TLS are [`@cosyte/mllp`](https://docs.cosyte.com/mllp)'s.
  `parseStream` yields *parsed messages*, it does not own the wire.
- **No random access / seek**; ordering is stream order. Not a persistent queue.
- **Envelope reconciliation is not re-implemented** here: if you need the BTS-1 /
  FTS-1 count checks, buffer with `splitBatch`.
- Two concatenated messages with **no terminator between them** cannot be split
  (the second `MSH` is not at a segment start). The parser will not invent a
  boundary the bytes do not contain.

## `readMessages` and `readSegments`

[`readMessages`](./read-as-it-arrives.md) follows the boundary rules above, with three additions:

- **MLLP frames.** A line that begins with VT (after which comes `MSH`) starts a message, and a
  line that ends with FS ends one at once, its CR included: an LF after that CR is not part of the
  frame. So the bytes `@cosyte/mllp` writes are read frame by frame, and each frame is yielded as
  soon as it ends, without waiting for the next one. Each message is the one `parseHL7` gives for
  its frame, with `MLLP_FRAMING_STRIPPED`.
- **Exact bytes.** A message's bytes are passed to `parseHL7` exactly as they arrived, its line
  breaks included, and `byteOffset` and `byteLength` say where they sit in the source (counting the
  UTF-8 bytes of a string source). So `parseHL7` of those bytes gives the same item, whatever the
  chunking.
- **Strict mode stops.** With `{ strict: true }` the first failed item is the last item.

[`readSegments`](./read-as-it-arrives.md) runs the steps `parseHL7` runs on one message (decode by
MSH-18, the byte order mark, MLLP framing, line endings, delimiters, the scanner, the segment-name
and structure checks) one segment at a time, so each segment and its warnings are the ones
`parseHL7` gives for the whole message. It decodes bytes once MSH has arrived, in the character set
MSH-18 or `options.charset` names, a chunk at a time. A segment is built when the next one begins,
and the first only once 42 characters have arrived, so a strict-mode error carries the same
snippet `parseHL7` gives. Its two documented differences, invalid bytes for a strictly decoded set
and the order of strict-mode errors, are on the [how-to page](./read-as-it-arrives.md).

## Put it to use

- [Read messages and segments as they arrive](./read-as-it-arrives.md)

- [Split batches and stream large files](./split-batches-and-streams.md)
