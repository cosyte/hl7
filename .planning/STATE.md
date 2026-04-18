# @cosyte/hl7-parser — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/hl7-parser`
- **Core value:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.
- **Current focus:** Phase 2 — Core Parser & Tolerance (Plan 01 complete; Plans 02–05 Wave 2 ready to execute in parallel; Plan 06 Wave 3 last. Phase 1 still pending /gsd-verify-work 1 and /gsd-validate-phase 1)
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

- **Milestone:** v1
- **Phase:** 2 — Core Parser & Tolerance
- **Plans:** 6 plans across 3 waves (01 warnings/errors/message-shell — Wave 1 COMPLETE; 02 normalize+mllp+charset, 03 segments+delimiters+tokenize, 04 escapes, 05 dateFormats — Wave 2 parallel, READY; 06 parseHL7 public + strict-mode capstone — Wave 3)
- **Status:** Wave 1 complete (Plan 01 shipped: types, warnings registry, error taxonomy, Hl7Message shell). Wave 2 (Plans 02–05) can execute in parallel now — all share the types/warnings/errors surface locked by Plan 01. Unified HL7 1-indexed `fields[]` convention locked in `src/parser/types.ts`.
- **Progress:** 0/8 phases complete (Phase 1 deliverables done, verification gates pending); 4/4 Phase 1 plans complete; 1/6 Phase 2 plans complete

```
[░░░░░░░░░░░░░░░░░░░░] 0%   (0 / 8 phases)
```

## Performance Metrics

- **Phases completed:** 0 (Phase 1 plans done; pending verifier + Nyquist + transition)
- **Plans completed:** 5
- **REQ-IDs validated:** 6 / 97 (SETUP-01 through SETUP-06). Phase 2 TOL-03/TOL-04/TOL-05 *typed surface* shipped in Plan 01; runtime emission validated in Plans 02–06.
- **Known coverage:** Phase 1 sanity 2/2. Phase 2 Plan 01: 20/20 plan-level tests green (5 types + 6 warnings + 4 errors + 5 model). Coverage enforcement starts in Phase 7 via `pnpm test:coverage`.

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 1 | 01 package-scaffold | 2 min | 3 | 9 |
| 1 | 02 build-system | 1 min | 2 | 1 |
| 1 | 03 lint-and-test | 2 min | 4 | 6 |
| 1 | 04 smoke-verification | 4 min | 2 (+ 2 auto-fix commits) | 2 created, 4 modified |
| 2 | 01 warnings/errors/message-shell | 8 min | 3 (2 TDD cycles) | 8 created |

## Accumulated Context

### Key Decisions (carry-forward from PROJECT.md)

