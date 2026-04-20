---
phase: 07-testing-hardening-and-fixtures
plan: 03
subsystem: test-fixtures
tags: [test-fixtures, edge-cases, TEST-03, tolerance, PARSE-08, PARSE-06, PARSE-05, PARSE-02, TOL-10, HELPERS-03]
dependency-graph:
  requires:
    - test/fixtures/edge-cases/ (directory established by Plan 01 with 3 migrated fixtures)
    - src/parser/index.ts::parseHL7 (parse entry)
    - src/parser/warnings.ts::WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE
    - src/model/message.ts (Hl7Message.visit / .patient / .encodingCharacters / .rawSegments)
  provides:
    - test/fixtures/edge-cases/ (11 new fixtures — 14 total including 3 migrated)
    - test/fixtures/edge-cases/README.md (enumerates all 14 fixtures + REQ-ID map)
    - test/parser-edge-cases.test.ts (15 explicit it() blocks across 8 describe groups)
  affects:
    - None — purely additive.
tech-stack:
  added: []
  patterns:
    - "Per-scenario explicit it() blocks per CONTEXT.md D-22 (NOT a parameterized fs-scan) — each edge case has a unique assertion surface so the test file reads as documentation."
    - "Byte-precise fixture authoring via a Node script that uses explicit `\\r` / `\\n` / `\\r\\n` string concatenation, verified with `od -c` post-write."
    - "Synthetic unicode patient identifiers (Müller, Jürgen, 李, 明) per D-17 carry-forward — no PHI, no anonymized real messages."
key-files:
  created:
    - test/fixtures/edge-cases/lf-line-endings.hl7
    - test/fixtures/edge-cases/crlf-line-endings.hl7
    - test/fixtures/edge-cases/mixed-line-endings.hl7
    - test/fixtures/edge-cases/trailing-newline.hl7
    - test/fixtures/edge-cases/no-trailing-newline.hl7
    - test/fixtures/edge-cases/empty-fields.hl7
    - test/fixtures/edge-cases/consecutive-delimiters.hl7
    - test/fixtures/edge-cases/unknown-escapes.hl7
    - test/fixtures/edge-cases/custom-msh-delimiters.hl7
    - test/fixtures/edge-cases/unicode-names.hl7
    - test/fixtures/edge-cases/missing-optional-segments.hl7
    - test/fixtures/edge-cases/README.md
    - test/parser-edge-cases.test.ts
  modified: []
decisions:
  - "Fixed the plan's assertion against `encodingCharacters.fieldSeparator` / `.componentSeparator` — the actual `EncodingCharacters` interface (src/parser/types.ts) uses `.field` / `.component` / `.repetition` / `.escape` / `.subcomponent`. Updated the custom-msh-delimiters test to assert the correct property names."
  - "Split the custom-msh-delimiters scenario into two it() blocks: one asserting the full 5-field encodingCharacters discovery, one asserting downstream PID-3 component split by the custom component separator `~`. Tighter assertion surface."
  - "Split the unicode-names scenario into two it() blocks: one for initial parse, one for round-trip UTF-8 preservation. The round-trip assertion covers both Latin-1 accented (Müller/Jürgen) and CJK (李/明) in one pass."
  - "Added a second missing-optional-segments it() block asserting `msg.patient.mrn` still resolves — proves that PID-derived helpers are unaffected when PV1 is absent (HELPERS-03 contract is scoped to the visit helper, not the whole message)."
  - "Used `.toContain(\"\\\\Z99\\\\\")` in addition to `.toContain(\"Z99\")` for the unknown-escapes payload assertion — the full escape bytes (both backslashes) are preserved verbatim per TOL-10, and asserting the exact sequence catches future tokenizer regressions that might strip a single backslash."
metrics:
  duration: "~10 min"
  completed: "2026-04-20"
  tests-delta: "+15 (774 -> 789): 15 new it() blocks in test/parser-edge-cases.test.ts"
  fixtures-delta: "+11 (3 -> 14 in test/fixtures/edge-cases/)"
---

# Phase 7 Plan 03: Edge-case Fixtures + parser-edge-cases.test.ts — Summary

Authored 11 new edge-case fixtures in `test/fixtures/edge-cases/` (total 14 including the 3 migrated by Plan 01) plus `test/parser-edge-cases.test.ts` with 15 explicit `it()` blocks across 8 `describe` groups — one targeted assertion set per scenario per CONTEXT.md D-22 (NOT parameterized). TEST-03 closed.

