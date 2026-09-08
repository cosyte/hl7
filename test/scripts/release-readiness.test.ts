/**
 * Tests for the release-readiness gate: `scripts/release-readiness.ts` and the committed record at
 * `release/0.1.0-readiness.md`.
 *
 * WHY THIS FILE EXISTS. Changesets turns a directory of declarations into a version number, and the
 * number it lands on is the strongest bump anyone happened to write in a frontmatter line that no
 * reviewer reads. This package published its whole history on the `0.0.x` ladder because the
 * contributor guidance told every contributor to file `patch`, so a queue holding five new typed
 * builders could not resolve to anything but another `0.0.x`. A published version number cannot be
 * recalled, which makes a misclassified queue unrecoverable rather than merely wrong.
 *
 * WHAT EACH GROUP PINS, AND WHY IT IS HERE:
 *
 *  1. THE REAL QUEUE, THROUGH THE REAL SCRIPT. Run as a subprocess so argv parsing, the report and
 *     the exit code are all exercised, against this checkout's own `.changeset/`, `package.json`
 *     and record.
 *  2. END TO END, AGAINST THE REAL TOOL. The pending declarations, this repo's `CHANGELOG.md`,
 *     `src/index.ts` and `scripts/sync-version.mjs` are copied into a throwaway package and the real
 *     `changeset version` is run there, followed by the real version-sync script, exactly as the
 *     `version` script chains them. A check that computed the resolved version and stopped would
 *     prove only that it agrees with itself. This is what proves the arithmetic in the script
 *     matches what the release will actually do, and it is what catches a release that bumps the
 *     manifest while leaving the `VERSION` export or the changelog behind. `test/sanity.test.ts`
 *     guards the same drift from the other side, at test time on the real tree.
 *  3. THE UNHAPPY PATHS, ON SYNTHETIC TREES. A `major` in the queue, an empty queue, three shapes
 *     of malformed frontmatter, a file declaring two bumps, and a record that has drifted from the
 *     queue in either direction. Each gets its own throwaway root, because each has to be the ONLY
 *     thing wrong for the assertion about it to mean anything.
 *  4. THE REGISTRY IS NEVER CONSULTED. The same run, with every proxy and registry setting pointed
 *     at an address that cannot be reached, must reach the identical verdict with identical output.
 *  5. THE TWO NEW FILES STAY OUT OF THE TARBALL, measured by asking the packer for the file list
 *     rather than by reading `files` and reasoning about it. `files` is editable, and the whole
 *     point is to notice if someone edits it.
 *
 * CLOSED UNDER THE RELEASE IT DESCRIBES. A record is evidence about ONE release, and the release it
 * describes is going to happen: once the Version PR lands, the manifest moves off `from` and the
 * queue empties. Every assertion about the live tree is therefore branched on whether the manifest
 * is still at the version the record was written against, and the other branch is not a skip: it
 * asserts the release went where the record said it would. A rule that only held before the release
 * would wedge this repository the first time the release worked, which is the failure
 * `test/scripts/changelog-generation.test.ts` was built around.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no shell-form.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "release-readiness.ts");
const RECORD_RELATIVE = join("release", "0.1.0-readiness.md");
const RECORD_PATH = join(REPO_ROOT, RECORD_RELATIVE);
const INVENTORY_RELATIVE = join("release", "public-api.json");
const CHANGESET_DIR = join(REPO_ROOT, ".changeset");
const CHANGESET_BIN = join(REPO_ROOT, "node_modules", "@changesets", "cli", "bin.js");

const SLOW = 120_000;

const roots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------------------------- */
/* Reading the live tree, the same way the script does but independently of it                    */
/* -------------------------------------------------------------------------------------------- */

/** Every pending declaration in a checkout: `.changeset/*.md` minus Changesets' own README. */
function pendingFiles(root: string): string[] {
  return readdirSync(join(root, ".changeset"))
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
}

function manifestVersion(root: string): string {
  const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null)
    throw new Error("package.json is not an object");
  const record: Record<string, unknown> = { ...parsed };
  const version = record["version"];
  if (typeof version !== "string") throw new Error("package.json `version` is not a string");
  return version;
}

/**
 * The record's header facts, which it states as `- key: \`value\`` lines. Read in one pass with a
 * fixed pattern, never one assembled per key, for the same reason the row readers below do not
 * assemble one per file name.
 */
function recordHeader(key: string): string {
  const text = readFileSync(RECORD_PATH, "utf8");
  for (const match of text.matchAll(/^- ([a-z]+): \x60([^\x60]+)\x60[ \t]*$/gm)) {
    if (match[1] === key && match[2] !== undefined) return match[2];
  }
  throw new Error(`the readiness record states no \`${key}\``);
}

