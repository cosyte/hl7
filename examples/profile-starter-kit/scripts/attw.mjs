#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, made to report its own failure.
 *
 * WHY THIS WRAPPER EXISTS, AND WHY YOU SHOULD KEEP IT. `attw` prints "This
 * package does not contain types." and exits 0. That is not a bug in `attw`: an
 * untyped package is a legitimate npm package, so the CLI treats "no types at
 * all" as a description rather than a problem. From `@arethetypeswrong/cli`
 * 0.18.4, in `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`, first
 * statement:
 *
 *     export function getExitCode(analysis, opts) {
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only after that early return, so no `--profile`,
 * `--ignore-rules` or config setting can reach it. For a package that ships
 * types, "does not contain types" does not mean "fine, untyped". It means the
 * types were not in the tarball, which is a broken publish. `prepublishOnly`
 * runs this gate last, so with the bare CLI a broken publish reads as a pass.
 *
 * Measured on this kit before the wrapper existed: `attw --pack .` over a tree
 * with no `dist/` printed the untyped sentence and exited 0, with no concurrency
 * involved. `tsup` emits the JS bundles in one pass and the declaration files in
 * a later pass, so there is a window in every build where `dist/` holds
 * `.mjs`/`.cjs` and no `.d.ts`. A concurrent build or `pnpm clean` in the same
 * working tree lands `attw` in it. That race only supplies the condition; it is
 * not the defect, which is why the answer is not a lock or a build queue. The
 * gate has to be able to say its own inputs were missing, whatever removed them.
 *
 * TWO NETS, and they catch different things, so keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises (`main`, `module`, `types`, `typings`, and every
 *      string leaf of `exports`) must exist and be non-empty before `attw` runs.
 *      This is the net that catches the build window above, and it names the
 *      missing file instead of leaving you to infer it. It follows whatever your
 *      `package.json` declares, so it keeps working after you rename things.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The
 *      preflight cannot see this case: the declaration files can be present on
 *      disk and still be absent from the tarball, because `files` (or
 *      `.npmignore`) left them out. If you edit `files`, this is the net that
 *      catches you.
 *
 * The post-check matches `attw`'s untyped sentence, which is a plain, un-chalked
 * string in the CLI's `dist/render/untyped.js`, so it is blindable. `--quiet`,
 * `-q`, `--format json`, `-f json`, `--format=json` and a `.attw.json` setting
 * `quiet` or `format` each hide that sentence and hand back exit 0 over an
 * untyped pack, so all of them are refused below, along with `--config-path`,
 * which would move the config file out of view. Short options are refused BY
 * LETTER ANYWHERE IN THE CLUSTER rather than by whole token, because `commander`
 * bundles them and lets a value ride on the end: `-fjson`, `-qP` and `-Pf json`
 * are `--format json` and `--quiet` in a different spelling, and a token-matching
 * guard was measured to hand back exit 0 on the first and the third. The refusal
 * is by option name, wholesale, not by value: value-parsing them would be a third
 * moving part in the guard, and being over-strict about an argument nobody passes
 * to a publish gate costs less than a route back to a silent pass. Other
 * arguments are forwarded, so `--profile node16` and friends still work.
 *
 * If a future `attw` fixes the exit code or rewords that sentence, net 2 goes
 * quietly slack while net 1 keeps working. Re-read this file when you upgrade.
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

// ---- Refuse what would blind the post-check --------------------------------
// Long options are matched by name, with any `=value` stripped. Short options are
// matched by LETTER ANYWHERE IN THE CLUSTER, because commander bundles them and
// lets a value ride on the end: `-fjson`, `-qP` and `-Pf json` all hide the
// untyped sentence, and an exact-token set matches none of them.
const BLINDING_LONG = new Set(["--quiet", "--format", "--config-path"]);
const BLINDING_SHORT = /[qf]/;
const blinds = (a) =>
  a.startsWith("--")
    ? BLINDING_LONG.has(a.split("=")[0])
    : a.startsWith("-") && a.length > 1 && BLINDING_SHORT.test(a);
const blinding = args.filter(blinds);
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused wholesale, by option name and not by value.\n` +
      `  This gate reads attw's printed output, attw exits 0 on an untyped package,\n` +
      `  and some values of these options hide that output. Any short-option cluster\n` +
      `  naming -q or -f is refused with them, because commander bundles them.\n` +
      `  Run it without them.`,
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

/** Every relative path `package.json` promises to ship, deduped. */
function declaredArtifacts(pkg) {
  const found = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file) and the
    // manifest itself, which is always in the tarball by definition.
    if (!v.startsWith(".") || v.includes("*") || v === "./package.json") return;
    found.add(v);
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
const broken = [];
for (const rel of declaredArtifacts(pkg)) {
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
