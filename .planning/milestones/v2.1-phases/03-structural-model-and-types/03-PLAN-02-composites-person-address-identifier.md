---
phase: 03-structural-model-and-types
plan: 02
title: Composite parsers — Person (XPN), Address (XAD), Identifier (CX, CWE, CE), Hierarchic (HD)
type: execute
wave: 2
depends_on: [03-PLAN-01]
files_modified:
  - src/model/types/xpn.ts
  - src/model/types/xad.ts
  - src/model/types/cx.ts
  - src/model/types/cwe.ts
  - src/model/types/ce.ts
  - src/model/types/hd.ts
  - src/model/types/_shared.ts
  - test/types-xpn.test.ts
  - test/types-xad.test.ts
  - test/types-cx.test.ts
  - test/types-cwe.test.ts
  - test/types-ce.test.ts
  - test/types-hd.test.ts
autonomous: true
requirements: [TYPES-01, TYPES-02]

must_haves:
  truths:
    - "A developer calling `parseXpn(rep, enc)` on an HL7 person-name repetition receives an `XPN` object with `familyName`, `givenName`, `secondName`, `suffix`, `prefix`, `degree`, `nameTypeCode`, `nameRepresentationCode`, `nameContext`, `nameValidityRange`, `nameAssemblyOrder`, `effectiveDate`, `expirationDate`, `professionalSuffix` (up to 14 components) — OMITTED (not undefined) when absent (exactOptionalPropertyTypes)."
    - "A developer calling `parseXad(rep, enc)` on an HL7 address repetition receives an `XAD` object with street, otherDesignation, city, stateOrProvince, zipOrPostalCode, country, addressType, otherGeographicDesignation, countyParishCode, censusTract, addressRepresentationCode, addressValidityRange (up to 12 components)."
    - "A developer calling `parseCx(rep, enc)` on an HL7 identifier repetition receives a `CX` object with `idNumber`, `checkDigit`, `checkDigitScheme`, `assigningAuthority` (nested HD), `identifierTypeCode`, `assigningFacility`, `effectiveDate`, `expirationDate`, `assigningJurisdiction`, `assigningAgencyOrDepartment` (up to 10 components)."
    - "A developer calling `parseCwe(rep, enc)` on an HL7 coded-with-exceptions repetition receives a `CWE` with 9 core components (identifier, text, nameOfCodingSystem, alternateIdentifier, alternateText, nameOfAlternateCodingSystem, codingSystemVersionId, alternateCodingSystemVersionId, originalText) — dropped to 9 for v1 simplicity, matching the most common HL7 v2.5 use cases."
    - "A developer calling `parseCe(rep, enc)` on an HL7 coded-element repetition receives a `CE` with 6 components (identifier, text, nameOfCodingSystem, alternateIdentifier, alternateText, nameOfAlternateCodingSystem)."
    - "A developer calling `parseHd(rep, enc)` on an HL7 hierarchic-designator repetition receives an `HD` with 3 components (namespaceId, universalId, universalIdType)."
    - "A developer's composite parser auto-unescapes every component string via `unescape(raw, enc, () => {}, position)` — silent (no warnings emitted, D-09 lazy-not-memoized design)."
    - "A developer importing `type { XPN, XAD, CX, CWE, CE, HD } from '@cosyte/hl7-parser'` gets strongly typed composite shapes (named exports wire-up lands in Plan 04; Plan 02 ships the types + parsers + tests)."
  artifacts:
    - path: "src/model/types/xpn.ts"
      provides: "XPN interface + parseXpn(rep, enc): XPN"
      exports: ["XPN", "parseXpn"]
    - path: "src/model/types/xad.ts"
      provides: "XAD interface + parseXad(rep, enc): XAD"
      exports: ["XAD", "parseXad"]
    - path: "src/model/types/cx.ts"
      provides: "CX interface + parseCx(rep, enc): CX"
      exports: ["CX", "parseCx"]
    - path: "src/model/types/cwe.ts"
      provides: "CWE interface + parseCwe(rep, enc): CWE"
      exports: ["CWE", "parseCwe"]
    - path: "src/model/types/ce.ts"
      provides: "CE interface + parseCe(rep, enc): CE"
      exports: ["CE", "parseCe"]
    - path: "src/model/types/hd.ts"
      provides: "HD interface + parseHd(rep, enc): HD"
      exports: ["HD", "parseHd"]
    - path: "src/model/types/_shared.ts"
      provides: "Internal helpers shared across composite parsers (readSubcomponent, readComponent, silent-unescape wrapper)"
      exports: ["readSubcomponent", "readComponent"]
  key_links:
    - from: "src/model/types/*.ts"
      to: "src/parser/escapes.ts"
      via: "every composite parser calls unescape(sub, enc, noop, position) on each subcomponent read"
      pattern: "unescape\\("
    - from: "src/model/types/cx.ts"
      to: "src/model/types/hd.ts"
      via: "CX.assigningAuthority is a nested HD (component 4 of CX is an HD-shaped composite); parseCx delegates to parseHd via the component"
      pattern: "parseHd\\("
---

<objective>
Ship 6 of the 10 typed composite parsers defined by TYPES-01: XPN (Extended Person Name), XAD (Extended Address), CX (Extended Composite ID), CWE (Coded With Exceptions), CE (Coded Element), HD (Hierarchic Designator). Runs in parallel with Plan 03 (remaining 4 composites: XTN, PL, TS/DTM, NM) — disjoint file ownership.

Purpose: Phase 4's `msg.patient.name` (XPN), `msg.patient.address` (XAD), `msg.patient.mrn` and `.identifiers` (CX), `msg.observations()[n].identifier` (CE/CWE), and every `HD` reference (sending/receiving app+facility, assigning authority) all consume these parsers. Phase 3 ships the types and parsers; Plan 04 wires them onto `Field` via the `.asXxx()` coercions.

