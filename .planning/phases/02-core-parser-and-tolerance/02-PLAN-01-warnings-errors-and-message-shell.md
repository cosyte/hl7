---
phase: 02-core-parser-and-tolerance
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/parser/warnings.ts
  - src/parser/errors.ts
  - src/parser/types.ts
  - src/model/message.ts
  - test/parser-warnings.test.ts
  - test/parser-errors.test.ts
  - test/model-message.test.ts
autonomous: true
requirements: [TOL-03, TOL-04, TOL-05]

must_haves:
  truths:
    - "A developer importing WARNING_CODES from the package sees all 13 Tier-2 codes as a frozen `as const` record."
    - "A developer importing Hl7ParseError can construct it with code, message, position, snippet and the instance is an Error subclass with a `code` discriminant."
    - "A developer importing ProfileDefinitionError receives an Error subclass reserved for Phase 6 profile validation."
    - "A developer constructing an Hl7Message receives an immutable object exposing segments, encodingCharacters, version, warnings (frozen array), and profile (undefined by default)."
    - "A developer referencing the ParseOptions type sees optional strict, onWarning, dateFormats, stripMllpFraming, trimFields, and profile fields with correct types."
  artifacts:
    - path: "src/parser/warnings.ts"
      provides: "WARNING_CODES const record, WarningCode union, Hl7ParseWarning interface, one factory per warning code"
      exports: ["WARNING_CODES", "WarningCode", "Hl7ParseWarning", "mllpFramingStripped", "fieldWhitespaceTrimmed", "unknownEscapeSequence", "timestampFallbackFormat", "segmentCase", "extraFields", "unknownSegment", "duplicateRequiredSegment", "encodingMismatch", "missingRequiredField", "outOfOrderSegment", "versionMismatch", "unknownCharset"]
    - path: "src/parser/errors.ts"
      provides: "FATAL_CODES record, FatalCode union, Hl7ParseError class, ProfileDefinitionError class"
      exports: ["FATAL_CODES", "FatalCode", "Hl7ParseError", "ProfileDefinitionError"]
    - path: "src/parser/types.ts"
      provides: "Shared types consumed across parser stages"
      exports: ["Hl7Position", "ParseOptions", "OnWarningCallback", "Profile"]
    - path: "src/model/message.ts"
      provides: "Hl7Message class shell with readonly fields"
      exports: ["Hl7Message"]
  key_links:
    - from: "src/parser/errors.ts"
      to: "src/parser/types.ts"
      via: "imports Hl7Position for error.position field"
      pattern: "import type .* Hl7Position .* from \"./types.js\""
    - from: "src/parser/warnings.ts"
      to: "src/parser/types.ts"
      via: "imports Hl7Position for warning.position field"
      pattern: "import type .* Hl7Position .* from \"./types.js\""
    - from: "src/model/message.ts"
      to: "src/parser/warnings.ts"
      via: "imports Hl7ParseWarning type for readonly warnings array"
      pattern: "import type .* Hl7ParseWarning"
---

<objective>
Ship the foundational types, warning registry, error taxonomy, and `Hl7Message` shell that every other Phase 2 plan imports. Nothing in Phase 2 runs until these four files exist.

Purpose: Pin the warning + error contract so Plans 02–06 can be built in parallel against a stable surface. Avoids "code added later" thrash. Establishes the typed chokepoint (`Hl7ParseWarning`, `Hl7ParseError`) that Plan 06's `emitWarning` will funnel through.

Output:
- `src/parser/warnings.ts` — `WARNING_CODES` record (13 Tier-2 codes), `WarningCode` union, `Hl7ParseWarning` interface, one factory per code.
- `src/parser/errors.ts` — `FATAL_CODES` record (4 Tier-3 codes), `FatalCode` union, `Hl7ParseError` class, `ProfileDefinitionError` class.
- `src/parser/types.ts` — `Hl7Position` interface, `ParseOptions` interface, `OnWarningCallback` type, `Profile` type (structural placeholder for Phase 6).
- `src/model/message.ts` — `Hl7Message` class shell with readonly public fields.
- Three test files asserting the above.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md
@.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md
@.planning/phases/01-project-foundation/01-04-SUMMARY.md
@src/index.ts
@test/sanity.test.ts
@eslint.config.js
@tsconfig.json

<interfaces>
<!-- Extracted from CONTEXT.md D-09/D-10/D-12/D-14 and PATTERNS.md sections on warnings.ts, errors.ts, message.ts. -->
<!-- These are the contracts this plan MUST produce. Downstream plans consume them verbatim. -->

Hl7Position (shared — lives in types.ts):
```typescript
export interface Hl7Position {
  readonly segmentIndex: number;
  readonly fieldIndex?: number;
  readonly repetitionIndex?: number;
  readonly componentIndex?: number;
  readonly subcomponentIndex?: number;
}
```
Note: with `exactOptionalPropertyTypes: true`, optional props cannot be explicitly set to `undefined` — either omit the key entirely or provide the number.

ParseOptions (shared — lives in types.ts):
```typescript
export interface ParseOptions {
  readonly strict?: boolean;
  readonly onWarning?: OnWarningCallback;
  readonly dateFormats?: readonly string[];
  readonly stripMllpFraming?: boolean; // default true
  readonly trimFields?: boolean;       // default true
  readonly profile?: Profile | null;   // null = opt out of default profile (PROF-08)
}
export type OnWarningCallback = (warning: Hl7ParseWarning) => void;
```

