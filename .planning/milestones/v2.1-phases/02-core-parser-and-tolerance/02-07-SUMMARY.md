---
phase: 02-core-parser-and-tolerance
plan: 07
subsystem: parser
tags: [gap-closure, charset, MSH-18, buffer-input, PARSE-09, two-pass-decode, wave-4]
gap_closure: true
requirements: [PARSE-09]
requires:
  - normalizeBuffer
  - mapHl7Charset
  - encodingMismatch
  - unknownCharset
provides:
  - ParseOptions.charset
  - resolveBufferCharset (internal)
  - extractMsh18FromTentativeDecode (internal)
  - exported mapHl7Charset (internal cross-module)
affects:
  - PARSE-09 promoted from PARTIAL to VERIFIED
tech-stack:
  added: []
  patterns:
    - "Two-pass Buffer decode: tentative UTF-8 → shallow MSH-18 read → re-decode via normalizeBuffer with resolved charset (override OR declared OR UTF-8 default)."
    - "Shallow MSH-18 extractor: defensive split-based first-pass reader that MUST NOT call tokenize/readDelimiters (they can throw on malformed MSH — defeats the tentative contract). Line-ending agnostic split on /[\\r\\n]/."
    - "Alias-normalized override-vs-declared comparison via shared mapHl7Charset — prevents false-positive ENCODING_MISMATCH on synonym pairs (e.g. UNICODE UTF-8 vs UTF-8)."
    - "Override precedence: options.charset > MSH-18 > UTF-8 default. ENCODING_MISMATCH emitted only when override AND declared disagree after alias normalization."
key-files:
  created: []
  modified:
    - src/parser/index.ts
    - src/parser/types.ts
    - src/parser/normalize.ts
    - test/parser-public.test.ts
decisions:
  - "Chose approach (c) — both options.charset override AND two-pass MSH-18 auto-discovery. Rationale: (a) alone fails spec fidelity on real cross-vendor traffic; (b) alone fails real-world pragmatism when vendors misdeclare MSH-18. (c) ships both with minimum new surface: one optional ParseOptions field + two private helpers + one cross-module export of mapHl7Charset."
  - "Exported existing mapHl7Charset from normalize.ts rather than duplicating the alias table inside resolveBufferCharset. Kept @internal JSDoc tag since it is an internal cross-module helper — not a public API. Prevents synonym-pair drift between the declaration-side decoder and the override-vs-declared comparator."
  - "MSH-18 extractor intentionally avoids the full tokenize/readDelimiters pipeline. readDelimiters can throw INVALID_ENCODING_CHARACTERS/MSH_TOO_SHORT on malformed MSH; the tentative first pass MUST be defensive (return undefined on any shape failure) so the Buffer path always falls through to UTF-8 safely."
  - "Extractor splits on /[\\r\\n]/ (line-ending agnostic) rather than bare \\r or \\n. Unix-style \\n-only Buffer traffic is common; a bare \\r split would swallow subsequent segments into parts[17] and silently regress PARSE-09 (the whole-message-as-segment-0 failure mode). Anti-regression pinned by test 8 and by plan verification gate 5."
metrics:
  duration: "~6 minutes"
  tasks-completed: 1
  tasks-total: 1
  tests-added: 9
  files-created: 0
  files-modified: 4
  completed: 2026-04-18T20:39:00Z
---

# Phase 2 Plan 07: Gap-Closure — MSH-18 Charset Wiring Summary

Closes the last PARSE-09 gap surfaced by Phase 2's verifier. `parseHL7(Buffer, ...)` now wires MSH-18 auto-discovery AND a `ParseOptions.charset` override into the Buffer decode path via a two-pass decode, honouring the locked precedence rule `override > MSH-18 > UTF-8 default` with `ENCODING_MISMATCH` emission only on post-alias-normalization disagreement. Two atomic TDD commits, 9 new end-to-end tests (132/132 total), full 4-gate pipeline green, no regressions on the previous 123-test suite. TOL-08 remains deferred to Phase 3/4 per the verifier override — no date/timestamp work touched here.

## What Shipped

### Precedence Rule (Locked)

1. If `options.charset` is supplied AND MSH-18 is declared → compare via `mapHl7Charset`. Disagreement → emit `ENCODING_MISMATCH`; override still wins.
2. Else if `options.charset` is supplied → use it.
3. Else if MSH-18 is declared → use it (triggers `UNKNOWN_CHARSET` fallback inside `normalizeBuffer` on unsupported labels).
4. Else → UTF-8 default.

### `resolveBufferCharset` Helper

```ts
function resolveBufferCharset(
  raw: Buffer,
  options: ParseOptions,
  emit: (w: Hl7ParseWarning) => void,
): string
```

