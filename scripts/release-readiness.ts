#!/usr/bin/env tsx
/**
 * Decide, from a checkout alone, whether the pending Changesets queue is ready to release the
 * version the committed readiness record claims.
 *
 * WHY THIS EXISTS. Changesets turns a directory of declarations into a version number, and the
 * number it lands on is decided by the strongest bump anyone happened to write in a file whose
 * frontmatter nobody reads at review time. A published version cannot be recalled, so "we thought
 * that one was a patch" is not a recoverable mistake: it is either a release that silently stayed
 * on the old ladder, or a major nobody agreed to. This check makes the queue's verdict explicit
 * and puts it beside a committed record a maintainer signed off, so the two can be compared by a
 * machine instead of by memory.
 *
 * WHAT IT REFUSES TO GUESS, and why each refusal is the point:
 *
 *   1. A FILE IT CANNOT READ IS A FINDING, NEVER A SKIP. Frontmatter that does not parse, a
 *      declaration for some other package, a bump type outside `patch`/`minor`/`major`, a file
 *      declaring the package more than once or not at all: every one of them is named with its
 *      defect. A release gate that steps over the file it could not understand reports readiness
 *      about a queue it did not read.
 *   2. AN EMPTY QUEUE IS NOT READINESS. With nothing pending there is nothing to release, and the
 *      run says so and exits non-zero rather than reporting a clean queue.
 *   3. A `major` IS NEVER CERTIFIED. It is named and the run refuses, whatever the record says: a
 *      first stable release is a decision a human makes deliberately, not one that arrives because
 *      a contributor picked the wrong word in a prompt.
 *   4. THE RECORD AND THE QUEUE MUST BE THE SAME SET. A changeset the record never mentions was
 *      never classified by anyone, and a record naming a file that is gone describes a release
 *      that is not the one about to happen. Both directions are reported by name.
 *
 * IT READS THE CHECKOUT AND NOTHING ELSE. No network call, no registry lookup, no subprocess: the
 * verdict is a function of `package.json`, `.changeset/` and the record. A gate that needs the
 * network cannot run in the place where a release is decided.
 *
 * IT COMPUTES THE RESOLVED VERSION, IT DOES NOT REPLACE THE RELEASE TOOL. The arithmetic here is
 * "apply the strongest pending bump to the manifest version", which is what Changesets does for a
 * single package. That is a claim about the tool, so it is CROSS-CHECKED against the tool rather
 * than asserted: `test/scripts/release-readiness.test.ts` runs the real `changeset version` over a
 * throwaway copy of this checkout and requires the manifest, the exported `VERSION` and the newest
 * generated changelog heading to agree with the number this script printed. If the two ever
 * disagree, the test goes red rather than this script going quietly wrong.
 *
 * USAGE
 *
 *     tsx scripts/release-readiness.ts [--root <dir>] [--record <path>] [--target <version>]
 *
 *   --root    checkout to read (default: the current working directory)
 *   --record  readiness record, relative to the root (default `release/0.1.0-readiness.md`)
 *   --target  version to certify (default: the `target` the record declares)
 *
 * EXIT CODES.  0 ready.  1 not ready, with every reason named.  2 the check could not run: bad
 * arguments, or a manifest or record it could not read. 1 and 2 are kept apart because a run that
 * could not read its inputs must never be mistaken for a queue it judged and passed.
 */

import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** The three bump types Changesets accepts, weakest first. The order IS the aggregation rule. */
const BUMP_TYPES = ["patch", "minor", "major"] as const;
type BumpType = (typeof BUMP_TYPES)[number];

function isBumpType(value: string): value is BumpType {
  return BUMP_TYPES.some((bump) => bump === value);
}

/** A pending declaration, once read. `bump` is absent exactly when the file carries a defect. */
interface PendingChangeset {
  readonly file: string;
  readonly bump?: BumpType;
  readonly defect?: string;
}

interface RecordRow {
  readonly file: string;
  readonly bump: string;
  readonly justification: string;
}

interface ReadinessRecord {
  readonly path: string;
  readonly packageName: string;
  readonly from: string;
  readonly target: string;
  readonly rows: readonly RecordRow[];
}

/** An input the run needed and could not read. Distinct from an unready queue, and exits 2. */
class RefusalError extends Error {}

