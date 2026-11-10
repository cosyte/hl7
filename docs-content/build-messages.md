---
id: build-messages
title: Build a message
sidebar_label: Build a message
description: "Build an outbound HL7 v2 message from positional fields or from typed objects, check which message types the builders cover, and read it back with the helpers."
---

# Build a message

Two ways to build an outbound message: `buildMessage` with positional fields, when you know the
segments you want, and the typed builders, which take structured values and assemble the segments
a message type requires. Both write spec-clean HL7.

## Build from positional fields

`buildMessage` takes the header values and returns a message you add segments to. Entry `n` of a
field array is field `n + 1`, so leading empty strings skip to the field you want.

```ts runnable
import { buildMessage, parseHL7 } from "@cosyte/hl7";

const msg = buildMessage({
  type: "ADT^A01",
  version: "2.5",
  sendingApp: "CLINIC",
  sendingFacility: "MAIN",
  receivingApp: "LAB",
  receivingFacility: "REF",
}).addSegment("PID", ["1", "", "MRN12345"]);

msg.get("PID.3"); // => "MRN12345"
msg.meta.messageCode; // => "ADT"

const reparsed = parseHL7(msg.toString());
reparsed.patient?.mrn; // => "MRN12345"
reparsed.meta.controlId === msg.meta.controlId; // => true
```

`buildMessage` fills MSH-7 with the current time and MSH-10 with a generated control id. A field
value is data: a delimiter character inside it is escaped, so pass a composite (with
`setComposite`, see [Modify a message](./modify-and-resend.md)) when you need components.

## Build from typed objects

Each typed builder is the counterpart of a read helper. It takes structured values (an `XPN` name,
`CX` identifiers, a `TS` timestamp) and puts every component in place. A delimiter inside a value is
escaped, never read as structure, and the result parses back with no warnings.

| Builder                      | Message                                                     | Read it back with                                  |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `buildAdt(event, init)`      | `ADT` admit, discharge, transfer, merge, move, and identifier change | `msg.patient`, `msg.visit`, `msg.identityEvents()` |
| `buildOru(init)`             | `ORU^R01` observation result                                | `msg.observations()`                               |
| `buildOrm(init)`             | `ORM^O01` general order                                     | `msg.orders()`                                     |
| `buildSiu(event, init)`      | `SIU` scheduling notification                               | `msg.appointments()`                               |
| `buildMdm(event, init)`      | `MDM` clinical document                                     | `msg.documents()`                                  |
| `buildDft(event, init)`      | `DFT` detail financial transaction                          | `msg.charges()`                                    |
| `buildVxu(init)`             | `VXU^V04` vaccination record update                         | `msg.immunizations()`                              |
| `buildAck(inbound, options)` | `ACK` acknowledgment                                        | `interpretAck(msg)`                                |

```ts runnable
import { buildAdt, parseHL7 } from "@cosyte/hl7";

const msg = buildAdt("A01", {
  sendingApp: "CLINIC",
  receivingApp: "LAB",
  patient: {
    identifiers: { idNumber: "MRN12345", identifierTypeCode: "MR" },
    name: { familyName: "Test^Name", givenName: "Ann" },
    birthDateTime: "19880705",
    administrativeSex: "F",
  },
  visit: { patientClass: "I" },
});

const round = parseHL7(msg.toString());

round.patient?.mrn; // => "MRN12345"
round.patient?.familyName; // => "Test^Name"
round.warnings.length; // => 0
```

The `^` in the family name above is escaped on the wire and reads back as the same text. Every
builder works the same way. A scheduling notification takes the appointment and its resources:

```ts runnable
import { buildSiu, parseHL7 } from "@cosyte/hl7";

const msg = buildSiu("S12", {
  sendingApp: "SCHEDULING",
  receivingApp: "EHR",
  appointment: {
    fillerAppointmentId: "FL-2002",
    startDateTime: "20260801090000",
    endDateTime: "20260801093000",
    fillerStatusCode: { identifier: "Booked" },
  },
  resourceGroups: [
    {
      setId: "1",
      resources: [
        { kind: "location", code: { identifier: "OR-1" } },
        { kind: "personnel", person: { idNumber: "9990", familyName: "Welby" } },
      ],
    },
  ],
});

const appointment = parseHL7(msg.toString()).appointments()[0];

appointment?.fillerAppointmentId; // => "FL-2002"
appointment?.startDateTime?.raw; // => "20260801090000"
appointment?.resources.length; // => 2
```

The builders never make a value up. Only what you pass is written, an optional field you leave out
stays absent, and content the message type requires that you did not pass is a `TypeError`, not a
guessed value:

```ts runnable
import { buildDft } from "@cosyte/hl7";

let error: unknown;
try {
  // A financial transaction needs at least one transaction.
  buildDft("P03", { patient: { identifiers: { idNumber: "MRN12345" } }, charges: [] });
} catch (caught) {
  error = caught;
}

error instanceof TypeError; // => true
```

## Check which message types the builders cover

`SUPPORTED_BUILDER_MESSAGES` lists the (message code, trigger event) pairs the typed builders can
write as structurally complete messages, and `supportsBuilderMessage(code, event)` answers for one
pair. The list is derived from the published message structures the parser checks against.

```ts runnable
import { SUPPORTED_BUILDER_MESSAGES, supportsBuilderMessage } from "@cosyte/hl7";

supportsBuilderMessage("SIU", "S12"); // => true
supportsBuilderMessage("ADT", "A20"); // => false
SUPPORTED_BUILDER_MESSAGES.some((m) => m.messageCode === "VXU"); // => true
```

A `false` is not a refusal. A builder that takes a trigger event still writes what you pass for an
event outside the list; the structure check on the parsed message then reports what is missing, as
it would for a message from anywhere else (see [Validate a message](./validate-messages.md)).

## Reference

- [`buildMessage`](./api/README.md#buildmessage), [`buildAdt`](./api/README.md#buildadt),
  [`buildOru`](./api/README.md#buildoru), [`buildOrm`](./api/README.md#buildorm),
  [`buildSiu`](./api/README.md#buildsiu), [`buildMdm`](./api/README.md#buildmdm),
  [`buildDft`](./api/README.md#builddft), [`buildVxu`](./api/README.md#buildvxu)
- [`SUPPORTED_BUILDER_MESSAGES`](./api/README.md#supported_builder_messages),
  [`supportsBuilderMessage`](./api/README.md#supportsbuildermessage)
- [Acknowledge a message](./acknowledge-messages.md) for `buildAck`
