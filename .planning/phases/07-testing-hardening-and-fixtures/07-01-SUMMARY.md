---
phase: 07-testing-hardening-and-fixtures
plan: 01
subsystem: test-infrastructure
tags: [test-fixtures, helpers, migration, coverage-baseline]
dependency-graph:
  requires:
    - test/fixtures/round-trip/ (existing 5 files from Plan 05-02)
    - src/parser/index.ts::parseHL7 (helper import target)
    - vitest (expect helper import)
  provides:
    - test/fixtures/canonical/ (directory + 2 migrated fixtures)
    - test/fixtures/edge-cases/ (directory + 3 migrated fixtures)
    - test/_helpers/fixture-code.ts (fileToCode helper)
    - test/_helpers/structural-equivalence.ts (assertStructuralRoundTrip helper)
    - Pre-Phase-7 coverage baseline (recorded in task commit body)
  affects:
    - test/round-trip.test.ts (FIXTURE_DIR, FIXTURES, helper import, loadEdgeCaseFixture added)
tech-stack:
  added: []
  patterns:
    - "Underscore-prefixed test/_helpers/ directory for shared test utilities (D-29)"
    - "Kebab-case fixture filenames encode intent (D-09)"
    - "Two-directory fixture layout: canonical/ + edge-cases/ (D-08)"
key-files:
  created:
    - test/_helpers/fixture-code.ts
    - test/_helpers/structural-equivalence.ts
    - test/fixtures/canonical/adt-a01.hl7 (via rename)
    - test/fixtures/canonical/oru-r01.hl7 (via rename)
    - test/fixtures/edge-cases/decoded-br.hl7 (via rename)
    - test/fixtures/edge-cases/embedded-delimiters.hl7 (via rename)
    - test/fixtures/edge-cases/null-fields.hl7 (via rename)
  modified:
    - test/round-trip.test.ts
  deleted:
    - test/fixtures/round-trip/ (empty directory removed)
decisions:
  - "Extracted assertStructuralRoundTrip to test/_helpers/structural-equivalence.ts (D-19) so Plan 02's canonical-messages.test.ts can import it."
  - "Used `git mv` for all 5 fixture relocations to preserve history (verified via `git log --follow`)."
  - "Kept option (b) from plan: preservation-check `it` blocks stay in round-trip.test.ts with a `loadEdgeCaseFixture` helper, rather than splitting into a second test file."
  - "Applied prettier to the new fixture-code.ts (reformatted single-line chain to multi-line) to satisfy --max-warnings=0 lint + format:check on these files."
metrics:
  duration: "~5 min"
  completed: "2026-04-19"
  tests-delta: "-6 (753 -> 747): three fixtures x two sweep iterations removed from round-trip.test.ts; preservation it-blocks remain."
---

# Phase 7 Plan 01: Round-trip Fixture Migration + Reusable Helpers — Summary

Migrated `test/fixtures/round-trip/` to Phase 7's two-directory layout (`canonical/` + `edge-cases/`), extracted two reusable test helpers, updated the sole consuming test file, and captured a pre-Phase-7 coverage baseline in the commit body so Wave 3 Plan 06 can tighten the branch gate from measured data.

## What changed

### Fixture tree

```
BEFORE                                     AFTER
test/fixtures/round-trip/                  test/fixtures/canonical/
  canonical-adt-a01.hl7         ----->      adt-a01.hl7
  oru-r01-repetitions.hl7       ----->      oru-r01.hl7
  decoded-br.hl7                            test/fixtures/edge-cases/
  embedded-delimiters.hl7       ----->      decoded-br.hl7
  null-fields.hl7               ----->      embedded-delimiters.hl7
                                ----->      null-fields.hl7
(directory removed)
```

All 5 moves use `git mv` (verified 100% similarity + `git log --follow` shows
pre-rename history intact). Byte content unchanged (`\r`-terminated, no
trailing LF) — confirmed via `od -c` after move.

### Helpers (test/_helpers/)

Both live under `test/_helpers/` per D-29. vitest's `include: test/**/*.test.ts`
auto-excludes non-`.test.ts` files under `test/`, so these helpers are imported
but never run as tests.

