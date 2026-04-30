---
phase: 08-examples-starter-kit-and-documentation
plan: 02
subsystem: starter-kit
tags: [starter-kit, publishable-template, profiles, placeholders, github-actions, peer-dep]

# Dependency graph
requires:
  - phase: 06-profile-system-and-built-ins
    provides: defineProfile + profiles.genericLab + CustomSegmentDefinition type that the kit's sample profile consumes as a peer import
  - phase: 07-testing-hardening-and-fixtures
    provides: synthetic-fixture conventions (Phase 6 D-27 / Phase 7 D-17) carried forward into test/fixtures/sample.hl7

provides:
  - A publishable, placeholder-friendly profile-package template under examples/profile-starter-kit/
  - 15 files covering npm manifest, 4 toolchain configs, sample profile + test + fixture, 2 GitHub Actions workflows, 3 docs (README + CUSTOMIZING + LICENSE), .gitignore, .prettierrc.json
  - In-kit pipeline green standalone (pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build)
  - Two GitHub Actions workflows, both actionlint-clean: ci.yml (push/PR) and publish.yml (workflow_dispatch-only, NODE_AUTH_TOKEN scoped to single step)
  - KIT-01..07 all satisfied — see mapping section below

affects: [plan-08-05-ci-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "peer-dep-first profile package — kit has zero runtime deps; @cosyte/hl7-parser is peerDependencies only"
    - "placeholder triple ({{YOUR_ORG}}, {{PROFILE_NAME}}, MyProfile) with consistent usage across manifest + source + docs"
    - "workflow_dispatch-only publish workflow — no push/tag triggers, NODE_AUTH_TOKEN scoped to the single pnpm publish step"
    - "canonical CustomSegmentDefinition record shape: `fields: { name: 1-indexed-position }` (NOT the superseded CONTEXT D-07 array-of-names shape)"
    - "in-repo devDependency specifier `file:../..` — kit installs against parent without requiring pnpm-workspace.yaml (that's Plan 08-05's scope)"

key-files:
  created:
    - examples/profile-starter-kit/package.json
    - examples/profile-starter-kit/tsconfig.json
    - examples/profile-starter-kit/tsup.config.ts
    - examples/profile-starter-kit/vitest.config.ts
    - examples/profile-starter-kit/eslint.config.js
    - examples/profile-starter-kit/.prettierrc.json
    - examples/profile-starter-kit/.gitignore
    - examples/profile-starter-kit/src/index.ts
    - examples/profile-starter-kit/test/profile.test.ts
    - examples/profile-starter-kit/test/fixtures/sample.hl7
    - examples/profile-starter-kit/.github/workflows/ci.yml
    - examples/profile-starter-kit/.github/workflows/publish.yml
    - examples/profile-starter-kit/README.md
    - examples/profile-starter-kit/CUSTOMIZING.md
    - examples/profile-starter-kit/LICENSE
  modified: []

key-decisions:
  - "customSegments uses the canonical record shape (`fields: { allergyId: 1, severity: 2, verifiedAt: 3 }`) matching CustomSegmentDefinition in src/parser/types.ts. CONTEXT D-07's array-of-names shape was superseded by PATTERNS.md and the shipping built-ins; PLAN.md's interfaces block made this explicit."
  - "devDependencies.@cosyte/hl7-parser = `file:../..` (orchestrator Option A — NOT `workspace:*` as the plan's action block suggested). Rationale: the repo has no pnpm-workspace.yaml (that's Plan 08-05's scope), and the package is not yet published, so `workspace:*` would fail to resolve. `file:../..` resolves directly to the parent tree — parent's dist/ satisfies the exports map — and lets the in-kit smoke test run standalone today. README + CUSTOMIZING step 1 instruct downstream users to replace this with a real published version."
  - "Publish workflow uses `on: workflow_dispatch:` ONLY — no `push`, no `tag`, no `pull_request`. NODE_AUTH_TOKEN is set on the single pnpm publish step's env block (not job-level). Mitigates T-08-05 (accidental publish from commits) and T-08-06 (secret-exposure surface minimization)."
  - "Added `pnpm-lock.yaml` to the kit's .gitignore. A template package should not ship a lockfile — downstream users generate their own post-customization."
  - "Kit README includes an explicit note about the `file:../..` devDependency default and its downstream replacement. This was not in the plan's README template but was needed because the orchestrator diverged from the plan's `workspace:*` default (Rule 2 — missing critical doc)."

patterns-established:
  - "Starter-kit layout template: kit/{src,test,test/fixtures,.github/workflows} + 4 root configs + 3 docs — replicable for future kit variants (e.g., transformer starter kit, CLI starter kit)."
  - "Placeholder identifier triple pattern: `{{NPM_SCOPE}}/{{PACKAGE_NAME}}` + a JS-identifier placeholder (`MyProfile` here) for export-position use. CUSTOMIZING instructs the rename of all three."
  - "In-repo template verification: kit's own pipeline (install + typecheck + lint + test + build) runs green inside the parent repo without any parent-side workspace wiring. Plan 08-05 extends this to parent CI."

requirements-completed: [KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07]

# Metrics
metrics:
  duration: "~7 minutes (208s measured wall-clock)"
  completed: "2026-04-20"
  files_created: 15
  files_modified: 0
  tests_added: 4
  commits: 2
---

# Phase 8 Plan 02: Profile Starter Kit — Publishable Template Summary

Created the full `examples/profile-starter-kit/` subtree — a 15-file, placeholder-friendly, zero-runtime-dep profile package template. A developer copies the directory, find/replaces three placeholders, and has a CI-gated, npm-publishable HL7 profile package in minutes. Kit's own in-repo pipeline (install + typecheck + lint + test + build) runs green standalone; both GitHub Actions workflows are actionlint-clean; publish workflow is `workflow_dispatch`-only with `NODE_AUTH_TOKEN` scoped to the single publish step.

## Completed Tasks

| Task | Name                                                                  | Commit  | Files |
| ---- | --------------------------------------------------------------------- | ------- | ----- |
| 1    | Configs + sample source/test/fixture + LICENSE + gitignore            | 43fccae | 11    |
| 2    | Docs (README + CUSTOMIZING) + ci.yml + publish.yml                    | 3c303c0 | 4     |
| 3    | Smoke-verify in-kit pipeline (install/typecheck/lint/test/build)      | n/a (verification only, no code changes) | 0     |

## KIT-01..07 Requirement Mapping

| REQ-ID | Satisfied by                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| KIT-01 | `package.json` + `tsconfig.json` + `tsup.config.ts` + `vitest.config.ts` + `eslint.config.js` (+ `.prettierrc.json`)  |
| KIT-02 | `test/profile.test.ts` (4 assertions) + `test/fixtures/sample.hl7` — `pnpm test` exits 0 in Task 3                    |
| KIT-03 | `tsup.config.ts` → Task 3 `pnpm build` produced `dist/index.mjs` + `dist/index.cjs` + `dist/index.d.ts`               |
| KIT-04 | `.github/workflows/ci.yml` + `.github/workflows/publish.yml` (both actionlint-clean)                                  |
| KIT-05 | `package.json` with `peerDependencies` + `publishConfig.access:public` + `files` allow-list + scripts + no `dependencies` block |
| KIT-06 | `CUSTOMIZING.md` 5 numbered steps (rename, swap base, Z-segments, fixtures, publish), each closing with a Verify block |
| KIT-07 | `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` appear consistently across package.json + src/ + test/ + README.md + LICENSE + CUSTOMIZING.md (grep confirmed) |

## Deliverables Checklist

- [x] **15 files created** under `examples/profile-starter-kit/` (matches `files_modified` in the plan frontmatter).
- [x] `package.json.name === "@{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}"`, `version === "0.1.0"`, `peerDependencies["@cosyte/hl7-parser"] === ">=0.1.0"`, NO top-level `dependencies` block.
- [x] `package.json.publishConfig.access === "public"` and `.files === ["dist","README.md","LICENSE","CUSTOMIZING.md"]`.
- [x] `src/index.ts` uses canonical `customSegments: { ZAL: { fields: { allergyId: 1, severity: 2, verifiedAt: 3 } } }` record shape (matches `CustomSegmentDefinition` in `src/parser/types.ts`).
- [x] `src/index.ts` imports from `@cosyte/hl7-parser` (peer) — NOT a relative path.
- [x] `test/profile.test.ts` imports from both `@cosyte/hl7-parser` (peer) and `../src/index.js` (kit-relative).
- [x] `test/fixtures/sample.hl7` uses CR-only separators (`\r`), no LF (`\n`), no trailing newline — synthetic `MRN-KIT-001` patient, `Doe^John`, no PHI.
- [x] `LICENSE` has `Copyright (c) 2026 {{YOUR_ORG}}`.
- [x] `publish.yml` trigger is `workflow_dispatch:` ONLY (no push, no tag, no pull_request).
- [x] `NODE_AUTH_TOKEN` is scoped to the single publish step's `env` block — NOT job-level.
- [x] `publish.yml` permissions: `contents: read` + `id-token: write` (enables future `--provenance`).
- [x] `CUSTOMIZING.md` contains 5 numbered sections (`## 1. Rename` .. `## 5. Publish`), each with at least one `**Verify:**` block followed by a code fence.
- [x] `actionlint` on both workflows — exit 0.
- [x] In-kit pipeline green: `pnpm install --no-frozen-lockfile` (3.3s) → `pnpm typecheck` (0 errors) → `pnpm lint` (0 warnings, `--max-warnings=0`) → `pnpm test` (4/4 pass, 422ms) → `pnpm build` (ESM 488B, CJS 517B, DTS 900B, ~670ms).
- [x] `git status examples/profile-starter-kit/` clean after smoke test — `node_modules/`, `dist/`, `pnpm-lock.yaml` all gitignored.

## Deviations from Plan

### 1. [Rule 3 — Blocker] devDependencies.@cosyte/hl7-parser: `file:../..` instead of `workspace:*`

- **Found during:** Task 1 (planning the kit's devDep resolution).
- **Issue:** The plan's action block specifies `"@cosyte/hl7-parser": "workspace:*"` in kit devDependencies, but the repo root has no `pnpm-workspace.yaml` (that's explicitly Plan 08-05's scope per the plan's scope boundary). `workspace:*` would fail to resolve at install time, and the package isn't yet published to npm for an npm-registry fallback.
- **Fix:** Used `"@cosyte/hl7-parser": "file:../.."` per the orchestrator's explicit instruction (Option A in the prompt). This resolves directly to the parent tree (parent's `dist/` satisfies the exports map). Documented in README.md and CUSTOMIZING.md step 1 that downstream users should replace this with a real published version (`"^0.1.0"`) after running the find/replace.
- **Files modified:** `examples/profile-starter-kit/package.json`, `examples/profile-starter-kit/README.md`, `examples/profile-starter-kit/CUSTOMIZING.md`.
- **Commits:** 43fccae (package.json), 3c303c0 (README + CUSTOMIZING).
- **Rationale:** The plan is authoritative only where it aligns with the actual repo state; the orchestrator's rewrite anticipated this mismatch and pre-selected Option A. When Plan 08-05 lands workspace wiring, this spec can optionally flip back to `workspace:*`.