Four-branch flow exactly mirroring the precedence rule above. Every branch delegates the actual decode to `normalizeBuffer`, which already owns the alias table, the `TextDecoder` `try/catch`, the `UNKNOWN_CHARSET` emission, and the line-ending normalization. This helper is ~30 lines of pure routing logic — no duplication of decode responsibility.

### `extractMsh18FromTentativeDecode` Helper

Shallow, defensive MSH-18 reader for the tentative first pass:

1. `tentativeText.split(/[\r\n]/)[0]` — line-ending agnostic.
2. Verify `startsWith("MSH")`.
3. Take field separator from `firstSegment.charAt(3)`.
4. Split on that separator; return `parts[17]?.trim() || undefined`.

Returns `undefined` on any shape failure (no segment boundary, missing separator, non-`MSH` first segment, empty MSH-18). The caller then falls through to `normalizeBuffer(raw, undefined, emit)` → UTF-8 default.

### `mapHl7Charset` Export Decision

Changed from `function` to `export function` in `src/parser/normalize.ts` with an `@internal` JSDoc tag. Shared with `resolveBufferCharset` for override-vs-declared comparison. **Not duplicating the alias table** was the key decision — any drift between the two sides of the comparison would produce false-positive `ENCODING_MISMATCH` warnings on synonym pairs like `UNICODE UTF-8` vs `UTF-8`.

### `ParseOptions.charset` Field

New optional field on `ParseOptions`:

```ts
readonly charset?: string;
```

JSDoc + `@example` supplied per `jsdoc/require-example`. Added to `OPTIONS_ONLY_KEYS` so the argument discriminator recognises `{ charset: "..." }` as `ParseOptions` (not a `Profile`).

### Buffer Decode Call Site

`src/parser/index.ts` Buffer branch changed from:

```ts
text = normalizeBuffer(raw, undefined, bufferEmit);
```

to:

```ts
text = resolveBufferCharset(raw, options, bufferEmit);
```

The `options` object is computed via the existing `discriminateOptionsOrProfile` helper at the top of the `parseHL7` body — already in scope.

## Nine New Tests (`test/parser-public.test.ts`)

All under `describe("PARSE-09 — MSH-18 charset wiring", ...)`:

| # | Scenario | Pins |
|---|----------|------|
| 1 | Auto-discover MSH-18=`ISO-8859-1`; Latin-1 `Ü` round-trips through Buffer. | Two-pass decode; PARSE-09 truth. |
| 2 | `options.charset="ISO-8859-1"` with empty MSH-18; no mismatch. | Override-only path. |
| 3 | `options.charset="UTF-8"` DISAGREES with MSH-18=`ISO-8859-1`; exactly one `ENCODING_MISMATCH`; override wins. | Disagreement emits correctly. |
| 4 | `options.charset="UTF-8"` AGREES with MSH-18=`UNICODE UTF-8` (alias synonyms); no `ENCODING_MISMATCH`. | `mapHl7Charset` synonym equivalence. |
| 5 | Unknown MSH-18=`INVALID-CHARSET-XYZ` (guaranteed-unknown label); one `UNKNOWN_CHARSET`, no `ENCODING_MISMATCH`, UTF-8 fallback. | `UNKNOWN_CHARSET` preserved from Plan 02. |
| 6 | Regression: Buffer with empty MSH-18 → UTF-8 default, zero charset warnings. | No regression on pre-gap behaviour. |
| 7 | Regression: string input path ignores `options.charset`; no warnings. | String path untouched. |
| 8 | `\n`-only line endings + MSH-18=`ISO-8859-1` → correct Latin-1 decode, no `UNKNOWN_CHARSET`. | **Anti-regression for blocker B-2** — extractor MUST split on `/[\r\n]/`. |
| 9 | MLLP-wrapped Buffer + non-UTF-8 MSH-18 → no crash, no `ENCODING_MISMATCH`, version still parses. | **T-02-07-05 anchor** — pinned limitation so future reordering surfaces as a deliberate test update. |

Chose `INVALID-CHARSET-XYZ` for test 5 over `CP1252` because some Node versions register `cp1252` to `TextDecoder` (which would make the test flaky across the CI Node 18/20/22 matrix). The chosen label is guaranteed not in the alias whitelist and not a Node `TextDecoder`-known label.

## Commits

| Gate | Hash | Message |
|------|------|---------|
| RED (test)  | `32d7ebe` | `test(02-07): add failing tests for MSH-18 charset wiring` |
| GREEN (feat) | `04a180b` | `feat(02-07): wire MSH-18 charset resolution into parseHL7` |

