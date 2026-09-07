---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "Common surprises when parsing vendor-quirky HL7 v2: warnings versus errors, strict mode, the fatal codes, garbled text, batches and known limitations."
---

# Troubleshooting

`@cosyte/hl7` follows Postel's Law: the parser is **liberal** (tolerate and warn), the serializer is
**conservative** (always spec-clean). Most surprises come from that split. This page covers the
common ones, then the [Known Limitations](#known-limitations) you should design around.

## "I got warnings, not an error"

That's the default and it's intentional. A vendor quirk becomes a **tolerance warning** on
`msg.warnings`. The parse still succeeds. Each warning carries a stable code you can branch on:

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// A ZZZ segment isn't a known HL7 segment: tolerated, surfaced as a warning.
const raw = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rZZZ|1";

const msg = parseHL7(raw);

msg.warnings.some((w) => w.code === "UNKNOWN_SEGMENT"); // => true
```

The 20 warning codes are a **public, versioned contract**. They won't be renamed under you without a
breaking change. See [Warning and fatal codes](./warning-and-fatal-codes.md) for what each one
means.

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

Four **fatal** structural codes throw regardless of mode. They mean the input isn't recoverable as
HL7 at all: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, and `EMPTY_INPUT`.

```ts runnable throws
import { parseHL7 } from "@cosyte/hl7";

// No MSH, no message: fatal even in the default lenient mode.
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
  // each entry is an ok/failure record: a bad message never suppresses the rest
}
```

## Known limitations

Design around these. They're deliberate scope choices, not bugs:

- **Vendor profiles are structural and evidence-grounded.** Built-ins ship for Epic, Cerner,
  Meditech, Athena, a generic lab, and the Visage 7 and Philips Vue PACS imaging systems. A vendor
  "quirk" is encoded **only** when a real document grounds it: a publicly published vendor interface
  spec (as with Visage 7 and Philips Vue PACS) or a real de-identified feed, never invented, so
  broader per-vendor coverage expands as grounded sources arrive rather than shipping speculative rules.
- **A miscased segment name resolves, but is not rewritten.** A sender shipping `pid` or `obx`,
  which no segment identifier in the HL7 v2 standard does, is matched by `msg.segments("PID")`, `msg.patient`,
  `observations()` and `msg.get("PID.5")`, and reports `SEGMENT_CASE`. The comparison folds
  **ASCII** case only, so a non-ASCII lookalike (a dotless Turkish `ı`) is deliberately _not_
  folded into `PID` and surfaces as `UNKNOWN_SEGMENT` instead: guessing there would invent a
  patient identity the sender never sent. Three consequences worth designing around: the spelling
  that arrived is preserved on `RawSegment.name` and is what `toString()` re-emits, so the
  round-trip stays byte-exact rather than being silently corrected; a lowercase **`msh`** is
  still the `NO_MSH_SEGMENT` fatal, because MSH is what delimiter discovery reads before any
  segment name exists to fold; and folding necessarily widens the set of malformed lines that
  can be read as a segment at all, so an unescaped line break whose next three characters happen
  to spell a segment name in **any** case (`dg1` as well as `DG1`) yields an empty entry in the
  matching helper. That is the same three-character residue the bounded-messages note below
  describes, and the reason to treat a message carrying unescaped breaks as suspect rather than
  as data.
- **No terminology validation, no network, no bundled codesets.** `codingSystem()` reports what a
  code _claims_ (HL7 Table 0396). It does not validate a value against LOINC, SNOMED CT, RxNorm, or
  any external system, and nothing here makes a network call.
- **One ACK acknowledges one message.** Batch-level ACK reconciliation is out of scope; for MLLP
  transport framing and ACK correlation over the wire, use the sibling package
  [`@cosyte/mllp`](https://github.com/cosyte/mllp).
- **Datetimes are fidelity values, not eager `Date`s.** `TS` fields preserve the raw string and a
  `precision` so timezone and precision are never silently lost; convert to a `Date` explicitly when
  you need one.
- **`Hl7ParseError.snippet` is the field to redact first.** It carries up to 40 characters of raw
  input verbatim and the library never redacts it, so scrub it at your logging edge. Under
  `{ strict: true }` the escalated error carries a `snippet` of the first 40 characters of the input,
  so it remains the field to redact on that path too.
- **Warning and error _messages_ are bounded, but not absolutely content-free.** A token lifted from
  the input is echoed **only when it matches the form the spec defines for it**: a three-character
  segment identifier, an MSH-9 type, an MSH-12 version, or a charset label the closed Table 0211
  actually contains. Anything else becomes `<withheld>`. That is what stops an unescaped line break
  inside a narrative field, which HL7 v2 requires to be sent as `\.br\` and which real senders send
  raw anyway, from forging a "segment identifier" out of a line of clinical text. A message cannot
  carry a field's value, but it can carry a residue of up to three characters when a malformed line
  happens to look like a segment identifier, so prefer logging `w.code` and `w.position` over
  `w.message` if your posture is strict.
- **Pre-alpha on the `0.0.x` ladder.** The 20 warning codes are a stable contract, but the broader
  surface may still evolve before a 1.0. For the published version, ask the registry
  (`npm view @cosyte/hl7 version`) rather than a doc page.

## Still stuck?

Open an issue at [github.com/cosyte/hl7/issues](https://github.com/cosyte/hl7/issues) with a
**synthetic** (never real-PHI) message that reproduces it.