### 2. [Rule 2 — Missing doc] README.md includes devDependency replacement note

- **Found during:** Task 2 (writing README).
- **Issue:** The plan's README template didn't cover the `file:../..` default (because it assumed `workspace:*`). Downstream users copying the kit out of the parent repo would hit a resolve failure.
- **Fix:** Added a **Note on the `@cosyte/hl7-parser` devDependency** paragraph to README.md's Develop section, plus an explicit step in CUSTOMIZING.md step 1 showing the `"^0.1.0"` replacement.
- **Files modified:** `examples/profile-starter-kit/README.md`, `examples/profile-starter-kit/CUSTOMIZING.md`.
- **Commit:** 3c303c0.

### 3. [Rule 2 — Defensive] `pnpm-lock.yaml` added to kit `.gitignore`

- **Found during:** Task 1 (composing .gitignore).
- **Issue:** Root `.gitignore` doesn't list `pnpm-lock.yaml` (the root repo ships one). But the kit is a template — it should not ship a lockfile (reasoning documented in `placeholder_install_contract` of the plan: "a template package should not ship a lockfile").
- **Fix:** Appended `pnpm-lock.yaml` to the kit's `.gitignore`, with an inline comment explaining the template rationale.
- **Commit:** 43fccae.

### 4. [No deviation — smoke test path] Task 3 Option A used, Option B/C not triggered, D-06 `prepare` fallback NOT needed

