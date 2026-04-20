# Phase 7: Testing Hardening & Fixtures — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 promotes the existing test suite (753 tests green) from "well-tested"
to **demonstrably-contract-correct**. It adds the breadth of fixtures — canonical
message types, edge-case scenarios, vendor-quirk one-per-Tier-2, strict-mode
escalation sweep, and profile-authoring surface — plus a hard CI-enforced
coverage gate on the core modules.

**In scope (TEST-01..08):**

- **TEST-01** — `@vitest/coverage-v8` provider, per-directory thresholds
  (`src/parser/**`, `src/model/**`, `src/helpers/**` each ≥ 90% lines).
  Thresholds are a CI gate (build fails below floor). Ran via a dedicated
  `pnpm test:coverage` script invoked by CI; local `pnpm test` stays fast.
- **TEST-02** — Canonical round-trip fixtures for ADT^A01, ADT^A04, ADT^A08,
  ORU^R01, ORM^O01, SIU^S12, MDM^T02, plus three dedicated structural fixtures
  (Z-segment, repeating-field, nested-subcomponent). Round-trip means
  structural equivalence per Phase 5 SER-02 — not byte-clean.
- **TEST-03** — Edge-case fixtures covering CR/LF/CRLF/mixed line endings,
  trailing-newline handling, empty and null fields, consecutive delimiters,
  unknown escapes, custom MSH delimiters, `\.br\` multi-line OBX,
  Unicode, missing optional segments. Each scenario gets its own fixture file.
- **TEST-04** — Malformed-message tests for all 4 Tier-3 fatal codes
  (`NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`).
  Fixtures live in `test/fixtures/malformed/`.
- **TEST-05** — `test/fixtures/vendor-quirks/*.hl7` holds **one fixture per
  Tier-2 warning code** — 13 fixtures, one per code in `src/parser/warnings.ts`.
  Each fixture parses in lenient mode with the expected warning code present;
  filename encodes the code (kebab-case).
- **TEST-06** — Parameterized `describe.each` strict-mode escalation sweep
  over `vendor-quirks/*.hl7` — every fixture throws `Hl7ParseError` under
  `{ strict: true }`. One test file, auto-grows with fixture set.
- **TEST-07** — Built-in profile fixtures already exist
  (`test/fixtures/vendor-shapes/<vendor>/` — one per built-in from Phase 6
  BIP-06). Phase 7 inherits them; no new fixtures required beyond the
  Phase 6 minimum unless coverage gaps force it.
- **TEST-08** — Profile-authoring test suite already exists in Phase 6
  (`profiles-define.test.ts`, `profiles-extends.test.ts`,
  `profiles-custom-segments.test.ts`, `profiles-default.test.ts`,
  `profiles-builtins.test.ts`, `profiles-onwarning-chain.test.ts`). Phase 7
  audits the suite against TEST-08's enumerated cases and fills any gap —
  no wholesale rewrite.

**Out of scope (belongs to other phases or v2):**

- Mutation-testing, property-based testing (fast-check) — not in v1.
- Performance benchmarks / perf regression tests — v2.
- Cross-Node-version CI matrix beyond Node 18+ baseline — Phase 1 / CI
  already handles the baseline; Phase 7 does not add matrix jobs.
- Browser/React Native test environments — v2.
- Fixture generation tooling (faker-style random HL7 generator) — v2.
- Public fixtures package / separate test-fixtures npm publish — v2.
- Snapshot testing of entire parse trees — use targeted assertions instead
  (brittle snapshots hurt more than they help in a parser).
- New warning codes or new fatal codes — forbidden (Phase 5 D-27/D-28,
  Phase 6 D-31 carry forward).
- Any runtime dep addition (`@vitest/coverage-v8` is a dev-only dep and
  acceptable).

**Compose, don't reach through.** Phase 7 builds on every prior phase's
surface:

- **Phase 1 toolchain** — CI workflow (`.github/workflows/ci.yml`) gains
  a `pnpm test:coverage` invocation. `vitest.config.ts` gains `coverage`
  block.
- **Phase 2 parser + tolerance** — canonical/edge-case fixtures parse
  through `parseHL7`; strict-mode sweep drives `parseHL7(raw, { strict: true })`.
- **Phase 3 model** — canonical helper probes (TEST-02 assertions on
  `msg.patient`, `msg.observations()`, etc.) exercise the dot-path + wrappers.
- **Phase 5 serializer** — round-trip assertions use the structural
  equivalence rule from Phase 5 SER-02.
- **Phase 6 profiles** — vendor-shapes/ fixtures remain untouched; profile
  suite remains untouched absent an audit gap.

</domain>

<decisions>
## Implementation Decisions

### Coverage gate (TEST-01)

- **D-01: `@vitest/coverage-v8` as the provider.** Native V8 coverage,
  faster than istanbul, one dev-only package. Zero runtime deps preserved.
- **D-02: Per-directory thresholds, not global.** `vitest.config.ts`
  `coverage.thresholds` block declares:
  - `'src/parser/**'` → lines/branches/functions ≥ 90%
  - `'src/model/**'` → lines/branches/functions ≥ 90%
  - `'src/helpers/**'` → lines/branches/functions ≥ 90%
  - Other `src/` (profiles, serialize, types, index) — reported but
    ungated. Matches `CLAUDE.md` "Coverage target: ≥ 90% on `src/parser/`,
    `src/model/`, `src/helpers/`" exactly.
- **D-03: Coverage is a hard CI gate.** `pnpm test:coverage` (see D-04)
  exits non-zero below threshold; CI workflow invokes it; build fails on
  regression. Local `pnpm test` stays fast — no coverage overhead by
  default.
- **D-04: `pnpm test:coverage` is a dedicated script.** `package.json`
  `scripts.test:coverage` = `vitest run --coverage`. `scripts.test` is
  untouched (`vitest run`). CI calls the coverage script; devs opt in
  locally. Preserves the `pnpm install && pnpm build && pnpm typecheck
  && pnpm lint && pnpm test` sanity chain from Phase 1 without slowing it.
- **D-05: Coverage reports both `text` and `lcov`.** Console summary for
  humans (`text` reporter); `lcov` for future Codecov/Coveralls integration
  (neither required in v1, but cheap to emit now). HTML reporter also
  enabled under `coverage.reporter` for local debugging — output goes to
  `coverage/` (already implicitly gitignored via standard `.gitignore`
  patterns; planner verifies).
- **D-06: Exclusions — keep them minimal.** `coverage.exclude` adds the
  standard `**/*.d.ts`, `**/index.ts` barrel files (pure re-exports),
  `test/**`, `dist/**`. Planner audits each barrel to confirm it's re-export
  only; if any barrel has conditional/runtime logic, it stays in scope.

### Fixture directory layout (TEST-02..07)

- **D-07: One directory per concern under `test/fixtures/`.** Final layout:
  ```
  test/fixtures/
    canonical/          # TEST-02 — 7 message types + 3 structural
    edge-cases/         # TEST-03
    vendor-quirks/      # TEST-05/06 — one per Tier-2 code
    malformed/          # TEST-04 — 4 fatal-error scenarios
    vendor-shapes/      # Phase 6 BIP-06 (unchanged) — TEST-07
      epic/, cerner/, meditech/, athena/, genericLab/
  ```
  Each TEST-* requirement maps to one dir; easy to audit.
- **D-08: Migrate existing `round-trip/`.** Rename
  `test/fixtures/round-trip/` → `test/fixtures/canonical/`. Then:
  - `canonical-adt-a01.hl7` → `canonical/adt-a01.hl7` (drop the
    redundant `canonical-` prefix now that the dir name supplies it).
  - `oru-r01-repetitions.hl7` → `canonical/oru-r01.hl7` — kept in
    canonical/; its repeating-field content doubles as the
    TEST-02 "repeating-field" structural fixture (see D-10).
  - `decoded-br.hl7` → `edge-cases/decoded-br.hl7` (demonstrates
    `\.br\` multi-line OBX, an edge case — not a canonical message
    shape).
  - `embedded-delimiters.hl7` → `edge-cases/embedded-delimiters.hl7`
    (demonstrates delimiter escaping within field content — edge
    case).
  - `null-fields.hl7` → `edge-cases/null-fields.hl7` (demonstrates
    `""` null-field marker — edge case).
  Planner updates the tests that load these files (grep for
  `round-trip/` in `test/` first).
- **D-09: kebab-case filenames, message type first.** Examples:
  `canonical/adt-a01.hl7`, `canonical/mdm-t02.hl7`,
  `edge-cases/mixed-crlf.hl7`, `edge-cases/unicode-names.hl7`,
  `vendor-quirks/mllp-framing-stripped.hl7`,
  `malformed/no-msh-segment.hl7`. Sortable, greppable, consistent
  with existing `canonical-adt-a01.hl7` / `oru-r01-repetitions.hl7`
  style.
- **D-10: Canonical fixture breakdown.** Final `canonical/` contents:
  - `adt-a01.hl7`, `adt-a04.hl7`, `adt-a08.hl7` — the three ADT flavors
  - `oru-r01.hl7` — inherits repetitions from the existing fixture;
    doubles as the "repeating-field" structural case
  - `orm-o01.hl7` — new
  - `siu-s12.hl7` — new
  - `mdm-t02.hl7` — new
  - `z-segments.hl7` — dedicated Z-segment structural fixture (can be
    built atop an ADT^A01 body + `ZXX` segments declared ad-hoc; does
    NOT use a profile — raw Z parsing is the point)
  - `nested-subcomponents.hl7` — dedicated nested-subcomponent
    structural fixture (subcomponent separator `&` nested under a
    component)
  10 files total in canonical/. The "repeating-field" TEST-02 sub-requirement
  is satisfied by `oru-r01.hl7`'s inherited repetitions — no separate
  `repeating-fields.hl7` file needed.
- **D-11: Fixture discovery — fs-scan by convention.** Test files use
  `fs.readdirSync` (or vitest's `import.meta.glob` equivalent where
  applicable) over the fixture directory + `describe.each` to iterate.
  No manifest files. Adding a fixture automatically joins the sweep.
  Each fixture directory carries a `README.md` explaining what the
  fixtures demonstrate and the filename-code contract (for
  `vendor-quirks/` and `malformed/`).

### Tier-2 scenarios — vendor-quirks set (TEST-05, TEST-06)

- **D-12: Filename is the kebab-case of the expected warning code.**
  `vendor-quirks/mllp-framing-stripped.hl7` → expected code
  `MLLP_FRAMING_STRIPPED`. Tests derive the expected code by
  uppercase-snake-casing the basename. Single source of truth;
  no sidecar files; no front-matter preprocessing.
- **D-13: One fixture per Tier-2 warning code — 13 fixtures.** Planner
  cross-references `src/parser/warnings.ts::WARNING_CODES` (the canonical
  list) with TOL-03's scenario enumeration and authors exactly one
  fixture per code. Expected filenames (planner confirms against actual
  code list):
  - `mllp-framing-stripped.hl7` (MLLP_FRAMING_STRIPPED)
  - `segment-name-case.hl7` (SEGMENT_NAME_CASE or equivalent)
  - `extra-fields.hl7` (EXTRA_FIELDS)
  - `unknown-segment.hl7` (UNKNOWN_SEGMENT)
  - `timestamp-fallback-format.hl7` (TIMESTAMP_FALLBACK_FORMAT)
  - `field-whitespace-trimmed.hl7` (FIELD_WHITESPACE_TRIMMED)
  - `duplicate-required-segment.hl7` (DUPLICATE_REQUIRED_SEGMENT)
  - `encoding-mismatch.hl7` (ENCODING_MISMATCH)
  - `missing-required-field.hl7` (MISSING_REQUIRED_FIELD)
  - `out-of-order-segment.hl7` (OUT_OF_ORDER_SEGMENT)
  - `unknown-escape-sequence.hl7` (UNKNOWN_ESCAPE_SEQUENCE)
  - `version-mismatch.hl7` (VERSION_MISMATCH)
  - `unknown-charset.hl7` (UNKNOWN_CHARSET)
  The planner MUST verify each code name exists in
  `src/parser/warnings.ts` and adjust filenames to match. Any
  mismatch is a spec error — fix the spec, not the code list.
- **D-14: Each fixture isolates ONE quirk.** Fixtures aim to trigger
  exactly the named warning and no others, so assertions stay tight.
  Unavoidable co-triggers (e.g., an MLLP-wrapped message may also
  trigger whitespace-trim) are documented in the `README.md` and
  asserted `.toContain(code)` rather than `.toEqual([code])`.
- **D-15: Parameterized strict-mode sweep in
  `test/parser-strict-mode-sweep.test.ts`.** One file, one
  `describe.each` over `vendor-quirks/*.hl7`:
  ```ts
  const fixtures = fs.readdirSync(VQ_DIR).filter(f => f.endsWith('.hl7'));
  describe.each(fixtures)('%s', (file) => {
    const raw = fs.readFileSync(path.join(VQ_DIR, file), 'utf-8');
    const expectedCode = fileToCode(file);  // kebab → SNAKE_UPPER
    it('parses in lenient mode with expected warning', () => {
      const msg = parseHL7(raw);
      expect(msg.warnings.map(w => w.code)).toContain(expectedCode);
    });
    it('throws Hl7ParseError in strict mode', () => {
      expect(() => parseHL7(raw, { strict: true })).toThrow(Hl7ParseError);
    });
  });
  ```
  Adding a new vendor-quirks fixture auto-joins the sweep. No
  hand-maintained list.
- **D-16: Add fixtures regardless of existing unit-test coverage.**
  TEST-05 is a spec contract, not a coverage check. Existing
  `test/parser-warnings.test.ts` / `test/parser-errors.test.ts` /
  `test/parser-mllp.test.ts` / etc. stay — the fixture sweep is
  additive, and doubles as documentation (the `vendor-quirks/` dir
  IS the canonical "here's what this library handles" reference).

### Canonical breadth (TEST-02)

- **D-17: Canonical fixtures authored from publicly-documented
  samples.** Source: HL7 v2.5 / v2.5.1 example chapters, publicly
  available vendor interface documentation (Epic Bridges, Cerner
  Millennium, etc.) — NOT real messages. Patient identifiers are
  synthetic (`Doe^John^Q`, `Smith^Jane^A`, MRN `MRN12345` /
  `MRN-A01-001`). No PHI; no anonymized real messages; trivially
  redistributable under MIT. Each fixture is a complete, structurally
  valid message with every required segment field populated.
- **D-18: Three dedicated structural fixtures — Z-segment,
  nested-subcomponent.** (Plus oru-r01.hl7 covering repeating-field
  per D-10.)
  - `canonical/z-segments.hl7` — an ADT^A01 body with two custom
    Z-segments (e.g., `ZXX`, `ZYY`). Raw-parse only; no profile
    applied. Asserts: parse succeeds, `UNKNOWN_SEGMENT` warning
    emitted for each, `msg.allSegments()` returns both.
  - `canonical/nested-subcomponents.hl7` — a message with a field
    using the nested subcomponent separator (`&` under `^`). E.g.,
    `PID-5` with `Doe^John^Q^Jr^^Dr^^&Jones&Alias&&&` showing the
    component-subcomponent nesting. Asserts: subcomponent access via
    `seg.field(n).component(c).subcomponent(s)` resolves correctly.
- **D-19: Round-trip assertion = structural equivalence per Phase 5
  SER-02.** Each canonical test asserts:
  ```ts
  const msg = parseHL7(raw);
  const reparsed = parseHL7(msg.toString());
  // Structural equivalence — same segments, fields, reps, components
  expect(reparsed.rawSegments).toStructurallyEqual(msg.rawSegments);
  ```
  Planner confirms whether a `toStructurallyEqual` helper already
  exists (Phase 5 likely landed one); if not, the planner adds a
  small custom matcher or uses deep equality on a normalized subset.
  Byte-clean identity is NOT required — fixtures with MLLP frames,
  mixed line endings, etc. are intentionally out of scope for
  canonical/ and live in edge-cases/ where byte-clean round-trip
  is NOT expected.
- **D-20: Each canonical test exercises helpers (happy path).** For
  every canonical message-type fixture, the test asserts at least
  one helper read that's natural for that message type:
  - `adt-a01.hl7` → `msg.patient.mrn` and `msg.visit.patientClass`
    non-undefined
  - `adt-a04.hl7` → `msg.patient.mrn` non-undefined
  - `adt-a08.hl7` → `msg.patient.mrn` non-undefined (update flavor)
  - `oru-r01.hl7` → `msg.observations().length > 0`, first obs has
    `.valueType` populated
  - `orm-o01.hl7` → `msg.orders().length > 0`
  - `siu-s12.hl7` → parse + round-trip only (no helper for
    scheduling in v1)
  - `mdm-t02.hl7` → parse + round-trip only (no helper for
    documents in v1)
  - `z-segments.hl7`, `nested-subcomponents.hl7` → structural
    assertions only, no helper call
  Double duty: canonical tests drive helpers/ coverage and prove
  the library's one-line DX.

### Edge-case breadth (TEST-03)

- **D-21: One fixture per edge-case scenario listed in TEST-03.**
  Planner authors:
  - `edge-cases/lf-line-endings.hl7`
  - `edge-cases/crlf-line-endings.hl7`
  - `edge-cases/mixed-line-endings.hl7`
  - `edge-cases/trailing-newline.hl7`
  - `edge-cases/no-trailing-newline.hl7`
  - `edge-cases/empty-fields.hl7`
  - `edge-cases/null-fields.hl7` (migrated from round-trip/)
  - `edge-cases/consecutive-delimiters.hl7`
  - `edge-cases/unknown-escapes.hl7`
  - `edge-cases/custom-msh-delimiters.hl7` (e.g., `@~&#` instead of
    `^~\&`)
  - `edge-cases/decoded-br.hl7` (migrated)
  - `edge-cases/embedded-delimiters.hl7` (migrated)
  - `edge-cases/unicode-names.hl7` (e.g., UTF-8 patient names with
    accents / CJK characters)
  - `edge-cases/missing-optional-segments.hl7` (ADT^A01 without
    PV1 — common in real-world flows)
  Each has a companion test case asserting the parser handles it
  without crashing and with the expected warning surface (if any).
- **D-22: `edge-cases/` tests are NOT parameterized over fs-scan.**
  Unlike vendor-quirks/, each edge case has a unique assertion
  surface — no uniform "expected code = filename" rule. Tests live
  in `test/parser-edge-cases.test.ts` (planner may split into
  multiple files if it grows) and each edge case gets an explicit
  `it(...)` block with targeted assertions.

### Malformed (TEST-04)

- **D-23: One fixture per Tier-3 fatal code — 4 files total.**
  - `malformed/no-msh-segment.hl7` → throws `Hl7ParseError` code
    `NO_MSH_SEGMENT`
  - `malformed/msh-too-short.hl7` → throws code `MSH_TOO_SHORT`
  - `malformed/invalid-encoding-characters.hl7` → throws code
    `INVALID_ENCODING_CHARACTERS`
  - `malformed/empty-input.hl7` → empty file; throws `EMPTY_INPUT`
  Assertions verify `error.code`, `error.position`, `error.snippet`
  all populated (per TEST-04 spec).
- **D-24: Malformed sweep follows vendor-quirks pattern.**
  Parameterized test in `test/parser-malformed-sweep.test.ts` over
  `malformed/*.hl7` with filename → expected fatal code mapping.
  Throws even in lenient mode (Tier-3 semantics).

### Profile-authoring audit (TEST-08)

- **D-25: Phase 7 audits, does not rewrite, the Phase 6 profile test
  suite.** The 6 existing profile test files
  (`profiles-define/extends/custom-segments/default/builtins/onwarning-chain`)
  already cover `defineProfile` validation, `extends` single+array,
  merge semantics, default-profile set/get/opt-out, `describe()`,
  `msg.profile` attribution, and round-trip. Phase 7 produces a
  small audit doc mapping each TEST-08 bullet to the test file(s)
  that cover it. Any gap gets one new test added to the relevant
  file — NO new profile-authoring test files unless forced.
- **D-26: Profile-authoring audit lives in
  `.planning/phases/07-testing-hardening-and-fixtures/TEST-08-AUDIT.md`**
  (temporary planning artifact, not a shipped file). Generated during
  the phase; discarded / summarized into the verifier report at
  phase close.

### Shared conventions

- **D-27: No new warning codes or fatal codes.** Phase 6 D-31 +
  Phase 5 D-27/D-28 + PROJECT.md carry forward. Phase 7 tests the
  existing codes; it does not mint new ones.
- **D-28: Zero new runtime deps.** `@vitest/coverage-v8` is a dev dep.
  Any custom test helpers (fs-scan, code-name-derivation, structural
  equality matcher) are inlined in `test/_helpers/`.
- **D-29: Test helper location is `test/_helpers/`.** Underscore
  prefix signals "internal, not a test file" to vitest's default
  include pattern (`test/**/*.test.ts`) so helpers don't run as
  tests. Planner confirms the include pattern excludes `_helpers/`
  or names files `.ts` (not `.test.ts`) so they're auto-excluded.
- **D-30: CI workflow adds coverage step.** `.github/workflows/ci.yml`
  gains a step running `pnpm test:coverage` after the existing
  install/build/typecheck/lint/test chain (or replaces the `test`
  step with `test:coverage` in CI only — planner decides based on
  CI runtime budget; the dedicated-script approach in D-04 suggests
  running it as a separate step for visibility).

### Claude's Discretion

- Exact vitest `coverage.reporter` tuple (text / html / lcov /
  json) beyond D-05's text + lcov baseline. Planner picks based on
  CI integration plans.
- Whether `coverage/` goes in `.gitignore` explicitly (D-05 note
  says "implicitly" — planner verifies against current
  `.gitignore`).
- Whether `test/parser-strict-mode-sweep.test.ts` and
  `test/parser-malformed-sweep.test.ts` are one file or two
  (D-15, D-24). Recommendation: two — the mode (lenient+warning vs
  fatal) is semantically distinct.
- Whether `describe.each` uses raw filenames or a generated
  `{ file, code }` pair for nicer test output. Recommendation:
  pair-form for readable `--reporter=verbose` output.
- Exact README.md content per fixture dir beyond "what these
  fixtures demonstrate + filename contract".
- Whether the structural-equivalence matcher (D-19) is a new
  custom matcher (`expect.extend({ toStructurallyEqual })`) or a
  free function (`assertStructurallyEqual(a, b)`). Planner picks
  whichever keeps call sites readable.
- Whether SIU^S12 and MDM^T02 canonical tests include any
  meaningful helper probe beyond parse + round-trip (D-20).
  Recommendation: no — v1 has no helpers for scheduling or
  documents, so the canonical fixture exists to prove parse
  coverage, not helper coverage.
- Whether edge-cases/ tests that assert a warning use
  `.toContain(code)` or `.toEqual(expect.arrayContaining([code]))`.
  Both are fine; pick one and stay consistent.
- CI step ordering (whether coverage runs before or after lint /
  typecheck). Recommendation: after, so fast-failing checks run
  first.
- Whether `test/_helpers/` is in the vitest include pattern or
  excluded by name-filtering. Planner picks the cleanest config.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints

- `.planning/PROJECT.md` — Key Decisions (Postel's Law; zero runtime
  deps; 4 fatal codes; conservative emitter).
- `CLAUDE.md` — Engineering guardrails, coverage target (≥ 90% on
  `src/parser/`, `src/model/`, `src/helpers/`), strict TS, zero
  runtime deps.

### Requirements (locked acceptance criteria)

- `.planning/REQUIREMENTS.md` §Testing — TEST-01..08 (coverage gate,
  canonical round-trip fixtures, edge cases, malformed errors,
  vendor-quirks per Tier-2, strict-mode sweep, profile fixture,
  profile-authoring suite).
- `.planning/REQUIREMENTS.md` §Tolerance — TOL-01..10 (Tier-2 scenario
  list for vendor-quirks fixture set; Tier-3 fatal codes for
  malformed fixtures).

### Roadmap & success criteria

- `.planning/ROADMAP.md` — Phase 7 goal (≥ 90% coverage + breadth
  fixtures) + 5 success criteria; parallelization note (fixture
  authoring is independent across contributors; coverage
  enforcement + strict-mode sweep are capstone plans).
- `.planning/STATE.md` — current position (Phase 6 verified, Phase 7
  next).

### Prior phase artifacts — Phase 1 (toolchain)

- `package.json` — `scripts.test` = `vitest run`. Phase 7 adds
  `scripts.test:coverage` = `vitest run --coverage`; does NOT
  change `scripts.test`.
- `vitest.config.ts` — current config. Phase 7 adds `coverage`
  block with provider, per-dir thresholds, reporters, exclusions.
- `.github/workflows/ci.yml` — current CI. Phase 7 adds a coverage
  step invoking `pnpm test:coverage`.
- `.gitignore` — Phase 7 confirms `coverage/` is ignored (add
  explicitly if not already matched).

### Prior phase artifacts — Phase 2 (parser + warnings + errors)

- `src/parser/warnings.ts::WARNING_CODES` — the 13 Tier-2 codes.
  CANONICAL source for `vendor-quirks/` fixture filename set
  (D-13). Planner cross-references this list when authoring
  fixtures.
- `src/parser/errors.ts::Hl7ParseError` — 4 fatal codes
  (`NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`,
  `EMPTY_INPUT`). Malformed fixtures (D-23) target exactly these.
- `src/parser/index.ts::parseHL7` — the parse entry. All Phase 7
  fixture tests call through this; no test reaches into internal
  tokenize/normalize modules except existing Phase 2 unit tests.
- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` —
  Phase 2 decisions on warning emission and strict-mode
  escalation; TOL-01 semantics.

