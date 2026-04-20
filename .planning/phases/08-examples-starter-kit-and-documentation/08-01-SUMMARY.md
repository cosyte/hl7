---
phase: 08-examples-starter-kit-and-documentation
plan: 01
subsystem: examples
tags: [examples, runnable-scripts, hl7, smoke-test, tsx, spawnSync]

# Dependency graph
requires:
  - phase: 04-named-helpers
    provides: msg.patient / msg.meta / msg.observations() helper surface consumed by EX-01 + EX-02
  - phase: 05-serialization-and-round-trip
    provides: msg.setField + msg.toString round-trip consumed by EX-03
  - phase: 06-profile-system-and-built-ins
    provides: package.json `exports` map + dist bundle that lets examples self-resolve `@cosyte/hl7-parser`
  - phase: 07-testing-hardening-and-fixtures
    provides: synthetic-fixture conventions (Phase 6 D-27 / Phase 7 D-17) carried forward into examples/data/

provides:
  - 3 runnable example scripts (EX-01, EX-02, EX-03) demonstrating the three access patterns
  - 3 synthetic HL7 fixtures under examples/data/ (adt-a01, oru-r01-lab, adt-mutate-source)
  - examples/README.md index with per-example run commands
  - scripts/run-examples.ts smoke-runner using argv-array spawnSync (T-08-01 mitigated)
  - Marker strings that Plan 08-05 can wire into `pnpm examples` CI step

