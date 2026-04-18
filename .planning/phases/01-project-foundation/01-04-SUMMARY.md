---
phase: 01-project-foundation
plan: 04
subsystem: verification
tags: [smoke-test, ci, github-actions, lockfile, pipeline]

# Dependency graph
requires:
  - 01-01-package-scaffold (package.json scripts, devDependencies, tsconfig shape)
  - 01-02-build-system (tsup.config.ts)
  - 01-03-lint-and-test (eslint.config.js, prettier config, vitest config, sanity test)
provides:
  - pnpm-lock.yaml (reproducible install pin)
  - .github/workflows/ci.yml (push/PR gate on Node 18/20/22)
  - First end-to-end proof that install/typecheck/lint/format/test/build all exit 0
affects: [all-downstream-phases, phase-2-core-parser]

# Tech tracking
tech-stack:
  added:
    - pnpm-lock.yaml (lockfile; 260 packages resolved)
  patterns:
    - "CI uses the same `pnpm <script>` commands a developer runs locally — the only divergence is `pnpm install --frozen-lockfile` (CI enforces lockfile consistency)"
    - "Node matrix 18/20/22 makes the `engines.node >=18` field honest — any future Node-version-specific regression surfaces before merge"
    - "least-privilege GITHUB_TOKEN: workflow-level `permissions: contents: read` so no job can accidentally gain write scope; Phase 8 publish workflow will grant id-token: write explicitly in its own file"
    - "concurrency + cancel-in-progress: true — rapid pushes to the same branch cancel the older run instead of queueing"
    - "Dual-module smoke re-run as final CI step — SETUP-02 cannot regress silently; any PR that breaks `import { VERSION }` via either conditional export fails CI"
    - "tsup emits dist/index.d.cts alongside dist/index.d.ts — bonus artifact for explicit CJS .d.cts resolution, not contradicting the package.json exports map"

key-files:
  created:
    - pnpm-lock.yaml
    - .github/workflows/ci.yml
  modified:
    - tsconfig.json (removed `rootDir: ./src` — Rule 1 fix)
    - src/index.ts (rewrote file-level JSDoc — Rule 1 fix)
    - CLAUDE.md (prettier normalization — style pass)
    - package.json (prettier normalization — style pass)

key-decisions:
  - "Removed `rootDir: ./src` from base tsconfig.json: it made `tsc --noEmit` refuse to load test/**/*.ts and *.config.ts which are both in the base config's `include` set. Emit-time rootDir is handled implicitly by tsup's entry scoping (`entry: ['src/index.ts']`) and by tsconfig.build.json's narrower `include`."
  - "Rewrote src/index.ts's file-level JSDoc first line from `@cosyte/hl7-parser — public entry point` to `Public entry point for the \\`@cosyte/hl7-parser\\` package`: eslint-plugin-jsdoc parses any `@`-prefixed token at a JSDoc block's line start as a tag name, and rejects `@cosyte/hl7-parser` as an unknown tag. Putting the package name in backticks mid-sentence preserves documentation intent while being lint-legal."
  - "Prettier normalization of CLAUDE.md (list-after-paragraph blank lines) and package.json (keywords expansion) committed SEPARATELY from Plan 04 deliverables (style commit vs feat/fix commits) per plan execution notes — keeps the audit trail for 'what Plan 04 actually shipped' vs 'what Plan 04 had to normalize'."
  - "CI matrix Node 18/20/22 chosen to bracket the LTS range rather than pinning a single version: 18 is the engines minimum, 20 is the current LTS, 22 is the newest LTS. Dropping 18 would happen when engines.node changes; until then, 18 failures are real failures."
  - "`pnpm/action-setup@v4` with `version: 9` matches `packageManager: pnpm@9.0.0` in package.json exactly. Keeping them in sync is a manual discipline; a future phase could add a pre-commit check."

patterns-established:
  - "All Phase 1 commits for a given plan carry the `({phase}-{plan})` scope: `feat(01-04)`, `fix(01-04)`, `style(01-04)`, `docs(01-04)`. Separate scopes for separate concerns (deliverable vs drive-by fix vs normalization) preserves blame clarity."
  - "Integration bugs discovered by the final smoke plan are Rule 1 auto-fixes committed in a `fix(01-{final-plan})` commit BEFORE the feature/deliverable commit — the deliverable commit represents a green pipeline, not a half-green one."
  - "CI workflow lives at .github/workflows/ci.yml and runs the Phase 1 success chain verbatim. Any new script wired into CI in a later phase (e.g., `pnpm test:coverage` in Phase 7) adds a step, it does not replace this one."

