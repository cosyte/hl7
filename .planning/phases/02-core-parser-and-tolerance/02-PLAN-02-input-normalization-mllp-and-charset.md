---
phase: 02-core-parser-and-tolerance
plan: 02
type: execute
wave: 2
depends_on: [02-PLAN-01]
files_modified:
  - src/parser/normalize.ts
  - src/parser/mllp.ts
  - test/parser-normalize.test.ts
  - test/parser-mllp.test.ts
autonomous: true
requirements: [PARSE-07, PARSE-08, PARSE-09, TOL-06]

must_haves:
  truths:
    - "A developer calling `normalize(raw)` is responsible for line-ending normalization only; Plan 06 owns BOM stripping (silent) earlier in the pipeline. `normalize` passes any leading BOM through untouched."
    - "A developer calling `normalize(raw)` with mixed `\\r\\n`, `\\n`, and `\\r` line endings receives a string where all line terminators are `\\r`."
    - "A developer calling `normalizeBuffer(buf, charset?)` with UTF-8 content receives a correctly decoded string; with an unknown charset receives UTF-8-decoded content plus an `UNKNOWN_CHARSET` warning."
    - "A developer calling `stripMllp(input)` on an MLLP-framed payload (bytes `0x0B` prefix / `0x1C` `0x0D` suffix) receives the inner payload plus an `MLLP_FRAMING_STRIPPED` warning; on an unframed payload receives the original string unchanged and no warning."
    - "A developer passing an empty or whitespace-only input to `normalize` receives the same empty/whitespace string back (no throw). The `EMPTY_INPUT` Tier-3 fatal is raised by Plan 06 before `normalize` is called, per D-03 stage ordering."
  artifacts:
    - path: "src/parser/normalize.ts"
      provides: "Line-ending normalization (\r\n/\n/\r → \r) for strings; Buffer decode with charset resolution + line-ending normalization. EMPTY_INPUT fatal and BOM strip are owned by Plan 06 composition per D-03."
      exports: ["normalize", "normalizeBuffer"]
    - path: "src/parser/mllp.ts"
      provides: "MLLP framing byte strip with warning emission"
      exports: ["stripMllp", "StripMllpResult"]
  key_links:
    - from: "src/parser/normalize.ts"
      to: "src/parser/warnings.ts"
      via: "calls unknownCharset factory via emit callback when Buffer charset is unrecognized"
      pattern: "unknownCharset\\("
    - from: "src/parser/mllp.ts"
      to: "src/parser/warnings.ts"
      via: "calls mllpFramingStripped factory via emit callback when framing bytes are removed"
      pattern: "mllpFramingStripped\\("
---

<objective>
Ship the preprocessing layer of the parser pipeline: `normalize` + `normalizeBuffer` (empty check, BOM strip, line-ending normalization, Buffer-charset decode) and `stripMllp` (MLLP framing removal).

Purpose: Every downstream parser stage assumes a single well-formed string with `\r` line endings and no MLLP bytes. This plan produces that invariant and wires the first three of Phase 2's Tier-2 warnings into the pipeline (MLLP_FRAMING_STRIPPED, UNKNOWN_CHARSET — ENCODING_MISMATCH is reserved for Plan 03).

Output:
- `src/parser/normalize.ts` — `normalize(input: string): string` and `normalizeBuffer(input: Buffer, charset: string | undefined, emit: EmitFn): string` with deterministic pipeline order per CONTEXT.md D-03.
- `src/parser/mllp.ts` — `stripMllp(input: string): { stripped, wasFramed }` + `emitIfFramed(result, emit)` helper OR direct `stripMllp(input, emit)` — Claude's choice; action text specifies the chosen shape.
- Test files asserting BOM strip, line-ending normalization, MLLP strip, Buffer UTF-8 happy path, unknown charset fallback, empty-input fatal, whitespace-only fatal.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md
@.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md
@.planning/phases/02-core-parser-and-tolerance/02-01-SUMMARY.md
@src/parser/types.ts
@src/parser/warnings.ts
@src/parser/errors.ts
@src/index.ts
@test/sanity.test.ts

