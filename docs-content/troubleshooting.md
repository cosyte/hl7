---
id: troubleshooting
title: Troubleshooting
sidebar_position: 1
---

# Troubleshooting

`@cosyte/hl7` follows Postel's Law: the parser is **liberal** (tolerate and warn), the serializer is
**conservative** (always spec-clean). Most surprises come from that split. This page covers the
common ones, then the [Known Limitations](#known-limitations) you should design around.

## "I got warnings, not an error"

That's the default and it's intentional. A vendor quirk becomes a **tolerance warning** on
`msg.warnings` — the parse still succeeds. Each warning carries a stable code you can branch on:

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// A ZZZ segment isn't a known HL7 segment — tolerated, surfaced as a warning.
const raw = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rZZZ|1";

const msg = parseHL7(raw);

msg.warnings.some((w) => w.code === "UNKNOWN_SEGMENT"); // => true
```

The 19 warning codes are a **public, versioned contract** — they won't be renamed under you without a
breaking change. See [Core Concepts](./spec-notes-primer) for what each one means.

## "I want failures, not warnings"

Pass `{ strict: true }`. Strict mode promotes every Tier-2 tolerance warning to a thrown
`Hl7ParseError`, so nothing quirky slips through silently:

```ts runnable throws
import { parseHL7 } from "@cosyte/hl7";

const raw = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rZZZ|1";

// The same input that warned above now throws under strict.
parseHL7(raw, { strict: true });
```

## "It threw even though I didn't ask for strict"

Four **fatal** structural codes throw regardless of mode — they mean the input isn't recoverable as
HL7 at all: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, and `EMPTY_INPUT`.

```ts runnable throws
import { parseHL7 } from "@cosyte/hl7";

// No MSH, no message — fatal even in the default lenient mode.
parseHL7("");
```

Catch `Hl7ParseError` and read its `code` to distinguish them. Everything _else_ is a warning.

## "Non-ASCII text comes out garbled"

Character set is declared in **MSH-18** (HL7 Table 0211). The parser resolves it and decodes
accordingly; `resolveCharset` / `canonicalCharset` let you inspect how a given code is treated
(decoded vs. preserved) before you rely on it.

## "A batch/file won't parse"

`parseHL7` parses **one** message. For an `FHS`/`BHS`-led batch or file envelope, use `splitBatch`,
which demarcates the individual MSH-led messages, parses each independently (a malformed message is
isolated, never dropping its siblings), and reconciles the declared `BTS-1`/`FTS-1` counts:

```ts
import { splitBatch } from "@cosyte/hl7";

const result = splitBatch(rawBatch);
for (const entry of result.messages) {
  // each entry is an ok/failure record — a bad message never suppresses the rest
}
```

## Known limitations

Design around these — they're deliberate scope choices, not bugs:

- **Vendor profiles are structural and evidence-grounded.** Built-ins ship for Epic, Cerner,
  Meditech, Athena, a generic lab, and the Visage 7 and Philips Vue PACS imaging systems. A vendor
  "quirk" is encoded **only** when a real document grounds it — a publicly published vendor interface
  spec (as with Visage 7 and Philips Vue PACS) or a real de-identified feed — never invented, so
  broader per-vendor coverage expands as grounded sources arrive rather than shipping speculative rules.
- **No terminology validation, no network, no bundled codesets.** `codingSystem()` reports what a
  code _claims_ (HL7 Table 0396) — it does not validate a value against LOINC, SNOMED CT, RxNorm, or
  any external system, and nothing here makes a network call.
- **One ACK acknowledges one message.** Batch-level ACK reconciliation is out of scope; for MLLP
  transport framing and ACK correlation over the wire, use the sibling package
  [`@cosyte/mllp`](https://github.com/cosyte/mllp).
- **Datetimes are fidelity values, not eager `Date`s.** `TS` fields preserve the raw string and a
  `precision` so timezone and precision are never silently lost; convert to a `Date` explicitly when
  you need one.
- **Error `snippet`s may carry field content (PHI) by design.** Warning _messages_ never echo a
  field's value — only positional context — but a fatal `Hl7ParseError.snippet` may include the
  offending bytes. That's the documented consumer-redaction boundary: redact `snippet` at your
  logging edge.
- **Pre-alpha (`0.0.x`), unpublished.** The 19 warning codes are a stable contract, but the broader
  surface may still evolve before a 1.0.

## Still stuck?

Open an issue at [github.com/cosyte/hl7/issues](https://github.com/cosyte/hl7/issues) with a
**synthetic** (never real-PHI) message that reproduces it.