const RECORD_FROM = recordHeader("from");
const RECORD_TARGET = recordHeader("target");

/**
 * Is the release this record describes still ahead of us?
 *
 * The manifest sitting at the version the record was written against is the one fact that says so,
 * and it stays true for exactly as long as the record is live evidence rather than history.
 */
const RECORD_IS_LIVE = manifestVersion(REPO_ROOT) === RECORD_FROM;

function versionParts(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (match === null) throw new Error(`not a plain semver version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(version: string, floor: string): boolean {
  const [a, b, c] = versionParts(version);
  const [x, y, z] = versionParts(floor);
  if (a !== x) return a > x;
  if (b !== y) return b > y;
  return c >= z;
}

/* -------------------------------------------------------------------------------------------- */
/* Running the check                                                                              */
/* -------------------------------------------------------------------------------------------- */

interface Run {
  readonly status: number | null;
  readonly output: string;
}

function runCheck(args: readonly string[], env?: NodeJS.ProcessEnv): Run {
  const result = spawnSync(TSX_BIN, [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
    timeout: SLOW,
    ...(env === undefined ? {} : { env }),
  });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** The frontmatter of a well-formed single-package changeset. */
function changeset(bump: string, summary: string): string {
  return `---\n"@cosyte/hl7": ${bump}\n---\n\n${summary}\n`;
}

/**
 * A throwaway checkout: a manifest, a `.changeset/` directory, a readiness record and a
 * public-export inventory. Every unhappy-path case builds its own so that the one thing it is about
 * is the only thing wrong.
 *
 * EVERY OPTION DEFAULTS TO WELL FORMED, and `null` is how a case removes a part of the record rather
 * than corrupting it. That distinction is what keeps a case about an absent break-candidate section
 * from also being a case about a wrong count: the negative control at the end of this file builds
 * the same fixture with no options at all and requires exit 0, so a fixture that drifted into being
 * unbuildable would take that case down rather than making every refusal above pass vacuously.
 */
function makeRoot(options: {
  version?: string;
  changesets?: Record<string, string>;
  /** File names the record classifies, and the bump it claims for each. */
  recordRows?: Record<string, string>;
  from?: string;
  target?: string;
  /** The counts the record states. `null` omits that line from the record entirely. */
  statedPending?: number | string | null;
  statedMinor?: number | string | null;
  statedExports?: number | string | null;
  /** The body of the break-candidate section. `null` omits the whole section. */
  breakSection?: string | null;
  /** `exportCount` the written inventory records. */
  inventoryExports?: number;
  /** Raw inventory text, written verbatim. `null` writes no inventory file at all. */
  inventory?: string | null;
}): string {
  const dir = tempDir("hl7-readiness-");
  const version = options.version ?? "0.0.10";
  const changesets = options.changesets ?? {};
  const rows =
    options.recordRows ?? Object.fromEntries(Object.keys(changesets).map((n) => [n, "patch"]));

  writeFileSync(
    join(dir, "package.json"),
    // `private` keeps the throwaway package unpublishable even if it escaped the temp directory.
    `${JSON.stringify({ name: "@cosyte/hl7", version, private: true }, null, 2)}\n`,
  );

  mkdirSync(join(dir, ".changeset"));
  writeFileSync(join(dir, ".changeset", "README.md"), "# Changesets\n\nNot a declaration.\n");
  writeFileSync(
    join(dir, ".changeset", "config.json"),
    readFileSync(join(CHANGESET_DIR, "config.json")),
  );
  for (const [name, body] of Object.entries(changesets)) {
    writeFileSync(join(dir, ".changeset", name), body);
  }

  mkdirSync(join(dir, "release"));

  // The inventory the record's stated export count is graded against.
  const inventoryExports = options.inventoryExports ?? 42;
  if (options.inventory !== null) {
    writeFileSync(
      join(dir, INVENTORY_RELATIVE),
      options.inventory ??
        `${JSON.stringify({ typescript: "5.9.3", exportCount: inventoryExports, exports: Array.from({ length: inventoryExports }, (_unused, index) => ({ name: `export${String(index)}`, kind: "variable", type: "string", members: [] })) }, null, 2)}\n`,
    );
  }

  // Counted from the declarations themselves, never from the record's own rows: the point of the
  // check is that the two can disagree, so the fixture's default has to come from the queue.
  const countedMinor = Object.values(changesets).filter((body) =>
    /"@cosyte\/hl7":\s*minor\s*$/m.test(body),
  ).length;

  const table = Object.entries(rows)
    .map(([name, bump]) => `| \`${name}\` | \`${bump}\` | a synthetic justification |`)
    .join("\n");

  const cause = Object.keys(changesets)[0] ?? Object.keys(rows)[0];
  const defaultBreak =
    cause === undefined
      ? "1. **A synthetic narrowing.** Nothing causes it."
      : `1. **A synthetic narrowing.** \`${cause}\`. It narrows something.`;

  /** `- key: \`value\`` when the case states one, and no line at all when it states `null`. */
  function stated(key: string, value: number | string | null | undefined, fallback: number) {
    if (value === null) return [];
    return [`- ${key}: \`${String(value ?? fallback)}\``];
  }

  writeFileSync(
    join(dir, RECORD_RELATIVE),
    [
      "# synthetic readiness record",
      "",
      "- package: `@cosyte/hl7`",
      `- from: \`${options.from ?? version}\``,
      `- target: \`${options.target ?? "0.1.0"}\``,
      "",
      "## Pending changesets",
      "",
      ...stated("pending", options.statedPending, Object.keys(changesets).length),
      ...stated("minor", options.statedMinor, countedMinor),
      "",
      "| changeset | bump | justification |",
      "| --- | --- | --- |",
      table,
      "",
      ...(options.breakSection === null
        ? []
        : ["## Break candidates", "", options.breakSection ?? defaultBreak, ""]),
      "## Public export surface",
      "",
      ...stated("exports", options.statedExports, inventoryExports),
      "",
    ].join("\n"),
  );

  return dir;
}

