# Phase 4: Named Helpers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 04-named-helpers
**Areas discussed:** Return shape, caching & missing segments; MRN & identifier resolution; Observations & order linkage; Name composition & date shape

---

## Return shape, caching & missing segments

### Q1: Shape of object helpers (msg.meta, msg.patient, msg.visit)?

| Option | Description | Selected |
|--------|-------------|----------|
| Plain frozen object | `Object.freeze({...})` typed plain fields. Best DX (console.log, structured clone). No method shadowing. How most HL7 libraries do it. | ✓ |
| Class instance with methods | `Patient` class with `.hasAddress()`, `.isAdult()`. More OO; more surface; worse `JSON.stringify()`. | |
| Lazy getter object | Frozen object whose fields are getters that lazily parse. Marginal benefit vs Phase 3 lazy composites. | |

**User's choice:** Plain frozen object
**Notes:** Preview reinforced that `msg.meta` shape reads like normal data, not an object tree with methods.

### Q2: Caching strategy for object helpers?

| Option | Description | Selected |
|--------|-------------|----------|
| Memoize on first access | Private `_meta` / `_patient` / `_visit` cache; invalidated on mutation (matches Phase 3 D-17). | ✓ |
| Rebuild each call | No cache; O(segments) per access; `msg.meta !== msg.meta`. | |
| Memoize with WeakMap on helper class | External `WeakMap<Hl7Message, Meta>`. Cleaner boundary; awkward mutation invalidation. | |

**User's choice:** Memoize on first access
**Notes:** Invalidation is cheap because Phase 3 already drops caches in `setField` / `addSegment` / `removeSegment`. Phase 4 extends the existing drop.

### Q3: msg.patient when the message has no PID segment?

| Option | Description | Selected |
|--------|-------------|----------|
| Return undefined | Symmetric with `msg.visit` on missing PV1 (HELPERS-03). Callers use `?.` pattern uniformly. | ✓ |
| All-undefined object | `msg.patient` always exists; fields are undefined. Easier destructure; asymmetric with visit. | |
| Depends on message type | Dispatch by `msg.meta.type`. Fragile; rejected. | |

**User's choice:** Return undefined
**Notes:** Preview showed uniform `?.` usage alongside `msg.visit?.patientClass`.

---

## MRN & identifier resolution

### Q4: How should msg.patient.mrn pick from PID-3 repetitions?

| Option | Description | Selected |
|--------|-------------|----------|
| First CX with CX-5='MR' | HL7 v2.5+ canonical marker for MRN. Scan left-to-right. | ✓ |
| First PID-3 repetition always | PID-3[0].1 regardless of type code. Fails on SSN-first messages. | |
| First CX with CX-5 in ['MR','MRN','PI'] | Broader match for vendor variants. | |
| Configurable via ParseOptions / defaultProfile | Caller-supplied codes. More surface; profile-owned in Phase 6. | |

**User's choice:** First CX with CX-5='MR'
**Notes:** Phase 6 profile hook will handle vendor overrides; Phase 4 stays spec-aligned.

### Q5: Fallback when no PID-3 repetition has CX-5='MR'?

| Option | Description | Selected |
|--------|-------------|----------|
| Return first PID-3 repetition's CX-1 | Lenient; matches "pull useful fields in one line" north star. | ✓ |
| Return undefined | Strict; punishes vendor messages that omit the type code. | |
| Return first CX-1 and emit a warning | Needs new warning code; rejected (TOL-03 locked, helpers silent). | |

**User's choice:** Return first PID-3 repetition's CX-1
**Notes:** Helpers remain silent reads. Caller can walk `patient.identifiers` for strict MR resolution.

### Q6: Shape of patient.identifiers[]?

| Option | Description | Selected |
|--------|-------------|----------|
| Parsed CX[] (typed composite) | Full `Field.asCx()` composite per PID-3 repetition. | ✓ |
| Friendlier shape `{ id, type, assigningAuthority }` | Flattened 3-4 fields. Two shapes to maintain. | |
| Raw strings array | Just PID-3[i].1 values. Loses all metadata. | |

**User's choice:** Parsed CX[] (typed composite)
**Notes:** Reuses Phase 3's composite contract without duplication.

---

## Observations & order linkage

### Q7: Scope of msg.observations()?

| Option | Description | Selected |
|--------|-------------|----------|
| ALL OBX in document order | Flat array; OBX appears here AND inside `msg.orders()[i].observations`. | ✓ |
| Only OBX NOT under an OBR | No duplication; confusing for "all results" on ORU. | |
| Configurable via option | Extra surface; over-engineers the common case. | |

**User's choice:** ALL OBX in document order
**Notes:** Two views of the same data; simplest mental model.

### Q8: How should msg.orders() link OBX to parent OBR?

