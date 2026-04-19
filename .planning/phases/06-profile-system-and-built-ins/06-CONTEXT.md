# Phase 6: Profile System & Built-ins — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 ships the **`defineProfile()` API** plus 5 built-in vendor
profiles. Profiles are plain data produced by a public factory —
consumers and built-ins are equal citizens of the same API (PROJECT.md
Key Decision: "Profiles are plain data produced by `defineProfile()`").

**In scope (PROF-01..09 + BIP-01..06):**

- `defineProfile(options): Profile` — validation, lineage computation,
  `describe()` method. Every invalid input throws
  `ProfileDefinitionError` with an actionable message (PROF-01, PROF-02,
  PROF-04, PROF-05).
- `extends: parent | [p1, p2, ...]` merge semantics — scalars overwrite,
  arrays concat+dedupe (first-occurrence wins), `customSegments`
  deep-merge per segment/position, `onWarning` handler chain (PROF-03).
- `customSegments` Z-segment declarations + `Segment.get(fieldName)`
  named-field access (PROF-07).
- Profile attribution on parsed messages: `msg.profile.name` +
  `msg.profile.lineage` populated end-to-end through `parseHL7`
  (PROF-06) — attribution scaffolding already landed in Phase 2
  (`src/parser/index.ts` Step 13).
- Default-profile management: `setDefaultProfile` / `getDefaultProfile`
  / `setDefaultProfile(null)` + `parseHL7(raw, { profile: null })`
  opt-out for a single call (PROF-08).
- Round-trip guarantee: profile affects PARSING only; `toString()` emits
  spec-clean HL7 regardless of profile (PROF-09 — already implied by
  Phase 5 D-08 + PROJECT.md "conservative emitter" Key Decision).
- 5 built-in profiles — `profiles.epic`, `profiles.cerner`,
  `profiles.meditech`, `profiles.athena`, `profiles.genericLab` — each
  authored via the public `defineProfile()` API (BIP-01..05).
- A handcrafted vendor-shape fixture per built-in demonstrating reduced
  warnings with the profile vs without (BIP-06). Full fixture breadth
  expands in Phase 7.

**Out of scope (belongs to other phases or v2):**

- Typed message overlays / schema validation — v2 roadmap.
- Profile-aware serialization overrides (per-profile Z-segment re-emit
  rules) — not in v1. `toString()` stays profile-agnostic per PROF-09.
- Custom-segment overlays on STANDARD segments (PID/OBX/...) — rejected
  for v1; throws `ProfileDefinitionError`. Typed overlays are a v2
  concern.
- Dot-path extension to name-based lookup (`msg.get('ZPI.encounterId')`)
  — deferred. v1 uses `seg.get(name)` only.
- Type-safe field-name inference from `customSegments` at call site
  (conditional-type magic) — v2 roadmap.
- Full coverage enforcement + vendor-quirks fixture breadth (beyond one
  fixture per built-in) — Phase 7.
- Emitter warnings or new fatal codes — forbidden (Phase 5 D-27/D-28
  carry forward; this phase is also parse-only + silent in serialize).
- `onWarning` suppression/mute capability — v2. Profile observers only
  *observe*; they do not filter.

**Compose, don't reach through.** Phase 6 builds on existing surfaces
from Phases 2–5:

- `Profile` interface shape is LOCKED in `src/parser/types.ts`. Phase 6
  extends it only with `describe()` (a method added to the returned
  object, not a new interface field) — and the interface itself may
  gain `extends?: Profile | readonly Profile[]` as an optional input key
  (but not a runtime field on the output).
- `ProfileDefinitionError` class is LOCKED in `src/parser/errors.ts` —
  Phase 6 fills the validation paths that throw it.
- `parseHL7(raw, profile)` overload + `{ profile: null }` opt-out +
  `msg.profile = { name, lineage }` attribution — already wired in
  `src/parser/index.ts` Step 13. Phase 6 only plugs in the lineage
  computation from `extends` and wires customSegments / dateFormats
  into the parse.
- `Hl7Message.profile` shape on `SerializedMessage` (Phase 5 D-20) —
  unchanged. `toJSON` already only emits `{ name, lineage }`.
- Zero runtime deps preserved. Node stdlib only.

</domain>

<decisions>
## Implementation Decisions

### defineProfile() API & output shape

- **D-01: `defineProfile(opts): Profile` returns a deep-frozen plain
  object with a `describe(): string` method attached.** Shape:
  ```
  {
    readonly name: string;
    readonly description?: string;
    readonly lineage: readonly string[];       // computed from extends + self
    readonly dateFormats: readonly string[];   // merged from extends
    readonly customSegments: Readonly<Record<string, { readonly fields: Readonly<Record<string, number>> }>>;
    readonly onWarning?: OnWarningCallback;    // composed handler fn, see D-08
    describe(): string;                         // see D-04
  }
  ```
  No class, no `new`, no prototype chain. Matches PROJECT.md Key
  Decision ("Profiles are plain data produced by `defineProfile()`").
  Existing `Profile` interface in `src/parser/types.ts` stays — Phase 6
  adds `describe?: () => string` as an optional field on it (the input
  accepted by parseHL7 may still be any Profile-shaped object; the
  output of defineProfile always has describe()).

- **D-02: Input shape `DefineProfileOptions` is a new interface
  exported from `src/index.ts`.** It mirrors `Profile` plus the new
  `extends` input key:
  ```
  interface DefineProfileOptions {
    readonly name: string;
    readonly description?: string;
    readonly dateFormats?: readonly string[];
    readonly customSegments?: Readonly<Record<string, {
      readonly fields: Readonly<Record<string, number>>;
    }>>;
    readonly onWarning?: OnWarningCallback;
    readonly extends?: Profile | readonly Profile[];
  }
  ```
  The result of `defineProfile(opts)` satisfies the existing `Profile`
  interface, so it passes cleanly into `parseHL7(raw, profile)`.

