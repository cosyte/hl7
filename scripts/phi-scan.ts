#!/usr/bin/env tsx
/**
 * `@cosyte/hl7` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps. Walks the synthetic HL7 v2 test fixtures (and a
 * conservative text pass over `src/`) and REFUSES anything that looks like real
 * PHI, so a developer cannot commit a real-looking HL7 v2 fixture by accident.
 *
 * HL7 v2 carries PHI by design (patient names, dates of birth, SSNs, MRNs /
 * account numbers, addresses, phones / emails, and free-text observations).
 * Unlike a JSON fixture, an HL7 v2 message is byte-strict at the front: the
 * `MSH` (or batch `FHS` / `BHS`) segment must be the first thing in the file, so
 * an inline `# synthetic: true` header is impossible (it would break every
 * parser test). This is the same constraint DICOM hits with binary `.dcm` files
 * and X12 hits with `.edi`, and we solve it the same proven way: a **synthetic
 * allow-list** (`scripts/phi-allow-list.txt`) is the positive declaration that a
 * fixture's identifiers are fake. Any realistic-PHI-shaped token not covered by
 * the allow-list is a hit. Adding a new synthetic fixture therefore means either
 * reusing known-synthetic tokens or consciously extending the allow-list: a
 * reviewed act, never silent.
 *
 * Detection is HL7-shape-aware, NOT a blind text regex: the scanner parses each
 * message's delimiters (from `MSH-1` / `MSH-2`), splits segments → fields →
 * repetitions → components, and inspects only the fields that actually carry
 * each PHI category. That is deliberate: a naive `Family^Given` text scan trips
 * on coded values like `CBC^Complete Blood Count^LN` or `Boston^MA`, giving
 * false confidence. See `phi-scan-overrides.md` for the category → field map and
 * the documented limitations.
 *
 * SECURITY: every subprocess is `git`, invoked via `execFileSync` with array
 * args only. Never shell-form spawn.
 *
 * A scan that could not read what it enumerated REFUSES (exit 2) rather than
 * reporting a clean tree it never observed; that is the property that makes the
 * gate worth having and it is not negotiable. The one bounded exception is the
 * enumeration's own TOCTOU window, documented on `Target.tolerateVanish`: an
 * UNTRACKED file the walk listed itself and that is gone by the time we read it
 * (a build tool's transient) is reported as skipped instead of refusing. A
 * tracked file, a non-`ENOENT` failure, and a file that reappears all still
 * refuse, and `all` mode refuses outright if it ended up observing nothing.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass one path; rejected unless logged in
 *                              phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error).
 *
 * ---------------------------------------------------------------------------
 * AN IN-SCOPE ENTRY THAT IS NOT A REGULAR FILE REFUSES THE SCAN (exit 2). It is
 * never silently skipped, because BOTH enumerating routes are blind to it in a
 * way that reads as clean:
 *
 *   - the walk enumerates `Dirent.isFile()`, which is an lstat answer, so a
 *     symbolic link is neither a file nor a directory and used to fall out of
 *     the loop silently, whatever it pointed at. `isDirectory()` answers false
 *     for a LINKED DIRECTORY too, so a whole subtree left with it;
 *   - `--staged` reads content with `git show :<path>`, and git stores a
 *     symbolic link as its TARGET PATH under mode 120000, so that route is
 *     handed the path text and never the target's bytes. That route is this
 *     repo's pre-commit hook (`pnpm phi-scan --staged`).
 *
 * So a link under a scan root pointing at a PHI-bearing file scanned CLEAN on
 * both, reproduced here before the fix. Neither route is made to follow it:
 * following would read bytes the enumeration does not control (outside the
 * repo, a loop, a device, a FIFO that blocks the gate forever), and git does not
 * carry those bytes anyway, so a hit on them would be a claim about something no
 * commit contains. Refusing states the only true thing available: there is an
 * entry here the scan cannot account for, so the scan is not clean.
 *
 * "In scope" is each route's own existing boundary, not a new one: the walk
 * still excludes a gitignored entry (the same rule that already excludes a
 * gitignored file, so links do not get a second, stricter boundary of their
 * own), and `--staged` looks at `test/fixtures/**` and `src/**.ts` PLUS each
 * root's own path (`test/fixtures` and `src`), which is the one addition to the
 * path scope and is explained at `buildTargetsForStaged`.
 *
 * THREE PLACES `--staged` NOW ADMITS **MORE** THAN IT DID, called out rather
 * than folded into "narrowing", because all three change what it enumerates:
 * rename detection is OFF, so a rename destination arrives as an ordinary add
 * instead of vanishing with its two-path record; and an UNMERGED path is
 * enumerated so it can be refused instead of passed over in silence; and a scan
 * ROOT'S OWN path is in scope, so an entry that REPLACES a root is judged
 * instead of skipped. See `buildTargetsForStaged` for the measurements.
 *
 * A refusal names the entry's own repo-relative path and an engine-owned token
 * for its kind. IT NEVER REPORTS THE LINK TARGET, which is text off the working
 * tree and can itself carry PHI: a target path of the shape
 * `../patients/<surname>-<given>-<dob>.txt` is the whole reason. The shape is
 * written out rather than an example, because a diagnostic ABOUT a PHI leak is
 * itself a PHI surface, and that applies to the prose explaining it too.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, statSync, existsSync, readdirSync, type Dirent } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// Roots walked in "all" mode. test/fixtures gets the full HL7-aware scan; src
// gets a conservative text pass (dashed-SSN + non-test email only) because it is
// hand-written code, not data: JSDoc `@example` HL7 snippets carry synthetic
// names/MRNs that must not trip the segment-aware detectors.
const FIXTURE_ROOT = join(REPO_ROOT, "test", "fixtures");
const SRC_ROOT = join(REPO_ROOT, "src");

// Person-name fields keyed by segment id. XPN fields carry family in component 1
// (`Doe^John`); XCN fields carry an id in component 1 and the family/given in
// components 2/3 (`ATTEND^Smith^Jane`). The distinction is load-bearing: read
// the wrong components and every provider name slips through.
const XPN_NAME_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PID: [5, 6, 9], // patient name / mother's maiden name / alias
  NK1: [2, 30], // next-of-kin name / contact person name
  GT1: [3], // guarantor name
  IN1: [16], // insured's name
  MRG: [7], // prior patient name
  STF: [3], // staff name
};
const XCN_NAME_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PV1: [7, 8, 9, 17, 52], // attending / referring / consulting / admitting / other provider
  PD1: [4], // patient primary care provider
  ORC: [10, 11, 12, 19], // entered by / verified by / ordering provider / action by
  OBR: [10, 16, 28, 32, 33, 34, 35], // collector / ordering provider / copies-to / interpreters
  OBX: [16, 25], // responsible observer / performing org medical director
  DG1: [16], // diagnosing clinician
  PR1: [11], // procedure practitioner
  AIP: [3], // scheduled personnel
  TXA: [9, 10, 11], // originator / assigned authenticator / transcriptionist
  ROL: [4], // role person
};

const DOB_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PID: [7], // patient date of birth
  NK1: [16], // next-of-kin date of birth
};
const ADDRESS_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PID: [11], // patient address
  NK1: [4], // next-of-kin address
  GT1: [5], // guarantor address
  IN1: [19], // insured's address
};
const PHONE_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PID: [13, 14], // home / business phone
  NK1: [5, 6, 7], // phone / business phone / contact phone
  GT1: [6, 7], // guarantor phone
};
// CX identifier lists (MRN / account / SSN-typed). Component 1 is the id, the
// 5th component is the CX identifier-type-code (`MR` / `AN` / `SS` / `SSN`).
const CX_ID_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PID: [3, 18], // patient identifier list / account number
};
// Plain SSN fields (HL7 type ST: a bare number, not a CX list).
const SSN_ST_FIELDS: Readonly<Record<string, readonly number[]>> = {
  PID: [19], // SSN number - patient
};

// Name tokens that are HL7 name-type / degree / suffix / prefix codes, never a
// person's identifying name: extracted alongside real name tokens and skipped.
const NAME_NOISE_TOKENS = new Set<string>([
  "MD",
  "DO",
  "DR",
  "MR",
  "MRS",
  "MS",
  "JR",
  "SR",
  "II",
  "III",
  "IV",
  "RN",
  "NP",
  "PA",
  "PHD",
  "DDS",
  "DMD",
  "ESQ",
  "PROF",
  "FNP",
  "APRN",
]);

// Standard HL7 v2 segment ids. A segment id NOT in this set (a `Z…` site-defined
// segment, or anything unrecognized) has no known field schema, so it gets the
// unknown-segment name backstop rather than the precise field map. Mirrors
// `src/parser/known-segments.ts` (the parser's own source of truth).
const KNOWN_SEGMENTS = new Set<string>([
  "MSH",
  "MSA",
  "EVN",
  "ERR",
  "SFT",
  "PID",
  "PD1",
  "MRG",
  "PV1",
  "PV2",
  "PDA",
  "PDC",
  "PEO",
  "DB1",
  "NK1",
  "GT1",
  "IN1",
  "IN2",
  "IN3",
  "ACC",
  "AL1",
  "DG1",
  "PRB",
  "IAM",
  "FAM",
  "GOL",
  "PR1",
  "OBR",
  "OBX",
  "ORC",
  "SPM",
  "TQ1",
  "TQ2",
  "NTE",
  "UB1",
  "UB2",
  "FT1",
  "RXA",
  "RXC",
  "RXD",
  "RXE",
  "RXG",
  "RXO",
  "RXR",
  "RXV",
  "SCH",
  "AIG",
  "AIL",
  "AIP",
  "AIS",
  "ARQ",
  "APR",
  "RGS",
  "TXA",
  "MFE",
  "MFI",
  "MFA",
  "MCP",
  "LDP",
  "LCH",
  "LOC",
  "LRL",
  "LCC",
  "ROL",
  "STF",
  "PRA",
  "EDU",
  "CER",
  "CTD",
  "CTI",
  "ORG",
  "PRC",
  "PRD",
  "QAK",
  "QPD",
  "QRF",
  "QRI",
  "QID",
  "RDF",
  "RDT",
  "DSC",
  "DSP",
  "EQL",
  "OMC",
  "FHS",
  "BHS",
  "BTS",
  "FTS",
  "CSR",
  "CSP",
  "CSS",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  segment: string; // segment id + field (e.g. "PID-5") or "(text)"
  value: string;
  reason: string;
}

interface AllowList {
  /** Uppercase synthetic person-name tokens (XPN / XCN name components). */
  names: Set<string>;
  /** Synthetic dates of birth, normalized (YYYYMMDD or a bare YYYY year). */
  dobs: Set<string>;
  /** Synthetic street-address lines (XAD component 1), lower-cased. */
  addresses: Set<string>;
  /** Synthetic id values that legitimately match an SSN / bare-MRN shape. */
  ids: Set<string>;
  /** Allowed email domains (anything else is a hit). */
  emailDomains: Set<string>;
}

