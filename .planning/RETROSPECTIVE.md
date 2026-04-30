# @cosyte/hl7 — Retrospective

Living retrospective. Updated at each milestone close. Newest milestone first; cross-milestone trends at the bottom.

---

## Milestone: v2.1 — HL7 v2 Toolkit (initial public release)

**Shipped:** 2026-04-21
**Phases:** 12 (9 v1 functional + 3 audit follow-on) | **Plans:** 59
**Timeline:** 2026-04-18 → 2026-04-21 (4 days, 264 commits)

### What Was Built

A complete HL7 v2 toolkit for Node.js/TypeScript: lenient-by-default parser with stable warning codes + 4-tier deviation model + 4 fatal codes; immutable structural model with dot-path access and typed composites (XPN/XAD/CX/CWE/CE/XTN/PL/TS-DTM/NM/HD/XCN); one-line helpers (`msg.patient`, `msg.observations()`, `msg.orders()`, etc.); Postel's-Law serialization (`toString`/`toJSON`/`prettyPrint`/`buildMessage`); first-class `defineProfile()` API + 5 built-in vendor profiles; comprehensive README + 3 runnable examples + publishable profile starter kit; zero runtime dependencies; dual ESM+CJS via `tsup`; ≥ 90% per-dir branch coverage CI-enforced across Node 18/20/22.

### What Worked

- **Clear up-front decomposition into 9 v1 phases.** No phase had to be split or re-scoped during execution. Plan-check agent caught most concerns before execution started.
- **Plans within a phase parallelized cleanly when modules were disjoint.** Composite parsers (Phase 3 plans 02/03), built-in profiles (Phase 6 Plan 05), helpers (Phase 4 plans 02/03/04 partially) — all ran with no integration headaches because the shared types/registry were built first.
- **Postel's-Law applied at the API boundary.** Shipping the lenient default + warnings registry early meant every later phase consumed a stable signal. Strict-mode escalation became one line at the end.
- **Fixture-driven testing surface.** Authoring 14 edge-case + 13 vendor-quirk + 4 malformed fixtures in Phase 7 made the strict-mode sweep, profile-warning-reduction tests, and round-trip equivalence tests almost mechanical.
- **Mid-milestone rename was painless** because the package surface was already small and well-typed. Phase 9 finished in 4 plans across one day; CHANGELOG breadcrumb left the only legacy reference.
- **Audit-driven gap closure (Phases 10/11/12) preserved traceability.** Rather than retroactive patch commits, each gap got its own phase + plans + summaries + verifier report. Final paper trail is internally consistent.

### What Was Inefficient

- **Stale REQUIREMENTS.md checkboxes accumulated across 9 phases.** v2.1-MILESTONE-AUDIT discovered 35 traceability checkboxes that hadn't been flipped on plan close. Phase 10 closed it in one plan, but the cleaner path is to flip checkboxes during plan SUMMARY, not at milestone audit. → Trend item.
- **Three phases shipped without a `VERIFICATION.md` and six without a `VALIDATION.md`** despite green pipeline + tarball dry-run + coverage gate evidence. Phases 11 + 12 had to retroactively run the verifier/validator, which is doable but wastes a milestone-close cycle. → Trend item.
- **47 files of pre-existing prettier drift on `main`** caused Phase 11 SC-1 (`format:check` gate) to fail until orchestrator landed commit `e1c9ee4` to clear it. The drift had crept in across earlier phases because `format:check` wasn't in the pipeline until Phase 11 added it. → Trend item.
- **Phase 2 had a TOL-08 deferred block** in its VERIFICATION.md that survived through Phases 3/4 closing the gap behind it. The block didn't get retired until Phase 10. Carry-forward closure should be checked at the *consuming* phase's verification, not at milestone audit.

### Patterns Established

- **Per-dir coverage gates beat global gates** when the source tree has unverified-by-design subtrees (here: `profiles/**` is data-heavy and ships with handcrafted fixture parity tests, not unit tests). Scenario A (per-dir 90% on parser/model/helpers/serialize/builder, global 85) preserved the gate's signal without forcing artificial tests.
- **Stable warning codes + positional context** (e.g., `MLLP_FRAMING_STRIPPED`, `TIMESTAMP_FALLBACK_FORMAT`) are a public API. They show up in user error-handling and profile-authoring code paths. Treat them with the same compatibility care as exported types.
- **Audit follow-on as discrete phases** (10/11/12 here) is the right shape when the audit lands close to milestone close. It costs ~1 day of phase work but gives every gap its own SUMMARY + VERIFICATION + commit, preserving the GSD audit trail.
- **A "rename phase" is feasible mid-milestone** if (a) the surface is well-typed, (b) the rename is end-to-end (source / configs / docs / starter-kit / CI), and (c) a final `pnpm publish --dry-run` step verifies nothing slipped through.

### Key Lessons

- **Plan SUMMARY = traceability sink.** Whatever artifact says "this REQ closed" needs its checkbox flipped *in the same commit*, not at milestone audit. Make this part of the SUMMARY template.
- **Verifier + validator should be enforced at phase close**, not deferred. Six phases without VALIDATION + three without VERIFICATION at milestone close turned a 1-day audit into a 3-phase cleanup.
- **Pipeline gates should be added the moment they're considered**, not at the end. `format:check` was added in Phase 11 and immediately surfaced 47 files of drift that had crept in across the prior 8 phases.
- **Carry-forward verification (e.g., TOL-08 in Phase 2 → closed by Phase 3/4) needs explicit hand-off**, not implicit closure. Adding a "carry-forward closes" pointer to the consuming phase's VERIFICATION would catch this without an audit.

### Cost Observations

- Model: Claude Opus 4.7 1M throughout (per CLAUDE.md). No model-mix tracking in this run.
- Sessions: undetermined (commit cadence suggests ~10–15 distinct execution sessions over 4 days).
- Notable: 4-day timeline for 84k LOC insertions across 388 files is dominated by codegen + parallel plan execution, not raw drafting.

---

## Cross-Milestone Trends

*To be filled out as additional milestones ship. Three v2.1 trend items already noted:*

- **Stale checkbox / paper-trail drift across phases.** Watch v2.2 for whether plan SUMMARY now closes traceability checkboxes inline.
- **Verifier/validator deferral.** Watch v2.2 for whether retroactive VERIFICATION/VALIDATION phases reappear at milestone close.
- **Pipeline gate drift.** Watch v2.2 for whether new gates (e.g., type-check on docs, ratchet for `it.todo` count) get added mid-milestone vs. up-front.

---

*Updated at v2.1 milestone close on 2026-04-30.*
