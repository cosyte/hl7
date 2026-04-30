# Phase 4: Named Helpers — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** ~25 new + 2 modified (helpers + tests + optional XCN composite + barrel)
**Analogs found:** 25 / 25 (every new file has at least a role-match analog in Phases 1–3)

## Summary

Phase 4 introduces **four shapes** of new code, each with a strong analog in the Phase 3 codebase:

| Shape | Phase 3 Analog | Reuses |
|-------|----------------|--------|
| Pure-function **helper builders** that take `Hl7Message` and return frozen plain data | `src/model/types/xpn.ts::parseXpn` (pure function over raw tree), `src/parser/index.ts::extractVersion` (cascading descent) | `(msg: Hl7Message) => Meta/Patient/Visit` signature; `Object.freeze` at boundary; omit-on-absent via `Mutable<T>` local |
| **Collection helpers** that walk segments top-to-bottom | `src/model/message.ts::allSegments` (iterate `rawSegments`), `src/model/message.ts::segments(type)` (filter wrappers) | loop over `msg.allSegments()` or `msg.segments(type)`; return `readonly T[]`; never memoize (D-06) |
| **`Hl7Message` getter/method additions** with lazy memoization + wholesale invalidation | `src/model/message.ts::segments(type)` + `allSegments()` (lazy cache), `invalidateCaches()` (wholesale drop) | Private `_meta`/`_patient`/`_visit` slots; invalidate alongside `_segmentsByType`/`_allSegments` in `setField`/`addSegment`/`removeSegment` |
| **New composite (XCN)** — if D-24 option (a) chosen | `src/model/types/xpn.ts` (14-component person name) + nested HD pattern in `src/model/types/cx.ts::parseAssigningAuthority` | XCN is structurally XPN + ID prefix + assigning-authority HD; delegate to `parseXpn` shape |

**Testing style** is uniform Phase 2/3: Vitest `describe`/`it`, `parseHL7(fixture)` for integration-ish coverage, explicit `noUncheckedIndexedAccess`-safe chains (`msg.segments("PID")[0]?.field(3)`), `expect.toStrictEqual`/`"key" in out` for optional-property semantics.

---

## File Classification

### New source files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/helpers/types.ts` | type declarations (Meta/Patient/Visit/Observation/Order/NextOfKin/Allergy/Diagnosis/Insurance) | — | `src/model/types/xpn.ts` (interface + JSDoc) | exact |
| `src/helpers/meta.ts` | pure helper builder | `Hl7Message → Meta` (read-only) | `src/model/types/xpn.ts::parseXpn` (pure fn over raw tree) + `src/parser/index.ts::extractVersion` (cascade) | exact |
| `src/helpers/patient.ts` | pure helper builder | `Hl7Message → Patient \| undefined` (read-only) | `src/model/types/xpn.ts::parseXpn` + composite coercion chain | exact |
| `src/helpers/visit.ts` | pure helper builder | `Hl7Message → Visit \| undefined` (read-only) | same as patient.ts | exact |
| `src/helpers/observations.ts` | collection walker (flat) | `Hl7Message → Observation[]` (read-only) | `src/model/message.ts::allSegments` iteration pattern | exact |
| `src/helpers/orders.ts` | collection walker (grouped) | `Hl7Message → Order[]` (read-only, positional OBX grouping) | `src/model/message.ts::allSegments` + custom state-machine walk | role-match |
| `src/helpers/next-of-kin.ts` | collection walker | `Hl7Message → NextOfKin[]` | `src/model/message.ts::segments(type)` + per-segment builder | exact |
| `src/helpers/allergies.ts` | collection walker | `Hl7Message → Allergy[]` | same as next-of-kin | exact |
| `src/helpers/diagnoses.ts` | collection walker | `Hl7Message → Diagnosis[]` | same as next-of-kin | exact |
| `src/helpers/insurance.ts` | collection walker (grouped IN1→IN2/IN3) | `Hl7Message → Insurance[]` | `src/helpers/orders.ts` (sibling) + `src/model/message.ts::allSegments` | role-match |
| `src/helpers/pick-mrn.ts` | pure pick function | `CX[] → string \| undefined` | `src/parser/index.ts::extractVersion` (descent with undefined guards) | role-match |
| `src/helpers/index.ts` | internal barrel (optional) | re-export | `src/model/types/index.ts` (internal barrel) | exact |
| `src/model/types/xcn.ts` *(if D-24 option a)* | type + parser | composite parse | `src/model/types/xpn.ts` (primary) + `src/model/types/cx.ts::parseAssigningAuthority` (nested HD) | exact |

### Modified source files

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/model/message.ts` | extend `Hl7Message` with `meta`/`patient`/`visit` getters + `observations`/`orders`/`nextOfKin`/`allergies`/`diagnoses`/`insurance` methods; extend `invalidateCaches()` | request-response + lazy cache | self (lazy cache + wholesale invalidation) | exact (extend same class) |
| `src/index.ts` | barrel — add named type exports for Meta/Patient/Visit/Observation/Order/NextOfKin/Allergy/Diagnosis/Insurance; extend `HL7` namespace with XCN (if D-24a) | barrel | self | exact |
| `src/model/types/namespace.ts` *(if D-24a)* | add XCN re-export | — | self | exact |
| `src/model/field.ts` *(if D-24a)* | add `asXcn()` coercion | composite delegation | `src/model/field.ts::asXpn` line-for-line template | exact |

### New test files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `test/helpers-meta.test.ts` | integration test (parseHL7 → helper assertions) | — | `test/model-field-coercions.test.ts` (parseHL7 fixture + assertion-per-field) | exact |
| `test/helpers-patient.test.ts` | integration test | — | same as meta | exact |
| `test/helpers-visit.test.ts` | integration test | — | same as meta | exact |
| `test/helpers-observations.test.ts` | integration test (value-type dispatch) | — | `test/model-field-coercions.test.ts` + `test/types-xpn.test.ts` (variant-per-case) | exact |
| `test/helpers-orders.test.ts` | integration test (OBX grouping) | — | `test/model-field-coercions.test.ts` + multi-segment fixture | exact |
| `test/helpers-collections.test.ts` | integration test (nk/al/dg/in) | — | `test/model-field-coercions.test.ts` | exact |
| `test/helpers-cache-invalidation.test.ts` | state-mutation test | — | `test/model-mutation.test.ts` (cache-drop-after-mutation pattern) | exact |

---

## Pattern Assignments

### `src/helpers/types.ts` (type declarations for the 9 helper shapes)

**Analog:** `src/model/types/xpn.ts` (interface + JSDoc with `@example`)

**Imports pattern** (type-only cross-module imports; JSDoc file header is prose, NOT starting with `@...` per Phase 1 Rule-1):

```typescript
// Copy from src/model/types/xpn.ts:1-13 for the file-level JSDoc tone.
import type {
  XPN, XAD, CX, CWE, CE, XTN, PL, HD,
} from "../model/types/namespace.js";
// XCN type (D-24a) imported from new src/model/types/xcn.ts OR omitted if D-24b.
import type { XCN } from "../model/types/xcn.js";
```

**Interface pattern** — every `readonly` key, every `@example` block, optional-by-omission (exactOptionalPropertyTypes). Copy from `src/model/types/xpn.ts` lines 40–56:

```typescript
// src/model/types/xpn.ts:41-56
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