/* -------------------------------------------------------------------------------------------- */
/* 1. The real queue                                                                              */
/* -------------------------------------------------------------------------------------------- */

describe("the pending queue in this checkout", () => {
  it(
    "reports every pending changeset with the single bump type it declares",
    { timeout: SLOW },
    () => {
      if (!RECORD_IS_LIVE) {
        // The release this record describes has happened. The record is history now, and the fact
        // worth keeping is that the release went where it said it would.
        expect(atLeast(manifestVersion(REPO_ROOT), RECORD_TARGET)).toBe(true);
        return;
      }

      const run = runCheck([]);
      expect(run.output).toContain("OK: ready to release");
      expect(run.status).toBe(0);

      // The file name AND the bump it declares, on one line, for every file without exception.
      // Parsed ONCE with a fixed pattern and compared as a map, rather than building a pattern per
      // file name: interpolating a name into a regex means escaping it, and an escape that handles
      // only the dot is the incomplete-sanitization defect in miniature.
      const reported = new Map<string, string>();
      for (const line of run.output.split("\n")) {
        const match = /^\s+(\S+\.md)\s+(patch|minor|major)$/.exec(line);
        if (match?.[1] !== undefined && match[2] !== undefined) reported.set(match[1], match[2]);
      }

      const files = pendingFiles(REPO_ROOT);
      expect(files.length).toBeGreaterThan(0);
      expect([...reported.keys()].sort()).toEqual(files);
      expect(run.output).not.toContain("DEFECT");
    },
  );

  it(
    "resolves the pending declarations to the version the record certifies",
    { timeout: SLOW },
    () => {
      if (!RECORD_IS_LIVE) {
        expect(atLeast(manifestVersion(REPO_ROOT), RECORD_TARGET)).toBe(true);
        return;
      }
      const run = runCheck([]);
      expect(run.status).toBe(0);
      expect(run.output).toContain(`resolved version: ${RECORD_TARGET}`);
      expect(run.output).toContain(`OK: ready to release ${RECORD_TARGET}`);
      // The target this whole exercise exists to reach, asserted as itself rather than only as
      // "whatever the record happens to say".
      expect(RECORD_TARGET).toBe("0.1.0");
    },
  );

  it("reaches the same verdict with the package registry unreachable", { timeout: SLOW }, () => {
    // Every route a Node process would take to a registry or a proxy is pointed at a port nothing
    // listens on. Same verdict, same bytes: the check reads the checkout and nothing else.
    const offline: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_registry: "http://127.0.0.1:1/",
      npm_config_offline: "true",
      HTTP_PROXY: "http://127.0.0.1:1/",
      HTTPS_PROXY: "http://127.0.0.1:1/",
      http_proxy: "http://127.0.0.1:1/",
      https_proxy: "http://127.0.0.1:1/",
      NO_PROXY: "",
      no_proxy: "",
    };
    const online = runCheck([]);
    const cut = runCheck([], offline);
    expect(cut.status).toBe(online.status);
    expect(cut.output).toBe(online.output);

    // THE NEW INPUT IS INSIDE THAT IDENTITY. `release/public-api.json` is read on every run, and a
    // check that reached the same verdict because it consulted neither the registry NOR the
    // inventory would satisfy the two assertions above without proving anything about the
    // inventory. The report names the count it read, so both runs demonstrably read it.
    expect(online.output).toMatch(/public exports:\s+\d+ \(release\/public-api\.json\)/);
    expect(cut.output).toMatch(/public exports:\s+\d+ \(release\/public-api\.json\)/);

    // And again on a synthetic root, so the identity is not an artifact of this checkout being the
    // only tree either run ever looked at.
    const root = makeRoot({
      changesets: { "adds.md": changeset("minor", "adds something") },
      recordRows: { "adds.md": "minor" },
    });
    const syntheticOnline = runCheck(["--root", root]);
    const syntheticCut = runCheck(["--root", root], offline);
    expect(syntheticCut.status).toBe(syntheticOnline.status);
    expect(syntheticCut.output).toBe(syntheticOnline.output);
    expect(syntheticOnline.status).toBe(0);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 2. The real tool, on a throwaway copy of this checkout                                          */
/* -------------------------------------------------------------------------------------------- */

describe("the release tooling applied to a throwaway copy of the checkout", () => {
  it(
    "leaves the manifest, the VERSION export and the newest changelog heading all naming the target",
    { timeout: SLOW },
    () => {
      if (!RECORD_IS_LIVE) {
        expect(atLeast(manifestVersion(REPO_ROOT), RECORD_TARGET)).toBe(true);
        return;
      }

      const dir = tempDir("hl7-release-sim-");
      const version = manifestVersion(REPO_ROOT);

      // The real pending declarations, the real changelog, the real barrel and the real version-sync
      // script. Nothing here is a stand-in except the manifest, which is trimmed to what the two
      // tools read and marked private so the copy is unpublishable.
      mkdirSync(join(dir, ".changeset"));
      copyFileSync(join(CHANGESET_DIR, "config.json"), join(dir, ".changeset", "config.json"));
      for (const file of pendingFiles(REPO_ROOT)) {
        copyFileSync(join(CHANGESET_DIR, file), join(dir, ".changeset", file));
      }
      copyFileSync(join(REPO_ROOT, "CHANGELOG.md"), join(dir, "CHANGELOG.md"));
      mkdirSync(join(dir, "src"));
      copyFileSync(join(REPO_ROOT, "src", "index.ts"), join(dir, "src", "index.ts"));
      mkdirSync(join(dir, "scripts"));
      copyFileSync(
        join(REPO_ROOT, "scripts", "sync-version.mjs"),
        join(dir, "scripts", "sync-version.mjs"),
      );
      writeFileSync(
        join(dir, "package.json"),
        `${JSON.stringify({ name: "@cosyte/hl7", version, private: true, prettier: "@cosyte/prettier-config" }, null, 2)}\n`,
      );

      // Changesets resolves Prettier from the tree it writes into and falls back to its own bundled
      // Prettier 2 when it finds none, which is not the formatter any release of this package uses.
      // Links rather than copies, the same way `test/scripts/changelog-generation.test.ts` does it.
      mkdirSync(join(dir, "node_modules", "@cosyte"), { recursive: true });
      symlinkSync(
        join(REPO_ROOT, "node_modules", "prettier"),
        join(dir, "node_modules", "prettier"),
      );
      symlinkSync(
        join(REPO_ROOT, "node_modules", "@cosyte", "prettier-config"),
        join(dir, "node_modules", "@cosyte", "prettier-config"),
      );

      const versioned = spawnSync(process.execPath, [CHANGESET_BIN, "version"], {
        cwd: dir,
        encoding: "utf8",
        shell: false,
        timeout: 90_000,
      });
      expect(versioned.status, `${versioned.stdout ?? ""}${versioned.stderr ?? ""}`).toBe(0);

      const synced = spawnSync(process.execPath, [join(dir, "scripts", "sync-version.mjs")], {
        cwd: dir,
        encoding: "utf8",
        shell: false,
        timeout: 60_000,
      });
      expect(synced.status, `${synced.stdout ?? ""}${synced.stderr ?? ""}`).toBe(0);

      // 1. The manifest.
      expect(manifestVersion(dir)).toBe(RECORD_TARGET);

      // 2. The exported VERSION value, produced by the real sync script from the real barrel.
      expect(readFileSync(join(dir, "src", "index.ts"), "utf8")).toContain(
        `export const VERSION: string = "${RECORD_TARGET}";`,
      );

      // 3. The newest version heading in the generated changelog, compared as a HEADING and not as a
      //    substring: `## 0.1.0` is a prefix of the `## 0.1.10` a later release will legitimately
      //    write, so a `toContain` here goes red on a release rather than on a defect.
      const headings = readFileSync(join(dir, "CHANGELOG.md"), "utf8")
        .split("\n")
        .filter((line) => /^## /.test(line));
      expect(headings[0]).toBe(`## ${RECORD_TARGET}`);
    },
  );
});

/* -------------------------------------------------------------------------------------------- */
/* 3. The unhappy paths                                                                           */
/* -------------------------------------------------------------------------------------------- */

describe("the check refuses rather than certifying", () => {
  it("names a `major` and certifies nothing", () => {
    const root = makeRoot({
      changesets: {
        "a-minor.md": changeset("minor", "adds something"),
        "b-major.md": changeset("major", "breaks something"),
      },
      recordRows: { "a-minor.md": "minor", "b-major.md": "major" },
    });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    expect(run.output).toContain("b-major.md");
    expect(run.output).toContain("`major`");
    expect(run.output).not.toContain("ready to release");
  });

  it("reports an empty queue as nothing to release, not as readiness", () => {
    // The record still has to classify something for the fixture to be well formed, so it names a
    // file that is not there; both problems are reported and neither is readiness.
    const root = makeRoot({ changesets: {}, recordRows: { "gone.md": "minor" } });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    expect(run.output).toContain("nothing to release");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a file whose frontmatter does not parse, rather than skipping it", () => {
    const root = makeRoot({
      changesets: {
        "good.md": changeset("minor", "fine"),
        "unfenced.md": '---\n"@cosyte/hl7": minor\n\nno closing fence\n',
      },
      recordRows: { "good.md": "minor", "unfenced.md": "minor" },
    });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    expect(run.output).toContain("unfenced.md");
    expect(run.output).toContain("closing");
    // Named in the pending listing too: a defective file that is missing from the report is
    // indistinguishable from a file that was never there.
    expect(run.output).toContain("DEFECT");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a file declaring another package, rather than skipping it", () => {
    const root = makeRoot({
      changesets: {
        "foreign.md": '---\n"@cosyte/fhir": minor\n---\n\nsomebody else\n',
        "good.md": changeset("minor", "fine"),
      },
      recordRows: { "foreign.md": "minor", "good.md": "minor" },
    });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    expect(run.output).toContain("foreign.md");
    expect(run.output).toContain("@cosyte/fhir");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a file declaring a bump type outside patch/minor/major", () => {
    const root = makeRoot({
      changesets: {
        "hotfix.md": changeset("hotfix", "not a bump type"),
        "good.md": changeset("minor", "fine"),
      },
      recordRows: { "hotfix.md": "hotfix", "good.md": "minor" },
    });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    expect(run.output).toContain("hotfix.md");
    expect(run.output).toContain("hotfix");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a file declaring more than one bump type for the package", () => {
    const root = makeRoot({
      changesets: {
        "twice.md": '---\n"@cosyte/hl7": patch\n"@cosyte/hl7": minor\n---\n\ntwo bumps\n',
      },
      recordRows: { "twice.md": "patch" },
    });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    expect(run.output).toContain("twice.md");
    expect(run.output).toContain("more than one bump type");
    expect(run.output).not.toContain("ready to release");
  });

  it("names each missing and each extra entry when the record and the queue disagree", () => {
    const root = makeRoot({
      changesets: {
        "present-and-named.md": changeset("minor", "classified"),
        "present-but-unnamed.md": changeset("patch", "never classified"),
      },
      recordRows: { "present-and-named.md": "minor", "named-but-absent.md": "patch" },
    });
    const run = runCheck(["--root", root]);
    expect(run.status).not.toBe(0);
    // Both directions, by name.
    expect(run.output).toContain("named-but-absent.md");
    expect(run.output).toContain("present-but-unnamed.md");
    expect(run.output).not.toContain("ready to release");
  });

  it("refuses, distinguishably, when it cannot read its own inputs", () => {
    // Exit 2, not 1: a run that never read the queue must not be filed beside a queue it judged.
    const dir = tempDir("hl7-readiness-void-");
    const run = runCheck(["--root", dir]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("REFUSED");
  });

  it("certifies a well-formed queue, so the refusals above are not vacuous", () => {
    // The negative control. Without it every assertion above would pass on a check that refuses
    // everything it is ever handed.
    const root = makeRoot({
      changesets: {
        "adds.md": changeset("minor", "adds something"),
        "fixes.md": changeset("patch", "corrects something"),
      },
      recordRows: { "adds.md": "minor", "fixes.md": "patch" },
    });
    const run = runCheck(["--root", root]);
    expect(run.output).toContain("OK: ready to release 0.1.0");
    expect(run.status).toBe(0);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 3b. The measurements the record STATES                                                          */
/* -------------------------------------------------------------------------------------------- */

/**
 * The counts, the certified export-surface size and the break-candidate attributions were prose
 * until now: they could drift arbitrarily far from `.changeset/` and `release/public-api.json` with
 * every gate in this repository still green, which is how a readiness record accretes rather than
 * being re-derived. Each case below is the only defect in its own throwaway root, and each asserts
 * on the NUMBERS or the NAME in the output rather than only on the exit code, because a refusal that
 * does not say which number disagreed sends a reader back to counting by hand.
 */
describe("the record's stated measurements are recounted, not believed", () => {
  /** Two declarations, one `minor` and one `patch`: counted pending 2, counted `minor` 1. */
  const twoDeclarations = {
    "adds.md": changeset("minor", "adds something"),
    "fixes.md": changeset("patch", "corrects something"),
  };
  const twoRows = { "adds.md": "minor", "fixes.md": "patch" };

  it("names the stated and the counted number when the pending count is wrong", () => {
    const root = makeRoot({
      changesets: twoDeclarations,
      recordRows: twoRows,
      statedPending: 7,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("pending-declaration count");
    expect(run.output).toContain("7");
    expect(run.output).toContain("this run counted 2");
    expect(run.output).not.toContain("ready to release");
  });

  it("names the stated and the counted number when the `minor` count is wrong", () => {
    const root = makeRoot({
      changesets: twoDeclarations,
      recordRows: twoRows,
      statedMinor: 2,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("`minor` declaration count");
    expect(run.output).toContain("this run counted 1");
    expect(run.output).not.toContain("ready to release");
  });

  it("reports a count the record declines to state, rather than skipping the comparison", () => {
    // A measurement the record never made cannot be told from one that passed, so an absent count
    // is a finding. It is exit 1 and not exit 2: every input was read, and it is the RECORD that is
    // incomplete, not the checkout.
    const root = makeRoot({
      changesets: twoDeclarations,
      recordRows: twoRows,
      statedPending: null,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("states no pending-declaration count");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a stated count that is not a number at all", () => {
    const root = makeRoot({
      changesets: twoDeclarations,
      recordRows: twoRows,
      statedMinor: "several",
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("several");
    expect(run.output).toContain("not a number");
    expect(run.output).not.toContain("ready to release");
  });

  it("names both numbers when the stated export-surface size is wrong", () => {
    const root = makeRoot({
      changesets: twoDeclarations,
      recordRows: twoRows,
      inventoryExports: 313,
      statedExports: 300,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("public-export-surface size");
    expect(run.output).toContain("300");
    expect(run.output).toContain("this run counted 313");
    expect(run.output).not.toContain("ready to release");
  });

  it("agrees when the stated export-surface size matches the inventory", () => {
    // The negative control for the pair above: without it, a check that reported this problem
    // unconditionally would pass every assertion in this describe block.
    const root = makeRoot({
      changesets: twoDeclarations,
      recordRows: twoRows,
      inventoryExports: 313,
      statedExports: 313,
    });
    const run = runCheck(["--root", root]);
    expect(run.output).toContain("public exports:   313");
    expect(run.output).toContain("OK: ready to release");
    expect(run.status).toBe(0);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 3c. The break candidates, held to the pending queue                                             */
/* -------------------------------------------------------------------------------------------- */

/**
 * A break candidate is a claim that this release removes, renames or narrows something, and the
 * pending declaration it names is what makes the claim checkable. A candidate whose cause has
 * already shipped names a file that is no longer in `.changeset/`, and that IS the carried-over
 * entry: the whole reason this section drifted is that nothing in the repository could tell a
 * re-derived list from an inherited one.
 */
describe("the break-candidate section is held to the pending queue", () => {
  const oneDeclaration = { "adds.md": changeset("minor", "adds something") };
  const oneRow = { "adds.md": "minor" };

  it("names a candidate attributed to a changeset that is not pending", () => {
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      breakSection: "1. **`thing` narrows.** `already-shipped.md`. Its cause landed a release ago.",
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("already-shipped.md");
    expect(run.output).toContain("not pending");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a stale attribution that has been moved out of the numbered list into prose", () => {
    // The same staleness, one paragraph over. Holding only the numbered entries to the queue would
    // leave a carried-over claim a place to sit where nothing reads it.
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      breakSection: [
        "1. **`thing` narrows.** `adds.md`. A live candidate.",
        "",
        "Three further changes are additive at run time: see `already-shipped.md`.",
      ].join("\n"),
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("already-shipped.md");
    expect(run.output).toContain("not pending");
    expect(run.output).not.toContain("ready to release");
  });

  it("names a candidate that attributes itself to nothing", () => {
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      breakSection: "1. **`thing` narrows.** Something somewhere caused this.",
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("names no changeset file");
    expect(run.output).not.toContain("ready to release");
  });

  it("says the break-candidate section is missing rather than passing over it", () => {
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      breakSection: null,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("Break candidates");
    expect(run.output).toContain("no `## Break candidates` section");
    expect(run.output).not.toContain("ready to release");
  });

  it("reports a section it can find but from which it can read no candidate", () => {
    // The sharper half of the case above: the heading is there, so a check that looked only for the
    // heading would report a section it never actually read as assessed.
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      breakSection: "Nothing worth listing here, we had a look.",
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("holds no candidate this check can read");
    expect(run.output).not.toContain("ready to release");
  });

  it("accepts a candidate attributed to a declaration that is pending", () => {
    // The negative control for this block.
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      breakSection: "1. **`thing` narrows.** `adds.md`. Remedy: do the other thing.",
    });
    const run = runCheck(["--root", root]);
    expect(run.output).toContain("OK: ready to release");
    expect(run.status).toBe(0);
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 3d. The public-export inventory is an input, and a missing one refuses                           */
/* -------------------------------------------------------------------------------------------- */

/**
 * Exit 2 throughout, and that is the whole point of these four. A run that could not read the
 * inventory has not compared the certified surface against anything, and reporting a clean queue
 * after one of them would certify a surface by omission: `release/public-api.json` is the only
 * written record that the public type surface moved, and the record's claim about its size is
 * evidence only for as long as something recomputes it.
 */
describe("the public-export inventory refuses rather than being skipped", () => {
  const oneDeclaration = { "adds.md": changeset("minor", "adds something") };
  const oneRow = { "adds.md": "minor" };

  it("refuses at exit 2 when the inventory is absent, naming the file", () => {
    const root = makeRoot({ changesets: oneDeclaration, recordRows: oneRow, inventory: null });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("REFUSED");
    expect(run.output).toContain("public-api.json");
    expect(run.output).not.toContain("ready to release");
  });

  it("refuses at exit 2 when the inventory is not valid JSON", () => {
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      inventory: "{ this is not json,\n",
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("REFUSED");
    expect(run.output).toContain("not valid JSON");
    expect(run.output).not.toContain("ready to release");
  });

  it("refuses at exit 2 when the inventory carries no usable `exportCount`", () => {
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      inventory: `${JSON.stringify({ typescript: "5.9.3", exports: [] }, null, 2)}\n`,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("REFUSED");
    expect(run.output).toContain("exportCount");
    expect(run.output).not.toContain("ready to release");
  });

  it("refuses at exit 2 when the inventory's head disagrees with its own body", () => {
    // A hand-edited count. The number the record would be graded against is then not the size of
    // the surface the file records, so there is nothing here to compare and the run says so.
    const root = makeRoot({
      changesets: oneDeclaration,
      recordRows: oneRow,
      inventory: `${JSON.stringify(
        {
          typescript: "5.9.3",
          exportCount: 313,
          exports: [{ name: "only", kind: "variable", type: "string", members: [] }],
        },
        null,
        2,
      )}\n`,
    });
    const run = runCheck(["--root", root]);
    expect(run.status).toBe(2);
    expect(run.output).toContain("REFUSED");
    expect(run.output).toContain("313");
    expect(run.output).toContain("lists 1 exports");
    expect(run.output).not.toContain("ready to release");
  });
});

/* -------------------------------------------------------------------------------------------- */
/* 4. The committed record, and the tarball                                                        */
/* -------------------------------------------------------------------------------------------- */

describe("the committed readiness record", () => {
  it("classifies every pending changeset with a bump and a justification", () => {
    if (!RECORD_IS_LIVE) {
      expect(atLeast(manifestVersion(REPO_ROOT), RECORD_TARGET)).toBe(true);
      return;
    }
    // Read every classified row once with a fixed pattern, then compare as sets. Same reasoning as
    // above: a pattern built per file name would have to escape that name completely, and this
    // needs no pattern building at all. A row only counts when its justification cell is non-empty.
    const text = readFileSync(RECORD_PATH, "utf8");
    const rowPattern =
      /^\|\s*\x60(\S+\.md)\x60\s*\|\s*\x60(patch|minor|major)\x60\s*\|\s*\S[^|]*\|\s*$/gm;
    const classified = new Map<string, string>();
    for (const match of text.matchAll(rowPattern)) {
      if (match[1] !== undefined && match[2] !== undefined) classified.set(match[1], match[2]);
    }

    expect([...classified.keys()].sort()).toEqual(pendingFiles(REPO_ROOT));
    expect(RECORD_FROM).toBe(manifestVersion(REPO_ROOT));
  });

  it("says whether any break candidate was found, rather than leaving it open", () => {
    const text = readFileSync(RECORD_PATH, "utf8");
    expect(text).toContain("## Break candidates");
    // Either candidates are listed by name with the changeset that would cause them, or the record
    // says in so many words that none were found. Silence is the one answer that is not allowed.
    const listsCandidates = /^\d+\. \*\*/m.test(text);
    const saysNone = /none were found/i.test(text);
    expect(listsCandidates || saysNone).toBe(true);
  });

  it("states in one line that publication awaits the release frequency policy", () => {
    expect(readFileSync(RECORD_PATH, "utf8")).toMatch(/awaits the release frequency policy/);
  });

  it("says something about every pending declaration in its break-candidate section", () => {
    // SILENCE ABOUT A DECLARATION IS THE STALENESS THIS SECTION DRIFTS INTO. The attribution check
    // in the script catches a candidate whose cause has SHIPPED; it cannot catch a declaration that
    // arrived after the section was written and was never assessed at all, because an absent
    // sentence names nothing. So the record accounts for every pending file, either by causing a
    // candidate or by saying in so many words that it removes, renames and narrows nothing, and this
    // is what holds it to that.
    if (!RECORD_IS_LIVE) {
      expect(atLeast(manifestVersion(REPO_ROOT), RECORD_TARGET)).toBe(true);
      return;
    }

    const text = readFileSync(RECORD_PATH, "utf8");
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.trim() === "## Break candidates");
    expect(start, "the record carries no `## Break candidates` section").toBeGreaterThan(-1);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^## /.test(lines[i] ?? "")) {
        end = i;
        break;
      }
    }
    const section = lines.slice(start + 1, end).join("\n");

    // Read once with a fixed pattern and compared as a set, never one pattern built per file name:
    // interpolating a name into a regex means escaping it, and this needs no assembly at all.
    const named = new Set<string>();
    for (const match of section.matchAll(/\x60([^\x60\s]+\.md)\x60/g)) {
      if (match[1] !== undefined) named.add(match[1]);
    }
    for (const file of pendingFiles(REPO_ROOT)) {
      expect(named.has(file), `the break-candidate section says nothing about ${file}`).toBe(true);
    }
  });
});

describe("the publishable tarball", () => {
  it("excludes the readiness record and the public-export inventory", { timeout: SLOW }, () => {
    // Asked of the packer, not derived from `files`. `files` is editable, and an edit to it is
    // exactly what this case exists to catch.
    //
    // THE TARBALL IS BUILT AND OPENED, rather than `npm pack --json` being parsed, and that is a
    // correction rather than a preference: `npm pack` runs the `prepare` lifecycle script, which
    // here is `simple-git-hooks`, and that writes `[INFO] Successfully set the pre-commit ...` to
    // STDOUT ahead of the JSON. `--ignore-scripts` suppresses it on the npm bundled with Node 24 and
    // does NOT on the one bundled with Node 22, so `--json` output is a JSON document on some of
    // this repo's supported runtimes and a JSON document with a prefix on the others. Two CI runs
    // on the same commit showed it, one green and one red. Reading the archive costs one temp
    // directory and depends on nobody's stdout hygiene, and it measures the bytes a consumer would
    // actually receive rather than the packer's summary of them.
    //
    // `--ignore-scripts` stays anyway, so a test never rewrites the developer's git hooks as a side
    // effect. Nothing in this repo's prepack chain contributes a file to the tarball.
    const packDir = tempDir("hl7-pack-");
    const packed = spawnSync(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", packDir, "--loglevel", "error"],
      { cwd: REPO_ROOT, encoding: "utf8", shell: false, timeout: SLOW },
    );
    expect(packed.status, `${packed.stdout ?? ""}${packed.stderr ?? ""}`).toBe(0);

    // Located by reading the directory, not by parsing the name off stdout, for the same reason.
    const archives = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
    expect(archives, `npm pack wrote no tarball into ${packDir}`).toHaveLength(1);

    const listed = spawnSync("tar", ["-tzf", join(packDir, archives[0] ?? "")], {
      encoding: "utf8",
      shell: false,
      timeout: SLOW,
    });
    expect(listed.status, `${listed.stdout ?? ""}${listed.stderr ?? ""}`).toBe(0);

    // Every entry npm writes sits under `package/`. Directory entries are dropped: a tarball may or
    // may not carry them, and what this case is about is files a consumer receives.
    const paths = (listed.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("package/") && !line.endsWith("/"))
      .map((line) => line.slice("package/".length))
      .sort();

    // A floor first, so an empty or unreadable listing can never satisfy the exclusions vacuously.
    expect(paths).toContain("package.json");
    expect(paths).toContain("README.md");
    expect(paths).not.toContain(RECORD_RELATIVE);
    expect(paths).not.toContain(INVENTORY_RELATIVE);
    expect(paths.filter((path) => path.startsWith("release/"))).toEqual([]);
  });
});
