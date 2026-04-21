# @cosyte/hl7-parser — Roadmap (v1)

North star: **A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.**

- **Granularity:** standard (8 phases, 3–5 plans each anticipated)
- **Mode:** yolo (auto-advance enabled)
- **Parallelization:** enabled — plans within a phase may run in parallel where they touch disjoint modules
- **Coverage:** 97/97 v1 REQ-IDs mapped to exactly one phase

---

## Phases

- [x] **Phase 1: Project Foundation** — Scaffold the repo, build, lint, and TypeScript toolchain so any subsequent phase can iterate. *(completed 2026-04-18)*
- [x] **Phase 2: Core Parser & Tolerance** — Tokenize HL7 input into segments/fields/components/subcomponents with a lenient default, warnings system, and strict-mode escalation. *(completed 2026-04-18, verified 2026-04-18)*
- [x] **Phase 3: Structural Model & Types** — Expose the parsed message as an immutable, dot-path-accessible model with typed composite types (XPN, XAD, TS/DTM, etc.). *(completed 2026-04-18, verified 2026-04-18)*
- [x] **Phase 4: Named Helpers** — Ship the one-line DX: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, and friends. (completed 2026-04-19, verified 2026-04-19)
- [x] **Phase 5: Serialization & Round-Trip** — `toString()`, `toJSON()`, `prettyPrint()`, and `buildMessage()` produce spec-clean HL7 and preserve semantics across parse → mutate → serialize → parse. (completed 2026-04-19, verified 2026-04-19)
- [x] **Phase 6: Profile System & Built-ins** — `defineProfile()` API with merge/extend semantics plus 5 built-in vendor profiles (epic, cerner, meditech, athena, genericLab). *(completed 2026-04-19)*
- [x] **Phase 7: Testing Hardening & Fixtures** — Canonical, edge-case, vendor-quirk, strict-mode, and profile-authoring test suites that verify ≥ 90% coverage on core modules. *(completed 2026-04-19)*
- [x] **Phase 8: Examples, Starter Kit & Documentation** — Three runnable examples, publishable profile starter kit, and the complete README + ancillary docs. *(completed 2026-04-20)*
- [x] **Phase 9: Rename Package to @cosyte/hl7** — Rename the package from `@cosyte/hl7-parser` to `@cosyte/hl7` (full HL7 toolkit — parser, builder, mutator, serializer, helpers — not just a parser). *(completed 2026-04-20)*
- [ ] **Phase 10: Planning-Doc Resync** — Close v2.1 audit tech debt: flip 35 stale REQUIREMENTS.md checkboxes, refresh ROADMAP Progress table + Phase 1/2/7/8/9 checkboxes, refresh STATE.md current-position, flip PROJECT.md capabilities checklist, retire Phase 2 VERIFICATION.md TOL-08 deferred block.
- [ ] **Phase 11: Retroactive Verification** — Produce the three missing VERIFICATION.md artifacts (Phases 01, 08, 09) by running `/gsd-verify-work` against each, ratifying the evidence already on disk.
- [ ] **Phase 12: Retroactive Nyquist Validation** — Produce the six missing VALIDATION.md artifacts (Phases 01, 02, 03, 07, 08, 09) by running `/gsd-validate-phase` against each.

---

## Phase Details

