# Phase 6: Profile System & Built-ins — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 06-profile-system-and-built-ins
**Areas discussed:** defineProfile API + validation, extends merge semantics, customSegments access API, Built-in catalog + fixture strategy

---

## defineProfile API + validation

### Q1: What should defineProfile() return?

| Option | Description | Selected |
|--------|-------------|----------|
| Plain frozen object + describe() method (Recommended) | `Object.freeze({...})` with a `describe()` method. Zero-class, no prototype chain. Matches "Profiles are plain data" key decision. | ✓ |
| ES6 class `Profile` with describe() | Class-based. More OO-idiomatic but nominal type change + JSON.stringify heavier. | |
| describe as precomputed string field | Drop callable describe(); violates PROF-05 which requires `profile.describe()`. | |

**User's choice:** Plain frozen object + describe() method
**Notes:** Matches PROJECT.md "Profiles are plain data produced by `defineProfile()`" key decision.

### Q2: Which validation cases throw ProfileDefinitionError?

| Option | Description | Selected |
|--------|-------------|----------|
| Bad segment name in customSegments (Recommended) | Key must match segment-name regex. | ✓ |
| Duplicate field names within a segment (Recommended) | Two fields with same name → throw. | ✓ |
| Unknown top-level option keys (Recommended) | Typo detection with "did you mean?" hint. | ✓ |
| Malformed date format strings (Recommended) | Format string must contain at least one supported token. | ✓ |

**User's choice:** All four (multiSelect)
**Notes:** All validation gates locked; Levenshtein for typo hints per D-07.

### Q3: How is lineage computed when extends is used?