interface Delimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[];
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  // An `--allow-fixture` path is a *subtractive* acknowledgement on a broader
  // scan, never a scan target on its own: so it also seeds the positional path
  // set. That makes `--allow-fixture X` mean "scan X, but allow it" (proving the
  // override gate actually subtracts a scanned target) instead of a silent no-op.
  const scanPaths = paths.length > 0 ? paths : [...allowFixtures];

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (scanPaths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths: scanPaths, allowFixtures };
}

/**
 * The `errno` string of a Node system error (`ENOENT`, `EACCES`, ...), or
 * `undefined` for anything else. Narrowed with `in` rather than cast, so a
 * thrown non-error cannot masquerade as a system error.
 */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const { code } = err;
  return typeof code === "string" ? code : undefined;
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  const names = new Set<string>();
  const dobs = new Set<string>();
  const addresses = new Set<string>();
  const ids = new Set<string>();
  const emailDomains = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const tag = line.slice(0, sp);
    const value = line.slice(sp + 1).trim();
    if (value.length === 0) continue;
    switch (tag) {
      case "NAME":
        names.add(value.toUpperCase());
        break;
      case "DOB":
        dobs.add(value);
        break;
      case "ADDR":
        addresses.add(value.toLowerCase());
        break;
      case "ID":
        ids.add(value.toUpperCase());
        break;
      case "EMAILDOMAIN":
        emailDomains.add(value.toLowerCase());
        break;
      default:
        break;
    }
  }
  return { names, dobs, addresses, ids, emailDomains };
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  return rel.split(sep).join("/");
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) return new Set();
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) out.add(normalizePath(m[1]));
  }
  return out;
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing = allowFixtures.map(normalizePath).filter((p) => !overrides.has(p));
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

