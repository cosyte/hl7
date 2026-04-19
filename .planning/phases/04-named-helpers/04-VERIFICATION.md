---
phase: 04-named-helpers
verified: 2026-04-19T11:45:00Z
status: passed
score: 4/4 success criteria verified; 7/7 REQ-IDs (HELPERS-01..07) closed
re_verification:
  previous_status: none
  previous_score: —
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 4: Named Helpers Verification Report

**Phase Goal:** A developer can fulfill the north star — one-line extraction of common HL7 fields — through `msg.meta`, `msg.patient`, `msg.visit`, and the collection helpers, without knowing segment/field numbers.

**Verified:** 2026-04-19T11:45:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (ROADMAP.md Phase 4)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Developer can read `msg.meta.type`, `msg.meta.controlId`, `msg.meta.timestamp` (as a `Date`), and all other MSH-derived metadata without touching the MSH segment directly | PASS | Live demo: `msg.meta.type === "ORU^R01^ORU_R01"`, `msg.meta.timestamp.toISOString() === "2026-04-19T13:35:00.000Z"`, `msg.meta.controlId === "MSG001"`, plus all 12 MSH-derived fields resolved. Implementation: `src/helpers/meta.ts:38-109` (`buildMeta`) wired at `src/model/message.ts:295-297` (`get meta()`). Test: `test/helpers-meta.test.ts` 14 cases green. |
| 2 | Developer can read `msg.patient.mrn`, `msg.patient.fullName`, `msg.patient.dateOfBirth`, and the full patient contract on any message with a PID; absent fields return `undefined` and never throw | PASS | Live demo: `msg.patient.mrn === "MRN9999"` (picked from PID-3 repetition with CX-5="MR"), `msg.patient.fullName === "Jane Q Smith, Jr"` (Western order per D-17), `msg.patient.dateOfBirth.toISOString() === "1980-01-01T00:00:00.000Z"`. Implementation: `src/helpers/patient.ts:80-148` (`buildPatient`) + `src/helpers/pick-mrn.ts:42-50` (`pickMrn`). D-04: `msg.patient === undefined` verified on MSH-only input. Test: `test/helpers-patient.test.ts` 25 cases green. |
| 3 | Developer can read `msg.visit?.patientClass`, `msg.visit?.admitDateTime`, and visit fields on messages with a PV1 segment, and `msg.visit` itself is `undefined` (or nullable) on messages without one | PASS | Live demo: `msg.visit.patientClass === "I"`, `msg.visit.location.pointOfCare === "ICU"`, `msg.visit.attendingDoctor.familyName === "House"` (XCN composite per D-24a), `msg.visit.attendingDoctor.idNumber === "ATT123"`. `msg.visit === undefined` verified on MSH-only input. Implementation: `src/helpers/visit.ts:58-96`. Test: `test/helpers-visit.test.ts` 12 cases green; `test/helpers-cache-invalidation-visit.test.ts` 5 cache cases green. |
| 4 | Developer can iterate `msg.observations()`, `msg.orders()` (with observations linked to their parent order), `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, and `msg.insurance()` and receive typed arrays (empty when the source segments are absent) | PASS | Live demo on ORU^R01 fixture: `msg.observations().length === 3` with correct discriminated values (NM→120 number, ST→string, TS→Date), `msg.orders()[0].observations.length === 3` with OBR-16 XCN `orderedBy`, `msg.nextOfKin()[0].name.familyName === "Smith"`, `msg.allergies()[0].code.identifier === "PEN"`, `msg.diagnoses()[0].code.identifier === "E11.9"`, `msg.insurance()[0].hasIn2 === true`. All 6 return `[]` on MSH-only input (D-05). Implementation: `src/helpers/observations.ts`, `orders.ts`, `next-of-kin.ts`, `allergies.ts`, `diagnoses.ts`, `insurance.ts`. Tests: `helpers-observations.test.ts` (23), `helpers-orders.test.ts` (12), `helpers-collections.test.ts` (16). |

**Score:** 4/4 success criteria verified

### REQ-ID Coverage (HELPERS-01 through HELPERS-07)

| REQ-ID | Description | Status | Evidence (file:line) |
|---|---|---|---|
| HELPERS-01 | `msg.meta` exposes 12 MSH-derived fields (type, messageCode, triggerEvent, messageStructure, controlId, timestamp as Date, version, sendingApp, sendingFacility, receivingApp, receivingFacility, processingId) | PASS | Interface: `src/helpers/types.ts:46-71` (all 12 fields declared). Impl: `src/helpers/meta.ts:38-109` (all 12 fields populated via `msg.get()` / `field.asTs()`). Wired: `src/model/message.ts:295-297`. Tests: `test/helpers-meta.test.ts` 14 cases green. Live demo confirms flat Date per D-18: `msg.meta.timestamp.toISOString()` works in one line. |
| HELPERS-02 | `msg.patient` exposes mrn, identifiers[], name (XPN), familyName, givenName, middleName, fullName, dateOfBirth (Date), sex, address (XAD), phoneNumbers[], race, ethnicity, language; undefined on absence; never throws | PASS | Interface: `src/helpers/types.ts:95-124` (all 14 fields declared). Impl: `src/helpers/patient.ts:80-148` (D-07 MR-pick via `pickMrn`, D-17 Western fullName via `composeFullName`, D-18 flat dateOfBirth, D-19 flat aliases, D-20 PID-13+PID-14 phone concat). D-04 nullable verified at `patient.ts:82` (`if (pid === undefined) return undefined`). Wired: `src/model/message.ts:311-316` (null-sentinel cache). Tests: `test/helpers-patient.test.ts` 25 cases green. |
| HELPERS-03 | `msg.visit` (nullable) exposes patientClass, location (PL), admitDateTime, dischargeDateTime, attendingDoctor (XCN), referringDoctor (XCN), visitNumber | PASS | Interface: `src/helpers/types.ts:144-159`. Impl: `src/helpers/visit.ts:58-96` (D-24a XCN via `asXcn()` at `visit.ts:74,78`; D-18 flat Dates at `visit.ts:89,93`; nullable via `if (pv1 === undefined) return undefined` at `visit.ts:60`). Wired: `src/model/message.ts:329-334`. Tests: `test/helpers-visit.test.ts` 12 cases + `test/helpers-cache-invalidation-visit.test.ts` 5 cache cases. Live demo confirms `msg.visit.attendingDoctor.idNumber === "ATT123"` resolves the XCN. |
| HELPERS-04 | `msg.observations()` returns array of {setId, valueType, identifier (CWE), value (typed by valueType), units, referenceRange, abnormalFlags, status, observedDateTime} | PASS | Interface: `src/helpers/types.ts:175-225` (`ObservationBase` + discriminated `Observation` union D-13). Impl: `src/helpers/observations.ts:157-162` (`buildObservation`) + `:181-187` (`observations`). D-13 dispatch at `observations.ts:91-136` (NM→number, TS/DT→Date, CWE/CE→composite, others→string). D-05 at `observations.ts:182-186` (empty array on no OBX). Wired: `src/model/message.ts:348-350`. Tests: `test/helpers-observations.test.ts` 23 cases covering every valueType branch. Live demo: NM=120 number, TS=Date, ST=string all resolved correctly. |
| HELPERS-05 | `msg.orders()` returns orders linked to OBX observations with placerOrderNumber, fillerOrderNumber, orderControl, orderStatus, orderedBy, universalServiceId, observations[] | PASS | Interface: `src/helpers/types.ts:244-259`. Impl: `src/helpers/orders.ts:100-148` (two-slot ORC state machine in `orders.ts:102-133`; D-12 positional OBX grouping at `orders.ts:130-132`; reuses `buildObservation` from Plan 03; D-16 field contract at `finalizeOrder` `:45-77`; D-24a XCN `orderedBy` at `orders.ts:73`). Wired: `src/model/message.ts:363-365`. Tests: `test/helpers-orders.test.ts` 12 cases. Live demo: `msg.orders()[0].observations.length === 3` with attached OBX. |
| HELPERS-06 | `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` return typed arrays (empty when absent) | PASS | Interfaces: `src/helpers/types.ts:274-285` (NextOfKin), `:301-312` (Allergy), `:327-336` (Diagnosis), `:355-376` (Insurance with `hasIn2`/`hasIn3` positional flags). Impls: `src/helpers/next-of-kin.ts:37-61`, `allergies.ts:43-67`, `diagnoses.ts:42-63`, `insurance.ts:90-123` (IN1 single-slot state machine at `insurance.ts:92-122` for IN2/IN3 positional grouping). Wired: `src/model/message.ts:378-419`. Tests: `test/helpers-collections.test.ts` 16 cases (3 NK1 + 2 AL1 + 2 DG1 + 3 IN1 + 5 universal sweep). Live demo: all 4 collections resolve real data; all 4 return `[]` on MSH-only input. |
| HELPERS-07 | All helpers return `undefined` / empty arrays for missing optional data; never throw | PASS | Proven on 3 axes: (a) D-04 `patient.ts:82` + D-04-parallel `visit.ts:60` return `undefined` on absent anchor segment (live demo confirms). (b) All collection helpers return `[]` per D-05 (live demo on MSH-only: `msg.observations() === []`, `msg.orders() === []`, `msg.nextOfKin() === []`, `msg.allergies() === []`, `msg.diagnoses() === []`, `msg.insurance() === []`). (c) Universal never-throws sweep at `test/helpers-collections.test.ts:121-168` (5 cases) iterates all 9 helper surfaces on EMPTY_MSH_ONLY plus a reduce-to-type-byte fixture — no throws. Every builder uses omit-on-empty via `Mutable<T>` + conditional-assignment pattern so `exactOptionalPropertyTypes` stays clean. |

**Coverage:** 7/7 HELPERS-0X REQ-IDs closed. No orphans — no additional HELPERS REQ-IDs are mapped to Phase 4 in REQUIREMENTS.md.

---

## Artifact Verification

### Helper Source Files

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/helpers/types.ts` | 9 typed interfaces for all helper shapes | VERIFIED | `Meta`, `Patient`, `Visit`, `ObservationBase`, `Observation` (discriminated union), `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance` — all declared with `readonly` fields + JSDoc `@example` blocks. `exactOptionalPropertyTypes`-safe (no `\| undefined` on declarations). |
| `src/helpers/meta.ts` | `buildMeta(msg): Meta` full impl | VERIFIED | 109 lines, composes via `msg.get()` + `field.asTs()`; D-01 frozen at boundary; D-18 flat Date; D-22 never-throws. No `NOT IMPLEMENTED` stubs. |
| `src/helpers/patient.ts` | `buildPatient(msg): Patient \| undefined` full impl | VERIFIED | 148 lines including internal `composeFullName`. D-04 nullable, D-07/D-08/D-10 via `pickMrn`, D-17 Western fullName, D-18 flat dateOfBirth, D-19 flat aliases, D-20 PID-13+PID-14 phone concat, D-01 frozen. No stubs. |
| `src/helpers/pick-mrn.ts` | Full `pickMrn` impl | VERIFIED | 50 lines. D-07 MR-typed preference, D-08 first-CX fallback, D-10 case-sensitive. Exported publicly via `src/index.ts:121` for Phase 6 profile hooks. |
| `src/helpers/visit.ts` | `buildVisit(msg): Visit \| undefined` full impl | VERIFIED | 96 lines. D-24a XCN doctors (`pv1.field(7).asXcn()` + `pv1.field(8).asXcn()`), D-18 flat Dates (PV1-44/-45), D-22 never-throws, D-01 frozen. No stubs. |
| `src/helpers/observations.ts` | `observations` + exported `buildObservation` | VERIFIED | 187 lines. Both functions exported (Plan 03 requirement for Plan 04 reuse). D-13 value-type dispatch for NM/TS/DT/CWE/CE/other. D-15 common fields (setId, identifier, units, referenceRange, abnormalFlags, status, observedDateTime). D-01 freezes each Observation + outer array. |
| `src/helpers/orders.ts` | `orders` full impl with positional OBX grouping | VERIFIED | 148 lines. Two-slot ORC state machine (`pendingOrc`/`currentOrc`) over `msg.allSegments()`. D-12 positional grouping. Reuses `buildObservation` — no duplicate value-type dispatch. D-16 field contract, D-24a XCN `orderedBy`. |
| `src/helpers/next-of-kin.ts` | `nextOfKin` full impl | VERIFIED | 61 lines. NK1 walker with {name XPN, relationship CWE, address XAD, phone XTN first rep, contactRole CWE}. |
| `src/helpers/allergies.ts` | `allergies` full impl | VERIFIED | 67 lines. AL1 walker with D-18 flat onsetDate. |
| `src/helpers/diagnoses.ts` | `diagnoses` full impl | VERIFIED | 63 lines. DG1 walker with D-18 flat dateTime. |
| `src/helpers/insurance.ts` | `insurance` full impl with IN1/IN2/IN3 positional grouping | VERIFIED | 123 lines. Single-slot IN1 state machine sets `hasIn2`/`hasIn3` boolean flags on intervening IN2/IN3 segments. |
| `src/helpers/index.ts` | Internal barrel | VERIFIED | Re-exports all 10 helper interfaces + 10 builder/walker functions + `pickMrn`. Not part of public surface; consumed by `src/model/message.ts`. |
| `src/model/types/xcn.ts` | XCN composite (D-24a 11th v1 composite) | VERIFIED | Interface + `parseXcn` + `parseAssigningAuthority` (nested HD). 13 components per HL7 Chapter 2.A.88. Namespace entry at `src/model/types/namespace.ts`; `Field.asXcn()` coercion in `src/model/field.ts`; public re-exports at `src/index.ts:95-96`. |

