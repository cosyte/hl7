---
id: v2-code-tables
title: HL7 v2 code tables
sidebar_label: HL7 v2 code tables
description: "The eight structural HL7 v2 tables on the @cosyte/hl7/tables entry point: what each carries, how a lookup answers for a version, and where the data comes from."
---

# HL7 v2 code tables

The `@cosyte/hl7/tables` entry point ships eight structural HL7 v2 tables, generated from HL7
Terminology 7.5.0. It is separate from `@cosyte/hl7`, which never imports it, so a caller who does
not use the tables pays nothing for them in bundle size or import time.

| Table  | Name                                         | Codes | Covers       |
| ------ | -------------------------------------------- | ----- | ------------ |
| `0003` | Event Type                                   | 384   | 2.1 to 2.9   |
| `0008` | Acknowledgment code                          | 6     | 2.1 to 2.9   |
| `0076` | Message Type                                 | 159   | 2.1 to 2.9   |
| `0103` | Processing ID                                | 5     | 2.1 to 2.9   |
| `0104` | Version ID                                   | 17    | 2.1 to 2.9   |
| `0155` | Accept/Application Acknowledgment Conditions | 4     | 2.2 to 2.9   |
| `0211` | Alternate Character Sets                     | 25    | 2.3 to 2.9   |
| `0357` | Message Error Condition Codes                | 16    | 2.3.1 to 2.9 |

The names are the ones HL7's master list of v2 tables gives. A table covers the releases table
0104 lists, from the one HL7's master list records the table as introduced in.

```ts runnable
import { V2_TABLES, V2_TABLE_IDS, V2_VERSIONS } from "@cosyte/hl7/tables";

V2_TABLE_IDS.length; // => 8
V2_TABLES["0103"].codes; // => ["D", "P", "T", "N", "V"]
V2_TABLES["0357"].versions[0]; // => "2.3.1"
V2_VERSIONS.at(-1); // => "2.9"
```

Each table carries its `codes` and its `entries`: the code, the display text, the status, and the
version the code was deprecated in where the source records one. Everything is frozen.

## Bind a table into a profile

A table's `codes` is a list of strings, so it binds into a conformance profile's `valueSet` with no
change to the engine. The check stays a literal comparison against the list.

```ts runnable
import { type ConformanceProfile, parseHL7, validateAgainstProfile } from "@cosyte/hl7";
import { V2_TABLES } from "@cosyte/hl7/tables";

const header: ConformanceProfile = {
  name: "example-header",
  segments: [
    {
      segment: "MSH",
      usage: "R",
      fields: [{ field: 11, usage: "R", valueSet: V2_TABLES["0103"].codes }],
    },
  ],
};

const msg = parseHL7(
  "MSH|^~\\&|EXAPP|EXFAC|EXREG|EXSTATE|20260102080000||ADT^A01|EX00301|X|2.5.1\r" +
    "PID|1||EX0001^^^EXHOSP^MR||Doe^Jane",
);

validateAgainstProfile(msg, header).findings.map((f) => [f.code, f.locus.field]); // => [["PROFILE_VALUE_NOT_IN_SET", 11]]
```

The tables add no parse warning. A code outside a table stays your call to make, through a
profile, because vendor feeds carry local codes in several of these fields.

## Look a code up for a version

`lookupV2Code(table, code, version)` answers for one v2 version. It never rejects a code it
cannot speak for: where the source does not settle the question it answers `"unknown"` with the
reason.

| `result`       | When                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `"listed"`     | The code is in the table and not deprecated at that version.                              |
| `"deprecated"` | The code is deprecated at or before that version. `since` is the version, where recorded. |
| `"not-listed"` | The code is not in the table, at 2.9, the version the source speaks for.                  |
| `"unknown"`    | The source does not settle it. `reason` says why: see below.                              |

| `reason`                  | When                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `"version-not-covered"`   | The version is not a release in table 0104 from the table's introduction on.               |
| `"absence-not-recorded"`  | The code is not in the table, and the version is older than 2.9.                           |
| `"deprecation-not-dated"` | The source marks the code deprecated without a version, and the version is older than 2.9. |
| `"table-not-shipped"`     | The table is not one of the eight.                                                         |

