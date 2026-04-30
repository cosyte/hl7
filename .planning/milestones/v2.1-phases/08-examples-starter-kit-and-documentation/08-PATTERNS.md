# Phase 8: Examples, Starter Kit & Documentation — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 32 (3 examples + 3 example fixtures + 1 examples README + 1 smoke script + 16 starter-kit files + 8 root-level docs/config/workflow changes)
**Analogs found:** 24 strong / 32 total (8 new files have no direct in-repo analog — all prose docs or net-new scaffolding)

## File Classification

### Plan A — examples/ + smoke script + CI wiring

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `examples/extract-patient-info.ts` | TypeScript source (runnable script) | file-I/O + console print | (no direct analog; new category) | no match |
| `examples/read-lab-results.ts` | TypeScript source (runnable script) | file-I/O + console print | (no direct analog; new category) | no match |
| `examples/modify-and-resend.ts` | TypeScript source (runnable script) | file-I/O + transform + console print | `test/round-trip.test.ts` (round-trip semantics) | partial (shape differs — examples use `console.log`, tests use `expect`) |
| `examples/data/adt-a01.hl7` | fixture (HL7 wire data) | static data | `test/fixtures/canonical/adt-a01.hl7` | exact (style, charset, delimiters) |
| `examples/data/oru-r01-lab.hl7` | fixture (HL7 wire data) | static data | `test/fixtures/canonical/oru-r01.hl7` | exact |
| `examples/data/adt-mutate-source.hl7` | fixture (HL7 wire data) | static data | `test/fixtures/canonical/adt-a01.hl7` | exact |
| `examples/README.md` | docs (index) | prose | `test/fixtures/canonical/README.md` | role-match (index table style) |
| `scripts/run-examples.ts` | build/CI script | batch process spawn | `scripts/write-vendor-quirks.mjs` | role-match (one-shot script; node stdlib only) |
| `.github/workflows/ci.yml` (MODIFIED) | CI workflow | event-driven | `.github/workflows/ci.yml` (self) | exact (extend in place) |

