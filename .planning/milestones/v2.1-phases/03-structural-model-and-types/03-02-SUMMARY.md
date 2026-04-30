---
phase: 03-structural-model-and-types
plan: 02
subsystem: model
tags: [hl7, composites, typescript, xpn, xad, cx, cwe, ce, hd]

# Dependency graph
requires:
  - phase: 02-core-parser-and-tolerance
    provides: RawRepetition/RawComponent tree, EncodingCharacters, unescape(raw, enc, emit, pos), DEFAULT_ENCODING_CHARACTERS
  - phase: 03-structural-model-and-types
    plan: 01
    provides: read-path foundation (independent — Plan 02 only depends on the raw tree types, not on Plan 01's wrapper classes)
provides:
  - _shared.ts internal helpers (readSubcomponent, readComponent) — auto-unescape + empty-string→undefined mapping, silent per D-09
  - XPN (14 components) — Extended Person Name interface + parseXpn(rep, enc)
  - XAD (12 components) — Extended Address interface + parseXad(rep, enc)
  - HD (3 components) — Hierarchic Designator interface + parseHd(rep, enc); also consumed by CX
  - CX (10 components) — Extended Composite ID with nested-HD assigningAuthority + parseCx(rep, enc)
  - CWE (9 components, v1 trimmed) — Coded with Exceptions interface + parseCwe(rep, enc)
  - CE (6 components) — Coded Element interface + parseCe(rep, enc)
  - Nested-composite synthesis pattern (synthetic RawRepetition wrapping another composite's subcomponents) — reusable for Plan 03's XTN/PL if they need similar nesting
affects: [03-03-composites-telecom-location-timestamp-numeric, 03-04-mutation-and-barrel, 04-helpers-and-named-access, 05-serialization, 06-profiles, 07-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Mutable<T> local + conditional assignment — exactOptionalPropertyTypes-compliant construction without the forbidden object-literal `as` cast
    - Empty-string → undefined mapping in readSubcomponent — turns HL7's "explicitly-empty subcomponent" into the "omit the field" signal required by exactOptionalPropertyTypes
    - Nested-composite synthesis — parseCx.assigningAuthority builds a synthetic RawRepetition from a parent component's subcomponents and delegates to parseHd, avoiding logic duplication

key-files:
  created:
    - src/model/types/_shared.ts
    - src/model/types/xpn.ts
    - src/model/types/xad.ts
    - src/model/types/hd.ts
    - src/model/types/cx.ts
    - src/model/types/cwe.ts
    - src/model/types/ce.ts
    - test/types-shared.test.ts
    - test/types-xpn.test.ts
    - test/types-xad.test.ts
    - test/types-hd.test.ts
    - test/types-cx.test.ts
    - test/types-cwe.test.ts
    - test/types-ce.test.ts
  modified: []

key-decisions:
  - "Composite parsers are silent (D-09). readSubcomponent passes a no-op emitter to unescape so any UNKNOWN_ESCAPE_SEQUENCE warnings discovered at composite-read time are dropped. Best-effort position is { segmentIndex: 0 } — composites don't know their own position in the tree."
  - "Empty-string → undefined mapping centralizes exactOptionalPropertyTypes compliance in readSubcomponent. Composite parsers never see `\"\"` — they see either a real value or undefined — so the conditional-assignment pattern works identically for every optional field."
  - "CX.assigningAuthority (component 4) uses a nested HD shape via synthetic RawRepetition trick. The 3 HD subfields live as subcomponents of the CX component; we wrap each subcomponent as its own single-subcomponent component so parseHd's existing (rep, enc) signature consumes them directly. Prevents duplicating HD parsing logic inside parseCx."
  - "CX.assigningFacility (component 6) flattened to plain string in v1 — simpler than nested HD and matches the 'flatten nested CWE to string' precedent in XPN.nameContext. Callers who need the full HD can parse the raw string separately in a future iteration."
  - "CWE trimmed to 9 components for v1. Full HL7 v2.6+ CWE has 22 components (subfields for effectiveDate, expirationDate, value-set OIDs, etc.) but the 9 core fields — identifier, text, coding-system triples, version ids, and originalText — cover the common HL7 v2.5 use cases. v2 may restore the full shape."
  - "T-03-02-02 mitigation: parseAssigningAuthority explicitly checks comp.subcomponents.every(s => s === \"\") before synthesising the RawRepetition, so all-empty input returns undefined rather than a stub HD object. Prevents {} HD values from leaking into CX.assigningAuthority."
  - "Plan 02 ships types + parsers but does NOT modify src/index.ts. The HL7 namespace barrel and Field.asXxx() wiring land in Plan 04 (capstone). This keeps Plan 02 and Plan 03 truly disjoint — no shared edits, no merge risk — and lets Plan 04 unify all 10 composites in one atomic barrel rewrite."

patterns-established:
  - "Pattern 1 — readSubcomponent-backed composite parser: every composite reads components via readComponent(rep, i, enc); the helper returns undefined for absent/empty and the caller conditionally assigns via Mutable<T>. Pattern scales identically to 3, 6, 9, 10, 12, or 14 components."
  - "Pattern 2 — Nested-composite synthesis: when component N of composite A is shaped like composite B (e.g. CX.4 = HD), parseA synthesises a RawRepetition from comp.subcomponents and delegates to parseB. No logic duplication, no special-case parser."
  - "Pattern 3 — exactOptionalPropertyTypes-compliant build via Mutable<T>: `type Mutable<T> = { -readonly [K in keyof T]?: T[K] }` + conditional assignment + implicit return. Passes consistent-type-assertions: objectLiteralTypeAssertions: \"never\" without any cast."
  - "Pattern 4 — @internal on helper constants and helper functions: _shared.ts marks NOOP_EMITTER, DEFAULT_POSITION, and both exports with @internal so ESLint jsdoc/require-example doesn't fire on internal-only symbols."

requirements-completed: []
# Note: TYPES-01 and TYPES-02 are partial — 6 of 10 composites land here; Plan 03
# adds the remaining 4 (XTN, PL, TS, NM) and Plan 04 wires them onto Field.asXxx().
# Requirements close when Plan 04 ships — marked in Plan 04 SUMMARY.

# Metrics
duration: 5min
completed: 2026-04-19
---

# Phase 3 Plan 02: Composite parsers — Person (XPN), Address (XAD), Identifier (CX, CWE, CE), Hierarchic (HD) Summary

**6 of 10 typed HL7 composite parsers ship with a shared _shared.ts helper, silent auto-unescape at the leaf, exactOptionalPropertyTypes-compliant omit-when-absent semantics, and a nested-HD synthesis pattern on CX.assigningAuthority that reuses parseHd verbatim.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-19T02:08:32Z
- **Completed:** 2026-04-19T02:13:42Z
- **Tasks:** 3 (each with RED test commit + GREEN feat commit)
- **Files created:** 14 (7 source + 7 test)
- **Files modified:** 0

## Accomplishments

- **`src/model/types/_shared.ts`** — 2 internal helpers (`readSubcomponent`, `readComponent`) centralise the "read + auto-unescape + omit-when-absent" pattern used by all 10 composite parsers (this plan + Plan 03). No-op emitter per D-09 (composites are silent). 7 tests covering missing component, out-of-range index, empty-string → undefined, and unescape at leaf.
- **`src/model/types/xpn.ts`** — 14-component Extended Person Name with full JSDoc component table. 7 tests including `exactOptionalPropertyTypes` proof (`"givenName" in result === false` when absent, `Object.keys(out)` returns only populated keys).
- **`src/model/types/xad.ts`** — 12-component Extended Address. 5 tests covering full 12-field case, 6-field US-address case, empty, unescape, and absent-component omission.
- **`src/model/types/hd.ts`** — 3-component Hierarchic Designator (namespaceId, universalId, universalIdType). 6 tests. Exported type consumed by CX for nested-composite synthesis.
- **`src/model/types/cx.ts`** — 10-component Extended Composite ID with nested-HD `assigningAuthority`. The `parseAssigningAuthority` helper builds a synthetic `RawRepetition` from the CX component 4's subcomponents so `parseHd` consumes it via its existing signature. Guard returns `undefined` when every subcomponent is empty (T-03-02-02 mitigation). 7 tests.
- **`src/model/types/cwe.ts`** — 9-component Coded with Exceptions (v1 trimmed shape — full v2.6 has 22 components; 9 covers the common HL7 v2.5 use cases). 5 tests.
- **`src/model/types/ce.ts`** — 6-component Coded Element (OBX.3 and similar slots). 5 tests.
- **Full suite: 242/242 tests passing across 24 test files** (200 prior + 42 new this plan). Typecheck, lint, and build all green. Zero modifications to `src/index.ts`, `src/model/message.ts`, `src/model/segment.ts`, `src/model/field.ts`, or any file outside `src/model/types/` — Plan 02 and Plan 03 are truly disjoint.

## Task Commits

Each task was committed atomically with RED/GREEN split (project convention):

1. **Task 1: _shared.ts helpers** — `2d41168` (test), `79aed3a` (feat)
2. **Task 2: XPN, XAD, HD composite parsers** — `4ad6975` (test), `c6cbf32` (feat)
3. **Task 3: CX, CWE, CE composite parsers** — `050214f` (test), `93c9ddd` (feat)

## Files Created/Modified

**Created (source):**
- `src/model/types/_shared.ts` — readSubcomponent + readComponent; NOOP_EMITTER + DEFAULT_POSITION constants (all `@internal`).
- `src/model/types/xpn.ts` — `XPN` interface (14 optional readonly fields) + `parseXpn(rep, enc): XPN`.
- `src/model/types/xad.ts` — `XAD` interface (12 optional readonly fields) + `parseXad(rep, enc): XAD`.
- `src/model/types/hd.ts` — `HD` interface (3 optional readonly fields) + `parseHd(rep, enc): HD`.
- `src/model/types/cx.ts` — `CX` interface (10 optional fields; 1 nested-HD field) + `parseCx(rep, enc): CX` + internal `parseAssigningAuthority` helper.
- `src/model/types/cwe.ts` — `CWE` interface (9 optional readonly fields) + `parseCwe(rep, enc): CWE`.
- `src/model/types/ce.ts` — `CE` interface (6 optional readonly fields) + `parseCe(rep, enc): CE`.

**Created (test):**
- `test/types-shared.test.ts` — 7 tests for readSubcomponent + readComponent.
- `test/types-xpn.test.ts` — 7 tests for XPN.
- `test/types-xad.test.ts` — 5 tests for XAD.
- `test/types-hd.test.ts` — 6 tests for HD.
- `test/types-cx.test.ts` — 7 tests for CX (including 3 covering nested-HD behaviour).
- `test/types-cwe.test.ts` — 5 tests for CWE.
- `test/types-ce.test.ts` — 5 tests for CE.

**Modified:** none.

## Decisions Made

- **Empty-string → undefined centralised in `readSubcomponent`.** HL7 parses `^^Middle^` with explicit `""` subcomponents at lower layers; composites need to OMIT rather than record empty strings for `exactOptionalPropertyTypes` compliance. Pushing the mapping into the shared helper means every composite gets uniform behaviour for free.
- **Silent emitter (D-09).** `NOOP_EMITTER = (): void => {}` — any `UNKNOWN_ESCAPE_SEQUENCE` discovered at composite-read time is dropped. Plan 04 may revisit when wiring `Field.asXxx()` if the warning policy needs to change, but composites themselves stay pure.
- **Nested-HD synthesis chosen over duplicated HD logic inside parseCx.** Alternative was a private `parseHdFromSubcomponents(comp, enc)` that walks subcomponents directly. The synthesis approach keeps `parseHd` the single source of truth for HD's 3-component shape — future changes to HD (e.g. if v2 adds components) automatically flow through CX without a parser change.
- **`assigningFacility` flattened to `string` for v1.** HL7 spec is HD-shaped; v1 picks simplicity over spec completeness. Matches XPN.nameContext precedent (CWE-shaped in spec, string in v1). Documented in CX interface JSDoc so callers know.
- **CWE trimmed to 9 for v1.** Full v2.6+ CWE has 22 components; 9 covers the common v2.5 use cases (GLU/Glucose/LN code + text + coding systems + versions + originalText). Documented in CWE file-level JSDoc.
- **Plan 02 and Plan 03 file ownership stays truly disjoint.** Plan 02 ships the 6 composites and `_shared.ts`; Plan 03 will consume `_shared.ts` + `hd.ts` (per plan's W-1 dependency note) and add XTN, PL, TS, NM. Zero shared-edit risk.

## Deviations from Plan

None. Plan executed exactly as written — all 3 tasks completed on the first pass; no Rule-1/2/3 auto-fixes; no Rule-4 architectural questions. RED/GREEN TDD cycles matched the plan's acceptance criteria line-for-line.

## Issues Encountered

None.

## User Setup Required

None — pure code change. No environment variables, no external services, no manual configuration.

## Next Phase Readiness

**Plan 03 ready (runs next).** Plan 03 reads `_shared.ts` (`readSubcomponent`, `readComponent`) and `hd.ts` (`parseHd` for XTN's internal address-like subcomponents if needed). Both files are committed, exported as named symbols, and covered by tests. The nested-composite synthesis pattern on CX is documented here — Plan 03's XTN and PL can reuse it if they need to synthesise nested shapes.

**Plan 04 ready (capstone).** All 6 composite parsers follow the same `parseXxx(rep: RawRepetition, enc: EncodingCharacters): Xxx` signature. Plan 04's `Field.asXpn()`, `.asXad()`, `.asCx()`, `.asCwe()`, `.asCe()`, `.asHd()` wrappers reduce to:
```ts
public asXpn(): XPN {
  const rep = this.raw.repetitions[0];
  return rep === undefined ? EMPTY_XPN : parseXpn(rep, this.enc);
}
```
Named exports + `HL7` namespace barrel at `src/index.ts` also land in Plan 04.

**Known Stubs:** None. Every behaviour documented in the plan's must_haves truths is exercised by a passing test.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. Composite parsers are pure functions consuming an already-tokenized raw tree; `parseAssigningAuthority` mitigates T-03-02-02 per the threat model.

## Self-Check: PASSED

Verified post-summary:
- All 7 source files and all 7 test files exist on disk:
  - `src/model/types/_shared.ts`, `xpn.ts`, `xad.ts`, `hd.ts`, `cx.ts`, `cwe.ts`, `ce.ts`
  - `test/types-shared.test.ts`, `types-xpn.test.ts`, `types-xad.test.ts`, `types-hd.test.ts`, `types-cx.test.ts`, `types-cwe.test.ts`, `types-ce.test.ts`
- All 6 task commits (3 RED + 3 GREEN) are present in `git log --oneline --all`:
  `2d41168`, `79aed3a`, `4ad6975`, `c6cbf32`, `050214f`, `93c9ddd`.
- `pnpm typecheck`, `pnpm lint` (max-warnings=0), `pnpm test` (242/242), and `pnpm build` all exit 0.
- Plan-level TDD gate compliance: 3 `test(...)` commits precede 3 `feat(...)` commits — RED/GREEN ordering preserved per plan convention.

---
*Phase: 03-structural-model-and-types*
*Completed: 2026-04-19*
