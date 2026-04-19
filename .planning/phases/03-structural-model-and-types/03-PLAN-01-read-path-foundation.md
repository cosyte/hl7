---
phase: 03-structural-model-and-types
plan: 01
title: Read-path foundation — dot-path, Segment, Field, Hl7Message traversal
type: execute
wave: 1
depends_on: []
files_modified:
  - src/model/dot-path.ts
  - src/model/segment.ts
  - src/model/field.ts
  - src/model/message.ts
  - src/index.ts
  - test/model-dotpath.test.ts
  - test/model-segment.test.ts
  - test/model-field.test.ts
autonomous: true
requirements: [MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05]

must_haves:
  truths:
    - "A developer calls `msg.get('PID.5.1')` and receives the auto-unescaped component string from PID-5 component 1."
    - "A developer calls `msg.get('OBX[2].5')` and receives the 5th field of the third OBX segment (0-indexed segment repeat)."
    - "A developer calls `msg.get('PID.3[0].1')` and receives component 1 of the first repetition of PID-3 (0-indexed field repeat)."
    - "A developer calls `msg.get('PID.5.1.1')` on a component with no `&` subcomponents and receives the component string (depth-collapse, D-04)."
    - "A developer calls `msg.get('MSH.1')` and receives the field-separator character `|`; `msg.get('MSH.2')` returns the encoding-characters string `^~\\&` (D-05)."
    - "A developer calls `msg.get('NOT.9.9')` on a missing segment or `msg.get('PID.99')` on an out-of-range field and receives `undefined` — never throws (MODEL-05)."
    - "A developer calls `msg.getAll('NK1')` on a message with no NK1 and receives `[]` (empty array, not undefined)."
    - "A developer calls `msg.segments('OBX')` and receives an array of `Segment` objects; `msg.segments('OBX')[0] === msg.segments('OBX')[0]` (referentially stable per D-11)."
    - "A developer calls `msg.segments('OBX')[0].field(3)` and receives a `Field` object; `seg.field(3) === seg.field(3)` (referentially stable per D-12)."
    - "A developer calls `msg.allSegments()` and receives every `Segment` in original document order."
    - "A developer inspecting a `Field` sees `field.isNull: boolean`, `field.repetitions: readonly RawRepetition[]`, and `field.value: string` (first-repetition, first-component, first-subcomponent, auto-unescaped)."
  artifacts:
    - path: "src/model/dot-path.ts"
      provides: "Dot-path tokenizer + resolver returning `string | undefined` with auto-unescape"
      exports: ["resolvePath", "parsePath", "DotPath"]
    - path: "src/model/segment.ts"
      provides: "Segment wrapper class with cached Field instances"
      exports: ["Segment"]
    - path: "src/model/field.ts"
      provides: "Field wrapper class with isNull, repetitions, value (asXxx coercions wired in Plan 04)"
      exports: ["Field"]
    - path: "src/model/message.ts"
      provides: "Hl7Message extended with get / getAll / segments / allSegments + wrapper caches"
      exports: ["Hl7Message", "Hl7MessageInit"]
    - path: "test/model-dotpath.test.ts"
      provides: "Unit tests for dot-path tokenizer + resolver — covers all 10 CONTEXT.md acceptance paths"
    - path: "test/model-segment.test.ts"
      provides: "Unit tests for Segment wrapper — type, fields, field(n), referential stability"
    - path: "test/model-field.test.ts"
      provides: "Unit tests for Field wrapper — isNull, repetitions, value, auto-unescape on value"
  key_links:
    - from: "src/model/dot-path.ts"
      to: "src/parser/escapes.ts"
      via: "calls unescape(raw, enc, () => {}, position) at the leaf read"
      pattern: "unescape\\("
    - from: "src/model/message.ts"
      to: "src/model/dot-path.ts"
      via: "Hl7Message.get delegates to resolvePath"
      pattern: "resolvePath\\("
    - from: "src/model/message.ts"
      to: "src/model/segment.ts"
      via: "segments(type)/allSegments() construct and cache Segment instances"
      pattern: "new Segment\\("
    - from: "src/model/segment.ts"
      to: "src/model/field.ts"
      via: "Segment.field(n) lazily builds a Field[] cache and returns the same Field per position"
      pattern: "new Field\\("
    - from: "src/index.ts"
      to: "src/model/segment.ts"
      via: "Barrel export: `export { Segment } from './model/segment.js';`"
      pattern: "export \\{ Segment \\}"
    - from: "src/index.ts"
      to: "src/model/field.ts"
      via: "Barrel export: `export { Field } from './model/field.js';`"
      pattern: "export \\{ Field \\}"
---

<objective>
Ship the read-path foundation for Phase 3: the dot-path tokenizer/resolver, the `Segment` and `Field` wrapper classes with cached referential stability, and the `Hl7Message` traversal methods (`get`, `getAll`, `segments`, `allSegments`). After this plan, a developer can call `msg.get('PID.5.1')`, `msg.getAll('NK1')`, and `msg.segments('OBX')[0].field(3).value` against any parsed message. No typed composites yet (those land in Plans 02/03); no mutation yet (Plan 04).

Purpose: Plans 02/03 (composite parsers) and Plan 04 (mutation + `.asXxx()` wiring) all depend on this foundation. Everything Phase 4 builds (`msg.meta`, `msg.patient`, etc.) reads through these APIs.

Output:
- `src/model/dot-path.ts` — pure-function dot-path tokenizer + resolver (string-in → `string | undefined`-out). Auto-unescapes at the leaf via `src/parser/escapes.ts::unescape`.
- `src/model/segment.ts` — `Segment` class wrapping a `RawSegment` with a lazy `Field[]` cache so `seg.field(3) === seg.field(3)` (D-12).
- `src/model/field.ts` — `Field` class wrapping a `RawField` with `isNull`, `repetitions`, and a `value` getter (first-rep/first-comp/first-sub, auto-unescaped). The 10 `.asXxx()` composite coercions are NOT added here — they land in Plan 04 after composites ship.
- `src/model/message.ts` (MODIFIED) — `Hl7Message` gains `get(path)`, `getAll(type)`, `segments(type)`, `allSegments()` plus private `_segmentsByType` and `_allSegments` lazy caches. Constructor shape unchanged (Phase 2 D-05 lock).
- `src/index.ts` (MODIFIED) — adds `export { Segment } from "./model/segment.js";` and `export { Field } from "./model/field.js";`. No other exports yet (composites wait until Plan 04).
- Three Vitest test files covering all 10 CONTEXT.md acceptance paths (`PID.5.1`, `OBX[2].5`, `PID.3[0].1`, `PID.5.1.1` depth-collapse, `MSH.1`, `MSH.2`, `MSH.12`, `NOT.9.9`, `PID.99`, and one repetition-index variant) plus wrapper-stability tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-structural-model-and-types/03-CONTEXT.md
@.planning/phases/03-structural-model-and-types/03-PATTERNS.md
@.planning/phases/02-core-parser-and-tolerance/02-01-SUMMARY.md
@.planning/phases/02-core-parser-and-tolerance/02-04-SUMMARY.md
@.planning/phases/02-core-parser-and-tolerance/02-06-SUMMARY.md
@src/parser/types.ts
@src/parser/escapes.ts
@src/parser/delimiters.ts
@src/model/message.ts
@src/index.ts

<interfaces>
<!-- Produced by Phase 2. Do NOT reshape these. -->

From src/parser/types.ts (1-indexed fields — fields[0] is name/separator placeholder):
```typescript
export interface RawSegment { readonly name: string; readonly fields: readonly RawField[]; }
export interface RawField { readonly repetitions: readonly RawRepetition[]; readonly isNull: boolean; }
export interface RawRepetition { readonly components: readonly RawComponent[]; }
export interface RawComponent { readonly subcomponents: readonly string[]; }
export interface EncodingCharacters {
  readonly field: string; readonly component: string; readonly repetition: string;
  readonly escape: string; readonly subcomponent: string;
}
export interface Hl7Position {
  readonly segmentIndex: number; readonly fieldIndex?: number;
  readonly repetitionIndex?: number; readonly componentIndex?: number; readonly subcomponentIndex?: number;
}
```

From src/parser/escapes.ts:
```typescript
export function unescape(
  input: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
): string;
```

