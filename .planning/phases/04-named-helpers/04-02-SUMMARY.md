---
phase: 04-named-helpers
plan: 02
subsystem: helpers-meta-and-patient
tags: [helpers, meta, patient, memoization, cache-invalidation, tdd]

requires:
  - phase: 04-named-helpers
    plan: 01
    provides: "buildMeta + buildPatient stubs, Meta + Patient type interfaces, pickMrn full impl, Hl7Message.meta/.patient getters with null-sentinel cache slots, invalidateCaches extended to drop _meta/_patient/_visit, 11 Field.asXxx coercions incl. XCN"
provides:
  - "buildMeta(msg) — composes all 12 HELPERS-01 Meta fields via Phase 3 public surface (msg.get / field.asTs); D-01 frozen; D-18 flat Date; D-22 never-throws"
  - "buildPatient(msg) — composes all 14 HELPERS-02 Patient fields; D-04 undefined-on-no-PID; D-07/D-08/D-10 MRN pick via pickMrn; D-17 Western fullName; D-18 flat dateOfBirth; D-19 flat familyName/givenName/middleName; D-20 PID-13+PID-14 concat phoneNumbers; D-01 frozen; HELPERS-07 never-throws"
  - "composeFullName helper (internal) — 'Given Middle Family, Suffix' Western composition with clean omission (no double spaces, no stray comma); returns undefined on empty"
  - "Cache memoization + invalidation test suite proving D-02 identity (msg.meta === msg.meta, msg.patient === msg.patient), null-sentinel negative cache, and wholesale drop on setField/addSegment/removeSegment"
affects: [Plan 03 visit-and-observations, Plan 04 orders-and-collections, Phase 6 profile hooks (pickMrn already wired), Phase 7 vendor-quirks, Phase 8 examples EX-01 extract-patient-info]

tech-stack:
  added: []
  patterns:
    - "Mutable<T> + conditional-assignment at the helper layer — same pattern Phase 3 composites use for exactOptionalPropertyTypes compliance"
    - "Reconstruct full MSH-9 type string from per-component msg.get() reads, trim trailing empties to avoid 'ADT^A01^' drift when messageStructure absent"
    - "Helper never walks rawSegments — composes strictly on msg.get / msg.segments()[i].field(N).asXxx() per CONTEXT.md §domain 'Compose, don't reach through'"

key-files:
  created:
    - "test/helpers-meta.test.ts — 14 integration tests against realistic MSH fixtures"
    - "test/helpers-patient.test.ts — 25 integration tests covering full PID surface"
    - "test/helpers-cache-invalidation.test.ts — 9 memoization + invalidation tests (Plan 03 adds visit cases in disjoint file)"
  modified:
    - "src/helpers/meta.ts — replaced NOT IMPLEMENTED stub with full buildMeta impl (109 lines)"
    - "src/helpers/patient.ts — replaced NOT IMPLEMENTED stub with full buildPatient + composeFullName (148 lines)"

key-decisions:
  - "MSH-9 reconstruction via per-component msg.get() loop rather than reading the whole field — needed because Field.value is first-subcomp-of-first-comp, so re-joining on '^' is the correct way to get 'ADT^A01^ADT_A01' from the tree"
  - "composeFullName omits prefix + degree from the output per strict D-17 read ('Given Middle Family, Suffix' — no mention of prefix/degree). Callers who want 'Mrs. Jane Smith, MD' destructure patient.name themselves"
  - "Null-sentinel caching on msg.patient leveraged correctly — second .patient read on NO_PID hits the cached null without recalling buildPatient (proven in cache-invalidation test)"
  - "D-23 auto-unescape verified via '\\F\\' → '|' round-trip test; value routes through Field.value which calls unescape() transparently"
  - "Test fixtures corrected during GREEN: PID-5 (name) requires exactly 4 pipes between 'PID' and the name (PID-1..PID-4 empty), not 5. Initial fixtures had name landing at PID-6 — caught by 9 failing assertions in the first GREEN run"

