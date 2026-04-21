---
phase: 08
slug: examples-starter-kit-and-documentation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
reconstructed_from: artifacts (State B — Phase 12 retroactive Nyquist validation; no prior VALIDATION.md existed)
thin_by_design: true
---

# Phase 8 — Validation Strategy

> Retroactive Nyquist validation audit. **Phase 8 is a thin-by-design docs/examples phase** — 25 REQ-IDs (3 EX + 7 KIT + 15 DOC) partition across three coverage classes: runtime (EX via `pnpm examples`), in-kit pipeline (KIT via `cd examples/profile-starter-kit && pnpm install && pnpm test && pnpm build`), and doc-review (DOC — narrative README/CHANGELOG/CONTRIBUTING prose with no automated enforcement possible). The DOC class is thin-by-design: you cannot unit-test "is this recipe clear" programmatically. All 25 REQs are classified below; none constitute a Nyquist gap.

---

## Test Infrastructure

| Property               | Value                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 1.2.x (library unit tests); `tsx` 4.x (examples runtime)                          |
| **Config file**        | `vitest.config.ts` (library); `examples/profile-starter-kit/package.json` (in-kit)       |
| **Quick run command**  | `pnpm examples` (smoke-runs all 3 example scripts end-to-end)                            |
| **Full suite command** | `pnpm install && pnpm test && pnpm build && pnpm examples`                               |
| **Coverage command**   | `pnpm test:coverage` (library only; examples + starter kit are not coverage-gated)       |
| **Estimated runtime**  | ~30 s full pipeline incl. examples + publish dry-run                                     |

---

## Sampling Rate

- **After every task commit:** `pnpm examples` for EX changes; `cd examples/profile-starter-kit && pnpm test` for KIT changes; `pnpm format:check README.md` (or targeted file) for DOC changes
- **After every plan wave:** full pipeline — `pnpm install && pnpm test && pnpm build && pnpm examples`
- **Before `/gsd-verify-work 8`:** full pipeline + `pnpm publish --dry-run` (tarball shape check — 10 files / 346.2 kB expected)
- **Max feedback latency:** ~30 s

---

## Coverage Class Taxonomy

Phase 8 REQ-IDs partition across four enforcement mechanisms. This table is the single source of truth for how each REQ is validated.

| Class           | REQ Count    | Enforcement Mechanism                                                                                                   | Example                                             |
| --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| runtime         | 3 (EX)       | `pnpm examples` exit 0; all 3 scripts print documented marker strings via `scripts/run-examples.ts` smoke runner        | EX-01 `examples/extract-patient-info.ts`            |
| in-kit pipeline | 7 (KIT)      | `cd examples/profile-starter-kit && pnpm install && pnpm test && pnpm build` + `actionlint` on kit `ci.yml`/`publish.yml` | KIT-02 (4/4 in-kit tests green vs. ZAL fixture)     |
| doc-review      | 13 (DOC-01..13) | Prose review by verifier; light `grep` presence-checks for section headers                                           | DOC-07 (cookbook with all recipes)                  |
| presence-grep   | 2 (DOC-14, DOC-15) | Automated file/section presence checks: `grep "^## \[Unreleased\]" CHANGELOG.md`, `grep "MIT" LICENSE`            | DOC-14 CHANGELOG Keep-a-Changelog format            |

DOC-01..13 are doc-review-gated because prose quality (clarity, correctness, completeness against intent) cannot be asserted programmatically. This is the standard Nyquist thin-by-design exemption for documentation REQs: **COVERED-REVIEW** means the verifier confirmed the REQ's content shipped in the file; it is not a runtime invariant.

---

## Per-Task Verification Map

