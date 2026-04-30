# Phase 2: Core Parser & Tolerance — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 02-core-parser-and-tolerance
**Areas discussed:** Parser pipeline shape, Phase 2/3 output boundary, Warning-code registry, Error class hierarchy

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Parser pipeline shape | Layered vs monolithic vs hybrid — shapes plan breakdown and parallelization | ✓ |
| Phase 2/3 output boundary | What does `parseHL7()` return? Raw tree vs `Hl7Message` shell vs full access API | ✓ |
| Warning-code registry | Centralized registry module vs inline emission | ✓ |
| Error class hierarchy | Single class with `code` discriminant vs subclasses per fatal code | ✓ |

---

## Parser Pipeline Shape

### Q1: Overall pipeline structure for parseHL7()?

| Option | Description | Selected |
|--------|-------------|----------|
| Layered pipeline (Recommended) | Discrete stages: normalize → strip MLLP → split segments → read MSH delimiters → tokenize → unescape on access. Modular, testable, parallelizable. | ✓ |
| Single-pass state machine | One scanner char-by-char tracking all state. Fewer allocations, harder to test/parallelize. | |
| Hybrid | Layered preprocessing + single-pass tokenizer per segment. | |

**User's choice:** Layered pipeline

### Q2: Module/file layout under src/parser/?

| Option | Description | Selected |
|--------|-------------|----------|
| One file per stage (Recommended) | `normalize.ts`, `mllp.ts`, `segments.ts`, `delimiters.ts`, `tokenize.ts`, `escapes.ts`, `warnings.ts`, `errors.ts`, `index.ts` | ✓ |
| Feature-grouped | Subdirectories: `preprocessing/`, `tokenizer/`, `escapes/`, `diagnostics/` | |
| Flat single module | `src/parser/index.ts` + a handful of helpers | |

**User's choice:** One file per stage

### Q3: Order of preprocessing steps (before tokenization)?

| Option | Description | Selected |
|--------|-------------|----------|
| Empty→BOM→MLLP→line-endings (Recommended) | EMPTY_INPUT fatal check → strip BOM silent → strip MLLP bytes with warning → normalize line endings to `\r` | ✓ |
| MLLP→BOM→empty→line-endings | Handle network framing first (BOM may live inside MLLP-framed payload) | |
| You decide | Claude picks order, documents rationale | |

**User's choice:** Empty→BOM→MLLP→line-endings

### Q4: How should the tokenizer surface positional context for warnings?

| Option | Description | Selected |
|--------|-------------|----------|
| Spec-minimum indices only (Recommended) | `{segmentIndex, fieldIndex, componentIndex, repetitionIndex, subcomponentIndex}` per TOL-03; fatal errors add byte offset + snippet per TOL-02 | ✓ |
| Spec indices + line/column | Also track original line/column for nicer DX | |
| Spec indices + byte offsets everywhere | Every warning carries byte offset; enables richer snippet extraction | |

**User's choice:** Spec-minimum indices only

---

## Phase 2/3 Output Boundary

### Q1: What does parseHL7() return at the end of Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal Hl7Message shell (Recommended) | Real `Hl7Message` class with raw tree, `warnings[]`, delimiters, version, `toString` stub. `get()/segments()` deferred to Phase 3. | ✓ |
| Raw positional tree only | Plain `{segments, warnings}` object; Phase 3 wraps into `Hl7Message` | |
| Full Hl7Message with minimal access | Phase 2 ships `Hl7Message` + working `.get(path)` + `.segments(type)`; Phase 3 focuses on typed composites | |

**User's choice:** Minimal Hl7Message shell

### Q2: parseHL7 public signature — how to resolve options vs profile?

| Option | Description | Selected |
|--------|-------------|----------|
| parseHL7(raw, optionsOrProfile?) with runtime check (Recommended) | Runtime discriminant (Profile has `name`, options have `strict/onWarning/...`); TypeScript overloads for DX | ✓ |
| parseHL7(raw, options?) — profile lives inside options only | Cleaner typing but breaks `parseHL7(raw, epicProfile)` form | |
| Two overloads: (raw), (raw, profile), (raw, options) | Explicit overloads; still needs runtime discriminant | |

**User's choice:** parseHL7(raw, optionsOrProfile?) with runtime check

### Q3: Where do warnings live on the returned object?

| Option | Description | Selected |
|--------|-------------|----------|
| msg.warnings readonly array (Recommended) | Frozen array, always present. `onWarning` callback fires inline during parse. | ✓ |
| msg.warnings + msg.hasWarnings helper | Same plus boolean convenience | |
| msg.diagnostics object | Group under `msg.diagnostics.warnings` for future extensibility | |

**User's choice:** msg.warnings readonly array

### Q4: How does Phase 2 expose MSH metadata (needed for later phases)?

| Option | Description | Selected |
|--------|-------------|----------|
| msg.encodingCharacters + msg.version only (Recommended) | Only what the parser itself produces. `msg.meta` lands in Phase 4. | ✓ |
| Full msg.meta in Phase 2 | Pull HELPERS-01 forward; faster to round-trip but blurs phase boundary | |
| Internal-only on raw tree | No public MSH fields in Phase 2; tests walk `segments[0]` | |

