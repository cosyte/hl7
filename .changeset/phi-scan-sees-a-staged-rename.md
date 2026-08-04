---
"@cosyte/hl7": patch
---

Repository PHI commit-gate only, with no runtime impact: the gate no longer passes a staged rename or copy into a scan root unscanned, where an ordinary `git mv` used to print `OK: no hits` and exit 0 at pre-commit.

Rename detection is on by git's default, and `git diff --cached --raw --diff-filter=AMT` returns
neither `R` (rename) nor `C` (copy). So `git mv <link> test/fixtures/<name>` staged as
`:120000 120000 <sha> <sha> R100` with **two** paths, and the status filter deleted the record
outright. Reproduced before the fix, in a throwaway repository: an ordinary `git mv` put a
mode-`120000` entry under a scan root and `pnpm phi-scan --staged` printed `OK: no hits` and
exited 0. A rename that also **substitutes a real name** into the moved file passed identically,
measured at `R098`, mode `100644`, with a real-looking surname in the staged blob. The gap is at
pre-commit; the all-mode sweep is the backstop and saw both.

**`C` (copy) is the same hole and is pinned separately, because a rename fixture does not reach
it.** With `diff.renames=copies`, copying an out-of-scope PHI-bearing file INTO a scan root stages
as a genuine `C100` two-path record and was dropped exactly as a rename was: measured exit 0
before and exit 1 after. One precondition is worth
recording because it is easy to state this too broadly: config-only copy detection also needs the
COPY SOURCE modified in the same staged diff. Without that, git finds no copy source and the
record arrives as an ordinary `A` that even the old argv enumerated, so a naive copy fixture
passes on both and proves nothing.

**The remedy is `--no-renames`, and it costs nothing.** An earlier note in this package said
closing this needed the two-path `--raw` record shape handled and a scope decision. That reading
was wrong, and it is corrected in place rather than deleted, because it shipped. Turning detection
off makes the destination arrive as an ordinary single-path `A`
(`:000000 120000 0000000 <sha> A`) and the source a `D` the filter already drops. Verified under
`diff.renames=true|copies|false|1` and `diff.renameLimit=1`: every one yields the same single-path
`A`, so the two-field record stride is **structural** rather than conditional on the caller's git
config, and the new enumeration **contains** the old one: equal whenever nothing is renamed or
copied, larger only when something is. It is a superset, not a strictly larger set. Note the
corollary,
because it is easy to misread as "nobody was affected": a caller who had already set
`diff.renames=false` was covered before this change, and everybody on git's default was not.

**A scan root's own path was outside the `--staged` filter, on both roots.** An index entry at
exactly `test/fixtures` or exactly `src` is never a directory, because git records no entry for
one, so it is a scan root REPLACED by a blob, a link or a gitlink; the prefix test alone let that
through, measured exit 0 over a staged mode-`120000` entry at each. The filter now matches each
root's own name as well as the prefix. This is the one **addition to the path scope** in this
change and is named as such rather than filed under "narrowing".

**An unmerged path is now refused rather than reported clean.** `U` is returned by neither `AM`
nor `AMT`, so a conflicted in-scope path made the pre-commit route print `OK: no hits` and exit 0
over an index it structurally cannot read, with a real-looking surname sitting in one of the
stages. Such a path is recorded at one or more of stages 1/2/3 and never at stage 0, so
`git show :<path>` fails
outright and there is no one staged blob to scan. It is now enumerated and refused (exit 2), with
its own message: a `U` record's destination mode is `000000`, and the existing mode refusal's
sentence about `git show` handing back a target path would be false for an unmerged regular file.
**State the bound precisely:** git itself refuses to commit while a path is unmerged, so this was
never a route to a committed leak. What it was is the gate attesting clean over a state it never
observed, and the scan is run by hand and from scripts as well as from the hook.

**Exit 1 is now reserved for hits, and nothing reaches node's default handler.** A missing or
unreadable synthetic allow-list, and a walk root `readdirSync` could not list, both threw out of
`main` uncaught; node reports an uncaught throw as exit 1, which is this gate's code for PHI
found, with a v8 stack trace in place of the scanner's own diagnostic. Both now refuse with exit 2
and a named `[phi-scan]` line, and a top-level backstop catches whatever else throws. Nothing
downstream reads the difference today, since both codes are non-zero and the gate blocks either
way; a caller that ever split them would have read a scan that never started as a scan that found
PHI.

Pinned by the scan's test suite going from 48 cases to 66, 11 of them red before the fix, every one against a
throwaway git repository so no rename, no conflict and no violator is ever written into the
committed corpus. Some of the new cases assert git's own output rather than the scanner's, because
the remedy rests on what git emits and a premise that stops holding should turn the suite red
rather than quietly widen the gap again. The superset property is asserted by comparing the
two enumerated path sets under each rename-detection setting, on an index holding an add, a modify
and a rename at once. The rename fixture is deliberately joined with `\n` rather than the `\r` of
the HL7 wire form: git estimates similarity over hashed content chunks, and the identical edit to
the `\r`-only form was measured landing as a `D` plus `A` pair rather than an `R`, which would
have made the case under test unreachable by fixture. The scanner splits on `\r\n`, `\r` and `\n`
alike, so it reads the two forms identically.

The unmerged fixture is built with `git update-index --index-info` rather than by running a real
`git merge`, and the reason is worth carrying to any sibling that ports this. What the scan reads
is an **index state**, so building that state directly is the smaller fixture and the honest unit:
no branches, no merge strategy, no committer identity, and `git status` still reports the result
as `UU`, which is git confirming the construction.

The concrete reason it is worth the plumbing is a trap that will be ported if it is not written
down. A first draft drove all four cases through a real `git merge` and every one failed on CI on
its own premise, because **`git merge` resolves the committer identity up front** and exits 128
with "Committer identity unknown" before merging anything if it cannot find one. A developer's box
has a global identity, or auto-detects one from the user and hostname, so the fixture passed
locally and could not be reproduced by unsetting `HOME` alone; a CI runner has neither. A first
draft of this note blamed a git-version difference in merge-strategy behaviour, which was a guess
and was **wrong**; it is corrected here rather than quietly dropped. The real-merge shape is not
thereby unpinned: one case runs an actual conflicting merge with an explicit identity and asserts
it produces the same single-path `U` record, switching branches by name rather than through
`git checkout -` so the fixture does not lean on reflog resolution either.

No runtime or API change. This is a repository gate only.
