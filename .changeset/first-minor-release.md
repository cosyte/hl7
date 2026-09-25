---
"@cosyte/hl7": minor
---

**This is 0.1.0, the first release of `@cosyte/hl7` whose public API we treat as settled.**

What is covered, and what you can build against:

- Parsing HL7 v2 in one line with `parseHL7`: lenient by default, so the deviations real feeds carry
  come back as stable warning codes rather than exceptions, with MLLP framing stripped, and a strict
  mode for when you want a refusal instead. Batch files and multi-gigabyte streams (`parseStream`)
  parse too.
- Reading without the spec: named helpers (`msg.patient`, `msg.visit`, `msg.observations()`,
  `msg.allergies()`, `msg.medications()`, `msg.immunizations()` and more), dot-paths, and structural
  traversal, with every datetime kept at the precision and zone it arrived with.
- Writing: `setField` and the segment methods mutate explicitly, the typed builders assemble ADT, ORM,
  ORU, SIU, MDM, DFT and VXU messages, and the serializer always emits spec-clean HL7.
- Checking: conformance profiles you define and validate against, the opt-in
  `validateMessageStructure` against HL7's published message structures, typed overlays that narrow
  a message to its type, and JSON Schema and Zod emission for `toJSON()` output.

What the version promises. The exported functions, the message and helper surfaces, and the warning
and finding codes are the surface we keep stable: renaming a warning code is a breaking change. While
the package is below 1.0, a breaking change bumps the minor version (0.1 to 0.2) and is called out in
this changelog; a fix that changes no public value ships as a patch. Upgrading from 0.0.10 is itself
breaking in a few places, each named in the entries below: `buildAdt` now refuses a merge trigger
with no prior identity, and several types and profile rules narrow.

What is not covered. There is no network transport: MLLP framing is stripped on read, and sending
or receiving over a socket belongs to `@cosyte/mllp`. The parser does not convert HL7 v2 to FHIR
(that is `@cosyte/transform`), it reads v2 only (not v3 or CDA), and it validates structure rather
than every coded value against every HL7 table.
