---
phase: 09-rename-package-to-cosyte-hl7
plan: 02
type: execute
wave: 2
depends_on: []
files_modified:
  - src/index.ts
  - src/builder/build-message.ts
  - src/helpers/allergies.ts
  - src/helpers/diagnoses.ts
  - src/helpers/index.ts
  - src/helpers/insurance.ts
  - src/helpers/meta.ts
  - src/helpers/next-of-kin.ts
  - src/helpers/observations.ts
  - src/helpers/orders.ts
  - src/helpers/patient.ts
  - src/helpers/pick-mrn.ts
  - src/helpers/types.ts
  - src/helpers/visit.ts
  - src/model/dot-path.ts
  - src/model/field.ts
  - src/model/message.ts
  - src/model/segment.ts
  - src/model/types/ce.ts
  - src/model/types/cwe.ts
  - src/model/types/cx.ts
  - src/model/types/hd.ts
  - src/model/types/nm.ts
  - src/model/types/pl.ts
  - src/model/types/ts.ts
  - src/model/types/xad.ts
  - src/model/types/xcn.ts
  - src/model/types/xpn.ts
  - src/model/types/xtn.ts
  - src/parser/dates.ts
  - src/parser/delimiters.ts
  - src/parser/errors.ts
  - src/parser/escapes.ts
  - src/parser/index.ts
  - src/parser/known-segments.ts
  - src/parser/mllp.ts
  - src/parser/normalize.ts
  - src/parser/segments.ts
  - src/parser/tokenize.ts
  - src/parser/types.ts
  - src/parser/warnings.ts
  - src/profiles/athena.ts
  - src/profiles/cerner.ts
  - src/profiles/default.ts
  - src/profiles/define.ts
  - src/profiles/epic.ts
  - src/profiles/genericLab.ts
  - src/profiles/index.ts
  - src/profiles/meditech.ts
  - src/serialize/emit-field.ts
  - src/serialize/to-json.ts
  - test/model-public-exports.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Every JSDoc @example in src/ imports from @cosyte/hl7 (never @cosyte/hl7-parser)"
    - "src/index.ts and src/parser/index.ts file-header docblocks name the package as @cosyte/hl7"
    - "test/model-public-exports.test.ts asserts the public import path as @cosyte/hl7"
  artifacts:
    - path: "src/index.ts"
      provides: "Barrel re-exports + file-header docblock naming the package as @cosyte/hl7"
      contains: "@cosyte/hl7"
    - path: "src/parser/index.ts"
      provides: "Parser barrel with updated file-header docblock"
      contains: "@cosyte/hl7"
    - path: "test/model-public-exports.test.ts"
      provides: "Import-path assertions under the new name"
      contains: "@cosyte/hl7"
  key_links:
    - from: "JSDoc @example blocks in every src/**/*.ts public export"
      to: "IntelliSense preview shown to library consumers"
      via: "TypeScript language server parses JSDoc and shows examples on hover"
      pattern: 'from ["\x27]@cosyte/hl7["\x27]'
    - from: "test/model-public-exports.test.ts"
      to: "Public API surface (src/index.ts barrel)"
      via: "Test asserts what consumers see"
      pattern: "@cosyte/hl7"
---

<objective>
Sweep all source files under `src/` (51 .ts files confirmed to contain `@cosyte/hl7-parser`) plus `test/model-public-exports.test.ts` (import-path assertions) to replace the old package name with `@cosyte/hl7`. The occurrences are in:
- JSDoc `@example` blocks that show `import ... from "@cosyte/hl7-parser"` — these drive consumer IntelliSense per the CLAUDE.md guardrail "JSDoc (with `@example`) on every public export — feeds IntelliSense."
- File-header docblocks in `src/index.ts` and `src/parser/index.ts` that name the package explicitly.
- An import-path assertion test in `test/model-public-exports.test.ts` that verifies the public barrel.

Purpose: Source-level identity consistency. Every example a consumer sees in their editor's hover preview must show the new name, or the rename is leaky.

