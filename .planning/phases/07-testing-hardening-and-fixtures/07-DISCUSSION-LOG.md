# Phase 7: Testing Hardening & Fixtures — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 07-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 07-testing-hardening-and-fixtures
**Areas discussed:** Coverage gate, Fixture layout, Tier-2 scenarios, Canonical breadth

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Coverage gate | Hard CI gate vs advisory; provider; threshold shape; wiring | ✓ |
| Fixture layout | Dir structure, existing round-trip/ handling, naming, discovery | ✓ |
| Tier-2 scenarios | Linkage scheme, scope, strict-mode sweep, dedup policy | ✓ |
| Canonical breadth | Authoring source, structural fixtures, round-trip rule, helper probes | ✓ |

**User's choice:** All four selected.

---

## Coverage gate

### How should the 90% coverage threshold be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard CI gate (Recommended) | vitest thresholds ≥ 90 per dir; CI fails below. | ✓ |
| Advisory only | Report but don't gate. | |
| Hard gate on lines, advisory on others | Lines ≥ 90% fails CI; branches/functions reported. | |

**User's choice:** Hard CI gate.

### Which coverage provider?

| Option | Description | Selected |
|--------|-------------|----------|
| v8 (Recommended) | @vitest/coverage-v8 — native, fast, single dev dep. | ✓ |
| istanbul | @vitest/coverage-istanbul — more accurate branches; extra dep. | |

**User's choice:** v8.

### Exact per-directory threshold shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-dir: parser/model/helpers ≥ 90%, rest ungated (Recommended) | Matches CLAUDE.md exactly. | ✓ |
| Global ≥ 90% across all src/ | Simpler config; treats barrels same as core. | |
| Per-dir with differentiated floors | parser/model/helpers 90, profiles/serialize 85, rest 80. | |

**User's choice:** Per-dir, parser/model/helpers only.

### How should coverage wire into `pnpm test`?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate `pnpm test:coverage` + run in CI only (Recommended) | `pnpm test` stays fast; CI runs coverage. | ✓ |
| Always on in `pnpm test` | Coverage every time; slower local loop. | |
| Only via explicit `--coverage` CLI flag | No dedicated script. | |

**User's choice:** Separate `test:coverage` script.

---

## Fixture layout

### How should test/fixtures/ be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| One dir per concern (Recommended) | canonical/, edge-cases/, vendor-quirks/, malformed/, vendor-shapes/. | ✓ |
| Flat, prefixed filenames | All under fixtures/ with prefixes. | |
| By message type then tag | fixtures/adt/a01-canonical.hl7 etc. | |

**User's choice:** One dir per concern.

### How should we handle existing round-trip/?

| Option | Description | Selected |
|--------|-------------|----------|
| Rename to canonical/, move non-canonical files (Recommended) | round-trip → canonical; move decoded-br/embedded-delimiters/null-fields to edge-cases/. | ✓ |
| Keep round-trip/, add new dirs alongside | No migration; some duplication of purpose. | |
| Delete round-trip/, re-author cleanly | Throw out existing 5 files. | |

**User's choice:** Rename + migrate.

### Naming convention?

| Option | Description | Selected |
|--------|-------------|----------|
| kebab-case, message type first (Recommended) | adt-a01.hl7, mllp-framing-stripped.hl7. | ✓ |
| Descriptive sentence-style | adt-a01-with-z-segments.hl7. | |
| Numeric prefix + slug | 01-adt-a01.hl7. | |

**User's choice:** kebab-case, message type first.

### How do tests discover and load fixtures?

| Option | Description | Selected |
|--------|-------------|----------|
| Fs-scan + convention (Recommended) | Glob + describe.each; README.md per dir. | ✓ |
| Explicit manifest per dir | MANIFEST.ts exporting {file, expectedCode, desc}. | |
| Inline per test file | Hardcoded paths. | |

**User's choice:** Fs-scan + convention.

---

## Tier-2 scenarios

### How do vendor-quirks fixtures link to their expected warning code?

| Option | Description | Selected |
|--------|-------------|----------|
| Filename = kebab-case warning code (Recommended) | mllp-framing-stripped.hl7 → MLLP_FRAMING_STRIPPED. | ✓ |
| Companion JSON sidecar | .expected.json files. | |
| Front-matter comment in .hl7 | # expect: CODE header, stripped by helper. | |

