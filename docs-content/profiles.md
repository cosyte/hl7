---
id: profiles
title: Use and write vendor profiles
sidebar_label: Use vendor profiles
description: "Parse with a built-in vendor profile, write your own for a sender's Z-segments and date formats, layer profiles with extends, and publish one as a package."
---

# Use and write vendor profiles

A profile tells the parser about one sender: the date formats it writes, the Z-segments it adds,
and names for fields it uses its own way. Built-in profiles and the ones you write use the same
`defineProfile()` API; [Built-in profiles](./built-in-profiles.md) lists the eight that ship.

## Parse with a built-in profile

Pass the profile as the second argument to `parseHL7`.

```ts runnable
import { parseHL7, profiles } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|04/19/2026 10:15:00||ADT^A01^ADT_A01|EX00050|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||01/15/1980|M\r" +
  "ZDP|||CARDIOLOGY|Cardiology Department";

const msg = parseHL7(raw, profiles.epic);

msg.meta.timestamp?.matchedFormat; // => "MM/DD/YYYY HH:mm:ss"
msg.patient?.dateOfBirth?.year; // => 1980
msg.part("ZDP")?.get("departmentCode")?.value; // => "CARDIOLOGY"
msg.warnings.some((w) => w.code === "UNKNOWN_SEGMENT"); // => false
msg.profile?.lineage; // => ["epic"]
```

A Z-segment the profile declares raises no `UNKNOWN_SEGMENT` warning.

## Write a profile for your sender

`defineProfile` returns a frozen profile. `customSegments` maps each Z-segment to field names and
their 1-indexed positions; `dateFormats` lists the sender's formats, written in the
[date token grammar](./date-token-grammar.md).

```ts runnable
import { defineProfile, parseHL7 } from "@cosyte/hl7";

const myHospital = defineProfile({
  name: "myhospital",
  description: "Our ADT feed: a 12-hour clock and an allergy Z-segment",
  dateFormats: ["MM/DD/YYYY hh:mm A"],
  customSegments: {
    ZAL: { fields: { allergyId: 1, severity: 2 } },
  },
});

const raw =
  "MSH|^~\\&|EHR|MAIN|LAB|REF|04/19/2026 02:30 PM||ADT^A01|EX00051|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q\r" +
  "ZAL|ALG-1|HIGH";

const msg = parseHL7(raw, myHospital);

msg.meta.timestamp?.hour; // => 14
msg.part("ZAL")?.get("severity")?.value; // => "HIGH"
```

When the compiler can see the profile, the names it declares for a segment are the only ones `get`
accepts on that segment, so a typo fails the build instead of reading blank:

```ts runnable
import { defineProfile, parseHL7 } from "@cosyte/hl7";

const vendor = defineProfile({
  name: "vendor",
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
    ZRS: { fields: { resultStatus: 1 } },
  },
});

const msg = parseHL7(
  "MSH|^~\\&|EHR|MAIN|LAB|REF|20260419101500||ADT^A01|EX00052|P|2.5\r" +
    "ZDP|||CARDIOLOGY|Cardiology Department",
  vendor,
);

msg.part("ZDP")?.get("departmentName")?.value; // => "Cardiology Department"
// msg.part("ZDP")?.get("departmentCod"); // does not compile: not a declared name
// msg.part("ZDP")?.get("resultStatus"); // does not compile: that name belongs to ZRS
```

A declared name the message did not carry still reads `undefined`. The check only tightens where
the declaration is visible: no profile, a value typed as `Profile`, a default profile, an undeclared
segment, or a walk over `msg.allSegments()` all accept any string.

`defineProfile` refuses a bad declaration when you define it, with a `ProfileDefinitionError` that
names the problem: a missing name, a custom segment that is not a Z-segment, a position that is not
a positive whole number, a date format the grammar cannot honor, or an unknown option key (with a
suggestion).

```ts runnable
import { defineProfile, ProfileDefinitionError } from "@cosyte/hl7";

let error: unknown;
try {
  // @ts-expect-error: the option is segmentOverrides
  defineProfile({ name: "typo", segmentOverride: {} });
} catch (caught) {
  error = caught;
}

error instanceof ProfileDefinitionError; // => true
(error as ProfileDefinitionError).profileName; // => "typo"
```

## Name a field on a standard segment

`segmentOverrides` gives a name to a position on a standard segment, for a site that puts its own
value in a standard field: a second record number in PID-19, a local severity code in AL1-4.

