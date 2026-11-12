---
id: read-animal-patient
title: Read an animal patient
sidebar_label: Read an animal patient
description: "Read an animal patient's species, breed, strain and production class from PID-35 to PID-38, and write them with the typed builders."
---

# Read an animal patient

A veterinary or research message carries the same PID segment as any other, with four fields for
a patient who is an animal: species (PID-35), breed (PID-36), strain (PID-37) and production class
(PID-38). `msg.patient` reads them by name, so your code never counts fields.

## Read the four fields

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const pid = ["PID", "1", "", "TESTPET01^^^CLINIC^MR", "", "Test^Patient", "", "", "M"];
while (pid.length < 35) pid.push("");
pid.push(
  "SPX01^Test canine^L", // PID-35 species
  "BRX07^Test breed^L", // PID-36 breed
  "Test strain 4", // PID-37 strain
  "PCX02^Test production class^L", // PID-38 production class
);

const raw = [
  "MSH|^~\\&|VETAPP|CLINIC|LAB|REF|20260102101500||ADT^A01^ADT_A01|VET00001|P|2.5",
  "EVN|A01|20260102101500",
  pid.join("|"),
  "PV1|1|O",
].join("\r");

const patient = parseHL7(raw).patient;

patient?.species?.identifier; // => "SPX01"
patient?.species?.text; // => "Test canine"
patient?.breed?.identifier; // => "BRX07"
patient?.strain; // => "Test strain 4"
patient?.productionClass?.text; // => "Test production class"
patient?.sex; // => "M"
```

`species`, `breed` and `productionClass` are `CWE` composites; `strain` is a string. Before HL7
v2.7 the three coded fields are `CE`, whose components a `CWE` reads under the same names. When
PID-38 carries more than one repetition, `productionClass` is the first.

## A field that may not repeat, repeated

PID-35, PID-36 and PID-37 may each hold one value. When a sender repeats one anyway, `species`,
`breed` or `strain` is the first repetition, and `patient.warnings` carries a
`NON_REPEATING_FIELD_REPEATED` warning for that field, naming it and the count and never a value,
so the rest are not dropped unseen. The warnings stay on the patient view; `msg.warnings` is not
changed. With no such field, `warnings` is absent.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const pid = ["PID", "1", "", "TESTPET04^^^CLINIC^MR"];
while (pid.length < 35) pid.push("");
pid.push("SPX01^Test canine^L~SPX02^Test feline^L"); // PID-35, repeated

const raw = [
  "MSH|^~\\&|VETAPP|CLINIC|LAB|REF|20260102101500||ADT^A01^ADT_A01|VET00004|P|2.5",
  pid.join("|"),
].join("\r");

const patient = parseHL7(raw).patient;

patient?.species?.identifier; // => "SPX01"
patient?.warnings?.[0]?.code; // => "NON_REPEATING_FIELD_REPEATED"
patient?.warnings?.[0]?.position; // => { segmentIndex: 1, fieldIndex: 35 }
```

## Absent means the sender sent nothing

Each key is absent when its field is empty, and is read only from its own field. A message from a
human patient's system, which leaves PID-35 to PID-38 empty, has none of the four keys.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|VETAPP|CLINIC|LAB|REF|20260102101500||ADT^A01^ADT_A01|VET00002|P|2.5",
  "PID|1||TESTPET02^^^CLINIC^MR||Test^Patient||||F",
].join("\r");

const patient = parseHL7(raw).patient;

patient?.species; // => undefined
patient?.strain; // => undefined
"breed" in (patient ?? {}); // => false
```

## Neutered status is not a PID field

PID-8 is the administrative sex, and `msg.patient.sex` reads it exactly as it reads any other
patient's. HL7 v2 PID has no field for whether an animal is neutered or spayed, so `msg.patient`
has no such key and never reads one out of PID-8 or any other field. A sender that records it uses
some other segment, such as an observation or a site-defined `Z` segment, and your integration
reads it from there.

## Write them with a builder

The typed PID input that `buildAdt`, `buildOru`, `buildOrm`, `buildVxu` and the other typed
builders share takes the same four names, and writes each at its position with any delimiter in a
value escaped.

```ts runnable
import { buildAdt, parseHL7 } from "@cosyte/hl7";

const msg = buildAdt("A01", {
  controlId: "VET00003",
  timestamp: "20260102101500",
  patient: {
    identifiers: { idNumber: "TESTPET03", identifierTypeCode: "MR" },
    name: { familyName: "Test", givenName: "Patient" },
    administrativeSex: "F",
    species: { identifier: "SPX02", text: "Test feline", nameOfCodingSystem: "L" },
    breed: { identifier: "BRX09", nameOfCodingSystem: "L" },
    strain: "Line A^7",
    productionClass: { text: "Test class" },
  },
});

const pid = msg.toString().split("\r")[2]?.split("|");
pid?.[35]; // => "SPX02^Test feline^L"
pid?.[37]; // => "Line A\\S\\7"

const back = parseHL7(msg.toString()).patient;
back?.strain; // => "Line A^7"
back?.breed?.identifier; // => "BRX09"
```

## Test your own code with generated values

`@cosyte/hl7/arbitraries` has a generator for each field: `species()`, `breed()`,
`productionClass()` and `strain()`. [Property-test your code](./property-test-your-code.md) shows
how to use them.

## Reference

- [`Patient`](./api/src/README.md#patient), [`AdtPatient`](./api/src/README.md#adtpatient),
  [`buildAdt`](./api/src/README.md#buildadt)
