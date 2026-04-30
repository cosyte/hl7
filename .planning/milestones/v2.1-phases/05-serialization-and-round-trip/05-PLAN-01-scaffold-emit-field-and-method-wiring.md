---
phase: 05-serialization-and-round-trip
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/serialize/emit-field.ts
  - src/serialize/to-string.ts
  - src/serialize/to-json.ts
  - src/serialize/pretty-print.ts
  - src/builder/build-message.ts
  - src/builder/format-timestamp.ts
  - src/builder/control-id.ts
  - src/model/message.ts
  - src/index.ts
  - test/serialize-emit-field.test.ts
  - vitest.config.ts
autonomous: true
requirements: [SER-01, SER-05]

must_haves:
  truths:
    - "A developer calling `emitField(field, enc)` on any RawField receives a re-escaped HL7 fragment string with trailing empty components/subcomponents stripped and `isNull===true` preserved as literal `\"\"`."
    - "A developer calling `emitSegment(seg, enc)` on any non-MSH RawSegment receives `name + enc.field + <fields joined by enc.field>` with each field produced via emitField."
    - "A developer calling `emitSegment` on an MSH segment receives a loud throw (not silent mis-emission) — MSH MUST be routed through to-string.ts's D-06 special-case path."
    - "A developer calling `msg.toString()`, `msg.toJSON()`, or `msg.prettyPrint()` on a parsed message gets a typed result (string/SerializedMessage/string) — stubbed bodies throw `NOT IMPLEMENTED — Plan 0N will fill this`; wiring exists so Plans 02/03/04 can fill only the body of the relevant serialize file."
    - "A developer importing `buildMessage` and `SerializedMessage` from `@cosyte/hl7-parser` resolves both — `buildMessage` throws the Plan 05 NOT IMPLEMENTED marker until Plan 05 fills it; `SerializedMessage` is a live type consumable today."
    - "A developer running `pnpm typecheck && pnpm lint && pnpm build && pnpm test` sees zero regressions — all 459 existing tests + the new `serialize-emit-field.test.ts` suite pass."
    - "Phase 7's `pnpm test:coverage` gate applies uniformly to `src/serialize/**` and `src/builder/**` — Plan 01 extends the per-directory threshold map in `vitest.config.ts` to include the two new directories at the same >= 90% bar as `src/parser/**`, `src/model/**`, `src/helpers/**`."
  artifacts:
    - path: "src/serialize/emit-field.ts"
      provides: "emitField + emitSegment — the D-04 re-escape chokepoint, FULLY IMPLEMENTED"
      exports: ["emitField", "emitSegment"]
    - path: "src/serialize/to-string.ts"
      provides: "emitMessage stub (throws until Plan 02)"
      exports: ["emitMessage"]
    - path: "src/serialize/to-json.ts"
      provides: "emitJson stub + SerializedMessage type (LIVE — not a stub)"
      exports: ["emitJson"]
      contains: "export interface SerializedMessage"
    - path: "src/serialize/pretty-print.ts"
      provides: "emitPrettyPrint stub (throws until Plan 04)"
      exports: ["emitPrettyPrint"]
    - path: "src/builder/build-message.ts"
      provides: "buildMessage stub + BuildMessageInit type (LIVE); throws until Plan 05 fills"
      exports: ["buildMessage"]
      contains: "export interface BuildMessageInit"
    - path: "src/builder/format-timestamp.ts"
      provides: "formatHl7Timestamp stub (throws until Plan 05)"
      exports: ["formatHl7Timestamp"]
    - path: "src/builder/control-id.ts"
      provides: "generateControlId stub (throws until Plan 05)"
      exports: ["generateControlId"]
    - path: "src/model/message.ts"
      provides: "toString + toJSON + prettyPrint instance methods wired to module-level emitters"
      contains: "public toString(): string"
    - path: "src/index.ts"
      provides: "buildMessage value export + SerializedMessage + BuildMessageInit type exports"
      contains: "export { buildMessage }"
    - path: "test/serialize-emit-field.test.ts"
      provides: "Unit coverage for the D-02/D-04 primitive (trailing-empty strip, isNull preservation, reescape round-trip, encoding-char pass-through, pure, MSH guard throw)"
    - path: "vitest.config.ts"
      provides: "Per-directory coverage thresholds extended to include src/serialize/** and src/builder/** at the same >= 90% bar (Phase 7 readiness)"
  key_links:
    - from: "src/model/message.ts::toString"
      to: "src/serialize/to-string.ts::emitMessage"
      via: "import + delegation"
      pattern: 'import \{ emitMessage \} from "\.\./serialize/to-string\.js"'
    - from: "src/model/message.ts::toJSON"
      to: "src/serialize/to-json.ts::emitJson"
      via: "import + delegation"
      pattern: 'import \{ emitJson'
    - from: "src/model/message.ts::prettyPrint"
      to: "src/serialize/pretty-print.ts::emitPrettyPrint"
      via: "import + delegation"
      pattern: 'import \{ emitPrettyPrint \} from "\.\./serialize/pretty-print\.js"'
    - from: "src/serialize/emit-field.ts"
      to: "src/parser/escapes.ts::reescape"
      via: "D-04 re-escape chokepoint"
      pattern: 'reescape\('
    - from: "src/index.ts"
      to: "src/builder/build-message.ts + src/serialize/to-json.ts"
      via: "named + type barrel exports"
      pattern: 'export \{ buildMessage \}'
---

<objective>
Ship the Phase 5 scaffold in one disjoint-file-free wave so Plans 02/03/04/05
can fill emitter bodies in parallel without edit conflicts.

This plan locks:
- **D-04 re-escape chokepoint** — `emitField` is the sole function that calls
  `reescape()` on user content before emitting. Every other emitter (toString,
  prettyPrint, future Phase 6 profile hooks) composes on `emitField` /
  `emitSegment`. This primitive is FULLY IMPLEMENTED in Plan 01 because:
  (a) Plan 02 (`to-string.ts`) imports it, and (b) it encapsulates D-02
  trailing-empty stripping + D-04 reescape scope + `isNull` preservation —
  three correctness-critical concerns that benefit from one-place TDD.
- **D-29 method placement** — `toString`, `toJSON`, `prettyPrint` are class
  methods on `Hl7Message`, each a thin wrapper that delegates to a
  module-level emitter under `src/serialize/`. This mirrors the Phase 4
  pattern (`public observations()` delegates to `walkObservations`).
- **D-21/D-09 barrel** — `buildMessage` is a top-level named value export;
  `SerializedMessage` + `BuildMessageInit` are top-level named type exports.
  The 7 internal emitter functions (emitField/emitSegment/emitMessage/
  emitJson/emitPrettyPrint/formatHl7Timestamp/generateControlId) are
  `@internal` and NOT re-exported.
- **Coverage scope extension** — Phase 5 introduces `src/serialize/` and
  `src/builder/` as first-class coverage targets. This plan extends the
  per-directory thresholds in `vitest.config.ts` so Phase 7's
  `pnpm test:coverage` gate applies uniformly to the two new directories
  at the same >= 90% bar as Phase 1/2/3/4 dirs (CLAUDE.md guardrail).

**Parallelism enabler:** After Plan 01 ships, Plans 02-05 each edit a single
body and its colocated test file, with NO overlap with `src/model/message.ts`,
`src/index.ts`, or each other's serialize/builder files. This is the wave-2
disjoint-file contract.

**In scope:**

1. `src/serialize/emit-field.ts` — FULLY IMPLEMENTED (emitField + emitSegment).
   Handles D-02 trailing-empty strip at component/subcomponent levels,
   D-04 reescape scope (delegates to `reescape` from `src/parser/escapes.ts`),
   `RawField.isNull === true` preservation as literal `""`. `emitSegment`
   THROWS when invoked with an MSH segment (guards D-06 routing). Exported as
   `@internal` module-level functions; NOT re-exported from src/index.ts.
2. `src/serialize/to-string.ts` — STUB exporting `emitMessage(msg): string`
   that throws `NOT IMPLEMENTED — Phase 5 Plan 02 will fill this`. Plan 02
   will replace the body only.
3. `src/serialize/to-json.ts` — MIXED: `SerializedMessage` interface is
   FULLY DECLARED (downstream plans + `src/index.ts` need the type today);
   `emitJson(msg): SerializedMessage` is a STUB throwing the Plan 03 marker.
