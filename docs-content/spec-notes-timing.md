---
id: spec-notes-timing
title: Spec notes — order / medication timing (Phase M)
sidebar_label: Order & medication timing
---

# Spec notes — order / medication timing (Phase M)

`order.timings` and `med.timings` surface the **timing structure** of an order or
medication — how often, how many, when it starts/ends — from the `TQ1` segment
(HL7 v2.5+) or the **legacy embedded TQ** data type in `ORC-7` / `RXE-1`
(pre-v2.5). Each entry is an `OrderTiming`.

> **hl7 surfaces the timing _structure_; it never _interprets_ it.** It does
> **not** compute an administration schedule, resolve "institution-specified
> times" (`BID`, `QHS`) to clock times, or interpret sig. The repeat pattern is
> surfaced **verbatim** — reading `Q6H` as "daily", or silently dropping a
> `BID`, changes the administered dose count, a transcription-class harm.

## Spec traceability

HL7 v2 Chapter 4 (order entry) + Chapter 2A (data types):

- **TQ1 — Timing/Quantity (§4.5.4), introduced v2.5.** The dedicated timing
  segment. Modelled fields:
  - **TQ1-2 Quantity (CQ)** → `quantity` — the service quantity per occurrence
    (`{ value, units }`).
  - **TQ1-3 Repeat Pattern (RPT, Table 0335)** → `repeatPattern` — the
    frequency/SIG field, surfaced **verbatim** (see below). RPT.1 (the code)
    is read.
  - **TQ1-4 Explicit Time (TM)** → `explicitTime` (verbatim, first value).
  - **TQ1-6 Service Duration (CQ)** → `serviceDuration` (verbatim).
  - **TQ1-7 Start Date/Time (DTM)** → `startDateTime` (Phase N fidelity `TS`).
  - **TQ1-8 End Date/Time (DTM)** → `endDateTime` (Phase N fidelity `TS`).
  - **TQ1-9 Priority (CWE)** → `priority`.
  - **TQ1-14 Total Occurrences (NM)** → `totalOccurrences`. **This is TQ1-14,
    _not_ TQ1-11** — TQ1-11 is the Text Instruction (TX). The load-bearing total
    is read from field 14; a text instruction in field 11 is never mistaken for
    the count.
- **TQ2 — Timing/Quantity Relationship (§4.5.5)** links related orders. **Not
  modelled** (see non-goals) — `TQ2` remains a recognized segment name only.
- **Legacy embedded TQ (Ch. 2A §2.A.81)**, carried in **`ORC-7`** (orders) and
  **`RXE-1`** (encoded medications). Retained backward-compat only; **detail
  withdrawn as of v2.7**, which redirects to `TQ1`/`TQ2`. The old `TQ` data type
  packs the whole timing into one field's components:
  - TQ.1 Quantity (CQ) → `quantity`
  - TQ.2 Interval (RI): RI.1 repeat pattern → `repeatPattern`, RI.2 explicit
    time → `explicitTime`
  - TQ.3 Duration → `serviceDuration`
  - TQ.4 / TQ.5 Start / End (TS) → `startDateTime` / `endDateTime`
  - TQ.6 Priority (ID) → `priority` (surfaced as a CWE `{ identifier }`)
  - TQ.12 Total Occurrences (NM) → `totalOccurrences`

Primary sources: HL7 v2.5.1 Ch. 4 (`https://www.hl7.eu/HL7v2x/v251/std251/ch04.html`),
HL7 v2.7 Ch. 4 (legacy-`TQ` withdrawal, `https://www.hl7.eu/HL7v2x/v27/std27/ch04.html`),
Table 0335 Repeat Pattern (OID `2.16.840.1.113883.18.205`), Caristix TQ1 field
reference (`https://hl7-definition.caristix.com/v2/HL7v2.5/Segments/TQ1`).

## Repeat pattern — verbatim, classified for provenance only

`repeatPattern` carries the Table-0335 code **exactly as authored** in `code` —
never normalized, never resolved to clock times, never mapped to a different
frequency. Alongside it, a **provenance-only** `kind` tells a consumer _what
kind_ of pattern it is looking at; `code` always remains authoritative:

| `kind`         | Meaning                                                                   | `interval`?                           |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| `"parametric"` | a `Q<integer><unit>` template — `Q6H`, `Q30M`, `Q2D`, `Q1W`, `Q3J5`       | `{ count, unit }` — **never dropped** |
| `"named"`      | a recognized fixed mnemonic — `BID`, `TID`, `QID`, `QOD`, `QHS`, `PRN`, … | omitted                               |
| `"unknown"`    | anything else (a local code, free text, an unrecognized mnemonic)         | omitted — surfaced **verbatim**       |

