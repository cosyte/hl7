---
"@cosyte/hl7": patch
---

Phase E (P0 safety) — `msg.immunizations()` VXU^V04 immunization extraction.

- **`msg.immunizations()`** projects every RXA segment of a VXU^V04 into a typed `Immunization`,
  grouping the RXR (route — Table 0162 route + Table 0163 site) and OBX (e.g. VFC eligibility /
  funding source) segments that follow it positionally under the RXA, and carrying `orderControl`
  from the preceding ORC of the `ORC`→`RXA`→`[RXR]`→`[{OBX}]` order group — the same close-prev/
  open-new state machine `orders()` uses for OBR → OBX. RXR/OBX before any RXA are dropped rather
  than attached to a phantom immunization.
- **Registry-safe by design (Phase E §3-4).** A wrong vaccine, dose, or mis-keyed action code can
  harm a patient or corrupt an IIS (Immunization Information System) registry, so the view is
  conservative: `actionCode` (RXA-21, `A`/`D`/`U`) is surfaced **verbatim and never defaulted** — a
  mis-key corrupts a registry's add/delete/update dedup. `recordOrigin` (administered vs historical)
  is derived **only** from the well-known NIP001 RXA-9.1 codes (`00` administered; `01`-`08`
  historical) and **omitted otherwise — never guessed**; the raw RXA-9 claim is always preserved on
  `informationSource`. `doseAmount` is strict-`asNm()` parsed (never `NaN`); the IIS unknown-dose
  sentinel `999` is surfaced **as the number `999`**, never specially coerced.
- The vaccine code carries its own coding-system provenance (`vaccineCode.nameOfCodingSystem` — CVX
  Table 0292); a dual-coded RXA-5 surfaces its CVX/NDC alternate on `vaccineCode.alternateIdentifier`/
  `…`. The manufacturer (MVX, Table 0227) and route (Table 0162 / NCIT / …) likewise report the
  claim — the helper never validates or looks a code up. `doseUnitsAreUcum` flags whether RXA-7's
  coding system is exactly `UCUM`. `routes` and `observations` are ALWAYS present arrays. Output is
  frozen at the boundary; not memoized. Never throws (HELPERS-07).

Additive patch on the `0.0.x` ladder: no public surface removed or renamed. New public types
`Immunization`, `ImmunizationRecordOrigin`. Integration tests (`test/helpers-immunizations.test.ts`)
and property tests (`test/property/immunizations.property.test.ts`) lock the never-throws,
project-verbatim action-code, NIP001-only `recordOrigin`, and dose-`999`-as-is invariants over
thousands of synthetic RXA segments; three canonical synthetic fixtures (`vxu-v04`,
`vxu-v04-historical`, `vxu-v04-refusal`) cover the administered, historical, dual-coded, and refusal
paths. Deferred (not v1): IIS state-profile constraints, CVX/MVX validity checks, and the 2nd+
repetition of the repeating RXA-15/16/17 lot/expiry/manufacturer fields (first repetition only).