```ts runnable
import { lookupV2Code } from "@cosyte/hl7/tables";

lookupV2Code("0103", "P", "2.5.1").result; // => "listed"
lookupV2Code("0104", "2.3.2", "2.8").result; // => "listed"
lookupV2Code("0104", "2.3.2", "2.9").result; // => "deprecated"
lookupV2Code("0103", "Z", "2.9").result; // => "not-listed"
lookupV2Code("0103", "Z", "2.5").result; // => "unknown"
lookupV2Code("0357", "100", "2.3").result; // => "unknown"
```

The match is exact: the source's code systems are case sensitive, and the lookup trims nothing.

### What a version's answer rests on

HL7 Terminology 7.5.0 is the current table. For some codes it records the version the code was
deprecated in (in these eight tables, always 2.9); it marks other codes deprecated with no version;
and it does not record the version a code was added in. So:

- A code deprecated in 2.9 is `"listed"` for 2.8 and `"deprecated"` for 2.9.
- A code marked deprecated with no version is `"deprecated"` for 2.9 and `"unknown"` for older
  versions.
- `"listed"` for an older version means the code is in the current table and was not deprecated
  by that version, not that the version already had it.
- A code the current table does not list is `"not-listed"` only for 2.9.

`v2TableCodes(table, version)` gives a version's list for a profile. With
`{ excludeDeprecated: true }` it leaves out the codes deprecated at or before that version.

```ts runnable
import { v2TableCodes } from "@cosyte/hl7/tables";

v2TableCodes("0104", "2.8", { excludeDeprecated: true })?.includes("2.3.2"); // => true
v2TableCodes("0104", "2.9", { excludeDeprecated: true })?.includes("2.3.2"); // => false
v2TableCodes("0357", "2.3"); // => undefined
```

A few codes carry a status the source does not define, `"N"` or `"B"` (in table 0357, codes 198
and 199 carry `"N"`, and 204 to 206 carry `"B"`). They ship as the source has them; the lookup
treats them as listed.

## Table 0357 and the acknowledgment builder

`buildAck` writes ERR-3 with the display text from `ERR_CONDITION_CODES` on the main entry point.
That map carries the sixteen codes of table 0357 with the source's display text (so the default
code, `207`, reads "Application error"), plus `105`, which HL7 Terminology 7.5.0 does not list: it
stays so that a caller who already sends it still gets text in ERR-3.2. A test holds the map, `ACK_CODES` and `ACK_CONDITIONS` to the tables
on this entry point.

## Source, licence and notice

| Fact        | Value                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Source      | HL7 Terminology (`hl7.terminology`) 7.5.0, <https://terminology.hl7.org/7.5.0/>                 |
| Licence     | CC0, as each code system's copyright statement says; <https://terminology.hl7.org/license.html> |
| Read from   | [HL7/UTG](https://github.com/HL7/UTG) at commit `828b7136548bc82559a4fff34bc4a47f62197ed5`      |
| Pinned with | the sha256 of every file, in `vendor/hl7-terminology/snapshot.json`                             |

These tables are derived from HL7 Terminology 7.5.0 and altered: each keeps only its codes, display
text, status and the version a code was deprecated in; the per-version lists are rebuilt from those
deprecation versions and each table's introduction version; and a long dash in display text is
written as a hyphen. They are not HL7 Terminology itself, and HL7 does not endorse this package.
`V2_TABLE_SOURCE` carries the same citation, the notice and every file's sha256.

```ts runnable
import { V2_TABLE_SOURCE } from "@cosyte/hl7/tables";

V2_TABLE_SOURCE.version; // => "7.5.0"
V2_TABLE_SOURCE.license; // => "CC0-1.0"
```

The generator, `pnpm generate:tables`, reads only the vendored files and refuses any of them whose
bytes no longer match the recorded sha256, or whose text carries a copyright or licence notice
other than HL7 Terminology's own CC0 statement: third-party content is the one part of HL7
Terminology the CC0 designation does not cover. A test regenerates the module and demands the
same bytes.
