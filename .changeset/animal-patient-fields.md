---
"@cosyte/hl7": patch
---

`msg.patient` reads an animal patient's species, breed, strain and production class (PID-35 to PID-38) by name, and the typed builders write them.

- `Patient` gains optional `species` (PID-35), `breed` (PID-36) and `productionClass` (PID-38, first repetition), each a `CWE`, and `strain` (PID-37), a string. Each is absent when its field is empty and is read only from its own field; nothing is inferred. PID-8 reads as before, and HL7 v2 PID has no neutered field, so there is none.
- `AdtPatient`, the typed PID input `buildAdt`, `buildOru`, `buildOrm`, `buildVxu`, `buildSiu`, `buildDft` and `buildMdm` share, takes the same four and writes each at its position. `buildOru` now writes its PID through the same mapping as the others, so its output for the fields it already took is unchanged.
- `@cosyte/hl7/arbitraries` exports `species()`, `breed()`, `strain()` and `productionClass()`.
- A new how-to, "Read an animal patient", shows both directions.

What a caller must change: nothing. A deep-equality check on `msg.patient` for a message that fills PID-35 to PID-38 now sees the four new keys.
