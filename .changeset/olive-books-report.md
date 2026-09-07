---
"@cosyte/hl7": patch
---

Docs: the README no longer advertises shipped capability as future work.

The roadmap section listed three items as not yet available that the package already exports: incremental parsing of batch files too large to buffer, JSON Schema and Zod emission for what `toJSON()` returns, and profile-declared field names carried into the type system. It also named `createHL7Stream()`, a symbol this package has never exported, when the shipped streaming parser is `parseStream`. The status section repeated the same claims and told the reader that nothing on that list was exported yet, so the front page a consumer reads on npm and on GitHub described three available features as unavailable and pointed at an entry point that does not exist.

The roadmap now records an empty forward list and says where each of those capabilities is documented, and the status section states that they ship and are covered by its stability claim. The permanently out-of-scope list is unchanged, and no behaviour, export or type changed.