4. `src/serialize/pretty-print.ts` — STUB exporting `emitPrettyPrint(msg): string`
   that throws the Plan 04 marker.
5. `src/builder/build-message.ts` — MIXED: `BuildMessageInit` interface is
   FULLY DECLARED (per D-10 locked shape); `buildMessage(init): Hl7Message`
   is a STUB throwing the Plan 05 marker.
6. `src/builder/format-timestamp.ts` — STUB exporting
   `formatHl7Timestamp(date): string` that throws the Plan 05 marker.
7. `src/builder/control-id.ts` — STUB exporting `generateControlId(): string`
   that throws the Plan 05 marker.
8. `src/model/message.ts` — ADD 3 instance methods (`toString`, `toJSON`,
   `prettyPrint`), each delegating to the module-level emitter. NO new
   cache slots (D-30: no emit caching in v1).
9. `src/index.ts` — ADD `buildMessage` (value), `BuildMessageInit` (type),
   `SerializedMessage` (type).
10. `test/serialize-emit-field.test.ts` — FULL TDD coverage of emitField +
    emitSegment, because this primitive is the correctness heart of SER-01
    and SER-05.
11. `vitest.config.ts` — EXTEND `coverage.thresholds` per-directory map to
    add `src/serialize/**` and `src/builder/**` at the same >= 90% bar as
    the existing Phase 1/2/3/4 dirs. Load-bearing for Phase 7: without this,
    `pnpm test:coverage` would silently skip per-directory enforcement for
    the new dirs.

**Out of scope (later plans):**

- `emitMessage` body (MSH special-case + CR join) → Plan 02 (SER-01/02/05).
- Round-trip fixture sweep → Plan 02 (SER-02).
- `emitJson` body → Plan 03 (SER-03).
- `emitPrettyPrint` body → Plan 04 (SER-04).
- `buildMessage` body, `formatHl7Timestamp` body, `generateControlId` body →
  Plan 05 (SER-06).

Purpose: disjoint-file scaffold so Plans 02-05 only modify the METHOD BODIES
inside the stub files Plan 01 created. This is the parallelization gate.

Output: 7 new `src/` files (`src/serialize/` + `src/builder/` dirs fresh),
1 modified `src/model/message.ts`, 1 modified `src/index.ts`, 1 new test file,
1 modified `vitest.config.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md
@.planning/phases/05-serialization-and-round-trip/05-PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Key existing types/exports Plan 01 builds on. Read directly from code
     if anything looks stale. -->

From src/parser/types.ts:
- export interface EncodingCharacters { readonly field, component, repetition, escape, subcomponent: string }
- export interface RawComponent { readonly subcomponents: readonly string[] }
- export interface RawRepetition { readonly components: readonly RawComponent[] }
- export interface RawField { readonly repetitions: readonly RawRepetition[]; readonly isNull: boolean }
- export interface RawSegment { readonly name: string; readonly fields: readonly RawField[] }
  (fields[0] is a name/separator placeholder — never a data field;
   fields[N>=1] is the HL7 N-th field. MSH special: fields[1] is MSH-2 encoding chars.)

From src/parser/escapes.ts:
- export function reescape(input: string, enc: EncodingCharacters): string
  (handles \F\ \S\ \T\ \R\ \E\ and \n → \.br\; iterates by code-point)

From src/parser/delimiters.ts:
- export const DEFAULT_ENCODING_CHARACTERS: EncodingCharacters
  (NOTE: this lives in `parser/delimiters.ts`, NOT `parser/types.ts`.
   Already re-exported from src/index.ts line 44.)

From src/parser/warnings.ts:
- export interface Hl7ParseWarning { ... }  (already imported as `type` in message.ts)

From src/model/message.ts (current state — Phase 4 complete):
- public readonly rawSegments: readonly RawSegment[]
- public readonly encodingCharacters: EncodingCharacters
- public readonly version: string
- public readonly warnings: readonly Hl7ParseWarning[]
- public readonly profile?: Profile  (may be undefined)
- Methods already present (DO NOT reimplement): get, getAll, segments,
  allSegments, get meta, get patient, get visit, observations, orders,
  nextOfKin, allergies, diagnoses, insurance, setField, addSegment, removeSegment.
- Three NEW methods land: toString (line ~after prettyPrint), toJSON,
  prettyPrint. Recommended insertion: between `insurance()` (line ~top-370s)
  and `setField()` (line 444).

From src/index.ts (current barrel — Phase 4 complete):
- Phase 3 + Phase 4 block ends around line 121.
- Phase 5 additions land AFTER the `pickMrn` export.

From vitest.config.ts (current state — Phase 1 scaffold):
- `coverage.include: ["src/**/*.ts"]` — already globs src/serialize + src/builder
  (no change needed to include list).
- `coverage.thresholds` has top-level 90/85/90/90 + per-directory overrides
  for `src/parser/**`, `src/model/**`, `src/helpers/**`. Plan 01 APPENDS
  matching overrides for `src/serialize/**` and `src/builder/**`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement emit-field primitive with full unit test coverage</name>
  <files>src/serialize/emit-field.ts, test/serialize-emit-field.test.ts</files>
  <read_first>
    - src/serialize/emit-field.ts (target — will be new; confirm absent)
    - src/parser/escapes.ts (lines 127-158 — `reescape` signature + iteration by code-point)
    - src/parser/types.ts (lines 148-238 — EncodingCharacters, RawField, RawRepetition, RawComponent, RawSegment with fields[0] placeholder convention)
    - src/parser/delimiters.ts (confirm DEFAULT_ENCODING_CHARACTERS exported)
    - src/helpers/meta.ts (lines 56-62 trailing-empty trim pattern — copy this loop shape for D-02 strip)
    - test/parser-escapes.test.ts (test file convention — describe/it, vitest imports, top-of-file FIXTURE)
    - test/types-xpn.test.ts (unit-test analog — pure-function test style)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-02 (trailing-empty strip + isNull preservation), D-04 (reescape scope), D-06 (MSH-1/MSH-2 special — NOT handled here; handled in Plan 02), D-07 (pure, never throws EXCEPT for the explicit MSH guard in emitSegment which throws loud to prevent silent mis-emission)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/serialize/emit-field.ts" section
  </read_first>
  <behavior>
    - emitField({ repetitions: [], isNull: false }, enc) === "" (absent field)
    - emitField({ repetitions: [], isNull: true }, enc) === '""' (HL7 explicit null — two literal characters: quote-quote)
    - emitField({ repetitions: [{ components: [{ subcomponents: ["Doe"] }] }], isNull: false }, enc) === "Doe"
    - Single repetition, multiple components: input components = [{sub:["Smith"]},{sub:["John"]},{sub:["Q"]}] → "Smith^John^Q"
    - D-02 trailing-empty strip at components: components = [{sub:["Doe"]},{sub:[""]},{sub:[""]},{sub:[""]}] → "Doe" (not "Doe^^^")
    - D-02 trailing-empty strip at subcomponents: subcomponents = ["HOSP","",""] → "HOSP" (not "HOSP&&")
    - D-02 preserves internal empties: components = [{sub:["A"]},{sub:[""]},{sub:["C"]}] → "A^^C"
    - Repetitions joined by enc.repetition: two reps [{comp:[{sub:["R1"]}]},{comp:[{sub:["R2"]}]}] → "R1~R2"
    - Multi-level: rep[0] comps [{sub:["A","B"]},{sub:["C"]}], rep[1] comps [{sub:["D"]}] → "A&B^C~D"
    - D-04 reescape applied to each subcomponent string: subcomponent "Smith|Jones" with default enc → "Smith\\F\\Jones" (literal backslash F backslash)
    - D-04 reescape applied across all 5 active delimiters (|, ^, ~, \, &) AND newline (\n → \.br\)
    - Custom encoding characters honoured: enc with field="#", component="@" — subcomponent "a#b" reescapes to "a\\F\\b" using the enc.escape, not a hardcoded backslash
    - emitSegment for non-MSH: name "PID", fields = [placeholder, {rep:[{comp:[{sub:["1"]}]}]}, {rep:[], isNull: true}] → "PID|1|\"\"" (fields[0] placeholder is SKIPPED; each subsequent field is emitField-joined by enc.field)
    - emitSegment skips fields[0] placeholder regardless of contents (segment name is emitted from seg.name, not fields[0])
    - **emitSegment THROWS a clear `Error` when `seg.name === "MSH"`** — the message explicitly states MSH must be routed through `to-string.ts`'s D-06 special-case path. This is a LOUD guard (not silent fall-through) because silent mis-emission on MSH would re-escape the encoding chars in MSH-2 and produce garbage output downstream. This is the ONE deliberate deviation from D-07 "never throws" purity — justified because it catches programmer misuse at the call site instead of corrupting wire output.
    - Never throws on malformed NON-MSH input: undefined subcomponent slot, empty components array, missing isNull flag (TS prevents this, but runtime should still be resilient).
    - Never warns, never mutates input.
  </behavior>
  <action>
Create `src/serialize/emit-field.ts`:

1. **Module JSDoc header** (mimic `src/parser/escapes.ts` lines 1-25 style):

```typescript
/**
 * HL7 emit primitives for the `@cosyte/hl7-parser` serializer pipeline —
 * walks a `RawField` / `RawSegment` tree and produces spec-clean HL7 text
 * by joining repetitions, components, and subcomponents with the active
 * delimiters and re-escaping user content via `reescape`.
 *
 * Decisions honored:
 * - D-02: trailing empty components and subcomponents are stripped;
 *   `RawField.isNull === true` is preserved as the two-character literal `""`.
 * - D-04: every subcomponent string passes through `reescape(sub, enc)` —
 *   the 5 active delimiters + `\n` (via `\.br\`) are re-escaped; hex `\X..\`,
 *   `\Z..\`, and already-decoded text pass through as plain characters.
 * - D-06 guard: `emitSegment` throws when called with an MSH segment —
 *   MSH must be routed through `to-string.ts`'s special-case path, which
 *   inlines MSH-1 and MSH-2 instead of running them through `emitField`
 *   (running MSH-2 through `emitField` would re-escape the encoding chars
 *   and produce garbage). The throw is a deliberate deviation from D-07
 *   purity — it catches programmer misuse at the call site instead of
 *   silently corrupting wire output.
 * - D-07: pure for all non-MSH inputs — never warns, never throws.
 *
 * Not part of the public API (no re-export from `src/index.ts`). Phase 6
 * profile hooks may compose around `emitSegment` / `emitField`.
 * @internal
 */
