---
id: process-a-lab-feed
title: "Tutorial: process a lab feed"
sidebar_label: Process a lab feed
description: "Build a small lab-feed processor step by step: split a batch file, read each patient's results, flag the abnormal ones, and answer every message with an ACK."
---

# Tutorial: process a lab feed

In this tutorial we build a small program that takes a lab's batch file, reads every result in
it, lists the abnormal ones, and answers each message with an acknowledgment. Each step is a
complete program you can paste into a file and run with Node.js 22 or later after
`npm install @cosyte/hl7`. Every message is synthetic.

## Step 1: split the batch file

A lab sends its results as one file: a batch header (`BHS`), one message per patient, and a
trailer (`BTS`) that declares how many messages it holds. `splitBatch` returns each message
already parsed.

```ts runnable
import { splitBatch } from "@cosyte/hl7";

const feed = [
  "BHS|^~\\&|LAB|MAIN|EHR|REF|20260419150000",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|LAB-0001|P|2.5",
  "PID|1||MRN10001^^^HOSP^MR||Doe^Alice||19750620|F",
  "OBR|1|ORD-1|FLR-1|BMP^Basic Metabolic Panel^L",
  "OBX|1|NM|GLU^Glucose^LN||182|mg/dL|70-99|H|||F",
  "OBX|2|NM|NA^Sodium^LN||139|mmol/L|135-145|N|||F",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143500||ORU^R01^ORU_R01|LAB-0002|P|2.5",
  "PID|1||MRN10002^^^HOSP^MR||Roe^Bob||19620311|M",
  "OBR|1|ORD-2|FLR-2|CBC^Complete Blood Count^L",
  "OBX|1|NM|HGB^Hemoglobin^LN||10.1|g/dL|13.5-17.5|L|||F",
  "BTS|2",
].join("\r");

const batch = splitBatch(feed);

batch.messages.length; // => 2
batch.warnings; // => []
```

`batch.warnings` is empty because the trailer's count, 2, matches the messages found.

## Step 2: read each patient's results

Each entry is either `{ ok: true, message }` or a failure. For each parsed message, read every
result with `observations()` and key it on the message's control id (MSH-10), which ties a result
back to its message without naming the patient. The record number stays in the message, where the
step that files the result reads it.

```ts runnable
import { splitBatch } from "@cosyte/hl7";

const feed = [
  "BHS|^~\\&|LAB|MAIN|EHR|REF|20260419150000",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|LAB-0001|P|2.5",
  "PID|1||MRN10001^^^HOSP^MR||Doe^Alice||19750620|F",
  "OBR|1|ORD-1|FLR-1|BMP^Basic Metabolic Panel^L",
  "OBX|1|NM|GLU^Glucose^LN||182|mg/dL|70-99|H|||F",
  "OBX|2|NM|NA^Sodium^LN||139|mmol/L|135-145|N|||F",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143500||ORU^R01^ORU_R01|LAB-0002|P|2.5",
  "PID|1||MRN10002^^^HOSP^MR||Roe^Bob||19620311|M",
  "OBR|1|ORD-2|FLR-2|CBC^Complete Blood Count^L",
  "OBX|1|NM|HGB^Hemoglobin^LN||10.1|g/dL|13.5-17.5|L|||F",
  "BTS|2",
].join("\r");

const results: { controlId: string; code: string; value: unknown }[] = [];
for (const entry of splitBatch(feed).messages) {
  if (!entry.ok) continue;
  const controlId = entry.message.meta.controlId ?? "";
  for (const obs of entry.message.observations()) {
    results.push({ controlId, code: obs.identifier.identifier ?? "", value: obs.value });
  }
}

results.map((r) => `${r.controlId} ${r.code}`); // => ["LAB-0001 GLU", "LAB-0001 NA", "LAB-0002 HGB"]
results[0]?.value; // => 182
```

The glucose value is the number `182`, not the string `"182"`: OBX-2 says the value is numeric
(`NM`), so the helper returns a number.

## Step 3: list the abnormal results

OBX-8 carries the lab's abnormal flag: `H` for high, `L` for low, `N` for normal. Keep the results
whose flag is anything other than `N` or empty.

