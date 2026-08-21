---
id: spec-notes-conformance
title: "Spec notes: conformance-profile tooling"
sidebar_label: Conformance profiles
---

# Spec notes: conformance-profile tooling

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

1. **Never throws.** Any message × any profile × any resolution argument (even a
   malformed one, or a value forced through `any`) returns a
   `ConformanceResult`, never an exception. A malformed profile becomes
   `PROFILE_MALFORMED` findings (never a silent pass). For fail-fast authoring,
   `defineConformanceProfile(profile)` runs the same shape check and **throws**
   `ProfileDefinitionError` on a defect.
2. **Valid ⇒ zero findings.**
3. **No PHI in findings.** Every finding names the structural **locus** (segment,
   field, component, repetition, occurrence) and the rule that fired, never the
   offending value. A "value not in set" finding reports _where_ and _how many
   codes_ the set held, never _what the value was_.
4. **Read-only.** Validation never mutates the message.

## Usage codes (HL7 conformance methodology)

A rule's usage is one of the seven simple codes below, or a **declared
conditional** written `C(t/f)` whose two outcomes are each a simple code (HL7
Conformance Methodology: Message Profiles; IHE ITI TF Vol.2 Appendix C):

| Code     | Meaning                    | Engine behaviour                                            |
| -------- | -------------------------- | ----------------------------------------------------------- |
| `R`      | Required                   | absent ⇒ `PROFILE_REQUIRED_ABSENT`                          |
| `RE`     | Required, may be Empty     | absence is **never** a violation                            |
| `C`      | Conditional (undeclared)   | presence **not evaluated** (no predicate language, below)   |
| `CE`     | Conditional, may be Empty  | presence **not evaluated**                                  |
| `O`      | Optional                   | no presence constraint                                      |
| `X`      | Not permitted              | present ⇒ `PROFILE_NOT_PERMITTED`                           |
| `B`      | Backward Compatible        | presence **not evaluated**, on exactly `C`'s terms          |
| `C(t/f)` | Declared conditional       | takes the outcome the **caller** resolves; `C` when unresolved |

Omitting `usage` on a rule means Optional, and is never refused.

`USAGE_CODES` exports that vocabulary as a frozen, ordered listing: `R`, `RE`,
`C`, `CE`, `O`, `X`, `C(a/b)`, `B`. **It is a published vocabulary listing, not
a membership test for what a rule may declare.** `C(a/b)` is the NOTATION for
the declared-conditional family, so it is listed and is refused on a rule
(`a` and `b` are placeholders, not usage codes), while `C(RE/X)` is accepted on
a rule and is not listed. What a rule may declare is answered by the `UsageCode`
type at compile time and by `defineConformanceProfile` at run time.

## Declared conditionals: the CALLER resolves them

**The engine evaluates no condition predicate and never derives an outcome from
the message.** It ships no conditional-predicate language, which is a deliberate
boundary rather than an oversight. A rule declared `C(R/X)` therefore takes its
outcome from a resolution you pass alongside the message and the profile:

```ts runnable
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|",
].join("\r");

// "PID-8 is Required when the condition holds, Not-permitted when it does not."
const profile: ConformanceProfile = {
  name: "conditional-sex",
  segments: [{ segment: "PID", fields: [{ field: 8, usage: "C(R/X)" }] }],
};

const msg = parseHL7(raw);

// YOU decide the condition holds for this message. PID-8 is absent, so the
// true outcome (`R`) fires:
const held = validateAgainstProfile(msg, profile, [
  { segment: "PID", field: 8, outcome: true },
]);
held.findings[0]?.code; // => "PROFILE_REQUIRED_ABSENT"

// Resolve it false and the false outcome (`X`) applies instead; PID-8 is
// absent, so nothing fires.
const didNotHold = validateAgainstProfile(msg, profile, [
  { segment: "PID", field: 8, outcome: false },
]);
didNotHold.findings.length; // => 0

// Resolve nothing and the rule behaves exactly as `C` does: presence is not
// evaluated at all.
validateAgainstProfile(msg, profile).findings.length; // => 0
```

A resolution names a **locus**: the segment name, plus the 1-indexed field
position when the target is a field rule. It applies to the RULE at that locus,
so it covers every occurrence of the segment and every repetition of the field;
there is no per-occurrence resolution. Four things are refused as
`PROFILE_MALFORMED` rather than ignored:

- a locus matching no rule the profile declares;
- a locus matching a rule whose usage is not a declared conditional;
- a locus matching more than one declared rule (it identifies no single rule);
- two or more resolutions at one locus.

Omitting the argument, or passing `undefined`, means "no resolutions". **Any
other value that is not a list of well-formed resolutions is a
`PROFILE_MALFORMED` finding**, never read as "none": a mis-typed argument must
not return a clean result for elements nothing checked.

**`C`, `CE`, `B` and an unresolved declared conditional are NOT
presence-checked.** Their length / value-set / cardinality rules still apply
when the element _is_ present. That keeps "valid ⇒ zero findings" airtight, and
it is exactly why zero findings is not an attestation: an element whose presence
nothing evaluated is an element nothing asserted.

`B`'s behaviour is this library's own bounded choice rather than a sourced
requirement. The methodology's table of allowable usage indicators lists `B` and
carries no definition text for it, so the reading taken here is the one that
imposes no presence obligation while preserving what the profile author
declared.

A declared conditional's outcomes may be any simple code here, because this
engine targets the constrainable profile level. The methodology separately
restricts an _implementable_ profile to `R`, `RE` or `X` per element, and its
conditional outcomes likewise; a profile cannot yet declare which level it
claims, so that restriction is not enforced.

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

- HL7 v2 **Conformance Methodology: Message Profiles** (the usage indicators
  allowable in a message profile, `C(a/b)` and `B` included, plus cardinality,
  length and value-set binding).
- **IHE ITI Technical Framework Vol.2 Appendix C**: "HL7 Profiling Conventions"
  (`R`/`RE`/`C`/`CE`/`O`/`X`, cardinality `[min..max]`, table references).
- **NIST IGAMT / GVT**: the public-domain profile-authoring + validation model
  this engine's bounded subset mirrors. hl7 imports none of their code sets; a
  NIST-IGAMT XML import adapter is a possible later, separate addition.
