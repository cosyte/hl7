# Milestones — @cosyte/hl7

Historical record of shipped versions. Each entry is a one-screen summary; full details live in `.planning/milestones/v[X.Y]-ROADMAP.md` and `.planning/milestones/v[X.Y]-REQUIREMENTS.md`.

---

## v2.1 — HL7 v2 Toolkit (initial public release)

**Shipped:** 2026-04-21
**Tag:** `v2.1`
**Phases:** 12 (Phases 1–9 v1 functional + Phases 10–12 v2.1 audit follow-on)
**Plans:** 59
**Git range:** `2077650` → `4aef4a3`
**Timeline:** 2026-04-18 → 2026-04-21 (4 days)

**Delivered:** the inaugural release of `@cosyte/hl7` (0.1.0) — a developer-focused HL7 v2 parser + utility library for Node.js/TypeScript with one-line helpers (`msg.patient.mrn`, `msg.observations()`, etc.), full structural access, lenient-by-default parsing with a 4-tier deviation model, round-trip serialization, a first-class `defineProfile()` API + 5 built-in vendor profiles (Epic/Cerner/Meditech/athena/genericLab), comprehensive docs, and a publishable profile starter kit.

**Key accomplishments:**
- Parser with 4-tier deviation model (silent/warn/fatal/strict-only); 4 fatal codes; stable WARNING_CODES with positional context.
- Structural model with dot-path access (`msg.get('PID.5.1')`), typed composites (XPN, XAD, CX, CWE/CE, XTN, PL, TS/DTM, NM, HD, XCN), and immutable-by-default mutations via explicit methods.
- North-star helpers: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()`.
- Postel's-Law serialization: `toString()`, `toJSON()`, `prettyPrint()`, `buildMessage()` — parse → mutate → serialize → parse equivalence verified across 9 canonical + 14 edge + 13 vendor-quirk + 4 malformed fixtures.
- Profile system + 5 built-in vendor profiles; starter kit (`examples/profile-starter-kit/`) ships publishable as-is with green in-kit pipeline + actionlint-clean ci.yml/publish.yml.
- 824 tests pass + 14 documented `it.todo`; ≥ 90% per-dir branch coverage on parser/model/helpers/serialize/builder, CI-enforced across Node 18/20/22.
- Zero runtime dependencies; dual ESM + CJS via `tsup`; `pnpm publish --dry-run` produces clean 10-file / 346.2kB tarball under `@cosyte/hl7`.
- Comprehensive README (13 sections) + CHANGELOG (Keep-a-Changelog) + CONTRIBUTING + 3 runnable examples.
- Audit follow-on (Phases 10–12): full paper trail — REQUIREMENTS.md / ROADMAP.md / STATE.md / PROJECT.md resync (Phase 10), retroactive `VERIFICATION.md` for Phases 1/8/9 (Phase 11), retroactive Nyquist `VALIDATION.md` for Phases 1/2/3/7/8/9 (Phase 12). Final state: 9/9 verified, 9/9 Nyquist-validated, 97/97 v1 REQ-IDs closed.

**Stats:**
- Commits: 264 (61 `feat`, 10 `fix`, 132 `docs`)
- Files changed: 388 (+84,137 / −116)
- LOC: ~9.1k src + ~8.1k tests

**Notable decisions:**
- Mid-milestone package rename (`@cosyte/hl7-parser` → `@cosyte/hl7`, Phase 9) — name now reflects toolkit scope, not just parsing.
- Audit-driven gap closure as discrete phases (10/11/12) rather than retroactive patch commits — preserves GSD traceability.
- Coverage gate scenario A (per-dir 90% on core dirs, global stays at 85) avoids implicitly gating ungated `profiles/**` while still hardening the core surface.

**Known carry-forward (no blockers):**
- 14 `it.todo` in `parser-strict-mode-sweep.test.ts` — 7 WARNING_CODES have factories but no parser emit site (intentional fixture-ahead-of-emit, auto-promotes when emit lands).

**Archives:**
- Roadmap: `milestones/v2.1-ROADMAP.md`
- Requirements: `milestones/v2.1-REQUIREMENTS.md`
- Audit (drove Phases 10–12): `milestones/v2.1-MILESTONE-AUDIT.md`

---
