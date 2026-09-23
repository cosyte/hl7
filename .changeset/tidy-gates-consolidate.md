---
"@cosyte/hl7": patch
---

Repository tooling: the public-surface gate now reaches its detection through the published `@cosyte/script-utils` internal-reference implementation instead of this repository's own copy of it.

Nothing a consumer can call changed. The package still has zero runtime dependencies, no export was added, removed or re-typed, and no parse result, warning code, warning position or serialized byte moved. `@cosyte/script-utils` is a devDependency pinned to an exact published version, so no consumer install receives it.

**What is refused is unchanged, and that was proved before the swap rather than asserted after it.** `test/scripts/internal-refs-gate.test.ts` is a differential corpus of 62 cases, each an input and an expected verdict: all six rules on both surfaces (the public pages plus the npm metadata, and `src/` doc comments), in both passes (line by line and paragraph-joined), the hard-wrapped indented-continuation shape a line scan cannot see, every refusal the gate has instead of a silent green, and the segment-field, code-range and clinical vocabulary a widened rule would destroy (`MSH-2`, `PID-3`, `PKG-1`, `PKG-4`, `ICD-10-CM P00-P96`, the `CSP` Clinical Study Phase field names, the DICOM imaging nouns). It was committed GREEN against the old scanner first, and not one expectation moved for the swap.

**`scripts/check-no-internal-refs.sh` is deleted, last, after that proof.** Its own disclosed residuals said the prefix list was duplicated from the estate's source list, that the two could drift, and that the fix was one shared implementation rather than one patch per repository. A new programme prefix or a closed detector hole now costs one publish and a version bump instead of one review per repository. The prefix list, the standards-designation exclusions, the public surface, the tarball accounting and the source doc-comment pass stay here as the caller's axes, along with this repository's own measured reference material, which joins the shared self-test floor.

**The gate needs `pnpm install` now, and fails closed without it.** Reaching a published package by specifier means it can no longer run before dependencies are installed. The property traded away is "the gate runs even if the install is broken"; what replaces it is that an install that failed, or an implementation that cannot be reached, exits non-zero and never prints the OK line. There is no fallback scanner behind the import, deliberately: a fallback is a second copy of the rules wearing a different hat.
