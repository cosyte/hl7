# @cosyte/hl7-parser — Project Guide for Claude

This repo is managed with the **GSD (Get Shit Done)** workflow. Planning artifacts live in `.planning/` and are committed with the code.

## Project

**`@cosyte/hl7-parser`** — a developer-focused HL7 v2 parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT).

**North star:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out in one line — without reading the HL7 spec.

See `.planning/PROJECT.md` for full context, requirements, constraints, and key decisions.

## Status

- **Phase 0 — Initialized.** Next: `/gsd-plan-phase 1`
- Roadmap: 8 phases, 97 v1 requirements mapped → see `.planning/ROADMAP.md`

## GSD Workflow

**Config** (`.planning/config.json`):
- Mode: `yolo` (auto-approve plans/execution)
- Granularity: `standard` (5–8 phases, 3–5 plans each)
- Parallelization: enabled
- Plan Check + Verifier + Nyquist Validation: enabled
- Commit docs: yes

**Typical phase loop:**
1. `/gsd-plan-phase N` — decompose phase into plans (with plan-check agent)
2. `/gsd-execute-phase N` — execute plans in parallel where possible, atomic commits
3. `/gsd-verify-work N` — verifier confirms deliverables match phase goal
4. `/gsd-validate-phase N` — Nyquist validation audits test coverage
5. `/gsd-transition` — update PROJECT.md, advance state

**Commands most likely needed:**
- `/gsd-progress` — status + routing
- `/gsd-next` — auto-advance to next logical step
- `/gsd-plan-phase N` — plan a specific phase
- `/gsd-execute-phase N` — execute a planned phase
- `/gsd-discuss-phase N --auto` — clarify context before planning

## Tech Stack (locked)

- **Language:** TypeScript (strict, `noUncheckedIndexedAccess`)
- **Target:** ES2022, dual ESM + CJS via `tsup`
- **Node:** 18+
- **Package manager:** pnpm
- **Testing:** Vitest
- **Linting:** ESLint + Prettier
- **Runtime deps:** **Zero.** Node stdlib only.
- **License:** MIT

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export — feeds IntelliSense.
- Immutable by default. Mutation only via explicit methods (`setField`, `addSegment`, `removeSegment`).
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always emits spec-clean HL7).
- Fatal errors only for unrecoverable structural corruption (4 Tier-3 codes). Everything else is a warning.
- Coverage target: ≥ 90% on `src/parser/`, `src/model/`, `src/helpers/`.

## Key Files

- `.planning/PROJECT.md` — vision, requirements, constraints, decisions
- `.planning/REQUIREMENTS.md` — 97 v1 REQ-IDs with phase traceability
- `.planning/ROADMAP.md` — 8-phase breakdown with success criteria
- `.planning/STATE.md` — current state (what's next)
- `.planning/config.json` — GSD workflow settings

When in doubt, read `.planning/ROADMAP.md` first to understand the phase structure and which phase a change belongs to.
