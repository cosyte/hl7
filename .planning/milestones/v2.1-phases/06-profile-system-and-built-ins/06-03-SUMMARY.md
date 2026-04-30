---
phase: 06-profile-system-and-built-ins
plan: 03
subsystem: profiles
tags: [Segment.get, UNKNOWN_SEGMENT, KNOWN_SEGMENTS, dateFormats-plumbing, D-21, D-22, onWarning-chain, makeEmitter-hoist, customSegments-threading, PROF-02, PROF-06, PROF-07, PROF-09]

# Dependency graph
requires:
  - phase: 06-profile-system-and-built-ins
    plan: 01
    provides: defineProfile single-profile factory + CustomSegmentDefinition canonical + SUPPORTED_DATE_TOKENS + tightened Profile.customSegments type
  - phase: 06-profile-system-and-built-ins
    plan: 02
    provides: Real composeOnWarning chain (not passthrough) so profile.onWarning invoked once per emission covers the full merged chain
provides:
  - "src/parser/known-segments.ts — ~70-entry ReadonlySet of standard HL7 v2.5.1 segment names; O(1) lookup via Set.has"
  - "src/model/segment.ts Segment — 4th optional ctor param customFields; new get(name): Field | undefined method with D-14 narrow (undefined for missing name AND for out-of-range position, never synthetic-empty)"
  - "src/model/message.ts Hl7MessageInit — new optional customSegments + dateFormats keys; Hl7Message stores merged customSegments (private); exposes public readonly dateFormats: readonly string[] (always defined, [] when absent)"
  - "src/parser/index.ts parseHL7 — effectiveProfile resolved at new Step 6.5 BEFORE makeEmitter construction (Option A hoist); makeEmitter signature extended to 4 args; invokes profile.onWarning BEFORE options.onWarning inside per-handler try/catch (D-22); new Step 11.5 emits UNKNOWN_SEGMENT for non-KNOWN non-profile-claimed segments (D-31); Step 13 rewritten as single-init consumer assembling merged customSegments + D-21 dateFormats"
  - "src/parser/index.ts discriminateOptionsOrProfile — Rule-1 fix: OPTIONS_ONLY_KEYS tightened to truly-options-only keys (strict/stripMllpFraming/trimFields/profile/charset); discrimination now prefers Profile when arg has string `name` and no truly-options-only key"
  - "src/helpers/meta.ts buildMeta — MSH-7 timestamp now calls parseHl7Timestamp directly with { userFormats: msg.dateFormats } instead of .asTs() so D-21 cascade is honoured (.asTs() unchanged for composite callers per Phase 3 D-10)"
affects: [06-04-default-profile, 06-05-built-ins, 06-06-barrel-and-fixtures]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Option A hoist: hoist profile resolution BEFORE emitter construction so every warning (including early-pipeline Buffer-decode + MLLP replay) routes through the profile.onWarning chain"
    - "Per-handler try/catch silent-swallow on BOTH profile.onWarning and options.onWarning — uniform isolation from noisy handlers regardless of origin"
    - "ReadonlySet for known-segment lookup: one Set allocation at module load, O(1) has() in the Step 11.5 scan"
    - "exactOptionalPropertyTypes conditional init-key assembly at the parser boundary — single typed `Init` object built key-by-key so omitted keys stay absent (not explicitly undefined)"
    - "Object.prototype.hasOwnProperty.call against prototype pollution in both the customSegments suppression check AND the options-vs-profile discriminator"

key-files:
  created:
    - src/parser/known-segments.ts
    - test/profiles-custom-segments.test.ts
    - test/profiles-onwarning-chain.test.ts
    - .planning/phases/06-profile-system-and-built-ins/06-03-SUMMARY.md
  modified:
    - src/model/segment.ts
    - src/model/message.ts
    - src/parser/index.ts
    - src/helpers/meta.ts

