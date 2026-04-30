# Phase 5: Serialization & Round-Trip — Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 ships the **emit half** of the parser: take any `Hl7Message` produced by
`parseHL7`, by Phase 3 mutation, or by the new `buildMessage()` entry point, and
render it as:

- **spec-clean HL7** (`msg.toString()`) — the conservative-emitter side of
  Postel's Law;
- **structured JSON** (`msg.toJSON()`) — snapshot-stable, cross-process-safe
  serialization of the full message body + warnings + profile descriptor;
- **human-readable text** (`msg.prettyPrint()`) — labeled, segment-per-line
  view for logs and debugging;
- **outbound construction** (`buildMessage({...}).addSegment(...).toString()`)
  — build a valid HL7 message from scratch without reading the spec.

The defining invariant is **SER-02**: `parseHL7(msg.toString())` must yield a
message structurally equivalent to `msg` (same segments, fields, repetitions,
components, subcomponents, `isNull` flags, `encodingCharacters`). Structural
— not byte-identical — because the conservative emitter normalizes input
quirks (MLLP/BOM/mixed line endings/custom delimiters) away.

**In scope (SER-01..06):**

- `msg.toString(): string` — spec-clean HL7 emit (SER-01, SER-05).
- Round-trip contract — structural-equivalence guarantee for every fixture
  (SER-02).
- `msg.toJSON(): SerializedMessage` — structured JSON + `JSON.stringify(msg)`
  integration (SER-03).
- `msg.prettyPrint(): string` — single opinionated human-readable format
  (SER-04).
- `buildMessage({...}): Hl7Message` — top-level factory; chains Phase 3
  `addSegment` to compose an outbound message (SER-06).

**Out of scope (belongs to other phases):**

- Profile-aware serialization overrides (custom segment Z-formatting) —
  Phase 6.
- Profile-driven MSH defaults (e.g. `profile.defaults`) — Phase 6.
- MLLP framing on output (`wrapMllp` helper) — deferred; transport concern, not
  serialization. May ship as a Phase 8 example snippet.
- Vendor-quirk round-trip fixtures beyond the canonical set — Phase 7.
- Typed message overlays on `buildMessage` (`buildAdtA01({...})`) — v2.
- Streaming serialization for very large messages — v2.
- Coverage enforcement and full fixture breadth — Phase 7 (`pnpm test:coverage`).

**Compose, don't reach through.** Serializer code MUST build on the existing
`rawSegments` tree + `encodingCharacters` + `Hl7Message` surface. It MUST NOT
re-parse, mutate warnings, or introduce a parallel representation of message
state. `buildMessage()` creates a real `Hl7Message` — not a builder subtype —
so every `Hl7Message` API (get, segments, meta, patient, addSegment, setField,
removeSegment, toString, toJSON, prettyPrint) works identically on parsed and
built messages.

</domain>

<decisions>
## Implementation Decisions

### toString() emission & normalization

- **D-01: `msg.toString()` walks `rawSegments` verbatim.** The positional
  `RawSegment` tree is the single source of truth for emit. Phase 3 mutation
  already rebuilds the tree leaf-to-root (Phase 3 D-16), so mutated fields
  are captured automatically and un-mutated fields round-trip byte-for-byte
  through re-escape. No separate "dirty tracking", no wrapper-driven rebuild.
- **D-02: Emit strips trailing empty repetitions / components / subcomponents
  per HL7 convention.** `PID|1||Doe^^^` normalizes to `PID|1||Doe`. An HL7
  field/component/subcomponent with no trailing content is semantically absent,
  and spec-clean output omits it. **`RawField.isNull === true` is preserved as
  `""` on output** — null is a distinct HL7 value from absent and MUST round-trip.
- **D-03: SER-02 "equivalent message" is structural, not string-identical.**
  The round-trip test asserts `parseHL7(msg.toString())` yields a message whose
  `rawSegments` tree is deeply equal to `msg.rawSegments` (same segment
  names/count, same `RawField.isNull` flags, same repetitions/components/
  subcomponents arrays, same `encodingCharacters`). Byte-identical toString
  idempotency is NOT required — conservative emission deliberately normalizes
  MLLP/BOM/whitespace/line-ending/custom-delimiter input quirks away, so those
  fixtures round-trip to a *different* (spec-clean) string on the first pass
  but a *stable* string from the second pass onward.
