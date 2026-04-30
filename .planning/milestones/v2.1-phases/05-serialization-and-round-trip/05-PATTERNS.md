# Phase 5: Serialization & Round-Trip - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 10 source files (7 new, 2 modifications, 8 new tests)
**Analogs found:** 10 / 10 (exact or strong role-match for every file)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/serialize/emit-field.ts` | emit primitive (module-level walker over Raw* tree) | transform (tree → string) | `src/model/types/xpn.ts` (walks RawRepetition), `src/parser/escapes.ts::reescape` (consumed) | role-match |
| `src/serialize/to-string.ts` | top-level emitter (composes primitives) | transform (Hl7Message → HL7 string) | `src/parser/index.ts::parseHL7` (inverse direction; composes stages) | role-match |
| `src/serialize/to-json.ts` | snapshot emitter + type decl | transform (Hl7Message → SerializedMessage) | `src/helpers/meta.ts::buildMeta` (composes Mutable<T> object, freezes at boundary) | exact-role |
| `src/serialize/pretty-print.ts` | text formatter (no options) | transform (Hl7Message → human text) | `src/helpers/patient.ts::composeFullName` (string composition from typed view) + `src/helpers/meta.ts::buildMeta` (meta-derived view) | role-match |
| `src/builder/build-message.ts` | top-level factory | synthesize (init → Hl7Message) | `src/parser/index.ts::parseHL7` (symmetric inbound factory; returns Hl7Message via `new Hl7Message({...})`) | exact-role |
| `src/builder/format-timestamp.ts` | timestamp formatter | transform (Date → HL7 TS string) | `src/parser/dates.ts::parseHl7Timestamp` (inverse direction; same domain) | exact-inverse |
| `src/builder/control-id.ts` | ID generator | synthesize (void → string) | None in repo - smallest new primitive (Date + Math.random) | no-analog |
| `src/model/message.ts` (modify: `toString`, `toJSON`, `prettyPrint`) | Hl7Message class methods | delegates to module-level emitters | existing `msg.meta` / `msg.patient` / `msg.visit` getters + `observations()` / `orders()` collection methods (delegate to module-level `build*` / `walk*` funcs) | exact |
| `src/index.ts` (modify: barrel add) | public barrel | export | existing pattern in `src/index.ts` (Phase 4 `pickMrn` + type-only helper exports) | exact |
| `test/round-trip.test.ts` + `test/fixtures/round-trip/*` | integration test + fixtures | assertion sweep | `test/model-mutation.test.ts` (FIXTURE const + parseHL7 round-trip assertions); `test/fixtures/` dir does not yet exist - new convention | partial |

---

## Pattern Assignments

### `src/serialize/emit-field.ts` (emit primitive, module-level)

**Analogs:**
- `src/model/types/xpn.ts` (lines 75-122) - shape of a pure module-level function that walks a `RawRepetition` tree
- `src/parser/escapes.ts` (lines 145-158) - `reescape` is the delimiter primitive this module consumes
- `src/parser/types.ts` (lines 167-238) - Raw* walker input shapes

**Module JSDoc header pattern** (copy from `src/parser/escapes.ts` lines 1-25 style):
```typescript
/**
 * HL7 emit primitives for the `@cosyte/hl7-parser` serializer pipeline —
 * walks a `RawSegment` / `RawField` tree and produces spec-clean HL7 text
 * by joining repetitions, components, and subcomponents with the active
 * delimiters and re-escaping user content via `reescape`.
 *
 * Not part of the public API (no re-export from `src/index.ts`). Phase 6
 * profile hooks may compose around `emitSegment` / `emitField`.
 * @internal
 */
```

**Imports pattern** (mimic `src/model/types/xpn.ts` lines 10-12):
```typescript
import { reescape } from "../parser/escapes.js";
import type {
  EncodingCharacters,
  RawField,
  RawRepetition,
  RawSegment,
} from "../parser/types.js";
```

**Function signature pattern** (mimic `parseXpn` lines 75 + `reescape` line 145):
```typescript
/** @internal */
export function emitField(field: RawField, enc: EncodingCharacters): string { ... }

