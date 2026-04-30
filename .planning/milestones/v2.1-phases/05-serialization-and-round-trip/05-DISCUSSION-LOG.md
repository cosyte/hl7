# Phase 5: Serialization & Round-Trip — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 05-serialization-and-round-trip
**Areas discussed:** toString() contract + round-trip, buildMessage() API shape, toJSON() shape, prettyPrint() format

---

## toString() contract + round-trip

### Emit source

| Option | Description | Selected |
|--------|-------------|----------|
| rawSegments verbatim walk | Walk the positional RawSegment tree directly; mutations already rebuild the tree (Phase 3 D-16) | ✓ |
| Rebuild via Field/Segment wrappers | Walk msg.allSegments() and re-emit using wrapper APIs | |
| Hybrid: raw tree for reads, wrappers for mutations | Dirty-flag branching per-segment | |

**User's choice:** rawSegments verbatim walk (Recommended).
**Notes:** Phase 3 D-16 says mutation values are verbatim with re-escape deferred to Phase 5 — this matches.

### Trailing empties

| Option | Description | Selected |
|--------|-------------|----------|
| Trim trailing empties (preserve isNull) | Drop trailing empty reps/comps/subs; keep `""` (isNull) | ✓ |
| Preserve all trailing positions verbatim | Emit every position from rawSegments | |
| Configurable via serialize option | `toString({ trimTrailing: true })` | |

**User's choice:** Trim trailing empties.
**Notes:** Matches HL7 convention. isNull preserved as explicit `""`.

### SER-02 equivalence

| Option | Description | Selected |
|--------|-------------|----------|
| Structural rawSegments equality | Deep-equal trees after re-parse | ✓ |
| toString idempotency | `parseHL7(s).toString() === s` | |
| Both (layered) | Structural + idempotent on clean subset | |

**User's choice:** Structural rawSegments equality.
**Notes:** Conservative emitter normalizes quirks — byte-identical round-trip intentionally not guaranteed for quirky input.

