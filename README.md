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
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

A developer-focused HL7 v2 parser and utility library for Node.js and TypeScript. Optimised for the 10% of HL7 you actually use, with the other 90% still one accessor away when you need it.

---

## Contents

- [Why this exists](#why-this-exists)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
- [PHI and safety](#phi-and-safety)
- [Features](#features)
- [HL7 in 90 seconds](#hl7-in-90-seconds)
- [Access patterns](#access-patterns)
- [Cookbook](#cookbook)
- [Profiles](#profiles)
- [Real-World Tolerance](#real-world-tolerance)
- [Error Handling](#error-handling)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Trademarks](#trademarks)
- [License](#license)

---

## Why this exists

HL7 v2 is the format hospital systems actually speak, and reading one field out of it usually costs you a detour through a 2,000-page specification to learn that the patient's medical record number is `PID-3.1` and the message time is `MSH-7`. This library is for the application developer who has to consume that traffic and would rather not become an HL7 expert first: `msg.patient?.mrn` and `msg.meta.timestamp` are the whole learning curve. The nearest alternative is splitting on `|` and `^` yourself, or reaching for a parser that hands back a positional tree and still expects you to know the segment and field numbers. Those give you structure; this gives you the fields, keeps the positional tree underneath for when you need it, and treats vendor-quirky real-world input as the normal case rather than an error.

---

## Status

`0.1.0`. The public API is settled and safe to depend on: the exported functions, the message and helper surfaces, and the 20 stable warning codes are what the version claims, and renaming a warning code counts as a breaking change here.

Nothing is queued as forthcoming: [Roadmap](#roadmap) below names no future work, only what is permanently out of scope. `parseStream` parses multi-GB batch files incrementally and yields the messages as an async iterable, and `emitMessageSchema` produces JSON Schema and Zod descriptions of what `toJSON()` returns. Both are exported, so both are covered by the stability claim above.

The opt-in structural validator ships too: `validateMessageStructure(msg)` enforces segment ordering and cardinality against HL7's published message structures. See [Check a message against HL7's published shape](./documentation/cookbook-messages.md#check-a-message-against-hl7s-published-shape-validatemessagestructure).

Typed message overlays ship and are covered by the stability claim: `msg.is("ADT^A01")` answers from the message type the parser extracted and narrows the message for the compiler, so the accessors after the check are scoped to the segments that message type's published structure requires. See [Narrow a message to its type](./documentation/cookbook-messages.md#narrow-a-message-to-its-type).

---

## Install

```bash
# pnpm (recommended). Also works with: npm install @cosyte/hl7  |  yarn add @cosyte/hl7
pnpm add @cosyte/hl7
```

Requires Node `>=22`. The package ships dual ESM and CommonJS builds with type declarations for both, so `import` and `require` both work and neither needs a compatibility shim. There are zero runtime dependencies: the Node standard library is all it loads.

---

## Usage

Parse a message, read fields off it. No HL7 spec knowledge required.

```ts
import { parseHL7 } from "@cosyte/hl7";

// An ADT^A01 admit. HL7 v2 separates segments with a carriage return.
const raw = [
  "MSH|^~\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|EX00001|P|2.5",
  "EVN|A01|20260419101500",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M",
  "PV1|1|I|ICU^101^A^HOSP",
].join("\r");

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

That block is [`examples/readme-usage.ts`](./examples/readme-usage.ts), which `pnpm examples` runs and which fails if the output above ever stops matching what the code prints.

Note `precision`: a birth date is a day, not an instant, and every datetime is a fidelity `TS` that keeps the precision and timezone it arrived with rather than guessing a `Date`.

That is the whole pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default, strips MLLP framing if it's there, normalises casing, and tolerates the dozen-or-so deviations real HL7 traffic routinely carries. You reach for strict mode, dot-paths, or profiles when you want them, not before.

---

## PHI and safety

HL7 v2 messages carry patient data, so what this library does with the bytes you hand it is part of its contract.

**It does not log.** There is no logger, no debug channel and no `console` call anywhere in the library: diagnostics are returned to you, never printed. Tolerated deviations come back as `Hl7ParseWarning` values carrying a stable code, a bounded message and a position (`segmentIndex`, `fieldIndex`), never the field value that triggered them, so a warning is safe to log as-is.

**One field is an exception, and it is deliberate.** `Hl7ParseError.snippet` carries up to 40 characters of your input verbatim and unredacted so a fatal parse failure is actionable. It is the only field that echoes input without filtering, the library does not redact it, and it is the first thing to strip if your compliance posture requires it. `Hl7ParseError.message` is bounded rather than absolutely content-free: it echoes a token only where the token matches a shape the spec defines (a three-character segment identifier, a message type, a version, a known charset label) and withholds anything else.

**It retains nothing you do not hold.** Parsing returns an `Hl7Message` and the message content lives on that object and nowhere else. There is no cache, no pool and no module-level store of message data, so the content is released when you drop your reference to it. The one piece of process-wide state the library keeps is an optional registered default profile, which holds parsing configuration, not patient data.

**It writes nothing and sends nothing.** No file is opened, no directory is written and no network connection is made: the library imports only `node:buffer` and `node:crypto` from the standard library and has zero runtime dependencies. `parseStream` reads a stream you supply and opens nothing itself. `toString()`, `toJSON()` and `prettyPrint()` hand the message content back to you by design; where it goes next is your call, and `prettyPrint()` in particular is a debug view of real patient data, not a redacted one.

**What stays yours.** Transport security, storage, retention and audit, redaction before anything reaches a log or an error tracker, and access control are all the consuming application's. A parser cannot make a system HIPAA-compliant, and this one does not claim to.

---

## Features

- **One-line extraction**: `msg.patient.mrn`, `msg.meta.timestamp`, `msg.observations()`, and friends. No segment or field numbers to memorise.
- **Three access patterns**: named helpers, dot-paths (`msg.get("PID.5.1")`), or structural traversal (`msg.segments("OBX")[0].field(3)`). Pick the level of ceremony you need.
- **Typed message overlays**: `msg.is("ADT^A01")` answers at run time and narrows at compile time, so the message code and trigger event become literal types and `part` / `parts` are scoped to the segments that message type's published structure requires. No cast, no per-message-type import.
- **Opt-in published-structure validation**: `validateMessageStructure(msg)` checks segment order, occurrence counts and unnamed segments against HL7's own published message structures, derived offline from a vendored snapshot. Read-only, no new warning code, and nothing changes for a caller who does not ask.
- **Real-world tolerance, four-tier**: lenient default parses vendor-quirky messages; 20 stable warning codes flag what was tolerated; strict mode escalates every deviation for CI validators; only 4 truly-structural failures are fatal.
- **First-class profile system**: `defineProfile()` API, 8 built-in vendor profiles (Epic, Cerner, Meditech, athenahealth, generic lab, Visage 7 imaging/PACS, Philips Vue PACS, VA VistA Radiology/NucMed), plus a [publishable starter kit](./examples/profile-starter-kit/) you copy-and-ship.
- **Round-trip safe, byte-verbatim escapes**: `parse -> modify -> toString()` emits spec-clean HL7 regardless of input quirks (Postel's Law: liberal parser, conservative emitter), and a parsed field's escape sequences (`\H\`, `\X41\`, charset/vendor escapes) re-emit **byte-for-byte**. See [Escapes & round-trip](./docs-content/spec-notes-escapes.md).
- **Strict TypeScript, zero runtime deps**: ES2023, `noUncheckedIndexedAccess`, dual ESM + CJS, Node 22+. Every public function and class has JSDoc + `@example` that feeds your editor's IntelliSense.
- **Warnings carry stable codes + positional context**: react programmatically by `w.code`, with `segmentIndex`/`fieldIndex`/etc. attached.

---

## HL7 in 90 seconds

HL7 v2 is a pipe-delimited messaging format used across US healthcare. A message is a sequence of line-oriented **segments** (3-letter names like `MSH`, `PID`, `OBX`). Each segment carries **fields** separated by `|`; fields decompose into **components** (`^`) and **subcomponents** (`&`). Repeating fields use `~`.

A typical ADT message looks like this:

```
Message
 ├── MSH    (header: sender, receiver, type, timestamp)
 ├── EVN    (event details for ADT)
 ├── PID    (patient identification: name, record number, DOB)
 ├── PV1    (visit: class, location, attending)
 └── OBX×N  (observations: repeats for labs, vitals)

 Each segment   = pipe-delimited (|) fields
 Each field     = caret-delimited (^) components
 Each component = ampersand-delimited (&) subcomponents
```

That's enough HL7 to use this library productively. Everything else is in the spec, but you won't need it.

---

## Access patterns

Three ways to reach into a parsed message, each optimised for a different use case.

Named helpers, dot-paths and structural traversal, each with a worked example, are in [Access patterns](./documentation/access-patterns.md).

---

## Cookbook

Runnable recipes for the tasks developers hit most often. Every snippet imports from `@cosyte/hl7` and uses APIs exported from [`src/index.ts`](./src/index.ts). Keep them short; lean on the named-helper surface first.

- [Message recipes](./documentation/cookbook.md): patient demographics, lab results, admit location, modify and reserialize, allergies, scheduling, documents and charges, order and medication timing, patient merges and identity events.
- [Profile recipes](./documentation/cookbook-profiles.md): write your first profile, extend it, compose several, publish a profile package, register a default profile.
- [Datetime precision and timezone fidelity](./documentation/cookbook-datetime.md): the fidelity `TS`, `toObject` / `toISO` / `toDate`, non-standard timestamp formats, and why the parser refuses to guess day-first or month-first.
- [Framing, batches, streams and validation](./documentation/cookbook-messages.md): stripping MLLP framing, batch files, `parseStream`, detecting and narrowing a message type, spotting a truncated message, `validateMessageStructure`, `validateAgainstProfile`, and pretty-printing for logs.

---

## Profiles

Profiles are the growth loop. Built-ins cover the common vendor patterns; real integrations (hospital-specific Epic instances, reference labs, HIEs) publish their own profile packages that extend the built-ins. The `defineProfile()` API treats built-ins and user-authored profiles as equal citizens. There's no second-class path.

Authoring, naming fields on standard segments, extending, merge semantics, inspecting a profile, publishing one, and the eight built-ins are in [Profiles](./documentation/profiles.md).

---

## Real-World Tolerance

The four tiers, the warning codes they produce and strict mode are in [Real-World Tolerance](./documentation/real-world-tolerance.md).

---

## Error Handling

The library throws exactly three error types, all exported from the package barrel.

`Hl7ParseError`, `Hl7ParseWarning` and `ProfileDefinitionError`, with what each carries and how to narrow on it, are in [Error Handling](./documentation/error-handling.md).

---

## Roadmap

Nothing is queued for a future release. Three capabilities a reader might expect to find named here are available today. Batch files too large to buffer are parsed incrementally by [`parseStream`](./documentation/cookbook-messages.md#streaming-large-files-parsestream), which yields the messages as an async iterable. JSON Schema and Zod descriptions of what `toJSON()` returns come from `emitMessageSchema`; Zod arrives as TypeScript source text to paste into your own project, so this package still has zero runtime dependencies (see the [schema emission notes](./docs-content/schema-emission.md)). A profile's declared field names are carried into the type system, so `seg.get("departmentCode")` on a declared segment is checked against that profile's names instead of widening to `string | undefined`. All three are exported, and all three are covered by the stability claim in [Status](#status).

What lands next starts as a quirk sighting or a real-world edge case on the [issue tracker](https://github.com/cosyte/hl7/issues).

### Out of scope (permanently)

- **MLLP framing / network transport**: a future `@cosyte/hl7-mllp` package will cover network IO; this library is parser-only.
- **HL7 v3 and CDA**: different spec family entirely; not in our plans.
- **FHIR conversion**: a future companion package could bridge, but the conversion is non-trivial and deserves its own repo.
- **Exhaustive coded-value validation**: we validate structure, not every HL7 table. Integrate a domain validator (e.g. your LIS's internal code registry) for that.

---

## Contributing

Vendor-quirk fixtures, profile improvements, and standalone profile packages are all welcome. The more real-world edge cases the test suite covers, the more robust the parser gets. Every published profile package is a signal of adoption and a contribution back.

Ask on the issue tracker, [github.com/cosyte/hl7/issues](https://github.com/cosyte/hl7/issues): questions, bug reports and quirk sightings all start there, and so does any refactor large enough to want discussion before a PR.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, how to file an issue, and how to submit a PR.

---

## Trademarks

Epic, Cerner, MEDITECH, athenahealth, LabCorp, Quest Diagnostics, Visage (Visage Imaging), and Philips (Vue PACS) are trademarks of their respective owners. cosyte is not affiliated with, endorsed by, or
sponsored by any of them: the names identify the systems whose real-world message quirks the built-in profiles accommodate. See [TRADEMARKS.md](./TRADEMARKS.md).

## License

MIT, copyright Cosyte. See [LICENSE](./LICENSE).

---

_Built by [Cosyte](https://cosyte.com)._
