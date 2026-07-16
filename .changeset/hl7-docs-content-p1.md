---
"@cosyte/hl7": patch
---

Bring `docs-content/` to the full canonical **Diátaxis spine** (DOCS-CONTENT-P1). On top of the
existing Overview + Core Concepts, add **Installation**, **Quickstart**, **Guides**, and
**Troubleshooting** (with a Known Limitations section) categories, authored from the real API against
synthetic messages. `@cosyte/hl7` is the reference exemplar every other cosyte parser's docs copy, so
this spine is the template of record.

Also wire the **doc/code-agreement gate**: `test/docs-content.test.ts` runs
`@cosyte/vitest-config@^0.0.2`'s `docSnippetSuite()` over `docs-content/`, so every ` ```ts runnable `
snippet is compiled, executed against the built package, and its inline `// =>` assertions checked —
a documented example can never silently drift from the code (the documentation analog of the
conformance runners). Bumps the `@cosyte/vitest-config` devDependency `^0.0.1 → ^0.0.2` for the
`/snippets` subpath.

Documentation + test-tooling only — no runtime/API change; `@cosyte/hl7` still ships zero runtime
dependencies and the published artifact is unchanged.
