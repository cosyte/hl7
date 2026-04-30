---
phase: 04-named-helpers
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/helpers/types.ts
  - src/helpers/pick-mrn.ts
  - src/helpers/meta.ts
  - src/helpers/patient.ts
  - src/helpers/visit.ts
  - src/helpers/observations.ts
  - src/helpers/orders.ts
  - src/helpers/next-of-kin.ts
  - src/helpers/allergies.ts
  - src/helpers/diagnoses.ts
  - src/helpers/insurance.ts
  - src/helpers/index.ts
  - src/model/types/xcn.ts
  - src/model/types/namespace.ts
  - src/model/types/index.ts
  - src/model/field.ts
  - src/model/message.ts
  - src/index.ts
  - test/helpers-pick-mrn.test.ts
  - test/types-xcn.test.ts
autonomous: true
requirements: [HELPERS-01, HELPERS-02, HELPERS-03, HELPERS-04, HELPERS-05, HELPERS-06, HELPERS-07]

must_haves:
  truths:
    - "A developer importing `Meta`, `Patient`, `Visit`, `Observation`, `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance` from `@cosyte/hl7-parser` gets typed interfaces."
    - "A developer importing `XCN` or `HL7.XCN` and `parseXcn` from `@cosyte/hl7-parser` gets a typed composite interface + parser."
    - "A developer calling `field.asXcn()` on any Field receives an `XCN` object (empty `{}` on empty fields, never throws)."
    - "A developer calling `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` receives the correctly typed shape (stub returns empty until Plans 02-04 fill)."
    - "A developer calling `msg.setField`/`msg.addSegment`/`msg.removeSegment` drops `_meta`/`_patient`/`_visit` caches alongside `_segmentsByType`/`_allSegments`."
    - "A developer calling `pickMrn([...CX])` gets the first CX-5='MR' idNumber, falling back to the first CX's idNumber when no MR entry exists."
  artifacts:
    - path: "src/helpers/types.ts"
      provides: "9 helper type interfaces (Meta, Patient, Visit, Observation, Order, NextOfKin, Allergy, Diagnosis, Insurance)"
      contains: "export interface Meta"
    - path: "src/model/types/xcn.ts"
      provides: "XCN interface + parseXcn function"
      contains: "export function parseXcn"
    - path: "src/helpers/pick-mrn.ts"
      provides: "pickMrn(identifiers) → string | undefined"
      exports: ["pickMrn"]
    - path: "src/helpers/meta.ts"
      provides: "buildMeta stub (throws until Plan 02 fills)"
      exports: ["buildMeta"]
    - path: "src/helpers/patient.ts"
      provides: "buildPatient stub"
      exports: ["buildPatient"]
    - path: "src/helpers/visit.ts"
      provides: "buildVisit stub"
      exports: ["buildVisit"]
    - path: "src/helpers/observations.ts"
      provides: "observations + buildObservation stubs"
      exports: ["observations", "buildObservation"]
    - path: "src/helpers/orders.ts"
      provides: "orders stub"
      exports: ["orders"]
    - path: "src/helpers/next-of-kin.ts"
      provides: "nextOfKin stub"
      exports: ["nextOfKin"]
    - path: "src/helpers/allergies.ts"
      provides: "allergies stub"
      exports: ["allergies"]
    - path: "src/helpers/diagnoses.ts"
      provides: "diagnoses stub"
      exports: ["diagnoses"]
    - path: "src/helpers/insurance.ts"
      provides: "insurance stub"
      exports: ["insurance"]
    - path: "src/model/message.ts"
      provides: "_meta/_patient/_visit cache slots + getters/methods + extended invalidateCaches"
      contains: "private _meta"
    - path: "src/model/field.ts"
      provides: "asXcn() coercion"
      contains: "public asXcn(): XCN"
  key_links:
    - from: "src/model/message.ts"
      to: "src/helpers/meta.ts"
      via: "import { buildMeta }"
      pattern: 'from "\\.\\./helpers/meta\\.js"'
    - from: "src/model/message.ts::invalidateCaches"
      to: "_meta/_patient/_visit slots"
      via: "assignment to undefined"
      pattern: "this\\._meta = undefined"
    - from: "src/model/field.ts::asXcn"
      to: "src/model/types/xcn.ts::parseXcn"
      via: "delegation"
      pattern: "parseXcn\\(this\\.repetitions"
    - from: "src/index.ts"
      to: "src/helpers/types.ts + src/helpers/pick-mrn.ts + src/model/types/xcn.ts"
      via: "named + type re-exports"
      pattern: 'export type \\{ Meta'
---

<objective>
Ship the Phase 4 scaffold in one disjoint-file-free wave so Plans 02/03/04 can
fill helper bodies in parallel without edit conflicts.

This plan locks **D-24 option (a)**: XCN becomes the 11th composite, shipped
as `src/model/types/xcn.ts` with `parseXcn`, `HL7.XCN`, and `Field.asXcn()`.
Rationale (per D-24 + PATTERNS.md): XCN is structurally XPN + ID prefix +
nested-HD assigningAuthority; helpers stay pure composition; OBR-16, PV1-7,
PV1-8 all benefit. This AVOIDS polluting `Visit` with flat doctor strings.

**Rationale — why `files_modified` shows 21 entries:** 9 of these entries are
single-purpose helper stub files (`meta.ts`, `patient.ts`, `visit.ts`,
`observations.ts`, `orders.ts`, `next-of-kin.ts`, `allergies.ts`,
`diagnoses.ts`, `insurance.ts`) designed to be ~10 lines apiece — each exports
one builder function with the correct signature that throws a clear
"NOT IMPLEMENTED — Plan 0N will fill this" error. Creating them in Plan 01
(instead of letting Plans 02/03/04 create them) is a deliberate parallelism
enabler: once Plan 01 ships the stubs and wires `Hl7Message` to call them,
Wave 2 plans can fill each stub body without touching `message.ts`,
`index.ts`, `types.ts`, `field.ts`, or each other. The file count looks
high but the per-file touch is tiny; splitting Plan 01 is NOT required
(already 3 tasks, well within the standard budget).

**In scope:**

