---
phase: 05-serialization-and-round-trip
plan: 03
subsystem: serialization-to-json
tags: [to-json, ser-03, raw-tree-mirror, boundary-freeze, profile-conditional]
requires:
  - Phase 5 Plan 01 complete (src/serialize/to-json.ts stub with live SerializedMessage interface; Hl7Message.toJSON wired)
  - Phase 5 Plan 02 complete (raw tree stores DECODED subcomponents per the tokenize unescape-on-parse invariant)
  - src/model/message.ts::Hl7Message.profile typed as `{readonly name; readonly lineage: readonly string[]} | undefined`
provides:
  - src/serialize/to-json.ts::emitJson (FULLY IMPLEMENTED body — D-17 raw-tree mirror + D-19 stable warnings + D-20 conditional profile + W5 boundary freeze)
  - test/serialize-to-json.test.ts (23 unit tests — 8 decision blocks)
affects: []
tech-stack:
  added: []
  patterns:
    - "raw-tree mirror — direct `.map().map().map()` projection of `msg.rawSegments` into plain JS objects; no parser invocation, no re-escape, no cache"
    - "exactOptionalPropertyTypes-safe conditional-assign for optional `profile` key (mirrors `src/helpers/meta.ts::buildMeta`)"
    - "boundary-freeze — `Object.freeze(out)` at the return site; inner arrays rely on TS readonly contract + D-30 cost doctrine (no runtime deep-freeze)"
key-files:
  created:
    - test/serialize-to-json.test.ts
  modified:
    - src/serialize/to-json.ts
decisions:
  - D-17 raw-tree mirror confirmed at runtime (segments 1-for-1, field counts, nested subtree deep-equal to rawSegments slice)
  - D-17 + Claude's-Discretion — `repetitions` is ALWAYS `[]` when empty (shape-stable; verified on both absent `||` and null `|""|` fixtures)
  - D-18 JSON.stringify(msg) auto-invokes toJSON (confirmed via string-identity assertion)
  - D-19 warnings always present (empty array on clean input; pass-through on dirty MLLP-framed input)
  - D-20 profile conditional — key ABSENT when msg.profile is undefined; EXACTLY `{name, lineage}` keys when present (verified structurally via `Object.keys().sort() === ["lineage","name"]`)
  - D-21 SerializedMessage exports from src/index.ts (import + annotation compiles under strict mode; anchored in Block-7 test)
  - D-30 no caching — each call returns a new top-level reference (`emitJson(msg) !== emitJson(msg)`) but deep-equal content
  - D-07 purity — never throws, non-mutating, deterministic (validated across 3 diverse fixtures)
  - W5 boundary freeze — `Object.isFrozen(msg.toJSON()) === true`; inner arrays not deep-frozen (trade-off codified in Block-8 test)
  - Shared Plan-02 invariant honoured — emitJson mirrors DECODED subcomponents verbatim; no re-escape transform applied
metrics:
  duration: "~8m"
  completed: "2026-04-19T16:03:00Z"
  tasks: 1
  files_created: 1
  files_modified: 1
  tests_before: 526
  tests_after: 549
  tests_added: 23
---

# Phase 5 Plan 03: to-json Summary

One-liner: Shipped the `emitJson` body that projects an `Hl7Message` into a boundary-frozen `SerializedMessage` JSON snapshot — raw-tree mirror per D-17, stable `warnings: []` per D-19, conditional `{name, lineage}` profile per D-20, new reference each call per D-30 — and closes SER-03 with 23 unit tests spanning 8 decision blocks.

## What Shipped

### 1. `src/serialize/to-json.ts::emitJson` — FULLY IMPLEMENTED (body only)

The Plan-01 stub `throw new Error("NOT IMPLEMENTED ...")` body was replaced with:

