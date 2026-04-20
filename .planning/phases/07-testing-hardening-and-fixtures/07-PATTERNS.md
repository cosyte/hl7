# Phase 7: Testing Hardening & Fixtures — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** ~55 (4 config/CI, ~30 fixtures, ~5 READMEs, 4 test files, 1–2 helpers, 1 audit doc)
**Analogs found:** All config/CI + existing test files have strong in-tree analogs. Fixture analogs exist for canonical/edge-cases; vendor-quirks/malformed have no direct analogs but derive mechanically from `src/parser/warnings.ts` + `src/parser/errors.ts`.

**IMPORTANT reconciliation notes discovered during mapping** (planner must act on these in plan decisions):

1. **`package.json` already contains `"test:coverage": "vitest run --coverage"`** (line 59) **and** `@vitest/coverage-v8` as a devDependency (line 67). No package.json edits are needed for D-01/D-04 — they landed in Phase 1. Plans must VERIFY this rather than duplicate.
2. **`vitest.config.ts` already contains a `coverage` block** (lines 20–76) with `provider: 'v8'`, `reporter: ['text', 'html', 'lcov']`, and per-directory thresholds for `src/parser/**`, `src/model/**`, `src/helpers/**`, `src/serialize/**`, `src/builder/**` — all at lines: 90, branches: 85, functions: 90, statements: 90. Phase 1 authored this as "declared now, Phase 7 flips the switch." The thresholds are CURRENTLY ACTIVE because vitest's v8 coverage provider treats `thresholds` as hard gates whenever `--coverage` runs. Planner MUST verify by running `pnpm test:coverage` and surfacing the actual percentages, not assume a flip is needed.
3. **`vitest.config.ts` goes BEYOND CLAUDE.md's stated scope** — CLAUDE.md caps the 90% target at `src/parser/`, `src/model/`, `src/helpers/`; current config also gates `src/serialize/**` and `src/builder/**`. Phase 7 CONTEXT.md D-02 scopes thresholds to parser/model/helpers only; D-06 says "Other `src/` … — reported but ungated." **This is a reconciliation decision point.** Options: (a) keep the Phase 1 broader gate (tighter than CONTEXT says), (b) strip serialize/builder per CONTEXT.md D-02. Planner decides; recommend (a) because Phase 5/6 tests already stress serialize/builder heavily and the gate is currently passing (753 tests green).
4. **`.gitignore` already contains `coverage/`** (existing `# Test / coverage` block). D-05 verify step is satisfied; no edit.
5. **`.github/workflows/ci.yml` has a `Test` step at line 52–53 running `pnpm test`** (single matrix over Node 18/20/22). No `test:coverage` step exists yet — this IS the Phase 7 gap for D-30.
6. **`WARNING_CODES` has exactly 13 entries in `src/parser/warnings.ts` lines 26–40** and the exact names are:
   - `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`, `UNKNOWN_ESCAPE_SEQUENCE`, `TIMESTAMP_FALLBACK_FORMAT`, **`SEGMENT_CASE`** (NOT `SEGMENT_NAME_CASE` as CONTEXT.md D-13 suggested), `EXTRA_FIELDS`, `UNKNOWN_SEGMENT`, `DUPLICATE_REQUIRED_SEGMENT`, `ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT`, `VERSION_MISMATCH`, `UNKNOWN_CHARSET`.
   - The vendor-quirks filename for `SEGMENT_CASE` is therefore `segment-case.hl7` (not `segment-name-case.hl7` as CONTEXT.md speculatively listed).
7. **`FATAL_CODES` has exactly 4 entries in `src/parser/errors.ts` lines 31–36**: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Matches CONTEXT.md D-23 exactly.
8. **Existing round-trip fixtures are `\r`-separated single-line files** with no trailing LF (they display as one line in `cat` output; segments end with `\r` only). All new canonical/edge-cases/vendor-quirks/malformed fixtures MUST follow this byte-level convention — no `\n`, no final newline — so round-trip byte-identity assertions work.
9. **There is no pre-existing `toStructurallyEqual` custom matcher.** `test/round-trip.test.ts` uses a plain `function assertStructuralRoundTrip(raw)` free helper (lines 46–52) with inline `expect(...).toEqual(...)` on `rawSegments` + `encodingCharacters`. D-19 helper should mirror that pattern, not introduce `expect.extend`.

