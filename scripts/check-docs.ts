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
 *                      resolving to a page that exists, in all four CommonMark spellings. Scanned
 *                      whole-file, because a link's text wraps across lines and a reference link's
 *                      target is defined elsewhere on the page; images are not links to a page and
 *                      are left alone.
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

/**
 * A paragraph that sends a reader looking for per-code meanings somewhere. A finite phrase list is
 * an approximation of a property of prose and cannot be complete; it is deliberately biased to
 * match, because a paragraph wrongly flagged is one visible failure an author rewords, while one
 * missed publishes a pointer at a page that answers nothing.
 */
const MEANING_POINTER =
  /\bwhat each\b|\bwhat they mean\b|\bwhat it means\b|\bper-code\b|\bmeanings? of\b/i;

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
// Frontmatter. A YAML parser is not available here: this package ships zero runtime dependencies,
// and adding a dev one is its own reviewed change rather than a rider on a docs gate.
//
// So this reader is an ALLOW-LIST, not a best-effort parse. It admits exactly the flat
// `key: <scalar>` shapes whose YAML meaning is unambiguous, and everything else is reported as
// unparseable, by path, at a non-zero exit. That direction is the whole point. A block this refuses
// but YAML would accept costs a page author one pair of quotes; a block this accepted but YAML
// rejects would ship a bundle the site cannot render, with the gate calling it clean.
//
// A line is a mapping entry only when its colon is followed by a space or ends the line, which is
// what YAML requires of a block mapping key. Concretely, a value is one of:
//
//   - empty                (YAML null)
//   - "double quoted"      with no interior quote and no backslash escape
//   - 'single quoted'      with no interior quote
//   - a plain scalar       that opens with a non-indicator character and carries no `: `, no
//                          ` #` and no trailing `:`
//
// The plain-scalar rules are not decoration. `title: Spec notes: NTE` unquoted is a YAML error,
// which is why every spec-notes page here quotes its title; `[`, `{`, `*`, `&`, `@`, `|`, `>` and
// friends open a flow collection, an alias, an anchor, a reserved word or a block scalar, none of
// which this reader models. Refusing them is how it stays an allow-list.
//
// Silently treating a malformed block as "no frontmatter" is the other failure mode being avoided:
// it reads as a missing-keys error and sends the reader to the wrong place. Hence three outcomes,
// not two.
// ---------------------------------------------------------------------------------------------

type Frontmatter =
  | { readonly kind: "ok"; readonly keys: ReadonlyMap<string, string> }
  | { readonly kind: "absent" }
  | { readonly kind: "unparseable"; readonly reason: string };

/** YAML indicator characters. None of them may open a plain scalar this reader will accept. */
const PLAIN_OPENER_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;

type ScalarRead = { readonly value: string } | { readonly fault: string };

function readScalar(raw: string): ScalarRead {
  const value = raw.trim();
  if (value === "") return { value: "" };

  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"')) {
      return { fault: "a double-quoted value is never closed" };
    }
    const inner = value.slice(1, -1);
    if (inner.includes('"')) return { fault: "a double-quoted value has an interior quote" };
    if (inner.includes("\\")) return { fault: "a double-quoted value carries a backslash escape" };
    return { value: inner };
  }

  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'")) {
      return { fault: "a single-quoted value is never closed" };
    }
    const inner = value.slice(1, -1);
    if (inner.includes("'")) return { fault: "a single-quoted value has an interior quote" };
    return { value: inner };
  }

  const opener = PLAIN_OPENER_INDICATOR.exec(value);
  if (opener !== null) {
    return { fault: `an unquoted value opens with the YAML indicator "${opener[0]}"` };
  }
  if (value.includes(": ")) {
    return { fault: 'an unquoted value contains ": ", which YAML reads as a nested mapping' };
  }
  if (value.endsWith(":")) {
    return { fault: "an unquoted value ends with a colon" };
  }
  if (value.includes(" #")) {
    return { fault: "an unquoted value contains what YAML reads as an inline comment" };
  }
  return { value };
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
    // A block mapping key is the colon PLUS a space, or a colon that ends the line. `id:intro` is
    // not a mapping entry at all: YAML reads the whole line as the plain scalar "id:intro", and a
    // document that opens with a scalar and continues with a mapping is a parse error. A dropped
    // space is the most ordinary frontmatter typo there is, so the split has to ask the question
    // rather than leave it to the value reader below, which never sees the missing space.
    const after = line.slice(at + 1);
    if (after.trim() !== "" && !after.startsWith(" ")) {
      return {
        kind: "unparseable",
        reason: `line ${String(i + 1)} has no space after its colon, so YAML does not read it as a key`,
      };
    }
    const key = line.slice(0, at).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { kind: "unparseable", reason: `line ${String(i + 1)} has a malformed key` };
    }
    if (keys.has(key)) {
      return { kind: "unparseable", reason: `duplicate key "${key}"` };
    }
    const scalar = readScalar(line.slice(at + 1));
    if ("fault" in scalar) {
      return {
        kind: "unparseable",
        reason: `line ${String(i + 1)}, the value for "${key}": ${scalar.fault}`,
      };
    }
    keys.set(key, scalar.value);
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
  /** The reference label this link resolved through, or null when it was written inline. */
  readonly label: string | null;
}

