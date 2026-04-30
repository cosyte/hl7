---
phase: 09-rename-package-to-cosyte-hl7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - CHANGELOG.md
  - README.md
  - CONTRIBUTING.md
  - CLAUDE.md
  - tsup.config.ts
  - vitest.config.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "package.json advertises the new name @cosyte/hl7 and toolkit framing"
    - "CHANGELOG.md retains exactly one legacy-name reference — the Notes: breadcrumb line — per D-07/D-08"
    - "Repo-root docs and configs use @cosyte/hl7 consistently; no old-name strings remain in them"
  artifacts:
    - path: "package.json"
      provides: "Renamed package identity + toolkit description + toolkit keywords + updated URLs"
      contains: '"name": "@cosyte/hl7"'
    - path: "CHANGELOG.md"
      provides: "Rewritten [0.1.0] entry under the new name + Notes: breadcrumb (D-07)"
      contains: "Package renamed from"
    - path: "README.md"
      provides: "Install snippet + 29 import/code refs updated to @cosyte/hl7"
      contains: "@cosyte/hl7"
  key_links:
    - from: "package.json.name"
      to: "pnpm publish target"
      via: "pnpm reads name field"
      pattern: '"name": "@cosyte/hl7"'
    - from: "package.json.repository.url"
      to: "github.com/cosyte/hl7"
      via: "npm registry metadata"
      pattern: "github.com/cosyte/hl7"
---

<objective>
Rename identity-level files (root configs + user-facing docs) from `@cosyte/hl7-parser` to `@cosyte/hl7`. These are the files that drive package identity (`package.json`), release history (`CHANGELOG.md`), and public-facing docs (`README.md`, `CONTRIBUTING.md`, `CLAUDE.md`). Also update the two root tool-config files (`tsup.config.ts`, `vitest.config.ts`), which contain comment/string references to the old name.

Purpose: Establish the new canonical name across the repo's identity surface before source and examples are swept. `package.json` is the single source of truth for publish behavior; this wave makes it authoritative.

