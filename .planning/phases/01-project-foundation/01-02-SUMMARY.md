---
phase: 01-project-foundation
plan: 02
subsystem: build
tags: [tsup, build, esm, cjs, dts]

# Dependency graph
requires:
  - 01-01-package-scaffold (package.json exports map, src/index.ts stub, tsup devDep)
provides:
  - tsup.config.ts declaring dual ESM+CJS build with .mjs/.cjs extensions and dts
  - Build pipeline ready for Plan 04 smoke verification to invoke `pnpm build`
affects: [01-04-smoke-verification, all-downstream-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tsup dual-format output: esm + cjs with outExtension override to force .mjs/.cjs suffixes matching package.json exports map"
    - "dts:true forwards JSDoc through emitted declarations — seeds SETUP-04 IntelliSense contract for every future public export"
    - "clean:true wipes dist/ before each build (T-01-02-01 mitigation: no stale artifacts)"
    - "skipNodeModulesBundle:true belt-and-suspenders for zero-runtime-deps posture"
    - "platform:node + shims:false — Node 18+ baseline, no polyfill weight"

key-files:
  created:
    - tsup.config.ts
  modified: []

key-decisions:
  - "outExtension function forces .mjs/.cjs suffixes because tsup's defaults (.js/.cjs with type:module) would not match package.json#exports — mismatch would break resolution for ESM consumers"
  - "splitting:false keeps outputs as single files (smaller, easier to audit); library entry point doesn't benefit from code-splitting"
  - "minify:false — libraries should ship readable code, consumers' bundlers handle minification"
  - "Task 2 produced no commit: src/index.ts was already in the exact state Plan 02 requires, so it was a verify-only task (zero drift from Plan 01)"

patterns-established:
  - "Build config colocated at repo root as tsup.config.ts (picked up by `tsup` with no CLI args, matching package.json scripts.build)"
  - "Build artifact filenames are load-bearing: dist/index.{mjs,cjs,d.ts} must match the exports map exactly; enforced by outExtension"

requirements-completed: []
requirements-staged: [SETUP-02, SETUP-04]

# Metrics
duration: 1min
completed: 2026-04-18
---

# Phase 1 Plan 02: Build System (tsup) Summary

**tsup configuration wiring dual ESM+CJS output with type declarations, matching package.json exports map exactly (dist/index.mjs, dist/index.cjs, dist/index.d.ts)**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-18T19:01:28Z
- **Completed:** 2026-04-18T19:02:09Z
- **Tasks:** 2 (1 new-file, 1 verify-only)
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- Created `tsup.config.ts` with dual-format build (esm + cjs), type declarations (dts:true), sourcemaps, tree-shaking, and `clean:true` stale-artifact protection.
- outExtension override ensures build artifacts match the `exports` map declared in Plan 01 (`.mjs` for ESM, `.cjs` for CJS).
- Verified `src/index.ts` is unchanged from Plan 01 and still exposes `VERSION` with a JSDoc `@example` — ready for tsup to consume and for SETUP-04 IntelliSense validation in Plan 04.

## Task Commits

1. **Task 1: Create tsup.config.ts producing dual ESM+CJS with types** — `d703742` (feat)
2. **Task 2: Verify src/index.ts is build-ready** — no commit (verify-only, file already in correct state from Plan 01)

## Files Created/Modified

- `tsup.config.ts` — tsup build config. Entry `src/index.ts`; formats `esm` + `cjs`; outExtension forces `.mjs`/`.cjs`; dts:true; sourcemap:true; clean:true; target es2022; platform node; treeshake:true; splitting:false; minify:false; shims:false; skipNodeModulesBundle:true.

## Decisions Made

- **outExtension override is load-bearing:** tsup's default with `"type": "module"` in package.json produces `.js` (ESM) + `.cjs` (CJS). Our exports map advertises `.mjs` + `.cjs`, so the override renames the ESM output to `.mjs`. Without it, ESM consumers resolving via `exports['.'].import` would 404.
- **skipNodeModulesBundle:true kept despite zero runtime deps:** belt-and-suspenders — if a future plan accidentally adds a runtime dep, tsup won't silently bundle it into `dist/`. Any such addition should be an explicit architectural decision (Rule 4).
- **sourcemap:true shipped:** sourcemaps are small, consumers can opt in via their bundler, and they help downstream debugging. Library contains no secrets (Plan 01 threat model confirms).
- **No Task 2 commit:** Plan 02's Task 2 was a conditional restore — only modify `src/index.ts` if Plan 01 drifted. It didn't. Documenting this as a zero-change task rather than an empty commit keeps the git history accurate.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Threat Model Mitigation Status

| Threat ID | Disposition | Evidence |
|-----------|-------------|----------|
| T-01-02-01 (Stale dist artifacts) | mitigated | `clean: true` present in tsup.config.ts |
| T-01-02-02 (Info disclosure via source paths) | mitigated | `sourcemap: true` + `minify: false`; no secrets in library code (Plan 01 confirmed) |
| T-01-02-03 (Exports map ↔ build output mismatch) | mitigated | `outExtension` forces `.mjs`/`.cjs` suffixes exactly matching package.json `exports` |

Final verification (build actually runs end-to-end) lives in Plan 04 smoke-verification, as specified in the plan's `<verification>` block.

## Handoff Notes

**Plan 04 (smoke-verification)** is the gate that actually runs `pnpm build`. It should expect:
- `dist/index.mjs` produced (valid ESM, uses `export` syntax)
- `dist/index.cjs` produced (valid CJS, uses `module.exports`)
- `dist/index.d.ts` produced with `export declare const VERSION: string;`
- Each artifact has a matching `.map` sourcemap
- `dist/` is wiped before each build (test by running twice and diffing contents)

**Known non-obvious choices downstream must respect:**
- If a future plan adds a second public entry (e.g., `src/profiles/index.ts`), update `entry:` in tsup.config.ts AND the `exports` map in package.json in lockstep. Both paths and both extensions must match.
- If a future phase adds a runtime dependency (e.g., a well-justified polyfill), `skipNodeModulesBundle:true` will NOT bundle it — consumers will need it installed. This is intentional: any runtime dep is a supply-chain decision that should be visible, not hidden in the bundle. Confirm with a Rule 4 architectural checkpoint first.
- `isolatedModules:true` in tsconfig.json is compatible with tsup's per-file transpile model; any `const enum` or type-only re-export added later must follow the isolatedModules rules.

## User Setup Required

None.

## Next Phase Readiness

- Plan 03 (lint-and-test) can proceed in parallel with this plan's completion (both are Wave 2; they touch disjoint config files).
- Plan 04 (smoke-verification) is now unblocked on the Plan 02 side; it still awaits Plan 03.
- REQ-IDs SETUP-02 and SETUP-04 are **staged** (config in place, final validation by Plan 04's `pnpm build` run).

## Self-Check: PASSED

Verified:
- `tsup.config.ts` exists — FOUND
- Commit `d703742` — FOUND in git log
- `src/index.ts` unchanged from Plan 01 — confirmed (git status clean for src/, VERSION + @example still present)
- No runtime dependencies added (package.json untouched) — confirmed

---
*Phase: 01-project-foundation*
*Completed: 2026-04-18*