---

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `vitest.config.ts` (modify) | config | build-time | (self) | self-analog (Phase 1 scaffolded coverage block; Phase 7 audits/adjusts) |
| `package.json` (verify) | config | build-time | (self) | self-analog — no-op if already present |
| `.github/workflows/ci.yml` (modify) | ci | build-time | (self) | self-analog — add one step |
| `.gitignore` (verify) | config | build-time | (self) | no-op (coverage/ already present) |
| `test/fixtures/canonical/adt-a01.hl7` (rename) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | exact |
| `test/fixtures/canonical/oru-r01.hl7` (rename) | fixture | HL7 wire bytes | `test/fixtures/round-trip/oru-r01-repetitions.hl7` | exact |
| `test/fixtures/canonical/adt-a04.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | role-match (different message code; same structural shape) |
| `test/fixtures/canonical/adt-a08.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | role-match |
| `test/fixtures/canonical/orm-o01.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/oru-r01-repetitions.hl7` | role-match (order/observation-ish shape) |
| `test/fixtures/canonical/siu-s12.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | role-match |
| `test/fixtures/canonical/mdm-t02.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | role-match |
| `test/fixtures/canonical/z-segments.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/vendor-shapes/epic/adt-a01.hl7` | role-match (in-tree Z-segment reference) |
| `test/fixtures/canonical/nested-subcomponents.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/embedded-delimiters.hl7` | role-match (composite-heavy field) |
| `test/fixtures/canonical/README.md` (new) | doc | none | (no in-tree fixture-dir README) | no analog — write fresh (see template below) |
| `test/fixtures/edge-cases/decoded-br.hl7` (move) | fixture | HL7 wire bytes | `test/fixtures/round-trip/decoded-br.hl7` | exact (literal move) |
| `test/fixtures/edge-cases/embedded-delimiters.hl7` (move) | fixture | HL7 wire bytes | `test/fixtures/round-trip/embedded-delimiters.hl7` | exact |
| `test/fixtures/edge-cases/null-fields.hl7` (move) | fixture | HL7 wire bytes | `test/fixtures/round-trip/null-fields.hl7` | exact |
| `test/fixtures/edge-cases/lf-line-endings.hl7` (new) | fixture | HL7 wire bytes (LF) | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial — same body, different separator byte |
| `test/fixtures/edge-cases/crlf-line-endings.hl7` (new) | fixture | HL7 wire bytes (CRLF) | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/mixed-line-endings.hl7` (new) | fixture | HL7 wire bytes (mixed) | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/trailing-newline.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/no-trailing-newline.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/empty-fields.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/consecutive-delimiters.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/unknown-escapes.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/embedded-delimiters.hl7` | partial (escape-focused) |
| `test/fixtures/edge-cases/custom-msh-delimiters.hl7` (new) | fixture | HL7 wire bytes (custom delims) | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/unicode-names.hl7` (new) | fixture | HL7 wire bytes (UTF-8) | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/missing-optional-segments.hl7` (new) | fixture | HL7 wire bytes | `test/fixtures/round-trip/canonical-adt-a01.hl7` | partial |
| `test/fixtures/edge-cases/README.md` (new) | doc | none | (none) | no analog |
| `test/fixtures/vendor-quirks/*.hl7` (13 new) | fixture | HL7 wire bytes (per-code) | `test/fixtures/vendor-shapes/epic/adt-a01.hl7` (Z-seg style) + targeted scenarios from `test/parser-mllp.test.ts`, `test/parser-warnings.test.ts` | partial — scenarios exist inline in tests; fixtures are new files |
| `test/fixtures/vendor-quirks/README.md` (new) | doc | none | (none) | no analog |
| `test/fixtures/malformed/no-msh-segment.hl7` (new) | fixture | malformed bytes | `test/parser-errors.test.ts` (inline strings) | partial — inline error cases become fixture files |
| `test/fixtures/malformed/msh-too-short.hl7` (new) | fixture | malformed bytes | `test/parser-errors.test.ts` | partial |
| `test/fixtures/malformed/invalid-encoding-characters.hl7` (new) | fixture | malformed bytes | `test/parser-errors.test.ts` | partial |
| `test/fixtures/malformed/empty-input.hl7` (new) | fixture | empty bytes | `test/parser-errors.test.ts` | partial |
| `test/fixtures/malformed/README.md` (new) | doc | none | (none) | no analog |
| `test/canonical-messages.test.ts` (new) | test | fs → parseHL7 → helpers + round-trip | `test/round-trip.test.ts` + `test/profiles-builtins.test.ts` | exact (fs load pattern + describe-per-type) |
| `test/parser-edge-cases.test.ts` (new) | test | fs → parseHL7 → targeted assertions | `test/round-trip.test.ts` + `test/parser-warnings.test.ts` | exact |
| `test/parser-strict-mode-sweep.test.ts` (new) | test | fs.readdirSync → describe.each → parseHL7(lenient+strict) | `test/round-trip.test.ts` (fs sweep) + `test/parser-errors.test.ts` (throw-assert) | role-match (sweep + throw pattern both exist but not combined) |
| `test/parser-malformed-sweep.test.ts` (new) | test | fs.readdirSync → describe.each → parseHL7 throw | `test/parser-errors.test.ts` + `test/round-trip.test.ts` | role-match |
| `test/_helpers/fixture-code.ts` (new) | helper | pure string transform | (no in-tree helper dir) | no analog — 5-line function, see SPECIFICS in CONTEXT.md |
| `test/_helpers/structural-equivalence.ts` (new, optional) | helper | deep equality on rawSegments | `test/round-trip.test.ts` lines 46–52 (inline free function) | exact (copy-paste + export) |
| `test/round-trip.test.ts` (modify) | test | existing | (self) | self-analog — update FIXTURE_DIR path + FIXTURES array (D-08 migration fallout) |
| `.planning/phases/07-testing-hardening-and-fixtures/TEST-08-AUDIT.md` (new) | audit doc | planning text only | (no in-tree analog — one-off planning artifact) | no analog — free-form audit mapping TEST-08 bullets → existing `test/profiles-*.test.ts` |

---

## Pattern Assignments

### Config: `vitest.config.ts` (modify)

**Analog:** Self — `vitest.config.ts` lines 20–76 already has a full coverage block.

**Current state excerpt** (lines 20–57):
```ts
coverage: {
  provider: "v8",
  reporter: ["text", "html", "lcov"],
  reportsDirectory: "./coverage",
  include: ["src/**/*.ts"],
  exclude: [
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/index.ts",
    "src/**/*.d.ts",
    "src/**/__fixtures__/**",
  ],
  thresholds: {
    lines: 90,
    branches: 85,
    functions: 90,
    statements: 90,
    "src/parser/**": { lines: 90, branches: 85, functions: 90, statements: 90 },
    "src/model/**":  { lines: 90, branches: 85, functions: 90, statements: 90 },
    "src/helpers/**":{ lines: 90, branches: 85, functions: 90, statements: 90 },
    "src/serialize/**": { lines: 90, branches: 85, functions: 90, statements: 90 },
    "src/builder/**":   { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
},
```

