---
id: spec-notes-result-status
title: "Spec notes: result status classification"
sidebar_label: Result status classification
description: "How OBX-11 and OBR-25 are classified by HL7's published v2-to-FHIR status maps, and why every code those maps leave unmapped reads as undetermined."
---

# Spec notes: result status classification

Every observation and every order carries `resultStatus`: its own status code,
classified by the map HL7 publishes for that code's table. A result posted as
wrong (`W`), deleted (`D`) or cancelled (`X`) can be told apart from a current
one without keeping a private copy of either table.

> **hl7 classifies what HL7's map classifies, and nothing else.** A code the map
> leaves unmapped, an empty or absent field, and any value that is not exactly
> one code of its table classify as `undetermined`, never as `final`. An
> `undetermined` result is not a current result: read the raw `code` and decide.

## What is classified

| Helper output              | Field read                       | Table                         | Map followed                                          |
| -------------------------- | -------------------------------- | ----------------------------- | ----------------------------------------------------- |
| `observation.resultStatus` | OBX-11 Observation Result Status | HL7 Table 0085, version 3.0.0 | Table 0085 to Observation Status, version 1.0.0       |
| `order.resultStatus`       | OBR-25 Result Status             | HL7 Table 0123, version 3.0.0 | Table 0123 to Diagnostic Report Status, version 1.0.0 |

An observation carries it wherever it is returned: `msg.observations()`,
`order.observations`, and the observations of `msg.documents()` and
`msg.immunizations()`. The same OBX gives the same classification in every view.

Both maps come from the HL7 Version 2 to FHIR Implementation Guide (STU 1,
standards status Informative). Their canonical URLs are:

- `http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status`
- `http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status`

Every classification names its table and map, each with its version, so a later
revision of either map shows up in the output instead of changing it silently.

### The shape

`resultStatus` is a frozen object, and everything it nests is frozen too:

- `classification`: one of `final`, `corrected`, `amended`, `preliminary`,
  `entered-in-error`, `cancelled`, `registered`, `partial` or `undetermined`.
- `code`: the raw code, byte-identical to the `status` (OBX-11) or
  `orderStatus` (OBR-25) beside it. It is absent exactly when those are: the
  field is absent, empty or the HL7 null `""`.
- `table`: `{ name, version }`, for example `{ name: "HL7 Table 0085", version: "3.0.0" }`.
- `map`: `{ url, version }`, the canonical URL above and `"1.0.0"`.

`status` and `orderStatus` are unchanged: still the decoded code, still omitted
when the field is empty.

## OBX-11: Table 0085 to Observation Status

| OBX-11                         | `classification`                     |
| ------------------------------ | ------------------------------------ |
| `A`                            | `amended`                            |
| `C`                            | `corrected`                          |
| `D`                            | `entered-in-error`                   |
| `F`                            | `final`                              |
| `P`                            | `preliminary`                        |
| `X`                            | `cancelled`                          |
| `W`                            | `entered-in-error`                   |
| `B`, `I`, `N`, `O`, `R`, `S`, `V`, `U` | `undetermined` (the map: "(not mapped)") |

`V` (verified), `U` (status changed to final) and `B` (appended report) read as
final to a person, but HL7's map gives them no status. They classify as
`undetermined` rather than as a guess at the class HL7 declined to give.

## OBR-25: Table 0123 to Diagnostic Report Status

| OBR-25                        | `classification`                     |
| ----------------------------- | ------------------------------------ |
| `O`, `I`, `S`                 | `registered`                         |
| `P`                           | `preliminary`                        |
| `C`                           | `corrected`                          |
| `R`                           | `partial`                            |
| `F`                           | `final`                              |
| `X`                           | `cancelled`                          |
| `A`, `Y`, `Z`, `M`, `N`       | `undetermined` (the map: "(not mapped)") |

## Exactly one code, or `undetermined`

A code classifies only when the field arrived as exactly one code of its table,
case and all. Everything else is `undetermined`, and the observation or order is
still returned:

- **Empty, absent or null.** An empty field, a segment that ends before the
  field, or the HL7 null `""`.
- **Not a table code.** A lowercase `f`, a multi-character `FF`, a letter outside
  the table such as `Q`.
- **Whitespace around the code.** `" F"` or `"F "`. With the default field
  trimming the parser still trims the field and reports
  `FIELD_WHITESPACE_TRIMMED`, so `status` and `code` read `F`; the
  classification stays `undetermined` because the field did not arrive as
  exactly one code.
- **A code written as an escape sequence.** `\X46\` decodes to `F`, and `status`
  and `code` read `F`, but the field did not carry the code as itself.
- **More than one value.** More than one repetition, component or subcomponent,
  for example `F~W`, `F^X`, `F&X` or even `F~`, even when the first value is a
  mapped code. `status` and `code` hold only the first value.

No tolerance is added to reach a class: a near-miss is `undetermined`, and the
raw code is still carried for the caller to judge.

## Limits

- **Reported, never applied.** hl7 holds no store. An `entered-in-error` or
  `cancelled` observation is still returned; replacing, hiding or deleting an
  earlier result it refers to, and matching results across messages, is the
  caller's decision.
- **Each segment classifies from itself.** HL7 says an OBX-11 of `D` or `X`
  applies only to its own OBX, so nothing is carried across OBX segments that
  share OBX-3 and OBX-4. An order classifies from OBR-25 alone, never from its
  observations: OBR-25 `F` over an OBX-11 `W` gives a `final` order and an
  `entered-in-error` observation.
- **Two fields only.** OBX-11 and OBR-25 are classified. ORC-1, ORC-5, RXA-20,
  RXA-21 and every other status field are surfaced verbatim, as before.
- **Not a FHIR element.** The classification is a plain string. No Observation,
  DiagnosticReport or ConceptMap resource is built and no terminology service is
  consulted. It is the one place hl7 applies a v2-to-FHIR map; see the
  [FHIR-bridge IR contract](./spec-notes-fhir-bridge.md).
- **Informative maps.** Both maps are STU 1 content with standards status
  Informative. The classification follows the version it names and does not track
  later revisions.
- **Whitespace is read from the parse warnings.** The whitespace rule matches a
  `FIELD_WHITESPACE_TRIMMED` warning to the field's position as parsed. After a
  segment is added or removed, those positions describe the message as it was
  parsed, not as it is now.

## Example

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// A synthetic ORU^R01: a final order whose second result was posted in error.
const raw = [
  "MSH|^~\\&|LAB|FAC|EHR|FAC|20260419101500||ORU^R01|EX00002|P|2.5.1",
  "PID|||X",
  "OBR|1|PLACER1|FILLER1|GLU^Glucose^L" + "|".repeat(21) + "F", // OBR-25 is F
  "OBX|1|NM|GLU^Glucose^L||95|mg/dL|||||F",
  "OBX|2|NM|GLU^Glucose^L||59|mg/dL|||||W",
  "OBX|3|NM|GLU^Glucose^L||97|mg/dL|||||V",
].join("\r");

const msg = parseHL7(raw);
msg.orders()[0]?.resultStatus.classification; // => "final"

const [first, second, third] = msg.observations();
first?.resultStatus.classification; // => "final"
second?.resultStatus.classification; // => "entered-in-error"
second?.resultStatus.code; // => "W"
second?.status; // => "W"
third?.resultStatus.classification; // => "undetermined"
third?.resultStatus.table.name; // => "HL7 Table 0085"
third?.resultStatus.map.version; // => "1.0.0"
```
