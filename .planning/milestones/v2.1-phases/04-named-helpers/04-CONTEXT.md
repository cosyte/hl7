# Phase 4: Named Helpers — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 ships the **one-line DX** that is the project's north star. It composes Phase 3's
read surface (dot-path, segment wrappers, typed composite coercions) into named helpers on
`Hl7Message` so a developer can extract the 10% of HL7 fields they actually need without
touching segment/field numbers.

**In scope (HELPERS-01..07):**

- `msg.meta` — MSH-derived message metadata (`type`, `messageCode`, `triggerEvent`,
  `messageStructure`, `controlId`, `timestamp`, `version`, `sendingApp`, `sendingFacility`,
  `receivingApp`, `receivingFacility`, `processingId`).
- `msg.patient` — PID-derived patient record (`mrn`, `identifiers[]`, `name`, `familyName`,
  `givenName`, `middleName`, `fullName`, `dateOfBirth`, `sex`, `address`, `phoneNumbers[]`,
  `race`, `ethnicity`, `language`).
- `msg.visit` — PV1-derived visit info (`patientClass`, `location`, `admitDateTime`,
  `dischargeDateTime`, `attendingDoctor`, `referringDoctor`, `visitNumber`).
- `msg.observations()` — flat OBX iteration with typed `value` (via OBX-2 discriminator).
- `msg.orders()` — OBR iteration with OBX grouped positionally under each parent OBR.
- `msg.nextOfKin()` / `msg.allergies()` / `msg.diagnoses()` / `msg.insurance()` — typed
  collections (empty when source segments absent).

**Out of scope (belongs to later phases):**

- `toString()`, `toJSON()`, `prettyPrint()`, `buildMessage()` — Phase 5.
- Profile-driven Z-segment helper overrides (e.g. profile-specific patient field remaps) — Phase 6.
- Typed message overlays (`msg.is('ADT^A01')` narrowing to `AdtA01Message`) — v2.
- Vendor-quirk fixture coverage of helpers — Phase 7.
- Written cookbook recipes for helpers — Phase 8.

**Compose, don't reach through.** Helpers MUST build on Phase 3's public surface
(`msg.get()`, `msg.segments()`, `.asXxx()` composites). They must not walk `rawSegments`
directly. If a helper needs a new read primitive, it goes on `Hl7Message` as a public
method (with tests) rather than living inside the helper.

</domain>

<decisions>
## Implementation Decisions

### Return Shape & Caching

- **D-01: Object helpers return plain, deeply frozen objects.** `msg.meta`, `msg.patient`,
  `msg.visit` each return a typed plain object (no class methods). Fields are computed
  eagerly during object construction. `Object.freeze` applied at the top level; nested
  composite values (XPN/XAD/etc.) are already effectively frozen by Phase 3's "plain data"
  conventions. No `Patient` / `Meta` / `Visit` classes — keeps `console.log`, structured
  clone, and `toJSON()` (Phase 5) friction-free.
- **D-02: Helpers are memoized on first access with wholesale invalidation on mutation.**
  `msg.meta === msg.meta` across calls. Each helper gets a private cache slot on
  `Hl7Message` (`_meta`, `_patient`, `_visit`). The three existing mutation methods
  (`setField`, `addSegment`, `removeSegment`) MUST drop these slots in the same step where
  they drop the Phase 3 wrapper caches (Phase 3 D-17). This preserves referential
  stability for React / memoization / snapshot-testing consumers without adding a new
  invalidation surface.
- **D-03: `msg.meta` is always defined.** If MSH is missing, `parseHL7` already throws
  `NO_MSH_SEGMENT` (Phase 2 Tier-3). So `msg.meta: Meta` (not `Meta | undefined`).
  Individual metadata fields may be `undefined` (e.g. no MSH-9.2 triggerEvent on a rare
  message); the wrapper is always present.
- **D-04: `msg.patient` returns `undefined` when no PID segment exists.** Symmetric with
  `msg.visit` on missing PV1 (HELPERS-03 locks that). Callers use the same
  `msg.patient?.mrn` pattern as `msg.visit?.patientClass`. Rejects the "all-undefined
  patient object" alternative for consistency and to avoid the "why does ORM^O01 have a
  patient object?" surprise.
