---
id: guides-overview
title: Guides
sidebar_position: 1
---

# Guides

Task-oriented recipes against the real API. Each stands alone — jump to the one that matches what
you're doing. For the *why* behind the behavior, follow the links into [Core
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

Numeric `OBX-5` values arrive typed as `number` (here `7.5`), not strings — a fidelity detail, not a
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

Built-ins ship for Epic, Cerner, Meditech, Athena, and a generic lab — each authored through the
same public `defineProfile()` API you'd use yourself. Start from the **profile starter kit** in the
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

`msg.toString()` then emits spec-clean HL7 — correct delimiters, escaping, and an auto-generated MSH
control id. Field array elements are raw field *values*: any delimiter character inside one (e.g. a
`^` in a name) is escaped as data, so pass pre-structured composites when you need components.

## Next

- [Troubleshooting](./troubleshooting) — warnings vs. errors, strict mode, charset, and batches.
- **API Reference** — every export, generated from source.