Profile (structural placeholder for Phase 6 — lives in types.ts):
```typescript
export interface Profile {
  readonly name: string;
  readonly description?: string;
  readonly lineage?: readonly string[];
  readonly dateFormats?: readonly string[];
  readonly customSegments?: Readonly<Record<string, unknown>>;
  readonly onWarning?: OnWarningCallback;
}
```

Hl7ParseWarning (data shape — lives in warnings.ts):
```typescript
export interface Hl7ParseWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: Hl7Position;
}
```

WARNING_CODES (13 codes — lives in warnings.ts):
```typescript
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
export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];
```

FATAL_CODES (4 codes — lives in errors.ts):
```typescript
export const FATAL_CODES = {
  NO_MSH_SEGMENT: "NO_MSH_SEGMENT",
  MSH_TOO_SHORT: "MSH_TOO_SHORT",
  INVALID_ENCODING_CHARACTERS: "INVALID_ENCODING_CHARACTERS",
  EMPTY_INPUT: "EMPTY_INPUT",
} as const;
export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];
```

Hl7ParseError (class — lives in errors.ts, per D-12/D-14):
```typescript
export class Hl7ParseError extends Error {
  public readonly code: FatalCode;
  public readonly position: Hl7Position;
  public readonly snippet: string;
  public constructor(code: FatalCode, message: string, position: Hl7Position, snippet: string) {
    super(message);
    this.name = "Hl7ParseError";
    this.code = code;
    this.position = position;
    this.snippet = snippet;
  }
}
```

Hl7Message (class shell — lives in model/message.ts, per D-05/D-08):
```typescript
export class Hl7Message {
  public readonly segments: readonly RawSegment[];           // RawSegment type forward-declared; see below
  public readonly encodingCharacters: EncodingCharacters;    // EncodingCharacters forward-declared
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;
  public constructor(init: { ... }) { ... }
}
```
Note: Plan 01 creates the Hl7Message class. `RawSegment` and `EncodingCharacters` types are produced in Plan 03 (tokenize.ts, delimiters.ts). To break the cycle, Plan 01 defines minimal placeholder types in `src/model/message.ts` itself OR imports from a shared types file. Chosen approach: define minimal structural types for `RawSegment` and `EncodingCharacters` inline in `src/model/message.ts` with a comment noting Plan 03 provides richer shapes. Plan 03 will expand these types (TypeScript structural typing makes this non-breaking if field names align).

To AVOID a breaking-cycle problem: Plan 01 defines `RawSegment` and `EncodingCharacters` as exported interfaces INSIDE `src/parser/types.ts` with exact fields per PATTERNS.md (the sketch under `tokenize.ts` and `delimiters.ts`). Plan 03 then imports those SAME interfaces from types.ts — no redefinition, no cycle. Action text below spells out the exact field set.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/parser/types.ts with shared interfaces</name>
  <files>src/parser/types.ts, test/parser-types.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-04 position shape, D-06 ParseOptions shape, D-07 profile placeholder)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (Convention Analog 1 — JSDoc shape, Shared Patterns section on strict-TS accommodations)
    - /home/nschatz/projects/cosyte/hl7-parser/src/index.ts (Convention Analog — file-level JSDoc must NOT start with `@token`, export-level JSDoc must include fenced `@example`)
    - /home/nschatz/projects/cosyte/hl7-parser/test/sanity.test.ts (test shape — import with .js extension, explicit vitest imports, blank-line separation)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc + @example on every public export)
    - /home/nschatz/projects/cosyte/hl7-parser/eslint.config.js (verify allowed tags: @internal, @remarks only)
    - /home/nschatz/projects/cosyte/hl7-parser/tsconfig.json (exactOptionalPropertyTypes, noUncheckedIndexedAccess, useUnknownInCatchVariables are ON)
  </read_first>
  <behavior>
    - Test 1: `Hl7Position` interface is importable and accepts `{ segmentIndex: 0 }` (required field only, all others optional).
    - Test 2: `ParseOptions` interface accepts `{}` (all fields optional) and accepts a fully-populated object including `{ profile: null }` (PROF-08 opt-out discriminant).
    - Test 3: `OnWarningCallback` is `(warning: Hl7ParseWarning) => void` — callable with a minimal warning shape.
    - Test 4: `Profile` interface accepts `{ name: "x" }` (minimum) and `{ name: "x", description: "...", lineage: ["a"], dateFormats: ["ISO"], customSegments: {}, onWarning: () => {} }` (full).
    - Test 5: `RawSegment`, `RawField`, `RawRepetition`, `RawComponent` and `EncodingCharacters` interfaces are exported and their fields match the shape specified in action text below (structural check: construct a literal and assign to the type).
  </behavior>
  <action>
Create `src/parser/types.ts` exporting the following interfaces and types. File-level JSDoc must be a plain prose sentence (NOT starting with `@{token}`) — e.g., "Shared type definitions consumed across the `@cosyte/hl7-parser` parser pipeline." Every exported interface/type MUST have its own JSDoc block with `@example` showing realistic usage (imports from `"@cosyte/hl7-parser"`). Use only the allowed tags `@internal` and `@remarks`; no `@param`, `@returns`, etc.

Exports (copy these shapes exactly):

