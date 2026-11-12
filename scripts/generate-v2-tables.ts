/**
 * Derive the HL7 v2 code tables `@cosyte/hl7/tables` ships from the vendored snapshot of HL7
 * Terminology 7.5.0.
 *
 * Run it with `pnpm generate:tables`. It reads ONLY `vendor/hl7-terminology/` and writes
 * `src/tables/generated/v2-tables.ts`. It never touches the network.
 *
 * WHAT IT READS.
 *
 *   1. `snapshot.json`, this repository's record of the snapshot: the publication, the commit it
 *      was read from, and the byte count and sha256 of every vendored file. Every file below is
 *      hashed and compared before a byte of it is read.
 *   2. `publication-request.json`, HL7's own file at that commit, which must name the package
 *      `hl7.terminology` at the version `snapshot.json` states. This is what ties the commit to the
 *      7.5.0 publication.
 *   3. `code-systems/cs-v2-NNNN.xml`, one FHIR CodeSystem per table: each concept's code, display
 *      text, `status` property and `v2-table-deprecated` property (the version the code was
 *      deprecated in, where the source records one).
 *   4. `v2-tables/`, cut from `v2-tables.xml`, HL7's master list of v2 tables: its header (for
 *      the file's copyright) and, for each of the eight, its row, which gives the table's name, its
 *      type (HL7-defined or user-defined) and the version the table was introduced in. The whole
 *      file is over a megabyte, more than this repository's PHI sweep can read out of git, so
 *      only these nine byte ranges are committed, each verbatim. `snapshot.json` records the whole
 *      file's sha256 and each range's offsets, and `pnpm generate:tables --cut <v2-tables.xml>`
 *      checks a fresh download against that sha256 and cuts the same ranges again.
 *
 * WHAT IT ALTERS, and nothing else. Each table keeps only its codes, display text, status and
 * deprecation version, in the source's order. A long dash in display text is written as a hyphen,
 * because this repository's text carries none. The per-version coverage is built from table 0104's
 * release codes and each table's introduction version; nothing else is inferred.
 *
 * WHAT IT REFUSES. A vendored file that is missing or whose bytes no longer match the recorded
 * sha256; a publication that is not the one recorded; a code system whose copyright is anything
 * but HL7 Terminology's own CC0 statement, or that carries any other copyright, licence or
 * ownership notice anywhere in its text (third-party content is the one thing CC0 does not cover);
 * a table row in the master list with such a notice; a concept with no code or no display; a
 * repeated code. Each refusal names the file. The module is rendered in memory and written only
 * once all of it exists, so a refusal never leaves a partial file on disk.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

/** Repo-root-relative path of the vendored snapshot. */
export const VENDOR_DIR = "vendor/hl7-terminology";
/** Repo-root-relative path of the generated module. */
export const TABLES_MODULE_PATH = "src/tables/generated/v2-tables.ts";

/** The eight tables, in the order they ship. */
export const TABLE_IDS = ["0003", "0008", "0076", "0103", "0104", "0155", "0211", "0357"] as const;

/**
 * The copyright statement every HL7 Terminology code system carries, verbatim. A code system with
 * any other statement is not HL7's CC0 content alone, and the generator will not ship it.
 */
export const THO_COPYRIGHT =
  "This material derives from the HL7 Terminology (THO). THO is copyright ©1989+ Health Level Seven International and is made available under the CC0 designation. For more licensing information see: https://terminology.hl7.org/license.html";

/** The copyright statement on HL7's master list of v2 tables, verbatim. */
export const TABLE_LIST_COPYRIGHT = "Copyright HL7. Licensed under creative commons public domain";

/**
 * Words that mark a claim of ownership or terms of use. Outside the one copyright element each
 * file is allowed, none of them may appear: their presence is how third-party content announces
 * itself in HL7 Terminology.
 */
const NOTICE_WORDS = /copyright|©|\(c\)|licen[cs]|all rights reserved|trademark|®|proprietary/iu;

