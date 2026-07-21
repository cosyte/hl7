import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/hl7 from the shared @cosyte/vitest-config standard.
 *
 * Per-directory >= 90 gates on every core dir (parser/model/helpers/serialize/builder/profiles).
 * The parser/serialize branch floors that the Vitest 1 -> 4 upgrade temporarily knocked under 90
 * (the @vitest/coverage-v8 branch-accounting change) were restored to the canonical 90: targeted
 * branch tests put parser at ~94% and serialize at 100%.
 *
 * RESOLVED (HL7-J, was the "D10 expiry" transient relaxation): `src/profiles/**` was the one
 * remaining hole — reported but ungated at 81.98% branches, so the global floor stayed at 85 to
 * avoid implicitly gating it. Targeted tests (`test/profiles-merge-validate-coverage.test.ts`)
 * closed the `mergeCustomSegments`/inheritance paths in `profiles/merge.ts` and the validator
 * branches in `profiles/validate.ts` + `profiles/describe.ts`. `src/profiles/**` now carries its
 * own >= 90 per-dir entry and the global `branches` floor is back to the canonical 90 — no
 * remaining relaxation.
 */
export default cosyteVitest({
  coverageDirs: ["parser", "model", "helpers", "serialize", "builder", "profiles", "text"],
  coverageThresholds: {
    branches: 90,
    "src/parser/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/serialize/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/profiles/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/text/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