- **D-05: Collection helpers always return a typed array — `[]` when source segments are
  absent.** `msg.observations()`, `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`,
  `msg.diagnoses()`, `msg.insurance()` each have signature `(): readonly T[]`. Never
  `undefined`, never throws (HELPERS-06, HELPERS-07).
- **D-06: Collection helpers are NOT memoized in v1.** Each call re-walks segments. Cheap
  for typical message sizes (50 segments parses in < 5ms per PROJECT.md). Re-evaluate in
  Phase 7 if coverage profiling shows repeated calls in a hot path. Keeps invalidation
  simple — only the three object helpers (D-02) cache.

### MRN & Identifier Resolution

- **D-07: `patient.mrn` is the first PID-3 repetition whose CX-5 (identifier type code)
  equals `'MR'`.** This is the HL7 v2.5+ canonical marker for Medical Record Number.
  Scan happens left-to-right in document order.
- **D-08: Fallback — when no PID-3 repetition has CX-5='MR', return the first PID-3
  repetition's CX-1 (id string).** Matches the "pull useful fields out in one line"
  north star on vendor messages that skip the type-code. No warning emitted — helpers
  are silent reads (consistent with Phase 3 D-09 composite-parser silence). Callers who
  want strict MR resolution can walk `patient.identifiers` themselves.
- **D-09: `patient.identifiers` is `readonly CX[]`.** One entry per PID-3 repetition, each
  a fully-parsed CX composite from Phase 3 `Field.asCx()`. No second "friendlier"
  identifier shape — the CX composite already has `id`, `identifierTypeCode`,
  `assigningAuthority`, etc. Round-trip with Phase 5 serializer is trivial (identifiers
  are views, not copies).
- **D-10: MR-code matching is case-sensitive.** HL7 spec mandates uppercase codes. If real
  vendor messages turn out to send lowercase `'mr'`, revisit in Phase 6 via profile
  override rather than normalizing in the helper. Phase 4 stays strictly spec-aligned
  here to avoid silent behaviour differences.

### Observations & Orders Linkage

- **D-11: `msg.observations()` returns ALL OBX segments in document order.** Flat array,
  typed `Observation[]`. OBX segments that also appear inside an `msg.orders()[i].observations`
  group are returned in both places — same underlying data viewed two ways. Mental model:
  "all lab values" vs "orders with their lab values".
- **D-12: `msg.orders()` groups OBX under OBR positionally.** Walk segments top-to-bottom.
  Each OBR opens a new order group; every OBX segment that follows (until the next OBR,
  or until the message ends) belongs to that order. No use of OBX-4 (observation sub-ID)
  for cross-referencing — it is unreliably populated in the wild. OBX that appear BEFORE
  any OBR in the message are not attached to any order (they only show up in
  `msg.observations()`).
- **D-13: `observation.value` is a type-union discriminated by `valueType`.**
  - `valueType: 'NM'` → `value: number | undefined` (via `Field.asNm().value`)
  - `valueType: 'TS' | 'DT'` → `value: Date | undefined` (via `Field.asTs().date`)
  - `valueType: 'CWE' | 'CE'` → `value: CWE | CE | undefined` (full parsed composite)
  - Any other valueType (`ST`, `TX`, `FT`, `ID`, `IS`, `NA`, unknown) → `value: string | undefined`
    (raw, auto-unescaped string from `field(5).value`)
  - `undefined` when OBX-5 is empty/null. Matches the "typed by valueType" phrasing in
    HELPERS-04.
- **D-14: `observation.value` for CWE/CE is the full parsed composite.** Callers pick the
  useful piece (`obs.value?.identifier`, `obs.value?.text`). Does not flatten to a
  "code/text/system" short shape — that would diverge from what `Field.asCwe()` returns
  elsewhere.