requirements-completed: [SETUP-01, SETUP-02, SETUP-04, SETUP-06]
requirements-carry: []

# Metrics
duration: 4min
completed: 2026-04-18
---

# Phase 1 Plan 04: Smoke Verification Summary

**End-to-end pipeline runs green on a clean clone: `pnpm install / typecheck / lint / format:check / test / build` all exit 0 with zero warnings, both ESM and CJS consumers resolve `VERSION` via the exports map, `pnpm-lock.yaml` is committed, and GitHub Actions CI re-runs the full chain on Node 18/20/22 for every push and PR to main.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-18T19:09:26Z
- **Completed:** 2026-04-18T19:13:11Z
- **Tasks:** 2
- **Files created:** 2 (pnpm-lock.yaml, .github/workflows/ci.yml)
- **Files modified:** 4 (tsconfig.json, src/index.ts, CLAUDE.md, package.json)
- **Commits:** 4 (1 fix + 1 style + 2 feat)

## Pipeline Run Evidence

### Step 1: `pnpm install`

```
Packages: +260
devDependencies:
+ @types/node 20.19.39
+ @typescript-eslint/eslint-plugin 7.18.0
+ @typescript-eslint/parser 7.18.0
+ @vitest/coverage-v8 1.6.1
+ eslint 8.57.1
+ eslint-config-prettier 9.1.2
+ eslint-plugin-jsdoc 48.11.0
+ prettier 3.8.3
+ tsup 8.5.1
+ typescript 5.9.3
+ vitest 1.6.1
Done in 10.3s
```

- `pnpm-lock.yaml` generated at repo root (2,932 lines), committed in `4d45b5c`.
- Deprecation warnings for `eslint@8.57.1` and 5 transitive subdeps (`glob@7`, `inflight@1`, `rimraf@3`, `@humanwhocodes/*@2.x`) noted — all inherited from `eslint@8.57.x`. Upgrading ESLint to 9.x is a Phase 7+ architectural decision (Rule 4 territory), not a Plan 04 concern.
- `pnpm install --frozen-lockfile` re-run after commit: "Lockfile is up to date, resolution step is skipped / Already up to date / Done in 1.2s" — proves the committed lockfile matches package.json.

### Step 2: `pnpm typecheck`

First run **FAILED** with 3 `TS6059` errors (files outside `rootDir`):

```
error TS6059: File '.../test/sanity.test.ts' is not under 'rootDir' '.../src'
error TS6059: File '.../tsup.config.ts'        is not under 'rootDir' '.../src'
error TS6059: File '.../vitest.config.ts'      is not under 'rootDir' '.../src'
```

After Rule 1 fix (remove `rootDir: ./src` from base tsconfig.json — commit `8403738`), re-run exit 0 with empty stdout:

```
> @cosyte/hl7-parser@0.0.0 typecheck
> tsc --noEmit
```

### Step 3: `pnpm lint`

First run **FAILED** with 1 error:

```
src/index.ts
  2:1  error  Invalid JSDoc tag name "cosyte/hl7-parser"  jsdoc/check-tag-names
```

After Rule 1 fix (rewrite src/index.ts file-level JSDoc — commit `8403738`), re-run exit 0:

```
> @cosyte/hl7-parser@0.0.0 lint
> eslint "src/**/*.ts" "test/**/*.ts" --max-warnings=0
```

Zero warnings (`--max-warnings=0` honored).

### Step 4: `pnpm format:check`

First run **FAILED** with 2 pre-existing drift issues:

```
[warn] CLAUDE.md
[warn] package.json
[warn] Code style issues found in 2 files.
```

`pnpm format` applied (commit `e77305c` — `style(01-04)`). Re-run:

```
Checking formatting...
All matched files use Prettier code style!
```

### Step 5: `pnpm test`

```
 ✓ test/sanity.test.ts  (2 tests) 5ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  777ms
```

2 / 2 passing — satisfies Plan 03's Must-Have ("at least 2 passing assertions").

### Step 6: `pnpm build`

```
CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI Using tsup config: /home/nschatz/projects/cosyte/hl7-parser/tsup.config.ts
CLI Cleaning output folder
CJS dist/index.cjs     151.00 B
CJS dist/index.cjs.map 857.00 B
CJS ⚡️ Build success in 124ms
ESM dist/index.mjs     129.00 B
ESM dist/index.mjs.map 855.00 B
ESM ⚡️ Build success in 125ms
DTS ⚡️ Build success in 1404ms
DTS dist/index.d.ts  710.00 B
DTS dist/index.d.cts 710.00 B
```

