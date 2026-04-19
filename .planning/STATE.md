# @cosyte/hl7-parser — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/hl7-parser`
- **Core value:** A developer can parse a real-world, vendor-quirky HL7 v2 message and pull useful fields out of it in one line — without having read the HL7 spec.
- **Current focus:** Phase 3 — Structural Model & Types (IN PROGRESS — Plans 01 + 02 complete; Plans 03/04 pending. Phase 2 still pending /gsd-verify-work 2 + /gsd-validate-phase 2; Phase 1 still pending /gsd-verify-work 1 + /gsd-validate-phase 1.)
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

- **Milestone:** v1
- **Phase:** 3 — Structural Model & Types (IN PROGRESS — Plans 01 + 02 complete; Plans 03/04 pending)
- **Plans:** 4 plans across 3 waves (01 read-path-foundation — Wave 1 DONE; 02 composites-person-address-identifier — Wave 2 first plan DONE; 03 composites-telecom-location-timestamp-numeric — Wave 2 remainder; 04 mutation-and-barrel — Wave 3 capstone)
- **Status:** Plans 01 + 02 executed. Plan 02 ships 6 of 10 typed composite parsers: XPN (14 cols), XAD (12), HD (3), CX (10 with nested-HD synthesis on assigningAuthority), CWE (9 trimmed for v1), CE (6). Shared _shared.ts helpers (readSubcomponent, readComponent) centralise auto-unescape + empty-string→undefined mapping. All exactOptionalPropertyTypes-compliant via Mutable<T> + conditional assignment (no object-literal as casts). 242/242 tests passing; lint + typecheck + build green. Zero modifications to src/index.ts — Plan 04 wires the HL7 namespace barrel + Field.asXxx() coercions.
- **Progress:** 0/8 phases complete; 4/4 Phase 1 plans complete; 6/6 Phase 2 plans complete; 2/4 Phase 3 plans executed

```
[░░░░░░░░░░░░░░░░░░░░] 0%   (0 / 8 phases)
```

## Performance Metrics

- **Phases completed:** 0 (Phase 1 plans done; pending verifier + Nyquist + transition)
- **Plans completed:** 8
- **REQ-IDs validated:** 32 / 97 (SETUP-01..06 + PARSE-01..09 + TOL-01..10 + MODEL-01..05). TYPES-01 + TYPES-02 are partially progressed (6 of 10 composites ship; full close lands in Plan 04). Phase 7 will confirm via the coverage sweep + vendor-quirks fixtures.
- **Known coverage:** Phase 1 sanity 2/2. Phase 2 (Plans 01–06): full suite 123/123 passing. Phase 3 Plans 01 + 02: full suite 242/242 passing across 24 files (types-shared 7, types-xpn 7, types-xad 5, types-hd 6, types-cx 7, types-cwe 5, types-ce 5 new this plan + prior 200). Coverage enforcement starts in Phase 7 via `pnpm test:coverage`.

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

- **Last action:** Executed Phase 3 Plan 02 (composites-person-address-identifier) 2026-04-19. 3 TDD cycles (test→feat) landed 6 commits: 2d41168/79aed3a (_shared helpers), 4ad6975/c6cbf32 (XPN/XAD/HD), 050214f/93c9ddd (CX/CWE/CE). 6 of 10 typed composites ship; CX demonstrates nested-HD synthesis pattern. Full suite 242/242 green; typecheck + lint + build all pass. SUMMARY at `.planning/phases/03-structural-model-and-types/03-02-SUMMARY.md`.
- **Next action:** Execute Phase 3 Plan 03 (composites-telecom-location-timestamp-numeric — Wave 2 remainder: XTN, PL, TS/DTM, NM). Plan 03 consumes `_shared.ts` (readSubcomponent, readComponent) and `hd.ts` from Plan 02. After Plan 03 completes, Plan 04 (mutation-and-barrel) is the Wave-3 capstone that wires `Field.asXxx()` coercions and the `HL7` namespace barrel. ⚠ Phase 1 & 2 verification gates (`/gsd-verify-work 1`, `/gsd-validate-phase 1`, `/gsd-verify-work 2`, `/gsd-validate-phase 2`) are still open.
- **Open questions:** (none added this plan). Phase 8's README Error Handling section should document the strict-mode `err.code` widening (carry-over from Phase 2).
- **Resume file:** `.planning/phases/03-structural-model-and-types/03-02-SUMMARY.md`

---

*Last updated: 2026-04-19 (Phase 3 Plan 02 executed — 6 composites shipped; 242/242 tests green)*