### Prior phase artifacts — Phase 3 (model)

- `src/model/*` — structural coverage target. Phase 7 exercises
  dot-path, segments, fields, composites via canonical tests.
- `.planning/phases/03-structural-model-and-types/03-CONTEXT.md` —
  wrapper cache behavior (D-11/D-12); informs what Phase 7's
  canonical tests should exercise.

### Prior phase artifacts — Phase 4 (helpers)

- `src/helpers/*` — helpers coverage target. Phase 7 canonical
  tests exercise `msg.patient`, `msg.visit`, `msg.observations()`,
  `msg.orders()` per D-20.
- `.planning/phases/04-named-helpers/04-CONTEXT.md` — helpers
  contract; HELPERS-01..07 semantics.

### Prior phase artifacts — Phase 5 (serializer + round-trip)

- `.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md` —
  D-08 `toString` never wraps MLLP; SER-02 structural-equivalence
  round-trip rule (D-19 here uses it).
- `src/serialize/*` — `toString` is the round-trip target; `toJSON`
  also exercised by canonical tests if planner adds JSON snapshot
  smoke checks.
- `test/round-trip.test.ts` — existing fixture sweep; Phase 7
  extends or replaces it depending on D-08 migration planning.

### Prior phase artifacts — Phase 6 (profiles)

