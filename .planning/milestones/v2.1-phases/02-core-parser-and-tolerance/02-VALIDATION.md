---
phase: 02
slug: core-parser-and-tolerance
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
reconstructed_from: artifacts (State B — Phase 12 retroactive Nyquist validation; no prior VALIDATION.md existed)
---

# Phase 2 — Validation Strategy

> Retroactive Nyquist validation audit. Phase 2 is the largest test-surface phase in v1 — 19 REQ-IDs (9 PARSE + 10 TOL) closed across 7 plans with 14 dedicated test files under `test/parser-*.test.ts` and `test/types-shared.test.ts`. All 19 REQ-IDs have dedicated unit + integration tests enforced by the ≥90% branch-coverage gate on `src/parser/**` (tightened in Phase 7).

---

## Test Infrastructure

| Property               | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Framework**          | Vitest 1.2.x                                                                         |
| **Config file**        | `vitest.config.ts`                                                                   |
| **Quick run command**  | `pnpm test -- parser`                                                                |
| **Full suite command** | `pnpm test`                                                                          |
| **Coverage command**   | `pnpm test:coverage` (enforces ≥90% branches on `src/parser/**`; tightened Phase 7)  |
| **Estimated runtime**  | ~14s full suite; ~3s parser-scoped                                                   |

---

## Sampling Rate

- **After every task commit:** `pnpm test -- parser-<surface>` (scoped to the file under active change)
- **After every plan wave:** `pnpm test -- parser` (all 13 `parser-*.test.ts` files + `types-shared`, ~3s)
- **Before `/gsd-verify-work 2`:** `pnpm test && pnpm typecheck && pnpm lint --max-warnings=0 && pnpm build`
- **Max feedback latency:** ~3s scoped, ~14s full

---

## Per-Task Verification Map

| ID    | Plan                                    | Wave | Requirement(s)                                                  | Test File(s)                                                                                                            | Test Type         | Automated Command                                                                     | File Exists | Status   |
| ----- | --------------------------------------- | ---- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- | ----------- | -------- |
| 02-01 | 01 warnings-errors-and-message-shell    | 1    | Foundation (supports PARSE-08/09 error surface, TOL-03 warnings) | `test/parser-warnings.test.ts`, `test/parser-errors.test.ts`                                                            | unit              | `pnpm test -- parser-warnings parser-errors`                                          | ✅          | ✅ green |
| 02-02 | 02 input-normalization-mllp-and-charset | 2    | TOL-05, TOL-07, TOL-09 (partial TOL-10 — closed in 02-07)       | `test/parser-normalize.test.ts`, `test/parser-mllp.test.ts`                                                             | unit              | `pnpm test -- parser-normalize parser-mllp`                                           | ✅          | ✅ green |
| 02-03 | 03 segments-delimiters-and-tokenize     | 2    | PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-06, TOL-01, TOL-02 | `test/parser-delimiters.test.ts`, `test/parser-tokenize.test.ts`, `test/parser-segments.test.ts`                        | unit              | `pnpm test -- parser-delimiters parser-tokenize parser-segments`                      | ✅          | ✅ green |
| 02-04 | 04 escape-sequences                     | 2    | PARSE-05, TOL-06                                                | `test/parser-escapes.test.ts`                                                                                           | unit              | `pnpm test -- parser-escapes`                                                         | ✅          | ✅ green |
| 02-05 | 05 dateformats-plumbing                 | 2    | PARSE-07, TOL-08                                                | `test/parser-dates.test.ts`, `test/types-shared.test.ts`                                                                | unit              | `pnpm test -- parser-dates types-shared`                                              | ✅          | ✅ green |
| 02-06 | 06 public-parsehl7-and-strict-mode      | 3    | PARSE-08, PARSE-09, TOL-03, TOL-04                              | `test/parser-public.test.ts`, `test/parser-strict-mode-sweep.test.ts`, `test/parser-malformed-sweep.test.ts`, `test/parser-edge-cases.test.ts` | unit + integration | `pnpm test -- parser-public parser-strict-mode-sweep parser-malformed-sweep parser-edge-cases` | ✅          | ✅ green |
| 02-07 | 07 gap-closure-charset                  | 3    | TOL-10                                                          | `test/parser-normalize.test.ts` (charset cases added here)                                                              | unit              | `pnpm test -- parser-normalize`                                                       | ✅          | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