**What Phase 7 does** (per CONTEXT.md D-02, D-05, D-06 — reconciled with current state):
- CONTEXT.md D-05 says reporters are `text + lcov` baseline plus HTML optional. Current config already lists all three — KEEP.
- CONTEXT.md D-06 says exclude `**/*.d.ts`, `**/index.ts`, `test/**`, `dist/**`. Current excludes are mostly right but:
  - `include: ["src/**/*.ts"]` already scopes coverage INSIDE `src/`, so `test/**` and `dist/**` exclusions are redundant. KEEP or PRUNE per planner judgment; recommend add them explicitly for documentation value.
  - Current excludes use `src/**/index.ts` not `**/index.ts`. That's actually MORE correct (Phase 1 convention) — KEEP.
  - `src/**/__fixtures__/**` exclusion: defensive, no-op today. KEEP.
- CONTEXT.md D-02 scopes thresholds to parser/model/helpers. Current config also gates `src/serialize/**` + `src/builder/**`. **Reconciliation decision point** (see note 3 above). Recommend KEEP the broader gate; justify by "Phase 5 already hits ≥90% via BIP/round-trip tests; removing the gate risks regression."
- Branch threshold is 85, not 90. CLAUDE.md + CONTEXT.md D-02 say "lines/branches/functions ≥ 90%". Planner MUST decide: bump to 90 or leave at 85. Recommend bump to 90 to match CLAUDE.md literally; if coverage fails, tighten tests.

**Pattern to follow:** The block structure is correct; Phase 7 just audits + tightens (branches 85→90) + confirms the gate actually trips by running `pnpm test:coverage` against deliberately gap-ridden code once.

---

### Config: `package.json` (verify)

**Analog:** Self — `package.json` lines 57–59 already has `"test": "vitest run"` and `"test:coverage": "vitest run --coverage"`.

**Current state excerpt** (lines 50–62):
```json
"scripts": {
  "build": "tsup",
  "typecheck": "tsc --noEmit",
  "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\" --max-warnings=0",
  "lint:fix": "eslint \"src/**/*.ts\" \"test/**/*.ts\" --fix",
  "format": "prettier --write \"src/**/*.{ts,md}\" \"test/**/*.ts\" \"*.{json,md,yml}\"",
  "format:check": "prettier --check \"src/**/*.{ts,md}\" \"test/**/*.ts\" \"*.{json,md,yml}\"",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "clean": "rm -rf dist coverage",
  "prepublishOnly": "pnpm clean && pnpm typecheck && pnpm lint && pnpm test && pnpm build"
},
```

Line 67 lists `"@vitest/coverage-v8": "^1.2.0"` in devDependencies.

**Pattern to follow:** VERIFY only. No edit needed. If an edit is made, the planner should add a `CHANGELOG.md`-style note that Phase 7 formalized what was already wired.

---

### CI: `.github/workflows/ci.yml` (modify)

**Analog:** Self — the existing `Test` step at lines 52–53.

**Insertion anchor excerpt** (lines 46–56):
```yaml
- name: Lint
  run: pnpm lint

- name: Format check
  run: pnpm format:check

- name: Test
  run: pnpm test

- name: Build
  run: pnpm build
```

**What Phase 7 adds** (D-30, "after existing test step" per CONTEXT.md recommendation):
```yaml
- name: Test (with coverage)
  run: pnpm test:coverage
```

Insert BETWEEN the `Test` step and the `Build` step, or REPLACE the plain `Test` step (planner decides per CONTEXT.md D-30). Recommend INSERT (not replace) so the fast test feedback stays on the run even if coverage reporting has a hiccup. CI matrix over Node 18/20/22 already exists; coverage runs on all three.

**Style notes:**
- Step naming matches existing `- name:` pattern.
- `run:` uses `pnpm` directly (no `npx`, no `npm`).

---

### Config: `.gitignore` (verify)

**Analog:** Self. Current `.gitignore` block:
```
# Test / coverage
coverage/
.vitest-cache/
```

**Pattern to follow:** Already satisfies D-05. No edit.

---

### Canonical fixtures: `test/fixtures/canonical/*.hl7`

**Style reference — `canonical-adt-a01.hl7`** (the existing anchor; see also SPECIFICS in CONTEXT.md):
```
MSH|^~\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5<CR>EVN|A01|20260419101500<CR>PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212<CR>PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001
```

where `<CR>` is a literal `\r` (0x0D). **No `\n` anywhere. No trailing newline.**

**Style reference — `oru-r01-repetitions.hl7`:**
```
MSH|^~\&|LAB|MAIN|EHR|REF|20260419101500||ORU^R01^ORU_R01|MSG00002|P|2.5<CR>PID|1||MRN12345^^^HOSP^MR~SSN^^^USA^SS||Doe^John<CR>OBR|1|ORD001|FLR001|CBC^Complete Blood Count^LN|||20260419080000<CR>OBX|1|NM|WBC^White Blood Cells^LN||7.5|K/uL^^UCUM|4.0-11.0|N|||F<CR>OBX|2|NM|HGB^Hemoglobin^LN||14.2|g/dL^^UCUM|12.0-16.0|N|||F<CR>OBX|3|NM|HCT^Hematocrit^LN||42.1|%^^UCUM|37.0-47.0|N|||F
```

**Style reference — Z-segment shape, from `test/fixtures/vendor-shapes/epic/adt-a01.hl7`:**
```
MSH|^~\&|EPICADT|HOSP|TPDIR|EPIC|01/15/2025 14:30:00||ADT^A01|MSG0001|P|2.5<CR>EVN|A01|01/15/2025 14:30:00<CR>PID|1||EPIC-00001^^^HOSP.MRN^MR||Doe^John^Q||19800115|M<CR>PV1|1|I|UNIT3^^^WEST||||||ATTEND<CR>ZDP|1|1|CARDIOLOGY|Cardiology Department<CR>ZRS|FINAL|01/15/2025 14:25:00
```

This is the Z-segment analog for `canonical/z-segments.hl7` — copy shape, substitute `ZDP`/`ZRS` → `ZXX`/`ZYY`, keep timestamps HL7-native (`YYYYMMDDHHMMSS`, NOT Epic-style `MM/DD/YYYY` — z-segments fixture is spec-clean).

