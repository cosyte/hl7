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
  assertProperty(testName(), property, options, env);
}

/**
 * Run an async property at the resolved depth, and reject with a replayable error on its first
 * counterexample. The same as `checkProperty`, for a property that awaits.
 *
 * @param property The fast-check async property.
 * @param options The file's own depth, or a seed and path to replay; the environment wins.
 * @param env The environment; defaults to `process.env`.
 */
export async function checkAsyncProperty<Ts>(
  property: fc.IAsyncProperty<Ts>,
  options: PropertyRunOptions = {},
  env: Env = process.env,
): Promise<void> {
  const name = testName();
  const run = resolvePropertyRun(options, env);
  const details = await fc.check(property, {
    ...run,
    endOnFailure: run.path !== undefined,
    includeErrorInReport: true,
  });
  if (!details.failed) return;
  throw new Error(propertyFailureMessage(name, details), { cause: details.errorInstance });
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
