# @cosyte/hl7

## What This Is

An open-source, developer-focused HL7 v2 parser and utility library for Node.js and TypeScript, published under the Cosyte brand. It lets a developer extract the 10% of HL7 data they actually need with one line of code — while still exposing the full parsed structure for advanced use. The package is both a credibility asset for Cosyte's healthcare integration practice and a production tool used internally on client projects.

## Current State

**Shipped v2.1 on 2026-04-21** — `@cosyte/hl7` 0.1.0 (renamed mid-milestone from `@cosyte/hl7-parser` in Phase 9). Full v1 capability set delivered: parser + tolerance, structural model + composites, named helpers, round-trip serialization, profile system + 5 built-in vendor profiles, comprehensive docs, profile starter kit. 824 tests pass + 14 documented `it.todo`; ≥ 90% per-dir branch coverage on parser/model/helpers/serialize/builder, CI-enforced across Node 18/20/22; tarball dry-run produces 10 files / 346.2kB. Codebase: ~9.1k LOC src + ~8.1k LOC tests.

**Current focus:** Planning v2.2. The v1 functional surface is closed; next-milestone scope is undecided.

## Core Value

**A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.** Validated in v2.1 — the helpers (`msg.patient`, `msg.observations()`, `msg.orders()`, etc.) plus dot-path access plus the lenient-by-default parser delivered the north star. Everything else (full structural access, round-trip serialization, profile system, strict mode) supports it.

## Requirements

### Validated (v2.1)

All 97 v1 REQ-IDs shipped in v2.1. Full requirement traceability preserved in [`milestones/v2.1-REQUIREMENTS.md`](milestones/v2.1-REQUIREMENTS.md).

- ✓ Parse any well-formed HL7 v2.1–v2.8 message into a typed object model — v2.1 (PARSE-01..09, MODEL-01..07, TYPES-01..04)
- ✓ Named helpers for common extractions (`msg.patient.mrn`, `msg.meta.type`, etc.) — v2.1 (HELPERS-01..07)
- ✓ Dot-path accessors (`msg.get('PID.5.1')`) — v2.1 (MODEL-01/02/05)
- ✓ Structural access to every segment, field, component, subcomponent, repetition — v2.1 (MODEL-03/04, TYPES-01..04)
- ✓ Round-trip serialization (parse → modify → `toString()`) produces valid HL7 — v2.1 (SER-01..06)
- ✓ Lenient default parsing with a 4-tier deviation model (silent/warn/fatal/strict-only) — v2.1 (TOL-01..10, PARSE-03 escapes)
- ✓ First-class `defineProfile()` API for vendor- and integration-specific quirks — v2.1 (PROF-01..09)
- ✓ 5 built-in vendor profiles (Epic, Cerner, Meditech, athenahealth, generic lab) — v2.1 (BIP-01..06)
- ✓ Profile starter kit (`examples/profile-starter-kit/`) that ships publishable as-is — v2.1 (KIT-01..07)
- ✓ Zero runtime dependencies; dual ESM + CJS build; strict TypeScript — v2.1 (SETUP-01..06)
- ✓ Three runnable examples + comprehensive README with cookbook — v2.1 (EX-01..03, DOC-01..15)
- ✓ ≥ 90% per-dir branch coverage on parser/model/helpers/serialize/builder, CI-enforced — v2.1 (TEST-01..08)

### Active

No active requirements yet — v2.2 scope to be defined via `/gsd-new-milestone`.

### Out of Scope (v1 — re-audit at v2.2 planning)

- **MLLP framing / network transport** — parser only; future `@cosyte/hl7-mllp`
- **HL7 v3 and CDA** — different spec family entirely
- **FHIR conversion** — future companion package
- **Exhaustive coded-value validation** — we validate structure, not every HL7 table
- **Batch file support (FHS/BHS/BTS/FTS)** — roadmap item, not v1
- **Typed message overlays** (`AdtA01Message` etc.) — roadmap
- **Streaming parser** — roadmap
- **Schema-aware structure validation** — roadmap
- **Type-safe custom-segment field names at call site** — v2 concern (conditional types)

## Context

- **Market gap:** Existing Node HL7 parsers are crusty, weakly typed, abandoned, or require deep HL7 spec knowledge to extract simple fields. The DX bar is low; clearing it by a wide margin is tractable.
- **Real-world tolerance is the credibility gate:** Production messages from Epic, Cerner, Meditech, athenahealth, and regional HIEs routinely violate the published spec. A parser that strictly enforces the spec rejects a meaningful percentage of real messages. The default mode is lenient; deviations surface as warnings with stable codes and positional context — verified in v2.1 against 13 vendor-quirk fixtures.
- **Profiles are a growth loop:** Built-ins cover broad vendor patterns, but real production specs live at the integration level (specific EHR instances, reference labs, HIEs). Every published profile package is a signal of library adoption and a contribution back. The starter kit is designed so publishing a profile takes minutes, not hours — shipped publishable in Phase 8.
- **Dogfooding:** Cosyte uses this internally on client projects, so production hardening isn't theoretical — the library's credibility matches the company's.
- **License choice:** MIT, to maximize adoption. This is a library, not a product.
- **Known carry-forward (no blocker):** 14 `it.todo` entries in `parser-strict-mode-sweep.test.ts` — 7 WARNING_CODES have factories but no parser emit site (intentional fixture-ahead-of-emit posture; auto-promotes when emit lands in a future minor).

