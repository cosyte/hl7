---
"@cosyte/hl7": patch
---

Version-sensitivity hardening (roadmap Phase H) — make the coded-element
composites robust to append-only component growth across HL7 v2.1–v2.8, with no
silent truncation. `CWE` and `CE` now preserve any components beyond their
modeled set on a new optional `extraComponents` array (CWE component 10+ — the
v2.7 second-alternate triplet + coding-system/value-set OIDs; CE component 7+),
verbatim and in order, with absent interior components held as `""` so each
entry maps back to its HL7 component number. This also unifies CE↔CWE reading:
because both accessors preserve the other's extra components, reading a
CWE-shaped value through `asCe()` is no longer lossy (CE was deprecated at v2.5,
withdrawn at v2.6). Parsing a coded element with an arbitrary number of trailing
components never throws (forward-compatibility). Added a `version-growth`
property test (no-loss / no-throw / CE↔CWE uniformity) and the supported-version
matrix in `docs-content/spec-notes-version-matrix.md` (incl. TS→DTM and the
MSH-21 Conformance Statement ID → Message Profile Identifier rename). Additive
only — `extraComponents` is a new optional field; no rename, no removal, no new
warning code.
