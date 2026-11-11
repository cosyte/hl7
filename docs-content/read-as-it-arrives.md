---
id: read-as-it-arrives
title: Read messages and segments as they arrive
sidebar_label: Read as it arrives
description: "Read a batch, a feed or MLLP frames one message at a time with readMessages, and a very large message one segment at a time with readSegments."
---

# Read messages and segments as they arrive

`parseHL7` reads a message you already hold. Two readers handle input you do not want to hold
whole: `readMessages` yields each message of a batch, a file or a feed as soon as it is complete,
and `readSegments` yields each segment of one very large message. Each holds only the item it is
reading, never the source.

Both take the same sources: a string, a `Uint8Array` or `Buffer`, a Node `Readable`, a web
`ReadableStream` (such as `fetch(...).body`), or any async or plain iterable of string or byte
chunks. Both read the next chunk only when you ask for the next item, so a slow consumer slows
the source down instead of filling memory. Leaving the loop early releases the source: a web stream
is cancelled and a Node stream is destroyed.

## Read a batch one message at a time

`readMessages` finds messages the way `splitBatch` does: each starts at an `MSH` segment, the batch
and file envelope segments (`FHS`, `BHS`, `BTS`, `FTS`) mark boundaries and are not yielded, and
messages simply written one after another need no envelope. Each item is the message `parseHL7`
gives for exactly its own bytes, its warnings included, however the chunks were cut.

```ts runnable
import { Readable } from "node:stream";

import { readMessages } from "@cosyte/hl7";

const message = (id: string): string =>
  `MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|${id}|P|2.5\rPID|1||MRN${id}^^^HOSP^MR\r`;
const file = "BHS|^~\\&|LAB\r" + message("R1") + message("R2") + message("R3") + "BTS|3\r";

// In production the source is usually createReadStream("results.hl7").
const source = Readable.from([file.slice(0, 50), file.slice(50, 140), file.slice(140)]);

const ids: string[] = [];
for await (const item of readMessages(source)) {
  if (item.ok) ids.push(item.message.meta.controlId ?? "");
}

ids; // => ["R1", "R2", "R3"]
```

Each message is parsed lazily, as `parseHL7` parses: a segment's tree is built when something first
reads it. Pass options or a profile as the second argument, as you would to `parseHL7`, for
example `readMessages(source, { lazy: false })` or `readMessages(source, myProfile)`.

## Handle a message that fails

A message that `parseHL7` would refuse is yielded as a failed item, and reading goes on. The item
carries the error, the message's own text or bytes in `raw`, and where it sits in the source:
`byteOffset` and `byteLength` count bytes, and `index` counts the items before it.

```ts runnable
import { readMessages } from "@cosyte/hl7";

const message = (id: string): string =>
  `MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ADT^A08|${id}|P|2.5\r` +
  `EVN|A08|20260419143000\rPID|1||MRN${id}^^^HOSP^MR\rPV1|1|I\r`;
const feed = message("A1") + "MSH|^\r" + message("A3");

const seen: string[] = [];
for await (const item of readMessages(feed)) {
  if (item.ok) seen.push(item.message.meta.controlId ?? "");
  else seen.push(`${item.error.code} at byte ${String(item.byteOffset)}`);
}

seen; // => ["A1", "MSH_TOO_SHORT at byte 113", "A3"]
```

`raw` can hold patient data: set it aside where your other messages go, not in a log.

With `{ strict: true }`, every warning fails its message, and the first failed item is the last
one: reading stops there and the source is released.

```ts runnable
import { readMessages } from "@cosyte/hl7";

const message = (id: string): string =>
  `MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ADT^A08|${id}|P|2.5\r` +
  `EVN|A08|20260419143000\rPID|1||MRN${id}^^^HOSP^MR\rPV1|1|I\r`;
const feed = message("S1") + message("S2") + "ZZZ|1\r" + message("S3");

const codes: string[] = [];
for await (const item of readMessages(feed, { strict: true })) {
  codes.push(item.ok ? "ok" : item.error.code);
}

codes; // => ["ok", "UNKNOWN_SEGMENT"]
```

A last message whose last segment has no terminator is still yielded, with
`UNTERMINATED_STREAM_MESSAGE` in that item's `streamWarnings`: the source may have been cut off.

## Read MLLP frames

`readMessages` also reads the frames `@cosyte/mllp` writes (a VT byte, the message, then FS and
CR), such as a capture of an interface's traffic. Each frame is a message of its own, yielded as
soon as its FS and CR arrive, and it is the message `parseHL7` gives for that frame, with its
`MLLP_FRAMING_STRIPPED` warning.

```ts runnable
import { readMessages } from "@cosyte/hl7";

const frame = (id: string): string =>
  `\x0bMSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ADT^A08|${id}|P|2.5\r` +
  `EVN|A08|20260419143000\rPID|1||MRN${id}^^^HOSP^MR\rPV1|1|I\r\x1c\r`;

const items = [];
for await (const item of readMessages(frame("M1") + frame("M2"))) items.push(item);

items.map((item) => (item.ok ? item.message.meta.controlId : "")); // => ["M1", "M2"]
items.map((item) => (item.ok ? item.message.warnings.map((w) => w.code) : [])); // => [["MLLP_FRAMING_STRIPPED"], ["MLLP_FRAMING_STRIPPED"]]
```

To receive frames over TCP and answer them, use `@cosyte/mllp` itself.

## Read a very large message one segment at a time

A single message can be very large: a result report with thousands of OBX lines, or a document
carried in one field. `readSegments` yields each segment once the next one has begun, built in
full, with the warnings `parseHL7` reports about it. The first segment also carries the warnings
about the message's bytes and framing, and the last one the warnings that need the whole message,
such as a segment its structure requires that never came.

```ts runnable
import { readSegments } from "@cosyte/hl7";

const results = Array.from(
  { length: 1000 },
  (_v, k) => `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|||||F\r`,
);
const report =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20250102153045||ORU^R01|EX00092|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F\r" +
  "OBR|1||ACC1|CBC^Count^LN\r" +
  results.join("");

let count = 0;
let highest = 0;
for await (const { segment, warnings } of readSegments(report)) {
  if (segment.type !== "OBX") continue;
  count += 1;
  highest = Math.max(highest, Number(segment.field(5).value));
  if (warnings.length > 0) console.warn(warnings.map((w) => w.code));
}

count; // => 1000
highest; // => 119
```

A message `parseHL7` refuses (no MSH, a truncated MSH, invalid encoding characters, empty input)
throws the same `Hl7ParseError` before the first segment. Two things differ from reading the
whole message at once, and both are reported rather than hidden:

- Bytes that are not valid in the character set the message declares throw
  `UNSUPPORTED_CHARSET` where they are met. `parseHL7` reads such a message verbatim instead, which
  a reader that has already handed out earlier segments cannot do. Parse that message with
  `parseHL7`.
- With `{ strict: true }`, the first problem in reading order is thrown, after the segments before
  it were yielded. For a message with several problems, that can be a different one from the one
  `parseHL7` throws, since it reads the whole message first.

## Reference

- [`readMessages`](./api/README.md#readmessages), [`ReadMessageItem`](./api/README.md#readmessageitem)
- [`readSegments`](./api/README.md#readsegments), [`ReadSegmentItem`](./api/README.md#readsegmentitem)
- [`Hl7ReadSource`](./api/README.md#hl7readsource)
- [Streaming large files](./spec-notes-stream.md): the boundary rules.
- [Split batches and stream large files](./split-batches-and-streams.md): `splitBatch` and
  `parseStream`.
