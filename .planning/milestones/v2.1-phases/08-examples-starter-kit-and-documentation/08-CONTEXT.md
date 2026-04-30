# Phase 8: Examples, Starter Kit & Documentation — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 ships the public-facing surface that turns the working library into an
adoptable open-source release: three runnable `examples/`, a copy-paste-and-publish
`profile-starter-kit/`, the full README + ancillary docs (CONTRIBUTING.md,
CHANGELOG.md, LICENSE), and the publish workflow scaffolding. After this phase, a
developer landing on the GitHub or npm page can go from zero to parsing a real
message in under a minute and find a recipe for every common task.

**In scope (EX-01..03, KIT-01..07, DOC-01..15 — 25 reqs):**

- **EX-01..03** — `examples/extract-patient-info.ts`, `examples/read-lab-results.ts`,
  `examples/modify-and-resend.ts` running end-to-end via `tsx`.
- **KIT-01..07** — `examples/profile-starter-kit/` containing a publishable
  package skeleton (package.json with peerDependencies + publishConfig, src/,
  test/, fixtures/, dist/ on build, ci.yml + publish.yml workflows,
  CUSTOMIZING.md, README, sample profile + fixture).
- **DOC-01..11** — README sections: value prop + badges, quickstart, feature
  list, "HL7 in 90 seconds", three access patterns, full cookbook, top-level
  Profiles section, Real-World Tolerance section with table + runnable example,
  Error Handling, Contributing, "Built by Cosyte" footer.
- **DOC-12** — Roadmap / stretch-goals section enumerating v2 deferrals.
- **DOC-13** — "Publishing Your Profile" cookbook recipe links to
  `examples/profile-starter-kit/` + references CUSTOMIZING.md.
- **DOC-14** — `CHANGELOG.md` (Keep-a-Changelog) with `[Unreleased]` + `[0.1.0]`.
- **DOC-15** — `LICENSE` (MIT) at repo root (already exists; verified).

**Out of scope (deferred to other milestones / v2):**

- Actual `pnpm publish` to npmjs.org. Phase 8 lands the workflow; the publish
  act is a separate post-phase manual step (D-25).
- GitHub Pages / Docusaurus / VitePress documentation site — README is the
  canonical doc surface for v1.
- Auto-generated API reference (TypeDoc) — JSDoc + IntelliSense already covers
  per-export docs (CLAUDE.md guardrail).
- Tabbed TS/JS code samples in README — TypeScript-only (D-12).
- `release-please` / `changesets` / Conventional Commits tooling — manual
  CHANGELOG edits (D-22).
- README code-block doctest extraction — verification limited to `examples/`
  smoke script (D-04). README code is verified by reading.
- New runtime deps. `tsx` is dev-dep only.
- Migration guides — first release; nothing to migrate from.
- CLI / interactive playground — not in v1.
- Asciinema GIFs / screenshots — ASCII tree only (D-16).
- Sample identity in starter kit (e.g., `@acmelab/...`) — pure placeholders only
  (D-06).

</domain>

<decisions>
## Implementation Decisions

### Examples (EX-01..03)

- **D-01: Examples run via `tsx`.** `pnpm tsx examples/extract-patient-info.ts`
  matches the ROADMAP success-criteria-1 wording verbatim. `tsx` enters
  `devDependencies`; zero runtime deps preserved. ESM-first; no build step.
- **D-02: Fixtures live in `examples/data/*.hl7`.** Each example imports its
  own fixture from `examples/data/`, not from `test/fixtures/`. Self-contained;
  copyable; signals "this is consumer code, not test infra". Fixtures are
  authored fresh (synthetic, no PHI; per Phase 6 D-27 / Phase 7 D-17) and may
  intentionally include vendor-quirky elements that exercise warnings (the
  modify-and-resend example is a natural place to demo round-trip preserving
  semantics on a slightly quirky input).
- **D-03: Output style is narrated `console.log` lines.** Each example prints
  labeled human-readable lines (e.g., `Patient MRN: MRN12345\nFull name: John
  Doe\nDOB: 1980-01-15`). Reads like a tutorial; shows the helper API at a
  glance; matches what a blog reader expects. Examples may end with a one-line
  summary (e.g., `→ extracted 3 fields in 1 line via msg.patient`). The
  modify-and-resend example additionally prints the serialized output so the
  round-trip is visible.
- **D-04: Examples are smoke-tested in CI via `pnpm examples`.**
  `scripts/run-examples.ts` invokes each file under `examples/*.ts` (NOT
  recursing into `examples/data/` or `examples/profile-starter-kit/`),
  captures stdout, asserts the process exits 0, and asserts a known marker
  string is present per example (e.g., `Patient MRN:` for
  extract-patient-info). Use `node:child_process.spawnSync` (or
  `execFileSync`) — NOT `exec`/`execSync` with a shell template — so that
  filenames pass as argv and never as shell text. `package.json` gains
  `scripts.examples = "tsx scripts/run-examples.ts"`. CI workflow gains an
  `Examples` step after the existing test step. Failing examples produce a
  separate, clear CI signal — they are not folded into `pnpm test`.