affects: [plan-08-05-ci-wiring, readme-cookbook, starter-kit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tsx-runnable example scripts importing the package's own name via Node self-reference (exports map)"
    - "argv-array spawnSync for fan-out scripts — no shell interpolation (mitigates T-08-01)"
    - "marker-based smoke assertions — each example prints a known string the runner greps"

key-files:
  created:
    - examples/extract-patient-info.ts
    - examples/read-lab-results.ts
    - examples/modify-and-resend.ts
    - examples/data/adt-a01.hl7
    - examples/data/oru-r01-lab.hl7
    - examples/data/adt-mutate-source.hl7
    - examples/README.md
    - scripts/run-examples.ts
  modified: []

key-decisions:
  - "Examples import `@cosyte/hl7-parser` (aspirational package name), resolved via Node's built-in package self-reference + the `exports` map in package.json. Verified end-to-end under tsx."
  - "Fixtures written byte-exact via node inline script: \\r segment separators, no trailing newline, synthetic identifiers only (EX00001/EX00002/EX00003 control IDs — not reused from canonical fixtures)."
  - "Smoke runner uses argv-array spawnSync — `spawnSync('pnpm', ['tsx', 'examples/<file>.ts'], ...)` — never a shell template. Closes threat T-08-01 (command injection via filename)."
  - "Read-lab-results example prints CWE.identifier + CWE.text for both `obs.identifier` (OBX-3) and `obs.units.identifier` (OBX-6) — plan skeleton said `obs.units ?? ''` which would stringify to `[object Object]`; fixed inline (Rule 1)."

patterns-established:
  - "Example scripts live at `examples/*.ts` depth 1; fixtures at `examples/data/*.hl7`. run-examples.ts filters depth-1 only (does not recurse into `data/` or future sibling directories)."
  - "Each example ends with a narrator line (`-> extracted 6 fields via msg.patient...`) so the output reads like a tutorial (CONTEXT D-03)."
  - "Marker strings are defined once in scripts/run-examples.ts as a Record<filename, marker> literal — future examples add one entry and drop a `.ts` file in examples/, no other wiring."

requirements-completed: [EX-01, EX-02, EX-03]

# Metrics
duration: ~15min
completed: 2026-04-19
---

# Phase 8 Plan 01: Examples Starter Kit (runnable scripts) Summary

**3 runnable TypeScript examples (EX-01/02/03) + 3 synthetic HL7 fixtures + smoke-runner using argv-array spawnSync — every example self-resolves `@cosyte/hl7-parser` via Node's package self-reference and prints labeled tutorial-style output.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-19T23:05:00Z (approx)
- **Completed:** 2026-04-19T23:20:00Z (approx)
- **Tasks:** 2 (both `type="auto"`, no checkpoints)
- **Files created:** 8

## Accomplishments

- **EX-01 (extract-patient-info.ts)** — named-helper access: `msg.patient.mrn`, `msg.patient.fullName`, `msg.patient.dateOfBirth`, `msg.patient.sex`, `msg.meta.type`, `msg.meta.timestamp`. Prints 6 labeled lines ending with the tutorial-style narrator line.
- **EX-02 (read-lab-results.ts)** — collection iteration: `msg.observations()` over an ORU^R01 with three OBX entries (WBC / HGB / HCT). Prints `Found 3 observation(s):` + one formatted line per observation (code + name + value + units + reference range).
- **EX-03 (modify-and-resend.ts)** — mutation + round-trip: `msg.get('PV1.3.1')` → `msg.setField('PV1.3.1', 'NEW-WARD')` → `msg.toString()`. Demonstrates Postel's-Law round-trip (parse liberal, emit conservative).
- **Smoke runner (scripts/run-examples.ts)** — enumerates `examples/*.ts` at depth 1, spawns each via `spawnSync('pnpm', ['tsx', ...], ...)` with argv array (T-08-01 mitigated), asserts exit-0 and a per-file marker string. Exits 0 with three `OK   <file>` lines when all three examples pass.
- **examples/README.md** — one-paragraph intro + 2 tables (examples + fixtures) with the exact `pnpm tsx examples/<file>.ts` run command per example.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the three synthetic HL7 fixtures under examples/data/** — `d6b41bf` (test)
2. **Task 2: Author the three example scripts + examples/README.md + smoke-runner script** — `28fae49` (feat)

No plan-metadata commit in this SUMMARY cycle yet (SUMMARY + STATE.md update are committed together at plan close).

## Files Created

- `examples/extract-patient-info.ts` — EX-01 runnable script (21 LOC incl. JSDoc)
- `examples/read-lab-results.ts` — EX-02 runnable script (33 LOC incl. JSDoc + CWE-safe units read)
- `examples/modify-and-resend.ts` — EX-03 runnable script (23 LOC incl. JSDoc)
- `examples/data/adt-a01.hl7` — synthetic ADT^A01 (275 bytes, \r-separated, no LF)
- `examples/data/oru-r01-lab.hl7` — synthetic ORU^R01 with 3 OBX (355 bytes, \r-separated, no LF)
- `examples/data/adt-mutate-source.hl7` — synthetic ADT^A01 with OLD-WARD at PV1.3.1 (259 bytes, \r-separated, no LF)
- `examples/README.md` — index + tables (38 lines)
- `scripts/run-examples.ts` — argv-array spawnSync runner (51 LOC incl. JSDoc + security note)

## Marker Strings (for Plan 08-05 wiring reference)

Defined in `scripts/run-examples.ts`:

| Example file                | Required marker substring |
| --------------------------- | ------------------------- |
| `extract-patient-info.ts`   | `Patient MRN:`            |
| `read-lab-results.ts`       | `Observation`             |
| `modify-and-resend.ts`      | `Re-serialized HL7`       |

Plan 08-05 only needs to add `"examples": "tsx scripts/run-examples.ts"` to `package.json#scripts` and add `tsx` under `devDependencies` — the smoke script is ready to drop into the existing CI pipeline as a `pnpm examples` step.

## Decisions Made

- **Package-self-reference for imports.** All three examples import `from "@cosyte/hl7-parser"`. Verified under Node 22.22.2 + tsx: Node's built-in package self-reference (activated by the `exports` map in package.json) resolves the import to `./dist/index.mjs` without needing `pnpm-workspace.yaml` or a node_modules symlink. This keeps example imports aspirational — they match exactly what an external consumer will write after publish.
- **Fixtures authored via node inline script, not hand-written.** Used a single `node --input-type=module -e "..."` invocation to emit byte-exact \r-separated files with no trailing newline. Matches the style of `scripts/write-vendor-quirks.mjs`. Guarantees no accidental LF contamination.
- **Control IDs prefixed `EX000NN` (fresh).** Not reused from canonical fixtures (`MSG00001`..`MSG00008` from `test/fixtures/canonical/`). Keeps example fixtures ownable by examples/ and avoids "are these the canonical fixtures?" confusion if a developer greps.
- **`examples/data/` has no README.** CONTEXT D-05 + deferred-items line 703 explicitly defer per-fixture READMEs; the top-level `examples/README.md` covers all three fixtures in its second table.
- **Smoke runner alphabetises via `.sort()`** — so the output order is `extract-patient-info` → `modify-and-resend` → `read-lab-results` (not the order they were introduced). Acceptance criterion asked for "one line per example", not a specific order, so sorted output is fine and more predictable across filesystems.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Observation.units` is a CWE composite, not a string**

- **Found during:** Task 2 (authoring read-lab-results.ts against the plan's skeleton)
- **Issue:** The plan's skeleton had `const units = obs.units ?? "";` and then used it in a template literal. But `src/helpers/types.ts::ObservationBase.units` is typed `CWE | undefined` — using it in a string would render as `[object Object]` (or worse, throw under strict-null-checks when spreading into `String()`). The printed observation line would be garbled.
- **Fix:** Extract the readable string component: `const units = obs.units?.identifier ?? "";`. Matches how the OBX-6 `^^UCUM`-suffixed units compose — component 1 is the readable unit (e.g. `"10*3/uL"`, `"g/dL"`, `"%"`), which is what a developer skimming an example expects to see.
- **Also adjusted:** `obs.identifier` is typed `CWE` (always present per D-15), so the optional-chain on it in the skeleton (`obs.identifier?.text ?? obs.identifier?.identifier ?? "(unnamed)"`) is unnecessary. Replaced with non-optional access `obs.identifier.identifier` + `obs.identifier.text` and a cleaner "code (name)" rendering.
- **Files modified:** `examples/read-lab-results.ts`
- **Verification:** `pnpm dlx tsx examples/read-lab-results.ts` prints `Observation 1: WBC (White Blood Cells) = 7.5 10*3/uL (ref: 4.5-11.0)` — all fields readable, no `[object Object]`.
- **Committed in:** `28fae49` (Task 2 commit).

---

**Total deviations:** 1 auto-fixed (Rule 1 — type correctness in example output)

**Impact on plan:** Low. The fix preserves every acceptance criterion — marker `Observation` still present, exit 0 — and makes the output tutorial-readable rather than garbled. No scope creep; no new files.

## Issues Encountered

None. Both tasks ran clean on the first attempt after the Rule-1 fix above.

## Verification Results

| Check                                              | Result |
| -------------------------------------------------- | ------ |
| `pnpm dlx tsx examples/extract-patient-info.ts`    | exit 0, prints `Patient MRN: MRN12345` |
| `pnpm dlx tsx examples/read-lab-results.ts`        | exit 0, prints `Found 3 observation(s):` + 3 obs lines + `Observation` marker |
| `pnpm dlx tsx examples/modify-and-resend.ts`       | exit 0, prints `Re-serialized HL7` + round-tripped message |
| `pnpm dlx tsx scripts/run-examples.ts`             | exit 0, prints `OK   extract-patient-info.ts` + `OK   modify-and-resend.ts` + `OK   read-lab-results.ts` |
| `pnpm typecheck`                                   | pass (examples/scripts are not in tsconfig `include`, which is expected — tsx validates them at run time) |
| `pnpm lint`                                        | pass (glob scoped to `src/**` + `test/**`; examples/scripts intentionally outside per CONTEXT D-03/D-04) |
| `pnpm test`                                        | 824 pass, 14 todo, 0 failures |
| Fixture byte-format — no 0x0A in any `.hl7`        | pass |
| Fixture shape — each starts with `MSH\|^~\&\|`     | pass |
| `parseHL7` on all three fixtures — 0 warnings      | pass |

## Self-Check

**File existence:**

- `examples/extract-patient-info.ts` — FOUND
- `examples/read-lab-results.ts` — FOUND
- `examples/modify-and-resend.ts` — FOUND
- `examples/data/adt-a01.hl7` — FOUND
- `examples/data/oru-r01-lab.hl7` — FOUND
- `examples/data/adt-mutate-source.hl7` — FOUND
- `examples/README.md` — FOUND
- `scripts/run-examples.ts` — FOUND

**Commit existence:**

- `d6b41bf` (Task 1: fixtures) — FOUND in `git log --oneline`
- `28fae49` (Task 2: examples + README + runner) — FOUND in `git log --oneline`

## Self-Check: PASSED

## User Setup Required

None — no external service configuration required. All three examples run against local synthetic fixtures; the smoke runner shells out to `pnpm tsx` only.

## Next Phase Readiness

- Plan 08-05 can wire `scripts.examples = "tsx scripts/run-examples.ts"` into `package.json` and add `"tsx": "^4.x"` to `devDependencies` with no further example-side work. The smoke script already exits 0 on the current tree.
- README cookbook plan (08-03) can point its "extract patient info in one line" recipe and "iterate observations" recipe at these files as the canonical runnable examples.
- No blockers.

---
*Phase: 08-examples-starter-kit-and-documentation*
*Completed: 2026-04-19*
