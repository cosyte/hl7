---
id: spec-notes-conformance
title: "Spec notes: conformance-profile tooling"
sidebar_label: Conformance profiles
description: "How validateAgainstProfile runs a profile you author against a parsed message and returns typed findings for required, repeating, sized and coded fields."
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
  validator (e.g. NIST GVT). What an empty result _does_ tell you depends on the
  profile's [level](#profile-levels), which every result echoes: only an
  implementable profile has removed all its own optionality, so only there is the
  assessment against that profile complete.

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

### Usage and cardinality have to agree

A segment or field rule may declare both, and the methodology fixes the
relationship between them. Three constraints, checked when the profile is
**defined**:

| The rule declares | Its cardinality must                                         |
| ----------------- | ------------------------------------------------------------ |
| `R`               | have a `min` of 1 or more, if it declares one at all          |
| anything but `R`  | have a `min` of 0, if it declares one at all                  |
| `RE`              | be free to carry a `min` above 0: the one documented exception |
| `X`               | have a `max` of 0, or declare no `max`                        |

The `RE` exception is there so you can say "not always present, but at least
three occurrences when it is": that is `RE` with `[3..5]`, which reads as an
implied `[0, 3..5]`. Every other non-Required usage takes a minimum of 0,
including the conditional codes, whose per-message outcome supplies the rest:
the methodology's own worked pairing is `C(R/X)` with `[0..5]`, meaning zero
occurrences when the predicate is false and one to five when it is true.

A pairing that contradicts itself is `PROFILE_MALFORMED` from
`validateAgainstProfile` and a thrown `ProfileDefinitionError` from
`defineConformanceProfile`, exactly like any other profile defect. **It is
checked against what the rule DECLARES**, so a rule that declares no usage, or
no cardinality, is never refused for a pairing it never wrote.

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

The verbs are the published closed set. Each negative is the exact complement of
its positive twin **for one value**; how the pair behaves where the location
carries more than one is the section below this table, and it is not
complementary:

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
repetition is not one of the listed values, and not when _every_ repetition is
not one of them.

**So at a repeating location a verb and its negative can both decide true, and
that is the trap to read carefully.** `PID-3.1 is 'MRN1'` asks whether some
identifier is `MRN1`; `PID-3.1 is not 'MRN1'` asks whether some identifier is
not `MRN1`. For `PID-3 = MRN1~MRN2` the answer to both is yes. A negative verb
is therefore not a way to ask whether _no_ repetition is a listed value: the
language carries no negation connector, so that question cannot be written in a
predicate at all, and `AL1-3.1 is not 'PENICILLIN'` decides true for a patient
who has that allergy and one other. Where a location carries exactly one value
the pair does behave as an exact complement, and where it carries none neither
half decides: the comparison is unevaluatable whichever verb it uses.

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

A declared conditional's outcomes may be any simple code at the constrainable
level, which is what a profile claims when it declares no level. The
methodology separately restricts an _implementable_ profile to `R`, `RE` or `X`
per element, and its conditional outcomes likewise: a profile that claims that
level is held to it, which the next section is about.

## Profile levels

An empty findings list means two different things at two different levels, and
that is the whole reason this exists. The methodology defines three **profile
levels**, and draws the completeness line between them: a complete assessment
of an interface declaring conformance to an implementable profile can be
determined, while for standard-level and constrainable-level profiles not all
aspects can be. So "zero findings" from a constrainable profile is consistent
with parts of the message never having been assessed at all.

| Level               | The methodology's definition                                                                   | What this engine does with it                                     |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `standard`          | the base definitions and constraints as-is; considerable openness still exists                 | echoes it; imposes no level-derived constraint on any element     |
| `constrainable`     | further constrains a parent, but not all element attributes are fully constrained               | echoes it; imposes no level-derived constraint on any element     |
| `implementable`     | defines all elements such that all optionality and openness have been removed                  | echoes it **only if the claim checks out**, else `PROFILE_MALFORMED` |

`PROFILE_LEVELS` exports them as a frozen listing, ordered from the least
constrained to the most. Unlike `USAGE_CODES` this listing **is** the
accept-set: a `level` outside it is `PROFILE_MALFORMED`, and the `ProfileLevel`
type refuses it at compile time.

**Every result carries the level in force**, beside the profile name, and it is
there on every result including one whose profile was too malformed for even its
name to be read:

```ts
const { profileName, level, findings } = validateAgainstProfile(msg, profile);
```

