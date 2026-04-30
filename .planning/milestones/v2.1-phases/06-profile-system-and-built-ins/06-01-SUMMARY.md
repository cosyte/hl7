---
phase: 06-profile-system-and-built-ins
plan: 01
subsystem: profiles
tags: [defineProfile, profile-validation, customSegments, describe, levenshtein, SUPPORTED_DATE_TOKENS, ProfileDefinitionError]

# Dependency graph
requires:
  - phase: 02-core-parser-and-tolerance
    provides: Profile interface, ProfileDefinitionError class, parseHl7Timestamp token set
  - phase: 05-serialization-and-round-trip
    provides: buildMessage factory pattern (validated-factory-returning-immutable-data analog)
provides:
  - "defineProfile() single-profile (no-extends) factory — name/description/dateFormats/customSegments/onWarning + Object.freeze + describe() method"
  - "4 validators: validateProfileName (D-01), validateOptionKeys (D-07 + Levenshtein hints), validateCustomSegments (D-05), validateDateFormats (D-08)"
  - "SUPPORTED_DATE_TOKENS public export from src/parser/dates.ts — 7 tokens (YYYY/MM/DD/HH/mm/ss/SSSS)"
  - "CustomSegmentDefinition interface canonically declared in src/parser/types.ts, re-exported from src/profiles/define.ts"
  - "Profile interface tightened: customSegments → Record<string, CustomSegmentDefinition>; describe?: () => string added"
  - "buildDescribe() — multi-line describe() output per D-04 (Profile 'name' + conditional lines for description/lineage/customSegments/dateFormats/onWarning)"
affects: [06-02-extends-merge, 06-03-segment-get, 06-05-built-ins, 06-06-barrel-and-fixtures]

# Tech tracking
tech-stack:
  added: []  # Zero new runtime deps per D-33 — inlined Levenshtein (~15 LoC)
  patterns:
    - "Re-export (not re-declare) pattern for shared types: CustomSegmentDefinition lives canonically in src/parser/types.ts; src/profiles/define.ts has `export type { CustomSegmentDefinition } from '../parser/types.js'`"
    - "Inlined Levenshtein distance helper (iterative DP, ≤ 15 LoC) — no new runtime deps for did-you-mean hints"
    - "exactOptionalPropertyTypes-compliant Mutable<T> + conditional assignment (mirrors src/helpers/meta.ts::buildMeta)"
    - "Boundary-freeze-only (Object.freeze at top level; inner arrays stay runtime-mutable per D-30)"
    - "describe() closes over the finalised profile, assigned AFTER scaffolding to reflect fully-assembled state"
    - "Validator ordering: name → keys → customSegments → dateFormats. Each throws ProfileDefinitionError with opts.name as 2nd ctor arg wherever name is known"

key-files:
  created:
    - src/profiles/define.ts
    - src/profiles/validate.ts
    - src/profiles/describe.ts
    - test/profiles-define.test.ts
    - .planning/phases/06-profile-system-and-built-ins/06-01-SUMMARY.md
  modified:
    - src/parser/types.ts
    - src/parser/dates.ts
    - src/builder/control-id.ts  # Rule-3 pre-existing lint blocker fix

key-decisions:
  - "Plan 06-01 lineage is a Wave-1 STUB: defineProfile(opts) returns lineage === [opts.name] regardless of opts.extends. Plan 06-02 replaces the stub body with mergeLineage(parents, opts.name)"
  - "CustomSegmentDefinition canonically declared in src/parser/types.ts alongside Profile (not in src/profiles/define.ts). Zero circular type imports; src/profiles/define.ts re-exports as type so consumers can reach it via either entry point"
  - "SUPPORTED_DATE_TOKENS exported but the internal format matcher only recognizes 6 of 7 tokens — SSSS is validator-only. Milliseconds already flow through the HL7 TS/DTM strict path; the D-08 validator accepts SSSS so profile authors can declare fractional-second formats"
  - "Test file imports SUPPORTED_DATE_TOKENS from `../src/parser/dates.js` directly (not `../src/index.js`) because Plan 06-06 will migrate the barrel sweep. Either path is acceptable NOW — chose direct import since the barrel hasn't been updated yet"
  - "Plan's '<behavior>' test case `dateFormats: ['YYY/MM/DD']` was contradictory — the string contains literal 'MM' which IS a recognised token. Rule-1 test fix: replaced with 'nope' (genuinely token-less) to exercise the true D-08 throw path"

