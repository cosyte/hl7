/**
 * The large message comparison and the streaming memory gate, checked from the files that carry
 * them: the suite the large comparison runs, the gate's verdict on a reading, and the two workflows
 * that run them.
 *
 * Each is quiet when it goes missing. A size left out of every comparison is a regression nobody
 * sees, a memory reading with no verdict passes whatever it reads, and a gate in a workflow that
 * runs only on some pull requests cannot be required.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

function read(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), "utf8");
}

/** Import a module of this repository by its path, typed as the caller says it is. */
async function importModule<T>(...parts: string[]): Promise<T> {
  const specifier: string = pathToFileURL(join(REPO_ROOT, ...parts)).href;
  return (await import(specifier)) as T;
}

interface Size {
  label: string;
  compare: boolean;
}
interface Suite {
  name: string;
  benchmarks: { name: string; sizes: Size[] }[];
}

const LARGE = ["ORU^R01, 1 MiB", "ORU^R01, 4 MiB", "ORU^R01 with a base64 document, 4 MiB"];

describe("the large message comparison", () => {
  it("compares every size the pull request comparison leaves out, and only those", async () => {
    const { default: main } = await importModule<{ default: Suite }>("bench", "parse.bench.mjs");
    const { default: large } = await importModule<{ default: Suite }>(
      "bench",
      "parse-large.compare.mjs",
    );
    expect(large.benchmarks.map((b) => b.name)).toEqual(main.benchmarks.map((b) => b.name));
    for (const [i, benchmark] of large.benchmarks.entries()) {
      expect(benchmark.sizes.map((s) => s.label)).toEqual(LARGE);
      expect(benchmark.sizes.every((s) => s.compare)).toBe(true);
      // Every size of the suite is compared in exactly one of the two comparisons.
      const left = (main.benchmarks[i]?.sizes ?? []).filter((s) => !s.compare).map((s) => s.label);
      expect(left).toEqual(LARGE);
    }
    expect(large.name).not.toBe(main.name);
  });

  it("is not a file the shared comparison picks up, so it never spends that job's budget", () => {
    // The shared job runs every bench/*.bench.mjs and bench/*.bench.ts.
    expect(existsSync(join(REPO_ROOT, "bench", "parse-large.compare.mjs"))).toBe(true);
    expect("parse-large.compare.mjs".endsWith(".bench.mjs")).toBe(false);
  });

  it("runs on a pull request in bench-reading, base against head, from the large suite", () => {
    const workflow = read(".github", "workflows", "bench-reading.yml");
    expect(workflow).toMatch(/^ {2}large-compare:$/mu);
    expect(workflow).toContain(
      "pnpm exec cosyte-bench compare --suite bench/parse-large.compare.mjs",
    );
  });
});

interface CaseRun {
  benchmark: string;
  size: string;
  verdict: string;
  ratios: number[];
  basePlans?: string[];
  headPlans?: string[];
}
interface Pooled {
  comparisons: number;
  caseTrials: number;
  caseAlarms: number;
  comparisonTrials: number;
  comparisonAlarms: number;
  skippedComparisons: number;
  cases: {
    benchmark: string;
    verdicts: number;
    alarms: number;
    skips: number;
    largePlan: number;
  }[];
}

describe("the large comparison's calibration", () => {
  function caseRun(verdict: string, benchmark = "parseHL7"): CaseRun {
    return {
      benchmark,
      size: "ORU^R01, 4 MiB",
      verdict,
      ratios: verdict === "skipped" ? [] : [1, 1.01],
      basePlans: ["large"],
      headPlans: ["standard"],
    };
  }
  function calibration(runs: CaseRun[][], inject = 0): unknown {
    return { kind: "calibration", calibration: { inject, runs } };
  }

  it("pools A/A comparisons the way @cosyte/bench counts them", async () => {
    const { pool } = await importModule<{ pool: (documents: unknown[]) => Pooled }>(
      "bench",
      "calibration-summary.mjs",
    );
    const pooled = pool([
      calibration([
        [caseRun("no-regression"), caseRun("regression", "toString")],
        [caseRun("skipped"), caseRun("no-regression", "toString")],
      ]),
      calibration([[caseRun("inconclusive"), caseRun("skipped", "toString")]]),
      // A planted slowdown measures detection, not false alarms, so it is left out.
      calibration([[caseRun("regression")]], 0.1),
      { kind: "comparison" },
    ]);
    expect(pooled.comparisons).toBe(3);
    expect(pooled.caseTrials).toBe(4);
    expect(pooled.caseAlarms).toBe(1);
    // The second and third skipped a case and called no regression: neither is a trial.
    expect(pooled.comparisonTrials).toBe(1);
    expect(pooled.comparisonAlarms).toBe(1);
    expect(pooled.skippedComparisons).toBe(2);
    expect(
      pooled.cases.map((c) => [c.benchmark, c.verdicts, c.alarms, c.skips, c.largePlan]),
    ).toEqual([
      ["parseHL7", 2, 0, 1, 2],
      ["toString", 2, 1, 1, 2],
    ]);
  });

  it("bounds a rate as the standard does: 299 clean comparisons are the fewest under 1%", async () => {
    const { upperBound } = await importModule<{ upperBound: (k: number, n: number) => number }>(
      "bench",
      "calibration-summary.mjs",
    );
    expect(upperBound(0, 299)).toBeLessThan(0.01);
    expect(upperBound(0, 298)).toBeGreaterThanOrEqual(0.01);
    expect(upperBound(0, 0)).toBe(1);
    expect(upperBound(1, 10)).toBeGreaterThan(0.1);
  });

  it("runs on the runner class the comparison runs on, from the large suite, A/A", () => {
    const workflow = read(".github", "workflows", "bench-calibration.yml");
    expect(workflow).toContain(
      "pnpm exec cosyte-bench calibrate --suite bench/parse-large.compare.mjs",
    );
    expect(workflow).not.toContain("--inject");
    expect(workflow).toMatch(/^ {6}- "bench\/parse-large\.compare\.mjs"$/mu);
  });
});

