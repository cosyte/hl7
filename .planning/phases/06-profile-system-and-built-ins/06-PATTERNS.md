# Phase 6: Profile System & Built-ins — Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 19 (10 new `src/profiles/*` + 5 vendor profiles + test scaffolding; 5 modifications)
**Analogs found:** 18 / 19 (the no-analog case is the `default.ts` module-level `let` registry — no mutable module-state exists elsewhere in the codebase, so that pattern is drawn from RESEARCH.md conventions)

---

## File Classification

### New files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/profiles/define.ts` | factory / validator | transform (options → frozen Profile) | `src/builder/build-message.ts` | **exact** — validated-factory returning immutable data |
| `src/profiles/validate.ts` | utility (helpers) | transform (predicates + throw) | validation sites in `src/model/message.ts::setField`/`addSegment` + `src/builder/build-message.ts` | role-match |
| `src/profiles/merge.ts` | utility (pure functions) | transform (reducers over readonly arrays) | `src/helpers/meta.ts::buildMeta` (pure compose helper) | role-match |
| `src/profiles/default.ts` | module state (registry) | request-response (get/set) | no existing analog — first mutable module-scoped `let` in the codebase | none (see "No Analog Found") |
| `src/profiles/describe.ts` | utility (formatter) | transform (data → string) | `src/serialize/pretty-print.ts::emitPrettyPrint` | role-match — structured multi-line string from typed data |
| `src/profiles/epic.ts` | data (profile instance) | declaration | any small `src/model/types/*.ts` that wraps a single concept | role-match |
| `src/profiles/cerner.ts` | data (profile instance) | declaration | (same) | role-match |
| `src/profiles/meditech.ts` | data (profile instance) | declaration | (same) | role-match |
| `src/profiles/athena.ts` | data (profile instance) | declaration | (same) | role-match |
| `src/profiles/genericLab.ts` | data (profile instance) | declaration | (same) | role-match |
| `src/profiles/index.ts` | barrel | re-export | `src/index.ts` | exact |
| `test/profiles-define.test.ts` | test | unit | `test/builder.test.ts`, `test/parser-public.test.ts` | exact |
| `test/profiles-extends.test.ts` | test | unit | `test/builder.test.ts` | exact |
| `test/profiles-custom-segments.test.ts` | test | unit | `test/model-segment.test.ts` | exact |
| `test/profiles-default.test.ts` | test | unit + afterEach cleanup | `test/parser-public.test.ts` | role-match (no existing test touches mutable module state) |
| `test/profiles-builtins.test.ts` | test | fixture-parity integration | `test/round-trip.test.ts`, `test/helpers-meta.test.ts` | exact |
| `test/fixtures/vendor-shapes/<vendor>/*.hl7` | fixture data | declaration | existing `test/fixtures/**/*.hl7` (unseen but referenced) | role-match |

### Modified files

| Modified File | Role | Modification Type | Existing Pattern Source |
|---------------|------|-------------------|-------------------------|
| `src/index.ts` | barrel | add re-exports | `src/index.ts` itself (lines 23-133) — just appending |
| `src/parser/types.ts::Profile` | type | add optional `describe?` | existing interface extension (the file itself) |
| `src/model/segment.ts::Segment` | class | add `get(name)` method + optional constructor param | existing `field(n)` + `enc` constructor pattern in this file |
| `src/model/message.ts::Hl7Message` | class | store customSegments map + thread to Segment ctor | existing `encodingCharacters` threading pattern (lines 182-195, 273-283) |
| `src/parser/index.ts::parseHL7` Step 11 (tokenize invocation) | orchestration | add `UNKNOWN_SEGMENT` emit + profile suppression | **new emit site** — nothing currently emits `UNKNOWN_SEGMENT` in the pipeline |
| `src/parser/index.ts::parseHL7` Step 12/13 | orchestration | merge dateFormats + wire customSegments + onWarning chain + default profile | existing Step 13 pattern (lines 383-411) |

---

## Pattern Assignments

### `src/profiles/define.ts` (factory, transform)

**Analog:** `src/builder/build-message.ts::buildMessage`

Phase 5's `buildMessage` is the closest analog: a validated factory that takes an options object, runs multi-stage validation with typed throws, synthesizes structured data with sensible defaults, and returns a frozen immutable result. Every Phase 6 decision (D-01..D-08) maps directly onto this shape.

**Imports pattern** (`src/builder/build-message.ts` lines 34-39):
```typescript
import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";

import { generateControlId } from "./control-id.js";
import { formatHl7Timestamp } from "./format-timestamp.js";
```
Note: absolute-from-src path style with `.js` extensions; type imports separated; local helpers imported below. Phase 6 `define.ts` should follow this exact layout with its own `./merge.js`, `./validate.js`, `./describe.js` helpers.

