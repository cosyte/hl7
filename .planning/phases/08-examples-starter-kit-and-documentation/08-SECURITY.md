---
phase: 8
slug: examples-starter-kit-and-documentation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-20
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| smoke runner ↔ example filename | `scripts/run-examples.ts` enumerates `examples/*.ts` and spawns each file via `spawnSync` argv. | Filenames (trusted repo contents) |
| example script ↔ fixture file | Each example reads a static `.hl7` fixture from `examples/data/`. | Synthetic HL7 messages (no PHI) |
| kit CI workflow ↔ kit repo contents | `examples/profile-starter-kit/.github/workflows/ci.yml` runs on push/PR against unprivileged checkout. | Source only; no write scope |
| publish workflow ↔ npm registry | `publish.yml` (parent + kit) pushes built tarball to npmjs.org using `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`. | Tarball + provenance attestation |
| kit placeholder tokens ↔ npm `name` | `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` must not be published as-is; `pnpm publish --dry-run` in CUSTOMIZING step 5 is last-chance check. | Package manifest |
| README code blocks ↔ users | Users copy-paste TS snippets from README into their own code. | Public API names |
| README badges ↔ shields.io | Public GET requests; no auth, no secrets in URLs. | Public metadata |
| CHANGELOG ↔ release history truth | Human-maintained; capability claims must match `src/index.ts` exports. | Capability tokens only |
| CONTRIBUTING ↔ external devs | Setup commands must match CLAUDE.md verbatim. | Developer instructions |
| CI workflow ↔ kit workflow actionlint | `reviewdog/action-actionlint@v1` lints kit workflow files; unprivileged. | Lint output to CI log |
| `pnpm install` + `tsx` devDep | `tsx` (^4.x) is an established ESM-loader package; supply-chain risk pinned by lockfile. | Third-party package bytes |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-08-01 | T/E | `scripts/run-examples.ts` | mitigate | `spawnSync("pnpm", ["tsx", \`${EXAMPLES_DIR}/${file}\`], ...)` — argv array, never shell template (D-04). Verified at `scripts/run-examples.ts:37`. | closed |
| T-08-02 | I | `examples/data/*.hl7` | accept | Synthetic identifiers only (`MRN12345` / `Doe^John^Q` / etc.). No PHI. Phase 6 D-27 / Phase 7 D-17 carry-forward. | closed |
| T-08-03 | D | smoke-runner child process | accept | `stdio: ["ignore", "pipe", "pipe"]`; bounded to 3 example files; no network I/O. Verified at `scripts/run-examples.ts:38-40`. | closed |
| T-08-04 | S | Example `import` path | accept | Examples `import { parseHL7 } from "@cosyte/hl7-parser"` — self-resolution via `exports` map (D-14). No registry call at example runtime. | closed |
| T-08-05 | E | `examples/profile-starter-kit/.github/workflows/publish.yml` trigger | mitigate | `on: workflow_dispatch:` ONLY — no `push`, `tag`, `release`, `schedule`, `pull_request` (D-24). Verified at `publish.yml:3-4`. | closed |
| T-08-06 | I | `NPM_TOKEN` secret (kit publish) | mitigate | `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` scoped to single "Publish to npm" step's `env`, not job-level. Verified at kit `publish.yml:44-47`. | closed |
| T-08-07 | S | Placeholder-as-published `name` | mitigate | CUSTOMIZING.md step 5 runs `pnpm publish --dry-run --access public` — surfaces uncustomized `{{YOUR_ORG}}` before credential leak. Verified at `CUSTOMIZING.md:121`. | closed |
| T-08-08 | T | Peer-dep import `@cosyte/hl7-parser` | accept | Attack surface is npm registry integrity — same risk as any npm dep. Mitigated by lockfile post-customization; `peerDependencies` pinned in kit `package.json:38-40`. | closed |
| T-08-09 | E | CI workflow permissions (kit) | mitigate | Kit `ci.yml:13-14` → `permissions: contents: read`; kit `publish.yml:6-8` → `contents: read, id-token: write` (enables provenance). No unnecessary write scopes. | closed |
| T-08-10 | I | `ZAL` sample fixture | accept | `MRN-KIT-001` / `Doe^John^Q` — synthetic, no PHI. Phase 6 D-27 / Phase 7 D-17 carry-forward. | closed |
| T-08-11 | T | Cookbook code snippets | mitigate | Every API name in `README.md` cross-checked against `src/index.ts:21-156` and `src/model/message.ts`. No speculative APIs. Acceptance "no JS fences" verified. | closed |
| T-08-12 | I | Badge URLs | accept | `README.md:5-8` — four shields.io badges; public infra; no secrets in URLs. | closed |
| T-08-13 | R | DOC-13 dual-link to kit | mitigate | `README.md:291` (kit path) + `README.md:302` (CUSTOMIZING.md) both present; DOC-13 dual-link requirement met. | closed |
| T-08-14 | I | Prose claims about library scope | accept | All claims ("zero runtime deps", "dual ESM+CJS", "5 built-in profiles") verified against `PROJECT.md` + `package.json` + `src/profiles/index.ts`. | closed |
| T-08-15 | T | CHANGELOG capability claims | mitigate | Every capability in `### Added` (parseHL7, WARNING_CODES, FATAL_CODES, profiles.{epic,cerner,meditech,athena,genericLab}, defineProfile, buildMessage, setDefault/getDefaultProfile, prettyPrint, toJSON, toString, setField/addSegment/removeSegment) verified against `src/index.ts` + REQUIREMENTS.md. Verified in `CHANGELOG.md:30-104`. | closed |
| T-08-16 | R | CONTRIBUTING Dev setup pipeline | mitigate | `CONTRIBUTING.md:37-43` lists `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` — matches CLAUDE.md exactly. | closed |
| T-08-17 | I | PHI leakage via CHANGELOG | accept | `### Added` lists capability tokens only; no fixture content; no PHI. | closed |
| T-08-18 | T | LICENSE tampering | mitigate | `LICENSE` — valid MIT text, "Copyright (c) 2026 Cosyte". Task was verification-only; no edit. | closed |
| T-08-19 | E | Parent `publish.yml` trigger | mitigate | `on: workflow_dispatch:` ONLY — no `push`, `tag`, `release`, `schedule` (D-24). Verified at `.github/workflows/publish.yml:3-4`. | closed |
| T-08-20 | I | `NPM_TOKEN` secret (parent) | mitigate | `NODE_AUTH_TOKEN` scoped to single "Publish to npm" step's `env` block. Verified at parent `publish.yml:44-47`. | closed |
| T-08-21 | T | Provenance attestation | mitigate | `package.json:46-49` → `publishConfig.provenance: true`; parent `publish.yml:6-8` → `permissions: id-token: write`. pnpm emits signed provenance on publish. | closed |
| T-08-22 | T | New `tsx` devDep supply chain | accept | `package.json:74` → `"tsx": "^4.0.0"` caret-pinned; `pnpm-lock.yaml` pins `tsx@4.21.0`. Post-1.0 may add dependabot/renovate. | closed |
| T-08-23 | I | CI log secret leakage | mitigate | No `set -x`, no `echo $NODE_AUTH_TOKEN` or `$NPM_TOKEN` anywhere under `.github/workflows/`. Token never referenced outside scoped `env` at publish.yml:46-47. GitHub masks secrets. | closed |
| T-08-24 | E | `pnpm publish --dry-run` by verifier | accept | Inherently read-only — prints tarball manifest; no registry write; no token needed. Referenced only in CUSTOMIZING.md step 5. | closed |
| T-08-25 | T | Kit workflow validation gap | mitigate | Parent `.github/workflows/ci.yml:72-76` runs `reviewdog/action-actionlint@v1` — lints both kit `ci.yml` and `publish.yml` on every PR. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-08-02 | Examples ship only synthetic HL7 fixtures (no PHI); policy D-02 / D-27 carry-forward. | gsd-security-auditor | 2026-04-20 |
| AR-08-02 | T-08-03 | Smoke runner bounded to 3 fixed example files; stdio piped; no network. | gsd-security-auditor | 2026-04-20 |
| AR-08-03 | T-08-04 | Example `import` resolves via package `exports` map — no external registry call at runtime. | gsd-security-auditor | 2026-04-20 |
| AR-08-04 | T-08-08 | Kit imports parent package by name; npm registry trust is universal; lockfile mitigation at kit user's site. | gsd-security-auditor | 2026-04-20 |
| AR-08-05 | T-08-10 | Kit sample fixture uses synthetic identifiers only; D-07 / D-27. | gsd-security-auditor | 2026-04-20 |
| AR-08-06 | T-08-12 | Badge URLs are public shields.io GETs; no secret tokens embedded. | gsd-security-auditor | 2026-04-20 |
| AR-08-07 | T-08-14 | Prose scope claims verified against source of truth (PROJECT.md, package.json, src/profiles/index.ts). | gsd-security-auditor | 2026-04-20 |
| AR-08-08 | T-08-17 | CHANGELOG contains capability tokens only; no PHI vector. | gsd-security-auditor | 2026-04-20 |
| AR-08-09 | T-08-22 | `tsx` is an established esbuild-based ESM loader; caret-pinned + lockfile. Post-1.0 may add automated dep monitoring. | gsd-security-auditor | 2026-04-20 |
| AR-08-10 | T-08-24 | `pnpm publish --dry-run` is read-only; no registry write; no token required. | gsd-security-auditor | 2026-04-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-20 | 25 | 25 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-20
