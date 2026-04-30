---
phase: 01-project-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - tsconfig.build.json
  - .gitignore
  - .npmrc
  - .editorconfig
  - LICENSE
  - README.md
  - src/index.ts
requirements:
  - SETUP-03
  - SETUP-04
  - SETUP-05
autonomous: true
tags:
  - scaffold
  - typescript
  - package-json
must_haves:
  truths:
    - "package.json declares zero runtime dependencies (SETUP-03)"
    - "package.json has type: module, engines.node >=18.0.0, license MIT"
    - "package.json exports map resolves to both ESM (.mjs) and CJS (.cjs) entries with types"
    - "tsconfig.json enables strict: true and noUncheckedIndexedAccess: true (SETUP-05)"
    - "tsconfig.json targets ES2022 and module: NodeNext"
    - "LICENSE file contains MIT license text with Cosyte copyright"
    - ".gitignore excludes node_modules, dist, coverage, .env"
    - "src/index.ts exports at least one placeholder symbol with a JSDoc @example"
  artifacts:
    - path: package.json
      provides: "package metadata, scripts, devDeps, exports map"
      contains: '"type": "module"'
    - path: tsconfig.json
      provides: "strict TypeScript config for src + tests"
      contains: '"noUncheckedIndexedAccess": true'
    - path: tsconfig.build.json
      provides: "build-only config extending tsconfig.json"
    - path: .gitignore
      provides: "ignore patterns for build + env + deps"
    - path: LICENSE
      provides: "MIT license"
      contains: "MIT License"
    - path: src/index.ts
      provides: "library entry point stub"
  key_links:
    - from: package.json
      to: tsconfig.json
      via: "typecheck script invokes tsc --noEmit against this tsconfig"
      pattern: "tsc --noEmit"
    - from: package.json
      to: src/index.ts
      via: "exports map points to dist entries built from this source"
      pattern: '"exports"'
---

<objective>
Scaffold the package manifest, TypeScript configuration, license, and initial source stub so downstream plans (tsup, ESLint/Prettier, Vitest) can layer on top without revising core metadata.

Purpose: This plan defines the complete package.json (including all devDependencies and scripts) and the strict tsconfig upfront. Wave 2 plans will create config files only — no further package.json edits needed, eliminating file conflicts between parallel plans.

