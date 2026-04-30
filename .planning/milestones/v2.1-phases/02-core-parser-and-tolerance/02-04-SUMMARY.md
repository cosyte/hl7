---
phase: 02-core-parser-and-tolerance
plan: 04
subsystem: parser
tags: [escapes, unescape, reescape, tdd, wave-2, tier-2, round-trip]
wave: 2
requires:
  - EncodingCharacters
  - Hl7Position
  - Hl7ParseWarning
  - unknownEscapeSequence
  - WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE
provides:
  - unescape
  - reescape
affects:
  - src/index.ts (unchanged — barrel update deferred to Plan 06)
tech-stack:
  added: []
  patterns:
    - "Full switch-style escape-body mapping in an internal `expandSequence()` helper (easier to extend than a Map, faster than a regex alternation, and keeps `unescape` itself focused on the scan loop)."
    - "Unescape uses a bounded O(n) single-pass scan with explicit `i++` advance and `indexOf` lookahead — no regex, no recursion, no backtracking. Unterminated escapes `break` out of the loop after warning once (T-02-04-01 DoS mitigation)."
    - "Unknown / malformed / vendor-\\Z..\\ escapes are preserved VERBATIM in the output (surrounding escape chars included) and each emits exactly one `UNKNOWN_ESCAPE_SEQUENCE` warning — the core TOL-10 contract."
    - "Hex decode (`\\X..\\`) validates with strict regex `/^[0-9A-Fa-f]+$/u` plus even-length requirement before `parseInt`; non-hex or odd-length input is rejected with a warning (T-02-04-02 tampering mitigation) rather than silently misdecoded."
    - "Reescape uses `for..of` (Unicode code-point iteration, not UTF-16 code units) so non-BMP user content round-trips through `unescape(reescape(x))` without special surrogate-pair handling."
    - "Reescape order checks `enc.escape` FIRST in the per-character branch so the escape character itself never double-escapes subsequent delimiter rewrites."
key-files:
  created:
    - src/parser/escapes.ts
    - test/parser-escapes.test.ts
  modified: []
decisions:
  - "Escape-body dispatch implemented as a straight-line `if`-chain switch in `expandSequence()` rather than a `Map<string, (enc) => string>`. Reasons: (a) only 7 fixed cases plus two dynamic prefixes (`X..`, `Z..`), (b) it keeps all escape knowledge in one readable block of 15 lines, and (c) Phase 6 profile-driven vendor \\Z..\\ handlers will need branching logic anyway (profile lookup must happen before the fallback `return null`), which a Map can't express cleanly."
  - "Phase 2 does NOT maintain a vendor `\\Z..\\` allow-list (per 02-PATTERNS.md — 'for Phase 2 the allow-list is empty'). Every `\\Z..\\` currently warns and is preserved verbatim. Threat T-02-04-03 (information-disclosure of passed-through vendor content) is accepted here; Phase 6 profiles will register vendor handlers and the `unescape` signature is ready for that extension — `expandSequence()` can grow a profile parameter without breaking callers."
  - "`unescape`'s fast path returns early when `input.includes(enc.escape)` is false — zero allocation for the overwhelmingly common case of plain ASCII field content with no embedded escapes. Separate `if (input.length === 0) return input;` guard in `reescape` for the same reason."
  - "Unterminated escapes (a lone `enc.escape` character with no closing partner) preserve the entire tail of the input verbatim (via `input.slice(i)`) AND emit a single warning before `break`ing. Important: the warning's `sequence` field gets the full unterminated tail so downstream consumers / strict mode can recover exactly what the sender sent."
metrics:
  duration: 6min
  completed: 2026-04-18
---

# Phase 2 Plan 04: Escape Sequences Summary

