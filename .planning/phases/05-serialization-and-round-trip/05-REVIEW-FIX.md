---
phase: 05-serialization-and-round-trip
fixed_at: 2026-04-19T00:00:00Z
review_path: .planning/phases/05-serialization-and-round-trip/05-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-04-19
**Source review:** `.planning/phases/05-serialization-and-round-trip/05-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 4
- Fixed: 4
- Skipped: 0
- Info findings skipped by scope policy: 6 (IN-01..IN-06 deferred to maintenance)

Pre-fix baseline: 618 tests passing. Post-fix: 623 tests passing (5 new regression tests added — 1 for WR-01, 4 for WR-04). `npx tsc --noEmit` clean. Zero behavior regressions in the existing 618 tests.

## Fixed Issues

### WR-01: `emitMessage` emits a bare `"\r"` for an empty-segments message

**Files modified:** `src/serialize/to-string.ts`, `test/serialize-to-string.test.ts`
**Commit:** `f82e013`
**Applied fix:** Added a zero-segment guard at the top of `emitMessage` that throws a typed `Error` ("refusing to emit a message with zero segments") — mirrors the D-06 MSH guard in `emitSegment`. Updated the JSDoc to document the one-case deviation from D-07 "never throws" purity. Added a regression test that constructs a zero-segment `Hl7Message` directly via `new Hl7Message({ segments: [], ... })` and asserts the throw.

### WR-02: `emitMshSegment` silently ignores MSH-2 stored in `rawSegments[0].fields[1]`

**Files modified:** `src/serialize/to-string.ts`
**Commit:** `ca9c665`
**Applied fix:** Documentation-only — added an "IMPORTANT" block to the internal `emitMshSegment` JSDoc explaining that `seg.fields[0]` and `seg.fields[1]` content is ignored, with `msg.encodingCharacters` as the single source of truth per D-06. Documents the deliberate D-01 deviation and the responsibility handoff for synthetic-message authors. Did not add an invariant-assert because the review's own analysis noted D-07 purity argues against it. No behavior change.

### WR-03: `generateControlId` uses `Math.random()` — collisions possible under concurrent load

**Files modified:** `src/builder/control-id.ts`
**Commit:** `4d5e281`
**Applied fix:** Replaced `Math.random()`-based suffix generation with `node:crypto.randomBytes(6)` mapped into the 62-char alphanumeric alphabet via modulo. `node:crypto` is Node stdlib so the D-31 zero-dep constraint holds. Updated JSDoc to reflect the new implementation and the negligible modulo bias (62 buckets from 256 — still >35 bits effective suffix entropy, and the 17-char ms timestamp prefix further partitions the ID space). Existing 8 tests (including the 100-distinct-ID probabilistic collision check) all still pass; no new tests needed as shape+distinctness assertions are unchanged.

### WR-04: `compositeField` in `buildMessage` — cannot reject `"^"` / `"^^"` malformed type strings

**Files modified:** `src/builder/build-message.ts`, `test/builder.test.ts`
**Commit:** `02ddcba`
**Applied fix:** Tightened D-16 validation in `buildMessage`: after the existing `.trim().length === 0` check, split `init.type` on `^` and reject when every component is empty/whitespace. Catches `"^"`, `"^^"`, `"   ^   "` etc. before they produce malformed MSH-9 output. Updated `BuildMessageInit.type` JSDoc to document splitting behavior, the constraint on literal `^` in components (not representable — use `.setField("MSH.9.1", ...)` after construction), and the runtime rejection rules. Added 4 regression tests covering the three rejected shapes plus an affirmative test that a single-component type like `"ADT"` (no `^`) still succeeds.

## Skipped Issues

None.

## Verification

- Full test suite (`pnpm test`): 623 passing, 49 test files.
- TypeScript strict check (`npx tsc --noEmit`): clean.
- All 4 commits atomic and individually verified (tests passed after each).
- Guardrails respected: no `any`, no unjustified `as`, no `console.*`, JSDoc `@example` preserved on public exports, zero runtime deps (crypto is stdlib), immutable-by-default honored.

---

_Fixed: 2026-04-19_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