From src/parser/delimiters.ts:
```typescript
export const DEFAULT_ENCODING_CHARACTERS: EncodingCharacters;
```

From src/model/message.ts (Phase 2 shell — Phase 3 EXTENDS this class, does not reshape constructor):
```typescript
export class Hl7Message {
  public readonly segments: readonly RawSegment[];
  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;
  public constructor(init: Hl7MessageInit);
}
```

HL7 convention recap (Phase 2 lock):
- `fields[0]` is the segment name / MSH separator placeholder (NEVER a data field).
- MSH.1 = fields[0] = `|` (field separator, tokenized as the lone char).
- MSH.2 = fields[1] = `^~\&` (encoding chars as a single subcomponent string).
- MSH.3 = fields[2] (first data field of MSH).
- PID.5 = PID's fields[5], PID.5.1 = component 1, PID.5.1.1 = subcomponent 1 of component 1.
- `OBX[2]` means "third OBX in the message" (0-indexed segment repeat, D-01).
- `PID.3[0]` means "first repetition of PID-3" (0-indexed field repeat, D-01).
- Omitted `[N]` on a field token means "first repetition" (index 0).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/model/dot-path.ts — tokenizer + resolver</name>
  <files>src/model/dot-path.ts, test/model-dotpath.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-01 0-indexed `[N]`; D-02 1-indexed dot-segments; D-03 auto-unescape; D-04 depth-collapse; D-05 MSH.1/MSH.2 special; D-06 leaf-return `string | undefined`; §Specific Ideas §dot-path indexing examples that MUST pass)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/dot-path.ts` — linear-scan tokenizer pattern; §Shared Patterns §Walking the raw tree with noUncheckedIndexedAccess; §Shared Patterns §Auto-unescape at leaf)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawSegment 1-indexed fields convention — `fields[0]` is the name/separator slot)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/escapes.ts (unescape 4-arg signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/dates.ts (matchTokenFormat — analog linear-scan tokenizer shape, lines 242–303)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/index.ts (extractVersion — analog descend-with-guards shape, lines 244–254)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (zero deps, no any, no console, JSDoc @example required on public exports)
  </read_first>
  <behavior>
    - Test 1: `resolvePath("PID.5.1", segments, enc)` with PID-5-1 = `"Smith"` returns `"Smith"`.
    - Test 2: `resolvePath("PID.5", segments, enc)` returns the first subcomponent of the first component of the first repetition (HL7 convention — the "most-populated" value is component 1 / sub 1).
    - Test 3: `resolvePath("OBX[2].5", segments, enc)` on a message with 3 OBX segments returns the 5th field of the THIRD OBX (0-indexed: `[2]` → index 2).
    - Test 4: `resolvePath("OBX[0].5", segments, enc)` returns the 5th field of the FIRST OBX.
    - Test 5: `resolvePath("PID.3[0].1", segments, enc)` returns component 1 of the FIRST repetition of PID-3.
    - Test 6: `resolvePath("PID.3[1].1", segments, enc)` returns component 1 of the SECOND repetition of PID-3.
    - Test 7: `resolvePath("PID.5.1.1", segments, enc)` with PID-5-1 = `"Smith"` (no `&` subcomponents) returns `"Smith"` (depth-collapse per D-04: when `subcomponents.length === 1` and subcomponentIndex === 1, return the component).
    - Test 8: `resolvePath("MSH.1", segments, enc)` returns `"|"` (default field separator from MSH fields[0], subcomponents[0] — see `test/parser-tokenize.test.ts:29-36`).
    - Test 9: `resolvePath("MSH.2", segments, enc)` returns `"^~\\&"` (encoding-chars string from MSH fields[1], subcomponents[0]).
    - Test 10: `resolvePath("MSH.12", segments, enc)` returns the HL7 version string (e.g. `"2.5"`) — same walk as Phase 2 `extractVersion`.
    - Test 11: `resolvePath("NOT.9.9", segments, enc)` (no NOT segment exists) returns `undefined`.
    - Test 12: `resolvePath("PID.99", segments, enc)` (PID only has 15 fields) returns `undefined`.
    - Test 13: `resolvePath("PID.5.99", segments, enc)` (PID-5 only has 5 components) returns `undefined`.
    - Test 14: `resolvePath("PID.5", segments, enc)` where PID-5-1 = `"Smith\\F\\Jr"` returns `"Smith|Jr"` (auto-unescaped via `unescape()`).
    - Test 15: `parsePath("PID.5.1")` returns a DotPath object with `{ segmentType: "PID", segmentIndex: 0, fieldIndex: 5, repetitionIndex: 0, componentIndex: 1 }` (or equivalent shape — planner may tweak field names).
    - Test 16: `parsePath("OBX[2].5")` returns `{ segmentType: "OBX", segmentIndex: 2, fieldIndex: 5, repetitionIndex: 0 }`.
    - Test 17: `parsePath("")` throws `TypeError` with a message containing `""` (empty path).
    - Test 18: `parsePath("pid.5")` throws `TypeError` (lowercase segment — HL7 convention is uppercase; per D-19 allowed shapes are `[A-Z]{3}` or `Z[A-Z0-9]{2}`).
    - Test 19: `parsePath("PID.5.1.1.1")` throws `TypeError` (too deep — HL7 only has segment/field/rep/component/subcomponent; 4 dots = 5 levels beyond segment is malformed).
    - Test 20: `parsePath("PID.-1")` throws `TypeError` (negative field index).
    - Test 21: `resolvePath("PID.3", segments, enc)` where PID-3 has 2 repetitions returns the FIRST repetition's first subcomponent (omitted `[N]` → index 0 per CONTEXT.md §canonical_refs).
    - Test 22: Referential stability of DotPath is NOT required — `parsePath("PID.5")` may return a fresh object each call. Verify shape only.
    - Test 23: Auto-unescape at MSH.1 — `resolvePath("MSH.1", ...)` does NOT pass `|` through `unescape` (it is the separator char itself, which `unescape` would preserve as-is because it contains no escape char; but the path-resolver should still call unescape uniformly — verify test returns `"|"` exactly).
  </behavior>
  <action>
Create `src/model/dot-path.ts`.

**File-level JSDoc** — prose first line, NEVER start with `@`:
```typescript
/**
 * Dot-path tokenizer and resolver for the `@cosyte/hl7-parser` structural
 * model. Parses strings like `PID.5.1`, `OBX[2].5`, `PID.3[0].1` into a
 * discriminated-token descriptor, then resolves that descriptor against a
 * `readonly RawSegment[]` tree to produce the auto-unescaped leaf string (or
 * `undefined` on missing path). Zero runtime deps — a hand-rolled linear scan
 * (analog: `src/parser/dates.ts::matchTokenFormat`).
 *
 * Indexing conventions (locked in Phase 3 CONTEXT.md):
 * - `[N]` is ALWAYS 0-indexed — applies to segment repeats AND field repeats (D-01).
 * - Dot-numbers are ALWAYS 1-indexed — matches HL7 spec and Phase 2's 1-indexed
 *   `RawSegment.fields` (D-02). `PID.5` → `fields[5]`.
 * - MSH.1 / MSH.2 are the separator char and encoding-chars string, both
 *   stored at `fields[0]` / `fields[1]` by Phase 2 tokenize.ts (D-05).
 * - Missing subcomponent on a single-sub component returns the component
 *   string (depth-collapse, D-04).
 * - Every leaf read passes through `unescape()` with a no-op emitter (D-03).
 */
```

**Imports:**
```typescript
import { unescape } from "../parser/escapes.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawSegment,
} from "../parser/types.js";
```

**Types — discriminated DotPath descriptor:**
```typescript
/**
 * Parsed representation of a dot-path string. Produced by `parsePath`,
 * consumed by `resolvePath`. All numeric indices are normalized to the
 * internal convention (segmentIndex = 0-based occurrence, fieldIndex =
 * 1-based HL7 field number, repetitionIndex = 0-based rep, componentIndex
 * and subcomponentIndex = 1-based HL7 positions).
 *
 * @example
 * ```ts
 * import { parsePath } from "@cosyte/hl7-parser";
 * parsePath("OBX[2].5.1"); // { segmentType: "OBX", segmentIndex: 2, fieldIndex: 5, repetitionIndex: 0, componentIndex: 1 }
 * ```
 */
