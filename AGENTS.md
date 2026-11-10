# AGENTS.md

`@cosyte/hl7` is our HL7 v2 parser and utility library for Node.js and TypeScript, published on npm
under MIT with zero runtime dependencies. It reads real-world, vendor-quirky messages leniently and
serializes spec-clean HL7, with builders, validation, and vendor profiles on the same model.

## Build and test

Use Node.js 22.22.2 or later (the floor of the shared build tools in `@cosyte/process`) and the
pnpm that `packageManager` in `package.json` pins. The published package itself runs on Node.js 22
or later.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## The gate

Run all of these from the repository root, in this order, before you push. CI runs the same checks.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test
pnpm test:coverage
pnpm quality:check --base origin/main
pnpm test:perf
pnpm build
pnpm attw
pnpm examples
pnpm check:docs
pnpm check:no-emdash
pnpm check:no-internal-refs
pnpm check:documents
pnpm check:process
cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Rules

- Synthetic data only. Real patient data never enters this repository: not in a fixture, a test, a
  log, an issue, or a commit. `pnpm phi-scan` runs on every commit.
- A change under `src/` carries a changeset (`pnpm changeset`); `.changeset/README.md` says which
  bump to pick.
- No em or en dashes anywhere, commit messages included.
- `@cosyte/process` owns the build, test, lint, typecheck and format tools and their versions.
  Three stay direct devDependencies, pinned to the versions it pins: `vitest`, because the tests
  import it; `typescript`, because `scripts/api-surface.ts` uses the compiler API; and `prettier`,
  because Changesets formats `CHANGELOG.md` with the Prettier it finds at the repository root and
  otherwise falls back to its own bundled Prettier 2.

`CLAUDE.md` holds the rules that bind changes here and the failure behind each.
[CONTRIBUTING.md](CONTRIBUTING.md) adds this repository's specifics to the organization's
[contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md).
