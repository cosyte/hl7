---
phase: 02-core-parser-and-tolerance
plan: 03
type: execute
wave: 2
depends_on: [02-PLAN-01]
files_modified:
  - src/parser/segments.ts
  - src/parser/delimiters.ts
  - src/parser/tokenize.ts
  - test/parser-segments.test.ts
  - test/parser-delimiters.test.ts
  - test/parser-tokenize.test.ts
autonomous: true
requirements: [PARSE-02, PARSE-04, PARSE-05, PARSE-06, TOL-07]

must_haves:
  truths:
    - "A developer calling `splitSegments(normalized)` receives an ordered readonly array of segment strings — one entry per segment — with no empty entries from a trailing `\\r`."
    - "A developer calling `readDelimiters(firstSegment)` on a valid MSH receives the 5 encoding characters (field/component/repetition/escape/subcomponent) even when MSH-1 / MSH-2 differ from HL7 defaults."
    - "A developer calling `readDelimiters` on input that does not start with `MSH`, or on a truncated MSH, or on MSH-2 that is not 4 distinct non-whitespace chars, receives `Hl7ParseError` with `code` matching `NO_MSH_SEGMENT` | `MSH_TOO_SHORT` | `INVALID_ENCODING_CHARACTERS`."
    - "A developer calling `tokenize(segments, enc, emit, trimFields)` receives an ordered tree of `RawSegment` → `RawField` → `RawRepetition` → `RawComponent` → string subcomponents honoring custom delimiters from MSH."
    - "A developer passing `||` (empty field) vs `\"\"` (null field) receives different `RawField` states: `isNull: false, repetitions: []` for empty vs `isNull: true, repetitions: []` for explicit null."
    - "A developer parsing segments with leading/trailing whitespace around field values receives trimmed values (when `trimFields` is true) plus a `FIELD_WHITESPACE_TRIMMED` warning per affected field."
  artifacts:
    - path: "src/parser/segments.ts"
      provides: "Segment split (normalized input → RawSegment-name-prefixed strings)"
      exports: ["splitSegments"]
    - path: "src/parser/delimiters.ts"
      provides: "MSH-1/MSH-2 delimiter discovery + Tier-3 fatal checks"
      exports: ["readDelimiters", "DEFAULT_ENCODING_CHARACTERS"]
    - path: "src/parser/tokenize.ts"
      provides: "Field/repetition/component/subcomponent decomposition + FIELD_WHITESPACE_TRIMMED emission"
      exports: ["tokenize"]
  key_links:
    - from: "src/parser/delimiters.ts"
      to: "src/parser/errors.ts"
      via: "throws Hl7ParseError with codes NO_MSH_SEGMENT / MSH_TOO_SHORT / INVALID_ENCODING_CHARACTERS"
      pattern: "new Hl7ParseError\\(.*(NO_MSH_SEGMENT|MSH_TOO_SHORT|INVALID_ENCODING_CHARACTERS)"
    - from: "src/parser/tokenize.ts"
      to: "src/parser/warnings.ts"
      via: "calls fieldWhitespaceTrimmed when trimming removes non-trivial whitespace"
      pattern: "fieldWhitespaceTrimmed\\("
    - from: "src/parser/tokenize.ts"
      to: "src/parser/types.ts"
      via: "consumes EncodingCharacters; produces RawSegment/RawField/RawRepetition/RawComponent"
      pattern: "from \"./types.js\""
---

<objective>
Ship the core tokenizer pipeline: segment splitting, MSH delimiter discovery (with 3 of 4 Tier-3 fatals), and field/repetition/component/subcomponent decomposition (honoring custom delimiters + empty-vs-null semantics + optional whitespace trimming).

Purpose: This is where HL7's actual structure emerges. After Plan 03, `{segments, enc}` can be transformed into the `RawSegment[]` tree that `Hl7Message` holds. Plan 06 composes `normalize` → `stripMllp` → `splitSegments` → `readDelimiters` → `tokenize` → construct `Hl7Message`.

Output:
- `src/parser/segments.ts` — `splitSegments(normalized: string): readonly string[]`.
- `src/parser/delimiters.ts` — `readDelimiters(firstSegment: string): EncodingCharacters` throwing `Hl7ParseError` on the three Tier-3 structural failures. `DEFAULT_ENCODING_CHARACTERS` const for Plan 04/06 re-use.
- `src/parser/tokenize.ts` — `tokenize(segments, enc, emit, trimFields): readonly RawSegment[]` producing the nested positional tree.
- Three test files covering happy paths, custom-delimiter paths, empty-vs-null distinction, whitespace trim + warning, and all three fatal code paths.
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

<interfaces>
<!-- Produced by Plan 01 (Wave 1). Consumed by this plan. -->

