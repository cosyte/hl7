# v2 XML encoding fixtures

Synthetic HL7 v2 messages, each in the pipe-delimited encoding (`.hl7`, `\r`-separated) and in
the v2 XML encoding (`.xml`). Every name, identifier, address and code is made up and comes from
`@cosyte/synth`:

- The two ORU messages: `generateOru` with seeds 500 and 501, then edited by hand to add a second
  identifier, an explicit null, notes and the message structure in MSH-9.3, and to use the names,
  dates of birth and addresses `scripts/phi-allow-list.txt` declares. The v2.5 one's `.xml` is
  `toHl7Xml`'s output for the `.hl7`, in the groups of the published v2.5 ORU_R01 schema.
- The v2.7 ADT: `generateAdt({ seed: 502, trigger: "A01" })` from `@cosyte/synth` 0.1.9, with
  only the edits its tests need: MSH-12 set to `2.7`, MSH-2 set to the five characters `^~\&#`
  that declare the truncation character, and PV1-3.1 set to `SYNTHWARD\P\2`, a value holding it.
  The names, date of birth, address and identifiers synth drew are declared in
  `scripts/phi-allow-list.txt`. Its `.xml` is `toHl7Xml`'s output for the `.hl7`, with the data
  types the `.xml` names.

These are our own test vectors, not the examples published with the HL7 v2 XML encoding
specification. `test/xml-encoding-published-rules.test.ts` follows the shape of those examples
with synthetic values.

| File                  | Version | What it covers                                                                                                                                                                                  |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oru-r01-v25`         | 2.5     | The writer's own layout: one segment per line, in the v2.5 ORU_R01 groups. `toHl7Xml` writes the `.xml` byte for byte from the `.hl7` with the data types `xmlDataTypes` reads from the `.xml`. |
| `oru-r01-v26-grouped` | 2.6     | Indented, with group elements, a comment, a repeated field, an explicit null, a CDATA section, entity and character references and a line break.                                                |
| `adt-a01-v27`         | 2.7     | A five-character MSH-2 that declares the truncation character, and a value holding it.                                                                                                          |
