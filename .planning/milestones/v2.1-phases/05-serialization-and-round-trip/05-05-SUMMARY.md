---
phase: 05-serialization-and-round-trip
plan: 05
subsystem: builder
tags: [builder, build-message, format-timestamp, control-id, SER-06, W1]
requires:
  - Phase 5 Plan 01 (scaffold + BuildMessageInit interface LIVE + stub bodies)
  - src/builder/format-timestamp.ts (this plan — stub body replaced)
  - src/builder/control-id.ts (this plan — stub body replaced)
  - src/parser/delimiters.ts::DEFAULT_ENCODING_CHARACTERS
  - src/parser/types.ts::{RawField, RawSegment}
  - src/model/message.ts::Hl7Message constructor + addSegment + setField (Phase 3, unchanged)
  - src/serialize/to-string.ts::emitMessage (Plan 02, unchanged) for toString round-trip
  - src/parser/index.ts::parseHL7 (Phase 2, unchanged) for round-trip confirmation
provides:
  - src/builder/format-timestamp.ts::formatHl7Timestamp (body — Date -> YYYYMMDDHHmmss UTC, 14 chars)
  - src/builder/control-id.ts::generateControlId (body — 17-char UTC ts + 6 alnum = 23 chars)
  - src/builder/build-message.ts::buildMessage (body — MSH synthesis + new Hl7Message, SER-06 closed)
affects:
  - SER-06 requirement closed
  - All 6 SER REQ-IDs now closed (SER-01..06)
tech-stack:
  added: []
  patterns:
    - "stdlib-only timestamp formatter (getUTC* + padStart) — zero-deps (D-31)"
    - "Date.now + Math.random control-id with 62^6 suffix uniqueness (D-12)"
    - "MSH RawSegment synthesis pattern — scalarField/absentField/compositeField helpers"
    - "composite-string split on ^ for MSH-9 component decomposition"
    - "private module helpers (resolveTimestamp / scalar/absent/compositeField) kept local to build-message.ts"
key-files:
  created:
    - test/builder-format-timestamp.test.ts
    - test/builder-control-id.test.ts
    - test/builder.test.ts
  modified:
    - src/builder/format-timestamp.ts (body only — stub replaced)
    - src/builder/control-id.ts (body only — stub replaced)
    - src/builder/build-message.ts (body only + function-level JSDoc extended for W1; BuildMessageInit interface declaration untouched)
decisions:
  - D-09 top-level buildMessage export (barrel wired in Plan 01)
  - D-10 BuildMessageInit shape consumed verbatim (type required, rest optional with documented defaults)
  - D-11 internal MSH synthesis + new Hl7Message({segments:[msh], encodingCharacters, version, warnings:[]})
  - D-12 generateControlId — YYYYMMDDHHmmssSSS (17) + 6 alnum = 23 chars
  - D-13 timestamp resolver — Date -> formatHl7Timestamp / string passthrough / undefined default
  - D-14 encoding chars always DEFAULT_ENCODING_CHARACTERS (no customisation)
  - D-15 addSegment input unchanged from Phase 3 (string scalars reescape delimiter chars — callers who need composite structure use setField after construction)
  - D-16 type validation — non-empty, non-whitespace string required; TypeError on violation
  - D-07 purity — no warnings, no throws (except D-16 explicit validation)
  - Claude's Discretion resolved: type is a single ^-delimited string (not a discriminated object); controlId alphabet is plain [A-Za-z0-9]; returned Hl7Message is the regular mutable type (not frozen) so chaining works
metrics:
  duration: "7m"
  completed: "2026-04-19T20:25:00Z"
  tasks: 3
  files_created: 3
  files_modified: 3
  tests_before: 578
  tests_after: 618
  tests_added: 40
---

# Phase 5 Plan 05: Build-Message Summary

One-liner: Shipped the three builder function bodies (`formatHl7Timestamp`, `generateControlId`, `buildMessage`) — SER-06 closes; `buildMessage({type:'ADT^A01'}).addSegment(...).toString()` emits spec-clean HL7 and round-trips through `parseHL7` byte-identically.

## What Shipped

### 1. `src/builder/format-timestamp.ts` — body filled