- **D-04: Re-escape scope covers the 5 active delimiters only; hex, `.br`,
  and `\Z..\` sequences pass through as decoded literals.** Every emitted
  field/component/subcomponent string runs through Phase 2's existing
  `reescape()` (`src/parser/escapes.ts`), which handles `\F\`, `\S\`, `\T\`,
  `\R\`, `\E\`. Hex `\X..\`, `\.br\`, and unknown `\Z..\` sequences were
  decoded on parse into literal bytes/`\n`/verbatim text; Phase 5 does NOT
  re-encode them back. Callers who need lossless binary-byte round-trip
  should treat Field.value as already-decoded text, consistent with Phase 2's
  handling. This keeps the `Field.value` mental model stable: "plain decoded
  text in, plain decoded text out."
- **D-05: Segment terminator is strict CR (`\r`) between every pair of
  segments plus one trailing CR at end of output.** HL7 spec mandates CR.
  Input that parsed with CRLF or LF (Phase 2 normalization) emits canonical
  CR — this is the "spec-clean" promise. No configuration knob in v1.
- **D-06: MSH-1 and MSH-2 are emitted verbatim from
  `msg.encodingCharacters`.** MSH-1 = `enc.field` (one char). MSH-2 =
  `enc.component + enc.repetition + enc.escape + enc.subcomponent`
  (4 chars, fixed order). These two positions bypass the normal field-join
  path entirely — the emitter inlines them after `MSH`, then resumes normal
  delimiter-joined emission from MSH-3 onward. This is the inverse of
  Phase 2 `readDelimiters`.
- **D-07: `toString()` is a pure function — never warns, never throws.** If a
  message parsed cleanly, it serializes cleanly. Warnings are frozen on
  `Hl7Message` construction (Phase 2 D-07); the serializer MUST NOT append.
  Composite parsers are silent (Phase 3 D-09); the serializer is too.
- **D-08: `toString()` does NOT wrap output in MLLP framing (`\x0B ... \x1C\x0D`).**
  MLLP is a transport concern. Phase 2 `stripMllp` is one-way and explicit;
  output belongs in a separate transport helper if ever needed. Not in v1.
  A `wrapMllp()` utility may land later as a Phase 8 example.

### buildMessage() API

- **D-09: `buildMessage({...}): Hl7Message` is a top-level named export** from
  `src/index.ts`, symmetric with `parseHL7`. Implementation lives under a new
  `src/builder/` directory (peer to `parser/`, `model/`, `helpers/`) — file:
  `src/builder/build-message.ts`. Not a method on `Hl7Message`, not nested
  under the `HL7` namespace (which stays types-only per Phase 3 D-13).
- **D-10: Init accepts semantic MSH fields with auto-defaults.** Shape:
  ```
  interface BuildMessageInit {
    type: string;              // e.g. 'ADT^A01' OR {code, trigger, structure} — planner confirms (see Claude's Discretion)
    sendingApp?: string;
    sendingFacility?: string;
    receivingApp?: string;
    receivingFacility?: string;
    controlId?: string;        // auto-generated if absent (D-12)
    timestamp?: Date | string; // accepts Date (preferred) or pre-formatted HL7 TS string; defaults to now (D-13)
    version?: string;          // defaults to '2.5'
    processingId?: string;     // defaults to 'P'
  }
  ```
  Mirrors the Phase 4 `msg.meta` read shape so callers see a symmetric
  read/write surface. Rejects the "raw MSH array" alternative because it
  contradicts the "without reading the HL7 spec" north star.
- **D-11: buildMessage() synthesizes a complete MSH `RawSegment` internally**
  and hands it to `new Hl7Message({...})` as the sole initial segment.
  Subsequent `.addSegment(name, fields)` calls — using the existing Phase 3
  mutation method unchanged — append PID / OBX / etc. No builder-specific
  addSegment overload. No Builder wrapper type. No staged `.build()` terminal.
  The return value IS an `Hl7Message`.
- **D-12: `controlId` auto-generator: `YYYYMMDDHHmmssSSS` (17 chars) + 6
  random alphanumeric chars = 23 chars total.** Uses `Date.now()` and
  `Math.random()` — no external deps. Uniqueness is strong enough for
  outbound messages in tests and small tools; callers with stricter
  requirements supply their own `controlId`.
- **D-13: `timestamp` accepts `Date` (preferred) or a pre-formatted HL7 TS
  string; defaults to `new Date()`.** When a `Date` is supplied, it formats
  to HL7 `YYYYMMDDHHmmss` (second precision, UTC). Sub-second precision is
  NOT emitted from `Date` input (HL7 TS supports `.SSSS` but Phase 4
  `msg.meta.timestamp` returns a `Date` with ms precision — the asymmetry
  is acceptable since most outbound use cases don't need sub-second).
- **D-14: Encoding characters on built messages are always the defaults
  (`|^~\&`).** No option to customize in `buildMessage` — callers who need
  vendor delimiters on output should parse an existing message with those
  delimiters and emit via `toString`. This preserves the "buildMessage
  always emits spec-clean" mental model. Also avoids a second code path
  for encoding-char validation in the builder.
- **D-15: `buildMessage()` accepts field inputs in the same shape as Phase 3
  `addSegment`: `readonly string[]`.** Each string is a raw field value.
  Callers encode components/reps/subs using the spec delimiters (`^`, `~`,
  `&`) or plain strings for simple fields. This is the smallest possible new
  API surface — `buildMessage` adds no new field-input convention beyond
  what Phase 3 already supports. Composite-object inputs (`{ family: 'Doe',
  given: 'John' }`) are explicitly deferred to v2.
- **D-16: Validation on init — missing `type` throws a `TypeError` with an
  actionable message.** `type` is the only required field. Every other
  field is optional and falls to auto-defaults. Planner decides whether
  `type` is validated against a known-structures list (probably no — keep
  open for Z-event-codes) or accepted as any non-empty string.

### toJSON() shape

- **D-17: `msg.toJSON()` returns a raw-tree mirror.** Shape:
  ```
  interface SerializedMessage {
    encodingCharacters: { field, component, repetition, escape, subcomponent };
    segments: ReadonlyArray<{
      name: string;
      fields: ReadonlyArray<{
        repetitions: ReadonlyArray<{
          components: ReadonlyArray<{ subcomponents: readonly string[] }>;
        }>;
        isNull: boolean;
      }>;
    }>;
    warnings: readonly Hl7ParseWarning[];
    profile?: { name: string; lineage: readonly string[] };
  }
  ```
  This is a direct JSON-safe projection of `rawSegments` + frozen warnings
  + optional profile descriptor. Round-trippable (future work could add
  `fromJSON` but it's deferred to v2). Snapshot-stable — segment order is
  preserved, `isNull` flag is preserved, no computed helpers baked in.
- **D-18: `toJSON()` is defined as a class method on `Hl7Message`** so
  `JSON.stringify(msg)` invokes it automatically (JS language contract).
  Callers can also call `msg.toJSON()` directly. Both paths produce the
  same object. No second method name (no `asPlainObject()`).
- **D-19: Warnings array is always present** on the serialized output, even
  when empty (`warnings: []`). Stable shape simplifies consumer parsing.
- **D-20: `profile` field appears only when `msg.profile` is truthy.** When
  present, it contains only `name` and `lineage` — non-serializable handlers
  (`onWarning`) and mutable registries (`customSegments`, `dateFormats`) are
  omitted. This matches what Phase 6 will expose on the live `msg.profile`
  read surface.
- **D-21: The exported TypeScript type is `SerializedMessage`** (named
  export from `src/index.ts`). Phase 7 tests and Phase 8 docs reference it.
  Not placed under the `HL7` namespace — `HL7` is composite-type territory
  (XPN/XAD/etc.), and `SerializedMessage` is a full-message shape.

### prettyPrint() format

- **D-22: `msg.prettyPrint(): string` has no options — single opinionated
  format.** Minimal API surface. If Phase 8 examples surface a dominant
  alternate format, Phase 6 profile-aware overrides OR a v2 options bag can
  ship later. No colors, no truncation, no depth knob in v1.
- **D-23: Layout is segment-per-line with labeled fields.** Example:
  ```
  HL7 ADT^A01^ADT_A01  controlId=MSG00001  timestamp=2026-04-19T10:15:00Z  (5 segments)
  MSH  [3]=SENDAPP  [4]=SENDFAC  [5]=RECVAPP  [6]=RECVFAC  [7]=20260419101500  [9]=ADT^A01  [10]=MSG00001  [11]=P  [12]=2.5
  PID  [1]=1  [3]=MRN12345  [5]=Smith^John^Q  [7]=19800115  [8]=M
  PV1  [2]=I  [3]=ICU^101^A  [44]=20260419080000
  OBX  [1]=1  [2]=NM  [3]=GLUC^Glucose^LN  [5]=95  [6]=mg/dL^^UCUM
  ```
  Field values shown verbatim with active delimiters; empty trailing
  positions suppressed (matches D-02). Field numbers in brackets use the
  HL7 1-indexed convention (for MSH this means MSH-3 is the first content
  field, consistent with `msg.get('MSH.3')`).
- **D-24: Resolution depth stops at the field level.** Composite values
  render as their raw HL7 string (`Smith^John^Q`). Callers who need
  component breakdown use `msg.get('PID.5.1')` or `msg.patient.givenName`.
  Keeps the output terminal-friendly and avoids a per-segment composite-type
  registry.
- **D-25: First line is a metadata header** derived from `msg.meta`:
  `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`. Missing
  meta fields (rare — MSH is guaranteed by Phase 2 Tier-3) render as `-`.
  No warnings count, no profile name — those live in `toJSON` territory;
  prettyPrint is a body view.
- **D-26: `prettyPrint()` is a pure function — never warns or throws**
  (same policy as `toString`, D-07).

### Shared serialization conventions

- **D-27: No new `WarningCode` entries.** Serializers are silent.
- **D-28: No new fatal `Hl7ParseError` codes.** The 4 Tier-3 codes from
  Phase 2 remain the complete fatal set for v1.
- **D-29: All three emitters (`toString`, `toJSON`, `prettyPrint`) are
  defined as class methods on `Hl7Message`**, alongside the Phase 3
  mutation methods and Phase 4 helper getters. No separate `serialize`
  module is exported from `src/index.ts`. Internals live under
  `src/serialize/` (or similar — planner decides). The public surface is
  `msg.toString()`, `msg.toJSON()`, `msg.prettyPrint()`, plus the
  top-level `buildMessage` factory.
- **D-30: No emitter caching in v1.** Each call re-walks `rawSegments`.
  Cheap for typical message sizes (< 5ms per PROJECT.md). Mutation would
  otherwise need to invalidate emit caches too — extra complexity for no
  known hot-path. Revisit in Phase 7 if profiling warrants.
- **D-31: Zero runtime deps preserved** — Phase 5 adds no new `dependencies`
  block entries. `reescape` (Phase 2), `Hl7Message` raw tree (Phase 3),
  and `msg.meta` (Phase 4) are the only building blocks consumed.

### Claude's Discretion

- Exact file layout under `src/serialize/` (e.g. `src/serialize/to-string.ts`,
  `to-json.ts`, `pretty-print.ts`, or a single `index.ts` with private
  helpers). Planner decides based on file-size targets.
- Whether `toString()` internally uses a per-segment emitter array (one
  function per segment special case) or a single generic walker. A generic
  walker suffices for v1 because MSH-1/MSH-2 is the only special case
  (D-06). Go with the simpler option unless testing surfaces a reason.
- Whether `buildMessage.init.type` is a single string (`'ADT^A01'`) that
  the builder parses into MSH-9 components, or a discriminated object
  (`{ code: 'ADT', trigger: 'A01', structure?: 'ADT_A01' }`). Recommendation:
  accept both — parse a `^`-delimited string into the three parts
  automatically. Keeps one-liner DX (`buildMessage({ type: 'ADT^A01', ... })`)
  without preventing structured input.
- Whether `timestamp` in `BuildMessageInit` accepts a `Date | string` union
  or forces `Date`. Recommendation: union — a pre-formatted HL7 TS string
  passes through verbatim (lets callers supply vendor-specific precision);
  a `Date` formats to `YYYYMMDDHHmmss`. Planner confirms.
- Exact `controlId` random-suffix alphabet (alphanumeric vs alphanumeric
  minus ambiguous chars like `0OIl`). Recommendation: plain alphanumeric
  — outbound IDs aren't human-typed, readability doesn't matter.
- Whether `prettyPrint` header line includes segment count. Recommendation:
  yes (D-25). Cheap to compute and orients the reader.
- Whether `SerializedMessage.segments[i].fields[j].repetitions` is omitted
  when the field has zero repetitions AND `isNull === false` (fully absent
  field) vs always present as `[]`. Recommendation: always `[]` for
  shape-stability. Planner confirms.
- Whether `buildMessage` returns a frozen `Hl7Message` or a mutable one.
  Phase 3's `addSegment` mutation method works on regular `Hl7Message`
  instances without freeze, so returning a regular instance keeps the
  chainable `buildMessage({...}).addSegment(...).addSegment(...)` pattern
  working. Planner confirms.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints

- `.planning/PROJECT.md` — north star, Key Decisions (Postel's Law —
  conservative emitter; zero runtime deps; immutability; fatal errors
  limited to 4 Tier-3 codes; `setDefaultProfile` discouraged but exists).
- `CLAUDE.md` — engineering guardrails (no `any`, JSDoc `@example` on
  public exports, immutability, no `console.*`, strict TS +
  `noUncheckedIndexedAccess`, short testable functions).

### Requirements (locked acceptance criteria)

- `.planning/REQUIREMENTS.md` §Serialization & Round-Trip — SER-01
  (toString spec-clean), SER-02 (round-trip equivalence), SER-03
  (toJSON structured JSON), SER-04 (prettyPrint multi-line string),
  SER-05 (re-escape on serialize), SER-06 (buildMessage constructs
  outbound HL7).

### Roadmap & success criteria

- `.planning/ROADMAP.md` — Phase 5 goal + 4 success criteria;
  parallelization notes (toString/toJSON disjoint → parallelizable;
  prettyPrint/buildMessage independent; round-trip sweep is final plan).
- `.planning/STATE.md` — current position, Phase 4 accumulated decisions
  relevant here (helper shape mirrors BuildMessageInit; cache invalidation
  pattern extends to emitter caches if ever added).

### Prior phase artifacts — Phase 2 (parser + escapes + warnings)

- `.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md` — fatal
  error inventory (4 Tier-3 codes), `Hl7Message` shell shape, warnings
  frozen (D-07), `encodingCharacters` stored on message.
- `src/parser/escapes.ts::reescape` — **the single re-escape primitive
  Phase 5 consumes**. Handles all 5 active delimiters + escape char.
  Phase 5 does NOT re-encode hex `\X..\`, `\.br\`, or unknown `\Z..\`
  sequences (D-04).
- `src/parser/types.ts` — `RawSegment`, `RawField` (with `isNull` flag),
  `RawRepetition`, `RawComponent`, `EncodingCharacters`. The emitter
  walks these shapes directly (D-01).
- `src/parser/dates.ts::parseHl7Timestamp` — used by `msg.meta` (Phase 4).
  Phase 5's `buildMessage` uses the INVERSE direction: format `Date` →
  HL7 `YYYYMMDDHHmmss` string (D-13). Small new helper — probably lives
  at `src/builder/format-timestamp.ts`.
- `.planning/phases/02-core-parser-and-tolerance/02-06-SUMMARY.md` —
  `parseHL7` public entry (reference point for `buildMessage`'s
  symmetry).

### Prior phase artifacts — Phase 3 (structural model + mutation)

- `.planning/phases/03-structural-model-and-types/03-CONTEXT.md` —
  D-16 (mutation values verbatim; re-escape deferred to Phase 5
  serializer — this phase makes good on that promise); D-15 (mutation
  methods are chainable — Phase 5 needs this for the buildMessage
  `.addSegment(...).addSegment(...)` fluent chain); D-19 (segment name
  regex); D-24 (NaN-gate on TS — informs buildMessage's Date → TS format
  direction).
- `.planning/phases/03-structural-model-and-types/03-PLAN-04-mutation-and-barrel.md`
  — `addSegment` / `setField` / `removeSegment` shapes. Phase 5's
  `buildMessage` consumes `addSegment` unchanged (D-11).
- `src/model/message.ts::Hl7Message` — target class for `toString`,
  `toJSON`, `prettyPrint` methods (D-29). Constructor signature
  (`Hl7MessageInit`) is the contract `buildMessage` must satisfy.

### Prior phase artifacts — Phase 4 (named helpers)

- `.planning/phases/04-named-helpers/04-CONTEXT.md` — D-01..D-24
  decisions on helper shape. `msg.meta` is the read-side symmetric
  companion to `buildMessage` init (same MSH fields). D-02 helper cache
  invalidation pattern does NOT need extension for emitters (D-30: no
  emit caching in v1).
- `src/helpers/meta.ts::buildMeta` — `msg.meta` shape. `BuildMessageInit`
  mirrors it 1:1 (D-10). Use the SAME field names
  (sendingApp/sendingFacility/etc.) so read and write surfaces are
  symmetric.

### Existing code surfaces

- `src/index.ts` — public barrel. Phase 5 adds: `buildMessage` (value),
  `SerializedMessage` (type). `Hl7Message` gains three instance methods
  (`toString`, `toJSON`, `prettyPrint`); no new import needed by
  consumers.
- `src/parser/escapes.ts::reescape(input, enc)` — exact signature the
  emitter uses.
- `src/parser/warnings.ts::Hl7ParseWarning` — warning shape inlined in
  `SerializedMessage.warnings`.
- `src/parser/types.ts::DEFAULT_ENCODING_CHARACTERS` — `buildMessage`
  uses this constant directly (D-14).

### External specs (reference only — developer shouldn't need to read)

- HL7 v2.5.1 Chapter 2 §2.7 (Encoding Rules) — confirms the 5 active
  delimiters that `reescape` handles; informs D-04 scope boundary.
- HL7 v2.5.1 Chapter 2 §2.11 (MSH definition) — confirms MSH-1/MSH-2
  special handling (D-06) and MSH field positions for
  `BuildMessageInit` mapping (D-10).
- Not vendored. Phase 7 may reference for vendor-quirk fixture
  authoring; Phase 5 planner only needs the positions already captured
  in Phase 4's `msg.meta`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/parser/escapes.ts::reescape(input, enc): string` — **drop-in
  primitive** for D-04. Call on every field/component/subcomponent string
  before emitting.
