---
"@cosyte/hl7": patch
---

NTE narrative grouping — notes attached to their parent by position (roadmap Phase P).

**NTE** (Notes and Comments) segments are now grouped to their parent **by position** and surfaced on
the relevant helper output, so a lab narrative note lands on the **right** entity rather than floating
free. An NTE inherits its meaning entirely from the segment it immediately follows (HL7 v2 Ch. 2 — the
NTE carries no link field), so attachment is purely positional: in an ORU the grammar is
`{ [ORC] OBR [{NTE}] [{ [OBX] [{NTE}] }] }` (Ch. 7). Recognized parents and where their notes surface:

- **`OBX` → that result** — `observation.notes` (and the same under `order.observations`).
- **`OBR` / `ORC` → the order** — `order.notes` (ORC notes first, then OBR, in document order).
- **`PID` → the patient** — `msg.patient.notes`.
- **No recognized preceding parent** (after `MSH`, or after an unsupported segment like `PV1`/`AL1`)
  → **message-level** `msg.notes()`.

**Fail-safe — never mis-attached, never dropped.** The parent is the _nearest preceding non-NTE
segment_; consecutive NTEs chain to the same parent, and any intervening non-parent segment resets the
target, so an orphan note is surfaced verbatim at message level (`msg.notes()`), not guessed onto a
patient/order/result. Order-level notes mirror the `orders()` state machine — notes after an `ORC` are
buffered and flushed onto the OBR that opens the order, so **several `ORC`s before one `OBR` all
contribute** (in document order) rather than only the last. A note whose recognized parent has **no
surfaced projection** is routed to `msg.notes()` rather than vanishing: a **later `PID`**'s notes in a
multi-patient ORU (the patient view is the first PID) and a **trailing/dangling `ORC`** whose order
never opens. Each non-empty **NTE-3 (Comment, FT, repeating)** repetition is one note line — the
**full** repetition text is reassembled and HL7-unescaped, so a non-conformant raw `^`/`&` in the
narrative (which tokenizes NTE-3 into components) is preserved rather than silently truncated.

New surface: `msg.notes()` (message-level notes) plus an optional `notes?: readonly string[]` on
`Observation`, `Order`, and `Patient` (omitted when empty; frozen when present). **Additive only** — no
rename, no removal, **no new warning code**. Deferred (non-goals): NTE-2 (source of comment) and NTE-4
(comment type) interpretation, FT formatting-command rendering beyond the standard escape set, and
first-class `patient.notes` on a 2nd+ `PID`'s group (surfaced at message level instead). See
`docs-content/spec-notes-nte.md`.
