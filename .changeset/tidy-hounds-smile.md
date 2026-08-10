---
"@cosyte/hl7": patch
---

Tooling: the PHI scanner's full sweep now reads the bytes git carries, not only the working tree.

`pnpm phi-scan` with no arguments walked three declared directories on disk and reported on what it found there. Reconciling that against the paths git tracks is satisfied by decoy content: a directory that mirrors the tracked names over clean files leaves every root yielding and the committed corpus unopened, and it printed "OK: no hits" at exit 0. The sweep now also reads every path in the git index, as a union with the walk, so a clean result is one that was measured rather than assumed.

Five states that reported clean over content neither route had opened are closed, each pinned by a test: a walk root swapped for a decoy directory, a single file replaced by a clean decoy, a tracked file absent from the working tree, a tracked symbolic link outside every walk root (now refused by name, and the refusal never reports what it points at), and an unmerged index entry. An empty index refuses outright instead of passing every check vacuously.

It also reads directories nobody declared. The runnable example messages under `examples/data/` had never been scanned by either route; two of them carried a date of birth, a street address and person-name tokens that were in no allow-list, and those tokens are declared in the allow-list now. A new directory is in scope from the moment git tracks something in it.

The pre-commit route is unchanged, deliberately: what it enumerates decides what a commit is blocked on. The per-root observation rule is unchanged too, and is not satisfied by the new route, so a root emptied on disk still refuses. The gate remains detective rather than preventive on every route: it guarantees PHI is never carried silently, not that it never touched the disk.
