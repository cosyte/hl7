---
phase: 05
slug: serialization-and-round-trip
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 5 — Validation Strategy

> Retroactive Nyquist validation for a completed phase. All 6 SER requirements have automated coverage; 623/623 tests green.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Coverage command** | `pnpm test:coverage` |
| **Estimated runtime** | ~4 seconds (766ms test time; ~3.9s total) |

---

## Sampling Rate

- **After every task commit:** `pnpm test` (full suite is fast — <5s)
- **After every plan wave:** `pnpm test`
- **Before `/gsd-verify-work`:** Full suite green
- **Max feedback latency:** ~5s

---

## Per-Task Verification Map

Tasks here are plan-granularity (Phase 5 plans are cohesive units without sub-task IDs). Each plan maps to dedicated test file(s); round-trip test exercises the integrated surface.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01 | 01-scaffold-emit-field-and-method-wiring | 1 | SER-01, SER-05 | — | emitField re-escapes via D-04 chokepoint; MSH guard throws | unit | `pnpm test -- serialize-emit-field` | ✅ | ✅ green |
| 05-02 | 02-to-string-and-round-trip | 2 | SER-01, SER-02, SER-05 | — | toString emits spec-clean HL7; parse→toString→parse structurally equivalent | unit + integration | `pnpm test -- serialize-to-string round-trip` | ✅ | ✅ green |
| 05-03 | 03-to-json | 2 | SER-03 | — | toJSON raw-tree mirror; boundary freeze; conditional profile | unit | `pnpm test -- serialize-to-json` | ✅ | ✅ green |
| 05-04 | 04-pretty-print | 2 | SER-04 | — | prettyPrint emits D-25 header + D-23 labeled segment lines | unit | `pnpm test -- serialize-pretty-print` | ✅ | ✅ green |
| 05-05 | 05-build-message | 2 | SER-06 | — | buildMessage synthesizes MSH; addSegment chain produces parseable HL7 | unit + integration | `pnpm test -- builder builder-control-id builder-format-timestamp` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement-to-Test File Map

| Requirement | Test File(s) | Coverage |
|-------------|--------------|----------|
| SER-01 (toString spec-clean) | `test/serialize-emit-field.test.ts`, `test/serialize-to-string.test.ts` | ✅ |
| SER-02 (round-trip equivalence) | `test/round-trip.test.ts` + 5 fixtures in `test/fixtures/round-trip/` | ✅ |
| SER-03 (toJSON structured) | `test/serialize-to-json.test.ts` | ✅ |
| SER-04 (prettyPrint multi-line) | `test/serialize-pretty-print.test.ts` | ✅ |
| SER-05 (re-escape on serialize) | `test/serialize-emit-field.test.ts`, `test/fixtures/round-trip/embedded-delimiters.hl7` | ✅ |
| SER-06 (buildMessage outbound) | `test/builder.test.ts`, `test/builder-control-id.test.ts`, `test/builder-format-timestamp.test.ts` | ✅ |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. vitest already configured; `vitest.config.ts` extends per-directory coverage threshold map to include `src/serialize/**` and `src/builder/**` at the same ≥90% bar as `src/parser/**`, `src/model/**`, `src/helpers/**` (per Phase 5 Plan 01 truth #7).

---

## Manual-Only Verifications

All phase behaviors have automated verification. The four ROADMAP success criteria (SC1–SC4) were verified programmatically via unit tests, integration tests, full-suite regression (623/623), and runtime smoke-tests against the built ESM bundle (see 05-VERIFICATION.md §Behavioral Spot-Checks).

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — coverage threshold extension completed in Plan 01)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-19

---

## Validation Audit 2026-04-19

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Phase 5 is Nyquist-compliant on first audit (State B reconstruction from artifacts). All 6 SER requirements mapped to dedicated passing tests; round-trip fixture sweep exercises SER-02 structural-equivalence invariant; full suite 623/623 green; no manual-only items.
