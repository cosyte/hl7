---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: milestone
status: "Phase 4 EXECUTED. All 4 plans complete — 01 scaffold-xcn-and-cache, 02 meta-and-patient, 03 visit-and-observations, 04 orders-and-collections. All 7 HELPERS-0X REQ-IDs (HELPERS-01..07) CLOSED. All 9 named helper surfaces ship: msg.meta / msg.patient / msg.visit / msg.observations() / msg.orders() / msg.nextOfKin() / msg.allergies() / msg.diagnoses() / msg.insurance(). 459/459 tests passing across 41 files. Pending: /gsd-verify-work 4 + /gsd-validate-phase 4. Phases 1, 2, 3 verify + Nyquist audits still open."
last_updated: "2026-04-19T00:00:00.000Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 19
---

# @cosyte/hl7-parser — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/hl7-parser`
- **Core value:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.
- **Current focus:** Phase 3 — Structural Model & Types (COMPLETE — verifier PASSED 4/4 success criteria + 11/11 REQ-IDs. Pending /gsd-validate-phase 3 Nyquist audit. Phase 2 still pending /gsd-verify-work 2 + /gsd-validate-phase 2; Phase 1 still pending /gsd-verify-work 1 + /gsd-validate-phase 1. Next phase: 4 — Named Helpers.)
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

- **Milestone:** v1
- **Phase:** 3 — Structural Model & Types (COMPLETE — verifier PASSED 4/4 success criteria + 11/11 REQ-IDs on 2026-04-18; Nyquist validation still pending)
- **Plans:** 4 plans across 3 waves (01 read-path-foundation — Wave 1 DONE; 02 composites-person-address-identifier — Wave 2 first plan DONE; 03 composites-telecom-location-timestamp-numeric — Wave 2 remainder DONE; 04 mutation-and-barrel — Wave 3 capstone DONE)
- **Status:** Plan 04 (capstone) executed. All 10 `.asXxx()` composite coercions wired on Field (XPN/XAD/CX/CWE/CE/XTN/PL/TS/NM/HD) with shared EMPTY_REP fallback. Hl7Message gains setField/addSegment/removeSegment mutation API — chainable (D-15), cache-invalidating (D-17 wholesale), warnings-preserving (D-16), with D-18/D-19 validation. HL7 namespace barrel + named-exports shipped via `src/index.ts` + new `src/model/types/namespace.ts` + `src/model/types/index.ts`. MODEL-06, MODEL-07, TYPES-02 CLOSED. Bug fix [Rule 1]: Segment.field() needed the user-facing MSH offset symmetric with dot-path resolver (MSH.3 → fields[2]); previously untested at the wrapper level. 327/327 tests passing across 31 files; typecheck + lint + build all green.
- **Progress:** 1/8 phases complete (Phase 3 verified); 4/4 Phase 1 plans complete; 6/6 Phase 2 plans complete; 4/4 Phase 3 plans complete

```
[██░░░░░░░░░░░░░░░░░░] 12%   (1 / 8 phases)
```

## Performance Metrics

- **Phases completed:** 1 (Phase 3 verified 2026-04-18; Phases 1 & 2 plans done but pending verifier + Nyquist)
- **Plans completed:** 19 (4 Phase-1 + 6 Phase-2 + 4 Phase-3 + 4 Phase-4)
- **REQ-IDs validated:** 38 / 97 (SETUP-01..06 + PARSE-01..09 + TOL-01..10 + MODEL-01..07 + TYPES-01..04). All 7 MODEL + all 4 TYPES requirements now closed. Phase 7 will confirm via the coverage sweep + vendor-quirks fixtures.
- **Known coverage:** Phase 1 sanity 2/2. Phase 2 (Plans 01–06): full suite 123/123 passing. Phase 3 Plans 01 + 02 + 03 + 04: full suite 327/327 passing across 31 files (model-field-coercions 13, model-mutation 28, model-public-exports 6 new this plan + prior 280). Coverage enforcement starts in Phase 7 via `pnpm test:coverage`.

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

- **Last action:** Phase 4 Plan 04 (orders + collections) executed 2026-04-19. HELPERS-05 + HELPERS-06 + HELPERS-07 closed — Phase 4 COMPLETE. `orders()` implements a two-slot ORC state machine (pendingOrc / currentOrc) over `msg.allSegments()` for D-12 positional OBX grouping + ORC-1 → orderControl attachment; reuses `buildObservation` from Plan 03 so OBX → Observation dispatch lives in exactly ONE place. `nextOfKin` / `allergies` / `diagnoses` are simple segment walkers; `insurance` is a single-slot IN1 state machine setting positional `hasIn2` / `hasIn3` booleans. Universal HELPERS-07 never-throws sweep proves all 9 Phase 4 helpers handle empty / minimal / malformed input gracefully. Two [Rule 1 - Bug] fixture fixes applied during TDD GREEN (OBR fixture off-by-one → XCN at OBR-17 corrected to OBR-16; NK1 fixture off-by-one → FTHR at NK1-8 corrected to NK1-7). Full suite green at 459/459 across 41 files (+28 from Plan 03 baseline).
- **Next action:** `/gsd-verify-work 4` then `/gsd-validate-phase 4` (Nyquist). ⚠ Phase 1 & 2 & 3 verification gates (`/gsd-verify-work 1`, `/gsd-validate-phase 1`, `/gsd-verify-work 2`, `/gsd-validate-phase 2`, `/gsd-validate-phase 3`) still open. After Phase 4 is verified + validated, `/gsd-plan-phase 5` (mutation-on-helpers).
- **Open questions:** (none added this plan). Phase 7 may lift selected IN2 / IN3 fields into Insurance based on vendor-quirk fixture evidence (carry-over). Phase 8's README Error Handling section should document the strict-mode `err.code` widening (carry-over from Phase 2).
- **Resume file:** .planning/phases/04-named-helpers/04-04-SUMMARY.md

---

*Last updated: 2026-04-19 (Phase 4 COMPLETE — all 4 plans executed; HELPERS-01..07 all closed; 9 named helper surfaces ship; 459/459 tests; pending `/gsd-verify-work 4` + `/gsd-validate-phase 4`)*
