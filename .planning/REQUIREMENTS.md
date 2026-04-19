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

- [ ] **PARSE-01** — `parseHL7(raw)` parses any well-formed HL7 v2.1–v2.8 message and returns an `Hl7Message` object.
- [ ] **PARSE-02** — Parser reads encoding characters from MSH-1 and MSH-2 rather than hardcoding `|^~\&`; custom delimiters in MSH are honored throughout the message.
- [x] **PARSE-03** — Parser handles all HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`, `\X..\`, `\Z..\`); unescape on access, re-escape on serialize.
- [ ] **PARSE-04** — Parser preserves segments in original order, including repeating segments and Z-segments.
- [ ] **PARSE-05** — Parser correctly decomposes fields into repetitions (`~`), components (`^`), and subcomponents (`&`) as a nested structure.
- [ ] **PARSE-06** — Parser distinguishes empty fields (`||`) from null fields (`""`) per HL7 spec semantics.
- [ ] **PARSE-07** — Parser handles a UTF-8 BOM at the start of the input silently (Tier 1: no warning).
- [ ] **PARSE-08** — Parser accepts `\r`, `\n`, `\r\n`, or mixed line endings and normalizes internally to `\r` (Tier 1: no warning).
- [ ] **PARSE-09** — Parser accepts a `Buffer` input and respects MSH-18 character set when set (defaults to UTF-8); unknown charsets warn and fall back to UTF-8.

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

- [ ] **TOL-01** — Default parse mode is lenient; strict mode via `{ strict: true }` escalates every Tier 2 warning to a thrown `Hl7ParseError`.
- [ ] **TOL-02** — Tier 3 fatal errors throw `Hl7ParseError` with stable codes even in lenient mode: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Each error includes `message`, `position`, `snippet`.
- [ ] **TOL-03** — Parser emits Tier 2 warnings with stable codes and positional context (`segmentIndex`, `fieldIndex`, `componentIndex`, `repetitionIndex`) for all defined scenarios (MLLP framing, segment case, extra fields, unknown/unregistered segments, timestamp fallbacks, trimmed whitespace, duplicate required segments, encoding mismatches, missing required fields, out-of-order segments, unknown escape sequences, version mismatches, unknown charsets).
- [ ] **TOL-04** — `msg.warnings` is always an array of `Hl7ParseWarning` objects (possibly empty) on a parsed message.
- [ ] **TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **TOL-06** — `stripMllpFraming: true` (default) strips raw MLLP bytes (`0x0B`, `0x1C`, `0x0D`) and emits `MLLP_FRAMING_STRIPPED`.
- [ ] **TOL-07** — `trimFields: true` (default) trims leading/trailing whitespace and emits `FIELD_WHITESPACE_TRIMMED` only when non-whitespace content existed around the value.
- [ ] **TOL-08** — `dateFormats: [...]` option provides fallback formats; order-sensitive; emits `TIMESTAMP_FALLBACK_FORMAT` when a non-HL7 format succeeds.
- [ ] **TOL-09** — Built-in timestamp fallbacks (ISO 8601, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YYYY HH:mm:ss`) are tried when the user-supplied list is empty or doesn't match.
- [x] **TOL-10** — Unknown escape sequences are preserved verbatim in unescaped output and warn `UNKNOWN_ESCAPE_SEQUENCE`.

### Serialization & Round-Trip (SER)

