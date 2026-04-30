---
phase: 02-core-parser-and-tolerance
plan: 06
subsystem: parser
tags: [parseHL7, public-api, strict-mode, capstone, tdd, wave-3, integration, PARSE-01, TOL-01, TOL-02]
wave: 3
requires:
  - normalize
  - normalizeBuffer
  - stripMllp
  - emitIfFramed
  - splitSegments
  - snippet
  - readDelimiters
  - DEFAULT_ENCODING_CHARACTERS
  - tokenize
  - FATAL_CODES
  - Hl7ParseError
  - WARNING_CODES
  - Hl7ParseWarning
  - Hl7Position
  - ParseOptions
  - Profile
  - OnWarningCallback
  - EncodingCharacters
  - RawSegment
  - Hl7Message
  - Hl7MessageInit
provides:
  - parseHL7
  - src/index.ts full Phase 2 public barrel
affects:
  - src/index.ts (modified — added Phase 2 exports, VERSION preserved byte-identical)
tech-stack:
  added: []
  patterns:
    - "Capstone composition: parseHL7 drives the D-03 pipeline explicitly (Buffer decode → EMPTY_INPUT → BOM strip → MLLP strip → re-check EMPTY_INPUT → normalize line endings → build real emitter → forward Buffer warnings → MLLP warning → segment split → delimiters → tokenize → version extract → Hl7Message construct) so the ordering is inspectable at the pipeline site rather than buried inside any single stage."
    - "Single emit chokepoint (makeEmitter) per D-11: lenient mode pushes to warnings[] + invokes options.onWarning; strict: true throws Hl7ParseError carrying the warning code. One code path guarantees msg.warnings / onWarning / strict escalation stay in parity."
    - "Argument discrimination (discriminateOptionsOrProfile) uses Object.prototype.hasOwnProperty.call — not the `in` operator — so a prototype-polluted argument cannot spoof the options-only branch via an inherited `strict` / `onWarning` key (T-02-06-01)."
    - "Overloaded TypeScript signature with three public overloads (raw; raw + Profile; raw + ParseOptions) + a 4th @internal implementation signature. The implementation signature carries an @internal JSDoc tag so jsdoc/require-jsdoc does not demand duplicate documentation."
    - "PROF-08 opt-out honored via conditional Hl7MessageInit construction: { profile: null } yields no `profile` key on the init (exactOptionalPropertyTypes forbids explicit undefined). Two construction branches in parseHL7 keep the types honest rather than smuggling `undefined` through a cast."
    - "Strict-mode code widening via `as unknown as FatalCode` (Plan 06 decision (b)): preserves the narrow FatalCode compile-time type so lenient consumers get exhaustive-switch discipline, while strict consumers narrow on the runtime string (which carries a WarningCode). Inline justification comment documents the decision."
    - "Buffer input path captures UNKNOWN_CHARSET warnings into a pre-emitter buffer array, then forwards them through the real emitter AFTER the Tier-3 fatal checks pass — so EMPTY_INPUT never races UNKNOWN_CHARSET warning emission."
key-files:
  created:
    - src/parser/index.ts
    - test/parser-public.test.ts
  modified:
    - src/index.ts
