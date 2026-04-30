# Phase 3: Structural Model & Types — Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 26 (14 source + 12 test)
**Analogs found:** 26 / 26 (every file has at least a role-match analog in the Phase 1/2 codebase)

## Summary

Phase 3 adds **three shapes** of new code, each with a strong analog in the Phase 2 codebase:

| Shape | Phase 2 Analog | Reuses |
|-------|----------------|--------|
| Wrapper classes (`Segment`, `Field`, extended `Hl7Message`) | `src/model/message.ts` | Constructor + readonly fields; frozen-at-boundary pattern for caches |
| Pure-function parsers that take `EncodingCharacters` (composite parsers, dot-path resolver) | `src/parser/tokenize.ts`, `src/parser/escapes.ts`, `src/parser/dates.ts` | `(raw, enc) => T` signature; small helpers; hand-rolled scanner/tokenizer; zero-dep regex |
| Barrel exports under a namespace | `src/parser/warnings.ts` (`WARNING_CODES` + types) | `as const` records, `keyof` unions, re-export via `src/index.ts` |

Testing style is uniform across Phase 2: Vitest `describe`/`it`, a local `collect()` helper that returns `{ emit, warnings }`, explicit `undefined`-safe indexing (because `noUncheckedIndexedAccess` is on), and one test file per source file under `test/`.

---

## File Classification

### New source files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/model/segment.ts` | wrapper class | read-through (delegates to `RawSegment`) | `src/model/message.ts` (`Hl7Message`) | role-match (same "immutable class wrapping readonly tree" pattern; different axis — segment-level) |
| `src/model/field.ts` | wrapper class | read-through + lazy composite coercion | `src/model/message.ts` (`Hl7Message`) + composite parsers below | role-match |
| `src/model/dot-path.ts` | parser (pure functions) | string-in → discriminated-tokens-out → value-out | `src/parser/tokenize.ts` (split/scan) + `src/parser/dates.ts::matchTokenFormat` (linear scan) + `src/parser/escapes.ts::unescape` (scan loop) | exact (same "small pure function + tiny helpers" shape) |
| `src/model/types/xpn.ts` | type + parser | composite parsing: `RawRepetition → XPN` | `src/parser/tokenize.ts::tokenizeRepetition` (reads `RawRepetition.components`) | exact |
| `src/model/types/xad.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/cx.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/cwe.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/ce.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/xtn.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/pl.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/ts.ts` | type + parser | composite; delegates to `parseHl7Timestamp` | `src/parser/dates.ts` (consumer side) + composite shape | exact (the only composite that delegates) |
| `src/model/types/nm.ts` | type + parser | composite (numeric scalar) | same as XPN but simpler | exact |
| `src/model/types/hd.ts` | type + parser | composite | same as XPN | exact |
| `src/model/types/index.ts` | barrel | re-export into `HL7` namespace | `src/index.ts` (barrel style) | role-match |

### Modified source files

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/model/message.ts` | wrapper class — extends existing `Hl7Message` with traversal + mutation methods | request-response + event/cache | self (Phase 2 shell) | exact (extend same class, don't reshape constructor) |
| `src/index.ts` | barrel | add named exports + `HL7` namespace re-export | self (existing barrel) | exact |

### New test files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `test/model-dotpath.test.ts` | unit test | parser-style | `test/parser-escapes.test.ts`, `test/parser-dates.test.ts` | exact |
| `test/model-segment.test.ts` | unit test | wrapper-class | `test/model-message.test.ts`, `test/parser-tokenize.test.ts` | exact |
| `test/model-field.test.ts` | unit test | wrapper-class | `test/model-message.test.ts`, `test/parser-tokenize.test.ts` | exact |
| `test/model-mutation.test.ts` | unit test | state-mutation | `test/model-message.test.ts` + fresh shape | role-match |
| `test/types-xpn.test.ts` through `test/types-hd.test.ts` (10 files) | unit test | pure-function | `test/parser-escapes.test.ts`, `test/parser-dates.test.ts` | exact |

---

## Pattern Assignments

### `src/model/segment.ts` (wrapper class, read-through)

**Analog:** `src/model/message.ts`

**Imports pattern** (copy the `import type` + `./message.js` relative style; match the file-level JSDoc prose tone — NEVER start with `@{name}` because ESLint JSDoc parses it as a tag, per Phase 1 Rule 1):

```typescript
// src/model/message.ts:9-10
import type { EncodingCharacters, RawSegment } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";
```

For Phase 3 adapted to `segment.ts`:

```typescript
import type { EncodingCharacters, RawSegment } from "../parser/types.js";
// Field is co-located — import by name, not via barrel
import { Field } from "./field.js";
```

**Class shape pattern** (lines 54–82 of `src/model/message.ts`):

```typescript
// src/model/message.ts:54-82
export class Hl7Message {
  public readonly segments: readonly RawSegment[];
  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;