## What changed

### Fixtures added (11 files)

| File                              | Byte-format specifics                      | REQ-ID     |
|-----------------------------------|--------------------------------------------|------------|
| lf-line-endings.hl7               | `\n` (0x0A) between segments, no trailer   | PARSE-08   |
| crlf-line-endings.hl7             | `\r\n` (0x0D 0x0A) between segments        | PARSE-08   |
| mixed-line-endings.hl7            | `\r`, `\n`, `\r\n` alternating             | PARSE-08   |
| trailing-newline.hl7              | `\r` separators + single trailing `\r`     | PARSE-08   |
| no-trailing-newline.hl7           | `\r` separators, no trailer (baseline)     | PARSE-08   |
| empty-fields.hl7                  | PID with `||` runs (empty, not null)       | PARSE-06   |
| consecutive-delimiters.hl7        | PID with trailing 10-pipe run              | PARSE-05   |
| unknown-escapes.hl7               | OBX-5 = `Some text with \Z99\ embedded`    | TOL-10     |
| custom-msh-delimiters.hl7         | MSH-1=`@`, MSH-2=`~&#\`                    | PARSE-02   |
| unicode-names.hl7                 | PID-5 = `Müller^Jürgen~李^明`              | PARSE-09   |
| missing-optional-segments.hl7     | MSH+EVN+PID only (no PV1)                  | HELPERS-03 |

All byte formats verified post-write with `od -c`. Synthetic patient identifiers only (MRN-LF-001, MRN-CRLF-001, etc. + synthetic unicode names per D-17).

### README.md (edge-cases/)

Enumerates all 14 edge-case fixtures (3 migrated + 11 new) with a | File | Scenario | REQ-ID | Expected behavior | table. Explicitly contrasts with `vendor-quirks/`'s parameterized sweep: edge-cases are per-scenario explicit because each has a unique assertion surface.

### Test file added

`test/parser-edge-cases.test.ts` — 15 `it()` blocks across 8 `describe` groups:

1. **line endings (3 its)** — LF, CRLF, mixed all parse to `[MSH, EVN, PID, PV1]` with 0 warnings (Tier-1 silent per PARSE-08).
2. **trailing-newline handling (2 its)** — trailing `\r` absorbed silently; no-trailer baseline parses to 4 segments with 0 warnings.
3. **empty vs null (1 it)** — PID-2 empty-between-pipes yields `{isNull: false, repetitions: []}`. Discriminated against `null-fields.hl7` (covered in round-trip.test.ts) which yields `isNull: true`.
4. **consecutive delimiters (1 it)** — PID `fields.length > 15` (actually 19, including name-slot index 0), proving no field is silently collapsed.
5. **unknown escape sequences (2 its)** — `UNKNOWN_ESCAPE_SEQUENCE` warning emitted; decoded OBX-5 subcomponent contains the full `\Z99\` sequence verbatim per TOL-10.
6. **custom MSH delimiters (2 its)** — all 5 `encodingCharacters` fields match the non-standard set; PID-3 MRN splits correctly on the custom component separator `~`.
7. **Unicode names (2 its)** — `Müller`, `Jürgen`, `李`, `明` all preserved on first parse AND on round-trip through `toString() → parseHL7()`.
8. **missing optional segments (2 its)** — `msg.visit === undefined` per HELPERS-03; `msg.patient.mrn === "MRN-MOS-001"` still resolves (PID-derived helpers unaffected by PV1 absence).

All `it()` blocks are explicit per CONTEXT.md D-22 — no `describe.each`, no `readdirSync`. Verified: `grep -c 'describe.each\|readdirSync' test/parser-edge-cases.test.ts` returns 0.

## Verification

- `pnpm test test/parser-edge-cases.test.ts` — 15/15 green
- `pnpm test` (full suite) — 789/789 green (+15 from Plan 02 baseline 774)
- `pnpm typecheck` — clean
- `pnpm lint --max-warnings=0` — clean

## Key contracts confirmed during test authoring

While writing assertions I probed the actual parser output (see `STATE.md` tests-delta note for Plan 06 / TEST-08 audit downstream reference):

- **`RawField` empty vs null (PARSE-06):** empty-between-pipes produces `{repetitions: [], isNull: false}`; null sentinel `""` produces `{repetitions: [], isNull: true}`. The `repetitions.length === 0` fact is shared between both, so `isNull` is the sole discriminant. (Null case exercised in `round-trip.test.ts` Plan 01 preservation block.)
- **`encodingCharacters` interface shape (src/parser/types.ts:180-186):** `{ field, component, repetition, escape, subcomponent }` — NOT `fieldSeparator` / `componentSeparator`. The plan's original assertion used the wrong property names; corrected during execution.
- **`UNKNOWN_ESCAPE_SEQUENCE` verbatim preservation (TOL-10):** The decoded subcomponent string contains the FULL escape byte sequence — both backslashes plus the payload (e.g., `"Some text with \Z99\ embedded"` where `\Z99\` is literal backslash + Z99 + literal backslash). The parser does not strip a single `\`.
- **Custom delimiter discovery (PARSE-02):** MSH-1 provides the field separator; MSH-2 provides 4 chars in order `[component, repetition, escape, subcomponent]`. Subsequent segments correctly tokenize with the custom set. Fixture used `@` / `~` / `&` / `#` / `\` to prove the full 5-char set is honored.
- **`msg.visit` lazy-undefined (HELPERS-03):** When no PV1 segment exists, `msg.visit === undefined` (not a partially-populated Visit, not a throw). PID-derived helpers (`msg.patient.*`) remain functional — the visit helper's undefined-return is scoped to visit-only.
- **Mixed line endings (PARSE-08):** The normalizer absorbs any combination of `\r`, `\n`, `\r\n` between segments silently — no `line-endings`-style warning code exists because it's Tier-1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed wrong `encodingCharacters` property names in planned assertion**
- **Found during:** Task 2 probe
- **Issue:** The plan's planned test asserted `msg.encodingCharacters.fieldSeparator` / `.componentSeparator`. The actual `EncodingCharacters` interface (`src/parser/types.ts:180-186`) uses `.field` / `.component` / `.repetition` / `.escape` / `.subcomponent`.
- **Fix:** Updated assertion to use the correct 5-property names. Added assertions for all 5 fields to lock in the full custom delimiter discovery surface.
- **Files modified:** `test/parser-edge-cases.test.ts` (during initial authoring — never committed with the wrong names)
- **Commit:** `a934437`

