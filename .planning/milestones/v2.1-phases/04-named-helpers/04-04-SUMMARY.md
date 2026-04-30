---
phase: 04-named-helpers
plan: 04
subsystem: helpers-orders-collections
tags: [helpers, orders, next-of-kin, allergies, diagnoses, insurance, state-machine, positional-grouping, typescript, vitest, tdd]

requires:
  - phase: 04-named-helpers-01
    provides: "Stub signatures for orders / nextOfKin / allergies / diagnoses / insurance; typed Order / NextOfKin / Allergy / Diagnosis / Insurance interfaces in src/helpers/types.ts; Hl7Message method wiring; Field.asXcn + XCN composite"
  - phase: 04-named-helpers-03
    provides: "buildObservation(seg): per-segment OBX → Observation builder exported for reuse — D-13 valueType dispatch centralized so orders() does not duplicate it"
  - phase: 03-structural-model-and-types
    provides: "Field.asXpn / asCwe / asCe / asXad / asXtn / asTs / asCx coercions; auto-unescaped .value; msg.segments(type) + msg.allSegments() iteration"
provides:
  - "orders(msg): full implementation — two-slot ORC state machine over msg.allSegments() groups OBX positionally under the preceding OBR (D-12); ORC preceding an OBR contributes orderControl (D-16); trailing ORCs dropped. Reuses buildObservation from Plan 03 — no duplicate OBX construction."
  - "nextOfKin(msg): full implementation — one frozen NextOfKin per NK1 in document order; lean v1 field set {name XPN, relationship CWE, address XAD, phone XTN first rep, contactRole CWE}"
  - "allergies(msg): full implementation — one frozen Allergy per AL1; flat onsetDate Date per D-18"
  - "diagnoses(msg): full implementation — one frozen Diagnosis per DG1; flat dateTime Date per D-18"
  - "insurance(msg): full implementation — single-slot IN1 state machine over msg.allSegments() sets positional hasIn2/hasIn3 booleans; full IN2/IN3 data remains reachable via msg.segments() for callers who need it"
  - "test/helpers-orders.test.ts — 12 integration tests (HELPERS-05 + D-05/D-06/D-12/D-16/D-22/D-24a)"
  - "test/helpers-collections.test.ts — 16 integration tests: 3 NK1 + 2 AL1 + 2 DG1 + 3 IN1 + 5 universal HELPERS-07 never-throws sweep over all 9 Phase 4 helpers"
affects: [Phase 5 mutation-on-helpers, Phase 6 pickMrn policy hooks, Phase 7 vendor-quirk fixtures, Phase 8 examples]

tech-stack:
  added: []
  patterns:
    - "Two-slot ORC state machine (pendingOrc accumulates ORCs since last OBR; currentOrc = the ORC attached to the open OBR group). On each OBR, close the previous group with its attached currentOrc, then promote pendingOrc → currentOrc for the new group and reset pendingOrc. Trailing ORC after the last OBR stays in pendingOrc and is implicitly dropped."
    - "Single-slot IN1 state machine — open on IN1, set hasIn2/hasIn3 booleans on intervening IN2/IN3 until the next IN1 (or end-of-walk), then finalize."
    - "Mutable<T> + conditional-assignment + Object.freeze — same pattern as Plan 02's buildPatient and Plan 03's buildVisit / buildObservation, keeps output exactOptionalPropertyTypes-clean (no `key: undefined` leaks) and boundary-frozen per D-01."
    - "Composite leak guard — Object.keys(composite).length > 0 gates every assignment of an XCN/CWE/CX/XAD/XPN/XTN result so empty composites never leak as empty-object keys."
    - "buildObservation reuse from Plan 03 — orders.ts imports it directly; value-type dispatch lives in ONE place for the whole library."

key-files:
  created:
    - "test/helpers-orders.test.ts (112 lines — 12 cases)"
    - "test/helpers-collections.test.ts (168 lines — 16 cases across 5 describe blocks incl. universal HELPERS-07 sweep)"
  modified:
    - "src/helpers/orders.ts — replaced NOT_IMPLEMENTED stub with two-slot state-machine implementation (HELPERS-05)"
    - "src/helpers/next-of-kin.ts — replaced stub with NK1 walker (HELPERS-06)"
    - "src/helpers/allergies.ts — replaced stub with AL1 walker (HELPERS-06)"
    - "src/helpers/diagnoses.ts — replaced stub with DG1 walker (HELPERS-06)"
    - "src/helpers/insurance.ts — replaced stub with IN1/IN2/IN3 single-slot state machine (HELPERS-06)"

