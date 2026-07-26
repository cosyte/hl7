---
"@cosyte/hl7": patch
---

Add the em-dash brand gate to CI (`scripts/check-no-emdash.sh`, `pnpm check:no-emdash`,
`.github/workflows/no-emdash.yml`).

The founder directive of 2026-07-24 (`knowledgebase/06-brand/voice-and-tone.md`) bans `U+2014`
outright across every cosyte surface and names commit messages explicitly, and the meta-repo's
`documentation/conventions.md` has described the rule as CI-gated. It was gated in only 3 repos of
10. This ports `knowledgebase`'s scanner, the text-only variant, which is the correct one here
because hl7 tracks no binaries (all 414 tracked files read as us-ascii or utf-8, none holds a NUL
byte, so `website`'s NUL-partition variant would buy nothing and would add a way for a text file to
be classified out of the scan).

The gate checks both the tracked files and the PR title, body, and branch commit messages, the
latter on the non-default `edited` activity type so a description retitled after the final push is
re-checked before a squash merge turns it into the commit message. It lives in its own workflow
rather than in `ci.yml` because `ci.yml`'s triggers drive the Node 22 + 24 matrix and the examples
and starter-kit `extras` job, which should not re-run on every PR-description edit.

The scanner is built so that it cannot report green from a scan it did not complete: it pins
`LC_ALL=C.UTF-8` (without the pin GNU grep 3.8 aborts on `\x{2014}` and a naive port prints OK
having matched nothing), self-tests itself against a known em dash before believing a clean result,
treats any scanner stderr as a failure, refuses an empty file list, builds its file list as its own
command so a failed `git ls-files` stops the run, uses NUL-separated paths because `git ls-files`
C-quotes non-ASCII names, passes `-e` and `--` so a tracked file named `-q` cannot silence a batch,
and anchors at the repo top level so invocation from a subdirectory cannot under-report.

hl7 was already clean (0 of 53 markdown files carried an em dash), so no content changed. This is
regression prevention only. Dev-tooling: no change to the published package surface, parser
behavior, or warning codes.
