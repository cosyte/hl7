---
phase: 06-profile-system-and-built-ins
verified: 2026-04-19T20:15:00Z
status: passed
score: 5/5 success criteria verified (15/15 requirements satisfied)
overrides_applied: 0
---

# Phase 6: Profile System & Built-ins — Verification Report

**Phase Goal:** A developer can define, extend, and compose vendor/integration profiles via a first-class public API, apply them to parses, and rely on 5 ready-made profiles (epic, cerner, meditech, athena, genericLab) that reduce warnings against realistic vendor shapes.

**Verified:** 2026-04-19T20:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `defineProfile` returns frozen `Profile` with name/description/customSegments/dateFormats/lineage/describe(); invalid input → `ProfileDefinitionError` with actionable message. | VERIFIED | Runtime smoke: `defineProfile({name:'bad', customSegments:{PID:{...}}})` throws `ProfileDefinitionError` with message `Profile 'bad' declares customSegments for 'PID' — only Z-segments (Z[A-Z0-9]{2})...`. `Object.freeze` at `src/profiles/define.ts:177`. `describe()` output includes `Profile 'epic'` / `lineage: epic` / `customSegments: 2 (ZDP, ZRS)` / `dateFormats: 2`. 35 tests in `test/profiles-define.test.ts`. |
| 2 | `extends: parentProfile` OR `extends: [p1, p2]` — scalars overwrite, arrays concat+dedupe, customSegments deep-merge, onWarning handlers chain. | VERIFIED | Runtime smoke: `defineProfile({name:'child', extends: profiles.epic, dateFormats:['YYYY/MM/DD']})` → `lineage=['epic','child']`, `dateFormats=['MM/DD/YYYY HH:mm:ss','MM/DD/YYYY','YYYY/MM/DD']` (parent-then-child concat+dedupe). 5 merge helpers in `src/profiles/merge.ts` (`mergeLineage`, `mergeDateFormats`, `mergeCustomSegments`, `mergeScalar`, `composeOnWarning`). 21 tests in `test/profiles-extends.test.ts`. |
| 3 | `parseHL7(raw, profile)` populates `msg.profile?.name` + `msg.profile?.lineage`; custom Z-segments accessible by declared field name; re-serialization produces spec-clean HL7. | VERIFIED | Runtime smoke against `test/fixtures/vendor-shapes/epic/adt-a01.hl7`: `msg.profile.name === 'epic'`, `msg.profile.lineage === ['epic']`. `zdp.get('departmentCode').value === 'CARDIOLOGY'`, `zdp.get('departmentName').value === 'Cardiology Department'`, `zdp.get('doesNotExist') === undefined`. **PROF-09 round-trip:** `parseHL7(raw, profiles.epic).toString() === parseHL7(raw).toString()` (byte-equal). Wired in `src/model/segment.ts` + `src/model/message.ts` + `src/parser/index.ts`. 23 tests in `test/profiles-custom-segments.test.ts`. |
| 4 | `setDefaultProfile`/`getDefaultProfile` manages process-scoped default; explicit arg overrides; `{ profile: null }` opts out. | VERIFIED | Runtime smoke: `getDefaultProfile() === undefined` initially; `setDefaultProfile(profiles.epic); parseHL7(raw).profile.name === 'epic'`; `parseHL7(raw, { profile: null }).profile === undefined`; `setDefaultProfile(null); parseHL7(raw).profile === undefined`. Module-level `let _defaultProfile` in `src/profiles/default.ts`. 13 tests in `test/profiles-default.test.ts`. |
| 5 | `profiles.epic|cerner|meditech|athena|genericLab` + parse fixture with profile → fewer warnings than lenient parse without profile; each built-in authored through public `defineProfile()` API. | VERIFIED | All 5 built-ins present: `src/profiles/{epic,cerner,meditech,athena,genericLab}.ts`, each calling `defineProfile(...)`. Namespace object `profiles = { athena, cerner, epic, genericLab, meditech }` assembled in `src/profiles/index.ts`. Epic fixture smoke: 2 warnings without profile (`UNKNOWN_SEGMENT`) → 0 warnings with `profiles.epic`. 5 fixtures present at `test/fixtures/vendor-shapes/{epic/adt-a01,cerner/oru-r01,meditech/adt-a04,athena/adt-a01,genericLab/oru-r01}.hl7`. 29 tests in `test/profiles-builtins.test.ts`. |