/* -------------------------------------------------------------------------------------------- */
/* The manifest                                                                                   */
/* -------------------------------------------------------------------------------------------- */

interface Manifest {
  readonly name: string;
  readonly version: string;
}

function readManifest(root: string): Manifest {
  const path = join(root, "package.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new RefusalError(
      `could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new RefusalError(`${path} did not parse to an object`);
  }
  // Spread into an index-signature record rather than casting: the manifest is untrusted input and
  // this check must not lie about having verified its shape. `test/sanity.test.ts` narrows the same
  // way for the same reason.
  const manifest: Record<string, unknown> = { ...parsed };
  const name = manifest["name"];
  const version = manifest["version"];
  if (typeof name !== "string" || name.length === 0) {
    throw new RefusalError(`${path} has no usable \`name\``);
  }
  if (typeof version !== "string" || version.length === 0) {
    throw new RefusalError(`${path} has no usable \`version\``);
  }
  return { name, version };
}

/* -------------------------------------------------------------------------------------------- */
/* The pending queue                                                                              */
/* -------------------------------------------------------------------------------------------- */

/**
 * A deliberately STRICT reader for a changeset's frontmatter.
 *
 * A tolerant YAML parser is the wrong tool here: its job is to accept, and half the criteria this
 * check exists for are about refusing. The format a changeset declares a release in is one line
 * per package between two `---` fences, so it is read as exactly that, and every shape outside it
 * is a defect named on the file rather than a line quietly ignored.
 *
 * Returns the declarations found, or throws with the defect to report.
 */
function parseFrontmatter(text: string): { pkg: string; bump: string }[] {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new RefusalError("frontmatter does not start with a `---` fence on line 1");
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new RefusalError("frontmatter has no closing `---` fence");
  }

  const declarations: { pkg: string; bump: string }[] = [];
  for (let i = 1; i < end; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) continue;
    // `"@scope/name": bump`, with the quotes optional on either side, and nothing else.
    const match =
      /^\s*(?:"([^"]+)"|'([^']+)'|([^:'"\s]+))\s*:\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/.exec(line);
    const pkg = match?.[1] ?? match?.[2] ?? match?.[3];
    const bump = match?.[4] ?? match?.[5] ?? match?.[6];
    if (pkg === undefined || bump === undefined) {
      throw new RefusalError(
        `frontmatter line ${String(i + 1)} is not \`"package": bump\`: ${line.trim()}`,
      );
    }
    declarations.push({ pkg, bump });
  }
  return declarations;
}

/**
 * Every `.md` in `.changeset/` except its own `README.md`, which is Changesets' documentation for
 * contributors and is not a declaration. Sorted, so the report is stable.
 */
function listChangesetFiles(root: string): string[] {
  const dir = join(root, ".changeset");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    throw new RefusalError(
      `could not read ${dir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return entries.filter((name) => name.endsWith(".md") && name !== "README.md").sort();
}

function readPending(root: string, packageName: string): PendingChangeset[] {
  return listChangesetFiles(root).map((file): PendingChangeset => {
    let declarations: { pkg: string; bump: string }[];
    try {
      declarations = parseFrontmatter(readFileSync(join(root, ".changeset", file), "utf8"));
    } catch (error) {
      return { file, defect: error instanceof Error ? error.message : String(error) };
    }

    const mine = declarations.filter((declaration) => declaration.pkg === packageName);
    const foreign = declarations.filter((declaration) => declaration.pkg !== packageName);
    if (foreign.length > 0) {
      const names = foreign.map((declaration) => declaration.pkg).join(", ");
      return { file, defect: `declares a package this repository does not publish: ${names}` };
    }
    if (mine.length === 0) {
      return { file, defect: `declares no release for ${packageName}` };
    }
    if (mine.length > 1) {
      const bumps = mine.map((declaration) => declaration.bump).join(", ");
      return { file, defect: `declares more than one bump type for ${packageName}: ${bumps}` };
    }

    const bump = mine[0]?.bump ?? "";
    if (!isBumpType(bump)) {
      return {
        file,
        defect: `declares the bump type \`${bump}\`, which is not one of ${BUMP_TYPES.join(", ")}`,
      };
    }
    return { file, bump };
  });
}

/* -------------------------------------------------------------------------------------------- */
/* The readiness record                                                                           */
/* -------------------------------------------------------------------------------------------- */

