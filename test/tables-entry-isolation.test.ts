/**
 * The tables ride on their own entry point so the main one pays nothing for them: not a byte of
 * bundle, not a microsecond of cold import. This holds the reason, the main entry's import graph,
 * rather than a reading of either cost, so it reds on the change that would add the cost.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(REPO_ROOT, "src");

/**
 * Every relative module specifier a source file names, statically or dynamically. Block comments
 * and whole-line comments go first: doc comments quote import lines in their examples.
 */
function relativeImports(file: string): string[] {
  const text = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
  const found: string[] = [];
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/gu)) {
    found.push(match[1] ?? "");
  }
  return found;
}

/** The source files reachable from `entry` through relative imports, `.js` mapped to `.ts`. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() ?? "";
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of relativeImports(file)) {
      queue.push(path.resolve(path.dirname(file), specifier.replace(/\.js$/u, ".ts")));
    }
  }
  return seen;
}

describe("the main entry point's import graph", () => {
  const graph = reachable(path.join(SRC, "index.ts"));

  it("is walked, not empty", () => {
    expect(graph.size).toBeGreaterThan(50);
  });

  it("does not reach the tables entry point or its generated data", () => {
    const tables = path.join(SRC, "tables") + path.sep;
    expect([...graph].filter((file) => file.startsWith(tables))).toEqual([]);
  });
});

describe("the tables entry point's import graph", () => {
  it("stays inside src/tables, so it loads no copy of the main entry", () => {
    const graph = reachable(path.join(SRC, "tables", "index.ts"));
    const tables = path.join(SRC, "tables") + path.sep;
    expect(graph.size).toBeGreaterThan(1);
    expect([...graph].filter((file) => !file.startsWith(tables))).toEqual([]);
  });
});