### Phase 1: Project Foundation
**Goal**: A developer cloning the repo can install, build, typecheck, lint, and test with a single command sequence; downstream phases never have to revisit tooling.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06
**Success Criteria** (what must be TRUE):
  1. A developer can run `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from a clean clone and every command exits 0 with zero warnings.
  2. A developer importing the package from an ESM project and another from a CJS project both resolve the correct entry through the `exports` map and receive typed intellisense.
  3. A developer inspecting `package.json` sees zero runtime `dependencies`, `"type": "module"`, dual-build artifacts declared, and Node 18+ engines field.
  4. A developer editing any `.ts` file gets strict-mode errors for `any`, unchecked index access, and missing types from their editor immediately.
**Plans**: 4 plans
Plans:
- [x] 01-PLAN-01-package-scaffold.md — Scaffold package.json, tsconfig, LICENSE, .gitignore, src/index.ts stub
- [x] 01-PLAN-02-build-system.md — Create tsup.config.ts for dual ESM+CJS build with .d.ts
- [x] 01-PLAN-03-lint-and-test.md — ESLint flat config, Prettier, Vitest config, sanity test
- [x] 01-PLAN-04-smoke-verification.md — Run full pnpm pipeline end-to-end, commit lockfile, add CI workflow
**UI hint**: no

### Phase 2: Core Parser & Tolerance
**Goal**: A developer calling `parseHL7(raw)` on any well-formed v2.1–v2.8 message — including vendor-quirky input — receives a structurally correct parse result with stable, positional warnings surfaced for every known deviation.
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06, PARSE-07, PARSE-08, PARSE-09, TOL-01, TOL-02, TOL-03, TOL-04, TOL-05, TOL-06, TOL-07, TOL-08, TOL-09, TOL-10
**Success Criteria** (what must be TRUE):
  1. A developer can parse a message using any combination of the HL7 v2.1–v2.8 delimiters declared in MSH-1/MSH-2 and receive correctly decomposed segments, fields, repetitions, components, and subcomponents.
  2. A developer parsing a message with MLLP framing, mixed line endings, a UTF-8 BOM, trailing whitespace, or unknown escapes gets a parsed message in lenient mode plus `msg.warnings` entries with stable codes and positional context — and receives `onWarning` callbacks as they are emitted.
  3. A developer parsing a structurally broken message (missing MSH, truncated MSH, invalid encoding chars, empty input) receives a thrown `Hl7ParseError` with a stable code, position, and snippet — even in lenient mode.
  4. A developer opting into `{ strict: true }` gets every Tier 2 deviation escalated to a thrown `Hl7ParseError` rather than a warning.
  5. A developer supplying `dateFormats: [...]` sees non-HL7 timestamp formats accepted in order with a `TIMESTAMP_FALLBACK_FORMAT` warning, falling back to built-in ISO/date/US formats when no user format matches.
**Plans**: 6 plans
Plans:
- [x] 02-PLAN-01-warnings-errors-and-message-shell.md — Warnings registry, errors classes (4 fatal codes), shared types, Hl7Message shell
- [x] 02-PLAN-02-input-normalization-mllp-and-charset.md — normalize (line endings only) + normalizeBuffer (Buffer → string via MSH-18 charset) + stripMllp
- [x] 02-PLAN-03-segments-delimiters-and-tokenize.md — splitSegments + readDelimiters (3 fatals) + tokenize (fields/reps/comps/subs) + whitespace trim warning
- [x] 02-PLAN-04-escape-sequences.md — unescape (all 8 HL7 escape forms + unknown warning) + reescape
- [x] 02-PLAN-05-dateformats-plumbing.md — parseHl7Timestamp cascade (HL7 → user → built-ins) + TIMESTAMP_FALLBACK_FORMAT
- [x] 02-PLAN-06-public-parsehl7-and-strict-mode.md — parseHL7 public entry + emitWarning chokepoint + strict-mode escalation + src/index.ts barrel update
**UI hint**: no

### Phase 3: Structural Model & Types
**Goal**: A developer accessing a parsed message can navigate it by dot-path, by segment iteration, or by walking the nested structure — and receives strongly typed composite values (XPN, XAD, TS/DTM, etc.) with safe-access semantics.
**Depends on**: Phase 2
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, TYPES-01, TYPES-02, TYPES-03, TYPES-04
**Success Criteria** (what must be TRUE):
  1. A developer can call `msg.get('PID.5.1')`, `msg.get('OBX[2].5')`, `msg.getAll('NK1')`, and `msg.segments('OBX')[0].field(3)` and receive correctly resolved values with full typing.
  2. A developer accessing a non-existent path or segment type receives `undefined` or `[]` rather than an exception.
  3. A developer mutating a message via `setField`, `addSegment`, or `removeSegment` sees changes reflected on subsequent reads; direct field mutation on an unwrapped object has no effect (immutability by default).
  4. A developer importing the library receives typed interfaces for XPN, XAD, CX, CWE/CE, XTN, PL, TS/DTM, NM, and HD, and can parse a TS/DTM string into a JS `Date` (with `undefined` for unparseable input and raw string always accessible).
**Plans**: 4 plans
Plans:
- [x] 03-PLAN-01-read-path-foundation.md — Dot-path tokenizer/resolver, Segment + Field wrappers, Hl7Message.get/getAll/segments/allSegments with wrapper caches
- [x] 03-PLAN-02-composites-person-address-identifier.md — Composite parsers XPN, XAD, CX, CWE, CE, HD + shared helpers
- [x] 03-PLAN-03-composites-telecom-location-timestamp-numeric.md — Composite parsers XTN, PL, TS/DTM (delegates to parseHl7Timestamp), NM
- [x] 03-PLAN-04-mutation-and-barrel.md — Field.asXxx coercions, setField/addSegment/removeSegment, HL7 namespace barrel + src/index.ts final exports
**UI hint**: no

### Phase 4: Named Helpers
**Goal**: A developer can fulfill the north star — one-line extraction of common HL7 fields — through `msg.meta`, `msg.patient`, `msg.visit`, and the collection helpers, without knowing segment/field numbers.
**Depends on**: Phase 3
**Requirements**: HELPERS-01, HELPERS-02, HELPERS-03, HELPERS-04, HELPERS-05, HELPERS-06, HELPERS-07
**Success Criteria** (what must be TRUE):
  1. A developer can read `msg.meta.type`, `msg.meta.controlId`, `msg.meta.timestamp` (as a `Date`), and all other MSH-derived metadata without touching the MSH segment directly.
  2. A developer can read `msg.patient.mrn`, `msg.patient.fullName`, `msg.patient.dateOfBirth`, and the full patient contract on any message with a PID; absent fields return `undefined` and never throw.
  3. A developer can read `msg.visit?.patientClass`, `msg.visit?.admitDateTime`, and visit fields on messages with a PV1 segment, and `msg.visit` itself is `undefined` (or nullable) on messages without one.
  4. A developer can iterate `msg.observations()`, `msg.orders()` (with observations linked to their parent order), `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, and `msg.insurance()` and receive typed arrays (empty when the source segments are absent).