```ts runnable
import { defineProfile, parseHL7 } from "@cosyte/hl7";

const site = defineProfile({
  name: "myhospital-adt",
  segmentOverrides: {
    PID: { fields: { siteMrn: 19 } },
    AL1: { fields: { localSeverityCode: 4 } },
  },
});

const raw =
  "MSH|^~\\&|EHR|MAIN|LAB|REF|20260419101500||ADT^A01|EX00053|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||||||||||||||SITE-778\r" +
  "AL1|1|DA|PCN^Penicillin^L|LOCAL-3";

const msg = parseHL7(raw, site);

msg.part("PID")?.get("siteMrn")?.value; // => "SITE-778"
msg.part("AL1")?.get("localSeverityCode")?.value; // => "LOCAL-3"
msg.patient?.mrn; // => "MRN12345"
msg.get("PID.19"); // => "SITE-778"
```

Positions are HL7's 1-indexed positions, the same as `seg.field(n)`, MSH included: a name at `3`
on MSH is MSH-3.

An override adds a named read and changes nothing else. The typed helpers keep reading the
standard positions (`msg.patient?.mrn` above still reads PID-3), dot-paths stay positional,
serialization and the warning list are unchanged, and the write methods take positions, not names.
HL7 traffic carries patient data, and an alias that moved an existing accessor would hand a
consumer a different clinical value with nothing to notice.

`defineProfile` refuses an override keyed by a Z-segment (that belongs in `customSegments`), a name
that is not a standard segment in its uppercase spelling, and a position that is not a positive
whole number. An empty map behaves exactly like none.

## Layer profiles

`extends` builds on one parent or several. Use it to add your site's Z-segments to a vendor
baseline.

```ts runnable
import { defineProfile, profiles } from "@cosyte/hl7";

const myEpic = defineProfile({
  name: "my-epic",
  extends: profiles.epic,
  customSegments: { ZPR: { fields: { providerId: 1 } } },
});

myEpic.lineage; // => ["epic", "my-epic"]
Object.keys(myEpic.customSegments ?? {}); // => ["ZDP", "ZRS", "ZPR"]

const combined = defineProfile({
  name: "epic-plus-lab",
  extends: [profiles.epic, profiles.genericLab],
  dateFormats: ["YYYY-MM-DD HH:mm"],
});

combined.lineage; // => ["epic", "genericLab", "epic-plus-lab"]
combined.dateFormats; // => ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY", "YYYYMMDD HHmm", "YYYY-MM-DD", "YYYY-MM-DD HH:mm"]
```

How layers merge:

- **`description`**: a later layer replaces an earlier one.
- **`dateFormats`** and **`lineage`**: concatenated without duplicates, in first-seen order.
- **`customSegments`** and **`segmentOverrides`**: merged per segment; where two layers name the
  same position, the child's name wins, and the parent's names at other positions stay.
- **`onWarning`**: the handlers run in lineage order, parents first. An error thrown by one does
  not stop the next.
- **`name`**: never inherited.

Two field names that collide after the merge are a `ProfileDefinitionError` at definition time,
not at parse time. `profile.describe()` prints a summary of every layer.

## Set a default profile

`setDefaultProfile` applies a profile to every later `parseHL7` call in the process. Passing the
profile on each call is usually clearer; the default suits a pipeline with a single sender.

```ts runnable
import { getDefaultProfile, parseHL7, profiles, setDefaultProfile } from "@cosyte/hl7";

const raw = "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01|EX00054|P|2.5";

setDefaultProfile(profiles.epic);
getDefaultProfile()?.name; // => "epic"
parseHL7(raw).profile?.name; // => "epic"
parseHL7(raw, { profile: null }).profile; // => undefined

setDefaultProfile(null);
getDefaultProfile(); // => undefined
```

The default lives in the current process only: it is not shared with workers.

## Publish a profile as a package

The [profile starter kit](https://github.com/cosyte/hl7/tree/main/examples/profile-starter-kit)
is a package you copy and publish: replace its placeholders with your names, swap in your segments
and fixtures, and publish. Its
[CUSTOMIZING.md](https://github.com/cosyte/hl7/blob/main/examples/profile-starter-kit/CUSTOMIZING.md)
walks through the five steps.

```bash
cp -r examples/profile-starter-kit my-profile && cd my-profile
# Replace {{YOUR_ORG}} and {{PROFILE_NAME}}, then:
pnpm install
pnpm test
pnpm build
pnpm publish --access public
```

## Reference

- [`defineProfile`](./api/README.md#defineprofile),
  [`DefineProfileOptions`](./api/README.md#defineprofileoptions),
  [`Profile`](./api/README.md#profile),
  [`CustomSegmentDefinition`](./api/README.md#customsegmentdefinition)
- [`profiles`](./api/README.md#profiles), [`setDefaultProfile`](./api/README.md#setdefaultprofile),
  [`getDefaultProfile`](./api/README.md#getdefaultprofile)
- [`ProfileDefinitionError`](./api/README.md#profiledefinitionerror),
  [`KNOWN_SEGMENTS`](./api/README.md#known_segments),
  [`SUPPORTED_DATE_TOKENS`](./api/README.md#supported_date_tokens)
