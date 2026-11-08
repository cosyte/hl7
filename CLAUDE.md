# @cosyte/hl7

Our HL7 v2 parser and utility library for Node.js and TypeScript, public on npm under MIT with zero
runtime dependencies. It reads vendor-quirky messages leniently (a warning, not a throw, short of
structural corruption) and serializes spec-clean HL7, with builders, validation and vendor profiles.

@AGENTS.md

## Gate

Required checks: `ci / verify` on Node 22 and 24 (26 runs too), `ci / actionlint`,
`no-emdash / tracked-files` and `no-internal-refs / public-surface`. From the repo root, in this
order, with pnpm 10 (the `packageManager` pin) first on PATH: pnpm 12 refuses the frozen install,
and tests spawn a bare `pnpm`.

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
pnpm check:documents
cd examples/profile-starter-kit && pnpm install --no-frozen-lockfile \
  && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Hazard

Every message this library reads can carry a patient's identity and clinical record. The failure
that hurts is the quiet one: a field parsed wrong but plausible travels downstream as an allergy
nobody sees or a dose that is off, and nothing flags it. When a value is in doubt, warn rather than
guess, and keep message text out of errors, warnings and logs.

## Rules

- Errors, warnings and model identifiers (`Segment.type`, `Hl7Message.version`) carry bounded
  tokens from `src/parser/tokens.ts`, never raw message text: a name and a record number once
  reached `Hl7ParseWarning.message` (#70).
- Both `attw` scripts (root and starter kit) stay `cosyte-attw`: bare `attw` passes no types (#78).
- A change under `src/` adds a changeset, and every changeset is a `patch` until the operator okays
  a minor (2026-11-07). Say what a consumer gains: an all-`patch` queue once hid seven additions
  (#113). Never hand-edit `CHANGELOG.md`: the summary is the entry (#87).
- A changeset's first sentence becomes the release bullet: short, for a consumer, no internal ids.
  The release refused two such sentences and published nothing (#65, #76).
- `README.md`, `docs-content/` and `/** */` comments in `src/` (they ship in `dist/*.d.ts`) carry
  no internal ids, phase language or private paths. Translate a hit; never delete a doc comment to
  pass `pnpm check:no-internal-refs` (#62, #64).
- `.github/workflows/release.yml` keeps all four grants (`actions: read`, `contents: write`,
  `id-token: write`, `pull-requests: write`): without them every release failed at startup
  (#34, #98).
- Never add the `@cosyte` exemption to the kit's `pnpm-workspace.yaml`: consumers copy it and keep
  its 24-hour release-age floor. CI's `extras` job exempts its runner copy only (2026-11-08).
