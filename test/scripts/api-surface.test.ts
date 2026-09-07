/**
 * Tests for the public export surface gate: `scripts/api-surface.ts` and the committed inventory at
 * `release/public-api.json`.
 *
 * WHY THIS FILE EXISTS. `dist/index.d.ts` is the type surface every consumer's editor and compiler
 * reads, and it is assembled by a bundler out of a barrel. Nothing else in this repository goes red
 * when an export leaves it, changes shape, or arrives unannounced: `pnpm typecheck` checks the
 * sources against themselves, `pnpm lint` never looks at `dist/`, and the suite imports from
 * `src/index.ts` rather than from the bundle. A published type surface nobody wrote down cannot be
 * certified stable, and a version cannot be recalled once it is on the registry.
 *
 * WHAT EACH CASE PINS, AND WHY IT IS HERE:
 *
 *  1. THE BASELINE IS A REAL SURFACE. A truncated or stubbed inventory would agree with almost
 *     nothing and still let case 2 look meaningful for whatever it did cover. The floor is asserted
 *     directly, by count and by naming exports this package cannot lose without noticing.
 *  2. END TO END, AGAINST A FRESH BUILD. The declarations are built by the real `tsup` with the
 *     repo's real config into a throwaway directory, and the real script is run against them as a
 *     subprocess. Reading a `dist/` that happens to be lying around would prove only that somebody
 *     built at some point, and `pnpm test` runs before `pnpm build` in `prepublishOnly`, so that
 *     `dist/` is routinely absent exactly when this matters. The temp out-dir also means this file
 *     never clobbers a developer's `dist/`.
 *  3. DRIFT IS NAMED, AND NOTHING IS REWRITTEN. A gate that regenerates its own baseline on a
 *     mismatch always passes and therefore measures nothing. Both halves are asserted: every
 *     difference is reported by export name, and both the mutated copy and the committed inventory
 *     are byte identical after the run.
 *  4. MISSING INPUTS REFUSE, AND AN EMPTY SURFACE IS NEVER A MATCH. `tsup` writes JS before
 *     declarations, so every build has a window where `dist/` holds no `.d.ts` at all; the same
 *     window is why `scripts/attw.mjs` carries a preflight. Absent, empty and export-less
 *     declarations each have their own case, because they fail in different places in the script
 *     and a single one of them would leave the other two unproven.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no shell-form.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const TSUP_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsup");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "api-surface.ts");
const INVENTORY_PATH = join(REPO_ROOT, "release", "public-api.json");

/** A build plus a script run are both well over the suite's 10s default. */
const BUILD_TIMEOUT = 180_000;

const roots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

interface Run {
  readonly status: number | null;
  readonly output: string;
}

function runCheck(args: readonly string[]): Run {
  const result = spawnSync(TSX_BIN, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    timeout: BUILD_TIMEOUT,
  });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** The shape the inventory records, narrowed without an `as` cast. */
interface ApiExport {
  readonly name: string;
  readonly kind: string;
  readonly type: string;
  readonly members: readonly string[];
}

function isApiExport(value: unknown): value is ApiExport {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return (
    typeof record["name"] === "string" &&
    typeof record["kind"] === "string" &&
    typeof record["type"] === "string" &&
    Array.isArray(record["members"])
  );
}

function readInventory(path: string): { typescript: string; exports: ApiExport[] } {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("inventory is not an object");
  const record: Record<string, unknown> = { ...parsed };
  const exports = record["exports"];
  const typescript = record["typescript"];
  if (!Array.isArray(exports) || !exports.every(isApiExport)) {
    throw new Error("inventory has no usable `exports` list");
  }
  if (typeof typescript !== "string") throw new Error("inventory records no `typescript` version");
  return { typescript, exports };
}

/**
 * Build the declarations with the real `tsup` and the repo's real config, into a throwaway
 * directory. `--out-dir` is the only override, so what is measured is the build this package
 * publishes from.
 */
let freshDeclarations = "";

beforeAll(() => {
  const out = tempDir("hl7-api-surface-");
  const build = spawnSync(TSUP_BIN, ["--out-dir", out], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    timeout: BUILD_TIMEOUT,
  });
  expect(build.status, `${build.stdout ?? ""}${build.stderr ?? ""}`).toBe(0);
  freshDeclarations = join(out, "index.d.ts");
}, BUILD_TIMEOUT);

describe("the committed public-export inventory", () => {
  it("records a real surface, not a stub", () => {
    const inventory = readInventory(INVENTORY_PATH);
    // A floor, not the exact count: the count moves with every intended API change, and pinning it
    // here would make this case a second baseline to update. What it rules out is the failure that
    // makes every other case in this file vacuous, an inventory truncated to almost nothing.
    expect(inventory.exports.length).toBeGreaterThan(200);
    expect(inventory.typescript).toMatch(/^\d+\.\d+\.\d+$/);

    const names = new Set(inventory.exports.map((entry) => entry.name));
    for (const required of [
      "parseHL7",
      "Hl7Message",
      "Segment",
      "Field",
      "VERSION",
      "WARNING_CODES",
    ]) {
      expect(names.has(required), `inventory is missing ${required}`).toBe(true);
    }

    // The warning codes are a published contract, so the union that names them has to be IN the
    // baseline rather than merely adjacent to it: this is the entry that makes a renamed code drift.
    const warningCode = inventory.exports.find((entry) => entry.name === "WarningCode");
    expect(warningCode?.members).toContain('"MISSING_EXPECTED_GROUP"');
  });

  it("carries no absolute path from the machine that generated it", () => {
    // Fully-qualified type names embed the path of the declarations they were read from, which
    // would make the baseline disagree between two machines that agree about the API.
    const text = readFileSync(INVENTORY_PATH, "utf8");
    expect(text).not.toMatch(/"[^"]*\/(?:home|Users|workspace|tmp)\//);
  });
});

