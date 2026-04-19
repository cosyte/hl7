---
phase: 4
slug: named-helpers
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 4 — Validation Strategy

> Per-phase validation contract. Reconstructed from artifacts (4 PLANs + 4 SUMMARYs + VERIFICATION) after execution; all HELPERS-01..07 requirements closed with dedicated automated coverage.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.2.x (vitest run) |
| **Config file** | `vitest.config.ts` (Phase 1 Plan 03) |
| **Quick run command** | `pnpm test -- helpers-<name>.test.ts` |
| **Full suite command** | `pnpm test` |
| **Coverage command** | `pnpm test:coverage` (enforcement gate deferred to Phase 7) |
| **Estimated runtime** | ~7 seconds (full 459-test suite) |

---

## Sampling Rate

- **After every task commit:** Run targeted file — `pnpm test -- helpers-<name>.test.ts`
- **After every plan wave:** Run `pnpm test` (full 41-file suite)
- **Before `/gsd-verify-work 4`:** Full suite green + `pnpm tsc --noEmit` + `pnpm lint` + `pnpm build` all green
- **Max feedback latency:** ~7s full suite, <1s targeted

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 scaffold-xcn-and-cache | 1 | HELPERS (XCN composite scaffold — D-24a) | unit | `pnpm test -- types-xcn.test.ts` | ✅ `test/types-xcn.test.ts` (142 lines, 8 cases) | ✅ green |
| 4-01-02 | 01 scaffold-xcn-and-cache | 1 | HELPERS-02 (pickMrn — D-07/D-08/D-10) | unit | `pnpm test -- helpers-pick-mrn.test.ts` | ✅ `test/helpers-pick-mrn.test.ts` (69 lines, 8 cases) | ✅ green |
| 4-01-03 | 01 scaffold-xcn-and-cache | 1 | HELPERS-01..06 (Hl7Message getters/methods + cache invalidation wiring) | integration | `pnpm tsc --noEmit && pnpm test` | ✅ exercised via full suite + downstream plan tests | ✅ green |
| 4-02-01 | 02 meta-and-patient | 2 | HELPERS-01 (buildMeta — all 12 Meta fields, D-18 flat Date, D-22) | integration | `pnpm test -- helpers-meta.test.ts` | ✅ `test/helpers-meta.test.ts` (105 lines, 14 cases) | ✅ green |
| 4-02-02 | 02 meta-and-patient | 2 | HELPERS-02 (buildPatient — D-07/D-08/D-10 MRN, D-17 Western fullName, D-18, D-19, D-20) | integration | `pnpm test -- helpers-patient.test.ts` | ✅ `test/helpers-patient.test.ts` (187 lines, 25 cases) | ✅ green |
| 4-02-03 | 02 meta-and-patient | 2 | HELPERS-07 + D-02 (meta/patient memoization + invalidation) | integration | `pnpm test -- helpers-cache-invalidation.test.ts` | ✅ `test/helpers-cache-invalidation.test.ts` (114 lines, 9 cases) | ✅ green |
| 4-03-01 | 03 visit-and-observations | 2 | HELPERS-03 (buildVisit — D-01 frozen, D-18 flat Dates, D-24a XCN, HELPERS-07) | integration | `pnpm test -- helpers-visit.test.ts` | ✅ `test/helpers-visit.test.ts` (126 lines, 12 cases) | ✅ green |
| 4-03-02 | 03 visit-and-observations | 2 | HELPERS-04 (observations — D-13 valueType dispatch NM/TS/DT/CWE/CE/ST/TX/FT/ID/unknown, D-05/D-06/D-15) | integration | `pnpm test -- helpers-observations.test.ts` | ✅ `test/helpers-observations.test.ts` (217 lines, 23 cases) | ✅ green |
| 4-03-03 | 03 visit-and-observations | 2 | D-02 (visit cache memoization + invalidation) | integration | `pnpm test -- helpers-cache-invalidation-visit.test.ts` | ✅ `test/helpers-cache-invalidation-visit.test.ts` (61 lines, 5 cases) | ✅ green |
| 4-04-01 | 04 orders-and-collections | 3 | HELPERS-05 (orders — D-12 positional OBX grouping, D-16 contract, D-24a orderedBy, ORC-1 → orderControl) | integration | `pnpm test -- helpers-orders.test.ts` | ✅ `test/helpers-orders.test.ts` (112 lines, 12 cases) | ✅ green |
| 4-04-02 | 04 orders-and-collections | 3 | HELPERS-06 + HELPERS-07 (NK1/AL1/DG1/IN1 walkers + IN2/IN3 positional flags + universal never-throws sweep across all 9 helpers) | integration | `pnpm test -- helpers-collections.test.ts` | ✅ `test/helpers-collections.test.ts` (168 lines, 16 cases) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement → Test Cross-Reference