// ---------------------------------------------------------------------------------------------
// A small XML reader, enough for the FHIR XML HL7 Terminology publishes: elements, attributes in
// double quotes, self-closing tags, comments and the XML declaration. Anything else throws.
// ---------------------------------------------------------------------------------------------

/** One XML element: its local name, its attributes, and its child elements. */
interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlElement[];
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode the five predefined entities and numeric character references. */
function decodeEntities(text: string, file: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/gu, (whole, body: string) => {
    if (body.startsWith("#x")) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    const named = ENTITIES[body];
    if (named === undefined) throw new Error(`${file}: unknown XML entity ${whole}`);
    return named;
  });
}

/** Parse one document into its root element. */
export function parseXml(text: string, file: string): XmlElement {
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf("<", at);
    if (open === -1) break;
    if (text.startsWith("<?", open)) {
      at = text.indexOf("?>", open) + 2;
      continue;
    }
    if (text.startsWith("<!--", open)) {
      at = text.indexOf("-->", open) + 3;
      continue;
    }
    if (text.startsWith("<!", open)) throw new Error(`${file}: a DTD or CDATA section`);
    const close = text.indexOf(">", open);
    if (close === -1) throw new Error(`${file}: an unclosed tag`);
    const tag = text.slice(open + 1, close);
    at = close + 1;
    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      const top = stack.pop();
      if (top?.name !== name) throw new Error(`${file}: </${name}> closes nothing open`);
      continue;
    }
    const selfClosing = tag.endsWith("/");
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const nameMatch = /^([A-Za-z_][\w.-]*)/u.exec(body);
    if (nameMatch?.[1] === undefined) throw new Error(`${file}: a tag with no name`);
    const attributes: Record<string, string> = {};
    const rest = body.slice(nameMatch[1].length);
    const attributePattern = /\s+([A-Za-z_:][\w:.-]*)="([^"]*)"/gu;
    let consumed = 0;
    for (const match of rest.matchAll(attributePattern)) {
      if (match.index !== consumed) throw new Error(`${file}: an attribute that cannot be read`);
      attributes[match[1] ?? ""] = decodeEntities(match[2] ?? "", file);
      consumed = match.index + match[0].length;
    }
    if (rest.slice(consumed).trim() !== "") {
      throw new Error(`${file}: an attribute that cannot be read`);
    }
    const element: XmlElement = { name: nameMatch[1], attributes, children: [] };
    const parent = stack.at(-1);
    if (parent === undefined) {
      if (root !== undefined) throw new Error(`${file}: more than one root element`);
      root = element;
    } else {
      parent.children.push(element);
    }
    if (!selfClosing) stack.push(element);
  }
  if (root === undefined || stack.length > 0) throw new Error(`${file}: not a whole document`);
  return root;
}

/** The children of `element` named `name`. */
function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

/** The `value` attribute of the one child named `name`, or undefined when there is none. */
function childValue(element: XmlElement, name: string): string | undefined {
  return childrenNamed(element, name)[0]?.attributes["value"];
}

/** A concept's properties: property code to the values it carries, in order. */
function propertiesOf(concept: XmlElement): Map<string, string[]> {
  const properties = new Map<string, string[]>();
  for (const property of childrenNamed(concept, "property")) {
    const code = childValue(property, "code");
    if (code === undefined) continue;
    const values = property.children
      .filter((child) => child.name !== "code")
      .map((child) => child.attributes["value"] ?? "");
    properties.set(code, [...(properties.get(code) ?? []), ...values]);
  }
  return properties;
}

/** Every attribute value in a subtree, for the notice scan. */
function allValues(element: XmlElement): string[] {
  return [...Object.values(element.attributes), ...element.children.flatMap(allValues)];
}

// ---------------------------------------------------------------------------------------------
// The snapshot and its checks.
// ---------------------------------------------------------------------------------------------