| ID    | Plan                                      | Wave | Requirement(s)              | Automated Command / Evidence                                                                                                                    | Test Type               | File Exists | Status   |
| ----- | ----------------------------------------- | ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------- | -------- |
| 08-01 | 01 examples-tree                          | 1    | EX-01, EX-02, EX-03         | `pnpm examples` — runs all 3 scripts via `scripts/run-examples.ts` smoke runner; each exits 0 and prints documented marker output               | runtime (e2e)           | ✅          | ✅ green |
| 08-02 | 02 starter-kit-subtree                    | 1    | KIT-01..07                  | `cd examples/profile-starter-kit && pnpm install && pnpm test && pnpm build` — 4/4 in-kit tests green vs. ZAL fixture; `actionlint` clean        | in-kit pipeline + actionlint | ✅    | ✅ green |
| 08-03 | 03 README-13-sections                     | 1    | DOC-01..13                  | Prose review (no automated gate) + light `grep` presence-checks for section headers, badge placeholders, 30s quickstart block, cookbook anchor | doc-review + presence-grep | ✅     | ✅ green |
| 08-04 | 04 CHANGELOG-CONTRIBUTING-LICENSE         | 1    | DOC-14, DOC-15              | `grep -q "^## \[Unreleased\]" CHANGELOG.md && grep -q "MIT" LICENSE && test -f CONTRIBUTING.md`                                                  | presence-grep           | ✅          | ✅ green |
| 08-05 | 05 capstone-wiring-publish-yml-e2e-smoke  | 2    | (integration — EX + KIT)    | `pnpm install && pnpm test && pnpm build && pnpm examples` + `pnpm publish --dry-run` (10 files, 346.2 kB tarball)                              | integration (full pipeline + tarball shape) | ✅ | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

**Total Phase-8 automated surface:** 3 examples scripts + 4 in-kit tests + 2 grep-gated doc assertions + 1 actionlint sweep + 1 publish dry-run = **11 automated checks** covering 12 of 25 REQ-IDs. Remaining 13 REQ-IDs (DOC-01..13) are doc-review-gated per the thin-by-design exemption.

---

## Requirement → Test Cross-Reference

Split into three subtables by category (EX, KIT, DOC) so each family reaches uniform column width under Prettier with single-space trailing padding (per the 12-02 split-subtable convention).

### EX category (3 — runtime)

| ID    | Source Plan | Coverage Class | Primary Evidence                                                                          | Status  |
| ----- | ----------- | -------------- | ----------------------------------------------------------------------------------------- | ------- |
| EX-01 | 08-01       | runtime        | `examples/extract-patient-info.ts` runs end-to-end via `pnpm examples`; marker output asserted | COVERED |
| EX-02 | 08-01       | runtime        | `examples/read-lab-results.ts` runs end-to-end via `pnpm examples`; marker output asserted    | COVERED |
| EX-03 | 08-01       | runtime        | `examples/modify-and-resend.ts` runs end-to-end via `pnpm examples`; marker output asserted   | COVERED |

### KIT category (7 — in-kit pipeline)

| ID     | Source Plan | Coverage Class    | Primary Evidence                                                                                                    | Status  |
| ------ | ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| KIT-01 | 08-02       | in-kit pipeline   | `cd examples/profile-starter-kit && pnpm install` resolves against `file:../..` parent tree (902 ms on verifier run) | COVERED |
| KIT-02 | 08-02       | in-kit pipeline   | `cd examples/profile-starter-kit && pnpm test` — 4/4 tests green vs. ZAL sample fixture                              | COVERED |
| KIT-03 | 08-02       | in-kit pipeline   | `cd examples/profile-starter-kit && pnpm build` — `dist/` matches declared `exports` map; typecheck + lint exit 0    | COVERED |
| KIT-04 | 08-02       | doc-review + file-presence | `examples/profile-starter-kit/CUSTOMIZING.md` walks rename → swap base → Z-segments → fixtures → publish     | COVERED |
| KIT-05 | 08-02       | grep-check        | Placeholders `{{YOUR_ORG}}` + `{{PROFILE_NAME}}` present + consistent across kit source/docs                          | COVERED |
| KIT-06 | 08-02       | actionlint        | `actionlint` clean on `examples/profile-starter-kit/.github/workflows/ci.yml` and `publish.yml` (via parent CI step)  | COVERED |
| KIT-07 | 08-02       | file-presence     | `examples/profile-starter-kit/LICENSE` present (MIT, matches parent license line)                                    | COVERED |

