# Vendored snapshot: HL7 Terminology 7.5.0, the eight v2 tables

This directory holds **verbatim, byte-for-byte** copies of the HL7 Terminology files the
`@cosyte/hl7/tables` entry point is generated from, and of the parts of one more. `pnpm generate:tables`
(`scripts/generate-v2-tables.ts`) reads only this directory and writes
`src/tables/generated/v2-tables.ts`; it never reaches the network.

Nothing here is edited or reformatted. One file, HL7's master list of v2 tables, is committed as
nine verbatim byte ranges rather than whole, for the reason given below. The only files in this
directory this repository wrote are `snapshot.json` and this README.

## Provenance

| Fact           | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Publication    | HL7 Terminology (`hl7.terminology`) 7.5.0, `https://terminology.hl7.org/7.5.0/` |
| Repository     | [HL7/UTG](https://github.com/HL7/UTG)                                           |
| Commit         | `828b7136548bc82559a4fff34bc4a47f62197ed5` (2026-10-26)                         |
| Snapshot taken | 2026-11-12                                                                      |
| Licence        | CC0, per the copyright statement each code system carries                       |

HL7/UTG carries no release tags. The commit above is the one whose `publication-request.json`
first names version `7.5.0` ("updating publication-request.json"), on top of the commit titled
"prep for 7.5.0". The two later commits on the default branch at the time of the snapshot touched
none of the files here. `publication-request.json` is vendored so the generator can check the
version against HL7's own file rather than against this README.

`snapshot.json` records the byte count, sha256 and URL at that commit of every file below. The
generator refuses a file whose bytes no longer match.

HL7's master list of v2 tables, `v2-tables.xml`, is 1,071,619 bytes: more than this repository's
PHI sweep can read out of git. So only nine byte ranges of it are committed, each verbatim: the
header before its first row (for the file's copyright) and the row of each of the eight tables.
`snapshot.json` records the whole file's sha256 and byte count under `tableList`, and each range's
offsets in it under `cutFrom`. To check them against a fresh download of the file at the commit
above, run `pnpm generate:tables --cut <path to v2-tables.xml>`: it refuses a file whose sha256
differs, cuts the nine ranges again, refuses any that differs from its record, and writes them.

## Licence and notice

Each code system's copyright element reads, in part: "THO is copyright ©1989+ Health Level Seven
International and is made available under the CC0 designation." The generator refuses a code
system whose copyright statement is anything else, or whose text carries any other copyright,
licence or ownership notice, because third-party content is the one part of HL7 Terminology the
CC0 designation does not cover.

The shipped tables are derived from these files and altered: each keeps only its codes, display
text, status and the version a code was deprecated in; the per-version lists are rebuilt from
those deprecation versions and each table's introduction version; and a long dash in display text
is written as a hyphen. They are not HL7 Terminology itself, and HL7 does not endorse this package.

## Layout

```
vendor/hl7-terminology/
  snapshot.json               provenance: publication, commit, per-file sha256 and URL
  publication-request.json    HL7's own record of the publication the commit requests
  v2-tables/
    header.xml                v2-tables.xml up to its first row: the file's copyright
    NNNN.xml                  one table's row of v2-tables.xml: name, type, introduction version
  code-systems/
    cs-v2-NNNN.xml            one FHIR CodeSystem per table: 0003, 0008, 0076, 0103,
                              0104, 0155, 0211, 0357
```

## What the source records, and what it does not

- Each code's display text and `status`. Most statuses are `active` or `deprecated`; a few codes
  carry `N` or `B`, which the source does not define. They ship unchanged.
- For some codes, `v2-table-deprecated`: the v2 version the code was deprecated in. Every value in
  these eight files is `2.9`. Other codes are marked `deprecated` with no version.
- For each table, in its row of `v2-tables.xml`, the version the table was introduced in.
- **Not** the version each code was added in. That is why a lookup at a version older than 2.9
  answers "unknown" for a code the current table does not list, rather than "not listed".
- Table 0357 lists sixteen codes: `0`, `100` to `104`, `198`, `199` and `200` to `207`. It does
  not list `105`.
