# Phase 2: Core Parser & Tolerance - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 10 source files + 10 test files = 20 new files
**Analogs found:** 2 / 20 (both are Phase 1 conventions, not direct role matches — the codebase is greenfield for parser/model)

## Summary of Codebase State

Before Phase 2 the repo contains only:

- `src/index.ts` — public entry, exports `VERSION: string` (a JSDoc-annotated stub).
- `test/sanity.test.ts` — a two-case Vitest suite importing from `../src/index.js`.

No `src/parser/`, `src/model/`, `src/helpers/`, `src/types/` exist yet. Phase 2 is the first real code. There is **no existing analog for any parser stage, warning registry, typed error, or message model**. Instead, the "analog" for every Phase 2 file is the set of Phase 1 *conventions* (TS strictness, JSDoc shape, import style, test layout) extracted from `src/index.ts`, `test/sanity.test.ts`, `eslint.config.js`, `vitest.config.ts`, and `tsconfig.json`.

Treat the two "analog" sections below as the authoritative style reference Phase 2 must imitate. All other "Pattern Assignments" below describe patterns the planner must *construct* (guided by Phase 1 conventions + the decisions in `02-CONTEXT.md`), because no equivalent file exists to copy from yet.

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/parser/normalize.ts` | utility | transform | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/mllp.ts` | utility | transform | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/segments.ts` | utility | transform | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/delimiters.ts` | utility | transform | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/tokenize.ts` | utility | transform | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/escapes.ts` | utility | transform | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/warnings.ts` | registry + factories | data construction | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/errors.ts` | typed error classes | throw | `src/index.ts` (conventions only) | conventions-only |
| `src/parser/index.ts` | public API entry (`parseHL7`) | request-response | `src/index.ts` (exact role analog for module shape) | role-match |
| `src/model/message.ts` | model class (`Hl7Message`) | data container | `src/index.ts` (conventions only) | conventions-only |
| `test/*.test.ts` (10 files, one per module) | test | assertion | `test/sanity.test.ts` (exact role + location analog) | exact |
| `src/index.ts` (MODIFIED) | public API barrel | re-export | `src/index.ts` itself (add exports; keep VERSION) | self |

## Convention Analog 1: `src/index.ts` (the shape every public-export module must imitate)

**Full file** (22 lines):

```typescript
/**
 * Public entry point for the `@cosyte/hl7-parser` package.
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

**Concrete conventions extracted** (every Phase 2 source file must honor all six):

1. **File-level JSDoc is a plain prose block.** Do NOT start the first non-whitespace token with `@`. `eslint-plugin-jsdoc` parses `@cosyte/hl7-parser` or `@param` at line-start as a tag name and rejects unknown tags (`jsdoc/check-tag-names`). Put the package name in backticks mid-sentence: `` `@cosyte/hl7-parser` ``. (See Rule 1 fix in `01-04-SUMMARY.md`, commit `8403738`.)

2. **Every named export carries its own JSDoc block with `@example`.** The `jsdoc/require-jsdoc` + `jsdoc/require-example` ESLint rules are scoped to `ExportNamedDeclaration > (VariableDeclaration | FunctionDeclaration | ClassDeclaration | TSTypeAliasDeclaration | TSInterfaceDeclaration | TSEnumDeclaration)`. Exempt with `@internal` only if the export is genuinely not public-facing.

3. **`@example` block uses a fenced `` ```ts `` code block** with realistic import from `"@cosyte/hl7-parser"` (not relative paths). Example forms:

   ```ts
   import { parseHL7 } from "@cosyte/hl7-parser";
   const msg = parseHL7("MSH|^~\\&|...");
   ```

4. **Explicit type annotation on exported `const`.** `export const VERSION: string = "0.0.0"` — do not rely on inference for public exports. Type-first keeps `.d.ts` output stable across refactors.

5. **Allowed custom JSDoc tags:** `@internal` and `@remarks` only (see `eslint.config.js` line 93: `jsdoc/check-tag-names: ["error", { definedTags: ["internal", "remarks"] }]`). Any other non-standard tag fails lint.

6. **No runtime imports from `dependencies`.** Zero-runtime-deps is enforced by `"dependencies": {}` in `package.json`. Only `import`s from `node:*` builtins (or relative project paths) are allowed in `src/**`. Devtime-only imports (e.g., `vitest`) belong in `test/` or `*.config.ts`.

## Convention Analog 2: `test/sanity.test.ts` (the shape every Phase 2 test must imitate)

**Full file** (16 lines):

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

