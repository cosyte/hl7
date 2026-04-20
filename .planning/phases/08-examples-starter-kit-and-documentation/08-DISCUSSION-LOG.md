# Phase 8: Examples, Starter Kit & Documentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 08-examples-starter-kit-and-documentation
**Areas discussed:** Examples + verification, Starter kit identity, README structure + cookbook, Versioning + CHANGELOG + publish

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Examples + verification | How the 3 examples run (tsx vs compiled), fixtures, output, CI gate | ✓ |
| Starter kit identity | Placeholders vs sample identity, profile content, structure, location | ✓ |
| README structure + cookbook | Monolithic vs split, recipe depth, TS vs TS+JS, relationship to /examples/ | ✓ |
| Versioning + CHANGELOG + publish | Version, CHANGELOG seeding, tooling, publish workflow | ✓ |

**User's choice:** All four selected.

---

## Examples + verification

### Q1 — How should the 3 examples be run?

| Option | Description | Selected |
|--------|-------------|----------|
| tsx (Recommended) | `pnpm tsx examples/...ts` — zero-config TS runner, dev-dep only, matches ROADMAP | ✓ |
| Compiled via tsup | Build to dist-examples/, run with node. Closer to consumer reality but adds build step | |
| ts-node | Older alternative; ESM messier than tsx in 2026 | |

**User's choice:** tsx.

### Q2 — Where should the example HL7 fixtures live?

| Option | Description | Selected |
|--------|-------------|----------|
| examples/data/ (Recommended) | Self-contained, copy-pasteable, independent from test/ | ✓ |
| Reuse test/fixtures/canonical/ | DRY but couples examples to test layout | |
| Inline in the .ts file | Ugliest for multi-line HL7; most copyable for blogs | |

**User's choice:** examples/data/.

### Q3 — Output style?

| Option | Description | Selected |
|--------|-------------|----------|
| Narrated console.log (Recommended) | Labeled lines like "Patient MRN: MRN12345" — reads like a tutorial | ✓ |
| Structured JSON dump | Cleaner for piping but less self-explanatory | |
| Mix narrated + final JSON | Most content; caters to both audiences | |

**User's choice:** Narrated console.log.

### Q4 — Verification strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| CI smoke script (Recommended) | scripts/run-examples.ts in CI; asserts exit 0 + marker string | ✓ |
| Manual verify, no CI gate | One-time verify during phase; risks silent rot | |
| CI smoke + README doctest | Adds fragile markdown extractor; forces self-contained README blocks | |

**User's choice:** CI smoke script.

### Q5 — Examples directory layout?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat files + examples/README.md (Recommended) | Matches ROADMAP filename convention; lowest friction | ✓ |
| One subdir per example | More structured but verbose for 3 short examples | |
| Flat files, no examples/README | Less duplication; leans on root README | |

**User's choice:** Flat files + examples/README.md.

### Q6 — Wire smoke script into test or separate?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate `pnpm examples` + CI step (Recommended) | Keeps test fast; failing examples produce clear separate signal | ✓ |
| Fold into `pnpm test` | Simpler but mixes integration with unit | |
| Local-only, no CI | Lighter CI; rot risk returns | |

**User's choice:** Separate `pnpm examples` + CI step.

---

## Starter kit identity

### Q1 — Identity presentation?

| Option | Description | Selected |
|--------|-------------|----------|
| Pure placeholders ({{YOUR_ORG}}/{{PROFILE_NAME}}) (Recommended) | Cleanest copy-paste-and-rename; matches KIT-07 verbatim | ✓ |
| Working sample identity (e.g., 'acmelab') | Smaller find-replace footprint; publish accident risk | |
| Hybrid — sample identity + PLACEHOLDER markers | Best of both; marker noise if shipped | |

**User's choice:** Pure placeholders.

### Q2 — Sample profile content?

| Option | Description | Selected |
|--------|-------------|----------|
| Realistic fictional vendor with Z-segment + quirk (Recommended) | <50 LOC; demonstrates value prop concretely | ✓ |
| Minimal stub — empty profile + trivial fixture | Easy maintain; doesn't sell why publish a profile | |
| Mirrors one of the built-ins | Great teaching tool; risks "just fork built-in" impression | |