/** One vendored file as `snapshot.json` records it. */
export interface SnapshotFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string;
  /** For a range cut from HL7's master table list: its byte offsets in the whole file. */
  readonly cutFrom?: { readonly start: number; readonly end: number };
}

/** HL7's whole master table list, which is recorded but not committed. */
export interface SnapshotTableList {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string;
}

/** The publication as `snapshot.json` records it. */
export interface SnapshotPublication {
  readonly name: string;
  readonly packageId: string;
  readonly version: string;
  readonly url: string;
  readonly pagesUrl: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly repository: string;
  readonly repositoryUrl: string;
  readonly commit: string;
  readonly commitDate: string;
}

/** `snapshot.json`. */
interface Snapshot {
  readonly publication: SnapshotPublication;
  readonly snapshotTakenAt: string;
  readonly tableList: SnapshotTableList;
  readonly files: readonly SnapshotFile[];
}

/** Read `snapshot.json`. */
function readSnapshot(vendorDir: string): Snapshot {
  return JSON.parse(readFileSync(path.join(vendorDir, "snapshot.json"), "utf8")) as Snapshot;
}

/** Where the ranges cut from HL7's master table list sit, under the vendored snapshot. */
export const TABLE_LIST_DIR = "v2-tables";

/** One range of HL7's master table list: the header, or one table's row. */
export interface TableListCut {
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Find the header and the eight rows in HL7's whole master table list. The header runs from the
 * start of the file to its first row; a row runs from its `<concept>` line, whose first child is
 * the table's number, through its `</concept>` line. Each anchor must occur exactly once.
 */
export function cutTableList(full: Buffer): TableListCut[] {
  const firstRow = full.indexOf("\n  <concept>\n");
  if (firstRow === -1) throw new Error("v2-tables.xml: no table row");
  const cuts: TableListCut[] = [
    { path: `${TABLE_LIST_DIR}/header.xml`, start: 0, end: firstRow + 1 },
  ];
  for (const id of TABLE_IDS) {
    const anchor = `\n  <concept>\n    <code value="${id}"/>\n`;
    const at = full.indexOf(anchor);
    if (at === -1 || full.indexOf(anchor, at + 1) !== -1) {
      throw new Error(`v2-tables.xml: the row for table ${id} is not there exactly once`);
    }
    const close = full.indexOf("\n  </concept>\n", at + 1);
    if (close === -1) throw new Error(`v2-tables.xml: the row for table ${id} does not close`);
    cuts.push({
      path: `${TABLE_LIST_DIR}/${id}.xml`,
      start: at + 1,
      end: close + "\n  </concept>\n".length,
    });
  }
  return cuts;
}

/**
 * Check a fresh copy of HL7's whole master table list against its recorded sha256 and write the
 * nine ranges again. A range that comes out different from its recorded sha256 is refused, so a
 * re-cut can only reproduce the committed bytes.
 */
export function recutTableList(vendorDir: string, fullPath: string): void {
  const snapshot = readSnapshot(vendorDir);
  const full = readFileSync(fullPath);
  const sha256 = createHash("sha256").update(full).digest("hex");
  if (sha256 !== snapshot.tableList.sha256 || full.length !== snapshot.tableList.bytes) {
    throw new Error(
      `${fullPath}: sha256 ${sha256} is not the recorded ${snapshot.tableList.sha256}`,
    );
  }
  const ranges = cutTableList(full).map((cut) => {
    const record = snapshot.files.find((file) => file.path === cut.path);
    const bytes = full.subarray(cut.start, cut.end);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (record?.sha256 !== digest || record.cutFrom?.start !== cut.start) {
      throw new Error(`${cut.path}: the range cut again does not match snapshot.json`);
    }
    return { path: cut.path, bytes };
  });
  mkdirSync(path.join(vendorDir, TABLE_LIST_DIR), { recursive: true });
  for (const range of ranges) writeFileSync(path.join(vendorDir, range.path), range.bytes);
}

/** Read a vendored file after checking it against its recorded byte count and sha256. */
function readVerified(vendorDir: string, snapshot: Snapshot, relative: string): string {
  const record = snapshot.files.find((file) => file.path === relative);
  if (record === undefined) throw new Error(`${relative}: not recorded in snapshot.json`);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path.join(vendorDir, relative));
  } catch {
    throw new Error(`${relative}: missing from ${VENDOR_DIR}`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== record.sha256 || bytes.length !== record.bytes) {
    throw new Error(
      `${relative}: sha256 ${sha256} (${String(bytes.length)} bytes) does not match the ` +
        `recorded ${record.sha256} (${String(record.bytes)} bytes)`,
    );
  }
  return bytes.toString("utf8");
}