9-line body using stdlib `Date.getUTC*` + `String.padStart` to produce exactly 14 chars (`YYYYMMDDHHmmss` UTC, second precision). `+1` correction on `getUTCMonth()` for HL7 1-indexing. D-13 dropping sub-second precision. Function-level JSDoc marks it `@internal` with a note that invalid-Date input is silently accepted (no throw per D-07 — `buildMessage` never passes an invalid Date upstream).

### 2. `src/builder/control-id.ts` — body filled

Private `ALNUM_ALPHABET` (62 chars) + private `pad(n, width)` helpers; main body composes `YYYYMMDDHHmmssSSS` (17) prefix + 6 random chars from `Math.floor(Math.random() * 62)` = exactly 23 chars total. Zero-deps (Date + Math.random only per D-31). Uniqueness is strong enough for outbound test messages; stricter callers pass their own `controlId`.

### 3. `src/builder/build-message.ts` — body filled

Function-level JSDoc extended with the full W1 empty-vs-null reinforcement paragraph (complementing the same note on the `BuildMessageInit` interface-level JSDoc landed in Plan 01). Body flow:

1. **D-16 validation.** Guard on `init` being null/undefined AND `init.type` being a non-string or empty/whitespace-only string → `TypeError` with `JSON.stringify`-quoted received value.
2. **Defaults.** `enc = DEFAULT_ENCODING_CHARACTERS` (D-14); `tsString = resolveTimestamp(init.timestamp)` (D-13); `controlId = init.controlId ?? generateControlId()` (D-12); `version = init.version ?? "2.5"`; `processingId = init.processingId ?? "P"`.
3. **MSH synthesis.** Build `mshFields: RawField[]` of length 12 using three helpers — `scalarField(value)` (empty string → absent field per W1), `absentField()` (MSH-8 unused slot), `compositeField(typeString)` (MSH-9; `typeString.split("^").map(p => ({ subcomponents: [p] }))` for component decomposition).
4. **Construct.** `new Hl7Message({ segments: [mshSegment], encodingCharacters: enc, version, warnings: [] })`. No `profile` key (exactOptionalPropertyTypes-compliant omission).

Changed the `import type { Hl7Message }` to `import { Hl7Message }` (value import) since Plan 05 actually constructs one. Added `import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js"`, `import type { RawField, RawSegment }` from parser types, and value imports of the two sibling helper functions.

### 4. Test suites — 3 new files, 40 tests total

- **`test/builder-format-timestamp.test.ts` (9 tests):** known-UTC formatting, zero-padding, century boundary, sub-second truncation, month 1-indexing (Jan+Dec), fixed 14-char length, UTC conversion from offset input, never-throws on any valid Date (including epoch / future), and a `parseHl7Timestamp` inverse round-trip (14-char → Date → same ISO string).
- **`test/builder-control-id.test.ts` (8 tests):** 23-char length, `/^[0-9]{17}[A-Za-z0-9]{6}$/` regex, plausible UTC-year prefix, month 1-12 bounds, day 1-31 bounds, 100-call uniqueness sweep, never-throws, alnum-only suffix.
- **`test/builder.test.ts` (23 tests):** 6 default-shape tests (parseable MSH-only, auto-genned controlId regex, auto-genned timestamp within 5s, defaults for version/processingId/encoding chars/warnings); 5 supplied-field tests (verbatim controlId, Date timestamp formatted, string timestamp verbatim, MSH-3/4/5/6 addressing, version + processingId); 2 MSH-9 composite-type tests (split on `^` for code+trigger / three-part with structure); 2 chaining tests (`.addSegment()` returns `Hl7Message`; chained + `setField` round-trip with XPN components); 4 D-16 validation tests (missing / empty / whitespace / non-string type); 2 dedicated W1 tests (empty-vs-omitted wire equivalence; explicit null via `setField("MSH.3", '""')` renders as `|""|` and round-trips `isNull:true`); 1 full-fledged round-trip idempotency test (3 segments + every MSH field supplied + `parseHL7(round.toString()).toString() === out`).

## Decisions Made / Locked

All decisions consumed per plan — D-07, D-09, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-31. No new decisions introduced.

## Deviations from Plan

**Rule 1 — Test bug (plan-provided assertion incorrect for D-15 semantics).**