**User's choice:** Realistic fictional vendor with Z-segment + quirk.

### Q3 — How tightly mirror parent repo?

| Option | Description | Selected |
|--------|-------------|----------|
| Same conventions, slimmer surface (Recommended) | Familiar to readers of CLAUDE.md; slimmer inventory | ✓ |
| Minimal — build/test only, no lint/publish | Violates KIT-04 — listed for completeness | |
| Maximalist — everything parent has | Scope creep risk | |

**User's choice:** Same conventions, slimmer surface.

### Q4 — Kit location in repo?

| Option | Description | Selected |
|--------|-------------|----------|
| examples/profile-starter-kit/ (Recommended) | Matches KIT-01 path verbatim | ✓ |
| Top-level /profile-starter-kit/ | Prominent but breaks spec path | |
| templates/profile-starter-kit/ | Signals copy-elsewhere; violates spec path | |

**User's choice:** examples/profile-starter-kit/.

### Q5 — Dep wiring (peer vs direct vs file:)?

| Option | Description | Selected |
|--------|-------------|----------|
| peerDependencies + workspace link (Recommended) | Matches KIT-05; CI resolves via pnpm workspace | ✓ |
| Drop peer, add as regular dep | Easier local but breaks profile-package model | |
| file:../.. workspace path | Works locally but ships bad reference | |

**User's choice:** peerDependencies + workspace link.

### Q6 — Kit CI strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Parent CI gates kit (Recommended) | KIT-02/03/04 enforceable on every PR; +30s CI time | ✓ |
| One-time verify, no parent CI gate | Kit can drift silently | |
| Kit's own CI only (template, not live) | Realistic for users; doesn't gate this repo | |

**User's choice:** Parent CI gates kit.

---

## README structure + cookbook

### Q1 — README structure?

| Option | Description | Selected |
|--------|-------------|----------|
| Single comprehensive README (Recommended) | Everything inline; ~1000-1400 lines; same on GitHub + npm | ✓ |
| Lean README + docs/ for cookbook | ~600 README + cookbook in docs/; npm doesn't render docs/ | |
| Lean README + docs/ + Pages site | Out of scope for v1 | |

**User's choice:** Single comprehensive README.

### Q2 — Cookbook depth?

| Option | Description | Selected |
|--------|-------------|----------|
| Snippet + 1-2 sentence explanation (Recommended) | 5-15 line code + context + inline variant; ~300-500 lines | ✓ |
| Snippet only (terse) | Fast scan, lowest maintain; no context for newcomers | |
| Snippet + explanation + variants + see-also | ~800-1200 lines; huge maintenance burden | |

**User's choice:** Snippet + 1-2 sentence explanation.

### Q3 — Code sample language?

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript only (Recommended) | Matches strict-TS guardrails; types are part of value prop | ✓ |
| Both TS + JS (tabbed) | GitHub doesn't tab; double-maintained | |
| JavaScript with JSDoc type imports | Undersells TS investment | |

**User's choice:** TypeScript only.

### Q4 — README cookbook vs /examples/ relationship?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate — README curated, /examples/ full runnable (Recommended) | Each format optimizes for medium; some duplication accepted | ✓ |
| Auto-extract from /examples/ into README | Brittle tooling | |
| README links to /examples/, no inline snippets | Violates DOC-06 spirit | |

**User's choice:** Separate (curated + runnable).

### Q5 — Where do CONTRIBUTING.md and v2 roadmap live?

| Option | Description | Selected |
|--------|-------------|----------|
| CONTRIBUTING.md at root + roadmap as README section (Recommended) | One click; DOC-10 + DOC-12 satisfied inline | ✓ |
| CONTRIBUTING.md + ROADMAP.md both at root | Cleaner separation; roadmap file rarely opened | |
| CONTRIBUTING.md at root, roadmap in docs/ | Inconsistent | |

**User's choice:** CONTRIBUTING.md at root + roadmap as README section.