decisions:
  - "Strict-mode code mapping resolved with Plan 06 option (b): cast `w.code` through `as unknown as FatalCode` inside makeEmitter, with an inline multi-line justification comment. Rationale: option (a) would widen `Hl7ParseError.code` to `FatalCode | WarningCode` and leak strict-mode semantics into every lenient-mode consumer's exhaustive-switch; option (c) would introduce a third error class (`Hl7StrictError`) and break the 'one catch surface' promise. (b) is the minimum-surface change — the runtime set of values on err.code widens only under strict mode, and consumers who opt into strict mode accept the discriminant narrowing responsibility."
  - "EMPTY_INPUT is checked twice in the pipeline (once before BOM/MLLP strip, once after MLLP strip). Rationale: a user who sends only MLLP framing bytes (`\\u000B\\u001C\\u000D`) triggers the second check; without it, splitSegments would return [] and readDelimiters would throw NO_MSH_SEGMENT — the wrong code. Test `throws EMPTY_INPUT when only MLLP framing bytes were provided` pins this invariant."
  - "BOM strip is silent (Tier-1 per D-03) and does NOT emit a warning — even under strict mode. Test `does NOT escalate Tier-1 silent events` pins that both `\\uFEFF` BOM and `\\r\\n` line endings pass through strict mode without throwing. This is the counter-example for the common misreading of TOL-01 as 'every pre-processor event becomes a throw under strict'."
  - "stripMllpFraming: false suppresses the MLLP_FRAMING_STRIPPED warning but does NOT skip the strip itself. Rationale: leaving VT/FS in the buffer would corrupt splitSegments (FS would be swallowed into the last segment name). The user flag controls the WARNING emission, not the byte-removal. Documented in JSDoc and pinned by a dedicated test."
  - "src/index.ts barrel re-exports unescape, reescape, BUILTIN_DATE_FALLBACKS, parseHl7Timestamp — these are not strictly required by PARSE-01 but shipping them now gives Phase 3's typed composite parsers a public call site when they need the escape/unescape pair on-access. Cost is near-zero (already bundled by tsup via reachability); benefit is a single Phase 2 surface boundary to document."
  - "buildSnippet returns a leading 80-char bounded excerpt of the normalized input rather than slicing from a character offset. Rationale: Phase 2 positions are segment/field/component INDICES, not byte offsets — slicing from an offset would require re-walking the input to map (segmentIndex, fieldIndex) back to a character position, which is Phase 4+ territory. The leading-excerpt approximation matches what developers actually want in an error log (the start of the message, not a deep slice)."
metrics:
  duration: 4min
  tasks-completed: 1
  tasks-total: 1
  tests-added: 26
  files-created: 2
  files-modified: 1
  completed: 2026-04-18
---

# Phase 2 Plan 06: Public parseHL7 and Strict-Mode Capstone Summary

`parseHL7(raw, optionsOrProfile?)` now ships as the public entry point for `@cosyte/hl7-parser`, composing every Plan 01–05 primitive behind a single call: string or Buffer in, `Hl7Message` out, Tier-3 fatals thrown with full TOL-02 shape, Tier-2 warnings collected (lenient) or escalated (strict) through the single `emitWarning` chokepoint. `src/index.ts` now re-exports the full Phase 2 surface while preserving Phase 1's `VERSION` export byte-identical. PARSE-01, TOL-01, TOL-02 are code-complete; Phase 2 is code-complete (19/19 Phase 2 REQ-IDs landed — Phase 7 will verify via the coverage sweep). 26/26 parser-public tests green; 123/123 full repo suite; typecheck + lint --max-warnings=0 + build all clean. `dist/index.mjs`, `dist/index.cjs`, and `dist/index.d.ts` all ship `parseHL7` end-to-end.

## What Shipped

### Source (1 created, 1 modified)

- **`src/parser/index.ts`** (new, 285 lines) — exports `parseHL7` + re-exports `DEFAULT_ENCODING_CHARACTERS`. Structure:
  - Four internal helpers: `discriminateOptionsOrProfile` (D-06 argument shape discriminant), `makeEmitter` (D-11 chokepoint with strict-mode branch), `buildSnippet` (bounded 80-char leading excerpt for strict-mode errors), `extractVersion` (MSH-12 read via the unified 1-indexed `fields[11]` convention with full `noUncheckedIndexedAccess` guards).
  - `parseHL7` with three public overload signatures (`raw`; `raw + Profile`; `raw + ParseOptions`) plus a fourth `@internal` implementation signature. Public JSDoc + `@example` on the first overload (overload merging means the implementation does not need a duplicate).
  - 13-step explicit pipeline body, each step commented with its role and its ordering rationale against D-03.