```

2. **Imports:**

```typescript
import { reescape } from "../parser/escapes.js";
import type {
  EncodingCharacters,
  RawField,
  RawRepetition,
  RawSegment,
} from "../parser/types.js";
```

3. **`emitField(field: RawField, enc: EncodingCharacters): string`:**

```typescript
/**
 * Emit a single HL7 field as its spec-clean string fragment. Joins
 * repetitions with `enc.repetition`; each repetition renders its
 * components (joined with `enc.component`), each component renders its
 * subcomponents (joined with `enc.subcomponent`), and each subcomponent
 * runs through `reescape` (D-04).
 *
 * D-02 rules:
 * - `field.isNull === true` returns the two-character string `""` (literal
 *   quote-quote — HL7 explicit null), regardless of repetitions content.
 * - Trailing empty subcomponents inside a component are stripped.
 * - Trailing empty components inside a repetition are stripped.
 * - A field with zero repetitions renders as the empty string.
 *
 * @internal
 */
export function emitField(field: RawField, enc: EncodingCharacters): string {
  if (field.isNull) return '""';
  if (field.repetitions.length === 0) return "";
  const repStrings: string[] = [];
  for (const rep of field.repetitions) {
    repStrings.push(emitRepetition(rep, enc));
  }
  return repStrings.join(enc.repetition);
}

/** @internal */
function emitRepetition(rep: RawRepetition, enc: EncodingCharacters): string {
  const compStrings: string[] = [];
  for (const comp of rep.components) {
    const subStrings: string[] = [];
    for (const sub of comp.subcomponents) {
      subStrings.push(reescape(sub ?? "", enc));
    }
    // D-02 trailing-empty strip at subcomponent level:
    while (subStrings.length > 0 && subStrings[subStrings.length - 1] === "") {
      subStrings.pop();
    }
    compStrings.push(subStrings.join(enc.subcomponent));
  }
  // D-02 trailing-empty strip at component level:
  while (compStrings.length > 0 && compStrings[compStrings.length - 1] === "") {
    compStrings.pop();
  }
  return compStrings.join(enc.component);
}
```

4. **`emitSegment(seg: RawSegment, enc: EncodingCharacters): string`:**

```typescript
/**
 * Emit a single non-MSH HL7 segment as its spec-clean string fragment:
 * `<seg.name>` + `enc.field` + `<fields[1..N] joined by enc.field>`.
 *
 * **IMPORTANT — MSH guard:** If `seg.name === "MSH"` this function
 * THROWS. MSH requires D-06's special-case emission (MSH-1 = single
 * delimiter char, MSH-2 = 4 literal encoding chars — neither is routed
 * through `emitField`, because running MSH-2 through `emitField` would
 * re-escape the encoding chars and produce garbage output). The only
 * correct caller for MSH is `to-string.ts::emitMessage`, which inlines
 * MSH-1/MSH-2 before handing MSH-3..N off to `emitField`. This guard
 * is a deliberate deviation from D-07 "never throws" — it catches
 * programmer misuse loudly at the call site rather than silently
 * corrupting wire output.
 *
 * For non-MSH segments (PID, OBX, etc.) this function is pure: it
 * skips `fields[0]` (name placeholder) and joins `fields[1..N]` via
 * `emitField` with `enc.field` separators.
 *
 * @internal
 */
export function emitSegment(seg: RawSegment, enc: EncodingCharacters): string {
  if (seg.name === "MSH") {
    throw new Error(
      "emitSegment: MSH must be routed through to-string.ts's MSH path per D-06 " +
        "(special-case MSH-1/MSH-2 encoding-char emission). Running MSH through " +
        "emitSegment would re-escape the encoding chars and produce garbage output.",
    );
  }
  const parts: string[] = [seg.name];
  for (let i = 1; i < seg.fields.length; i++) {
    const f = seg.fields[i];
    parts.push(f === undefined ? "" : emitField(f, enc));
  }
  return parts.join(enc.field);
}
```

(Note: `f === undefined` guard satisfies `noUncheckedIndexedAccess` strict
mode — array access returns `T | undefined`.)

5. **No module-level state.** No caching (D-30).

Create `test/serialize-emit-field.test.ts`:

Convention: import from `../src/serialize/emit-field.js` (NodeNext + `.js`).
Header JSDoc describing the primitive. Vitest `describe` / `it` blocks.

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type {
  EncodingCharacters,
  RawField,
  RawSegment,
} from "../src/parser/types.js";
import { emitField, emitSegment } from "../src/serialize/emit-field.js";

const ENC = DEFAULT_ENCODING_CHARACTERS;
```

Required test cases (each a separate `it`):

**Block 1: emitField D-02 behaviour**
1. "absent field → empty string" — `emitField({ repetitions: [], isNull: false }, ENC)` === `""`.
2. 'isNull preserved as literal `""`' — `emitField({ repetitions: [], isNull: true }, ENC)` === `'""'` (2 chars).
3. 'isNull wins over repetitions content' — even with non-empty repetitions, `isNull:true` still emits `'""'`.
4. "single subcomponent → verbatim" — `{ rep: [{ components: [{ subcomponents: ["Doe"] }] }], isNull: false }` → `"Doe"`.
5. "multiple components" — components `[{sub:["Smith"]},{sub:["John"]},{sub:["Q"]}]` → `"Smith^John^Q"`.
6. "trailing empty components stripped" — components `[{sub:["Doe"]},{sub:[""]},{sub:[""]}]` → `"Doe"`.
7. "internal empty components preserved" — components `[{sub:["A"]},{sub:[""]},{sub:["C"]}]` → `"A^^C"`.
8. "trailing empty subcomponents stripped" — subs `["HOSP","",""]` → `"HOSP"`.
9. "internal empty subcomponents preserved" — subs `["A","","C"]` → `"A&&C"`.
10. "multiple repetitions joined" — two reps each one simple component → `"R1~R2"`.
11. "complex nested" — rep[0] comps `[{sub:["A","B"]},{sub:["C"]}]`, rep[1] comps `[{sub:["D"]}]` → `"A&B^C~D"`.

