# Phase 3: Structural Model & Types — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 turns the `Hl7Message` shell (built in Phase 2) into a navigable, typed model. It ships:

- **Three read paths** over the raw positional tree produced by Phase 2:
  1. Dot-path — `msg.get('PID.5.1')`, `msg.getAll('NK1')`, `msg.get('OBX[2].5')`, `msg.get('PID.3[0].1')`
  2. Segment iteration — `msg.segments('OBX')`, `msg.segments('OBX')[0].field(3)`, `msg.allSegments()`
  3. Structural walk — the raw tree stays reachable via `seg.fields`, `field.repetitions`, `rep.components`, `comp.subcomponents` (already exposed in Phase 2)
- **Typed composite interfaces and lazy coercions** for XPN, XAD, CX, CWE, CE, XTN, PL, TS/DTM, NM, HD — exposed via `field.asXpn()` / `.asXad()` / `.asCx()` / `.asCwe()` / `.asCe()` / `.asXtn()` / `.asPl()` / `.asTs()` / `.asNm()` / `.asHd()`.
- **TS/DTM → JS `Date`** using the existing Phase 2 `parseHl7Timestamp` cascade; raw string always preserved on the returned composite.
- **Mutation surface** — `msg.setField(path, value)`, `msg.addSegment(name, fields)`, `msg.removeSegment(...)` — in-place, chainable, minimal validation.

**In scope:**
- Dot-path parser (tokenizer + resolver) with `PID.5.1`, `PID.5.1.1`, `OBX[2].5`, `PID.3[0].1` forms
- `msg.get(path): string | undefined`, `msg.getAll(segmentType): Segment[]`, `msg.segments(type): Segment[]`, `msg.allSegments(): Segment[]`
- `Segment` wrapper class — `type`, `fields`, `field(n): Field`
- `Field` wrapper class — `isNull`, `repetitions`, `value` (first-rep convenience), plus the 10 `.asXxx()` typed-composite coercions
- Typed composite interfaces (XPN, XAD, CX, CWE, CE, XTN, PL, TS/DTM, NM, HD) exported as named types and re-exported under an `HL7` namespace
- Composite parsers that consume a `RawComponent[]` (or a `RawRepetition`) plus `EncodingCharacters` and return the typed shape
- TS/DTM composite with `.raw: string` and `.date: Date | undefined` via the existing `parseHl7Timestamp` cascade
- `setField(path, value)` / `addSegment(name, fields)` / `removeSegment(matcher)` mutating the underlying tree in place, returning `this` for chaining
- Auto-unescape on dot-path reads (using existing `unescape()` + `encodingCharacters`)

**Out of scope (belongs to later phases):**
- `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` — Phase 4
- `toString()`, `toJSON()`, `prettyPrint()`, `buildMessage()` — Phase 5
- Profile application to reads (custom-segment named-field lookups) — Phase 6 (Phase 3 may stub `segments('ZPI')[0].get('encounterId')` path-aware lookup as an internal hook; fixtures land in Phase 6)
- Canonical round-trip fixture sweep — Phase 7
- Vendor-quirks fixture library — Phase 7

</domain>

<decisions>
## Implementation Decisions

### Dot-Path Semantics

- **D-01: Indexing convention is 0-indexed `[N]` for BOTH segment repeats and field repeats.** `msg.get('OBX[2].5')` = third OBX, 5th field (per MODEL-01 lock). `msg.get('PID.3[0].1')` = first repetition of PID-3, first component. One rule everywhere; no "segment reps are 0-indexed but field reps are 1-indexed" mental tax. Omitting `[N]` on a field means "first repetition" (index 0).
- **D-02: Dot-segments are 1-indexed against HL7 convention.** `PID.5` = PID-5, `PID.5.1` = PID-5 component 1, `PID.5.1.1` = PID-5 subcomponent 1 of component 1. Matches the 1-indexed `RawSegment.fields` convention already locked in Phase 2 (`types.ts` line 224: `fields[0]` is the segment name / separator placeholder slot).
- **D-03: `msg.get(path)` returns an auto-unescaped string, or `undefined` when the path doesn't resolve.** HL7 escapes (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`, `\X..\`, `\Z..\`) are decoded via the existing Phase 2 `unescape()` helper using `msg.encodingCharacters`. Never throws on missing path (MODEL-05).
- **D-04: Subcomponent depth collapses when absent.** If `PID.5` is a plain component with no `&` subcomponents, `msg.get('PID.5.1.1')` returns the component string, not `undefined`. Treats "first subcomponent of a component with no subcomponent separators" as "the component itself". Matches HL7 lenient spirit and real-world vendor messages.
- **D-05: `msg.get('MSH.1')` returns the field-separator character (e.g. `'|'`); `msg.get('MSH.2')` returns the encoding-characters string (e.g. `'^~\\&'`).** MSH.N for N≥3 returns the Nth field as usual. This preserves spec alignment and the illusion of dot-path universality — users don't need a special case for MSH.
- **D-06: Leaf return type is always `string | undefined`.** `get()` never returns structured objects (no discriminated-union by path depth). For structured access the caller drops to the wrapper API (`msg.segments('PID')[0].field(5)`) or uses a typed composite coercion (`.asXpn()`).
- **D-07: `getAll(segmentType)` returns `Segment[]`.** When no segment of that type exists, returns `[]` (not `undefined`, per MODEL-02). Semantics: equivalent to `msg.segments(type)`. Keep `getAll` focused on segments; dot-path value access stays on `get()`.