- **D-05: Layout is flat `examples/*.ts` + `examples/data/` + `examples/README.md`
  + `examples/profile-starter-kit/` sibling.** Final layout:
  ```
  examples/
    README.md                       # index + how to run
    extract-patient-info.ts         # EX-01
    read-lab-results.ts             # EX-02
    modify-and-resend.ts            # EX-03
    data/
      adt-a01.hl7
      oru-r01-lab.hl7
      adt-mutate-source.hl7
    profile-starter-kit/            # KIT-01..07 (own subtree)
      ...
  ```
  `examples/README.md` is a short index — one paragraph per example
  describing what it demonstrates and the exact command to run it. Not part
  of the README cookbook (which lives in repo-root README).

### Starter Kit (KIT-01..07)

- **D-06: Pure placeholders — `{{YOUR_ORG}}` / `{{PROFILE_NAME}}`
  throughout.** No working sample identity. Every name token in package.json,
  src/, test/, README, CUSTOMIZING.md is `{{YOUR_ORG}}`/`{{PROFILE_NAME}}`.
  Matches KIT-07 verbatim. CUSTOMIZING.md (D-09) lists the exact files +
  strings to find-replace. The kit's local CI verifies it builds and tests
  *with placeholders intact* — placeholders are valid npm scope/name strings
  for the test harness (pnpm tolerates `{{...}}` in name fields with the
  `--no-frozen-lockfile` flag, which the kit's CI uses; planner verifies this
  assumption against the actual pnpm version and adopts the canonical workaround
  if needed — fallback is a `prepare` script that swaps placeholders for
  `placeholder-org`/`placeholder-profile` before install).
- **D-07: Sample profile = realistic fictional vendor with one Z-segment +
  one quirk.** The kit's `src/index.ts` defines a profile that:
  - Declares one custom Z-segment with named fields (e.g., `ZAL` allergy
    detail with `allergyId`, `severity`, `verifiedAt` field aliases).
  - Suppresses one Tier-2 warning code via `customSegments` (`UNKNOWN_SEGMENT`
    for `ZAL`).
  - Adds one non-standard `dateFormats` entry (e.g., `'yyyy-MM-dd'` ISO
    fallback).
  - Calls `extends` against `profiles.genericLab` to demonstrate composition
    with a built-in.
  Sample fixture (`test/fixtures/sample.hl7`) is an ADT^A01 with the `ZAL`
  segment populated. Test asserts: profile loads, fixture parses without
  `UNKNOWN_SEGMENT` warnings for `ZAL`, ZAL fields accessible by alias.
  Demonstrates the profile value-prop in <50 LOC of src + <10 lines of test.
  Even though placeholders are used (D-06), the **functional** profile content
  is real.