Output:
- 6 type+parser files under `src/model/types/` — one per composite.
- 1 shared internal helper file `src/model/types/_shared.ts` with `readSubcomponent(comp, idx, enc)` and `readComponent(rep, idx, enc)` — DRY utility used by all 10 composites across Plan 02 + Plan 03.
- 6 Vitest test files — one per composite, built against hand-constructed `RawRepetition` objects (per PATTERNS.md §test file §composite tests — no `parseHL7` round-trips needed since these are pure functions).
- Zero modifications to `src/index.ts` — Plan 04 wires the `HL7` namespace barrel. Plans 02/03 produce types internally consumed by Plan 04.
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
@.planning/phases/02-core-parser-and-tolerance/02-04-SUMMARY.md
@src/parser/types.ts
@src/parser/escapes.ts
@src/parser/delimiters.ts

<interfaces>
<!-- Produced by Phase 2 (parser tree) + Plan 01 (wrapper classes — Plan 02 does NOT depend on Plan 01's wrappers; composite parsers take the raw tree types only). -->

From src/parser/types.ts:
```typescript
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

Composite parser signature (locked by Plan 02/03):
```typescript
export function parseXxx(rep: RawRepetition, enc: EncodingCharacters): Xxx;
```

Notes:
- Composite parsers emit NO warnings (D-09). Pass `() => {}` as the emitter to `unescape`. Best-effort position is `{ segmentIndex: 0 }`.
- Composite parsers are pure — same input, same output. No memoization in v1.
- Optional interface fields use `readonly field?: string` — OMITTED when absent (exactOptionalPropertyTypes), NEVER set to `undefined`.
- No `{ ... } as XPN` object-literal cast (ESLint `consistent-type-assertions: objectLiteralTypeAssertions: "never"`). Use a `Mutable<T>` local type and conditional assignment, OR build the object via two-branch construction. PATTERNS.md §`exactOptionalPropertyTypes`-compatible construction shows both patterns.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/model/types/_shared.ts — readSubcomponent + readComponent helpers</name>
  <files>src/model/types/_shared.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-09 composite parsing lazy + silent; D-10 reuse Phase 2 infrastructure)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/types/xpn.ts` §Function signature pattern — readSub helper idea; §Shared Patterns §Auto-unescape at leaf)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/escapes.ts (unescape 4-arg signature + noop emitter pattern)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawRepetition, RawComponent)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc @example or @internal on exports)
  </read_first>
  <behavior>
    - Test 1: `readSubcomponent(comp, 0, enc)` on `{ subcomponents: ["Smith"] }` returns `"Smith"`.
    - Test 2: `readSubcomponent(comp, 0, enc)` on `{ subcomponents: ["Smith\\F\\Jr"] }` returns `"Smith|Jr"` (auto-unescaped).
    - Test 3: `readSubcomponent(comp, 5, enc)` when only 1 subcomponent exists returns `undefined`.
    - Test 4: `readSubcomponent(undefined, 0, enc)` returns `undefined` (safe on missing component).
    - Test 5: `readSubcomponent(comp, 0, enc)` on `{ subcomponents: [""] }` returns `undefined` (empty string treated as "not present" for composite-field omission purposes).
    - Test 6: `readComponent(rep, 0, enc)` on `{ components: [{ subcomponents: ["Smith"] }] }` returns `"Smith"` (shorthand for readSubcomponent(comp, 0, enc)).
    - Test 7: `readComponent(rep, 5, enc)` when only 1 component exists returns `undefined`.
    - These helpers are internal — NOT exported from the public barrel. Marked `@internal` in JSDoc.
  </behavior>
  <action>
Create directory `src/model/types/` if it doesn't exist:
```bash
mkdir -p src/model/types
```

Create `src/model/types/_shared.ts` (underscore prefix marks "internal to types/" convention):

```typescript
/**
 * Internal helpers shared across the 10 composite parsers (XPN, XAD, CX, CWE,
 * CE, XTN, PL, TS, NM, HD). Centralizes the "read subcomponent with
 * auto-unescape, return undefined on absent" pattern so composites stay
 * short and every composite handles missing/empty components identically.
 *
 * Not part of the public API — never re-exported from `src/index.ts`.
 */

import { unescape } from "../../parser/escapes.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawComponent,
  RawRepetition,
} from "../../parser/types.js";

/** @internal No-op emitter — composite parsers are silent (D-09). */
const NOOP_EMITTER = (): void => {};

/** @internal Best-effort position for unescape calls from composite parsers. */
const DEFAULT_POSITION: Hl7Position = { segmentIndex: 0 };

/**
 * Read `subcomponents[index]` from a component, auto-unescape it, and return
 * the result. Returns `undefined` when:
 * - `component` is `undefined` (missing component).
 * - `index` is out of range.
 * - the subcomponent is the empty string `""`.
 *
 * The empty-string → undefined mapping is deliberate: composite interfaces
 * use OPTIONAL fields, which must be OMITTED when absent
 * (exactOptionalPropertyTypes). Callers use the `undefined` return as the
 * signal to skip assignment:
 *
 * ```ts
 * const familyName = readSubcomponent(rep.components[0], 0, enc);
 * if (familyName !== undefined) out.familyName = familyName;
 * ```
 *
 * @internal
 */
export function readSubcomponent(
  component: RawComponent | undefined,
  index: number,
  enc: EncodingCharacters,
): string | undefined {
  if (component === undefined) return undefined;
  const sub = component.subcomponents[index];
  if (sub === undefined || sub === "") return undefined;
  return unescape(sub, enc, NOOP_EMITTER, DEFAULT_POSITION);
}

/**
 * Read the first subcomponent of `components[index]`, auto-unescape, and
 * return the result. Shorthand for `readSubcomponent(rep.components[index], 0, enc)`.
 * Most composite fields are single-subcomponent values — this helper keeps
 * composite parsers declarative.
 *
 * @internal
 */
export function readComponent(
  rep: RawRepetition,
  index: number,
  enc: EncodingCharacters,
): string | undefined {
  return readSubcomponent(rep.components[index], 0, enc);
}
```

