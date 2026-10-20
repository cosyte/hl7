# @cosyte/hl7

`@cosyte/hl7` is our HL7 v2 parser and utility library for Node.js and TypeScript, published to npm under MIT. It reads real-world, vendor-quirky messages leniently (a warning, not a throw, for anything short of structural corruption) and serializes spec-clean HL7, with builders, validation and vendor profiles on the same model. It has zero runtime dependencies, and this repository is public.

## Gate

From the repo root, in this order, with pnpm 10 (the `packageManager` pin). Where `pnpm --version` prints another major, put the pinned one first on PATH, since pnpm 12 refuses the frozen install and tests shell out to bare `pnpm`: `mkdir -p ~/.pnpm10 && corepack enable --install-directory ~/.pnpm10 pnpm && export PATH="$HOME/.pnpm10:$PATH"`.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm phi-scan
pnpm test
pnpm test:coverage
pnpm build
pnpm attw
pnpm examples
pnpm check:docs
pnpm check:no-emdash
pnpm check:no-internal-refs
cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

The first nine are the shared `cosyte/.github` CI ladder, run on Node 22 and 24. CI alone also loads `dist/` as ESM and as CJS, runs actionlint and CodeQL, and packs the tree and installs the tarball into a clean directory.

## Hazard

Every message this library reads can carry a patient's identity and clinical record. The failure that hurts is the quiet one: a field parsed wrong but plausible travels downstream as an allergy nobody sees or a dose that is off, and nothing flags it. When a value is in doubt, warn rather than guess, and keep message text out of errors, warnings and logs.

## Rules that bind here

Each names the failure that put it here.

- Errors, warnings and model identifiers (`Segment.type`, `Hl7Message.version`) carry bounded tokens from `src/parser/tokens.ts`, never raw message text: a name and a record number once reached `Hl7ParseWarning.message` (#70).
- Both `attw` scripts (root and `examples/profile-starter-kit`) stay exactly `node scripts/attw.mjs`: bare `attw` exits 0 on a tarball that carries no types (#78).
- A change under `src/` adds a changeset: `minor` when it adds behaviour a consumer can call, `patch` when it corrects behaviour, never `major`. An all-`patch` queue once hid seven additions (#113).
- The changeset summary is the changelog entry, so never hand-edit `CHANGELOG.md`: a hand-kept `[Unreleased]` heading shipped in every tarball (#87).
- A changeset's first sentence becomes the release bullet: short, written for a consumer, no internal identifiers. The release refused two such sentences and published nothing (#65, #76).
- `README.md`, `docs-content/` and `/** */` comments in `src/` (they ship in `dist/*.d.ts`) carry no internal identifiers, phase language or private paths. Translate them; never delete a doc comment to pass `pnpm check:no-internal-refs` (#62, #64).
- `.github/workflows/release.yml` keeps all four grants (`actions: read`, `contents: write`, `id-token: write`, `pull-requests: write`): without them, every release failed at startup and logged nothing (#34, #98).