The plan's Task 3 test `"chained result round-trips through parseHL7"` expected `round.patient?.familyName === "Doe"` after calling `.addSegment("PID", ["1", "", "MRN123", "", "Doe^John", ...])`. Per Phase 3 D-15, scalar-string `addSegment` entries are stored as a single-subcomponent field, so the literal `^` inside `"Doe^John"` is treated as a subcomponent char and gets reescape'd to `\S\` on emit → on round-trip, PID-5 is a single-component field (`Doe\S\John` unescaped back to `Doe^John`), NOT a composite XPN. The assertion would only hold if `addSegment` interpreted `^` as a component delimiter, which contradicts the Phase 2 unescape-on-parse / Phase 5 reescape-on-emit invariant.

**Fix:** rewrote the test to construct PID-5 components explicitly via `.setField("PID.5.1", "Doe").setField("PID.5.2", "John")` after `addSegment`. The test now correctly demonstrates the D-15 + D-18 semantics: scalar-string input is the "plain text" path (delimiters reescape'd); composite structure requires post-construction `setField` calls or passing a full `RawField` object to `addSegment`. Added an inline comment documenting this so future maintainers don't "fix" it back. Added a second assertion (`givenName === "John"`) to strengthen the round-trip coverage. 23/23 still green. No plan behavior changed; only the failing test's assertion was corrected.

- **Files modified:** `test/builder.test.ts` (~10 line diff inside the single test case).
- **Commit:** `dbcae60` (rolled into the Task 3 GREEN commit).

**Rule 3 — ESLint `consistent-type-assertions` violation on `{} as BuildMessageInit`.**

The plan's D-16 validation test uses `buildMessage({} as BuildMessageInit)` verbatim. This trips `@typescript-eslint/consistent-type-assertions` which enforces `const x: T = {...}` over `{...} as T`. Project precedent (`test/parser-*.test.ts` via Plan 02-06) uses a scoped `eslint-disable-next-line` with an explanatory `const` binding.

**Fix:** extracted the cast into `const missingType = {} as BuildMessageInit` guarded by `// eslint-disable-next-line @typescript-eslint/consistent-type-assertions`, then reused the binding across the two `expect()` calls. No semantic change.

- **Files modified:** `test/builder.test.ts` (~4 line diff inside validation test).
- **Commit:** `dbcae60` (rolled into the Task 3 GREEN commit — the lint error surfaced post-`pnpm test` during full verification).

Zero Rule 2 / Rule 4 items surfaced.

## Verification Results

| Check                                       | Result                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `pnpm tsc --noEmit`                         | Pass (zero errors)                                             |
| `pnpm lint` (max-warnings=0)                | Pass (zero warnings)                                           |
| `pnpm build`                                | Pass (`tsup` emits dist/index.{mjs,cjs,d.ts} + maps)           |
| `pnpm test`                                 | 618/618 passing across 49 test files                           |
| `pnpm test -- builder-format-timestamp`     | 9/9 passing                                                    |
| `pnpm test -- builder-control-id`           | 8/8 passing                                                    |
| `pnpm test -- builder.test.ts`              | 23/23 passing                                                  |
| dist barrel check                           | `buildMessage`, `BuildMessageInit`, `SerializedMessage`, `toJSON`, `toString`, `prettyPrint` all present in `dist/index.d.ts` |
| Bundle smoke test (ESM)                     | Emits byte-identical to plan's expected: `"MSH\|^~\\&\|CLINIC\|\|LAB\|\|20260419101500\|\|ADT^A01\|MSG001\|P\|2.5\rPID\|\|\|MRN123\|\|Doe^John\|\|19800115\|M\r"`; idempotent=true; type=ADT^A01; mrn=MRN123; fullName="John Doe" |

**Test count delta:** 578 → 618 (+40: 9 format-timestamp + 8 control-id + 23 builder).

## REQ-IDs Closed

- **SER-06** — `buildMessage({...})` constructs a valid outbound HL7 message from scratch; `.addSegment(...)` chains; `.toString()` emits spec-clean HL7; round-trips through `parseHL7` byte-identically.

## Warnings Addressed

- **W1 (empty-vs-null wire semantics) — landed at the function level.** `buildMessage`'s JSDoc now carries the full W1 paragraph (empty string and omitted field produce identical wire output; explicit null requires `.setField(path, '""')` after construction). Complements the Plan 01 interface-level note on `BuildMessageInit`. Two dedicated tests confirm runtime behavior:
  1. `buildMessage({type,sendingApp:""})` and `buildMessage({type})` produce identical MSH lines.
  2. `setField("MSH.3", '""')` renders MSH-3 as the literal `|""|` on the wire and round-trips to `mshRound.fields[2].isNull === true`.

