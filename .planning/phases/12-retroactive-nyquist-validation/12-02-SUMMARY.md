---
phase: 12-retroactive-nyquist-validation
plan: 02
subsystem: validation-docs
tags: [retroactive-validation, nyquist, paper-trail, phase-02, gap-closure, v2.1-audit]

# Dependency graph
requires:
  - phase: 02-core-parser-and-tolerance
    provides: 7 plan SUMMARYs + 02-VERIFICATION.md — source evidence transcribed into new VALIDATION.md
  - phase: 11-retroactive-verification
    provides: verification precedent (Nyquist validation relies on a passed verifier; 02-VERIFICATION.md was already ratified pre-Phase-12)
  - phase: 12-retroactive-nyquist-validation
    provides: 12-01 established the header-width / Prettier column-alignment convention reused here
provides:
  - Retroactive Phase 2 Nyquist validation report at `.planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md`
  - 19/19 Phase-2 REQ-IDs (9 PARSE + 10 TOL) classified as COVERED with dedicated test-file evidence
  - Split-subtable pattern for REQ cross-reference (PARSE + TOL in separate subtables) to reconcile Prettier column alignment with single-space-grep verification gates
affects: [phase-12-nyquist-audit, v2.1-milestone-audit-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State B reconstruction — VALIDATION.md assembled mechanically from SUMMARY + VERIFICATION artifacts, no fresh /gsd-validate-phase run"
    - "Split-subtable REQ cross-reference — when REQ-ID family widths differ (PARSE-0N = 8 chars vs TOL-0N = 6 chars), use one subtable per family so Prettier single-space padding satisfies the grep verification regex for all rows"
    - "Header narrowing convention (continued from 12-01) — `ID` as header name for both tables so Prettier's column alignment keeps data rows single-space padded"

key-files:
  created:
    - .planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md
  modified: []

key-decisions:
  - "Split Requirement → Test Cross-Reference into two subtables (PARSE, TOL) — Prettier cannot pad `PARSE-01` (8 chars) and `TOL-01` (6 chars) to the same column width with single-space trailing padding, and the plan's verification grep requires `^\\| (PARSE-0[1-9]|TOL-0[1-9]|TOL-10) \\|` (exactly one trailing space). Two subtables lets each family reach its own uniform width with single-space padding."
  - "Reused `ID` narrow-header convention from 12-01 for both the Per-Task Verification Map and the two REQ subtables"
  - "`reconstructed_from: artifacts (State B ...)` frontmatter keyword reused from 12-01 to flag this as paper-trail fill, not a fresh audit"
  - "TOL-08 documented as COVERED in the REQ evidence cell with an inline note that the deferred block was retired in Phase 10 Plan 10-04 — avoids a misleading PARTIAL/DEFERRED classification at HEAD"

patterns-established:
  - "Two-subtable Nyquist REQ-cross-reference shape — for phases with heterogeneous REQ-ID widths, split by family; each subtable satisfies single-space-padding grep constraints independently"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-04-21
---

# Phase 12 Plan 02: Phase 2 Retroactive Nyquist Validation Summary

**Retroactive Nyquist validation report for Phase 2 (Core Parser & Tolerance) — all 19 REQ-IDs (9 PARSE + 10 TOL) classified COVERED with dedicated test-file evidence across 7 plans and 14 test files; split-subtable REQ-cross-reference pattern established to reconcile Prettier column alignment with single-space-grep verification gates.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-21T00:00:00Z (executor invocation)
- **Completed:** 2026-04-21
- **Tasks:** 3 (read-evidence, write-file, verify+commit) — Tasks 1 + 2 were journal/prep work; Task 3 produced the single new-file commit per plan scope
- **Files created:** 1 (`.planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md`, 134 lines)

## Accomplishments

- Wrote `.planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md` with all 8 required sections (Test Infrastructure, Sampling Rate, Per-Task Verification Map, Requirement → Test Cross-Reference, Wave 0 Requirements, Manual-Only Verifications, Validation Sign-Off, Validation Audit 2026-04-21).
- Transcribed 7 plan rows (02-01..02-07) into the Per-Task Verification Map with scoped `pnpm test` Automated Command entries.
- Transcribed 19 REQ rows (PARSE-01..09 + TOL-01..10) into the Requirement → Test Cross-Reference table across two subtables — all classified COVERED with concrete test-file anchors.
- Closed v2.1-MILESTONE-AUDIT tech-debt item 2 for Phase 2 (missing VALIDATION.md).

## Task Commits

Each task's artifacts were consolidated into the single Task 3 commit per plan scope (Tasks 1 + 2 were journal/prep work with no file emission of their own):

1. **Task 1: Read Phase 2 source artifacts + extract per-plan and per-REQ evidence** — no commit (journal-only by design)
2. **Task 2: Write 02-VALIDATION.md** — no commit (included in Task 3)
3. **Task 3: Verify format, path integrity, and commit** — `b394988` (docs)

**Plan metadata:** this SUMMARY — committed separately as `docs(12-02): complete plan SUMMARY — Phase 2 retroactive VALIDATION.md shipped`

## Files Created/Modified

- `.planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md` — new; 134 lines; Phase 2 Nyquist validation report (`status: approved`, `nyquist_compliant: true`, `wave_0_complete: true`, 19/19 REQ COVERED)

## Decisions Made

- **Split REQ subtables:** Prettier normalizes column widths to the widest cell in the column. With `PARSE-01` (8 chars) and `TOL-01` (6 chars) in the same column, TOL rows get two-space trailing padding to match the PARSE-row width — breaking the plan's `^\| (PARSE-0[1-9]|TOL-0[1-9]|TOL-10) \|` grep regex (requires exactly one trailing space). Splitting into a PARSE subtable (all 8-char IDs) and a TOL subtable (all 6-char IDs) lets each reach uniform single-space padding independently. Verified: grep matched all 19 rows post-format.
- **Header narrowing (`ID` not `REQ-ID` / `Task ID`) continued from 12-01** — same mechanical reason: lets Prettier align to data-row width instead of header width.
- **TOL-08 inline note rather than a Notes column:** kept the evidence cell prose, appended a sentence documenting the retired Phase-10 deferred block. Avoided adding a 6th column just for one note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split REQ cross-reference table into PARSE and TOL subtables to satisfy the plan's verification grep pattern after Prettier alignment**

- **Found during:** Task 2 (Write 02-VALIDATION.md) — caught pre-commit via format-dry-run with a representative fixture.
- **Issue:** The plan's verification block (`<automated>`) requires `grep -cE '^\| (PARSE-0[1-9]|TOL-0[1-9]|TOL-10) \|' ... -eq 19`. This regex matches only rows with exactly one space between the REQ-ID and the trailing `|`. When PARSE-0N (8 chars) and TOL-0N (6 chars) coexist in a single Prettier-aligned column, Prettier pads TOL rows to 8 chars with two trailing spaces (`| TOL-01   |`) — regex matches only the 9 PARSE rows, yielding count=9 instead of the required 19.
- **Fix:** Split the Requirement → Test Cross-Reference section into two subtables — one for the 9 PARSE requirements and one for the 10 TOL requirements. Each subtable's rows are width-uniform, so Prettier single-space-pads within its own table. Added a brief preamble sentence explaining the split is a Prettier-alignment mechanic, not a semantic grouping.
- **Files modified:** `.planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md` (Requirement → Test Cross-Reference section split; all 19 rows preserved; gap summary retained as `0 MISSING · 0 PARTIAL · 19 COVERED`).
- **Verification:** `grep -cE '^\| (PARSE-0[1-9]|TOL-0[1-9]|TOL-10) \|' ...` = 19 ✓; `pnpm format:check` exit 0 ✓.
- **Committed in:** `b394988` (Task 3 commit — the fix landed before the file was committed, so this is a pre-commit correction, not an amend).

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking formatting mismatch between Prettier alignment and the plan's verification grep pattern, identical root cause to 12-01 but a different mechanical fix because Phase 2 has two REQ-ID families of different widths).

**Impact on plan:** No scope creep. Content unchanged semantically; the split is a mechanical column-width reconciliation between Prettier and the plan's verification contract.

## Issues Encountered

- Prettier/grep column-width mismatch (documented above as Rule 3 deviation).
- `PreToolUse:Write` hook initially flagged an invisible-unicode-character (U+FEFF BOM used as a literal illustration in the TOL-07 evidence cell). Replaced the inline BOM with a textual `U+FEFF` codepoint reference plus the byte-sequence notation — same meaning, no invisible glyph. Happened pre-commit so no follow-up fix in git history.

## User Setup Required

None — this is a docs-only plan. No external services, no env vars, no runtime configuration.

## Next Phase Readiness

- Phase 12 Plan 02 complete; Wave 1 parallel-safe — zero file overlap with 12-01, 12-03..12-06.
- Phase 12 as a whole progresses from 1/6 → 2/6 plans complete.
- Closes v2.1-MILESTONE-AUDIT tech-debt item 2 for Phase 2 specifically; phases 3, 5, 7, 8, 9 still need retroactive VALIDATION.md writes via 12-03..12-06 (Phases 4, 6, 10 already have VALIDATION.md).
- Split-subtable pattern now established — 12-03..12-06 should apply it whenever a phase has heterogeneous REQ-ID families (e.g., Phase 3 has two families, Phase 7 has four).
- No blockers; no carry-forward REQ-IDs (Phase 12 closes no library REQs — it only documents REQs already closed in Phase 2).

## Self-Check

- `.planning/phases/02-core-parser-and-tolerance/02-VALIDATION.md` exists ✓ (134 lines)
- Commit `b394988` present in `git log` ✓
- REQ-ID row count = 19 (verified via `grep -cE '^\| (PARSE-0[1-9]|TOL-0[1-9]|TOL-10) \|' ...`) ✓
- Plan row count = 7 (verified via `grep -cE '^\| 02-0[1-7] \|' ...`) ✓
- Zero TODO/TBD/XXX/FIXME placeholders ✓
- All 14 cited `test/*.test.ts` paths exist at HEAD ✓
- `pnpm format:check` exit 0 ✓

## Self-Check: PASSED

---

_Phase: 12-retroactive-nyquist-validation_
_Completed: 2026-04-21_
