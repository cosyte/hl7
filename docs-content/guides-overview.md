---
id: guides-overview
title: Guides
sidebar_position: 1
---

# Guides

Task-oriented recipes against the real API. Each stands alone. Jump to the one that matches what
you're doing. For the _why_ behind the behavior, follow the links into [Core
Concepts](./spec-notes-primer).

## Read lab results

`msg.observations()` returns every OBX in document order as a typed `Observation`. The coded fields
(`identifier`, `units`) are `CWE` composites: `.identifier` is the code, `.text` the human-readable
name.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|EX00002|P|2.5",
  "PID|1||MRN67890^^^HOSP^MR||Smith^Alice^B||19750620|F",
  "OBR|1|ORD-EX-1|FLR-EX-1|CBC^Complete Blood Count^L|||20260419140000",
  "OBX|1|NM|WBC^White Blood Cells^LN||7.5|10*3/uL|4.5-11.0|N|||F",
  "OBX|2|NM|HGB^Hemoglobin^LN||14.2|g/dL|13.5-17.5|N|||F",
].join("\r");

const observations = parseHL7(raw).observations();

observations.length; // => 2

const [wbc] = observations;
wbc.identifier.identifier; // => "WBC"
wbc.identifier.text; // => "White Blood Cells"
wbc.value; // => 7.5
wbc.units?.identifier; // => "10*3/uL"
wbc.referenceRange; // => "4.5-11.0"
```

Numeric `OBX-5` values arrive typed as `number` (here `7.5`), not strings: a fidelity detail, not a
string you have to `parseFloat` yourself.

## Apply a vendor profile

Real feeds carry vendor quirks. Apply a built-in profile as the second argument to `parseHL7`, or
declare your own with `defineProfile()`:

```ts runnable
import { parseHL7, profiles } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|EX00001|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M";

const msg = parseHL7(raw, profiles.epic);

msg.patient.mrn; // => "MRN12345"
```

Built-ins ship for Epic, Cerner, Meditech, Athena, a generic lab, and the Visage 7 and Philips Vue
PACS imaging systems, each authored through the same public `defineProfile()` API you'd use
yourself. Start from the **profile starter kit** in the
package's `examples/` to publish your own as a standalone package.

## Build an ACK

`buildAck` turns an inbound message into a spec-clean acknowledgement, echoing the correlation id and
swapping sender/receiver. `msg.toString()` is always spec-clean regardless of how quirky the input
was:

```ts
import { parseHL7, buildAck } from "@cosyte/hl7";

const inbound = parseHL7(raw);
const ack = buildAck(inbound, { code: "AA" }); // AA | AE | AR

ack.toString(); // MSH|^~\&|<receiver>|...|ACK|...  +  MSA|AA|<control-id>
```

For MLLP transport framing and ACK correlation over the wire, see the sibling package
[`@cosyte/mllp`](https://github.com/cosyte/mllp), which adapts over this same `buildAck` primitive.

## Build a message from scratch

`buildMessage` is the outbound counterpart to `parseHL7`: give it the message metadata, append
segments with **positional field arrays** (index 0 is the segment name slot, so leading `""`s skip to
the field you want), then serialize:

```ts runnable
import { buildMessage } from "@cosyte/hl7";

const msg = buildMessage({
  type: "ADT^A01",
  version: "2.5",
  sendingApp: "CLINIC",
  sendingFacility: "MAIN",
  receivingApp: "LAB",
  receivingFacility: "REF",
}).addSegment("PID", ["", "", "MRN12345"]); // PID-3 = MRN12345

