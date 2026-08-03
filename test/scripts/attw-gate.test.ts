/**
 * Tests for scripts/attw.mjs: the wrapper that makes the `attw` publish gate
 * report its own failure.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS HERE:
 *
 *  1. THE FALSE GREEN ITSELF, on the invocation this repo used to run. `attw`
 *     prints "This package does not contain types." and exits **0**, both when
 *     the declarations were left out of the tarball and when the build never
 *     produced them. A fix whose test only shows green on a good pack proves
 *     nothing, so the defect is asserted here before the remedy is. If a future
 *     `attw` upgrade fixes that exit code or rewords the sentence, these two
 *     tests red, which is the point: a guard that silently stops matching is
 *     worse than no guard, and the sentence is the one net in `attw.mjs` that
 *     depends on a string.
 *  2. That the wrapper turns that exit 0 into a failure, on both shapes.
 *  3. That the preflight names the missing file, which is what makes a red
 *     actionable rather than a puzzle.
 *  4. A NEGATIVE CONTROL. On a package whose tarball really does carry types the
 *     wrapper is transparent: same exit status as `attw` itself, and green. A
 *     gate that only ever fails is not a gate, and a false red here would cost
 *     every later run an hour.
 *  5. THE GATE'S MOST BASIC OBLIGATION: that a real `attw` failure still fails.
 *     Without this, every other test here would pass on a wrapper that swallowed
 *     attw's own exit status, because net 2 reds the untyped fixture regardless.
 *  6. The refusals that keep net 2 readable. Each of these argument and config
 *     routes was measured against this repo's own untyped tree to hide the
 *     sentence and hand back exit 0, which is the exact false green this file
 *     exists to close.
 *
 * The fixtures are minimal throwaway packages in a temp dir. Nothing here touches
 * this repo's own build, so the suite does not need one and cannot race one.
 * `attw` is invoked with `--no-definitely-typed` so the runs stay offline; the
 * wrapper forwards arguments, which is what makes that possible.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const WRAPPER = join(REPO_ROOT, "scripts", "attw.mjs");
const ATTW_BIN = join(REPO_ROOT, "node_modules", ".bin", "attw");
const UNTYPED = "This package does not contain types.";
const OFFLINE = ["--no-definitely-typed"];
// Each case shells out to `attw --pack`, which runs a real `npm pack`; two of
// those in one test comfortably exceeds this suite's 10s default.
const SPAWN_TIMEOUT = 120_000;

interface RunResult {
  code: number;
  out: string;
}

function run(bin: string, args: string[], cwd: string): RunResult {
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 100_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const runAttw = (cwd: string): RunResult => run(ATTW_BIN, ["--pack", ".", ...OFFLINE], cwd);
const runWrapper = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(process.execPath, [WRAPPER, ...args], cwd);

let root: string;

/** A package whose declaration file exists on disk but is left out of `files`. */
let typesNotPacked: string;
/** A package whose `package.json` points at a `dist/` that was never built. */
let noBuild: string;
/** A well-formed dual ESM/CJS package: the negative control. */
let wellFormed: string;
/** A package with a real attw problem: `require` resolves to ESM. */
let attwFails: string;
/** Declarations present, JS entry point missing: attw itself is green on this. */
let jsMissing: string;

