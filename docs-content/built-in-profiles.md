---
id: built-in-profiles
title: Built-in profiles
sidebar_label: Built-in profiles
description: "The eight vendor profiles that ship with the package: the date formats each adds, the Z-segments it declares with their field names, and its source."
---

# Built-in profiles

Eight profiles ship on the `profiles` object. Each is defined with the public `defineProfile()`
API, so you can use one directly (`parseHL7(raw, profiles.epic)`) or extend it
(`defineProfile({ name: "mine", extends: profiles.epic })`). [Use and write vendor
profiles](./profiles.md) shows both.

| Profile               | Sender                                     | Date formats it adds                        | Z-segments it declares                 |
| --------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------------- |
| `profiles.epic`       | Epic Bridges Interconnect                  | `MM/DD/YYYY HH:mm:ss`, `MM/DD/YYYY`         | `ZDP`, `ZRS`                           |
| `profiles.cerner`     | Cerner Millennium                          | `YYYY-MM-DD[T]HH:mm:ss`, `YYYY-MM-DD`       | `ZDS`, `ZCO`                           |
| `profiles.meditech`   | MEDITECH MAGIC, 6.x and Expanse            | `YYYYMMDDHHmm`                              | `ZF1`, `ZF2`                           |
| `profiles.athena`     | athenahealth                               | `MM/DD/YYYY`                                | `ZCA`                                  |
| `profiles.genericLab` | a reference laboratory                     | `YYYYMMDD HHmm`, `YYYY-MM-DD`               | `ZLB`, `ZNT`                           |
| `profiles.visage`     | Visage 7 imaging (PACS)                    | none                                        | `ZDS`                                  |
| `profiles.philips`    | Philips Vue PACS (IS Link)                 | none                                        | `ZDS`, `ZLK`, `ZAO`, `ZEB`, `ZAP`, `ZAV` |
| `profiles.va`         | VA VistA Radiology and Nuclear Medicine    | none                                        | `ZDS`                                  |

```ts runnable
import { profiles } from "@cosyte/hl7";

Object.keys(profiles).sort(); // => ["athena", "cerner", "epic", "genericLab", "meditech", "philips", "va", "visage"]
profiles.meditech.dateFormats; // => ["YYYYMMDDHHmm"]
Object.keys(profiles.philips.customSegments ?? {}); // => ["ZDS", "ZLK", "ZAO", "ZEB", "ZAP", "ZAV"]
```

## Where each profile comes from

Four profiles are grounded in a public interface specification, cited in the profile's source:

- **`meditech`**: the MEDITECH
  [Ancillary Charges (LAB/PHA/ITS/IDM) Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/ancillary-charges-outbound-21.pdf)
  specification (v2.1) for `ZF1` and `ZF2`, with the minute-precision format also confirmed by
  [Admissions and Registration Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/admissions-registration-outbound-24.pdf)
  (v2.4).
- **`visage`**: the
  [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf)
  (V23.00).
- **`philips`**: the
  [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf)
  (document HA1669 Rev A, sections 5.11 to 5.16).
- **`va`**: the
  [Radiology/Nuclear Medicine 5.0 HL7 Interface Specification](https://www.va.gov/vdl/documents/clinical/radiology_nuclear_med/ra5_0hl7is.pdf)
  (Version 3.6, June 2024), on both ORM and ORU messages.

The other four (`epic`, `cerner`, `athena`, `genericLab`) carry formats and Z-segments common in
those senders' feeds and cite no published specification. Check one against your own sender's
interface specification before you rely on it, and extend it where your feed differs.

## The Z-segments and their field names

Each name reads with `seg.get(name)` once the profile is applied.

| Profile      | Segment | Field names (position)                                                                                        |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `epic`       | `ZDP`   | `departmentCode` (3), `departmentName` (4)                                                                    |
| `epic`       | `ZRS`   | `resultStatus` (1), `statusDateTime` (2)                                                                      |
| `cerner`     | `ZDS`   | `summaryText` (3)                                                                                             |
| `cerner`     | `ZCO`   | `commentText` (3), `continuationFlag` (5)                                                                     |
| `meditech`   | `ZF1`   | `providerEncounter` (1), `misServiceGroup` (2), `serviceGroupCopay` (3), `visitCopay` (4), `copayMinimum` (5), `copayMaximum` (6) |
| `meditech`   | `ZF2`   | `setId` (1), `providerEncounter` (2), `encounterDate` (3), `encounterProcedure` (4), `encounterProcedureQuantity` (5), `encounterProcedureCharge` (6), `prvProcedureAmountPaid` (7), `prvProcedureAmountDue` (8) |
| `athena`     | `ZCA`   | `careTeamRole` (3), `providerId` (5), `providerName` (6)                                                      |
| `genericLab` | `ZLB`   | `specimenOverride` (3), `methodOverride` (5)                                                                  |
| `genericLab` | `ZNT`   | `noteText` (3)                                                                                                |
| `visage`     | `ZDS`   | `studyInstanceUid` (1)                                                                                        |
| `va`         | `ZDS`   | `studyInstanceUid` (1)                                                                                        |
| `philips`    | `ZDS`   | `studyInstanceUid` (1)                                                                                        |
| `philips`    | `ZLK`   | `externalWorkitemId` (1), `orderLinkId` (2)                                                                   |
| `philips`    | `ZEB`   | `encryptedPatientInfo` (1)                                                                                    |
| `philips`    | `ZAV`   | `visitAdditionalDetails` (1)                                                                                  |
| `philips`    | `ZAO`   | 31 fields, from `orderAdditionalDetails` (1) to `acquisitionStatus` (32): modality, body part, transfer and acquisition status, technician and radiologist |
| `philips`    | `ZAP`   | 13 fields, from `patientAdditionalDetails` (1) to `patientCustomDate3` (14)                                   |

`ZDS` in the three imaging profiles carries the DICOM Study Instance UID, which ties an HL7 order to
its imaging study. In `cerner`, `ZDS` is a different segment that happens to share the name: a
discharge summary. `profiles.philips.customSegments` lists every `ZAO` and `ZAP` field.

## Reference

- [`profiles`](./api/src/README.md#profiles), [`Profile`](./api/src/README.md#profile),
  [`defineProfile`](./api/src/README.md#defineprofile)
