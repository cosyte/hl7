---
phase: 06-profile-system-and-built-ins
plan: 04
subsystem: profiles
tags: [setDefaultProfile, getDefaultProfile, default-profile, D-18, D-19, D-20, PROF-08, module-scoped-let, afterEach-discipline]

# Dependency graph
requires:
  - phase: 06-profile-system-and-built-ins
    plan: 01
    provides: defineProfile factory + Profile interface (types) + describe() + frozen return
  - phase: 06-profile-system-and-built-ins
    plan: 03
    provides: effectiveProfile hoist at Step 6.5 + D-22 makeEmitter onWarning chain + merged customSegments / dateFormats consumer in Step 13
provides:
  - "src/profiles/default.ts — first mutable module-scoped `let` in the codebase. setDefaultProfile(profile | null) + getDefaultProfile(): Profile | undefined"
  - "parseHL7 Step 6.5 extended from single-line assignment to 3-branch D-19 discrimination: null → opt-out; Profile → explicit; undefined → fall back to getDefaultProfile()"
  - "13-test profiles-default suite covering basic wiring, D-19 dispatch, D-20 effects equivalence (customSegments + dateFormats + lineage + UNKNOWN_SEGMENT suppression), and afterEach test-isolation contract"
affects: [06-05-built-ins, 06-06-barrel-and-fixtures]

# Tech tracking
tech-stack:
  added: []  # Zero new runtime deps per D-33 — just a module-level let
  patterns:
    - "Module-scoped mutable state via single `let _defaultProfile` — NOT globalThis, NOT symbol-registry, NOT worker-safe. First of its kind in the codebase; intentional trade-off per PROJECT.md Key Decisions (setDefaultProfile EXISTS but is DISCOURAGED)"
    - "Defensive undefined handling via `profile ?? undefined` so a JS caller passing `undefined` (bypassing the `Profile | null` type) gets the same 'clear' semantics as an explicit `null`"
    - "3-branch D-19 discrimination at Step 6.5: explicit null opts out without clearing the registered default; explicit Profile wins over any default; undefined falls back to getDefaultProfile() which may itself be undefined (zero semantic change for unregistered consumers)"
    - "afterEach test-isolation discipline documented in JSDoc (setDefaultProfile) AND enforced in every test file's top-level afterEach hook. Cross-test bleed is the ONLY mitigation for T-06-04-02 per the plan's threat register."

key-files:
  created:
    - src/profiles/default.ts
    - test/profiles-default.test.ts
    - .planning/phases/06-profile-system-and-built-ins/06-04-SUMMARY.md
  modified:
    - src/parser/index.ts

key-decisions:
  - "Module-level `let _defaultProfile: Profile | undefined = undefined` — the SINGLE mutable module-scoped variable in the codebase. Deliberately simple: no class wrapper, no symbol-keyed globalThis registry, no worker sharing. PROJECT.md Key Decisions document this is DISCOURAGED-but-exists; the implementation reflects that posture. Consumers wanting shared-across-workers state implement their own registry."
  - "setDefaultProfile accepts `Profile | null` at the type level but handles `undefined` defensively at runtime via `profile ?? undefined`. A TypeScript caller cannot pass undefined (the signature rules it out) but a JS caller may, and treating it identically to null (clear) is the least-surprising semantic."
  - "getDefaultProfile returns `Profile | undefined`, NOT `Profile | null`. Matches the existing `msg.profile` convention — `undefined` for 'unset', never null. Consistent with D-18."
  - "Plan 04 edits only Step 6.5 of parseHL7 — it does NOT touch Step 11.5 (UNKNOWN_SEGMENT emit site), Step 12 (version extract), or Step 13 (Hl7MessageInit consumer). Plan 03's hoist + D-22 chain + merged-customSegments/dateFormats all automatically cover default profiles because they run against whatever Step 6.5 resolves — which Plan 04 now extends to include the default-profile fallback branch."
  - "D-22 onWarning chain coverage for defaults is INHERITED FOR FREE from Plan 03. Plan 03's makeEmitter captures effectiveProfile in a closure at Step 7; a default-profile onWarning handler fires during parse exactly like an explicit-profile handler — same per-handler try/catch, same BEFORE options.onWarning ordering, same swallow-on-throw. Plan 04 adds no additional wiring or dedicated D-22 tests for defaults."
  - "The afterEach test-isolation discipline is the ONLY T-06-04-02 (cross-test bleed) mitigation. No auto-reset was added per CONTEXT.md Claude's Discretion 'NO auto-reset'. Instead the discipline is documented in 3 places: (a) src/profiles/default.ts JSDoc block; (b) the test file's top-level afterEach hook; (c) a dedicated test-isolation-contract test case that expects `getDefaultProfile() === undefined` at the start of its body (proves the afterEach cleanup from prior tests worked)."