TDD gate sequence verified: `test(02-07)` → `feat(02-07)` in that order. No REFACTOR commit — `resolveBufferCharset` is ~30 lines of clean routing; no duplication or naming drift to collapse. Out-of-band the GREEN commit also carries the `ParseOptions.charset` type field (RED commit added the type so tests type-check at RED time — the runtime wiring alone lands in GREEN).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test-helper MSH-18 field position off-by-one**

- **Found during:** GREEN initial test run — 4 tests failed with wrong assertion outputs after the implementation appeared correct.
- **Issue:** My initial `buildMessage` test helper used seven `|` delimiters between MSH-12 and the charset token (`|||||||`), which placed the charset at MSH-19 not MSH-18. The parser correctly read `parts[17]` (MSH-18 per the 1-indexed convention) and found it empty, so the auto-discovery path never triggered even though the wiring was correct.
- **Fix:** Reduced the delimiter run to six pipes (`||||||`) so the charset token lands at the true MSH-18 position (`parts[17]` in the raw split). Added a pipe-count diagram in the test comment so future readers see the mapping at a glance.
- **Files modified:** `test/parser-public.test.ts` (test-helper `buildMessage` only — production code unchanged by this fix).
- **Commit:** Folded into `04a180b` (GREEN) along with the wiring changes, since a standalone test-helper fix without the production wiring would still leave the other 4 tests (1, 3, 5, 8) red. The RED commit's 5-of-9 failures did correctly demonstrate the gap (parser never read MSH-18 regardless of which field position the test placed it at); this fix makes the tests precise about *which* field they pin.
- **Rationale:** Rule 1 (test bug fix) — the test claimed to assert MSH-18 auto-discovery but in fact asserted behaviour against MSH-19. The fix corrects the claim; the bug was in the test fixture, not the spec.

**2. [Rule 3 - Blocking] `ParseOptions.charset` type field required at RED time**

- **Found during:** RED typecheck — the plan's strict gate requires `pnpm typecheck` to pass on the RED commit even though tests fail at runtime. Test cases 2, 3, 4, 7 pass `{ charset: ... }` to `parseHL7` which does not typecheck if `ParseOptions.charset` is absent.
- **Fix:** Added `readonly charset?: string;` to `ParseOptions` in the RED commit alongside the test changes. The type declaration is a contract change that the tests consume; the runtime wiring (which would have made the tests pass) stayed out until GREEN. This split keeps the TDD cycle honest: RED proves "tests compile and fail against current runtime", GREEN proves "same tests pass after wiring".
- **Files modified:** `src/parser/types.ts`.
- **Commit:** Folded into `32d7ebe` (RED).
- **Rationale:** Rule 3 (blocking issue) — without the type field, the RED tests cannot even typecheck, breaking the plan's explicit requirement that RED typechecks cleanly. The plan's `<action>` RED section says "Run pnpm typecheck — MUST pass (tests should be type-correct even though they fail at runtime)", and its GREEN section lists adding `ParseOptions.charset` as the first step. Adding the bare type in RED satisfies the typecheck requirement without advancing the runtime behaviour — the pure GREEN delta is still `normalizeBuffer(raw, undefined, …)` → `resolveBufferCharset(raw, options, …)` + helpers + `OPTIONS_ONLY_KEYS` update + `mapHl7Charset` export.

### Architectural Changes

None — the plan's approach (c) + the four-branch precedence flow + the shallow MSH-18 extractor all landed exactly as specified. No new public factories, no new warning codes, no new error classes, no new model fields.

## Verification

### Plan-Level Automated Gate

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint (max-warnings=0) | `pnpm lint --max-warnings=0` | exit 0 |
| Full test suite | `pnpm test -- --run` | 13 files / 132 tests / all pass (+9 new) |
| Build | `pnpm build` | ESM 23.25 KB, CJS 23.90 KB, DTS 34.21 KB — all succeed |

### Plan's Custom Verification Gates

1. **RED-before-GREEN commit ordering** (`git log --oneline | head -3`):
   ```
   04a180b feat(02-07): wire MSH-18 charset resolution into parseHL7
   32d7ebe test(02-07): add failing tests for MSH-18 charset wiring
   ```
   ✅ test commit precedes feat commit.

2. **MSH-18 extractor does not call tokenize/readDelimiters in its body**:
   - `grep -n "tokenize\|readDelimiters" src/parser/index.ts` shows matches only at the file-level import line (19, 24), the file-level JSDoc block (4, 14), the JSDoc block ABOVE `extractMsh18FromTentativeDecode` documenting that these are NOT called (143-144), the `extractVersion` JSDoc (233), and the `parseHL7` body at the genuine call sites (369, 372). None inside `extractMsh18FromTentativeDecode` (lines 160-182) or `resolveBufferCharset` (lines 189-231) function bodies.
   ✅ Postel's Law preserved; tentative decode cannot throw.

