---
phase: 02-core-parser-and-tolerance
plan: 05
subsystem: parser
tags: [dates, timestamp, dateFormats, cascade, tdd, wave-2, tier-2, TOL-08, TOL-09]
wave: 2
requires:
  - Hl7Position
  - Hl7ParseWarning
  - timestampFallbackFormat
  - WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT
provides:
  - parseHl7Timestamp
  - BUILTIN_DATE_FALLBACKS
  - ParseHl7TimestampOptions (@internal)
affects:
  - src/index.ts (unchanged — barrel update deferred to Plan 06)
tech-stack:
  added: []
  patterns:
    - "Three-stage deterministic cascade: strict HL7 TS/DTM first (never warns — spec-preferred path) → user-supplied formats in order (first match wins) → built-in fallbacks in order (ISO-8601 first because most constrained)."
    - "Hand-rolled token matcher recognises six tokens (YYYY, MM, DD, HH, mm, ss) with moment.js-style case sensitivity — `MM`=month, `mm`=minute — matching the TOL-09 `MM/DD/YYYY HH:mm:ss` spelling. Every non-token character in a format string is a literal. Zero runtime deps; no external date library."
    - "Strict linear scan O(len(format) + len(input)) with no backtracking, so untrusted format strings from `ParseOptions.dateFormats` cannot trigger exponential behaviour (T-02-05-01 DoS mitigation)."
    - "TS/DTM regex is fully anchored with fixed digit classes; year group is the only required capture. Range validation on month/day/hour/minute/second catches `99999999` etc. before constructing a Date."
    - "Absent timezone offset ⇒ UTC semantics via `Date.UTC(...)` — round-trips via `toISOString()` are stable across host time zones. Documented in JSDoc."
    - "Fractional seconds accept 1–4 digits, padded right with zeroes and sliced to 3 chars before `parseInt` — so `.5`→500ms, `.50`→500ms, `.005`→5ms, `.1234`→123ms (the 4th digit is dropped, not rounded; acceptable at the millisecond resolution level)."
    - "Emission guard (`opts.emit !== undefined && opts.position !== undefined`) honours the `@internal` option shape: Phase 3's TS/DTM composite parsing may not always know the positional context when it calls this helper, so silent fallback is legal."
key-files:
  created:
    - src/parser/dates.ts
    - test/parser-dates.test.ts
  modified: []
decisions:
  - "Token language picks YYYY / MM / DD / HH / mm / ss over regex-string or named-presets. Rationale: (a) zero deps, (b) matches the minimum surface developers expect from `dateFormats: [\"MM/DD/YYYY\"]`, (c) no ambiguity (case-sensitive month-vs-minute mirrors the moment.js convention that REQUIREMENTS.md TOL-09 already codifies via `MM/DD/YYYY HH:mm:ss`). Resolves the CONTEXT `<deferred>` item — 'dateFormats implementation choice' is now LOCKED as token strings."
  - "HL7 TS/DTM is NOT implemented via the token language — it uses a dedicated `parseHl7TsDtm()` with a single anchored regex. Reasons: TS/DTM has concatenated digit groups with no separators plus optional fractional seconds plus optional timezone, which the token language does not model (no variable-length tokens, no conditional sub-patterns). Keeping TS/DTM as a direct regex is simpler than extending the token grammar."
  - "ISO-8601 fallback uses `new Date(raw)` behind a strict `/^\\d{4}-\\d{2}-\\d{2}...$/u` regex guard. The guard requires the hyphenated date part so TS/DTM digit strings (which would otherwise be mis-interpreted by `new Date(\"20250102\")` as year 20250102 in some engines) never leak into the ISO branch. Using the platform parser for ISO keeps Phase 2 zero-dep without re-implementing the full ISO-8601 grammar."
  - "`BUILTIN_DATE_FALLBACKS` is exported (not just internal) because tests assert its exact contents and Phase 6's profile-merging code may want to reference it when building the effective `dateFormats` array. Exported as `readonly string[]` (not `readonly [...]` tuple) because the order-locked-ness is the invariant the tests check, not the exact tuple arity."
  - "`TIMESTAMP_FALLBACK_FORMAT` is NOT emitted when the input matches no pattern (returns `undefined`). Rationale: TOL-09 reads 'warning names the matched format' — with no match, there is no matched format to name. The absent-warning case is covered by test 10 explicitly (`warnings.length === 0` on unparseable input)."
metrics:
  duration: 3min
  completed: 2026-04-18
---

# Phase 2 Plan 05: dateFormats Plumbing Summary

`parseHl7Timestamp(raw, opts) → Date | undefined` ships the full `dateFormats` cascade for `ParseOptions`: strict HL7 TS/DTM → user-supplied formats (in order) → built-in ISO / date / US fallbacks. Emits `TIMESTAMP_FALLBACK_FORMAT` (with the matched format name) whenever a non-HL7 pattern succeeds; silent on the HL7 happy path and silent when every pattern fails. TOL-08 (user dateFormats honored with warning) and TOL-09 (built-ins always tried after user formats) are both closed. 13/13 tests green; full repo suite 97/97; typecheck + lint (0 warnings) + build all clean. Phase 3's TS/DTM composite types can call `parseHl7Timestamp` directly — the signature is stable.