/** @internal */
export function emitSegment(seg: RawSegment, enc: EncodingCharacters): string { ... }
```

**Walker structure pattern** (mimic the "iterate and trim trailing empty" trick from `buildMeta` lines 56-62):
```typescript
// buildMeta trailing-trim pattern (src/helpers/meta.ts lines 56-62):
const parts: string[] = [];
for (let i = 0; i < firstRep.components.length; i++) {
  const sub = msg.get(`MSH.9.${String(i + 1)}`);
  parts.push(sub ?? "");
}
while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
const fullType = parts.join("^");
```
Apply identically to components, repetitions, subcomponents in `emitField` for D-02 trailing-empty strip.

**isNull preservation** (D-02): `RawField.isNull === true` returns literal `""` (two chars). Use `RawField.isNull` discriminant already on `src/parser/types.ts` line 199-202.

**Re-escape chokepoint** (D-04): Every subcomponent string passes through `reescape(sub, enc)` before join. Reference: `src/parser/escapes.ts` lines 145-158.

---

### `src/serialize/to-string.ts` (message emitter)

**Analog:** `src/parser/index.ts::parseHL7` (lines 282-411) — symmetric inverse; parser reads MSH then tokenizes, emitter walks `rawSegments` then formats MSH-1/MSH-2 specially.

**Imports pattern:**
```typescript
import type { Hl7Message } from "../model/message.js";
import { emitField, emitSegment } from "./emit-field.js";
```

**MSH-1/MSH-2 special-case pattern** (D-06 - inverse of `readDelimiters` `src/parser/delimiters.ts` lines 60-150):
```typescript
// readDelimiters reads: firstSegment.charAt(3) = field sep;
//                       firstSegment.slice(4, 8) = component+rep+escape+subcomp.
// Inverse emission:
"MSH" + enc.field + enc.component + enc.repetition + enc.escape +
  enc.subcomponent + enc.field + <emit MSH fields[2..N] joined by enc.field>
```
(See CONTEXT.md §specifics "toString MSH emission trace".)

**Segment terminator pattern** (D-05):
```typescript
const segmentStrings = msg.rawSegments.map((s) => emitSegment(s, msg.encodingCharacters));
return segmentStrings.join("\r") + "\r";
```

**Purity pattern** (D-07 - copy doctrine from `src/helpers/meta.ts` D-21/D-22 notes): No `emit`, no throw, no warnings array mutation. Compare `src/model/types/_shared.ts` lines 18-22 for the NOOP_EMITTER precedent when silent parsing was required.

---

### `src/serialize/to-json.ts` (snapshot emitter + `SerializedMessage` type)

**Analog:** `src/helpers/meta.ts::buildMeta` (lines 38-109) - exact shape of a pure builder that produces a frozen object.

**Type declaration pattern** (mimic `src/helpers/types.ts::Meta` lines 46-71 with JSDoc + `@example`):
```typescript
/**
 * Snapshot-stable JSON projection of an `Hl7Message`. Mirrors `rawSegments`
 * one-for-one; preserves `isNull`; always includes `warnings: []`; omits
 * `profile` when absent. D-17..D-21.
 *
 * @example
 * ```ts
 * import type { SerializedMessage } from "@cosyte/hl7-parser";
 * const snap: SerializedMessage = JSON.parse(JSON.stringify(msg));
 * console.log(snap.segments[0].name); // "MSH"
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
```

**Mutable<T> builder pattern** (exact copy from `src/helpers/meta.ts` lines 39-40, also in `src/model/types/xpn.ts` line 76):
```typescript
type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
const out: Mutable<SerializedMessage> = {};
// ... populate ...
return Object.freeze(out) as SerializedMessage;  // D-19 shape-stable
```

**Profile omission pattern** (D-20 - mirrors `src/parser/index.ts` lines 385-410 conditional init):
```typescript
// parseHL7 handles exactOptionalPropertyTypes this way:
if (profileInit === undefined) {
  return new Hl7Message({ ... });  // omit the key
}
return new Hl7Message({ ..., profile: profileInit });  // include when truthy
```

**Warnings pass-through** (D-19):
```typescript
warnings: msg.warnings,  // already frozen at Hl7Message construction; pass through
```

---

### `src/serialize/pretty-print.ts` (human text formatter)

**Analogs:**
- `src/helpers/patient.ts::composeFullName` (lines 41-56) - string composition with omitted parts, Western-order join
- `src/helpers/meta.ts::buildMeta` (lines 38-109) - the header line reads from `msg.meta` (composes on helpers, not rawSegments)
- `src/serialize/emit-field.ts::emitField` (NEW - consumed for composite rendering per D-24)

**Imports pattern:**
```typescript
import type { Hl7Message } from "../model/message.js";
import { emitField } from "./emit-field.js";
```

**Header line pattern** (D-25 - composes on `msg.meta`, mimic `src/helpers/patient.ts::composeFullName` join style):
```typescript
// D-25: "HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)"
// Missing meta fields render as "-".
const meta = msg.meta;
const header = `HL7 ${meta.type ?? "-"}  controlId=${meta.controlId ?? "-"}  ` +
  `timestamp=${meta.timestamp?.toISOString() ?? "-"}  ` +
  `(${String(msg.rawSegments.length)} segments)`;
```

**Segment-per-line pattern** (D-23 - one line per segment, labeled `[N]=value`):
```typescript
// Iterate rawSegments. For each field index N (starting at 1 for non-MSH,
// 3 for MSH per HL7 convention in D-23 example), if the emitted field is
// non-empty, emit "[N]=<emitField(field, enc)>". Join with two-space separator.
```

**Purity pattern** (D-26): same as `toString` - no throw, no warn. See `src/helpers/meta.ts` D-22 doctrine.

---

### `src/builder/build-message.ts` (top-level factory)

**Analog:** `src/parser/index.ts::parseHL7` (lines 282-411) - symmetric outbound factory that returns `new Hl7Message({ ... })`.

**Module JSDoc header** (mimic `src/parser/index.ts` lines 1-15):
```typescript
/**
 * `buildMessage` — top-level outbound factory for the `@cosyte/hl7-parser`
 * package. Synthesizes a complete MSH `RawSegment` from `BuildMessageInit`
 * and returns a real `Hl7Message` (not a builder subtype). Callers chain
 * `.addSegment(...)` (Phase 3 mutation method, unchanged) to append PID,
 * OBX, etc. Symmetric with `parseHL7` (D-09).
 */