1. `src/helpers/types.ts` — 9 helper interfaces (Meta/Patient/Visit/Observation/Order/NextOfKin/Allergy/Diagnosis/Insurance) with full `@example` JSDoc.
2. `src/model/types/xcn.ts` + add to `namespace.ts` + `src/model/types/index.ts` (if exists) + `src/index.ts` barrel; `src/model/field.ts::asXcn()`.
3. `src/helpers/pick-mrn.ts` — fully implemented (small, pure, well-defined — no value in deferring). Tested.
4. `src/helpers/meta.ts` / `patient.ts` / `visit.ts` / `observations.ts` / `orders.ts` / `next-of-kin.ts` / `allergies.ts` / `diagnoses.ts` / `insurance.ts` — each exports a SINGLE function that throws `Error("NOT IMPLEMENTED — Phase 4 Plan 0N will fill this")`. This gives Plans 02-04 an exact signature + file to edit without touching Plan 01 artifacts.
5. `src/helpers/index.ts` — internal barrel re-exporting types and builder functions.
6. `src/model/message.ts` — add `_meta`/`_patient`/`_visit` private cache slots, the 3 getters (`meta`, `patient`, `visit`) wired to `buildMeta`/`buildPatient`/`buildVisit` (stubs will throw on access until Plans 02-03 fill them), 6 collection methods (`observations()`, `orders()`, `nextOfKin()`, `allergies()`, `diagnoses()`, `insurance()`) wired to their respective stub functions, and extend `invalidateCaches()` to drop the three new slots.
7. `src/index.ts` barrel additions for helper types, `pickMrn`, `XCN`, `parseXcn`.
8. Tests: `test/helpers-pick-mrn.test.ts` + `test/types-xcn.test.ts`.

**Out of scope (later plans):**

- Helper method bodies for meta/patient/visit/observations/orders/collections — Plans 02/03/04.
- Cache-invalidation integration TESTS (test helper identity + mutation drop) — Plan 02.
- XCN use from helper layer (OBR-16 orderedBy, PV1-7 attendingDoctor) — Plans 03/04.

Purpose: disjoint-file scaffold so Plans 02/03/04 only modify the METHOD BODIES
inside the stub helper files Plan 01 created. This is the parallelization gate.

Output: 12 new src files + 2 new test files + 3 modified src files (field.ts,
message.ts, index.ts) + 2 modified namespace/barrel files. 2 new test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/04-named-helpers/04-CONTEXT.md
@.planning/phases/04-named-helpers/04-PATTERNS.md
@.planning/phases/03-structural-model-and-types/03-CONTEXT.md
@CLAUDE.md

<interfaces>
<!-- Key existing types/exports Plan 01 builds on. Read directly from code
     if anything looks stale. -->

From src/model/message.ts (Hl7Message class — current state):
- public readonly rawSegments: readonly RawSegment[];
- public readonly encodingCharacters: EncodingCharacters;
- public readonly version: string;
- public readonly warnings: readonly Hl7ParseWarning[];
- public get(path: string): string | undefined;
- public getAll(segmentType: string): readonly Segment[];
- public segments(segmentType: string): readonly Segment[];
- public allSegments(): readonly Segment[];
- public setField(path, value): this;
- public addSegment(name, fields): this;
- public removeSegment(segmentType, occurrenceOrOptions?): this;
- private _segmentsByType, _allSegments (existing cache slots)
- private invalidateCaches(): void  (lines 485-488)

From src/model/field.ts (Field class — current state):
- public readonly raw, isNull, repetitions, enc, position;
- public get value(): string;
- public static empty(enc): Field;
- 10 coercions: asXpn(), asXad(), asCx(), asCwe(), asCe(), asXtn(), asPl(), asTs(), asNm(), asHd()
- EMPTY_REP: RawRepetition — frozen sentinel (line 288)

From src/model/types/cx.ts:
- export interface CX { readonly idNumber?: string; readonly identifierTypeCode?: string; readonly assigningAuthority?: HD; ... }
- export function parseCx(rep, enc): CX
- internal: parseAssigningAuthority(comp, enc): HD | undefined  (the template for XCN.assigningAuthority)

From src/model/types/xpn.ts:
- export interface XPN { readonly familyName?, givenName?, secondName?, suffix?, prefix?, degree?, nameTypeCode?, ... }
- export function parseXpn(rep, enc): XPN
- Uses: type Mutable<T> = { -readonly [K in keyof T]?: T[K] }; const out: Mutable<XPN> = {}; conditional assignment pattern.

From src/model/types/_shared.ts:
- export function readComponent(rep, index, enc): string | undefined
- export function readSubcomponent(comp, index, enc): string | undefined

From src/model/types/hd.ts:
- export interface HD { readonly namespaceId?: string; readonly universalId?: string; readonly universalIdType?: string; }
- export function parseHd(rep, enc): HD

From src/index.ts (current barrel — Phase 4 appends below line 93):
Existing pattern for Phase 3 composites is:
```ts
export type { XPN } from "./model/types/xpn.js";
export { parseXpn } from "./model/types/xpn.js";
```

From src/model/types/namespace.ts (current):
```ts
export type { XPN } from "./xpn.js";
// ... 10 type re-exports total
```

From src/model/types/index.ts:
Check whether this file exists. It may or may not — if it does, it re-exports types + parsers from one internal spot (mirror its pattern for XCN). If it doesn't, do NOT create it (not in scope).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add XCN composite (types + parser + field coercion + barrel)</name>
  <files>src/model/types/xcn.ts, src/model/types/namespace.ts, src/model/types/index.ts (if it exists), src/model/field.ts, src/index.ts, test/types-xcn.test.ts</files>
  <read_first>
    - src/model/types/xcn.ts (target file — check for any pre-existing stub; likely absent)
    - src/model/types/cx.ts (primary analog — parseAssigningAuthority pattern for XCN.assigningAuthority; Mutable<T> + conditional-assign construction)
    - src/model/types/xpn.ts (name-component analog — familyName/givenName/secondName/suffix/prefix/degree shape)
    - src/model/types/hd.ts (nested HD composite consumed by XCN component 9)
    - src/model/types/_shared.ts (readComponent/readSubcomponent helpers)
    - src/model/types/namespace.ts (exact 13-line shape; append XCN at end mirroring HD pattern)
    - src/model/field.ts (whole file — asXpn pattern at lines 146-148 is the template; EMPTY_REP sentinel at 288)
    - src/index.ts (barrel — Phase 3 composite block is lines 70-93; append XCN entry after line 90)
    - test/types-xpn.test.ts (pure-function test style analog for test/types-xcn.test.ts)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§ "Pattern Assignments — src/model/types/xcn.ts" lines 546-631)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (§ D-24 XCN decision)
  </read_first>
  <behavior>
    - parseXcn on empty RawRepetition ({ components: [] }) returns {} (empty object, all keys omitted per exactOptionalPropertyTypes).
    - parseXcn on a rep with idNumber="12345", familyName="Smith", givenName="Jane", nameTypeCode="L", identifierTypeCode="NPI" returns { idNumber:"12345", familyName:"Smith", givenName:"Jane", nameTypeCode:"L", identifierTypeCode:"NPI" } — exactly those 5 keys.
    - parseXcn with assigningAuthority subcomponents ["HOSP","1.2.3","ISO"] returns { ..., assigningAuthority: { namespaceId:"HOSP", universalId:"1.2.3", universalIdType:"ISO" } }.
    - parseXcn with assigningAuthority subcomponents ["","",""] omits the assigningAuthority key (mirrors CX parseAssigningAuthority).
    - parseXcn never throws on malformed input (missing components, extra components, empty strings).
    - Field.asXcn() on an empty Field (no repetitions) returns {} (delegates via EMPTY_REP sentinel).
    - Field.asXcn() on a populated field returns the parsed XCN.
    - HL7.XCN resolves to the same type as the named export XCN.
    - parseXcn is auto-unescape-aware through readComponent (F\\F\\ → F|F).
  </behavior>
  <action>
