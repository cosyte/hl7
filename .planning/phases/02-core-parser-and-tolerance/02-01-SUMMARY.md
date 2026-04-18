---
phase: 02-core-parser-and-tolerance
plan: 01
subsystem: parser
tags: [warnings, errors, types, model, tdd, tier-2, tier-3]
wave: 1
requires: []
provides:
  - WARNING_CODES
  - WarningCode
  - Hl7ParseWarning
  - FATAL_CODES
  - FatalCode
  - Hl7ParseError
  - ProfileDefinitionError
  - Hl7Position
  - ParseOptions
  - OnWarningCallback
  - Profile
  - EncodingCharacters
  - RawSegment
  - RawField
  - RawRepetition
  - RawComponent
  - Hl7Message
  - Hl7MessageInit
affects:
  - src/index.ts (unchanged — barrel update deferred to Plan 06)
tech-stack:
  added: []
  patterns:
    - "Const-record + literal-union pattern for stable string codes (WARNING_CODES, FATAL_CODES)"
    - "One factory per warning code (mllpFramingStripped, fieldWhitespaceTrimmed, ...) with payload in closure, frozen return"
    - "Single-class Error subclass with `code` discriminant (Hl7ParseError) — no per-code subclasses"
    - "Frozen-array model boundary: Object.freeze(init.warnings.slice()) inside Hl7Message constructor"
    - "exactOptionalPropertyTypes-compatible constructor init: optional profile key omitted rather than set to undefined"
key-files:
  created:
    - src/parser/types.ts
    - src/parser/warnings.ts
    - src/parser/errors.ts
    - src/model/message.ts
    - test/parser-types.test.ts
    - test/parser-warnings.test.ts
    - test/parser-errors.test.ts
    - test/model-message.test.ts
  modified: []
decisions:
  - "Tasks 1 and 2 committed as a single GREEN commit because types.ts forward-imports Hl7ParseWarning from warnings.ts to type OnWarningCallback — splitting them would leave types.ts typecheck transiently red (deviation Rule 3: fix blocking plan-level ordering)."
  - "Constructor JSDoc marked @internal on Hl7ParseError, ProfileDefinitionError, and Hl7Message — satisfies jsdoc/require-jsdoc without requiring @example on implementation-level methods; @example lives on the class itself."
  - "Warning factory messages all include their payload context inline (segment name, trimmed delta, escape sequence) so consumers can log warnings directly without re-looking-up context."
metrics:
  duration: "8m 3s"
  tasks-completed: 3
  tasks-total: 3
  tests-added: 20
  files-created: 8
  completed: 2026-04-18T20:34:25Z
---

# Phase 2 Plan 01: Warnings, Errors, and Message Shell — Summary

Ship the foundational types, warning registry, error taxonomy, and `Hl7Message` shell that every other Phase 2 plan imports in parallel wave 2+.

## What Shipped

**Source files (4):**
- `src/parser/types.ts` — 9 shared types: `Hl7Position`, `ParseOptions`, `OnWarningCallback`, `Profile`, `EncodingCharacters`, `RawSegment`, `RawField`, `RawRepetition`, `RawComponent`. Documents the 1-indexed `fields[]` convention that Plan 03 (`tokenize.ts`) and Plan 06 (`extractVersion` on `MSH-12`) consume.
- `src/parser/warnings.ts` — `WARNING_CODES` (13 Tier-2 codes as a frozen record), `WarningCode` union, `Hl7ParseWarning` interface, and 13 camelCase factories (`mllpFramingStripped`, `fieldWhitespaceTrimmed`, `unknownEscapeSequence`, `timestampFallbackFormat`, `segmentCase`, `extraFields`, `unknownSegment`, `duplicateRequiredSegment`, `encodingMismatch`, `missingRequiredField`, `outOfOrderSegment`, `versionMismatch`, `unknownCharset`). Each factory bakes its contextual payload (segment name, trimmed delta, escape sequence, etc.) into the `message` field.
- `src/parser/errors.ts` — `FATAL_CODES` (4 Tier-3 codes), `FatalCode` union, `Hl7ParseError` class (code + message + position + snippet, all required), and `ProfileDefinitionError` class (declared now so Phase 6 does not edit Phase 2 files).
- `src/model/message.ts` — `Hl7Message` class shell with 5 public readonly fields. Constructor freezes the `warnings` array via `Object.freeze(init.warnings.slice())` at the model boundary (T-02-01-01 STRIDE mitigation).

**Test files (4):** 20 cases total, all passing.
- `test/parser-types.test.ts` (5 cases)
- `test/parser-warnings.test.ts` (6 cases)
- `test/parser-errors.test.ts` (4 cases)
- `test/model-message.test.ts` (5 cases)

## Commits