### Test Files

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `test/helpers-meta.test.ts` | Integration tests for `buildMeta` | VERIFIED | 14 cases green |
| `test/helpers-patient.test.ts` | Integration tests for `buildPatient` + fullName composition + MRN pick | VERIFIED | 25 cases green |
| `test/helpers-pick-mrn.test.ts` | Unit tests for `pickMrn` (D-07/D-08/D-10) | VERIFIED | 8 cases green |
| `test/helpers-visit.test.ts` | Integration tests for `buildVisit` with XCN doctors | VERIFIED | 12 cases green |
| `test/helpers-observations.test.ts` | Integration tests covering all D-13 valueType branches | VERIFIED | 23 cases green |
| `test/helpers-orders.test.ts` | Integration tests for `orders` positional grouping | VERIFIED | 12 cases green |
| `test/helpers-collections.test.ts` | Integration tests for NK1/AL1/DG1/IN1 + universal HELPERS-07 never-throws sweep | VERIFIED | 16 cases green (incl. 5-case universal sweep over all 9 helper surfaces) |
| `test/helpers-cache-invalidation.test.ts` | Memoization + invalidation tests for `_meta`/`_patient` | VERIFIED | 9 cases green |
| `test/helpers-cache-invalidation-visit.test.ts` | Memoization + invalidation tests for `_visit` cache slot | VERIFIED | 5 cases green |
| `test/types-xcn.test.ts` | XCN composite unit tests | VERIFIED | 8 cases green |