- `.planning/phases/06-profile-system-and-built-ins/06-CONTEXT.md` —
  D-27 vendor-shapes fixture convention; D-28 per-warning-code
  fixture-parity assertion style; D-31 no new warning codes
  (Phase 7 carries this forward).
- `test/profiles-*.test.ts` (6 files) — TEST-08 coverage target;
  Phase 7 audits these against TEST-08 enumeration and fills gaps
  per D-25.
- `test/fixtures/vendor-shapes/<vendor>/` — TEST-07 minimum
  already satisfied by Phase 6 BIP-06; Phase 7 inherits untouched.

### Existing test conventions

- `test/*.test.ts` — current file layout. Phase 7 adds:
  - `test/parser-strict-mode-sweep.test.ts` (D-15)
  - `test/parser-malformed-sweep.test.ts` (D-24)
  - `test/parser-edge-cases.test.ts` (D-22)
  - `test/canonical-messages.test.ts` (D-20 — one describe block
    per message type; planner may split)
  - Possibly updates `test/round-trip.test.ts` to reference the
    migrated canonical/ dir.
- `test/fixtures/round-trip/` — existing 5 files; migrated per
  D-08.

### External specs (reference only)

- HL7 v2.5 / v2.5.1 chapter 3 (ADT), 7 (ORU), 4 (ORM), 10 (SIU),
  9 (MDM) — structural definitions for canonical fixture
  authoring. NOT vendored in repo.