**Options interface pattern** (`src/builder/build-message.ts` lines 73-106):
```typescript
export interface BuildMessageInit {
  readonly type: string;
  readonly sendingApp?: string;
  // ... all optional fields use `readonly ... ?: T`
}
```
Phase 6 `DefineProfileOptions` (D-02) should mirror this exactly — `readonly` on every field, `?:` for optionals, JSDoc block with `@example` on the interface itself plus per-field JSDoc where semantics need clarifying.

**Factory signature + validation pattern** (`src/builder/build-message.ts` lines 156-187):
```typescript
export function buildMessage(init: BuildMessageInit): Hl7Message {
  // D-16 validation: type must be a non-empty, non-whitespace string.
  // `init` may be `null`/`undefined` at runtime if a JS caller bypasses the
  // type — guard defensively.
  if (
    init === null ||
    init === undefined ||
    typeof init.type !== "string" ||
    init.type.trim().length === 0
  ) {
    throw new TypeError(
      "buildMessage: `type` is required and must be a non-empty string " +
        '(e.g. "ADT^A01" or "ORU^R01^ORU_R01"). ' +
        `Received: ${JSON.stringify(init === null || init === undefined ? init : init.type)}.`,
    );
  }

  // WR-04: tighten D-16 — split on `^` and reject a string whose every
  // component is empty/whitespace ...
  const typeParts = init.type.split("^");
  if (typeParts.every((p) => p.trim().length === 0)) {
    throw new TypeError(
      "buildMessage: `type` must contain at least one non-empty component " +
        ...
    );
  }
```
**Copy this pattern verbatim for `defineProfile`**:
- Defensive `init === null || init === undefined` guard first.
- Multiple validation passes, each throws a typed error with an actionable message ending in `Received: ${JSON.stringify(...)}`.
- Phase 6 swaps `TypeError` → `ProfileDefinitionError` and adds the profile name as the second ctor arg where known (see errors.ts pattern below).

**Output-object assembly pattern** (`src/builder/build-message.ts` lines 188-248):
```typescript
const enc = DEFAULT_ENCODING_CHARACTERS; // D-14
const tsString: string = resolveTimestamp(init.timestamp);
const controlId = init.controlId ?? generateControlId();
const version = init.version ?? "2.5";
const processingId = init.processingId ?? "P";

// Build MSH fields[0..11] per the positional mapping ...
const mshFields: RawField[] = [ /* ... */ ];
const mshSegment: RawSegment = { name: "MSH", fields: mshFields };
return new Hl7Message({ /* ... */ });
```
Phase 6 assembles the frozen Profile object the same way — resolve each input, compute derived fields (lineage via D-03, merged dateFormats via D-10, merged customSegments via D-11, composed onWarning via D-12), then wrap in `Object.freeze({...})` with `describe` attached as a method (see `describe.ts` pattern).