key-decisions:
  - "KNOWN_SEGMENTS list scope: ~70 entries covering HL7 v2.5.1 chapters 3-7 (headers, patient/visit, orders, results, pharmacy, scheduling, master files, query, roles, legacy). Deliberately broad to minimise false-positive UNKNOWN_SEGMENT emissions. Z-segments NOT in the set — they're always user-defined and must be profile-declared to suppress the warning."
  - "Option A hoist chosen over Option B (lazy getter) and Option C (replay buffer) for D-22. Option A resolves effectiveProfile at new Step 6.5 BEFORE makeEmitter, so the D-22 chain covers the FULL parse — including Buffer-decode warnings replayed in Step 7, MLLP_FRAMING_STRIPPED in Step 8, FIELD_WHITESPACE_TRIMMED / UNKNOWN_ESCAPE_SEQUENCE during tokenize, and UNKNOWN_SEGMENT in Step 11.5. Early-pipeline coverage is observable via a dedicated test case in profiles-onwarning-chain.test.ts."
  - "discriminateOptionsOrProfile required a Rule-1 semantic fix. The pre-existing OPTIONS_ONLY_KEYS list included `onWarning` and `dateFormats`, both of which ALSO appear on `Profile`. Since defineProfile() outputs always have `dateFormats` (default []) and often `onWarning`, passing `parseHL7(raw, profile)` was misrouting the profile into the ParseOptions branch — msg.profile came back undefined. Tightened OPTIONS_ONLY_KEYS to keys truly exclusive to ParseOptions and flipped the discrimination: Profile REQUIRES `name: string`, so an arg without a string `name` is unambiguously ParseOptions. Args with `name` + a truly-options-only key (e.g. `{ name: \"x\", strict: true }`) still route as options per the existing contract."
  - "src/model/message.ts public `dateFormats: readonly string[]` (not `readonly string[] | undefined`). Empty array when neither options.dateFormats nor profile.dateFormats supplied. Simpler consumer contract: always a concrete array; callers iterate without narrowing."
  - "Segment.get(name) returns `undefined` for BOTH 'name not declared' AND 'name declared but position out-of-range' per D-14. The out-of-range detection checks `repetitions.length === 0 && !isNull` on the field returned by `field(n)` — treats a synthetic empty Field the same as a missing declaration so callers can't distinguish silently. Explicit-null fields (`\"\"`) DO surface as a present Field (isNull === true) because that's declared, populated content."
  - "UNKNOWN_SEGMENT emit site at Step 11.5 (after tokenize, before version extract). Keeps tokenize.ts profile-agnostic per PATTERNS.md §Integration Points recommendation. Emit uses Object.prototype.hasOwnProperty.call on profileCustomSegments to guard against prototype pollution (T-06-03-02 mitigation)."
  - "buildMeta's MSH-7 timestamp parse runs lazily on .meta access — `msg.warnings` is frozen at Hl7Message construction per Phase 2 D-07, so parseHl7Timestamp's TIMESTAMP_FALLBACK_FORMAT warning cannot land in msg.warnings from a post-parse getter. The Date value itself IS the observable D-21 contract for this plan (wiring eager MSH-7 parse into the pipeline to surface the fallback warning would be a separate scope change)."

requirements-completed: [PROF-02, PROF-06, PROF-07, PROF-09]

# Metrics
duration: 10min
completed: 2026-04-19
---

# Phase 6 Plan 3: Segment.get + UNKNOWN_SEGMENT + D-21 + D-22 Summary

**Segment.get(name) named-field access (PROF-07) + UNKNOWN_SEGMENT emit/suppression (D-31) + merged dateFormats plumbing (D-21 observable via msg.meta.timestamp) + D-22 profile.onWarning chain hoisted into makeEmitter via Option A (effectiveProfile resolved at new Step 6.5 BEFORE emitter construction) — closes PROF-02 (customSegments threaded), PROF-06 (profile attribution + D-22 chain), PROF-07 (named-field access), PROF-09 (round-trip agnostic).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-19T23:27:22Z
- **Completed:** 2026-04-19T23:37:18Z
- **Tasks:** 4 (+ 1 Rule-1 discriminator fix inline in Task 3 + 1 Rule-1 test-scope adjustment inline in Task 3)
- **Files:** 4 created (src/parser/known-segments.ts, 2 test files, 1 SUMMARY), 4 modified src (model/segment.ts, model/message.ts, parser/index.ts, helpers/meta.ts)

## Accomplishments