```typescript
export interface Hl7Position {
  readonly segmentIndex: number;
  readonly fieldIndex?: number;
  readonly repetitionIndex?: number;
  readonly componentIndex?: number;
  readonly subcomponentIndex?: number;
}

export type OnWarningCallback = (warning: Hl7ParseWarning) => void;

export interface ParseOptions {
  readonly strict?: boolean;
  readonly onWarning?: OnWarningCallback;
  readonly dateFormats?: readonly string[];
  readonly stripMllpFraming?: boolean;
  readonly trimFields?: boolean;
  readonly profile?: Profile | null;
}

export interface Profile {
  readonly name: string;
  readonly description?: string;
  readonly lineage?: readonly string[];
  readonly dateFormats?: readonly string[];
  readonly customSegments?: Readonly<Record<string, unknown>>;
  readonly onWarning?: OnWarningCallback;
}

export interface EncodingCharacters {
  readonly field: string;         // default "|"
  readonly component: string;     // default "^"
  readonly repetition: string;    // default "~"
  readonly escape: string;        // default "\\"
  readonly subcomponent: string;  // default "&"
}

export interface RawComponent {
  readonly subcomponents: readonly string[];
}

export interface RawRepetition {
  readonly components: readonly RawComponent[];
}

export interface RawField {
  readonly repetitions: readonly RawRepetition[];
  readonly isNull: boolean; // true when the field was the literal two-char `""` (HL7 explicit null)
}

export interface RawSegment {
  readonly name: string;                 // e.g. "MSH", "PID", "ZPI"
  /**
   * Positional fields array using HL7 1-indexed convention for ALL segments.
   *
   * - `fields[0]` is the segment name / separator placeholder slot (never a data field).
   * - `fields[N]` for N ≥ 1 is the HL7 N-th field.
   *
   * Examples:
   * - MSH: fields[0] = field-separator char, fields[1] = MSH-2 (encoding chars),
   *   fields[2] = MSH-3, …, fields[11] = MSH-12.
   * - PID: fields[0] = "PID" name placeholder, fields[1] = PID-1, fields[2] = PID-2, ….
   */
  readonly fields: readonly RawField[];
}
```

IMPORTANT: the JSDoc block above MUST be emitted verbatim (or with trivially equivalent wording) into `src/parser/types.ts` on the `RawSegment.fields` member. This unified 1-indexed convention is consumed by Plan 03 (`tokenize.ts` pads non-MSH fields[0] with a name placeholder) and Plan 06 (`extractVersion` reads `msh.fields[11]` for MSH-12).

`Hl7ParseWarning` is declared in `warnings.ts` (Task 2) — import the type here ONLY if needed to type `OnWarningCallback`. Preferred: declare `OnWarningCallback` AFTER referencing `Hl7ParseWarning`; use a forward `import type { Hl7ParseWarning } from "./warnings.js"` at the top.

CRITICAL — with `exactOptionalPropertyTypes: true`, a consumer cannot pass `{ strict: undefined }`; they must either omit `strict` or pass `true`/`false`. Document this in the `ParseOptions` JSDoc `@remarks` block.

CRITICAL — with `noUncheckedIndexedAccess: true`, do NOT rely on inference that would erase the `| undefined` from array accesses. Prefer explicit typing on any helper values you may introduce.