**Frozen-object-with-method pattern** — inline this, since `buildMessage` returns a class instance (different from Phase 6's plain-data requirement). Phase 6 shape:
```typescript
const profile = {
  name: opts.name,
  description: opts.description,   // omit if undefined — exactOptionalPropertyTypes
  lineage,
  dateFormats,
  customSegments,
  onWarning: composedHandler,       // omit if undefined
  describe() { return buildDescribe(this); },
} as const;
return Object.freeze(profile);
```
The `as const` + `Object.freeze` pair is consistent with how `WARNING_CODES` (src/parser/warnings.ts:26-40) and `FATAL_CODES` (src/parser/errors.ts:31-36) preserve narrow string literal types.

**Internal-helper pattern** (`src/builder/build-message.ts` lines 253-301):
```typescript
/**
 * D-13: `Date` formats to HL7 `YYYYMMDDHHmmss` UTC; string passes through
 * verbatim; omitted defaults to `formatHl7Timestamp(new Date())`.
 * @internal
 */
function resolveTimestamp(ts: Date | string | undefined): string {
  ...
}
```
Every private helper has a one-line JSDoc plus `@internal`. Phase 6's merge, validate, describe helpers follow this exactly.

**JSDoc + @example pattern** (`src/builder/build-message.ts` lines 108-155):
```typescript
/**
 * Construct an outbound `Hl7Message` from semantic MSH fields (SER-06).
 * ...
 *
 * @example
 * ```ts
 * import { buildMessage, parseHL7 } from "@cosyte/hl7-parser";
 * const msg = buildMessage({
 *   type: "ADT^A01",
 *   ...
 * });
 * ```
 */
```
**Mandatory for every public export** per CLAUDE.md + ESLint `require-example`. Phase 6 `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, and every built-in profile need an `@example` block in JSDoc.

---

### `src/profiles/validate.ts` (utility, transform)

**Analog:** `src/model/message.ts::addSegment` validation (lines 633-639) + `src/builder/build-message.ts` validation (lines 160-186)

**Segment-name regex pattern** (`src/model/message.ts` line 56):
```typescript
const SEGMENT_NAME_RE = /^[A-Z][A-Z0-9]{2}$/u;
```
Phase 6 D-05 uses `/^Z[A-Z0-9]{2}$/u` — drop-in variant of this exact shape. Define as a module-level `const` with `@internal` JSDoc.

**Typed-error throw pattern** (`src/model/message.ts` lines 634-639):
```typescript
if (!SEGMENT_NAME_RE.test(name)) {
  throw new TypeError(
    `addSegment: invalid segment name "${name}". ` +
      `Expected 3 chars matching [A-Z][A-Z0-9]{2} (e.g. "PID", "PV1", "OBX", "ZPI").`,
  );
}
```
Phase 6 replaces `TypeError` with `ProfileDefinitionError(message, profileName)`. Keep the same message structure: subject + `"value"` + expected shape + example.

**ProfileDefinitionError usage** (`src/parser/errors.ts` lines 128-143):
```typescript
export class ProfileDefinitionError extends Error {
  public readonly profileName: string | undefined;

  public constructor(message: string, profileName?: string) {
    super(message);
    this.name = "ProfileDefinitionError";
    this.profileName = profileName;
  }
}
```
Every throw site in `validate.ts` passes the offending profile's `name` as the second arg. Example:
```typescript
throw new ProfileDefinitionError(
  `Profile '${opts.name}' declares customSegments for '${key}' — only Z-segments ` +
    `(Z[A-Z0-9]{2}) are allowed in v1. Typed overlays are a v2 feature.`,
  opts.name,
);
```

**Levenshtein helper pattern (D-07)** — no existing analog; new code. Keep ≤15 LoC. Inline at the bottom of `validate.ts` with `@internal`. Pattern for the `did-you-mean` message follows the "Expected X — got Y — did you mean Z?" convention used in `Hl7Message.setField` (line 538):
```typescript
throw new TypeError(
  `setField: segment "${parsed.segmentType}" (occurrence ${...}) not found. ` +
    `Add it first with addSegment("${parsed.segmentType}", [...]).`,
);
```

**Date-format token validation** — new logic, but the token set comes directly from `src/parser/dates.ts` lines 215, 223-230:
```typescript
const TOKENS = ["YYYY", "MM", "DD", "HH", "mm", "ss"] as const;
const TOKEN_LENGTHS: Readonly<Record<(typeof TOKENS)[number], number>> = { /* ... */ };
```
Phase 6 D-08 validator should import or duplicate this token list (plus `SSSS`) and check `format.match(/YYYY|MM|DD|HH|mm|ss|SSSS/u)` — throws if no token matches. **Recommendation:** extend `src/parser/dates.ts` with an exported `SUPPORTED_DATE_TOKENS: readonly string[]` and import from there; keeps the canonical list in one place (follows the DRY spirit of TS composite D-10 "zero duplicate date logic" in ts.ts lines 4 and 14).

---

### `src/profiles/merge.ts` (utility, transform)

**Analog:** `src/helpers/meta.ts::buildMeta` (small pure compose helper building frozen output)

**Readonly-array dedup pattern** — no exact analog; new code. Canonical shape based on the `parseHL7 Step 13` lineage defaulting pattern at `src/parser/index.ts` line 389:
```typescript
lineage: profileOpt.lineage ?? [profileOpt.name],
```
Phase 6 `mergeLineage` extends this: flatten parents' lineages + append child name, then dedupe preserving first occurrence. Use a `Set` for dedup tracking:
```typescript
function mergeLineage(parents: readonly Profile[], selfName: string): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parents) {
    for (const n of p.lineage ?? [p.name]) {
      if (!seen.has(n)) { seen.add(n); out.push(n); }
    }
  }
  if (!seen.has(selfName)) out.push(selfName);
  return Object.freeze(out);
}
```
Matches the "first-occurrence wins" rule (D-03, D-10).

**Object-map merge pattern** — no direct analog for deep-merge-by-position; new helper `mergeCustomSegments`. Inline and keep small per D-11 "one non-trivial merge case". Test pattern from `test/helpers-meta.test.ts` drives the shape:
- Given `parent: { ZPI: { fields: { a: 3 } } }` and `child: { ZPI: { fields: { b: 5 } } }`, output `{ ZPI: { fields: { a: 3, b: 5 } } }`.
- Conflict on position → child wins (D-11).
- After merge, re-run D-05 + D-06 validators.

**onWarning chain composition (D-12)** — closure-based composer, no direct analog. Pattern:
```typescript
function composeOnWarning(
  handlers: readonly OnWarningCallback[],
): OnWarningCallback | undefined {
  if (handlers.length === 0) return undefined;
  return (w) => {
    for (const h of handlers) {
      try { h(w); } catch { /* D-12: silently swallow */ }
    }
  };
}
```
Inspiration: `src/parser/index.ts::makeEmitter` (lines 97-127) already composes warning handling in a closure; Phase 6 extends that composition style to the profile lineage.

**Scalar last-wins merge** — trivial; use `??`-chain:
```typescript
const description = child.description ?? lastNonUndefined(parents, "description");
```

---

### `src/profiles/default.ts` (registry, request-response)

**No direct analog.** This is the first mutable module-scoped state in the codebase. Pattern is drawn from D-18 + standard TS idioms. Recommended shape:

```typescript
import type { Profile } from "../parser/types.js";

