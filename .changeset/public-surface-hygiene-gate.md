---
'@cosyte/hl7': patch
---

**Public-surface hygiene gate (`PUBLIC-SURFACE-HYGIENE`).** Adds
`scripts/check-no-internal-refs.sh` (`pnpm check:no-internal-refs`) and a dedicated
`.github/workflows/no-internal-refs.yml` job, and clears the 51 violating lines it finds across 15
`docs-content/` pages, plus one in `README.md` that no rule catches.

Internal tooling, documentation and CI only. No change to the published package surface, parser
behavior, or warning codes.

The founder directive of 2026-07-27 bans internal project bookkeeping from every surface a consumer
reads: item identifiers, phase and wave language, ADR numbers, meta-repo paths, and process
commentary about how the artifact came to exist. The remediation half of that directive was a sweep,
and a sweep regresses the first time someone writes an identifier into a README, so the deliverable
here is the gate and the sweep rides along.

Detection is lifted from `cosyte/.github` `scripts/release-notes.mjs`, which is already asserted
byte-for-byte against the published release bodies, and is keyed on **known project prefixes, never
on the `WORD-N` shape**: `MSH-2`, `PID-3`, `TQ1-7`, `NM1-03`, `PKG-4`, `ICD-10-CM`, `HL7-V2`,
`FHIR-R4`, `DICOM-SR`, `NCPDP-SCRIPT` and the four `CSP` Clinical Study **Phase** field names are the
reference material this package's documentation exists to provide, and a shape rule deletes them.
Each rule therefore carries a negative self-test built from real HL7, X12 and DICOM material as well
as a positive one, so widening it into that shape reds the gate rather than corrupting a segment
reference on the next sweep. The scan harness is the em-dash gate's, in mllp's single-command
`./`-prefixed variant, every silent-green route it closes was checked red against a seeded violation,
and every rule is applied twice: once line by line for line numbers, once over paragraph-joined text
because a multi-token rule cannot see a violation that straddles a hard wrap.
