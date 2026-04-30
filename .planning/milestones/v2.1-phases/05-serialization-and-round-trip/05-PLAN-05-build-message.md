---
phase: 05-serialization-and-round-trip
plan: 05
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/builder/build-message.ts
  - src/builder/format-timestamp.ts
  - src/builder/control-id.ts
  - test/builder.test.ts
  - test/builder-format-timestamp.test.ts
  - test/builder-control-id.test.ts
autonomous: true
requirements: [SER-06]

must_haves:
  truths:
    - "A developer calling `buildMessage({ type: 'ADT^A01' })` receives an `Hl7Message` whose `toString()` output is a valid HL7 message — `parseHL7(buildMessage({type:'ADT^A01'}).toString())` yields an equivalent Hl7Message without throwing."
    - "A developer calling `buildMessage({ type: 'ADT^A01', sendingApp: 'CLINIC' }).addSegment('PID', ['', '', 'MRN123', '', 'Doe^John'])` can chain `.addSegment(...)` multiple times and the final `.toString()` emits a valid, spec-clean HL7 message."
    - "A developer omitting `controlId` receives an auto-generated 23-character ID matching `/^[0-9]{17}[A-Za-z0-9]{6}$/` (D-12)."
    - "A developer omitting `timestamp` receives the current time formatted to HL7 `YYYYMMDDHHmmss` UTC (D-13)."
    - "A developer supplying `timestamp: new Date('2026-04-19T10:15:00Z')` sees MSH-7 emit as `20260419101500` (14 chars, second precision)."
    - "A developer supplying `timestamp: '20260419101530.1234+0500'` (pre-formatted HL7 TS string) sees that exact string passed through verbatim into MSH-7."
    - "A developer passing `{ type: '' }` or `{ type: undefined as unknown }` sees a `TypeError` with an actionable message (D-16)."
    - "A developer inspecting the built message sees `msg.encodingCharacters` === `DEFAULT_ENCODING_CHARACTERS` (`|^~\\&`) regardless of any other input (D-14)."
    - "A developer reading the JSDoc on `BuildMessageInit` (or on `buildMessage`) learns that empty-string and omitted fields produce IDENTICAL wire output (both emit as absent); to emit HL7 explicit null `\"\"`, call `.setField(path, '\"\"')` after construction (W1 — landed at the interface level in Plan 01, reinforced on the function doc here in Plan 05)."
  artifacts:
    - path: "src/builder/format-timestamp.ts"
      provides: "formatHl7Timestamp body — Date → YYYYMMDDHHmmss UTC"
      exports: ["formatHl7Timestamp"]
    - path: "src/builder/control-id.ts"
      provides: "generateControlId body — 17-char timestamp + 6 alnum = 23 chars"
      exports: ["generateControlId"]
    - path: "src/builder/build-message.ts"
      provides: "buildMessage body — synth MSH RawSegment + new Hl7Message; function-level JSDoc reinforces W1 empty-vs-null note"
      exports: ["buildMessage"]
    - path: "test/builder-format-timestamp.test.ts"
      provides: "Unit coverage — padding, UTC, known-fixture timestamps, month 0-indexed fix"
    - path: "test/builder-control-id.test.ts"
      provides: "Unit coverage — length 23, alphabet, timestamp prefix, uniqueness across back-to-back calls"
    - path: "test/builder.test.ts"
      provides: "Integration coverage — default shape, override shape, addSegment chaining, type validation, round-trip parse, BuildMessageInit all fields, encoding-chars locked to defaults, empty-vs-null wire equivalence + explicit-null via .setField"
  key_links:
    - from: "src/builder/build-message.ts::buildMessage"
      to: "new Hl7Message({ segments: [msh], encodingCharacters, version, warnings: [] })"
      via: "D-11 internal synthesis"
      pattern: "new Hl7Message\\("
    - from: "src/builder/build-message.ts"
      to: "src/builder/format-timestamp.ts + src/builder/control-id.ts"
      via: "default-value suppliers for timestamp + controlId"
      pattern: 'import \{ formatHl7Timestamp \}|import \{ generateControlId \}'
    - from: "src/builder/build-message.ts"
      to: "src/parser/delimiters.ts::DEFAULT_ENCODING_CHARACTERS"
      via: "D-14 encoding chars always default"
      pattern: "DEFAULT_ENCODING_CHARACTERS"
    - from: "buildMessage(...).addSegment(...)"
      to: "Hl7Message.addSegment (Phase 3 method, unchanged)"
      via: "D-11/D-15 chain — fluent append using existing mutation method"
      pattern: "\\.addSegment\\("
---

<objective>
Fill the three stub bodies under `src/builder/` — `build-message.ts`,
`format-timestamp.ts`, `control-id.ts` — so `buildMessage({...}).addSegment(...)
.toString()` constructs a valid outbound HL7 message from scratch. This plan
CLOSES **SER-06**.

**Body-only edits:** Plan 01 shipped:
- `src/builder/build-message.ts` with module JSDoc (INCLUDING the W1
  "empty-vs-null wire semantics" paragraph) + `BuildMessageInit` interface
  (LIVE, locked by D-10, WITH W1 JSDoc example showing `.setField(path,
  '""')` for explicit null) + `buildMessage(_init): Hl7Message` stub.
- `src/builder/format-timestamp.ts` with module JSDoc + `formatHl7Timestamp(_date): string` stub.
- `src/builder/control-id.ts` with module JSDoc + `generateControlId(): string` stub.

Plan 05 ONLY replaces the three function bodies and adds tests. Do NOT
touch the module JSDocs, the `BuildMessageInit` interface, imports above
the signatures, or `src/model/message.ts` / `src/index.ts` (Plan 01 wired
the `buildMessage` + `BuildMessageInit` + `SerializedMessage` barrel exports
already). DO extend the function-level JSDoc on `buildMessage` to
reinforce the W1 empty-vs-null note (so developers reading the impl-side
doc see the same contract the interface-level doc already promises).

**Decisions implemented verbatim:**

- **D-09 top-level export:** `buildMessage` is a top-level named export
  from `src/index.ts` (Plan 01 shipped). Lives at `src/builder/build-message.ts`.
  Not a method on `Hl7Message`; not nested under the `HL7` namespace.
- **D-10 init shape:** locked in Plan 01. DO NOT modify `BuildMessageInit`.
  Exact fields:
  - `type: string` (required)
  - `sendingApp?: string`
  - `sendingFacility?: string`
  - `receivingApp?: string`
  - `receivingFacility?: string`
  - `controlId?: string` (auto-generated if absent via D-12)
  - `timestamp?: Date | string` (Date → HL7 TS via D-13; string passed verbatim; default `new Date()`)
  - `version?: string` (default `"2.5"`)
  - `processingId?: string` (default `"P"`)