**Nested-subcomponent analog — `embedded-delimiters.hl7` PID-5 XPN shape:**
```
PID|1||MRN77777^^^HOSP^MR||Smith\F\Jones^John\S\Public^Q\T\Roe^Jr\R\Sr^Dr\E\Prof||19700101|M
```

For `nested-subcomponents.hl7`, swap `\F\`-style escapes for actual `&`-delimited subcomponents per CONTEXT.md SPECIFICS:
```
PID|1||MRN-A01-001^^^HOSP^MR||Doe^John^Q^Jr^^Dr^^&Jones&Alias&&&||19800115|M
```

**Acceptance shape per CONTEXT.md specifics section:**
- `adt-a01.hl7`: `parseHL7(raw).patient.mrn === 'MRN12345'` and `.visit.patientClass === 'I'`.

**Style notes** (applies to ALL canonical fixtures):
- Byte-identical wire format: `\r`-separated, no trailing LF.
- MSH-7 timestamp: `YYYYMMDDHHMMSS` HL7-native format (not vendor-flavored dates — those live in `vendor-shapes/`).
- Synthetic patient IDs only: `MRN12345`, `MRN-A04-002`, `Doe^John`, `Smith^Jane` etc. NO PHI.
- Message control IDs follow `MSG00001`, `MSG00002` sequence established by existing fixtures.
- Every required segment field populated; no truncated segments (those belong in `edge-cases/`).

---

### Edge-case fixtures: `test/fixtures/edge-cases/*.hl7`

**Analog — migrated files (exact move, no content change):**
- `test/fixtures/round-trip/decoded-br.hl7` → `test/fixtures/edge-cases/decoded-br.hl7`
- `test/fixtures/round-trip/embedded-delimiters.hl7` → `test/fixtures/edge-cases/embedded-delimiters.hl7`
- `test/fixtures/round-trip/null-fields.hl7` → `test/fixtures/edge-cases/null-fields.hl7`

**Existing content reference — `null-fields.hl7`:**
```
MSH|^~\&|SRC|FAC|DST|REF|20260419101500||ADT^A04|MSG00003|P|2.5<CR>PID|1|""|MRN99999^^^HOSP^MR||Doe^Jane||19850601|F|""|""
```

**Per-scenario authoring guide** (line-ending variants start from the adt-a01 body):
- `lf-line-endings.hl7`: identical body to `canonical/adt-a01.hl7` but with literal `\n` separators instead of `\r`. Tests assert warnings are silent (TOL / PARSE-08: Tier-1, no warning) and parse succeeds.
- `crlf-line-endings.hl7`: `\r\n` separators. Same assertions.
- `mixed-line-endings.hl7`: alternating `\r`, `\n`, `\r\n`. Same assertions.
- `trailing-newline.hl7`: canonical-adt-a01 body + trailing `\r` (or `\n`). Tests assert the trailing byte is absorbed silently.
- `no-trailing-newline.hl7`: canonical-adt-a01 body verbatim (no trailing). Asserts parse succeeds.
- `empty-fields.hl7`: PID with `||` runs (distinct from `""` null per PARSE-06). Tests assert `RawField.isNull === false` for empties.
- `consecutive-delimiters.hl7`: e.g., `PID|1||||||||` — multiple adjacent `|`. Tests assert field count correct.
- `unknown-escapes.hl7`: use `\Z99\` or `\X1234\` in an OBX-5. Asserts `UNKNOWN_ESCAPE_SEQUENCE` warning AND verbatim preservation per TOL-10.
- `custom-msh-delimiters.hl7`: MSH-1=`@`, MSH-2=`~&#\` (per CONTEXT.md specifics). Tests assert delimiters honored throughout (PARSE-02).
- `unicode-names.hl7`: patient name with accented chars (`Müller^Jürgen`) + CJK (`李^明`). Tests assert UTF-8 preserved.
- `missing-optional-segments.hl7`: ADT^A01 without PV1. Tests assert `msg.visit === undefined` (HELPERS-03).

**Style notes:**
- Keep `\r` as the default terminator unless the fixture's whole POINT is a different separator.
- Each fixture focuses on ONE scenario so assertions stay narrow.
- Body derived from `canonical-adt-a01.hl7` unless a different base message is needed for the scenario.

---

### Vendor-quirks fixtures: `test/fixtures/vendor-quirks/*.hl7` (13 files — D-13)

**Filename ↔ warning code contract (D-12):** filename is kebab-case of the UPPER_SNAKE warning code. `fileToWarningCode("segment-case.hl7") === "SEGMENT_CASE"`.

**Exact file list (authoritative, derived from `src/parser/warnings.ts::WARNING_CODES`):**

| Filename | Warning Code | Trigger |
|----------|--------------|---------|
| `mllp-framing-stripped.hl7` | `MLLP_FRAMING_STRIPPED` | Wrap canonical message in `\x0B` prefix + `\x1C\x0D` suffix |
| `field-whitespace-trimmed.hl7` | `FIELD_WHITESPACE_TRIMMED` | `PID\|1\|\| MRN123 ^^^HOSP^MR` (leading/trailing spaces) |
| `unknown-escape-sequence.hl7` | `UNKNOWN_ESCAPE_SEQUENCE` | OBX-5 containing `\Z99\` or `\Q99\` |
| `timestamp-fallback-format.hl7` | `TIMESTAMP_FALLBACK_FORMAT` | MSH-7 = `2025-01-15T14:30:00` (ISO, fallback) — use WITHOUT a profile so built-in fallbacks trigger |
| `segment-case.hl7` | `SEGMENT_CASE` | Lowercase segment name: `pid\|1\|...` instead of `PID` |
| `extra-fields.hl7` | `EXTRA_FIELDS` | Segment with more fields than the spec declares (e.g., EVN with fields beyond EVN-6) |
| `unknown-segment.hl7` | `UNKNOWN_SEGMENT` | ADT^A01 body + `ZZZ\|1\|foo` segment (no profile) |
| `duplicate-required-segment.hl7` | `DUPLICATE_REQUIRED_SEGMENT` | Two MSH segments in one message |
| `encoding-mismatch.hl7` | `ENCODING_MISMATCH` | MSH-2 declares `^~\&` but later segment uses different delimiter sequence — exact trigger: check `src/parser/delimiters.ts` for emit site |
| `missing-required-field.hl7` | `MISSING_REQUIRED_FIELD` | Segment with a required field empty (e.g., missing MSH-9 or empty PID-3 under a profile that requires it) |
| `out-of-order-segment.hl7` | `OUT_OF_ORDER_SEGMENT` | EVN appearing BEFORE MSH, or PV1 before PID |
| `version-mismatch.hl7` | `VERSION_MISMATCH` | MSH-12 = `2.9` while parser/profile expects `2.5`; requires a profile or option to anchor expected version |
| `unknown-charset.hl7` | `UNKNOWN_CHARSET` | MSH-18 = `ISO IR 999` (invalid); parse via Buffer input to exercise charset path (PARSE-09) |

**Planner MUST verify each trigger by reading**:
- `src/parser/mllp.ts` — MLLP stripping
- `src/parser/segments.ts` — segment case + unknown + duplicate
- `src/parser/tokenize.ts` — whitespace trim + extra fields
- `src/parser/escapes.ts` — unknown escape
- `src/parser/dates.ts` — timestamp fallback
- `src/parser/delimiters.ts` — encoding mismatch
- `src/parser/normalize.ts` — charset

Some warnings (`ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT`, `VERSION_MISMATCH`) may require a profile to trigger. If so, the sweep test in `parser-strict-mode-sweep.test.ts` needs to parse THOSE fixtures with a specific profile. CONTEXT.md D-14 allows `toContain(code)` for unavoidable co-triggers; if a fixture cannot isolate a warning without a profile, document in the dir README.

**Warning code enum shape** (excerpt from `src/parser/warnings.ts` lines 26–40 — USE THIS AS SOURCE OF TRUTH, don't rely on CONTEXT.md D-13 speculation):
```ts
export const WARNING_CODES = {
  MLLP_FRAMING_STRIPPED: "MLLP_FRAMING_STRIPPED",
  FIELD_WHITESPACE_TRIMMED: "FIELD_WHITESPACE_TRIMMED",
  UNKNOWN_ESCAPE_SEQUENCE: "UNKNOWN_ESCAPE_SEQUENCE",
  TIMESTAMP_FALLBACK_FORMAT: "TIMESTAMP_FALLBACK_FORMAT",
  SEGMENT_CASE: "SEGMENT_CASE",
  EXTRA_FIELDS: "EXTRA_FIELDS",
  UNKNOWN_SEGMENT: "UNKNOWN_SEGMENT",
  DUPLICATE_REQUIRED_SEGMENT: "DUPLICATE_REQUIRED_SEGMENT",
  ENCODING_MISMATCH: "ENCODING_MISMATCH",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  OUT_OF_ORDER_SEGMENT: "OUT_OF_ORDER_SEGMENT",
  VERSION_MISMATCH: "VERSION_MISMATCH",
  UNKNOWN_CHARSET: "UNKNOWN_CHARSET",
} as const;
```

**Style notes:**
- All fixtures `\r`-separated, no trailing newline.
- Body derives from `canonical/adt-a01.hl7` unless scenario requires a different base.
- Each fixture contains ONE quirk; co-triggered warnings are documented in the dir README.

---

### Malformed fixtures: `test/fixtures/malformed/*.hl7` (4 files — D-23)

**No in-tree fixture analog.** Scenarios currently exercised inline in `test/parser-errors.test.ts` (that's the test style analog).

**Fatal code enum shape** (excerpt from `src/parser/errors.ts` lines 31–36):
```ts
export const FATAL_CODES = {
  NO_MSH_SEGMENT: "NO_MSH_SEGMENT",
  MSH_TOO_SHORT: "MSH_TOO_SHORT",
  INVALID_ENCODING_CHARACTERS: "INVALID_ENCODING_CHARACTERS",
  EMPTY_INPUT: "EMPTY_INPUT",
} as const;
```

**Trigger conditions** (planner MUST verify by reading `src/parser/delimiters.ts`, `src/parser/segments.ts`, and `src/parser/index.ts`):

| Filename | Fatal Code | Trigger body |
|----------|------------|--------------|
| `no-msh-segment.hl7` | `NO_MSH_SEGMENT` | File starts with `EVN\|A01\|...` (no MSH anywhere) |
| `msh-too-short.hl7` | `MSH_TOO_SHORT` | `MSH\|^~` (truncated before MSH-2 complete) |
| `invalid-encoding-characters.hl7` | `INVALID_ENCODING_CHARACTERS` | MSH with malformed MSH-1/MSH-2 (e.g., MSH-2 has 2 chars instead of 4: `MSH\|^~\|...`) |
| `empty-input.hl7` | `EMPTY_INPUT` | 0-byte file |

**Style notes:**
- Deliberately broken — do NOT try to make these spec-valid.
- `empty-input.hl7` is a genuinely empty file (0 bytes). Verify `fs.readFileSync` returns empty string.
- Each fixture isolates ONE fatal; no co-triggers possible (fatals short-circuit parse).

---

### Test files

#### `test/canonical-messages.test.ts` (new — D-20)

**Analog:** `test/round-trip.test.ts` (lines 1–55 structure) + `test/profiles-builtins.test.ts` (lines 1–88 describe-per-variant layout) + `test/helpers-patient.test.ts` (lines 26–48 helper-probe style).

**Imports pattern** (from `test/round-trip.test.ts` lines 21–33):
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}
```

**Structural round-trip helper** (copy from `test/round-trip.test.ts` lines 46–52 — or import from `test/_helpers/structural-equivalence.ts` if the planner chooses to extract):
```ts
function assertStructuralRoundTrip(raw: string): void {
  const original = parseHL7(raw);
  const emitted = original.toString();
  const roundTripped = parseHL7(emitted);
  expect(roundTripped.rawSegments).toEqual(original.rawSegments);
  expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
}
```

**Describe-per-message-type pattern** (from `test/profiles-builtins.test.ts` lines 50–88):
```ts
describe("canonical: ADT^A01 (TEST-02)", () => {
  const fixture = loadFixture("adt-a01");
  it("parses + structural round-trip", () => {
    assertStructuralRoundTrip(fixture);
  });
  it("msg.patient.mrn === 'MRN12345' (D-20 helper probe)", () => {
    expect(parseHL7(fixture).patient?.mrn).toBe("MRN12345");
  });
  it("msg.visit.patientClass === 'I'", () => {
    expect(parseHL7(fixture).visit?.patientClass).toBe("I");
  });
});
```

**Helper probe matrix** (from CONTEXT.md D-20):
- adt-a01 → `msg.patient.mrn` + `msg.visit.patientClass`
- adt-a04 / adt-a08 → `msg.patient.mrn`
- oru-r01 → `msg.observations().length > 0` + first obs `.valueType`
- orm-o01 → `msg.orders().length > 0`
- siu-s12 / mdm-t02 → parse + round-trip only
- z-segments → `msg.allSegments()` includes ZXX + ZYY + each emits `UNKNOWN_SEGMENT` warning
- nested-subcomponents → subcomponent access via `seg.field(5).component(c).subcomponent(s)`

**Style notes:**
- One `describe` block per message type.
- Every block asserts structural round-trip first, then the helper probe.
- Use `parseHL7(fixture)` freshly in each `it` to keep tests isolated.

#### `test/parser-edge-cases.test.ts` (new — D-22)

**Analog:** `test/parser-warnings.test.ts` (describe/it explicit layout — NOT parameterized) + `test/round-trip.test.ts` fs helpers.

**Pattern:** same imports as `canonical-messages.test.ts` but `FIXTURE_DIR = "fixtures/edge-cases"`. Each edge case has its OWN `it(...)` with targeted assertions per CONTEXT.md D-22 — NOT a parameterized sweep.

**Example block** (compose from CONTEXT.md D-21 per-scenario guidance):
```ts
describe("edge-cases: line endings (PARSE-08)", () => {
  it("LF-only line endings parse without warning", () => {
    const msg = parseHL7(loadFixture("lf-line-endings"));
    expect(msg.rawSegments.length).toBeGreaterThan(0);
    // PARSE-08 is Tier-1: no warning code for line-ending normalization.
  });
  it("CRLF line endings parse without warning", () => {
    const msg = parseHL7(loadFixture("crlf-line-endings"));
    expect(msg.rawSegments.length).toBeGreaterThan(0);
  });
  it("mixed line endings parse without warning", () => {
    const msg = parseHL7(loadFixture("mixed-line-endings"));
    expect(msg.rawSegments.length).toBeGreaterThan(0);
  });
});

describe("edge-cases: unknown escape sequences (TOL-10)", () => {
  it("emits UNKNOWN_ESCAPE_SEQUENCE and preserves verbatim", () => {
    const msg = parseHL7(loadFixture("unknown-escapes"));
    expect(msg.warnings.map((w) => w.code)).toContain("UNKNOWN_ESCAPE_SEQUENCE");
  });
});
```

Each scenario in D-21 gets its own `describe` or `it`. Planner decides whether to split into multiple files if the file grows past ~300 lines.

#### `test/parser-strict-mode-sweep.test.ts` (new — D-15)

**Analog:** `test/round-trip.test.ts` lines 63–81 (sweep-over-FIXTURES) + `test/parser-errors.test.ts` lines 23–32 (`expect(() => ...).toThrow(Hl7ParseError)`).

**fs-scan sweep pattern** (model from CONTEXT.md D-15):
```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { Hl7ParseError } from "../src/parser/errors.js";
import { fileToWarningCode } from "./_helpers/fixture-code.js";

const VQ_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "vendor-quirks",
);

const fixtures = readdirSync(VQ_DIR).filter((f) => f.endsWith(".hl7"));

describe.each(fixtures)("vendor-quirks/%s", (file) => {
  const raw = readFileSync(path.join(VQ_DIR, file), "utf8");
  const expectedCode = fileToWarningCode(file);

  it("parses in lenient mode with the expected warning", () => {
    const msg = parseHL7(raw);
    expect(msg.warnings.map((w) => w.code)).toContain(expectedCode);
  });

  it("throws Hl7ParseError in strict mode", () => {
    expect(() => parseHL7(raw, { strict: true })).toThrow(Hl7ParseError);
  });
});
```

**Style notes:**
- Use `describe.each` (not `it.each`) so the file grouping in reporter output reads as `vendor-quirks/mllp-framing-stripped.hl7 > parses in lenient mode…`.
- Import `Hl7ParseError` from the specific module path `../src/parser/errors.js` (matches the convention in `test/parser-errors.test.ts` line 5).
- Vendor-quirks fixtures that cannot isolate a single warning (CONTEXT.md D-14) may need a second test file OR a `.toContain(code)` instead of `.toEqual([code])`. The above sweep already uses `.toContain`, so co-triggers are fine.

#### `test/parser-malformed-sweep.test.ts` (new — D-24)

**Analog:** same as strict-mode sweep, adapted for fatals.

**Pattern:**
```ts
const MALFORMED_DIR = path.join(... "fixtures", "malformed");
const fixtures = readdirSync(MALFORMED_DIR).filter((f) => f.endsWith(".hl7"));

describe.each(fixtures)("malformed/%s", (file) => {
  const raw = readFileSync(path.join(MALFORMED_DIR, file), "utf8");
  const expectedCode = fileToFatalCode(file);  // same helper, different enum

  it("throws Hl7ParseError with expected code (lenient mode)", () => {
    expect(() => parseHL7(raw)).toThrow(Hl7ParseError);
    try {
      parseHL7(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe(expectedCode);
        expect(err.position).toBeDefined();
        expect(err.snippet).toBeDefined();
      }
    }
  });

  it("throws even in strict mode (Tier-3 semantics)", () => {
    expect(() => parseHL7(raw, { strict: true })).toThrow(Hl7ParseError);
  });
});
```

**Style notes:**
- `fileToFatalCode` is the same helper as `fileToWarningCode` (CONTEXT.md SPECIFICS §`test/_helpers/fixture-code.ts` — it's pure string transform, doesn't know about enums). Rename the helper to `fileToCode` to make it enum-agnostic, OR export both names as aliases.
- Per TOL-02, every `Hl7ParseError` has `code + position + snippet` — assert all three non-undefined.

#### `test/round-trip.test.ts` (modify)

**Analog:** Self. Update `FIXTURE_DIR` and `FIXTURES` to reflect D-08 migration.

**Current state** (line 31–33):
```ts
const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "round-trip",
);
```

**After D-08:**
- Change `"round-trip"` → `"canonical"`.
- Update `FIXTURES` const (lines 63–69): replace `"canonical-adt-a01"` with `"adt-a01"`, replace `"oru-r01-repetitions"` with `"oru-r01"`, REMOVE `"null-fields"` / `"embedded-delimiters"` / `"decoded-br"` (they move to `edge-cases/` and get their own tests in `parser-edge-cases.test.ts`).
- Decide: keep `round-trip.test.ts` as the pure SER-02 round-trip sweep over `canonical/`, or fold its logic into `canonical-messages.test.ts` under a "structural round-trip" describe block. CONTEXT.md CODE_CONTEXT says "update to reference canonical/ paths (D-08)" — so keep it, just migrate paths.

---

### Helpers

#### `test/_helpers/fixture-code.ts` (new)

**Analog:** No in-tree helper directory. Pure function; CONTEXT.md SPECIFICS section gives the exact 5-line implementation:
```ts
export function fileToWarningCode(filename: string): string {
  return filename
    .replace(/\.hl7$/, "")
    .replace(/-/g, "_")
    .toUpperCase();
}
```

**Style notes:**
- Filename `.ts` (NOT `.test.ts`) — Phase 1 vitest include is `test/**/*.test.ts` per `vitest.config.ts` line 14, so `.ts` helpers are auto-excluded from the test run (CONTEXT.md D-29).
- Export the function as `fileToCode` or `fileToWarningCode` — both the warning and fatal sweeps use it.
- Add JSDoc with `@example` per CLAUDE.md engineering guardrails:
  ```ts
  /**
   * Derive the UPPER_SNAKE code name from a kebab-case fixture filename.
   * Used by vendor-quirks and malformed sweeps to map `foo-bar.hl7` → `FOO_BAR`.
   *
   * @example
   * ```ts
   * fileToCode("mllp-framing-stripped.hl7"); // "MLLP_FRAMING_STRIPPED"
   * ```
   */
  ```

#### `test/_helpers/structural-equivalence.ts` (new, OPTIONAL — D-19)

**Analog:** `test/round-trip.test.ts` lines 46–52 (inline free function). Extract verbatim:
```ts
import { expect } from "vitest";

