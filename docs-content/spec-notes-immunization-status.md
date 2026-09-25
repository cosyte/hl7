---
id: spec-notes-immunization-status
title: "Spec notes: immunization administration status"
sidebar_label: Immunization administration status
description: "How RXA-21, RXA-5 and RXA-20 tell a dose given from a refusal, a CVX 998 placeholder or a delete request, and why anything not exactly mapped is undetermined."
---

# Spec notes: immunization administration status

Every immunization `msg.immunizations()` returns carries `administrationStatus`:
whether its RXA records a dose given, a refused or not-administered dose, a CVX
`998` "no vaccine administered" placeholder, or a request to delete an
administration sent earlier. A dose count can tell them apart without keeping a
private copy of HL7 Table 0322, HL7 Table 0323 or the CDC's CVX rules.

> **Only `completed` is a dose given.** A record is `completed` only when RXA-20
> is exactly `CP` or `PA`, RXA-21 is empty or exactly `A`, `U` or `X`, and RXA-5
> carries no CVX `998`. Anything not exactly mapped is `undetermined`, never
> `completed`. An `undetermined` record is not a dose: read the raw codes and
> decide.

## The classifications

| `classification`          | What the record says                                                   | Decided by |
| ------------------------- | ---------------------------------------------------------------------- | ---------- |
| `completed`               | A dose was given: RXA-20 `CP` (complete) or `PA` (partially given)     | RXA-20     |
| `not-done`                | No dose was given: RXA-20 `RE` (refused) or `NA` (not administered)    | RXA-20     |
| `no-vaccine-administered` | RXA-5 carries CVX `998`, whatever RXA-20 says                          | RXA-5      |
| `delete-requested`        | RXA-21 is `D`: delete an administration sent earlier; it is not a dose | RXA-21     |
| `undetermined`            | No rule classifies it: a code that is not exactly one mapped code      | any        |

## Which rule decides

Exactly one rule decides each record: the first of these that applies.

1. **RXA-21 exactly `D`**: `delete-requested`. What it deletes is not in this
   message, so it wins over everything else, including a CVX `998` and an RXA-20
   `CP`.
2. **RXA-21 present but not exactly one of `A`, `D`, `U`, `X`** (HL7 Table
   0323): `undetermined`, whatever RXA-5 and RXA-20 say. An action code that
   cannot be read might have been a deletion.
3. **RXA-5 carries CVX `998`**: `no-vaccine-administered`, whatever RXA-20 says,
   or `undetermined` when the other RXA-5 triplet contradicts it (below).
4. **RXA-20 by HL7's Table 0322 to Event Status map**: `CP` and `PA` are
   `completed`, `RE` and `NA` are `not-done`, and everything else, including an
   empty or absent RXA-20, is `undetermined`.

RXA-21 `A` (add), `U` (update), `X` (no change) and an empty RXA-21 change
nothing: the record classifies exactly as it would with RXA-21 empty.

### RXA-20: Table 0322 to Event Status

| RXA-20        | `classification` |
| ------------- | ---------------- |
| `CP`          | `completed`      |
| `PA`          | `completed`      |
| `RE`          | `not-done`       |
| `NA`          | `not-done`       |
| anything else | `undetermined`   |

HL7's map says `PA` (partially administered) "is equivalent to" `completed`, and
hl7 adopts it as published. The raw `PA` stays beside the classification for a
caller that counts a partial dose differently.

### RXA-5: CVX 998

RXA-5 carries CVX `998` when one of its triplets (components 1 to 3, or the
alternate components 4 to 6) has the identifier exactly `998` and a coding
system that resolves to `CVX` by the same Table 0396 provenance as
`codingSystemOf` (so `cvx` counts). The primary triplet also counts when it
names no coding system at all.

| RXA-5                                 | Result                                         |
| ------------------------------------- | ---------------------------------------------- |
| `998^No vaccine administered^CVX`     | `no-vaccine-administered`                      |
| `998^No vaccine administered`         | `no-vaccine-administered`                      |
| `^^^998^No vaccine administered^CVX`  | `no-vaccine-administered`                      |
| `998^No vaccine^CVX^115^Tdap^CVX`     | `undetermined`: the two triplets disagree      |
| `58160-0842-52^Tdap^NDC^998^None^CVX` | `undetermined`: the two triplets disagree      |
| `998^x^NDC`                           | not CVX `998`: RXA-20 decides                  |
| `115^Tdap^CVX^998^x`                  | not CVX `998`: an alternate needs a CVX system |

The CDC marks CVX `998` Inactive, but historical messages still carry it. It was
added "for use in VXU HL7 messages where the OBX segment is nested with the RXA
segment, but the message does not contain information about a vaccine
administration", for example to report the vaccines due next.

