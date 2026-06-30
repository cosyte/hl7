---
"@cosyte/hl7": patch
---

Phase F (P1) — coding-system provenance (HL7 Table 0396, read-only).

- **`codingSystem(id)`** resolves a CWE.3 / CE.3 "Name of Coding System" value to its provenance —
  the system a code **claims**, never validated. Alias-normalized and case-insensitive
  (`"LOINC"` → `LN`, `"SNOMED"` → `SCT`, `"RxNorm"` → `RXN`); the original spelling is preserved
  verbatim in `claimed`. An unregistered / local / mistyped id is surfaced verbatim with
  `known: false` — never dropped, never guessed. A no-claim input (absent / empty / whitespace-only)
  returns `undefined`.
- **`codingSystemOf(coded)`** / **`alternateCodingSystemOf(coded)`** read the primary (CWE.3 / CE.3)
  and alternate (CWE.6 / CE.6) coding system off any `CWE` / `CE` (e.g. a `diagnoses()` /
  `observations()` / `allergies()` / `medications()` `code`), so dual-coded fields (SNOMED + ICD-10)
  surface **both** systems rather than assuming one.
- **`KNOWN_CODING_SYSTEMS`** is the frozen, read-only subset of Table 0396 this library recognizes:
  `LN` (LOINC), `SCT` (SNOMED CT), `I10` (ICD-10), `I10P` (ICD-10-PCS), `RXN` (RxNorm), `NDC`,
  `CVX`, `MVX`, `UCUM`. No validation, no lookup, no network, no bundled codeset.
- **`I10` reports the registered claim "ICD-10", not a guessed "ICD-10-CM".** Table 0396 registers
  `I10` as the WHO base ICD-10; US feeds often send it for ICD-10-CM, but that specificity is a
  sender convention, not what the acronym registers — so the parser does not silently upgrade it
  (fail-safe; see `docs-content/spec-notes-coding-system.md`).

Additive patch on the `0.0.x` ladder: no public surface removed or renamed. New public values
`KNOWN_CODING_SYSTEMS`, `codingSystem`, `codingSystemOf`, `alternateCodingSystemOf`; new public types
`KnownCodingSystem`, `CodingSystemInfo`, `CodedSystemFields`. Unit tests
(`test/model-coding-system.test.ts`) lock alias normalization, the verbatim-unknown fail-safe, the
`I10` non-upgrade, frozen/immutable results, and the no-alias-collision map invariant.
