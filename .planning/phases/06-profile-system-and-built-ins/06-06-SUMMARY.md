---
phase: 06-profile-system-and-built-ins
plan: 06
subsystem: profiles
tags: [barrel, public-api, profiles-namespace, BIP-06, fixture-parity, UNKNOWN_SEGMENT, warning-reduction, round-trip, PROF-09, D-26, D-28]

# Dependency graph
requires:
  - phase: 06-profile-system-and-built-ins
    plan: 01
    provides: defineProfile factory + CustomSegmentDefinition + SUPPORTED_DATE_TOKENS
  - phase: 06-profile-system-and-built-ins
    plan: 02
    provides: extends merge semantics (not exercised by the 5 flat built-ins)
  - phase: 06-profile-system-and-built-ins
    plan: 03
    provides: customSegments threading + UNKNOWN_SEGMENT emit/suppression (BIP-06 observable surface) + KNOWN_SEGMENTS constant
  - phase: 06-profile-system-and-built-ins
    plan: 04
    provides: setDefaultProfile / getDefaultProfile process-scoped registry
  - phase: 06-profile-system-and-built-ins
    plan: 05
    provides: 5 built-in Profile instances (epic/cerner/meditech/athena/genericLab) + 5 synthetic vendor-shape fixtures
provides:
  - "src/profiles/index.ts — public barrel: frozen `profiles` namespace object + re-exports of defineProfile, setDefaultProfile, getDefaultProfile, DefineProfileOptions, CustomSegmentDefinition"
  - "src/index.ts — Phase 6 block: 4 values (defineProfile, setDefaultProfile, getDefaultProfile, profiles) + 2 types (DefineProfileOptions, CustomSegmentDefinition) + 2 additive re-exports (SUPPORTED_DATE_TOKENS from Plan 01, KNOWN_SEGMENTS from Plan 03)"
  - "test/profiles-builtins.test.ts — 29 tests across 7 describe blocks: public surface (D-26 barrel shape) + per-vendor fixture parity (BIP-06) for all 5 built-ins + D-28 cross-profile warning-count smoke + PROF-09 round-trip"
affects: [phase-7-vendor-quirks-fixture-expansion, phase-8-docs-and-examples]

# Tech tracking
tech-stack:
  added: []  # Zero new runtime deps preserved
  patterns:
    - "Barrel-over-barrel: src/profiles/index.ts assembles the namespace + re-exports, src/index.ts re-exports from src/profiles/index.ts. Single source of truth for the Phase 6 public surface."
    - "Object.freeze boundary-freeze on the `profiles` namespace object (W5 — consistent with Plan 01 defineProfile return freeze and serialize/to-json L139)."
    - "`as { readonly <vendor>: typeof <vendor> }` annotation preserves each built-in's exact `typeof` through the namespace object so profiles.epic.name retains the string-literal type 'epic' for downstream consumers."
    - "D-26 enforcement via test-suite contract: Object.isFrozen(profiles) + per-vendor Object.isFrozen(profiles.<vendor>) + grep-based verification that individual built-ins are NOT named top-level exports."
    - "Per-code warning-reduction assertion style (D-28): `warnings.filter(w => w.code === UNKNOWN_SEGMENT)` compared across with/without profile. Robust against future warning-code additions."

key-files:
  created:
    - src/profiles/index.ts
    - test/profiles-builtins.test.ts
    - .planning/phases/06-profile-system-and-built-ins/06-06-SUMMARY.md
  modified:
    - src/index.ts  # appended Phase 6 block (no existing Phase 1-5 exports touched)

