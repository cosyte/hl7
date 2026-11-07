---
id: intro
title: Getting started
sidebar_label: Getting started
description: "Parse real-world, vendor-quirky HL7 v2 and pull fields out in one line: a lenient parser, an immutable model, named helpers, a serializer and a builder."
---

# @cosyte/hl7

Parse real-world, vendor-quirky HL7 v2 and pull fields out in one line, without reading the spec.
`@cosyte/hl7` is a zero-dependency TypeScript toolkit: a lenient parser, an immutable model with
dot-path access, named helpers for the common segments, a spec-clean serializer, a message builder,
and a profile system for vendor quirks.

## Features

- **One-line extraction**: `msg.patient.mrn`, `msg.meta.timestamp`, `msg.observations()`, and friends. No segment or field numbers to memorize.
- **Three access patterns**: named helpers, dot-paths (`msg.get("PID.5.1")`), or structural traversal (`msg.segments("OBX")[0].field(3)`). Pick the level of ceremony you need.
- **Typed message overlays**: `msg.is("ADT^A01")` answers at run time and narrows at compile time, so the message code and trigger event become literal types and `part` / `parts` are scoped to the segments that message type's published structure requires. No cast, no per-message-type import.
- **Opt-in published-structure validation**: `validateMessageStructure(msg)` checks segment order, occurrence counts, and unnamed segments against HL7's own published message structures, derived offline from a vendored snapshot. Read-only, no new warning code, and nothing changes for a caller who does not ask.
- **Real-world tolerance, four-tier**: lenient default parses vendor-quirky messages; 20 stable warning codes flag what was tolerated; strict mode escalates every deviation for CI validators; only 4 truly-structural failures are fatal.
- **First-class profile system**: `defineProfile()` API, 8 built-in vendor profiles (Epic, Cerner, Meditech, athenahealth, generic lab, Visage 7 imaging/PACS, Philips Vue PACS, VA VistA Radiology/NucMed), plus a [publishable starter kit](https://github.com/cosyte/hl7/tree/main/examples/profile-starter-kit) you copy-and-ship.
- **Round-trip safe, byte-verbatim escapes**: `parse -> modify -> toString()` emits spec-clean HL7 regardless of input quirks (Postel's Law: liberal parser, conservative emitter), and a parsed field's escape sequences (`\H\`, `\X41\`, charset/vendor escapes) re-emit **byte-for-byte**. See [Escapes and round-trip](./spec-notes-escapes.md).
- **Strict TypeScript, zero runtime deps**: ES2023, `noUncheckedIndexedAccess`, dual ESM and CJS, Node.js 22 or later. Every public function and class has JSDoc + `@example` that feeds your editor's IntelliSense.
- **Warnings carry stable codes + positional context**: react programmatically by `w.code`, with `segmentIndex`/`fieldIndex`/etc. attached.

## Install

```bash
npm install @cosyte/hl7
```

## Parse a message

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

msg.get("PID.5.1"); // "Smith"
msg.patient?.familyName; // "Smith"
msg.observations(); // typed OBX rows
msg.warnings; // stable, positional tolerance warnings
```

The parser is **lenient by default** (vendor quirks become warnings, not failures) while
`msg.toString()` always emits spec-clean HL7 (Postel's Law). Pass `{ strict: true }` to escalate
every tolerated deviation to a thrown `Hl7ParseError`.

## Vendor profiles

Apply a built-in profile, or declare your own with `defineProfile()`:

```ts
import { parseHL7, profiles } from "@cosyte/hl7";

const msg = parseHL7(raw, profiles.epic);
```

Built-ins ship for Epic, Cerner, Meditech, Athena, a generic lab, and the Visage 7 and Philips Vue
PACS imaging systems, each authored through the same public `defineProfile()` API you'd use yourself.

## Next

- Read the **API reference** for every export, generated from source.
- Start from the **profile starter kit** to publish your own vendor profile package.