Then create `test/parser-types.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import type {
  Hl7Position,
  ParseOptions,
  OnWarningCallback,
  Profile,
  EncodingCharacters,
  RawSegment,
  RawField,
  RawRepetition,
  RawComponent,
} from "../src/parser/types.js";

describe("parser/types: shared type surface", () => {
  it("Hl7Position accepts the minimum required shape", () => {
    const p: Hl7Position = { segmentIndex: 0 };
    expect(p.segmentIndex).toBe(0);
  });

  it("ParseOptions accepts the empty shape and a fully populated shape", () => {
    const empty: ParseOptions = {};
    const full: ParseOptions = {
      strict: true,
      onWarning: () => {},
      dateFormats: ["YYYY-MM-DD"],
      stripMllpFraming: false,
      trimFields: false,
      profile: null,
    };
    expect(empty).toBeDefined();
    expect(full.profile).toBeNull();
  });

  it("OnWarningCallback is structurally a function taking Hl7ParseWarning", () => {
    const cb: OnWarningCallback = () => {};
    expect(typeof cb).toBe("function");
  });

  it("Profile accepts name-only and fully populated shapes", () => {
    const minimal: Profile = { name: "test" };
    const full: Profile = {
      name: "test",
      description: "d",
      lineage: ["a"],
      dateFormats: [],
      customSegments: {},
      onWarning: () => {},
    };
    expect(minimal.name).toBe("test");
    expect(full.lineage).toEqual(["a"]);
  });

  it("EncodingCharacters and Raw* tree compose structurally", () => {
    const enc: EncodingCharacters = { field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" };
    const field: RawField = { repetitions: [], isNull: false };
    const rep: RawRepetition = { components: [] };
    const comp: RawComponent = { subcomponents: [] };
    const seg: RawSegment = { name: "MSH", fields: [field] };
    expect(enc.field).toBe("|");
    expect(rep.components.length).toBe(0);
    expect(comp.subcomponents.length).toBe(0);
    expect(seg.fields[0]).toBe(field);
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/types.ts test/parser-types.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-types</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/types.ts` exists and contains `export interface Hl7Position`, `export interface ParseOptions`, `export type OnWarningCallback`, `export interface Profile`, `export interface EncodingCharacters`, `export interface RawSegment`, `export interface RawField`, `export interface RawRepetition`, `export interface RawComponent` (verify via `grep -E "^export (interface|type)" src/parser/types.ts` returns 9 lines).
    - File-level JSDoc does NOT start with `@` (verify `head -n 3 src/parser/types.ts` shows `/**` then text NOT beginning with `@`).
    - Every exported interface/type has a JSDoc block containing ```` ```ts ```` in an `@example` section (`grep -c "@example" src/parser/types.ts` &gt;= 9).
    - Only allowed JSDoc tags appear (`@example`, `@internal`, `@remarks`). Verify: `grep -oE "@[a-z]+" src/parser/types.ts | sort -u` produces a subset of `@example @internal @remarks @link @cosyte` (the last two are permitted inside backticks/examples).
    - `pnpm typecheck` exits 0.
    - `pnpm lint src/parser/types.ts --max-warnings=0` exits 0.
    - `pnpm test -- --run parser-types` exits 0 with 5 passing cases.
  </acceptance_criteria>
  <done>`src/parser/types.ts` exports 9 named types. `test/parser-types.test.ts` has 5 passing cases. Typecheck + lint + test all green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create src/parser/warnings.ts (registry + factories) and src/parser/errors.ts (classes + FATAL_CODES)</name>
  <files>src/parser/warnings.ts, src/parser/errors.ts, test/parser-warnings.test.ts, test/parser-errors.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-09 registry shape, D-10 one factory per code, D-12 single error class, D-13 warning/error independence, D-14 required error fields, D-15 ProfileDefinitionError declared in Phase 2)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (sections: "src/parser/warnings.ts", "src/parser/errors.ts")
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (just-created in Task 1; import Hl7Position, OnWarningCallback)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any; no unjustified as; JSDoc @example required)
    - /home/nschatz/projects/cosyte/hl7-parser/eslint.config.js (confirm consistent-type-imports enforced — use `import type` for Hl7Position)
  </read_first>
  <behavior>
    - Test W1: `WARNING_CODES` is an `as const` record with exactly 13 keys matching the 13 locked codes (strict equality per key).
    - Test W2: `WarningCode` union narrows — TypeScript accepts `w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED` and rejects `w.code === "MADE_UP"` at compile time (verified via a `// @ts-expect-error` case in test).
    - Test W3: Each warning factory returns an object with `code`, `message`, `position` — all populated. Example: `mllpFramingStripped({segmentIndex: 0})` returns `{ code: "MLLP_FRAMING_STRIPPED", message: /non-empty/, position: { segmentIndex: 0 } }`.
    - Test W4: Factories produce distinct, deterministic `code` values — the code field on the returned object matches the WARNING_CODES entry bearing the same name.
    - Test E1: `FATAL_CODES` is an `as const` record with exactly 4 keys: NO_MSH_SEGMENT, MSH_TOO_SHORT, INVALID_ENCODING_CHARACTERS, EMPTY_INPUT.
    - Test E2: `new Hl7ParseError("EMPTY_INPUT", "empty", {segmentIndex:0}, "")` produces an Error subclass with `.name === "Hl7ParseError"`, `.code === "EMPTY_INPUT"`, `.message === "empty"`, `.position.segmentIndex === 0`, `.snippet === ""`, and is `instanceof Error` and `instanceof Hl7ParseError`.
    - Test E3: `new ProfileDefinitionError("bad")` is an Error subclass with `.name === "ProfileDefinitionError"`, `.message === "bad"`, `instanceof Error`.
  </behavior>
  <action>
**Step 1: Create `src/parser/warnings.ts`.**

File-level JSDoc: plain prose sentence NOT starting with `@` (e.g., "Tier-2 warning registry and factories for the `@cosyte/hl7-parser` parser pipeline."). Imports at top:

```typescript
import type { Hl7Position } from "./types.js";
```

Exports (exact shape):

```typescript
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

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

export interface Hl7ParseWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: Hl7Position;
}
```

Then one factory per code. Factory naming convention: camelCase of the code (e.g., `MLLP_FRAMING_STRIPPED` → `mllpFramingStripped`). Each factory:

- Takes `position: Hl7Position` as its first argument (some factories may take additional payload — see below).
- Returns an `Hl7ParseWarning`.
- Carries its own JSDoc with `@example` (required by eslint).

Specific factory signatures (some carry contextual payload so the message is informative):

```typescript
export function mllpFramingStripped(position: Hl7Position): Hl7ParseWarning;
export function fieldWhitespaceTrimmed(position: Hl7Position, original: string, trimmed: string): Hl7ParseWarning;
export function unknownEscapeSequence(position: Hl7Position, sequence: string): Hl7ParseWarning;
export function timestampFallbackFormat(position: Hl7Position, matchedFormat: string): Hl7ParseWarning;
export function segmentCase(position: Hl7Position, observed: string): Hl7ParseWarning;
export function extraFields(position: Hl7Position, segmentName: string, extraCount: number): Hl7ParseWarning;
export function unknownSegment(position: Hl7Position, segmentName: string): Hl7ParseWarning;
export function duplicateRequiredSegment(position: Hl7Position, segmentName: string): Hl7ParseWarning;
export function encodingMismatch(position: Hl7Position, detail: string): Hl7ParseWarning;
export function missingRequiredField(position: Hl7Position, segmentName: string, fieldIndex: number): Hl7ParseWarning;
export function outOfOrderSegment(position: Hl7Position, segmentName: string): Hl7ParseWarning;
export function versionMismatch(position: Hl7Position, declared: string, expected: string): Hl7ParseWarning;
export function unknownCharset(position: Hl7Position, requested: string): Hl7ParseWarning;
```