### Plan B — examples/profile-starter-kit/ subtree

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `examples/profile-starter-kit/package.json` | config (npm manifest) | static | `package.json` (root) | role-match (slimmer, peerDeps) |
| `examples/profile-starter-kit/tsconfig.json` | config (TS) | static | `tsconfig.json` (root) | exact (standalone copy) |
| `examples/profile-starter-kit/tsup.config.ts` | config (bundler) | batch build | `tsup.config.ts` (root) | exact |
| `examples/profile-starter-kit/vitest.config.ts` | config (test runner) | static | `vitest.config.ts` (root) | exact (slimmer — no coverage gate) |
| `examples/profile-starter-kit/eslint.config.js` | config (linter) | static | `eslint.config.js` (root) | exact (slim subset) |
| `examples/profile-starter-kit/.prettierrc` | config (formatter) | static | `.prettierrc.json` (root) | exact |
| `examples/profile-starter-kit/.gitignore` | config | static | `.gitignore` (root) | exact |
| `examples/profile-starter-kit/src/index.ts` | TypeScript source (profile definition) | static export | `src/profiles/genericLab.ts`, `src/profiles/epic.ts` | exact |
| `examples/profile-starter-kit/test/profile.test.ts` | test | request-response (parse + assert) | `test/profiles-builtins.test.ts` | exact |
| `examples/profile-starter-kit/test/fixtures/sample.hl7` | fixture | static data | `test/fixtures/canonical/z-segments.hl7` | exact (Z-segment style) |
| `examples/profile-starter-kit/.github/workflows/ci.yml` | CI workflow | event-driven | `.github/workflows/ci.yml` (root) | exact (slimmer — no matrix) |
| `examples/profile-starter-kit/.github/workflows/publish.yml` | CI workflow | event-driven (workflow_dispatch) | (no direct analog — parent's new publish.yml is sibling) | no match |
| `examples/profile-starter-kit/README.md` | docs | prose | (no direct analog; new file) | no match |
| `examples/profile-starter-kit/CUSTOMIZING.md` | docs | prose | (no direct analog; new file) | no match |
| `examples/profile-starter-kit/LICENSE` | docs (boilerplate) | static | `LICENSE` (root) | exact |

### Plan C — README.md

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `README.md` (REPLACED) | docs (prose) | prose | `README.md` (current stub — to be fully replaced) + JSDoc `@example` blocks throughout `src/` | no direct analog; new file — code-snippet style mirrors JSDoc `@example` blocks already in repo |

### Plan D — ancillary docs + version + publish workflow

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `CHANGELOG.md` | docs (Keep-a-Changelog) | prose | (no analog; new file) | no match |
| `CONTRIBUTING.md` | docs (prose) | prose | (no analog; new file) | no match |
| `package.json` (MODIFIED) | config | static | `package.json` (self) | exact (version bump + `scripts.examples` + `tsx` devDep) |
| `.github/workflows/publish.yml` | CI workflow | event-driven | `.github/workflows/ci.yml` (root) | role-match (same runner setup; different trigger + publish step) |
| `pnpm-workspace.yaml` (POSSIBLY NEW) | config | static | (no analog; D-11 conditional) | no match |
| `.npmrc` (POSSIBLY MODIFIED) | config | static | `.npmrc` (self) | exact |
| `LICENSE` (VERIFIED only) | docs | static | `LICENSE` (self) | exact (no change) |

---

## Pattern Assignments

### `examples/data/*.hl7` (fixture, static data)

**Analog:** `test/fixtures/canonical/adt-a01.hl7`, `test/fixtures/canonical/oru-r01.hl7`

**Wire format pattern** (single line, `\r`-separated, no trailing newline — see `test/fixtures/canonical/README.md` lines 9-15):

```
MSH|^~\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5␍EVN|A01|20260419101500␍PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212␍PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001
```

**Conventions to mirror** (from `test/fixtures/canonical/README.md` lines 9-15):
- `\r`-separated segments (NOT `\n`), no trailing newline
- HL7-native MSH-7 timestamps (`YYYYMMDDHHMMSS`) — except the `adt-mutate-source.hl7` example may intentionally include vendor-quirky elements per CONTEXT D-02
- Synthetic patient identifiers only (no PHI) — Phase 6 D-27 / Phase 7 D-17 carry-forward
- Sequential control IDs (`MSG00001`+) — use fresh IDs for examples (not anchored to the canonical set)
- Z-segment fixture shape from `test/fixtures/canonical/z-segments.hl7`:

```
MSH|^~\&|SENDAPP|...|ADT^A01^ADT_A01|MSG00008|P|2.5␍EVN|A01|20260419170000␍PID|1||MRN-Z-001^^^HOSP^MR||Doe^John^Q||19800115|M␍PV1|...␍ZXX|1|customField1|customField2␍ZYY|1|extraData
```

---

### `scripts/run-examples.ts` (build/CI script, batch process spawn)

**Analog:** `scripts/write-vendor-quirks.mjs` (one-shot node-stdlib-only script)

**File header + stdlib imports pattern** (lines 1-17):

```js
/**
 * One-shot script — authors the 13 vendor-quirks fixtures with exact byte
 * content (\r-separated, no trailing newline, synthetic data). Run once via
 * `node scripts/write-vendor-quirks.mjs`. Safe to re-run (idempotent).
 *
 * Each fixture maps to one Tier-2 WARNING_CODES entry. Filename is the
 * kebab-case of the UPPER_SNAKE code per Plan 07-04 D-12.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Apply to `run-examples.ts`:** same JSDoc header style (purpose + how to run), `node:` prefixed stdlib imports only, no third-party deps, `fileURLToPath(import.meta.url)` for resolving paths.

**Spawn pattern** (from CONTEXT.md `<specifics>` skeleton — lines 579-608):

```ts
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

const examples = fs.readdirSync('examples')
  .filter((f) => f.endsWith('.ts') && !f.startsWith('_'));

const expectedMarkers: Record<string, string> = {
  'extract-patient-info.ts': 'Patient MRN:',
  'read-lab-results.ts': 'Observation',
  'modify-and-resend.ts': 'Re-serialized HL7',
};

let failed = 0;
for (const file of examples) {
  const r = spawnSync('pnpm', ['tsx', `examples/${file}`], { encoding: 'utf8' });
  const marker = expectedMarkers[file];
  if (r.status !== 0 || (marker && !r.stdout.includes(marker))) {
    console.error(`FAIL ${file}\nstatus=${r.status}\n${r.stderr}`);
    failed++;
    continue;
  }
  console.log(`OK   ${file}`);
}
process.exit(failed === 0 ? 0 : 1);
```

**CRITICAL from D-04:** use `spawnSync` with argv array (`['tsx', 'examples/foo.ts']`), NOT `execSync` with a shell template — filenames must flow as argv, not shell text. `console.log`/`console.error` is acceptable here because the ESLint `no-console` rule is scoped to `src/**/*.ts` + `test/**/*.ts` (see `eslint.config.js` line 16); `scripts/**` is outside that glob.

**Non-recursion constraint (D-04):** filter `examples/*.ts` at depth 1 only — do NOT recurse into `examples/data/` or `examples/profile-starter-kit/`. Use `readdirSync('examples')` + `.filter((f) => f.endsWith('.ts'))`, not a recursive walker.

---

### `examples/extract-patient-info.ts` / `read-lab-results.ts` / `modify-and-resend.ts` (runnable scripts)

**No direct in-repo analog** — examples are a new role (runnable narrated scripts). Closest stylistic references:

**Import pattern** — cookbook imports (D-14) use the published name, even though package not yet on npm. Mirrors the JSDoc `@example` blocks throughout `src/`:

From `src/profiles/genericLab.ts` lines 10-16:

```ts
/**
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw, profiles.genericLab);
 * const znt = msg.allSegments().find((s) => s.type === "ZNT");
 * console.log(znt?.get("noteText")?.value);
 * ```
 */
```

**Apply to examples:**

```ts
import { parseHL7 } from '@cosyte/hl7-parser';
import * as fs from 'node:fs';

const raw = fs.readFileSync('examples/data/adt-a01.hl7', 'utf8');
const msg = parseHL7(raw);

console.log('Patient MRN:', msg.patient.mrn);
console.log('Full name:', msg.patient.fullName);
console.log('DOB:', msg.patient.dateOfBirth);
```

**modify-and-resend skeleton** (CONTEXT.md `<specifics>` lines 540-555):

```ts
import { parseHL7 } from '@cosyte/hl7-parser';
import * as fs from 'node:fs';

const raw = fs.readFileSync('examples/data/adt-mutate-source.hl7', 'utf8');
const msg = parseHL7(raw);

console.log('Original PV1.3 (location):', msg.get('PV1.3.1'));
msg.setField('PV1.3.1', 'NEW-WARD');
console.log('Modified PV1.3 (location):', msg.get('PV1.3.1'));

const reserialized = msg.toString();
console.log('--- Re-serialized HL7 ---');
console.log(reserialized);
```

**Output style (D-03):** narrated labeled `console.log` lines ("reads like a tutorial"). Each example ends with a marker string the smoke script asserts on:
- `extract-patient-info.ts` → must print `Patient MRN:`
- `read-lab-results.ts` → must print `Observation`
- `modify-and-resend.ts` → must print `Re-serialized HL7`

**ESLint `no-console` note:** the rule is scoped to `src/**/*.ts` + `test/**/*.ts` in `eslint.config.js` line 16 — `examples/**` is outside the glob, so `console.log` is legal. Planner should confirm the glob is NOT widened when wiring lint for examples.

**Path resolution:** CONTEXT shows bare relative paths (`'examples/data/adt-a01.hl7'`). This works when CWD is repo root (as it is when `pnpm tsx examples/...` runs from root) and when the smoke script runs from the same CWD. Planner confirms — alternative is `fileURLToPath(import.meta.url)` + `path.join(__dirname, 'data', '...')` which is more robust.

---

### `examples/README.md` (docs index)

**Analog:** `test/fixtures/canonical/README.md`

**Index-table pattern** (lines 1-34):

```markdown
# canonical fixtures

Spec-clean HL7 v2 fixtures covering the 7 message types enumerated in TEST-02
plus 2 dedicated structural cases (Z-segments and nested-subcomponents). The
third structural case from TEST-02 — repeating fields — is provided by
`oru-r01.hl7` (PID-3 has two repetitions: MRN ~ SSN; OBR + 3 OBX
observations).

All fixtures use:

- `\r`-separated segments, no trailing newline (parser-canonical wire format)
- HL7-native MSH-7 timestamps (`YYYYMMDDHHMMSS`) — NOT vendor-flavored dates
- Synthetic patient identifiers only (CONTEXT.md D-17 — no PHI, MIT-redistributable)

## Fixtures

| File         | Message type | Helper probe (D-20)                        |
| ------------ | ------------ | ------------------------------------------ |
| adt-a01.hl7  | ADT^A01      | `msg.patient.mrn === 'MRN12345'` + ...     |
| ...          | ...          | ...                                        |
```

**Apply to `examples/README.md`:** H1 + one-paragraph intro + bullet list of shared conventions + fixtures/examples table (one row per `.ts` file with: filename, what it demonstrates, exact run command). CONTEXT D-05 says "one paragraph per example describing what it demonstrates and the exact command to run it."

---

### `examples/profile-starter-kit/src/index.ts` (profile definition)

**Analogs:** `src/profiles/genericLab.ts`, `src/profiles/epic.ts` (combined — kit's profile extends `genericLab` per D-07 and structurally mirrors `epic.ts`'s shape)

**File-header + import + profile definition pattern** (full `src/profiles/epic.ts`):

```ts
/**
 * Epic Bridges Interconnect HL7 quirks. Ships non-HL7 date formats
 * (`MM/DD/YYYY HH:mm:ss`, `MM/DD/YYYY`) commonly seen in ADT outbound
 * feeds, plus two Z-segments: `ZDP` (department context) and `ZRS`
 * (result status). BIP-01.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw, profiles.epic);
 * const zdp = msg.allSegments().find((s) => s.type === "ZDP");
 * console.log(zdp?.get("departmentCode")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

/**
 * Built-in Epic Bridges Interconnect profile (BIP-01). See file header
 * for rationale; use via `parseHL7(raw, profiles.epic)`.
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw, profiles.epic);
 * ```
 */
export const epic = defineProfile({
  name: "epic",
  description: "Epic Bridges Interconnect — ADT-style date formats and common Z-segments",
  dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"],
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
    ZRS: { fields: { resultStatus: 1, statusDateTime: 2 } },
  },
});
```

**Apply to kit `src/index.ts`** (D-07 — kit imports from the published package name, unlike the in-repo built-ins which import `./define.js`):

```ts
/**
 * {{PROFILE_NAME}} profile for {{YOUR_ORG}} HL7 integrations.
 * Declares one Z-segment ({{ZAL}}) and one non-HL7 date format (ISO-date).
 * Extends the generic reference-laboratory profile.
 */