/**
 * Process-scoped default profile (PROF-08 / D-18). Not shared across workers.
 * @internal
 */
let _defaultProfile: Profile | undefined = undefined;

/**
 * Register a process-scoped default profile that `parseHL7(raw)` will use
 * when no explicit profile is passed. Pass `null` to clear it.
 *
 * @example
 * ```ts
 * import { setDefaultProfile, profiles, parseHL7 } from "@cosyte/hl7-parser";
 * setDefaultProfile(profiles.epic);
 * const msg = parseHL7(raw);
 * console.log(msg.profile?.name); // "epic"
 * // In tests, clear between suites to avoid cross-test bleed:
 * // afterEach(() => setDefaultProfile(null));
 * ```
 */
export function setDefaultProfile(profile: Profile | null): void {
  _defaultProfile = profile ?? undefined;
}

/**
 * Return the current default profile, or `undefined` if none is registered.
 *
 * @example
 * ```ts
 * import { getDefaultProfile } from "@cosyte/hl7-parser";
 * const p = getDefaultProfile();
 * if (p !== undefined) console.log(p.name);
 * ```
 */
export function getDefaultProfile(): Profile | undefined {
  return _defaultProfile;
}
```

JSDoc mandates the `afterEach` test-hygiene note per CONTEXT.md "Claude's Discretion" + specifics.

---

### `src/profiles/describe.ts` (formatter, transform)

**Analog:** `src/serialize/pretty-print.ts::emitPrettyPrint` — same "structured multi-line string from typed data" role.

The `describe()` output spec (D-04) is a fixed line-per-field layout:
```
Profile 'epic'
  description: ...
  lineage: parent → child
  customSegments: 2 (ZDP, ZRS)
  dateFormats: 3
  onWarning: registered
```

Build with a `string[]` accumulator + `join("\n")`. Omit lines for absent fields (consistent with `buildMeta`'s "omit absent keys via exactOptionalPropertyTypes" pattern at `src/helpers/meta.ts` lines 38-40, 63, 67).

---

### `src/profiles/epic.ts` (and 4 siblings: cerner, meditech, athena, genericLab)

**Analog:** Any small `src/model/types/*.ts` data/declaration module (e.g. `ts.ts` shown above) — single-purpose file with JSDoc + `@example` + `as const` + one export.

**Recommended structure** (each of the 5 vendor files):
```typescript
/**
 * Epic Bridges Interconnect HL7 quirks. Covers non-HL7 date formats
 * (MM/DD/YYYY) and two commonly-used Z-segments (ZDP, ZRS).
 *
 * @example
 * ```ts
 * import { parseHL7, profiles } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw, profiles.epic);
 * const zdp = msg.allSegments().find(s => s.type === "ZDP");
 * console.log(zdp?.get("departmentCode")?.value);
 * ```
 */

import { defineProfile } from "./define.js";

export const epic = defineProfile({
  name: "epic",
  description: "Epic-specific quirks and ADT date formats",
  dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"],
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
    ZRS: { fields: { resultStatus: 1, statusDateTime: 2 } },
  },
});
```

**Import path recommendation** (CONTEXT.md Claude's Discretion): relative path to `./define.js` within the package — matches how `src/helpers/meta.ts` imports from `../model/message.js` rather than the public barrel.

**Barrel assembly** (`src/profiles/index.ts`):
```typescript
export { defineProfile } from "./define.js";
export { setDefaultProfile, getDefaultProfile } from "./default.js";
export type { DefineProfileOptions, CustomSegmentDefinition } from "./define.js";

import { epic } from "./epic.js";
import { cerner } from "./cerner.js";
import { meditech } from "./meditech.js";
import { athena } from "./athena.js";
import { genericLab } from "./genericLab.js";