**Block 2: emitField D-04 reescape**
12. "subcomponent containing field delimiter → reescaped" — subcomponent `"Smith|Jones"` with default enc → `"Smith\\F\\Jones"` (i.e. JS string `"Smith\\F\\Jones"` literal; 11 chars).
13. "subcomponent containing each of the 5 delimiters" — one it per delimiter (|, ^, ~, \, &) round-trips through reescape.
14. "subcomponent containing newline → `\\.br\\`" — subcomponent `"line1\nline2"` → `"line1\\.br\\line2"`.
15. "custom encoding characters honoured" — build `enc2 = { field: "#", component: "@", repetition: "!", escape: "$", subcomponent: "+" }`; subcomponent `"a#b"` → `"a$F$b"`.

**Block 3: emitSegment basics**
16. "simple PID" — `emitSegment({ name: "PID", fields: [placeholder, f1, nullField] }, ENC)` where f1 has single-sub `"1"` and nullField has `isNull:true` → `'PID|1|""'`.
17. "fields[0] placeholder contents ignored" — vary the fields[0] placeholder's repetitions; output depends ONLY on fields[1..N].
18. "empty segment (just name)" — `{ name: "NTE", fields: [placeholder] }` → `"NTE"`.
19. "D-04 reescape applied through emitField" — segment PID with a field subcomponent containing `"|"` emits the escape form.
20. **"emitSegment throws on MSH input — guards D-06 special-case route"** — `expect(() => emitSegment({ name: "MSH", fields: [placeholder] }, ENC)).toThrow(/MSH must be routed/)`. Also assert the thrown value is an instance of `Error`.
21. "emitSegment throws on MSH even when fields array has data — guard fires BEFORE any field processing" — build an MSH segment with several fields and confirm the throw happens (no partial output leaks out). `expect(() => emitSegment({ name: "MSH", fields: [placeholder, f1, f2] }, ENC)).toThrow(/MSH/)`.

**Block 4: purity**
22. "never throws on empty fields array for non-MSH" — `emitSegment({ name: "XXX", fields: [] }, ENC)` returns just `"XXX"` (the loop does not execute).
23. "does not mutate input" — build a frozen RawField (via `Object.freeze`); call emitField; confirm input is unchanged (deep structural compare pre/post).
24. "deterministic" — two back-to-back calls with the same inputs return identical strings.

Run `pnpm typecheck`, `pnpm lint src/serialize`, `pnpm test -- serialize-emit-field`.
  </action>
  <verify>
    <automated>pnpm test -- serialize-emit-field.test.ts 2>&amp;1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/serialize test/serialize-emit-field.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/serialize/emit-field.ts` succeeds
    - `grep -q "export function emitField" src/serialize/emit-field.ts` succeeds
    - `grep -q "export function emitSegment" src/serialize/emit-field.ts` succeeds
    - `grep -q "reescape(" src/serialize/emit-field.ts` succeeds (D-04 chokepoint)
    - `grep -q "'\"\"'" src/serialize/emit-field.ts || grep -q '"\\\\"\\\\""' src/serialize/emit-field.ts || grep -q 'return .""' src/serialize/emit-field.ts` — some form of the literal quote-quote return exists (D-02 isNull)
    - `grep -q "while (" src/serialize/emit-field.ts` succeeds (trailing-empty strip loop)
    - `grep -q 'emitSegment: MSH must be routed' src/serialize/emit-field.ts` succeeds (B1 MSH guard message)
    - `grep -q 'seg.name === "MSH"' src/serialize/emit-field.ts` succeeds (B1 MSH guard check)
    - `test -f test/serialize-emit-field.test.ts` succeeds
    - `grep -q "MSH must be routed" test/serialize-emit-field.test.ts || grep -q "emitSegment throws on MSH" test/serialize-emit-field.test.ts` succeeds (B1 test case present)
    - `pnpm test -- serialize-emit-field.test.ts` exits 0 with >= 22 tests passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/serialize test/serialize-emit-field.test.ts` exits 0 with zero warnings
  </acceptance_criteria>
  <done>emit-field primitive is the sole D-04 re-escape chokepoint and D-02 trailing-empty-strip enforcer; emitSegment loudly guards the D-06 MSH routing contract; 22+ unit tests green; ready for Plan 02 to consume via `import { emitField, emitSegment }`.</done>
</task>

<task type="auto">
  <name>Task 2: Create serialize/builder stub files + SerializedMessage + BuildMessageInit type declarations</name>
  <files>src/serialize/to-string.ts, src/serialize/to-json.ts, src/serialize/pretty-print.ts, src/builder/build-message.ts, src/builder/format-timestamp.ts, src/builder/control-id.ts</files>
  <read_first>
    - src/serialize/emit-field.ts (Task 1 output — confirm exports exist before Task 2 imports are planned)
    - src/parser/types.ts (lines 148-238 — EncodingCharacters, RawSegment, RawField; SerializedMessage mirrors these)
    - src/parser/warnings.ts (Hl7ParseWarning type — flows through SerializedMessage.warnings)
    - src/helpers/types.ts (lines 1-30 — module-level JSDoc + exactOptionalPropertyTypes interface style to mirror)
    - src/helpers/meta.ts (lines 1-30 + full body — the stub/real split pattern; stubs throw a clear "NOT IMPLEMENTED — Phase 5 Plan 0N" error)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-10 (BuildMessageInit shape VERBATIM), D-17 (SerializedMessage shape VERBATIM), D-19 (warnings always []), D-20 (profile only when truthy), D-21 (SerializedMessage exported from src/index.ts)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/serialize/to-json.ts" section (Mutable<T> + Object.freeze(out) pattern) and "src/builder/build-message.ts" section
    - .planning/phases/04-named-helpers/04-PLAN-01-scaffold-xcn-and-cache.md Task 2 (stub template — the NOT IMPLEMENTED error-message wording precedent)
  </read_first>
  <behavior>
    - Each of the 6 stub functions, when invoked, throws an Error whose message starts with "NOT IMPLEMENTED — Phase 5 Plan 0N will fill this" (N is 02/03/04/05 as assigned).
    - The `SerializedMessage` interface is fully declared and consumable from `src/index.ts` today.
    - The `BuildMessageInit` interface is fully declared and consumable from `src/index.ts` today.
    - Every public export has a `@example` JSDoc block (enforced by eslint-plugin-jsdoc `require-example`).
    - No stub attempts to invoke another stub (stubs are self-contained throws).
    - Plans 02/03/04/05 can replace ONLY the function body without touching interface declarations, imports, or module JSDoc.
  </behavior>
  <action>
**Step A — `src/serialize/to-string.ts` (stub; Plan 02 will fill):**

```typescript
/**
 * `emitMessage` — top-level HL7 string emitter. Composes `emitSegment` from
 * `./emit-field.ts`, special-cases MSH-1 / MSH-2 per D-06, and joins segments
 * with strict CR (`\r`) per D-05.
 *
 * Implementation lives in Phase 5 Plan 02 (to-string-and-round-trip). This
 * stub exists so Plan 01 can wire the `Hl7Message.toString` instance method
 * before Plan 02 runs; invoking it throws.
 *
 * Decisions (for Plan 02 implementer):
 * - D-01: walk `msg.rawSegments` verbatim.
 * - D-04: every field string passes through `emitField` (which calls
 *   `reescape` internally).
 * - D-05: segments joined by `\r`; trailing `\r` after the last segment.
 * - D-06: MSH-1 / MSH-2 inlined (see CONTEXT §specifics emission trace).
 * - D-07: pure — never warns, never throws.
 * - D-08: no MLLP wrapping.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";

/** @internal */
export function emitMessage(_msg: Hl7Message): string {
  throw new Error(
    "emitMessage: NOT IMPLEMENTED — Phase 5 Plan 02 (to-string-and-round-trip) will fill this. " +
      "If you see this error, serialize plans are running out of order.",
  );
}
```

**Step B — `src/serialize/to-json.ts` (MIXED: type is LIVE, function is stub):**