- **Raw-tree mirror (D-17):** `msg.rawSegments.map(seg => { name, fields: seg.fields.map(field => { repetitions: field.repetitions.map(rep => { components: rep.components.map(comp => { subcomponents: comp.subcomponents.slice() }) }), isNull: field.isNull }) })`. `subcomponents.slice()` decouples the output from parser-internal string arrays.
- **Claude's-Discretion on empty repetitions:** `.map()` on an empty array yields `[]` — shape-stable, no conditional omission. Both absent-field (`||`) and explicit-null (`|""|`) cases produce `{ repetitions: [], isNull: false|true }` as specified.
- **Encoding characters (D-17):** all 5 string fields copied into a fresh object.
- **Warnings (D-19):** `warnings: msg.warnings` pass-through. `msg.warnings` is already frozen at `Hl7Message` construction (Phase 2 D-07), so a direct reference is safe. Empty-case is `[]` — NEVER `undefined` and NEVER omitted.
- **Profile (D-20, exactOptionalPropertyTypes-safe):** `Mutable<SerializedMessage>` local type + conditional assign via `if (msg.profile !== undefined) out.profile = { name, lineage }`. An absent key is valid for the optional field; an explicit `profile: undefined` is not. Upstream parser-constructor stripping guarantees only `{name, lineage}` survives on `msg.profile`, so emitJson forwards those two keys verbatim — no further filtering needed.
- **B3 fix:** NO `?? []` fallback on `msg.profile.lineage`. `Hl7Message.profile` is typed `{ readonly name; readonly lineage: readonly string[] } | undefined`, so inside the `if (msg.profile !== undefined)` branch `lineage` is type-guaranteed `readonly string[]`. The fallback would be dead code. The plan's original test cases #14 ("profile does NOT include non-serializable fields") and #15 ("lineage defaults to []") were type-unreachable under the current `Hl7Message.profile` type — replaced with a single structural two-keys assertion (Block 4, case 3) that verifies the D-20 contract at the output boundary where it's observable.
- **W5 boundary freeze:** `Object.freeze(out) as SerializedMessage` at the return site. `Object.isFrozen(msg.toJSON())` is `true`. Inner arrays are readonly at the TS type level but NOT runtime-frozen (D-30 cost doctrine — emit is hot-path; deep-freeze rejected as cost-with-no-benefit beyond the type contract).

The module JSDoc, the 3 `import type` lines, and the `SerializedMessage` interface declaration (locked by D-17 + Plan 01) were NOT touched — only the function body + the function's inner JSDoc. The `_msg` parameter was renamed to `msg` (it's now used).

### 2. `test/serialize-to-json.test.ts` — 23 tests across 8 decision blocks

