# @cosyte/hl7: Project Guide for Claude

## Project

**`@cosyte/hl7`**: a developer-focused HL7 v2 parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT).

**North star:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out in one line, without reading the HL7 spec.

## Status

- **v2.1 milestone shipped 2026-04-21**: all 12 phases archived (97 v1 requirements delivered). No active milestone; planning v2.2.
- Milestone is a **git milestone, not an npm release**: the package is published on npm and is pre-alpha, below its first stable major. **Never quote a version here** (this line read "not published to npm" until 2026-07-31, several releases after first publish): `npm view @cosyte/hl7 version` is the only source of truth.

## Tech Stack (the shared `@cosyte/*` standard)

hl7 is the reference parser; it inherits the canonical toolchain by depending on the published
`@cosyte/*` config packages, not by copying files. The source of truth is the meta-repo's
`documentation/conventions.md`. This is a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs`, not the bare CLI**: see the guardrail below.
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
- JSDoc (with `@example`) on every public export: feeds IntelliSense.
- Immutable by default. Mutation only via explicit methods (`setField`, `addSegment`, `removeSegment`).
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always emits spec-clean HL7).
- Fatal errors only for unrecoverable structural corruption (4 Tier-3 codes). Everything else is a warning.
- Coverage: per-directory >= 90% (lines/branches/functions/statements) on `src/parser/`, `src/model/`,
  `src/helpers/`, `src/serialize/`, `src/builder/`, enforced by `pnpm test:coverage`.
- **`attw` IS A PUBLISH GATE, AND THIS REPOSITORY RUNS THE SHARED ONE, NOT A COPY.** Bare `attw`
  exits 0 on a package whose tarball carries no types, so the `attw` script runs a gate instead.
  `scripts/attw.mjs` is a **caller** of `@cosyte/script-utils/attw`, pinned to an exact version: it
  passes its own `import.meta.url` to `runAttwGate` and owns nothing else. **What the gate checks,
  what it refuses, and every measurement behind both are documented ONCE, in the docblock at the top
  of `node_modules/@cosyte/script-utils/attw.js`.** Read it there and do not restate it here: a rule
  written in two places drifts. A fix to the gate is a publish of that package and a version bump
  here, never a local edit, and vendoring the body back in re-mints the copy this replaced. The
  caller fails closed: if the shared body cannot be imported it names the specifier and exits 1.
  Two facts stay this repository's own. **The `attw` script body is exactly
  `node scripts/attw.mjs`**, not the bare CLI and not a bin shim. **THE CENSUS IS MANIFESTS, NOT REPO
  ROOTS**, and it is derived, not recalled:
  `/usr/bin/grep -rl '"attw":' --include=package.json --exclude-dir=node_modules .` This repo has
  two, `package.json` and `examples/profile-starter-kit/package.json`, the second a template a
  consumer publishes from. Nothing in CI executes the kit's gate, so
  `test/scripts/attw-gate.test.ts` derives the census and requires every manifest in it to run the
  caller and pin the same exact `@cosyte/script-utils` version as the root. Keep
  `@arethetypeswrong/cli` in both manifests: the gate runs the consuming package's own
  `node_modules/.bin/attw`.

## Standing disciplines (every change)

Mirrors the three disciplines in `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content, the meta-repo `documentation/repos/hl7.md` (bump its
   "last verified" date), and the `ecosystem-map.md` status table.
2. **Version + changelog**: a Changeset per meaningful change, carrying **the bump type the change
   earns**: `minor` when it ADDS behaviour a consumer can call, `patch` when it CORRECTS behaviour.
   Never `major` without a deliberate decision to declare this API stable, because on a `0.x` line
   that is what `major` resolves to. `pnpm tsx scripts/release-readiness.ts` reports what the
   pending queue resolves to and refuses to certify a queue it could not read.
   **The changeset summary IS the changelog entry** and `CHANGELOG.md` is generated output above
   `## Released before this file was generated`: `.changeset/config.json` sets a `changelog`
   generator, so the release writes the version heading and the entry itself. **Do not hand-edit
   `CHANGELOG.md`**, and do not reintroduce a hand-maintained `[Unreleased]` heading: one stood
   there unrolled for the whole published history of this package, which is how a shipped tarball
   came to describe its own contents as unreleased. `test/scripts/changelog-generation.test.ts`
   pins both halves. Renaming a stable warning code is a breaking change.
3. **Crew + knowledgebase loop**: if a parser's public API or warning codes change, flag/update the
   matching `crew` healthcare skill (`hl7v2-message-author`) + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). What a
   consumer reads (`README.md`, `docs-content/`, the npm `description`, a release body) says what the
   software does and what changed. Item identifiers (`HL7-N`), phase and wave language, ADR numbers,
   meta-repo paths and "how this got built" commentary belong in the changeset, `CHANGELOG.md`, the
   commit, the PR and the roadmap. It is a **translation** at the boundary, not a deletion, and when
   you strip an identifier off the front of a line, repair the head: a fragment reads worse than the
   text it replaced. Gated by `pnpm check:no-internal-refs`, which is a **caller**
   (`scripts/check-no-internal-refs.mjs`) over the published `@cosyte/script-utils`
   internal-reference gate, pinned to an exact version. **The rules, the self-test floor and every
   refusal live in that package, in one copy across the estate**; what this repository supplies is
   its axes: the project prefixes, the standards designations that must never be flagged
   (`HL7-V2`, `FHIR-R4`, `DICOM-SR`, `NCPDP-SCRIPT`, `X12-837P`), the public surface, the tarball
   accounting, and its own measured reference material as extra self-test samples. The gate keys on
   known project prefixes, so **a new programme prefix is still added by hand, now in the caller's
   axis list rather than in a local scanner**; a widened rule is caught by the shared floor plus our
   samples; and it catches identifiers, not English sentences about our process, so the reviewer
   still owns half the rule. **It needs `pnpm install` first and fails closed without it**: an
   implementation it cannot reach exits non-zero and never prints the OK line.
   `test/scripts/internal-refs-gate.test.ts` is the differential corpus that proved the swap.

   **`src/` JSDoc is public surface too, and is gated.** Doc comments (`/** */`) compile into
   `dist/index.d.ts` / `dist/index.d.cts`, which `files` ships and which every consumer's editor
   renders on hover. So the same rule applies to them, enforced by the same command's source
   doc-comment pass, which extracts doc blocks alone and runs the same rules over them. **`//` and
   `/* */` comments are NOT gated
   and identifiers are welcome in them** -- they do not reach `dist`, and that is precisely the line:
   what a _consumer receives_ is public, what only a _maintainer reads_ is not. Two consequences:
   a doc comment is not the place for build-order or "which phase added this" framing, and
   **removing a doc comment to satisfy the gate is a regression**, not a fix -- JSDoc with
   `@example` on every public export is a hard guardrail above, and neither lint nor coverage
   will catch its loss. What the gate CANNOT do is read `dist/` itself: `dist/` is untracked
   build output, so this is a gate on the source of the published text, not on the published text.
