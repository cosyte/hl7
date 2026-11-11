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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("says which mutants its mutation floor leaves out, as the mutation config does", async () => {
    const floor = JSON.parse(read("quality-floor.json")) as { $comment?: unknown };
    const { default: full } = await importModule<{ default: Record<string, unknown> }>(
      "stryker.full.config.mjs",
    );
    expect(full["ignoreStatic"]).toBe(true);
    expect(floor.$comment).toContain("static mutants ignored (ignoreStatic: true)");
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
  it("leaves out only the barrels the shared config finds, so every file holding code is mutated", async () => {
    const { default: config } = await importModule<{
      default: { mutate: string[]; vitest: { configFile?: string } };
    }>("stryker.config.mjs");
    const { DEFAULT_MUTATE, findBarrels } = await import("@cosyte/vitest-config/stryker");
    expect(config.mutate).toEqual([
      ...DEFAULT_MUTATE,
      ...findBarrels(REPO_ROOT).map((path) => `!${path}`),
    ]);
    expect(config.vitest.configFile).toBe("vitest.mutation.config.ts");

    // These hold code, not only re-exports: parseHL7, the built-in profiles and VERSION.
    for (const file of ["src/parser/index.ts", "src/profiles/index.ts", "src/index.ts"]) {
      expect(config.mutate, file).not.toContain(`!${file}`);
      expect(findBarrels(REPO_ROOT), file).not.toContain(file);
    }
  });

  it("runs the floor's full run over all of src but the schema writers, on the same settings", async () => {
    const { default: base } = await importModule<{ default: Record<string, unknown> }>(
      "stryker.config.mjs",
    );
    const { default: full } = await importModule<{ default: Record<string, unknown> }>(
      "stryker.full.config.mjs",
    );
    // Every file a pull request's run mutates, but the build-time schema writers. The generated
    // tables are out of both by the shared list's `generated` rule.
    expect(base["mutate"]).toContain("!src/**/generated/**");
    expect(full["mutate"]).toEqual([...(base["mutate"] as string[]), "!src/serialize/schema/**"]);
    expect({ ...full, mutate: base["mutate"] }).toEqual(base);
    expect(full["ignoreStatic"]).toBe(true);
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(scripts["mutate:full"]).toBe("cosyte-mutate full --config stryker.full.config.mjs");
    const weekly = read(".github", "workflows", "weekly-mutation.yml");
    expect(weekly).toMatch(/^ {6}mutate-cmd: "pnpm mutate:full"$/mu);
    // Sharded: one runner cannot finish every file of src/ inside a job's time limit.
    expect(weekly).toMatch(/^ {6}shard-count: 8$/mu);
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

  /** Which sizes, in order, a pull request's comparison runs; a reading measures every one. */
  const COMPARED = [true, true, false, false, true, false];

  it("measures small to very large inputs, and compares only the sizes whose warmup settles", async () => {
    const { default: suite } = await importModule<{
      default: { name: string; benchmarks: Benchmark[] };
    }>("bench", "parse.bench.mjs");
    expect(suite.benchmarks.map((b) => b.name)).toEqual([
      "parseHL7",
      "parseHL7, then read MSH, PID, PV1 and five OBX",
      "parseHL7 with { lazy: false }",
      "parseHL7, then toString",
    ]);
    for (const benchmark of suite.benchmarks) {
      expect(benchmark.sizes.map((s) => s.label)).toEqual([
        "ADT^A01, 280 B",
        "ORU^R01, 32 KiB",
        "ORU^R01, 1 MiB",
        "ORU^R01, 4 MiB",
        "ORU^R01 with a base64 document, 1 MiB",
        "ORU^R01 with a base64 document, 4 MiB",
      ]);
      expect(benchmark.sizes.map((s) => s.compare)).toEqual(COMPARED);
    }
  });

  it("builds each corpus at its stated size, as messages the parser reads without a repair", async () => {
    const { default: suite } = await importModule<{
      default: { benchmarks: Benchmark[] };
    }>("bench", "parse.bench.mjs");
    const [parse] = suite.benchmarks;
    const expected = [280, 32 * 1024, 1024 * 1024, 4096 * 1024, 1024 * 1024, 4096 * 1024];
    expect(parse?.sizes.length).toBe(expected.length);
    for (const [i, size] of (parse?.sizes ?? []).entries()) {
      const corpus = size.build();
      const first = corpus.inputs[0] ?? "";
      expect(Buffer.byteLength(first) / (expected[i] ?? 1)).toBeGreaterThanOrEqual(1);
      expect(Buffer.byteLength(first) / (expected[i] ?? 1)).toBeLessThan(1.01);
      expect(corpus.bytes).toBe(corpus.inputs.reduce((n, t) => n + Buffer.byteLength(t), 0));
      // The large result reports are the same shape with more results; parsing them here would
      // make every mutant in the parser pay for a 4 MiB parse.
      if (size.compare) expect(parseHL7(first).warnings).toEqual([]);
    }
  });

  it("reads what most readers read, and finds it in every compared corpus", async () => {
    const { default: suite, readTypical } = await importModule<{
      default: { benchmarks: Benchmark[] };
      readTypical: (message: unknown) => number;
    }>("bench", "parse.bench.mjs");
    const [parse] = suite.benchmarks;
    const found = (parse?.sizes ?? [])
      .filter((size) => size.compare)
      .map((size) => readTypical(parseHL7(size.build().inputs[0] ?? "")));
    // ADT: MSH-10, PID-3 and PV1-3. Result report: MSH-10, PID-3 and five OBX-5. Document: MSH-10,
    // PID-3 and the note's OBX-5 (the document's OBX-5 starts with an empty component).
    expect(found).toEqual([3, 7, 3]);
  });

  it("carries its large document in one OBX of value type ED, as base64 the parser reads whole", async () => {
    const { documentMessage } = await importModule<{
      documentMessage: (i: number, bytes: number) => string;
    }>("bench", "parse.bench.mjs");
    const text = documentMessage(0, 64 * 1024);
    const message = parseHL7(text);
    expect(message.warnings).toEqual([]);
    const obx = message.segments("OBX")[1];
    expect(obx?.field(2).value).toBe("ED");
    const document = obx?.field(5).raw.repetitions[0]?.components[4]?.subcomponents[0] ?? "";
    expect(document).toMatch(/^[A-Za-z0-9+/]+$/u);
    expect(document.length).toBeGreaterThan(64 * 1000);
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

  it("ci.yml runs verify on Linux and macOS", () => {
    const ci = read(".github", "workflows", "ci.yml");
    expect(ci).toMatch(/^ {6}os: '\["ubuntu-latest", "macos-latest"\]'$/mu);
  });

  it("release.yml calls the shared release at the reference ci.yml uses, with every release gate on", () => {
    const release = read(".github", "workflows", "release.yml");
    const commit = sharedCommit(read(".github", "workflows", "ci.yml"), "ci.yml");
    expect(commit).toBeDefined();
    expect(sharedCommit(release, "release.yml")).toBe(commit);
    // The package checks and the docs samples run against the packed tarball before a publish.
    expect(release).toMatch(/^ {6}run-package-checks: true$/mu);
    expect(release).toMatch(/^ {6}run-tarball-samples: true$/mu);
    expect(release).toMatch(/^ {6}docs-dir: "docs-content"$/mu);
    // The weekly mutation gate is on by default: it reads weekly-mutation.yml, at most 8 days old.
    // Pointing it at another file or widening the age would loosen it, so neither input is set.
    expect(existsSync(join(WORKFLOWS, "weekly-mutation.yml"))).toBe(true);
    expect(release).not.toMatch(/^ {6}mutation-workflow:/mu);
    expect(release).not.toMatch(/^ {6}mutation-max-age-days:/mu);
  });
});