**Score:** 5/5 ROADMAP success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/profiles/define.ts` | `defineProfile` factory + `DefineProfileOptions` + `CustomSegmentDefinition` re-export | VERIFIED | `export function defineProfile` at line 114; `export interface DefineProfileOptions` at line 76; `export type { CustomSegmentDefinition } from "../parser/types.js"` at line 58. `Object.freeze` at line 177. |
| `src/profiles/validate.ts` | `validateProfileName`, `validateOptionKeys`, `validateCustomSegments`, `validateDateFormats`, `validateUniqueFieldNames` | VERIFIED | All 5 validators exported; inlined 15-LoC Levenshtein; Z-segment regex `/^Z[A-Z0-9]{2}$/u`. |
| `src/profiles/describe.ts` | `buildDescribe()` implementation | VERIFIED | Exports `buildDescribe`; output always starts with `Profile '<name>'`; omits absent-field lines per exactOptionalPropertyTypes discipline. |
| `src/profiles/merge.ts` | 5 merge helpers + normaliseParents | VERIFIED | `normaliseParents`, `mergeLineage`, `mergeDateFormats`, `mergeCustomSegments`, `mergeScalar`, `composeOnWarning` all exported. |
| `src/profiles/default.ts` | `setDefaultProfile` + `getDefaultProfile` + module-level `let` | VERIFIED | `let _defaultProfile` private state; `setDefaultProfile(profile \| null)` clears on null; `getDefaultProfile()` returns `Profile \| undefined`. |
| `src/profiles/{epic,cerner,meditech,athena,genericLab}.ts` | 5 built-ins each via `defineProfile()` | VERIFIED | All 5 files exist and import `defineProfile` from `./define.js`. Each declares vendor-typical dateFormats and Z-segments per D-24. |
| `src/profiles/index.ts` | Barrel: `profiles` namespace + re-exports | VERIFIED | `export const profiles = Object.freeze({ athena, cerner, epic, genericLab, meditech })`; re-exports `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, and types `DefineProfileOptions`, `CustomSegmentDefinition`. |
| `src/index.ts` | Public barrel Phase 6 additions (D-26 shape) | VERIFIED | Lines 134-156: `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, `profiles` exported. Types `DefineProfileOptions`, `CustomSegmentDefinition` exported. `SUPPORTED_DATE_TOKENS`, `KNOWN_SEGMENTS` re-exported. **Individual built-ins (`epic`, `cerner`, ...) are NOT top-level named exports** (D-26 honored — verified via `require('./dist/index.cjs')` returning `[]` for filter). |
| `src/parser/types.ts` | `Profile` interface + `CustomSegmentDefinition` canonical declaration + optional `describe?` | VERIFIED | `CustomSegmentDefinition` declared canonically (single source of truth); `Profile.customSegments` tightened to `Record<string, CustomSegmentDefinition>`; `describe?: () => string` added. |
| `src/parser/dates.ts` | `SUPPORTED_DATE_TOKENS` public export | VERIFIED | 7 tokens: `["YYYY","MM","DD","HH","mm","ss","SSSS"]`. |
| `src/parser/known-segments.ts` | `KNOWN_SEGMENTS` frozen set | VERIFIED | New file per Plan 03. Re-exported from `src/index.ts` line 156. |
| `src/model/segment.ts` | `Segment.get(name): Field \| undefined` method | VERIFIED | Method returns `undefined` (not synthetic-empty) for unknown names; resolves via merged customSegments map. |
| `src/model/message.ts` | `Hl7Message` stores merged customSegments + passes per-segment slice to `Segment` ctor | VERIFIED | `_customSegments` stored; threaded through `allSegments()` to each `Segment` construction. |
| `src/parser/index.ts` | `effectiveProfile` hoisted to Step 6.5; D-22 chain wired into makeEmitter; Step 11.5 UNKNOWN_SEGMENT emit + profile suppression | VERIFIED | Default-profile fallback layered via `getDefaultProfile()` in Step 6.5. `makeEmitter` invokes `effectiveProfile?.onWarning?.(w)` inside try/catch BEFORE `options.onWarning?.(w)` per D-22. |
| 5 vendor-shape fixtures | `test/fixtures/vendor-shapes/<vendor>/*.hl7` (5 files, synthetic data) | VERIFIED | `epic/adt-a01.hl7`, `cerner/oru-r01.hl7`, `meditech/adt-a04.hl7`, `athena/adt-a01.hl7`, `genericLab/oru-r01.hl7`. |
| 6 test suites | `test/profiles-*.test.ts` covering all Phase 6 surface area | VERIFIED | `profiles-define.test.ts` (35 `it`s), `profiles-extends.test.ts` (21), `profiles-custom-segments.test.ts` (23), `profiles-default.test.ts` (13), `profiles-onwarning-chain.test.ts` (9), `profiles-builtins.test.ts` (29). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/profiles/define.ts` | `src/profiles/validate.ts` | `import { validateProfileName, validateOptionKeys, ... } from "./validate.js"` | WIRED | Lines 36-42. |
| `src/profiles/define.ts` | `src/profiles/merge.ts` | `import { mergeLineage, mergeDateFormats, mergeCustomSegments, mergeScalar, composeOnWarning, normaliseParents } from "./merge.js"` | WIRED | Lines 28-35. |
| `src/profiles/define.ts` | `src/parser/errors.ts` | `ProfileDefinitionError` throw sites in `validate.ts` | WIRED | Confirmed via runtime smoke: `defineProfile({name:'bad', customSegments:{PID:{...}}})` throws `ProfileDefinitionError`. |
| `src/profiles/index.ts` | `src/profiles/{epic,cerner,meditech,athena,genericLab}.ts` | Imports each, assembles into `profiles` namespace | WIRED | Lines 17-21. |
| `src/index.ts` | `src/profiles/index.ts` | `export { defineProfile, setDefaultProfile, getDefaultProfile, profiles } from "./profiles/index.js"` | WIRED | Lines 139-148. |
| `src/parser/index.ts` | `src/profiles/default.ts` | `getDefaultProfile()` call in Step 6.5 | WIRED | Runtime smoke: `setDefaultProfile(profiles.epic); parseHL7(raw).profile.name === 'epic'`. |
| `src/parser/index.ts` makeEmitter | `effectiveProfile.onWarning` | `emit()` invokes `effectiveProfile?.onWarning?.(w)` BEFORE `options.onWarning?.(w)` | WIRED | 9 tests in `profiles-onwarning-chain.test.ts` verify D-22 ordering. |
| `src/parser/index.ts` Step 11.5 | `effectiveProfile.customSegments` | UNKNOWN_SEGMENT suppression check | WIRED | Epic fixture smoke: 2 UNKNOWN_SEGMENT warnings without profile → 0 with `profiles.epic`. |
| `src/model/message.ts` `allSegments()` | `src/model/segment.ts` constructor 4th param | Passes per-segment customSegments slice | WIRED | Runtime smoke: `zdp.get('departmentCode').value === 'CARDIOLOGY'` end-to-end. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `profiles.epic` | frozen Profile | `defineProfile({name:'epic', dateFormats:[...], customSegments:{ZDP,ZRS}})` | Yes — name, lineage, customSegments, dateFormats all populated | FLOWING |
| `msg.profile` attribution | `{ name, lineage }` | `parseHL7` Step 13 when `effectiveProfile` set | Yes — `msg.profile.name === 'epic'` with profile applied, `undefined` without | FLOWING |
| `seg.get(name)` | `Field` | `_customSegments[segName].fields[name]` lookup → delegates to `seg.field(pos)` | Yes — `zdp.get('departmentCode').value === 'CARDIOLOGY'` | FLOWING |
| `msg.toString()` with profile | re-serialized HL7 | Profile-agnostic emitter (D-29) | Yes — byte-equal to `parseHL7(raw).toString()` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `pnpm test` | 55 files, 753 tests, all pass | PASS |
| Typecheck clean | `pnpm typecheck` | Exit 0, no errors | PASS |
| Lint clean at `--max-warnings=0` | `pnpm lint --max-warnings=0` | Exit 0, no warnings | PASS |
| Dual ESM/CJS + DTS build succeeds | `pnpm build` | `dist/index.mjs` (110KB), `dist/index.cjs` (111KB), `dist/index.d.ts`, `dist/index.d.cts` all produced | PASS |
| Public export shape (D-26) | `node -e "..."` via `./dist/index.cjs` | `defineProfile/setDefaultProfile/getDefaultProfile`=function, `profiles`=object; `epic`/`cerner`/etc. NOT top-level | PASS |
| `describe()` output (D-04, PROF-05) | `profiles.epic.describe()` | Multi-line, starts with `Profile 'epic'`, includes lineage, customSegments count+names, dateFormats count | PASS |
| PROF-09 round-trip byte-equal | `parseHL7(raw, profiles.epic).toString() === parseHL7(raw).toString()` | `true` | PASS |
| PROF-08 default profile lifecycle | `getDefaultProfile()` → `undefined`; set/parse; `{profile:null}` opts out; clear | All expected values | PASS |
| PROF-07 Segment.get named access | `zdp.get('departmentCode').value` | `'CARDIOLOGY'`; unknown name → `undefined` | PASS |
| PROF-02 actionable error | `defineProfile({name:'bad', customSegments:{PID:{...}}})` | Throws `ProfileDefinitionError` with `Profile 'bad' declares customSegments for 'PID' — only Z-segments (Z[A-Z0-9]{2})...` | PASS |
| PROF-03 extends + dedupe | `defineProfile({name:'child', extends: profiles.epic, dateFormats:['YYYY/MM/DD']})` | `lineage=['epic','child']`, `dateFormats=['MM/DD/YYYY HH:mm:ss','MM/DD/YYYY','YYYY/MM/DD']` (parent-then-child concat+dedupe) | PASS |
| BIP-06 warning reduction | Epic fixture: warnings without profile vs with `profiles.epic` | 2 → 0 (UNKNOWN_SEGMENT suppressed for declared Z-segments) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROF-01 | 06-01 | `defineProfile({name, ...})` returns valid `Profile`; name required | SATISFIED | Runtime smoke + REQUIREMENTS.md line 81 marked closed. |
| PROF-02 | 06-01 | `defineProfile()` throws `ProfileDefinitionError` for invalid input (bad segment names, duplicate field names, unknown keys, malformed date formats) | SATISFIED | Runtime smoke: PID overlay throws. `validateProfileName`/`validateOptionKeys`/`validateCustomSegments`/`validateDateFormats`/`validateUniqueFieldNames` all wired. |
| PROF-03 | 06-02 | `extends: parentProfile` and `extends: [p1,p2]` — scalars overwrite, arrays concat+dedupe, customSegments deep-merge, onWarning chain | SATISFIED | Runtime smoke: extends chain produces correct lineage + dedupe. 5 merge helpers + validators. |
| PROF-04 | 06-01 | Readonly fields reflect applied options | SATISFIED | `Object.freeze` at `define.ts:177`; Profile interface readonly. |
| PROF-05 | 06-01 | `profile.describe()` returns non-empty summary containing profile name | SATISFIED | `buildDescribe` always starts with `Profile '<name>'`. |
| PROF-06 | 06-03 | `parseHL7(raw, profile)` applies profile behavior; `msg.profile?.name` + `msg.profile?.lineage` set | SATISFIED | Runtime smoke: `msg.profile.name === 'epic'`, `lineage === ['epic']`. |
| PROF-07 | 06-03 | Registered Z-segments accessible by field name via `seg.get()` | SATISFIED | Runtime smoke: `zdp.get('departmentCode').value === 'CARDIOLOGY'`; unknown name → `undefined`. |
| PROF-08 | 06-04 | `setDefaultProfile` / `getDefaultProfile` / `{ profile: null }` opt-out | SATISFIED | Runtime smoke: all 4 branches of D-19 work correctly. |
| PROF-09 | 06-03 | Round-trip with profile produces spec-clean HL7 (profile parse-only) | SATISFIED | Runtime smoke: `parseHL7(raw, profiles.epic).toString() === parseHL7(raw).toString()` byte-equal. |
| BIP-01 | 06-05 | `profiles.epic` via public `defineProfile()` API | SATISFIED | `src/profiles/epic.ts` imports `defineProfile` from `./define.js`. |
| BIP-02 | 06-05 | `profiles.cerner` via public API | SATISFIED | `src/profiles/cerner.ts`. |
| BIP-03 | 06-05 | `profiles.meditech` via public API | SATISFIED | `src/profiles/meditech.ts`. |
| BIP-04 | 06-05 | `profiles.athena` via public API | SATISFIED | `src/profiles/athena.ts`. |
| BIP-05 | 06-05 | `profiles.genericLab` via public API | SATISFIED | `src/profiles/genericLab.ts`. |
| BIP-06 | 06-06 | Each built-in reduces warnings on a realistic vendor-shape fixture | SATISFIED | 5 fixtures at `test/fixtures/vendor-shapes/<vendor>/*.hl7`; epic fixture reduces `UNKNOWN_SEGMENT` from 2 → 0; 29 tests in `profiles-builtins.test.ts`. |

**Orphan check:** REQUIREMENTS.md status table (lines 220-234) maps all 15 Phase-6 REQ-IDs to closed plans. No orphaned requirements.

### Anti-Patterns Found

None. Quick scan across `src/profiles/*.ts`:
- No TODO/FIXME/XXX/HACK/PLACEHOLDER markers in profile-system sources
- No `return null` or `return {}` stub patterns
- No empty handler stubs; `composeOnWarning` explicitly documents try/catch swallow per D-12
- No hardcoded empty-array renders; customSegments flow through real parser wiring
- No `console.*` in library code
- No `any` or unjustified `as` casts observed (single documented `Mutable<T>` pattern for exactOptionalPropertyTypes assignment in `define.ts`, matching `src/helpers/meta.ts::buildMeta`)

### Honored User Decisions

- **D-21** (options.dateFormats precede profile.dateFormats): Wired in Plan 03 per `src/parser/index.ts` Step 12; test in `profiles-custom-segments.test.ts`.
- **D-22** (profile.onWarning BEFORE options.onWarning with per-handler try/catch): Wired in Plan 03 inside `makeEmitter`; covered by dedicated `profiles-onwarning-chain.test.ts` (9 tests).
- **D-26** (public export shape): Verified via `require('./dist/index.cjs')` — individual built-ins (`epic`, `cerner`, `meditech`, `athena`, `genericLab`) are NOT top-level named exports; only accessible via `profiles.epic` etc.

### Human Verification Required

None. Every success criterion is observable via automated test or runtime smoke check.

### Gaps Summary

None. All 5 ROADMAP success criteria verified; all 15 REQ-IDs (PROF-01..09 + BIP-01..06) satisfied with implementation evidence; full test suite (753 tests) passes; typecheck + lint + build all clean; round-trip byte-equal confirmed; D-21/D-22/D-26 user decisions honored.

---

*Verified: 2026-04-19T20:15:00Z*
*Verifier: Claude (gsd-verifier)*