export const profiles = { epic, cerner, meditech, athena, genericLab } as const;
```
Mirrors the `HL7` namespace pattern from `src/index.ts` line 99 (`export * as HL7 from "./model/types/namespace.js";`). D-26 explicitly rejects top-level re-export of individual profiles — only `profiles.epic` etc.

---

### `src/parser/types.ts::Profile` (type, modification)

**Pattern source:** existing interface extension in the same file.

**Current shape** (`src/parser/types.ts` lines 121-128):
```typescript
export interface Profile {
  readonly name: string;
  readonly description?: string;
  readonly lineage?: readonly string[];
  readonly dateFormats?: readonly string[];
  readonly customSegments?: Readonly<Record<string, unknown>>;
  readonly onWarning?: OnWarningCallback;
}
```

**Phase 6 additions:**
1. Tighten `customSegments` from `Record<string, unknown>` to the locked shape:
   ```typescript
   readonly customSegments?: Readonly<Record<string, CustomSegmentDefinition>>;
   ```
2. Add optional `describe?: () => string` (D-01).
3. Add `CustomSegmentDefinition` sibling interface in `src/profiles/define.ts` (NOT in `types.ts` — keeps the Phase 2 locked interface small):
   ```typescript
   export interface CustomSegmentDefinition {
     readonly fields: Readonly<Record<string, number>>;
   }
   ```

`DefineProfileOptions` also lives in `define.ts`, not `types.ts`.

---

### `src/model/segment.ts::Segment` (class, modification)

**Analog:** the existing `field(n)` + `enc` constructor param pattern in the same file.

**Current constructor pattern** (`src/model/segment.ts` lines 52-58):
```typescript
public constructor(raw: RawSegment, enc: EncodingCharacters, absoluteIndex: number) {
  this.raw = raw;
  this.type = raw.name;
  this.fields = raw.fields;
  this.enc = enc;
  this.absoluteIndex = absoluteIndex;
}
```

**Phase 6 extension:** add a fourth optional parameter for the per-segment customSegments slice (D-16). Planner's Claude's Discretion: slice (just the entry for this segment's name) is preferred over the whole map — smaller coupling surface.
```typescript
public constructor(
  raw: RawSegment,
  enc: EncodingCharacters,
  absoluteIndex: number,
  customFields?: Readonly<Record<string, number>>,
) {
  // existing assignments ...
  this.customFields = customFields;
}
```

**New `get(name)` method pattern** — mirrors the `field(n)` shape (`src/model/segment.ts` lines 82-99):
```typescript
public field(n: number): Field {
  if (this._fieldWrappers === undefined) {
    this._fieldWrappers = this.fields.map(
      (rf, i) =>
        new Field(rf, this.enc, {
          segmentIndex: this.absoluteIndex,
          fieldIndex: i,
        }),
    );
  }
  const idx = this.type === "MSH" ? n - 1 : n;
  const f = this._fieldWrappers[idx];
  return f ?? Field.empty(this.enc);
}
```

**Copy this structure for `get(name)` with D-14 differences:**
```typescript
/**
 * Return the `Field` at the profile-declared position for `name`, or
 * `undefined` when no custom mapping exists or the position is out of
 * range. Unlike `field(n)`, missing names return `undefined` (not
 * a synthetic empty Field) so typos surface instead of silently
 * resolving to empty string.
 *
 * @example
 * ```ts
 * const zpi = msg.allSegments().find(s => s.type === "ZPI");
 * console.log(zpi?.get("encounterId")?.value);
 * ```
 */
public get(name: string): Field | undefined {
  const position = this.customFields?.[name];
  if (position === undefined) return undefined;
  // Delegate to field(n) so Field-wrapper caching + MSH offset stays consistent.
  const f = this.field(position);
  // D-14: out-of-range → undefined, not synthetic-empty.
  return f.repetitions.length === 0 && !f.isNull ? undefined : f;
}
```

---

### `src/model/message.ts::Hl7Message` (class, modification)

**Analog:** existing `encodingCharacters` threading in the same file.

**How `encodingCharacters` flows today** (`src/model/message.ts` lines 182-195, 273-283):
```typescript
public constructor(init: Hl7MessageInit) {
  this.rawSegments = init.segments;
  this.encodingCharacters = init.encodingCharacters;
  this.version = init.version;
  this.warnings = Object.freeze(init.warnings.slice());
  this.profile = init.profile;
}

// ... later in allSegments():
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

**Phase 6 extension:** add a private field `_customSegments?: Readonly<Record<string, CustomSegmentDefinition>>` holding the merged map; extend `Hl7MessageInit` with an optional `customSegments` key; pass the per-segment slice into each `new Segment(...)` call:
```typescript
built.push(
  new Segment(
    raw,
    this.encodingCharacters,
    i,
    this._customSegments?.[raw.name]?.fields,
  ),
);
```

