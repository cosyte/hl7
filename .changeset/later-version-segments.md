---
"@cosyte/hl7": patch
---

Fewer `UNKNOWN_SEGMENT` warnings: `KNOWN_SEGMENTS` now holds every standard segment name of HL7 v2.1 to v2.9, so valid messages carrying segments such as `PRT` (v2.7), `ARV` (v2.6), `OH1` to `OH4` (v2.9), `URD` or `EQP` no longer warn that the segment is not in the standard. The set grows from 91 names to 201, taken from published per-version segment lists that the repository vendors and a test checks the set against. Nothing is removed and the type is unchanged, so no caller has to change anything; a profile's `segmentOverrides` may now also name any of the added segments.