Each factory body is a straightforward object literal. Example body for `mllpFramingStripped`:

```typescript
export function mllpFramingStripped(position: Hl7Position): Hl7ParseWarning {
  return {
    code: WARNING_CODES.MLLP_FRAMING_STRIPPED,
    message: "MLLP framing bytes (VT/FS/CR) were stripped from the input.",
    position,
  };
}
```

Freeze-pattern note: the returned object does NOT need `Object.freeze()` — `readonly` fields on the TS interface are enough for consumers; adding runtime freeze has no zero-dep cost but is extra work. Skip it.

`fieldWhitespaceTrimmed` message should reference the trimmed delta: `` `Field had leading/trailing whitespace trimmed: "${original}" -> "${trimmed}".` ``

`unknownEscapeSequence` message: `` `Unknown HL7 escape sequence \\${sequence}\\ preserved verbatim.` `` — pass the inner token (e.g. `"Z99"`) as `sequence`.

**Step 2: Create `src/parser/errors.ts`.**

File-level JSDoc: plain prose sentence NOT starting with `@`. Imports:

```typescript
import type { Hl7Position } from "./types.js";
```

Exports (exact shape):

```typescript
export const FATAL_CODES = {
  NO_MSH_SEGMENT: "NO_MSH_SEGMENT",
  MSH_TOO_SHORT: "MSH_TOO_SHORT",
  INVALID_ENCODING_CHARACTERS: "INVALID_ENCODING_CHARACTERS",
  EMPTY_INPUT: "EMPTY_INPUT",
} as const;

export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];

export class Hl7ParseError extends Error {
  public readonly code: FatalCode;
  public readonly position: Hl7Position;
  public readonly snippet: string;

  public constructor(code: FatalCode, message: string, position: Hl7Position, snippet: string) {
    super(message);
    this.name = "Hl7ParseError";
    this.code = code;
    this.position = position;
    this.snippet = snippet;
  }
}

export class ProfileDefinitionError extends Error {
  public readonly profileName: string | undefined;

  public constructor(message: string, profileName?: string) {
    super(message);
    this.name = "ProfileDefinitionError";
    // exactOptionalPropertyTypes: assign the argument directly — `string | undefined` is the declared type
    this.profileName = profileName;
  }
}
```

Each exported symbol needs JSDoc with `@example`. Example for `Hl7ParseError`:

```typescript
/**
 * Thrown by `parseHL7` when the input violates one of the 4 unrecoverable
 * Tier-3 structural rules (missing MSH, truncated MSH, invalid encoding
 * characters, or empty input). Narrow on the `code` discriminant.
 *
 * @example
 * ```ts
 * import { parseHL7, Hl7ParseError } from "@cosyte/hl7-parser";
 * try {
 *   parseHL7("");
 * } catch (err) {
 *   if (err instanceof Hl7ParseError && err.code === "EMPTY_INPUT") {
 *     console.error(err.message, err.position, err.snippet);
 *   }
 * }
 * ```
 */
export class Hl7ParseError extends Error { ... }
```

**Step 3: Tests.**

`test/parser-warnings.test.ts` (minimum 6 cases — registry shape, union narrowing via @ts-expect-error, a factory happy path, a factory with payload, all 13 factories produce the correct code, position is preserved):