## What Shipped

### Source (1 file)

- **`src/parser/dates.ts`** (303 lines) — exports:
  - `parseHl7Timestamp(raw: string, opts: ParseHl7TimestampOptions): Date | undefined` — the cascade function. File-level JSDoc documents the zero-dep constraint up front. Function JSDoc lists the three cascade stages + TOL-08/TOL-09 refs + the UTC default semantics + `@example` block.
  - `BUILTIN_DATE_FALLBACKS: readonly string[]` — the four built-in format names in cascade order: `"ISO-8601"`, `"YYYY-MM-DD"`, `"MM/DD/YYYY"`, `"MM/DD/YYYY HH:mm:ss"`. JSDoc explains the order rationale (ISO first = most constrained).
  - `ParseHl7TimestampOptions` — `@internal` options interface with `userFormats?`, `emit?`, `position?`. Marked `@internal` so it is exempt from `@example` lint rules; Phase 3 callers import it through the function signature.
  - Internal helpers: `parseHl7TsDtm()` (anchored regex), `parseIso8601()` (ISO guard + `new Date`), `matchTokenFormat()` (linear-scan token matcher), `emitFallback()` (position/emit guard + warning factory call).

### Tests (1 file)

- **`test/parser-dates.test.ts`** (111 lines) — 13 cases in one `describe` block (13/13 passing):
  1. HL7 `YYYYMMDD` → `2025-01-02T00:00:00.000Z`.
  2. HL7 `YYYYMMDDHHMMSS` interpreted as UTC.
  3. HL7 fractional seconds `.5` → 500ms.
  4. HL7 trailing timezone `+0500` → UTC-shifted.
  5. Truncation `YYYY` → Jan 1 of that year, UTC.
  6. Truncation `YYYYMM` → 1st-of-month, UTC.
  7. User format `MM/DD/YYYY` matches + emits warning naming `MM/DD/YYYY`.
  8. User-format order: `["YYYY-MM-DD", "MM/DD/YYYY"]` on `"01/02/2025"` — second format wins, warning names `MM/DD/YYYY`.
  9. Empty `userFormats` falls through to built-ins — `"2025-01-02"` matches, warning fires.
  10. Unparseable input returns `undefined` AND emits no warning.
  11. HL7 match suppresses warning even when `userFormats` is non-empty.
  12. ISO-8601 full timestamp via the built-in fallback — warning names `"ISO-8601"`.
  13. `BUILTIN_DATE_FALLBACKS` deep-equals the 4-entry ordered list.

### Commits

| Phase | Hash      | Kind    | Message                                                                      |
| ----- | --------- | ------- | ---------------------------------------------------------------------------- |
| 02-05 | `dd7e3c1` | RED     | `test(02-05): add failing tests for parser/dates timestamp cascade`          |
| 02-05 | `97cbf3f` | GREEN   | `feat(02-05): implement parser/dates timestamp cascade with dateFormats plumbing` |

REFACTOR cycle not needed — the GREEN implementation already follows the short-functions guideline (5 helpers, each 15–50 lines, no function exceeds complexity-10 lint).

## Requirements Closed