- **`src/index.ts`** (modified) — Phase 1 `VERSION` export + file-level JSDoc preserved byte-identical (verified with `grep -c 'export const VERSION: string = "0.0.0";' src/index.ts` returning 1). Appended 17 new re-export statements covering `parseHL7`, `Hl7Message`, `Hl7ParseError`, `ProfileDefinitionError`, `FATAL_CODES`, `WARNING_CODES` + all 13 warning factories, `DEFAULT_ENCODING_CHARACTERS`, `BUILTIN_DATE_FALLBACKS`, `parseHl7Timestamp`, `unescape`, `reescape`, and the 13 named types.

### Tests (1 created)

- **`test/parser-public.test.ts`** (264 lines) — 26 cases across 6 describe blocks (26/26 passing):
  1. **Happy paths (3 cases):** well-formed v2.5 message shape, string-vs-Buffer equivalence, frozen warnings array (T-02-01-01 mitigation still honored at Plan 06's integration level).
  2. **Tier-3 fatals (6 cases):** EMPTY_INPUT on empty string, EMPTY_INPUT after MLLP strip, NO_MSH_SEGMENT, MSH_TOO_SHORT, INVALID_ENCODING_CHARACTERS, and TOL-02 shape check (message/position/snippet populated).
  3. **Tier-2 warnings + onWarning (5 cases):** MLLP_FRAMING_STRIPPED emission, onWarning reference-identity to `msg.warnings[0]`, FIELD_WHITESPACE_TRIMMED default-on, trimFields: false suppresses, stripMllpFraming: false suppresses the warning but keeps the strip (version still parses).
  4. **Strict-mode escalation (4 cases):** MLLP_FRAMING_STRIPPED becomes a throw with correct code; onWarning NOT invoked in strict mode; Tier-1 silent events (BOM, `\r\n`) do NOT escalate under strict; EMPTY_INPUT fatal keeps the same code in strict (Tier-3 already fatal).
  5. **Argument discrimination (4 cases):** bare Profile treated as profile overload; ParseOptions-with-nested-profile wins the options branch; `{ profile: null }` = PROF-08 opt-out; `profile.lineage` defaults to `[profile.name]`.
  6. **PARSE-01 end-to-end (4 cases):** v2.3 parse, v2.8 with custom encoding chars (`#$%*@`), segment order preservation with repeating + Z-segments, empty-string `version` when MSH-12 absent.

## Commits

| Gate | Hash | Message |
|------|------|---------|
| RED (test)  | `60c5817` | `test(02-06): add failing integration tests for public parseHL7 + src/index.ts barrel` |
| GREEN (feat) | `846a652` | `feat(02-06): implement public parseHL7 with strict-mode escalation + full barrel` |

No REFACTOR commit — the GREEN implementation was already structured (13 explicit pipeline steps, 4 named helpers); no duplication or naming drift to clean up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Buffer` import needed `import type` form**

- **Found during:** GREEN lint run (step after typecheck).
- **Issue:** `@typescript-eslint/consistent-type-imports` flagged `import { Buffer } from "node:buffer";` because `Buffer` is only used as a type annotation in the parseHL7 overload signatures (never as a value).
- **Fix:** Changed to `import type { Buffer } from "node:buffer";`.
- **Files modified:** `src/parser/index.ts`.
- **Part of commit:** `846a652` (folded into the GREEN commit).

**2. [Rule 3 - Blocking] Implementation overload signature needed JSDoc**

- **Found during:** GREEN lint run.
- **Issue:** `jsdoc/require-jsdoc` flagged the implementation signature `export function parseHL7(raw, optionsOrProfile?) { ... }` separately from the three public overloads — the rule sees it as its own `ExportNamedDeclaration > FunctionDeclaration`. Without a JSDoc block the lint fails at `--max-warnings=0`.
- **Fix:** Added `/** @internal — implementation signature; overload signatures above carry the public JSDoc + @example. */` directly above the implementation signature. The `@internal` tag exempts it from `jsdoc/require-example`.
- **Files modified:** `src/parser/index.ts`.
- **Part of commit:** `846a652`.

No other deviations. The plan's `<action>` text was followed end-to-end, including the exact strict-mode decision path (option (b)).

## Strict-Mode Cast Choice

**Taken:** Option (b) — `w.code as unknown as (typeof FATAL_CODES)[keyof typeof FATAL_CODES]` inside `makeEmitter`, with an inline multi-line justification comment.

**Why:**
- Option (a) — widening `Hl7ParseError.code` to `FatalCode | WarningCode` — would leak strict-mode semantics into every lenient consumer's exhaustive `switch (err.code)` narrowing (17 codes instead of 4). Plan 01 explicitly locked the narrow `FatalCode` taxonomy precisely to give lenient-mode consumers this discipline.
- Option (c) — introducing `class Hl7StrictError extends Hl7ParseError { readonly code: WarningCode }` — would introduce a third error class and break the "one catch surface" that TOL-01 implicitly promises. Consumers would need two `instanceof` checks.
- Option (b) is the minimum-surface choice: the runtime set of values `err.code` can take widens only for consumers who opted into `{ strict: true }`, and the compile-time type surface stays honest for lenient callers. The escape hatch is localised to a single call site (`makeEmitter`) and is annotated with the full rationale.

Lint: `consistent-type-assertions: { assertionStyle: "as", objectLiteralTypeAssertions: "never" }` allows the `as unknown as T` narrow-through-unknown form (it only rejects object-literal casts), so no `eslint-disable` directive was needed.

## src/index.ts Barrel Final Export List

**Values (18):**
- `VERSION` (preserved from Phase 1)
- `parseHL7` (function)
- `Hl7Message` (class)
- `Hl7ParseError`, `ProfileDefinitionError` (classes)
- `FATAL_CODES`, `WARNING_CODES`, `DEFAULT_ENCODING_CHARACTERS`, `BUILTIN_DATE_FALLBACKS` (const records / arrays)
- `parseHl7Timestamp`, `unescape`, `reescape` (functions)
- 13 warning factories: `mllpFramingStripped`, `fieldWhitespaceTrimmed`, `unknownEscapeSequence`, `timestampFallbackFormat`, `segmentCase`, `extraFields`, `unknownSegment`, `duplicateRequiredSegment`, `encodingMismatch`, `missingRequiredField`, `outOfOrderSegment`, `versionMismatch`, `unknownCharset`

**Types (15):**
- `FatalCode`, `WarningCode`, `Hl7ParseWarning`
- `Hl7Position`, `ParseOptions`, `OnWarningCallback`, `Profile`, `EncodingCharacters`
- `RawSegment`, `RawField`, `RawRepetition`, `RawComponent`
- `ParseHl7TimestampOptions`

## Integration Surface Confirmed

| Artifact | `parseHL7` present? | `Hl7Message` present? |
|----------|---------------------|-----------------------|
| `dist/index.mjs` | yes (2 occurrences — named export + bundled body) | yes (bundled) |
| `dist/index.cjs` | yes (CJS via tsup conditional export) | yes |
| `dist/index.d.ts` | yes (38 combined `parseHL7`/`Hl7Message` tokens — declarations + overloads + references) | yes |

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint (max-warnings=0) | `pnpm lint` | exit 0 |
| Full test suite | `pnpm test` | 13 files, 123 tests, all pass |
| parser-public only | `pnpm test -- --run parser-public` | 26/26 pass |
| Build | `pnpm build` | ESM 21.93 KB, CJS 22.58 KB, DTS 33.72 KB, all succeed |

All acceptance criteria from the plan's `<acceptance_criteria>` block verified (including dist-bundling checks and the VERSION-preservation assertion).

## Phase 2 Complete

With Plan 06 landed, Phase 2 is code-complete across all 19 REQ-IDs:

- **Core Parsing (PARSE-01..09):** 9/9 landed.
  - PARSE-01 (parse well-formed v2.1–v2.8 messages) — closed in Plan 06 integration tests.
  - PARSE-02 (non-default encoding chars) — closed in Plan 03 (`readDelimiters`) + Plan 06 integration test "parses v2.8 message with custom encoding chars".
  - PARSE-03 (segment/field/repetition/component/subcomponent tokenization) — closed in Plan 03.
  - PARSE-04 (segment order preservation) — closed in Plan 03 + verified in Plan 06 integration test.
  - PARSE-05 (escape sequences) — closed in Plan 04.
  - PARSE-06 (empty vs null field) — closed in Plan 03 (`RawField.isNull`).
  - PARSE-07 (MLLP framing strip) — closed in Plan 02.
  - PARSE-08 (BOM strip, mixed line endings) — closed in Plan 02 + Plan 06 pipeline composition.
  - PARSE-09 (MSH-18 charset; UTF-8 default + UNKNOWN_CHARSET warn) — closed in Plan 02 (`normalizeBuffer`).
- **Real-World Tolerance (TOL-01..10):** 10/10 landed (9 runtime-verified + 1 typed-surface-complete).
  - TOL-01 (strict-mode escalation) — closed in Plan 06 `makeEmitter`.
  - TOL-02 (Hl7ParseError shape with code/message/position/snippet) — closed in Plan 01 + Plan 06 integration tests.
  - TOL-03 (Tier-2 warning codes + positional context) — closed in Plan 01 (typed surface) + emission wired across Plans 02/03/04/05.
  - TOL-04 (`msg.warnings` array) — closed in Plan 01.
  - TOL-05 (`onWarning` callback inline) — closed in Plan 06 `makeEmitter`.
  - TOL-06 (MLLP_FRAMING_STRIPPED) — closed in Plan 02 + Plan 06 integration tests.
  - TOL-07 (FIELD_WHITESPACE_TRIMMED) — closed in Plan 03 + Plan 06 integration tests.
  - TOL-08 (user `dateFormats` order-sensitivity) — closed in Plan 05.
  - TOL-09 (built-in date fallbacks always tried after user formats) — closed in Plan 05.
  - TOL-10 (UNKNOWN_ESCAPE_SEQUENCE preserved verbatim + warned) — closed in Plan 04.

Phase 7's coverage sweep will verify the ≥90% lines/functions/statements + ≥85% branches thresholds on `src/parser/**` and `src/model/**`. Phase 2 ships with 123 tests across 13 files — enough for the Phase 2 verifier gate; Phase 7 is hardening, not initial testing.

## Open Items for Phase 3

(None blocking the Phase 2 transition — these are the intentional Phase 3+ hand-offs.)

- **`msg.get(path)` and `msg.segments(type)`** — Phase 3 will consume `Hl7Message.segments` (the raw positional tree exposed by Plan 01 + populated by Plan 03) and call `unescape` on-access (the public export shipped in this plan's barrel update).
- **`msg.meta.timestamp` / `msg.meta.version`** — Phase 4 will extend the minimal MSH-12 read done in `extractVersion` and call `parseHl7Timestamp` on MSH-7. The types and functions are already public.
- **Raw structural shape is now locked.** `RawSegment` / `RawField` / `RawRepetition` / `RawComponent` (Plan 01) + the 1-indexed `fields[]` convention (Plan 03) + the 13 Tier-2 codes (Plan 01) are the public contract. Phase 3 extends by adding fields, never renaming.
- **Strict-mode `err.code` narrowing.** Phase 8's README Error Handling section should document the strict-mode widening: under `{ strict: true }` a thrown `Hl7ParseError` can carry any `WarningCode` in `err.code` in addition to the four `FatalCode`s. Consumers narrow on the runtime string. T-02-06-03 (STRIDE: Spoofing) accepted this with a Phase 8 README mitigation.

## Self-Check: PASSED

- File `src/parser/index.ts` exists: FOUND
- File `test/parser-public.test.ts` exists: FOUND
- File `src/index.ts` modified (parseHL7 export present): FOUND
- Commit `60c5817` exists in git log: FOUND (test RED gate)
- Commit `846a652` exists in git log: FOUND (feat GREEN gate)
- TDD gate sequence verified: `test(02-06)` → `feat(02-06)` in correct order.
