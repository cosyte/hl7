---
"@cosyte/hl7": patch
---

Correct four wrong claims in the README feature list: the package needs Node 22 and targets ES2023, and it carries 20 stable warning codes rather than 18.

`README-CLAIM-DRIFT`. Each correction was re-derived from the thing it describes rather than taken from any existing document:

1. **Node 18+ becomes Node 22+**, in the badge and the prose, from `engines.node` (`>=22.0.0` in `package.json` and in `npm view @cosyte/hl7 engines`). This is the one a consumer could act on: `npm i` on Node 18 warns on engines today while the package page claims 18 is supported.
2. **ES2022 becomes ES2023**, from `@cosyte/tsconfig/base.json`'s `target` and `lib`, which this repo extends without override.
3. **18 becomes 20 stable warning codes**, from the 20 keys in `WARNING_CODES`. `test/warning-codes.snapshot.test.ts` already asserted 20, so a green suite and a wrong package page coexisted.
4. **"Every public export has JSDoc + `@example`" becomes "every public function and class."** Measured over the 213 exported names in the built `dist/index.d.ts`: 79 of 79 functions and 5 of 5 classes carry both, but one value constant and 36 of the 109 type-only exports carry JSDoc with no `@example`, and of the three aliased namespace exports two carry no JSDoc at all. The narrowed sentence is exactly true and the old one was not.

The rest of the list was checked the same way and left alone: 4 fatal codes, 8 built-in vendor profiles, zero runtime dependencies, `noUncheckedIndexedAccess`, dual ESM and CJS resolution (confirmed through the `exports` map and a passing `attw`), and both linked paths.

`CLAUDE.md` already carried the right Node and target values, so the repo contradicted itself and nothing caught it. No gate compares a README claim against the config it describes.