- **Outcome:** `pnpm install --no-frozen-lockfile` inside the kit (with parent's pre-built `dist/` present and `file:../..` devDep) succeeded on first try. No `prepare`-script rewrite of the `name` field was necessary — pnpm 9.0.0 tolerated `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` in the `name` field during install. All five in-kit stages (install / typecheck / lint / test / build) passed clean.
- **Note for Plan 08-05:** Parent CI can call the kit's pipeline directly (e.g., `cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile && pnpm test && pnpm build`) without any additional workspace wiring. Optional: add `pnpm-workspace.yaml` for symlink-based `workspace:*` resolution (which would be a one-line change in the kit's package.json).

## Authentication Gates

None — this plan ran fully autonomously. No human action required during execution.

## Smoke Test Evidence (Task 3)

```
$ cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile
devDependencies:
+ @cosyte/hl7-parser 0.0.0
+ @types/node 20.19.39
+ @typescript-eslint/eslint-plugin 7.18.0
+ @typescript-eslint/parser 7.18.0
+ eslint 8.57.1
+ eslint-config-prettier 9.1.2
+ tsup 8.5.1
+ typescript 5.9.3
+ vitest 1.6.1
Done in 3.3s

$ pnpm typecheck      # exit 0 (no TS errors)
$ pnpm lint           # exit 0 (0 warnings, --max-warnings=0)
$ pnpm test
 ✓ test/profile.test.ts  (4 tests) 4ms
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ pnpm build
 ESM dist/index.mjs     488.00 B
 CJS dist/index.cjs     517.00 B
 DTS dist/index.d.ts  900.00 B
$ actionlint .github/workflows/*.yml   # exit 0
```