**Concrete conventions extracted** (every Phase 2 test file must honor all six):

1. **Location:** `test/*.test.ts` (flat, one file per source module). `vitest.config.ts` also allows `src/**/*.test.ts` co-location — pick one per plan and stay consistent; recommend `test/` to keep `src/` free of test-only imports. Both globs are in `include` (line 14) and both are excluded from coverage (lines 26-27).

2. **Explicit Vitest imports.** `import { describe, expect, it } from "vitest";` — do not rely on globals. `vitest.config.ts` sets `globals: false` (line 12).

3. **Import sources with the `.js` extension.** `from "../src/index.js"` — the `NodeNext` module resolution in `tsconfig.json` (line 4-5) requires the compiled-file extension in import specifiers even from `.ts` source.

4. **JSDoc not required in tests.** `eslint.config.js` section 3 (lines 108-114) explicitly turns off `jsdoc/require-jsdoc` and `jsdoc/require-example` for `test/**/*.ts`.

5. **Arrange-act-assert via `expect(...).toXxx(...)` chains.** No custom matchers yet; add one only if a pattern repeats across 3+ files.

6. **Blank line between the `import "vitest"` group and the `import ... from "../src/..."` group.** Prettier-enforced ordering — groups separated by one blank line. (See `test/sanity.test.ts` lines 1-3.)

## Pattern Assignments

For every new file below, the analog is one of the two convention blocks above. Additional file-specific patterns come from `02-CONTEXT.md` decisions, not from existing code.

---

### `src/parser/warnings.ts` (registry + factories)

**Analog:** Convention Analog 1 (`src/index.ts` style).

**Decision-driven pattern (D-09, D-10, D-11 from CONTEXT.md):**

Emit three things from this file:

1. **A `const` record keyed by warning code string:**

   ```typescript
   /**
    * Stable string codes for every Tier-2 warning the parser may emit.
    * Consumers compare `w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED`
    * instead of hardcoding strings.
    *
    * @example
    * ```ts
    * import { parseHL7, WARNING_CODES } from "@cosyte/hl7-parser";
    * const msg = parseHL7(raw);
    * if (msg.warnings.some(w => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED)) {
    *   // ...
    * }
    * ```
    */
   export const WARNING_CODES = {
     MLLP_FRAMING_STRIPPED: "MLLP_FRAMING_STRIPPED",
     FIELD_WHITESPACE_TRIMMED: "FIELD_WHITESPACE_TRIMMED",
     UNKNOWN_ESCAPE_SEQUENCE: "UNKNOWN_ESCAPE_SEQUENCE",
     TIMESTAMP_FALLBACK_FORMAT: "TIMESTAMP_FALLBACK_FORMAT",
     SEGMENT_CASE: "SEGMENT_CASE",
     EXTRA_FIELDS: "EXTRA_FIELDS",
     UNKNOWN_SEGMENT: "UNKNOWN_SEGMENT",
     DUPLICATE_REQUIRED_SEGMENT: "DUPLICATE_REQUIRED_SEGMENT",
     ENCODING_MISMATCH: "ENCODING_MISMATCH",
     MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
     OUT_OF_ORDER_SEGMENT: "OUT_OF_ORDER_SEGMENT",
     VERSION_MISMATCH: "VERSION_MISMATCH",
     UNKNOWN_CHARSET: "UNKNOWN_CHARSET",
   } as const;
   ```

2. **A string-literal union type derived from the record:**

   ```typescript
   /**
    * Discriminant type for `Hl7ParseWarning.code`. Narrowing a warning by this
    * code yields the exact `position` / `message` / payload shape the factory produced.
    *
    * @example
    * ```ts
    * function describe(w: Hl7ParseWarning) {
    *   switch (w.code) {
    *     case "MLLP_FRAMING_STRIPPED": return "framed";
    *     // ...
    *   }
    * }
    * ```
    */
   export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];
   ```

3. **One factory per code**, each returning an `Hl7ParseWarning`. Each factory owns its message template and its required position keys. Example signature:

   ```typescript
   export function mllpFramingStripped(position: Hl7Position): Hl7ParseWarning { /* ... */ }
   ```

**Files that import from this module:**

- `src/parser/index.ts` — imports every factory.
- `src/parser/errors.ts` — imports `WarningCode` to type the `code` field on `Hl7ParseError` (via union restriction).
- `src/index.ts` — re-exports `WARNING_CODES`, `WarningCode`, `Hl7ParseWarning` for consumers.

---

