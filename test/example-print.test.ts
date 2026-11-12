import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import {
  readPrintConfig,
  sampleBlocks,
  samplePrintFindings,
} from "@cosyte/script-utils/docs-content";
import { describe, expect, it } from "vitest";

/**
 * No example prints a value that identifies a person.
 *
 * `pnpm check:docs-content` holds the README and the pages at the top of `docs-content/` to that
 * rule (`example-print`, required in `cosyte-docs-content.config.json`). This suite holds the rest
 * of what a reader copies to the same rule, with the same lists: the runnable scripts in
 * `examples/`, the starter kit's README and doc comments, and every `@example` in a `/** *\/`
 * comment under `src/`, which ships in `dist/*.d.ts` and renders as the API reference. What an
 * example prints is a type, a code, a count, a length, a position, a precision or a boolean; a
 * field that identifies a person is read into a variable or asserted on instead.
 */
const root = join(import.meta.dirname, "..");
const { accessors, wholeValues, printers } = readPrintConfig(root);
const extra = { accessors, wholeValues, printers };

interface Sample {
  readonly where: string;
  readonly code: string;
}

/** Every `.ts` file under `dir`, recursively, skipping tests. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts") && !d.name.endsWith(".test.ts"))
    .map((d) => join(d.parentPath, d.name))
    .sort();
}

/** The fenced samples inside the `/** *\/` comments of a TypeScript text, comment stars removed. */
function commentSamples(label: string, source: string): Sample[] {
  const lines = source.split("\n");
  const out: Sample[] = [];
  let body: string[] | undefined;
  let start = 0;
  lines.forEach((line, i) => {
    const text = /^\s*\*\s?(.*)$/u.exec(line)?.[1];
    if (text === undefined) {
      body = undefined;
      return;
    }
    if (/^\s*```/u.test(text)) {
      if (body === undefined) {
        body = [];
        start = i + 2;
      } else {
        out.push({ where: `${label}:${String(start)}`, code: body.join("\n") });
        body = undefined;
      }
      return;
    }
    body?.push(text);
  });
  return out;
}

function docCommentSamples(file: string): Sample[] {
  return commentSamples(relative(root, file), readFileSync(file, "utf8"));
}

function exampleScripts(): Sample[] {
  const dir = join(root, "examples");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts"))
    .map((d) => join(dir, d.name))
    .sort()
    .map((file) => ({ where: relative(root, file), code: readFileSync(file, "utf8") }));
}

function kitReadmeSamples(): Sample[] {
  const file = join(root, "examples", "profile-starter-kit", "README.md");
  return sampleBlocks(readFileSync(file, "utf8")).map((b) => ({
    where: `${relative(root, file)}:${String(b.line)}`,
    code: b.code,
  }));
}

function findings(samples: readonly Sample[]): string[] {
  return samples.flatMap((s) =>
    samplePrintFindings(s.code, extra).map(
      (f) => `${s.where} (sample line ${String(f.line)}): ${f.message}`,
    ),
  );
}

describe("no example prints a value that identifies a person", () => {
  it("the runnable scripts in examples/", () => {
    const samples = exampleScripts();
    expect(samples.length).toBeGreaterThanOrEqual(3);
    expect(findings(samples), findings(samples).join("\n")).toEqual([]);
  });

  it("the starter kit's README and doc comments", () => {
    const samples = [
      ...kitReadmeSamples(),
      ...sourceFiles(join(root, "examples", "profile-starter-kit", "src")).flatMap(
        docCommentSamples,
      ),
    ];
    expect(samples.length).toBeGreaterThan(0);
    expect(findings(samples), findings(samples).join("\n")).toEqual([]);
  });

  it("every @example in a doc comment under src/", () => {
    const samples = sourceFiles(join(root, "src")).flatMap(docCommentSamples);
    expect(samples.length).toBeGreaterThan(100);
    expect(findings(samples), findings(samples).join("\n")).toEqual([]);
  });

  it("reads a doc-comment sample, so a print planted in one is found", () => {
    const planted = [
      "/**",
      " * @example",
      " * ```ts",
      " * const msg = parseHL7(raw);",
      " * console.log(msg.patient.mrn);",
      " * ```",
      " */",
    ].join("\n");
    const samples = commentSamples("planted.ts", planted);
    expect(samples).toEqual([
      { where: "planted.ts:4", code: "const msg = parseHL7(raw);\nconsole.log(msg.patient.mrn);" },
    ]);
    expect(findings(samples)).toEqual([expect.stringContaining("planted.ts:4 (sample line 2)")]);
  });

  it("holds this library's own names, so a visit number printed is found", () => {
    const sample = { where: "own.ts", code: "console.log(msg.visit?.visitNumber);" };
    expect(findings([sample])).toHaveLength(1);
  });
});