Create `src/model/types/xcn.ts`:

1. File-level JSDoc (prose first line, NOT starting with `@...` per Phase 1 Rule-1). Describe: XCN = Extended Composite ID Number and Name for Persons. Common in OBR-16 (ordering provider), PV1-7 (attending), PV1-8 (referring). Structurally XPN components with an idNumber prefix and assigningAuthority (nested HD).
2. Imports: `import type { EncodingCharacters, RawComponent, RawRepetition } from "../../parser/types.js";` + `import { readComponent } from "./_shared.js";` + `import { parseHd, type HD } from "./hd.js";`
3. Export `interface XCN` — 13 v1 components (per PATTERNS.md line 574-588):
   - idNumber?: string                (XCN-1)
   - familyName?: string              (XCN-2)
   - givenName?: string               (XCN-3)
   - secondName?: string              (XCN-4)
   - suffix?: string                  (XCN-5)
   - prefix?: string                  (XCN-6)
   - degree?: string                  (XCN-7)
   - sourceTable?: string             (XCN-8)
   - assigningAuthority?: HD          (XCN-9 — nested HD via parseAssigningAuthority)
   - nameTypeCode?: string            (XCN-10)
   - identifierCheckDigit?: string    (XCN-11)
   - checkDigitScheme?: string        (XCN-12)
   - identifierTypeCode?: string      (XCN-13, e.g. "NPI", "DN")
   All `readonly`. Include `@example` JSDoc block on the interface showing a typical OBR-16 use (idNumber + familyName + givenName + identifierTypeCode="NPI").
4. Copy CX's `parseAssigningAuthority` helper verbatim (lines 85-96 of cx.ts) as an `@internal` private function in `xcn.ts` (do NOT refactor into _shared.ts; per Phase 3 D-20 note the DRY threshold is 3 occurrences — CX + PL + XCN now hits 3, but Phase 3 chose per-file duplication; stay consistent).
5. Export `function parseXcn(rep: RawRepetition, enc: EncodingCharacters): XCN` — use the `Mutable<T>` local + conditional-assignment pattern copied from `parseCx` (lines 120-157). For each component index 0..12 use `readComponent(rep, index, enc)`. For index 8 (assigningAuthority) use the inline `parseAssigningAuthority(rep.components[8], enc)`. Include `@example` block showing a parse call returning the expected shape.
6. Return `out` (NOT `Object.freeze(out) as XCN` — composites are plain objects per Phase 3 convention).

Modify `src/model/types/namespace.ts`:

- After `export type { HD } from "./hd.js";` line, append `export type { XCN } from "./xcn.js";`.

Modify `src/model/types/index.ts` IF it exists:

- Read the file first; if it re-exports types + parsers pairwise for the 10 existing composites, append the same 2-line pairing for XCN. If the file doesn't exist, skip this step (do NOT create it — not scaffolded by Phase 3).

Modify `src/model/field.ts`:

1. Add import near existing composite parser imports (line 27-36 block): `import { parseXcn, type XCN } from "./types/xcn.js";`.
2. After `asHd()` (line 270), add `asXcn(): XCN` method. Copy the asXpn template exactly (line 146-148): `public asXcn(): XCN { return parseXcn(this.repetitions[0] ?? EMPTY_REP, this.enc); }`. Add JSDoc with `@example` showing `msg.segments("OBR")[0]?.field(16)?.asXcn()` → XCN with idNumber + familyName + identifierTypeCode.

Modify `src/index.ts`:

- In the "Phase 3 typed composites" block (after line 90 — the HD entry), add before the HL7 namespace re-export on line 93:
  ```ts
  // Phase 4: XCN composite (11th v1 composite — used by helpers for attendingDoctor/orderedBy)
  export type { XCN } from "./model/types/xcn.js";
  export { parseXcn } from "./model/types/xcn.js";
  ```
  (Do NOT modify line 93 — the `export * as HL7 from "./model/types/namespace.js"` statement already picks up XCN via the namespace.ts edit.)

Create `test/types-xcn.test.ts`:

- Copy the header + import style from `test/types-xpn.test.ts` (first ~14 lines). Import `parseXcn` + `DEFAULT_ENCODING_CHARACTERS`.
- Test cases (at minimum):
  1. "empty rep → {}" — `parseXcn({ components: [] }, DEFAULT_ENCODING_CHARACTERS)` deep-equals `{}`.
  2. "scalar components" — build a RawRepetition with components `[{subcomponents:["12345"]}, {subcomponents:["Smith"]}, {subcomponents:["Jane"]}, {subcomponents:[""]}, {subcomponents:[""]}, {subcomponents:[""]}, {subcomponents:[""]}, {subcomponents:[""]}, {subcomponents:["","",""]}, {subcomponents:["L"]}, {subcomponents:[""]}, {subcomponents:[""]}, {subcomponents:["NPI"]}]` — result is `{ idNumber:"12345", familyName:"Smith", givenName:"Jane", nameTypeCode:"L", identifierTypeCode:"NPI" }`.
  3. "assigningAuthority nested HD" — subcomponents `["HOSP","1.2.3","ISO"]` on components[8] parses into `{ namespaceId:"HOSP", universalId:"1.2.3", universalIdType:"ISO" }`.
  4. "all-empty assigningAuthority omitted" — subcomponents `["","",""]` on components[8] results in NO `assigningAuthority` key.
  5. "never throws on undefined component slot" — pass `{ components: [] }`.
  6. "omits key when component subcomponents all empty strings" — for any scalar component, all-empty subcomponents means the key is omitted (use `"key" in out` to assert).
  7. "auto-unescape via readComponent" — idNumber subcomponent raw `"A\\F\\B"` unescapes to `"A|B"`.

