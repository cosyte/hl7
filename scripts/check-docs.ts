/**
 * Consistency gate for the `docs-content/` bundle that `pnpm pack:docs` ships and
 * `docs.cosyte.com` ingests.
 *
 * The bundle is a public surface twice over: it is tracked in a public repo AND it is published to
 * a live site, and publication is the part no re-run undoes. `pnpm phi-scan` deliberately does not
 * read markdown (its walk excludes it, on the recorded ground that markdown may legitimately
 * describe a violator value), so nothing else in this repo stands between a sample value on one of
 * these pages and the released tarball. That is what the SAMPLE DATA FLOOR below exists for; the
 * rest of the rules keep the page metadata and the code contract uniform.
 *
 * Every rule REFUSES rather than reports. A check that cannot fail is documentation:
 *
 *   1. PREFLIGHT       the docs directory exists, holds at least one page, and carries a readable,
 *                      parseable `sidebars.json`. An empty scan is a failure, never a pass.
 *   2. READABILITY     every page this run enumerated is a regular file that was read whole. A file
 *                      that vanished or refused to open is named, never skipped.
 *   3. FRONTMATTER     `id` (equal to the basename), `title`, `sidebar_label` and `description`
 *                      (non-empty, at most 160 characters) on every page; no `sidebar_position`,
 *                      which this site never consults because it ships an explicit sidebar.
 *   4. SIDEBAR         every page reachable exactly once from `sidebars.json`, and every id in that
 *                      file backed by a page.
 *   5. LINKS           every internal link written `./<basename>.md`, optionally anchored, and
 *                      resolving to a page that exists.
 *   6. CODE CONTRACT   exactly one page carries all of `WARNING_CODES` and `FATAL_CODES`, each with
 *                      real prose beside it, and that page invents no code the source does not
 *                      define. `troubleshooting.md` points per-code questions at that page and at
 *                      nothing else.
 *   7. SAMPLE DATA     no line that looks like an HL7 segment carries a nine-digit dashed
 *                      identifier, a telephone number outside the `555` reservation, or an email
 *                      address outside `example.com` / `example.org`.
 *
 * Run it with `pnpm check:docs`. The three path options exist so the gate's own test can point it
 * at a temporary tree, and are not meant for day-to-day use:
 *
 *   --docs <dir>        default `docs-content`
 *   --warnings <file>   default `src/parser/warnings.ts`
 *   --errors <file>     default `src/parser/errors.ts`
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Frontmatter keys every page must carry. */
const REQUIRED_KEYS = ["id", "title", "sidebar_label", "description"] as const;

/** Docusaurus consults an explicit `sidebars.json` here, so a per-page position is dead metadata. */
const FORBIDDEN_KEYS = ["sidebar_position"] as const;

const MAX_DESCRIPTION = 160;

/** Prose a code needs beside it before the page counts as documenting rather than listing it. */
const MIN_CODE_PROSE = 40;

/** The page that must answer "what does this code mean". */
const TROUBLESHOOTING_PAGE = "troubleshooting.md";

/**
 * SCREAMING_SNAKE names that live on the code-reference page but are not codes: they are the
 * registries themselves. Everything else of that shape has to be a code the source defines.
 */
const NOT_A_CODE = new Set(["WARNING_CODES", "FATAL_CODES"]);

/** A paragraph that sends a reader looking for per-code meanings somewhere. */
const MEANING_POINTER =
  /\bwhat each\b|\bwhat they mean\b|\bwhat it means\b|\bper-code\b|\bmeaning of (?:each|every)\b/i;

interface Violation {
  readonly rule: string;
  readonly where: string;
  readonly detail: string;
}

const violations: Violation[] = [];

function fail(rule: string, where: string, detail: string): void {
  violations.push({ rule, where, detail });
}

// ---------------------------------------------------------------------------------------------
// Option parsing. Unknown options are refused rather than ignored: a typo that silently scanned
// the wrong tree would report a clean result over files nobody asked about.
// ---------------------------------------------------------------------------------------------

function optionValue(argv: readonly string[], name: string, fallback: string): string {
  const at = argv.indexOf(name);
  if (at === -1) return fallback;
  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`check-docs: ${name} requires a path argument`);
  }
  return resolve(value);
}

function parseOptions(argv: readonly string[]): {
  docsDir: string;
  warningsFile: string;
  errorsFile: string;
} {
  const known = new Set(["--docs", "--warnings", "--errors"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token !== undefined && token.startsWith("--")) {
      if (!known.has(token)) throw new Error(`check-docs: unknown option ${token}`);
      i += 1;
    }
  }
  return {
    docsDir: optionValue(argv, "--docs", join(ROOT, "docs-content")),
    warningsFile: optionValue(argv, "--warnings", join(ROOT, "src", "parser", "warnings.ts")),
    errorsFile: optionValue(argv, "--errors", join(ROOT, "src", "parser", "errors.ts")),
  };
}