Output: A working pnpm-installable project with zero runtime deps, dual ESM+CJS exports declared, strict TypeScript, MIT license, and a stub entry point.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create package.json with complete metadata, scripts, and devDependencies</name>
  <files>package.json</files>
  <read_first>
    - CLAUDE.md (locked tech stack: TypeScript strict, Node 18+, pnpm, Vitest, ESLint, Prettier, tsup, zero runtime deps)
    - .planning/PROJECT.md (MIT license, @cosyte/hl7-parser name, dual ESM+CJS requirement)
    - .planning/REQUIREMENTS.md (SETUP-01..06 for verification criteria)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/package.json` with EXACTLY these fields (concrete values, not placeholders):

```json
{
  "name": "@cosyte/hl7-parser",
  "version": "0.0.0",
  "description": "Developer-focused HL7 v2 parser and utility library for Node.js and TypeScript.",
  "keywords": ["hl7", "hl7v2", "parser", "healthcare", "interoperability", "typescript"],
  "homepage": "https://github.com/cosyte/hl7-parser#readme",
  "bugs": {
    "url": "https://github.com/cosyte/hl7-parser/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cosyte/hl7-parser.git"
  },
  "license": "MIT",
  "author": "Cosyte <hello@cosyte.com> (https://cosyte.com)",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "packageManager": "pnpm@9.0.0",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "sideEffects": false,
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\" --max-warnings=0",
    "lint:fix": "eslint \"src/**/*.ts\" \"test/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.{ts,md}\" \"test/**/*.ts\" \"*.{json,md,yml}\"",
    "format:check": "prettier --check \"src/**/*.{ts,md}\" \"test/**/*.ts\" \"*.{json,md,yml}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist coverage",
    "prepublishOnly": "pnpm clean && pnpm typecheck && pnpm lint && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitest/coverage-v8": "^1.2.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-jsdoc": "^48.0.0",
    "prettier": "^3.2.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  },
  "dependencies": {}
}
```

CRITICAL: The `dependencies` key must be present and empty (explicit zero runtime deps per SETUP-03). Do NOT add any runtime packages. The `devDependencies` block above is the complete list — downstream plans will NOT add to it; they only create config files.
  </action>
  <verify>
    <automated>node -e "const p=require('/home/nschatz/projects/cosyte/hl7-parser/package.json'); if(p.type!=='module')throw 'no type:module'; if(!p.engines||!p.engines.node||!p.engines.node.includes('18'))throw 'bad engines'; if(p.license!=='MIT')throw 'bad license'; if(Object.keys(p.dependencies||{}).length!==0)throw 'has runtime deps'; if(!p.exports||!p.exports['.'].import||!p.exports['.'].require||!p.exports['.'].types)throw 'bad exports'; console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `package.json` exists at repo root
    - `grep '"type": "module"' package.json` succeeds
    - `grep '"license": "MIT"' package.json` succeeds
    - `grep '"noUncheckedIndexedAccess"' tsconfig.json` will succeed after Task 2
    - `node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).length)"` prints `0`
    - `node -e "const p=require('./package.json'); console.log(p.engines.node)"` prints a string containing `18`
    - `node -e "const p=require('./package.json'); console.log(!!p.exports['.'].import && !!p.exports['.'].require && !!p.exports['.'].types)"` prints `true`
    - `scripts.build`, `scripts.typecheck`, `scripts.lint`, `scripts.test` all present
    - `devDependencies` contains tsup, typescript, vitest, eslint, prettier, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, @vitest/coverage-v8
  </acceptance_criteria>
  <done>
    package.json exists with zero runtime deps, type:module, Node 18+ engines, MIT license, dual ESM+CJS exports map, and the complete devDependencies list. SETUP-03 and SETUP-05 (partial) satisfied.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create strict tsconfig.json and tsconfig.build.json</name>
  <files>tsconfig.json, tsconfig.build.json</files>
  <read_first>
    - CLAUDE.md (strict, noUncheckedIndexedAccess, ES2022, no any)
    - .planning/REQUIREMENTS.md (SETUP-05: Node 18+, ES2022, strict, noUncheckedIndexedAccess)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/tsconfig.json` with EXACTLY these contents:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,

    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,

    "outDir": "./dist",
    "rootDir": "./src",

    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "*.config.ts"],
  "exclude": ["node_modules", "dist", "coverage"]
}
```