import { defineProfile, profiles } from "@cosyte/hl7-parser";

/**
 * {{PROFILE_NAME}} profile. Suppresses UNKNOWN_SEGMENT for ZAL and adds
 * an ISO-date fallback to the genericLab baseline.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * import { MyProfile } from "@{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}";
 * const msg = parseHL7(raw, MyProfile);
 * ```
 */
export const MyProfile = defineProfile({
  name: "{{PROFILE_NAME}}",
  description: "Profile for {{YOUR_ORG}} HL7 integrations",
  extends: profiles.genericLab,
  customSegments: {
    ZAL: { fields: { allergyId: 1, severity: 2, verifiedAt: 3 } },
  },
  dateFormats: ["yyyy-MM-dd"],
});
```

**Note on `genericLab.customSegments` shape** (`src/profiles/genericLab.ts` line 36): fields are `{ name: index }` records, NOT the array-of-names shape shown in CONTEXT.md D-07 line 125. The kit MUST use the record shape (`{ allergyId: 1, severity: 2, verifiedAt: 3 }`) to match the actual `CustomSegmentDefinition` type. The CONTEXT.md `<specifics>` section (line 568) shows a slightly different shape (`fields: ['allergyId', 'severity', 'verifiedAt']`); planner resolves by inspecting `src/parser/types.ts::CustomSegmentDefinition` during planning and using whichever shape is canonical.

**Export identifier constraint (D-07 + `<specifics>` note at line 574):** `{{PROFILE_NAME}}` cannot literally appear in the `export const` position because it isn't a valid JS identifier. Pattern is to use a stable placeholder identifier (e.g., `MyProfile`) in the export slot, and have CUSTOMIZING.md instruct users to find-replace `MyProfile` → their PascalCase profile name.

---

### `examples/profile-starter-kit/test/profile.test.ts` (test)

**Analog:** `test/profiles-builtins.test.ts` lines 1-50

**Test file structure pattern** (lines 1-25):

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseHL7,
  profiles,
  WARNING_CODES,
  defineProfile,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadFixture = (relPath: string): string =>
  readFileSync(join(__dirname, "fixtures/vendor-shapes", relPath), "utf-8");

describe("profiles.epic — BIP-01 + BIP-06 fixture parity", () => {
  const fixture = loadFixture("epic/adt-a01.hl7");

  it("parses structurally with AND without profile", () => {
    const without = parseHL7(fixture);
    const withP = parseHL7(fixture, profiles.epic);
    expect(without.rawSegments.length).toBeGreaterThan(0);
    expect(withP.rawSegments.length).toBe(without.rawSegments.length);
  });
```

