---
"@cosyte/hl7": patch
---

**The published JSDoc no longer carries phase language, item identifiers or ADR numbers, and
`src/` doc comments are gated (`PUBLIC-SURFACE-HYGIENE`).** Doc comments compile into `dist/index.d.ts` and
`dist/index.d.cts`, `dist` is the first entry in `files`, and every install receives them, so the
text a consumer's editor renders on hover is public surface and the founder directive of 2026-07-27
applies to it. Measured with the shipped rules before the change: 293 distinct lines across tracked
`src/*.ts`, of which a local build carried 164 into `dist/index.d.ts`. After: 0, in `src/` doc
comments and in both built declaration files.

Identifiers were **translated, not deleted, and no public export lost its documentation**. That is
measured rather than asserted: the built declaration file carries 691 doc-comment blocks, 633
documented declarations and 237 `@example` blocks before and after, with a byte-identical sorted
list of documented declaration names.

Stripping the internal framing exposed a **false claim on a published API**, which is the argument
for doing this at all rather than a side effect of it. `defineProfile`'s doc block told consumers
that `opts.extends` was "ACCEPTED but IGNORED"; the implementation merges parents (lineage,
`dateFormats`, `customSegments`, `description`, composed `onWarning`) and re-validates the result.
Four sibling claims were stale the same way: `emitMessage`, `emitPrettyPrint`, `emitJson` and
`buildMessage` were each documented as an unimplemented stub, and all four have been implemented for
some time. Internal framing is where stale claims hide.

The gate gains a **third pass** with its own rule array, extractor and self-tests, written in the
language of source rather than markdown. It scans `/** */` text only, line by line and again over
the block reflowed the way a hover tooltip reflows it, because a multi-token rule is blind to a
violation that straddles a wrap. `//` and `/* */` comments are deliberately not covered and keep
their identifiers: they do not reach `dist`, and the convention names source comments as a place
identifiers belong. Every claim was checked red against a seeded violation, including one split
across a wrap that a line-only grep scores 0 on, and including an extractor that strips the comment
leader before testing the terminator, which reports 66 false hits on a clean tree.

The limits are stated rather than implied shut, because "0 on all six rules" is a statement about
those rules and not about the whole directive. Measured on the built `dist/index.d.ts`, what still
ships is 144 lines carrying `D-NN` internal decision numbers and 51 lines carrying item identifiers
from nine prefixes the rule set does not hold (`HELPERS`, `BIP`, `PROF`, `SER`, `MODEL`, `PARSE`,
`WR`, `TOL`, `TYPES`). `D-NN` stays uncaught deliberately, because
legacy SNOMED RT codes are axis-prefixed in exactly that shape (`D-13000`, `T-32000`, `M-80003`);
the item identifiers need new prefixes, which is a rule change owing its own negative self-tests,
not something to smuggle in behind a prose sweep. The 18 `Plan N` build-order lines in the built
declaration file were swept by hand in this change because that is prose rather than a rule. Separately, `dist/` is untracked
build output, so this gates dist's source and not dist itself, which holds only while the dts build
copies doc text verbatim.

Documentation, tooling and CI only. No change to the published package surface, parser behavior, or
warning codes.