### `src/parser/errors.ts` (typed error classes)

**Analog:** Convention Analog 1.

**Decision-driven pattern (D-12, D-13, D-14, D-15):**

Exports:

1. **`FATAL_CODES` const record + `FatalCode` union** (recommended mirror of `WARNING_CODES` per D-09 and specifics line 138; promote from "Claude's discretion" to locked so Phase 2 ships a symmetric taxonomy).

   Four locked codes: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`.

2. **`class Hl7ParseError extends Error`** — single class, no per-code subclass (D-12). Required constructor fields: `code: FatalCode`, `message: string`, `position: Hl7Position`, `snippet: string` (D-14). Sets `this.name = "Hl7ParseError"`. Does NOT inherit a shared base with warnings (D-13).

3. **`class ProfileDefinitionError extends Error`** — declared in Phase 2, consumed in Phase 6 (D-15). Constructor signature should anticipate Phase 6 use: at minimum `message: string` and optionally `profileName?: string`. Kept minimal here; Phase 6 extends.

**Critical TS-strictness accommodations:**

- `useUnknownInCatchVariables: true` (tsconfig line 16) — if any internal code `try/catch`es, the caught variable is `unknown`. Narrow with `instanceof Hl7ParseError` or `instanceof Error` before property access.
- `exactOptionalPropertyTypes: true` (tsconfig line 15) — an `optional?: T` field cannot be explicitly set to `undefined`; it must be omitted or set to `T`. Affects the optional `cause?: unknown` discussed in D-14.

---

### `src/parser/index.ts` (public API entry — `parseHL7`)

**Analog:** `src/index.ts` (role-match: both are "the public entry point for their subsystem" — `src/index.ts` is the package entry, `src/parser/index.ts` is the parser-subsystem entry).

**Decision-driven pattern (D-05, D-06, D-11):**

Key shape:

```typescript
/**
 * Parses a raw HL7 v2 message (string or Buffer) into an Hl7Message shell.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7("MSH|^~\\&|SENDAPP|...");
 * console.log(msg.version, msg.warnings.length);
 * ```
 */
