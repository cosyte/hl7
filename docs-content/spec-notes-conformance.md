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
  the array of codes _you_ supply, and a condition predicate is decided by
  reading the message in front of it against values _you_ wrote down. This is
  what keeps the engine a small, corpus-free tool rather than a validator that
  needs a code corpus to be useful.
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

| Code     | Meaning                   | Engine behaviour                                                            |
| -------- | ------------------------- | -------------------------------------------------------------------------- |
| `R`      | Required                  | absent ⇒ `PROFILE_REQUIRED_ABSENT`                                          |
| `RE`     | Required, may be Empty    | absence is **never** a violation                                            |
| `C`      | Conditional               | with a `condition`: true ⇒ `R`, false ⇒ `X`. Without one: presence **not evaluated** |
| `CE`     | Conditional, may be Empty | with a `condition`: true ⇒ `RE`, false ⇒ `X`. Without one: presence **not evaluated** |
| `O`      | Optional                  | no presence constraint                                                      |
| `X`      | Not permitted             | present ⇒ `PROFILE_NOT_PERMITTED`                                           |
| `B`      | Backward Compatible       | presence **not evaluated**; a `condition` is not allowed on it              |
| `C(t/f)` | Declared conditional      | takes the outcome its own `condition` decides, or the one a **caller** resolves; `C` when neither |

The outcomes for a bare `C` and `CE` are the ones IHE ITI TF Vol.2 Appendix C
states for each: a `C` element shall be populated when the predicate is
satisfied and shall not be when it is not; a `CE` element is populated when the
predicate is satisfied and the sender knows the value. `B` is deliberately left
out: the methodology lists it among the allowable indicators and carries no
definition text for it, so nothing says what a predicate on a `B` element would
decide, and this engine will not invent an answer.

Omitting `usage` on a rule means Optional, and is never refused.

`USAGE_CODES` exports that vocabulary as a frozen, ordered listing: `R`, `RE`,
`C`, `CE`, `O`, `X`, `C(a/b)`, `B`. **It is a published vocabulary listing, not
a membership test for what a rule may declare.** `C(a/b)` is the NOTATION for
the declared-conditional family, so it is listed and is refused on a rule
(`a` and `b` are placeholders, not usage codes), while `C(RE/X)` is accepted on
a rule and is not listed. What a rule may declare is answered by the `UsageCode`
type at compile time and by `defineConformanceProfile` at run time.

## Condition predicates: the engine evaluates them against the message

A conditionally-used element's usage is decided by a **condition predicate**: a
computable test based on other values within the same message. Attach one to a
rule's `condition` and the engine evaluates it and applies the outcome it
selects.

```ts runnable
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

// "PID-8 (Administrative Sex) is Required when a date of birth was sent, and
// Not-permitted when one was not."
const profile: ConformanceProfile = {
  name: "conditional-sex",
  segments: [
    {
      segment: "PID",
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

const head = "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5";
const check = (pid: string) => validateAgainstProfile(parseHL7([head, pid].join("\r")), profile);

// A date of birth, no sex: the predicate is true, so `R` applies and fires.
check("PID|1||MRN12345^^^HOSP^MR||Doe^John||19800115|").findings[0]?.code;
// => "PROFILE_REQUIRED_ABSENT"

// No date of birth, a sex: the predicate is false, so `X` applies and fires.
check("PID|1||MRN12345^^^HOSP^MR||Doe^John|||M").findings[0]?.code;
// => "PROFILE_NOT_PERMITTED"

// Both present: the predicate is true, `R` applies, and PID-8 satisfies it.
check("PID|1||MRN12345^^^HOSP^MR||Doe^John||19800115|M").findings.length; // => 0
```

### The shape of a predicate

A predicate is a **presence statement**, a **comparison statement**, or two of
those joined by a **connector**. It nests: either side of a connector may itself
be a connected predicate.

A **location** is a structural coordinate that narrows from the outside in:
`segment`, then the 1-indexed `field`, `component` and `subcomponent`. A level
may not be skipped, so a `component` needs a `field` and a `subcomponent` needs a
`component`.