Output: 7 files rewritten. After this plan:
- `package.json.name` = `@cosyte/hl7`; description + keywords + URLs updated per D-02/D-03/D-04
- `CHANGELOG.md` has the ONE permitted legacy-name occurrence (the D-07 Notes: line) and nothing else
- `README.md`, `CONTRIBUTING.md`, `CLAUDE.md` carry no old-name strings
- `tsup.config.ts`, `vitest.config.ts` carry no old-name strings
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite package.json identity fields (name, description, keywords, URLs)</name>
  <files>package.json</files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-01, D-02, D-03, D-04 locked)
    - package.json (current state)
  </read_first>
  <action>
    Edit `package.json` top-level identity fields per CONTEXT.md decisions:

    1. **name** — change `"name": "@cosyte/hl7-parser"` to `"name": "@cosyte/hl7"` (D-01 — first publish ships as 0.1.0 under new name; do NOT bump version).
    2. **description** — replace current description with the exact D-02 text:
       `"description": "Developer-focused HL7 v2 toolkit for Node.js and TypeScript — parser, builder, mutator, serializer, and one-line helpers."`
    3. **keywords** — per D-03, KEEP all existing entries (`hl7`, `hl7v2`, `parser`, `healthcare`, `interoperability`, `typescript`) and APPEND three new entries in this exact order: `"builder"`, `"serializer"`, `"toolkit"`. Final array must be exactly:
       `["hl7", "hl7v2", "parser", "healthcare", "interoperability", "typescript", "builder", "serializer", "toolkit"]`
    4. **homepage** — change from `"https://github.com/cosyte/hl7-parser#readme"` to `"https://github.com/cosyte/hl7#readme"` (D-04).
    5. **bugs.url** — change from `"https://github.com/cosyte/hl7-parser/issues"` to `"https://github.com/cosyte/hl7/issues"` (D-04).
    6. **repository.url** — change from `"git+https://github.com/cosyte/hl7-parser.git"` to `"git+https://github.com/cosyte/hl7.git"` (D-04).

    Leave `version` at `0.1.0` (D-01), and leave all other fields (scripts, devDependencies, engines, exports, files, packageManager, etc.) untouched.

    Do NOT run `pnpm install` yet — the lockfile regeneration happens as part of Wave 4 verification to avoid churning state in Wave 1.
  </action>
  <verify>
    <automated>test "$(grep -c '"name": "@cosyte/hl7"' package.json)" = "1" && test "$(grep -c '@cosyte/hl7-parser' package.json)" = "0" && test "$(grep -c 'Developer-focused HL7 v2 toolkit' package.json)" = "1" && grep -q '"builder"' package.json && grep -q '"serializer"' package.json && grep -q '"toolkit"' package.json && grep -q 'github.com/cosyte/hl7#readme' package.json && grep -q 'github.com/cosyte/hl7/issues' package.json && grep -q 'github.com/cosyte/hl7.git' package.json && ! grep -q 'github.com/cosyte/hl7-parser' package.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" package.json` returns `0`
    - `grep -c '"name": "@cosyte/hl7"' package.json` returns `1`
    - `grep -q 'Developer-focused HL7 v2 toolkit for Node.js and TypeScript' package.json` exits 0
    - `grep -q '"builder"' package.json && grep -q '"serializer"' package.json && grep -q '"toolkit"' package.json` exits 0
    - `grep -q 'github.com/cosyte/hl7#readme' package.json` exits 0 AND `grep -q 'github.com/cosyte/hl7-parser' package.json` exits 1 (no matches)
    - `jq -r .version package.json` returns `0.1.0` (unchanged per D-01)
    - `jq -r .name package.json` returns `@cosyte/hl7`
    - `jq -r '.keywords | length' package.json` returns `9`
  </acceptance_criteria>
  <done>
    package.json reflects the new name, toolkit description, toolkit keywords, and updated GitHub URLs per D-01/D-02/D-03/D-04. Zero occurrences of `@cosyte/hl7-parser` remain in the file. Version is still 0.1.0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite CHANGELOG.md under new name and append D-07 migration breadcrumb</name>
  <files>CHANGELOG.md</files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-07 locked breadcrumb text; D-08 — CHANGELOG Notes: line is the ONLY permitted surviving occurrence of the old name)
    - CHANGELOG.md (current state — contains old name on lines 24 and 55)
  </read_first>
  <action>
    Edit `CHANGELOG.md`:

    1. On line 24 (the `[0.1.0]` release intro sentence), replace `` `@cosyte/hl7-parser` `` with `` `@cosyte/hl7` ``.
       Current: `Initial public release of \`@cosyte/hl7-parser\`. First tagged version with a`
       After:   `Initial public release of \`@cosyte/hl7\`. First tagged version with a`
    2. On line 55 (the XPN namespace example), replace `` `"@cosyte/hl7-parser"` `` with `` `"@cosyte/hl7"` ``.
       Current: `` `import { HL7 } from "@cosyte/hl7-parser"; type T = HL7.XPN`. ``
       After:   `` `import { HL7 } from "@cosyte/hl7"; type T = HL7.XPN`. ``
    3. Append the D-07 migration breadcrumb line at the bottom of the `[0.1.0]` entry (under an appropriate `### Notes` subsection if one fits the Keep-a-Changelog style already used by this file, or as a standalone `Notes:` line if that matches the existing prose style). Use the EXACT text from CONTEXT.md specifics:
       ``Notes: Package renamed from `@cosyte/hl7-parser` to `@cosyte/hl7` before first publish. No consumers existed under the previous name.``

       This `Notes:` line is the ONE permitted occurrence of `@cosyte/hl7-parser` anywhere in the repo after Phase 9 completes (D-08). The backticks around the old name on that line are required — they are what the final grep sweep will detect and allowlist.

    After editing, `grep -c "@cosyte/hl7-parser" CHANGELOG.md` MUST return exactly `1`.

    Read the file in full before editing so the breadcrumb is placed inside the `[0.1.0]` section, not at the absolute bottom of the file where it could land under `[Unreleased]` or a footer.
  </action>
  <verify>
    <automated>test "$(grep -c '@cosyte/hl7-parser' CHANGELOG.md)" = "1" && grep -q 'Package renamed from `@cosyte/hl7-parser` to `@cosyte/hl7` before first publish' CHANGELOG.md && grep -q 'Initial public release of `@cosyte/hl7`' CHANGELOG.md && grep -q 'import { HL7 } from "@cosyte/hl7"' CHANGELOG.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" CHANGELOG.md` returns EXACTLY `1` (the Notes: line, per D-08)
    - `grep -q 'Package renamed from \`@cosyte/hl7-parser\` to \`@cosyte/hl7\` before first publish. No consumers existed under the previous name.' CHANGELOG.md` exits 0 (verbatim D-07 text present)
    - `grep -q 'Initial public release of \`@cosyte/hl7\`' CHANGELOG.md` exits 0 (line 24 rewritten)
    - `grep -q 'import { HL7 } from "@cosyte/hl7"' CHANGELOG.md` exits 0 (line 55 rewritten)
    - The ONE remaining `@cosyte/hl7-parser` occurrence is inside the same line as `"Package renamed from"` (grep -n must show them on the same line number)
  </acceptance_criteria>
  <done>
    CHANGELOG.md `[0.1.0]` entry reads under the new name. A single breadcrumb line containing the old name remains (D-07 exact text), serving as the allowlisted occurrence for the final Wave 4 grep sweep.
  </done>