- `src/parser/types.ts::{RawSegment, RawField, RawRepetition, RawComponent,
  EncodingCharacters, DEFAULT_ENCODING_CHARACTERS}` — complete type surface
  for the emitter walker. `RawField.isNull` is the flag that distinguishes
  `""` (D-02) from absent.
- `src/model/message.ts::Hl7Message` — target class for the three emit
  methods. Already holds `rawSegments`, `encodingCharacters`, `warnings`,
  optional `profile`. Constructor accepts `Hl7MessageInit` — `buildMessage`
  just builds a valid init with a synthetic MSH RawSegment.
- `src/model/message.ts::Hl7Message.addSegment(name, fields)` — Phase 3
  mutation method reused verbatim by `buildMessage` (D-11). Same
  validation, same cache invalidation, same chainable return.
- `src/model/message.ts::Hl7Message.setField(path, value)` — not
  consumed by Phase 5 directly, but `buildMessage` callers use it
  post-construction for anything MSH-like buildMessage doesn't take as
  init (e.g. MSH-13 sequence number).
- `src/helpers/meta.ts` — `Meta` shape is the semantic mirror of
  `BuildMessageInit`. Reuse field names exactly.
- `src/parser/dates.ts::parseHl7Timestamp` — NOT called by Phase 5. The
  builder's `Date → HL7 TS` direction is a new small helper (likely
  `src/builder/format-timestamp.ts`).

