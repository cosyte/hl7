# @cosyte/hl7-parser — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/hl7-parser`
- **Core value:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.
- **Current focus:** Phase 2 — Core Parser & Tolerance (COMPLETE — all 6 plans shipped; pending /gsd-verify-work 2 and /gsd-validate-phase 2. Phase 1 still pending /gsd-verify-work 1 and /gsd-validate-phase 1)
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

- **Milestone:** v1
- **Phase:** 2 — Core Parser & Tolerance
- **Plans:** 6 plans across 3 waves (01 warnings/errors/message-shell — Wave 1 COMPLETE; 02 normalize+mllp+charset, 03 segments+delimiters+tokenize, 04 escapes, 05 dateFormats — Wave 2 parallel, COMPLETE; 06 parseHL7 public + strict-mode capstone — Wave 3 COMPLETE)
- **Status:** All three waves complete. Plan 01 shipped types/warnings/errors/message-shell; Plans 02/03/04/05 shipped normalize+mllp, segments+delimiters+tokenize, escapes, and dateFormats plumbing; Plan 06 shipped the public parseHL7 entry point, the emit chokepoint with strict-mode escalation, and the full src/index.ts barrel. Unified HL7 1-indexed `fields[]` convention locked in `src/parser/types.ts` and exercised through to MSH-12 version extraction. PARSE-01 + TOL-01 + TOL-02 verified end-to-end.
- **Progress:** 0/8 phases complete (Phases 1 & 2 deliverables done, verification gates pending); 4/4 Phase 1 plans complete; 6/6 Phase 2 plans complete

```
[░░░░░░░░░░░░░░░░░░░░] 0%   (0 / 8 phases)
```

## Performance Metrics

- **Phases completed:** 0 (Phase 1 plans done; pending verifier + Nyquist + transition)
- **Plans completed:** 6
- **REQ-IDs validated:** 27 / 97 (SETUP-01..06 + PARSE-01..09 + TOL-01..10 + plus the typed-surface TOL-03/04/05 re-exercised end-to-end through the public parseHL7 barrel). Phase 7 will confirm via the coverage sweep + vendor-quirks fixtures.
- **Known coverage:** Phase 1 sanity 2/2. Phase 2 (Plans 01–06): full suite 123/123 passing across 13 files (types 5, warnings 6, errors 4, message 5, normalize 8, mllp 7, segments 7, delimiters 10, tokenize 15, escapes 15, dates 13, parser-public 26, sanity 2). Coverage enforcement starts in Phase 7 via `pnpm test:coverage`.

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 1 | 01 package-scaffold | 2 min | 3 | 9 |
| 1 | 02 build-system | 1 min | 2 | 1 |
| 1 | 03 lint-and-test | 2 min | 4 | 6 |
| 1 | 04 smoke-verification | 4 min | 2 (+ 2 auto-fix commits) | 2 created, 4 modified |
| 2 | 01 warnings/errors/message-shell | 8 min | 3 (2 TDD cycles) | 8 created |
| 2 | 04 escape-sequences | 6 min | 1 (1 TDD cycle) | 2 created |
| 2 | 05 dateFormats-plumbing | 3 min | 1 (1 TDD cycle) | 2 created |
| 2 | 06 parseHL7-public-and-strict-mode | 4 min | 1 (1 TDD cycle) | 2 created, 1 modified |

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

- **Last action:** Phase 2 Plan 06 executed — shipped `src/parser/index.ts` + `test/parser-public.test.ts`; modified `src/index.ts` to add the full Phase 2 barrel. Commits: `60c5817` (RED integration tests), `846a652` (GREEN parseHL7 + barrel). Typecheck + lint --max-warnings=0 + test + build all green; full repo suite 123/123. Closes PARSE-01, TOL-01, TOL-02. Strict-mode code mapping resolved via Plan 06 option (b): `as unknown as FatalCode` cast inside makeEmitter with inline justification. All 19 Phase 2 REQ-IDs are code-complete.
- **Next action:** Run `/gsd-verify-work 2` then `/gsd-validate-phase 2` for Phase 2 completion; then `/gsd-transition` to advance to Phase 3 (Read-path traversal + typed composites). Phase 1 `/gsd-verify-work 1` + `/gsd-validate-phase 1` also still open from earlier.
- **Open questions:** (none for Phase 2 — strict-mode mapping resolved in Plan 06). Phase 8's README Error Handling section should document the strict-mode `err.code` widening (under `{ strict: true }` a thrown Hl7ParseError may carry any WarningCode in addition to the four FatalCodes).
- **Resume file:** `.planning/phases/02-core-parser-and-tolerance/02-06-SUMMARY.md`

---

*Last updated: 2026-04-18 (Phase 2 Plan 06 complete — Phase 2 all 6 plans done, parseHL7 public API shipped, 19/19 Phase 2 REQ-IDs code-complete; pending Phase 2 verification gates)*