**Plans**: 4 plans
Plans:
- [ ] 04-PLAN-01-scaffold-xcn-and-cache.md — Helper type declarations, XCN composite (D-24a), pickMrn, 9 stub builders, Hl7Message getters/methods wiring, cache slot extension
- [ ] 04-PLAN-02-meta-and-patient.md — buildMeta (HELPERS-01) + buildPatient (HELPERS-02) with pickMrn hook + cache-invalidation test suite foundation
- [ ] 04-PLAN-03-visit-and-observations.md — buildVisit (HELPERS-03) with XCN doctors + observations walker (HELPERS-04) with D-13 valueType dispatch + append visit cases to cache-invalidation test
- [ ] 04-PLAN-04-orders-and-collections.md — orders() with D-12 positional OBX grouping (HELPERS-05) + nextOfKin/allergies/diagnoses/insurance collections with IN1/IN2/IN3 grouping (HELPERS-06) + universal HELPERS-07 never-throws sweep
**UI hint**: no

### Phase 5: Serialization & Round-Trip
**Goal**: A developer can take a parsed, mutated, or constructed message and emit spec-clean HL7 — or a JSON/pretty-printed view — such that parse → modify → serialize → parse yields an equivalent message.
**Depends on**: Phase 3
**Requirements**: SER-01, SER-02, SER-03, SER-04, SER-05, SER-06
**Success Criteria** (what must be TRUE):
  1. A developer calling `msg.toString()` on any parsed message (including vendor-quirky input) receives spec-clean HL7 with correct delimiters, re-escaped sequences, and no leaked MLLP/whitespace quirks.
  2. A developer running `parseHL7(msg.toString())` on any fixture receives a message object equivalent to the original (same segments, fields, components, repetitions).
  3. A developer calling `msg.toJSON()` receives a structured JSON representation suitable for snapshotting or cross-process transport, and `msg.prettyPrint()` returns a human-readable multi-line string.
  4. A developer using `buildMessage({...}).addSegment('PID', [...]).toString()` constructs a valid outbound HL7 message from scratch.
**Plans**: 5 plans
Plans:
- [x] 05-PLAN-01-scaffold-emit-field-and-method-wiring.md — Emit-field primitive (FULLY IMPLEMENTED), 6 stub files with LIVE SerializedMessage + BuildMessageInit types, 3 Hl7Message instance methods wired
- [x] 05-PLAN-02-to-string-and-round-trip.md — Fill emitMessage body (MSH special-case + CR terminator); 5 round-trip fixtures + SER-02 structural-equivalence sweep; Rule-3 deviation: Phase 2 tokenize now unescapes on parse (closes SER-01, SER-02, SER-05)
- [x] 05-PLAN-03-to-json.md — Fill emitJson body (raw-tree mirror + stable warnings + conditional profile + W5 boundary freeze; B3 dead-code `?? []` removed) (closes SER-03)
- [x] 05-PLAN-04-pretty-print.md — Fill emitPrettyPrint body (D-25 header + D-23 segment-per-line with labeled fields + MSH offset + W2 raw-escape docs) (closes SER-04)
- [x] 05-PLAN-05-build-message.md — Fill buildMessage + formatHl7Timestamp + generateControlId bodies with addSegment chaining + round-trip tests (closes SER-06)
**UI hint**: no