```

**Imports pattern:**
```typescript
import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";

import { generateControlId } from "./control-id.js";
import { formatHl7Timestamp } from "./format-timestamp.js";
```

**Init shape pattern** (mimic `src/helpers/types.ts::Meta` lines 46-71 field naming for symmetry - D-10):
```typescript
/**
 * @example
 * ```ts
 * import { buildMessage } from "@cosyte/hl7-parser";
 * const msg = buildMessage({ type: "ADT^A01", sendingApp: "CLINIC" })
 *   .addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);
 * console.log(msg.toString());
 * ```
 */
export interface BuildMessageInit {
  readonly type: string;            // required - only required field per D-16
  readonly sendingApp?: string;
  readonly sendingFacility?: string;
  readonly receivingApp?: string;
  readonly receivingFacility?: string;
  readonly controlId?: string;
  readonly timestamp?: Date | string;
  readonly version?: string;
  readonly processingId?: string;
}
```

**Validation pattern** (D-16 - mimic `src/model/message.ts::addSegment` lines 560-564 TypeError style):
```typescript
// src/model/message.ts line 560-564:
if (!SEGMENT_NAME_RE.test(name)) {
  throw new TypeError(
    `addSegment: invalid segment name "${name}". ` +
      `Expected 3 chars matching [A-Z][A-Z0-9]{2} (...).`,
  );
}
// For buildMessage: apply identical actionable-TypeError style on missing/empty type.
```

**MSH synthesis pattern** (D-11 - construct a `RawSegment` with positional fields, mimic `src/model/message.ts::addSegment` lines 570-586):
```typescript
// addSegment (src/model/message.ts lines 570-586) shows how to build RawFields:
const rawFields: RawField[] = [{ repetitions: [], isNull: false }]; // fields[0] placeholder
for (const f of fields) {
  if (typeof f === "string") {
    rawFields.push({
      repetitions: [{ components: [{ subcomponents: [f] }] }],
      isNull: false,
    });
  } else {
    rawFields.push(f);
  }
}
const newSegment: RawSegment = { name, fields: rawFields };
```
For MSH synthesis: position 0 = name placeholder (field-separator char per `RawSegment` JSDoc line 232), position 1 = MSH-2 (encoding chars), positions 2+ = MSH-3 onward mapped from init.

**Construction pattern** (D-11 - exact copy from `src/parser/index.ts` lines 397-410):
```typescript
return new Hl7Message({
  segments: [mshSegment],
  encodingCharacters: DEFAULT_ENCODING_CHARACTERS,  // D-14
  version: init.version ?? "2.5",
  warnings: [],  // D-07 emitter-side purity
});
```

**Type-string parsing pattern** (Claude's Discretion — recommendation accepts both `'ADT^A01'` string OR object):
Single-string form: `init.type.split("^")` up to 3 parts → MSH-9.1 / MSH-9.2 / MSH-9.3. Pattern-match `src/helpers/meta.ts` lines 52-65 for the components-to-string inverse.

---

### `src/builder/format-timestamp.ts` (Date → HL7 TS)

**Analog:** `src/parser/dates.ts::parseHl7Timestamp` (lines 93-122) - **exact inverse direction**; lives in symmetric location (`src/builder/format-timestamp.ts` mirrors `src/parser/dates.ts`).

**Imports pattern:**
```typescript
// Zero imports from parser/dates — inverse direction, no shared code.
// Pure stdlib: Date.prototype.getUTC* methods.
```

**Function signature pattern** (mimic `parseHl7Timestamp` signature simplicity):
```typescript
/**
 * Format a JS `Date` to HL7 TS `YYYYMMDDHHmmss` (UTC, second precision).
 * Inverse of `parseHl7Timestamp` for the HL7 TS/DTM branch. D-13: sub-second
 * precision is NOT emitted (acceptable asymmetry — most outbound use cases
 * don't need ms).
 *
 * @example
 * ```ts
 * import { formatHl7Timestamp } from "@cosyte/hl7-parser";
 * formatHl7Timestamp(new Date("2026-04-19T10:15:00Z")); // "20260419101500"
 * ```
 */
