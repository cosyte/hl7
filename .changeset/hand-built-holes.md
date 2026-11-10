---
"@cosyte/hl7": patch
---

A message built by hand with a hole or a `null` in a field's repetitions, components or subcomponents now serializes and reads as if that position were empty, instead of throwing a `TypeError`. This covers `toString`, `toJSON`, `prettyPrint`, `get`, every `Field` read and typed coercion, the clinical helpers (`patient`, `observations()` and the rest), `validateAgainstProfile`, `validateMessageStructure`, `buildAck`, and the composite parsers (`parseXpn`, `parseCx` and the rest). A hole or `null` in an array of composites passed to `encodeCompositeReps` or to a builder's repeating member, such as `identifiers`, adds no repetition, the same as an empty entry. `get` now reads a hole in a subcomponents array as `""`, the same as an empty subcomponent, where it returned `undefined` before.
