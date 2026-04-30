---
phase: 01-project-foundation
plan: 03
type: execute
wave: 2
depends_on:
  - 01-PLAN-01-package-scaffold
files_modified:
  - eslint.config.js
  - .eslintignore
  - .prettierrc.json
  - .prettierignore
  - vitest.config.ts
  - test/sanity.test.ts
requirements:
  - SETUP-04
  - SETUP-06
autonomous: true
tags:
  - linting
  - formatting
  - testing
  - vitest
  - eslint
must_haves:
  truths:
    - "A developer running `pnpm lint` sees eslint enforce no-any, no-unused-vars, require-jsdoc-on-exports, and prettier-compatibility with zero warnings (SETUP-04, SETUP-06)"
    - "A developer editing a .ts file and typing `const x: any = 1` gets a lint error (SETUP-04 IntelliSense enforcement of no-any)"
    - "A developer running `pnpm test` sees Vitest discover test/sanity.test.ts and execute at least two passing assertions"
    - "Prettier and ESLint do not contradict each other (eslint-config-prettier is the final item in the flat config array)"
    - "Vitest can resolve src/index.ts (strict TS is honored in tests)"
  artifacts:
    - path: eslint.config.js
      provides: "ESLint flat config with @typescript-eslint + jsdoc + prettier compatibility"
      contains: "@typescript-eslint"
    - path: .prettierrc.json
      provides: "Prettier config with concrete options"
    - path: .prettierignore
      provides: "Files Prettier must skip (dist, coverage, node_modules, lockfile)"
    - path: vitest.config.ts
      provides: "Vitest test runner config with coverage thresholds declared"
      contains: "defineConfig"
    - path: test/sanity.test.ts
      provides: "Smoke test proving Vitest + TS + src/index.ts integration works"
      contains: "VERSION"
  key_links:
    - from: eslint.config.js
      to: tsconfig.json
      via: "parserOptions.project references tsconfig.json for type-aware rules"
      pattern: "tsconfig"
    - from: test/sanity.test.ts
      to: src/index.ts
      via: "imports VERSION to prove test-to-source resolution works"
      pattern: "from.*src/index"
---

<objective>
Configure ESLint (flat config), Prettier, and Vitest so that `pnpm lint` and `pnpm test` both run clean from a fresh install, and so strict TypeScript guardrails from CLAUDE.md are enforced at the lint layer (not just typecheck).

Purpose: SETUP-06 requires zero-warning lint/typecheck. SETUP-04 requires that editor IntelliSense surfaces strict errors — strict tsconfig alone isn't enough; lint rules enforce the CLAUDE.md rules (no `any`, no unjustified `as`, require JSDoc + `@example` on public exports, no `console.*`).

Output: eslint.config.js, .eslintignore, .prettierrc.json, .prettierignore, vitest.config.ts, and test/sanity.test.ts — all in place and passing.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@CLAUDE.md
@.planning/phases/01-project-foundation/01-01-SUMMARY.md