```typescript
/**
 * `emitJson` + `SerializedMessage` — snapshot-stable JSON projection of an
 * `Hl7Message`. Mirrors `rawSegments` one-for-one; preserves `isNull`;
 * always includes `warnings: []`; omits `profile` when absent.
 *
 * The `SerializedMessage` interface is exported in Plan 01 (this file) so
 * consumers + `src/index.ts` can reference the type immediately. The
 * `emitJson` function body is filled in Phase 5 Plan 03 (to-json).
 *
 * Decisions:
 * - D-17: shape is a raw-tree mirror (encodingCharacters + segments + warnings + optional profile).
 * - D-18: `Hl7Message.toJSON` delegates here so `JSON.stringify(msg)` Just Works.
 * - D-19: warnings array is ALWAYS present (`warnings: []` when empty).
 * - D-20: `profile` field appears only when `msg.profile` is truthy — then contains only `name` + `lineage`.
 * - D-21: `SerializedMessage` is exported from `src/index.ts` (not nested under HL7 namespace).
 *
 * Note on runtime freeze scope: `emitJson` returns an object that is
 * boundary-frozen (top level only — `Object.isFrozen(msg.toJSON()) === true`).
 * Inner arrays are readonly at the TypeScript type level but MUTABLE at
 * runtime — consumers should treat the returned structure as immutable
 * and not mutate nested arrays. Deep-freeze is explicitly rejected per
 * D-30 (emit is hot-path; runtime deep-freeze would add cost with no
 * observable benefit given the type-level readonly contract).
 */

import type { Hl7Message } from "../model/message.js";
import type { EncodingCharacters } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";

/**
 * Snapshot-stable JSON projection of an `Hl7Message` (SER-03). Every field
 * is readonly; segment order is preserved; `isNull` flags are preserved.
 *
 * Runtime immutability: the top-level object is `Object.freeze`d
 * (boundary-frozen). Inner arrays are readonly at the TypeScript type
 * level but mutable at runtime — treat as immutable, do not mutate.
 *
 * @example
 * ```ts
 * import { parseHL7, type SerializedMessage } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * const snap: SerializedMessage = msg.toJSON();
 * console.log(snap.segments[0]?.name);        // "MSH"
 * console.log(snap.warnings.length);          // 0 when clean
 * console.log(JSON.stringify(msg) === JSON.stringify(snap)); // true
 * console.log(Object.isFrozen(snap));         // true (D-30 boundary freeze)
 * ```
 */
export interface SerializedMessage {
  readonly encodingCharacters: EncodingCharacters;
  readonly segments: ReadonlyArray<{
    readonly name: string;
    readonly fields: ReadonlyArray<{
      readonly repetitions: ReadonlyArray<{
        readonly components: ReadonlyArray<{ readonly subcomponents: readonly string[] }>;
      }>;
      readonly isNull: boolean;
    }>;
  }>;
  readonly warnings: readonly Hl7ParseWarning[];
  readonly profile?: { readonly name: string; readonly lineage: readonly string[] };
}

/**
 * Build the `SerializedMessage` snapshot from a parsed message.
 * Implementation lives in Phase 5 Plan 03 (to-json). Stub throws.
 * @internal
 */
export function emitJson(_msg: Hl7Message): SerializedMessage {
  throw new Error(
    "emitJson: NOT IMPLEMENTED — Phase 5 Plan 03 (to-json) will fill this. " +
      "If you see this error, serialize plans are running out of order.",
  );
}
```

**Step C — `src/serialize/pretty-print.ts` (stub; Plan 04 will fill):**

```typescript
/**
 * `emitPrettyPrint` — human-readable multi-line rendering of an `Hl7Message`
 * for logs and debugging (SER-04).
 *
 * Implementation lives in Phase 5 Plan 04 (pretty-print). Stub throws.
 *
 * Decisions (for Plan 04 implementer):
 * - D-22: no options — single opinionated format.
 * - D-23: segment-per-line with labeled fields `[N]=value`. Field values
 *   shown verbatim with active delimiters; empty trailing positions suppressed.
 * - D-24: resolution depth stops at field level — composite values render as
 *   their raw HL7 string (e.g. `Smith^John^Q`).
 * - D-25: first line is a metadata header
 *   `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`.
 * - D-26: pure — never warns or throws.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";

/** @internal */
export function emitPrettyPrint(_msg: Hl7Message): string {
  throw new Error(
    "emitPrettyPrint: NOT IMPLEMENTED — Phase 5 Plan 04 (pretty-print) will fill this. " +
      "If you see this error, serialize plans are running out of order.",
  );
}
```

**Step D — `src/builder/build-message.ts` (MIXED: BuildMessageInit is LIVE, buildMessage is stub):**

```typescript
/**
 * `buildMessage` — top-level outbound factory for the `@cosyte/hl7-parser`
 * package. Synthesizes a complete MSH `RawSegment` from `BuildMessageInit`
 * and returns a real `Hl7Message` (not a builder subtype). Callers chain
 * `.addSegment(...)` (Phase 3 mutation method, unchanged) to append PID,
 * OBX, etc. Symmetric with `parseHL7` (D-09).
 *
 * The `BuildMessageInit` interface is exported in Plan 01 (this file) so
 * consumers + `src/index.ts` can reference the type immediately. The
 * `buildMessage` function body is filled in Phase 5 Plan 05 (build-message).
 *
 * Decisions:
 * - D-09: top-level named export from `src/index.ts`.
 * - D-10: `BuildMessageInit` shape below.
 * - D-11: internally synthesises a complete MSH `RawSegment` and hands to
 *   `new Hl7Message({...})`.
 * - D-12: controlId auto-gen — YYYYMMDDHHmmssSSS + 6 alnum = 23 chars.
 * - D-13: `timestamp` accepts `Date | string`; `Date` formats to
 *   `YYYYMMDDHHmmss` UTC.
 * - D-14: encoding chars always `DEFAULT_ENCODING_CHARACTERS`.
 * - D-15: subsequent `.addSegment(name, fields)` uses Phase 3 unchanged
 *   (`readonly string[]` field input).
 * - D-16: missing/empty `type` throws `TypeError`.
 *
 * **Absent vs. explicit null at the wire level:** at the HL7 wire level,
 * an empty-string field and an omitted field produce IDENTICAL output
 * (both emit as absent — `||` in the line). If you need to distinguish
 * "explicitly null" (HL7 `""`) from "absent" in an outbound message, use
 * `buildMessage({...}).setField(path, '""')` after construction — the
 * Phase 3 `setField` mutation method sets `RawField.isNull = true`, which
 * the emitter preserves as the literal two-char string `""` per D-02.
 */

import type { Hl7Message } from "../model/message.js";

/**
 * Input shape for `buildMessage` (SER-06). Mirrors `msg.meta` 1-for-1 so
 * read and write surfaces share field names (`sendingApp`, `sendingFacility`,
 * `receivingApp`, `receivingFacility`, `controlId`, `timestamp`, `version`,
 * `processingId`). `type` is the only required field.
 *
 * **Empty string vs. undefined semantics:** omitting a field and passing an
 * empty string produce IDENTICAL wire output (both emit as an absent
 * positional field). To emit an HL7 explicit null (`""`) at a specific
 * position in an outbound message, build the message first and then call
 * `.setField(path, '""')` — the Phase 3 mutation method sets `isNull=true`
 * on the underlying `RawField`, and the emitter preserves that as the
 * literal two-char output per D-02.
 *
 * @example
 * ```ts
 * import { buildMessage } from "@cosyte/hl7-parser";
 * const msg = buildMessage({
 *   type: "ADT^A01",
 *   sendingApp: "CLINIC",
 *   sendingFacility: "MAIN",
 *   receivingApp: "LAB",
 *   receivingFacility: "REF",
 *   timestamp: new Date("2026-04-19T10:15:00Z"),
 * })
 *   .addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);
 * console.log(msg.toString());
 *
 * // To emit HL7 explicit null ("") instead of absent:
 * //   msg.setField("PID.2", '""');   // distinct from empty/omitted
 * ```
 */
export interface BuildMessageInit {
  /** HL7 message type, e.g. `"ADT^A01"` (code + trigger) or
   *  `"ORU^R01^ORU_R01"` (code + trigger + structure). Required (D-16). */
  readonly type: string;
  readonly sendingApp?: string;
  readonly sendingFacility?: string;
  readonly receivingApp?: string;
  readonly receivingFacility?: string;
  /** Auto-generated via `generateControlId()` when omitted (D-12). */
  readonly controlId?: string;
  /** `Date` formatted to HL7 `YYYYMMDDHHmmss` (UTC, seconds) when supplied;
   *  pre-formatted HL7 TS string passed through verbatim (D-13). Defaults to
   *  `new Date()`. */
  readonly timestamp?: Date | string;
  /** Defaults to `"2.5"`. */
  readonly version?: string;
  /** Defaults to `"P"` (production). */
  readonly processingId?: string;
}

/**
 * Construct an outbound `Hl7Message` from semantic MSH fields.
 * Implementation lives in Phase 5 Plan 05 (build-message). Stub throws.
 *
 * @example
 * ```ts
 * import { buildMessage } from "@cosyte/hl7-parser";
 * const msg = buildMessage({ type: "ADT^A01" });
 * console.log(msg.toString());
 * ```
 */
export function buildMessage(_init: BuildMessageInit): Hl7Message {
  throw new Error(
    "buildMessage: NOT IMPLEMENTED — Phase 5 Plan 05 (build-message) will fill this. " +
      "If you see this error, builder plans are running out of order.",
  );
}
```

