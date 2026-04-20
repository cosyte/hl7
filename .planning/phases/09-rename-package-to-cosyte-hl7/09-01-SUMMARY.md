---
phase: 09-rename-package-to-cosyte-hl7
plan: 01
status: complete
date: 2026-04-20
---

# Plan 09-01: Identity Files Rename — SUMMARY

## What was built

Renamed identity-level files (root configs + user-facing docs) from `@cosyte/hl7-parser` to `@cosyte/hl7`. Three atomic commits for the three tasks.

## Before/after occurrence counts

| File | Before (`@cosyte/hl7-parser`) | After | Before (`cosyte/hl7-parser` incl. URL) | After |
|------|------:|------:|------:|------:|
| package.json | 1 | 0 | 4 | 0 |
| CHANGELOG.md | 2 | 1 (allowlisted Notes: line) | 4 | 1 |
| README.md | 29 | 0 | 30 | 0 |
| CONTRIBUTING.md | 2 | 0 | 3 | 0 |
| CLAUDE.md | 2 | 0 | 2 | 0 |
| tsup.config.ts | 1 | 0 | 1 | 0 |
| vitest.config.ts | 1 | 0 | 1 | 0 |

## Key-files.created / modified

- `package.json` — name `@cosyte/hl7`, toolkit description (D-02), 9 keywords incl. builder/serializer/toolkit (D-03), github.com/cosyte/hl7 URLs (D-04)
- `CHANGELOG.md` — `[0.1.0]` rewritten under new name; D-07 Notes breadcrumb appended verbatim
- `README.md`, `CONTRIBUTING.md`, `CLAUDE.md` — sed sweep
- `tsup.config.ts`, `vitest.config.ts` — header comment references renamed

## D-07 breadcrumb (exact line in CHANGELOG.md)

```
Notes: Package renamed from `@cosyte/hl7-parser` to `@cosyte/hl7` before first publish. No consumers existed under the previous name.
```

## Commits

- `ff450d9` — chore(09-01): rename package identity to @cosyte/hl7 in package.json
- `3ebdd17` — docs(09-01): rewrite CHANGELOG under @cosyte/hl7 with D-07 rename breadcrumb
- `3893b9e` — docs(09-01): sweep root docs and configs to @cosyte/hl7

## Deviations

None. All acceptance criteria met verbatim. The `cosyte/hl7-parser` URL references (outside the `@cosyte/*` scoped name) in README/CONTRIBUTING/CHANGELOG were included in the sweep to keep D-04 URL consistency — not called out explicitly in the plan but implied by "update any GitHub repo URLs appearing in README" and consistent with D-04.

## Self-Check: PASSED

- `grep -c "@cosyte/hl7-parser" package.json CHANGELOG.md README.md CONTRIBUTING.md CLAUDE.md tsup.config.ts vitest.config.ts` returns exactly `1` (CHANGELOG Notes: line)
- `node -e "const p=require('./package.json'); console.log(p.name, p.version, p.keywords.length)"` returns `@cosyte/hl7 0.1.0 9`