<interfaces>
From Plan 01 (package.json scripts this plan's configs must satisfy):
- `pnpm lint`        -> `eslint "src/**/*.ts" "test/**/*.ts" --max-warnings=0`
- `pnpm format`      -> `prettier --write "src/**/*.{ts,md}" "test/**/*.ts" "*.{json,md,yml}"`
- `pnpm format:check`-> `prettier --check ...`
- `pnpm test`        -> `vitest run`
- `pnpm test:coverage`-> `vitest run --coverage`

From Plan 01 (devDependencies already declared):
- eslint ^8.57.0, @typescript-eslint/parser ^7, @typescript-eslint/eslint-plugin ^7
- eslint-config-prettier ^9, eslint-plugin-jsdoc ^48
- prettier ^3.2
- vitest ^1.2, @vitest/coverage-v8 ^1.2
- typescript ^5.3

From Plan 01 (src/index.ts — must stay lint-clean):
`export const VERSION: string = "0.0.0";`  with a JSDoc `@example` block above it.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create eslint.config.js (flat config) and .eslintignore</name>
  <files>eslint.config.js, .eslintignore</files>
  <read_first>
    - CLAUDE.md (no any, no unjustified as, JSDoc + @example on public exports, no console.*, short testable functions)
    - tsconfig.json (confirm path for parserOptions.project)
    - src/index.ts (confirm the file lint must pass on)
    - package.json (devDependencies already include @typescript-eslint/*, eslint-plugin-jsdoc, eslint-config-prettier)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/eslint.config.js` as a flat config. The file must be JavaScript (not TypeScript) to avoid a bootstrap chicken-and-egg with tsup. Since `package.json` has `"type": "module"`, `.js` files are ESM by default and the `import` syntax below works directly.

EXACT contents:

```javascript
// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import jsdoc from "eslint-plugin-jsdoc";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // 1. Ignore generated + external directories.
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "*.config.js"],
  },

  // 2. Base rules for all TypeScript source + tests.
  {
    files: ["src/**/*.ts", "test/**/*.ts", "*.config.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      jsdoc: jsdoc,
    },
    rules: {
      // --- CLAUDE.md guardrails: no any, no unjustified as ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",

      // --- Strictness ---
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // --- CLAUDE.md: no console.* in library code ---
      "no-console": "error",

      // --- CLAUDE.md: JSDoc + @example on public exports ---
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-example": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
          ],
          exemptedBy: ["internal", "private"],
        },
      ],
      "jsdoc/check-tag-names": ["error", { definedTags: ["internal", "remarks"] }],

      // --- General safety ---
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  // 3. Relax JSDoc requirements inside test files (tests don't need @example).
  {
    files: ["test/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-example": "off",
    },
  },

  // 4. eslint-config-prettier MUST be last — turns off rules that conflict with Prettier.
  prettierConfig,
];
```

Then create `/home/nschatz/projects/cosyte/hl7-parser/.eslintignore` as a belt-and-suspenders ignore file for editor integrations that may not honor the flat `ignores` key:

```
dist/
coverage/
node_modules/
pnpm-lock.yaml
*.config.js
```

Critical notes:
- Flat config file must be named `eslint.config.js` at repo root (NOT `.eslintrc.*`).
- `parserOptions.project: "./tsconfig.json"` enables type-aware rules (`no-unsafe-*`, `no-floating-promises`) — this is what makes lint catch things strict tsc alone would not flag at lint time.
- `tsconfigRootDir: import.meta.dirname` — ESM-safe equivalent of `__dirname`.
- `eslint-config-prettier` MUST be the last element in the array so it can disable rules that would conflict with Prettier formatting.
- `no-non-null-assertion` + `consistent-type-assertions` (with `objectLiteralTypeAssertions: never`) enforce CLAUDE.md's "no unjustified `as`" rule. Standard `expr as Type` still works where justified; `{ ... } as Type` (structural coercion) is blocked.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && test -f eslint.config.js && test -f .eslintignore && grep -q '@typescript-eslint/no-explicit-any' eslint.config.js && grep -q 'no-console' eslint.config.js && grep -q 'jsdoc/require-example' eslint.config.js && grep -q 'prettierConfig' eslint.config.js && grep -q './tsconfig.json' eslint.config.js && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `eslint.config.js` exists at repo root
    - `.eslintignore` exists at repo root
    - `grep '@typescript-eslint/no-explicit-any' eslint.config.js` succeeds
    - `grep '@typescript-eslint/no-non-null-assertion' eslint.config.js` succeeds
    - `grep '"no-console": "error"' eslint.config.js` succeeds
    - `grep 'jsdoc/require-example' eslint.config.js` succeeds
    - `grep 'prettierConfig' eslint.config.js` succeeds AND `prettierConfig` is the LAST non-bracket token in the default-exported array (visual inspection)
    - `grep 'project: "./tsconfig.json"' eslint.config.js` succeeds
    - `.eslintignore` lists `dist/`, `coverage/`, `node_modules/`
    - No `.eslintrc.*` file exists at repo root (would conflict with flat config)
  </acceptance_criteria>
  <done>
    eslint.config.js (flat config) is in place with type-aware rules, no-any, JSDoc+@example enforcement on public exports, no-console, and prettier compatibility. .eslintignore provides belt-and-suspenders coverage.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create .prettierrc.json and .prettierignore</name>
  <files>.prettierrc.json, .prettierignore</files>
  <read_first>
    - .editorconfig (confirm indent_size=2, end_of_line=lf — Prettier config must not conflict)
    - package.json (confirm scripts.format and scripts.format:check expect prettier at repo root)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/.prettierrc.json` with EXACTLY these contents:

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "proseWrap": "preserve",
  "embeddedLanguageFormatting": "auto",
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "proseWrap": "preserve",
        "printWidth": 100
      }
    },
    {
      "files": ["*.json", "*.yml", "*.yaml"],
      "options": {
        "tabWidth": 2
      }
    }
  ]
}
```

Rationale:
- `printWidth: 100` — modern monitors; 80 is too short for typed TS, 120 is too wide for diff review.
- `singleQuote: false` — double quotes match package.json/JSON ecosystem; reduces noise when copy-pasting.
- `trailingComma: "all"` — smaller diffs; valid in ES2017+, we target ES2022.
- `endOfLine: "lf"` — matches .editorconfig.
- `semi: true`, `bracketSpacing: true`, `arrowParens: "always"` — modern TS defaults; keeps code review frictionless.

Then create `/home/nschatz/projects/cosyte/hl7-parser/.prettierignore` with EXACTLY these contents:

```
# Generated artifacts
dist/
coverage/