**Apply to kit `test/profile.test.ts`** (D-07 asserts: profile loads, fixture parses without `UNKNOWN_SEGMENT` warnings for `ZAL`, ZAL fields accessible by alias). Kit imports the profile from `../src/index.js` (like in-repo tests) AND imports `parseHL7` from `@cosyte/hl7-parser` (peer dep). Load fixture from `./fixtures/sample.hl7` using the `fileURLToPath(import.meta.url)` + `path.join` pattern above.

---

### `examples/profile-starter-kit/test/fixtures/sample.hl7` (fixture)

**Analog:** `test/fixtures/canonical/z-segments.hl7`

**Z-segment fixture pattern** (full file):

```
MSH|^~\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419170000||ADT^A01^ADT_A01|MSG00008|P|2.5␍EVN|A01|20260419170000␍PID|1||MRN-Z-001^^^HOSP^MR||Doe^John^Q||19800115|M␍PV1|1|I|ICU^101^A^HOSP||||||||||||||||VISIT-Z-001␍ZXX|1|customField1|customField2␍ZYY|1|extraData
```

**Apply to kit `sample.hl7`:** ADT^A01 message with one `ZAL` segment populated (per D-07), `\r` separators, synthetic IDs only, no trailing newline.

---

### `examples/profile-starter-kit/package.json` (kit npm manifest)

**Analog:** root `package.json` lines 1-77