```ts runnable
import { splitBatch } from "@cosyte/hl7";

const feed = [
  "BHS|^~\\&|LAB|MAIN|EHR|REF|20260419150000",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|LAB-0001|P|2.5",
  "PID|1||MRN10001^^^HOSP^MR||Doe^Alice||19750620|F",
  "OBR|1|ORD-1|FLR-1|BMP^Basic Metabolic Panel^L",
  "OBX|1|NM|GLU^Glucose^LN||182|mg/dL|70-99|H|||F",
  "OBX|2|NM|NA^Sodium^LN||139|mmol/L|135-145|N|||F",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143500||ORU^R01^ORU_R01|LAB-0002|P|2.5",
  "PID|1||MRN10002^^^HOSP^MR||Roe^Bob||19620311|M",
  "OBR|1|ORD-2|FLR-2|CBC^Complete Blood Count^L",
  "OBX|1|NM|HGB^Hemoglobin^LN||10.1|g/dL|13.5-17.5|L|||F",
  "BTS|2",
].join("\r");

const abnormal: { controlId: string; code: string; flag: string }[] = [];
for (const entry of splitBatch(feed).messages) {
  if (!entry.ok) continue;
  const controlId = entry.message.meta.controlId ?? "";
  for (const obs of entry.message.observations()) {
    const flag = obs.abnormalFlags ?? "";
    if (flag !== "" && flag !== "N") {
      abnormal.push({ controlId, code: obs.identifier.identifier ?? "", flag });
    }
  }
}

abnormal.map((a) => `${a.controlId} ${a.code} (${a.flag})`); // => ["LAB-0001 GLU (H)", "LAB-0002 HGB (L)"]
```

## Step 4: answer every message

The lab expects one ACK per message. `buildAck` echoes the message's control id so the lab can match
the answer. Accept a message that parsed and carries its results; answer `AE` (application error)
when it is missing the OBR an `ORU^R01` requires. A message that could not be parsed at all has no
control id to echo, so we set it aside for a person to look at.

```ts runnable
import { buildAck, interpretAck, splitBatch } from "@cosyte/hl7";

const feed = [
  "BHS|^~\\&|LAB|MAIN|EHR|REF|20260419150000",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|LAB-0001|P|2.5",
  "PID|1||MRN10001^^^HOSP^MR||Doe^Alice||19750620|F",
  "OBR|1|ORD-1|FLR-1|BMP^Basic Metabolic Panel^L",
  "OBX|1|NM|GLU^Glucose^LN||182|mg/dL|70-99|H|||F",
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143500||ORU^R01^ORU_R01|LAB-0002|P|2.5",
  "PID|1||MRN10002^^^HOSP^MR||Roe^Bob||19620311|M",
  "MSH|^",
  "BTS|3",
].join("\r");

const answers: string[] = [];
const setAside: string[] = [];

for (const entry of splitBatch(feed).messages) {
  if (!entry.ok) {
    setAside.push(entry.error.code);
    continue;
  }
  const missing = entry.message.structure.missingSegments;
  const ack =
    missing.length === 0
      ? buildAck(entry.message, { code: "AA" })
      : buildAck(entry.message, { code: "AE", error: { conditionCode: "100", severity: "E" } });
  const answer = interpretAck(ack);
  answers.push(`${answer.controlId ?? ""} ${answer.code ?? ""}`);
}

answers; // => ["LAB-0001 AA", "LAB-0002 AE"]
setAside; // => ["MSH_TOO_SHORT"]
```

The second message arrived without its OBR, so `msg.structure.missingSegments` names it and we
answer `AE` with condition code `100` (segment sequence error, HL7 Table 0357). The third is not a
message at all, and the batch kept going past it.

## What we built, and where to go next

The program splits a batch, reads typed results, flags the abnormal ones, and answers every message
it can. In production the feed arrives over MLLP; [`@cosyte/mllp`](https://docs.cosyte.com/mllp)
receives it and sends the ACKs back.

- [Split batches and stream large files](./split-batches-and-streams.md): count checks and files
  too large for memory.
- [Read lab results, orders and timing](./read-lab-results.md): results grouped by order.
- [Acknowledge a message](./acknowledge-messages.md): every ACK option.
- [Validate a message](./validate-messages.md): checks beyond a missing segment.