key-decisions:
  - "Two-slot (pendingOrc / currentOrc) design for orders() — the naive single-slot approach attaches pendingOrc on OBR and clears immediately, which breaks when finalizing the PREVIOUS group in the same branch (its ORC was already clobbered). Two slots make the attachment deterministic: the ORC closed with a group is the one that was active before the new OBR opened a new group."
  - "orders() reuses buildObservation from Plan 03 verbatim rather than re-implementing OBX → Observation. Consequence: the D-13 valueType dispatch (NM / TS / DT / CWE / CE / string fallback) and D-15 common-field shape (setId / identifier / units / referenceRange / abnormalFlags / status / observedDateTime) stay in ONE place. Callers get identical Observation shapes whether they walk msg.observations() or msg.orders()[i].observations."
  - "D-12: OBX before any OBR is NOT attached to an order (order.observations excludes them) but DOES surface via msg.observations(). Proved with the 'OBX before any OBR' test case that asserts orders.length === 1 AND msg.observations().length === 2."
  - "D-24 option (a) end-to-end: XCN (not flat string) is used by BOTH visit helpers (attendingDoctor / referringDoctor from Plan 03) AND orders helper (orderedBy at OBR-16). Developers get structured idNumber + familyName + givenName + assigningAuthority HD everywhere a clinician is identified."
  - "Insurance hasIn2/hasIn3 are boolean presence flags, not nested data. Rationale: IN2 / IN3 carry dense positional metadata (~30+ fields each) dominated by vendor-quirk usage; a lean v1 Insurance shape surfaces ONLY whether those segments accompany the IN1 group, leaving the full IN2 / IN3 surface reachable via msg.segments('IN2')[i] / msg.segments('IN3')[i] (positional index aligns with IN1 index since we walk in document order). Phase 7 may lift selected IN2 / IN3 fields into Insurance based on fixture evidence."
  - "IN2 / IN3 appearing BEFORE any IN1 are ignored by the insurance state machine (currentIn1 === undefined guard). No phantom Insurance entries are created; this mirrors the orders() handling of pre-OBR OBX."
  - "[Rule 1 - Bug] Plan fixture OBR had 13 pipes before XCN1 (placing the ordering-provider at OBR-17 not OBR-16). Trimmed one pipe so the test fixture aligns with the Plan 01 types.ts contract that says OBR-16 is orderingProvider. The helper implementation uses OBR-16 per the locked interface; fixture corrected to match."
  - "[Rule 1 - Bug] Plan fixture NK1 had 3 pipes after phone before FTHR (placing contactRole at NK1-8 not NK1-7). Trimmed one pipe so the test fixture aligns with the Plan 01 types.ts contract that says NK1-7 is contactRole."

requirements-completed: [HELPERS-05, HELPERS-06, HELPERS-07]

duration: 8 min
completed: 2026-04-19
---

# Phase 4 Plan 04: Orders and Collections Summary

**Filled the last 5 Plan 01 stubs (`orders` / `nextOfKin` / `allergies` / `diagnoses` / `insurance`) — HELPERS-05 + HELPERS-06 + HELPERS-07 closed for v1. Two positional state machines (ORC→OBR→OBX grouping and IN1→IN2/IN3 flagging) walk `msg.allSegments()` in document order to implement D-12 and IN1-group presence flags. `buildObservation` from Plan 03 is reused by `orders()` — OBX → Observation dispatch lives in exactly one place. Phase 4 is COMPLETE: all 9 helper surfaces (`msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()`) ship, and the universal HELPERS-07 never-throws sweep proves they all handle empty / minimal / malformed input gracefully.**

## What Shipped

| Area | Deliverable |
| --- | --- |
| orders() | `src/helpers/orders.ts` (148 lines) — two-slot ORC/OBR/OBX state machine; reuses `buildObservation`; full D-16 Order contract; D-24a XCN for `orderedBy` |
| nextOfKin() | `src/helpers/next-of-kin.ts` (61 lines) — NK1 walker with {name XPN, relationship CWE, address XAD, phone XTN, contactRole CWE} |
| allergies() | `src/helpers/allergies.ts` (67 lines) — AL1 walker with {type, code CWE, severity, reaction, onsetDate Date per D-18} |
| diagnoses() | `src/helpers/diagnoses.ts` (63 lines) — DG1 walker with {code CWE, description, dateTime Date per D-18, type} |
| insurance() | `src/helpers/insurance.ts` (123 lines) — single-slot IN1 state machine; hasIn2/hasIn3 positional flags; 9 IN1 fields parsed |
| orders tests | `test/helpers-orders.test.ts` (112 lines — 12 cases) |
| collection tests | `test/helpers-collections.test.ts` (168 lines — 16 cases incl. universal HELPERS-07 never-throws sweep) |