**Total Phase-2 tests:** see `02-VERIFICATION.md` for exact case counts. **Test files:** 14 dedicated (`test/parser-*.test.ts` × 13 + `test/types-shared.test.ts`).

---

## Requirement → Test Cross-Reference

Split across two subtables (PARSE and TOL) so Prettier column-alignment leaves exactly one space between cell content and the trailing pipe — required for automated grep gates to match every row.

### PARSE requirements (9)

| ID       | Source Plan | Primary Test File(s)                                              | Evidence                                                                                     | Status  |
| -------- | ----------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| PARSE-01 | 02-03       | `test/parser-delimiters.test.ts`                                  | MSH-1 field separator detection (`|` or alt) with edge-case whitespace handling              | COVERED |
| PARSE-02 | 02-03       | `test/parser-delimiters.test.ts`                                  | Encoding-chars read from MSH-2 (`^~\&`) including non-default separator combinations         | COVERED |
| PARSE-03 | 02-03       | `test/parser-segments.test.ts`                                    | Segment splitting across `\r`, `\n`, `\r\n` with trailing-newline tolerance                  | COVERED |
| PARSE-04 | 02-03       | `test/parser-tokenize.test.ts`                                    | Field / repetition / component / sub-component tokenization with empty-slot preservation    | COVERED |
| PARSE-05 | 02-04       | `test/parser-escapes.test.ts`                                     | All 8 standard HL7 escape forms (`\F\ \S\ \T\ \R\ \E\ \.br\ \X..\ \Z..\`) round-trip clean   | COVERED |
| PARSE-06 | 02-03       | `test/parser-tokenize.test.ts`                                    | Repetitions / components / sub-components all flattened into correct array shape            | COVERED |
| PARSE-07 | 02-05       | `test/parser-dates.test.ts`, `test/types-shared.test.ts`          | HL7 TS/DTM timestamp cascade (YYYYMMDD → YYYYMMDDHHMMSS → with TZ offset) → native `Date`    | COVERED |
| PARSE-08 | 02-06       | `test/parser-errors.test.ts`, `test/parser-malformed-sweep.test.ts` | `Hl7ParseError` class with `code`, `position`, `snippet` fields; thrown in strict mode       | COVERED |
| PARSE-09 | 02-06       | `test/parser-malformed-sweep.test.ts`                             | Four stable fatal codes (MISSING_MSH, BAD_MSH_DELIMITERS, INCOMPLETE_MSH, NON_TEXT_INPUT)    | COVERED |

### TOL requirements (10)

| ID     | Source Plan | Primary Test File(s)                                             | Evidence                                                                                                                                                              | Status  |
| ------ | ----------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| TOL-01 | 02-03/06    | `test/parser-edge-cases.test.ts`, `test/parser-warnings.test.ts` | Vendor-quirky lenient parse — messages with trailing whitespace, repeated delimiters, partial MSH extensions all parse with warnings instead of throwing              | COVERED |
| TOL-02 | 02-03       | `test/parser-tokenize.test.ts`                                   | Whitespace-trim emits `TRIMMED_WHITESPACE` warning instead of silently eating content                                                                                 | COVERED |
| TOL-03 | 02-01/06    | `test/parser-warnings.test.ts`                                   | Warnings registry (`WARNING_CODES`) + `onWarning` callback delivers code + position + snippet on every warn                                                           | COVERED |
| TOL-04 | 02-06       | `test/parser-strict-mode-sweep.test.ts`                          | `strict: true` option escalates every `WARNING_CODES` entry into an `Hl7ParseError` throw — sweep iterates the full registry programmatically                         | COVERED |
| TOL-05 | 02-02       | `test/parser-mllp.test.ts`                                       | MLLP framing (`\x0B` VT / `\x1C\x0D` FS CR) stripped from string and `Buffer` inputs                                                                                  | COVERED |
| TOL-06 | 02-04       | `test/parser-escapes.test.ts`                                    | Unknown escape sequences (`\Qfoo\`) emit `UNKNOWN_ESCAPE` warning and preserve raw bytes verbatim                                                                     | COVERED |
| TOL-07 | 02-02       | `test/parser-normalize.test.ts`                                  | UTF-8 BOM (`U+FEFF` / bytes `0xEF 0xBB 0xBF`) stripped from head of `string` and `Buffer` inputs                                                                      | COVERED |
| TOL-08 | 02-05       | `test/parser-dates.test.ts`                                      | User-supplied `dateFormats` array falls through cascade; previously deferred, retired in Phase 10 Plan 10-04 — now COVERED at HEAD                                    | COVERED |
| TOL-09 | 02-02       | `test/parser-normalize.test.ts`                                  | Mixed line endings (`\r`, `\n`, `\r\n` interleaved) normalized to canonical `\r` segment terminators                                                                  | COVERED |
| TOL-10 | 02-07       | `test/parser-normalize.test.ts`                                  | MSH-18 `characterSet` read from `Buffer` input and honored by decoder; closed in gap-closure plan 02-07                                                               | COVERED |

**Gap summary: 0 MISSING · 0 PARTIAL · 19 COVERED.**

---

## Wave 0 Requirements

_None._ Vitest 1.2.x + `vitest.config.ts` were installed in Phase 1 (SETUP-06). Phase 2 added 14 new test files on top of existing infrastructure — no framework, config, or scaffolding gaps required. Coverage threshold tightening from 85% → 90% branches on `src/parser/**` happened in Phase 7 Plan 06 (post-Phase-2); Phase 2 shipped under the initial 85% gate and subsequently met the tighter bar without backfill.

---

## Manual-Only Verifications

_None._ Every PARSE-01..09 and TOL-01..10 behavior has at least one automated unit or integration test. The `parser-malformed-sweep` and `parser-strict-mode-sweep` files exercise every `FATAL_CODES` and `WARNING_CODES` entry programmatically — no human-eyeball verification is gating.

---

## Validation Sign-Off

- [x] All tasks have automated verify (`pnpm test -- parser*`)
- [x] Sampling continuity: every plan has dedicated test file(s) committed in its wave
- [x] Wave 0 covers all MISSING references (none — infrastructure pre-existed)
- [x] No watch-mode flags
- [x] Feedback latency < 15s full suite
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Verifier PASS 2026-04-18 per `02-VERIFICATION.md`

**Approval:** approved 2026-04-21 (Nyquist audit — State B reconstruction from 7 SUMMARYs + 02-VERIFICATION.md).

---

## Validation Audit 2026-04-21

| Metric               | Count                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Input state          | B (reconstructed from 7 SUMMARYs + 02-VERIFICATION.md)                                                  |
| REQ-IDs audited      | 19 (9 PARSE + 10 TOL)                                                                                   |
| Plans mapped         | 7 (02-01..02-07)                                                                                        |
| Test files mapped    | 14                                                                                                      |
| Gaps found           | 0                                                                                                       |
| Resolved             | 0                                                                                                       |
| Escalated            | 0                                                                                                       |
| Auditor spawn needed | No                                                                                                      |
| Coverage gate        | ≥90% branches on `src/parser/**` enforced via `pnpm test:coverage` (tightened Phase 7 Plan 06)          |

Phase 2 is Nyquist-compliant. Every PARSE-01..09 and TOL-01..10 REQ maps 1:1 to at least one dedicated test file with runtime-enforced branch coverage ≥90%. The Phase 10 retired TOL-08 deferred block is reflected here as COVERED (closed in Phase 2 Plan 02-05). TOL-10 closed in gap-closure Plan 02-07. Closes v2.1-MILESTONE-AUDIT tech-debt item 2 for Phase 2.
