---
"@cosyte/hl7": patch
---

Scheduling / document / charge breadth helpers (roadmap Phase Q) — `appointments()`
(SIU: SCH id/status/SCH-11 timing + AIS/AIG/AIL/AIP resources), `documents()`
(MDM: TXA with completion status TXA-17 and availability status TXA-19 surfaced
as DISTINCT fields, never conflated, plus the OBX narrative body), and
`charges()` (DFT: FT1 transaction type/code + extended/unit amount as verbatim
wire text — no money-as-float — and the repeating FT1-19 diagnosis linkage). New
public types `Appointment`, `AppointmentResource`, `ClinicalDocument`, `Charge`.
Breadth helpers only; never throws (HELPERS-07).