| Statement                              | Asks                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| `{ location, presence: "is valued" }`     | does the message carry any content at or below that location?       |
| `{ location, presence: "is not valued" }` | the complement of the above                                         |
| `{ location, verb, values }`              | does the content at that location stand in `verb`'s relation to one of `values`? |
| `{ connector, left, right }`              | `AND` both, `OR` at least one, `XOR` exactly one                    |

The verbs are the published closed set, and each negative is the exact
complement of its positive twin:

| Verb                            | True when the value                                        |
| ------------------------------- | ---------------------------------------------------------- |
| `is` / `is not`                 | equals (does not equal) a listed value, whole and case-sensitive |
| `contains` / `does not contain` | carries (does not carry) a listed value as a substring     |
| `matches` / `does not match`    | matches (does not match) a listed value read as a regular expression |

`PREDICATE_VERBS` and `PREDICATE_CONNECTORS` export both vocabularies as frozen,
ordered listings. A regular-expression value is anchored over the **whole** value
(`MR\d{5}` describes `MR83452`, not every string containing one) and is read in
Unicode mode; a pattern the platform cannot compile is `PROFILE_MALFORMED`.

**Presence and comparison read a location slightly differently, and the split is
deliberate.** "Valued" asks whether there is any content at or below the
coordinate, which is the same reading the `R` and `X` checks use for a field, so
a field-only location is valued when any component of any repetition carries
something. A comparison reads the value **at** the coordinate, with an omitted
`component` and `subcomponent` both defaulting to `1`, exactly as a field rule's
own `component` default does. One asks "is anything there", the other asks "what
is the value here".

**A repeating field or a segment that occurs more than once needs only one
match.** A statement is true when one or more of those repetitions or
occurrences satisfies it, which is the language's default occurrence semantics.
That existential covers the negative verbs too: `is not` is true when _some_
repetition is not one of the listed values.

```ts runnable
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ORU^R01|MSG00002|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John||19800115|M",
  "OBX|1|NM|WBC^^LN||7.5",
  "OBX|2|NM|RBC^^LN||4.2",
].join("\r");

// "A comment is Required but may be empty when this report carries a red-cell
// count, and Not-permitted when it does not."
const profile: ConformanceProfile = {
  name: "conditional-comment",
  segments: [
    {
      segment: "NTE",
      usage: "C(RE/X)",
      condition: {
        connector: "AND",
        left: { location: { segment: "OBX", field: 3, component: 1 }, verb: "is", values: ["RBC"] },
        right: { location: { segment: "PID", field: 7 }, presence: "is valued" },
      },
    },
  ],
};

// The SECOND OBX satisfies the left operand, and one is enough.
validateAgainstProfile(parseHL7(raw), profile).findings.length; // => 0
```

### A predicate the message cannot decide

A presence statement is **always** determinate: an element the message does not
carry is simply not valued, which is an answer. A comparison against an element
the message does not carry is **not**: the language compares content and there
is no content to compare. Deciding it false would fabricate an answer, and for a
`C(R/X)` rule a fabricated false turns a required element into a permitted
absence.

So an undecidable predicate produces a `PROFILE_CONDITION_UNEVALUATABLE`
finding, the rule's usage outcome is never selected, and the element's presence
is **not** assessed. A connected predicate is undecidable exactly when its
result depends on an undecidable operand: `AND` is false as soon as one side is
false, `OR` is true as soon as one side is true, and `XOR` always needs both.

```ts runnable
import { parseHL7, validateAgainstProfile, FINDING_CODES, type ConformanceProfile } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00003|P|2.5",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John||19800115|",
].join("\r");

// The predicate reads PV1-2, and this message carries no PV1 at all.
const profile: ConformanceProfile = {
  name: "undecidable",
  segments: [
    {
      segment: "PID",
      fields: [
        {
          field: 8,
          usage: "C(R/X)",
          condition: { location: { segment: "PV1", field: 2 }, verb: "is", values: ["I"] },
        },
      ],
    },
  ],
};

const { findings } = validateAgainstProfile(parseHL7(raw), profile);

// PID-8 is absent and the true outcome would have been `R`, but the engine
// neither fires that nor reports the element clean.
findings.length; // => 1
findings[0]?.code === FINDING_CODES.PROFILE_CONDITION_UNEVALUATABLE; // => true
findings[0]?.locus.field; // => 8

// The finding names the location it could not decide at, and nothing else: no
// value read from the message, and no value drawn from the predicate's list.
findings[0]?.message.includes("PV1-2"); // => true
```