| Option | Description | Selected |
|--------|-------------|----------|
| Positional adjacency: OBR→OBX run | HL7's native structural model. Next OBR closes the group. | ✓ |
| OBX-4 cross-reference | OBX-4 rarely populated reliably. Rejected. | |
| Positional primary + OBX-4 override | Best-effort blend; adds complexity without reliable input. | |

**User's choice:** Positional adjacency
**Notes:** OBX that appear before any OBR appear only in `msg.observations()`.

### Q9: Typing of observation.value (driven by OBX-2 valueType)?

| Option | Description | Selected |
|--------|-------------|----------|
| `string \| number \| Date \| undefined` with valueType discriminator | Parse per OBX-2: NM→number, TS/DT→Date, CWE/CE→composite, else string. | ✓ |
| Discriminated union | Proper TS narrowing; 40+ HL7 valueTypes → huge union (or pragmatic subset). | |
| Always string, raw unescaped | Forces caller coercion; abandons one-line DX. | |

**User's choice:** Typed union with valueType discriminator
**Notes:** Runtime contract locked; TypeScript expression is planner's call.

### Q10: What does observation.value contain for CWE/CE valueTypes?

| Option | Description | Selected |
|--------|-------------|----------|
| Full parsed CWE/CE composite | `obs.value` is the parsed composite (identifier, text, codingSystem). | ✓ |
| Just the code string (CWE.identifier) | Loses text; painful for labs. | |
| Shortcut shape `{ code, text, system }` | Inconsistent with raw asCwe(). | |

**User's choice:** Full parsed CWE/CE composite
**Notes:** Mirrors Phase 3 composite philosophy; no shape duplication.

---

## Name composition & date shape

### Q11: Format of patient.fullName (from XPN)?

| Option | Description | Selected |
|--------|-------------|----------|
| 'Given Middle Family, Suffix' (Western/US) | `'John Q Smith, Jr'`. Matches US-English HL7 tooling convention. | ✓ |
| 'Family, Given Middle' (HL7-canonical) | `'Smith, John Q'`. Mechanically right but bureaucratic feel. | |
| Both: .fullName + .displayName | Twice the API surface. | |
| Don't compose — omit fullName | HELPERS-02 explicitly requires fullName; out. | |

**User's choice:** Western/US order
**Notes:** Raw XPN remains on `patient.name` for canonical ordering.

### Q12: Date-shape convention for helpers?

| Option | Description | Selected |
|--------|-------------|----------|
| Bare `Date \| undefined` | `msg.meta.timestamp.toISOString()` just works. Raw via `msg.get('PID.7')`. | ✓ |
| `{ raw, date }` matching TS composite | Consistency with Phase 3 D-14; verbose for one-liner DX. | |
| Mixed per field | Inconsistent; rejected. | |

**User's choice:** Bare `Date | undefined`
**Notes:** Intentional deviation from Phase 3 D-14, confined to the helper layer.

### Q13: How granular should XPN/XAD name & address sub-fields be on patient?

| Option | Description | Selected |
|--------|-------------|----------|
| HELPERS-02 set: name (XPN), familyName, givenName, middleName, fullName, address (XAD) | Exactly what the requirement locks. Raw composite + flat shortcuts. | ✓ |
| Only composites (name: XPN, address: XAD) | HELPERS-02 requires familyName/givenName/fullName flatly; can't. | |
| Composite + ALL XPN/XAD sub-fields flattened | Enormous surface. | |

**User's choice:** Ship the HELPERS-02 set exactly
**Notes:** Callers destructure address for XAD parts; no `patient.street` / `patient.city`.

---

## Claude's Discretion

- Exact file layout under `src/helpers/`.
- Whether each helper is a getter on `Hl7Message` or a prototype mixin (public shape locked).
- Internal representation of `Observation` / `Order` types (runtime shape locked).
- Field list for AL1 / DG1 / NK1 / IN1 per-collection objects (keep lean).
- IN1/IN2/IN3 grouping pattern (recommended: mirror orders/observations positional grouping).
- Observation value discriminated-union TypeScript expression (loose sum vs precise union).
- Whether to add `parseXcn` + `Field.asXcn()` in Phase 4 or flatten doctor fields (recommended: add XCN).

## Deferred Ideas

- Profile-driven MRN / identifier override — Phase 6.
- Locale-aware `fullName` composition — v2.
- Helper memoization on collections — Phase 7 if profiling warrants.
- `msg.is('ADT^A01')` typed message overlays — v2.
- `patient.age` / `patient.isMinor` — rejected (reference-date ambiguity).
- Insurance precedence resolution — not decoded; array order matches document order.
- Extended observation valueType coverage (beyond NM/ST/TX/FT/TS/DT/CWE/CE/ID) — Phase 7.