requirements-completed: [PROF-08]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 6 Plan 4: Default Profile Management Summary

**setDefaultProfile(profile | null) + getDefaultProfile(): Profile | undefined — process-scoped default profile management wired into parseHL7 Step 6.5 as a 3-branch D-19 discrimination extending Plan 03's hoist. Closes PROF-08.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-19T23:44:55Z
- **Completed:** 2026-04-19T23:47:39Z
- **Tasks:** 2 (both `type="auto" tdd="true"` — test-first discipline; zero deviations)
- **Files:** 3 created (src/profiles/default.ts, test/profiles-default.test.ts, SUMMARY), 1 modified (src/parser/index.ts Step 6.5 + 1 new import)

## Accomplishments

- `setDefaultProfile(profile)` stores the value; `getDefaultProfile()` returns it
- `setDefaultProfile(null)` clears; `getDefaultProfile()` returns `undefined` (per D-18, not `null`)
- `setDefaultProfile(undefined)` at runtime is treated as `null` (defensive JS caller handling via `profile ?? undefined`)
- Module-level `let` — NOT globalThis, NOT symbol-registry shared, NOT worker-safe; documented in JSDoc
- Re-setting overwrites: `setDefaultProfile(a); setDefaultProfile(b); getDefaultProfile() === b`
- `parseHL7(raw)` with a registered default produces `msg.profile.name === default.name`
- `parseHL7(raw)` with NO default and NO explicit profile produces `msg.profile === undefined` (pre-Plan-04 behaviour preserved)
- `parseHL7(raw, explicit)` with a different registered default always uses `explicit` (D-19 "explicit wins")
- `parseHL7(raw, { profile: null })` opts out for a single call — `msg.profile === undefined` — AND the registered default remains set for subsequent calls (D-19 "opt-out doesn't clear")
- D-20 effects equivalence: customSegments, dateFormats, profile lineage, and UNKNOWN_SEGMENT suppression all land IDENTICALLY via default vs explicit profile (anchored by 4 dedicated equivalence tests)
- D-22 onWarning chain automatically covers default profiles (no additional wiring — inherited from Plan 03's closure-capture at Step 7)
- afterEach test-isolation contract documented in JSDoc AND enforced in the test file's top-level afterEach hook AND verified by a dedicated isolation-contract test case

## Task Commits

Each task committed atomically:

1. **Task 1: src/profiles/default.ts (setDefaultProfile + getDefaultProfile + JSDoc)** — `7de1e63` (feat)
2. **Task 2: parseHL7 Step 6.5 3-branch D-19 extension + 13-test D-19/D-20 suite** — `de10b6b` (feat)

## Files Created/Modified

- `src/profiles/default.ts` (NEW, 81 lines) — The first mutable module-scoped file in the codebase:
  - `let _defaultProfile: Profile | undefined = undefined` at module top (`@internal`)
  - `setDefaultProfile(profile: Profile | null): void` — stores via `profile ?? undefined` (defensive undefined handling)
  - `getDefaultProfile(): Profile | undefined` — returns the stored value (or undefined when unset)
  - JSDoc + `@example` on both exports; afterEach test-hygiene note in setDefaultProfile's JSDoc body
- `src/parser/index.ts` — TWO edits:
  - New import: `import { getDefaultProfile } from "../profiles/default.js"` alongside the existing `Hl7Message` value import
  - Step 6.5 replaced: single-line `const effectiveProfile = profileOpt !== undefined && profileOpt !== null ? profileOpt : undefined` → 3-branch `if/else if/else` discrimination on `options.profile` (null → opt-out; Profile → explicit; undefined → getDefaultProfile() fallback). `const` changed to `let effectiveProfile: Profile | undefined` to allow 3-branch assignment. Every downstream consumer in Steps 11.5 / 12 / 13 reads from `effectiveProfile` verbatim — no other edits needed in the file.
- `test/profiles-default.test.ts` (NEW, 143 lines) — 13 tests across 4 describe blocks:
  - "basic wiring" (4 tests): unset baseline, set-then-get, set-then-null-then-undefined, overwrite
  - "parseHL7 default-profile dispatch (D-19)" (4 tests): no default + no explicit = undefined; registered default = populated; explicit wins; `{ profile: null }` opts out + default persists
  - "D-20 effects equivalence" (4 tests): customSegments, dateFormats, lineage, UNKNOWN_SEGMENT suppression all identical via default vs explicit
  - "test-isolation contract" (1 test): expects `getDefaultProfile() === undefined` at start of test body (proves afterEach cleanup from preceding tests worked)

## Decisions Made

- **Module-level `let` is deliberately the simplest possible implementation.** No `class DefaultProfileRegistry`, no `globalThis[Symbol.for("hl7-parser-default-profile")]`, no worker-safe registry with locks. Each of those would be over-engineered relative to the PROJECT.md Key Decision that this API is DISCOURAGED — the simplest implementation matches the posture.
- **`setDefaultProfile` accepts `undefined` defensively.** TypeScript's `Profile | null` signature rules out `undefined` at compile time, but a JS caller (or a library consumer with `strict: false`) can pass `undefined`. The `profile ?? undefined` shorthand collapses both `null` and `undefined` to "clear", which is the least-surprising semantic (the alternative — explicit `else if (profile === undefined)` — adds a branch for no observable benefit).
- **`getDefaultProfile` returns `Profile | undefined`, NOT `Profile | null`.** Per D-18 "consistent with the existing `msg.profile` convention — `undefined` rather than `null`". This also means `setDefaultProfile(null)` followed by `getDefaultProfile()` returns undefined, not null — preserving the "unset" idiom.
- **3-branch D-19 discrimination at Step 6.5 replaces Plan 03's single-line assignment.** The single-line `profileOpt !== undefined && profileOpt !== null ? profileOpt : undefined` collapsed "opt-out" and "no-default" into the same branch. Plan 04 splits them: `options.profile === null` now explicitly maps to `effectiveProfile = undefined` (opt-out; ignore any registered default), while `options.profile === undefined` falls back to `getDefaultProfile()`. This is the ONLY parser-code change in the plan.
- **`let` instead of `const` for `effectiveProfile` in Step 6.5.** Plan 03's assignment was a ternary that fit on one line as a `const`; Plan 04's 3-branch discrimination requires a writeable binding. Explicit type annotation `Profile | undefined` preserves the type surface that downstream consumers (Step 11.5's customSegments lookup, Step 13's profileInit/mergedDateFormats/mergedCustomSegments assembly) already depend on.
- **No dedicated D-22 tests in this plan.** Plan 03's profiles-onwarning-chain.test.ts covers the D-22 mechanism (ordering, reference identity, throw-isolation, strict short-circuit, early-pipeline coverage). Plan 04's D-20 equivalence tests cover the default-vs-explicit parity for onWarning (via the customSegments + UNKNOWN_SEGMENT suppression tests which exercise the full emit path). A dedicated "default-profile handler fires before options handler" test would be redundant with Plan 03's coverage.
- **afterEach cleanup is the ONLY isolation mechanism.** Per CONTEXT.md Claude's Discretion, NO auto-reset was added. The discipline is documented in 3 places (JSDoc, test-file afterEach hook, dedicated isolation-contract test) so future test-file authors have multiple reminders.

## Deviations from Plan

None. The plan was executed VERBATIM — every acceptance criterion, test case, JSDoc block, and file structure landed exactly as written. Zero auto-fixes required; no Rule-1/Rule-2/Rule-3 deviations.

This is the first plan in Phase 6 with zero deviations. Plan 06-01 had 2 deviations (Rule-3 control-id pre-existing lint blocker + Rule-1 test-contradiction fix); Plan 06-02 had 3 (Rule-1 onWarning reference-identity update + 2 Rule-1 lint fixes); Plan 06-03 had 2 (Rule-1 discriminateOptionsOrProfile pre-existing bug surfaced by new integration + Rule-1 test-scope adjustment for TIMESTAMP_FALLBACK_FORMAT warning). Plan 04's scope was narrow enough (2 small files + 1 single-line-to-3-branch edit) that the plan-author's discretion carried through verbatim.

## Issues Encountered

None.

## Known Stubs

None. The 3-branch D-19 discrimination is the final shape; Plan 05 (built-in profiles) and Plan 06 (barrel + fixture tests) do not extend Step 6.5 further.

## Next Phase Readiness

- **Plan 06-05 (5 built-in vendor profiles):** Can assume `setDefaultProfile(profiles.epic)` works end-to-end — `parseHL7(raw)` after the set produces `msg.profile.name === "epic"` with full customSegments + dateFormats + onWarning wiring. Built-ins author themselves via the public `defineProfile()` API (Plan 06-01 contract) and are stored in the default-profile registry via the public `setDefaultProfile()` API (Plan 06-04 contract).
- **Plan 06-06 (barrel + fixture tests):** Will add `setDefaultProfile`, `getDefaultProfile` to `src/index.ts` public exports alongside `defineProfile`, `profiles`, `DefineProfileOptions`, `CustomSegmentDefinition`, `SUPPORTED_DATE_TOKENS`. Both names are stable from Plan 04. The BIP-06 fixture-parity tests can use `setDefaultProfile(profiles.epic)` as an ergonomic alternative to passing the profile to every `parseHL7` call.

## Threat Flags

None. All Plan 06-04 touchpoints stay inside the trust boundaries of the plan's threat register:

- **T-06-04-01 (Tampering, rogue Profile passed to setDefaultProfile)** — accepted; setDefaultProfile does NOT re-validate the profile. Authors bypassing defineProfile get whatever their hand-crafted Profile produces; rogue customSegments (non-Z) are caught by Plan 06-03's post-merge D-05 re-check in defineProfile (unreachable for raw setDefaultProfile consumers but catches extends chains through rogue parents).
- **T-06-04-02 (Information Disclosure, cross-test bleed)** — mitigated via afterEach discipline documented in 3 places.
- **T-06-04-03 (Denial of Service, rapid setDefaultProfile hot-loop)** — accepted; O(1) assignment to a module-level let, zero cost at any call rate.
- **T-06-04-04 (Tampering, worker-thread default sharing)** — accepted; documented in PROJECT.md + module JSDoc.

## Self-Check: PASSED

- `src/profiles/default.ts` — FOUND (2 exports: setDefaultProfile, getDefaultProfile + 1 internal let _defaultProfile)
- `src/profiles/default.ts::export function setDefaultProfile` — FOUND (line 61)
- `src/profiles/default.ts::export function getDefaultProfile` — FOUND (line 79)
- `src/profiles/default.ts::let _defaultProfile` — FOUND (line 24)
- `src/profiles/default.ts::@example` count — FOUND 2 (one per exported function)
- `src/profiles/default.ts::afterEach` — FOUND in JSDoc body (test-hygiene note)
- `src/parser/index.ts::import { getDefaultProfile }` — FOUND (line 37)
- `src/parser/index.ts::options.profile === null` — FOUND (line 413, 3-branch D-19 dispatch)
- `src/parser/index.ts::options.profile !== undefined` — FOUND (line 415, 3-branch D-19 dispatch)
- `src/parser/index.ts::effectiveProfile = getDefaultProfile()` — FOUND (line 418, fallback branch)
- `test/profiles-default.test.ts` — FOUND (13 tests across 4 describe blocks)
- `test/profiles-default.test.ts::afterEach` — FOUND (line 14, top-level cleanup hook)
- Commit `7de1e63` (Task 1) — FOUND
- Commit `de10b6b` (Task 2) — FOUND

Full suite: **724/724 tests green** (+13 from Plan 06-03 baseline of 711); typecheck clean; lint `--max-warnings=0` clean; build produces valid dual ESM/CJS dist (99.67 KB ESM + 100.64 KB CJS + 119.79 KB DTS).

---
*Phase: 06-profile-system-and-built-ins*
*Completed: 2026-04-19*