patterns-established:
  - "src/profiles/ directory structure: single-purpose files (define/validate/describe) with relative imports + @internal JSDoc on private helpers"
  - "ProfileDefinitionError throw pattern: message starts with subject ('Profile \\'name\\' ...'), includes offender value via JSON.stringify, suggests fix ('only Z-segments', 'did you mean X?'); second ctor arg is profileName when known"
  - "defineProfile fail-fast name validation FIRST so downstream throws can tag profileName; options-key validation SECOND so unknown-key errors don't cascade into confusing lower-level errors"

requirements-completed: [PROF-01, PROF-02, PROF-04, PROF-05, PROF-07]

# Metrics
duration: 10min
completed: 2026-04-19
---

# Phase 6 Plan 1: defineProfile Core + Validation + Describe + Types Summary

**defineProfile() single-profile factory with D-05/D-07/D-08 validation throws, describe() method, frozen return, and the canonical CustomSegmentDefinition + SUPPORTED_DATE_TOKENS public exports**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-19T23:03:22Z
- **Completed:** 2026-04-19T23:09:42Z
- **Tasks:** 3 (1 Rule-3 auto-fix + 3 planned tasks)
- **Files modified:** 3 created (src/profiles/define.ts, validate.ts, describe.ts), 2 modified (src/parser/types.ts, dates.ts), 1 created (test/profiles-define.test.ts), 1 auto-fix (src/builder/control-id.ts)

## Accomplishments

- `defineProfile({ name: 'x' })` returns a frozen `Profile` with `name === 'x'`, `lineage === ['x']`, empty `customSegments`/`dateFormats`, and a callable `describe()` that returns a non-empty string starting with `Profile 'x'`
- 4 validation throw paths fire on invalid input (D-01 name, D-05 Z-segment-only, D-07 unknown keys with Levenshtein hints, D-08 dateFormats token presence) — every throw uses `ProfileDefinitionError` with `opts.name` as the 2nd ctor arg where known
- `Profile` interface tightened: `customSegments` now typed `Record<string, CustomSegmentDefinition>` (was `unknown`); `describe?: () => string` added so defineProfile()-produced profiles can be introspected without narrowing
- `SUPPORTED_DATE_TOKENS` public-exported — 7 tokens (YYYY/MM/DD/HH/mm/ss/SSSS); validator-only export doesn't widen the format matcher
- 35 new tests covering happy path (frozen return, field preservation, Wave-1 extends-ignored), 4 D-05 customSegments throws + 1 positive case, 2 D-07 unknown-key throws (hint + no-hint), 5 D-08 date-format cases, 6 name-validation throws, 7 describe() structural assertions, and frozen immutability

## Task Commits

Each task committed atomically:

1. **Rule-3 auto-fix: control-id.ts non-null assertion** — `509d7c9` (fix)
2. **Task 1: CustomSegmentDefinition + Profile tighten + SUPPORTED_DATE_TOKENS** — `996e7be` (feat)
3. **Task 2: defineProfile factory + validate + describe** — `446687c` (feat)
4. **Task 3: profiles-define.test.ts (35 tests)** — `bb27b31` (test)

## Files Created/Modified