- [ ] **SER-01** — `msg.toString()` produces spec-clean HL7 regardless of quirks in the input (Postel's Law: conservative emitter).
- [ ] **SER-02** — Round-trip `parse → toString → parse` yields an equivalent `Hl7Message` object for every fixture.
- [ ] **SER-03** — `msg.toJSON()` returns a structured JSON representation of the full message.
- [ ] **SER-04** — `msg.prettyPrint()` returns a human-readable multi-line string for logging/debugging.
- [ ] **SER-05** — Escape sequences are correctly re-encoded on serialize (unescaped content → escaped).
- [ ] **SER-06** — `buildMessage({...}).addSegment(...).toString()` constructs a valid outbound HL7 message for tests and small tools.

### Profiles (PROF)

- [ ] **PROF-01** — `defineProfile({ name, ...options })` returns a valid `Profile` object; name is required.
- [ ] **PROF-02** — `defineProfile()` throws `ProfileDefinitionError` with a clear message for invalid input: bad segment names (not 3 chars, not uppercase), duplicate field names within a segment, unknown option keys, malformed date format strings.
- [ ] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics match spec (scalars overwrite, arrays concat+dedupe, `customSegments` deep-merge per key, `onWarning` handlers chain).
- [ ] **PROF-04** — `profile.name`, `profile.description`, `profile.customSegments`, `profile.dateFormats`, `profile.lineage` are readonly and reflect applied options.
- [ ] **PROF-05** — `profile.describe()` returns a non-empty human-readable summary containing the profile name.
- [ ] **PROF-06** — `parseHL7(raw, profile)` applies profile behavior to the parse; `msg.profile?.name` and `msg.profile?.lineage` are set on the parsed message.
- [ ] **PROF-07** — Registered Z-segments (via `customSegments`) are accessible by field name: `msg.segments('ZPI')[0].get('encounterId')`.
- [ ] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument overrides; `parseHL7(raw, { profile: null })` opts out for one call.
- [ ] **PROF-09** — Round-trip: a message parsed with a custom profile and re-serialized produces spec-clean HL7 (profile quirks affect parsing, not serialization).

### Built-in Profiles (BIP)

- [ ] **BIP-01** — `profiles.epic` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-02** — `profiles.cerner` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-03** — `profiles.meditech` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-04** — `profiles.athena` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-05** — `profiles.genericLab` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-06** — Each built-in profile reduces warnings on a realistic vendor-shape fixture versus lenient mode without a profile.

### Testing & Fixtures (TEST)

- [ ] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/helpers/`.
- [ ] **TEST-02** — Canonical fixtures exist and round-trip losslessly for: ADT^A01, ADT^A04, ADT^A08, ORU^R01, ORM^O01, SIU^S12, MDM^T02, at least one with Z-segments, at least one with repeating fields, at least one with nested subcomponents.
- [ ] **TEST-03** — Edge-case fixtures cover: CR/LF/CRLF/mixed line endings, trailing newline and none, empty and null fields, consecutive delimiters, unknown escapes, custom MSH delimiters, `\.br\` multi-line OBX values, Unicode, missing optional segments.
- [ ] **TEST-04** — Malformed messages throw `Hl7ParseError` with descriptive position/snippet (missing MSH, truncated MSH, invalid encoding chars, empty input).
- [ ] **TEST-05** — `test/fixtures/vendor-quirks/` contains at least one fixture per Tier 2 scenario listed in the spec, each verified to emit the expected warning and still parse in lenient mode.
- [ ] **TEST-06** — Strict-mode escalation test: every Tier 2 vendor-quirks fixture throws `Hl7ParseError` under `{ strict: true }`.
- [ ] **TEST-07** — At least one fixture per built-in profile (`epic`, `cerner`, `meditech`, `athena`, `genericLab`) demonstrates fewer warnings with the profile than without.
- [ ] **TEST-08** — Profile-authoring test suite covers: valid `defineProfile` output; `ProfileDefinitionError` cases; `extends` single + array; merge semantics per option category; default-profile set/get/opt-out; `profile.describe()`; `msg.profile` attribution; round-trip with custom profile.

### Examples (EX)

- [ ] **EX-01** — `examples/extract-patient-info.ts` runs end-to-end and demonstrates the named-helper access path.
- [ ] **EX-02** — `examples/read-lab-results.ts` runs end-to-end and demonstrates iterating `msg.observations()` / `msg.orders()`.
- [ ] **EX-03** — `examples/modify-and-resend.ts` runs end-to-end and demonstrates mutation + round-trip serialization.

### Profile Starter Kit (KIT)

- [ ] **KIT-01** — `examples/profile-starter-kit/` exists and contains every file listed in the spec's deliverable list.
- [ ] **KIT-02** — Running `pnpm install && pnpm test` inside the starter kit succeeds against its sample fixture.
- [ ] **KIT-03** — `pnpm build` inside the starter kit produces a `dist/` with correct entry points matching `package.json` exports.
- [ ] **KIT-04** — `.github/workflows/ci.yml` and `publish.yml` are syntactically valid (verified by `actionlint` or equivalent).
- [ ] **KIT-05** — Starter kit `package.json` has correct `peerDependencies` on `@cosyte/hl7-parser`, `publishConfig: { access: public }`, `files: [dist, ...]`, and working `build`/`test`/`lint` scripts.
- [ ] **KIT-06** — `CUSTOMIZING.md` is present and walks through the rename → swap base profile → define Z-segments → write fixtures → publish flow.
- [ ] **KIT-07** — Starter kit README uses `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistently.

### Documentation (DOC)

- [ ] **DOC-01** — README renders cleanly on GitHub and npm with the one-sentence value prop as the first line, followed by badges.
- [ ] **DOC-02** — README contains a 30-second quickstart (install + parse + extract a patient name) in one copy-pasteable block.
- [ ] **DOC-03** — README has a feature list (6–8 bullets) highlighting developer-centric wins.
- [ ] **DOC-04** — README has an "HL7 in 90 seconds" core-concepts section (≤ 2 paragraphs).
- [ ] **DOC-05** — README covers the three access patterns (helpers / paths / structural) with runnable examples.
- [ ] **DOC-06** — README Cookbook section contains every recipe listed in the spec (patient demographics, lab results, admit location, modify+reserialize, allergies, "Write your first profile in 10 minutes", extending a profile, composing profiles, publishing a profile package, default profile, non-standard timestamps, stripping MLLP framing, batch-file note, detect message type, pretty-print).
- [ ] **DOC-07** — README has a top-level "Profiles" section covering authoring, extending, merge semantics, inspection, publishing — not buried in API reference.
- [ ] **DOC-08** — README "Real-World Tolerance" section explains the 4-tier deviation model with a compact table and a runnable warnings-iteration example.
- [ ] **DOC-09** — README "Error Handling" section covers `Hl7ParseError`, `Hl7ParseWarning`, `ProfileDefinitionError` with examples.
- [ ] **DOC-10** — README "Contributing" section points to CONTRIBUTING.md and invites vendor quirk fixtures, profile improvements, and standalone profile packages.
- [ ] **DOC-11** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link.
- [ ] **DOC-12** — Roadmap/stretch goals section documents: typed message overlays, schema-aware validation, streaming parser, JSON Schema/Zod output, batch-file support, type-safe custom-segment fields.
- [ ] **DOC-13** — The "Publishing Your Profile" recipe links directly to `examples/profile-starter-kit/` and references `CUSTOMIZING.md`.
- [ ] **DOC-14** — CHANGELOG.md exists in Keep-a-Changelog format with an `[Unreleased]` section.
- [ ] **DOC-15** — LICENSE (MIT) exists at repo root.

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
| PARSE-01 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-02 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-03 | Phase 2 — Core Parser & Tolerance | Complete (02-04) |
| PARSE-04 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-05 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-06 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-07 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-08 | Phase 2 — Core Parser & Tolerance | Pending |
| PARSE-09 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-01 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-02 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-03 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-04 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-05 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-06 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-07 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-08 | Phase 2 — Core Parser & Tolerance | Pending |
| TOL-09 | Phase 2 — Core Parser & Tolerance | Pending |
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
| SER-01 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-02 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-03 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-04 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-05 | Phase 5 — Serialization & Round-Trip | Pending |
| SER-06 | Phase 5 — Serialization & Round-Trip | Pending |
| PROF-01 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-02 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-03 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-04 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-05 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-06 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-07 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-08 | Phase 6 — Profile System & Built-ins | Pending |
| PROF-09 | Phase 6 — Profile System & Built-ins | Pending |
| BIP-01 | Phase 6 — Profile System & Built-ins | Pending |
| BIP-02 | Phase 6 — Profile System & Built-ins | Pending |
| BIP-03 | Phase 6 — Profile System & Built-ins | Pending |
| BIP-04 | Phase 6 — Profile System & Built-ins | Pending |
| BIP-05 | Phase 6 — Profile System & Built-ins | Pending |
| BIP-06 | Phase 6 — Profile System & Built-ins | Pending |
| TEST-01 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-02 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-03 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-04 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-05 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-06 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-07 | Phase 7 — Testing Hardening & Fixtures | Pending |
| TEST-08 | Phase 7 — Testing Hardening & Fixtures | Pending |
| EX-01 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| EX-02 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| EX-03 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-01 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-02 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-03 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-04 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-05 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-06 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| KIT-07 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-01 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-02 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-03 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-04 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-05 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-06 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-07 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-08 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-09 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-10 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-11 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-12 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-13 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-14 | Phase 8 — Examples, Starter Kit & Documentation | Pending |
| DOC-15 | Phase 8 — Examples, Starter Kit & Documentation | Pending |

**Coverage:** 97 / 97 v1 REQ-IDs mapped (no orphans, no duplicates).

*Last updated: 2026-04-18 (traceability populated by roadmapper).*