| # | Hash | Type | Message |
|---|------|------|---------|
| 1 | `a589d08` | test | `test(02-01): add failing tests for parser types, warnings, and errors` (RED) |
| 2 | `e8de15a` | feat | `feat(02-01): add parser types, warnings registry, and error taxonomy` (GREEN) |
| 3 | `03ecd53` | test | `test(02-01): add failing test for Hl7Message shell` (RED) |
| 4 | `c487414` | feat | `feat(02-01): add Hl7Message model shell with frozen warnings` (GREEN) |

Two RED → GREEN TDD cycles. `fix()` / `refactor()` commits were not required — all three files passed lint on first authoring (after the single constructor-JSDoc fix noted below).

## REQ-IDs Closed

All three are "surface / typed contract" closes — runtime emission is
verified end-to-end by Plan 06; Plans 02–05 consume the surface this plan
locks.

- **TOL-03** — `Hl7Position` interface with all 5 index fields exported.
  Warnings + fatal errors carry this shape by type-level requirement
  (factory signatures + `Hl7ParseError` constructor). Factories produce
  positional context in every warning they build.
- **TOL-04** — `Hl7Message.warnings` is `readonly Hl7ParseWarning[]`,
  always present, frozen at the model boundary via `Object.freeze()` so
  downstream phases cannot mutate after handoff. Test
  `test/model-message.test.ts` "freezes the warnings array after
  construction" asserts `Object.isFrozen(msg.warnings) === true`.
- **TOL-05** — `OnWarningCallback` type exported from
  `src/parser/types.ts` with structural signature
  `(warning: Hl7ParseWarning) => void`. `ParseOptions.onWarning` uses
  this type, ready for Plan 06 to funnel `emitWarning` calls through.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined Task 1 + Task 2 GREEN commits**