## Requirements Closed

| REQ-ID | Status | Proof |
| --- | --- | --- |
| HELPERS-05 | Closed | `orders()` implements D-12 positional OBX grouping, D-16 Order contract, D-24a XCN, ORC-1 → orderControl attachment; 12 integration tests pass |
| HELPERS-06 | Closed | `nextOfKin()` / `allergies()` / `diagnoses()` / `insurance()` all return typed frozen readonly arrays; insurance has hasIn2/hasIn3 positional flags; 11 integration tests pass |
| HELPERS-07 | Closed | Universal never-throws sweep (5 cases) covering all 9 Phase 4 helpers on EMPTY_MSH_ONLY and a fixture with every core segment reduced to its type byte (PID / PV1 / NK1 / AL1 / DG1 / IN1 / IN2 / OBR / OBX / ORC) — no throws in any helper path |

### Phase-Wide HELPERS-0X REQ-ID Closure (Phase 4 Complete)

Phase 4 opened with 7 REQ-IDs spanning the named-helper surface. After four plans, all 7 are closed:

| REQ-ID | Plan | Helper |
| --- | --- | --- |
| HELPERS-01 | 04-02 | `Hl7Message.meta` (buildMeta) |
| HELPERS-02 | 04-02 | `Hl7Message.patient` (buildPatient + pickMrn) |
| HELPERS-03 | 04-03 | `Hl7Message.visit` (buildVisit) |
| HELPERS-04 | 04-03 | `Hl7Message.observations()` + `buildObservation` export |
| HELPERS-05 | 04-04 | `Hl7Message.orders()` (this plan) |
| HELPERS-06 | 04-04 | `Hl7Message.nextOfKin()` / `allergies()` / `diagnoses()` / `insurance()` (this plan) |
| HELPERS-07 | 04-02 + 04-03 + 04-04 | Universal never-throws — proved incrementally per plan, final sweep in this plan spans all 9 surfaces |

## Architecture Notes

### Two-slot ORC state machine — why single-slot fails

The naive approach attaches a "pending ORC" to an OBR the moment the OBR is seen, then clears the slot:

```ts
// BROKEN:
let pendingOrc;
for (seg of allSegments()) {
  if (seg.type === "ORC") pendingOrc = seg;
  if (seg.type === "OBR") {
    finalizePreviousOrder(..., pendingOrc);   // <-- wrong ORC!
    openNewOrder(pendingOrc);
    pendingOrc = undefined;
  }
}
```

When the loop finalizes the PREVIOUS order, `pendingOrc` already holds the NEXT group's ORC (set between the previous OBR and this new OBR). The previous group either gets a stale ORC or no ORC.

The two-slot design separates accumulation from attachment:

- `pendingOrc` — "ORCs seen since the last OBR" (may be set to a new ORC mid-stream)
- `currentOrc` — "ORC attached to the currently-open OBR group"

