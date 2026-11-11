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
with the pnpm that `packageManager` pins. CI runs the same checks on Node 22, 24, and 26. The dash
gate also reads your pull request title, body, and commit messages, because this repository
squash-merges and those become the message that lands on `main`.

A change under `src/` adds a changeset (`pnpm changeset`) with a **patch** bump: on the 0.1 line a
minor or major release is a maintainer's decision, so when a change adds behavior a consumer can
call, say so in the summary. Its first sentence becomes the release bullet, and its summary is the
`CHANGELOG.md` entry, so never hand-edit `CHANGELOG.md`.

## Coverage, mutation and performance

`quality-floor.json` holds today's coverage (lines, branches, functions, statements) and the
mutation score of the full run. A floor only rises. `pnpm quality:check --base origin/main`, after `pnpm test:coverage`,
fails when a metric drops below its floor, when a pull request lowers or removes a floor, or when a
line it changed never ran, and prints each metric's gap to 100. A line no input can reach takes
`/* v8 ignore next -- the reason */`, and the reason goes in the pull request.

Mutation testing runs StrykerJS with `stryker.config.mjs`. On a pull request CI mutates the source
files it changed, and every mutant in the changed lines must be killed. To run that here:

```sh
pnpm mutate changed --base origin/main
pnpm quality:mutation --base origin/main
```

`pnpm mutate:full` mutates every file `stryker.full.config.mjs` names, all of `src/` but the
generated tables and the build-time schema writers, as the weekly run does; that score is the
floor's. Static mutants, in code that runs once when a module loads, are left out of it. On one
machine the run takes hours, so the weekly run splits the files across eight parallel jobs and
keeps StrykerJS's incremental results between runs. After it and `pnpm test:coverage`,
`pnpm quality:raise` raises each floor to what was measured. A mutant no test can kill takes
`// Stryker disable next-line <mutator>: the reason`.

Every property test runs through `checkProperty` or `checkAsyncProperty`
(`test/_helpers/property.ts`) or a runner from `@cosyte/test-utils`: 100 cases on a pull request,
or the count its file sets with a `property-depth:` note saying why, from a new seed every run.
`COSYTE_PROPERTY_RUNS` sets the depth of all of them, and the nightly run sets 10,000; the four
streaming reader properties take a quarter of it (`test/property/_read.ts` says why). A failure
prints `COSYTE_PROPERTY_SEED` and `COSYTE_PROPERTY_PATH`: set both and run the test again to replay
the failing case, already shrunk. `test/property-depth.test.ts` fails on a bare `fc.assert`, a seed
or count with no note, or a property the nightly run does not reach.

`pnpm test:perf` runs the scaling gate (`test/perf/scaling-gate.perf.ts`) apart from coverage. It
fails when parsing cost grows faster than the input. `bench/parse.bench.mjs` measures throughput,
latency, memory and import cost against `dist/`: `pnpm build && pnpm bench:reading` takes a reading,
and on a pull request CI times the base build against the head build. That comparison is advisory.

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
