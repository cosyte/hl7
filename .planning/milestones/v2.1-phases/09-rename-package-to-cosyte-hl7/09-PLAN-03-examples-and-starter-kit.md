---
phase: 09-rename-package-to-cosyte-hl7
plan: 03
type: execute
wave: 3
depends_on: []
files_modified:
  - examples/README.md
  - examples/extract-patient-info.ts
  - examples/read-lab-results.ts
  - examples/modify-and-resend.ts
  - examples/profile-starter-kit/package.json
  - examples/profile-starter-kit/src/index.ts
  - examples/profile-starter-kit/test/profile.test.ts
  - examples/profile-starter-kit/tsup.config.ts
  - examples/profile-starter-kit/README.md
  - examples/profile-starter-kit/CUSTOMIZING.md
  - examples/profile-starter-kit/pnpm-lock.yaml
autonomous: true
requirements: []
must_haves:
  truths:
    - "The three runnable examples (extract-patient-info, read-lab-results, modify-and-resend) import from @cosyte/hl7"
    - "examples/README.md references the new name consistently"
    - "examples/profile-starter-kit/ references @cosyte/hl7 as its peer/dev-dep name; internal package.json keys (peerDependencies, devDependencies, peerDependenciesMeta) all use the new name"
    - "examples/profile-starter-kit/pnpm-lock.yaml reflects the new name in all entries"
  artifacts:
    - path: "examples/extract-patient-info.ts"
      provides: "First runnable example — updated import"
      contains: 'from "@cosyte/hl7"'
    - path: "examples/profile-starter-kit/package.json"
      provides: "Starter kit package.json with renamed peerDependencies / devDependencies / peerDependenciesMeta keys"
      contains: '"@cosyte/hl7"'
    - path: "examples/profile-starter-kit/pnpm-lock.yaml"
      provides: "Lockfile regenerated (or text-swept) to reference the new name"
      contains: "@cosyte/hl7"
  key_links:
    - from: "examples/*.ts"
      to: "compiled @cosyte/hl7 package"
      via: "tsx runtime resolution via pnpm workspace / node_modules"
      pattern: 'from ["\x27]@cosyte/hl7["\x27]'
    - from: "examples/profile-starter-kit/package.json peerDependencies"
      to: "parent package name"
      via: "pnpm resolves file:../.. against parent package.json.name"
      pattern: '"@cosyte/hl7"'
---

<objective>
Rename the `examples/` subtree (3 runnable scripts + example README) and the `examples/profile-starter-kit/` subtree (6 source files + lockfile) from `@cosyte/hl7-parser` to `@cosyte/hl7`. This wave touches 11 files total, 19 occurrences (per CONTEXT.md grep counts).

The starter kit is the highest-stakes piece: its `package.json` declares the parent as a `peerDependency`, `devDependency`, and `peerDependenciesMeta` entry — ALL three keys must be renamed or `pnpm install` on the starter kit (exercised by `pnpm examples` smoke) will fail to resolve. The `pnpm-lock.yaml` also carries the old name in 3 lockfile entries and must be swept (or regenerated — either works, but text-sweep keeps the commit surgical).

Purpose: After Wave 4 runs `pnpm install && pnpm examples`, the three examples and the starter kit pipeline must all resolve the parent package by its new name. This wave makes that possible.