**test/_helpers/structural-equivalence.ts**
```ts
export function assertStructuralRoundTrip(raw: string): void
```
SER-02 structural round-trip: parseHL7(msg.toString()).rawSegments and
encodingCharacters deep-equal the original. Byte-identity NOT required on
first pass. Extracted verbatim from `test/round-trip.test.ts` lines 46–52.
Plan 02 canonical-messages.test.ts will import this.

**test/_helpers/fixture-code.ts**
```ts
export function fileToCode(filename: string): string
```
Pure string transform: `"mllp-framing-stripped.hl7"` -> `"MLLP_FRAMING_STRIPPED"`.
Enum-agnostic — serves both Plan 04 (WarningCode sweep) and Plan 05 (FatalCode
sweep). JSDoc `@example` block included per CLAUDE.md guardrail.

### test/round-trip.test.ts

- `FIXTURE_DIR`: `round-trip/` -> `canonical/`.
- Added `EDGE_CASE_DIR` + `loadEdgeCaseFixture(name)` helper so the 3 migrated
  edge-case fixtures continue to drive their preservation-check `it` blocks
  without a file split (plan "option (b)").
- `FIXTURES` array: `["canonical-adt-a01", "oru-r01-repetitions", "null-fields",
  "embedded-delimiters", "decoded-br"]` -> `["adt-a01", "oru-r01"]`. The 3
  edge-case fixtures drop out of the sweep loop (structural + idempotency
  pairs); their preservation-check `it` blocks stay and now use
  `loadEdgeCaseFixture`. Plan 03 (parser-edge-cases.test.ts) will re-exercise
  them under the edge-case umbrella.
- Imports `assertStructuralRoundTrip` from the new helper module; removed the
  inline free-function copy.

## Pre-Phase-7 coverage baseline

Captured via `pnpm test:coverage` (exit 0, all thresholds PASSED). The
lines/branches/functions/statements across all five gated directories sit
well above the current per-dir gate of `lines 90, branches 85, functions 90,
statements 90`.

