import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

/**
 * The `VERSION` of a fresh import of the package source. A static import would run
 * `src/index.ts` while the file loads, before any case starts, and the mutation run cannot tell
 * which case a mutant in that module-level line belongs to: it ran the mutant only against the
 * cases that import the module again, and none of them reads `VERSION`. Importing it inside the
 * case that asserts on it ties the line to that case.
 */
async function freshVersion(): Promise<string> {
  vi.resetModules();
  const { VERSION } = await import("../src/index.js");
  return VERSION;
}

const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

/** Narrow the parsed manifest without an `as` cast: the sanity test must not lie about its input. */
function manifestVersion(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("package.json did not parse to an object with a `version` field");
  }
  const { version } = manifest;
  if (typeof version !== "string") throw new Error("package.json `version` is not a string");
  return version;
}

describe("toolchain sanity", () => {
  it("package exports VERSION matching package.json", async () => {
    // Compared against package.json, never a hardcoded literal. `changeset version` bumps
    // package.json alone, so a release that skipped `cosyte-process sync-version` (wired into the
    // `version` script) would otherwise publish a VERSION export that lies about the release,
    // and a literal-vs-literal assertion would have stayed green while it happened.
    expect(await freshVersion()).toBe(manifestVersion(pkg));
  });

  it("exposes VERSION as a semver-looking string", async () => {
    // Shape only, so a bump needs no edit here: the value itself is pinned to package.json above.
    expect(await freshVersion()).toMatch(/^\d+\.\d+\.\d+(?:[.-].+)?$/);
  });
});