### Phase 6: Profile System & Built-ins
**Goal**: A developer can define, extend, and compose vendor/integration profiles via a first-class public API, apply them to parses, and rely on 5 ready-made profiles (epic, cerner, meditech, athena, genericLab) that reduce warnings against realistic vendor shapes.
**Depends on**: Phase 2, Phase 3, Phase 5
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, BIP-01, BIP-02, BIP-03, BIP-04, BIP-05, BIP-06
**Success Criteria** (what must be TRUE):
  1. A developer calling `defineProfile({ name, ... })` with valid input receives a readonly `Profile` object exposing `name`, `description`, `customSegments`, `dateFormats`, `lineage`, and `describe()`; invalid input throws `ProfileDefinitionError` with an actionable message.
  2. A developer using `extends: parentProfile` or `extends: [p1, p2]` receives a profile whose merged options follow the documented semantics (scalars overwrite, arrays concat+dedupe, `customSegments` deep-merge, `onWarning` handlers chain).
  3. A developer calling `parseHL7(raw, profile)` sees `msg.profile?.name` and `msg.profile?.lineage` populated, custom Z-segments accessible by declared field name, and re-serialization producing spec-clean HL7.
  4. A developer calling `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` can manage a process-scoped default; explicit arguments override and `parseHL7(raw, { profile: null })` opts out for a single call.
  5. A developer importing `profiles.epic`, `profiles.cerner`, `profiles.meditech`, `profiles.athena`, or `profiles.genericLab` and parsing a realistic vendor-shape fixture with the profile receives fewer warnings than parsing the same fixture in lenient mode without a profile; each built-in is defined through the public `defineProfile()` API.
**Plans**: 6 plans
Plans:
- [x] 06-01-PLAN.md — defineProfile() core + 4 validation throws + describe() + types (PROF-01/02/04/05/07-types)
- [x] 06-02-PLAN.md — extends + merge semantics (lineage, dateFormats, customSegments, onWarning chain; PROF-03)
- [x] 06-03-PLAN.md — Segment.get(name) + UNKNOWN_SEGMENT emit/suppression + D-21 merged dateFormats plumbing + D-22 onWarning chain hoist (PROF-02/06/07/09)
- [x] 06-04-PLAN.md — setDefaultProfile/getDefaultProfile + parseHL7 dispatch (PROF-08)
- [x] 06-05-PLAN.md — 5 built-in vendor profiles (epic, cerner, meditech, athena, genericLab) + handcrafted fixtures (BIP-01..05)
- [x] 06-06-PLAN.md — profiles barrel + src/index.ts public exports + BIP-06 fixture-parity tests
**UI hint**: no

### Phase 7: Testing Hardening & Fixtures
**Goal**: A developer running the test suite sees ≥ 90% coverage on parser/model/helpers plus concrete evidence — canonical fixtures, edge cases, vendor-quirk fixtures, strict-mode escalation, and profile authoring — that the library behaves as specified end to end.
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08
**Success Criteria** (what must be TRUE):
  1. A developer running `pnpm test --coverage` sees ≥ 90% line coverage on `src/parser/`, `src/model/`, and `src/helpers/`, and a green test suite.
  2. A developer reviewing `test/fixtures/` finds canonical fixtures that round-trip losslessly for ADT^A01/A04/A08, ORU^R01, ORM^O01, SIU^S12, MDM^T02, plus Z-segment, repeating-field, and nested-subcomponent cases.
  3. A developer reviewing `test/fixtures/vendor-quirks/` finds at least one fixture per Tier 2 scenario; each one parses in lenient mode with the expected warning code and throws `Hl7ParseError` under `{ strict: true }`.
  4. A developer reviewing the profile test suite finds at least one fixture per built-in profile demonstrating fewer warnings with the profile than without, plus full coverage of `defineProfile` validation, `extends`, merge semantics, default-profile management, `describe()`, attribution, and round-trip.
  5. A developer parsing a malformed message (missing/truncated MSH, invalid encoding chars, empty input) sees `Hl7ParseError` with a descriptive position and snippet — verified by tests.