### Typed Composite Access

- **D-08: Composites are obtained via explicit `.asXxx()` coercions on the `Field` wrapper.** `msg.segments('PID')[0].field(5).asXpn()` → typed `XPN`. Ten coercions ship: `.asXpn()`, `.asXad()`, `.asCx()`, `.asCwe()`, `.asCe()`, `.asXtn()`, `.asPl()`, `.asTs()`, `.asNm()`, `.asHd()`. No auto-typed field dictionary, no top-level `parseXpn()` helpers — one discoverable, IntelliSense-friendly API surface.
- **D-09: Composite parsing is lazy on-demand.** Composites are NOT parsed at `parseHL7` time. Each `.asXxx()` call parses the `RawComponent[]` / `RawRepetition` on the fly. No memoization in v1 — even though wrappers are cached (D-11), repeated `.asXpn()` calls re-parse. Keeps the hot path (`parseHL7` → first read) minimal for large ORU messages where most fields are never read.
- **D-10: Composite parsing reuses Phase 2 infrastructure.** `TS/DTM` delegates to the existing `parseHl7Timestamp(raw, opts)` cascade — no duplicate date logic. All composites receive `EncodingCharacters` so they can handle already-unescaped vs raw text consistently. Zero new runtime deps — pure stdlib + internal helpers.
- **D-11: Segment wrappers are cached.** `msg.segments('OBX')[0] === msg.segments('OBX')[0]` — referentially stable across calls. Wrapper arrays are built lazily on first `segments(type)` / `allSegments()` call and cached per-message. This enables React keys-by-reference, equality checks, and future memoization if we add it. The cache is invalidated when mutation occurs (see D-16).
- **D-12: Field wrappers are derived from cached Segment wrappers and also stable.** `seg.field(3) === seg.field(3)` — same Field instance per position. Enables future composite memoization via `WeakMap<Field, XPN>` if performance profiling in Phase 7 shows it matters.
- **D-13: Typed composite interfaces are named exports AND re-exported under an `HL7` namespace.** `import type { XPN, XAD, CX } from '@cosyte/hl7-parser'` works; `import { HL7 } from '@cosyte/hl7-parser'; type T = HL7.XPN` also works. One extra namespace re-export, minimal cost. Lives in a new `src/model/types/` directory (one file per composite) to keep file sizes sane.
- **D-14: `TS/DTM` composite shape is `{ raw: string; date: Date | undefined }`.** Always carries the raw HL7 string (TYPES-03 requirement). `date` is `undefined` when `parseHl7Timestamp` returns `undefined`, i.e. shape mismatch AND all user `dateFormats` + built-in fallbacks fail (D-23). No throw. Partial dates (`YYYY`, `YYYYMM`, `YYYYMMDD`) that match the HL7 shape produce valid `Date` values at midnight UTC (D-21, D-22).

### Mutation & Immutability

