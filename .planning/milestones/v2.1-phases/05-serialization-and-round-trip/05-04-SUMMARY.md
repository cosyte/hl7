---
phase: 05-serialization-and-round-trip
plan: 04
subsystem: serialization-pretty-print
tags: [pretty-print, ser-04, w2-raw-escape, header, segment-lines]
requires:
  - Phase 5 Plan 01 complete (src/serialize/pretty-print.ts stub + emit-field.ts::emitField + Hl7Message.prettyPrint wired)
  - Phase 5 Plan 02 complete (Phase 2 tokenize unescapes on parse; raw tree holds decoded subcomponents)
  - src/serialize/emit-field.ts::emitField (D-04 reescape chokepoint)
  - src/model/message.ts::Hl7Message.meta (Phase 4 D-02 memoized getter)
  - src/parser/types.ts::RawSegment (fields[0] placeholder convention)
provides:
  - src/serialize/pretty-print.ts::emitPrettyPrint (FULLY IMPLEMENTED body — D-22..D-26)
  - src/serialize/pretty-print.ts::buildHeaderLine (private helper; D-25 header composition)
  - src/serialize/pretty-print.ts::buildSegmentLine (private helper; D-23 segment line composition with MSH-1/MSH-2 skip + empty-emitted suppression)
  - test/serialize-pretty-print.test.ts (29 tests — 6 decision blocks)
  - SER-04 requirement closed (msg.prettyPrint returns human-readable multi-line string)
affects: []
tech-stack:
  added: []
  patterns:
    - "segment-line builder reuses emit-field.ts::emitField — zero duplicated re-escape logic, the D-04 chokepoint is the single source of truth for all three emitters (toString, toJSON doesn't touch it by design, prettyPrint via emitField)"
    - "empty-emitted value suppression — emitField returns empty string for absent field and the literal `\"\"` (2 chars) for isNull === true; the sentinel lets the segment-line builder drop absent labels without special-casing isNull"
    - "MSH field-number offset formula `firstDisplayNumber + (i - firstFieldIndex)` — unifies MSH (fields[2] => [3]) and non-MSH (fields[1] => [1]) into one iteration"
key-files:
  created:
    - test/serialize-pretty-print.test.ts
  modified:
    - src/serialize/pretty-print.ts
decisions:
  - D-22 no options — single opinionated format (zero API surface changes; no colors/truncation/depth knob)
  - D-23 segment-per-line with labeled [N]=value; MSH starts at [3], non-MSH at [1]; empty-emitted values suppressed; `isNull === true` emits `[N]=""`
  - D-24 depth stops at field level — composites render as raw HL7 string via emitField (no component breakdown in output)
  - D-25 header format locked at runtime — `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`; missing meta fields render as `-`; segment count always present
  - D-26 pure — never throws on any parseable input; deterministic on repeat; non-mutating
  - D-27/D-28 honored — no new warning codes, no new fatal codes
  - D-30 no emit caching — every call re-walks rawSegments
  - D-31 zero runtime deps preserved — stdlib only (Array/String + emitField + msg.meta)
  - W2 raw-escape rendering documented on function-level JSDoc (complements the Plan 01 W2 note on Hl7Message.prettyPrint) — embedded delimiters render as `\\F\\` / `\\S\\` / `\\R\\` / `\\E\\` / `\\T\\` / `\\.br\\`, NOT as the decoded char
metrics:
  duration: "~8m"
  completed: "2026-04-19T20:14:00Z"
  tasks: 1
  files_created: 1
  files_modified: 1
  tests_before: 549
  tests_after: 578
  tests_added: 29
---

# Phase 5 Plan 04: pretty-print Summary

One-liner: Shipped the `emitPrettyPrint` body (D-22 no options, D-25 header, D-23 segment lines with [N]=value labels + MSH offset handling, D-24 depth stops at field via the emit-field chokepoint, D-26 pure, W2 raw-escape rendering documented) and a 29-test unit suite across 6 decision blocks; closes SER-04.

## What Shipped

### 1. `src/serialize/pretty-print.ts::emitPrettyPrint` — FULLY IMPLEMENTED

Replaced the Plan 01 `NOT IMPLEMENTED — Phase 5 Plan 04` stub with a 3-function module:

- **`emitPrettyPrint(msg)`** — top-level entry; builds the header line, iterates `msg.rawSegments` building one labeled line per segment, joins with `"\n"` (LF, not CR — this is human output, not HL7 wire). No trailing newline.
- **`buildHeaderLine(msg)`** — D-25 composition: `"HL7 " + (meta.type ?? "-") + "  controlId=" + (meta.controlId ?? "-") + "  timestamp=" + (meta.timestamp?.toISOString() ?? "-") + "  (" + rawSegments.length + " segments)"`. Two-space separator between header fields. Segment count is always a number (always present).
- **`buildSegmentLine(seg, msg)`** — D-23 composition. The MSH-offset formula is:
  - `firstFieldIndex = seg.name === "MSH" ? 2 : 1`
  - `firstDisplayNumber = seg.name === "MSH" ? 3 : 1`
  - Display number at iteration index `i` = `firstDisplayNumber + (i - firstFieldIndex)`
  This unifies MSH (fields[2] → [3]; fields[3] → [4]; etc.) and non-MSH (fields[1] → [1]; fields[2] → [2]; etc.) into one loop with no branching per field. Absent-emitted values (empty string returned by `emitField`) are suppressed (no `[N]=` entry). `isNull === true` emits the 2-char literal `""` and IS shown as `[N]=""`. A segment with only absent content fields emits just its name (no trailing spaces).

