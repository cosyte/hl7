---
phase: 6
slug: profile-system-and-built-ins
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
reconstructed_from: artifacts (State B — no prior VALIDATION.md existed)
---

# Phase 6 — Validation Strategy

> Retroactive Nyquist validation audit. All 15 Phase-6 REQ-IDs (PROF-01..09 + BIP-01..06) have automated verification. Every task in the 6-plan wave landed with green tests; full suite 753/753 passing on last run (2026-04-19).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.2.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- profiles` |
| **Full suite command** | `pnpm test` |
| **Coverage command** | `pnpm test:coverage` |
| **Estimated runtime** | ~14 s full suite; ~2 s profiles-only |

---

## Sampling Rate

- **After every task commit:** `pnpm test -- profiles` (scoped)
- **After every plan wave:** `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + `pnpm typecheck` + `pnpm lint --max-warnings=0` + `pnpm build`
- **Max feedback latency:** ~14 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement(s) | Test File | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------------|-----------|-----------|-------------------|-------------|--------|
| 06-01 | 01 | 1 | PROF-01, PROF-02, PROF-04, PROF-05, PROF-07 (types) | `test/profiles-define.test.ts` (35 tests) | unit | `pnpm test -- profiles-define` | ✅ | ✅ green |
| 06-02 | 02 | 2 | PROF-03 (extends merge — lineage, dateFormats, customSegments, onWarning chain, scalar overwrite) | `test/profiles-extends.test.ts` (21 tests) | unit | `pnpm test -- profiles-extends` | ✅ | ✅ green |
| 06-03a | 03 | 2 | PROF-06 (attribution), PROF-07 (`Segment.get`), PROF-09 (round-trip byte-equal), D-21 (dateFormats order), D-31 (UNKNOWN_SEGMENT suppression) | `test/profiles-custom-segments.test.ts` (23 tests) | unit + fixture | `pnpm test -- profiles-custom-segments` | ✅ | ✅ green |
| 06-03b | 03 | 2 | D-22 (profile.onWarning BEFORE options.onWarning, per-handler try/catch, strict short-circuit isolation) | `test/profiles-onwarning-chain.test.ts` (9 tests) | unit | `pnpm test -- profiles-onwarning-chain` | ✅ | ✅ green |
| 06-04 | 04 | 3 | PROF-08 (setDefaultProfile / getDefaultProfile / `{profile: null}` opt-out + D-19 dispatch + D-20 equivalence + `afterEach` isolation contract) | `test/profiles-default.test.ts` (13 tests) | unit | `pnpm test -- profiles-default` | ✅ | ✅ green |
| 06-05 | 05 | 4 | BIP-01..05 (5 built-ins via public `defineProfile()` API: epic, cerner, meditech, athena, genericLab) | `test/profiles-builtins.test.ts` (29 tests, describe blocks 1–5) | unit | `pnpm test -- profiles-builtins` | ✅ | ✅ green |
| 06-06 | 06 | 5 | BIP-06 (per-vendor fixture-parity warning reduction), PROF-09 (round-trip byte-equivalence), D-26 (public export shape), D-28 (per-warning-code assertion style) | `test/profiles-builtins.test.ts` (29 tests, fixture-parity + cross-profile smoke + round-trip blocks); fixtures at `test/fixtures/vendor-shapes/{epic,cerner,meditech,athena,genericLab}/*.hl7` | unit + fixture | `pnpm test -- profiles-builtins` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Total Phase-6 tests: 130 (35 + 21 + 23 + 9 + 13 + 29) across 6 test files.**
Full suite: 753/753 passing across 55 test files (up from 724 at Phase 5 baseline — net +29).

---

## Requirement → Test Coverage