interface Target {
  path: string; // forward-slash repo-relative path for reporting
  read: () => Buffer;
  /**
   * Absolute path, set only for a target the walk enumerated itself, so a
   * vanished file can be re-checked once the sweep has finished.
   */
  absPath?: string;
  /**
   * TOCTOU: true only for a file the scanner ENUMERATED ITSELF in `all` mode
   * AND that git does not track. `all` mode lists its roots first and reads
   * each file afterwards, so a transient build artifact can be deleted inside
   * that window: the read throws `ENOENT` and the whole sweep refuses.
   *
   * THIS REPO IS NOT REACHABLE THROUGH THAT WINDOW TODAY, AND THE REASON IS
   * SCOPE, NOT DESIGN. `tsup` writes `tsup.config.bundled_<hash>.mjs` at the
   * REPO ROOT and removes it when the build ends, and `test/docs-content.test.ts`
   * runs a build from inside the suite while this scanner sweeps in all mode
   * from another worker; the two really do race. But the walk is rooted at
   * `test/fixtures` and `src`, so a repo-root transient is never enumerated
   * here, and `@cosyte/ccda` (whose walk starts at the repo root) is the sibling
   * that took the hit: an entire publish-time sweep refused with exit 2. Nothing
   * gitignores that filename in this repo either, so WIDENING A WALK ROOT, or
   * any tool that drops a transient under one, reintroduces it verbatim. This is
   * hardening ahead of that, not the repair of a live defect.
   *
   * Only the ENUMERATION was ever unsound, never the refusal, so the fix is
   * scoped hard rather than by relaxing what a failed read means:
   *   - a TRACKED file is never tolerated. The committed corpus is what the
   *     gate promises to have observed, so if a tracked file cannot be read
   *     the scan is incomplete and still refuses (exit 2);
   *   - only `ENOENT` is tolerated. `EACCES`, `EISDIR` and friends are not a
   *     file that went away, they are a scan that failed;
   *   - a tolerated file is re-checked after the sweep and reported. If it is
   *     back on disk, the sweep did not observe a file that exists now, so the
   *     run refuses;
   *   - `staged` mode reads blobs out of the git index (`git show :path`), so
   *     the pre-commit gate never depends on this at all.
   *
   * RESIDUAL, stated rather than hidden: the re-check is keyed on the PATH the
   * walk enumerated, not on content, so the general class is CONTENT THAT
   * SURVIVES AT A PATH THE WALK DID NOT ENUMERATE. A rename is the obvious
   * instance (`ENOENT` at the old path, never enumerated under the new one, so
   * the bytes go unscanned under a clean report) and a hard link followed by an
   * unlink is the other. It is bounded: the file has to be untracked, so
   * committing it means `git add`, after which it is tracked and untolerable,
   * and pre-commit reads the index either way (measured: `--staged` still
   * reports the hit with the file deleted from disk). Closing it needs a
   * content-addressed sweep, which is a different design, not a wider bound.
   */
  tolerateVanish?: boolean;
}

/**
 * An entry the enumeration reached but cannot scan. Both fields are safe to
 * print: `path` is the entry's own repo-relative path (the same locus every hit
 * already carries) and `kind` is a token from the closed set below. Nothing off
 * the other side of a link is ever recorded here.
 */
interface Unscannable {
  path: string;
  kind: string;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function direntKind(e: Dirent): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

/**
 * Enumerate a scan root. `Dirent`'s predicates are lstat answers and are not
 * exhaustive: an entry that is neither a directory nor a regular file is
 * collected into `unscannable` rather than dropped, so the caller can refuse
 * instead of reporting clean over it. See the banner at the top of this file for
 * why nothing here follows a link.
 *
 * ONE PRE-EXISTING scope limit of the walk is UNCHANGED here, and is named so it
 * is not mistaken for either the TOCTOU window above or the refusal below:
 *
 *   - WORKING TREE ONLY. A tracked file that is absent from the worktree is not
 *     enumerated at all in `all` mode, so it is skipped rather than refused: the
 *     tracked-file bound above governs a file the walk DID list and then could
 *     not read, not one it never saw. `--staged` catches such a file when it is
 *     ADDED (measured, exit 1), so the coverage is at add time and PAST TENSE:
 *     once it is committed and removed from the worktree both routes report
 *     clean. This is not what the non-regular-entry refusal closes, and reading
 *     it as closed would be reading a bigger claim than the code makes.
 *
 * Widening the walk to close it is a different slice, and it is not a reason to
 * soften anything above.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[]): void {
  if (!existsSync(dir)) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // A directory the walk cannot list is an incomplete enumeration, so it
    // refuses (exit 2) rather than reporting clean over whatever is inside it.
    // Named as an InvocationError so it reaches the scanner's own diagnostic
    // channel: an uncaught fs error exits 1, which this gate reserves for HITS.
    throw new InvocationError(
      `could not enumerate ${normalizePath(dir)}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, unscannable);
    } else if (e.isFile()) {
      // README/markdown docs may legitimately describe violator values; they
      // are documentation, not fixtures.
      if (e.name.toLowerCase().endsWith(".md")) continue;
      out.push(full);
    } else {
      // Deliberately NOT subject to the `.md` exemption above. That exemption is
      // a judgement about a file whose bytes the walk could have read; a link's
      // name is no evidence at all about what is on the other side of it.
      unscannable.push({ path: normalizePath(full), kind: direntKind(e) });
    }
  }
}

/**
 * Refuse (exit 2) over entries the enumeration reached and cannot scan. EVERY
 * offender is named, not just the first: a developer who has to re-run the gate
 * once per link learns to distrust it.
 */
function refuseUnscannable(entries: Unscannable[], why: string, remedy: string): void {
  if (entries.length === 0) return;
  const lines = entries.map((u) => `  - ${u.path} (${u.kind})`).join("\n");
  const noun =
    entries.length === 1 ? "entry is not a regular file" : "entries are not regular files";
  throw new InvocationError(
    `refusing the scan: ${String(entries.length)} ${noun}:\n${lines}\n${why} ${remedy}`,
  );
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding,
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches: treat as none ignored.
  }
  return ignored;
}