| Block | Tests | Coverage |
|-------|-------|----------|
| 1. Raw-tree mirror shape (D-17) | 6 | encodingCharacters mirror, segments 1-for-1, field counts match, PID subtree deep-equal, isNull preserved, subcomponents verbatim (decoded — NOT re-escaped; mirrors Plan-02 invariant) |
| 2. Repetitions always present as `[]` | 2 | empty field: `{ repetitions: [], isNull: false }`; null field: `{ repetitions: [], isNull: true }` |
| 3. Warnings (D-19) | 3 | `[]` on clean message; length matches + element-wise equal on MLLP-framed dirty message; `Array.isArray` holds for both |
| 4. Profile (D-20 + B3 restructure) | 3 | absent key when msg.profile undefined; present `{name, lineage}` when truthy; EXACTLY two keys via `Object.keys().sort() === ["lineage","name"]` (structural contract replacing #14/#15 type-unreachable cases) |
| 5. JSON.stringify integration (D-18) | 2 | `JSON.stringify(msg) === JSON.stringify(msg.toJSON())`; JSON.parse round-trip preserves top-level structure |
| 6. Purity + no caching (D-07, D-30) | 4 | never throws on 3 diverse inputs; non-mutating; deterministic (`.toEqual`); new reference each call (`.not.toBe`) |
| 7. SerializedMessage typing (D-21) | 1 | `const snap: SerializedMessage = msg.toJSON();` compiles under strict mode (compile-time verified; runtime anchors the annotation) |
| 8. W5 boundary freeze | 2 | top-level `Object.isFrozen === true`; inner `snap.segments` NOT frozen (codifies the D-30 trade-off) |

Test count delta: **526 → 549** (+23).

## Decisions Confirmed at Runtime

Listed in frontmatter `decisions:` — D-17, D-18, D-19, D-20, D-21, D-30 are now manifested in code and cross-checked by tests; D-07 purity and W5 boundary freeze are runtime-verified.

## Blocker B3 Addressed

**B3 — type-unreachable test cases + dead-code `?? []` fallback:**

The original Plan 03 draft called for:
- Test #14: "profile does NOT include non-serializable fields" (onWarning / customSegments / dateFormats / description filtered out).
- Test #15: "profile.lineage defaults to `[]` when not set."
- Implementation: `lineage: msg.profile.lineage ?? []`.

All three were TYPE-UNREACHABLE given the current `Hl7Message.profile` type (`{ readonly name: string; readonly lineage: readonly string[] } | undefined`):
- `msg.profile` is EITHER `undefined` OR an object with BOTH `name` AND `lineage`. No way to construct a case where `lineage === undefined` inside the `if (msg.profile !== undefined)` branch.
- Non-serializable fields (`onWarning`, `customSegments`, etc.) live on the `Profile` descriptor passed to `parseHL7`, NOT on `Hl7Message.profile`. The upstream parser constructor (src/parser/index.ts ~line 385) already strips the descriptor down to `{name, lineage}` before assignment, so those fields never reach emitJson.

**Resolution:**
- Dropped tests #14 and #15 from the test file.
- Added a single structural two-keys assertion (Block 4, case 3) that verifies the D-20 contract at the output boundary via `Object.keys(snap.profile).sort() === ["lineage", "name"]`. This encodes the D-20 contract without requiring a type-impossible input.
- Removed the `?? []` fallback from emitJson — straight assignment `lineage: msg.profile.lineage`.

The D-20 behavioural contract is unchanged from the plan's intent; only the test encoding and the dead-code fallback were adjusted.

## Warning W5 Addressed

**W5 — boundary freeze scope ambiguity:**

Resolved by asserting both sides of the trade-off in tests:
- Block 8 case 1: `Object.isFrozen(snap) === true` — top-level snapshot is boundary-frozen.
- Block 8 case 2: `Object.isFrozen(snap.segments) === false` — inner arrays are intentionally NOT deep-frozen.

The `SerializedMessage` interface JSDoc (landed in Plan 01) already documents this at the type-declaration level. Plan 03 confirms the runtime behaviour matches the documented contract.

## Deviations from Plan

**None.** Plan executed exactly as written.

Zero Rule 1 / Rule 2 / Rule 3 auto-fixes required. Zero architectural (Rule 4) decisions surfaced. The B3 restructure was pre-specified in the plan body (§B3) and executed verbatim; it is documented here as "blocker addressed" rather than a deviation.

## Verification Results

| Check                                           | Result                                              |
| ----------------------------------------------- | --------------------------------------------------- |
| `pnpm tsc --noEmit`                             | Pass (zero errors)                                  |
| `pnpm lint`                                     | Pass (zero warnings; `max-warnings=0` respected)    |
| `pnpm build`                                    | Pass (tsup emits `dist/index.{mjs,cjs,d.ts,d.cts}`) |
| `pnpm test`                                     | 549/549 passing across 45 test files                |
| Bundle smoke test (`parseHL7 → toJSON`)         | All 6 assertions green (see below)                  |
| `emitJson` body has no `NOT IMPLEMENTED`        | Confirmed — stub replaced                           |
| `SerializedMessage` interface unchanged         | Confirmed — only body + function JSDoc touched      |
| Plan 03 touched only 2 files                   | Confirmed (`src/serialize/to-json.ts` + 1 new test) |
| SER-03 truths hold                              | Confirmed via 23-test unit suite                    |

Bundle smoke test (`node --input-type=module -e ...` from the verification block in the plan):

```text
segments count: 2
MSH name: MSH
warnings array: true
profile absent: true
top-level frozen: true
JSON.stringify integration: true
```

All 6 expected outputs matched.

Acceptance-grep checks (15 total): all green.
- `NOT IMPLEMENTED` absent from `to-json.ts`.
- `export function emitJson(msg: Hl7Message): SerializedMessage` present.
- `msg.rawSegments.map` present (raw-tree mirror).
- `Object.freeze` present (W5 boundary).
- `if (msg.profile !== undefined)` present (D-20 conditional).
- `warnings: msg.warnings` present (D-19 pass-through).
- `export interface SerializedMessage` present (locked shape intact).
- `lineage: msg.profile.lineage` present (B3 straight assign).
- `?? []` absent from `to-json.ts` (B3 dead code removed; the JSDoc mention was rephrased to "nullish-coalesce fallback" to avoid even the text pattern).
- `test/serialize-to-json.test.ts` exists.
- `Object.keys(...snap.profile...)` present in test (B3 structural two-keys).
- `Object.isFrozen` present in test (W5 freeze).
- Type-unreachable wordings ("profile.lineage defaults to", "profile does NOT include non-serializable") absent from test.
- `>= 22` test cases passing (23 passing).

## Files

**Created (1):**
- `test/serialize-to-json.test.ts` — 263 lines; 23 unit tests across 8 decision blocks.

**Modified (1):**
- `src/serialize/to-json.ts` — body of `emitJson` replaced (+70 / −7 lines). Module JSDoc, imports, and `SerializedMessage` interface left untouched.

## Commits

| Hash      | Type | Message                                                        |
| --------- | ---- | -------------------------------------------------------------- |
| `3872323` | test | add failing tests for emitJson (RED)                           |
| `b1dda48` | feat | implement emitJson body (raw-tree mirror + boundary freeze)    |

(A final `docs` commit for this SUMMARY + state updates will follow.)

## Notes for Plans 04 / 05

**Disjoint-file contract still in force:**
- Plan 04 owns only the body of `emitPrettyPrint` in `src/serialize/pretty-print.ts` + a new `test/serialize-pretty-print.test.ts`.
- Plan 05 owns only the bodies of `buildMessage`, `formatHl7Timestamp`, and `generateControlId` + their new test files.

**Profile-field stripping is the parser constructor's job, NOT emitJson's.** `Hl7Message.profile` is already `{name, lineage}` by the time any serializer / helper sees it. If Plan 04 / 05 need to render or construct profile-aware output, they consume `msg.profile` as already-stripped — no filtering logic needed downstream.

**W5 boundary-freeze pattern is reusable.** Plan 05's `buildMessage` returns an `Hl7Message` (not a `SerializedMessage`), so it does NOT need the top-level-freeze step. But the `Mutable<T>` + `Object.freeze(out)` conditional-assign pattern (mirrored here from `src/helpers/meta.ts::buildMeta`) is the established convention for exactOptionalPropertyTypes-safe output construction.

## Self-Check: PASSED

Verified:
- `src/serialize/to-json.ts` has `emitJson` body with no `NOT IMPLEMENTED` marker (FOUND).
- `test/serialize-to-json.test.ts` exists with 23 tests, all green (FOUND).
- Commits `3872323` and `b1dda48` both in git log (FOUND).
- Test count 549 matches expected >= 548 (PASS).
- `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0 (PASS).
- Bundle smoke test prints all 6 expected outputs (PASS).
- Plan 03 touched only 2 files (`git diff --stat` confirms `src/serialize/to-json.ts` + `test/serialize-to-json.test.ts`) (PASS).
