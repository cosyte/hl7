---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: milestone
status: "Phase 5 Plan 04 COMPLETE. emitPrettyPrint body shipped (D-22 no options + D-25 header with `-` fallbacks and `(N segments)` suffix + D-23 segment-per-line labeled `[N]=value` with MSH offset [3] / non-MSH [1] / empty-emitted suppression / isNull as `[N]=\"\"` + D-24 composite as raw HL7 string via emitField + D-26 pure + D-30 no caching). 29-test `serialize-pretty-print.test.ts` unit suite covers 6 decision blocks including dedicated W2 raw-escape assertions (all 5 active delimiters + `\\n → \\.br\\`). Function-level JSDoc carries the W2 raw-escape paragraph (complementing the Plan 01 note on Hl7Message.prettyPrint). SER-04 now closed. Plan scope honored exactly — only `src/serialize/pretty-print.ts` (body only) and new `test/serialize-pretty-print.test.ts` touched. 578/578 tests passing across 46 files (+29 from Plan 04); typecheck + lint (max-warnings=0) + build + bundle-smoke (matches plan's expected output byte-identically) all green. Pending: /gsd-execute-phase 5 continuation (Plan 05 build-message). Phase 4 still pending /gsd-validate-phase 4 (Nyquist). Phases 1-3 verify + Nyquist audits still open."
last_updated: "2026-04-19T20:14:00.000Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 23
---

# @cosyte/hl7-parser — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/hl7-parser`
- **Core value:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.
- **Current focus:** Phase 5 — Serialization & Round-Trip (Plans 01 + 02 + 03 + 04 COMPLETE — scaffold + emit-field primitive + method wiring + to-string + round-trip sweep + to-json + pretty-print; Plan 05 build-message pending). Phase 4 Nyquist still pending. Phase 3 still pending /gsd-validate-phase 3; Phase 2 still pending /gsd-verify-work 2 + /gsd-validate-phase 2; Phase 1 still pending /gsd-verify-work 1 + /gsd-validate-phase 1.
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

