---
id: spec-notes-batch
title: "Spec notes: batch / file envelope splitting (Phase L)"
sidebar_label: Batch & file envelopes
---

# Spec notes: batch / file envelope splitting (Phase L)

`splitBatch(raw, optionsOrProfile?)` demarcates the individual `MSH`-led
messages inside an HL7 v2 **batch / file** stream and hands each one back
already parsed (or, if it hit a fatal, as a typed failure entry). Real lab /
ELR / IIS feeds routinely ship many messages wrapped in the batch envelope,
and `parseHL7` rejects non-`MSH`-first input outright (correct for a
single-message parser). So batch demarcation is a **separate surface**.

## Why a splitter, not a parser option

The single-message parser's contract is "first segment is `MSH`". A batch file
starts with `FHS` or `BHS`. Folding batch handling into `parseHL7` would either
weaken that invariant or silently swallow the envelope. Keeping `splitBatch`
separate preserves both contracts: `splitBatch` finds the message boundaries,
then delegates each message to `parseHL7` unchanged (forwarding your profile /
`strict` / `charset` / `dateFormats`).

## Spec traceability

HL7 v2 Chapter 2, the batch protocol:

- **§2.10.3 (abstract syntax):** `[FHS] { [BHS] { [MSH …] } [BTS] } [FTS]`.
  **Every envelope segment is optional**; the braces repeat (a file holds many
  batches; a batch holds many messages). `splitBatch` models exactly this: an
  optional file header/trailer and the `MSH`-led messages between them. A
  **batch** is a run of messages delimited by a `BHS` header **and/or** a `BTS`
  trailer: both are optional, so a `BTS` closes the preceding run into a batch
  even with no `BHS`. A run of messages with **neither** a header nor a trailer
  is not a batch: those messages are still yielded in `messages` but belong to no
  entry in `batches` (see "What is isolated" below).
- **§2.15, BTS (batch trailer):** **BTS-1** batch message count (**optional,
  `[0..1]`**), BTS-2 comment, **BTS-3** batch totals (repeating, NM).
- **§2.15, FTS (file trailer):** **FTS-1** file batch count.
- **§2.10.3.3, acknowledging batches:** three modes (ack-all / manual control
  report / ack-errored-only) on an **exception basis**. Batch ACK is **out of
  scope** for the splitter (see non-goals).

Real-world grounding (all verified 3-0 in the Phase-L research pass):

- **National CDC/APHL ELR** makes batching **optional**: the Lab-to-EHR
  profile defines no envelope. A bare message must therefore pass straight
  through, and a batch with no counts must not be second-guessed.
- **IIS file submission** (e.g. Texas ImmTrac2 FTP) **mandates** the full
  `FHS/BHS…BTS/FTS` frame and rejects a file on any missing header/trailer.
  `splitBatch` **surfaces** a missing trailer (`BATCH_MISSING_TRAILER`) but does
  **not** reject: enforcing a profile's mandatory-envelope rule is the caller's
  decision.

## Count reconciliation (fail-safe)

`splitBatch` reconciles the two **well-defined** declared counts against what it
actually split:

| Declared                      | Reconciled against     | On mismatch                             |
| ----------------------------- | ---------------------- | --------------------------------------- |
| **BTS-1** batch message count | messages in that batch | `BATCH_COUNT_MISMATCH` (unit `message`) |
| **FTS-1** file batch count    | batches in the file    | `BATCH_COUNT_MISMATCH` (unit `batch`)   |

The mismatch is **surfaced, never repaired**: every message is still returned.
The splitter never drops the tail to make the numbers agree. A count that is
**absent** (BTS-1 is `[0..1]`) or **non-numeric** tolerantly disables
reconciliation rather than fabricating a mismatch.

Both new warnings live on the returned `BatchSplitResult.warnings` (**never**
on `Hl7Message.warnings`) and carry only integers / segment names / positions.
**No PHI**: envelope headers carry facility/app identifiers, but the warnings
never echo a field value.

A few structural edges are handled so they neither drop data nor fabricate a
false signal:

- **FTS-1 reconciliation is per-file.** A concatenated second `FHS` resets the
  batch count, so two individually-conformant files do **not** raise a false
  `BATCH_COUNT_MISMATCH`.
- **A lone `BTS` closing nothing** (no messages, no `BHS`) is ignorable noise:
  it creates no phantom empty batch and no fabricated mismatch. Note the
  deliberate asymmetry: an **empty `BHS`-opened batch** (a header with no
  messages) _is_ a batch and counts toward FTS-1: a `BHS` explicitly opens one,
  whereas a lone trailer opens nothing.
- **A trailing blank line** immediately before a boundary is inter-message
  whitespace, not part of the message (`parseHL7` likewise strips a single
  trailing CR); interior empty segments are preserved, so each message's `raw`
  re-parses to exactly the segments the entry reports.
- **A missing _trailer_ warns** (`BATCH_MISSING_TRAILER`) because content after a
  truncation point may be lost; a missing _header_ does **not** warn: nothing is
  lost by a `BTS`/`FTS` that closes an un-opened scope.

## What is isolated, surfaced: never silently discarded

`splitBatch` never _silently_ loses content: anything it cannot place in a
well-formed message comes back as a typed **failure entry** in `messages`.