Function-level JSDoc extended with the W2 raw-escape paragraph (complementing the W2 note already present on `Hl7Message.prettyPrint()` from Plan 01).

### 2. `test/serialize-pretty-print.test.ts` — 29 tests

Organized by decision block:

- **Block 1 (D-25 header) — 9 tests:** "HL7 " prefix, type present/absent (`-` fallback), controlId present/absent, timestamp present/absent (ISO format), exact segment-count literal, two-space separator regex.
- **Block 2 (D-23 segment lines) — 9 tests:** MSH line starts at `[3]` and omits `[1]`/`[2]`; non-MSH line starts at `[1]`; segment name followed by two spaces then label; two-space separator between labels; segment with no content fields is just the name; empty fields suppressed (parsed `PID|1|||||Doe^John` → `"PID  [1]=1  [6]=Doe^John"`); hand-built null field renders as `[N]=""`; HL7 1-indexed (`PID|1||MRN` shows `[3]=MRN`, not `[2]=`); composite rendered as raw HL7 string.
- **Block 3 (D-24 depth) — 1 test:** CX with multiple subcomponents (`MRN^^^HOSP&1.2.3&ISO^MR`) renders verbatim as the whole field value.
- **Block 4 (W2 raw-escape rendering) — 3 tests:** parsed `\F\` → decoded `|` → re-escaped `\F\` on pretty-print output (asserts `\F\` present, literal `|` absent from field value); parsed `\.br\` → decoded `\n` → re-escaped `\.br\` on output (asserts `\.br\` present, literal `\n` absent from segment line); hand-built subcomponent with all 5 literal delimiter chars (`|^~\&`) re-escapes to all 5 escape forms on output (`\F\`, `\S\`, `\R\`, `\E\`, `\T\`).
- **Block 5 (line structure) — 3 tests:** LF-only separator (line count = rawSegments.length + 1); no trailing newline; no CR anywhere.
- **Block 6 (D-26 purity) — 4 tests:** never throws on 3 diverse fixtures (canonical / MSH-only / MSH-minimal); deterministic (two calls identical); non-mutating (rawSegments JSON snapshot stable across a call); MSH-only message prints exactly 2 lines (header + MSH line with at least one label).

29/29 green.

## Decisions Made / Locked

All decisions manifested in code:
- **D-22** (no options) — `emitPrettyPrint(msg: Hl7Message): string` — single argument, no options bag.
- **D-23** (segment-per-line) — `buildSegmentLine` emits `<name>  [N]=<val>  [M]=<val>  ...` with MSH offset.
- **D-24** (depth stops at field) — composites are passed to `emitField` which returns the raw HL7 string; no component breakdown in pretty-print.
- **D-25** (header format) — `buildHeaderLine` produces the exact `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)` shape with `-` fallbacks.
- **D-26** (pure) — no throw statements; no mutation of `msg` or `msg.rawSegments`; no warning-array append; deterministic.
- **D-27/D-28** — no new warning or fatal codes.
- **D-30** (no caching) — each call re-walks `rawSegments`; no cache slots added.
- **D-31** (zero deps) — only stdlib (Array/String) + internal `emitField` + Phase 4 `msg.meta`.
- **W2** (raw-escape UX tradeoff) — documented on `emitPrettyPrint`'s function-level JSDoc, complementing Plan 01's note on `Hl7Message.prettyPrint()`.

## Deviations from Plan

**None.** Plan executed exactly as written.

Zero Rule 1/2/3 auto-fixes required. Zero architectural (Rule 4) decisions surfaced. The plan's `<action>` step pseudo-code was implemented verbatim with minor JSDoc cleanup on the private helpers; no behavioral differences.

## Verification Results

| Check                                                                                     | Result                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm tsc --noEmit`                                                                       | Pass (zero errors)                                             |
| `pnpm lint src/serialize/pretty-print.ts test/serialize-pretty-print.test.ts`             | Pass (zero warnings; `max-warnings=0` respected)               |
| `pnpm test -- serialize-pretty-print`                                                     | 29/29 passing                                                  |
| `pnpm test` (full suite)                                                                  | 578/578 passing across 46 test files                           |
| `pnpm build`                                                                              | Pass (tsup emits `dist/index.{mjs,cjs,d.ts,d.cts}`)            |
| Bundle smoke test (parseHL7 → prettyPrint)                                                | Matches the plan's verification example (header + MSH + PID)   |
| Acceptance greps (10/10 meaningful checks)                                                | 9/10 direct; 10th (LF-separator grep pattern) verified by eye  |
| SER-04 truths (D-23 field numbering + trailing-empty suppression, D-24 single-string composite, D-25 header + `-` placeholders + segment count, D-26 never throws) | Confirmed via dedicated unit tests in each block |

