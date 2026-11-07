---
id: access-patterns
title: "Access patterns"
sidebar_label: "Access patterns"
description: "The three ways to read a parsed message (named helpers, dot-paths, and structural traversal), after a short HL7 v2 primer."
---

# Access patterns

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

That's enough HL7 to use this library productively. Everything else is in the spec, but you won't need it.

Three ways to reach into a parsed message, each optimized for a different use case.

## Named helpers

Typed views over the common-case data. Zero HL7 literacy required.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.patient?.mrn); // "MRN12345"
console.log(msg.patient?.fullName); // "Jane Q. Smith"
console.log(msg.patient?.dateOfBirth?.precision); // "day": a birth date is not a full instant
console.log(msg.meta.type); // "ADT^A01"
console.log(msg.meta.timestamp?.raw); // "20250102153045" (MSH-7: fidelity TS)
console.log(msg.visit?.location); // PL composite: pointOfCare/room/bed
```

Use these for the 90% case. Helpers return `undefined` (not throws) when the underlying segment is absent, so optional-chaining stays idiomatic.

## Dot-paths

String paths following HL7's own `SEG.field.component.subcomponent` convention. Field, component, and subcomponent numbers are 1-based to match the spec. A bracketed index counts from 0: `OBX[1]` is the second `OBX` segment and `PID.3[1]` is the second repetition of PID-3. Leave the brackets off to read the first.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.get("PID.5.1")); // family name  -> "Smith"
console.log(msg.get("PID.5.2")); // given name   -> "Jane"
console.log(msg.get("OBX[1].5")); // second OBX (brackets count from 0), value field
console.log(msg.getAll("NK1")); // every next-of-kin segment
```

Reach for dot-paths when you want a specific field the helpers don't surface, or when you're scripting quick extractions without introducing typed imports.

## Structural traversal

Walk the segment/field/component/subcomponent tree directly. For advanced extractors, round-trip edits, and anything the other two patterns don't cover.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

for (const obx of msg.segments("OBX")) {
  const obsId = obx.field(3); // OBX-3, the observation identifier
  const code = obsId.value; // OBX-3.1: value reads the first component
  const name = obsId.repetitions[0]?.components[1]?.subcomponents[0] ?? ""; // OBX-3.2
  const val = obx.field(5).value; // observed value
  console.log(`${code} ${name} = ${val}`);
}

console.log(msg.allSegments().length); // total segments in the message
```

`seg.field(n)` takes the HL7 field number, as a dot-path does. A `Field` has no per-component method. Its `value` reads the first subcomponent of the first component of the first repetition, and below that `repetitions`, `components`, and `subcomponents` are plain arrays indexed from 0, so OBX-3.2 is `components[1]`. The typed coercions name the components for you: `obx.field(3).asCwe().text` reads the same OBX-3.2, and `asXpn()`, `asCx()`, `asXad()`, and the rest do the same for their data types.

Every level (segment / field / repetition / component / subcomponent) is addressable and immutable: mutation happens through explicit methods (see the cookbook).