import { parseHL7 } from "../../src/index.js";

/**
 * SER-02 structural round-trip — asserts `parseHL7(msg.toString())` yields
 * a message with the same `rawSegments` and `encodingCharacters` as the
 * original. Byte-identity is NOT required on the first pass (MLLP / BOM /
 * CRLF / custom-delimiter inputs emit spec-clean bytes).
 *
 * @example
 * ```ts
 * assertStructuralRoundTrip(readFileSync("canonical/adt-a01.hl7", "utf8"));
 * ```
 */
export function assertStructuralRoundTrip(raw: string): void {
  const original = parseHL7(raw);
  const emitted = original.toString();
  const roundTripped = parseHL7(emitted);
  expect(roundTripped.rawSegments).toEqual(original.rawSegments);
  expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
}
```

**Style notes:**
- Planner picks whether to extract (reduces duplication across `round-trip.test.ts` + `canonical-messages.test.ts`) or keep inline (simpler, matches current Phase 5 pattern). Recommend EXTRACT because Phase 7 has more call sites.
- If extracted, `round-trip.test.ts` should import it too (remove the inline copy).

---

### Per-dir READMEs (D-11)

**No in-tree analog.** CONTEXT.md D-11 says "what these fixtures demonstrate + filename contract." Keep each README short (~30–50 lines max).

**Template for `vendor-quirks/README.md`:**
```markdown
# vendor-quirks fixtures

