# FHIR-bridge fixtures: provenance

Firsthand-vendored artifacts backing the Phase V (FHIR-bridge readiness) coverage proof
(`test/fhir-bridge-coverage.test.ts`) and the IR-stability contract
(`docs-content/spec-notes-fhir-bridge.md`).

## Source

- **Project:** HL7 **v2-to-FHIR** Implementation Guide: <https://github.com/HL7/v2-to-fhir>
- **Published IG:** v1.0.0, targets **FHIR R4**: <https://hl7.org/fhir/uv/v2mappings/>
- **Commit vendored:** `873b331b3890c8bc5d62ef9b4dabb41801aac70d` (fetched 2026-07-21)
- **License:** IG **code Apache-2.0**, IG **narrative CC0** (`LICENSE` at repo root). The vendored
  CSVs are the mapping _content_ (Apache-2.0); the sample message is IG narrative content (CC0).

## Artifacts

| Local path                                  | Upstream path (@ commit)                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sample-mdm-t02.hl7`                        | `samples/messages/Message.hl7_MDM_T02.txt` (**PHI-safe synthetic transcription**, see below) |
| `ig-segment-maps/MSH-MessageHeader.csv`     | `mappings/segments/HL7 Segment - FHIR R4_ MSH[MessageHeader] - R4.csv`                        |
| `ig-segment-maps/EVN-Provenance.csv`        | `mappings/segments/HL7 Segment - FHIR R4_ EVN[Provenance] - Sheet1.csv`                       |
| `ig-segment-maps/PID-Patient.csv`           | `mappings/segments/HL7 Segment - FHIR R4_ PID[Patient] - PID.csv`                             |
| `ig-segment-maps/PV1-Encounter.csv`         | `mappings/segments/HL7 Segment - FHIR R4_ PV1[Encounter] - PV1.csv`                           |
| `ig-segment-maps/ORC-ServiceRequest.csv`    | `mappings/segments/HL7 Segment - FHIR R4_ ORC[ServiceRequest] - ORC.csv`                      |
| `ig-segment-maps/TQ1-ServiceRequest.csv`    | `mappings/segments/HL7 Segment - FHIR R4_ TQ1[ServiceRequest] - TQ1.csv`                      |
| `ig-segment-maps/OBR-DiagnosticReport.csv`  | `mappings/segments/HL7 Segment - FHIR R4_ OBR[DiagnosticReport] - OBR.csv`                    |
| `ig-segment-maps/TXA-DocumentReference.csv` | `mappings/segments/HL7 Segment - FHIR R4_ TXA[DocumentReference] - Sheet1.csv`                |
| `ig-segment-maps/OBX-Observation.csv`       | `mappings/segments/HL7 Segment - FHIR R4_ OBX[Observation] - OBX.csv`                         |

CSV **content is verbatim** upstream (the machine-readable source-path references live in the
`Identifier` column). Only the filenames are normalized (`SEG-Resource.csv`) for a space-free repo
path; the exact upstream filename is the table above.

## Scope note (firsthand finding, recorded honestly)

The IG repo ships **exactly one** HL7 v2 sample message (`MDM^T02`), not the multi-family
`samples/` corpus the roadmap optimistically assumed. The coverage proof therefore runs over that one
message. The 78 segment-map CSVs are the IG's referenced-source-path ground truth; we vendor the
**one canonical target-resource map per segment** the sample exercises (nine segments). Other
target-resource maps exist per segment (e.g. `OBX[DocumentReference]`, `PID[Account]`,
`MSH[Bundle]`); adding them would widen the _referenced-path_ denominator but not change the finding:
hl7 addresses every v2 field generically.

## PHI: the sample is a synthetic transcription

The upstream IG sample is published CC0 test data and already synthetic, but it carries
realistic-_shaped_ tokens (a DOB, a street address, a phone, a bare-numeric patient id) that trip
`scripts/phi-scan.ts`: the repo's shape-aware gate cannot tell synthetic-but-realistic from real, and
this repo's hard rule is **synthetic-only fixtures, never commit realistic PHI**. So `sample-mdm-t02.hl7`
is a **PHI-safe synthetic transcription** of the IG's `MDM^T02` message under HIPAA Safe Harbor:

- **Preserved verbatim** (the load-bearing content the coverage proof exercises): the exact
  **field-population pattern** (which fields are populated vs. empty, per segment), every **code
  system** (`LN`, `L`, dual-coded CWE), every **datetime** and its precision/timezone
  (`20130408141909.0+0000`, …), and the FT narrative's **formatting escapes** (`\.br\`).
- **Substituted** (Safe Harbor: replaced with allow-listed synthetic tokens from
  `scripts/phi-allow-list.txt`): person names → `DOE`/`JOHN`/`SMITH`/`WELBY`/… ; DOB `19941201` →
  `19800115`; street `3003 TESTING RD` → `123 Main St`; phone → the `555` fake-exchange convention;
  the bare-numeric patient id → an `MRN…`/`ACCT…`-prefixed synthetic; narrative provider names →
  synthetic. Facility labels (`REDDING HOSPITAL`, `Good Health Hospital`) and non-patient
  order/filler/NPI numbers are left as the IG had them (not patient PHI).

This keeps the fixture genuinely synthetic (passes `phi-scan` with **no allow-fixture bypass**) while
the coverage proof still runs over the IG sample's exact structure. Reviewed under
`phi-redaction-review` before landing.
