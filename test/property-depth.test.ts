/**
 * Every property test runs at the depth the run asks for. The nightly job sets
 * `COSYTE_PROPERTY_RUNS` (10,000) and runs `test/property`; a property that calls `fc.assert`
 * with its own seed and count, or sits outside the folders that job runs, never reaches that
 * depth and never prints a seed to replay. This file reads the test sources and holds the line:
 *
 * - a property runs through `checkProperty` or `checkAsyncProperty` (`test/_helpers/property.ts`)
 *   or a runner from `@cosyte/test-utils`, never a bare `fc.assert` or `fc.check`;
 * - a literal case count or seed carries a `property-depth:` comment, on its line or the line
 *   above, saying why it is there (a pull-request depth other than the shared 100, a recorded
 *   regression replay, a generator sample);
 * - every file that runs a property is one the nightly job runs.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const testDir = join(root, "test");

/** A path from the repository root with forward slashes, as the lists below and the workflow write it. */
function fromRoot(path: string): string {
  return relative(root, path).split(sep).join("/");
}

const self = fromRoot(import.meta.filename);

/** Every TypeScript file under `test/`, as a path from the repository root. */
function testSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "fixtures") out.push(...testSources(path));
    } else if (entry.name.endsWith(".ts")) {
      out.push(fromRoot(path));
    }
  }
  return out.sort();
}

/**
 * The runner and its own test are the two files allowed to call fast-check directly and to fix a
 * count: one is the shared runner, the other checks it on properties built to fail.
 */
const RUNNER = ["test/_helpers/property.ts", "test/property-runner.test.ts"];

const sources = testSources(testDir).filter((path) => path !== self && !RUNNER.includes(path));

/** The lines of a file, numbered from 1. */
function linesOf(path: string): { line: number; text: string; above: string }[] {
  const lines = readFileSync(join(root, path), "utf8").split("\n");
  return lines.map((text, i) => ({ line: i + 1, text, above: lines[i - 1] ?? "" }));
}

/** `path:line` for every line matching `pattern` with no `property-depth:` note beside it. */
function unexplained(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const path of sources) {
    for (const { line, text, above } of linesOf(path)) {
      if (!pattern.test(text)) continue;
      if (text.includes("property-depth:") || above.includes("property-depth:")) continue;
      hits.push(`${path}:${String(line)}`);
    }
  }
  return hits;
}

/** The paths the nightly job's `test-cmd` hands to Vitest. */
function nightlyPaths(): string[] {
  const workflow = readFileSync(join(root, ".github/workflows/nightly-properties.yml"), "utf8");
  const command = /test-cmd:\s*"([^"]+)"/u.exec(workflow)?.[1];
  expect(command, "the nightly workflow names a test-cmd").toBeDefined();
  const words = (command ?? "").split(/\s+/u);
  const run = words.indexOf("run");
  expect(words.slice(0, run + 1)).toEqual(["pnpm", "exec", "vitest", "run"]);
  return words.slice(run + 1).filter((word) => !word.startsWith("-"));
}

/** A call that runs a property: the shared helpers, or the kit's own runners. */
const RUNS_A_PROPERTY =
  /\b(checkProperty|checkAsyncProperty|assertProperty|roundTripProperty|idempotentNormalizeProperty|lenientNeverThrowsProperty|immutabilityProperty)\(/u;

describe("property tests run at the shared depth", () => {
  it("never call fc.assert or fc.check directly", () => {
    expect(unexplained(/\bfc\.(assert|check)\(/u)).toEqual([]);
  });

  it("set no case count without saying why", () => {
    expect(unexplained(/\bnumRuns\b\s*[:=]\s*\d/u)).toEqual([]);
  });

  it("set no seed without saying why", () => {
    expect(unexplained(/\bseed\b\s*[:=]\s*-?\d/u)).toEqual([]);
  });

  it("read no depth variable but the shared one", () => {
    const own = sources.filter((path) =>
      /process\.env\[?["'.]?\w*PROPERTY_RUNS/u.test(readFileSync(join(root, path), "utf8")),
    );
    expect(own).toEqual([]);
  });

  it("all sit where the nightly job runs them", () => {
    const paths = nightlyPaths();
    const reached = (file: string): boolean =>
      paths.some((path) => file === path || file.startsWith(`${path.replace(/\/$/u, "")}/`));
    const running = sources.filter(
      (path) =>
        path.endsWith(".test.ts") && RUNS_A_PROPERTY.test(readFileSync(join(root, path), "utf8")),
    );
    expect(running.length).toBeGreaterThan(25);
    expect(running.filter((path) => !reached(path))).toEqual([]);
  });
});
