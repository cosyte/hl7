---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
description: "Parse an HL7 v2 message and read patient, order and observation fields in a few lines, using the named helpers instead of raw HL7 paths."
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

// Synthetic ADT^A01: each segment ends with a carriage return, per the spec.
const raw =
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212\r" +
  "PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001\r";

const msg = parseHL7(raw);

// `msg.patient` is `undefined` when the message has no PID segment.
msg.patient?.mrn; // => "MRN12345"
msg.patient?.fullName; // => "John Q Doe"
msg.patient?.sex; // => "M"
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

Each tolerance warning carries a stable code you can branch on. The 21 warning codes are a public,
versioned contract: they are not renamed without a breaking release.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// The sender wrote the OBX segment name in lower case.
const raw =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|EX00090|P|2.5\r" +
  "PID|1||MRN67890^^^HOSP^MR\r" +
  "OBR|1|ORD-EX-1\r" +
  "obx|1|NM|GLU^Glucose^LN||120|mg/dL";

const msg = parseHL7(raw);

msg.warnings.map((w) => w.code); // => ["SEGMENT_CASE"]
msg.warnings[0]?.position; // => { segmentIndex: 3 }

// The segment still resolves as the OBX it names, and is written back as it arrived.
msg.observations()[0]?.value; // => 120
msg.toString().includes("\robx|1|"); // => true
```

Every TypeScript sample on these pages runs in the package's test suite against the built package,
and each `// =>` line is checked, so a sample cannot drift from the code.

## Next

- [Process a lab feed](./process-a-lab-feed.md): a tutorial that splits a batch file, reads the
  results and answers each message with an ACK.
- [Read patient and visit](./read-patient-and-visit.md), [Read lab results](./read-lab-results.md)
  and the other how-to guides, one task each.
- [The three ways to read a message](./access-patterns.md) and
  [Tolerance and error handling](./tolerance-and-errors.md): how the model and the warnings work.
- [Troubleshooting](./troubleshooting.md): warnings versus errors, strict mode, and known limits.
