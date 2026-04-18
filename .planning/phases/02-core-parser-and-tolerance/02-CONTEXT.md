# Phase 2: Core Parser & Tolerance — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers `parseHL7(raw, optionsOrProfile?)` — the tokenizer/preprocessor for HL7 v2.1–v2.8 text (or `Buffer`) — plus the warnings + strict-mode system that surrounds it. It produces an `Hl7Message` shell that subsequent phases extend.

**In scope:**
- Input normalization: empty-check, BOM strip, MLLP framing strip, line-ending normalization to `\r`
- MSH-driven delimiter discovery (MSH-1 field separator, MSH-2 encoding characters)
- Segment split, field/repetition/component/subcomponent tokenization
- HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`, `\X..\`, `\Z..\`) — unescape on access, plumbing for re-escape
- Empty-vs-null field semantics (`||` vs `""`)
- Buffer input with MSH-18 charset resolution (UTF-8 default, unknown → warn + UTF-8)
- Full Tier 2 warning catalogue with stable string codes + positional context
- `onWarning` callback fired inline as each warning is emitted
- Strict-mode escalation (`{ strict: true }`) for every Tier 2 warning → `Hl7ParseError`
- 4 Tier-3 fatal codes (locked): `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`
- `dateFormats: [...]` option with `TIMESTAMP_FALLBACK_FORMAT` warning plumbing and built-in fallbacks (ISO 8601, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YYYY HH:mm:ss`)
- Declaration of `ProfileDefinitionError` alongside `Hl7ParseError` (class only — consumed in Phase 6)

**Out of scope (belongs to later phases):**
- `msg.get(path)`, `msg.getAll(type)`, `msg.segments(type)`, `.field(n)` traversal — Phase 3
- Typed composite parsers (XPN, XAD, CX, CWE, XTN, PL, TS/DTM, NM, HD) — Phase 3
- `msg.meta.{type, controlId, timestamp, sendingApp, ...}` named metadata — Phase 4
- Mutation methods (`setField`, `addSegment`, `removeSegment`) — Phase 3 (read path) / later
- `toString()` / `toJSON()` / `prettyPrint()` real emitters — Phase 5 (Phase 2 may ship a stub type)
- Profile application (`parseHL7(raw, profile)` surface exists; actual profile effects wired in Phase 6)
- Vendor-quirks fixture library — Phase 7

</domain>

<decisions>
## Implementation Decisions

### Parser Pipeline Shape

- **D-01: Layered pipeline.** parse stages are discrete: `normalize` → `strip MLLP` → `split segments` → `read MSH delimiters` → `tokenize fields / reps / comps / subs` → (on-access) `unescape`. Each stage is its own module, testable in isolation, parallelizable across plans. Matches ROADMAP.md Phase 2 parallelization note.
- **D-02: One file per stage under `src/parser/`.** Expected files: `normalize.ts`, `mllp.ts`, `segments.ts`, `delimiters.ts`, `tokenize.ts`, `escapes.ts`, `warnings.ts` (registry + emit), `errors.ts` (`Hl7ParseError`, `ProfileDefinitionError`), `index.ts` (public `parseHL7`). Each plan owns disjoint files.
- **D-03: Preprocessing order.** `EMPTY_INPUT` check (fatal) → strip UTF-8 BOM (silent, Tier 1) → strip MLLP framing bytes `0x0B`/`0x1C`/`0x0D` (emit `MLLP_FRAMING_STRIPPED`) → normalize `\r\n`/`\n`/mixed → `\r` internally (silent, Tier 1).
- **D-04: Position tracking is spec-minimum.** Warnings carry `{ segmentIndex, fieldIndex, componentIndex, repetitionIndex, subcomponentIndex }` per TOL-03. Tier-3 fatal errors additionally carry a byte offset + snippet per TOL-02. No line/column tracking in Phase 2 (can be added later without reshaping the API).

### Phase 2 Output Boundary