export interface DotPath {
  readonly segmentType: string;
  readonly segmentIndex: number;      // 0-based occurrence of this segment type
  readonly fieldIndex: number;        // 1-based HL7 field number (maps to RawSegment.fields[fieldIndex])
  readonly repetitionIndex?: number;  // 0-based; defaults to 0 when `[N]` omitted
  readonly componentIndex?: number;   // 1-based HL7
  readonly subcomponentIndex?: number; // 1-based HL7
}
```

**Tokenizer — `parsePath(path: string): DotPath`**

Hand-rolled linear scan. Acceptable shapes:
- `SEG` (segment-only; invalid for value resolution but parsePath accepts)
- `SEG[n]` (0-indexed segment occurrence)
- `SEG.N` (field)
- `SEG[n].N`
- `SEG.N[r]` (field repetition, 0-indexed)
- `SEG[n].N[r]`
- `SEG.N.C` (component, 1-indexed)
- `SEG.N[r].C`
- `SEG[n].N[r].C`
- `SEG.N.C.S` (subcomponent, 1-indexed)
- …up to `SEG[n].N[r].C.S`

Segment name regex: `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` (D-19 shape — enforced at the parsePath boundary for symmetry with `addSegment`).

Throw `TypeError` with full path string on:
- Empty path.
- Segment name that doesn't match the regex (e.g. lowercase, 4 chars, starts with digit).
- `[N]` with non-digit content or negative.
- More than 3 dots after the segment (more than subcomponent depth — e.g. `PID.5.1.1.1`).
- Trailing dot (`PID.`) or leading dot (`.PID`).

Suggested scanner shape (see PATTERNS.md §`src/model/dot-path.ts` — copy the linear-scan `while (i < format.length)` shape from `matchTokenFormat`):

```typescript
export function parsePath(path: string): DotPath {
  if (path.length === 0) {
    throw new TypeError(`Invalid HL7 dot-path: "" (empty).`);
  }
  // 1. Parse segment token (3 chars) + optional [n]
  // 2. If more input, expect '.', parse field number, optional [r]
  // 3. If more input, expect '.', parse component number
  // 4. If more input, expect '.', parse subcomponent number
  // 5. Any remaining input → throw
  // Implementation: single `let i = 0` cursor, helper `readDigits()`, helper `readBracket()`.
  ...
}
```

**Resolver — `resolvePath(path, segments, enc): string | undefined`**

Two-step:
1. `const parsed = parsePath(path);` — throws TypeError on malformed input (propagates to caller; callers that want "never throw" must wrap in try/catch OR rely on the fact that `resolvePath` is only called with strings that successfully tokenized).
2. Walk `segments` with explicit `noUncheckedIndexedAccess` guards (copy the `extractVersion` shape from `src/parser/index.ts:244-254`):
   - Find the `parsed.segmentIndex`-th segment with `seg.name === parsed.segmentType` (or MSH specially — MSH occurs once at index 0). If none → return `undefined`.
   - `field = seg.fields[parsed.fieldIndex]` — `undefined` → return `undefined`.
   - `rep = field.repetitions[parsed.repetitionIndex ?? 0]` — `undefined` → return `undefined`.
   - `comp = rep.components[(parsed.componentIndex ?? 1) - 1]` — `undefined` → return `undefined`.
   - `subIdx = (parsed.subcomponentIndex ?? 1) - 1; sub = comp.subcomponents[subIdx]`.
     - If `sub !== undefined` → return `unescape(sub, enc, () => {}, position)`.
     - If `sub === undefined` AND `parsed.subcomponentIndex !== undefined` AND `comp.subcomponents.length === 1` AND `parsed.subcomponentIndex === 1` → **depth-collapse (D-04)**: return `unescape(comp.subcomponents[0], enc, noop, position)`. (Actually, by the time we reach this branch, `subcomponents[0]` was already the check that failed — so depth-collapse only fires when the explicit subcomponentIndex > subcomponents.length. Re-read D-04: "If PID.5 is a plain component with no `&` subcomponents, `msg.get('PID.5.1.1')` returns the component string." This means `subcomponents = ["Smith"]` and `msg.get("PID.5.1.1")` should return `"Smith"`. The above logic already handles this because `comp.subcomponents[0] = "Smith"` is returned on the normal path. The edge case is when the user passes `PID.5.1.1.1` or `PID.5.1.2` on a single-sub component — that should still return `undefined`. So depth-collapse is the NORMAL case and no extra branch is needed. Document the reasoning in a comment.)
   - If `sub === undefined` and no depth-collapse applies → return `undefined`.

**Position for unescape** — pass best-effort `Hl7Position`:
```typescript
const position: Hl7Position = {
  segmentIndex: /* absolute index in segments array */ 0,
  // Optional fields omitted via two-branch construction (exactOptionalPropertyTypes)
};
```

Per PATTERNS.md §Auto-unescape at leaf: pass `() => {}` as the emitter — Phase 3 traversal emits NO warnings.

**MSH special case handling.** Per PATTERNS.md §`src/model/dot-path.ts` §MSH.1 / MSH.2: no special branch is needed IF Phase 2 tokenize placed `|` at MSH `fields[0].repetitions[0].components[0].subcomponents[0]` and `^~\&` at MSH `fields[1].repetitions[0].components[0].subcomponents[0]`. Verify with `test/parser-tokenize.test.ts:29-36` — yes, this is what Phase 2 ships. The resolver's generic walk handles MSH.1 / MSH.2 without a branch. MSH-3 = fields[2], MSH-12 = fields[11] — Phase 2 established `fields[11]` as MSH-12 via `extractVersion`.

**Segment occurrence lookup.** `segmentIndex` is the 0-based occurrence of `segmentType`, NOT the absolute `segments[]` array index. Helper:
```typescript
function findSegment(
  segments: readonly RawSegment[],
  segmentType: string,
  occurrence: number,
): { seg: RawSegment; absoluteIndex: number } | undefined {
  let seen = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s === undefined) continue; // noUncheckedIndexedAccess
    if (s.name === segmentType) {
      if (seen === occurrence) return { seg: s, absoluteIndex: i };
      seen++;
    }
  }
  return undefined;
}
```

**JSDoc on every public export** with `@example` (ESLint `jsdoc/require-example` enforces). Exports: `resolvePath`, `parsePath`, `DotPath` (interface).

**CRITICAL constraints (CLAUDE.md + PATTERNS.md §Zero-dep parser discipline):**
- No `any`. No `{} as DotPath` object-literal casts (use `Mutable<DotPath>` + conditional assignment, like `src/parser/index.ts:396-410`).
- No `console.*`.
- `@example` on every public export.
- File-level JSDoc must NOT start with `@` (Phase 1 Plan 04 Rule-1 bug).
- Zero runtime deps.

**Test file `test/model-dotpath.test.ts`** — follow `test/parser-tokenize.test.ts` style. Build real messages via `parseHL7(raw)` to exercise the 1-indexed convention end-to-end (PATTERNS.md §test file §Integration style). Include all 23 cases above.

Test file header:
```typescript
import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";
import { parsePath, resolvePath } from "../src/model/dot-path.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "PID|||123456^^^MRN|ALT1~ALT2||Smith\\F\\Jr^Jane^Q^Jr.^Mrs.||19800115|F\r" +
  "OBX|1|TX|GLUC|1|120|mg/dL|80-110||||F\r" +
  "OBX|2|TX|HGB|2|14.0|g/dL|12-16||||F\r" +
  "OBX|3|TX|PLT|3|200|K/uL|150-400||||F";