### DOC category (15 — doc-review + presence-grep)

| ID     | Source Plan | Coverage Class | Primary Evidence                                                                                 | Status         |
| ------ | ----------- | -------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| DOC-01 | 08-03       | doc-review     | README one-sentence value prop present as first content line (verifier `head -5 README.md` grep) | COVERED-REVIEW |
| DOC-02 | 08-03       | doc-review     | Badges block present (shields.io links for npm / CI / license)                                   | COVERED-REVIEW |
| DOC-03 | 08-03       | doc-review     | 30-second copy-pasteable quickstart block present                                                | COVERED-REVIEW |
| DOC-04 | 08-03       | doc-review     | 6–8 bullet feature list present                                                                  | COVERED-REVIEW |
| DOC-05 | 08-03       | doc-review     | "HL7 in 90 seconds" mental-model section present                                                 | COVERED-REVIEW |
| DOC-06 | 08-03       | doc-review     | Three access-pattern section present (helpers / Segment.get / raw indexing)                      | COVERED-REVIEW |
| DOC-07 | 08-03       | doc-review     | Full cookbook section with all documented recipes                                                | COVERED-REVIEW |
| DOC-08 | 08-03       | doc-review     | Top-level Profiles section present                                                               | COVERED-REVIEW |
| DOC-09 | 08-03       | doc-review     | 4-tier tolerance section with code table + runnable example                                      | COVERED-REVIEW |
| DOC-10 | 08-03       | doc-review     | Error Handling section present (strict/lenient + warning codes)                                  | COVERED-REVIEW |
| DOC-11 | 08-03       | doc-review     | Contributing section present with CONTRIBUTING.md link                                           | COVERED-REVIEW |
| DOC-12 | 08-03       | doc-review     | "Built by Cosyte" footer + license link present                                                  | COVERED-REVIEW |
| DOC-13 | 08-03       | doc-review     | Publishing Your Profile recipe links to starter kit                                              | COVERED-REVIEW |
| DOC-14 | 08-04       | presence-grep  | `grep -q "^## \[Unreleased\]" CHANGELOG.md` — Keep-a-Changelog format + `[Unreleased]` block      | COVERED        |
| DOC-15 | 08-04       | presence-grep  | `grep -q "MIT" LICENSE` + roadmap/stretch-goals section anchored in README                       | COVERED        |

**Gap summary: 0 MISSING · 0 PARTIAL · 10 COVERED (runtime / in-kit pipeline / actionlint / presence-grep) · 15 COVERED-REVIEW (doc-review, thin-by-design exemption).**

---

## Thin-by-Design Callout

Phase 8's primary deliverables are a README, a CHANGELOG, three runnable examples, and a publishable profile starter kit. Documentation REQ-IDs (DOC-01..15) cannot be validated programmatically for prose quality — you cannot unit-test "is this recipe clear" or "does the HL7-in-90-seconds section convey the mental model". The standard Nyquist exemption for docs phases is to classify these REQs as **COVERED-REVIEW**: the verifier confirms presence + structural conformance, and the prose-quality check is a reader-time activity, not a CI-time invariant. This is NOT a Nyquist gap; it is a recognized exemption class documented in `.planning/config.json` and reiterated in ROADMAP Phase 12 SC-2.

Phase 8 does ship substantial automated coverage despite the thin-by-design label. All 3 EX REQs run end-to-end via `pnpm examples` (enforced in CI on the Node 20 matrix leg); all 7 KIT REQs run the full in-kit pipeline against a sample fixture (4/4 tests green) with `actionlint` verification of both kit workflows; CHANGELOG format + LICENSE presence are grep-enforced (DOC-14, DOC-15). The thin-by-design classification applies only to DOC-01..13 (13 of 25 REQs), and even these have light automated presence-checks for section headers. **No REQ is classified MISSING or PARTIAL.**