- **D-11 internal synthesis:** `buildMessage` synthesises a complete MSH
  `RawSegment` and hands to `new Hl7Message({ segments: [msh], ... })`.
  Subsequent `.addSegment(name, fields)` calls use the unchanged Phase 3
  mutation method. No builder subtype, no `.build()` terminal, no staged
  wrapper.
- **D-12 controlId auto-generator:** `YYYYMMDDHHmmssSSS` (17 chars, UTC,
  millisecond precision, zero-padded) + 6 random alphanumeric chars
  `[A-Za-z0-9]` = 23 chars total. Uses `Date.now()` + `Math.random()`.
  Zero deps.
- **D-13 timestamp:** when `init.timestamp` is a `Date`, format to HL7
  `YYYYMMDDHHmmss` (UTC, second precision) via `formatHl7Timestamp`.
  When it's a string, pass through verbatim. When absent, default to
  `new Date()` then format.
- **D-14 encoding chars:** always `DEFAULT_ENCODING_CHARACTERS` from
  `src/parser/delimiters.ts`. No option to customise — callers who need
  vendor delimiters should parse an existing message and emit via
  `toString`.
- **D-15 addSegment input:** unchanged from Phase 3 — `readonly string[]`.
  No composite-object inputs in v1. Callers encode components/repetitions/
  subcomponents using the spec delimiters (`^`, `~`, `&`).
- **D-16 validation:** `type` is the only required field. When absent,
  empty, or not a string, throw `TypeError` with an actionable message.
  (Claude's Discretion says "probably no — keep open for Z-event-codes":
  DO NOT validate `type` against a known-structures list. Any non-empty
  string is accepted.)
- **D-07 purity:** the builder does NOT warn — the resulting `Hl7Message`
  has `warnings: []`. No throw for anything except the explicit D-16
  validation.

**W1 empty-vs-null wire semantics (reinforced at function level):**

At the HL7 wire level, passing `sendingApp: ""` and omitting `sendingApp`
produce IDENTICAL output (both emit `||` at the MSH-3 position). This is
correct per the HL7 spec — the two forms are indistinguishable on the
wire.

If a user needs to emit an HL7 explicit null (`""`, the two-char literal)
at a specific position in an outbound message, they should build the
message first and then call the Phase 3 mutation method:

```ts
const msg = buildMessage({ type: "ADT^A01" });
msg.setField("PID.2", '""');  // sets RawField.isNull = true
// msg.toString() now emits PID-2 as the literal `""` (not absent)
```

The `setField` method interprets `'""'` (two quote chars) as a request
to set `isNull: true` on the target `RawField`; the emitter then
preserves that as the D-02 literal two-char output on the wire.

This note was landed on `BuildMessageInit`'s interface-level JSDoc in
Plan 01 (Step D). Plan 05 reinforces it on the function-level JSDoc of
`buildMessage` itself so both doc surfaces carry the same contract.

**Claude's Discretion resolved:**

- **type parsing:** accept a single `^`-delimited string
  (`"ADT^A01"` or `"ADT^A01^ADT_A01"`). Split on `^` for MSH-9 component
  decomposition. Empty trailing parts (e.g. `"ADT^A01"` has no structure)
  are allowed — MSH-9 components 1 and 2 populated, component 3 absent.
  NO discriminated-object input in v1 — pure string keeps the one-liner
  DX (`buildMessage({ type: 'ADT^A01', ... })`).