Phase 4 per-shape key rules (from CONTEXT.md decisions):

- **`Meta`** — `D-03` says always defined, but individual fields optional. Readonly. `timestamp?: Date` (D-18 says `Date | undefined` flat on helpers).
- **`Patient`** — per HELPERS-02. `name: XPN` always-present (even if empty `{}`), `address?: XAD`, `phoneNumbers: readonly XTN[]` (D-20, always array), `identifiers: readonly CX[]` (D-09), `fullName?: string` (D-17).
- **`Visit`** — `D-03` says `msg.visit` nullable (HELPERS-03). `attendingDoctor?: XCN` if D-24a, else flat strings.
- **`Observation`** — discriminated union on `valueType` (D-13). See exact shape in "Pattern Assignments — observations.ts" below.
- **`Order`** — field list locked by D-16; `observations: readonly Observation[]`.
- **`NextOfKin`/`Allergy`/`Diagnosis`/`Insurance`** — planner-chosen lean subsets (per CONTEXT.md Claude's Discretion). Follow the XPN interface shape template verbatim.

**Mandatory:** every public interface needs `@example` (`jsdoc/require-example`, enforced by `eslint.config.js:83-90` — see Phase 3 PATTERNS.md §"Shared Patterns"). File-level JSDoc must NOT start with `@cosyte/...` because ESLint parses it as a tag.

---

### `src/helpers/meta.ts` (pure helper builder — MSH → Meta)

**Analog:** `src/model/types/xpn.ts::parseXpn` (pure `(rep, enc) → XPN`) + `src/parser/index.ts::extractVersion` (cascading descent)

**Imports pattern** (Phase 3 convention — types-only for raw tree, value imports for runtime helpers):

```typescript
// File-level JSDoc: prose first line (NOT starting with @...). See src/model/types/xpn.ts:1-13.
import type { Hl7Message } from "../model/message.js";
import type { HD } from "../model/types/hd.js";
import type { Meta } from "./types.js";
```

**Function signature pattern** — `buildMeta(msg: Hl7Message): Meta`. Compose on the public read surface (`msg.get` / `msg.segments("MSH")[0].field(N).asXxx()`), NOT `rawSegments`. Per CONTEXT.md §domain "Compose, don't reach through":

```typescript
/**
 * Build the immutable `Meta` view from a parsed message's MSH segment.
 * D-01: returns a deeply frozen plain object; D-02: memoized by Hl7Message
 * (caller wraps in `_meta` cache slot).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * console.log(msg.meta.type);                     // "ADT^A01"
 * console.log(msg.meta.timestamp?.toISOString()); // just works
 * ```
 */
export function buildMeta(msg: Hl7Message): Meta {
  // Use msg.get() for simple scalar reads (auto-unescape per Phase 3 D-03).
  // Use msg.segments("MSH")[0]?.field(N).asXxx() for composite reads.
  const msh = msg.segments("MSH")[0];
  // noUncheckedIndexedAccess — msh can be undefined. D-03 says Meta is always
  // defined (MSH missing would have thrown NO_MSH_SEGMENT at parse time), so
  // this guard is for typechecker satisfaction; fall through returns empty Meta.

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Meta> = {};

  // D-01 freeze at boundary (see Object.freeze pattern in src/model/message.ts:135).
  // D-18: timestamp is Date | undefined (NOT { raw, date }).
  const ts = msh?.field(7).asTs();
  if (ts?.date !== undefined) out.timestamp = ts.date;

  // MSH-9 (message type) — the composite is technically MSG (message code ^
  // trigger event ^ message structure). Use .get() for flat access; parse the
  // three components manually. Matches CONTEXT.md Specific Ideas line 1.
  const type = msg.get("MSH.9");
  if (type !== undefined && type !== "") out.type = type;
  const messageCode = msg.get("MSH.9.1");
  if (messageCode !== undefined && messageCode !== "") out.messageCode = messageCode;
  // ...

  return Object.freeze(out) as Meta;  // D-01 — freeze at top level
}
```

**Cascading-descent pattern** (for fields that may be absent at any level). Copy `src/parser/index.ts::extractVersion` (lines 244–254) — the canonical "chain of undefined guards":

```typescript
// src/parser/index.ts (extractVersion pattern):
// if (msh === undefined || msh.name !== "MSH") return "";
// const versionField = msh.fields[11];
// if (versionField === undefined) return "";
// ...

// For Phase 4 helpers, prefer msg.get()/field().asXxx() — they already do
// this cascade internally. Only reach for the raw walk if there's no
// composite coverage (there shouldn't be — CONTEXT.md §domain forbids it).
```

**Freeze-at-boundary pattern** — copy from `src/model/message.ts:138`:

```typescript
// src/model/message.ts:138 — freeze the warnings array at the model boundary
this.warnings = Object.freeze(init.warnings.slice());

// Phase 4 helper equivalent:
return Object.freeze(out) as Meta;
```

**Empty-composite handling** — when a composite coercion returns `{}` (e.g. `field.asXpn()` on an empty field per `src/model/field.ts:280`), detect with `Object.keys(x).length === 0` and OMIT the key. Same pattern as `src/model/types/cx.ts::parseAssigningAuthority` lines 89–95:

```typescript
// src/model/types/cx.ts:89-95 — omit empty composites
if (comp.subcomponents.every((s) => s === "")) return undefined;
const synthetic: RawRepetition = { /* ... */ };
const hd = parseHd(synthetic, enc);
return Object.keys(hd).length === 0 ? undefined : hd;
```

---

### `src/helpers/patient.ts` (pure helper builder — PID → Patient | undefined)

**Analog:** `src/model/types/xpn.ts::parseXpn` + `src/model/field.ts` coercion chain

**PID-absent guard (D-04)** — return `undefined` when no PID:

```typescript
/**
 * Build the immutable `Patient` view from a parsed message's PID segment.
 * Returns `undefined` when the message has no PID (D-04). Memoized by
 * Hl7Message on first access (D-02).
 *
 * @example
 * ```ts
 * const msg = parseHL7(raw);
 * console.log(msg.patient?.mrn);                        // first CX-5='MR'
 * console.log(msg.patient?.fullName);                   // "Jane Q Smith, Jr"
 * console.log(msg.patient?.dateOfBirth?.toISOString()); // just works
 * ```
 */
export function buildPatient(msg: Hl7Message): Patient | undefined {
  const pid = msg.segments("PID")[0];
  if (pid === undefined) return undefined;
  // ... build
}
```

**MRN pick pattern (D-07/D-08)** — isolate in `pick-mrn.ts` per CONTEXT.md §Specifics "MRN-pick extensibility hook":

```typescript
// src/helpers/pick-mrn.ts
import type { CX } from "../model/types/cx.js";

/**
 * Return the MRN string from a PID-3 identifier repetition list. D-07:
 * prefer the first CX whose `identifierTypeCode` === 'MR' (case-sensitive
 * per D-10). D-08: fall back to the first CX's `idNumber` if no MR-typed
 * entry is found. Returns `undefined` only when every identifier lacks an
 * `idNumber`. No warning emitted (D-21).
 *
 * @example
 * ```ts
 * import { pickMrn } from "@cosyte/hl7-parser";
 * pickMrn([{ idNumber: "X1" }, { idNumber: "12345", identifierTypeCode: "MR" }]);
 * // → "12345"
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

**Repetitions walk (for `identifiers: CX[]` from PID-3)** — reuse `Field.repetitions` + per-rep composite parse. The `Field` class exposes `repetitions` (see `src/model/field.ts:67-68`). Use `parseCx` (already value-exported from `src/index.ts:76`) on each:

```typescript
import { parseCx } from "../model/types/cx.js";
// ...
const pid3 = pid.field(3);
const identifiers: CX[] = [];
for (const rep of pid3.repetitions) {
  const cx = parseCx(rep, msg.encodingCharacters);
  if (Object.keys(cx).length > 0) identifiers.push(cx);
}
// Expose as readonly:
out.identifiers = Object.freeze(identifiers) as readonly CX[];
```

**XPN-derived flat strings (D-17)** — `fullName` composition from `name` XPN parts, Western order:

```typescript
// D-17: "Given Middle Family, Suffix" — omit missing parts, no double spaces, no trailing comma.
function composeFullName(xpn: XPN): string | undefined {
  const parts: string[] = [];
  if (xpn.givenName) parts.push(xpn.givenName);
  if (xpn.secondName) parts.push(xpn.secondName);   // "middle"
  if (xpn.familyName) parts.push(xpn.familyName);
  const base = parts.join(" ");
  const full = xpn.suffix ? (base ? `${base}, ${xpn.suffix}` : xpn.suffix) : base;
  return full === "" ? undefined : full;
}
```

**Phone-number array (D-20)** — concatenate PID-13 + PID-14 repetitions:

```typescript
import { parseXtn } from "../model/types/xtn.js";

const phones: XTN[] = [];
for (const rep of pid.field(13).repetitions) {
  const xtn = parseXtn(rep, msg.encodingCharacters);
  if (Object.keys(xtn).length > 0) phones.push(xtn);
}
for (const rep of pid.field(14).repetitions) {
  const xtn = parseXtn(rep, msg.encodingCharacters);
  if (Object.keys(xtn).length > 0) phones.push(xtn);
}
out.phoneNumbers = Object.freeze(phones) as readonly XTN[];
```

**D-18 flat Date** — `dateOfBirth` uses `field.asTs().date` (NOT `{ raw, date }`):

```typescript
const dob = pid.field(7).asTs();
if (dob.date !== undefined) out.dateOfBirth = dob.date;
```

---

### `src/helpers/visit.ts` (pure helper builder — PV1 → Visit | undefined)

**Analog:** `src/helpers/patient.ts` (sibling). Same shape, different segment.

- Return `undefined` when no PV1 (HELPERS-03).
- `attendingDoctor` uses XCN composite if D-24a chosen; else flat strings.
- `admitDateTime`, `dischargeDateTime` are flat `Date | undefined` (D-18).
- `location` is `PL` from `pv1.field(3).asPl()`.

---

### `src/helpers/observations.ts` (collection walker — OBX → Observation[])

**Analog:** `src/model/message.ts::segments("OBX")` iteration + Phase 3 `Field.asXxx()` composite dispatch (observed in `test/model-field-coercions.test.ts:60-108`)

**D-05: always returns `readonly T[]` (empty on absence). D-06: not memoized.**

**Discriminated union pattern (D-13)** — the canonical TS expression:

```typescript
/**
 * One observation row, typed by OBX-2 value-type discriminator. `value` is
 * strongly typed per D-13:
 * - 'NM' → number | undefined
 * - 'TS' | 'DT' → Date | undefined
 * - 'CWE' | 'CE' → CWE | CE | undefined (full composite)
 * - other (ST/TX/FT/ID/IS/NA/unknown) → string | undefined
 */
export type Observation =
  | { readonly valueType: "NM"; /* ... */ readonly value: number | undefined }
  | { readonly valueType: "TS" | "DT"; /* ... */ readonly value: Date | undefined }
  | { readonly valueType: "CWE" | "CE"; /* ... */ readonly value: CWE | CE | undefined }
  | { readonly valueType: Exclude<string, "NM" | "TS" | "DT" | "CWE" | "CE">;
      readonly value: string | undefined };
```

**Common fields pattern (D-15)** — factor out the shared shape to keep the union readable:

```typescript
interface ObservationBase {
  readonly setId: string | undefined;          // OBX-1
  readonly identifier: CWE;                    // OBX-3 (always parse, even if empty)
  readonly units: CWE | undefined;             // OBX-6
  readonly referenceRange: string | undefined; // OBX-7
  readonly abnormalFlags: string | undefined;  // OBX-8
  readonly status: string | undefined;         // OBX-11
  readonly observedDateTime: Date | undefined; // OBX-14 (flat Date, D-18)
}
// Then: type Observation = ObservationBase & ({valueType: "NM"; value: number | undefined} | ...);
```

**Walker pattern** — loop over `msg.segments("OBX")`:

```typescript
export function observations(msg: Hl7Message): readonly Observation[] {
  const out: Observation[] = [];
  for (const obx of msg.segments("OBX")) {
    const valueType = obx.field(2).value;  // first-sub auto-unescaped
    const common: ObservationBase = {
      setId: stringOrUndefined(obx.field(1).value),
      identifier: obx.field(3).asCwe(),
      units: asCweOrUndefined(obx.field(6)),
      referenceRange: stringOrUndefined(obx.field(7).value),
      abnormalFlags: stringOrUndefined(obx.field(8).value),
      status: stringOrUndefined(obx.field(11).value),
      observedDateTime: obx.field(14).asTs().date,
    };
    out.push(dispatchValue(valueType, obx.field(5), common, msg.encodingCharacters));
  }
  return Object.freeze(out) as readonly Observation[];
}
```

**Value-type dispatch** — per D-13, branch on `valueType` to pick the right parse function. Reuse Phase 3 `Field.asNm/asTs/asCwe/asCe`:

```typescript
function dispatchValue(
  vt: string,
  field: Field,
  common: ObservationBase,
): Observation {
  switch (vt) {
    case "NM":
      return { ...common, valueType: "NM", value: field.asNm().value };
    case "TS":
    case "DT":
      return { ...common, valueType: vt, value: field.asTs().date };
    case "CWE": {
      const cwe = field.asCwe();
      return { ...common, valueType: "CWE", value: Object.keys(cwe).length ? cwe : undefined };
    }
    case "CE": {
      const ce = field.asCe();
      return { ...common, valueType: "CE", value: Object.keys(ce).length ? ce : undefined };
    }
    default: {
      const v = field.value;
      return { ...common, valueType: vt, value: v === "" ? undefined : v };
    }
  }
}
```

**Empty-string normalization** — `Field.value` returns `""` for absent (see `src/model/field.ts:102-110`); normalize to `undefined` for the helper surface (D-22 "never throws, undefined on malformed/absent"):

```typescript
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}
```

---

### `src/helpers/orders.ts` (collection walker — OBR with positional OBX grouping — D-12)

**Analog:** `src/model/message.ts::allSegments()` (lines 222–232 — iterate `rawSegments` producing a Segment wrapper each) + state-machine walk over `msg.allSegments()` to group OBX under OBR.

**D-12 grouping algorithm** — walk segments top-to-bottom, attach OBX to the most-recent OBR; OBX that precede any OBR are NOT attached:

```typescript
export function orders(msg: Hl7Message): readonly Order[] {
  const out: Order[] = [];
  let currentGroup: Observation[] | undefined;
  let currentOrderInit: { /* ... */ } | undefined;
  let pendingOrc: Segment | undefined;  // ORC-1 → orderControl when ORC precedes OBR (D-16)

  for (const seg of msg.allSegments()) {
    if (seg.type === "ORC") {
      pendingOrc = seg;
      continue;
    }
    if (seg.type === "OBR") {
      // Close previous group
      if (currentOrderInit !== undefined) {
        out.push(finalizeOrder(currentOrderInit, currentGroup ?? []));
      }
      currentGroup = [];
      currentOrderInit = buildOrderFromObr(seg, pendingOrc);
      pendingOrc = undefined;
      continue;
    }
    if (seg.type === "OBX" && currentGroup !== undefined) {
      currentGroup.push(buildObservation(seg));
    }
    // OBX before any OBR: skipped here (D-12); still returned by observations().
  }
  if (currentOrderInit !== undefined) {
    out.push(finalizeOrder(currentOrderInit, currentGroup ?? []));
  }
  return Object.freeze(out) as readonly Order[];
}
```

**Order fields (D-16)**:
- `placerOrderNumber` — OBR-2 (scalar, `field(2).value` normalized)
- `fillerOrderNumber` — OBR-3
- `universalServiceId` — OBR-4 `field(4).asCwe()`
- `orderStatus` — OBR-5 or OBR-25 (planner picks; D-16 says confirm via Phase 7 fixtures)
- `orderControl` — ORC-1 if an ORC precedes OBR, else undefined
- `orderedBy` — OBR-16 `field(16).asXcn()` if D-24a, else flat strings
- `observations` — the grouped OBX array

**Shared with observations()** — the OBX → Observation builder logic should be extracted so both `observations()` and `orders()` consume it. Put it in a small `buildObservation(seg: Segment): Observation` helper (not exported from the public barrel).

---

### `src/helpers/next-of-kin.ts` / `allergies.ts` / `diagnoses.ts` (collection walkers — one segment type → one entry)

**Analog:** `src/model/message.ts::segments(type)` for the segment list + per-segment composite parse (same shape as `buildPatient` but simpler and per-segment).

**Canonical shape** (per CONTEXT.md Claude's Discretion: "frozen plain objects with the handful of most-used fields"):

```typescript
/**
 * Next-of-kin entry derived from an NK1 segment. One entry per NK1 in document
 * order. Empty array when the message has no NK1 segments (D-05, HELPERS-06).
 *
 * @example
 * ```ts
 * for (const nk of msg.nextOfKin()) {
 *   console.log(nk.name?.familyName, nk.relationship?.text);
 * }
 * ```
 */