  /**
   * Construct a new `Hl7Message`. ...
   * @internal
   */
  public constructor(init: Hl7MessageInit) {
    this.segments = init.segments;
    // ...
    this.warnings = Object.freeze(init.warnings.slice());
    this.profile = init.profile;
  }
}
```

Apply to `Segment`: `readonly type: string`, `readonly fields: readonly RawField[]` (or expose `readonly raw: RawSegment`), a cached `fieldWrappers: Field[]` (per D-12: `seg.field(3) === seg.field(3)`), constructor marked `@internal` — `Segment` instances come from `Hl7Message.segments(type)`, never user code.

**Cached-wrapper pattern** (D-11/D-12 require referential stability). Use a lazy private field:

```typescript
private _fields: Field[] | undefined;

public field(n: number): Field {
  if (this._fields === undefined) {
    // Build array sized to this.raw.fields.length so index lookups are O(1)
    // and every position returns the same Field instance on repeated calls.
    this._fields = this.raw.fields.map(
      (rf, i) => new Field(rf, this.enc, { segmentIndex: this.sIdx, fieldIndex: i }),
    );
  }
  const f = this._fields[n];
  // noUncheckedIndexedAccess — return a synthetic empty Field if out-of-range,
  // matching the MODEL-05 "never throws on missing" contract.
  return f ?? Field.empty(this.enc);
}
```

**JSDoc pattern:** every public export needs `@example` — ESLint `jsdoc/require-example` enforced (see `eslint.config.js:83-90`). Constructors get `@internal` to exempt them.

---

### `src/model/field.ts` (wrapper class + lazy composite coercion)

**Analog:** `src/model/message.ts` (class shape) + composite parsers (coercion methods delegate)

**Coercion-method pattern.** Each `.asXxx()` is a one-line delegation to a composite parser. D-09 says NOT memoized in v1 — plain re-parse every call.

```typescript
// Suggested shape based on analog + D-08/D-09
public asXpn(): XPN {
  const rep = this.raw.repetitions[0];
  if (rep === undefined) return EMPTY_XPN;
  return parseXpn(rep, this.enc);
}
```

**`isNull` surfacing** — propagate `RawField.isNull` directly. See `src/parser/types.ts:199-202`:

```typescript
// src/parser/types.ts:199-202
export interface RawField {
  readonly repetitions: readonly RawRepetition[];
  readonly isNull: boolean;
}
```

Field wrapper exposes `public readonly isNull: boolean` — copy from `this.raw.isNull`.

**`value` first-rep convenience** — auto-unescape via existing helper (D-03):

```typescript
// Copy unescape call pattern — notice the 4-arg signature
// src/parser/escapes.ts:56-61 shows unescape signature
import { unescape } from "../parser/escapes.js";