patterns-established:
  - "Each helper builder (Plans 02/03/04) follows the same shape: Mutable<T> local + per-field conditional assignment + Object.freeze return. No helper ever constructs a frozen-in-one-step object literal (consistent-type-assertions rule forbids object-literal casts)"
  - "Helper fixture minimum: a MSH + segment-under-test snippet. PID-5 sits at exactly 4 fields after 'PID' — every patient-fullName/address/unescape fixture must respect this"

requirements-completed: [HELPERS-01, HELPERS-02, HELPERS-07]

duration: ~18min
completed: 2026-04-19
---

# Phase 4 Plan 02: Meta and Patient Summary

**Filled the `buildMeta` and `buildPatient` stub bodies Plan 01 scaffolded — Meta exposes all 12 MSH-derived fields with flat `Date | undefined` timestamps, Patient exposes all 14 PID-derived fields with MR-typed MRN selection, Western-order composed fullName, and PID-13+PID-14 phone concatenation. Added the shared cache memoization + invalidation test suite proving D-02 identity and wholesale cache drop on every mutation.**

## What Shipped

| Area | Deliverable |
|------|-------------|
| `buildMeta` | Pure function composing MSH metadata through `msg.get` + `msh.field(7).asTs()`. Full MSH-9 type string reconstructed from per-component reads; trailing empty components trimmed so "ADT^A01^^" never leaks. D-18 flat Date at helper layer. D-22 never-throws (unparseable MSH-7 → timestamp key omitted). |
| `buildPatient` | Pure function returning `Patient \| undefined`. D-04 no-PID → undefined. D-09 frozen `readonly CX[]` identifiers. D-07/D-08/D-10 MRN pick via `pickMrn`. D-19 flat `familyName`/`givenName`/`middleName` (mapped from XPN.secondName). D-17 `composeFullName` produces "Given Middle Family, Suffix" with clean omission. D-18 flat `dateOfBirth`. D-20 PID-13 + PID-14 concatenated into frozen `phoneNumbers`. D-01 frozen at boundary. |
| `composeFullName` | Internal Western-order composer. Builds `given middle family` + `, suffix` as appropriate. Returns `undefined` when no usable parts (drives key omission at the caller). Test cases cover suffix-only, family-only, given-only, double-space avoidance, leading-comma avoidance. |
| Cache tests | 9 tests in `test/helpers-cache-invalidation.test.ts`: identity (`msg.meta === msg.meta`, `msg.patient === msg.patient`), null-sentinel cache, setField/addSegment/removeSegment all drop meta + patient caches wholesale. Plan 03 adds visit-specific tests in a disjoint file. |

## Tests

| Before | After | Delta |
|--------|-------|-------|
| 343 tests, 33 files | **431** tests, 39 files | +88 tests, +6 files |

(The +88 includes this plan's 48 new tests and Plan 03's parallel additions — Plans 02 and 03 were in flight on Wave 2 simultaneously; the delta attributable to this plan alone is 48 tests across 3 files.)

**Plan 02 tests created (48 total):**

