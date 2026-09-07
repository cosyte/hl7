---
id: schema-emission
title: "Spec notes: schema emission for the serialized projection"
sidebar_label: Schema emission
description: "The library authors the JSON Schema and Zod description of the object toJSON() returns, so a snapshot validator does not have to be transcribed by hand."
---

# Spec notes: schema emission for the serialized projection

`JSON.stringify(msg)` and `msg.toJSON()` produce a snapshot of a parsed message:
a raw-tree mirror carrying the encoding characters, the segments with their
fields, repetitions, components and subcomponents, the parse warnings, and the
applied profile when there was one. Storing that snapshot, queueing it, or
handing it to another service usually means validating it on the way back in,
and validating it means having a schema for it.

`@cosyte/hl7` writes that schema for you, in two forms:

- a **JSON Schema document** at the `2020-12` dialect, ready to hand to any
  validator you already run;
- **Zod schemas as TypeScript source text**, ready to paste into your own
  codebase where your own `zod` install resolves them.

## Getting the JSON Schema

```ts runnable
import { messageJsonSchema, JSON_SCHEMA_DIALECT } from "@cosyte/hl7";

const schema = messageJsonSchema();

schema.$schema; // => "https://json-schema.org/draft/2020-12/schema"
schema.$schema === JSON_SCHEMA_DIALECT; // => true

// The three members every projection carries, and the one it may omit.
schema.required; // => ["encodingCharacters", "segments", "warnings"]
Object.keys(schema.properties ?? {}).includes("profile"); // => true

// The profile is described down to its two members and nothing else.
Object.keys(schema.$defs["SerializedProfile"]?.properties ?? {}); // => ["name", "lineage"]
```

The document uses only the core, applicator and validation vocabularies of the
dialect, so a validator that implements the dialect implements all of it. There
is no `title`, no `description`, no `default` and no `examples`: nothing on the
document carries an illustrative value, and the one place a literal value is
constrained is the warning `code` member, whose enumeration is the library's own
warning registry.

## Getting the Zod source

```ts runnable
import { messageZodSource } from "@cosyte/hl7";

const source = messageZodSource();

source.includes("export const SerializedMessageSchema"); // => true
source.includes("export type SerializedMessage"); // => true
```

Write that string to a file in your project and import it like any other module.
It declares exactly one import, from `zod`, and `zod` is a dependency of **your**
project: `@cosyte/hl7` ships zero runtime dependencies and never imports it.

## Asking by name

`emitMessageSchema` takes a target name and returns the artifact as text, which
is the form you write to disk. A target it does not support is refused rather
than half-answered:

```ts runnable
import { emitMessageSchema, SCHEMA_EMIT_TARGETS, SchemaTargetError } from "@cosyte/hl7";

SCHEMA_EMIT_TARGETS; // => ["json-schema-2020-12", "zod"]

emitMessageSchema("json-schema-2020-12").startsWith("{"); // => true
emitMessageSchema("zod").includes("import { z }"); // => true

let refused = "";
try {
  emitMessageSchema("json-schema-draft-07");
} catch (error) {
  if (error instanceof SchemaTargetError) {
    refused = `${error.requestedTarget} -> ${error.supportedTargets.join(", ")}`;
  }
}
refused; // => "json-schema-draft-07 -> json-schema-2020-12, zod"
```

## What the schema describes, and what it does not

It describes the **shape of the snapshot**, and only that. It is a mirror of the
positional tree, so it says a field has repetitions and an `isNull` flag; it does
not say what an `OBX-5` may hold, whether a `PID-3` is well formed, or whether
the message conforms to anything. Conformance is a separate question with a
separate answer on this package, and the emitted schema is not an input to it.

Two consequences worth stating plainly:

- **Emission never validates.** Both functions build a description and hand it
  back. Nothing here reads a message, evaluates a schema against a value, or
  produces a finding.
- **Emission never carries message content.** The output is a function of the
  library, not of anything it has parsed, so the same library version emits the
  same bytes whatever has run before. That is what makes it safe to commit the
  artifact to a repository, which is exactly what this one does.

## The encoding-characters detail

The projection's `encodingCharacters` carries five members: `field`,
`component`, `repetition`, `escape` and `subcomponent`. It does **not** carry
`truncation`, even for a v2.7 message whose MSH-2 declares one and whose parsed
`msg.encodingCharacters.truncation` is set. The snapshot is what the serializer
writes, and the serializer writes five keys, so the emitted schema declares five
and permits no sixth. If you need the truncation character, read it off the
message rather than off the snapshot.