export function parseHL7(raw: string | Buffer): Hl7Message;
export function parseHL7(raw: string | Buffer, profile: Profile): Hl7Message;
export function parseHL7(raw: string | Buffer, options: ParseOptions): Hl7Message;
export function parseHL7(
  raw: string | Buffer,
  optionsOrProfile?: Profile | ParseOptions,
): Hl7Message {
  // 1. Discriminate via runtime check per D-06.
  // 2. Run pipeline: normalize -> stripMllp -> splitSegments -> readMsh -> tokenize.
  // 3. Route every warning through emitWarning() chokepoint per D-11.
  // 4. Return Hl7Message shell per D-05.
}
```

**Imports:**

```typescript
import { normalize } from "./normalize.js";
import { stripMllp } from "./mllp.js";
import { splitSegments } from "./segments.js";
import { readDelimiters } from "./delimiters.js";
import { tokenize } from "./tokenize.js";
import { Hl7ParseError } from "./errors.js";
import type { Hl7ParseWarning, WarningCode } from "./warnings.js";
import { Hl7Message } from "../model/message.js";
```

Note the `.js` extensions and `import type` for type-only imports (enforced by `@typescript-eslint/consistent-type-imports` — `eslint.config.js` line 49).

**emitWarning chokepoint** (D-11 — implement as a closure inside `parseHL7` or as a small helper):

```typescript
function makeEmitter(
  msg: Hl7Message,
  options: ParseOptions,
  input: string,
): (w: Hl7ParseWarning) => void {
  return (w) => {
    if (options.strict === true) {
      throw new Hl7ParseError(w.code, w.message, w.position, snippet(input, w.position));
    }
    // eslint rule: no-unsafe-member-access — msg.warnings must be typed as mutable internally.
    (msg.warnings as Hl7ParseWarning[]).push(w);
    options.onWarning?.(w);
  };
}
```

**Strict TS note:** `Hl7Message.warnings` is declared `readonly Hl7ParseWarning[]` on the public surface but is populated through an internal mutation path. Options: (a) use `as` cast at mutation site (requires justification comment — CLAUDE.md says no unjustified `as`); (b) store internally as a mutable array, expose via getter; (c) build the array first, freeze and assign once. Option (c) is cleanest given `eslint.config.js` line 38-41 bans object-literal `as` casts.

---

### `src/parser/normalize.ts` (preprocessing — stage 1)

**Analog:** Convention Analog 1.

**Decision-driven pattern (D-03):**

Pipeline (in this exact order):

1. `EMPTY_INPUT` fatal check — throw `Hl7ParseError` if input is 0 bytes or whitespace-only.
2. Strip UTF-8 BOM (`\uFEFF`) — silent (Tier 1), no warning.
3. Normalize line endings `\r\n` / `\n` / mixed → `\r` — silent (Tier 1).

**MLLP framing is a SEPARATE module** (`mllp.ts`) per D-02, invoked between BOM-strip and line-ending normalization in the pipeline (see `parseHL7` body).

**Signatures (sketch):**

```typescript
export function normalize(input: string): string; // string path
export function normalizeBuffer(input: Buffer, charset?: string): string; // Buffer path
```

**Stdlib-only:** Use `TextDecoder` from Node `globalThis` (available in Node 18+) — NOT `require("util").TextDecoder`. No external dep allowed.

---

### `src/parser/mllp.ts` (preprocessing — stage 2)

**Analog:** Convention Analog 1.

**Decision-driven pattern (D-03):**

Strip MLLP framing bytes: `0x0B` (VT / start-block), `0x1C` (FS / end-block), `0x0D` (CR when at the very end, treating it as the MLLP trailing CR not a segment separator).

Emit `MLLP_FRAMING_STRIPPED` warning (Tier-2) when any framing bytes were found. The warning factory lives in `warnings.ts`.

```typescript
export interface StripMllpResult {
  readonly stripped: string;
  readonly wasFramed: boolean;
}
export function stripMllp(input: string): StripMllpResult;
```

---

### `src/parser/segments.ts` (tokenizer — stage 3)

**Analog:** Convention Analog 1.

Split normalized input by `\r` into segments. Drop trailing empty segment from the final `\r`. Emit no warnings — segment split is mechanical.

```typescript
export function splitSegments(normalized: string): readonly string[];
```

---

### `src/parser/delimiters.ts` (tokenizer — stage 4)

**Analog:** Convention Analog 1.

Read the 5 HL7 delimiters from MSH-1 (field separator at position 3 of the first segment) and MSH-2 (encoding characters, 4 chars: component, repetition, escape, subcomponent).

Fatal paths (all throw `Hl7ParseError`):
- `NO_MSH_SEGMENT` — first segment doesn't start with `MSH`.
- `MSH_TOO_SHORT` — MSH segment has fewer than 8 chars (cannot contain encoding characters).
- `INVALID_ENCODING_CHARACTERS` — MSH-2 is not exactly 4 distinct non-whitespace chars, or the field separator is whitespace.

```typescript
export interface EncodingCharacters {
  readonly field: string; // default |
  readonly component: string; // default ^
  readonly repetition: string; // default ~
  readonly escape: string; // default \
  readonly subcomponent: string; // default &
}
export function readDelimiters(firstSegment: string): EncodingCharacters;
```

---

### `src/parser/tokenize.ts` (tokenizer — stage 5)

**Analog:** Convention Analog 1.

Given segments + encoding characters, produce the raw positional tree consumed by `Hl7Message`. Empty-vs-null distinction: `||` is absent field (empty), `""` inside a field is explicit null per HL7 spec.

Signature sketch:

```typescript
export interface RawField {
  readonly repetitions: readonly RawRepetition[];
  readonly isNull: boolean; // "" case
}
export interface RawRepetition {
  readonly components: readonly RawComponent[];
}
export interface RawComponent {
  readonly subcomponents: readonly string[];
}
export interface RawSegment {
  readonly name: string; // "MSH", "PID", etc.
  readonly fields: readonly RawField[];
}
export function tokenize(
  segments: readonly string[],
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
): readonly RawSegment[];
```

**Note:** D-07 of CONTEXT says internal shape is Claude's discretion "as long as it can feed D-05's Hl7Message shell and be extended in Phase 3 without a rewrite." The sketch above is one valid shape; the planner may choose a tagged-node tree instead.

**Strict-TS gotcha:** `noUncheckedIndexedAccess: true` (tsconfig line 10) means `fields[0]` returns `RawField | undefined`. Every index access needs an `if (f === undefined) continue;` guard or explicit length check before use.

---

### `src/parser/escapes.ts` (on-access unescape)

**Analog:** Convention Analog 1.

Implements the HL7 escape map: `\F\` → field-sep char, `\S\` → component-sep char, `\T\` → subcomponent-sep char, `\R\` → repetition-sep char, `\E\` → escape char itself, `\.br\` → newline, `\X..\` → hex, `\Z..\` → vendor (emit `UNKNOWN_ESCAPE_SEQUENCE` if it's not in a known vendor allow-list — for Phase 2 the allow-list is empty, so every `\Z..\` warns but still passes through).

```typescript
export function unescape(
  input: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
): string;
```

Also plumbs a re-escape function (used later by Phase 5's serializer; declared here so the escape/unescape pair lives in one module):

```typescript
export function reescape(input: string, enc: EncodingCharacters): string;
```

---

### `src/model/message.ts` (`Hl7Message` class shell)

**Analog:** Convention Analog 1.

**Decision-driven pattern (D-05, D-07, D-08):**

```typescript
/**
 * Parsed HL7 v2 message. Produced by `parseHL7`. In Phase 2 this class is a
 * read-only shell exposing the raw positional tree, delimiter metadata, and
 * accumulated warnings. Richer traversal (`get()`, `getAll()`, typed composites)
 * lands in Phase 3 without reshaping this constructor surface.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * console.log(msg.version, msg.encodingCharacters.field);
 * for (const w of msg.warnings) console.warn(w.code);
 * ```
 */