- **D-15: Observation fields follow HELPERS-04's locked contract.** `setId` (OBX-1),
  `valueType` (OBX-2), `identifier: CWE` (OBX-3), `value` (OBX-5 parsed per D-13),
  `units: CWE | undefined` (OBX-6), `referenceRange: string | undefined` (OBX-7),
  `abnormalFlags: string | undefined` (OBX-8), `status: string | undefined` (OBX-11),
  `observedDateTime: Date | undefined` (OBX-14).
- **D-16: Order fields follow HELPERS-05's locked contract.** `placerOrderNumber: string | undefined`
  (OBR-2), `fillerOrderNumber: string | undefined` (OBR-3),
  `universalServiceId: CWE | undefined` (OBR-4), `orderStatus: string | undefined` (OBR-5
  or OBR-25 depending on version — planner confirms via message-type fixtures in Phase 7),
  `orderControl: string | undefined` (ORC-1 when ORC precedes OBR, else `undefined`),
  `orderedBy: XCN | undefined` (OBR-16 — requires an XCN type; see D-24 below),
  `observations: readonly Observation[]` (positionally grouped OBX per D-12).

### Name Composition & Date Shape

- **D-17: `patient.fullName` uses Western / US order: `'Given Middle Family, Suffix'`.**
  Built from XPN parts: `given` + (space + `middle`) + (space + `family`) +
  (`, ` + `suffix`). Missing parts are omitted cleanly (no double-spaces, no trailing
  comma). `undefined` when no usable parts. Raw XPN stays on `patient.name` for callers
  who want canonical HL7 ordering or locale-specific composition.
- **D-18: Helper-level dates are `Date | undefined`, NOT `{ raw, date }`.** Helpers are
  the "one line of code" surface — `msg.meta.timestamp.toISOString()` should just work,
  not `msg.meta.timestamp.date?.toISOString()`. Applies to `meta.timestamp`,
  `patient.dateOfBirth`, `visit.admitDateTime`, `visit.dischargeDateTime`,
  `observation.observedDateTime`. Raw string remains reachable via `msg.get('PID.7')` /
  `msg.segments('PID')[0].field(7).asTs().raw`. This deviation from Phase 3 D-14's
  `{raw, date}` shape is intentional and confined to the helper layer.
- **D-19: Name sub-fields ship exactly as HELPERS-02 locks.** `name: XPN`,
  `familyName: string | undefined`, `givenName: string | undefined`,
  `middleName: string | undefined`, `fullName: string | undefined`, `address: XAD | undefined`.
  No additional flattened XPN/XAD sub-fields (no `patient.street`, `patient.city`).
  Callers destructure `patient.address` for XAD parts.
- **D-20: `phoneNumbers` is `readonly XTN[]`.** PID-13 (home phone) + PID-14 (business
  phone) repetitions, each parsed via `Field.asXtn()`, concatenated in that order. Empty
  array when both PID-13 and PID-14 are absent/empty. No separate `.homePhone` /
  `.workPhone` flat shortcuts — callers can filter by `XTN.useCode`.

### Shared Helper Conventions

- **D-21: Helpers never emit warnings.** They are read-only views (like Phase 3's `.get()`
  and composite coercions). No new `WarningCode` added in Phase 4. If `parseHL7` emitted
  a warning about the underlying data, it's already on `msg.warnings`; helpers don't
  re-surface it.
- **D-22: Helpers never throw.** Any absent or malformed field returns `undefined` (or
  `[]` for collections, per HELPERS-07). Even invalid timestamps (unparseable TS → `date
  === undefined`, already Phase 3 D-24) surface as `undefined` rather than `Invalid Date`
  or throws.
- **D-23: Strings returned by helpers are auto-unescaped, consistent with Phase 3 D-03.**
  `patient.givenName` returns the decoded value (e.g. `'O\'Brien'` for `O\\F\\Brien` raw).
  Achieved by routing reads through `msg.get()` or `Field.value` (which already
  unescape in Phase 3).