- **D-05: parseHL7() returns a minimal `Hl7Message` shell.** Phase 2 ships the real `Hl7Message` class (named export) with: the raw positional tree of segments, `warnings: readonly Hl7ParseWarning[]`, `encodingCharacters`, `version`, and a placeholder `profile?: { name; lineage } | undefined` (populated by Phase 6). `get()/getAll()/segments()/typed composites` land in Phase 3 without reshaping the constructor surface.
- **D-06: Public signature is `parseHL7(raw: string | Buffer, optionsOrProfile?)`.** Runtime discriminant: if the arg has a `name: string` field and no options-only keys (`strict`, `onWarning`, `dateFormats`, `profile`, `stripMllpFraming`, `trimFields`), treat as a `Profile`; otherwise treat as `ParseOptions` (with optional nested `profile`). Exposed via TypeScript overloads for clean IntelliSense:
  - `parseHL7(raw): Hl7Message`
  - `parseHL7(raw, profile: Profile): Hl7Message`
  - `parseHL7(raw, options: ParseOptions): Hl7Message`
- **D-07: Warnings live on `msg.warnings` (readonly, frozen array of `Hl7ParseWarning`).** Always present, possibly empty. Matches TOL-04 exactly. `onWarning` fires inline as each warning is emitted (see D-11).
- **D-08: MSH metadata exposed in Phase 2 is limited to `msg.encodingCharacters` + `msg.version`.** All other MSH-derived fields (`type`, `controlId`, `timestamp`, `sendingApp`, etc.) are Phase 4's `msg.meta`. Phase 2 tests assert MSH was parsed correctly via these two surfaces plus the raw segment tree.

### Warning-Code Registry

- **D-09: Registry is a `const` record + string-literal union.** `export const WARNING_CODES = { MLLP_FRAMING_STRIPPED: "MLLP_FRAMING_STRIPPED", ... } as const` and `export type WarningCode = typeof WARNING_CODES[keyof typeof WARNING_CODES]`. Zero runtime cost, autocompletes, enables exhaustive `switch` narrowing. Lives in `src/parser/warnings.ts` and re-exports from `src/index.ts` so consumers can compare `w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED` without magic strings.
- **D-10: One factory per warning code.** e.g. `mllpFramingStripped(position) → Hl7ParseWarning`. Each factory owns its default message template and required position keys. Hardest to construct an invalid warning; most IDE-discoverable. Same pattern (parallel factories) for fatal codes.
- **D-11: Single `emitWarning(w)` chokepoint** in the parser. Responsibilities: (a) push to `msg.warnings`, (b) invoke `options.onWarning?.(w)`, (c) if `options.strict`, throw `new Hl7ParseError(w.code, w.message, w.position, snippetFromInput(position))` instead of steps (a)/(b). One code path guarantees `msg.warnings` and `onWarning` stay in parity (TOL-04/TOL-05) and guarantees strict escalation coverage (TOL-01).

### Error Class Hierarchy

- **D-12: `Hl7ParseError` is a single Error subclass with a `code` discriminant** over a string-literal union of the 4 Tier-3 codes (`NO_MSH_SEGMENT | MSH_TOO_SHORT | INVALID_ENCODING_CHARACTERS | EMPTY_INPUT`). Mirrors the warning registry pattern. Consumers narrow via `switch (e.code)` / `if (e.code === "NO_MSH_SEGMENT")`. No per-code subclasses.
- **D-13: `Hl7ParseError` and `Hl7ParseWarning` are independent shapes.** Warning is a plain data object; Error is an Error subclass. No shared base class or interface. "Warnings are data, errors are thrown" stays crisp.
- **D-14: `Hl7ParseError` has four required fields:** `code`, `message`, `position`, `snippet`. Required at construction — forces every thrower to populate full context per TOL-02. (Optional `cause?: unknown` may be added in a later phase if PARSE-09 charset wrapping needs it; not required now.)
- **D-15: `ProfileDefinitionError` is declared in Phase 2's `src/parser/errors.ts`** and exported from `src/index.ts`. Used in Phase 6. Declaring it now locks the error taxonomy and avoids Phase 6 editing Phase 2 files.