HL7 escape-sequence round-trip shipped. Parser-side `unescape` expands `\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`, and `\X..\` hex against the active `EncodingCharacters`; serializer-side `reescape` rewrites the five delimiter characters and newline back into their canonical token forms. Unknown / vendor / malformed sequences preserve verbatim with one `UNKNOWN_ESCAPE_SEQUENCE` warning per occurrence (TOL-10). 15/15 tests green — including a round-trip sanity test proving `unescape(reescape(x, enc), enc, emit, pos) === x` with zero warnings for any ASCII content containing arbitrary delimiter characters.

## What Shipped

### Source (1 file)

- **`src/parser/escapes.ts`** — exports `unescape(input, enc, emit, position): string` and `reescape(input, enc): string`. Internal `expandSequence(seq, enc): string | null` helper owns the escape-body lookup table. File-level JSDoc documents every known escape form and the TOL-10 contract up front. Both exports carry `@example` blocks.

### Tests (1 file)

- **`test/parser-escapes.test.ts`** — 15 cases across two `describe` blocks:
  - **unescape (12):** pass-through, `\F\`, `\S\\T\\R\\E\` combo, `\.br\`, `\X0A\` single byte, `\X48656C6C6F\` multi-byte → `"Hello"`, `\Z99\` preserved + warn, `\UNKNOWN\` preserved + warn, invalid-hex `\Xzz\` rejected, odd-length hex `\Xabc\` rejected, unterminated lone `\`, custom escape char (`*` instead of `\`).
  - **reescape (3):** single-delimiter `|`, all five delimiters + newline in one input, unescape/reescape round-trip with zero warnings.

### Commits

| Phase | Hash      | Kind | Message                                                            |
| ----- | --------- | ---- | ------------------------------------------------------------------ |
| RED   | `ab20484` | test | test(02-04): add failing tests for parser/escapes unescape+reescape |
| GREEN | `0d5303a` | feat | feat(02-04): add parser/escapes unescape + reescape round-trip     |

No REFACTOR commit — the first GREEN pass was already short, branch-simple, and type-clean.

## REQ-IDs Closed

- **PARSE-03** — all HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`, `\X..\`, `\Z..\`) handled by `expandSequence` + the unknown-path fallback.
- **TOL-10** — unknown escapes preserved verbatim AND emit `UNKNOWN_ESCAPE_SEQUENCE` warning (covered by tests 7, 8, 9, 10, 11 in `test/parser-escapes.test.ts`).

## Verification

All four gates green:

```
pnpm typecheck                    → 0
pnpm lint --max-warnings=0        → 0 (eslint all src+test)
pnpm test -- --run parser-escapes → 15/15
pnpm build                        → ESM + CJS + DTS
```

Full suite (`pnpm test`) also still green — no regression in Plans 01/02/03 tests.

## Acceptance-Criteria Checklist

- [x] `src/parser/escapes.ts` exists with exactly two `export function` declarations (`unescape`, `reescape`).
- [x] All 8 HL7 escape forms handled in `expandSequence` (7 branches: F / S / T / R / E / .br / X..; `\Z..\` falls through the implicit null return).
- [x] `unknownEscapeSequence` factory called on the unknown path (2 call sites: unterminated + unknown body).
- [x] `reescape` covers all 5 delimiters plus newline (6 branches + fall-through).
- [x] Zero `console.*`, zero `any`, zero non-null `!` assertions, zero object-literal `as` casts.
- [x] File-level JSDoc is plain prose (does not start with `@`).
- [x] `@example` on both public exports.
- [x] 15/15 tests pass including the round-trip sanity test.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes, no architectural decisions surfaced.

## Notes for Downstream Phases

### Phase 3 — Typed Composite Parsers

`unescape` is the leaf-access helper. Phase 3's dot-path resolver (`msg.get("PID-5.1.2")`) will call `unescape(subcomponentString, msg.encoding, emit, position)` at the leaf, NOT during tokenize. Keeping the raw tokenized tree in its untouched form preserves round-trip fidelity for `toString()` and for consumers who prefer to inspect raw content (e.g. logging redaction). It also keeps tokenization bounded — escape expansion is proportional to lookups, not to message size.

### Phase 5 — Serializer

`reescape` is ready for immediate consumption by `Hl7Message.toString()`. It accepts an `EncodingCharacters` argument so MSH-1/MSH-2 overrides from the original message are honored — a message parsed with custom delimiters round-trips with the same custom delimiters in its serialized output. Order of rewrites inside `reescape` is `escape → field → component → subcomponent → repetition → newline`; the `escape`-first rule prevents the escape character from double-escaping subsequent delimiter rewrites.

### Phase 6 — Profile Vendor Handlers

`expandSequence` currently returns `null` for every `\Z..\` sequence because Phase 2's allow-list is empty. Phase 6 profiles will inject vendor handlers; the plan is to thread an optional `profile: Profile | undefined` through `unescape`, check `profile?.vendorEscapes?.[seq]` inside `expandSequence` BEFORE the fallback `return null`, and keep the existing warn-and-preserve fallback for unmatched vendor bodies. Signature-wise, `unescape` already takes `enc: EncodingCharacters` — adding an optional profile parameter at the end is backwards-compatible with all Phase 2/3/4 callers.

### Testing Coverage for Phase 7

`src/parser/escapes.ts` is ~60 lines with every branch covered by the 15 tests. Expected lines/branches/functions coverage: **100%** on this file. Once `pnpm test:coverage` turns on in Phase 7 it should not need additional tests here.

## Self-Check: PASSED

- Files created exist on disk: `src/parser/escapes.ts`, `test/parser-escapes.test.ts` — both confirmed via `git log --stat` against commits `ab20484` (test) and `0d5303a` (feat).
- Commits in git log: `ab20484` and `0d5303a` both present and reachable from `main`.
- No uncommitted changes in working tree (aside from this SUMMARY pending the docs commit).
