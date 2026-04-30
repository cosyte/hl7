---
phase: 03
slug: structural-model-and-types
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
reconstructed_from: artifacts (State B — Phase 12 retroactive Nyquist validation; no prior VALIDATION.md existed)
---

# Phase 3 — Validation Strategy

> Retroactive Nyquist validation audit. Phase 3 ships the structural model (dot-path resolver, Segment + Field wrappers, wrapper caches, mutation API) plus 9 composite parsers (XPN, XAD, CX, CWE, CE, HD, XTN, PL, TS/DTM, NM). All 11 REQ-IDs (7 MODEL + 4 TYPES) have dedicated unit + integration tests across 18 test files (8 model-\*.test.ts + 10 types-\*.test.ts + types-shared.test.ts).

---

## Test Infrastructure

| Property              | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| **Framework**         | Vitest 1.2.x                                           |
| **Config file**       | `vitest.config.ts`                                     |
| **Quick run command** | `pnpm test -- model types`                             |
| **Full suite**        | `pnpm test`                                            |
| **Coverage command**  | `pnpm test:coverage` (≥90% branches on `src/model/**`) |
| **Estimated runtime** | ~14 s full suite; ~2 s model+types scoped              |

---

## Sampling Rate

- **After every task commit:** `pnpm test -- <surface>` (model-\* or types-\* scoped to the change)
- **After every plan wave:** `pnpm test -- model types` (all 19 files)
- **Before `/gsd-verify-work 3`:** Full suite green + `pnpm typecheck` + `pnpm lint --max-warnings=0` + `pnpm build`
- **Max feedback latency:** ~2 s scoped, ~14 s full

---

## Per-Task Verification Map

| ID    | Plan                                             | Wave | Requirement(s)                 | Test File(s)                                                                                                                                           | Test Type          | Automated Command                                                        | File Exists | Status   |
| ----- | ------------------------------------------------ | ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------ | ----------- | -------- |
| 03-01 | 01 read-path-foundation                          | 1    | MODEL-01, MODEL-02, MODEL-03, MODEL-05 | `test/model-dotpath.test.ts`, `test/model-message.test.ts`, `test/model-segment.test.ts`, `test/model-field.test.ts`, `test/model-traversal.test.ts` | unit + integration | `pnpm test -- model-dotpath model-message model-segment model-field model-traversal` | ✅          | ✅ green |
| 03-02 | 02 composites-person-address-identifier          | 2    | TYPES-01, TYPES-02, TYPES-03   | `test/types-xpn.test.ts`, `test/types-xad.test.ts`, `test/types-cx.test.ts`, `test/types-cwe.test.ts`, `test/types-ce.test.ts`, `test/types-hd.test.ts`, `test/types-shared.test.ts` | unit               | `pnpm test -- types-xpn types-xad types-cx types-cwe types-ce types-hd types-shared` | ✅          | ✅ green |
| 03-03 | 03 composites-telecom-location-timestamp-numeric | 2    | TYPES-04                       | `test/types-xtn.test.ts`, `test/types-pl.test.ts`, `test/types-ts.test.ts`, `test/types-nm.test.ts`                                                  | unit               | `pnpm test -- types-xtn types-pl types-ts types-nm`                      | ✅          | ✅ green |
| 03-04 | 04 mutation-and-barrel                           | 3    | MODEL-04, MODEL-06, MODEL-07   | `test/model-mutation.test.ts`, `test/model-field-coercions.test.ts`, `test/model-public-exports.test.ts`                                             | unit + integration | `pnpm test -- model-mutation model-field-coercions model-public-exports` | ✅          | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

**Total Phase-3 test files:** 18 dedicated (8 model-\*.test.ts + 10 types-\*.test.ts) + 1 shared (types-shared.test.ts).

---

## Requirement → Test Cross-Reference

| ID       | Source Plan | Primary Test File(s)                                                                                                                         | Evidence                                                                                                                 | Status  |
| -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| MODEL-01 | 03-01       | `test/model-dotpath.test.ts` + `test/model-message.test.ts`                                                                                  | Dot-path tokenizer + `msg.get('PID.5.1')` read path across all depth combinations                                        | COVERED |
| MODEL-02 | 03-01       | `test/model-segment.test.ts` + `test/model-field.test.ts`                                                                                    | Segment + Field wrapper class surfaces (name, fields, components, raw)                                                   | COVERED |
| MODEL-03 | 03-01       | `test/model-traversal.test.ts` + `test/model-message.test.ts`                                                                                | `getAll`, `segments(name)`, `allSegments()` iteration semantics                                                          | COVERED |
| MODEL-04 | 03-04       | `test/model-mutation.test.ts`                                                                                                                | `setField` / `addSegment` / `removeSegment` mutation API with positive + negative paths                                  | COVERED |
| MODEL-05 | 03-01       | `test/model-message.test.ts` + cross-phase `test/helpers-cache-invalidation.test.ts` + `test/helpers-cache-invalidation-visit.test.ts`       | Wrapper cache memoization (read hits) + cross-phase cache-invalidation on mutation (9 + 5 cases in Phase 4 files)        | COVERED |
| MODEL-06 | 03-04       | `test/model-mutation.test.ts`                                                                                                                | Immutability-by-default; direct-mutation no-op negative-path describe blocks                                             | COVERED |
| MODEL-07 | 03-04       | `test/model-public-exports.test.ts`                                                                                                          | HL7 namespace barrel + final `src/index.ts` public export surface                                                        | COVERED |
| TYPES-01 | 03-02       | `test/types-xpn.test.ts`                                                                                                                     | XPN person-name composite parser                                                                                         | COVERED |
| TYPES-02 | 03-02       | `test/types-xad.test.ts`                                                                                                                     | XAD address composite parser                                                                                             | COVERED |
| TYPES-03 | 03-02       | `test/types-cx.test.ts`, `test/types-cwe.test.ts`, `test/types-ce.test.ts`, `test/types-hd.test.ts`                                          | CX identifier + CWE/CE coded-element + HD namespace composite parsers                                                    | COVERED |
| TYPES-04 | 03-03       | `test/types-xtn.test.ts`, `test/types-pl.test.ts`, `test/types-ts.test.ts`, `test/types-nm.test.ts`                                          | XTN telecom + PL location + TS/DTM timestamp (delegates to `parseHl7Timestamp` Phase 2 Plan 05 cascade) + NM numeric     | COVERED |

