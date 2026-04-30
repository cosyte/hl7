---
phase: 03-structural-model-and-types
plan: 01
subsystem: model
tags: [hl7, dot-path, wrapper-classes, typescript, immutability]

# Dependency graph
requires:
  - phase: 02-core-parser-and-tolerance
    provides: Hl7Message shell (D-05), RawSegment/RawField/RawRepetition/RawComponent tree (1-indexed fields), unescape(raw, enc, emit, pos), parseHl7Timestamp cascade, DEFAULT_ENCODING_CHARACTERS
provides:
  - Dot-path tokenizer + resolver (parsePath, resolvePath, DotPath) — accepts PID.5.1, OBX[2].5, PID.3[0].1, PID.5.1.1 depth-collapse, MSH.1/MSH.2 special-case via MSH field offset, returns string | undefined with auto-unescape at leaf
  - Segment wrapper class with lazy Field[] cache — seg.field(3) === seg.field(3) referential stability (D-12)
  - Field wrapper class with isNull / repetitions / value getter / raw + enc + position hooks for Plan 04 composite coercions; Field.empty() sentinel for MODEL-05 never-throws contract
  - Hl7Message traversal methods — get(path), getAll(type), segments(type), allSegments() — with shared Segment wrapper cache (D-11 cross-cache stability) and cross-cache identity (segments filters from allSegments)
  - Public field rename — Hl7Message.segments → Hl7Message.rawSegments (Phase 2 D-05 constructor init key unchanged; only the class field was renamed to free the name for the new method)
