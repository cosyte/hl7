---
id: read-lab-results
title: Read lab results, orders and timing
sidebar_label: Read lab results
description: "Read every OBX as a typed observation, group results under the order that requested them, and read an order's timing exactly as the sender wrote it."
---

# Read lab results, orders and timing

This guide reads an observation result (`ORU^R01`): the results, the orders they answer, and the
timing an order or medication carries.

## Read every result

`msg.observations()` returns every OBX in document order, whether or not an OBR groups it. The
coded fields are `CWE` composites: `identifier` is the code and `text` the name.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|EX00002|P|2.5",
  "PID|1||MRN67890^^^HOSP^MR||Doe^Alice^B||19750620|F",
  "OBR|1|ORD-EX-1|FLR-EX-1|CBC^Complete Blood Count^L|||20260419140000",
  "OBX|1|NM|WBC^White Blood Cells^LN||7.5|10*3/uL|4.5-11.0|N|||F",
  "OBX|2|NM|HGB^Hemoglobin^LN||11.9|g/dL|12.0-16.0|L|||F",
  "OBX|3|ST|COMMENT^Comment^L||Specimen slightly hemolyzed||||||F",
].join("\r");

const observations = parseHL7(raw).observations();

observations.length; // => 3

const [wbc, hgb, comment] = observations;
wbc?.identifier.identifier; // => "WBC"
wbc?.identifier.text; // => "White Blood Cells"
wbc?.value; // => 7.5
wbc?.units?.identifier; // => "10*3/uL"
wbc?.referenceRange; // => "4.5-11.0"
hgb?.abnormalFlags; // => "L"
hgb?.status; // => "F"
comment?.value; // => "Specimen slightly hemolyzed"
```

An observation's `value` takes its type from OBX-2: `NM` is a `number`, `SN` a structured
numeric, `TS` and `DT` a fidelity `TS`, `CWE` and `CE` a composite, and every other type a string. `status` is OBX-11
exactly as sent; `resultStatus` classifies it (see
[Result status classification](./spec-notes-result-status.md)).

## Group results under their order

`msg.orders()` returns one entry per OBR, each with the OBX segments that follow it; an ORC just
before an OBR gives that order its `orderControl`. An OBX before the first OBR is in
`observations()` but in no order. Use `orders()` when a result has to stay with the order that
requested it.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01^ORU_R01|EX00003|P|2.5",
  "PID|1||MRN67890^^^HOSP^MR||Doe^Alice^B",
  "OBR|1|ORD-EX-1|FLR-EX-1|CBC^Complete Blood Count^L",
  "OBX|1|NM|WBC^White Blood Cells^LN||7.5|10*3/uL|4.5-11.0|N|||F",
  "OBR|2|ORD-EX-2|FLR-EX-2|BMP^Basic Metabolic Panel^L",
  "OBX|1|NM|GLU^Glucose^LN||120|mg/dL|70-99|H|||F",
  "OBX|2|NM|NA^Sodium^LN||140|mmol/L|135-145|N|||F",
].join("\r");

const orders = parseHL7(raw).orders();

orders.length; // => 2
orders[0]?.placerOrderNumber; // => "ORD-EX-1"
orders[1]?.universalServiceId?.text; // => "Basic Metabolic Panel"
orders[1]?.observations.map((o) => o.identifier.identifier); // => ["GLU", "NA"]
```

## Read an order's timing

Every order and every medication carries `timings`: the TQ1 segments (HL7 v2.5 and later), or the
legacy timing embedded in ORC-7 or RXE-1 when no TQ1 is present.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|PHARM|MAIN|EHR|REF|20260419143000||RDE^O11^RDE_O11|EX00004|P|2.5",
  "PID|1||MRN67890^^^HOSP^MR||Doe^Alice^B",
  "ORC|NW|ORD-EX-9",
  "TQ1|1||Q6H||||20260419150000|||||||24",
  "RXE||00000-0000-00^Example tablet^NDC|500||mg",
].join("\r");

const med = parseHL7(raw).medications()[0];
const timing = med?.timings[0];

timing?.source; // => "TQ1"
timing?.repeatPattern?.code; // => "Q6H"
timing?.repeatPattern?.kind; // => "parametric"
timing?.repeatPattern?.interval; // => { count: 6, unit: "H" }
timing?.totalOccurrences; // => 24
timing?.startDateTime?.raw; // => "20260419150000"
```

The repeat pattern is surfaced as sent. The library never resolves `Q6H` to clock times or maps it
to another frequency: reading `Q6H` as daily, or losing a `BID`, changes the number of doses given.
`kind` records only how the code is written. [Order and medication timing](./spec-notes-timing.md)
has the field map and what is out of scope.

## Reference

- [`Hl7Message`](./api/src/README.md#hl7message) (`observations`, `orders`, `medications`)
- [`Observation`](./api/src/README.md#observation), [`Order`](./api/src/README.md#order),
  [`OrderTiming`](./api/src/README.md#ordertiming), [`RepeatPattern`](./api/src/README.md#repeatpattern)
