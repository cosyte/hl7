import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  docSnippetSuite,
  extractRunnableSnippets,
  runSnippet,
} from "@cosyte/vitest-config/snippets";

import type * as Hl7 from "../src/index.js";

import { compileErrors, fences, fixturesByContent, messageLiteral } from "./_helpers/first-use.js";

/**
 * Doc/code-agreement gate. Every TypeScript and JavaScript sample on a hand-written page of
 * `docs-content/` is extracted, compiled, and executed, and its inline `// =>` assertions are
 * checked: so a documented example can never silently drift from the shipped code (the
 * documentation analog of the conformance runners). Blocks tagged ` ```ts runnable throws ` must
 * throw. A sample that cannot run says why in its fence (` ```ts no-run <reason> `), and the test
 * below the suite refuses a sample that does neither.
 *
 * The pages under `docs-content/api/` are generated from the TSDoc comments in `src/`, and their
 * `@example` blocks are fragments written for an editor's tooltip (many use an undeclared `raw`),
 * so they are not part of this suite: the shared runner walks `docs-content/` and, in every-sample
 * mode, leaves the generated `api/` folder out.
 *
 * Snippets import the package the way a consumer does: against the **built** ESM artifact, not the
 * source tree. The harness executes each block as a standalone ES module, so it can't resolve the
 * source's internal `.js`→`.ts` imports; the bundled `dist/index.mjs` is self-contained and is also
 * exactly what an installer loads. The shared CI gate runs `test` before `build`, so we provision
 * `dist/` on demand here rather than assuming build order.
 */
const root = join(import.meta.dirname, "..");
const distEntry = join(root, "dist", "index.mjs");
const distArbitraries = join(root, "dist", "arbitraries.mjs");
const distTables = join(root, "dist", "tables.mjs");
const resolve = (specifier: string): string | undefined =>
  specifier === "@cosyte/hl7"
    ? distEntry
    : specifier === "@cosyte/hl7/arbitraries"
      ? distArbitraries
      : specifier === "@cosyte/hl7/tables"
        ? distTables
        : undefined;

beforeAll(() => {
  // On Windows `pnpm` is a `.cmd` shim, which Node runs only through a shell.
  execFileSync("pnpm", ["build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}, 120_000);

const docsDir = join(root, "docs-content");

/**
 * `every` runs each TypeScript and JavaScript sample whether or not it is tagged `runnable`,
 * type-checks each TypeScript one first, and lists a `no-run` sample as skipped with its reason; a
 * `no-run` with no reason fails. The runner finds the pages itself, from `docsDir`.
 */
docSnippetSuite({ docsDir, every: true, resolve, requireSnippet: true });

/**
 * The hand-written pages, for the one rule the runner does not hold: a sample tagged `runnable`
 * must not also say `no-run`, which the runner would quietly skip.
 */
const pages = readdirSync(docsDir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => join(docsDir, name));

/** The fence languages that make a block a code sample. */
const SAMPLE_LANGS = new Set(["ts", "typescript", "tsx", "js", "javascript", "mjs"]);

describe("every sample on a hand-written page", () => {
  it("runs, or names in its fence why it cannot", () => {
    const unaccounted: string[] = [];
    for (const path of pages) {
      for (const fence of fences(readFileSync(path, "utf8"))) {
        if (!SAMPLE_LANGS.has(fence.lang)) continue;
        const noRun = fence.tags.indexOf("no-run");
        const reason = noRun === -1 ? "" : fence.tags.slice(noRun + 1).join(" ");
        if (fence.tags.includes("runnable") ? noRun !== -1 : reason === "") {
          unaccounted.push(
            `${path.slice(docsDir.length + 1)}: ${fence.lang} ${fence.tags.join(" ")}`,
          );
        }
      }
    }
    expect(unaccounted).toEqual([]);
  });
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
/**
 * The harness above strips types without checking them, so compiling is checked separately, the
 * way a reader's new TypeScript project compiles the block, against the source entry point the
 * bundler compiles into the published types.
 */
const sourceEntry = join(root, "src", "index.ts");
const COMPILE_TIMEOUT = 60_000;

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

  it(
    "AC-HL1: compiles in a new TypeScript project against the package's types",
    () => {
      expect(compileErrors(root, "@cosyte/hl7", sourceEntry, firstBlock?.body ?? "")).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );

  it(
    "AC-HL1: a block that does not compile is reported, so it turns this suite red",
    () => {
      const code = firstBlock?.body ?? "";
      expect(code.split("msg.patient?.mrn").length - 1).toBe(1);
      const mutated = code.replace("msg.patient?.mrn", "msg.patient.mrn");
      expect(compileErrors(root, "@cosyte/hl7", sourceEntry, mutated)).toEqual([
        expect.stringContaining("TS18048"),
      ]);
    },
    COMPILE_TIMEOUT,
  );

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

/**
 * The built classes keep their own names. A class that names itself inside its own body is emitted
 * by the bundler under a renamed inner binding (`var Segment = class _Segment`), which turns
 * `Segment.name`, a message's `constructor.name` and every `util.inspect` label into `_Segment`
 * and `_Hl7Message`. Only the built artifact shows it, so this reads `dist/`, which the build above
 * provides. The message is synthetic.
 */
describe("the built classes", () => {
  const TEXT = "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\rOBX|1|NM|GLU||81";

  for (const lazy of [true, false]) {
    it(`keep the names Hl7Message and Segment, ${lazy ? "lazy" : "eager"}`, async () => {
      const built = (await import(pathToFileURL(distEntry).href)) as typeof Hl7;
      expect(built.Hl7Message.name).toBe("Hl7Message");
      expect(built.Segment.name).toBe("Segment");
      const msg = built.parseHL7(TEXT, { lazy });
      const obx = msg.segments("OBX")[0];
      expect(msg.constructor.name).toBe("Hl7Message");
      expect(obx?.constructor.name).toBe("Segment");
      expect(inspect(msg, { depth: 0 })).toMatch(/^Hl7Message \{/);
      expect(inspect(obx, { depth: 0 })).toMatch(/^Segment \{/);
    });
  }
});
