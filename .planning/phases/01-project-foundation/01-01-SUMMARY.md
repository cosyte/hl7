---
phase: 01-project-foundation
plan: 01
subsystem: infra
tags: [typescript, package-json, tsconfig, pnpm, mit-license, scaffold]

# Dependency graph
requires: []
provides:
  - package.json with zero runtime deps, dual ESM+CJS exports, complete devDependencies
  - Strict tsconfig.json + tsconfig.build.json (target ES2022, module NodeNext)
  - MIT LICENSE with 2026 Cosyte copyright
  - .gitignore, .npmrc (engine-strict), .editorconfig, README skeleton
  - src/index.ts stub exporting VERSION with JSDoc @example
affects: [01-02-build-system, 01-03-lint-and-test, 01-04-smoke-verification, all-downstream-phases]

# Tech tracking
tech-stack:
  added:
    - typescript@^5.3.0
    - tsup@^8.0.0
    - vitest@^1.2.0
    - @vitest/coverage-v8@^1.2.0
    - eslint@^8.57.0
    - "@typescript-eslint/parser@^7.0.0"
    - "@typescript-eslint/eslint-plugin@^7.0.0"
    - eslint-config-prettier@^9.1.0
    - eslint-plugin-jsdoc@^48.0.0
    - prettier@^3.2.0
    - "@types/node@^20.11.0"
  patterns:
    - "Strict TypeScript: strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + useUnknownInCatchVariables"
    - "Dual-build exports map: types/import/require entries point to ./dist/*.{d.ts,mjs,cjs}"
    - "Zero runtime dependencies (explicit empty dependencies block)"
    - "Publish allowlist via files: ['dist','README.md','LICENSE','CHANGELOG.md'] (T-01-02 mitigation)"
    - "packageManager field pins pnpm@9.0.0 for reproducibility"

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsconfig.build.json
    - LICENSE
    - .gitignore
    - .npmrc
    - .editorconfig
    - README.md
    - src/index.ts
  modified: []

key-decisions:
  - "Zero runtime dependencies enforced via explicit empty dependencies:{} block"
  - "Dual ESM+CJS emitted by tsup (tsconfig.build.json emits declarations only)"
  - "Strict TypeScript beyond strict:true — adds exactOptionalPropertyTypes, useUnknownInCatchVariables, noPropertyAccessFromIndexSignature"
  - "packageManager: pnpm@9.0.0 pinned for reproducibility"
  - "publishConfig.provenance:true enables npm provenance attestation when publishing via CI"

patterns-established:
  - "Config files at repo root; no package.json edits from downstream plans (eliminates merge conflicts across Wave 2 parallel plans)"
  - "Every public export carries a JSDoc block with @example — seeded by VERSION stub (SETUP-04 groundwork)"
  - "engine-strict=true in .npmrc enforces Node 18+ at install time, matching engines.node in package.json"

requirements-completed: [SETUP-03, SETUP-04, SETUP-05]

# Metrics
duration: 2min
completed: 2026-04-18
---

# Phase 1 Plan 01: Package Scaffold Summary

**Zero-runtime-dep TypeScript package with dual ESM+CJS exports, strict tsconfig (ES2022, noUncheckedIndexedAccess), MIT license, and pnpm@9 pinning**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-18T18:56:40Z
- **Completed:** 2026-04-18T18:58:22Z
- **Tasks:** 3
- **Files created:** 9

## Accomplishments

- package.json with zero runtime deps, dual-build exports map, complete devDependencies frozen for Wave 2
- Strict TypeScript config (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + 5 more safety flags)
- MIT license with 2026 Cosyte copyright
- Repo hygiene files (.gitignore, .npmrc, .editorconfig, README skeleton) in place
- src/index.ts stub exporting `VERSION` with JSDoc `@example` — seeds SETUP-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Create package.json with complete metadata, scripts, and devDependencies** — `54d82c7` (feat)
2. **Task 2: Create strict tsconfig.json and tsconfig.build.json** — `7451c08` (feat)
3. **Task 3: Create LICENSE, .gitignore, .npmrc, .editorconfig, README skeleton, and src/index.ts stub** — `260156e` (feat)

## Files Created/Modified