3. **Buffer decode call site changed**:
   - `grep -n "normalizeBuffer(raw" src/parser/index.ts` shows four matches — all inside `resolveBufferCharset` (lines 221, 224, 227, 229). Zero matches at the top-level `parseHL7` body.
   ✅ Call site redirected through the new helper.

4. **`mapHl7Charset` exported**:
   - `grep -n "export function mapHl7Charset" src/parser/normalize.ts` shows exactly one match (line 99).
   ✅ Cross-module export in place; single source of truth for the alias table preserved.

5. **Line-ending agnostic extractor (blocker B-2 anti-regression gate)**:
   - `grep -nE 'extractMsh18FromTentativeDecode|split\(/\[\\r\\n\]/\)' src/parser/index.ts` shows the helper defined at line 160 AND the `/[\r\n]/` regex split at line 161 (inside the body) AND the call site at line 208.
   - `grep -n 'split("\\r")' src/parser/index.ts` returns no matches (exit 1) — no bare `\r`-only splits anywhere in the file.
   ✅ Unix-style `\n`-only Buffer traffic handled correctly.

## Threat Model Disposition

All five threats from the plan's `<threat_model>` remain as designed:

- **T-02-07-01 (Tampering — MSH-18 from tentative decode)** — mitigated: shallow split-based extractor + line-ending agnostic split + defensive `undefined` return + downstream `UNKNOWN_CHARSET` fallback.
- **T-02-07-02 (DoS — `TextDecoder` on large Buffer)** — accepted: bounded by caller's input-size policy (Phase 7+ concern).
- **T-02-07-03 (Information disclosure — `ENCODING_MISMATCH` echoes labels)** — mitigated: both echoed tokens originate from the caller or the parsed payload; no secrets introduced by the parser.
- **T-02-07-04 (Spoofing — malicious MSH-18)** — accepted by design: `options.charset` override is the documented escape hatch.
- **T-02-07-05 (Tampering — MLLP-framed Buffer + non-UTF-8 MSH-18)** — accepted: test 9 pins the current behaviour (MLLP-first-byte fails `startsWith("MSH")` → falls through to UTF-8) so future reordering surfaces as a deliberate test update.

No new threat flags introduced.

## Known Stubs

None. Every ship surface is fully wired:
- `ParseOptions.charset` is read in the Buffer branch of `parseHL7`.
- `resolveBufferCharset` is called at the one and only Buffer decode site.
- `extractMsh18FromTentativeDecode` is called inside `resolveBufferCharset`.
- `mapHl7Charset` is consumed inside `resolveBufferCharset` for the override-vs-declared comparison.

No placeholder text, no TODO/FIXME, no `console.*`, no hardcoded empty returns flowing to user output, no `any`.

## Phase 2 Closing Status

With this plan landed, Phase 2's verifier should promote PARSE-09 from PARTIAL → VERIFIED on re-run (`/gsd-verify-work 2 --gaps`):

- **19/19 REQ-IDs** fully or overrideably closed:
  - 18/19 runtime-verified (PARSE-01..09 now complete end-to-end; TOL-01..07, TOL-09, TOL-10 unchanged).
  - 1/19 deferred via explicit override (TOL-08 — `dateFormats` observable slice to Phase 3/4 per `02-VERIFICATION.md`).
- **Observable PARSE-09 proof:** `test/parser-public.test.ts` case 1 parses a `Buffer` whose MSH-18 declares `ISO-8859-1` and asserts Latin-1 round-trip at the positional tree level.
- **No regressions:** pre-existing 123 tests remain green; build artefact sizes are within the expected O(10%) bloat for ~60 lines of new source (ESM 21.93 → 23.25 KB, CJS 22.58 → 23.90 KB, DTS 33.72 → 34.21 KB).

Ready for Phase 2 → Phase 3 transition (`/gsd-transition`).

## Self-Check

- File `src/parser/index.ts` modified (contains `resolveBufferCharset` and `extractMsh18FromTentativeDecode`): FOUND
- File `src/parser/types.ts` modified (`ParseOptions.charset?: string` declared): FOUND
- File `src/parser/normalize.ts` modified (`export function mapHl7Charset`): FOUND
- File `test/parser-public.test.ts` modified (9 new tests under `PARSE-09 — MSH-18 charset wiring`): FOUND
- Commit `32d7ebe` exists in git log (RED): FOUND
- Commit `04a180b` exists in git log (GREEN): FOUND
- TDD gate sequence verified: `test(02-07)` → `feat(02-07)` in correct order: CONFIRMED
- Plan verification gate 5 (no bare `split("\r")` in extractor): PASSED (grep exit 1)

## Self-Check: PASSED
