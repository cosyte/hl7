# @cosyte/hl7: Project Guide for Claude

## Project

**`@cosyte/hl7`**: a developer-focused HL7 v2 parser + utility library for Node.js/TypeScript, published under the Cosyte brand. Open-source (MIT).

**North star:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out in one line, without reading the HL7 spec.

## Status

- **v2.1 milestone shipped 2026-04-21**: all 12 phases archived (97 v1 requirements delivered). No active milestone; planning v2.2.
- Milestone is a **git milestone, not an npm release**: the package is published on npm and is still pre-alpha, on the `0.0.x`-until-first-alpha ladder. **Never quote a version here** (this line read "not published to npm" until 2026-07-31, several releases after first publish): `npm view @cosyte/hl7 version` is the only source of truth.

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
- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE BARE
  CLI.** `getExitCode.js` in `@arethetypeswrong/cli` opens with `if (!analysis.types) return 0`, so
  the problem list is never consulted and no `--profile`, `--ignore-rules` or config setting reaches
  it. For a package that ships types it means the declarations were **not in the tarball**, which is
  a broken publish reported as a pass. **The race only supplies the condition**: reproduced here with
  zero concurrency (`rm -f dist/index.d.*ts && pnpm attw`, and `rm -rf dist && pnpm attw`), and
  `tsup` writes JS before declarations, so **every** build has a window (2.07s and 2.24s on two clean
  builds here) where `dist/` holds `.mjs`/`.cjs` and no `.d.ts`. So the answer is **not** a lock, a
  lease or a build queue: the gate must be able to say its own inputs were missing, whatever removed
  them. `scripts/attw.mjs` carries **two nets that catch different things**: a preflight that every
  relative path `package.json` promises exists and is non-empty (catches the window, names the file),
  and a post-check on the untyped sentence (catches declarations on disk but excluded from the
  tarball by `files`/`.npmignore`, which the preflight structurally cannot see). The post-check reads
  a string, so `--quiet`, `-f/--format`, `--config-path` and a `.attw.json` setting `quiet`/`format`
  are **refused by option name, wholesale, not by value**. `test/scripts/attw-gate.test.ts` pins both
  nets and the upstream exit-0 itself against the real binary, plus a negative control on a
  well-formed package, so an `attw` upgrade reds the suite rather than letting the net go slack.
  **THE CENSUS IS MANIFESTS, NOT REPO ROOTS.** This repo has two: `package.json` and
  `examples/profile-starter-kit/package.json`, which is a template a consumer publishes from. Derive
  it, do not recall it: `/usr/bin/grep -rl '"attw":' --include=package.json --exclude-dir=node_modules .`

## Standing disciplines (every change)

Mirrors the three disciplines in `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content, the meta-repo `documentation/repos/hl7.md` (bump its
   "last verified" date), and the `ecosystem-map.md` status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a breaking change.
3. **Crew + knowledgebase loop**: if a parser's public API or warning codes change, flag/update the
   matching `crew` healthcare skill (`hl7v2-message-author`) + the KB product doc.
4. **No internal project bookkeeping on a public surface** (founder directive, 2026-07-27). What a
   consumer reads (`README.md`, `docs-content/`, the npm `description`, a release body) says what the
   software does and what changed. Item identifiers (`HL7-N`), phase and wave language, ADR numbers,
   meta-repo paths and "how this got built" commentary belong in the changeset, `CHANGELOG.md`, the
   commit, the PR and the roadmap. It is a **translation** at the boundary, not a deletion, and when
   you strip an identifier off the front of a line, repair the head: a fragment reads worse than the
   text it replaced. Gated by `pnpm check:no-internal-refs`. The gate keys on known project prefixes,
   so **a new programme prefix has to be added to it by hand**; and it catches identifiers, not
   English sentences about our process, so the reviewer still owns half the rule.

   **`src/` JSDoc is public surface too, and is gated.** Doc comments (`/** */`) compile into
   `dist/index.d.ts` / `dist/index.d.cts`, which `files` ships and which every consumer's editor
   renders on hover. So the same rule applies to them, enforced by the same command's third pass,
   which has its own rule array and its own self-tests. **`//` and `/* */` comments are NOT gated
   and identifiers are welcome in them** -- they do not reach `dist`, and that is precisely the line:
   what a _consumer receives_ is public, what only a _maintainer reads_ is not. Two consequences:
   a doc comment is not the place for build-order or "which phase added this" framing, and
   **removing a doc comment to satisfy the gate is a regression**, not a fix -- JSDoc with
   `@example` on every public export is a hard guardrail above, and neither lint nor coverage
   will catch its loss. What the gate CANNOT do is read `dist/` itself: `dist/` is untracked
   build output, so this is a gate on the source of the published text, not on the published text.
