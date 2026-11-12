/**
 * The large message comparison and the streaming memory gate, checked from the files that carry
 * them: the suite the large comparison runs, the gate's verdict on a reading, and the two workflows
 * that run them.
 *
 * Each is quiet when it goes missing. A size left out of every comparison is a regression nobody
 * sees, a memory reading with no verdict passes whatever it reads, and a gate in a workflow that
 * runs only on some pull requests cannot be required.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
  pid?: number;
}
interface Verdict {
  exitCode: 0 | 1 | 2;
  lines: string[];
}
type Judge = (rows: Row[], multiple?: number, gated?: string[], runs?: number) => Verdict;

const MIB = 1024 * 1024;

/** Whether the suite runs on Node. CI also runs it under Bun and under Deno. */
const ON_NODE = process.versions["bun"] === undefined && !("Deno" in globalThis);

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

/** One row for each reader the gate judges, each with `over` applied. */
function readings(over: Partial<Row> = {}): Row[] {
  return ["readMessages", "parseStream", "readSegments"].map((reader) => row({ reader, ...over }));
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
    expect(judge(readings({ peak: 12 * MIB })).exitCode).toBe(0);
    const over = judge([
      row({ reader: "someOtherReader" }),
      row({ peak: 12 * MIB + 1 }),
      ...readings().slice(1),
    ]);
    expect(over.exitCode).toBe(1);
    expect(over.lines.join("\n")).toMatch(/readMessages.*over/u);
    expect(judge(readings({ peak: 5 * MIB }), 1).exitCode).toBe(1);
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
    const over = judge([
      row({}),
      row({ reader: "parseStream", peak: 3.98 * 4 * MIB }),
      row({ reader: "readSegments" }),
    ]);
    expect(over.exitCode).toBe(1);
    expect(over.lines[1]).toBe(
      "parseStream: peak 3.98 times the largest item, over the limit of 3",
    );
    const segments = judge([
      ...readings().slice(0, 2),
      row({ reader: "readSegments", peak: 12 * MIB + 1 }),
    ]);
    expect(segments.exitCode).toBe(1);
  });

  it("lists a reader it does not judge, and a reading of only such a reader cannot pass", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    const verdict = judge([
      row({}),
      row({ reader: "someOtherReader", peak: 16 * MIB }),
      ...readings().slice(1),
    ]);
    expect(verdict.exitCode).toBe(0);
    expect(verdict.lines[1]).toBe(
      "someOtherReader: peak 4.00 times the largest item, measured, not gated",
    );
    expect(judge([row({ reader: "someOtherReader" })]).exitCode).toBe(2);
  });

  it.each(["readMessages", "parseStream", "readSegments"])(
    "cannot judge a reading %s is missing from, however well the others read",
    async (missing) => {
      const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
      const verdict = judge(readings().filter((r) => r.reader !== missing));
      expect(verdict.exitCode).toBe(2);
      expect(verdict.lines.at(-1)).toBe(`${missing}: not measured, so there is nothing to judge`);
      // Missing outranks a finding, as a reading that read nothing does.
      const over = readings({ peak: 100 * MIB }).filter((r) => r.reader !== missing);
      expect(judge(over).exitCode).toBe(2);
    },
  );

  it("cannot judge a reading that read nothing or failed an item", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    expect(judge([]).exitCode).toBe(2);
    // The other two readers read well, so each verdict is that one row's.
    const others = readings().slice(1);
    expect(judge([row({ count: 0 }), ...others]).exitCode).toBe(2);
    expect(judge([row({ largestItemBytes: 0 }), ...others]).exitCode).toBe(2);
    expect(judge([row({ failed: 1 }), ...others]).exitCode).toBe(2);
    // Could not judge outranks a finding: a broken reading is not a pass of the other rows.
    const broken = [row({ peak: 100 * MIB }), row({ reader: "parseStream", failed: 1 })];
    expect(judge([...broken, row({ reader: "readSegments" })]).exitCode).toBe(2);
  });

  it.each([
    ["peak", undefined],
    ["peak", Number.NaN],
    ["peak", Number.POSITIVE_INFINITY],
    ["peak", -1],
    ["largestItemBytes", undefined],
    ["largestItemBytes", Number.NaN],
    ["largestItemBytes", Number.POSITIVE_INFINITY],
    ["largestItemBytes", -1],
  ] as const)(
    "cannot judge a row whose %s is %s, however well the others read",
    async (field, value) => {
      const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
      // A row as a broken reading could hand over: the field absent, not a number, or negative.
      const broken: Row = { ...row({}), [field]: value };
      const verdict = judge([broken, ...readings().slice(1)]);
      expect(verdict.exitCode).toBe(2);
      expect(verdict.lines[0]).toBe(
        "readMessages: no peak or no largest item size, so there is nothing to judge",
      );
    },
  );

  it("takes five readings of each reader", async () => {
    const { RUNS } = await importModule<{ RUNS: number }>("bench", "stream-memory.mjs");
    expect(RUNS).toBe(5);
  });

  it("judges a reader on the median of its readings, so one stray reading cannot fail it", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    // Run 43130463133: readMessages read 3.02 on reader code that read 1.99 to 2.09 everywhere else.
    const ratios = (reader: string, values: number[]): Row[] =>
      values.map((ratio) => row({ reader, peak: ratio * 4 * MIB }));
    const stray = [
      ...ratios("readMessages", [2.0, 2.07, 3.02, 1.99, 2.02]),
      ...ratios("parseStream", [2.1, 2.07, 2.06, 2.06, 2.02]),
      ...ratios("readSegments", [1.1, 1.11, 1.68, 1.11, 1.11]),
    ];
    const verdict = judge(stray, 3, undefined, 5);
    expect(verdict.exitCode).toBe(0);
    expect(verdict.lines[0]).toBe(
      "readMessages: median peak 2.02 times the largest item over 5 readings (1.99 to 3.02), within the limit of 3",
    );
    // Two stray readings in five still leave the median with the code.
    const two = judge(
      [...ratios("readMessages", [2.0, 3.02, 3.98, 1.99, 2.02]), ...stray.slice(5)],
      3,
      undefined,
      5,
    );
    expect(two.exitCode).toBe(0);
  });

  it("fails a planted regression of a message or more on the median of five", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    const others = readings()
      .slice(1)
      .flatMap((r) => [r, r, r, r, r]);
    // A reader holding two messages more than readMessages does, as parseStream read at 3.98.
    const planted = [3.98, 4.01, 3.97, 3.99, 3.02].map((ratio) => row({ peak: ratio * 4 * MIB }));
    const verdict = judge([...planted, ...others], 3, undefined, 5);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.lines[0]).toBe(
      "readMessages: median peak 3.98 times the largest item over 5 readings (3.02 to 4.01), over the limit of 3",
    );
    // A regression that shows in three readings of five, the rest read low, still fails.
    const three = [3.1, 3.2, 3.3, 2.0, 2.0].map((ratio) => row({ peak: ratio * 4 * MIB }));
    expect(judge([...three, ...others], 3, undefined, 5).exitCode).toBe(1);
    // A reader that buffered its source holds toward all 100 MiB.
    const buffered = [25, 25, 25, 25, 25].map((ratio) => row({ peak: ratio * 4 * MIB }));
    expect(judge([...buffered, ...others], 3, undefined, 5).exitCode).toBe(1);
  });

  it("cannot judge a reader with fewer readings than the run took, or one that did not read", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    const five = (r: Row): Row[] => [r, r, r, r, r];
    const all = readings().flatMap(five);
    expect(judge(all, 3, undefined, 5).exitCode).toBe(0);
    const short = judge(all.slice(1), 3, undefined, 5);
    expect(short.exitCode).toBe(2);
    expect(short.lines[0]).toBe("readMessages: 4 of 5 readings, so there is nothing to judge");
    // One reading of five that cannot be judged is not outvoted by the other four.
    const broken = judge([row({ failed: 1 }), ...all.slice(1)], 3, undefined, 5);
    expect(broken.exitCode).toBe(2);
    const lost = judge([{ ...row({}), peak: Number.NaN }, ...all.slice(1)], 3, undefined, 5);
    expect(lost.exitCode).toBe(2);
  });

  // The gate is Node tooling, run by Node in its workflow; CI also runs this suite under Bun and
  // Deno, where the process it would spawn is not Node.
  it.skipIf(!ON_NODE)(
    "reads each reader in a process of its own, five times, and writes every reading",
    () => {
      const out = mkdtempSync(join(tmpdir(), "stream-memory-"));
      try {
        const result = spawnSync(
          process.execPath,
          [
            join("bench", "stream-memory.mjs"),
            "--target",
            join("test", "fixtures", "stream-memory", "target.mjs"),
            "--mib",
            "0.25",
            "--out",
            join(out, "stream-memory.json"),
          ],
          { cwd: REPO_ROOT, encoding: "utf8", shell: false, timeout: 60_000 },
        );
        expect(result.status).not.toBe(2);
        const document = JSON.parse(readFileSync(join(out, "stream-memory.json"), "utf8")) as {
          runs: number;
          readers: Row[];
        };
        expect(document.runs).toBe(5);
        const pids = new Set(document.readers.map((r) => r.pid));
        for (const reader of ["readMessages", "parseStream", "readSegments"]) {
          expect(document.readers.filter((r) => r.reader === reader)).toHaveLength(5);
        }
        expect(pids.size).toBe(15);
        expect(pids.has(process.pid)).toBe(false);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!ON_NODE)(
    "ends a reading that hangs at its timeout, and cannot judge the reader it was of",
    () => {
      const out = mkdtempSync(join(tmpdir(), "stream-memory-"));
      try {
        const started = Date.now();
        const result = spawnSync(
          process.execPath,
          [
            join("bench", "stream-memory.mjs"),
            "--target",
            join("test", "fixtures", "stream-memory", "hang.mjs"),
            "--mib",
            "0.25",
            "--runs",
            "1",
            "--timeout",
            "2",
            "--out",
            join(out, "stream-memory.json"),
          ],
          { cwd: REPO_ROOT, encoding: "utf8", shell: false, timeout: 60_000 },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(2);
        expect(Date.now() - started).toBeLessThan(30_000);
        const document = JSON.parse(readFileSync(join(out, "stream-memory.json"), "utf8")) as {
          verdict: string[];
          readers: (Row & { timedOut?: boolean })[];
        };
        expect(document.verdict).toContain(
          "readMessages: a reading did not finish in 2 seconds, so there is nothing to judge",
        );
        const hung = document.readers.filter((r) => r.reader === "readMessages");
        expect(hung.map((r) => r.timedOut)).toEqual([true]);
        // The readers that finished are still read and listed.
        expect(document.readers.filter((r) => r.timedOut !== true)).toHaveLength(2);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
  );

  it("gives each reading a timeout well inside the job's", async () => {
    const { READING_TIMEOUT_SECONDS, RUNS } = await importModule<{
      READING_TIMEOUT_SECONDS: number;
      RUNS: number;
    }>("bench", "stream-memory.mjs");
    // A reading at 100 MiB takes seconds on a GitHub-hosted runner; a whole step's worth of hung
    // readings of one reader still ends inside the job's 30 minutes.
    expect(READING_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(60);
    expect(READING_TIMEOUT_SECONDS * RUNS).toBeLessThanOrEqual(15 * 60);
  });

  it("checks on the runner that a planted regression still fails the gate", () => {
    const workflow = read(".github", "workflows", "stream-memory.yml");
    expect(workflow).toMatch(
      /node bench\/stream-memory\.mjs --target bench\/planted-regression\.mjs --mib 100/u,
    );
    expect(workflow).toContain('test "${status}" -eq 1');
    const planted = read("bench", "planted-regression.mjs");
    expect(planted).toContain('from "../dist/index.mjs"');
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
