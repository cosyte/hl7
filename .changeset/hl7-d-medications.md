---
"@cosyte/hl7": patch
---

Phase D (P0 safety) — `msg.medications()` pharmacy/treatment extraction.

- **`msg.medications()`** projects every RXO / RXE / RXD / RXA segment into a typed `Medication`
  across the four pharmacy contexts (`order` / `encoded` / `dispense` / `administration`). The RXR
  (route — Table 0162 route + Table 0163 site) and RXC (component) segments that follow each parent
  are grouped positionally under it, the same close-prev/open-new state machine `orders()` uses for
  OBR → OBX; RXR/RXC before any RX* parent are dropped rather than attached to a phantom medication.
- **Amount and strength are never reconciled (Phase D §4).** The give *amount* (how much is given —
  RXO-2/3, RXE-3/4, RXD-4, RXA-6) and the give *strength* (concentration — RXE-25/26) are surfaced
  as SEPARATE fields. A strength a coded drug (e.g. an NDC product code) implies is never used to
  validate or overwrite the explicit RXE-25 strength — a disagreement is preserved verbatim for the
  caller to resolve. The give code carries its own coding-system provenance
  (`giveCode.nameOfCodingSystem`); the helper reports the claim, never validates it.
- Single-amount contexts (dispense RXD-4, administration RXA-6) set `amount.minimum` only and omit
  `maximum`; range contexts (order, encoded) carry both. Numerics are strict-`asNm()` parsed —
  absent/blank or non-numeric → key omitted, never `NaN`. Output (the array, each `Medication`, and
  its `routes`/`components` child arrays) is frozen at the boundary; not memoized. Never throws
  (HELPERS-07).

Additive patch on the `0.0.x` ladder: no public surface removed or renamed. New public types
`Medication`, `MedicationContext`, `MedicationAmount`, `MedicationStrength`, `MedicationRoute`,
`MedicationComponent`. Integration tests (`test/helpers-medications.test.ts`) and property tests
(`test/property/medications.property.test.ts`) lock the never-throws, project-verbatim, and
amount-vs-strength-independence invariants over thousands of synthetic RX* segments; three canonical
synthetic fixtures (`rde-o11-pharmacy`, `rds-o13-dispense`, `ndc-redundant-strength`) round-trip
cleanly (SER-02).
