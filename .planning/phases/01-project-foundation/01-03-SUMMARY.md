---
phase: 01-project-foundation
plan: 03
subsystem: tooling
tags: [linting, formatting, testing, eslint, prettier, vitest, flat-config]

# Dependency graph
requires:
  - 01-01-package-scaffold (devDependencies for eslint, prettier, vitest; scripts.lint/format/test; tsconfig.json)
provides:
  - eslint.config.js flat config enforcing CLAUDE.md guardrails at lint layer
  - .eslintignore belt-and-suspenders for editor integrations
  - .prettierrc.json with concrete opinionated options aligned with .editorconfig
  - .prettierignore excluding generated + tool-owned files
  - vitest.config.ts with node env, v8 coverage provider, per-directory thresholds
  - test/sanity.test.ts proving Vitest + TS + src resolution work end-to-end
affects: [01-04-smoke-verification, all-downstream-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESLint flat config (eslint.config.js) — no legacy .eslintrc.*; @typescript-eslint/parser with parserOptions.project for type-aware rules"
    - "eslint-config-prettier is the FINAL element in the flat config array so it can disable rules that conflict with Prettier"
    - "CLAUDE.md guardrails encoded as lint rules: no-explicit-any, no-unsafe-*, no-non-null-assertion, consistent-type-assertions (objectLiteralTypeAssertions: never), no-console, jsdoc/require-jsdoc+require-example on public exports"
    - "Test files get JSDoc relaxation only (require-jsdoc / require-example off); all other rules still apply to keep tests honest"
    - "Prettier config locked to printWidth:100, tabWidth:2, semi:true, singleQuote:false, trailingComma:all, endOfLine:lf — matches .editorconfig exactly"
    - "Vitest: globals:false (explicit imports), node env, v8 coverage, per-directory thresholds for src/parser/**, src/model/**, src/helpers/** matching CLAUDE.md ≥ 90% guardrail"

key-files:
  created:
    - eslint.config.js
    - .eslintignore
    - .prettierrc.json
    - .prettierignore
    - vitest.config.ts
    - test/sanity.test.ts
  modified: []

key-decisions:
  - "eslint.config.js written in JavaScript (not TypeScript) to avoid bootstrap chicken-and-egg with tsup; ESM is fine because package.json has type: module"
  - "parserOptions.project: ./tsconfig.json enables type-aware rules (no-unsafe-*, no-floating-promises) — catches things strict tsc alone doesn't flag at lint time"
  - "tsconfigRootDir: import.meta.dirname is the ESM-safe equivalent of __dirname"
  - "consistent-type-assertions with objectLiteralTypeAssertions: never blocks { ... } as Type (structural coercion) while still allowing justified expr as Type — matches CLAUDE.md 'no unjustified as' wording"
  - "jsdoc/require-example enforced only on VariableDeclaration/FunctionDeclaration/ClassDeclaration exports (not on interface/type aliases, which don't have runtime behavior worth exemplifying)"
  - ".planning/ is in .prettierignore because embedded code fences in plans/roadmap contain intentionally wide TS snippets Prettier would re-wrap inconsistently between runs"
  - "Vitest coverage thresholds are declared NOW so the config shape is stable; Phase 7 is the enforcement gate (pnpm test:coverage). pnpm test (no --coverage) does not trip thresholds."
  - "coverage.exclude covers src/**/index.ts (re-export barrels have no logic), .d.ts, and __fixtures__ — avoids artificially depressing coverage on non-logic files"
  - "test/sanity.test.ts uses ../src/index.js (NodeNext explicit extension) because tsconfig.json has module: NodeNext — the .js resolves to .ts at compile time, this is the standard NodeNext pattern"
  - "Two separate it(...) blocks in sanity.test.ts instead of one with two expect() calls so `pnpm test` reports ≥ 2 passing tests with margin (satisfies must_have with some daylight)"

patterns-established:
  - "CLAUDE.md guardrail-to-lint-rule mapping (see 'Guardrail Linking Map' below) — future plans adding lint rules should extend this table rather than silently disable existing rules"
  - "Single-file test co-location allowed (src/**/*.test.ts) and separated-layout also allowed (test/**/*.test.ts) — downstream phases pick whichever serves the code best"
  - "No .eslintrc.* file at repo root — flat config is the only config; legacy config would be silently ignored and cause confusion"

requirements-completed: []
requirements-staged: [SETUP-04, SETUP-06]

# Metrics
duration: 2min
completed: 2026-04-18
---

# Phase 1 Plan 03: Lint & Test Configuration Summary

**ESLint flat config + Prettier + Vitest config plus a sanity test — CLAUDE.md guardrails (no any, no unjustified as, JSDoc+@example on public exports, no console, type-aware lints) are now enforced at the lint layer, and the test runner is wired with per-directory coverage thresholds matching the ≥ 90% parser/model/helpers guardrail.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-18T19:04:30Z
- **Completed:** 2026-04-18T19:06:09Z
- **Tasks:** 4
- **Files created:** 6
- **Files modified:** 0

## Accomplishments

- ESLint flat config at repo root enforcing CLAUDE.md guardrails as hard lint errors — not just typecheck warnings.
- Type-aware rules (no-unsafe-*, no-floating-promises, await-thenable) enabled via `parserOptions.project: "./tsconfig.json"`.
- `eslint-config-prettier` placed LAST in the flat config array so Prettier-compat rules win, eliminating any chance of ESLint and Prettier fighting over formatting.
- Prettier config (`printWidth:100`, `tabWidth:2`, `semi:true`, `singleQuote:false`, `trailingComma:all`, `endOfLine:lf`) aligned exactly with `.editorconfig`.
- `.prettierignore` guards against lockfile corruption and planning-doc reflow churn.
- Vitest configured with node environment, `globals:false`, v8 coverage provider, and per-directory thresholds (`src/parser/**`, `src/model/**`, `src/helpers/**`) — Phase 7 can flip on enforcement without re-architecting.
- `test/sanity.test.ts` provides 2 passing assertions proving Vitest + TypeScript + NodeNext resolution work end-to-end.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create eslint.config.js (flat config) and .eslintignore** — `83d27b8` (feat)
2. **Task 2: Create .prettierrc.json and .prettierignore** — `f5f1c80` (feat)
3. **Task 3: Create vitest.config.ts** — `6bef5c4` (feat)
4. **Task 4: Create test/sanity.test.ts** — `ae9ef6f` (test)

## Files Created/Modified

- `eslint.config.js` — ESLint flat config. 4-section array: (1) global ignores (dist, coverage, node_modules, *.config.js); (2) base rules for `src/**/*.ts`, `test/**/*.ts`, `*.config.ts` with @typescript-eslint + jsdoc plugins and type-aware parserOptions; (3) test-file JSDoc relaxation; (4) `prettierConfig` last. Total: ~23 rules enabled as errors.
- `.eslintignore` — Legacy-style ignore list for editor integrations that may not read flat-config `ignores` key: `dist/`, `coverage/`, `node_modules/`, `pnpm-lock.yaml`, `*.config.js`.
- `.prettierrc.json` — Concrete options matching `.editorconfig`; overrides for markdown (preserve prose wrap) and JSON/YAML (2-space tabs).
- `.prettierignore` — Excludes `dist/`, `coverage/`, `node_modules/`, lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`), `.planning/`, `.git/`.
- `vitest.config.ts` — `defineConfig({test:{globals:false, environment:"node", include:["test/**/*.test.ts","src/**/*.test.ts"], testTimeout:10_000, coverage:{provider:"v8", reportsDirectory:"./coverage", include:["src/**/*.ts"], exclude:[index/d.ts/__fixtures__], thresholds:{lines:90, branches:85, functions:90, statements:90, with per-dir entries for parser/model/helpers}}}})`.
- `test/sanity.test.ts` — Two `it()` blocks: first asserts `typeof VERSION === "string"` and `VERSION.length > 0`; second asserts VERSION matches a semver-shape regex. Imports `VERSION` from `../src/index.js` (NodeNext explicit extension).

## Guardrail Linking Map

How each CLAUDE.md guardrail is enforced by the new ESLint config:

| CLAUDE.md guardrail | ESLint rule(s) | Severity |
|---|---|---|
| No `any` | `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-*` (6 rules) | error |
| No unjustified `as` casts; use `unknown` and narrow | `@typescript-eslint/consistent-type-assertions` (`objectLiteralTypeAssertions: "never"`), `@typescript-eslint/no-non-null-assertion` | error |
| JSDoc (with `@example`) on every public export | `jsdoc/require-jsdoc` (publicOnly) + `jsdoc/require-example` on exported Variable/Function/Class declarations | error |
| No `console.*` in library code | `no-console` | error |
| Short, testable functions; no dead code | `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`, `@typescript-eslint/switch-exhaustiveness-check` | error |
| Strict imports (types vs values) | `@typescript-eslint/consistent-type-imports` (`fixStyle: "inline-type-imports"`) | error |
| General safety | `eqeqeq:always`, `no-var`, `prefer-const` | error |

## Must-Haves Satisfied

- [x] `pnpm lint` will enforce no-any, no-unused-vars, JSDoc-on-exports, and prettier-compat (rules defined; Plan 04 runs the pipeline).
- [x] A developer editing a `.ts` file with `const x: any = 1` will get a lint error via `@typescript-eslint/no-explicit-any`.
- [x] `pnpm test` will discover `test/sanity.test.ts` via the `test/**/*.test.ts` glob and execute two passing assertions (Plan 04 runs the pipeline).
- [x] Prettier and ESLint do not contradict each other: `eslint-config-prettier` is the LAST element in the flat config default-export array (visually verified).
- [x] Vitest can resolve `src/index.ts`: sanity.test.ts imports `VERSION` from `../src/index.js` (NodeNext resolution → `.ts` source at compile time).

## Decisions Made

- **Flat config over legacy .eslintrc.***: ESLint 8.57 supports flat config natively; flat is the forward path, legacy would be silently ignored (or worse, both get applied in the wrong order) if someone adds `.eslintrc.*` later. Zero `.eslintrc.*` files exist at repo root — verified.
- **parserOptions.project enabled**: trades a small startup cost (ESLint must load tsconfig) for catching a whole category of bugs (`no-unsafe-*`, `no-floating-promises`) that the non-type-aware path would miss. Worth it for a library where every rule should fire at author time.
- **JSDoc relaxation scoped to test files only**: tests still get no-any, no-console, no-unsafe-*, etc. Only `require-jsdoc` and `require-example` are off — tests aren't part of the public API surface.
- **.planning/ excluded from Prettier**: Plans contain TypeScript code fences with deliberately wide lines for readability; Prettier's reflow behavior on markdown code blocks is non-idempotent in edge cases and would cause churn commits.
- **Two separate it() blocks in sanity.test.ts**: splits the "is a string" check from the "looks like semver" check so each assertion is independently reported, and gives the Must-Have ("at least two passing assertions") margin.

## Deviations from Plan

None — plan executed exactly as written. All four tasks completed with the exact file contents specified in the plan.

## Issues Encountered

None. pnpm was intentionally not installed (per plan constraints — Plan 04 is the first run). All configs were verified by static grep/JSON-parse checks.

## Threat Model Mitigation Status

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-01-03-01 (ESLint auto-fix rewriting source) | mitigated | `scripts.lint` runs ESLint without `--fix`; `scripts.lint:fix` is a separate explicit script (from Plan 01). This plan added no auto-fix invocation to any default flow. |
| T-01-03-02 (Prettier reformatting lockfiles) | mitigated | `.prettierignore` explicitly lists `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`. |
| T-01-03-03 (Coverage reports leaking into repo) | mitigated | `vitest.config.ts` writes coverage to `./coverage`, which is in `.gitignore` (Plan 01) and `.prettierignore` (this plan). |
| T-01-03-04 (Runaway test timeouts) | mitigated | `testTimeout: 10_000` and `hookTimeout: 10_000` in `vitest.config.ts`. |
| T-01-03-05 (Stale ESLint cache) | accepted | No `--cache` flag used; ESLint runs fresh every time. No mitigation needed. |

## Threat Flags

None — no new security-relevant surface introduced. Lint and test tooling operate purely on local source files; no network, auth, or filesystem-outside-repo access.

## Handoff Notes for Plan 04

**Plan 04 (smoke-verification)** is the gate that actually runs `pnpm lint`, `pnpm test`, and `pnpm format:check` for the first time. Expectations:

- `pnpm install` will succeed (all devDeps declared in Plan 01 are compatible).
- `pnpm lint` should exit 0 with zero warnings on the current source tree (`src/index.ts` + `test/sanity.test.ts`).
  - `src/index.ts` has a JSDoc block with `@example` on `VERSION` — satisfies `jsdoc/require-example`.
  - `src/index.ts` exports only a `VariableDeclaration` with a string literal — no `any`, no console, no unsafe ops.
  - `test/sanity.test.ts` imports explicitly from `"vitest"` (no globals) and has no `any` / no `console.*`.
- `pnpm test` should discover `test/sanity.test.ts`, execute 2 assertions, and exit 0.
- `pnpm format:check` should report clean formatting on all committed files. If Prettier flags `src/index.ts`, `test/sanity.test.ts`, or any config file on first run, run `pnpm format` once and commit the normalized result — do NOT silence Prettier.

**If any lint rule fires on Plan 04's first run:** diagnose root cause — either the source needs a fix (preferred) or the rule was miscalibrated. Do NOT disable rules without a documented architectural decision (Rule 4 checkpoint).

**Known non-obvious choices Plan 04 must respect:**
- `parserOptions.project: "./tsconfig.json"` means ESLint needs `tsconfig.json` readable at the repo root when it runs — already is (Plan 01). If Plan 04 runs lint from a subdirectory, it must use `--resolve-plugins-relative-to` or run from the repo root.
- `test/sanity.test.ts` imports from `"../src/index.js"` (not `.ts`). This is correct for NodeNext. If Plan 04 adds any additional test file, it must follow the same `.js` convention.
- Vitest's default `pnpm test` runs WITHOUT coverage. `pnpm test:coverage` triggers coverage + thresholds. Phase 7 is the enforcement gate; Plan 04 only needs to prove `pnpm test` exits 0.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 2 is now complete (Plan 02 and Plan 03 both done). Plan 04 (smoke-verification) is unblocked.
- REQ-IDs SETUP-04 (JSDoc+`@example` enforcement via lint) and SETUP-06 (lint rules defined) are **staged** — final validation is Plan 04's pipeline run.

## Self-Check: PASSED

Verified:
- `eslint.config.js` exists — FOUND
- `.eslintignore` exists — FOUND
- `.prettierrc.json` exists — FOUND
- `.prettierignore` exists — FOUND
- `vitest.config.ts` exists — FOUND
- `test/sanity.test.ts` exists — FOUND
- No `.eslintrc.*` file at repo root — confirmed absent
- Commit `83d27b8` (Task 1) — FOUND in git log
- Commit `f5f1c80` (Task 2) — FOUND in git log
- Commit `6bef5c4` (Task 3) — FOUND in git log
- Commit `ae9ef6f` (Task 4) — FOUND in git log

---
*Phase: 01-project-foundation*
*Completed: 2026-04-18*