- A **malformed message mid-batch** (one that trips a Tier-3 fatal: no `MSH`,
  truncated `MSH`, bad encoding characters, or, under `strict`, a promoted
  warning) is returned as `{ ok: false, error, raw, position }`. Its siblings
  before **and after** it still come back. This is the headline property:
  _a mid-stream failure never suppresses a later message._
- **Stray content before the first `MSH`**, and the **severed tail** of a
  message that (malformedly) contained a reserved envelope name mid-body (see
  the reserved-name limitation below), is preserved as a `NO_MSH_SEGMENT`
  failure entry: kept and surfaced, never discarded.
- **A message delimited by neither a `BHS` nor a `BTS`** (a bare stream, or
  content before the first `BHS` that is not closed by a `BTS`) is still yielded
  in `messages`: it simply belongs to no entry in `batches` (which holds each
  run delimited by a `BHS` and/or a `BTS`). `messages` is the complete surface;
  `batches` is the envelope structure over it.
- A `Buffer` stream is decoded/re-encoded via **`latin1`** (a lossless 1:1
  byte↔codepoint mapping) so each message's own **MSH-18 charset** resolution
  runs on its original bytes, not a stream-wide guess.

## Known limitations / non-goals

`splitBatch` is a **splitter**, deliberately narrow. Two of these are structural
demarcation limits worth calling out explicitly:

- **Reserved envelope names are matched by name (case-sensitive).** A batch
  stream is a flat `\r`-delimited segment sequence; §2.10.3 disambiguates an
  envelope segment from a body segment by **position in the nesting**, which in
  a flat stream reduces to "a line named `FHS`/`BHS`/`BTS`/`FTS` is a boundary."
  Those names are **reserved** (a conformant message body never contains one)
  so this is correct for well-formed input. But a (malformed) message whose body
  literally contains a segment named `FHS`/`BHS`/`BTS`/`FTS` **will be
  mis-split** at that line; the severed tail surfaces as a `NO_MSH_SEGMENT`
  failure entry (never dropped). Matching is **case-sensitive** on purpose: a
  lenient lowercase `bts` in a body is left in the message rather than mistaken
  for a boundary (a lowercase `msh`-led "message" is not parseable anyway, so
  declining to treat it as a boundary loses nothing).
- **One file envelope per stream is the modelled case.** §2.10.3's abstract
  syntax is a single `[FHS] … [FTS]`. Concatenated files (a second `FHS`) are
  handled **best-effort**: batch demarcation, the flattened `messages`, and
  **per-file** FTS-1 reconciliation are all correct (a second `FHS` resets the
  batch count, so two individually-conformant files do **not** raise a false
  `BATCH_COUNT_MISMATCH`), but the single-valued `fileHeader` / `fileTrailer` /
  `declaredBatchCount` result fields reflect the **first** header / **last**
  trailer / **last** FTS-1. Inspect `batches` and `warnings` for the full
  multi-file picture.
- **No batch ACK generation.** §2.10.3.3's three acknowledgement modes are not
  implemented; the splitter only demarcates and reconciles.
- **No envelope enforcement.** A profile may _mandate_ the full frame (IIS); the
  splitter **warns** (`BATCH_MISSING_TRAILER`) and leaves accept/reject to the
  caller.
- **BTS-3 batch totals are surfaced, not reconciled.** BTS-3 is an
  application-defined repeating total (a checksum/sum whose meaning the sender
  chooses). There is no generic "actual" to compare it to, so fabricating a
  comparison would be a confidently-wrong answer. The raw BTS field tokens are
  available on `batch.trailer.fields`; computing/validating an application total
  is the consumer's job.
- **No typed FHS/BHS field helpers** beyond the raw token array
  (`envelopeSegment.fields`). First-class file/batch-header accessors are a
  later candidate.
- **No transport de-framing.** Splitting messages out of an MLLP byte stream is
  `@cosyte/mllp`'s job, not this one.
- **Multi-byte charset framing.** A `Buffer` stream is line-ending-normalized at
  the stream level (its `\r`/`\n` framing bytes are ASCII) before each message is
  re-decoded with its own MSH-18 charset. This is byte-exact for the single-byte
  / ASCII-superset charsets HL7 batch framing requires (UTF-8, ISO-8859-x,
  Shift-JIS), but not for a multi-byte charset (e.g. UTF-16) whose payload embeds
  raw `0x0A`/`0x0D` bytes: such batch files effectively do not exist, but the
  framing assumption is worth stating.

## MSH-family field indexing (a gotcha)

`BatchEnvelopeSegment.fields` is the segment split on its own field separator,
with `fields[0]` holding the segment name. Mind the HL7 MSH-family quirk:

- **`FHS` / `BHS`** mirror `MSH`: field 1 is the field separator itself, so
  `fields[1]` is the **encoding-characters** field (FHS-2/BHS-2).
- **`BTS` / `FTS`** are ordinary segments: `fields[1]` is **field 1**
  (BTS-1 batch message count / FTS-1 file batch count).

`declaredMessageCount` (from BTS-1) and `declaredBatchCount` (from FTS-1) are
parsed for you, so most callers never touch the raw `fields` at all.
