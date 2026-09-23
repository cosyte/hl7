/**
 * Tests for the `attw` publish gate as this repository runs it: `scripts/attw.mjs`, a CALLER of
 * the shared body published as `@cosyte/script-utils/attw`.
 *
 * The gate's nets, its argument allow-list and the measurements behind them are documented once,
 * in the docblock at the top of `node_modules/@cosyte/script-utils/attw.js`, and are not restated
 * here. What this suite grades is what this repository relies on the gate for, each behavioural
 * case on a throwaway package built in a temp dir and each one paired with a control, so a gate
 * that always fails cannot pass it:
 *
 *   - the false greens bare `attw` hands back, closed (a tarball with no types, a declared file
 *     missing or empty on disk, a `publishConfig` override naming a file the tarball lacks);
 *   - the controls (a well-formed package is green, a real `attw` finding keeps attw's status);
 *   - the argument allow-list (every measured blinding spelling refused, `--profile node16`
 *     accepted);
 *   - that no second copy of the gate lives in this repository, and that every manifest carrying
 *     an `attw` script, derived rather than recalled, runs the caller at the same pinned version;
 *   - that the caller fails closed when the shared body cannot be reached.
 *
 * The real `attw` binary, `npm` and `pnpm` run in every behavioural case; nothing is doubled.
 * `attw` is invoked with `--no-definitely-typed` so the runs stay offline.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec, no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO_ROOT = process.cwd();
const CALLER = join(REPO_ROOT, "scripts", "attw.mjs");
const ATTW_BIN = join(REPO_ROOT, "node_modules", ".bin", "attw");
const SPECIFIER = "@cosyte/script-utils/attw";
const OFFLINE = ["--no-definitely-typed"];
/** The shared body's pass line and refusal prefix. */
const PASS = "✓ attw gate";
const REFUSAL = "✗ attw gate";
/** Three dot-separated numbers: no range, tag, path, protocol or workspace specifier. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
// Each gate run shells out to `attw --pack` (a real `npm pack`), then `npm pack --dry-run`, and,
// when the manifest sets `publishConfig`, a real `pnpm pack`. Two runs in one case comfortably
// exceed this suite's 10s default.
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
const runGate = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(process.execPath, [CALLER, ...args], cwd);

/** The string at `obj[path[0]][path[1]]...`, or undefined when a step is absent or not that shape. */
function stringAt(obj: unknown, ...path: string[]): string | undefined {
  let node: unknown = obj;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = Reflect.get(node, key);
  }
  return typeof node === "string" ? node : undefined;
}

function readJson(path: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parsed;
}