- `src/parser/types.ts` — Added `CustomSegmentDefinition` interface (canonical declaration); tightened `Profile.customSegments`; added `Profile.describe?`
- `src/parser/dates.ts` — Added `SUPPORTED_DATE_TOKENS` public export (validator-only; format matcher's `TOKENS` unchanged)
- `src/profiles/define.ts` — `defineProfile()` factory + `DefineProfileOptions` interface + `CustomSegmentDefinition` type re-export
- `src/profiles/validate.ts` — 4 validators + inlined 15-LoC Levenshtein + `Z_SEGMENT_RE` + `TOKEN_MATCH_RE`
- `src/profiles/describe.ts` — `buildDescribe()` (D-04 multi-line formatter with exactOptionalPropertyTypes-compliant omissions)
- `test/profiles-define.test.ts` — 35 tests across 9 describe blocks
- `src/builder/control-id.ts` — Replaced `bytes[i]!` with `bytes[i] ?? 0` (pre-existing Phase 5 lint regression that was blocking Plan 06-01's `--max-warnings=0` gate)

## Decisions Made

- **Wave-1 lineage stub:** `lineage: readonly string[] = Object.freeze([opts.name])` — literally ignores `opts.extends`. Plan 06-02 replaces this single line with `mergeLineage(parents, opts.name)` which flattens parent lineages and dedupes by first occurrence per D-03. The current test `"Wave-1: extends option accepted but lineage stays [name]"` will need its assertion flipped (`["parent", "child"]`) in Plan 06-02 — documented expectation.
- **CustomSegmentDefinition lives in parser/types.ts, re-exported from profiles/define.ts** — avoids the `profiles/ → parser/` + `parser/ → profiles/` circular type edge that would have formed if the type lived in `profiles/` but `Profile.customSegments` referenced it. Single source of truth; TypeScript structural equivalence makes `import type { CustomSegmentDefinition } from "../src/profiles/define.js"` identical to `from "../src/parser/types.js"`.
- **SUPPORTED_DATE_TOKENS is validator-only** — `TOKENS` inside dates.ts stays 6 tokens (no SSSS) because the format-string matcher doesn't need fractional-second slots (milliseconds already handled by `parseHl7TsDtm`). Adding SSSS to the public list lets profile authors declare `"YYYYMMDDHHmmss.SSSS"` as a dateFormat without the D-08 validator rejecting it; if a user actually passes `"123"` to match `SSSS` at runtime, the matcher returns `undefined` and falls through to the built-in fallbacks — no crash, just no match. Acceptable trade-off per plan guidance ("format matcher expansion is NOT required for Phase 6").
- **Test import path for SUPPORTED_DATE_TOKENS:** `../src/parser/dates.js` (direct) not `../src/index.js` (barrel). Plan 06-06 will migrate the barrel; until then the direct import compiles and is explicit about where the token set lives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing non-null assertion in src/builder/control-id.ts**
- **Found during:** Task 1 verification (`pnpm lint --max-warnings=0`)
- **Issue:** Phase 5 WR-03 refactor (`4d5e281`) introduced `bytes[i]!` which violates `@typescript-eslint/no-non-null-assertion`. The pre-existing lint error blocked Plan 06-01's required lint gate even though no files I touched were flagged.
- **Fix:** Replaced `bytes[i]!` with `bytes[i] ?? 0`. Loop bound is a literal 6 matching the randomBytes() request, so the fallback is a correctness-preserving no-op that satisfies both `noUncheckedIndexedAccess` and `no-non-null-assertion`.
- **Files modified:** src/builder/control-id.ts
- **Verification:** `pnpm lint --max-warnings=0` clean; `pnpm test` 658/658 passing (no controlId regression).
- **Committed in:** `509d7c9` (standalone Rule-3 fix commit — separated from Task 1 to keep the Phase 5 regression fix independently revertable).

**2. [Rule 1 - Bug] Plan's D-08 behavior example `dateFormats: ['YYY/MM/DD']` was contradictory**
- **Found during:** Task 3 (test/profiles-define.test.ts) — test case "throws on format with no recognised token (YYY/MM)" failed because the regex `(YYYY|MM|DD|HH|mm|ss|SSSS)` legitimately matches `MM` and `DD` inside `"YYY/MM/DD"`.
- **Issue:** Plan's `<behavior>` block listed `"YYY/MM/DD"` as a negative case under D-08, but any string containing a month or day literal would pass. The behavior note's intent ("no recognised token") is correct; the example is just wrong.
- **Fix:** Changed the test's format string from `"YYY/MM"` to `"nope"` — a genuinely token-less string. Inline comment documents why the plan's example didn't work.
- **Files modified:** test/profiles-define.test.ts
- **Verification:** Test now passes; all 35 tests in file green.
- **Committed in:** `bb27b31` (Task 3 commit, inline).

---

**Total deviations:** 2 auto-fixed (1 Rule-3 blocking lint, 1 Rule-1 test bug)
**Impact on plan:** No scope creep. The Rule-3 fix was strictly necessary to satisfy Plan 06-01's acceptance gate (`pnpm lint --max-warnings=0`). The Rule-1 test fix corrected a contradiction in the plan's own test example and left the D-08 semantic intact.

## Issues Encountered

None beyond the two deviations above. The plan was precise enough that Tasks 1, 2, 3 executed nearly verbatim.

## Known Stubs

**Wave-1 lineage stub** in `src/profiles/define.ts` line 112:
```typescript
const lineage: readonly string[] = Object.freeze([opts.name]);
```
Plan 06-02 (Wave 2) replaces this with a real `mergeLineage(parents, opts.name)` call that flattens parent `lineage` arrays and dedupes preserving first occurrence per D-03. The Wave-1 test `"extends option accepted but lineage stays [name]"` anchors the current contract; Plan 06-02 will flip the assertion to `["parent", "child"]` and add broader extends tests.

## Next Phase Readiness

- **Plan 06-02 (extends merge):** Can build directly on the stable `defineProfile(opts): Profile` signature + `DefineProfileOptions.extends` input key. Lineage stub at line 112 is the ONLY line Plan 06-02 must replace; validator signatures are stable.
- **Plan 06-03 (Segment.get + UNKNOWN_SEGMENT emit/suppression):** Plan 06-01 provides the validated `CustomSegmentDefinition` shape — Plan 06-03 can assume `profile.customSegments[name].fields` is a `Record<string, number>` with all positions ≥ 1.
- **Plan 06-05 (built-in profiles):** Each of epic/cerner/meditech/athena/genericLab can now author itself as `defineProfile({ name, dateFormats, customSegments })`. SUPPORTED_DATE_TOKENS confirms which tokens are recognised.
- **Plan 06-06 (barrel):** Will add `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, `profiles`, `DefineProfileOptions`, `CustomSegmentDefinition`, `SUPPORTED_DATE_TOKENS` to `src/index.ts`. All names stable.

## Self-Check: PASSED

- `src/profiles/define.ts` — FOUND
- `src/profiles/validate.ts` — FOUND
- `src/profiles/describe.ts` — FOUND
- `test/profiles-define.test.ts` — FOUND
- `src/parser/types.ts::CustomSegmentDefinition` interface — FOUND (grep match line 122)
- `src/parser/dates.ts::SUPPORTED_DATE_TOKENS` export — FOUND (grep match line 233)
- Commit `509d7c9` (Rule-3 auto-fix) — FOUND
- Commit `996e7be` (Task 1) — FOUND
- Commit `446687c` (Task 2) — FOUND
- Commit `bb27b31` (Task 3) — FOUND

Full suite: 658/658 tests green (+35 from baseline 623); typecheck clean; lint `--max-warnings=0` clean; build produces valid dual ESM/CJS dist.

---
*Phase: 06-profile-system-and-built-ins*
*Completed: 2026-04-19*
