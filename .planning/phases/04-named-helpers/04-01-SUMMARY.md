---
phase: 04-named-helpers
plan: 01
subsystem: helpers-scaffold
tags: [xcn, helpers, hl7-composite, cache-invalidation, typescript, vitest]

requires:
  - phase: 03-structural-model-and-types
    provides: "Field.asXxx() coercions, Mutable<T> composite construction pattern, parseAssigningAuthority nested-HD synthesis, Hl7Message._segmentsByType/_allSegments lazy caches with wholesale invalidation, readComponent shared helper"
provides:
  - "XCN composite (11th v1 composite) — interface, parseXcn, Field.asXcn(), namespace + barrel exports"
  - "9 helper type interfaces (Meta, Patient, Visit, Observation + ObservationBase, Order, NextOfKin, Allergy, Diagnosis, Insurance) with exactOptionalPropertyTypes-safe readonly fields"
  - "pickMrn helper (full implementation — D-07/D-08/D-10)"
  - "9 stub builder files (meta/patient/visit/observations/orders/next-of-kin/allergies/diagnoses/insurance) with exact signatures Plans 02/03/04 will fill"
  - "Hl7Message 3 getters (meta/patient/visit) + 6 collection methods (observations/orders/nextOfKin/allergies/diagnoses/insurance) wired to stubs"
  - "_meta/_patient/_visit private cache slots with null-sentinel convention on patient/visit; invalidateCaches drops all 5 slots wholesale"
  - "src/index.ts public barrel: 10 helper type re-exports + pickMrn + XCN + parseXcn"
affects: [Plan 02 meta-and-patient, Plan 03 visit-and-observations, Plan 04 orders-and-collections, Phase 6 profile hooks, Phase 7 vendor-quirks testing, Phase 8 examples]

tech-stack:
  added: []
  patterns:
    - "Disjoint-file scaffold for Wave parallelism — Plans 02/03/04 now edit ONLY stub method bodies, never message.ts / index.ts / types.ts / field.ts"
    - "Null-sentinel memoization cache — undefined = not yet computed, null = computed absent, T = present (patient/visit slots)"
    - "Meta slot uses plain T | undefined (no null-sentinel) because Meta is always defined per D-03"
    - "XCN = XPN structural twin + idNumber prefix + nested HD assigningAuthority (composite pattern #3 after CX, PL)"
    - "Stub error messages name the filling plan (Plan 02/03/04) so out-of-order execution is diagnosable on first touch"

key-files:
  created:
    - "src/model/types/xcn.ts — XCN interface + parseXcn + internal parseAssigningAuthority"
    - "src/helpers/types.ts — 9 helper interface declarations"
    - "src/helpers/pick-mrn.ts — pickMrn full implementation"
    - "src/helpers/meta.ts — buildMeta stub (Plan 02 fills)"
    - "src/helpers/patient.ts — buildPatient stub (Plan 02 fills)"
    - "src/helpers/visit.ts — buildVisit stub (Plan 03 fills)"
    - "src/helpers/observations.ts — observations + buildObservation stubs (Plan 03 fills; Plan 04 reuses buildObservation)"
    - "src/helpers/orders.ts — orders stub (Plan 04 fills)"
    - "src/helpers/next-of-kin.ts — nextOfKin stub (Plan 04 fills)"
    - "src/helpers/allergies.ts — allergies stub (Plan 04 fills)"
    - "src/helpers/diagnoses.ts — diagnoses stub (Plan 04 fills)"
    - "src/helpers/insurance.ts — insurance stub (Plan 04 fills)"
    - "src/helpers/index.ts — internal barrel (10 types + 10 functions + pickMrn)"
    - "test/types-xcn.test.ts — 8 test cases"
    - "test/helpers-pick-mrn.test.ts — 8 test cases"
  modified:
    - "src/model/types/namespace.ts — HL7.XCN added"
    - "src/model/types/index.ts — XCN/parseXcn added to internal barrel"
    - "src/model/field.ts — asXcn() coercion + XCN import"
    - "src/model/message.ts — 3 getters + 6 collection methods + 3 cache slots + extended invalidateCaches"
    - "src/index.ts — 10 helper type re-exports + pickMrn + XCN + parseXcn"

