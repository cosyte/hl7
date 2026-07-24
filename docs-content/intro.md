---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/hl7

Parse real-world, vendor-quirky HL7 v2 and pull fields out in one line, without reading the spec.
`@cosyte/hl7` is a zero-dependency TypeScript toolkit: a lenient parser, an immutable model with
dot-path access, named helpers for the common segments, a spec-clean serializer, a message builder,
and a profile system for vendor quirks.

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