**User's choice:** Filename = code.

### Scope of Tier-2 fixture set?

| Option | Description | Selected |
|--------|-------------|----------|
| One fixture per warning code (Recommended) | 13 fixtures, one per Tier-2 code. | ✓ |
| One per scenario class | Group related scenarios. | |
| One per code + 'kitchen sink' | 13 isolated + 1 multi-quirk. | |

**User's choice:** One per code.

### How should the strict-mode escalation sweep run?

| Option | Description | Selected |
|--------|-------------|----------|
| Parameterized describe.each over vendor-quirks/*.hl7 (Recommended) | Single sweep file; auto-grows. | ✓ |
| Explicit tests per scenario | 13 hand-written tests. | |
| Combined sweep + spot checks | Sweep for bulk + explicit for trickiest. | |

**User's choice:** Parameterized sweep.

### What if a Tier-2 code already has unit-test coverage?

| Option | Description | Selected |
|--------|-------------|----------|
| Add fixture + sweep regardless (Recommended) | TEST-05/06 is a contract, not a coverage check. | ✓ |
| Skip fixture if code is already well-covered | Only fill gaps. | |

**User's choice:** Add regardless.

---

## Canonical breadth

### How should the 7 canonical fixtures be authored?

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-author synthetic + spec-aligned (Recommended) | From HL7 chapters; synthetic patients; no PHI. | |
| Adapt publicly-documented samples | Public HL7/vendor docs as starting point, strip, extend. | ✓ |
| Generate via buildMessage() in a helper | Programmatic + snapshot. | |

**User's choice:** Adapt publicly-documented samples.

### How to structure the 3 structural-fixture cases?

| Option | Description | Selected |
|--------|-------------|----------|
| 3 separate fixtures (Recommended) | z-segments.hl7, repeating-fields.hl7, nested-subcomponents.hl7. | ✓ |
| Fold into message-type fixtures | Add to adt-a01, oru-r01, adt-a08. | |
| Hybrid — reuse oru-r01 for repetitions, add 2 dedicated | Two net-new dedicated files. | |

**User's choice:** 3 separate fixtures. (Note: CONTEXT.md D-10 uses a small refinement — reuse existing oru-r01 for repetitions, add 2 new structural fixtures for Z-seg and nested-subcomponent. User's "3 separate" intent honored in principle; planner may further tune.)

### What does 'round-trip losslessly' mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Structural equivalence per SER-02 (Recommended) | Deep-equal rawSegments; not byte-clean. | ✓ |
| Byte-clean identity | Serializer output = input. | |
| Structural + warning-count equivalence | Structural + warnings.length preserved. | |

**User's choice:** Structural equivalence.

### Should each canonical test exercise helpers?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — one 'happy path' assertion per fixture (Recommended) | Canonical test probes a natural helper per message type. | ✓ |
| No — keep as parse+round-trip only | Helpers coverage from dedicated test files. | |

**User's choice:** Yes, one happy-path probe per fixture.

---

## Claude's Discretion

- Exact vitest `coverage.reporter` tuple beyond text + lcov baseline
- Whether `coverage/` is added to `.gitignore` explicitly (verify first)
- Whether strict-mode and malformed sweeps are one file or two (recommend two)
- Whether describe.each uses raw filenames or `{file, code}` pairs for readability
- Exact README.md content per fixture dir beyond the baseline ("what these fixtures demonstrate + filename contract")
- Structural-equivalence matcher style (custom `expect.extend` vs free function)
- Whether SIU/MDM canonical tests include helper probes (recommend no — no helpers exist for those in v1)
- Assertion style for warning presence (`toContain` vs `arrayContaining`) — pick one, stay consistent
- CI step ordering (coverage after lint/typecheck)
- `test/_helpers/` include/exclude strategy in vitest config

## Deferred Ideas

See CONTEXT.md `<deferred>` section for the full list. Highlights:

- Mutation testing, property-based testing, perf benchmarks — v2
- Coverage thresholds on profiles/serialize — v2 (Phase 7 gates only parser/model/helpers per CLAUDE.md)
- Per-fixture README.md narratives, expanded vendor-shapes fixtures beyond BIP-06 minimum — v2/follow-up