/** A link reference definition: the label, the destination it names, and where it was written. */
interface Definition {
  readonly label: string;
  readonly target: string;
  readonly line: number;
}

/**
 * A markdown link in any of CommonMark's four spellings: inline `[text](target)`, full reference
 * `[text][label]`, collapsed `[text][]` and shortcut `[text]`. The last three carry their target in
 * a link reference definition written elsewhere in the file, render as exactly the same anchor as
 * the inline form, and would be invisible to a pattern that only knew `](`. Every rule below is
 * built on this scan, so a form it cannot see is a form no rule reaches.
 *
 * `[^\]]*` spans newlines ON PURPOSE. Prose here wraps at the column limit, so a link's TEXT
 * routinely straddles a line break, and a scan that walked one line at a time would see no link at
 * all on either half. That is a hole, not a nicety: it is exactly where an extensionless or
 * dangling target hides from every rule below. The target itself cannot wrap, so `[^)\s]+` still
 * excludes whitespace.
 *
 * The leading `!` is captured rather than excluded. An image is NOT a link to a page, so demanding
 * the `./<basename>.md` shape of `![alt](./diagram.png)` would refuse the first asset anyone adds;
 * but `![alt][d]` does consume the label `d`, and a scan that never saw it would go on to call
 * that definition unreferenced.
 */
const LINK_PATTERN = /(!?)\[([^\]]*)\](?:\(([^)\s]+)(?:\s+"[^"]*")?\)|\[([^\]]*)\])?/g;

/**
 * A link reference definition on a line of its own: `[label]: destination "optional title"`. Four
 * spaces of indent would make it an indented code block, so at most three are accepted.
 */
const DEFINITION_PATTERN =
  /^ {0,3}\[([^\]]+)\]:[ \t]*(\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*\r?$/;

/** CommonMark matches labels case-insensitively, with internal whitespace collapsed. */
function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

/** A destination may be wrapped in angle brackets, which are delimiters and not part of it. */
function unwrapDestination(target: string): string {
  return target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
}

/**
 * The link reference definitions in a page, plus the page with each definition line blanked out.
 * Blanking rather than deleting keeps every byte offset, and therefore every reported line number,
 * exactly where it was; it stops a definition's own `[label]` from being counted a second time as
 * a shortcut link on the line that defines it.
 */
function definitionsIn(text: string): { defs: Map<string, Definition>; body: string } {
  const lines = text.split("\n");
  const defs = new Map<string, Definition>();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = DEFINITION_PATTERN.exec(line);
    if (match === null) continue;
    const [, label, destination] = match;
    if (label === undefined || destination === undefined) continue;
    const key = normalizeLabel(label);
    // CommonMark: where a label is defined twice, the first definition wins.
    if (!defs.has(key)) {
      defs.set(key, { label: label.trim(), target: unwrapDestination(destination), line: i + 1 });
    }
    lines[i] = " ".repeat(line.length);
  }
  return { defs, body: lines.join("\n") };
}

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

/** The 1-based line the offset sits on. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Every link in a page that points inside the bundle, whichever spelling it was written in.
 *
 * `defs` resolves the reference forms and is taken from the WHOLE file even when `text` is one
 * paragraph of it, because a definition sits wherever the author put it, routinely at the foot of
 * the page. A label nothing defines is not a link at all (CommonMark renders it as literal text),
 * so it is skipped rather than refused. `used` collects the labels that did resolve.
 */