key-decisions:
  - "D-24 option (a) LOCKED — XCN ships as the 11th v1 composite with parseXcn + HL7.XCN + Field.asXcn(). Rationale: structurally XPN + ID prefix + nested HD; keeps helpers as pure composition (PV1-7 attendingDoctor, PV1-8 referringDoctor, OBR-16 orderedBy)."
  - "Stubs throw with plan-numbered error messages ('NOT IMPLEMENTED — Phase 4 Plan 02 will fill this') — enables out-of-order execution diagnosis on first touch."
  - "XCN.parseAssigningAuthority duplicated from CX (not promoted to _shared.ts) — at 3 occurrences (CX + PL + XCN) we now meet Phase 3's DRY threshold, but extracting now would require touching pl.ts + cx.ts (out of Plan 01 scope). Flagged as a candidate refactor for Phase 7 cleanup."
  - "Null-sentinel memoization on _patient / _visit slots — undefined means 'not yet computed', null means 'computed, PID/PV1 absent', T means 'present'. _meta uses plain T | undefined because Meta is always defined (D-03)."
  - "observations.ts exports TWO functions (observations + buildObservation) so Plan 04's orders() can reuse OBX → Observation logic positionally without duplicating value-type dispatch."

patterns-established:
  - "Composite layer stays pure composition — Plan 01 uses the same Mutable<T> + conditional-assignment pattern established by Plan 03 parsers"
  - "Helper stubs carry exact final signatures — Plans 02/03/04 modify METHOD BODIES ONLY, never message.ts/index.ts/types.ts/field.ts"
  - "Cache slot naming convention: _meta / _patient / _visit match _segmentsByType / _allSegments — single invalidateCaches drop covers all"
  - "stub error strings name the filling plan for instant debuggability"

requirements-completed: []  # Wave 1 only SCAFFOLDS the helpers — none of HELPERS-01..07 are functionally complete until Plans 02/03/04 land. Closure happens per-REQ in those summaries.

duration: ~12min
completed: 2026-04-19
---

# Phase 4 Plan 01: Scaffold XCN and Cache Summary

**Shipped the Phase 4 scaffold in one disjoint-file wave: XCN composite (11th v1 composite per D-24a), 9 helper type interfaces, 9 stub builders + pickMrn, Hl7Message getter/collection/cache wiring — all so Plans 02/03/04 can fill stub bodies in parallel without edit conflicts.**

## What Shipped

