/**
 * Run an installed package's bin the same way on every system.
 *
 * A test that spawns `node_modules/.bin/<name>` works on Linux and macOS, where that entry is a
 * shell script, and fails on Windows, where Node cannot start it: the runnable entry there is a
 * `.cmd` shim, which Node starts only through a shell. So the bin is resolved to the JavaScript file
 * its package names for it, and spawned with the running Node (`process.execPath`), which needs no
 * shell and passes every argument through unchanged.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface Manifest {
  name?: unknown;
  bin?: unknown;
}

/** Every package directory directly under `node_modules`, scoped ones included. */
function packageDirs(modules: string): string[] {
  if (!existsSync(modules)) return [];
  const dirs: string[] = [];
  for (const entry of readdirSync(modules).sort()) {
    if (entry.startsWith(".")) continue;
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(join(modules, entry)).sort()) {
        dirs.push(join(modules, entry, scoped));
      }
    } else {
      dirs.push(join(modules, entry));
    }
  }
  return dirs;
}

/** The bins a manifest declares, as a name to relative path map. */
function binsOf(manifest: Manifest): Record<string, string> {
  if (typeof manifest.bin === "string" && typeof manifest.name === "string") {
    return { [manifest.name.split("/").pop() ?? manifest.name]: manifest.bin };
  }
  if (typeof manifest.bin === "object" && manifest.bin !== null) {
    const bins: Record<string, string> = {};
    for (const [name, path] of Object.entries(manifest.bin)) {
      if (typeof path === "string") bins[name] = path;
    }
    return bins;
  }
  return {};
}

/**
 * The JavaScript file behind the bin `name` of a package installed directly under
 * `<root>/node_modules`, or `undefined` when no such package declares it.
 *
 * @param root - The directory whose `node_modules` holds the package.
 * @param name - The bin's name, as `package.json` scripts call it.
 * @returns The absolute path of the file the bin runs, or `undefined`.
 * @example
 * const tsx = binScript(process.cwd(), "tsx");
 */
export function binScript(root: string, name: string): string | undefined {
  for (const dir of packageDirs(join(root, "node_modules"))) {
    const manifestPath = join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    const path = binsOf(manifest)[name];
    if (path !== undefined) return join(dir, path);
  }
  return undefined;
}

/**
 * Like {@link binScript}, for a bin the suite cannot run without: a missing one throws, naming
 * the bin and where it was looked for.
 *
 * @param root - The directory whose `node_modules` holds the package.
 * @param name - The bin's name.
 * @returns The absolute path of the file the bin runs.
 * @example
 * spawnSync(process.execPath, [requireBinScript(process.cwd(), "tsx"), "scripts/check-docs.ts"]);
 */
export function requireBinScript(root: string, name: string): string {
  const script = binScript(root, name);
  if (script === undefined) {
    throw new Error(`no package under ${join(root, "node_modules")} declares the bin "${name}"`);
  }
  return script;
}
