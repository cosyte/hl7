<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# @cosyte/hl7

> Parse real-world, vendor-quirky HL7 v2 messages and extract the fields you need in one line, without reading the spec.

[![npm version](https://img.shields.io/npm/v/@cosyte/hl7.svg)](https://www.npmjs.com/package/@cosyte/hl7)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/hl7/ci.yml?branch=main&label=CI)](https://github.com/cosyte/hl7/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cosyte/hl7/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org)

A developer-focused HL7 v2 parser and utility library for Node.js and TypeScript. Optimized for the 10% of HL7 you actually use, with the other 90% still one accessor away when you need it.

---

## Contents

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [Documentation](#documentation)
- [Support](#support)
- [Security](#security)
- [Contributing](#contributing)
- [Trademarks](#trademarks)
- [License](#license)

---

## Why this exists

HL7 v2 is the format hospital systems actually speak, and reading one field out of it usually costs you a detour through a 2,000-page specification to learn that the patient's medical record number is `PID-3.1` and the message time is `MSH-7`. This library is for the application developer who has to consume that traffic and would rather not become an HL7 expert first: `msg.patient?.mrn` and `msg.meta.timestamp` are the whole learning curve. Other good libraries exist, among them simple-hl7, node-hl7-client, hl7-standard and Medplum's for Node.js, HAPI and nHapi for Java and .NET, and python-hl7 and hl7apy for Python, and several of them carry network transport, the XML encoding or a class per HL7 version, none of which we do (MLLP transport is [`@cosyte/mllp`](https://github.com/cosyte/mllp)). What we add, on top of the positional tree we keep underneath for when you need it, is vendor-quirky input read as the normal case with every tolerated deviation reported as a coded warning, typed views of a message after a type check, and structure checks against HL7's published structures, compared feature by feature, with our gaps, in [How we compare with other HL7 v2 libraries](https://github.com/cosyte/hl7/blob/main/docs-content/compare-hl7-libraries.md).

---

## Status

The 0.1 line. The public API is settled and safe to depend on: the exported functions, the message and helper surfaces, and the 20 stable warning codes are what the version claims, and renaming a warning code counts as a breaking change here.

Nothing is queued as forthcoming. `parseStream` parses multi-GB batch files incrementally and yields the messages as an async iterable, and `emitMessageSchema` produces JSON Schema and Zod descriptions of what `toJSON()` returns. Both are exported, so both are covered by the stability claim above.

The opt-in structural validator ships too: `validateMessageStructure(msg)` enforces segment ordering and cardinality against HL7's published message structures. See [Check order and counts against the published structure](https://github.com/cosyte/hl7/blob/main/docs-content/validate-messages.md#check-order-and-counts-against-the-published-structure).

Typed message overlays ship and are covered by the stability claim: `msg.is("ADT^A01")` answers from the message type the parser extracted and narrows the message for the compiler, so the accessors after the check are scoped to the segments that message type's published structure requires. See [Narrow a message to its type](https://github.com/cosyte/hl7/blob/main/docs-content/read-patient-and-visit.md#narrow-a-message-to-its-type).

Permanently out of scope:

- **Network transport**: sending and receiving over MLLP is [`@cosyte/mllp`](https://github.com/cosyte/mllp)'s job; this library is parser-only and only strips MLLP framing on read.
- **HL7 v3 and CDA**: different spec family entirely; not in our plans.
- **FHIR conversion**: [`@cosyte/transform`](https://github.com/cosyte/transform) converts a parsed message to FHIR R4; this library does not.
- **Exhaustive coded-value validation**: we validate structure, not every HL7 table. Integrate a domain validator (e.g. your LIS's internal code registry) for that.

---

## Install

```bash
# pnpm (recommended). Also works with: npm install @cosyte/hl7  |  yarn add @cosyte/hl7
pnpm add @cosyte/hl7
```

Requires Node.js 22 or later, tested on 22, 24, and 26 (`engines.node` is `>=22.0.0`). The package ships dual ESM and CommonJS builds with type declarations for both, so `import` and `require` both work and neither needs a compatibility shim. There are zero runtime dependencies: the Node standard library is all it loads. The optional `@cosyte/hl7/arbitraries` entry point, fast-check generators for [property-testing your own code](https://github.com/cosyte/hl7/blob/main/docs-content/property-test-your-code.md), needs `fast-check` installed beside it; the main entry point never loads it.

---

## Usage

Parse a message, read fields off it. No HL7 spec knowledge required.

```ts
import { parseHL7 } from "@cosyte/hl7";

// A synthetic ADT^A01 admit. HL7 v2 ends every segment with a carriage return.
const raw =
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212\r" +
  "PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001\r";

const msg = parseHL7(raw);

console.log("Patient record number:", msg.patient?.mrn);
console.log("Full name:", msg.patient?.fullName);
console.log("Date of birth:", msg.patient?.dateOfBirth?.raw);
console.log("Precision:", msg.patient?.dateOfBirth?.precision);
console.log("Message type:", msg.meta.type);
console.log("Sent at:", msg.meta.timestamp?.raw);
console.log("Ward:", msg.visit?.location?.pointOfCare);
```

```text
Patient record number: MRN12345
Full name: John Q Doe
Date of birth: 19800115
Precision: day
Message type: ADT^A01^ADT_A01
Sent at: 20260419101500
Ward: ICU
```

The test suite reads that block out of this README, runs it against the package, and fails if the output above ever stops matching what the code prints. The message is a copy of a synthetic fixture from the repository's test corpus.

Note `precision`: a birth date is a day, not an instant, and every datetime is a fidelity `TS` that keeps the precision and timezone it arrived with rather than guessing a `Date`.

That is the whole pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default, strips MLLP framing if it's there, normalizes casing, and tolerates the dozen-or-so deviations real HL7 traffic routinely carries. You reach for strict mode, dot-paths, or profiles when you want them, not before.

---

## Documentation

The full reference lives at [docs.cosyte.com/hl7](https://docs.cosyte.com/hl7), built from this repository's [`docs-content/`](https://github.com/cosyte/hl7/tree/main/docs-content). Start with these pages:

- [Tutorial: process a lab feed](https://github.com/cosyte/hl7/blob/main/docs-content/process-a-lab-feed.md): split a batch file, read the results, flag the abnormal ones, and answer each message with an ACK.
- [The three ways to read a message](https://github.com/cosyte/hl7/blob/main/docs-content/access-patterns.md): a 90-second HL7 v2 primer, then named helpers, dot-paths, and the segment tree.
- The how-to guides: [patient and visit](https://github.com/cosyte/hl7/blob/main/docs-content/read-patient-and-visit.md), [lab results](https://github.com/cosyte/hl7/blob/main/docs-content/read-lab-results.md), [clinical lists](https://github.com/cosyte/hl7/blob/main/docs-content/read-clinical-lists.md), [merges](https://github.com/cosyte/hl7/blob/main/docs-content/handle-patient-merges.md), [dates](https://github.com/cosyte/hl7/blob/main/docs-content/read-dates-and-times.md), [edits](https://github.com/cosyte/hl7/blob/main/docs-content/modify-and-resend.md), [building](https://github.com/cosyte/hl7/blob/main/docs-content/build-messages.md), [ACKs](https://github.com/cosyte/hl7/blob/main/docs-content/acknowledge-messages.md), [batches and streams](https://github.com/cosyte/hl7/blob/main/docs-content/split-batches-and-streams.md) and [validation](https://github.com/cosyte/hl7/blob/main/docs-content/validate-messages.md).
- [Use and write vendor profiles](https://github.com/cosyte/hl7/blob/main/docs-content/profiles.md): built-in profiles, your own, layering, and publishing one.
- [Tolerance and error handling](https://github.com/cosyte/hl7/blob/main/docs-content/tolerance-and-errors.md): the four tolerance tiers and the errors the library throws.
- [Warning and fatal codes](https://github.com/cosyte/hl7/blob/main/docs-content/warning-and-fatal-codes.md): every stable code and what it means.
- The spec notes: what the standard says and how we read it, from [the HL7 v2 primer](https://github.com/cosyte/hl7/blob/main/docs-content/spec-notes-primer.md) and [message structure](https://github.com/cosyte/hl7/blob/main/docs-content/spec-notes-structure.md) to [escape sequences](https://github.com/cosyte/hl7/blob/main/docs-content/spec-notes-escapes.md), [datetime precision](https://github.com/cosyte/hl7/blob/main/docs-content/spec-notes-datetime-precision.md) and [the version matrix](https://github.com/cosyte/hl7/blob/main/docs-content/spec-notes-version-matrix.md); the docs site lists all eighteen under Explanation.
- [Testing and quality](https://github.com/cosyte/hl7/blob/main/docs-content/testing-and-quality.md): how we test this library, with what each kind of test catches and misses.
- [Performance](https://github.com/cosyte/hl7/blob/main/docs-content/performance.md): what we measure and how, the CI guard that fails on a regression, and how to run the benchmarks yourself.
- [API reference](https://github.com/cosyte/hl7/blob/main/docs-content/api/README.md): generated from the TSDoc comments, for both `@cosyte/hl7` and `@cosyte/hl7/arbitraries`.

---

## Support

Questions, bug reports, and quirk sightings all start on the [issue tracker](https://github.com/cosyte/hl7/issues), and so does any refactor large enough to want discussion before a pull request.

Need an HL7 v2 integration built, or hosted and run for you? See our [integration services](https://cosyte.com/integration-services).

---

## Security

Report a vulnerability privately, as the [security policy](https://github.com/cosyte/.github/blob/main/SECURITY.md) describes, never in a public issue.

### PHI and safety

HL7 v2 messages carry patient data, so what this library does with the bytes you hand it is part of its contract.

**It does not log.** There is no logger, no debug channel, and no `console` call anywhere in the library: diagnostics are returned to you, never printed. Tolerated deviations come back as `Hl7ParseWarning` values carrying a stable code, a bounded message, and a position (`segmentIndex`, `fieldIndex`), never the field value that triggered them, so a warning is safe to log as-is.

**One field is an exception, and it is deliberate.** `Hl7ParseError.snippet` carries up to 40 characters of your input verbatim and unredacted so a fatal parse failure is actionable. It is the only field that echoes input without filtering, the library does not redact it, and it is the first thing to strip if your compliance posture requires it. `Hl7ParseError.message` is bounded rather than absolutely content-free: it echoes a token only where the token matches a shape the spec defines (a three-character segment identifier, a message type, a version, a known charset label) and withholds anything else.

**It retains nothing you do not hold.** Parsing returns an `Hl7Message` and the message content lives on that object and nowhere else. There is no cache, no pool, and no module-level store of message data, so the content is released when you drop your reference to it. The one piece of process-wide state the library keeps is an optional registered default profile, which holds parsing configuration, not patient data.

**It writes nothing and sends nothing.** No file is opened, no directory is written, and no network connection is made: the library imports only `node:buffer` from the standard library, draws the random part of a generated message control ID from the runtime's Web Crypto global (`crypto.getRandomValues`), and has zero runtime dependencies. `parseStream` reads a stream you supply and opens nothing itself. `toString()`, `toJSON()`, and `prettyPrint()` hand the message content back to you by design; where it goes next is your call, and `prettyPrint()` in particular is a debug view of real patient data, not a redacted one.

**What stays yours.** Transport security, storage, retention and audit, redaction before anything reaches a log or an error tracker, and access control are all the consuming application's. A parser cannot make a system HIPAA-compliant, and this one does not claim to.

---

## Contributing

Vendor-quirk fixtures, profile improvements, and standalone profile packages are all welcome. The more real-world edge cases the test suite covers, the more robust the parser gets. Every published profile package is a signal of adoption and a contribution back.

The organization's [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md) and [code of conduct](https://github.com/cosyte/.github/blob/main/CODE_OF_CONDUCT.md) apply here. [CONTRIBUTING.md](https://github.com/cosyte/hl7/blob/main/CONTRIBUTING.md) adds what is specific to this repository: dev setup, the gate, and how to submit a PR.

---

## Trademarks

Epic, Cerner, MEDITECH, athenahealth, LabCorp, Quest Diagnostics, Visage (Visage Imaging), and Philips (Vue PACS) are trademarks of their respective owners. Cosyte is not affiliated with, endorsed by, or
sponsored by any of them: the names identify the systems whose real-world message quirks the built-in profiles accommodate. See [TRADEMARKS.md](https://github.com/cosyte/hl7/blob/main/TRADEMARKS.md).

## License

MIT, Copyright (c) 2026 Cosyte LLC. See [LICENSE](https://github.com/cosyte/hl7/blob/main/LICENSE).

---

_Built by [Cosyte](https://cosyte.com)._