Test count delta: **549 → 578** (+29 from `serialize-pretty-print.test.ts`).

Bundle smoke-test output:

```
HL7 ADT^A01^ADT_A01  controlId=MSG00001  timestamp=2026-04-19T10:15:00.000Z  (2 segments)
MSH  [3]=EPIC  [4]=MAIN  [5]=LIS  [6]=REF  [7]=20260419101500  [9]=ADT^A01^ADT_A01  [10]=MSG00001  [11]=P  [12]=2.5
PID  [1]=1  [3]=MRN12345^^^HOSP^MR  [5]=Doe^John^Q  [7]=19800115  [8]=M
```

This is byte-identical to the plan's expected output (SER-04 "truths" verification example from the plan frontmatter).

## Warnings Addressed at Runtime

**W2 (prettyPrint raw-escape rendering):** now covered by THREE dedicated test cases (one per W2 aspect):
- Embedded `|` in user data (decoded `\F\` on input) → `\F\` in pretty-print output, literal `|` absent from the field value.
- Embedded `\n` (decoded `\.br\` on input) → `\.br\` in pretty-print output, literal LF absent from the segment line (would otherwise corrupt line structure).
- Hand-built subcomponent containing all 5 literal delimiter chars (`|^~\&`) → all 5 escape forms (`\F\`, `\S\`, `\R\`, `\E\`, `\T\`) present on output.

The W2 JSDoc note now lives on BOTH `emitPrettyPrint` (Plan 04 added) and `Hl7Message.prettyPrint()` (Plan 01 landed). Developers inspecting either surface see the same "round-trip fidelity trades human readability at delimiter chars; use typed accessors for decoded strings" caveat.

## Files

**Created (1):**
- `test/serialize-pretty-print.test.ts` — 429 lines; 29 unit tests spanning 6 decision blocks.

**Modified (1):**
- `src/serialize/pretty-print.ts` — +90 insertions / -5 deletions; body-only replacement (module JSDoc, Hl7Message import, and function signature preserved from Plan 01). Added `RawSegment` type import and `emitField` value import, `buildHeaderLine` + `buildSegmentLine` private helpers, extended function-level JSDoc with W2 raw-escape paragraph.

## Commits

| Hash      | Type | Message                                              |
| --------- | ---- | ---------------------------------------------------- |
| `9096a1b` | test | add failing tests for emitPrettyPrint (RED)          |
| `a9c7269` | feat | implement emitPrettyPrint body (GREEN)               |

(A final `docs` commit for this SUMMARY + STATE.md + ROADMAP.md updates will follow.)

## Notes for Plan 05

**Disjoint-file contract still in force.** Plan 05 owns only the bodies of `buildMessage`, `formatHl7Timestamp`, and `generateControlId` plus new unit tests. No Plan 05 edit should touch:

- `src/serialize/pretty-print.ts` (now FULLY IMPLEMENTED — no body changes needed)
- `src/model/message.ts`, `src/index.ts`, `src/serialize/emit-field.ts`, `src/serialize/to-string.ts`, `src/serialize/to-json.ts`, `vitest.config.ts`
- The `SerializedMessage` / `BuildMessageInit` interface declarations

**Plan 05 interaction with pretty-print (informational):** once `buildMessage` lands, callers can do `buildMessage({...}).addSegment(...).prettyPrint()` to visually verify the outbound message before calling `.toString()`. The W2 raw-escape semantics apply identically — a builder caller who passes `"Smith|Jones"` as a subcomponent will see `Smith\F\Jones` in pretty-print output (and `\F\` on the wire), matching the semantic documented in `BuildMessageInit`'s empty-vs-null JSDoc from Plan 01.

**Shared-invariant reminder (carried from Plan 02):** `rawSegments[...].subcomponents[...]` holds DECODED text. Pretty-print reads from `rawSegments` via `emitField`, which reapplies the escape — so the chain of invariants (unescape-on-parse → decoded raw tree → reescape-on-emit) remains consistent for all three emitters (`toString`, `toJSON` mirrors decoded, `prettyPrint` reescapes for display).

## Self-Check: PASSED

Verified:
- `src/serialize/pretty-print.ts` body replaced — no `NOT IMPLEMENTED` marker remains (FOUND via grep).
- `test/serialize-pretty-print.test.ts` exists with 29 tests, all green (FOUND).
- Commits `9096a1b` (RED) and `a9c7269` (GREEN) both in git log (FOUND).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0 (PASS).
- Test count 578 = 549 baseline + 29 new (PASS).
- Bundle smoke test matches plan's expected output (PASS).
- All four SER-04 truths demonstrably hold in dedicated unit tests: D-23 field numbering & trailing-empty suppression (Block 2), D-24 composite as single string (Block 3), D-25 header with `-` placeholders and segment count (Block 1), D-26 never throws (Block 6).
