import { configDefaults } from "vitest/config";

import config from "./vitest.config.js";

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts`, without `test/perf/`. Those tests read a clock and assert on ratios of time;
 * under Stryker's instrumentation every measured call pays for a mutant switch, so they time out or
 * measure the instrumentation. They check speed, not what the code returns.
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
    exclude: [...configDefaults.exclude, "test/perf/**"],
    testTimeout: 60_000,
  },
};