**Declaring no level claims `constrainable`.** That is the fail-safe direction:
it is the weaker of the two claims a working profile can make, so a profile that
says nothing never reads as an implementable one, and every profile written
before the declaration existed keeps behaving exactly as it did.

### An implementable claim is checked, not believed

The methodology's terminus is that in an implementable profile ultimately only
two possibilities are allowed: either a specific element is supported (`R` or
`RE`) or it is not (`X`); and for a conditional usage the true and false
outcomes must also be defined only as `R`, `RE` or `X`. A profile that claims
the level is held to exactly that, when the profile is **defined**. Three things
refuse the claim, each `PROFILE_MALFORMED` naming the offending rule's
structural locus and the offending declaration:

- **A usage the level does not admit**: `C`, `CE`, `O` or `B`. Note that `C` and
  `CE` are refused even though this engine knows outcomes for them: the
  methodology requires an implementable profile's conditional outcomes to be
  _defined_, and a bare code defines them nowhere in the profile. Write
  `C(R/X)` and say so.
- **A declared conditional carrying an outcome the level does not admit**, such
  as `C(R/O)`.
- **A rule that declares no usage at all.** An omitted usage means Optional
  everywhere else and is never refused there; at this level the profile has
  asserted that optionality is gone, so silence is a claim it cannot make. It
  applies to segment, field and component rules alike.

A refused claim is **never** the level echoed on the result: it falls back to
`constrainable`, because a run that returned diagnostics instead of assessing
the message verified no claim of completeness. That holds for any profile defect,
not only a level-derived one, since a defect anywhere can stop the gate from
reaching the rules below it.

**The level changes no message check.** It alters nothing about which findings
fire for a given message, their severity, cardinality behaviour, predicate
evaluation, or the value-set and coding-system checks. It decides whether the
_profile_ is refused, never what the _message_ is found to be.

**And it is still not an attestation.** The level is the author's claim, checked
for internal consistency against the profile itself: never an external,
third-party or accredited statement. Zero findings at `implementable` level
means the profile removed its own optionality and nothing it declared was
violated. It does not mean anyone certified the interface.

## Binding a value set to the coding system its codes come from

A bare `valueSet` answers one question: is this code one we accept? It says
nothing about **where the code came from**, and the message does: a coded
element carries the sender's claimed coding system right beside the code. So a
feed sending a plausible, permitted-looking code labelled with the wrong system
validates clean against a bare value set, which is the more dangerous of the two
mistakes an interface can make about a code.

Add `codingSystem` to the rule and the engine compares that claim too:

```ts runnable
import {
  parseHL7,
  validateAgainstProfile,
  FINDING_CODES,
  type ConformanceProfile,
} from "@cosyte/hl7";

// "OBX-3 must carry one of our two result codes, and that code must be a LOINC
// code." The value set is still yours; the binding says where it must come from.
const profile: ConformanceProfile = {
  name: "loinc-results",
  segments: [{ segment: "OBX", fields: [{ field: 3, valueSet: ["WBC", "RBC"], codingSystem: "LN" }] }],
};

const head = "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419101500||ORU^R01|MSG00004|P|2.5";
const check = (obx3: string) =>
  validateAgainstProfile(parseHL7([head, `OBX|1|NM|${obx3}||7.5`].join("\r")), profile).findings;

// A permitted code, correctly labelled LOINC. Nothing fires.
check("WBC^White Blood Cells^LN").length; // => 0

// The same code labelled SNOMED CT. Membership still passes, and the binding
// catches exactly what membership cannot see.
check("WBC^White Blood Cells^SCT")[0]?.code; // => "PROFILE_CODING_SYSTEM_MISMATCH"

// A code you do not accept, correctly labelled. A different answer, on purpose.
check("XYZ^Mystery^LN")[0]?.code; // => "PROFILE_VALUE_NOT_IN_SET"

// Wrong on both counts: exactly one finding of each, never one merged answer.
const both = check("XYZ^Mystery^SCT");
both.length; // => 2
both.map((finding) => finding.code).join(" + ");
// => "PROFILE_VALUE_NOT_IN_SET + PROFILE_CODING_SYSTEM_MISMATCH"

// Case and the well-known aliases resolve to the same registered acronym, so a
// feed sending "loinc" against a binding of "LN" is a match, not a false alarm.
check("WBC^White Blood Cells^loinc").length; // => 0

// No coding system at all is a finding, never a pass.
check("WBC^White Blood Cells")[0]?.code === FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH;
// => true

// The finding names the expected system and the component it read, and never
// the claim the message made.
const mismatch = check("WBC^White Blood Cells^SCT")[0];
mismatch?.locus.component; // => 3
mismatch?.message.includes("SCT"); // => false
mismatch?.message.includes("LN"); // => true
```