- Vitest coverage docs —
  https://vitest.dev/guide/coverage.html — for the `coverage`
  config block shape, thresholds-per-path syntax, reporter
  options.
- @vitest/coverage-v8 README — install + dev-dep registration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/parser/warnings.ts::WARNING_CODES` — source of truth for the
  13 Tier-2 codes (D-13). Exported const; filenames in
  `vendor-quirks/` derive from it.
- `src/parser/errors.ts::Hl7ParseError` — 4 fatal codes; malformed
  fixtures (D-23) target these exclusively.
- `src/parser/index.ts::parseHL7` — the sole parse entry for all
  Phase 7 fixture tests.
- Existing `test/fixtures/round-trip/` 5 files — 1 kept (renamed),
  3 migrated to edge-cases/, 1 (`oru-r01-repetitions.hl7`) kept
  and doubles as canonical repeating-field (D-10).
- Existing `test/fixtures/vendor-shapes/<vendor>/` — Phase 6 BIP-06
  artifacts; Phase 7 leaves untouched.
- `test/round-trip.test.ts` — existing round-trip sweep; update to
  reference canonical/ paths (D-08).

### Established Patterns

- **`vitest run` as the canonical test invocation** (Phase 1). Phase 7
  adds `vitest run --coverage` via `test:coverage` script; does not
  change the baseline `test` script.
- **Per-feature test files** (`test/parser-*.test.ts`,
  `test/helpers-*.test.ts`, `test/model-*.test.ts`,
  `test/profiles-*.test.ts`, `test/types-*.test.ts`,
  `test/serialize-*.test.ts`). Phase 7 adds fixture-sweep and
  canonical-messages files under this same convention.
- **Zero new runtime deps, dev deps as needed** (Phase 1 + Phase 6
  D-33). `@vitest/coverage-v8` is acceptable dev dep.
- **Fixtures live in `test/fixtures/<concern>/`** (established in
  Phase 5 round-trip/ + Phase 6 vendor-shapes/). Phase 7 extends
  this convention with canonical/, edge-cases/, vendor-quirks/,
  malformed/.
- **Filename encodes intent** (Phase 6 `adt-a01.hl7`,
  `oru-r01-repetitions.hl7`). Phase 7 codifies via D-12
  (vendor-quirks filename = kebab-case warning code).
- **Synthetic data, no PHI** (Phase 6 D-27). Phase 7 carries this
  forward explicitly in D-17.

### Integration Points

- `vitest.config.ts` — GAINS `coverage` block (D-02, D-05, D-06).
- `package.json` — GAINS `test:coverage` script; `devDependencies`
  gains `@vitest/coverage-v8`.
- `.github/workflows/ci.yml` — GAINS coverage step (D-30).
- `.gitignore` — may need `coverage/` line added (D-05 verifies).
- `test/fixtures/round-trip/` → renamed to `test/fixtures/canonical/`,
  3 files moved to `test/fixtures/edge-cases/` (D-08). Requires
  grep for `round-trip/` in existing tests + update paths.
- `test/fixtures/edge-cases/`, `test/fixtures/vendor-quirks/`,
  `test/fixtures/malformed/` — NEW directories. Each gets a
  `README.md`.
- `test/_helpers/` — NEW directory for shared test utilities
  (structural-equality matcher, fixture loader, code-name
  derivation from filename).
- `test/parser-strict-mode-sweep.test.ts`,
  `test/parser-malformed-sweep.test.ts`,
  `test/parser-edge-cases.test.ts`,
  `test/canonical-messages.test.ts` — NEW test files.

</code_context>

<specifics>
## Specific Ideas

- **Canonical fixture `adt-a01.hl7` one-liner acceptance shape:**
  ```hl7
  MSH|^~\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5
  EVN|A01|20260419101500
  PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212
  PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001
  ```
  Test: `parseHL7(raw).patient.mrn === 'MRN12345'` and
  `.visit.patientClass === 'I'`.

- **Vendor-quirks `mllp-framing-stripped.hl7` acceptance shape:**
  Message wrapped in raw MLLP bytes (`0x0B` + body + `0x1C` + `0x0D`).
  Test:
  ```ts
  expect(parseHL7(raw).warnings.map(w=>w.code))
    .toContain('MLLP_FRAMING_STRIPPED');
  expect(() => parseHL7(raw, { strict: true }))
    .toThrow(Hl7ParseError);
  ```

- **Malformed `empty-input.hl7` acceptance:**
  Empty file (0 bytes). Test:
  ```ts
  expect(() => parseHL7(raw)).toThrowError(
    expect.objectContaining({ code: 'EMPTY_INPUT' })
  );
  ```

- **`vitest.config.ts` coverage block shape** (planner finalizes
  syntax against the actual vitest/coverage-v8 API):
  ```ts
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    exclude: ['**/*.d.ts', '**/index.ts', 'test/**', 'dist/**'],
    thresholds: {
      'src/parser/**': { lines: 90, branches: 90, functions: 90 },
      'src/model/**': { lines: 90, branches: 90, functions: 90 },
      'src/helpers/**': { lines: 90, branches: 90, functions: 90 },
    },
  },
  ```

- **`test/_helpers/fixture-code.ts`** — a single 5-line helper:
  ```ts
  export function fileToWarningCode(filename: string): string {
    return filename
      .replace(/\.hl7$/, '')
      .replace(/-/g, '_')
      .toUpperCase();
  }
  ```

- **Structural equivalence matcher** — if Phase 5 hasn't already
  landed one, inline a small helper:
  ```ts
  export function structuralRoundTrip(raw: string): void {
    const a = parseHL7(raw);
    const b = parseHL7(a.toString());
    expect(b.rawSegments).toEqual(a.rawSegments);
  }
  ```

- **CI coverage step skeleton** for `.github/workflows/ci.yml`:
  ```yaml
  - name: Coverage
    run: pnpm test:coverage
  ```
  Positioned after existing test step (or replacing it if the
  planner deems test+coverage redundant — recommendation: keep
  both, test is fast feedback, coverage is the gate).

- **Parallelization hint for the planner** — fixture-authoring
  plans (canonical/, edge-cases/, vendor-quirks/, malformed/) are
  independent; each can be a separate plan running in parallel.
  Coverage-gate plan (vitest config + CI) is a capstone plan that
  runs after fixtures are in place (otherwise it fails CI on
  itself). TEST-08 audit plan is independent from fixture plans.

</specifics>

<deferred>
## Deferred Ideas

- **Mutation testing** (Stryker etc.) — v2. Catches "tests that
  pass but assert nothing" but adds a heavy dep.
- **Property-based testing** (fast-check) — v2. Would shine on
  parser/serializer round-trip invariants but requires a new dev
  dep + learning curve.
- **Perf benchmarks / regression** — v2. Parser throughput
  benchmarks would be valuable but aren't in TEST-01..08.
- **Cross-Node version CI matrix** (Node 18, 20, 22) — beyond v1.
  Phase 1 baseline handles Node 18+ on one runner; Phase 7 doesn't
  add matrix.
- **Browser / React Native / Deno compatibility tests** — v2.
- **Snapshot testing of parse trees** — intentionally rejected.
  Brittle; disguises regressions.
- **Fixture generation tooling** (random HL7 generator) — v2.
- **Public fixtures npm package** — v2.
- **Codecov / Coveralls integration** — out of scope for Phase 7;
  lcov reporter is emitted (D-05) so future integration is
  one-config-line away.
- **Coverage thresholds on `src/serialize/` and `src/profiles/`**
  — deferred. Phase 7 threshold scope matches CLAUDE.md exactly
  (parser, model, helpers). Profiles/serialize coverage is
  reported but ungated; if real-world usage reveals gaps, a
  follow-up phase can tighten the gate.
- **Per-fixture README.md with hand-written narratives** — Phase 7
  ships one README.md per dir, not per fixture. Per-fixture
  descriptions live in the filename + a comment at top of each
  `.hl7` file if needed (but HL7 has no comment syntax, so
  descriptions stay in the dir README).
- **Fixtures exercising every helper corner case** — helper
  breadth testing lives in `test/helpers-*.test.ts` from Phase 4.
  Phase 7 canonical tests hit one happy-path helper per message
  type (D-20); they do not try to fuzz helpers.
- **`test/fixtures/vendor-shapes/<vendor>/` expansion beyond one
  fixture per built-in** — Phase 6 BIP-06 shipped the minimum.
  Phase 7 does NOT expand absent a coverage/CI gap; if a gap
  surfaces during execution, the plan can add a second
  fixture per vendor, but it's not the default.
- **Fuzz-style malformed inputs beyond the 4 Tier-3 codes** —
  random garbage, gigantic inputs, binary blobs. Not required by
  TEST-04; v2.
- **Helper-level fixture library** (`test/fixtures/patients/...`,
  `test/fixtures/observations/...`) — v2. Phase 7 tests exercise
  helpers through canonical message fixtures, not dedicated
  per-helper fixture trees.
- **Multi-encoding fixtures** (ISO-8859-1, UTF-16) — edge-cases/
  focuses on UTF-8 + ASCII. Non-UTF-8 encoding tests may land as
  a follow-up if real-world usage reveals need.
- **E2E tests driving the CLI** — no CLI in v1; not applicable.
- **Integration tests hitting a real HL7 interface engine** —
  out of scope; v1 is a parser library, not an integration
  product.

</deferred>

---

*Phase: 07-testing-hardening-and-fixtures*
*Context gathered: 2026-04-19*