msg.get("PID.3"); // => "MRN12345"
```

`msg.toString()` then emits spec-clean HL7: correct delimiters, escaping, and an auto-generated MSH
control id. Field array elements are raw field _values_: any delimiter character inside one (e.g. a
`^` in a name) is escaped as data, so pass pre-structured composites when you need components.

## Author a message from typed objects

The typed builders are the high-level counterparts of the read helpers (`msg.patient`,
`msg.observations`, `msg.orders`, …): pass structured values (an `XPN` name, `CX` identifiers, a `TS`
timestamp) and the builder assembles the segments the message type requires with correct `^`/`&`/`~`
structure. No hand-assembly of delimiters, and any delimiter embedded in a value is **escaped, never
injected**. The result is spec-clean and re-parses with **zero warnings**.

| builder | message | read it back with |
| --- | --- | --- |
| `buildAdt(event, init)` | `ADT` admit, discharge, transfer, merge, move and identifier change | `msg.patient`, `msg.visit`, `msg.identityEvents()` |
| `buildOru(init)` | `ORU^R01` observation result | `msg.observations()` |
| `buildOrm(init)` | `ORM^O01` general order | `msg.orders()` |
| `buildSiu(event, init)` | `SIU` scheduling notification | `msg.appointments()` |
| `buildMdm(event, init)` | `MDM` clinical document | `msg.documents()` |
| `buildDft(event, init)` | `DFT` detail financial transaction | `msg.charges()` |
| `buildVxu(init)` | `VXU^V04` vaccination record update | `msg.immunizations()` |
| `buildAck(inbound, options)` | `ACK` acknowledgment | `interpretAck(msg)` |

```ts runnable
import { buildAdt, parseHL7 } from "@cosyte/hl7";

const msg = buildAdt("A01", {
  sendingApp: "CLINIC",
  receivingApp: "LAB",
  patient: {
    identifiers: { idNumber: "MRN12345", identifierTypeCode: "MR" },
    name: { familyName: "Test", givenName: "Ann" }, // a "^" here would be escaped, not injected
    birthDateTime: "19880705",
    administrativeSex: "F",
  },
  visit: { patientClass: "I" },
});

const round = parseHL7(msg.toString());
round.patient?.mrn; // => "MRN12345"
round.patient?.familyName; // => "Test"
round.warnings.length; // => 0
```

Every family works the same way. A scheduling notification, for example, takes the appointment and
its resource groups and reads back through `msg.appointments()`:

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

const appt = parseHL7(msg.toString()).appointments()[0];
appt?.fillerAppointmentId; // => "FL-2002"
appt?.startDateTime?.raw; // => "20260801090000"
appt?.resources.length; // => 2
```

Builders **never fabricate**: only values you supply are emitted, an omitted optional field stays
absent, and content the message type requires but the init does not carry is a typed `TypeError`,
never a guessed value.

```ts runnable throws
import { buildDft } from "@cosyte/hl7";

// A financial transaction message needs at least one transaction:
buildDft("P03", {
  patient: { identifiers: { idNumber: "MRN12345" } },
  charges: [],
});
```

### Which message types can be authored

`SUPPORTED_BUILDER_MESSAGES` publishes the (message code, trigger event) pairs the typed builders can
author as structurally complete messages, and `supportsBuilderMessage(code, event)` answers for one
pair. The set is derived from the same published message structures the parser checks against, so it
never claims a pair whose structure needs a segment no typed init can supply.

```ts runnable
import { SUPPORTED_BUILDER_MESSAGES, supportsBuilderMessage } from "@cosyte/hl7";

supportsBuilderMessage("SIU", "S12"); // => true
supportsBuilderMessage("ADT", "A20"); // => false
SUPPORTED_BUILDER_MESSAGES.some((m) => m.messageCode === "VXU"); // => true
```

A `false` answer is not a refusal. A builder that takes a trigger event still emits the content you
supply for an event outside the set; the structure summary on the re-parsed message then reports what
is missing, exactly as it does for a message that arrived from anywhere else.

For a lower-level typed set on an existing message, use `msg.setComposite(path, kind, value)` (e.g.
`msg.setComposite("PID.5", "XPN", { familyName: "Doe" })`), or `encodeComposite(kind, value)` to build
a field directly.

## Next

- [Troubleshooting](./troubleshooting): warnings vs. errors, strict mode, charset, and batches.
- **API Reference**: every export, generated from source.
