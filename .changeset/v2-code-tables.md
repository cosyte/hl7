---
"@cosyte/hl7": patch
---

Eight structural HL7 v2 code tables now ship on a new `@cosyte/hl7/tables` entry point, generated from HL7 Terminology 7.5.0 (CC0): 0003, 0008, 0076, 0103, 0104, 0155, 0211 and 0357. `V2_TABLES` gives each table's codes, display text, status and deprecation version, ready to bind into a profile's `valueSet`; `lookupV2Code(table, code, version)` answers `listed`, `deprecated` or `not-listed`, and `unknown` with a reason wherever the source does not settle it, so a code is never rejected for a version the table does not cover; `v2TableCodes` gives one version's list; `V2_TABLE_SOURCE` cites the source, its licence, the commit and every file's sha256. The tables are derived from HL7 Terminology and altered, and HL7 does not endorse this package. The main entry point does not import them.

`ERR_CONDITION_CODES` now matches table 0357: it adds `198` (Non-Conformant Cardinality) and `199` (Other HL7 Error), and `207` reads "Application error", the source's text, so `buildAck`'s default ERR-3.2 changes from "Application internal error" to "Application error". A caller that compares that text must update it. `105`, which the source does not list, is kept.
