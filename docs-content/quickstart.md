---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

Parse a real HL7 v2 message and pull fields out in a few lines. `@cosyte/hl7` is **lenient by
default** (Postel's Law): vendor-quirky input parses into an immutable message plus a list of
tolerance **warnings**, rather than throwing. The serializer, by contrast, is conservative.
`msg.toString()` always emits spec-clean HL7.

## Parse a message

The named helpers (`msg.patient`, `msg.meta`, …) give you the common fields with **zero HL7-path
knowledge required**:

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// Synthetic ADT^A01: segments are CR-delimited per the spec.
const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|EX00001|P|2.5",
  "EVN|A01|20260419101500",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101",
  "PV1|1|I|ICU^101^A^HOSP|||||ATTEND123^Smith^Jane^A^^^MD",
].join("\r");

const msg = parseHL7(raw);

msg.patient.mrn; // => "MRN12345"
msg.patient.fullName; // => "John Q Doe"
msg.patient.sex; // => "M"
msg.meta.type; // => "ADT^A01^ADT_A01"

// A clean, spec-conformant message parses with no tolerance warnings.
msg.warnings; // => []
```

## Reach any field by path

When there's no named helper for what you need, dot-paths reach any field, component, or
subcomponent: `SEGMENT.field.component.subcomponent`:

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|EX00001|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M";

const msg = parseHL7(raw);

msg.get("PID.5.1"); // => "Doe"
```

## Warnings carry stable codes

Each tolerance warning carries a **stable code** you can branch on without it churning between
releases (the 19 warning codes are a public, versioned contract):

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

for (const w of msg.warnings) {
  if (w.code === "SEGMENT_CASE") {
    // a segment name arrived in the wrong case; the parser normalized it
  }
}
```

> **About runnable examples.** The blocks tagged ` ```ts runnable ` above are extracted by the docs
> build, executed against the package, and their `// =>` results asserted, so a documented example
> can never silently drift from the code. Illustrative fragments (like the one directly above, which
> references an undeclared `raw`) stay plain ` ```ts ` blocks.

## Next

- [Core Concepts](./spec-notes-primer): the tolerance model and the spec grounding behind it.
- [Guides](./guides-overview): task-oriented recipes: lab results, vendor profiles, ACKs, building.
- [Troubleshooting](./troubleshooting): warnings vs. errors, strict mode, and known limitations.