Table 0335 deliberately **mixes** fixed enumerated codes (scheduled at
institution-specified times) with **parametric templates** whose **integer is
load-bearing** — `Q6H` (every 6 hours) is a different dose count from `Q8H`. The
`interval.count` is the parsed integer and is **never dropped**; `code` still
holds the exact authored string (so `Q06H` keeps its leading zero). The `kind`
flag is convenience only — it is **never** used to resolve a schedule, and an
unrecognized pattern is surfaced verbatim rather than guessed.

## TQ1 vs legacy — chosen by presence (never double-counted, never dropped)

The library treats the **presence of a `TQ1` segment** as the v2.5+ structured-
timing signal:

- Every `TQ1` grouped under the order/medication yields one `OrderTiming`
  (`source: "TQ1"`).
- The **legacy** embedded TQ is read **only when the group carries no `TQ1`** →
  `source: "legacy"`. The source field is `ORC-7` for an `orders()` group; for a
  `medications()` group it is `RXE-1` (an encoded RXE order) or, failing that,
  the preceding `ORC`'s `ORC-7` (so a pre-v2.5 `RXO` pharmacy order whose timing
  lives in `ORC-7` — and which has no `OBR` to surface it via `orders()` — is not
  dropped). The `ORC-7` fallback is consumed by only the **first** RX\* of an ORC
  group, so an `ORC RXO RXE` group never double-surfaces the same `ORC-7` timing.

This is deliberately **presence-based, not `MSH-12`-version-based**: it is
fail-safe against a message that mis-declares its version, it never
**double-counts** the same timing when a modern sender redundantly fills both,
and it never **drops** a legacy-only (pre-2.5) timing. A malformed / non-numeric
field is tolerantly omitted, never fabricated (HELPERS-07 — never throws).

## Positional grouping

Timings attach to their order/medication group by document position, the same
state machine `orders()` uses for OBX→OBR and `medications()` for RXR→RX\*:

- A `TQ1` may appear **either side** of the order detail in a v2.5+ order group
  (some layouts place the timing group after `OBR`/`RXE`, others between `ORC`
  and it). A `TQ1` seen **within** an open group attaches to it; a `TQ1` seen
  before the group's opener is promoted to the next group.
- **An intervening `ORC` re-scopes the timing.** Once a new `ORC` begins the next
  order group, a following `TQ1` binds to that next group — never to the
  still-open prior order (so `ORC1 OBR1 ORC2 TQ1 OBR2` gives the `TQ1` to the
  OBR2 order, and OBR1 keeps its own `ORC1`/`ORC-7` timing).
- Multiple `TQ1` segments each surface (a tapering schedule — `40 mg BID`, then
  `20 mg QD` — is two timings).

## Known limitations / non-goals

- **No schedule computation.** hl7 surfaces the timing structure; it does not
  compute administration times, resolve "institution-specified times" to clock
  times, interpret sig text, or do dose-frequency safety logic.
- **`TQ2` (Timing/Quantity Relationship) is not modelled.** It links related
  orders (sequencing / conjunction across orders); only its segment name is
  recognized. First-class `TQ2` support is a later candidate.
- **First repetition of repeating timing fields.** TQ1-3 (RPT) and TQ1-4 (TM)
  are repeating; the first repetition (the common case) is surfaced. A message
  encoding several patterns in a single repeating TQ1-3 field surfaces the first;
  a tapering schedule authored as **separate `TQ1` segments** (the conformant
  form) is fully surfaced.
- **One legacy TQ per group.** The legacy `ORC-7` / `RXE-1` field is itself
  repeating; the first repetition is read. Multi-repetition legacy TQ is rare and
  not surfaced beyond the first.
- **CQ units depth.** TQ1-2 units (`CQ.2`, a CE) are surfaced as a `CWE`; the
  legacy embedded TQ's collapsed units subcomponent is surfaced as
  `{ identifier }`.
- **Numeric parsing follows the library `NM` convention.** `totalOccurrences`
  and `quantity.value` parse via `Number()` (the same strict-but-permissive rule
  every `field.asNm()` uses across the library) — a non-conformant `NM` string
  (`1e3`, `0x10`, `10.5`) yields that JS number rather than a warning. This is
  deliberately uniform with `medications()` amounts and `observations()`, not a
  timing-specific behavior; conformant integer `NM` values (the norm) are exact.
- **No new warning code.** Phase M is a pure additive read surface; it emits no
  warning of its own.