On each OBR: **first** close the previous group with `currentOrc` (the previous group's attached ORC, unchanged by recent ORCs), **then** promote `pendingOrc → currentOrc` for the new group and reset `pendingOrc`. Trailing ORC after the last OBR stays in `pendingOrc` and is never promoted — correctly dropped.

### IN1 single-slot state machine

IN2 / IN3 attach to the MOST RECENT IN1 (they cannot precede any IN1), so a single IN1 slot suffices. We track `currentIn1` + two booleans; on each new IN1 we finalize the previous IN1 group and reset the flags. IN2 / IN3 appearing before any IN1 (or between IN1 groups with no surrounding IN1) are harmlessly ignored via the `currentIn1 !== undefined` guard.

### buildObservation reuse — one source of truth

`orders()` imports `buildObservation` from `./observations.js` and calls it per OBX. Consequence:

- D-13 valueType dispatch (NM / TS / DT / CWE / CE / string fallback) lives in exactly ONE file.
- D-15 common-field shape (setId / identifier / units / referenceRange / abnormalFlags / status / observedDateTime) lives in exactly ONE file.
- Any future D-13 extension (Phase 7 vendor-quirk valueTypes) automatically applies to both `msg.observations()` and `msg.orders()[i].observations`.

### D-12 grouping vs. `msg.observations()` completeness

`orders()` intentionally excludes OBX segments appearing before any OBR. But `msg.observations()` continues to return ALL OBX segments in document order (Plan 03 semantics unchanged). Test `"OBX before any OBR is NOT attached to an order (D-12)"` asserts both halves of this invariant: `orders.length === 1` AND `msg.observations().length === 2`.

### D-24 option (a) XCN end-to-end

Plan 01 introduced XCN as the composite for clinician identifiers. Plan 03 used it for `Visit.attendingDoctor` / `Visit.referringDoctor`. Plan 04 extends it to `Order.orderedBy` (OBR-16). Every HL7 clinician-reference field that surfaces through a helper now exposes `idNumber` + `familyName` + `givenName` + `assigningAuthority` HD + identifier type codes — no string fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OBR fixture off-by-one pipe placed XCN1 at OBR-17**

- **Found during:** Task 1 GREEN verification (`orderedBy` test)
- **Issue:** The plan's TWO_ORDERS fixture `OBR|1|PLACER1|FILLER1|GLU^Glucose^LN|||||||||||||XCN1^Doe^John` has 13 pipes after `GLU^Glucose^LN`, putting `XCN1^Doe^John` at OBR-17. The Plan 01 `Order.orderedBy` contract and the Plan 01/04 interface doc both specify OBR-16 as orderingProvider. The helper correctly reads OBR-16; the fixture was wrong.
- **Fix:** Trimmed one pipe so XCN1 lands at OBR-16.
- **Files modified:** `test/helpers-orders.test.ts`
- **Commit:** `b7b771a`

**2. [Rule 1 - Bug] NK1 fixture off-by-one pipe placed FTHR at NK1-8**

- **Found during:** Task 2 GREEN verification (`contactRole` test)
- **Issue:** The plan's NK1 fixture `NK1|1|Doe^John^^^Mr|FTH|456 Oak St^^Boston^MA|(555)111-2222|||FTHR` has 3 pipes after phone, putting `FTHR` at NK1-8. The Plan 01 `NextOfKin.contactRole` contract and the Plan 04 interface doc both specify NK1-7 as contactRole. The helper correctly reads NK1-7; the fixture was wrong.
- **Fix:** Trimmed one pipe so FTHR lands at NK1-7.
- **Files modified:** `test/helpers-collections.test.ts`
- **Commit:** `7281829`

No other deviations. No architectural changes. No authentication gates.

## Verification

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | Clean (tsc --noEmit, 0 errors) |
| `pnpm lint` | Clean (eslint --max-warnings=0) |
| `pnpm test` | 41 files / 459 tests all passing (baseline 431 + 12 orders + 16 collections = 459) |
| `pnpm build` | Clean (tsup + dts emit; ESM 82 KB, CJS 83 KB, dts 103 KB) |

## Known Stubs

None. All 5 targeted stub helpers from Plan 01 are now implemented. The only `@internal`-annotated surface left is the helper-file JSDoc markers that remain `@internal` because the public entry point is `Hl7Message.*` method wiring (set up in Plan 01), not direct imports.

## Phase 4 Complete Marker

- All 7 HELPERS-0X REQ-IDs closed (HELPERS-01 through HELPERS-07).
- All 9 named helper surfaces ship: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()`.
- The north-star DX is reachable: `parseHL7(raw).orders()[0].observations[0].value`, `parseHL7(raw).patient?.fullName`, `parseHL7(raw).insurance()[0].hasIn2` — no segment / field numbers needed.
- 459 tests green (up from 431 at plan start).
- Zero runtime dependencies retained; every helper composes through the Phase 3 public read surface.

## Commits

| Hash | Type | Message |
| --- | --- | --- |
| `2bc282e` | test | RED — failing tests for orders() (HELPERS-05) |
| `b7b771a` | feat | implement orders() with D-12 positional OBX grouping (HELPERS-05) |
| `50812e3` | test | RED — failing tests for collection helpers (HELPERS-06/07) |
| `7281829` | feat | implement nextOfKin/allergies/diagnoses/insurance (HELPERS-06/07) |

## Self-Check: PASSED

- src/helpers/orders.ts: FOUND
- src/helpers/next-of-kin.ts: FOUND
- src/helpers/allergies.ts: FOUND
- src/helpers/diagnoses.ts: FOUND
- src/helpers/insurance.ts: FOUND
- test/helpers-orders.test.ts: FOUND
- test/helpers-collections.test.ts: FOUND
- Commits 2bc282e, b7b771a, 50812e3, 7281829: all FOUND
- pnpm typecheck / lint / test / build: all GREEN