// ---------------------------------------------------------------------------------------------
// Frontmatter. A YAML dependency is not available (this package ships zero runtime dependencies
// and adding a dev one is its own reviewed change), so this accepts the flat `key: value` subset
// these pages actually use and REFUSES everything else as unparseable. Refusing a valid but exotic
// block is the safe direction for a gate: it reports the file rather than passing it, which is what
// the contract asks for. Silently treating a malformed block as "no frontmatter" is the failure
// mode being avoided, because that reads as a missing-keys error and sends the reader to the wrong
// place.
// ---------------------------------------------------------------------------------------------

type Frontmatter =
  | { readonly kind: "ok"; readonly keys: ReadonlyMap<string, string> }
  | { readonly kind: "absent" }
  | { readonly kind: "unparseable"; readonly reason: string };

function unquote(raw: string): string | null {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    const inner = value.slice(1, -1);
    return inner.includes('"') ? null : inner;
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    const inner = value.slice(1, -1);
    return inner.includes("'") ? null : inner;
  }
  if (value.startsWith('"') || value.startsWith("'")) return null;
  return value;
}

function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { kind: "absent" };

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { kind: "unparseable", reason: "frontmatter block is never closed" };

  const keys = new Map<string, string>();
  for (let i = 1; i < end; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (line.includes("\t")) {
      return { kind: "unparseable", reason: `line ${String(i + 1)} contains a tab` };
    }
    if (line !== line.trimStart()) {
      return {
        kind: "unparseable",
        reason: `line ${String(i + 1)} is indented; only flat key/value pairs are accepted`,
      };
    }
    const at = line.indexOf(":");
    if (at <= 0) {
      return { kind: "unparseable", reason: `line ${String(i + 1)} is not a "key: value" pair` };
    }
    const key = line.slice(0, at).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { kind: "unparseable", reason: `line ${String(i + 1)} has a malformed key` };
    }
    if (keys.has(key)) {
      return { kind: "unparseable", reason: `duplicate key "${key}"` };
    }
    const value = unquote(line.slice(at + 1));
    if (value === null) {
      return { kind: "unparseable", reason: `value for "${key}" has unbalanced quoting` };
    }
    keys.set(key, value);
  }
  return { kind: "ok", keys };
}

// ---------------------------------------------------------------------------------------------
// Source registries. Read off the source text rather than an import, because `dist/` is build
// output that need not exist when this runs. The extraction refuses an unrecognised shape instead
// of handing back an empty set, which would make every coverage rule below vacuously pass.
// ---------------------------------------------------------------------------------------------

function extractCodes(file: string, registry: string): string[] {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`check-docs: cannot read ${file}`, { cause: err });
  }
  const opener = `export const ${registry} = {`;
  const start = source.indexOf(opener);
  if (start === -1) throw new Error(`check-docs: no "${opener}" found in ${file}`);
  const end = source.indexOf("} as const;", start);
  if (end === -1)
    throw new Error(`check-docs: "${registry}" in ${file} is not closed by "as const"`);

  const codes: string[] = [];
  for (const line of source.slice(start + opener.length, end).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const match = /^([A-Z][A-Z0-9_]*):\s*"([^"]+)",?$/.exec(trimmed);
    if (match === null) {
      throw new Error(`check-docs: unrecognised entry in ${registry} (${file}): ${trimmed}`);
    }
    const [, key, value] = match;
    if (key === undefined || value === undefined) continue;
    if (key !== value) {
      throw new Error(`check-docs: ${registry}.${key} is "${value}"; key and value must agree`);
    }
    codes.push(key);
  }
  if (codes.length === 0) throw new Error(`check-docs: ${registry} in ${file} is empty`);
  return codes;
}

// ---------------------------------------------------------------------------------------------
// Sidebar traversal.
// ---------------------------------------------------------------------------------------------

/**
 * The document ids a sidebar reaches. A bare string is the shorthand for a doc, `{ type: "doc" }`
 * is the long form, and a category is descended through its `items`. A category's own `label` and
 * `type` are metadata, not ids, so the walk never treats an arbitrary string value as one.
 */