/** Every file under `dir`, as paths relative to the repository root. */
function filesUnder(dir: string): string[] {
  const abs = join(REPO_ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...filesUnder(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** Every `package.json` in the repository outside `node_modules`, relative to the root. */
function manifestsUnder(dir = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...manifestsUnder(rel));
    else if (entry.name === "package.json") out.push(rel);
  }
  return out;
}

let root: string;

/** A package whose declaration file exists on disk but is left out of `files`. */
let typesNotPacked: string;
/** A package whose `package.json` points at a `dist/` that was never built. */
let noBuild: string;
/** A package whose declared declaration file is present but empty. */
let emptyDeclaration: string;
/** A well-formed dual ESM/CJS package: the control. */
let wellFormed: string;
/** A package with a real attw problem: `require` resolves to ESM. */
let attwFails: string;
/** Well-formed on disk and to npm, but `publishConfig` rewrites `main` to a file not packed. */
let publishOverride: string;

function writePkg(dir: string, pkg: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
}

const DUAL_EXPORTS = {
  ".": {
    import: { types: "./index.d.ts", default: "./index.js" },
    require: { types: "./index.d.cts", default: "./index.cjs" },
  },
};
const DUAL_FILES = {
  "index.js": "export const a = 1;\n",
  "index.d.ts": "export declare const a: number;\n",
  "index.cjs": "module.exports.a = 1;\n",
  "index.d.cts": "export declare const a: number;\n",
};

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

  emptyDeclaration = join(root, "empty-declaration");
  writePkg(
    emptyDeclaration,
    {
      name: "attw-gate-fixture-empty",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": "" },
  );

  wellFormed = join(root, "well-formed");
  writePkg(
    wellFormed,
    {
      name: "attw-gate-fixture-wellformed",
      version: "1.0.0",
      type: "module",
      exports: DUAL_EXPORTS,
      files: Object.keys(DUAL_FILES),
    },
    DUAL_FILES,
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

  // Every declared path is on disk and packed, so npm's tarball is sound and bare attw is green.
  // pnpm applies `publishConfig` as publish-time overrides and npm does not, so the manifest pnpm
  // would publish names `./absent-override.cjs`, which no tarball carries.
  publishOverride = join(root, "publish-override");
  writePkg(
    publishOverride,
    {
      name: "attw-gate-fixture-publishconfig",
      version: "1.0.0",
      type: "module",
      main: "./index.cjs",
      exports: DUAL_EXPORTS,
      files: Object.keys(DUAL_FILES),
      publishConfig: { main: "./absent-override.cjs" },
    },
    DUAL_FILES,
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("AC-2: the gate is the published body, and no second copy lives here", () => {
  it(
    "AC-2: scripts/attw.mjs resolves the published package and runs its body",
    () => {
      const resolved = createRequire(CALLER).resolve(SPECIFIER).replaceAll("\\", "/");
      expect(resolved).toContain("/node_modules/");
      expect(resolved.endsWith("/@cosyte/script-utils/attw.js")).toBe(true);
      const published = readJson(join(dirname(resolved), "package.json"));
      const pinned = stringAt(
        readJson(join(REPO_ROOT, "package.json")),
        "devDependencies",
        "@cosyte/script-utils",
      );
      expect(stringAt(published, "name")).toBe("@cosyte/script-utils");
      expect(stringAt(published, "version")).toBe(pinned);

      // The shared body prints this pass line; the local body this replaced never did.
      const r = runGate(wellFormed);
      expect(r.out).toContain(`${PASS}: attw-gate-fixture-wellformed@1.0.0`);
    },
    SPAWN_TIMEOUT,
  );

  it("AC-2: no file under scripts/ or examples/*/scripts/ carries a local implementation", () => {
    const examples = readdirSync(join(REPO_ROOT, "examples"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `examples/${e.name}/scripts`);
    const files = [...filesUnder("scripts"), ...examples.flatMap((d) => filesUnder(d))];
    expect(files, "nothing was scanned").toContain("scripts/attw.mjs");

    const offenders: string[] = [];
    for (const rel of files) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      if (src.includes("This package does not contain types.")) {
        offenders.push(`${rel}: the untyped-sentence literal`);
      }
      if (
        /\bspawnSync\b/.test(src) &&
        /\.bin\/attw|ATTW_BIN|spawnSync\(\s*["'`]attw["'`]/.test(src)
      ) {
        offenders.push(`${rel}: a spawnSync call on an attw binary`);
      }
      if (
        /REFUSED_(?:LONG|SHORT)|["'`]--(?:quiet|format|config-path|definitely-typed)["'`]/.test(src)
      ) {
        offenders.push(`${rel}: a locally-defined refused-option list`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("AC-3 to AC-7: the false greens closed, and the controls that keep it a gate", () => {
  it(
    "AC-3: fails when the declared .d.ts is on disk but excluded from the tarball, where bare attw exits 0",
    () => {
      const bare = runAttw(typesNotPacked);
      expect(bare.code).toBe(0);
      const r = runGate(typesNotPacked);
      expect(r.code).not.toBe(0);
      expect(r.out).not.toContain(PASS);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "AC-4: fails, naming the path verbatim, when a declared artifact does not exist",
    () => {
      const r = runGate(noBuild);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).not.toContain(PASS);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "AC-4: fails, naming the path verbatim, when a declared artifact is empty",
    () => {
      const r = runGate(emptyDeclaration);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./index.d.ts");
      expect(r.out).not.toContain(PASS);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "AC-5: fails when publishConfig rewrites a declared path to a file the published tarball lacks",
    () => {
      // Bare attw packs through npm, which leaves publishConfig alone, so it sees nothing wrong.
      const bare = runAttw(publishOverride);
      expect(bare.code).toBe(0);
      const r = runGate(publishOverride);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./absent-override.cjs");
      expect(r.out).not.toContain(PASS);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "AC-6: passes a well-formed dual package that ships its declarations, with bare attw's status",
    () => {
      const bare = runAttw(wellFormed);
      const r = runGate(wellFormed);
      expect(bare.code).toBe(0);
      expect(r.code).toBe(bare.code);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "AC-7: a real attw finding exits with attw's own non-zero status",
    () => {
      const bare = runAttw(attwFails);
      expect(bare.code).not.toBe(0);
      const r = runGate(attwFails);
      expect(r.code).toBe(bare.code);
      expect(r.out).not.toContain(PASS);
    },
    SPAWN_TIMEOUT,
  );
});

describe("AC-8 and AC-9: the argument allow-list", () => {
  // Each row is refused on the WELL-FORMED package, so the refusal is the only reason for a red.
  // The bundled short forms are the load-bearing rows: `commander` lets short options cluster
  // and lets a value ride on the end, and a guard matching whole tokens was measured to hand back
  // exit 0 on `-fjson` and `-Pf json`.
  it.each([
    ["--quiet", ["--quiet"]],
    ["-q", ["-q"]],
    ["--format json", ["--format", "json"]],
    ["-f json", ["-f", "json"]],
    ["--format=json", ["--format=json"]],
    ["-fjson", ["-fjson"]],
    ["-qP", ["-qP"]],
    ["-Pf json", ["-Pf", "json"]],
    ["--config-path other.json", ["--config-path", "other.json"]],
    ["--help", ["--help"]],
    ["-h", ["-h"]],
    ["--version", ["--version"]],
    ["-V", ["-V"]],
    ["--definitely-typed 4.9", ["--definitely-typed", "4.9"]],
  ])("AC-8: refuses %s with exit 1 and no pass", (_name, extra) => {
    const r = runGate(wellFormed, [...OFFLINE, ...extra]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(REFUSAL);
    expect(r.out).not.toContain(PASS);
  });

  it(
    "AC-9: accepts --profile node16 --no-definitely-typed on the well-formed package",
    () => {
      const r = runGate(wellFormed, ["--profile", "node16", "--no-definitely-typed"]);
      expect(r.code).toBe(0);
      expect(r.out).not.toContain(REFUSAL);
    },
    SPAWN_TIMEOUT,
  );
});

describe("AC-10: every manifest with an attw script runs the caller", () => {
  it("AC-10: the census is derived, and each member runs the caller at the root's exact pin", () => {
    const census = manifestsUnder().filter(
      (rel) => stringAt(readJson(join(REPO_ROOT, rel)), "scripts", "attw") !== undefined,
    );
    expect(census, "the root manifest carries an attw script").toContain("package.json");

    const rootPin = stringAt(
      readJson(join(REPO_ROOT, "package.json")),
      "devDependencies",
      "@cosyte/script-utils",
    );
    expect(rootPin, "the root does not pin @cosyte/script-utils exactly").toMatch(EXACT_VERSION);

    for (const rel of census) {
      const pkg = readJson(join(REPO_ROOT, rel));
      expect(stringAt(pkg, "scripts", "attw"), `${rel} attw script`).toBe("node scripts/attw.mjs");
      const caller = join(REPO_ROOT, rel.replace(/package\.json$/, "scripts/attw.mjs"));
      expect(existsSync(caller), `${caller} is missing`).toBe(true);
      const src = readFileSync(caller, "utf8");
      expect(src, `${caller} does not import ${SPECIFIER}`).toMatch(
        /["']@cosyte\/script-utils\/attw["']/,
      );
      expect(src, `${caller} does not pass its own import.meta.url`).toMatch(
        /runAttwGate\(\{\s*callerUrl:\s*import\.meta\.url\s*\}\)/,
      );
      expect(stringAt(pkg, "devDependencies", "@cosyte/script-utils"), `${rel} pin`).toBe(rootPin);
    }
  });
});

describe("AC-14: the caller fails closed when the shared body cannot be reached", () => {
  // A package holding a copy of each caller, beside a `@cosyte/script-utils` whose `exports` has
  // no `./attw` (the shape of every version before the subpath shipped), or none at all.
  it.each([
    ["scripts/attw.mjs", "a version without the ./attw subpath"],
    ["scripts/attw.mjs", "no @cosyte/script-utils installed"],
    ["examples/profile-starter-kit/scripts/attw.mjs", "a version without the ./attw subpath"],
    ["examples/profile-starter-kit/scripts/attw.mjs", "no @cosyte/script-utils installed"],
  ])("AC-14: %s exits non-zero naming the specifier with %s", (callerRel, shape) => {
    const dir = mkdtempSync(join(root, "unreachable-"));
    writePkg(dir, { name: "attw-gate-fixture-unreachable", version: "1.0.0", type: "module" }, {});
    mkdirSync(join(dir, "scripts"));
    copyFileSync(join(REPO_ROOT, callerRel), join(dir, "scripts", "attw.mjs"));
    if (shape.startsWith("a version")) {
      writePkg(
        join(dir, "node_modules", "@cosyte", "script-utils"),
        {
          name: "@cosyte/script-utils",
          version: "0.0.2",
          type: "module",
          exports: { ".": "./index.js" },
        },
        { "index.js": "export {};\n" },
      );
    }
    const r = run(process.execPath, ["scripts/attw.mjs"], dir);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(SPECIFIER);
    expect(r.out).not.toContain(PASS);
  });
});