### Claude's Discretion

- Exact module filename casing (snake-case vs kebab-case vs camelCase) — follow whatever ESLint config in Phase 1 enforces.
- Whether warning factories live in one `warnings.ts` file or a `warnings/` directory with one file per factory — Claude picks based on file size at the end of Phase 2.
- Internal shape of the raw positional tree (arrays vs typed nodes) as long as it can feed D-05's `Hl7Message` shell and be extended in Phase 3 without a rewrite.
- Whether to publish a `FATAL_CODES` registry mirroring `WARNING_CODES` (recommended by the pattern; not user-specified).
- Exactly how `dateFormats` is implemented (token strings, regex, named presets) — deferred to research/planning; constraint is zero runtime deps and no date library. TOL-09's built-in fallbacks must remain always-tried.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project vision & constraints
- `.planning/PROJECT.md` — vision, constraints (zero deps, strict TS), Key Decisions table (lenient default, stable warning codes, 4 Tier-3 fatal codes, Postel's Law)
- `CLAUDE.md` — Engineering Guardrails (no `any`, JSDoc `@example` on every public export, immutability, no `console.*`)

### Requirements (locked acceptance criteria)
- `.planning/REQUIREMENTS.md` §Core Parsing (PARSE-01 … PARSE-09)
- `.planning/REQUIREMENTS.md` §Real-World Tolerance (TOL-01 … TOL-10)

### Roadmap & success criteria
- `.planning/ROADMAP.md` — Phase 2 "Core Parser & Tolerance" goal, success criteria, parallelization notes
- `.planning/STATE.md` — carry-forward key decisions from Phase 1

### Prior phase artifacts (Phase 1 — toolchain established)
- `.planning/phases/01-project-foundation/01-01-SUMMARY.md` — package scaffold, tsconfig strictness flags (`exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noPropertyAccessFromIndexSignature`)
- `.planning/phases/01-project-foundation/01-02-SUMMARY.md` — tsup dual ESM+CJS build constraints (`.mjs`/`.cjs` outExtension, `skipNodeModulesBundle: true`)
- `.planning/phases/01-project-foundation/01-03-SUMMARY.md` — ESLint flat config (type-aware lint rules, JSDoc `require-example`, Prettier compat), Vitest coverage thresholds (per-directory `src/parser/**` ≥90%)
- `.planning/phases/01-project-foundation/01-04-SUMMARY.md` — pipeline smoke verification, Rule 1 bug patterns to watch for
- `.planning/phases/01-project-foundation/01-UAT.md` — Phase 1 UAT format (follow same structure for Phase 2 UAT)

### External specs (no external spec files in-repo)
- HL7 v2.x specifications — not vendored. Parser behavior is specified via REQUIREMENTS.md; the HL7 spec itself is reference material only (developer shouldn't need to read it per the north star).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/index.ts` — currently exports only `VERSION`. Phase 2 adds named exports (`parseHL7`, `Hl7Message`, `Hl7ParseError`, `Hl7ParseWarning`, `ProfileDefinitionError`, `WARNING_CODES`, `WarningCode`, `ParseOptions`, `Profile` type). File-level JSDoc must NOT start with `@{package-name}` — eslint-plugin-jsdoc parses that as a tag (Plan 01-04 Rule 1 fix).
- `test/sanity.test.ts` — only existing test file. Phase 2 adds parser-focused suites under `test/` (or `src/parser/__tests__/` — follow the convention Phase 1 lint config expects).
- `tsup.config.ts` + `tsconfig.build.json` — Phase 2 new files under `src/parser/` are picked up automatically as long as they're transitively reachable from `src/index.ts`.

### Established Patterns

- **Zero runtime deps:** enforced via empty `dependencies: {}` block in `package.json`. Phase 2 parser code must use only Node stdlib (`Buffer`, `TextDecoder`, etc.) — no regex-heavy external date libs.
- **Strict TS beyond `strict: true`:** `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` + `useUnknownInCatchVariables` are ON. Plan for this: every tokenizer array access must handle `undefined`; catch blocks get `unknown`; optional fields must be explicitly typed.
- **ESLint type-aware rules on:** `no-unsafe-*`, `no-floating-promises`. JSDoc `@example` required on every public export.
- **Dual ESM+CJS build:** tsup outputs `.mjs` + `.cjs` from `src/index.ts` as single entry. All Phase 2 code ships through this one entry — no separate subpath exports yet.
- **Vitest coverage config:** per-directory thresholds for `src/parser/**` (≥90% lines/functions/statements, ≥85% branches). Enforcement gate is Phase 7 — but tests written in Phase 2 should pass thresholds locally.
- **pnpm-lock.yaml committed.** Any dev-only dependency additions in Phase 2 need lockfile discipline.

### Integration Points

- `src/index.ts` is the sole public entry. Phase 2 adds named exports; all future phases extend this same file.
- CI matrix runs Node 18 / 20 / 22. Anything using stdlib APIs must be compatible with Node 18 (e.g. some `TextDecoder` flags aren't available).
- Vitest test file naming + colocation convention is set by Phase 1 — follow it (likely `*.test.ts` next to sources or under `test/`).

</code_context>

<specifics>
## Specific Ideas

- `WARNING_CODES` object must be re-exported from `src/index.ts` so consumers can write `w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED` without hardcoding strings.
- Tier 2 warning codes to wire in Phase 2 (from TOL-03 + concrete TOL-06/07/08/10 requirements): `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`, `UNKNOWN_ESCAPE_SEQUENCE`, `TIMESTAMP_FALLBACK_FORMAT`, plus registry slots for `SEGMENT_CASE`, `EXTRA_FIELDS`, `UNKNOWN_SEGMENT`, `DUPLICATE_REQUIRED_SEGMENT`, `ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT`, `VERSION_MISMATCH`, `UNKNOWN_CHARSET`. Factories + emission sites can be staged across plans; registry entries land all at once so no plan "adds a code" later.
- The `Hl7Message` shell's `profile?: { name; lineage[] }` field is a typed placeholder in Phase 2 — populated by Phase 6. Field exists so the shape is stable, but parse logic sets it to `undefined` unless a profile was passed.
- `parseHL7(raw, { profile: null })` must explicitly opt out of the process-scoped default profile (PROF-08 semantics) — even though the default-profile registry lives in Phase 6, Phase 2's signature must accept `profile: Profile | null | undefined` so Phase 6 drops in without a signature change.

</specifics>

<deferred>
## Deferred Ideas

- **`dateFormats` implementation choice (token strings vs regex vs named presets).** Deferred to research/planning within Phase 2 — constraint locked (zero deps, must honor TOL-08 order-sensitivity and TOL-09 fallbacks). Worth revisiting if the planner surfaces a clean approach.
- **PARSE-09 charset edge cases.** Deep handling of exotic MSH-18 charsets (`ISO IR 6`, `ISO IR 100`, etc.) may need a lookup table; scope depends on what `TextDecoder` supports on Node 18. Planner to investigate; fallback is always `UNKNOWN_CHARSET` warning + UTF-8.
- **Line/column position tracking in warnings.** Considered but deferred per D-04 — can be added later without API reshape.
- **Shared `Hl7Diagnostic` base interface** between warning and error — rejected per D-13; reconsider only if Phase 7's unified logging story demands it.
- **Per-fatal-code error subclasses.** Rejected per D-12; reconsider in v2 if richer error hierarchies become useful.
- **Real `toString()` / `toJSON()` emitters** — belong to Phase 5.
- **`msg.meta` named MSH helpers** — belong to Phase 4.

</deferred>

---

*Phase: 02-core-parser-and-tolerance*
*Context gathered: 2026-04-18*
