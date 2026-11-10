---
id: validate-messages
title: Validate a message's structure and content
sidebar_label: Validate a message
description: "Spot a truncated or misrouted message, check segment order and counts against HL7's published structures, and run a conformance profile you write."
---

# Validate a message's structure and content

Three checks, from the cheapest to the most specific. Each reads the message and changes nothing,
and none of them is an attestation of conformance: an empty result means the checks that ran found
nothing, not that the message is conformant.

| Check                              | Asks                                                              | Runs              |
| ---------------------------------- | ----------------------------------------------------------------- | ----------------- |
| `msg.structure`                    | are the segments this message type requires present?              | on every parse    |
| `validateMessageStructure(msg)`    | do the segments follow the published order and counts?            | when you call it  |
| `validateAgainstProfile(msg, p)`   | does the message meet the interface specification you wrote down? | when you call it  |

## Spot a truncated or misrouted message

`msg.structure` reports whether the segments HL7's published structures require at least once are
present. An `ORU^R01` with no OBR is almost always cut short or sent to the wrong feed. The same
finding is a `MISSING_EXPECTED_GROUP` warning, so a channel can route on it alone.

```ts runnable
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|EX00070|P|2.5\r" +
    "PID|1||MRN67890^^^HOSP^MR",
);

msg.structure.recognized; // => true
msg.structure.missingSegments; // => ["OBR"]
msg.structure.structureIds; // => ["ORU_R01-A", "ORU_R01-B", "ORU_R01-C", "ORU_R01-D"]
msg.warnings.some((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP); // => true
```

The expectations are derived offline from a vendored copy of the published structures, with no
network call. A segment inside an optional group is not expected, a segment is expected only when
every published variant of the structure requires it, and a type it does not recognize gives
`recognized: false` and no warning. It covers the message codes ADT, ORU, ORM, OML, OMG, OMP, OMI,
SIU, MDM, DFT, VXU and ACK. [Message-type and structure awareness](./spec-notes-structure.md) has the
full table and the derivation rules.

## Check order and counts against the published structure

`validateMessageStructure(msg)` is an opt-in check over the same vendored structures, at segment
level. It reports a segment out of order (`STRUCTURE_SEGMENT_OUT_OF_ORDER`), fewer or more of a
segment than the structure allows (`STRUCTURE_SEGMENT_CARDINALITY`), and a segment the structure
does not name, a Z-segment included (`STRUCTURE_SEGMENT_UNEXPECTED`, a warning). Each finding names
a segment, its occurrence and the structure, never a field value.

```ts runnable
import { parseHL7, validateMessageStructure } from "@cosyte/hl7";

// An ADT^A01 that sends PV1 before PID.
const msg = parseHL7(
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20260419143000||ADT^A01|EX00071|P|2.5\r" +
    "EVN|A01|20260419143000\r" +
    "PV1|1|I\r" +
    "PID|1||MRN12345^^^HOSP^MR",
);

const result = validateMessageStructure(msg);

result.validated; // => true
result.structureId; // => "ADT_A01-A"
result.findings.map((f) => [f.severity, f.code, f.locus.segment]); // => [["error", "STRUCTURE_SEGMENT_OUT_OF_ORDER", "PID"]]
```

Read `validated` before `findings`. A message type the registry does not model, the one retained
transcription (`ORM^O01`), and a message with no readable type come back `validated: false` with a
`reason` and no findings: "the published structure cannot answer" is a different answer from
"nothing was wrong".

```ts runnable
import { parseHL7, validateMessageStructure } from "@cosyte/hl7";

const result = validateMessageStructure(
  parseHL7("MSH|^~\\&|CLINIC|MAIN|LAB|REF|20260419143000||ORM^O01|EX00072|P|2.5"),
);

result.validated; // => false
result.reason; // => "RETAINED_TRANSCRIPTION"
```

Where the publication splits a structure into variants, matching one variant is enough; findings
appear only when every variant is broken, and they are one named variant's. Field content, data
types, value sets and HL7 tables are not checked.

