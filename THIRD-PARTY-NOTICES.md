# Third-party material

`@cosyte/hl7` is ours, under the MIT licence in `LICENSE`. Two registries and the eight code
tables of the `@cosyte/hl7/tables` entry point are built from material we did not write. This file records where that material came from, as plainly as we can
state it. It records facts about the sources and draws no conclusion about their terms.

## HL7 v2+ publication (`HL7/v2ig`)

The message structure registry (`STRUCTURE_REGISTRY_PROVENANCE` and the structures behind it) is
generated from an exact copy of files from HL7's v2 guide repository, kept byte for byte in the
source repository under `vendor/hl7-v2ig/`. The known-segment list (`KNOWN_SEGMENTS`) is checked
against one more file from the same repository, kept under `vendor/segment-names/`.

| Fact                       | Value                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                 | [HL7/v2ig](https://github.com/HL7/v2ig)                                                                                                                                             |
| Message structures         | `input/sourceOfTruth/` at commit `51dfdd968cf2a14038505c5b2f3d97edd21f1b02` (2026-08-24), taken 2026-08-27; the ORL, OUL, RAS and RDE files read from the same commit on 2026-11-11 |
| Segment list               | `input/sourceOfTruth/control-manifests/segments.json` at commit `9c307dadb0bb3f99de399d30cd80c24b47bb08da` (2026-11-09), taken 2026-11-10                                           |
| Licence declared           | The guide's definition file, `input/v2plus.xml`, declares `CC0-1.0` in its `license` element at both commits.                                                                       |
| Licence file               | The repository has no licence file at either commit, and GitHub reports no licence for it.                                                                                          |
| Status                     | The repository's README describes the guide as in development and not yet production ready, and the definition file gives its status as draft.                                      |
| What the structures follow | They describe the HL7 v2+ draft, which a design record in that repository says is meant to represent HL7 v2.9.1. They are not a restatement of any earlier v2 release.              |

`vendor/hl7-v2ig/snapshot.json` in the source repository lists every copied file with its byte
count, sha256 and upstream URL.

## HL7 Terminology 7.5.0 (`HL7/UTG`)

The eight HL7 v2 code tables of the `@cosyte/hl7/tables` entry point (0003, 0008, 0076, 0103,
0104, 0155, 0211 and 0357) are generated from HL7 Terminology 7.5.0, kept byte for byte in the
source repository under `vendor/hl7-terminology/`.

| Fact          | Value                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publication   | HL7 Terminology (`hl7.terminology`) 7.5.0, [terminology.hl7.org/7.5.0](https://terminology.hl7.org/7.5.0/)                                                                       |
| Repository    | [HL7/UTG](https://github.com/HL7/UTG) at commit `828b7136548bc82559a4fff34bc4a47f62197ed5` (2026-10-26), taken 2026-11-12                                                        |
| Licence       | Each code system's copyright statement says it "is made available under the CC0 designation".                                                                                    |
| What we alter | Each table keeps only its codes, display text, status and deprecation version; the per-version lists are rebuilt from those; a long dash in display text is written as a hyphen. |

The tables are derived from HL7 Terminology and altered as above. They are not HL7 Terminology
itself, and HL7 does not endorse this package. `vendor/hl7-terminology/snapshot.json` in the source
repository lists every copied file with its byte count, sha256 and upstream URL.

## hl7apy (`crs4/hl7apy`)

The known-segment list is also checked against the segment names of each HL7 v2 version from v2.1
to v2.8.2, extracted from hl7apy's per-version segment tables at commit
`c57adca03c77e549031867b36a6d5703611af8cd` (2026-10-26), read 2026-11-10 and kept under
`vendor/segment-names/`. hl7apy's code is published under the MIT licence.