### Established Patterns

- **Barrel export via `src/index.ts`:** Phase 5 adds `buildMessage`
  (value) and `SerializedMessage` (type). Conforms to Phases 1–4
  conventions.
- **Top-level factory pattern:** Phase 2 shipped `parseHL7` as the sole
  entry-point factory. Phase 5 adds `buildMessage` as the symmetric
  outbound factory. Both return `Hl7Message` (D-09).
- **Emitter purity:** Phase 3 composite parsers are silent (D-09);
  Phase 4 helpers never throw (D-22); Phase 5 emitters never warn or
  throw (D-07, D-26). Consistent "read-only views never fail" stance.
- **Zero new runtime deps:** Phase 1 locked this down. Phase 5 uses
  only stdlib (`Date`, `Math.random`, `String` methods) for the new
  builder/timestamp/controlId logic.
- **Test convention:** `test/*.test.ts`. Phase 5 tests will land as
  `test/serialize-to-string.test.ts`, `test/serialize-to-json.test.ts`,
  `test/serialize-pretty-print.test.ts`, `test/builder.test.ts`, plus
  a `test/round-trip.test.ts` fixture sweep (Phase 7 expands this).
- **JSDoc `@example` on every public export:** enforced by ESLint
  (`require-example`). `buildMessage`, `SerializedMessage`, and each of
  the three new `Hl7Message` methods need at least one `@example`.