/**
 * The record's header facts, which it states as `- key: \`value\`` lines.
 *
 * Read in one pass with a fixed pattern rather than one built per key. Nothing here is untrusted
 * today, but a regex assembled from a variable is a regex somebody escapes incompletely later, and
 * this needs no assembly at all.
 */
function headerValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of text.matchAll(/^- ([a-z]+): \x60([^\x60]+)\x60[ \t]*$/gm)) {
    if (match[1] !== undefined && match[2] !== undefined) values.set(match[1], match[2]);
  }
  return values;
}

function readRecord(root: string, recordPath: string): ReadinessRecord {
  const path = isAbsolute(recordPath) ? recordPath : join(root, recordPath);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new RefusalError(
      `could not read the readiness record at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const header = headerValues(text);
  const packageName = header.get("package");
  const from = header.get("from");
  const target = header.get("target");
  if (packageName === undefined || from === undefined || target === undefined) {
    throw new RefusalError(
      `the readiness record at ${path} must state \`- package: \`…\`\`, \`- from: \`…\`\` and ` +
        "`- target: `…`` on lines of their own; one or more is missing",
    );
  }

  // One row per classified changeset: file name, bump type, justification. Both of the first two
  // are code-fenced so a row can never be confused with prose that happens to hold a pipe.
  const rows: RecordRow[] = [];
  const rowPattern = /^\|\s*`([^`]+\.md)`\s*\|\s*`([^`]+)`\s*\|(.*)\|\s*$/gm;
  for (const match of text.matchAll(rowPattern)) {
    rows.push({
      file: match[1] ?? "",
      bump: match[2] ?? "",
      justification: (match[3] ?? "").trim(),
    });
  }
  if (rows.length === 0) {
    throw new RefusalError(
      `the readiness record at ${path} classifies no changeset. Expected rows shaped ` +
        "`| `name.md` | `bump` | justification |`.",
    );
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.file)) {
      throw new RefusalError(
        `the readiness record at ${path} classifies \`${row.file}\` more than once`,
      );
    }
    seen.add(row.file);
  }

  return { path, packageName, from, target, rows };
}

/* -------------------------------------------------------------------------------------------- */
/* Resolving the version                                                                          */
/* -------------------------------------------------------------------------------------------- */

function applyBump(version: string, bump: BumpType): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new RefusalError(
      `cannot resolve a release from the version \`${version}\`: expected a plain \`major.minor.patch\``,
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === "major") return `${String(major + 1)}.0.0`;
  if (bump === "minor") return `${String(major)}.${String(minor + 1)}.0`;
  return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
}

/** The strongest bump in the queue: `major` beats `minor` beats `patch`. */
function strongest(bumps: readonly BumpType[]): BumpType | undefined {
  let best: BumpType | undefined;
  for (const bump of bumps) {
    if (best === undefined || BUMP_TYPES.indexOf(bump) > BUMP_TYPES.indexOf(best)) best = bump;
  }
  return best;
}

/* -------------------------------------------------------------------------------------------- */
/* The verdict                                                                                    */
/* -------------------------------------------------------------------------------------------- */

interface Options {
  readonly root: string;
  readonly record: string;
  readonly target?: string;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Options {
  let root = process.cwd();
  let record = "release/0.1.0-readiness.md";
  let target: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root" || arg === "--record" || arg === "--target") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--"))
        throw new UsageError(`${arg} needs a value`);
      if (arg === "--root") root = resolve(value);
      else if (arg === "--record") record = value;
      else target = value;
      i += 1;
      continue;
    }
    throw new UsageError(`unrecognized argument ${String(arg)}`);
  }

  return target === undefined ? { root, record } : { root, record, target };
}

