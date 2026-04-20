---
phase: 08-examples-starter-kit-and-documentation
plan: 05
subsystem: release-integration
tags: [capstone, integration, ci-wiring, publish-workflow, version-bump, workflow-dispatch]
requirements: []

# Dependency graph
dependency_graph:
  requires:
    - "Plan 08-01 — scripts/run-examples.ts + examples/*.ts marker strings (consumed by CI Examples step)"
    - "Plan 08-02 — examples/profile-starter-kit/ subtree + file:../.. devDep pattern (consumed by CI Starter kit step)"
    - "Plan 08-03 — README.md comprehensive rewrite (shipped in 0.1.0 tarball)"
    - "Plan 08-04 — CHANGELOG.md + CONTRIBUTING.md (CHANGELOG shipped in 0.1.0 tarball via files allow-list)"
  provides:
    - "Parent package.json at version 0.1.0 with scripts.examples + tsx devDep wired"
    - "Parent .github/workflows/ci.yml gating examples smoke + starter kit pipeline + kit workflow actionlint on every PR"
    - "Parent .github/workflows/publish.yml (workflow_dispatch-only, step-scoped NPM_TOKEN, provenance-ready permissions)"
    - "End-to-end Phase 8 pipeline green — ready for /gsd-verify-work 8"
    - "Tarball-ready 0.1.0 package — pnpm publish --dry-run confirms 10 files / 346.2 kB / clean allow-list"
  affects:
    - "Phase 8 verifier (/gsd-verify-work 8) — all 25 Phase-8 REQs observable via green pipeline"
    - "Future npm publish act — workflow button exists; awaits operator + NPM_TOKEN secret (CONTEXT D-25)"

# Tech tracking
tech-stack:
  added:
    - "tsx ^4.0.0 (devDep only — powers pnpm examples; T-08-22 accepted)"
  patterns:
    - "matrix-gated CI steps (if: matrix.node == '20') — additive-not-multiplicative time cost per CONTEXT D-11"
    - "workflow_dispatch-only publish trigger — zero accidental-publish surface (T-08-19 mitigated)"
    - "step-scoped NODE_AUTH_TOKEN env — never job-level, never echoed (T-08-20 mitigated)"
    - "provenance-ready permissions block (id-token: write) — unlocks publishConfig.provenance signed attestation (T-08-21 mitigated)"
    - "reviewdog/action-actionlint@v1 as kit-workflow validator — low-setup marketplace action (CONTEXT Claude's Discretion)"

key-files:
  created:
    - ".github/workflows/publish.yml"
    - ".planning/phases/08-examples-starter-kit-and-documentation/08-05-SUMMARY.md"
  modified:
    - "package.json (version 0.0.0 -> 0.1.0, scripts.examples added, devDependencies.tsx added)"
    - ".github/workflows/ci.yml (3 new steps gated if: matrix.node == '20')"
    - "pnpm-lock.yaml (tsx 4.21.0 + transitive tree)"

decisions:
  - "Path B (no workspace wiring) chosen for kit peer-dep resolution. Kit's devDependencies.@cosyte/hl7-parser was already `file:../..` from Plan 08-02 (that plan's Rule-3 deviation preempted this plan's Path A / Path B split). Path A would have added pnpm-workspace.yaml + .npmrc link-workspace-packages=true; not needed because file:../.. resolves directly to the parent tree. Parent CI's Starter kit step runs `pnpm install --no-frozen-lockfile` from working-directory: examples/profile-starter-kit with no additional swap-step required. Verified locally: kit install exits in 902 ms, typecheck/lint/test/build all exit 0."
  - "Version bump applied ONLY to root package.json. Kit already ships at 0.1.0 (Plan 08-02 D-10). Both packages now share the 0.1.0 version line per CONTEXT D-21."
  - "publish.yml differs from kit's publish.yml by `pnpm install --frozen-lockfile` (parent has a lockfile) vs kit's `--no-frozen-lockfile` (kit is a template without a committed lockfile)."
  - "tsx pinned at `^4.0.0` — caret pin matches parent devDep style (CONTEXT Claude's Discretion line 333). Installed resolution: 4.21.0."
  - "Actual `pnpm publish` (no `--dry-run`) deliberately NOT invoked — CONTEXT D-25 defers the publish act to a post-phase manual step. Dry-run verified tarball shape only."

metrics:
  duration_minutes: 6
  tasks_completed: 5
  tasks_total: 5
  files_created: 2
  files_modified: 3
  commits: 3
  completed_date: "2026-04-20"
---

# Phase 8 Plan 05: Capstone Integration — CI + Publish + Version Bump Summary