### Integration Points

- `Hl7Message` class is the SOLE class extended. Phase 5 adds three
  instance methods (`toString`, `toJSON`, `prettyPrint`).
  `buildMessage` is a factory — it does NOT introduce a subclass
  `Hl7MessageDraft` or a parallel `MessageBuilder` type (D-09, D-11).
- Parser pipeline is untouched. `parseHL7` remains the only inbound
  factory; Phase 5 only adds outbound capability.
- Phase 4 helpers require no changes. They consume `rawSegments` through
  the Phase 3 read surface, which is unchanged.
- Phase 6 profile integration: profiles can register serialization
  overrides later (e.g. custom Z-segment re-emit). The Phase 5 emitter
  implementation should be structured so a profile hook (future) can
  substitute per-segment emit logic without refactoring the walker.
  **Planner recommendation:** factor out `emitSegment(segment, enc): string`
  and `emitField(field, enc): string` as module-level functions — a
  Phase 6 profile can then compose around them.
- Phase 7 adds vendor-quirk fixture round-trip tests. Phase 5 ships the
  canonical fixture sweep; Phase 7 adds breadth (MLLP inputs, BOM
  inputs, custom-delimiter inputs all emit spec-clean output that
  round-trips).
- Phase 8's `examples/modify-and-resend.ts` (EX-03) is a direct consumer
  of `parseHL7 → setField → toString` and `buildMessage → addSegment →
  toString`. Phase 5 delivers both flows.