One fixture per Tier-2 warning code in `src/parser/warnings.ts::WARNING_CODES` (13 total).

## Filename contract

Each filename is the kebab-case of the UPPER_SNAKE warning code it's designed to trigger. Example:
- `mllp-framing-stripped.hl7` triggers `MLLP_FRAMING_STRIPPED`.
- `segment-case.hl7` triggers `SEGMENT_CASE`.

`test/parser-strict-mode-sweep.test.ts` derives the expected code via
`test/_helpers/fixture-code.ts::fileToCode`.

## Fixtures

| Filename | Code | Isolates single warning? |
|----------|------|--------------------------|
| ...      | ...  | yes / no (document co-triggers) |

## Adding a new fixture

1. Add a new warning code to `src/parser/warnings.ts` (requires a project-level decision).
2. Author a fixture that triggers exactly that code.
3. Name the file using the kebab-case of the code.
4. The sweep picks it up automatically.
```

**Template for `malformed/README.md`:** same structure, referencing `FATAL_CODES` and D-23.

**Template for `canonical/README.md`:** lists the 10 fixtures + their role (message type or structural scenario) + the helper each exercises.

**Template for `edge-cases/README.md`:** lists 14 fixtures + the scenario each demonstrates + which TOL/PARSE REQ-ID each maps to.

---

### Audit doc

#### `.planning/phases/07-testing-hardening-and-fixtures/TEST-08-AUDIT.md` (new, temporary)

**No in-tree analog.** Free-form planning artifact mapping each TEST-08 bullet to the `test/profiles-*.test.ts` file(s) that cover it. Template:
```markdown
# TEST-08 — Profile-authoring Test Suite Audit

