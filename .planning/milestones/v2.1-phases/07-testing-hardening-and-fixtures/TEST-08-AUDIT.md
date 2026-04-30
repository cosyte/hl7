# TEST-08 — Profile-authoring Test Suite Audit

**Generated:** Phase 7 Plan 07 (2026-04-19)
**Purpose:** Map each TEST-08 enumerated case (REQUIREMENTS.md line 109) to
the existing Phase 6 test file(s) that cover it; surface any gaps for
in-place patching per CONTEXT.md D-25 (audit-not-rewrite mandate).
**Disposition:** Per CONTEXT.md D-26, this doc is summarized into the
verifier report at phase close and discarded once gaps are closed. It is
a planning artifact ONLY — it does NOT ship (lives under `.planning/`,
not `docs/` or `test/`).

---

## Scope

Phase 6 shipped 6 profile test files, verified green at Phase 6 close
(789 passing). Phase 7 does not rewrite these; it audits them against
TEST-08's 8 enumerated cases and fills any gap in-place (per D-25).

Audited files:

- `test/profiles-define.test.ts` (defineProfile validation + happy path + describe + frozen)
- `test/profiles-extends.test.ts` (extends single+array + merge semantics + onWarning chain)
- `test/profiles-custom-segments.test.ts` (Segment.get + UNKNOWN_SEGMENT + dateFormats + PROF-09 round-trip + msg.profile attribution)
- `test/profiles-default.test.ts` (setDefault/getDefault/opt-out + D-20 effects equivalence)
- `test/profiles-builtins.test.ts` (5 built-ins public surface + BIP-06 fixture parity + TEST-07 confirmation)
- `test/profiles-onwarning-chain.test.ts` (D-22 profile.onWarning chain with options.onWarning)

---

## TEST-08 enumerated cases (REQUIREMENTS.md line 109)

```
TEST-08 — Profile-authoring test suite covers:
  (1) valid defineProfile output
  (2) ProfileDefinitionError cases
  (3) extends single + array
  (4) merge semantics per option category
  (5) default-profile set/get/opt-out
  (6) profile.describe()
  (7) msg.profile attribution
  (8) round-trip with custom profile
```

---

## Coverage matrix

| # | TEST-08 case                               | Covered by (file — describe/it anchor)                                                                                                                                                                                                                                                                                                                     | Quality       | Gap? |
| - | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| (1) | valid `defineProfile` output               | `test/profiles-define.test.ts` → `describe("defineProfile: happy path")` — 6 `it` blocks covering name-only frozen output, description preservation, customSegments preservation, dateFormats order, extends lineage, onWarning composition; plus `describe("defineProfile: return-value immutability")`.                                                | comprehensive | no   |
| (2) | `ProfileDefinitionError` cases             | `test/profiles-define.test.ts` → `describe("defineProfile: D-05 customSegments validation")` (6 `it` blocks), `describe("defineProfile: D-07 unknown top-level keys")` (2 `it` blocks), `describe("defineProfile: D-08 date format validation")` (5 `it` blocks), `describe("defineProfile: name validation")` (6 `it` blocks). 19 throw-path assertions. | comprehensive | no   |
| (3) | `extends` single + array                   | `test/profiles-extends.test.ts` → `describe("extends: lineage (D-03)")` — `it("single parent → [parent, child]")` + `it("array [p1, p2] with p2 extending p1 → [a, b, c] deduped")` + `it("deep chain a ← b ← c ← d preserves full lineage")` + `it("no parents → lineage = [selfName]")`.                                                                 | comprehensive | no   |
| (4) | merge semantics per option category        | `test/profiles-extends.test.ts` covers four option categories: `describe("extends: dateFormats (D-10)")` — concat+dedupe (2 `it`), `describe("extends: customSegments (D-11)")` — deep merge + child-wins conflict (3 `it`), `describe("extends: scalars (D-9)")` — description override semantics (4 `it`), `describe("extends: onWarning chain (D-12)")` — handler ordering + throw-swallow + [p1,p2]+child all-fire (4 `it`). Plus `test/profiles-onwarning-chain.test.ts` for deeper D-22 chain integration with `options.onWarning` (8 `it` blocks — profile-first order, reference identity, throw-symmetry, strict short-circuit, multi-warning invariant, Option A early-pipeline MLLP coverage). | comprehensive | no   |
| (5) | default-profile set / get / opt-out        | `test/profiles-default.test.ts` → `describe("setDefaultProfile + getDefaultProfile — basic wiring")` — get-before-set undefined, set+get round-trip, `setDefaultProfile(null)` clear, re-set overwrite (4 `it`); `describe("parseHL7 default-profile dispatch (D-19)")` — 4 dispatch cases including `{ profile: null }` opt-out with default-remains-set assertion; `describe("D-20 effects equivalence: default profile === explicit profile")` — 4 equivalence assertions (customSegments, dateFormats, lineage, UNKNOWN_SEGMENT suppression); `describe("test-isolation contract")` documents the afterEach obligation. | comprehensive | no   |
| (6) | `profile.describe()`                       | `test/profiles-define.test.ts` → `describe("defineProfile: describe() (D-04, PROF-05)")` — 7 `it` blocks: name-line present, description line conditional, customSegments count+names, lineage arrow rendering, onWarning-registered line conditional, dateFormats count line. Plus `test/profiles-extends.test.ts` → `describe("extends: describe() reflects merged lineage")` — multi-name lineage `a → b` arrow.                                                                                                                                                                                                                                                         | comprehensive | no   |
| (7) | `msg.profile` attribution                  | `test/profiles-custom-segments.test.ts` → `describe("Phase 2 backward compat…")` → `it("parseHL7(raw, profile) still populates msg.profile.name + lineage")`; `describe("PROF-09 round-trip: profile does NOT affect toString()")` → `it("parse → toString → parse with profile round-trips structurally")` asserts `second.profile?.name === "test"`. Plus per-vendor attribution in `test/profiles-builtins.test.ts` — `msg.profile?.name === "epic"` in `describe("profiles.epic — BIP-01 + BIP-06 fixture parity")` and the equivalent assertion in the cerner, athena describe blocks (3 explicit per-vendor blocks; meditech and genericLab rely on the shared round-trip + UNKNOWN_SEGMENT sweeps). Plus lineage attribution via `test/profiles-default.test.ts` → `describe("D-20 effects equivalence")` → `it("profile lineage lands equivalently")` asserting `["parent", "child"]`. | comprehensive | no   |
| (8) | round-trip with a custom profile          | `test/profiles-custom-segments.test.ts` → `describe("PROF-09 round-trip: profile does NOT affect toString()")` — `it("parseHL7(raw, profile).toString() === parseHL7(raw).toString()")` (profile-agnostic toString contract) + `it("parse → toString → parse with profile round-trips structurally")` (full 3-step round-trip with `second.rawSegments).toEqual(first.rawSegments)` + profile attribution preserved). Plus `test/profiles-builtins.test.ts` → `describe("PROF-09 round-trip remains profile-agnostic for built-ins")` — byte-equivalent round-trip across all 5 built-in profiles. | comprehensive | no   |