**CRITICAL:** Empty-string → undefined mapping. The HL7 parser populates `subcomponents[i]` as `""` for explicitly-empty subcomponents (e.g. `^^Middle^` parses to `subcomponents: ["", "", "Middle", ""]` at one layer up). Composite parsers treat empty as "omit the field" so the resulting typed object doesn't carry stub empty strings for absent components. Document this rule clearly in the JSDoc.

**NOTE on test strategy:** `_shared.ts` is internal. Tests go inline in this task's acceptance: ship `test/types-shared.test.ts` covering the 7 behaviors above. Use unit-test style with hand-constructed `RawComponent` / `RawRepetition` literals (readonly cast via type annotation, never via `as`):

```typescript
import { describe, expect, it } from "vitest";
import { readSubcomponent, readComponent } from "../src/model/types/_shared.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawComponent, RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

describe("model/types/_shared: readSubcomponent", () => {
  it("reads the subcomponent at index 0", () => {
    const comp: RawComponent = { subcomponents: ["Smith"] };
    expect(readSubcomponent(comp, 0, enc)).toBe("Smith");
  });
  it("auto-unescapes at the leaf", () => {
    const comp: RawComponent = { subcomponents: ["Smith\\F\\Jr"] };
    expect(readSubcomponent(comp, 0, enc)).toBe("Smith|Jr");
  });
  it("returns undefined for out-of-range index", () => {
    const comp: RawComponent = { subcomponents: ["Smith"] };
    expect(readSubcomponent(comp, 5, enc)).toBeUndefined();
  });
  it("returns undefined when component is undefined", () => {
    expect(readSubcomponent(undefined, 0, enc)).toBeUndefined();
  });
  it("maps empty string to undefined (optional-field omission signal)", () => {
    const comp: RawComponent = { subcomponents: [""] };
    expect(readSubcomponent(comp, 0, enc)).toBeUndefined();
  });
});

describe("model/types/_shared: readComponent", () => {
  it("reads the first subcomponent of the nth component", () => {
    const rep: RawRepetition = { components: [{ subcomponents: ["Smith"] }] };
    expect(readComponent(rep, 0, enc)).toBe("Smith");
  });
  it("returns undefined for out-of-range component index", () => {
    const rep: RawRepetition = { components: [{ subcomponents: ["Smith"] }] };
    expect(readComponent(rep, 5, enc)).toBeUndefined();
  });
});
```

Write this test file at `test/types-shared.test.ts`.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/types/_shared.ts test/types-shared.test.ts --max-warnings=0 && pnpm test -- --run types-shared</automated>
  </verify>
  <acceptance_criteria>
    - `src/model/types/_shared.ts` exists with `readSubcomponent` and `readComponent` exports: `grep -cE "^export function (readSubcomponent|readComponent)" src/model/types/_shared.ts` returns 2.
    - Both exports marked `@internal`: `grep -c "@internal" src/model/types/_shared.ts` returns >= 3 (internal helpers + constants).
    - `unescape` imported and called: `grep -c "unescape(" src/model/types/_shared.ts` returns >= 1.
    - No `any`, no `console.*`: `grep -cE "(: any(\\s|,|\\))|console\\.)" src/model/types/_shared.ts` returns 0.
    - File-level JSDoc prose (no leading `@`): `awk 'NR==2 && /^ \* @/ { print "FAIL"; exit 1 }' src/model/types/_shared.ts` prints nothing.
    - Test file exists with 7 `it(` blocks.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run types-shared` all exit 0.
  </acceptance_criteria>
  <done>`_shared.ts` ships `readSubcomponent` + `readComponent` with full @internal JSDoc. 7 tests passing. Zero lint/typecheck warnings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create composites XPN, XAD, HD — the standalone people/address/hierarchic-designator family</name>
  <files>src/model/types/xpn.ts, src/model/types/xad.ts, src/model/types/hd.ts, test/types-xpn.test.ts, test/types-xad.test.ts, test/types-hd.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (§Specific Ideas — 14 components for XPN; §canonical_refs — XAD 12 components, HD 3 components; D-13 interfaces named-exported + re-exported under HL7 namespace (namespace barrel is Plan 04's job))
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/types/xpn.ts` — full canonical example with imports, function signature, type interface, exactOptionalPropertyTypes construction)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawRepetition, RawComponent, EncodingCharacters)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/_shared.ts (from Task 1 — readSubcomponent/readComponent signatures)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc @example on public exports, no object-literal as casts)
  </read_first>
  <behavior>
    XPN (14 components per HL7 v2.5.1):
    - Test 1: `parseXpn({ components: [{ subcomponents: ["Smith"] }] }, enc)` returns `{ familyName: "Smith" }` — other fields omitted (not `undefined`).
    - Test 2: `parseXpn` on a 3-component repetition `Smith^Jane^Q` returns `{ familyName: "Smith", givenName: "Jane", secondName: "Q" }`.
    - Test 3: `parseXpn` auto-unescapes `"Smith\\F\\Jr"` → `"Smith|Jr"` in familyName.
    - Test 4: `parseXpn` on `"^Jane^^^Mrs."` (family omitted) returns `{ givenName: "Jane", prefix: "Mrs." }` — no `familyName` key.
    - Test 5: `parseXpn` on `{ components: [] }` returns `{}` (empty object, no keys).
    - Test 6: `parseXpn` on a full 14-component repetition populates all 14 optional fields.
    - Test 7: `"familyName" in result` is `false` when the component is absent (exactOptionalPropertyTypes proof).

    XAD (12 components per HL7 v2.5.1):
    - Test 8: `parseXad` on `"123 Main St^Apt 4^Boston^MA^02101^USA"` returns `{ street: "123 Main St", otherDesignation: "Apt 4", city: "Boston", stateOrProvince: "MA", zipOrPostalCode: "02101", country: "USA" }`.
    - Test 9: `parseXad` on a 12-component repetition populates all 12 optional fields.
    - Test 10: `parseXad` on empty repetition returns `{}`.
    - Test 11: `parseXad` auto-unescapes street: `"123 Main St\\F\\Suite 5"` → `"123 Main St|Suite 5"`.

    HD (3 components per HL7 v2.5.1):
    - Test 12: `parseHd` on `"APP^1.2.3^UUID"` returns `{ namespaceId: "APP", universalId: "1.2.3", universalIdType: "UUID" }`.
    - Test 13: `parseHd` on `"APP"` (single component) returns `{ namespaceId: "APP" }`.
    - Test 14: `parseHd` on empty repetition returns `{}`.
  </behavior>
  <action>
