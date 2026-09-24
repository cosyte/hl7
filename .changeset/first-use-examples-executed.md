---
"@cosyte/hl7": patch
---

Docs: the first example in the README and the first example in the quickstart are now executed by the test suite, read straight out of the page they are printed on.

Both examples now parse the same committed synthetic ADT^A01 fixture, byte for byte, so the message a reader copies is one the PHI scan has already read. The README block is run against the package entry point and its printed output is compared with the output block beside it; the quickstart block is run against the built package with every claimed value asserted. Changing one value in either example's message or its claimed output fails the suite.

The quickstart's first example did not compile in a strict TypeScript project: it read fields off `msg.patient`, which is `undefined` for a message with no PID segment. It now reads them with `msg.patient?.`, as the README already did, and the suite compiles both examples with the settings `tsc --init` writes for a new project, so an example that does not compile fails it.

Every install command the README and the installation page print is checked against the package's own name.

The hand-kept copy of the README example under `examples/` is gone: the README itself is what runs now, so there is no second copy to drift.
