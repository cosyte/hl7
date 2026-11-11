---
id: compare-hl7-libraries
title: How we compare with other HL7 v2 libraries
sidebar_label: Compared with other libraries
description: "Where @cosyte/hl7 stands beside eight other HL7 v2 libraries, feature by feature, with what we lack, each fact sourced from that project and dated."
---

# How we compare with other HL7 v2 libraries

This page is here to help you choose. It sets `@cosyte/hl7` beside eight other HL7 v2 libraries,
feature by feature, and says where another library does something we do not. Four run on Node.js
(simple-hl7, node-hl7-client, hl7-standard and Medplum's HL7 support), two are the HAPI projects for
Java and .NET (HAPI and nHapi), and two are for Python (python-hl7 and hl7apy).

## How we wrote it

- Every statement about another project comes from that project's own README, documentation or
  source code, which we read on 2026-11-11, and links to it. The linked page is the authority, and
  it may have changed since.
- Where a project's pages do not mention a feature we write "not described". That is not the same
  as "absent": check the project before you rule it out.
- We compare features at each library's defaults. We have not run any of these libraries, and we
  make no claim about speed, size or how widely each is used.
- We are not affiliated with, endorsed by or sponsored by any project or company named here, and
  each name belongs to its owner ([Trademarks](https://github.com/cosyte/hl7/blob/main/TRADEMARKS.md)).

## At a glance

The tables summarize the sections below; each library's section links the source of every cell.

What each library does when it reads a message:

| Library         | Tolerance warnings                              | Typed views of a message type          | Structure checks                          | Streaming input                             |
| --------------- | ----------------------------------------------- | -------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| `@cosyte/hl7`   | Yes, with stable codes                          | Yes, `msg.is("ADT^A01")` narrows types | Yes, for 16 message codes                 | Yes                                         |
| simple-hl7      | Not described                                   | Not described                          | Not described                             | Not described                               |
| node-hl7-client | No: malformed input throws                      | On the build side, per version         | On the build side, per version            | Not described                               |
| hl7-standard    | Not described: errors throw or go to a callback | Not described                          | Not described                             | Not described                               |
| Medplum         | Not described: input not starting `MSH` throws  | Not described                          | Not described                             | Not described                               |
| HAPI (Java)     | Rule sets, not a warning list                   | A class per structure, per version     | Validation rules, by message type         | Yes, messages one at a time from a stream   |
| nHapi (.NET)    | Not described                                   | A C# object model, v2.1 to v2.8.1      | Not described                             | Not described                               |
| python-hl7      | Not described                                   | Not described                          | Not described                             | Yes, an asyncio stream reader, experimental |
| hl7apy          | Yes, a `TOLERANT` level and a report            | Elements by name, per version          | Yes, in `STRICT` mode and on `validate()` | Not described                               |

What else each library covers, and its licence and activity:

| Library         | Network transport                 | XML encoding  | Per-version model               | Licence                     | Last commit, latest release            |
| --------------- | --------------------------------- | ------------- | ------------------------------- | --------------------------- | -------------------------------------- |
| `@cosyte/hl7`   | No: see `@cosyte/mllp`            | No            | No: one model, v2.1 to v2.9     | MIT                         | 2026-11-11, 0.1.12                     |
| simple-hl7      | Yes, TCP server and client        | Not described | Not described                   | MIT                         | 2024-06-07, 3.3.0 in package.json      |
| node-hl7-client | Yes, MLLP client with TLS         | Not described | Yes, v2.1 to v2.8               | MIT                         | 2026-11-10, v4.1.2 (2026-10-29)        |
| hl7-standard    | Not described                     | Not described | Not described                   | Apache 2.0                  | 2022-05-11, no release tag             |
| Medplum         | Yes, server and client            | Not described | Not described                   | Apache 2.0                  | 2026-11-11, 5.2.17                     |
| HAPI (Java)     | Yes, MLLP and HL7 over HTTP       | Yes           | Yes, v2.1 to v2.8.1             | MPL 1.1 or GPL, your choice | 2026-03-26, tag v2.6.0                 |
| nHapi (.NET)    | Not described; see NHapiTools     | Yes           | An object model, v2.1 to v2.8.1 | MPL 2.0                     | 2026-10-06, v3.2.4 (2025-04-09)        |
| python-hl7      | Yes, MLLP client and asyncio MLLP | Not described | Not described                   | BSD-style, 3 clauses        | 2025-06-09, tag 0.4.5                  |
| hl7apy          | Yes, MLLP server                  | Not described | Yes, v2.1 to v2.8.2             | MIT                         | 2026-10-26, v1.4.0-beta.1 (2026-10-26) |

## What we offer, and what we do not

**Where we are strong.** We read vendor-quirky input by default and hand back each deviation we
tolerated as a warning with a stable code, a position and no patient data, rather than throwing or
staying silent ([Tolerance and error handling](./tolerance-and-errors.md)). `msg.is("ADT^A01")`
narrows a parsed message for the TypeScript compiler, so after the check only the segments that
message type's published structure requires are offered
([Narrow a message to its type](./read-patient-and-visit.md#narrow-a-message-to-its-type)). For the
message codes it covers, every parse checks that the segments HL7's published structures require
are present, and
[`validateMessageStructure`](./api/src/README.md#validatemessagestructure) checks order and counts
on request ([Validate a message's structure and content](./validate-messages.md)).
[`readMessages`](./api/src/README.md#readmessages) reads a batch, a file or a feed one message at a
time, holding only the message it is reading
([Read messages and segments as they arrive](./read-as-it-arrives.md)). Of the other libraries,
hl7apy's tutorial describes the nearest thing to our warnings: a tolerant level, and a report of
errors and warnings from `validate()`.

**Where we are not.** We say these plainly, since they may decide your choice:

- **No network transport.** We strip MLLP framing when we read, and that is all. Sending and
  receiving over MLLP is [`@cosyte/mllp`](https://docs.cosyte.com/mllp), a separate package.
  simple-hl7, node-hl7-client, Medplum, HAPI, python-hl7 and hl7apy each carry transport of their
  own.
- **No XML encoding.** We read and write the pipe-delimited encoding only. HAPI and nHapi read and
  write the XML encoding too.
- **No per-version classes.** We read v2.1 to v2.9 with one structural model and do not convert
  between versions ([Version-sensitivity matrix](./spec-notes-version-matrix.md)). HAPI
  generates a class for every message structure of every version, nHapi offers a C# object model
  for v2.1 to v2.8.1, node-hl7-client has a typed
  builder per version that rejects fields a version withdrew, and hl7apy models each version's
  elements by name. Our typed views come from the published structures, not from one version's
  tables.
- **Structure checks cover 16 message codes**, not the whole standard, and stop at the segment:
  they read no field ([Message-type and structure awareness](./spec-notes-structure.md)). hl7apy's
  `STRICT` level checks each child's name and cardinality for the version it models.
- **Node.js and TypeScript only.** For Java, .NET or Python, HAPI, nHapi, python-hl7 and hl7apy are
  the libraries to look at.

## The libraries one by one

Each fact below links the page it came from. All were read on 2026-11-11.

### simple-hl7

- Its [README](https://github.com/hitgeek/simple-hl7#readme) describes "a simple library for
  creating HL7 middleware, based on connect & express", with a parser, a message builder and editor
  API, and server and client components for TCP and file-system interfaces.
- Its README does not describe tolerance warnings, typed views, structure checks, streaming, XML or
  per-version models.
- Licence: MIT, per its README. Activity: the last commit on its default branch is dated
  2024-06-07 ([commits](https://github.com/hitgeek/simple-hl7/commits/master)), and the
  [package.json](https://github.com/hitgeek/simple-hl7/blob/master/package.json) there gives version
  3.3.0. Its git tags stop earlier: the newest by commit date is v2.2.1-a, from 2018-12-21, six
  minutes after a V2.2.1 tag ([tags](https://github.com/hitgeek/simple-hl7/tags)).

### node-hl7-client

- Its standalone repository is archived, and its
  [README](https://github.com/Bugs5382/node-hl7-client#readme) says the code moved to a monorepo,
  [node-hl7](https://github.com/Bugs5382/node-hl7), from version 4.0.0. The facts below are from
  the monorepo.
- The [package README](https://github.com/Bugs5382/node-hl7/blob/main/packages/node-hl7-client/README.md)
  says the parser is strict and that malformed HL7 throws, and advises a try/catch around untrusted
  input.
- The same README describes typed builders for HL7 v2.1 to v2.8 that validate fields against HL7
  tables and per-version usage codes: a withdrawn field throws, a backward-compatibility field
  warns, and a segment the chosen version did not have is refused. These are checks on messages you
  build; checks on messages you parse are not described.
- Transport: an MLLP client with reconnect, TLS and mutual TLS; the receiving side is the companion
  package node-hl7-server ([monorepo README](https://github.com/Bugs5382/node-hl7#readme)). Batches
  and file batches with BHS and FHS framing are supported (the same monorepo README, and the package
  README's
  [batches section](https://github.com/Bugs5382/node-hl7/blob/main/packages/node-hl7-client/README.md#-building-batches--files)).
- Streaming input and XML are not described.
- Licence: MIT. Activity: the last commit on the monorepo is dated 2026-11-10, and release v4.1.2
  was published on 2026-10-29 ([releases](https://github.com/Bugs5382/node-hl7/releases)).

### hl7-standard

- Its [README](https://github.com/ironbridgecorp/hl7-standard#readme) describes "a simple,
  lightweight HL7 module for transforming, manipulating, or creating HL7 messages", with dot-notation
  reads such as `PID.5.1`, segment editing, a batch option, and a build for use inside Mirth.
- `transform` either passes an error to a callback or throws, and the README recommends a try/catch
  when no callback is given.
- Tolerance warnings, typed views, structure checks, streaming, transport, XML and per-version
  models are not described.
- Licence: Apache 2.0, per its README. Activity: the last commit on its default branch is dated
  2022-05-11 ([commits](https://github.com/ironbridgecorp/hl7-standard/commits/master)), and the
  repository has no release tags.

### Medplum (`@medplum/core` and `@medplum/hl7`)

- Medplum's parser is the `Hl7Message` class in `@medplum/core`
  ([source](https://github.com/medplum/medplum/blob/main/packages/core/src/hl7.ts)).
  `Hl7Message.parse` throws "Invalid HL7 message" when the text does not begin with `MSH`, reads
  fields and components by position, and parses each segment on first access.
- [`@medplum/hl7`](https://github.com/medplum/medplum/blob/main/packages/hl7/README.md) is its
  "server and client" for HL7 over the network
  ([source](https://github.com/medplum/medplum/tree/main/packages/hl7/src)).
- Tolerance warnings, typed views of a message type, structure checks, streaming input, XML and
  per-version models are not described.
- Licence: Apache 2.0 ([`@medplum/hl7` README](https://github.com/medplum/medplum/blob/main/packages/hl7/README.md)).
  Activity: the last commit to `packages/hl7` is dated 2026-11-11, and `@medplum/hl7` is at version
  5.2.17 in its
  [package.json](https://github.com/medplum/medplum/blob/main/packages/hl7/package.json).

### HAPI (Java)

- HAPI calls itself "an open-source, object-oriented HL7 2.x parser for Java"
  ([site source](https://github.com/hapifhir/hapi-hl7v2/blob/master/src/site/xdoc/index.xml)).
- Its [parsing page](https://github.com/hapifhir/hapi-hl7v2/blob/master/src/site/apt/parsing.apt)
  describes a `PipeParser` for the pipe-delimited encoding and a `DefaultXMLParser` for the XML
  encoding.
- Its [validation page](https://github.com/hapifhir/hapi-hl7v2/blob/master/src/site/apt/validation.apt)
  describes rule sets a parser can apply: `DefaultValidation`, used when no other rules are defined,
  and `NoValidation`, among others. Message rules are bound to a version and scoped to a message
  type and trigger event. It describes no list of tolerated deviations handed back beside
  the message. Its [conformance page](https://github.com/hapifhir/hapi-hl7v2/blob/master/src/site/apt/conformance.apt)
  describes tools for conformance profiles.
- Per-version models: the repository carries a structures module for each version from v2.1 to
  v2.8.1, `hapi-structures-v21` to `hapi-structures-v281`
  ([repository](https://github.com/hapifhir/hapi-hl7v2)). Its
  [site](https://github.com/hapifhir/hapi-hl7v2/blob/master/src/site/xdoc/index.xml) notes that the
  generator for these structures is retired and the generated structures are now checked in.
- Streaming: `Hl7InputStreamMessageIterator` reads a stream of messages, such as a file, one
  message at a time ([source](https://github.com/hapifhir/hapi-hl7v2/blob/master/hapi-base/src/main/java/ca/uhn/hl7v2/util/Hl7InputStreamMessageIterator.java)).
- Transport: a lower-layer protocol implementation for MLLP
  ([source](https://github.com/hapifhir/hapi-hl7v2/blob/master/hapi-base/src/main/java/ca/uhn/hl7v2/llp/MinLowerLayerProtocol.java))
  and an HL7 over HTTP module, `hapi-hl7overhttp`.
- Licence: dual, the Mozilla Public License 1.1 or the GNU General Public License, at your choice
  ([pom.xml](https://github.com/hapifhir/hapi-hl7v2/blob/master/pom.xml)). Activity: the last
  commit on its default branch is dated 2026-03-26, and its newest tag is v2.6.0
  ([tags](https://github.com/hapifhir/hapi-hl7v2/tags)).

### nHapi (.NET)

- Its [README](https://github.com/nHapiNET/nHapi#readme) describes a .NET port of HAPI with a C#
  object model that conforms to HL7 v2.1, 2.2, 2.3, 2.3.1, 2.4, 2.5, 2.5.1, 2.6, 2.7, 2.7.1, 2.8 and 2.8.1, which
  parses and encodes both the pipe-delimited and the XML encoding.
- The README describes no transport of its own and points to a separate project, NHapiTools, for
  MLLP and TCP listening, ACK generation and validation rules.
- Tolerance warnings, structure checks and streaming input are not described in the README.
- Licence: MPL 2.0 ([LICENSE](https://github.com/nHapiNET/nHapi/blob/master/LICENSE)). Activity:
  the last commit on its default branch is dated 2026-10-06, and release v3.2.4 was published on
  2025-04-09 ([releases](https://github.com/nHapiNET/nHapi/releases)).

### python-hl7

- Its [documentation](https://github.com/johnpaulett/python-hl7/blob/main/docs/index.rst) describes
  "a simple library for parsing messages of Health Level 7 (HL7) version 2.x into Python objects":
  a tree of containers read as nested lists or by HL7's 1-based positions.
- Its [API page](https://github.com/johnpaulett/python-hl7/blob/main/docs/api.rst) lists
  `parse_batch` and `parse_file` for batches and files, an `MLLPClient`, and asyncio MLLP support
  with a stream reader and writer, which the documentation calls experimental.
- Streaming: `HL7StreamReader.readmessage` reads one full message at a time from an asyncio stream
  ([API page](https://github.com/johnpaulett/python-hl7/blob/main/docs/api.rst),
  [source](https://github.com/johnpaulett/python-hl7/blob/main/hl7/mllp/streams.py)), and the
  `mllp_send` command reads messages from a file or standard input and posts them to an MLLP server
  ([documentation](https://github.com/johnpaulett/python-hl7/blob/main/docs/index.rst)).
- Tolerance warnings, typed views, structure checks, XML and per-version models are not described.
- Licence: a BSD-style licence of three clauses
  ([LICENSE](https://github.com/johnpaulett/python-hl7/blob/main/LICENSE)). Activity: the last
  commit on its default branch is dated 2025-06-09, and its newest tag is 0.4.5
  ([tags](https://github.com/johnpaulett/python-hl7/tags)).

### hl7apy

- Its [README](https://github.com/crs4/hl7apy#readme) lists parsing, creation, validation following
  the HL7 XSD specifications, access to elements by name, long name or position, message profiles,
  Z elements, MLLP encoding and a simple MLLP server, for HL7 v2.1 to v2.8.2.
- Its [tutorial](https://github.com/crs4/hl7apy/blob/develop/docs/tutorial/index.rst) describes two
  validation levels. `STRICT` checks each child's name, each child's cardinality and value
  constraints, and raises an exception. `TOLERANT` skips those checks; `validate()` then checks the
  element and can write a report of the errors and warnings it found.
- Streaming input and XML encoding are not described.
- Licence: MIT, per its README. Activity: the last commit on its default branch, `develop`, is dated
  2026-10-26, the same day it published the pre-release v1.4.0-beta.1; its latest full release,
  v1.3.5, was published on 2024-03-13 ([releases](https://github.com/crs4/hl7apy/releases)).

## Choosing

- You need to send and receive over MLLP as well as parse, in Node.js: pair us with
  [`@cosyte/mllp`](https://docs.cosyte.com/mllp), or choose a library that carries both, such as
  node-hl7-client or Medplum.
- You need the XML encoding, or a model of a given version's structures: HAPI on Java or nHapi on
  .NET.
- You build messages for one version and want each field checked against that version's tables
  as you build: node-hl7-client's typed builders.
- You consume traffic from many vendors in Node.js or TypeScript and want every tolerated deviation
  reported rather than thrown or hidden, typed views after a type check, and structure checks on
  the messages you receive: that is what we built this library for.

## Put it to use

- [Tolerance and error handling](./tolerance-and-errors.md)
- [Read patient, visit and message details](./read-patient-and-visit.md)
- [Validate a message's structure and content](./validate-messages.md)
- [Read messages and segments as they arrive](./read-as-it-arrives.md)
- [Split batches and stream large files](./split-batches-and-streams.md)