- Lenient parsing is the default; strict is opt-in.
- Warnings carry stable string codes + positional context.
- Profiles are plain data produced by `defineProfile()`; built-ins use the public API.
- Serializer always emits spec-clean HL7 (Postel's Law: conservative emitter).
- Profile starter kit is a first-class deliverable.
- Zero runtime dependencies.
- Fatal errors limited to 4 Tier-3 codes: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`.
- `setDefaultProfile()` exists but is discouraged; process-scoped, not shared across workers.
- Zero runtime dependencies enforced via explicit empty `dependencies: {}` block in package.json (Plan 01-01).
- Strict TypeScript goes beyond `strict: true` — also `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noPropertyAccessFromIndexSignature` (Plan 01-01).
- `packageManager: pnpm@9.0.0` pinned for reproducibility (Plan 01-01).
- Wave 2 plans (02, 03) must NOT modify package.json — all devDeps and scripts are already wired in Plan 01 (Plan 01-01).
- tsup outExtension override forces `.mjs`/`.cjs` suffixes because tsup's defaults would not match the `exports` map in package.json (Plan 01-02).
- `skipNodeModulesBundle: true` in tsup.config keeps zero-runtime-deps posture honest — any future runtime dep would require an explicit architectural decision (Plan 01-02).
- ESLint flat config (eslint.config.js) — no legacy .eslintrc.*; eslint-config-prettier MUST be the last element in the default-exported array so Prettier-compat rules win (Plan 01-03).
- Type-aware lint rules (no-unsafe-*, no-floating-promises) enabled via `parserOptions.project: "./tsconfig.json"` — catches bugs strict tsc alone wouldn't flag at author time (Plan 01-03).
- CLAUDE.md guardrails (no any, no unjustified as, JSDoc+@example on public exports, no console) enforced as ESLint errors — not just typecheck (Plan 01-03).
- Vitest config declares per-directory coverage thresholds (src/parser/**, src/model/**, src/helpers/** at ≥ 90% lines/functions/statements, ≥ 85% branches) now for shape stability; Phase 7 is the enforcement gate via `pnpm test:coverage` (Plan 01-03).
- Prettier config (`printWidth:100`, `tabWidth:2`, `semi:true`, `singleQuote:false`, `trailingComma:all`, `endOfLine:lf`) aligned with `.editorconfig` exactly; `.planning/` excluded to avoid markdown-code-fence reflow churn (Plan 01-03).
- Removed `rootDir: ./src` from base `tsconfig.json`: it forbade `tsc --noEmit` from typechecking test files and root-level config files that the `include` glob also matched. Emit scoping is handled by tsup's `entry` + `tsconfig.build.json`'s narrower `include` (Plan 01-04, Rule 1 integration bug fix).
- `src/index.ts` file-level JSDoc cannot start with `@{package-name}` pattern because `eslint-plugin-jsdoc`'s `check-tag-names` rule parses leading `@tokens` as tag names. Put the package name in backticks mid-sentence instead (Plan 01-04, Rule 1 fix).
- CI workflow at `.github/workflows/ci.yml` runs Node 18/20/22 matrix with `permissions: contents: read` + `concurrency` + `cancel-in-progress`. All actions pinned to `@v4` major tag. `pnpm install --frozen-lockfile` enforces lockfile consistency; final step re-runs ESM/CJS dual-module smoke to guard SETUP-02 (Plan 01-04).
- `pnpm-lock.yaml` is committed (not in `.gitignore`) for supply-chain reproducibility (T-01-01/T-01-04-01 mitigation) (Plan 01-04).

### Active Todos

(none — pending Phase 1 planning)

### Blockers

(none)

### Notes

- Roadmap derived from 97 v1 REQ-IDs across 13 categories (SETUP, PARSE, MODEL, HELPERS, TYPES, TOL, SER, PROF, BIP, TEST, EX, KIT, DOC).
- Tolerance (TOL) folded into Phase 2 (Core Parser) because warnings are deeply coupled to parsing and standard granularity discourages splitting cross-cutting concerns into their own phase when they can't run independently.
- Testing (TEST) is its own late phase (Phase 7) to centralize coverage enforcement, vendor-quirks fixtures, strict-mode sweep, and profile-authoring tests — but earlier phases still ship with enough tests to verify their success criteria; Phase 7 is hardening, not initial testing.
- Library has no UI; every phase is `UI hint: no`.

## Session Continuity

- **Last action:** Phase 2 Plan 01 executed — shipped `src/parser/types.ts`, `src/parser/warnings.ts`, `src/parser/errors.ts`, `src/model/message.ts` plus 4 test files (20/20 passing). Commits: `a589d08` (RED types+warnings+errors tests), `e8de15a` (GREEN types+warnings+errors sources), `03ecd53` (RED message test), `c487414` (GREEN message shell). Typecheck + lint + test + build all green. `src/index.ts` unchanged (barrel update is Plan 06).
- **Next action:** Execute Wave 2 of Phase 2 — Plans 02, 03, 04, 05 may run in parallel now that the types/warnings/errors surface is locked. Plan 06 runs last (Wave 3). Still open: `/gsd-verify-work 1` + `/gsd-validate-phase 1` for Phase 1.
- **Open questions:** Plan 06 must decide strict-mode code mapping (widen `Hl7ParseError.code` vs. new `Hl7StrictError` class vs. preserve warning code in a side channel). See Plan 01 summary §"Keys for Plan 06" for details.
- **Resume file:** `.planning/phases/02-core-parser-and-tolerance/02-01-SUMMARY.md`

---

*Last updated: 2026-04-18 (Phase 2 Plan 01 complete — wave 1 done, Wave 2 ready)*
