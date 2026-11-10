/**
 * How this repository adopts the shared testing and performance standards, checked from the files
 * that carry them: the floor file, the scripts, the mutation config, the benchmark suite and the
 * three workflow callers.
 *
 * Each piece is quiet when it goes missing. A floor file without a metric is a metric nobody holds,
 * a caller that drops an input turns its job into a skipped check that still reads green, and a
 * mutation config that leaves out the parser scores the rest of the package as if it were all of
 * it. So each is read here, and a pass means each was found as it should be.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../../src/index.js";

const REPO_ROOT = process.cwd();
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");

function read(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), "utf8");
}

/** Import a module of this repository by its path, typed as the caller says it is. */
async function importModule<T>(...parts: string[]): Promise<T> {
  const specifier: string = pathToFileURL(join(REPO_ROOT, ...parts)).href;
  return (await import(specifier)) as T;
}

/** The commit a caller's `uses:` line names for a shared workflow, or `undefined`. */
function sharedCommit(text: string, workflow: string): string | undefined {
  const pattern = new RegExp(
    `uses: cosyte/\\.github/\\.github/workflows/${workflow.replace(".", "\\.")}@([0-9a-f]{40}) # workflows-`,
    "u",
  );
  return pattern.exec(text)?.[1];
}

describe("the floor file", () => {
  it("holds a coverage floor for each of the four metrics and a mutation floor, each 0 to 100", () => {
    const floor = JSON.parse(read("quality-floor.json")) as {
      packages: Record<string, { coverage?: Record<string, unknown>; mutation?: unknown }>;
    };
    expect(Object.keys(floor.packages)).toEqual(["."]);
    const entry = floor.packages["."];
    expect(Object.keys(entry?.coverage ?? {}).sort()).toEqual([
      "branches",
      "functions",
      "lines",
      "statements",
    ]);
    for (const value of [...Object.values(entry?.coverage ?? {}), entry?.mutation]) {
      expect(typeof value).toBe("number");
      expect(value as number).toBeGreaterThan(0);
      expect(value as number).toBeLessThanOrEqual(100);
    }
  });
});

describe("the scripts", () => {
  it("run the shared tools: the ratchet, the mutation run, the scaling gate and the benchmarks", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(scripts["quality:check"]).toBe("cosyte-ratchet check --skip mutation");
    expect(scripts["quality:mutation"]).toBe("cosyte-ratchet check --skip coverage");
    expect(scripts["mutate"]).toBe("cosyte-mutate");
    expect(scripts["test:perf"]).toBe("vitest run --config vitest.perf.config.ts");
    expect(scripts["bench:reading"]).toContain("--suite bench/parse.bench.mjs");
  });
});

describe("the mutation config", () => {
  it("mutates the parser in src/parser/index.ts and leaves out only the barrels", async () => {
    const { default: config } = await importModule<{
      default: { mutate: string[]; vitest: { configFile?: string } };
    }>("stryker.config.mjs");
    expect(config.mutate).toContain("src/**/*.ts");
    expect(config.mutate).not.toContain("!src/**/index.ts");
    expect(config.mutate).not.toContain("!src/parser/index.ts");
    expect(config.vitest.configFile).toBe("vitest.mutation.config.ts");

    // Every other index.ts under src/ is a barrel and is named, so a new one is a decision.
    const indexes: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "index.ts") indexes.push(relative(REPO_ROOT, path));
      }
    };
    walk(join(REPO_ROOT, "src"));
    const excluded = indexes
      .filter((path) => path !== join("src", "parser", "index.ts"))
      .map((path) => `!${path.split("\\").join("/")}`);
    expect(config.mutate.filter((p) => p.endsWith("index.ts")).sort()).toEqual(excluded.sort());
  });
});

describe("the benchmark suite", () => {
  interface Size {
    label: string;
    compare: boolean;
    build: () => { inputs: string[]; bytes?: number };
  }
  interface Benchmark {
    name: string;
    sizes: Size[];
    bind: (target: unknown) => (input: string) => unknown;
  }

  it("measures small to very large inputs, and leaves only the slowest out of the comparison", async () => {
    const { default: suite } = await importModule<{
      default: { name: string; benchmarks: Benchmark[] };
    }>("bench", "parse.bench.mjs");
    expect(suite.benchmarks.map((b) => b.name)).toEqual(["parseHL7", "parseHL7, then toString"]);
    for (const benchmark of suite.benchmarks) {
      expect(benchmark.sizes.map((s) => s.label)).toEqual([
        "ADT^A01, 280 B",
        "ORU^R01, 32 KiB",
        "ORU^R01, 1 MiB",
        "ORU^R01, 4 MiB",
      ]);
      expect(benchmark.sizes.map((s) => s.compare)).toEqual([true, true, true, false]);
    }
  });

  it("builds each corpus at its stated size, as messages the parser reads without a repair", async () => {
    const { default: suite } = await importModule<{
      default: { benchmarks: Benchmark[] };
    }>("bench", "parse.bench.mjs");
    const [parse] = suite.benchmarks;
    const expected = [280, 32 * 1024, 1024 * 1024, 4096 * 1024];
    for (const [i, size] of (parse?.sizes ?? []).entries()) {
      const corpus = size.build();
      const first = corpus.inputs[0] ?? "";
      expect(Buffer.byteLength(first) / (expected[i] ?? 1)).toBeGreaterThanOrEqual(1);
      expect(Buffer.byteLength(first) / (expected[i] ?? 1)).toBeLessThan(1.01);
      expect(corpus.bytes).toBe(corpus.inputs.reduce((n, t) => n + Buffer.byteLength(t), 0));
      expect(parseHL7(first).warnings).toEqual([]);
    }
  });
});

describe("the workflow callers", () => {
  it("ci.yml turns on the four standard jobs", () => {
    const ci = read(".github", "workflows", "ci.yml");
    for (const input of [
      "run-coverage-ratchet",
      "run-mutation",
      "run-scaling-gate",
      "run-bench-compare",
    ]) {
      expect(ci).toMatch(new RegExp(`^      ${input}: true$`, "mu"));
    }
  });

  it("the nightly property run and the weekly mutation run are scheduled, at the reference ci.yml uses", () => {
    const commit = sharedCommit(read(".github", "workflows", "ci.yml"), "ci.yml");
    expect(commit).toBeDefined();
    for (const [file, workflow] of [
      ["nightly-properties.yml", "nightly-properties.yml"],
      ["weekly-mutation.yml", "weekly-mutation.yml"],
    ] as const) {
      expect(existsSync(join(WORKFLOWS, file)), file).toBe(true);
      const text = read(".github", "workflows", file);
      expect(sharedCommit(text, workflow), file).toBe(commit);
      expect(text, file).toMatch(/^ {2}schedule:\n(?: {4}#.*\n)* {4}- cron: "[^"]+"$/mu);
    }
    expect(read(".github", "workflows", "nightly-properties.yml")).toContain(
      'property-runs: "10000"',
    );
  });
});