**Wired the four Wave-1 Phase-8 deliverables (examples, starter kit, README, ancillary docs) into the parent repo's release surface: bumped parent to 0.1.0, added `scripts.examples` + `tsx` devDep, appended three matrix-gated CI steps (examples smoke + starter kit pipeline + kit workflow actionlint), created a workflow_dispatch-only publish.yml with step-scoped NPM_TOKEN + provenance-ready permissions. End-to-end Phase 8 pipeline green. 0.1.0 tarball preview (via `pnpm publish --dry-run`) confirms clean file allow-list. Plan 08 execution complete — ready for `/gsd-verify-work 8`.**

## package.json diff

| Field | Before | After |
| ----- | ------ | ----- |
| `version` | `"0.0.0"` | `"0.1.0"` |
| `scripts.examples` | _(absent)_ | `"tsx scripts/run-examples.ts"` |
| `devDependencies.tsx` | _(absent)_ | `"^4.0.0"` (resolves to 4.21.0) |
| `dependencies` | `{}` | `{}` _(unchanged — zero runtime deps preserved)_ |
| `files` | `["dist","README.md","LICENSE","CHANGELOG.md"]` | _(unchanged)_ |
| `publishConfig` | `{access:"public", provenance:true}` | _(unchanged)_ |
| all other fields | — | _(unchanged)_ |

Lockfile churn: `pnpm-lock.yaml` gained tsx 4.21.0 (plus `get-tsconfig` transitive). No removals.

## .github/workflows/ci.yml additions (3 new steps)

Inserted after the existing `Test (with coverage)` step, before the existing `Build` step. All three gated `if: matrix.node == '20'` per CONTEXT D-11 (keeps CI time additive, not multiplicative across the Node 18/20/22 matrix).

| Step | Command / action | Gate | Purpose |
| ---- | ---------------- | ---- | ------- |
| `Examples (smoke)` | `pnpm examples` | `matrix.node == '20'` | Runs scripts/run-examples.ts — smoke-runs EX-01/02/03 + asserts marker strings |
| `Starter kit (install + test + build)` | `pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build` from `working-directory: examples/profile-starter-kit` | `matrix.node == '20'` | Gates KIT-02/03/04 + kit-internal lint/typecheck surface |
| `Validate kit workflows (actionlint)` | `reviewdog/action-actionlint@v1` with `-color=never` on both kit `.github/workflows/*.yml` files | `matrix.node == '20'` | Gates KIT-04 (kit workflow syntax validity) |

Existing steps (`Checkout`, `Setup pnpm`, `Setup Node.js`, `Install`, `Typecheck`, `Lint`, `Format check`, `Test`, `Test (with coverage)`, `Build`, `Verify dual-module build artifacts`) and matrix (`node: ["18","20","22"]`) left untouched.

actionlint exit 0 on the modified file.

## .github/workflows/publish.yml (new file)

| Property | Value |
| -------- | ----- |
| Trigger | `on: workflow_dispatch:` — ONLY (no push / tags / release / schedule) — T-08-19 mitigation |
| Permissions | `contents: read` + `id-token: write` — T-08-21 mitigation (signed provenance via publishConfig.provenance: true) |
| Install | `pnpm install --frozen-lockfile` (parent has a committed lockfile) |
| Pre-publish gate | typecheck, lint, test, build — all exit 0 required |
| Publish command | `pnpm publish --access public --no-git-checks` |
| Secret injection | `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` scoped to the single `Publish to npm` step's `env` block — NOT job-level, NOT workflow-level — T-08-20 mitigation |
| Setup | `pnpm/action-setup@v4` + `actions/setup-node@v4` (Node 20) + `registry-url: https://registry.npmjs.org` |

actionlint exit 0.

## Peer-dep resolution path (Path A vs Path B decision)

**Chosen: Path B — no workspace wiring needed.**

**Rationale:** Plan 08-02 Task 3 (Rule-3 deviation) already set the kit's `devDependencies["@cosyte/hl7-parser"]` to `"file:../.."` — a local relative file specifier — instead of the plan's literal `"workspace:*"`. That choice preempted this plan's Path A (pnpm-workspace.yaml + .npmrc link-workspace-packages) because the `file:../..` specifier resolves the peer against the parent tree directly (parent's `dist/` satisfies the exports map). Outcome:

- **No `pnpm-workspace.yaml` created.**
- **No `.npmrc` modifications.**
- **Parent CI's new `Starter kit` step** simply `cd`s into the kit and runs the standard pipeline — no tarball swap, no `pnpm pack` preamble, no `--filter` invocation.

Verified locally:

- `cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile` exits in 902 ms (uses parent's already-downloaded tree via hardlinks).
- Kit pipeline: typecheck 0 errors, lint 0 warnings (`--max-warnings=0`), 4/4 tests pass (367 ms), build emits 488 B ESM + 517 B CJS + 900 B DTS.
- Parent `pnpm test` (824 tests + 14 todo across 59 files) still green — no regression from the kit's presence.

If Plan 08-02 had kept `workspace:*`, Path A (add `pnpm-workspace.yaml` listing `examples/profile-starter-kit` + append `link-workspace-packages=true` to `.npmrc`) would have been required. Documented in CUSTOMIZING.md step 1 (and the kit README) that downstream consumers replace `file:../..` with a real published version (`"^0.1.0"`) after find/replace.

## End-to-end capstone pipeline verification

Every command run from a clean tree (`rm -rf dist coverage`) on Node 22.22.2 (Linux):

| # | Command | Result | Notes |
| - | ------- | ------ | ----- |
| 1 | `pnpm install --no-frozen-lockfile` | exit 0 | already up-to-date after Task 1 lockfile refresh |
| 2 | `pnpm typecheck` | exit 0 | 0 TS errors |
| 3 | `pnpm lint` | exit 0 | `--max-warnings=0`; no warnings |
| 4 | `pnpm test` | exit 0 | 824 passed, 14 todo, 59 files, 5.16 s |
| 5 | `pnpm build` | exit 0 | ESM 110.24 KB + CJS 111.37 KB + DTS 132.60 KB |
| 6 | `pnpm examples` | exit 0 | 3× `OK   <file>` lines (extract-patient-info, modify-and-resend, read-lab-results) |

Kit smoke (Task 5 inner loop):

| # | Command | Result |
| - | ------- | ------ |
| 1 | `cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile` | exit 0 (902 ms) |
| 2 | `pnpm typecheck` | exit 0 |
| 3 | `pnpm lint` | exit 0 |
| 4 | `pnpm test` | exit 0 (4/4 tests) |
| 5 | `pnpm build` | exit 0 |

actionlint sweep:

| Target | Result |
| ------ | ------ |
| `.github/workflows/ci.yml` | exit 0 |
| `.github/workflows/publish.yml` | exit 0 |
| `examples/profile-starter-kit/.github/workflows/ci.yml` | exit 0 |
| `examples/profile-starter-kit/.github/workflows/publish.yml` | exit 0 |

## pnpm publish --dry-run output (tarball preview, D-25)

```
npm notice 📦  @cosyte/hl7-parser@0.1.0
npm notice Tarball Contents
npm notice 5.6kB  CHANGELOG.md
npm notice 1.1kB  LICENSE
npm notice 28.8kB README.md
npm notice 114.1kB dist/index.cjs
npm notice 431.9kB dist/index.cjs.map
npm notice 136.3kB dist/index.d.cts
npm notice 136.3kB dist/index.d.ts
npm notice 113.0kB dist/index.mjs
npm notice 431.9kB dist/index.mjs.map
npm notice 2.1kB  package.json
npm notice Tarball Details
npm notice name:           @cosyte/hl7-parser
npm notice version:        0.1.0
npm notice filename:       cosyte-hl7-parser-0.1.0.tgz
npm notice package size:   346.2 kB
npm notice unpacked size:  1.4 MB
npm notice total files:    10
```

All expected files present: dist bundle (.mjs/.cjs/.d.ts/.d.cts + sourcemaps) + README.md + LICENSE + CHANGELOG.md + package.json. `files` allow-list working as intended. NO accidental inclusions (no tests, no src/, no .planning/, no examples/, no node_modules). 10 files / 346.2 kB — well-shaped for a v0.1.0 release.

**Publish was NOT invoked** — dry-run only, per CONTEXT D-25 ("Verifier MAY run `pnpm publish --dry-run` ... does NOT actually publish").

## Task Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Bump version 0.0.0→0.1.0 + add scripts.examples + add tsx devDep (+ pnpm-lock.yaml refresh) | `f08b1dc` |
| 2 | Append 3 new matrix-gated steps to .github/workflows/ci.yml | `f9f2f6b` |
| 3 | Peer-dep resolution — Path B chosen, no file changes required (Plan 08-02 `file:../..` already resolves) | _(no commit — verification only)_ |
| 4 | Create .github/workflows/publish.yml (workflow_dispatch-only, step-scoped NPM_TOKEN) | `cfbac6f` |
| 5 | End-to-end capstone smoke — all 6 parent commands + 5 kit commands + actionlint sweep green | _(no commit — verification only)_ |

Total: 3 atomic task commits + this SUMMARY commit (created by the plan-close step).

## Deviations from Plan

### Auto-fixed / Auto-decided Issues

**1. [Rule 3 — Decision heuristic] Path B chosen over Path A (no pnpm-workspace.yaml)**

- **Found during:** Task 3 (peer-dep resolution decision).
- **Issue:** Plan Task 3 presents a conditional Path A (workspace + .npmrc) vs Path B (CI-time tarball swap) depending on Plan 08-02's outcome. Plan 08-02's Rule-3 deviation set the kit's devDep to `"file:../.."` instead of `"workspace:*"` — a simpler case than either plan's Path A or Path B anticipated.
- **Fix:** Neither Path A nor Path B is literally required. The `file:../..` specifier resolves the peer directly against the parent's pre-built `dist/`, so parent CI's Starter kit step works as a plain `cd + pnpm install --no-frozen-lockfile + pipeline` sequence with no workspace or tarball swap. Path B selected in spirit (no workspace wiring), without its tarball-swap mechanics (unneeded).
- **Files affected:** None (Task 3 is verification-only under this decision).
- **Impact:** Zero code delta; simpler CI; matches the realistic state left by Plan 08-02. Documented above in "Peer-dep resolution path (Path A vs Path B decision)".

No other deviations. Tasks 1, 2, 4 executed exactly per plan spec.

## Authentication Gates

None — this plan ran fully autonomously. `NPM_TOKEN` secret is *required* to actually publish, but publishing is out-of-scope per CONTEXT D-25. Dry-run does not require authentication (npm warns but succeeds).

## Issues Encountered

None. Every command exited 0 on first attempt after the Task 1 lockfile refresh. Parent test suite (824 tests) unaffected by any Phase 8 wiring — no regressions.

## Known Stubs

None. Every wired artifact is production-shaped:
- `scripts.examples` backed by a committed, tested, marker-asserting runner (Plan 08-01).
- `tsx` devDep resolved and locked.
- All three CI steps execute concrete commands (not placeholders).
- `publish.yml` is a fully-valid workflow — only the NPM_TOKEN repo secret needs to be configured out-of-band before the first manual dispatch.

## Threat Flags

None beyond the plan's declared `<threat_model>` (T-08-19 through T-08-25). Every `mitigate`-disposition threat is covered by the actual code:

- **T-08-19** (accidental publish) — `on: workflow_dispatch:` only; no push/tag/release/schedule. Verified.
- **T-08-20** (NPM_TOKEN exposure) — `NODE_AUTH_TOKEN` scoped to `Publish to npm` step's `env` block only. Verified.
- **T-08-21** (provenance attestation) — `permissions: { id-token: write }` + `publishConfig.provenance: true` in package.json. Enabled.
- **T-08-23** (CI log secret leakage) — no `set -x`, no `echo $NODE_AUTH_TOKEN`, no `run:` block references the token outside the scoped env. Verified.
- **T-08-25** (kit workflow validation gap) — `reviewdog/action-actionlint@v1` lints both kit workflow files on every PR. Verified.

No new trust boundaries or surfaces introduced by this plan beyond what the register enumerated.

## Self-Check

**File existence:**

- FOUND: `.github/workflows/publish.yml`
- FOUND: `package.json` (version 0.1.0, scripts.examples, devDependencies.tsx confirmed)
- FOUND: `.github/workflows/ci.yml` (3 new matrix-gated steps confirmed)
- FOUND: `pnpm-lock.yaml` (tsx 4.21.0 present)

**Commit existence:**

- FOUND: `f08b1dc` (Task 1 — version + scripts.examples + tsx)
- FOUND: `f9f2f6b` (Task 2 — 3 CI steps)
- FOUND: `cfbac6f` (Task 4 — publish.yml)

**actionlint sweep:** exit 0 on all 4 workflow files (parent ci.yml, parent publish.yml, kit ci.yml, kit publish.yml).

**Capstone pipeline:** 6/6 parent commands + 5/5 kit commands + dry-run preview — all green.

## Self-Check: PASSED

(File + commit self-check re-verified at plan close: publish.yml, SUMMARY.md, and commits f08b1dc / f9f2f6b / cfbac6f all FOUND.)

## Next Phase Readiness

- **`/gsd-verify-work 8`** is the next workflow step. Phase 8's 25 REQs (EX-01..03 + KIT-01..07 + DOC-01..15) are all observable via the parent CI pipeline + the 3 new gates wired by this plan.
- **Manual post-phase step (out of scope):** acquire `@cosyte` npm org if not owned; configure `NPM_TOKEN` repo secret; dispatch the Publish workflow button for the first real publish. CONTEXT D-25 explicitly defers this to outside the planning loop.
- **No blockers.**

---
*Phase: 08-examples-starter-kit-and-documentation*
*Plan: 05 (capstone)*
*Completed: 2026-04-20*