**It is opt-in, and it is a second check rather than a different one.** A rule
that declares no `codingSystem` behaves exactly as it always has. A rule that
declares one runs both checks independently, so a permitted code under the wrong
system is one coding-system finding and no value-set finding.

**Comparison is by resolved identity, not by string equality.** `LN`, `LOINC`,
`loinc` and `  LN  ` all name the same system, and so do `SCT`, `SNOMED` and
`SNOMEDCT`. The same map [`codingSystem()`](./spec-notes-coding-system.md) uses
resolves both sides, so a correct feed writing a different accepted spelling is
never reported.

**Which component carries the system.** By default the engine reads **two
positions after** the component it checks the code at, which is the coded
element's own code-to-system relationship: a code at component 1 puts its system
at component 3, and an alternate code at component 4 puts its alternate system
at component 6. So `{ valueSet, codingSystem }` checks the primary triplet, and
adding `component: 4` moves the whole check to the alternate one. Set
`codingSystemComponent` explicitly for a field whose layout does not follow that
offset. To check **both** triplets, declare two rules on the same field.

**An absent or blank claim is reported, not waved through.** A present,
non-empty repetition whose coding-system component is missing, empty,
whitespace-only, or names a system that cannot be resolved is the same finding
with the same code. Deciding otherwise would let the exact case the binding
exists for pass by omitting a component. An **empty** repetition is not
reported: it claims no code, so it has no provenance to be wrong about, and an
absent or empty **field** is left to its usage code exactly as before.

**An identifier this library does not recognize is refused when the profile is
defined**, as `PROFILE_MALFORMED`, rather than compared against a system that
cannot be resolved. So is a binding that is not a string, is blank, declares a
`codingSystemComponent` that is not a positive integer, declares that component
without an identifier, or is declared on a rule with no `valueSet` at all: a
binding with nothing to bind is a defect, not a system-only check.

Two consequences worth stating plainly:

- **The recognition set is a deliberate subset, not the whole registry.** It is
  the same safety-relevant map documented in
  [coding-system provenance](./spec-notes-coding-system.md), so some identifiers
  that are genuinely registered are still refused here. That is the fail-safe
  direction: a refusal at authoring time is visible, a comparison against an
  unresolvable system is not.
- **A local or site-specific coding system cannot be bound.** By construction.
  If your interface uses one, keep the bare `valueSet` form for that rule.

**This checks the sender's claim, never the code.** Nothing here verifies that
the code exists in the system the message names, or that the system is current.
hl7 still ships no code set and makes no network call; the binding lets you
encode the assertion your own interface requires, and asserts nothing of its own.

## Declaring what a field's components are

A field rule constrains the field. `components` constrains what is **inside**
it: a list of 1-indexed component positions, each with an optional usage code.

**A component's cardinality is implied by its usage and is never declared.** The
methodology requires an explicit cardinality range for segment groups, segments
and field elements, and states that components do not carry one: the range
follows from the usage code instead. `R` implies `[1..1]`, `RE` and `O` imply
`[0..1]`, and `X` implies `[0..0]`. A component has no repetition construct in
HL7 v2, so those reduce to presence: `[1..1]` is "valued here" and `[0..0]` is
"not valued here". Declaring a `cardinality` on a component rule is
`PROFILE_MALFORMED`, not an extra constraint the engine quietly honours.

**Declaring component rules CLOSES the field's component set**, and that is the
point. Without it the engine grades only what you wrote down, so a vendor
stuffing a fourth component into a field you specified with three passes clean.
The methodology counts that as a conformance violation rather than harmless
extra content, and its own example is exactly that case: data present for a
fourth component where the profile defines three. Content at a component index
your rule does not declare is `PROFILE_UNDECLARED_CONTENT`, one finding per
undeclared index per repetition.