- `package.json` — Package metadata, scripts (build/typecheck/lint/format/test/clean/prepublishOnly), dual ESM+CJS exports map, zero runtime deps, complete devDependencies list, publishConfig with provenance, files allowlist
- `tsconfig.json` — Strict TypeScript: target ES2022, module NodeNext, strict+noUncheckedIndexedAccess+exactOptionalPropertyTypes+useUnknownInCatchVariables+noImplicitOverride+noPropertyAccessFromIndexSignature+noFallthroughCasesInSwitch+noImplicitReturns, declaration+declarationMap+sourceMap, noEmit (tsup handles emit)
- `tsconfig.build.json` — Extends base, narrows include to src/, emitDeclarationOnly (for IDE/consumer reference)
- `LICENSE` — MIT license, 2026 Cosyte copyright
- `.gitignore` — Excludes node_modules, dist, coverage, .env*, editor dirs, logs, OS artifacts (T-01-03 + T-01-04 mitigations)
- `.npmrc` — engine-strict=true, save-exact=false, auto-install-peers=true, strict-peer-dependencies=false
- `.editorconfig` — 2-space indent, LF line endings, UTF-8, insert_final_newline, trim trailing whitespace (md files exempted)
- `README.md` — Skeleton with tagline, install, dev commands, license (full README comes in Phase 8)
- `src/index.ts` — Exports `VERSION: string = "0.0.0"` with file-level + export-level JSDoc including `@example` (SETUP-04 evidence)

## Decisions Made

- Kept Phase 8's full README scope intact — only shipped a skeleton README now so npm's package preview isn't broken pre-publish.
- Included explicit empty `dependencies: {}` block in package.json to make zero-runtime-deps posture verifiable (rather than relying on the field's absence being interpreted as empty).
- `tsconfig.json` has `noEmit: true` because tsup handles JS emit and Plan 02 will add the build pipeline. `tsconfig.build.json` exists for IDE/consumer tools that need a build-shaped reference with `emitDeclarationOnly: true`.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Handoff Notes for Wave 2

**Plan 02 (build-system)** creates `tsup.config.ts`. It must NOT modify `package.json`:
- `tsup` is already in devDependencies (^8.0.0)
- `scripts.build` = `tsup` is already wired
- `scripts.clean` = `rm -rf dist coverage` already handles cleanup
- Exports map (`./dist/index.mjs`, `./dist/index.cjs`, `./dist/index.d.ts`) is already shaped for dual-build output — tsup config must emit matching file names

**Plan 03 (lint-and-test)** creates `eslint.config.js` (flat), `.prettierrc` / `prettier.config.js`, and `vitest.config.ts`. It must NOT modify `package.json`:
- All linting/testing devDeps are already present: eslint, @typescript-eslint/parser + eslint-plugin, eslint-config-prettier, eslint-plugin-jsdoc, prettier, vitest, @vitest/coverage-v8
- `scripts.lint`, `scripts.lint:fix`, `scripts.format`, `scripts.format:check`, `scripts.test`, `scripts.test:watch`, `scripts.test:coverage` are already wired
- ESLint glob targets `src/**/*.ts` and `test/**/*.ts`; Plan 03's config must cover both

**Plan 04 (smoke-verification)** runs the full pipeline. Expect it to:
- Generate `pnpm-lock.yaml` (T-01-01 mitigation; commit it)
- Run `pnpm install --frozen-lockfile` as a smoke step
- Verify no `.env` is tracked (T-01-03 mitigation check)

**Known non-obvious choices downstream must respect:**
- `exactOptionalPropertyTypes: true` means `{ x?: T }` is NOT the same as `{ x: T | undefined }`. Code authored in later phases must be careful with optional properties.
- `useUnknownInCatchVariables: true` means all `catch (e)` clauses start with `e: unknown` and must narrow before use. This aligns with CLAUDE.md's "no `any`, use `unknown` and narrow".
- `noPropertyAccessFromIndexSignature: true` means `obj.foo` is disallowed when `foo` is only in an index signature; use `obj["foo"]`. Relevant when working with loose record types (e.g., warning registries, profile configs).
- `isolatedModules: true` is required by tsup (it transpiles per-file). Any const enum or type-only re-export must be written accordingly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 2 (Plans 02, 03) can run in parallel — both touch disjoint config files and neither modifies `package.json`.
- Plan 04 (smoke-verification) waits on both Wave 2 plans.
- All 3 targeted REQ-IDs (SETUP-03, SETUP-04 seed, SETUP-05) satisfied or staged.

## Self-Check: PASSED

Verified:
- `package.json` exists — FOUND
- `tsconfig.json` exists — FOUND
- `tsconfig.build.json` exists — FOUND
- `LICENSE` exists — FOUND
- `.gitignore` exists — FOUND
- `.npmrc` exists — FOUND
- `.editorconfig` exists — FOUND
- `README.md` exists — FOUND
- `src/index.ts` exists — FOUND
- Commit `54d82c7` — FOUND in git log
- Commit `7451c08` — FOUND in git log
- Commit `260156e` — FOUND in git log

---
*Phase: 01-project-foundation*
*Completed: 2026-04-18*
