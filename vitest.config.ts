import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/hl7 from the shared @cosyte/vitest-config standard.
 *
 * Per-directory >= 90 gates on the core dirs (parser/model/helpers/serialize/builder). The two
 * parser/serialize branch floors that the Vitest 1 -> 4 upgrade temporarily knocked under 90 (the
 * @vitest/coverage-v8 branch-accounting change) have been restored to the canonical 90: targeted
 * branch tests now put parser at ~94% and serialize at 100%.
 *
 * One transient relaxation remains: the global `branches` floor stays at 85 (not 90) so
 * `src/profiles/**` — reported but intentionally ungated — isn't implicitly gated; the per-directory
 * entries enforce the real bar.
 */
export default cosyteVitest({
  coverageDirs: ["parser", "model", "helpers", "serialize", "builder"],
  coverageThresholds: {
    branches: 85,
    "src/parser/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
    "src/serialize/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
