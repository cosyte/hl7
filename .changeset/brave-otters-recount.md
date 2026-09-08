---
"@cosyte/hl7": patch
---

Tooling: the numbers the release readiness record states are now recounted from the tree instead of read as prose.

`scripts/release-readiness.ts` graded the record's header facts, its changeset table as a set, each row's bump against that file's own frontmatter, and the resolved version. Everything else the record asserted was prose: how many declarations were pending, how many of them were `minor`, how large the public export surface being certified was, and which public exports and stable codes the release removes, renames or narrows. Those four could drift arbitrarily far from `.changeset/` and `release/public-api.json` with every gate in the repository still green, which is how a record accretes: each release edits the sections a machine reads and carries the rest forward.

Three refusals close that. A stated pending count and a stated `minor` count are recounted from the queue and reported stated-beside-counted when either disagrees. A stated export-surface size is compared against `exportCount` in `release/public-api.json`, which is now a third input the check reads: absent, not JSON, carrying no usable count, or stating a count its own export list contradicts are each a missing input at exit 2, never a skipped comparison reported as a clean queue. And every changeset file the break-candidate section cites has to be pending, so a candidate whose cause has already shipped is named as carried over rather than believed; a candidate citing no file, a section holding no readable candidate, and an absent section are findings on the same terms. A record that states none of the three counts is a finding too, because a measurement the record declines to make cannot be told from one nobody took.

Exit 1 still means an unready queue and exit 2 still means a run that could not read its inputs, and the check still makes no network call and spawns no subprocess.

`release/0.1.0-readiness.md` is re-derived against the tree rather than patched: every classification row's justification is rewritten from the declaration it classifies, and the break candidates are re-derived from the pending queue with each one attributed to the declaration that causes it. No declaration's frontmatter was edited, no version was bumped and nothing was published.

No consumer-visible change: no export, type, parse behaviour, warning code or serialized byte moved, and the package still has zero runtime dependencies.