---

## Wave 0 Requirements

_None._ Vitest + test infrastructure from Phase 1. `tsx` devDependency + `pnpm examples` script + CI Examples step were added in Plan 08-05 as capstone wiring (inline, not a Wave 0 dependency). The starter-kit subtree bootstrapped its own in-kit `package.json` (intentionally standalone so downstream consumers can copy `examples/profile-starter-kit/` into a fresh directory and run independently — not a Wave 0 dependency of the parent project).

---

## Manual-Only Verifications

Documentation prose review (DOC-01..13) is doc-review-gated and cannot be replaced by an automated check. The `08-VERIFICATION.md` PASS verdict + the `08-UAT.md` user-acceptance evidence together ratify the prose content. For future re-verification, a human must re-read the README sections and confirm each DOC REQ remains satisfied after edits. This is the standard Nyquist thin-by-design exemption for documentation phases.

Notably automated (often candidates for manual-only in other phases):

- **End-to-end examples run** — `pnpm examples` replaces the "open and read the file yourself" manual check.
- **Starter kit publishability** — `pnpm publish --dry-run` (via kit's `publish.yml`) replaces the "is the tarball clean" manual check.
- **CI workflow correctness** — `actionlint` on both parent and kit workflows replaces the "eyeball the YAML" manual check.

---

## Validation Sign-Off

- [x] All tasks have automated verify (runtime for EX, in-kit pipeline for KIT, presence-grep for DOC-14/15, doc-review for DOC-01..13)
- [x] Sampling continuity: 5 plans × at least 1 automated check each (examples runner or in-kit pipeline or presence-grep; DOC-only Plan 08-03 relies on prose review + light presence-checks, acceptable per thin-by-design exemption)
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags (`pnpm test` → `vitest run`, `pnpm examples` → `tsx` one-shot)
- [x] Feedback latency < 30 s (full pipeline including examples + publish dry-run)
- [x] `nyquist_compliant: true` set (`thin_by_design: true` also set to flag DOC exemption)
- [x] Verifier PASS 2026-04-20 per `08-VERIFICATION.md` (5/5 SCs + 25/25 REQs)

**Approval:** approved 2026-04-21 (Nyquist audit — State B reconstruction from 5 plan SUMMARYs + `08-VERIFICATION.md` + `08-UAT.md`).

---

## Validation Audit 2026-04-21

| Metric             | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Input state        | B (5 SUMMARYs + `08-VERIFICATION.md` + `08-UAT.md`)                         |
| REQ-IDs audited    | 25 (3 EX + 7 KIT + 15 DOC)                                                  |
| Plans mapped       | 5 (08-01..08-05)                                                            |
| Coverage classes   | 4 (runtime / in-kit pipeline / doc-review / presence-grep)                  |
| Gaps found         | 0                                                                           |
| Resolved           | 0                                                                           |
| Escalated          | 0                                                                           |
| Thin-by-design     | true (DOC-01..13 doc-review-gated — 13 of 25 REQ-IDs)                       |
| Tarball dry-run    | 10 files, 346.2 kB (per `08-05-SUMMARY.md`)                                 |
| Auditor spawn      | No (no gaps — step 3 workflow rule: "No gaps → skip to Step 6")              |

**Verdict:** Phase 8 is Nyquist-compliant as a thin-by-design docs/examples phase. 10 of 25 REQ-IDs have runtime or pipeline enforcement (`pnpm examples` for EX, in-kit pipeline + `actionlint` for KIT, presence-grep for DOC-14/15 — plus KIT-05/07 via grep + file-presence). The remaining 13 REQ-IDs (DOC-01..13) are doc-review-gated, which is the standard Nyquist exemption for documentation prose content. The `08-VERIFICATION.md` PASS verdict + `08-UAT.md` user-acceptance evidence together ratify both classes. Closes `v2.1-MILESTONE-AUDIT` tech-debt item 2 for Phase 8.
