---
phase: 02-core-parser-and-tolerance
plan: 03
subsystem: parser
tags: [tokenizer, segments, delimiters, tdd, wave-2, tier-3, tier-2]
wave: 2
requires:
  - Hl7ParseError
  - FATAL_CODES
  - EncodingCharacters
  - Hl7Position
  - RawSegment
  - RawField
  - RawRepetition
  - RawComponent
  - Hl7ParseWarning
  - fieldWhitespaceTrimmed
  - WARNING_CODES
provides:
  - splitSegments
  - snippet
  - readDelimiters
  - DEFAULT_ENCODING_CHARACTERS
  - tokenize
affects:
  - src/index.ts (unchanged — barrel update deferred to Plan 06)
tech-stack:
  added: []
  patterns:
    - "Unified HL7 1-indexed fields[] convention adopted for ALL segments (MSH + non-MSH): fields[0] is the name/separator placeholder slot, fields[N>=1] is the HL7 N-th field."
    - "Single-pass iterative tokenization via String.split() only — no regex, no recursion — to keep T-02-03-01 DoS surface bounded."
    - "Fatal errors carry segmentIndex=0 plus a bounded 40-char snippet (shared snippet() helper exported from segments.ts)."
    - "Empty middle segments preserved as zero-field RawSegment{ name: '', fields: [] } so downstream segmentIndex positions stay stable against the original input."
    - "Whitespace trim (TOL-07) suppresses warning emission on all-whitespace fields so senders that pad every field do not generate noise."
key-files:
  created:
    - src/parser/segments.ts
    - src/parser/delimiters.ts
    - src/parser/tokenize.ts
    - test/parser-segments.test.ts
    - test/parser-delimiters.test.ts
    - test/parser-tokenize.test.ts
  modified: []
decisions:
  - "Unified 1-indexed fields[] convention applies to MSH AND non-MSH — MSH synthesizes fields[0] = field-separator placeholder and fields[1] = encoding-chars string; non-MSH synthesizes fields[0] = segment-name placeholder. Plan 06's extractVersion (reads msh.fields[11]) and Phase 4's msg.meta both depend on this shape."
  - "splitSegments preserves empty middle segments (PARSE-04 segment order stability) but drops a SINGLE trailing \\r (universal HL7 convention). Empty input returns []."
  - "readDelimiters rejects field-separator collision with MSH-2 encoding chars (T-02-03-02 Tampering mitigation). This is not strictly spec but prevents a maliciously crafted MSH from collapsing delimiters downstream."
  - "FIELD_WHITESPACE_TRIMMED is suppressed for all-whitespace field values (trimmed.length === 0) — prevents noise from padded all-blank fields that have no non-whitespace content to preserve."
  - "Internal intermediate objects (RawField / RawRepetition / RawComponent) are NOT Object.freeze'd inside tokenize — freezing happens only at the Hl7Message boundary in Plan 01's constructor. Keeps hot-path allocation cheap."
  - "snippet() is exported from segments.ts (marked @internal) rather than duplicated in delimiters.ts, so Plan 06's emitWarning chokepoint can reuse the same 40-char truncation for its strict-mode error snippets."
metrics:
  duration: "~6 min"
  tasks-completed: 2
  tasks-total: 2
  tests-added: 32
  files-created: 6
  completed: 2026-04-18T16:48:00Z
---

# Phase 2 Plan 03: Segments, Delimiters, and Tokenize — Summary

Ship the core tokenizer pipeline: segment splitting, MSH delimiter
discovery with 3 of 4 Tier-3 fatals, and field / repetition / component /
subcomponent decomposition that honors custom encoding characters,
distinguishes empty from null, and emits whitespace-trim warnings.

## What Shipped

**Source files (3):**

- `src/parser/segments.ts` — `splitSegments(normalized): readonly string[]`
  mechanically splits a normalized input on `\r`. Drops a single trailing
  `\r` to avoid spurious empty final segments; preserves empty middle
  segments so `segmentIndex` stays stable against the original input.
  Also exports `snippet(segment): string` (@internal) — a 40-char bounded
  truncation helper reused by `delimiters.ts` for fatal-error snippets
  and available to Plan 06's strict-mode emitter.

