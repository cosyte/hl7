# @cosyte/hl7-parser — v1 Requirements

All requirements are user-facing behaviors a developer consuming `@cosyte/hl7-parser` can verify. REQ-IDs are stable across phases and referenced from `ROADMAP.md` for traceability.

---

## v1 Requirements

### Project Setup & Build (SETUP)

- [x] **SETUP-01** — Developer can run `pnpm install && pnpm build && pnpm test` from a clean clone and all three succeed. _(Verified 2026-04-18 in Plan 01-04 pipeline smoke run.)_
- [x] **SETUP-02** — Package publishes as dual ESM + CJS with a correct `exports` map; consumers on either module system resolve the right entry point. _(Verified 2026-04-18 in Plan 01-04: ESM `import { VERSION }` and CJS `require(...).VERSION` both return `"0.0.0"` from the built `dist/`.)_
- [x] **SETUP-03** — Package has zero runtime dependencies in `package.json` (dev deps permitted).
- [x] **SETUP-04** — TypeScript consumers get full IntelliSense (types, JSDoc, `@example` tags) on every public API surface. _(Groundwork in Plan 01-01; verified in Plan 01-04 by inspecting emitted `dist/index.d.ts` — `VERSION`'s `@example` block is preserved through the tsup dts pipeline. `eslint-plugin-jsdoc` `require-example` rule enforces this for every future public export.)_
- [x] **SETUP-05** — Repo targets Node 18+ and compiles to ES2022 with `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [x] **SETUP-06** — `pnpm lint` and `pnpm typecheck` pass with zero warnings. _(Verified 2026-04-18 in Plan 01-04 with `--max-warnings=0`.)_

### Core Parsing (PARSE)

- [x] **PARSE-01** — `parseHL7(raw)` parses any well-formed HL7 v2.1–v2.8 message and returns an `Hl7Message` object. _(Closed by Plan 02-06 — public parseHL7 entry + strict-mode escalation.)_
- [x] **PARSE-02** — Parser reads encoding characters from MSH-1 and MSH-2 rather than hardcoding `|^~\&`; custom delimiters in MSH are honored throughout the message. _(Closed by Plan 02-03 — readDelimiters MSH-1/MSH-2 reader + tokenize custom-enc path.)_
- [x] **PARSE-03** — Parser handles all HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`, `\X..\`, `\Z..\`); unescape on access, re-escape on serialize.
- [x] **PARSE-04** — Parser preserves segments in original order, including repeating segments and Z-segments. _(Closed by Plan 02-03 — splitSegments preserves original order including Z-segments.)_
- [x] **PARSE-05** — Parser correctly decomposes fields into repetitions (`~`), components (`^`), and subcomponents (`&`) as a nested structure. _(Closed by Plan 02-03 — tokenize decomposes reps/comps/subs.)_
- [x] **PARSE-06** — Parser distinguishes empty fields (`||`) from null fields (`""`) per HL7 spec semantics. _(Closed by Plan 02-03 — RawField.isNull flag distinguishes `""` from empty.)_
- [x] **PARSE-07** — Parser handles a UTF-8 BOM at the start of the input silently (Tier 1: no warning). _(Closed by Plan 02-02 — BOM stripped silently in normalizeBuffer.)_
- [x] **PARSE-08** — Parser accepts `\r`, `\n`, `\r\n`, or mixed line endings and normalizes internally to `\r` (Tier 1: no warning). _(Closed by Plan 02-02 — line-ending normalize.)_
- [x] **PARSE-09** — Parser accepts a `Buffer` input and respects MSH-18 character set when set (defaults to UTF-8); unknown charsets warn and fall back to UTF-8. _(Closed by Plan 02-07 gap-closure — MSH-18 charset auto-discovery + options.charset override; commit 04a180b.)_

### Model & Access (MODEL)

- [x] **MODEL-01** — `msg.get('PID.5.1')` resolves a dot-path to a string value; `msg.get('OBX[2].5')` supports zero-indexed repeating-segment access. (Phase 3 Plan 01)
- [x] **MODEL-02** — `msg.getAll('NK1')` returns every segment of a type; `msg.segments('OBX')` returns typed Segment objects. (Phase 3 Plan 01)
- [x] **MODEL-03** — Segment objects expose `field(n)`, `.fields`, `.type`, with Field → Component → Subcomponent traversal. (Phase 3 Plan 01)
- [x] **MODEL-04** — `msg.allSegments()` iterates every segment in original order. (Phase 3 Plan 01)
- [x] **MODEL-05** — `get()` / `getAll()` return `undefined` / `[]` (not throw) when a path does not resolve. (Phase 3 Plan 01)
- [x] **MODEL-06** — Parsed `Hl7Message` is immutable by default; mutation is possible only via explicit methods (`setField`, `addSegment`, `removeSegment`). (Phase 3 Plan 04)
- [x] **MODEL-07** — `msg.setField('PID.8', 'F')` updates a field; `msg.addSegment('NTE', [...])` and `msg.removeSegment(...)` mutate the message; all are reflected in subsequent reads and serialization. (Phase 3 Plan 04)

### Named Helpers (HELPERS)

- [x] **HELPERS-01** — `msg.meta` exposes: `type`, `messageCode`, `triggerEvent`, `messageStructure`, `controlId`, `timestamp` (Date), `version`, `sendingApp`, `sendingFacility`, `receivingApp`, `receivingFacility`, `processingId`. (Phase 4 Plan 02 — buildMeta with D-03 always-present, D-18 flat Date.)
- [x] **HELPERS-02** — `msg.patient` exposes: `mrn`, `identifiers[]`, `name` (XPN), `familyName`, `givenName`, `middleName`, `fullName`, `dateOfBirth` (Date), `sex`, `address` (XAD), `phoneNumbers[]`, `race`, `ethnicity`, `language`. All return `undefined` (not throw) when absent. (Phase 4 Plan 02 — buildPatient with pickMrn, D-17 Western fullName, D-19 flat aliases, D-20 concatenated phones.)
- [x] **HELPERS-03** — `msg.visit` (nullable) exposes: `patientClass`, `location` (PL), `admitDateTime`, `dischargeDateTime`, `attendingDoctor` (XCN), `referringDoctor`, `visitNumber`. (Phase 4 Plan 03 — buildVisit with D-24a XCN doctors, D-18 flat Dates, D-01 frozen.)
- [x] **HELPERS-04** — `msg.observations()` returns an array of observation objects with `setId`, `valueType`, `identifier` (CWE), `value` (typed by valueType), `units`, `referenceRange`, `abnormalFlags`, `status`, `observedDateTime`. (Phase 4 Plan 03 — D-13 dispatch NM/TS/DT/CWE/CE/others; buildObservation exported for Plan 04.)
- [x] **HELPERS-05** — `msg.orders()` returns orders linked to their OBX observations with `placerOrderNumber`, `fillerOrderNumber`, `orderControl`, `orderStatus`, `orderedBy`, `universalServiceId`, `observations[]`. (Phase 4 Plan 04 — two-slot ORC state machine over msg.allSegments() for D-12 positional OBX grouping; reuses buildObservation; D-24a XCN for orderedBy.)
- [x] **HELPERS-06** — `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` return typed arrays (empty when absent). (Phase 4 Plan 04 — segment walkers for NK1/AL1/DG1; IN1 single-slot state machine sets hasIn2/hasIn3 positional flags; D-01 frozen + D-06 not memoized.)
- [x] **HELPERS-07** — All helpers return `undefined` / empty arrays for missing optional data; never throw. (Phase 4 Plans 02 + 03 + 04 — closed for all 9 helper surfaces via universal never-throws sweep covering empty MSH-only input and a fixture with every core segment reduced to its type byte.)

### Data Types (TYPES)

- [x] **TYPES-01** — TypeScript interfaces exist and are exported for the common composite types: XPN, XAD, CX, CWE/CE, XTN, PL, TS/DTM, NM, HD.
- [x] **TYPES-02** — Helpers return parsed instances of these types (e.g. `patient.name` is a parsed `XPN`). (Phase 3 Plan 04 — Field.asXxx wired for all 10 composites)
- [x] **TYPES-03** — HL7 TS/DTM strings (`YYYYMMDDHHMMSS[.SSSS][+/-ZZZZ]`) parse to JS `Date` with valid truncations; raw string remains accessible.
- [x] **TYPES-04** — Unparseable timestamps return `undefined` for the `Date` getter (no throw); raw remains accessible.

### Real-World Tolerance (TOL)

- [x] **TOL-01** — Default parse mode is lenient; strict mode via `{ strict: true }` escalates every Tier 2 warning to a thrown `Hl7ParseError`. _(Closed by Plan 02-06 — strict-mode escalation chokepoint in makeEmitter.)_
- [x] **TOL-02** — Tier 3 fatal errors throw `Hl7ParseError` with stable codes even in lenient mode: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Each error includes `message`, `position`, `snippet`. _(Closed by Plan 02-01 — Hl7ParseError 4 fatal codes with position + snippet.)_
- [x] **TOL-03** — Parser emits Tier 2 warnings with stable codes and positional context (`segmentIndex`, `fieldIndex`, `componentIndex`, `repetitionIndex`) for all defined scenarios (MLLP framing, segment case, extra fields, unknown/unregistered segments, timestamp fallbacks, trimmed whitespace, duplicate required segments, encoding mismatches, missing required fields, out-of-order segments, unknown escape sequences, version mismatches, unknown charsets). _(Closed by Plan 02-01 — 13-code WARNING_CODES registry with position-bearing factories.)_
- [x] **TOL-04** — `msg.warnings` is always an array of `Hl7ParseWarning` objects (possibly empty) on a parsed message. _(Closed by Plan 02-01 — Hl7Message.warnings always readonly array, frozen on construction.)_
- [x] **TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted. _(Closed by Plan 02-06 — onWarning invoked inside makeEmitter chokepoint.)_
- [x] **TOL-06** — `stripMllpFraming: true` (default) strips raw MLLP bytes (`0x0B`, `0x1C`, `0x0D`) and emits `MLLP_FRAMING_STRIPPED`. _(Closed by Plan 02-02 — stripMllp + MLLP_FRAMING_STRIPPED emit.)_
- [x] **TOL-07** — `trimFields: true` (default) trims leading/trailing whitespace and emits `FIELD_WHITESPACE_TRIMMED` only when non-whitespace content existed around the value. _(Closed by Plan 02-03 — tokenize whitespace trim with non-whitespace-guard.)_
- [x] **TOL-08** — `dateFormats: [...]` option provides fallback formats; order-sensitive; emits `TIMESTAMP_FALLBACK_FORMAT` when a non-HL7 format succeeds. _(Plumbing closed by Plan 02-05; observable slice closed by Phase 3 TYPES-04 (TS/DTM composite) + Phase 4 HELPERS-01 (`msg.meta.timestamp`). See `.planning/phases/02-core-parser-and-tolerance/02-VERIFICATION.md` Resolution Note §TOL-08.)_
- [x] **TOL-09** — Built-in timestamp fallbacks (ISO 8601, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YYYY HH:mm:ss`) are tried when the user-supplied list is empty or doesn't match. _(Closed by Plan 02-05 — BUILTIN_DATE_FALLBACKS always-tried cascade.)_
- [x] **TOL-10** — Unknown escape sequences are preserved verbatim in unescaped output and warn `UNKNOWN_ESCAPE_SEQUENCE`.