describe("a fresh build is compared against the committed inventory", () => {
  it("matches exactly", { timeout: BUILD_TIMEOUT }, () => {
    const run = runCheck(["--declarations", freshDeclarations]);
    expect(run.output).toContain("OK: public export surface matches");
    expect(run.status).toBe(0);
  });

  it(
    "names every added, removed and changed export, and rewrites nothing",
    { timeout: BUILD_TIMEOUT },
    () => {
      const committedBefore = readFileSync(INVENTORY_PATH, "utf8");
      const inventory = readInventory(INVENTORY_PATH);

      // Three mutations of the BASELINE, one per kind of difference the criterion names. Dropping an
      // entry from the baseline makes the build look like it ADDED that export; inventing one makes
      // the build look like it REMOVED it. Mutating the baseline rather than the build is what keeps
      // this case honest: the build is the real one, so the diff is real too.
      const droppedFromBaseline = "parseHL7";
      const inventedInBaseline = "zzzInventedExport";
      const retyped = "VERSION";
      const mutated = inventory.exports
        .filter((entry) => entry.name !== droppedFromBaseline)
        .map((entry) => (entry.name === retyped ? { ...entry, type: "number" } : entry));
      mutated.push({ name: inventedInBaseline, kind: "function", type: "() => void", members: [] });

      const dir = tempDir("hl7-api-drift-");
      const copyPath = join(dir, "public-api.json");
      writeFileSync(
        copyPath,
        `${JSON.stringify({ typescript: inventory.typescript, exportCount: mutated.length, exports: mutated }, null, 2)}\n`,
      );
      const copyBefore = readFileSync(copyPath, "utf8");

      const run = runCheck(["--declarations", freshDeclarations, "--inventory", copyPath]);

      expect(run.status).toBe(1);
      expect(run.output).toContain(`removed: ${inventedInBaseline}`);
      expect(run.output).toContain(`added:   ${droppedFromBaseline}`);
      expect(run.output).toContain(`changed: ${retyped} type`);

      // NOTHING WAS REWRITTEN. This is the half that makes the case above mean something: a gate
      // that heals its own baseline reports a match forever after the first drift.
      expect(readFileSync(copyPath, "utf8")).toBe(copyBefore);
      expect(readFileSync(INVENTORY_PATH, "utf8")).toBe(committedBefore);
    },
  );
});

describe("missing inputs refuse rather than compare", () => {
  it("refuses when the declarations are absent", { timeout: BUILD_TIMEOUT }, () => {
    const dir = tempDir("hl7-api-absent-");
    const run = runCheck(["--declarations", join(dir, "index.d.ts")]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("inputs missing");
    expect(run.output).not.toContain("OK:");
  });

  it("refuses when the declarations are empty", { timeout: BUILD_TIMEOUT }, () => {
    // The window every build has: `tsup` writes JS before declarations, so a run that arrives in
    // the gap sees a `dist/` with no usable `.d.ts` in it.
    const dir = tempDir("hl7-api-empty-");
    const path = join(dir, "index.d.ts");
    writeFileSync(path, "");
    const run = runCheck(["--declarations", path]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("empty");
    expect(run.output).not.toContain("OK:");
  });

  it(
    "refuses a module that exports nothing, rather than calling it a match",
    { timeout: BUILD_TIMEOUT },
    () => {
      // The sharp one. A valid, parseable module with no exports derives an EMPTY surface, and an
      // empty surface compared against an empty baseline is a green run over nothing at all.
      const dir = tempDir("hl7-api-void-");
      const path = join(dir, "index.d.ts");
      writeFileSync(path, "export {};\n");
      const emptyInventory = join(dir, "public-api.json");
      writeFileSync(
        emptyInventory,
        `${JSON.stringify({ typescript: "0.0.0", exportCount: 0, exports: [] }, null, 2)}\n`,
      );

      const run = runCheck(["--declarations", path, "--inventory", emptyInventory]);
      expect(run.status).toBe(2);
      expect(run.output).toContain("no exports");
      expect(run.output).not.toContain("OK:");
    },
  );

  it("refuses when the inventory is absent", { timeout: BUILD_TIMEOUT }, () => {
    const dir = tempDir("hl7-api-noinv-");
    const run = runCheck([
      "--declarations",
      freshDeclarations,
      "--inventory",
      join(dir, "public-api.json"),
    ]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("inputs missing");
    expect(run.output).not.toContain("OK:");
  });
});
