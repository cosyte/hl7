# Agent notes

What does not fit on the `CLAUDE.md` card lives here, and the card points into it as
`documentation/agent-notes.md#<anchor>`. Each section says what happened and what to do about it.

## pnpm 10 on PATH

The gate runs with pnpm 10, the version `packageManager` in `package.json` pins (10.34.5). pnpm 12
refuses `pnpm install --frozen-lockfile` here, and the tests shell out to a bare `pnpm`, so a newer
pnpm first on PATH fails the gate in ways that look like test failures. Where `pnpm --version`
prints another major, put the pinned one first:

```sh
# Node 22 and 24 ship corepack:
mkdir -p ~/.pnpm10 && corepack enable --install-directory ~/.pnpm10 pnpm
export PATH="$HOME/.pnpm10:$PATH"

# Node 25 and later ship no corepack; install the pinned version under a prefix instead:
npm install --global --prefix ~/.pnpm10 pnpm@10.34.5
export PATH="$HOME/.pnpm10/bin:$PATH"
```

## What CI runs

The first nine commands of the card's gate are the shared `cosyte/.github` CI ladder (`ci`), run on
Node 22, 24, and 26; the rulesets require the Node 22 and 24 legs. Beyond the gate, CI alone:

- loads `dist/` as ESM and as CommonJS, and packs the tree and installs the tarball into a clean
  directory (the shared ladder's `prepublish` job);
- runs actionlint over every workflow file (`ci / actionlint`) and CodeQL (`codeql.yml`);
- runs `pnpm examples` and the starter kit's install, typecheck, lint, test and build in the
  `extras` job, and actionlint over the kit's own workflows;
- runs `pnpm check:docs` in `docs-consistency.yml`;
- runs the dash gate over tracked files and over the pull request title, body and commit messages
  (`no-emdash.yml`), and the public-surface gate (`no-internal-refs.yml`), each in a workflow of
  its own so that editing a pull request's text does not rerun the whole matrix;
- checks the pull request title against Conventional Commits (`pr-title.yml`).

## The starter kit's 24-hour install window

`examples/profile-starter-kit` is a copy-and-customize template with no lockfile. Its
`pnpm-workspace.yaml` keeps pnpm's `minimumReleaseAge` of 1440 minutes for every package, with no
`@cosyte` exemption, so that a consumer who copies the kit inherits the 24-hour cooldown. The root
exempts `@cosyte/*` by the operator's decision; the kit does not.

The kit pins `@cosyte/script-utils` exactly, at the same version as the root
(`test/scripts/attw-gate.test.ts` asserts the two pins agree). So a pull request that moves the pin
to a release younger than 24 hours reds the `extras` job: pnpm cannot resolve an exact version it is
not yet allowed to install. hl7#168 met this with script-utils 0.1.2. The remedy is to wait for the
window to pass and re-run `extras`; the other checks do not depend on it.
