---
id: read-patient-and-visit
title: Read patient, visit and message details
sidebar_label: Read patient and visit
description: "Pull the patient's identifiers, name, birth date and address, the visit's location and doctors, and the message type out of a parsed message."
---

# Read patient, visit and message details

This guide reads the fields most integrations start with: who the patient is, where they are, and
what kind of message arrived. Every example parses the same synthetic admission message.

## Read the patient

`msg.patient` reads the PID segment. It is `undefined` when the message has no PID, so use `?.`.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045-0500||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "EVN|A01|20250102153045",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F|||123 Main St^^Springfield^IL^62701||^PRN^PH^^^217^5550147",
  "PV1|1|I|ICU^101^A^MAIN||||1234^Welby^Marcus^^^^MD||||||||||||VISIT001",
].join("\r");

const patient = parseHL7(raw).patient;

patient?.mrn; // => "MRN12345"
patient?.fullName; // => "Jane Q Smith"
patient?.familyName; // => "Smith"
patient?.sex; // => "F"
patient?.dateOfBirth?.raw; // => "19800115"
patient?.dateOfBirth?.precision; // => "day"
patient?.address?.city; // => "Springfield"
patient?.address?.zipOrPostalCode; // => "62701"
patient?.identifiers.length; // => 1
```

`mrn` is the first PID-3 identifier whose type code is `MR`, or the first identifier when none
is typed `MR`; `identifiers` is every PID-3 repetition as a `CX` composite, always present and
possibly empty. A birth date is a fidelity `TS`
that keeps the precision the sender wrote, never a `Date` (see
[Read dates and times](./read-dates-and-times.md)).

## Read the visit

`msg.visit` reads PV1, and is `undefined` when the message has none (most results and orders).
`location` is a `PL` composite; the doctors are `XCN` composites.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045-0500||ADT^A01^ADT_A01|MSG00001|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F",
  "PV1|1|I|ICU^101^A^MAIN||||1234^Welby^Marcus^^^^MD||||||||||||VISIT001",
].join("\r");

const visit = parseHL7(raw).visit;

visit?.patientClass; // => "I"
visit?.location?.pointOfCare; // => "ICU"
visit?.location?.room; // => "101"
visit?.location?.bed; // => "A"
visit?.location?.facility?.namespaceId; // => "MAIN"
visit?.attendingDoctor?.familyName; // => "Welby"
visit?.visitNumber; // => "VISIT001"
```

## Read what kind of message it is

`msg.meta` reads the MSH header, with MSH-9 already split into its three components. Branch on
`messageCode` and `triggerEvent` rather than on `type`: some senders fill MSH-9.3 and some do not,
and `type` carries it when they do.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045-0500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q";

const meta = parseHL7(raw).meta;

meta.type; // => "ADT^A01^ADT_A01"
meta.messageCode; // => "ADT"
meta.triggerEvent; // => "A01"
meta.messageStructure; // => "ADT_A01"
meta.controlId; // => "MSG00001"
meta.sendingApp; // => "CLINIC"
meta.version; // => "2.5"
meta.timestamp?.offsetMinutes; // => -300
```

## Narrow a message to its type

`msg.is("ADT^A01")` makes the same comparison and tells the compiler the answer. Inside the guard
the message code and trigger event are literal types, and `part` and `parts` accept only the
segments that message type's published structure requires.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20250102153045\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q";

const msg = parseHL7(raw);

msg.is("ADT^A01"); // => true
msg.is("ADT^A01^ADT_A01"); // => false

if (msg.is("ADT^A01")) {
  const code: "ADT" = msg.meta.messageCode; // a literal type, no longer optional
  code; // => "ADT"
  msg.part("PID")?.field(3).value; // => "MRN12345"
  msg.parts("EVN").length; // => 1
  // msg.part("OBX"); // does not compile: ADT^A01 does not require OBX
  msg.segments("OBX").length; // => 0
}
```

A key is `"<MSH-9.1>^<MSH-9.2>"`, or the message code alone for a type the published structures
match on the code alone (`"ACK"`). `SUPPORTED_OVERLAY_MESSAGES` lists every key. Any other string,
including the three-component form, returns `false` and never throws.

Narrowing does not promise presence. An `ADT^A01` that arrives without its PID still answers
`true`: `part` returns `undefined` and `parts` an empty list, as `segments` does, and the absence
shows on `msg.structure` (see [Validate a message](./validate-messages.md)).

## Read a field no helper covers

A dot-path reaches any field, component or subcomponent: `SEGMENT.field.component.subcomponent`,
numbered from 1 as the standard numbers them. A bracketed index counts from 0.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A01|MSG00001|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR~XYZ987^^^STATE^SS||Smith^Jane^Q",
  "NK1|1|Smith^John|SPO",
  "NK1|2|Smith^Ann|DAU",
].join("\r");

const msg = parseHL7(raw);

msg.get("PID.5.1"); // => "Smith"
msg.get("PID.5.2"); // => "Jane"
msg.get("PID.3[1].1"); // => "XYZ987"
msg.get("NK1[1].2.2"); // => "Ann"
msg.getAll("NK1").length; // => 2
```

[The three ways to read a message](./access-patterns.md) explains when to reach for a dot-path or
for the segment tree instead of a helper.

## Reference

- [`parseHL7`](./api/README.md#parsehl7), [`Hl7Message`](./api/README.md#hl7message)
- [`Patient`](./api/README.md#patient), [`Visit`](./api/README.md#visit),
  [`Meta`](./api/README.md#meta)
- [`SUPPORTED_OVERLAY_MESSAGES`](./api/README.md#supported_overlay_messages)