```typescript
import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  mllpFramingStripped,
  fieldWhitespaceTrimmed,
  unknownEscapeSequence,
  timestampFallbackFormat,
  segmentCase,
  extraFields,
  unknownSegment,
  duplicateRequiredSegment,
  encodingMismatch,
  missingRequiredField,
  outOfOrderSegment,
  versionMismatch,
  unknownCharset,
  type WarningCode,
} from "../src/parser/warnings.js";

describe("parser/warnings: registry + factories", () => {
  it("WARNING_CODES has exactly 13 entries with matching key/value strings", () => {
    const entries = Object.entries(WARNING_CODES);
    expect(entries).toHaveLength(13);
    for (const [k, v] of entries) expect(k).toBe(v);
  });

  it("WarningCode narrowing rejects made-up strings at compile time", () => {
    // @ts-expect-error "MADE_UP" is not a WarningCode
    const bad: WarningCode = "MADE_UP";
    expect(bad).toBeDefined();
  });

  it("mllpFramingStripped produces a deterministic warning with position", () => {
    const w = mllpFramingStripped({ segmentIndex: 0 });
    expect(w.code).toBe(WARNING_CODES.MLLP_FRAMING_STRIPPED);
    expect(w.message.length).toBeGreaterThan(0);
    expect(w.position.segmentIndex).toBe(0);
  });

  it("fieldWhitespaceTrimmed includes original and trimmed values in the message", () => {
    const w = fieldWhitespaceTrimmed({ segmentIndex: 1, fieldIndex: 5 }, "  hi  ", "hi");
    expect(w.code).toBe(WARNING_CODES.FIELD_WHITESPACE_TRIMMED);
    expect(w.message).toMatch(/hi/);
  });

  it("all 13 factories produce warnings whose code matches the factory identity", () => {
    const cases = [
      [mllpFramingStripped({ segmentIndex: 0 }), "MLLP_FRAMING_STRIPPED"],
      [fieldWhitespaceTrimmed({ segmentIndex: 0 }, "a ", "a"), "FIELD_WHITESPACE_TRIMMED"],
      [unknownEscapeSequence({ segmentIndex: 0 }, "Z99"), "UNKNOWN_ESCAPE_SEQUENCE"],
      [timestampFallbackFormat({ segmentIndex: 0 }, "ISO"), "TIMESTAMP_FALLBACK_FORMAT"],
      [segmentCase({ segmentIndex: 0 }, "pid"), "SEGMENT_CASE"],
      [extraFields({ segmentIndex: 0 }, "PID", 3), "EXTRA_FIELDS"],
      [unknownSegment({ segmentIndex: 0 }, "ZZZ"), "UNKNOWN_SEGMENT"],
      [duplicateRequiredSegment({ segmentIndex: 0 }, "MSH"), "DUPLICATE_REQUIRED_SEGMENT"],
      [encodingMismatch({ segmentIndex: 0 }, "detail"), "ENCODING_MISMATCH"],
      [missingRequiredField({ segmentIndex: 0 }, "MSH", 3), "MISSING_REQUIRED_FIELD"],
      [outOfOrderSegment({ segmentIndex: 0 }, "EVN"), "OUT_OF_ORDER_SEGMENT"],
      [versionMismatch({ segmentIndex: 0 }, "2.9", "2.8"), "VERSION_MISMATCH"],
      [unknownCharset({ segmentIndex: 0 }, "ISO IR 999"), "UNKNOWN_CHARSET"],
    ] as const;
    for (const [w, expected] of cases) expect(w.code).toBe(expected);
    expect(cases).toHaveLength(13);
  });

  it("warning messages are non-empty", () => {
    const w = unknownSegment({ segmentIndex: 2 }, "ZZZ");
    expect(w.message).toMatch(/ZZZ/);
  });
});
```

`test/parser-errors.test.ts` (minimum 4 cases):

```typescript
import { describe, expect, it } from "vitest";

import { FATAL_CODES, Hl7ParseError, ProfileDefinitionError, type FatalCode } from "../src/parser/errors.js";

describe("parser/errors: fatal codes + error classes", () => {
  it("FATAL_CODES has exactly 4 locked entries with matching key/value strings", () => {
    const entries = Object.entries(FATAL_CODES);
    expect(entries).toHaveLength(4);
    expect(Object.keys(FATAL_CODES).sort()).toEqual([
      "EMPTY_INPUT",
      "INVALID_ENCODING_CHARACTERS",
      "MSH_TOO_SHORT",
      "NO_MSH_SEGMENT",
    ]);
    for (const [k, v] of entries) expect(k).toBe(v);
  });

  it("Hl7ParseError exposes all 4 required fields and is instanceof Error", () => {
    const err = new Hl7ParseError("EMPTY_INPUT", "input empty", { segmentIndex: 0 }, "");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Hl7ParseError);
    expect(err.name).toBe("Hl7ParseError");
    expect(err.code).toBe("EMPTY_INPUT");
    expect(err.message).toBe("input empty");
    expect(err.position.segmentIndex).toBe(0);
    expect(err.snippet).toBe("");
  });

  it("FatalCode narrowing rejects made-up strings at compile time", () => {
    // @ts-expect-error "FOO" is not a FatalCode
    const bad: FatalCode = "FOO";
    expect(bad).toBeDefined();
  });

  it("ProfileDefinitionError is an Error subclass with a stable name", () => {
    const err = new ProfileDefinitionError("bad profile", "myProfile");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProfileDefinitionError);
    expect(err.name).toBe("ProfileDefinitionError");
    expect(err.message).toBe("bad profile");
    expect(err.profileName).toBe("myProfile");
  });
});
```

