/**
 * The runner every property test here goes through (`test/_helpers/property.ts`): it runs the
 * depth `COSYTE_PROPERTY_RUNS` asks for over the file's own, names the failing test, prints the
 * seed and path that replay a failure, and replays that one case when they are set.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkAsyncProperty, checkProperty, propertyTimeout } from "./_helpers/property.js";

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
});

describe("propertyTimeout", () => {
  it("keeps a budget at the pull-request depth, and scales it with a deeper run", () => {
    expect(propertyTimeout(10_000, {})).toBe(10_000);
    expect(propertyTimeout(10_000, { COSYTE_PROPERTY_RUNS: "50" })).toBe(10_000);
    expect(propertyTimeout(10_000, { COSYTE_PROPERTY_RUNS: "10000" })).toBe(1_000_000);
    expect(propertyTimeout(120_000, { COSYTE_PROPERTY_RUNS: "10000" }, 25)).toBe(48_000_000);
  });
});
