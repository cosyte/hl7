# Phase 3: Structural Model & Types — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 03-structural-model-and-types
**Areas discussed:** Dot-path semantics, Typed composite access, Mutation & immutability, Timestamp TS/DTM policy

---

## Gray-Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Dot-path semantics | How `PID.5.1` / `OBX[2].5` / `PID.3[2].1` resolve — indexing, repetition syntax, subcomponent depth collapsing, MSH edge cases, return type | ✓ |
| Typed composite access | How consumers reach typed XPN/XAD/CX — explicit coercion vs auto-typed vs standalone fns; eager vs lazy; wrapper identity | ✓ |
| Mutation & immutability | setField/addSegment/removeSegment — in-place vs new-instance; freeze interaction; validation; dirty tracking | ✓ |
| Timestamp TS/DTM policy | Timezone default (no offset), truncation policy, fractional-seconds handling, unparseable cutoff | ✓ |

---

## Dot-Path Semantics

### Q1: Field-repetition indexing

| Option | Description | Selected |
|--------|-------------|----------|
| `PID.3[0]` (0-indexed, matches segments) | Consistent bracket convention throughout; segment reps are 0-indexed with `[N]`, field reps are 0-indexed with `[N]` | ✓ |
| `PID.3[1]` (1-indexed) | Bracketed field reps 1-indexed per HL7 spec tradition — inconsistent with OBX[2] | |
| No rep index in path | `PID.3` returns first rep only; use `field.repetitions[N]` for others | |

**User's choice:** 0-indexed `[N]` for both segment and field repetitions (single rule).

### Q2: Return type of `msg.get()`

