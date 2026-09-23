import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  docSnippetSuite,
  extractRunnableSnippets,
  runSnippet,
} from "@cosyte/vitest-config/snippets";

import { fences, fixturesByContent, messageLiteral } from "./_helpers/first-use.js";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` is extracted,
 * compiled, and executed, and its inline `// =>` assertions are checked: so a documented example
 * can never silently drift from the shipped code (the documentation analog of the conformance
 * runners). Blocks tagged ` ```ts runnable throws ` must throw; plain ` ```ts ` blocks are
 * illustrative and are not executed.
 *
 * Snippets import the package the way a consumer does: against the **built** ESM artifact, not the
 * source tree. The harness executes each block as a standalone ES module, so it can't resolve the
 * source's internal `.js`→`.ts` imports; the bundled `dist/index.mjs` is self-contained and is also
 * exactly what an installer loads. The shared CI gate runs `test` before `build`, so we provision
 * `dist/` on demand here rather than assuming build order.
 */
const root = join(import.meta.dirname, "..");
const distEntry = join(root, "dist", "index.mjs");
const resolve = (specifier: string): string | undefined =>
  specifier === "@cosyte/hl7" ? distEntry : undefined;

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 120_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve,
});

/**
 * The quickstart's FIRST example is the first thing a reader runs from the docs site, so it gets
 * more than the sweep above: it must be the block the sweep executes, its message must be a
 * committed synthetic fixture (the page is public, and `test/fixtures` is the corpus `pnpm
 * phi-scan` reads), and a changed value in it must turn this suite red.
 */
const quickstart = readFileSync(join(root, "docs-content", "quickstart.md"), "utf8");
const firstBlock = fences(quickstart)[0];
const firstRunnable = extractRunnableSnippets(quickstart)[0];
/** Temp modules for the explicit first-use runs; removed below. Inside the root, as the harness requires. */
const firstUseTmp = join(root, ".cosyte-first-use-snippets");

afterAll(() => {
  rmSync(firstUseTmp, { recursive: true, force: true });
});

describe("the quickstart's first example", () => {
  it("AC-HL1: is a runnable TypeScript block, so the sweep above executes it", () => {
    expect(firstBlock?.lang).toBe("ts");
    expect(firstBlock?.tags).toContain("runnable");
    expect(firstBlock?.tags).not.toContain("throws");
    expect(firstRunnable?.code).toBe(firstBlock?.body);
  });

  it("AC-HL1: runs against the built package and every claimed value holds", async () => {
    expect(firstRunnable).toBeDefined();
    if (firstRunnable === undefined) return;
    await runSnippet(firstRunnable, { resolve, tmpDir: firstUseTmp });
  });

  it("AC-HL4: its message is a byte-for-byte copy of a fixture under test/fixtures", () => {
    const message = messageLiteral(firstRunnable?.code ?? "");
    expect(message).toBeDefined();
    const fixtures = fixturesByContent(root, join(root, "test", "fixtures"));
    expect(fixtures.get(message ?? "")).toBeDefined();
  });

  it("AC-HL3: a changed claimed value turns the run red", async () => {
    const code = firstRunnable?.code ?? "";
    expect(code.split('// => "MRN12345"').length - 1).toBe(1);
    const mutated = code.replace('// => "MRN12345"', '// => "MRN12346"');
    await expect(runSnippet(mutated, { resolve, tmpDir: firstUseTmp })).rejects.toThrow();
  });

  it("AC-HL3: a changed input value turns the run red and leaves the fixture corpus", async () => {
    const code = firstRunnable?.code ?? "";
    const message = messageLiteral(code) ?? "";
    expect(message.split("MRN12345").length - 1).toBe(1);
    const mutated = code.replace("MRN12345^^^HOSP", "MRN12346^^^HOSP");
    const fixtures = fixturesByContent(root, join(root, "test", "fixtures"));
    expect(fixtures.get(messageLiteral(mutated) ?? "")).toBeUndefined();
    await expect(runSnippet(mutated, { resolve, tmpDir: firstUseTmp })).rejects.toThrow();
  });
});
