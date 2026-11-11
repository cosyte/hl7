---
id: acknowledge-messages
title: Acknowledge a message
sidebar_label: Acknowledge a message
description: "Answer an inbound message with an ACK that echoes its control id, report an error in an ERR segment, and read an ACK you receive."
---

# Acknowledge a message

`buildAck` writes the acknowledgment you tell it to; it never decides between accept and reject.
`interpretAck` reads an acknowledgment you receive. The MLLP transport, its timing and its framing
belong to [`@cosyte/mllp`](https://docs.cosyte.com/mllp), which builds on these two.

## Accept a message

The ACK swaps sender and receiver, echoes the inbound trigger event and version, and puts the
inbound MSH-10 control id in MSA-2 so the sender can match the two.

```ts runnable
import { buildAck, parseHL7 } from "@cosyte/hl7";

const inbound = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|EX00040|P|2.5\r" +
    "PID|1||MRN67890^^^HOSP^MR||Doe^Alice^B",
);

const ack = buildAck(inbound, { code: "AA" });

ack.meta.sendingApp; // => "EHR"
ack.meta.receivingApp; // => "LAB"
ack.meta.type; // => "ACK^R01^ACK"
ack.toString().split("\r")[1]; // => "MSA|AA|EX00040"
```

MSH-7 is the current UTC time and MSH-10 a new control id, so those two differ on every call.

## Report an error

Pass `AE` (application error) or `AR` (application reject) with one or more errors. Each becomes an
ERR segment carrying a code from HL7 Table 0357, a severity and a location, never a field value from
the message.

```ts runnable
import { buildAck, interpretAck, parseHL7 } from "@cosyte/hl7";

const inbound = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|EX00041|P|2.5\r" +
    "PID|1||MRN67890^^^HOSP^MR",
);

const ack = buildAck(inbound, {
  code: "AE",
  error: { conditionCode: "101", severity: "E", location: "PID^1^5" },
});

ack.toString().split("\r")[2]; // => "ERR||PID^1^5|101^Required field missing^HL70357|E"
interpretAck(ack).errors[0]?.conditionText; // => "Required field missing"
```

## A message with no control id cannot be accepted

When the inbound message has no MSH-10, the ACK cannot be matched to it. `buildAck` then leaves
MSA-2 empty, turns a requested `AA` into `AE` (and `CA` into `CE`), and the ACK carries an
`ACK_NO_CORRELATION_ID` warning. It never writes a positive ACK nobody can verify.

```ts runnable
import { buildAck, parseHL7 } from "@cosyte/hl7";

const inbound = parseHL7("MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|");

const ack = buildAck(inbound, { code: "AA" });

ack.toString().split("\r")[1]; // => "MSA|AE|"
ack.warnings.map((w) => w.code); // => ["ACK_NO_CORRELATION_ID"]
```

## Read an ACK you receive

`interpretAck` reads MSA and ERR into flags you can branch on.

```ts runnable
import { interpretAck, parseHL7 } from "@cosyte/hl7";

const received = parseHL7(
  "MSH|^~\\&|EHR|REF|LAB|MAIN|20260419143005||ACK^R01^ACK|ACK00001|P|2.5\r" +
    "MSA|AR|EX00042",
);

const answer = interpretAck(received);

answer.code; // => "AR"
answer.controlId; // => "EX00042"
answer.accepted; // => false
answer.rejected; // => true
```

One ACK answers one message. Batch acknowledgment is out of scope.

## Reference

- [`buildAck`](./api/src/README.md#buildack), [`BuildAckOptions`](./api/src/README.md#buildackoptions),
  [`AckErrorDetail`](./api/src/README.md#ackerrordetail)
- [`interpretAck`](./api/src/README.md#interpretack),
  [`Acknowledgment`](./api/src/README.md#acknowledgment),
  [`isPositiveAck`](./api/src/README.md#ispositiveack),
  [`detectAckMode`](./api/src/README.md#detectackmode)
- [`ACK_NO_CORRELATION_ID`](./warning-and-fatal-codes.md)
