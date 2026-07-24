---
id: spec-notes-conformance
title: "Spec notes: conformance-profile tooling (Phase U)"
sidebar_label: Conformance profiles
---

# Spec notes: conformance-profile tooling (Phase U)

`validateAgainstProfile(message, profile)` runs a **conformance profile you
author** against a parsed message and returns typed findings. It is the
functionality-plane answer to "does this feed meet _our_ interface spec?"
Where [`msg.structure`](./spec-notes-structure.md) checks only the handful of
segment groups the base spec marks Required, a conformance profile checks the
rules **your** interface declares: which fields are required, how many times
they may repeat, how long they may be, and which coded values you accept.

The design boundary is deliberate and load-bearing:

- **You bring the profile, and every value set.** hl7 ships **no** vendor / IHE /
  regulatory profile, **no** bundled code set (no LOINC / SNOMED / ICD / RxNorm),
  and makes **no** network call. Value-set membership is a literal check against
  the array of codes _you_ supply. This is what keeps the engine a small,
  corpus-free tool rather than a validator that needs a code corpus to be useful.
- **"No findings" is not an attestation.** An empty result means _nothing this
  profile checked was violated_: never "this message is conformant." The profile
  only covers what you declared; everything undeclared is unchecked, and hl7
  issues no conformance certification. This is not a substitute for an accredited
  validator (e.g. NIST GVT).

## The four invariants

1. **Never throws.** Any message × any profile (even a malformed profile, or a
   value forced through `any`) returns a `ConformanceResult`, never an
   exception. A malformed profile becomes `PROFILE_MALFORMED` findings (never a
   silent pass). For fail-fast authoring, `defineConformanceProfile(profile)`
   runs the same shape check and **throws** `ProfileDefinitionError` on a defect.
2. **Valid ⇒ zero findings.**
3. **No PHI in findings.** Every finding names the structural **locus** (segment,
   field, component, repetition, occurrence) and the rule that fired, never the
   offending value. A "value not in set" finding reports _where_ and _how many
   codes_ the set held, never _what the value was_.
4. **Read-only.** Validation never mutates the message.

## Usage codes (HL7 conformance methodology)

The profile uses the six HL7 v2 usage codes (HL7 Conformance Methodology:
Message Profiles; IHE ITI TF Vol.2 Appendix C):

| Code   | Meaning                    | Engine behaviour                                             |
| ------ | -------------------------- | ----------------------------------------------------------- |
| `R`    | Required                   | absent ⇒ `PROFILE_REQUIRED_ABSENT`                          |
| `RE`   | Required, may be Empty     | absence is **never** a violation                            |
| `C`    | Conditional                | presence **not evaluated** (no predicate language, below)  |
| `CE`   | Conditional, may be Empty  | presence **not evaluated**                                  |
| `O`    | Optional                   | no presence constraint                                      |
| `X`    | Not permitted              | present ⇒ `PROFILE_NOT_PERMITTED`                           |

**`C` / `CE` presence is not evaluated.** This bounded engine ships no
conditional-predicate language (a deliberate defer), so a conditional element's
_presence_ is not checked, but its length / value-set / cardinality rules still
apply when it _is_ present. This keeps "valid ⇒ zero findings" airtight: a
conformant message never produces a stray conditional finding.

## The finding codes

Stable, additive codes on `FINDING_CODES`. Segment-level vs field-level is told
apart by whether the finding's `locus.field` is set, not by separate codes.

- `PROFILE_REQUIRED_ABSENT`: an `R` segment or field is absent / empty.
- `PROFILE_NOT_PERMITTED`: an `X` segment or field is present.
- `PROFILE_CARDINALITY`: a segment-occurrence or field-repetition count is out of range.
- `PROFILE_LENGTH`: a checked component value exceeds the declared max length.
- `PROFILE_VALUE_NOT_IN_SET`: a checked component value is not in the supplied value set.
- `PROFILE_MALFORMED`: the profile itself is structurally malformed (a diagnostic).

Length and value-set checks read the value at the rule's `component` (default
`1`, a coded element's code), applied per present repetition. `cardinality.min`
is checked only when the element is present, so a missing `R` field with
`cardinality.min = 1` yields exactly one finding, not two.

## Worked example

```ts runnable
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

// A message whose administrative sex (PID-8) is "Q", not a value we accept.
const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5",
  "EVN|A01|20260419101500",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|Q",
].join("\r");

// A profile the CONSUMER authors, an example, NOT an attestation.
const profile: ConformanceProfile = {
  name: "our-adt-intake",
  segments: [
    { segment: "MSH", usage: "R", fields: [{ field: 10, name: "Control ID", usage: "R" }] },
    {
      segment: "PID",
      usage: "R",
      cardinality: { min: 1, max: 1 },
      fields: [
        { field: 3, name: "Patient Identifiers", usage: "R", cardinality: { min: 1, max: 1 } },
        { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
      ],
    },
    { segment: "ZZZ", usage: "X" }, // no local Z-segments permitted
  ],
};

const result = validateAgainstProfile(parseHL7(raw), profile);

result.profileName; // => "our-adt-intake"
result.findings.length; // => 1

const f = result.findings[0];
f?.code; // => "PROFILE_VALUE_NOT_IN_SET"
f?.severity; // => "error"
f?.locus.segment; // => "PID"
f?.locus.field; // => 8

// PHI-safe: the offending value "Q" is NEVER in the finding message.
f?.message.includes("Q"); // => false

// A message that conforms produces zero findings, which is NOT an attestation,
// only "no declared rule was violated".
const clean = raw.replace("|Q", "|M");
validateAgainstProfile(parseHL7(clean), profile).findings.length; // => 0
```

## Sources

- HL7 v2 **Conformance Methodology: Message Profiles** (usage `R`/`RE`/`C`/`CE`/`O`/`X`,
  cardinality, length, value-set binding).
- **IHE ITI Technical Framework Vol.2 Appendix C**: "HL7 Profiling Conventions"
  (the same six usage codes, cardinality `[min..max]`, table references).
- **NIST IGAMT / GVT**: the public-domain profile-authoring + validation model
  this engine's bounded subset mirrors. hl7 imports none of their code sets; a
  NIST-IGAMT XML import adapter is a possible later, separate addition.