**Create `src/model/types/xpn.ts`.**

File-level JSDoc (prose):
```typescript
/**
 * XPN — HL7 v2 Extended Person Name composite. 14-component structured-name
 * shape parsed from a `RawRepetition` on demand by `Field.asXpn()` (wired in
 * Plan 04). Fields are OMITTED when absent (exactOptionalPropertyTypes) —
 * NEVER set to `undefined`.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */
```

Imports:
```typescript
import { readComponent } from "./_shared.js";
import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";
```

Interface (match PATTERNS.md §`src/parser/types.ts::RawField` template — `readonly` everywhere, `@example` in JSDoc):

```typescript
/**
 * HL7 v2 Extended Person Name (XPN) — structured name per HL7 Chapter 2
 * Table 0200. All 14 components are optional. Fields are OMITTED when the
 * underlying component is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. familyName
 * 2. givenName
 * 3. secondName (or "second and further given names")
 * 4. suffix (e.g. Jr., III)
 * 5. prefix (e.g. Dr., Mrs.)
 * 6. degree (e.g. MD, PhD)
 * 7. nameTypeCode (L=Legal, M=Maiden, N=Nickname...)
 * 8. nameRepresentationCode
 * 9. nameContext (flattened to string in v1 — CWE nesting is out of scope)
 * 10. nameValidityRange
 * 11. nameAssemblyOrder (F=family first, G=given first)
 * 12. effectiveDate (raw HL7 TS string — caller may parse via parseHl7Timestamp)
 * 13. expirationDate
 * 14. professionalSuffix
 *
 * @example
 * ```ts
 * import type { XPN } from "@cosyte/hl7-parser";
 * const name: XPN = { familyName: "Smith", givenName: "Jane", prefix: "Mrs." };
 * ```
 */
export interface XPN {
  readonly familyName?: string;
  readonly givenName?: string;
  readonly secondName?: string;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly degree?: string;
  readonly nameTypeCode?: string;
  readonly nameRepresentationCode?: string;
  readonly nameContext?: string;
  readonly nameValidityRange?: string;
  readonly nameAssemblyOrder?: string;
  readonly effectiveDate?: string;
  readonly expirationDate?: string;
  readonly professionalSuffix?: string;
}
```

Parser (per PATTERNS.md §`src/model/types/xpn.ts` §Function signature pattern — Mutable<T> + conditional assignment):