## Phase 5 Wrap-up Notes

**All 6 SER REQ-IDs now closed:**
- SER-01 — `toString()` spec-clean emission (Plan 02)
- SER-02 — first-pass structural round-trip equivalence (Plan 02)
- SER-03 — `toJSON()` structured snapshot (Plan 03)
- SER-04 — `prettyPrint()` human-readable format (Plan 04)
- SER-05 — CR separator + trailing CR (Plan 02)
- SER-06 — `buildMessage()` outbound factory (this plan)

**Subsystem integration confirmed runtime-side:**
- Phase 2 tokenize unescape-on-parse (Plan 05-02 Rule-3 deviation) + Phase 5 reescape-on-emit (Plan 01 emitField chokepoint) → first-pass structural round-trip.
- `buildMessage → addSegment → setField → toString → parseHL7 → toString` full cycle exercised by the final idempotency test.
- `Hl7Message` constructor accepts synthetic `RawSegment[]` (not just parser-produced) — confirmed by the new `new Hl7Message({...})` call path in `buildMessage`.

**Deferred / known limitations:**
- `addSegment(name, string[])` scalar-string input reescape's delimiter chars per D-15 — callers wanting composite components (XPN, XAD, etc.) must post-construct via `setField` or pass a full `RawField`. This may surface as a DX gap in Phase 6/7 vendor-quirk fixtures; v2 may add composite-object inputs (deferred per plan's "Out of scope").
- `formatHl7Timestamp` silently accepts invalid Dates (14 chars of `NaN`-derived garbage). `buildMessage`'s upstream validation never produces an invalid Date, but if a caller were to import `formatHl7Timestamp` directly (currently `@internal`), they'd see the anomaly. Documented in the JSDoc; no fix shipped.

## Files

**Created (3):**
- `test/builder-format-timestamp.test.ts` — 58 lines; 9 unit tests.
- `test/builder-control-id.test.ts` — 57 lines; 8 unit tests.
- `test/builder.test.ts` — 249 lines; 23 integration tests.

**Modified (3 — bodies only, module JSDoc + interface declaration untouched):**
- `src/builder/format-timestamp.ts` — stub body replaced with 9-line implementation + JSDoc expanded.
- `src/builder/control-id.ts` — stub body replaced with 18-line implementation + 2 private helpers + JSDoc.
- `src/builder/build-message.ts` — stub body replaced with 65-line implementation + 4 private helpers + function-level JSDoc extended for W1; `BuildMessageInit` interface declaration UNTOUCHED (locked by Plan 01 D-10); changed `import type { Hl7Message }` to `import { Hl7Message }` (value import for `new Hl7Message(...)`).

## Commits

| Hash      | Type | Message                                                         |
| --------- | ---- | --------------------------------------------------------------- |
| `229d530` | test | add failing tests for formatHl7Timestamp (RED)                  |
| `bda5fb8` | feat | implement formatHl7Timestamp body (GREEN)                       |
| `e170c77` | test | add failing tests for generateControlId (RED)                   |
| `f5ec70d` | feat | implement generateControlId body (GREEN)                        |
| `703a0d7` | test | add failing tests for buildMessage (RED)                        |
| `dbcae60` | feat | implement buildMessage body (GREEN) — SER-06 closed             |

## Self-Check: PASSED

Verified:
- `src/builder/format-timestamp.ts` exists (FOUND).
- `src/builder/control-id.ts` exists (FOUND).
- `src/builder/build-message.ts` exists (FOUND).
- `test/builder-format-timestamp.test.ts` exists (FOUND).
- `test/builder-control-id.test.ts` exists (FOUND).
- `test/builder.test.ts` exists (FOUND).
- Commits `229d530`, `bda5fb8`, `e170c77`, `f5ec70d`, `703a0d7`, `dbcae60` all in `git log` (FOUND).
- Test count 618 matches >= 578 + 40 = 618 (PASS).
- `pnpm tsc --noEmit` exits 0 (PASS).
- `pnpm lint --max-warnings=0` exits 0 (PASS).
- `pnpm build` exits 0 (PASS).
- `pnpm test` exits 0, 618/618 passing (PASS).
- Bundle smoke test matches plan's expected output byte-identically (PASS).