### Q6 — README badges?

| Option | Description | Selected |
|--------|-------------|----------|
| npm version + CI + license + Node version (Recommended) | Standard 4; shields.io; communicates real + maintained + MIT | ✓ |
| Above + types + bundle size + downloads | More signal, more noise; downloads are vanity | |
| Minimal — CI + license only | Quietest; sacrifices first impression | |

**User's choice:** npm version + CI + license + Node version.

### Q7 — Visual aids?

| Option | Description | Selected |
|--------|-------------|----------|
| ASCII tree in "HL7 in 90 seconds" (Recommended) | Renders everywhere; no hosting; matches DOC-08 compact-table | ✓ |
| Above + Mermaid diagram | npm doesn't render Mermaid; risk of broken appearance | |
| Above + asciinema/GIF | Hosting overhead; defer | |

**User's choice:** ASCII tree only.

---

## Versioning + CHANGELOG + publish

### Q1 — Starting version?

| Option | Description | Selected |
|--------|-------------|----------|
| 0.1.0 (Recommended) | First real usable release; API may evolve pre-1.0 | ✓ |
| 0.0.1 | Undersells what's shipping | |
| 1.0.0 | Premature; no external production validation | |

**User's choice:** 0.1.0.

### Q2 — CHANGELOG seeding?

| Option | Description | Selected |
|--------|-------------|----------|
| [Unreleased] empty + [0.1.0] populated from phase history (Recommended) | Substantive DOC-14 compliance; grouped by capability, not phase | ✓ |
| [Unreleased] empty stub only | Bare compliance; loses v1 narrative | |
| Pre-populated full per-phase log | Phase numbers leak into public docs | |

**User's choice:** [Unreleased] empty + [0.1.0] populated.

### Q3 — CHANGELOG maintenance tooling?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual edits (Recommended) | Low release cadence; no tooling overhead | ✓ |
| Changesets (@changesets/cli) | Overkill for single package, pre-1.0 | |
| release-please / Conventional Commits | Constrains commit style; no signal we want this | |

**User's choice:** Manual edits.

### Q4 — Publish workflow trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual workflow_dispatch only (Recommended) | No accidental publishes; operator-controlled | ✓ |
| Tag-gated (push of v* tag) | Risks mis-tag accidents at v0.x | |
| No publish workflow in v1 | Breaks precedent kit requires via KIT-04 | |

**User's choice:** Manual workflow_dispatch only.

### Q5 — Actual `pnpm publish` in this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer publish; ship workflow + docs (Recommended) | Avoids credential management in agents; irreversible step under human control | ✓ |
| Publish during phase verification | Risky; requires NPM_TOKEN in env | |
| Publish dry-run only | Safe middle ground; verifier may still run it for tarball check | |

**User's choice:** Defer publish; ship workflow + docs (verifier MAY run dry-run).

### Q6 — Ready for CONTEXT.md?

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context (Recommended) | All four areas covered | ✓ |
| Explore more gray areas | Additional topics | |

**User's choice:** I'm ready for context.

---

## Claude's Discretion

Items where planner has flexibility (captured in CONTEXT.md Claude's Discretion):
- Exact README value-prop sentence wording
- Feature-list ordering (6-8 bullets)
- ADT^A01 vs ORU^R01 for the 90s ASCII tree
- Final filename of modify-and-resend fixture
- Kit's vitest.config.ts conventional excludes
- actionlint install mechanism in CI
- examples/README.md bullets vs mini-table
- Exact `npm publish --dry-run` flags if verifier runs it
- Workspace yaml vs --filter-only approach for D-11
- tsx version pin style

## Deferred Ideas

See CONTEXT.md `<deferred>` section for the full list. Highlights:
- Actual npm publish (post-phase manual act)
- Docs site / TypeDoc / doctest extraction
- Changesets / release-please
- Tag-gated publish trigger
- CLA / Code of Conduct / dependabot / CodeQL
- Working sample identity in kit
- Maximalist kit surface
- Auto-extract README from /examples/
- Lean README + docs/ split
- Cross-Node test matrix
