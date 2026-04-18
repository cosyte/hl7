# @cosyte/hl7-parser — Roadmap (v1)

North star: **A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.**

- **Granularity:** standard (8 phases, 3–5 plans each anticipated)
- **Mode:** yolo (auto-advance enabled)
- **Parallelization:** enabled — plans within a phase may run in parallel where they touch disjoint modules
- **Coverage:** 97/97 v1 REQ-IDs mapped to exactly one phase

---

## Phases

- [ ] **Phase 1: Project Foundation** — Scaffold the repo, build, lint, and TypeScript toolchain so any subsequent phase can iterate.
- [ ] **Phase 2: Core Parser & Tolerance** — Tokenize HL7 input into segments/fields/components/subcomponents with a lenient default, warnings system, and strict-mode escalation.
- [ ] **Phase 3: Structural Model & Types** — Expose the parsed message as an immutable, dot-path-accessible model with typed composite types (XPN, XAD, TS/DTM, etc.).
- [ ] **Phase 4: Named Helpers** — Ship the one-line DX: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, and friends.
- [ ] **Phase 5: Serialization & Round-Trip** — `toString()`, `toJSON()`, `prettyPrint()`, and `buildMessage()` produce spec-clean HL7 and preserve semantics across parse → mutate → serialize → parse.
- [ ] **Phase 6: Profile System & Built-ins** — `defineProfile()` API with merge/extend semantics plus 5 built-in vendor profiles (epic, cerner, meditech, athena, genericLab).
- [ ] **Phase 7: Testing Hardening & Fixtures** — Canonical, edge-case, vendor-quirk, strict-mode, and profile-authoring test suites that verify ≥ 90% coverage on core modules.
- [ ] **Phase 8: Examples, Starter Kit & Documentation** — Three runnable examples, publishable profile starter kit, and the complete README + ancillary docs.

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
- [ ] 02-PLAN-02-input-normalization-mllp-and-charset.md — normalize (line endings only) + normalizeBuffer (Buffer → string via MSH-18 charset) + stripMllp
- [ ] 02-PLAN-03-segments-delimiters-and-tokenize.md — splitSegments + readDelimiters (3 fatals) + tokenize (fields/reps/comps/subs) + whitespace trim warning
- [ ] 02-PLAN-04-escape-sequences.md — unescape (all 8 HL7 escape forms + unknown warning) + reescape
- [ ] 02-PLAN-05-dateformats-plumbing.md — parseHl7Timestamp cascade (HL7 → user → built-ins) + TIMESTAMP_FALLBACK_FORMAT
- [ ] 02-PLAN-06-public-parsehl7-and-strict-mode.md — parseHL7 public entry + emitWarning chokepoint + strict-mode escalation + src/index.ts barrel update
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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
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
**Plans**: TBD
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

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation | 4/4 | Complete (pending verify) | 2026-04-18 |
| 2. Core Parser & Tolerance | 0/6 | Planned | — |
| 3. Structural Model & Types | 0/0 | Not started | — |
| 4. Named Helpers | 0/0 | Not started | — |
| 5. Serialization & Round-Trip | 0/0 | Not started | — |
| 6. Profile System & Built-ins | 0/0 | Not started | — |
| 7. Testing Hardening & Fixtures | 0/0 | Not started | — |
| 8. Examples, Starter Kit & Documentation | 0/0 | Not started | — |

---

*Last updated: 2026-04-18 (Phase 1 Plan 04 complete — Phase 1 plans all done, pending verify/validate)*