From src/parser/types.ts:
```typescript
export interface EncodingCharacters {
  readonly field: string;
  readonly component: string;
  readonly repetition: string;
  readonly escape: string;
  readonly subcomponent: string;
}
export interface RawComponent { readonly subcomponents: readonly string[]; }
export interface RawRepetition { readonly components: readonly RawComponent[]; }
export interface RawField { readonly repetitions: readonly RawRepetition[]; readonly isNull: boolean; }
export interface RawSegment { readonly name: string; readonly fields: readonly RawField[]; }
export interface Hl7Position { readonly segmentIndex: number; readonly fieldIndex?: number; ... }
```

From src/parser/warnings.ts:
```typescript
export function fieldWhitespaceTrimmed(position: Hl7Position, original: string, trimmed: string): Hl7ParseWarning;
```

From src/parser/errors.ts:
```typescript
export const FATAL_CODES = { NO_MSH_SEGMENT, MSH_TOO_SHORT, INVALID_ENCODING_CHARACTERS, EMPTY_INPUT } as const;
export class Hl7ParseError extends Error { public constructor(code: FatalCode, message: string, position: Hl7Position, snippet: string); }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/parser/segments.ts and src/parser/delimiters.ts</name>
  <files>src/parser/segments.ts, src/parser/delimiters.ts, test/parser-segments.test.ts, test/parser-delimiters.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-02 file list, D-04 position-tracking scope — no line/column; fatal errors carry position + snippet)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (sections: "src/parser/segments.ts", "src/parser/delimiters.ts" — note the 3 fatal paths spelled out)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (PARSE-02 custom delimiters from MSH-1/MSH-2, PARSE-04 preserve segment order, TOL-02 fatal error shape)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts (Hl7ParseError + FATAL_CODES)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (EncodingCharacters)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (short testable functions; no console; no any)
  </read_first>
  <behavior>
    - Seg test 1: `splitSegments("MSH|A\rPID|1\rZPI|z")` returns `["MSH|A", "PID|1", "ZPI|z"]` (3 segments, order preserved).
    - Seg test 2: `splitSegments("MSH|A\rPID|1\r")` (trailing `\r`) drops the empty final segment — returns 2 entries.
    - Seg test 3: `splitSegments("MSH|A")` (no `\r` at all) returns a single-entry array.
    - Seg test 4: `splitSegments("MSH|A\r\rPID|1")` (empty middle segment from `\r\r`) — preserves the empty string in the middle so position indexes stay stable (matches HL7 spec semantics per PARSE-04).
    - Del test 1: `readDelimiters("MSH|^~\\&|APP|FAC|...")` returns `{ field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" }`.
    - Del test 2: `readDelimiters("MSH#$%*@|APP|...")` with custom encoding chars — field separator `#`, encoding chars `$%*@` — returns the custom 5-tuple correctly.
    - Del test 3: `readDelimiters("PID|123")` (doesn't start with MSH) throws `Hl7ParseError` with `code === "NO_MSH_SEGMENT"`.
    - Del test 4: `readDelimiters("MSH|^")` (fewer than 8 chars, cannot contain the full encoding-characters field) throws `Hl7ParseError` with `code === "MSH_TOO_SHORT"`.
    - Del test 5: `readDelimiters("MSH|^^^^|APP")` (MSH-2 not 4 distinct chars) throws `Hl7ParseError` with `code === "INVALID_ENCODING_CHARACTERS"`.
    - Del test 6: `readDelimiters("MSH| abc|APP")` (field separator is whitespace) throws `Hl7ParseError` with `code === "INVALID_ENCODING_CHARACTERS"`.
    - Del test 7: Returned `Hl7ParseError` instances have `position.segmentIndex === 0` and a non-empty `snippet` of the first segment.
    - Del test 8: `DEFAULT_ENCODING_CHARACTERS` constant exists and equals `{ field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" }`.
  </behavior>
  <action>
**Step 1: `src/parser/segments.ts`.**

File-level JSDoc: plain prose NOT starting with `@`.

```typescript
import type { Hl7Position } from "./types.js";

/**
 * Splits a normalized (line-ending=`\r`) HL7 input string into an ordered
 * array of segment strings. Preserves original order including repeated,
 * empty, and Z-segments. A trailing `\r` does NOT create a final empty
 * segment; a MIDDLE empty segment (two consecutive `\r`) IS preserved so
 * that downstream segmentIndex positions stay stable.
 *
 * @example
 * ```ts
 * import { splitSegments } from "@cosyte/hl7-parser";
 * splitSegments("MSH|A\rPID|1\r"); // ["MSH|A", "PID|1"]
 * ```
 */
export function splitSegments(normalized: string): readonly string[] {
  // Strip a single trailing \r only (preserves middle empty segments).
  const trimmed = normalized.endsWith("\r") ? normalized.slice(0, -1) : normalized;
  if (trimmed.length === 0) return [];
  return trimmed.split("\r");
}
```

Note: `splitSegments` does NOT check for `MSH` — delimiter validation is delimiter.ts's job. `splitSegments` is purely mechanical.

Position helper (un-exported) if needed for delimiters.ts's snippet:
```typescript
/** Build a short snippet of a segment (first 40 chars) for error context. @internal */
export function snippet(segment: string): string {
  return segment.length > 40 ? segment.slice(0, 40) + "…" : segment;
}
```
Export this `snippet` helper so delimiters.ts and Plan 06 can re-use it (avoids reimplementation drift).

Update export list: `splitSegments`, `snippet`.

**Step 2: `src/parser/delimiters.ts`.**

File-level JSDoc: plain prose.

```typescript
import { FATAL_CODES, Hl7ParseError } from "./errors.js";
import { snippet } from "./segments.js";
import type { EncodingCharacters } from "./types.js";

export const DEFAULT_ENCODING_CHARACTERS: EncodingCharacters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

export function readDelimiters(firstSegment: string): EncodingCharacters {
  const fatalPosition = { segmentIndex: 0 };
  const snip = snippet(firstSegment);

  // Must start with "MSH"
  if (firstSegment.length < 3 || firstSegment.slice(0, 3) !== "MSH") {
    throw new Hl7ParseError(
      FATAL_CODES.NO_MSH_SEGMENT,
      "First segment is not MSH — HL7 v2 messages must begin with an MSH segment.",
      fatalPosition,
      snip,
    );
  }

  // Need at least "MSH" + field separator + 4 encoding chars = 8 chars total
  if (firstSegment.length < 8) {
    throw new Hl7ParseError(
      FATAL_CODES.MSH_TOO_SHORT,
      "MSH segment is truncated — cannot read encoding characters.",
      fatalPosition,
      snip,
    );
  }

  const field = firstSegment.charAt(3); // MSH-1 (the field separator, character after "MSH")
  const encodingField = firstSegment.slice(4, 8); // MSH-2

  // Field separator must be non-whitespace
  if (/\s/u.test(field)) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-1 field separator is whitespace — refusing to parse.",
      fatalPosition,
      snip,
    );
  }

  // Encoding chars must be 4 distinct non-whitespace chars
  const chars = [...encodingField];
  if (chars.length !== 4) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      `MSH-2 encoding characters must be exactly 4 characters (got ${chars.length.toString()}).`,
      fatalPosition,
      snip,
    );
  }
  if (new Set(chars).size !== 4) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-2 encoding characters must be 4 DISTINCT characters.",
      fatalPosition,
      snip,
    );
  }
  if (chars.some((c) => /\s/u.test(c))) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-2 encoding characters must not contain whitespace.",
      fatalPosition,
      snip,
    );
  }

  // Also forbid the field separator from appearing in the encoding chars
  if (chars.includes(field)) {
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "Field separator must not appear among the MSH-2 encoding characters.",
      fatalPosition,
      snip,
    );
  }

  // chars[0] is guaranteed defined because we checked length === 4;
  // noUncheckedIndexedAccess still requires explicit guards for tsc.
  const component = chars[0];
  const repetition = chars[1];
  const escape = chars[2];
  const sub = chars[3];
  if (component === undefined || repetition === undefined || escape === undefined || sub === undefined) {
    // Structurally unreachable given the length check above, but the type narrows correctly.
    throw new Hl7ParseError(
      FATAL_CODES.INVALID_ENCODING_CHARACTERS,
      "MSH-2 encoding characters could not be read.",
      fatalPosition,
      snip,
    );
  }

  return { field, component, repetition, escape, subcomponent: sub };
}
```

JSDoc blocks with `@example` on `readDelimiters` and `DEFAULT_ENCODING_CHARACTERS`.

**Step 3: Tests.**

`test/parser-segments.test.ts` (4 cases):

```typescript
import { describe, expect, it } from "vitest";

import { splitSegments, snippet } from "../src/parser/segments.js";

describe("parser/segments: splitSegments", () => {
  it("splits on \\r and preserves order", () => {
    expect(splitSegments("MSH|A\rPID|1\rZPI|z")).toEqual(["MSH|A", "PID|1", "ZPI|z"]);
  });

  it("drops a trailing \\r without creating an empty final segment", () => {
    expect(splitSegments("MSH|A\rPID|1\r")).toEqual(["MSH|A", "PID|1"]);
  });

  it("returns a single entry when input has no \\r", () => {
    expect(splitSegments("MSH|A")).toEqual(["MSH|A"]);
  });

  it("preserves an empty middle segment between consecutive \\r", () => {
    expect(splitSegments("MSH|A\r\rPID|1")).toEqual(["MSH|A", "", "PID|1"]);
  });

  it("snippet truncates long segment strings with an ellipsis", () => {
    const s = snippet("M".repeat(50));
    expect(s.length).toBeLessThanOrEqual(41);
    expect(s.endsWith("…")).toBe(true);
  });
});
```

`test/parser-delimiters.test.ts` (8 cases):

```typescript
import { describe, expect, it } from "vitest";

import { readDelimiters, DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import { Hl7ParseError } from "../src/parser/errors.js";

describe("parser/delimiters: readDelimiters", () => {
  it("reads default HL7 encoding characters from a standard MSH", () => {
    const enc = readDelimiters("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5");
    expect(enc).toEqual({ field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" });
  });

  it("reads custom encoding characters from a non-standard MSH", () => {
    const enc = readDelimiters("MSH#$%*@|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5");
    expect(enc).toEqual({ field: "#", component: "$", repetition: "%", escape: "*", subcomponent: "@" });
  });

  it("throws NO_MSH_SEGMENT when the first segment is not MSH", () => {
    try {
      readDelimiters("PID|123");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) expect(err.code).toBe("NO_MSH_SEGMENT");
    }
  });

  it("throws MSH_TOO_SHORT when the MSH segment has fewer than 8 chars", () => {
    try {
      readDelimiters("MSH|^");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) expect(err.code).toBe("MSH_TOO_SHORT");
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when MSH-2 has duplicate chars", () => {
    try {
      readDelimiters("MSH|^^^^|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS when MSH-1 is whitespace", () => {
    try {
      readDelimiters("MSH abc|APP");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) expect(err.code).toBe("INVALID_ENCODING_CHARACTERS");
    }
  });

  it("fatal errors carry segmentIndex=0 and a non-empty snippet", () => {
    try {
      readDelimiters("PID|123");
    } catch (err) {
      if (err instanceof Hl7ParseError) {
        expect(err.position.segmentIndex).toBe(0);
        expect(err.snippet.length).toBeGreaterThan(0);
      }
    }
  });

  it("DEFAULT_ENCODING_CHARACTERS is the HL7 default 5-tuple", () => {
    expect(DEFAULT_ENCODING_CHARACTERS).toEqual({ field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" });
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/segments.ts src/parser/delimiters.ts test/parser-segments.test.ts test/parser-delimiters.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-segments parser-delimiters</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/segments.ts` exports `splitSegments` and `snippet` — verify `grep -E "^export function" src/parser/segments.ts | wc -l` returns 2.
    - File `src/parser/delimiters.ts` exports `readDelimiters` and `DEFAULT_ENCODING_CHARACTERS` — verify `grep -E "^export (function|const)" src/parser/delimiters.ts | wc -l` returns 2.
    - `delimiters.ts` throws all three fatal codes — verify `grep -cE "FATAL_CODES.(NO_MSH_SEGMENT|MSH_TOO_SHORT|INVALID_ENCODING_CHARACTERS)" src/parser/delimiters.ts` >= 3.
    - File-level JSDocs do NOT start with `@` — verify: `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/parser/segments.ts src/parser/delimiters.ts` prints nothing.
    - All public exports have `@example` blocks — `grep -c "@example" src/parser/segments.ts` >= 2 AND `grep -c "@example" src/parser/delimiters.ts` >= 2.
    - No `console.*` in either file — `grep -cE "console\\." src/parser/segments.ts src/parser/delimiters.ts` returns 0.
    - `pnpm typecheck`, `pnpm lint ... --max-warnings=0`, `pnpm test -- --run parser-segments parser-delimiters` all exit 0 with >= 12 passing cases.
  </acceptance_criteria>
  <done>Segment split + delimiter discovery shipped. 12+ tests pass. All three Tier-3 fatal paths covered (NO_MSH_SEGMENT, MSH_TOO_SHORT, INVALID_ENCODING_CHARACTERS).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create src/parser/tokenize.ts (field/rep/component/subcomponent decomposition + whitespace trim)</name>
  <files>src/parser/tokenize.ts, test/parser-tokenize.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-06 ParseOptions defaults — trimFields default true; D-09/D-10 emit warnings via callback)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (section: "src/parser/tokenize.ts" — RawSegment/RawField/RawRepetition/RawComponent sketch; noUncheckedIndexedAccess gotcha)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (PARSE-02, PARSE-04, PARSE-05, PARSE-06, TOL-07 full text)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (EncodingCharacters, Raw* tree, Hl7Position)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (fieldWhitespaceTrimmed factory)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (short testable functions; immutable by default)
  </read_first>
  <behavior>
    - Test 1: Standard `tokenize(["MSH|^~\\&|APP|FAC", "PID|1||X^Y^Z"], DEFAULT_ENCODING_CHARACTERS, emit, true)` returns `[{ name: "MSH", fields: [...] }, { name: "PID", fields: [...] }]` with correct hierarchy.
    - Test 2: Unified HL7 1-indexed convention — `fields[0]` is the segment name / separator placeholder slot for ALL segments. MSH: `fields[0]` = single-component "|" (just the field-separator char), `fields[1]` = MSH-2 (encoding chars), `fields[2]` = MSH-3, ..., `fields[11]` = MSH-12. Non-MSH (PID, EVN, ZPI, ...): `fields[0]` = single-component segment-name string (e.g. "PID"), `fields[1]` = PID-1, `fields[2]` = PID-2, .... Document this convention clearly in the JSDoc and in the SUMMARY so Phase 4's `msg.meta` and Plan 06's `extractVersion` build on the same convention.
    - Test 3: Repetition splits — `"A~B~C"` as a field value produces a `RawField` with 3 repetitions, each with 1 component "A"/"B"/"C".
    - Test 4: Component splits — `"X^Y^Z"` produces 1 repetition with 3 components "X"/"Y"/"Z", each with 1 subcomponent.
    - Test 5: Subcomponent splits — `"X&Y&Z"` produces 1 component with 3 subcomponents.
    - Test 6: Empty field (`||`) produces `RawField { repetitions: [], isNull: false }`.
    - Test 7: Null field (`""`) produces `RawField { repetitions: [], isNull: true }`.
    - Test 8: Custom delimiters — `tokenize(["MSH#$%*@|APP", "PID#1##$%"], { field: "#", component: "$", repetition: "%", escape: "*", subcomponent: "@" }, emit, true)` honors the custom separators.
    - Test 9: `FIELD_WHITESPACE_TRIMMED` warning is emitted when `trimFields=true` and a field value had leading/trailing whitespace around non-whitespace content (`"  hi  "` → `"hi"`). NOT emitted when the field is all-whitespace or when trimming removes nothing.
    - Test 10: `trimFields=false` leaves whitespace intact and emits no trim warnings.
    - Test 11: Segment names preserve case — `"pid|1"` yields `RawSegment.name === "pid"` (the SEGMENT_CASE warning is Plan 06's job to evaluate; tokenize just produces data).
  </behavior>
  <action>
Create `src/parser/tokenize.ts`.

File-level JSDoc: plain prose NOT starting with `@`.

Imports:
```typescript
import { fieldWhitespaceTrimmed } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "./types.js";
```

Core function:

```typescript
export function tokenize(
  segments: readonly string[],
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  trimFields: boolean,
): readonly RawSegment[] {
  const out: RawSegment[] = [];
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const segStr = segments[sIdx];
    if (segStr === undefined) continue; // noUncheckedIndexedAccess guard

    // Empty middle segment (from consecutive \r) — preserve as empty-named segment
    if (segStr.length === 0) {
      out.push({ name: "", fields: [] });
      continue;
    }

    // Segment name is the first chunk before enc.field (or the whole thing if no separator).
    const firstSepIdx = segStr.indexOf(enc.field);
    const name = firstSepIdx === -1 ? segStr : segStr.slice(0, firstSepIdx);
    const rest = firstSepIdx === -1 ? "" : segStr.slice(firstSepIdx + 1);

    if (name === "MSH") {
      out.push(tokenizeMshSegment(segStr, enc, emit, sIdx, trimFields));
    } else {
      // Unified HL7 1-indexed convention: fields[0] is the segment-name
      // placeholder slot (never a data field). PID-1 therefore lands at
      // fields[1], PID-2 at fields[2], and so on. This mirrors MSH's
      // fields[0] = field-separator-placeholder shape so all downstream
      // code (tests, extractVersion, Phase 3 traversal) can use the same
      // indexing scheme regardless of segment type.
      const namePlaceholder: RawField = {
        repetitions: [{ components: [{ subcomponents: [name] }] }],
        isNull: false,
      };
      const dataFields = rest.length === 0 ? [] : splitAndTokenizeFields(rest, enc, emit, sIdx, 0, trimFields);
      out.push({ name, fields: [namePlaceholder, ...dataFields] });
    }
  }
  return out;
}
```

Helpers (all un-exported):

```typescript
/**
 * MSH is special only in that MSH-1 is the field-separator character itself
 * (encoded in-band) rather than data following the first separator. We
 * synthesize `fields[0]` = single-component holding the separator char, and
 * `fields[1]` = single-component holding the MSH-2 encoding-chars string.
 * The remaining MSH-3.. tail fields are parsed by `splitAndTokenizeFields`
 * with `fieldStartOffset = 2` so warning positions use the HL7 1-indexed
 * fieldIndex (MSH-3 emits fieldIndex = 3). This keeps MSH's `fields`
 * layout identical in shape to every other segment's fields layout under
 * the unified 1-indexed convention: fields[0] is the name/separator
 * placeholder slot, fields[N] for N ≥ 1 is the HL7 N-th field.
 * @internal
 */
function tokenizeMshSegment(
  segStr: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  sIdx: number,
  trimFields: boolean,
): RawSegment {
  // segStr = "MSH|^~\&|APP|FAC|...";
  //           ^^^ name
  //              ^ MSH-1 = the field separator itself
  //               ^^^^ MSH-2 = the encoding-chars string
  //                    ^ separator before MSH-3
  //                     ^^^ MSH-3 and onward
  const msh1 = { repetitions: [{ components: [{ subcomponents: [enc.field] }] }], isNull: false } as const satisfies RawField;
  const msh2Raw = segStr.slice(4, segStr.indexOf(enc.field, 4) === -1 ? segStr.length : segStr.indexOf(enc.field, 4));
  const msh2: RawField = { repetitions: [{ components: [{ subcomponents: [msh2Raw] }] }], isNull: false };

  // Everything after the MSH-2 field boundary is standard pipe-separated field data.
  const sepAfterMsh2 = segStr.indexOf(enc.field, 4);
  const remainder = sepAfterMsh2 === -1 ? "" : segStr.slice(sepAfterMsh2 + 1);
  const tailFields = remainder.length === 0 ? [] : splitAndTokenizeFields(remainder, enc, emit, sIdx, 2, trimFields);
  return { name: "MSH", fields: [msh1, msh2, ...tailFields] };
}

/**
 * Splits a segment's field region into RawField objects. Warning positions
 * use HL7 1-indexed fieldIndex: for non-MSH segments the caller passes
 * `fieldStartOffset = 0` so the first data field (e.g. PID-1) emits
 * `fieldIndex: 1`. For MSH tail fields the caller passes
 * `fieldStartOffset = 2` so the first tail field (MSH-3) emits
 * `fieldIndex: 3`.
 *
 * The returned `RawField[]` is the DATA-ONLY slice; the caller is
 * responsible for prepending the fields[0] name/separator placeholder so
 * the unified 1-indexed convention holds on the final `RawSegment.fields`.
 * @internal
 */
function splitAndTokenizeFields(
  region: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  sIdx: number,
  fieldStartOffset: number,
  trimFields: boolean,
): RawField[] {
  const fields = region.split(enc.field);
  const out: RawField[] = [];
  for (let fIdx = 0; fIdx < fields.length; fIdx++) {
    const raw = fields[fIdx];
    if (raw === undefined) continue;
    // HL7 1-indexed fieldIndex: for non-MSH callers fieldStartOffset is 0,
    // so the first field (PID-1) emits fieldIndex = 1. For MSH tail callers
    // fieldStartOffset is 2, so the first tail field (MSH-3) emits fieldIndex = 3.
    out.push(tokenizeField(raw, enc, emit, { segmentIndex: sIdx, fieldIndex: fieldStartOffset + fIdx + 1 }, trimFields));
  }
  return out;
}

/** @internal */
function tokenizeField(
  raw: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
  trimFields: boolean,
): RawField {
  if (raw === "") return { repetitions: [], isNull: false };
  if (raw === '""') return { repetitions: [], isNull: true };

  // Whitespace trim (TOL-07) — only emit when non-whitespace existed around the value
  let value = raw;
  if (trimFields) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && trimmed !== raw) {
      emit(fieldWhitespaceTrimmed(position, raw, trimmed));
      value = trimmed;
    }
  }

  // Repetition split
  const reps = value.split(enc.repetition);
  const repetitions: RawRepetition[] = [];
  for (const rep of reps) {
    repetitions.push(tokenizeRepetition(rep, enc));
  }
  return { repetitions, isNull: false };
}

/** @internal */
function tokenizeRepetition(raw: string, enc: EncodingCharacters): RawRepetition {
  const comps = raw.split(enc.component);
  const components: RawComponent[] = [];
  for (const c of comps) components.push(tokenizeComponent(c, enc));
  return { components };
}

/** @internal */
function tokenizeComponent(raw: string, enc: EncodingCharacters): RawComponent {
  const subs = raw.split(enc.subcomponent);
  return { subcomponents: subs };
}
```

JSDoc on `tokenize` (the only exported symbol) with `@example`:

```typescript
/**
 * Decomposes an ordered list of segment strings into the raw positional tree
 * consumed by `Hl7Message`. Honors custom encoding characters from `enc`.
 * Empty field (`||`) vs HL7 null field (`""`) are distinguished via the
 * returned `RawField.isNull`.
 *
 * When `trimFields` is true and a field value had non-trivial leading or
 * trailing whitespace, a `FIELD_WHITESPACE_TRIMMED` warning is emitted via
 * `emit`. Escape-sequence expansion is NOT done here — it happens on-access
 * in the escape stage (Plan 04).
 *
 * @example
 * ```ts
 * import { tokenize, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const tree = tokenize(["MSH|^~\\&|APP", "PID|1||Doe^Jane"], DEFAULT_ENCODING_CHARACTERS, () => {}, true);
 * console.log(tree[1]?.name, tree[1]?.fields[3]?.repetitions[0]?.components[0]?.subcomponents[0]); // "PID" "Doe"
 * ```
 */
export function tokenize(...) { ... }
```

CRITICAL — `noUncheckedIndexedAccess: true`: every `array[i]` is `T | undefined`. All helpers above guard via `if (x === undefined) continue` or explicit `x?.` usage.

CRITICAL — `consistent-type-assertions` forbids object-literal `as` casts. The MSH-1 literal uses `as const satisfies RawField` which is allowed (it's not an object-literal `as T` assertion).

CRITICAL — do not `Object.freeze` internal intermediate objects (waste). Freezing happens at the `Hl7Message` boundary only.

Test file `test/parser-tokenize.test.ts` with the 11 cases from behavior:

```typescript
import { describe, expect, it } from "vitest";

import { tokenize } from "../src/parser/tokenize.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { EncodingCharacters } from "../src/parser/types.js";

const defaultEnc = DEFAULT_ENCODING_CHARACTERS;

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/tokenize: segment + field + repetition + component + subcomponent", () => {
  it("produces an ordered RawSegment[] with correct names for standard input", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&|APP|FAC", "PID|1||X^Y^Z"], defaultEnc, emit, true);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.name).toBe("MSH");
    expect(tree[1]?.name).toBe("PID");
  });

  it("MSH-1 holds the field separator char and MSH-2 holds the encoding-chars string", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&|APP"], defaultEnc, emit, true);
    const msh = tree[0];
    // fields[0] = MSH-1 (separator), fields[1] = MSH-2 (encoding chars), fields[2] = MSH-3 ("APP")
    expect(msh?.fields[0]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("|");
    expect(msh?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("^~\\&");
    expect(msh?.fields[2]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("APP");
  });

  it("splits repetitions on ~", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|A~B~C"], defaultEnc, emit, true);
    const pid1 = tree[1]?.fields[1]; // PID-1
    expect(pid1?.repetitions).toHaveLength(3);
    expect(pid1?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("A");
    expect(pid1?.repetitions[2]?.components[0]?.subcomponents[0]).toBe("C");
  });

  it("splits components on ^", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|X^Y^Z"], defaultEnc, emit, true);
    const comps = tree[1]?.fields[1]?.repetitions[0]?.components;
    expect(comps).toHaveLength(3);
    expect(comps?.[0]?.subcomponents[0]).toBe("X");
  });

  it("splits subcomponents on &", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|X&Y&Z"], defaultEnc, emit, true);
    const subs = tree[1]?.fields[1]?.repetitions[0]?.components[0]?.subcomponents;
    expect(subs).toEqual(["X", "Y", "Z"]);
  });

  it("empty field || produces isNull=false with zero repetitions", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|A||C"], defaultEnc, emit, true);
    const empty = tree[1]?.fields[2]; // between the || is field index 2
    expect(empty?.isNull).toBe(false);
    expect(empty?.repetitions).toHaveLength(0);
  });

  it("explicit null field \"\" produces isNull=true with zero repetitions", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", `PID|A|""|C`], defaultEnc, emit, true);
    const nullField = tree[1]?.fields[2];
    expect(nullField?.isNull).toBe(true);
    expect(nullField?.repetitions).toHaveLength(0);
  });

  it("honors custom encoding characters", () => {
    const enc: EncodingCharacters = { field: "#", component: "$", repetition: "%", escape: "*", subcomponent: "@" };
    const { emit } = collect();
    const tree = tokenize(["MSH#$%*@#APP", "PID#A%B%C"], enc, emit, true);
    expect(tree[1]?.fields[1]?.repetitions).toHaveLength(3);
  });

  it("emits FIELD_WHITESPACE_TRIMMED when trimFields=true and non-trivial whitespace surrounds content", () => {
    const { emit, warnings } = collect();
    tokenize(["MSH|^~\\&", "PID|  hi  "], defaultEnc, emit, true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.FIELD_WHITESPACE_TRIMMED);
  });

  it("does NOT emit FIELD_WHITESPACE_TRIMMED when trimFields=false", () => {
    const { emit, warnings } = collect();
    const tree = tokenize(["MSH|^~\\&", "PID|  hi  "], defaultEnc, emit, false);
    expect(warnings).toHaveLength(0);
    expect(tree[1]?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("  hi  ");
  });

  it("preserves segment name case (lowercase pid stays lowercase)", () => {
    const { emit } = collect();
    const tree = tokenize(["MSH|^~\\&", "pid|1"], defaultEnc, emit, true);
    expect(tree[1]?.name).toBe("pid");
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/tokenize.ts test/parser-tokenize.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-tokenize</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/tokenize.ts` exists and exports `tokenize` (verify: `grep -E "^export function tokenize" src/parser/tokenize.ts | wc -l` returns 1).
    - No other top-level exports (internal helpers are NOT exported) — verify: `grep -E "^export " src/parser/tokenize.ts | wc -l` returns 1.
    - `tokenize` signature includes `trimFields: boolean` parameter — verify: `grep -c "trimFields: boolean" src/parser/tokenize.ts` >= 1.
    - Calls `fieldWhitespaceTrimmed` factory — verify: `grep -c "fieldWhitespaceTrimmed(" src/parser/tokenize.ts` >= 1.
    - No `any` type — verify: `grep -cE "(: any(\\s|,|\\))|<any>)" src/parser/tokenize.ts` returns 0.
    - No `Object.freeze` inside tokenize.ts (internal objects stay unfrozen for performance) — verify: `grep -c "Object.freeze" src/parser/tokenize.ts` returns 0.
    - No `console.*` — verify: `grep -c "console\\." src/parser/tokenize.ts` returns 0.
    - File-level JSDoc does NOT start with `@` — verify: `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/parser/tokenize.ts` prints nothing.
    - `@example` on `tokenize` — `grep -c "@example" src/parser/tokenize.ts` >= 1.
    - `pnpm typecheck`, `pnpm lint ... --max-warnings=0`, `pnpm test -- --run parser-tokenize` all exit 0 with 11 passing cases.
  </acceptance_criteria>
  <done>`tokenize` produces the full positional tree with correct empty/null distinction, custom delimiters, and whitespace-trim warning. 11 tests pass. Typecheck + lint + test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| untrusted input → tokenizer | Normalized HL7 string (untrusted) → structured tree. All string operations must be bounded and non-recursive. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-03-01 | Denial of Service | `splitSegments` and `tokenize` splitters | mitigate | All splitting uses `String.split` (linear). No regex backtracking. Recursion is flat-iterative (for loops, no tail recursion). Input size is bounded by the caller. |
| T-02-03-02 | Tampering | `readDelimiters` encoding-chars validation | mitigate | Explicit rejection of duplicate chars, whitespace chars, and the field separator appearing in MSH-2. Prevents a maliciously crafted MSH from collapsing delimiters in a way that would cause mis-tokenization. |
| T-02-03-03 | Information Disclosure | `Hl7ParseError.snippet` carrying untrusted first-segment content | accept | Snippet is truncated at 40 chars. Error consumers own logging discipline (documented in Phase 8 README). |
| T-02-03-04 | Tampering | Custom delimiters from MSH-2 used to split subsequent fields | mitigate | `readDelimiters` validates that MSH-2 chars are 4 distinct non-whitespace chars. `tokenize` then uses those chars as-is — no further parsing of user-controlled regex or patterns. |
</threat_model>

<verification>
Run after both tasks:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run parser-segments parser-delimiters parser-tokenize
pnpm build
```

All four exit 0.
</verification>

<success_criteria>
- `src/parser/segments.ts` ships `splitSegments` + `snippet` helper.
- `src/parser/delimiters.ts` ships `readDelimiters` covering all 3 Tier-3 structural fatals + `DEFAULT_ENCODING_CHARACTERS` const.
- `src/parser/tokenize.ts` ships `tokenize` producing RawSegment tree honoring custom delimiters, empty-vs-null, and whitespace trim with warning emission.
- 23+ tests across the 3 files, all passing.
- PARSE-02 (custom delimiters), PARSE-04 (segment order preserved), PARSE-05 (field/rep/comp/sub hierarchy), PARSE-06 (empty vs null), TOL-07 (trimFields + warning) all demonstrated.
- No `src/index.ts` changes; no overlap with Plan 02 or Plan 04 files.
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-03-SUMMARY.md` describing:
- What shipped.
- The unified HL7 1-indexed positional convention adopted for ALL segments: `fields[0]` is the segment name / separator placeholder slot (never a data field); `fields[N]` for N ≥ 1 is the HL7 N-th field. MSH: fields[0] = single-component "|" (field separator), fields[1] = MSH-2 (encoding chars), fields[2..11] = MSH-3..MSH-12. Non-MSH (PID, EVN, ZPI, ...): fields[0] = single-component segment-name string, fields[1] = PID-1, fields[2] = PID-2, .... Phase 4's `msg.meta` and Plan 06's `extractVersion` (which reads `msh.fields[11]` for MSH-12) both depend on this convention.
- REQ-IDs closed as parser primitives (PARSE-02, PARSE-04, PARSE-05, PARSE-06, TOL-07).
- Any notes Plan 06 needs: e.g., recommendation that Plan 06's emitter passes the correct `trimFields` default (true) and forwards the right segmentIndex to `tokenize`.
</output>