Output: 11 files rewritten (10 via text replacement + 1 lockfile handled per Task 3's decision). After this plan:
- Zero occurrences of `@cosyte/hl7-parser` anywhere under `examples/`
- All three example scripts' imports land on `@cosyte/hl7`
- Starter kit's peer/dev/meta deps all key on `@cosyte/hl7`
- Starter kit's pnpm-lock.yaml references the new name
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
  <name>Task 1: Sweep examples/ top-level (README + 3 runnable scripts)</name>
  <files>
    examples/README.md,
    examples/extract-patient-info.ts,
    examples/read-lab-results.ts,
    examples/modify-and-resend.ts
  </files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-08 — only CHANGELOG may retain old name)
    - examples/extract-patient-info.ts (1 occurrence — the top import)
    - examples/read-lab-results.ts (1 occurrence)
    - examples/modify-and-resend.ts (1 occurrence)
    - examples/README.md (1 occurrence)
  </read_first>
  <action>
    Replace every occurrence of `@cosyte/hl7-parser` with `@cosyte/hl7` in the four files above. Expected counts (confirm via grep before editing):
    - `examples/extract-patient-info.ts` — 1 occurrence (the `import { ... } from "@cosyte/hl7-parser"` line near the top)
    - `examples/read-lab-results.ts` — 1 occurrence (same shape)
    - `examples/modify-and-resend.ts` — 1 occurrence (same shape)
    - `examples/README.md` — 1 occurrence (likely an install snippet or import example)

    Recommended mechanic:
    ```
    sed -i 's|@cosyte/hl7-parser|@cosyte/hl7|g' \
      examples/README.md \
      examples/extract-patient-info.ts \
      examples/read-lab-results.ts \
      examples/modify-and-resend.ts
    ```

    Do NOT touch anything under `examples/profile-starter-kit/` here — Tasks 2 and 3 own that subtree.

    After the sweep, the examples are syntactically ready but will not RUN until the root `package.json` (renamed in Wave 1) is installed into `node_modules` — which happens as part of Wave 4's `pnpm install`. Do NOT run `pnpm examples` or `tsx examples/...` here; it would fail because the node_modules linked package name may still be stale. Wave 4 is the integration gate.
  </action>
  <verify>
    <automated>test "$(grep -c '@cosyte/hl7-parser' examples/README.md examples/extract-patient-info.ts examples/read-lab-results.ts examples/modify-and-resend.ts | awk -F: '{s+=$2} END {print s}')" = "0" && grep -q 'from "@cosyte/hl7"' examples/extract-patient-info.ts && grep -q 'from "@cosyte/hl7"' examples/read-lab-results.ts && grep -q 'from "@cosyte/hl7"' examples/modify-and-resend.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" examples/README.md` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/extract-patient-info.ts` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/read-lab-results.ts` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/modify-and-resend.ts` returns `0`
    - Each of the 3 `.ts` scripts has at least one line matching `from "@cosyte/hl7"` (verifies the import survived the rewrite as a real import, not mangled)
    - `examples/README.md` mentions `@cosyte/hl7` at least once
  </acceptance_criteria>
  <done>
    All 4 top-level `examples/` files carry only the new name. The three runnable example scripts import from `@cosyte/hl7`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sweep examples/profile-starter-kit/ source files (package.json, 5 source/doc/config files)</name>
  <files>
    examples/profile-starter-kit/package.json,
    examples/profile-starter-kit/src/index.ts,
    examples/profile-starter-kit/test/profile.test.ts,
    examples/profile-starter-kit/tsup.config.ts,
    examples/profile-starter-kit/README.md,
    examples/profile-starter-kit/CUSTOMIZING.md
  </files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-08 — only CHANGELOG may retain old name; also note that the starter kit's own internal name may or may not change per the Claude's Discretion section — decide below)
    - examples/profile-starter-kit/package.json (4 occurrences: description line + peerDependencies key + peerDependenciesMeta key + devDependencies key)
    - examples/profile-starter-kit/src/index.ts (2 occurrences — re-exports/imports of the parent)
    - examples/profile-starter-kit/test/profile.test.ts (1 occurrence)
    - examples/profile-starter-kit/tsup.config.ts (1 occurrence)
    - examples/profile-starter-kit/README.md (6 occurrences)
    - examples/profile-starter-kit/CUSTOMIZING.md (4 occurrences — migration/install snippets)
  </read_first>
  <action>
    Replace every `@cosyte/hl7-parser` with `@cosyte/hl7` across these 6 files. Expected totals (confirm via grep before editing):
    - `package.json` — 4 (description + peerDependencies key + peerDependenciesMeta key + devDependencies key)
    - `src/index.ts` — 2
    - `test/profile.test.ts` — 1
    - `tsup.config.ts` — 1
    - `README.md` — 6
    - `CUSTOMIZING.md` — 4
    - **Total: 18 occurrences across 6 files**

    Recommended mechanic:
    ```
    sed -i 's|@cosyte/hl7-parser|@cosyte/hl7|g' \
      examples/profile-starter-kit/package.json \
      examples/profile-starter-kit/src/index.ts \
      examples/profile-starter-kit/test/profile.test.ts \
      examples/profile-starter-kit/tsup.config.ts \
      examples/profile-starter-kit/README.md \
      examples/profile-starter-kit/CUSTOMIZING.md
    ```

    Critical: the three dependency-keys in `package.json` MUST all be renamed (not just the string values). Before-rename shape (per CONTEXT.md code_context grep):
    ```json
    {
      "description": "HL7 profile package for {{YOUR_ORG}} integrations, built with @cosyte/hl7-parser.",
      "peerDependencies": { "@cosyte/hl7-parser": ">=0.1.0" },
      "peerDependenciesMeta": { "@cosyte/hl7-parser": { ... } },
      "devDependencies": { "@cosyte/hl7-parser": "file:../.." }
    }
    ```
    After-rename shape (expected):
    ```json
    {
      "description": "HL7 profile package for {{YOUR_ORG}} integrations, built with @cosyte/hl7.",
      "peerDependencies": { "@cosyte/hl7": ">=0.1.0" },
      "peerDependenciesMeta": { "@cosyte/hl7": { ... } },
      "devDependencies": { "@cosyte/hl7": "file:../.." }
    }
    ```
    The `file:../..` relative path still points at the same directory (parent package) — pnpm resolves `file:../..` via directory path and then reads that directory's `package.json.name` (already `@cosyte/hl7` after Wave 1). So the starter kit resolves the parent correctly once both Wave 1 (parent) and this task (starter kit keys) have landed.

    Claude's Discretion call for starter kit's own internal `name` field: per CONTEXT.md, the starter kit is a template users copy and rename (`{{YOUR_ORG}}/{{PROFILE_NAME}}` placeholders). Its OWN `package.json.name` is NOT `@cosyte/hl7-parser-*` — it's a placeholder or a separate name. Verify this assumption by reading the file and confirm the starter kit's own `name` field needs no change (only the references to the PARENT package name change). If the starter kit's own `name` was `@cosyte/hl7-parser-starter` or similar, flag it in the summary — but expected state is placeholder-based, so no change needed.

    Do NOT touch `pnpm-lock.yaml` here — Task 3 handles it (lockfile is structurally different and deserves its own verification step).
  </action>
  <verify>
    <automated>test "$(grep -c '@cosyte/hl7-parser' examples/profile-starter-kit/package.json examples/profile-starter-kit/src/index.ts examples/profile-starter-kit/test/profile.test.ts examples/profile-starter-kit/tsup.config.ts examples/profile-starter-kit/README.md examples/profile-starter-kit/CUSTOMIZING.md | awk -F: '{s+=$2} END {print s}')" = "0" && jq -e '.peerDependencies["@cosyte/hl7"]' examples/profile-starter-kit/package.json > /dev/null && jq -e '.devDependencies["@cosyte/hl7"]' examples/profile-starter-kit/package.json > /dev/null && jq -e '.peerDependenciesMeta["@cosyte/hl7"]' examples/profile-starter-kit/package.json > /dev/null</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/package.json` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/src/index.ts` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/test/profile.test.ts` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/tsup.config.ts` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/README.md` returns `0`
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/CUSTOMIZING.md` returns `0`
    - `jq -e '.peerDependencies["@cosyte/hl7"]' examples/profile-starter-kit/package.json` exits 0 (key exists under new name)
    - `jq -e '.devDependencies["@cosyte/hl7"]' examples/profile-starter-kit/package.json` exits 0
    - `jq -e '.peerDependenciesMeta["@cosyte/hl7"]' examples/profile-starter-kit/package.json` exits 0
    - `jq -r '.devDependencies["@cosyte/hl7"]' examples/profile-starter-kit/package.json` returns `file:../..` (relative path unchanged)
    - `jq -e '.peerDependencies["@cosyte/hl7-parser"]' examples/profile-starter-kit/package.json` exits 1 (old key is gone)
  </acceptance_criteria>
  <done>
    Starter kit's 6 non-lockfile files contain only the new name. Its `package.json` peerDependencies, peerDependenciesMeta, and devDependencies keys all point at `@cosyte/hl7` with unchanged version/path specs.
  </done>
