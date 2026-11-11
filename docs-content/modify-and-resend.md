---
id: modify-and-resend
title: Modify a message and send it on
sidebar_label: Modify and re-send
description: "Change fields, set typed composites, add and remove segments, then serialize spec-clean HL7, a JSON snapshot or a readable dump for logs."
---

# Modify a message and send it on

A parsed message is changed through explicit methods that return the message, so calls chain.
`toString()` then writes spec-clean HL7, whatever quirks the input carried.

## Change a field

`setField` takes the same dot-path as `get`. It creates missing repetitions and components inside
an existing field, and throws a `TypeError` for a segment the message does not have: add the segment
first.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A08^ADT_A01|MSG00002|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F\r" +
  "PV1|1|I|ICU^101^A^MAIN";

const msg = parseHL7(raw);

msg.get("PV1.3.1"); // => "ICU"
msg.setField("PV1.3.1", "WARD-2");
msg.get("PV1.3.1"); // => "WARD-2"

msg.toString().split("\r")[2]; // => "PV1|1|I|WARD-2^101^A^MAIN"
```

The value is taken as data: a delimiter character inside it is escaped when the message is
written, never read as structure.

## Set a typed composite

`setComposite(path, kind, value)` writes a whole composite from an object, with the components in
the right places. `encodeComposite(kind, value)` builds the same field without a message.

```ts runnable
import { encodeComposite, parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A08|MSG00003|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q",
);

msg.setComposite("PID.5", "XPN", { familyName: "Smith-Jones", givenName: "Jane" });
msg.get("PID.5.1"); // => "Smith-Jones"
msg.patient?.fullName; // => "Jane Smith-Jones"

encodeComposite("XPN", { familyName: "Doe", givenName: "John" }).repetitions.length; // => 1
```

## Add and remove segments

`addSegment(name, fields)` appends a segment; entry `n` of the array is field `n + 1`.
`removeSegment(name)` removes the first segment of that type, `removeSegment(name, 1)` the second,
and `removeSegment(name, { all: true })` every one. MSH cannot be removed.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A08|MSG00004|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q\r" +
    "NTE|1||Old note",
);

msg.removeSegment("NTE").addSegment("NTE", ["1", "", "Moved to | ward 2"]);

msg.get("NTE.3"); // => "Moved to | ward 2"
msg.toString().split("\r")[2]; // => "NTE|1||Moved to \\F\\ ward 2"
```

The `|` inside the note is written as the escape `\F\`, so a value can never add a field.

## Serialize

`toString()` writes HL7 with the standard delimiters (`|`, `^`, `~`, `\`, `&`) and a carriage
return after each segment, whatever delimiters the input used. It adds no MLLP framing; for that use
[`@cosyte/mllp`](https://docs.cosyte.com/mllp) or your own transport. `toJSON()` returns a plain,
serializable snapshot of the segment tree, and `JSON.stringify(msg)` calls it.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7("MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A08|MSG00005|P|2.5");

msg.toString(); // => "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A08|MSG00005|P|2.5\r"
Object.keys(msg.toJSON()); // => ["encodingCharacters", "segments", "warnings"]
msg.toJSON().segments.length; // => 1
```

[Emit a schema for the JSON snapshot](./schema-emission.md) describes the shape `toJSON()` returns.

## Print a message for a log

`prettyPrint()` returns a readable dump: a header line, then one line per segment with each
populated field labeled by its number. It is for people reading logs, not for the wire. It prints
field values, so treat it as patient data wherever you log it.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A08^ADT_A01|MSG00006|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F",
);

const lines = msg.prettyPrint().split("\n");
lines[0]; // => "HL7 ADT^A08^ADT_A01  controlId=MSG00006  timestamp=20250102153045  (2 segments)"
lines[2]; // => "PID  [1]=1  [3]=MRN12345^^^HOSP^MR  [5]=Smith^Jane^Q  [7]=19800115  [8]=F"
```

## Reference

- [`Hl7Message`](./api/src/README.md#hl7message) (`setField`, `setComposite`, `addSegment`,
  `removeSegment`, `toString`, `toJSON`, `prettyPrint`)
- [`encodeComposite`](./api/src/README.md#encodecomposite),
  [`CompositeKind`](./api/src/README.md#compositekind),
  [`SerializedMessage`](./api/src/README.md#serializedmessage)
