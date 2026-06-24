# @cosyte/hl7 — Project Guide for Claude

## Project

**`@cosyte/hl7`** — a developer-focused HL7 v2 parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT).

**North star:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out in one line — without reading the HL7 spec.

## Status

- **v2.1 milestone shipped 2026-04-21** — all 12 phases archived (97 v1 requirements delivered). No active milestone; planning v2.2.
- Milestone is a **git milestone, not an npm release** — package is still pre-alpha `0.0.x`, not published to npm.

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
