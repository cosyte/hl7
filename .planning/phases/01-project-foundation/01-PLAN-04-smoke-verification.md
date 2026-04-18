---
phase: 01-project-foundation
plan: 04
type: execute
wave: 3
depends_on:
  - 01-PLAN-01-package-scaffold
  - 01-PLAN-02-build-system
  - 01-PLAN-03-lint-and-test
files_modified:
  - pnpm-lock.yaml
  - .github/workflows/ci.yml
requirements:
  - SETUP-01
  - SETUP-02
  - SETUP-04
  - SETUP-06
autonomous: true
tags:
  - smoke-test
  - ci
  - verification
must_haves:
  truths:
    - "A developer running `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` on a clean clone sees every command exit 0 with zero warnings (Success Criterion 1)"
    - "After `pnpm build`, dist/index.mjs, dist/index.cjs, and dist/index.d.ts all exist (SETUP-02)"
    - "dist/index.d.ts exports VERSION with a type annotation (SETUP-04)"
    - "An ESM consumer and a CJS consumer can both import VERSION via the `exports` map (Success Criterion 2)"
    - "pnpm-lock.yaml exists and is committed (supply-chain reproducibility, threat T-01-01)"
    - ".github/workflows/ci.yml runs the full pipeline on push/PR to main (developer cloning the repo gets CI verification on day one)"
  artifacts:
    - path: pnpm-lock.yaml
      provides: "Reproducible dependency resolution (committed, not gitignored)"
    - path: .github/workflows/ci.yml
      provides: "CI pipeline running install/typecheck/lint/test/build on Node 18 and Node 20"
    - path: dist/index.mjs
      provides: "Runtime-verified ESM build artifact"
    - path: dist/index.cjs
      provides: "Runtime-verified CJS build artifact"
    - path: dist/index.d.ts
      provides: "Runtime-verified type declaration file"
  key_links:
    - from: .github/workflows/ci.yml
      to: package.json scripts
      via: "CI runs the same commands a developer runs locally"
      pattern: "pnpm (install|build|typecheck|lint|test)"
    - from: pnpm-lock.yaml
      to: package.json
      via: "pnpm install --frozen-lockfile ensures lockfile and manifest agree"
      pattern: "package.json"
---

<objective>
Run the full pipeline end-to-end from a clean state to verify every Phase 1 Success Criterion holds, commit the resulting pnpm-lock.yaml for reproducibility, and add a CI workflow so regressions never land silently.

Purpose: This is the capstone plan. Plans 01-03 laid declarative files; this plan is the "does it actually work?" gate. It is also the final chance to catch integration problems between the configs (e.g., eslint rejects tsup.config.ts, vitest can't resolve src/index.ts, prettier and eslint disagree about formatting, dual-build artifacts don't match the exports map).

Output: A green `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` run, committed pnpm-lock.yaml, and a working CI workflow.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@CLAUDE.md
@.planning/phases/01-project-foundation/01-01-SUMMARY.md
@.planning/phases/01-project-foundation/01-02-SUMMARY.md
@.planning/phases/01-project-foundation/01-03-SUMMARY.md

<interfaces>
From Plan 01 (package.json scripts — these are the chain this plan validates):
- pnpm install    → populates node_modules, generates pnpm-lock.yaml
- pnpm build      → tsup produces dist/index.mjs, dist/index.cjs, dist/index.d.ts
- pnpm typecheck  → tsc --noEmit
- pnpm lint       → eslint with --max-warnings=0
- pnpm test       → vitest run
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run the full pipeline end-to-end and commit pnpm-lock.yaml</name>
  <files>pnpm-lock.yaml</files>
  <read_first>
    - package.json (scripts and devDependencies from Plan 01)
    - tsup.config.ts (from Plan 02)
    - eslint.config.js (from Plan 03)
    - vitest.config.ts (from Plan 03)
    - test/sanity.test.ts (from Plan 03)
    - tsconfig.json (from Plan 01)
  </read_first>
  <action>
Execute, in order, from `/home/nschatz/projects/cosyte/hl7-parser/`:

1. **Confirm pnpm is available**: run `pnpm --version`. If pnpm is not installed, emit an error asking the user to install it (`npm i -g pnpm` or `corepack enable`) — do not try to install it yourself.

2. **Install dependencies** (produces pnpm-lock.yaml):
   ```
   pnpm install
   ```
   Must exit 0. Creates `node_modules/` and `pnpm-lock.yaml` at repo root.

3. **Typecheck**:
   ```
   pnpm typecheck
   ```
   Must exit 0 with no output. Runs `tsc --noEmit` against tsconfig.json.

4. **Lint**:
   ```
   pnpm lint
   ```
   Must exit 0 with no output. Runs eslint on src/**/*.ts and test/**/*.ts with --max-warnings=0.

5. **Prettier format check**:
   ```
   pnpm format:check
   ```
   Must exit 0. If this fails, run `pnpm format` to fix, then re-verify `pnpm format:check` is clean, then commit the reformatted files.

6. **Test**:
   ```
   pnpm test
   ```
   Must exit 0. Must show at least 1 test passing (test/sanity.test.ts with 2 assertions).

7. **Build**:
   ```
   pnpm build
   ```
   Must exit 0. Must produce:
   - `dist/index.mjs` (ESM — grep should find `export`)
   - `dist/index.cjs` (CJS — grep should find `module.exports` or `exports.VERSION`)
   - `dist/index.d.ts` (contains `export declare const VERSION: string;` or equivalent)
   - `dist/index.d.cts` or `dist/index.d.mts` if tsup emits them; those are fine extras

8. **Dual-resolution smoke test** (proves SETUP-02 / Success Criterion 2). Run this inline without creating persistent test files — use a temp directory:
   ```bash
   TMP=$(mktemp -d)
   cd "$TMP"
   cat > test-esm.mjs <<'EOF'
   import { VERSION } from "/home/nschatz/projects/cosyte/hl7-parser/dist/index.mjs";
   if (typeof VERSION !== "string") { console.error("ESM: VERSION not a string"); process.exit(1); }
   console.log("ESM OK:", VERSION);
   EOF
   cat > test-cjs.cjs <<'EOF'
   const { VERSION } = require("/home/nschatz/projects/cosyte/hl7-parser/dist/index.cjs");
   if (typeof VERSION !== "string") { console.error("CJS: VERSION not a string"); process.exit(1); }
   console.log("CJS OK:", VERSION);
   EOF
   node test-esm.mjs
   node test-cjs.cjs
   cd /home/nschatz/projects/cosyte/hl7-parser
   rm -rf "$TMP"
   ```
   Both invocations must print `ESM OK: 0.0.0` / `CJS OK: 0.0.0`.

