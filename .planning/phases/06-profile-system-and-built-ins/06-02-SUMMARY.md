---
phase: 06-profile-system-and-built-ins
plan: 02
subsystem: profiles
tags: [defineProfile, extends, merge, lineage, D-03, D-09, D-10, D-11, D-12, D-05, D-06, ProfileDefinitionError, onWarning-chain]

# Dependency graph
requires:
  - phase: 06-profile-system-and-built-ins
    plan: 01
    provides: defineProfile single-profile factory + 4 validators + CustomSegmentDefinition canonical + SUPPORTED_DATE_TOKENS + Wave-1 lineage stub
provides:
  - "src/profiles/merge.ts — 6 pure helpers (normaliseParents, mergeLineage, mergeDateFormats, mergeCustomSegments, mergeScalar, composeOnWarning)"
  - "defineProfile() extends support: lineage flattening + dedupe, dateFormats concat+dedupe, customSegments position-indexed deep-merge, scalar last-wins, onWarning chain with try/catch per handler"
  - "src/profiles/validate.ts extended: validateUniqueFieldNames (D-06 post-merge defense-in-depth)"
  - "Post-merge re-validation flow: D-05 Z-only catches rogue-parent bypass; D-06 validator installed (unreachable today, guards against future merge-strategy changes)"
affects: [06-03-segment-get, 06-05-built-ins, 06-06-barrel-and-fixtures]

# Tech tracking
tech-stack:
  added: []  # Zero new runtime deps per D-33
  patterns:
    - "Pure-reducer merge helpers: every helper takes readonly parents[] + self value, returns frozen result, never mutates input"
    - "Position-indexed accumulator for customSegments merge (Map<segName, Map<position, fieldName>>) — later layers overwrite same-position entries; non-colliding positions survive additively"
    - "First-occurrence dedupe via Set tracker (lineage + dateFormats both use this shape)"
    - "composeOnWarning wraps EVERY handler in try/catch — uniform D-12 behavior regardless of chain length (single handler + parent+child chain both use same code path)"
    - "Defense-in-depth validator pattern: validateUniqueFieldNames is unreachable under the current merge strategy but cheap to run and becomes reachable if a future contributor changes mergeCustomSegments to a name-keyed accumulator. JSDoc documents the runtime observation + rationale."

key-files:
  created:
    - src/profiles/merge.ts
    - test/profiles-extends.test.ts
    - .planning/phases/06-profile-system-and-built-ins/06-02-SUMMARY.md
  modified:
    - src/profiles/define.ts
    - src/profiles/validate.ts
    - test/profiles-define.test.ts

key-decisions:
  - "composeOnWarning always wraps handlers in a closure — even a single-handler profile gets the uniform D-12 try/catch behavior. The Plan 01 test anchored to reference identity (p.onWarning === handler) was an implementation artifact of the Wave-1 stub; Plan 02 replaces it with a behavior-based assertion (handler runs when onWarning fires). Reference identity was never a documented contract; composeOnWarning's uniform closure is the correct long-term contract."
  - "validateUniqueFieldNames (D-06) is installed as DEFENSE-IN-DEPTH — unreachable under the present mergeCustomSegments strategy (position-indexed accumulator collapses same-name-different-position cases to a single entry). Kept as code-level defense because (a) O(N) cost is negligible; (b) if a future contributor changes the merge to a name-keyed accumulator, this validator becomes reachable and catches the bug before a profile ships. JSDoc carries the rationale."
  - "Pre-merge validation runs in isolation (validate self-declared customSegments + dateFormats BEFORE merging) so D-05/D-08 errors surface with the offending profile's own name, not the composed lineage. Post-merge D-05 re-validation catches rogue-parent bypass (a hand-crafted Profile with non-Z segments sneaking in through extends)."
  - "mergeScalar uses a descending-index scan over parents to find the LAST non-undefined value — matches D-09 'last-wins' ordering (p1 → p2 → child; among parents, later parents override earlier; child's explicit value always wins over every parent)."
  - "normaliseParents returns readonly Profile[] via a tiny Array.isArray narrowing. The `as readonly Profile[]` cast is load-bearing: TS widens Array.isArray to any[] without it, tripping no-unsafe-return. Kept as a targeted cast because `ext` is already typed as `Profile | readonly Profile[] | undefined` — the cast only narrows within an already-safe union."