<interfaces>
<!-- Produced by Plan 01 (Wave 1). Consumed by this plan. -->

From src/parser/types.ts:
```typescript
export interface Hl7Position { readonly segmentIndex: number; readonly fieldIndex?: number; ... }
```

From src/parser/warnings.ts:
```typescript
export interface Hl7ParseWarning { readonly code: WarningCode; readonly message: string; readonly position: Hl7Position; }
export function mllpFramingStripped(position: Hl7Position): Hl7ParseWarning;
export function unknownCharset(position: Hl7Position, requested: string): Hl7ParseWarning;
```

From src/parser/errors.ts:
```typescript
export const FATAL_CODES = { ..., EMPTY_INPUT: "EMPTY_INPUT" } as const;
export class Hl7ParseError extends Error {
  public constructor(code: FatalCode, message: string, position: Hl7Position, snippet: string);
}
```

Emit callback shape (used internally by this plan, finalized in Plan 06):
```typescript
type EmitFn = (w: Hl7ParseWarning) => void;
```
Plan 02 APIs MUST accept an `EmitFn` parameter on functions that may emit warnings so Plan 06 can wire the real chokepoint. Do NOT reach into `Hl7Message.warnings` directly from this module — stay decoupled.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/parser/normalize.ts (empty check, BOM strip, line endings, Buffer decode)</name>
  <files>src/parser/normalize.ts, test/parser-normalize.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-03 preprocessing order — EMPTY_INPUT first, then BOM, then MLLP strip, then line-ending normalization; note MLLP is a SEPARATE module per D-02)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (section: "src/parser/normalize.ts", section: "Shared Patterns → Zero runtime deps")
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (PARSE-07, PARSE-08, PARSE-09, TOL-06 full text)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (unknownCharset factory signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts (Hl7ParseError constructor + FATAL_CODES.EMPTY_INPUT)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (Hl7Position shape; emit callback signature)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no external deps; use TextDecoder from Node globals)
  </read_first>
  <behavior>
    - Test 1: `normalize("MSH|...")` with no BOM and all `\r` endings returns the string unchanged and does NOT throw.
    - Test 2: `normalize("\uFEFFMSH|...")` returns the string with the BOM intact (BOM strip is Plan 06's job). Line endings inside are still normalized.
    - Test 3: `normalize("MSH|A\r\nPID|B\nEVN|C\rZPI|D")` (mixed `\r\n`, `\n`, `\r`) returns a string where every terminator is `\r` and no `\n` characters appear.
    - Test 4: `normalize("")` returns the empty string (no throw). EMPTY_INPUT is raised by Plan 06 composition, not by `normalize`.
    - Test 5: `normalize("   \r\n\t ")` (whitespace-only) returns the string with line endings normalized to `\r` (no throw). EMPTY_INPUT semantics belong to Plan 06.
    - Test 6: `normalizeBuffer(Buffer.from("MSH|...", "utf-8"), undefined, emit)` returns a correctly decoded string, emit is never called.
    - Test 7: `normalizeBuffer(Buffer.from(...), "ISO IR 999", emit)` (unrecognized charset) emits a single `UNKNOWN_CHARSET` warning whose position `.segmentIndex === 0` and falls back to UTF-8 decoding.
    - Test 8: `normalizeBuffer(Buffer.from(...), "UTF-8", emit)` decodes with UTF-8, no warning.
  </behavior>
  <action>
Create `src/parser/normalize.ts`.

File-level JSDoc: plain prose NOT starting with `@`. Example: "Input normalization stage for the `@cosyte/hl7-parser` parser pipeline — strips BOM, normalizes line endings to `\\r`, and decodes Buffer input via charset resolution."

Imports:
```typescript
import { unknownCharset } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
```

Note: `normalize` no longer throws `Hl7ParseError` (EMPTY_INPUT moves to Plan 06), so `FATAL_CODES` and `Hl7ParseError` are no longer imported by this module.

Exports:

```typescript
/** Callback shape for warning emission; Plan 06 wires the real chokepoint. @internal */
type EmitFn = (warning: Hl7ParseWarning) => void;

export function normalize(input: string): string {
  // Line-ending normalization ONLY.
  //
  // Per D-03 the canonical pipeline order is:
  //   1. EMPTY_INPUT check (fatal)
  //   2. BOM strip (silent)
  //   3. MLLP strip
  //   4. Line-ending normalization (this function)
  //
  // Plan 06's `parseHL7` composition owns steps 1-3 explicitly so the
  // ordering is inspectable at the pipeline site. This function is a
  // pure string transform that converts every line terminator to a
  // single `\r`. It does NOT throw and does NOT strip BOM — callers
  // must have handled those stages first.
  //
  // Order matters inside the replacement itself: replace `\r\n` first,
  // then remaining `\n` -> `\r`. Existing `\r` characters are preserved.
  return input.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
}

export function normalizeBuffer(
  input: Buffer,
  charset: string | undefined,
  emit: EmitFn,
): string {
  // Resolve charset -> TextDecoder label. Node 18+ TextDecoder supports a broad set;
  // HL7 MSH-18 common values to map: "UNICODE UTF-8" / "UTF-8" -> "utf-8",
  // "ASCII" -> "ascii", "8859/1" -> "iso-8859-1", etc.
  // Zero-dep: rely on TextDecoder's built-in label resolution. If construction throws
  // (label unrecognized), fall back to UTF-8 and emit UNKNOWN_CHARSET.
  //
  // Returns the DECODED + LINE-ENDING-NORMALIZED string. Callers (Plan 06)
  // are responsible for the EMPTY_INPUT fatal check and BOM strip on the
  // returned text (D-03 stage ordering).
  const requested = charset ?? "utf-8";
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(mapHl7Charset(requested));
  } catch {
    emit(unknownCharset({ segmentIndex: 0 }, requested));
    decoder = new TextDecoder("utf-8");
  }
  const decoded = decoder.decode(input);
  return normalize(decoded); // line-ending normalization only
}

/** Map common HL7 MSH-18 charset aliases to TextDecoder labels. @internal */
function mapHl7Charset(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  // Handle the common aliases found in real HL7 traffic
  switch (trimmed) {
    case "":
    case "UNICODE":
    case "UNICODE UTF-8":
    case "UTF-8":
    case "UTF8":
      return "utf-8";
    case "ASCII":
    case "US-ASCII":
      return "ascii";
    case "8859/1":
    case "ISO-8859-1":
      return "iso-8859-1";
    case "8859/15":
    case "ISO-8859-15":
      return "iso-8859-15";
    default:
      return trimmed; // Let TextDecoder decide; unknown labels throw and we catch above.
  }
}
```

JSDoc requirements:
- `normalize`: JSDoc with `@example` showing passing a string and getting a normalized string; note it throws Hl7ParseError on empty input.
- `normalizeBuffer`: JSDoc with `@example` showing a Buffer input + optional charset.
- `EmitFn` type is `@internal` (no @example required).
- `mapHl7Charset` is NOT exported (internal function) but carries a `/** @internal */` JSDoc for readability.

CRITICAL — `noUncheckedIndexedAccess`: `input.charCodeAt(0)` is fine because `charCodeAt` returns `number` (NaN if out of bounds). No index access on arrays here.

CRITICAL — `useUnknownInCatchVariables`: the `catch` block uses bare `catch {}` with no variable binding (no narrowing needed because we don't inspect the error — TextDecoder failure is the signal).

CRITICAL — no `console.*` calls.

Test file `test/parser-normalize.test.ts` (exactly the 8 behaviors above, plus a "preserves real content" sanity case):

```typescript
import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { normalize, normalizeBuffer } from "../src/parser/normalize.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

describe("parser/normalize: string path", () => {
  it("returns input unchanged when already normalized and no BOM", () => {
    const input = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123";
    expect(normalize(input)).toBe(input);
  });

  it("passes a leading UTF-8 BOM through untouched (BOM strip is Plan 06's job)", () => {
    const out = normalize("\uFEFFMSH|^~\\&|X\rPID|1");
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1).startsWith("MSH")).toBe(true);
  });

  it("normalizes \\r\\n, \\n, and mixed line endings to \\r", () => {
    const input = "MSH|A\r\nPID|B\nEVN|C\rZPI|D";
    const out = normalize(input);
    expect(out).not.toMatch(/\n/);
    expect(out).toBe("MSH|A\rPID|B\rEVN|C\rZPI|D");
  });

  it("returns the empty string unchanged (EMPTY_INPUT is Plan 06's job)", () => {
    expect(normalize("")).toBe("");
  });

  it("returns whitespace-only input with line endings normalized (no throw)", () => {
    // \r\n -> \r, \n -> \r; other whitespace (spaces, tabs) is preserved.
    expect(normalize("   \r\n\t ")).toBe("   \r\t ");
  });
});

describe("parser/normalize: Buffer path", () => {
  const validRaw = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123";

  it("decodes a UTF-8 Buffer without a declared charset and emits no warnings", () => {
    const warnings: Hl7ParseWarning[] = [];
    const out = normalizeBuffer(Buffer.from(validRaw, "utf-8"), undefined, (w) => warnings.push(w));
    expect(out).toBe(validRaw);
    expect(warnings).toHaveLength(0);
  });

  it("decodes a UTF-8 Buffer with explicit charset UTF-8 and emits no warnings", () => {
    const warnings: Hl7ParseWarning[] = [];
    normalizeBuffer(Buffer.from(validRaw, "utf-8"), "UTF-8", (w) => warnings.push(w));
    expect(warnings).toHaveLength(0);
  });

  it("emits UNKNOWN_CHARSET and falls back to UTF-8 on an unrecognized charset", () => {
    const warnings: Hl7ParseWarning[] = [];
    const out = normalizeBuffer(Buffer.from(validRaw, "utf-8"), "ISO IR 999", (w) => warnings.push(w));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_CHARSET);
    expect(warnings[0]?.position.segmentIndex).toBe(0);
    expect(out).toBe(validRaw);
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/normalize.ts test/parser-normalize.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-normalize</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/normalize.ts` exists and exports `normalize` and `normalizeBuffer` (verify: `grep -E "^export function (normalize|normalizeBuffer)" src/parser/normalize.ts | wc -l` returns 2).
    - Zero runtime imports from non-relative / non-`node:` modules (verify: `grep -E "^import " src/parser/normalize.ts | grep -v -E "(\"\\./|\"node:)" | wc -l` returns 0 — all imports are relative).
    - No `console.*` calls (verify: `grep -c "console\\." src/parser/normalize.ts` returns 0).
    - Line-ending replacement runs `\\r\\n` first, then `\\n` (verify: `grep -n "replace" src/parser/normalize.ts` shows `\\\\r\\\\n` preceding `\\\\n` in line order).
    - JSDoc `@example` appears on each exported function (`grep -c "@example" src/parser/normalize.ts` >= 2).
    - `pnpm typecheck` exits 0.
    - `pnpm lint src/parser/normalize.ts test/parser-normalize.test.ts --max-warnings=0` exits 0.
    - `pnpm test -- --run parser-normalize` exits 0 with >= 7 passing cases.
  </acceptance_criteria>
  <done>`normalize` implements line-ending normalization only (per refactored D-03 split: EMPTY_INPUT and BOM strip move to Plan 06 composition). `normalizeBuffer` decodes + line-ending-normalizes. Buffer charset resolution with UNKNOWN_CHARSET fallback intact. 7+ tests pass. Typecheck + lint + test green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create src/parser/mllp.ts (MLLP framing strip)</name>
  <files>src/parser/mllp.ts, test/parser-mllp.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-03 — stripping happens AFTER BOM strip and BEFORE line-ending normalization in the overall pipeline; this module is standalone)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (section: "src/parser/mllp.ts")
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (TOL-06 full text: stripMllpFraming: true default, strips 0x0B / 0x1C / 0x0D, emits MLLP_FRAMING_STRIPPED)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (mllpFramingStripped factory signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (Hl7Position — used in warning)
  </read_first>
  <behavior>
    - Test 1: `stripMllp("MSH|...\rPID|1")` (no framing) returns `{ stripped: input, wasFramed: false }`.
    - Test 2: `stripMllp("\u000BMSH|...\rPID|1\u001C\u000D")` (full MLLP envelope) returns `{ stripped: "MSH|...\rPID|1", wasFramed: true }`.
    - Test 3: `stripMllp("\u000BMSH|...\rPID|1")` (leading VT only) returns stripped content without VT, `wasFramed: true`.
    - Test 4: `stripMllp("MSH|...\rPID|1\u001C\u000D")` (trailing FS+CR only) strips trailing bytes, `wasFramed: true`. CRITICAL: the final `\u000D` is MLLP's own trailing CR, NOT a segment terminator for the last segment. The distinguishing rule: the trailing CR is MLLP only when it immediately follows the FS (`0x1C`). Otherwise the CR is data (segment terminator).
    - Test 5: Middle `\u000B` or `\u001C` bytes in the payload (unusual but possible) are also stripped — warning is emitted.
    - Test 6: The returned `wasFramed: true` is used by the pipeline to invoke the `mllpFramingStripped` factory — verified via the companion helper `emitIfFramed(result, emit, position)` that this task also ships.
  </behavior>
  <action>
Create `src/parser/mllp.ts`.

File-level JSDoc: plain prose NOT starting with `@`. Example: "MLLP (Minimal Lower Layer Protocol) framing byte removal for the `@cosyte/hl7-parser` parser pipeline."

Imports:
```typescript
import { mllpFramingStripped } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position } from "./types.js";
```

Exports:

```typescript
/** Result of MLLP framing strip. `wasFramed` is true iff any of the MLLP control bytes (VT=0x0B, FS=0x1C, trailing CR=0x0D after FS) were removed. */
export interface StripMllpResult {
  readonly stripped: string;
  readonly wasFramed: boolean;
}

export function stripMllp(input: string): StripMllpResult {
  // Fast path: scan for any of the three MLLP control bytes.
  // VT = \u000B, FS = \u001C, trailing CR = \u000D but only if immediately after FS.
  const hasVt = input.includes("\u000B");
  const hasFs = input.includes("\u001C");
  if (!hasVt && !hasFs) {
    return { stripped: input, wasFramed: false };
  }

  // Remove all VT and FS bytes everywhere; then strip the MLLP trailing CR
  // (exactly one 0x0D immediately following where the FS was — easier to
  // implement by removing all FS-adjacent trailing bytes first then stripping
  // a single trailing \u000D if the original had FS at end).
  const originalEndedWithFsCr = /\u001C\u000D$/u.test(input);
  let s = input.replace(/[\u000B\u001C]/gu, "");
  if (originalEndedWithFsCr) {
    // Remove the trailing \u000D that was paired with the FS we just stripped.
    if (s.endsWith("\u000D")) s = s.slice(0, -1);
  }
  return { stripped: s, wasFramed: true };
}

export function emitIfFramed(result: StripMllpResult, emit: (w: Hl7ParseWarning) => void, position: Hl7Position): void {
  if (result.wasFramed) emit(mllpFramingStripped(position));
}
```

JSDoc on every export:
- `StripMllpResult`: carries `@example` (required for interfaces exported at top-level per eslint config — actually the `jsdoc/require-example` rule contexts are `VariableDeclaration | FunctionDeclaration | ClassDeclaration`, NOT `TSInterfaceDeclaration`. Confirmed via `eslint.config.js` lines 82-92. So interfaces need `@example` ONLY when the plan requires it. For consistency, include one anyway.)

Actually re-reading `eslint.config.js` line 82-91: `jsdoc/require-example` `contexts` list is `ExportNamedDeclaration > VariableDeclaration | FunctionDeclaration | ClassDeclaration`. Interfaces and type aliases are NOT in that list. So `StripMllpResult` needs `jsdoc/require-jsdoc` (which covers interfaces) but NOT `jsdoc/require-example`. To stay safe and consistent with PROJECT style, include `@example` on `stripMllp` and `emitIfFramed` (functions — required). Interface gets a JSDoc block without `@example` is fine.

`stripMllp` and `emitIfFramed` MUST have `@example` blocks with fenced ```` ```ts ```` code.

CRITICAL — use Unicode-code-point regex flags (`/u`) for the character class. `useUnknownInCatchVariables` not relevant here (no try/catch).

CRITICAL — CLAUDE.md "short testable functions" — resist consolidating `stripMllp` and `emitIfFramed` into a single function. Plan 06's pipeline composes them.

Test file `test/parser-mllp.test.ts` (6 cases from behavior):

```typescript
import { describe, expect, it } from "vitest";

import { stripMllp, emitIfFramed } from "../src/parser/mllp.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

describe("parser/mllp: stripMllp", () => {
  it("returns input unchanged when no framing bytes are present", () => {
    const raw = "MSH|^~\\&|APP\rPID|1";
    const r = stripMllp(raw);
    expect(r.stripped).toBe(raw);
    expect(r.wasFramed).toBe(false);
  });

  it("strips a full MLLP envelope (VT prefix, FS+CR suffix)", () => {
    const raw = "\u000BMSH|^~\\&|APP\rPID|1\u001C\u000D";
    const r = stripMllp(raw);
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("strips a leading VT only", () => {
    const r = stripMllp("\u000BMSH|^~\\&|APP\rPID|1");
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("strips a trailing FS+CR pair without removing an earlier data CR", () => {
    const raw = "MSH|^~\\&|APP\rPID|1\u001C\u000D";
    const r = stripMllp(raw);
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("strips VT/FS bytes that appear mid-payload (defensive)", () => {
    const r = stripMllp("MSH\u000B|^~\\&|APP\u001C\rPID|1");
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("emitIfFramed fires exactly one MLLP_FRAMING_STRIPPED warning when wasFramed is true", () => {
    const warnings: Hl7ParseWarning[] = [];
    emitIfFramed({ stripped: "x", wasFramed: true }, (w) => warnings.push(w), { segmentIndex: 0 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.MLLP_FRAMING_STRIPPED);
  });

  it("emitIfFramed emits nothing when wasFramed is false", () => {
    const warnings: Hl7ParseWarning[] = [];
    emitIfFramed({ stripped: "x", wasFramed: false }, (w) => warnings.push(w), { segmentIndex: 0 });
    expect(warnings).toHaveLength(0);
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/mllp.ts test/parser-mllp.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-mllp</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/mllp.ts` exists and exports `stripMllp`, `emitIfFramed`, and `StripMllpResult` (verify: `grep -E "^export (function|interface) (stripMllp|emitIfFramed|StripMllpResult)" src/parser/mllp.ts | wc -l` returns 3).
    - MLLP byte handling uses exact Unicode escapes `\u000B`, `\u001C`, `\u000D` (verify: `grep -c "\\\\u000B" src/parser/mllp.ts` >= 1 AND `grep -c "\\\\u001C" src/parser/mllp.ts` >= 1 AND `grep -c "\\\\u000D" src/parser/mllp.ts` >= 1).
    - Function `emitIfFramed` calls the `mllpFramingStripped` factory (verify: `grep -c "mllpFramingStripped(" src/parser/mllp.ts` >= 1).
    - No `console.*` calls (verify: `grep -c "console\\." src/parser/mllp.ts` returns 0).
    - File-level JSDoc does NOT start with `@` — verify: `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/parser/mllp.ts` prints nothing.
    - `@example` block appears on `stripMllp` and `emitIfFramed` function JSDocs (verify: `grep -c "@example" src/parser/mllp.ts` >= 2).
    - `pnpm typecheck` exits 0.
    - `pnpm lint src/parser/mllp.ts test/parser-mllp.test.ts --max-warnings=0` exits 0.
    - `pnpm test -- --run parser-mllp` exits 0 with 7 passing cases.
  </acceptance_criteria>
  <done>`stripMllp` handles full/partial/mid-payload framing per TOL-06. `emitIfFramed` surfaces the warning through the emit callback. 7 tests pass. Typecheck + lint + test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| untrusted input → parser | `normalize` and `stripMllp` are the first touch of user-supplied HL7 bytes. Any infinite-loop / DoS / prototype-pollution vector would manifest here. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-02-01 | Denial of Service | `normalize` line-ending regex | mitigate | Use linear-time replacements (`String.replace` with global regex) — both `\\r\\n` and `\\n` replacements are O(n). No backtracking patterns. |
| T-02-02-02 | Denial of Service | `stripMllp` character-class regex | mitigate | `/[\\u000B\\u001C]/gu` is a simple character class, no backtracking; `/\\u001C\\u000D$/u` is anchored. Both O(n). |
| T-02-02-03 | Tampering | Buffer charset label passed to TextDecoder | mitigate | `mapHl7Charset` whitelist for the common HL7 aliases; unknown labels handed to TextDecoder in a try/catch with UNKNOWN_CHARSET fallback. No eval, no dynamic require. |
| T-02-02-04 | Information Disclosure | `Hl7ParseError.snippet` on EMPTY_INPUT | accept | Snippet is bounded to 40 characters; EMPTY_INPUT by definition has no PHI because the input is whitespace-only. |
</threat_model>

<verification>
Run the full pipeline after both tasks:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run parser-normalize parser-mllp
pnpm build
```

All four exit 0.
</verification>

<success_criteria>
- `src/parser/normalize.ts` ships `normalize` (line-ending-only, per refactored D-03 split) and `normalizeBuffer` (Buffer decode + line-ending normalization with charset resolution + UNKNOWN_CHARSET fallback). EMPTY_INPUT fatal and BOM strip are owned by Plan 06's composition.
- `src/parser/mllp.ts` ships `stripMllp` (strips VT/FS/MLLP-trailing-CR) and `emitIfFramed` (surfaces the warning via callback).
- Tests cover PARSE-07 (BOM silent), PARSE-08 (line endings silent), PARSE-09 (Buffer + charset fallback), TOL-06 (MLLP framing).
- All 4 files lint-clean and pass typecheck. Build green.
- No modifications to `src/index.ts` or Plan 01's files.
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-02-SUMMARY.md` describing:
- What shipped (2 source files, 2 test files).
- REQ-IDs closed as parser primitives (PARSE-07, PARSE-08, PARSE-09, TOL-06). Note: end-to-end proof through `parseHL7` happens in Plan 06.
- Any charset edge cases discovered and how `mapHl7Charset` handled them.
- Pipeline-order notes Plan 06 needs: `normalize` is line-ending-only (pure function, no throws, no BOM strip). Plan 06 composes the canonical D-03 order explicitly: EMPTY_INPUT check → BOM strip → stripMllp → (re-check EMPTY_INPUT post-MLLP) → normalize. `normalizeBuffer` decodes a Buffer and applies line-ending normalization; Plan 06 still runs the empty/BOM/MLLP stages on the decoded text.
</output>