**User's choice:** msg.encodingCharacters + msg.version only

---

## Warning-Code Registry

### Q1: How should the warning-code registry be shaped?

| Option | Description | Selected |
|--------|-------------|----------|
| Const record + string-literal union (Recommended) | `as const` record + `typeof[keyof]` union. Zero runtime cost, autocomplete, exhaustive switches. | ✓ |
| TypeScript enum | `enum WarningCode { ... }`; verbose, runtime object | |
| Inline string literals + documented list | No registry module; emit strings at call sites | |

**User's choice:** Const record + string-literal union

### Q2: How is a warning object constructed?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated factory per code (Recommended) | `mllpFramingStripped(position) → Hl7ParseWarning`; each factory owns its message template | ✓ |
| Single generic factory | `createWarning(code, message, position)`; flexible but drift-prone | |
| Plain object literals at call sites | Tokenizer writes `{code, message, position}` inline | |

**User's choice:** Dedicated factory per code

### Q3: How does onWarning relate to msg.warnings?

| Option | Description | Selected |
|--------|-------------|----------|
| Emit once, push-and-call together (Recommended) | Internal `emitWarning(w)` pushes AND invokes callback. Single code path, parity guaranteed. | ✓ |
| onWarning fires during parse; warnings collected separately | Two parallel code paths; drift risk | |
| onWarning receives a stream snapshot at end | Called with full batch post-parse; violates TOL-05 intent | |

**User's choice:** Emit once, push-and-call together

### Q4: How should strict-mode escalation use the registry?

| Option | Description | Selected |
|--------|-------------|----------|
| Single chokepoint in emitWarning (Recommended) | `if (strict) throw new Hl7ParseError(w.code, w.message, w.position)`. One line, guaranteed escalation. | ✓ |
| Per-site branching | Every call site `if (strict) throw else emit` | |
| Post-parse escalation pass | Parser collects all warnings then rethrows first; wasteful | |

**User's choice:** Single chokepoint in emitWarning

---

## Error Class Hierarchy

### Q1: Shape of Hl7ParseError?

| Option | Description | Selected |
|--------|-------------|----------|
| Single class with `code` discriminant (Recommended) | Union over 4 Tier-3 codes; narrow with `switch(e.code)` | ✓ |
| Base + subclass per fatal code | `NoMshError`, `MshTooShortError`, etc.; `instanceof` narrowing | |
| Single class with enum-like `name` | `Error.name = "Hl7ParseError.NO_MSH_SEGMENT"`; awkward narrowing | |

**User's choice:** Single class with `code` discriminant

### Q2: Does Hl7ParseError inherit from Hl7ParseWarning or are they independent?

| Option | Description | Selected |
|--------|-------------|----------|
| Independent shapes (Recommended) | Warning = data object; Error = Error subclass. "Warnings are data, errors are thrown." | ✓ |
| Warning is data shape; Error carries same fields | No shared base, but structurally similar; mild logging convenience | |
| Shared base interface (Hl7Diagnostic) | Unified logging/serialization; extra type surface | |

**User's choice:** Independent shapes

### Q3: ProfileDefinitionError — where does it live?

| Option | Description | Selected |
|--------|-------------|----------|
| Declared in Phase 2, used in Phase 6 (Recommended) | Lock error taxonomy now; Phase 6 doesn't touch Phase 2 files | ✓ |
| Declared in Phase 6 only | Strict phase scope; slight sprawl | |
| Define Hl7Error base in Phase 2; subclasses later | Speculative inheritance | |

**User's choice:** Declared in Phase 2, exported from errors module; used in Phase 6

### Q4: What fields does every Hl7ParseError carry (required vs optional)?

| Option | Description | Selected |
|--------|-------------|----------|
| All four required: code, message, position, snippet (Recommended) | Per TOL-02 contract; catches missing-context bugs at construction | ✓ |
| code + message required; position + snippet optional | More forgiving; weakens TOL-02 | |
| Required + optional `cause` | Add `Error.cause` for wrapping TextDecoder/Buffer errors | |

**User's choice:** All four required: code, message, position, snippet

---

## Claude's Discretion

From CONTEXT.md — areas where the user deferred to Claude:

- Exact module filename casing (snake/kebab/camel) — follow Phase 1 ESLint convention
- Whether warning factories live in one `warnings.ts` or a `warnings/` directory — picked based on file size
- Internal shape of the raw positional tree (arrays vs typed nodes)
- Whether to publish a `FATAL_CODES` registry (recommended by the pattern)
- Exact `dateFormats` mini-parser implementation (token strings vs regex vs named presets)

## Deferred Ideas

- `dateFormats` implementation choice — planner to decide within zero-deps constraint
- PARSE-09 charset edge cases — depends on Node 18 `TextDecoder` surface
- Line/column position tracking — can be added post-facto without API reshape
- Shared `Hl7Diagnostic` base — reconsider only if Phase 7 logging story demands
- Per-fatal-code error subclasses — v2 consideration
- `toString()` / `toJSON()` real emitters — Phase 5
- `msg.meta` named MSH helpers — Phase 4