- **controlId alphabet:** plain `[A-Za-z0-9]` — readability doesn't matter
  (IDs aren't human-typed).
- **frozen vs mutable Hl7Message:** return the regular mutable Hl7Message
  so the chainable `buildMessage({...}).addSegment(...).addSegment(...)`
  pattern works. Phase 3's `addSegment` already returns `this`.

**MSH synthesis mapping** — the `RawSegment` that `buildMessage` hands to
`new Hl7Message({...})` follows the parser's positional convention from
`src/parser/types.ts`:

- `fields[0]` = field-separator placeholder (a RawField that contains the
  separator `"|"` — Phase 2 parse convention).
- `fields[1]` = MSH-2 encoding chars (`"^~\&"`).
- `fields[2]` = MSH-3 = sendingApp (or empty).
- `fields[3]` = MSH-4 = sendingFacility.
- `fields[4]` = MSH-5 = receivingApp.
- `fields[5]` = MSH-6 = receivingFacility.
- `fields[6]` = MSH-7 = timestamp.
- `fields[7]` = MSH-8 (unused) = empty.
- `fields[8]` = MSH-9 = message type (potentially composite).
- `fields[9]` = MSH-10 = controlId.
- `fields[10]` = MSH-11 = processingId.
- `fields[11]` = MSH-12 = version.

Each `RawField` is either absent (`{ repetitions: [], isNull: false }`)
for omitted values or has one repetition with one component with one
subcomponent carrying the raw string value. MSH-9 is the ONE field that
may have multiple components (from splitting `init.type` on `^`).

**In scope:**

1. Fill `src/builder/format-timestamp.ts::formatHl7Timestamp` body.
2. Fill `src/builder/control-id.ts::generateControlId` body.
3. Fill `src/builder/build-message.ts::buildMessage` body (consumes the
   two above; synthesises MSH RawSegment; calls `new Hl7Message(...)`).
   Extend function-level JSDoc to reinforce W1 empty-vs-null note.
4. Create three new test files (one per source file). `test/builder.test.ts`
   includes a dedicated W1 test: empty-string and omitted fields produce
   identical wire output, and explicit null is achieved via `.setField`.

**Out of scope:**

- Composite-object inputs for `addSegment` at build time (`{ family, given }`
  instead of raw strings) — v2 per D-15.
- Custom encoding characters — rejected for v1 per D-14.
- Typed message builders (`buildAdtA01({...})`) — v2 deferred.
- `fromJSON` reverse constructor — v2 deferred.

Output: 3 modified src files (bodies only) + 3 new test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md
@.planning/phases/05-serialization-and-round-trip/05-PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Plan 01 outputs + existing Phase 2/3 pieces that Plan 05 consumes. -->

From src/builder/build-message.ts (Plan 01 output — body to replace):
- Existing module JSDoc (KEEP — includes W1 empty-vs-null paragraph)
- import type { Hl7Message } from "../model/message.js"; (KEEP)
- export interface BuildMessageInit { type, sendingApp?, sendingFacility?,
    receivingApp?, receivingFacility?, controlId?, timestamp?: Date|string,
    version?, processingId? }  (KEEP — locked by D-10; JSDoc @example
    already shows `.setField(path, '""')` for explicit null per W1)
- export function buildMessage(_init: BuildMessageInit): Hl7Message { throw ... }
  (REPLACE BODY; rename `_init` to `init`; EXTEND function-level JSDoc with W1 paragraph)

From src/builder/format-timestamp.ts (Plan 01 output — body to replace):
- Existing module JSDoc (KEEP)
- export function formatHl7Timestamp(_date: Date): string { throw ... }
  (REPLACE BODY; rename `_date` to `date`; note `/** @internal */` JSDoc)

From src/builder/control-id.ts (Plan 01 output — body to replace):
- Existing module JSDoc (KEEP)
- export function generateControlId(): string { throw ... }
  (REPLACE BODY)

From src/parser/delimiters.ts:
- export const DEFAULT_ENCODING_CHARACTERS: EncodingCharacters
  = { field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" }

From src/parser/types.ts:
- RawSegment { name: string; fields: readonly RawField[] }
- RawField { repetitions: readonly RawRepetition[]; isNull: boolean }
- RawRepetition { components: readonly RawComponent[] }
- RawComponent { subcomponents: readonly string[] }

From src/model/message.ts (Phase 4 complete):
- class Hl7Message
  - constructor signature: Hl7Message(init: Hl7MessageInit)
    (check exact shape in message.ts — `init.segments` still accepts
     `readonly RawSegment[]`; `init.encodingCharacters`, `init.version`,
     `init.warnings` required; `init.profile` optional — omit key for
     exactOptionalPropertyTypes compliance)
- public addSegment(name: string, fields: readonly (string | RawField)[]): this
  (chainable; D-19 segment-name regex validates; invalidates caches)
- public setField(path: string, value: string): this
  (Phase 3; sets RawField.isNull=true when value === '""'; chainable)
- public toString(): string  (Plan 01 wired; Plan 02 filled)

From src/parser/index.ts:
- export function parseHL7(raw: string | Buffer, options?): Hl7Message
  (consumed by integration tests for round-trip confirmation)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fill formatHl7Timestamp body + test</name>
  <files>src/builder/format-timestamp.ts, test/builder-format-timestamp.test.ts</files>
  <read_first>
    - src/builder/format-timestamp.ts (Plan 01 stub — body only; KEEP module JSDoc)
    - src/parser/dates.ts (lines 90-200 — parseHl7Timestamp; understand the INVERSE mapping for YYYYMMDDHHmmss)
    - test/parser-dates.test.ts (unit-test convention)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-13 (second precision, UTC)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/builder/format-timestamp.ts" section (lines 304-343 — exact padStart pattern)
  </read_first>
  <behavior>
    - `formatHl7Timestamp(new Date("2026-04-19T10:15:00Z"))` === `"20260419101500"` (14 chars).
    - `formatHl7Timestamp(new Date("2026-01-01T00:00:00Z"))` === `"20260101000000"` (all fields zero-padded).
    - `formatHl7Timestamp(new Date("1999-12-31T23:59:59Z"))` === `"19991231235959"` (century boundary).
    - `formatHl7Timestamp(new Date("2026-04-19T10:15:00.999Z"))` === `"20260419101500"` (seconds precision — ms dropped per D-13).
    - Month is 1-indexed in HL7 (`getUTCMonth` is 0-indexed — the `+ 1` correction is critical).
    - All fields zero-padded to 2 chars (year to 4).
    - UTC only — `formatHl7Timestamp(new Date("2026-04-19T10:15:00-05:00"))` === `"20260419151500"` (converted to UTC: 10:15 EST = 15:15 UTC).
    - Output length is always exactly 14.
    - Never throws on any valid `Date` (including `new Date(0)` epoch, future dates, past dates).
    - On an Invalid Date (`new Date("not-a-date")`), behavior is "returns a string of 14 `NaN`-derived chars" — this is acceptable because buildMessage's upstream validation would never pass an invalid Date (it only accepts a valid Date from `new Date()` default or user-supplied Date). Alternatively, guard with `Number.isNaN(date.getTime())` and throw — BUT per D-26/D-07 sibling functions don't throw. Accept the pathological NaN case silently; document it in the JSDoc. The test suite does NOT exercise Invalid Date.
  </behavior>
  <action>
Open `src/builder/format-timestamp.ts`. Keep the module JSDoc. Rename
`_date` to `date`. Replace the throw with:

```typescript
/**
 * Format a JS `Date` to HL7 TS `YYYYMMDDHHmmss` (UTC, second precision,
 * always 14 chars). Inverse of `parseHl7Timestamp` for the HL7 TS branch.
 * D-13: sub-second precision is NOT emitted (acceptable asymmetry — most
 * outbound use cases don't need ms, and HL7 TS `.SSSS` is optional).
 *
 * Always uses UTC — callers who need local-time emission should supply a
 * pre-formatted HL7 TS string to `buildMessage({ timestamp: "..." })`.
 *
 * @example
 * ```ts
 * // formatHl7Timestamp is @internal — call buildMessage's `timestamp`
 * // option instead. Internally this maps Date -> YYYYMMDDHHmmss:
 * //   new Date("2026-04-19T10:15:00Z") -> "20260419101500"
 * ```
 *
 * @internal
 */
export function formatHl7Timestamp(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0"); // +1: getUTCMonth is 0-indexed
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}
```

Create `test/builder-format-timestamp.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatHl7Timestamp } from "../src/builder/format-timestamp.js";

describe("formatHl7Timestamp (D-13)", () => {
  it("formats a known UTC datetime to YYYYMMDDHHmmss", () => {
    const d = new Date("2026-04-19T10:15:00Z");
    expect(formatHl7Timestamp(d)).toBe("20260419101500");
  });

  it("zero-pads all fields", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(formatHl7Timestamp(d)).toBe("20260101000000");
  });

  it("handles century boundary", () => {
    const d = new Date("1999-12-31T23:59:59Z");
    expect(formatHl7Timestamp(d)).toBe("19991231235959");
  });

  it("truncates sub-second precision (D-13)", () => {
    const d = new Date("2026-04-19T10:15:00.999Z");
    expect(formatHl7Timestamp(d)).toBe("20260419101500");
  });

  it("month is 1-indexed in HL7 output", () => {
    // Jan = month index 0 in Date -> "01" in HL7
    expect(formatHl7Timestamp(new Date("2026-01-15T12:00:00Z"))).toBe("20260115120000");
    // Dec = month index 11 in Date -> "12" in HL7
    expect(formatHl7Timestamp(new Date("2026-12-15T12:00:00Z"))).toBe("20261215120000");
  });

  it("always emits exactly 14 characters", () => {
    expect(formatHl7Timestamp(new Date("2026-04-19T10:15:00Z")).length).toBe(14);
    expect(formatHl7Timestamp(new Date(0)).length).toBe(14);
    expect(formatHl7Timestamp(new Date()).length).toBe(14);
  });

  it("converts non-UTC input to UTC", () => {
    // 2026-04-19T10:15:00-05:00 = 2026-04-19T15:15:00Z
    const d = new Date("2026-04-19T10:15:00-05:00");
    expect(formatHl7Timestamp(d)).toBe("20260419151500");
  });

  it("does not throw on epoch or any valid Date", () => {
    expect(() => formatHl7Timestamp(new Date(0))).not.toThrow();
    expect(() => formatHl7Timestamp(new Date("2099-12-31T23:59:59Z"))).not.toThrow();
    expect(() => formatHl7Timestamp(new Date())).not.toThrow();
  });

  it("parseHl7Timestamp inverse round-trip (seconds precision)", async () => {
    const { parseHl7Timestamp } = await import("../src/parser/dates.js");
    const original = new Date("2026-04-19T10:15:30Z");
    const formatted = formatHl7Timestamp(original);
    const reparsed = parseHl7Timestamp(formatted, {});
    // parseHl7Timestamp returns { raw, date } or undefined — use the date part.
    expect(reparsed?.date?.toISOString()).toBe(original.toISOString());
  });
});
```

Run `pnpm test -- builder-format-timestamp`, `pnpm tsc --noEmit`, `pnpm lint`.
  </action>
  <verify>
    <automated>pnpm test -- builder-format-timestamp.test.ts 2>&amp;1 | tail -30 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/builder/format-timestamp.ts test/builder-format-timestamp.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'NOT IMPLEMENTED — Phase 5 Plan 05' src/builder/format-timestamp.ts` returns NO matches
    - `grep -q "getUTCFullYear" src/builder/format-timestamp.ts` succeeds
    - `grep -q "getUTCMonth() + 1" src/builder/format-timestamp.ts` succeeds (1-indexed correction)
    - `grep -q 'padStart(2, "0")' src/builder/format-timestamp.ts` succeeds
    - `test -f test/builder-format-timestamp.test.ts` succeeds
    - `pnpm test -- builder-format-timestamp.test.ts` exits 0 with >= 9 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/builder/format-timestamp.ts test/builder-format-timestamp.test.ts` exits 0
  </acceptance_criteria>
  <done>formatHl7Timestamp body implemented; 9+ tests green including a parseHl7Timestamp round-trip.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fill generateControlId body + test</name>
  <files>src/builder/control-id.ts, test/builder-control-id.test.ts</files>
  <read_first>
    - src/builder/control-id.ts (Plan 01 stub — body only; KEEP module JSDoc)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-12 (exact 17+6 shape; Date.now + Math.random; alnum alphabet)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/builder/control-id.ts" section (lines 345-373 — zero-dep stdlib note)
  </read_first>
  <behavior>
    - `generateControlId()` returns a string of length exactly 23.
    - First 17 chars are the current UTC datetime formatted as `YYYYMMDDHHmmssSSS` (4+2+2+2+2+2+3 = 17, zero-padded).
    - Last 6 chars match `/^[A-Za-z0-9]{6}$/`.
    - Two back-to-back calls MUST return different strings (the random suffix guarantees this with overwhelming probability — 62^6 ≈ 56.8 billion distinct suffixes; collision probability within a single test run is negligible).
    - Leading timestamp is anchored to "now" — `parseInt(result.slice(0, 4))` is the current UTC year (or year-1 only if the call crosses midnight new-year's-eve UTC within the test tick, which is tolerated).
    - `generateControlId` never throws.
    - Zero runtime deps — only `Date` and `Math.random`.
  </behavior>
  <action>
Open `src/builder/control-id.ts`. Keep the module JSDoc. Replace the throw:

```typescript
/**
 * Alphabet for the random suffix — plain alphanumeric. Readability doesn't
 * matter (IDs aren't human-typed), so no ambiguous-char filtering.
 * @internal
 */
const ALNUM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Zero-pad a number to N digits (stdlib — avoid regex for perf).
 * @internal
 */
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Generate an HL7 message control ID per D-12. Shape: 17-char UTC timestamp
 * `YYYYMMDDHHmmssSSS` + 6 random alphanumeric chars = 23 chars total.
 * Uniqueness is strong enough for outbound test messages and small tools
 * (62^6 ≈ 5.68e10 distinct suffixes per millisecond); callers with stricter
 * requirements should pass their own `controlId` to `buildMessage`.
 *
 * Zero dependencies — uses `Date` + `Math.random` only (D-31).
 *
 * @internal
 */
export function generateControlId(): string {
  const now = new Date();
  const ts =
    pad(now.getUTCFullYear(), 4) +
    pad(now.getUTCMonth() + 1, 2) +
    pad(now.getUTCDate(), 2) +
    pad(now.getUTCHours(), 2) +
    pad(now.getUTCMinutes(), 2) +
    pad(now.getUTCSeconds(), 2) +
    pad(now.getUTCMilliseconds(), 3);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * ALNUM_ALPHABET.length);
    // noUncheckedIndexedAccess: ALNUM_ALPHABET.charAt(idx) is always a string.
    suffix += ALNUM_ALPHABET.charAt(idx);
  }
  return ts + suffix;
}
```

Create `test/builder-control-id.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { generateControlId } from "../src/builder/control-id.js";

describe("generateControlId (D-12)", () => {
  it("returns a 23-character string", () => {
    const id = generateControlId();
    expect(id).toHaveLength(23);
    expect(typeof id).toBe("string");
  });

  it("matches /^[0-9]{17}[A-Za-z0-9]{6}$/", () => {
    const id = generateControlId();
    expect(id).toMatch(/^[0-9]{17}[A-Za-z0-9]{6}$/);
  });

  it("first 17 chars are a plausible UTC timestamp anchored to now", () => {
    const before = new Date().getUTCFullYear();
    const id = generateControlId();
    const idYear = parseInt(id.slice(0, 4), 10);
    // Allow year-1 if the test runs exactly at UTC midnight new-year's-eve.
    expect(idYear === before || idYear === before + 1).toBe(true);
  });

  it("month component is 1-12 (never 0, never 13+)", () => {
    const id = generateControlId();
    const month = parseInt(id.slice(4, 6), 10);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  it("day component is 1-31", () => {
    const id = generateControlId();
    const day = parseInt(id.slice(6, 8), 10);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  it("generates distinct IDs for back-to-back calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateControlId());
    // 100 distinct IDs expected — the random suffix guarantees it with
    // overwhelming probability. If this ever fails, investigate Math.random
    // being mocked/frozen in the test env.
    expect(ids.size).toBe(100);
  });

  it("never throws", () => {
    expect(() => generateControlId()).not.toThrow();
  });

  it("suffix is 6 chars from [A-Za-z0-9]", () => {
    const id = generateControlId();
    const suffix = id.slice(17);
    expect(suffix).toHaveLength(6);
    expect(suffix).toMatch(/^[A-Za-z0-9]{6}$/);
  });
});
```

Run `pnpm test -- builder-control-id`, `pnpm tsc --noEmit`, `pnpm lint`.
  </action>
  <verify>
    <automated>pnpm test -- builder-control-id.test.ts 2>&amp;1 | tail -30 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/builder/control-id.ts test/builder-control-id.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'NOT IMPLEMENTED — Phase 5 Plan 05' src/builder/control-id.ts` returns NO matches
    - `grep -q "ALNUM_ALPHABET" src/builder/control-id.ts` succeeds
    - `grep -q "Math.random" src/builder/control-id.ts` succeeds
    - `grep -q "getUTCMilliseconds" src/builder/control-id.ts` succeeds
    - `test -f test/builder-control-id.test.ts` succeeds
    - `pnpm test -- builder-control-id.test.ts` exits 0 with >= 8 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/builder/control-id.ts test/builder-control-id.test.ts` exits 0
  </acceptance_criteria>
  <done>generateControlId body implemented; 8+ tests green including uniqueness sweep across 100 consecutive calls.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fill buildMessage body + integration test (SER-06 closure)</name>
  <files>src/builder/build-message.ts, test/builder.test.ts</files>
  <read_first>
    - src/builder/build-message.ts (Plan 01 stub — body only; KEEP module JSDoc + BuildMessageInit interface; EXTEND function-level JSDoc with W1 note)
    - src/builder/format-timestamp.ts (Task 1 output — consumed for Date → TS)
    - src/builder/control-id.ts (Task 2 output — consumed for auto-gen controlId)
    - src/parser/delimiters.ts (DEFAULT_ENCODING_CHARACTERS — D-14 source)
    - src/parser/types.ts (RawField, RawSegment, RawRepetition, RawComponent — RawField synthesis shape)
    - src/model/message.ts (Hl7Message constructor shape — init.segments/encodingCharacters/version/warnings/profile; addSegment signature; SETFIELD signature — W1 test uses setField for explicit-null)
    - src/helpers/meta.ts (how msg.meta READS MSH — inverse informs MSH field synthesis order)
    - test/model-mutation.test.ts (integration test convention — inline FIXTURE + chainable assertions; search for `setField` call patterns to understand '""' → isNull semantics)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-09..D-16 (every one applies here)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/builder/build-message.ts" section (lines 209-301 — synthesis + construction patterns)
  </read_first>
  <behavior>
    - `buildMessage({ type: "ADT^A01" })` returns an `Hl7Message`.
    - The returned message's `rawSegments.length === 1` (only MSH).
    - The returned message's `rawSegments[0].name === "MSH"`.
    - The returned message's `encodingCharacters === DEFAULT_ENCODING_CHARACTERS` structurally (`.field === "|"`, etc.) (D-14).
    - The returned message's `warnings === []`.
    - The returned message's `version === init.version ?? "2.5"` (or whatever the Hl7MessageInit.version field is; check constructor shape).
    - `buildMessage({ type: "ADT^A01" }).toString()` produces a parseable HL7 string — `parseHL7(...).toString()` round-trips without throw.
    - `parseHL7(buildMessage({ type: "ADT^A01" }).toString()).meta.type === "ADT^A01"` — message type round-trips.
    - `buildMessage({ type: "ADT^A01^ADT_A01" }).toString()` → `parseHL7(...).meta.messageStructure === "ADT_A01"`.
    - Each optional BuildMessageInit field populates the corresponding MSH position when supplied.
    - Auto-generated controlId matches `/^[0-9]{17}[A-Za-z0-9]{6}$/`.
    - Supplied controlId passes through verbatim: `buildMessage({ type: "ADT^A01", controlId: "CUSTOM-ID-001" }).meta.controlId === "CUSTOM-ID-001"`.
    - Supplied Date timestamp formats to HL7 TS: `buildMessage({ type: "ADT^A01", timestamp: new Date("2026-04-19T10:15:00Z") })` — emitted MSH-7 is `"20260419101500"`.
    - Supplied string timestamp passes through verbatim: `buildMessage({ type: "ADT^A01", timestamp: "20260419101530.1234+0500" })` — emitted MSH-7 is `"20260419101530.1234+0500"` literally.
    - Default timestamp (no `timestamp`) formats `new Date()` to 14 chars.
    - Default `version === "2.5"` when omitted.
    - Default `processingId === "P"` when omitted.
    - Addressing fields (sendingApp/Facility, receivingApp/Facility) populate MSH-3/4/5/6.
    - Chaining: `buildMessage({ type: "ADT^A01" }).addSegment("PID", ["", "", "MRN123", "", "Doe^John"]).addSegment("PV1", ["1", "I"])` returns an Hl7Message; `.rawSegments.length === 3` (MSH, PID, PV1).
    - `buildMessage({ type: "" })` throws `TypeError` with a message containing "type" (D-16).
    - `buildMessage({ type: "   " })` also throws `TypeError` (whitespace-only is empty — OR: accept if literal "   " is non-empty-string; Claude's Discretion: if the first split("^")[0] is empty/whitespace-only, throw. Keep it strict: trim first, then check empty.).
    - `buildMessage({} as BuildMessageInit)` throws `TypeError` (missing type).
    - The returned Hl7Message has NO `profile` key set (D-20 omit-when-absent applies at construction; we pass no profile to Hl7Message).
    - **W1 empty-vs-null wire equivalence:** `buildMessage({ type: "ADT^A01", sendingApp: "" }).toString()` produces the SAME MSH line as `buildMessage({ type: "ADT^A01" }).toString()` at the MSH-3 position (both emit `||`). To emit HL7 explicit null, call `.setField("MSH.3", '""')` — the emitted MSH-3 then becomes the literal `""` (2 chars).
  </behavior>
  <action>
Open `src/builder/build-message.ts`. Keep the module JSDoc + the
`BuildMessageInit` interface + the `import type { Hl7Message } from
"../model/message.js";` line. Rename `_init` to `init`. Add new imports
and replace the body:

```typescript
// New imports to add BELOW the existing import type { Hl7Message }:
import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";

import { generateControlId } from "./control-id.js";
import { formatHl7Timestamp } from "./format-timestamp.js";
```

(Note the existing `import type { Hl7Message }` becomes a regular
`import { Hl7Message }` because we NOW call `new Hl7Message(...)` — a
value import. If there is a line `import type { Hl7Message } from ...`,
change `import type` to `import`. Keep as single line.)

Then replace the body (note the function-level JSDoc now carries the W1
empty-vs-null reinforcement):

```typescript
/**
 * Construct an outbound `Hl7Message` from semantic MSH fields (SER-06).
 * Synthesises a complete MSH `RawSegment` per D-10/D-11 and hands to
 * `new Hl7Message({...})`. Callers chain `.addSegment(name, fields)`
 * (Phase 3 mutation method, unchanged) to append PID, OBX, etc.
 *
 * Defaults applied when fields are omitted (D-10):
 * - `controlId` → `generateControlId()` (D-12)
 * - `timestamp` → `formatHl7Timestamp(new Date())` (D-13)
 * - `version` → `"2.5"`
 * - `processingId` → `"P"`
 * - `sendingApp`/`sendingFacility`/`receivingApp`/`receivingFacility` → empty
 *
 * Encoding characters are always `DEFAULT_ENCODING_CHARACTERS` (D-14); no
 * option to customise in v1.
 *
 * **Empty string vs. omitted field (W1):** at the HL7 wire level, passing
 * `sendingApp: ""` and omitting `sendingApp` produce IDENTICAL output
 * (both emit as absent — `||` at the MSH-3 position). If you need to
 * emit an HL7 explicit null (`""`, the two-char literal) at a specific
 * position, build the message first, then use `setField`:
 *
 * ```ts
 * const msg = buildMessage({ type: "ADT^A01" });
 * msg.setField("MSH.3", '""');  // sets RawField.isNull = true
 * // msg.toString() now emits MSH-3 as `""` (2 chars), not as absent.
 * ```
 *
 * The `BuildMessageInit` interface JSDoc (Plan 01) has the same note on
 * the input shape; this function-level doc reinforces it for developers
 * who land on the impl.
 *
 * @example
 * ```ts
 * import { buildMessage, parseHL7 } from "@cosyte/hl7-parser";
 * const msg = buildMessage({
 *   type: "ADT^A01",
 *   sendingApp: "CLINIC",
 *   sendingFacility: "MAIN",
 *   receivingApp: "LAB",
 *   receivingFacility: "REF",
 * }).addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);
 *
 * // Spec-clean HL7 string round-trips through parseHL7:
 * const round = parseHL7(msg.toString());
 * console.log(round.meta.type); // "ADT^A01"
 * ```
 */
export function buildMessage(init: BuildMessageInit): Hl7Message {
  // D-16 validation: type must be a non-empty, non-whitespace string.
  if (typeof init?.type !== "string" || init.type.trim().length === 0) {
    throw new TypeError(
      'buildMessage: `type` is required and must be a non-empty string ' +
        '(e.g. "ADT^A01" or "ORU^R01^ORU_R01"). ' +
        `Received: ${JSON.stringify(init?.type)}.`,
    );
  }

  const enc = DEFAULT_ENCODING_CHARACTERS; // D-14

  // Resolve timestamp per D-13.
  const tsString: string = resolveTimestamp(init.timestamp);

  // Resolve controlId per D-12.
  const controlId = init.controlId ?? generateControlId();

  // Resolve version + processingId defaults.
  const version = init.version ?? "2.5";
  const processingId = init.processingId ?? "P";

  // Build MSH fields[0..11] per the positional mapping documented in
  // `RawSegment.fields` JSDoc + CONTEXT.md D-11.
  //
  //   fields[0]  = field-separator placeholder  (content: "|")
  //   fields[1]  = MSH-2 encoding chars          (content: "^~\\&")
  //   fields[2]  = MSH-3 sendingApp
  //   fields[3]  = MSH-4 sendingFacility
  //   fields[4]  = MSH-5 receivingApp
  //   fields[5]  = MSH-6 receivingFacility
  //   fields[6]  = MSH-7 timestamp
  //   fields[7]  = MSH-8 (unused) empty
  //   fields[8]  = MSH-9 = message type (possibly composite).
  //   fields[9]  = MSH-10 controlId
  //   fields[10] = MSH-11 processingId
  //   fields[11] = MSH-12 version
  //
  // W1: `scalarField("")` produces an absent RawField (zero repetitions,
  // isNull:false) — identical to omitting the field. That's the correct
  // wire semantic; callers who want explicit null use `.setField("MSH.N",
  // '""')` after construction.
  const mshFields: RawField[] = [
    scalarField(enc.field),                          // fields[0]
    scalarField(enc.component + enc.repetition + enc.escape + enc.subcomponent), // fields[1] MSH-2
    scalarField(init.sendingApp ?? ""),              // MSH-3
    scalarField(init.sendingFacility ?? ""),         // MSH-4
    scalarField(init.receivingApp ?? ""),            // MSH-5
    scalarField(init.receivingFacility ?? ""),       // MSH-6
    scalarField(tsString),                           // MSH-7
    absentField(),                                   // MSH-8
    compositeField(init.type),                       // MSH-9 (split on ^)
    scalarField(controlId),                          // MSH-10
    scalarField(processingId),                       // MSH-11
    scalarField(version),                            // MSH-12
  ];

  const mshSegment: RawSegment = {
    name: "MSH",
    fields: mshFields,
  };

  // D-11: construct the Hl7Message with the synthesised MSH as the sole
  // initial segment. Subsequent .addSegment() calls append PID/OBX/etc.
  return new Hl7Message({
    segments: [mshSegment],
    encodingCharacters: enc,
    version,
    warnings: [],
  });
}

/**
 * D-13: `Date` formats to HL7 `YYYYMMDDHHmmss` UTC; string passes through
 * verbatim; omitted defaults to `formatHl7Timestamp(new Date())`.
 * @internal
 */
function resolveTimestamp(ts: Date | string | undefined): string {
  if (ts === undefined) return formatHl7Timestamp(new Date());
  if (typeof ts === "string") return ts;
  return formatHl7Timestamp(ts);
}

/**
 * Build a RawField carrying a single plain-string value (one repetition,
 * one component, one subcomponent). Empty string → absent field (W1 wire
 * semantic: empty and omitted are indistinguishable on the wire).
 * @internal
 */
function scalarField(value: string): RawField {
  if (value === "") return { repetitions: [], isNull: false };
  return {
    repetitions: [
      {
        components: [{ subcomponents: [value] }],
      },
    ],
    isNull: false,
  };
}

/**
 * Build an absent RawField (no content, not null).
 * @internal
 */
function absentField(): RawField {
  return { repetitions: [], isNull: false };
}

/**
 * Build MSH-9 from a `^`-delimited type string per the Claude's Discretion
 * resolution (accept a single string, split on `^` for component
 * decomposition). Empty parts suppressed via D-02 trailing-empty strip at
 * emit time.
 * @internal
 */
function compositeField(typeString: string): RawField {
  const parts = typeString.split("^");
  const components = parts.map((p) => ({ subcomponents: [p] }));
  return {
    repetitions: [{ components }],
    isNull: false,
  };
}
```

Create `test/builder.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildMessage, parseHL7 } from "../src/index.js";
import type { BuildMessageInit } from "../src/index.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";

describe("buildMessage (SER-06)", () => {
  describe("defaults (D-10/D-12/D-13/D-14)", () => {
    it("with only type produces a parseable, MSH-only Hl7Message", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      expect(msg.rawSegments.length).toBe(1);
      expect(msg.rawSegments[0]?.name).toBe("MSH");
      expect(() => msg.toString()).not.toThrow();
      const round = parseHL7(msg.toString());
      expect(round.rawSegments[0]?.name).toBe("MSH");
    });

    it("auto-generates controlId when omitted (D-12)", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.controlId).toMatch(/^[0-9]{17}[A-Za-z0-9]{6}$/);
    });

    it("auto-generates timestamp when omitted (D-13)", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.timestamp).toBeInstanceOf(Date);
      // Should be within the last 5 seconds — a generous guard against slow
      // CI machines.
      const now = Date.now();
      const ts = round.meta.timestamp?.getTime() ?? 0;
      expect(now - ts).toBeLessThan(5000);
    });

    it("defaults version to '2.5' when omitted", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.version).toBe("2.5");
    });

    it("defaults processingId to 'P' when omitted", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.processingId).toBe("P");
    });

    it("encoding chars always default per D-14", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      expect(msg.encodingCharacters).toEqual(DEFAULT_ENCODING_CHARACTERS);
    });

    it("warnings is always [] on a built message", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      expect(msg.warnings).toEqual([]);
    });
  });

  describe("supplied fields (D-10)", () => {
    it("uses supplied controlId verbatim", () => {
      const msg = buildMessage({ type: "ADT^A01", controlId: "CUSTOM-ID-001" });
      const round = parseHL7(msg.toString());
      expect(round.meta.controlId).toBe("CUSTOM-ID-001");
    });

    it("formats supplied Date timestamp per D-13", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        timestamp: new Date("2026-04-19T10:15:00Z"),
      });
      // MSH-7 should round-trip to the exact UTC Date.
      const round = parseHL7(msg.toString());
      expect(round.meta.timestamp?.toISOString()).toBe("2026-04-19T10:15:00.000Z");
      // Also assert the wire format has "20260419101500" literal.
      expect(msg.toString()).toContain("20260419101500");
    });

    it("passes supplied string timestamp through verbatim per D-13", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        timestamp: "20260419101530.1234+0500",
      });
      expect(msg.toString()).toContain("20260419101530.1234+0500");
    });

    it("populates MSH-3/4/5/6 addressing fields", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        sendingApp: "CLINIC",
        sendingFacility: "MAIN",
        receivingApp: "LAB",
        receivingFacility: "REF",
      });
      const round = parseHL7(msg.toString());
      expect(round.meta.sendingApp).toBe("CLINIC");
      expect(round.meta.sendingFacility).toBe("MAIN");
      expect(round.meta.receivingApp).toBe("LAB");
      expect(round.meta.receivingFacility).toBe("REF");
    });

    it("uses supplied version + processingId", () => {
      const msg = buildMessage({
        type: "ADT^A01",
        version: "2.8",
        processingId: "T",
      });
      const round = parseHL7(msg.toString());
      expect(round.meta.version).toBe("2.8");
      expect(round.meta.processingId).toBe("T");
    });
  });

  describe("MSH-9 type parsing", () => {
    it("splits type on '^' into messageCode + triggerEvent", () => {
      const msg = buildMessage({ type: "ADT^A01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.messageCode).toBe("ADT");
      expect(round.meta.triggerEvent).toBe("A01");
      expect(round.meta.type).toBe("ADT^A01");
    });

    it("accepts three-part type with structure", () => {
      const msg = buildMessage({ type: "ORU^R01^ORU_R01" });
      const round = parseHL7(msg.toString());
      expect(round.meta.messageCode).toBe("ORU");
      expect(round.meta.triggerEvent).toBe("R01");
      expect(round.meta.messageStructure).toBe("ORU_R01");
    });
  });

  describe("chaining with addSegment (D-11/D-15)", () => {
    it("chains addSegment calls and returns an Hl7Message", () => {
      const msg = buildMessage({ type: "ADT^A01" })
        .addSegment("PID", ["", "", "MRN123", "", "Doe^John"])
        .addSegment("PV1", ["1", "I"]);
      expect(msg.rawSegments.length).toBe(3);
      expect(msg.rawSegments[0]?.name).toBe("MSH");
      expect(msg.rawSegments[1]?.name).toBe("PID");
      expect(msg.rawSegments[2]?.name).toBe("PV1");
    });

    it("chained result round-trips through parseHL7", () => {
      const msg = buildMessage({ type: "ADT^A01", controlId: "MSG001" })
        .addSegment("PID", ["1", "", "MRN123", "", "Doe^John", "", "19800115", "M"]);
      const out = msg.toString();
      const round = parseHL7(out);
      expect(round.rawSegments.length).toBe(2);
      expect(round.meta.controlId).toBe("MSG001");
      expect(round.patient?.mrn).toBe("MRN123");
      expect(round.patient?.familyName).toBe("Doe");
    });
  });

  describe("validation (D-16)", () => {
    it("throws TypeError on missing type", () => {
      expect(() => buildMessage({} as BuildMessageInit)).toThrow(TypeError);
      expect(() => buildMessage({} as BuildMessageInit)).toThrow(/type/);
    });

    it("throws TypeError on empty type", () => {
      expect(() => buildMessage({ type: "" })).toThrow(TypeError);
    });

    it("throws TypeError on whitespace-only type", () => {
      expect(() => buildMessage({ type: "   " })).toThrow(TypeError);
    });

    it("throws TypeError when type is not a string", () => {
      expect(() => buildMessage({ type: 123 as unknown as string })).toThrow(TypeError);
    });
  });

  describe("W1 empty-vs-null wire semantics", () => {
    it("empty-string field and omitted field produce IDENTICAL wire output", () => {
      const withEmpty = buildMessage({ type: "ADT^A01", sendingApp: "", controlId: "ID1", timestamp: "20260419000000" });
      const withOmitted = buildMessage({ type: "ADT^A01", controlId: "ID1", timestamp: "20260419000000" });
      // MSH lines (first \r-terminated chunk) should be identical.
      const lineWithEmpty = withEmpty.toString().split("\r")[0];
      const lineWithOmitted = withOmitted.toString().split("\r")[0];
      expect(lineWithEmpty).toBe(lineWithOmitted);
    });

    it("emitting HL7 explicit null requires .setField('MSH.3', '\"\"') after construction", () => {
      const msg = buildMessage({ type: "ADT^A01", controlId: "ID1", timestamp: "20260419000000" });
      // Before setField: MSH-3 is absent (`||`).
      const beforeOut = msg.toString();
      expect(beforeOut).toContain("||"); // adjacent pipes around the absent MSH-3 slot

      // Apply explicit null via setField.
      msg.setField("MSH.3", '""');

      // After: MSH-3 renders as the literal `""` (2 chars). The round-trip
      // preserves isNull:true on that field.
      const afterOut = msg.toString();
      expect(afterOut).toContain('|""|'); // MSH-3 is literal explicit null
      const round = parseHL7(afterOut);
      const mshRound = round.rawSegments.find((s) => s.name === "MSH");
      // MSH-3 = fields[2] per parser convention.
      expect(mshRound?.fields[2]?.isNull).toBe(true);
    });
  });

  describe("round-trip", () => {
    it("full-fledged built message round-trips structurally", () => {
      const original = buildMessage({
        type: "ADT^A01^ADT_A01",
        sendingApp: "CLINIC",
        sendingFacility: "MAIN",
        receivingApp: "LAB",
        receivingFacility: "REF",
        controlId: "MSG001",
        timestamp: new Date("2026-04-19T10:15:00Z"),
        version: "2.5",
        processingId: "P",
      })
        .addSegment("PID", ["1", "", "MRN123", "", "Doe^John^Q", "", "19800115", "M"])
        .addSegment("PV1", ["1", "I", "ICU^101^A"]);

      const out = original.toString();
      const round = parseHL7(out);
      expect(round.rawSegments.length).toBe(3);
      expect(round.meta.type).toBe("ADT^A01^ADT_A01");
      expect(round.meta.controlId).toBe("MSG001");
      // Idempotent:
      const twice = parseHL7(round.toString()).toString();
      expect(twice).toBe(out);
    });
  });
});
```

Run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test -- builder`,
`pnpm build`, `pnpm test` (full suite).
  </action>
  <verify>
    <automated>pnpm test -- builder.test.ts 2>&amp;1 | tail -50 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/builder test/builder.test.ts &amp;&amp; pnpm build &amp;&amp; pnpm test 2>&amp;1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'NOT IMPLEMENTED — Phase 5 Plan 05' src/builder/build-message.ts` returns NO matches
    - `grep -q "new Hl7Message(" src/builder/build-message.ts` succeeds (D-11 construction)
    - `grep -q "DEFAULT_ENCODING_CHARACTERS" src/builder/build-message.ts` succeeds (D-14)
    - `grep -q "generateControlId()" src/builder/build-message.ts` succeeds (D-12 default)
    - `grep -q "formatHl7Timestamp" src/builder/build-message.ts` succeeds (D-13 default)
    - `grep -q 'throw new TypeError' src/builder/build-message.ts` succeeds (D-16 validation)
    - `grep -q "init.type.split\|typeString.split" src/builder/build-message.ts` — MSH-9 component split
    - `grep -q 'name: "MSH"' src/builder/build-message.ts` succeeds (synthesised MSH segment)
    - `grep -q "setField\|explicit null\|empty and omitted" src/builder/build-message.ts` succeeds (W1 function-level JSDoc reinforcement)
    - `test -f test/builder.test.ts` succeeds
    - `grep -q "empty-vs-null\|empty-string field and omitted\|W1" test/builder.test.ts` succeeds (W1 test present)
    - `pnpm test -- builder.test.ts` exits 0 with >= 22 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/builder test/builder.test.ts` exits 0 with zero warnings
    - `pnpm build` exits 0
    - Full suite `pnpm test` exits 0 (all Phase 5 Plans 01-05 tests + Phase 4 baseline + Phase 3/2/1 baseline, >= 588 cases)
  </acceptance_criteria>
  <done>buildMessage body implements D-09..D-16; 22+ integration tests green including full round-trip with addSegment chaining AND W1 empty-vs-null wire equivalence + explicit-null-via-setField; SER-06 closed; W1 note landed on both BuildMessageInit interface-level JSDoc (Plan 01) and buildMessage function-level JSDoc (this plan).</done>
