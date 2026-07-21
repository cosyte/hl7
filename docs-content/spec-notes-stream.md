---
id: spec-notes-stream
title: Spec notes — streaming / incremental parse (Phase S)
sidebar_label: Streaming large files
---

# Spec notes — streaming / incremental parse (Phase S)

`parseStream(source, optionsOrProfile?)` parses an HL7 v2 byte/text stream
**incrementally**: it consumes a chunked source and yields one message per
`MSH`-delimited boundary as that boundary completes, holding only **one
message** of state — never the whole stream. It is the streaming complement of
[`splitBatch`](./spec-notes-batch.md): `splitBatch` demarcates the messages in a
buffer you already hold in memory; `parseStream` demarcates them as the bytes
arrive, for a feed or file too large to buffer, or a live source.

## Why a separate surface (and what it reuses)

`parseHL7` needs a whole message; `splitBatch` needs a whole file. A feed has
neither — so streaming is its own surface. But it introduces **no second parse
grammar**: once a message's boundaries are known, `parseStream` hands the exact
delimited bytes to `parseHL7` unchanged (forwarding your profile / `strict` /
`charset` / `dateFormats` per message). A streamed message is therefore
byte-for-byte identical to what `splitBatch` produces for the same bytes — the
only new logic is **incremental boundary detection**.

## The source

`parseStream` accepts any of:

- a Node **`Readable`** (a `Readable` is an `AsyncIterable`),
- any **async-iterable** of chunks (`async function*`, a web-stream reader
  adapter, …),
- any plain **iterable** of chunks (an array, a `function*`).

Chunks are `string` (text stream) or `Buffer`/`Uint8Array` (binary stream). A
binary chunk is decoded 1:1 through `latin1` — a lossless byte↔codepoint
mapping — so each message's slice re-encodes to its **original bytes** and its
own MSH-18 charset resolution runs on them, exactly as `splitBatch` does. A
source is expected to be **homogeneous** (all-text or all-binary), which every
real `Readable` is.

A bare `string` or `Buffer` is **rejected** with a `TypeError`: both are
themselves iterable (a string of characters, a Buffer of byte numbers), so
passing one would be silently mis-consumed. Use `parseHL7` for a single message,
or wrap a whole buffer you want to stream: `parseStream([buffer])`.

## Boundary detection — this is engineering, not spec

HL7 v2 Chapter 2 prescribes the message and batch **syntax** but **no
incremental / streaming parse**. The rules below are engineering guidance
justified by the library's Postel's-Law conventions, grounded in the syntax —
they are **not** citable spec mandates.

- **`MSH` at segment start is the message boundary.** A message runs from an
  `MSH` segment up to (but not including) the next `MSH`, the next batch-envelope
  segment, or end of stream. Identical demarcation to `splitBatch` — so the
  streamed decomposition of a buffer equals the whole-buffer one.
- **Batch-aware (§2.10.3).** The four envelope segments `FHS` / `BHS` / `BTS` /
  `FTS` act as boundaries (they close the current message) and are **never
  yielded as messages** — so **`yielded count == MSH count`**. Envelope **count
  reconciliation** (BTS-1 / FTS-1) is `splitBatch`'s job; `parseStream` streams
  *messages*, not a batch report.
- **Terminator tolerance.** `\r`, `\r\n`, and `\n` are all accepted as segment
  terminators (real feeds mix them), matching the core parser's `normalize`.

## Chunk-boundary invariance (the hard part)

A segment — including the `MSH|^~\&` header — is only demarcated once its
**terminator** arrives. Bytes seen before that live in a single bounded
partial-segment buffer. So a message split across two chunks — mid-segment,
mid-field, even mid-`MSH` — is reassembled correctly, and **feeding the same
bytes in 1-byte chunks or one big chunk yields identical messages**
(property-tested across randomized chunk boundaries and 1-byte chunks).

The one subtle case is a **`\r\n` terminator straddling a chunk boundary**: a
`\r` at the very end of the current buffer is *not* yet treated as a terminator —
it waits for the next chunk, because that chunk may begin with the `\n` that
completes a single `\r\n`. Treating it eagerly would invent a spurious empty
segment. (VERIFY-AT-BUILD from the roadmap — the pathological
chunk-split-mid-`MSH|^~\&` and mid-`\r\n` cases — is covered by the property and
example suites.)

## Bounded memory (O(one message), not O(file))

`parseStream` retains only the in-flight message's segment lines plus the
partial-segment buffer. A message is flushed — parsed, **yielded, and
released** — the moment the next boundary segment completes; the previous
message is gone before the next is read. The source is pulled **lazily**: to
close message _i_ the stream must read message _i+1_'s `MSH`, so read-ahead is a
**constant one message**, never the whole stream (proven structurally — if it
buffered the file, read-ahead would be O(N)). This is what makes a multi-gigabyte
ELR file or an unbounded live feed tractable, and it keeps PHI from accumulating
in a growing buffer.

## Isolation & fail-safe — never a dropped tail

- A **malformed** message (one of the four Tier-3 fatals, or a `strict`-promoted
  warning) surfaces as a typed **failure entry** carrying the `Hl7ParseError` —
  and the stream **continues**. A bad message never suppresses the messages after
  it (property-tested: inject a malformed message at any position, under any
  chunking → every valid sibling still comes back `ok`, in order).
- An **unterminated final message** — the stream ended while its last segment had
  no terminator — is still yielded **in full**, with an
  `UNTERMINATED_STREAM_MESSAGE` warning on the entry's `streamWarnings`. Never a
  throw, never a dropped tail. Only the *final* message can be unterminated; every
  earlier one is closed by the terminator that precedes the next boundary.

## `streamWarnings` vs `message.warnings`

Per-message parse deviations live on `message.warnings`, exactly as a
whole-buffer `parseHL7` would report them — streaming changes nothing there. The
entry's separate **`streamWarnings`** carries only *stream-level* diagnostics
(today just `UNTERMINATED_STREAM_MESSAGE`), so the per-message surface stays
identical to the non-streamed parse. Both carry codes + positions only — **never
a field value**, so no PHI is exposed.

## Known limitations

- **Consumes an already-de-framed stream.** MLLP `<SB>…<EB><CR>` framing, ACK
  timing, reconnect, and TLS are [`@cosyte/mllp`](https://github.com/cosyte/mllp)'s
  — `parseStream` yields *parsed messages*, it does not own the wire.
- **No random access / seek**; ordering is stream order. Not a persistent queue.
- **Envelope reconciliation is not re-implemented** here — if you need the BTS-1 /
  FTS-1 count checks, buffer with `splitBatch`.
- Two concatenated messages with **no terminator between them** cannot be split
  (the second `MSH` is not at a segment start) — the parser will not invent a
  boundary the bytes do not contain.