- `test/helpers-meta.test.ts`: 14 tests — full MSH-9 parsing, component shortcuts, controlId, D-18 flat Date, version, sendingApp/facility, receivingApp/facility, processingId, omission semantics, date-only truncation, D-22 unparseable fallback, frozen-at-top, HELPERS-07 never-throw, D-23 auto-unescape.
- `test/helpers-patient.test.ts`: 25 tests — D-04 no-PID, D-01 frozen, D-07 MR-pick, D-08 fallback, D-10 case-sensitive, D-09 frozen identifiers, empty identifiers, D-19 flat name shortcuts, empty XPN, D-17 fullName composition (4 variants), D-18 dateOfBirth, absent dateOfBirth, sex, absent sex, D-19 address (full XAD), absent address, D-20 phone concat, empty phones, home-phone-only, HELPERS-07 never-throw, D-23 auto-unescape.
- `test/helpers-cache-invalidation.test.ts`: 9 tests — meta identity, patient identity, null-sentinel cache for NO_PID, setField on MSH drops meta, setField on PID drops patient (2 variants), addSegment drops all caches, removeSegment flips patient object → undefined, observations() is NOT memoized (D-06, skipped gracefully while Plan 03's stub was still live).

**Existing 343 Plan 01 tests continue to pass** — no regressions in composites, parser, model, or pickMrn. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.

## D-XX Coverage

| Decision | Where proven |
|----------|--------------|
| D-01 (frozen plain objects) | `Object.isFrozen(msg.meta)` + `Object.isFrozen(msg.patient)` + `Object.isFrozen(msg.patient.identifiers)` + `Object.isFrozen(msg.patient.phoneNumbers)` tests |
| D-02 (memoization + wholesale invalidation) | `helpers-cache-invalidation.test.ts` — 5 direct tests + null-sentinel test |
| D-03 (Meta always defined) | Relies on Phase 2 `NO_MSH_SEGMENT` throw — helper exits with empty `Meta` via `return Object.freeze({}) as Meta` when msh undefined (purely for TS narrowing; unreachable at runtime) |
| D-04 (patient undefined on no PID) | `helpers-patient.test.ts` — "returns undefined when no PID exists" |
| D-07 / D-08 / D-10 (MRN pick) | 3 patient tests + delegation to existing 8 pickMrn tests |
| D-09 (identifiers frozen CX[]) | "exposes PID-3 identifiers as a frozen readonly CX[]" + "returns empty identifiers array when PID-3 is absent" |
| D-17 (Western fullName) | 4 fullName composition tests covering Jr-suffix, no-suffix, family-only, suffix-only, absent-parts |
| D-18 (flat Date at helper layer) | `toISOString()` direct calls on `msg.meta.timestamp` and `msg.patient.dateOfBirth` |
| D-19 (name shortcuts + locked field names) | "exposes XPN name via .name and flat familyName/givenName/middleName" |
| D-20 (phoneNumbers concat PID-13+PID-14) | "concatenates PID-13 + PID-14 into frozen phoneNumbers" + "PID-13 home phone alone" |
| D-21 (no warnings emitted) | Helper code has no warning emitter / no new WarningCode — structurally enforced |
| D-22 (never throws) | "never throws on an empty MSH" + "never throws on absent optional fields" + omit-on-unparseable checks |
| D-23 (auto-unescape) | `A\\F\\B` → `A|B` tests in both meta and patient suites |

## Deviations from Plan

**None.** All three tasks executed exactly as the plan specified, using the TDD RED→GREEN pattern (Tasks 1+2) and the non-TDD wiring pattern (Task 3) as prescribed.

Minor implementation notes (in-spec):

- **Test-fixture correction during GREEN.** Initial RED fixtures for Task 2 placed the XPN name at PID-6 instead of PID-5 (one extra `|`). Caught by 9 failing assertions in the first GREEN run against a correct implementation; the fix added one line of comment documenting the PID field layout and adjusted 6 fixtures. This is a within-task fixture refinement, not a deviation from plan — every behavior asserted by the RED tests remained unchanged.
- **Wave 2 parallelism observation.** During Plan 02's Task 3 verification, Plan 03 was concurrently landing commits (`feat(04-03): implement buildVisit`, `test(04-03): add failing tests for observations + buildObservation`, `feat(04-03): implement observations + buildObservation`). The shared `git log` is interleaved. Plan 03 also created `test/helpers-cache-invalidation-visit.test.ts` as planned — no edit conflict on `test/helpers-cache-invalidation.test.ts` (each plan owns disjoint files per Plan 01's Wave-2 contract).

## Notes for Plans 03 and 04