export class Hl7Message {
  public readonly segments: readonly RawSegment[];
  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;

  public constructor(init: {
    segments: readonly RawSegment[];
    encodingCharacters: EncodingCharacters;
    version: string;
    warnings: readonly Hl7ParseWarning[];
    profile?: { readonly name: string; readonly lineage: readonly string[] };
  }) { /* ... */ }
}
```

**Critical:** `exactOptionalPropertyTypes: true` means the `profile` parameter in `init` cannot be `undefined` explicitly — either omit the key or provide a real value. The `public readonly profile: ... | undefined` field declaration is fine (it's a union including `undefined`, not an optional property).

**Mutation posture (CLAUDE.md):** Immutable by default. No setters in Phase 2. Phase 3 will add `setField`, `addSegment`, `removeSegment` as explicit methods — do NOT pre-emptively expose mutable state here.

---

### `src/index.ts` (MODIFIED — add Phase 2 exports)

**Analog:** `src/index.ts` (self) — extend with new re-exports while preserving the existing `VERSION` and the file-level JSDoc shape.

**New exports to add:**

```typescript
export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
export { Hl7ParseError, ProfileDefinitionError, FATAL_CODES } from "./parser/errors.js";
export type { FatalCode } from "./parser/errors.js";
export { WARNING_CODES } from "./parser/warnings.js";
export type { WarningCode, Hl7ParseWarning } from "./parser/warnings.js";
export type { ParseOptions, Profile, Hl7Position } from "./parser/index.js";
```

**Do NOT:**

- Rewrite or remove the file-level JSDoc.
- Remove `VERSION` (load-bearing for `test/sanity.test.ts`).
- Add relative imports that use `.ts` extensions — use `.js` per NodeNext resolution.
- Add custom JSDoc tags outside `{ @internal, @remarks }`.

---

### Test files (10 new `test/*.test.ts`)

**Analog:** `test/sanity.test.ts` (exact role match).

One test file per source module. Minimum per file:

- At least one `describe` block scoped to the module under test.
- At least three `it` cases covering: (a) happy path, (b) a specific edge case from REQUIREMENTS.md, (c) a warning or error emission verified via the returned `msg.warnings` array or a thrown `Hl7ParseError`.

**Template** (copy from `test/sanity.test.ts` and adapt):

```typescript
import { describe, expect, it } from "vitest";

import { parseHL7, WARNING_CODES, Hl7ParseError } from "../src/index.js";

describe("parser/mllp: stripMllp", () => {
  it("emits MLLP_FRAMING_STRIPPED warning when VT/FS bytes present", () => {
    const raw = "\u000BMSH|^~\\&|...\r\u001C";
    const msg = parseHL7(raw);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED)).toBe(true);
  });
  // ... additional cases
});
```

**Unit-test-vs-integration-test split:**

- Most test files import from `../src/index.js` (the public barrel) to exercise the full pipeline — this matches `test/sanity.test.ts`'s import style and proves the exports-map surface.
- Tests of internal helpers (e.g., `readDelimiters` alone) may import from the module directly: `from "../src/parser/delimiters.js"`. Keep these minimal; prefer testing through the public API when feasible.

**Coverage target:** `src/parser/**` and `src/model/**` ≥ 90% lines/functions/statements, ≥ 85% branches (`vitest.config.ts` lines 40-53). Thresholds are declared but not enforced until Phase 7 — still aim to land green locally.

## Shared Patterns

### Import style (apply to every new `src/` file)

**Source:** `src/index.ts`, `eslint.config.js` line 49.

- Relative imports include `.js` extension: `import { foo } from "./bar.js";`
- Type-only imports use the inline-`type` form: `import { type X, doThing } from "./bar.js";` OR `import type { X } from "./bar.js";`
- Group and separate with one blank line: node-builtins → third-party → project-relative.

### JSDoc on every public export (apply to every new `src/` file)

**Source:** `eslint.config.js` lines 62-92, `src/index.ts` lines 10-20.

- `jsdoc/require-jsdoc` fires on any exported variable, function, class, type alias, interface, or enum declaration.
- `jsdoc/require-example` fires on exported variable, function, or class.
- `@internal` or `@private` exempts an export from `@example` (use sparingly — prefer to make a truly internal symbol unexported).
- Allowed custom tags: `@internal`, `@remarks`. No other `@foo` tokens.

### Error handling posture (apply to every parser-stage module)

**Source:** CLAUDE.md guardrails + `eslint.config.js` line 59 (`no-console: error`).

- Never `console.*`. Never swallow errors silently.
- Fatal = throw `Hl7ParseError` with all 4 fields populated (code, message, position, snippet). Only the 4 locked codes may be fatal.
- Non-fatal = call `emit(warningFactory(...))` and continue. Every warning goes through the `emitWarning` chokepoint in `parseHL7`.
- `try/catch` with `useUnknownInCatchVariables` — caught value is `unknown`; narrow before use: `if (err instanceof Hl7ParseError) ...`.

### Strict-TS accommodations (apply to every new `src/` file)

**Source:** `tsconfig.json` lines 10-16.

- `noUncheckedIndexedAccess`: every `arr[i]` returns `T | undefined`. Guard before use.
- `exactOptionalPropertyTypes`: `{ x?: T }` forbids explicit `x: undefined`. Either omit the key or pass `T`.
- `useUnknownInCatchVariables`: caught error is `unknown`. Narrow with `instanceof`.
- `noPropertyAccessFromIndexSignature`: `rec["key"]` for index-signature records, not `rec.key`.
- No `any`. Use `unknown` + narrowing (CLAUDE.md + `eslint.config.js` line 32).
- No object-literal `as` casts (`eslint.config.js` line 38-41). Use `satisfies` or a declared const.
- No non-null `!` assertions (`eslint.config.js` line 42).

### Zero runtime deps (apply to every new `src/` file)

**Source:** `package.json` `"dependencies": {}`.

- Node stdlib only. Allowed: `node:buffer` (for `Buffer` type), `TextDecoder` (global in Node 18+), `node:util` if needed for a specific helper.
- Date parsing in `dateFormats` must be hand-rolled (no `date-fns`, no `luxon`).

## No Analog Found

Every new file falls into "no direct analog" — the codebase is greenfield for the parser. The two Phase 1 files (`src/index.ts`, `test/sanity.test.ts`) are style/convention analogs only, not behavior analogs. The planner will build behavior from:

1. Convention patterns above (for imports, JSDoc, TS strictness).
2. Decisions in `02-CONTEXT.md` `<decisions>` (for API shape, pipeline order, error taxonomy).
3. Requirements in `.planning/REQUIREMENTS.md` §Core Parsing (PARSE-01 … PARSE-09) and §Real-World Tolerance (TOL-01 … TOL-10) (for acceptance criteria).

There is no prior HL7-parsing code to copy from in this repo.

## Metadata

**Analog search scope:** `/home/nschatz/projects/cosyte/hl7-parser/src/`, `/home/nschatz/projects/cosyte/hl7-parser/test/`, `/home/nschatz/projects/cosyte/hl7-parser/.planning/phases/01-project-foundation/`.

**Files scanned:**
- `src/index.ts` (22 lines)
- `test/sanity.test.ts` (16 lines)
- `eslint.config.js` (119 lines)
- `vitest.config.ts` (62 lines)
- `tsconfig.json` (36 lines)
- `tsup.config.ts` (34 lines)
- `package.json` (78 lines)
- `.planning/phases/01-project-foundation/01-04-SUMMARY.md` (393 lines — for Rule 1 patterns and frozen-tooling list)
- `.planning/phases/01-project-foundation/01-UAT.md` (70 lines — for UAT structure to mirror in Phase 2)
- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` (161 lines — scope + decisions)

**Pattern extraction date:** 2026-04-18.
