---
"@cosyte/hl7": patch
---

Patient-identity / merge events (roadmap Phase K, P0 safety).
`msg.identityEvents()` recognizes the ADT identity-management triggers —
merges A18/A34/A35/A36/A39/A40/A41/A42, moves A43/A44, link/unlink A24/A37,
person add/update A28/A31 — and surfaces every party labelled by role with
segment provenance: `surviving` only ever from PID/PV1, `prior` only ever from
MRG, direction the spec constant `MRG_TO_PID` (never inferred). Incomplete
MRG→PID pairs surface what is present plus the new event-scoped
`MERGE_MISSING_PRIOR_OR_SURVIVOR` warning (structural facts only, no PHI); an
orphaned MRG is never dropped. The MRG field map is version-scoped — the
withdrawn-as-of-v2.7 MRG-4 / PID-2 legacy IDs are not read on v2.7+ messages.
MRG added to `KNOWN_SEGMENTS` (no more spurious `UNKNOWN_SEGMENT`). New public
surface: `Hl7Message.identityEvents()`, `IdentityEvent` / `IdentityParty` /
`IdentityEventKind` / `IdentityRole`, `mergeMissingPriorOrSurvivor`. Additive
only — no rename, no removal.