- **D-03: `lineage` is computed as [...flatten(parents).lineage, self.name],
  deduped by first occurrence.** For a single parent with lineage
  `['base', 'epic']` extended by `child`, the result lineage is
  `['base', 'epic', 'child']`. For `extends: [p1, p2]` with
  `p1.lineage = ['a']` and `p2.lineage = ['a', 'b']`, the result
  lineage is `['a', 'b', child.name]`. Reads chronologically and
  matches the cascade: parents apply first, child specializes last.
  Empty parents (brand-new base profile) → lineage = `[name]`.

- **D-04: `describe()` returns a structured multi-line string** with a
  stable shape:
  ```
  Profile 'epic'
    description: Epic-specific quirks and ADT date formats
    lineage: epic
    customSegments: 2 (ZDP, ZRS)
    dateFormats: 3
    onWarning: registered
  ```
  Guaranteed non-empty (contains profile name per PROF-05). Fields
  omitted from the description when absent (no `description:` line if
  opts.description wasn't provided; no `onWarning:` line when no
  handlers were supplied anywhere in the lineage). Lineage rendered
  `parent → child → grand-child` when more than one name is present.

### Validation (every throw uses ProfileDefinitionError)

- **D-05: Throw when `customSegments` key is not a Z-segment.** Regex
  `/^Z[A-Z0-9]{2}$/u` — first char MUST be `Z`, total length 3,
  remaining two are uppercase alphanumerics. Message names the offender:
  `Profile 'epic' declares customSegments for 'PID' — only Z-segments
  (Z[A-Z0-9]{2}) are allowed in v1. Typed overlays are a v2 feature.`
  Checked at `defineProfile()` time, not at `parseHL7` time — fail fast.
  After merge (D-11), the final customSegments map is re-validated so
  that profiles composed via `extends` can't sneak in a standard-segment
  overlay either.

- **D-06: Throw on duplicate field names within a single segment.**
  `customSegments: { ZPI: { fields: { encounterId: 3, encounterId: 5 } } }`
  is a TypeScript/JavaScript object literal duplicate (static warning
  only, no runtime error), but after `extends` merge we MUST re-check
  that no two names within one segment map to different positions.
  Cross-position aliasing (`encounterId` and `enc` both mapping to 3)
  is allowed — it's the same field under two names, which is a harmless
  convenience. The duplicate-name check fires only when the SAME name
  resolves to DIFFERENT positions after merge.

- **D-07: Throw on unknown top-level option keys.** Passing
  `{ name, dateFormatz: [...] }` (typo) throws with a "did you mean
  dateFormats?" hint computed via Levenshtein distance ≤ 2 over the
  known-key list. Known keys: `name`, `description`, `dateFormats`,
  `customSegments`, `onWarning`, `extends`. Catches typos early
  instead of silently ignoring. Planner recommendation: inline a
  tiny Levenshtein helper (≤15 LoC) in `src/profiles/validate.ts` —
  zero new deps.

- **D-08: Throw on malformed date format strings.** A format string is
  malformed if it contains NONE of the supported tokens (`YYYY`, `MM`,
  `DD`, `HH`, `mm`, `ss`, `SSSS`). Prevents profiles from shipping dead
  format strings that match nothing (e.g., accidentally typing
  `'YYYY/MM/DD'` as `'YYY/MM/DD'`). Regex-based check: at least one
  token must appear. Per-entry validation with an error that names the
  bad index: `Profile 'foo' dateFormats[2] = 'YY-MM' is malformed —
  must contain at least one of YYYY/MM/DD/HH/mm/ss/SSSS.`

### extends merge semantics

- **D-09: Scalar options — child overwrites parent.** For
  `extends: [p1, p2]` + child: `description` / `onWarning` resolve via
  "last non-undefined wins" in the order `p1 → p2 → child`. Child's own
  explicit value wins over everything. Standard object-spread
  specialization. Empty `description` on child does NOT clear parent's
  description — only explicitly-provided keys participate.

- **D-10: Array options (`dateFormats`) — concat parents then child,
  dedupe preserving first occurrence.** For `extends: [p1, p2]` where
  `p1.dateFormats = ['YYYY-MM-DD']` and `p2.dateFormats = ['MM/DD/YYYY',
  'YYYY-MM-DD']` and `child.dateFormats = ['YYYYMMDD']`, the merged
  result is `['YYYY-MM-DD', 'MM/DD/YYYY', 'YYYYMMDD']`. Parent formats
  tried first (compatible with TOL-08 order-sensitive fallback), dupes
  collapsed. Same rule as lineage dedupe (D-03).

- **D-11: `customSegments` deep-merged by segment name, then by field
  position — child wins on position conflict.** For the same `ZPI`
  declared in parent and child: fields with distinct positions merge
  additively (parent's position 3 + child's position 5 coexist); fields
  with the same position resolve to child's name. After merge, the
  `customSegments` map is re-validated for D-05 (Z-only) and D-06
  (duplicate field names within a segment). This is the sole non-trivial
  merge case; implement in a small `mergeCustomSegments` helper.

