# Phase 9: Rename Package to @cosyte/hl7 - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename the package from `@cosyte/hl7-parser` to `@cosyte/hl7` across every file in the repo (source JSDoc, configs, docs, CHANGELOG, examples, starter kit, publish workflow) so that the first published tag under the new name installs and round-trips cleanly. No new functional behavior; this is a pure identity/naming sweep.

**Key pre-condition:** Neither `@cosyte/hl7-parser` nor `@cosyte/hl7` is published on npm (confirmed 2026-04-20 via `npm view` — both return 404). The rename is purely pre-publish; no legacy-package deprecation, redirect, or alias-package choreography is needed.

</domain>

<decisions>
## Implementation Decisions

### Package Identity
- **D-01:** First publish under `@cosyte/hl7` ships as **`0.1.0`**. `@cosyte/hl7-parser` was never published to npm, so there is no semver continuity to preserve. The bump-to-signal-rename framing doesn't apply when no prior tarball ever reached users.
- **D-02:** `package.json.description` is **rewritten to toolkit framing**: `"Developer-focused HL7 v2 toolkit for Node.js and TypeScript — parser, builder, mutator, serializer, and one-line helpers."` (matches the ROADMAP rationale for the rename — the package is a toolkit, not just a parser).
- **D-03:** `package.json.keywords` **keeps existing entries** (`hl7`, `hl7v2`, `parser`, `healthcare`, `interoperability`, `typescript`) **and adds** `builder`, `serializer`, `toolkit`. `parser` stays for npm-search discoverability.

### Repository & URLs
- **D-04:** GitHub repo is **renamed** `cosyte/hl7-parser` → `cosyte/hl7`. GitHub's auto-redirect covers links to the old slug. `package.json.homepage`, `package.json.bugs.url`, and `package.json.repository.url` are updated in the same rename PR to point at `https://github.com/cosyte/hl7`.
- **D-05:** The actual GitHub repo rename is a **user-side admin action** performed around publish time — it happens outside the code changes. The planner should surface this as an explicit manual step in the phase plan (not a scripted task), but can land the URL updates in the code PR confidently because GitHub auto-redirects until the rename is performed.
- **D-06:** Local working directory (`~/projects/cosyte/hl7-parser`) **stays as-is**. Directory naming is local and not part of the package's identity; renaming it would disrupt open editors/shells and GSD `.planning/` paths for no benefit.

### CHANGELOG
- **D-07:** CHANGELOG.md `[0.1.0]` entry is **rewritten in place** — every `@cosyte/hl7-parser` reference becomes `@cosyte/hl7`, and a short `Notes:` bullet is appended: *"Package renamed from `@cosyte/hl7-parser` to `@cosyte/hl7` before first publish. No consumers existed under the previous name."* This honors ROADMAP success criteria #1 (zero old-name occurrences outside CHANGELOG rename-history) and #4 (CHANGELOG calls out the rename with a migration note) without fabricating a version bump.
- **D-08:** The `Notes:` line above is the **only permitted occurrence of `@cosyte/hl7-parser`** in the entire repo after the sweep. Every other mention is rewritten.
- **D-09:** README `Install` section carries **no migration note**. Nothing was ever published under the old name, so there are no existing installs to migrate. Install instructions simply read `pnpm add @cosyte/hl7`.

### Claude's Discretion
Planner/executor may choose freely on:
- **Rename execution mechanics** — scripted global find/replace (preferred, with an explicit allowlist for the CHANGELOG rename-history line) vs per-file manual edits. Whichever is used, a final `grep -rn "@cosyte/hl7-parser" .` sweep (excluding `node_modules/`, `dist/`, and `.planning/phases/`) must return **exactly one match** (the CHANGELOG `Notes:` line) as an acceptance gate before commit.
- **Wave parallelization** — per ROADMAP parallelization notes, source/configs, docs/examples, and starter-kit sweeps touch disjoint files and can run in parallel; a final publish-verify plan (grep sweep + `pnpm install/build/test/examples` + `pnpm publish --dry-run` under the new name) runs last.
- **Whether to bump the starter kit's own internal name/version** — the starter kit is a template that users copy and rename; its placeholder-based package.json may or may not reference `@cosyte/hl7` as a peer/dev dep. Planner decides based on the actual peer-dep setup landed in Plan 08-02.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec & project context
- `.planning/ROADMAP.md` §"Phase 9: Rename Package to @cosyte/hl7" — phase goal, 5 success criteria, parallelization note (disjoint sweeps + final publish-verify plan)
- `.planning/PROJECT.md` — identity, constraints (zero runtime deps, MIT, strict TS), north star (informs toolkit framing)
- `.planning/REQUIREMENTS.md` — no new REQ-IDs for this phase; rename-only

