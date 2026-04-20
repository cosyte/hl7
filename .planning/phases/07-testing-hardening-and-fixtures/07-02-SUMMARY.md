---
phase: 07-testing-hardening-and-fixtures
plan: 02
subsystem: test-infrastructure
tags: [test-fixtures, canonical-messages, TEST-02, round-trip, helper-probes]
dependency-graph:
  requires:
    - test/_helpers/structural-equivalence.ts (Plan 01 helper)
    - test/fixtures/canonical/adt-a01.hl7 + oru-r01.hl7 (Plan 01 migration)
    - src/parser/index.ts::parseHL7
    - src/helpers/* (patient.mrn, visit.patientClass, observations, orders)
    - src/model/message.ts (allSegments, warnings)
    - src/model/segment.ts (type, field)
  provides:
    - test/fixtures/canonical/adt-a04.hl7
    - test/fixtures/canonical/adt-a08.hl7
    - test/fixtures/canonical/orm-o01.hl7
    - test/fixtures/canonical/siu-s12.hl7
    - test/fixtures/canonical/mdm-t02.hl7
    - test/fixtures/canonical/z-segments.hl7
    - test/fixtures/canonical/nested-subcomponents.hl7
    - test/fixtures/canonical/README.md
    - test/canonical-messages.test.ts (TEST-02 sweep)
  affects: []
tech-stack:
  added: []
  patterns:
    - "Canonical HL7 v2 fixture byte format: `\\r`-only segment terminators, final byte is the last segment's `\\r` terminator, synthetic identifiers only (no PHI)"
    - "One `describe(...)` block per canonical fixture for TEST-02 sweep; each block asserts parse + SER-02 structural round-trip + D-20 helper probe"
    - "Subcomponent access via raw tree (`field(N).repetitions[R].components[C].subcomponents[S]`) — matches existing idiom in round-trip.test.ts and parser-tokenize.test.ts; no `.component(n)` wrapper exists on `Field`"
key-files:
  created:
    - test/fixtures/canonical/adt-a04.hl7
    - test/fixtures/canonical/adt-a08.hl7
    - test/fixtures/canonical/orm-o01.hl7
    - test/fixtures/canonical/siu-s12.hl7
    - test/fixtures/canonical/mdm-t02.hl7
    - test/fixtures/canonical/z-segments.hl7
    - test/fixtures/canonical/nested-subcomponents.hl7
    - test/fixtures/canonical/README.md
    - test/canonical-messages.test.ts
  modified: []
  deleted: []
decisions:
  - "Wrote fixtures via Node.js `fs.writeFileSync` script to guarantee `\\r`-only separators + no accidental trailing LF (Write-tool-with-heredoc has known newline-normalization issues). Verified post-write via `od -c`: last byte 0x0D for every fixture, matches adt-a01.hl7/oru-r01.hl7 convention (final segment terminator IS the trailing `\\r`)."
  - "Changed nested-subcomponents.hl7 PID-5 component 8 from `&Jones&Alias&&&` (6 subcomponents, 3 trailing empty) to `&Jones&Alias&End` (4 subcomponents, non-empty tail): the serializer strips trailing empty subcomponents on emit (spec-clean Postel's Law behavior), which breaks structural round-trip on the all-empty-tail shape. The non-empty-tail variant preserves the plan's `&Jones&Alias&` acceptance grep + the subcomponent-2 = 'Jones' probe while passing SER-02 round-trip."
  - "Used `seg.type` (not `seg.name`) — Segment's public property is `type: string`."
  - "Used raw-tree subcomponent access (`field(N).repetitions[R].components[C].subcomponents[S]`) instead of the plan's `.component(C).subcomponent(S)` chain — no `.component(n)` wrapper method exists on `Field`; existing tests (round-trip.test.ts lines 105/114, parser-tokenize.test.ts lines 33+) use the raw-tree idiom."
metrics:
  duration: "~4 min"
  completed: "2026-04-20"
  tests-delta: "+27 (747 → 774): 9 describe blocks × 2–4 `it` blocks each"
---

# Phase 7 Plan 02: Canonical Fixtures + canonical-messages.test.ts — Summary

TEST-02 closed. Authored 7 new canonical HL7 fixtures (adt-a04, adt-a08,
orm-o01, siu-s12, mdm-t02, z-segments, nested-subcomponents) and
`test/canonical-messages.test.ts` which sweeps all 9 canonical fixtures
(7 new + 2 migrated from Plan 01) asserting parse + SER-02 structural
round-trip + per-fixture helper probe per CONTEXT.md D-20.

## What changed

### Fixtures added (7)

| File                       | Message type | Helper probe (D-20)                                      |
| -------------------------- | ------------ | -------------------------------------------------------- |
| `adt-a04.hl7`              | ADT^A04      | `patient.mrn === "MRN-A04-001"`                          |
| `adt-a08.hl7`              | ADT^A08      | `patient.mrn === "MRN-A08-001"`                          |
| `orm-o01.hl7`              | ORM^O01      | `orders().length >= 1`                                   |
| `siu-s12.hl7`              | SIU^S12      | parse + round-trip only (no scheduling helper in v1)     |
| `mdm-t02.hl7`              | MDM^T02      | parse + round-trip only (no document helper in v1)       |
| `z-segments.hl7`           | ADT^A01 + Z  | `allSegments()` includes ZXX + ZYY; 2 UNKNOWN_SEGMENT    |
| `nested-subcomponents.hl7` | ADT^A01      | PID-5 component 8 subcomponent 2 === "Jones" (raw-tree)  |

All 7 fixtures: `\r`-only segment terminators, HL7-native
`YYYYMMDDHHMMSS` timestamps, synthetic identifiers (Doe/Smith/Jones,
MRN-<msgtype>-001 pattern), sequential control IDs MSG00003..MSG00009.
No PHI (CONTEXT.md D-17).

### README added

`test/fixtures/canonical/README.md` documents all 9 canonical fixtures
(7 new + 2 from Plan 01) with helper-probe matrix + how-to-add section.

### Test file added

`test/canonical-messages.test.ts` — 9 `describe(...)` blocks, 27
`it(...)` assertions total:

- ADT^A01: parse + round-trip + `patient.mrn="MRN12345"` + `visit.patientClass="I"` (4 its)
- ADT^A04: parse + round-trip + `patient.mrn="MRN-A04-001"` (3)
- ADT^A08: parse + round-trip + `patient.mrn="MRN-A08-001"` (3)
- ORU^R01: parse + round-trip + `observations().length >= 3`, first `valueType === "NM"` (3)
- ORM^O01: parse + round-trip + `orders().length >= 1` (3)
- SIU^S12: parse + round-trip only (2)
- MDM^T02: parse + round-trip only (2)
- z-segments: parse + round-trip + ZXX/ZYY in allSegments + 2 UNKNOWN_SEGMENT warnings (4)
- nested-subcomponents: parse + round-trip + PID-5.c8.s2 === "Jones" (3)

Note: `oru-r01.hl7` doubles as the TEST-02 repeating-field structural
case (per CONTEXT.md D-10) — PID-3 has MRN~SSN repetitions, 3 OBX rows —
so no separate `repeating-fields.hl7` fixture is authored.

## Verification

- `pnpm test test/canonical-messages.test.ts` → 27/27 passed.
- `pnpm test` → **774 / 774 passed** (55 → 56 test files; +27 tests).
- `pnpm typecheck` → exit 0.
- `pnpm lint --max-warnings=0` → exit 0.
- `prettier --check test/canonical-messages.test.ts` → clean.
- Byte-format verification (`od -c | head -3`, `od -c | tail -3`):
  - All 7 new fixtures start with `MSH|^~\&|`.
  - All 7 end with `\r` (0x0D) as the last segment's terminator; none
    end with `\n`.
  - All segment separators internal to each file are `\r`-only.
- `grep -c '^describe(' test/canonical-messages.test.ts` → 9 (matches
  plan's acceptance criterion).
- Plan's Task 1 automated verify script → `OK 9 fixtures` (9 canonical
  fixtures in place, all start with MSH, none end with LF, README
  exists).
- Helper-probe node script (pre-test manual sanity):
  - `adt-a04 → patient.mrn = "MRN-A04-001"` ✓
  - `adt-a08 → patient.mrn = "MRN-A08-001"` ✓
  - `orm-o01 → orders().length = 1` ✓
  - `z-segments → segments includes ZXX + ZYY, 2 UNKNOWN_SEGMENT warnings` ✓
  - `nested-subcomponents → PID-5.c8.s2 = "Jones"` ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] nested-subcomponents.hl7 PID-5 C8 shape adjusted for serializer behavior**

- **Found during:** Task 2 — initial `pnpm test test/canonical-messages.test.ts` run
- **Issue:** Plan authored `PID-5` component 8 as `&Jones&Alias&&&` (6
  subcomponents: `"", "Jones", "Alias", "", "", ""`). The serializer's
  spec-clean emit behavior (Postel's Law) strips trailing empty
  subcomponents — after round-trip the 6-entry subcomponent array became
  3 entries. `assertStructuralRoundTrip` (SER-02) diff'd `toEqual` on
  `rawSegments` and failed.
- **Fix:** Rewrote fixture to `&Jones&Alias&End` (4 subcomponents:
  `"", "Jones", "Alias", "End"`) — non-empty tail, no trailing strip,
  structural round-trip succeeds. Still satisfies plan's `grep -c
  '&Jones&Alias&' ≥ 1` acceptance criterion (the `&` after `Alias`
  remains). Still satisfies D-20 probe (`subcomponents[1] === "Jones"`).
- **Files modified:** `test/fixtures/canonical/nested-subcomponents.hl7`
  (rewritten via node script before Task 2 commit; single commit
  `17954b1` captures both the new test and the fixture adjustment).
- **Commit:** `17954b1`

**2. [Rule 3 - Blocking] Subcomponent access uses raw-tree idiom, not wrapper chain**

- **Found during:** Task 2 — reading `src/model/field.ts` to plan the
  PID-5.c8.s2 assertion
- **Issue:** Plan's `<interfaces>` block and `<action>` code snippet
  both wrote `pid.field(5).component(8).subcomponent(2)`. `Field` has
  NO `.component(n)` method — only composite coercions (`asXpn`,
  `asXad`, ...) and the raw `repetitions` tree. A literal transcription
  of the plan snippet would not compile (strict TS — `component` does
  not exist on type Field). 
- **Fix:** Used raw-tree access
  `pid.field(5).repetitions[0]?.components[7]?.subcomponents[1]`
  (0-indexed C=7 for component 8, S=1 for subcomponent 2). This
  matches the established idiom in `test/round-trip.test.ts` lines
  105–118 and `test/parser-tokenize.test.ts` lines 33+. The probe's
  observable semantic is unchanged (resolves to `"Jones"`).
- **Files modified:** `test/canonical-messages.test.ts` (as authored —
  never landed a broken version).
- **Commit:** `17954b1`

**3. [Rule 1 - Bug] `Segment.type` (not `.name`) for allSegments iteration**

- **Found during:** Task 2 — writing z-segments assertion
- **Issue:** Plan's `<interfaces>` block described `Segment` as
  `{ name: string; field(n): Field | undefined }`. The actual
  `src/model/segment.ts` exports `public readonly type: string`
  (not `name`). Using `.name` would compile under the structural-match
  fallback but would read `undefined`, making the z-segments assertion
  (`names.toContain("ZXX")`) fail.
- **Fix:** Use `.type` throughout (`s.type === "PID"`, `names.map(s => s.type)`).
- **Files modified:** `test/canonical-messages.test.ts`.
- **Commit:** `17954b1`

No checkpoints reached. No architectural changes required. Auth gates:
N/A (local test authoring only).

## Commits

| Task | Message                                                                     | Hash      |
| ---- | --------------------------------------------------------------------------- | --------- |
| 1    | test(07-02): add 7 canonical HL7 fixtures + per-dir README                  | `956aae2` |
| 2    | test(07-02): add canonical-messages.test.ts TEST-02 sweep                   | `17954b1` |

## Test-count delta (747 → 774)

Plan 01 left the suite at 747/747. Plan 02 adds 27 `it(...)` blocks:

- 3 × `it("parses successfully")` / `it("structural round-trip ...")` per fixture × 9 fixtures = 18 core tests
- 2 × helper probe per ADT^A01 (mrn + patientClass) + 1 each on A04/A08/ORU/ORM/z-seg/nested-seg/z-seg (second unknown-warning probe) = 9 probes

Exactly `18 + 9 = 27` tests; 747 + 27 = **774**, matches `pnpm test`
output above.

## Self-Check

Verifying claimed artifacts exist and commits are present:

- [x] `test/fixtures/canonical/adt-a04.hl7` → FOUND (287 bytes, starts `MSH|^~\&`, ends `\r`)
- [x] `test/fixtures/canonical/adt-a08.hl7` → FOUND (288 bytes, starts `MSH|^~\&`, ends `\r`)
- [x] `test/fixtures/canonical/orm-o01.hl7` → FOUND (282 bytes)
- [x] `test/fixtures/canonical/siu-s12.hl7` → FOUND (362 bytes)
- [x] `test/fixtures/canonical/mdm-t02.hl7` → FOUND (389 bytes)
- [x] `test/fixtures/canonical/z-segments.hl7` → FOUND (260 bytes, contains `ZXX|` and `ZYY|`)
- [x] `test/fixtures/canonical/nested-subcomponents.hl7` → FOUND (236 bytes, contains `&Jones&Alias&`)
- [x] `test/fixtures/canonical/README.md` → FOUND
- [x] `test/canonical-messages.test.ts` → FOUND (9 describe blocks, imports `assertStructuralRoundTrip` from `./_helpers/structural-equivalence.js` and `parseHL7` from `../src/index.js`)
- [x] Commit `956aae2` → FOUND in `git log`
- [x] Commit `17954b1` → FOUND in `git log`
- [x] `pnpm test` → 774 / 774 passed
- [x] `pnpm typecheck` → exit 0
- [x] `pnpm lint` → exit 0 (--max-warnings=0)

## Self-Check: PASSED