affects: [03-02-composites-person-address-identifier, 03-03-composites-telecom-location-timestamp-numeric, 03-04-mutation-and-barrel, 04-helpers-and-named-access, 05-serialization, 06-profiles, 07-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Hand-rolled linear-scan tokenizer with explicit cursor (analog src/parser/dates.ts::matchTokenFormat) — zero runtime deps
    - Lazy, referentially stable wrapper caches keyed by type + master allSegments cache for cross-cache stability
    - MSH field-index offset — MSH.N maps to fields[N-1] so MSH.1 = separator char and MSH.2 = encoding chars, while non-MSH segments use fields[N] directly (fields[0] = name placeholder)

key-files:
  created:
    - src/model/dot-path.ts
    - src/model/segment.ts
    - src/model/field.ts
    - test/model-dotpath.test.ts
    - test/model-segment.test.ts
    - test/model-field.test.ts
    - test/model-traversal.test.ts
  modified:
    - src/model/message.ts
    - src/index.ts
    - test/model-message.test.ts
    - test/parser-public.test.ts

key-decisions:
  - "Public readonly Hl7Message.segments field renamed to rawSegments to free the name for the new segments(type) method. Phase 2 D-05 constructor init key stays segments for backward compat with parser/index.ts construction site. Migration touched 34 raw-tree references across 5 test files."
  - "segments(type) builds from the master _allSegments cache by filtering, so individual Segment wrappers are identical whether obtained via segments('OBX') or allSegments() — cross-cache referential stability for free. Plan 04 mutation can invalidate by dropping _allSegments (the per-type Map rebuilds next access)."
  - "MSH indexing required a one-line offset in the resolver: MSH.N → fields[N-1], non-MSH → fields[N]. fields[0] on MSH is the field separator; fields[0] on other segments is the segment-name placeholder. Phase 2's tokenize.ts established this — verified by test/parser-tokenize.test.ts:29-36."
  - "Depth-collapse (D-04) needed no extra branch: when a component has a single subcomponent, comp.subcomponents[0] is what the normal walk already returns for subcomponentIndex === 1. The commented edge analysis in the resolver documents the reasoning."
  - "Field.empty(enc) accepts enc for API symmetry but returns a module-scoped sentinel built with DEFAULT_ENCODING_CHARACTERS — the synthetic field has no content so encoding is irrelevant on reads."
  - "Segment-name validation shape regex /^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u mirrors D-19 (addSegment) so parsePath rejects the same names addSegment will reject — avoids path/mutation drift."

patterns-established:
  - "Pattern 1 — Linear-scan dot-path tokenizer: single cursor, readDigits/readBracket helpers, TypeError with full path string on every malformed branch. Zero backtracking, O(n), no recursion."
  - "Pattern 2 — Wrapper cache via master-cache filtering: allSegments() builds once; segments(type) filters from that. Mutations drop both; Plan 04 invalidation is one line."
  - "Pattern 3 — @internal on constructors + @example on every non-@internal public export — satisfies ESLint jsdoc/require-example while wrapping classes that are not constructed by users."
  - "Pattern 4 — Field.empty() sentinel: single module-scoped instance honors MODEL-05 never-throws-on-missing while keeping synthetic fields referentially stable."

requirements-completed: [MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05]

# Metrics
duration: 11min
completed: 2026-04-19
---

# Phase 3 Plan 01: Read-path foundation Summary

**Dot-path resolver (PID.5.1 / OBX[2].5 / PID.3[0].1) with Segment/Field wrapper classes, referentially stable caches, and `Hl7Message.get/getAll/segments/allSegments` traversal surface on a renamed `rawSegments` raw tree.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-19T01:52:18Z
- **Completed:** 2026-04-19T02:03:31Z
- **Tasks:** 3 (each with RED test commit + GREEN feat commit)
- **Files created:** 7 (3 source + 4 test)
- **Files modified:** 4 (src/model/message.ts, src/index.ts, test/model-message.test.ts, test/parser-public.test.ts)

## Accomplishments

- `src/model/dot-path.ts` ships `parsePath` + `resolvePath` + `DotPath` descriptor. Covers all 10 CONTEXT.md §Specific Ideas acceptance paths: PID.5.1, PID.5, OBX[2].5, PID.3[0].1, PID.3[1].1, PID.5.1.1 depth-collapse, MSH.1, MSH.2, MSH.12, plus missing-path branches (NOT.9.9, PID.99, out-of-range rep / component / segment occurrence).
- `src/model/segment.ts` and `src/model/field.ts` ship the wrapper classes with cached referential stability (D-11 for Segment, D-12 for Field). Field exposes `raw`, `enc`, `repetitions`, `position` for Plan 04's `.asXxx()` composite coercions to land without rewriting the class.
- `src/model/message.ts` gains `get(path)`, `getAll(type)`, `segments(type)`, `allSegments()`. Cross-cache Segment identity: `segments('OBX')[0] === allSegments().find(s => s.type === 'OBX')`.
- Rename migration: the public `Hl7Message.segments: readonly RawSegment[]` field became `rawSegments` to free the name for the method. 34 test references migrated; 200/200 tests still green.
- Public barrel adds `Segment`, `Field`, `parsePath`, `resolvePath`, and the `DotPath` type.

## Task Commits

Each task was committed atomically with RED/GREEN split per prior Phase 2 TDD convention:

1. **Task 1: dot-path tokenizer + resolver** — `ddbaf9b` (test), `464dbf0` (feat)
2. **Task 2: Segment and Field wrapper classes** — `cb3a2b9` (test), `5aa5d0d` (feat)
3. **Task 3: Hl7Message traversal + rawSegments rename** — `453a617` (test), `d9fc0d2` (feat)

## Files Created/Modified

**Created:**
- `src/model/dot-path.ts` — parsePath/resolvePath/DotPath; linear-scan hand-rolled tokenizer; MSH.N → fields[N-1] offset; auto-unescape at leaf.
- `src/model/segment.ts` — Segment wrapper; lazy `_fieldWrappers` cache; returns Field.empty sentinel for out-of-range positions.
- `src/model/field.ts` — Field wrapper with isNull/repetitions/value/raw/enc/position; Field.empty() sentinel; NOOP_EMITTER for leaf unescape calls.
- `test/model-dotpath.test.ts` — 39 tests covering 10 acceptance paths + 12 malformed-path rejections.
- `test/model-segment.test.ts` — 7 tests for wrapper + cache stability + empty sentinel.
- `test/model-field.test.ts` — 10 tests for isNull/repetitions/value/empty/integration.
- `test/model-traversal.test.ts` — 12 tests for get/getAll/segments/allSegments + cross-cache stability + rawSegments access.

**Modified:**
- `src/model/message.ts` — rename `segments` field to `rawSegments`; add 4 traversal methods + 2 private caches; constructor shape preserved (init.segments still the key).
- `src/index.ts` — new Phase 3 barrel exports: Segment, Field, parsePath, resolvePath, DotPath.
- `test/model-message.test.ts` — 1 raw-tree ref migrated.
- `test/parser-public.test.ts` — 4 raw-tree refs migrated (including a structural type annotation on a local helper).

## Decisions Made

- **Option A rename chosen** for `segments` field collision (per plan guidance). The public raw-tree field became `rawSegments`; the Phase 2 init-key name stays `segments` so parser construction site is untouched. The alternative (expose via getter) would have collided the same way — Option A was the only viable path.
- **Cross-cache Segment identity** via master-cache filtering. `segments(type)` filters `allSegments()` so wrappers are identical across both caches. Simpler than two parallel caches and trivially invalidated by Plan 04 (drop `_allSegments` → per-type Map rebuilds on next access).
- **MSH field offset** implemented as a one-line special case in `resolvePath`. The plan suggested no special branch would be needed; empirical testing showed that `msg.segments[0].fields[1]` is the encoding-chars string and MSH-12 (version) lives at `fields[11]`, so MSH.1 = fields[0] and MSH.12 = fields[11] — i.e. MSH.N maps to fields[N-1]. All other segments use a 1:1 mapping because fields[0] is the segment-name placeholder.
- **Depth-collapse (D-04) is implicit** in the walk — when a component has a single subcomponent, the normal path already returns it. A comment documents the reasoning rather than introducing an extra branch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MSH field-index offset**
- **Found during:** Task 1 (resolvePath tests)
- **Issue:** Plan's PATTERNS.md §MSH.1 / MSH.2 claimed no special branch was needed because Phase 2 placed the separator char at fields[0] and encoding-chars at fields[1]. But the 1-indexed HL7 convention treats MSH.3 as the first data field *after* MSH-2 — so MSH.N (user-facing) must map to fields[N-1] (internal). A uniform `fields[parsed.fieldIndex]` mapping returned wrong values for MSH.1, MSH.2, and MSH.12.
- **Fix:** Added a one-line `rawFieldIndex = parsed.segmentType === "MSH" ? parsed.fieldIndex - 1 : parsed.fieldIndex` with an inline comment explaining the convention and pointing to test/parser-tokenize.test.ts:29-36.
- **Files modified:** src/model/dot-path.ts
- **Verification:** All 10 CONTEXT.md acceptance paths pass including MSH.1 → "|", MSH.2 → "^~\\&", MSH.12 → "2.5".
- **Committed in:** 464dbf0 (feat Task 1)

**2. [Rule 1 - Bug] Test fixture field-position mismatches**
- **Found during:** Task 1 and Task 2 (integration tests)
- **Issue:** Initial fixtures had too many `|` separators — what I intended as PID-5 (name) was landing at PID-4 or PID-6 depending on the fixture.
- **Fix:** Counted separators carefully: the 1-indexed convention means PID-5 requires exactly five `|` separators before the name. Fixtures adjusted in test/model-dotpath.test.ts and test/model-segment.test.ts.
- **Files modified:** test/model-dotpath.test.ts, test/model-segment.test.ts
- **Verification:** All 49 dot-path + wrapper + integration tests pass.
- **Committed in:** Rolled into the GREEN feat commits 464dbf0 and 5aa5d0d.

---

**Total deviations:** 2 auto-fixed (2 bugs caught during test authoring/RED state).
**Impact on plan:** Both were self-contained to this plan. No scope creep. No architectural questions surfaced for Rule 4.

## Issues Encountered

- The plan suggested (via `--run "model-segment|model-field"`) using a regex for `vitest run`. Vitest filters by pattern against test-name content, not file paths. Switched to explicit file paths (`pnpm test -- --run test/model-segment.test.ts test/model-field.test.ts`) during development; full `pnpm test` is used for verification.

## User Setup Required

None — pure code change. No environment variables, no external services, no manual configuration.

## Next Phase Readiness

**Plan 02 / Plan 03 ready.** Field exposes `raw: RawField`, `enc: EncodingCharacters`, `repetitions: readonly RawRepetition[]`, and `position: Hl7Position` — exactly the surface composite parsers need. Composite parsers take `(rep: RawRepetition, enc: EncodingCharacters)` and are WIRED onto Field in Plan 04 via `.asXxx()` methods.

**Plan 04 ready.** Private caches `_segmentsByType: Map<string, readonly Segment[]>` and `_allSegments: readonly Segment[] | undefined` are invalidated wholesale on any mutation. `segments(type)` builds from `allSegments()` so dropping `_allSegments` invalidates everything in one line.

**Known Stubs:** None. Every behavior documented in the plan's must_haves truths is exercised by a passing test.

## Self-Check: PASSED

Verified post-summary:
- All 7 created/modified source files and 1 SUMMARY.md exist on disk.
- All 6 task commits (3 RED + 3 GREEN) are present in `git log --oneline --all`:
  `ddbaf9b`, `464dbf0`, `cb3a2b9`, `5aa5d0d`, `453a617`, `d9fc0d2`.
- `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm test -- --run`, `pnpm build` all exit 0.
- 200 tests passing across 17 test files.

---
*Phase: 03-structural-model-and-types*
*Completed: 2026-04-19*
