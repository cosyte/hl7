---
id: split-batches-and-streams
title: Split batches and stream large files
sidebar_label: Split batches and streams
description: "Strip MLLP framing, split a batch or file envelope into parsed messages with a bad one isolated, and parse a large feed one message at a time."
---

# Split batches and stream large files

`parseHL7` reads one message. This guide covers input that carries more than one, or more than
the message: MLLP framing bytes, a batch or file envelope, and a feed too large to hold in memory.

## Strip MLLP framing

MLLP wraps each message in a start byte (VT, `0x0b`) and an end pair (FS, `0x1c`, then CR) for TCP.
The parser strips the framing by default and records an `MLLP_FRAMING_STRIPPED` warning.

```ts runnable
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const message =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ADT^A08|EX00060|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR\r";
const framed = "\x0b" + message + "\x1c\r";

const msg = parseHL7(framed);

msg.meta.controlId; // => "EX00060"
msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED); // => true

const strict = parseHL7(message, { stripMllpFraming: false });
strict.meta.controlId; // => "EX00060"
```

Stripping already-stripped input changes nothing. `toString()` never adds framing. To send and
receive over MLLP, use [`@cosyte/mllp`](https://docs.cosyte.com/mllp), which handles framing and
ACK correlation, or add the bytes in your own transport.

## Split a batch or file

Lab, public health and immunization feeds often send many messages in the HL7 batch envelope:
`[FHS] { [BHS] { MSH ... } [BTS] } [FTS]`. `splitBatch` cuts the input at each MSH and returns
every message already parsed. A message that fails to parse comes back as a failure entry beside
its neighbors, never hiding them, and the declared counts in BTS-1 and FTS-1 are checked.

```ts runnable
import { splitBatch } from "@cosyte/hl7";

const message = (id: string): string =>
  `MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|${id}|P|2.5\rPID|1||MRN${id}^^^HOSP^MR\r`;

const file = "BHS|^~\\&|LAB\r" + message("B1") + "MSH|^\r" + message("B3") + "BTS|4\r";

const { messages, warnings } = splitBatch(file);

messages.length; // => 3
messages.map((e) => (e.ok ? e.message.meta.controlId : e.error.code)); // => ["B1", "MSH_TOO_SHORT", "B3"]

warnings.map((w) => w.code); // => ["BATCH_COUNT_MISMATCH"]
```

The trailer above declares four messages and the file holds three, so `BATCH_COUNT_MISMATCH` is
raised and all three are still returned. A batch warning carries counts and positions, never message
text. A message with no envelope comes back as a one-message result.

`splitBatch` splits; it does not enforce. It warns on a missing trailer (`BATCH_MISSING_TRAILER`) and
leaves accepting or rejecting the file to you, it does not write batch acknowledgments, and it does
not remove transport framing. The second argument is passed to `parseHL7` for each message (a
profile, `strict`, `charset`). [Batch and file envelopes](./spec-notes-batch.md) has the rules and
the limits.

## Stream a large feed

[`readMessages`](./read-as-it-arrives.md) is the reader to start with: it takes a string, bytes,
a Node `Readable` or a web `ReadableStream`, reads MLLP frames too, and gives each failed message
its byte position. `parseStream`, below, stays for code that already uses it.

`splitBatch` needs the whole input in memory. `parseStream` reads a source in chunks (a Node
`Readable`, an async iterable, or an iterable of strings or `Buffer`s) and yields each message as
soon as it is complete, holding about one message at a time. A message split across chunks, even
inside `MSH|^~\&`, is put back together: the same bytes in one-byte chunks or one large chunk give
the same messages.

```ts runnable
import { Readable } from "node:stream";

import { parseStream } from "@cosyte/hl7";

const message = (id: string): string =>
  `MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|${id}|P|2.5\rPID|1||MRN${id}^^^HOSP^MR\r`;
const feed = message("S1") + message("S2") + message("S3").trimEnd();

// In production the source is usually createReadStream("feed.hl7").
const source = Readable.from([feed.slice(0, 20), feed.slice(20, 95), feed.slice(95)]);

const seen: string[] = [];
const flags: string[] = [];
for await (const entry of parseStream(source)) {
  if (entry.ok) seen.push(entry.message.meta.controlId ?? "");
  for (const w of entry.streamWarnings) flags.push(w.code);
}

seen; // => ["S1", "S2", "S3"]
flags; // => ["UNTERMINATED_STREAM_MESSAGE"]
```

Each message is parsed by `parseHL7`, so a streamed message is the same one `splitBatch` returns for
the same bytes. A message that fails is a failure entry and later messages still stream. A last
message with no terminator is still yielded, with `UNTERMINATED_STREAM_MESSAGE` on that entry's
`streamWarnings`. Envelope segments (`FHS`, `BHS`, `BTS`, `FTS`) mark boundaries and are never
yielded; checking their counts is `splitBatch`'s job. [Streaming large files](./spec-notes-stream.md)
explains the memory bound and the boundary rules.

## Reference

- [`splitBatch`](./api/README.md#splitbatch), [`BatchSplitResult`](./api/README.md#batchsplitresult),
  [`BatchMessageEntry`](./api/README.md#batchmessageentry)
- [`parseStream`](./api/README.md#parsestream), [`StreamMessageEntry`](./api/README.md#streammessageentry),
  [`Hl7StreamSource`](./api/README.md#hl7streamsource)
- [`ParseOptions`](./api/README.md#parseoptions) (`stripMllpFraming`)
- [`MLLP_FRAMING_STRIPPED`, `BATCH_COUNT_MISMATCH`, `BATCH_MISSING_TRAILER` and
  `UNTERMINATED_STREAM_MESSAGE`](./warning-and-fatal-codes.md)
