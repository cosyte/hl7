---
"@cosyte/hl7": patch
---

Batch / file envelope splitting — `splitBatch()` (roadmap Phase L).

`splitBatch(raw, optionsOrProfile?)` demarcates the individual `MSH`-led messages inside an HL7 v2
batch/file stream (`[FHS] { [BHS] { MSH… } [BTS] } [FTS]`, Ch. 2 §2.10.3) and returns each one parsed —
`{ ok: true, message }`, or `{ ok: false, error }` for a message that trips a Tier-3 fatal. A malformed
message mid-batch is **isolated**, never suppressing its siblings; a bare single message (no envelope)
passes straight through. Declared counts are reconciled — **BTS-1** batch message count against the
messages found, **FTS-1** file batch count against the batches found — surfacing a new
`BATCH_COUNT_MISMATCH` warning **without ever dropping the tail** (an absent `[0..1]` or non-numeric
count tolerantly disables reconciliation). A `BHS`/`FHS` with no matching `BTS`/`FTS` raises the new
`BATCH_MISSING_TRAILER` warning — `splitBatch` warns but never rejects (enforcing a mandatory envelope
is the caller's decision). Batch-level warnings live on the returned `BatchSplitResult.warnings`, never
on `Hl7Message.warnings`, and carry counts / segment names / positions only — **no PHI**. A `Buffer`
stream round-trips through `latin1` so each message's own MSH-18 charset resolution runs on its
original bytes.

Kept a **separate surface** from `parseHL7` (a single-message parser rejects non-`MSH`-first input by
design). New public exports: `splitBatch`, the `batchCountMismatch` / `batchMissingTrailer` factories,
and types `Batch` / `BatchSplitResult` / `BatchMessageEntry` / `BatchEnvelopeSegment` /
`BatchEnvelopeName`. **Two additive Tier-2 warning codes** (`BATCH_COUNT_MISMATCH`,
`BATCH_MISSING_TRAILER`) — the stable warning-code contract grows 16 → 18 (additive, no rename).

`batches` holds each message run delimited by a `BHS` header and/or a `BTS` trailer (both optional in
§2.10.3, so a `BTS` closes a preceding run into a batch even with no `BHS`); a run with neither is still
yielded in `messages` (the complete surface) but wrapped in no batch, so it never inflates the FTS-1
denominator. FTS-1 reconciliation is **per-file** — a concatenated second `FHS` resets the batch count,
so two individually-conformant files raise no false mismatch. Split-only by design: no batch ACK
generation, no envelope enforcement, BTS-3 application-defined totals surfaced but not reconciled, no
transport de-framing (that is `@cosyte/mllp`). Two structural demarcation limits are documented: reserved
envelope names are matched by name (a message body literally containing `FHS`/`BHS`/`BTS`/`FTS` is
mis-split, its tail surfaced as a `NO_MSH_SEGMENT` failure entry — never silently dropped), and one file
envelope per stream is the modelled case (concatenated files are best-effort). See
`docs-content/spec-notes-batch.md`.