</task>

<task type="auto">
  <name>Task 3: Rename references in examples/profile-starter-kit/pnpm-lock.yaml</name>
  <files>examples/profile-starter-kit/pnpm-lock.yaml</files>
  <read_first>
    - .planning/phases/09-rename-package-to-cosyte-hl7/09-CONTEXT.md (D-08 — no old-name occurrences anywhere in repo except CHANGELOG Notes: line)
    - examples/profile-starter-kit/pnpm-lock.yaml (3 occurrences on lines 11, 41, 1427 per grep)
    - examples/profile-starter-kit/package.json (AFTER Task 2's rename — the lockfile must agree with the keys named here)
  </read_first>
  <action>
    The lockfile has three `@cosyte/hl7-parser` references (per CONTEXT.md code_context grep). Two approaches, pick one:

    **Option A (preferred — surgical, deterministic, no install needed):** Literal text-sweep the lockfile:
    ```
    sed -i 's|@cosyte/hl7-parser|@cosyte/hl7|g' examples/profile-starter-kit/pnpm-lock.yaml
    ```
    This keeps the commit minimal. The 3 references are to the dependency name only (not a version hash, not a content-addressable string), so a literal replacement is safe and semantically correct.

    **Option B (heavier — full regeneration):** Delete the lockfile and run `cd examples/profile-starter-kit && pnpm install --lockfile-only` to regenerate against the renamed package.json. This produces an authoritative lockfile but changes a lot of noise (timestamps, lockfile version fields, etc.) and costs extra context.

    **Decision: use Option A** (text-sweep). Rationale: pnpm-lock.yaml entries for `@cosyte/hl7-parser@file:../..` are just name-keyed pointers to the parent directory; swapping the name to `@cosyte/hl7` aligns them with the renamed package.json and doesn't affect resolution (the `file:../..` path still points to the parent, whose name is now `@cosyte/hl7` per Wave 1).

    After the sweep, Wave 4's `pnpm install` at the root will verify the lockfile is consistent: if pnpm detects lockfile drift, it will either reconcile (acceptable) or fail (flag for Wave 4 investigation). Expected behavior: reconciliation with zero diff because the parent is `file:../..` linked and has the same directory contents.

    Do NOT run `pnpm install` or any pnpm command in this task — the sweep stands alone. Wave 4 owns integration verification.
  </action>
  <verify>
    <automated>test "$(grep -c '@cosyte/hl7-parser' examples/profile-starter-kit/pnpm-lock.yaml)" = "0" && test "$(grep -c '@cosyte/hl7' examples/profile-starter-kit/pnpm-lock.yaml)" -ge "3"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@cosyte/hl7-parser" examples/profile-starter-kit/pnpm-lock.yaml` returns `0`
    - `grep -c "@cosyte/hl7" examples/profile-starter-kit/pnpm-lock.yaml` returns at least `3` (same 3 references now under the new name)
    - `grep -n "@cosyte/hl7" examples/profile-starter-kit/pnpm-lock.yaml | head -3` shows lines at/near positions 11, 41, 1427 (same structural positions as before the sweep)
    - `grep -rln "@cosyte/hl7-parser" examples/` returns nothing after Tasks 1 + 2 + 3 complete together (the full examples/ tree is now clean)
  </acceptance_criteria>
  <done>
    The starter kit's lockfile references the parent package under the new name. Combined with Tasks 1 and 2, the entire `examples/` subtree is free of `@cosyte/hl7-parser`.
  </done>
</task>

</tasks>

<verification>
After all three tasks complete:

```
# The full examples/ tree must carry zero old-name strings
grep -rln "@cosyte/hl7-parser" examples/
# Expected: no output

# New name is live everywhere the old name used to be
grep -rln "@cosyte/hl7" examples/ | wc -l
# Expected: ≥ 11 (all 11 edited files)

# Starter kit package.json is structurally valid JSON and declares the new name
jq . examples/profile-starter-kit/package.json > /dev/null
jq -e '.peerDependencies["@cosyte/hl7"] // .devDependencies["@cosyte/hl7"]' examples/profile-starter-kit/package.json > /dev/null
```

Do NOT run `pnpm install`, `pnpm examples`, `tsx examples/*.ts`, or any pipeline command here. Wave 4 owns end-to-end verification — running any of these now (before Wave 1's package.json rename is installed) risks flaky intermediate state.
</verification>

<success_criteria>
- Every file listed in `files_modified` has zero `@cosyte/hl7-parser` occurrences
- `examples/profile-starter-kit/package.json` has keys under `peerDependencies`, `peerDependenciesMeta`, and `devDependencies` spelled `@cosyte/hl7` (not `@cosyte/hl7-parser`)
- `examples/profile-starter-kit/pnpm-lock.yaml` has 3 references, all under the new name
- `grep -rln "@cosyte/hl7-parser" examples/` returns empty
</success_criteria>

<output>
After completion, create `.planning/phases/09-rename-package-to-cosyte-hl7/09-03-SUMMARY.md` with:
- Per-file before/after occurrence counts for the 11 files
- Confirmation that starter kit's OWN `name` field was left alone (placeholder-based) — or flag if it needed a rename
- Lockfile handling: confirm Option A (text-sweep) was used, or document if Option B (regen) was used and why
- Any unexpected strings encountered (e.g., if `@cosyte/hl7` appeared somewhere pre-sweep, flag it)
</output>