### Files being renamed (the sweep targets)
- `package.json` — `name`, `description`, `keywords`, `homepage`, `bugs.url`, `repository.url`. Single source of truth for the name; every tooling lookup derives from it.
- `CHANGELOG.md` — `[0.1.0]` entry rewritten in place; `Notes:` breadcrumb added (the ONE permitted occurrence of the old name).
- `README.md`, `CONTRIBUTING.md` — public-facing docs; install snippets + import examples update.
- `src/**/*.ts` (~40 files) — JSDoc `@example` blocks that currently show `import ... from "@cosyte/hl7-parser"`.
- `src/index.ts`, `src/parser/index.ts` — file-header docblocks that name the package explicitly.
- `test/model-public-exports.test.ts` — import-path assertions.
- `tsup.config.ts`, `vitest.config.ts` — config file references (comments/strings).
- `examples/extract-patient-info.ts`, `examples/read-lab-results.ts`, `examples/modify-and-resend.ts`, `examples/README.md` — runnable example imports + docs.
- `examples/profile-starter-kit/**` (6 files: `package.json`, `src/index.ts`, `test/profile.test.ts`, `tsup.config.ts`, `README.md`, `CUSTOMIZING.md`) — starter kit references the parent package as a peer/dev dep.
- `CLAUDE.md` — project guide (header + key-files section reference the old name).

### Files NOT changed by the rename
- `.github/workflows/ci.yml` — does not hardcode the package name; derives everything from `package.json`.
- `.github/workflows/publish.yml` — name-agnostic (runs `pnpm publish`; picks up the new name from package.json). Verify no hardcoded registry URL or package-name string before assuming this holds.
- `.planning/**` — planning artifacts retain historical references (the `grep` exclusion rule).
- `node_modules/**`, `dist/**` — build/install artifacts; regenerated.

### Manual action (outside code changes)
- GitHub repo rename: Settings → General → Rename → `hl7` (user performs around publish time). GitHub auto-redirects `cosyte/hl7-parser` → `cosyte/hl7`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`grep -rln` for verification** — straightforward acceptance gate. Run before commit to confirm only the CHANGELOG `Notes:` line retains the old name.
- **Plan 08-05's publish-verify pipeline** — `pnpm install/typecheck/lint/test/build/examples` + `pnpm publish --dry-run` is already validated green (STATE.md line 5: "tarball dry-run 10 files 346.2kB"). The Phase 9 final plan re-runs this pipeline post-rename to confirm the new name installs cleanly.

### Established Patterns
- **Scoped find-replace is low-risk** — the old name (`@cosyte/hl7-parser`) is a scoped package path; no substring collisions with `@cosyte/hl7` in any current file (confirmed: the new name is strictly a prefix of the old, and no file uses `@cosyte/hl7` standalone today).
- **Docs/tests/source sweeps are disjoint** per ROADMAP parallelization notes — four natural waves: (1) package.json + CHANGELOG + README + CONTRIBUTING (identity files), (2) src/** (JSDoc), (3) examples/** + examples/profile-starter-kit/**, (4) verification (grep sweep + publish-verify pipeline).

### Integration Points
- `package.json.name` is the primary driver — once changed, `pnpm publish` naturally targets `@cosyte/hl7`; no workflow wiring needed.
- `examples/profile-starter-kit/package.json` currently peer/dev-deps on the parent via `file:../..` (STATE.md confirms Path B was chosen in Plan 08-05). After the parent's `name` changes, the file-path dep still resolves — but any literal `@cosyte/hl7-parser` string in the starter kit's `peerDependencies` or `devDependencies` keys must be updated.
- **70 files currently contain `@cosyte/hl7-parser`** (confirmed via grep, excluding `node_modules/`, `dist/`, `.planning/phases/`). Post-sweep target: 1 file (CHANGELOG.md).

</code_context>

<specifics>
## Specific Ideas

- **Acceptance gate phrasing:** "Final `grep -rn '@cosyte/hl7-parser' .` (excluding `node_modules/`, `dist/`, `.planning/phases/`) returns exactly one match — the `CHANGELOG.md` `Notes:` line."
- **CHANGELOG breadcrumb phrasing (exact text for D-07):** `Notes: Package renamed from `@cosyte/hl7-parser` to `@cosyte/hl7` before first publish. No consumers existed under the previous name.`
- **New `package.json.description` (exact text for D-02):** `Developer-focused HL7 v2 toolkit for Node.js and TypeScript — parser, builder, mutator, serializer, and one-line helpers.`
- **New keyword additions (D-03):** `builder`, `serializer`, `toolkit` appended to the existing list.

</specifics>

<deferred>
## Deferred Ideas

- **GitHub repo rename** — not a code change; the user performs it in GitHub Settings around publish time. The code PR lands the new URLs speculatively; GitHub's auto-redirect keeps them working until the rename happens.
- **Local working directory rename** — explicitly scoped out (D-06). No backlog entry needed.
- **No other ideas surfaced during discussion.**

</deferred>

---

*Phase: 09-rename-package-to-cosyte-hl7*
*Context gathered: 2026-04-20*
