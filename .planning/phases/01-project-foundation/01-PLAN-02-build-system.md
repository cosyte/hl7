---
phase: 01-project-foundation
plan: 02
type: execute
wave: 2
depends_on:
  - 01-PLAN-01-package-scaffold
files_modified:
  - tsup.config.ts
  - src/index.ts
requirements:
  - SETUP-02
  - SETUP-04
autonomous: true
tags:
  - build
  - tsup
  - esm
  - cjs
must_haves:
  truths:
    - "A developer running `pnpm build` from a clean clone produces dist/index.mjs, dist/index.cjs, and dist/index.d.ts (SETUP-02)"
    - "The built dist/index.mjs is valid ESM (uses export syntax, not module.exports)"
    - "The built dist/index.cjs is valid CJS (uses module.exports, not export syntax)"
    - "The built dist/index.d.ts contains the VERSION export declaration (SETUP-04 IntelliSense groundwork)"
    - "tsup.config.ts declares entry, format, dts, sourcemap, clean, target, and treeshake options"
  artifacts:
    - path: tsup.config.ts
      provides: "dual ESM+CJS build config with type declarations"
      contains: "defineConfig"
    - path: dist/index.mjs
      provides: "ESM build artifact (produced by pnpm build)"
    - path: dist/index.cjs
      provides: "CJS build artifact (produced by pnpm build)"
    - path: dist/index.d.ts
      provides: "Type declaration file for IntelliSense (produced by pnpm build)"
  key_links:
    - from: tsup.config.ts
      to: package.json exports map
      via: "dist/index.mjs matches exports['.'].import; dist/index.cjs matches exports['.'].require; dist/index.d.ts matches exports['.'].types"
      pattern: "dist/index"
    - from: tsup.config.ts
      to: src/index.ts
      via: "entry: ['src/index.ts']"
      pattern: "src/index.ts"
---

<objective>
Configure tsup to produce dual ESM + CJS output plus type declarations from `src/index.ts`, matching the `exports` map declared in package.json.

Purpose: SETUP-02 requires that ESM consumers and CJS consumers both resolve the correct entry via the `exports` map with typed IntelliSense. tsup is the locked build tool (CLAUDE.md); this plan wires it up.

Output: A `tsup.config.ts` file that, when `pnpm build` is run, produces `dist/index.mjs`, `dist/index.cjs`, and `dist/index.d.ts`.
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
From Plan 01 (package.json exports map — must match build output exactly):
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.cjs"
  }
}
```

From Plan 01 (src/index.ts current shape — single public export):
```typescript
export const VERSION: string = "0.0.0";
```

From Plan 01 (package.json scripts.build):
```
"build": "tsup"
```
This means tsup MUST read `tsup.config.ts` from repo root with no CLI flags.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create tsup.config.ts producing dual ESM+CJS with types</name>
  <files>tsup.config.ts</files>
  <read_first>
    - package.json (confirm exports map paths: dist/index.mjs, dist/index.cjs, dist/index.d.ts)
    - tsconfig.json (confirm target: ES2022, module: NodeNext)
    - src/index.ts (confirm entry point exists with a public export)
    - CLAUDE.md (zero runtime deps, immutable by default, no console.*)
  </read_first>
  <action>
Create `/home/nschatz/projects/cosyte/hl7-parser/tsup.config.ts` with EXACTLY these contents:

```typescript
import { defineConfig } from "tsup";