```

NOTE on the fixture: PID-5 is `Smith\F\Jr^Jane^Q^Jr.^Mrs.` with an escaped `|` in the family name (exercises auto-unescape). PID-3 is `123456^^^MRN` (single rep, 4 components — tests component indexing).

Edge-case test block for `parsePath` throws:
```typescript
describe("model/dot-path: parsePath rejects malformed paths", () => {
  it.each([
    [""],
    ["pid.5"],       // lowercase
    ["PI.5"],        // 2 chars
    ["PIDX.5"],      // 4 chars
    ["1PID.5"],      // starts with digit
    ["PID."],        // trailing dot
    [".PID.5"],      // leading dot
    ["PID.5.1.1.1"], // too deep
    ["PID.-1"],      // negative field
    ["PID[-1].5"],   // negative segment rep
    ["PID.5[]"],     // empty bracket
    ["PID.5[a]"],    // non-digit bracket
  ])("throws TypeError on %s", (badPath) => {
    expect(() => parsePath(badPath)).toThrow(TypeError);
  });
});
```

Resolver tests (20+ cases in `describe("model/dot-path: resolvePath", ...)`) cover all 23 behaviors. Construct via `const msg = parseHL7(FIXTURE); const result = resolvePath(path, msg.segments, msg.encodingCharacters);`.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/dot-path.ts test/model-dotpath.test.ts --max-warnings=0 && pnpm test -- --run model-dotpath</automated>
  </verify>
  <acceptance_criteria>
    - File `src/model/dot-path.ts` exists: `test -f src/model/dot-path.ts && echo OK` prints `OK`.
    - Exports exactly `resolvePath` and `parsePath` (plus the `DotPath` type): `grep -cE "^export (function|interface) (resolvePath|parsePath|DotPath)" src/model/dot-path.ts` returns 3.
    - Calls `unescape` at the leaf: `grep -cE "unescape\\(" src/model/dot-path.ts` returns >= 1.
    - `parsePath` throws TypeError for malformed input: `grep -c "throw new TypeError" src/model/dot-path.ts` returns >= 1.
    - Segment-name regex present (D-19 symmetry): `grep -cE "\\[A-Z\\]\\{3\\}|Z\\[A-Z0-9\\]\\{2\\}" src/model/dot-path.ts` returns >= 1.
    - No `any`, no `console.*`, no non-null `!`: `grep -cE "(: any(\\s|,|\\))|<any>|console\\.)" src/model/dot-path.ts` returns 0.
    - File-level JSDoc does NOT start with `@`: `awk 'NR==2 && /^ \* @/ { print "FAIL"; exit 1 }' src/model/dot-path.ts` prints nothing.
    - `@example` on every public export: `grep -c "@example" src/model/dot-path.ts` returns >= 3 (resolvePath, parsePath, DotPath).
    - Test file exists with >= 20 `it(` blocks: `grep -c "^  it\\(" test/model-dotpath.test.ts` returns >= 20.
    - `pnpm typecheck` exits 0.
    - `pnpm lint src/model/dot-path.ts test/model-dotpath.test.ts --max-warnings=0` exits 0.
    - `pnpm test -- --run model-dotpath` exits 0 with all cases green.
  </acceptance_criteria>
  <done>`src/model/dot-path.ts` ships `parsePath` + `resolvePath` + `DotPath` with all 23 behaviors passing. All 10 CONTEXT.md acceptance paths (`PID.5.1`, `OBX[2].5`, `PID.3[0].1`, `PID.5.1.1` depth-collapse, `MSH.1`, `MSH.2`, `MSH.12`, `NOT.9.9`, `PID.99`, repetition variant) verified. Zero lint/typecheck warnings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create src/model/segment.ts and src/model/field.ts — wrapper classes with cached referential stability</name>
  <files>src/model/segment.ts, src/model/field.ts, test/model-segment.test.ts, test/model-field.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-08 .asXxx() coercions land in Plan 04; D-11 Segment wrappers cached; D-12 Field wrappers cached per position; D-16 segments mutable, warnings frozen; §Specific Ideas §Field wrapper `isNull` surfacing)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/segment.ts` — cached-wrapper pattern; §`src/model/field.ts` — class shape + isNull + value getter + auto-unescape; §Shared Patterns §Walking the raw tree with noUncheckedIndexedAccess; §Shared Patterns §Constructor `@internal`)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/message.ts (class shape analog — readonly fields, @internal constructor, JSDoc with @example)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawSegment, RawField, RawRepetition, RawComponent; RawField.isNull discriminant)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/escapes.ts (unescape 4-arg signature)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc @example on exports, immutability by convention, no console)
  </read_first>
  <behavior>
    Segment wrapper:
    - Test 1: `new Segment(rawSeg, enc, 0)` exposes `seg.type === rawSeg.name`, `seg.fields === rawSeg.fields` (same reference — no defensive copy).
    - Test 2: `seg.field(3)` returns a `Field` instance; `seg.field(3) === seg.field(3)` (D-12: cached, referentially stable).
    - Test 3: `seg.field(0)` returns a Field wrapping `fields[0]` (the separator placeholder — not data, but accessible).
    - Test 4: `seg.field(99)` (out-of-range) returns a synthetic empty Field (isNull=false, repetitions=[], value="") — matches MODEL-05 "never throws on missing".
    - Test 5: `seg.field(99) === seg.field(99)` — the empty sentinel is also stable (returning the same instance on repeat calls).
    - Test 6: Constructor is marked `@internal` in JSDoc.

    Field wrapper:
    - Test 7: `new Field(rawField, enc, pos)` exposes `f.isNull === rawField.isNull`, `f.repetitions === rawField.repetitions` (same reference).
    - Test 8: `f.value` on a field with `repetitions[0].components[0].subcomponents[0] === "Smith"` returns `"Smith"`.
    - Test 9: `f.value` on a field with `repetitions[0].components[0].subcomponents[0] === "Smith\\F\\Jr"` returns `"Smith|Jr"` (auto-unescaped).
    - Test 10: `f.value` on an empty field (no repetitions) returns `""`.
    - Test 11: `f.value` on an HL7 null field (`isNull: true`, empty repetitions) returns `""` (empty string — preserves the "string | undefined" leaf type; the distinction is kept only via `f.isNull === true` per §Specifics §Field wrapper isNull surfacing).
    - Test 12: `Field.empty(enc)` returns a Field with `isNull === false`, `repetitions === []` (readonly), `value === ""`.
    - Test 13: `Field.empty(enc) === Field.empty(enc)` — same sentinel instance (memoized at module scope, one per enc — though in practice always called with DEFAULT_ENCODING_CHARACTERS from resolvePath's fallback).  Planner note: simplest implementation is one module-scoped sentinel built with DEFAULT_ENCODING_CHARACTERS; the enc argument on `Field.empty` is accepted but ignored (returns the shared sentinel). Document this plainly.
    - Test 14: Constructor is marked `@internal` in JSDoc.

    CRITICAL for Plan 04 wiring: Field must expose `readonly raw: RawField` and `readonly enc: EncodingCharacters` so Plan 04 can add `.asXxx()` methods without rewriting the class.
  </behavior>
  <action>
**Create `src/model/segment.ts`.**

File-level JSDoc (prose first, NOT starting with `@`):
```typescript
/**
 * `Segment` — wrapper class over a `RawSegment` that exposes `field(n)` with
 * referentially stable `Field` instances (D-12). Constructed internally by
 * `Hl7Message.segments(type)` / `Hl7Message.allSegments()`; user code never
 * calls `new Segment(...)` directly.
 *
 * The wrapper does NOT copy `raw.fields` — it holds a reference so mutations
 * through Plan 04's `setField` / `addSegment` / `removeSegment` stay visible.
 */
```

Imports:
```typescript
import { Field } from "./field.js";
import type { EncodingCharacters, RawSegment } from "../parser/types.js";
```

Class shape:
```typescript
/**
 * Wrapper over a `RawSegment` exposing typed per-position `Field` instances.
 * `seg.field(3) === seg.field(3)` — referential stability is guaranteed per
 * segment instance.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * const pid = msg.segments("PID")[0];
 * if (pid !== undefined) console.log(pid.field(5).value);
 * ```
 */
export class Segment {
  /** Segment name (3 chars, e.g. `"PID"`, `"OBX"`, `"ZPI"`). */
  public readonly type: string;

  /** Reference to the underlying `RawSegment.fields` — 1-indexed per HL7 convention. */
  public readonly fields: readonly import("../parser/types.js").RawField[];

  /** The 5 encoding characters for this message. Exposed for composite parsers. @internal */
  public readonly enc: EncodingCharacters;

  /** Absolute index of this segment in `Hl7Message.segments[]`. Used for position tracking. @internal */
  public readonly absoluteIndex: number;

  /** The full `RawSegment` this wrapper wraps. Exposed for mutation methods (Plan 04). @internal */
  public readonly raw: RawSegment;

  /** Lazy cache of Field wrappers — one per fields[] position. @internal */
  private _fieldWrappers: Field[] | undefined;

  /**
   * Construct a new `Segment`. Called internally by `Hl7Message`; user code
   * should obtain `Segment` instances via `msg.segments(type)` or
   * `msg.allSegments()`.
   * @internal
   */
  public constructor(raw: RawSegment, enc: EncodingCharacters, absoluteIndex: number) {
    this.raw = raw;
    this.type = raw.name;
    this.fields = raw.fields;
    this.enc = enc;
    this.absoluteIndex = absoluteIndex;
  }

  /**
   * Return the `Field` wrapper at position `n` (1-indexed per HL7 — `seg.field(5)`
   * maps to PID-5 when `seg.type === "PID"`). Returns a synthetic empty `Field`
   * (`.isNull === false`, `.value === ""`) when `n` is out of range — never
   * throws (MODEL-05).
   *
   * @example
   * ```ts
   * const pid5 = msg.segments("PID")[0]?.field(5);
   * console.log(pid5?.value);
   * ```
   */
  public field(n: number): Field {
    if (this._fieldWrappers === undefined) {
      // Build the full wrapper array. O(k) where k = fields.length; cached.
      this._fieldWrappers = this.fields.map(
        (rf, i) =>
          new Field(rf, this.enc, {
            segmentIndex: this.absoluteIndex,
            fieldIndex: i,
          }),
      );
    }
    const f = this._fieldWrappers[n];
    return f ?? Field.empty(this.enc);
  }
}
```

**Create `src/model/field.ts`.**

File-level JSDoc (prose):
```typescript
/**
 * `Field` — wrapper over a `RawField` exposing HL7 null/empty discrimination
 * (`isNull`), the raw repetitions tree, and a convenience `value` getter that
 * auto-unescapes the first subcomponent of the first component of the first
 * repetition. Constructed internally by `Segment.field(n)`; user code never
 * calls `new Field(...)` directly.
 *
 * Typed composite coercions (`asXpn`, `asXad`, etc.) are wired in Plan 04
 * after all 10 composite parsers ship in Plans 02 + 03.
 */
```

Imports:
```typescript
import { unescape } from "../parser/escapes.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawField,
  RawRepetition,
} from "../parser/types.js";
```

Class shape:
```typescript
/** @internal — position passed to `unescape` for any leaf read. */
const DEFAULT_POSITION: Hl7Position = { segmentIndex: 0 };

