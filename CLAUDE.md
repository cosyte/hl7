# @cosyte/hl7 — Project Guide for Claude

## Project

**`@cosyte/hl7`** — a developer-focused HL7 v2 parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT).

**North star:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out in one line — without reading the HL7 spec.

## Status

- **v2.1 milestone shipped 2026-04-21** — all 12 phases archived (97 v1 requirements delivered). No active milestone; planning v2.2.
- Milestone is a **git milestone, not an npm release** — package is still pre-alpha `0.0.x`, not published to npm.

## Tech Stack (the shared `@cosyte/*` standard)

hl7 is the reference parser; it inherits the canonical toolchain by depending on the published
`@cosyte/*` config packages, not by copying files. The source of truth is the meta-repo's
`documentation/conventions.md` — this is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
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
- Coverage: per-directory >= 90% (lines/branches/functions/statements) on `src/parser/`, `src/model/`,
  `src/helpers/`, `src/serialize/`, `src/builder/`, enforced by `pnpm test:coverage`.

## Standing disciplines (every change)

Mirrors the three disciplines in `documentation/conventions.md` — they bind here too:

1. **Documentation follows code** — a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content, the meta-repo `documentation/repos/hl7.md` (bump its
   "last verified" date), and the `ecosystem-map.md` status table.
2. **Version + changelog** — a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a breaking change.
3. **Crew + knowledgebase loop** — if a parser's public API or warning codes change, flag/update the
   matching `crew` healthcare skill (`hl7v2-message-author`) + the KB product doc.