export function formatHl7Timestamp(date: Date): string { ... }
```

**Implementation pattern** (padStart, mimic strict-positional format of `parseHl7TsDtm` lines 146-191):
```typescript
// parseHl7TsDtm expects: YYYY MM DD HH MM SS (4-2-2-2-2-2)
// Inverse: emit the same.
const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
const mm = String(date.getUTCMonth() + 1).padStart(2, "0");  // +1: getUTCMonth is 0-indexed
const dd = String(date.getUTCDate()).padStart(2, "0");
const hh = String(date.getUTCHours()).padStart(2, "0");
const min = String(date.getUTCMinutes()).padStart(2, "0");
const ss = String(date.getUTCSeconds()).padStart(2, "0");
return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
```

---

### `src/builder/control-id.ts` (ID generator)

**Analog:** None in repo (new primitive). Closest is `src/builder/format-timestamp.ts` (NEW - same directory, similar tiny-helper shape).

**Imports pattern:**
```typescript
// Zero deps - stdlib Date.now() and Math.random() only (D-12, D-31).
```

**Signature + JSDoc pattern** (mimic any module with single public fn, e.g. `src/parser/dates.ts` BUILTIN_DATE_FALLBACKS lines 34-39 for `export const` or `parseHl7Timestamp` lines 93 for `export function`):
```typescript
/**
 * Generate an HL7 message control ID: 17-char UTC timestamp
 * `YYYYMMDDHHmmssSSS` + 6 random alphanumeric chars = 23 chars total (D-12).
 * Uniqueness is sufficient for outbound test messages and small tools;
 * callers with stricter requirements should pass their own `controlId`.
 *
 * @example
 * ```ts
 * import { generateControlId } from "@cosyte/hl7-parser";
 * generateControlId(); // "20260419101500123aB3xY9"
 * ```
 */
