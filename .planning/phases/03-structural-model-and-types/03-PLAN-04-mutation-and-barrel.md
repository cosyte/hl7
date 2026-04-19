---
phase: 03-structural-model-and-types
plan: 04
title: Mutation methods, Field.asXxx coercions, HL7 namespace barrel
type: execute
wave: 3
depends_on: [03-PLAN-01, 03-PLAN-02, 03-PLAN-03]
files_modified:
  - src/model/field.ts
  - src/model/message.ts
  - src/model/types/index.ts
  - src/model/types/namespace.ts
  - src/index.ts
  - test/model-field-coercions.test.ts
  - test/model-mutation.test.ts
autonomous: true
requirements: [MODEL-06, MODEL-07, TYPES-02]

must_haves:
  truths:
    - "A developer calls `msg.segments('PID')[0].field(5).asXpn()` and receives a typed `XPN` object parsed from the PID-5 first repetition."
    - "A developer calls `.asXad()`, `.asCx()`, `.asCwe()`, `.asCe()`, `.asXtn()`, `.asPl()`, `.asTs()`, `.asNm()`, `.asHd()` on any `Field` and receives the corresponding typed composite — all 10 coercions wired (TYPES-02)."
    - "A developer calls `.asXpn()` on an empty Field (no repetitions) and receives `{}` (empty XPN) rather than throwing."
    - "A developer calls `msg.setField('PID.8', 'F')` and then `msg.get('PID.8')` returns `'F'` — mutation visible on subsequent reads (MODEL-07)."
    - "A developer calls `msg.setField('PID.8', 'F').addSegment('NTE', ['', 'note text']).removeSegment('EVN')` and the three mutations chain (each returns `this` per D-15)."
    - "A developer calls `msg.addSegment('NTE', ['', 'note'])` and `msg.segments('NTE')` returns a 1-element array — segment-type cache invalidated per D-17."
    - "A developer calls `msg.addSegment('lowercase', [])` and receives a thrown `TypeError` — segment-name regex `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` enforced per D-19."
    - "A developer calls `msg.setField('NOT.5', 'x')` on a segment type that doesn't exist and receives a thrown `TypeError` with an actionable message (recommendation: throw, do not auto-create — per CONTEXT.md §Claude's Discretion Recommendation)."
    - "A developer imports `import { HL7 } from '@cosyte/hl7-parser'` and writes `type T = HL7.XPN` — resolves to the XPN interface (D-13 namespace re-export). Also `import type { XPN } from '@cosyte/hl7-parser'` works as a named import."
    - "A developer's `msg.warnings` remains frozen after any mutation — the mutation API never emits warnings and never touches `warnings` (D-16)."
  artifacts:
    - path: "src/model/field.ts"
      provides: "Field class extended with 10 .asXxx() composite coercions"
      exports: ["Field"]
    - path: "src/model/message.ts"
      provides: "Hl7Message extended with setField, addSegment, removeSegment + cache invalidation"
      exports: ["Hl7Message"]
    - path: "src/model/types/index.ts"
      provides: "Barrel for all 10 composite types + parsers (named exports)"
      exports: ["XPN", "XAD", "CX", "CWE", "CE", "XTN", "PL", "TS", "NM", "HD", "parseXpn", "parseXad", "parseCx", "parseCwe", "parseCe", "parseXtn", "parsePl", "parseTs", "parseNm", "parseHd"]
    - path: "src/model/types/namespace.ts"
      provides: "HL7 namespace — `export type { XPN, XAD, ... } from './xpn.js'` etc."
    - path: "src/index.ts"
      provides: "Final public barrel with composite types + HL7 namespace re-export"
      exports: ["* as HL7", "XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD"]
  key_links:
    - from: "src/model/field.ts"
      to: "src/model/types/*.ts"
      via: "Field.asXxx() methods import and delegate to parseXxx(this.repetitions[0] ?? EMPTY_REP, this.enc)"
      pattern: "parseXpn\\(|parseXad\\(|parseCx\\(|parseCwe\\(|parseCe\\(|parseXtn\\(|parsePl\\(|parseTs\\(|parseNm\\(|parseHd\\("
    - from: "src/model/message.ts"
      to: "src/model/dot-path.ts"
      via: "setField calls parsePath to tokenize the path before mutating"
      pattern: "parsePath\\("
    - from: "src/index.ts"
      to: "src/model/types/namespace.ts"
      via: "`export * as HL7 from './model/types/namespace.js';` re-exports the full composite namespace"
      pattern: "export \\* as HL7"
---

<objective>
Phase 3 capstone — serial, single-plan-per-wave. Three concerns land together because they are tightly coupled:

1. **Field.asXxx() wiring** — add all 10 composite coercion methods to `Field`, one per composite shipped by Plans 02+03.
2. **Mutation methods** — `setField(path, value)`, `addSegment(name, fields)`, `removeSegment(matcher)` on `Hl7Message`, with wrapper-cache invalidation (D-17).
3. **HL7 namespace barrel + src/index.ts final exports** — D-13 named-exports AND namespace re-export for all 10 types + 10 parsers.

Purpose: Close MODEL-06 (immutability by convention), MODEL-07 (explicit mutation methods), TYPES-02 (Field.asXxx returns parsed instances). After this plan, the full Phase 3 surface is shipped and Phase 4 can build `msg.meta` / `msg.patient` on top of a stable API.

Output:
- `src/model/field.ts` (MODIFIED) — 10 new methods: `asXpn`, `asXad`, `asCx`, `asCwe`, `asCe`, `asXtn`, `asPl`, `asTs`, `asNm`, `asHd`. Each delegates to the Plan 02/03 parser.
- `src/model/message.ts` (MODIFIED) — 3 new methods: `setField`, `addSegment`, `removeSegment`. Each mutates `this.rawSegments` in place, invalidates `_segmentsByType` + `_allSegments`, returns `this`.
- `src/model/types/index.ts` (NEW) — re-exports all 10 interfaces + 10 parsers by name.
- `src/model/types/namespace.ts` (NEW) — `export type { XPN, XAD, ... }` — consumed by `src/index.ts` via `export * as HL7 from './model/types/namespace.js';`.
- `src/index.ts` (MODIFIED) — add the 10 composite type re-exports + the `HL7` namespace + the 10 parser re-exports.
- `test/model-field-coercions.test.ts` — verify each `.asXxx()` method returns the correct composite shape (integration tests through `parseHL7`).
- `test/model-mutation.test.ts` — verify `setField`/`addSegment`/`removeSegment` semantics: in-place mutation, chainability, cache invalidation, validation errors.
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
@.planning/phases/03-structural-model-and-types/03-PLAN-01-read-path-foundation.md
@.planning/phases/03-structural-model-and-types/03-PLAN-02-composites-person-address-identifier.md
@.planning/phases/03-structural-model-and-types/03-PLAN-03-composites-telecom-location-timestamp-numeric.md
@src/parser/types.ts
@src/parser/escapes.ts
@src/parser/dates.ts
@src/parser/delimiters.ts
@src/model/message.ts
@src/model/segment.ts
@src/model/field.ts
@src/model/dot-path.ts
@src/index.ts

<interfaces>
<!-- Produced by Plans 01/02/03. -->

From src/model/dot-path.ts (Plan 01):
```typescript
export interface DotPath {
  readonly segmentType: string;
  readonly segmentIndex: number;
  readonly fieldIndex: number;
  readonly repetitionIndex?: number;
  readonly componentIndex?: number;
  readonly subcomponentIndex?: number;
}
export function parsePath(path: string): DotPath;
export function resolvePath(path: string, segments: readonly RawSegment[], enc: EncodingCharacters): string | undefined;
```

From src/model/field.ts (Plan 01):
```typescript
export class Field {
  public readonly isNull: boolean;
  public readonly repetitions: readonly RawRepetition[];
  public readonly enc: EncodingCharacters;
  public readonly position: Hl7Position;
  public readonly raw: RawField;
  public constructor(raw: RawField, enc: EncodingCharacters, position: Hl7Position);
  public get value(): string;
  public static empty(enc: EncodingCharacters): Field;
}
```

From src/model/segment.ts (Plan 01):
```typescript
export class Segment {
  public readonly type: string;
  public readonly fields: readonly RawField[];
  public readonly enc: EncodingCharacters;
  public readonly absoluteIndex: number;
  public readonly raw: RawSegment;
  public constructor(raw: RawSegment, enc: EncodingCharacters, absoluteIndex: number);
  public field(n: number): Field;
}
```

