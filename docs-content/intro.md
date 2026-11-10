---
id: intro
title: Getting started
sidebar_label: Getting started
description: "Parse real-world, vendor-quirky HL7 v2 and pull fields out in one line: a lenient parser, an immutable model, named helpers, a serializer and a builder."
---

# @cosyte/hl7

Parse real-world, vendor-quirky HL7 v2 and pull fields out in one line, without reading the
standard first. `@cosyte/hl7` is a TypeScript library for Node.js with no runtime dependencies: a
lenient parser, an immutable message model, named helpers for the common segments, a spec-clean
serializer, message builders, validation, and vendor profiles.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
    "EVN|A01|20250102153045\r" +
    "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19800115|F\r" +
    "PV1|1|I|ICU^101^A^MAIN",
);

msg.patient?.mrn; // => "MRN12345"
msg.get("PID.5.1"); // => "Smith"
msg.meta.messageCode; // => "ADT"
msg.warnings; // => []
```

## Who it is for

Developers who receive or send HL7 v2 from Node.js or TypeScript: an integration that reads ADT,
ORU or ORM feeds from an EHR or a lab, a service that answers with ACKs, a test harness that builds
messages, or a validator in CI.

## What it does

- **Reads leniently, writes strictly.** Vendor quirks become one of 20 stable warning codes on
  `msg.warnings` instead of a failure; only 4 structural problems are fatal. `toString()` always
  writes spec-clean HL7. Strict mode turns every warning into an error for a CI validator.
- **One-line reads.** `msg.patient`, `msg.visit`, `msg.meta`, `msg.observations()`,
  `msg.allergies()` and the other helpers return typed values, with no segment or field numbers to
  remember. Dot-paths (`msg.get("PID.5.1")`) and the segment tree reach everything else.
- **Typed message overlays.** `msg.is("ADT^A01")` answers at run time and narrows the message type
  at compile time.
- **Datetimes without guessing.** A date keeps the precision and timezone the sender wrote, and a
  conversion that would need a guess returns `undefined`.
- **Builders.** `buildMessage` and the typed builders (`buildAdt`, `buildOru` and the rest) write
  messages that parse back with no warnings; `buildAck` answers an inbound message.
- **Validation you ask for.** A safety net for truncated or misrouted messages on every parse,
  plus opt-in checks against HL7's published structures and against conformance profiles you write.
- **Vendor profiles.** Eight built-in profiles, and `defineProfile()` for your own senders.
- **Round trips that keep bytes.** A parsed field's escape sequences re-emit byte for byte.
- **Strict TypeScript.** ES2023, `noUncheckedIndexedAccess`, ESM and CommonJS builds, Node.js 22 or
  later. Every export carries a TSDoc summary, which your editor shows and the
  [API reference](./api/README.md) is generated from.

## What it is not

- **Not a transport.** It adds no MLLP framing and opens no socket; that is
  [`@cosyte/mllp`](https://docs.cosyte.com/mllp).
- **Not an interface engine.** It reports merges, delete requests and statuses; it never applies
  them to stored data.
- **Not a terminology service.** It reports the coding system a code claims and never checks a
  code against LOINC, SNOMED CT or any other system. It makes no network call.
- **Not a FHIR converter.** It is a stable source for a FHIR mapping and builds no FHIR resource
  itself (see [the FHIR-bridge contract](./spec-notes-fhir-bridge.md)).
- **Not a conformance certification.** A validator that finds nothing means the checks that ran
  found nothing.

## Next

- [Install it](./installation.md), then work through the [quickstart](./quickstart.md).
- [Process a lab feed](./process-a-lab-feed.md): a tutorial from a batch file to ACKs.
- The how-to guides, from [Read patient and visit](./read-patient-and-visit.md) to
  [Validate a message](./validate-messages.md).
- [Testing and quality](./testing-and-quality.md) and [Performance](./performance.md): how this
  package is tested and measured.
