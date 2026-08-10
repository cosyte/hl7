---
"@cosyte/hl7": patch
---

Tooling: the PHI scanner's full sweep now reads the bytes git carries, not only the working tree.

`pnpm phi-scan` with no arguments walked three declared directories on disk and reported on what it found there. Reconciling that against the paths git tracks is satisfied by decoy content: a directory that mirrors the tracked names over clean files leaves every root yielding and the committed corpus unopened, and it printed "OK: no hits" at exit 0. The sweep now also reads every path in the git index, as a union with the walk, so a clean result is one that was measured rather than assumed.

Eight states that reported clean at exit 0 over content neither route had opened are closed, each measured against the previous release and each pinned by a test: a walk root swapped for a decoy directory; one file replaced by a clean decoy; a message under an undeclared top-level directory; a tracked file absent from the working tree; PHI behind a walk root that is itself a symlink; a tracked symbolic link outside every walk root; an unmerged index entry; and an empty index, which used to satisfy every check vacuously. The last three refuse the sweep, and they print what the walk already found before doing so.

It also reads directories nobody declared. The runnable example messages under `examples/data/` had never been scanned by either route; two of them carried a date of birth, a street address and person-name tokens that were in no allow-list, and those tokens are declared in the allow-list now. A new directory's committed bytes are in scope from the moment git tracks something in it. For a file that is not itself a message, that buys the dashed-SSN and non-test-email floor and nothing else.

Unchanged deliberately: the pre-commit route keeps its own scope, because what it enumerates decides what a commit is blocked on; and the per-root observation rule stays a statement about the walk, so a directory emptied on disk still refuses. The residual is written down rather than implied: working-tree bytes at a path outside every walk root are read by neither route, tracked or not, so a tracked file out there with unstaged edits is judged on its staged bytes. The gate remains detective rather than preventive on every route: it guarantees PHI is never carried silently, not that it never touched the disk.