Output: 51 files swept. After this plan:
- Zero occurrences of `@cosyte/hl7-parser` in `src/` and `test/`
- Every `@example` block imports from `@cosyte/hl7`
- TypeScript still compiles cleanly (no import resolution changes — these are JSDoc string literals, not real imports)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sweep all src/**/*.ts files (49 files + 2 index barrels) for @cosyte/hl7-parser → @cosyte/hl7</name>
  <files>
    src/index.ts, src/builder/build-message.ts,
    src/helpers/allergies.ts, src/helpers/diagnoses.ts, src/helpers/index.ts, src/helpers/insurance.ts,
    src/helpers/meta.ts, src/helpers/next-of-kin.ts, src/helpers/observations.ts, src/helpers/orders.ts,
    src/helpers/patient.ts, src/helpers/pick-mrn.ts, src/helpers/types.ts, src/helpers/visit.ts,
    src/model/dot-path.ts, src/model/field.ts, src/model/message.ts, src/model/segment.ts,
    src/model/types/ce.ts, src/model/types/cwe.ts, src/model/types/cx.ts, src/model/types/hd.ts,
    src/model/types/nm.ts, src/model/types/pl.ts, src/model/types/ts.ts, src/model/types/xad.ts,
    src/model/types/xcn.ts, src/model/types/xpn.ts, src/model/types/xtn.ts,
    src/parser/dates.ts, src/parser/delimiters.ts, src/parser/errors.ts, src/parser/escapes.ts,
    src/parser/index.ts, src/parser/known-segments.ts, src/parser/mllp.ts, src/parser/normalize.ts,
    src/parser/segments.ts, src/parser/tokenize.ts, src/parser/types.ts, src/parser/warnings.ts,
    src/profiles/athena.ts, src/profiles/cerner.ts, src/profiles/default.ts, src/profiles/define.ts,
    src/profiles/epic.ts, src/profiles/genericLab.ts, src/profiles/index.ts, src/profiles/meditech.ts,
    src/serialize/emit-field.ts, src/serialize/to-json.ts
  </files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-08 — only CHANGELOG may retain old name)
    - CLAUDE.md (guardrail: JSDoc with @example on every public export feeds IntelliSense; this wave keeps that signal accurate under the new name)
    - src/index.ts (confirm file-header docblock format before sweeping — understand the shape you're preserving)
    - src/parser/index.ts (confirm file-header docblock format)
    - Any 2–3 files from the helpers/model/parser/profiles/serialize/builder subtrees to confirm the old name appears only in `@example` blocks or file-header docblocks (not in real `import` statements — real imports stay relative within src/)
  </read_first>
  <action>
    Perform a global literal-string replacement of `@cosyte/hl7-parser` → `@cosyte/hl7` across every `.ts` file under `src/`. The old name is a scoped package path with no substring collisions against `@cosyte/hl7` (CONTEXT.md code_context confirms `@cosyte/hl7` is not used standalone anywhere in the repo today).

    Recommended mechanic (efficient and auditable):
    ```
    # Confirm files before sweep
    grep -rln "@cosyte/hl7-parser" src/ | sort
    # Expected: 51 files

    # Batch replace
    grep -rl "@cosyte/hl7-parser" src/ | xargs sed -i 's|@cosyte/hl7-parser|@cosyte/hl7|g'

    # Verify after sweep
    grep -rln "@cosyte/hl7-parser" src/
    # Expected: (no output)
    grep -rc "@cosyte/hl7" src/ | grep -v ':0$' | wc -l
    # Expected: 51 (same count — refs are now under the new name)
    ```

    Alternatively, per-file Edit-tool calls are acceptable but slower. Either way, the state after Task 1 must be zero `@cosyte/hl7-parser` strings anywhere under `src/`.

    Context about what's being rewritten (do NOT broaden scope):
    - The `@cosyte/hl7-parser` strings in these files are inside `/** @example ... */` JSDoc blocks and file-header docblocks. They are string literals inside code comments, NOT real TS imports. Real imports between src/ modules are relative (e.g., `from "../parser"`) and are untouched.
    - `src/index.ts` and `src/parser/index.ts` additionally have file-header docblocks (`/** ... */` at top of file) that name the package explicitly — those get rewritten by the same sed pass.
    - Do not touch file names, export names, function signatures, or any logic — this is a comment/string-only sweep.

    After the sweep, run `pnpm typecheck` to confirm no cascading breakage (there should be none — JSDoc is not type-checked beyond its tsdoc rules). Do NOT run `pnpm test`, `pnpm lint`, `pnpm build`, or `pnpm examples` in this plan; Wave 4 runs the full pipeline once.

    One safety note: if typecheck surfaces an eslint-plugin-jsdoc rule that complains about example-block tags now pointing at a never-before-seen package, document it and hand off to Wave 4 — but this is not expected since the new name `@cosyte/hl7` is a valid npm package spec syntactically.
  </action>
  <verify>
    <automated>test "$(grep -rln '@cosyte/hl7-parser' src/ | wc -l)" = "0" && test "$(grep -rln '@cosyte/hl7' src/ | wc -l)" -ge "51" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rln "@cosyte/hl7-parser" src/` returns nothing (empty output, exit code 1 from grep)
    - `grep -rln "@cosyte/hl7" src/ | wc -l` returns at least `51` (every file that had the old name now has the new name)
    - `grep -rln '@cosyte/hl7' src/index.ts src/parser/index.ts` matches BOTH files (the two barrels with file-header docblocks)
    - `pnpm typecheck` exits 0 with zero errors
    - No file under `src/` has been renamed, added, or deleted (the sweep is pure text replacement)
    - Spot check: `grep '@example' src/helpers/patient.ts | head -1` shows the example block still present (JSDoc structure preserved)
  </acceptance_criteria>
  <done>
    All 51 `src/**/*.ts` files have `@cosyte/hl7-parser` replaced with `@cosyte/hl7`. IntelliSense previews now show the new name. `pnpm typecheck` passes, confirming the sweep didn't introduce accidental TS-visible damage.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update test/model-public-exports.test.ts import-path assertions</name>
  <files>test/model-public-exports.test.ts</files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-08 — only CHANGELOG may retain old name)
    - test/model-public-exports.test.ts (1 occurrence — the assertion tests what name public consumers see)
  </read_first>
  <action>
    Edit `test/model-public-exports.test.ts` and replace the single occurrence of `@cosyte/hl7-parser` with `@cosyte/hl7`.

    This file asserts the shape of the public barrel export path — i.e., it is testing what the `from "@cosyte/hl7"` import looks like to downstream consumers. After this edit the test encodes the new name.

    Read the full file first (it's a small test) to understand whether the occurrence is a literal string in an assertion, a comment, or an import inside the test itself. In all three cases the replacement is the same (literal substitution).

    Do NOT touch any other files under `test/` — a full `grep -rln "@cosyte/hl7-parser" test/` BEFORE this task shows only `test/model-public-exports.test.ts`, so no other test files need changes. (This matches the discovery grep in CONTEXT.md code_context.)

    Do NOT run vitest in this plan — Wave 4 is the single place that runs the full test suite. Confirming typecheck stays green (via the prior task's typecheck) is enough here; the test file will be executed as part of Wave 4's `pnpm test`.
  </action>
  <verify>
    <automated>test "$(grep -c '@cosyte/hl7-parser' test/model-public-exports.test.ts)" = "0" && grep -q '@cosyte/hl7' test/model-public-exports.test.ts && test "$(grep -rln '@cosyte/hl7-parser' test/ | wc -l)" = "0"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" test/model-public-exports.test.ts` returns `0`
    - `grep -q "@cosyte/hl7" test/model-public-exports.test.ts` exits 0
    - `grep -rln "@cosyte/hl7-parser" test/` returns nothing (no other test files carry the old name)
    - The file still parses as TypeScript (caught by the typecheck run in Task 1's scope — not re-run here, but a syntactically invalid edit would have already been visible)
  </acceptance_criteria>
  <done>
    `test/model-public-exports.test.ts` asserts the public import path as `@cosyte/hl7`. The entire `test/` subtree is now free of the old name.
  </done>
</task>

</tasks>

<verification>
After both tasks complete, run:

```
# No old-name strings in src/ or test/
grep -rln "@cosyte/hl7-parser" src/ test/
# Expected: no output

# New name is present everywhere src/ or test/ previously had the old name
grep -rln "@cosyte/hl7" src/ test/ | wc -l
# Expected: 52 (51 src + 1 test)

# TypeScript still compiles cleanly — the sweep didn't break anything
pnpm typecheck
# Expected: exit 0
```

Full test suite and lint/build are NOT re-run here; Wave 4 owns the end-to-end pipeline verification. This wave's contract is: text replacement complete, typecheck green.
</verification>

<success_criteria>
- `grep -rln "@cosyte/hl7-parser" src/ test/` returns nothing
- At least 52 files under `src/` and `test/` contain `@cosyte/hl7`
- `pnpm typecheck` exits 0
- No .ts files have been renamed, added, or deleted — only their text content changed
- JSDoc `@example` blocks on public exports in `src/helpers/`, `src/model/`, `src/parser/`, `src/profiles/`, `src/serialize/`, `src/builder/` all show imports from `@cosyte/hl7` (spot-check any 2–3 files to confirm)
</success_criteria>

<output>
After completion, create `.planning/phases/09-rename-package-to-cosyte-hl7/09-02-SUMMARY.md` with:
- Total file count edited (expected: 51 src + 1 test = 52)
- `pnpm typecheck` stdout/exit code
- Any files where the sed/Edit sweep behaved unexpectedly (e.g., a file where grep counts went from N to not-0)
- Confirmation that `grep -rln "@cosyte/hl7-parser" src/ test/` returns empty
</output>
