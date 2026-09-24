/**
 * The docs-artifact build, run the way the release runs it, against the canonical entry point this
 * repository now uses in place of its own copy.
 *
 * WHY THIS FILE EXISTS. The shared release pipeline runs `pnpm pack:docs` and hands the two archives
 * it writes to the docs site. An archive that silently loses members publishes a documentation set
 * with holes in it, and a refused run that leaves a half-built artifact set behind hands the release
 * job something to upload anyway. This repository used to build both archives with its own shell
 * script and now runs `cosyte-process pack-docs` from the pinned `@cosyte/process`.
 *
 * WHAT IS COMPARED. FILE members only. The retired script shelled out to `tar`, which also emits
 * directory entries; the canonical writes the archives itself and emits none. Before the swap the
 * two produced identical file member sets over this tree (measured in the S0345 implementation
 * notes), so the expectation here is derived from the tree itself: every file under
 * `docs-content/` with that prefix stripped, and every file under `src/` plus `package.json` and
 * `tsconfig.json`.
 *
 * Every run writes into a temp directory, never into this checkout, and every subprocess call uses
 * `spawnSync` with array arguments.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { canonicalBinPath, type EntryPointRun } from "../_helpers/sync-version-fixture.js";

const REPO_ROOT = process.cwd();
const SLOW = 60_000;

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

/**
 * The `pack:docs` package script's own argv, read from the manifest, so a change to what the script
 * runs reaches this file rather than leaving it grading a command the release no longer runs.
 */
function packDocsArgs(): string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) {
    throw new Error("package.json carries no `scripts`");
  }
  const { scripts } = parsed;
  if (typeof scripts !== "object" || scripts === null) {
    throw new Error("`scripts` is not an object");
  }
  const body: unknown = Object.entries(scripts).find(([name]) => name === "pack:docs")?.[1];
  if (typeof body !== "string") throw new Error("package.json carries no `pack:docs` script");
  const [bin, ...args] = body.split(" ");
  if (bin !== "cosyte-process") {
    throw new Error(`\`pack:docs\` no longer runs cosyte-process: ${body}`);
  }
  return args;
}

function runPackDocs(cwd: string, extra: readonly string[]): EntryPointRun {
  const result = spawnSync(process.execPath, [canonicalBinPath(), ...packDocsArgs(), ...extra], {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: SLOW,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Every regular file under `dir`, relative to it, with forward slashes. */
function filesUnder(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(join(dir, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

/** The FILE members of a gzipped tarball, directory entries dropped and `./` prefixes removed. */
function fileMembers(archive: string): string[] {
  const listed = spawnSync("tar", ["-tzf", archive], {
    encoding: "utf8",
    shell: false,
    timeout: SLOW,
  });
  expect(listed.status, listed.stderr).toBe(0);
  return listed.stdout
    .split("\n")
    .map((line) => line.replace(/^\.\//, ""))
    .filter((line) => line !== "" && !line.endsWith("/"))
    .sort();
}

describe("AC-10: pack:docs over this tree writes the two archives with the expected file members", () => {
  it("AC-10: both archives carry exactly the files of their inputs", { timeout: SLOW }, () => {
    const out = join(tempDir("hl7-pack-docs-"), "artifacts");
    const run = runPackDocs(REPO_ROOT, [out]);
    expect(run.status, run.stderr).toBe(0);

    const expectedDocs = filesUnder(join(REPO_ROOT, "docs-content")).sort();
    const expectedSource = [
      ...filesUnder(join(REPO_ROOT, "src")).map((path) => `src/${path}`),
      "package.json",
      "tsconfig.json",
    ].sort();

    // A floor first, so an empty tree walk can never make the equalities below pass vacuously.
    expect(expectedDocs).toContain("intro.md");
    expect(expectedDocs).toContain("sidebars.json");
    expect(expectedSource).toContain("src/index.ts");

    expect(fileMembers(join(out, "docs-content.tar.gz"))).toEqual(expectedDocs);
    expect(fileMembers(join(out, "source.tar.gz"))).toEqual(expectedSource);
  });
});

describe("AC-11: a missing input refuses and leaves nothing behind", () => {
  const INPUTS: readonly string[] = [
    "docs-content/intro.md",
    "docs-content/sidebars.json",
    "src",
    "package.json",
    "tsconfig.json",
  ];

  /** A minimal complete tree: the five inputs and nothing else. No clinical content. */
  function completeTree(): string {
    const dir = tempDir("hl7-pack-docs-refusal-");
    mkdirSync(join(dir, "docs-content"));
    writeFileSync(join(dir, "docs-content", "intro.md"), "# Intro\n");
    writeFileSync(join(dir, "docs-content", "sidebars.json"), "{}\n");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), 'export const VERSION: string = "0.0.1";\n');
    writeFileSync(join(dir, "package.json"), '{ "name": "fixture", "private": true }\n');
    writeFileSync(join(dir, "tsconfig.json"), "{}\n");
    return dir;
  }

  it("AC-11 control: the complete tree builds both archives", { timeout: SLOW }, () => {
    // Without this, a build that refused every tree would pass every case below.
    const dir = completeTree();
    const run = runPackDocs(dir, []);
    expect(run.status, run.stderr).toBe(0);
    expect(existsSync(join(dir, "dist-artifacts", "docs-content.tar.gz"))).toBe(true);
    expect(existsSync(join(dir, "dist-artifacts", "source.tar.gz"))).toBe(true);
  });

  for (const missing of INPUTS) {
    it(`AC-11: refuses without ${missing}`, { timeout: SLOW }, () => {
      const dir = completeTree();
      rmSync(join(dir, missing), { recursive: true, force: true });
      const before = filesUnder(dir).sort();

      // No argument, so the run targets the default output directory the release uses.
      const run = runPackDocs(dir, []);

      expect(run.status).not.toBe(0);
      expect(run.status).not.toBeNull();
      // The action text lists all five inputs, so a bare `toContain(missing)` would pass on a
      // refusal that named the wrong one. The diagnostic's own "missing required input" head is
      // what singles the absent input out.
      expect(run.stderr).toContain(`missing required input: ${missing}`);
      expect(existsSync(join(dir, "dist-artifacts"))).toBe(false);
      expect(filesUnder(dir).sort()).toEqual(before);
      expect(filesUnder(dir).filter((path) => path.endsWith(".tar.gz"))).toEqual([]);
    });
  }
});
