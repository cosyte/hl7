/**
 * The runner every property test here goes through (`test/_helpers/property.ts`): it runs the
 * depth `COSYTE_PROPERTY_RUNS` asks for over the file's own, names the failing test, prints the
 * seed and path that replay a failure, and replays that one case when they are set.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkAsyncProperty, checkProperty, propertyTimeout } from "./_helpers/property.js";
import { quarterDepth } from "./property/_read.js";

/** The message a failing run throws, or `undefined` when it passes. */
function failureOf(run: () => void): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

/** The message a failing async run rejects with, or `undefined` when it resolves. */
async function asyncFailureOf(run: () => Promise<void>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

/** The counterexample a failure message prints. */
function counterexampleOf(text: string | undefined): string | undefined {
  return /Counterexample: (.*)/u.exec(text ?? "")?.[1];
}

/**
 * Sixty numbers that fail a property when all of them are a million or more. Each shrinks toward a
 * million by halving the distance, so shrinking one case to the end takes thousands of steps.
 */
const slowNumbers = fc.array(fc.noBias(fc.integer({ min: 0, max: 2_000_000_000 })), {
  minLength: 60,
  maxLength: 60,
});

/** Whether any of the numbers is under a million, the property `slowNumbers` fails. */
function anySmall(values: readonly number[]): boolean {
  return values.some((value) => value < 1_000_000);
}

/** `anySmall`, after blocking the thread for 5 ms, as a slow synchronous property would. */
function slowlyAnySmall(values: readonly number[]): boolean {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  return anySmall(values);
}

describe("checkProperty", () => {
  it("runs 100 cases by default, and the file's own count when it gives one", () => {
    let cases = 0;
    checkProperty(
      fc.property(fc.nat(), () => void cases++),
      {},
      {},
    );
    expect(cases).toBe(100);
    cases = 0;
    checkProperty(
      fc.property(fc.nat(), () => void cases++),
      { numRuns: 7 },
      {},
    );
    expect(cases).toBe(7);
  });

  it("runs the depth COSYTE_PROPERTY_RUNS asks for, over the file's own count", () => {
    let cases = 0;
    checkProperty(
      fc.property(fc.nat(), () => void cases++),
      { numRuns: 7 },
      { COSYTE_PROPERTY_RUNS: "250" },
    );
    expect(cases).toBe(250);
  });

  it("names the failing test and prints the seed and path that replay it", () => {
    const message = failureOf(() => {
      checkProperty(
        fc.property(fc.nat(), (n) => n < 50),
        {},
        {},
      );
    });
    expect(message).toMatch(/^checkProperty > names the failing test .*: property failed after/u);
    expect(message).toMatch(/Replay exactly: COSYTE_PROPERTY_SEED=-?\d+ COSYTE_PROPERTY_PATH=\d/u);
    expect(message).toContain("Counterexample: [50]");
  });

  it("replays the one failing case from the printed seed and path", () => {
    const message = failureOf(() => {
      checkProperty(
        fc.property(fc.nat(), (n) => n % 97 !== 13),
        { numRuns: 10_000 },
        {},
      );
    });
    const [, seed, path] =
      /COSYTE_PROPERTY_SEED=(-?\d+) COSYTE_PROPERTY_PATH=([\d:]+)/u.exec(message ?? "") ?? [];
    expect(seed).toBeDefined();
    let cases = 0;
    const replayed = failureOf(() => {
      checkProperty(
        fc.property(fc.nat(), (n) => {
          cases++;
          return n % 97 !== 13;
        }),
        {},
        { COSYTE_PROPERTY_SEED: seed, COSYTE_PROPERTY_PATH: path },
      );
    });
    // The one shrunk case, and the same counterexample the first run printed.
    const counterexample = (text: string | undefined): string | undefined =>
      /Counterexample: (.*)/u.exec(text ?? "")?.[1];
    expect(cases).toBe(1);
    expect(counterexample(replayed)).toBeDefined();
    expect(counterexample(replayed)).toBe(counterexample(message));
  });

  it("stops shrinking at its time limit and prints a seed and path that replay what it found", () => {
    // The synchronous twin of the async case below: a failing case shrinks one slow step at a
    // time, and to the end would take far longer than the limit. A synchronous property cannot be
    // stopped by its test's timeout, so this limit is all that ends it.
    const message = failureOf(() => {
      checkProperty(fc.property(slowNumbers, slowlyAnySmall), {}, {}, 300);
    });
    expect(message).toMatch(/property failed after \d+ case\(s\), shrunk [1-9]\d* time\(s\)/u);
    expect(message).toContain("Shrinking stopped at its 300 ms limit");
    const [, seed, path] =
      /COSYTE_PROPERTY_SEED=(-?\d+) COSYTE_PROPERTY_PATH=([\d:]+)/u.exec(message ?? "") ?? [];
    expect(path).toMatch(/^\d+:\d/u);
    // The printed seed and path replay the one case shrinking stopped at.
    let cases = 0;
    const replayed = failureOf(() => {
      checkProperty(
        fc.property(slowNumbers, (values) => {
          cases++;
          return anySmall(values);
        }),
        {},
        { COSYTE_PROPERTY_SEED: seed, COSYTE_PROPERTY_PATH: path },
      );
    });
    expect(cases).toBe(1);
    expect(counterexampleOf(replayed)).toBeDefined();
    expect(counterexampleOf(replayed)).toBe(counterexampleOf(message));
  });

  it("refuses a depth that is not a whole number of cases", () => {
    expect(() => {
      checkProperty(
        fc.property(fc.nat(), () => true),
        {},
        { COSYTE_PROPERTY_RUNS: "10k" },
      );
    }).toThrow(RangeError);
  });
});

describe("checkAsyncProperty", () => {
  it("runs the depth COSYTE_PROPERTY_RUNS asks for, over the file's own count", async () => {
    let cases = 0;
    await checkAsyncProperty(
      fc.asyncProperty(fc.nat(), async () => {
        await Promise.resolve();
        cases++;
      }),
      { numRuns: 7 },
      { COSYTE_PROPERTY_RUNS: "120" },
    );
    expect(cases).toBe(120);
  });

  it("names the failing test and prints the seed and path that replay it", async () => {
    const message = await asyncFailureOf(() =>
      checkAsyncProperty(
        fc.asyncProperty(fc.nat(), async (n) => {
          await Promise.resolve();
          return n < 50;
        }),
        {},
        {},
      ),
    );
    expect(message).toMatch(/^checkAsyncProperty > names the failing test .*: property failed/u);
    expect(message).toMatch(/Replay exactly: COSYTE_PROPERTY_SEED=-?\d+ COSYTE_PROPERTY_PATH=\d/u);
    expect(message).toContain("Counterexample: [50]");
  });

  it("stops shrinking at its time limit and prints a seed and path that replay what it found", async () => {
    // A case fails when all 60 numbers are a million or more, and each shrinks toward a million
    // by halving the distance, one slow case at a time: to the end would take far longer than
    // this test's 10 s.
    const numbers = fc.array(fc.noBias(fc.integer({ min: 0, max: 2_000_000_000 })), {
      minLength: 60,
      maxLength: 60,
    });
    const anySmall = (values: readonly number[]): boolean =>
      values.some((value) => value < 1_000_000);
    const slow = fc.asyncProperty(numbers, async (values) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return anySmall(values);
    });
    const started = Date.now();
    const message = await asyncFailureOf(() => checkAsyncProperty(slow, {}, {}, 300));
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(message).toMatch(/property failed after \d+ case\(s\), shrunk [1-9]\d* time\(s\)/u);
    expect(message).toContain("Shrinking stopped at its 300 ms limit");
    const [, seed, path] =
      /COSYTE_PROPERTY_SEED=(-?\d+) COSYTE_PROPERTY_PATH=([\d:]+)/u.exec(message ?? "") ?? [];
    expect(path).toMatch(/^\d+:\d/u);
    // The printed seed and path replay the one case shrinking stopped at.
    let cases = 0;
    const replayed = await asyncFailureOf(() =>
      checkAsyncProperty(
        fc.asyncProperty(numbers, async (values) => {
          await Promise.resolve();
          cases++;
          return anySmall(values);
        }),
        {},
        { COSYTE_PROPERTY_SEED: seed, COSYTE_PROPERTY_PATH: path },
      ),
    );
    const counterexample = (text: string | undefined): string | undefined =>
      /Counterexample: (.*)/u.exec(text ?? "")?.[1];
    expect(cases).toBe(1);
    expect(counterexample(replayed)).toBe(counterexample(message));
  });
});