export function generateControlId(): string { ... }
```

Note: this fn is **internal to `src/builder/`** — NOT re-exported from `src/index.ts` (mirror the `src/model/types/_shared.ts` internal convention, line 6-8: "Not part of the public API — never re-exported from `src/index.ts`").

---

### `src/model/message.ts` (MODIFY: add 3 methods)

**Analogs in same file:** existing Phase 4 delegation pattern for `observations()`, `orders()`, `nextOfKin()`, `allergies()`, `diagnoses()`, `insurance()` (lines 348-419) - each method is a thin wrapper that delegates to a module-level walker.

**Method-on-class delegation pattern** (exact copy from `src/model/message.ts` lines 348-350, 363-365, 378-380):
```typescript
// Existing pattern (lines 363-365):
public orders(): readonly Order[] {
  return walkOrders(this);
}

// Apply identically for Phase 5:
public toString(): string {
  return emitMessage(this);
}

public toJSON(): SerializedMessage {
  return emitJson(this);
}

public prettyPrint(): string {
  return emitPrettyPrint(this);
}
```

**JSDoc `@example` pattern** (mimic `observations()` lines 341-348):
```typescript
/**
 * Emit spec-clean HL7 (SER-01). Re-walks `rawSegments` each call (D-30 no
 * caching). Pure — never warns or throws (D-07).
 *
 * @example
 * ```ts
 * const msg = parseHL7(raw);
 * console.log(msg.toString()); // spec-clean, CR-separated HL7
 * ```
 */
public toString(): string { ... }
```

**Import additions at top of file** (extend existing imports lines 22-41 style):
```typescript
import { emitMessage } from "../serialize/to-string.js";
import { emitJson, type SerializedMessage } from "../serialize/to-json.js";
import { emitPrettyPrint } from "../serialize/pretty-print.js";
```

**Note on `toString`:** This overrides JS `Object.prototype.toString`. TS should allow; confirm ESLint `@typescript-eslint` doesn't complain about the override signature.

---

### `src/index.ts` (MODIFY: barrel additions)

**Analog:** Existing exports (lines 23-122) — identical conventions.

**New export lines** (append in the logical grouping - mirror the Phase 4 grouping comments on lines 60, 92, 101):
```typescript
// Phase 5: outbound construction + serialization types.
export { buildMessage } from "./builder/build-message.js";
export type { BuildMessageInit } from "./builder/build-message.js";  // if planner includes init type
export type { SerializedMessage } from "./serialize/to-json.js";
```

Note: `emitField`, `emitSegment`, `emitMessage`, `emitJson`, `emitPrettyPrint`, `formatHl7Timestamp`, `generateControlId` are NOT re-exported (per CONTEXT.md §specifics "Emitter factoring hint": internal until Phase 6 promotes).

**Do NOT add** the three emit methods — `Hl7Message` already exports the class; the new methods land automatically on the instance (zero barrel change required for them, per CONTEXT.md §Existing code surfaces).

---

### `test/round-trip.test.ts` + `test/fixtures/round-trip/*`

**Analogs:**
- `test/model-mutation.test.ts` (lines 16-21) - inline `FIXTURE` const + `parseHL7(FIXTURE)` round-trip assertions. Copy the style for small fixtures.
- `test/parser-public.test.ts` (lines 16-40) - structured `describe` / `it` block for an integration-level test.
- No existing `test/fixtures/` dir - Phase 5 introduces the convention. Phase 7 will expand it.

**Fixture directory convention** (NEW — no analog; Phase 7 RFC 'fixture-authoring' will formalize):
```
test/fixtures/round-trip/
  canonical-adt-a01.hl7     # CONTEXT.md §specifics canonical ADT
  oru-r01-repetitions.hl7   # OBX repetitions
  null-fields.hl7           # explicit "" null (D-02 isNull preservation)
  embedded-delimiters.hl7   # \F\ round-trip via reescape
  decoded-br.hl7            # \.br\ → literal \n pass-through
```

**Test structure pattern** (mimic `test/parser-public.test.ts` lines 16-40 with `parseHL7` + assertion):
```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseHL7 } from "../src/index.js";

// SER-02 structural-equivalence assertion.
function assertStructuralEquivalence(raw: string): void {
  const original = parseHL7(raw);
  const roundTripped = parseHL7(original.toString());
  expect(roundTripped.rawSegments).toEqual(original.rawSegments);
  expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
}

describe("round-trip: SER-02 structural-equivalence sweep", () => {
  it("ADT^A01 canonical", () => { assertStructuralEquivalence(readFileSync(...)); });
  // ... one `it` per fixture
});
```

**Idempotency pattern** (D-03 - second-pass byte-identity):
```typescript
// Byte-identical toString is NOT required on first pass (MLLP/BOM/CRLF
// normalized away), but stable from second pass onward:
const once = parseHL7(raw).toString();
const twice = parseHL7(once).toString();
expect(twice).toBe(once);
```

**Unit test files** (mimic `test/parser-escapes.test.ts` structure - top-level imports + `describe` blocks per function):
```typescript
// test/serialize-emit-field.test.ts - mirror test/parser-escapes.test.ts style.
// test/serialize-to-string.test.ts - mirror test/parser-public.test.ts style.
// test/serialize-to-json.test.ts - mirror test/helpers-meta.test.ts style (shape assertions).
// test/serialize-pretty-print.test.ts - mirror test/helpers-patient.test.ts style (string assertions).
// test/builder.test.ts - mirror test/model-mutation.test.ts style (inline FIXTURE + chainable addSegment).
// test/builder-format-timestamp.test.ts - mirror test/parser-dates.test.ts (tight unit tests).
// test/builder-control-id.test.ts - length / charset / uniqueness checks; no direct analog, smallest surface.
```

---

## Shared Patterns

### Module JSDoc header

**Source:** `src/parser/escapes.ts` lines 1-25, `src/helpers/meta.ts` lines 1-15.

**Apply to:** Every new `.ts` file (all 7 new source files).

Pattern: module-level `/** ... */` block that (1) names the module and its role, (2) references the decision IDs from CONTEXT.md driving the design, (3) notes any purity / silence contract.

```typescript
/**
 * [Module name] — [one-line role]. [2-3 sentences on what it does].
 *
 * Decisions honored:
 * - D-XX: [locked decision].
 * - D-YY: [locked decision].
 *
 * Zero runtime deps — [stdlib-only note per D-31].
 * @internal  // if not re-exported from src/index.ts
 */
