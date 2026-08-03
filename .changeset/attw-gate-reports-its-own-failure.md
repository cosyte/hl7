---
"@cosyte/hl7": patch
---

The `attw` publish gate no longer reports a pass on a tarball that carries no types. `package.json`
ran `attw --pack .`, which prints "This package does not contain types." and exits 0, so every caller
that read the status, including `prepublishOnly`, read a green. A false red costs an hour; a false
green merges.

**The defect is the exit code, not the invocation and not concurrency.** In
`@arethetypeswrong/cli@0.18.4`, `dist/getExitCode.js` opens with `if (!analysis.types) return 0`, so
the problem list is never consulted, and no `--profile`, `--ignore-rules` or config setting reaches
that early return. For a package that ships types, "does not contain types" does not mean "fine,
untyped": it means the declarations were not in the tarball, which is a broken publish.

Reproduced with no concurrency at all. `rm -f dist/index.d.ts dist/index.d.cts && pnpm attw` and
`rm -rf dist && pnpm attw` both printed the sentence and exited 0. A race only supplies the
condition: `tsup` emits the JS bundles in one pass and the declaration files in a later one, so there
is a window in every build of this package where `dist/` holds `.mjs`/`.cjs` and no `.d.ts`. Timed on
two clean builds here, `dist/index.mjs` appeared at 3.57s and 3.58s and `dist/index.d.ts` at 5.81s
and 5.65s, a window of 2.24s and 2.07s. A concurrent build or `pnpm clean` in the same working tree
lands `attw` in it. **That is deliberately not answered with a lock, a lease or a build queue**: the
gate has to be able to say its own inputs were missing, whatever removed them.

`scripts/attw.mjs` carries two nets, and they catch different things.

- A **preflight**: every relative artifact path `package.json` promises (`main`, `module`, `types`,
  `typings`, and every string leaf of `exports`) must exist and be non-empty before `attw` runs. It
  is structural, does no string matching, and names the missing file rather than leaving the reader
  to infer it. This is the net that catches the build window above. A path written without a leading
  `./` counts: `"types": "dist/index.d.ts"` is legal for those four fields and is normalized rather
  than skipped. Wildcard `exports` patterns, absolute paths and `package.json` itself are skipped, and
  a manifest that declares nothing at all is refused rather than passed, because a preflight with no
  inputs is not a preflight that succeeded.
- A **post-check**: if `attw` still reports an untyped package, fail. The preflight structurally
  cannot see this case, because the declarations can be present on disk and still be absent from the
  tarball when `files` or `.npmignore` leaves them out. **No instance of that second case is on
  record in this repo.**

The post-check reads a printed sentence, so what would hide that sentence is refused rather than
tolerated: `--quiet`, `-q`, `--format json`, `-f json`, `--format=json`, `-fjson`, `-qP`,
`-Pf json`, a `.attw.json` setting `quiet` or `format`, and `--config-path`. Each of the first nine
was measured against this package's own untyped tree to hand back exit 0 with the sentence absent.
`--config-path` is refused by inference, not by measurement. The refusal is by option name,
wholesale, not by value, which is a deliberate trade against making the guard parse values. Other
arguments are still forwarded, so `--profile node16`, `--no-summary`, `--no-emoji` and `--no-color`
work.

**Short options are matched by letter anywhere in the cluster rather than by whole token, and that is
not cosmetic.** `commander` bundles short options and lets a value ride on the end, so `-fjson`,
`-qP` and `-Pf json` are `--format json` and `--quiet` in another spelling. Measured against a
package whose declarations sit on disk but are excluded from `files`, which is the one shape only the
post-check can see, a token-matching guard returned exit 0 on `-fjson` and on `-Pf json`. `-qP` was
caught, but only by the fallback that refuses an empty transcript rather than by the refusal itself.

**A second class of argument is refused for a different reason, and calling it blinding would be
wrong.** `--help`, `-h`, `--version` and `-V` print and exit 0 without analysing anything, with a
non-empty transcript and no untyped sentence, so neither net can tell the result from a pass.
`--definitely-typed` is refused with them by inference rather than by measurement, and the
distinction is kept because the measurement was attempted and did not reproduce: with a version range
the untyped sentence still printed. It is refused on a reading of the CLI, where a value that looks
like a path merges external declarations into the analysis, which would let a package that ships none
come back typed. `--no-definitely-typed` is a distinct option name and is deliberately not refused.

**Both of this repository's manifests are fixed, because the census that matters is manifests rather
than repository roots.** `package.json` and `examples/profile-starter-kit/package.json` each ran the
bare CLI. The starter kit is a template a consumer copies out and publishes from, so leaving it alone
would have re-minted the same silent pass in every package generated from it. The kit now carries its
own copy, whose code is byte-identical to the root one below the docblock and is pinned that way by a
test; only the comment differs, because one is written for a maintainer here and the other for a
consumer who copied the kit out. Two copies of a gate drift, and the kit's copy is executed by nothing
in this repository's CI, so the identity pin is what makes the behavioural tests true of both.

`test/scripts/attw-gate.test.ts` pins the defect and the remedy against the real binary rather than a
mock: that bare `attw` exits 0 on both shapes (declarations left out of the tarball, and declarations
never built), that the wrapper reds each of them, that the preflight names a missing or an empty
file, that a real `attw` failure still propagates `attw`'s own status, that the wrapper is
transparent on a well-formed package, and that every refusal holds. The negative control is there
because a gate that only ever fails is not a gate. If a future `attw` fixes the exit code or rewords
the sentence, the suite reds and sends the reader to the wrapper instead of letting the net go
quietly slack.

No runtime or API change. This is a build and publish gate only.