### Key Link Verification (Wiring)

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `Hl7Message.meta` getter | `buildMeta` | Direct call + memoization | WIRED | `src/model/message.ts:295-297`: `return (this._meta ??= buildMeta(this));` |
| `Hl7Message.patient` getter | `buildPatient` + `pickMrn` | Null-sentinel cache slot | WIRED | `src/model/message.ts:311-316`; `patient.ts:96` calls `pickMrn(frozenIds)` |
| `Hl7Message.visit` getter | `buildVisit` | Null-sentinel cache slot | WIRED | `src/model/message.ts:329-334` |
| `Hl7Message.observations()` | `walkObservations` | Re-exported from `src/helpers/observations.ts` | WIRED | `src/model/message.ts:348-350` |
| `Hl7Message.orders()` | `walkOrders` + `buildObservation` | Imports `buildObservation` at `orders.ts:36` | WIRED | `src/model/message.ts:363-365`; `orders.ts:131`: `currentObservations.push(buildObservation(seg))` |
| `Hl7Message.nextOfKin/allergies/diagnoses/insurance()` | `walk{NextOfKin,Allergies,Diagnoses,Insurance}` | Re-exports from helper files | WIRED | `src/model/message.ts:378-419` |
| Mutation methods (`setField`/`addSegment`/`removeSegment`) | `invalidateCaches` | Phase 3 D-17 + Phase 4 D-02 wholesale drop | WIRED | `src/model/message.ts:673-679`: drops `_meta`, `_patient`, `_visit`, `_segmentsByType`, `_allSegments`. Called from all 3 mutation methods. Proven by `helpers-cache-invalidation*.test.ts`. |
| `src/index.ts` public barrel | All 9 helper types + `pickMrn` + `XCN`/`parseXcn` | Named re-exports | WIRED | `src/index.ts:95-121` — `Meta`, `Patient`, `Visit`, `Observation`, `ObservationBase`, `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance` as type-only exports + `pickMrn` + `XCN` type + `parseXcn` |

