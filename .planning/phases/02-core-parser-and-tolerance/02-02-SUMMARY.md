---
phase: 02-core-parser-and-tolerance
plan: 02
subsystem: parser
tags: [normalize, mllp, preprocessing, charset, tdd, tier-2]
wave: 2
requires:
  - WARNING_CODES
  - Hl7ParseWarning
  - Hl7Position
  - unknownCharset
  - mllpFramingStripped
provides:
  - normalize
  - normalizeBuffer
  - stripMllp
  - emitIfFramed
  - StripMllpResult
affects:
  - src/index.ts (unchanged — barrel update deferred to Plan 06)
tech-stack:
  added: []
  patterns:
    - "Pure line-ending normalization: replace `\\r\\n` first, then standalone `\\n` -> `\\r`"
    - "TextDecoder with try/catch fallback to UTF-8 on unknown charset label (emits UNKNOWN_CHARSET)"
    - "HL7 MSH-18 alias whitelist (`UNICODE UTF-8`, `8859/1`, `ASCII`, ...) mapped to TextDecoder labels"
    - "InstanceType<typeof TextDecoder> for type annotation (TextDecoder is a value in lib.dom, not a type)"
    - "MLLP strip uses pre-capture of trailing `\\u001C\\u000D` pattern so data CRs elsewhere are preserved"
    - "Unicode-code-point regex flag `/u` on all MLLP character classes (T-02-02-02 DoS mitigation)"
    - "Emit callback shape `(w: Hl7ParseWarning) => void` passed explicitly so Plan 06 can wire the real chokepoint"
key-files:
  created:
    - src/parser/normalize.ts
    - src/parser/mllp.ts
    - test/parser-normalize.test.ts
    - test/parser-mllp.test.ts
  modified: []
decisions:
  - "Used `InstanceType<typeof TextDecoder>` instead of `TextDecoder` as a type annotation — TextDecoder is declared as a value (constructor) in lib.dom, not a type alias, so `let decoder: TextDecoder` fails TS2749. Caught at first typecheck and fixed as Rule 1 bug before lint/test gates."
  - "`mapHl7Charset` kept internal (not exported). It is a small pure helper; exposing it would widen the API surface without value. Tested transitively via `normalizeBuffer`."
  - "Combined VT+FS removal via a single `/[\\u000B\\u001C]/gu` replace, then a post-pass that strips the MLLP trailing CR iff the original input ended with the exact FS+CR pair — preserves data CRs used as segment terminators."
metrics:
  duration: "2m 57s"
  tasks-completed: 2
  tasks-total: 2
  tests-added: 15
  files-created: 4
  completed: 2026-04-18T20:41:29Z
---

# Phase 2 Plan 02: Input Normalization, MLLP, and Charset — Summary

Ships the preprocessing layer of the parser pipeline — line-ending normalization, Buffer decode with charset fallback, and MLLP framing strip — as four pure, decoupled modules. Plan 06 composes these with the EMPTY_INPUT fatal and BOM strip into the full `parseHL7` pipeline per CONTEXT.md D-03.

## What Shipped

**Source files (2):**

- `src/parser/normalize.ts` — exports `normalize(input)` (pure line-ending `\r\n` / `\n` → `\r` transform) and `normalizeBuffer(input, charset, emit)` (TextDecoder decode + line-ending normalization, with HL7 MSH-18 alias whitelist and UNKNOWN_CHARSET fallback). Zero runtime deps; uses the Node 18+ global `TextDecoder` only. Internal helper `mapHl7Charset` handles the common HL7 aliases (`UNICODE UTF-8`, `8859/1`, `ASCII`, `US-ASCII`, `ISO-8859-1`, `ISO-8859-15`).
- `src/parser/mllp.ts` — exports `StripMllpResult` interface, `stripMllp(input)` (removes VT / FS everywhere; strips the trailing CR only when paired with a trailing FS, preserving data CRs as segment terminators), and `emitIfFramed(result, emit, position)` (surfaces the `MLLP_FRAMING_STRIPPED` warning through the emit callback when framing bytes were removed).

**Test files (2):** 15 cases total, all passing.

- `test/parser-normalize.test.ts` (8 cases — 5 string path + 3 Buffer path)
- `test/parser-mllp.test.ts` (7 cases — 5 strip scenarios + 2 emitIfFramed behaviors)

## Commits

