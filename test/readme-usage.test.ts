import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fences, fixturesByContent, messageLiteral, section } from "./_helpers/first-use.js";

/**
 * The `## Usage` example in README.md is EXECUTED here, and the output block printed beside it in
 * the file is the assertion. An npm README is frozen at publish, so a wrong example there cannot be
 * corrected short of another release.
 *
 * The block is READ OUT OF README.md at test time, never copied into this file: a copy would drift
 * from the page it documents. It runs in a subprocess against `src/index.ts`, the single file the
 * bundler compiles into the published entry point, with only the `@cosyte/hl7` specifier rewritten
 * (and that rewrite counted). Running against the source rather than `dist/` keeps this suite out
 * of the `dist/` rebuild `test/docs-content.test.ts` performs in parallel.
 *
 * SECURITY: the subprocess is spawned with spawnSync and array args; no shell.
 */
const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const entryPoint = join(root, "src", "index.ts");
const tsx = join(root, "node_modules", ".bin", "tsx");
const PUBLISHED_SPECIFIER = '"@cosyte/hl7"';
const CASE_TIMEOUT = 120_000;

const usage = fences(section(readme, "## Usage"));
const example = usage[0];
const shown = usage[1];

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hl7-readme-usage-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(source: string, fileName: string): { code: number; stdout: string; stderr: string } {
  expect(source.split(PUBLISHED_SPECIFIER).length - 1, "imports @cosyte/hl7 exactly once").toBe(1);
  const path = join(dir, fileName);
  writeFileSync(
    path,
    `${source.replace(PUBLISHED_SPECIFIER, JSON.stringify(entryPoint))}\n`,
    "utf8",
  );
  const r = spawnSync(tsx, [path], { cwd: root, encoding: "utf8", shell: false, timeout: 60_000 });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe("the README ## Usage example", () => {
  it("AC-HL2: the first block under ## Usage is the TypeScript example, the next its output", () => {
    expect(example?.lang).toBe("ts");
    expect(shown?.lang).toBe("text");
    expect(example?.body).toContain(`from ${PUBLISHED_SPECIFIER};`);
  });

  it(
    "AC-HL2: runs, and prints exactly the output the README shows beside it",
    () => {
      const r = run(example?.body ?? "", "usage.mts");
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
      expect(r.stdout).toBe(`${shown?.body ?? ""}\n`);
    },
    CASE_TIMEOUT,
  );

  it("AC-HL4: its message is a byte-for-byte copy of a fixture under test/fixtures", () => {
    const message = messageLiteral(example?.body ?? "");
    expect(message).toBeDefined();
    const fixtures = fixturesByContent(root, join(root, "test", "fixtures"));
    expect(fixtures.get(message ?? "")).toBeDefined();
  });

  it(
    "AC-HL3: a changed input value changes the output and leaves the fixture corpus",
    () => {
      const body = example?.body ?? "";
      expect(body.split("ICU^101").length - 1, "the example carries one ICU^101").toBe(1);
      const mutated = body.replace("ICU^101", "CCU^101");
      const fixtures = fixturesByContent(root, join(root, "test", "fixtures"));
      expect(fixtures.get(messageLiteral(mutated) ?? "")).toBeUndefined();
      const r = run(mutated, "usage-control.mts");
      expect(r.code).toBe(0);
      expect(r.stdout).not.toBe(`${shown?.body ?? ""}\n`);
      expect(r.stdout).toBe(`${shown?.body ?? ""}\n`.replace("Ward: ICU", "Ward: CCU"));
    },
    CASE_TIMEOUT,
  );
});
