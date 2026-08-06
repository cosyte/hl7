/**
 * Tests for the CHANGELOG generation contract: `.changeset/config.json` plus the
 * shape of `CHANGELOG.md` that makes generated output land where a reader expects
 * it.
 *
 * WHY THIS FILE EXISTS. `CHANGELOG.md` is listed in `package.json#files`, so it is
 * inside every published tarball. For the whole of this package's published
 * history the release wrote no version heading into it, because
 * `.changeset/config.json` set `"changelog": false`, and the file was instead
 * hand-maintained under one `[Unreleased]` heading that nothing ever rolled over.
 * The published tarball therefore described its own contents as unreleased, and
 * its preamble said the first release "will ship" an API surface that had shipped
 * months earlier. That is not a typo to correct by hand: correcting the prose
 * leaves the mechanism that produced it, and it drifts again on the next release.
 *
 * WHAT EACH TEST PINS, AND WHY IT IS HERE:
 *
 *  1. The flag itself. `changelog` must name a generator that really resolves and
 *     really exports the two functions Changesets calls. `false` is a legal value
 *     that silently produces no version heading at all, which is the state this
 *     work replaced.
 *  2. THE DEFECT, ASSERTED DIRECTLY: no `[Unreleased]` heading and no
 *     `[Unreleased]` link definition survive in the file. With generation on, a
 *     surviving hand-maintained `[Unreleased]` heading is worse than before, not
 *     better: the generated version section is prepended ABOVE it, leaving already
 *     released content sitting under "Unreleased" forever.
 *  3. That the file is still shipped. If it ever leaves `files`, tests 2 and 4 are
 *     still nice-to-have but stop being about a consumer-visible defect, and the
 *     next reader deserves to be told which it is.
 *  4. END TO END, AGAINST THE REAL TOOL. The repo's real `CHANGELOG.md` and real
 *     `.changeset/config.json` are copied into a throwaway package, a synthetic
 *     changeset is added, and the real `changeset version` is run. A test that
 *     reimplements where Changesets inserts text proves only that the test agrees
 *     with itself, and would keep passing through the upgrade that moved it.
 *  5. A CONTROL PROVING THE FLAG IS LOAD-BEARING. The same inputs with
 *     `"changelog": false` must produce NO version heading. Without this, test 4
 *     would pass on a config change that did nothing.
 *  6. THE SHAPE INVARIANT, and the negative control that explains it. Changesets
 *     prepends by replacing the FIRST newline in the file, so exactly one line can
 *     sit above generated output. Prose on line 3 does not stay at the top of the
 *     document; it is pushed below the newest release, splitting the header. The
 *     control reproduces that on the shape this file used to have, so the rule is
 *     demonstrated rather than asserted.
 *
 * Every case runs in a temp directory built from scratch. Nothing here writes to
 * the repo, bumps its version, or consumes a real changeset: the copies are read
 * only on this side and the mutation happens in the temp tree.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, afterAll } from "vitest";

const REPO_ROOT = process.cwd();
const CHANGELOG_PATH = join(REPO_ROOT, "CHANGELOG.md");
const CONFIG_PATH = join(REPO_ROOT, ".changeset", "config.json");
const CHANGESET_BIN = join(REPO_ROOT, "node_modules", "@changesets", "cli", "bin.js");

/** The heading the hand-written history was moved under. Generated sections sit above it. */
const ARCHIVE_HEADING = "## Released before this file was generated";
const PROBE_SUMMARY = "A synthetic entry written by the changelog generation test.";

const changelog = readFileSync(CHANGELOG_PATH, "utf8");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { changelog?: unknown };

/** The two functions Changesets calls on whatever `changelog` names. */
interface ChangelogFunctions {
  getReleaseLine?: unknown;
  getDependencyReleaseLine?: unknown;
}
type ChangelogModule = ChangelogFunctions & { default?: ChangelogFunctions };

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/**
 * Build a throwaway single-package repo and run the real `changeset version` in it.
 * Returns the resulting `CHANGELOG.md` and the version `package.json` was bumped to.
 */