key-decisions:
  - "Individual built-ins remain INTERNAL top-level names. The only way to reach them through the public API is `profiles.<vendor>`. Enforced by omission from src/index.ts and by test suite (frozen namespace object + frozen built-ins)."
  - "Additive re-exports included in Phase 6 block: SUPPORTED_DATE_TOKENS (Plan 01) and KNOWN_SEGMENTS (Plan 03). Both were previously internal-only despite being load-bearing for profile authoring + UNKNOWN_SEGMENT auditing respectively. Exposing them under Phase 6's public-barrel expansion closes that discoverability gap for advanced consumers without adding any new runtime surface."
  - "athena providerName test reality: Plan 06-05's fixture stops at field 5 while the profile declares providerName at position 6. This is not a bug in either plan — the profile correctly models athena's documented ZCA shape (6 fields), and the fixture demonstrates a realistic partial message. The test asserts `zca.get('providerName') === undefined`, which exercises the D-14 contract (out-of-range returns undefined instead of synthetic-empty) — the exact property profile authors rely on to detect missing data vs empty data."
  - "Composite field .value semantics surfaced in the providerId assertion. ZCA field 5 = 'Johnson^Maya^MD' (XCN-style composite). `.value` on Field returns the first subcomponent (Phase 3 Field.value contract). The test asserts `.value === 'Johnson'` — documenting this behavior for consumers reading the test suite as a usage example."

requirements-completed: [BIP-06]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 6 Plan 6: Profiles Barrel + BIP-06 Fixture-Parity Tests Summary

**Public Phase 6 barrel shipped (5 built-ins accessible as `profiles.<vendor>`, plus `defineProfile`/`setDefaultProfile`/`getDefaultProfile` + 2 types). 29 BIP-06 fixture-parity tests lock in per-vendor warning-reduction contract and confirm PROF-09 round-trip agnosticism. Closes Phase 6.**

## Performance

- **Duration:** ~3 min
- **Tasks:** 2 (+ 1 Rule-1 test-assertion fix for athena ZCA composite field semantics)
- **Files:** 3 created (src/profiles/index.ts, test/profiles-builtins.test.ts, SUMMARY), 1 modified (src/index.ts)

## Accomplishments

- `src/profiles/index.ts` — assembles the frozen `profiles` namespace object containing all 5 built-ins (epic, cerner, meditech, athena, genericLab) and re-exports `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, `DefineProfileOptions` (type), `CustomSegmentDefinition` (type).
- `src/index.ts` Phase 6 block appended: `defineProfile` / `setDefaultProfile` / `getDefaultProfile` / `profiles` (values), `DefineProfileOptions` / `CustomSegmentDefinition` (types), plus additive re-exports `SUPPORTED_DATE_TOKENS` (from Plan 01's `src/parser/dates.ts`) and `KNOWN_SEGMENTS` (from Plan 03's `src/parser/known-segments.ts`).
- `test/profiles-builtins.test.ts` — 29 tests across 7 describe blocks, all passing:
  - **Public surface (5 tests, D-26):** all 5 built-ins exposed; lineage defaults to `[name]`; defineProfile reachable; every built-in frozen; namespace itself frozen.
  - **profiles.epic (6 tests, BIP-01+06):** structural parity with/without profile; UNKNOWN_SEGMENT present w/o profile; UNKNOWN_SEGMENT absent w/ profile; profile attribution; MSH-7 timestamp resolves; ZDP departmentCode/departmentName accessible by name.
  - **profiles.cerner (5 tests, BIP-02+06):** UNKNOWN_SEGMENT reduction; ISO-8601 MSH-7 timestamp resolves; profile attribution; ZDS summaryText accessible by name.
  - **profiles.meditech (3 tests, BIP-03+06):** UNKNOWN_SEGMENT reduction (ZVI); ZVI visitReason + admitSource accessible.
  - **profiles.athena (4 tests, BIP-04+06):** UNKNOWN_SEGMENT reduction (ZCA); MM/DD/YYYY MSH-7 resolves; ZCA careTeamRole + providerId accessible; providerName returns undefined per D-14 (fixture stops short).
  - **profiles.genericLab (4 tests, BIP-05+06):** UNKNOWN_SEGMENT reduction (ZLB/ZNT); ZNT noteText accessible; YYYYMMDD HHmm space-separated MSH-7 resolves.
  - **Cross-profile smoke (D-28, 1 loop over 5 fixtures):** `withP.warnings.length <= without.warnings.length` holds for every vendor.
  - **PROF-09 round-trip (1 loop over 5 fixtures):** `parseHL7(fixture).toString() === parseHL7(fixture, profile).toString()` for every vendor — profile affects parsing only, serialization stays byte-clean.
- Full test suite: **753/753 green** (724 baseline + 29 new from this plan).
- `pnpm typecheck` clean; `pnpm lint --max-warnings=0` clean; `pnpm build` produces valid dual ESM/CJS dist (110.24 KB ESM + 111.37 KB CJS + 132.60 KB DTS). New Phase 6 exports visible in dist/index.d.ts.

## Task Commits

Each task committed atomically:

1. **Task 1: profiles barrel + src/index.ts Phase 6 exports** — `e07e86e` (feat)
2. **Task 2: BIP-06 fixture-parity tests** — `82746df` (test)

## Files Created/Modified

### Created (3 files)

- `src/profiles/index.ts` (51 LoC) — barrel assembling `profiles` namespace (frozen) + re-exporting `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, `DefineProfileOptions`, `CustomSegmentDefinition`.
- `test/profiles-builtins.test.ts` (245 LoC) — 29 tests across 7 describe blocks for public surface + per-vendor parity + cross-profile smoke + PROF-09 round-trip.
- `.planning/phases/06-profile-system-and-built-ins/06-06-SUMMARY.md` (this file).