- **D-15: Mutation methods mutate in place and return `this`.** `msg.setField('PID.8', 'F').addSegment('NTE', ['', 'note text']).removeSegment(...)` is the intended shape. Ergonomic for the typical HL7 workflow (parse → touch up → serialize). Respects CLAUDE.md's "Mutation only via explicit methods."
- **D-16: The raw segment tree is mutable through the mutation API; `msg.warnings` stays frozen.** Phase 2's D-07 ("readonly, frozen array of `Hl7ParseWarning`") is preserved — mutations don't emit warnings, and callers can't push to `warnings`. The segments tree, however, is no longer treated as structurally frozen internally; mutation methods reassign array slots / splice directly. Phase 2's constructor continues to freeze `warnings`, but does NOT deep-freeze `segments` (it never did).
- **D-17: Mutation invalidates the Segment/Field wrapper cache for the affected segment type.** After `addSegment('NTE', ...)` the cached `segments('NTE')` array is dropped; the next call rebuilds. Keeps referential equality honest — consumers who stored a wrapper reference may see it detached if the underlying segment was removed. Document this plainly: "hold mutation calls and wrapper references apart."
- **D-18: `setField` validation is minimal.** The path must parse (else throw a `TypeError` with a clear message); the value is accepted verbatim as a string. Unescaped delimiter characters are NOT rejected on input — the Phase 5 serializer is responsible for re-escaping on `toString()` (Postel's Law: conservative on output, not on mutation input). This keeps mutation fast, keeps the "one line of code" DX honest, and centralizes escape safety in the serializer.
- **D-19: `addSegment(name, fields)` validates segment-name shape only.** `name` must be three uppercase ASCII letters (HL7 convention) OR match the `Z[A-Z0-9]{2}` Z-segment form — else throw `TypeError`. `fields` is accepted as `readonly (string | RawField)[]`. No deep validation.
- **D-20: No dirty flag / version counter.** `toString()` (Phase 5) walks the current tree on each call. Mutation is silent from the observer's perspective — no `isDirty`, no `version`, no change events. If Phase 5 needs serialization caching later it can add a WeakMap by tree-root identity; Phase 3 ships nothing.

### Timestamp TS/DTM Policy

- **D-21: No-offset TS/DTM values are interpreted as UTC.** Aligns with existing Phase 2 behavior (`src/parser/dates.ts` line 72–73 already documents "Timestamps without an explicit timezone offset are interpreted as UTC, so round-trips via `toISOString()` are stable across host time zones"). Phase 3 does not change `parseHl7Timestamp`; it just surfaces its output on `TS/DTM.date`.
- **D-22: Truncations above day resolve to midnight at the resolved timezone.** `YYYYMMDD` → `00:00:00.000` in the resolved TZ (UTC when no offset per D-21, otherwise the specified offset). `YYYYMM` → first-of-month `00:00:00.000`. `YYYY` → January 1 `00:00:00.000`. Predictable, ISO-8601-like, matches `Date.UTC` constructor semantics.
- **D-23: Fractional seconds truncate to 3 digits.** `.12345` → `123` ms. Matches JS `Date` millisecond precision. The `.raw` string preserves full precision for consumers that need it. No warning on excess precision — this stays quiet (not part of the TOL-03 warning registry; adding a new code is out of scope for Phase 3).
- **D-24: `TS/DTM.date === undefined` iff the raw string doesn't match the HL7 TS shape AND doesn't match any of `opts.dateFormats` AND doesn't match any of `BUILTIN_DATE_FALLBACKS`.** Reuses the existing `parseHl7Timestamp` cascade exactly — Phase 3 adds zero new cutoff logic. Calendar-invalid values (Feb 30, month 13) that happen to match the shape produce `new Date(NaN)` — the composite treats `Number.isNaN(date.getTime())` as "unparseable" and sets `.date = undefined` to honor TYPES-04's no-throw guarantee (implementation detail: the composite wraps the existing helper's output and normalizes NaN to `undefined`).

### Claude's Discretion

- Exact internal shape of `Segment` / `Field` wrapper classes — public surface is locked by D-08..D-12; internal fields may be whatever is cleanest.
- Whether the dot-path parser is regex-based or hand-rolled tokenizer — constraint: zero runtime deps, must handle `PID.5.1`, `PID.5.1.1`, `OBX[2].5`, `PID.3[0].1`, and malformed paths (throw `TypeError` with useful message).
- Exact file layout under `src/model/` — e.g. `src/model/segment.ts` + `src/model/field.ts` + `src/model/types/xpn.ts` + ... vs a flatter layout. Keep one public entry (`src/index.ts`) as Phase 1/2 did.
- Whether composite parsers are free functions or class statics — surface is `.asXpn()` etc., but implementation can delegate anywhere.
- Whether to expose `parseXpn(raw, enc)` standalone helpers in addition to `.asXpn()` — optional; defer unless Phase 4 needs them internally and the extra export is cheap.
- How `removeSegment` selects matches — e.g. by index, by reference, by predicate, or all of these. Minimum viable: by segment name + 0-indexed occurrence, with `{ all: true }` option to remove all. Planner decides the exact signature.
- Whether `setField('ZPI.5', 'X')` on a segment that doesn't exist auto-creates the segment — recommendation: NO, throw (user must `addSegment` first). Planner confirms.
- Whether to memoize composite results after the first `.asXpn()` call — D-09 says no for v1, but if planner finds a clean `WeakMap<Field, XpnCache>` pattern the decision can revisit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints
- `.planning/PROJECT.md` — vision, Key Decisions (immutability by default, zero runtime deps, Postel's Law serializer)
- `CLAUDE.md` — Engineering Guardrails (no `any`, JSDoc `@example` on every public export, immutability, no `console.*`, strict TS + `noUncheckedIndexedAccess`)

### Requirements (locked acceptance criteria)
- `.planning/REQUIREMENTS.md` §Model & Access (MODEL-01 … MODEL-07)
- `.planning/REQUIREMENTS.md` §Data Types (TYPES-01 … TYPES-04)

### Roadmap & success criteria
- `.planning/ROADMAP.md` — Phase 3 "Structural Model & Types" goal, success criteria, parallelization notes (composite parsers are independent and parallelizable; traversal + resolver are serial; mutation is a capstone)
- `.planning/STATE.md` — Phase 2 accumulated decisions relevant to Phase 3

### Prior phase artifacts (Phase 2 — parser and warnings system)
- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` — Phase 2 decisions, especially D-05 (`Hl7Message` shell shape), D-07 (warnings frozen), D-08 (MSH metadata exposure limited to `encodingCharacters` + `version` in Phase 2)
- `.planning/phases/02-core-parser-and-tolerance/02-06-SUMMARY.md` — parseHL7 public entry + barrel exports in `src/index.ts`; strict-mode escalation path
- `.planning/phases/02-core-parser-and-tolerance/02-04-SUMMARY.md` — `unescape()` / `reescape()` in `src/parser/escapes.ts` (consumed by Phase 3's auto-unescape on dot-path reads)
- `.planning/phases/02-core-parser-and-tolerance/02-05-SUMMARY.md` — `parseHl7Timestamp` + `BUILTIN_DATE_FALLBACKS` in `src/parser/dates.ts` (consumed by Phase 3's TS/DTM composite)
- `.planning/phases/02-core-parser-and-tolerance/02-01-SUMMARY.md` — `Hl7Message` class, warnings registry, error classes (baseline for Phase 3's wrappers to extend without reshaping)

### Existing code surfaces (read to understand what's already there)
- `src/parser/types.ts` — `RawSegment`, `RawField` (with `isNull` discriminant), `RawRepetition`, `RawComponent`, `EncodingCharacters`, `ParseOptions`, `Profile` (note: `RawSegment.fields` is 1-indexed, `fields[0]` is the name/separator slot)
- `src/model/message.ts` — current `Hl7Message` shell (readonly fields, frozen warnings array, `profile` placeholder). Phase 3 extends this class with `get()`, `getAll()`, `segments()`, `allSegments()`, `setField()`, `addSegment()`, `removeSegment()`
- `src/parser/escapes.ts` — `unescape(raw, enc)` / `reescape(str, enc)` — consumed on dot-path reads
- `src/parser/dates.ts` — `parseHl7Timestamp(raw, opts)` cascade (HL7 TS → user `dateFormats` → `BUILTIN_DATE_FALLBACKS`); already documents no-offset → UTC
- `src/index.ts` — barrel of existing public exports; Phase 3 adds `Segment`, `Field`, typed-composite types + `HL7` namespace, but no subpath exports

### External specs (reference only — developer shouldn't need to read)
- HL7 v2.x specifications — not vendored. Composite shapes (XPN 14 components, XAD 12 components, CX 10 components, CWE 13 components, CE 6 components, XTN 14 components, PL 12 components, HD 3 components, TS/DTM single-string-with-offset, NM single-numeric-string) derived from HL7 v2.5.1 chapter 2 data type specs. The parser stays lenient to any component count (Postel's Law).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/parser/escapes.ts::unescape(raw, enc)` — Phase 3's dot-path `msg.get()` calls this directly, passing `msg.encodingCharacters`, to honor D-03 (auto-unescape on read).
- `src/parser/dates.ts::parseHl7Timestamp(raw, opts)` — Phase 3's `TS/DTM.asTs()` (and `Field.asTs()`) calls this. No need to re-implement the HL7 TS cascade or timezone logic.
- `src/parser/dates.ts::BUILTIN_DATE_FALLBACKS` — consumed implicitly via `parseHl7Timestamp`; not called directly in Phase 3.
- `src/model/message.ts::Hl7Message` — current shell. Phase 3 adds instance methods (`get`, `getAll`, `segments`, `allSegments`, `setField`, `addSegment`, `removeSegment`) and private wrapper caches. The constructor signature stays stable (Phase 2 D-05 lock).
- `src/parser/types.ts::RawSegment`, `RawField`, `RawRepetition`, `RawComponent` — the positional tree Phase 3 wraps and walks. `RawField.isNull` lets `get()` distinguish `""` (null field, returns literal `""` on `get` — or `undefined`?) from empty (returns `undefined`). Planner to confirm; the shipped spec (PARSE-06) says "distinguishes empty from null per HL7 spec semantics" — the read-path decision is how that surfaces to callers.
- `src/parser/warnings.ts` — factories available. Phase 3 traversal does not emit new warnings; the wrapper cache and composite parsers are silent.

### Established Patterns

- **Barrel export via `src/index.ts`:** Phase 3 adds named exports there (`Segment`, `Field`, typed-composite types, `HL7` namespace). All phases continue shipping through the single tsup entry.
- **1-indexed `RawSegment.fields`:** `fields[0]` is the segment-name / separator placeholder slot. Phase 3 dot-path translates `PID.5` → `fields[5]`, MSH.1 → `fields[0]` (the separator char), MSH.2 → `fields[1]` (encoding chars). D-05 in this CONTEXT.md.
- **Zero runtime deps:** composite parsers use stdlib only. No date libraries, no schema libs. Hand-rolled component/subcomponent split reusing the logic pattern already in `src/parser/tokenize.ts`.
- **Strict TS + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`:** every array access in wrappers and dot-path resolver must handle `undefined`. Composite shapes use optional fields that are omitted (not set to `undefined`) when absent.
- **Frozen warnings, mutable tree:** Phase 2's `Hl7Message` freezes only `this.warnings`. Phase 3 mutation can write into `this.segments` directly; no defrost needed. D-16.
- **JSDoc `@example` on every public export:** enforced by ESLint. Every new `Segment`, `Field`, composite type, and mutation method needs an `@example` block.
- **Test file convention:** `test/` directory with `*.test.ts`. Phase 3 adds `test/model-segment.test.ts`, `test/model-field.test.ts`, `test/model-dotpath.test.ts`, `test/model-mutation.test.ts`, `test/types-xpn.test.ts` (and one per composite).

### Integration Points

- `src/index.ts` — sole public entry; Phase 3 adds to the existing barrel.
- `Hl7Message` class in `src/model/message.ts` — Phase 3 extends this same class rather than subclassing. Phase 2 D-05 locked the constructor shape; Phase 3 only adds methods and private caches.
- `parseHL7` in `src/parser/index.ts` — NO change needed. It already returns a full `Hl7Message` with a populated `segments` tree. Phase 3 reads from that tree; the parser doesn't know Phase 3 exists.
- Phase 4's `msg.meta`, `msg.patient`, etc. will consume Phase 3's `.get()`, `.segments()`, and `.asXxx()` coercions. Phase 3's API must be expressive enough that Phase 4 is pure composition — no reaching into the raw tree.
- Phase 5's `toString()` will walk `this.segments` (post-mutation tree) and re-escape via `src/parser/escapes.ts::reescape`. Phase 3 doesn't track dirtiness (D-20) so Phase 5 does fresh walks.
- Phase 6 custom Z-segments will resolve via a profile-provided field-name dictionary against the same `Segment`/`Field` wrappers Phase 3 ships. The wrappers' API (`field(n)`, `.asXxx()`) must not assume segment-name dictionary knowledge.

</code_context>

<specifics>
## Specific Ideas

- The ten typed-composite coercions on `Field` are the full set for v1: **`.asXpn()`, `.asXad()`, `.asCx()`, `.asCwe()`, `.asCe()`, `.asXtn()`, `.asPl()`, `.asTs()`, `.asNm()`, `.asHd()`**. (TYPES-01 explicitly lists these.) CWE and CE are distinct composites — CWE has the full 13-component coded-with-exceptions shape; CE is the 6-component coded-element shape. Ship both, deduplicate behavior internally where practical.
- **Dot-path indexing examples that MUST pass** (use as acceptance tests during planning):
  - `msg.get('PID.5.1')` — component string, auto-unescaped
  - `msg.get('OBX[2].5')` — third OBX's 5th field
  - `msg.get('PID.3[0].1')` — first rep of PID-3, component 1
  - `msg.get('PID.3[1].1')` — second rep of PID-3, component 1
  - `msg.get('PID.5.1.1')` on a no-`&` field — returns the component string (depth collapse, D-04)
  - `msg.get('MSH.1')` — the field-separator char (`|` by default)
  - `msg.get('MSH.2')` — the encoding characters (`^~\&` by default)
  - `msg.get('MSH.12')` — HL7 version string (reuses Phase 2's MSH-12 extraction)
  - `msg.get('NOT.9.9')` on a missing segment — `undefined`
  - `msg.get('PID.99')` on an out-of-range field — `undefined`
- **TS/DTM composite shape** must be `{ raw: string; date: Date | undefined }` — exactly these two keys, no more, so Phase 4's `msg.meta.timestamp` and `msg.patient.dateOfBirth` unwrap it identically.
- **MODEL-06 (immutable by default) reconciliation with D-15/D-16:** The Hl7Message is NOT structurally frozen; it's immutable *by convention* — the only way to mutate is through `setField`/`addSegment`/`removeSegment`. Direct mutation of `msg.segments[0].fields[3]` is not blocked at runtime (the array isn't frozen), but is a documented violation and not supported. This matches CLAUDE.md's phrasing "mutation only via explicit methods" — the emphasis is on API discipline, not `Object.freeze` enforcement.
- **Segment-name Z-prefix acceptance:** `addSegment('ZPI', [...])` must accept Z-segments at the shape layer even though profile-driven Z-segment field-name resolution is Phase 6. Don't reject Z names.
- **Field wrapper `isNull` surfacing:** Field wrapper exposes `field.isNull: boolean` directly from `RawField.isNull`. Dot-path `get` on a null field — PLANNER TO DECIDE whether it returns `""`, the literal two-character `'""'`, or `undefined`. Recommendation: return `""` (empty string) on `get` — consistent with "auto-unescape string" type, preserves the distinction only at the structured-access layer (`field.isNull === true`). Raise this in planning if it conflicts with PARSE-06 tests.

</specifics>

<deferred>
## Deferred Ideas

- **Phase-6 custom Z-segment named-field lookups** (`msg.segments('ZPI')[0].get('encounterId')`): Phase 3 may leave a named-field hook on the Segment wrapper, but the profile-driven dictionary and PROF-07 semantics are Phase 6. Don't ship the dictionary here.
- **Composite result memoization** (`WeakMap<Field, XpnCache>`): D-09 says lazy-not-memoized for v1. Revisit if Phase 7 coverage or perf profiling shows hot re-parsing.
- **Standalone `parseXpn(raw, enc)` free-function exports**: only if Phase 4 helpers need them internally. Don't pre-export to v1 public API.
- **`setField` auto-creating missing intermediate structure**: throw-instead-of-create for v1 (planner confirms). Revisit if Phase 4 helpers find the friction.
- **Discriminated-union return types on `get()` by path depth**: rejected (D-06). Revisit only if v2 adds typed message overlays.
- **Composite `toString()` / round-trip fidelity on XPN/XAD/etc.**: belongs to Phase 5's serializer. Phase 3 composites are read-only views — serialization stays at the raw-tree level.
- **Line/column position tracking in wrapper errors (e.g. `setField` on bad path)**: not tracked. Throw with the path string itself; caller has enough to diagnose.
- **`TIMESTAMP_PRECISION_LOST` warning** on >3 digit fractional seconds (D-23 deferred this): not added. Would require a new TOL-03 code; out of scope.
- **Dirty flag / serialization cache** (D-20): deferred to Phase 5 if it proves needed.
- **v2 typed message overlays** (`msg.is('ADT^A01')` narrowing): roadmap, not v1.

</deferred>

---

*Phase: 03-structural-model-and-types*
*Context gathered: 2026-04-18*
