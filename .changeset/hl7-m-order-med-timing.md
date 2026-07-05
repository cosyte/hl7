---
"@cosyte/hl7": patch
---

Order / medication timing — `order.timings` + `med.timings` (roadmap Phase M).

`orders()` and `medications()` now surface the timing **structure** of an order/medication as a typed
`OrderTiming[]` — read from the `TQ1` segment (HL7 v2.5+, Ch. 4 §4.5.4) or the **legacy embedded TQ**
data type in `ORC-7` / `RXE-1` (pre-v2.5, Ch. 2A §2.A.81, detail withdrawn as of v2.7). Modelled:
TQ1-2 quantity (CQ), **TQ1-3 repeat pattern (RPT, Table 0335)**, TQ1-4 explicit time, TQ1-6 service
duration, TQ1-7/-8 start/end (DTM → Phase N fidelity `TS`), TQ1-9 priority (CWE), and **TQ1-14 total
occurrences (NM) — not TQ1-11** (which is the Text Instruction).

**Safety contract.** The repeat pattern is surfaced **verbatim** (`repeatPattern.code`) — never
normalized, never resolved to clock times, never mapped to a different frequency (reading `Q6H` as
"daily", or losing a `BID`, changes the administered dose count — a transcription-class harm). A
provenance-only `kind` (`parametric` / `named` / `unknown`) classifies the code without ever driving a
schedule; a `parametric` `Q<integer><unit>` template surfaces its **load-bearing integer** on
`repeatPattern.interval` (`{ count, unit }`), never dropped. The helper never throws (HELPERS-07) — a
malformed timing surfaces as omitted keys. hl7 surfaces the timing structure only; it does **not**
compute administration schedules, resolve "institution-specified times", or interpret sig.

**TQ1 vs legacy is chosen by presence, not `MSH-12`.** Every `TQ1` yields one timing
(`source: "TQ1"`); the legacy embedded TQ is read **only when the group carries no `TQ1`**
(`source: "legacy"`) — so the same timing is never double-counted and a legacy-only (pre-2.5) timing
is never dropped. The legacy source is `ORC-7` for an `orders()` group; for a `medications()` group it
is `RXE-1` or, failing that, the preceding `ORC`'s `ORC-7` (so a pre-v2.5 `RXO` pharmacy order whose
timing lives in `ORC-7`, with no `OBR`, is still surfaced) — consumed by only the first RX\* of an ORC
group so `ORC RXO RXE` never double-surfaces it. Timings group positionally (a `TQ1` may sit either
side of the order detail; an intervening `ORC` re-scopes a following `TQ1` to the next order rather than
the still-open prior one; multiple `TQ1` segments each surface — a tapering schedule is several timings).

New public types: `OrderTiming`, `RepeatPattern`, `RepeatPatternKind`, `TimingQuantity`; `Order` and
`Medication` gain an always-present `timings` array. **Additive only** — no rename, no removal, **no new
warning code**. Deferred (non-goals): `TQ2` (timing relationship) beyond segment recognition, schedule
computation, sig interpretation, and 2nd+ repetitions of repeating timing fields. See
`docs-content/spec-notes-timing.md`.