</task>

<task type="auto">
  <name>Task 3: Sweep root docs and configs (README, CONTRIBUTING, CLAUDE, tsup.config.ts, vitest.config.ts)</name>
  <files>README.md, CONTRIBUTING.md, CLAUDE.md, tsup.config.ts, vitest.config.ts</files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-08 — only CHANGELOG Notes: line may retain old name; D-09 — no README install migration note needed)
    - README.md (29 occurrences — install snippet + import examples + cookbook snippets)
    - CONTRIBUTING.md (2 occurrences)
    - CLAUDE.md (2 occurrences — header + key-files section)
    - tsup.config.ts (1 occurrence)
    - vitest.config.ts (1 occurrence)
  </read_first>
  <action>
    For EACH of the 5 files below, replace every occurrence of the literal string `@cosyte/hl7-parser` with `@cosyte/hl7`. The old name is a scoped package path; there are no substring collisions to worry about (CONTEXT.md code_context confirms `@cosyte/hl7` is not currently used standalone anywhere).

    Files and expected occurrence counts (verify with grep before editing):
    1. `README.md` — 29 occurrences. These are install snippets (`pnpm add @cosyte/hl7-parser`), import examples in recipes, and the footer/repo URL lines. Per D-09, do NOT add a migration note to the Install section — nothing was published under the old name, so there's nothing to migrate. Also update any GitHub repo URLs appearing in README (`github.com/cosyte/hl7-parser` → `github.com/cosyte/hl7`) if present, to match the package.json URL rename (D-04).
    2. `CONTRIBUTING.md` — 2 occurrences. Replace both.
    3. `CLAUDE.md` — 2 occurrences (the `# @cosyte/hl7-parser` H1 and the `**\`@cosyte/hl7-parser\`**` mention in the Project section). Replace both. After this edit, `CLAUDE.md` describes the project under the new name; downstream agents in Waves 2–4 will see the new name when they re-read CLAUDE.md.
    4. `tsup.config.ts` — 1 occurrence (likely a comment header or banner string).
    5. `vitest.config.ts` — 1 occurrence (likely a comment header).

    Mechanics: you may do this as a batch find-replace across these five files (e.g., via `sed -i 's|@cosyte/hl7-parser|@cosyte/hl7|g' README.md CONTRIBUTING.md CLAUDE.md tsup.config.ts vitest.config.ts`) or file-by-file via the Edit tool. Whichever method, verify with the grep acceptance criteria below afterwards. Also sweep any `github.com/cosyte/hl7-parser` repo URLs to `github.com/cosyte/hl7` in the same pass (D-04 consistency).

    Do NOT modify `package.json`, `CHANGELOG.md` (handled in Tasks 1 and 2), or anything under `src/`, `test/`, `examples/` (those are Waves 2 and 3).
  </action>
  <verify>
    <automated>test "$(grep -c '@cosyte/hl7-parser' README.md)" = "0" && test "$(grep -c '@cosyte/hl7-parser' CONTRIBUTING.md)" = "0" && test "$(grep -c '@cosyte/hl7-parser' CLAUDE.md)" = "0" && test "$(grep -c '@cosyte/hl7-parser' tsup.config.ts)" = "0" && test "$(grep -c '@cosyte/hl7-parser' vitest.config.ts)" = "0" && grep -q '@cosyte/hl7' README.md && grep -q '@cosyte/hl7' CONTRIBUTING.md && grep -q '@cosyte/hl7' CLAUDE.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" README.md` returns `0`
    - `grep -c "@cosyte/hl7-parser" CONTRIBUTING.md` returns `0`
    - `grep -c "@cosyte/hl7-parser" CLAUDE.md` returns `0`
    - `grep -c "@cosyte/hl7-parser" tsup.config.ts` returns `0`
    - `grep -c "@cosyte/hl7-parser" vitest.config.ts` returns `0`
    - `grep -c "@cosyte/hl7" README.md` returns at least `29` (the renamed refs are now under the new name, same count or close)
    - `grep -c "github.com/cosyte/hl7-parser" README.md` returns `0` (D-04 URL consistency)
  </acceptance_criteria>
  <done>
    All 5 identity-adjacent root docs and configs carry only the new name. Together with Tasks 1 and 2, every root-level identity file is renamed; only CHANGELOG.md retains the single allowlisted old-name occurrence.
  </done>