function runVersion(opts: { changelogBody: string; changelogSetting: unknown }): {
  changelog: string;
  version: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "hl7-changelog-"));
  roots.push(dir);
  mkdirSync(join(dir, ".changeset"));
  writeFileSync(join(dir, "CHANGELOG.md"), opts.changelogBody);
  writeFileSync(
    join(dir, ".changeset", "config.json"),
    JSON.stringify({
      changelog: opts.changelogSetting,
      commit: false,
      fixed: [],
      linked: [],
      access: "public",
      baseBranch: "main",
      updateInternalDependencies: "patch",
      ignore: [],
    }),
  );
  writeFileSync(
    join(dir, ".changeset", "probe.md"),
    `---\n"@cosyte/hl7": patch\n---\n\n${PROBE_SUMMARY}\n`,
  );
  // `private` keeps the throwaway package unpublishable even if it escaped the temp dir.
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "@cosyte/hl7", version: "0.0.0", private: true }),
  );

  const r = spawnSync(process.execPath, [CHANGESET_BIN, "version"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(r.status, `${r.stdout ?? ""}${r.stderr ?? ""}`).toBe(0);

  const bumped = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
  return { changelog: readFileSync(join(dir, "CHANGELOG.md"), "utf8"), version: bumped.version };
}

/** Every ATX heading in a markdown document, in document order. */
const headings = (text: string): string[] =>
  text.split("\n").filter((line) => /^#{1,6} /.test(line));

describe("changelog generation is on", () => {
  it("names a changelog generator that resolves and exports what Changesets calls", () => {
    // `false` is the value this package shipped its whole published history under,
    // and it is the reason no release ever wrote a version heading.
    expect(config.changelog).not.toBe(false);
    expect(typeof config.changelog).toBe("string");

    const require = createRequire(CONFIG_PATH);
    const mod = require(config.changelog as string) as ChangelogModule;
    const fns = mod.default ?? mod;
    expect(typeof fns.getReleaseLine).toBe("function");
    expect(typeof fns.getDependencyReleaseLine).toBe("function");
  });

  it("keeps CHANGELOG.md in the published tarball, which is why any of this matters", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      files?: string[];
    };
    expect(pkg.files ?? []).toContain("CHANGELOG.md");
  });
});

describe("CHANGELOG.md carries no hand-maintained Unreleased section", () => {
  it("has no [Unreleased] heading", () => {
    // With generation on this is not merely stale: the release prepends its version
    // section ABOVE this heading, so released content would sit under "Unreleased"
    // permanently, in the tarball.
    expect(headings(changelog).filter((h) => h.includes("[Unreleased]"))).toEqual([]);
  });

  it("has no [Unreleased] link definition left behind", () => {
    expect(changelog).not.toMatch(/^\[Unreleased\]:/m);
  });

  it("makes no future-tense promise about a release in its header", () => {
    // The published preamble read: the first pre-alpha release "will ship" the API
    // surface below. It had shipped, several versions earlier, in this same file.
    const header = changelog.slice(0, changelog.indexOf("### "));
    expect(header).not.toMatch(/will ship/i);
  });
});

describe("the shape that makes generated output land correctly", () => {
  it("keeps the H1 as the only line above the first section heading", () => {
    // Changesets prepends by replacing the FIRST newline in the file. Anything on a
    // later line is pushed below the newest release section, so a paragraph here
    // would be split off from the H1 by the next release. The negative control
    // below reproduces exactly that.
    const lines = changelog.split("\n");
    expect(lines[0]).toBe("# Changelog");
    const nextContent = lines.slice(1).find((line) => line.trim() !== "");
    expect(nextContent).toBe(ARCHIVE_HEADING);
  });

  it(
    "writes the new version section between the H1 and the archived history",
    { timeout: 90_000 },
    () => {
      const result = runVersion({
        changelogBody: changelog,
        changelogSetting: config.changelog,
      });

      expect(result.version).not.toBe("0.0.0");
      expect(headings(result.changelog).slice(0, 3)).toEqual([
        "# Changelog",
        `## ${result.version}`,
        "### Patch Changes",
      ]);
      // The archived history survives, below the release that was just written.
      expect(result.changelog).toContain(ARCHIVE_HEADING);
      expect(result.changelog.indexOf(`## ${result.version}`)).toBeLessThan(
        result.changelog.indexOf(ARCHIVE_HEADING),
      );
      // The changeset's own summary is what landed as the entry.
      expect(result.changelog).toContain(PROBE_SUMMARY);
    },
  );

  it(
    "writes no version heading at all when the generator is off (the control)",
    { timeout: 90_000 },
    () => {
      const result = runVersion({ changelogBody: changelog, changelogSetting: false });

      expect(result.version).not.toBe("0.0.0");
      // The version bump still happens. The changelog is simply never touched,
      // which is the whole defect: nothing tells a reader the release went out.
      expect(result.changelog).toBe(changelog);
      expect(result.changelog).not.toContain(`## ${result.version}`);
      expect(result.changelog).not.toContain(PROBE_SUMMARY);
    },
  );

  it(
    "splits the header when prose follows the H1 (the negative control)",
    { timeout: 90_000 },
    () => {
      const oldShape = [
        "# Changelog",
        "",
        "All notable changes to this project will be documented in this file.",
        "",
        "## [Unreleased]",
        "",
        "### Added",
        "",
        "- something that has already shipped",
        "",
      ].join("\n");

      const result = runVersion({
        changelogBody: oldShape,
        changelogSetting: config.changelog,
      });

      // The release section is inserted between the H1 and the preamble, so the
      // preamble now reads as part of the release, and `[Unreleased]` still holds
      // shipped content below it.
      expect(headings(result.changelog)).toEqual([
        "# Changelog",
        `## ${result.version}`,
        "### Patch Changes",
        "## [Unreleased]",
        "### Added",
      ]);
      expect(result.changelog.indexOf("All notable changes")).toBeGreaterThan(
        result.changelog.indexOf(PROBE_SUMMARY),
      );
    },
  );
});
