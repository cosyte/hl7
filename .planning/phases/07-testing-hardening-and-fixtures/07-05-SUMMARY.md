---
phase: 07-testing-hardening-and-fixtures
plan: 05
subsystem: test-fixtures
tags: [test-fixtures, malformed, TEST-04, fatal-codes, TOL-02, tolerance]
dependency-graph:
  requires:
    - src/parser/errors.ts::FATAL_CODES (authoritative 4 Tier-3 codes — source of truth for fixture filenames)
    - src/parser/errors.ts::Hl7ParseError (throw target + code/position/snippet fields)
    - src/parser/index.ts::parseHL7 (parse entry; EMPTY_INPUT + NO_MSH_SEGMENT early-throw path)
    - src/parser/delimiters.ts::readDelimiters (NO_MSH_SEGMENT + MSH_TOO_SHORT + INVALID_ENCODING_CHARACTERS emit site)
    - test/_helpers/fixture-code.ts (Plan 01 output — same fileToCode helper as vendor-quirks sweep)
  provides:
    - test/fixtures/malformed/ (4 new .hl7 fixtures, one per FATAL_CODES entry)
    - test/fixtures/malformed/README.md (filename↔FATAL_CODES contract + trigger table + alternative-trigger notes for INVALID_ENCODING_CHARACTERS)
    - test/parser-malformed-sweep.test.ts (parameterized describe.each over readdirSync — adds a fixture, auto-joins the sweep per D-24)
  affects:
    - None — purely additive. No src/ changes; no existing test changes.
tech-stack:
  added: []
  patterns:
    - "Parameterized fs-scan sweep via readdirSync + describe.each (D-24) — mirrors the vendor-quirks sweep style from Plan 04 for consistency."
    - "Filename ↔ fatal-code contract via fileToCode (D-23) — every fixture filename is the kebab-case of its target FATAL_CODES entry; helper is enum-agnostic so the same function serves both warning (Plan 04) and fatal (Plan 05) sweeps."
    - "Dual lenient/strict assertion per fixture: both modes assert parseHL7 throws Hl7ParseError with err.code matching the filename. Tier-3 fatals are mode-independent (short-circuit before any strict escalation) — this property is captured as an explicit test rather than a comment."
    - "TOL-02 contract enforcement: sweep asserts err.position defined (object) + err.snippet defined (string). Empty snippet acceptable for EMPTY_INPUT — presence is what the contract requires."
    - "Fixture authored via Node one-liner for the 0-byte empty-input.hl7 case — text editors often append a trailing newline on save, which would defeat the EMPTY_INPUT trigger."
key-files:
  created:
    - test/fixtures/malformed/empty-input.hl7
    - test/fixtures/malformed/no-msh-segment.hl7
    - test/fixtures/malformed/msh-too-short.hl7
    - test/fixtures/malformed/invalid-encoding-characters.hl7
    - test/fixtures/malformed/README.md
    - test/parser-malformed-sweep.test.ts
  modified: []
decisions:
  - "For INVALID_ENCODING_CHARACTERS, chose the 'field separator reappears among MSH-2 encoding chars' trigger (body `MSH|^~|SENDAPP|...` — slice(4,8) = `^~|S`) over the 'MSH-2 too short' trigger. Either works; the chosen shape is a real-world-plausible malformed header (some senders forget the `\\&` subcomponent separator and reuse `|`), whereas raw truncation is captured by the MSH_TOO_SHORT fixture. README documents the three alternative triggers for the same code so future maintainers understand the breadth of conditions INVALID_ENCODING_CHARACTERS covers."
  - "Used fs.writeFileSync via a Node one-liner (not the Write tool) for all 4 fixtures — empty-input.hl7 must be exactly 0 bytes (the Write tool could in principle accept empty content, but going through Node keeps byte-level intent explicit), and the CR (0x0D) segment terminator in no-msh-segment.hl7 must land exactly (the Write tool reformats control bytes). The threat-model disposition T-07-05-03 noted this requirement; the mitigation is the Node-script approach."
  - "Sweep uses readFileSync(path, 'utf8') returning string — parseHL7 accepts both string and Buffer, and fatal checks fire the same way on either. String read keeps the sweep simple and mirrors how a real consumer handling `e.code === 'EMPTY_INPUT'` would typically call parseHL7."
  - "Assertion shape uses both `expect(() => parseHL7(raw)).toThrow(Hl7ParseError)` AND a try/catch with instanceof narrowing so err.code / err.position / err.snippet can be inspected. Vitest's built-in `toThrowError(expect.objectContaining({...}))` was considered but rejected — the try/catch pattern matches test/parser-errors.test.ts style and gives the sweep uniform shape with the vendor-quirks sweep."
  - "Included an explicit 'directory contains exactly 4 FATAL_CODES fixtures' count assertion — catches accidental additions of stray files to the dir (e.g., a `.hl7.bak` editor backup) or loss of a fixture. The 4-count is locked by Phase 5 D-27 / Phase 6 D-31 (no new fatal codes in v1)."
metrics:
  duration: "~8 min"
  completed: "2026-04-19"
  tests-delta: "+9 passing (815 → 824 passing + 14 todo across 59 test files). Per-fixture: 1 count assertion + 4 × 2 lenient/strict = 9 test registrations. All 9 pass (no it.todo blocks — all 4 fatal codes have active parser emit sites since Phase 2)."

# Phase 7 Plan 05: Malformed Fixtures + Sweep Summary

## One-Liner