/**
 * tsup build configuration for @cosyte/hl7-parser.
 *
 * Produces dual-format output matching the `exports` map in package.json:
 *   - dist/index.mjs   (ESM, consumed via the `import` condition)
 *   - dist/index.cjs   (CJS, consumed via the `require` condition)
 *   - dist/index.d.ts  (Type declarations, consumed via the `types` condition)
 *
 * SETUP-02: dual ESM + CJS with correct exports map resolution.
 * SETUP-04: type declarations with JSDoc forwarded for IntelliSense.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "node",
  treeshake: true,
  splitting: false,
  minify: false,
  shims: false,
  skipNodeModulesBundle: true,
});
```

Critical configuration notes:
- `entry: ["src/index.ts"]` — single public entry; additional entries added in later phases only if needed
- `format: ["esm", "cjs"]` — required for SETUP-02 dual output
- `outExtension` — forces `.mjs` / `.cjs` suffixes to match package.json exports map exactly (tsup's default is `.js` / `.cjs`, which would not match)
- `dts: true` — emits `dist/index.d.ts` for SETUP-04 IntelliSense
- `target: "es2022"` — matches tsconfig.json
- `platform: "node"` — Node stdlib only; no browser shims
- `treeshake: true` + `splitting: false` — single-file outputs, smallest possible bundle
- `clean: true` — wipes dist/ before each build so stale artifacts never ship
- `shims: false` — Node 18+ has top-level await and other ESM features natively; no polyfills needed
- `skipNodeModulesBundle: true` — zero runtime deps means there's nothing to bundle from node_modules anyway; this is a belt-and-suspenders check
- `minify: false` — a library should ship readable code; consumers' bundlers minify if needed
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const s=fs.readFileSync('/home/nschatz/projects/cosyte/hl7-parser/tsup.config.ts','utf8'); if(!s.includes('format: [\"esm\", \"cjs\"]'))throw 'bad format'; if(!s.includes('dts: true'))throw 'no dts'; if(!s.includes('target: \"es2022\"'))throw 'bad target'; if(!s.includes('outExtension'))throw 'no outExtension'; if(!s.includes('.mjs'))throw 'no .mjs suffix'; if(!s.includes('.cjs'))throw 'no .cjs suffix'; console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `tsup.config.ts` exists at repo root
    - `grep 'format: \\[\"esm\", \"cjs\"\\]' tsup.config.ts` succeeds
    - `grep 'dts: true' tsup.config.ts` succeeds
    - `grep 'clean: true' tsup.config.ts` succeeds
    - `grep 'target: \"es2022\"' tsup.config.ts` succeeds
    - `grep 'outExtension' tsup.config.ts` succeeds
    - `grep 'platform: \"node\"' tsup.config.ts` succeeds
    - `grep '\".mjs\"' tsup.config.ts` succeeds (ESM extension override)
    - `grep '\".cjs\"' tsup.config.ts` succeeds (CJS extension override)
    - File is valid TypeScript (will be verified by typecheck in Plan 04 smoke)
  </acceptance_criteria>
  <done>
    tsup.config.ts exists and declares dual ESM/CJS output with correct extensions (.mjs/.cjs) matching package.json exports map, plus dts:true for type declarations.
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify src/index.ts is build-ready (no changes unless needed)</name>
  <files>src/index.ts</files>
  <read_first>
    - src/index.ts (current state from Plan 01)
    - CLAUDE.md (no `any`, no console.*, JSDoc @example on public exports)
  </read_first>
  <action>
Read `/home/nschatz/projects/cosyte/hl7-parser/src/index.ts` and confirm it contains:
1. An `export const VERSION: string = "0.0.0";` line
2. A JSDoc block with an `@example` tag

If those are both present (they should be from Plan 01), make NO changes — the file is already correct for tsup to consume.

If either is missing (should not happen — indicates Plan 01 drift), restore to the Plan 01 specification:

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

Do NOT add any new exports in this plan — Plan 04 will run the actual build. Additional exports belong to Phase 2+.
  </action>
  <verify>
    <automated>cd /home/nschatz/projects/cosyte/hl7-parser && grep -q "export const VERSION" src/index.ts && grep -q "@example" src/index.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `src/index.ts` still contains `export const VERSION`
    - `src/index.ts` still contains a `@example` JSDoc tag
    - No `any` in src/index.ts (grep -n '\bany\b' src/index.ts returns no matches outside JSDoc comments)
    - No `console.` in src/index.ts
  </acceptance_criteria>
  <done>
    src/index.ts is in the exact state Plan 01 left it in, ready for tsup to consume.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| tsup build → dist/ | Build artifacts leave the source tree; must match package.json exports map |
| Bundled code → consumer runtime | Consumers inherit whatever tsup emits |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-02-01 | Tampering | Stale dist/ artifacts | mitigate | `clean: true` in tsup.config.ts wipes dist/ before every build, so no orphaned files from earlier builds can ship. |
| T-01-02-02 | Information Disclosure | Accidental bundling of internal paths | mitigate | `sourcemap: true` emits sourcemaps alongside; consumers can opt in. `minify: false` keeps code readable for downstream audit. Library code contains no secrets (see Plan 01 threat model). |
| T-01-02-03 | Tampering | Exports map mismatch with build output | mitigate | `outExtension` function forces `.mjs`/`.cjs` suffixes to match `package.json#exports` exactly. Plan 04 smoke test verifies both files exist at the advertised paths. |
</threat_model>

<verification>
After this plan:
- tsup.config.ts exists and parses as valid TypeScript
- src/index.ts is unchanged from Plan 01
- The actual build (`pnpm build`) is NOT run in this plan — it runs in Plan 04's smoke verification, which is the right gate for "does the pipeline actually work end-to-end".
</verification>

<success_criteria>
- [ ] `tsup.config.ts` exists with dual ESM+CJS format, .mjs/.cjs extensions, dts, clean, sourcemap, target es2022
- [ ] `src/index.ts` unchanged and still has VERSION export + @example
- [ ] REQ-IDs staged: SETUP-02 (build config in place; verified in Plan 04), SETUP-04 (dts:true ensures type decls ship)
</success_criteria>

<output>
After completion, create `.planning/phases/01-project-foundation/01-02-SUMMARY.md` documenting:
- tsup.config.ts contents
- Confirmation src/index.ts is unchanged
- Handoff to Plan 04: the actual `pnpm build` run lives there.
</output>