From src/model/message.ts (Plan 01, after modification):
```typescript
export class Hl7Message {
  public readonly rawSegments: readonly RawSegment[];  // renamed from `segments` in Plan 01
  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;
  private _segmentsByType: Map<string, Segment[]> | undefined;
  private _allSegments: Segment[] | undefined;
  public constructor(init: Hl7MessageInit);
  public get(path: string): string | undefined;
  public getAll(segmentType: string): readonly Segment[];
  public segments(segmentType: string): readonly Segment[];
  public allSegments(): readonly Segment[];
}
```

From Plans 02/03 composite parsers — all share the signature:
```typescript
export function parseXxx(rep: RawRepetition, enc: EncodingCharacters): Xxx;
```

The 10 composite interfaces: `XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD`. Each is in its own file under `src/model/types/{lowercase}.ts`.

Mutation contract (from CONTEXT.md decisions):
- **D-15:** In-place; chainable; returns `this`.
- **D-16:** `warnings` stays frozen; `rawSegments` tree becomes writable.
- **D-17:** After any mutation, invalidate `_segmentsByType` and `_allSegments` wholesale (drop both).
- **D-18:** `setField` parses the path (throws TypeError on malformed); value accepted verbatim (re-escaping deferred to Phase 5).
- **D-19:** `addSegment(name, fields)`: `name` must match `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u`; fields accepted as `readonly (string | RawField)[]`.
- **D-20:** No dirty flag, no version counter.
- **Claude's Discretion item:** `setField('NOT.5', 'x')` on missing segment — **recommendation: throw**, do NOT auto-create. Caller must `addSegment` first.
- **Claude's Discretion item:** `removeSegment` — minimum viable: `removeSegment(segmentType: string, occurrence?: number, options?: { all?: boolean }): this`. Match by segment name + 0-indexed occurrence; `{ all: true }` removes all. Never remove MSH (throw TypeError if asked).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add 10 .asXxx() composite coercions to Field</name>
  <files>src/model/field.ts, test/model-field-coercions.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-08 .asXxx() list; D-09 lazy not memoized v1)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/field.ts` §Coercion-method pattern)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/field.ts (current Field class from Plan 01)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/xpn.ts (parseXpn signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/xad.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/cx.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/cwe.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/ce.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/xtn.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/pl.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/ts.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/nm.ts
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/hd.ts
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (JSDoc @example on exports)
  </read_first>
  <behavior>
    - Test 1: `field.asXpn()` on a PID-5 with `"Smith^Jane"` returns `{ familyName: "Smith", givenName: "Jane" }`.
    - Test 2: `field.asXad()` on a PID-11 with `"123 Main St^Apt 4^Boston^MA^02101"` returns the structured XAD.
    - Test 3: `field.asCx()` on a PID-3 returns the CX with nested assigningAuthority HD.
    - Test 4: `field.asCwe()` on an OBX-3 returns the CWE.
    - Test 5: `field.asCe()` on an OBX-3 also returns a valid CE (subset of CWE's 9 → CE's 6 components).
    - Test 6: `field.asXtn()` on a PID-13 returns the XTN.
    - Test 7: `field.asPl()` on a PV1-3 returns the PL with nested facility HD.
    - Test 8: `field.asTs()` on an MSH-7 returns `{ raw: "20250101", date: Date }`.
    - Test 9: `field.asNm()` on an OBX-5 with `"120"` returns `{ raw: "120", value: 120 }`.
    - Test 10: `field.asHd()` on an MSH-3 with `"APP^1.2.3^UUID"` returns the HD.
    - Test 11: `.asXpn()` on an empty Field (no repetitions) returns `{}` (empty XPN — no throw).
    - Test 12: `.asTs()` on an empty Field returns `{ raw: "", date: undefined }`.
    - Test 13: `.asNm()` on an empty Field returns `{ raw: "", value: undefined }`.
    - Test 14: Each coercion uses the FIRST repetition only (`this.repetitions[0]`). Tests verify by checking that repetition[1] data does NOT leak into the result.
    - Test 15: Coercions are NOT memoized — calling `.asXpn()` twice returns TWO DIFFERENT object identities (D-09 no memoization in v1). Verify via `!==`.
  </behavior>
  <action>
**Modify `src/model/field.ts`.** Add 10 coercion methods to the existing `Field` class (do NOT rewrite the class — only append methods).

Add imports at the top (after existing imports):
```typescript
import { parseXpn, type XPN } from "./types/xpn.js";
import { parseXad, type XAD } from "./types/xad.js";
import { parseCx, type CX } from "./types/cx.js";
import { parseCwe, type CWE } from "./types/cwe.js";
import { parseCe, type CE } from "./types/ce.js";
import { parseXtn, type XTN } from "./types/xtn.js";
import { parsePl, type PL } from "./types/pl.js";
import { parseTs, type TS } from "./types/ts.js";
import { parseNm, type NM } from "./types/nm.js";
import { parseHd, type HD } from "./types/hd.js";
import type { RawRepetition } from "../parser/types.js";
```

Add a module-level constant for the empty-repetition fallback (used when `repetitions[0]` is undefined — per PATTERNS.md §`src/model/field.ts` §Coercion-method pattern):
```typescript
/** @internal Synthetic empty repetition — feeds composite parsers for empty fields so they return `{}` / empty typed objects instead of throwing. */
const EMPTY_REP: RawRepetition = Object.freeze({
  components: Object.freeze([]) as readonly import("../parser/types.js").RawComponent[],
});
```

Append the 10 coercion methods to the Field class body (after `static empty`):

```typescript
  /**
   * Coerce this field's first repetition to a typed `XPN` (Extended Person
   * Name). Absent components are OMITTED from the result
   * (exactOptionalPropertyTypes). Not memoized in v1 — each call re-parses
   * (D-09).
   *
   * @example
   * ```ts
   * const pid5 = msg.segments("PID")[0]?.field(5);
   * const name = pid5?.asXpn();
   * console.log(name?.familyName, name?.givenName);
   * ```
   */
  public asXpn(): XPN {
    return parseXpn(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `XAD` (Extended Address).
   * @example
   * ```ts
   * const addr = msg.segments("PID")[0]?.field(11)?.asXad();
   * console.log(addr?.street, addr?.city, addr?.stateOrProvince);
   * ```
   */
  public asXad(): XAD {
    return parseXad(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `CX` (Extended Composite
   * ID). `.assigningAuthority` is a nested `HD`.
   * @example
   * ```ts
   * const mrn = msg.segments("PID")[0]?.field(3)?.asCx();
   * console.log(mrn?.idNumber, mrn?.assigningAuthority?.namespaceId);
   * ```
   */
  public asCx(): CX {
    return parseCx(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `CWE` (Coded With Exceptions).
   * @example
   * ```ts
   * const code = msg.segments("OBX")[0]?.field(3)?.asCwe();
   * console.log(code?.identifier, code?.text);
   * ```
   */
  public asCwe(): CWE {
    return parseCwe(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `CE` (Coded Element).
   * @example
   * ```ts
   * const code = msg.segments("OBX")[0]?.field(3)?.asCe();
   * ```
   */
  public asCe(): CE {
    return parseCe(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `XTN` (Extended Telecommunication Number).
   * @example
   * ```ts
   * const phone = msg.segments("PID")[0]?.field(13)?.asXtn();
   * console.log(phone?.telephoneNumber);
   * ```
   */
  public asXtn(): XTN {
    return parseXtn(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `PL` (Person Location).
   * `.facility` is a nested `HD`.
   * @example
   * ```ts
   * const loc = msg.segments("PV1")[0]?.field(3)?.asPl();
   * console.log(loc?.pointOfCare, loc?.room, loc?.facility?.namespaceId);
   * ```
   */
  public asPl(): PL {
    return parsePl(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `TS` (Time Stamp).
   * `{ raw, date }` — `date` is `undefined` on unparseable input (no throw).
   * @example
   * ```ts
   * const ts = msg.segments("MSH")[0]?.field(7)?.asTs();
   * console.log(ts?.raw, ts?.date?.toISOString());
   * ```
   */
  public asTs(): TS {
    return parseTs(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `NM` (Numeric).
   * `{ raw, value }` — `value` is `undefined` on non-numeric input.
   * @example
   * ```ts
   * const nm = msg.segments("OBX")[0]?.field(5)?.asNm();
   * console.log(nm?.value);
   * ```
   */
  public asNm(): NM {
    return parseNm(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }

  /**
   * Coerce this field's first repetition to a typed `HD` (Hierarchic Designator).
   * @example
   * ```ts
   * const sending = msg.segments("MSH")[0]?.field(3)?.asHd();
   * console.log(sending?.namespaceId);
   * ```
   */
  public asHd(): HD {
    return parseHd(this.repetitions[0] ?? EMPTY_REP, this.enc);
  }
```

**Test file `test/model-field-coercions.test.ts`** — integration tests via `parseHL7`:

```typescript
import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

// Comprehensive fixture exercising every composite type.
// - MSH-3: HD (APP^1.2.3^UUID)
// - MSH-7: TS (20250102153045)
// - PID-3: CX (123456^1^M11^AUTH&1.2.3&UUID^MR)
// - PID-5: XPN (Smith^Jane^Q^Jr.^Mrs.)
// - PID-11: XAD (123 Main St^Apt 4^Boston^MA^02101^USA)
// - PID-13: XTN ((555)555-1234^PRN^PH^jane@example.com)
// - PV1-3: PL (ICU^101^A^HOSP&1.2.3&UUID)
// - OBX-3: CWE/CE (GLU^Glucose^LN)
// - OBX-5: NM (120)
const FIXTURE =
  "MSH|^~\\&|APP^1.2.3^UUID|FAC|APP2|FAC2|20250102153045||ADT^A01|1|P|2.5\r" +
  "PID|||123456^1^M11^AUTH&1.2.3&UUID^MR||Smith^Jane^Q^Jr.^Mrs.||19800115|F||||123 Main St^Apt 4^Boston^MA^02101^USA||(555)555-1234^PRN^PH^jane@example.com\r" +
  "PV1|1|I|ICU^101^A^HOSP&1.2.3&UUID\r" +
  "OBX|1|NM|GLU^Glucose^LN|1|120|mg/dL|80-110||||F";

describe("model/field: .asXxx() composite coercions", () => {
  it(".asHd on MSH-3", () => {
    const msg = parseHL7(FIXTURE);
    const hd = msg.segments("MSH")[0]?.field(3).asHd();
    expect(hd).toStrictEqual({ namespaceId: "APP", universalId: "1.2.3", universalIdType: "UUID" });
  });

  it(".asTs on MSH-7", () => {
    const msg = parseHL7(FIXTURE);
    const ts = msg.segments("MSH")[0]?.field(7).asTs();
    expect(ts?.raw).toBe("20250102153045");
    expect(ts?.date?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it(".asCx on PID-3 with nested HD", () => {
    const msg = parseHL7(FIXTURE);
    const cx = msg.segments("PID")[0]?.field(3).asCx();
    expect(cx?.idNumber).toBe("123456");
    expect(cx?.assigningAuthority).toStrictEqual({
      namespaceId: "AUTH", universalId: "1.2.3", universalIdType: "UUID",
    });
    expect(cx?.identifierTypeCode).toBe("MR");
  });

  it(".asXpn on PID-5", () => {
    const msg = parseHL7(FIXTURE);
    const xpn = msg.segments("PID")[0]?.field(5).asXpn();
    expect(xpn?.familyName).toBe("Smith");
    expect(xpn?.givenName).toBe("Jane");
    expect(xpn?.secondName).toBe("Q");
    expect(xpn?.suffix).toBe("Jr.");
    expect(xpn?.prefix).toBe("Mrs.");
  });

  it(".asXad on PID-11", () => {
    const msg = parseHL7(FIXTURE);
    const xad = msg.segments("PID")[0]?.field(11).asXad();
    expect(xad?.street).toBe("123 Main St");
    expect(xad?.city).toBe("Boston");
    expect(xad?.zipOrPostalCode).toBe("02101");
  });

  it(".asXtn on PID-13", () => {
    const msg = parseHL7(FIXTURE);
    const xtn = msg.segments("PID")[0]?.field(13).asXtn();
    expect(xtn?.telephoneNumber).toBe("(555)555-1234");
    expect(xtn?.telecommunicationUseCode).toBe("PRN");
    expect(xtn?.emailAddress).toBe("jane@example.com");
  });

  it(".asPl on PV1-3 with nested facility HD", () => {
    const msg = parseHL7(FIXTURE);
    const pl = msg.segments("PV1")[0]?.field(3).asPl();
    expect(pl?.pointOfCare).toBe("ICU");
    expect(pl?.room).toBe("101");
    expect(pl?.facility).toStrictEqual({
      namespaceId: "HOSP", universalId: "1.2.3", universalIdType: "UUID",
    });
  });

  it(".asCwe on OBX-3", () => {
    const msg = parseHL7(FIXTURE);
    const cwe = msg.segments("OBX")[0]?.field(3).asCwe();
    expect(cwe?.identifier).toBe("GLU");
    expect(cwe?.text).toBe("Glucose");
    expect(cwe?.nameOfCodingSystem).toBe("LN");
  });

  it(".asCe on OBX-3", () => {
    const msg = parseHL7(FIXTURE);
    const ce = msg.segments("OBX")[0]?.field(3).asCe();
    expect(ce?.identifier).toBe("GLU");
    expect(ce?.text).toBe("Glucose");
  });

  it(".asNm on OBX-5", () => {
    const msg = parseHL7(FIXTURE);
    const nm = msg.segments("OBX")[0]?.field(5).asNm();
    expect(nm?.raw).toBe("120");
    expect(nm?.value).toBe(120);
  });

  it("coercions on empty fields return empty typed objects (no throw)", () => {
    const msg = parseHL7("MSH|^~\\&|A|F|A|F|20250101||ADT^A01|1|P|2.5\rPID");
    const pid = msg.segments("PID")[0];
    if (pid === undefined) throw new Error("PID missing");
    expect(pid.field(5).asXpn()).toStrictEqual({});
    expect(pid.field(5).asTs()).toStrictEqual({ raw: "", date: undefined });
    expect(pid.field(5).asNm()).toStrictEqual({ raw: "", value: undefined });
  });

  it("coercions are NOT memoized (D-09): two calls → two distinct objects", () => {
    const msg = parseHL7(FIXTURE);
    const pid5 = msg.segments("PID")[0]?.field(5);
    if (pid5 === undefined) throw new Error("PID-5 missing");
    const a = pid5.asXpn();
    const b = pid5.asXpn();
    expect(a).toStrictEqual(b);   // equal content
    expect(a).not.toBe(b);        // distinct identity
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/field.ts test/model-field-coercions.test.ts --max-warnings=0 && pnpm test -- --run model-field-coercions</automated>
  </verify>
  <acceptance_criteria>
    - Field class has 10 coercion methods: `grep -cE "public (asXpn|asXad|asCx|asCwe|asCe|asXtn|asPl|asTs|asNm|asHd)\\(\\):" src/model/field.ts` returns 10.
    - Each method delegates to its composite parser: `grep -cE "parseXpn\\(|parseXad\\(|parseCx\\(|parseCwe\\(|parseCe\\(|parseXtn\\(|parsePl\\(|parseTs\\(|parseNm\\(|parseHd\\(" src/model/field.ts` returns 10.
    - Empty-repetition fallback declared: `grep -cE "EMPTY_REP" src/model/field.ts` returns >= 11 (declaration + 10 method uses).
    - Each method uses `this.repetitions[0] ?? EMPTY_REP`: `grep -cE "this\\.repetitions\\[0\\] \\?\\? EMPTY_REP" src/model/field.ts` returns 10.
    - Each method has `@example`: `grep -c "@example" src/model/field.ts` returns >= 13 (class + value + empty + 10 coercions).
    - No `any`, no `console.*`: `grep -cE "(: any(\\s|,|\\))|console\\.)" src/model/field.ts` returns 0.
    - Test file has >= 12 `it(` blocks covering all 10 composites + empty + non-memoization.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run model-field-coercions` all exit 0.
  </acceptance_criteria>
  <done>Field ships 10 `.asXxx()` coercion methods (TYPES-02 closed). All 10 composites wired; 12-15 integration tests pass; empty-field fallback honored; non-memoization confirmed. Zero lint/typecheck warnings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add setField, addSegment, removeSegment mutation methods to Hl7Message with cache invalidation</name>
  <files>src/model/message.ts, test/model-mutation.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-15 in-place chainable; D-16 warnings frozen segments mutable; D-17 cache invalidation; D-18 setField minimal validation; D-19 addSegment name regex; §Claude's Discretion throw-on-missing-segment; §Claude's Discretion removeSegment by name+occurrence)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/message.ts` MODIFIED — mutation method shapes; cache-invalidation shape; Z-segment name validation)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/message.ts (current class from Plan 01 Task 3)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/dot-path.ts (parsePath signature — setField calls it)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (RawSegment, RawField — addSegment constructs these)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/delimiters.ts (DEFAULT_ENCODING_CHARACTERS — not needed since we use this.encodingCharacters)
  </read_first>
  <behavior>
    setField:
    - Test 1: `msg.setField("PID.8", "F")` returns `msg` (chainable, D-15). `msg.get("PID.8")` subsequently returns `"F"`.
    - Test 2: `msg.setField("PID.8", "F")` mutates `rawSegments[pid-idx].fields[8]` in place — `msg.get("PID.8")` BEFORE returns the original value; AFTER returns `"F"`.
    - Test 3: `msg.setField("PID.5.1", "Jones")` updates component 1 of PID-5 first rep (subcomponent 1). `msg.get("PID.5.1")` subsequently returns `"Jones"`.
    - Test 4: `msg.setField("PID.5.1.2", "sub-val")` — setting a subcomponent creates/updates `subcomponents[1]`. Verify next `msg.get("PID.5.1.2")` returns `"sub-val"`.
    - Test 5: `msg.setField("PID.3[1].1", "ALT-ID")` — sets component 1 of PID-3 second repetition. May require CREATING repetition[1] if it didn't exist. **Implementation decision: auto-create missing repetitions/components/subcomponents WITHIN an existing field**, but NOT create missing segments (per Claude's Discretion recommendation). Document this.
    - Test 6: `msg.setField("NOT.5", "x")` throws `TypeError` with message mentioning `"NOT"` and `"not found"` (no auto-creation of segments).
    - Test 7: `msg.setField("pid.5", "x")` throws `TypeError` on malformed path (bubbled up from `parsePath`).
    - Test 8: `msg.setField("PID.8", "F")` invalidates the PID segment-type cache — `msg.segments("PID")` returns a fresh array reference on the next call. (Per D-17 + Plan 01 simplification: drop both `_segmentsByType` and `_allSegments` wholesale on any mutation.)
    - Test 9: `msg.setField("PID.8", "M")` does NOT emit any warning; `msg.warnings` reference identity unchanged AND `Object.isFrozen(msg.warnings)` still true.

    addSegment:
    - Test 10: `msg.addSegment("NTE", ["", "note text"])` returns `msg` (chainable). `msg.segments("NTE")` returns 1-element array. `msg.get("NTE.2")` returns `"note text"`.
    - Test 11: `msg.addSegment("ZPI", ["", "custom"])` accepts Z-segments per D-19 regex `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u`.
    - Test 12: `msg.addSegment("lowercase", [])` throws `TypeError` with actionable message.
    - Test 13: `msg.addSegment("AB", [])` throws (2 chars — too short).
    - Test 14: `msg.addSegment("ABCD", [])` throws (4 chars — too long).
    - Test 15: `msg.addSegment("Z1A", [])` accepts (Z-segment with digit allowed — matches `Z[A-Z0-9]{2}`).
    - Test 16: `msg.addSegment("NTE", [])` adds an empty segment (zero fields past the name placeholder). `msg.segments("NTE")[0]?.raw.fields.length` is 1 (just the name slot at index 0, per 1-indexed convention).
    - Test 17: `addSegment` appends at the end of `rawSegments` (document order preserved). Verify: `msg.allSegments()` last element is the newly-added segment.
    - Test 18: `addSegment` invalidates caches — subsequent `msg.segments("NTE")` + `msg.allSegments()` both reflect the new segment.

    removeSegment:
    - Test 19: `msg.removeSegment("NTE")` removes the FIRST NTE (default occurrence 0); returns `msg`. `msg.segments("NTE")` returns `[]` if only one existed.
    - Test 20: `msg.removeSegment("OBX", 1)` removes the SECOND OBX; `msg.segments("OBX")` returns 2-element array with indices 0 and 2 (document-order preserved).
    - Test 21: `msg.removeSegment("OBX", { all: true })` removes all OBX segments.
    - Test 22: `msg.removeSegment("MSH")` throws `TypeError` (never remove MSH).
    - Test 23: `msg.removeSegment("NOT")` is a no-op (no exception; returns `msg`).
    - Test 24: `msg.removeSegment("lowercase")` throws TypeError (name validation per D-19 symmetry).
    - Test 25: `removeSegment` invalidates caches wholesale.

    Chainability:
    - Test 26: `msg.setField("PID.8", "F").addSegment("NTE", ["", "note"]).removeSegment("EVN")` — all three chain; each returns `msg`.

    Immutability:
    - Test 27: `msg.warnings` reference identity preserved; still `Object.isFrozen` true after every mutation (D-16).
  </behavior>
  <action>
**Modify `src/model/message.ts`.** Add the 3 mutation methods. DO NOT reshape the constructor. Import `parsePath` from `./dot-path.js` (already imported per Plan 01, but verify).

Add type imports for mutation parameters:
```typescript
import type { RawField, RawRepetition, RawComponent } from "../parser/types.js";
```

**Mutation helper — invalidate caches** (per D-17):
```typescript
/** @internal — drop both caches wholesale on any mutation. D-17 invalidation policy. */
private invalidateCaches(): void {
  this._segmentsByType = undefined;
  this._allSegments = undefined;
}
```

**Segment-name regex** (D-19 — enforced symmetrically across addSegment and removeSegment):
```typescript
/** @internal — HL7 segment name shape: 3 uppercase ASCII letters OR `Z[A-Z0-9]{2}`. */
const SEGMENT_NAME_RE = /^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u;
```

**setField method:**
```typescript
/**
 * Set the string value at a dot-path. Mutates the underlying tree in-place
 * and returns `this` for chaining (D-15). Throws `TypeError` on malformed
 * path syntax or when the target segment type is not present in the message
 * (per recommendation — does NOT auto-create segments; caller must
 * `addSegment` first).
 *
 * The value is accepted verbatim — unescaped delimiter characters are NOT
 * rejected on input (D-18). Re-escaping on serialize is handled by Phase 5's
 * `toString()`.
 *
 * Segment-type cache and all-segments cache are invalidated on success (D-17).
 *
 * @example
 * ```ts
 * msg.setField("PID.8", "F");         // patient sex → F
 * msg.setField("PID.5.1", "Jones");   // family name
 * msg.setField("PID.3[1].1", "MRN2"); // second rep of PID-3
 * ```
 */
public setField(path: string, value: string): this {
  // D-18: parsePath throws TypeError on malformed path.
  const parsed = parsePath(path);

  // Find the target segment by type + occurrence — per Plan 01's findSegment helper.
  // Inline because this is a mutation path and we need the mutable ref.
  let seen = 0;
  let segIdx = -1;
  for (let i = 0; i < this.rawSegments.length; i++) {
    const s = this.rawSegments[i];
    if (s === undefined) continue;
    if (s.name === parsed.segmentType) {
      if (seen === parsed.segmentIndex) {
        segIdx = i;
        break;
      }
      seen++;
    }
  }
  if (segIdx === -1) {
    throw new TypeError(
      `setField: segment "${parsed.segmentType}" (occurrence ${String(parsed.segmentIndex)}) not found. Add it first with addSegment("${parsed.segmentType}", [...]).`,
    );
  }

  // D-16: rawSegments tree is mutable. We cast away readonly locally.
  // CRITICAL: `readonly T[]` → `T[]` via a variable reassignment + helper;
  // NEVER use `as T[]` on an existing readonly array literal because ESLint
  // `consistent-type-assertions` would flag it. Use a tiny internal helper
  // `toMutable` so intent is explicit.
  const mutSegments = toMutableArray(this.rawSegments) as RawSegment[];
  const seg = mutSegments[segIdx];
  if (seg === undefined) throw new Error("internal: segment went missing after lookup"); // should never trigger

  const mutFields = toMutableArray(seg.fields) as RawField[];

  // Walk + auto-create missing repetition/component/subcomponent inside the existing field.
  // Ensure fields[fieldIndex] exists.
  while (mutFields.length <= parsed.fieldIndex) {
    mutFields.push({ repetitions: [], isNull: false });
  }
  const targetFieldIdx = parsed.fieldIndex;
  const field = mutFields[targetFieldIdx];
  if (field === undefined) throw new Error("internal: field went missing");

  const mutReps = toMutableArray(field.repetitions) as RawRepetition[];
  const repIdx = parsed.repetitionIndex ?? 0;
  while (mutReps.length <= repIdx) {
    mutReps.push({ components: [] });
  }
  const rep = mutReps[repIdx];
  if (rep === undefined) throw new Error("internal: rep went missing");

  const mutComps = toMutableArray(rep.components) as RawComponent[];
  const compIdx = (parsed.componentIndex ?? 1) - 1;
  while (mutComps.length <= compIdx) {
    mutComps.push({ subcomponents: [] });
  }
  const comp = mutComps[compIdx];
  if (comp === undefined) throw new Error("internal: comp went missing");

  const mutSubs = toMutableArray(comp.subcomponents) as string[];
  const subIdx = (parsed.subcomponentIndex ?? 1) - 1;
  while (mutSubs.length <= subIdx) {
    mutSubs.push("");
  }
  mutSubs[subIdx] = value;

  // Reassemble the tree — rebuild structurally-immutable objects with the new arrays.
  const newComp: RawComponent = { subcomponents: mutSubs };
  mutComps[compIdx] = newComp;
  const newRep: RawRepetition = { components: mutComps };
  mutReps[repIdx] = newRep;
  const newField: RawField = { repetitions: mutReps, isNull: field.isNull };
  mutFields[targetFieldIdx] = newField;
  const newSeg: RawSegment = { name: seg.name, fields: mutFields };
  mutSegments[segIdx] = newSeg;

  // Replace the rawSegments reference. Because Phase 2 typed it as `readonly RawSegment[]`,
  // and we want to keep the TYPE story honest, we reassign via a helper that re-casts
  // the reference back to readonly.
  (this as { -readonly [K in keyof this]: this[K] }).rawSegments = mutSegments;

  this.invalidateCaches();
  return this;
}
```

**Helper `toMutableArray`** (file-scoped, `@internal`):
```typescript
/** @internal — shallow-copy a readonly array to a mutable one, preserving element readonly-ness at the type level. */
function toMutableArray<T>(arr: readonly T[]): T[] {
  return arr.slice();
}
```

**CRITICAL on mutation semantics.** The simplest and cleanest implementation is "rebuild the path from leaf to root", which keeps the RawSegment/RawField/RawRepetition/RawComponent types structurally immutable (they stay as `readonly` shapes) but the `rawSegments` reference on `Hl7Message` is reassigned. This is D-16 "segments tree mutable" — interpreting "mutable" as "the reference changes, not that individual objects get mutated in place". This is also safer because outstanding references to the old tree (held by Segment wrappers from the pre-mutation cache) remain pointing at the old data — and those wrappers are ALSO invalidated via `invalidateCaches()`.

**Alternative:** mutate in-place by casting away readonly on the target array and doing `arr[i] = value`. Slightly faster but makes the Hl7Message's declared type lie about mutability. **Choose the rebuild approach** — it's clearer, safer, and the perf cost of rebuilding a spine is O(depth × width-at-each-level) which for HL7 is at most O(segments + fields + reps + comps + subs) ≈ O(50 + 50 + 5 + 15 + 5) ≈ O(125) object allocations per setField. Negligible.

The line `(this as { -readonly [K in keyof this]: this[K] }).rawSegments = mutSegments;` is the one readonly bypass needed. Document with a comment: "One readonly bypass — reassign the rawSegments reference. Consumers are warned by D-16 that the tree is mutable via the mutation API."

**addSegment method:**
```typescript
/**
 * Append a new segment to the end of the message. `name` must match
 * `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` — throws `TypeError` otherwise (D-19).
 * `fields` accepts a mix of plain strings (treated as single-subcomponent
 * single-component single-repetition fields) and full `RawField` objects.
 *
 * The input array is interpreted as HL7 1-indexed — `fields[0]` is the
 * segment name / separator placeholder and will be SYNTHESIZED by this
 * method. So callers pass fields STARTING from what would be `fields[1]`:
 *
 * ```ts
 * msg.addSegment("NTE", ["", "note text"]);
 * // Produces: RawSegment { name: "NTE", fields: [placeholder, field1, field2] }
 * // where placeholder is { repetitions: [], isNull: false } and field2 contains "note text".
 * ```
 *
 * Wait — re-reading the spec: `fields: readonly (string | RawField)[]`
 * is documented by CONTEXT.md D-19 as user-friendly. HL7 convention says
 * fields[0] is the name slot, so `addSegment("NTE", ["", "note text"])`
 * means "NTE-1 is empty string, NTE-2 is 'note text'". This matches user
 * mental model where `addSegment("NTE", [a, b, c])` produces `NTE|a|b|c`.
 *
 * So the actual layout is: our RawSegment.fields is 1-indexed (name slot at
 * fields[0]), so the user's `fields[0]` ("") becomes `rawSegment.fields[1]`
 * (NTE-1), and their `fields[1]` becomes rawSegment.fields[2] (NTE-2).
 *
 * Invalidates caches on return.
 *
 * @example
 * ```ts
 * msg.addSegment("NTE", ["", "note"]);
 * msg.get("NTE.2"); // "note"
 * ```
 */
public addSegment(name: string, fields: readonly (string | RawField)[]): this {
  if (!SEGMENT_NAME_RE.test(name)) {
    throw new TypeError(
      `addSegment: invalid segment name "${name}". Expected 3 uppercase ASCII letters (e.g. "PID") or Z-segment shape Z[A-Z0-9]{2} (e.g. "ZPI").`,
    );
  }

  // Build the raw fields: index 0 is the name placeholder; indices 1..N
  // are the user-supplied fields.
  const rawFields: RawField[] = [{ repetitions: [], isNull: false }];  // fields[0] name slot
  for (const f of fields) {
    if (typeof f === "string") {
      if (f === "") {
        rawFields.push({ repetitions: [], isNull: false });
      } else {
        rawFields.push({
          repetitions: [{ components: [{ subcomponents: [f] }] }],
          isNull: false,
        });
      }
    } else {
      rawFields.push(f);
    }
  }

  const newSegment: RawSegment = { name, fields: rawFields };

  // Append to rawSegments via rebuild.
  const mut = toMutableArray(this.rawSegments) as RawSegment[];
  mut.push(newSegment);
  (this as { -readonly [K in keyof this]: this[K] }).rawSegments = mut;

  this.invalidateCaches();
  return this;
}
```

**removeSegment method:**
```typescript
/**
 * Remove segments by type + occurrence or by type + all.
 *
 * Call shapes:
 * - `removeSegment("NTE")` — remove the FIRST NTE (occurrence 0).
 * - `removeSegment("OBX", 1)` — remove the SECOND OBX (occurrence 1, 0-indexed per D-01).
 * - `removeSegment("OBX", { all: true })` — remove ALL OBX segments.
 *
 * MSH is protected — `removeSegment("MSH")` throws `TypeError`.
 * Unknown segment types are a no-op (no throw) — callers can idempotently
 * call `removeSegment(X)` without checking first.
 *
 * Invalidates caches on return.
 *
 * @example
 * ```ts
 * msg.removeSegment("NTE");                // remove first NTE
 * msg.removeSegment("OBX", 1);             // remove second OBX
 * msg.removeSegment("OBX", { all: true }); // remove all remaining OBX
 * ```
 */
public removeSegment(
  segmentType: string,
  occurrenceOrOptions?: number | { readonly all?: boolean },
): this {
  if (!SEGMENT_NAME_RE.test(segmentType)) {
    throw new TypeError(
      `removeSegment: invalid segment name "${segmentType}". Expected 3 uppercase ASCII letters or Z[A-Z0-9]{2}.`,
    );
  }
  if (segmentType === "MSH") {
    throw new TypeError(`removeSegment: refusing to remove MSH (every HL7 message must have exactly one MSH segment).`);
  }

  const all = typeof occurrenceOrOptions === "object" && occurrenceOrOptions?.all === true;
  const targetOccurrence = typeof occurrenceOrOptions === "number" ? occurrenceOrOptions : 0;

  const mut = toMutableArray(this.rawSegments) as RawSegment[];
  if (all) {
    const filtered = mut.filter((s) => s.name !== segmentType);
    (this as { -readonly [K in keyof this]: this[K] }).rawSegments = filtered;
  } else {
    let seen = 0;
    let removeAt = -1;
    for (let i = 0; i < mut.length; i++) {
      const s = mut[i];
      if (s === undefined) continue;
      if (s.name === segmentType) {
        if (seen === targetOccurrence) {
          removeAt = i;
          break;
        }
        seen++;
      }
    }
    if (removeAt !== -1) {
      mut.splice(removeAt, 1);
      (this as { -readonly [K in keyof this]: this[K] }).rawSegments = mut;
    }
    // else: no matching segment — no-op (idempotent).
  }

  this.invalidateCaches();
  return this;
}
```

**Test file `test/model-mutation.test.ts`** — covers all 27 behaviors:

```typescript
import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\r" +
  "EVN|A01|20250101\r" +
  "PID|||123|ALT~ALT2||Smith^Jane||19800115|F\r" +
  "OBX|1|TX|GLUC|1|120\r" +
  "OBX|2|TX|HGB|2|14.0";

describe("model/message: setField", () => {
  it("is chainable", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.setField("PID.8", "M")).toBe(msg);
  });

  it("mutates a field and visible on next read", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.get("PID.8")).toBe("F");
    msg.setField("PID.8", "M");
    expect(msg.get("PID.8")).toBe("M");
  });

  it("mutates a component at PID.5.1", () => {
    const msg = parseHL7(FIXTURE);
    msg.setField("PID.5.1", "Jones");
    expect(msg.get("PID.5.1")).toBe("Jones");
  });

  it("creates missing repetitions within an existing field", () => {
    const msg = parseHL7(FIXTURE);
    msg.setField("PID.4[2].1", "ALT3");
    expect(msg.get("PID.4[2].1")).toBe("ALT3");
  });

  it("throws TypeError on missing segment (no auto-create)", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.setField("NOT.5", "x")).toThrow(TypeError);
  });

  it("bubbles parsePath TypeErrors on malformed paths", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.setField("pid.5", "x")).toThrow(TypeError);
  });

  it("invalidates the segment-type cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.segments("PID");
    msg.setField("PID.8", "M");
    const after = msg.segments("PID");
    expect(after).not.toBe(before);
    // But content-wise, the new cache reflects the mutation:
    expect(after[0]?.field(8).value).toBe("M");
  });

  it("does not touch warnings (still frozen, same reference)", () => {
    const msg = parseHL7(FIXTURE);
    const warningsRef = msg.warnings;
    msg.setField("PID.8", "M");
    expect(msg.warnings).toBe(warningsRef);
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });
});

describe("model/message: addSegment", () => {
  it("is chainable and appends a segment", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.addSegment("NTE", ["", "note"])).toBe(msg);
    expect(msg.segments("NTE")).toHaveLength(1);
    expect(msg.get("NTE.2")).toBe("note");
  });

  it("accepts Z-segment names (D-19)", () => {
    const msg = parseHL7(FIXTURE);
    msg.addSegment("ZPI", ["", "custom"]);
    expect(msg.segments("ZPI")).toHaveLength(1);
  });

  it("accepts Z1A (Z + digit + letter)", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.addSegment("Z1A", [])).not.toThrow();
  });

  it.each(["lowercase", "AB", "ABCD", "123", ""])("rejects invalid segment name %s", (bad) => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.addSegment(bad, [])).toThrow(TypeError);
  });

  it("appends at the end (preserves document order)", () => {
    const msg = parseHL7(FIXTURE);
    msg.addSegment("NTE", ["", "note"]);
    const all = msg.allSegments();
    expect(all[all.length - 1]?.type).toBe("NTE");
  });

  it("allows an empty segment (only the name placeholder)", () => {
    const msg = parseHL7(FIXTURE);
    msg.addSegment("NTE", []);
    expect(msg.segments("NTE")[0]?.raw.fields).toHaveLength(1); // only fields[0] name slot
  });
});

describe("model/message: removeSegment", () => {
  it("removes the first occurrence by default", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.segments("OBX")).toHaveLength(2);
    msg.removeSegment("OBX");
    expect(msg.segments("OBX")).toHaveLength(1);
    // The remaining OBX is what was #2 before.
    expect(msg.segments("OBX")[0]?.field(3).value).toBe("HGB");
  });

  it("removes by 0-indexed occurrence", () => {
    const msg = parseHL7(FIXTURE);
    msg.removeSegment("OBX", 1);
    expect(msg.segments("OBX")).toHaveLength(1);
    // First OBX (GLUC) remains.
    expect(msg.segments("OBX")[0]?.field(3).value).toBe("GLUC");
  });

  it("removes all with { all: true }", () => {
    const msg = parseHL7(FIXTURE);
    msg.removeSegment("OBX", { all: true });
    expect(msg.segments("OBX")).toHaveLength(0);
  });

  it("refuses to remove MSH", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.removeSegment("MSH")).toThrow(TypeError);
  });

  it("is a no-op for unknown segment types", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.allSegments().length;
    expect(() => msg.removeSegment("NOT")).not.toThrow();
    expect(msg.allSegments()).toHaveLength(before);
  });

  it("rejects invalid segment name shape", () => {
    const msg = parseHL7(FIXTURE);
    expect(() => msg.removeSegment("lowercase")).toThrow(TypeError);
  });

  it("invalidates caches", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.segments("OBX");
    msg.removeSegment("OBX");
    expect(msg.segments("OBX")).not.toBe(before);
  });
});

describe("model/message: chainability", () => {
  it("chains setField → addSegment → removeSegment", () => {
    const msg = parseHL7(FIXTURE);
    const result = msg
      .setField("PID.8", "M")
      .addSegment("NTE", ["", "chained note"])
      .removeSegment("EVN");
    expect(result).toBe(msg);
    expect(msg.get("PID.8")).toBe("M");
    expect(msg.get("NTE.2")).toBe("chained note");
    expect(msg.segments("EVN")).toHaveLength(0);
  });

  it("warnings frozen after all mutations (D-16)", () => {
    const msg = parseHL7(FIXTURE);
    const warningsRef = msg.warnings;
    msg.setField("PID.8", "M").addSegment("NTE", [""]).removeSegment("EVN");
    expect(msg.warnings).toBe(warningsRef);
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/message.ts test/model-mutation.test.ts --max-warnings=0 && pnpm test -- --run model-mutation</automated>
  </verify>
  <acceptance_criteria>
    - `Hl7Message` has 3 new mutation methods: `grep -cE "public (setField|addSegment|removeSegment)\\(" src/model/message.ts` returns 3.
    - `SEGMENT_NAME_RE` regex matches D-19 shape: `grep -cE "\\[A-Z\\]\\{3\\}|Z\\[A-Z0-9\\]\\{2\\}" src/model/message.ts` returns >= 1.
    - `invalidateCaches` called in each mutation method: `grep -c "invalidateCaches" src/model/message.ts` returns >= 4 (declaration + 3 calls).
    - `setField` calls `parsePath`: `grep -c "parsePath(" src/model/message.ts` returns 1.
    - `removeSegment` protects MSH: `grep -c "\"MSH\"" src/model/message.ts` returns >= 1 (in removeSegment body).
    - No `any`, no `console.*`: `grep -cE "(: any(\\s|,|\\))|console\\.)" src/model/message.ts` returns 0.
    - All three methods return `this`: `grep -cE "return this;" src/model/message.ts` returns >= 3.
    - `@example` on every new method: at least 3 new `@example` blocks in the mutation section.
    - Test file exists with >= 25 `it(` blocks.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run model-mutation` all exit 0.
    - Full suite still green: `pnpm test` exits 0 with all Phase 1, Phase 2, Plans 01/02/03 tests passing.
  </acceptance_criteria>
  <done>`Hl7Message` ships `setField`/`addSegment`/`removeSegment` with D-15 chainability, D-16 frozen warnings, D-17 cache invalidation, D-18/D-19 validation. MODEL-06 (immutability by convention) + MODEL-07 (explicit mutation) closed. 26 mutation tests pass; zero regressions.</done>
</task>

<task type="auto">
  <name>Task 3: Create HL7 namespace barrel and finalize src/index.ts public exports</name>
  <files>src/model/types/index.ts, src/model/types/namespace.ts, src/index.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-13 named exports AND HL7 namespace re-export)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/types/index.ts` — HL7 namespace pattern; §`src/index.ts` MODIFIED — barrel ordering)
    - /home/nschatz/projects/cosyte/hl7-parser/src/index.ts (current barrel — preserve existing ordering)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/xpn.ts through hd.ts (all 10 composite files ready from Plans 02 + 03)
  </read_first>
  <behavior>
    - Test 1: `import { HL7 } from "@cosyte/hl7-parser"; type A = HL7.XPN;` typechecks.
    - Test 2: `import type { XPN } from "@cosyte/hl7-parser";` typechecks (named export form).
    - Test 3: `import { parseXpn } from "@cosyte/hl7-parser";` typechecks (parser is also exported).
    - Test 4: `dist/index.d.ts` (after `pnpm build`) contains all 10 composite types.
    - Test 5: `src/index.ts` still exports the Phase 1/2 surface (VERSION, parseHL7, Hl7Message, FATAL_CODES, etc.) — no regressions.
  </behavior>
  <action>
**Create `src/model/types/namespace.ts`** — the HL7 namespace body. This file ONLY re-exports the 10 composite interfaces (NOT the parsers — namespace is type-only per D-13):

```typescript
/**
 * HL7 namespace — type-only re-exports of the 10 composite interfaces
 * (XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD). Consumed via
 * `export * as HL7 from "./model/types/namespace.js";` in the top-level
 * barrel (`src/index.ts`). Named exports of the same types live in the
 * public barrel alongside this namespace for developers who prefer direct
 * `import type { XPN } ...` style (D-13).
 *
 * The namespace is TYPES-ONLY — parsers (parseXpn, parseXad, ...) are
 * exported as value exports from the main barrel, not under HL7.
 */

export type { XPN } from "./xpn.js";
export type { XAD } from "./xad.js";
export type { CX } from "./cx.js";
export type { CWE } from "./cwe.js";
export type { CE } from "./ce.js";
export type { XTN } from "./xtn.js";
export type { PL } from "./pl.js";
export type { TS } from "./ts.js";
export type { NM } from "./nm.js";
export type { HD } from "./hd.js";
```

**Create `src/model/types/index.ts`** — barrel that re-exports BOTH types and parsers as named exports for internal / explicit consumption:

```typescript
/**
 * Internal barrel for composite types. Re-exports all 10 composite
 * interfaces and their parser functions. Consumed by `src/index.ts` and
 * `src/model/field.ts` to keep import paths consistent.
 */

export type { XPN } from "./xpn.js";
export { parseXpn } from "./xpn.js";
export type { XAD } from "./xad.js";
export { parseXad } from "./xad.js";
export type { CX } from "./cx.js";
export { parseCx } from "./cx.js";
export type { CWE } from "./cwe.js";
export { parseCwe } from "./cwe.js";
export type { CE } from "./ce.js";
export { parseCe } from "./ce.js";
export type { XTN } from "./xtn.js";
export { parseXtn } from "./xtn.js";
export type { PL } from "./pl.js";
export { parsePl } from "./pl.js";
export type { TS } from "./ts.js";
export { parseTs } from "./ts.js";
export type { NM } from "./nm.js";
export { parseNm } from "./nm.js";
export type { HD } from "./hd.js";
export { parseHd } from "./hd.js";
```

**Modify `src/index.ts`.** Preserve all existing Phase 1/2/Plan-01 exports. Append Phase 3 composite surface.

Final `src/index.ts` structure:
```typescript
// ... existing file-level JSDoc (keep as-is; prose first line, no leading @) ...

// ... existing VERSION const (keep as-is) ...

// --- Phase 2 public surface (keep as-is) ---
export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
export { FATAL_CODES, Hl7ParseError, ProfileDefinitionError } from "./parser/errors.js";
export type { FatalCode } from "./parser/errors.js";
export {
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
} from "./parser/warnings.js";
export type { WarningCode, Hl7ParseWarning } from "./parser/warnings.js";
export { DEFAULT_ENCODING_CHARACTERS } from "./parser/delimiters.js";
export type {
  Hl7Position,
  ParseOptions,
  OnWarningCallback,
  Profile,
  EncodingCharacters,
  RawSegment,
  RawField,
  RawRepetition,
  RawComponent,
} from "./parser/types.js";
export { BUILTIN_DATE_FALLBACKS, parseHl7Timestamp } from "./parser/dates.js";
export type { ParseHl7TimestampOptions } from "./parser/dates.js";
export { unescape, reescape } from "./parser/escapes.js";

// --- Phase 3 read path (Plan 01) ---
export { Segment } from "./model/segment.js";
export { Field } from "./model/field.js";
export { parsePath, resolvePath } from "./model/dot-path.js";
export type { DotPath } from "./model/dot-path.js";

// --- Phase 3 typed composites — named exports ---
export type { XPN } from "./model/types/xpn.js";
export { parseXpn } from "./model/types/xpn.js";
export type { XAD } from "./model/types/xad.js";
export { parseXad } from "./model/types/xad.js";
export type { CX } from "./model/types/cx.js";
export { parseCx } from "./model/types/cx.js";
export type { CWE } from "./model/types/cwe.js";
export { parseCwe } from "./model/types/cwe.js";
export type { CE } from "./model/types/ce.js";
export { parseCe } from "./model/types/ce.js";
export type { XTN } from "./model/types/xtn.js";
export { parseXtn } from "./model/types/xtn.js";
export type { PL } from "./model/types/pl.js";
export { parsePl } from "./model/types/pl.js";
export type { TS } from "./model/types/ts.js";
export { parseTs } from "./model/types/ts.js";
export type { NM } from "./model/types/nm.js";
export { parseNm } from "./model/types/nm.js";
export type { HD } from "./model/types/hd.js";
export { parseHd } from "./model/types/hd.js";

// --- Phase 3 HL7 namespace re-export (D-13) ---
export * as HL7 from "./model/types/namespace.js";
```

**Smoke-test via a quick TypeScript snippet** — add to `test/model-public-exports.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// Value imports
import {
  parseHL7, Hl7Message, Segment, Field,
  parsePath, resolvePath,
  parseXpn, parseXad, parseCx, parseCwe, parseCe,
  parseXtn, parsePl, parseTs, parseNm, parseHd,
  HL7,
} from "../src/index.js";

// Type-only imports (named)
import type {
  XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD,
  DotPath,
} from "../src/index.js";

describe("public exports: Phase 3 surface", () => {
  it("re-exports 10 composite parsers as values", () => {
    expect(typeof parseXpn).toBe("function");
    expect(typeof parseXad).toBe("function");
    expect(typeof parseCx).toBe("function");
    expect(typeof parseCwe).toBe("function");
    expect(typeof parseCe).toBe("function");
    expect(typeof parseXtn).toBe("function");
    expect(typeof parsePl).toBe("function");
    expect(typeof parseTs).toBe("function");
    expect(typeof parseNm).toBe("function");
    expect(typeof parseHd).toBe("function");
  });

  it("re-exports Segment and Field classes as values", () => {
    expect(typeof Segment).toBe("function"); // class → function
    expect(typeof Field).toBe("function");
  });

  it("re-exports parsePath and resolvePath as values", () => {
    expect(typeof parsePath).toBe("function");
    expect(typeof resolvePath).toBe("function");
  });

  it("HL7 namespace is a runtime object (even though it's types-only)", () => {
    // `export * as HL7 from namespace.js` emits a runtime object even when
    // the re-exports are all type-only. Verify the runtime binding exists.
    expect(HL7).toBeDefined();
    expect(typeof HL7).toBe("object");
  });

  it("preserves Phase 1/2 exports (VERSION, parseHL7, Hl7Message)", () => {
    expect(typeof parseHL7).toBe("function");
    expect(typeof Hl7Message).toBe("function");
  });

  it("type-only imports resolve (compile-time check via usage)", () => {
    // If these type imports are broken, the file wouldn't typecheck.
    const xpn: XPN = { familyName: "Smith" };
    const xad: XAD = { street: "1 Main" };
    const ts: TS = { raw: "20250101", date: new Date(Date.UTC(2025, 0, 1)) };
    const nm: NM = { raw: "120", value: 120 };
    const cx: CX = { idNumber: "1" };
    const cwe: CWE = { identifier: "X" };
    const ce: CE = { identifier: "X" };
    const xtn: XTN = { telephoneNumber: "555" };
    const pl: PL = { pointOfCare: "ICU" };
    const hd: HD = { namespaceId: "APP" };
    const dp: DotPath = { segmentType: "PID", segmentIndex: 0, fieldIndex: 5 };

    // Also verify HL7.XPN namespace-access type compiles:
    const xpn2: HL7.XPN = { familyName: "Jones" };

    // Runtime assertions to keep vitest happy:
    expect(xpn.familyName).toBe("Smith");
    expect(xad.street).toBe("1 Main");
    expect(ts.raw).toBe("20250101");
    expect(nm.value).toBe(120);
    expect(cx.idNumber).toBe("1");
    expect(cwe.identifier).toBe("X");
    expect(ce.identifier).toBe("X");
    expect(xtn.telephoneNumber).toBe("555");
    expect(pl.pointOfCare).toBe("ICU");
    expect(hd.namespaceId).toBe("APP");
    expect(dp.segmentType).toBe("PID");
    expect(xpn2.familyName).toBe("Jones");
  });
});
```

No source file modifications needed beyond the barrels. Task 3 is pure barrel-wiring.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/types/index.ts src/model/types/namespace.ts src/index.ts test/model-public-exports.test.ts --max-warnings=0 && pnpm test -- --run model-public-exports && pnpm build</automated>
  </verify>
  <acceptance_criteria>
    - `src/model/types/namespace.ts` exists and has 10 `export type` lines: `grep -cE "^export type \\{" src/model/types/namespace.ts` returns 10.
    - `src/model/types/index.ts` exists and re-exports both types and parsers (10 each): `grep -cE "^export type \\{" src/model/types/index.ts` returns 10; `grep -cE "^export \\{ parse" src/model/types/index.ts` returns 10.
    - `src/index.ts` has `export * as HL7`: `grep -cE "^export \\* as HL7 from" src/index.ts` returns 1.
    - `src/index.ts` exports all 10 composite types as named: `grep -cE "^export type \\{ (XPN|XAD|CX|CWE|CE|XTN|PL|TS|NM|HD) \\}" src/index.ts` returns 10.
    - `src/index.ts` exports all 10 parsers as named: `grep -cE "^export \\{ (parseXpn|parseXad|parseCx|parseCwe|parseCe|parseXtn|parsePl|parseTs|parseNm|parseHd) \\}" src/index.ts` returns 10.
    - Phase 1/2 surface preserved: `grep -cE "^export \\{ (parseHL7|Hl7Message|FATAL_CODES) \\}" src/index.ts` returns 3.
    - `pnpm typecheck` exits 0.
    - `pnpm lint ... --max-warnings=0` exits 0.
    - `pnpm test -- --run model-public-exports` exits 0.
    - `pnpm build` exits 0.
    - `dist/index.d.ts` contains the composite type declarations: `grep -cE "interface (XPN|XAD|CX|CWE|CE|XTN|PL|TS|NM|HD)" dist/index.d.ts` returns 10 (after build).
    - `dist/index.d.ts` contains `HL7` namespace (verifies `export * as HL7` transpiled correctly): `grep -c "namespace HL7" dist/index.d.ts` returns 1 OR `grep -c "declare namespace HL7" dist/index.d.ts` returns 1 (tsup may emit either form).
  </acceptance_criteria>
  <done>Public barrel complete. `import { HL7, XPN, parseXpn } from "@cosyte/hl7-parser"` all resolve. `dist/` ships with all 10 composite types and the HL7 namespace. Phase 3 public surface fully shipped.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user-supplied path / segment name / value → mutation methods | All inputs validated at entry — malformed path throws TypeError; malformed segment name throws TypeError; value accepted verbatim (re-escape is Phase 5's concern). |
| in-place tree mutation → cache staleness | Mitigated by D-17 wholesale cache invalidation on every mutation. |
| barrel re-exports → API surface lock-in | The 10 composite types + 10 parsers + HL7 namespace become part of the stable public contract; breaking changes require a MAJOR version bump post-v1.0. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-04-01 | Tampering | setField bypasses escape safety | accept | D-18 explicitly accepts raw value verbatim; re-escaping happens at Phase 5 serialize. Documented in method JSDoc. Consumers who paste user input directly must trust / sanitize at their own layer. |
| T-03-04-02 | Elevation of Privilege | addSegment accepts arbitrary RawField objects | mitigate | D-19 validates only the NAME shape; fields are accepted structurally. This is the documented ergonomic tradeoff. If a RawField has malformed internal shape (e.g. non-array repetitions), TypeScript's structural typing catches it at the caller; at runtime a malformed RawField only corrupts the single message, never escapes to other parsers. |
| T-03-04-03 | Denial of Service | removeSegment(type, { all: true }) on a huge message | mitigate | `Array.prototype.filter` is O(n) in the segments array (bounded at ~50 for realistic messages; even 10,000-segment batches complete in sub-ms). No recursion. |
| T-03-04-04 | Tampering | removeSegment on MSH would break the message | mitigate | Hard-coded throw — `removeSegment("MSH")` raises TypeError. |
| T-03-04-05 | Information Disclosure | barrel accidentally exports internal helpers | accept | `_shared.ts` uses an underscore prefix and is NEVER imported from `src/index.ts`. Nothing exported from `src/model/types/namespace.ts` or `src/model/types/index.ts` leaks internal helpers. Verified by acceptance criteria grep. |
</threat_model>

<verification>
After all 3 tasks:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run
pnpm build
```

All four exit 0. `dist/index.d.ts` carries all 10 composite interfaces + HL7 namespace + Field with 10 `.asXxx()` methods + Hl7Message with 3 mutation methods + all JSDoc `@example` blocks preserved through tsup.
</verification>

<success_criteria>
- `Field` class has 10 `.asXxx()` composite coercion methods (TYPES-02 closed).
- `Hl7Message` has 3 mutation methods: `setField`, `addSegment`, `removeSegment` (MODEL-06, MODEL-07 closed).
- `src/model/types/index.ts` + `src/model/types/namespace.ts` + updated `src/index.ts` expose the full Phase 3 surface: 10 composite types + 10 parsers + `HL7` namespace + Segment + Field + parsePath + resolvePath + DotPath.
- D-13 (named exports AND HL7 namespace), D-15/D-16/D-17/D-18/D-19 (mutation semantics) all demonstrated by tests.
- Full test suite green: Phase 1 sanity + Phase 2 parser (123+) + Phase 3 dot-path + Segment/Field + traversal + 6 composites (Plan 02) + 4 composites (Plan 03) + Field coercions + mutation + public exports. Target ~200+ passing tests.
- `pnpm build` produces `dist/` with `@example` blocks preserved, dual ESM/CJS, HL7 namespace resolvable from both.
- Zero new runtime deps. Zero lint warnings. Zero typecheck errors. Zero regressions.
</success_criteria>

<output>
After completion, create `.planning/phases/03-structural-model-and-types/03-04-SUMMARY.md` describing:
- What shipped: 3 modified source files (field.ts, message.ts, index.ts), 2 new source files (types/index.ts, types/namespace.ts), 3 new test files (field-coercions, mutation, public-exports).
- REQ-IDs closed: MODEL-06 (immutability by convention via explicit mutation-only API), MODEL-07 (setField/addSegment/removeSegment functional and reflected in reads), TYPES-02 (Field.asXxx returns typed instances).
- Decisions applied: D-08 (.asXxx() surface), D-09 (not memoized — verified by "two calls → two objects" test), D-13 (HL7 namespace + named exports), D-15 (chainable returning this), D-16 (warnings frozen post-mutation — verified), D-17 (cache wholesale invalidation — simpler than per-type invalidation; D-17's letter was "invalidate the Segment/Field wrapper cache for the affected segment type" but we chose wholesale because it's equally correct and simpler), D-18 (setField minimal validation), D-19 (segment-name regex enforced in addSegment + removeSegment), D-20 (no dirty flag — verified by "warnings reference identity preserved" test).
- Design notes:
  - `setField` rebuilds the path from leaf to root rather than in-place array mutation. Slightly more allocations but keeps the `readonly RawX` type declarations honest. The one readonly bypass is reassigning `this.rawSegments` — documented in the method body.
  - `setField` auto-creates missing repetitions/components/subcomponents WITHIN an existing field but does NOT auto-create missing segments. Caller must `addSegment` first — matches CONTEXT.md §Claude's Discretion recommendation.
  - `removeSegment("MSH")` throws. Unknown segment type is a no-op. Both behaviors documented.
  - HL7 namespace is types-only; parsers (parseXpn etc.) are exported as named values alongside. This matches CONTEXT.md D-13 "named exports AND re-exported under an HL7 namespace."
- Notes for Phase 4:
  - `msg.meta.timestamp` reads MSH-7 via `msg.segments("MSH")[0]?.field(7).asTs().date`.
  - `msg.patient.name` reads PID-5 via `msg.segments("PID")[0]?.field(5).asXpn()`.
  - `msg.patient.address` reads PID-11 via `.asXad()`.
  - Every Phase 4 helper is pure composition over Phase 3's public API — no reaching into rawSegments/rawFields.
- Notes for Phase 5 (serialization):
  - D-18 deferred escape-safety of mutation values to Phase 5. When `toString()` walks the tree, it MUST call `reescape(value, enc)` on every leaf value — especially those inserted via `setField` after parse (which were not escape-sanitized on input).
  - No dirty flag (D-20); Phase 5 walks the tree fresh on every `toString()` call.
- Notes for Phase 6 (profiles):
  - Custom Z-segment field-name resolution (PROF-07) will layer on top of `Segment.field(n)` by adding a `Segment.get(fieldName: string)` profile-aware method. The current shape supports this extension.
</output>
