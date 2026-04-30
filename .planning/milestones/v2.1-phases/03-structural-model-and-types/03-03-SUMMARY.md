---
phase: 03-structural-model-and-types
plan: 03
subsystem: model
tags: [hl7, composites, typescript, xtn, pl, ts, dtm, nm, timestamp]

# Dependency graph
requires:
  - phase: 02-core-parser-and-tolerance
    provides: RawRepetition/RawComponent tree, EncodingCharacters, unescape(raw, enc, emit, pos), parseHl7Timestamp cascade, DEFAULT_ENCODING_CHARACTERS
  - phase: 03-structural-model-and-types
    plan: 02
    provides: _shared.ts helpers (readComponent, readSubcomponent), hd.ts (parseHd + HD type, consumed by PL.facility nested synthesis)
provides:
  - XTN (12 v1 components) — Extended Telecommunication Number interface + parseXtn(rep, enc)
  - PL (11 v1 components) — Person Location interface + parsePl(rep, enc); demonstrates nested-HD synthesis on facility (2nd occurrence; 1st was CX.assigningAuthority)
  - TS/DTM — always-2-key shape { raw, date } interface + parseTs(rep, enc); delegates to Phase 2's parseHl7Timestamp per D-10 (zero duplicate date logic)
  - NM — always-2-key shape { raw, value } interface + parseNm(rep, enc); strict Number(raw) (not parseFloat) with NaN → undefined normalization
  - TYPES-01 complete: 10 of 10 composites shipped across Plans 02+03 (XPN, XAD, CX, CWE, CE, HD in Plan 02; XTN, PL, TS, NM here)