### dist/ tree after `pnpm build`

```
dist/
├── index.cjs      (151 B)
├── index.cjs.map  (857 B)
├── index.d.cts    (710 B)
├── index.d.ts     (710 B)
├── index.mjs      (129 B)
└── index.mjs.map  (855 B)
```

All three load-bearing artifacts present (`index.mjs`, `index.cjs`, `index.d.ts`). The extra `index.d.cts` (710 B) is an auxiliary CJS declaration file tsup emits for consumers explicitly using `require()`-style CJS typings; it does not conflict with the `exports` map (which advertises `types: "./dist/index.d.ts"`).

### Step 7: Dual-module smoke test

Written to a temp dir, not persisted:

```
ESM OK: 0.0.0
CJS OK: 0.0.0
```

Confirmed also via the one-liner in the plan's `<verify><automated>` block:

```
$ node -e "import('.../dist/index.mjs').then(m => ...)"
ESM: 0.0.0
$ node -e "const m = require('.../dist/index.cjs'); ..."
CJS: 0.0.0
SMOKE OK
```

**SETUP-02 directly verified.** Both conditional exports resolve, both expose `VERSION` as a `string`, and the type declaration file declares it correctly:

```ts
// dist/index.d.ts
declare const VERSION: string;
export { VERSION };
```

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| — | Rule 1 auto-fix: tsconfig rootDir + src/index.ts JSDoc tag | `8403738` | `fix(01-04)` |
| — | Style pass: prettier auto-fixes to CLAUDE.md and package.json | `e77305c` | `style(01-04)` |
| 1 | Run full pipeline and commit pnpm-lock.yaml | `4d45b5c` | `feat(01-04)` |
| 2 | Create .github/workflows/ci.yml | `e317b23` | `feat(01-04)` |

## CI Workflow Summary

`.github/workflows/ci.yml` — 64 lines, 9 steps, 3-way Node matrix.

| Property | Value |
|----------|-------|
| Triggers | `push` + `pull_request` to `main` |
| Concurrency | `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` |
| Permissions | `contents: read` (least-privilege) |
| Node matrix | `["18", "20", "22"]` with `fail-fast: false` |
| Actions pinned | `actions/checkout@v4`, `pnpm/action-setup@v4` (v9), `actions/setup-node@v4` (cache: pnpm) |
| Steps | checkout → setup-pnpm → setup-node (cache: pnpm) → install `--frozen-lockfile` → typecheck → lint → format:check → test → build → verify dual-module artifacts |
| Final smoke | runs `node -e "import(...mjs)"` and `node -e "require(...cjs)"` asserting `typeof VERSION === 'string'` |

