---
phase: 01
slug: project-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
reconstructed_from: artifacts (State B — Phase 12 retroactive Nyquist validation; no prior VALIDATION.md existed)
---

# Phase 1 — Validation Strategy

> Retroactive Nyquist validation audit. Phase 1 is a scaffold phase; automated enforcement is primarily pipeline-level (install/typecheck/lint/format/test/build) rather than unit-test-level. All 6 SETUP REQ-IDs (SETUP-01..SETUP-06) have infrastructure-level automated verification. `test/sanity.test.ts` is the only unit test (1 case) — this is EXPECTED and documented below as not a gap.

---

## Test Infrastructure

| Property              | Value                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Framework**         | Vitest 1.2.x                                                                                                                         |
| **Config file**       | `vitest.config.ts`                                                                                                                   |
| **Quick run command** | `pnpm test -- sanity`                                                                                                                |
| **Full suite command**| `pnpm test`                                                                                                                          |
| **Coverage command**  | `pnpm test:coverage`                                                                                                                 |
| **Estimated runtime** | ~10s (full suite measured at 9.18s in `01-VERIFICATION.md`; scaffold-phase sanity alone is <1s)                                      |
| **Pipeline command**  | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm format:check && pnpm test -- --run && pnpm build` |
| **CI matrix**         | Node 18 / 20 / 22 via `.github/workflows/ci.yml` (line 24)                                                                           |

---

## Sampling Rate

- **After every task commit:** `pnpm test -- sanity` (scoped; scaffold phase has only 1 unit test)
- **After every plan wave:** full pipeline (`pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm format:check && pnpm test -- --run && pnpm build`)
- **Before `/gsd-verify-work 1`:** full pipeline + dual-module smoke (`node -e "import('./dist/index.mjs').then(m => console.log('ESM:', typeof m.parseHL7))"` + CJS equivalent)
- **Max feedback latency:** ~30s for the full pipeline

---

## Per-Task Verification Map

Tasks here are plan-granularity (Phase 1 plans are cohesive tooling units without sub-task IDs). Each plan maps to a pipeline command or config-grep check; Phase 1's "tests" are predominantly pipeline exit codes rather than unit tests.

| ID    | Plan Name             | Wave | Requirement                            | Test Type                      | Automated Command                                                                                                                           | File Exists | Status   |
| ----- | --------------------- | ---- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| 01-01 | 01 package-scaffold   | 1    | SETUP-03, SETUP-05                     | infrastructure (static config) | `pnpm install --frozen-lockfile && node -e "const p=require('./package.json'); if(Object.keys(p.dependencies||{}).length) process.exit(1)"` | ✅          | ✅ green |
| 01-02 | 02 build-system       | 1    | SETUP-02                               | infrastructure (build output)  | `pnpm build && test -f dist/index.cjs && test -f dist/index.mjs && test -f dist/index.d.ts && test -f dist/index.d.cts`                     | ✅          | ✅ green |
| 01-03 | 03 lint-and-test      | 1    | SETUP-04, SETUP-06                     | unit + infrastructure          | `pnpm lint --max-warnings=0 && pnpm format:check && pnpm test -- --run`                                                                     | ✅          | ✅ green |
| 01-04 | 04 smoke-verification | 2    | SETUP-01, SETUP-02, SETUP-04, SETUP-06 | integration (full pipeline)    | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm format:check && pnpm test -- --run && pnpm build`   | ✅          | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

**Total Phase-1 unit tests:** 1 (`test/sanity.test.ts` — 1 case). **Full suite at phase close:** see `01-VERIFICATION.md` (pipeline baseline: 824 passed / 14 todo across 59 files, 9.18s).

---

## Requirement → Test Cross-Reference