Four malformed HL7 fixtures (one per Tier-3 fatal code) plus a parameterized sweep asserting Hl7ParseError throw-with-code-position-snippet in both lenient and strict mode — closes TEST-04.

## What Shipped

**Fixtures** (`test/fixtures/malformed/`):

| Filename                            | Bytes | Fatal Code                    | Trigger                                                                                                          |
| ----------------------------------- | ----- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `empty-input.hl7`                   | 0     | `EMPTY_INPUT`                 | 0-byte file — fails the `text.length === 0` check at parseHL7 Step 2                                             |
| `no-msh-segment.hl7`                | 73    | `NO_MSH_SEGMENT`              | Starts with `EVN\|...` (no MSH anywhere) — readDelimiters checks `slice(0,3) !== "MSH"`                           |
| `msh-too-short.hl7`                 | 6     | `MSH_TOO_SHORT`               | `MSH\|^~` (6 bytes) — readDelimiters requires `length >= 8`                                                       |
| `invalid-encoding-characters.hl7`   | 78    | `INVALID_ENCODING_CHARACTERS` | `MSH\|^~\|SENDAPP\|...` — slice(4,8) = `^~\|S`; field separator `\|` reappears among the 4 encoding chars         |

Each fixture was verified via a `dist/index.cjs` Node probe to throw the expected code with populated `position` (segmentIndex: 0) and non-undefined `snippet` (empty string for EMPTY_INPUT, up to 40-char excerpt otherwise).

**Per-directory README** — documents the filename contract, source-of-truth pointer to `src/parser/errors.ts::FATAL_CODES`, co-trigger policy (fatals short-circuit — no fixture can co-trigger), adding-new-fixture instructions, and alternative-trigger notes for INVALID_ENCODING_CHARACTERS (MSH-1 whitespace, MSH-2 duplicates, MSH-2 whitespace).

**Sweep** (`test/parser-malformed-sweep.test.ts`):

- `readdirSync` over `test/fixtures/malformed/` + `describe.each` — adds a fixture, auto-joins the sweep with zero test-file edits
- Each fixture tested twice: lenient mode (Hl7ParseError with code+position+snippet) and strict mode (same throw; Tier-3 mode-independence)
- Uses the existing `test/_helpers/fixture-code.ts::fileToCode` helper — same pure string transform that powers the vendor-quirks sweep, proving the helper is enum-agnostic
- 1 count-assertion ("directory contains exactly 4 fixtures") + 4 × 2 lenient/strict blocks = 9 tests, all passing

## Requirements Closed

- **TEST-04** — Malformed messages throw `Hl7ParseError` with descriptive position/snippet; all 4 Tier-3 fatal codes (NO_MSH_SEGMENT, MSH_TOO_SHORT, INVALID_ENCODING_CHARACTERS, EMPTY_INPUT) exercised.

## Commits

| Task | Hash    | Subject                                                                  |
| ---- | ------- | ------------------------------------------------------------------------ |
| 1    | 7110694 | `test(07-05): add 4 malformed fixtures + README (TEST-04 scaffolding)`   |
| 2    | 0490069 | `test(07-05): add parser-malformed-sweep.test.ts (TEST-04)`              |

## Deviations from Plan

None — plan executed exactly as written. The PLAN body suggested `MSH|^~|...` as the invalid-encoding trigger and the parser's `readDelimiters` confirmed the match (slice(4,8) includes the field separator `|`, hitting the "field separator must not appear among MSH-2 encoding characters" branch). No fixture body adjustment needed.

## Authentication Gates

None — pure test-only changes.

## Verification

- `pnpm test` → 824 passed / 14 todo across 59 test files (was 815 / 14 baseline; +9 passing delta, all from the new sweep)
- `pnpm typecheck` → clean
- `pnpm lint --max-warnings=0` → clean
- Manual `dist/index.cjs` probe for each fixture confirmed code + position + snippet match the filename's `fileToCode` output in BOTH lenient and strict mode

## Notes for Downstream Agents

- **No src/ changes.** The parser's fatal-error paths are untouched — fixtures exercise existing Phase 2 behaviour.
- **No surprises re: err.position / err.snippet.** All 4 throw sites populate both fields correctly. No missing-field findings to flag for Plan 06 / verifier.
- **The `invalid-encoding-characters.hl7` fixture hits the "field separator reappears in MSH-2" branch** — one of four INVALID_ENCODING_CHARACTERS triggers in `readDelimiters`. The README documents the other three (MSH-1 whitespace, MSH-2 duplicates, MSH-2 whitespace) so a future fuzzing plan or migration can cover all four without re-deriving them.
- **Filename ↔ code contract holds uniformly across warnings (Plan 04) and fatals (Plan 05).** Both sweeps consume the same `fileToCode` helper without modification; the helper was designed enum-agnostic in Plan 01 for exactly this reason.

## Self-Check: PASSED

- [x] test/fixtures/malformed/empty-input.hl7 exists (0 bytes verified)
- [x] test/fixtures/malformed/no-msh-segment.hl7 exists
- [x] test/fixtures/malformed/msh-too-short.hl7 exists
- [x] test/fixtures/malformed/invalid-encoding-characters.hl7 exists
- [x] test/fixtures/malformed/README.md exists
- [x] test/parser-malformed-sweep.test.ts exists
- [x] Commit 7110694 present in git log
- [x] Commit 0490069 present in git log
- [x] pnpm test: 824 passed
- [x] pnpm typecheck: clean
- [x] pnpm lint: clean