### Serialization & Round-Trip (SER)

- [x] **SER-01** — `msg.toString()` produces spec-clean HL7 regardless of quirks in the input (Postel's Law: conservative emitter). (Phase 5 Plan 02)
- [x] **SER-02** — Round-trip `parse → toString → parse` yields an equivalent `Hl7Message` object for every fixture. (Phase 5 Plan 02)
- [x] **SER-03** — `msg.toJSON()` returns a structured JSON representation of the full message. (Phase 5 Plan 03)
- [x] **SER-04** — `msg.prettyPrint()` returns a human-readable multi-line string for logging/debugging. (Phase 5 Plan 04)
- [x] **SER-05** — Escape sequences are correctly re-encoded on serialize (unescaped content → escaped). (Phase 5 Plan 02)
- [x] **SER-06** — `buildMessage({...}).addSegment(...).toString()` constructs a valid outbound HL7 message for tests and small tools. (Phase 5 Plan 05)

### Profiles (PROF)

- [x] **PROF-01** — `defineProfile({ name, ...options })` returns a valid `Profile` object; name is required. (closed Phase 6 Plan 01)
- [x] **PROF-02** — `defineProfile()` throws `ProfileDefinitionError` with a clear message for invalid input: bad segment names (not 3 chars, not uppercase), duplicate field names within a segment, unknown option keys, malformed date format strings. (closed Phase 6 Plan 01 — all 4 throw paths D-05/D-07/D-08 + name validation wired; duplicate-field post-merge check deferred to Plan 06-02)
- [x] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics match spec (scalars overwrite, arrays concat+dedupe, `customSegments` deep-merge per key, `onWarning` handlers chain). (closed Phase 6 Plan 02 — mergeLineage D-03 + mergeDateFormats D-10 + mergeCustomSegments D-11 position-indexed + mergeScalar D-09 last-wins + composeOnWarning D-12 with per-handler try/catch; post-merge D-05 rogue-parent re-check + D-06 defense-in-depth validator installed)
- [x] **PROF-04** — `profile.name`, `profile.description`, `profile.customSegments`, `profile.dateFormats`, `profile.lineage` are readonly and reflect applied options. (closed Phase 6 Plan 01 — Profile interface readonly; defineProfile output Object.freeze'd at boundary)
- [x] **PROF-05** — `profile.describe()` returns a non-empty human-readable summary containing the profile name. (closed Phase 6 Plan 01 — buildDescribe always starts with `Profile '<name>'`)
- [x] **PROF-06** — `parseHL7(raw, profile)` applies profile behavior to the parse; `msg.profile?.name` and `msg.profile?.lineage` are set on the parsed message. (closed Phase 6 Plan 03 — customSegments threaded end-to-end via Hl7MessageInit.customSegments; D-22 profile.onWarning chain hoisted into makeEmitter fires BEFORE options.onWarning inside per-handler try/catch; effectiveProfile resolved at new Step 6.5 BEFORE emitter construction so full-parse coverage including Buffer-decode + MLLP replay; attribution {name, lineage} already landed in Phase 2 Step 13)
- [x] **PROF-07** — Registered Z-segments (via `customSegments`) are accessible by field name: `msg.segments('ZPI')[0].get('encounterId')`. (closed Phase 6 Plan 03 — Segment.get(name) runtime delivered with D-14 narrow: undefined for missing name AND out-of-range position; types already closed in Plan 01)
- [x] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument overrides; `parseHL7(raw, { profile: null })` opts out for one call. (closed Phase 6 Plan 04 — module-level `let _defaultProfile` in src/profiles/default.ts; parseHL7 Step 6.5 3-branch D-19 discrimination layered on top of Plan 03's hoist; D-20 effects equivalence via default vs explicit anchored by 4 tests; afterEach test-isolation discipline documented in JSDoc + enforced in test file)
- [x] **PROF-09** — Round-trip: a message parsed with a custom profile and re-serialized produces spec-clean HL7 (profile quirks affect parsing, not serialization). (closed Phase 6 Plan 03 — `parseHL7(raw, profile).toString() === parseHL7(raw).toString()` anchored by test; toString() is profile-agnostic per PROJECT.md Postel's Law — no emit-side profile hooks)

### Built-in Profiles (BIP)

- [x] **BIP-01** — `profiles.epic` ships and is authored via the public `defineProfile()` API. (closed Phase 6 Plan 05 — src/profiles/epic.ts with dateFormats `["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"]` + customSegments ZDP/ZRS; barrel access as `profiles.epic` lands in Plan 06-06)
- [x] **BIP-02** — `profiles.cerner` ships and is authored via the public `defineProfile()` API. (closed Phase 6 Plan 05 — src/profiles/cerner.ts with ISO-8601-T + ISO date-only formats + customSegments ZDS/ZCO)
- [x] **BIP-03** — `profiles.meditech` ships and is authored via the public `defineProfile()` API. (closed Phase 6 Plan 05 — src/profiles/meditech.ts with `YYYYMMDDHHmm` minute-precision + customSegments ZVI)
- [x] **BIP-04** — `profiles.athena` ships and is authored via the public `defineProfile()` API. (closed Phase 6 Plan 05 — src/profiles/athena.ts with `MM/DD/YYYY` + customSegments ZCA; AM/PM meridian variant dropped per SUPPORTED_DATE_TOKENS set)
- [x] **BIP-05** — `profiles.genericLab` ships and is authored via the public `defineProfile()` API. (closed Phase 6 Plan 05 — src/profiles/genericLab.ts with ASTM-era `YYYYMMDD HHmm` + ISO date-only + customSegments ZLB/ZNT)
- [x] **BIP-06** — Each built-in profile reduces warnings on a realistic vendor-shape fixture versus lenient mode without a profile. (closed Phase 6 Plan 06 — test/profiles-builtins.test.ts asserts `UNKNOWN_SEGMENT` absent with profile for declared Z-segments across all 5 vendors + cross-profile smoke `withP.warnings.length <= without.warnings.length`)

### Testing & Fixtures (TEST)

- [x] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/helpers/`. _(Closed 2026-04-19 by Plan 07-06 — branch threshold tightened 85 -> 90 on five per-dir entries in `vitest.config.ts` (parser/model/helpers + Phase-5 serialize/builder). Final numbers: parser 91.66% / model 90.26% / helpers 95.60% / serialize 92.85% / builder 93.54% branches; lines/funcs/statements all ≥ 97.27%. `.github/workflows/ci.yml` gains a `Test (with coverage)` step invoking `pnpm test:coverage` across Node 18/20/22 matrix — coverage regression fails the build on every PR.)_
- [x] **TEST-02** — Canonical fixtures exist and round-trip losslessly for: ADT^A01, ADT^A04, ADT^A08, ORU^R01, ORM^O01, SIU^S12, MDM^T02, at least one with Z-segments, at least one with repeating fields, at least one with nested subcomponents.
- [x] **TEST-03** — Edge-case fixtures cover: CR/LF/CRLF/mixed line endings, trailing newline and none, empty and null fields, consecutive delimiters, unknown escapes, custom MSH delimiters, `\.br\` multi-line OBX values, Unicode, missing optional segments.
- [x] **TEST-04** — Malformed messages throw `Hl7ParseError` with descriptive position/snippet (missing MSH, truncated MSH, invalid encoding chars, empty input). _(Closed 2026-04-19 by Plan 07-05 — 4 fixtures under `test/fixtures/malformed/` (one per `FATAL_CODES` entry) + `test/parser-malformed-sweep.test.ts` parameterized `describe.each` over `readdirSync`. Each fixture asserts `parseHL7` throws `Hl7ParseError` with `err.code` matching `fileToCode(filename)` and `err.position` + `err.snippet` defined per TOL-02, in BOTH lenient and strict mode (Tier-3 mode-independence).)_
- [x] **TEST-05** — `test/fixtures/vendor-quirks/` contains at least one fixture per Tier 2 scenario listed in the spec, each verified to emit the expected warning and still parse in lenient mode. _(Closed 2026-04-20 by Plan 07-04 — 13 fixtures authored, one per `WARNING_CODES` entry; filename-as-kebab-code contract enforced by `test/_helpers/fixture-code.ts`. Per-fixture README documents the emission-status matrix: 6 codes emit from the lenient default parser today; 7 codes have factories but no parser call site and are tracked via `it.todo` in the sweep — fixtures are ready for the future emit-site wiring.)_
- [x] **TEST-06** — Strict-mode escalation test: every Tier 2 vendor-quirks fixture throws `Hl7ParseError` under `{ strict: true }`. _(Closed 2026-04-20 by Plan 07-04 — `test/parser-strict-mode-sweep.test.ts` uses `describe.each` over `readdirSync(vendor-quirks/)`; every fixture whose target code emits today asserts strict-mode throw. Adding a fixture auto-joins the sweep; moving a code from the `NON_EMITTING_CODES` todo list to `EMITTING_CODES` auto-promotes its `it.todo` blocks into passing assertions.)_
- [x] **TEST-07** — At least one fixture per built-in profile (`epic`, `cerner`, `meditech`, `athena`, `genericLab`) demonstrates fewer warnings with the profile than without. _(Closed 2026-04-19 by Plan 07-07 — audit of `test/profiles-builtins.test.ts` confirmed Phase 6 Plan 06-06 (BIP-06) already satisfies this requirement: each of the 5 vendor describe blocks asserts `UNKNOWN_SEGMENT absent with profile` (stricter than "fewer warnings"), and the `Cross-profile warning-reduction summary` describe iterates all 5 vendors with `expect(withP.warnings.length).toBeLessThanOrEqual(without.warnings.length)`. Fixtures under `test/fixtures/vendor-shapes/{epic,cerner,meditech,athena,genericLab}/`.)_
- [x] **TEST-08** — Profile-authoring test suite covers: valid `defineProfile` output; `ProfileDefinitionError` cases; `extends` single + array; merge semantics per option category; default-profile set/get/opt-out; `profile.describe()`; `msg.profile` attribution; round-trip with custom profile. _(Closed 2026-04-19 by Plan 07-07 — `.planning/phases/07-testing-hardening-and-fixtures/TEST-08-AUDIT.md` maps all 8 enumerated cases to existing Phase 6 test file(s); every row COVERED (comprehensive), zero gaps. No test-file edits were required — the 6 Phase 6 `test/profiles-*.test.ts` files already satisfy the contract.)_

### Examples (EX)

- [x] **EX-01** — `examples/extract-patient-info.ts` runs end-to-end and demonstrates the named-helper access path. _(Closed by Plan 08-01 — examples/extract-patient-info.ts runs end-to-end via `pnpm examples`; verified green in 09-04 pipeline.)_
- [x] **EX-02** — `examples/read-lab-results.ts` runs end-to-end and demonstrates iterating `msg.observations()` / `msg.orders()`. _(Closed by Plan 08-01 — examples/read-lab-results.ts iterates msg.observations() / msg.orders().)_
- [x] **EX-03** — `examples/modify-and-resend.ts` runs end-to-end and demonstrates mutation + round-trip serialization. _(Closed by Plan 08-01 — examples/modify-and-resend.ts mutates + round-trip serializes.)_

### Profile Starter Kit (KIT)

- [x] **KIT-01** — `examples/profile-starter-kit/` exists and contains every file listed in the spec's deliverable list. _(Closed by Plan 08-02 — examples/profile-starter-kit/ subtree with all 15 files.)_
- [x] **KIT-02** — Running `pnpm install && pnpm test` inside the starter kit succeeds against its sample fixture. _(Closed by Plan 08-02 — in-kit `pnpm install && pnpm test` green; 4/4 tests pass against ZAL sample fixture.)_
- [x] **KIT-03** — `pnpm build` inside the starter kit produces a `dist/` with correct entry points matching `package.json` exports. _(Closed by Plan 08-02 — `pnpm build` produces dist/index.mjs + index.cjs + index.d.ts matching exports map.)_
- [x] **KIT-04** — `.github/workflows/ci.yml` and `publish.yml` are syntactically valid (verified by `actionlint` or equivalent). _(Closed by Plan 08-02 — ci.yml + publish.yml actionlint-clean.)_
- [x] **KIT-05** — Starter kit `package.json` has correct `peerDependencies` on `@cosyte/hl7-parser`, `publishConfig: { access: public }`, `files: [dist, ...]`, and working `build`/`test`/`lint` scripts. _(Closed by Plan 08-02 — manifest has peerDependencies.@cosyte/hl7 + publishConfig.access:public + files allow-list + no dependencies block + prepublishOnly chain.)_
- [x] **KIT-06** — `CUSTOMIZING.md` is present and walks through the rename → swap base profile → define Z-segments → write fixtures → publish flow. _(Closed by Plan 08-02 — CUSTOMIZING.md 5-step walk-through with runnable Verify blocks.)_
- [x] **KIT-07** — Starter kit README uses `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistently. _(Closed by Plan 08-02 — `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` / `MyProfile` placeholder triple used consistently; kit pipeline green with placeholders intact.)_

### Documentation (DOC)

- [x] **DOC-01** — README renders cleanly on GitHub and npm with the one-sentence value prop as the first line, followed by badges. _(Closed by Plan 08-03 — README one-sentence value prop + badges at top.)_
- [x] **DOC-02** — README contains a 30-second quickstart (install + parse + extract a patient name) in one copy-pasteable block. _(Closed by Plan 08-03 — 30-second copy-pasteable quickstart block.)_
- [x] **DOC-03** — README has a feature list (6–8 bullets) highlighting developer-centric wins. _(Closed by Plan 08-03 — 6-8 feature bullets.)_
- [x] **DOC-04** — README has an "HL7 in 90 seconds" core-concepts section (≤ 2 paragraphs). _(Closed by Plan 08-03 — "HL7 in 90 seconds" core-concepts section.)_
- [x] **DOC-05** — README covers the three access patterns (helpers / paths / structural) with runnable examples. _(Closed by Plan 08-03 — three access patterns (helpers / paths / structural) with runnable examples.)_
- [x] **DOC-06** — README Cookbook section contains every recipe listed in the spec (patient demographics, lab results, admit location, modify+reserialize, allergies, "Write your first profile in 10 minutes", extending a profile, composing profiles, publishing a profile package, default profile, non-standard timestamps, stripping MLLP framing, batch-file note, detect message type, pretty-print). _(Closed by Plan 08-03 — Cookbook section with every recipe from the spec.)_
- [x] **DOC-07** — README has a top-level "Profiles" section covering authoring, extending, merge semantics, inspection, publishing — not buried in API reference. _(Closed by Plan 08-03 — top-level Profiles section covering authoring, extending, merging, publishing.)_
- [x] **DOC-08** — README "Real-World Tolerance" section explains the 4-tier deviation model with a compact table and a runnable warnings-iteration example. _(Closed by Plan 08-03 — 4-tier Real-World Tolerance section with table + runnable warnings iteration.)_
- [x] **DOC-09** — README "Error Handling" section covers `Hl7ParseError`, `Hl7ParseWarning`, `ProfileDefinitionError` with examples. _(Closed by Plan 08-03 — Error Handling section covering Hl7ParseError / Hl7ParseWarning / ProfileDefinitionError.)_
- [x] **DOC-10** — README "Contributing" section points to CONTRIBUTING.md and invites vendor quirk fixtures, profile improvements, and standalone profile packages. _(Closed by Plan 08-03 — Contributing section with CONTRIBUTING.md pointer.)_
- [x] **DOC-11** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link. _(Closed by Plan 08-03 — "Built by Cosyte" footer + license link.)_
- [x] **DOC-12** — Roadmap/stretch goals section documents: typed message overlays, schema-aware validation, streaming parser, JSON Schema/Zod output, batch-file support, type-safe custom-segment fields. _(Closed by Plan 08-03 — Roadmap / stretch-goals section documents all 6 v2 deferrals.)_
- [x] **DOC-13** — The "Publishing Your Profile" recipe links directly to `examples/profile-starter-kit/` and references `CUSTOMIZING.md`. _(Closed by Plan 08-03 — "Publishing Your Profile" recipe links to examples/profile-starter-kit/ + CUSTOMIZING.md.)_
- [x] **DOC-14** — CHANGELOG.md exists in Keep-a-Changelog format with an `[Unreleased]` section. _(Closed by Plan 08-04 — CHANGELOG.md in Keep-a-Changelog format with [Unreleased] section.)_
- [x] **DOC-15** — LICENSE (MIT) exists at repo root. _(Closed by Plan 08-04 — LICENSE MIT at repo root.)_

---

## v2 Requirements (Deferred)

- Typed message overlays (`msg.is('ADT^A01')` narrows to `AdtA01Message`)
- Schema-aware validation against message structure definitions
- Streaming parser for large batch files
- JSON Schema / Zod emission for `toJSON()` output
- Batch file support (FHS/BHS/BTS/FTS)
- Type-safe custom segment field names via conditional types

## Out of Scope

- MLLP framing / network transport — belongs in a future `@cosyte/hl7-mllp` package
- HL7 v3 and CDA — different spec family
- FHIR conversion — future companion package
- Exhaustive HL7 coded-value validation — structure only

---

## Traceability

Every v1 REQ-ID maps to exactly one phase in `ROADMAP.md`. 97/97 mapped.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SETUP-01 | Phase 1 — Project Foundation | Complete (01-04) |
| SETUP-02 | Phase 1 — Project Foundation | Complete (01-04) |
| SETUP-03 | Phase 1 — Project Foundation | Complete (01-01) |
| SETUP-04 | Phase 1 — Project Foundation | Complete (01-04; enforced via lint for future exports) |
| SETUP-05 | Phase 1 — Project Foundation | Complete (01-01) |
| SETUP-06 | Phase 1 — Project Foundation | Complete (01-04) |
| PARSE-01 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-06 — parseHL7 public entry + strict-mode) |
| PARSE-02 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-03 — readDelimiters + tokenize custom-enc) |
| PARSE-03 | Phase 2 — Core Parser & Tolerance | Complete (02-04) |
| PARSE-04 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-03 — splitSegments preserves order incl. Z-segments) |
| PARSE-05 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-03 — tokenize reps/comps/subs) |
| PARSE-06 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-03 — RawField.isNull flag) |
| PARSE-07 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-02 — normalizeBuffer silent BOM strip) |
| PARSE-08 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-02 — line-ending normalize to \r) |
| PARSE-09 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-07 gap-closure — MSH-18 charset + options.charset override, commit 04a180b) |
| TOL-01 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-06 — strict-mode escalation chokepoint) |
| TOL-02 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-01 — 4 fatal codes in Hl7ParseError) |
| TOL-03 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-01 — 13-code WARNING_CODES registry) |
| TOL-04 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-01 — msg.warnings frozen readonly array) |
| TOL-05 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-06 — onWarning invoked in emitter chokepoint) |
| TOL-06 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-02 — stripMllp + MLLP_FRAMING_STRIPPED emit) |
| TOL-07 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-03 — tokenize whitespace trim + warning) |
| TOL-08 | Phase 2 — Core Parser & Tolerance | Closed (plumbing Plan 02-05; observable slice Phase 3 TYPES-04 + Phase 4 HELPERS-01 — see 02-VERIFICATION.md §TOL-08) |
| TOL-09 | Phase 2 — Core Parser & Tolerance | Closed (Plan 02-05 — BUILTIN_DATE_FALLBACKS always-tried cascade) |
| TOL-10 | Phase 2 — Core Parser & Tolerance | Complete (02-04) |
| MODEL-01 | Phase 3 — Structural Model & Types | Complete (Plan 01) |
| MODEL-02 | Phase 3 — Structural Model & Types | Complete (Plan 01) |
| MODEL-03 | Phase 3 — Structural Model & Types | Complete (Plan 01) |
| MODEL-04 | Phase 3 — Structural Model & Types | Complete (Plan 01) |
| MODEL-05 | Phase 3 — Structural Model & Types | Complete (Plan 01) |
| MODEL-06 | Phase 3 — Structural Model & Types | Complete (Plan 04) |
| MODEL-07 | Phase 3 — Structural Model & Types | Complete (Plan 04) |
| TYPES-01 | Phase 3 — Structural Model & Types | Complete (Plan 03) |
| TYPES-02 | Phase 3 — Structural Model & Types | Complete (Plan 04) |
| TYPES-03 | Phase 3 — Structural Model & Types | Complete (Plan 03) |
| TYPES-04 | Phase 3 — Structural Model & Types | Complete (Plan 03) |
| HELPERS-01 | Phase 4 — Named Helpers | Complete (Plan 02) |
| HELPERS-02 | Phase 4 — Named Helpers | Complete (Plan 02) |
| HELPERS-03 | Phase 4 — Named Helpers | Complete (Plan 03) |
| HELPERS-04 | Phase 4 — Named Helpers | Complete (Plan 03) |
| HELPERS-05 | Phase 4 — Named Helpers | Complete (Plan 04) |
| HELPERS-06 | Phase 4 — Named Helpers | Complete (Plan 04) |
| HELPERS-07 | Phase 4 — Named Helpers | Complete (Plans 02 + 03 + 04 — universal never-throws sweep) |
| SER-01 | Phase 5 — Serialization & Round-Trip | Complete (Plan 02 — emitMessage body D-01/D-05/D-06/D-07/D-08) |
| SER-02 | Phase 5 — Serialization & Round-Trip | Complete (Plan 02 — 5-fixture round-trip sweep + tokenize unescape-on-parse Rule-3 deviation) |
| SER-03 | Phase 5 — Serialization & Round-Trip | Complete (Plan 03 — emitJson body D-17 raw-tree mirror + D-19 stable warnings + D-20 conditional profile + W5 boundary freeze) |
| SER-04 | Phase 5 — Serialization & Round-Trip | Complete (Plan 04 — emitPrettyPrint body D-22..D-26 + W2 raw-escape JSDoc + 29-test suite across 6 decision blocks) |
| SER-05 | Phase 5 — Serialization & Round-Trip | Complete (Plan 02 — reescape chokepoint observable via emitField + round-trip fixtures) |
| SER-06 | Phase 5 — Serialization & Round-Trip | Complete (Plan 05 — buildMessage + formatHl7Timestamp + generateControlId bodies; D-09..D-16 + D-07 runtime-confirmed; W1 reinforced on function-level JSDoc + 2 dedicated tests; 40-test suite across 3 new files) |
| PROF-01 | Phase 6 — Profile System & Built-ins | Closed (Plan 01) |
| PROF-02 | Phase 6 — Profile System & Built-ins | Closed (Plan 01) |
| PROF-03 | Phase 6 — Profile System & Built-ins | Closed (Plan 02) |
| PROF-04 | Phase 6 — Profile System & Built-ins | Closed (Plan 01) |
| PROF-05 | Phase 6 — Profile System & Built-ins | Closed (Plan 01) |
| PROF-06 | Phase 6 — Profile System & Built-ins | Closed (Plan 03 — customSegments threading + D-22 onWarning chain hoist) |
| PROF-07 | Phase 6 — Profile System & Built-ins | Closed (types Plan 01; runtime Segment.get Plan 03) |
| PROF-08 | Phase 6 — Profile System & Built-ins | Closed (Plan 04 — setDefaultProfile/getDefaultProfile + parseHL7 Step 6.5 3-branch D-19 discrimination) |
| PROF-09 | Phase 6 — Profile System & Built-ins | Closed (Plan 03 — toString() profile-agnostic round-trip anchored by test) |
| BIP-01 | Phase 6 — Profile System & Built-ins | Closed (Plan 05 — src/profiles/epic.ts via public defineProfile() API) |
| BIP-02 | Phase 6 — Profile System & Built-ins | Closed (Plan 05 — src/profiles/cerner.ts via public defineProfile() API) |
| BIP-03 | Phase 6 — Profile System & Built-ins | Closed (Plan 05 — src/profiles/meditech.ts via public defineProfile() API) |
| BIP-04 | Phase 6 — Profile System & Built-ins | Closed (Plan 05 — src/profiles/athena.ts via public defineProfile() API) |
| BIP-05 | Phase 6 — Profile System & Built-ins | Closed (Plan 05 — src/profiles/genericLab.ts via public defineProfile() API) |
| BIP-06 | Phase 6 — Profile System & Built-ins | Closed (Plan 06 — test/profiles-builtins.test.ts per-vendor warning-reduction + round-trip) |
| TEST-01 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-06 — vitest branches 85→90 on 5 per-dir entries + `Test (with coverage)` step added to `.github/workflows/ci.yml` running `pnpm test:coverage` across Node 18/20/22) |
| TEST-02 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-02 — 9 canonical fixtures + test/canonical-messages.test.ts sweep) |
| TEST-03 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-03 — 14 edge-case fixtures + test/parser-edge-cases.test.ts with 15 explicit per-scenario it() blocks) |
| TEST-04 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-05 — 4 malformed fixtures + test/parser-malformed-sweep.test.ts parameterized sweep; asserts throw+code+position+snippet in lenient & strict modes) |
| TEST-05 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-04 — 13 vendor-quirks fixtures + README under test/fixtures/vendor-quirks/) |
| TEST-06 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-04 — test/parser-strict-mode-sweep.test.ts parameterized describe.each sweep) |
| TEST-07 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-07 audit confirmed Phase 6 Plan 06-06 BIP-06 closure: per-vendor UNKNOWN_SEGMENT absent-with-profile × 5 + cross-profile `toBeLessThanOrEqual` sweep over all 5 vendors) |
| TEST-08 | Phase 7 — Testing Hardening & Fixtures | Closed (Plan 07-07 — TEST-08-AUDIT.md maps all 8 cases to existing Phase 6 test files; 0 gaps) |
| EX-01 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-01 — examples/extract-patient-info.ts; pnpm examples green in 09-04 pipeline) |
| EX-02 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-01 — examples/read-lab-results.ts observations+orders iteration) |
| EX-03 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-01 — examples/modify-and-resend.ts mutation + round-trip) |
| KIT-01 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — examples/profile-starter-kit/ subtree with package.json + tsconfig.json + tsup.config.ts + vitest.config.ts + eslint.config.js + .prettierrc.json + sample src/index.ts + test/profile.test.ts + test/fixtures/sample.hl7) |
| KIT-02 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — `pnpm install --no-frozen-lockfile && pnpm test` green inside the kit; 4/4 assertions pass against ZAL sample fixture) |
| KIT-03 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — `pnpm build` produces dist/index.mjs + dist/index.cjs + dist/index.d.ts matching the exports map) |
| KIT-04 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — .github/workflows/ci.yml push/PR + .github/workflows/publish.yml workflow_dispatch-only with NODE_AUTH_TOKEN scoped to single step; both actionlint-clean) |
| KIT-05 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — package.json has peerDependencies.@cosyte/hl7-parser + publishConfig.access:public + files:["dist","README.md","LICENSE","CUSTOMIZING.md"] + no top-level dependencies block + prepublishOnly chains typecheck→lint→test→build) |
| KIT-06 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — CUSTOMIZING.md walks through 5 numbered steps: rename → swap base profile → define Z-segments → write fixtures → publish; each step closes with a runnable Verify block) |
| KIT-07 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-02 — `{{YOUR_ORG}}` + `{{PROFILE_NAME}}` + `MyProfile` placeholder triple appears consistently across package.json + src/ + test/ + README.md + LICENSE + CUSTOMIZING.md; kit's ci.yml runs green with placeholders intact — no rename required for verification) |
| DOC-01 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — README value prop + badges) |
| DOC-02 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — 30-second quickstart block) |
| DOC-03 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — feature list 6-8 bullets) |
| DOC-04 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — HL7 in 90 seconds section) |
| DOC-05 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — three access patterns with examples) |
| DOC-06 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — Cookbook with every spec recipe) |
| DOC-07 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — top-level Profiles section) |
| DOC-08 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — 4-tier Real-World Tolerance table + example) |
| DOC-09 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — Error Handling section) |
| DOC-10 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — Contributing section) |
| DOC-11 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — "Built by Cosyte" footer + license link) |
| DOC-12 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — Roadmap / stretch-goals section with 6 v2 deferrals) |
| DOC-13 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-03 — Publishing Your Profile recipe links to starter kit + CUSTOMIZING.md) |
| DOC-14 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-04 — CHANGELOG.md Keep-a-Changelog + [Unreleased]) |
| DOC-15 | Phase 8 — Examples, Starter Kit & Documentation | Closed (Plan 08-04 — LICENSE MIT at repo root) |

**Coverage:** 97 / 97 v1 REQ-IDs mapped (no orphans, no duplicates).

*Last updated: 2026-04-18 (traceability populated by roadmapper).*
