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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    // The suite's benchmarks with a size the shared comparison leaves out: the four parse
    // benchmarks, not the ACK benchmarks, whose one size is compared there.
    const withLarge = main.benchmarks.filter((b) => b.sizes.some((s) => !s.compare));
    expect(withLarge).toHaveLength(4);
    expect(large.benchmarks.map((b) => b.name)).toEqual(withLarge.map((b) => b.name));
    for (const [i, benchmark] of large.benchmarks.entries()) {
      expect(benchmark.sizes.map((s) => s.label)).toEqual(LARGE);
      expect(benchmark.sizes.every((s) => s.compare)).toBe(true);
      // Every size of the suite is compared in exactly one of the two comparisons.
      const left = (withLarge[i]?.sizes ?? []).filter((s) => !s.compare).map((s) => s.label);
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
type Limits = number | Readonly<Record<string, number>>;
type Judge = (rows: Row[], limits?: Limits, gated?: string[], runs?: number) => Verdict;

const MIB = 1024 * 1024;

/** A reading of each reader as it is, as a ratio of its largest item: the most common one on the runner. */
const TYPICAL: Readonly<Record<string, number>> = {
  readMessages: 1.98,
  parseStream: 1.07,
  readSegments: 1.12,
};

/** The readings the limits were set from, as bench/stream-memory-readings.json records them. */
interface Recorded {
  runs: ({ run: number; commit: string; node: string } & Record<string, number[]>)[];
}

/** The node-version the stream-memory workflow sets up, as written in it. */
function workflowNode(): string | undefined {
  return /^ {10}node-version: "([^"]*)"$/mu.exec(
    read(".github", "workflows", "stream-memory.yml"),
  )?.[1];
}

type NodeMismatch = (running: string, recorded: readonly unknown[]) => string | undefined;

/** Whether the suite runs on Node. CI also runs it under Bun and under Deno. */
const ON_NODE = process.versions["bun"] === undefined && !("Deno" in globalThis);

function row(over: Partial<Row>): Row {
  const reader = over.reader ?? "readMessages";
  return {
    reader,
    count: 36_000,
    failed: 0,
    peak: (TYPICAL[reader] ?? 2) * 4 * MIB,
    largestItemBytes: 4 * MIB,
    ...over,
  };
}

/** One row for each reader the gate judges, each with `over` applied. */
function readings(over: Partial<Row> = {}): Row[] {
  return ["readMessages", "parseStream", "readSegments"].map((reader) => row({ reader, ...over }));
}