- **D-08: Same conventions as parent repo, slimmer surface.** Kit ships:
  - `package.json` (D-10 — peerDependencies, publishConfig, files, scripts)
  - `tsconfig.json` (extends nothing — standalone strict TS)
  - `tsup.config.ts` (dual ESM+CJS, .d.ts, matches parent style)
  - `eslint.config.js` (flat config, copy of parent's relevant subset)
  - `.prettierrc` (or inherits via `prettier-config` if simpler)
  - `vitest.config.ts` (no coverage gate — kit ships green-or-red, no thresholds)
  - `src/index.ts` (single file, exports the sample profile)
  - `test/profile.test.ts` (single test file)
  - `test/fixtures/sample.hl7`
  - `.github/workflows/ci.yml` (install, lint, typecheck, test, build)
  - `.github/workflows/publish.yml` (workflow_dispatch — KIT-04)
  - `README.md` (KIT-07 — placeholder-aware quickstart + value prop)
  - `CUSTOMIZING.md` (KIT-06 — D-09)
  - `LICENSE` (MIT — boilerplate copy)
  - `.gitignore` (standard Node + dist/)
  No CONTRIBUTING.md (it's a starter, users add their own). No
  CODE_OF_CONDUCT, no dependabot. Maximalist surface (D-08 alt B) is rejected.
- **D-09: `CUSTOMIZING.md` walks through 5 numbered steps.** Final structure:
  1. **Rename** — find/replace `{{YOUR_ORG}}` and `{{PROFILE_NAME}}` (lists
     exact files + the suggested `sed`/IDE-replace command).
  2. **Swap base profile** — change `extends: profiles.genericLab` to your
     vendor (epic/cerner/meditech/athena) or remove for a from-scratch profile.
  3. **Define Z-segments** — replace the sample `ZAL` with your real
     segments + field aliases.
  4. **Write fixtures** — replace `test/fixtures/sample.hl7` with messages
     from your integration; add tests asserting reduced warning surface vs
     no-profile baseline.
  5. **Publish** — `pnpm install && pnpm test && pnpm build`, then
     `pnpm publish --access public` (or trigger the publish.yml workflow with
     NPM_TOKEN configured).
  Each step ends with "verify by..." a runnable check.
- **D-10: Kit `package.json` shape.** Required fields per KIT-05:
  - `name`: `"@{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}"`
  - `version`: `"0.1.0"` (matches parent — D-21)
  - `type`: `"module"`
  - `main` / `module` / `types` / `exports` map for dual ESM+CJS
  - `files`: `["dist", "README.md", "LICENSE", "CUSTOMIZING.md"]`
  - `scripts`: `build` (tsup), `test` (vitest run), `lint` (eslint),
    `typecheck` (tsc --noEmit), `prepublishOnly` (build + test)
  - `peerDependencies`: `{ "@cosyte/hl7-parser": ">=0.1.0" }`
  - `peerDependenciesMeta`: optional false (parser is required)
  - `devDependencies`: `@cosyte/hl7-parser`, `tsup`, `typescript`, `vitest`,
    `eslint`, `@types/node`
  - `publishConfig`: `{ "access": "public" }`
  - `engines`: `{ "node": ">=18" }`
  No `dependencies` (parser is peer; no runtime deps).
- **D-11: Parent CI gates the kit.** Parent `.github/workflows/ci.yml` gains
  a job (or job step) that runs:
  ```yaml
  - name: Starter kit smoke
    working-directory: examples/profile-starter-kit
    run: |
      pnpm install --no-frozen-lockfile
      pnpm test
      pnpm build
  - name: Validate kit workflows
    run: actionlint examples/profile-starter-kit/.github/workflows/*.yml
  ```
  Resolves `@cosyte/hl7-parser` peerDep to the parent via a top-level
  `pnpm-workspace.yaml` listing `examples/profile-starter-kit` as a workspace
  package + `link-workspace-packages=true` in `.npmrc`. Planner confirms
  whether adding `pnpm-workspace.yaml` to a previously-non-workspace repo
  causes any breakage in the parent's `pnpm install`; if so, the kit job uses
  a `pnpm install --filter` invocation instead. KIT-02/03/04 thus become
  enforceable green-or-red signals on every PR. Adds ~30s to CI.

### README + Cookbook (DOC-01..13)

- **D-12: Single comprehensive `README.md`.** Everything in one file: value
  prop, badges, quickstart, feature list, "HL7 in 90 seconds", three access
  patterns, full cookbook, top-level Profiles section, Real-World Tolerance
  section + table + runnable example, Error Handling, Contributing, footer.
  Estimated ~1000-1400 lines. npm and GitHub render the same. Cookbook is
  inline. `Ctrl+F`-friendly. Lean+docs/ split (D-12 alt B) is rejected for
  v1; revisit if README crosses ~2000 lines.
- **D-13: Cookbook recipe depth = snippet + 1-2 sentence explanation.** Each
  recipe under DOC-06 gets:
  - One H3 heading naming the recipe
  - 5-15 line TS code snippet in a fenced ```ts block
  - 1-2 sentences explaining what the API does + one common variant inline
  Estimated cookbook subtotal: ~300-500 lines. DOC-06's recipe list is the
  ordered TOC (planner confirms exact order during planning).
- **D-14: TypeScript-only code samples.** All snippets are `.ts`. Library is
  TS-first; types are part of the value prop; tsx runs `.ts` natively. JS
  users can drop the type annotations. No tabbed TS/JS duplication. Imports
  use the published name `@cosyte/hl7-parser` even though the package isn't
  published yet at phase end (the imports are aspirational + match what
  consumers will write).
- **D-15: README cookbook snippets are CURATED — not auto-extracted from
  /examples/.** README cookbook focuses on the API call (5-15 lines, no
  imports if context allows; or one import line at the top of the snippet).
  /examples/*.ts are full runnable scripts with imports + `console.log`
  output. Some duplication is accepted; each format optimizes for its medium.
  Smoke script verifies /examples/ (D-04). README code is verified by reading
  during phase verification. No build-time extractor.
- **D-16: One ASCII tree visual in "HL7 in 90 seconds".** Shows
  MSH/PID/PV1/OBR/OBX hierarchy in <20 lines. Renders everywhere. The 4-tier
  tolerance section (DOC-08) uses an ASCII Markdown table. No Mermaid (npm
  doesn't render); no asciinema (hosting overhead).
- **D-17: Badges under DOC-01 = npm version + CI status + license + Node
  version.** Four shields.io badges in this order, on the line after the
  one-sentence value prop. The npm version badge will 404 until the package
  is published; planner uses the standard shields.io URL that gracefully
  shows "no published version" until then.
- **D-18: `CONTRIBUTING.md` lives at repo root; v2 roadmap is a README
  section.** DOC-10 wants a "Contributing" README section linking to
  CONTRIBUTING.md — so CONTRIBUTING.md is required at root. v2 roadmap
  (DOC-12) lives inline in README under `## Roadmap` enumerating the
  PROJECT.md "Out of Scope (v1)" list verbatim. Keeps everything one click
  away.
- **D-19: CONTRIBUTING.md depth = light, vendor-quirk-fixture-friendly.**
  Sections: how to file an issue, how to open a PR, dev setup (`pnpm install`
  + the standard pipeline from CLAUDE.md), how to add a vendor-quirk fixture
  (point at `test/fixtures/vendor-quirks/` + the kebab-code naming
  convention from Phase 7 D-12), how to author a profile (point at
  `examples/profile-starter-kit/`), how to publish a standalone profile
  package. ~150 lines. No CLA. No code of conduct (deferred; not in scope).

### Versioning, CHANGELOG, Publish (DOC-12, DOC-14, KIT-04 publish workflow)

- **D-20: First release version = `0.1.0`.** Parent `package.json` and the
  starter kit `package.json` both ship at `0.1.0`. Signals "first real,
  usable release; API may evolve before 1.0". Unblocks the npm-version badge
  (D-17) and the CHANGELOG `[0.1.0]` entry (D-22). 1.0.0 is deferred until
  external production validation lands (PROJECT.md "Validated" is currently
  empty).
- **D-21: Both packages share the `0.1.0` version line.** Kit's
  `peerDependencies: { "@cosyte/hl7-parser": ">=0.1.0" }` matches.
  Future bumps: kit and parent are independently versioned (kit may stay at
  0.1.x while parent moves to 0.2.x), but both START at 0.1.0 to signal a
  unified v1 release.
- **D-22: CHANGELOG starts with empty `[Unreleased]` + populated `[0.1.0]`
  entry.** Keep-a-Changelog format. `[0.1.0]` groups changes by capability
  (NOT by phase number — phase numbers stay in `.planning/` and don't leak
  into public docs):
  - **Added** — Parser (lenient default + strict mode), warning system (13
    Tier-2 codes), 4 fatal codes, structural model + composite types
    (XPN/XAD/CX/CWE/etc.), named helpers (`msg.meta`, `msg.patient`,
    `msg.visit`, `msg.observations()`, `msg.orders()`, etc.), serialization
    (toString/toJSON/prettyPrint), `buildMessage()`, profile system
    (`defineProfile()` + `extends` + default profile management), 5 built-in
    vendor profiles (epic, cerner, meditech, athena, genericLab), three
    runnable examples, profile starter kit, comprehensive README + docs.
  - **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security** —
    empty for the initial release.
  Date stamps the release (planner inserts current date when writing).
- **D-23: CHANGELOG updates are manual.** No `changesets`, no
  `release-please`, no Conventional Commits enforcement. Releases are
  infrequent for a parser library; tooling overhead is unjustified pre-1.0.
  CONTRIBUTING.md (D-19) instructs PR authors to add a CHANGELOG entry
  under `[Unreleased]` if user-visible.
- **D-24: Parent publish workflow uses `workflow_dispatch` only.** Add
  `.github/workflows/publish.yml` with:
  - `on: workflow_dispatch`
  - Job runs `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
    `pnpm build`, then `pnpm publish --access public --no-git-checks` using
    `NODE_AUTH_TOKEN` from a `NPM_TOKEN` repo secret.
  - Operator presses the button when ready. No accidental publishes from
    pushes/tags. Tag-gated triggers and Conventional-Commits autorelease
    are deferred to post-1.0 if release cadence increases.
  - The workflow runs `actionlint` against itself in CI (parent CI already
    lints `.github/workflows/`).
- **D-25: Actual `pnpm publish` to npmjs.org is OUT OF SCOPE for Phase 8.**
  Phase 8 lands the workflow + CHANGELOG + LICENSE + README + examples +
  kit + everything-needed-to-publish. The publish *act* (and acquiring the
  `@cosyte` org on npm if not already owned) is a separate post-phase
  manual step, performed outside the planning loop. Verifier MAY run
  `pnpm publish --dry-run` to confirm tarball contents, file allowlist,
  and exports map shape — but does NOT actually publish. Avoids credential
  exposure to agents and keeps the irreversible step under human control.

### Claude's Discretion

- Exact wording of the README one-sentence value prop (DOC-01) — pulled
  from PROJECT.md Core Value, condensed to one sentence under ~120 chars.
- Exact ordering of feature-list bullets (DOC-03, 6-8 bullets) and which
  6-8 the planner chooses from the broader capability set.
- Whether the "HL7 in 90 seconds" section uses an ADT^A01 example vs an
  ORU^R01 example for the ASCII tree (D-16). Recommendation: ADT^A01
  because it's the canonical introductory example.
- Final filename of the modify-and-resend example fixture (D-02 listed
  `adt-mutate-source.hl7` — planner may rename if a clearer name surfaces).
- Whether the kit's `vitest.config.ts` excludes `dist/` and any other
  conventional excludes — pure scaffolding detail.
- The exact `actionlint` invocation in CI (whether installed via `setup-go`
  + `go install`, the official action, or `apt-get`). Recommendation: the
  official `reviewdog/action-actionlint@v1` for low setup cost.
- Whether `examples/README.md` includes a small ASCII table of
  example→demonstrated-feature, or just bullet text. Either fine.
- The exact `npm publish --dry-run` invocation if the verifier runs it
  (D-25) — flags, env, output capture format.
- Whether the parent root has a `pnpm-workspace.yaml` post-phase or the
  kit job uses `--filter` exclusively (D-11). Planner picks based on
  existing-tooling impact.
- Whether `tsx` enters as `tsx` or `tsx@latest` and whether it's pinned.
  Recommendation: caret pin to current (e.g., `^4.x`) — matches parent
  devDep style.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints

- `.planning/PROJECT.md` — North star (one-line extraction), Out of Scope
  list (feeds DOC-12 roadmap section verbatim), Key Decisions (zero runtime
  deps, MIT, Postel's Law).
- `CLAUDE.md` — Engineering guardrails (zero runtime deps, JSDoc with
  @example on every public export, no `console.*` in library code), tech
  stack lock (pnpm + tsup + Vitest + ESLint + Prettier + Node 18+), testing
  pipeline (`pnpm install && pnpm build && pnpm typecheck && pnpm lint &&
  pnpm test`).

### Requirements (locked acceptance criteria)

- `.planning/REQUIREMENTS.md` §Examples — EX-01..03 (the three runnable
  examples and what each demonstrates).
- `.planning/REQUIREMENTS.md` §Profile Starter Kit — KIT-01..07 (file
  inventory, install/build/test contract, workflow validity, package.json
  shape, CUSTOMIZING.md flow, placeholder convention).
- `.planning/REQUIREMENTS.md` §Documentation — DOC-01..15 (every README
  section + CHANGELOG + LICENSE + roadmap requirement).

### Roadmap & success criteria

- `.planning/ROADMAP.md` §Phase 8 — goal + 5 success criteria + the
  parallelization note (3 examples independent, kit one plan, README
  decomposes into quickstart + features + access patterns + cookbook +
  profiles + tolerance + errors + contributing+footer).
- `.planning/STATE.md` — current position (Phase 7 verified, Phase 8 next).

### Prior phase artifacts — Phase 1 (toolchain)

- `package.json` — current scripts/exports/devDeps. Phase 8 ADDS:
  `scripts.examples`, `tsx` devDep, version bump to `0.1.0`, possibly
  `pnpm-workspace.yaml` companion file.
- `tsup.config.ts` — config style the kit's tsup.config.ts mirrors.
- `eslint.config.js` — flat config style the kit copies a slim subset of.
- `vitest.config.ts` — kit's vitest.config.ts mirrors structure (without
  the coverage gate from Phase 7).
- `.github/workflows/ci.yml` — Phase 8 ADDS: `Examples` step (D-04),
  `Starter kit smoke` job/step (D-11), `actionlint` step on kit workflows.
- `LICENSE` — already exists at root (DOC-15 verified satisfied).
- `tsconfig.json`, `tsconfig.build.json` — base TS config; kit's
  `tsconfig.json` is standalone but mirrors the strictness flags.

### Prior phase artifacts — Phase 2..7 (library surface)

- `src/index.ts` — public exports cookbook code imports from
  `@cosyte/hl7-parser`. Planner confirms every API name used in cookbook
  snippets actually exports.
- `src/parser/warnings.ts::WARNING_CODES` — Tier-2 code list referenced in
  the README "Real-World Tolerance" section (DOC-08); compact table
  groups codes by category.
- `src/parser/errors.ts::Hl7ParseError` — referenced in DOC-09 Error
  Handling section.
- `src/profiles/index.ts` — `defineProfile`, `setDefaultProfile`,
  `getDefaultProfile`, `profiles.{epic,cerner,meditech,athena,genericLab}`.
  Cookbook recipes "Write your first profile in 10 minutes", "Extending a
  profile", "Composing profiles", "Publishing a profile package",
  "Default profile" all import from here.
- `src/helpers/*` — `msg.meta`, `msg.patient`, `msg.visit`,
  `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`,
  `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()`. Quickstart
  (DOC-02) and three access patterns (DOC-05) demo these.
- `src/serialize/*` — `toString`, `toJSON`, `prettyPrint`, `buildMessage`.
  Cookbook recipes "modify+reserialize" and "pretty-print" reference these.

### Prior phase context (carry-forward decisions)

- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` — 4-tier
  tolerance model semantics for DOC-08 README section.
- `.planning/phases/04-named-helpers/04-CONTEXT.md` — helper API surface
  and one-line DX promise the README quickstart sells.
- `.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md` — D-08
  toString never wraps MLLP; SER-02 round-trip semantics referenced in
  modify-and-resend example.
- `.planning/phases/06-profile-system-and-built-ins/06-CONTEXT.md` — D-27
  synthetic-data convention (Phase 8 carries forward in D-02 fixture
  authoring), built-in profile names and order.
- `.planning/phases/07-testing-hardening-and-fixtures/07-CONTEXT.md` —
  D-12 vendor-quirks filename = kebab-case warning code (referenced in
  CONTRIBUTING.md "how to add a vendor-quirk fixture" section per D-19).

### External specs (reference only)

- Keep-a-Changelog v1.1.0 — https://keepachangelog.com/en/1.1.0/ — for
  CHANGELOG.md format (DOC-14, D-22).
- Semantic Versioning 2.0.0 — https://semver.org/ — for the 0.1.0
  decision (D-20) and version-bump rules.
- shields.io — https://shields.io/ — for badge URLs (D-17).
- actionlint — https://github.com/rhysd/actionlint — for KIT-04 GitHub
  Actions linting (D-11, D-24).
- pnpm workspaces — https://pnpm.io/workspaces — for D-11
  workspace-package linking pattern.
- npm scope publishing — https://docs.npmjs.com/about-scopes — for
  KIT-05 `publishConfig: { access: public }` requirement.
- tsx — https://tsx.is/ — for D-01 example runner.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `LICENSE` (MIT) at repo root — DOC-15 already satisfied. Phase 8 verifies
  no further action needed.
- `README.md` (current 34-line stub) — to be REPLACED, not extended. The
  current "Pre-release" stub is wholly superseded by the Phase 8 README.
- `tsup.config.ts` / `eslint.config.js` / `vitest.config.ts` — used as
  templates for the kit's slimmer counterparts (D-08).
- `test/fixtures/canonical/*.hl7` — NOT directly imported by examples
  (D-02 keeps `examples/data/` self-contained), but useful as a reference
  when authoring `examples/data/*.hl7` with the same synthetic-data style.
- `src/index.ts` public exports — every cookbook snippet's import line
  routes through here.

### Established Patterns

- **Synthetic data, no PHI** (Phase 6 D-27, Phase 7 D-17). Phase 8
  `examples/data/` and `examples/profile-starter-kit/test/fixtures/`
  carry this forward verbatim.
- **kebab-case filenames** (Phase 7 D-12). Examples use kebab-case:
  `extract-patient-info.ts`, `read-lab-results.ts`, `modify-and-resend.ts`.
- **Per-feature CI step** (Phase 1, Phase 7 D-30). Examples and kit get
  their own steps; not folded into `pnpm test`.
- **Zero new runtime deps** (PROJECT.md, every prior phase). `tsx`,
  `actionlint` action, `pnpm-workspace.yaml` are dev/CI-only.
- **Conservative emitter / Postel's Law** (PROJECT.md, Phase 5 D-08).
  Modify-and-resend example highlights this — round-trip emits spec-clean
  HL7 from quirky input.

### Integration Points

- `package.json` — GAINS `scripts.examples`, `tsx` devDep, version 0.1.0;
  may add `workspaces` field if D-11 picks workspace approach.
- `.npmrc` (NEW or extended) — may gain `link-workspace-packages=true`
  for D-11.
- `pnpm-workspace.yaml` (NEW, possibly) — for D-11 workspace linking.
- `.github/workflows/ci.yml` — GAINS Examples step + Starter kit smoke
  job/step + actionlint step on kit workflows.
- `.github/workflows/publish.yml` (NEW) — D-24 manual-dispatch publish.
- `README.md` — REPLACED entirely (current 34-line stub → comprehensive
  ~1000-1400 line release README).
- `CHANGELOG.md` (NEW) — D-22.
- `CONTRIBUTING.md` (NEW) — D-18, D-19.
- `examples/` (NEW directory) — D-05 layout.
- `examples/profile-starter-kit/` (NEW subtree) — D-08 contents.
- `scripts/run-examples.ts` (NEW) — D-04 smoke script.

</code_context>

<specifics>
## Specific Ideas

- **Quickstart shape (DOC-02) — the 30-second copy-pasteable block:**
  ```ts
  import { parseHL7 } from '@cosyte/hl7-parser';

  const msg = parseHL7(rawHL7);
  console.log(msg.patient.fullName);  // "John Q. Doe"
  console.log(msg.patient.mrn);       // "MRN12345"
  console.log(msg.meta.timestamp);    // Date object
  ```
  Three lines of "useful output" after the import + parse. Sells the
  one-line-extraction value prop immediately.

- **HL7-in-90s ASCII tree (D-16):**
  ```
  Message
   ├── MSH    (header — sender, receiver, type, timestamp)
   ├── EVN    (event details for ADT)
   ├── PID    (patient identification — name, MRN, DOB)
   ├── PV1    (visit — class, location, attending)
   └── OBX×N  (observations — repeats for labs, vitals)

   Each segment   = pipe-delimited (|) fields
   Each field     = caret-delimited (^) components
   Each component = ampersand-delimited (&) subcomponents
  ```

- **Tolerance table shape (DOC-08):**
  ```
  | Tier | Behavior          | When                                | Example codes              |
  |------|-------------------|-------------------------------------|----------------------------|
  | 0    | Silent            | Spec-compliant input                | —                          |
  | 1    | Auto-handled      | Trivial deviation, no warning       | Trailing whitespace tidy   |
  | 2    | Warning           | Recoverable deviation               | MLLP_FRAMING_STRIPPED      |
  | 3    | Fatal (always)    | Unrecoverable structural error      | NO_MSH_SEGMENT             |
  ```
  Followed by the runnable warnings-iteration example:
  ```ts
  const msg = parseHL7(raw);
  for (const w of msg.warnings) {
    console.log(`${w.code} at ${w.position}: ${w.message}`);
  }
  ```

- **modify-and-resend example skeleton (EX-03):**
  ```ts
  import { parseHL7 } from '@cosyte/hl7-parser';
  import * as fs from 'node:fs';

  const raw = fs.readFileSync('examples/data/adt-mutate-source.hl7', 'utf8');
  const msg = parseHL7(raw);

  console.log('Original PV1.3 (location):', msg.get('PV1.3.1'));
  msg.setField('PV1.3.1', 'NEW-WARD');
  console.log('Modified PV1.3 (location):', msg.get('PV1.3.1'));

  const reserialized = msg.toString();
  console.log('--- Re-serialized HL7 ---');
  console.log(reserialized);
  ```

- **Starter kit `src/index.ts` (D-07) shape:**
  ```ts
  import { defineProfile, profiles } from '@cosyte/hl7-parser';

  /** {{PROFILE_NAME}} profile for {{YOUR_ORG}} integrations. */
  export const {{PROFILE_NAME}}Profile = defineProfile({
    name: '{{PROFILE_NAME}}',
    description: 'Profile for {{YOUR_ORG}} HL7 integrations',
    extends: profiles.genericLab,
    customSegments: {
      ZAL: {
        fields: ['allergyId', 'severity', 'verifiedAt'],
      },
    },
    dateFormats: ['yyyy-MM-dd'],
  });
  ```
  Note: `{{PROFILE_NAME}}` must be a valid JS identifier in the export
  position; planner picks an identifier-safe placeholder pattern (e.g.,
  `MyProfile` after rename — CUSTOMIZING.md instructs to find-replace
  `{{PROFILE_NAME}}` with the user's PascalCase profile name).

- **Smoke script `scripts/run-examples.ts` skeleton (D-04) — uses
  `spawnSync` with argv array, NOT `execSync` with shell template:**
  ```ts
  import { spawnSync } from 'node:child_process';
  import * as fs from 'node:fs';

  const examples = fs.readdirSync('examples')
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'));

  const expectedMarkers: Record<string, string> = {
    'extract-patient-info.ts': 'Patient MRN:',
    'read-lab-results.ts': 'Observation',
    'modify-and-resend.ts': 'Re-serialized HL7',
  };

  let failed = 0;
  for (const file of examples) {
    const r = spawnSync('pnpm', ['tsx', `examples/${file}`], {
      encoding: 'utf8',
    });
    const marker = expectedMarkers[file];
    if (r.status !== 0 || (marker && !r.stdout.includes(marker))) {
      console.error(`FAIL ${file}\nstatus=${r.status}\n${r.stderr}`);
      failed++;
      continue;
    }
    console.log(`OK   ${file}`);
  }
  process.exit(failed === 0 ? 0 : 1);
  ```
  Filenames flow as argv to `tsx`, never as shell text — no injection
  surface. Planner may swap `pnpm` for `npx`/direct `tsx` binary if
  cleaner.

- **Publish workflow skeleton (D-24):**
  ```yaml
  name: Publish
  on:
    workflow_dispatch:
  jobs:
    publish:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
        - uses: actions/setup-node@v4
          with:
            node-version: 20
            registry-url: 'https://registry.npmjs.org'
        - run: pnpm install --frozen-lockfile
        - run: pnpm typecheck
        - run: pnpm lint
        - run: pnpm test
        - run: pnpm build
        - run: pnpm publish --access public --no-git-checks
          env:
            NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  ```

- **Parallelization hint for the planner (planner confirms exact split):**
  Plans that can run in parallel:
  - Plan A: examples/ (3 .ts files + data/ + examples/README.md +
    scripts/run-examples.ts + CI wiring)
  - Plan B: examples/profile-starter-kit/ (full subtree + parent CI gate
    for KIT-02/03/04)
  - Plan C: README.md (the comprehensive document)
  - Plan D: CHANGELOG.md + CONTRIBUTING.md + version bump + LICENSE
    verify + publish.yml (small ancillary docs cluster)
  Plans A, B, C, D touch disjoint files and parallelize cleanly. A
  capstone verification plan (Plan E) MAY run last to exercise the full
  pipeline (`pnpm install && pnpm build && pnpm typecheck && pnpm lint
  && pnpm test && pnpm examples`) end-to-end and produce a phase
  verification artifact.

</specifics>

<deferred>
## Deferred Ideas

- **Actual `pnpm publish` to npmjs.org** — D-25. Phase 8 ships the
  workflow + tarball-ready package. The publish act + npm org acquisition
  are post-phase manual steps.
- **GitHub Pages / Docusaurus / VitePress documentation site** — README
  is canonical for v1. Revisit if README crosses ~2000 lines or if API
  reference grows beyond JSDoc/IntelliSense reach.
- **TypeDoc auto-generated API reference** — JSDoc + IntelliSense suffices
  for v1. TypeDoc adds a build artifact + hosting step.
- **README code-block doctest extraction** — D-15. Smoke script verifies
  /examples/; README is verified by reading. Add a doctest extractor only
  if README code rot becomes a real problem.
- **Tabbed TS/JS code samples** — TS-only (D-14). GitHub doesn't render
  real tabs; doubling code blocks is high-cost low-value.
- **`@changesets/cli` / `release-please` / Conventional Commits
  enforcement** — D-23. Manual CHANGELOG suffices pre-1.0.
- **Tag-gated publish trigger (`on: push: tags: v*`)** — D-24. Manual
  dispatch chosen for v0.x to prevent accidents. Revisit at 1.0.
- **CONTRIBUTING.md CLA / Code of Conduct** — D-19. Light contributing
  guide ships; CLA + CoC deferred (no policy yet on either).
- **dependabot / renovate config** — Common but adds PR noise; defer
  until first dep churn surfaces.
- **CodeQL / security scanning workflow** — Defer to a dedicated security
  hardening pass (post-1.0).
- **npm provenance signing** (`--provenance` flag) — Standard practice
  for newer publishes; planner MAY add to publish.yml if confidence is
  high, otherwise defer to post-publish hardening.
- **Separate `@cosyte/hl7-parser-examples` package** — examples ship
  in-repo only; no separate package.
- **Asciinema GIF / video walkthrough** — D-16. ASCII-only visuals for
  v1; revisit if launch marketing demands it.
- **Mermaid diagrams in README** — D-16. npm doesn't render them.
- **Per-recipe permalinks / TOC autogen** — Markdown anchors render fine
  on GitHub and npm; bespoke TOC generation is over-engineering.
- **Internationalized README (zh, ja, etc.)** — Defer indefinitely.
- **README badges beyond the four (D-17)**: bundle size, weekly
  downloads, types — vanity; defer.
- **Working sample identity in starter kit (e.g., `acmelab`)** — D-06.
  Pure placeholders chosen; sample identity rejected for risk of
  accidental publish + namesake confusion.
- **Maximalist starter-kit surface (CONTRIBUTING + CoC + dependabot in
  the kit)** — D-08. Slimmer starter; users add what they need.
- **Auto-extract README cookbook code from /examples/** — D-15. Brittle;
  defer.
- **Lean README + docs/ split** — D-12. Single comprehensive README;
  revisit if README crosses ~2000 lines.
- **Per-fixture README in examples/data/** — One examples/README.md
  covers everything; per-fixture READMEs are over-documentation.
- **Cross-Node version test matrix (Node 18, 20, 22)** — Phase 7
  deferral carries forward; not added in Phase 8.

</deferred>

---

*Phase: 08-examples-starter-kit-and-documentation*
*Context gathered: 2026-04-19*
