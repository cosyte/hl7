---
phase: 05-serialization-and-round-trip
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/serialize/to-json.ts
  - test/serialize-to-json.test.ts
autonomous: true
requirements: [SER-03]

must_haves:
  truths:
    - "A developer calling `msg.toJSON()` on any parsed message receives a `SerializedMessage` whose `segments` array mirrors `rawSegments` one-for-one (same names, same field count, same repetitions/components/subcomponents, same `isNull` flags)."
    - "A developer calling `JSON.stringify(msg)` receives the same JSON projection as `JSON.stringify(msg.toJSON())` (D-18 — `toJSON` on the class is invoked automatically by `JSON.stringify`)."
    - "A developer calling `msg.toJSON()` on a message with zero warnings receives `warnings: []` (not `warnings: undefined`) — stable shape (D-19)."
    - "A developer calling `msg.toJSON()` on a message with a `profile` sees `profile: { name, lineage }` in the output; on a message without a profile the `profile` key is absent (D-20)."
    - "A developer importing `SerializedMessage` from `@cosyte/hl7-parser` can annotate a variable and TypeScript narrows correctly on `encodingCharacters`, `segments`, `warnings`, and optional `profile` (D-21)."
    - "A developer inspecting `Object.isFrozen(msg.toJSON())` sees `true` — the top-level snapshot is boundary-frozen (W5). Inner arrays remain mutable at runtime by design (D-30 cost doctrine — emit is hot-path)."
  artifacts:
    - path: "src/serialize/to-json.ts"
      provides: "emitJson body — raw-tree mirror with warnings + optional profile"
      exports: ["emitJson"]
      contains: "return Object.freeze"
    - path: "test/serialize-to-json.test.ts"
      provides: "Full SER-03 unit coverage — shape, isNull preservation, warnings stable, profile conditional (present/absent + exact-keys), JSON.stringify integration, boundary-freeze assertion"
  key_links:
    - from: "src/serialize/to-json.ts::emitJson"
      to: "msg.rawSegments (raw-tree mirror)"
      via: "direct projection — no parser, no mutation, no cache"
      pattern: 'msg\.rawSegments'
    - from: "src/serialize/to-json.ts::emitJson"
      to: "msg.warnings + msg.profile (optional)"
      via: "pass-through; profile only when truthy"
      pattern: 'msg\.profile'
    - from: "JSON.stringify(msg)"
      to: "msg.toJSON (method on Hl7Message)"
      via: "JS language contract — toJSON invoked automatically"
      pattern: 'JSON\.stringify'
---

<objective>
Fill the `emitJson` body in `src/serialize/to-json.ts`. This plan CLOSES
**SER-03** (`msg.toJSON()` returns a structured JSON representation of the
full message).

**Body-only edit:** Plan 01 shipped `src/serialize/to-json.ts` with:
- The module JSDoc header (including the W5 boundary-freeze explanation).
- The `SerializedMessage` interface (LIVE — already consumable; JSDoc notes
  that the top-level is boundary-frozen and inner arrays are readonly at
  the TS type level but mutable at runtime).
- Imports for `Hl7Message`, `EncodingCharacters`, `Hl7ParseWarning`.
- The `emitJson(msg: Hl7Message): SerializedMessage` stub throwing
  `NOT IMPLEMENTED — Phase 5 Plan 03`.

Plan 03 ONLY replaces the function body and adds tests. Do NOT touch the
module JSDoc, the `SerializedMessage` interface, the imports, or the
function signature — and do NOT touch `src/model/message.ts` (Plan 01 wired
`toJSON` already) or `src/index.ts` (Plan 01 exported `SerializedMessage`).

**Type-driven constraint (critical — B3):**

`Hl7Message.profile` is typed as `{ readonly name: string; readonly lineage:
readonly string[] } | undefined` (see `src/model/message.ts` line ~129).
`lineage` is REQUIRED — not optional. This means:

- `msg.profile` is EITHER `undefined` OR an object with BOTH `name` and
  `lineage`. There is no type-reachable case where `msg.profile.lineage`
  is missing/undefined.
- Any additional fields (`onWarning`, `customSegments`, `dateFormats`,
  `description`) are NOT part of the `Hl7Message.profile` field's TYPE —
  those live on the optional `Profile` descriptor passed to `parseHL7`,
  not on the already-strip-to-`{name, lineage}` field stored on the message.
