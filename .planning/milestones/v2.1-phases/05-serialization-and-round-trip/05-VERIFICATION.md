---
phase: 05-serialization-and-round-trip
verified: 2026-04-19T16:40:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
---

# Phase 5: Serialization & Round-Trip — Verification Report

**Phase Goal:** A developer can take a parsed, mutated, or constructed message and emit spec-clean HL7 — or a JSON/pretty-printed view — such that parse → modify → serialize → parse yields an equivalent message.

**Verified:** 2026-04-19T16:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP Success Criteria (4) + phase-level plan truths (7, deduplicated across the 5 plans). The 4 roadmap criteria are the contract; the 3 additional plan-level truths add implementation-grain guarantees (wiring, chaining, immutability).

| #   | Truth                                                                                                                                  | Status     | Evidence                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `msg.toString()` on any parsed message (incl. vendor-quirky input) produces spec-clean HL7 with correct delimiters, re-escaped sequences, no leaked MLLP/whitespace quirks (SER-01, SER-05)            | ✓ VERIFIED | `src/serialize/to-string.ts::emitMessage` implemented per D-01/D-05/D-06/D-08; composes via `emitField` (D-04 chokepoint calling `reescape`); `test/serialize-to-string.test.ts` 23+ cases green including MLLP-strip + CRLF→CR + 5-delimiter reescape |
| 2   | `parseHL7(msg.toString())` on any fixture yields a structurally equivalent message (SER-02)                                            | ✓ VERIFIED | `test/round-trip.test.ts` exercises 5 fixtures × 2 assertions (structural + idempotency) + 4 specific checks; runtime smoke-test confirmed `JSON.stringify(round.rawSegments) === JSON.stringify(msg.rawSegments)` |
| 3   | `msg.toJSON()` returns structured JSON; `msg.prettyPrint()` returns human-readable multi-line string (SER-03, SER-04)                  | ✓ VERIFIED | `src/serialize/to-json.ts::emitJson` returns raw-tree mirror with `Object.freeze` at boundary; `src/serialize/pretty-print.ts::emitPrettyPrint` emits D-25 header + D-23 segment lines; `test/serialize-to-json.test.ts` + `test/serialize-pretty-print.test.ts` pass |
| 4   | `buildMessage({...}).addSegment('PID', [...]).toString()` constructs a valid outbound HL7 message from scratch (SER-06)                | ✓ VERIFIED | `src/builder/build-message.ts::buildMessage` synthesizes MSH `RawSegment` → `new Hl7Message`; returns chainable instance (addSegment is Phase 3 method); runtime smoke confirmed `parseHL7(built.toString()).meta.type === 'ADT^A01'` + PID.3 roundtrip |
| 5   | `Hl7Message` instance methods `toString`/`toJSON`/`prettyPrint` are wired and delegate to module-level emitters                         | ✓ VERIFIED | `src/model/message.ts` lines 42-44 import all 3 emitters; lines 439-492 implement class methods as thin delegations                                                                                              |
| 6   | `buildMessage` + `SerializedMessage` + `BuildMessageInit` are top-level named exports from `src/index.ts`                              | ✓ VERIFIED | `src/index.ts` lines 130-132 export all three (value + 2 types)                                                                                                                                                  |
| 7   | Rule-3 deviation (Phase 2 tokenize unescape-on-parse) is coherent with emitter inverse and no prior-phase tests regressed              | ✓ VERIFIED | `src/parser/tokenize.ts::tokenizeComponent` routes each subcomponent through `unescape`; inverse symmetry verified by `embedded-delimiters.hl7` (5 escape forms) + `decoded-br.hl7`; full suite 618/618 tests green across 49 files (parser-tokenize 16 + parser-escapes 16 upstream tests still pass) |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact                                             | Expected                                                 | Status     | Details                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/serialize/emit-field.ts`                        | emitField + emitSegment D-04 chokepoint                  | ✓ VERIFIED | 117 lines; imports `reescape`; D-02 trailing-empty strip at component/subcomponent levels; MSH guard throw present        |
| `src/serialize/to-string.ts`                         | emitMessage with MSH special case + CR terminator        | ✓ VERIFIED | 88 lines; imports `emitField`/`emitSegment`; D-06 `"MSH" + enc.field + msh2 + enc.field + tail` trace verbatim            |
| `src/serialize/to-json.ts`                           | emitJson + SerializedMessage                             | ✓ VERIFIED | 140 lines; `SerializedMessage` interface exported; `Object.freeze(out)` boundary freeze; D-20 conditional profile         |
| `src/serialize/pretty-print.ts`                      | emitPrettyPrint with D-25 header + D-23 labeled fields   | ✓ VERIFIED | 113 lines; header line + segment lines via `emitField`; MSH starts at [3], non-MSH at [1]                                  |
| `src/builder/build-message.ts`                       | buildMessage factory + BuildMessageInit                  | ✓ VERIFIED | 275 lines; validates `type` via TypeError; synthesizes MSH RawSegment with 12 fields; default-encoding-chars locked       |
| `src/builder/format-timestamp.ts`                    | formatHl7Timestamp UTC second-precision                  | ✓ VERIFIED | 46 lines; uses `getUTC*` methods; `getUTCMonth() + 1` fix present                                                         |
| `src/builder/control-id.ts`                          | generateControlId 17-ts + 6 alnum                        | ✓ VERIFIED | 60 lines; alphabet `[A-Za-z0-9]`; `Date.now()` + `Math.random()`                                                          |
| `src/model/message.ts` (toString/toJSON/prettyPrint) | 3 instance methods delegating                            | ✓ VERIFIED | Methods at lines 439, 460, 491; each is a single-statement delegation                                                     |
| `src/index.ts` (exports)                             | buildMessage + BuildMessageInit + SerializedMessage      | ✓ VERIFIED | Lines 130-132                                                                                                             |
| `test/serialize-emit-field.test.ts`                  | D-02/D-04 primitive coverage                             | ✓ VERIFIED | Present and passing                                                                                                       |
| `test/serialize-to-string.test.ts`                   | MSH special case + trailing-field preservation           | ✓ VERIFIED | Present and passing                                                                                                       |
| `test/serialize-to-json.test.ts`                     | SER-03 shape + freeze + profile conditional              | ✓ VERIFIED | Present and passing                                                                                                       |
| `test/serialize-pretty-print.test.ts`                | SER-04 header + segment lines + depth stop               | ✓ VERIFIED | Present and passing                                                                                                       |
| `test/round-trip.test.ts`                            | SER-02 sweep over 5 fixtures + idempotency               | ✓ VERIFIED | Present; 14+ cases all green                                                                                              |
| `test/fixtures/round-trip/*.hl7`                     | 5 fixtures (canonical + repetitions + null + escapes + br) | ✓ VERIFIED | All 5 files present                                                                                                       |
| `test/builder.test.ts` + format-timestamp + control-id | Integration + unit coverage of builder triad            | ✓ VERIFIED | All 3 files present and passing                                                                                           |

### Key Link Verification

| From                                            | To                                          | Via                                    | Status  | Details                                                                 |
| ----------------------------------------------- | ------------------------------------------- | -------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `src/model/message.ts::toString`                | `src/serialize/to-string.ts::emitMessage`   | named import + delegation              | ✓ WIRED | Import L44; method body L439-441                                        |
| `src/model/message.ts::toJSON`                  | `src/serialize/to-json.ts::emitJson`        | named import + delegation              | ✓ WIRED | Import L43; method body L460-462                                        |
| `src/model/message.ts::prettyPrint`             | `src/serialize/pretty-print.ts::emitPrettyPrint` | named import + delegation         | ✓ WIRED | Import L42; method body L491-493                                        |
| `src/serialize/to-string.ts::emitMessage`       | `src/serialize/emit-field.ts::emitField+emitSegment` | named import                  | ✓ WIRED | Import L23; loop L45-51                                                 |
| `src/serialize/to-string.ts::emitMshSegment`    | `msg.encodingCharacters` (MSH-1/MSH-2 source) | direct field access (D-06)          | ✓ WIRED | Line 43 `msg.encodingCharacters`; line 74 `enc.component + enc.repetition + enc.escape + enc.subcomponent` exact D-06 trace |
| `src/serialize/emit-field.ts`                   | `src/parser/escapes.ts::reescape`           | D-04 chokepoint                        | ✓ WIRED | Import L27; call L67 `reescape(sub ?? "", enc)`                         |
| `src/serialize/pretty-print.ts`                 | `src/serialize/emit-field.ts::emitField`    | D-24 field-level rendering             | ✓ WIRED | Import L22; usage L105                                                  |
| `src/builder/build-message.ts`                  | `new Hl7Message({...})`                     | D-11 internal synthesis                | ✓ WIRED | Line 216 `new Hl7Message(...)`                                          |
| `src/builder/build-message.ts`                  | `src/builder/format-timestamp.ts + control-id.ts` | named imports                     | ✓ WIRED | Imports L38-39; calls at resolveTimestamp L230, L232 + controlId L168   |
| `src/builder/build-message.ts`                  | `DEFAULT_ENCODING_CHARACTERS`               | D-14 locked defaults                   | ✓ WIRED | Import L35; usage L162                                                  |
| `buildMessage(...).addSegment(...)`             | `Hl7Message.addSegment` (Phase 3)           | D-11/D-15 fluent chain                 | ✓ WIRED | Runtime-confirmed via smoke test                                        |
| `src/index.ts` barrel                           | `buildMessage` value + 2 types              | named + type barrel exports            | ✓ WIRED | Lines 130-132                                                           |
| `test/round-trip.test.ts`                       | `parseHL7 → toString → parseHL7`            | SER-02 structural equivalence loop     | ✓ WIRED | Helper `assertStructuralRoundTrip` + 5-fixture sweep                    |

### Data-Flow Trace (Level 4)

| Artifact                            | Data Variable                         | Source                                         | Produces Real Data                                                                      | Status     |
| ----------------------------------- | ------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| `emitMessage`                       | `segmentStrings`                      | Walk of `msg.rawSegments` via emitField/emitMshSegment | Yes — populated from real parse tree                                             | ✓ FLOWING  |
| `emitJson`                          | `segments`, `encodingCharacters`, `profile` | `msg.rawSegments.map(...)`, `msg.encodingCharacters`, `msg.profile` | Yes — raw-tree mirror; runtime smoke returned `segments.length > 0` | ✓ FLOWING  |
| `emitPrettyPrint`                   | `lines`                               | `buildHeaderLine(msg)` + `buildSegmentLine(seg, msg)` for each `msg.rawSegments` | Yes — pretty output verified to include "HL7" header + per-segment lines | ✓ FLOWING  |
| `buildMessage`                      | `mshSegment`                          | Synthesized from `init.type`, `init.sendingApp`, etc. | Yes — real MSH with 12 fields; smoke test confirms parseHL7 re-reads correctly | ✓ FLOWING  |

### Behavioral Spot-Checks

| Behavior                                                           | Command                                                | Result                                              | Status  |
| ------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- | ------- |
| Full test suite (no regressions; Rule-3 deviation intact)          | `pnpm test`                                            | 618 passed across 49 files, 0 failures              | ✓ PASS  |
| Build produces dual ESM+CJS                                        | `pnpm build`                                           | tsup success; dist/index.mjs 93KB + dist/index.cjs 94KB + d.ts 114KB | ✓ PASS  |
| SC1 — toString is string + no MLLP leak                            | Runtime: `parseHL7(raw).toString()` on clean fixture   | `typeof === 'string'`; no `\x0B`/`\x1C`/`\x1D` bytes | ✓ PASS  |
| SC2 — Round-trip structural equivalence                            | Runtime: `JSON.stringify(round.rawSegments) === JSON.stringify(msg.rawSegments)` | `true`                             | ✓ PASS  |
| SC3 — toJSON returns structured JSON + prettyPrint multi-line      | Runtime: inspect shape                                 | `toJSON().segments` is array; `prettyPrint()` starts with "HL7 " and includes `\n` | ✓ PASS  |
| SC4 — buildMessage chain round-trips through parseHL7              | Runtime: `buildMessage({type:'ADT^A01',...}).addSegment('PID',[...]).toString()` then `parseHL7(...)` | `meta.type==='ADT^A01'` + `get('PID.3')==='MRN123'` | ✓ PASS  |

### Requirements Coverage

All 6 SER REQ-IDs declared in plan frontmatter; REQUIREMENTS.md §SER rows 72-77 mark all 6 as complete. Cross-check passed — every requirement maps to verified implementation evidence.

| Requirement | Source Plan(s)   | Description                                                          | Status       | Evidence                                                                 |
| ----------- | ---------------- | -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| SER-01      | 05-01, 05-02     | `msg.toString()` produces spec-clean HL7                             | ✓ SATISFIED  | `emitMessage` body; MLLP-strip test; CRLF→CR normalization test          |
| SER-02      | 05-02            | Round-trip `parse → toString → parse` equivalence                    | ✓ SATISFIED  | `assertStructuralRoundTrip` helper × 5 fixtures + idempotency tests       |
| SER-03      | 05-01, 05-03     | `msg.toJSON()` returns structured JSON                               | ✓ SATISFIED  | `emitJson` body + `SerializedMessage` interface + boundary freeze + tests |
| SER-04      | 05-01, 05-04     | `msg.prettyPrint()` returns human-readable multi-line string         | ✓ SATISFIED  | `emitPrettyPrint` body + header + per-segment lines + tests               |
| SER-05      | 05-01, 05-02     | Escape sequences re-encoded on serialize                             | ✓ SATISFIED  | `reescape` chokepoint in `emitField`; 5-delimiter test + fixture          |
| SER-06      | 05-01, 05-05     | `buildMessage({...}).addSegment(...).toString()` constructs outbound | ✓ SATISFIED  | `buildMessage` body + round-trip test + smoke test                        |

No orphaned requirements: ROADMAP.md Phase 5 declares exactly SER-01..06; all 6 appear in at least one plan's `requirements` frontmatter field. No additional phase-5-mapped REQ-IDs in REQUIREMENTS.md that are unclaimed.

### Architectural Deviation Verification (Rule-3: tokenize unescape-on-parse)

**Deviation:** Phase 2 `src/parser/tokenize.ts::tokenizeComponent` was expanded in Plan 02 to run each subcomponent through `unescape(sub, enc, emit, position)` on the parse boundary. The raw tree now stores DECODED strings rather than raw escape-sequence-bearing text.

**Coherence check:**

1. **Emitter inverse symmetry** — `src/serialize/emit-field.ts::emitField` runs every subcomponent back through `reescape(sub ?? "", enc)` on emit. The parse↔emit inverse is the load-bearing invariant for SER-02 structural equivalence: decoded subcomponent in → decoded subcomponent out after round-trip.
2. **Fixture coverage of inverse** — `test/fixtures/round-trip/embedded-delimiters.hl7` exercises all 5 active delimiters (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`); `test/fixtures/round-trip/decoded-br.hl7` exercises `\.br\` newline round-trip. Both round-trip structurally AND idempotently from 2nd pass.
3. **No prior-phase regressions** — `parser-tokenize.test.ts` (16 cases), `parser-escapes.test.ts` (16 cases), full model + helpers + types suites all green. 618/618 tests pass across 49 files.
4. **Documentation alignment** — `src/parser/tokenize.ts` lines 17-24 explicitly document the deviation and cite the `reescape` inverse path; the REVIEW.md notes this as "tightly scoped" and "consistent across the codebase."
5. **Downstream expectations** — Phase 3 composite parsers (`src/model/field.ts::asXxx`), Phase 4 helpers (`msg.patient`, `msg.meta`, etc.), and Phase 5 `emitJson` (which JSDoc notes "stores decoded subcomponent strings... no re-escape transformation applied") all operate on decoded strings consistently. No call sites assume raw-with-escapes semantics.

**Coherence verdict:** ✓ COHERENT — inverse symmetry is live, tests cover all 5 escapes + `.br`, no regressions, documentation aligned across parser + model + helpers + serializer.

### Anti-Patterns Found

Grep swept across the 10 modified source files (`src/serialize/*.ts` (4), `src/builder/*.ts` (3), `src/model/message.ts`, `src/index.ts`, `src/parser/tokenize.ts`) for TODO/FIXME/stub markers, empty returns, and hardcoded empty state flows.

| File                                    | Line        | Pattern                                                  | Severity  | Impact                                                                                              |
| --------------------------------------- | ----------- | -------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| None                                    | —           | —                                                        | —         | No TODO/FIXME/PLACEHOLDER/`return null`/stub throws found in Phase 5 modified files.                |
| `src/serialize/to-string.ts`            | 42-53       | `emitMessage` emits bare `"\r"` for empty rawSegments    | ℹ️ Info   | WR-01 in REVIEW.md — unreachable via `parseHL7`; theoretically reachable via direct `new Hl7Message({segments:[]})`. Not a Phase 5 goal regression. |
| `src/builder/control-id.ts`             | 55          | `Math.random()` not cryptographically strong             | ℹ️ Info   | WR-03 in REVIEW.md — collision probability negligible for outbound test/tool use; JSDoc documents the tradeoff and recommends caller-supplied IDs for high-uniqueness needs. Accepted. |
| `src/builder/build-message.ts`          | 268-275     | `compositeField` splits `type` on `^` unconditionally    | ℹ️ Info   | WR-04 in REVIEW.md — acceptable for spec-conformant HL7 message codes; edge case ("   ^   ") passes D-16 validation but is arguably garbage. Not a Phase 5 goal blocker. |
| `src/serialize/to-json.ts`              | 107-139     | `Mutable<T>` + `as SerializedMessage` cast               | ℹ️ Info   | IN-03 in REVIEW.md — justified `as` with full comment explaining `exactOptionalPropertyTypes` workaround; same pattern as `src/helpers/meta.ts`. CLAUDE.md-compliant. |

All 4 REVIEW.md warnings are non-blocking code-quality observations — none block the phase goal. Zero critical findings. Zero CLAUDE.md guardrail violations (no `any`, no `console.*`, no unjustified `as`, JSDoc `@example` on public exports, zero runtime deps, strict TS + `noUncheckedIndexedAccess`, immutable defaults, no fatal errors introduced).

### Human Verification Required

None. All four roadmap success criteria were verified programmatically via:
- Unit tests (emit-field, to-string, to-json, pretty-print, builder-control-id, builder-format-timestamp)
- Integration tests (builder, round-trip 5-fixture sweep)
- Full-suite regression (618/618 tests across 49 files)
- Runtime smoke-test against the built `dist/index.mjs` ESM bundle confirming SC1–SC4

No UI, no real-time behavior, no external service. The "developer experience" criteria are expressible as JS assertions (return shapes, structural equality, output substring checks) and are covered by the automated suite.

### Gaps Summary

No gaps. Phase 5 ships a complete, tested, documented emit + outbound-build surface:

- **toString:** spec-clean emission with MSH D-06 special case, CR terminator, reescape chokepoint, no MLLP, trailing-field preservation at segment level.
- **toJSON:** raw-tree mirror with stable `warnings: []`, conditional `profile`, boundary freeze.
- **prettyPrint:** D-25 header + D-23 labeled segment lines with D-24 field-level depth stop.
- **buildMessage:** synthesizes real `Hl7Message` instances symmetric with `parseHL7`; `addSegment` chaining via unchanged Phase 3 mutation method; 23-char controlId + UTC timestamp defaults.
- **Round-trip:** SER-02 verified across 5 canonical fixtures + idempotency from 2nd pass; Rule-3 parse-time unescape deviation has symmetric emit-time reescape inverse with no prior-phase regressions.

All 6 SER REQ-IDs (SER-01..06) closed. 7/7 must-haves verified. Full suite 618/618 green. Build succeeds. Smoke-test confirms all 4 roadmap success criteria at runtime via the built ESM bundle.

---

_Verified: 2026-04-19T16:40:00Z_
_Verifier: Claude (gsd-verifier)_