All 8 cases COVERED. Zero gaps.

---

## Gaps to close

**No gaps.** All 8 TEST-08 enumerated cases are covered by the existing
Phase 6 test suite at comprehensive quality. Task 2 of Plan 07-07 is a
no-op for TEST-08; only TEST-07 confirmation below remains.

---

## TEST-07 confirmation status

**REQUIREMENTS.md line 108:**

> TEST-07 — At least one fixture per built-in profile (epic, cerner,
> meditech, athena, genericLab) demonstrates fewer warnings with the
> profile than without.

**Source:** `test/profiles-builtins.test.ts` (Phase 6 Plan 06 BIP-06).

**Assertion shape (per-vendor):** Each of the 5 vendor describe blocks
(`describe("profiles.epic — BIP-01 + BIP-06 fixture parity")`,
`describe("profiles.cerner — …")`, meditech, athena, genericLab)
contains a paired pattern:

```ts
it("without profile: UNKNOWN_SEGMENT present (...)", () => {
  const without = parseHL7(fixture);
  expect(without.warnings.map((w) => w.code)).toContain(
    WARNING_CODES.UNKNOWN_SEGMENT,
  );
});
it("with profiles.<vendor>: UNKNOWN_SEGMENT absent for declared Zs", () => {
  const withP = parseHL7(fixture, profiles.<vendor>);
  const zSegWarnings = withP.warnings.filter(
    (w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT,
  );
  expect(zSegWarnings).toHaveLength(0);
});
```

This is a STRONGER form of "fewer warnings" — asserting that
UNKNOWN_SEGMENT count drops from 1+ (without) to exactly 0 (with),
per vendor.

**Assertion shape (cross-profile sweep):**
`describe("Cross-profile warning-reduction summary (D-28 secondary
smoke)")` → `it("each built-in's total warning count <= lenient-mode
count (belt-and-suspenders)")` iterates all 5 vendor fixtures and
asserts:

```ts
expect(withP.warnings.length).toBeLessThanOrEqual(without.warnings.length);
```

This explicitly asserts TEST-07's "fewer warnings" contract as an
overall warning count, not just UNKNOWN_SEGMENT.

**Fixture coverage:** All 5 built-in profiles have a fixture under
`test/fixtures/vendor-shapes/<vendor>/`:

- `vendor-shapes/epic/adt-a01.hl7`
- `vendor-shapes/cerner/oru-r01.hl7`
- `vendor-shapes/meditech/adt-a04.hl7`
- `vendor-shapes/athena/adt-a01.hl7`
- `vendor-shapes/genericLab/oru-r01.hl7`

**Verdict:** TEST-07 is CLOSED by Phase 6 Plan 06-06 (BIP-06). No gap.
Task 3 of Plan 07-07 is a no-op — the required per-vendor
warning-count comparison already exists in both per-vendor
(UNKNOWN_SEGMENT absent) and sweep (total `length <= length`) forms.

---

## Disposition

- Summarized into the verifier report at phase close (per CONTEXT.md D-26).
- This raw audit doc is discarded after gaps are closed (it does NOT
  ship; it lives only in `.planning/phases/07-testing-hardening-and-fixtures/`).
- Zero test file edits result from this audit (no gaps found).