```

---

### Public-export JSDoc with `@example`

**Source:** `src/parser/escapes.ts` lines 30-55 (public `unescape`), `src/helpers/meta.ts` lines 20-37 (public `buildMeta`), `src/parser/dates.ts` lines 55-92 (public `parseHl7Timestamp`).

**Apply to:** Every public export — `buildMessage`, `SerializedMessage`, `BuildMessageInit`, and the 3 new methods `toString`/`toJSON`/`prettyPrint`. (ESLint `require-example` enforces this, per CLAUDE.md Guardrails + CONTEXT.md §code_context.)

```typescript
/**
 * [One-line description.]
 *
 * [Optional paragraph on semantics, decisions, edge cases.]
 *
 * @example
 * ```ts
 * import { [symbol] } from "@cosyte/hl7-parser";
 * // concrete one-liner that compiles and runs
 * ```
 */
```

Internal functions (`emit*`, `formatHl7Timestamp`, `generateControlId`) use `@internal` instead of `@example`.

---

### exactOptionalPropertyTypes omit-when-absent

**Source:** `src/helpers/meta.ts` lines 38-109 (every optional MSH field omitted via guard), `src/parser/index.ts` lines 385-410 (conditional `new Hl7Message({...})` for optional `profile`), `src/model/types/xpn.ts` lines 75-122 (every optional component omitted).

**Apply to:** `emitJson` (optional `profile` field - D-20); `SerializedMessage` type (optional `profile`); `BuildMessageInit` consumer code when building the MSH `RawSegment`.

Pattern (exact from `buildMeta`):
```typescript
type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
const out: Mutable<SerializedMessage> = {};
// populate only when truthy
if (msg.profile !== undefined) {
  out.profile = { name: msg.profile.name, lineage: msg.profile.lineage };
}
return Object.freeze(out) as SerializedMessage;
```

---

### Immutable-by-default + freeze at boundary

**Source:** `src/helpers/meta.ts` line 108 (`Object.freeze(out) as Meta`), `src/model/message.ts` line 186 (`Object.freeze(init.warnings.slice())`).

**Apply to:** `emitJson` return (freeze before return). `emitMessage` and `emitPrettyPrint` return primitive strings - no freeze needed.

---

### Silent-never-throws emitter doctrine

**Source:** `src/helpers/meta.ts` D-21/D-22 JSDoc (lines 11-14 header: "D-21 silent. D-22 never throws."), `src/model/types/_shared.ts` lines 18-22 (`NOOP_EMITTER = (): void => {};`), `src/helpers/patient.ts` D-22 (line 20 "never throws").

**Apply to:** `toString` (D-07), `toJSON` (implicit - pure projection), `prettyPrint` (D-26).

Concretely: no `emit` callback parameter; no `throw` statements; no warnings-array mutation.

---

### Test file conventions

**Source:** `test/parser-escapes.test.ts` (function-level unit tests), `test/model-mutation.test.ts` (integration tests with inline FIXTURE const), `test/helpers-meta.test.ts` (helper-view assertions).

**Apply to:** All 8 new test files.

- Import `{ describe, expect, it } from "vitest";`
- Import from `../src/...` with `.js` extension (NodeNext module resolution).
- Top-of-file `const FIXTURE = "MSH|^~\\&|...\r..."` for integration tests.
- One `describe` block per module; one `it` per behavior.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `src/builder/control-id.ts` | ID generator | Smallest new primitive in the repo. No existing random-string generator to pattern against. Use `Date.now()` + `Math.random()` only (D-31 zero-dep). |
| `test/fixtures/round-trip/*.hl7` | test fixture files | `test/fixtures/` directory does not yet exist. Phase 5 introduces the convention; Phase 7 will expand breadth. Use one `.hl7` file per scenario listed in CONTEXT.md §specifics "Round-trip test fixture strategy". |

---

## Parallelization Graph (for Planner)

Compiled from CONTEXT.md §Integration Points + ROADMAP.md Parallelization Notes:

| File | Depends On | Parallel With |
|------|------------|---------------|
| `src/serialize/emit-field.ts` | `src/parser/escapes.ts` (existing), `src/parser/types.ts` (existing) | **must land first** (or same wave) — consumed by to-string + pretty-print |
| `src/serialize/to-string.ts` | `emit-field.ts`, `Hl7Message` | `to-json.ts` (disjoint) |
| `src/serialize/to-json.ts` | `Hl7Message` only (no emit-field dep) | `to-string.ts`, `pretty-print.ts`, all builder/* |
| `src/serialize/pretty-print.ts` | `emit-field.ts`, `msg.meta` (existing), `Hl7Message` | `to-string.ts` (if emit-field landed), `to-json.ts`, all builder/* |
| `src/model/message.ts` (3 methods) | `to-string.ts`, `to-json.ts`, `pretty-print.ts` | **coordination point** — all 3 emitters must exist; either one plan owns this file or stubs-first scaffolding allows parallel population |
| `src/builder/build-message.ts` | `Hl7Message` (+ `addSegment` via fluent chain), `format-timestamp.ts`, `control-id.ts` | **fully independent** of any serialize file |
| `src/builder/format-timestamp.ts` | none (stdlib only) | everything |
| `src/builder/control-id.ts` | none (stdlib only) | everything |
| `src/index.ts` | `build-message.ts` (value export), `to-json.ts` (SerializedMessage type) | last — minor barrel update |
| `test/round-trip.test.ts` | ALL above (requires toString + parseHL7 round trip) | **final plan** |

Planner recommendation (consistent with ROADMAP.md Phase 5 note):
- **Wave 1:** `emit-field.ts` (blocker) + `format-timestamp.ts` + `control-id.ts` (independent)
- **Wave 2:** `to-string.ts`, `to-json.ts`, `pretty-print.ts`, `build-message.ts` in parallel; `message.ts` method additions in the same plan that owns those 3 emitters (or single coordinator plan)
- **Wave 3:** `src/index.ts` barrel + `round-trip.test.ts` fixture sweep

---

## Metadata

**Analog search scope:** `src/parser/`, `src/model/`, `src/model/types/`, `src/helpers/`, `test/`, `src/index.ts`
**Files scanned:** ~25 source files; 5 test files read deeply
**Pattern extraction date:** 2026-04-19
