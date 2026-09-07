---
"@cosyte/hl7": minor
---

Schema emission for the serialized message projection: the library now authors the JSON Schema and Zod description of the object `toJSON()` returns, so a consumer validating a snapshot no longer transcribes a shape they do not own.

`messageJsonSchema()` returns a JSON Schema document at the `2020-12` dialect describing `SerializedMessage`: encoding characters, segments, fields, repetitions, components, subcomponents, warnings and the optional profile. `messageZodSource()` returns Zod schemas as TypeScript SOURCE TEXT to write into your own project. `emitMessageSchema(target)` is the named-target route over both, with `SCHEMA_EMIT_TARGETS`, `SchemaEmitTarget`, `isSchemaEmitTarget`, `SchemaTargetError`, `JSON_SCHEMA_DIALECT`, `JsonSchemaDocument` and `JsonSchemaNode` alongside it. Both artifacts are also committed under `schema/` and re-checked on every test run.

**Still zero runtime dependencies, and still none in development either.** The Zod artifact is TEXT: nothing in `src/` imports `zod` or references a `zod` value, and no JSON Schema validator was added to run any of this. The emitted `import { z } from "zod"` resolves against the consumer's own install, and which `zod` major that is stays theirs.

**Nothing here validates anything.** Both functions build a description and return it. No message is read, no schema is evaluated against a value, and no finding, diagnostic or warning is produced. Conformance checking is a separate surface and this is not an input to it.

**The description is measured, not transcribed, which is a difference you can observe.** `EncodingCharacters` declares an optional `truncation` member and the serializer copies exactly five keys, never that one, so a v2.7 message whose MSH-2 carries a truncation character has it on `msg.encodingCharacters` and not on `msg.toJSON().encodingCharacters`. The emitted schema declares the five the snapshot really contains and permits no sixth. The warning `code` enumeration is read from the warning registry in both directions, the fixture corpus is walked against the document at every nesting level on every test run, and the two artifacts are compared member for member with the Zod side recovered from its own emitted text.

**No message content reaches the output, by construction and by test.** Emission is a function of the library rather than of anything it has parsed: the same version emits byte-identical output whatever has been parsed, in whatever order. The document carries no `default`, no `examples` and no sample value, and the only literals in either artifact are the dialect URI, member and type names, and the registry's warning codes.

**Additive only.** No existing export was removed, renamed or re-typed, no parse result changed, and no serialized byte moved.