**Gap summary: 0 MISSING · 0 PARTIAL · 11 COVERED.**

---

## Composites Coverage

| Composite        | Test File               | Source Plan |
| ---------------- | ----------------------- | ----------- |
| XPN              | `types-xpn.test.ts`     | 03-02       |
| XAD              | `types-xad.test.ts`     | 03-02       |
| CX               | `types-cx.test.ts`      | 03-02       |
| CWE              | `types-cwe.test.ts`     | 03-02       |
| CE               | `types-ce.test.ts`      | 03-02       |
| HD               | `types-hd.test.ts`      | 03-02       |
| XTN              | `types-xtn.test.ts`     | 03-03       |
| PL               | `types-pl.test.ts`      | 03-03       |
| TS/DTM           | `types-ts.test.ts`      | 03-03       |
| NM               | `types-nm.test.ts`      | 03-03       |
| (shared helpers) | `types-shared.test.ts`  | 03-02       |

Each v1 composite parser ships with its own dedicated test file following the `test/types-<name>.test.ts` convention. Shared composite helpers (readComponent / readSubcomponent / auto-unescape) live in `test/types-shared.test.ts`. TS/DTM delegates its string→Date parsing to `parseHl7Timestamp` (Phase 2 Plan 05); see also `test/parser-dates.test.ts` for the underlying cascade.

---

## Cross-Phase Cache-Invalidation Note

MODEL-05 (wrapper cache memoization) is primarily exercised by two Phase 4 test files: `test/helpers-cache-invalidation.test.ts` (9 cases covering meta/patient cache reads → setField invalidation) and `test/helpers-cache-invalidation-visit.test.ts` (5 cases for visit). These files live in the Phase 4 wave but their subject-under-test is the Phase 3 wrapper-cache contract. Direct Phase 3 coverage via `test/model-message.test.ts` establishes the cache read/hit behavior; Phase 4 files establish the invalidation-on-mutation contract. Together they close MODEL-05 end-to-end.

---

## Wave 0 Requirements

_None._ Vitest + `vitest.config.ts` from Phase 1. Phase 3 added 19 new test files on top of existing infrastructure. Per-directory coverage threshold on `src/model/**` was tightened from 85% → 90% branches in Phase 7 Plan 06; Phase 3 shipped under 85% and met the tighter bar without backfill.

---

## Manual-Only Verifications

_None._ Every MODEL-01..07 and TYPES-01..04 behavior has automated unit or integration test coverage. Immutability-by-default (MODEL-06) is asserted programmatically via `Object.isFrozen` / try-mutate-then-reread patterns in `test/model-mutation.test.ts`.

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: 4 plans × ≥1 dedicated test file per plan
- [x] Wave 0 covers MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 15 s
- [x] `nyquist_compliant: true` set
- [x] Verifier PASS 2026-04-18 per `03-VERIFICATION.md`

**Approval:** approved 2026-04-21 (Nyquist audit — State B reconstruction from 4 SUMMARYs + 03-VERIFICATION.md).

---

## Validation Audit 2026-04-21

| Metric            | Value                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Input state       | B (4 SUMMARYs + 03-VERIFICATION.md)                                                       |
| REQ-IDs audited   | 11 (7 MODEL + 4 TYPES)                                                                    |
| Plans mapped      | 4 (03-01..03-04)                                                                          |
| Test files mapped | 19 (8 model-\* + 10 types-\* + 1 shared) + 2 cross-phase cache-invalidation (Phase 4)     |
| Composites covered | 10 (XPN / XAD / CX / CWE / CE / HD / XTN / PL / TS-DTM / NM) — 1:1 test-file mapping     |
| Gaps found        | 0                                                                                         |
| Resolved          | 0                                                                                         |
| Escalated         | 0                                                                                         |
| Coverage gate     | ≥90% branches on `src/model/**` (Phase 7 Plan 06)                                         |

**Verdict:** Phase 3 is Nyquist-compliant. 7 MODEL + 4 TYPES REQ-IDs each have at least one dedicated unit test file; 10 composite parsers each have their own `test/types-<name>.test.ts`; MODEL-05 cache contract is exercised cross-phase by Phase 4 cache-invalidation tests. Closes v2.1-MILESTONE-AUDIT tech-debt item 2 for Phase 3.