- `src/parser/delimiters.ts` — `readDelimiters(firstSegment): EncodingCharacters`
  reads MSH-1 (field separator) and MSH-2 (4 encoding chars) from the first
  segment and throws `Hl7ParseError` with one of three Tier-3 codes:
  `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, or `INVALID_ENCODING_CHARACTERS`.
  The INVALID case covers all four malformed MSH-2 subcases (wrong length,
  duplicates, whitespace in MSH-1 or MSH-2, and field-separator collision).
  Every fatal carries `{ segmentIndex: 0 }` plus a bounded snippet.
  Also exports `DEFAULT_ENCODING_CHARACTERS` for synthetic-message
  construction and Plan 04/06 re-use.

- `src/parser/tokenize.ts` — `tokenize(segments, enc, emit, trimFields): readonly RawSegment[]`
  produces the nested positional tree. MSH and non-MSH segments both
  follow the unified HL7 1-indexed `fields[]` convention (see below).
  Splits repetitions on `enc.repetition`, components on `enc.component`,
  subcomponents on `enc.subcomponent`. Distinguishes empty `||` fields
  (`isNull: false`) from explicit null `""` (`isNull: true`). Emits
  `FIELD_WHITESPACE_TRIMMED` when `trimFields=true` and a field had
  non-trivial surrounding whitespace; suppresses the warning on
  all-whitespace fields. Only `tokenize` is exported; four internal
  helpers (`tokenizeMshSegment`, `splitAndTokenizeFields`,
  `tokenizeField`, `tokenizeRepetition`, `tokenizeComponent`) keep the
  surface minimal.

**Test files (3):** 32 cases total, all passing.

- `test/parser-segments.test.ts` — 7 cases (splitSegments + snippet).
- `test/parser-delimiters.test.ts` — 10 cases (default + custom
  delimiters, all three Tier-3 fatal codes including whitespace and
  field-separator-collision subcases, position/snippet shape, default
  constant).
- `test/parser-tokenize.test.ts` — 15 cases (structure + ordering, the
  1-indexed convention for MSH + non-MSH, repetition / component /
  subcomponent splits, custom delimiters, empty vs null per PARSE-06,
  whitespace trim + warning emission + suppression + fieldIndex
  correctness per TOL-07, segment-name case preservation, empty middle
  segments).

## Unified 1-Indexed `fields[]` Convention (LOCKED)

This plan ratifies the convention Plan 01 laid groundwork for (in
`RawSegment.fields` JSDoc) and that Plan 06 will rely on:

**For ALL segments, `fields[0]` is the segment name / separator
placeholder slot (never a data field). `fields[N]` for `N >= 1` is the
HL7 N-th field.**

- **MSH:**
  - `fields[0]` = single-component holding the field-separator char
    (e.g. `"|"`). This is HL7 MSH-1 encoded in-band.
  - `fields[1]` = single-component holding the encoding-chars string
    (e.g. `"^~\&"`). This is HL7 MSH-2.
  - `fields[2]` = MSH-3, `fields[3]` = MSH-4, ..., `fields[11]` =
    MSH-12 (version ID).

- **Non-MSH (PID, EVN, ZPI, OBX, ...):**
  - `fields[0]` = single-component holding the segment name string
    (e.g. `"PID"`).
  - `fields[1]` = PID-1, `fields[2]` = PID-2, ....

Warnings emitted by `tokenize` use the HL7 1-indexed `fieldIndex` on
their `position` — a trim warning on PID-1 emits `fieldIndex: 1`, and
a trim warning on MSH-3 emits `fieldIndex: 3`. Non-MSH calls pass
`fieldStartOffset = 0`; MSH calls pass `fieldStartOffset = 2` (because
MSH-1 and MSH-2 are synthesized above). Phase 4's `msg.meta.version`
will read `msg.segments[0]?.fields[11]` and Plan 06's `extractVersion`
will do the same.

## REQ-IDs Closed (parser primitives layer)

Runtime end-to-end verification is Plan 06's job; this plan closes the
per-primitive implementation and test coverage:

- **PARSE-02** (custom delimiters) — `readDelimiters` extracts the full
  5-tuple from MSH-1/MSH-2 including non-default chars; `tokenize`
  splits on the discovered chars (not hardcoded defaults). Demonstrated
  by `parser-delimiters.test.ts` "reads custom encoding characters"
  and `parser-tokenize.test.ts` "honors custom encoding characters".

- **PARSE-04** (segment order preserved) — `splitSegments` is a pure
  `String.split("\r")` after a single-trailing-CR strip; empty middle
  segments are preserved. `tokenize` maps 1:1 over the split array so
  order and index stability hold across the full pipeline. Demonstrated
  by `parser-segments.test.ts` "splits on \r and preserves order" +
  "preserves an empty middle segment" and `parser-tokenize.test.ts`
  "preserves empty middle segments".

- **PARSE-05** (field/rep/comp/sub hierarchy) — `tokenize` produces the
  full four-level nested tree via separate helpers for each level.
  Demonstrated by the three dedicated split tests in
  `parser-tokenize.test.ts`.

- **PARSE-06** (empty vs null) — `tokenizeField` branches on `raw === ""`
  (empty, `isNull: false`) vs `raw === '""'` (explicit null,
  `isNull: true`). Demonstrated by `parser-tokenize.test.ts`
  "empty field || produces isNull=false" and "explicit null field ''
  produces isNull=true".

- **TOL-07** (trimFields + warning) — `trimFields=true` default path
  emits `FIELD_WHITESPACE_TRIMMED` via `fieldWhitespaceTrimmed()`
  factory (from Plan 01) with the correct 1-indexed fieldIndex.
  `trimFields=false` leaves whitespace intact and emits nothing.
  All-whitespace values are also not trimmed to avoid noise.
  Demonstrated by 4 cases in `parser-tokenize.test.ts` (emission,
  suppression on `false`, suppression on all-whitespace, correct
  `fieldIndex`).

Fatal codes closed by this plan (3 of 4 in `FATAL_CODES`):

- `NO_MSH_SEGMENT` — first segment missing `MSH` prefix.
- `MSH_TOO_SHORT` — first segment < 8 chars.
- `INVALID_ENCODING_CHARACTERS` — MSH-2 not 4 distinct non-whitespace
  chars, OR MSH-1 whitespace, OR field separator in MSH-2.

(`EMPTY_INPUT` is owned by Plan 02's `normalize.ts`.)

## Commits

| # | Hash | Type | Message |
|---|------|------|---------|
| 1 | `49c40df` | test | `test(02-03): add failing tests for parser/segments and parser/delimiters` (RED) |
| 2 | `303fd14` | feat | `feat(02-03): add parser/segments split and parser/delimiters discovery` (GREEN) |
| 3 | `de6b1ab` | test | `test(02-03): add failing tests for parser/tokenize` (RED) |
| 4 | `c39c214` | feat | `feat(02-03): add parser/tokenize with 1-indexed fields[] convention` (GREEN) |

Two clean RED -> GREEN TDD cycles. No refactor or fix commits were
required; every file passed lint / typecheck / test on first authoring.

## Deviations from Plan

None. The plan's `<action>` blocks were followed verbatim for both
tasks. The 1-indexed `fields[]` convention was already locked in Plan 01
(see the `RawSegment.fields` JSDoc in `src/parser/types.ts`); this plan
implements it consistently.

Minor author choices inside the plan's latitude:

- Added an extra "explicit field-separator-collision with MSH-2" test
  to `parser-delimiters.test.ts` (not explicitly enumerated in the
  plan's Del test list but aligned with T-02-03-02 Tampering mitigation
  and the plan's action text which rejects that case).
- Added an "empty middle segments preserved as zero-field RawSegment"
  test to `parser-tokenize.test.ts` to document that tokenize is
  index-stable across empty-middle inputs (the plan behavior specified
  empty-middle semantics for `splitSegments` but not explicitly for
  `tokenize`; the implementation needed a branch either way so a test
  was added to lock it).

## Keys for Plan 06

Plan 06 composes the full pipeline:
`normalize` -> `stripMllp` -> `splitSegments` -> `readDelimiters` ->
`tokenize` -> construct `Hl7Message`.

1. **Pipeline wiring.** Call `splitSegments(normalized)` to get
   `readonly string[]`; call `readDelimiters(segments[0])` to get the
   `EncodingCharacters`; call `tokenize(segments, enc, emit,
   options.trimFields ?? true)` to get the `readonly RawSegment[]`. Pass
   the result to `new Hl7Message({ segments, encodingCharacters: enc,
   version: extractVersion(segments[0]), warnings, ... })`.

2. **`trimFields` default.** Plan 06's `parseHL7` options merge should
   default `trimFields` to `true` (matches TOL-07 default-lenient
   posture). `tokenize` takes the resolved boolean directly.

3. **extractVersion reads MSH-12.** Because MSH's `fields[0]` is the
   separator placeholder and `fields[1]` is the encoding chars, HL7
   MSH-12 lives at `msh.fields[11]`. A safe extract:
   `msh.fields[11]?.repetitions[0]?.components[0]?.subcomponents[0]`.
   No off-by-one — the 1-indexed convention makes `fields[N]` = HL7
   position N verbatim.

4. **strict-mode escapes existing fatals untouched.** `readDelimiters`
   throws Tier-3 fatals unconditionally (regardless of strict mode)
   because these are structural. The strict-mode chokepoint in Plan 06
   only escalates Tier-2 warnings; fatals from this plan already throw.

5. **snippet() reuse.** Plan 06's emitWarning chokepoint needs a
   `snippetFromInput(position)` helper when escalating a warning to an
   `Hl7ParseError`. The `snippet()` export from `segments.ts` provides
   the bounded 40-char truncation; Plan 06 builds the segment-lookup
   layer around it.

6. **Empty-middle segments pass through.** If the normalized input had
   consecutive `\r`s, `splitSegments` preserves the empty strings and
   `tokenize` produces a `{ name: "", fields: [] }` segment at that
   position. Plan 06 should not filter these out — downstream
   `segmentIndex` positions in warnings depend on them staying in
   place.

## Verification

All plan-level verification commands pass on `c39c214`:

```bash
pnpm typecheck   # 0 errors
pnpm lint --max-warnings=0   # 0 errors, 0 warnings
pnpm test   # 10 files, 69 tests all pass (includes prior plans)
pnpm build   # dual ESM+CJS + DTS build success
```

Plan-level test slice:

```bash
pnpm test -- --run parser-segments parser-delimiters parser-tokenize
# 3 files, 32 tests all pass
```

Coverage: the three new source files have direct unit tests covering
every public export and every fatal/warning branch. Phase 7 enforces
coverage thresholds; local runs are green.

## Known Stubs

None. Every exported symbol in this plan has a complete implementation
for its Phase 2 surface.

## Threat Surface Scan

Files created: `src/parser/segments.ts`, `src/parser/delimiters.ts`,
`src/parser/tokenize.ts`. None introduce new network endpoints,
authentication paths, file access, or trust-boundary schema changes
beyond what the plan's `<threat_model>` already identified.

- **T-02-03-01** (DoS — unbounded splitters) mitigated: every split is
  `String.split(char)` (linear, no regex backtracking); every loop is
  flat-iterative (no recursion). Input size is bounded by the caller.
- **T-02-03-02** (Tampering — encoding-chars validation) mitigated:
  `readDelimiters` rejects duplicate chars, whitespace, and the
  field-separator-in-MSH-2 collision. Demonstrated by
  `parser-delimiters.test.ts` fatal cases.
- **T-02-03-03** (Info disclosure via snippet) accepted per plan —
  snippet is truncated at 40 chars (`snippet()` in `segments.ts`).
- **T-02-03-04** (custom-delimiter tampering) mitigated: `readDelimiters`
  validates MSH-2 chars once; `tokenize` then uses those validated
  chars as plain `String.split` delimiters — no further interpretation
  of user-controlled data.

No new threats introduced.

## Self-Check: PASSED

Files verified to exist:

- `src/parser/segments.ts` — FOUND
- `src/parser/delimiters.ts` — FOUND
- `src/parser/tokenize.ts` — FOUND
- `test/parser-segments.test.ts` — FOUND
- `test/parser-delimiters.test.ts` — FOUND
- `test/parser-tokenize.test.ts` — FOUND

Commits verified in `git log`:

- `49c40df` — FOUND
- `303fd14` — FOUND
- `de6b1ab` — FOUND
- `c39c214` — FOUND
