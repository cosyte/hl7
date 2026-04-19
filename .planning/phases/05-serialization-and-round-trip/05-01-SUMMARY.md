---
phase: 05-serialization-and-round-trip
plan: 01
subsystem: serialization-scaffold
tags: [scaffold, emit-field, stubs, barrel, coverage-thresholds]
requires:
  - Phase 4 complete (Hl7Message has meta, patient, visit, observations, orders, nextOfKin, allergies, diagnoses, insurance)
  - src/parser/escapes.ts::reescape (D-04 primitive)
  - src/parser/types.ts::{EncodingCharacters, RawField, RawRepetition, RawSegment}
  - src/parser/delimiters.ts::DEFAULT_ENCODING_CHARACTERS
provides:
  - src/serialize/emit-field.ts::{emitField, emitSegment} (fully implemented, @internal)
  - src/serialize/to-string.ts::emitMessage (stub — Plan 02 fills)
  - src/serialize/to-json.ts::SerializedMessage (live type) + emitJson (stub — Plan 03 fills)
  - src/serialize/pretty-print.ts::emitPrettyPrint (stub — Plan 04 fills)
  - src/builder/build-message.ts::BuildMessageInit (live type) + buildMessage (stub — Plan 05 fills)
  - src/builder/format-timestamp.ts::formatHl7Timestamp (stub — Plan 05 fills)
  - src/builder/control-id.ts::generateControlId (stub — Plan 05 fills)
  - Hl7Message.toString / toJSON / prettyPrint instance methods (wired to stubs)
  - src/index.ts barrel exports: buildMessage (value), BuildMessageInit (type), SerializedMessage (type)
  - vitest.config.ts per-directory coverage thresholds for src/serialize/** and src/builder/**
affects:
  - src/model/message.ts (imports + 3 new instance methods)
  - src/index.ts (3 new exports)
  - vitest.config.ts (2 new per-directory threshold entries)
tech-stack:
  added: []
  patterns:
    - "module-level emitter function + thin class-method delegate (mirrors Phase 4 walkObservations / observations() pair)"
    - "mixed stub pattern — interface LIVE, function body throws NOT IMPLEMENTED marker (enables consumers to reference the type today without the body existing)"
    - "MSH loud-guard deviation from pure-emitter doctrine — the one deliberate throw in emit-field.ts catches D-06 misuse at call site"
key-files:
  created:
    - src/serialize/emit-field.ts
    - src/serialize/to-string.ts
    - src/serialize/to-json.ts
    - src/serialize/pretty-print.ts
    - src/builder/build-message.ts
    - src/builder/format-timestamp.ts
    - src/builder/control-id.ts
    - test/serialize-emit-field.test.ts
  modified:
    - src/model/message.ts
    - src/index.ts
    - vitest.config.ts
decisions:
  - D-02 trailing-empty strip at component + subcomponent levels locked in emitField
  - D-02 isNull preservation as literal '""' locked in emitField
  - D-04 reescape chokepoint is emitField — every subcomponent passes through reescape, zero other emitters call it directly
  - D-06 MSH guard — emitSegment throws loudly when seg.name === "MSH" (deliberate deviation from D-07; guards against silent MSH-2 corruption)
  - D-07/D-26 pure-emitter doctrine for all non-MSH paths
  - D-09 buildMessage is a top-level named export, symmetric with parseHL7
  - D-10 BuildMessageInit shape locked (type required, rest optional, Date | string timestamp)
  - D-17 SerializedMessage shape locked (raw-tree mirror + warnings + optional profile)
  - D-18 toJSON on Hl7Message class so JSON.stringify(msg) auto-invokes it
  - D-21 SerializedMessage exported from src/index.ts (not under HL7 namespace)
  - D-29 three emit methods on Hl7Message class, each a thin delegate to a module-level emitter
  - D-30 no emit caching in v1 (no new cache slots)
  - Phase 7 coverage-gate readiness — per-dir thresholds extended to src/serialize/** and src/builder/**
metrics:
  duration: "5m"
  completed: "2026-04-19T19:24:14Z"
  tasks: 4
  files_created: 8
  files_modified: 3
  tests_before: 459
  tests_after: 488
  tests_added: 29
---

# Phase 5 Plan 01: Scaffold Emit-Field + Method Wiring Summary

One-liner: Shipped the Phase 5 disjoint-file scaffold — `emit-field.ts` fully implemented (D-02 strip + D-04 reescape chokepoint + D-06 MSH loud guard), 6 stub files with live type declarations, 3 `Hl7Message` instance methods wired, barrel extended, vitest coverage thresholds extended to `src/serialize/**` and `src/builder/**`.

## What Shipped

### 1. `src/serialize/emit-field.ts` — FULLY IMPLEMENTED (@internal)

Two module-level functions + one private helper:

- `emitField(field, enc): string` — walks `RawField.repetitions → components → subcomponents`, joins with `enc.repetition / enc.component / enc.subcomponent`, passes every subcomponent string through `reescape` (D-04), strips trailing empties at component + subcomponent levels (D-02), preserves `isNull === true` as the literal `""` (D-02).
- `emitRepetition(rep, enc): string` — private helper; pulled out only because the nested loop with two trailing-empty strips was getting hard to read inside `emitField`.
- `emitSegment(seg, enc): string` — name + `enc.field` + `<fields[1..N]>` joined by `enc.field`; skips `fields[0]` placeholder. **Throws loudly on MSH input** — the one deliberate deviation from D-07, documented inline + in the CONTEXT decisions.

### 2. Stub files with LIVE type declarations (6)

Each stub file:
- Has full module JSDoc listing the decisions the downstream plan must honour.
- Exports its function with the correct signature.
- Throws `"<fn-name>: NOT IMPLEMENTED — Phase 5 Plan 0N (plan-name) will fill this."` on invocation.
- Includes interface declarations where the type is LIVE (not stubbed):
  - `src/serialize/to-json.ts::SerializedMessage` — W5 boundary-freeze JSDoc note added so Plan 03 doesn't need to re-invent the wording.
  - `src/builder/build-message.ts::BuildMessageInit` — W1 empty-vs-null wire-semantics JSDoc note added so Plan 05 doesn't need to re-invent the wording.

### 3. `Hl7Message` instance methods (3)

Inserted between `insurance()` and `setField()`:
- `public toString(): string` → `emitMessage(this)`.
- `public toJSON(): SerializedMessage` → `emitJson(this)`.
- `public prettyPrint(): string` → `emitPrettyPrint(this)`.

`prettyPrint` JSDoc captures W2 (raw-escape rendering: embedded delimiters appear as escape sequences — users who want decoded strings should use typed accessors like `msg.patient?.familyName`).

No new cache slots (D-30). `invalidateCaches()` unchanged.

### 4. `src/index.ts` barrel

Three new exports under the `// Phase 5: outbound construction + serialization types.` group comment:
- `export { buildMessage } from "./builder/build-message.js"` (value)
- `export type { BuildMessageInit } from "./builder/build-message.js"` (type)
- `export type { SerializedMessage } from "./serialize/to-json.js"` (type)

Internal functions (`emitField`, `emitSegment`, `emitMessage`, `emitJson`, `emitPrettyPrint`, `formatHl7Timestamp`, `generateControlId`) intentionally NOT re-exported — `@internal` per D-29 plan language. Phase 6 profile hooks may promote `emitField` / `emitSegment` later.

### 5. `vitest.config.ts` coverage thresholds extended

Added `src/serialize/**` and `src/builder/**` per-directory entries at the same `lines: 90, branches: 85, functions: 90, statements: 90` bar as the existing Phase 1/2/3/4 dirs. Load-bearing for Phase 7's `pnpm test:coverage` gate — closes the hole where a low-coverage new dir could hide behind a high top-level average.

### 6. `test/serialize-emit-field.test.ts` — 29 tests

Full TDD coverage of the emit-field primitive:
- **D-02 behavior (11 cases):** absent → `""`, null → `""`, null wins over reps, single sub verbatim, multi-comp join, trailing-comp strip, internal-comp preserve, trailing-sub strip, internal-sub preserve, multi-rep join, complex nested 3-level, empty-not-null.
- **D-04 reescape (7 cases):** each of the 5 delimiters round-trips, newline → `\.br\`, custom encoding chars honoured.
- **emitSegment basics (4 cases):** simple PID, fields[0] ignored, name-only, reescape applied through emitField.
- **emitSegment MSH guard (2 cases):** throws on empty MSH, guard fires before field processing on populated MSH.
- **Purity (4 cases):** empty fields → name only, non-mutating (deep-frozen input), deterministic (emitField + emitSegment).

29/29 green.

## Decisions Made / Locked

Listed in frontmatter `decisions:` — D-02, D-04, D-06, D-07, D-09, D-10, D-17, D-18, D-21, D-26, D-29, D-30 are now manifested in code; the one documented deviation is the D-06 MSH loud guard in `emitSegment` (explicitly called out in file JSDoc + the plan's must_haves).

## Deviations from Plan

**None.** Plan executed exactly as written. The MSH loud-guard throw in `emitSegment` is NOT a deviation — it was explicitly specified in the plan's `<behavior>` block and `<action>` step, and documented as a deliberate deviation from the global "never throws" doctrine (which the plan authors had already reasoned about).

Zero Rule 1/2/3 auto-fixes required. Zero architectural (Rule 4) decisions surfaced.

## Verification Results

| Check                                  | Result                                              |
| -------------------------------------- | --------------------------------------------------- |
| `pnpm tsc --noEmit`                    | Pass (zero errors)                                  |
| `pnpm lint`                            | Pass (zero warnings; `max-warnings=0` respected)    |
| `pnpm build`                           | Pass (`tsup` emits `dist/index.{mjs,cjs,d.ts}`)     |
| `pnpm test`                            | 488/488 passing across 42 test files                |
| New-symbol check on `dist/index.d.ts`  | `buildMessage`, `BuildMessageInit`, `SerializedMessage`, `toJSON`, `prettyPrint` all present |
| Stub-throw smoke test (ESM runtime)    | All three methods throw "NOT IMPLEMENTED" as expected |
| Acceptance greps (16 total)            | All succeed                                          |

Test count delta: **459 → 488** (+29, all from the new `serialize-emit-field.test.ts`).

## Warnings Addressed at Interface Level

- **W1 (BuildMessageInit empty-vs-null semantics):** captured in `BuildMessageInit` JSDoc — callers who want to emit HL7 explicit null at a specific position must call `setField(path, '""')` post-construction. No separate null-marker input shape.
- **W2 (prettyPrint raw-escape rendering):** captured in `Hl7Message.prettyPrint` JSDoc — embedded delimiters appear as escape sequences (`Smith\F\Jones`); users who want decoded strings should use typed accessors.
- **W5 (SerializedMessage boundary-freeze):** captured in `SerializedMessage` JSDoc — top-level object is `Object.freeze`d but inner arrays are readonly-at-type-level, mutable-at-runtime; consumers should treat as immutable. Deep-freeze rejected per D-30.

## Files

**Created (8):**
- `src/serialize/emit-field.ts` — 117 lines; D-04 chokepoint + MSH guard.
- `src/serialize/to-string.ts` — 29 lines; stub.
- `src/serialize/to-json.ts` — 75 lines; `SerializedMessage` interface LIVE + `emitJson` stub.
- `src/serialize/pretty-print.ts` — 26 lines; stub.
- `src/builder/build-message.ts` — 113 lines; `BuildMessageInit` interface LIVE + `buildMessage` stub.
- `src/builder/format-timestamp.ts` — 22 lines; stub.
- `src/builder/control-id.ts` — 24 lines; stub.
- `test/serialize-emit-field.test.ts` — 233 lines; 29 unit tests.

**Modified (3):**
- `src/model/message.ts` — 3 new imports + 3 new instance methods (+81 lines).
- `src/index.ts` — 3 new exports + grouping comment (+11 lines).
- `vitest.config.ts` — 2 new per-directory threshold entries (+17 lines).

## Commits

| Hash      | Type  | Message                                                                      |
| --------- | ----- | ---------------------------------------------------------------------------- |
| `5f476f3` | test  | add failing tests for emit-field primitive (RED)                             |
| `796283b` | feat  | implement emit-field + emit-segment primitives (GREEN)                       |
| `766c878` | feat  | scaffold serialize/builder stubs with live type declarations                 |
| `81bd5b5` | feat  | wire toString/toJSON/prettyPrint methods + barrel                            |
| `4df661e` | chore | extend vitest coverage thresholds to serialize/ and builder/                 |

## Notes for Plans 02 / 03 / 04 / 05

**Hard rule — disjoint-file contract:** Each downstream plan MUST NOT edit any of the following files:
- `src/model/message.ts`
- `src/index.ts`
- `src/serialize/emit-field.ts` (FULLY IMPLEMENTED — no body changes)
- `vitest.config.ts`
- The `SerializedMessage` interface declaration in `src/serialize/to-json.ts`
- The `BuildMessageInit` interface declaration in `src/builder/build-message.ts`

Each plan's edit scope is **the function body only** inside the stub file(s) it owns:
- **Plan 02** → body of `emitMessage` in `src/serialize/to-string.ts`; new `test/serialize-to-string.test.ts`; round-trip fixtures.
- **Plan 03** → body of `emitJson` in `src/serialize/to-json.ts`; new `test/serialize-to-json.test.ts`.
- **Plan 04** → body of `emitPrettyPrint` in `src/serialize/pretty-print.ts`; new `test/serialize-pretty-print.test.ts`.
- **Plan 05** → body of `buildMessage` + body of `formatHl7Timestamp` + body of `generateControlId`; new test files for each.

`emit-field.ts`'s `emitField` / `emitSegment` are consumed unchanged. The MSH guard means Plan 02's `emitMessage` MUST use the D-06 special-case path (inline MSH-1 / MSH-2, then hand MSH-3..N to `emitField` directly, NOT to `emitSegment`).

## Self-Check: PASSED

Verified:
- `src/serialize/emit-field.ts` exists (FOUND).
- `src/serialize/to-string.ts` exists (FOUND).
- `src/serialize/to-json.ts` exists (FOUND).
- `src/serialize/pretty-print.ts` exists (FOUND).
- `src/builder/build-message.ts` exists (FOUND).
- `src/builder/format-timestamp.ts` exists (FOUND).
- `src/builder/control-id.ts` exists (FOUND).
- `test/serialize-emit-field.test.ts` exists (FOUND).
- Commits `5f476f3`, `796283b`, `766c878`, `81bd5b5`, `4df661e` all in git log (FOUND).
- Test count 488 matches expected >= 481 (PASS).
- `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0 (PASS).