| REQ-ID | Source Plan | Test Evidence | Status |
|--------|-------------|---------------|--------|
| PROF-01 | 06-01 | `profiles-define.test.ts` — happy-path describe block + frozen-return assertions | COVERED |
| PROF-02 | 06-01 | `profiles-define.test.ts` — D-05/D-07/D-08 validation describe blocks (PID overlay throws, typo "did you mean" hint, malformed dateFormats index-named error) | COVERED |
| PROF-03 | 06-02 | `profiles-extends.test.ts` — D-03 lineage + D-10 dateFormats concat/dedupe + D-11 customSegments deep-merge + D-09 scalar last-wins + D-12 onWarning chain + D-05 rogue-parent defense + frozen + describe-lineage | COVERED |
| PROF-04 | 06-01 | `profiles-define.test.ts` — `Object.freeze` + readonly reflection assertions | COVERED |
| PROF-05 | 06-01 | `profiles-define.test.ts` — `describe()` always starts with `Profile '<name>'`; omits-absent-lines assertions | COVERED |
| PROF-06 | 06-03 | `profiles-custom-segments.test.ts` — `msg.profile.name` + `msg.profile.lineage` attribution end-to-end | COVERED |
| PROF-07 | 06-03 | `profiles-custom-segments.test.ts` — `seg.get('departmentCode').value` runtime + undefined-on-typo narrow; types covered at plan 06-01 | COVERED |
| PROF-08 | 06-04 | `profiles-default.test.ts` — all 4 branches of D-19 (null opt-out, explicit override, undefined fallback, clear) + D-20 equivalence | COVERED |
| PROF-09 | 06-03, 06-06 | `profiles-custom-segments.test.ts` + `profiles-builtins.test.ts` — `parseHL7(raw, profile).toString() === parseHL7(raw).toString()` byte-equal | COVERED |
| BIP-01 | 06-05 | `profiles-builtins.test.ts` epic describe block + `src/profiles/epic.ts` authored via `defineProfile()` | COVERED |
| BIP-02 | 06-05 | `profiles-builtins.test.ts` cerner describe block + `src/profiles/cerner.ts` | COVERED |
| BIP-03 | 06-05 | `profiles-builtins.test.ts` meditech describe block + `src/profiles/meditech.ts` | COVERED |
| BIP-04 | 06-05 | `profiles-builtins.test.ts` athena describe block + `src/profiles/athena.ts` | COVERED |
| BIP-05 | 06-05 | `profiles-builtins.test.ts` genericLab describe block + `src/profiles/genericLab.ts` | COVERED |
| BIP-06 | 06-06 | `profiles-builtins.test.ts` per-vendor fixture-parity × 5 (D-28 per-warning-code assertion style) against `test/fixtures/vendor-shapes/<vendor>/*.hl7` | COVERED |

**Gap summary: 0 MISSING · 0 PARTIAL · 15 COVERED.**

---

## Wave 0 Requirements

*None.* Vitest 1.2.x + `vitest.config.ts` were installed in Phase 1 (SETUP-01..06); `test/fixtures/` pattern and test-naming convention (`test/<surface>-<slice>.test.ts`) established in Phase 2. Phase 6 added 6 new test files + 5 vendor fixtures on top of existing infrastructure — no framework, config, or scaffolding gaps required.

---

## Manual-Only Verifications

*None.* Every Phase-6 behavior is observable via automated test or runtime smoke check. Confirmed by verifier 2026-04-19 (`06-VERIFICATION.md` §Human Verification Required).

Notably automated (often candidates for manual-only in other phases):
- **Round-trip byte-equivalence** — covered by `parseHL7(raw, profile).toString() === parseHL7(raw).toString()` assertion in `profiles-builtins.test.ts` + `profiles-custom-segments.test.ts`.
- **Public export shape (D-26)** — covered by typecheck + verifier's `require('./dist/index.cjs')` smoke (individual built-ins NOT top-level exports; only `profiles.epic` etc.).
- **Fixture warning reduction** — per-warning-code assertion (D-28) is robust to future phases adding new codes; no brittle total-count checks.
- **`afterEach` test-isolation for setDefaultProfile** — verified by plan-04's dedicated "afterEach test-isolation contract" describe block.

---

## Validation Sign-Off

- [x] All tasks have automated verify (no Wave 0 dependencies needed)
- [x] Sampling continuity: every plan (06-01..06-06) has its own dedicated test file; no 3-task gaps
- [x] Wave 0 covers all MISSING references (none — infrastructure pre-existed)
- [x] No watch-mode flags (`pnpm test` → `vitest run`, one-shot)
- [x] Feedback latency < 15 s (full suite 13.53 s on last run)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Verifier PASS 2026-04-19 (5/5 ROADMAP criteria + 15/15 REQ-IDs)

**Approval:** approved 2026-04-19 (Nyquist audit — State B reconstruction from artifacts).

---

## Validation Audit 2026-04-19

| Metric | Count |
|--------|-------|
| Input state | B (reconstructed from SUMMARY + VERIFICATION) |
| REQ-IDs audited | 15 (PROF-01..09 + BIP-01..06) |
| Test files mapped | 6 (`profiles-{define,extends,custom-segments,onwarning-chain,default,builtins}.test.ts`) |
| Fixtures mapped | 5 (one per vendor under `test/fixtures/vendor-shapes/`) |
| Gaps found | 0 |
| Resolved | 0 (none needed — every requirement was already green-covered) |
| Escalated | 0 |
| Auditor spawn needed | No (step 3 workflow rule: "No gaps → skip to Step 6") |
| Full-suite run | 753/753 passing, 13.53 s |