# Dependencies
node_modules/

# Lockfiles (never reformat — tool-owned)
pnpm-lock.yaml
package-lock.json
yarn.lock

# Planning docs (Markdown with embedded code fences that Prettier may re-wrap inconsistently)
.planning/

# Git / VCS internals
.git/
```

Critical notes:
- `.planning/` is ignored because those files have embedded code fences that Prettier can destabilize between runs (the roadmap and plans contain TypeScript snippets with long lines that are intentionally wide).
- Lockfiles are tool-owned; reformatting them corrupts them.
- `dist/` / `coverage/` are generated — formatting them is wasted cycles and would be overwritten on next build.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && test -f .prettierrc.json && test -f .prettierignore && node -e "const c=require('/home/nschatz/projects/cosyte/hl7-parser/.prettierrc.json'); if(c.printWidth!==100)throw 'bad printWidth'; if(c.trailingComma!=='all')throw 'bad trailingComma'; if(c.endOfLine!=='lf')throw 'bad endOfLine'; if(c.semi!==true)throw 'bad semi'; console.log('OK');" && grep -q "^dist/" .prettierignore && grep -q "^node_modules/" .prettierignore && grep -q "^pnpm-lock.yaml" .prettierignore && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `.prettierrc.json` exists and is valid JSON
    - `.prettierrc.json` has `printWidth: 100`, `tabWidth: 2`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `endOfLine: "lf"`
    - `.prettierignore` exists
    - `.prettierignore` lists `dist/`, `coverage/`, `node_modules/`, `pnpm-lock.yaml`, `.planning/`
    - `.prettierrc.json` `endOfLine` matches `.editorconfig` `end_of_line` (both `lf`)
    - `.prettierrc.json` `tabWidth` matches `.editorconfig` `indent_size` (both `2`)
  </acceptance_criteria>
  <done>
    .prettierrc.json and .prettierignore exist with concrete values aligned with .editorconfig; lockfiles and planning docs are excluded.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create vitest.config.ts</name>
  <files>vitest.config.ts</files>
  <read_first>
    - tsconfig.json (confirm target ES2022, strict mode — Vitest uses esbuild to honor target)
    - package.json (confirm scripts.test calls `vitest run` and scripts.test:coverage calls `vitest run --coverage`)
    - CLAUDE.md (coverage target >= 90% on src/parser/, src/model/, src/helpers/ — Phase 7 gate, but declared now so future phases inherit it)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/vitest.config.ts` with EXACTLY these contents:

```typescript
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @cosyte/hl7-parser.
 *
 * Phase 1 ships a minimal test surface (just a sanity test) but declares
 * coverage thresholds now so Phase 7 only has to flip `enabled: true` on
 * the thresholds, not re-architect the config.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    reporters: ["default"],
    testTimeout: 10_000,
    hookTimeout: 10_000,

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/index.ts",
        "src/**/*.d.ts",
        "src/**/__fixtures__/**",
      ],
      // Phase 7 will enable these thresholds. Declared now so the config
      // shape is stable across phases.
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
        // Per-directory thresholds matching CLAUDE.md guardrail.
        "src/parser/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
        "src/model/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
        "src/helpers/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
```

