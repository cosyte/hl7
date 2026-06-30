---
"@cosyte/hl7": patch
---

Adopt the **documentation IA spine** (DOCS-D5) in `docs-content/`. The orphaned
`spec-notes-coding-system.md` / `spec-notes-structure.md` / `spec-notes-version-matrix.md`
files now appear under a canonical **Core Concepts** category on `docs.cosyte.com`
(they were previously authored on disk but unreachable from any sidebar route).
Each carries minimal frontmatter (`id` / `title` / `sidebar_label`) so the sidebar
text stays concise without changing prose. Also converted the two CommonMark
autolinks in `spec-notes-coding-system.md` (`<https://…>`) to Docusaurus-MDX-safe
`[text](url)` form — autolinks parse as JSX in MDX 3 and were silently broken.

This is a documentation-only patch — no runtime/API change; `@cosyte/hl7` ships
zero runtime dependencies and the published artifact is unchanged. It makes the
hl7 package the **reference exemplar** for the umbrella's
`documentation/conventions.md` §Docs contract IA spine that every cosyte package
will adopt over time.