**Shape pattern to adapt** (root `package.json` lines 22-49):

```json
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
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
```

**Scripts pattern** (root lines 50-62):

```json
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\" --max-warnings=0",
    "test": "vitest run",
    "prepublishOnly": "pnpm clean && pnpm typecheck && pnpm lint && pnpm test && pnpm build"
  },
```

**Kit deltas (D-10):**
- `name`: `"@{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}"` (scope + name both placeholder)
- `version`: `"0.1.0"` (D-20 — matches parent)
- `files`: `["dist", "README.md", "LICENSE", "CUSTOMIZING.md"]` (adds CUSTOMIZING.md, drops CHANGELOG)
- ADD `peerDependencies`: `{ "@cosyte/hl7-parser": ">=0.1.0" }`
- ADD `peerDependenciesMeta`: `{ "@cosyte/hl7-parser": { "optional": false } }` (D-10 wording is ambiguous; KIT-05 says parser is required — planner confirms shape)
- `devDependencies`: `@cosyte/hl7-parser` + `tsup` + `typescript` + `vitest` + `eslint` + `@types/node` (slimmer than parent — no coverage provider, no jsdoc plugin, no prettier-config)
- No `dependencies` key (parser is peer; zero-runtime-deps preserved)
- Drop `repository`, `homepage`, `bugs`, `author` from parent shape (placeholders would be noise; users fill in at publish time per CUSTOMIZING.md step 1)
- Drop `provenance: true` from publishConfig (kit user may not have npm provenance configured)

---

### `examples/profile-starter-kit/tsup.config.ts`

**Analog:** root `tsup.config.ts` (full file, 33 lines)

**Full pattern to copy** (lines 14-33):

```ts
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

**Apply to kit:** same exact config — dual ESM+CJS, `.d.ts`, same target/platform. File-header JSDoc can be slimmer ("tsup config for the profile starter kit — dual ESM+CJS matching peer parser").

---

### `examples/profile-starter-kit/vitest.config.ts`

**Analog:** root `vitest.config.ts`

**Slim pattern to copy** (lines 10-18, drop the coverage block):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    reporters: ["default"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
```

**Per CONTEXT D-08:** "no coverage gate — kit ships green-or-red, no thresholds." Drop the entire `coverage: { ... }` block (lines 20-91).

---

### `examples/profile-starter-kit/tsconfig.json`

**Analog:** root `tsconfig.json`

