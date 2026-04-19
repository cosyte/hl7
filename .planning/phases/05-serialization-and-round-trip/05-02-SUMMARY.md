---
phase: 05-serialization-and-round-trip
plan: 02
subsystem: serialization-to-string-and-round-trip
tags: [to-string, round-trip, ser-02-sweep, unescape-on-parse, tokenize-fix]
requires:
  - Phase 5 Plan 01 complete (src/serialize/emit-field.ts::{emitField, emitSegment} implemented; src/serialize/to-string.ts stub; Hl7Message.toString wired)
  - src/parser/escapes.ts::{unescape, reescape} (inverse pair)
  - src/parser/types.ts::{EncodingCharacters, RawField, RawSegment}
provides:
  - src/serialize/to-string.ts::emitMessage (FULLY IMPLEMENTED body — D-01 walk + D-06 MSH special-case + D-05 CR joins + D-07 pure)
  - src/serialize/to-string.ts::emitMshSegment (private helper, D-06 MSH inline emission)
  - src/parser/tokenize.ts unescape-on-parse (Option 1 fix — tokenizeComponent now runs every subcomponent through unescape, storing DECODED strings in rawSegments)
  - test/serialize-to-string.test.ts (23 tests — D-02 / D-03 / D-04 / D-05 / D-06 / D-07 / D-08 + W3 + W4 + tokenize-inverse)
  - test/round-trip.test.ts (15 tests — SER-02 structural-equivalence sweep + D-03 idempotency + specific preservation checks)
  - test/fixtures/round-trip/canonical-adt-a01.hl7 (clean ADT^A01 baseline)
  - test/fixtures/round-trip/oru-r01-repetitions.hl7 (ORU^R01 + PID-3 SSN~MRN + 3 OBX)
  - test/fixtures/round-trip/null-fields.hl7 (PID-2 / PID-9 / PID-10 explicit "" nulls)
  - test/fixtures/round-trip/embedded-delimiters.hl7 (PID-5 XPN with all 5 HL7 escape forms)
  - test/fixtures/round-trip/decoded-br.hl7 (OBX-5 with \.br\ newlines)
  - test/fixtures/round-trip/ directory convention (new — Phase 7 expands)
affects:
  - src/parser/tokenize.ts (tokenizeComponent scope expansion per user Option 1 — documented Rule-3 deviation)
tech-stack:
  added: []
  patterns:
    - "unescape-on-parse + reescape-on-emit as an inverse pair — the raw tree stores DECODED subcomponents, delimiter escape expansion is the tokenize boundary, not an on-access concern"
    - "SER-02 structural-equivalence via rawSegments deep-equality after parseHL7 → toString → parseHL7"
    - "CR-terminated fixture files written via Node script (Write tool defaults to LF)"
    - "MSH special-case emission path separate from the generic segment walker (D-06 inverse of readDelimiters)"
key-files:
  created:
    - test/serialize-to-string.test.ts
    - test/round-trip.test.ts
    - test/fixtures/round-trip/canonical-adt-a01.hl7
    - test/fixtures/round-trip/oru-r01-repetitions.hl7
    - test/fixtures/round-trip/null-fields.hl7
    - test/fixtures/round-trip/embedded-delimiters.hl7
    - test/fixtures/round-trip/decoded-br.hl7
  modified:
    - src/serialize/to-string.ts
    - src/parser/tokenize.ts