</task>

</tasks>

<verification>
Run the full Phase 5 pipeline end-to-end:

```bash
pnpm tsc --noEmit   # strict TS passes with new builder + serialize bodies
pnpm lint           # ESLint passes with zero warnings
pnpm test           # all Phase 5 + prior phases pass (>= 588 cases)
pnpm build          # tsup emits dist/ with populated builder bodies
```

Verify `dist/index.d.ts` declares all Phase 5 additions:

```bash
grep -E "(buildMessage|BuildMessageInit|SerializedMessage|toString|toJSON|prettyPrint)" dist/index.d.ts
```

End-to-end smoke test from the built bundle:

```bash
node --input-type=module -e "
  const { buildMessage, parseHL7 } = await import('./dist/index.mjs');
  const msg = buildMessage({
    type: 'ADT^A01',
    sendingApp: 'CLINIC',
    receivingApp: 'LAB',
    controlId: 'MSG001',
    timestamp: new Date('2026-04-19T10:15:00Z'),
  }).addSegment('PID', ['', '', 'MRN123', '', 'Doe^John', '', '19800115', 'M']);
  const out = msg.toString();
  console.log('emitted:', JSON.stringify(out));
  const round = parseHL7(out);
  console.log('type:', round.meta.type);
  console.log('controlId:', round.meta.controlId);
  console.log('mrn:', round.patient?.mrn);
  console.log('fullName:', round.patient?.fullName);
  console.log('idempotent:', parseHL7(out).toString() === out);
"
```