- Therefore the original plan's test cases "profile does NOT include
  non-serializable fields" (#14) and "profile.lineage defaults to [] when
  not set" (#15) were TYPE-UNREACHABLE — they required constructing an
  `Hl7Message.profile` shape that the type system forbids. Those tests
  have been REMOVED; the D-20 contract is verified structurally instead
  (exact `{name, lineage}` keys via `Object.keys().sort()` deepEqual).
- The `emitJson` implementation also removes the `?? []` fallback on
  `msg.profile.lineage` — it is dead code given the type guarantee. Upstream
  stripping (from a raw Profile descriptor with extra fields down to
  `{name, lineage}`) happens at parser-construction time, not in emitJson.

**Decisions implemented verbatim:**

- **D-17: raw-tree mirror.** The `SerializedMessage` shape is:
  ```typescript
  interface SerializedMessage {
    encodingCharacters: { field, component, repetition, escape, subcomponent: string };
    segments: ReadonlyArray<{
      name: string;
      fields: ReadonlyArray<{
        repetitions: ReadonlyArray<{
          components: ReadonlyArray<{ subcomponents: readonly string[] }>;
        }>;
        isNull: boolean;
      }>;
    }>;
    warnings: readonly Hl7ParseWarning[];
    profile?: { name: string; lineage: readonly string[] };
  }
  ```
  Implementation is a direct JSON-safe projection of `msg.rawSegments` +
  frozen warnings + optional profile. Segment order preserved; `isNull`
  flag preserved; no computed helpers baked in.

- **D-18: class method on `Hl7Message`.** Already wired in Plan 01 — plan
  03 fills the body; `JSON.stringify(msg)` will then work automatically.

- **D-19: warnings always present.** `warnings: []` when empty, NEVER
  `warnings: undefined` and NEVER omitted. Stable shape simplifies
  consumer parsing.

- **D-20: `profile` field conditional.** When `msg.profile` is truthy,
  include `profile: { name: msg.profile.name, lineage: msg.profile.lineage }`
  — exactly those two keys, nothing else. When `msg.profile` is undefined,
  OMIT the key entirely (matches `exactOptionalPropertyTypes` semantics —
  the type declared `profile?` so an absent key is valid; `profile: undefined`
  is NOT valid).

- **D-21: exported from `src/index.ts`** — already shipped in Plan 01.

- **D-07 implicit:** `emitJson` is a pure projection. Never warns, never
  throws, never mutates input.

- **D-30: no caching.** Each call re-walks `rawSegments`. Do NOT add
  private cache slots. Do NOT memoise.

- **W5 boundary freeze.** Top-level `Object.freeze(out)` BEFORE return —
  `Object.isFrozen(msg.toJSON()) === true`. Inner arrays are readonly at
  the TS type level but NOT deep-frozen at runtime (D-30 cost doctrine —
  emit is hot-path; deep-freeze would add traversal cost with no
  observable benefit beyond what the readonly type contract provides).

**Claude's Discretion resolved:**

- `SerializedMessage.segments[i].fields[j].repetitions` is ALWAYS `[]`
  when the field has zero repetitions (CONTEXT.md discretion:
  "always `[]` for shape-stability" — accepted). No conditional branch
  to omit the key.

**In scope:**

1. Replace the stub body in `src/serialize/to-json.ts::emitJson` with the
   D-17 raw-tree mirror + D-19 stable warnings + D-20 conditional profile.
2. Create `test/serialize-to-json.test.ts` — unit coverage of the
   SER-03 contract.

**Out of scope:**

- `fromJSON(serialized): Hl7Message` → v2 (deferred per CONTEXT §deferred).
- `SerializedMessage` shape changes → locked by D-17; do NOT modify the
  interface declaration.
- Profile handler semantics → Phase 6.

Output: 1 modified src file (body only) + 1 new test file.
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
<!-- Plan 01 outputs that Plan 03 consumes. Read directly from code
     if anything looks stale. -->

From src/serialize/to-json.ts (Plan 01 output — body to replace):
- existing module JSDoc (KEEP — includes W5 boundary-freeze explanation)
- import type { Hl7Message } from "../model/message.js";        (KEEP)
- import type { EncodingCharacters } from "../parser/types.js"; (KEEP)
- import type { Hl7ParseWarning } from "../parser/warnings.js"; (KEEP)
- export interface SerializedMessage { ... }                    (KEEP — locked by D-17; JSDoc documents boundary-freeze semantics)
- export function emitJson(_msg: Hl7Message): SerializedMessage { throw ... }
  (REPLACE BODY ONLY)