decisions:
  - D-01 walk rawSegments verbatim confirmed at runtime
  - D-05 strict CR segment terminator + trailing CR confirmed at runtime (15 round-trip tests + 4 dedicated terminator unit tests pass)
  - D-06 MSH-1 / MSH-2 emission trace (MSH + enc.field + component + repetition + escape + subcomponent + enc.field + MSH-3..N) confirmed at runtime
  - D-07 purity confirmed (never throws + deterministic + non-mutating + reflects mutations via D-30 no-cache contract)
  - D-08 no MLLP framing confirmed (input with \x0B ... \x1C\r framing emits clean output without any MLLP bytes)
  - D-03 byte-identical idempotency from the second pass confirmed (canonical + MLLP-framed inputs both pass)
  - D-02 isNull preservation confirmed — explicit "" nulls survive round-trip on PID-2 / PID-9 / PID-10
  - D-04 reescape chokepoint confirmed — all 5 active delimiters + \n round-trip through emitField
  - **NEW runtime architecture:** Phase 2 tokenize unescapes subcomponents on parse; Phase 5 emitField reescapes on emit. This inverse pair makes SER-02 structural equivalence hold on the FIRST pass (previously only possible from the second pass via idempotency after double-escape normalization).
metrics:
  duration: "~15m"
  completed: "2026-04-19T19:52:00Z"
  tasks: 2
  files_created: 7
  files_modified: 2
  tests_before: 488
  tests_after: 526
  tests_added: 38
---

# Phase 5 Plan 02: to-string-and-round-trip Summary

One-liner: Shipped the spec-clean HL7 emitter body (`emitMessage` — D-01 walk, D-06 MSH special-case, D-05 CR-joined segment terminator, D-07 pure, D-08 no-MLLP) and the SER-02 round-trip structural-equivalence sweep (5 canonical fixtures + 15 round-trip assertions); resolved a latent Phase 2/Phase 5 architectural contradiction by moving escape-sequence expansion from on-access into the tokenize boundary so the raw tree stores decoded subcomponents and emit-time reescape produces a clean inverse without double-escape artifacts.

## What Shipped

### 1. `src/serialize/to-string.ts::emitMessage` — FULLY IMPLEMENTED

- Walks `msg.rawSegments` verbatim (D-01).
- MSH segments route through `emitMshSegment` which inlines MSH-1 as `enc.field` and MSH-2 as `enc.component + enc.repetition + enc.escape + enc.subcomponent` (fixed 4-char order), then emits MSH-3..N via `emitField` joined by `enc.field` (D-06 exact emission trace).
- Non-MSH segments flow through the existing Plan-01 `emitSegment` unchanged.
- Segments joined with strict CR; trailing CR appended (D-05).
- No MLLP framing on output (D-08).
- Pure — never warns, never throws (D-07).
- Trailing empty fields at the segment level PRESERVED (W3) via the existing `emitSegment` join semantics — no trimming of `parts` before joining.
- Trailing empty components / subcomponents INSIDE a field STRIPPED (D-02) — inherited from Plan-01 `emitField`.

### 2. `src/parser/tokenize.ts::tokenizeComponent` — unescape-on-parse (SCOPE EXPANSION — Rule-3 deviation)

- Every subcomponent now runs through `unescape(sub, enc, emit, position)` on the tokenize boundary.
- Raw tree stores DECODED strings — input `Smith\F\Jones` becomes subcomponent `Smith|Jones` in `rawSegments`.
- `UNKNOWN_ESCAPE_SEQUENCE` warnings from `unescape` propagate through the `emit` callback with full positional context (segment, field, rep, component, subcomponent all 1-indexed).
- MSH-1 / MSH-2 placeholders (`fields[0]` + `fields[1]`) intentionally NOT unescaped — they hold the literal delimiter / encoding chars and flow through the D-06 special-case emission path, not through `emitField`.
- `src/model/field.ts::value` getter left unchanged — the second `unescape` pass on a subcomponent that already contains no backslashes is identity, and removing it would break non-parser callers who hand `Field` instances raw escape-bearing strings.

### 3. `test/serialize-to-string.test.ts` — 23 tests