---

## Data-Flow Trace (Level 4)

For each helper, verified that real HL7 data flows end-to-end from raw message text to the helper's output — not just that the plumbing exists:

| Helper | Data Source | Produces Real Data | Status | Evidence |
|---|---|---|---|---|
| `msg.meta` | MSH segment via `msg.get()` + `msh.field(7).asTs()` | Yes | FLOWING | Demo: `msg.meta.type === "ORU^R01^ORU_R01"`, `msg.meta.timestamp.toISOString() === "2026-04-19T13:35:00.000Z"` |
| `msg.patient` | PID segment via `pid.field(N).asXxx()` + `pickMrn` | Yes | FLOWING | Demo: `msg.patient.mrn === "MRN9999"` (picked via CX-5="MR"), `msg.patient.fullName === "Jane Q Smith, Jr"`, `msg.patient.dateOfBirth.toISOString() === "1980-01-01T00:00:00.000Z"` |
| `msg.visit` | PV1 segment via `pv1.field(N).asXxx()` | Yes | FLOWING | Demo: `msg.visit.patientClass === "I"`, `msg.visit.location.pointOfCare === "ICU"`, `msg.visit.attendingDoctor.idNumber === "ATT123"` (XCN composite) |
| `msg.observations()` | OBX segments via `msg.segments("OBX")` + `buildObservation` | Yes | FLOWING | Demo: 3 OBX → 3 observations with correct typed values (NM=120 number, TS=Date, ST=string) |
| `msg.orders()` | `msg.allSegments()` state machine over OBR/ORC/OBX | Yes | FLOWING | Demo: 1 OBR → 1 Order with `observations.length === 3`, `placerOrderNumber === "PLACER1"`, `orderControl === "NW"` (from preceding ORC) |
| `msg.nextOfKin()` | NK1 segments via `msg.segments("NK1")` | Yes | FLOWING | Demo: 1 NK1 → `{name.familyName: "Smith", relationship.identifier: "SPO"}` |
| `msg.allergies()` | AL1 segments via `msg.segments("AL1")` | Yes | FLOWING | Demo: 1 AL1 → `{code.identifier: "PEN", severity: "SV"}` |
| `msg.diagnoses()` | DG1 segments via `msg.segments("DG1")` | Yes | FLOWING | Demo: 1 DG1 → `{code.identifier: "E11.9", type: "F"}` |
| `msg.insurance()` | `msg.allSegments()` state machine over IN1/IN2/IN3 | Yes | FLOWING | Demo: 1 IN1 + 1 IN2 → `{planId.identifier: "PLAN1", hasIn2: true, hasIn3: false}` |