interface Row {
  reader: string;
  count: number;
  failed: number;
  peak: number;
  largestItemBytes: number;
}
interface Verdict {
  exitCode: 0 | 1 | 2;
  lines: string[];
}
type Judge = (rows: Row[], multiple?: number) => Verdict;

const MIB = 1024 * 1024;

function row(over: Partial<Row>): Row {
  return {
    reader: "readMessages",
    count: 36_000,
    failed: 0,
    peak: 8 * MIB,
    largestItemBytes: 4 * MIB,
    ...over,
  };
}

describe("the streaming memory gate", () => {
  it("writes its limit down: three times the largest item", async () => {
    const { PEAK_MULTIPLE } = await importModule<{ PEAK_MULTIPLE: number }>(
      "bench",
      "stream-memory.mjs",
    );
    expect(PEAK_MULTIPLE).toBe(3);
  });

  it("passes a reading at or under the limit and fails one over it", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    expect(judge([row({ peak: 12 * MIB })]).exitCode).toBe(0);
    const over = judge([row({ reader: "someOtherReader" }), row({ peak: 12 * MIB + 1 })]);
    expect(over.exitCode).toBe(1);
    expect(over.lines.join("\n")).toMatch(/readMessages.*over/u);
    expect(judge([row({ peak: 5 * MIB })], 1).exitCode).toBe(1);
  });

  it("judges readMessages, parseStream and readSegments", async () => {
    const { judge, GATED_READERS } = await importModule<{
      judge: Judge;
      GATED_READERS: string[];
    }>("bench", "stream-memory.mjs");
    expect(GATED_READERS).toEqual(["readMessages", "parseStream", "readSegments"]);
    const within = judge([
      row({}),
      row({ reader: "parseStream", peak: 4.4 * MIB }),
      row({ reader: "readSegments", peak: 4.2 * MIB }),
    ]);
    expect(within.exitCode).toBe(0);
    expect(within.lines).toEqual([
      "readMessages: peak 2.00 times the largest item, within the limit of 3",
      "parseStream: peak 1.10 times the largest item, within the limit of 3",
      "readSegments: peak 1.05 times the largest item, within the limit of 3",
    ]);
    // parseStream at the reading it gave before it was judged: over the limit.
    const over = judge([row({}), row({ reader: "parseStream", peak: 3.98 * 4 * MIB })]);
    expect(over.exitCode).toBe(1);
    expect(over.lines[1]).toBe(
      "parseStream: peak 3.98 times the largest item, over the limit of 3",
    );
    expect(judge([row({ reader: "readSegments", peak: 12 * MIB + 1 })]).exitCode).toBe(1);
  });

  it("lists a reader it does not judge, and a reading of only such a reader cannot pass", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    const verdict = judge([row({}), row({ reader: "someOtherReader", peak: 16 * MIB })]);
    expect(verdict.exitCode).toBe(0);
    expect(verdict.lines[1]).toBe(
      "someOtherReader: peak 4.00 times the largest item, measured, not gated",
    );
    expect(judge([row({ reader: "someOtherReader" })]).exitCode).toBe(2);
  });

  it("cannot judge a reading that read nothing or failed an item", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    expect(judge([]).exitCode).toBe(2);
    expect(judge([row({ count: 0 })]).exitCode).toBe(2);
    expect(judge([row({ largestItemBytes: 0 })]).exitCode).toBe(2);
    expect(judge([row({ failed: 1 })]).exitCode).toBe(2);
    // Could not judge outranks a finding: a broken reading is not a pass of the other rows.
    expect(judge([row({ peak: 100 * MIB }), row({ failed: 1 })]).exitCode).toBe(2);
  });

  it("runs as its own job on every pull request, at 100 MiB, and its exit fails the job", () => {
    const workflow = read(".github", "workflows", "stream-memory.yml");
    // No paths filter: a required check whose workflow does not start never reports.
    expect(workflow).not.toMatch(/^\s+paths:/mu);
    expect(workflow).toMatch(/^ {2}pull_request:$/mu);
    expect(workflow).toMatch(/^ {2}stream-memory:$/mu);
    expect(workflow).toMatch(/node bench\/stream-memory\.mjs --target dist\/index\.mjs --mib 100/u);
    expect(workflow).not.toContain("|| status");
    // The reading moved here; bench-reading no longer takes it.
    expect(read(".github", "workflows", "bench-reading.yml")).not.toContain(
      "node bench/stream-memory.mjs",
    );
  });
});

describe("one benchmark path", () => {
  it("has no second benchmark script beside the @cosyte/bench suite", () => {
    expect(existsSync(join(REPO_ROOT, "scripts", "bench.ts"))).toBe(false);
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(scripts["bench"]).toBeUndefined();
  });
});
