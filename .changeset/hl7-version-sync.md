---
"@cosyte/hl7": patch
---

Make the `VERSION` export track `package.json`, and add the missing `version` script (VERSION-SYNC).

Two latent release bugs, both of which would have bitten at the first publish and neither of which
any existing test could see. Ported from the fix `@cosyte/mllp` landed as MLLP-10; `hl7` is the
reference the sibling parsers mirror, so this is the canonical shape.

**The `VERSION` export lied about the release.** `VERSION` was hardcoded `"0.0.0"` in
`src/index.ts` while `changeset version` bumps only `package.json` — so a published `0.0.1` would
have shipped an export reading `"0.0.0"`, and every consumer logging or asserting on
`VERSION` would have been told the wrong version of the parser they were running. The new
`scripts/sync-version.mjs` rewrites the constant from `package.json`, wired into the `version`
script so the bump and the constant land in the same "Version Packages" commit. It is idempotent,
and exits non-zero if the declaration is ever renamed rather than silently no-op'ing.

**No `version` script existed at all — a hard release blocker.** The shared `cosyte/.github`
release workflow drives Changesets with `version: pnpm run version`, which would have failed with
`ERR_PNPM_NO_SCRIPT`: the "Version Packages" PR could never have been opened and `0.0.1` could
never have shipped. Added
`"version": "changeset version && node scripts/sync-version.mjs && prettier --write package.json src/index.ts"`.

**The guard is the load-bearing part.** `test/sanity.test.ts` now compares `VERSION` against
`package.json` at test time instead of asserting its shape against a regex. The old test asserted
only that `VERSION` *looked like* a semver string — it would have stayed green through exactly the
drift described above, which is worse than no test, because it would have told the publish gate
this was safe when it was not. Proven by forcing the drift: with `package.json` at `0.0.1` and the
export at `"0.0.0"` the suite fails (`expected '0.0.0' to be '0.0.1'`), and running
`sync-version.mjs` turns it green.

No version was bumped and nothing was published — the package stays at `0.0.0`. This change is
about making the export *track* the manifest, ahead of the human publish gate.
