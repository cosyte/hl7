/**
 * The one fixture helper for every test that runs the version sync.
 *
 * The `version` package script is `changeset version && cosyte-process sync-version && prettier
 * --write package.json src/index.ts`, so the sync that decides what `VERSION` a published tarball
 * exports is the `sync-version` entry point of the pinned `@cosyte/process`, not a script in this
 * repository. Two test files drive it: `test/scripts/release-readiness.test.ts` runs it after the
 * real `changeset version` in a throwaway copy of this checkout, and
 * `test/scripts/sync-version-adoption.test.ts` runs it over a differential corpus. Both go through
 * `runCanonicalSyncVersion` below, so there is one definition of how the entry point is reached.
 *
 * THE REAL BIN, NOT A DOUBLE. The bin path is read off the installed package's own manifest, and the
 * bin is spawned with the fixture as its working directory, which is exactly what `pnpm run version`
 * does: pnpm runs a package script with the package root as the working directory, and the entry
 * point treats its working directory as the package root. Nothing here re-implements any part of it.
 *
 * A fixture is a directory holding a `package.json` and a `src/index.ts`, which is the whole input
 * surface the entry point reads. Every subprocess call uses `spawnSync` with array arguments.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** The package that publishes the canonical entry point, and the bin name it declares. */
export const PROCESS_PACKAGE = "@cosyte/process";
const PROCESS_BIN = "cosyte-process";

/**
 * Absolute path of the `cosyte-process` bin of the installed `@cosyte/process`.
 *
 * Read from the package's own `bin` field rather than from `node_modules/.bin`, whose shim is a shell
 * wrapper on some platforms and cannot be handed to `node` directly.
 */
export function canonicalBinPath(): string {
  const manifestPath = require.resolve(`${PROCESS_PACKAGE}/package.json`);
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("bin" in parsed)) {
    throw new Error(`${manifestPath} declares no \`bin\`: reinstall with \`pnpm install\``);
  }
  const { bin } = parsed;
  if (typeof bin !== "object" || bin === null || !(PROCESS_BIN in bin)) {
    throw new Error(`${manifestPath} declares no \`${PROCESS_BIN}\` bin`);
  }
  const entry: unknown = Object.entries(bin).find(([name]) => name === PROCESS_BIN)?.[1];
  if (typeof entry !== "string") {
    throw new Error(`${manifestPath} declares a \`${PROCESS_BIN}\` bin that is not a path`);
  }
  return join(dirname(manifestPath), entry);
}

/** What one run of an entry point did, as a caller of it would observe it. */
export interface EntryPointRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run `cosyte-process sync-version` with `dir` as the package root.
 *
 * @param dir - A directory holding the `package.json` and `src/index.ts` the entry point reads.
 */
export function runCanonicalSyncVersion(dir: string): EntryPointRun {
  const result = spawnSync(process.execPath, [canonicalBinPath(), "sync-version"], {
    cwd: dir,
    encoding: "utf8",
    shell: false,
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** One input of the version-sync corpus: the two files the entry point reads, byte for byte. */
export interface SyncVersionInput {
  /** Stable name, recorded beside the measurement taken against the retired local script. */
  readonly id: string;
  /** The numbered condition of the version-sync contract this input exercises. */
  readonly condition: 1 | 2 | 3 | 4 | 5;
  /** The whole `package.json` text. */
  readonly manifest: string;
  /** The whole `src/index.ts` text. */
  readonly source: string;
}

/** Write an input's two files into `dir`, creating `src/`. */
export function writeSyncFixture(dir: string, input: SyncVersionInput): void {
  writeFileSync(join(dir, "package.json"), input.manifest);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), input.source);
}

/** A manifest carrying `version` as given; `undefined` omits the key entirely. */
function manifest(version: unknown): string {
  const body: Record<string, unknown> = { name: "@cosyte/sync-fixture", private: true };
  if (version !== undefined) body["version"] = version;
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** An entry point shaped like this repository's own: a doc block, the declaration, re-exports. */
function source(declarationLines: string): string {
  return [
    "/**",
    " * Fixture entry point.",
    " */",
    "",
    declarationLines,
    "",
    'export { parse } from "./parse.js";',
    "",
  ].join("\n");
}

const DECLARATION_0_0_1 = 'export const VERSION: string = "0.0.1";';

/**
 * The corpus, one input per numbered condition at least. Condition 1 carries its three named shapes
 * and condition 2 carries both of its refusals plus the trailing-comment line an early draft of the
 * canonical spliced over where the local script refused.
 */
export const SYNC_VERSION_CORPUS: readonly SyncVersionInput[] = [
  {
    id: "c1-version-missing",
    condition: 1,
    manifest: manifest(undefined),
    source: source(DECLARATION_0_0_1),
  },
  {
    id: "c1-version-empty",
    condition: 1,
    manifest: manifest(""),
    source: source(DECLARATION_0_0_1),
  },
  {
    id: "c1-version-not-a-string",
    condition: 1,
    manifest: manifest(1),
    source: source(DECLARATION_0_0_1),
  },
  {
    id: "c2-declaration-renamed",
    condition: 2,
    manifest: manifest("0.1.0"),
    source: source('export const PACKAGE_VERSION: string = "0.0.1";'),
  },
  {
    id: "c2-decoy-in-comment",
    condition: 2,
    manifest: manifest("0.1.0"),
    source: source(
      ["/*", 'export const VERSION: string = "9.9.9";', "*/", DECLARATION_0_0_1].join("\n"),
    ),
  },
  {
    id: "c2-trailing-comment",
    condition: 2,
    manifest: manifest("0.1.0"),
    source: source(`${DECLARATION_0_0_1} // written at release`),
  },
  {
    id: "c3-replacement-patterns",
    condition: 3,
    manifest: manifest("1.2.3-$&.$1.$`.$'"),
    source: source(DECLARATION_0_0_1),
  },
  {
    id: "c4-already-synced",
    condition: 4,
    manifest: manifest("0.0.1"),
    source: source(DECLARATION_0_0_1),
  },
  {
    id: "c5-write",
    condition: 5,
    manifest: manifest("0.1.0"),
    source: source(DECLARATION_0_0_1),
  },
];