requirements-completed: [PROF-03]

# Metrics
duration: 5min
completed: 2026-04-19
---

# Phase 6 Plan 2: Extends Merge Semantics Summary

**defineProfile() extends support: lineage/dateFormats/customSegments/onWarning merge (D-03/D-09/D-10/D-11/D-12) + post-merge D-05 re-validation + D-06 defense-in-depth validator**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-19T23:16:36Z
- **Completed:** 2026-04-19T23:21:47Z
- **Tasks:** 2 (+1 Rule-1 inline test fix — onWarning reference-identity assertion replaced with behavior assertion; +1 inline lint fix — `const x: T = {...}` over `{...} as T` in test fixture)
- **Files modified:** 1 created src (src/profiles/merge.ts), 1 created test (test/profiles-extends.test.ts), 2 modified src (src/profiles/define.ts, src/profiles/validate.ts), 1 modified test (test/profiles-define.test.ts)

## Accomplishments

- `defineProfile({ name: 'child', extends: parent })` returns a child profile with full D-03 lineage (`['parent', 'child']`), replacing the Wave-1 stub that froze `['child']` regardless of extends input
- `defineProfile({ name: 'c', extends: [a, b] })` flattens parent lineages preserving first occurrence: `p1.lineage = ['a']` + `p2.lineage = ['a', 'b']` + child `'c'` → `['a', 'b', 'c']`
- Scalar merge (D-09): child overrides parent; absent child falls back to LAST parent with a non-undefined value; empty-undefined child does NOT clear parent
- dateFormats merge (D-10): concat parents (in order) then child, dedupe preserving first occurrence — compatible with the TOL-08 order-sensitive cascade
- customSegments merge (D-11): distinct Z-segments merge additively; fields with distinct positions within the same Z-segment merge additively; child wins on position conflict
- onWarning chain (D-12): parent handler + child handler both fire in lineage order when `profile.onWarning(w)` invoked; handler exceptions silently swallowed (try/catch per handler) so a noisy profile can't break downstream handlers
- Post-merge re-validation: D-05 Z-only catches rogue parents (manually-crafted Profile bypassing defineProfile whose customSegments contain a non-Z key); D-06 defense-in-depth validator installed (unreachable under current merge strategy, documented for future strategy changes)
- `describe()` output reflects merged lineage: `describe()` of `defineProfile({ name: 'b', extends: a })` contains `lineage: a → b`
- Extends result remains frozen: `Object.isFrozen(child)` === true

## Task Commits

Each task committed atomically:

1. **Task 1: merge.ts 6 helpers + validateUniqueFieldNames** — `71d3b0c` (feat)
2. **Task 2: defineProfile extends body + 21 extends tests + 2 Plan-01 test updates** — `e4451b5` (feat)

## Files Created/Modified

- `src/profiles/merge.ts` (NEW) — 6 pure helpers with JSDoc `@internal` on each: `normaliseParents` (Profile | readonly Profile[] | undefined → readonly Profile[]), `mergeLineage` (D-03), `mergeDateFormats` (D-10), `mergeCustomSegments` (D-11 position-indexed strategy), `mergeScalar<K extends keyof Profile>` (D-09 generic last-wins), `composeOnWarning` (D-12 try/catch per handler)
- `src/profiles/validate.ts` — Added `validateUniqueFieldNames` (D-06 post-merge defense-in-depth, with JSDoc explaining runtime observation + rationale for keeping an unreachable validator)
- `src/profiles/define.ts` — Replaced Wave-1 lineage stub with full merge block; added imports for 6 merge helpers + validateUniqueFieldNames; split validation into pre-merge (self in isolation for actionable error messages) + post-merge (D-05 re-application + D-06 defense-in-depth)
- `test/profiles-extends.test.ts` (NEW) — 21 tests across 7 describe blocks: lineage (5), dateFormats (2), customSegments (3), scalars (4), onWarning chain (4), post-merge re-validation rogue parent (1), frozen (1), describe-lineage (1)
- `test/profiles-define.test.ts` — Updated 2 Wave-1 assertions: lineage stub assertion `['child']` flipped to `['parent', 'child']` (plan anticipated this); `p.onWarning === handler` reference-identity assertion replaced with behavior assertion (composeOnWarning wraps every handler for uniform D-12 try/catch)