Expected output:
- `emitted: "MSH|^~\\&|CLINIC||LAB||20260419101500||ADT^A01|MSG001|P|2.5\rPID|||MRN123||Doe^John||19800115|M\r"`
  (trailing CR; exact MSH-3/5 mapping; MSH-4/6 empty because not supplied).
- `type: ADT^A01`
- `controlId: MSG001`
- `mrn: MRN123`
- `fullName: John Doe` (or similar Western order per Phase 4 D-17)
- `idempotent: true`
</verification>

<success_criteria>
- `src/builder/format-timestamp.ts::formatHl7Timestamp` body implemented per D-13.
- `src/builder/control-id.ts::generateControlId` body implemented per D-12.
- `src/builder/build-message.ts::buildMessage` body implemented per D-09..D-16; function-level JSDoc reinforces W1 empty-vs-null semantics.
- `BuildMessageInit` interface unchanged (locked by D-10 — Plan 01 shipped it with W1 interface-level JSDoc).
- 3 new test files with >= 39 cases combined (9 formatTs + 8 controlId + >= 22 builder; the builder suite grows by 2 for the W1 empty-vs-null + explicit-null-via-setField cases).
- SER-06 closed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.
- Plan 05 touched ONLY the 3 src files under `src/builder/` (bodies only) + 3 new test files — no edit to `src/model/message.ts`, `src/index.ts`, `src/serialize/*`, or any other plan's files.
</success_criteria>

<output>
After completion, create `.planning/phases/05-serialization-and-round-trip/05-05-SUMMARY.md` with:
- What shipped (3 builder bodies; 3 new test suites).
- REQ-IDs closed: SER-06.
- Decisions confirmed at runtime: D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16.
- Warning W1 addressed on function-level JSDoc of `buildMessage` (complementing the interface-level JSDoc on `BuildMessageInit` landed in Plan 01); W1 dedicated test suite confirms empty-string and omitted fields produce identical wire output, and explicit null is reachable via `.setField(path, '""')`.
- Files created (3: tests) + modified (3: build-message.ts, format-timestamp.ts, control-id.ts — bodies only).
- Test count before/after.
- Phase 5 wrap-up notes: all 6 SER REQ-IDs now closed (SER-01..06 via Plans 02-05 with primitive from Plan 01).
- Any deviations flagged for phase verification / Phase 6.
</output>
</content>