**Step E — `src/builder/format-timestamp.ts` (stub; Plan 05 will fill):**

```typescript
/**
 * `formatHl7Timestamp` — format a JS `Date` to HL7 TS `YYYYMMDDHHmmss`
 * (UTC, second precision). Inverse of `src/parser/dates.ts::parseHl7Timestamp`
 * for the HL7 TS branch.
 *
 * Implementation lives in Phase 5 Plan 05 (build-message). Stub throws.
 *
 * Decisions (for Plan 05 implementer):
 * - D-13: second precision only (no `.SSSS`); UTC via `getUTC*` methods.
 * - D-31: zero deps — stdlib `Date` only.
 *
 * @internal
 */

/** @internal */
export function formatHl7Timestamp(_date: Date): string {
  throw new Error(
    "formatHl7Timestamp: NOT IMPLEMENTED — Phase 5 Plan 05 (build-message) will fill this. " +
      "If you see this error, builder plans are running out of order.",
  );
}
```

**Step F — `src/builder/control-id.ts` (stub; Plan 05 will fill):**

```typescript
/**
 * `generateControlId` — synthesise an HL7 message control ID for outbound
 * messages. Shape: 17-char UTC timestamp `YYYYMMDDHHmmssSSS` + 6 random
 * alphanumeric chars = 23 chars total (D-12).
 *
 * Implementation lives in Phase 5 Plan 05 (build-message). Stub throws.
 *
 * Decisions (for Plan 05 implementer):
 * - D-12: exact shape above; uniqueness via `Date.now()` + `Math.random()`;
 *   alphabet is plain `[A-Za-z0-9]` (Claude's Discretion: readability doesn't
 *   matter — IDs aren't human-typed).
 * - D-31: zero deps — stdlib only.
 *
 * @internal
 */

/** @internal */
export function generateControlId(): string {
  throw new Error(
    "generateControlId: NOT IMPLEMENTED — Phase 5 Plan 05 (build-message) will fill this. " +
      "If you see this error, builder plans are running out of order.",
  );
}
```

Run `pnpm typecheck` (expect green — types declared; bodies throw at runtime only).
Run `pnpm lint src/serialize src/builder`.
(No new tests in this task — Task 1 covered the only FULLY IMPLEMENTED file.)
  </action>
  <verify>
    <automated>pnpm tsc --noEmit &amp;&amp; pnpm lint src/serialize src/builder</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/serialize/to-string.ts && test -f src/serialize/to-json.ts && test -f src/serialize/pretty-print.ts` succeeds
    - `test -f src/builder/build-message.ts && test -f src/builder/format-timestamp.ts && test -f src/builder/control-id.ts` succeeds
    - `grep -q "export function emitMessage" src/serialize/to-string.ts` succeeds
    - `grep -q "export interface SerializedMessage" src/serialize/to-json.ts` succeeds
    - `grep -q "readonly encodingCharacters: EncodingCharacters" src/serialize/to-json.ts` succeeds
    - `grep -q "readonly warnings: readonly Hl7ParseWarning\[\]" src/serialize/to-json.ts` succeeds
    - `grep -q "readonly profile?:" src/serialize/to-json.ts` succeeds
    - `grep -q "Boundary-frozen\|boundary-frozen\|boundary freeze" src/serialize/to-json.ts` succeeds (W5 JSDoc note present)
    - `grep -q "export function emitJson" src/serialize/to-json.ts` succeeds
    - `grep -q "export function emitPrettyPrint" src/serialize/pretty-print.ts` succeeds
    - `grep -q "export interface BuildMessageInit" src/builder/build-message.ts` succeeds
    - `grep -q "readonly type: string" src/builder/build-message.ts` succeeds
    - `grep -q "readonly timestamp?: Date \| string" src/builder/build-message.ts` succeeds
    - `grep -q "export function buildMessage" src/builder/build-message.ts` succeeds
    - `grep -q "setField\|isNull" src/builder/build-message.ts` succeeds (W1 empty-vs-null JSDoc note present)
    - `grep -q "export function formatHl7Timestamp" src/builder/format-timestamp.ts` succeeds
    - `grep -q "export function generateControlId" src/builder/control-id.ts` succeeds
    - `grep -c "NOT IMPLEMENTED — Phase 5 Plan 0" src/serialize/*.ts src/builder/*.ts` returns a count >= 6
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/serialize src/builder` exits 0 with zero warnings
  </acceptance_criteria>
  <done>6 stub files created with full module JSDoc + live type declarations (SerializedMessage + BuildMessageInit) + stub function bodies throwing Plan-identified NOT IMPLEMENTED markers. W1 (empty-vs-null JSDoc) and W5 (boundary-freeze JSDoc) notes landed at the interface level so Plans 03 and 05 don't need to re-invent the wording. Plans 02/03/04/05 will each replace ONE function body.</done>
</task>

<task type="auto">
  <name>Task 3: Wire toString/toJSON/prettyPrint methods on Hl7Message + barrel additions</name>
  <files>src/model/message.ts, src/index.ts</files>
  <read_first>
    - src/model/message.ts (lines 1-50 imports + lines 290-380 around existing meta/patient/visit/observations/orders methods — insertion point is AFTER the 6 collection methods and BEFORE setField at line 444)
    - src/index.ts (lines 90-122 — Phase 3/4 exports end; Phase 5 additions land after pickMrn)
    - src/serialize/to-string.ts (Task 2 output — confirm `emitMessage` exported)
    - src/serialize/to-json.ts (Task 2 output — confirm `emitJson` + `SerializedMessage` exported)
    - src/serialize/pretty-print.ts (Task 2 output — confirm `emitPrettyPrint` exported)
    - src/builder/build-message.ts (Task 2 output — confirm `buildMessage` + `BuildMessageInit` exported)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-09 (buildMessage top-level), D-18 (toJSON is a class method so JSON.stringify works), D-21 (SerializedMessage exported from src/index.ts), D-29 (three emit methods are class methods on Hl7Message), D-30 (no emit caching — NO new cache slots)
    - .planning/phases/04-named-helpers/04-PLAN-01-scaffold-xcn-and-cache.md Task 3 (the exact file-modification pattern — import list + method insertion + barrel update)
  </read_first>
  <behavior>
    - `msg.toString()` compiles and typechecks — body delegates to `emitMessage(this)`.
    - `msg.toJSON()` compiles and typechecks — return type is `SerializedMessage`; body delegates to `emitJson(this)`.
    - `msg.prettyPrint()` compiles and typechecks — body delegates to `emitPrettyPrint(this)`.
    - All three methods throw the underlying stub's NOT IMPLEMENTED error when invoked (because their targets are stubs — Plans 02/03/04 fill).
    - `import { buildMessage, type BuildMessageInit, type SerializedMessage } from "@cosyte/hl7-parser"` resolves all three symbols.
    - `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test` all succeed — no new tests exercise the stubs directly; the 459 existing Phase 4 tests remain green.
    - `JSON.stringify(msg)` SHOULD invoke `msg.toJSON()` automatically (JS lang contract); this is not unit-tested here because the body throws — Plan 03 verifies.
    - No new cache slots added (D-30).
  </behavior>
  <action>
**Modify `src/model/message.ts`:**

1. **Add imports** — AFTER the existing import block (ends around line 42 based on current file, just before `const SEGMENT_NAME_RE`), INSERT:

```typescript
import { emitMessage } from "../serialize/to-string.js";
import { emitJson, type SerializedMessage } from "../serialize/to-json.js";
import { emitPrettyPrint } from "../serialize/pretty-print.js";
```

Keep the existing import ordering — these three go immediately AFTER the last existing `../helpers/*` import line, before any parser-side imports if any trail.

2. **Add 3 instance methods** — INSERTION POINT: after the last collection method (`public insurance(): readonly Insurance[] { ... }`, roughly lines 390-415 depending on current layout) and BEFORE `public setField(...)` at line 444. Confirm the insertion point by reading the file first; the existing pattern is one blank line between methods.

```typescript
  /**
   * Emit this message as spec-clean HL7 (SER-01). Re-walks `rawSegments`
   * on every call (D-30 no caching). Segments are joined with `\r` per
   * D-05; MSH-1 and MSH-2 are inlined verbatim from
   * `this.encodingCharacters` per D-06; every field string passes through
   * `reescape` per D-04. `RawField.isNull === true` is preserved as the
   * HL7 literal `""` (D-02). Pure — never warns, never throws (D-07).
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7-parser";
   * const msg = parseHL7(raw);
   * console.log(msg.toString()); // spec-clean, CR-separated HL7
   * ```
   */
  public toString(): string {
    return emitMessage(this);
  }

  /**
   * Emit this message as a structured `SerializedMessage` JSON projection
   * (SER-03). Invoked automatically by `JSON.stringify(msg)` (D-18).
   * Re-walks `rawSegments` on every call (D-30 no caching). Mirrors the
   * raw tree one-for-one, preserves `isNull`, always includes
   * `warnings: []`, and includes `profile: { name, lineage }` only when
   * `this.profile` is truthy (D-19/D-20). Pure — never warns, never throws.
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7-parser";
   * const msg = parseHL7(raw);
   * const snap = msg.toJSON();
   * console.log(snap.segments[0]?.name); // "MSH"
   * console.log(JSON.stringify(msg));     // same content, auto-invokes toJSON
   * ```
   */
  public toJSON(): SerializedMessage {
    return emitJson(this);
  }

  /**
   * Emit this message as a human-readable multi-line string for logs and
   * debugging (SER-04). Single opinionated format (D-22 no options):
   * header line with type / controlId / timestamp / segment count, then
   * one line per segment with labeled `[N]=value` fields (D-23). Composite
   * values render as their raw HL7 string — depth stops at field level
   * (D-24). Pure — never warns, never throws (D-26).
   *
   * **Field values render as their raw HL7 string representation.**
   * Embedded delimiters in user data appear as escape sequences — e.g.
   * a patient family name containing `|` renders as `Smith\F\Jones`
   * (NOT `Smith|Jones`). This preserves round-trip fidelity: copy-pasting
   * prettyPrint output into `parseHL7` yields a structurally equivalent
   * message. For un-escaped human display, parse the composite first via
   * typed accessors (e.g. `msg.patient?.familyName`) — those return
   * already-decoded strings.
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7-parser";
   * const msg = parseHL7(raw);
   * console.log(msg.prettyPrint());
   * // HL7 ADT^A01  controlId=MSG001  timestamp=2026-04-19T10:15:00Z  (5 segments)
   * // MSH  [3]=SENDAPP  [4]=SENDFAC  ...
   * // PID  [1]=1  [3]=MRN123  [5]=Doe^John
   * ```
   */
  public prettyPrint(): string {
    return emitPrettyPrint(this);
  }
