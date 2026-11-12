# Vendored snapshot: the standard HL7 v2 segment names, by version

This directory holds the two published lists `KNOWN_SEGMENTS` in
`src/parser/known-segments.ts` is derived from, so that registry can be checked
rather than trusted. `test/known-segments-source.test.ts` recomputes, from these
files, every segment name and the version that introduced it, and requires the
shipped table to match.

## Provenance

| File | What it is | Upstream |
| --- | --- | --- |
| `hl7apy-segment-names.json` | The segment names of each HL7 v2 version from v2.1 to v2.8.2, extracted from hl7apy's per-version segment tables, with the byte count, sha256 and URL of each upstream file | [crs4/hl7apy](https://github.com/crs4/hl7apy), MIT, commit `c57adca03c77e549031867b36a6d5703611af8cd` (2026-10-26), `hl7apy/v<version>/segments.py` |
| `v2ig-segments.json` | HL7's own list of the v2+ segment definitions, byte for byte (24765 bytes, sha256 `013ca7a1ebb44fbd52b7f9ca5af2193c4d436f6b9248a955d37463cd32187f37`) | [HL7/v2ig](https://github.com/HL7/v2ig), commit `9c307dadb0bb3f99de399d30cd80c24b47bb08da` (2026-11-09), `input/sourceOfTruth/control-manifests/segments.json` |

Both were read on 2026-11-10.

## Terms, as the sources state them

We record these facts and draw no conclusion from them.

- hl7apy's code is published under the MIT licence.
- For `HL7/v2ig`, read at commit `9c307dadb0bb3f99de399d30cd80c24b47bb08da`: the
  guide's definition file, `input/v2plus.xml`, declares `CC0-1.0` in its
  `license` element; the repository has no licence file, and GitHub reports no
  licence for it; its README says the guide is in development and not yet
  production ready, and the definition file gives its status as draft; and a
  design record in the repository,
  `docs/adr/0006-multi-corpus-v291-extraction.md`, says the guide is meant to
  represent HL7 v2.9.1, so the list describes the HL7 v2+ draft.

`THIRD-PARTY-NOTICES.md` at the root of this repository, which ships in the npm
package, records the same facts.

## How the table is derived

1. For hl7apy, each version's names are the keys of the `SEGMENTS` dict in
   `hl7apy/v<version>/segments.py`, less the `ANYHL7SEGMENT` wildcard. hl7apy
   carries v2.1, 2.2, 2.3, 2.3.1, 2.4, 2.5, 2.5.1, 2.6, 2.7, 2.8, 2.8.1 and
   2.8.2, and no v2.7.1. A name's version is the first of these that lists it.
2. For HL7 v2+, the names are the ids of the list's `StructureDefinition`
   references, less `Hxx`, a placeholder for any segment. A name it lists that no
   hl7apy version carries is marked v2.9. The publication continues v2.9, and
   its own README says it "is in development and is not yet production ready";
   we could not read the v2.9 text itself, so a segment marked v2.9 may have been
   added by a later v2+ ballot.
3. The registry also keeps `FAM`, which it held before this derivation and
   which neither list carries, so that no message warns that did not warn
   before.

## Refreshing

Re-fetch each upstream file at a newer commit, replace `v2ig-segments.json`
verbatim, rebuild `hl7apy-segment-names.json` by the rule above (its `sha256`
values are of the upstream files, not of the extracted lists), and update
`src/parser/known-segments.ts` until the source test passes.