From src/model/message.ts (Phase 4 complete — DO NOT MODIFY):
- public readonly rawSegments: readonly RawSegment[]
- public readonly encodingCharacters: EncodingCharacters
- public readonly warnings: readonly Hl7ParseWarning[]  (already frozen at construction)
- public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined
  (NOTE: `lineage` is REQUIRED when profile is defined — NOT optional. This
   rules out the "profile with no lineage" test case from the original
   Plan 03 draft — see B3 in the revision notes.)
- public toJSON(): SerializedMessage  (Plan 01 wired this to delegate to emitJson)

From src/parser/types.ts:
- RawSegment { name: string; fields: readonly RawField[] }
- RawField { repetitions: readonly RawRepetition[]; isNull: boolean }
- RawRepetition { components: readonly RawComponent[] }
- RawComponent { subcomponents: readonly string[] }
- EncodingCharacters { field, component, repetition, escape, subcomponent: string }
- Profile { name: string; description?: string; lineage?: readonly string[]; ... }
  (Note: the DESCRIPTOR passed to parseHL7 can have extra fields; the
   FIELD stored on Hl7Message is pre-stripped to `{name, lineage}` —
   different type, different shape.)

From src/helpers/meta.ts (PATTERN analog — NOT imported by this plan):
- Mutable<T> + Object.freeze pattern (lines 38-109). Mirror the
  exactOptionalPropertyTypes-safe conditional-assign shape for the
  optional `profile` field.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement emitJson body (raw-tree mirror + stable warnings + conditional profile) with full unit coverage</name>
  <files>src/serialize/to-json.ts, test/serialize-to-json.test.ts</files>
  <read_first>
    - src/serialize/to-json.ts (Plan 01 stub — body only to replace; confirm SerializedMessage interface is intact)
    - src/model/message.ts (confirm rawSegments/encodingCharacters/warnings/profile public readonly fields; CONFIRM profile field type is `{name, lineage} | undefined` with lineage REQUIRED when defined)
    - src/parser/types.ts (Raw* shapes — the source tree that emitJson mirrors)
    - src/helpers/meta.ts (lines 38-109 — Mutable<T> + Object.freeze + conditional-assign pattern)
    - src/parser/index.ts (parseHL7 — consumed by tests; understand how `profile` is populated on msg when present)
    - test/helpers-meta.test.ts (shape-assertion test style analog)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-17 (exact shape), D-18 (class method wiring), D-19 (warnings always present), D-20 (profile conditional — exactly {name, lineage} keys), D-21 (exported from index), D-30 (no caching), and §Claude's Discretion "SerializedMessage.segments[i].fields[j].repetitions when empty → always []"
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/serialize/to-json.ts" section (lines 117-173)
  </read_first>
  <behavior>
    - `emitJson(msg)` returns an object whose `encodingCharacters` is structurally equal to `msg.encodingCharacters` (5 string fields).
    - `emitJson(msg).segments.length === msg.rawSegments.length`.
    - `emitJson(msg).segments[i].name === msg.rawSegments[i].name` for every i.
    - `emitJson(msg).segments[i].fields.length === msg.rawSegments[i].fields.length`.
    - `emitJson(msg).segments[i].fields[j].isNull === msg.rawSegments[i].fields[j].isNull` for every (i, j).
    - `emitJson(msg).segments[i].fields[j].repetitions` is an array (NEVER undefined). When `msg.rawSegments[i].fields[j].repetitions.length === 0`, the output is `[]`, NOT omitted.
    - Subcomponent strings are copied verbatim (no re-escape — the JSON projection stores already-decoded text).
    - On a message with zero warnings, `emitJson(msg).warnings` is `[]` (strict equality checked via `Array.isArray` + `length === 0`, not via identity to a frozen empty array sentinel — D-19 only requires stable shape, not identity).
    - On a message with N warnings, `emitJson(msg).warnings.length === N` and each warning object is structurally equal to the original (pass-through — already frozen at message construction).
    - On a message WITHOUT profile (`msg.profile === undefined`), the returned object does NOT have a `profile` key: `"profile" in emitJson(msg) === false`.
    - On a message WITH profile (`msg.profile` is truthy, so MUST have both `name` and `lineage` per the type), the returned object has `profile: { name: msg.profile.name, lineage: msg.profile.lineage }` — and ONLY those 2 keys. Structural contract: `Object.keys(snap.profile).sort()` deepEquals `["lineage", "name"]`.
    - `JSON.stringify(msg)` produces the same string as `JSON.stringify(emitJson(msg))` (D-18 — class method auto-invocation).
    - `JSON.stringify(emitJson(msg))` is valid JSON (parseable by `JSON.parse`).
    - `emitJson` never throws on any parseable input.
    - `emitJson` is deterministic — two back-to-back calls return structurally equal objects.
    - `emitJson` does not mutate `msg` or any part of `msg.rawSegments` / `msg.warnings`.
    - D-30: the returned object is a NEW object each call (not a cached reference — `emitJson(msg) !== emitJson(msg)` for referential inequality, but deep-equal).
    - `isNull === true` field with zero repetitions serialises to `{ repetitions: [], isNull: true }` (matches D-17 + CONTEXT discretion).
    - **W5 boundary freeze:** `Object.isFrozen(emitJson(msg)) === true` — the top-level returned object is frozen. Inner arrays (`segments`, `warnings`, etc.) are readonly at the TS type level but NOT runtime-frozen (deep-freeze rejected per D-30 cost doctrine).
    - **Profile field structural contract (D-20 + B3):** when present, `profile` contains EXACTLY the two keys `name` and `lineage` — no additional keys (assert via `Object.keys(snap.profile ?? {}).sort()` deepEquals `["lineage", "name"]`). This encodes the D-20 contract without requiring a type-impossible input shape. The upstream `Hl7Message.profile` field is already pre-stripped to `{name, lineage}` by the parser constructor — emitJson does NOT re-strip or filter; it just forwards those two keys.
  </behavior>
  <action>