/**
 * Wrapper over a `RawField` exposing HL7 null/empty discrimination
 * (`isNull`), the repetitions tree, and an auto-unescaped `value` getter.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * const pid5 = msg.segments("PID")[0]?.field(5);
 * console.log(pid5?.value);      // "Smith" (first subcomponent, auto-unescaped)
 * console.log(pid5?.isNull);     // false (HL7 spec: `""` is null, empty is not)
 * console.log(pid5?.repetitions.length);
 * ```
 */
export class Field {
  /** HL7 null indicator — `true` iff the underlying field was the two-char literal `""`. */
  public readonly isNull: boolean;

  /** Reference to the underlying `RawField.repetitions`. */
  public readonly repetitions: readonly RawRepetition[];

  /** The 5 encoding characters for this message. @internal */
  public readonly enc: EncodingCharacters;

  /** Position of this field in the parent message — used for position-aware error messages. @internal */
  public readonly position: Hl7Position;

  /** The full `RawField` this wrapper wraps. Exposed for composite parsers (Plan 02/03/04). @internal */
  public readonly raw: RawField;

  /** @internal */
  public constructor(raw: RawField, enc: EncodingCharacters, position: Hl7Position) {
    this.raw = raw;
    this.isNull = raw.isNull;
    this.repetitions = raw.repetitions;
    this.enc = enc;
    this.position = position;
  }

  /**
   * First-repetition, first-component, first-subcomponent value as a
   * HL7-unescaped string. Returns `""` when the field is empty or HL7 null.
   * Equivalent to `msg.get('SEG.N')` for a top-level field access.
   *
   * @example
   * ```ts
   * const pid5 = msg.segments("PID")[0]?.field(5);
   * console.log(pid5?.value); // "Smith|Jr" (with \F\ auto-expanded)
   * ```
   */
  public get value(): string {
    const rep = this.repetitions[0];
    if (rep === undefined) return "";
    const comp = rep.components[0];
    if (comp === undefined) return "";
    const sub = comp.subcomponents[0];
    if (sub === undefined) return "";
    return unescape(sub, this.enc, NOOP_EMITTER, this.position);
  }

  /**
   * Return a synthetic empty `Field` sentinel — used by `Segment.field(n)` to
   * honor MODEL-05's "never throws on missing" contract. The returned Field
   * has `isNull === false`, `repetitions === []`, and `value === ""`.
   * Referentially stable across calls (same instance returned each time).
   *
   * @example
   * ```ts
   * const empty = Field.empty(msg.encodingCharacters);
   * console.log(empty.value); // ""
   * ```
   * @internal
   */
  public static empty(_enc: EncodingCharacters): Field {
    return EMPTY_FIELD;
  }
}

const NOOP_EMITTER = (): void => {};

const EMPTY_RAW: RawField = Object.freeze({
  repetitions: Object.freeze([]) as readonly RawRepetition[],
  isNull: false,
});

const EMPTY_FIELD = new Field(EMPTY_RAW, DEFAULT_ENCODING_CHARACTERS, DEFAULT_POSITION);
```

Note: `Field.empty` accepts an `enc` argument for API symmetry but returns the shared sentinel — the synthetic field never contains content, so unescape against it would be a no-op regardless of enc. Document this plainly in the `@internal` JSDoc block.

**CRITICAL constraints:**
- No `any`. No non-null `!`. No object-literal `as`.
- `@example` on Segment class, Segment.field, Field class, Field.value. Constructor marked `@internal` (exempt from `jsdoc/require-example`).
- File-level JSDoc prose-only (no leading `@`).
- `exactOptionalPropertyTypes`: `fields` / `repetitions` are readonly references, not copies.

**Test files:**

`test/model-segment.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";
import { Segment } from "../src/model/segment.js";
import { Field } from "../src/model/field.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "PID|||123|ALT||Smith^Jane\r" +
  "OBX|1|TX|GLUC|1|120";

describe("model/segment: Segment wrapper", () => {
  it("wraps RawSegment without copying", () => {
    const msg = parseHL7(FIXTURE);
    const pid = msg.segments("PID")[0];
    expect(pid).toBeDefined();
    if (pid === undefined) return;
    expect(pid.type).toBe("PID");
    expect(pid.fields).toBe(pid.raw.fields); // same reference
  });

  it("caches Field wrappers by position (D-12)", () => {
    const msg = parseHL7(FIXTURE);
    const pid = msg.segments("PID")[0];
    if (pid === undefined) return;
    const f1 = pid.field(5);
    const f2 = pid.field(5);
    expect(f1).toBe(f2);
  });

  it("returns synthetic empty Field for out-of-range positions (MODEL-05)", () => {
    const msg = parseHL7(FIXTURE);
    const pid = msg.segments("PID")[0];
    if (pid === undefined) return;
    const f = pid.field(99);
    expect(f.isNull).toBe(false);
    expect(f.repetitions).toHaveLength(0);
    expect(f.value).toBe("");
    expect(pid.field(99)).toBe(pid.field(99)); // stable
  });
});
```

`test/model-field.test.ts`:
```typescript
import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/parser/index.js";
import { Field } from "../src/model/field.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawField } from "../src/parser/types.js";