Then create `/home/nschatz/projects/cosyte/hl7-parser/tsconfig.build.json` with EXACTLY these contents (extends base, narrows to build source only, emit enabled but tsup handles emit; this file is for IDE/consumers needing a build-shaped reference):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "emitDeclarationOnly": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "coverage", "test", "**/*.test.ts", "**/*.spec.ts"]
}
```

Rationale for each strict flag:
- `strict: true` — all strict checks on (SETUP-05)
- `noUncheckedIndexedAccess: true` — array/record access returns `T | undefined` (SETUP-05, CLAUDE.md guardrail)
- `exactOptionalPropertyTypes: true` — `{ x?: T }` vs `{ x: T | undefined }` distinction preserved
- `useUnknownInCatchVariables: true` — catch clauses get `unknown`, must narrow (CLAUDE.md: "use unknown and narrow")
- `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`, `noImplicitReturns` — additional safety
- `target: ES2022` — SETUP-05
- `module: NodeNext` — correct resolution for dual ESM/CJS with `type: module` in package.json
- `isolatedModules: true` — required for tsup single-file transpilation
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const t=JSON.parse(fs.readFileSync('/home/nschatz/projects/cosyte/hl7-parser/tsconfig.json','utf8').replace(/^\uFEFF/,'')); const c=t.compilerOptions; if(c.strict!==true)throw 'strict off'; if(c.noUncheckedIndexedAccess!==true)throw 'nUIA off'; if(c.target!=='ES2022')throw 'bad target'; if(c.module!=='NodeNext')throw 'bad module'; console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `tsconfig.json` exists at repo root
    - `tsconfig.build.json` exists at repo root
    - `grep '"strict": true' tsconfig.json` succeeds
    - `grep '"noUncheckedIndexedAccess": true' tsconfig.json` succeeds
    - `grep '"target": "ES2022"' tsconfig.json` succeeds
    - `grep '"module": "NodeNext"' tsconfig.json` succeeds
    - `grep '"exactOptionalPropertyTypes": true' tsconfig.json` succeeds
    - `grep '"useUnknownInCatchVariables": true' tsconfig.json` succeeds
    - `tsconfig.build.json` has `"extends": "./tsconfig.json"`
    - `tsconfig.build.json` excludes `**/*.test.ts`
  </acceptance_criteria>
  <done>
    tsconfig.json and tsconfig.build.json exist with strict mode enabled. SETUP-05 satisfied from TS-config side.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create LICENSE, .gitignore, .npmrc, .editorconfig, README skeleton, and src/index.ts stub</name>
  <files>LICENSE, .gitignore, .npmrc, .editorconfig, README.md, src/index.ts</files>
  <read_first>
    - .planning/PROJECT.md (MIT license, @cosyte brand, north star, core value)
    - CLAUDE.md (no console.*, JSDoc with @example on public exports, no any)
  </read_first>
  <action>
Create the following files at `/home/nschatz/projects/cosyte/hl7-parser/`:

**`LICENSE`** (standard MIT — fill year 2026, copyright holder "Cosyte"):

```
MIT License

Copyright (c) 2026 Cosyte

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**`.gitignore`**:

```
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
*.tsbuildinfo

# Test / coverage
coverage/
.vitest-cache/

# Environment
.env
.env.*
!.env.example

# Editor
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local
.cache/
.turbo/
```

**`.npmrc`** (enforces pnpm, strict-peer-deps off to avoid false positives on dev-only peers, save-exact on for reproducibility in this lib repo):

```
engine-strict=true
save-exact=false
auto-install-peers=true
strict-peer-dependencies=false
```

**`.editorconfig`**:

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

**`README.md`** (skeleton — Phase 8 will expand this; keep short but real so npm preview isn't broken):

```markdown
# @cosyte/hl7-parser

A developer-focused HL7 v2 parser and utility library for Node.js and TypeScript.

> Parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.

## Status

Pre-release. See [`.planning/ROADMAP.md`](./.planning/ROADMAP.md) for the development plan.

## Requirements

- Node.js 18 or newer
- pnpm (recommended) / npm / yarn

## Install

```bash
pnpm add @cosyte/hl7-parser
```

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## License

MIT © [Cosyte](https://cosyte.com)
```

**`src/index.ts`** (stub entry point with a JSDoc `@example` so SETUP-04 has something concrete to verify on day one):

```typescript
/**
 * @cosyte/hl7-parser — public entry point.
 *
 * The full public API (parseHL7, defineProfile, helpers, types) is populated
 * in subsequent phases. This stub keeps the module resolvable and typed so
 * downstream tooling (tsup, vitest, tsc) can verify the build/typecheck
 * pipeline end-to-end.
 */

/**
 * Library version string, synced with `package.json#version` at build time
 * by downstream phases. Exported now so consumers (and the type-check
 * pipeline) have at least one symbol to resolve through the `exports` map.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/hl7-parser";
 * console.log(VERSION);
 * ```
 */