**Cache invalidation:** the existing `invalidateCaches()` method (`src/model/message.ts` lines 747-753) drops `_segmentsByType` / `_allSegments` on mutation. Phase 6 customSegments storage is set once at construction and never changes, so no cache-invalidation extension needed — but the `exactOptionalPropertyTypes` init pattern (lines 190-194) must be followed when `customSegments` is optional:
```typescript
// (init.customSegments may be absent, not undefined — follow the same
// discipline as init.profile at line 191-194)
if (init.customSegments !== undefined) {
  this._customSegments = init.customSegments;
}
```

---

### `src/parser/index.ts::parseHL7` (orchestration, modification)

**Analog:** existing Step 13 profile attribution (lines 383-411).

**Step 13 current pattern:**
```typescript
// Step 13: Profile attribution (PROF-08 opt-out: profile === null).
const profileOpt = options.profile;
const profileInit =
  profileOpt !== undefined && profileOpt !== null
    ? {
        name: profileOpt.name,
        lineage: profileOpt.lineage ?? [profileOpt.name],
      }
    : undefined;

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

**Phase 6 extensions:**

1. **Resolve the effective profile** (D-19/D-20): add a new helper at the top of Step 13:
```typescript
// D-19: explicit profile wins; `profile: null` opts out; omit falls back to default.
let effectiveProfile: Profile | undefined;
if (options.profile === null) {
  effectiveProfile = undefined;
} else if (options.profile !== undefined) {
  effectiveProfile = options.profile;
} else {
  effectiveProfile = getDefaultProfile(); // D-18 module-level registry
}
```

2. **Merge dateFormats** (D-10/D-21) BEFORE Step 11 tokenize (so timestamp parsing sees the merged list). The tokenize step doesn't currently consume dateFormats — `parseHl7Timestamp` is called from the TS composite which doesn't pass user formats (src/model/types/ts.ts line 82). **Planner decision needed**: Either
   - (a) pass the merged `dateFormats` down through `Hl7MessageInit` → `Hl7Message` → `TS.ts`'s `parseHl7Timestamp` call, OR
   - (b) plumb them through a module-scoped or parser-scoped context object.

   Option (a) requires adding a `dateFormats` field on `Hl7Message` and extending `TS.ts` to read them — larger touch surface but cleaner dataflow. See `src/helpers/meta.ts` pattern for how helpers already reach into `Hl7Message` for contextual data.

3. **UNKNOWN_SEGMENT emit + suppression** (D-31): nothing currently emits this warning (confirmed via grep). The planner must add an emission site. Options:
   - (a) Add emit at the end of tokenize in `src/parser/tokenize.ts` for each non-standard segment name, with a suppression check against `options.profile?.customSegments`.
   - (b) Add emit in `src/parser/index.ts` between Steps 11 and 12, iterating `rawSegments` and checking each against a `KNOWN_SEGMENTS` set + profile customSegments.

   Option (b) keeps `tokenize.ts` profile-agnostic (matches the current separation — tokenize has no profile param). Planner picks. A `KNOWN_SEGMENTS` constant (the ~30 standard v2 segment names: MSH, PID, PV1, PV2, EVN, OBX, OBR, NTE, NK1, AL1, DG1, IN1, IN2, IN3, GT1, etc.) needs to be introduced — new constant, add to `src/parser/segments.ts` or a new `src/parser/known-segments.ts`. The emitted warning uses the existing factory:
   ```typescript
   import { unknownSegment } from "./warnings.js"; // src/parser/warnings.ts line 233
   emit(unknownSegment({ segmentIndex: i }, raw.name));
   ```

4. **onWarning chain composition** (D-12, D-22): the emitter at `src/parser/index.ts::makeEmitter` (lines 97-127) already calls `options.onWarning?.(w)` at line 125. Phase 6 wraps that — the `profile.onWarning` composed chain must fire BEFORE `options.onWarning`. Modify `makeEmitter` (or a sibling `makeProfileAwareEmitter`):
```typescript
return (w) => {
  if (options.strict === true) { /* existing throw path */ }
  warnings.push(w);
  // D-22: profile chain first (observes raw behavior)
  try { effectiveProfile?.onWarning?.(w); } catch { /* D-12 swallow */ }
  // then caller (observes post-profile behavior)
  options.onWarning?.(w);
};
```

5. **Thread customSegments to Hl7Message** (D-16): after merge at Step 13:
```typescript
const customSegments = effectiveProfile?.customSegments;
// pass into init. exactOptionalPropertyTypes: conditionally assign.
```

---

### Test files

**Analog:** Existing test files under `test/` all follow the same Vitest pattern.

**Standard header** (from `test/parser-public.test.ts` lines 1-14):
```typescript
import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import {
  parseHL7,
  Hl7Message,
  Hl7ParseError,
  WARNING_CODES,
  /* ... */
  type Profile,
} from "../src/index.js";
```
Note: import from `../src/index.js` (public surface) for integration tests; import from `../src/model/segment.js` directly for unit tests on specific modules (see `test/model-segment.test.ts` line 4).

**Happy-path assertion pattern** (from `test/parser-public.test.ts` lines 19-28):
```typescript
describe("parseHL7: happy paths", () => {
  it("parses a well-formed v2.5 message and exposes ...", () => {
    const msg = parseHL7(VALID_MSG);
    expect(msg).toBeInstanceOf(Hl7Message);
    expect(msg.version).toBe("2.5");
    expect(msg.rawSegments).toHaveLength(3);
    expect(msg.warnings).toHaveLength(0);
    expect(msg.profile).toBeUndefined();
  });
});
```

**Throw-assertion pattern** (from `test/parser-public.test.ts` lines 44-56):
```typescript
it("throws Hl7ParseError with code EMPTY_INPUT on empty input", () => {
  let caught: unknown;
  try {
    parseHL7("");
    expect.fail("should throw");
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Hl7ParseError);
  if (caught instanceof Hl7ParseError) {
    expect(caught.code).toBe(FATAL_CODES.EMPTY_INPUT);
  }
});
```
**Copy this for every Phase 6 `ProfileDefinitionError` throw test** (D-05..D-08) — substitute class + pattern for the expected message.

**Fixture-parity pattern** for `test/profiles-builtins.test.ts` (D-28):
```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixture = readFileSync(
  join(__dirname, "fixtures/vendor-shapes/epic/adt-a01.hl7"),
  "utf-8",
);