Critical notes:
- `globals: false` — tests must `import { describe, it, expect } from "vitest"` explicitly. Avoids pollution, keeps tests portable, and matches the TypeScript-strict spirit.
- `environment: "node"` — this is a Node library; no DOM.
- `include: ["test/**/*.test.ts", "src/**/*.test.ts"]` — supports both colocated and separated test layouts. Phase 7 may prefer one or the other; keeping both allowed.
- `coverage.provider: "v8"` — matches `@vitest/coverage-v8` in devDependencies (Plan 01).
- `coverage.exclude` excludes `index.ts` (re-export barrels have no logic to cover) and `__fixtures__` (test data).
- Thresholds are declared but Phase 7 is the enforcement gate. If Phase 1's sanity test covers nothing substantive, the default `pnpm test` (without `--coverage`) won't trip the thresholds. `pnpm test:coverage` is the gated command, reserved for Phase 7+.
- `reportsDirectory: "./coverage"` matches the `.gitignore` exclusion from Plan 01.

No other fields are needed at this stage. Phase 2 may add `setupFiles`, `globalSetup`, or alias entries as the parser tests grow.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && test -f vitest.config.ts && grep -q 'defineConfig' vitest.config.ts && grep -q 'environment: "node"' vitest.config.ts && grep -q "provider: \"v8\"" vitest.config.ts && grep -q "reportsDirectory" vitest.config.ts && grep -q "thresholds" vitest.config.ts && grep -q '"src/parser/\*\*"' vitest.config.ts && grep -q '"src/model/\*\*"' vitest.config.ts && grep -q '"src/helpers/\*\*"' vitest.config.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `vitest.config.ts` exists at repo root
    - Imports `defineConfig` from `"vitest/config"`
    - `test.environment === "node"`
    - `test.include` lists `"test/**/*.test.ts"` and `"src/**/*.test.ts"`
    - `test.globals === false`
    - `coverage.provider === "v8"`
    - `coverage.reportsDirectory === "./coverage"`
    - `coverage.thresholds` contains `lines: 90` at top level
    - `coverage.thresholds` contains per-directory threshold blocks for `src/parser/**`, `src/model/**`, `src/helpers/**`
    - `coverage.exclude` includes `"src/**/index.ts"`
  </acceptance_criteria>
  <done>
    vitest.config.ts exists with node environment, v8 coverage provider, coverage thresholds declared (enforced in Phase 7), and test file globs matching both colocated and separated layouts.
  </done>
</task>

<task type="auto">
  <name>Task 4: Create test/sanity.test.ts</name>
  <files>test/sanity.test.ts</files>
  <read_first>
    - src/index.ts (confirm VERSION export exists)
    - vitest.config.ts (confirm include glob matches test/**/*.test.ts)
    - eslint.config.js (confirm test files get JSDoc relaxation)
    - package.json (confirm `pnpm test` invokes `vitest run`)
  </read_first>
  <action>
Create the `test/` directory if it does not exist, then create `/home/nschatz/projects/cosyte/hl7-parser/test/sanity.test.ts` with EXACTLY these contents:

```typescript
import { describe, expect, it } from "vitest";

import { VERSION } from "../src/index.js";

describe("toolchain sanity", () => {
  it("resolves the public entry point and exports VERSION as a string", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("exposes VERSION as a semver-looking string", () => {
    // At this stage VERSION is "0.0.0"; the regex only asserts the shape,
    // not the exact value, so future phases can bump it without breaking.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:[.-].+)?$/);
  });
});
```

