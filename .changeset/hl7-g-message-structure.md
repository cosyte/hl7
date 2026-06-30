---
"@cosyte/hl7": patch
---

Message-type & structure awareness (roadmap Phase G) — a conservative misroute/
truncation safety net. `msg.structure` reports, for the common message types,
whether the core segment groups the HL7 v2.5.1 abstract syntax marks Required
for that trigger event are present; the parser also emits a single additive
Tier-2 `MISSING_EXPECTED_GROUP` warning per absent group (e.g. an `ORU^R01` with
no `OBR`/`OBX` result group). Keys on the trigger event, not the message family,
and models Required anchors only — so a conformant-but-sparse message never
warns. Warning-only (lenient parse never throws, `strict` may promote); the
message carries only structural facts (type, group, anchor names), never a field
value (no PHI). New public surface: `Hl7Message.structure`, the
`missingExpectedGroup` factory, the `MISSING_EXPECTED_GROUP` code, the read-only
`MESSAGE_STRUCTURE_DEFINITIONS` registry, `analyzeMessageStructure`, and the
types `MessageStructure`, `StructureGroup`, `ExpectedSegmentGroup`,
`MessageStructureDefinition`. Additive only — no rename, no removal.