CRITICAL: do not add re-exports to `src/index.ts` in this plan. Plan 06 owns the barrel update to keep file ownership disjoint across waves.
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/warnings.ts src/parser/errors.ts test/parser-warnings.test.ts test/parser-errors.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-warnings parser-errors</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/warnings.ts` exists and `grep -c "^export " src/parser/warnings.ts` returns >= 16 (WARNING_CODES, WarningCode, Hl7ParseWarning, 13 factories).
    - `grep -E "as const" src/parser/warnings.ts` returns a match line containing `WARNING_CODES`.
    - `grep -E "^  [A-Z_]+:" src/parser/warnings.ts | wc -l` returns exactly 13 (the 13 code entries).
    - File `src/parser/errors.ts` exists and exports `FATAL_CODES`, `FatalCode`, `Hl7ParseError`, `ProfileDefinitionError` (verify via `grep -E "^export (const|type|class)" src/parser/errors.ts` returns 4 lines).
    - `grep -E "^  (NO_MSH_SEGMENT|MSH_TOO_SHORT|INVALID_ENCODING_CHARACTERS|EMPTY_INPUT):" src/parser/errors.ts | wc -l` returns exactly 4.
    - Both files: `grep -c "@example" {file}` is >= count of exported symbols (every export has an example).
    - Both files' first JSDoc block does NOT begin with `@` — verify: `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/parser/warnings.ts src/parser/errors.ts` prints nothing (no FAIL).
    - `pnpm typecheck` exits 0.
    - `pnpm lint src/parser/warnings.ts src/parser/errors.ts test/parser-warnings.test.ts test/parser-errors.test.ts --max-warnings=0` exits 0.
    - `pnpm test -- --run parser-warnings parser-errors` exits 0 with >= 10 passing cases total (6 + 4).
    - `src/index.ts` is unchanged from Phase 1 state (verify: `git diff --name-only src/index.ts` shows no modification when running Plan 01 only).
  </acceptance_criteria>
  <done>Both source files implement the locked registries and classes. All 10+ test cases pass. Typecheck + lint + test green. `src/index.ts` untouched.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create src/model/message.ts (Hl7Message class shell)</name>
  <files>src/model/message.ts, test/model-message.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-05 Hl7Message shell shape, D-07 warnings field, D-08 encodingCharacters + version only)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (section: "src/model/message.ts")
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawSegment, EncodingCharacters — produced by Task 1)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (Hl7ParseWarning — produced by Task 2)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (immutable by default, no setters in Phase 2)
    - /home/nschatz/projects/cosyte/hl7-parser/tsconfig.json (exactOptionalPropertyTypes interaction with optional `profile` constructor arg)
  </read_first>
  <behavior>
    - Test 1: `new Hl7Message({ segments: [], encodingCharacters: {...}, version: "2.5", warnings: [] })` produces an instance with all 5 public fields populated and `profile === undefined`.
    - Test 2: Fields are readonly — TypeScript rejects `msg.version = "x"` at compile time (verify via `// @ts-expect-error`).
    - Test 3: `msg.warnings` is frozen — `Object.isFrozen(msg.warnings) === true` after construction (ensures Phase 2 cannot accidentally mutate after handoff).
    - Test 4: Constructor accepts a `profile` init value and exposes it via `msg.profile`.
    - Test 5: Construction without `profile` in init leaves `msg.profile === undefined` (without the key being present on `init`).
  </behavior>
  <action>
Create `src/model/message.ts`.

File-level JSDoc: plain prose sentence NOT starting with `@`.

Imports:
```typescript
import type { EncodingCharacters, RawSegment } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";
```

Exports:

```typescript
export interface Hl7MessageInit {
  readonly segments: readonly RawSegment[];
  readonly encodingCharacters: EncodingCharacters;
  readonly version: string;
  readonly warnings: readonly Hl7ParseWarning[];
  readonly profile?: { readonly name: string; readonly lineage: readonly string[] };
}

export class Hl7Message {
  public readonly segments: readonly RawSegment[];
  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;

  public constructor(init: Hl7MessageInit) {
    this.segments = init.segments;
    this.encodingCharacters = init.encodingCharacters;
    this.version = init.version;
    // Freeze the warnings array at the model boundary so Phase 3+ cannot mutate after handoff.
    // Object.freeze returns the same reference typed as Readonly<T>; a plain array slice avoids
    // sharing a mutable reference if the caller held one internally during parsing.
    this.warnings = Object.freeze(init.warnings.slice());
    // exactOptionalPropertyTypes: the field is declared `... | undefined` so assigning
    // `init.profile` (which is `{...} | undefined`) is valid. If the `profile` key is
    // omitted from init, `init.profile` evaluates to undefined and flows through.
    this.profile = init.profile;
  }
}
```

JSDoc for the class: include an `@example` showing construction and reading a field:

```typescript
/**
 * Parsed HL7 v2 message. Produced by `parseHL7`. In Phase 2 this class is a
 * read-only shell exposing the raw positional tree, delimiter metadata, and
 * accumulated warnings. Richer traversal lands in Phase 3 without reshaping
 * this constructor surface.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * console.log(msg.version, msg.encodingCharacters.field);
 * for (const w of msg.warnings) console.warn(w.code);
 * ```
 */
export class Hl7Message { ... }
```

JSDoc for `Hl7MessageInit`: marked `@internal` because it is a constructor-shape helper that advanced consumers may touch but is not part of the primary public API. `@internal` exempts it from the `require-example` rule.

```typescript
/**
 * Constructor init shape for `Hl7Message`. Exposed for advanced use (e.g.,
 * constructing synthetic messages in tests) but most consumers should rely on
 * `parseHL7` to produce `Hl7Message` instances.
 *
 * @internal
 */
export interface Hl7MessageInit { ... }
```

Test file `test/model-message.test.ts` (5 cases, see behavior list):

```typescript
import { describe, expect, it } from "vitest";

import { Hl7Message } from "../src/model/message.js";
import type { EncodingCharacters, RawSegment } from "../src/parser/types.js";
import type { Hl7ParseWarning } from "../src/parser/warnings.js";