it("profiles.epic suppresses TIMESTAMP_FALLBACK_FORMAT on MM/DD/YYYY inputs", () => {
  const withoutProfile = parseHL7(fixture);
  const withProfile = parseHL7(fixture, profiles.epic);
  expect(withoutProfile.warnings.map((w) => w.code))
    .toContain("TIMESTAMP_FALLBACK_FORMAT");
  expect(withProfile.warnings.map((w) => w.code))
    .not.toContain("TIMESTAMP_FALLBACK_FORMAT");
});
```

**Test-isolation for setDefaultProfile** (CONTEXT.md specifics):
```typescript
import { afterEach } from "vitest";
afterEach(() => setDefaultProfile(null));
```
Every test file touching the default profile needs this.

---

## Shared Patterns

### Barrel export (src/index.ts)

**Source:** `src/index.ts` (entire file — the existing Phase 2/3/4/5 patterns).

**Apply to:** Phase 6 additions at the end of `src/index.ts`.

**Pattern** (from `src/index.ts` lines 23-133):
```typescript
export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
// Value exports from "./X.js"
// Type exports under a separate `export type { ... }` block
// Group per-phase with a comment header
```

**Phase 6 additions** (at the bottom of the file, matching the `// Phase 5:` style comment-header):
```typescript
// Phase 6: profile system + built-in vendor profiles.
// D-26: defineProfile/setDefaultProfile/getDefaultProfile are top-level values;
// built-ins are exposed under the `profiles` namespace object, not as
// top-level named exports (`epic` is too generic).
export {
  defineProfile,
  setDefaultProfile,
  getDefaultProfile,
  profiles,
} from "./profiles/index.js";
export type {
  DefineProfileOptions,
  CustomSegmentDefinition,
} from "./profiles/index.js";
```

### JSDoc with @example

**Source:** Every public export in `src/` (enforced by ESLint `require-example`).

**Apply to:** All Phase 6 public exports — `defineProfile`, `setDefaultProfile`, `getDefaultProfile`, `profiles`, `DefineProfileOptions`, `CustomSegmentDefinition`, and each built-in profile's top-level comment.

**Example** (from `src/parser/types.ts` lines 110-120):
```typescript
/**
 * Structural placeholder for HL7 profiles. A profile bundles ...
 *
 * @example
 * ```ts
 * import type { Profile } from "@cosyte/hl7-parser";
 * const epic: Profile = {
 *   name: "epic",
 *   description: "Epic-specific quirks and date formats",
 *   dateFormats: ["YYYYMMDDHHmmss", "YYYYMMDD"],
 * };
 * ```
 */
```

### Validation throws a typed error

**Source:** `src/parser/errors.ts::Hl7ParseError` + `src/parser/errors.ts::ProfileDefinitionError`.

