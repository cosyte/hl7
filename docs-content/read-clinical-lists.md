---
id: read-clinical-lists
title: Read allergies, medications, immunizations and other lists
sidebar_label: Read clinical lists
description: "Read allergies, medications, immunizations, next of kin, diagnoses, insurance, appointments, documents and charges as typed lists, reported and never applied."
---

# Read allergies, medications, immunizations and other lists

Each repeating segment family has a helper that returns a typed, frozen list in document order.
The helpers report what the sender sent. None of them applies an action: a delete request is
returned marked as one, and nothing is removed for you.

## Read allergies

`msg.allergies()` reads every AL1 and every IAM segment, one entry per segment. An `ADT^A60`
carries its allergies in IAM with no AL1, so it is read too. `source` names the segment.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EHR|MAIN|LAB|REF|20260419101500||ADT^A60^ADT_A60|EX00010|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q",
  "IAM|1|DA|PCN^Penicillin^L|SV|Hives|A|ALG-1^EHR",
  "IAM|2|DA|SUL^Sulfa^L|MO|Rash|D|ALG-2^EHR",
].join("\r");

const [penicillin, sulfa] = parseHL7(raw).allergies();

penicillin?.source; // => "IAM"
penicillin?.code?.text; // => "Penicillin"
penicillin?.severity; // => "SV"
penicillin?.reaction; // => "Hives"
sulfa?.actionCode; // => "D"
sulfa?.deleteRequested; // => true
sulfa?.uniqueIdentifier; // => { entityIdentifier: "ALG-2", namespaceId: "EHR" }
```

`actionCode` is IAM-6 as sent, and absent when IAM-6 is empty rather than assumed to be `A`. A
`D` entry is still returned, marked `deleteRequested: true`; a `U` entry does not replace an
earlier one; an AL1 and an IAM for the same allergen are two entries. The library holds no allergy
list to apply them to, so that is the receiver's call.

The helper reads IAM-2 to IAM-7 only, and IAM-2 and IAM-4 as their first component and IAM-5 as its
first repetition. It does not read the IAR or NTE segments under an IAM. A missing IAM-7 stays
missing: IAM-3 is never used in its place. Reach the rest with `msg.segments("IAM")`.

## Read medications

`msg.medications()` reads each pharmacy order group. `orderControl` is the ORC-1 of the ORC that
opened the group (`NW`, `DC`, `HD` and the rest) exactly as sent, never an interpreted state such as
active or discontinued, and absent when no ORC opens the group or ORC-1 is empty.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|PHARM|MAIN|EHR|REF|20260419143000||RDE^O11^RDE_O11|EX00011|P|2.5",
  "PID|1||MRN67890^^^HOSP^MR||Doe^Alice^B",
  "ORC|DC|ORD-EX-7",
  "RXE||00000-0000-00^Example tablet^NDC|500||mg",
].join("\r");

const med = parseHL7(raw).medications()[0];

med?.orderControl; // => "DC"
med?.giveCode?.text; // => "Example tablet"
```

## Read immunizations

`msg.immunizations()` reads each RXA. `administrationStatus` classifies the record from that
RXA's own RXA-21, RXA-5 and RXA-20: `completed` for a dose given (`CP` or `PA`), `not-done` for a
refused or not given dose (`RE` or `NA`), `no-vaccine-administered` for a CVX `998` placeholder,
`delete-requested` for an RXA-21 `D`, and `undetermined` for anything not exactly mapped, never
`completed`. The raw codes ride beside it with the field that decided.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// A dose given, a refusal, and a request to delete the first dose.
const given = "RXA|0|1|20260801||115^Tdap^CVX|0.5|mL^^UCUM" + "|".repeat(13);
const raw = [
  "MSH|^~\\&|EHR|CLINIC|IIS|STATE|20260801101500||VXU^V04^VXU_V04|EX00012|P|2.5.1",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q",
  given + "CP|A",
  "RXA|0|1|20260801||115^Tdap^CVX|999" + "|".repeat(12) + "00^Parental decision^NIP002||RE|A",
  given + "CP|D",
].join("\r");