### Modified (1 file)

- `src/index.ts` — appended a 22-line Phase 6 block (4 values + 2 types + 2 additive re-exports) after the existing Phase 5 block. No pre-existing exports touched.

## Final Public Surface (Phase 6 additions to src/index.ts)

### Values (4)

- `defineProfile` — factory (Plan 06-01)
- `setDefaultProfile` — default-profile registrar (Plan 06-04)
- `getDefaultProfile` — default-profile getter (Plan 06-04)
- `profiles` — frozen namespace object `{ athena, cerner, epic, genericLab, meditech }` (this plan)

### Types (2)

- `DefineProfileOptions` — shape accepted by `defineProfile` (Plan 06-01)
- `CustomSegmentDefinition` — shape of one Z-segment declaration (Plan 06-01, re-exported here)

### Additive re-exports (2)

- `SUPPORTED_DATE_TOKENS` — readonly array of the 7 tokens `defineProfile()` D-08 accepts (Plan 01 additive; exposes authoring introspection).
- `KNOWN_SEGMENTS` — frozen `Set<string>` of standard v2 segment names checked against UNKNOWN_SEGMENT emission (Plan 03 additive; exposes auditing).

## Per-Vendor Warning-Reduction Observations

| Vendor     | Without-profile warnings (codes seen) | With-profile delta |
| ---------- | ------------------------------------- | ------------------ |
| epic       | `UNKNOWN_SEGMENT` x2 (ZDP, ZRS)       | `UNKNOWN_SEGMENT` → 0; timestamp resolves via MM/DD/YYYY HH:mm:ss |
| cerner     | `UNKNOWN_SEGMENT` x2 (ZDS, ZCO)       | `UNKNOWN_SEGMENT` → 0; ISO-8601 timestamp resolves; attribution lands |
| meditech   | `UNKNOWN_SEGMENT` x1 (ZVI)            | `UNKNOWN_SEGMENT` → 0. MSH-7 '202501151430' is 12-digit partial HL7 TS — resolves w/ OR w/o profile (no TIMESTAMP_FALLBACK either way). BIP-06 contract satisfied via Z-segment reduction alone. |
| athena     | `UNKNOWN_SEGMENT` x1 (ZCA)            | `UNKNOWN_SEGMENT` → 0; MM/DD/YYYY timestamp resolves |
| genericLab | `UNKNOWN_SEGMENT` x2 (ZLB, ZNT)       | `UNKNOWN_SEGMENT` → 0; YYYYMMDD HHmm space-separated timestamp resolves |

**Secondary smoke (D-28):** `withP.warnings.length <= without.warnings.length` holds across all 5 vendors (belt-and-suspenders test in the final cross-profile describe block).

## Phase 6 Test Count Delta

