---
phase: 03-structural-model-and-types
plan: 04
subsystem: model
tags: [hl7, mutation, field-coercion, barrel, namespace, typescript]

# Dependency graph
requires:
  - phase: 02-core-parser-and-tolerance
    provides: RawSegment/RawField/RawRepetition/RawComponent tree, EncodingCharacters
  - phase: 03-structural-model-and-types
    plan: 01
    provides: Segment/Field wrapper classes, Hl7Message traversal (get/getAll/segments/allSegments), dot-path parsePath
  - phase: 03-structural-model-and-types
    plan: 02
    provides: XPN/XAD/CX/CWE/CE/HD composite parsers + interfaces
  - phase: 03-structural-model-and-types
    plan: 03
    provides: XTN/PL/TS/NM composite parsers + interfaces
provides:
  - Field.asXpn/asXad/asCx/asCwe/asCe/asXtn/asPl/asTs/asNm/asHd — 10 composite coercions delegating to their Plan 02/03 parsers with EMPTY_REP fallback
  - Hl7Message.setField(path, value) — chainable in-place mutation with leaf-to-root rebuild; auto-creates missing rep/comp/sub within existing field; throws TypeError on missing segment
  - Hl7Message.addSegment(name, fields) — appends a RawSegment; D-19 segment-name regex enforced
  - Hl7Message.removeSegment(type, occurrence | { all }) — removes by occurrence or all; MSH-protected
  - Hl7Message.invalidateCaches() — private; called by every mutation (D-17 wholesale invalidation)
  - src/model/types/namespace.ts — HL7 namespace body (types-only)
  - src/model/types/index.ts — internal barrel for 10 types + 10 parsers
  - src/index.ts — public barrel exports: 10 composite types + 10 parsers + HL7 namespace (D-13)