**Apply to:** Every validator in `src/profiles/validate.ts` + every throw site in `defineProfile`.

**Pattern**: use `ProfileDefinitionError(message, profileName)`. Messages follow the `Hl7ParseError` style seen in `src/parser/index.ts` line 309:
```typescript
throw new Hl7ParseError(
  FATAL_CODES.EMPTY_INPUT,
  "Input is empty.",
  { segmentIndex: 0 },
  "",
);
```
Phase 6 equivalent:
```typescript
throw new ProfileDefinitionError(
  `Profile '${opts.name}' declares customSegments for '${key}' — only ` +
    `Z-segments (Z[A-Z0-9]{2}) are allowed in v1.`,
  opts.name,
);
```

### Immutability (Object.freeze + as const + readonly)

**Source:** `src/parser/warnings.ts` line 40 (`} as const;`); `src/parser/errors.ts` line 36; `src/serialize/to-json.ts` line 139 (`Object.freeze(out)`).

**Apply to:** `defineProfile()`'s return value — freeze the outer object. Inner `customSegments` and `dateFormats` are already `readonly` at the type level; match the "boundary-freeze at the top level only" pattern from `src/serialize/to-json.ts` line 136-139:
```typescript
// W5: boundary-freeze at the top level only. Inner arrays remain mutable
// at runtime by design (D-30 — deep-freeze rejected as hot-path cost with
// no observable benefit over the TS readonly type contract).
return Object.freeze(out) as SerializedMessage;
```
Phase 6 may optionally deep-freeze customSegments (small, one-time cost at define time — unlike the per-message hot path this guards) — Claude's Discretion.

### Zero runtime deps

**Source:** CLAUDE.md + `.planning/PROJECT.md` key decision.

**Apply to:** All Phase 6 files. Levenshtein helper inlined (~15 LoC per D-33). Token-matching reuses `src/parser/dates.ts`. No new external packages.

### exactOptionalPropertyTypes discipline

**Source:** Multiple in-file notes, e.g. `src/model/message.ts` lines 75-79:
```typescript
* @remarks
* With `exactOptionalPropertyTypes: true`, callers cannot pass
* `{ profile: undefined }` — either omit the key or pass a real profile
* descriptor.
```

**Apply to:** Every Phase 6 optional field. Never write `{ foo: undefined }`; conditionally assign:
```typescript
if (opts.description !== undefined) out.description = opts.description;
```
Model after `src/helpers/meta.ts` lines 38-73 which builds an object this way throughout.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/profiles/default.ts` | module state (mutable `let`) | request-response | No existing file uses mutable module-scoped state. The codebase is currently pure-functional + class-based. Pattern drawn from D-18 spec directly; JSDoc recommendations derived from `src/helpers/meta.ts` test-isolation mindset. |

The `UNKNOWN_SEGMENT` emit site is also novel — the factory exists at `src/parser/warnings.ts` line 233 but no current call site emits it. Phase 6 must introduce both the emit site AND the suppression check. Pattern for the emit site follows the existing `emit(fieldWhitespaceTrimmed(...))` call in `src/parser/tokenize.ts` line 202.

---

## Metadata

**Analog search scope:** `/home/nschatz/projects/cosyte/hl7-parser/src/` + `/home/nschatz/projects/cosyte/hl7-parser/test/`
**Files scanned:** 13 source files read; 3 test files read; 6 grep sweeps across src+test
**Pattern extraction date:** 2026-04-19

**Key load-bearing facts discovered during mapping:**
1. **`UNKNOWN_SEGMENT` is currently never emitted** — the factory exists but no pipeline step calls it. Phase 6 must introduce the emit site AND the profile suppression together.
2. **`parseHl7Timestamp` is called from `src/model/types/ts.ts` with empty options** (line 82) — user/profile dateFormats never reach the timestamp cascade today. Phase 6 needs a plumbing decision (see Step 13 pattern above).
3. **`ProfileDefinitionError` is already wired into `src/index.ts` exports** (line 25) — Phase 6 does not need to touch the barrel for error class re-exports.
4. **Profile attribution already lands at `src/parser/index.ts` lines 383-411** — Phase 6 extends Step 13; does not rewrite it.
5. **`Segment` constructor already takes 3 positional args** — Phase 6 adds a 4th optional positional (customSegments slice) rather than converting to an options object, preserving all existing Segment() callsites (`src/model/message.ts` line 279 + `test/model-segment.test.ts` line 23).
6. **`Hl7MessageInit.profile` is shaped `{ name, lineage }`, NOT a full `Profile`** (`src/model/message.ts` line 92) — D-30 keeps `toJSON().profile` limited to this shape. Phase 6 passes the merged customSegments through a SIBLING init key, not inside `profile`.