**For Plan 03 (visit + observations):**
- Your disjoint test file `test/helpers-cache-invalidation-visit.test.ts` covers visit-specific mutation scenarios. Plan 02's `test/helpers-cache-invalidation.test.ts` is NOT multi-owner — do not edit it.
- The D-06 "observations() not memoized" assertion in Plan 02's cache file has a `try/catch` skip for the NOT_IMPLEMENTED window. Once your `observations()` GREEN lands, the skip path is no longer taken; if you'd like to move that assertion to your visit cache file or delete the skip branch, either is fine — it is not a correctness requirement for Plan 02's deliverable.
- `removeSegment("PV1", ...)` currently throws `TypeError` because the Phase 3 `SEGMENT_NAME_RE` regex is `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` — strict `[A-Z]{3}`. Your fixture needs a workaround (use `{ all: true }` on a non-existent Z-segment to prove wholesale-drop, or file a Phase 5/6 amendment if the regex should accept trailing digits on common HL7 segments like PV1 / AL1 / DG1). This was not caused by Plan 02 — it's a pre-existing Phase 3 validation shape.

**For Plan 04 (orders + collections):**
- `pickMrn` is already publicly exported; Plan 04's nextOfKin/allergies/etc. helpers do not need their own pick logic unless the segment uses a different type-code convention.
- The `composeFullName` composer is `@internal` inside `src/helpers/patient.ts` — Plan 04's next-of-kin helper can either duplicate it (low-risk at 2 call sites) or lift it to a shared `_shared.ts` if a third caller appears. Planner's discretion.

## REQ-ID Coverage

| REQ-ID | Status after Plan 02 | Notes |
|--------|----------------------|-------|
| HELPERS-01 (msg.meta) | **CLOSED** | All 12 locked fields implemented + tested. |
| HELPERS-02 (msg.patient) | **CLOSED** | All 14 locked fields implemented + tested. D-04 undefined-on-no-PID. |
| HELPERS-03 (msg.visit) | In progress (Plan 03) | Scaffolded by Plan 01; filled in parallel by Plan 03. |
| HELPERS-04 (msg.observations) | In progress (Plan 03) | |
| HELPERS-05 (msg.orders) | Pending (Plan 04) | |
| HELPERS-06 (collections) | Pending (Plan 04) | |
| HELPERS-07 (never-throw) | **Partially closed (meta + patient surfaces)** | Plan 03 extends to visit + observations; Plan 04 extends to remaining collection helpers. |

## Commits

- `bede3f7` test(04-02): RED — failing tests for buildMeta (HELPERS-01)
- `04345bd` feat(04-02): implement buildMeta (HELPERS-01)
- `dd8d230` test(04-02): RED — failing tests for buildPatient (HELPERS-02)
- `cdf76a1` feat(04-02): implement buildPatient (HELPERS-02)
- `4a34672` test(04-02): add cache memoization + invalidation suite (D-02)

## Self-Check: PASSED

- `src/helpers/meta.ts` — FOUND, stub text "NOT IMPLEMENTED" GONE, `Object.freeze(out)` present, `.asTs()` present, `msg.get("MSH.9` present
- `src/helpers/patient.ts` — FOUND, stub text GONE, `pickMrn(` present, `composeFullName` present, `field(13)` + `field(14)` present, `Object.freeze(out)` present
- `test/helpers-meta.test.ts` — FOUND (14 tests pass)
- `test/helpers-patient.test.ts` — FOUND (25 tests pass)
- `test/helpers-cache-invalidation.test.ts` — FOUND (9 tests pass)
- Commits: `bede3f7`, `04345bd`, `dd8d230`, `cdf76a1`, `4a34672` — all FOUND in `git log`
- `pnpm typecheck` — exit 0
- `pnpm lint` — exit 0
- `pnpm test` — 431/431 passing (was 343 before Plan 02/03 Wave 2)
- `pnpm build` — ESM + CJS + DTS all green (103 KB .d.ts, 77 KB .mjs)