| REQ-ID  | Requirement                                                                                                     | Evidence                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TOL-08  | `dateFormats: [...]` option honored; user formats tried in order; `TIMESTAMP_FALLBACK_FORMAT` warning names the matched format | Tests 7 + 8 + factory-call grep (`timestampFallbackFormat(` appears 1× at cascade step 2 and 1× at step 3 via `emitFallback`) |
| TOL-09  | Built-in fallbacks (ISO-8601, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YYYY HH:mm:ss`) always tried after user formats; no throw on no-match | Tests 9 + 10 + 12 + 13 (BUILTIN_DATE_FALLBACKS const). Empty `userFormats` still reaches built-ins.   |

## Verification Evidence

- `pnpm typecheck` — exit 0.
- `pnpm lint --max-warnings=0` — exit 0, zero warnings.
- `pnpm test -- --run parser-dates` — 13/13 passing in 19ms.
- `pnpm test -- --run` (full suite) — 97/97 passing across 12 files, no regressions.
- `pnpm build` — ESM + CJS + .d.ts outputs clean (`dist/index.mjs` 129B, `dist/index.cjs` 151B — unchanged because `src/index.ts` is not yet a barrel for the new module; Plan 06 wires it up).

### Acceptance-Criteria Audit

| Check                                                                                                   | Result |
| ------------------------------------------------------------------------------------------------------- | ------ |
| `grep -E "^export (function\|const\|interface)" src/parser/dates.ts \| wc -l` = 3                       | ✅ 3   |
| Exactly 4 built-in format name strings in the array                                                     | ✅ 4   |
| Cascade order: `parseHl7TsDtm` line (100) < `userFormats` iteration (104) < `BUILTIN_DATE_FALLBACKS` iteration (113) | ✅     |
| `timestampFallbackFormat(` called at least once                                                         | ✅ 1× (in `emitFallback` helper) |
| No external imports (only relative `./` imports)                                                        | ✅ 0   |
| No `any` usage                                                                                          | ✅ 0   |
| File-level JSDoc does not start with `@`                                                                | ✅     |
| `@example` on both non-`@internal` exports                                                              | ✅ 2+  |
| No `console.*` runtime calls (the 3 matches are inside JSDoc `@example` fences, which ESLint ignores)   | ✅ (lint passes clean) |

## Deviations from Plan

None of substance. Two minor tidies worth logging:

1. **[Minor shape tweak]** The `Part` discriminated union in `matchTokenFormat` uses `{ kind: "token" \| "lit" }` tags instead of the plan's `{ token: Token \| "lit" }` shape. Reason: keeps the variant with a `value` string type-disjoint from the variant with a `token` literal, which satisfies `@typescript-eslint`'s narrowing expectations without a cast. Behaviour identical.
2. **[Minor refactor]** The warning-emit sites (cascade step 2 and step 3) both call a tiny `emitFallback(opts, format)` helper instead of inlining the `if (opts.emit !== undefined && opts.position !== undefined) { opts.emit(...) }` guard twice. CLAUDE.md "short, testable functions over big parsing blobs" + DRY. Behaviour identical.

Neither touches the contract or the public API shape. No Rule-1/Rule-2/Rule-3 auto-fixes were needed — the plan's implementation block compiled and passed linter on first writing, modulo the minor stylistic tweaks above.

## Notes for Phase 3

Phase 3 composite parsers (TS / DTM / TM) will call `parseHl7Timestamp` directly. Two integration points:

1. **Signature is stable.** `parseHl7Timestamp(raw: string, opts: ParseHl7TimestampOptions): Date | undefined`. The `opts` object is the threaded `dateFormats` + `onWarning`-bridge-emitter + position. Phase 6 will pass the effective `dateFormats` (profile-merged with user options) here; Phase 3 passes a subset (just `userFormats` + `emit` + `position`).
2. **TS vs DTM vs TM.** All three composite types resolve to the same underlying function. TM (time-only) is NOT currently supported — the HL7 regex requires a 4-digit year group. Phase 3 should either (a) delegate TM to a sibling `parseHl7Time` helper or (b) add a TM branch here. Recommendation: (a) — keeps `dates.ts` date-focused and avoids a time-only branch inside the already-anchored regex.

## Notes for Phase 6

Profile `dateFormats` flow into `ParseOptions.dateFormats` via Plan 06's merge logic (profile lineage resolution): `effectiveDateFormats = [...options.dateFormats ?? [], ...resolveProfileChain(profile).flatMap(p => p.dateFormats ?? [])]`. Once merged, the resulting array is passed to `parseHl7Timestamp` unchanged — no changes to `src/parser/dates.ts` are needed to support profiles. The `as readonly string[]` type on `userFormats` accepts profile-merged arrays directly.

## Threat Model Evidence

| Threat ID    | Category              | Mitigation Evidence                                                                                                                                                                  |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-02-05-01   | DoS via user format   | `matchTokenFormat` is a single-pass O(len(format) + len(input)) scan; no regex compiled from user input; `format.slice(i, i + t.length)` is a constant-bounded lookup per step.       |
| T-02-05-02   | Tampering on TS regex | `parseHl7TsDtm` regex is anchored `^...$` with fixed `\d{N}` classes. No user-controlled content is substituted into the pattern.                                                     |
| T-02-05-03   | Info disclosure       | Accepted — warning message echoes the user-supplied `matchedFormat` string. Since the format came from the caller's own `dateFormats` option, echoing it back is not a disclosure. |

No new threat flags introduced — the new surface (one function + one const) consumes `Hl7Position` and `Hl7ParseWarning` via existing type contracts and emits warnings through the already-audited `timestampFallbackFormat` factory from Plan 01.

## Known Stubs

None. Every code path is fully implemented and tested. There are no placeholder returns, no "coming soon" branches, no TODOs.

## Self-Check

- `src/parser/dates.ts` exists: ✅
- `test/parser-dates.test.ts` exists: ✅
- Commit `dd7e3c1` (RED test) exists: ✅
- Commit `97cbf3f` (GREEN implementation) exists: ✅
- `pnpm typecheck` + `pnpm lint --max-warnings=0` + `pnpm test -- --run parser-dates` + `pnpm build` all exit 0: ✅
- Full repo suite 97/97 green (no regressions from Plans 01–04): ✅

## Self-Check: PASSED
