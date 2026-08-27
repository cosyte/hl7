---
"@cosyte/hl7": patch
---

Message-structure awareness is now DERIVED from HL7's published, machine-readable message structures instead of hand-transcribed, it recognizes 94 (message code, trigger event) pairs instead of 32, and every warning names the missing SEGMENT and traces to the publication it came from.

The registry used to be a hand transcription of the v2.5.1 chapters: twelve message codes, eight ADT trigger events, one hand-picked "anchor" segment per group, and no traceable link to any published structure. A consumer could not be told that their `ADT^A01` was missing a segment the standard marks required, and could not audit where an expectation came from.

**The publication is vendored, not cited.** A byte-for-byte snapshot of HL7's published message-structure definitions and its two control manifests ships under `vendor/hl7-v2ig/`, and a committed offline generator derives the registry from it. There is no network call at build time or at run time, and re-running the generator in a checkout with no network access reproduces the committed artifact byte for byte.

**The provenance ships with the code.** The new `STRUCTURE_REGISTRY_PROVENANCE` export names the publication and the exact commit it was read at, the byte count, sha256 and upstream URL of all 83 vendored files, the variant family behind each referenced structure, and the structure id behind each recognized pair. `findMessageStructureDefinition(messageCode, triggerEvent)` reaches the entry behind a warning, and every entry carries `requiredSegments`, `structureId`, `structureIds` and a `derivation` of `published` or `retained-transcription`.

**Three derivation rules, all conservative in the same direction.** A segment is expected only when its minimum is at least one along the whole path from the structure root, so a segment the publication marks required inside a group it marks optional is not expected: a conformant `ORU^R01` with no `OBX` and no top-level `PID` stays warning-free. Where the publication splits a structure into single-uppercase-letter variants, a segment is expected only when every member of the family requires it. A pair with no entry is still silent.

**What consumers will notice: warning volume rises on non-conformant traffic.** More trigger events are recognized, so messages that used to be `recognized: false` are now checked. More segments are expected per pair, most visibly `EVN` across the whole ADT family and in `MDM` and `DFT^P03` too (the previous table excluded it deliberately, for every message code, which is exactly what stopped the library reporting a genuinely missing required segment), plus `PV1` in `MDM`. And an `ORU^R01` carrying `OBX` but no `OBR` now warns, where the old anchor accepted either. If your channel treats a `MISSING_EXPECTED_GROUP` warning as a rejection, sample your traffic before upgrading.

**`missingGroups` now holds segment names.** It used to hold hand-picked group labels such as `"result"` and `"patient"`; it now holds `"OBR"`, `"EVN"` and the like. The field, its type and its meaning ("what is absent") are unchanged, and the new `missingSegments` and `requiredSegments` on `msg.structure` say the same thing under clearer names. `structureIds` records which published structures the verdict came from.

**Nothing was removed.** Every value the entry point exported still exports, no exported type lost a field, and the warning code set is unchanged at twenty: a structural finding is still `MISSING_EXPECTED_GROUP`, still Tier-2 and additive, still never a throw, and still carries no field value. The retired `missingExpectedGroup` factory is retained and still works; the parser now calls the new `missingRequiredSegment`, which names the segment and the published structure.

**One entry is not derived, and says so.** The publication carries no `ORM_O01` at all: it is absent from the 305-entry structure manifest and its raw path answers 404. `ORM^O01` is the commonest legacy order message and was recognized before, so it is retained with its previous expectation (`ORC`), marked `retained-transcription`, and carries the reason it could not be derived. Eight `ADT` merge messages that the publication's own message list names no structure for are recorded as unresolved by the generator and left silent, rather than guessed.

`docs-content/spec-notes-structure.md` carries the full table, the derivation rules, and every difference from the previous transcription adjudicated segment by segment.
