#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, made to report its own failure.
 *
 * WHY THIS WRAPPER EXISTS. `attw` prints "This package does not contain types."
 * and exits 0. That is not a bug in `attw`: an untyped package is a legitimate
 * npm package, so the CLI treats "no types at all" as a description rather than
 * a problem. From this repo's own `@arethetypeswrong/cli@0.18.4`, in
 * `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`, first statement:
 *
 *     export function getExitCode(analysis, opts) {
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only after that early return, so no `--profile`,
 * `--ignore-rules` or config setting can reach it. For a package that ships
 * types, "does not contain types" does not mean "fine, untyped". It means THE
 * TYPES WERE NOT IN THE TARBALL, which is a broken publish. `package.json` ran
 * the bare CLI, so the gate complained and its caller read the 0.
 *
 * MEASURED HERE, ON THIS PACKAGE, WITH NO CONCURRENCY (2026-08-03, Node 22,
 * `@arethetypeswrong/cli` 0.18.4). Both states print the sentence and exit 0:
 *
 *     rm -f dist/index.d.ts dist/index.d.cts && pnpm attw   -> untyped, exit 0
 *     rm -rf dist && pnpm attw                              -> untyped, exit 0
 *
 * The first is the realistic one. `tsup` emits the JS bundles in one pass and
 * the declaration files in a later pass, so there is a window in every build of
 * this package where `dist/` holds `.mjs`/`.cjs` and no `.d.ts`. Timed on two
 * clean builds here: `dist/index.mjs` appeared at 3.57s and 3.58s,
 * `dist/index.d.ts` at 5.81s and 5.65s, so the window ran 2.24s and 2.07s. A
 * concurrent build or `pnpm clean` in the same working tree lands `attw` in it.
 *
 * A RACE ONLY SUPPLIES THE CONDITION; IT IS NOT THE DEFECT, and that is why the
 * answer here is not a lock, a lease or a build queue. The gate is supposed to
 * be able to tell you its own inputs were missing, whatever removed them.
 *
 * TWO NETS, and they catch different things, so keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises (`main`, `module`, `types`, `typings`, and every
 *      string leaf of `exports`) must exist and be non-empty before `attw` runs.
 *      This is the net that catches the build window above, and it names the
 *      missing file instead of leaving the reader to infer it. A path with no
 *      leading `./` counts: `"types": "dist/index.d.ts"` is legal and is
 *      normalized rather than skipped. Wildcard `exports` patterns are skipped
 *      (they name a set, not a file), as are absolute paths and `package.json`
 *      itself. A manifest that declares NOTHING is refused rather than passed,
 *      because a preflight with no inputs is not a preflight that succeeded.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The
 *      preflight cannot see this case: the declaration files can be present on
 *      disk and still be absent from the tarball, because `files` (or
 *      `.npmignore`) left them out. No instance of that is on record in this
 *      repo. It is the case `attw --pack` exists to catch, and the whole point
 *      here is that it catches it silently.
 *
 * The post-check matches `attw`'s untyped sentence, which is a plain, un-chalked
 * string in `dist/render/untyped.js`. That makes it blindable, so the arguments
 * and config that would blind it are REFUSED rather than tolerated. See BLINDING
 * below. `test/scripts/attw-gate.test.ts` pins both nets against the real
 * binary, so if an `attw` upgrade reworks the wording or fixes the exit code the
 * suite reds and tells you to revisit this file rather than letting the net go
 * quietly slack.
 *
 * BLINDING. Eight argument forms and one config route were measured here, on this
 * package's own untyped tree, each making the untyped sentence absent from what
 * this script can read while `attw` still exited 0: `--quiet`, `-q`,
 * `--format json`, `-f json`, `--format=json`, `-fjson`, `-qP`, `-Pf json`, and
 * a `.attw.json` setting `quiet` or `format`. The config route works because the
 * CLI calls `readConfig()` inside its action handler, after
 * `program.parse(process.argv)`, so the file's settings land on top of the
 * command line. All are refused below, along with `--config-path`, which would
 * move the config file out of view. That last one is refused by inference, not by
 * measurement.
 *
 * THE LAST THREE ARE WHY SHORT OPTIONS ARE MATCHED BY LETTER RATHER THAN BY
 * TOKEN, and an exact-token set is not enough. `commander` bundles short options
 * and lets a value ride on the end, so `-fjson`, `-qP` and `-Pf json` are all
 * `--format json` or `--quiet` wearing a different spelling. Measured against a
 * fixture whose declarations sit on disk but are excluded from `files` (the one
 * shape only the post-check can see), a token-matching guard handed back exit 0
 * on `-fjson` and on `-Pf json`. `-qP` was caught, but only by the
 * empty-transcript net below and not by the refusal, which is a weaker place to
 * catch it.
 *
 * The refusal is BY OPTION NAME, WHOLESALE, not by value. `--format table-flipped`
 * still prints the sentence and blinds nothing, and is refused anyway; so does
 * every other `--format` value measured (`auto`, `ascii`, `table`), along with
 * `--no-summary`, `--no-emoji` and `--no-color`, which are not refused because
 * they do not name a refused option. That is the deliberate trade:
 * value-parsing these would be a third moving part in the guard, and being
 * over-strict about an argument nobody passes to a repo's own publish gate costs
 * less than a route back to a false green.
 *
 * A SECOND CLASS OF ARGUMENT IS REFUSED FOR A DIFFERENT REASON, and calling it
 * "blinding" would be wrong. `--help`, `-h`, `--version` and `-V` print and exit
 * 0 without analysing anything: measured here on the untyped fixture at 2766 and
 * 48 bytes of output, exit 0, no untyped sentence. The transcript is non-empty,
 * so the empty-transcript net does not fire either, and the gate would have read
 * a pass off a run that checked nothing. `--definitely-typed` is refused
 * alongside them BY INFERENCE, NOT BY MEASUREMENT, and the distinction is kept
 * because the measurement was attempted and did not reproduce: with a version
 * range (`--definitely-typed 4.9`) the untyped sentence still printed. It is
 * refused on a reading of the CLI, where a value that looks like a path takes the
 * `dtIsPath` branch and merges EXTERNAL declarations into the analysis, which
 * would let a package that ships none come back typed. `--no-definitely-typed` is
 * a distinct option name and is deliberately NOT refused, which is what keeps
 * offline runs working.
 *
 * Other arguments are forwarded, so `--profile node16` and friends still work.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ATTW_BIN = fileURLToPath(new URL("../node_modules/.bin/attw", import.meta.url));
const UNTYPED = "This package does not contain types.";
const DECLARATION = /\.d\.[cm]?ts$/;
const args = process.argv.slice(2);

const die = (msg) => {
  process.stderr.write(`\n✗ attw gate: ${msg}\n`);
  process.exit(1);
};

// ---- Refuse the arguments that would make a 0 mean nothing ------------------
// Two classes, and they fail for different reasons.
//
//   BLINDING: the analysis still runs, but the untyped sentence never reaches
//   this script, so the post-check reads a clean transcript over a broken pack.
//
//   NOT_AN_ANALYSIS: attw prints something and exits 0 without analysing the
//   package at all. Measured: `--help`/`-h` and `--version`/`-V` exit 0 with a
//   non-empty transcript and no untyped sentence, so neither the post-check nor
//   the empty-transcript net below can tell them from a pass. Inferred, not
//   measured: `--definitely-typed <path>` takes the CLI's `dtIsPath` branch and
//   merges EXTERNAL declarations, which would let a package that ships none come
//   back typed. With a version range it did NOT reproduce, so it sits with
//   `--config-path` as a refusal on a reading rather than on a measurement.
//
// Long options are matched by name, with any `=value` stripped. Short options are
// matched by LETTER ANYWHERE IN THE CLUSTER, because commander bundles them and
// lets a value ride on the end: `-fjson`, `-qP` and `-Pf json` were each measured
// here to hide the untyped sentence, and an exact-token set matches none of them.
// `--no-definitely-typed` is a distinct option name and is NOT refused, which is
// what keeps the offline test runs working.
const REFUSED_LONG = new Set([
  "--quiet",
  "--format",
  "--config-path",
  "--help",
  "--version",
  "--definitely-typed",
]);
const REFUSED_SHORT = /[qfhV]/;
const refused = (a) =>
  a.startsWith("--")
    ? REFUSED_LONG.has(a.split("=")[0])
    : a.startsWith("-") && a.length > 1 && REFUSED_SHORT.test(a);
const blinding = args.filter(refused);
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused wholesale, by option name and not by value.\n` +
      `  attw exits 0 on an untyped package and this gate reads its printed output,\n` +
      `  so an option that hides that output, or that exits 0 without analysing this\n` +
      `  package's own types, would turn the gate back into a gate-shaped thing. Any\n` +
      `  short-option cluster naming -q, -f, -h or -V is refused with them, because\n` +
      `  commander bundles short options. Run it without them.`,
  );
}
try {
  const config = JSON.parse(readFileSync(".attw.json", "utf8"));
  const set = ["quiet", "format"].filter((k) => k in config);
  if (set.length > 0) {
    die(
      `.attw.json sets ${set.join(", ")}. These keys are refused wholesale, by name and\n` +
        `  not by value: readConfig() applies them after argv, this gate reads attw's\n` +
        `  printed output, and attw exits 0 on an untyped package.`,
    );
  }
} catch {
  // No .attw.json, or unreadable/invalid. attw itself reports the latter.
}