public get value(): string {
  const rep = this.raw.repetitions[0];
  const comp = rep?.components[0];
  const sub = comp?.subcomponents[0];
  if (sub === undefined) return "";
  // Phase 3 leaf-access reads always auto-unescape (D-03). No warning
  // emission here — pass a no-op emitter; position is best-effort.
  return unescape(sub, this.enc, () => {}, this.position);
}
```

---

### `src/model/dot-path.ts` (parser: tokenizer + resolver)

**Analog:** `src/parser/dates.ts::matchTokenFormat` (linear-scan tokenizer, zero deps) + `src/parser/escapes.ts::unescape` (scan loop structure) + `src/parser/tokenize.ts::tokenize` (split-driven positional tree walk)

**Imports pattern** (match `src/parser/dates.ts:14-17`):

```typescript
// src/parser/dates.ts:15-17 — local re-export + types-only imports
import { timestampFallbackFormat } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position } from "./types.js";
```

Phase 3 `dot-path.ts`:

```typescript
import type {
  EncodingCharacters,
  RawSegment,
  RawField,
} from "../parser/types.js";
// Dot-path throws TypeError on malformed input (per D-18 / Specifics);
// no warning emission here — the parser does no warning plumbing.
```

**Tokenizer pattern — linear scan, zero backtracking, O(n).** Copy the structure of `matchTokenFormat` (lines 242–303 of `dates.ts`):

```typescript
// src/parser/dates.ts:248-265 — linear scan producing a discriminated-union parts array
const parts: Part[] = [];
let i = 0;
while (i < format.length) {
  let matched: Token | undefined;
  for (const t of TOKENS) {
    if (format.slice(i, i + t.length) === t) {
      matched = t;
      break;
    }
  }
  if (matched !== undefined) {
    parts.push({ kind: "token", token: matched });
    i += matched.length;
  } else {
    parts.push({ kind: "lit", value: format.charAt(i) });
    i += 1;
  }
}
```

For dot-path, tokens are `SEGMENT` (3 chars, `PID`/`MSH`/`OBX`/`Z[A-Z0-9]{2}`), `DOT`, `INDEX` (`[N]` with 0-indexed N), `NUMBER` (1-indexed field/component/subcomponent). Produce a small discriminated-union parts array. Throw `TypeError` with the full path string for unresolvable tokens (see D-18 / specifics: "throw with useful message").

**Resolver pattern — stage-by-stage descent with explicit `undefined` guards.** Copy `src/parser/index.ts::extractVersion` (lines 244–254):

```typescript
// src/parser/index.ts:244-254 — canonical "descend the raw tree with noUncheckedIndexedAccess" shape
function extractVersion(msh: RawSegment | undefined): string {
  if (msh === undefined || msh.name !== "MSH") return "";
  const versionField = msh.fields[11];
  if (versionField === undefined) return "";
  const firstRep = versionField.repetitions[0];
  if (firstRep === undefined) return "";
  const firstComp = firstRep.components[0];
  if (firstComp === undefined) return "";
  const firstSub = firstComp.subcomponents[0];
  return firstSub ?? "";
}
```

Phase 3 resolver does the same walk but driven by the parsed dot-path tokens. Every return point on a missing intermediate is `undefined`, never a throw (MODEL-05, D-03).

**MSH.1 / MSH.2 special case** (D-05 — the tokenizer emits `SEGMENT=MSH`, `DOT`, `NUMBER=1` or `2`; the resolver reads `msg.segments[0].fields[0].repetitions[0].components[0].subcomponents[0]` for MSH.1 and the same for MSH.2 — no special branch needed because `tokenize.ts::tokenizeMshSegment` (lines 105–129) already placed the separator char at `fields[0]` and the encoding-chars string at `fields[1]`). Verify with `test/parser-tokenize.test.ts:29-36`:

```typescript
// test/parser-tokenize.test.ts:29-36
expect(msh?.fields[0]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("|");
expect(msh?.fields[1]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("^~\\&");
```

**Auto-unescape at leaf** (D-03):

```typescript
// Import + usage — unescape is already in the public barrel (src/index.ts:58)
import { unescape } from "../parser/escapes.js";

// At leaf:
const raw = comp.subcomponents[subIdx] ?? "";
return unescape(raw, enc, () => {}, position);
```

**Depth-collapse rule** (D-04: `PID.5.1.1` on a no-`&` field returns the component string). Implement by falling through to "return the component when subcomponents[0] is the only entry and the subcomponent index is 1":

```typescript
// Pseudo-pattern — actual code uses the walk from extractVersion style above
if (path.subcomponentIndex !== undefined) {
  const sub = comp.subcomponents[path.subcomponentIndex - 1];
  if (sub !== undefined) return unescape(sub, enc, () => {}, position);
  // D-04: when only one subcomponent exists, treat "first subcomponent" as "the component"
  if (comp.subcomponents.length === 1 && path.subcomponentIndex === 1) {
    const only = comp.subcomponents[0];
    if (only !== undefined) return unescape(only, enc, () => {}, position);
  }
  return undefined;
}
```

---

### `src/model/types/xpn.ts` (composite parser — prototype for all 10 composites)

**Analog:** `src/parser/tokenize.ts::tokenizeRepetition` (lines 205–210) — the "walk `RawRepetition.components` + `component.subcomponents` to produce a typed shape" pattern. Phase 3 composites are the READ-side mirror of this.

**Imports pattern:**

```typescript
// Copy type-only imports style from src/parser/tokenize.ts:22-30
import type {
  EncodingCharacters,
  RawRepetition,
} from "../../parser/types.js";
import { unescape } from "../../parser/escapes.js";
```

**Function signature pattern.** All 10 composite parsers share the same signature:

```typescript
// Canonical composite parser signature — mirrors tokenize.ts's (segments, enc, emit, trimFields) style
// but read-side and no warning emission (composites are silent per D-09)
export function parseXpn(rep: RawRepetition, enc: EncodingCharacters): XPN {
  const c = rep.components;
  // noUncheckedIndexedAccess — c[i] is `RawComponent | undefined`
  // Composite fields are optional and OMITTED when absent (exactOptionalPropertyTypes)
  const familyName = readSub(c[0], 0, enc);
  const givenName = readSub(c[1], 0, enc);
  const secondName = readSub(c[2], 0, enc);
  // ... 14 components total per XPN
  const out: Mutable<XPN> = {};
  if (familyName !== undefined) out.familyName = familyName;
  if (givenName !== undefined) out.givenName = givenName;
  // ...
  return out;
}
```

**Critical: `exactOptionalPropertyTypes` means omit-when-absent, never set-to-undefined.** The `Hl7Message` constructor already demonstrates this pattern (`src/parser/index.ts:384-411`):

```typescript
// src/parser/index.ts:396-410 — two-branch construction when a key is conditional
if (profileInit === undefined) {
  return new Hl7Message({
    segments: rawSegments,
    encodingCharacters: encoding,
    version,
    warnings,
  });
}
return new Hl7Message({
  segments: rawSegments,
  encodingCharacters: encoding,
  version,
  warnings,
  profile: profileInit,
});
```

For composites with 10-14 optional fields, the cleanest escape is a `Mutable<T>` local type + conditional assignment then `return out as T`, but the `as` cast is NOT an object-literal cast so it passes `consistent-type-assertions`.

**Type interface pattern.** Copy `src/parser/types.ts::RawField` (lines 199–202) — `readonly` everything, JSDoc with `@example`:

```typescript
// src/parser/types.ts:186-202 — template for composite interfaces
/**
 * Structured name per HL7 v2 XPN (Extended Person Name). Parsed lazily via
 * `Field.asXpn()`. Fields are omitted when their underlying component is
 * absent — NOT set to `undefined` (exactOptionalPropertyTypes).
 *
 * @example
 * ```ts
 * import type { XPN } from "@cosyte/hl7-parser";
 * const name: XPN = { familyName: "Smith", givenName: "Jane" };
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
  readonly nameContext?: string;            // CWE — can be nested, but v1 flattens to string
  readonly nameValidityRange?: string;
  readonly nameAssemblyOrder?: string;
  readonly effectiveDate?: string;
  readonly expirationDate?: string;
  readonly professionalSuffix?: string;
}
```

---

### `src/model/types/ts.ts` (TS/DTM composite — the ONE composite that delegates)

**Analog:** `src/parser/dates.ts::parseHl7Timestamp` (consumer call site). TS/DTM is unique in Phase 3 because it reuses a Phase 2 helper directly (D-10, D-14).

**Shape pattern** (D-14 exactly):

```typescript
export interface TS {
  readonly raw: string;
  readonly date: Date | undefined;
}
```

**Parser pattern** — delegate to `parseHl7Timestamp`, then normalize NaN to undefined (D-24):

```typescript
// Copy the dates.ts import + call convention
// src/parser/dates.ts:93-122 shows the cascade shape
import { parseHl7Timestamp } from "../../parser/dates.js";
import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";
import { unescape } from "../../parser/escapes.js";

export function parseTs(rep: RawRepetition, enc: EncodingCharacters): TS {
  // TS is a scalar — first component, first subcomponent
  const comp = rep.components[0];
  const sub = comp?.subcomponents[0] ?? "";
  const raw = unescape(sub, enc, () => {}, { segmentIndex: 0 }); // position is best-effort
  // D-10: reuse parseHl7Timestamp verbatim. No user dateFormats here — caller's
  // (Phase 4) level knows them; Phase 3's plain Field.asTs() has none.
  const parsed = parseHl7Timestamp(raw, {});
  // D-24: normalize calendar-invalid / NaN to undefined
  const date = parsed !== undefined && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
  return { raw, date };
}
```

**Key handoff:** `parseHl7Timestamp` is already in the public barrel (`src/index.ts:56`), and its signature is locked (per Plan 05 Summary §"Notes for Phase 3"). No re-plumbing needed.

---

### `src/model/message.ts` (MODIFIED — add traversal + mutation methods)

**Analog:** self. The plan is to **extend the existing class in-place** (per D-15/D-16 + CONTEXT.md "extends this same class rather than subclassing"). Do NOT reshape the constructor.

**Add private wrapper cache fields.** The frozen-warnings pattern shows how to freeze at the boundary:

```typescript
// src/model/message.ts:75 — existing frozen-warnings pattern
this.warnings = Object.freeze(init.warnings.slice());
```

For Phase 3 caches (D-11/D-17: invalidate on mutation), add mutable private fields:

```typescript
// Add to class body (after existing public readonly fields)
/** Lazily built cache of Segment wrappers, keyed by segment type. @internal */
private _segmentsByType: Map<string, Segment[]> | undefined;

/** Lazily built cache of all segments in document order. @internal */
private _allSegments: Segment[] | undefined;
```

**`get(path)` method.** Public, returns `string | undefined`, auto-unescapes. Delegates to `dot-path.ts`:

```typescript
import { resolvePath } from "./dot-path.js";

/**
 * Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
 * auto-unescaped string value. Returns `undefined` when the path doesn't
 * resolve — never throws on missing path (MODEL-05). ...
 *
 * @example
 * ```ts
 * const msg = parseHL7(raw);
 * msg.get("PID.5.1");       // "Smith"
 * msg.get("OBX[2].5");      // third OBX's 5th field
 * msg.get("NOT.9.9");       // undefined
 * ```
 */
public get(path: string): string | undefined {
  return resolvePath(path, this.segments, this.encodingCharacters);
}
```

**Mutation methods** — in-place, return `this` (D-15). Each mutation invalidates affected caches (D-17). `setField` validates the path (D-18). `addSegment` validates the name shape (D-19):

```typescript
/**
 * Set the string value at a dot-path. Mutates the underlying tree in-place
 * and returns `this` for chaining. Throws `TypeError` on malformed path
 * (D-18); the value is accepted verbatim and re-escaping is deferred to
 * Phase 5's serializer.
 *
 * @example
 * ```ts
 * msg.setField("PID.8", "F").addSegment("NTE", ["", "note"]);
 * ```
 */
public setField(path: string, value: string): this {
  // Throw TypeError on malformed path — D-18
  const loc = parsePath(path);  // from dot-path.ts; reused parser
  // ... walk this.segments, mutate in place
  this._segmentsByType?.delete(loc.segmentType);  // D-17 invalidation
  this._allSegments = undefined;
  return this;
}
```

**Z-segment name validation pattern** (D-19). Copy the regex discipline from `src/parser/delimiters.ts:86-93`:

```typescript
// src/parser/delimiters.ts:86-93 — existing "validate shape, throw on failure" pattern
if (/\s/u.test(field)) {
  throw new Hl7ParseError(
    FATAL_CODES.INVALID_ENCODING_CHARACTERS,
    "MSH-1 field separator is whitespace — refusing to parse.",
    fatalPosition,
    snip,
  );
}
```

For `addSegment`:

```typescript
// D-19: three uppercase ASCII letters OR Z[A-Z0-9]{2}
const SEGMENT_NAME_RE = /^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u;
if (!SEGMENT_NAME_RE.test(name)) {
  throw new TypeError(
    `Invalid segment name: "${name}". Expected 3 uppercase ASCII letters or Z[A-Z0-9]{2}.`,
  );
}
```

---

### `src/model/types/index.ts` (barrel — `HL7` namespace re-export)

**Analog:** `src/index.ts` (the existing barrel). Pattern: value re-exports + `export type`.

**The `HL7` namespace pattern** (D-13) is new to Phase 3 but straightforward:

```typescript
// src/model/types/index.ts
export type { XPN } from "./xpn.js";
export type { XAD } from "./xad.js";
// ... all 10

// Also re-export as namespace — consumers write `HL7.XPN` or named `XPN`
import type { XPN } from "./xpn.js";
import type { XAD } from "./xad.js";
// ...

export type HL7 = {
  XPN: XPN;
  XAD: XAD;
  // ...
};
```

Alternatively (cleaner for `import { HL7 }`):

```typescript
// In src/model/types/index.ts
export * as HL7 from "./namespace.js";

// src/model/types/namespace.ts
export type { XPN } from "./xpn.js";
export type { XAD } from "./xad.js";
// ... all 10
```

The second form lets `import { HL7 } from "@cosyte/hl7-parser"; type T = HL7.XPN` work while `import type { XPN }` also works. Planner picks the exact shape.

---

### `src/index.ts` (MODIFIED — add new exports)

**Analog:** self. Follow the existing ordering: values first, then `export type`. Group by module.

```typescript
// Existing src/index.ts:23-58 — copy this style
export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
// ... etc.

// NEW Phase 3 additions:
export { Segment } from "./model/segment.js";
export { Field } from "./model/field.js";
export * as HL7 from "./model/types/index.js";
export type {
  XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD,
} from "./model/types/index.js";
```

---

## Pattern Assignments — Test Files

### `test/types-xpn.test.ts` (and the other 9 composite tests)

**Analog:** `test/parser-dates.test.ts` (unit tests of a pure function with no wrapper) + `test/parser-escapes.test.ts` (variant-per-escape, mirroring variant-per-composite-component).

**Header pattern** (`test/parser-dates.test.ts:1-12`):

```typescript
// test/parser-dates.test.ts:1-12
import { describe, expect, it } from "vitest";

import { parseHl7Timestamp, BUILTIN_DATE_FALLBACKS } from "../src/parser/dates.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { Hl7Position } from "../src/parser/types.js";

const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 7 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}
```

Composite tests don't need `collect()` (composites emit no warnings per D-09). Use the simpler header:

```typescript
// test/types-xpn.test.ts (proposed, based on test/parser-tokenize.test.ts shape)
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
  });

  it("omits absent components (exactOptionalPropertyTypes)", () => {
    const out = parseXpn(rep([["Smith"]]), enc);
    expect("givenName" in out).toBe(false);
  });

  it("auto-unescapes \\F\\ inside a component", () => {
    const out = parseXpn(rep([["Smith\\F\\Jr"]]), enc);
    expect(out.familyName).toBe("Smith|Jr");
  });
});
```

### `test/model-dotpath.test.ts`

**Analog:** `test/parser-tokenize.test.ts` (tests a parse-oriented function that consumes a raw tree) + acceptance cases from CONTEXT.md §Specific Ideas. The 10 "MUST pass" paths listed in CONTEXT.md §Specific Ideas map directly to 10 `it()` blocks.

**Integration style — build a real message via `parseHL7`** (match `test/parser-public.test.ts:16-17` + `19-28`):

```typescript
// test/parser-public.test.ts:16-17
const VALID_MSG =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123\rEVN|A01|20250101";
```

For dot-path tests, build a message with PID-5 XPN content, OBX repetitions, MSH-12, etc. Prefer full `parseHL7(raw)` round-trips over hand-built `RawSegment[]` because the test then also asserts the full pipeline's 1-indexed convention (a regression flag for Phase 3 mis-indexing).

### `test/model-mutation.test.ts`

**Analog:** `test/model-message.test.ts` (assertions on `Hl7Message` state) + CONTEXT.md D-15/D-17 (chainability + cache invalidation).

**Chainability test pattern:**

```typescript
// Idiomatic test for D-15 returning `this`
it("setField returns the message instance for chaining", () => {
  const msg = parseHL7(VALID_MSG);
  const same = msg.setField("PID.8", "F").addSegment("NTE", ["", "note"]);
  expect(same).toBe(msg);
});
```

**Cache-invalidation test** (D-17):

```typescript
it("invalidates the segment-type cache after addSegment", () => {
  const msg = parseHL7(VALID_MSG);
  const before = msg.segments("NTE");
  expect(before).toHaveLength(0);
  msg.addSegment("NTE", ["", "note"]);
  const after = msg.segments("NTE");
  expect(after).toHaveLength(1);
  // Wrapper arrays are fresh references (not the frozen empty array)
  expect(after).not.toBe(before);
});
```

---

## Shared Patterns

### Auto-unescape at leaf (D-03)

**Source:** `src/parser/escapes.ts::unescape` (signature at lines 56-61)

```typescript
// src/parser/escapes.ts:56-61 — the required signature
export function unescape(
  input: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
): string
```

**Apply to:** `dot-path.ts` leaf-read, `Field.value`, every `.asXxx()` composite parser when reading `subcomponents[i]`.

**Emission policy:** Phase 3 traversal emits NO warnings (per CONTEXT.md §code_context "Phase 3 traversal does not emit new warnings"). Pass `() => {}` as the emitter and a best-effort position. Any `UNKNOWN_ESCAPE_SEQUENCE` warnings discovered at read-time are silently dropped (this is a documented Phase 3 choice; Phase 7 may revisit if fixtures disagree).

### Walking the raw tree with `noUncheckedIndexedAccess` (D-06 leaf-return shape)

**Source:** `src/parser/index.ts::extractVersion` (lines 244–254) — canonical chain of `if (x === undefined) return "";` guards.

**Apply to:** `dot-path.ts` resolver, every `.asXxx()` composite when reading indexed components/subcomponents, `Segment.field(n)` bounds-check.

### `exactOptionalPropertyTypes`-compatible construction

**Source:** `src/parser/index.ts:396-410` (the two-branch `Hl7Message` construction) — omit the key when undefined, never set to explicit `undefined`.

**Apply to:** every composite parser building an output object with optional fields. Either conditionally assign via a `Mutable<T>` local, or two-branch-construct for small shapes.

### Constructor `@internal`, class `@example`

**Source:** `src/model/message.ts:61-67` + `src/parser/errors.ts:91-96` — `@internal` on constructor JSDoc, `@example` on the class-level JSDoc. Required by ESLint `jsdoc/require-jsdoc` (MethodDefinition: true) without triggering `jsdoc/require-example` on constructors.

**Apply to:** `Segment`, `Field`, composite interfaces (type aliases can be `@internal` if they're only used internally, else need `@example`).

### Barrel ordering + ESLint JSDoc compliance

**Source:** `src/index.ts:1-9` — file-level JSDoc is prose, NOT starting with `@cosyte/hl7-parser` (per Phase 1 Plan 04 Rule-1 bug: `eslint-plugin-jsdoc` parses `@...` at the start as a tag).

**Apply to:** every new file-level JSDoc header.

### Test file naming + structure

**Source:** `test/parser-escapes.test.ts:1-14` (imports + `collect()` helper + two `describe` blocks — one per export) + `test/parser-dates.test.ts:1-13` (single `describe` with one `it` per branch).

**Apply to:** `test/model-*.test.ts` and `test/types-*.test.ts`. Naming: `test/<subsystem>-<surface>.test.ts` — e.g. `test/model-dotpath.test.ts`, `test/types-xpn.test.ts`.

### Zero-dep parser discipline

**Source:** CLAUDE.md + `src/parser/dates.ts:10-13` (file-level JSDoc asserts zero deps up front). `src/parser/tokenize.ts` + `src/parser/escapes.ts` both do hand-rolled scans without regex alternation.

**Apply to:** `dot-path.ts` (hand-rolled tokenizer per CONTEXT.md §Claude's Discretion), every composite parser (no date-fns, no schema libs). Only `Date` / `Date.UTC` via the already-audited `parseHl7Timestamp`.

---

## No Analog Found

None. Every Phase 3 file has a close analog in Phase 1 or Phase 2.

The only weakly-matched file is `src/model/dot-path.ts`'s tokenizer because the project has no prior dot-path parser — but `src/parser/dates.ts::matchTokenFormat` is an excellent structural analog (linear scan, discriminated-union parts array, zero deps). Composite parsers are new shapes, but `src/parser/tokenize.ts::tokenizeRepetition`/`tokenizeComponent` establish the RawRepetition/RawComponent walk convention the composites invert (write-side → read-side).

---

## Metadata

**Analog search scope:**
- `src/model/` (1 file)
- `src/parser/` (11 files)
- `src/index.ts` (1 file)
- `test/` (13 files)
- `.planning/phases/02-*/02-0[1-6]-SUMMARY.md` (for context on what shipped vs. what's planned)

**Files scanned:** 26 source/test files; 6 Phase 2 plan summaries; 3 project-level docs (`PROJECT.md`, `CLAUDE.md`, `ROADMAP.md`).

**Pattern extraction date:** 2026-04-18

**Key conventions locked (by prior phases) that Phase 3 MUST respect:**

1. **1-indexed `RawSegment.fields`**: `fields[0]` is the name/separator placeholder; data fields start at `fields[1]` (per `src/parser/types.ts:223-237`). Dot-path `PID.5` → `fields[5]`. MSH.1 → `fields[0]` (separator char). MSH.2 → `fields[1]` (encoding-chars string).
2. **`RawField.isNull`** (`src/parser/types.ts:199-202`): distinguishes HL7 explicit-null (`""`) from empty (`||`). Field wrapper surfaces this directly (per CONTEXT.md §Specific Ideas).
3. **`unescape(input, enc, emit, position)` 4-arg signature** (`src/parser/escapes.ts:56-61`): every leaf read uses this. Phase 3 passes a no-op emitter.
4. **`parseHl7Timestamp(raw, opts)` already handles UTC default, fractional seconds, timezone offsets, and the user-format cascade** (`src/parser/dates.ts:93-122`). Phase 3 `.asTs()` is a thin wrapper.
5. **`Object.freeze` at the model boundary** (`src/model/message.ts:75`): Phase 3 mutation does NOT defrost warnings; only the `segments` tree is mutated.
6. **ESLint `jsdoc/require-example` on every non-`@internal` public export.** Every public `Segment`, `Field`, composite interface, mutation method needs an `@example` block.
7. **`consistent-type-assertions: objectLiteralTypeAssertions: "never"`** (`eslint.config.js:40-44`): no `{ ... } as XPN` — use `Mutable<T>` + per-field conditional assignment + `return out` with explicit typing.
8. **File-level JSDoc must NOT start with `@...`** (Phase 1 Plan 04 Rule-1 bug): prose first line.
