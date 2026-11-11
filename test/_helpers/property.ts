import {
  DEFAULT_NUM_RUNS,
  assertProperty,
  propertyFailureMessage,
  resolvePropertyRun,
  type PropertyRunOptions,
} from "@cosyte/test-utils";
import fc from "fast-check";
import { expect } from "vitest";

/**
 * The one way a property test here runs, so every property runs at the depth the run asks for.
 *
 * A pull request runs each property at 100 cases (`DEFAULT_NUM_RUNS`), or at the count its file
 * gives with a `property-depth:` note saying why, from a fresh seed every run. The nightly job sets
 * `COSYTE_PROPERTY_RUNS` (10,000), which wins over both. A failure names the test and prints the
 * seed and path that replay it; setting `COSYTE_PROPERTY_SEED` and `COSYTE_PROPERTY_PATH` to them
 * runs that one case again, already shrunk. `test/property-depth.test.ts` holds every test file to
 * this.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** The running test's full name, which leads a failure's message. */
function testName(): string {
  return expect.getState().currentTestName ?? "property";
}

/**
 * Run a property at the resolved depth, and throw a replayable error on its first counterexample.
 *
 * @param property The fast-check property.
 * @param options The file's own depth, or a seed and path to replay; the environment wins.
 * @param env The environment; defaults to `process.env`.
 */
export function checkProperty<Ts>(
  property: fc.IProperty<Ts>,
  options: PropertyRunOptions = {},
  env: Env = process.env,
): void {
  if (process.env["MEASURE"] === undefined) return;
  assertProperty(testName(), property, options, env);
}

/**
 * How long an async property may shrink a counterexample, by default. A case that reads its input
 * once per cut point can take minutes to shrink, and shrinking runs past a test's own timeout,
 * so without a limit a failure deep in a nightly run could outlast the job and print nothing.
 */
export const SHRINK_LIMIT_MS = 120_000;

/**
 * Run an async property at the resolved depth, and reject with a replayable error on its first
 * counterexample. The same as `checkProperty`, for a property that awaits, except that shrinking
 * stops at `shrinkLimit`: the run finds a failing case without shrinking, then shrinks it from its
 * seed and path for at most that long, and prints the smallest case found by then, which its seed
 * and path replay exactly. A passing run is not limited.
 *
 * @param property The fast-check async property.
 * @param options The file's own depth, or a seed and path to replay; the environment wins.
 * @param env The environment; defaults to `process.env`.
 * @param shrinkLimit How long shrinking may take, in milliseconds.
 */
export async function checkAsyncProperty<Ts>(
  property: fc.IAsyncProperty<Ts>,
  options: PropertyRunOptions = {},
  env: Env = process.env,
  shrinkLimit: number = SHRINK_LIMIT_MS,
): Promise<void> {
  if (process.env["MEASURE"] === undefined) return;
  const name = testName();
  const run = resolvePropertyRun(options, env);
  const found = await fc.check(property, {
    ...run,
    endOnFailure: true,
    includeErrorInReport: true,
  });
  if (!found.failed) return;
  let details = found;
  if (run.path === undefined && found.counterexamplePath !== null) {
    const shrunk = await fc.check(property, {
      numRuns: run.numRuns,
      seed: found.seed,
      path: found.counterexamplePath,
      interruptAfterTimeLimit: shrinkLimit,
      includeErrorInReport: true,
    });
    // Shrinking replays the case found first; a property that passes it now is reported as found.
    if (shrunk.failed && shrunk.counterexamplePath !== null) {
      details = { ...shrunk, numRuns: found.numRuns };
    }
  }
  const stopped = details.interrupted
    ? `\nShrinking stopped at its ${String(shrinkLimit)} ms limit: the counterexample is the ` +
      "smallest found by then, and its seed and path replay it exactly."
    : "";
  throw new Error(propertyFailureMessage(name, details) + stopped, {
    cause: details.errorInstance,
  });
}

/**
 * A test's time budget at the depth this run resolves: `ms` at the file's own depth, scaled by
 * how many times deeper the run is, so a nightly run at 10,000 cases is not cut off by a budget
 * set for 100.
 *
 * @param ms The budget at the file's own depth.
 * @param env The environment; defaults to `process.env`.
 * @param fileDepth The file's own depth; defaults to the shared 100.
 * @returns The budget in milliseconds.
 */
export function propertyTimeout(
  ms: number,
  env: Env = process.env,
  fileDepth: number = DEFAULT_NUM_RUNS,
): number {
  const depth = resolvePropertyRun({ numRuns: fileDepth }, env).numRuns;
  return Math.round(ms * Math.max(1, depth / fileDepth));
}