| ID       | Source Plan  | Test Evidence                                                                                                                                                                                                        | Status  |
| -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| SETUP-01 | 01-04        | `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` all exit 0 with zero warnings — `01-04-SUMMARY.md` pipeline block + `01-VERIFICATION.md` Verification Commands table + `.github/workflows/ci.yml` Node 18/20/22 matrix | COVERED |
| SETUP-02 | 01-02, 01-04 | Dual ESM + CJS + `.d.ts` via `exports` map — `tsup.config.ts` `format: ["esm", "cjs"]` + `dist/index.{cjs,mjs,d.ts,d.cts}` emit + `01-VERIFICATION.md` dual-module smoke (`ESM: function` / `CJS: function`)        | COVERED |
| SETUP-03 | 01-01        | Zero runtime deps + `"type": "module"` + Node 18+ engines — `package.json` inline check in `01-VERIFICATION.md` row 9 prints `{} 'module' { node: '>=18.0.0' } true`                                                  | COVERED |
| SETUP-04 | 01-03, 01-04 | ESLint flat config + `--max-warnings=0` gate — `eslint.config.js` (118 lines, ~23 rules) + `01-03-SUMMARY.md` guardrail linking map + CI `pnpm lint --max-warnings=0` step                                            | COVERED |
| SETUP-05 | 01-01        | Strict TypeScript (`strict: true` + `noUncheckedIndexedAccess: true` + no `any`) — `tsconfig.json` strict block (lines 9-15) + `eslint.config.js` `@typescript-eslint/no-explicit-any` rule + `pnpm typecheck` exit 0 | COVERED |
| SETUP-06 | 01-03, 01-04 | Vitest test framework + config — `vitest.config.ts` + `test/sanity.test.ts` smoke + `pnpm test -- --run` exit 0 with passing suite                                                                                   | COVERED |

**Gap summary: 0 MISSING · 0 PARTIAL · 6 COVERED.**

---

## Wave 0 Requirements

_None — Phase 1 installed the Vitest framework itself (Plan 03) plus the pipeline gates (Plan 04). There was no pre-existing infrastructure to bootstrap from; Plan 03 + Plan 04 together constitute Wave 0 for the entire downstream project. `wave_0_complete: true` is asserted because all subsequent phases (2-11) built on this scaffold without needing framework additions._

---

## Manual-Only Verifications

_None with gating authority._ Every SETUP REQ-ID has an automated check — either a pipeline exit code, a grep on `package.json`/`tsconfig.json` content, or a dual-module smoke script. The dual-module smoke in `01-VERIFICATION.md` is programmatic (Node one-liners), not a human eyeball check.

---

## Thin-by-Design Callout

Phase 1 is intentionally thin on unit tests. A scaffold phase's job is to stand up toolchains, not to ship library functionality. The single `test/sanity.test.ts` case exists only to prove Vitest is wired; real unit-test surface begins in Phase 2 (parser-\*.test.ts). Downstream phases (4, 6, 7) ship the ≥90% branch-coverage gate on `src/parser/`, `src/model/`, `src/helpers/`, `src/serialize/`, `src/builder/` — Phase 1's validation is infrastructure-level only, and this is by design.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands (pipeline or targeted test)
- [x] Sampling continuity: pipeline re-runs on every plan wave (no 3-task gap without automated verify)
- [x] Wave 0 covers all MISSING references (none — Phase 1 IS Wave 0)
- [x] No watch-mode flags (`pnpm test` → `vitest run`, one-shot)
- [x] Feedback latency < 30s (full pipeline)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Verifier PASS ratified 2026-04-21 per `01-VERIFICATION.md` (4/4 SCs + 6/6 SETUP REQs)

**Approval:** approved 2026-04-21 (Nyquist audit — State B reconstruction from 4 SUMMARYs + 01-VERIFICATION.md).

---

## Validation Audit 2026-04-21

| Metric                | Count                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input state           | B (reconstructed from 4 SUMMARYs + 01-VERIFICATION.md)                                                                                                              |
| REQ-IDs audited       | 6 (SETUP-01..SETUP-06)                                                                                                                                              |
| Plans mapped          | 4 (01-01..01-04)                                                                                                                                                    |
| Gaps found            | 0                                                                                                                                                                   |
| Resolved              | 0 (none needed — every SETUP REQ has infrastructure-level automated enforcement)                                                                                    |
| Escalated             | 0                                                                                                                                                                   |
| Auditor spawn needed  | No                                                                                                                                                                  |
| Pipeline gate         | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm format:check && pnpm test -- --run && pnpm build` — all exit 0 at HEAD per 01-VERIFICATION.md |

Phase 1 is Nyquist-compliant at the infrastructure tier. Every SETUP REQ-ID maps 1:1 to at least one pipeline-command or config-grep check that runs automatically (locally + on CI Node 18/20/22). The thin unit-test surface (1 sanity test) is expected for a scaffold phase and does not constitute a gap. Closes v2.1-MILESTONE-AUDIT tech-debt item 2 for Phase 1.