- **Found during:** Task 1 verification (`pnpm typecheck`).
- **Issue:** Task 1 acceptance requires `pnpm typecheck` to pass after
  creating `src/parser/types.ts` alone, but the plan's interface text
  specifies `import type { Hl7ParseWarning } from "./warnings.js"` at
  the top of `types.ts` (so `OnWarningCallback` can reference the
  warning shape). Without `warnings.ts` (Task 2's artifact), `tsc`
  reports `TS2307: Cannot find module './warnings.js'`.
- **Fix:** Kept the plan's RED/GREEN structure but committed the three
  source files (`types.ts`, `warnings.ts`, `errors.ts`) as one GREEN
  commit (`e8de15a`). RED tests for Tasks 1+2 went in a single earlier
  commit (`a589d08`). Task 3's RED (`03ecd53`) and GREEN (`c487414`)
  stayed as separate commits.
- **Files modified:** n/a — ordering only.
- **Commit:** `e8de15a` (combined GREEN).
- **Rationale:** The plan explicitly tolerated this in prose under
  `<interfaces>`: "Plan 03 then imports those SAME interfaces from
  types.ts — no redefinition, no cycle." The authored artifacts match
  the plan's interface text verbatim; only the commit granularity
  changed.

**2. [Rule 2 - Missing critical] Added `@internal` JSDoc to three class constructors**

- **Found during:** Task 1+2 GREEN verification (`pnpm lint`).
- **Issue:** ESLint's `jsdoc/require-jsdoc` rule has
  `MethodDefinition: true`, so `public constructor(...)` on
  `Hl7ParseError`, `ProfileDefinitionError`, and `Hl7Message` all
  required JSDoc blocks. The plan called out `@example` on class bodies
  but not on constructors.
- **Fix:** Added short `@internal` JSDoc blocks to each constructor
  (3 total). `@internal` exempts from `jsdoc/require-example`, matching
  the plan's pattern for `Hl7MessageInit`.
- **Files modified:** `src/parser/errors.ts`, `src/model/message.ts`.
- **Commit:** Applied inside `e8de15a` (for errors.ts) and `c487414`
  (for message.ts).

### Architectural Changes

None — everything matches CONTEXT.md decisions D-04 through D-15 and
PATTERNS.md verbatim.

## Keys for Plan 06

Plan 06 owns the `parseHL7` public API and the `src/index.ts` barrel
update. Relevant handoff notes:

1. **Frozen-warnings assignment pattern.** The `Hl7Message` constructor
   expects a `readonly Hl7ParseWarning[]` — Plan 06's `emitWarning`
   chokepoint should accumulate warnings into a private mutable array
   during parse, then pass it to `new Hl7Message({ warnings: arr, ... })`.
   The constructor's `slice() + Object.freeze()` handles the immutable
   handoff — Plan 06 does NOT need to freeze warnings itself.

2. **emitWarning chokepoint sketch.** Based on PATTERNS.md D-11 plus the
   types locked here, Plan 06's emitter will look like:

   ```ts
   // Mutable accumulator lives inside parseHL7; never escapes.
   const warnings: Hl7ParseWarning[] = [];
   const emit: (w: Hl7ParseWarning) => void = (w) => {
     if (options.strict === true) {
       throw new Hl7ParseError(
         // Hl7ParseError.code is FatalCode, NOT WarningCode — Plan 06
         // maps WarningCode → a synthetic FatalCode only if it needs to
         // preserve the warning code in the thrown error. Alternative:
         // Plan 06 introduces a separate Hl7StrictError or reuses
         // Hl7ParseError.code as a widened union; decision deferred.
         // See "Strict-mode code mapping" note below.
         "EMPTY_INPUT",  // placeholder
         w.message,
         w.position,
         snippetFromInput(input, w.position),
       );
     }
     warnings.push(w);
     options.onWarning?.(w);
   };
   ```

3. **Strict-mode code mapping (OPEN QUESTION for Plan 06).** The plan
   locks `FatalCode` as the union of the 4 Tier-3 codes. Strict mode
   throws `Hl7ParseError` for any warning — but the warning's code is a
   `WarningCode`, not a `FatalCode`. Plan 06 will need to decide one of:
   (a) widen `Hl7ParseError.code` to `FatalCode | WarningCode`,
   (b) introduce a separate `Hl7StrictError` class, or
   (c) keep `Hl7ParseError.code` narrow and preserve the warning code in
   an extra field (e.g. `Hl7ParseError.warningCode?: WarningCode`).
   This plan does NOT make the call — flag for Plan 06 planning.

4. **`src/index.ts` barrel additions needed.** The exports to add in
   Plan 06:

   ```ts
   export { parseHL7 } from "./parser/index.js";
   export { Hl7Message } from "./model/message.js";
   export {
     FATAL_CODES,
     Hl7ParseError,
     ProfileDefinitionError,
   } from "./parser/errors.js";
   export type { FatalCode } from "./parser/errors.js";
   export { WARNING_CODES, /* 13 factories */ } from "./parser/warnings.js";
   export type { WarningCode, Hl7ParseWarning } from "./parser/warnings.js";
   export type {
     ParseOptions,
     Profile,
     Hl7Position,
     OnWarningCallback,
     EncodingCharacters,
     RawSegment,
     RawField,
     RawRepetition,
     RawComponent,
   } from "./parser/types.js";
   ```

   The factories are numerous; Plan 06 may choose to re-export all 13 or
   only publish `WARNING_CODES` + the `Hl7ParseWarning` type and keep
   factories internal. Recommendation: keep factories internal —
   consumers never need to construct warnings, only inspect them.

## Verification

All plan-level verification commands pass on the final commit
(`c487414`):

```bash
pnpm typecheck   # 0 errors
pnpm lint --max-warnings=0   # 0 errors, 0 warnings
pnpm test -- --run parser-types parser-warnings parser-errors model-message
# 4 files, 20 tests, all pass
pnpm build   # dual ESM+CJS + DTS build success
```

Full test run (`pnpm test`) also green: 22/22 (5 plan-new + 2 sanity).

Coverage: `src/parser/warnings.ts`, `src/parser/errors.ts`, and
`src/model/message.ts` have direct unit tests; `src/parser/types.ts` is
type-only (no runtime branches to cover). Plan 7 will enforce coverage
thresholds; local runs are green.

## Known Stubs

None — every exported symbol in this plan has a complete implementation
for its Phase 2 surface. The `Profile` type is structurally a
placeholder for Phase 6 (CONTEXT.md D-07), but that is deliberate and
called out in the plan; no stub behaviour is wired to UI.

## Threat Surface Scan

Files modified: `src/parser/types.ts`, `src/parser/warnings.ts`,
`src/parser/errors.ts`, `src/model/message.ts`. None introduce new
network endpoints, authentication paths, file access, or trust-boundary
schema changes beyond what the plan's `<threat_model>` already
identified. T-02-01-01 (Tampering — consumer mutates `msg.warnings`)
mitigated by `Object.freeze` in the `Hl7Message` constructor; verified
by `test/model-message.test.ts`. T-02-01-02 and T-02-01-03 remain
accepted per plan.

## Self-Check: PASSED

Files verified to exist at the SHAs above:

- `src/parser/types.ts` — FOUND
- `src/parser/warnings.ts` — FOUND
- `src/parser/errors.ts` — FOUND
- `src/model/message.ts` — FOUND
- `test/parser-types.test.ts` — FOUND
- `test/parser-warnings.test.ts` — FOUND
- `test/parser-errors.test.ts` — FOUND
- `test/model-message.test.ts` — FOUND

Commits verified in `git log`:

- `a589d08` — FOUND
- `e8de15a` — FOUND
- `03ecd53` — FOUND
- `c487414` — FOUND
