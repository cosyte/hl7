import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Readers for the package's first-use path: the first fenced block of
 * `docs-content/quickstart.md`, the first fenced block under `## Usage` in `README.md`, and the
 * install command both documents print. Every reader works on the text of the document as it is
 * on disk at test time, never on a copy held here.
 */

/** One fenced code block: its info string split into language and tags, and its body. */
export interface Fence {
  readonly lang: string;
  readonly tags: readonly string[];
  readonly body: string;
}

/** Every fenced block in a chunk of markdown, in document order. */
export function fences(markdown: string): Fence[] {
  const out: Fence[] = [];
  let open: { marker: string; lang: string; tags: string[] } | undefined;
  let buf: string[] = [];
  for (const line of markdown.split("\n")) {
    if (open === undefined) {
      const opened = /^(`{3,}|~{3,})\s*(.*)$/.exec(line);
      if (opened !== null) {
        const tokens = (opened[2] ?? "").trim().split(/\s+/).filter(Boolean);
        open = { marker: opened[1] ?? "```", lang: tokens[0] ?? "", tags: tokens.slice(1) };
        buf = [];
      }
      continue;
    }
    if (line.trimEnd() === open.marker) {
      out.push({ lang: open.lang, tags: open.tags, body: buf.join("\n") });
      open = undefined;
      continue;
    }
    buf.push(line);
  }
  if (open !== undefined) throw new Error("unterminated code fence");
  return out;
}

/** The lines of one `##` section, from its heading to the next `##` heading. */
export function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`no ${heading} section`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]?.startsWith("## ") === true) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/**
 * The HL7 message a first-use example builds: the string literals assigned to `const raw`,
 * concatenated. Each literal is decoded by the JSON string grammar, which is the JavaScript one
 * for every escape these examples use (`\\`, `\r`). `undefined` when the example assigns none.
 *
 * The literals are read one at a time with a sticky pattern rather than by one pattern with a
 * repeated group, which would backtrack exponentially on a long run of empty literals.
 */
export function messageLiteral(code: string): string | undefined {
  const head = "const raw =";
  const start = code.indexOf(head);
  if (start === -1) return undefined;
  const literal = /\s*("(?:[^"\\\n]|\\.)*")[ \t]*(\+)?/y;
  literal.lastIndex = start + head.length;
  const parts: string[] = [];
  for (let match = literal.exec(code); match !== null; match = literal.exec(code)) {
    parts.push(JSON.parse(match[1] ?? '""') as string);
    if (match[2] === undefined) break;
  }
  return parts.length === 0 ? undefined : parts.join("");
}

/** Every file under `dir`, keyed by its exact contents, mapped to its path from `root`. */
export function fixturesByContent(root: string, dir: string): Map<string, string> {
  const byText = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else byText.set(readFileSync(full, "utf8"), relative(root, full));
    }
  };
  walk(dir);
  return byText;
}

/**
 * The package names a document tells a reader to install: the first non-flag argument of every
 * `npm install`, `npm i`, `pnpm add`, `yarn add` or `bun add`, with any `@version` suffix removed.
 */
export function installSpecifiers(markdown: string): string[] {
  const out: string[] = [];
  const command =
    /\b(?:npm (?:install|i)|pnpm add|yarn add|bun add)((?:[ \t]+-{1,2}[\w-]+)*)[ \t]+(\S+)/g;
  for (const match of markdown.matchAll(command)) {
    const spec = match[2];
    if (spec === undefined) continue;
    const versionAt = spec.indexOf("@", 1);
    out.push(versionAt === -1 ? spec : spec.slice(0, versionAt));
  }
  return out;
}