| Directory       | Stmts   | Branch  | Funcs   | Lines   |
|-----------------|---------|---------|---------|---------|
| All files       |  99.02  |  92.13  |  97.61  |  99.02  |
| src/builder/**  | 100.00  |  93.54  | 100.00  | 100.00  |
| src/helpers/**  |  99.71  |  95.09  | 100.00  |  99.71  |
| src/model/**    |  97.27  |  90.26  |  98.03  |  97.27  |
| src/parser/**   |  98.84  |  90.74  | 100.00  |  98.84  |
| src/serialize/**| 100.00  |  92.85  | 100.00  | 100.00  |
| src/profiles/** |  99.27  |  85.00  | 100.00  |  99.27  | (ungated)

**Note for Plan 06 (Wave 3):** the branch threshold of 85 on the 5 gated
directories can safely move to 90 — all five sit at 90.26% or higher for
branches today. `src/profiles/**` (ungated) sits exactly at 85.00% branches;
gating it at 90 would require tightening tests first, so Plan 06 should
leave profiles/** ungated unless it adds the coverage to justify tightening.

## Verification

- `pnpm test` -> `Test Files 55 passed (55), Tests 747 passed (747)`. Green.
- `pnpm typecheck` -> exit 0, no type errors.
- `pnpm lint` -> exit 0, --max-warnings=0 honored.
- `prettier --check` on the 3 files this plan created/modified -> clean after
  one --write pass on `fixture-code.ts` (46 files in the broader repo remain
  format-dirty; that is pre-existing scope, out of this plan).
- `git log --follow test/fixtures/canonical/adt-a01.hl7` -> shows Plan 05-02's
  original commit (proves `git mv` preserved rename history).
- `test ! -d test/fixtures/round-trip` -> OK (directory removed).
- `head -c 8 test/fixtures/canonical/adt-a01.hl7` -> `MSH|^~\&` (first 8 bytes
  verified).

## Test-count delta (753 -> 747) — deviation from plan's automated check

The plan's automated verify grep (`Tests.*753.*passed`) was written expecting
the test count to be unchanged post-migration. In practice, removing three
fixtures from the `FIXTURES = [...] as const` array in round-trip.test.ts
drops the SER-02 sweep pair (`structural` + `idempotent` it-blocks, 2 each)
for null-fields, embedded-delimiters, decoded-br — a total of 6 removed tests.
The plan's `<action>` block explicitly instructs this removal (line 247: "REMOVE
null-fields, embedded-delimiters, decoded-br — these moved to edge-cases/ and
will be exercised by Plan 03"), so this is plan-consistent behavior; the 753
figure in the `<verify>` block was a counting oversight in plan authorship.

Net coverage impact: **zero for this plan** (the 5 preservation it-blocks that
previously co-ran with the 3 fixtures still run, so decoded-br's escape-emit,
null-fields' `isNull` marker, and embedded-delimiters' 5-escape preservation
stay under test). Plan 03 restores the 6-test delta under the edge-case
umbrella.

## Commits

| Task | Message                                                           | Hash    |
|------|-------------------------------------------------------------------|---------|
| 1    | (measurement only — no commit; baseline captured in Task 2 body)  | —       |
| 2    | test(07-01): migrate round-trip fixtures + extract reusable helpers | b7a527a |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied prettier --write to test/_helpers/fixture-code.ts**
- **Found during:** Task 2 final verification (`pnpm format:check`)
- **Issue:** The 5-line `return` statement as authored had a single-line chain
  (`filename.replace(...).replace(...).toUpperCase()`) that Prettier's printWidth
  reformatted to multi-line.
- **Fix:** Ran `pnpm exec prettier --write` on the 3 files this plan touched.
  Only `fixture-code.ts` changed; the other two were already prettier-clean.
- **Files modified:** test/_helpers/fixture-code.ts
- **Commit:** b7a527a (rolled into the single Task 2 commit).

### Documented test-count delta

**2. [Not a fix - plan counting note] `pnpm test` reports 747 (not 753) post-migration**
- **Reason:** Plan's `<action>` removed 3 entries from `FIXTURES`, dropping 6
  sweep `it` blocks. Plan's `<verify>` grep (`Tests.*753.*passed`) contradicted
  that action; the action governs (explicit removal of decoded-br/embedded-
  delimiters/null-fields from sweep per plan line 247).
- **Fix:** None required — plan-consistent. Plan 03 will re-land those 6 tests'
  worth of coverage under `parser-edge-cases.test.ts`.
- **Commit:** b7a527a.

## Self-Check

Verifying claimed artifacts exist and commits are present:

- [x] `test/fixtures/canonical/adt-a01.hl7` -> FOUND
- [x] `test/fixtures/canonical/oru-r01.hl7` -> FOUND
- [x] `test/fixtures/edge-cases/decoded-br.hl7` -> FOUND
- [x] `test/fixtures/edge-cases/embedded-delimiters.hl7` -> FOUND
- [x] `test/fixtures/edge-cases/null-fields.hl7` -> FOUND
- [x] `test/fixtures/round-trip/` -> does not exist
- [x] `test/_helpers/fixture-code.ts` -> FOUND (exports `fileToCode`)
- [x] `test/_helpers/structural-equivalence.ts` -> FOUND (exports `assertStructuralRoundTrip`)
- [x] `test/round-trip.test.ts` -> imports from `./_helpers/structural-equivalence.js`, references `"canonical"` dir
- [x] Commit `b7a527a` -> FOUND in `git log`
- [x] `pnpm test` green (747/747)
- [x] `pnpm typecheck` clean
- [x] `pnpm lint` clean (--max-warnings=0)

## Self-Check: PASSED

## Note for Plan 06 (Wave 3 coverage gate)

Raw numbers in the table above; high-order observation:

1. **Branch threshold 85 -> 90 is safe** on all 5 gated dirs (parser, model,
   helpers, serialize, builder). Lowest branch % among them is
   `src/model/** = 90.26%`, which has a 0.26-point cushion. Plan 06 should
   still audit each file's branches before flipping — any regression in
   model/dot-path.ts (currently 87.17% branches, pulled up by siblings) could
   push the directory average under 90.

2. **`src/profiles/**` is ungated** and sits at exactly branches 85.00%. To
   gate profiles at 90, Plan 06 would need to tighten `profiles/validate.ts`
   (currently 78.57% branches) and `profiles/describe.ts` (85.71%). Plan 06
   decides whether that scope is worth pursuing in v1.

3. **All directories PASS current thresholds with margin** — there is no
   existing gap to close, so Plan 06's work is purely about tightening
   (branches 85 -> 90) or broadening (adding profiles/** gate), not
   remediation.