| Area | Deliverable |
|------|-------------|
| XCN composite | `src/model/types/xcn.ts` — 13-component interface + `parseXcn` + internal `parseAssigningAuthority`. `Field.asXcn()` coercion delegating via shared `EMPTY_REP` fallback. `HL7.XCN` namespace entry + named exports in `src/index.ts`. |
| Helper types | `src/helpers/types.ts` — 9 interfaces (`Meta`, `Patient`, `Visit`, `Observation` + `ObservationBase`, `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance`) with full `@example` JSDoc. Every field `readonly`, every optional key `exactOptionalPropertyTypes`-safe. |
| pickMrn | `src/helpers/pick-mrn.ts` — full implementation per D-07 (prefer MR-typed) + D-08 (fallback to first CX's idNumber) + D-10 (case-sensitive `MR`). Exported publicly so Phase 6 profile hooks can substitute without touching `patient.ts`. |
| Stub builders | 9 stub files (`meta.ts`, `patient.ts`, `visit.ts`, `observations.ts` (2 stubs), `orders.ts`, `next-of-kin.ts`, `allergies.ts`, `diagnoses.ts`, `insurance.ts`) — each throws `"NOT IMPLEMENTED — Phase 4 Plan 0N will fill this"` with exact final signature. 10 throw sites (observations.ts exports both `observations` and `buildObservation`). |
| Hl7Message wiring | 3 getters (`meta`, `patient`, `visit`) + 6 collection methods (`observations`, `orders`, `nextOfKin`, `allergies`, `diagnoses`, `insurance`). 3 new cache slots (`_meta`, `_patient`, `_visit`). `invalidateCaches()` drops all 5 slots wholesale — `setField`/`addSegment`/`removeSegment` already call it. |
| Public barrel | 10 helper type re-exports (`Meta`, `Patient`, `Visit`, `Observation`, `ObservationBase`, `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance`) + `pickMrn` + `XCN` + `parseXcn` in `src/index.ts`. |
| Tests | `test/types-xcn.test.ts` (8 cases) + `test/helpers-pick-mrn.test.ts` (8 cases). |

## D-24 Decision Locked

**Option (a) — XCN is the 11th v1 composite.** Ships `parseXcn`, `HL7.XCN`, `Field.asXcn()`. Rationale per Phase 4 CONTEXT.md D-24: XCN is structurally XPN + ID prefix + nested HD `assigningAuthority`. Keeping it as a composite (rather than flattening doctor fields into strings on `Visit`) means helpers stay pure composition — PV1-7 `attendingDoctor`, PV1-8 `referringDoctor`, OBR-16 `orderedBy` all read through `field(N).asXcn()` without polluting the helper-layer interfaces.

## Files Created (15) + Modified (5)

**Created (15):**

- `src/model/types/xcn.ts` (180 lines)
- `src/helpers/types.ts` (~320 lines with JSDoc)
- `src/helpers/pick-mrn.ts` (49 lines)
- `src/helpers/meta.ts`, `patient.ts`, `visit.ts`, `observations.ts`, `orders.ts`, `next-of-kin.ts`, `allergies.ts`, `diagnoses.ts`, `insurance.ts` (9 stubs, 20–28 lines each)
- `src/helpers/index.ts` (internal barrel)
- `test/types-xcn.test.ts` (8 tests)
- `test/helpers-pick-mrn.test.ts` (8 tests)

**Modified (5):**

- `src/model/types/namespace.ts` (+1 line — `XCN` type export)
- `src/model/types/index.ts` (+2 lines — `XCN` + `parseXcn` exports)
- `src/model/field.ts` (+1 import, +15 lines — `asXcn()` method with JSDoc)
- `src/model/message.ts` (+9 imports, +3 cache slots, +3 getters, +6 methods, +3 invalidateCaches lines)
- `src/index.ts` (+14 lines — 10 helper types + pickMrn + XCN block)

Note: plan frontmatter listed 21 `files_modified` entries covering all 15 new files + 6 modified files. One "modified" slot (`src/model/types/index.ts`) existed from Phase 3 and was touched lightly — not a net-new file. The on-disk result matches the plan's files_modified list exactly.

## Tests

| Before | After | Delta |
|--------|-------|-------|
| 327 tests, 31 files | 343 tests, 33 files | +16 tests, +2 files |

- `test/types-xcn.test.ts`: 8 cases (empty rep, 5-component scalar parse, nested HD, all-empty HD omitted, never-throw, empty-component omission, auto-unescape, full 13-component parse).
- `test/helpers-pick-mrn.test.ts`: 8 cases (empty array, single MR, MR-wins-over-first, first-fallback, case-sensitive MR, defensive undefined-idNumber, never-throw across 5 variants).

Existing 327 tests continue to pass — no regressions. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.

## Deviations from Plan

**None.** Plan 01 executed exactly as written. Tasks 1 and 2 used the TDD RED→GREEN flow; Task 3 was a non-TDD wiring task per the plan's task metadata.

Minor implementation notes (not deviations — consistent with spec):

- `parseAssigningAuthority` is duplicated inline in `xcn.ts` rather than extracted to `_shared.ts`. This mirrors Plan 03's explicit choice (CX and PL each carry their own inline copy; D-20 note "DRY threshold is 3 occurrences" now met, but extraction requires editing `cx.ts` + `pl.ts` which is outside Plan 01's `files_modified` set). Candidate for a Phase 7 cleanup refactor.
- `src/helpers/observations.ts` exports **two** stubs (`observations` + `buildObservation`) instead of one — matches the plan's action item "observations.ts has TWO throws". `buildObservation` is consumed by Plan 04's `orders()` to avoid duplicating OBX → Observation value-type dispatch.

