---
"@cosyte/hl7": patch
---

Repository tooling: the em-dash gate and the public-surface gate now run as thin callers of the shared reusable workflows in `cosyte/.github`, pinned to an immutable commit.

Nothing a consumer can call changed. The package still has zero runtime dependencies, no export was added, removed or re-typed, and no parse result, warning code, warning position or serialized byte moved.

**What the gates enforce is unchanged; where the harness lives is not.** `scripts/check-no-emdash.sh` and `scripts/check-no-internal-refs.sh` are untouched, and the package scripts `check:no-emdash` and `check:no-internal-refs` keep their names and their commands, so both gates detect exactly what they detected before and both still run locally the same way. The reusable workflows carry no pattern, no allow-list and no file selection of their own: they prepare the tree, run the named command, and let its exit status decide the job. The scanning rules stay in this repository, in one copy.

**The reference is a 40-character commit SHA, not a tag.** A tag can be moved or deleted by anyone who gains write access to the workflow's repository, so a tag is not an immutable reference. The published release name rides beside the SHA as a trailing comment, so the release note stays reachable.

**The em-dash gate now publishes two check runs instead of one.** The shared workflow splits the tracked-file scan and the pull request text scan into separate jobs, so the contexts are `no-emdash / tracked-files` and `no-emdash / messages`. The tracked-file half is the one that blocks a merge. The messages half runs and reds its own context but does not block, because a pull request body composed from someone else's release notes should not hold a merge. Detection is unchanged in both halves.

`test/workflows/gate-caller-contract.test.ts` pins the caller shape in this repository's own suite: the pinned reference, the job ids that become check-run contexts, the trigger sets, the permissions ceiling, and the absence of any `with:`, `run:` or `steps:` key that would start a second copy of a rule.
