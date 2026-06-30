# Spec notes — coding-system provenance (Phase F)

`@cosyte/hl7` surfaces the coding-system a code **claims** (CWE.3 / CE.3, "Name
of Coding System"), drawn from **HL7 Table 0396 (Coding System)**. This is
**provenance only** — read-only, no validation, no lookup, no network, no
bundled codeset. `codingSystem(id)` / `codingSystemOf(coded)` answer "which
system?"; they never assert a code is valid or current.

## What ships (the frozen `KNOWN_CODING_SYSTEMS` subset)

A deliberately small, safety-relevant subset of Table 0396 — not the full
registry. Each row: the registered acronym carried in CWE.3, the canonical
name, and tolerated aliases (matched case-insensitively).

| Acronym (`id`) | Name | Aliases | Source |
|---|---|---|---|
| `LN`   | LOINC | `LOINC` | HL7 Table 0396; Regenstrief LOINC |
| `SCT`  | SNOMED CT | `SNM`, `SNOMED`, `SNOMEDCT` | HL7 Table 0396; SNOMED International |
| `I10`  | ICD-10 | `ICD-10`, `ICD10` | HL7 Table 0396; WHO ICD-10 |
| `I10P` | ICD-10-PCS | `ICD-10-PCS`, `ICD10PCS` | HL7 Table 0396; CMS ICD-10-PCS |
| `RXN`  | RxNorm | `RXNORM` | HL7 Table 0396; NLM RxNorm |
| `NDC`  | National Drug Codes | — | HL7 Table 0396; FDA NDC |
| `CVX`  | CDC Vaccine Codes | — | HL7 Table 0396; CDC/NCIRD (codes = Table 0292) |
| `MVX`  | CDC Vaccine Manufacturer Codes | — | HL7 Table 0396; CDC (codes = Table 0227) |
| `UCUM` | Unified Code for Units of Measure | — | HL7 Table 0396; Regenstrief/UCUM.org |

## The `I10` nuance (a deliberate fail-safe choice)

Table 0396 registers `I10` as **ICD-10** — the WHO base classification. US v2
feeds very frequently send `I10` in DG1-3 when they actually mean
ICD-10-**CM** (the US clinical modification). That CM specificity is a sender
convention, **not** what the acronym registers.

Because provenance is the *sender's claim* and our hard rule is "never guess,"
this library reports the **registered** claim (`"ICD-10"`) for `I10` and does
**not** silently upgrade it to ICD-10-CM. We also do not ship an unverified
`I10C` entry. A consumer that knows its feed uses `I10` for ICD-10-CM applies
that knowledge itself; the parser will not assert specificity the wire did not
carry.

## Fail-safe behavior

- **Unknown / local / mistyped id** → surfaced **verbatim** in `claimed` with
  `known: false`. Never dropped, never guessed (e.g. `"L"`, `"99zL"`).
- **No claim** (absent / empty / whitespace-only CWE.3) → `undefined`.
- **Alias normalization** maps a tolerated spelling to the registered acronym
  (`"LOINC"` → `LN`, `"SNOMED"` → `SCT`, `"RxNorm"` → `RXN`) while preserving
  the original spelling in `claimed`.

## Known limitations after Phase F

- Provenance is the sender's claim, **not verified** — a registered system with
  a wrong/deleted code still reports `known: true`.
- The map is a *provenance* map, not a *versioned codeset*: code-system versions
  move (LOINC twice-yearly, RxNorm monthly, ICD-10-CM annually) and this slice
  intentionally pins no version.
- Subset, not the full Table 0396. An unlisted-but-registered system reports
  `known: false`; widening the subset is additive future work.

## References

- **HL7 Table 0396 (Coding System)** —
  <https://terminology.hl7.org/CodeSystem-v2-0396.html>; HL7 Vocab registry —
  <https://www.hl7.org/special/committees/vocab/table_0396/index.cfm>
