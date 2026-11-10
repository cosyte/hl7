import { configDefaults } from "vitest/config";

import config from "./vitest.config.js";

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without two folders.
 *
 * - `test/perf/`: those tests read a clock and assert on ratios of time; under Stryker's
 *   instrumentation every measured call pays for a mutant switch, so they time out or measure the
 *   instrumentation. They check speed, not what the code returns.
 * - `test/scripts/`: those test this repository's own tooling in `scripts/` (the docs checker, the
 *   PHI scan, the release and API-surface gates), not the library. Measured on 2026-11-10 they are
 *   77% of the suite's test time (400 s of 522 s), and a mutant runs every test that reaches its
 *   line, so the few of them that load the library made every mutant there pay for all of it.
 *
 * The instrumented code runs several times slower than the plain build, so a test's budget here is
 * 60 s rather than 10 s: the heaviest cases (every transposition in every message structure) passed
 * at 10 s plain and timed out under instrumentation. StrykerJS sets each mutant's own timeout from
 * the time the test took in its first run, so this budget does not slow the mutant runs.
 */
export default {
  ...config,
  test: {
    ...config.test,
    exclude: [...configDefaults.exclude, "test/perf/**", "test/scripts/**"],
    testTimeout: 60_000,
  },
};