Critical notes:
- The import path `"../src/index.js"` uses `.js` because `tsconfig.json` has `module: NodeNext`, which requires explicit file extensions in import paths (the `.js` resolves to the `.ts` source at compile time; this is the standard NodeNext pattern).
- `describe`, `it`, `expect` are imported explicitly because `vitest.config.ts` sets `globals: false`.
- Two separate `it` blocks means `pnpm test` reports at least 2 passing tests — satisfies the must_have "at least two passing assertions" with some margin.
- The semver regex asserts shape (`major.minor.patch` optionally followed by `-<prerelease>` or `.<build>`) without locking the exact value — future phases can bump VERSION freely.
- No `console.*` in the test (eslint `no-console` applies to test files too per the base config; only JSDoc rules are relaxed for tests).
- This is the ONLY test in Phase 1. Phase 2+ add parser tests.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && test -f test/sanity.test.ts && grep -q 'from "vitest"' test/sanity.test.ts && grep -q 'VERSION' test/sanity.test.ts && grep -q 'describe' test/sanity.test.ts && grep -c 'it(' test/sanity.test.ts | grep -q '^2$' && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `test/sanity.test.ts` exists
    - Imports `describe`, `it`, `expect` from `"vitest"` (no globals)
    - Imports `VERSION` from `"../src/index.js"` (NodeNext-style explicit extension)
    - Contains at least 2 `it(...)` blocks (grep -c 'it\(' test/sanity.test.ts >= 2)
    - Uses `expect(typeof VERSION).toBe("string")` and a semver-shape regex
    - No `console.*` calls anywhere in the file
    - No `any` type anywhere in the file (grep -n '\\bany\\b' test/sanity.test.ts returns nothing)
  </acceptance_criteria>
  <done>
    test/sanity.test.ts exists and imports VERSION from src/index.ts, providing two passing assertions that prove Vitest + TypeScript + src resolution all work end-to-end. Plan 04 will actually run the test.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Lint/format tools → source files | Auto-fixers (eslint --fix, prettier --write) mutate source code |
| Test runner → file system | Vitest reads source and test files; coverage writes to ./coverage |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-03-01 | Tampering | eslint auto-fix rewriting source | mitigate | The default `pnpm lint` script does NOT auto-fix (the `--fix` variant is a separate `lint:fix` script, explicitly opt-in). CI uses `pnpm lint` only. |
| T-01-03-02 | Tampering | Prettier reformatting lockfiles | mitigate | `.prettierignore` explicitly lists `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock` to prevent tool-owned files from being corrupted. |
| T-01-03-03 | Information Disclosure | Coverage reports leaking into repo | mitigate | `coverage/` is in `.gitignore` (Plan 01) and `.prettierignore` (this plan). Vitest writes to `./coverage` which is gitignored. |
| T-01-03-04 | Denial of Service | Runaway test timeouts | mitigate | `testTimeout: 10_000` and `hookTimeout: 10_000` prevent indefinite hangs in CI. |
| T-01-03-05 | Tampering | Stale ESLint cache causing false green/red | accept | ESLint cache not enabled; always runs fresh. No attack surface. |
</threat_model>

<verification>
After this plan (but before Plan 04 runs the pipeline):
- `eslint.config.js`, `.eslintignore`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `test/sanity.test.ts` all exist.
- All files are syntactically valid in isolation (JSON parses; TS parses; JS parses).
- No config file modifies `package.json` (that was locked in Plan 01).
- Plan 04 is the gate that actually runs `pnpm lint` / `pnpm test` end-to-end.
</verification>

<success_criteria>
- [ ] eslint.config.js (flat) with @typescript-eslint + jsdoc + prettier compatibility
- [ ] .eslintignore for belt-and-suspenders coverage
- [ ] .prettierrc.json with concrete opinionated options (100/2/semi/double-quote/trailing-all/lf)
- [ ] .prettierignore excluding dist, coverage, lockfiles, .planning
- [ ] vitest.config.ts with node environment, v8 coverage, per-directory coverage thresholds
- [ ] test/sanity.test.ts with two passing assertions proving Vitest + TS + src resolution
- [ ] REQ-IDs staged: SETUP-04 (JSDoc+@example enforcement via lint), SETUP-06 (lint rules defined; pipeline runs in Plan 04)
</success_criteria>

<output>
After completion, create `.planning/phases/01-project-foundation/01-03-SUMMARY.md` documenting:
- Exact file contents written
- Linking map: which CLAUDE.md guardrails are enforced by which eslint rules
- Handoff to Plan 04: Plan 04 runs `pnpm lint`, `pnpm test`, `pnpm format:check` for the first time; if any rule fires on existing source/test files, diagnose root cause rather than disabling rules.
</output>