## Notes for Plans 02–04

**Hard constraints (enforced by the Wave 1 scaffold):**

1. **Do NOT modify `src/model/message.ts`** — the getters, collection methods, cache slots, and `invalidateCaches` are already final. Editing them creates a merge conflict with any other Wave 2 plan.
2. **Do NOT modify `src/index.ts`** — the public barrel is complete for Phase 4. Any new top-level export must wait for a future phase.
3. **Do NOT modify `src/helpers/types.ts`** — all 9 interfaces are locked. If a plan needs a new field, propose it as a deviation in its own SUMMARY and add it in the plan's own commit (but prefer to keep v1 lean).
4. **Do NOT modify `src/model/field.ts`** or any `src/model/types/*.ts` — Phase 3's 11 composites are final for v1.
5. **Each helper plan modifies ONLY the body of its assigned stub file(s):**
   - Plan 02 fills `src/helpers/meta.ts` + `src/helpers/patient.ts`.
   - Plan 03 fills `src/helpers/visit.ts` + `src/helpers/observations.ts` (both `observations` and `buildObservation`).
   - Plan 04 fills `src/helpers/orders.ts`, `next-of-kin.ts`, `allergies.ts`, `diagnoses.ts`, `insurance.ts` (and imports `buildObservation` from `./observations.js`).
6. **Remove the stub `throw new Error(...)` and the placeholder `@internal` tag** when filling each function. The final versions should carry prose JSDoc with `@example` blocks (ESLint `jsdoc/require-example` enforces this on public exports; since these functions are imported only from `message.ts` getters and aren't in `src/index.ts`, they remain `@internal`-eligible, but the public-surface getters + methods on `Hl7Message` already ship their own `@example` so end users are covered).
7. **Cache-invalidation tests belong to Plan 02** — it's the first plan whose `msg.meta`/`msg.patient` reads actually succeed, so `test/helpers-cache-invalidation.test.ts` should land there.

## REQ-ID Coverage

Wave 1 only **scaffolds** HELPERS-01..07 — closure of the functional requirements happens in later waves:

| REQ-ID | Status after Plan 01 | Closure Plan |
|--------|----------------------|--------------|
| HELPERS-01 (msg.meta) | Scaffolded (stub throws on access) | Plan 02 |
| HELPERS-02 (msg.patient) | Scaffolded | Plan 02 |
| HELPERS-03 (msg.visit) | Scaffolded | Plan 03 |
| HELPERS-04 (msg.observations) | Scaffolded | Plan 03 |
| HELPERS-05 (msg.orders) | Scaffolded | Plan 04 |
| HELPERS-06 (nextOfKin/allergies/diagnoses/insurance) | Scaffolded | Plan 04 |
| HELPERS-07 (never-throw contract) | Partially closed via stubs + XCN + pickMrn never-throw semantics | Plans 02-04 |

`requirements-completed: []` in frontmatter reflects this — no REQ is functionally closed by Plan 01 alone.

## Self-Check: PASSED

- `src/model/types/xcn.ts` — FOUND
- `src/helpers/types.ts` — FOUND
- `src/helpers/pick-mrn.ts` — FOUND
- `src/helpers/{meta,patient,visit,observations,orders,next-of-kin,allergies,diagnoses,insurance,index}.ts` — all 10 FOUND
- `test/types-xcn.test.ts` + `test/helpers-pick-mrn.test.ts` — FOUND
- Commits:
  - `4286ad0` test(04-01): RED — XCN tests — FOUND
  - `97d9522` feat(04-01): XCN composite GREEN — FOUND
  - `881ae3e` test(04-01): RED — pickMrn tests — FOUND
  - `e5fac28` feat(04-01): helpers types + pickMrn + stubs GREEN — FOUND
  - `2786e5a` feat(04-01): Hl7Message wiring + barrel — FOUND
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (343/343) — all green.
