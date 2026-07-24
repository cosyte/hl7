# Contributing to @cosyte/hl7

Thanks for considering a contribution. This library grows faster when
real integration teams surface vendor quirks, ship profiles for the
systems they integrate with, and publish standalone profile packages
back to the npm ecosystem.

## Filing an issue

Before filing, please:

1. Search existing issues. Chances are your quirk is already logged.
2. Reduce to the smallest reproducing HL7 message. Use synthetic
   patient identifiers only: no PHI. We keep fixtures in the public
   repo.
3. Include the exact `parseHL7` call that reproduces, the full
   `err.code` / `warning.code` you saw, and the `err.position` /
   `warning.position` if available.

## Opening a PR

1. Fork and branch from `main`.
2. Run the full pipeline locally before pushing. See [Dev setup](#dev-setup).
3. If your change is user-visible, add a bullet under the
   `## [Unreleased]` section of [CHANGELOG.md](./CHANGELOG.md).
4. Keep PRs focused: one logical change per PR. Large refactors
   should start as an issue for discussion.
5. Write a descriptive commit message. Imperative mood
   (`fix(parser): ...`, `feat(helpers): ...`) is encouraged but not
   enforced. No Conventional-Commits tooling required.

## Dev setup

The project uses **pnpm** (not npm or yarn). All the commands below
run from the repo root.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

All five must exit zero on the branch you open a PR from. CI runs the
same pipeline across Node 18, 20, and 22.

Useful extras:

- `pnpm test:watch`: re-runs tests on file change
- `pnpm test:coverage`: produces a coverage report (≥ 90% branches
  on `src/parser/`, `src/model/`, `src/helpers/`, `src/serialize/`,
  `src/builder/`, `src/profiles/`)
- `pnpm format` / `pnpm format:check`: Prettier on source + tests
- `pnpm examples`: smoke-runs the three examples under `examples/*.ts`

### Fuzz + differential testing

`test/property/fuzz.property.test.ts` runs a high-run-count `fast-check` fuzz harness (arbitrary
bytes, delimiter-mutated canonical messages, truncations) against the "never throw except a
4-fatal `Hl7ParseError`" invariant. It runs as part of the normal `pnpm test`/`pnpm test:coverage`
with no extra setup.

`test/differential/differential.test.ts` compares `@cosyte/hl7`'s parse of the canonical corpus
against an external oracle, [python-hl7](https://github.com/johnpaulett/python-hl7) (BSD license).
It's **oracle-gated**: with no oracle available it skips gracefully and the rest of the suite stays
green. To run it for real:

```bash
python3 -m venv .difftools
.difftools/bin/pip install hl7
pnpm test test/differential/differential.test.ts
```

See [`docs-content/spec-notes-differential.md`](./docs-content/spec-notes-differential.md) for what
gets compared and the known/justified divergences already documented.

## Adding a vendor-quirk fixture

The library's credibility depends on a growing library of real-world
quirk fixtures: every one makes the parser more robust.

Fixtures live under `test/fixtures/vendor-quirks/`. Each file targets
exactly one Tier-2 warning code. Filename convention: the kebab-case
form of the UPPER_SNAKE warning code, with a `.hl7` extension. For
example:

- `MLLP_FRAMING_STRIPPED` → `mllp-framing-stripped.hl7`
- `UNKNOWN_ESCAPE_SEQUENCE` → `unknown-escape-sequence.hl7`
- `TIMESTAMP_FALLBACK_FORMAT` → `timestamp-fallback-format.hl7`

Fixture rules:

- Synthetic data only: no PHI (swap names, MRNs, DOBs for fabricated
  values).
- `\r`-separated segments, no trailing newline.
- The fixture MUST emit the warning code its filename encodes when
  parsed in lenient mode.
- The fixture MUST throw `Hl7ParseError` with the corresponding code
  when parsed in strict mode (`{ strict: true }`).

The existing sweep tests (`test/parser-strict-mode-sweep.test.ts`)
enumerate the fixtures directory automatically. Add your `.hl7` file
and the sweep picks it up with zero additional test code. If the
warning code doesn't currently emit from the parser (some codes have
factories but no call site yet, see `test/fixtures/vendor-quirks/README.md`),
your fixture still belongs in the tree; it graduates from `it.todo`
to a passing assertion when the emit site lands.

## Authoring a profile

Profiles are plain data produced by the public `defineProfile()` API.
The easiest path to a working profile (whether you intend to upstream
it as a built-in or publish your own package) is the starter kit.

See [`examples/profile-starter-kit/`](./examples/profile-starter-kit/)
and its [CUSTOMIZING.md](./examples/profile-starter-kit/CUSTOMIZING.md)
for the 5-step walkthrough (rename → swap base → define Z-segments →
write fixtures → publish).

If you want to add a profile to the built-in set (`profiles.epic`,
`profiles.cerner`, etc.), open an issue first to discuss whether the
vendor/integration is broad enough to warrant an in-tree built-in
versus a standalone package.

## Publishing a standalone profile package

For vendor-specific or integration-specific profiles, ship your own
npm package. The starter kit produces a ready-to-publish scaffold.

1. Copy `examples/profile-starter-kit/` to a new directory.
2. Follow `CUSTOMIZING.md` steps 1-4 (rename, swap base, define
   Z-segments, write fixtures).
3. Add `NPM_TOKEN` as a GitHub repo secret (or use your local
   credentials).
4. Run `pnpm publish --dry-run --access public` to preview the
   tarball.
5. Trigger the kit's **Publish** workflow (manual `workflow_dispatch`)
   or run `pnpm publish --access public` from your laptop.

Your profile will install as
`@yourorg/hl7-profile-name` alongside `@cosyte/hl7` as a peer.

---

Questions? Open an issue at
[github.com/cosyte/hl7/issues](https://github.com/cosyte/hl7/issues).