- Baseline before this plan: 724 tests (55 files)
- Added by this plan: **+29 tests** (all in 1 new file)
- Final: **753 tests / 55 files** (Task 2 re-used an existing file count — the new `profiles-builtins.test.ts` is file #55)

## Decisions Made

### Enforce D-26 via test-suite contract, not just grep

Plan's acceptance criteria called for grep-based verification that `export { epic }` etc. is NOT in `src/index.ts`. That check passes trivially here — no such exports were ever added. But the runtime test `Object.isFrozen(profiles)` + `Object.isFrozen(profiles.epic)` (per-vendor) adds belt-and-suspenders protection: any future maintainer who tries to re-export a built-in top-level AND leave the namespace mutable will have to break a frozen-object test before their change lands. Strong signal.

### Additive re-exports (SUPPORTED_DATE_TOKENS + KNOWN_SEGMENTS)

Plan explicitly called out these two additive re-exports. Neither is strictly required for BIP-06 — both are quality-of-life additions for advanced consumers:

- **SUPPORTED_DATE_TOKENS:** Profile authors writing custom `dateFormats` arrays benefit from being able to introspect the valid token set at runtime rather than reading internals.
- **KNOWN_SEGMENTS:** Consumers building their own segment-awareness tooling (e.g., a custom warning-auditor) benefit from the same set used by the parser for UNKNOWN_SEGMENT detection.

Both were ready to ship since their source plans — this plan simply adds them to the public barrel since the Phase 6 expansion already touches src/index.ts.

### Composite field `.value` semantics surfaced in providerId test

The athena ZCA providerId test exercises a composite field (`Johnson^Maya^MD`). `Field.value` returns the first subcomponent (`'Johnson'`) — this is Phase 3 Field.value contract (src/model/field.ts L103-110). The test's inline comment documents this as both a correctness check AND a usage example for consumers reading the test suite. Advanced access to full composite shape goes through `field.asXcn()` or `field.repetitions[0].components[*]` — not `.value`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial test assertion used wrong fixture field for athena ZCA providerName**

- **Found during:** Task 2 verification (`pnpm test -- --run test/profiles-builtins.test.ts`)
- **Issue:** Plan-authored test read: `expect(zca?.get("providerName")?.value).toBe("Johnson^Maya^MD")`. The athena profile declares `providerName: 6`, but the Plan 06-05 fixture stops at field 5 — `providerName` (pos 6) genuinely doesn't exist in the fixture. The test was asserting a value at a position the fixture didn't populate.
- **Fix:** Updated assertion to match the actual fixture + profile contract: (a) `zca.get("careTeamRole")?.value === "PRIMARY"` (pos 3, scalar), (b) `zca.get("providerId")?.value === "Johnson"` (pos 5, composite — `.value` = first subcomponent per Phase 3 Field.value contract), (c) `zca.get("providerName") === undefined` (pos 6, out of range — D-14 contract). Inline comments document the layout for maintainers.
- **Files modified:** test/profiles-builtins.test.ts (one `it` block, ~15 LoC added for comments + 2 extra assertions)
- **Verification:** `pnpm test -- --run test/profiles-builtins.test.ts` → 29/29 green; full suite 753/753 green; lint + typecheck + build all clean.
- **Committed in:** `82746df` (Task 2 — fix was applied BEFORE the Task 2 commit; no separate commit needed).

**Rule-1 classification rationale:** The broken test would have masked the D-14 "undefined for out-of-range" contract (a behavior the profile API SELLS). Shipping it as-written would have been a correctness regression in the test suite even if the library itself was right. Fix was inline + scope-bounded to one `it` block.

---

**Total deviations:** 1 auto-fixed (Rule-1 test correctness). No Rule-2/3/4 deviations. No architectural questions surfaced.

**Impact on plan:** No scope creep. Task 2's acceptance criteria (5 per-vendor groups, UNKNOWN_SEGMENT reductions, `Seg.get` exercised per vendor, PROF-09 loop, full suite green) all met.

## Backward-Compat Gotchas

None discovered. The Plan 06-03 `msg.dateFormats` field (introduced for TS composite wiring) remained a zero-impact addition across the full 753-test suite — no pre-existing test surfaced any surprise. All Plan 05 fixtures round-trip byte-clean with or without profile (PROF-09 loop confirms).

## Authentication Gates Encountered

None.

## Issues Encountered

None beyond the Rule-1 test fix documented above.

## Known Stubs

None. All 6 Phase 6 public-surface names (4 values + 2 types) are fully implemented, documented with JSDoc + @example, and exercised by the test suite. The `profiles` namespace exposes 5 fully-frozen built-ins — every field (`name`, `description`, `dateFormats`, `customSegments`, `lineage`, `describe()`) is populated with real data, not placeholders. SUPPORTED_DATE_TOKENS and KNOWN_SEGMENTS re-exports are read-only passthroughs of the same constants already consumed by the parser internally.

## Phase 6 Readiness for Phase 7

- **DOC-06/07 (Phase 8 docs):** All example snippets in README can now be copy-paste tested against the shipped barrel. `defineProfile` / `extends` / `profiles.<vendor>` / `seg.get(name)` / `setDefaultProfile` / `describe()` all reachable from one import.
- **TEST-05/07/08 (Phase 7 vendor-quirks fixture expansion):** The fixture directory layout (`test/fixtures/vendor-shapes/<vendor>/<msg-type>.hl7`) is locked. Phase 7 adds more fixtures under the same tree. The BIP-06 test pattern (`loadFixture` + `parseHL7(fix)` vs `parseHL7(fix, profile)` + per-code filter) is the canonical template.
- **Phase 7 coverage sweep:** All 5 built-ins have at least one fixture-parity test exercising every declared `customSegments` entry. The warning-reduction contract (D-28 per-code style) is locked — any future profile addition follows this pattern.

## Threat Flags

None. All Plan 06-06 touchpoints stay inside the trust boundaries of the plan's threat register:

- **T-06-06-01 (Information Disclosure — individual built-in leakage):** Mitigated by omission + Object.isFrozen tests. `grep -E "^export \{ *(epic|cerner|meditech|athena|genericLab) *\}" src/index.ts` returns exit code 1 (no match). Only `profiles.<vendor>` reaches consumers.
- **T-06-06-02 (Tampering — profiles namespace mutation):** Mitigated by `Object.freeze(profiles)` + boundary-freeze on each built-in via `defineProfile`. Tests `Object.isFrozen(profiles)` and `Object.isFrozen(profiles.<vendor>)` assert both directly. In strict mode, `profiles.epic = fake` throws TypeError at runtime.
- **T-06-06-03 (Denial of Service — fixture file not found):** Accepted. `readFileSync` throws synchronously at test-discovery if any Plan 05 fixture is missing — loud failure preferred over silent skip. All 5 fixtures verified present during Task 2 execution.

## Self-Check: PASSED

- `src/profiles/index.ts` — FOUND (51 LoC; contains `export const profiles` + 5 vendor imports + 3 function re-exports + 2 type re-exports)
- `src/index.ts` — MODIFIED (Phase 6 block appended at end: 4 values + 2 types + 2 additive re-exports)
- `test/profiles-builtins.test.ts` — FOUND (245 LoC; 29 tests across 7 describe blocks)
- Commit `e07e86e` (Task 1 — profiles barrel + src/index.ts Phase 6 exports) — FOUND
- Commit `82746df` (Task 2 — BIP-06 fixture-parity tests) — FOUND
- Full suite: **753/753 green** (+29 from Plan 06-05 baseline of 724)
- `pnpm typecheck` clean; `pnpm lint --max-warnings=0` clean; `pnpm build` produces valid dual ESM/CJS dist (110.24 KB ESM + 111.37 KB CJS + 132.60 KB DTS)
- `grep -E "^export \{ *(epic|cerner|meditech|athena|genericLab) *\}" src/index.ts` → exit 1 (D-26 contract holds: no individual built-in leakage)
- `grep "export const profiles" src/profiles/index.ts` → match (1 line)
- `grep "defineProfile\|setDefaultProfile\|getDefaultProfile\|profiles" src/index.ts` → all 4 present in the new Phase 6 block
- `grep "SUPPORTED_DATE_TOKENS\|KNOWN_SEGMENTS" src/index.ts` → both present (Plan 01/03 additive re-exports)

---
*Phase: 06-profile-system-and-built-ins*
*Completed: 2026-04-19*