**Generated:** Phase 7 Plan [N]
**Purpose:** Map each TEST-08 enumerated case to the existing Phase 6 profile test file(s); surface gaps.

## Coverage matrix

| TEST-08 case | Covered by | Gap? |
|--------------|-----------|------|
| valid defineProfile output | `profiles-define.test.ts` | no |
| ProfileDefinitionError cases | `profiles-define.test.ts` | no |
| extends single + array | `profiles-extends.test.ts` | no |
| merge semantics per option category | `profiles-extends.test.ts` | no / spot gap in X |
| default-profile set/get/opt-out | `profiles-default.test.ts` | no |
| profile.describe() | `profiles-define.test.ts` | no |
| msg.profile attribution | `profiles-custom-segments.test.ts` (or other) | no |
| round-trip with custom profile | `profiles-builtins.test.ts` (PROF-09 test) | no |

## Gaps to close

- [ ] Gap 1 (if any) → proposed test in file X
- [ ] ...

## Disposition

- Summarize into verifier report at phase close (D-26).
- Discard the raw audit doc once gaps are closed.
```

---

## Shared Patterns

### Pattern: fs-scan sweep with filename-derived code

**Source:** Extends `test/round-trip.test.ts` FIXTURES pattern to `readdirSync` + `describe.each` per CONTEXT.md D-15.

**Apply to:** `test/parser-strict-mode-sweep.test.ts`, `test/parser-malformed-sweep.test.ts`.

**Canonical form:**
```ts
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "<concern>");
const fixtures = readdirSync(DIR).filter((f) => f.endsWith(".hl7"));
describe.each(fixtures)("<concern>/%s", (file) => {
  const raw = readFileSync(path.join(DIR, file), "utf8");
  const expectedCode = fileToCode(file);
  // ... it blocks
});
```

### Pattern: structural round-trip assertion

**Source:** `test/round-trip.test.ts` lines 46–52 (free function).

**Apply to:** `canonical-messages.test.ts`, updated `round-trip.test.ts`, any other round-trip checker. Extract to `test/_helpers/structural-equivalence.ts` per D-19 decision or keep inline.

### Pattern: fixture loading

**Source:** `test/round-trip.test.ts` lines 21–37.

**Apply to:** all new fixture-consuming test files. Uniform `loadFixture(name: string): string` wrapper around `readFileSync(path.join(FIXTURE_DIR, \`${name}.hl7\`), "utf8")`.

### Pattern: `expect(() => parseHL7(x)).toThrow(Hl7ParseError)`

**Source:** `test/parser-errors.test.ts` line 24 + surrounding.

**Apply to:** malformed-sweep, strict-mode-sweep, negative-path assertions in any edge-case test.

### Pattern: JSDoc with `@example` on every helper

**Source:** CLAUDE.md engineering guardrails + `src/parser/warnings.ts` lines 16–25 (every factory has `@example`).

**Apply to:** `test/_helpers/fixture-code.ts`, `test/_helpers/structural-equivalence.ts`, any future helper.

### Pattern: HL7 fixture byte format

**Source:** All existing `test/fixtures/round-trip/*.hl7` + `test/fixtures/vendor-shapes/*/*.hl7`.

**Apply to:** all new fixture files (canonical/, edge-cases/, vendor-quirks/, malformed/) UNLESS the fixture's purpose is to test a deviation (e.g., `edge-cases/crlf-line-endings.hl7` uses `\r\n` precisely because that IS the scenario).

**Conventions:**
- Single-line file or `\r`-separated segments; no `\n`.
- No trailing newline (byte-exact: file ends immediately after last segment's final char).
- MSH-7 in native HL7 format `YYYYMMDDHHMMSS` for canonical fixtures.
- Synthetic patient data only (no PHI, never anonymized real messages).
- Control IDs follow `MSG00001+` sequence.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `test/fixtures/vendor-quirks/*.hl7` (13) | fixture | per-code | No in-tree fixture targets a single warning code. Closest style reference is `vendor-shapes/epic/adt-a01.hl7` for Z-segment cases; remaining 12 need fresh authoring driven by `src/parser/*.ts` warning emit sites. |
| `test/fixtures/malformed/*.hl7` (4) | fixture | fatal trigger | Malformed inputs are exercised inline in `test/parser-errors.test.ts`; extracting to files is net-new. |
| `test/fixtures/<dir>/README.md` (4) | doc | — | No existing fixture-dir READMEs in the repo. Template provided above. |
| `TEST-08-AUDIT.md` | audit | — | Temporary planning artifact; no analog. |

---

## Metadata

**Analog search scope:** `test/`, `test/fixtures/**`, `src/parser/`, `.github/workflows/`, repo root configs.
**Files scanned:** 55 test files + 10 fixtures (5 round-trip + 5 vendor-shapes) + `vitest.config.ts`, `package.json`, `ci.yml`, `.gitignore`, `src/parser/warnings.ts`, `src/parser/errors.ts` = ~70 files inspected, ~15 read in depth.
**Pattern extraction date:** 2026-04-19.