## Known Stubs

None. Every file is production-shaped content; the placeholder tokens (`{{YOUR_ORG}}`, `{{PROFILE_NAME}}`, `MyProfile`) are intentional and part of the KIT-07 contract, with CUSTOMIZING.md step 1 providing the find-replace path.

## Threat Flags

None — the kit's attack surface was fully enumerated in the plan's `<threat_model>` (T-08-05..T-08-10). All mitigated items (T-08-05, T-08-06, T-08-07, T-08-09) implemented per the register. Accepted items (T-08-08, T-08-10) unchanged.

## Self-Check: PASSED

Files verified present (15/15):
- FOUND: examples/profile-starter-kit/package.json
- FOUND: examples/profile-starter-kit/tsconfig.json
- FOUND: examples/profile-starter-kit/tsup.config.ts
- FOUND: examples/profile-starter-kit/vitest.config.ts
- FOUND: examples/profile-starter-kit/eslint.config.js
- FOUND: examples/profile-starter-kit/.prettierrc.json
- FOUND: examples/profile-starter-kit/.gitignore
- FOUND: examples/profile-starter-kit/src/index.ts
- FOUND: examples/profile-starter-kit/test/profile.test.ts
- FOUND: examples/profile-starter-kit/test/fixtures/sample.hl7
- FOUND: examples/profile-starter-kit/.github/workflows/ci.yml
- FOUND: examples/profile-starter-kit/.github/workflows/publish.yml
- FOUND: examples/profile-starter-kit/README.md
- FOUND: examples/profile-starter-kit/CUSTOMIZING.md
- FOUND: examples/profile-starter-kit/LICENSE

Commits verified in git log:
- FOUND: 43fccae (Task 1)
- FOUND: 3c303c0 (Task 2)
