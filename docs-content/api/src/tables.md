# src/tables

`@cosyte/hl7/tables`: eight structural HL7 v2 code tables, generated from HL7 Terminology 7.5.0.

The tables are 0003 Event type, 0008 Acknowledgment code, 0076 Message type, 0103 Processing ID,
0104 Version ID, 0155 Accept/application acknowledgment conditions, 0211 Alternate character
sets and 0357 Message error condition codes. Each carries its codes, display text, status and
the version a code was deprecated in, with the versions it covers.

Source and licence: HL7 Terminology 7.5.0 (https://terminology.hl7.org/7.5.0/), published by
Health Level Seven International under the CC0 designation. These tables are derived from it and
altered: each keeps only its codes, display text, status and deprecation version, the
per-version lists are rebuilt from the deprecation versions, and a long dash in display text is
written as a hyphen. They are not HL7 Terminology itself, and HL7 does not endorse this package.
[V2\_TABLE\_SOURCE](#v2_table_source) carries the same citation, the commit and every file's sha256.

This entry point is separate from `@cosyte/hl7`, which never imports it, so the main entry
point's size and import time do not change for a caller who does not use it.

## Interfaces

### V2Table

One HL7 v2 table, with where it came from and the versions it covers.

#### Properties

##### codes

> `readonly` **codes**: readonly `string`[]

Every code, in the source's order. Bind it into a profile as a `valueSet`.

##### codeSystemUrl

> `readonly` **codeSystemUrl**: `string`

The code system's canonical URL.

##### entries

> `readonly` **entries**: readonly [`V2TableEntry`](#v2tableentry)[]

Every code with its display text, status and deprecation version, in the source's order.

##### id

> `readonly` **id**: [`V2TableId`](#v2tableid-1)

The table number.

##### introducedIn

> `readonly` **introducedIn**: `string`

The v2 version the master list records the table as introduced in.

##### name

> `readonly` **name**: `string`

The table's name in HL7's master list of v2 tables.

##### pageUrl

> `readonly` **pageUrl**: `string`

The code system's page in the HL7 Terminology 7.5.0 publication.

##### type

> `readonly` **type**: `string`

`"HL7"` for an HL7-defined table, as the master list records it.

##### versions

> `readonly` **versions**: readonly `string`[]

The v2 versions this table covers, oldest first: the releases in table 0104 from the one the
table was introduced in. A lookup for any other version answers `"unknown"`.

***

### V2TableCodesOptions

Options for [v2TableCodes](#v2tablecodes-1).

#### Properties

##### excludeDeprecated?

> `readonly` `optional` **excludeDeprecated?**: `boolean`

Leave out the codes deprecated at or before the version asked for. A code the source marks
deprecated without a version is left out only at the newest version, the one the source
speaks for. Default `false`.

***

### V2TableEntry

One code of a table, as HL7 Terminology 7.5.0 records it.

#### Properties

##### code

> `readonly` **code**: `string`

The code, exactly as the source spells it. Codes are case sensitive.

##### deprecatedIn?

> `readonly` `optional` **deprecatedIn?**: `string`

The v2 version the source records the code as deprecated in. Absent when it records none,
which includes every code it marks `"deprecated"` without a version.

##### display

> `readonly` **display**: `string`

The source's display text, with a long dash written as a hyphen.

##### status

> `readonly` **status**: `string`

The concept's status as the source records it: `"active"` or `"deprecated"` for most codes.
The source also carries `"N"` and `"B"` on a few codes without defining them; they are passed
through unchanged rather than guessed at.

***

### V2TableSource

Where the tables came from: the publication, its licence and the notice that travels with it.

#### Properties

##### commit

> `readonly` **commit**: `string`

The commit the vendored files were read at, the one that requested the 7.5.0 publication.

##### files

> `readonly` **files**: readonly `object`[]

Every source file the data was generated from, with its sha256 and its URL at the commit. A
row of HL7's master table list is a byte range of the file at its `url`, and its sha256 is the
range's.

##### license

> `readonly` **license**: `string`

The SPDX identifier of the publication's licence, `"CC0-1.0"`.

##### licenseUrl

> `readonly` **licenseUrl**: `string`

The licence page the source's own copyright statement names.

##### name

> `readonly` **name**: `string`

`"HL7 Terminology"`.

##### notice

> `readonly` **notice**: `string`

The plain notice: derived from HL7 Terminology, altered, and not endorsed by HL7.

##### packageId

> `readonly` **packageId**: `string`

The publication's package id, `"hl7.terminology"`.

##### repository

> `readonly` **repository**: `string`

The repository HL7 publishes the source from.

##### url

> `readonly` **url**: `string`

The publication's versioned home.

##### version

> `readonly` **version**: `string`

The publication version the data was read from, `"7.5.0"`.

## Type Aliases

### V2CodeLookup

> **V2CodeLookup** = \{ `code`: `string`; `entry`: [`V2TableEntry`](#v2tableentry); `result`: `"listed"`; `table`: [`V2TableId`](#v2tableid-1); `version`: `string`; \} \| \{ `code`: `string`; `entry`: [`V2TableEntry`](#v2tableentry); `result`: `"deprecated"`; `since`: `string` \| `undefined`; `table`: [`V2TableId`](#v2tableid-1); `version`: `string`; \} \| \{ `code`: `string`; `result`: `"not-listed"`; `table`: [`V2TableId`](#v2tableid-1); `version`: `string`; \} \| \{ `code`: `string`; `entry?`: [`V2TableEntry`](#v2tableentry); `reason`: [`V2LookupUnknownReason`](#v2lookupunknownreason); `result`: `"unknown"`; `table`: `string`; `version`: `string`; \}

What [lookupV2Code](#lookupv2code) found. It never rejects a code it cannot speak for: where the source
does not settle the question it answers `"unknown"` with the reason.

#### Union Members

##### Type Literal

\{ `code`: `string`; `entry`: [`V2TableEntry`](#v2tableentry); `result`: `"listed"`; `table`: [`V2TableId`](#v2tableid-1); `version`: `string`; \}

###### code

> `readonly` **code**: `string`

###### entry

> `readonly` **entry**: [`V2TableEntry`](#v2tableentry)

###### result

> `readonly` **result**: `"listed"`

The code is in the table and not deprecated at that version.

###### table

> `readonly` **table**: [`V2TableId`](#v2tableid-1)

###### version

> `readonly` **version**: `string`

***

##### Type Literal

\{ `code`: `string`; `entry`: [`V2TableEntry`](#v2tableentry); `result`: `"deprecated"`; `since`: `string` \| `undefined`; `table`: [`V2TableId`](#v2tableid-1); `version`: `string`; \}

###### code

> `readonly` **code**: `string`

###### entry

> `readonly` **entry**: [`V2TableEntry`](#v2tableentry)

###### result

> `readonly` **result**: `"deprecated"`

The code is in the table and deprecated at or before that version.

###### since

> `readonly` **since**: `string` \| `undefined`

The version it was deprecated in, or `undefined` when the source records none.

###### table

> `readonly` **table**: [`V2TableId`](#v2tableid-1)

###### version

> `readonly` **version**: `string`

***

##### Type Literal

\{ `code`: `string`; `result`: `"not-listed"`; `table`: [`V2TableId`](#v2tableid-1); `version`: `string`; \}

###### code

> `readonly` **code**: `string`

###### result

> `readonly` **result**: `"not-listed"`

The code is not in the table at the newest version, the one the source speaks for.

###### table

> `readonly` **table**: [`V2TableId`](#v2tableid-1)

###### version

> `readonly` **version**: `string`

***

##### Type Literal

\{ `code`: `string`; `entry?`: [`V2TableEntry`](#v2tableentry); `reason`: [`V2LookupUnknownReason`](#v2lookupunknownreason); `result`: `"unknown"`; `table`: `string`; `version`: `string`; \}

###### code

> `readonly` **code**: `string`

###### entry?

> `readonly` `optional` **entry?**: [`V2TableEntry`](#v2tableentry)

The code's entry, when the code is in the table.

###### reason

> `readonly` **reason**: [`V2LookupUnknownReason`](#v2lookupunknownreason)

###### result

> `readonly` **result**: `"unknown"`

The source does not settle the question; `reason` says why.

###### table

> `readonly` **table**: `string`

###### version

> `readonly` **version**: `string`

***

### V2LookupUnknownReason

> **V2LookupUnknownReason** = `"table-not-shipped"` \| `"version-not-covered"` \| `"absence-not-recorded"` \| `"deprecation-not-dated"`

Why a lookup could not answer:

- `"table-not-shipped"`: the table is not one of the eight.
- `"version-not-covered"`: the version is not a release in table 0104 from the table's
  introduction on (a later or local version, a demo code, a blank).
- `"absence-not-recorded"`: the code is not in the table, and the version is older than the
  newest. The source is the current table, so it cannot say a code was never in an older one.
- `"deprecation-not-dated"`: the source marks the code deprecated without saying since when, and
  the version is older than the newest.

***

### V2TableId

> **V2TableId** = `"0003"` \| `"0008"` \| `"0076"` \| `"0103"` \| `"0104"` \| `"0155"` \| `"0211"` \| `"0357"`

The number of one of the eight HL7 v2 tables this entry point ships: 0003 Event type, 0008
Acknowledgment code, 0076 Message type, 0103 Processing ID, 0104 Version ID, 0155
Accept/application acknowledgment conditions, 0211 Alternate character sets and 0357 Message
error condition codes.

## Variables

### V2\_TABLE\_IDS

> `const` **V2\_TABLE\_IDS**: readonly [`V2TableId`](#v2tableid-1)[]

The eight table numbers, in the order they ship.

#### Example

```ts
import { V2_TABLE_IDS } from "@cosyte/hl7/tables";
V2_TABLE_IDS.length; // 8
```

***

### V2\_TABLE\_SOURCE

> `const` **V2\_TABLE\_SOURCE**: [`V2TableSource`](#v2tablesource)

Where the tables came from: HL7 Terminology 7.5.0, its CC0 licence, the commit the files were
read at, every file's sha256, and the notice that travels with the data.

#### Example

```ts
import { V2_TABLE_SOURCE } from "@cosyte/hl7/tables";
V2_TABLE_SOURCE.version; // "7.5.0"
V2_TABLE_SOURCE.license; // "CC0-1.0"
```

***

### V2\_TABLES

> `const` **V2\_TABLES**: `Readonly`\<`Record`\<[`V2TableId`](#v2tableid-1), [`V2Table`](#v2table)\>\>

The eight tables, keyed by number. Each is frozen, with its codes, its entries (code, display
text, status and deprecation version), the versions it covers and its HL7 Terminology URLs.

A table binds into a conformance profile as a `valueSet`, with no change to the engine.

#### Example

```ts
import { V2_TABLES } from "@cosyte/hl7/tables";
V2_TABLES["0103"].codes; // ["D", "P", "T", "N", "V"]
V2_TABLES["0357"].entries[1]; // { code: "100", display: "Segment sequence error", status: "active" }
```

***

### V2\_VERSIONS

> `const` **V2\_VERSIONS**: readonly `string`[]

The v2 releases table 0104 lists, oldest first, from `"2.0"` to `"2.9"`. The demo code `"2.0D"`
is not a release and is left out.

#### Example

```ts
import { V2_VERSIONS } from "@cosyte/hl7/tables";
V2_VERSIONS.at(-1); // "2.9"
```

## Functions

### lookupV2Code()

> **lookupV2Code**(`id`, `code`, `version`): [`V2CodeLookup`](#v2codelookup)

Look a code up in one table at one v2 version. It answers `"listed"`, `"deprecated"` (with the
version it was deprecated in, where the source records one) or `"not-listed"`, and `"unknown"`
with a reason wherever the source does not settle the question, so a code is never rejected for a
version the table does not cover.

`"not-listed"` is given only at the newest version, `"2.9"`: the source is the current table, so
a code missing from it may still have been in an older version. For the same reason `"listed"`
at an older version means the code is in the current table and was not deprecated by that
version, not that the version already had it. The match is exact: codes are case sensitive.

#### Parameters

##### id

[`V2TableId`](#v2tableid-1)

##### code

`string`

##### version

`string`

#### Returns

[`V2CodeLookup`](#v2codelookup)

#### Example

```ts
import { lookupV2Code } from "@cosyte/hl7/tables";
lookupV2Code("0103", "P", "2.5.1").result; // "listed"
lookupV2Code("0104", "2.3.2", "2.9").result; // "deprecated"
lookupV2Code("0103", "Z", "2.9").result; // "not-listed"
lookupV2Code("0103", "Z", "2.5").result; // "unknown"
```

***

### v2TableCodes()

> **v2TableCodes**(`id`, `version`, `options?`): readonly `string`[] \| `undefined`

The codes of a table at one v2 version, or `undefined` when the version is not one the table
covers (see [V2Table.versions](#versions)) or the table is not one of the eight.

Every code the source lists is in every covered version's list unless `excludeDeprecated` is
set, which leaves out the codes deprecated at or before that version. The source records the
version a code was deprecated in but not the version it was added in, so a list for an older
version can hold a code that version did not yet have.

#### Parameters

##### id

[`V2TableId`](#v2tableid-1)

##### version

`string`

##### options?

[`V2TableCodesOptions`](#v2tablecodesoptions) = `{}`

#### Returns

readonly `string`[] \| `undefined`

#### Example

```ts
import { v2TableCodes } from "@cosyte/hl7/tables";
v2TableCodes("0104", "2.8", { excludeDeprecated: true })?.includes("2.3.2"); // true
v2TableCodes("0104", "2.9", { excludeDeprecated: true })?.includes("2.3.2"); // false
v2TableCodes("0357", "2.3"); // undefined: table 0357 starts at 2.3.1
```
