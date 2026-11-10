/**
 * The summaries on the namespace re-exports in `src/index.ts` name the namespace's members and say
 * which of them are also named exports of the package. The generated API reference prints those
 * summaries, so a member they call a named export has to be one. These cases read the summary
 * text and check every name it gives against the committed export inventory
 * (`release/public-api.json`, which `tsx scripts/api-surface.ts` compares with the built
 * `dist/index.d.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const INDEX = readFileSync(join(ROOT, "src", "index.ts"), "utf8");

interface InventoryEntry {
  readonly name: string;
  readonly kind: string;
  readonly members?: readonly string[];
}

const INVENTORY = JSON.parse(readFileSync(join(ROOT, "release", "public-api.json"), "utf8")) as {
  readonly exports: readonly InventoryEntry[];
};
const TOP_LEVEL = new Set(INVENTORY.exports.map((entry) => entry.name));

/** The TSDoc block directly above `export * as <name> from ...`, as plain text. */
function namespaceSummary(name: string): string {
  const marker = `export * as ${name} from`;
  const at = INDEX.indexOf(marker);
  expect(at, `src/index.ts has no ${marker}`).toBeGreaterThan(-1);
  const end = INDEX.lastIndexOf("*/", at);
  const start = INDEX.lastIndexOf("/**", end);
  // Nothing but whitespace may sit between the comment and the export it documents.
  expect(INDEX.slice(end + 2, at).trim()).toBe("");
  return INDEX.slice(start + 3, end)
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/u, ""))
    .join(" ")
    .replace(/\s+/gu, " ");
}

/** The summary's prose, before its `@example`. */
function prose(summary: string): string {
  const example = summary.indexOf("@example");
  return example === -1 ? summary : summary.slice(0, example);
}

/** Every backticked identifier in a stretch of text. */
function identifiers(text: string): string[] {
  return [...text.matchAll(/`([A-Za-z_$][\w$]*)`/gu)].map((match) => match[1] ?? "");
}

function members(name: string): ReadonlySet<string> {
  const entry = INVENTORY.exports.find((candidate) => candidate.name === name);
  expect(entry?.kind).toBe("namespace");
  return new Set(entry?.members ?? []);
}

describe("conformance namespace summary", () => {
  const text = prose(namespaceSummary("conformance"));
  const ALSO = "each also a named export of the package";
  const ONLY = "which only this namespace exports";

  it("names as package exports only names the package exports", () => {
    const claimed = text.indexOf(ALSO);
    expect(claimed).toBeGreaterThan(-1);
    const named = identifiers(text.slice(0, claimed));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((id) => !TOP_LEVEL.has(id))).toEqual([]);
    const own = members("conformance");
    expect(named.filter((id) => !own.has(id))).toEqual([]);
  });

  it("names as namespace-only exactly the members the package root does not export", () => {
    const own = members("conformance");
    const onlyHere = [...own].filter((id) => !TOP_LEVEL.has(id)).sort();
    const from = text.indexOf(ALSO) + ALSO.length;
    const to = text.indexOf(ONLY);
    expect(to).toBeGreaterThan(from);
    expect(identifiers(text.slice(from, to)).sort()).toEqual(onlyHere);
  });
});
