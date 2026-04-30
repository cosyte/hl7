# Phase 9: Rename Package to @cosyte/hl7 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 09-rename-package-to-cosyte-hl7
**Areas discussed:** Repo slug & URLs, Version at first publish, Package identity drift, CHANGELOG treatment

---

## Gray-Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Repo slug & URLs | GitHub repo rename + package.json URL fields | ✓ |
| Version at first publish | 0.1.0 vs 0.2.0 vs 1.0.0 | ✓ |
| Package identity drift | description + keywords (parser → toolkit framing) | ✓ |
| CHANGELOG treatment | Rewrite 0.1.0 entry vs add new [Unreleased] rename entry | ✓ |

**User's choice:** All four areas selected.

**Precondition established before discussion:** `npm view @cosyte/hl7-parser` and `npm view @cosyte/hl7` both returned 404 → neither name was ever published → the "legacy package disposition" question (deprecate, redirect, alias) was moot and never presented.

---

## Repo Slug & URLs

### Q1: GitHub repo slug and package.json URL fields

| Option | Description | Selected |
|--------|-------------|----------|
| Rename repo + update URLs | Rename github.com/cosyte/hl7-parser → cosyte/hl7 (auto-redirect), update homepage/bugs/repository in package.json. Requires user-side GitHub admin action. | ✓ |
| Keep repo slug, update URLs only where needed | Repo stays cosyte/hl7-parser. URLs stay pointing at old slug. Decoupled from package name. | |
| Keep repo slug but normalize URLs to /hl7 path | Leave repo name today but update URLs to future /hl7 path. URLs 404 until rename happens. | |

**User's choice:** Rename repo + update URLs.

### Q2: Local working directory path

| Option | Description | Selected |
|--------|-------------|----------|
| Leave local dir alone | Directory name is local — doesn't affect package name. Renaming disrupts open editors/shells and GSD .planning paths. | ✓ |
| Rename local dir to hl7/ | Also rename working directory to match. | |

**User's choice:** Leave local dir alone.

**Notes:** Repo rename is a user-side admin action separate from the code PR. URL updates land in the code PR; GitHub auto-redirect keeps them working until the rename is performed.

---

## Version at First Publish

### Q1: Version for first publish under @cosyte/hl7

| Option | Description | Selected |
|--------|-------------|----------|
| 0.1.0 | Keep current version. `@cosyte/hl7-parser` was never published, so no semver continuity to preserve. | ✓ |
| 0.2.0 (bump for rename) | Treat rename as breaking change from the dry-run 0.1.0 tarball. | |
| 1.0.0 (commit to stability) | Mark rename as stability milestone. Breaking changes then require 2.0.0. | |

**User's choice:** 0.1.0.

**Notes:** No semver-continuity concern exists when no prior tarball ever reached users.

---

## Package Identity Drift

### Q1: Rewrite package.json.description?

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite to toolkit framing | "Developer-focused HL7 v2 toolkit for Node.js and TypeScript — parser, builder, mutator, serializer, and one-line helpers." | ✓ |
| Minimal edit: replace 'parser' with 'toolkit' | Tweak existing sentence, lower churn. | |
| Leave description alone | Only the name changes. Leaves npm result claiming 'parser' while name says 'hl7'. | |

**User's choice:** Rewrite to toolkit framing.

### Q2: Keywords changes?

| Option | Description | Selected |
|--------|-------------|----------|
| Add toolkit-era keywords | Keep existing + add builder, serializer, toolkit. 'parser' stays for SEO. | ✓ |
| Replace 'parser' with 'toolkit' + add builder/serializer | Drop 'parser' — cleaner identity, loses SEO on 'hl7 parser' searches. | |
| Leave keywords alone | No change. | |

**User's choice:** Add toolkit-era keywords.

---

## CHANGELOG Treatment

### Q1: How to handle CHANGELOG.md given 0.1.0 was never published

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite 0.1.0 in place to use new name | Replace old-name references in the [0.1.0] entry + append a short `Notes:` bullet about the rename. | ✓ |
| Leave 0.1.0 entry as-is + add [Unreleased] rename entry above | Preserves literal breadcrumb that the name changed pre-publish. More historical fidelity, but old name appears in CHANGELOG. | |
| Bump to 0.2.0 and write rename as its own entry | Only viable if version bumped. Already chose 0.1.0. | |

**User's choice:** Rewrite 0.1.0 in place.

### Q2: README Install section migration note

| Option | Description | Selected |
|--------|-------------|----------|
| No migration note | Nothing was published under old name — no installs to migrate. | ✓ |
| Add a one-line breadcrumb | Help anyone who saw an earlier draft. | |

**User's choice:** No migration note.

---

## Execution Mechanics (deferred to planner)

### Q1: Write CONTEXT.md now, or discuss execution mechanics first?

| Option | Description | Selected |
|--------|-------------|----------|
| Write CONTEXT.md | Planner decides rename mechanics. Default: scripted global replace with CHANGELOG exclusion + final grep sweep. | ✓ |
| Discuss execution mechanics first | Explore scripted vs manual, grep-sweep acceptance gate, wave parallelization. | |

**User's choice:** Write CONTEXT.md.

---

## Claude's Discretion

- **Rename execution mechanics** — scripted find/replace preferred, with explicit CHANGELOG allowlist rule and final grep-sweep acceptance gate
- **Wave parallelization** — ROADMAP's disjoint-sweep guidance (source/docs/starter-kit) applies; planner structures the plans
- **Starter-kit internal references** — whether `peerDependencies`/`devDependencies` entries in `examples/profile-starter-kit/package.json` need updates depends on the actual Plan 08-02 setup; planner verifies and decides

## Deferred Ideas

- GitHub repo rename is a manual user-side admin action (not a scripted plan task)
- Local working directory rename — explicitly scoped out