export function nextOfKin(msg: Hl7Message): readonly NextOfKin[] {
  const out: NextOfKin[] = [];
  for (const nk1 of msg.segments("NK1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<NextOfKin> = {};
    const name = nk1.field(2).asXpn();
    if (Object.keys(name).length > 0) entry.name = name;
    // ... relationship (NK1-3 as CWE), phone (NK1-5 as XTN), address (NK1-4 as XAD), etc.
    out.push(Object.freeze(entry) as NextOfKin);
  }
  return Object.freeze(out) as readonly NextOfKin[];
}
```

Per-helper segment/field mapping (planner locks from HL7 v2.5 chapter 3):
- **NK1**: NK1-2 name (XPN), NK1-3 relationship (CWE/CE), NK1-4 address (XAD), NK1-5 phone (XTN)
- **AL1**: AL1-2 type (CWE/CE/IS), AL1-3 code (CWE/CE), AL1-4 severity (IS), AL1-5 reaction (string/CWE), AL1-6 onset date (TS→Date flat per D-18)
- **DG1**: DG1-3 code (CWE), DG1-4 description (string), DG1-5 dateTime (TS→Date), DG1-6 type (IS)

---

### `src/helpers/insurance.ts` (collection walker — IN1 + positional IN2/IN3 grouping)

**Analog:** `src/helpers/orders.ts` (same positional grouping algorithm — one parent + N children).

Walk `msg.allSegments()`; each IN1 opens a new group; IN2/IN3 attach to current IN1 until next IN1 or end. Recommendation: one `Insurance` entry per IN1 with `in2?: In2Metadata` and `in3?: In3Metadata` sub-fields (planner picks exact shape). Same finalize-on-next-parent pattern as orders.

---

### `src/helpers/pick-mrn.ts`

See full code excerpt under patient.ts above.

**Public-export decision:** per CONTEXT.md §integration_points line 352 "isolate the pick logic in a small `pickMrn(identifiers: CX[]): string | undefined` helper so Phase 6 can substitute a profile-aware version", export this as a named export from `src/index.ts`. Phase 6 profile hooks will re-use it; Phase 4 doesn't need to expose a substitution mechanism yet.

---

### `src/model/types/xcn.ts` (new 11th composite — if D-24 option a)

**Analog:** `src/model/types/xpn.ts` (structural — 14 components, mostly name-shaped) + `src/model/types/cx.ts::parseAssigningAuthority` (nested HD subcomponent decoding).

**XCN structure (HL7 v2.5 Chapter 2.A.88)** — 23 components, but v1 should ship a useful ~10-12:

```typescript
/**
 * Extended Composite ID Number and Name for Persons (XCN). Common in OBR-16
 * (ordering provider), PV1-7 (attending), PV1-8 (referring), etc. Structurally
 * ID + XPN parts + assigning-authority HD.
 *
 * Component positions (HL7 v2.5 — v1 ships the 12 most-used):
 * 1. idNumber                            (CX-1 analogue)
 * 2. familyName                          (XPN-1)
 * 3. givenName                           (XPN-2)
 * 4. secondName                          (XPN-3)
 * 5. suffix                              (XPN-4)
 * 6. prefix                              (XPN-5)
 * 7. degree                              (XPN-6)
 * 8. sourceTable
 * 9. assigningAuthority                  (nested HD, CX-4 analogue)
 * 10. nameTypeCode                       (XPN-7)
 * 11. identifierCheckDigit
 * 12. checkDigitScheme
 * 13. identifierTypeCode                 (CX-5 analogue — "NPI", "DN", ...)
 * [v1 stops here; v2 may restore 14–23]
 */
export interface XCN {
  readonly idNumber?: string;
  readonly familyName?: string;
  readonly givenName?: string;
  readonly secondName?: string;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly degree?: string;
  readonly sourceTable?: string;
  readonly assigningAuthority?: HD;
  readonly nameTypeCode?: string;
  readonly identifierCheckDigit?: string;
  readonly checkDigitScheme?: string;
  readonly identifierTypeCode?: string;
}
```

**Parser pattern** — copy `src/model/types/cx.ts::parseCx` verbatim (10-component walk with one nested-HD component at index 8). Reuse `readComponent` from `_shared.ts`:

```typescript
// src/model/types/xcn.ts parser — copy the _shared.ts + parseAssigningAuthority template
import { readComponent } from "./_shared.js";
import { parseHd, type HD } from "./hd.js";
// ... same parseAssigningAuthority synthesis (see src/model/types/cx.ts:85-96)

export function parseXcn(rep: RawRepetition, enc: EncodingCharacters): XCN {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<XCN> = {};
  const idNumber = readComponent(rep, 0, enc);
  if (idNumber !== undefined) out.idNumber = idNumber;
  // ... positions 1..7
  const assigningAuthority = parseAssigningAuthority(rep.components[8], enc);
  if (assigningAuthority !== undefined) out.assigningAuthority = assigningAuthority;
  // ... positions 9..12
  return out;
}
```

**`parseAssigningAuthority` reuse** — the exact 12-line helper from `src/model/types/cx.ts:85-96` is the template. Consider factoring it to `_shared.ts` if XCN is added (CX + PL + XCN would be the 3 callers — justifies extraction). Planner decides whether to extract or copy. Current approach in Phase 3 was to duplicate (see identical code in `src/model/types/cx.ts:85-96` and `src/model/types/pl.ts:89-100`).

**`src/model/field.ts::asXcn()` addition** — copy `asXpn` verbatim (line 146–148 of `src/model/field.ts`):

```typescript
// src/model/field.ts:146-148 (template):
public asXpn(): XPN {
  return parseXpn(this.repetitions[0] ?? EMPTY_REP, this.enc);
}
```

New method:

```typescript
public asXcn(): XCN {
  return parseXcn(this.repetitions[0] ?? EMPTY_REP, this.enc);
}
```

**Namespace + barrel additions** — add `XCN` to `src/model/types/namespace.ts` + `src/model/types/index.ts` + `src/index.ts` following the existing XPN pattern (see `src/model/types/namespace.ts:13` and `src/index.ts:71-72`).

---

### `src/helpers/index.ts` (internal barrel — optional)

**Analog:** `src/model/types/index.ts` (internal composite barrel)

```typescript
// src/model/types/index.ts:11-30 — internal barrel (types + parsers both re-exported)
export type { XPN } from "./xpn.js";
export { parseXpn } from "./xpn.js";
// ...
```

Phase 4 helpers barrel:

```typescript
// src/helpers/index.ts
export type {
  Meta, Patient, Visit, Observation, Order,
  NextOfKin, Allergy, Diagnosis, Insurance,
} from "./types.js";
export { buildMeta } from "./meta.js";
export { buildPatient } from "./patient.js";
export { buildVisit } from "./visit.js";
export { observations } from "./observations.js";
export { orders } from "./orders.js";
export { nextOfKin } from "./next-of-kin.js";
export { allergies } from "./allergies.js";
export { diagnoses } from "./diagnoses.js";
export { insurance } from "./insurance.js";
export { pickMrn } from "./pick-mrn.js";
```

---

### `src/model/message.ts` (MODIFIED — add meta/patient/visit getters + collection methods)

**Analog:** self — extend the existing class in-place (mirror Phase 3 D-15: add traversal/mutation without reshaping the constructor).

**Add private cache slots** (D-02 memoization + wholesale invalidation). Copy the shape from `src/model/message.ts:114-122`:

```typescript
// src/model/message.ts:114-122 (existing Phase 3 cache slots):
private _segmentsByType: Map<string, readonly Segment[]> | undefined;
private _allSegments: readonly Segment[] | undefined;
```

Phase 4 additions:

```typescript
/** Lazily built, cached result of `buildMeta(this)`. Dropped by invalidateCaches. @internal */
private _meta: Meta | undefined;

/** Lazily built, cached result of `buildPatient(this)`. `null` sentinel used to cache
 * the "no PID" negative lookup — undefined = not yet computed; null = computed, absent;
 * Patient = present. @internal */
private _patient: Patient | null | undefined;

/** Lazily built, cached result of `buildVisit(this)`. Same null-sentinel convention. @internal */
private _visit: Visit | null | undefined;
```

**Getters + methods** — per CONTEXT.md Claude's Discretion: public shape is `msg.meta` (property) / `msg.observations()` (method). Use TS getter syntax:

```typescript
import { buildMeta } from "../helpers/meta.js";
import { buildPatient } from "../helpers/patient.js";
import { buildVisit } from "../helpers/visit.js";
import { observations as walkObservations } from "../helpers/observations.js";
// ... etc.

/**
 * MSH-derived message metadata. D-01: deeply frozen plain object. D-02:
 * memoized (referentially stable across reads until mutation). D-03: always
 * defined — MSH absence throws `NO_MSH_SEGMENT` at parse time.
 *
 * @example
 * ```ts
 * console.log(msg.meta.type);                     // "ADT^A01"
 * console.log(msg.meta.timestamp?.toISOString()); // flat Date per D-18
 * ```
 */
public get meta(): Meta {
  return (this._meta ??= buildMeta(this));
}

/**
 * PID-derived patient view. `undefined` when no PID segment exists (D-04).
 * D-02: memoized.
 *
 * @example
 * ```ts
 * console.log(msg.patient?.mrn);
 * console.log(msg.patient?.dateOfBirth?.toISOString());
 * ```
 */
public get patient(): Patient | undefined {
  if (this._patient === undefined) {
    this._patient = buildPatient(this) ?? null;
  }
  return this._patient === null ? undefined : this._patient;
}

/** Similar for `get visit(): Visit | undefined` (D-03-equivalent, HELPERS-03). */
public get visit(): Visit | undefined { /* ... */ }

/** Collection helpers — methods, not getters (per CONTEXT.md §specifics). D-06: not memoized. */
public observations(): readonly Observation[] { return walkObservations(this); }
public orders(): readonly Order[] { return walkOrders(this); }
public nextOfKin(): readonly NextOfKin[] { return walkNextOfKin(this); }
public allergies(): readonly Allergy[] { return walkAllergies(this); }
public diagnoses(): readonly Diagnosis[] { return walkDiagnoses(this); }
public insurance(): readonly Insurance[] { return walkInsurance(this); }
```

**Extend `invalidateCaches()`** (lines 485–488 of `src/model/message.ts`). The existing wholesale-drop is the canonical pattern; Phase 4 just adds three more slots to drop:

```typescript
// src/model/message.ts:485-488 (existing):
private invalidateCaches(): void {
  this._segmentsByType = undefined;
  this._allSegments = undefined;
}
```

Phase 4 replacement:

```typescript
/**
 * Drop every wrapper and helper cache wholesale (Phase 3 D-17 + Phase 4 D-02).
 * Called by every mutation method so subsequent reads rebuild from the
 * mutated `rawSegments` tree.
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

**Critical:** do NOT touch `setField`/`addSegment`/`removeSegment` method bodies — they already call `this.invalidateCaches()` (lines 347, 404, 475 of `src/model/message.ts`). The single-method extension covers all three mutation paths.

---

### `src/index.ts` (MODIFIED — public barrel)

**Analog:** self (existing barrel at `src/index.ts:1-94`).

Follow the existing ordering: values first, `export type` second, grouped by module. Add after the Phase 3 composite block (after line 93):

```typescript
// Phase 4 named helpers — type-only exports (the behavior is on Hl7Message methods/getters)
export type {
  Meta, Patient, Visit, Observation, Order,
  NextOfKin, Allergy, Diagnosis, Insurance,
} from "./helpers/types.js";

// Expose pickMrn for Phase 6 profile override hook (see CONTEXT.md integration_points).
export { pickMrn } from "./helpers/pick-mrn.js";

// Phase 4 (if D-24 option a): XCN composite
export type { XCN } from "./model/types/xcn.js";
export { parseXcn } from "./model/types/xcn.js";
```

Also extend `src/model/types/namespace.ts` (line 13 position) if XCN added:

```typescript
// src/model/types/namespace.ts (current):
export type { XPN } from "./xpn.js";
// ... existing 10

// Add:
export type { XCN } from "./xcn.js";
```

---

## Pattern Assignments — Test Files

### `test/helpers-meta.test.ts`, `-patient`, `-visit`, `-observations`, `-orders`, `-collections`

**Analog:** `test/model-field-coercions.test.ts` (integration via `parseHL7(FIXTURE)` + assertion-per-field) + `test/types-xpn.test.ts` (variant-per-case)

**Header pattern** (copy from `test/model-field-coercions.test.ts:1-28`):

```typescript
/**
 * Phase 4 helper integration tests — verify that `msg.meta`/`msg.patient`/...
 * return the HELPERS-0X locked shapes against realistic fixtures.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

// Comprehensive fixture exercising every helper surface.
const FIXTURE =
  "MSH|^~\\&|APP|FAC|DEST|DESTF|20250102153045||ADT^A01^ADT_A01|MSG001|P|2.5\r" +
  "PID|||MRN123^^^HOSP^MR~ALT456|||Smith^Jane^Q^Jr^Mrs^MD||19800115|F|||123 Main St^Apt 4^Boston^MA^02101^USA||(555)555-1234^PRN^PH~(555)555-5678^WPN^PH\r" +
  "PV1|1|I|ICU^101^A^HOSP|||||||||||||||VISIT001\r" +
  "OBR|1|PLACER1|FILLER1|GLU^Glucose^LN\r" +
  "OBX|1|NM|GLU^Glucose^LN|1|120|mg/dL|80-110||||F|||20250102153100\r" +
  "NK1|1|Doe^John^^^Mr|FTH|456 Oak St^^Boston^MA|(555)111-2222\r" +
  "AL1|1|DA|PEN^Penicillin|SV|Hives\r" +
  "DG1|1|I10|E11.9^Type 2 diabetes|F|20250102";
```

**Test pattern** — one `describe` per helper, per-field `it()` blocks. Copy from `test/model-field-coercions.test.ts:29-38`:

```typescript
describe("helpers/meta: msg.meta", () => {
  it("exposes MSH-9 type as a flat string", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.meta.type).toBe("ADT^A01^ADT_A01");
  });

  it("exposes MSH-7 timestamp as a flat Date (D-18)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.meta.timestamp?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("omits absent fields (exactOptionalPropertyTypes)", () => {
    const noReceivingApp =
      "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5";
    const msg = parseHL7(noReceivingApp);
    expect("receivingApp" in msg.meta).toBe(false);
  });

  it("returns the same reference on repeat access (D-02 memoization)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.meta).toBe(msg.meta);
  });

  it("never throws on empty MSH-derived fields (D-22)", () => {
    const msg = parseHL7("MSH|^~\\&|||||20250102||ADT^A01|1|P|2.5");
    expect(() => msg.meta.type).not.toThrow();
  });
});
```

**Observation value-type dispatch tests** (`test/helpers-observations.test.ts`):

```typescript
// One it() per value type per D-13. Use the "variant-per-case" pattern from test/types-xpn.test.ts
describe("helpers/observations: msg.observations() — value-type dispatch", () => {
  it("NM → typeof value === 'number'", () => {
    const msg = parseHL7(/* OBX|1|NM|...|120 */);
    const obs = msg.observations()[0];
    expect(obs?.valueType).toBe("NM");
    expect(obs?.value).toBe(120);
  });

  it("TS → value instanceof Date (flat, D-18)", () => { /* ... */ });
  it("CWE → value is parsed composite (D-14)", () => { /* ... */ });
  it("ST → value is raw auto-unescaped string", () => { /* ... */ });
  it("unknown valueType → value: string | undefined", () => { /* ... */ });
  it("OBX-5 empty → value: undefined (D-13 final bullet)", () => { /* ... */ });
});
```

---

### `test/helpers-cache-invalidation.test.ts`

**Analog:** `test/model-mutation.test.ts` (lines 64–79 — the "cache invalidated after setField" pattern)

**Copy this invalidation-after-mutation pattern verbatim**:

```typescript
// test/model-mutation.test.ts:64-71 (canonical template):
it("invalidates the segment-type cache", () => {
  const msg = parseHL7(FIXTURE);
  const before = msg.segments("PID");
  msg.setField("PID.8", "M");
  const after = msg.segments("PID");
  expect(after).not.toBe(before);
  expect(after[0]?.field(8).value).toBe("M");
});
```

Phase 4 equivalent (per CONTEXT.md §specifics "`msg.meta === msg.meta` across reads… after `msg.setField('PID.5.1', 'Jane')`, `msg.patient` returns a new object"):

```typescript
describe("helpers cache invalidation — Phase 4 D-02", () => {
  it("msg.meta === msg.meta across reads (memoization)", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.meta).toBe(msg.meta);
  });

  it("msg.patient === msg.patient across reads", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.patient).toBe(msg.patient);
  });

  it("msg.setField('PID.5.1', 'Jones') drops the patient cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.patient;
    msg.setField("PID.5.1", "Jones");
    const after = msg.patient;
    expect(after).not.toBe(before);
    expect(after?.familyName).toBe("Jones");
  });

  it("msg.setField drops the meta cache too", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.meta;
    msg.setField("MSH.10", "NEWCTRL");
    expect(msg.meta).not.toBe(before);
    expect(msg.meta.controlId).toBe("NEWCTRL");
  });

  it("msg.addSegment('PV1', [...]) drops the visit cache", () => {
    const msg = parseHL7(/* no-PV1 fixture */);
    expect(msg.visit).toBeUndefined();
    msg.addSegment("PV1", ["1", "I"]);
    expect(msg.visit?.patientClass).toBe("I");
  });

  it("msg.removeSegment('PID') drops the patient cache", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.patient).toBeDefined();
    msg.removeSegment("PID");
    expect(msg.patient).toBeUndefined();
  });

  it("observations() re-evaluates on every call (D-06: NOT memoized)", () => {
    const msg = parseHL7(FIXTURE);
    const a = msg.observations();
    const b = msg.observations();
    expect(a).not.toBe(b);    // D-06 — no memoization
    expect(a).toStrictEqual(b);
  });
});
```

---

## Shared Patterns

### Lazy cache + wholesale invalidation (D-02, mirrors Phase 3 D-17)

**Source:** `src/model/message.ts:114-122, 193-232, 485-488`

**Apply to:** `_meta`/`_patient`/`_visit` private slots on `Hl7Message`, both getter logic and `invalidateCaches()` extension.

```typescript
// src/model/message.ts:485-488 (existing):
private invalidateCaches(): void {
  this._segmentsByType = undefined;
  this._allSegments = undefined;
}
```

Drop slots wholesale; never selectively invalidate. Consistent with the "single rule, simple to reason about" philosophy of D-02.

### `Object.freeze` at the boundary (D-01)

**Source:** `src/model/message.ts:138`

```typescript
// src/model/message.ts:138
this.warnings = Object.freeze(init.warnings.slice());
```

**Apply to:** every helper builder's return value (Meta, Patient, Visit, each Observation/Order/NextOfKin/etc. + the wrapping `readonly []` arrays). Nested composite values (XPN/XAD/etc.) are already effectively frozen per Phase 3 D-09 ("plain data" convention — `exactOptionalPropertyTypes` output objects are never mutated post-construction).

### `exactOptionalPropertyTypes`-compatible construction

**Source:** `src/model/types/xpn.ts:75-122` (per-field conditional assignment via `Mutable<T>` local)

```typescript
// src/model/types/xpn.ts:76-80
type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
const out: Mutable<XPN> = {};