function report(options: Options): { code: number; lines: string[] } {
  const out: string[] = [];
  const problems: string[] = [];

  const manifest = readManifest(options.root);
  const record = readRecord(options.root, options.record);
  const target = options.target ?? record.target;
  const pending = readPending(options.root, manifest.name);

  out.push(`release-readiness: ${manifest.name}`);
  out.push(`  manifest version: ${manifest.version}`);
  out.push(`  record:           ${record.path}`);
  out.push(`  record claims:    ${record.from} -> ${record.target}`);
  out.push(`  certifying:       ${target}`);

  // EVERY pending file is listed with what it declares, defect or not. The report is the artifact a
  // reviewer reads, so a file that could not be classified has to appear IN it, not be missing from
  // it: an omitted line is indistinguishable from a file that was never there.
  out.push(`  pending changesets (${String(pending.length)}):`);
  for (const entry of pending) {
    const width = Math.max(...pending.map((p) => p.file.length));
    const name = entry.file.padEnd(width);
    out.push(`    ${name}  ${entry.bump ?? "DEFECT"}`);
  }

  if (record.packageName !== manifest.name) {
    problems.push(
      `the record is written for \`${record.packageName}\` but the manifest publishes \`${manifest.name}\``,
    );
  }

  for (const entry of pending) {
    if (entry.defect !== undefined) {
      problems.push(`.changeset/${entry.file}: ${entry.defect}`);
    }
  }

  if (pending.length === 0) {
    problems.push(
      "there is nothing to release: `.changeset/` holds no pending release declaration. " +
        "A queue with no declarations cannot certify a version.",
    );
  }

  for (const entry of pending) {
    if (entry.bump === "major") {
      problems.push(
        `.changeset/${entry.file} declares a \`major\` bump. A first stable release is a deliberate ` +
          "human decision, so this check will not certify one.",
      );
    }
  }

  // The record and the queue as SETS, reported in both directions.
  const pendingNames = new Set(pending.map((entry) => entry.file));
  const recordNames = new Set(record.rows.map((row) => row.file));
  for (const name of [...recordNames].sort()) {
    if (!pendingNames.has(name)) {
      problems.push(
        `the record classifies \`${name}\`, which is not in \`.changeset/\`: the record describes a ` +
          "release that is not the one pending",
      );
    }
  }
  for (const name of [...pendingNames].sort()) {
    if (!recordNames.has(name)) {
      problems.push(
        `.changeset/${name} is pending and the record classifies it nowhere: it would ship unreviewed`,
      );
    }
  }

  // A record whose bump types can drift from the files it names is not evidence about the release.
  for (const row of record.rows) {
    const entry = pending.find((candidate) => candidate.file === row.file);
    if (entry?.bump !== undefined && entry.bump !== row.bump) {
      problems.push(
        `the record classifies \`${row.file}\` as \`${row.bump}\` but the file declares \`${entry.bump}\``,
      );
    }
    if (row.justification.length === 0) {
      problems.push(`the record gives no justification for \`${row.file}\``);
    }
  }

  if (manifest.version !== record.from) {
    problems.push(
      `the record was written against version \`${record.from}\` but the manifest is at ` +
        `\`${manifest.version}\`: reclassify against the version this release actually starts from`,
    );
  }

  const bumps = pending.flatMap((entry) => (entry.bump === undefined ? [] : [entry.bump]));
  const aggregate = strongest(bumps);
  if (aggregate !== undefined) {
    const resolved = applyBump(manifest.version, aggregate);
    out.push(`  strongest bump:   ${aggregate}`);
    out.push(`  resolved version: ${resolved}`);
    if (resolved !== target) {
      problems.push(
        `the pending queue resolves to \`${resolved}\`, not the certified \`${target}\`. ` +
          "Reclassify a changeset, or change the target the record claims.",
      );
    }
  }

  if (problems.length > 0) {
    out.push("");
    out.push("NOT READY:");
    for (const problem of problems) out.push(`  - ${problem}`);
    return { code: 1, lines: out };
  }

  out.push("");
  out.push(`OK: ready to release ${target}`);
  return { code: 0, lines: out };
}

function main(argv: readonly string[]): number {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(
      `REFUSED: release-readiness - ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      "Usage: tsx scripts/release-readiness.ts [--root <dir>] [--record <path>] [--target <version>]",
    );
    return 2;
  }

  let verdict: { code: number; lines: string[] };
  try {
    verdict = report(options);
  } catch (error) {
    if (error instanceof RefusalError) {
      console.error(`REFUSED: release-readiness - ${error.message}`);
      return 2;
    }
    throw error;
  }

  const text = verdict.lines.join("\n");
  if (verdict.code === 0) console.log(text);
  else console.error(text);
  return verdict.code;
}

process.exit(main(process.argv.slice(2)));