## Decisions Made

- **composeOnWarning wraps every handler, even a single one.** A single-handler profile now gets the uniform D-12 try/catch. The Plan 01 test that asserted `p.onWarning === handler` (reference identity) was anchored to the Wave-1 stub's implementation detail; Plan 02 replaces that assertion with `typeof p.onWarning === 'function'` + invocation side-effect check. Reference identity was never a documented contract — the DEFINED contract is "handler runs when onWarning fires", and that's what the new assertion verifies. This is the correct long-term shape.
- **validateUniqueFieldNames is installed as defense-in-depth.** Under the current mergeCustomSegments strategy (position-indexed accumulator), a field name cannot survive at two positions after merge — if parent has `{a:3}` and child has `{a:5}`, the accumulator produces `{3:"a", 5:"a"}` which lowers to `{a:5}` (second assignment wins in the final Record). The validator therefore never fires via defineProfile today. It stays as code-level defense because O(N) cost is negligible AND if a future contributor changes mergeCustomSegments to a name-keyed accumulator (e.g. to preserve "last write per name" semantics that COULD allow a name to survive at two positions), the validator immediately becomes reachable and catches the bug. JSDoc carries the full runtime observation + rationale.
- **Pre-merge vs post-merge validation split.** `validateCustomSegments(self, opts.name)` runs BEFORE merge so D-05 errors surface with the OFFENDING profile's name (not the composed lineage). Then after merge, `validateCustomSegments(merged, opts.name)` re-applies D-05 to catch rogue parents (hand-crafted Profile bypassing defineProfile). `validateUniqueFieldNames(merged, opts.name)` runs alongside as defense-in-depth. `validateDateFormats(self, opts.name)` runs pre-merge only because merging doesn't re-introduce D-08 violations (dedupe preserves validated strings from parents — which themselves went through validateDateFormats at their own defineProfile call).
- **Test isolation for Hl7ParseWarning fake.** The `fakeWarning` fixture in `test/profiles-extends.test.ts` uses the declaration form `const fakeWarning: Hl7ParseWarning = { ... }` instead of `{...} as Hl7ParseWarning`. The type-assertion form trips the project's `consistent-type-assertions` ESLint rule; the typed declaration is the project-preferred form (see `test/builder.test.ts` for precedent).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Update] Plan 01 onWarning reference-identity test became incorrect after Task 2 landed**
- **Found during:** Task 2 verification (`pnpm test test/profiles-define.test.ts`)
- **Issue:** `test("preserves onWarning callback reference") { expect(p.onWarning).toBe(handler); }` from Plan 01 asserted reference identity — which only held because the Wave-1 stub forwarded `opts.onWarning` verbatim. Plan 02's composeOnWarning wraps EVERY handler in a closure for uniform D-12 try/catch behavior, so `p.onWarning !== handler` by design.
- **Fix:** Replaced the reference-identity assertion with a behavior assertion — the test now creates a handler with a side effect (`called = true`), invokes `p.onWarning?.(...)`, and asserts `called === true`. The behavior contract (handler runs when onWarning fires) is what matters; reference identity was an implementation artifact of the Wave-1 stub.
- **Files modified:** test/profiles-define.test.ts
- **Rationale:** composeOnWarning's uniform-closure behavior is the documented D-12 contract. The Plan 01 test was pinned to a stub artifact. The replacement assertion is behaviorally equivalent to the original intent ("onWarning callback is wired up") but decoupled from the implementation strategy.
- **Committed in:** `e4451b5` (Task 2 commit, inline)