- `Segment.get("encounterId")` resolves to the `Field` at the profile-declared position when a profile declares `customSegments.ZPI.fields.encounterId` (PROF-07)
- `Segment.get(nonexistent)` returns `undefined` — never synthetic-empty, never throws — so typos surface instead of silently producing empty strings (D-14)
- Messages parsed WITHOUT a profile have `Segment.get(name) === undefined` unconditionally (D-15 defense-in-depth; the unused `customFields` slot stays undefined on every Segment)
- `parseHL7("MSH|...\rZZZ|foo\r")` emits exactly one `UNKNOWN_SEGMENT` warning for `ZZZ` (new emit site at Step 11.5 — the factory existed in Phase 2 but had no call site)
- Passing a profile that declares `customSegments.ZPI` suppresses `UNKNOWN_SEGMENT` for `ZPI` while still emitting for any other unknown Z-segment (D-31 per-segment suppression)
- `msg.dateFormats` exposes the merged list `options.dateFormats ++ profile.dateFormats` with first-occurrence dedupe (D-21 observable)
- `msg.meta.timestamp` honours the merged cascade — `MSH-7="01/15/2025"` with `options.dateFormats=["MM/DD/YYYY"]` parses successfully via `parseHl7Timestamp` direct call (meta.ts no longer delegates to `.asTs()` which hard-codes `{}`)
- When options AND profile both supply dateFormats, options wins per D-21 ("01/02/2025" → Jan 2 with `options=["MM/DD/YYYY"]` + `profile=["DD/MM/YYYY"]`)
- `parseHL7(raw, profile).toString() === parseHL7(raw).toString()` for profile-agnostic content (PROF-09 — profile affects parse ONLY)
- D-22 chain observable: `profile.onWarning` fires BEFORE `options.onWarning`; both receive the SAME warning object (reference identity); per-handler try/catch swallows exceptions from either without breaking the other or bubbling out of `parseHL7`
- D-22 strict mode: `options.strict === true` short-circuits BOTH handlers and throws `Hl7ParseError` as before (Phase 2 lenient-vs-strict split preserved)
- D-22 Option A hoist coverage: `MLLP_FRAMING_STRIPPED` emitted at Step 8 (between emitter construction at Step 7 and UNKNOWN_SEGMENT at Step 11.5) reaches BOTH handlers — proves the chain covers early-pipeline warnings, not just post-tokenize warnings

## Task Commits

Each task committed atomically:

1. **Task 1: KNOWN_SEGMENTS + Segment.get + Hl7Message storage** — `171a2ae` (feat)
2. **Task 2: effectiveProfile hoist + D-22 chain + UNKNOWN_SEGMENT emit + merged dateFormats + buildMeta** — `83508a0` (feat)
3. **Task 3: profiles-custom-segments.test.ts (23 tests) + Rule-1 discriminator fix** — `33a4b64` (test)
4. **Task 4: profiles-onwarning-chain.test.ts (9 D-22 tests)** — `a0167d0` (test)

## Files Created/Modified

