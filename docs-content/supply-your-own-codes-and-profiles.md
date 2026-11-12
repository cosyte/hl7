---
id: supply-your-own-codes-and-profiles
title: Supply your own codes and profiles
sidebar_label: Supply your own codes and profiles
description: "Bind the code lists your interface allows into a conformance profile, and pick the profile a message names in MSH-21 from a list you supply."
---

# Supply your own codes and profiles

The package ships no conformance profile and no code set, and it makes no network call. You bring
both: the codes a field may carry, written into a profile, and the profiles themselves, each under
the identifier a sender puts in MSH-21. This page shows the two together.

## Bind your own codes

Write each code list once, from your copy of the table or your interface specification, and bind
it into a field rule's `valueSet`. The check is a literal comparison against the list you supply.

```ts runnable
import { type ConformanceProfile, parseHL7, validateAgainstProfile } from "@cosyte/hl7";

// The administrative sex codes our interface accepts, from our own copy of the table.
const OUR_SEX_CODES = ["F", "M", "U"] as const;
// The patient classes our admissions feed sends.
const OUR_PATIENT_CLASSES = ["E", "I", "O"] as const;

const intake: ConformanceProfile = {
  name: "example-intake",
  segments: [
    {
      segment: "PID",
      usage: "R",
      fields: [{ field: 8, usage: "RE", valueSet: OUR_SEX_CODES }],
    },
    {
      segment: "PV1",
      usage: "R",
      fields: [{ field: 2, usage: "R", valueSet: OUR_PATIENT_CLASSES }],
    },
  ],
};

const msg = parseHL7(
  "MSH|^~\\&|EXAPP|EXFAC|EXREG|EXSTATE|20260102080000||ADT^A01|EX00201|P|2.5.1\r" +
    "PID|1||EX0001^^^EXHOSP^MR||Doe^Jane|||F\r" +
    "PV1|1|Z",
);

validateAgainstProfile(msg, intake).findings.map((f) => [f.code, f.locus.segment, f.locus.field]); // => [["PROFILE_VALUE_NOT_IN_SET", "PV1", 2]]
```

A finding names the field and the size of the list, never the value the message carried.

## Pick the profile a message names

MSH-21 repeats, one entity identifier (EI) per profile the sender claims. List the profiles you
know, each with the identifier it is published under, and `findMessageProfiles(msg, entries)`
returns the ones MSH-21 names.

```ts runnable
import {
  type ConformanceProfile,
  findMessageProfiles,
  type MessageProfileEntry,
  parseHL7,
  validateAgainstProfile,
} from "@cosyte/hl7";

const intake: ConformanceProfile = {
  name: "example-intake",
  segments: [{ segment: "PID", usage: "R" }],
};
const registry: ConformanceProfile = {
  name: "example-registry",
  segments: [{ segment: "PID", usage: "R" }, { segment: "RXA", usage: "R" }],
};

const ours: readonly MessageProfileEntry[] = [
  { identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" }, profile: intake },
  {
    identifier: {
      entityIdentifier: "EXPROF-2",
      namespaceId: "EXAMPLEORG",
      universalId: "2.16.840.1.113883.19.900.1",
      universalIdType: "ISO",
    },
    profile: registry,
  },
];

const msg = parseHL7(
  "MSH|^~\\&|EXAPP|EXFAC|EXREG|EXSTATE|20260102080000||VXU^V04^VXU_V04|EX00202|P|2.5.1|||ER|AL|||||" +
    "EXPROF-2^^2.16.840.1.113883.19.900.1^ISO\r" +
    "PID|1||EX0001^^^EXHOSP^MR||Doe^Jane",
);

const lookup = findMessageProfiles(msg, ours);

lookup.outcome; // => "one"
lookup.profiles.map((p) => p.name); // => ["example-registry"]

const [profile] = lookup.profiles;
if (lookup.outcome !== "one" || profile === undefined) throw new Error("no single profile named");
validateAgainstProfile(msg, profile).findings.map((f) => f.code); // => ["PROFILE_REQUIRED_ABSENT"]
```

`profile` can be any value, not only a `ConformanceProfile`: a name, a handler, a profile of your
own shape. `MessageProfileEntry<string>` lists names, and the result's `profiles` is then a list of
strings.

## When an identifier matches

An EI is an entity identifier (EI.1) and the authority that assigned it (EI.2 namespace ID, EI.3
universal ID, EI.4 universal ID type), the same three parts as an HD. HL7 defines an HD by its
local namespace ID or by its universal ID and that id's type, and when both are valued they name
the same authority. So a repetition matches an entry when:

1. their entity identifiers are valued and equal; and
2. when both carry a universal ID, the universal IDs are equal, and so are the types when both
   carry one (the namespace IDs are then not compared); or
3. otherwise, when both carry a namespace ID, the namespace IDs are equal; or
4. otherwise, neither names an authority at all.

The universal ID decides when both carry one, so two local names for one authority still match.
When one side names an authority the other cannot confirm (an authority on one side only, or a
namespace ID on one side and only a universal ID on the other), they do not match: list both parts
on your entry if senders vary. Values compare exactly as decoded, with no case folding and no
trimming.

## When MSH-21 names none, or several

`outcome` says which case you have, so an unknown profile is never a silent pass:

| `outcome`    | Means                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| `undeclared` | MSH-21 is empty: the message names no profile                                     |
| `none`       | MSH-21 names one or more profiles, and none of them is in your list               |
| `one`        | every match is to one profile                                                     |
| `several`    | the matches reach two or more profiles, from two repetitions or two of your entries |

`profiles` holds each distinct profile matched, in MSH-21 order and then your list's order.
`matches` pairs each repetition (0-indexed, counting empty ones) with each entry it matched.
`unmatched` lists every repetition that named something and matched nothing, even when another
repetition matched, so you can refuse a message that claims a profile you do not know. Each one
carries a `reason`: `unlisted` when it is a well-formed EI that is not in your list, `malformed`
when it is not the shape of an EI at all.

An EI has at most four components, and none of them holds a subcomponent. A repetition with a
non-empty subcomponent after the first in any component (`EXPROF-1&X^EXAMPLEORG`), or a non-empty
component past the fourth (`EXPROF-1^EXAMPLEORG^^^EXTRA`), never matches, even when its first parts
read like one of your entries: it is listed with `reason: "malformed"`, and it counts as declared,
so `outcome` is never `undeclared` while MSH-21 carries something. Its `identifier` holds only the
first subcomponent of each of the first four components, so read the `reason` before you trust it.
The check splits MSH-21 by the message's own delimiters, whatever they are.

Unlike conformance findings, which withhold message values, this lookup hands the MSH-21
identifiers back to you by design, in `matches` and `unmatched`: they are what you asked about.
Treat them as message data when you log them.

```ts runnable
import { type ConformanceProfile, findMessageProfiles, parseHL7 } from "@cosyte/hl7";

const intake: ConformanceProfile = { name: "example-intake", segments: [] };
const local: ConformanceProfile = { name: "example-local", segments: [] };

const ours = [
  { identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" }, profile: intake },
  { identifier: { entityIdentifier: "EXPROF-3", namespaceId: "EXAMPLEORG" }, profile: local },
];

const header = "MSH|^~\\&|EXAPP|EXFAC|EXREG|EXSTATE|20260102080000||ADT^A01|EX00203|P|2.5.1|||||||||";

const both = findMessageProfiles(parseHL7(header + "EXPROF-1^EXAMPLEORG~EXPROF-3^EXAMPLEORG"), ours);
both.outcome; // => "several"
both.matches.map((m) => [m.repetition, m.entry.profile.name]); // => [[0, "example-intake"], [1, "example-local"]]

const unknown = findMessageProfiles(parseHL7(header + "EXPROF-9^OTHERORG"), ours);
unknown.outcome; // => "none"
unknown.unmatched; // => [{ repetition: 0, identifier: { entityIdentifier: "EXPROF-9", namespaceId: "OTHERORG" }, reason: "unlisted" }]

const broken = findMessageProfiles(parseHL7(header + "EXPROF-1&X^EXAMPLEORG"), ours);
broken.outcome; // => "none"
broken.unmatched.map((u) => u.reason); // => ["malformed"]

findMessageProfiles(parseHL7(header), ours).outcome; // => "undeclared"
```

The lookup reads the message and changes nothing. It reads no profile XML: you write each profile
as a `ConformanceProfile`, as in [Validate a message](./validate-messages.md).

## Reference

- [`findMessageProfiles`](./api/src/README.md#findmessageprofiles),
  [`MessageProfileEntry`](./api/src/README.md#messageprofileentry),
  [`MessageProfileLookup`](./api/src/README.md#messageprofilelookup),
  [`MessageProfileMiss`](./api/src/README.md#messageprofilemiss)
- [`validateAgainstProfile`](./api/src/README.md#validateagainstprofile),
  [`ConformanceProfile`](./api/src/README.md#conformanceprofile)
- [`msg.meta.messageProfileIdentifiers`](./read-data-types-by-name.md#read-the-message-profile-a-sender-claims)
  reads MSH-21 without a list.