describe("model/field: Field wrapper", () => {
  it("exposes isNull from RawField", () => {
    const raw: RawField = { repetitions: [], isNull: true };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.isNull).toBe(true);
    expect(f.repetitions).toHaveLength(0);
    expect(f.value).toBe(""); // HL7 null still surfaces as "" at value getter (§Specifics recommendation)
  });

  it("auto-unescapes value at the leaf", () => {
    const raw: RawField = {
      repetitions: [{ components: [{ subcomponents: ["Smith\\F\\Jr"] }] }],
      isNull: false,
    };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.value).toBe("Smith|Jr");
  });

  it("returns '' for empty fields", () => {
    const raw: RawField = { repetitions: [], isNull: false };
    const f = new Field(raw, DEFAULT_ENCODING_CHARACTERS, { segmentIndex: 0 });
    expect(f.value).toBe("");
  });

  it("Field.empty returns a stable sentinel", () => {
    const a = Field.empty(DEFAULT_ENCODING_CHARACTERS);
    const b = Field.empty(DEFAULT_ENCODING_CHARACTERS);
    expect(a).toBe(b);
    expect(a.value).toBe("");
    expect(a.isNull).toBe(false);
  });

  it("integrates with parseHL7 — PID-5 first-subcomponent", () => {
    const msg = parseHL7(
      "MSH|^~\\&|A|F|A|F|20250101||ADT^A01|1|P|2.5\rPID|||1|A|Smith\\F\\Jr^Jane",
    );
    const f5 = msg.segments("PID")[0]?.field(5);
    expect(f5?.value).toBe("Smith|Jr");
    expect(f5?.isNull).toBe(false);
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/segment.ts src/model/field.ts test/model-segment.test.ts test/model-field.test.ts --max-warnings=0 && pnpm test -- --run "model-segment|model-field"</automated>
  </verify>
  <acceptance_criteria>
    - `src/model/segment.ts` exists and exports `Segment`: `grep -cE "^export class Segment" src/model/segment.ts` returns 1.
    - `src/model/field.ts` exists and exports `Field`: `grep -cE "^export class Field" src/model/field.ts` returns 1.
    - Segment has `field(n)` method: `grep -cE "public field\\(n: number\\): Field" src/model/segment.ts` returns 1.
    - Segment caches Field instances lazily: `grep -cE "_fieldWrappers" src/model/segment.ts` returns >= 2 (declaration + usage).
    - Field exposes `isNull`, `repetitions`, `value`, `raw`, `enc`, `position`: `grep -cE "public readonly (isNull|repetitions|enc|position|raw)" src/model/field.ts` returns >= 5.
    - Field has static `empty`: `grep -cE "public static empty" src/model/field.ts` returns 1.
    - Field.value calls unescape: `grep -cE "unescape\\(" src/model/field.ts` returns >= 1.
    - No `any`, no `console.*`: `grep -cE "(: any(\\s|,|\\))|<any>|console\\.)" src/model/segment.ts src/model/field.ts` returns 0.
    - @internal on constructors: `grep -c "@internal" src/model/segment.ts src/model/field.ts` returns >= 4.
    - @example on public methods and classes: `grep -c "@example" src/model/segment.ts src/model/field.ts` returns >= 4.
    - File-level JSDoc prose (no leading `@`): `awk 'NR==2 && /^ \* @/ { print "FAIL"; exit 1 }' src/model/segment.ts src/model/field.ts` prints nothing.
    - Test files exist: `test -f test/model-segment.test.ts && test -f test/model-field.test.ts && echo OK` prints `OK`.
    - `pnpm typecheck` exits 0.
    - `pnpm lint ... --max-warnings=0` exits 0.
    - `pnpm test -- --run "model-segment|model-field"` exits 0 with all cases green.
  </acceptance_criteria>
  <done>`Segment` and `Field` classes ship with lazy caching (D-11/D-12 referential stability), `isNull` surfacing, auto-unescaped `value`, and `Field.empty` sentinel. All 14 wrapper tests pass. Zero lint/typecheck warnings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend Hl7Message with get/getAll/segments/allSegments + wrapper caches; add Segment/Field to src/index.ts barrel</name>
  <files>src/model/message.ts, src/index.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-03 get returns auto-unescaped string; D-07 getAll returns Segment[]; D-11 segment wrappers cached per-message; D-17 caches will be invalidated by Plan 04 mutations — cache shape must be map-based for efficient invalidation)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/message.ts` MODIFIED — add private wrapper cache fields; get(path) delegates to resolvePath)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/message.ts (EXISTING class — Phase 3 EXTENDS without reshaping constructor)
    - /home/nschatz/projects/cosyte/hl7-parser/src/index.ts (existing barrel — add new exports without reordering)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/dot-path.ts (from Task 1 — resolvePath signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/segment.ts (from Task 2 — Segment class)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc @example, short functions, immutability by convention)
  </read_first>
  <behavior>
    - Test 1: `msg.get("PID.5.1")` returns the auto-unescaped component string (delegates to resolvePath).
    - Test 2: `msg.get("NOT.9")` returns `undefined`.
    - Test 3: `msg.getAll("NK1")` on a message with 0 NK1 returns `[]` (exactly empty array, not undefined per MODEL-02).
    - Test 4: `msg.getAll("OBX")` on a message with 3 OBX returns a 3-element `Segment[]`.
    - Test 5: `msg.segments("OBX")` returns the same array reference across two calls (cache hit, D-11).
    - Test 6: `msg.segments("OBX")[0] === msg.segments("OBX")[0]` (individual Segment instances stable).
    - Test 7: `msg.getAll("OBX")` returns the same array as `msg.segments("OBX")` (they are aliases per D-07).
    - Test 8: `msg.allSegments()` returns every segment in document order (MSH first, then PID, EVN, OBX...).
    - Test 9: `msg.allSegments()` is cached — two calls return `===`.
    - Test 10: `msg.allSegments()[0].type === "MSH"` (MSH is always first).
    - Test 11: Constructor init contract unchanged (Phase 2 D-05 lock) — `new Hl7Message({ segments, encodingCharacters, version, warnings })` still works; `msg.warnings` still frozen; `msg.profile === undefined` when profile omitted.
    - Test 12: `src/index.ts` now exports `Segment` and `Field` alongside the existing Phase 2 surface.
  </behavior>
  <action>
**Modify `src/model/message.ts`.** DO NOT reshape the constructor (Phase 2 D-05 lock). Add methods and private cache fields only.

Add imports at the top (after the existing imports):
```typescript
import { resolvePath } from "./dot-path.js";
import { Segment } from "./segment.js";
```

Add private cache fields to the class body (after the existing public readonly fields, before the constructor):
```typescript
  /**
   * Lazily built cache of Segment wrappers keyed by segment type.
   * Plan 04 mutation methods invalidate this per-type (D-17).
   * @internal
   */
  private _segmentsByType: Map<string, Segment[]> | undefined;

  /**
   * Lazily built cache of every segment in document order.
   * Plan 04 mutation methods invalidate this wholesale.
   * @internal
   */
  private _allSegments: Segment[] | undefined;
```

Add the four new public methods AFTER the constructor. Each gets `@example` JSDoc.

```typescript
  /**
   * Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
   * auto-unescaped leaf string. Returns `undefined` when the path doesn't
   * resolve — never throws on missing path (MODEL-05). Throws `TypeError`
   * on malformed path syntax (e.g. `"pid.5"`, empty string).
   *
   * @example
   * ```ts
   * const msg = parseHL7(raw);
   * msg.get("PID.5.1");  // "Smith"
   * msg.get("OBX[2].5"); // third OBX's 5th field
   * msg.get("NOT.9.9");  // undefined
   * msg.get("MSH.12");   // "2.5" — HL7 version string
   * ```
   */
  public get(path: string): string | undefined {
    return resolvePath(path, this.segments, this.encodingCharacters);
  }

  /**
   * Return every `Segment` of `segmentType` in document order. Returns `[]`
   * (empty array, NEVER `undefined`) when no segment of that type exists
   * (MODEL-02). Alias for `this.segments(segmentType)`.
   *
   * @example
   * ```ts
   * for (const obx of msg.getAll("OBX")) {
   *   console.log(obx.field(5).value);
   * }
   * ```
   */
  public getAll(segmentType: string): readonly Segment[] {
    return this.segments(segmentType);
  }

  /**
   * Return the cached array of `Segment` wrappers for `segmentType`.
   * Same array identity across calls (D-11); same `Segment` instance per
   * occurrence. Invalidated by Plan 04 mutation methods.
   *
   * @example
   * ```ts
   * const pid = msg.segments("PID")[0];
   * if (pid !== undefined) console.log(pid.field(5).value);
   * ```
   */
  public segments(segmentType: string): readonly Segment[] {
    if (this._segmentsByType === undefined) {
      this._segmentsByType = new Map();
    }
    const cached = this._segmentsByType.get(segmentType);
    if (cached !== undefined) return cached;
    const built: Segment[] = [];
    for (let i = 0; i < this.segments.length; i++) {
      const raw = this.segments[i];
      if (raw === undefined) continue;
      if (raw.name === segmentType) {
        built.push(new Segment(raw, this.encodingCharacters, i));
      }
    }
    this._segmentsByType.set(segmentType, built);
    return built;
  }
```

**NAMING COLLISION WARNING:** The public readonly field is `this.segments` (a `readonly RawSegment[]`) and the new method is also named `segments`. TypeScript WILL NOT ALLOW a method and field with the same name. Resolution: rename the method parameter approach — the field stays `segments: readonly RawSegment[]`; the method must use a different name OR the field must be renamed. The MODEL-02 spec says `msg.segments('OBX')` — so the method must be named `segments`. Therefore: **rename the existing public readonly field to avoid collision.**

Look at CONTEXT.md D-05 "Phase 2's constructor continues to freeze warnings, but does NOT deep-freeze segments" and re-read `src/model/message.ts` — `this.segments` is the public raw array. The spec uses `msg.segments('OBX')` as a METHOD.

**Decision:** Keep the public method name `segments(type)`. Move the raw array to a new field name `rawSegments` (or expose it via a getter that returns `this._raw`). This is a BREAKING CHANGE to the Phase 2 D-05 shell but is REQUIRED for MODEL-02 semantics.

Re-reading Phase 2 D-05 from `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md`: the shell exposes `public readonly segments: readonly RawSegment[];`. Phase 3 CONTEXT.md §code_context explicitly says "Phase 3 extends this class with `get()`, `getAll()`, `segments()`, `allSegments()`" — which REQUIRES the method. Two options:

**Option A (chosen):** Rename the public field `segments` → `rawSegments`. Add the method `segments(type)`. This is a small breaking change only to the Phase 2 surface which has not yet been consumed by any external code (Phase 2 shipped the parser but no model traversal APIs).

**Option B:** Expose raw segments via a getter that doesn't collide. Problematic because `get segments()` collides the same way.

Apply Option A:
1. Rename the public readonly field from `segments` to `rawSegments`.
2. Update the constructor assignment: `this.rawSegments = init.segments;` (init type still uses `segments: readonly RawSegment[]` for backward compat with Phase 2 code that passes the field).
3. Update `src/parser/index.ts` if it reads `msg.segments` anywhere (grep to verify).
4. Update `src/parser/index.ts::extractVersion` if it consumes `msg.segments` — actually it consumes the raw tree before construction, so it's fine.
5. Search all tests for `msg.segments` usage and migrate to `msg.rawSegments` where the raw tree is wanted (distinct from the new `segments(type)` method).

**Verify with grep before proceeding:**
```bash
grep -rn "msg\.segments" src/ test/
grep -rn "\.segments\b" src/model/ src/parser/
```

Expected: Phase 2 uses `msg.segments` in `src/parser/index.ts` during construction (writes `new Hl7Message({ segments: ... })` — that's the `init.segments` field, not `msg.segments`). Tests may reference `msg.segments` as the raw array; migrate those to `msg.rawSegments`.

Update the `Hl7MessageInit` interface: keep `segments` as the init-time key (parser writes `init.segments = rawSegments`); the class stores it as `this.rawSegments`:

```typescript
export interface Hl7MessageInit {
  readonly segments: readonly RawSegment[];  // init parameter name stays
  readonly encodingCharacters: EncodingCharacters;
  readonly version: string;
  readonly warnings: readonly Hl7ParseWarning[];
  readonly profile?: { readonly name: string; readonly lineage: readonly string[] };
}

export class Hl7Message {
  /** Raw positional tree — use `segments(type)` for typed wrapper access. */
  public readonly rawSegments: readonly RawSegment[];
  // ... other public fields unchanged
  public constructor(init: Hl7MessageInit) {
    this.rawSegments = init.segments;
    // ... rest unchanged
  }

  public segments(segmentType: string): readonly Segment[] { /* ... */ }
}
```

**allSegments method:**
```typescript
  /**
   * Iterate every `Segment` in document order (MSH first, then each subsequent
   * segment). Cached per-message; same array reference on repeat calls (D-11).
   * Invalidated by Plan 04 mutation methods.
   *
   * @example
   * ```ts
   * for (const seg of msg.allSegments()) {
   *   console.log(seg.type);
   * }
   * ```
   */
  public allSegments(): readonly Segment[] {
    if (this._allSegments !== undefined) return this._allSegments;
    const built: Segment[] = [];
    for (let i = 0; i < this.rawSegments.length; i++) {
      const raw = this.rawSegments[i];
      if (raw === undefined) continue;
      built.push(new Segment(raw, this.encodingCharacters, i));
    }
    this._allSegments = built;
    return built;
  }
```

**Referential stability of Segment wrappers across `segments(type)` and `allSegments()`.** D-11 says `msg.segments('OBX')[0] === msg.segments('OBX')[0]`. It does NOT require `msg.segments('OBX')[0] === msg.allSegments().find(s => s.type === 'OBX')` — those can be distinct instances. KEEP IT SIMPLE: each cache builds its own Segment instances. If cross-cache stability is required, it would need a single canonical cache. Document in JSDoc: "Segment wrappers returned by `segments(type)` and `allSegments()` are NOT cross-cache identical — only stable within one cache." Planner note: this is fine for Phase 4 (which only iterates one cache at a time).

Actually — simpler and better: build a single master cache keyed by segment type AND a master cache for allSegments, but have `segments(type)` build from `allSegments()` by filtering:

```typescript
  public segments(segmentType: string): readonly Segment[] {
    if (this._segmentsByType === undefined) this._segmentsByType = new Map();
    const cached = this._segmentsByType.get(segmentType);
    if (cached !== undefined) return cached;
    const all = this.allSegments();  // builds master cache if needed
    const filtered = all.filter((s) => s.type === segmentType);
    this._segmentsByType.set(segmentType, filtered);
    return filtered;
  }
```

This gives cross-cache identity for free and simplifies Plan 04's invalidation (just drop both caches). **Use this approach.**

**Modify `src/index.ts`.** Add new exports after the existing Phase 2 barrel (preserve existing ordering). Insert:
```typescript
// Phase 3 structural model — read-path foundation.
export { Segment } from "./model/segment.js";
export { Field } from "./model/field.js";
export { parsePath, resolvePath } from "./model/dot-path.js";
export type { DotPath } from "./model/dot-path.js";
```

Do NOT add composite exports — Plans 02/03/04 handle those.

**Test file `test/model-message.test.ts` EXTENSIONS** — do NOT rewrite the Phase 2 tests. Instead, create `test/model-traversal.test.ts` with the 12 new behaviors:

```typescript
import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "PID|||123|ALT||Smith\\F\\Jr^Jane\r" +
  "OBX|1|TX|GLUC|1|120|mg/dL\r" +
  "OBX|2|TX|HGB|2|14.0|g/dL\r" +
  "OBX|3|TX|PLT|3|200|K/uL";

describe("model/message: traversal methods", () => {
  it("msg.get resolves dot-paths (delegates to resolvePath)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.get("PID.5.1")).toBe("Smith|Jr");
  });

  it("msg.get returns undefined for missing path", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.get("NOT.9")).toBeUndefined();
  });

  it("msg.getAll returns [] when no segment of that type exists", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.getAll("NK1")).toEqual([]);
  });

  it("msg.getAll returns all segments of that type in document order", () => {
    const msg = parseHL7(FIXTURE);
    const obx = msg.getAll("OBX");
    expect(obx).toHaveLength(3);
    expect(obx[0]?.field(3).value).toBe("GLUC");
    expect(obx[1]?.field(3).value).toBe("HGB");
    expect(obx[2]?.field(3).value).toBe("PLT");
  });

  it("msg.segments is cached — same array reference across calls (D-11)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.segments("OBX")).toBe(msg.segments("OBX"));
  });

  it("individual Segment instances are stable", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.segments("OBX")[0]).toBe(msg.segments("OBX")[0]);
  });

  it("getAll and segments return the same array reference", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.getAll("OBX")).toBe(msg.segments("OBX"));
  });

  it("msg.allSegments returns every segment in document order", () => {
    const msg = parseHL7(FIXTURE);
    const all = msg.allSegments();
    expect(all).toHaveLength(5);
    expect(all[0]?.type).toBe("MSH");
    expect(all[1]?.type).toBe("PID");
    expect(all[2]?.type).toBe("OBX");
  });

  it("msg.allSegments is cached", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.allSegments()).toBe(msg.allSegments());
  });

  it("Segment wrappers are stable across segments() and allSegments() caches", () => {
    const msg = parseHL7(FIXTURE);
    const fromSegments = msg.segments("OBX")[0];
    const fromAll = msg.allSegments().find((s) => s.type === "OBX");
    expect(fromSegments).toBe(fromAll);
  });

  it("warnings remain frozen after traversal", () => {
    const msg = parseHL7(FIXTURE);
    msg.get("PID.5.1");
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });

  it("rawSegments is still accessible for direct tree access", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.rawSegments).toBeDefined();
    expect(msg.rawSegments.length).toBe(5);
  });
});
```

**MIGRATION WORK:** Grep for `msg.segments` in existing tests and rewrite any raw-tree consumers to `msg.rawSegments`:

```bash
grep -rn "msg\.segments\[" test/  # direct array access → must migrate
grep -rn "\.segments\.length" test/  # length access on raw tree → migrate
grep -rn "\.segments\.\(find\|map\|filter\|forEach\)" test/  # iteration → migrate to rawSegments OR allSegments()
```

Migrate each hit: raw-tree consumers (indexed/length/iteration) → `msg.rawSegments`. After migration, `pnpm test` must stay green.

  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/message.ts src/index.ts test/model-traversal.test.ts --max-warnings=0 && pnpm test -- --run "model-traversal|model-message"</automated>
  </verify>
  <acceptance_criteria>
    - `Hl7Message` has `get`, `getAll`, `segments`, `allSegments` methods: `grep -cE "public (get|getAll|segments|allSegments)\\(" src/model/message.ts` returns >= 4.
    - `Hl7Message` has private wrapper caches: `grep -cE "_segmentsByType|_allSegments" src/model/message.ts` returns >= 4 (declarations + usages).
    - `msg.get` delegates to resolvePath: `grep -cE "return resolvePath\\(" src/model/message.ts` returns 1.
    - Constructor shape preserved (Hl7MessageInit.segments still the init key): `grep -cE "this\\.rawSegments = init\\.segments" src/model/message.ts` returns 1.
    - Public field renamed to rawSegments: `grep -cE "public readonly rawSegments" src/model/message.ts` returns 1.
    - `src/index.ts` exports Segment, Field, parsePath, resolvePath, DotPath: `grep -cE "export \\{ Segment|export \\{ Field|export \\{ parsePath|export type \\{ DotPath" src/index.ts` returns >= 3.
    - No `any`, no `console.*`: `grep -cE "(: any(\\s|,|\\))|<any>|console\\.)" src/model/message.ts` returns 0.
    - @example on all 4 new methods: `awk '/@example/{c++} END{print c}' src/model/message.ts` prints >= 4 (existing Hl7Message class example + 4 new method examples; ≥ 5 is fine).
    - Test file `test/model-traversal.test.ts` exists with >= 12 `it(` blocks.
    - No orphan `msg.segments\[` in tests: `grep -rnE "msg\\.segments\\[" test/` returns nothing (or only consumers of the new `segments(type)` method).
    - `pnpm typecheck` exits 0.
    - `pnpm lint ... --max-warnings=0` exits 0.
    - `pnpm test` exits 0 with every existing Phase 2 test still passing AND all new Phase 3 traversal tests passing.
  </acceptance_criteria>
  <done>`Hl7Message` gains `get`/`getAll`/`segments`/`allSegments` with shared wrapper caches. Public raw tree renamed to `rawSegments` (migration done across tests). `src/index.ts` re-exports `Segment`, `Field`, `parsePath`, `resolvePath`, `DotPath`. All 12 traversal tests pass; all pre-existing tests still green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user-supplied dot-path string → parsePath | Caller-controlled string; must bound the scanner to O(n) and never recurse or run unbounded regex. |
| raw segment tree → resolvePath walk | Parser-produced tree with readonly arrays; safe to walk with `noUncheckedIndexedAccess` guards. |
| leaf subcomponent → unescape | Already-audited (Phase 2 Plan 04 threat model) — linear O(n), no recursion. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01-01 | Denial of Service | `parsePath` scanner | mitigate | Linear left-to-right scan with explicit `i++` advance and a bounded-depth check (max 3 dots after segment = 4 levels). No regex alternation on the full path. Per-token regexes (segment name, digits) are anchored and bounded. |
| T-03-01-02 | Denial of Service | `segments(type)` cache | mitigate | Cache is a `Map<string, Segment[]>` keyed by segment type (3 chars). Cache size bounded by the number of distinct segment types (~20 for realistic messages). Memory cost O(number-of-segments). |
| T-03-01-03 | Information Disclosure | `msg.get` surfaces raw parsed content | accept | Parser already handled escape/charset normalization in Phase 2. Phase 3 only returns what the parser produced. Consumer is responsible for sanitizing before rendering into any external sink (HTML, SQL, shell). Not a Phase 3 concern. |
| T-03-01-04 | Tampering | Segment/Field wrapper cache staleness after external raw-tree mutation | accept | The wrappers hold references to `raw.fields` / `raw.repetitions`. External mutation of those arrays (outside Plan 04's supported methods) is documented as unsupported (CONTEXT.md §Specifics §MODEL-06 "immutable by convention, not by freeze"). Plan 04 mutations invalidate caches explicitly. |
| T-03-01-05 | Elevation of Privilege | `parsePath` throws on malformed input; caller may catch and retry | accept | `parsePath` throws `TypeError` with the offending path string in the message. Callers (e.g. user code) can catch and handle; no privilege boundary crossed. |
</threat_model>

<verification>
Run after all three tasks:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run
pnpm build
```

All four exit 0. `dist/` contains new `Segment`, `Field`, `parsePath`, `resolvePath` exports; `dist/index.d.ts` carries `@example` blocks preserved through tsup.
</verification>

<success_criteria>
- `src/model/dot-path.ts`, `src/model/segment.ts`, `src/model/field.ts` exist with full JSDoc + `@example` blocks.
- `src/model/message.ts` extended with 4 traversal methods + wrapper caches; `rawSegments` exposed for raw-tree access; constructor contract preserved (Phase 2 D-05).
- `src/index.ts` barrel updated with 5 new exports (`Segment`, `Field`, `parsePath`, `resolvePath`, `DotPath`).
- 5 REQ-IDs demonstrated: MODEL-01 (`msg.get('PID.5.1')`, `OBX[2].5`), MODEL-02 (`msg.getAll('NK1')` returns `[]`), MODEL-03 (`Segment.field(n)`, `Field.repetitions`), MODEL-04 (`msg.allSegments()` in document order), MODEL-05 (every missing path returns `undefined`/`[]`, never throws except on malformed `parsePath` input).
- All 10 CONTEXT.md §Specific Ideas acceptance paths pass in `test/model-dotpath.test.ts`.
- Zero overlap with Plans 02/03/04 (composite parsers, mutation, HL7 namespace export).
- Zero lint warnings; zero typecheck errors; zero Phase 2 test regressions.
</success_criteria>

<output>
After completion, create `.planning/phases/03-structural-model-and-types/03-01-SUMMARY.md` describing:
- What shipped: 3 new source files (dot-path, segment, field), 1 modified (message), 1 modified (index barrel), 3 new test files.
- REQ-IDs closed: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05.
- Decisions applied: D-01 (0-indexed `[N]`), D-02 (1-indexed dots), D-03 (auto-unescape at leaf), D-04 (depth-collapse), D-05 (MSH.1/MSH.2 via Phase 2 tokenize placement), D-06 (`string | undefined` leaf), D-07 (`getAll === segments`), D-11/D-12 (cached wrappers).
- Migration note: Phase 2's public `msg.segments: readonly RawSegment[]` field renamed to `msg.rawSegments` to make room for the `segments(type)` method.
- Notes for Plan 02/03: `Field` exposes `raw: RawField`, `enc: EncodingCharacters`, `repetitions: readonly RawRepetition[]`, and `position: Hl7Position`. Composite parsers take `(rep: RawRepetition, enc: EncodingCharacters)`; they are WIRED onto `Field` in Plan 04.
- Notes for Plan 04: Private caches `_segmentsByType` (Map) and `_allSegments` (array) are invalidated wholesale on any mutation. `segments(type)` builds from `allSegments()` so dropping `_allSegments` invalidates everything.
</output>