All 9 helpers produce real data from real HL7 input. No hollow props, no hardcoded defaults leaking to output. No helper walks `rawSegments` directly — all compose on Phase 3's public read surface (`msg.get` / `msg.segments` / `msg.allSegments` / `field.asXxx`) as required by CONTEXT.md §domain "Compose, don't reach through".

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite passes | `pnpm test` | 459/459 passing across 41 files (Duration 5.30s) | PASS |
| TypeScript typecheck clean (strict + noUncheckedIndexedAccess) | `pnpm typecheck` | Exit 0, no output | PASS |
| ESLint clean with `--max-warnings=0` | `pnpm lint` | Exit 0, no output | PASS |
| Dual ESM+CJS build succeeds | `pnpm build` | CJS 82.93KB, ESM 81.98KB, DTS 103.44KB, exit 0 | PASS |
| North-star one-liner DX | Scratch demo loading `dist/index.mjs` and exercising `msg.meta`, `msg.patient?.mrn`, `msg.patient?.fullName`, `msg.visit?.attendingDoctor?.familyName`, `msg.observations()`, `msg.orders()[0].observations`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` | All resolve to typed, expected values in one line each; MSH-only input returns `undefined`/`[]` for every helper; `msg.meta === msg.meta` memoization identity holds; `msg.setField("PID.5.1", "Jones")` invalidates the patient cache and new reads surface the updated familyName | PASS |
| SEGMENT_NAME_RE widening (Plan 03 deviation) is a safe superset | Scratch test accepting {PID, PV1, PV2, IN1, IN2, IN3, DG1, AL1, NK1, ZPI, Z1A} and rejecting {"lowercase", "AB", "ABCD", "", "123", "1AB", " AB"} | All previously-valid names still validate; all previously-rejected invalid shapes still rejected; standard digit-bearing HL7 segments (PV1/IN1/DG1/AL1/NK1/PV2) now accepted by mutation API as intended | PASS |
| Frozen helper outputs reject mutation in strict mode | `msg.meta.type = "X"` in strict module context | Throws TypeError as expected (D-01) | PASS |

---

## Requirements Coverage (Phase 4 scope)

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| HELPERS-01 | Plan 02 | `msg.meta` 12 MSH fields | SATISFIED | `test/helpers-meta.test.ts` 14/14 + live demo |
| HELPERS-02 | Plan 02 | `msg.patient` 14 PID fields + MRN + fullName | SATISFIED | `test/helpers-patient.test.ts` 25/25 + live demo |
| HELPERS-03 | Plan 03 | `msg.visit` 7 PV1 fields (nullable) with XCN doctors | SATISFIED | `test/helpers-visit.test.ts` 12/12 + live demo |
| HELPERS-04 | Plan 03 | `msg.observations()` with D-13 valueType dispatch | SATISFIED | `test/helpers-observations.test.ts` 23/23 + live demo |
| HELPERS-05 | Plan 04 | `msg.orders()` with positional OBX grouping | SATISFIED | `test/helpers-orders.test.ts` 12/12 + live demo |
| HELPERS-06 | Plan 04 | `msg.nextOfKin()` / `allergies()` / `diagnoses()` / `insurance()` | SATISFIED | `test/helpers-collections.test.ts` 16/16 + live demo |
| HELPERS-07 | Plans 02+03+04 | Universal never-throws + undefined/[] on missing data | SATISFIED | Universal sweep at `test/helpers-collections.test.ts:121-168` + live demo (MSH-only returns undefined/[] across all 9 surfaces) |

**Orphaned requirements:** None. REQUIREMENTS.md maps exactly HELPERS-01..07 to Phase 4, and every plan's `requirements-completed` field covers this set with no overlap gaps.

---

## Plan 03 SEGMENT_NAME_RE Deviation Review

Plan 03 widened `SEGMENT_NAME_RE` from `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` to `/^[A-Z][A-Z0-9]{2}$/u` in `src/model/message.ts:53` and `src/model/dot-path.ts:69` to unblock mutation of standard HL7 segments containing digits (PV1, PV2, IN1, IN2, IN3, DG1, AL1, NK1).

**Safety verification (scratch test, above):**

- Every name previously accepted (e.g. `PID`, `OBX`, `MSH`, `ZPI`, `Z1A`) continues to be accepted.
- Every malformed shape previously rejected (`"lowercase"`, `"AB"`, `"ABCD"`, `""`, `"123"`, `"1AB"`, `" AB"`) continues to be rejected.
- New acceptances: `PV1`, `PV2`, `IN1`, `IN2`, `IN3`, `DG1`, `AL1`, `NK1` — all standard HL7 v2 segment names that the parser already tolerated at parse time but that the mutation API used to refuse.

The widening is a strict superset; it corrects a latent Phase 3 Plan 04 bug rather than introducing a new schema. No regression potential identified. The existing `test/model-mutation.test.ts` negative-case suite continues to pass, confirming that malformed names still throw. Fix is architecturally neutral and aligns mutation-API tolerance with parser tolerance.

**Verdict:** Deviation is safe and correctly documented. No rollback needed.

---

## Anti-Patterns Scan

Anti-pattern sweep across all Phase 4 source files:

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none found) | — | — | — | No TODO/FIXME/XXX/HACK/placeholder comments in any Phase 4 source file. No `return null` / `return {}` / `return []` shortcuts that bypass the contract (collection helpers return real `[]` only via `Object.freeze([])` when segments are genuinely absent). No `console.*` usage. No unjustified `as` casts beyond the sanctioned `Mutable<T>` + `Object.freeze(out) as <Interface>` boundary pattern that every Phase 3 composite parser also uses. No `NOT IMPLEMENTED` stub strings remain — Plan 01's plan-numbered stub error messages were all replaced in Plans 02/03/04. |

Clean scan. Every helper file uses the locked `Mutable<T> + conditional-assignment + Object.freeze` pattern consistently; every optional field honors `exactOptionalPropertyTypes` by omitting keys rather than setting them to `undefined`.

---

## Human Verification Required

None. All phase 4 helpers are pure functions over parsed HL7 trees with deterministic outputs. The full contract (shape, discriminated value-type, memoization identity, mutation invalidation, frozen output, never-throw, undefined/[] on absent data, XCN-not-flat doctors, flat Dates per D-18) is verifiable programmatically, and has been verified above via automated tests (459 passing), typecheck, lint, build, and a live DX scratch demo against a realistic multi-segment HL7 fixture.

Phase 8 (examples) and Phase 7 (vendor-quirk fixtures) will exercise these helpers against real-world vendor output — those are deferred from Phase 4 scope by design and tracked in the roadmap.

---

## Gaps Summary

**No gaps.** Phase 4 delivers every named helper surface required by the north star one-liner DX:

- `msg.meta` (12 MSH fields, flat Date timestamp)
- `msg.patient` (14 PID fields, MR-typed MRN pick, Western fullName, flat dateOfBirth, concatenated phones, nullable on no-PID)
- `msg.visit` (7 PV1 fields, XCN doctors, flat admit/discharge Dates, nullable on no-PV1)
- `msg.observations()` (D-13 discriminated union: NM→number, TS/DT→Date, CWE/CE→composite, others→string)
- `msg.orders()` (OBR grouping with positionally-attached OBX via two-slot ORC state machine; D-24a XCN `orderedBy`)
- `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` (typed arrays; insurance has IN2/IN3 positional presence flags)

All 9 helpers are wired through `Hl7Message` getters/methods, with `_meta`/`_patient`/`_visit` memoization cache slots that are invalidated wholesale by the mutation API. The Plan 03 `SEGMENT_NAME_RE` widening is a safe superset that fixes a latent Phase 3 bug. Full test suite (459 passing), typecheck, lint, and dual ESM+CJS build all exit cleanly.

**Verdict: PASSED.**

---

*Verified: 2026-04-19T11:45:00Z*
*Verifier: Claude (gsd-verifier)*