function internalLinks(
  text: string,
  defs: ReadonlyMap<string, Definition>,
  used?: Set<string>,
): Link[] {
  const { body } = definitionsIn(text);
  const found: Link[] = [];
  LINK_PATTERN.lastIndex = 0;
  let match = LINK_PATTERN.exec(body);
  while (match !== null) {
    const [, bang, rawText, inlineTarget, refLabel] = match;
    // Reported on one output line, so a wrapped text is folded back to single spaces.
    const linkText = (rawText ?? "").replace(/\s+/g, " ").trim();
    const isImage = bang === "!";

    let target: string;
    let label: string | null = null;

    if (inlineTarget !== undefined) {
      target = unwrapDestination(inlineTarget);
    } else {
      // A reference. `[text][label]` names its label; `[text][]` and a bare `[text]` both take
      // the text as the label.
      const named = refLabel !== undefined && refLabel.trim() !== "" ? refLabel : (rawText ?? "");
      const key = normalizeLabel(named);
      const definition = defs.get(key);
      if (definition === undefined) {
        // `[a][b]` with `b` undefined is literal text, and its inner `[b]` may still open a link
        // of its own. Resume from there rather than swallowing it with the outer match.
        if (refLabel !== undefined) {
          LINK_PATTERN.lastIndex = match.index + (bang ?? "").length + (rawText ?? "").length + 2;
        }
        match = LINK_PATTERN.exec(body);
        continue;
      }
      // Consumed even by an image, which is what stops the definition reading as unreferenced.
      used?.add(key);
      target = definition.target;
      label = definition.label;
    }

    if (!isImage && !isExternal(target)) {
      found.push({ text: linkText, target, line: lineOf(body, match.index), label });
    }
    match = LINK_PATTERN.exec(body);
  }
  return found;
}

/** How a link is quoted back in a violation: the form it was written in, plus where it points. */
function describeLink(link: Link): string {
  return link.label === null
    ? `[${link.text}](${link.target})`
    : `[${link.text}][${link.label}], which points at ${link.target},`;
}

/** What is wrong with an internal link target, or null when nothing is. */
function linkFault(target: string, pages: ReadonlyMap<string, string>): string | null {
  const shaped = /^\.\/([^/#]+\.md)(#.+)?$/.exec(target);
  if (shaped === null) return "is not written as ./<basename>.md";
  if (!pages.has(shaped[1] ?? "")) return "resolves to no page in docs-content/";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Sample data floor. Only lines that look like HL7 are inspected, because those are the lines a
// sample value hides in; the shape is three uppercase alphanumeric characters followed by the
// field separator, which is what a segment looks like on the wire.
// ---------------------------------------------------------------------------------------------

const SEGMENT_SHAPE = /(?<![A-Z0-9])[A-Z0-9]{3}\|/;
const NINE_DIGIT_DASHED = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/;
const PHONE_PARENS = /\((\d{3})\)\s?(\d{3})[-. ]?\d{4}(?!\d)/g;

/**
 * The lookarounds exclude a DIGIT and nothing else. Excluding a neighbouring separator too would
 * blind these to `1-NPA-NXX-XXXX` and `+1-NPA-NXX-XXXX`, the ordinary way a ten-digit US number is
 * written with its long-distance prefix, while still catching the same number without it. The
 * digit exclusion is what it is for: an HL7 DTM to hour precision is ten unbroken digits, and a
 * separator-free run must not read as a phone number.
 */
const PHONE_DASHED = /(?<!\d)(\d{3})[-.](\d{3})[-.]\d{4}(?!\d)/g;
const PHONE_LOCAL = /(?<!\d)(\d{3})[-.](\d{4})(?!\d)/g;
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
    const { defs } = definitionsIn(text);
    const used = new Set<string>();

    for (const link of internalLinks(text, defs, used)) {
      const fault = linkFault(link.target, contents);
      if (fault !== null) {
        fail("link", `${full}:${String(link.line)}`, `${describeLink(link)} ${fault}`);
      }
    }

    // A definition nothing references renders no anchor today, so it is not yet a link. It is
    // still a target written into a published bundle, one edit away from being one, and checking
    // it is the net under the scan above: a usage the patterns here fail to see cannot smuggle a
    // broken target past the gate on its own.
    for (const [key, definition] of defs) {
      if (used.has(key) || isExternal(definition.target)) continue;
      const fault = linkFault(definition.target, contents);
      if (fault !== null) {
        fail(
          "link",
          `${full}:${String(definition.line)}`,
          `the unreferenced definition [${definition.label}]: ${definition.target} ${fault}`,
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
      // From the whole page, because a paragraph below may point through a label defined at the
      // foot of the file rather than beside the sentence that uses it.
      const { defs } = definitionsIn(troubleshooting);
      const links = internalLinks(troubleshooting, defs);
      if (!links.some((link) => link.target === wanted || link.target.startsWith(`${wanted}#`))) {
        fail(
          "codes",
          join(docsDir, TROUBLESHOOTING_PAGE),
          `no link to the code reference (${wanted}) on the page`,
        );
      }
      for (const paragraph of troubleshooting.split(/\n\s*\n/)) {
        if (!MEANING_POINTER.test(paragraph.replace(/\n/g, " "))) continue;
        for (const link of internalLinks(paragraph, defs)) {
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