## Run a conformance profile you write

When you have an interface specification ("our ADT feed requires PID-3, sex must be M, F or U, no
Z-segments"), write it as a conformance profile and `validateAgainstProfile(msg, profile)` returns
typed findings. You write the profile and every value set; the package ships none, and makes no
network call.

```ts runnable
import { type ConformanceProfile, parseHL7, validateAgainstProfile } from "@cosyte/hl7";

const profile: ConformanceProfile = {
  name: "our-adt-intake",
  segments: [
    {
      segment: "PID",
      usage: "R",
      fields: [
        { field: 3, name: "Patient Identifiers", usage: "R", cardinality: { min: 1, max: 1 } },
        { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
      ],
    },
    { segment: "ZZZ", usage: "X" },
  ],
};

const msg = parseHL7(
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20260419143000||ADT^A01|EX00073|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Doe^John||19800101|Q\r" +
    "ZZZ|1",
);

const { findings } = validateAgainstProfile(msg, profile);

findings.map((f) => f.code); // => ["PROFILE_VALUE_NOT_IN_SET", "PROFILE_NOT_PERMITTED"]
findings[0]?.message; // => "PID-8 rep 0 component 1 value is not in the profile value set (3 permitted code(s))."
```

The engine never throws (a malformed profile gives `PROFILE_MALFORMED` findings), a valid message
gives no findings, no finding carries a value from the message, and the message is not changed.
`defineConformanceProfile(profile)` is the strict alternative for authoring: it throws a
`ProfileDefinitionError` listing every defect.

A conditional usage can carry a predicate the engine evaluates against the message. Here PID-8 is
required when a birth date was sent and not permitted when it was not:

```ts runnable
import { type ConformanceProfile, parseHL7, validateAgainstProfile } from "@cosyte/hl7";

const profile: ConformanceProfile = {
  name: "sex-with-birth-date",
  segments: [
    {
      segment: "PID",
      usage: "R",
      fields: [
        {
          field: 8,
          usage: "C(R/X)",
          condition: { location: { segment: "PID", field: 7 }, presence: "is valued" },
        },
      ],
    },
  ],
};

const header = "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20260419143000||ADT^A01|EX00074|P|2.5\r";
const withBirthDate = parseHL7(header + "PID|1||MRN12345^^^HOSP^MR||Doe^John||19800101");
const withoutBirthDate = parseHL7(header + "PID|1||MRN12345^^^HOSP^MR||Doe^John|||F");

validateAgainstProfile(withBirthDate, profile).findings.map((f) => f.code); // => ["PROFILE_REQUIRED_ABSENT"]
validateAgainstProfile(withoutBirthDate, profile).findings.map((f) => f.code); // => ["PROFILE_NOT_PERMITTED"]
```

A predicate the message cannot decide gives `PROFILE_CONDITION_UNEVALUATABLE`, and that element's
presence is not assessed rather than guessed. [Conformance profiles](./spec-notes-conformance.md)
covers the usage codes, the predicate verbs, profile levels, value-set bindings and every finding
code. This is a different thing from the parse profiles of [Use vendor profiles](./profiles.md),
which change how a message is read.

## Reference

- [`Hl7Message`](./api/README.md#hl7message) (`structure`),
  [`MessageStructure`](./api/README.md#messagestructure)
- [`validateMessageStructure`](./api/README.md#validatemessagestructure),
  [`StructureValidationResult`](./api/README.md#structurevalidationresult),
  [`STRUCTURE_FINDING_CODES`](./api/README.md#structure_finding_codes),
  [`STRUCTURE_NOT_VALIDATED_REASONS`](./api/README.md#structure_not_validated_reasons)
- [`validateAgainstProfile`](./api/README.md#validateagainstprofile),
  [`defineConformanceProfile`](./api/README.md#defineconformanceprofile),
  [`ConformanceProfile`](./api/README.md#conformanceprofile),
  [`FINDING_CODES`](./api/README.md#finding_codes)