export const VERSION: string = "0.0.0";
```

Ensure the `src/` directory is created if it does not exist.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && test -f LICENSE && test -f .gitignore && test -f .editorconfig && test -f README.md && test -f src/index.ts && grep -q "MIT License" LICENSE && grep -q "^dist/" .gitignore && grep -q "^node_modules/" .gitignore && grep -q "export const VERSION" src/index.ts && grep -q "@example" src/index.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `LICENSE` exists with text containing `MIT License` and `Copyright (c) 2026 Cosyte`
    - `.gitignore` contains lines matching `^node_modules/?$`, `^dist/?$`, `^coverage/?$`, `^\.env$`
    - `.npmrc` contains `engine-strict=true`
    - `.editorconfig` exists with `indent_size = 2` and `end_of_line = lf`
    - `README.md` exists and contains `@cosyte/hl7-parser` on line 1 as `# @cosyte/hl7-parser`
    - `src/index.ts` exists, exports `VERSION`, contains a `@example` JSDoc tag
    - `grep "export const VERSION" src/index.ts` succeeds
    - `grep "@example" src/index.ts` succeeds (SETUP-04 evidence)
  </acceptance_criteria>
  <done>
    LICENSE (MIT), .gitignore, .npmrc, .editorconfig, README.md, and src/index.ts stub all exist with the exact content above. SETUP-04 groundwork laid (JSDoc @example on the one public export).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Dev machine → npm registry (via pnpm install) | Dev dependency supply chain is the only network surface in Phase 1 |
| Dev machine → git remote (on push) | Committed files must not include secrets |
| Repo → npm publish pipeline | package.json must not leak private tokens or unintended files |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | Dev dependency supply chain | mitigate | Commit `pnpm-lock.yaml` (produced by Plan 04 install). Plan 04 includes `pnpm install --frozen-lockfile` smoke step to prevent silent version drift. |
| T-01-02 | Information Disclosure | package.json / publish config | mitigate | Explicit `files: ["dist","README.md","LICENSE","CHANGELOG.md"]` allowlist prevents publishing src/, test/, .planning/, .env. `publishConfig.access=public` documents intent; `provenance:true` enables npm provenance attestation when publishing via CI. |
| T-01-03 | Information Disclosure | Committed secrets | mitigate | `.gitignore` covers `.env`, `.env.*` (with `!.env.example` allowlist). Plan 04 smoke-verifies no `.env` file is tracked. |
| T-01-04 | Information Disclosure | Build artifacts in git | mitigate | `.gitignore` covers `dist/`, `coverage/`, `*.tsbuildinfo`. |
| T-01-05 | Elevation of Privilege | Dev script injection via scripts field | accept | Only standard tool invocations (tsup, tsc, eslint, prettier, vitest); no shell interpolation of untrusted input. Low risk for an early-stage repo with a single maintainer. |
</threat_model>

<verification>
After all tasks in this plan complete:
- `ls -la /home/nschatz/projects/cosyte/hl7-parser/` shows: package.json, tsconfig.json, tsconfig.build.json, LICENSE, .gitignore, .npmrc, .editorconfig, README.md, src/
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` exits 0 (valid JSON)
- `node -e "JSON.parse(require('fs').readFileSync('tsconfig.json','utf8'))"` exits 0 (valid JSON — comments not allowed; keep JSON pure)
- No `pnpm install` is required yet (that happens in Plan 04's smoke phase).
</verification>

<success_criteria>
- [ ] `package.json` declares zero runtime `dependencies`, `type: module`, `engines.node >= 18`, dual-build `exports` map, MIT license, complete devDependencies
- [ ] `tsconfig.json` enables `strict` and `noUncheckedIndexedAccess` with `target: ES2022` and `module: NodeNext`
- [ ] `tsconfig.build.json` extends base and narrows to `src/` only
- [ ] `LICENSE` is MIT with Cosyte copyright
- [ ] `.gitignore`, `.npmrc`, `.editorconfig` in place
- [ ] `README.md` skeleton exists (full README comes in Phase 8)
- [ ] `src/index.ts` stub exports `VERSION` with a JSDoc `@example`
- [ ] REQ-IDs satisfied (partial/staged): SETUP-03 (zero deps), SETUP-04 (JSDoc @example groundwork), SETUP-05 (strict TS + ES2022 + Node 18)
</success_criteria>

<output>
After completion, create `.planning/phases/01-project-foundation/01-01-SUMMARY.md` documenting:
- Exact file contents written
- Version pins for devDependencies
- Any deviations from planned content (there should be none)
- Handoff notes for Wave 2 plans (Plan 02 creates tsup.config.ts; Plan 03 creates eslint/prettier/vitest configs — none of them should modify package.json)
</output>