**Threat register coverage (from plan's `<threat_model>`):**
- T-01-04-01 (unpinned devDep drift): **mitigated** — `--frozen-lockfile` on install; lockfile committed.
- T-01-04-02 (EoP via GITHUB_TOKEN): **mitigated** — `permissions: contents: read`.
- T-01-04-03 (runaway duplicate CI runs): **mitigated** — `concurrency` + `cancel-in-progress: true`.
- T-01-04-04 (third-party action drift): **mitigated** — all actions pinned to `@v4` major tag; commit-SHA pinning deferred to Phase 8 if/when publish workflow lands.
- T-01-04-05 (CI log info disclosure): **accepted** — library has no secrets; public-repo CI logs are public by design.

## REQ-ID Status After Plan 04

| REQ-ID | Description | Status After Plan 04 | Evidence |
|--------|-------------|----------------------|----------|
| SETUP-01 | Package runs on Node 18+ | **VERIFIED** | `engines.node: ">=18.0.0"` in package.json; CI matrix tests 18/20/22 |
| SETUP-02 | Dual ESM + CJS via exports map | **VERIFIED** | `dist/index.{mjs,cjs,d.ts}` all emitted; both imports return `VERSION` as a string |
| SETUP-03 | MIT licensed, published to npm-compatible registry | **VERIFIED** (Plan 01) | LICENSE file present; publishConfig.access: public |
| SETUP-04 | Every public export has JSDoc with `@example` | **VERIFIED** | `VERSION` ships with `@example`; eslint `jsdoc/require-example` enforces it; emitted `.d.ts` preserves both JSDoc blocks |
| SETUP-05 | Zero runtime dependencies | **VERIFIED** (Plan 01) | `"dependencies": {}` block explicit; `skipNodeModulesBundle: true` in tsup; lockfile confirms devDeps only |
| SETUP-06 | Strict TS + lint enforcement | **VERIFIED** | `tsc --noEmit` + ESLint both exit 0 with zero warnings; all CLAUDE.md guardrails fire as lint errors |

**All six Phase 1 SETUP REQ-IDs are now fully verified** — not staged, not seeded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `rootDir: ./src` from tsconfig.json**
- **Found during:** Task 1, Step 3 (`pnpm typecheck`)
- **Issue:** Base tsconfig.json set `rootDir: ./src` but its `include` set is `["src/**/*.ts", "test/**/*.ts", "*.config.ts"]`. `tsc --noEmit` refused to load any file outside `rootDir` with 3 × `TS6059` errors (`test/sanity.test.ts`, `tsup.config.ts`, `vitest.config.ts`).
- **Fix:** Removed `rootDir: ./src` from base tsconfig.json. The base config is a typecheck-only shape (`noEmit: true`); `rootDir` is meaningful only for emit, and emit is handled by tsup (scoped to `entry: ["src/index.ts"]`) plus tsconfig.build.json (scoped to `include: ["src/**/*.ts"]`).
- **Files modified:** tsconfig.json
- **Commit:** `8403738`
- **Why not a Rule 4 architectural change:** removing an emit-scoped setting from a no-emit config is a straightforward correctness fix — the emit path is unchanged.

**2. [Rule 1 - Bug] Rewrote src/index.ts file-level JSDoc to avoid invalid tag**
- **Found during:** Task 1, Step 4 (`pnpm lint`)
- **Issue:** `src/index.ts` started with `/** @cosyte/hl7-parser — public entry point. ...`. `eslint-plugin-jsdoc`'s `check-tag-names` rule parses `@cosyte/hl7-parser` as a tag name and rejects it (not in the valid JSDoc tag set).
- **Fix:** Rewrote the first sentence to `Public entry point for the \`@cosyte/hl7-parser\` package.` — the package name is now in backticks mid-sentence, eliminating the leading `@tag` ambiguity.
- **Files modified:** src/index.ts
- **Commit:** `8403738`
- **Why not a Rule 4 architectural change:** preserves the documentation intent (first line describes the module), just in lint-legal form.

### Style Pass

**3. [Style normalization] Applied `pnpm format` to CLAUDE.md and package.json**
- **Found during:** Task 1, Step 5 (`pnpm format:check`)
- **Issue:** Both files had pre-existing drift from the Prettier config declared in Plan 03. CLAUDE.md was missing blank lines before bulleted/numbered lists; package.json had `keywords` as a single line that exceeded `printWidth: 100`.
- **Fix:** Ran `pnpm format` once; Prettier fixed both files.
- **Files modified:** CLAUDE.md, package.json
- **Commit:** `e77305c` (`style(01-04)`) — separate from Plan 04 deliverables per plan execution notes.

## Issues Encountered

All issues were integration bugs surfaced by this plan (that's the point of a smoke-verification plan) and auto-fixed under Rule 1. No architectural checkpoints were triggered. No authentication gates.

## Threat Model Mitigation Status

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-01-04-01 (Unpinned devDep drift) | mitigated | `pnpm-lock.yaml` committed in `4d45b5c`; CI runs `pnpm install --frozen-lockfile`; re-run post-commit confirmed lockfile consistent with package.json |
| T-01-04-02 (EoP via GitHub Actions permissions) | mitigated | `permissions: contents: read` at workflow level in ci.yml |
| T-01-04-03 (DoS via duplicate CI runs) | mitigated | `concurrency` block with `cancel-in-progress: true` in ci.yml |
| T-01-04-04 (Third-party action drift) | mitigated | All actions pinned to major version tags (`@v4`); revisit in Phase 8 publish workflow for commit-SHA pinning |
| T-01-04-05 (CI log info disclosure) | accepted | No secrets in library code (confirmed across Plans 01-03); public-repo CI logs are public by design |

## Threat Flags

None — no new security-relevant surface beyond the CI workflow itself, which is fully covered by the plan's threat register.

## Handoff Notes for Phase 1 Verifier and Phase 2

**Phase 1 is complete.** Tooling is frozen:

- `package.json` scripts are the CI contract — do not rename without updating `.github/workflows/ci.yml` in the same commit.
- `tsconfig.json` no longer has `rootDir` (see Deviation 1); Phase 2 code in `src/` will still emit correctly via tsup because `tsup.config.ts` scopes the entry list.
- Coverage thresholds in `vitest.config.ts` are declared but not enforced by `pnpm test` (Plan 03's deliberate choice). Phase 7 will enable enforcement via `pnpm test:coverage` and a CI step (or gate the existing test step on coverage).
- Node engines locked at `>=18.0.0`; CI matrix covers 18/20/22.

**Phase 2 (core-parser) should NOT modify:**
- `package.json` (unless adding a runtime dep — which is a Rule 4 architectural decision; zero-runtime-deps is the project posture).
- `tsconfig.json`, `tsconfig.build.json`, `tsup.config.ts`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts` — all of these are "frozen" for the rest of the project unless a Rule 4 checkpoint approves a change.
- `.github/workflows/ci.yml` — extend with new `uses:` steps if needed (e.g., coverage upload), do not restructure.

**Phase 2 (core-parser) CAN add:**
- New files under `src/` (parser modules, types).
- New `*.test.ts` files under `test/` or co-located under `src/`.
- New top-level public exports from `src/index.ts` (every new export must carry a JSDoc block with `@example` — the lint rule will enforce it).

**If Phase 2 hits a blocker in Phase 1 tooling** (e.g., a tsup issue, an ESLint false positive on parser code), diagnose root cause — the defaults are deliberate and a drive-by config change should be a Rule 4 architectural checkpoint, not a silent loosening.

## User Setup Required

None — no external service configuration needed. When the repo is pushed to GitHub for the first time, the CI workflow will activate automatically for pushes and PRs to `main`.

## Next Phase Readiness

- **Phase 1 Success Criteria 1-4:** all directly verified by this plan's pipeline run.
- **SETUP-01, SETUP-02, SETUP-04, SETUP-06:** now **VERIFIED** (SETUP-03 and SETUP-05 were VERIFIED by Plan 01).
- **Phase 1 complete.** Next: `/gsd-verify-work 1` to confirm deliverables match the phase goal, then `/gsd-validate-phase 1` for Nyquist coverage audit, then `/gsd-transition` to Phase 2.

## Self-Check: PASSED

Verified:

**Files created:**
- `pnpm-lock.yaml` — FOUND (2,932 lines)
- `.github/workflows/ci.yml` — FOUND (64 lines)

**Files modified:**
- `tsconfig.json` — `rootDir` removed (verified via git diff)
- `src/index.ts` — JSDoc first line rewritten (verified via git diff)
- `CLAUDE.md` — prettier-normalized (verified via git diff)
- `package.json` — prettier-normalized (verified via git diff)

**Commits:**
- `8403738` (fix) — FOUND in git log
- `e77305c` (style) — FOUND in git log
- `4d45b5c` (feat — lockfile) — FOUND in git log
- `e317b23` (feat — CI) — FOUND in git log

**Pipeline smoke re-run at SUMMARY-creation time:**
- `pnpm install --frozen-lockfile` — exit 0 (Done in 1.2s)
- `pnpm typecheck` — exit 0 (empty stdout)
- `pnpm lint` — exit 0 (zero warnings)
- `pnpm format:check` — exit 0 ("All matched files use Prettier code style!")
- `pnpm test` — exit 0 (2/2 passing)
- `pnpm build` — exit 0 (dist/ regenerated)
- `node -e "import('./dist/index.mjs').then(m => ...)"` — "ESM: 0.0.0"
- `node -e "require('./dist/index.cjs')"` — "CJS: 0.0.0"
- Final sentinel — "SMOKE OK"

**Acceptance criteria from plan:**
- `pnpm install` exits 0, `pnpm-lock.yaml` generated — PASS
- `pnpm typecheck` exits 0, zero stdout/stderr — PASS
- `pnpm lint` exits 0, --max-warnings=0 honored — PASS
- `pnpm format:check` exits 0 — PASS
- `pnpm test` exits 0, 2 passing assertions — PASS
- `pnpm build` exits 0 — PASS
- `dist/index.mjs` exists and non-empty — PASS
- `dist/index.cjs` exists and non-empty — PASS
- `dist/index.d.ts` exists and contains `VERSION` — PASS
- ESM import returns `VERSION` as string `"0.0.0"` — PASS
- CJS require returns `VERSION` as string `"0.0.0"` — PASS
- `pnpm-lock.yaml` NOT in .gitignore — PASS (`grep 'pnpm-lock' .gitignore` returned 0 matches)
- `pnpm install --frozen-lockfile` succeeds — PASS
- `.github/workflows/ci.yml` exists with all required elements (triggers, matrix, pnpm@v4, node@v4 cache:pnpm, --frozen-lockfile, typecheck/lint/format/test/build order, dual-module verify, permissions read, concurrency block) — PASS (all grep checks passed)

---
*Phase: 01-project-foundation*
*Completed: 2026-04-18*