const familyName = readComponent(rep, 0, enc);
if (familyName !== undefined) out.familyName = familyName;
```

**Apply to:** every helper object build (Meta, Patient, Visit, Observation, Order, NextOfKin, Allergy, Diagnosis, Insurance, XCN if present). Never set keys to explicit `undefined`. Use the `Mutable<T>` + conditional assignment + `return out` (with or without a `return out as T` cast — the cast is NOT an object-literal cast so it passes `consistent-type-assertions`).

### `noUncheckedIndexedAccess`-safe descent

**Source:** `src/parser/index.ts::extractVersion` (lines 244–254) + `src/model/field.ts::value` (lines 102–110) + Phase 3 PATTERNS.md §"Walking the raw tree"

```typescript
// src/model/field.ts:102-110 (first-sub-of-first-comp-of-first-rep with undefined guards):
public get value(): string {
  const rep = this.repetitions[0];
  if (rep === undefined) return "";
  const comp = rep.components[0];
  if (comp === undefined) return "";
  const sub = comp.subcomponents[0];
  if (sub === undefined) return "";
  return unescape(sub, this.enc, NOOP_EMITTER, this.position);
}
```

**Apply to:** every raw-segment lookup when the helper can't go through `msg.get()` / composite coercion (should be rare — helpers compose on Phase 3's public surface per CONTEXT.md §domain "Compose, don't reach through"). Prefer `msg.get("PID.5.1")` / `msg.segments("PID")[0]?.field(5).asXpn()` over walking `rawSegments` directly.

### Compose on Phase 3, don't walk `rawSegments`

**Source:** CONTEXT.md §domain lines 37–40 ("Helpers MUST build on Phase 3's public surface")

**Apply to:** every helper. The only sanctioned entry points are:
- `msg.get(path)` — flat string reads with auto-unescape (D-23)
- `msg.segments(type)` — typed Segment iteration (D-02 parent-cache stability)
- `msg.segments(type)[i].field(n)` — 1-indexed HL7 field access (MSH-offset handled per `src/model/segment.ts:96`)
- `field.asXpn()` / `field.asTs()` / etc. — typed composite coercions (Phase 3 Plan 04)
- `field.repetitions` + `parseXxx(rep, enc)` — when walking repetitions manually (e.g. PID-3 for identifiers, PID-13/14 for phones)
- `msg.allSegments()` — when ordering matters across segment types (orders grouping, insurance grouping)

### Flat `Date | undefined` at helper layer (D-18 deviation)

**Source:** `src/model/types/ts.ts::TS` + Field `.asTs().date`

**Apply to:** `Meta.timestamp`, `Patient.dateOfBirth`, `Visit.admitDateTime`, `Visit.dischargeDateTime`, `Observation.observedDateTime`, `Allergy.onsetDate` (if used), `Diagnosis.dateTime` (if used). Each is `Date | undefined` (NOT `{ raw, date }`).

```typescript
// Canonical extraction:
const ts = msg.segments("MSH")[0]?.field(7).asTs();
if (ts?.date !== undefined) out.timestamp = ts.date;
```

### File-level JSDoc prose, never `@...`-leading (Phase 1 Rule-1)

**Source:** `src/model/types/xpn.ts:1-13`, every composite file

ESLint `eslint-plugin-jsdoc` parses `@...` at the start of a block comment as a tag, which breaks `jsdoc/require-file-overview`. Always start file-level JSDoc with prose.

**Apply to:** every new file in `src/helpers/` and `src/model/types/xcn.ts`. First line of JSDoc should be descriptive, like `src/model/types/xpn.ts:2` ("XPN — HL7 v2 Extended Person Name composite. ...").

### `@example` on every public export

**Source:** `eslint.config.js:83-90` — `jsdoc/require-example` enforces on non-`@internal` public exports. Every Phase 3 composite interface has one (see `src/model/types/xpn.ts:36-39`).

**Apply to:** Meta/Patient/Visit/Observation/Order/NextOfKin/Allergy/Diagnosis/Insurance interfaces; every new getter/method on `Hl7Message`; `buildMeta`/`buildPatient`/`buildVisit`/`observations`/`orders`/`nextOfKin`/`allergies`/`diagnoses`/`insurance`/`pickMrn` functions (whether public or internal, planner's call); XCN interface + `parseXcn` + `Field.asXcn` if D-24a chosen.

Mark constructors / internal builder functions `@internal` to exempt from `require-example` (see `src/model/message.ts:131` and `src/model/field.ts:83` for `@internal` placement).

### Test file naming + structure

**Source:** `test/model-field-coercions.test.ts:1-28` (header) + `test/types-xpn.test.ts:1-14` (pure-function variant)

Naming: `test/<subsystem>-<surface>.test.ts` — e.g. `test/helpers-meta.test.ts`, `test/helpers-observations.test.ts`, `test/helpers-cache-invalidation.test.ts`.

Per-file structure: file-level JSDoc, Vitest imports + `parseHL7` import, one shared `FIXTURE` constant at module top, one `describe` per surface, per-case `it()`.

### Zero-dep discipline + stdlib-only

**Source:** CLAUDE.md + every Phase 3 composite file header

**Apply to:** every new helper file. No date-fns, no lodash, no utility libs. Only Node stdlib (which is nothing more than TS built-ins — no `node:*` imports needed for Phase 4).

---

## No Analog Found

| File | Role | Data Flow | Reason / Fallback |
|------|------|-----------|-------------------|
| `src/helpers/orders.ts` positional OBX-grouping state machine | collection walker with parent-child grouping | event-driven | No prior positional-grouping walker exists. Nearest structural analog: `src/parser/segments.ts::splitSegments` (linear scan producing grouped output), but the semantics are different. Planner codes the state machine from scratch, following the algorithm spelled out in CONTEXT.md D-12. |
| `src/helpers/insurance.ts` IN1/IN2/IN3 grouping | same shape as orders.ts | event-driven | Same as orders — no analog, algorithm is spelled out in CONTEXT.md §specifics line 387 ("one Insurance entry per IN1 with attached IN2/IN3 metadata"). |
| `src/helpers/pick-mrn.ts` CX-type resolution | pure function | filter + fallback | No precedent for `(CX[]) → string \| undefined` helpers. Build fresh following D-07/D-08. The "loop + prefer + fallback" shape is trivial and justified by Phase 6 profile override hook (CONTEXT.md §integration_points). |

None of these block planning — each has a clear algorithm specified in CONTEXT.md. The Phase 3 PATTERNS.md equivalent section ("No Analog Found") notes `src/model/dot-path.ts` had the same shape-novel-but-algorithm-clear characteristic.

---

## Metadata

**Analog search scope:**
- `src/model/` (all 4 files: message.ts, segment.ts, field.ts, dot-path.ts)
- `src/model/types/` (all 12 files: 10 composites + `_shared.ts` + barrels)
- `src/parser/` (index.ts for extractVersion pattern, dates.ts for parseHl7Timestamp delegation)
- `src/index.ts` (barrel style)
- `test/model-*.test.ts` (mutation + coercion patterns)
- `test/types-*.test.ts` (composite test style)
- `.planning/phases/03-structural-model-and-types/03-PATTERNS.md` (prior pattern map — directly informs this one)
- `.planning/phases/03-structural-model-and-types/03-PLAN-01-read-path-foundation.md` and `03-PLAN-04-mutation-and-barrel.md` (cache + barrel precedents)

**Files scanned:** ~20 source/test files; Phase 3 PATTERNS.md + 4 Phase 3 PLAN files; 4 Phase 4 context docs.

**Pattern extraction date:** 2026-04-19

**Key conventions locked (by prior phases) that Phase 4 MUST respect:**

1. **Wholesale cache invalidation in `Hl7Message.invalidateCaches()`** (`src/model/message.ts:485-488`) — Phase 4 extends this function, NEVER touches the three mutation method bodies (they already call it).
2. **`exactOptionalPropertyTypes` → omit-when-absent** — see every composite parser (`src/model/types/xpn.ts:75-122`). Never set keys to explicit `undefined`.
3. **`Object.freeze` at the boundary** (`src/model/message.ts:138`) — helper outputs are frozen at the top level per D-01.
4. **Compose on Phase 3 public surface, NEVER walk `rawSegments`** (CONTEXT.md §domain lines 37–40). Any new primitive the helpers need becomes a new public method on `Hl7Message` with tests.
5. **Silent reads (no warnings, no throws) at the helper layer** (D-21 / D-22). Helpers are the "one line of code" north-star surface. If `parseHL7` already emitted a warning, it's on `msg.warnings` — helpers don't re-surface.
6. **Flat `Date | undefined` at helper layer** (D-18) — deviation from Phase 3's `{ raw, date }` TS shape, confined to the helper layer. Raw string still reachable via `msg.get()` or `Field.asTs().raw`.
7. **MRN pick isolated to `pick-mrn.ts`** (CONTEXT.md §integration_points) — Phase 6 profile override hook. Don't inline into `patient.ts`.
8. **ESLint `jsdoc/require-example` on every public export** (`eslint.config.js:83-90`) — every new helper type, getter, method needs an `@example`. Builder functions marked `@internal` are exempt.
9. **`consistent-type-assertions: objectLiteralTypeAssertions: "never"`** — no `{ ... } as Meta` style casts on object literals. Use `Mutable<T>` + conditional assignment + `return out`.
10. **File-level JSDoc must NOT start with `@...`** (Phase 1 Rule-1) — prose first line on every new file.
11. **`noUncheckedIndexedAccess` discipline** — every `arr[i]` is `T | undefined`; always guard or use `?.` chains. See `src/model/field.ts:102-110` for the canonical 4-level descent.
12. **Coverage target ≥ 90% on `src/helpers/`** (CLAUDE.md) — every helper function and every value-type branch in observations needs a dedicated test case.