That code is distinct from every other, so an unassessed conditional can be
filtered by `finding.code` rather than by matching a message string.

### What a predicate may not be

These are `PROFILE_MALFORMED`: the engine reports the defect, validates no
message rule against a profile it cannot trust, and still returns a result
rather than throwing.

- a verb outside the closed set, or a presence statement that is not one of the two;
- a comparison with no value list, an empty one, or one carrying a non-string
  (a sparse array's holes count as non-strings: a length is not a value list);
- a regular-expression value the platform cannot compile;
- a location naming no addressable element: a bad segment name, a non-positive
  index, a component with no field, or a subcomponent with no component;
- a comparison whose location stops at the segment, since a segment on its own
  has no single content to compare (a presence statement may stop there: it asks
  whether the segment occurs);
- a statement declaring none of `presence`, `verb` and `connector`, or more than
  one of them, and a nesting deeper than the language defines. **A key set to
  `undefined` still declares it**, so a statement assembled from an options bag
  has to omit the keys it does not use rather than pass them through empty;
  the engine will not guess which of two declared discriminants you meant,
  because guessing decides an element's usage from a question you never asked;
- a predicate on a rule whose usage is not conditional, including a rule with no
  usage at all: there is nothing there for it to decide, and ignoring it would be
  a silent no-op;
- a predicate that arrives as `null`, an array, a string, or any other shape a
  type check could not have stopped.

The fail-fast authoring gate refuses every one of them too:
`defineConformanceProfile(profile)` throws `ProfileDefinitionError` at the point
the profile is written, rather than at the point it is run.

## Declared conditionals a CALLER resolves instead

A rule that declares no predicate can still take its outcome from outside, as a
resolution you pass alongside the message and the profile:

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
there is no per-occurrence resolution. Five things are refused as
`PROFILE_MALFORMED` rather than ignored:

- a locus matching no rule the profile declares;
- a locus matching a rule whose usage is not a declared conditional;
- a locus matching more than one declared rule (it identifies no single rule);
- a locus matching a rule that declares its own condition predicate;
- two or more resolutions at one locus.

**A rule takes its outcome from the predicate or from a resolution, never from
both.** Declaring both at one locus is a defect rather than a precedence
question: silently preferring either source would decide a patient-safety
question by accident of implementation order.

Omitting the argument, or passing `undefined`, means "no resolutions". **Any
other value that is not a list of well-formed resolutions is a
`PROFILE_MALFORMED` finding**, never read as "none": a mis-typed argument must
not return a clean result for elements nothing checked.

**`C`, `CE`, `B` and a declared conditional are NOT presence-checked when
nothing decides them**, that is, when the rule declares no predicate and no
resolution names it. Their length / value-set / cardinality rules still apply
when the element _is_ present. That keeps "valid ⇒ zero findings" airtight, and
it is exactly why zero findings is not an attestation: an element whose presence
nothing evaluated is an element nothing asserted.

`B`'s behaviour is this library's own bounded choice rather than a sourced
requirement. The methodology's table of allowable usage indicators lists `B` and
carries no definition text for it, so the reading taken here is the one that
imposes no presence obligation while preserving what the profile author
declared, and the same silence is why `B` may not carry a predicate.

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
- `PROFILE_CONDITION_UNEVALUATABLE`: a rule's condition predicate could not be
  decided against this message, so its usage outcome was never selected and the
  element's presence was not assessed.
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
  length and value-set binding), and its **Predicate Definition** requirement
  that a declared conditional's predicate be testable and based on other values
  within the message.
- HL7 v2 **Conformance Methodology, Appendix A: Predicate Definition Language**
  (the template pattern, the closed verb set, the content-declarative statements
  and the `AND` / `OR` / `XOR` connectors this engine's predicate shape mirrors).
- **IHE ITI Technical Framework Vol.2 Appendix C**: "HL7 Profiling Conventions"
  (`R`/`RE`/`C`/`CE`/`O`/`X`, cardinality `[min..max]`, table references).
- **NIST IGAMT / GVT**: the public-domain profile-authoring + validation model
  this engine's bounded subset mirrors. hl7 imports none of their code sets; a
  NIST-IGAMT XML import adapter is a possible later, separate addition.
