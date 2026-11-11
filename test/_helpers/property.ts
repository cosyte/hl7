import {
  DEFAULT_NUM_RUNS,
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
 * How long a property may shrink a counterexample, by default. A case that reads its input once per
 * cut point can take minutes to shrink, and shrinking runs past a test's own timeout (a synchronous
 * property cannot be stopped by it at all), so without a limit a failure deep in a nightly run could
 * outlast the job and print nothing.
 */
export const SHRINK_LIMIT_MS = 120_000;

/** The depth, and the seed and path to replay when set, that a run resolves. */
type ResolvedRun = ReturnType<typeof resolvePropertyRun>;

/** What a run reports when it fails, enough to print the failure and replay it. */
type Failure<Ts> = fc.RunDetailsFailureProperty<Ts> | fc.RunDetailsFailureInterrupted<Ts>;

/** The parameters of the first pass, which stops at the first failing case without shrinking it. */
function findParameters<Ts>(run: ResolvedRun): fc.Parameters<Ts> {
  return { ...run, endOnFailure: true, includeErrorInReport: true };
}

/**
 * The parameters of the second pass, which replays the case the first pass found from its seed and
 * path and shrinks it for at most `shrinkLimit` milliseconds; `undefined` when there is nothing to
 * shrink: the run was itself a replay of a printed seed and path, or found no path.
 */
function shrinkParameters<Ts>(
  run: ResolvedRun,
  found: fc.RunDetails<Ts>,
  shrinkLimit: number,
): fc.Parameters<Ts> | undefined {
  if (run.path !== undefined || found.counterexamplePath === null) return undefined;
  return {
    numRuns: run.numRuns,
    seed: found.seed,
    path: found.counterexamplePath,
    interruptAfterTimeLimit: shrinkLimit,
    includeErrorInReport: true,
  };
}

/**
 * The error a failing property throws: the test's name, the seed and path that replay the smallest
 * case shrinking reached, and whether shrinking stopped at its limit.
 */
function failure<Ts>(
  name: string,
  found: fc.RunDetails<Ts>,
  shrunk: fc.RunDetails<Ts> | undefined,
  shrinkLimit: number,
): Error {
  let details = found as Failure<Ts>;
  // Shrinking replays the case found first; a property that passes it now is reported as found.
  if (shrunk?.failed === true && shrunk.counterexamplePath !== null) {
    details = { ...(shrunk as Failure<Ts>), numRuns: found.numRuns };
  }
  const stopped = details.interrupted
    ? `\nShrinking stopped at its ${String(shrinkLimit)} ms limit: the counterexample is the ` +
      "smallest found by then, and its seed and path replay it exactly."
    : "";
  return new Error(propertyFailureMessage(name, details) + stopped, {
    cause: details.errorInstance,
  });
}

/**
 * Run a property at the resolved depth, and throw a replayable error on its first counterexample.
 * Shrinking stops at `shrinkLimit`: the run finds a failing case without shrinking, then shrinks it
 * from its seed and path for at most that long, and prints the smallest case found by then, which
 * its seed and path replay exactly. A passing run is not limited.
 *
 * @param property The fast-check property.
 * @param options The file's own depth, or a seed and path to replay; the environment wins.
 * @param env The environment; defaults to `process.env`.
 * @param shrinkLimit How long shrinking may take, in milliseconds.
 */
export function checkProperty<Ts>(
  property: fc.IProperty<Ts>,
  options: PropertyRunOptions = {},
  env: Env = process.env,
  shrinkLimit: number = SHRINK_LIMIT_MS,
): void {
  const name = testName();
  const run = resolvePropertyRun(options, env);
  const found = fc.check(property, findParameters<Ts>(run));
  if (!found.failed) return;
  const shrink = shrinkParameters(run, found, shrinkLimit);
  const shrunk = shrink === undefined ? undefined : fc.check(property, shrink);
  throw failure(name, found, shrunk, shrinkLimit);
}

/**
 * Run an async property at the resolved depth, and reject with a replayable error on its first
 * counterexample. The same as `checkProperty`, for a property that awaits, shrinking included.
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
  const name = testName();
  const run = resolvePropertyRun(options, env);
  const found = await fc.check(property, findParameters<Ts>(run));
  if (!found.failed) return;
  const shrink = shrinkParameters(run, found, shrinkLimit);
  const shrunk = shrink === undefined ? undefined : await fc.check(property, shrink);
  throw failure(name, found, shrunk, shrinkLimit);
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