| Option | Description | Selected |
|--------|-------------|----------|
| Parents first, then self, dedupe first-occurrence (Recommended) | Chronological; matches CSS cascade / MRO. | ✓ |
| Self first, then parents | "Most specific first"; mismatches merge direction. | |
| Only direct ancestors (don't flatten chains) | Loses history for debugging. | |

**User's choice:** Parents first, then self, dedupe preserving first occurrence

### Q4: What does describe() return?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured multi-line summary (Recommended) | Name, description, lineage, customSegment count, dateFormat count, onWarning presence. | ✓ |
| Single-line summary | Minimal; harder to scan. | |
| Verbatim profile.description | Fails PROF-05 non-empty requirement when description absent. | |

**User's choice:** Structured multi-line summary

---

## extends merge semantics

### Q1: How should scalar options merge?

| Option | Description | Selected |
|--------|-------------|----------|
| Child overwrites parent (Recommended) | Last non-undefined wins in lineage order. Standard spread. | ✓ |
| Parent wins, child additive | Violates "extend" semantics. | |
| Throw on scalar conflict | Too friction-y for vendor-specific tweaks. | |

**User's choice:** Child overwrites parent

### Q2: How should array options (dateFormats) merge?

| Option | Description | Selected |
|--------|-------------|----------|
| Concat parents → child, dedupe preserving first (Recommended) | Order-sensitive per TOL-08. | ✓ |
| Child replaces parent wholesale | Forces child to re-declare inherited formats. | |
| Concat without dedupe | Observable redundant work. | |

**User's choice:** Concat parents → child, dedupe first-occurrence

### Q3: How should customSegments merge when same Z-segment declared in both?

| Option | Description | Selected |
|--------|-------------|----------|
| Deep merge by field position; child wins on position conflict (Recommended) | Additive composition + child specialization. | ✓ |
| Child replaces parent entirely | Loses additive value of extends. | |
| Throw on segment conflict | Blocks layering (base + vendor + integration). | |

**User's choice:** Deep merge by field position; child wins on conflict

### Q4: How should multiple onWarning handlers chain?

| Option | Description | Selected |
|--------|-------------|----------|
| Invoke all in lineage order; independent of options.onWarning (Recommended) | Observer composition; errors swallowed per handler. | ✓ |
| Last handler wins | Breaks "extends adds behavior" contract. | |
| Single merged handler — throw on conflict | Manual composition friction. | |

**User's choice:** Invoke all handlers in lineage order; profile chain independent of `ParseOptions.onWarning`

---

## customSegments access API

### Q1: How should customSegments declare fields?

| Option | Description | Selected |
|--------|-------------|----------|
| Object map: field name → 1-indexed position (Recommended) | Terse, map-ordered, uniqueness by key. | ✓ |
| Array of {name, position} | Redundant syntax. | |
| Tuple array indexed by position | Holes for unlabeled positions. | |

**User's choice:** Object map — `{ ZPI: { fields: { encounterId: 3, ... } } }`

### Q2: How should named fields be accessed at runtime?

| Option | Description | Selected |
|--------|-------------|----------|
| Add `Segment.get(fieldName): Field \| undefined` (Recommended) | Extend existing wrapper; uniform Field API. | ✓ |
| Dot-path extension: `msg.get('ZPI.encounterId')` | Useful but deferred. | |
| Separate `ProfileSegment` wrapper class | Forks API; type-guard burden. | |
| Both option 1 AND option 2 | Most ergonomic but more test surface. | |

**User's choice:** Add `Segment.get(fieldName): Field | undefined`
**Notes:** Dot-path extension deferred to post-v1 per D-17.

### Q3: When field name isn't declared, what should Segment.get(name) do?

| Option | Description | Selected |
|--------|-------------|----------|
| Return undefined (Recommended) | Consistent with `msg.get(path)` MODEL-05. | ✓ |
| Return synthetic empty Field | Hides typos. | |
| Throw TypeError | Violates "helpers never throw" HELPERS-07 spirit. | |

**User's choice:** Return undefined

### Q4: Should customSegments apply to standard segments (PID/OBX/…)?

| Option | Description | Selected |
|--------|-------------|----------|
| Z-segments only; standard segments rejected (Recommended) | Keeps semantics tight; typed overlays are v2. | ✓ |
| Allow overlay on any segment | Ambiguity with helpers. | |
| Warn but accept | Extra warning code for deferred feature. | |

**User's choice:** Z-segments only in v1

### Q5: Behavior when profile declares standard-segment customSegments?

| Option | Description | Selected |
|--------|-------------|----------|
| Throw ProfileDefinitionError at defineProfile() (Recommended) | Fail fast; actionable message. | ✓ |
| Silently ignore | Masks user intent. | |
| Emit Tier-2 warning at parseHL7 | New warning code for deferred feature. | |

**User's choice:** Throw ProfileDefinitionError at defineProfile() time

### Q6: Z-segment regex?

| Option | Description | Selected |
|--------|-------------|----------|
| `^Z[A-Z0-9]{2}$` — Z-prefix required (Recommended) | HL7 spec convention. Tight validation. | ✓ |
| Cross-check against standard-segment list | Maintenance burden; drift risk. | |
| Same as addSegment with no standard check | Contradicts just-locked decision. | |

**User's choice:** `^Z[A-Z0-9]{2}$` — first char MUST be Z

---

## Built-in catalog + fixture strategy

### Q1: Primary lever for warning reduction?

| Option | Description | Selected |
|--------|-------------|----------|
| dateFormats + small customSegments set (Recommended) | 1–3 vendor formats + 1–3 Z-segments per vendor; reduces TIMESTAMP_FALLBACK_FORMAT + UNKNOWN_SEGMENT. | ✓ |
| dateFormats only | Doesn't exercise PROF-07. | |
| Rich customSegments with pseudo-schemas | Risks shipping fiction; heavy research. | |

**User's choice:** dateFormats + small customSegments set per vendor

### Q2: Fixture authoring?

| Option | Description | Selected |
|--------|-------------|----------|
| Handcrafted from publicly documented shapes (Recommended) | 1–2 per vendor × 5 vendors. Synthetic names/MRNs. | ✓ |
| Parameterized template fixture | Loses vendor-characteristic shapes. | |
| Defer to Phase 7 | Violates BIP-06 acceptance. | |

**User's choice:** Handcrafted per-profile from publicly documented vendor shapes

### Q3: Source tree layout?

| Option | Description | Selected |
|--------|-------------|----------|
| `src/profiles/{vendor}.ts` + barrel (Recommended) | One file per profile; parallel plans. | ✓ |
| Single `src/profiles.ts` with all 5 | Loses parallelization. | |
| `src/builtins/profiles/*` nested | Speculative namespace. | |

**User's choice:** `src/profiles/{epic,cerner,meditech,athena,genericLab}.ts` + barrel

### Q4: Public barrel export shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Named object `profiles` (Recommended) | Matches ROADMAP wording `profiles.epic`. | ✓ |
| Individual named exports | Names like `epic` risk collision. | |
| Both namespace and individual | Two surfaces to sync; over-engineering. | |

**User's choice:** Named object — `export { profiles }` where `profiles.epic` etc.

### Q5: setDefaultProfile / getDefaultProfile storage?

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level `let` in `src/profiles/default.ts` (Recommended) | Process-scoped per PROJECT.md. | ✓ |
| Global symbol on `globalThis` | Leaks across consumers. | |
| No setter | Violates PROF-08. | |

**User's choice:** Module-level `let` in `src/profiles/default.ts`

### Q6: profile.dateFormats vs ParseOptions.dateFormats merge order?

| Option | Description | Selected |
|--------|-------------|----------|
| options first, then profile, dedupe (Recommended) | "Explicit > default" rule. | ✓ |
| profile first, then options | Reverses explicit precedence. | |
| options replaces profile entirely | Too aggressive. | |

**User's choice:** options.dateFormats first, then profile.dateFormats, dedupe

### Q7: Fixture-parity test assertion style?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-warning-code assertion (Recommended) | Robust to future new warnings. | ✓ |
| Total warning count comparison | Brittle across phases. | |
| Both | Belt-and-suspenders. | |

**User's choice:** Per-warning-code assertion

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions>` § Claude's Discretion — includes:
- Exact file split under `src/profiles/` (merge.ts vs consolidated)
- Levenshtein threshold for typo hints (D-07)
- Exact `Hl7Message` → `Segment` wiring mechanism for customSegments map (D-16)
- onWarning try/catch shape
- athena AM/PM date-token support in `parseHl7Timestamp`
- Relative vs barrel imports inside built-in profile files
- Number of fixtures per built-in beyond the BIP-06 minimum of one
- Whether describe() reports onWarning handler-chain length

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section — summarized:
- Dot-path extension (`msg.get('ZPI.name')`) — post-v1
- Typed custom-segment field names — v2
- Standard-segment overlays / typed message overlays — v2
- Profile-aware serialization — rejected for v1 (PROF-09)
- Profile-aware `pickMrn` — v2
- Warning suppression filter in profiles — v2
- Lazy `extends: () => parent` — v2
- `loadProfileFromJson` — out of scope
- Built-in profile versioning — out of scope
- More than 5 built-ins — community via starter kit (Phase 8)
- Multi-default stack — out of scope

---

*Phase: 06-profile-system-and-built-ins*
*Discussion logged: 2026-04-19*
