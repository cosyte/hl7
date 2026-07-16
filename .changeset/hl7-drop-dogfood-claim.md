---
"@cosyte/hl7": patch
---

Drop the "Dogfooded in production" claim from the README feature list.

The bullet asserted the package was "used internally on healthcare-integration projects; the
credibility bar matches the company's". No engagement has run it — the umbrella backlog's
`REAL-CORPUS` item is still waiting on real HL7 v2 feeds *from* an engagement — so the claim was
not accurate and is removed ahead of the first public release.

`README.md` ships inside the published tarball (`files: [dist, README.md, LICENSE, CHANGELOG.md]`),
so this is a user-visible docs change. No runtime or API change.