```

**Note on `toString`:** This method name IS defined on `Object.prototype` with
signature `(): string`. TypeScript permits the override because the return
type matches. Do NOT add `override` keyword (class does not extend anything
explicit). If ESLint `@typescript-eslint/no-base-to-string` or similar
complains, the narrowly scoped `// eslint-disable-next-line` pattern used
elsewhere in the codebase may be needed — but prefer pushing through without
a disable and only adding one if lint reports a real rule hit.

**Do NOT add cache slots.** D-30: no emit caching in v1. `invalidateCaches()`
remains unchanged from Phase 4.

**Modify `src/index.ts`:**

After the existing `export { pickMrn } from "./helpers/pick-mrn.js";` line
(currently line 121), APPEND:

```typescript

// Phase 5: outbound construction + serialization types.
// D-09: `buildMessage` is a top-level named export, symmetric with `parseHL7`.
// D-21: `SerializedMessage` is a top-level type export (not under the HL7
// namespace — that namespace is composite-type territory).
// The three emit methods (`toString`, `toJSON`, `prettyPrint`) land as
// instance methods on the already-exported `Hl7Message` class — no new
// named exports needed for them.
export { buildMessage } from "./builder/build-message.js";
export type { BuildMessageInit } from "./builder/build-message.js";
export type { SerializedMessage } from "./serialize/to-json.js";
```

Do NOT add the internal emit-field / emit-segment / emitMessage / emitJson /
emitPrettyPrint / formatHl7Timestamp / generateControlId functions to the
barrel — they are `@internal`. (Phase 6 profile hooks may promote `emitField`
/ `emitSegment` later.)

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (459 existing
+ 22 new serialize-emit-field = 481+ tests; all should pass — nothing
exercises the stubbed bodies in this plan).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit &amp;&amp; pnpm lint &amp;&amp; pnpm build &amp;&amp; pnpm test 2>&amp;1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'import { emitMessage } from "../serialize/to-string.js"' src/model/message.ts` succeeds
    - `grep -q 'import { emitJson, type SerializedMessage } from "../serialize/to-json.js"' src/model/message.ts` succeeds
    - `grep -q 'import { emitPrettyPrint } from "../serialize/pretty-print.js"' src/model/message.ts` succeeds
    - `grep -q "public toString(): string" src/model/message.ts` succeeds
    - `grep -q "public toJSON(): SerializedMessage" src/model/message.ts` succeeds
    - `grep -q "public prettyPrint(): string" src/model/message.ts` succeeds
    - `grep -q "return emitMessage(this)" src/model/message.ts` succeeds
    - `grep -q "return emitJson(this)" src/model/message.ts` succeeds
    - `grep -q "return emitPrettyPrint(this)" src/model/message.ts` succeeds
    - `grep -q "Smith.F.Jones\|raw HL7 string representation\|escape sequences" src/model/message.ts` succeeds (W2 prettyPrint JSDoc note present)
    - `grep -q 'export { buildMessage } from "./builder/build-message.js"' src/index.ts` succeeds
    - `grep -q 'export type { BuildMessageInit }' src/index.ts` succeeds
    - `grep -q 'export type { SerializedMessage }' src/index.ts` succeeds
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint` exits 0 with zero warnings
    - `pnpm build` exits 0 (tsup produces dist/ with updated .d.ts)
    - `pnpm test` exits 0 with >= 481 tests passing (459 existing + >= 22 serialize-emit-field)
    - After build, `grep -E "(buildMessage|BuildMessageInit|SerializedMessage)" dist/index.d.ts` finds all three symbols
  </acceptance_criteria>
  <done>Hl7Message gains 3 instance methods (toString/toJSON/prettyPrint) each delegating to its module-level emitter; prettyPrint JSDoc warns about raw-escape rendering for human display (W2); src/index.ts exports buildMessage + BuildMessageInit + SerializedMessage; full pipeline green. Plans 02/03/04/05 can now edit ONLY the function body inside their assigned serialize or builder file without touching message.ts, index.ts, or each other.</done>
</task>

<task type="auto">
  <name>Task 4: Extend vitest coverage per-directory thresholds to src/serialize/** and src/builder/**</name>
  <files>vitest.config.ts</files>
  <read_first>
    - vitest.config.ts (current — lines 1-61; coverage.thresholds block at lines 34-58)
    - CLAUDE.md (the ">= 90% on src/parser/, src/model/, src/helpers/" guardrail — Phase 5 extends the set)
    - .planning/ROADMAP.md (Phase 7 is the "coverage + vendor quirks" phase where `pnpm test:coverage` is run as a gate)
  </read_first>
  <behavior>
    - `vitest.config.ts` `coverage.include` remains `["src/**/*.ts"]` (no change — already globs `src/serialize` + `src/builder`).
    - `vitest.config.ts` `coverage.thresholds` gains two new per-directory entries at the same >= 90% bar as the existing entries: `src/serialize/**` and `src/builder/**`.
    - Entries use the exact same shape as the existing `src/parser/**` / `src/model/**` / `src/helpers/**` blocks: `{ lines: 90, branches: 85, functions: 90, statements: 90 }`.
    - `pnpm tsc --noEmit` still passes after the edit (config is plain TS).
    - `pnpm test` still passes (coverage is opt-in via `pnpm test:coverage` — non-coverage runs unaffected).
    - This task is LOAD-BEARING for Phase 7: without it, `pnpm test:coverage` would silently skip per-directory enforcement for the new `src/serialize/**` and `src/builder/**` dirs (top-level 90% can still pass even if one new dir is at 60% as long as the overall average is >= 90%). Per-directory thresholds close that hole.
  </behavior>
  <action>