| REQ-ID | Status | Primary Test File(s) | Evidence |
|--------|--------|----------------------|----------|
| HELPERS-01 | COVERED | `test/helpers-meta.test.ts` + `test/helpers-cache-invalidation.test.ts` | 14 Meta cases + 9 cache cases |
| HELPERS-02 | COVERED | `test/helpers-patient.test.ts` + `test/helpers-pick-mrn.test.ts` + `test/helpers-cache-invalidation.test.ts` | 25 Patient + 8 pickMrn + 9 cache |
| HELPERS-03 | COVERED | `test/helpers-visit.test.ts` + `test/helpers-cache-invalidation-visit.test.ts` | 12 Visit + 5 cache |
| HELPERS-04 | COVERED | `test/helpers-observations.test.ts` | 23 cases across 4 describe blocks; all D-13 valueType branches exercised |
| HELPERS-05 | COVERED | `test/helpers-orders.test.ts` | 12 cases covering D-12 positional grouping + D-16 + D-24a + ORC-1 attachment |
| HELPERS-06 | COVERED | `test/helpers-collections.test.ts` | 3 NK1 + 2 AL1 + 2 DG1 + 3 IN1 (with IN2/IN3 positional flag cases) |
| HELPERS-07 | COVERED | `test/helpers-collections.test.ts` (universal sweep) + per-helper no-throw cases in each file | 5-case universal sweep iterating all 9 helper surfaces over empty-MSH and fully-minimal fixtures + individual no-throw assertions in every helper file |
| D-24a (XCN composite as 11th v1 composite) | COVERED | `test/types-xcn.test.ts` | 8 cases: empty rep, scalar 13-component population, assigningAuthority nested-HD synthesis, all-empty-omission, undefined slots, never-throws, auto-unescape via readComponent |

---

## Wave 0 Requirements

*None — Phase 1 (Plan 03) already installed Vitest + per-directory coverage thresholds declared in `vitest.config.ts`. No framework scaffolding was needed in Phase 4. Existing infrastructure covers all Phase 4 requirements.*

---

## Manual-Only Verifications

*None — all HELPERS-01..07 behaviors have automated verification. The end-to-end DX scratch demo run during verifier (`msg.meta.type`, `msg.patient?.fullName`, `msg.visit?.attendingDoctor?.idNumber`, etc. against a realistic ORU^R01 fixture consumed via `dist/index.mjs`) is an additional smoke check but is not a gating manual step — every surface exercised there is already covered by the integration tests above.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify blocks in their PLAN + matching test file on disk
- [x] Sampling continuity: every plan ships a dedicated test file committed in its wave — no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (no MISSING references — all covered by existing Vitest infra)
- [x] No watch-mode flags in commands
- [x] Feedback latency ≈ 7s full suite (well under any gate)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Full suite green: 459/459 across 41 files as of 2026-04-19
- [x] Typecheck + lint (max-warnings=0) + build all green

**Approval:** approved 2026-04-19

---

## Validation Audit 2026-04-19

| Metric | Count |
|--------|-------|
| Requirements audited | 7 HELPERS + D-24a (XCN) |
| Gaps found | 0 |
| Resolved by auditor | 0 (no spawn needed) |
| Escalated to manual-only | 0 |
| Test files covering Phase 4 | 10 (1301 total lines) |
| Test cases covering Phase 4 | ~132 (XCN 8 + pickMrn 8 + meta 14 + patient 25 + cache 9 + visit 12 + observations 23 + visit-cache 5 + orders 12 + collections 16) |

**Verdict:** Phase 4 is Nyquist-compliant. Every HELPERS-01..07 requirement plus the D-24a XCN composite decision has dedicated automated verification that ran green in this session (459/459). No `gsd-nyquist-auditor` dispatch was required because no gap classification surfaced a MISSING or PARTIAL row — every requirement mapped 1:1 to at least one committed integration/unit test file.