**Plans**: 7 plans
Plans:
- [x] 07-01-PLAN.md — Fixture tree migration (round-trip → canonical/edge-cases) + extract test/_helpers/ + capture pre-Phase-7 coverage baseline (foundation) *(completed 2026-04-19 — commit b7a527a; 747/747 tests green post-migration; baseline: all 5 gated dirs PASS, lowest branch 90.26%)*
- [x] 07-02-PLAN.md — Author 7 canonical fixtures (adt-a04/a08, orm-o01, siu-s12, mdm-t02, z-segments, nested-subcomponents) + canonical-messages.test.ts (TEST-02) *(completed 2026-04-20 — commits 956aae2 + 17954b1; 774/774 tests green; TEST-02 closed)*
- [x] 07-03-PLAN.md — Author 11 edge-case fixtures + parser-edge-cases.test.ts (TEST-03) *(completed 2026-04-20 — commits ad4964a + a934437; 789/789 tests green; TEST-03 closed)*
- [x] 07-04-PLAN.md — Author 13 vendor-quirks fixtures (one per WARNING_CODES entry) + parser-strict-mode-sweep.test.ts (TEST-05 + TEST-06) *(completed 2026-04-20 — commits f718c10 + 7f714e6; 815/815 tests green + 14 todo; TEST-05 + TEST-06 closed; 6 codes emit today, 7 have factories but no parser call site tracked via it.todo)*
- [x] 07-05-PLAN.md — Author 4 malformed fixtures (one per FATAL_CODES entry) + parser-malformed-sweep.test.ts (TEST-04) *(completed 2026-04-19 — commits 7110694 + 0490069; 824/824 tests green + 14 todo; TEST-04 closed; each fixture asserts throw+code+position+snippet in lenient & strict modes)*
- [x] 07-06-PLAN.md — Tighten vitest.config.ts coverage gate (branches 85→90) + add CI coverage step (TEST-01) — capstone *(completed 2026-04-19 — commits d263222 + c66af76; Scenario A: per-dir branches 85→90 on parser/model/helpers/serialize/builder, global kept at 85 to avoid implicitly gating ungated profiles/**; CI `Test (with coverage)` step added between Test and Build across Node 18/20/22 matrix; pnpm test:coverage exit 0; actionlint clean; TEST-01 closed — all 8 Phase 7 REQ-IDs now closed)*
- [x] 07-07-PLAN.md — TEST-08 audit + targeted gap patches in profiles-*.test.ts + TEST-07 confirmation (TEST-07 + TEST-08) *(completed 2026-04-19 — commit 6f17863; audit mapped all 8 TEST-08 cases to existing Phase 6 tests with 0 gaps; TEST-07 confirmed closed by Phase 6 BIP-06; 824/824 tests green + 14 todo — zero test-file deltas)*
**UI hint**: no

### Phase 8: Examples, Starter Kit & Documentation
**Goal**: A developer landing on the README can go from zero to parsing a real message in under a minute, find a recipe for every common task, and copy the profile starter kit into a new directory to publish their own profile package in minutes.
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Requirements**: EX-01, EX-02, EX-03, KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07, DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14, DOC-15
**Success Criteria** (what must be TRUE):
  1. A developer running `tsx examples/extract-patient-info.ts`, `examples/read-lab-results.ts`, and `examples/modify-and-resend.ts` sees each example execute end-to-end and print the documented output, demonstrating helpers, observations/orders iteration, and mutation + round-trip respectively.
  2. A developer copying `examples/profile-starter-kit/` into a new directory can run `pnpm install && pnpm test && pnpm build` against the sample fixture with success; `dist/` entries match the `package.json` exports; CI and publish workflows validate with `actionlint`; `CUSTOMIZING.md` walks through rename → swap base → define Z-segments → fixtures → publish; placeholders (`{{YOUR_ORG}}`, `{{PROFILE_NAME}}`) appear consistently.
  3. A developer opening the README on GitHub or npm sees the one-sentence value prop as the first line, badges, a 30-second copy-pasteable quickstart, a 6–8-bullet feature list, an "HL7 in 90 seconds" section, the three access patterns, the full cookbook (all recipes listed in the spec), a top-level Profiles section, a 4-tier tolerance section with table and runnable example, an Error Handling section, a Contributing section, and the "Built by Cosyte" footer with license link.
  4. A developer looking for release history, license, or roadmap finds `CHANGELOG.md` in Keep-a-Changelog format with an `[Unreleased]` section, `LICENSE` (MIT) at the repo root, and a roadmap/stretch-goals section documenting the v2 deferrals (typed overlays, schema validation, streaming, JSON Schema/Zod, batch files, type-safe custom-segment fields).
  5. A developer reading the "Publishing Your Profile" recipe is linked directly to `examples/profile-starter-kit/` and referenced to `CUSTOMIZING.md`.
**Plans**: 5 plans
Plans:
- [ ] 08-01-PLAN.md — examples/ tree (3 runnable scripts + 3 fixtures + README + smoke runner) — EX-01/02/03
- [x] 08-02-PLAN.md — examples/profile-starter-kit/ subtree (configs + sample profile + test + fixture + ci.yml + publish.yml + README + CUSTOMIZING.md + LICENSE) — KIT-01/02/03/04/05/06/07 ✅ 2026-04-20 (15 files, commits 43fccae+3c303c0, in-kit pipeline green + actionlint clean)
- [ ] 08-03-PLAN.md — Comprehensive README.md replacement (13 sections) — DOC-01/02/03/04/05/06/07/08/09/10/11/12/13
- [ ] 08-04-PLAN.md — CHANGELOG.md (Keep-a-Changelog) + CONTRIBUTING.md + LICENSE verify — DOC-14/15
- [x] 08-05-PLAN.md — Wave-2 capstone: package.json version bump + tsx devDep + scripts.examples + ci.yml wiring + publish.yml + peer-dep resolution + end-to-end smoke ✅ 2026-04-20 (3 commits f08b1dc+f9f2f6b+cfbac6f; pipeline green; tarball dry-run 10 files 346.2kB)
**UI hint**: no

### Phase 9: Rename Package to @cosyte/hl7
**Goal**: Rename the published package from `@cosyte/hl7-parser` to `@cosyte/hl7` so the name reflects the actual surface area — a full HL7 v2 toolkit (parser, builder, mutator, serializer, and helpers), not just a parser. Every reference in source, configs, docs, examples, starter kit, and CI/publish workflows points at the new name; the first published tag under the new name installs and round-trips cleanly.
**Depends on**: Phase 8
**Requirements**: (none — rename-only phase; no new functional REQ-IDs)

### Phase 10: Planning-Doc Resync
**Goal**: Bring the v2.1 paper trail into sync with the code ground-truth so an outside reader of `.planning/` sees an accurate picture of what shipped. No functional requirements; closes audit tech-debt items 3–6 and 8.
**Depends on**: Phase 9
**Requirements**: (none — doc-trail only; no new functional REQ-IDs)
**Gap Closure**: Closes v2.1-MILESTONE-AUDIT tech_debt:
  - REQUIREMENTS.md traceability stale (17 PARSE/TOL + 18 EX/DOC checkboxes)
  - ROADMAP.md Phase 1/2/7/8/9 checkboxes + Progress table stale
  - STATE.md current-position stale (reflects Phase 7 pending)
  - PROJECT.md top-level capabilities checklist stale (all 11 `[ ]`)
  - Phase 2 VERIFICATION.md TOL-08 deferred block never retired
**Success Criteria** (what must be TRUE):
  1. A developer reading REQUIREMENTS.md sees every REQ-ID with `[x]` (or clear deferred marker) matching the v2.1 ground-truth — coverage count accurate, traceability table Status column reflects Closed for all 97 IDs.
  2. A developer reading ROADMAP.md sees Phases 1/2/7/8/9 checked and the Progress table showing 9/9 complete with completion dates.
  3. A developer opening STATE.md sees current position reflecting v2.1 post-rename state, not mid-Phase-7.
  4. A developer opening PROJECT.md sees the capabilities checklist matching what actually ships (all v1 capabilities `[x]`).
  5. A developer reading Phase 2's VERIFICATION.md sees the TOL-08 deferred block retired with a pointer to its Phase 3/4 closure.
**Plans**: ~4 plans anticipated (REQUIREMENTS resync / ROADMAP + STATE / PROJECT / Phase-2 VERIFICATION patch)
**UI hint**: no

### Phase 11: Retroactive Verification
**Goal**: Produce the three missing VERIFICATION.md artifacts (Phases 01, 08, 09) by running the standard verifier against each phase. Evidence already exists on disk (SUMMARYs + green pipeline + tarball dry-run); this phase ratifies it in the expected verifier-report shape.
**Depends on**: Phase 10
**Requirements**: (none — process/paper-trail only)
**Gap Closure**: Closes v2.1-MILESTONE-AUDIT tech_debt item 1 (missing VERIFICATION.md for Phases 01, 08, 09).
**Success Criteria** (what must be TRUE):
  1. A developer opens `.planning/phases/01-project-foundation/VERIFICATION.md` and sees a PASS verdict against Phase 1's 4 success criteria.
  2. A developer opens `.planning/phases/08-examples-starter-kit-and-documentation/VERIFICATION.md` and sees a PASS verdict against Phase 8's 5 success criteria.
  3. A developer opens `.planning/phases/09-rename-package-to-cosyte-hl7/VERIFICATION.md` and sees a PASS verdict against Phase 9's 5 success criteria — grep sweep, pipeline, round-trip, docs consistency, publish.yml all attested.
**Plans**: 3 plans (one per phase — run `/gsd-verify-work N`)
**UI hint**: no

### Phase 12: Retroactive Nyquist Validation
**Goal**: Produce the six missing VALIDATION.md artifacts (Phases 01, 02, 03, 07, 08, 09) by running Nyquist validation against each phase. The `pnpm test:coverage` gate in CI (≥90% branches on parser/model/helpers/serialize/builder) is a stronger runtime invariant, but this phase supplies the per-phase formal audit the GSD workflow expects.
**Depends on**: Phase 11
**Requirements**: (none — process/paper-trail only)
**Gap Closure**: Closes v2.1-MILESTONE-AUDIT tech_debt item 2 (missing VALIDATION.md for Phases 01, 02, 03, 07, 08, 09).
**Success Criteria** (what must be TRUE):
  1. A developer opens `.planning/phases/NN/VALIDATION.md` for each of Phases 01, 02, 03, 07, 08, 09 and sees a Nyquist compliance report with per-REQ-ID test-coverage classification.
  2. A developer reading the Phase 7 and Phase 8 VALIDATION.md files sees thin-by-design noted where applicable (meta-phase and docs-phase coverage surface is small).
  3. A developer re-running the milestone audit sees Nyquist coverage flip from `partial (3/9)` to `compliant (9/9)`.
**Plans**: 6 plans (one per phase — run `/gsd-validate-phase N`)
**UI hint**: no
**Success Criteria** (what must be TRUE):
  1. A developer searching the repo for `@cosyte/hl7-parser` finds zero occurrences outside of CHANGELOG rename-history entries.
  2. A developer running `pnpm install && pnpm build && pnpm test && pnpm examples` against the renamed repo sees every command exit 0 with zero warnings.
  3. A developer installing the newly published `@cosyte/hl7` package in a fresh project can `import { parseHL7, buildMessage } from "@cosyte/hl7"` and run a canonical example end-to-end.
  4. A developer reading the README, CHANGELOG, examples, and profile starter kit sees the `@cosyte/hl7` name used consistently; CHANGELOG calls out the rename with a migration note.
  5. A developer checking `.github/workflows/publish.yml` sees it publish under the new name; any legacy `@cosyte/hl7-parser` publish path is either retired or redirected per the rename plan.
**Plans**: 4 plans
Plans:
- [ ] 09-PLAN-01-identity-files.md — Wave 1: rename package.json (name, description, keywords, URLs), rewrite CHANGELOG.md with D-07 breadcrumb, sweep README/CONTRIBUTING/CLAUDE/tsup.config.ts/vitest.config.ts
- [ ] 09-PLAN-02-source-and-tests.md — Wave 2: sweep all 51 src/**/*.ts JSDoc/docblocks + test/model-public-exports.test.ts; verify typecheck
- [ ] 09-PLAN-03-examples-and-starter-kit.md — Wave 3: sweep examples/ top-level (3 runnables + README) + examples/profile-starter-kit/ (6 files + lockfile)
- [ ] 09-PLAN-04-verification-and-publish-dry-run.md — Wave 4: authoritative grep sweep + full pipeline (install/typecheck/lint/test/build/examples) + pnpm publish --dry-run under new name
**UI hint**: no

---

## Parallelization Notes

Within each phase, plans that touch disjoint modules may run in parallel; plans that share a module must serialize. Concrete expectations:

- **Phase 1:** Toolchain plans (tsup config, Vitest config, ESLint+Prettier, tsconfig + strict flags, package.json exports + scripts, README skeleton) are largely independent and can run in parallel; a final smoke-test plan runs last to verify the full `install/build/typecheck/lint/test` pipeline.
- **Phase 2:** Tokenizer, encoding/escapes, segment splitter, and input normalization (BOM, line endings, MLLP, Buffer/charset) can start in parallel against a shared fixture set. The warnings/error code registry and `onWarning` plumbing should be built early and consumed by each parser plan; strict-mode escalation is a capstone plan.
- **Phase 3:** Composite type parsers (XPN, XAD, CX, CWE/CE, XTN, PL, TS/DTM, NM, HD) are independent and parallelizable. Segment/Field/Component/Subcomponent traversal and the dot-path resolver are serial dependencies. Mutation (`setField`/`addSegment`/`removeSegment`) is a final plan gated on the read path.
- **Phase 4:** `msg.meta` and `msg.patient` can run in parallel (both read-only; distinct segments). `msg.visit` is independent. `msg.observations()` must precede `msg.orders()` (orders link to observations). `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` are mutually independent and parallelizable.
- **Phase 5:** `toString()` and `toJSON()` can run in parallel (disjoint emitters). `prettyPrint()` and `buildMessage()` are independent. Round-trip fixture sweep is a final plan.
- **Phase 6:** `defineProfile()` core + validation errors is the first plan; `extends`/merge semantics and default-profile management can then parallelize. The five built-in profiles (epic, cerner, meditech, athena, genericLab) are mutually independent and all parallelizable once the API surface stabilizes.
- **Phase 7:** Fixture authoring (canonical, edge-case, vendor-quirk, built-in-profile, profile-authoring) parallelizes across contributors. Coverage enforcement and strict-mode escalation sweep are final gates.
- **Phase 8:** The three examples are independent. Starter kit assembly is one plan; README authoring decomposes into quickstart + feature list, access patterns, cookbook, profiles section, tolerance section, error handling, contributing/footer — most of which parallelize. CHANGELOG and LICENSE are trivially parallel.
- **Phase 9:** Rename sweeps across source/configs, docs/examples, and starter kit can largely parallelize (disjoint files); a final publish-verify plan runs last to confirm the new name resolves end-to-end.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation | 4/4 | Complete (evidence-only) | 2026-04-18 |
| 2. Core Parser & Tolerance | 7/7 | Complete (verified) | 2026-04-18 |
| 3. Structural Model & Types | 4/4 | Complete (verified) | 2026-04-18 |
| 4. Named Helpers | 4/4 | Complete (verified) | 2026-04-19 |
| 5. Serialization & Round-Trip | 5/5 | Complete (verified) | 2026-04-19 |
| 6. Profile System & Built-ins | 6/6 | Complete (verified) | 2026-04-19 |
| 7. Testing Hardening & Fixtures | 7/7 | Complete (evidence-only) | 2026-04-19 |
| 8. Examples, Starter Kit & Documentation | 5/5 | Complete (evidence-only) | 2026-04-20 |
| 9. Rename Package to @cosyte/hl7 | 4/4 | Complete (evidence-only) | 2026-04-20 |
| 10. Planning-Doc Resync | 0/4 | In Progress (gap closure) | — |
| 11. Retroactive Verification | 0/3 | Planned (gap closure) | — |
| 12. Retroactive Nyquist Validation | 0/6 | Planned (gap closure) | — |

**v1 milestone:** 9/9 phases complete. **v2.1 gap-closure:** Phases 10-12 in progress (this phase = 10). The 9-complete figure scopes to the v1 milestone span; Phases 10-12 are v2.1-audit-follow-on tech-debt gap-closure phases (ROADMAP lists every phase for project-wide traceability; STATE.md's `total_phases: 9` frontmatter value reflects the same v1-scope rollup).

---

*Last updated: 2026-04-20 (Phase 10 gap-closure Plan 10-02 — ROADMAP resynced to v2.1 ground-truth: Phases 1/2/7/8/9 checkboxes flipped to `[x]` with completion dates; Phase 3 marker normalized to italicized `*(completed 2026-04-18, verified 2026-04-18)*`; Progress table rewritten with all 12 rows preserved + rollup-split caption separating v1-milestone 9/9 from v2.1 gap-closure Phases 10-12, matching STATE.md's `total_phases: 9` scope choice in Plan 10-03.)*
