# Contributing to @cosyte/hl7

The organization's [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md)
and [code of conduct](https://github.com/cosyte/.github/blob/main/CODE_OF_CONDUCT.md) apply here:
how decisions are made, filing an issue, opening a pull request, writing a changeset, and
licensing. This file adds only what is specific to this repository.

This library grows fastest when integration teams surface vendor quirks, ship profiles for the
systems they integrate with, and publish standalone profile packages.

## Reporting a parser issue

Reduce the report to the smallest HL7 v2 message that reproduces it, with synthetic identifiers
only (fixtures live in this public repository), and include the exact `parseHL7` call, the
`err.code` or `warning.code` you saw, and the `position` it carried.

## The gate

Run every command `CLAUDE.md` lists under "Gate", from the repository root and in that order,
with the pnpm that `packageManager` pins. CI runs the same checks on Node 22 and 24. The dash
gate also reads your pull request title, body, and commit messages, because this repository
squash-merges and those become the message that lands on `main`.

A change under `src/` adds a changeset (`pnpm changeset`): **minor** when it adds behavior a
consumer can call, **patch** when it corrects behavior, never **major**. Its first sentence
becomes the release bullet, and its summary is the `CHANGELOG.md` entry, so never hand-edit
`CHANGELOG.md`.

## Fuzz and differential testing

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
2. Follow `CUSTOMIZING.md` steps 1 to 4 (rename, swap base, define
   Z-segments, write fixtures).
3. Set up publishing for your package: an npm trusted publisher for
   the kit's workflow, or an `NPM_TOKEN` repository secret, or your
   local credentials.
4. Run `pnpm publish --dry-run --access public` to preview the
   tarball.
5. Trigger the kit's **Publish** workflow (manual `workflow_dispatch`)
   or run `pnpm publish --access public` from your laptop.

Your profile will install as
`@yourorg/hl7-profile-name` alongside `@cosyte/hl7` as a peer.