Run `pnpm typecheck`, `pnpm lint`, then `pnpm test -- types-xcn`.
  </action>
  <verify>
    <automated>pnpm test -- types-xcn.test.ts 2>&1 | tail -30 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/model/types/xcn.ts src/model/field.ts src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/model/types/xcn.ts` succeeds
    - `grep -q "export function parseXcn" src/model/types/xcn.ts` succeeds
    - `grep -q "export interface XCN" src/model/types/xcn.ts` succeeds
    - `grep -q "assigningAuthority?: HD" src/model/types/xcn.ts` succeeds
    - `grep -q 'export type { XCN } from "./xcn.js"' src/model/types/namespace.ts` succeeds
    - `grep -q "public asXcn(): XCN" src/model/field.ts` succeeds
    - `grep -q 'export type { XCN }' src/index.ts` succeeds
    - `grep -q 'export { parseXcn }' src/index.ts` succeeds
    - `pnpm test -- types-xcn.test.ts` exits 0 with all ≥7 test cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src` exits 0 with no warnings
  </acceptance_criteria>
  <done>XCN composite shipped: types, parser, Field.asXcn(), namespace + public barrel updated, types-xcn.test.ts green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create helper type declarations + pickMrn + stub builder files</name>
  <files>src/helpers/types.ts, src/helpers/pick-mrn.ts, src/helpers/meta.ts, src/helpers/patient.ts, src/helpers/visit.ts, src/helpers/observations.ts, src/helpers/orders.ts, src/helpers/next-of-kin.ts, src/helpers/allergies.ts, src/helpers/diagnoses.ts, src/helpers/insurance.ts, src/helpers/index.ts, test/helpers-pick-mrn.test.ts</files>
  <read_first>
    - src/model/types/xpn.ts (interface shape analog + Mutable&lt;T&gt; construction pattern)
    - src/model/types/cx.ts (interface + CX.identifierTypeCode + CX.idNumber shape for pickMrn input)
    - src/model/types/namespace.ts (types-only barrel style — exact pattern for src/helpers/index.ts)
    - src/model/message.ts (Hl7Message class — types.ts references it via `import type { Hl7Message }`)
    - test/types-xpn.test.ts (test convention — header + Vitest imports)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (§decisions — D-01..D-24 define every interface shape)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"Pattern Assignments — src/helpers/types.ts", "src/helpers/pick-mrn.ts")
    - CLAUDE.md (engineering guardrails — `@example` JSDoc is mandatory)
  </read_first>
  <behavior>
    - pickMrn([]) returns undefined.
    - pickMrn([{idNumber: "X1"}]) returns "X1" (fallback — no MR-typed entry, first entry's idNumber).
    - pickMrn([{idNumber: "X1"}, {idNumber: "MRN001", identifierTypeCode: "MR"}]) returns "MRN001" (MR wins over first).
    - pickMrn([{idNumber: "MRN001", identifierTypeCode: "MR"}, {idNumber: "X1"}]) returns "MRN001".
    - pickMrn([{idNumber: "mrn001", identifierTypeCode: "mr"}]) returns "mrn001" as fallback (D-10 — MR match is case-SENSITIVE, so lowercase "mr" does NOT match; first-idNumber fallback applies).
    - pickMrn([{}]) returns undefined (first entry has no idNumber, no other entries).
    - pickMrn([{checkDigit:"5"}, {idNumber: "X"}]) returns "X" (first entry has no idNumber; fallback walks to first entry — returns first[0]?.idNumber which is undefined; NOTE: per D-08 fallback is "first CX's idNumber", so result is undefined; document this corner case in a test).
    - pickMrn never throws.
    - Each helper stub file exports a function with the correct type signature that throws `new Error("NOT IMPLEMENTED — Phase 4 Plan 0N will fill this")` when invoked.
    - `import type { Meta, Patient, Visit, Observation, Order, NextOfKin, Allergy, Diagnosis, Insurance } from "./src/helpers/types"` compiles cleanly (all 9 interfaces exported).
    - `import { XCN } from "./src/model/types/xcn"` resolves, so `Visit.attendingDoctor?: XCN` typechecks.
  </behavior>
  <action>
**Step A — create `src/helpers/types.ts`:**

File-level prose JSDoc. Imports:
```ts
import type { XPN } from "../model/types/xpn.js";
import type { XAD } from "../model/types/xad.js";
import type { CX } from "../model/types/cx.js";
import type { CWE } from "../model/types/cwe.js";
import type { CE } from "../model/types/ce.js";
import type { XTN } from "../model/types/xtn.js";
import type { PL } from "../model/types/pl.js";
import type { XCN } from "../model/types/xcn.js";
```

Export these 9 interfaces — EVERY public interface gets an `@example` JSDoc block. All fields `readonly`. Use `exactOptionalPropertyTypes`-safe optional keys (`?:`, never `| undefined`):

1. **Meta** (HELPERS-01 — always defined per D-03; individual fields optional):
   - type?: string        (MSH-9 full string, e.g. "ADT^A01")
   - messageCode?: string (MSH-9.1)
   - triggerEvent?: string (MSH-9.2)
   - messageStructure?: string (MSH-9.3)
   - controlId?: string   (MSH-10)
   - timestamp?: Date     (MSH-7 — flat Date per D-18)
   - version?: string     (MSH-12)
   - sendingApp?: string  (MSH-3.1 namespaceId)
   - sendingFacility?: string (MSH-4.1)
   - receivingApp?: string (MSH-5.1)
   - receivingFacility?: string (MSH-6.1)
   - processingId?: string (MSH-11.1)

2. **Patient** (HELPERS-02):
   - mrn?: string          (via pickMrn)
   - identifiers: readonly CX[]  (D-09 — ALWAYS present, empty array if PID-3 absent)
   - name: XPN             (D-19 — always-present XPN, {} when PID-5 absent)
   - familyName?: string   (D-19)
   - givenName?: string
   - middleName?: string   (mapped from XPN.secondName per D-19)
   - fullName?: string     (composed per D-17)
   - dateOfBirth?: Date    (PID-7, flat per D-18)
   - sex?: string          (PID-8)
   - address?: XAD         (PID-11)
   - phoneNumbers: readonly XTN[]  (D-20 — ALWAYS present, empty array if PID-13/14 absent)
   - race?: CWE            (PID-10)
   - ethnicity?: CWE       (PID-22)
   - language?: CE         (PID-15)

3. **Visit** (HELPERS-03 — whole Visit is nullable at the Hl7Message layer; this interface is always non-null when present):
   - patientClass?: string (PV1-2)
   - location?: PL         (PV1-3)
   - admitDateTime?: Date  (PV1-44)
   - dischargeDateTime?: Date (PV1-45)
   - attendingDoctor?: XCN (PV1-7 — D-24 option (a) XCN)
   - referringDoctor?: XCN (PV1-8)
   - visitNumber?: string  (PV1-19)

4. **Observation** — discriminated union per D-13. Define a shared `ObservationBase` interface then a union. Export BOTH:
   ```ts
   export interface ObservationBase {
     readonly setId?: string;
     readonly identifier: CWE;        // D-15 — always present CWE ({} if empty)
     readonly units?: CWE;
     readonly referenceRange?: string;
     readonly abnormalFlags?: string;
     readonly status?: string;
     readonly observedDateTime?: Date;
   }
   export type Observation = ObservationBase & (
     | { readonly valueType: "NM"; readonly value: number | undefined }
     | { readonly valueType: "TS" | "DT"; readonly value: Date | undefined }
     | { readonly valueType: "CWE" | "CE"; readonly value: CWE | CE | undefined }
     | { readonly valueType: string; readonly value: string | undefined }
   );
   ```
   Add `@example` to the Observation type alias showing `{ valueType: "NM", value: 120, identifier: { identifier: "GLU", text: "Glucose" } }`.

5. **Order** (HELPERS-05 — D-16):
   - placerOrderNumber?: string   (OBR-2)
   - fillerOrderNumber?: string   (OBR-3)
   - universalServiceId?: CWE     (OBR-4)
   - orderStatus?: string         (OBR-5 for v1; Phase 7 may revisit OBR-25 per D-16 note)
   - orderControl?: string        (ORC-1 when ORC precedes OBR)
   - orderedBy?: XCN              (OBR-16 — D-24 option (a))
   - observations: readonly Observation[]  (always-present; empty if no OBX under this OBR)

6. **NextOfKin** (HELPERS-06 — lean subset per CONTEXT.md Claude's Discretion):
   - name?: XPN         (NK1-2)
   - relationship?: CWE (NK1-3)
   - address?: XAD      (NK1-4)
   - phone?: XTN        (NK1-5 — first repetition only for lean shape; callers can reach via msg.segments)
   - contactRole?: CWE  (NK1-7)

7. **Allergy** (AL1):
   - type?: string      (AL1-2 — typically IS: "DA" drug, "FA" food)
   - code?: CWE         (AL1-3)
   - severity?: string  (AL1-4 — IS: "SV", "MO", "MI")
   - reaction?: string  (AL1-5 — first value for lean shape)
   - onsetDate?: Date   (AL1-6, flat per D-18)

8. **Diagnosis** (DG1):
   - code?: CWE         (DG1-3)
   - description?: string (DG1-4)
   - dateTime?: Date    (DG1-5, flat per D-18)
   - type?: string      (DG1-6 — IS: "A", "W", "F")

9. **Insurance** (IN1 + positional IN2/IN3 per D-05 extension):
   - planId?: CWE       (IN1-2)
   - companyId?: CX     (IN1-3)
   - companyName?: string (IN1-4 — first rep, first component)
   - policyNumber?: string (IN1-36)
   - groupNumber?: string (IN1-8)
   - insuredName?: XPN  (IN1-16)
   - effectiveDate?: Date (IN1-12)
   - expirationDate?: Date (IN1-13)
   - hasIn2: boolean    (ALWAYS present — true iff an IN2 follows this IN1 before the next IN1)
   - hasIn3: boolean    (ALWAYS present)
   (The `hasIn2`/`hasIn3` booleans are the lean shape; callers can drop to `msg.segments("IN2")[i]` for full data. Plan 04 fills the logic.)

**Step B — create `src/helpers/pick-mrn.ts` (FULL implementation, not a stub):**

```ts
// File-level prose JSDoc.
import type { CX } from "../model/types/cx.js";

/**
 * Pick the Medical Record Number string from a list of PID-3 CX identifiers.
 *
 * D-07: prefer the first CX whose `identifierTypeCode === "MR"` (HL7 v2.5+
 * canonical MRN marker). D-10: the match is case-SENSITIVE — lowercase "mr"
 * does NOT match.
 *
 * D-08: when no MR-typed identifier exists, fall back to the first CX's
 * `idNumber` (which may still be `undefined` if the first identifier lacks
 * one — the result is `undefined` in that case).
 *
 * This function is exported from `src/index.ts` so Phase 6 profile hooks
 * can substitute a profile-aware variant without patching `patient.ts`.
 * No warning is emitted (D-21).
 *
 * @example
 * ```ts
 * import { pickMrn } from "@cosyte/hl7-parser";
 * pickMrn([
 *   { idNumber: "X1" },
 *   { idNumber: "MRN001", identifierTypeCode: "MR" },
 * ]);
 * // → "MRN001"
 * ```
 */
export function pickMrn(identifiers: readonly CX[]): string | undefined {
  for (const cx of identifiers) {
    if (cx.identifierTypeCode === "MR" && cx.idNumber !== undefined) {
      return cx.idNumber;
    }
  }
  const first = identifiers[0];
  return first?.idNumber;
}
```

**Step C — create the 9 stub helper files. Each MUST export a function with the exact signature that Plans 02/03/04 will fill.** Use this template for each:

`src/helpers/meta.ts`:
```ts
/**
 * Build the immutable `Meta` view from a parsed message's MSH segment.
 * Implementation lives in Phase 4 Plan 02 (meta-and-patient).
 * This stub exists so Plan 01 can wire the `msg.meta` getter before
 * Plan 02 runs; invoking it throws.
 *
 * @internal
 */
import type { Hl7Message } from "../model/message.js";
import type { Meta } from "./types.js";

export function buildMeta(_msg: Hl7Message): Meta {
  throw new Error(
    "buildMeta: NOT IMPLEMENTED — Phase 4 Plan 02 (meta-and-patient) will fill this. " +
      "If you see this error, helper plans are running out of order.",
  );
}
```

Mirror this template for the other 8 stubs. Exact function names + signatures (each builder marked `@internal`):

- `src/helpers/patient.ts`: `export function buildPatient(_msg: Hl7Message): Patient | undefined` — throws (Plan 02).
- `src/helpers/visit.ts`: `export function buildVisit(_msg: Hl7Message): Visit | undefined` — throws (Plan 03).
- `src/helpers/observations.ts`: `export function observations(_msg: Hl7Message): readonly Observation[]` — throws (Plan 03). Also export a placeholder `export function buildObservation(_seg: Segment): Observation { throw ... }` with `import type { Segment } from "../model/segment.js";` — Plan 04 re-uses this for orders() OBX grouping.
- `src/helpers/orders.ts`: `export function orders(_msg: Hl7Message): readonly Order[]` — throws (Plan 04).
- `src/helpers/next-of-kin.ts`: `export function nextOfKin(_msg: Hl7Message): readonly NextOfKin[]` — throws (Plan 04).
- `src/helpers/allergies.ts`: `export function allergies(_msg: Hl7Message): readonly Allergy[]` — throws (Plan 04).
- `src/helpers/diagnoses.ts`: `export function diagnoses(_msg: Hl7Message): readonly Diagnosis[]` — throws (Plan 04).
- `src/helpers/insurance.ts`: `export function insurance(_msg: Hl7Message): readonly Insurance[]` — throws (Plan 04).

Each stub error message MUST name the filling plan (Plan 02, 03, or 04) so executors see it immediately if they run helpers before the filling plan completes.

**Step D — create `src/helpers/index.ts` (internal barrel):**

```ts
/**
 * Internal barrel for the Phase 4 helpers. Re-exports the 9 helper types
 * and the 9 builder/walker functions + `pickMrn`. Consumed by
 * `src/model/message.ts` and `src/index.ts`.
 */

export type {
  Meta, Patient, Visit,
  Observation, ObservationBase, Order,
  NextOfKin, Allergy, Diagnosis, Insurance,
} from "./types.js";
export { buildMeta } from "./meta.js";
export { buildPatient } from "./patient.js";
export { buildVisit } from "./visit.js";
export { observations, buildObservation } from "./observations.js";
export { orders } from "./orders.js";
export { nextOfKin } from "./next-of-kin.js";
export { allergies } from "./allergies.js";
export { diagnoses } from "./diagnoses.js";
export { insurance } from "./insurance.js";
export { pickMrn } from "./pick-mrn.js";
```

**Step E — create `test/helpers-pick-mrn.test.ts`:**

Test convention: Vitest describe/it, header JSDoc, import from `../src/helpers/pick-mrn.js` (or from `../src/index.js` — prefer the direct file import for a unit test).

Required cases (must all pass):
1. "empty array → undefined"
2. "single CX with MR → idNumber"
3. "MR wins over earlier non-MR (D-07)"
4. "fallback to first idNumber when no MR (D-08)"
5. "case-sensitive match (D-10) — lowercase 'mr' falls through to first idNumber"
6. "first CX has no idNumber, no MR anywhere → undefined"
7. "never throws on any CX[] shape" — wrap 5 variants in `expect(() => pickMrn(...)).not.toThrow()`.

Run `pnpm typecheck`, `pnpm lint src/helpers`, then `pnpm test -- helpers-pick-mrn`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-pick-mrn.test.ts 2>&1 | tail -20 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers</automated>
  </verify>
  <acceptance_criteria>
    - `test -d src/helpers` succeeds
    - All 12 files exist: `test -f src/helpers/types.ts && test -f src/helpers/pick-mrn.ts && test -f src/helpers/meta.ts && test -f src/helpers/patient.ts && test -f src/helpers/visit.ts && test -f src/helpers/observations.ts && test -f src/helpers/orders.ts && test -f src/helpers/next-of-kin.ts && test -f src/helpers/allergies.ts && test -f src/helpers/diagnoses.ts && test -f src/helpers/insurance.ts && test -f src/helpers/index.ts`
    - `grep -q "export interface Meta" src/helpers/types.ts` succeeds
    - `grep -q "export interface Patient" src/helpers/types.ts` succeeds
    - `grep -q "export interface Visit" src/helpers/types.ts` succeeds
    - `grep -q "export type Observation" src/helpers/types.ts` succeeds
    - `grep -q "export interface Order" src/helpers/types.ts` succeeds
    - `grep -q "attendingDoctor?: XCN" src/helpers/types.ts` succeeds (D-24 option a is wired)
    - `grep -q "export function pickMrn" src/helpers/pick-mrn.ts` succeeds
    - `grep -q 'NOT IMPLEMENTED' src/helpers/meta.ts` succeeds (stub verification)
    - `grep -c 'NOT IMPLEMENTED' src/helpers/*.ts` shows 9 matching files (meta, patient, visit, observations has 2 stubs, orders, next-of-kin, allergies, diagnoses, insurance — count is 10 because observations.ts has TWO throws (observations + buildObservation))
    - `pnpm test -- helpers-pick-mrn.test.ts` exits 0 with all 7 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers` exits 0 with no warnings
  </acceptance_criteria>
  <done>All 9 helper type interfaces exported, pickMrn implemented + tested, 9 stub builders in place throwing the "NOT IMPLEMENTED — Plan 0N" error with correct signatures that Plans 02/03/04 will fill.</done>
</task>

<task type="auto">
  <name>Task 3: Wire helpers into Hl7Message (getters, methods, cache slots, invalidation) + barrel exports</name>
  <files>src/model/message.ts, src/index.ts</files>
  <read_first>
    - src/model/message.ts (whole file — lines 1-489; extend in place, do not subclass)
    - src/index.ts (whole file — append after existing Phase 3 blocks)
    - src/helpers/index.ts (just created — authoritative list of imports)
    - src/helpers/types.ts (just created — types referenced by message.ts signatures)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"src/model/message.ts MODIFIED" lines 668-776 — lazy cache + null-sentinel for undefined lookups + invalidateCaches extension)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (§D-02 memoization, §D-04 patient nullable, §D-05 collections always-array)
  </read_first>
  <action>
**Modify `src/model/message.ts`:**

1. **Imports** — after the existing Phase 3 imports (line 21), add:
   ```ts
   import type {
     Meta, Patient, Visit,
     Observation, Order,
     NextOfKin, Allergy, Diagnosis, Insurance,
   } from "../helpers/types.js";
   import { buildMeta } from "../helpers/meta.js";
   import { buildPatient } from "../helpers/patient.js";
   import { buildVisit } from "../helpers/visit.js";
   import { observations as walkObservations } from "../helpers/observations.js";
   import { orders as walkOrders } from "../helpers/orders.js";
   import { nextOfKin as walkNextOfKin } from "../helpers/next-of-kin.js";
   import { allergies as walkAllergies } from "../helpers/allergies.js";
   import { diagnoses as walkDiagnoses } from "../helpers/diagnoses.js";
   import { insurance as walkInsurance } from "../helpers/insurance.js";
   ```
   (Aliasing the collection functions to `walkXxx` avoids shadowing the class methods.)

2. **Add three private cache slots** — after the existing `_allSegments` slot (current line 122), add:
   ```ts
   /**
    * Lazily built `Meta` view (D-02 memoized). Dropped wholesale on mutation.
    * `Meta` is always defined (D-03) so no null-sentinel is needed.
    * @internal
    */
   private _meta: Meta | undefined;

   /**
    * Lazily built `Patient | undefined` view (D-02 memoized). Uses a
    * null-sentinel cache because `undefined` means "not yet computed" while
    * `null` means "computed, absent". D-04: no PID → `undefined` public value.
    * @internal
    */
   private _patient: Patient | null | undefined;

   /**
    * Lazily built `Visit | undefined` view (D-02 memoized). Same null-sentinel
    * convention as `_patient`. HELPERS-03: no PV1 → `undefined` public value.
    * @internal
    */
   private _visit: Visit | null | undefined;
   ```

3. **Add getters** — AFTER the existing `allSegments()` method (current line 232) and BEFORE `setField()` (current line 257), insert:
   ```ts
   /**
    * MSH-derived message metadata (type, controlId, timestamp, version, etc.).
    * D-01: deeply frozen plain object. D-02: memoized — `msg.meta === msg.meta`
    * across reads until mutation invalidates. D-03: always defined (MSH absent
    * would have thrown `NO_MSH_SEGMENT` at parse time).
    *
    * @example
    * ```ts
    * console.log(msg.meta.type);                     // "ADT^A01"
    * console.log(msg.meta.timestamp?.toISOString()); // flat Date per D-18
    * console.log(msg.meta.controlId);                // "MSG001"
    * ```
    */
   public get meta(): Meta {
     return (this._meta ??= buildMeta(this));
   }

   /**
    * PID-derived patient view, or `undefined` when no PID segment exists
    * (D-04). D-02: memoized. HELPERS-07: never throws — absent fields
    * surface as `undefined` on the returned `Patient` object.
    *
    * @example
    * ```ts
    * console.log(msg.patient?.mrn);
    * console.log(msg.patient?.fullName);
    * console.log(msg.patient?.dateOfBirth?.toISOString());
    * ```
    */
   public get patient(): Patient | undefined {
     if (this._patient === undefined) {
       this._patient = buildPatient(this) ?? null;
     }
     return this._patient === null ? undefined : this._patient;
   }

   /**
    * PV1-derived visit view, or `undefined` when no PV1 segment exists
    * (HELPERS-03). D-02: memoized. HELPERS-07: never throws.
    *
    * @example
    * ```ts
    * console.log(msg.visit?.patientClass);                 // "I"
    * console.log(msg.visit?.admitDateTime?.toISOString());
    * console.log(msg.visit?.attendingDoctor?.familyName);
    * ```
    */
   public get visit(): Visit | undefined {
     if (this._visit === undefined) {
       this._visit = buildVisit(this) ?? null;
     }
     return this._visit === null ? undefined : this._visit;
   }
   ```

4. **Add collection methods** — immediately after the three getters (still before `setField`), insert 6 methods. D-05: always returns `readonly T[]` (never undefined). D-06: NOT memoized — each call re-walks. Use the aliased `walkXxx` functions imported above:
   ```ts
   /**
    * Every OBX segment as a typed Observation in document order. D-05:
    * returns `[]` when no OBX present. D-06: not memoized — each call
    * re-walks `rawSegments`. Value type is discriminated per D-13.
    *
    * @example
    * ```ts
    * for (const obs of msg.observations()) {
    *   if (obs.valueType === "NM") console.log(obs.value); // number | undefined
    * }
    * ```
    */
   public observations(): readonly Observation[] { return walkObservations(this); }

   /**
    * Every OBR as an Order with its OBX children grouped positionally (D-12).
    * D-05: returns `[]` when no OBR present. D-06: not memoized.
    *
    * @example
    * ```ts
    * for (const order of msg.orders()) {
    *   console.log(order.placerOrderNumber, order.observations.length);
    * }
    * ```
    */
   public orders(): readonly Order[] { return walkOrders(this); }

   /**
    * Every NK1 as a NextOfKin entry in document order. D-05: returns `[]`
    * when no NK1 present.
    *
    * @example
    * ```ts
    * for (const nk of msg.nextOfKin()) {
    *   console.log(nk.name?.familyName, nk.relationship?.text);
    * }
    * ```
    */
   public nextOfKin(): readonly NextOfKin[] { return walkNextOfKin(this); }

   /**
    * Every AL1 as an Allergy in document order.
    *
    * @example
    * ```ts
    * for (const al of msg.allergies()) console.log(al.code?.text, al.severity);
    * ```
    */
   public allergies(): readonly Allergy[] { return walkAllergies(this); }

   /**
    * Every DG1 as a Diagnosis in document order.
    *
    * @example
    * ```ts
    * for (const dg of msg.diagnoses()) console.log(dg.code?.identifier);
    * ```
    */
   public diagnoses(): readonly Diagnosis[] { return walkDiagnoses(this); }

   /**
    * Every IN1 as an Insurance entry with positional IN2/IN3 flags.
    *
    * @example
    * ```ts
    * for (const ins of msg.insurance()) console.log(ins.planId?.text);
    * ```
    */
   public insurance(): readonly Insurance[] { return walkInsurance(this); }
   ```

5. **Extend `invalidateCaches()`** — current body at lines 485-488 is:
   ```ts
   private invalidateCaches(): void {
     this._segmentsByType = undefined;
     this._allSegments = undefined;
   }
   ```
   Replace with:
   ```ts
   /**
    * Drop every wrapper AND helper cache wholesale (Phase 3 D-17 + Phase 4
    * D-02). Called by every mutation method so subsequent reads rebuild
    * from the mutated `rawSegments` tree.
    * @internal
    */
   private invalidateCaches(): void {
     this._segmentsByType = undefined;
     this._allSegments = undefined;
     this._meta = undefined;
     this._patient = undefined;
     this._visit = undefined;
   }
   ```
   **Do NOT modify the bodies of `setField` / `addSegment` / `removeSegment` — they already call `this.invalidateCaches()` at lines 347, 404, 475.** The single-method extension covers all three mutation paths.

**Modify `src/index.ts`:**

After the `export * as HL7 from "./model/types/namespace.js";` line (current line 93, which Task 1 left alone), append:

```ts
// Phase 4 named helpers — type-only exports (behavior is attached to
// Hl7Message instance methods/getters, not free functions).
export type {
  Meta,
  Patient,
  Visit,
  Observation,
  ObservationBase,
  Order,
  NextOfKin,
  Allergy,
  Diagnosis,
  Insurance,
} from "./helpers/types.js";

// Phase 4: pickMrn is exposed for Phase 6 profile override hooks.
export { pickMrn } from "./helpers/pick-mrn.js";
```

**Do NOT call the stub builder functions in any code path during scaffold.** The getters only invoke `buildMeta` etc. lazily on first `.meta` access — so the build + tests pass as long as `pnpm test` doesn't access `msg.meta` / `msg.patient` / `msg.visit` / `msg.observations()` / etc. until Plans 02-04 fill the stubs.

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (the 327 existing tests + the 2 new tests from Tasks 1-2 = ≥ 336 tests should all pass; no new test exercises the stubbed helpers yet).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit &amp;&amp; pnpm lint &amp;&amp; pnpm build &amp;&amp; pnpm test 2>&amp;1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "private _meta: Meta \| undefined" src/model/message.ts` succeeds
    - `grep -q "private _patient: Patient \| null \| undefined" src/model/message.ts` succeeds
    - `grep -q "private _visit: Visit \| null \| undefined" src/model/message.ts` succeeds
    - `grep -q "public get meta(): Meta" src/model/message.ts` succeeds
    - `grep -q "public get patient(): Patient \| undefined" src/model/message.ts` succeeds
    - `grep -q "public get visit(): Visit \| undefined" src/model/message.ts` succeeds
    - `grep -q "public observations(): readonly Observation\[\]" src/model/message.ts` succeeds
    - `grep -q "public orders(): readonly Order\[\]" src/model/message.ts` succeeds
    - `grep -q "public nextOfKin(): readonly NextOfKin\[\]" src/model/message.ts` succeeds
    - `grep -q "public allergies(): readonly Allergy\[\]" src/model/message.ts` succeeds
    - `grep -q "public diagnoses(): readonly Diagnosis\[\]" src/model/message.ts` succeeds
    - `grep -q "public insurance(): readonly Insurance\[\]" src/model/message.ts` succeeds
    - `grep -q "this._meta = undefined" src/model/message.ts` succeeds (invalidateCaches extension)
    - `grep -q "this._patient = undefined" src/model/message.ts` succeeds
    - `grep -q "this._visit = undefined" src/model/message.ts` succeeds
    - `grep -q 'export type \{' src/index.ts` succeeds with `Meta` and `Patient` appearing after Phase 3 block
    - `grep -q 'export { pickMrn }' src/index.ts` succeeds
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint` exits 0 with zero warnings
    - `pnpm build` exits 0 (tsup produces dist/)
    - `pnpm test` exits 0 with ≥ 336 tests passing (327 existing + types-xcn + helpers-pick-mrn)
  </acceptance_criteria>
  <done>Hl7Message gains 3 getters + 6 methods wired to the Plan 01 stub functions; invalidateCaches drops 3 new slots; public barrel exports all 9 helper types + pickMrn; build + full test suite green. Plans 02/03/04 can now edit the body of each helper file in parallel without touching message.ts, index.ts, or types.ts.</done>
</task>

</tasks>

<verification>
Run the full Phase 3 baseline + Phase 4 Plan 01 additions:

```bash
pnpm tsc --noEmit   # strict TS passes with new helper types
pnpm lint           # ESLint passes (JSDoc @example on every public export)
pnpm test           # ≥ 336 tests pass (327 existing + helpers-pick-mrn + types-xcn)
pnpm build          # tsup emits dist/ with updated type declarations
```

Verify `dist/index.d.ts` (after build) exports Meta, Patient, Visit, Observation, Order, NextOfKin, Allergy, Diagnosis, Insurance, XCN, and `pickMrn` at the type level:

```bash
grep -E 'export (type |declare function |\{)' dist/index.d.ts | grep -E '(Meta|Patient|Visit|Observation|Order|NextOfKin|Allergy|Diagnosis|Insurance|XCN|pickMrn|parseXcn)'
```

Should show all 12 symbols exported through the public type-barrel.
</verification>

<success_criteria>
- All 13 type + value exports land in the public barrel (Meta, Patient, Visit, Observation, ObservationBase, Order, NextOfKin, Allergy, Diagnosis, Insurance, XCN, parseXcn, pickMrn).
- `Field.asXcn()` exists and parses composites correctly (D-24 option (a) locked).
- `Hl7Message._meta`/`_patient`/`_visit` private slots exist; `invalidateCaches` drops them.
- Hl7Message has 3 getters (meta, patient, visit) + 6 collection methods, all referencing stub functions.
- All 9 helper builder files exist as stubs throwing `"NOT IMPLEMENTED — Phase 4 Plan 0N will fill this"` so Plans 02/03/04 have a clear disjoint-file edit surface.
- `pnpm test` exits 0 (including new `helpers-pick-mrn` + `types-xcn` suites; other helpers not yet exercised).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0.
- Plans 02, 03, 04 can now edit ONLY the body of their assigned helper files without touching message.ts, index.ts, types.ts, or field.ts.
</success_criteria>

<output>
After completion, create `.planning/phases/04-named-helpers/04-01-SUMMARY.md` with:
- What shipped (XCN composite, 9 helper types, 9 stub builders, Hl7Message wiring, cache invalidation).
- D-24 decision locked: option (a) — XCN is the 11th composite.
- Files created (15) + modified (4).
- Test count before/after.
- Any deviation from the plan flagged for Plans 02-04.
- Notes for Plans 02-04: they MUST NOT edit message.ts, index.ts, types.ts, or the namespace/barrel files — only the METHOD BODY inside their assigned helper file.
</output>