Unit coverage of `emitMessage` organised by decision ID:
- **Block 1 (D-06 MSH special-case) — 4 tests:** MSH-1 emission position, MSH-2 fixed 4-char order, MSH-3 starts after enc.field separator, custom encoding chars (`#@~\\&`) round-trip.
- **Block 2 (D-05 CR terminator) — 4 tests:** minimal single-segment trails with exactly one CR, multi-segment (3 segs) has exactly 3 CRs, LF-parsed input normalises to CR, CRLF-parsed input normalises to CR.
- **Block 3 (D-04 reescape) — 3 tests:** embedded HL7 escape forms round-trip through the unescape/reescape pair (new assertion set — the old "byte-faithful raw tree" claim is obsolete under Option 1); `\n` in subcomponent emits as `\.br\`; W4 all-5-delimiters explicit-input-shape test via `emitField` directly.
- **Block 4 (D-02 isNull) — 2 tests:** explicit `""` null round-trips; absent `||` vs null `|""|` stay distinct on output.
- **Block 5 (D-07 purity) — 4 tests:** never throws on 3 diverse inputs; deterministic on repeat; non-mutating; reflects mutations (no stale cache per D-30).
- **Block 6 (D-08 no MLLP) — 1 test:** MLLP-framed input emits output with no `\x0B` / `\x1C` / `\x1D`.
- **Block 7 (D-03 idempotency) — 2 tests:** second pass byte-identical to first (canonical + MLLP-framed).
- **Block 8 (W3 trailing empties) — 3 tests:** PID with mid/trail empty fields preserves all `|` separators; MSH-3..N trailing empties preserved; round-trip preserves field count.

23/23 green.

### 4. `test/round-trip.test.ts` — 15 tests

SER-02 structural-equivalence sweep + D-03 idempotency + specific preservation checks across 5 fixtures:
- 5 × structural round-trip (rawSegments deep equality + encodingCharacters equality).
- 5 × idempotency (`parseHL7(once.toString()).toString() === once.toString()`).
- `null-fields` preserves `isNull === true` on PID-2 / PID-9 / PID-10.
- `embedded-delimiters` — all 5 HL7 escape forms round-trip (each component's decoded subcomponent contains the literal `|` / `^` / `&` / `~` / `\` char; emitted form re-escapes to `\F\` / `\S\` / `\T\` / `\R\` / `\E\`).
- `decoded-br` — raw tree holds literal `\n`; emit re-escapes to `\.br\` with no literal LF anywhere in output.
- `oru-r01-repetitions` — PID-3 has 2 repetitions (MRN~SSN); 3 OBX segments preserved.
- `canonical-adt-a01` — MSH/EVN/PID/PV1 segment roster preserved.

15/15 green.

### 5. Fixture directory convention

`test/fixtures/round-trip/` — NEW. Phase 7 will expand with vendor-quirk breadth. All 5 fixtures written with literal CR byte terminators (not LF) via a one-shot Node script because the Write tool normalises to LF.

## Deviations from Plan

### [Rule 3 — Deepen, same file pattern] Phase 2 tokenize now unescapes subcomponents on parse

**Justification:** Resolves a Phase 2 / Phase 5 architectural contradiction that would have blocked the SER-02 structural-equivalence contract.

**What the plan said:** Implement `emitMessage` body in `src/serialize/to-string.ts` — no changes to Phase 2.

**What I found during Task 1 GREEN:** Three `test/serialize-to-string.test.ts` tests failed with a double-escape pattern. A raw-tree subcomponent like `Smith\F\Jones` (byte-faithful from the old tokenize) was running through `reescape` on emit, which treated each literal `\` as the escape character and produced `Smith\E\F\E\Jones` on the wire. Re-parsing that emitted output gave a raw tree with different content (`\E\` unescape paths) than the original — SER-02 structural equivalence could not hold on the first pass. Only byte-identical idempotency (D-03 from the second pass onward) survived, but the "first-pass structural round-trip" promise in SER-02 was untestable.

**User decision (surfaced at checkpoint):** Option 1 — fix Phase 2 `tokenize.ts` to unescape on parse. The raw tree now stores decoded strings, which makes `unescape` (on parse) and `reescape` (on emit) a clean inverse pair; SER-02 first-pass structural equivalence holds.

**What changed:**
- `src/parser/tokenize.ts::tokenizeComponent` now calls `unescape(sub, enc, emit, { ...position, subcomponentIndex: sIdx + 1 })` on each subcomponent before pushing to the component's subcomponents array.
- Plumbed `emit` and `position` through `tokenizeRepetition` → `tokenizeComponent` so `UNKNOWN_ESCAPE_SEQUENCE` warnings surface with full positional context.
- Module JSDoc updated — the old "raw tree is byte-faithful to the input" promise is replaced with "raw tree holds DECODED strings (inverse of `reescape`)".
- `src/model/field.ts::value` getter's `unescape`-on-access call left in place (no-op on a decoded subcomponent; non-breaking for callers who hand raw backslash-bearing strings to `Field`).

**Fallout:** ZERO pre-existing parser test failures. The `parser-escapes.test.ts` suite tests `unescape` / `reescape` primitives directly (not through rawSegments) and was unaffected. 510 pre-existing tests stayed green through the tokenize change; the 3 `serialize-to-string` failures were then reduced to 1 by the tokenize fix alone (the remaining 1 was a test assertion that encoded the old double-escape behavior — updated in the same GREEN commit).

**Commit:** `0681ff8 refactor(parser-02): tokenize unescapes subcomponents on parse (phase 2/5 round-trip contract)`

### No other deviations.

Zero Rule 1, Rule 2, or Rule 4 items. The Rule 3 item above was the single architectural choice surfaced at checkpoint; the plan's emit-body work and fixture sweep executed exactly as written.

## Verification Results

| Check                                        | Result                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `pnpm typecheck`                             | Pass (zero errors)                                  |
| `pnpm lint`                                  | Pass (zero warnings; `max-warnings=0` respected)    |
| `pnpm build`                                 | Pass (tsup emits `dist/index.{mjs,cjs,d.ts,d.cts}`) |
| `pnpm test`                                  | 526/526 passing across 44 test files                |
| Bundle smoke test (`parseHL7 → toString`)    | `MSH equal: true` + `Idempotent: true`              |
| Fixtures have CR segment terminators (od -c) | Confirmed — no LF anywhere                          |
| `emitMessage` body has no `NOT IMPLEMENTED`  | Confirmed — stub replaced                           |
| SER-01 truths hold                           | Confirmed via unit tests (D-05 / D-08 blocks)       |
| SER-02 truths hold                           | Confirmed via round-trip sweep (5 fixtures × 2)     |
| SER-05 truths hold                           | Confirmed via W4 + embedded-delimiters round-trip   |

Test count delta: **488 → 526** (+38: +23 serialize-to-string, +15 round-trip).

## Warnings Addressed at Runtime

- **W3 (trailing segment-level empty fields preserved):** 3 dedicated unit tests in `serialize-to-string.test.ts` Block 8. PID with mid/trail empties round-trips byte-identically; MSH-3..N trailing empties preserved; round-trip preserves field count (12 for a PID with 11 `|` separators + 1 fields[0] placeholder).
- **W4 (explicit input-shape for 5-delimiter reescape):** one parametric test in Block 3 that builds a `RawField` directly (not via `parseHL7`) so the input shape is unambiguous, and calls `emitField` against `DEFAULT_ENCODING_CHARACTERS` — asserting each delimiter re-escapes to its exact `\F\` / `\S\` / `\R\` / `\E\` / `\T\` form with surrounding literal bytes preserved.

## Files

**Created (7):**
- `src/serialize/to-string.ts` — 88 lines; `emitMessage` body + `emitMshSegment` private helper (pre-existed as a stub from Plan 01; Plan 02 replaces the body only).
- `test/serialize-to-string.test.ts` — 299 lines; 23 unit tests.
- `test/round-trip.test.ts` — 170 lines; 15 integration tests + 5-fixture sweep.
- `test/fixtures/round-trip/canonical-adt-a01.hl7` — 4 segments (MSH + EVN + PID + PV1), CR-terminated.
- `test/fixtures/round-trip/oru-r01-repetitions.hl7` — 6 segments (MSH + PID w/ PID-3 SSN~MRN + OBR + 3 OBX), CR-terminated.
- `test/fixtures/round-trip/null-fields.hl7` — 2 segments (MSH + PID with 3 explicit "" nulls), CR-terminated.
- `test/fixtures/round-trip/embedded-delimiters.hl7` — 2 segments (MSH + PID with XPN containing all 5 HL7 escape forms), CR-terminated.
- `test/fixtures/round-trip/decoded-br.hl7` — 3 segments (MSH + OBR + OBX with 2 \.br\ newlines), CR-terminated.

**Modified (2):**
- `src/parser/tokenize.ts` — module JSDoc rewrite + `tokenizeRepetition` / `tokenizeComponent` signature widen (emit + position) + `unescape` call on each subcomponent.
- (Plan 01 `src/serialize/to-string.ts` stub replaced — counted as "created" above since the body is entirely new content.)

## Commits

| Hash      | Type     | Message                                                                          |
| --------- | -------- | -------------------------------------------------------------------------------- |
| `4fbe9fd` | test     | add failing tests for emitMessage (RED) — landed before this session             |
| `0681ff8` | refactor | tokenize unescapes subcomponents on parse (phase 2/5 round-trip contract)        |
| `9ebf619` | feat     | implement emitMessage body with D-06 MSH special-case and CR-joined segment walk |
| `d67b2c2` | test     | add SER-02 round-trip structural-equivalence sweep + 5 fixtures                  |

(A final `docs` commit for this SUMMARY + state updates will follow.)

## Notes for Plans 03 / 04 / 05

**Disjoint-file contract still in force:**
- Plan 03 owns only the body of `emitJson` in `src/serialize/to-json.ts`.
- Plan 04 owns only the body of `emitPrettyPrint` in `src/serialize/pretty-print.ts`.
- Plan 05 owns only the bodies of `buildMessage`, `formatHl7Timestamp`, and `generateControlId`.

**New shared invariant:** After Plan 02, the raw tree stores DECODED subcomponents (no `\F\` / `\E\` / `\.br\` sequences in `rawSegments[i].fields[j].repetitions[k].components[l].subcomponents[m]`). Plans 03 and 04 that iterate `rawSegments` should assume decoded strings. `emitJson` (Plan 03) especially should NOT attempt to re-apply any escape expansion — the raw tree is already what `SerializedMessage` should mirror.

**Plan 05 buildMessage:** should construct `RawSegment` trees with DECODED subcomponents (matching the new invariant). Callers who pass `[" |foo", "bar"]` to `addSegment` will see the literal `|` in the decoded raw subcomponent — and `emitField`'s `reescape` will emit it as `\F\` on the wire, as expected.

**SER-02 first-pass structural equivalence:** Now holds on the first pass (not just from second-pass idempotency) because the unescape-on-parse + reescape-on-emit inverse pair eliminates the previous double-escape normalization step. Plan 05's round-trip test for built messages should assert first-pass structural equivalence, not just idempotency.

## Self-Check: PASSED

Verified:
- `src/serialize/to-string.ts` has `emitMessage` body with no `NOT IMPLEMENTED` marker (FOUND).
- `src/parser/tokenize.ts::tokenizeComponent` calls `unescape` (FOUND).
- `test/serialize-to-string.test.ts` exists with 23 tests, all green (FOUND).
- `test/round-trip.test.ts` exists with 15 tests, all green (FOUND).
- 5 fixture files under `test/fixtures/round-trip/` (FOUND).
- Fixtures use CR terminators — no LF (confirmed via `od -c`).
- Commits `0681ff8`, `9ebf619`, `d67b2c2` all in git log (FOUND).
- Test count 526 matches expected >= 517 (PASS).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0 (PASS).
- Bundle smoke test prints `MSH equal: true` + `Idempotent: true` (PASS).