**Step A — Replace the body of `src/serialize/to-json.ts::emitJson`:**

Open the file. Keep the module JSDoc, the 3 existing `import type` lines,
the `SerializedMessage` interface declaration, and the `export function
emitJson(msg: Hl7Message): SerializedMessage {` signature. Change the
parameter name from `_msg` to `msg` (it's now used). Replace the
`throw new Error(...)` body with the implementation below.

**Note on the B3 fix (no `?? []` on lineage):** The original draft had
`lineage: msg.profile.lineage ?? []`. That fallback is DEAD CODE because
`Hl7Message.profile`'s TYPE requires `lineage: readonly string[]` when
profile is defined. TypeScript's `noUncheckedIndexedAccess` / strict mode
guarantees `msg.profile.lineage` is never undefined inside the
`if (msg.profile !== undefined)` branch. Removing the `?? []` fallback.

Final shape (everything above the function body stays):

```typescript
// (module JSDoc + 3 imports + SerializedMessage interface — all from Plan 01, unchanged.)

/**
 * Build the `SerializedMessage` snapshot from a parsed message (SER-03).
 * Raw-tree mirror per D-17; warnings array always present (D-19); profile
 * included only when `msg.profile` is truthy (D-20). Pure — never warns,
 * never throws. Not cached (D-30).
 *
 * Boundary-frozen: the top-level returned object passes through
 * `Object.freeze` before return — `Object.isFrozen(result)` is `true`.
 * Inner arrays are readonly at the TS type level but NOT runtime-frozen
 * (D-30 cost doctrine — emit is hot-path; deep-freeze would add
 * traversal cost with no observable benefit beyond the type contract).
 *
 * @internal
 */
export function emitJson(msg: Hl7Message): SerializedMessage {
  // Raw-tree mirror — copy structure; keep subcomponent strings verbatim.
  const segments = msg.rawSegments.map((seg) => ({
    name: seg.name,
    fields: seg.fields.map((field) => ({
      // D-17 + discretion: repetitions always `[]` when empty (shape-stable).
      repetitions: field.repetitions.map((rep) => ({
        components: rep.components.map((comp) => ({
          subcomponents: comp.subcomponents.slice(),
        })),
      })),
      isNull: field.isNull,
    })),
  }));

  // D-20: include `profile` only when `msg.profile` is truthy. Use the
  // Mutable<T> + conditional-assign pattern from `src/helpers/meta.ts`
  // so exactOptionalPropertyTypes stays happy (an absent key is valid;
  // an explicit `profile: undefined` is NOT valid with that compiler flag).
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<SerializedMessage> = {
    encodingCharacters: {
      field: msg.encodingCharacters.field,
      component: msg.encodingCharacters.component,
      repetition: msg.encodingCharacters.repetition,
      escape: msg.encodingCharacters.escape,
      subcomponent: msg.encodingCharacters.subcomponent,
    },
    segments,
    // D-19: always present. `msg.warnings` is already frozen at Hl7Message
    // construction (Phase 2 D-07); pass-through is safe.
    warnings: msg.warnings,
  };

  if (msg.profile !== undefined) {
    // B3: `msg.profile.lineage` is typed as `readonly string[]` — REQUIRED,
    // not optional. No `?? []` fallback needed (and none emitted — the
    // original draft's fallback was dead code given the type guarantee).
    // The upstream parser constructor already strips any non-{name, lineage}
    // fields off the original Profile descriptor before assigning to
    // `Hl7Message.profile`, so forwarding those two keys verbatim satisfies
    // D-20 exactly.
    out.profile = {
      name: msg.profile.name,
      lineage: msg.profile.lineage,
    };
  }

  // W5: boundary-freeze at the top level. Inner arrays are readonly at the
  // type level but mutable at runtime — deep-freeze rejected per D-30
  // (hot-path; no observable benefit over the TS readonly contract).
  return Object.freeze(out) as SerializedMessage;
}
```

Notes:

1. The `.map().map().map()` chain produces plain JS objects (no frozen
   inner nodes). The outer `Object.freeze(out)` only freezes the top
   level — that's intentional (W5 + D-30).
2. `subcomponents.slice()` decouples the output array from the input
   array. Strings are primitive so no further copy needed.
3. `Object.freeze(out) as SerializedMessage` — the cast is safe because
   we populated every required field before freezing.
4. No `?? []` fallback on `lineage` — dead code given type guarantee (B3).

**Step B — Create `test/serialize-to-json.test.ts`:**

Convention: Vitest describe/it, import `parseHL7` and optionally
`Hl7Message` + `SerializedMessage` from `../src/index.js`. Use a FIXTURE
const for the happy path.

Required test cases:

**Block 1: Raw-tree mirror shape (D-17)**
1. "encodingCharacters mirrors msg.encodingCharacters" — all 5 string fields match.
2. "segments array mirrors rawSegments 1-for-1" — `.length` match; `.name` match for each index.
3. "field count per segment matches rawSegments" — `.fields.length` match for every segment.
4. "repetitions/components/subcomponents mirror raw tree" — for a chosen segment (e.g. PID), assert the entire nested structure is deeply equal to the raw slice.
5. "isNull flag preserved" — fixture with `""` null field; the corresponding `fields[N].isNull === true` in the serialized output.
6. "subcomponents verbatim (no re-escape)" — input containing escape sequences: `Field.value` after parse is decoded text (e.g. `"A|B"` from `"A\\F\\B"`); the serialized `subcomponents[0]` is the decoded text, NOT re-escaped.

**Block 2: Repetitions always present as [] (D-17 + discretion)**
7. "empty-field repetitions === []" — fixture with an absent field (`||`); the serialized output has `{ repetitions: [], isNull: false }`, NOT a missing key.
8. "null-field repetitions === []" — fixture with `""` null; the serialized output has `{ repetitions: [], isNull: true }`.

**Block 3: Warnings (D-19)**
9. "warnings === [] on clean message" — fixture with no warnings; `emitJson(msg).warnings` is an array of length 0.
10. "warnings pass-through on dirty message" — fixture with known Tier-2 warnings (e.g. MLLP-framed input); `emitJson(msg).warnings.length > 0`; each warning object structurally equals `msg.warnings[i]`.
11. "warnings is always an array" — `Array.isArray(emitJson(msg).warnings) === true` for both clean and dirty messages.

**Block 4: Profile (D-20 — restructured per B3)**
12. "profile absent when msg.profile is undefined" — parse without profile; `"profile" in emitJson(msg) === false`.
13. "profile present with name + lineage when msg.profile is truthy" — parse with a profile descriptor (e.g. `{ name: "epic", lineage: ["epic"] }` passed to `parseHL7`) and confirm the serialized output has `profile: { name: "epic", lineage: ["epic"] }`.
14. **"profile contains EXACTLY the keys `name` and `lineage` (D-20 structural contract)"** — parse with a profile; assert `Object.keys(snap.profile ?? {}).sort()` deepEquals `["lineage", "name"]`. This verifies the D-20 two-key contract WITHOUT needing a type-impossible input shape. (Upstream stripping of any non-serializable fields on the original Profile descriptor happens in the parser constructor, NOT in `emitJson` — so this test encodes the contract structurally at the output boundary where it's observable.)
15. (Removed — type-unreachable. The original "profile.lineage defaults to [] when not set" test required `msg.profile.lineage === undefined`, but the `Hl7Message.profile` type guarantees `lineage: readonly string[]` when profile is defined. Dropping this test; the behaviour block no longer promises the `?? []` fallback.)

**Block 5: JSON.stringify integration (D-18)**
16. "JSON.stringify(msg) equals JSON.stringify(msg.toJSON())" — `JSON.stringify(msg) === JSON.stringify(emitJson(msg))`.
17. "JSON.stringify(msg) round-trips via JSON.parse" — the parsed object has the same `segments[0].name` as the original.

**Block 6: Purity + non-mutation + no caching (D-07, D-30)**
18. "never throws on any parseable input" — 3 diverse fixtures wrapped in `expect().not.toThrow()`.
19. "does not mutate msg" — snapshot `msg.rawSegments` JSON; call emitJson; re-snapshot; deep equal.
20. "two calls return deeply equal objects" — `expect(emitJson(msg)).toEqual(emitJson(msg))` (structural equality).
21. "two calls return NEW references (D-30 no caching)" — `expect(emitJson(msg)).not.toBe(emitJson(msg))` (referential inequality — top-level objects are distinct).

**Block 7: SerializedMessage typing (D-21)**
22. "SerializedMessage annotation typechecks" — at compile time, `const s: SerializedMessage = emitJson(msg);` compiles. (This is an implicit `pnpm typecheck` check; no runtime assert needed — keep as a compile-only smoke test annotated in a comment, OR simply write the annotation in the test and let pnpm typecheck enforce.)

**Block 8: W5 boundary freeze**
23. "top-level SerializedMessage is frozen" — `const snap = emitJson(msg); expect(Object.isFrozen(snap)).toBe(true);`.
24. "inner arrays are NOT deep-frozen (D-30 cost doctrine — boundary-freeze only)" — `const snap = emitJson(msg); expect(Object.isFrozen(snap.segments)).toBe(false);` — documents the intentional runtime-mutability of inner arrays. (This test codifies the D-30 trade-off: TS readonly type contract + top-level freeze is sufficient; runtime deep-freeze rejected.)

Run `pnpm typecheck`, `pnpm lint`, `pnpm test -- serialize-to-json`.
  </action>
  <verify>
    <automated>pnpm test -- serialize-to-json.test.ts 2>&amp;1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/serialize/to-json.ts test/serialize-to-json.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'NOT IMPLEMENTED — Phase 5 Plan 03' src/serialize/to-json.ts` returns NO matches (stub has been replaced)
    - `grep -q "export function emitJson(msg: Hl7Message): SerializedMessage" src/serialize/to-json.ts` succeeds
    - `grep -q "msg.rawSegments.map" src/serialize/to-json.ts` succeeds (raw-tree mirror)
    - `grep -q "Object.freeze" src/serialize/to-json.ts` succeeds (W5 + D-17 boundary freeze)
    - `grep -q "if (msg.profile !== undefined)" src/serialize/to-json.ts` succeeds (D-20 conditional profile)
    - `grep -q "warnings: msg.warnings" src/serialize/to-json.ts` succeeds (D-19 pass-through)
    - `grep -q "export interface SerializedMessage" src/serialize/to-json.ts` succeeds (locked shape still in place)
    - `grep -qE 'lineage: msg.profile.lineage\b' src/serialize/to-json.ts` succeeds (B3 — straight assignment)
    - `grep -q '?? \[\]' src/serialize/to-json.ts` returns NO matches OR only matches unrelated to profile.lineage (B3 — the `?? []` fallback on lineage is removed)
    - `test -f test/serialize-to-json.test.ts` succeeds
    - `grep -q 'Object.keys.*snap.profile' test/serialize-to-json.test.ts || grep -q "\\[\"lineage\", \"name\"\\]" test/serialize-to-json.test.ts` succeeds (B3 — structural two-keys test present)
    - `grep -q 'Object.isFrozen' test/serialize-to-json.test.ts` succeeds (W5 freeze test present)
    - `grep -q "profile.lineage defaults to" test/serialize-to-json.test.ts` returns NO matches (B3 — type-unreachable test removed)
    - `grep -q "profile does NOT include non-serializable" test/serialize-to-json.test.ts` returns NO matches (B3 — type-unreachable test replaced with structural two-keys assertion)
    - `pnpm test -- serialize-to-json.test.ts` exits 0 with >= 22 test cases passing (reduced from 24 baseline after B3 drops 2 unreachable cases; net remains >= 22 after adding the freeze + structural-keys cases)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/serialize/to-json.ts test/serialize-to-json.test.ts` exits 0 with zero warnings
  </acceptance_criteria>
  <done>emitJson body implements the D-17/D-19/D-20 contract with no dead `?? []` fallback (B3); 22+ unit tests green including structural two-keys profile assertion (B3) and boundary-freeze assertion (W5); JSON.stringify(msg) integration verified; SER-03 closed.</done>
</task>

</tasks>

<verification>
Run the Phase 5 Plan 03 pipeline:

```bash
pnpm tsc --noEmit   # strict TS passes
pnpm lint           # ESLint passes with zero warnings
pnpm test           # Plan 01 + Plan 02 + Plan 03 tests all pass (>= 539 cases)
pnpm build          # tsup emits dist/ — SerializedMessage in .d.ts; emitJson body in the bundle
```

Smoke-test from the built bundle:

```bash
node --input-type=module -e "
  const { parseHL7 } = await import('./dist/index.mjs');
  const raw = 'MSH|^~\\\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001||Doe^John\r';
  const msg = parseHL7(raw);
  const snap = msg.toJSON();
  console.log('segments count:', snap.segments.length);
  console.log('MSH name:', snap.segments[0].name);
  console.log('warnings array:', Array.isArray(snap.warnings));
  console.log('profile absent:', !('profile' in snap));
  console.log('top-level frozen:', Object.isFrozen(snap));
  console.log('JSON.stringify integration:', JSON.stringify(msg) === JSON.stringify(snap));
"
```

Should print:
- `segments count: 2`
- `MSH name: MSH`
- `warnings array: true`
- `profile absent: true`
- `top-level frozen: true`
- `JSON.stringify integration: true`
</verification>

<success_criteria>
- `src/serialize/to-json.ts::emitJson` body implemented per D-17/D-19/D-20 with boundary freeze (W5) and NO dead `?? []` lineage fallback (B3).
- `SerializedMessage` interface unchanged (locked by D-17).
- `test/serialize-to-json.test.ts` >= 22 cases green (type-unreachable cases #14/#15 from the original draft REPLACED with a single structural two-keys assertion per B3; boundary-freeze assertion added per W5).
- SER-03 closed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.
- Plan 03 touched ONLY `src/serialize/to-json.ts` (body-only) + 1 new test file — no edit to `src/model/message.ts`, `src/index.ts`, `SerializedMessage` interface, or any other plan's files.
</success_criteria>

<output>
After completion, create `.planning/phases/05-serialization-and-round-trip/05-03-SUMMARY.md` with:
- What shipped (emitJson body; test coverage).
- REQ-IDs closed: SER-03.
- Decisions confirmed at runtime: D-17, D-18, D-19, D-20, D-21, D-30.
- Blocker B3 addressed: removed type-unreachable tests #14/#15; replaced with structural `Object.keys === ["lineage","name"]` assertion; dropped `?? []` dead-code fallback on `msg.profile.lineage`; updated behaviour contract to reflect that upstream stripping of non-serializable Profile-descriptor fields happens in the parser constructor, not in emitJson.
- Warning W5 addressed: top-level boundary-freeze assertion (`Object.isFrozen(snap) === true`) + JSDoc clarification on inner-array mutability (landed at interface level in Plan 01).
- Files created (1: test) + modified (1: to-json.ts body).
- Test count before/after.
- Any deviations flagged for Plans 04/05.
</output>
</content>