- **Milestone:** v1
- **Phase:** 5 — Serialization & Round-Trip (Plans 01 + 02 + 03 + 04 DONE; Plan 05 pending, disjoint-file contract in place)
- **Plans:** 5 plans (01 scaffold-emit-field-and-method-wiring — DONE; 02 to-string-and-round-trip — DONE; 03 to-json — DONE; 04 pretty-print — DONE; 05 build-message — pending)
- **Status:** Plan 04 closed SER-04. `src/serialize/pretty-print.ts::emitPrettyPrint` body implemented (D-22 no options + D-25 header `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)` with `-` fallbacks + D-23 segment-per-line with labeled `[N]=value` fields (MSH starts at [3], non-MSH at [1], empty-emitted fields suppressed, isNull renders as `[N]=""`) + D-24 composites as raw HL7 string via the Plan 01 emitField chokepoint + D-26 pure + D-30 no caching). Three-function module (public entry + `buildHeaderLine` + `buildSegmentLine` private helpers). Unified MSH-offset formula `firstDisplayNumber + (i - firstFieldIndex)` handles both MSH (fields[2]→[3]) and non-MSH (fields[1]→[1]) cases in one loop. 29-test `test/serialize-pretty-print.test.ts` unit suite covers 6 decision blocks: header (9 tests), segment lines (9 tests), depth (1 test), W2 raw-escape (3 tests — embedded `|`→`\F\`, `\n`→`\.br\`, all 5 delimiter types), line structure (3 tests), purity (4 tests). Function-level JSDoc on `emitPrettyPrint` carries the full W2 raw-escape paragraph (complementing the note Plan 01 landed on `Hl7Message.prettyPrint`). Plan scope respected exactly — only `src/serialize/pretty-print.ts` (body only — module JSDoc, Hl7Message import, and function signature preserved from Plan 01) + new `test/serialize-pretty-print.test.ts` touched. 578/578 tests passing across 46 files (+29 from Plan 04 baseline). Typecheck + lint (max-warnings=0) + build + bundle-smoke (byte-identical match against plan's expected output) all green. Zero deviations (no Rule 1/2/3/4 items surfaced).
- **Progress:** 2/8 phases verified; 4/4 Phase 1 + 6/6 Phase 2 + 4/4 Phase 3 + 4/4 Phase 4 + 4/5 Phase 5 plans complete

```
[████████░░░░░░░░░░░░] 25%   (2 / 8 phases verified; Phase 5 in progress — 4 / 5 plans done)
```

## Performance Metrics

- **Phases completed:** 2 (Phase 3 verified 2026-04-18; Phase 4 verified 2026-04-19; Phases 1 & 2 plans done but pending verifier + Nyquist; Phase 3 Nyquist still pending; Phase 5 in progress — Plans 01+02+03+04/5 done)
- **Plans completed:** 23 (4 Phase-1 + 6 Phase-2 + 4 Phase-3 + 4 Phase-4 + 4 Phase-5 + 1 Phase-5 Plan 04)
- **REQ-IDs validated:** 43 / 97 (SETUP-01..06 + PARSE-01..09 + TOL-01..10 + MODEL-01..07 + TYPES-01..04 + SER-01 + SER-02 + SER-03 + SER-04 + SER-05). All 7 MODEL + all 4 TYPES requirements closed; 5/6 SER requirements closed after Plan 04 (only SER-06 buildMessage pending). Phase 7 will confirm via the coverage sweep + vendor-quirks fixtures.
- **Known coverage:** Phase 1 sanity 2/2. Phase 2 (Plans 01–06): full suite 123/123 passing. Phase 3 Plans 01 + 02 + 03 + 04: 327 tests. Phase 4 Plans 01-04: 459 tests. Phase 5 Plan 01: +29 tests (serialize-emit-field). Phase 5 Plan 02: +38 tests (23 serialize-to-string + 15 round-trip sweep). Phase 5 Plan 03: +23 tests (serialize-to-json across 8 decision blocks). Phase 5 Plan 04: +29 tests (serialize-pretty-print across 6 decision blocks). Total: 578/578 passing across 46 test files. Coverage enforcement starts in Phase 7 via `pnpm test:coverage`; per-directory thresholds for `src/serialize/**` and `src/builder/**` declared in Plan 5-01.

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 1 | 01 package-scaffold | 2 min | 3 | 9 |
| 1 | 02 build-system | 1 min | 2 | 1 |
| 1 | 03 lint-and-test | 2 min | 4 | 6 |
| 1 | 04 smoke-verification | 4 min | 2 (+ 2 auto-fix commits) | 2 created, 4 modified |
| 2 | 01 warnings/errors/message-shell | 8 min | 3 (2 TDD cycles) | 8 created |
| 2 | 04 escape-sequences | 6 min | 1 (1 TDD cycle) | 2 created |
| 2 | 05 dateFormats-plumbing | 3 min | 1 (1 TDD cycle) | 2 created |
| 2 | 06 parseHL7-public-and-strict-mode | 4 min | 1 (1 TDD cycle) | 2 created, 1 modified |
| 3 | 01 read-path-foundation | 11 min | 3 (3 TDD cycles) | 7 created, 4 modified |
| 3 | 02 composites-person-address-identifier | 5 min | 3 (3 TDD cycles) | 14 created (7 src + 7 test) |
| 3 | 03 composites-telecom-location-timestamp-numeric | 4 min | 3 (handshake + 2 TDD cycles) | 8 created (4 src + 4 test) |
| 3 | 04 mutation-and-barrel | 8 min | 3 (2 TDD + 1 barrel) | 5 created, 4 modified |
| 4 | 01 scaffold-xcn-and-cache | 12 min | 3 (2 TDD + 1 wiring) | 15 created, 5 modified |
| 4 | 02 meta-and-patient | 10 min | 3 (3 TDD cycles) | 3 created, 2 modified |
| 4 | 03 visit-and-observations | 9 min | 3 (2 TDD + 1 cache-test + Rule 3 regex fix) | 3 created, 4 modified |
| 4 | 04 orders-and-collections | 8 min | 2 TDD cycles | 2 created, 5 modified |
| 5 | 01 scaffold-emit-field-and-method-wiring | 5 min | 4 (1 TDD + 3 scaffold) | 8 created, 3 modified |
| 5 | 02 to-string-and-round-trip | 15 min | 2 (1 TDD + 1 fixture sweep + 1 Rule-3 deviation) | 7 created, 2 modified |
| 5 | 03 to-json | 8 min | 1 (1 TDD cycle — RED + GREEN, no refactor needed) | 1 created, 1 modified |
| 5 | 04 pretty-print | 8 min | 1 (1 TDD cycle — RED + GREEN, no refactor needed) | 1 created, 1 modified |

## Accumulated Context

### Key Decisions (carry-forward from PROJECT.md)

- Lenient parsing is the default; strict is opt-in.
- Warnings carry stable string codes + positional context.
- Profiles are plain data produced by `defineProfile()`; built-ins use the public API.
- Serializer always emits spec-clean HL7 (Postel's Law: conservative emitter).
- Profile starter kit is a first-class deliverable.
- Zero runtime dependencies.
- Fatal errors limited to 4 Tier-3 codes: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`.
- `setDefaultProfile()` exists but is discouraged; process-scoped, not shared across workers.
- Zero runtime dependencies enforced via explicit empty `dependencies: {}` block in package.json (Plan 01-01).
- Strict TypeScript goes beyond `strict: true` — also `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noPropertyAccessFromIndexSignature` (Plan 01-01).
- `packageManager: pnpm@9.0.0` pinned for reproducibility (Plan 01-01).
- Wave 2 plans (02, 03) must NOT modify package.json — all devDeps and scripts are already wired in Plan 01 (Plan 01-01).
- tsup outExtension override forces `.mjs`/`.cjs` suffixes because tsup's defaults would not match the `exports` map in package.json (Plan 01-02).
- `skipNodeModulesBundle: true` in tsup.config keeps zero-runtime-deps posture honest — any future runtime dep would require an explicit architectural decision (Plan 01-02).
- ESLint flat config (eslint.config.js) — no legacy .eslintrc.*; eslint-config-prettier MUST be the last element in the default-exported array so Prettier-compat rules win (Plan 01-03).
- Type-aware lint rules (no-unsafe-*, no-floating-promises) enabled via `parserOptions.project: "./tsconfig.json"` — catches bugs strict tsc alone wouldn't flag at author time (Plan 01-03).
- CLAUDE.md guardrails (no any, no unjustified as, JSDoc+@example on public exports, no console) enforced as ESLint errors — not just typecheck (Plan 01-03).
- Vitest config declares per-directory coverage thresholds (src/parser/**, src/model/**, src/helpers/** at ≥ 90% lines/functions/statements, ≥ 85% branches) now for shape stability; Phase 7 is the enforcement gate via `pnpm test:coverage` (Plan 01-03).
- Prettier config (`printWidth:100`, `tabWidth:2`, `semi:true`, `singleQuote:false`, `trailingComma:all`, `endOfLine:lf`) aligned with `.editorconfig` exactly; `.planning/` excluded to avoid markdown-code-fence reflow churn (Plan 01-03).
- Removed `rootDir: ./src` from base `tsconfig.json`: it forbade `tsc --noEmit` from typechecking test files and root-level config files that the `include` glob also matched. Emit scoping is handled by tsup's `entry` + `tsconfig.build.json`'s narrower `include` (Plan 01-04, Rule 1 integration bug fix).
- `src/index.ts` file-level JSDoc cannot start with `@{package-name}` pattern because `eslint-plugin-jsdoc`'s `check-tag-names` rule parses leading `@tokens` as tag names. Put the package name in backticks mid-sentence instead (Plan 01-04, Rule 1 fix).
- CI workflow at `.github/workflows/ci.yml` runs Node 18/20/22 matrix with `permissions: contents: read` + `concurrency` + `cancel-in-progress`. All actions pinned to `@v4` major tag. `pnpm install --frozen-lockfile` enforces lockfile consistency; final step re-runs ESM/CJS dual-module smoke to guard SETUP-02 (Plan 01-04).
- `pnpm-lock.yaml` is committed (not in `.gitignore`) for supply-chain reproducibility (T-01-01/T-01-04-01 mitigation) (Plan 01-04).
- Public `Hl7Message.segments: readonly RawSegment[]` field renamed to `rawSegments` in Phase 3 Plan 01 to free the name for the typed `segments(type): readonly Segment[]` method. Phase 2 D-05 constructor init key `segments` stays unchanged for backward compat with parser/index.ts (Plan 03-01).
- Wrapper caches use a master-cache-filtering pattern: `allSegments()` builds a document-order cache of Segment wrappers; `segments(type)` filters from it. This gives cross-cache Segment identity for free (`msg.segments('OBX')[0] === msg.allSegments().find(s => s.type === 'OBX')`) and lets Plan 04 mutation invalidate everything by dropping `_allSegments` in one line (Plan 03-01).
- MSH.N → fields[N-1] offset in dot-path resolver: Phase 2 tokenize placed the field separator at MSH `fields[0]` and encoding-chars at `fields[1]`, so MSH-1 through MSH-18 user-facing indices map to `fields[N-1]`. Non-MSH segments use a straight 1:1 mapping because `fields[0]` is the segment-name placeholder. Encoded as a one-line special case in `resolvePath` (Plan 03-01).
- Depth-collapse (D-04) needs no extra branch in the resolver — when a component has a single subcomponent, the normal walk already returns it for subcomponentIndex === 1. A comment documents the reasoning (Plan 03-01).
- `Field.empty(enc)` accepts `enc` for API symmetry but returns a module-scoped sentinel built with DEFAULT_ENCODING_CHARACTERS. The synthetic field has no content so the active encoding characters are irrelevant on reads. Stable sentinel satisfies MODEL-05 never-throws contract while preserving referential stability (Plan 03-01).
- Segment-name validation regex `^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` in `parsePath` mirrors D-19 (addSegment) — avoids drift between path parsing and mutation validation (Plan 03-01).
- Composite parsers are silent (D-09). The shared `readSubcomponent` helper in `src/model/types/_shared.ts` passes a `NOOP_EMITTER` to `unescape` so any `UNKNOWN_ESCAPE_SEQUENCE` discovered at composite-read time is dropped. Best-effort position `{ segmentIndex: 0 }` — composites don't know their own tree position (Plan 03-02).
- Empty-string → undefined mapping centralised in `readSubcomponent`. HL7 parses `^^Middle^` with explicit `""` subcomponents; composites need to OMIT rather than record empty strings for `exactOptionalPropertyTypes` compliance. Pushing the mapping into the shared helper gives every composite uniform behaviour for free (Plan 03-02).
- Nested-composite synthesis pattern: when component N of composite A is shaped like composite B (e.g. CX.4 = HD), `parseA` synthesises a `RawRepetition` from `comp.subcomponents` and delegates to `parseB`. CX.assigningAuthority is the canonical example — no logic duplication, no special-case parser. Plan 03's XTN/PL may reuse the pattern (Plan 03-02).
- CX.assigningFacility flattened to `string` (v1 simplification — HL7 spec is HD-shaped). Precedent set by XPN.nameContext (CWE-shaped in spec, string in v1). Documented in CX interface JSDoc (Plan 03-02).
- CWE trimmed to 9 components for v1 (full v2.6+ has 22). The 9 core fields (identifier, text, coding systems, version ids, originalText) cover common HL7 v2.5 use cases; v2 may restore the full shape (Plan 03-02).
- `exactOptionalPropertyTypes`-compliant composite construction via `Mutable<T>` local + conditional assignment. `type Mutable<T> = { -readonly [K in keyof T]?: T[K] }` + per-field `if (x !== undefined) out.x = x` + implicit return. Passes `consistent-type-assertions: objectLiteralTypeAssertions: "never"` without any cast (Plan 03-02).
- Plan 02 and Plan 03 file ownership stays truly disjoint: Plan 02 ships 6 composites (XPN, XAD, CX, CWE, CE, HD) + `_shared.ts`; Plan 03 adds 4 (XTN, PL, TS, NM) and consumes `_shared.ts` + `hd.ts`. Zero shared-edit risk. Plan 04 handles `src/index.ts` barrel + `HL7` namespace + `Field.asXxx()` wiring (Plan 03-02).
- TS composite shape locked to `{ raw: string; date: Date | undefined }` per D-14 — BOTH keys ALWAYS present. `date` is typed as `Date | undefined` (not optional), so callers can destructure uniformly whether the parse succeeded or failed. NM composite parallels this with `{ raw: string; value: number | undefined }`. Distinguishes scalar composites from structured composites (XPN/XAD/etc all-optional) (Plan 03-03).
- `parseTs` delegates to `parseHl7Timestamp({})` — empty options, silent (no emit/position). Phase 4's `msg.meta.timestamp` helper may call `parseHl7Timestamp` DIRECTLY with user `dateFormats`/`emit`/`position`; the composite layer stays stateless so `Field.asTs()` works identically whether the user supplied dateFormats or not. D-10 zero duplicate date logic preserved (Plan 03-03).
- NM uses strict `Number(raw)` over `parseFloat(raw)` — trailing non-numeric characters invalidate the parse (`Number("12abc") === NaN` vs `parseFloat("12abc") === 12`). Matches developer expectation for HL7 NM fields that should be strictly numeric. Documented in NM JSDoc so maintainers don't "optimise" it back to parseFloat. Explicit empty-string pre-check prevents JS's `Number("") === 0` trap (Plan 03-03).
- D-24 NaN-gate layered on parseTs delegate output: `parsed !== undefined && !Number.isNaN(parsed.getTime())` prevents `new Date("20251345")` (month 13 → NaN time) from leaking as an Invalid Date. This is how TYPES-04 (no-throw) becomes observable at the composite layer — callers get undefined, never an Invalid Date (Plan 03-03).
- XTN trimmed from 14 → 12 for v1 (dropped 2 rarely-used legacy slots 13/14); PL trimmed from 12 → 11 for v1 (dropped entityIdentifier slot 12). Both trimming decisions interface-level only — parsers silently ignore additional trailing components from the raw tree. v2 may restore full shapes if vendor-quirk fixtures require them (Plan 03-03).
- PL.facility uses inline `parseFacility` nested-HD synthesis helper — mirrors `parseCx::parseAssigningAuthority` from Plan 02. Helper kept inline in pl.ts, NOT promoted to `_shared.ts`. Pattern now exists in 2 places (CX, PL); DRY threshold for promoting to `_shared` is 3 occurrences. Keeps `_shared.ts` focused on truly-universal helpers (readComponent, readSubcomponent) used by every composite (Plan 03-03).
- Field gains 10 `.asXxx()` composite coercions (asXpn, asXad, asCx, asCwe, asCe, asXtn, asPl, asTs, asNm, asHd). Each delegates to its Plan 02/03 parser with a shared frozen `EMPTY_REP` fallback so empty Fields return empty typed objects (`{}` for optional-field composites, `{raw:"", date:undefined}` / `{raw:"", value:undefined}` for TS/NM) without throwing. D-09 compliant — not memoized; two calls return distinct objects (Plan 03-04).
- `Hl7Message` gains 3 mutation methods: `setField(path, value)` (leaf-to-root rebuild with auto-create of missing rep/comp/sub within existing field; TypeError on missing segment), `addSegment(name, fields)` (D-19 segment-name regex), `removeSegment(type, occurrence | { all })` (MSH-protected, idempotent on unknowns). All three return `this` (D-15 chainable), invalidate both wrapper caches wholesale (D-17), and never touch the frozen warnings array (D-16). D-18: mutation value accepted verbatim — re-escape deferred to Phase 5 serializer (Plan 03-04).
- Segment.field() now applies a user-facing `n-1` MSH offset so `msg.segments('MSH')[0].field(3)` returns MSH-3 consistently with `msg.get('MSH.3')`. Plan 01 shipped dot-path with the offset but the wrapper without it — the asymmetry surfaced as a Rule 1 bug when coercion tests targeted MSH-3 (APP^1.2.3^UUID) and received MSH-4 (FAC) instead. Fixed in Plan 04 (Plan 03-04).
- Wholesale cache invalidation (drop both `_segmentsByType` and `_allSegments`) on every mutation, rather than per-type invalidation. D-17 letter said "invalidate the Segment/Field wrapper cache for the affected segment type"; wholesale is equally correct, simpler, and preserves Plan 01's cross-cache identity guarantee since `segments(type)` filters from `allSegments()` (Plan 03-04).
- HL7 namespace is types-only; parsers exported as named values alongside (D-13 "named exports AND re-exported under an HL7 namespace"). `src/model/types/namespace.ts` holds nothing but `export type { ... }`; `export * as HL7 from "./namespace.js"` in `src/index.ts` surfaces it. Consumers import types as either `import type { XPN }` or `HL7.XPN`; parsers as `import { parseXpn }` (Plan 03-04).
- `setField` auto-creates missing repetitions / components / subcomponents within an existing field, but does NOT auto-create missing segments. Throws `TypeError` with an actionable message (`Add it first with addSegment(...)`). Matches CONTEXT.md Claude's Discretion recommendation (Plan 03-04).
- `setField` rebuilds the affected path leaf-to-root (new RawComponent → new RawRepetition → new RawField → new RawSegment), keeping declared `readonly Raw*` shapes structurally immutable. Only readonly bypass: reassigning `this.rawSegments` (documented inline as D-16). ~125 object allocations per mutation — negligible (Plan 03-04).
- `emitField` is the SOLE D-04 reescape chokepoint — every other emitter (`emitMessage`, `emitPrettyPrint`, future Phase 6 profile hooks) composes on it and never calls `reescape` directly. Strips trailing empty components AND trailing empty subcomponents per D-02; preserves `RawField.isNull === true` as the two-character literal `""` (quote-quote). Zero module-level state, no caching (D-30) (Plan 05-01).
- `emitSegment` throws a loud `Error` on MSH input — the one deliberate deviation from D-07 "never throws" purity. Justified because silent mis-emission on MSH would re-escape the encoding chars in MSH-2 and produce garbage output downstream. Guards the D-06 routing contract: the only correct caller for MSH is `to-string.ts::emitMessage`, which inlines MSH-1/MSH-2 before handing MSH-3..N to `emitField` directly. Error message explicitly tells the caller to route through `to-string.ts`'s D-06 path (Plan 05-01).
- `Hl7Message.toString` / `toJSON` / `prettyPrint` are class-method-delegates-to-module-level-emitter (mirrors Phase 4 `observations()` delegating to `walkObservations`). Method body is a single-line `return emit*(this);`. Naming `toString` overrides `Object.prototype.toString` with matching return type (`(): string`) — TS + ESLint accept it without the `override` keyword (class extends nothing) (Plan 05-01).
- Stubs that throw a plan-identified `NOT IMPLEMENTED — Phase 5 Plan 0N` marker are the disjoint-file contract gate. Plans 02/03/04/05 each replace ONE function body (`emitMessage`, `emitJson`, `emitPrettyPrint`, `buildMessage` + its two helpers respectively); NOBODY touches `src/model/message.ts`, `src/index.ts`, `src/serialize/emit-field.ts`, `vitest.config.ts`, or the LIVE `SerializedMessage` / `BuildMessageInit` interface declarations (Plan 05-01).
- `SerializedMessage` is boundary-frozen (top-level `Object.freeze` only); inner arrays are `readonly` at the TypeScript level but mutable at runtime. Deep-freeze explicitly rejected per D-30 (emit is hot-path; type-level readonly contract is sufficient). Documented inline on the interface JSDoc so Plan 03's `emitJson` implementer has a locked semantic to conform to (Plan 05-01).
- `BuildMessageInit` empty-vs-null semantics documented on the interface JSDoc: omitting a field and passing an empty string produce IDENTICAL wire output (both emit as absent). To emit HL7 explicit null (`""`) at a specific position, `buildMessage({...}).setField(path, '""')` — the Phase 3 `setField` mutation sets `isNull=true` which the emitter preserves per D-02. No separate null-marker input shape. Documented at the interface level so Plan 05's `buildMessage` implementer doesn't need to re-invent it (Plan 05-01).
- Vitest per-directory coverage thresholds extended to `src/serialize/**` and `src/builder/**` at the same `lines: 90, branches: 85, functions: 90, statements: 90` bar as Phase 1/2/3/4 dirs. Load-bearing for Phase 7's `pnpm test:coverage` gate — without it, a low-coverage new dir could hide behind the 90% top-level average (Plan 05-01).
- **Phase 2 tokenize now unescapes subcomponents on parse (Plan 05-02 Rule-3 deviation).** `tokenizeComponent` runs every subcomponent through `unescape(sub, enc, emit, position)`, so the raw tree stores DECODED strings (e.g. `Smith|Jones` not `Smith\F\Jones`). This is the exact inverse of Phase 5 `reescape` on emit — the pair makes SER-02 first-pass structural equivalence hold. Without this fix, emit would double-escape literal backslashes in the raw tree (`Smith\F\Jones` → `Smith\E\F\E\Jones`), and SER-02 structural round-trip would only hold on the second pass via D-03 idempotency normalization. MSH-1 / MSH-2 placeholders intentionally NOT unescaped (they flow through the D-06 emission path). `UNKNOWN_ESCAPE_SEQUENCE` warnings from `unescape` propagate with full positional context (segment, field, rep, component, subcomponent all 1-indexed). `src/model/field.ts::value` getter's unescape-on-access left in place — double-unescape on a decoded subcomponent is identity; removing would break non-parser callers (Plan 05-02).
- **SER-02 first-pass structural equivalence confirmed.** 5 canonical fixtures under `test/fixtures/round-trip/` (canonical-adt-a01, oru-r01-repetitions, null-fields, embedded-delimiters, decoded-br) round-trip with `rawSegments` deep equality on the first pass — not just byte-identical idempotency from the second pass. `encodingCharacters` also preserved structurally. Fixtures use literal CR byte terminators (written via Node script because the Write tool normalises to LF) (Plan 05-02).
- **`emitJson` is a direct-map raw-tree mirror with exactOptionalPropertyTypes-safe conditional `profile` assignment.** Uses `.map().map().map()` projection from `msg.rawSegments`, `subcomponents.slice()` to decouple from parser-internal arrays, and the `type Mutable<T> = { -readonly [K in keyof T]?: T[K] }` + `if (msg.profile !== undefined) out.profile = ...` pattern (mirror of `src/helpers/meta.ts::buildMeta`) to satisfy `exactOptionalPropertyTypes` — an absent key is valid for the optional `profile?`, an explicit `profile: undefined` is not. Top-level `Object.freeze(out)` at return for W5 boundary freeze (Plan 05-03).
- **B3 (Plan 05-03): `Hl7Message.profile`'s TYPE constraints eliminated two test cases and one code fallback.** The public field is `{readonly name: string; readonly lineage: readonly string[]} | undefined` — `lineage` is REQUIRED when profile is defined, not optional. The upstream parser constructor (src/parser/index.ts ~line 385) already strips non-serializable `Profile`-descriptor fields (onWarning, customSegments, dateFormats, description) before assignment, so those fields never reach emitJson. Original tests "profile does NOT include non-serializable fields" (#14) and "profile.lineage defaults to [] when not set" (#15) were TYPE-UNREACHABLE. Replaced with a single structural `Object.keys(snap.profile).sort() === ["lineage", "name"]` assertion at the output boundary. The `?? []` fallback on `msg.profile.lineage` was also removed — dead code given the type guarantee (Plan 05-03).
- **W5 boundary-freeze semantics codified at runtime (Plan 05-03).** Two tests anchor the trade-off: `Object.isFrozen(msg.toJSON()) === true` (top-level frozen); `Object.isFrozen(snap.segments) === false` (inner arrays intentionally mutable at runtime — TS readonly contract + boundary freeze is sufficient; deep-freeze rejected per D-30 cost doctrine). Plan 01 already documented this on the `SerializedMessage` interface JSDoc; Plan 03 confirms runtime matches declared contract (Plan 05-03).
- **D-30 no-caching observable — `emitJson(msg) !== emitJson(msg)` (Plan 05-03).** Each call returns a new top-level reference (referential inequality) while content is deep-equal (`toEqual`). The structural equality holds because `.map()` produces fresh arrays and plain objects each call; no identity stability is expected or desired at this boundary. If Phase 6 or Phase 7 ever adds caching, the D-30 commitment is observable to break — the `not.toBe` assertion is the guard (Plan 05-03).

### Active Todos

(none — pending Phase 1 planning)

### Blockers

(none)

### Notes

- Roadmap derived from 97 v1 REQ-IDs across 13 categories (SETUP, PARSE, MODEL, HELPERS, TYPES, TOL, SER, PROF, BIP, TEST, EX, KIT, DOC).
- Tolerance (TOL) folded into Phase 2 (Core Parser) because warnings are deeply coupled to parsing and standard granularity discourages splitting cross-cutting concerns into their own phase when they can't run independently.
- Testing (TEST) is its own late phase (Phase 7) to centralize coverage enforcement, vendor-quirks fixtures, strict-mode sweep, and profile-authoring tests — but earlier phases still ship with enough tests to verify their success criteria; Phase 7 is hardening, not initial testing.
- Library has no UI; every phase is `UI hint: no`.

## Session Continuity

- **Last action:** Phase 5 Plan 04 (pretty-print) executed 2026-04-19. Shipped the `emitPrettyPrint` body (D-22 no options + D-25 header with `-` fallbacks and `(N segments)` always-present suffix + D-23 segment-per-line with labeled `[N]=value` fields / MSH starts at [3] / non-MSH at [1] / empty-emitted values suppressed / isNull renders as `[N]=""` / unified MSH-offset formula works in one loop + D-24 composites render as raw HL7 string via the Plan 01 emitField chokepoint + D-26 pure / deterministic / non-mutating + D-30 no caching). Three-function module layout: public `emitPrettyPrint` + private `buildHeaderLine` + private `buildSegmentLine`. Closed SER-04. 29-test `test/serialize-pretty-print.test.ts` unit suite covers 6 decision blocks: header (9), segment lines (9), depth (1), **W2 raw-escape (3 dedicated tests — embedded `|`→`\F\`, embedded `\n`→`\.br\`, all 5 delimiter types via hand-built subcomponent)**, line structure (3), purity (4). Function-level JSDoc on `emitPrettyPrint` carries the full W2 raw-escape paragraph (complementing the Plan 01 note on `Hl7Message.prettyPrint`). **Plan scope honored exactly** — only `src/serialize/pretty-print.ts` (body only; module JSDoc, `Hl7Message` import, and function signature preserved from Plan 01) + new `test/serialize-pretty-print.test.ts` touched. 578/578 tests passing across 46 files (+29 from Plan 04). Typecheck + lint (max-warnings=0) + build + bundle-smoke (byte-identical match against plan's expected output) all green. Zero deviations (no Rule 1/2/3/4 items surfaced).
- **Next action:** `/gsd-execute-phase 5` continuation — Plan 05 (build-message). ⚠ Phase 1 & 2 & 3 & 4 verification + Nyquist gates still open (not blocking Phase 5 execution under yolo mode).
- **Open questions:** (none added this plan). Plan 05 implementer should note: (a) the three emitters (`toString`, `toJSON`, `prettyPrint`) are now fully wired + implemented — `buildMessage` callers can chain `.addSegment(...).prettyPrint()` to visually verify the outbound message before `.toString()`; (b) the W2 raw-escape semantics documented on `prettyPrint`'s function-level JSDoc apply identically to builder callers who pass literal delimiter chars as subcomponent values (they'll see escape forms on the wire AND in pretty-print); (c) Phase 2 tokenize's unescape-on-parse invariant (Plan 02 Rule-3 deviation) means `rawSegments` holds decoded subcomponents — `buildMessage` should construct decoded trees consistently with this. Phase 7 may lift selected IN2 / IN3 fields into Insurance based on vendor-quirk fixture evidence (carry-over). Phase 8's README Error Handling section should document the strict-mode `err.code` widening (carry-over from Phase 2).
- **Resume file:** .planning/phases/05-serialization-and-round-trip/05-04-SUMMARY.md

---

*Last updated: 2026-04-19 (Phase 5 Plan 04 DONE — emitPrettyPrint body + SER-04 closure + W2 raw-escape runtime confirmed via 3 dedicated tests; 578/578 tests; only Plan 05 build-message remains)*