function writePkg(dir: string, pkg: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "attw-gate-"));

  typesNotPacked = join(root, "types-not-packed");
  writePkg(
    typesNotPacked,
    {
      name: "attw-gate-fixture-unpacked",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": "export declare const a: number;\n" },
  );

  noBuild = join(root, "no-build");
  writePkg(
    noBuild,
    {
      name: "attw-gate-fixture-nobuild",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      files: ["dist"],
    },
    {},
  );

  wellFormed = join(root, "well-formed");
  writePkg(
    wellFormed,
    {
      name: "attw-gate-fixture-wellformed",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": {
          import: { types: "./index.d.ts", default: "./index.js" },
          require: { types: "./index.d.cts", default: "./index.cjs" },
        },
      },
      files: ["index.js", "index.d.ts", "index.cjs", "index.d.cts"],
    },
    {
      "index.js": "export const a = 1;\n",
      "index.d.ts": "export declare const a: number;\n",
      "index.cjs": "module.exports.a = 1;\n",
      "index.d.cts": "export declare const a: number;\n",
    },
  );

  // ESM-only, with no `require` condition: attw's default profile reports
  // CJSResolvesToESM and exits non-zero of its own accord.
  attwFails = join(root, "attw-fails");
  writePkg(
    attwFails,
    {
      name: "attw-gate-fixture-problem",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": "export const a = 1;\n", "index.d.ts": "export declare const a: number;\n" },
  );

  jsMissing = join(root, "js-missing");
  writePkg(
    jsMissing,
    {
      name: "attw-gate-fixture-jsmissing",
      version: "1.0.0",
      main: "./dist/index.js",
      types: "./index.d.ts",
      files: ["index.d.ts"],
    },
    { "index.d.ts": "export declare const a: number;\n" },
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the false green this wrapper exists to close", () => {
  it(
    "bare attw reports an untyped pack and still exits 0",
    () => {
      const r = runAttw(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      // If this ever fails because the status is now non-zero, attw has fixed the
      // early return in getExitCode() and net 2 of scripts/attw.mjs is redundant.
      // Read that file's header before deleting anything.
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "bare attw exits 0 when the declarations were never built, which is the shape a concurrent build produces",
    () => {
      const r = runAttw(noBuild);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("scripts/attw.mjs", () => {
  it(
    "fails when the tarball carries no types, where attw exits 0",
    () => {
      const r = runWrapper(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).not.toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails, naming the file, when a declared artifact was never built",
    () => {
      const r = runWrapper(noBuild);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("missing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails when a declared artifact is present but empty, which a truncated write leaves behind",
    () => {
      const dir = join(root, "empty-declaration");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-empty",
          version: "1.0.0",
          main: "./index.js",
          types: "./index.d.ts",
          files: ["index.js", "index.d.ts"],
        },
        { "index.js": "module.exports = {};\n", "index.d.ts": "" },
      );
      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./index.d.ts");
      expect(r.out).toContain("empty");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "catches a declared artifact written WITHOUT a leading ./, which is legal and is the npm docs' spelling",
    () => {
      // `exports` targets must start with `./`, but main/module/types/typings are
      // relative to the package root either way. A guard that skipped a bare path
      // dropped exactly those four fields with no output at all, which would leave
      // the preflight narrower than every sentence describing it.
      const dir = join(root, "bare-relative-paths");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-barepaths",
          version: "1.0.0",
          main: "dist/index.js",
          types: "dist/index.d.ts",
          files: ["dist"],
        },
        {},
      );
      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).toContain("missing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses a manifest that declares no artifacts at all, rather than passing a preflight that checked nothing",
    () => {
      const dir = join(root, "declares-nothing");
      writePkg(dir, { name: "attw-gate-fixture-nothing", version: "1.0.0" }, {});
      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("checked nothing");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not claim attw would have said 'untyped' when only JS is missing",
    () => {
      // Measured: with the declarations intact, bare attw reports no problems and
      // exits 0 on this fixture. The preflight still reds it, but must not tell the
      // reader something about attw's behaviour that is false for this case.
      const bare = runAttw(jsMissing);
      expect(bare.out).toContain("No problems found");
      expect(bare.code).toBe(0);
      const r = runWrapper(jsMissing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "still fails when attw itself fails, with attw's own status",
    () => {
      const bare = runAttw(attwFails);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);
      const wrapped = runWrapper(attwFails);
      expect(wrapped.code).toBe(bare.code);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "is transparent on a package that really does ship types",
    () => {
      const bare = runAttw(wellFormed);
      const wrapped = runWrapper(wellFormed);
      expect(bare.out).not.toContain(UNTYPED);
      expect(wrapped.code).toBe(bare.code);
      expect(wrapped.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("the refusals that keep the post-check readable", () => {
  // Each of these was measured against this package's own untyped tree to make
  // bare attw exit 0 with the untyped sentence unreadable. The three bundled
  // short forms are `--format json` and `--quiet` in another spelling:
  // `commander` lets short options cluster and lets a value ride on the end. A
  // guard that matched whole tokens let `-fjson` and `-Pf json` through to exit 0
  // on the fixture below, which is why short options are matched by LETTER
  // ANYWHERE IN THE CLUSTER rather than by token.
  it.each([
    ["--quiet", ["--quiet"]],
    ["-q", ["-q"]],
    ["--format json", ["--format", "json"]],
    ["-f json", ["-f", "json"]],
    ["--format=json", ["--format=json"]],
    ["-fjson", ["-fjson"]],
    ["-qP", ["-qP"]],
    ["-Pf json", ["-Pf", "json"]],
    ["--config-path", ["--config-path", "other.json"]],
    // Not blinding: these exit 0 with a non-empty transcript and no untyped
    // sentence, either without analysing anything at all or by merging external
    // declarations into the analysis. Neither net can tell that from a pass.
    ["--help", ["--help"]],
    ["-h", ["-h"]],
    ["--version", ["--version"]],
    ["-V", ["-V"]],
    ["--definitely-typed", ["--definitely-typed", "4.9"]],
  ])("refuses %s", (_name, extra) => {
    const r = runWrapper(typesNotPacked, [...OFFLINE, ...extra]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("attw gate");
    expect(r.out).not.toContain("🌟");
  });

  it(
    "was right to refuse the bundled short forms: bare attw hides the sentence and exits 0 on one",
    () => {
      // The refusals are only worth their over-strictness if the routes are real.
      // This asserts the route rather than the guard: on the fixture whose tarball
      // carries no types, `-fjson` gets exit 0 with nothing for the post-check to
      // read.
      const r = run(ATTW_BIN, ["--pack", ".", ...OFFLINE, "-fjson"], typesNotPacked);
      expect(r.code).toBe(0);
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not refuse the option forms that blind nothing",
    () => {
      // The control on a wholesale refusal: it would be a false-red generator if it
      // reached past the options that actually hide the sentence. Measured on this
      // package's own untyped tree, each of these still prints it.
      const r = runWrapper(wellFormed, [
        ...OFFLINE,
        "--no-summary",
        "--no-emoji",
        "--no-color",
        "--profile",
        "node16",
      ]);
      expect(r.out).not.toContain("attw gate");
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "refuses a .attw.json that sets quiet or format",
    () => {
      const dir = join(root, "config-blinded");
      writePkg(
        dir,
        {
          name: "attw-gate-fixture-configblind",
          version: "1.0.0",
          main: "./index.js",
          types: "./index.d.ts",
          files: ["index.js"],
        },
        {
          "index.js": "module.exports = {};\n",
          "index.d.ts": "export declare const a: number;\n",
          ".attw.json": JSON.stringify({ quiet: true }),
        },
      );
      // Bare attw takes the config and goes silent: exit 0 over an untyped pack.
      const bare = runAttw(dir);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(".attw.json");
    },
    SPAWN_TIMEOUT,
  );
});

describe("the starter kit ships the same gate", () => {
  // The census that matters is manifests, not repo roots: this repo carries two
  // package.json files with an `attw` script, and examples/profile-starter-kit is
  // a template a consumer copies out and publishes from. Leaving the bare CLI
  // there would re-mint the false green in every package generated from the kit.
  it("invokes the wrapper rather than the bare CLI, in every manifest that has an attw script", () => {
    const manifests = ["package.json", "examples/profile-starter-kit/package.json"];
    for (const rel of manifests) {
      const raw = readFileSync(join(REPO_ROOT, rel), "utf8");
      const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {};
      expect(scripts["attw"], `${rel} has no attw script`).toBeDefined();
      expect(scripts["attw"], `${rel} still runs the bare CLI`).toBe("node scripts/attw.mjs");
      const wrapper = join(REPO_ROOT, rel.replace(/package\.json$/, "scripts/attw.mjs"));
      expect(existsSync(wrapper), `${wrapper} is missing`).toBe(true);
    }
  });

  it("carries a byte-identical implementation, so the tests above cover both copies", () => {
    // Two copies of a gate drift, and the kit's copy is executed by nothing in
    // this repo's CI: the kit job runs typecheck/lint/test/build, and installing
    // its dependencies inside the unit-test job to run its wrapper directly would
    // cost more than it proves. Pinning the code identical is what makes every
    // behavioural test above true of the kit as well. Only the docblock differs,
    // because one is written for a maintainer here and the other for a consumer
    // who copied the kit out.
    const MARKER = 'import { spawnSync } from "node:child_process";';
    const bodyOf = (rel: string): string => {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      const at = src.indexOf(MARKER);
      expect(at, `${rel} does not contain the import marker`).toBeGreaterThan(-1);
      return src.slice(at);
    };
    expect(bodyOf("examples/profile-starter-kit/scripts/attw.mjs")).toBe(
      bodyOf("scripts/attw.mjs"),
    );
  });
});
