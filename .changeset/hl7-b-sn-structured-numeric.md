---
"@cosyte/hl7": patch
---

Conformance Phase B — stop silently dropping the comparator/range on SN (Structured Numeric)
results, and surface a UCUM claim-check flag on observation units.

- **SN results are parsed as typed data, not flattened to the bare comparator.** An `OBX-2 = SN`
  value (e.g. `<^10`, `>^90`, `^100^-^200`, `^1^:^128`) previously fell through the plain-string
  branch, where `<^10` collapsed to the string `"<"` — a misread clinical result with a documented
  patient-harm path. `msg.observations()` now returns `{ valueType: "SN", value: SN | undefined }`
  with `comparator` / `num1` / `separatorOrSuffix` / `num2`. New public surface: the `SN` type,
  `parseSn`, `HL7.SN`, and `Field.asSn()`. Fail-safe by construction — `num1`/`num2` use strict
  `Number()` parsing (`undefined`, never `NaN`), and the comparator is surfaced only when SN.1 is a
  recognized operator (`>` `<` `>=` `<=` `=` `<>`), so a non-operator in the comparator slot is never
  passed off as a real relation. The comparator survives a serialize → parse round-trip byte-for-byte.
- **`observation.unitsAreUcum`** — a boolean claim-check flag, `true` iff OBX-6's coding system
  (CWE.3) is exactly `UCUM` (HL7 Table 0396). `false` when a unit is present but not declared UCUM
  (surfaced as-is, never coerced); omitted entirely when OBX-6 is absent. Claim check only — the
  library does not validate UCUM grammar or convert units.

Additive patch on the `0.0.x` ladder: no public surface is removed or renamed; existing observation
value types are unaffected. New canonical fixture (`test/fixtures/canonical/oru-r01-sn-results.hl7`)
and property tests (`test/property/sn.property.test.ts`) lock the never-drop-the-comparator invariant.