**Step A — Read `vitest.config.ts`** to confirm the current shape of the
`coverage.thresholds` block. The existing entries (as of Phase 1) are:

```typescript
thresholds: {
  lines: 90,
  branches: 85,
  functions: 90,
  statements: 90,
  // Per-directory thresholds matching CLAUDE.md guardrail.
  "src/parser/**": { lines: 90, branches: 85, functions: 90, statements: 90 },
  "src/model/**":  { lines: 90, branches: 85, functions: 90, statements: 90 },
  "src/helpers/**":{ lines: 90, branches: 85, functions: 90, statements: 90 },
},
```

**Step B — Add the two new entries** immediately after `"src/helpers/**"`,
preserving the 4-space indent and trailing comma pattern. The final
`coverage.thresholds` block should read:

```typescript
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
  // Phase 5 additions — `src/serialize/**` is the emit pipeline
  // (emit-field, to-string, to-json, pretty-print); `src/builder/**` is
  // the outbound factory (build-message, format-timestamp, control-id).
  // Same >= 90% bar so Phase 7's `pnpm test:coverage` gate applies
  // uniformly across the whole `src/` tree.
  "src/serialize/**": {
    lines: 90,
    branches: 85,
    functions: 90,
    statements: 90,
  },
  "src/builder/**": {
    lines: 90,
    branches: 85,
    functions: 90,
    statements: 90,
  },
},
```

Do NOT touch anything else in `vitest.config.ts` — the `include` / `exclude`
globs, provider settings, reporters, include list, and top-level thresholds
are all correct as-is.

**Step C — Verify:**

1. Run `pnpm tsc --noEmit` — config typechecks.
2. Run `pnpm test` — non-coverage suite still green.
3. (Optional smoke, not required to pass in Phase 5 — Plans 02-05 fill the
   bodies that coverage will measure): `pnpm test:coverage` at this stage
   will report low coverage for `src/serialize/**` and `src/builder/**`
   because Plan 01 only ships ONE FULLY IMPLEMENTED file (`emit-field.ts`);
   that's EXPECTED at the Phase 5 Plan 01 boundary. Phase 7 is where the
   gate goes live.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit &amp;&amp; pnpm test 2>&amp;1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -qE '"src/serialize/\*\*"' vitest.config.ts` succeeds (B2 serialize threshold present)
    - `grep -qE '"src/builder/\*\*"' vitest.config.ts` succeeds (B2 builder threshold present)
    - `grep -c 'lines: 90' vitest.config.ts` returns a count >= 6 (top-level + 5 per-dir entries)
    - `grep -c 'branches: 85' vitest.config.ts` returns a count >= 6
    - `grep -q 'src/parser/\*\*' vitest.config.ts` still succeeds (existing entry preserved)
    - `grep -q 'src/model/\*\*' vitest.config.ts` still succeeds (existing entry preserved)
    - `grep -q 'src/helpers/\*\*' vitest.config.ts` still succeeds (existing entry preserved)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm test` exits 0 (non-coverage run — coverage gate NOT required to pass in Plan 01)
  </acceptance_criteria>
  <done>`vitest.config.ts` extends per-directory coverage thresholds to include `src/serialize/**` and `src/builder/**` at the same >= 90% bar as the existing Phase 1/2/3/4 dirs. Phase 7's `pnpm test:coverage` gate will now enforce uniform coverage across all 5 top-level src dirs. Non-coverage test runs unchanged.</done>
</task>

</tasks>

<verification>
Run the Phase 4 baseline + Phase 5 Plan 01 additions end-to-end:

```bash
pnpm tsc --noEmit   # strict TS passes with new interfaces + method signatures + updated config
pnpm lint           # ESLint passes (JSDoc @example on every public export)
pnpm test           # >= 481 tests pass (459 existing + >= 22 serialize-emit-field)
pnpm build          # tsup emits dist/ with updated type declarations
```

Verify `dist/index.d.ts` (after build) exports the Phase 5 additions at the type level:

```bash
grep -E "(buildMessage|BuildMessageInit|SerializedMessage)" dist/index.d.ts
```

Should show:
- `declare function buildMessage(init: BuildMessageInit): Hl7Message;`
- `interface BuildMessageInit { ... }`
- `interface SerializedMessage { ... }`

Verify `Hl7Message` class in `dist/index.d.ts` declares the three new methods:

```bash
grep -E "(toString|toJSON|prettyPrint)" dist/index.d.ts
```

Should show method declarations with the correct return types
(`string`, `SerializedMessage`, `string`).

Smoke-test that invoking a stubbed method throws the expected marker:

```bash
node --input-type=module -e "
  const { parseHL7 } = await import('./dist/index.mjs');
  const msg = parseHL7('MSH|^~\\\\&|A|B|C|D|20260419|||1|P|2.5\r');
  try { msg.toString(); console.log('FAIL: did not throw'); }
  catch (e) { console.log(e.message.includes('NOT IMPLEMENTED') ? 'OK: toString stub throws' : 'FAIL: wrong error'); }
"
```

Verify coverage thresholds config extension:

```bash
grep -E '"src/(serialize|builder)/\*\*"' vitest.config.ts
# should output both lines
```
</verification>

<success_criteria>
- All 7 new src files exist under `src/serialize/` and `src/builder/`.
- `emit-field.ts` is FULLY IMPLEMENTED and unit-tested (>= 22 cases green, including MSH guard throw per B1).
- `to-string.ts`, `pretty-print.ts`, `format-timestamp.ts`, `control-id.ts` are stubs that throw a plan-identified NOT IMPLEMENTED error.
- `to-json.ts` has the `SerializedMessage` interface LIVE + `emitJson` stubbed; interface JSDoc documents the boundary-freeze semantics (W5).
- `build-message.ts` has the `BuildMessageInit` interface LIVE + `buildMessage` stubbed; JSDoc documents the empty-vs-null wire semantics (W1).
- `Hl7Message` has 3 new instance methods (`toString`, `toJSON`, `prettyPrint`), each delegating to the module-level emitter; `prettyPrint` JSDoc documents raw-escape rendering (W2).
- `src/index.ts` exports `buildMessage`, `BuildMessageInit`, `SerializedMessage`.
- `vitest.config.ts` per-directory coverage thresholds extended to `src/serialize/**` and `src/builder/**` (B2 — load-bearing for Phase 7).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.
- Plans 02, 03, 04, 05 can now edit ONLY the body of their assigned function without touching `src/model/message.ts`, `src/index.ts`, `src/serialize/emit-field.ts`, `vitest.config.ts`, or any other plan's files.
</success_criteria>

<output>
After completion, create `.planning/phases/05-serialization-and-round-trip/05-01-SUMMARY.md` with:
- What shipped (emit-field primitive FULLY IMPLEMENTED with MSH guard; 6 stub files with LIVE type declarations; 3 Hl7Message instance methods wired; barrel additions; vitest coverage scope extended).
- Decisions locked this plan: D-02, D-04, D-07 (in emit-field — with MSH guard deviation documented), D-29 (method placement), D-09/D-10/D-17/D-21 (type shapes); plus Phase 7 coverage-gate readiness.
- Files created (7 src + 1 test = 8) + modified (3: message.ts, index.ts, vitest.config.ts).
- Test count before/after (459 → >= 481).
- Warnings addressed at interface level: W1 (empty-vs-null JSDoc on BuildMessageInit), W2 (raw-escape JSDoc on prettyPrint), W5 (boundary-freeze JSDoc on SerializedMessage).
- Any deviation from the plan flagged for Plans 02-05.
- Notes for Plans 02/03/04/05: each plan MUST NOT edit message.ts, index.ts, emit-field.ts, vitest.config.ts, the SerializedMessage interface, or the BuildMessageInit interface — only the METHOD BODY inside its assigned file.
</output>
</content>
</invoke>