function collectSidebarIds(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectSidebarIds(child, out);
    return;
  }
  if (typeof node === "object" && node !== null) {
    const record: Record<string, unknown> = { ...node };
    const type = record["type"];
    if (type === "doc") {
      const id = record["id"];
      if (typeof id === "string") out.push(id);
      return;
    }
    const items = record["items"];
    if (items !== undefined) {
      collectSidebarIds(items, out);
      return;
    }
    if (type !== undefined) return;
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) collectSidebarIds(value, out);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Markdown links.
// ---------------------------------------------------------------------------------------------

interface Link {
  readonly text: string;
  readonly target: string;
  readonly line: number;
}

const LINK_PATTERN = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Links that leave the bundle. Everything else is treated as a link to another page here, which is
 * the point: an extensionless `./guides` is exactly the form this gate exists to refuse, so it must
 * not be filtered out as "not an internal link".
 */
function isExternal(target: string): boolean {
  return (
    target.startsWith("#") ||
    target.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) ||
    target.startsWith("//")
  );
}

function internalLinks(text: string): Link[] {
  const found: Link[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    LINK_PATTERN.lastIndex = 0;
    let match = LINK_PATTERN.exec(line);
    while (match !== null) {
      const [, linkText, target] = match;
      if (linkText !== undefined && target !== undefined && !isExternal(target)) {
        found.push({ text: linkText, target, line: i + 1 });
      }
      match = LINK_PATTERN.exec(line);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Sample data floor. Only lines that look like HL7 are inspected, because those are the lines a
// sample value hides in; the shape is three uppercase alphanumeric characters followed by the
// field separator, which is what a segment looks like on the wire.
// ---------------------------------------------------------------------------------------------

const SEGMENT_SHAPE = /(?<![A-Z0-9])[A-Z0-9]{3}\|/;
const NINE_DIGIT_DASHED = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
const PHONE_PARENS = /\((\d{3})\)\s?(\d{3})[-. ]?\d{4}(?!\d)/g;
const PHONE_DASHED = /(?<![\d-])(\d{3})[-.](\d{3})[-.]\d{4}(?![\d-])/g;
const PHONE_LOCAL = /(?<![\d.-])(\d{3})[-.](\d{4})(?![\d.-])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const ALLOWED_EMAIL_DOMAINS = new Set(["example.com", "example.org"]);
const RESERVED_EXCHANGE = "555";

function sampleDataFaults(line: string): string[] {
  const faults: string[] = [];
  if (!SEGMENT_SHAPE.test(line)) return faults;

  if (NINE_DIGIT_DASHED.test(line)) {
    faults.push("carries a nine-digit dashed identifier");
  }

  for (const pattern of [PHONE_PARENS, PHONE_DASHED]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(line);
    while (match !== null) {
      if (match[2] !== RESERVED_EXCHANGE) {
        faults.push(`carries a telephone number whose exchange is not ${RESERVED_EXCHANGE}`);
      }
      match = pattern.exec(line);
    }
  }

  PHONE_LOCAL.lastIndex = 0;
  let local = PHONE_LOCAL.exec(line);
  while (local !== null) {
    if (local[1] !== RESERVED_EXCHANGE) {
      faults.push(`carries a telephone number whose exchange is not ${RESERVED_EXCHANGE}`);
    }
    local = PHONE_LOCAL.exec(line);
  }

  EMAIL.lastIndex = 0;
  let email = EMAIL.exec(line);
  while (email !== null) {
    const domain = email[1]?.toLowerCase() ?? "";
    if (!ALLOWED_EMAIL_DOMAINS.has(domain)) {
      faults.push(`carries an email address outside example.com / example.org (${domain})`);
    }
    email = EMAIL.exec(line);
  }

  return [...new Set(faults)];
}

// ---------------------------------------------------------------------------------------------
// Code coverage on the reference page.
// ---------------------------------------------------------------------------------------------

const CODE_SHAPE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

function codesOn(text: string, known: ReadonlySet<string>): Set<string> {
  const present = new Set<string>();
  CODE_SHAPE.lastIndex = 0;
  let match = CODE_SHAPE.exec(text);
  while (match !== null) {
    if (known.has(match[0])) present.add(match[0]);
    match = CODE_SHAPE.exec(text);
  }
  return present;
}

/**
 * The prose that accompanies a code, taken from its table row when it sits in one and from its
 * whole paragraph otherwise, with every mention of the code itself removed. The best occurrence
 * wins: a code named once in a heading and once in a table row is documented by the table row.
 */
function proseFor(text: string, code: string): number {
  const lines = text.split("\n");
  let best = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.includes(code)) continue;

    let block = line;
    if (!line.trimStart().startsWith("|")) {
      let from = i;
      while (from > 0 && (lines[from - 1] ?? "").trim() !== "") from -= 1;
      let to = i;
      while (to + 1 < lines.length && (lines[to + 1] ?? "").trim() !== "") to += 1;
      block = lines.slice(from, to + 1).join(" ");
    }

    const prose = block
      .split(code)
      .join(" ")
      .replace(/[|`*_#>-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (prose.length > best) best = prose.length;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------------------------

function main(): void {
  const { docsDir, warningsFile, errorsFile } = parseOptions(process.argv.slice(2));

  // --- 1. Preflight -------------------------------------------------------------------------
  let entries: string[];
  try {
    if (!statSync(docsDir).isDirectory()) {
      throw new Error("not a directory");
    }
    entries = readdirSync(docsDir);
  } catch (err) {
    fail("preflight", docsDir, `docs directory cannot be enumerated: ${String(err)}`);
    report(docsDir);
    return;
  }

  const pages = entries.filter((name) => name.endsWith(".md")).sort();
  if (pages.length === 0) {
    fail("preflight", docsDir, "no *.md pages found; refusing to report a clean empty scan");
  }

  const sidebarPath = join(docsDir, "sidebars.json");
  let sidebarIds: string[] | null = null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(sidebarPath, "utf8"));
    const collected: string[] = [];
    collectSidebarIds(parsed, collected);
    sidebarIds = collected;
  } catch (err) {
    fail("preflight", sidebarPath, `sidebars.json is missing or unreadable: ${String(err)}`);
  }

  if (pages.length === 0 || sidebarIds === null) {
    report(docsDir);
    return;
  }

  // --- 2. Readability -----------------------------------------------------------------------
  const contents = new Map<string, string>();
  for (const page of pages) {
    const full = join(docsDir, page);
    try {
      if (!statSync(full).isFile()) {
        fail("readability", full, "enumerated as a page but is not a regular file");
        continue;
      }
      contents.set(page, readFileSync(full, "utf8"));
    } catch (err) {
      fail("readability", full, `enumerated as a page but could not be read: ${String(err)}`);
    }
  }

  const basenames = new Set(pages.map((page) => basename(page, ".md")));

  // --- 3. Frontmatter -----------------------------------------------------------------------
  for (const [page, text] of contents) {
    const full = join(docsDir, page);
    const front = parseFrontmatter(text);

    if (front.kind === "absent") {
      fail("frontmatter", full, "no YAML frontmatter block");
      continue;
    }
    if (front.kind === "unparseable") {
      fail("frontmatter", full, `frontmatter is not parseable YAML: ${front.reason}`);
      continue;
    }

    for (const key of REQUIRED_KEYS) {
      if (!front.keys.has(key)) fail("frontmatter", full, `frontmatter omits "${key}"`);
    }
    for (const key of FORBIDDEN_KEYS) {
      if (front.keys.has(key)) {
        fail(
          "frontmatter",
          full,
          `frontmatter carries inert "${key}"; this site ships sidebars.json`,
        );
      }
    }

    const id = front.keys.get("id");
    const expected = basename(page, ".md");
    if (id !== undefined && id !== expected) {
      fail("frontmatter", full, `id is "${id}" but the basename is "${expected}"`);
    }

    const description = front.keys.get("description");
    if (description !== undefined) {
      if (description.trim() === "") {
        fail("frontmatter", full, "description is empty");
      } else if (description.length > MAX_DESCRIPTION) {
        fail(
          "frontmatter",
          full,
          `description is ${String(description.length)} characters; the limit is ${String(MAX_DESCRIPTION)}`,
        );
      }
    }
  }

  // --- 4. Sidebar ---------------------------------------------------------------------------
  const seen = new Map<string, number>();
  for (const id of sidebarIds) seen.set(id, (seen.get(id) ?? 0) + 1);

  for (const [id, count] of seen) {
    if (!basenames.has(id)) {
      fail("sidebar", sidebarPath, `id "${id}" has no matching page`);
    } else if (count > 1) {
      fail(
        "sidebar",
        sidebarPath,
        `id "${id}" appears ${String(count)} times; expected exactly one`,
      );
    }
  }
  for (const name of basenames) {
    if (!seen.has(name)) {
      fail("sidebar", join(docsDir, `${name}.md`), "page is not reachable from sidebars.json");
    }
  }

  // --- 5. Links -----------------------------------------------------------------------------
  for (const [page, text] of contents) {
    const full = join(docsDir, page);
    for (const link of internalLinks(text)) {
      const shaped = /^\.\/([^/#]+\.md)(#.+)?$/.exec(link.target);
      if (shaped === null) {
        fail(
          "link",
          `${full}:${String(link.line)}`,
          `[${link.text}](${link.target}) is not written as ./<basename>.md`,
        );
        continue;
      }
      const targetFile = shaped[1] ?? "";
      if (!contents.has(targetFile)) {
        fail(
          "link",
          `${full}:${String(link.line)}`,
          `[${link.text}](${link.target}) resolves to no page in docs-content/`,
        );
      }
    }
  }

  // --- 6. Code contract ---------------------------------------------------------------------
  const warningCodes = extractCodes(warningsFile, "WARNING_CODES");
  const fatalCodes = extractCodes(errorsFile, "FATAL_CODES");
  const allCodes = [...warningCodes, ...fatalCodes];
  const known = new Set(allCodes);

  const coverage = new Map<string, Set<string>>();
  for (const [page, text] of contents) coverage.set(page, codesOn(text, known));

  const complete = [...coverage.entries()]
    .filter(([, present]) => present.size === known.size)
    .map(([page]) => page);

  let referencePage: string | null = null;
  if (complete.length === 1) {
    referencePage = complete[0] ?? null;
  } else if (complete.length > 1) {
    fail(
      "codes",
      docsDir,
      `${String(complete.length)} pages carry every code (${complete.join(", ")}); exactly one must`,
    );
  } else {
    let bestCount = -1;
    for (const [page, present] of coverage) {
      if (present.size > bestCount) {
        bestCount = present.size;
        referencePage = page;
      }
    }
  }

  if (referencePage === null) {
    fail("codes", docsDir, "no page carries the warning and fatal code reference");
  } else {
    const refFull = join(docsDir, referencePage);
    const refText = contents.get(referencePage) ?? "";
    const present = coverage.get(referencePage) ?? new Set<string>();

    for (const code of allCodes) {
      if (!present.has(code)) {
        fail(
          "codes",
          refFull,
          `${code} is defined in the source registries but absent from this page`,
        );
      } else if (proseFor(refText, code) < MIN_CODE_PROSE) {
        fail(
          "codes",
          refFull,
          `${code} carries fewer than ${String(MIN_CODE_PROSE)} characters of prose beside it`,
        );
      }
    }

    CODE_SHAPE.lastIndex = 0;
    const strays = new Set<string>();
    let stray = CODE_SHAPE.exec(refText);
    while (stray !== null) {
      const token = stray[0];
      if (!known.has(token) && !NOT_A_CODE.has(token)) strays.add(token);
      stray = CODE_SHAPE.exec(refText);
    }
    for (const token of [...strays].sort()) {
      fail("codes", refFull, `${token} is written on this page but no source registry defines it`);
    }

    // Troubleshooting must point per-code questions here, and nowhere else.
    const troubleshooting = contents.get(TROUBLESHOOTING_PAGE);
    if (troubleshooting === undefined) {
      fail(
        "codes",
        join(docsDir, TROUBLESHOOTING_PAGE),
        "page is missing; it must exist and link to the code reference",
      );
    } else {
      const wanted = `./${referencePage}`;
      const links = internalLinks(troubleshooting);
      if (!links.some((link) => link.target === wanted || link.target.startsWith(`${wanted}#`))) {
        fail(
          "codes",
          join(docsDir, TROUBLESHOOTING_PAGE),
          `no link to the code reference (${wanted}) on the page`,
        );
      }
      for (const paragraph of troubleshooting.split(/\n\s*\n/)) {
        if (!MEANING_POINTER.test(paragraph.replace(/\n/g, " "))) continue;
        for (const link of internalLinks(paragraph)) {
          if (link.target !== wanted && !link.target.startsWith(`${wanted}#`)) {
            fail(
              "codes",
              join(docsDir, TROUBLESHOOTING_PAGE),
              `sends a reader looking for per-code meanings to ${link.target}, which is not ${wanted}`,
            );
          }
        }
      }
    }
  }

  // --- 7. Sample data floor -----------------------------------------------------------------
  for (const [page, text] of contents) {
    const full = join(docsDir, page);
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const fault of sampleDataFaults(lines[i] ?? "")) {
        fail("sample-data", `${full}:${String(i + 1)}`, `HL7-shaped line ${fault}`);
      }
    }
  }

  report(docsDir);
}

function report(docsDir: string): void {
  if (violations.length === 0) {
    console.log(`check-docs: OK (${docsDir})`);
    return;
  }
  for (const violation of violations) {
    console.error(`check-docs: [${violation.rule}] ${violation.where}: ${violation.detail}`);
  }
  console.error(`check-docs: FAILED with ${String(violations.length)} violation(s)`);
  process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
