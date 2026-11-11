---
"@cosyte/hl7": patch
---

Messages of type ORL, OUL, RAS and RDE now get structure findings: the parser warns with `MISSING_EXPECTED_GROUP` when one lacks a segment HL7's published structure requires, and `validateMessageStructure` validates them instead of answering `validated: false`.

Their published structures are vendored byte for byte from the same HL7 v2+ publication commit as the rest of the snapshot, and the registry is re-derived from them: ORL^O22, O34, O36, O40 and O53 to O56 expect `MSA`; OUL^R22 expects `SPM` and `OBR`, OUL^R23 adds `SAC`, OUL^R24 expects `OBR`; RAS^O17 expects `ORC`, `RXA` and `RXR`; RDE^O11, O25 and O49 expect `ORC`, `RXE`, `TQ1` and `RXR`. `OUL^R21` stays unrecognized because the publication names no structure for it.

Before upgrading, sample your traffic if your channel rejects on a structure warning: a feed of these types that omits a required segment was silent until now and will start warning. Nothing else changes for a caller: `Hl7Message.is` and `OverlayStructures` gain the fifteen new pairs, and no existing pair's expectation moved.