describe("propertyTimeout", () => {
  it("keeps a budget at the pull-request depth, and scales it with a deeper run", () => {
    expect(propertyTimeout(10_000, {})).toBe(10_000);
    expect(propertyTimeout(10_000, { COSYTE_PROPERTY_RUNS: "50" })).toBe(10_000);
    expect(propertyTimeout(10_000, { COSYTE_PROPERTY_RUNS: "10000" })).toBe(1_000_000);
    expect(propertyTimeout(120_000, { COSYTE_PROPERTY_RUNS: "10000" }, 25)).toBe(48_000_000);
  });
});

describe("the streaming reader properties", () => {
  it("run at their own 25 on a pull request, and at a quarter of a deeper run", () => {
    expect(quarterDepth({})).toEqual({});
    expect(quarterDepth({ COSYTE_PROPERTY_RUNS: "60" })).toEqual({ COSYTE_PROPERTY_RUNS: "25" });
    expect(quarterDepth({ COSYTE_PROPERTY_RUNS: "10000" })).toEqual({
      COSYTE_PROPERTY_RUNS: "2500",
    });
    const replay = { COSYTE_PROPERTY_SEED: "-7", COSYTE_PROPERTY_PATH: "3:0" };
    expect(quarterDepth(replay)).toEqual(replay);
  });
});