**Full copy pattern** (root lines 1-35 — `tsconfig.json` is already standalone; no extends):

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

    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "*.config.ts"],
  "exclude": ["node_modules", "dist", "coverage"]
}
```

**Apply to kit:** exact copy (D-08: "extends nothing — standalone strict TS").

---

### `examples/profile-starter-kit/eslint.config.js`

**Analog:** root `eslint.config.js`

**Slim-subset pattern** — copy the structure (flat config, ignores block + TS rules + prettier-last), but drop the jsdoc plugin requirements (kit is scaffolding; forcing `@example` on a template profile adds noise).

**Structure pattern to copy** (root lines 1-35, 95-118):

```js
// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "*.config.js"] },
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
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  prettierConfig,
];
```

**Slim-subset justification (D-08):** drop jsdoc plugin + its rules (kit doesn't enforce `@example`), drop some of the stricter `no-unsafe-*` rules (kit is 1 file of 50 LOC — overkill). Keep `no-explicit-any`, `consistent-type-imports`, `eqeqeq`, `no-var`, `prefer-const`. Keep `prettierConfig` last.

---

### `examples/profile-starter-kit/.prettierrc` / `.gitignore`

**Analogs:** root `.prettierrc.json` (30 lines) + root `.gitignore` (40 lines)

**Apply:** exact copies. `.prettierrc` vs `.prettierrc.json` extension is planner's call (D-08 says "or inherits via `prettier-config` if simpler" — simplest is literal copy).

---

### `examples/profile-starter-kit/.github/workflows/ci.yml`

**Analog:** root `.github/workflows/ci.yml` (68 lines)

**Full pattern to adapt** (lines 1-53):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    name: verify
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

**Kit deltas:**
- Drop node matrix (single Node 20 — kit is a template; matrix is over-engineering per D-08 slim principle)
- `pnpm install --no-frozen-lockfile` (D-06 — placeholders in `name` field tolerated by pnpm with this flag)
- Drop `Format check`, coverage, dual-module-artifact verify steps (kit ships green-or-red)
- Drop `VERSION`-export smoke test (kit exports `MyProfile`, not `VERSION`)

---

### `examples/profile-starter-kit/.github/workflows/publish.yml`

**No direct in-repo analog (D-24 parent publish.yml is being authored in parallel).** Pattern is the skeleton in CONTEXT.md `<specifics>` lines 613-636:

```yaml
name: Publish
on:
  workflow_dispatch:
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
      - run: pnpm publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Kit caveat:** `--frozen-lockfile` may fail in the kit if placeholders produce a non-reproducible lockfile — planner should verify and fall back to `--no-frozen-lockfile` in the kit's publish.yml to match the kit's ci.yml (parent's publish.yml can keep `--frozen-lockfile`).

**Version pin:** parent CI uses `pnpm/action-setup@v4` (root ci.yml line 30). Kit should use `@v4` as well (CONTEXT skeleton shows `@v3` — planner should upgrade to `@v4` for consistency with parent CI).

---

### `examples/profile-starter-kit/LICENSE`

**Analog:** root `LICENSE` (MIT boilerplate, 21 lines)

**Apply:** exact copy, update copyright line `Copyright (c) 2026 {{YOUR_ORG}}` (D-06 — placeholder).

---

### `examples/profile-starter-kit/README.md` and `CUSTOMIZING.md`

**No direct in-repo analog.** Both are new prose documents. Adjacent stylistic conventions:
- CLAUDE.md + `test/fixtures/canonical/README.md`: H1 + one-paragraph intro + bullet list + table
- Numbered-steps style (CUSTOMIZING.md D-09): mirrors `.planning/phases/` PLAN.md conventions — numbered sections with "verify by..." closing bullets
- Code fences labeled `ts` / `bash` / `json` (matches existing `README.md` stub)

---

### `.github/workflows/ci.yml` (MODIFIED — parent CI)

**Analog:** self (extend in place)

**Existing test-step pattern** (lines 52-53):

```yaml
      - name: Test
        run: pnpm test

      - name: Test (with coverage)
        run: pnpm test:coverage
```

**Add AFTER these (per CONTEXT D-04 and D-11):**

```yaml
      - name: Examples (smoke)
        run: pnpm examples

      - name: Starter kit (install + test + build)
        working-directory: examples/profile-starter-kit
        run: |
          pnpm install --no-frozen-lockfile
          pnpm test
          pnpm build

      - name: Validate kit workflows (actionlint)
        uses: reviewdog/action-actionlint@v1
        with:
          actionlint_flags: examples/profile-starter-kit/.github/workflows/*.yml
```

**Matrix consideration:** the parent CI runs across `node: ["18", "20", "22"]` (line 24). Examples + kit-smoke steps run 3× per push by default. Planner should decide: (a) let all 3 run (simplest, ~90s extra total); (b) gate examples/kit-smoke to `if: matrix.node == '20'` (faster but asymmetric). D-11 says "Adds ~30s to CI" suggesting single-matrix-slot. Recommendation: use `if: matrix.node == '20'`.

---

### `.github/workflows/publish.yml` (NEW — parent publish workflow)

**Analog:** CONTEXT.md `<specifics>` skeleton lines 613-636 (same as kit's publish.yml — kit and parent publish workflows are structurally twins).

**Parent deltas vs kit:**
- Parent uses `pnpm install --frozen-lockfile` (root has a real lockfile)
- Parent's `pnpm publish --access public --no-git-checks` (D-24 — same as kit)
- `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (same)
- Add `--provenance` flag (package.json already declares `"provenance": true` in publishConfig — line 48) — this is already automatic if publishConfig.provenance is true; planner confirms

---

### `package.json` (MODIFIED — parent)

**Analog:** self

**Changes required (D-01, D-04, D-20):**

- `version`: `"0.0.0"` → `"0.1.0"` (D-20)
- `scripts`: ADD `"examples": "tsx scripts/run-examples.ts"` (D-04) — slot between `test:coverage` and `clean` alphabetically or after the test scripts
- `devDependencies`: ADD `"tsx": "^4.x"` (D-01, "Claude's Discretion" recommends caret pin)

Existing scripts pattern (package.json lines 50-62) for placement reference:

```json
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
```

**Prettier glob consideration:** if planner adopts the workspace approach (D-11), the `format`/`format:check` globs currently hit `src/**/*.{ts,md}` + `test/**/*.ts` + `*.{json,md,yml}`; this does NOT cover the new `examples/` or `examples/profile-starter-kit/` trees. Planner confirms whether the kit is excluded on purpose (it has its own prettier config) or should be added to the parent glob.

---

### `pnpm-workspace.yaml` (POSSIBLY NEW — D-11 conditional)

**No direct in-repo analog.** Minimal shape (per `https://pnpm.io/workspaces`):

```yaml
packages:
  - "examples/profile-starter-kit"
```

**Companion `.npmrc` modification (D-11):** current `.npmrc`:

```
engine-strict=true
save-exact=false
auto-install-peers=true
strict-peer-dependencies=false
```

May add `link-workspace-packages=true`. Planner confirms this doesn't break existing `pnpm install` in the parent (D-11 note: "Planner confirms whether adding `pnpm-workspace.yaml` to a previously-non-workspace repo causes any breakage").

---

### `CHANGELOG.md` (NEW)

**No direct in-repo analog.** Pattern is the Keep-a-Changelog v1.1.0 spec (https://keepachangelog.com/en/1.1.0/):

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-MM-DD

### Added

- Parser (lenient default + strict mode)
- Warning system — 13 Tier-2 codes (`MLLP_FRAMING_STRIPPED`, ... `UNKNOWN_CHARSET`)
- 4 Tier-3 fatal codes
- Structural model + 11 composite types (XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD, XCN)
- Named helpers — `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()`
- Serialization — `toString`, `toJSON`, `prettyPrint`, `buildMessage`
- Profile system — `defineProfile()`, `extends`, default profile management
- 5 built-in vendor profiles — epic, cerner, meditech, athena, genericLab
- Three runnable examples
- Profile starter kit
- Comprehensive README + docs
```

**Content sourced from CONTEXT D-22** (lines 272-282 of CONTEXT.md list the exact capability groups).

---

### `CONTRIBUTING.md` (NEW)

**No direct in-repo analog.** Section skeleton per CONTEXT D-19 (lines 248-254):

```markdown
# Contributing to @cosyte/hl7-parser

## Filing an issue
## Opening a PR
## Dev setup
## Adding a vendor-quirk fixture
## Authoring a profile
## Publishing a standalone profile package
```

Dev-setup pipeline pulls from CLAUDE.md line 19 (`pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test`).
Vendor-quirk convention pulls from `test/fixtures/vendor-quirks/` (Phase 7 D-12 — kebab-case = UPPER_SNAKE warning code).
Profile authoring points at `examples/profile-starter-kit/`.

---

### `README.md` (REPLACED — top-level)

**No direct in-repo analog (current 34-line stub superseded).** Stylistic references:

- Code-fence conventions — mirror existing JSDoc `@example` blocks throughout `src/` (`import { parseHL7, profiles } from "@cosyte/hl7-parser";` — note double quotes match `.prettierrc.json` line 7 `singleQuote: false`, but D-14 + CONTEXT specifics use single quotes; planner resolves — Prettier's `singleQuote: false` wins for repo-owned code, so all README snippets should use `"..."`)
- ASCII-only visuals (D-16)
- Code snippets ~5-15 lines per cookbook recipe (D-13)
- Imports always from the published name `@cosyte/hl7-parser` (D-14)

**Section ordering** (DOC-01..11):
1. Value prop (one sentence, from PROJECT.md)
2. Badges (D-17: npm version + CI + license + Node)
3. Quickstart (DOC-02 — see the `<specifics>` block at CONTEXT lines 497-505)
4. Feature list (DOC-03)
5. "HL7 in 90 seconds" + ASCII tree (DOC-04, D-16 — see CONTEXT lines 510-521)
6. Three access patterns (DOC-05)
7. Cookbook (DOC-06 — list of recipes at D-13 depth)
8. Profiles (top-level section, DOC-07)
9. Real-World Tolerance + 4-tier table + runnable warnings iter example (DOC-08 — see CONTEXT lines 524-538)
10. Error Handling (DOC-09)
11. Roadmap (DOC-12 — v2 deferrals from PROJECT.md "Out of Scope")
12. Contributing (DOC-10 — links CONTRIBUTING.md)
13. Built by Cosyte footer (DOC-11)

---

## Shared Patterns

### Zero runtime deps + node stdlib only

**Source:** CLAUDE.md line 22 ("Runtime deps: Zero. Node stdlib only."), `scripts/write-vendor-quirks.mjs` (uses only `node:fs`, `node:path`, `node:url`)

**Apply to:** all new `.ts`/`.mjs` files in Phase 8 — `examples/*.ts` (only `node:fs`), `scripts/run-examples.ts` (only `node:fs`, `node:child_process`, `node:url`, `node:path`), kit `src/index.ts` (only `@cosyte/hl7-parser` peer import).

### JSDoc file headers with rationale + `@example`

**Source:** `src/profiles/genericLab.ts` lines 1-17, `src/profiles/epic.ts` lines 1-18

**Apply to:**
- `examples/*.ts` top-of-file comments describe what the example demonstrates + the exact run command
- Kit `src/index.ts` mirrors the genericLab/epic file-header JSDoc style
- `scripts/run-examples.ts` mirrors `scripts/write-vendor-quirks.mjs` header (purpose + how to run + idempotency note)

### Synthetic data only (no PHI)

**Source:** `test/fixtures/canonical/README.md` lines 12-13 (Phase 6 D-27 / Phase 7 D-17 carry-forward)

**Apply to:** every new `.hl7` fixture in `examples/data/` + `examples/profile-starter-kit/test/fixtures/`. Use placeholder names (`Doe^John`), fabricated MRNs (`MRN12345`, `MRN-Z-001`), fabricated control IDs.

### Kebab-case filenames

**Source:** Phase 7 D-12 convention — all `test/fixtures/vendor-quirks/*.hl7` are kebab-case

**Apply to:** `examples/extract-patient-info.ts`, `examples/read-lab-results.ts`, `examples/modify-and-resend.ts`, `examples/data/adt-a01.hl7`, `examples/data/oru-r01-lab.hl7`, `examples/data/adt-mutate-source.hl7`.

### HL7 wire format (canonical)

**Source:** `test/fixtures/canonical/README.md` lines 9-13

**Apply to:** all `.hl7` fixtures (both `examples/data/` and kit's `test/fixtures/`):
- `\r`-separated segments (NOT `\n`)
- No trailing newline
- HL7-native MSH-7 timestamps (except intentional vendor-quirky examples)

### Per-feature CI step (not folded into `pnpm test`)

**Source:** `.github/workflows/ci.yml` (Phase 1 + Phase 7 D-30 pattern) — each concern gets its own step with a distinct name

**Apply to:** `Examples (smoke)`, `Starter kit (install + test + build)`, `Validate kit workflows (actionlint)` — each a separate step in parent ci.yml, not bundled into the existing `Test` step. Failing examples produce a clear, independent CI signal.

### ESM imports with `.js` extension for intra-repo imports

**Source:** `src/profiles/index.ts` lines 13-20 (`import { defineProfile } from "./define.js"`)

**Apply to:** kit's `test/profile.test.ts` imports from `../src/index.js` (matches in-repo test convention). Examples/kit imports from `@cosyte/hl7-parser` have no extension (package-entry-point import).

---

## No Analog Found

Files with no close match in the codebase — planner should use RESEARCH.md / CONTEXT.md skeletons + CLAUDE.md conventions directly:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `examples/extract-patient-info.ts` | runnable script | file-I/O + print | No `examples/` directory exists yet — first runnable console-output scripts |
| `examples/read-lab-results.ts` | runnable script | file-I/O + print | Same as above |
| `examples/modify-and-resend.ts` | runnable script | file-I/O + transform + print | Same (closest partial: `test/round-trip.test.ts` for round-trip semantics) |
| `examples/profile-starter-kit/README.md` | prose docs | static | New document; no existing user-facing README to mirror beyond 34-line stub |
| `examples/profile-starter-kit/CUSTOMIZING.md` | prose docs (numbered steps) | static | New document category |
| `examples/profile-starter-kit/.github/workflows/publish.yml` | CI workflow | event-driven | No existing publish.yml in repo — parent's publish.yml is authored in same phase (sibling, not analog) |
| `README.md` (top-level replacement) | prose docs | static | Current 34-line stub fully superseded; no mid-size README precedent in repo |
| `CHANGELOG.md` | prose docs (Keep-a-Changelog) | static | New file; external Keep-a-Changelog spec is the reference |
| `CONTRIBUTING.md` | prose docs | static | New file |
| `pnpm-workspace.yaml` | config | static | Conditional on D-11 path choice; new file either way |
| `.github/workflows/publish.yml` (root) | CI workflow | event-driven | New file; CI workflow skeleton in CONTEXT `<specifics>` lines 613-636 |

---

## Metadata

**Analog search scope:**
- `/home/nschatz/projects/cosyte/hl7-parser/` (repo root — configs + root docs)
- `/home/nschatz/projects/cosyte/hl7-parser/.github/workflows/` (CI workflows)
- `/home/nschatz/projects/cosyte/hl7-parser/src/profiles/` (profile definitions — analogs for kit `src/index.ts`)
- `/home/nschatz/projects/cosyte/hl7-parser/src/index.ts` (public export surface — informs cookbook imports)
- `/home/nschatz/projects/cosyte/hl7-parser/test/fixtures/canonical/` (HL7 fixtures — analogs for `examples/data/`)
- `/home/nschatz/projects/cosyte/hl7-parser/test/` (test files — analog for kit `test/profile.test.ts`)
- `/home/nschatz/projects/cosyte/hl7-parser/scripts/` (one-shot node scripts — analog for `run-examples.ts`)

**Files scanned:** ~30 (package.json, tsup.config.ts, tsconfig.json, tsconfig.build.json, vitest.config.ts, eslint.config.js, .prettierrc.json, .gitignore, .npmrc, .eslintignore, .editorconfig, .prettierignore, README.md, LICENSE, CLAUDE.md, .github/workflows/ci.yml, src/index.ts, src/profiles/{index,genericLab,epic,define}.ts, test/fixtures/canonical/{README,adt-a01,oru-r01,z-segments}.hl7, test/{sanity,profiles-builtins}.test.ts, scripts/write-vendor-quirks.mjs).

**Pattern extraction date:** 2026-04-19