### Enhancements (not bugs, but beyond the plan's stated minimum)

**2. Split two scenarios into 2 it() blocks each** (still explicit per D-22)
- **custom-msh-delimiters:** separated delimiter discovery from PID-3 component split so one assertion per concern.
- **unicode-names:** separated initial parse from round-trip round-trip preservation.
- **missing-optional-segments:** added a second it() asserting `msg.patient.mrn` still resolves — proves HELPERS-03's undefined is scoped to visit, not a full helper blackout.
- **Rationale:** Total 15 it() > plan's minimum 11; tighter assertion surface per test; failure output names the exact concern.

### None blocked

No architectural decisions surfaced; no authentication gates; no structural changes required to `src/`.

## Self-Check: PASSED

- `test/fixtures/edge-cases/lf-line-endings.hl7` → FOUND
- `test/fixtures/edge-cases/crlf-line-endings.hl7` → FOUND
- `test/fixtures/edge-cases/mixed-line-endings.hl7` → FOUND
- `test/fixtures/edge-cases/trailing-newline.hl7` → FOUND
- `test/fixtures/edge-cases/no-trailing-newline.hl7` → FOUND
- `test/fixtures/edge-cases/empty-fields.hl7` → FOUND
- `test/fixtures/edge-cases/consecutive-delimiters.hl7` → FOUND
- `test/fixtures/edge-cases/unknown-escapes.hl7` → FOUND
- `test/fixtures/edge-cases/custom-msh-delimiters.hl7` → FOUND
- `test/fixtures/edge-cases/unicode-names.hl7` → FOUND
- `test/fixtures/edge-cases/missing-optional-segments.hl7` → FOUND
- `test/fixtures/edge-cases/README.md` → FOUND
- `test/parser-edge-cases.test.ts` → FOUND
- Commit `ad4964a` (Task 1 — 11 fixtures + README) → FOUND
- Commit `a934437` (Task 2 — test file with 15 its) → FOUND