const [dose, refusal, deletion] = parseHL7(raw).immunizations();

dose?.vaccineCode?.text; // => "Tdap"
dose?.administrationStatus.classification; // => "completed"
refusal?.administrationStatus.classification; // => "not-done"
deletion?.administrationStatus.classification; // => "delete-requested"
deletion?.administrationStatus.actionCode; // => "D"
```

[Immunization administration status](./spec-notes-immunization-status.md) has every rule and its
source.

## Read next of kin, diagnoses and insurance

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EHR|MAIN|LAB|REF|20260419101500||ADT^A01^ADT_A01|EX00013|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q",
  "NK1|1|Smith^John|SPO^Spouse^HL70063",
  "DG1|1||E11.9^Type 2 diabetes mellitus without complications^I10||20260419|A",
  "IN1|1|PLAN01^Example Plan^L|INS01|Example Insurance Co",
].join("\r");

const msg = parseHL7(raw);

msg.nextOfKin()[0]?.name?.givenName; // => "John" /* synthetic */
msg.nextOfKin()[0]?.relationship?.identifier; // => "SPO"
msg.diagnoses()[0]?.code?.identifier; // => "E11.9"
msg.diagnoses()[0]?.type; // => "A"
msg.insurance()[0]?.planId?.text; // => "Example Plan"
msg.insurance()[0]?.companyName; // => "Example Insurance Co"
```

## Read appointments, documents and charges

Three helpers cover scheduling (`SIU`), medical records (`MDM`) and financial transactions
(`DFT`). They read the core fields of the common trigger events. They are not a scheduling
workflow, a signature check or a pricing engine.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const siu = [
  "MSH|^~\\&|SCHED|MAIN|EHR|REF|20260801080000||SIU^S12^SIU_S12|EX00014|P|2.5",
  "SCH|PL-1|FL-2002|||||||||||||||||||||||Booked",
  "AIL|1||OR-1",
  "AIP|1||9990^Welby^Marcus",
].join("\r");

const appointment = parseHL7(siu).appointments()[0];
appointment?.fillerAppointmentId; // => "FL-2002"
appointment?.fillerStatusCode?.identifier; // => "Booked"
appointment?.resources.map((r) => r.kind); // => ["location", "personnel"]
```

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const mdm = [
  "MSH|^~\\&|EHR|MAIN|DMS|REF|20260419101500||MDM^T02^MDM_T02|EX00015|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q",
  "TXA|1|DS|TX|||||||||DOC-1|||||IP||AV",
].join("\r");

const doc = parseHL7(mdm).documents()[0];
doc?.completionStatus; // => "IP"
doc?.availabilityStatus; // => "AV"
```

A document's completion status (TXA-17) and its availability (TXA-19) are separate fields and stay
separate: a document can be available before it is authenticated, and reading a preliminary
document as final is the mistake the split prevents.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const dft = [
  "MSH|^~\\&|EHR|MAIN|BILL|REF|20260419101500||DFT^P03^DFT_P03|EX00016|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q",
  "FT1|1|||20260419||CG|99213^Office visit^CPT|||1|150.00^USD",
].join("\r");

const charge = parseHL7(dft).charges()[0];
charge?.transactionType; // => "CG"
charge?.transactionCode?.identifier; // => "99213"
charge?.amountExtended; // => "150.00^USD"
```

An amount stays the wire text, never a floating-point number.

## Reference

- [`Allergy`](./api/src/README.md#allergy), [`Medication`](./api/src/README.md#medication),
  [`Immunization`](./api/src/README.md#immunization),
  [`ImmunizationAdministrationStatus`](./api/src/README.md#immunizationadministrationstatus)
- [`NextOfKin`](./api/src/README.md#nextofkin), [`Diagnosis`](./api/src/README.md#diagnosis),
  [`Insurance`](./api/src/README.md#insurance)
- [`Appointment`](./api/src/README.md#appointment),
  [`ClinicalDocument`](./api/src/README.md#clinicaldocument), [`Charge`](./api/src/README.md#charge)
