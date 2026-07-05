---
id: spec-notes-nte
title: Spec notes — NTE narrative grouping (Phase P)
sidebar_label: NTE narrative grouping
---

# Spec notes — NTE narrative grouping (Phase P)

NTE (Notes and Comments) segments are surfaced on the helper output for the
**entity they annotate**, resolved **by position**. A lab result note lands on
that observation, an order note on the order, a patient note on the patient, and
a note with no recognized parent at the message level — never dropped, never
mis-attached.

> **hl7 attaches notes _positionally_; it never _guesses_.** An NTE inherits its
> meaning entirely from the segment it immediately follows (HL7 v2 Ch. 2 — the
> NTE has **no link field**). A note silently attached to the wrong result, or
> dropped, is a clinical-narrative loss. When the nearest preceding non-NTE
> segment is not a recognized parent, the note is surfaced **message-level**,
> not attached to an unrelated earlier parent.

## Spec traceability

HL7 v2 Chapter 2 (control) + Chapter 7 (observation reporting):

- **NTE — Notes and Comments (Ch. 2).** A general-purpose segment whose meaning
  is defined by the **parent context** — each chapter specifies what an NTE means
  where it appears. It carries no field linking it to a parent, so attachment is
  **positional**: an NTE annotates the entity whose segment immediately precedes
  it.
- **NTE-3 Comment (FT), repeating [S-NTE].** The note body. Each non-empty
  repetition is surfaced as one note line, HL7-unescaped (so `\F\` → `|`,
  `\T\` → `&`, and the FT line-break escape `\.br\` → newline). The **full**
  repetition text is preserved: a lenient parser tokenizes a non-conformant raw
  `^` / `&` in the FT narrative into components/subcomponents, so the library
  reassembles all of them (unescape each leaf, rejoin with the literal
  delimiters) rather than reading only the first — a truncated clinical note
  reads as complete and is worse than a dropped one. Both the conformant
  (`mass 2\S\3 cm`) and quirky (`mass 2^3 cm`) forms yield the same text. NTE-1
  (Set ID), NTE-2 (Source of Comment, Table 0105), and NTE-4 (Comment Type,
  Table 0364) are **not** modelled — only NTE-3 text is surfaced.
- **ORU_R01 placement (Ch. 7).** The abstract message grammar is
  `{ [ORC] OBR [{NTE}] [{ [OBX] [{NTE}] }] }`: an NTE after `OBR` is
  **order-level**, an NTE after `OBX` is **that-result-level**. An NTE after
  `PID` annotates the **patient**; an NTE after `ORC` annotates the **order**
  (ORC and OBR both denote the common order).

Primary sources: HL7 v2.5.1 Ch. 2 NTE definition
(`https://www.hl7.eu/HL7v2x/v251/std251/ch02.html`), HL7 v2.5.1 Ch. 7 ORU
(`https://www.hl7.eu/HL7v2x/v251/std251/ch07.html`), v2plus NTE segment
reference (`http://v2plus.hl7.org/2021Jan/segment-definition/NTE.html`).

## Positional grouping — nearest preceding non-NTE segment

A single walk over `msg.allSegments()` resolves every NTE to a parent:

- The **recognized parents** are `PID`, `ORC`, `OBR`, and `OBX`. An NTE attaches
  to the most recent one it follows.
- **Consecutive NTEs chain** to the same parent (`OBX NTE NTE` → both on that
  observation, in order).
- **Any intervening non-NTE, non-parent segment resets the target.** After
  `PID NTE PV1 NTE`, the first note is the patient's but the second — whose
  nearest preceding non-NTE segment is `PV1` (not a recognized parent) — is
  surfaced **message-level**, not attached to the earlier `PID`. This is the
  fail-safe: the library never reaches back past an unrelated segment to guess a
  parent.
- Notes are keyed by **segment reference**. `observations()`, `orders()`, and
  `buildPatient()` look up a parent's notes from the same referentially-stable
  `Segment` instances that `msg.segments(type)` / `allSegments()` return from one
  shared cache — so a note surfaced via `msg.observations()` is identical to the
  one under `order.observations`.

Order-level notes are handled to mirror the `orders()` state machine: notes seen
after an `ORC` (before its OBR) are **buffered and flushed onto the OBR** that
opens the order — so `order.notes` reads as a single document-ordered list (the
ORC-region notes ahead of the OBR-region notes), and **several `ORC`s before one
`OBR` all contribute** rather than only the last. Result-level notes live on each
`Observation`, not on the order. Message-level orphans are read via `msg.notes()`.

**Never dropped, even when a parent's projection is dropped.** A note whose
recognized parent has no surfaced helper output is routed to `msg.notes()` rather
than vanishing: (1) a **later PID**'s notes in a multi-patient ORU (`msg.patient`
is the first PID only), and (2) a **trailing or dangling `ORC`** whose order
never opens (no following OBR). Both are surfaced at message level — never lost,
never mis-attached to the first patient or a neighbouring order.

## Known limitations / non-goals

- **Positional grouping only.** The library does not interpret NTE-2 (source of
  comment) or NTE-4 (comment type), and does not render FT formatting commands
  beyond the standard escape set (`\.br\` becomes a newline; other formatting
  escapes pass through `Field.value` unescaping unchanged). It does not parse
  note prose.
- **Recognized parents are `PID` / `ORC` / `OBR` / `OBX`.** An NTE following any
  other segment (e.g. `PV1`, `AL1`, `DG1`, `IN1`, a `Z`-segment) is surfaced
  message-level rather than attached — a conservative "not guessed" choice.
  First-class notes on those segments are a later candidate.
- **First PID only for `patient.notes`.** In a multi-patient ORU the patient view
  is the first `PID`. A later PID's notes are **not** surfaced through
  `msg.patient` (consistent with the single-patient helper model) — but they are
  never dropped or mis-attached: they surface at message level via `msg.notes()`.
- **Trailing / dangling `ORC`.** A note on an `ORC` that never opens an order (no
  following `OBR`) is surfaced at message level (`msg.notes()`), not on any
  order — never dropped. (This differs from `orderControl` (ORC-1), which
  `orders()` genuinely drops for such an ORC; the note is preserved rather than
  discarded because losing clinical narrative is the failure this phase guards
  against.)
- **No new warning code.** Phase P is a pure additive read surface; it emits no
  warning of its own. NTE free-text is high-PHI-risk clinical narrative and is
  treated purely as payload — no warning or log line echoes note text.