// ---------------------------------------------------------------------------------------------
// Derivation.
// ---------------------------------------------------------------------------------------------

/** One code as it ships. `deprecatedIn` is absent when the source records no version. */
export interface DerivedEntry {
  readonly code: string;
  readonly display: string;
  readonly status: string;
  readonly deprecatedIn?: string;
}

/** One table as it ships. */
export interface DerivedTable {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly introducedIn: string;
  readonly codeSystemUrl: string;
  readonly pageUrl: string;
  readonly entries: readonly DerivedEntry[];
}

/** Everything the module is rendered from. */
export interface DerivedTables {
  readonly publication: SnapshotPublication;
  readonly files: readonly SnapshotFile[];
  readonly versions: readonly string[];
  readonly tables: readonly DerivedTable[];
}

/** The two long dashes, by code point, so this file holds neither. */
const LONG_DASH = new RegExp(
  `[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`,
  "gu",
);

/** A version code made only of dot-separated numbers, the shape the releases in table 0104 take. */
const RELEASE = /^\d+(?:\.\d+)*$/u;

/** Compare two release codes numerically, part by part. */
export function compareReleases(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Refuse a file whose text carries a notice anywhere but the one element allowed one. */
function refuseNotices(values: readonly string[], file: string): void {
  for (const value of values) {
    if (NOTICE_WORDS.test(value)) {
      throw new Error(`${file}: carries a third-party or ownership notice outside its copyright`);
    }
  }
}

/** Read one code system and check it carries HL7 Terminology's content alone. */
function deriveEntries(text: string, file: string, id: string): DerivedEntry[] {
  const root = parseXml(text, file);
  if (root.name !== "CodeSystem") throw new Error(`${file}: not a CodeSystem`);
  if (childValue(root, "id") !== `v2-${id}`) throw new Error(`${file}: not code system v2-${id}`);
  const copyrights = childrenNamed(root, "copyright");
  if (copyrights.length !== 1 || copyrights[0]?.attributes["value"] !== THO_COPYRIGHT) {
    throw new Error(`${file}: its copyright is not HL7 Terminology's CC0 statement`);
  }
  refuseNotices(
    root.children.filter((child) => child.name !== "copyright").flatMap(allValues),
    file,
  );
  const seen = new Set<string>();
  return childrenNamed(root, "concept").map((concept) => {
    const code = childValue(concept, "code");
    const display = childValue(concept, "display");
    if (code === undefined || code === "" || display === undefined) {
      throw new Error(`${file}: a concept with no code or no display`);
    }
    if (seen.has(code)) throw new Error(`${file}: repeats the code "${code}"`);
    seen.add(code);
    const properties = propertiesOf(concept);
    const status = properties.get("status")?.[0];
    if (status === undefined) throw new Error(`${file}: the code "${code}" has no status`);
    const deprecatedIn = properties.get("v2-table-deprecated")?.[0];
    if (deprecatedIn !== undefined && !RELEASE.test(deprecatedIn)) {
      throw new Error(`${file}: the code "${code}" was deprecated in "${deprecatedIn}"`);
    }
    const entry = { code, display: display.replace(LONG_DASH, "-"), status };
    return deprecatedIn === undefined ? entry : { ...entry, deprecatedIn };
  });
}

/** A table's row in HL7's master list. */
interface TableRow {
  readonly name: string;
  readonly type: string;
  readonly introducedIn: string;
}

/** Check the master list's header, the range before its first row, for HL7's own copyright. */
function checkTableListHeader(text: string, file: string): void {
  // The range stops before the rows, so the root element is closed here to read it.
  const root = parseXml(`${text}</CodeSystem>`, file);
  if (childValue(root, "copyright") !== TABLE_LIST_COPYRIGHT) {
    throw new Error(`${file}: its copyright is not HL7's statement for the table list`);
  }
  refuseNotices(
    root.children.filter((child) => child.name !== "copyright").flatMap(allValues),
    file,
  );
}

/** Read one table's row from HL7's master list. */
function deriveTableRow(text: string, file: string, id: string): TableRow {
  const concept = parseXml(text, file);
  if (concept.name !== "concept" || childValue(concept, "code") !== id) {
    throw new Error(`${file}: not the row for table ${id}`);
  }
  refuseNotices(allValues(concept), file);
  const properties = propertiesOf(concept);
  const name = childValue(concept, "display");
  const type = properties.get("v2-table-type")?.[0];
  const introducedIn = properties.get("v2-version-tbl-introduced")?.[0];
  if (name === undefined || type === undefined || introducedIn === undefined) {
    throw new Error(`${file}: table ${id} has no name, type or introduction version`);
  }
  if (!RELEASE.test(introducedIn)) {
    throw new Error(`${file}: table ${id} was introduced in "${introducedIn}"`);
  }
  return { name, type, introducedIn };
}

/** Derive every table from the vendored snapshot. Throws, naming the file, on any refusal. */
export function deriveTables(vendorDir: string): DerivedTables {
  const snapshot = readSnapshot(vendorDir);
  const { publication } = snapshot;

  const request = JSON.parse(readVerified(vendorDir, snapshot, "publication-request.json")) as {
    "package-id"?: string;
    version?: string;
  };
  if (request["package-id"] !== publication.packageId || request.version !== publication.version) {
    throw new Error(
      `publication-request.json: names ${String(request["package-id"])} ${String(request.version)}, ` +
        `not ${publication.packageId} ${publication.version}`,
    );
  }
  if (publication.version !== "7.5.0") {
    throw new Error(`snapshot.json: records ${publication.version}, not HL7 Terminology 7.5.0`);
  }

  const header = `${TABLE_LIST_DIR}/header.xml`;
  checkTableListHeader(readVerified(vendorDir, snapshot, header), header);

  const tables = TABLE_IDS.map((id): DerivedTable => {
    const file = `code-systems/cs-v2-${id}.xml`;
    const rowFile = `${TABLE_LIST_DIR}/${id}.xml`;
    const row = deriveTableRow(readVerified(vendorDir, snapshot, rowFile), rowFile, id);
    return {
      id,
      name: row.name,
      type: row.type,
      introducedIn: row.introducedIn,
      codeSystemUrl: `http://terminology.hl7.org/CodeSystem/v2-${id}`,
      pageUrl: `${publication.pagesUrl}CodeSystem-v2-${id}.html`,
      entries: deriveEntries(readVerified(vendorDir, snapshot, file), file, id),
    };
  });

  const versionTable = tables.find((table) => table.id === "0104");
  const versions = (versionTable?.entries ?? [])
    .map((entry) => entry.code)
    .filter((code) => RELEASE.test(code))
    .sort(compareReleases);
  if (versions.length === 0) {
    throw new Error("code-systems/cs-v2-0104.xml: table 0104 lists no release");
  }

  return { publication, files: snapshot.files, versions, tables };
}

// ---------------------------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------------------------

const GENERATED_HEADER = `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 * Written by \`pnpm generate:tables\` (\`scripts/generate-v2-tables.ts\`) from the vendored
 * snapshot of HL7 Terminology 7.5.0 in \`vendor/hl7-terminology/\`. Re-running the generator in a
 * checkout with no network access reproduces this file byte for byte.
 *
 * HL7 Terminology is published by Health Level Seven International under the CC0 designation.
 * This data is derived from it and altered (see \`NOTICE\` below); it is not HL7 Terminology
 * itself, and HL7 does not endorse this package.
 */`;

/** A string as a TypeScript literal. */
function lit(value: string): string {
  return JSON.stringify(value);
}

/** A JSON value as a module expression parsed at import, guarded against template breaks. */
function jsonValue(value: unknown, type: string): string {
  const text = JSON.stringify(value);
  if (text.includes("`") || text.includes("${")) {
    throw new Error("generate:tables: a table value holds a backtick or `${`");
  }
  return `JSON.parse(String.raw\`${text}\`) as ${type}`;
}

/** The notice that ships with the data, stated once here so the module and the docs agree. */
export const NOTICE =
  "These tables are derived from HL7 Terminology 7.5.0, published by Health Level Seven " +
  "International under the CC0 designation. They are altered: each table keeps only its codes, " +
  "display text, status and the version a code was deprecated in; the per-version code lists are " +
  "rebuilt from those deprecation versions and from each table's introduction version; and a long " +
  "dash in display text is written as a hyphen. This is a derivative work, not HL7 Terminology " +
  "itself, and HL7 does not endorse this package.";

/**
 * Render the generated module, formatted with this repository's prettier settings. They are read
 * from beside this script rather than from where the module is written, so a run into a scratch
 * directory formats exactly as a run in the repository does.
 */
export async function renderTablesModule(model: DerivedTables): Promise<string> {
  const { publication } = model;
  const source = `${GENERATED_HEADER}

import type { GeneratedTable, GeneratedSource } from "../types.js";

/** Where the data came from, and the notice that travels with it. */
export const GENERATED_SOURCE: GeneratedSource = {
  name: ${lit(publication.name)},
  packageId: ${lit(publication.packageId)},
  version: ${lit(publication.version)},
  url: ${lit(publication.url)},
  license: ${lit(publication.license)},
  licenseUrl: ${lit(publication.licenseUrl)},
  repository: ${lit(publication.repositoryUrl)},
  commit: ${lit(publication.commit)},
  notice: ${lit(NOTICE)},
  files: ${jsonValue(
    model.files.map((file) => ({ path: file.path, sha256: file.sha256, url: file.url })),
    'GeneratedSource["files"]',
  )},
};

/** The release codes of table 0104, oldest first. */
export const GENERATED_VERSIONS: readonly string[] = ${jsonValue(model.versions, "readonly string[]")};

/** The eight tables, in the order they ship. */
export const GENERATED_TABLES: readonly GeneratedTable[] = ${jsonValue(model.tables, "readonly GeneratedTable[]")};
`;
  const options = (await resolveConfig(fileURLToPath(import.meta.url))) ?? {};
  return format(source, { ...options, parser: "typescript" });
}

/** Derive, render, then write. Nothing is written until all of it exists. */
export async function main(repoRoot: string): Promise<void> {
  const model = deriveTables(path.join(repoRoot, VENDOR_DIR));
  const moduleSource = await renderTablesModule(model);
  mkdirSync(path.dirname(path.join(repoRoot, TABLES_MODULE_PATH)), { recursive: true });
  writeFileSync(path.join(repoRoot, TABLES_MODULE_PATH), moduleSource);
  const codes = model.tables.reduce((sum, table) => sum + table.entries.length, 0);
  process.stdout.write(
    `generate:tables: ${String(model.tables.length)} tables, ${String(codes)} codes, ` +
      `${String(model.versions.length)} versions, from HL7 Terminology ${model.publication.version}.\n`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cut = process.argv.indexOf("--cut");
  if (cut !== -1) {
    const fullPath = process.argv[cut + 1];
    if (fullPath === undefined) throw new Error("--cut needs the path of a fresh v2-tables.xml");
    recutTableList(path.join(repoRoot, VENDOR_DIR), path.resolve(fullPath));
  }
  await main(repoRoot);
}