/**
 * Every path git tracks, or `null` when git could not answer. `null` means the
 * tolerance below is switched off entirely (fail closed): without the tracked
 * set we cannot tell a build transient from committed content.
 *
 * An EMPTY answer counts as no answer for the same reason. `git ls-files` exits
 * 0 with no output for a repo whose index is empty (a REMOVED `.git/index`; a
 * corrupt one exits non-zero and lands in the `catch`), and an empty set would
 * make EVERY file untracked, which is the one state in which the tracked-file
 * bound below silently stops existing. This repo always tracks files, so there
 * is no legitimate empty case here.
 */
function gitTracked(): Set<string> | null {
  try {
    // SECURITY: array-form execFileSync, no shell. `-z` is NUL-separated and
    // unquoted, so it matches the walk's forward-slash relative paths exactly.
    const out = execFileSync("git", ["ls-files", "-z"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tracked = new Set<string>();
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) tracked.add(p);
    }
    return tracked.size > 0 ? tracked : null;
  } catch {
    return null;
  }
}

function buildTargetsForAll(): Target[] {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  walk(FIXTURE_ROOT, files, unscannable);
  walk(SRC_ROOT, files, unscannable);

  // One `git check-ignore` over both lists. An ignored entry is already out of
  // scope for the file route, so applying the same rule to a link keeps a single
  // boundary rather than inventing a second, stricter one for links alone.
  const ignored = gitIgnored([...files, ...unscannable.map((u) => u.path)]);

  refuseUnscannable(
    unscannable.filter((u) => !ignored.has(u.path)),
    "The walk can neither read such an entry nor vouch for what is on the other side of it.",
    "Remove it, replace it with a regular file, or (if it is genuinely not part of the " +
      "corpus) untrack it and add it to .gitignore.",
  );

  const tracked = gitTracked();
  return files
    .map((abs) => ({ abs, rel: normalizePath(abs) }))
    .filter(({ rel }) => !ignored.has(rel))
    .map(({ abs, rel }) => ({
      path: rel,
      read: () => readFileSync(abs),
      absPath: abs,
      tolerateVanish: tracked !== null && !tracked.has(rel),
    }));
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

/** git's file modes for a regular blob. Every other mode is not a file to read. */
const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);

/** Closed-set, engine-owned description of a git file mode. */
function gitModeKind(mode: string): string {
  if (mode === "120000") return "a symbolic link";
  if (mode === "160000") return "a gitlink (a nested repository)";
  return `a git mode-${mode} entry`;
}

/** `:<srcmode> <dstmode> <srcsha> <dstsha> <status>`: the info half of a `--raw -z` record. */
const RAW_RECORD = /^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/;

/**
 * Refuse (exit 2) over in-scope paths git reports as UNMERGED. Separate from
 * `refuseUnscannable` because the reason is different in kind: such a path is
 * usually a perfectly ordinary regular file, and what it lacks is a SINGLE
 * staged blob rather than a readable type.
 */