## Constraints

- **Language:** TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`). No `any`, no unjustified `as` casts.
- **Target:** ES2022, dual package (ESM + CJS) via `tsup`. Node 18+.
- **Runtime deps:** Zero. Node stdlib only. Dev deps (Vitest, TypeScript, linters) fine.
- **Package manager:** pnpm. Package name: `@cosyte/hl7` (renamed from `@cosyte/hl7-parser` in Phase 9, 2026-04-20). License: MIT.
- **Test coverage:** ≥ 90% per-dir branch coverage on `src/parser/`, `src/model/`, `src/helpers/`, `src/serialize/`, `src/builder/`, CI-enforced across Node 18/20/22.
- **Performance expectation:** 50-segment message parses in < 5ms on a modern laptop (documented, not a CI gate).
- **No console logging in library code.** Throw typed errors or return results.
- **Immutable by default.** Mutation only through explicit methods (`setField`, `addSegment`, `removeSegment`).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lenient parsing is the default, not strict | Production messages violate the spec constantly. Strict-by-default would reject real-world traffic. Strict mode still exists for validators/CI. | ✓ Good — verified across 9 canonical + 14 edge + 13 vendor-quirk fixtures (v2.1) |
| Warnings carry stable string codes + positional context | Developers need to programmatically react to specific deviations (e.g., `MLLP_FRAMING_STRIPPED`, `TIMESTAMP_FALLBACK_FORMAT`). Human messages alone are not enough. | ✓ Good — WARNING_CODES registry stable; `parser-strict-mode-sweep.test.ts` exercises every emitted code (v2.1) |
| Profiles are plain data produced by `defineProfile()` | Built-ins and developer-authored profiles are equal citizens of the same API. Keeps the built-ins honest — anything shipped must be expressible through the public API. | ✓ Good — all 5 built-ins (epic/cerner/meditech/athena/genericLab) ship through `defineProfile()`; BIP-06 fixture-parity tests confirm (v2.1) |
| Serializer always emits spec-clean HL7, regardless of what was parsed | Postel's Law. The parser is liberal; the emitter is conservative. Prevents quirks from propagating downstream. | ✓ Good — SER-02 structural-equivalence sweep + 5 round-trip fixtures green (v2.1) |
| Profile starter kit is a first-class deliverable, not a doc section | The growth loop depends on frictionless publishing. "Copy this directory, customize, `pnpm publish`" is the entire target DX. | ✓ Good — kit ships with green pipeline + actionlint-clean ci.yml/publish.yml (v2.1, Phase 8 Plan 02) |
| Zero runtime dependencies | Healthcare integrations are vetted carefully; every dep is a supply-chain concern. Also forces clean implementation. | ✓ Good — `package.json` has zero `dependencies`; tarball dry-run 10 files / 346.2kB (v2.1) |
| Fail loudly only for unrecoverable structural errors | 4 Tier-3 fatal codes: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Everything else is a warning. | ✓ Good — `parser-malformed-sweep.test.ts` asserts throw+code+position+snippet for each fatal in lenient & strict (v2.1) |
| `setDefaultProfile()` exists but is discouraged | Explicit is usually better than implicit; included for apps that parse a single source. Scoped to current Node process, not shared across workers. | — Pending — too early to judge usage; revisit at v2.2 if dogfooding produces a clear signal |
| Mid-milestone package rename (`hl7-parser` → `hl7`, Phase 9) | The package surface area outgrew the original "parser" name — we ship parser + builder + mutator + serializer + helpers. The name should match the toolkit scope. | ✓ Good — Phase 9 rename clean (1 legacy ref in CHANGELOG breadcrumb only); `pnpm publish --dry-run` clean under new name (v2.1) |
| Coverage gate scenario A (per-dir 90% on core, global 85) | Avoided implicitly gating ungated `profiles/**` while still hardening the core surface. | ✓ Good — gate enforced in CI across Node 18/20/22 since Phase 7 (v2.1) |
| Audit follow-on as discrete phases (10/11/12), not patch commits | v2.1-MILESTONE-AUDIT surfaced tech debt in the paper trail (stale REQUIREMENTS, missing VERIFICATION/VALIDATION). Closing it as separate phases preserved GSD traceability. | ✓ Good — final state: 9/9 verified, 9/9 Nyquist-validated, 97/97 REQs closed; full per-phase audit on disk (v2.1) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-30 after v2.1 milestone close.*