| # | Hash | Type | Message |
|---|------|------|---------|
| 1 | `68b1781` | test | `test(02-02): add failing tests for parser/normalize` (RED) |
| 2 | `545c623` | feat | `feat(02-02): add parser/normalize with Buffer charset fallback` (GREEN) |
| 3 | `06baff0` | test | `test(02-02): add failing tests for parser/mllp` (RED) |
| 4 | `0bbbb8e` | feat | `feat(02-02): add parser/mllp framing strip with emitIfFramed helper` (GREEN) |

Two clean RED → GREEN TDD cycles. No `fix` or `refactor` commits required.

## REQ-IDs Closed (as parser primitives)

End-to-end proof through `parseHL7` is Plan 06's job; this plan locks the primitive-level surface.

- **PARSE-07 (BOM silent pass-through)** — `normalize` explicitly preserves a leading `\uFEFF`. Test "passes a leading UTF-8 BOM through untouched (BOM strip is Plan 06's job)" asserts `charCodeAt(0) === 0xfeff` survives. BOM stripping itself is Plan 06's responsibility per the refactored D-03 split.
- **PARSE-08 (line-ending normalization silent)** — `normalize` collapses `\r\n`, `\n`, and mixed line endings to `\r`. Test "normalizes `\\r\\n`, `\\n`, and mixed line endings to `\\r`" covers the three variants; the `.replace(/\r\n/g, "\r").replace(/\n/g, "\r")` ordering is commented and verified.
- **PARSE-09 (Buffer input + MSH-18 charset resolution)** — `normalizeBuffer` accepts an explicit charset, falls back to UTF-8 on unrecognized labels, and emits exactly one `UNKNOWN_CHARSET` warning. Test "emits UNKNOWN_CHARSET and falls back to UTF-8 on an unrecognized charset" asserts both the warning payload and the recovered decoding.
- **TOL-06 (MLLP framing strip with warning)** — `stripMllp` removes VT/FS everywhere and the trailing CR only when paired with a trailing FS. Four strip scenarios are tested (no framing, full envelope, leading VT only, trailing FS+CR only, mid-payload bytes). `emitIfFramed` wires the `MLLP_FRAMING_STRIPPED` warning through the emit callback.

## Charset Edge Cases Discovered

`mapHl7Charset` handles the common HL7 MSH-18 aliases up front:

- `UNICODE UTF-8` and `UNICODE` → `utf-8` (legacy HL7 spec form seen in older messages)
- `UTF-8` / `UTF8` → `utf-8` (modern sender convention)
- `ASCII` / `US-ASCII` → `ascii`
- `8859/1` / `ISO-8859-1` → `iso-8859-1` (Latin-1 — common in European installations)
- `8859/15` / `ISO-8859-15` → `iso-8859-15` (Latin-9 with Euro sign)
- Empty string → `utf-8` (sender omitted MSH-18)

Anything else is passed through uppercased to `TextDecoder`; if `TextDecoder` throws (unknown label), the `try/catch` emits `UNKNOWN_CHARSET` and falls back to UTF-8. This gives a two-tier safety net: known aliases resolve fast, exotic labels get handed to the runtime, truly unknown labels warn cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `TextDecoder` type annotation required `InstanceType<typeof TextDecoder>`**

- **Found during:** Task 1 GREEN `pnpm typecheck`.
- **Issue:** Plan's action text sketched `let decoder: TextDecoder;` but `TextDecoder` in Node's ambient lib is declared as a value (constructor), not a type alias. `tsc` reports `TS2749: 'TextDecoder' refers to a value, but is being used as a type here. Did you mean 'typeof TextDecoder'?`
- **Fix:** Changed the declaration to `let decoder: InstanceType<typeof TextDecoder>;`. Zero runtime impact; typechecks cleanly.
- **Files modified:** `src/parser/normalize.ts`.
- **Commit:** Applied inside `545c623` (Task 1 GREEN).
- **Rationale:** Rule 1 (bug fix) — code would not typecheck as written. The plan's intent is unambiguous; only the TS-surface shape needed correcting.

### Architectural Changes

None — the split between `normalize` (line-ending only) and Plan 06's composition (EMPTY_INPUT check + BOM strip + stripMllp + normalize) is exactly what the plan specifies, and CONTEXT.md D-03 calls out explicitly.

## Pipeline-Order Notes for Plan 06

Plan 06 owns the `parseHL7` public API and the full preprocessing pipeline. Relevant handoff:

1. **`normalize` is line-ending-only.** Pure function, no throws, no BOM strip. Plan 06 must run these stages around it in the canonical D-03 order:

   ```ts
   // Plan 06 sketch
   if (raw.length === 0 || isWhitespaceOnly(raw)) {
     throw new Hl7ParseError("EMPTY_INPUT", ..., ..., ...);
   }
   let text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;       // BOM strip
   const strip = stripMllp(text);
   emitIfFramed(strip, emit, { segmentIndex: 0 });
   text = strip.stripped;
   if (text.length === 0 || isWhitespaceOnly(text)) {              // re-check post-MLLP
     throw new Hl7ParseError("EMPTY_INPUT", ..., ..., ...);
   }
   text = normalize(text);                                          // line-ending normalization
   ```

2. **`normalizeBuffer` composition.** When `raw` is a `Buffer`, Plan 06 should call `normalizeBuffer(raw, charset, emit)` FIRST to get a string, then run the EMPTY_INPUT / BOM / MLLP stages on the decoded text. `normalizeBuffer` already runs line-ending normalization internally — so after the MLLP strip Plan 06 should NOT call `normalize` a second time (or must accept the cost of a redundant O(n) pass). Safer pattern: call `normalizeBuffer` with an identity emit forwarder, then call `normalize` at the end anyway (idempotent — running it twice yields the same string).

3. **Charset discovery ordering.** MSH-18 is the charset source, but the parser needs to decode the Buffer BEFORE it can read MSH-18. Plan 06 will either:
   (a) use the `ParseOptions.charset` override if supplied, otherwise default UTF-8;
   (b) do a tentative UTF-8 decode, read MSH-18, re-decode if it disagrees (emitting `ENCODING_MISMATCH` — owned by Plan 03's delimiters module).
   This plan does NOT pick between (a)/(b); `normalizeBuffer`'s signature supports either.

4. **Emit callback wiring.** `normalizeBuffer` and `emitIfFramed` both accept an `(w: Hl7ParseWarning) => void` callback. Plan 06's `emitWarning` chokepoint is the intended supplier; nothing here pushes to `Hl7Message.warnings` directly (per plan interfaces note — staying decoupled).

## Verification

All plan-level verification commands pass on the final commit (`0bbbb8e`):

```bash
pnpm typecheck                  # 0 errors
pnpm lint --max-warnings=0      # 0 errors, 0 warnings
pnpm test -- --run              # 7 files, 37 tests (15 new), all pass
pnpm build                      # dual ESM+CJS + DTS build success
```

Full test run breakdown: 2 sanity + 5 Plan 01 + 4 Plan 02-01 + 4 Plan 02-02 model tests + 8 parser-normalize + 7 parser-mllp = 37/37 green.

Note: `src/index.ts` is unchanged — public exports for `normalize`, `normalizeBuffer`, `stripMllp`, `emitIfFramed`, and `StripMllpResult` land in Plan 06 alongside `parseHL7` (per CONTEXT.md barrel-update ownership).

## Known Stubs

None — every exported symbol in this plan has a complete implementation for its Phase 2 surface. `normalize`, `normalizeBuffer`, `stripMllp`, and `emitIfFramed` are final (Plan 06 consumes them as-is).

## Threat Surface Scan

Files created: `src/parser/normalize.ts`, `src/parser/mllp.ts`. No new network endpoints, authentication paths, or file access are introduced. All four threats in the plan's `<threat_model>` are mitigated or accepted as documented:

- **T-02-02-01** (DoS in line-ending regex) — mitigated: `replace(/\r\n/g, "\r").replace(/\n/g, "\r")` is two linear-time passes with no backtracking.
- **T-02-02-02** (DoS in stripMllp character-class regex) — mitigated: `/[\u000B\u001C]/gu` is a simple character class, `/\u001C\u000D$/u` is anchored at `$`. Both O(n).
- **T-02-02-03** (Tampering via charset label) — mitigated: `mapHl7Charset` whitelist handles common aliases; anything else is given to `TextDecoder` in a `try/catch`; no `eval`, no dynamic require.
- **T-02-02-04** (Information disclosure via EMPTY_INPUT snippet) — not applicable in Plan 02: EMPTY_INPUT is Plan 06's concern per the D-03 split. Accepted disposition carries forward.

No new threat flags.

## Self-Check: PASSED

Files verified to exist:

- `src/parser/normalize.ts` — FOUND
- `src/parser/mllp.ts` — FOUND
- `test/parser-normalize.test.ts` — FOUND
- `test/parser-mllp.test.ts` — FOUND

Commits verified in `git log`:

- `68b1781` — FOUND (RED Task 1)
- `545c623` — FOUND (GREEN Task 1)
- `06baff0` — FOUND (RED Task 2)
- `0bbbb8e` — FOUND (GREEN Task 2)