9. **Commit the lockfile and any prettier-reformats**:
   - `pnpm-lock.yaml` must be tracked (NOT in .gitignore — verify `grep 'pnpm-lock' .gitignore` returns nothing; Plan 01's .gitignore does not list it, which is correct).
   - If any source file was reformatted by `pnpm format` in step 5, that reformat is now the canonical state — the plan-04 commit will include both the lockfile and the reformatted files.

If ANY of steps 2-8 fail, STOP and report the exact failure to the user. Do not attempt to "fix forward" by loosening lint rules or coverage thresholds — that violates CLAUDE.md. The failure is almost certainly an integration bug between plans and needs to be diagnosed, not papered over.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && test -f dist/index.mjs && test -f dist/index.cjs && test -f dist/index.d.ts && grep -q VERSION dist/index.d.ts && node -e "import('/home/nschatz/projects/cosyte/hl7-parser/dist/index.mjs').then(m=>{if(typeof m.VERSION!=='string')throw 'ESM fail'; console.log('ESM:', m.VERSION);})" && node -e "const m=require('/home/nschatz/projects/cosyte/hl7-parser/dist/index.cjs'); if(typeof m.VERSION!=='string')throw 'CJS fail'; console.log('CJS:', m.VERSION);" && test -f pnpm-lock.yaml && echo 'SMOKE OK'</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm install` exits 0 and produces `pnpm-lock.yaml`
    - `pnpm typecheck` exits 0 with zero stdout/stderr
    - `pnpm lint` exits 0 with zero warnings (--max-warnings=0)
    - `pnpm format:check` exits 0
    - `pnpm test` exits 0 with at least 2 passing assertions in test/sanity.test.ts
    - `pnpm build` exits 0
    - `dist/index.mjs` exists and is non-empty
    - `dist/index.cjs` exists and is non-empty
    - `dist/index.d.ts` exists and contains `VERSION` (grep -q VERSION dist/index.d.ts succeeds)
    - `node -e "import('./dist/index.mjs').then(m=>console.log(m.VERSION))"` prints `0.0.0`
    - `node -e "console.log(require('./dist/index.cjs').VERSION)"` prints `0.0.0`
    - `pnpm-lock.yaml` exists at repo root and is NOT in .gitignore (grep -v pattern: `grep 'pnpm-lock' .gitignore` returns no matches)
    - Re-running `pnpm install --frozen-lockfile` succeeds (lockfile is consistent with manifest)
  </acceptance_criteria>
  <done>
    The full pipeline — install, typecheck, lint, format:check, test, build — runs end-to-end on a clean clone with zero errors and zero warnings. Both ESM and CJS consumers can import VERSION. pnpm-lock.yaml is committed. Phase 1 Success Criteria 1, 2, and 3 are directly verified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create .github/workflows/ci.yml to run the pipeline on push/PR</name>
  <files>.github/workflows/ci.yml</files>
  <read_first>
    - package.json (confirm scripts: build, typecheck, lint, test, format:check)
    - CLAUDE.md (Node 18+ requirement)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/.github/workflows/ci.yml` with EXACTLY these contents:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel in-progress runs on new pushes to the same branch/PR.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    name: verify (node-${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ["18", "20", "22"]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js ${{ matrix.node }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

      - name: Verify dual-module build artifacts
        run: |
          test -f dist/index.mjs
          test -f dist/index.cjs
          test -f dist/index.d.ts
          node -e "import('./dist/index.mjs').then(m => { if (typeof m.VERSION !== 'string') { console.error('ESM missing VERSION'); process.exit(1); } console.log('ESM OK:', m.VERSION); })"
          node -e "const m = require('./dist/index.cjs'); if (typeof m.VERSION !== 'string') { console.error('CJS missing VERSION'); process.exit(1); } console.log('CJS OK:', m.VERSION);"
```

Critical notes:
- `on: push/pull_request to main` — standard library CI trigger.
- `permissions: contents: read` — least-privilege default (threat T-01-05 mitigation).
- Matrix on Node 18/20/22 — CLAUDE.md says Node 18+; testing the LTS range ensures the `engines` field is honest.
- `pnpm/action-setup@v4` with `version: 9` — matches packageManager field in package.json.
- `pnpm install --frozen-lockfile` — hard requirement the lockfile committed in Task 1 matches package.json.
- Every step corresponds to a developer-invocable script; CI is not permitted to use flags or paths that a local developer couldn't reproduce (same commands locally and in CI).
- The final step re-runs the dual-module smoke from Task 1 to protect against future changes breaking SETUP-02.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && test -f .github/workflows/ci.yml && grep -q 'pnpm install --frozen-lockfile' .github/workflows/ci.yml && grep -q 'pnpm typecheck' .github/workflows/ci.yml && grep -q 'pnpm lint' .github/workflows/ci.yml && grep -q 'pnpm test' .github/workflows/ci.yml && grep -q 'pnpm build' .github/workflows/ci.yml && grep -q 'node: \["18", "20", "22"\]' .github/workflows/ci.yml && grep -q 'dist/index.mjs' .github/workflows/ci.yml && grep -q 'dist/index.cjs' .github/workflows/ci.yml && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `.github/workflows/ci.yml` exists
    - File triggers on push to main AND pull_request to main
    - Matrix includes Node `18`, `20`, `22`
    - Uses `pnpm/action-setup@v4` with `version: 9`
    - Uses `actions/setup-node@v4` with `cache: pnpm`
    - Runs `pnpm install --frozen-lockfile`
    - Runs typecheck, lint, format:check, test, build steps in that order
    - Final step runs dual-module verification (both .mjs and .cjs imports check VERSION)
    - `permissions: contents: read` present (least-privilege)
    - `concurrency` block present with `cancel-in-progress: true`
  </acceptance_criteria>
  <done>
    .github/workflows/ci.yml exists and codifies the Phase 1 Success Criterion 1 pipeline as continuous verification on every push/PR, across Node 18/20/22. Future contributors cannot land a PR that breaks the developer-cloning experience without CI blocking them.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub Actions runner → repo (via checkout) | CI runs in Microsoft-hosted VMs with access to the repo at a specific SHA |
| CI → npm registry | CI fetches devDependencies at the lockfile-pinned versions |
| Lockfile → dependency tree | Committed lockfile is the single source of truth for reproducible installs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04-01 | Tampering | Unpinned devDependency drift | mitigate | Task 1 commits `pnpm-lock.yaml`. Task 2's CI uses `pnpm install --frozen-lockfile` which refuses to run if the lockfile doesn't match package.json — blocks silent supply-chain drift (T-01-01 carryover). |
| T-01-04-02 | Elevation of Privilege | GitHub Actions permissions | mitigate | `permissions: contents: read` at workflow level means every job inherits read-only GITHUB_TOKEN. Phase 8's publish workflow will explicitly grant `id-token: write` only in that workflow, not this one. |
| T-01-04-03 | Denial of Service | Runaway CI costs from duplicate runs | mitigate | `concurrency` block with `cancel-in-progress: true` cancels older runs on same ref when a new push lands — prevents queue buildup on rapid pushes. |
| T-01-04-04 | Tampering | Third-party action version drift | mitigate | All actions pinned to major version tag (`@v4`). Acceptable for early-stage repo; Phase 8 can tighten to commit SHAs if needed for publish workflow. |
| T-01-04-05 | Information Disclosure | CI logs exposing internal paths | accept | CI logs are public on public repos by design. Library code has no secrets (see T-01-03 from Plan 01). |
</threat_model>

<verification>
After this plan:
1. Running the Phase 1 success chain locally exits 0 for every step
2. Both ESM and CJS test harnesses successfully import VERSION
3. pnpm-lock.yaml is tracked in git (`git status` shows it as clean after adding)
4. `.github/workflows/ci.yml` lints clean (no tabs, valid YAML)
5. Pushing this plan to a GitHub repo would trigger CI that re-verifies everything — this plan does not require actually pushing, just that the workflow file is syntactically valid.
</verification>

<success_criteria>
- [ ] Phase 1 Success Criterion 1: `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` exits 0 with zero warnings from a clean clone (directly verified)
- [ ] Phase 1 Success Criterion 2: ESM and CJS consumers both resolve VERSION via the exports map with typed IntelliSense (.d.ts ships; both .mjs and .cjs imports verified)
- [ ] Phase 1 Success Criterion 3: package.json already compliant (verified in Plan 01, re-verified here via the build chain)
- [ ] Phase 1 Success Criterion 4: Strict-mode TS errors on `any`, unchecked index access, missing types (verified: eslint catches `any`, tsc catches index access + missing types)
- [ ] pnpm-lock.yaml exists and is tracked
- [ ] CI workflow runs the same pipeline on Node 18/20/22
- [ ] REQ-IDs fully satisfied: SETUP-01, SETUP-02, SETUP-04, SETUP-06 (SETUP-03 and SETUP-05 closed in Plan 01)
</success_criteria>

<output>
After completion, create `.planning/phases/01-project-foundation/01-04-SUMMARY.md` documenting:
- Exact output of each pipeline step (typecheck/lint/test/build)
- dist/ tree listing after `pnpm build`
- Confirmation of ESM and CJS smoke test
- CI workflow file summary
- SETUP-01 through SETUP-06 final status — every one VERIFIED
- Handoff to Phase 2: tooling is frozen; Phase 2 consumes src/index.ts and adds parser modules without touching configs.
</output>