### Re-escape policy

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse reescape() for 5 active delimiters only | Hex `\X..\`, `\.br\`, `\Z..\` pass through as decoded literals | ✓ |
| Full round-trip re-encoding | Also re-encode control chars to hex, `\n` back to `\.br\` | |
| Preserve raw-tree strings verbatim (no re-escape) | Only re-escape mutated segments | |

**User's choice:** Reuse reescape() for delimiters only.
**Notes:** Preserves the "Field.value is plain decoded text" mental model.

### Segment terminator

| Option | Description | Selected |
|--------|-------------|----------|
| Strict CR between + trailing CR | HL7 spec canonical | ✓ |
| CR between, no trailing | Some engines prefer this | |
| Configurable newline style | `\r`, `\r\n`, `\n` options | |

**User's choice:** Strict CR between + trailing CR.

### MSH-1 / MSH-2 emission

| Option | Description | Selected |
|--------|-------------|----------|
| Emit verbatim from encodingCharacters | Inverse of Phase 2 readDelimiters | ✓ |
| Emit from rawSegments[MSH].fields[0] and fields[1] | Reuse positional slots | |
| Helper + reject MSH-1/MSH-2 mutation | Add setField guard | |

**User's choice:** Emit verbatim from encodingCharacters.

### Side effects

| Option | Description | Selected |
|--------|-------------|----------|
| Pure function, never warns or throws | Serialization is pure view | ✓ |
| May throw on structural impossibilities only | Defensive path | |
| Accept optional emit callback for serialize warnings | On-demand diagnostics | |

**User's choice:** Pure function.

### MLLP on output

| Option | Description | Selected |
|--------|-------------|----------|
| Never wrap in MLLP | Transport concern, not v1 scope | ✓ |
| Add wrapMllp() as separate utility | Symmetric with stripMllp | |
| toString({ mllp: true }) option | Couple into toString | |

**User's choice:** Never wrap in MLLP.

---

## buildMessage() API shape

### Init shape

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic MSH fields + auto-defaults | type, trigger, sendingApp/fac, receivingApp/fac, controlId?, timestamp?, version?, processingId? | ✓ |
| Raw MSH array + helpers | `{ msh: readonly string[] }` | |
| Layered: semantic fields with mshOverride escape hatch | Both | |

**User's choice:** Semantic MSH fields + auto-defaults.
**Notes:** Mirrors the `msg.meta` read shape (Phase 4 D-01) — symmetric read/write surface.

### MSH construction

| Option | Description | Selected |
|--------|-------------|----------|
| Synthesize complete RawSegment in buildMessage() | Build MSH RawSegment then new Hl7Message | ✓ |
| Empty MSH placeholder + require setField calls | Return shell; caller sets MSH | |
| Two-call API: createMSH() then addSegment() | Split into two entry points | |

**User's choice:** Synthesize complete RawSegment in buildMessage().

### addSegment reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Phase 3 Hl7Message.addSegment | No duplication, same validation, same cache invalidation | ✓ |
| Builder proxy with defer-to-flush semantics | Distinct Builder type | |
| New addSegment overload accepting field structures | Composite-object inputs | |

**User's choice:** Reuse Phase 3 addSegment unchanged.

### Field input shape

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 3 shape: readonly string[] | Zero new API surface | ✓ |
| Accept mixed string \| string[][] \| CompositeObject | Nested arrays + composite objects | |
| Two-arg form: addSegment(name, { '3': 'MRN123', '5': { family: 'Doe' } }) | Field-number-keyed object | |

**User's choice:** Phase 3 shape: readonly string[].

### controlId auto-gen

| Option | Description | Selected |
|--------|-------------|----------|
| Timestamp + short random suffix | `YYYYMMDDHHmmssSSS` + 6 alphanumeric chars | ✓ |
| Monotonic counter per-process | Module-level counter | |
| Require caller-supplied controlId, no auto | Throw if missing | |

**User's choice:** Timestamp + short random suffix.

### Encoding chars

| Option | Description | Selected |
|--------|-------------|----------|
| Default spec chars only | Always `\|^~\\&` | ✓ |
| Accept optional encodingCharacters override | Allow vendor delimiters | |
| Auto-escape chars in caller strings | Pre-emptive scan | |

**User's choice:** Default spec chars only.

### Return type

| Option | Description | Selected |
|--------|-------------|----------|
| Hl7Message directly | Use all standard Hl7Message APIs | ✓ |
| MessageBuilder wrapper with .build() terminal | Staged builder | |
| Hl7MessageDraft subtype | Narrower class | |

**User's choice:** Hl7Message directly.

### Export location

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level named export from src/index.ts | Symmetric with parseHL7; module src/builder/build-message.ts | ✓ |
| Under the HL7 namespace | `HL7.buildMessage(...)` | |
| On Hl7Message as a static method | `Hl7Message.build({...})` | |

**User's choice:** Top-level named export.

---

## toJSON() shape

### JSON shape

| Option | Description | Selected |
|--------|-------------|----------|
| Raw-tree mirror | Direct JSON-safe projection of rawSegments + warnings + profile | ✓ |
| Friendly keyed object | `{ MSH: {...}, PID: [{...}] }` | |
| Hybrid with computed helpers baked in | Raw tree + meta/patient/visit/observations | |

**User's choice:** Raw-tree mirror.

### Warnings inclusion

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, as readonly array | Always present on output | ✓ |
| No, body only | Skip warnings | |
| Opt-in via toJSON({ warnings: true }) | Parameterize | |

**User's choice:** Yes (always present, even as `[]`).

### Profile field

| Option | Description | Selected |
|--------|-------------|----------|
| Yes when present (name + lineage) | Only when `msg.profile` truthy | ✓ |
| Full profile object | Embed customSegments, dateFormats, handlers | |
| Omit entirely | Skip | |

**User's choice:** Yes when present, name + lineage only.

### stringify hook

| Option | Description | Selected |
|--------|-------------|----------|
| Define toJSON() as class method | JSON.stringify(msg) auto-invokes | ✓ |
| Only msg.toJSON() method, no hook | Rename internally | |
| Both toJSON() and asPlainObject() | Two names for same thing | |

**User's choice:** Define toJSON() as a class method.

---

## prettyPrint() format

### Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Segment-per-line with labeled fields | `PID  [1]=1  [3]=MRN12345  [5]=Smith^John^Q` | ✓ |
| Indented tree (segment > field > component > subcomponent) | 2-space indents | |
| Raw HL7 with soft line-wraps and segment gaps | Beautified toString | |

**User's choice:** Segment-per-line with labeled fields.

### Resolution depth

| Option | Description | Selected |
|--------|-------------|----------|
| Stop at field level | Raw HL7 string per field | ✓ |
| Drill into composites for known segments | Expand XPN/XAD inline | |
| Fully expand every segment/field/component/subcomponent | Maximum detail | |

**User's choice:** Stop at field level.

### Header

| Option | Description | Selected |
|--------|-------------|----------|
| Yes: message type + controlId + timestamp | First line derived from msg.meta | ✓ |
| No header, segments only | Direct segment dump | |
| Header including warning count / profile | More complete diagnostic | |

**User's choice:** Yes (type + controlId + timestamp + segment count).

### Options

| Option | Description | Selected |
|--------|-------------|----------|
| No options — single opinionated format | `msg.prettyPrint(): string` | ✓ |
| Minimal options: { colors?, maxSegments? } | ANSI + truncation | |
| Rich options: { depth, colors, labels, showWarnings } | Configurable everything | |

**User's choice:** No options.

---

## Claude's Discretion

- Exact file layout under `src/serialize/` and `src/builder/`.
- Whether `toString()` uses a generic walker or per-segment emitters.
- Whether `buildMessage.init.type` accepts a string-only or string-or-discriminated-object.
- Exact `controlId` random-suffix alphabet.
- Whether `SerializedMessage.segments[i].fields[j].repetitions` is `[]` for fully-absent fields.
- Whether `buildMessage` returns a frozen or mutable `Hl7Message`.

## Deferred Ideas

- `wrapMllp(hl7: string): string` — Phase 8 example or v2.
- `fromJSON(serialized): Hl7Message` — v2.
- Configurable segment terminator — rejected v1.
- prettyPrint options bag — rejected v1.
- Composite-object inputs for addSegment at build time — v2.
- Emitter output caching — rejected v1.
- Round-trip re-encoding of hex / br / Z sequences — rejected v1.
- Typed message builder overloads (`buildAdtA01`) — v2.
- Profile-aware outbound serialization — Phase 6.
- Custom encoding characters on built messages — rejected v1.
- Streaming serialization — v2.
- MLLP toString option — rejected v1.
- Emitter warnings — rejected v1.