affects: [04-helpers-and-named-access, 05-serialization, 06-profiles, 07-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - EMPTY_REP sentinel — frozen RawRepetition with empty components array; fed to every .asXxx() coercion when the field has no repetitions so composites return {} / {raw:"", date:undefined} without throwing
    - Leaf-to-root rebuild on mutation — setField rebuilds RawComponent → RawRepetition → RawField → RawSegment and finally reassigns this.rawSegments; keeps Raw* declared shapes structurally immutable, isolates the mutation window to one readonly-bypass assignment
    - Symmetric segment-name regex between addSegment, removeSegment, and parsePath — /^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u — prevents drift between name validation paths
    - 'export * as HL7 from "./namespace.js"' — types-only namespace rebinding; value exports (parsers) live as named exports alongside, types work as both named and HL7.X access (D-13)

key-files:
  created:
    - src/model/types/namespace.ts
    - src/model/types/index.ts
    - test/model-field-coercions.test.ts
    - test/model-mutation.test.ts
    - test/model-public-exports.test.ts
  modified:
    - src/model/field.ts
    - src/model/segment.ts
    - src/model/message.ts
    - src/index.ts

key-decisions:
  - "Wholesale cache invalidation (drop both _segmentsByType and _allSegments) on every mutation, rather than per-type invalidation. D-17 says 'invalidate the Segment/Field wrapper cache for the affected segment type' but wholesale is equally correct, simpler, and preserves the Plan 01 cross-cache identity guarantee (segments(type) filters from allSegments(), so dropping _allSegments forces both to rebuild consistently)."
  - "[Rule 1 Bug] Segment.field(n) needed a user-facing MSH offset symmetric with dot-path resolver. Previously msg.segments('MSH')[0].field(3) returned fields[3] (= MSH-4) while msg.get('MSH.3') returned fields[2] (= MSH-3). Fixed: Segment.field() now applies n-1 for MSH segments so .field(3) returns MSH-3 consistently with the HL7 1-indexed convention. Not previously tested because Plan 01 tests exercised non-MSH segments only."
  - "setField rebuilds the path leaf-to-root rather than mutating RawComponent.subcomponents in place. Keeps the 'readonly RawX' declared shapes structurally immutable; the only readonly bypass is reassigning this.rawSegments on the Hl7Message itself. Cost: ~125 object allocations per setField (depth × width across HL7 tree levels) — negligible. Benefit: outstanding references to the pre-mutation tree (held e.g. by pre-mutation Segment wrappers) are NOT invalidated structurally; wrapper invalidation happens via cache drop, which is the correct abstraction."
  - "setField auto-creates missing repetitions, components, and subcomponents WITHIN an existing field, but does NOT auto-create missing segments. Matches CONTEXT.md §Claude's Discretion recommendation. Rationale: auto-creating a segment from a field-access call hides intent; the caller should explicitly addSegment first. The thrown TypeError message includes the required addSegment call, so the fix is obvious from the error."
  - "removeSegment('MSH') throws — every HL7 message must retain its MSH segment. Unknown segment types are a no-op (idempotent). Segment-name shape is validated symmetrically with addSegment, so callers see consistent TypeError behavior for malformed names across both methods."
  - "HL7 namespace is types-only; parsers (parseXpn, etc.) are exported as named values alongside. Matches D-13 literally: 'named exports AND re-exported under an HL7 namespace.' Types available in both forms (import type { XPN } / HL7.XPN); parsers in one form (named import only)."
  - "EMPTY_REP is a module-scoped frozen RawRepetition with an empty components array. Shared across all 10 .asXxx() coercions. Composite parsers receiving EMPTY_REP return their empty shape naturally — XPN returns {}, TS returns { raw: '', date: undefined }, NM returns { raw: '', value: undefined } — because readComponent(EMPTY_REP, 0, enc) → undefined → assignment skipped."

patterns-established:
  - "Pattern 1 — Empty-repetition sentinel for composite coercion: when a Field has no repetitions, .asXxx() passes a shared frozen EMPTY_REP so composite parsers don't need a special missing-rep path. Scales identically across optional-field composites and scalar composites."
  - "Pattern 2 — Leaf-to-root rebuild for in-place mutation: setField constructs new RawComponent/RawRepetition/RawField/RawSegment from the bottom up, replacing slots in copied parent arrays. The one readonly bypass (reassigning this.rawSegments) is documented inline."
  - "Pattern 3 — Wholesale cache invalidation via a single private method: mutation methods call this.invalidateCaches() after tree changes. Simpler than per-type invalidation and compatible with the Plan 01 cross-cache-identity guarantee."
  - "Pattern 4 — Types-only HL7 namespace + named parser exports: namespace.ts holds nothing but `export type { ... }`; index.ts adds parsers as value exports. src/index.ts ties both together. Consumers pick the import style, both resolve to the same types."

requirements-completed: [MODEL-06, MODEL-07, TYPES-02]

# Metrics
duration: 8min
completed: 2026-04-19
---

# Phase 3 Plan 04: Mutation methods, Field.asXxx coercions, HL7 namespace barrel Summary

**Phase 3 capstone — wires all 10 `Field.asXxx()` composite coercions, ships `setField`/`addSegment`/`removeSegment` mutation API with cache invalidation, and exports the full public surface via named exports + an `HL7` namespace. TYPES-02, MODEL-06, and MODEL-07 all close; Phase 3 is done.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-19T02:27:24Z
- **Completed:** 2026-04-19T02:35:33Z
- **Tasks:** 3 (2 TDD cycles + 1 straight feat)
- **Files created:** 5 (2 source + 3 test)
- **Files modified:** 4 (src/model/field.ts, src/model/segment.ts, src/model/message.ts, src/index.ts)

## Accomplishments

- **10 Field coercions wired.** `Field.asXpn/asXad/asCx/asCwe/asCe/asXtn/asPl/asTs/asNm/asHd` each delegates to its Plan 02/03 composite parser with a shared frozen `EMPTY_REP` fallback for empty fields. D-09 compliant (no memoization — two calls return distinct object identities). Integration-tested via `parseHL7` against a comprehensive fixture exercising every composite.
- **Mutation API complete.** `setField(path, value)` rebuilds the path leaf-to-root with auto-create of missing repetitions/components/subcomponents within an existing field; throws `TypeError` on missing segment. `addSegment(name, fields)` appends a new segment with D-19 name-regex validation. `removeSegment(type, occurrence | { all })` removes by occurrence or all, protects MSH, is a no-op on unknown types. All three chain (return `this`, D-15), all three invalidate caches wholesale (D-17), none touch `warnings` (D-16).
- **MSH user-facing offset also in Segment.field()** — `msg.segments('MSH')[0].field(3)` now returns MSH-3 consistently with `msg.get('MSH.3')`. Previously Segment.field did straight 1-indexed access so MSH.3 via wrapper returned MSH-4.
- **HL7 namespace + barrel finalized.** `src/model/types/namespace.ts` (types-only re-export), `src/model/types/index.ts` (types + parsers), and `src/index.ts` (full public surface). `import { HL7 } from "@cosyte/hl7-parser"; type T = HL7.XPN` works; `import type { XPN }` works; `import { parseXpn }` works.
- **Full suite: 327/327 tests green across 31 test files** (280 prior + 13 field-coercion + 28 mutation + 6 public-exports). Typecheck, lint (max-warnings=0), and build all exit 0. `dist/index.d.ts` is 80.95 KB with all 10 composite interfaces, the HL7 namespace, and every new public method preserved.

## Task Commits

Each atomic commit captures one piece of the capstone:

1. **Task 1 RED:** `01ace0d` — failing Field.asXxx() integration tests
2. **Task 1 GREEN:** `3b0d07a` — wire 10 coercions + fix Segment.field MSH offset
3. **Task 2 RED:** `4e86d89` — failing mutation API tests
4. **Task 2 GREEN:** `c919278` — setField/addSegment/removeSegment + cache invalidation
5. **Task 3:** `b382c94` — HL7 namespace + public barrel exports

## Files Created/Modified

**Created (source):**
- `src/model/types/namespace.ts` — types-only HL7 namespace body.
- `src/model/types/index.ts` — internal barrel (types + parsers).

**Created (test):**
- `test/model-field-coercions.test.ts` — 13 tests: all 10 coercions, empty-field fallback, non-memoization, first-rep-only.
- `test/model-mutation.test.ts` — 28 tests: setField (9), addSegment (10 via it.each), removeSegment (7), chainability (2).
- `test/model-public-exports.test.ts` — 6 tests: values, types, namespace, type-only imports compile.

**Modified:**
- `src/model/field.ts` — 10 `.asXxx()` methods appended; 10 new imports; `EMPTY_REP` constant.
- `src/model/segment.ts` — `field(n)` applies `n-1` offset for MSH segments so user-facing access matches dot-path resolver.
- `src/model/message.ts` — `setField`, `addSegment`, `removeSegment`, `invalidateCaches`; `SEGMENT_NAME_RE` constant; `toMutableArray` helper.
- `src/index.ts` — 10 named type exports + 10 named parser exports + `export * as HL7` namespace re-export.

## Decisions Made

- **Wholesale cache invalidation** via a single `invalidateCaches()` private method dropping both `_segmentsByType` and `_allSegments`. Simpler than per-type invalidation, and the Plan 01 cross-cache identity guarantee (`segments(type)` filters from `allSegments()`) requires both caches to be in sync — dropping both guarantees that.
- **Leaf-to-root rebuild** on `setField` rather than in-place array mutation. Keeps `readonly Raw*` declared types honest; one readonly bypass is reassigning `this.rawSegments`, documented inline. Cost is ~125 object allocations per mutation — negligible.
- **Auto-create repetitions/components/subcomponents within an existing field** but throw `TypeError` on missing segment. Matches CONTEXT.md Claude's Discretion recommendation. The thrown error message tells the caller exactly how to recover (`addSegment("NOT", [...])`).
- **`removeSegment("MSH")` throws** — MSH is structurally required. Unknown segment types are a no-op so callers can call `removeSegment(x)` idempotently.
- **HL7 namespace is types-only; parsers are named-value exports.** Matches D-13: types available both ways (named + namespace), parsers available as named imports. No value pollution under `HL7.*`.
- **`EMPTY_REP` shared module-scoped frozen sentinel** for `.asXxx()` fallback. Composite parsers consume it naturally — `readComponent(EMPTY_REP, 0, enc)` returns `undefined`, so every optional-field composite skips assignment; TS and NM return their `{raw:"", ...}` shapes via the same code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Segment.field() missed the user-facing MSH offset**
- **Found during:** Task 1 GREEN (first run of coercion tests)
- **Issue:** `Segment.field(n)` indexed `fields[n]` directly regardless of segment type, but for MSH the HL7 user-facing convention is MSH-3 → `fields[2]`, MSH-12 → `fields[11]`. `msg.segments("MSH")[0].field(3).asHd()` returned MSH-4 ("FAC") instead of MSH-3 ("APP^1.2.3^UUID"). Dot-path resolver in `dot-path.ts` had the offset; wrapper `Segment.field()` did not.
- **Fix:** Added `const idx = this.type === "MSH" ? n - 1 : n;` in `Segment.field()` before lookup. Updated JSDoc to document the behavior. Not previously tested because Plan 01 tests exercised non-MSH segments only (`segments("PID")[0].field(5)`).
- **Files modified:** `src/model/segment.ts`.
- **Verification:** Coercion tests for `.asHd on MSH-3` and `.asTs on MSH-7` pass.
- **Committed in:** `3b0d07a` (Task 1 GREEN).

**2. [Rule 1 - Bug] Test fixture field offsets**
- **Found during:** Task 1 GREEN (`.asXad on PID-11`, `.asXtn on PID-13`) and Task 2 GREEN (`setField PID.8`)
- **Issue:** Both the Plan 04 coercion fixture and the mutation fixture had one extra `|` so the data I was targeting landed one field to the right of the plan-intended position (e.g. address at PID-12 instead of PID-11; sex at PID-9 instead of PID-8).
- **Fix:** Counted separators carefully. In `model-field-coercions.test.ts` dropped one `|` between "F" and the address so address = PID-11 and telecom = PID-13. In `model-mutation.test.ts` rewrote the PID line to `PID|||123|ALT~ALT2|Smith^Jane|||F` so PID-5 = "Smith^Jane" and PID-8 = "F" as the test expects.
- **Files modified:** `test/model-field-coercions.test.ts`, `test/model-mutation.test.ts`.
- **Verification:** Tests green.
- **Committed in:** Rolled into `3b0d07a` and `c919278` respectively.

---

**Total deviations:** 2 auto-fixed (1 real bug, 1 fixture discipline). No Rule-4 architectural questions surfaced.

## Issues Encountered

- The `PreToolUse:Edit` hook reminded me to re-read files on each edit to files I'd already read earlier in the session. Continued with the edits; they applied successfully.

## User Setup Required

None — pure code change. No environment variables, no external services, no manual configuration.

## Next Phase Readiness

**Phase 4 (Helpers) ready.** Every named helper Phase 4 ships is pure composition over Phase 3:
- `msg.meta.timestamp` → `msg.segments("MSH")[0]?.field(7).asTs().date`
- `msg.meta.type` → `msg.segments("MSH")[0]?.field(9).value`
- `msg.patient.name` → `msg.segments("PID")[0]?.field(5).asXpn()`
- `msg.patient.address` → `msg.segments("PID")[0]?.field(11).asXad()`
- `msg.patient.mrn` → `msg.segments("PID")[0]?.field(3).asCx().idNumber`

Phase 4 never reaches into `rawSegments`; every helper reads through the Phase 3 public API.

**Phase 5 (Serializer) ready.** `toString()` will walk `this.rawSegments` (post-mutation tree) and call `reescape(value, enc)` on every leaf. Per D-18, mutation values inserted via `setField` are NOT pre-escaped — Phase 5 is the single serializer-side escape gate. D-20 no dirty flag, so Phase 5 walks fresh on every call.

**Phase 6 (Profiles) ready.** Custom Z-segment field-name resolution (PROF-07) will layer on top of `Segment.field(n)` by adding `Segment.get(fieldName: string)` — the current shape supports this extension without reshaping the wrapper.

**Known Stubs:** None. Every behavior documented in the plan's must_haves is exercised by a passing test.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The mutation API T-03-04-0{1..5} dispositions hold as planned:
- T-03-04-01 (setField bypasses escape safety) — accepted, documented, deferred to Phase 5.
- T-03-04-02 (addSegment accepts arbitrary RawField) — mitigated by D-19 name-shape validation; structural RawField validation is TS compile-time.
- T-03-04-03 (DoS via removeSegment all) — mitigated; O(n) filter, no recursion.
- T-03-04-04 (remove MSH corrupts message) — mitigated by hard-coded throw.
- T-03-04-05 (barrel leaks internal helpers) — accepted; `_shared.ts` NOT exported from the public barrel; verified by the new public-exports test.

## Self-Check: PASSED

Verified post-summary:
- All 2 created source files and 3 created test files exist on disk.
- All 4 modified source files show the expected new methods / exports.
- All 5 task commits present in `git log --oneline -8`:
  `01ace0d`, `3b0d07a`, `4e86d89`, `c919278`, `b382c94`.
- `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm test -- --run` (327/327), and `pnpm build` all exit 0.
- `dist/index.d.ts` contains all 10 composite interfaces and `namespace as HL7` in the final re-export line.
- Plan-level TDD gate compliance: 2 `test(...)` commits precede 2 `feat(...)` commits for Tasks 1 + 2; Task 3 is a barrel-only feat with no RED/GREEN split (pure additive barrel re-export, covered by smoke test in same commit).

---
*Phase: 03-structural-model-and-types*
*Completed: 2026-04-19*