| Option | Description | Selected |
|--------|-------------|----------|
| Raw string, auto-unescaped | Returns decoded string; `\F\`/`\S\`/etc. already unescaped; subcomponents joined by `&` when asked at component depth | ✓ |
| Raw string, NOT unescaped | Literal bytes between delimiters; caller unescapes | |
| Structured object field-level, string at leaf | Discriminated-union return by path depth | |

**User's choice:** Auto-unescaped string. (D-03)

### Q3: Subcomponent depth collapse

| Option | Description | Selected |
|--------|-------------|----------|
| Collapse when subcomponent absent | `PID.5.1.1` on no-`&` field returns the component string | ✓ |
| `undefined` (strict depth match) | No `&` separator ⇒ subcomponent position is absent ⇒ undefined | |
| Configurable via `{ strictDepth }` option | Add an opt; overkill for v1 | |

**User's choice:** Depth collapse. (D-04)

### Q4: MSH-1 / MSH-2 handling

| Option | Description | Selected |
|--------|-------------|----------|
| Return delimiter chars as strings | `msg.get('MSH.1')` → `'|'`, `msg.get('MSH.2')` → `'^~\\&'` | ✓ |
| Return `undefined` for MSH.1/2 | User must go through `msg.encodingCharacters` | |
| MSH is 0-shifted | First addressable field = MSH-2 | |

**User's choice:** Return delimiter chars. (D-05)

---

## Typed Composite Access

### Q1: Composite API surface

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit coercion on Field wrapper | `.asXpn()`, `.asXad()`, ... 10 coercions | ✓ |
| Auto-typed via segment+field dictionary | Lookup table maps PID.5 → XPN | |
| Standalone parser functions | Top-level `parseXpn(str, enc)` | |
| `.components[]` as typed union | No typed composites; raw index access | |

**User's choice:** Explicit `.asXxx()` coercions on Field. (D-08)

### Q2: Parse timing

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy on-demand | Parse on each `.asXxx()` call, no memoization | ✓ |
| Lazy + memoized per Field | Parse on first call, cache on wrapper | |
| Eager at parse time | Parse everything upfront | |

**User's choice:** Lazy on-demand. (D-09)

### Q3: Segment-wrapper identity

| Option | Description | Selected |
|--------|-------------|----------|
| Cached — same wrapper each call | `msg.segments('OBX')[0] === msg.segments('OBX')[0]` | ✓ |
| Fresh each call | Build new wrapper array each time | |
| You decide | Claude picks | |

**User's choice:** Cached. (D-11)

### Q4: Type exports

| Option | Description | Selected |
|--------|-------------|----------|
| Named exports + `HL7` namespace | `import type { XPN }` AND `import { HL7 }; HL7.XPN` | ✓ |
| Named exports only | Just `import type { XPN }` | |
| Under a `/types` submodule | `import type { XPN } from '@cosyte/hl7-parser/types'` | |

**User's choice:** Named exports + `HL7` namespace. (D-13)

---

## Mutation & Immutability

### Q1: In-place vs new-instance

| Option | Description | Selected |
|--------|-------------|----------|
| Mutate in place, return `this` | Chainable: `msg.setField(...).addSegment(...)` | ✓ |
| Return new Hl7Message (functional) | `const msg2 = msg.setField(...)` | |
| Mutable `MessageBuilder` separate | `msg.toBuilder().setField(...).build()` | |

**User's choice:** In-place, chainable. (D-15)

### Q2: Freeze interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Unfreeze tree; keep warnings frozen | Segments tree mutable via mutation API; `msg.warnings` still frozen | ✓ |
| Drop freeze entirely | Phase 3 rewrites shell — breaks Phase 2 D-07 | |
| Clone-on-write internally | Copy subtree before writing | |

**User's choice:** Unfreeze tree, keep warnings frozen. (D-16)

### Q3: Validation on mutation

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — accept any string; validate segment-name shape | Serializer re-escapes on `toString()` | ✓ |
| Validate escape safety on mutation | Reject unescaped delimiter chars unless opted in | |
| No validation at all | Anything goes | |

**User's choice:** Minimal. (D-18, D-19)

### Q4: Dirty tracking

| Option | Description | Selected |
|--------|-------------|----------|
| No dirty flag; serializer walks tree fresh | Simplest | ✓ |
| Track mutation counter / dirty flag | Useful for Phase 5 caching | |
| You decide (defer to Phase 5) | Add later if needed | |

**User's choice:** No dirty flag. (D-20)

---

## Timestamp TS/DTM Policy

### Q1: No-offset timezone default

| Option | Description | Selected |
|--------|-------------|----------|
| Local time (host's TZ) | HL7 tradition; nondeterministic across hosts | |
| UTC | Deterministic; matches existing `parseHl7Timestamp` already | ✓ |
| `undefined` Date if no offset | Refuse to guess | |
| Configurable via `{ timezone }` option | Extra surface | |

**User's choice:** UTC. (D-21) — aligns with `src/parser/dates.ts` line 72–73 (already shipped).

### Q2: Truncation time-of-day

| Option | Description | Selected |
|--------|-------------|----------|
| Midnight (`00:00:00.000`) at resolved TZ | Predictable, ISO-8601-like | ✓ |
| Midnight UTC regardless of TZ policy | Inconsistent but simple | |
| Reject truncations < YYYYMMDD | Spec-strict; breaks real-world | |

**User's choice:** Midnight at resolved TZ. (D-22)

### Q3: Fractional-seconds precision

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate to 3 digits | Matches JS Date ms precision; raw preserved | ✓ |
| Round to 3 digits | `.12345` → 123 via rounding | |
| Emit warning on >3 digit precision | Adds `TIMESTAMP_PRECISION_LOST` code | |

**User's choice:** Truncate. (D-23)

### Q4: Unparseable cutoff

| Option | Description | Selected |
|--------|-------------|----------|
| Shape + all formats fail | Reuses existing cascade exactly | ✓ |
| Calendar-invalid (Feb 30, month 13) | Stricter | |
| Both | Most conservative | |

**User's choice:** Existing cascade (shape + `dateFormats` + built-in fallbacks all fail). (D-24) — with NaN normalization to `undefined` (implementation detail noted in D-24).

---

## Claude's Discretion

- Internal shape of `Segment` / `Field` wrapper classes (public surface locked; private fields free)
- Dot-path parser implementation: regex vs hand-rolled tokenizer (constraint: zero deps)
- File layout under `src/model/`
- Whether composite parsers are free functions or class statics
- Whether to expose standalone `parseXpn(raw, enc)` helpers (defer unless Phase 4 needs)
- `removeSegment` matcher shape (by index / by reference / by predicate) — planner decides
- Whether `setField('ZPI.5', 'X')` on missing segment throws or auto-creates (recommendation: throw)
- Composite memoization — off for v1 per D-09; revisit if profiling warrants

## Deferred Ideas

- Phase-6 profile-driven custom Z-segment named-field lookups
- Composite result memoization (`WeakMap<Field, XpnCache>`)
- Standalone `parseXpn(raw, enc)` public exports
- `setField` auto-creating missing intermediate structure
- Discriminated-union return on `get()` by depth
- Composite round-trip fidelity (Phase 5)
- Line/column position tracking in wrapper errors
- `TIMESTAMP_PRECISION_LOST` warning code
- Dirty flag / serialization cache
- v2 typed message overlays (`msg.is('ADT^A01')`)