function refuseUnmerged(paths: string[]): void {
  if (paths.length === 0) return;
  const lines = paths.map((p) => `  - ${p}`).join("\n");
  const noun = paths.length === 1 ? "path is unmerged" : "paths are unmerged";
  throw new InvocationError(
    `refusing the scan: ${String(paths.length)} in-scope ${noun}:\n${lines}\n` +
      "An unmerged path is recorded at one or more of stages 1/2/3 and never at stage 0, so " +
      "`git show :<path>` " +
      "fails outright and there is no one staged blob for the scan to read. " +
      "Resolve the conflict and `git add` the result.",
  );
}

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. `--raw` rather than
    // `--name-only` because the DESTINATION MODE is the only thing that
    // distinguishes a staged regular file from a staged symlink or gitlink, and
    // `git show :<path>` answers all three without complaint.
    //
    // `T` (TYPECHANGE) IS IN THE FILTER, AND LEAVING IT OUT MADE THE MODE CHECK
    // BELOW UNREACHABLE WHENEVER THE FILE WAS ALREADY TRACKED. Replacing a
    // TRACKED regular file with a link is not an add and not a modify: git
    // raises it as `T` (`:100644 120000 <sha> <sha> T`), so `--diff-filter=AM`
    // deleted the record before any mode could be read and the pre-commit hook
    // passed the link green. Typechange carries a single path, exactly like `A`
    // and `M`, so admitting it costs the two-field stride below nothing, and it
    // also scans the REVERSE typechange (a link replaced by a real file bearing
    // PHI) as the file it became.
    //
    // `--no-renames` FOR THE SAME REASON, AND THE FILTER ALONE WAS NOT ENOUGH.
    // Rename detection is on by default, and neither `AM` nor `AMT` returns `R`
    // or `C`, so `git mv <link> test/fixtures/<name>` staged as
    // `:120000 120000 <sha> <sha> R100` with TWO paths and the filter deleted the
    // record outright: an ordinary `git mv` put a mode-120000 entry under a scan
    // root and this route printed "OK: no hits" (measured, exit 0). A rename that
    // also SUBSTITUTES a real name into the moved file passed identically
    // (measured at `R098`, mode 100644, a real-looking surname in the staged
    // blob). Turning detection off makes the destination arrive as an ordinary
    // single-path `A` (`:000000 120000 0000000 <sha> A`) and the source a `D` the
    // filter drops, which costs the two-field stride below nothing and needs no
    // two-path record shape. Verified under `diff.renames=true|copies|false|1`
    // and `diff.renameLimit=1`: every one yields the same single-path `A`, so the
    // stride is STRUCTURAL rather than conditional on the caller's git config,
    // and the new enumeration CONTAINS the old one. Be exact about that
    // relation, because the loose form of it was itself refuted in review: the
    // two enumerations are EQUAL whenever nothing is renamed or copied, and
    // larger only when something is. It is a superset, not a strictly larger
    // set, and nothing the old argv enumerated stops being enumerated.
    //
    // `U` (UNMERGED) IS IN THE FILTER SO IT CAN BE REFUSED, NOT SCANNED. Such a
    // path carries one or more of stages 1/2/3 and never stage 0, so `git show`
    // fails on the `:<path>` form; it
    // was returned by neither `AM` nor `AMT`, and this route reported
    // "OK: no hits" over an index it could not read (measured, exit 0, with a
    // real-looking surname in one of the stages). Git itself refuses to commit
    // while a path is unmerged, so this was never a route to a committed leak;
    // what it was is a gate attesting clean over a state it never observed, and
    // `pnpm phi-scan --staged` is run by hand and from scripts as well as from
    // the hook. `U` carries a single path like `A`/`M`/`T`, so it costs the
    // stride nothing either.
    //
    // THE STRIDE BELOW IS COUPLED TO THIS ARGV, so read the coupling before
    // editing it. `--no-renames` is what makes a two-path record impossible, and
    // `-M`, `-C` and `--find-copies-harder` each turn detection back on over the
    // top of it: measured on a real rename stage, every one of the three empties
    // this route again. Do not add them. `-B` is INERT here and is not one of
    // them. If a two-path record ever did arrive the stride
    // desyncs and the run REFUSES rather than scanning a short list, which is the
    // safe direction, but that is a backstop and not the guarantee.
    listBuf = execFileSync(
      "git",
      ["diff", "--cached", "--raw", "-z", "--no-renames", "--diff-filter=AMTU"],
      {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `--raw -z` emits `<info>\0<path>\0` per record. `R` (rename) and `C` (copy)
  // are the only statuses carrying a SECOND path, and `--no-renames` above means
  // git cannot emit either, whatever the caller's `diff.renames` says, so the
  // stride is two fields STRUCTURALLY rather than by the filter's leave. The
  // regex still admits a score-suffixed status: if one ever reached here the
  // stride would desync and the next record would fail to parse, which REFUSES,
  // the same outcome as any other unparseable record and the safe one. A record
  // that does not parse REFUSES rather than being skipped: a silently shortened
  // list is exactly the shape this scan must never report clean over.
  //
  // What this route still does NOT enumerate, stated because the boundary is
  // narrower than the path prefix alone: the filter drops `D`, a deletion, which
  // has no staged blob to scan. That is PRE-EXISTING and deliberate. The only
  // other statuses git documents are `R`/`C` (which `--no-renames` makes
  // unemittable), `B` (a broken pairing, which needs `-B` and is not passed) and
  // `X` (git's own "this is a bug" marker), so `A`/`M`/`T`/`U` plus `D` accounts
  // for every record this invocation can produce.
  const fields = listBuf.toString("utf8").split("\0");
  const staged: { path: string; mode: string; status: string }[] = [];
  let i = 0;
  while (i < fields.length) {
    const info = fields[i];
    if (info === undefined || info.length === 0) {
      i += 1;
      continue;
    }
    const m = RAW_RECORD.exec(info);
    const mode = m?.[1];
    const status = m?.[2];
    const path = fields[i + 1];
    if (mode === undefined || status === undefined || path === undefined || path.length === 0) {
      throw new InvocationError(
        "could not read the output of `git diff --cached --raw -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    staged.push({ path, mode, status });
    i += 2;
  }

  // A SCAN ROOT'S OWN PATH IS IN SCOPE AS WELL AS ITS CONTENTS, on both roots.
  // An index entry at exactly `test/fixtures` or exactly `src` is never a
  // directory, so it is a scan root REPLACED by a blob, a link or a gitlink.
  // The prefix test alone let that through: measured, exit 0 over a staged
  // mode-120000 `test/fixtures`, and
  // again over `src`. Every mode other than a regular blob is refused below.
  //
  // The `.ts` suffix rule is deliberately NOT applied to `src`'s own name. That
  // rule is a judgement about bytes this route could have read, and the name of
  // an entry that replaced a walk root is no evidence at all about what is on
  // the other side of it, exactly as for a link.
  const inScope = staged.filter(
    (s) =>
      s.path === "test/fixtures" ||
      s.path === "src" ||
      s.path.startsWith("test/fixtures/") ||
      (s.path.startsWith("src/") && s.path.endsWith(".ts")),
  );

  // Unmerged first: such a record's destination mode is `000000`, which the mode
  // test below would otherwise refuse with a sentence about symbolic links and
  // gitlinks that is false for it.
  refuseUnmerged(inScope.filter((s) => s.status === "U").map((s) => s.path));

  const list = inScope.filter((s) => s.status !== "U");

  refuseUnscannable(
    list
      .filter((s) => !REGULAR_BLOB_MODES.has(s.mode))
      .map((s) => ({ path: s.path, kind: gitModeKind(s.mode) })),
    "For such an entry `git show :<path>` hands back its target path rather than any content, " +
      "so scanning it would prove nothing about what it points at.",
    "Unstage it, or replace it with a regular file.",
  );

  return list.map(({ path: relPath }) => ({
    path: relPath,
    // SECURITY: array-form execFileSync, no shell. `:<path>` is a git pathspec.
    read: (): Buffer =>
      execFileSync("git", ["show", `:${relPath}`], {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  }));
}

// ---------------------------------------------------------------------------
// HL7 v2 structural helpers
// ---------------------------------------------------------------------------

/** Strip a leading MLLP start byte / BOM so the header segment is at the front. */
function stripFraming(text: string): string {
  // BOM (U+FEFF), then MLLP framing: 0x0B (VT) start block; trailing 0x1C 0x0D
  // (FS CR) end block. HL7-over-MLLP fixtures carry these.
  return text
    .replace(/^\uFEFF/, "")
    .replace(/^\u000b+/, "")
    .replace(/\u001c\r?\n?$/, "");
}

// A line is a segment when it starts with a 3-char id (letters+digits, HL7
// allows a leading letter) followed by a delimiter: not a letter/digit/space.
// Case-insensitive: the parser is lenient about segment case (lowercase `pid`),
// so the scanner must be too, or a mixed-case feed silently bypasses detection.
const SEGMENT_LINE_RE = /^([A-Za-z][A-Za-z0-9]{2})([^A-Za-z0-9\s])/;

/** The header segment line (MSH / FHS / BHS), if the message has one. */
function findHeaderLine(text: string): string | undefined {
  for (const raw of stripFraming(text).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/^[\s]*/, "");
    const m = SEGMENT_LINE_RE.exec(line);
    if (m && m[1] !== undefined) {
      const id = m[1].toUpperCase();
      if (id === "MSH" || id === "FHS" || id === "BHS") return line;
    }
  }
  return undefined;
}

/**
 * A file gets the full structured HL7 scan only when it is fixture-like (under
 * `test/fixtures/` or a `.hl7` file) AND contains at least one recognizable
 * segment line. The fixture gate is load-bearing in BOTH directions:
 *   - it lets a header-less message (the repo ships `malformed/no-msh-segment`)
 *     still get the full structured scan rather than the text-only pass; and
 *   - it keeps hand-written `src/` code on the conservative pass even when a file
 *     embeds an `MSH|…` example string in a comment or test literal: parsing a
 *     `.ts` file as HL7 segments produces only noise.
 * `src/` is scanned (dashed-SSN + email) via the conservative branch instead.
 */
function looksLikeHl7(text: string, path: string): boolean {
  const isFixtureLike = path.startsWith("test/fixtures/") || path.endsWith(".hl7");
  if (!isFixtureLike) return false;
  if (findHeaderLine(text) !== undefined) return true;
  return stripFraming(text)
    .split(/\r\n|\r|\n/)
    .some((raw) => SEGMENT_LINE_RE.test(raw.replace(/^[\s]*/, "")));
}

/**
 * Resolve the message delimiters from the header segment. `MSH-1` is the
 * character immediately after the 3-char id; `MSH-2` (the encoding characters)
 * supplies component / repetition / escape. A header-less message has no
 * encoding declaration, so the HL7 defaults (`|^~\&`) apply.
 */
function detectDelimiters(text: string): Delimiters {
  const header = findHeaderLine(text);
  if (header === undefined) {
    return { field: "|", component: "^", repetition: "~", escape: "\\" };
  }
  const field = header.charAt(3) || "|";
  // Encoding chars run from index 4 up to the next field separator.
  let enc = "";
  for (let i = 4; i < header.length && header.charAt(i) !== field; i += 1) enc += header.charAt(i);
  return {
    field,
    component: enc.charAt(0) || "^",
    repetition: enc.charAt(1) || "~",
    escape: enc.charAt(2) || "\\",
  };
}

/** Split a raw message into segment field-arrays (index 0 = segment id). */
function splitSegments(text: string, d: Delimiters): string[][] {
  return stripFraming(text)
    .split(/\r\n|\r|\n/)
    .map((s) => s.trimEnd())
    .filter((s) => s.length > 0)
    .map((s) => s.split(d.field));
}

/** Field N of a segment (1-indexed HL7 field position, non-MSH offset). */
function fieldAt(elems: string[], n: number): string {
  return elems[n] ?? "";
}

/** Escape-aware, unicode-aware name tokenizer. */
function nameTokens(value: string, d: Delimiters): string[] {
  // Drop HL7 escape sequences (\F\ \S\ \T\ \R\ \E\ \Xhh\ \Zxx\ …): they are
  // delimiter placeholders, not name characters.
  const esc = d.escape.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const noEsc = value.replace(new RegExp(`${esc}[^${esc}]*${esc}`, "g"), " ");
  const out: string[] = [];
  for (const raw of noEsc.split(/[^\p{L}]+/u)) {
    if (raw.length === 0) continue;
    if (!/\p{L}/u.test(raw)) continue;
    // A single Latin letter is a middle initial: not identifying. A single CJK
    // ideograph / kana / hangul IS a name (Chinese/Korean surnames are 1 char),
    // so keep those.
    const isCjk = /[぀-ヿ㐀-鿿가-힯]/u.test(raw);
    if (raw.length < 2 && !isCjk) continue;
    out.push(raw);
  }
  return out;
}

function isNameToken(tok: string): boolean {
  if (NAME_NOISE_TOKENS.has(tok.toUpperCase())) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Category detectors (segment + field-position aware)
// ---------------------------------------------------------------------------

function checkNameField(
  path: string,
  segId: string,
  fieldNo: number,
  value: string,
  familyIdx: number,
  d: Delimiters,
  allow: AllowList,
  hits: Hit[],
): void {
  if (value.length === 0) return;
  for (const rep of value.split(d.repetition)) {
    const comps = rep.split(d.component);
    // Inspect family / given / middle relative to the type's family index.
    for (const off of [0, 1, 2]) {
      const comp = comps[familyIdx + off];
      if (comp === undefined || comp.length === 0) continue;
      for (const tok of nameTokens(comp, d)) {
        if (!isNameToken(tok)) continue;
        if (!allow.names.has(tok.toUpperCase())) {
          hits.push({
            path,
            segment: `${segId}-${String(fieldNo)}`,
            value: tok,
            reason: "person-name token not in synthetic allow-list",
          });
        }
      }
    }
  }
}

function normalizeDob(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) {
    const d = digits.slice(0, 8);
    const month = Number(d.slice(4, 6));
    const day = Number(d.slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return d;
  }
  if (/^\d{6}$/.test(digits)) {
    // YYYYMM month-precision DTM (a valid HL7 partial DOB).
    const month = Number(digits.slice(4, 6));
    if (month < 1 || month > 12) return null;
    return digits;
  }
  if (/^\d{4}$/.test(digits)) return digits; // year-only precision
  return null;
}

function checkDobField(
  path: string,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  allow: AllowList,
  hits: Hit[],
): void {
  for (const rep of value.split(d.repetition)) {
    const dob = normalizeDob(rep.split(d.component)[0] ?? rep);
    if (dob === null) continue;
    if (!allow.dobs.has(dob)) {
      hits.push({
        path,
        segment: `${segId}-${String(fieldNo)}`,
        value: dob,
        reason: "date of birth not in synthetic allow-list",
      });
    }
  }
}

function checkAddressField(
  path: string,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  allow: AllowList,
  hits: Hit[],
): void {
  for (const rep of value.split(d.repetition)) {
    const street = (rep.split(d.component)[0] ?? "").trim();
    // A street line: house number + at least one word (`123 Main St`).
    if (!/^\d+\s+\p{L}/u.test(street)) continue;
    if (!allow.addresses.has(street.toLowerCase())) {
      hits.push({
        path,
        segment: `${segId}-${String(fieldNo)}`,
        value: street,
        reason: "street address not in synthetic allow-list",
      });
    }
  }
}

function checkPhoneField(
  path: string,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  hits: Hit[],
): void {
  for (const rep of value.split(d.repetition)) {
    const digits = rep.replace(/\D/g, "");
    // A real dialable number is >= 10 digits. The `555` fake-exchange
    // convention (555-01xx is reserved for fiction) marks a synthetic number.
    if (digits.length >= 10 && !digits.includes("555")) {
      hits.push({
        path,
        segment: `${segId}-${String(fieldNo)}`,
        value: rep,
        reason: "phone number without the 555 fake-exchange convention",
      });
    }
  }
}

function checkCxField(
  path: string,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  allow: AllowList,
  hits: Hit[],
): void {
  for (const rep of value.split(d.repetition)) {
    const comps = rep.split(d.component);
    const id = (comps[0] ?? "").trim();
    const typeCode = (comps[4] ?? "").trim().toUpperCase();
    if (id.length === 0) continue;
    const idUpper = id.toUpperCase();
    const isSsnType = typeCode === "SS" || typeCode === "SSN";
    if (isSsnType) {
      if (/^\d{9}$/.test(id) && !allow.ids.has(idUpper)) {
        hits.push({
          path,
          segment: `${segId}-${String(fieldNo)}`,
          value: id,
          reason: "SSN-typed identifier (CX type SS) not in synthetic allow-list",
        });
      }
      continue;
    }
    // A bare 6-9 digit identifier is a real-looking MRN / account number (or a
    // 9-digit SSN dropped in the wrong slot). Synthetic fixtures use prefixed
    // shapes (MRN…, ACCT…, FAKE…), so a bare numeric id is suspect.
    if (/^\d{6,9}$/.test(id) && !allow.ids.has(idUpper)) {
      hits.push({
        path,
        segment: `${segId}-${String(fieldNo)}`,
        value: id,
        reason: "bare-numeric MRN / account identifier not in synthetic allow-list",
      });
    }
  }
}

function checkSsnStField(
  path: string,
  segId: string,
  fieldNo: number,
  value: string,
  allow: AllowList,
  hits: Hit[],
): void {
  const digits = value.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits) && !allow.ids.has(digits.toUpperCase())) {
    hits.push({
      path,
      segment: `${segId}-${String(fieldNo)}`,
      value,
      reason: "SSN (9-digit) not in synthetic allow-list",
    });
  }
}

/**
 * Unknown / `Z…` site-defined segments have no known field schema, so a name
 * could hide in any field. Backstop: within each field, flag an adjacent pair of
 * single-token name-shaped components (`Johnson^Maya`) whose tokens are not
 * allow-listed. Only runs on unknown segments: known code-bearing segments
 * (`OBX`, `OBR`, …) carry `CODE^Description^System` triples that this would
 * misread as names.
 */
function checkUnknownSegment(
  path: string,
  segId: string,
  elems: string[],
  d: Delimiters,
  allow: AllowList,
  hits: Hit[],
): void {
  for (let f = 1; f < elems.length; f += 1) {
    const field = elems[f] ?? "";
    for (const rep of field.split(d.repetition)) {
      const comps = rep.split(d.component);
      const singleToken: (string | null)[] = comps.map((c) => {
        const toks = nameTokens(c, d).filter(isNameToken);
        // A name component is exactly one significant token (family or given).
        return toks.length === 1 && toks[0] !== undefined ? toks[0] : null;
      });
      for (let c = 0; c + 1 < singleToken.length; c += 1) {
        const a = singleToken[c];
        const b = singleToken[c + 1];
        if (a === null || a === undefined || b === null || b === undefined) continue;
        for (const tok of [a, b]) {
          if (!allow.names.has(tok.toUpperCase())) {
            hits.push({
              path,
              segment: `${segId}-${String(f)}`,
              value: tok,
              reason: "person-name token in site-defined segment not in synthetic allow-list",
            });
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shape checks shared by HL7 and plain-text targets
// ---------------------------------------------------------------------------

function scanCommonShapes(path: string, content: string, allow: AllowList, hits: Hit[]): void {
  // Dashed SSN anywhere (covers OBX-5 / NTE free text and non-HL7 targets).
  for (const m of content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    hits.push({ path, segment: "(ssn)", value: m[0], reason: "dashed SSN pattern" });
  }
  // Emails whose domain is not an allow-listed reserved / test domain.
  for (const m of content.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) {
    const domain = (m[1] ?? "").toLowerCase();
    if (!allow.emailDomains.has(domain)) {
      hits.push({ path, segment: "(email)", value: m[0], reason: "email with non-test domain" });
    }
  }
}

// ---------------------------------------------------------------------------
// HL7 message scanner
// ---------------------------------------------------------------------------

function scanHl7(target: Target, text: string, allow: AllowList, hits: Hit[]): void {
  const d = detectDelimiters(text);
  for (const elems of splitSegments(text, d)) {
    // Segment ids are matched case-insensitively: the lenient parser accepts a
    // lowercase `pid`, so the scanner must normalize before every lookup or a
    // mixed-case feed silently escapes the per-field detectors.
    const segId = (elems[0] ?? "").toUpperCase();
    if (segId.length === 0) continue;
    // MSH-style header segments carry only routing metadata + delimiters; the
    // field offset differs and none of the PHI fields live there. Skip them.
    if (segId === "MSH" || segId === "FHS" || segId === "BHS") continue;

    if (!KNOWN_SEGMENTS.has(segId)) {
      checkUnknownSegment(target.path, segId, elems, d, allow, hits);
      continue;
    }

    for (const f of XPN_NAME_FIELDS[segId] ?? []) {
      checkNameField(target.path, segId, f, fieldAt(elems, f), 0, d, allow, hits);
    }
    for (const f of XCN_NAME_FIELDS[segId] ?? []) {
      checkNameField(target.path, segId, f, fieldAt(elems, f), 1, d, allow, hits);
    }
    for (const f of DOB_FIELDS[segId] ?? []) {
      checkDobField(target.path, segId, f, fieldAt(elems, f), d, allow, hits);
    }
    for (const f of ADDRESS_FIELDS[segId] ?? []) {
      checkAddressField(target.path, segId, f, fieldAt(elems, f), d, allow, hits);
    }
    for (const f of PHONE_FIELDS[segId] ?? []) {
      checkPhoneField(target.path, segId, f, fieldAt(elems, f), d, hits);
    }
    for (const f of CX_ID_FIELDS[segId] ?? []) {
      checkCxField(target.path, segId, f, fieldAt(elems, f), d, allow, hits);
    }
    for (const f of SSN_ST_FIELDS[segId] ?? []) {
      checkSsnStField(target.path, segId, f, fieldAt(elems, f), allow, hits);
    }
  }
  // Cross-cutting shape checks over the whole payload (catches free-text PHI in
  // OBX-5 / NTE that the field map does not model).
  scanCommonShapes(target.path, text, allow, hits);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Scan one target. Returns whether the target's bytes were actually OBSERVED:
 * `false` means the one tolerated case fired (see `Target.tolerateVanish`) and
 * the caller must account for the file it did not read. Every other read
 * failure throws and refuses the whole scan.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[]): boolean {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    // TOCTOU, see `Target.tolerateVanish`: an untracked file the walk enumerated
    // itself may be a build transient that was deleted before we reached it.
    // Report it as unobserved instead of refusing; every other failure, and any
    // tracked file, still refuses the whole scan.
    if (target.tolerateVanish === true && errorCode(err) === "ENOENT") return false;
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = buf.toString("utf8");
  if (looksLikeHl7(text, target.path)) {
    scanHl7(target, text, allow, hits);
  } else {
    // Non-HL7 target (hand-written src, plain-text notes): conservative shape
    // pass only: no segment model to lean on.
    scanCommonShapes(target.path, text, allow, hits);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[], skipped: number): void {
  if (hits.length === 0) {
    // The clean line is QUALIFIED whenever the sweep skipped a file. The skip
    // detail goes to stderr, and a log reader watching stdout alone must not
    // read an unqualified OK over a sweep that did not observe everything it
    // enumerated. The `OK: no hits` prefix is kept verbatim so the line stays
    // greppable either way.
    const tail = skipped > 0 ? ` (${String(skipped)} untracked file(s) skipped, see stderr)` : "";
    process.stdout.write(`[phi-scan] OK: no hits${tail}\n`);
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    for (const h of group) {
      process.stderr.write(
        `  segment=${h.segment} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(byPath.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
    validateAllowFixtures(args.allowFixtures);
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  // `loadAllowList()` is INSIDE this try. It used to sit outside every one of
  // them, so a missing or unreadable allow-list threw all the way out of `main`
  // and node exited 1, which is this gate's code for HITS FOUND: a scan that
  // never started reported as a scan that found PHI. Nothing downstream reads
  // the difference today (both are non-zero, so the gate still blocks), but a
  // caller that ever splits them would read it exactly backwards.
  let allow: AllowList;
  let targets: Target[];
  try {
    allow = loadAllowList();
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else targets = buildTargetsForAll();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  targets = targets.filter((t) => !allowed.has(t.path));

  const hits: Hit[] = [];
  const vanished: Target[] = [];
  let observed = 0;
  for (const t of targets) {
    try {
      if (scanTarget(t, allow, hits)) observed += 1;
      else vanished.push(t);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // A tolerated file is never silent, and the tolerance is only good while the
  // file is still gone: if it is back on disk the sweep skipped something that
  // exists, which is an incomplete scan and refuses like any other.
  if (vanished.length > 0) {
    const back = vanished.filter((t) => t.absPath !== undefined && existsSync(t.absPath));
    if (back.length > 0) {
      process.stderr.write(
        `[phi-scan] could not read ${back.map((t) => t.path).join(", ")}: vanished mid-scan and is ` +
          `present again, so the sweep did not observe it. Re-run with the tree at rest.\n`,
      );
      return 2;
    }
    process.stderr.write(
      // "gone" rather than "deleted": a rename leaves the enumerated path just
      // as absent, and the residual on `Target.tolerateVanish` is about exactly
      // that case, so the line must not assert the file was removed.
      `[phi-scan] skipped ${String(vanished.length)} untracked file(s) gone between ` +
        `enumeration and read: ${vanished.map((t) => t.path).join(", ")}\n`,
    );
  }

  // Refuse a sweep that observed nothing. `all` mode walks `test/fixtures` and
  // `src`, both of which always hold committed files, so zero reads means the
  // enumeration or the tree is wrong, never a clean repo. (`staged` legitimately
  // has nothing to scan when a commit touches only markdown, and `paths` is
  // bounded by the caller's argv.)
  if (args.mode === "all" && observed === 0) {
    process.stderr.write(
      "[phi-scan] refusing: the all-mode sweep observed no files, so it proves nothing.\n",
    );
    return 2;
  }

  report(hits, vanished.length);
  return hits.length === 0 ? 0 : 1;
}

// EXIT 1 IS RESERVED FOR HITS, so nothing may reach node's default handler: an
// uncaught throw exits 1, and this gate's 1 means "PHI found". Every anticipated
// failure is already an `InvocationError` returning 2 from `main`; this is the
// backstop for the rest (an `EACCES` on the allow-list, a git binary that is not
// there), so an unexpected failure is reported as the invocation error it is
// rather than impersonating a finding.
let exitCode: number;
try {
  exitCode = main();
} catch (err) {
  process.stderr.write(
    `[phi-scan] the scan failed and did not complete: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  exitCode = 2;
}
process.exit(exitCode);