</task>

</tasks>

<verification>
After this plan completes, the set of root-level files {package.json, CHANGELOG.md, README.md, CONTRIBUTING.md, CLAUDE.md, tsup.config.ts, vitest.config.ts} must satisfy:

```
# Exactly one occurrence, and it must be in CHANGELOG.md on the Notes: breadcrumb line
grep -rn "@cosyte/hl7-parser" package.json CHANGELOG.md README.md CONTRIBUTING.md CLAUDE.md tsup.config.ts vitest.config.ts
# Expected output: exactly one line, in CHANGELOG.md, containing the D-07 breadcrumb text
```

No TypeScript, test, or build invocation is required at this wave — the files edited here do not alter runtime behavior, only identity strings. Wave 4 runs the full pipeline after all three rename waves land.
</verification>

<success_criteria>
- All 3 tasks pass their automated acceptance criteria
- `grep -c "@cosyte/hl7-parser"` across the seven edited files totals exactly `1` (the CHANGELOG Notes: line)
- `package.json` declares name `@cosyte/hl7`, version `0.1.0`, description per D-02, 9 keywords including `builder`/`serializer`/`toolkit`, and `github.com/cosyte/hl7` URLs
- CHANGELOG.md `[0.1.0]` entry references the new name; the sole old-name breadcrumb appears verbatim per D-07
- Root docs (README, CONTRIBUTING, CLAUDE) and root tool configs (tsup, vitest) reference only the new name
</success_criteria>

<output>
After completion, create `.planning/phases/09-rename-package-to-cosyte-hl7/09-01-SUMMARY.md` with:
- Per-file before/after occurrence counts for `@cosyte/hl7-parser`
- The exact D-07 breadcrumb line as it now appears in CHANGELOG.md (copy-paste)
- Any deviations from the plan (should be none — this is a mechanical rename)
</output>