## Exactly one code, or `undetermined`

RXA-20 and RXA-21 count only when the field arrived as exactly one code of its
table, case and all. Anything else is outside the table: an RXA-20 falls to
`undetermined`, and a present RXA-21 makes the whole record `undetermined`.

- **Not a table code.** A lowercase `cp` or `d`, `DEL`, `Z`.
- **The HL7 null.** `""` is present and is not a code.
- **Whitespace around the code.** `" D"` or `"CP "`. The parser still trims the
  field and reports `FIELD_WHITESPACE_TRIMMED`, so `actionCode` reads `D`, but
  the record is `undetermined`, not `delete-requested`.
- **A VT or FS byte inside the field.** The parser removes it, as it does for a
  result status; the field did not arrive as exactly one code.
- **A code written as an escape sequence.** `\X44\` decodes to `D`, but the field
  did not carry the code as itself.
- **More than one value.** More than one repetition, component or subcomponent,
  for example `D~A`, `D^X`, `D&X` or even `D~`, even when the first value is a
  table code.

## The shape

`administrationStatus` is a frozen object, and everything it nests is frozen
too:

- `classification`: one of `completed`, `not-done`, `no-vaccine-administered`,
  `delete-requested` or `undetermined`.
- `completionStatus`: the raw RXA-20 code, byte-identical to the entry's own
  `completionStatus`, and absent exactly when that is.
- `actionCode`: the raw RXA-21 code, byte-identical to the entry's own
  `actionCode`, and absent exactly when that is.
- `decidedBy`: the field that decided and what it was read against:
  - `{ field: "RXA-20", table: { name: "HL7 Table 0322", version: "3.0.0" }, map }`,
    where `map` is `{ url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status", version: "1.0.0" }`;
  - `{ field: "RXA-21", table: { name: "HL7 Table 0323", version: "3.0.0" } }`;
  - `{ field: "RXA-5", codeSet: { name: "CDC CVX", code: "998", version: "2023-03-09" } }`.
    The CVX code set has no version number, so `version` is the date the CDC
    last updated the `998` entry.

`completionStatus`, `actionCode` and every other key of the immunization are
unchanged.

## Limits

- **Reported, never applied.** hl7 holds no store. A `delete-requested` record
  is still returned, in document order, and is never matched against the
  administration it asks to delete; nothing is removed, merged or updated.
  Matching records across messages is the caller's decision.
- **Each RXA classifies from itself.** A `D`, a `998` or an `undetermined`
  record never changes the classification of the RXA before or after it.
- **`A`, `U` and `X` are not classified.** An `A` is common even for a dose
  reported before, so it says nothing about whether this dose is new.
- **No code set is shipped.** Only the literal CVX code `998` is read. No CVX,
  MVX or other code is validated.
- **An informative map.** The Table 0322 map is STU 1 content with standards
  status Informative. The classification follows the version it names and does
  not track later revisions.
- **What a field arrived as is recorded when it is parsed.** A field replaced
  with `setField` classifies from the value set, and a message parsed again from
  `msg.toString()` classifies from that text.

## Example

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// A synthetic VXU^V04: a dose given, a refusal, a CVX 998 placeholder,
// a request to delete the first dose, and a lowercase completion status.
const given = "RXA|0|1|20260801||115^Tdap^CVX|0.5|mL^^UCUM" + "|".repeat(13);
const raw = [
  "MSH|^~\\&|EHR|CLINIC|IIS|STATE|20260801101500||VXU^V04^VXU_V04|EX00003|P|2.5.1",
  "PID|||X",
  given + "CP|A",
  "RXA|0|1|20260801||115^Tdap^CVX|999" + "|".repeat(12) + "00^Parental decision^NIP002||RE|A",
  "RXA|0|1|20260801||998^No vaccine administered^CVX|999" + "|".repeat(14) + "NA",
  given + "CP|D",
  given + "cp",
].join("\r");

const msg = parseHL7(raw);
const [dose, refusal, placeholder, deletion, unreadable] = msg.immunizations();
dose?.administrationStatus.classification; // => "completed"
refusal?.administrationStatus.classification; // => "not-done"
placeholder?.administrationStatus.classification; // => "no-vaccine-administered"
placeholder?.administrationStatus.decidedBy.field; // => "RXA-5"
deletion?.administrationStatus.classification; // => "delete-requested"
deletion?.administrationStatus.actionCode; // => "D"
unreadable?.administrationStatus.classification; // => "undetermined"
unreadable?.administrationStatus.completionStatus; // => "cp"
msg.immunizations().length; // => 5
```