- **D-12: `onWarning` handlers compose via chain in lineage order.**
  For `extends: [p1, p2]` + child each with handlers, the effective
  `profile.onWarning` is a closure that invokes
  `p1.onWarning → p2.onWarning → child.onWarning` in order. Exceptions
  thrown by any handler are SILENTLY swallowed (so one noisy profile
  doesn't break another). Handler order is by merge-lineage — same
  order as D-03 lineage. `ParseOptions.onWarning` is invoked AFTER the
  profile chain (matches existing `src/parser/index.ts` emitter
  ordering; profile chain plugs into the same `emit` function).

### customSegments access API

- **D-13: Fields declared as `{ <name>: <1-indexed position> }` map.**
  Object-map form chosen over arrays/tuples. Uniqueness by key is
  enforced by JavaScript at the syntax level; merge-time duplicate-name
  detection (D-06) covers the extends case. Example:
  ```ts
  defineProfile({
    name: 'epic',
    customSegments: {
      ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
      ZRS: { fields: { resultStatus: 1, statusDateTime: 2 } },
    },
  });
  ```
  1-indexed to match HL7 convention + `Segment.field(n)` + `msg.get('ZPI.3')`
  dot-path.

- **D-14: Runtime access via `Segment.get(fieldName): Field | undefined`.**
  Extend the existing `Segment` wrapper (`src/model/segment.ts`) with a
  new `get(name: string): Field | undefined` method. Returns the same
  `Field` wrapper type as `seg.field(n)` — callers use `.value`,
  `.asXpn()`, `.isNull`, etc. uniformly. Returns `undefined` (not
  synthetic-empty — unlike `seg.field(n)` which returns `Field.empty()`
  on out-of-range) so typos surface as `undefined` instead of silently
  resolving to empty string. Callers write `seg.get('encounterId')?.value`.

- **D-15: `Segment.get(name)` ignores customSegments on NON-Z segments
  (defense in depth).** D-05 rejects standard-segment overlays at
  `defineProfile()` time, so this situation shouldn't occur. But as a
  safety net: if a future bypass ever lets a standard-segment entry
  slip through, `Segment.get(name)` on a PID/OBX/... still returns
  `undefined`. Behavior is purely additive — the existing `field(n)`
  API is unchanged.

- **D-16: Profile access on `Segment`.** The `Segment` constructor gets
  a new optional parameter: the merged `customSegments` map (or the
  relevant per-segment entry — planner decides whether to pass the
  whole map or the slice). Lookup path: `Segment.get(name)` checks its
  segment name against the customSegments map, resolves the position,
  delegates to `this.field(n)`. If no profile was applied
  (`msg.profile === undefined`), the wrapper has no customSegments and
  `get(name)` returns `undefined` unconditionally. **The wiring path —
  how `Hl7Message` threads the merged customSegments map through to
  every `Segment` wrapper it instantiates — is Claude's Discretion**,
  but the simplest option is to store the map on `Hl7Message` and pass
  it to each `Segment` constructor the way `EncodingCharacters` is
  passed today (planner confirms the exact field/constructor param
  shape).

- **D-17: Dot-path extension is DEFERRED.** `msg.get('ZPI.encounterId')`
  as a name-based dot-path is NOT v1. v1 uses `seg.get(name)` only. If
  Phase 8 examples reveal a strong DX case, dot-path extension can
  land as a Phase 8 enhancement or post-v1 patch. The current dot-path
  resolver (`src/model/dot-path.ts`) stays numeric-only.

### Default profile management

- **D-18: Process-scoped default profile via module-level `let` in
  `src/profiles/default.ts`.** Exported API:
  ```ts
  export function setDefaultProfile(profile: Profile | null): void;
  export function getDefaultProfile(): Profile | undefined;
  ```
  `setDefaultProfile(null)` clears it. `getDefaultProfile()` returns
  `undefined` (not `null`) when unset, consistent with the existing
  `msg.profile` convention. No `globalThis`, no symbol sharing, no
  cross-worker leaking. Matches PROJECT.md Key Decision ("Scoped to
  current Node process, not shared across workers").

- **D-19: `parseHL7` discrimination of default vs explicit vs opt-out.**
  The existing `discriminateOptionsOrProfile` helper and Step 13 in
  `src/parser/index.ts` already handle: explicit `profile` arg beats
  default; `options.profile === null` opts out for a single call;
  `options.profile === undefined` OR omitted falls back to the
  default. Phase 6 only wires `getDefaultProfile()` into Step 13 when
  neither explicit profile nor `profile: null` is supplied. No
  refactor of the dispatch shape.

- **D-20: Default profile's effects are identical to an explicit
  profile.** `parseHL7(raw)` with a registered default produces the
  same `msg.profile`, same customSegments access, same dateFormats
  merge, same `onWarning` chain as `parseHL7(raw, defaultProfile)`.

### ParseOptions × Profile interactions

- **D-21: `options.dateFormats` precede `profile.dateFormats` in the
  try-order.** For `parseHL7(raw, { dateFormats: ['YY/MM/DD'] })` with
  `profiles.epic` as registered default:
  try-order is `options.dateFormats → profile.dateFormats → BUILTIN_DATE_FALLBACKS`,
  deduped preserving first occurrence. Matches the "explicit > default"
  rule already established for `profile: null` opt-out. Implementation:
  the merge happens inside the existing Step 12/13 region of
  `src/parser/index.ts` and is passed down into `parseHl7Timestamp`.

- **D-22: `profile.onWarning` chain fires BEFORE `options.onWarning`.**
  Profile handlers are observers that run first; the call-site handler
  runs last. Preserves the "profile behavior, then caller behavior"
  layering pattern (profile sees raw behavior; caller sees post-profile
  behavior). Exceptions in any handler are swallowed silently (D-12
  already specified for the profile chain; extend to options.onWarning
  as well for consistency — but this is Claude's Discretion: the
  existing `makeEmitter` logic in `src/parser/index.ts` may need no
  change if handler errors already propagate, in which case the
  profile chain's try/catch suffices).

### Built-in profiles

- **D-23: 5 built-ins ship: `epic`, `cerner`, `meditech`, `athena`,
  `genericLab`.** Each is a small, high-signal profile — 1–3 vendor
  date formats + 1–3 commonly-seen Z-segments per vendor. Authored via
  the public `defineProfile()` API (BIP-01..05 requirement).

- **D-24: Built-in quirk targets (planner confirms exact tokens):**
  - **`profiles.epic`** — Epic integration output. Non-HL7 formats
    `MM/DD/YYYY HH:mm:ss`, `MM/DD/YYYY`. Z-segments: `ZDP` (department),
    `ZRS` (result status). Target warning reductions:
    `TIMESTAMP_FALLBACK_FORMAT` (absent for declared formats),
    `UNKNOWN_SEGMENT` (absent for declared Z-segments).
  - **`profiles.cerner`** — Cerner Millennium output. Non-HL7 formats
    `YYYY-MM-DDTHH:mm:ss` (ISO 8601 with T). Z-segments: `ZDS`
    (discharge summary), `ZCO` (comment overflow). Target warning
    reductions: `TIMESTAMP_FALLBACK_FORMAT`, `UNKNOWN_SEGMENT`.
  - **`profiles.meditech`** — Meditech MAGIC/Expanse. Non-HL7 format
    `YYYYMMDDHHmm` (minute precision, no seconds). Z-segments: `ZVI`
    (visit info). Target warning reductions:
    `TIMESTAMP_FALLBACK_FORMAT`, `UNKNOWN_SEGMENT`.
  - **`profiles.athena`** — athenahealth. Non-HL7 formats `MM/DD/YYYY`,
    `MM/DD/YYYY HH:mm AM/PM` (meridian form — planner confirms
    whether our format-token set supports AM/PM; if not, drop the
    meridian variant and keep only `MM/DD/YYYY`). Z-segments: `ZCA`
    (care team). Target warning reductions: `TIMESTAMP_FALLBACK_FORMAT`,
    `UNKNOWN_SEGMENT`.
  - **`profiles.genericLab`** — Generic reference-lab shape (LabCorp /
    Quest-style). Non-HL7 format `YYYYMMDDHHmmss` is the HL7 default
    so it doesn't count — instead, include ASTM-era `YYYYMMDD HHmm`
    (space-separated) and `YYYY-MM-DD` (ISO date-only). Z-segments:
    `ZLB` (lab-override flags), `ZNT` (lab note). Target warning
    reductions: `TIMESTAMP_FALLBACK_FORMAT`, `UNKNOWN_SEGMENT`.

  **Rationale:** Each built-in's job is to make the most-common
  real-world pain point (`TIMESTAMP_FALLBACK_FORMAT` warnings on vendor
  date shapes) disappear, plus declare the vendor's top-used Z-segment
  so consumers can use `seg.get(name)` instead of magic-number
  positions. Authored from publicly documented vendor interface
  specifications + library-maintainer experience; no PHI, no sampled
  real messages.

- **D-25: File layout.** `src/profiles/epic.ts`,
  `src/profiles/cerner.ts`, `src/profiles/meditech.ts`,
  `src/profiles/athena.ts`, `src/profiles/genericLab.ts`, plus
  `src/profiles/index.ts` (barrel that assembles the `profiles` object
  and re-exports `defineProfile`, `setDefaultProfile`,
  `getDefaultProfile`). One file per profile enables plan-per-profile
  parallelization (ROADMAP Phase 6 parallelization note).

- **D-26: Public export shape.** `src/index.ts` gains:
  - `defineProfile` — value
  - `setDefaultProfile`, `getDefaultProfile` — values
  - `profiles` — namespace object `{ epic, cerner, meditech, athena,
    genericLab }` (all 5 built-ins accessible as
    `profiles.epic`, etc. per ROADMAP success criteria language)
  - `DefineProfileOptions` — type
  - `CustomSegmentDefinition` — type (the `{ fields: { ... } }` shape);
    re-exported for consumers authoring their own profiles

  Individual built-in profiles are NOT re-exported as top-level named
  exports (no `export { epic }` — only `profiles.epic`). Keeps the
  public surface tight; "epic" is too generic a name for a top-level
  export.

### Vendor-shape fixtures

- **D-27: Handcrafted fixtures in `test/fixtures/vendor-shapes/<vendor>/`.**
  One fixture per built-in (5 files total), authored from publicly
  documented vendor interface specifications. Synthetic names/MRNs
  only (Smith/Doe/Doe-Jones/etc.); no PHI, no sampled messages, no
  anonymized real data. Naming: `test/fixtures/vendor-shapes/epic/adt-a01.hl7`,
  `cerner/oru-r01.hl7`, etc. — planner picks one message type per
  vendor that's natural for the quirks being demonstrated.

- **D-28: Fixture-parity assertion style — per-warning-code.** Tests
  assert on specific warning codes, not total counts. Example:
  ```ts
  const withoutProfile = parseHL7(fixture);
  const withProfile = parseHL7(fixture, profiles.epic);
  expect(withoutProfile.warnings.map(w=>w.code))
    .toContain('TIMESTAMP_FALLBACK_FORMAT');
  expect(withProfile.warnings.map(w=>w.code))
    .not.toContain('TIMESTAMP_FALLBACK_FORMAT');
  ```
  Robust against future phases adding new warnings (total-count
  assertions would break). Secondary smoke: total-count MUST decrease
  (belt-and-suspenders assertion available if the planner wants it,
  but the per-code check is the primary contract).

### Round-trip & serialization policy

- **D-29: Profile does NOT affect `toString()` output.** `msg.toString()`
  emits spec-clean HL7 regardless of profile (PROF-09). Consistent with
  Phase 5 D-08 and PROJECT.md "Postel's Law" key decision. No profile
  hook in `src/serialize/`. Round-trip fixture test:
  `parseHL7(parseHL7(raw, profile).toString()).rawSegments` structurally
  equals `parseHL7(raw, profile).rawSegments` — same structural
  equivalence as SER-02 (the profile attribution itself may disappear
  on the round-trip since the re-parse isn't given a profile arg, but
  segment content + Z-segments are preserved byte-clean).

- **D-30: `toJSON().profile` shape is locked to `{ name, lineage }` from
  Phase 5 D-20.** Phase 6 MUST NOT extend the serialized profile
  descriptor — no `customSegments`, no `dateFormats`, no `onWarning`
  handle. Those are non-serializable (functions) or redundant
  (`customSegments` belongs to the profile definition, not the parsed
  message). Callers who need the full profile at deserialize time keep
  a reference to the defined profile themselves.

### Shared conventions

- **D-31: No new `WarningCode` entries.** The 13 existing codes
  (`src/parser/warnings.ts`) cover every Phase 6 concern. The only
  interesting reductions are in already-emitted codes
  (`TIMESTAMP_FALLBACK_FORMAT`, `UNKNOWN_SEGMENT`). Declaring a
  Z-segment in a profile SUPPRESSES the `UNKNOWN_SEGMENT` warning the
  tokenizer would otherwise emit for that segment name — planner
  confirms the exact suppression check point (likely at warning-emit
  time: check if the segment name is declared in the applied profile;
  if so, skip emitting `UNKNOWN_SEGMENT`). This is a small, additive
  change to the existing emit path.

- **D-32: No new fatal `Hl7ParseError` codes.** The 4 Tier-3 codes
  remain the complete fatal set for v1 (PROJECT.md key decision).
  Profile validation failures use `ProfileDefinitionError`, which is
  a DIFFERENT class and already exported.

- **D-33: Zero new runtime deps.** Levenshtein helper for unknown-key
  hints (D-07) is inlined (~15 LoC). Everything else uses existing
  primitives.

- **D-34: Emitter purity preserved.** `toString` / `toJSON` /
  `prettyPrint` remain silent and pure per Phase 5 D-07/D-26. Phase 6
  adds no emit-side logic.

### Claude's Discretion

- Exact internal file layout under `src/profiles/` beyond the named
  files (e.g., whether `merge.ts`, `validate.ts`, `define.ts`,
  `default.ts`, `describe.ts` are separate files or a single
  `src/profiles/define.ts` with private helpers). Planner decides
  based on file-size targets.
- Exact Levenshtein threshold for "did you mean?" hints (D-07) — 2 is
  a reasonable default; planner may tune based on real typo patterns.
- Whether `Hl7Message` stores the merged `customSegments` map on the
  class or passes it through to Segment constructors via a different
  mechanism (D-16). Planner picks the shape with the fewest touched
  files. Existing Phase 3 D-11 (Segment cache invalidation on
  mutation) may need a small extension so that profile-aware Segments
  invalidate together with the wrapper cache — but the mutation
  methods (`addSegment`, `setField`, `removeSegment`) don't change
  profile, so this is a one-time wire at construction, not a cache
  concern.
- Whether the `onWarning` handler chain try/catches within each
  handler or wraps each in try/catch externally. Recommendation:
  inline try/catch per handler in a single pass through the lineage
  — simpler, observable in stack traces, no new Promise tick.
- Exact vendor-date-format token set (D-24 athena AM/PM variant) —
  planner confirms whether `parseHl7Timestamp` currently supports
  `AM/PM` tokens. If not, either drop that variant or add the token
  to `src/parser/dates.ts` as a small additive change (still v1-safe).
- Whether built-in profiles import `defineProfile` from a relative
  path or from the public `src/index.ts` barrel. Recommendation:
  relative path (`../profiles/define.ts`) inside the package, public
  barrel for external consumers. Keeps internal coupling minimal.
- Number of fixtures per built-in (D-27). One is the minimum for
  BIP-06. Planner may ship two per vendor (an ADT-style + an
  OBX/OBR-style) if that helps demonstrate Z-segment coverage — but
  one is the contract.
- Whether `setDefaultProfile` + `getDefaultProfile` also reset the
  module state between test files automatically (test-isolation
  concern). Recommendation: NO auto-reset — tests that set a default
  MUST clear it in `afterEach` / `afterAll`. Documented in JSDoc.
- Whether `describe()` exposes the onWarning handler-chain length
  (`onWarning: 3 handlers`) or just presence/absence. Recommendation:
  presence-only for v1 per D-04; chain length can land later if
  debugging demand surfaces.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints

- `.planning/PROJECT.md` — Key Decisions (profiles are plain data;
  `setDefaultProfile` discouraged but exists; zero runtime deps;
  lenient parser + spec-clean serializer).
- `CLAUDE.md` — engineering guardrails (no `any`, JSDoc `@example` on
  every public export, immutability, short testable functions,
  strict TS).

### Requirements (locked acceptance criteria)

- `.planning/REQUIREMENTS.md` §Profiles — PROF-01..09 (defineProfile
  core + validation + extends + attribution + default-profile +
  round-trip); §Built-in Profiles — BIP-01..06 (5 profiles, each via
  public API, each with a fixture demonstrating fewer warnings).

### Roadmap & success criteria

- `.planning/ROADMAP.md` — Phase 6 goal + 5 success criteria;
  parallelization note (built-ins are mutually independent once the
  API stabilizes).
- `.planning/STATE.md` — current position.

### Prior phase artifacts — Phase 2 (profile type + error class)

- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` —
  ProfileDefinitionError already declared; `Profile` interface
  locked; `parseHL7(raw, profile)` overload + `{ profile: null }`
  opt-out semantics.
- `src/parser/types.ts::Profile` — **the locked profile shape.**
  Phase 6 does NOT modify this interface except to add an optional
  `describe?: () => string` field. The input to defineProfile
  (`DefineProfileOptions`) is a new sibling interface.
- `src/parser/errors.ts::ProfileDefinitionError` — locked error
  class. Phase 6 fills the throw paths (D-05..D-08).
- `src/parser/warnings.ts::WARNING_CODES` — the 13 existing codes.
  Phase 6 adds NO new codes (D-31). Profile suppresses existing
  codes (`UNKNOWN_SEGMENT`, `TIMESTAMP_FALLBACK_FORMAT`).
- `src/parser/index.ts::parseHL7` — Step 13 already threads
  `profile.name` + `profile.lineage` onto `msg.profile`. Phase 6
  extends Step 13 (plus Step 11 tokenize emit path) to plug in
  `customSegments` + dateFormats merge + `onWarning` chain.
- `src/parser/dates.ts::parseHl7Timestamp` — consumes the merged
  dateFormats list. Phase 6 only changes the arg source (pre-merged
  profile + options list), not the function.

### Prior phase artifacts — Phase 3 (model wrappers)

- `src/model/segment.ts::Segment` — add `get(name): Field | undefined`
  method (D-14). Constructor gains an optional customSegments-slice
  parameter (D-16). Existing `field(n)` behavior unchanged.
- `src/model/message.ts::Hl7Message` — holds the applied profile's
  merged customSegments map (D-16) and passes the per-segment slice
  to each `Segment` instance it constructs. Existing `segments(type)`
  / `allSegments()` / mutation methods unchanged in behavior.
- `src/model/dot-path.ts` — NOT extended. Dot-path stays
  numeric-only per D-17.
- `.planning/phases/03-structural-model-and-types/03-CONTEXT.md` —
  D-11/D-12 wrapper caching; D-19 segment-name regex
  (`SEGMENT_NAME_RE`).

### Prior phase artifacts — Phase 4 (helpers)

- `.planning/phases/04-named-helpers/04-CONTEXT.md` — D-24 XCN
  composite; `pickMrn` already a hook-point for future profile
  override (but not extended in this phase — v2 concern).
- `src/helpers/pick-mrn.ts` — referenced as a hook point; v2 could
  let profiles swap this, but Phase 6 does NOT.

### Prior phase artifacts — Phase 5 (serialization)

- `.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md` —
  D-08 (`toString` never wraps MLLP), D-27 (no new warning codes),
  D-28 (no new fatal codes), "Integration Points" paragraph
  describing the future profile hook (intentionally NOT built in
  Phase 6 per PROF-09).
- `src/serialize/*` — unchanged by Phase 6. `toString` / `toJSON` /
  `prettyPrint` remain profile-agnostic (D-29).

### Existing code surfaces

- `src/index.ts` — public barrel. Phase 6 adds: `defineProfile`
  (value), `setDefaultProfile`, `getDefaultProfile` (values),
  `profiles` (namespace object value), `DefineProfileOptions` (type),
  `CustomSegmentDefinition` (type).
- `src/parser/types.ts::Profile` — shape reference.
- `src/parser/errors.ts::ProfileDefinitionError` — throw target.
- `src/parser/warnings.ts::WARNING_CODES` — suppression targets.
- `src/parser/index.ts::OPTIONS_ONLY_KEYS` — list of ParseOptions
  keys; add `profile` is already there.

### External specs (reference only)

- HL7 v2.5.1 Chapter 2 §2.12.7 (Z Segments) — confirms `Z` prefix
  convention + user-defined status. Informs D-05 regex.
- HL7 v2.5.1 Chapter 2 §2.11 (MSH definition) — confirms profile
  does NOT affect MSH structure (profile quirks are elsewhere).
- Vendor interface documentation (NOT vendored in repo):
  Epic Bridges Interconnect, Cerner Millennium HL7 spec,
  Meditech Expanse HL7 manual, athenahealth Interop API HL7
  specifications, LabCorp/Quest HL7 lab-result specs. Phase 6
  authors fixtures from the library maintainer's knowledge of these
  without requiring the planner/executor to fetch them.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/parser/types.ts::Profile` — locked interface shape. defineProfile
  output satisfies this. The only addition across Phase 6 is an
  optional `describe?: () => string` field on the interface (or
  keeping `describe` off the interface and making it part of the
  concrete `defineProfile` return type — planner decides, but the
  interface-addition keeps typing simple for callers who want to
  call `profile.describe()` on a `Profile`-typed variable).
- `src/parser/errors.ts::ProfileDefinitionError` — single throw
  target for all Phase 6 validation failures.
- `src/parser/warnings.ts::WARNING_CODES` — existing codes
  `UNKNOWN_SEGMENT` + `TIMESTAMP_FALLBACK_FORMAT` are the
  suppression targets (D-31). No new codes.
- `src/parser/index.ts` Step 13 — already threads
  `profile.name` + `profile.lineage` onto `msg.profile`. Phase 6
  plugs the merged customSegments + dateFormats + onWarning chain
  into Steps 11 (tokenize emit) and 12 (version extract / profile
  dateFormats).
- `src/parser/dates.ts::parseHl7Timestamp` — consumes the merged
  dateFormats list. The merge happens one level up; this function
  doesn't change.
- `src/model/segment.ts::Segment` — add `get(name)` method + one
  constructor param (customSegments slice).
- `src/model/message.ts::Hl7Message` — add storage + pass-through
  for the merged customSegments map.
- `src/parser/index.ts::discriminateOptionsOrProfile` — already
  distinguishes between `Profile` and `ParseOptions` via
  `OPTIONS_ONLY_KEYS`. Phase 6 doesn't touch it.

### Established Patterns

- **Barrel export via `src/index.ts`:** Phase 6 adds `defineProfile`,
  `setDefaultProfile`, `getDefaultProfile`, `profiles` values +
  `DefineProfileOptions`, `CustomSegmentDefinition` types.
- **Named factory pattern:** Phase 2 `parseHL7`, Phase 5
  `buildMessage`, Phase 6 `defineProfile`. Each is a top-level
  named export with `@example` JSDoc.
- **Plain-data return from factories:** Phase 5 `buildMessage`
  returns a real `Hl7Message` — no builder wrapper. Phase 6
  `defineProfile` returns a plain frozen object — no class.
- **Validation throws a typed error:** Phase 2 `Hl7ParseError` for
  parse-time; Phase 6 `ProfileDefinitionError` for define-time.
  Both carry actionable messages.
- **Zero new runtime deps:** Phase 1 locked this down. Phase 6
  inlines any helpers (Levenshtein) rather than depending.
- **JSDoc `@example` on every public export:** enforced by ESLint
  (`require-example`). All Phase 6 new public exports need at least
  one `@example`.
- **Test convention:** `test/*.test.ts`. Phase 6 tests will land as
  `test/profiles-define.test.ts`,
  `test/profiles-extends.test.ts`,
  `test/profiles-custom-segments.test.ts`,
  `test/profiles-default.test.ts`,
  `test/profiles-builtins.test.ts`, plus per-vendor
  fixture-parity tests that read from
  `test/fixtures/vendor-shapes/<vendor>/*.hl7`.

### Integration Points

- `src/parser/index.ts::parseHL7` Step 11 — tokenize emit path.
  Phase 6 adds a check before emitting `UNKNOWN_SEGMENT`: if the
  segment name is in the applied profile's customSegments map,
  skip the warning.
- `src/parser/index.ts::parseHL7` Step 12/13 boundary — where the
  merged dateFormats list is assembled (`options.dateFormats`,
  `profile.dateFormats`, then BUILTIN_DATE_FALLBACKS appended by
  `parseHl7Timestamp` itself).
- `src/parser/index.ts::parseHL7` Step 13 — where `msg.profile`
  attribution lands today. Phase 6 also threads the merged
  `customSegments` map down to the `Hl7Message` constructor so
  Segment wrappers can do named-field lookups.
- `src/model/segment.ts::Segment` — add `get(name)` + constructor
  param.
- `src/model/message.ts::Hl7Message` — add customSegments storage
  field; pass per-segment slice to `Segment` constructor.
- `src/profiles/*` — NEW directory. Holds `define.ts`, `merge.ts`,
  `validate.ts`, `default.ts`, `describe.ts` (or consolidated —
  Claude's Discretion), 5 vendor profile files, and `index.ts`
  barrel.
- `test/fixtures/vendor-shapes/<vendor>/*.hl7` — NEW fixture
  directory. 5 handcrafted files, one per built-in.
- Phase 7 extends this by adding one fixture per Tier 2 scenario
  (TEST-05) and expanding profile fixture coverage (TEST-07/08).
- Phase 8 DOC-07 ("Profiles" section of README) consumes
  `defineProfile` / `extends` / merge semantics / `describe()` /
  `profiles.epic` examples directly. Phase 8 DOC-06 includes
  "Write your first profile in 10 minutes" + "Extending a profile"
  + "Composing profiles" + "Default profile" recipes — all
  consumers of Phase 6's public surface.

</code_context>

<specifics>
## Specific Ideas

- **One-liner acceptance examples** (use as smoke tests during planning):
  - `defineProfile({ name: 'epic', dateFormats: ['MM/DD/YYYY'] })` →
    returns frozen object with `describe()`, empty lineage → `['epic']`.
  - `defineProfile({ name: 'child', extends: epic })` → lineage
    `['epic', 'child']`, inherits epic's dateFormats.
  - `defineProfile({ name: 'custom', customSegments: { ZPI: { fields:
    { mrn: 3, visitId: 5 } } } })` → exposes `seg.get('mrn')` at position 3.
  - `parseHL7(raw, profiles.epic).warnings` — no
    `TIMESTAMP_FALLBACK_FORMAT` for epic dates, no `UNKNOWN_SEGMENT`
    for declared Z-segments.
  - `setDefaultProfile(profiles.epic); parseHL7(raw)` —
    `msg.profile.name === 'epic'`; `setDefaultProfile(null);
    parseHL7(raw)` — `msg.profile === undefined`.
  - `defineProfile({ name: 'bad', customSegments: { PID: {...} } })`
    throws ProfileDefinitionError.
  - `defineProfile({ name: 'typo', dateFormatz: [...] })` throws
    ProfileDefinitionError with "did you mean dateFormats?" hint.

- **Built-in date formats per vendor** (D-24 planner confirms exact
  tokens against `parseHl7Timestamp`'s token set):
  - epic: `['MM/DD/YYYY HH:mm:ss', 'MM/DD/YYYY']`
  - cerner: `['YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DD']`
  - meditech: `['YYYYMMDDHHmm']`
  - athena: `['MM/DD/YYYY']` (+ meridian if supported)
  - genericLab: `['YYYYMMDD HHmm', 'YYYY-MM-DD']`

- **Built-in Z-segments per vendor** (D-24):
  - epic: `ZDP` (department) fields `{ departmentCode: 3,
    departmentName: 4 }`; `ZRS` (result status) fields
    `{ resultStatus: 1, statusDateTime: 2 }`.
  - cerner: `ZDS` (discharge summary) fields
    `{ summaryText: 3 }`; `ZCO` (comment overflow) fields
    `{ commentText: 3, continuationFlag: 5 }`.
  - meditech: `ZVI` (visit info) fields `{ visitReason: 3,
    admitSource: 5 }`.
  - athena: `ZCA` (care team) fields `{ careTeamRole: 3,
    providerId: 5, providerName: 6 }`.
  - genericLab: `ZLB` (lab override) fields `{ specimenOverride: 3,
    methodOverride: 5 }`; `ZNT` (lab note) fields
    `{ noteText: 3 }`.

- **Fixture authoring guide** (for Phase 6 plan author):
  - Synthetic patient: `Smith^John^Q` or `Doe^Jane^A`, MRN format
    `MRN12345` or `EPIC-00001` / `CERN-...` to hint the vendor
    origin.
  - One fixture per vendor; pick a message type natural for the
    quirks (e.g. ADT^A01 for epic/athena, ORU^R01 for cerner/
    genericLab, ADT^A04 for meditech).
  - Include at least one non-HL7 date format from the profile's
    dateFormats list + at least one Z-segment declared in the
    profile.
  - Without profile: parsing emits `TIMESTAMP_FALLBACK_FORMAT`
    (for the vendor date that doesn't match HL7 canonical) +
    `UNKNOWN_SEGMENT` (for Z-segment names not in the core
    registry). With profile: both absent.

- **Lineage test ordering** (D-03 verification):
  - `defineProfile({ name: 'a' })` → lineage `['a']`.
  - `defineProfile({ name: 'b', extends: a })` → `['a', 'b']`.
  - `defineProfile({ name: 'c', extends: [a, b] })` → `['a', 'b', 'c']`
    (not `['a', 'a', 'b', 'c']` — dedupe preserves first).
  - `defineProfile({ name: 'd', extends: c })` → `['a', 'b', 'c', 'd']`.

- **Emitter factoring note:** `src/parser/index.ts` Step 11 emit path
  needs a small conditional on profile-declared Z-segments. Keep the
  check inlined in `emitWarning` or the tokenize invocation — don't
  refactor into a new module. Tokenize itself probably doesn't need
  to know about profiles (it emits a raw warning code; the emit path
  decides whether to actually append it). Planner confirms the
  exact suppression site.

- **Merge helper split:** `mergeCustomSegments(list: readonly
  CustomSegments[])` is the one non-trivial merge — worth its own
  small helper with dedicated tests. Other merges
  (`mergeDateFormats`, `mergeScalars`, `composeOnWarning`) are
  one-liners that may live in `src/profiles/merge.ts`.

- **Test isolation for setDefaultProfile:** every test file that
  touches `setDefaultProfile` MUST include
  `afterEach(() => setDefaultProfile(null))` to prevent bleed-over
  between tests. Call this out in the test plan.

- **Warnings cache / computed list:** `msg.warnings` is frozen at
  construction (Phase 2 D-07). Profile-driven warning SUPPRESSION
  (D-31) happens at emit time, before the warning reaches the
  frozen array — not after.

</specifics>

<deferred>
## Deferred Ideas

- **Dot-path name extension (`msg.get('ZPI.encounterId')`)** — v1
  uses `seg.get(name)` only (D-17). Post-v1 or Phase 8 if README
  examples reveal strong demand.
- **Typed custom-segment field names** (`Segment.get<'encounterId'>`
  with compile-time inference from the declared profile) — v2
  (PROJECT.md "Out of Scope" line item: "Type-safe custom-segment
  field names via conditional types").
- **Overlay named fields on standard segments (PID/OBX/...)** — v2
  typed-overlay feature. Throws in v1 (D-05).
- **Profile-aware serialization** (per-profile Z-segment re-emit
  rules) — rejected for v1 (D-29, PROF-09). `toString()` is
  Postel's-Law conservative forever.
- **`profile` descriptor in toJSON beyond `{ name, lineage }`** —
  rejected (D-30). Functions and mutable registries are not
  serializable.
- **Profile-aware `pickMrn` override** (replace the default
  'MR-first, then first' MRN picker per profile) — v2. Phase 4
  left `pickMrn` exported as a hook point but Phase 6 does not
  consume it.
- **Warning suppression filter in profiles** (`suppressWarnings:
  ['OUT_OF_ORDER_SEGMENT']`) — v2. Profile observers in v1 observe
  only, they do not filter. Suppression is limited to the automatic
  `UNKNOWN_SEGMENT` suppression for declared Z-segments (D-31).
- **New warning code for "custom segment field access failed"** —
  not needed. `seg.get(name)` returns `undefined` silently
  (D-14). No warning.
- **`defineProfile` accepting a lazy closure** (`extends: () =>
  parent`) — v2. Materialized profiles only in v1; side-steps
  ordering concerns.
- **`getDefaultProfile` return type `Profile | null`** — rejected.
  Returns `Profile | undefined` per JavaScript/TypeScript idiom
  (D-18).
- **Auto-reset of default profile between test files** — rejected.
  Tests manage their own cleanup per D-18 JSDoc.
- **Multiple default profiles (stack-based)** — out of scope for
  v1. One default at a time.
- **Profile loader from JSON file** (`loadProfileFromJson(path)`)
  — not needed. `defineProfile` accepts plain objects already;
  consumers can `JSON.parse` a file and pass it in (but
  `onWarning` handlers don't JSON-serialize, so this is an
  advisory at best).
- **Built-in profile versioning** (`profiles.epic.v2` when Epic
  changes a format) — deferred. Consumers use `extends` to
  customize.
- **More than 5 built-ins** (`profiles.npi`, `profiles.quest` etc.)
  — v2 / community contributions via the profile starter kit
  (Phase 8 KIT-01..07).
- **Profile authoring DSL / schema file format** — out of scope.
  `defineProfile(options)` is the authoring API forever.
- **Runtime introspection of profile conflicts during
  `setDefaultProfile`** (warn if overwriting an existing default) —
  v2 observability concern.
- **Second fixture per built-in** (ADT + ORU per vendor, rather
  than one total) — deferred to Phase 7 (TEST-07 expanded
  coverage). One per vendor is the Phase 6 contract (BIP-06).
- **Profile re-export of helper-related customizations** (profile
  declaring `meta.timestamp` should prefer an alt format) — v2.
  Helpers stay profile-agnostic in v1.

</deferred>

---

*Phase: 06-profile-system-and-built-ins*
*Context gathered: 2026-04-19*