**2. [Rule 1 - Lint Fix] `as Hl7ParseWarning` test fixture tripped `consistent-type-assertions`**
- **Found during:** Task 2 `pnpm lint --max-warnings=0` verification
- **Issue:** `const fakeWarning = { ... } as Hl7ParseWarning` violated `@typescript-eslint/consistent-type-assertions` (ESLint prefers `const x: T = {...}`).
- **Fix:** Rewrote as `const fakeWarning: Hl7ParseWarning = { ... }` — compiles cleanly because the literal's shape matches the interface; no cast needed.
- **Files modified:** test/profiles-extends.test.ts
- **Committed in:** `e4451b5` (Task 2 commit, inline)

**3. [Rule 1 - Lint Fix] `Array.isArray` widened to `any[]` in normaliseParents**
- **Found during:** Task 1 `pnpm lint --max-warnings=0` verification
- **Issue:** `if (Array.isArray(ext)) return ext;` tripped `@typescript-eslint/no-unsafe-return` — `Array.isArray` narrows to `any[]` in TS even when the input is `Profile | readonly Profile[] | undefined`.
- **Fix:** Added targeted `as readonly Profile[]` cast inside the Array.isArray branch. The cast is load-bearing + safe because the input union already guarantees the shape; `Array.isArray` only tells us it's an array, and the original union constrains it to `readonly Profile[]`.
- **Files modified:** src/profiles/merge.ts
- **Committed in:** `71d3b0c` (Task 1 commit, inline)

---

**Total deviations:** 3 auto-fixed (2 Rule-1 lint, 1 Rule-1 test update stemming from intentional plan-documented stub replacement)
**Impact on plan:** No scope creep. Deviation 1 was explicitly anticipated by the Plan 01 SUMMARY ("the current test `Wave-1: extends option accepted but lineage stays [name]` will need its assertion flipped"); we extended that anticipation to the sibling onWarning test for the same reason. Deviations 2 and 3 are standard project-idiom lint fixes with precedent in `test/builder.test.ts`.

## Issues Encountered

None beyond the three deviations above.

## Known Stubs

None. All extends merge semantics are now fully implemented and tested.

## Next Phase Readiness

- **Plan 06-03 (Segment.get + UNKNOWN_SEGMENT emit/suppression + D-22 makeEmitter hoist):** Can assume merged `customSegments` is a frozen `Record<string, CustomSegmentDefinition>` with all positions validated as positive integers. The D-22 profile.onWarning chain is now a real composed handler (not just passthrough), so Plan 06-03's makeEmitter hoist will invoke the full chain via `effectiveProfile.onWarning?.(w)` exactly once — the chain's internal try/catch protects the emit loop from noisy profiles.
- **Plan 06-05 (built-in profiles):** Built-ins that extend each other (if the vendor catalog grows to use extends) will compose cleanly — lineage, dateFormats, customSegments all merge per the D-03/D-10/D-11 contracts validated in this plan's test suite.
- **Plan 06-06 (barrel):** No new exports from this plan. `src/profiles/merge.ts` helpers are all `@internal`; only `defineProfile` is public and its signature is unchanged from Plan 01.

## Self-Check: PASSED

- `src/profiles/merge.ts` — FOUND (6 exports: normaliseParents, mergeLineage, mergeDateFormats, mergeCustomSegments, mergeScalar, composeOnWarning)
- `src/profiles/validate.ts::validateUniqueFieldNames` — FOUND (grep match line 244)
- `src/profiles/define.ts::mergeLineage\|mergeDateFormats\|mergeCustomSegments\|mergeScalar\|composeOnWarning` — FOUND (5 consumers, grep lines 29-33 imports + lines 132-136 call sites)
- `src/profiles/define.ts::validateCustomSegments(customSegments` — FOUND (line 150 post-merge D-05 re-check)
- `src/profiles/define.ts::validateUniqueFieldNames(customSegments` — FOUND (line 151 post-merge D-06 defense-in-depth)
- `test/profiles-extends.test.ts` — FOUND (21 tests across 7 describe blocks)
- Commit `71d3b0c` (Task 1) — FOUND
- Commit `e4451b5` (Task 2) — FOUND

Full suite: 679/679 tests green (+21 from 658 baseline); typecheck clean; lint `--max-warnings=0` clean; build produces valid dual ESM/CJS dist (93.58 KB + 94.55 KB + 116.60 KB DTS).

---
*Phase: 06-profile-system-and-built-ins*
*Completed: 2026-04-19*
