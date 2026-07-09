---
"@cosyte/hl7": patch
---

Reference test bar (roadmap Phase J) — closed the `src/profiles/**` coverage hole and lifted the
global `branches` floor back to 90 (supersedes/absorbs the `H-PHI` coverage-policy changeset), added
a dedicated fuzz-property harness, extended PHI-safety property coverage to the fatal-error-message
and serialized-output surfaces, and added an oracle-gated differential-testing harness against
python-hl7 over the canonical corpus. Test infrastructure only — no public API or parser behavior
change.