describe("the streaming memory gate", () => {
  it("writes a limit down for each reader, as a multiple of the largest item", async () => {
    const { PEAK_LIMITS } = await importModule<{ PEAK_LIMITS: Record<string, number> }>(
      "bench",
      "stream-memory.mjs",
    );
    expect(PEAK_LIMITS).toEqual({ readMessages: 2.35, parseStream: 1.45, readSegments: 1.6 });
    expect(Object.isFrozen(PEAK_LIMITS)).toBe(true);
  });

  it.each(["readMessages", "parseStream", "readSegments"])(
    "sets the limit of %s from twenty readings or more on the runner, midway to one message more",
    async (reader) => {
      const { PEAK_LIMITS } = await importModule<{ PEAK_LIMITS: Record<string, number> }>(
        "bench",
        "stream-memory.mjs",
      );
      const recorded = JSON.parse(read("bench", "stream-memory-readings.json")) as Recorded;
      const ratios = recorded.runs.flatMap((r) => r[reader] ?? []);
      expect(ratios.length).toBeGreaterThanOrEqual(20);
      const highest = Math.max(...ratios);
      const oneMore = Math.min(...ratios) + 1;
      const limit = PEAK_LIMITS[reader] ?? Number.NaN;
      // Midway between the highest reading and the lowest a reader holding one message more gives,
      // rounded to a twentieth, so each side keeps at least a quarter of a message.
      expect(Math.abs(limit - (highest + oneMore) / 2)).toBeLessThanOrEqual(0.025);
      expect(limit - highest).toBeGreaterThanOrEqual(0.25);
      expect(oneMore - limit).toBeGreaterThanOrEqual(0.25);
    },
  );

  it("records the Node each run of readings was taken on, and the workflow sets up exactly that Node", () => {
    const recorded = JSON.parse(read("bench", "stream-memory-readings.json")) as Recorded;
    const nodes = new Set(recorded.runs.map((r) => r.node));
    // Every cited run's log prints this version: the limits are fitted to it.
    expect([...nodes]).toEqual(["v22.23.4"]);
    // An exact version, so a new Node is a change to this line and to the readings, never a drift.
    expect(workflowNode()).toBe("22.23.4");
    expect(`v${workflowNode() ?? ""}`).toBe(recorded.runs[0]?.node);
  });

  it("refuses to judge on a Node major the limits were not read on", async () => {
    const { nodeMismatch } = await importModule<{ nodeMismatch: NodeMismatch }>(
      "bench",
      "stream-memory.mjs",
    );
    const recorded = ["v22.23.4", "v22.23.4"];
    expect(nodeMismatch("v22.23.4", recorded)).toBeUndefined();
    // A minor of the same major is judged; the workflow pins the exact version besides.
    expect(nodeMismatch("v22.24.0", recorded)).toBeUndefined();
    expect(nodeMismatch("v24.11.0", recorded)).toBe(
      "the limits were read on Node v22.23.4 and this is Node v24.11.0: read them again on this " +
        "Node (bench/stream-memory-readings.json), so there is nothing to judge",
    );
    expect(nodeMismatch("v20.19.0", recorded)).toMatch(/so there is nothing to judge$/u);
    // Readings that record no Node, or more than one major, cannot tie the limits to a runtime.
    for (const bad of [[], ["v22.23.4", undefined], ["v22.23.4", "v24.11.0"], ["22"], [22]]) {
      expect(nodeMismatch("v22.23.4", bad)).toMatch(/so there is nothing to judge$/u);
    }
  });

  it.skipIf(!ON_NODE)(
    "exits 2 before taking a reading when the running Node is not the one the limits were read on",
    () => {
      const out = mkdtempSync(join(tmpdir(), "stream-memory-"));
      try {
        // Readings recorded on a Node this process is not.
        const other = process.version.startsWith("v1.") ? "v2.0.0" : "v1.0.0";
        const file = join(out, "readings.json");
        writeFileSync(file, JSON.stringify({ runs: [{ run: 1, commit: "abc", node: other }] }));
        const started = Date.now();
        const result = spawnSync(
          process.execPath,
          [
            join("bench", "stream-memory.mjs"),
            "--target",
            join("test", "fixtures", "stream-memory", "hang.mjs"),
            "--mib",
            "0.25",
            "--readings",
            file,
            "--out",
            join(out, "stream-memory.json"),
            "--summary",
            join(out, "stream-memory.md"),
          ],
          { cwd: REPO_ROOT, encoding: "utf8", shell: false, timeout: 60_000 },
        );
        expect(result.status).toBe(2);
        // No reading was taken: the hanging target would have held each one to its timeout.
        expect(Date.now() - started).toBeLessThan(30_000);
        const document = JSON.parse(readFileSync(join(out, "stream-memory.json"), "utf8")) as {
          verdict: string[];
          readers: Row[];
        };
        expect(document.readers).toEqual([]);
        expect(document.verdict).toEqual([
          `the limits were read on Node ${other} and this is Node ${process.version}: read them ` +
            "again on this Node (bench/stream-memory-readings.json), so there is nothing to judge",
        ]);
        expect(readFileSync(join(out, "stream-memory.md"), "utf8")).toContain(
          "so there is nothing to judge",
        );
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
  );

  it("passes every recorded run of the readers as they are, and fails each holding one message more", async () => {
    const { judge, RUNS } = await importModule<{ judge: Judge; RUNS: number }>(
      "bench",
      "stream-memory.mjs",
    );
    const recorded = JSON.parse(read("bench", "stream-memory-readings.json")) as Recorded;
    const readers = ["readMessages", "parseStream", "readSegments"];
    for (const run of recorded.runs) {
      // A run of twenty readings is judged five at a time, as the gate takes them.
      const length = (run["readMessages"] ?? []).length;
      for (let start = 0; start < length; start += RUNS) {
        const rows = (extra: string | undefined): Row[] =>
          readers.flatMap((reader) =>
            (run[reader] ?? [])
              .slice(start, start + RUNS)
              .map((ratio) =>
                row({ reader, peak: (ratio + (reader === extra ? 1 : 0)) * 4 * MIB }),
              ),
          );
        expect(judge(rows(undefined), undefined, undefined, RUNS).exitCode).toBe(0);
        for (const reader of readers) {
          const verdict = judge(rows(reader), undefined, undefined, RUNS);
          expect(verdict.exitCode).toBe(1);
          const over = verdict.lines.filter((line) => line.includes(", over the limit of "));
          expect(over).toHaveLength(1);
          expect(over[0]?.startsWith(`${reader}: `)).toBe(true);
        }
      }
    }
  });

  it("passes a reading at or under the limit and fails one over it", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    const at = [
      row({ peak: 2.35 * 4 * MIB }),
      row({ reader: "parseStream", peak: 1.45 * 4 * MIB }),
      row({ reader: "readSegments", peak: 1.6 * 4 * MIB }),
    ];
    expect(judge(at).exitCode).toBe(0);
    for (let i = 0; i < at.length; i++) {
      const over = judge([
        row({ reader: "someOtherReader", peak: 100 * MIB }),
        ...at.map((r, j) => (j === i ? { ...r, peak: r.peak + 64 * 1024 } : r)),
      ]);
      expect(over.exitCode).toBe(1);
      expect(over.lines[i + 1]).toMatch(/, over the limit of /u);
    }
    expect(judge(readings({ peak: 5 * MIB }), 1).exitCode).toBe(1);
  });

  it("cannot judge a gated reader it has no limit for", async () => {
    const { judge } = await importModule<{ judge: Judge }>("bench", "stream-memory.mjs");
    const verdict = judge(readings(), { readMessages: 3, parseStream: 3 });
    expect(verdict.exitCode).toBe(2);
    expect(verdict.lines[2]).toBe("readSegments: no limit, so there is nothing to judge");
  });

  it("judges readMessages, parseStream and readSegments", async () => {
    const { judge, GATED_READERS } = await importModule<{
      judge: Judge;
      GATED_READERS: string[];
    }>("bench", "stream-memory.mjs");
    expect(GATED_READERS).toEqual(["readMessages", "parseStream", "readSegments"]);
    const within = judge([
      row({ peak: 8 * MIB }),
      row({ reader: "parseStream", peak: 4.4 * MIB }),
      row({ reader: "readSegments", peak: 4.2 * MIB }),
    ]);
    expect(within.exitCode).toBe(0);
    expect(within.lines).toEqual([
      "readMessages: peak 2.00 times the largest item, within the limit of 2.35",
      "parseStream: peak 1.10 times the largest item, within the limit of 1.45",
      "readSegments: peak 1.05 times the largest item, within the limit of 1.6",
    ]);
    // parseStream at the reading it gave before it was judged: over the limit.
    const over = judge([
      row({}),
      row({ reader: "parseStream", peak: 3.98 * 4 * MIB }),
      row({ reader: "readSegments" }),
    ]);
    expect(over.exitCode).toBe(1);
    expect(over.lines[1]).toBe(
      "parseStream: peak 3.98 times the largest item, over the limit of 1.45",
    );
    const segments = judge([
      ...readings().slice(0, 2),
      row({ reader: "readSegments", peak: 1.6 * 4 * MIB + 64 * 1024 }),
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
            "--any-node",
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
            "--any-node",
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

  it("checks on the runner that each reader holding one message more fails the gate", () => {
    const workflow = read(".github", "workflows", "stream-memory.yml");
    expect(workflow).toMatch(
      /node bench\/stream-memory\.mjs --target bench\/planted-regression\.mjs --mib 100/u,
    );
    expect(workflow).toContain('test "${status}" -eq 1');
    for (const reader of ["readMessages", "parseStream", "readSegments"]) {
      expect(workflow).toContain(
        `grep -q '^- ${reader}: median .*, over the limit of [0-9.]*$' "\${out}/planted.md"`,
      );
    }
    expect(workflow).not.toContain("within the limit");
    const planted = read("bench", "planted-regression.mjs");
    expect(planted).toContain('from "../dist/index.mjs"');
    // Each of the three readers is the build's own, holding one item more.
    for (const reader of ["readMessages", "parseStream", "readSegments"]) {
      expect(planted).toContain(
        `export function ${reader}(source, options) {\n  return holdingOneMore(built.${reader}, source, options);\n}`,
      );
    }
  });

  it("plants one 4 MiB item more, a copy, held until the reader has yielded its last item", async () => {
    const { holdingOneMore, ONE_MESSAGE } = await importModule<{
      holdingOneMore: (
        read: (source: AsyncIterable<Buffer>) => AsyncIterable<string>,
        source: Iterable<Buffer>,
        options: undefined,
        kept: { copies: Buffer[]; bytes: number },
      ) => AsyncIterable<string>;
      ONE_MESSAGE: number;
    }>("bench", "hold-one-more.mjs");
    expect(ONE_MESSAGE).toBe(4 * MIB);
    const CHUNK = 64 * 1024;
    const chunks = Array.from({ length: 96 }, (_, i) => Buffer.alloc(CHUNK, i));
    const seen: Buffer[] = [];
    // A reader that yields after each chunk, and once more after its source has ended, as the
    // message readers yield the last message of a batch.
    async function* reader(from: AsyncIterable<Buffer>): AsyncIterable<string> {
      for await (const chunk of from) {
        seen.push(chunk);
        yield "chunk";
      }
      yield "last";
    }
    const kept = { copies: [] as Buffer[], bytes: 0 };
    const items: string[] = [];
    for await (const item of holdingOneMore(reader, chunks, undefined, kept)) {
      items.push(item);
      if (seen.length * CHUNK >= ONE_MESSAGE) {
        // One item's worth, to within one chunk, from the first 4 MiB on.
        expect(kept.bytes).toBeGreaterThanOrEqual(ONE_MESSAGE);
        expect(kept.bytes).toBeLessThan(ONE_MESSAGE + CHUNK);
        expect(kept.copies.reduce((n, copy) => n + copy.length, 0)).toBe(kept.bytes);
      }
    }
    expect(items.at(-1)).toBe("last");
    // The reader read the source's own chunks; what is kept is copies of the last ones.
    expect(seen).toEqual(chunks);
    expect(seen.every((chunk, i) => chunk === chunks[i])).toBe(true);
    const last = chunks.slice(-kept.copies.length);
    expect(kept.copies).toEqual(last);
    expect(kept.copies.some((copy, i) => copy === last[i] || copy.buffer === last[i]?.buffer)).toBe(
      false,
    );
  });

  it("runs as its own job on every pull request, at 100 MiB, and its exit fails the job", () => {
    const workflow = read(".github", "workflows", "stream-memory.yml");
    // No paths filter: a required check whose workflow does not start never reports.
    expect(workflow).not.toMatch(/^\s+paths:/mu);
    expect(workflow).toMatch(/^ {2}pull_request:$/mu);
    expect(workflow).toMatch(/^ {2}stream-memory:$/mu);
    expect(workflow).toMatch(/node bench\/stream-memory\.mjs --target dist\/index\.mjs --mib 100/u);
    expect(workflow).not.toContain("|| status");
    // The quick local escape from the Node check never runs on the runner.
    expect(workflow).not.toContain("--any-node");
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