</code_context>

<specifics>
## Specific Ideas

- **One-liner acceptance examples** (use as smoke tests during planning):
  - `parseHL7(raw).toString()` → spec-clean HL7 string (CR-separated).
  - `parseHL7(parseHL7(raw).toString())` → structurally equivalent to
    `parseHL7(raw)` (SER-02).
  - `JSON.stringify(msg)` → valid JSON mirroring `rawSegments`.
  - `msg.prettyPrint()` → multi-line string with labeled fields (one
    segment per line).
  - `buildMessage({ type: 'ADT^A01', sendingApp: 'CLINIC',
    receivingApp: 'LAB' }).addSegment('PID', ['', '', 'MRN123', '',
    'Doe^John']).toString()` → valid outbound HL7 message.

- **Round-trip test fixture strategy** (starter set for Phase 5; Phase 7
  expands):
  - Canonical ADT^A01 (clean HL7 with no quirks).
  - ORU^R01 with OBX repetitions.
  - Message with explicit `""` null fields (verifies D-02 isNull
    preservation).
  - Message with embedded delimiters in user data (verifies D-04
    reescape: `Smith\F\Jones` round-trips to the literal `|`
    character).
  - Message with decoded `\.br\` newlines (verifies D-04 pass-through:
    the newline stays literal; re-parse produces the same Field.value).

- **`toString` MSH emission trace** (for planner TDD):
  ```
  MSH + enc.field + enc.component + enc.repetition + enc.escape +
    enc.subcomponent + enc.field + <emit fields MSH-3..N joined by
    enc.field, each reescaped>
  ```

- **Assert identity equality after serialize:** `msg.meta === msg.meta`
  still holds (emitter is pure; no cache invalidation). Same for
  `msg.patient`, `msg.visit` (Phase 4 D-02 still applies — emitters
  never mutate, never invalidate).

- **`buildMessage` DX test:** `buildMessage({ type: 'ADT^A01' }).toString()`
  with zero other args must produce a valid parseable HL7 message (all
  required MSH fields auto-defaulted).

- **XCN decision follow-up (from Phase 4 D-24):** `buildMessage`
  callers who want to set an attending doctor use the raw string form
  (`'12345^Smith^John^^^^MD'`) in addSegment fields. No new composite-
  object input path (D-15).

- **No `fromJSON(serialized): Hl7Message`.** Deferred to v2 with other
  "structured construction" features. `buildMessage` + `addSegment` is
  sufficient for v1 outbound needs.

- **Emitter factoring hint:** Keep `emitSegment(seg, enc)` and
  `emitField(field, enc)` exported-from-module (but not re-exported from
  `src/index.ts`) so Phase 6 profile hooks can compose. These are
  internal APIs until Phase 6 promotes them.

</specifics>

<deferred>
## Deferred Ideas

- **`wrapMllp(hl7: string): string` transport utility** — Phase 8
  example or v2. Not in Phase 5 scope (D-08).
- **`fromJSON(serialized): Hl7Message`** — structured-JSON ingestion.
  Deferred to v2.
- **Configurable segment terminator** (`\r\n`, `\n`) — rejected for v1
  (D-05). Postel's Law.
- **prettyPrint options bag** (`{ colors, depth, maxSegments, showWarnings }`)
  — rejected for v1 (D-22). Revisit if Phase 8 examples reveal a need.
- **Composite-object inputs for `addSegment` at build time** (`{ family,
  given }` instead of raw strings) — deferred to v2 (D-15).
- **Emitter output caching** — rejected for v1 (D-30). Revisit with
  Phase 7 profiling.
- **Round-trip re-encoding of hex `\X..\` / `.br` / unknown `\Z..\`
  sequences** — rejected for v1 (D-04). Callers treat Field.value as
  already-decoded text.
- **Typed message builder overloads** (`buildAdtA01({...})`,
  `buildOruR01({...})`) — v2 typed-overlay feature.
- **Profile-aware outbound serialization** (per-profile Z-segment
  re-emit rules) — Phase 6.
- **Custom encoding characters on built messages** — rejected for v1
  (D-14).
- **Streaming serialization for large messages** — v2.
- **MLLP / transport `toString({ mllp: true })` option** — rejected
  (D-08); composability of `wrapMllp` is preferred when/if it ships.
- **Emitter warnings** (e.g. `TIMESTAMP_PRECISION_LOST`,
  `CONTROL_ID_AUTOGEN`) — rejected (D-27). Emitters stay silent.

</deferred>

---

*Phase: 05-serialization-and-round-trip*
*Context gathered: 2026-04-19*