- **D-24: XCN composite is deferred to planning.** HELPERS-03 calls for
  `attendingDoctor: XCN`, but XCN was NOT in the Phase 3 v1 ten-composite set (Phase 3
  shipped XPN/XAD/CX/CWE/CE/XTN/PL/TS/NM/HD only). Phase 4 planner MUST decide: either
  (a) add an XCN parser as an 11th composite in Phase 4 (with a `Field.asXcn()`
  coercion and an `HL7.XCN` type), or (b) expose attending/referring doctors as the
  raw first-component string with the XPN-shaped subset fields flat on the visit object.
  Recommendation: option (a) — XCN is structurally XPN + ID fields prefix, so the parser
  can delegate. This keeps the helper layer pure composition.

### Claude's Discretion

- Exact file layout under `src/helpers/` (e.g. `src/helpers/meta.ts`, `src/helpers/patient.ts`,
  `src/helpers/observations.ts`, ... vs a flatter structure). Barrel at `src/index.ts`
  as established in Phases 1–3.
- Whether each helper is a standalone function consumed by a getter on `Hl7Message`
  (`get patient() { return this._patient ??= buildPatient(this); }`) or a method on a
  prototype mixin. Constraint: public shape is `msg.meta` (property) and
  `msg.observations()` (method) — internal structure is the planner's call.
- Exact internal representation of the `Observation` / `Order` types (interface, class,
  frozen plain object). Public shape is locked by D-13..D-16; implementation is
  whatever reads cleanly.
- Whether allergies / diagnoses / next-of-kin / insurance expose a similar typed shape
  (recommended: frozen plain objects with the handful of most-used fields per segment
  type, derived from segment definitions in HL7 v2.5: AL1 for allergies, DG1 for
  diagnoses, NK1 for next-of-kin, IN1+IN2 pair for insurance). Planner defines the
  per-object field list; keep it lean — callers always have `msg.segments('DG1')` for
  full access.
- Whether `msg.insurance()` groups IN1/IN2/IN3 positionally (like orders group OBX under
  OBR). Recommendation: yes, one insurance entry per IN1 with attached IN2/IN3 metadata.
  Planner confirms.
- Whether the observation-value union narrows with a precise discriminated union
  (`{ valueType: 'NM', value: number | undefined } | ...`) or a loose typed sum
  (`valueType: string; value: string | number | Date | CWE | CE | undefined`). D-13
  specifies the runtime behaviour; planner picks the TypeScript expression that stays
  readable + exported cleanly via the existing barrel.
- Whether to add a `parseXcn` + `Field.asXcn()` now (D-24 option a) or defer. Decision
  belongs to the planner based on how much XCN surface area helpers need beyond the
  display name.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints
- `.planning/PROJECT.md` — north star, Key Decisions (immutability, zero runtime deps,
  Postel's Law, fatal errors limited to 4 Tier-3 codes).
- `CLAUDE.md` — engineering guardrails (no `any`, JSDoc `@example` on public exports,
  immutability, no `console.*`, strict TS + `noUncheckedIndexedAccess`).

### Requirements (locked acceptance criteria)
- `.planning/REQUIREMENTS.md` §Named Helpers — HELPERS-01 (msg.meta), HELPERS-02
  (msg.patient), HELPERS-03 (msg.visit, nullable), HELPERS-04 (msg.observations()),
  HELPERS-05 (msg.orders() with OBX grouping), HELPERS-06 (nextOfKin/allergies/diagnoses/
  insurance), HELPERS-07 (never-throw, undefined/empty on missing data).

### Roadmap & success criteria
- `.planning/ROADMAP.md` — Phase 4 goal, 4 success criteria, parallelization notes
  (meta/patient parallel; visit independent; orders must follow observations; nextOfKin/
  allergies/diagnoses/insurance mutually parallel).
- `.planning/STATE.md` — current position, Phase 3 accumulated decisions relevant here
  (especially composite coercions, cache invalidation pattern).

### Prior phase artifacts (Phase 3 — structural model)
- `.planning/phases/03-structural-model-and-types/03-CONTEXT.md` — D-01..D-24 on read
  paths, composite shapes, mutation + cache invalidation, TS/DTM date semantics. Phase
  4 builds on every one of these.
- `.planning/phases/03-structural-model-and-types/03-PLAN-01-read-path-foundation.md` —
  dot-path resolver, Segment/Field wrappers, `_segmentsByType` / `_allSegments` wrapper
  caches on `Hl7Message` (pattern Phase 4 extends for `_meta`, `_patient`, `_visit`).
- `.planning/phases/03-structural-model-and-types/03-PLAN-04-mutation-and-barrel.md` —
  mutation API + wholesale cache invalidation (Phase 3 D-17). Phase 4 mutation-cache
  integration MUST follow this same wholesale-invalidation pattern for D-02.
- `.planning/phases/03-structural-model-and-types/03-VERIFICATION.md` — confirmation of
  Phase 3 PASS (4/4 success criteria, 11/11 REQ-IDs).

### Prior phase artifacts (Phase 2 — parser + warnings + dates)
- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` — `Hl7Message` shell
  shape (D-05), warnings frozen (D-07), MSH metadata exposure baseline. Phase 4 extends
  the metadata surface beyond `encodingCharacters` + `version`.
- `.planning/phases/02-core-parser-and-tolerance/02-05-SUMMARY.md` — `parseHl7Timestamp`
  cascade. Phase 4's `meta.timestamp`, `patient.dateOfBirth`, `visit.*DateTime`,
  `observation.observedDateTime` all flow through `Field.asTs().date`, which delegates
  to this helper.

### Existing code surfaces (read to understand what's already there)
- `src/index.ts` — public barrel. Phase 4 adds helper types (`Meta`, `Patient`, `Visit`,
  `Observation`, `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance`) under the
  existing barrel. Possibly extends the `HL7` namespace (D-13's namespace convention).
- `src/model/message.ts` — current `Hl7Message` class. Phase 4 adds six getters
  (`meta`, `patient`, `visit`) and six-plus methods (`observations`, `orders`,
  `nextOfKin`, `allergies`, `diagnoses`, `insurance`). Cache invalidation hook must
  extend the existing `_segmentsByType` / `_allSegments` drop in the mutation methods.
- `src/model/segment.ts` / `src/model/field.ts` — Phase 3 wrappers Phase 4 consumes.
- `src/model/types/*.ts` — composite parsers/types (XPN, XAD, CX, CWE, CE, XTN, PL, TS,
  NM, HD). Phase 4 may add `xcn.ts` per D-24.
- `src/parser/dates.ts` — `parseHl7Timestamp` cascade (used transitively via
  `Field.asTs`).
- `src/parser/types.ts` — raw positional tree; Phase 4 should not consume directly
  (compose on Phase 3 wrappers).

### External specs (reference only — developer shouldn't need to read)
- HL7 v2.5.1 segment definitions consulted for the helper field mappings:
  - **MSH** (12-field metadata set for `msg.meta`)
  - **PID** (demographics for `msg.patient`)
  - **PV1** (visit info for `msg.visit`)
  - **OBR / OBX** (orders & observations)
  - **NK1** (next of kin)
  - **AL1** (allergies)
  - **DG1** (diagnoses)
  - **IN1 / IN2 / IN3** (insurance)
  Not vendored. Planner consults v2.5.1 chapters 2–3 to confirm field positions only;
  acceptance is the HELPERS-0X phrasing, not the HL7 spec literally.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/model/message.ts::Hl7Message` — target class. Already has `_segmentsByType`,
  `_allSegments` wrapper caches + wholesale invalidation on mutation. Phase 4 extends
  this pattern with `_meta`, `_patient`, `_visit` cache slots and adds the same
  invalidation in `setField` / `addSegment` / `removeSegment`.
- `src/model/segment.ts::Segment` + `src/model/field.ts::Field` — full read surface for
  helpers. `msg.segments('PID')[0].field(5).asXpn()` is the canonical helper building
  block.
- `src/model/types/xpn.ts` through `hd.ts` — 10 composite parsers Phase 4 consumes
  through `.asXxx()`. Phase 4 may add `xcn.ts` for HELPERS-03's doctor fields.
- `src/model/types/_shared.ts::readSubcomponent` + `readComponent` — used by composites.
  Phase 4 does NOT need these directly; it goes through the `.asXxx()` Field API.
- `src/parser/dates.ts::parseHl7Timestamp` — transitively used via `Field.asTs()`.
  Phase 4 does NOT call it directly (delegates through the composite layer).
- `Hl7Message` dot-path resolver (`msg.get()`) — `msg.get('MSH.10')` for `meta.controlId`
  etc. Handles the MSH-1/MSH-2 special cases (Phase 3 D-05) so Phase 4 helpers just
  consume the resolved string.

### Established Patterns

- **Barrel export via `src/index.ts`:** Phase 4 adds `Meta`, `Patient`, `Visit`,
  `Observation`, `Order`, `NextOfKin`, `Allergy`, `Diagnosis`, `Insurance` as named
  type exports, plus optionally the `HL7` namespace augmentation.
- **Cache-and-invalidate pattern for read surfaces:** Phase 3 D-11/D-12 (wrapper caches)
  + D-17 (wholesale invalidation on mutation) is the template for D-02 in Phase 4.
- **Frozen-by-convention, mutation through explicit methods only:** helper outputs are
  `Object.freeze`d; `msg.patient.mrn = 'X'` is a documented no-op (silently ignored in
  non-strict TS, TypeError in strict mode on frozen objects).
- **Never throw on missing data; undefined / `[]` as the contract:** MODEL-05 established
  this in Phase 3; HELPERS-07 restates it for Phase 4.
- **Auto-unescape on any string read:** Phase 3 D-03; Phase 4 inherits by always
  reading through `msg.get()` or `field.value` rather than walking the raw tree.
- **Lazy composite parsing:** Phase 3 D-09. Phase 4 helpers are lazy wrappers on lazy
  composites — the message shell builds `_meta` on first `.meta` access; each field in
  `_meta` has already routed through `field.asXxx()` once and is held as a plain value.
- **Test convention:** `test/*.test.ts`. Phase 4 tests land as `test/helpers-meta.test.ts`,
  `test/helpers-patient.test.ts`, `test/helpers-visit.test.ts`, `test/helpers-observations.test.ts`,
  `test/helpers-orders.test.ts`, `test/helpers-collections.test.ts` (nextOfKin + allergies +
  diagnoses + insurance).
- **JSDoc `@example` on every public export:** enforced by ESLint (`require-example`).
  Every helper type AND every new `msg.xxx` access path needs at least one `@example`.

### Integration Points

- `Hl7Message` is the sole class extended. Phase 4 does NOT introduce new top-level
  exports that construct messages (only `parseHL7` does, Phase 2 D-05).
- `parseHL7` in `src/parser/index.ts` is untouched — it already builds a full
  `Hl7Message` with Phase 3's read surface. Phase 4 is pure `Hl7Message` extension.
- Phase 5's `toString()` walks `rawSegments` and re-escapes; it has no dependency on
  helper caches. Helper caches are invalidated on mutation (D-02) before Phase 5 ever
  reads.
- Phase 6 profile-driven overrides (e.g. profile-specific MRN pick logic) can re-enter
  this layer by composing on the same read surface. Phase 4 must not hard-code the
  "CX-5='MR'" logic in a way that prevents a Phase 6 profile from overriding it.
  Recommendation: isolate the pick logic in a small `pickMrn(identifiers: CX[]): string | undefined`
  helper so Phase 6 can substitute a profile-aware version without refactoring patient.ts.
- Phase 7 testing will add vendor-quirk fixtures that exercise every helper (HELPERS-01..07)
  + observation valueType dispatch. Phase 4 ships baseline tests that cover the four
  success criteria with canonical fixtures; Phase 7 adds breadth.
- Phase 8's example `examples/extract-patient-info.ts` (EX-01) is a direct consumer of
  `msg.patient` — it's effectively the user-facing smoke test for Phase 4's north star.

</code_context>

<specifics>
## Specific Ideas

- **One-liner acceptance examples** (use as smoke tests during planning):
  - `msg.meta.type` → e.g. `'ADT^A01'`
  - `msg.meta.timestamp.toISOString()` → just works, no `?.date?.` chain
  - `msg.patient?.mrn` → first CX with CX-5='MR', fallback to first CX-1
  - `msg.patient?.fullName` → `'John Q Smith, Jr'` (Western order)
  - `msg.patient?.dateOfBirth?.toISOString()` → just works
  - `msg.visit?.admitDateTime?.toISOString()` → just works
  - `msg.observations().length` → number of OBX in document order
  - `msg.observations()[0].valueType === 'NM' && typeof msg.observations()[0].value === 'number'` → true
  - `msg.orders()[0].observations.length` → OBX under the first OBR
  - `msg.nextOfKin()` / `msg.allergies()` / `msg.diagnoses()` / `msg.insurance()` → empty
    `[]` when source segments absent.
- **Memoization identity guarantee:** `msg.meta === msg.meta`, `msg.patient === msg.patient`,
  `msg.visit === msg.visit` across multiple reads. After `msg.setField('PID.5.1', 'Jane')`,
  `msg.patient` returns a new object (old cache dropped). Test this explicitly in
  `helpers-cache-invalidation.test.ts`.
- **XCN decision is a planning gate.** Before planning can finish the `msg.visit` plan,
  the planner must pick between (a) new `parseXcn` + `Field.asXcn()` + `HL7.XCN` type,
  or (b) flatten doctor fields as strings on visit. Recommendation (a), per D-24.
- **Observation value discriminator covers these 9 HL7 valueTypes in v1:** `NM`, `ST`,
  `TX`, `FT`, `TS`, `DT`, `CWE`, `CE`, `ID` (treated as string). Unknown valueType falls
  through to `string | undefined`. No warning emitted (D-21). Phase 7 is the place to
  confirm coverage against real messages.
- **Insurance grouping:** one `Insurance` entry per IN1 segment, with IN2/IN3 groups
  attached positionally (same pattern as orders→observations). Planner confirms field
  list.
- **MRN-pick extensibility hook:** isolate MRN pick logic in `src/helpers/pick-mrn.ts`
  (or inline as a named exported function) so Phase 6 profile overrides have a clean
  substitution point.

</specifics>

<deferred>
## Deferred Ideas

- **Profile-driven MRN / identifier override** — Phase 6. Phase 4 ships the `CX-5='MR'
  with first-CX fallback` default; Phase 6 adds profile hook.
- **Locale-aware `fullName` composition** (e.g. `'Family, Given'` for JP/KR locales) —
  not in v1. Raw XPN is always available for caller-side composition.
- **Helper result memoization on collections** (`msg.observations()` cache) — D-06
  defers this. Revisit in Phase 7 if profiling warrants it.
- **`msg.message` shortcut** (single-message convenience on batch-file parses) — batch
  files are v1 out-of-scope (PROJECT.md). Won't exist in Phase 4.
- **Typed message overlays** (`msg.is('ADT^A01')` narrows helpers to ADT-specific
  fields) — v2.
- **Observation value type exhaustiveness** (every single HL7 valueType code) — v1 ships
  the 9 most-common (NM/ST/TX/FT/TS/DT/CWE/CE/ID). Additions come via Phase 7 test
  findings, not Phase 4 scope.
- **`TIMESTAMP_PRECISION_LOST` / `HELPER_IDENTIFIER_FALLBACK` warnings** — not added.
  Helpers stay silent (D-21).
- **`patient.age` / `patient.isMinor`** — derived convenience; reject for v1 because it
  needs a reference date (today? message timestamp?) and opens a timezone can of worms.
  Callers compute from `patient.dateOfBirth`.
- **Insurance precedence resolution** (primary vs secondary plan) — not decoded. The
  array order matches IN1 document order; callers interpret.
- **`msg.attachments()` for MDM / embedded OBX documents** — not in v1 helper set.
  Out of HELPERS-06.

</deferred>

---

*Phase: 04-named-helpers*
*Context gathered: 2026-04-19*