affects: [03-04-mutation-and-barrel, 04-helpers-and-named-access, 05-serialization, 06-profiles, 07-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Always-2-key scalar composite shape ({ raw, date } for TS, { raw, value } for NM) — distinct from the optional-field composites (XPN/XAD/CX/CWE/CE/HD/XTN/PL) because scalar HL7 types always carry BOTH the raw string and the parsed value, with the parsed value typed as `Date | undefined` / `number | undefined` so callers destructure uniformly
    - parseHl7Timestamp delegation from parseTs — the SINGLE composite that reuses a Phase 2 helper. NaN getTime normalization (D-24) is layered on top of the helper's output, not duplicated inside it
    - Strict numeric parsing via `Number(raw)` instead of `parseFloat(raw)` — trailing non-numeric characters invalidate the parse (e.g. "12abc" → undefined, not 12). Matches developer expectation for an HL7 NM field that is supposed to be purely numeric
    - Nested-HD synthesis pattern reused for PL.facility — inline parseFacility helper mirrors parseCx::parseAssigningAuthority. Now exists in 2 places (CX, PL); a 3rd occurrence would justify promoting to _shared.ts

key-files:
  created:
    - src/model/types/ts.ts
    - src/model/types/nm.ts
    - src/model/types/xtn.ts
    - src/model/types/pl.ts
    - test/types-ts.test.ts
    - test/types-nm.test.ts
    - test/types-xtn.test.ts
    - test/types-pl.test.ts
  modified: []

key-decisions:
  - "TS composite shape locked to { raw: string; date: Date | undefined } per D-14 — both keys ALWAYS present. `date` is typed as `Date | undefined` (not optional), so callers don't need to check for key presence. Matches Phase 4's expected `msg.meta.timestamp` / `msg.patient.dateOfBirth` destructure pattern."
  - "NM composite shape parallels TS: { raw: string; value: number | undefined } with both keys always present. Same destructure-friendly discipline — critical because observation values in Phase 4 will read .value uniformly whether the NM parsed or not."
  - "parseTs delegates to parseHl7Timestamp({}) — empty options, silent (no emit/position). Phase 4's `msg.meta.timestamp` helper may call parseHl7Timestamp DIRECTLY with user dateFormats/emit/position; the composite layer is intentionally stateless so Field.asTs() stays pure. D-10 zero duplicate date logic preserved."
  - "NM uses strict `Number(raw)` over `parseFloat(raw)` — the latter stops at the first non-numeric char (e.g. parseFloat('12abc') === 12) which is too permissive for HL7 NM fields that should be strictly numeric. Documented in NM file-level JSDoc so future maintainers don't 'fix' it to parseFloat."
  - "PL trimmed from 12 → 11 components for v1 (dropped entityIdentifier slot 12); XTN trimmed from 14 → 12 for v1 (dropped 2 rarely-used legacy slots 13/14). Both trimming decisions documented in interface JSDoc; v2 may restore full shapes if user feedback requires."
  - "PL's nested-HD synthesis helper (parseFacility) kept inline in pl.ts, not promoted to _shared.ts. The pattern exists in 2 places now (CX.assigningAuthority + PL.facility); DRY threshold for promoting to _shared is 3 occurrences. This keeps _shared.ts focused on truly-universal helpers (readComponent, readSubcomponent) that every composite uses."
  - "NaN normalization in TS matches the same `Number.isNaN` discipline used for NM — `parsed !== undefined && !Number.isNaN(parsed.getTime())` gates the date assignment so `new Date('20251345')` (month 13, NaN time) cannot leak through. This is the D-24 guarantee that makes TYPES-04 (no-throw) observable: callers get undefined, not an Invalid Date."
  - "Empty-subcomponent handling in parseTs/parseNm uses explicit empty-string guard rather than calling unescape first — unescape('') === '' and parseHl7Timestamp('') returns undefined, but the explicit guard makes the empty-input path obvious in code review and avoids a redundant unescape call."

patterns-established:
  - "Pattern 1 — Scalar composite with always-2-key { raw, parsed } shape: TS/NM both carry the raw string plus the parsed value as explicitly-non-optional keys. Distinguishes scalar composites (delegating to a specialized parser like parseHl7Timestamp or stdlib Number) from optional-field composites (XPN/XAD/etc where every field is optional)."
  - "Pattern 2 — parseHl7Timestamp delegation with NaN-gate: TS shows how to reuse a Phase 2 parser while adding composite-level invariants (D-24 NaN → undefined) as a POST-processing gate on the delegate's output. Prevents re-implementing date logic."
  - "Pattern 3 — Strict Number(raw) with empty-string pre-check: NM demonstrates the pattern for an HL7 scalar that JS stdlib `Number` handles almost correctly but treats empty string as 0 — the explicit empty-string guard fixes that divergence without special-casing."
  - "Pattern 4 — Inline nested-HD synthesis (parseFacility): PL.facility reuses the CX.assigningAuthority pattern without sharing code. Documents the 'inline helper vs _shared' threshold rule: promote when a 3rd occurrence appears."

requirements-completed: [TYPES-01, TYPES-03, TYPES-04]
# Notes on requirements:
# - TYPES-01 (typed composite interfaces) CLOSES here — all 10 composites now ship
#   (XPN, XAD, CX, CWE, CE, HD from Plan 02; XTN, PL, TS, NM here).
# - TYPES-03 (HL7 TS/DTM → JS Date with raw preservation) CLOSES via parseTs.
# - TYPES-04 (unparseable → undefined, no throw) CLOSES via parseTs + parseNm NaN-guard.
# - TYPES-02 (Field.asXxx() lazy coercion surface) remains open — Plan 04 wires the
#   10 parsers onto Field and ships the HL7 namespace barrel.

# Metrics
duration: 4min
completed: 2026-04-19
---

# Phase 3 Plan 03: Composites — XTN, PL, TS/DTM, NM Summary

**4 composite parsers ship, completing TYPES-01 (all 10 composites). TS delegates to Phase 2's `parseHl7Timestamp` for D-10 zero-duplicate-date-logic; NM uses strict `Number(raw)` over `parseFloat`; PL reuses the nested-HD synthesis pattern from CX for component 4 (facility); XTN mirrors the XPN pattern for 12 telecom fields.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-19T02:18:17Z
- **Completed:** 2026-04-19T02:22:10Z
- **Tasks:** 3 (Task 0 handshake sanity check + 2 TDD cycles)
- **Files created:** 8 (4 source + 4 test)
- **Files modified:** 0

## Accomplishments

- **`src/model/types/ts.ts`** — TS/DTM composite with `{ raw, date }` shape. Delegates to `parseHl7Timestamp({})` (D-10 zero duplicate date logic). Normalises calendar-invalid Date (NaN getTime) to `undefined` per D-24. No-offset → UTC (D-21); truncations to midnight/first-of-month/Jan-1 (D-22); fractional seconds via stdlib Date ms (D-23). 12 tests covering all branches.
- **`src/model/types/nm.ts`** — NM composite with `{ raw, value }` shape. Uses strict `Number(raw)` (not `parseFloat` — trailing garbage invalidates the parse). Empty-string → `value: undefined` (avoids JS's `Number("") === 0` trap). 10 tests.
- **`src/model/types/xtn.ts`** — 12-component Extended Telecommunication Number (v1 trimmed from HL7 v2.5's 14). Same Mutable<T> + conditional-assignment pattern as XPN. 7 tests covering partial-fill, full-fill, unescape, v1 trimming.
- **`src/model/types/pl.ts`** — 11-component Person Location (v1 trimmed from v2.5's 12). Component 4 (facility) uses inline `parseFacility` nested-HD synthesis helper — mirrors `parseCx::parseAssigningAuthority`. All-empty guard prevents stub HD leaks. 9 tests.
- **Full suite: 280/280 tests passing across 28 test files** (242 prior + 38 new this plan: 12 TS + 10 NM + 7 XTN + 9 PL). Typecheck, lint (`--max-warnings=0`), and build all green. Zero modifications to `src/index.ts`, `src/model/message.ts`, `src/model/segment.ts`, `src/model/field.ts`, or any file outside `src/model/types/` — Plan 03 and Plan 02 stayed truly disjoint.

## Task Commits

Each task was committed atomically with RED/GREEN split (project convention). Task 0 (handshake sanity check) required no commit — it only verified that `_shared.ts` and `hd.ts` from Plan 02 exist on disk.

1. **Task 1: TS and NM composite parsers** — `b09f279` (test), `a702ade` (feat)
2. **Task 2: XTN and PL composite parsers** — `084736e` (test), `c16c940` (feat)

## Files Created/Modified

**Created (source):**
- `src/model/types/ts.ts` — `TS` interface (2 always-present readonly keys: `raw`, `date`) + `parseTs(rep, enc): TS`. Delegates to `parseHl7Timestamp`.
- `src/model/types/nm.ts` — `NM` interface (2 always-present readonly keys: `raw`, `value`) + `parseNm(rep, enc): NM`. Uses strict `Number(raw)`.
- `src/model/types/xtn.ts` — `XTN` interface (12 optional readonly fields) + `parseXtn(rep, enc): XTN`.
- `src/model/types/pl.ts` — `PL` interface (11 optional readonly fields; 1 nested-HD field) + `parsePl(rep, enc): PL` + internal `parseFacility` helper.

**Created (test):**
- `test/types-ts.test.ts` — 12 tests.
- `test/types-nm.test.ts` — 10 tests.
- `test/types-xtn.test.ts` — 7 tests.
- `test/types-pl.test.ts` — 9 tests.

**Modified:** none.

## Decisions Made

- **Always-2-key shape for scalar composites (TS/NM)** diverges from the all-optional shape used by structured composites (XPN/XAD/CX/…). HL7 scalar types carry BOTH the raw string and the parsed value; making both keys always-present (with the parsed value typed as `Type | undefined`) lets callers destructure uniformly whether the parse succeeded or failed. Matches the D-14 lock.
- **Strict Number(raw) for NM** over `parseFloat`. `parseFloat("12abc")` returns `12` which is wrong for HL7 NM fields that should be strictly numeric. `Number("12abc")` returns `NaN`, which we normalize to `undefined`. Documented in NM JSDoc so future maintainers don't "optimize" it back to parseFloat.
- **parseTs delegates to parseHl7Timestamp with empty options** — the composite layer is stateless. Phase 4's `msg.meta.timestamp` (which DOES know `ParseOptions.dateFormats` at construction time) can call `parseHl7Timestamp` directly with user formats/emit/position for fallback semantics. Keeping Field.asTs() pure means it works identically whether the user supplied dateFormats or not.
- **parseFacility inline in pl.ts** — not promoted to `_shared.ts`. The nested-HD synthesis pattern now exists in 2 places (CX, PL); DRY threshold for promotion is 3 occurrences. `_shared.ts` stays focused on truly-universal helpers (`readComponent`, `readSubcomponent`) consumed by every composite.
- **XTN trimmed 14 → 12, PL trimmed 12 → 11 for v1** — both decisions are interface-level; the parsers silently ignore additional trailing components from the raw tree. v2 may restore the full shapes if vendor-quirk fixtures require them.

## Deviations from Plan

None. Plan executed exactly as written — both TDD tasks completed on the first pass; no Rule-1/2/3 auto-fixes; no Rule-4 architectural questions. Task 0 handshake sanity check passed immediately (Plan 02 already shipped `_shared.ts` and `hd.ts`). RED/GREEN TDD cycles matched the plan's acceptance criteria line-for-line.

## Issues Encountered

None.

## User Setup Required

None — pure code change. No environment variables, no external services, no manual configuration.

## Next Phase Readiness

**Plan 04 (capstone) ready.** All 10 composite parsers from Plans 02+03 share the `parseXxx(rep: RawRepetition, enc: EncodingCharacters): Xxx` signature. Plan 04's `Field.asXxx()` coercions reduce to:

```ts
public asTs(): TS {
  const rep = this.raw.repetitions[0];
  if (rep === undefined) return { raw: "", date: undefined };
  return parseTs(rep, this.enc);
}

public asNm(): NM {
  const rep = this.raw.repetitions[0];
  if (rep === undefined) return { raw: "", value: undefined };
  return parseNm(rep, this.enc);
}
```

TS and NM return `{ raw: "", date/value: undefined }` sentinels on missing-rep — consistent with their always-2-key shape. The 8 optional-field composites return `EMPTY_XPN` / `EMPTY_XAD` / etc `{}` sentinels.

Named exports + `HL7` namespace barrel at `src/index.ts` also land in Plan 04, exposing all 10 composite type names as named exports and under the `HL7` namespace per D-13.

**Known Stubs:** None. Every behaviour documented in the plan's must_haves truths is exercised by a passing test.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. Composite parsers are pure functions consuming an already-tokenized raw tree. T-03-03-01 mitigation (DoS via parseTs/parseNm scanning) holds because parseTs delegates to the already-audited parseHl7Timestamp (Phase 2 Plan 05 threat model covers it) and parseNm uses stdlib Number() — O(n), no recursion, no regex backtracking. T-03-03-02 mitigation (calendar-invalid Date tampering) is exercised by the `normalizes calendar-invalid Date to undefined (D-24)` test.

## Self-Check: PASSED

Verified post-summary:
- All 4 source files and all 4 test files exist on disk:
  - `src/model/types/ts.ts`, `nm.ts`, `xtn.ts`, `pl.ts`
  - `test/types-ts.test.ts`, `types-nm.test.ts`, `types-xtn.test.ts`, `types-pl.test.ts`
- All 4 task commits (2 RED + 2 GREEN) are present in `git log --oneline --all`:
  `b09f279`, `a702ade`, `084736e`, `c16c940`.
- `pnpm typecheck`, `pnpm lint` (max-warnings=0), `pnpm test` (280/280), and `pnpm build` all exit 0.
- Plan-level TDD gate compliance: 2 `test(...)` commits precede 2 `feat(...)` commits — RED/GREEN ordering preserved per plan convention.

---
*Phase: 03-structural-model-and-types*
*Completed: 2026-04-19*