- `src/parser/known-segments.ts` (NEW) — ~70-entry `ReadonlySet<string>` covering HL7 v2.5.1 core message segments, patient/visit, orders/results, pharmacy, scheduling, master files, query, roles, and legacy tokens. Z-segments excluded (they're always user-defined).
- `src/model/segment.ts` — 4th optional ctor param `customFields?: Readonly<Record<string, number>>`; new public readonly `customFields` field; new `get(name): Field | undefined` method with D-14/D-15 narrow (undefined for missing name AND out-of-range position).
- `src/model/message.ts` — `Hl7MessageInit` extended with `customSegments?` + `dateFormats?`; private `_customSegments`; public readonly `dateFormats: readonly string[]` (always `[]` when absent so consumers don't narrow); `allSegments()` passes per-segment `customSegments[name].fields` slice to each `Segment` ctor (conditional-pass to honour exactOptionalPropertyTypes).
- `src/parser/index.ts` — 
  - `makeEmitter` signature extended to 4 args with `effectiveProfile: Profile | undefined`.
  - Inside `emit`: lenient-mode body now invokes `effectiveProfile.onWarning` FIRST inside `try/catch`, then `options.onWarning` inside `try/catch`. Strict-mode body unchanged (fires NEITHER handler — `Hl7ParseError` thrown as before).
  - `parseHL7` restructured — new **Step 6.5** resolves `effectiveProfile` from `options.profile` BEFORE `makeEmitter` construction at Step 7. Buffer-decode warning replay at Step 7 therefore routes through BOTH handlers (full-fidelity coverage).
  - New **Step 11.5** — iterates `rawSegments`, emits `unknownSegment({segmentIndex}, name)` for each name that is neither in `KNOWN_SEGMENTS` nor in `effectiveProfile.customSegments` (via `hasOwnProperty.call` — prototype-pollution safe per T-06-03-02).
  - **Step 13** rewritten as CONSUMER of `effectiveProfile` (not resolver): merges `options.dateFormats ++ profile.dateFormats` with first-occurrence dedupe (D-21), extracts `customSegments`, assembles single typed `Init` object with exactOptionalPropertyTypes conditional-key discipline, constructs `Hl7Message`.
  - `OPTIONS_ONLY_KEYS` tightened: removed `onWarning` + `dateFormats` (both ALSO appear on Profile). `discriminateOptionsOrProfile` flipped: Profile requires `name: string` → absence of string `name` → unambiguously ParseOptions (preserves `{ onWarning }` / `{ dateFormats: [...] }` as options). Args with `name` + a truly-options-only key still route as options per the existing contract.
  - 2 new imports: `KNOWN_SEGMENTS` from `./known-segments.js`, `unknownSegment` from `./warnings.js`; type import `CustomSegmentDefinition` from `./types.js`.
- `src/helpers/meta.ts` — MSH-7 timestamp now calls `parseHl7Timestamp(tsRaw, { userFormats: msg.dateFormats })` DIRECTLY. `.asTs()` unchanged for composite callers (Phase 3 D-10 zero duplicate date logic preserved). 1 new import: `parseHl7Timestamp` from `../parser/dates.js`.
- `test/profiles-custom-segments.test.ts` (NEW) — 23 tests across 5 describe blocks: Segment.get happy paths (5), UNKNOWN_SEGMENT emit/suppression (7), D-21 merged dateFormats (6), PROF-09 round-trip (2), Phase 2 backward compat (3).
- `test/profiles-onwarning-chain.test.ts` (NEW) — 9 tests in a single describe block: ordering (1), reference identity (1), throw-isolation profile (1), throw-isolation options (1), only-options-defined (1), only-profile-defined (1), strict-mode short-circuit (1), multiple warnings per-warning invariant (1), Option A hoist early-pipeline coverage via MLLP framing (1).

## Decisions Made

- **Option A hoist for D-22.** Resolving `effectiveProfile` at a new Step 6.5 BEFORE `makeEmitter` construction means the D-22 chain covers the FULL parse: Buffer-decode warnings replayed in Step 7, MLLP_FRAMING_STRIPPED in Step 8, FIELD_WHITESPACE_TRIMMED / UNKNOWN_ESCAPE_SEQUENCE during tokenize (Step 11), UNKNOWN_SEGMENT in Step 11.5, and any future early-pipeline warnings. Option B (lazy getter) would skip Steps 1-10 warnings; Option C (replay buffer after Step 13) would change emit timing from "live as warnings arise" to "batch after parse" and break the existing emitter contract. The Option A hoist also lets Plan 04 extend Step 6.5 with default-profile fallback as a trivial 3-branch discrimination without touching any other plan code.
- **makeEmitter per-handler try/catch is symmetric.** Both `profile.onWarning` and `options.onWarning` are wrapped independently in `try/catch` so a throw in either cannot prevent the other from firing, cannot bubble out of `parseHL7`, and cannot destabilize the emit loop mid-parse. The symmetric treatment of `options.onWarning` (wrapping a caller-supplied handler in silent-swallow) is a mild extension of the pre-Plan-03 contract where `options.onWarning` exceptions WOULD have surfaced. The plan explicitly sanctions this extension for consistency with the D-12 silent-swallow rule on the profile chain, and test 4 in profiles-onwarning-chain.test.ts anchors the contract.
- **Rule-1 discriminator fix.** Pre-existing `OPTIONS_ONLY_KEYS` included `onWarning` and `dateFormats` — both ALSO valid Profile fields. Since every `defineProfile()` output has `dateFormats` as an own-key (default `[]` from the factory), `parseHL7(raw, profile)` was mis-routing the profile into the ParseOptions branch (profile argument silently dropped). Fix: (a) tighten `OPTIONS_ONLY_KEYS` to keys truly exclusive to ParseOptions (`strict`, `stripMllpFraming`, `trimFields`, `profile`, `charset`); (b) flip discrimination to prefer Profile when arg has string `name`, fall through to options when `name` is absent OR when a truly-options-only key is present. The old `parser-public.test.ts` "options.onWarning callback with `{ onWarning }` as second arg" test still passes under the new discriminator because `{ onWarning }` has no string `name` → routes as options unambiguously. Pre-existing contract "`{ name: \"x\", strict: true }` → options" preserved by the post-`name`-check `hasOptionsOnlyKey` gate.
- **KNOWN_SEGMENTS list deliberately broad (~70 entries).** Aim: minimise false-positive UNKNOWN_SEGMENT emissions on real-world vendor-quirky messages that ship with segments the test fixtures haven't exercised yet. The list draws from HL7 v2.5.1 chapters 3-7 + common pharmacy/scheduling/master-file extensions. Z-segments deliberately excluded — those MUST be profile-declared to suppress the warning, which is exactly the DX lever the library sells.
- **`msg.dateFormats` is always a concrete `readonly string[]`, not `readonly string[] | undefined`.** Empty array when neither options nor profile supplied formats. Simpler consumer contract — no narrowing required at the use site. The Hl7MessageInit key remains optional (conditional-assign) so construction-time semantics under exactOptionalPropertyTypes stay honest.
- **buildMeta's MSH-7 fallback warning deferred.** `parseHl7Timestamp` emits `TIMESTAMP_FALLBACK_FORMAT` only when called with `emit + position`; `buildMeta` runs lazily on `.meta` access AFTER `msg.warnings` is frozen (Phase 2 D-07). Eager MSH-7 parsing during `parseHL7` to surface the warning would be a separate scope change. The Date VALUE itself is the observable D-21 contract from this plan's perspective — Plan 06-03 Task 3's D-21 test suite anchors that contract and an inline comment documents the warning-scope boundary.
- **Segment.get out-of-range detection via field(n) content check.** `field(n)` returns `Field.empty(enc)` for out-of-range `n` (a sentinel with `repetitions.length === 0 && isNull === false`). `get(name)` checks that shape and returns `undefined` so "name not declared" and "name declared but position missing in the raw tree" both collapse to `undefined` per D-14 (typos surface identically to missing-data). Explicit HL7 null (`""` field with `isNull === true`) DOES return the Field — declared-and-populated content is real, even if its content is a null marker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `discriminateOptionsOrProfile` pre-existing bug surfaced by Plan 06-03's integration**
- **Found during:** Task 3 verification — the first test case I wrote (`parseHL7(raw, profile)` with a `defineProfile()` output) had `msg.profile === undefined` even though the profile was passed.
- **Root cause:** Pre-existing `OPTIONS_ONLY_KEYS` included `onWarning` and `dateFormats`. Since `defineProfile()` outputs ALWAYS have `dateFormats` as an own-key (default `[]`), the discriminator's `hasOptionsKey` check matched, routing the profile into `arg as ParseOptions` — but `arg.profile` was undefined, so the parse ran with NO profile attribution / NO customSegments / NO dateFormats merge / NO D-22 chain.
- **Fix:** Tightened `OPTIONS_ONLY_KEYS` to `["strict", "stripMllpFraming", "trimFields", "profile", "charset"]` (keys truly exclusive to ParseOptions) and flipped the discrimination: Profile requires `name: string` → absence of string `name` → unambiguously ParseOptions. Args with string `name` and no truly-options-only key → Profile. Args with string `name` + truly-options-only key → ParseOptions (preserves the `{ name: "x", strict: true }` → options contract).
- **Files modified:** `src/parser/index.ts`
- **Verification:** Pre-existing `parser-public.test.ts` "options.onWarning with `{ onWarning }` as second arg" still passes (bare `{ onWarning }` lacks `name`, routes as options); all 23 new profile-routing tests pass; zero other regressions (702/702 after fix).
- **Committed in:** `33a4b64` (Task 3 commit, bundled with the new test file).
- **Why not a standalone commit?** The bug was discovered BY the new tests and would have been unobservable without them. Pairing the fix with the test that detects it makes the regression check co-located.

**2. [Rule 1 - Test scope] `TIMESTAMP_FALLBACK_FORMAT` warning assertion in D-21 test was outside Plan 06-03 scope**
- **Found during:** Task 3 test suite first run — the test "option-only format makes MSH-7 in a non-HL7 format parse" asserted the warning appears in `msg.warnings`, but buildMeta runs lazily on `.meta` access AFTER `msg.warnings` is frozen at Hl7Message construction (Phase 2 D-07).
- **Fix:** Removed the warning assertion, kept the Date-value assertion (which IS the observable D-21 contract from Plan 06-03's perspective). Inline comment documents the scope boundary — surfacing the fallback warning would require lifting MSH-7 parsing into the parse pipeline (separate scope change).
- **Files modified:** `test/profiles-custom-segments.test.ts`
- **Committed in:** `33a4b64` (Task 3 commit, inline).

---

**Total deviations:** 2 Rule-1 auto-fixes (1 pre-existing discriminator bug surfaced by the new integration, 1 test-scope adjustment for an assertion whose prerequisite wasn't delivered by this plan).
**Impact on plan:** No scope creep. Both fixes are local Rule-1 corrections — the discriminator fix makes the plan's public-API test cases actually exercise the code they describe, and the test-scope adjustment trims an over-reaching assertion.

## Issues Encountered

None beyond the two deviations above.

## Known Stubs

None — all four success criteria (Segment.get, UNKNOWN_SEGMENT emit/suppression, merged dateFormats, D-22 chain) are fully implemented and tested. Plan 06-04 extends ONLY Step 6.5 (add default-profile fallback) and reuses everything else.

## Next Phase Readiness

- **Plan 06-04 (default-profile management):** Can assume `parseHL7` Step 6.5's `effectiveProfile` resolution is already hoisted — extension is a trivial 3-branch discrimination (`null` → opt-out; `Profile` → explicit; `undefined` → fall back to `getDefaultProfile()`). No other parse-pipeline code changes needed.
- **Plan 06-05 (built-in vendor profiles):** Can assume `parseHL7(raw, profiles.epic)` produces `msg.segments("ZDP")[0].get("departmentCode")` working end-to-end, `msg.warnings` contains no `UNKNOWN_SEGMENT` for declared Z-segments, and `msg.meta.timestamp` respects profile-supplied dateFormats. Fixture-parity assertions (BIP-06) have a working integration surface.
- **Plan 06-06 (barrel + fixture tests):** Will add `KNOWN_SEGMENTS` to `src/index.ts` public exports alongside `defineProfile`, `setDefaultProfile`, etc. All named symbols from Plan 06-03 (`Segment.get`, `msg.dateFormats`, etc.) are already on the public class surface — barrel sweep is additive.

## Threat Flags

None. All Plan 06-03 touchpoints stay inside the pre-existing trust boundaries (parse input → emit, customSegments init → Segment ctor, onWarning callbacks → makeEmitter) and the three T-06-03-* mitigations from the plan's threat register are in place: prototype-pollution guard on customSegments check (T-06-03-02), per-handler try/catch on both onWarning slots (T-06-03-05), and accepted DoS posture on the O(N) Step 11.5 scan (T-06-03-01).

## Self-Check: PASSED

- `src/parser/known-segments.ts` — FOUND (export `KNOWN_SEGMENTS` at module top; ~70 entries)
- `src/model/segment.ts::get(name)` — FOUND (grep match: `public get(name: string): Field | undefined`)
- `src/model/segment.ts::customFields` — FOUND (3 match sites: field declaration, constructor param, constructor assignment + get body — plus exposed publicly for tests)
- `src/model/message.ts` — FOUND: `_customSegments` private field, `dateFormats` public field, `customSegments` + `dateFormats` keys on Hl7MessageInit, conditional slice-pass in allSegments()
- `src/parser/index.ts::effectiveProfile` — FOUND at 4 sites: Step 6.5 resolution, makeEmitter 4th-arg call site, Step 11.5 customSegments access, Step 13 profileInit/mergedDateFormats/mergedCustomSegments consumer
- `src/parser/index.ts::effectiveProfile?.onWarning` — FOUND (D-22 call site inside makeEmitter)
- `src/parser/index.ts::unknownSegment|KNOWN_SEGMENTS` — FOUND (2 imports + 2 usage sites)
- `src/helpers/meta.ts::parseHl7Timestamp` + `userFormats: msg.dateFormats` — FOUND
- `test/profiles-custom-segments.test.ts` — FOUND (23 tests across 5 describe blocks)
- `test/profiles-onwarning-chain.test.ts` — FOUND (9 tests in one describe block)
- Commit `171a2ae` (Task 1) — FOUND
- Commit `83508a0` (Task 2) — FOUND
- Commit `33a4b64` (Task 3) — FOUND
- Commit `a0167d0` (Task 4) — FOUND

Full suite: **711/711 tests green** (+32 from Plan 06-02 baseline of 679); typecheck clean; lint `--max-warnings=0` clean; build produces valid dual ESM/CJS dist (99.46 KB ESM + 100.43 KB CJS + 119.79 KB DTS).

---
*Phase: 06-profile-system-and-built-ins*
*Completed: 2026-04-19*
## Self-Check: PASSED