/**
 * Every relative path `package.json` promises to ship, deduped and normalized to
 * a leading `./`.
 *
 * NORMALIZING RATHER THAN SKIPPING IS LOAD-BEARING. `exports` targets must start
 * with `./` and Node rejects them otherwise, but `main`, `module`, `types` and
 * `typings` are relative to the package root either way: `"types": "dist/index.d.ts"`
 * is legal and is the spelling npm's and TypeScript's own documentation uses. A
 * guard that skipped a value with no leading `./` dropped exactly those four
 * fields, silently, and left every sentence describing this preflight broader
 * than the code.
 */
function declaredArtifacts(pkg) {
  const found = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file), the manifest
    // itself, which is in the tarball by definition, and absolute paths, which are
    // not this package's to promise.
    if (v.includes("*") || v.startsWith("/")) return;
    const rel = v.startsWith("./") || v.startsWith("../") ? v : `./${v}`;
    if (rel === "./package.json") return;
    found.add(rel);
  };
  for (const key of ["main", "module", "types", "typings"]) add(pkg[key]);
  const walk = (node) => {
    if (typeof node === "string") add(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(pkg.exports);
  return [...found];
}

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch (err) {
  die(`cannot read ./package.json from ${process.cwd()}: ${err.message}`);
}

// ---- Net 1: preflight -------------------------------------------------------
const declared = declaredArtifacts(pkg);
// A preflight with nothing to check is not a preflight that passed. Refusing here
// is the same discipline the repo's other scanners apply to themselves, and the
// same one net 2 applies below when the transcript comes back empty: this gate
// does not report from a check that read nothing.
if (declared.length === 0) {
  die(
    `package.json declares no artifact paths, so the preflight checked nothing.\n` +
      `  main, module, types and typings are absent or unusable, and exports has no\n` +
      `  usable string leaf either. Declare the package's entry points, or this gate\n` +
      `  is reduced to attw's own exit code, which is 0 on an untyped package.`,
  );
}
const broken = [];
for (const rel of declared) {
  let size;
  try {
    size = statSync(rel).size;
  } catch {
    broken.push({ rel, why: "missing" });
    continue;
  }
  if (size === 0) broken.push({ rel, why: "empty" });
}
if (broken.length > 0) {
  // Only claim the exit-0 counterfactual when a DECLARATION file is among the
  // casualties. With the declarations intact and only JS missing, attw reports
  // no problems at all and still exits 0: a different silence, not this one.
  const declarationsHit = broken.some(({ rel }) => DECLARATION.test(rel));
  die(
    `package.json promises files the build has not produced:\n` +
      broken.map(({ rel, why }) => `    ${rel} (${why})\n`).join("") +
      `\n  Run the build first. If you DID build, something removed or truncated the\n` +
      `  output underneath this run. A concurrent build or \`clean\` in the same\n` +
      `  working tree will do it, and \`tsup\` writes JS before declarations, so there\n` +
      `  is a window where the .d.ts files do not exist yet.\n` +
      (declarationsHit
        ? `  attw would have reported "${UNTYPED}" and EXITED 0 on this tree.\n`
        : `  attw does not gate these: it analyses types, and exits 0 here.\n`),
  );
}

// ---- Run attw ---------------------------------------------------------------
const res = spawnSync(ATTW_BIN, ["--pack", ".", ...args], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (res.error) die(`could not run ${ATTW_BIN}: ${res.error.message}`);
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
if (res.status !== 0) process.exit(res.status ?? 1);

// ---- Net 2: post-check ------------------------------------------------------
// An empty transcript means the post-check read nothing, by some route not listed
// under BLINDING above. Treat that as a failure rather than as a pass: this gate
// is only as good as the output it got to see.
if (output.trim() === "") {
  die(`attw exited 0 but printed nothing, so nothing was checked.`);
}
if (output.includes(UNTYPED)) {
  die(
    `attw reported "${UNTYPED}" and exited 0.\n` +
      `  This package ships types, so that means the tarball did not carry them.\n` +
      `  Check the "files" field and .npmignore. Reported as a failure here because\n` +
      `  attw's own exit code cannot: getExitCode() returns 0 whenever the analysis\n` +
      `  found no types at all, before it ever looks at the problem list.`,
  );
}