const enc: EncodingCharacters = { field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" };
const emptySegments: readonly RawSegment[] = [];
const noWarnings: readonly Hl7ParseWarning[] = [];

describe("model/message: Hl7Message shell", () => {
  it("constructs with all 5 public fields populated and profile undefined", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
    });
    expect(msg.segments).toBe(emptySegments);
    expect(msg.encodingCharacters.field).toBe("|");
    expect(msg.version).toBe("2.5");
    expect(msg.warnings).toHaveLength(0);
    expect(msg.profile).toBeUndefined();
  });

  it("rejects mutation of fields at compile time", () => {
    const msg = new Hl7Message({ segments: emptySegments, encodingCharacters: enc, version: "2.5", warnings: noWarnings });
    // @ts-expect-error version is readonly
    msg.version = "2.8";
    expect(msg.version).toBeDefined();
  });

  it("freezes the warnings array after construction", () => {
    const msg = new Hl7Message({ segments: emptySegments, encodingCharacters: enc, version: "2.5", warnings: noWarnings });
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });

  it("exposes profile when provided in init", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
      profile: { name: "epic", lineage: ["base", "epic"] },
    });
    expect(msg.profile?.name).toBe("epic");
    expect(msg.profile?.lineage).toEqual(["base", "epic"]);
  });

  it("leaves profile as undefined when omitted from init", () => {
    const msg = new Hl7Message({ segments: emptySegments, encodingCharacters: enc, version: "2.5", warnings: noWarnings });
    expect(msg.profile).toBeUndefined();
  });
});
```

CRITICAL — `exactOptionalPropertyTypes: true` makes this illegal: `new Hl7Message({ ..., profile: undefined })`. Tests must either omit the key or provide a real profile object. The action above follows this rule. Downstream plans (Plan 06) will rely on the same pattern.

CRITICAL — do not modify `src/index.ts`. Barrel update happens in Plan 06.
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/model/message.ts test/model-message.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run model-message</automated>
  </verify>
  <acceptance_criteria>
    - File `src/model/message.ts` exists and exports `Hl7Message` (class) and `Hl7MessageInit` (interface). Verify: `grep -E "^export (class|interface)" src/model/message.ts` returns 2 lines.
    - Class has exactly 5 `public readonly` fields — verify: `grep -c "public readonly" src/model/message.ts` returns 5.
    - Constructor freezes warnings via `Object.freeze` — verify: `grep -c "Object.freeze" src/model/message.ts` returns >= 1.
    - File-level JSDoc does NOT start with `@` — verify: `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/model/message.ts` prints nothing.
    - Class JSDoc contains `@example` with a fenced ```` ```ts ```` block — verify: `grep -A 1 "@example" src/model/message.ts | grep -c '```ts'` returns >= 1.
    - `Hl7MessageInit` is marked `@internal` — verify: `grep -B 2 "interface Hl7MessageInit" src/model/message.ts | grep -c "@internal"` returns 1.
    - `pnpm typecheck` exits 0.
    - `pnpm lint src/model/message.ts test/model-message.test.ts --max-warnings=0` exits 0.
    - `pnpm test -- --run model-message` exits 0 with 5 passing cases.
  </acceptance_criteria>
  <done>`Hl7Message` class shell exists with 5 readonly fields + frozen warnings. 5 test cases pass. Full pipeline green (typecheck + lint + test).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| consumer→parser API | Plan 06 will cross this boundary via `parseHL7`; Plan 01 produces the typed contracts consumers narrow against. No untrusted data flows through Plan 01's artifacts at runtime (only types + factory pure functions). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01-01 | Tampering | Hl7ParseWarning consumer-visible array | mitigate | `Object.freeze` the warnings array in `Hl7Message` constructor — consumers cannot mutate parser output even if they receive the array reference. |
| T-02-01-02 | Information Disclosure | Hl7ParseError.snippet | accept | Library policy: snippets of malformed HL7 may contain PHI. Consumers control error logging; the snippet is truncated to the malformed region (bounded by position). Documenting in Phase 8 README Error Handling section; no redaction applied in library code. |
| T-02-01-03 | Denial of Service | Warning factories called in a loop with large payloads | accept | Factories are pure constant-time object constructions; no regex or expensive operations. Parser-stage plans (02–05) bound call volume by input size. |
</threat_model>

<verification>
Run the full pipeline locally after all 3 tasks:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run parser-types parser-warnings parser-errors model-message
pnpm build
```

All five commands exit 0. Build succeeds because `src/index.ts` is unchanged — `src/parser/*` and `src/model/*` are transitively reachable ONLY once Plan 06 wires exports. For Plan 01 the build should still succeed (new files exist but produce no output from tsup because they aren't re-exported yet — they compile via `pnpm typecheck` via the `include` glob in `tsconfig.json`, but tsup's `entry: ['src/index.ts']` scope means they are not bundled into `dist/`). This is expected and fine for Wave 1.
</verification>

<success_criteria>
- `src/parser/types.ts`, `src/parser/warnings.ts`, `src/parser/errors.ts`, `src/model/message.ts` exist with locked shapes.
- `test/parser-types.test.ts`, `test/parser-warnings.test.ts`, `test/parser-errors.test.ts`, `test/model-message.test.ts` exist with >= 19 passing cases total (5 + 6 + 4 + 5 minimum; more is fine).
- `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm test`, `pnpm build` all exit 0.
- `src/index.ts` unchanged (git diff empty for that file after Plan 01 commit).
- TOL-03 surface (positional context interface with all 5 index fields), TOL-04 surface (`msg.warnings` always present + frozen), and TOL-05 surface (`OnWarningCallback` type exported) are all shipped.
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-01-SUMMARY.md` describing:
- What shipped (4 source files, 4 test files).
- REQ-IDs closed (TOL-03, TOL-04, TOL-05 — all three are "surface / typed contract" closes; runtime emission is verified in Plans 02–06 and end-to-end in Plan 06).
- Any divergences from CONTEXT.md / PATTERNS.md.
- Keys Plan 06 will need: frozen-warnings assignment pattern, emitWarning chokepoint sketch (if any Task 2/3 notes apply).
</output>