```ts runnable
import {
  parseHL7,
  validateAgainstProfile,
  FINDING_CODES,
  type ConformanceProfile,
} from "@cosyte/hl7";

// "A patient identifier is an ID in component 1, an assigning authority in
// component 4 and an identifier type in component 5. Components 2 and 3 are not
// supported, and there is nothing past component 5."
const profile: ConformanceProfile = {
  name: "identifier-shape",
  segments: [
    {
      segment: "PID",
      fields: [
        {
          field: 3,
          name: "Patient Identifier List",
          components: [
            { component: 1, name: "ID Number", usage: "R" },
            { component: 2, name: "Check Digit", usage: "X" },
            { component: 3, name: "Check Digit Scheme", usage: "X" },
            { component: 4, name: "Assigning Authority", usage: "RE" },
            { component: 5, name: "Identifier Type Code", usage: "R" },
          ],
        },
      ],
    },
  ],
};

const head = "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|MSG00001|P|2.5";
const check = (pid3: string) =>
  validateAgainstProfile(parseHL7([head, `PID|1||${pid3}||Doe^John`].join("\r")), profile).findings;

// A conforming identifier. Nothing fires.
check("MRN12345^^^HOSP^MR").length; // => 0

// No identifier type: component 5 is Required, so its implied [1..1] fires.
check("MRN12345^^^HOSP")[0]?.code; // => "PROFILE_REQUIRED_ABSENT"
check("MRN12345^^^HOSP")[0]?.locus.component; // => 5

// A check digit where the profile says X: its implied [0..0] fires.
check("MRN12345^7^^HOSP^MR")[0]?.code; // => "PROFILE_NOT_PERMITTED"

// A SIXTH component, which the profile never declared at all.
const extra = check("MRN12345^^^HOSP^MR^SURPRISE");
extra.length; // => 1
extra[0]?.code === FINDING_CODES.PROFILE_UNDECLARED_CONTENT; // => true
extra[0]?.locus.component; // => 6

// PHI-safe like every other finding: the surprising value is never named, and
// the message carries the locus plus how many components the rule declares.
extra[0]?.message.includes("SURPRISE"); // => false
extra[0]?.message.includes("component 6"); // => true

// An EMPTY list carries no component rule, so it says exactly what leaving the
// member out says: no depth declared, nothing closed, nothing reported.
const noDepth: ConformanceProfile = {
  name: "no-depth",
  segments: [{ segment: "PID", fields: [{ field: 3, components: [] }] }],
};
const raw = parseHL7([head, "PID|1||MRN12345^^^HOSP^MR^SURPRISE||Doe^John"].join("\r"));
validateAgainstProfile(raw, noDepth).findings.length; // => 0
```

**Omitting `components` changes nothing, and an empty list is omitting it.** A
field rule that declares none declares no depth, is checked exactly as it always
has been, and can never emit `PROFILE_UNDECLARED_CONTENT`. The check is additive
and opt-in per rule. `components: []` declares no component rule, so it means
"no depth declared" and never "this field has no components": a list built by a
filter that matched nothing constrains nothing, rather than making every
component of every repetition undeclared content.

`components` (plural) is not `component` (singular). The singular one says
which component the `length` and `valueSet` checks read; it declares no
component rule and closes nothing.

A few boundaries worth stating plainly:

- **Declaring an index is what closes the set, not constraining it.**
  `{ component: 4 }` with no usage means "component 4 exists and is Optional",
  which is enough to stop it being undeclared content.
- **An empty component is not content.** Trailing separators, an empty
  component and an empty subcomponent are all absence, so none of them is
  reported. A component is valued when any of its subcomponents carries
  something.
- **Component rules are evaluated per PRESENT repetition.** An absent or empty
  field is left to its own usage code exactly as before, and an empty repetition
  inside a present field reports nothing.
- **A conditional usage on a component is never decided.** A component rule
  carries no `condition` and a caller resolution names a segment plus a field,
  so `C`, `CE`, `B` and a declared conditional all leave a component's presence
  unevaluated, on the same terms an undecided conditional field rule gets.
- **This goes exactly one level deep.** Sub-component rules are not supported,
  and a component rule says nothing about what is inside its component.
- **The check is only as good as the depth you declare.** A shallow profile
  still under-reports, which is a property of the profile rather than of the
  engine: an undeclared field, an undeclared segment and an undeclared
  sub-component are all still unchecked, and "no findings" is still not an
  attestation.

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
- `PROFILE_CODING_SYSTEM_MISMATCH`: a present repetition does not carry the
  coding system the rule binds its value set to.
- `PROFILE_UNDECLARED_CONTENT`: a present repetition carries content at a
  component index the field rule does not declare. Only a rule carrying at least
  one `components` entry can emit it.
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
// The profile declares no level, so it claims the weaker one and is assessed
// at it: parts of a message an all-optional rule never constrained were never
// asserted either way.
result.level; // => "constrainable"
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
