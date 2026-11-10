---
id: access-patterns
title: The three ways to read a message
sidebar_label: Three ways to read
description: "The three ways to read a parsed message (named helpers, dot-paths, and structural traversal), after a short HL7 v2 primer."
---

# The three ways to read a message

## HL7 v2 in 90 seconds

HL7 v2 is a pipe-delimited messaging format used across US healthcare. A message is a sequence of line-oriented **segments** (3-letter names like `MSH`, `PID`, `OBX`). Each segment carries **fields** separated by `|`; fields decompose into **components** (`^`) and **subcomponents** (`&`). Repeating fields use `~`.

A typical ADT message looks like this:

```
Message
 ├── MSH    (header: sender, receiver, type, timestamp)
 ├── EVN    (event details for ADT)
 ├── PID    (patient identification: name, record number, DOB)
 ├── PV1    (visit: class, location, attending)
 └── OBX×N  (observations: repeats for labs, vitals)

 Each segment   = pipe-delimited (|) fields
 Each field     = caret-delimited (^) components
 Each component = ampersand-delimited (&) subcomponents
```

That is enough HL7 to use this library. [The HL7 v2.x standard reference](./spec-notes-primer.md) has the rest.

There are three ways to reach into a parsed message, from the least HL7 knowledge to the most
control. All three read the same immutable tree, so you can mix them in one function.

## Named helpers

Typed views over the common data. They need no HL7 knowledge, and they return `undefined` (never
throw) when the segment they read is absent, so optional chaining reads naturally.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20250102153045||ORU^R01|EX00080|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F",
);

msg.patient?.mrn; // => "MRN12345"
msg.patient?.fullName; // => "Jane Q Smith"
msg.patient?.dateOfBirth?.precision; // => "day"
msg.meta.type; // => "ORU^R01"
msg.visit; // => undefined
```

Use them for most reads. The how-to guides, starting with
[Read patient and visit](./read-patient-and-visit.md), cover each helper.

## Dot-paths

String paths in HL7's own `SEG.field.component.subcomponent` form. Field, component and
subcomponent numbers count from 1, as the standard does. A bracketed index counts from 0: `OBX[1]`
is the second OBX, and `PID.3[1]` the second repetition of PID-3. Without brackets you read the
first.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20250102153045||ORU^R01|EX00080|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q\r" +
    "OBX|1|NM|GLU^Glucose^LN||120|mg/dL\r" +
    "OBX|2|NM|NA^Sodium^LN||140|mmol/L",
);

msg.get("PID.5.1"); // => "Smith"
msg.get("PID.5.2"); // => "Jane"
msg.get("OBX[1].5"); // => "140"
msg.getAll("OBX").length; // => 2
```

Reach for a dot-path when you want a field no helper surfaces, or for a quick script. A dot-path
returns the decoded text of the first subcomponent it names; the helpers return typed values (the
glucose result above is the number `120` from `msg.observations()`).

## The segment tree

Walk segments, fields, repetitions, components and subcomponents directly: for extractors the
other two do not cover, and for edits.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20250102153045||ORU^R01|EX00080|P|2.5\r" +
    "OBX|1|NM|GLU^Glucose^LN||120|mg/dL\r" +
    "OBX|2|NM|NA^Sodium^LN||140|mmol/L",
);

const rows = msg.segments("OBX").map((obx) => {
  const id = obx.field(3);
  const code = id.value; // OBX-3.1: value reads the first component
  const name = id.repetitions[0]?.components[1]?.subcomponents[0] ?? ""; // OBX-3.2
  return `${code} ${name} = ${obx.field(5).value}`;
});

rows; // => ["GLU Glucose = 120", "NA Sodium = 140"]
msg.segments("OBX")[0]?.field(3).asCwe().text; // => "Glucose"
```

`seg.field(n)` takes the HL7 field number, as a dot-path does. A `Field`'s `value` is the first
subcomponent of the first component of the first repetition; below it, `repetitions`, `components`
and `subcomponents` are plain arrays counted from 0, so OBX-3.2 is `components[1]`. The typed
coercions name the components for you: `asCwe().text` reads the same OBX-3.2, and `asXpn()`,
`asCx()`, `asXad()` and the rest do the same for their types.

Every level is immutable. Changes go through explicit methods: see
[Modify a message](./modify-and-resend.md).

## Put it to use

- [Read patient, visit and message details](./read-patient-and-visit.md)
- [Read lab results, orders and timing](./read-lab-results.md)
- [Modify a message and send it on](./modify-and-resend.md)