```typescript
/**
 * Parse an HL7 v2 XPN repetition into a structured `XPN` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics).
 *
 * @example
 * ```ts
 * import { parseXpn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const rep = { components: [{ subcomponents: ["Smith"] }, { subcomponents: ["Jane"] }] };
 * const xpn = parseXpn(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(xpn.familyName); // "Smith"
 * console.log(xpn.givenName);  // "Jane"
 * ```
 */
export function parseXpn(rep: RawRepetition, enc: EncodingCharacters): XPN {
  // Use a Mutable<T> local to satisfy exactOptionalPropertyTypes without the
  // (forbidden) `{ ... } as XPN` object-literal cast.
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<XPN> = {};

  const familyName = readComponent(rep, 0, enc);
  if (familyName !== undefined) out.familyName = familyName;

  const givenName = readComponent(rep, 1, enc);
  if (givenName !== undefined) out.givenName = givenName;

  const secondName = readComponent(rep, 2, enc);
  if (secondName !== undefined) out.secondName = secondName;

  const suffix = readComponent(rep, 3, enc);
  if (suffix !== undefined) out.suffix = suffix;

  const prefix = readComponent(rep, 4, enc);
  if (prefix !== undefined) out.prefix = prefix;

  const degree = readComponent(rep, 5, enc);
  if (degree !== undefined) out.degree = degree;

  const nameTypeCode = readComponent(rep, 6, enc);
  if (nameTypeCode !== undefined) out.nameTypeCode = nameTypeCode;

  const nameRepresentationCode = readComponent(rep, 7, enc);
  if (nameRepresentationCode !== undefined) out.nameRepresentationCode = nameRepresentationCode;

  const nameContext = readComponent(rep, 8, enc);
  if (nameContext !== undefined) out.nameContext = nameContext;

  const nameValidityRange = readComponent(rep, 9, enc);
  if (nameValidityRange !== undefined) out.nameValidityRange = nameValidityRange;

  const nameAssemblyOrder = readComponent(rep, 10, enc);
  if (nameAssemblyOrder !== undefined) out.nameAssemblyOrder = nameAssemblyOrder;

  const effectiveDate = readComponent(rep, 11, enc);
  if (effectiveDate !== undefined) out.effectiveDate = effectiveDate;

  const expirationDate = readComponent(rep, 12, enc);
  if (expirationDate !== undefined) out.expirationDate = expirationDate;

  const professionalSuffix = readComponent(rep, 13, enc);
  if (professionalSuffix !== undefined) out.professionalSuffix = professionalSuffix;

  return out;
}
```

**Create `src/model/types/xad.ts`** with the same shape — 12 components:

XAD fields (HL7 v2.5.1):
1. `street` (streetAddress)
2. `otherDesignation` (e.g. Apt 4)
3. `city`
4. `stateOrProvince`
5. `zipOrPostalCode`
6. `country`
7. `addressType` (H=Home, B=Business, M=Mailing...)
8. `otherGeographicDesignation`
9. `countyParishCode`
10. `censusTract`
11. `addressRepresentationCode`
12. `addressValidityRange`

Full interface with `@example`. Parser follows the same Mutable<T> + conditional pattern. 12 `readComponent` calls.

**Create `src/model/types/hd.ts`** — 3 components:

HD fields (HL7 v2.5.1):
1. `namespaceId`
2. `universalId`
3. `universalIdType` (ISO, GUID, UUID, DNS, URI, HL7, HCD, Random, etc.)

Full interface with `@example`. Parser: 3 `readComponent` calls.

**Test files.** Follow PATTERNS.md §`test/types-xpn.test.ts` shape (Vitest imports, hand-built `RawRepetition` literal, simple helper `rep(components)`):

```typescript
// test/types-xpn.test.ts
import { describe, expect, it } from "vitest";
import { parseXpn } from "../src/model/types/xpn.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/xpn: parseXpn", () => {
  it("extracts familyName from component 1", () => {
    const out = parseXpn(rep([["Smith"]]), enc);
    expect(out.familyName).toBe("Smith");
    expect("givenName" in out).toBe(false);
  });

  it("populates 3 leading components", () => {
    const out = parseXpn(rep([["Smith"], ["Jane"], ["Q"]]), enc);
    expect(out).toStrictEqual({ familyName: "Smith", givenName: "Jane", secondName: "Q" });
  });

  it("auto-unescapes \\F\\ inside a component", () => {
    const out = parseXpn(rep([["Smith\\F\\Jr"]]), enc);
    expect(out.familyName).toBe("Smith|Jr");
  });

  it("omits absent components (exactOptionalPropertyTypes)", () => {
    const out = parseXpn(rep([[""], ["Jane"], [""], [""], ["Mrs."]]), enc);
    expect(out.givenName).toBe("Jane");
    expect(out.prefix).toBe("Mrs.");
    expect("familyName" in out).toBe(false);
    expect("secondName" in out).toBe(false);
    expect("suffix" in out).toBe(false);
  });

  it("returns empty object on zero components", () => {
    const out = parseXpn({ components: [] }, enc);
    expect(out).toStrictEqual({});
  });

  it("populates all 14 components when present", () => {
    const fourteen = [
      ["Smith"], ["Jane"], ["Q"], ["Jr"], ["Mrs."], ["MD"], ["L"], ["A"],
      ["ctx"], ["range"], ["G"], ["20250101"], ["20991231"], ["Esq"],
    ];
    const out = parseXpn(rep(fourteen), enc);
    expect(out).toStrictEqual({
      familyName: "Smith", givenName: "Jane", secondName: "Q", suffix: "Jr",
      prefix: "Mrs.", degree: "MD", nameTypeCode: "L", nameRepresentationCode: "A",
      nameContext: "ctx", nameValidityRange: "range", nameAssemblyOrder: "G",
      effectiveDate: "20250101", expirationDate: "20991231", professionalSuffix: "Esq",
    });
  });
});
```

Mirror the shape for `test/types-xad.test.ts` (11 cases — 12 components, empty-case, unescape, partial, empty-object) and `test/types-hd.test.ts` (6 cases — 3 components, empty, partial, unescape, full).

**Each composite file gets a full `@example` on BOTH the interface AND the `parseXxx` function** (ESLint `jsdoc/require-example` fires on every public export).
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/types/xpn.ts src/model/types/xad.ts src/model/types/hd.ts test/types-xpn.test.ts test/types-xad.test.ts test/types-hd.test.ts --max-warnings=0 && pnpm test -- --run "types-xpn|types-xad|types-hd"</automated>
  </verify>
  <acceptance_criteria>
    - 3 source files exist: `test -f src/model/types/xpn.ts && test -f src/model/types/xad.ts && test -f src/model/types/hd.ts && echo OK`.
    - Each file exports the interface AND the parser: `grep -cE "^export (interface|function) (XPN|parseXpn|XAD|parseXad|HD|parseHd)" src/model/types/xpn.ts src/model/types/xad.ts src/model/types/hd.ts` returns 6.
    - XPN has 14 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/xpn.ts` returns 14.
    - XAD has 12 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/xad.ts` returns 12.
    - HD has 3 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/hd.ts` returns 3.
    - Each parser reads all components: `grep -c "readComponent(" src/model/types/xpn.ts` returns 14; `grep -c "readComponent(" src/model/types/xad.ts` returns 12; `grep -c "readComponent(" src/model/types/hd.ts` returns 3.
    - No object-literal `as` casts: `grep -cE "\\} as (XPN|XAD|HD)" src/model/types/xpn.ts src/model/types/xad.ts src/model/types/hd.ts` returns 0.
    - No `any`, no `console.*`: `grep -cE "(: any(\\s|,|\\))|console\\.)" src/model/types/xpn.ts src/model/types/xad.ts src/model/types/hd.ts` returns 0.
    - `@example` on every public export (2 per file × 3 files = 6 minimum): `grep -c "@example" src/model/types/xpn.ts src/model/types/xad.ts src/model/types/hd.ts` returns >= 6.
    - Test files exist with all expected behaviors.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run "types-xpn|types-xad|types-hd"` all exit 0.
  </acceptance_criteria>
  <done>XPN, XAD, HD composite parsers ship with full interfaces, 6 tests per composite (18-20 total), all `exactOptionalPropertyTypes` compliant (no `as` casts, OMITTED-when-absent). Zero lint/typecheck warnings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create composites CX, CWE, CE — identifier + coded-element family (CX depends on HD)</name>
  <files>src/model/types/cx.ts, src/model/types/cwe.ts, src/model/types/ce.ts, test/types-cx.test.ts, test/types-cwe.test.ts, test/types-ce.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (§Specific Ideas — CX 10, CWE 13 but v1 trims to 9, CE 6; §canonical_refs — CX.assigningAuthority is a nested HD)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/types/xpn.ts` — same pattern applies; note CX has ONE nested-HD component)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/hd.ts (from Task 2 — parseHd signature for CX's component 4)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/_shared.ts (from Task 1 — readComponent)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawRepetition — need to synthesize a sub-RawRepetition for the nested HD parse)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc @example)
  </read_first>
  <behavior>
    CX (10 components):
    - Test 1: `parseCx` on `"123^1^M11^APP^MR^FAC^20250101^20991231^Jur^Dept"` returns 10 populated fields.
    - Test 2: `parseCx` on `"123"` returns `{ idNumber: "123" }` only.
    - Test 3: `parseCx.assigningAuthority` is a nested `HD` object when component 4 has subcomponents.
      - Input: `{ components: [{sub:["123"]}, {sub:[""]}, {sub:[""]}, { subcomponents: ["APP", "1.2.3", "UUID"] }] }`
      - Expected: `{ idNumber: "123", assigningAuthority: { namespaceId: "APP", universalId: "1.2.3", universalIdType: "UUID" } }`
    - Test 4: `parseCx.assigningAuthority` is OMITTED when component 4 is empty (no `assigningAuthority` key).
    - Test 5: `parseCx` on empty repetition returns `{}`.
    - Test 6: `parseCx` auto-unescapes idNumber: `"123\\F\\456"` → `"123|456"`.

    CWE (9 components for v1):
    - Test 7: `parseCwe` on `"GLU^Glucose^LN^GLUC-SER^Glucose Serum^L^v1^vA^Note"` returns all 9 fields.
    - Test 8: `parseCwe` on `"GLU"` returns `{ identifier: "GLU" }`.
    - Test 9: `parseCwe` on empty repetition returns `{}`.

    CE (6 components):
    - Test 10: `parseCe` on `"GLU^Glucose^LN^GLUC-SER^Glucose Serum^L"` returns all 6 fields.
    - Test 11: `parseCe` on `"GLU^Glucose^LN"` returns first 3 populated.
    - Test 12: `parseCe` on empty repetition returns `{}`.
    - Test 13: `parseCe` auto-unescapes text: `"Glu\\F\\cose"` → `"Glu|cose"`.
  </behavior>
  <action>
**Create `src/model/types/cx.ts`.**

CX fields (HL7 v2.5.1 CX — 10 components):
1. `idNumber` (string)
2. `checkDigit` (string)
3. `checkDigitScheme` (ISO 7064, M10, M11, NPI)
4. `assigningAuthority` (nested HD — 3 subcomponents)
5. `identifierTypeCode` (MR, SSN, DL, MC...)
6. `assigningFacility` (nested HD — but per CONTEXT.md §canonical_refs only component 4 is "nested HD"; component 6 is often also HD-shaped. V1 decision: component 6 is `string` flattened — consistent with other composite's "flatten nested CWE to string" decision for XPN.nameContext.)
7. `effectiveDate` (string — raw HL7 TS; caller parses if needed)
8. `expirationDate` (string)
9. `assigningJurisdiction` (string — flattened)
10. `assigningAgencyOrDepartment` (string — flattened)

**Only component 4 (assigningAuthority) uses the full nested-HD shape.** Component 6 (assigningFacility) is simplified to `string` for v1. Document this in the CX interface JSDoc.

Interface:
```typescript
import type { HD } from "./hd.js";

export interface CX {
  readonly idNumber?: string;
  readonly checkDigit?: string;
  readonly checkDigitScheme?: string;
  readonly assigningAuthority?: HD;
  readonly identifierTypeCode?: string;
  readonly assigningFacility?: string;
  readonly effectiveDate?: string;
  readonly expirationDate?: string;
  readonly assigningJurisdiction?: string;
  readonly assigningAgencyOrDepartment?: string;
}
```

Parser — components 1,2,3,5,6,7,8,9,10 use `readComponent`; component 4 (index 3) delegates to `parseHd` with a SYNTHESIZED single-repetition wrapper. The raw tree has components[3] as a `RawComponent { subcomponents: ["APP", "1.2.3", "UUID"] }`. We need to feed `parseHd` a `RawRepetition` whose components are drawn FROM the subcomponents of components[3].

The trick: each HD component is actually a SUBCOMPONENT of the CX component 4. So we build a synthetic `RawRepetition` from the 3 subcomponents of CX's component 4:

```typescript
import { parseHd } from "./hd.js";
import { readComponent } from "./_shared.js";
import type { EncodingCharacters, RawComponent, RawRepetition } from "../../parser/types.js";

/**
 * Parse CX component 4 (assigningAuthority) from its subcomponents into an HD.
 * The 3 HD subfields live as subcomponents of the CX component; we build a
 * synthetic RawRepetition where each synthetic component wraps one subcomponent
 * of the CX component as its own single subcomponent. This lets parseHd consume
 * the value via its existing (rep, enc) signature.
 * @internal
 */
function parseAssigningAuthority(
  comp: RawComponent | undefined,
  enc: EncodingCharacters,
): HD | undefined {
  if (comp === undefined) return undefined;
  if (comp.subcomponents.every((s) => s === "")) return undefined;
  const synthetic: RawRepetition = {
    components: comp.subcomponents.map((sub) => ({ subcomponents: [sub] })),
  };
  const hd = parseHd(synthetic, enc);
  return Object.keys(hd).length === 0 ? undefined : hd;
}

export function parseCx(rep: RawRepetition, enc: EncodingCharacters): CX {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<CX> = {};

  const idNumber = readComponent(rep, 0, enc);
  if (idNumber !== undefined) out.idNumber = idNumber;

  const checkDigit = readComponent(rep, 1, enc);
  if (checkDigit !== undefined) out.checkDigit = checkDigit;

  const checkDigitScheme = readComponent(rep, 2, enc);
  if (checkDigitScheme !== undefined) out.checkDigitScheme = checkDigitScheme;

  const assigningAuthority = parseAssigningAuthority(rep.components[3], enc);
  if (assigningAuthority !== undefined) out.assigningAuthority = assigningAuthority;

  const identifierTypeCode = readComponent(rep, 4, enc);
  if (identifierTypeCode !== undefined) out.identifierTypeCode = identifierTypeCode;

  const assigningFacility = readComponent(rep, 5, enc);
  if (assigningFacility !== undefined) out.assigningFacility = assigningFacility;

  const effectiveDate = readComponent(rep, 6, enc);
  if (effectiveDate !== undefined) out.effectiveDate = effectiveDate;

  const expirationDate = readComponent(rep, 7, enc);
  if (expirationDate !== undefined) out.expirationDate = expirationDate;

  const assigningJurisdiction = readComponent(rep, 8, enc);
  if (assigningJurisdiction !== undefined) out.assigningJurisdiction = assigningJurisdiction;

  const assigningAgencyOrDepartment = readComponent(rep, 9, enc);
  if (assigningAgencyOrDepartment !== undefined) out.assigningAgencyOrDepartment = assigningAgencyOrDepartment;

  return out;
}
```

Full `@example` on both the `CX` interface and `parseCx`.

**Create `src/model/types/cwe.ts`** — 9 components for v1 (per CONTEXT.md §must_haves truth "CWE with 9 core components"):

CWE fields:
1. `identifier` (e.g. "GLU")
2. `text` (e.g. "Glucose")
3. `nameOfCodingSystem` (e.g. "LN" for LOINC)
4. `alternateIdentifier`
5. `alternateText`
6. `nameOfAlternateCodingSystem`
7. `codingSystemVersionId`
8. `alternateCodingSystemVersionId`
9. `originalText`

Straightforward — 9 `readComponent` calls. No nested composites.

**Create `src/model/types/ce.ts`** — 6 components:

CE fields:
1. `identifier`
2. `text`
3. `nameOfCodingSystem`
4. `alternateIdentifier`
5. `alternateText`
6. `nameOfAlternateCodingSystem`

6 `readComponent` calls.

**Test files:**

`test/types-cx.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { parseCx } from "../src/model/types/cx.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function rep(components: string[][]): RawRepetition {
  return { components: components.map((sc) => ({ subcomponents: sc })) };
}

describe("model/types/cx: parseCx", () => {
  it("extracts idNumber from component 1", () => {
    const out = parseCx(rep([["123"]]), enc);
    expect(out).toStrictEqual({ idNumber: "123" });
  });

  it("parses nested HD in component 4 (assigningAuthority)", () => {
    const out = parseCx(
      rep([["123"], [""], [""], ["APP", "1.2.3", "UUID"]]),
      enc,
    );
    expect(out.idNumber).toBe("123");
    expect(out.assigningAuthority).toStrictEqual({
      namespaceId: "APP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it("omits assigningAuthority when component 4 is all empty subs", () => {
    const out = parseCx(rep([["123"], [""], [""], ["", "", ""]]), enc);
    expect("assigningAuthority" in out).toBe(false);
  });

  it("populates all 10 components when present", () => {
    const out = parseCx(rep([
      ["123"], ["1"], ["M11"], ["APP", "1.2.3", "UUID"], ["MR"],
      ["FAC"], ["20250101"], ["20991231"], ["Jur"], ["Dept"],
    ]), enc);
    expect(out).toStrictEqual({
      idNumber: "123", checkDigit: "1", checkDigitScheme: "M11",
      assigningAuthority: { namespaceId: "APP", universalId: "1.2.3", universalIdType: "UUID" },
      identifierTypeCode: "MR", assigningFacility: "FAC",
      effectiveDate: "20250101", expirationDate: "20991231",
      assigningJurisdiction: "Jur", assigningAgencyOrDepartment: "Dept",
    });
  });

  it("returns {} on empty repetition", () => {
    expect(parseCx({ components: [] }, enc)).toStrictEqual({});
  });

  it("auto-unescapes idNumber", () => {
    const out = parseCx(rep([["123\\F\\456"]]), enc);
    expect(out.idNumber).toBe("123|456");
  });
});
```

Mirror for `test/types-cwe.test.ts` (5-6 cases) and `test/types-ce.test.ts` (5-6 cases).
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/types/cx.ts src/model/types/cwe.ts src/model/types/ce.ts test/types-cx.test.ts test/types-cwe.test.ts test/types-ce.test.ts --max-warnings=0 && pnpm test -- --run "types-cx|types-cwe|types-ce"</automated>
  </verify>
  <acceptance_criteria>
    - 3 source files exist: `test -f src/model/types/cx.ts && test -f src/model/types/cwe.ts && test -f src/model/types/ce.ts && echo OK`.
    - 6 exports total (3 interfaces + 3 parsers): `grep -cE "^export (interface|function) (CX|parseCx|CWE|parseCwe|CE|parseCe)" src/model/types/cx.ts src/model/types/cwe.ts src/model/types/ce.ts` returns 6.
    - CX has 10 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/cx.ts` returns 10.
    - CWE has 9 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/cwe.ts` returns 9.
    - CE has 6 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/ce.ts` returns 6.
    - CX imports parseHd for nested composite: `grep -cE "import.*\\{.*parseHd.*\\}" src/model/types/cx.ts` returns 1.
    - CX.assigningAuthority is typed as HD: `grep -cE "assigningAuthority\\?: HD" src/model/types/cx.ts` returns 1.
    - No `any`, no `console.*`, no object-literal `as`: `grep -cE "(: any(\\s|,|\\))|console\\.|\\} as (CX|CWE|CE))" src/model/types/cx.ts src/model/types/cwe.ts src/model/types/ce.ts` returns 0.
    - `@example` on every public export: `grep -c "@example" src/model/types/cx.ts src/model/types/cwe.ts src/model/types/ce.ts` returns >= 6.
    - Test files exist with nested-HD test case in CX suite: `grep -c "assigningAuthority" test/types-cx.test.ts` returns >= 2.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run "types-cx|types-cwe|types-ce"` all exit 0.
  </acceptance_criteria>
  <done>CX, CWE, CE composite parsers ship. CX demonstrates nested-HD composition. 15+ tests across 3 files passing. Zero lint/typecheck warnings.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| raw subcomponent string → composite parser output | Subcomponents are already-tokenized but may contain HL7 escape sequences; unescape is invoked per-subcomponent with a no-op emitter (Phase 3 composites are silent per D-09). |
| parseCx component 4 → synthetic RawRepetition for parseHd | Synthetic tree construction must not blow up on odd-shaped input (empty subcomponents, 0 components, etc.). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-02-01 | Denial of Service | composite parsers scanning subcomponents | mitigate | Each parser is O(k) where k = component count (bounded at 14 for the largest, XPN). No recursion except parseCx → parseHd once per call. |
| T-03-02-02 | Tampering | nested-HD synthesis in parseCx | mitigate | `parseAssigningAuthority` explicitly checks `comp.subcomponents.every(s => s === "")` before constructing the synthetic tree, so all-empty input returns `undefined` rather than an empty HD object. Prevents stub HD objects from leaking into CX output. |
| T-03-02-03 | Information Disclosure | unescape output surfaces raw content | accept | Consumer responsibility — same posture as Phase 2 Plan 04. Composite parsers do not log, do not throw, do not reach the network. |
</threat_model>

<verification>
After all 3 tasks:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run "types-"
pnpm build
```

All exit 0. `dist/` does NOT yet contain XPN/XAD/CX/CWE/CE/HD exports because `src/index.ts` is not modified in this plan — Plan 04 handles the barrel.
</verification>

<success_criteria>
- 6 composite type+parser files under `src/model/types/` (xpn, xad, cx, cwe, ce, hd) + 1 shared helper file (_shared.ts).
- 6 Vitest test files with 30+ tests total across composites.
- TYPES-01 satisfied for 6 of 10 composites (XPN, XAD, CX, CWE, CE, HD). Plan 03 covers XTN, PL, TS, NM.
- TYPES-02 (parsed instances of these types) — the parsers PRODUCE typed instances; Plan 04 wires them onto `Field.asXxx()`.
- Zero modifications to `src/index.ts`, `src/model/message.ts`, `src/model/segment.ts`, `src/model/field.ts`. No overlap with Plan 01 or Plan 03 file ownership.
- Zero runtime deps added. Zero lint warnings. Zero typecheck errors. Every existing Phase 1/2/Plan-01 test still passes.
</success_criteria>

<output>
After completion, create `.planning/phases/03-structural-model-and-types/03-02-SUMMARY.md` describing:
- What shipped: 7 new source files (_shared, xpn, xad, hd, cx, cwe, ce), 7 new test files.
- REQ-IDs progressed: TYPES-01 (6 of 10 composites), TYPES-02 (parsers produce typed shapes — wiring lands in Plan 04).
- Decisions applied: D-09 silent lazy parsing, D-10 reuse of Phase 2 `unescape`, D-13 named exports ready for Plan 04's HL7 namespace.
- Design notes:
  - CX.assigningAuthority uses nested HD via synthetic RawRepetition trick — documented as the canonical pattern if Plan 03's XTN/PL also need nested parsing.
  - CWE truncated to 9 components (dropped sixthToEleventh per CONTEXT §specifics — matches HL7 v2.5 common use; v2 may restore full shape).
  - CX.assigningFacility flattened to `string` (simpler than nested-HD; caller can `parseHd` the raw string if needed).
- Notes for Plan 03: use the same `_shared.ts` helpers (`readComponent`, `readSubcomponent`). For TS composite, pass-through to `parseHl7Timestamp` per D-10.
- Notes for Plan 04: `parseXpn`, `parseXad`, `parseCx`, `parseCwe`, `parseCe`, `parseHd` are ready to be wired as `Field.asXpn()`, `.asXad()`, `.asCx()`, `.asCwe()`, `.asCe()`, `.asHd()`. All take `(rep, enc)` and return the typed shape; Field wrapper calls `parseXxx(this.repetitions[0] ?? EMPTY_REP, this.enc)`.
</output>
