---
id: read-large-messages
title: Read a large message without building all of it
sidebar_label: Read large messages
description: "How parseHL7 builds each segment when it is first read, which reads build everything, and how to build the whole tree during the parse with lazy: false."
---

# Read a large message without building all of it

A parsed message is a tree: segments, fields, repetitions, components and subcomponents. Built in
full, that tree holds many times the bytes of the message. Most readers need a few segments of it:
the header, the patient, the visit and a handful of results. So `parseHL7` builds a segment's tree
the first time something reads that segment, and keeps it from then on.

The parse itself still reads the whole message once. Every warning is reported before `parseHL7`
returns, strict mode throws during the parse, and `onWarning` is called during the parse. A
problem is never reported later, when a segment is first read.

## Read a few segments of a long report

Read the segments you need with `part()`, `segments()` or `get()`. Each builds only what it reads.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const results = Array.from(
  { length: 2000 },
  (_v, k) => `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|||||F`,
);
const msg = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20250102153045||ORU^R01|EX00090|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F\r" +
    "OBR|1||ACC1|CBC^Count^LN\r" +
    results.join("\r"),
);

msg.get("PID.5.1"); // => "Smith"
msg.part("PV1"); // => undefined
const firstThree = msg.segments("OBX").slice(0, 3);
firstThree.map((obx) => obx.field(5).value); // => ["80", "81", "82"]
msg.warnings.length; // => 0
```

`segments("OBX")` returns a wrapper for each of the 2,000 results without building any of them.
The three whose `field(5)` was read are built; the other 1,997 are not.

## Know which reads build everything

These reads reach every segment, so they build every segment that has not been read yet:

- `rawSegments`, the whole raw tree;
- `toString()`, `toJSON()` and `prettyPrint()`;
- a helper that reads every segment of a type, such as `observations()` (every OBX),
  `notes()` (every NTE) or `medications()`.

An edit builds the segment it changes, and only that one. A segment that is built stays built.

## Build the whole tree during the parse

Pass `{ lazy: false }` to build every segment during the parse. The result is the same message:
the same values, the same warnings and the same `toString()`.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const text =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20250102153045||ORU^R01|EX00091|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F\r" +
  "OBX|1|NM|GLU^Glucose^LN||95|mg/dL|||||F";

const lazy = parseHL7(text);
const eager = parseHL7(text, { lazy: false });

eager.get("OBX.5"); // => "95"
lazy.toString() === eager.toString(); // => true
```

Use it when the cost of the build belongs inside the parse call (to time the parse, or to finish
all the work before a message is handed on), or when the message is read in full anyway.

## Know what a lazy message keeps

A lazy message keeps the message text and where each segment starts, so it holds the text while it
is alive. For a long report read at a few segments, that is a small part of what the whole tree
would hold.

## Reference

- `ParseOptions.lazy` in the [API reference](./api/README.md#lazy).
- [Performance](./performance.md): what we measure, and how.
