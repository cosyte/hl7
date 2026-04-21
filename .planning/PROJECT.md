# @cosyte/hl7

## What This Is

An open-source, developer-focused HL7 v2 parser and utility library for Node.js and TypeScript, published under the Cosyte brand. It lets a developer extract the 10% of HL7 data they actually need with one line of code — while still exposing the full parsed structure for advanced use. The package is both a credibility asset for Cosyte's healthcare integration practice and a production tool used internally on client projects.

## Core Value

**A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.** Everything else (full structural access, round-trip serialization, profile system, strict mode) exists to support that north star.

## Requirements

### Validated

(None yet — ship to validate)

### Active

See `REQUIREMENTS.md` for the full categorized list with REQ-IDs.

**Top-level capabilities:**

- [x] Parse any well-formed HL7 v2.1–v2.8 message into a typed object model _(PARSE-01..09, MODEL-01..07, TYPES-01..04; shipped Phase 2-3)_
- [x] Named helpers for common extractions (`msg.patient.mrn`, `msg.meta.type`, etc.) _(HELPERS-01..07; shipped Phase 4)_
- [x] Dot-path accessors (`msg.get('PID.5.1')`) _(MODEL-01/02/05; shipped Phase 3 Plan 01)_
- [x] Structural access to every segment, field, component, subcomponent, repetition _(MODEL-03/04, TYPES-01..04; shipped Phase 3 Plans 01-03)_
- [x] Round-trip serialization (parse → modify → `toString()`) produces valid HL7 _(SER-01..06; shipped Phase 5)_
- [x] Lenient default parsing with a 4-tier deviation model (silent/warn/fatal/strict-only) _(TOL-01..09, PARSE-03 escapes; shipped Phase 2)_
- [x] First-class `defineProfile()` API for vendor- and integration-specific quirks _(PROF-01..09; shipped Phase 6)_
- [x] 5 built-in vendor profiles (Epic, Cerner, Meditech, athenahealth, generic lab) _(BIP-01..06; shipped Phase 6 Plan 05-06)_
- [x] Profile starter kit (`examples/profile-starter-kit/`) that ships publishable as-is _(KIT-01..07; shipped Phase 8 Plan 02)_
- [x] Zero runtime dependencies; dual ESM + CJS build; strict TypeScript _(SETUP-02/03/04/05/06; shipped Phase 1)_
- [x] Three runnable examples + comprehensive README with cookbook _(EX-01..03, DOC-01..15; shipped Phase 8 Plans 01 + 03-04)_

### Out of Scope (v1)

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
- **Real-world tolerance is the credibility gate:** Production messages from Epic, Cerner, Meditech, athenahealth, and regional HIEs routinely violate the published spec. A parser that strictly enforces the spec rejects a meaningful percentage of real messages. The default mode is lenient; deviations surface as warnings with stable codes and positional context.
- **Profiles are a growth loop:** Built-ins cover broad vendor patterns, but real production specs live at the integration level (specific EHR instances, reference labs, HIEs). Every published profile package is a signal of library adoption and a contribution back. The starter kit is designed so publishing a profile takes minutes, not hours.
- **Dogfooding:** Cosyte uses this internally on client projects, so production hardening isn't theoretical — the library's credibility matches the company's.
- **License choice:** MIT, to maximize adoption. This is a library, not a product.

## Constraints

- **Language:** TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`). No `any`, no unjustified `as` casts.
- **Target:** ES2022, dual package (ESM + CJS) via `tsup`. Node 18+.
- **Runtime deps:** Zero. Node stdlib only. Dev deps (Vitest, TypeScript, linters) fine.
- **Package manager:** pnpm. Package name: `@cosyte/hl7` (renamed from `@cosyte/hl7-parser` in Phase 9, 2026-04-20). License: MIT.
- **Test coverage:** ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/helpers/`.
- **Performance expectation:** 50-segment message parses in < 5ms on a modern laptop (documented, not a CI gate).
- **No console logging in library code.** Throw typed errors or return results.
- **Immutable by default.** Mutation only through explicit methods (`setField`, `addSegment`, `removeSegment`).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lenient parsing is the default, not strict | Production messages violate the spec constantly. Strict-by-default would reject real-world traffic. Strict mode still exists for validators/CI. | — Pending |
| Warnings carry stable string codes + positional context | Developers need to programmatically react to specific deviations (e.g., `MLLP_FRAMING_STRIPPED`, `TIMESTAMP_FALLBACK_FORMAT`). Human messages alone are not enough. | — Pending |
| Profiles are plain data produced by `defineProfile()` | Built-ins and developer-authored profiles are equal citizens of the same API. Keeps the built-ins honest — anything shipped must be expressible through the public API. | — Pending |
| Serializer always emits spec-clean HL7, regardless of what was parsed | Postel's Law. The parser is liberal; the emitter is conservative. Prevents quirks from propagating downstream. | — Pending |
| Profile starter kit is a first-class deliverable, not a doc section | The growth loop depends on frictionless publishing. "Copy this directory, customize, `pnpm publish`" is the entire target DX. | — Pending |
| Zero runtime dependencies | Healthcare integrations are vetted carefully; every dep is a supply-chain concern. Also forces clean implementation. | — Pending |
| Fail loudly only for unrecoverable structural errors | 4 Tier-3 fatal codes: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Everything else is a warning. | — Pending |
| `setDefaultProfile()` exists but is discouraged | Explicit is usually better than implicit; included for apps that parse a single source. Scoped to current Node process, not shared across workers. | — Pending |

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
*Last updated: 2026-04-20 (Phase 10 gap-closure Plan 10-03 Task 4 — capabilities checklist 11/11 flipped to `[x]` with REQ-ID traceability; package-name references updated post-Phase-9 rename to `@cosyte/hl7`.)*
