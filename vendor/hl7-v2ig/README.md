# Vendored snapshot: HL7's published v2+ message structures

This directory holds a **verbatim, byte-for-byte** snapshot of HL7's own
machine-readable message-structure definitions. It is the input the structure
registry shipped in `src/parser/generated/message-structures.ts` is derived
from, and it is the reason that registry can be audited rather than trusted.

Nothing here is edited, reformatted or pruned. The only file in this directory
this repo wrote is `snapshot.json` (and this README).

## Provenance

| Fact | Value |
| --- | --- |
| Publication | HL7 v2+ source of truth, `input/sourceOfTruth` |
| Repository | [HL7/v2ig](https://github.com/HL7/v2ig) |
| Commit at fetch | `51dfdd968cf2a14038505c5b2f3d97edd21f1b02` (2026-08-24) |
| Snapshot taken | 2026-08-27 |
| Structure definitions | 81 |
| Control manifests | 2 |

`snapshot.json` carries the same facts machine-readably, plus the byte count,
the sha256 and the upstream URL of **every** file below it. The shipped registry
re-states the identical list through the exported
`STRUCTURE_REGISTRY_PROVENANCE`, so a consumer can check what shipped against
what is on disk without leaving the package.

The publisher's own caveat applies and is not softened here: the `HL7/v2ig`
README says the guide "is in development and is not yet production ready". The
cardinalities below are therefore this publication's, not a restatement of
v2.5.1, and `docs-content/spec-notes-structure.md` records every place the
derived registry disagrees with the transcription it replaced.

## Layout

```
vendor/hl7-v2ig/
  snapshot.json                          provenance: commit, per-file sha256, URLs
  control-manifests/
    message_structures.json              "A List of the v2+ message structures" (305 entries)
    messages.json                        "A List of the v2+ message definitions"
  message-structure/
    <StructureId>.json                   81 FHIR StructureDefinition resources
```

`messages.json` is the only file in the publication that maps a
(message code, trigger event) pair to a structure id: its entry displays are
shaped `ADT^A04^ADT_A01: Register a Patient`. `message_structures.json` is the
list of structure ids the publication carries.

## Two facts about the data, recorded where the data lives

1. **Variant families.** Some structures are split into single-uppercase-letter
   variants (`ADT_A01-A` through `ADT_A01-D`) while `messages.json` references
   the unsuffixed family name (`ADT_A01`). Nothing in the publication explains
   what the letters mean. The generator therefore reads the family of a
   referenced id as that id plus any id formed by appending a hyphen and exactly
   **one** uppercase letter, and treats a segment as required only when every
   member of the family gives it a minimum of one. The one-letter bound is
   load-bearing: `ACK-Scheduling` is a separate structure in this snapshot and is
   **not** a variant of `ACK`.
2. **There is no `ORM_O01`.** It is absent from the 305-entry manifest and its
   raw path answers 404 (probed 2026-08-27). `ORM^O01` is nonetheless the
   commonest legacy order message, so the registry keeps the pair recognized and
   marks it as a retained transcription carrying that reason, rather than
   dropping it silently.

## Refreshing the snapshot

Re-fetch each URL in `snapshot.json`, replace the file, update `snapshot.json`,
then re-run `pnpm generate:structures` and commit the regenerated artifact. The
generator itself never touches the network: it reads only this directory.
