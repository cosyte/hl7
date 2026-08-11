#!/usr/bin/env tsx
/**
 * `@cosyte/hl7` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps. Walks the synthetic HL7 v2 test fixtures, the
 * rest of `test/`, and `src/`, reads THE BYTES GIT CARRIES at every path in the
 * index besides, and REFUSES anything that looks like real PHI, so a developer
 * cannot commit a real-looking HL7 v2 fixture by accident. HOW each file is read
 * differs by scope and WHAT is looked for does not: see the three tiers below.
 *
 * IT IS DETECTIVE, NOT PREVENTIVE, on every route. It fires after a write has
 * landed. What it guarantees is that PHI is never carried silently, never that
 * PHI never touched the disk.
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
 * THERE ARE THREE TIERS, AND THE SCOPE A FILE IS IN DECIDES ONLY WHETHER IT IS
 * READ, NEVER HOW WELL. Getting that backwards is the trap this scanner has now
 * been bitten by twice, so it is written at the top:
 *   1. the whole-file HL7 parse, for a file that IS a message (`test/fixtures`
 *      and `.hl7`, plus the fixture root's own path);
 *   2. the EMBEDDED-LITERAL pass (`scanEmbeddedHl7`), which pulls `PID|…` runs
 *      out of hand-written source and gives them the same field map. An inline
 *      fixture is a TypeScript string literal, so tier 1 never sees it;
 *   3. the conservative shape floor (`scanCommonShapes`): a dashed SSN and a
 *      non-test email domain, over every file, always.
 * Tier 3 alone is what a scope widening buys. Bringing a directory into scope
 * without bringing the recogniser with it means the gate reads 115 more files
 * for two shapes and calls it coverage.
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
 * refuse.
 *
 * THE COMPLETENESS RULE: A TARGET THIS RUN ENUMERATED AND NEVER READ REFUSES
 * (exit 2), IN EVERY MODE, NAMING THE PATHS. It is a SET DIFFERENCE between
 * what the enumerating routes declared and what `scanTarget` actually returned
 * on, never a size comparison: a count counts the targets that DID get read, so
 * "M of N" is exactly the arithmetic that hides which ones did not. A companion
 * tier refuses a `--allow-fixture` that names a path this run does not
 * enumerate, because a bypass that subtracts nothing is accepted, logged and
 * then ignored. Both are measured, both live at the end of `main()`, and
 * together they are why `--allow-fixture` can no longer reach exit 0. THE ONE
 * CARVE-OUT IS THE TOLERATED VANISH BELOW, and it cannot launder a bypass: the
 * tolerance exists only in `all` mode and `allowed` is always empty there.
 *
 * THE OBSERVATION RULE IS PER-ROOT, NOT GLOBAL: `all` mode refuses (exit 2)
 * unless EVERY member of `SCAN_ROOTS` yielded at least one file that was
 * actually READ, and the refusal names the starved roots. Observing nothing at
 * all is the all-starved case of that one rule, not a second rule beside it. ITS
 * GRANULARITY IS THE DECLARED ROOT AND NOTHING FINER, which is a real bound and
 * not a slogan: see the limits list below, each entry with the reading that
 * produced it. The rule, its cause and its measurements live at the end of
 * `main()`.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - withdraw one path from the read set; rejected
 *                              unless logged in phi-scan-overrides.md, and then
 *                              REFUSED (exit 2) either way. WHICH refusal
 *                              differs and the messages differ with it: a path
 *                              this run enumerates is refused by THE
 *                              COMPLETENESS RULE, one it does not enumerate by
 *                              the companion unmatched-bypass tier. It can no
 *                              longer reach exit 0 in any mode.
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - "all": scan every in-scope working-tree file,
 *                              AND the bytes git carries at every path in the
 *                              index. Two routes, a union, all-mode only. See
 *                              "The index corpus" below.
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error). THESE ARE THIS
 * REPO'S OWN AND THEY DIFFER ACROSS THE SIBLINGS: a walk root that is a regular
 * file exits 2 here and 1 in at least one sibling, so derive them from this file
 * rather than porting a number in.
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
 * own), and `--staged` looks at `test/fixtures/**`, `test/**` (except markdown)
 * and `src/**.ts` PLUS each root's own path (`test/fixtures`, `test` and `src`),
 * both explained at `buildTargetsForStaged`.
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
 * WHAT THE PER-ROOT OBSERVATION RULE DOES NOT COVER. Every reading below was
 * taken on this checkout WITH the rule in place, because a bound asserted without
 * one is the failure this scanner already keeps a paragraph about. The commands
 * are here so the next reader re-measures rather than trusting the sentence.
 *
 * READ THE WHOLE LIST AS A STATEMENT ABOUT THE WALK, WHICH IS WHAT IT IS. Since
 * all mode also reads the index corpus, a TRACKED file in any of these states is
 * still read, out of the object store, and a violator in one is caught (exit 1).
 * What each limit still costs is UNTRACKED content in that state, plus the fact
 * that the sweep reports 0 rather than refusing. The per-root rule itself is
 * unchanged and is deliberately NOT satisfied by the index route:
 *
 *   - ITS GRANULARITY IS THE DECLARED ROOT, NOT A SUB-TREE, so a directory
 *     missing from INSIDE a root is still unobserved BY THE WALK at exit 0.
 *     `mv test/fixtures/canonical ..` then `pnpm phi-scan` prints
 *     `[phi-scan] OK: no hits` and exits 0, re-measured here with the index
 *     route in place: the same shape as the defect the per-root rule closed, one
 *     level down. Do NOT read the rule as "the scanner can no longer report
 *     clean over a directory it never opened"; it is a whole SCAN ROOT that can
 *     no longer go unobserved. WHAT CHANGED IS THE CONSEQUENCE, and the
 *     superseded sentence ("with 27 fixtures unread") is now false rather than
 *     merely dated: those fixtures are TRACKED, so their committed bytes are
 *     read by the index route and a violator among them exits 1. An UNTRACKED
 *     file in that subtree is what still goes unread.
 *   - A ROOT WITH NO WALKED PARENT IS FOLLOWED WHEN IT IS ITSELF A SYMLINK, and
 *     the rule is then satisfied by whatever is on the other side of it.
 *     `rm -rf src && ln -s <dir holding one file> src` prints
 *     `[phi-scan] OK: no hits` and exits 0 with every source file absent from
 *     disk, because `normalizePath` is purely lexical (`resolve`/`relative`,
 *     never `realpath`) so every entry behind the link is attributed to the
 *     root's prefix. "A root yielded a file" is not "that root's corpus was
 *     observed". Adversarial rather than accidental. The tracked corpus behind
 *     the link is nonetheless READ, out of the index: a PHI-bearing tracked file
 *     under a root replaced this way exits 1, pinned by a case in the suite.
 *     THE BOUNDARY IS THE PARENT, and it moved when `test` became a root:
 *     `test/fixtures` is now an ENTRY INSIDE a walked root, so a link there is
 *     classified by `Dirent.isSymbolicLink()` and REFUSED by name at exit 2,
 *     dangling or not. `src` and `test` have no walked parent (the repo root is
 *     not a root), so both are still followed. Do not read the narrower residual
 *     as closed, and do not port the old sentence: it named the one root where
 *     it is no longer true.
 *   - IT IS A FLOOR OF ONE. A `test/fixtures` reduced to a single clean fixture
 *     prints `[phi-scan] OK: no hits` and exits 0. The rule asks whether a root
 *     was observed at all, never whether it was observed in full. This reporter
 *     prints no denominator either, so nothing on stdout distinguishes 1 file
 *     from 106: adding one would be a real improvement and is not this rule.
 *     A DENOMINATOR WOULD ALSO NOT DETECT THE STATE IT LOOKS LIKE IT WOULD, and
 *     that was refuted in a sibling rather than reasoned about here: a count
 *     counts the files that WERE there. Reading the bytes git carries is what
 *     answers it, which is what the index route does, and the rule above is
 *     still a floor of one over the WALK.
 *
 * ONE CONSEQUENCE THIS RULE LOOKS LIKE IT HAS AND DOES NOT, recorded because it
 * is the obvious worry and it is WRONG: `--allow-fixture` subtracts its path from
 * the target list before anything is read, so allow-fixturing the last remaining
 * file under a root reads like a new way to starve one. It is unreachable.
 * `parseArgs` seeds the positional path set from `allowFixtures` when no path is
 * given, so `--allow-fixture` never resolves to `all`, and neither of the modes
 * it does resolve to declares a root or makes a per-root promise. (It resolves to
 * `paths` USUALLY, and to `staged` when `--staged` is also given; only the `never
 * to all` half is relied on anywhere.)
 * THE MEASUREMENT THAT USED TO CLOSE THIS PARAGRAPH IS NOW FALSE AND IS REPLACED
 * RATHER THAN DELETED, because the number it named is the thing a reader would
 * otherwise port forward: on a throwaway repo whose `test/fixtures` held exactly
 * one file, `--allow-fixture test/fixtures/<name>` returned `OK: no hits` at exit
 * 0 both here and on the superseded per-root rule. It now exits 2, and NOT
 * through this rule. THE COMPLETENESS RULE refuses it, naming the file as
 * enumerated and never read. The conclusion about the per-root rule is unchanged
 * and still stands: do not add a per-root guard for it.
 *
 * AND ONE SHAPE THAT IS OFTEN LISTED WITH THOSE AND IS NOT OPEN HERE, recorded so
 * it is not ported in from a sibling as an open residual: A ROOT THAT IS A
 * REGULAR FILE, OR A LINK TO ONE, REFUSES AT EXIT 2, NOT 1. `walk()` wraps
 * `readdirSync` in a `try` and rethrows as an `InvocationError`, so the `ENOTDIR`
 * is reported on this scanner's own channel; there is a process-level catch under
 * `main()` besides. Measured both ways: `test/fixtures` replaced by a regular
 * file, and `test/fixtures` a symlink to one, each
 * `[phi-scan] could not enumerate test/fixtures: ENOTDIR ...` at exit 2.
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

// Roots walked in "all" mode, repo-relative and forward-slashed. `test/fixtures`
// gets the whole-file HL7 parse; `test` and `src` are hand-written code, not
// data, so a file under them is never parsed AS a message and gets the shape
// floor plus the embedded-literal pass instead.
//
// THAT IS A CHANGE OF INTENT FOR `src`, NOT JUST OF SCOPE, AND IT IS RECORDED
// RATHER THAN LEFT IN THE COMMENT IT REPLACES. The superseded sentence said a
// JSDoc `@example` snippet's synthetic names and MRNs "must not trip the
// segment-aware detectors", and the embedded pass runs on every non-fixture
// target, so they now do: measured, a `src/` `@example` carrying a PID line with
// a non-allow-listed name exits 0 on the previous commit and 1 here. That is the
// gate working, not a regression, and this repo hard-requires an `@example` on
// every public export, so the consequence is real: a new example has to use
// allow-listed tokens or add its own, exactly like a fixture. The committed
// corpus is green as it stands.
//
// ONE DECLARATION, TWO READERS: `buildTargetsForAll` walks it, and the per-root
// observation rule at the end of `main` decides coverage against it through
// `rootsOf`. They were two absolute-path constants and a separate literal; keeping
// them one list is what stops a root being walked but never required to yield,
// which is the shape of the defect the per-root rule closes.
//
// TWO READERS, NOT THREE, AND ADDING A ROOT HERE DOES NOT REACH EITHER OF THE
// OTHER TWO. `buildTargetsForStaged` has its own scope predicate and `looksLikeHl7`
// has its own `test/fixtures/` literal, both deliberately (see their own notes).
// So a root added to this list is walked and is required to yield. Adding a root
// means visiting all three, not just this one.
//
// `test` IS A ROOT AND IT NESTS `test/fixtures`, DELIBERATELY, AND BOTH ARE
// LISTED. The walk used to start at `test/fixtures` and `src`, so a TRACKED file
// directly under `test/` was enumerated by NEITHER route: measured on `d8d3be3`,
// **115 tracked files** (none of them markdown), of which **55 carry an inline
// `PID|` literal**. A PHI-bearing `test/<name>.ts` scanned `OK: no hits` at exit
// 0 in all mode and at exit 0 on `--staged`, over the same bytes that give six
// segment-aware hits when they sit at a `.hl7` path.
//
// The nesting is why `rootsOf` below returns EVERY match rather than the first.
// Collapsing the two into a single `test` root would have been simpler and is
// WRONG: it would let one `test/*.test.ts` vouch for an absent fixture corpus,
// which is exactly the per-root defect this scanner already closed. Both roots
// are declared, so `test/fixtures` still has to yield a file of its own.
const SCAN_ROOTS: readonly string[] = ["test/fixtures", "test", "src"];

/**
 * EVERY scan root a repo-relative path sits under, innermost matches included.
 * The single definition of the root-prefix rule for COVERAGE: the per-root
 * observation rule attributes every file it read through this, so no second copy
 * of `rel === root || rel.startsWith(root + "/")` decides who vouched for what.
 *
 * IT RETURNS EVERY MATCH, NOT THE FIRST, AND THAT IS LOAD-BEARING NOW THAT THE
 * ROOTS NEST. Scope wants ANY match and coverage wants EVERY match; while the
 * roots were disjoint the two agreed and a first-match lookup was correct. They
 * no longer are: `test/fixtures` sits inside `test`. Under a first-match lookup
 * with the outer root listed first, the inner one is never attributed and
 * all-mode refuses forever; listed inner-first it happens to work, which is
 * worse, because the list's ORDER becomes load-bearing and nothing says so.
 * Returning every match makes the order irrelevant again, which is the only form
 * of this that a later edit to `SCAN_ROOTS` cannot silently break.
 *
 * THIS IS NOT `--staged`'s SCOPE PREDICATE AND MUST NOT BE UNIFIED WITH IT. That
 * one (see `buildTargetsForStaged`) admits `src/**` only at the `.ts` suffix and
 * admits each root's OWN path as an entry that replaced it. Both are deliberate
 * judgements about what git hands back, they do not describe coverage of a walk,
 * and `--staged` makes no per-root promise at all. Folding the two together would
 * silently change what the pre-commit hook enumerates.
 */
function rootsOf(rel: string): string[] {
  return SCAN_ROOTS.filter((root) => rel === root || rel.startsWith(`${root}/`));
}

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
  /**
   * Where the scanned bytes came from, when that is not the working tree. Set
   * by the caller after a target is scanned rather than by the detectors, so
   * the field map never has to know which route it is running under.
   */
  origin?: string;
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
  // set when no positional path was given, which is what stops a lone
  // `--allow-fixture X` from being a run with nothing in it.
  //
  // THE SEEDING IS CONDITIONAL, AND THE HOLE THAT LEAVES IS CLOSED IN `main`,
  // NOT HERE. With a positional path present the flag seeds nothing, so a path
  // named ONLY by the flag is never ADMITTED to the run rather than withdrawn
  // from it, and the bypass subtracts nothing. Measured on `dfac162`:
  // `phi-scan <clean file> --allow-fixture <violator>`, with the violator logged
  // in `phi-scan-overrides.md`, printed `[phi-scan] OK: no hits` at exit 0,
  // having validated the bypass and checked its audit entry without ever opening
  // THE NAMED FILE. (It did open the clean file and report on it, which is why
  // the claim is about the named file and not about the run.) `main`'s
  // unmatched-bypass tier refuses that argv now, and the fix is THERE rather
  // than in a wider seeding rule HERE because other paragraphs reason from what
  // this line makes true.
  //
  // WHAT THEY MAY REASON FROM IS "NEVER `all`", AND ONLY THAT. It is what keeps
  // `allowed` empty in a sweep, which is what keeps the vanish carve-out unable
  // to launder a bypass. THE WIDER FORM SOMETIMES WRITTEN NEARBY, "always
  // resolves to `paths` mode", IS FALSE: `--staged --allow-fixture X` resolves
  // to STAGED mode, because `staged` is tested first below. Measured at exit 2
  // whether or not X is staged, through one tier or the other, so nothing is
  // lost by the correction.
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
    // THIS GATE DECIDES ADMISSION, NOT THE VERDICT, AND THE SECOND SENTENCE NOW
    // SAYS SO. On the superseded contract, adding the subsection this asks for
    // reached exit 0, so the instruction was a route to a clean run. It is not
    // one any more: an admitted bypass is then refused (exit 2) by the
    // completeness rule, which is the same "printed remedy that cannot reach the
    // state it promises" defect the hit footer was rewritten for, and leaving it
    // here would have a developer commit a permanent audit entry for nothing.
    // The instruction stays, because a bypass genuinely still needs the entry to
    // be admitted at all; what is added is where admission actually leads.
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it. That ADMITS the ` +
        `flag; it does not make the run clean, because an admitted bypass is then refused ` +
        `(exit 2) either way. To reach exit 0, drop the flag and declare the individual value ` +
        `in scripts/phi-allow-list.txt, or change the value in the fixture.`,
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
   * `test/fixtures`, `test` and `src`, so a repo-root transient is never
   * enumerated here, and `@cosyte/ccda` (whose walk starts at the repo root) is the sibling
   * that took the hit: an entire publish-time sweep refused with exit 2. Nothing
   * gitignores that filename in this repo either, so WIDENING A WALK ROOT, or
   * any tool that drops a transient under one, reintroduces it verbatim. This is
   * hardening ahead of that, not the repair of a live defect.
   *
   * A WALK ROOT WAS WIDENED SINCE THAT WAS WRITTEN (`test`), so it is worth
   * being exact about what changed and what did not. The `tsup` transient is
   * still at the REPO ROOT, which is outside every root, so that specific race
   * is still unreachable here. What did grow is the surface: the editor and
   * atomic-save transients this repo's `.gitignore` does not cover (`*~`,
   * `.#*`, `*___jb_tmp___`, `4913`, `.goutputstream-*`) now land inside a walk
   * root when they land beside a TEST file as well as beside a source file, and
   * the suite itself runs from there. Every one of them is UNTRACKED, which is
   * exactly the case this tolerance exists for, so the widening moves traffic
   * onto this path rather than past it.
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
  /**
   * Set only for a target whose bytes did NOT come off the working tree, so a
   * hit can say where the bytes it read are. See the index-corpus section.
   */
  origin?: string;
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
 *     enumerated at all HERE, so this function skips it rather than refusing:
 *     the tracked-file bound above governs a file the walk DID list and then
 *     could not read, not one it never saw. THE WALK IS NO LONGER ALL OF ALL
 *     MODE, so be exact about what that leaves: in all mode such a file is read
 *     from the index corpus instead, and `--staged` catches it when it is ADDED
 *     (measured, exit 1). What is still working-tree-only is THIS FUNCTION and
 *     the per-root observation rule it feeds, which is deliberate: a root
 *     emptied on disk refuses even when the index route read every one of its
 *     files.
 *
 * Widening the walk itself is a different slice, and it is not a reason to
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
 * The walk's targets. `tracked` is every path the index holds, and it arrives
 * as an argument rather than being fetched here.
 *
 * IT USED TO BE A `gitTracked()` CALL RETURNING `Set | null`, WHERE `null`
 * (git could not answer) AND AN EMPTY SET (an index with nothing in it) BOTH
 * MEANT "switch the tolerance off and carry on". Both now refuse before this
 * function is reached, because all mode reads the index corpus as well and
 * cannot do that over an index it could not read. So the parameter is not
 * optional and has no null case: the caller has already proved git answered
 * with at least one entry. The tolerance below is unchanged in every other
 * respect.
 */
function buildTargetsForAll(tracked: ReadonlySet<string>): Target[] {
  const walked: string[] = [];
  const unscannableAll: Unscannable[] = [];
  for (const root of SCAN_ROOTS) walk(resolve(REPO_ROOT, root), walked, unscannableAll);

  // DE-DUPLICATE, because the roots NEST: `test/fixtures` is walked once on its
  // own account and again as a subtree of `test`, so every fixture arrives
  // twice. Left in, each hit under it would be REPORTED twice, which reads as a
  // corpus twice the size it is. Keyed on the absolute path the walk produced,
  // which is what both passes emit for the same entry.
  const seen = new Set<string>();
  const files = walked.filter((abs) => (seen.has(abs) ? false : (seen.add(abs), true)));
  const seenUnscannable = new Set<string>();
  const unscannable = unscannableAll.filter((u) =>
    seenUnscannable.has(u.path) ? false : (seenUnscannable.add(u.path), true),
  );

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

  return files
    .map((abs) => ({ abs, rel: normalizePath(abs) }))
    .filter(({ rel }) => !ignored.has(rel))
    .map(({ abs, rel }) => ({
      path: rel,
      read: () => readFileSync(abs),
      absPath: abs,
      tolerateVanish: !tracked.has(rel),
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
function refuseUnmerged(paths: string[], how: string): void {
  if (paths.length === 0) return;
  const lines = paths.map((p) => `  - ${p}`).join("\n");
  const noun = paths.length === 1 ? "path is unmerged" : "paths are unmerged";
  throw new InvocationError(
    `refusing the scan: ${String(paths.length)} in-scope ${noun}:\n${lines}\n` +
      "An unmerged path is recorded at one or more of stages 1/2/3 and never at stage 0, so " +
      `${how} Resolve the conflict and \`git add\` the result.`,
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
    // `B` (BROKEN PAIR) IS IN THE FILTER BECAUSE `-B` IS NOT INERT, AND THIS
    // FILE ASSERTED THAT IT WAS. The superseded sentence read "`-B` is INERT
    // here", which is the PERMISSIVE half of a "do not add these flags"
    // paragraph, so it told the next porter that injecting `-B` was safe. It is
    // not, and the mechanism is sharper than "a `B` record the filter drops":
    //
    //   - the raw record's printed status LETTER IS STILL `M`. A complete
    //     rewrite under `-B` prints `:100644 100644 <sha> <sha> M<score> <path>`,
    //     one path, an `M` with a break score. THE SCORE IS NOT PINNED AND NO
    //     DIGITS ARE QUOTED HERE: it moves with how much of the old content
    //     survives (0 lines kept reads `M100`, 1 reads `M099`, 2 reads `M098`),
    //     so a number copied out of one fixture is wrong in the next. What is
    //     load-bearing is the LETTER, and it is `M`. `RAW_RECORD` below parses it
    //     happily, and a reader checking the raw output would conclude the
    //     record is an `M` and that `AMTU` therefore keeps it;
    //   - but `--diff-filter` classifies a broken pair as `B` REGARDLESS OF THE
    //     LETTER IT PRINTS, so `AMTU` deletes the record before anything sees
    //     it. Measured on this checkout at `d8d3be3`, same index both ways:
    //     `--diff-filter=AMTU` returns EMPTY, `--diff-filter=B` and
    //     `--diff-filter=AMTUB` each return the same record. Run through the
    //     scanner over a staged dashed SSN in a wholly rewritten in-scope file:
    //     the shipped argv exits 1 with the hit, the same argv plus `-B` prints
    //     `OK: no hits` and exits 0.
    //
    // Adding `B` costs the enumeration NOTHING today, which is why it is the
    // remedy rather than a warning: git only breaks a pair when `-B` is given,
    // so with the flag absent no `B` record can exist and the two filters
    // enumerate identically. It is there so the flag stops being a silent
    // blindfold if it is ever added. A broken pair carries a SINGLE path, so it
    // costs the two-field stride below nothing either.
    //
    // THE STRIDE BELOW IS COUPLED TO THIS ARGV, so read the coupling before
    // editing it. `--no-renames` is what makes a two-path record impossible, and
    // `-M`, `-C` and `--find-copies-harder` each turn detection back on over the
    // top of it: measured on a real rename stage, every one of the three empties
    // this route again. Do not add them, and do not add `-B` either: with `B` in
    // the filter it is no longer a blindfold, but it still buys nothing.
    // If a two-path record ever did arrive the stride
    // desyncs and the run REFUSES rather than scanning a short list, which is the
    // safe direction, but that is a backstop and not the guarantee.
    listBuf = execFileSync(
      "git",
      ["diff", "--cached", "--raw", "-z", "--no-renames", "--diff-filter=AMTUB"],
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
  // unemittable) and `X` (git's own "this is a bug" marker), so `A`/`M`/`T`/`U`/
  // `B` plus `D` accounts for every record this invocation can produce. `B` is
  // in the filter and unreachable without `-B`; see the argv's own note for the
  // measurement that put it there.
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

  // A SCAN ROOT'S OWN PATH IS IN SCOPE AS WELL AS ITS CONTENTS, on every root.
  // An index entry at exactly `test/fixtures`, exactly `test` or exactly `src`
  // is never a directory, so it is a scan root REPLACED by a blob, a link or a
  // gitlink. The prefix test alone let that through: measured, exit 0 over a
  // staged mode-120000 `test/fixtures`, and again over `src`. Every mode other
  // than a regular blob is refused below.
  //
  // The `.ts` suffix rule is deliberately NOT applied to `src`'s own name. That
  // rule is a judgement about bytes this route could have read, and the name of
  // an entry that replaced a walk root is no evidence at all about what is on
  // the other side of it, exactly as for a link.
  //
  // `test/**` (EXCEPT MARKDOWN) IS THE ADDITION HERE, AND IT IS PURELY ADDITIVE.
  // The clause list is a UNION and no clause was narrowed: `test/fixtures/**`
  // keeps its own unconditional clause, so the markdown the walk skips under the
  // fixture root is still enumerated here exactly as it was (there are seven
  // such files). What changes is a TRACKED file directly under `test/`: 115 of
  // them, previously enumerated by neither route, measured at exit 0 on
  // `--staged` over a live `PID-3`/`PID-5`/`PID-7`/`PID-11`/`PID-13`.
  //
  // The markdown exclusion is copied from `walk()` rather than invented, so the
  // two routes agree about the new root: a README describing a violator value is
  // documentation, not a fixture. It is applied to the NEW clause only.
  const inScope = staged.filter(
    (s) =>
      s.path === "test/fixtures" ||
      s.path === "test" ||
      s.path === "src" ||
      s.path.startsWith("test/fixtures/") ||
      (s.path.startsWith("test/") && !s.path.toLowerCase().endsWith(".md")) ||
      (s.path.startsWith("src/") && s.path.endsWith(".ts")),
  );

  // Unmerged first: such a record's destination mode is `000000`, which the mode
  // test below would otherwise refuse with a sentence about symbolic links and
  // gitlinks that is false for it.
  // The mechanism sentence is THIS route's: it is `git show :<path>` that this
  // route would have used to read the blob.
  refuseUnmerged(
    inScope.filter((s) => s.status === "U").map((s) => s.path),
    "`git show :<path>` fails outright and there is no one staged blob for the scan to read.",
  );

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
// The index corpus: the bytes git carries (all mode only)
// ---------------------------------------------------------------------------

/**
 * THE ONE PLACE THIS MECHANISM IS WRITTEN DOWN. Everything else (the header
 * banner, the override log, the changeset) states the consumer-facing property
 * and points here.
 *
 * WHAT IT IS. All mode reads the working tree through `walk()`, and then reads
 * THE BYTES GIT CARRIES for every path in the index, wherever that path sits.
 * It is a UNION with the walk, never a replacement: no walk root was narrowed,
 * no clause was dropped, and a file the walk reads is still read from disk with
 * exactly the tiers it had. The second route only ever ADDS bytes to the sweep.
 *
 * WHAT IT CLOSES, each measured on a throwaway repo and each pinned by a test:
 *
 *   - RECONCILING PATH SETS IS NOT READING BYTES. A walk root swapped for a
 *     directory that mirrors the tracked NAMES over clean decoy content exits 0
 *     on a path-set reconciliation and on this scanner before this route: every
 *     declared root yields a file, every tracked path is accounted for, and the
 *     corpus git carries was never opened. Reading the index blob is the only
 *     answer that does not depend on the working tree being honest.
 *   - AN UNDECLARED TOP-LEVEL DIRECTORY WAS INVISIBLE TO BOTH ENUMERATING
 *     ROUTES. `SCAN_ROOTS` is three names; the walk sees nothing outside them
 *     and `--staged` has its own prefix list. Measured on this repo before this
 *     route: `examples/data/` holds three tracked `.hl7` MESSAGES, and two of
 *     them carried a DOB, a street address and person-name tokens that were in
 *     no allow-list. Neither route had ever opened them. The index route reads
 *     every tracked path, so a new top-level directory's COMMITTED BYTES are in
 *     scope the moment git tracks something in it, without anyone remembering
 *     to declare it. Be exact about the half that buys: its WORKING-TREE bytes
 *     are not (see the residual below), and what a scope widening buys for a
 *     file that is not itself a message is tier 3, the dashed-SSN and
 *     non-test-email floor, and nothing else.
 *   - A TRACKED FILE ABSENT FROM THE WORKING TREE. `walk()` records this as a
 *     pre-existing limit; it is now read from the index instead of skipped.
 *   - A TRACKED SYMLINK OR GITLINK OUTSIDE EVERY WALK ROOT. The walk classifies
 *     entries INSIDE a root, so such an entry was reached by neither route. It
 *     is refused here by mode, through the same `gitModeKind` closed set, and
 *     the refusal never reports what is on the other side of it.
 *   - AN EMPTY INDEX MADE THE RECONCILIATION VACUOUS. Zero entries is not a
 *     clean corpus, it is no corpus, so all mode refuses (exit 2) rather than
 *     reporting on the working tree alone. That REPLACES the old fail-closed
 *     branch in the deleted `gitTracked()`, which switched the tolerance off
 *     and let the sweep finish anyway.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, so nobody reads a bigger claim than the
 * code makes:
 *
 *   - IT DOES NOT CREDIT A SCAN ROOT. The per-root observation rule at the end
 *     of `main()` is a statement about the WALK, and it stays one: a root
 *     emptied on disk still refuses, even though every one of its files was
 *     just read from the index. The two rules answer different questions ("did
 *     the working tree yield anything under each declared root" and "were the
 *     bytes git carries read"), and letting the second satisfy the first would
 *     retire a trap that is already paid for.
 *   - IT IS NOT PREVENTIVE, and neither is any other route here. This gate
 *     fires AFTER a write lands. It guarantees PHI is never carried silently,
 *     not that it never touched disk.
 *   - IT DOES NOT REACH `--staged` OR `paths`. `--staged` is the pre-commit
 *     hook, so its scope decides what a commit is BLOCKED on; widening it is a
 *     hook decision and is not this. `paths` is bounded by the caller's argv.
 *   - MARKDOWN IS EXCLUDED, copied from `walk()` rather than invented: a
 *     README or an override log legitimately describes a violator value. That
 *     is the ONE exclusion, and it is why an index entry can be skipped here.
 *   - GITIGNORE IS NOT CONSULTED, deliberately unlike the walk. A tracked file
 *     that also matches an ignore rule is still content git carries, and the
 *     walk's ignore rule is about entries it found on disk.
 *   - IT READS THE INDEX, NOT `HEAD`. Staged bytes are what the next commit
 *     carries, and they are also what the working tree can no longer be trusted
 *     to show.
 *
 * THE RESIDUAL, MEASURED RATHER THAN REASONED, because the first draft of this
 * paragraph was narrower than the code and that is this class's signature
 * defect: WORKING-TREE BYTES AT A PATH OUTSIDE EVERY WALK ROOT ARE READ BY
 * NEITHER ROUTE, WHETHER OR NOT GIT TRACKS THE PATH. The walk reads three
 * declared roots and this route reads what the INDEX carries, so the two miss
 * the same place from opposite sides. Measured on a throwaway repo: PHI added
 * to a TRACKED `examples/data/*.hl7` and left unstaged prints `OK: no hits` at
 * exit 0, while the identical edit under `test/fixtures/` exits 1 because the
 * walk reads it off disk. An UNTRACKED file out there is not read at all. Both
 * halves are base-identical (nothing outside the roots was read before this
 * route either); what is new is that the claim is now written down. Closing it
 * means enumerating the untracked working tree repo-wide, which is a third
 * enumeration with its own refusal semantics, and it is not this.
 *
 * ONE PROPERTY WORTH KEEPING WHEN THIS IS PORTED: an index blob is immutable
 * and is read out of the object store, so this route has no enumerate-then-read
 * window at all. The TOCTOU tolerance on `Target.tolerateVanish` covers the
 * walk and only the walk.
 *
 * TWO CONDITIONS THAT DO NOT FIRE IN THIS REPO AND WILL FIRE IN A SIBLING. Both
 * were found by review rather than by this repo's own runs, which is exactly why
 * they are written here: this file is the copy the other parsers take.
 *
 *   - EOL NORMALIZATION MAKES EVERY FILE DIVERGE. With `.gitattributes` setting
 *     `eol=crlf`, or `core.autocrlf=true` (the Git-for-Windows default), the
 *     blob and the working-tree file differ by line ending on every text file,
 *     so the byte comparison skips nothing: every file is scanned twice, every
 *     count doubles, and each hit is reported once more under
 *     `INDEX_DIVERGENT_ORIGIN` with a re-staging remedy for a file `git status`
 *     calls unmodified. The direction is fail-safe (a duplicate finding, never
 *     a miss) and this repo has no `.gitattributes` and Linux CI, so it is
 *     recorded rather than handled. DO NOT "fix" it by normalizing before the
 *     comparison: a decoy differing only in line endings would then be skipped,
 *     which is the escape this route exists to close. Check the condition
 *     before porting, and fix it in the reporter if it fires.
 *   - A GITLINK REFUSES THE SWEEP FOREVER. A mode-160000 entry anywhere in the
 *     index is refused by the check above, so a repo with a real submodule
 *     cannot use this route unmodified. That is fail-closed and deliberate here
 *     (this repo has no submodule, and a stray gitlink is a known recurring
 *     accident across these repos), but in a repo that legitimately has one it
 *     is a decision to make, not a line to copy.
 */
const INDEX_ORIGIN = "git index";

/**
 * The label for a path the walk DID read, whose committed bytes are not the
 * bytes on disk. Kept apart from `INDEX_ORIGIN` because the remedy differs: a
 * divergent path needs the corrected file re-staged, while a path the walk
 * never reached (outside every walk root, or absent from the working tree) is
 * fixed exactly like any other file.
 */
const INDEX_DIVERGENT_ORIGIN = "git index; the working tree differs";

/** `maxBuffer` for the two LISTING calls, which return records and not content. */
const INDEX_LIST_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Ceiling on the bytes one sweep will pull out of the object store. A repo
 * bigger than this refuses by name instead of being killed by the allocator,
 * which would surface as an uncaught failure rather than as a scanner refusal.
 */
const INDEX_BLOB_BUDGET_BYTES = 512 * 1024 * 1024;

interface IndexEntry {
  mode: string;
  oid: string;
  stage: string;
  path: string;
}

/** `<mode> SP <oid> SP <stage> TAB <path>`: one `git ls-files -s -z` record. */
const INDEX_RECORD = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/;

/**
 * Every entry the index holds, at every stage. `-z` is NUL-separated and
 * unquoted, so a path matches the walk's forward-slash relative paths exactly.
 *
 * A FAILURE HERE REFUSES rather than falling back to the working tree, which is
 * the whole difference from the `gitTracked()` this replaces: that one returned
 * `null` on failure, switched one tolerance off, and let the sweep report a
 * verdict anyway.
 */
function readIndex(): IndexEntry[] {
  let out: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell.
    out = execFileSync("git", ["ls-files", "-s", "-z"], {
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: INDEX_LIST_MAX_BYTES,
    });
  } catch (err) {
    throw new InvocationError(
      `could not read the git index: ${err instanceof Error ? err.message : String(err)}. ` +
        "All mode reads the bytes git carries as well as the working tree, so it refuses " +
        "rather than reporting a verdict over the working tree alone.",
    );
  }
  const entries: IndexEntry[] = [];
  for (const rec of out.toString("utf8").split("\0")) {
    if (rec.length === 0) continue;
    const m = INDEX_RECORD.exec(rec);
    const mode = m?.[1];
    const oid = m?.[2];
    const stage = m?.[3];
    const path = m?.[4];
    if (mode === undefined || oid === undefined || stage === undefined || path === undefined) {
      // The raw record is NOT echoed, and the reason is NOT that a path is
      // unprintable: every refusal in this file names the paths it is refusing
      // over, because a refusal nobody can act on is worse. It is that a record
      // this regex did not match has no known structure, so there is no path to
      // name in it, and printing unparsed bytes is not the same act as naming a
      // path the code understood.
      throw new InvocationError(
        "could not read the output of `git ls-files -s -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    entries.push({ mode, oid, stage, path });
  }
  return entries;
}

/**
 * The bytes behind each object id, read in ONE `git cat-file --batch` call.
 *
 * `--batch-check` runs first for two reasons, and neither is caution for its
 * own sake: it is where a MISSING or non-blob object is refused by name before
 * anything is read, and its sizes are what `maxBuffer` is derived from. Node's
 * default `maxBuffer` is 1 MiB and this repo's tracked corpus is already past
 * that, so a guessed constant is a gate that starts refusing when the package
 * grows.
 */
function readBlobs(oids: string[]): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>();
  if (oids.length === 0) return blobs;
  const input = `${oids.join("\n")}\n`;

  let checkBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. The input is object ids this
    // process read out of the index, never a path.
    checkBuf = execFileSync("git", ["cat-file", "--batch-check"], {
      input,
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: INDEX_LIST_MAX_BYTES,
    });
  } catch (err) {
    throw new InvocationError(
      `could not query the git object store: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const lines = checkBuf
    .toString("utf8")
    .split("\n")
    .filter((l) => l.length > 0);
  if (lines.length !== oids.length) {
    throw new InvocationError(
      `git cat-file --batch-check answered for ${String(lines.length)} of ` +
        `${String(oids.length)} index objects. Refusing rather than scanning a list that may ` +
        "be short.",
    );
  }
  let total = 0;
  for (const line of lines) {
    // `<oid> blob <size>` for an object that is there, `<oid> missing` for one
    // that is not. An object id is a hash and carries no content, so it is safe
    // to name in a diagnostic; nothing else from the line is printed.
    const m = /^([0-9a-f]+) (\S+)(?: (\d+))?$/.exec(line);
    const oid = m?.[1];
    const type = m?.[2];
    const size = m?.[3];
    if (oid === undefined || type === undefined) {
      throw new InvocationError(
        "could not read the output of `git cat-file --batch-check`: unrecognized record.",
      );
    }
    if (type !== "blob" || size === undefined) {
      throw new InvocationError(
        `the git object store cannot hand back the content the index records at ${oid} ` +
          `(reported as: ${type}). The sweep cannot read what git carries, so it refuses ` +
          "rather than reporting on the working tree alone.",
      );
    }
    total += Number(size);
  }
  if (total > INDEX_BLOB_BUDGET_BYTES) {
    throw new InvocationError(
      `the index holds ${String(total)} bytes of scannable content, past this scanner's ` +
        `${String(INDEX_BLOB_BUDGET_BYTES)}-byte sweep budget. Refusing by name rather than ` +
        "failing in the allocator, which would not read as a scanner refusal.",
    );
  }

  let buf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. `maxBuffer` is the measured
    // total plus a header allowance (one `<oid> blob <size>` line and one
    // trailing newline per object), never a guess.
    buf = execFileSync("git", ["cat-file", "--batch"], {
      input,
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: total + oids.length * 128 + 64 * 1024,
    });
  } catch (err) {
    throw new InvocationError(
      `could not read the git object store: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `<oid> SP blob SP <size> LF <content> LF` per record. Sizes are BYTE counts
  // and the content is binary-safe, so the walk is done on the Buffer and never
  // on a decoded string: decoding first would move every offset after the first
  // multi-byte character.
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(0x0a, i);
    if (nl < 0) {
      throw new InvocationError("`git cat-file --batch` output ended mid-record.");
    }
    const header = buf.toString("utf8", i, nl);
    const m = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    const oid = m?.[1];
    const size = m?.[2];
    if (oid === undefined || size === undefined) {
      throw new InvocationError(
        "could not read the output of `git cat-file --batch`: unrecognized record.",
      );
    }
    const start = nl + 1;
    const end = start + Number(size);
    if (end > buf.length) {
      throw new InvocationError(
        `\`git cat-file --batch\` returned less content than it declared for ${oid}.`,
      );
    }
    blobs.set(oid, buf.subarray(start, end));
    i = end + 1;
  }
  const wanted = new Set(oids);
  if (blobs.size !== wanted.size) {
    throw new InvocationError(
      `read ${String(blobs.size)} of ${String(wanted.size)} index objects. Refusing rather ` +
        "than scanning a corpus that may be short.",
    );
  }
  return blobs;
}

/**
 * One target per index entry whose bytes the walk has not already read.
 *
 * THE SKIP IS A BYTE COMPARISON, NOT A STAT AND NOT A HASH. `git diff-files`
 * and any mtime/size test are exactly what a decoy defeats, and a hash would
 * bind this to the repository's object format. The blob is fetched either way,
 * so comparing it against what the walk read costs one `Buffer.equals` and
 * skips only a file whose committed bytes have provably already been scanned.
 */
/**
 * The in-scope tracked paths the index route is entitled to read: every stage-0
 * regular blob the markdown filter admits. It is `buildTargetsForIndex`'s own
 * filter chain expressed over PATHS alone, with no blob fetched and BEFORE the
 * dedupe against what the walk already read.
 *
 * IT MUST ADMIT THE SAME SET AS `buildTargetsForIndex`'s `readable`, AND THE
 * CLAIM IS SET EQUALITY, NOT ORDER: these are pure predicates in a conjunction,
 * so the order they are written in is free and the two functions do not use the
 * same one. Both directions of a mismatch are bugs, and they are different bugs.
 * A path admitted here and dropped there would be enumerated and never read, so
 * the sweep would refuse over its own bookkeeping. A path dropped here and
 * admitted there would be read without having been declared, which is harmless
 * but makes the completeness difference say less than it claims. The unmerged
 * and non-blob entries this drops are not passed over silently: both REFUSE in
 * `buildTargetsForIndex`, under their own sentences.
 */
function indexCandidatePaths(entries: readonly IndexEntry[]): string[] {
  return [
    ...new Set(
      entries
        .filter(
          (e) =>
            !e.path.toLowerCase().endsWith(".md") &&
            e.stage === "0" &&
            REGULAR_BLOB_MODES.has(e.mode),
        )
        .map((e) => e.path),
    ),
  ];
}

function buildTargetsForIndex(
  entries: readonly IndexEntry[],
  observed: ReadonlyMap<string, Buffer>,
): Target[] {
  // The markdown rule is `walk()`'s, copied rather than invented. It is the one
  // reason an index entry is not read here.
  const inScope = entries.filter((e) => !e.path.toLowerCase().endsWith(".md"));

  // An unmerged path is recorded at one or more of stages 1/2/3 and never at
  // stage 0, so there is no single set of bytes for this route to attribute to
  // it. Refused with the same message the pre-commit route uses.
  // NOT the pre-commit route's sentence. That one names `git show :<path>`,
  // which is how THAT route reads a blob; this one reads by object id out of
  // the entry the index holds, and an unmerged path has no stage-0 entry to
  // take an id from. Same rule, two mechanisms, and a message that names the
  // wrong one sends the reader to the wrong place.
  refuseUnmerged(
    [...new Set(inScope.filter((e) => e.stage !== "0").map((e) => e.path))],
    "the index carries no stage-0 entry for it and there is no one object id for this route " +
      "to read.",
  );

  refuseUnscannable(
    inScope
      .filter((e) => !REGULAR_BLOB_MODES.has(e.mode))
      .map((e) => ({ path: e.path, kind: gitModeKind(e.mode) })),
    // Covers BOTH kinds this can be, because they are not the same thing: for a
    // link git carries the target path, and for a gitlink it carries a commit
    // id in another repository. Neither is content, and the earlier draft of
    // this sentence described a gitlink as though it were a link.
    "git carries a link target or another repository's commit id for such an entry, never " +
      "content, so scanning it would prove nothing about what it refers to.",
    "Remove it from the index, or replace it with a regular file.",
  );

  const readable = inScope.filter((e) => REGULAR_BLOB_MODES.has(e.mode) && e.stage === "0");
  const blobs = readBlobs([...new Set(readable.map((e) => e.oid))]);

  const targets: Target[] = [];
  for (const e of readable) {
    const bytes = blobs.get(e.oid);
    if (bytes === undefined) {
      throw new InvocationError(
        "the git object store did not hand back one of the objects the index records. " +
          "Refusing rather than reporting over a corpus that was not read.",
      );
    }
    const seen = observed.get(e.path);
    if (seen !== undefined && seen.equals(bytes)) continue;
    targets.push({
      path: e.path,
      read: () => bytes,
      origin: seen === undefined ? INDEX_ORIGIN : INDEX_DIVERGENT_ORIGIN,
    });
  }
  return targets;
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
 *   - it keeps hand-written `src/` and `test/` code off the whole-file parse even
 *     when a file embeds an `MSH|…` example string in a comment or test literal:
 *     parsing a `.ts` file as HL7 segments produces only noise.
 * WHAT SUCH A FILE GETS INSTEAD IS NOT "the conservative pass" ANY MORE. It is
 * the shape floor PLUS `scanEmbeddedHl7`, which reads an inline `PID|…` literal
 * with the same field map. This gate decides HOW a file is read, never WHETHER
 * a category is looked for.
 */
function looksLikeHl7(text: string, path: string): boolean {
  // `path === "test/fixtures"` IS THE FIXTURE ROOT'S OWN PATH, and it is here
  // because `--staged` IS THE PRE-COMMIT HOOK. An index entry at exactly
  // `test/fixtures` is never a directory, so it is the fixture root REPLACED by
  // a regular blob; `buildTargetsForStaged` already enumerates it and the mode
  // check already passes it through as a readable file. It was then the DETECTOR
  // gate that dropped it: the prefix wants a trailing slash and the root's own
  // path has neither that nor an `.hl7` suffix, so the bytes fell to the
  // conservative shape pass. Measured twice on `d8d3be3`: the same payload gives
  // six segment-aware hits staged at `test/fixtures/<name>.hl7` and exit 0
  // staged at `test/fixtures`, over a live `PID-3`/`PID-5`/`PID-7`/`PID-11`/
  // `PID-13`. A dashed SSN in the same blob still exited 1, so the floor held
  // and only the segment-aware tier was missing: NOT both-routes-blind, and not
  // a silent pass either, which is why it is one clause and not a new rule.
  //
  // `test` and `src`, the other two roots' own paths, are deliberately NOT here.
  // Neither root is an HL7 corpus, so an entry replacing one is judged the way
  // everything else under it is judged: the conservative shape pass plus the
  // embedded-segment pass in `scanEmbeddedHl7`, which reads an inline `PID|…`
  // wherever it sits.
  const isFixtureLike =
    path === "test/fixtures" || path.startsWith("test/fixtures/") || path.endsWith(".hl7");
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
// Known-segment field detectors, shared by the whole-file and embedded scans
// ---------------------------------------------------------------------------

/**
 * Run every category detector this scanner models over ONE segment's fields.
 * Factored out of `scanHl7` so the embedded-literal pass below runs the SAME
 * detectors rather than a second, drifting copy of the field map: a category
 * added to one of the maps above must reach both callers or the inline half
 * quietly stops covering it.
 */
function checkKnownSegmentFields(
  path: string,
  segId: string,
  elems: string[],
  d: Delimiters,
  allow: AllowList,
  hits: Hit[],
): void {
  for (const f of XPN_NAME_FIELDS[segId] ?? []) {
    checkNameField(path, segId, f, fieldAt(elems, f), 0, d, allow, hits);
  }
  for (const f of XCN_NAME_FIELDS[segId] ?? []) {
    checkNameField(path, segId, f, fieldAt(elems, f), 1, d, allow, hits);
  }
  for (const f of DOB_FIELDS[segId] ?? []) {
    checkDobField(path, segId, f, fieldAt(elems, f), d, allow, hits);
  }
  for (const f of ADDRESS_FIELDS[segId] ?? []) {
    checkAddressField(path, segId, f, fieldAt(elems, f), d, allow, hits);
  }
  for (const f of PHONE_FIELDS[segId] ?? []) {
    checkPhoneField(path, segId, f, fieldAt(elems, f), d, hits);
  }
  for (const f of CX_ID_FIELDS[segId] ?? []) {
    checkCxField(path, segId, f, fieldAt(elems, f), d, allow, hits);
  }
  for (const f of SSN_ST_FIELDS[segId] ?? []) {
    checkSsnStField(path, segId, f, fieldAt(elems, f), allow, hits);
  }
}

// ---------------------------------------------------------------------------
// Embedded-literal HL7 scanner (inline fixtures in hand-written source)
// ---------------------------------------------------------------------------

/**
 * The segment ids this scanner has a PHI field map for. Derived from the maps
 * themselves rather than re-listed, so it cannot drift from them.
 */
const PHI_FIELD_SEGMENTS: ReadonlySet<string> = new Set<string>([
  ...Object.keys(XPN_NAME_FIELDS),
  ...Object.keys(XCN_NAME_FIELDS),
  ...Object.keys(DOB_FIELDS),
  ...Object.keys(ADDRESS_FIELDS),
  ...Object.keys(PHONE_FIELDS),
  ...Object.keys(CX_ID_FIELDS),
  ...Object.keys(SSN_ST_FIELDS),
]);

/**
 * A PHI-field segment id at a token boundary, followed by the default HL7 field
 * separator. The lookbehind keeps `RAPID|` and `helperGT1|` from matching; the
 * ids are anchored to the map above so a segment with no field map never starts
 * a run.
 */
const EMBEDDED_SEGMENT_RE = new RegExp(
  `(?<![A-Za-z0-9_])(${[...PHI_FIELD_SEGMENTS].join("|")})\\|`,
  "g",
);

/**
 * Pull HL7 segment runs out of text that is NOT itself an HL7 message.
 *
 * WHY THIS EXISTS, and it is the half that a widened walk root does NOT buy:
 * `looksLikeHl7` assumes THE FILE IS THE DOCUMENT, and an inline fixture is a
 * TypeScript string literal. Bringing `test/**` into scope therefore bought the
 * conservative shape pass over 115 more files and nothing else: a dashed SSN and
 * a non-test email domain, with no name, DOB, MRN, address or phone detection at
 * all. 55 of those 115 files carry an inline `PID|` literal (measured on
 * `d8d3be3`). Widening the SCOPE and widening the RECOGNISER are two changes and
 * this is the second one; neither substitutes for the other.
 *
 * WHAT IT DOES. Source-level `\r` / `\n` ESCAPE SEQUENCES are treated as segment
 * separators, because a whole message is routinely one literal
 * (`` `${MSH}\r` + "PID|1||…" ``) and without that the run would be one line and
 * the field offsets would be nonsense. Each physical line is then searched for a
 * segment id from `PHI_FIELD_SEGMENTS` followed by `|`, and the run is taken to
 * the end of the line or to the first source quote after it, whichever comes
 * first: the tail of `"PID|…|F|||" +` is TypeScript, not HL7, and reading it as
 * a field would invent values that are not in the fixture.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, stated rather than discovered later:
 *   - DEFAULT DELIMITERS ONLY (`|^~\&`). An embedded run has no reachable
 *     `MSH-2`: the encoding characters are themselves source-escaped
 *     (`MSH|^~\\&|`), and a run is matched per line with no header in hand. A
 *     custom-delimiter message written inline is therefore covered at the
 *     dashed-SSN / email floor only. The committed corpus keeps its
 *     custom-delimiter cases as real `.hl7` fixtures, which get the full scan.
 *   - NO UNKNOWN-SEGMENT BACKSTOP. `checkUnknownSegment` flags any adjacent pair
 *     of name-shaped components in ANY field, which is the right backstop for a
 *     file that is known to be a message and a noise cannon over TypeScript. So
 *     an inline `Z…` site-defined segment carrying a name is NOT detected here.
 *   - IT IS ADDITIVE TO `scanCommonShapes`, NEVER INSTEAD OF IT. Both run on
 *     every non-fixture target.
 *   - A TEMPLATE-LITERAL INTERPOLATION IS ERASED, NOT READ, AND THE RESIDUAL IS
 *     BIGGER THAN "a runtime-only value". Reading the IDENTIFIER in
 *     `` `PID|…||${x}` `` as a person-name token invents a finding out of
 *     program text (measured: `content`, `marker`, `familyName` and
 *     `pidSurname` were each reported as a patient name), so it is erased.
 *     BE EXACT ABOUT WHAT THAT COSTS, because the loose form of this sentence
 *     was refuted in review: the bound is ANY value reached through an
 *     interpolation, INCLUDING one whose literal sits in the same file.
 *     Measured: `const fam = "<surname>"` followed by
 *     `` `PID|1||<mrn>^^^HOSP^MR||${fam}^${giv}||<dob>|F` `` exits 1 on the
 *     MRN and the DOB and is SILENT ON THE NAME. It is not "the value is not in
 *     the file"; it is that this pass reads LITERALS IN FIELD POSITION and does
 *     not evaluate anything. `scanCommonShapes` still reads the whole file, so a
 *     dashed SSN or a non-test email in such a constant is caught either way.
 *     Erasing rather than skipping the run keeps the FIELD POSITIONS intact, so
 *     a real literal elsewhere in the same segment is still read at its own
 *     field number.
 *   - A RUN IS CUT AT THE FIRST SOURCE QUOTE, AND THAT CUTS HL7 DATA TOO. The
 *     cut is what stops `" +` and the rest of the line being read as fields, and
 *     it is not free: the two-character literal `""` is HL7 v2's EXPLICIT-NULL
 *     field value (no clause number is quoted here, deliberately: an unverified
 *     citation in a porting source is the same species as a drifting score. The
 *     behaviour is grounded in this repo's own parser, `src/model/field.ts`,
 *     whose `isNull` is true iff the field was exactly those two characters), so
 *     an inline fixture testing null handling loses everything after it.
 *     Measured, same bytes both ways: `PID|1|""|MRN001||<surname>^<given>||<dob>|F`
 *     exits 1 with `PID-5` and `PID-7` at a `.hl7` path and exits 0 as an inline
 *     literal, because the extracted run is `PID|1|`. An apostrophe inside a
 *     name (`O'Brien`) truncates identically. This is a MISS, not a false
 *     positive, and it is not repaired by teaching the cut about quoting: the
 *     enclosing quote style is not knowable from a single line, and a wrong
 *     guess reads program text as patient data. Stated so nobody reads the pass
 *     as complete.
 */
function extractEmbeddedSegments(text: string): string[] {
  const out: string[] = [];
  // A source-level `\r`, `\n` or `\r\n` escape stands in for the wire segment
  // separator. Two characters in the file's bytes, so this is a text
  // substitution and not `stripFraming`'s real-control-character handling.
  // `${…}` goes first and collapses to nothing, so an interpolated field stays
  // an EMPTY field rather than shifting every field after it.
  const lines = text
    .replace(/\$\{[^{}]*\}/g, "")
    .replace(/\\r\\n|\\r|\\n/g, "\n")
    .split(/\r\n|\r|\n/);
  for (const line of lines) {
    for (const m of line.matchAll(EMBEDDED_SEGMENT_RE)) {
      const start = m.index;
      const rest = line.slice(start);
      // Cut at the first source quote: everything after it is program text.
      const q = rest.search(/["'`]/);
      const run = (q < 0 ? rest : rest.slice(0, q)).trimEnd();
      if (run.length > 0) out.push(run);
    }
  }
  return out;
}

function scanEmbeddedHl7(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  const d: Delimiters = { field: "|", component: "^", repetition: "~", escape: "\\" };
  for (const run of extractEmbeddedSegments(text)) {
    const elems = run.split(d.field);
    const segId = (elems[0] ?? "").toUpperCase();
    if (!PHI_FIELD_SEGMENTS.has(segId)) continue;
    checkKnownSegmentFields(path, segId, elems, d, allow, hits);
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

    checkKnownSegmentFields(target.path, segId, elems, d, allow, hits);
  }
  // Cross-cutting shape checks over the whole payload (catches free-text PHI in
  // OBX-5 / NTE that the field map does not model).
  scanCommonShapes(target.path, text, allow, hits);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Scan one target. Returns THE BYTES that were actually observed, or `null`
 * when the one tolerated case fired (see `Target.tolerateVanish`) and the
 * caller must account for the file it did not read. Every other read failure
 * throws and refuses the whole scan.
 *
 * IT RETURNS THE BYTES RATHER THAN A BOOLEAN because the index corpus is
 * reconciled against them: "this path was read" is not the question, "these
 * exact bytes were read" is.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[]): Buffer | null {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    // TOCTOU, see `Target.tolerateVanish`: an untracked file the walk enumerated
    // itself may be a build transient that was deleted before we reached it.
    // Report it as unobserved instead of refusing; every other failure, and any
    // tracked file, still refuses the whole scan.
    if (target.tolerateVanish === true && errorCode(err) === "ENOENT") return null;
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = buf.toString("utf8");
  if (looksLikeHl7(text, target.path)) {
    scanHl7(target, text, allow, hits);
  } else {
    // Non-HL7 target (hand-written src, a test module, plain-text notes). TWO
    // passes, and the second is IN ADDITION to the first, never instead of it:
    // the conservative shape floor over the whole file, plus the embedded pass
    // that reads an inline `PID|…` literal with the same field map a real
    // fixture gets. On its own the floor is a dashed SSN and a non-test email
    // domain, which is not what "this file is scanned" sounds like.
    scanCommonShapes(target.path, text, allow, hits);
    scanEmbeddedHl7(target.path, text, allow, hits);
  }
  return buf;
}

/**
 * Scan one target and stamp `Target.origin` onto whatever it found. The
 * detectors never learn which route they are running under: they push a hit
 * with the path, and the origin is applied to the hits this call added.
 */
function scanAndAttribute(target: Target, allow: AllowList, hits: Hit[]): Buffer | null {
  const before = hits.length;
  const bytes = scanTarget(target, allow, hits);
  if (target.origin !== undefined) {
    for (let i = before; i < hits.length; i += 1) {
      const h = hits[i];
      if (h !== undefined) h.origin = target.origin;
    }
  }
  return bytes;
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
  // Grouped by path AND origin, never by path alone: bytes read off the working
  // tree and bytes read out of the index are two different findings about one
  // path, and merging them under one heading would say the file on disk carries
  // something it does not.
  const byLocus = new Map<string, Hit[]>();
  for (const h of hits) {
    const key = `${h.path}\0${h.origin ?? ""}`;
    const arr = byLocus.get(key);
    if (arr) arr.push(h);
    else byLocus.set(key, [h]);
  }
  const paths = new Set<string>();
  let fromIndex = 0;
  for (const group of byLocus.values()) {
    const first = group[0];
    if (first === undefined) continue;
    paths.add(first.path);
    if (first.origin === INDEX_DIVERGENT_ORIGIN) fromIndex += group.length;
    const where = first.origin === undefined ? "" : ` (${first.origin})`;
    process.stderr.write(`[phi-scan] HIT: ${first.path}${where}\n`);
    for (const h of group) {
      process.stderr.write(
        `  segment=${h.segment} value=${JSON.stringify(h.value)} (${h.reason})\n`,
      );
    }
  }
  // THE FOOTER NO LONGER OFFERS `--allow-fixture` AS A REMEDY, AND THAT IS A
  // DECISION RATHER THAN AN OMISSION. A bypass withdraws a file from the read
  // set, and the completeness rule at the end of `main` refuses (exit 2) over a
  // target enumerated and never read, so a developer following the superseded
  // sentence would be walked from exit 1 into exit 2. A printed remedy that
  // cannot reach the state it promises is the same defect as one that reaches a
  // false green, with the sign flipped. The flag is still described (silently
  // dropping a documented flag from the diagnostic that names it is how the next
  // reader re-adds it), but described as what it now is.
  //
  // AND THE REPLACEMENT IS NOT UNIVERSAL, WHICH THE FIRST DRAFT OF THIS FOOTER
  // CLAIMED IT WAS AND A REVIEWER REFUTED. "Declare it in the allow-list" is the
  // remedy for the categories the allow-list HAS A TAG FOR (NAME, DOB, ADDR, ID,
  // EMAILDOMAIN). TWO DETECTORS HAVE NO TAG AT ALL: `scanCommonShapes`'s dashed
  // SSN pushes unconditionally, and `checkPhoneField` is not even handed the
  // allow-list. Measured on a fixture whose only hit was a dashed SSN, with
  // `ID`, `NAME`, `ADDR` and `DOB` entries for both the dashed and undashed
  // spellings: still exit 1. So for those two the remedy is TO CHANGE THE VALUE
  // (the `555` fake-exchange convention for a phone; a token that is not a
  // 9-digit dashed group for an SSN), and telling a developer to edit the
  // allow-list instead would be this file's own named defect a second time. The
  // superseded footer's `--allow-fixture` branch DID clear those two, so the
  // honest statement of what this slice costs has to name them.
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(paths.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt, which is ` +
      `reviewed per value and leaves the file read. That covers the name, DOB, address, ` +
      `identifier and email-domain categories; a dashed SSN and a non-555 phone have NO ` +
      `allow-list tag, so for those the value itself has to change. ` +
      `A whole-file --allow-fixture bypass is still gated on phi-scan-overrides.md and is ` +
      `then REFUSED (exit 2), because a scan that never opened a file has no clean verdict ` +
      `to give about it.\n`,
  );
  if (fromIndex > 0) {
    // Named explicitly, because the remedy differs: these bytes are the ones
    // git carries, and they are not the bytes on disk. Editing the file alone
    // does not clear them.
    process.stderr.write(
      `[phi-scan] ${String(fromIndex)} of those are in bytes git carries at that path rather ` +
        `than in the working-tree file, so re-staging the corrected file is part of the fix.\n`,
    );
  }
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
  // Only all mode reads the index corpus, so only all mode holds an index here.
  let index: IndexEntry[] | null = null;
  try {
    allow = loadAllowList();
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else {
      index = readIndex();
      if (index.length === 0) {
        // AN EMPTY INDEX IS NOT A CLEAN CORPUS, IT IS NO CORPUS. `git ls-files`
        // exits 0 with no output for a removed `.git/index` (a corrupt one
        // exits non-zero and lands in the catch above), and every reconciliation
        // this route performs is vacuously satisfied by it.
        throw new InvocationError(
          "refusing the scan: the git index holds no entries, so there is no corpus to " +
            "reconcile the working tree against and every check against it would pass " +
            "vacuously. Run this from a repository with a populated index.",
        );
      }
      targets = buildTargetsForAll(new Set(index.map((e) => e.path)));
    }
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  // ENUMERATED: every path this run DECLARED it would read, recorded BEFORE
  // `--allow-fixture` subtracts from it and grown below by the index route's
  // own targets. It is A SET AND NEVER A COUNT, because the completeness rule
  // at the end of `main` has to NAME the paths that went unread and a tally
  // cannot: "M of N read" counts the targets that DID get read, which is
  // exactly the arithmetic that hides which ones did not.
  //
  // WHAT IS ABSENT FROM IT IS AS LOAD-BEARING AS WHAT IS IN IT. A path an
  // enumerating route filtered out upstream never became a target and is not in
  // here, so the rule below does not fire on it. The rule speaks only about
  // targets this run named for itself. Each filter lives in exactly one place
  // and is named here rather than restated, and the homes are NOT all the
  // function you would guess: `walk()` carries the `.md` exclusion only, while
  // the gitignore filter is applied by its caller `buildTargetsForAll`;
  // `buildTargetsForIndex` copies that same `.md` exclusion; `--diff-filter`
  // drops a DELETED record before `buildTargetsForStaged` sees it, and that
  // function's own `inScope` predicate is narrower than the sweep's roots on
  // purpose. WHAT IS NOT A FILTER IS A REFUSAL: an unmerged
  // path and a non-regular entry are dropped from these lists and then REFUSED
  // under their own sentences, so nothing leaves through here quietly.
  const enumerated = new Set<string>(targets.map((t) => t.path));

  targets = targets.filter((t) => !allowed.has(t.path));

  const hits: Hit[] = [];
  const vanished: Target[] = [];
  const observedRoots = new Set<string>();
  // READ: filled in only once a target's bytes have been through `scanTarget`,
  // so it is evidence of observation and never a plan to observe. `observed`
  // below records the BYTES for the index route's dedupe and is walk-only; this
  // set records the FACT of a read on both routes, which is the other question.
  const read = new Set<string>();
  // What the walk actually read, keyed by path. The index corpus below skips a
  // blob whose bytes are already in here, so nothing is scanned or reported
  // twice, and a path whose working-tree bytes DIFFER is scanned both ways.
  const observed = new Map<string, Buffer>();
  for (const t of targets) {
    try {
      const bytes = scanAndAttribute(t, allow, hits);
      if (bytes !== null) {
        read.add(t.path);
        observed.set(t.path, bytes);
        // Attributed through the SAME predicate the walk's roots are declared
        // by, never a second copy of the prefix rule. A `paths`-mode target can
        // sit outside every root and contribute nothing here; that mode makes no
        // per-root promise. EVERY matching root is credited, not just one: a
        // fixture sits under `test/fixtures` AND under `test`, and crediting one
        // of the two would starve the other forever.
        for (const root of rootsOf(t.path)) observedRoots.add(root);
      } else vanished.push(t);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // THE WALK'S ACCOUNTING RUNS HERE, BEFORE THE INDEX CORPUS, and the order is
  // the fix to a defect rather than a preference: the index route can refuse
  // (an unmerged entry, a tracked link) and return, and with this block after
  // it a tolerated skip went unmentioned on exactly those paths, against the
  // rule this block states. Nothing in it has a DATA dependency on the index
  // route, so the disclosure becomes unconditional.
  //
  // IT IS NOT FREE, AND THE FIRST DRAFT OF THIS COMMENT CLAIMED IT WAS. The
  // re-check below asks whether a tolerated file is back on disk, so its window
  // ends where this block runs: after the index route, the window included that
  // route's `cat-file` calls, and here it does not. Measured, same repo, a
  // transient restored during that call: the wider window refused (exit 2) and
  // this position reports the skip and exits 0. That is the BASE commit's
  // window, not a new gap, and the run is never silent about it (the clean line
  // stays qualified and the file is named on stderr). The wider window was an
  // accident of ordering rather than a decision, and deciding it deliberately
  // is its own slice.
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

  // THE INDEX CORPUS, all mode only: the bytes git carries, at every path it
  // carries them, whether or not that path sits under a walk root and whether
  // or not the working tree still agrees with it. The mechanism, everything it
  // closes and everything it deliberately does not do are written down once, at
  // `buildTargetsForIndex` and the section above it.
  //
  // ITS TARGETS ARE NOT CREDITED TO `observedRoots`, deliberately. The per-root
  // rule below is a statement about the WALK, and a root emptied on disk still
  // refuses even though every file under it was just read out of the index.
  if (index !== null) {
    let indexTargets: Target[];
    try {
      indexTargets = buildTargetsForIndex(index, observed);
    } catch (err) {
      if (err instanceof InvocationError) {
        // A REFUSAL MUST NOT SWALLOW A REAL HIT, the same rule the starved-root
        // refusal below already carries and pins. An unmerged path or a tracked
        // link ANYWHERE in the index refuses the sweep, and the walk may already
        // have found PHI under a root that yielded perfectly well: printing the
        // refusal alone made this route's output strictly worse than the base
        // commit's for that input (measured: exit 1 with five hits on base, exit
        // 2 and silence here). The exit code is still 2, because an incomplete
        // sweep is not a verdict whatever it found on the way.
        if (hits.length > 0) report(hits, vanished.length);
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
    // THE INDEX ROUTE DECLARES INTO THE SAME SET, so the completeness rule
    // below is an accounting of BOTH halves of the union rather than the walk
    // alone.
    //
    // IT CANNOT FIRE THROUGH THIS ROUTE TODAY, AND SAYING OTHERWISE WAS A DRAFT
    // DEFECT A REVIEWER MEASURED: deleting this line changes no outcome and reds
    // no test. The index route runs only in `all` mode, `allowed` is always
    // empty there, and an index target's bytes are already in memory, so every
    // path declared here is read unconditionally. It is written anyway for the
    // same reason the `allowed` subtraction below it is, and both say so.
    //
    // IT SEEDS FROM THE CANDIDATE PATHS, NOT FROM `indexTargets`, AND THAT IS
    // THE DIFFERENCE THAT SURVIVES A CHANGE. `buildTargetsForIndex` drops a path
    // when the walk already read byte-identical bytes at it; seeding from what
    // it RETURNS is exact only while that dedupe stays a byte comparison, and it
    // would silently stop covering those paths if the dedupe ever loosened.
    // Seeding from the filter chain's own output, before the dedupe, is the
    // shape the settled template uses, and it keeps the difference exact either
    // way: a deduped path is in `read` because the walk read it.
    for (const p of indexCandidatePaths(index)) enumerated.add(p);
    // The same subtraction the walk's targets get. It is UNREACHABLE today
    // (`parseArgs` seeds the positional path set from `--allow-fixture` only
    // when no positional path was given, and `staged` is tested before `paths`,
    // so the flag never resolves to `all`), and it is applied anyway so the two
    // routes cannot disagree about an acknowledged path if that ever changes. If
    // it ever becomes reachable the subtracted path is now enumerated-and-unread,
    // so it refuses below instead of going quiet.
    for (const t of indexTargets.filter((t) => !allowed.has(t.path))) {
      try {
        // The bytes are already in memory, so this cannot fail the way a
        // working-tree read can, and it can never be tolerated as vanished.
        scanAndAttribute(t, allow, hits);
        read.add(t.path);
      } catch (err) {
        if (err instanceof InvocationError) {
          if (hits.length > 0) report(hits, vanished.length);
          process.stderr.write(`[phi-scan] ${err.message}\n`);
          return 2;
        }
        throw err;
      }
    }
  }

  // Refuse a sweep that observed nothing UNDER ANY ONE OF ITS ROOTS.
  //
  // PER-ROOT, NOT GLOBAL, AND THAT IS THE WHOLE POINT OF THIS BLOCK. The global
  // form was satisfied by ANY ONE surviving file, so a single `src/` module
  // vouched for the entire fixture corpus and vice versa. Measured on this repo
  // at `04e4bc6`, three ways, each printing `[phi-scan] OK: no hits` at exit 0:
  // with `test/fixtures` moved away, with `test/fixtures` replaced by a DANGLING
  // symlink, and with `src` moved away. The first two leave all 106 non-markdown
  // fixtures unread; the third leaves all 95 source files unread.
  //
  // NEITHER STARVED STATE IS EVEN AN ENUMERATION ERROR HERE, which is why nothing
  // else caught it: `walk()` returns early on a root `existsSync` cannot resolve,
  // and `existsSync` FOLLOWS a link, so absent, dangling and empty are one thing
  // to it. The not-a-regular-entry refusal never sees a root at all, because
  // `walk` is entered AT a root and only ever classifies entries found INSIDE
  // one. And this reporter prints no denominator, so unlike the sibling this rule
  // was ported from there was not even a suspicious file count to notice.
  //
  // THE SUPERSEDED JUSTIFICATION ASSERTED THE CONCLUSION, which is how the global
  // shape survived review here: "both of which always hold committed files" is a
  // statement about the repo at rest, and the two states above are exactly the
  // states in which it stops being true.
  //
  // THE ALL-STARVED CASE IS THE OLD GLOBAL RULE, so this REPLACES it rather than
  // sitting beside it: observing zero files names every root, and the same
  // refusal carries.
  //
  // AND THE GRANULARITY IS THE DECLARED ROOT, NOTHING FINER. A missing directory
  // INSIDE a root still goes unobserved, a root that is itself a symlink is still
  // followed, and one file is enough to satisfy a root of 106. All of that is
  // measured in the limits list in the header. Do not read this rule as more than
  // a per-ROOT floor of one, and do not answer any of those by growing this block.
  //
  // (`staged` legitimately has nothing to scan when a commit touches only
  // markdown, and `paths` is bounded by the caller's argv. Neither enumerates a
  // root, so neither can make a per-root promise, and neither is subject to this.)
  if (args.mode === "all") {
    const starved = SCAN_ROOTS.filter((root) => !observedRoots.has(root));
    if (starved.length > 0) {
      // A REFUSAL MUST NOT SWALLOW A REAL HIT. Whatever the yielding roots turned
      // up is printed first; the exit code is still 2, because an incomplete
      // sweep is not a verdict whatever it found on the way.
      if (hits.length > 0) report(hits, vanished.length);
      process.stderr.write(
        `[phi-scan] refusing: the all-mode sweep observed no files under ` +
          `${String(starved.length)} of its ${String(SCAN_ROOTS.length)} scan roots ` +
          `(${starved.join(", ")}), so it proves nothing about them. The observation rule ` +
          `is PER-ROOT: a clean result earned under the other roots says nothing about a ` +
          `root that yielded nothing, and an absent, dangling or empty root yields nothing ` +
          `silently. Restore it, or change SCAN_ROOTS in scripts/phi-scan.ts.\n`,
      );
      return 2;
    }
  }

  // TIER 1 OF TWO: A BYPASS MUST NAME A PATH THIS RUN ENUMERATES.
  //
  // A bypass is a SUBTRACTION from this run's own target list. One that matches
  // no target subtracts nothing, so it is accepted, its audit entry is checked,
  // and it is then IGNORED, and the run reports on a corpus the developer
  // believes was acknowledged. Measured on `dfac162`, in a throwaway repo:
  // `phi-scan <clean file> --allow-fixture <file holding a PID-5 name token>`,
  // with the second path logged in `phi-scan-overrides.md`, printed
  // `[phi-scan] OK: no hits` and exited 0. The seeding rule in `parseArgs` is
  // why: it seeds the positional set from the bypass list ONLY when no
  // positional path was given, so with one present the named file was never
  // ADMITTED to the run rather than withdrawn from it. This tier is the fix, and
  // it is the fix rather than changing that seeding rule because the seeding
  // rule is what four other paragraphs in this file reason from ("the flag
  // never resolves to `all`").
  //
  // IT IS A DIFFERENCE AGAINST THE ENUMERATED SET AND NAMES EVERY OFFENDER.
  //
  // IT SITS BELOW THE SCAN RATHER THAN BESIDE `parseArgs` for one reason: hits
  // found under the targets that WERE read are printed first, the same rule the
  // starved-root refusal above already carries. A refusal must not swallow a
  // real hit.
  const unmatchedBypass = [...allowed].filter((p) => !enumerated.has(p));
  if (unmatchedBypass.length > 0) {
    if (hits.length > 0) report(hits, vanished.length);
    process.stderr.write(
      `[phi-scan] refusing: --allow-fixture named ${String(unmatchedBypass.length)} path(s) ` +
        `this run does not enumerate, so the flag subtracts nothing:\n` +
        `${unmatchedBypass.map((p) => `  - ${p}`).join("\n")}\n` +
        `A bypass that matches no target is accepted, logged and then ignored, which reads as ` +
        `an acknowledgement of a file the run never had in scope. Name a path this run ` +
        `actually enumerates, or drop the flag. In --staged mode the target list is what the ` +
        `pre-commit predicate enumerates, which is narrower than the sweep's scan roots on ` +
        `purpose.\n`,
    );
    return 2;
  }

  // TIER 2 OF TWO: THE COMPLETENESS RULE. A TARGET THIS RUN ENUMERATED AND
  // NEVER READ REFUSES (exit 2), IN EVERY MODE, NAMING THE PATHS.
  //
  // THE DEFECT IT CLOSES, measured on `dfac162` in a throwaway repo laid out
  // like this one, with the bypassed path logged in `phi-scan-overrides.md`
  // exactly as the rejection gate instructs: `phi-scan <violator> <decoy>
  // --allow-fixture <decoy>` exited 1 naming only the violator, so the same argv
  // over a corpus whose ONLY violator is the withdrawn file exited 0 and printed
  // `[phi-scan] OK: no hits`, byte-identical stdout and exit code to a genuine
  // clean run over the same tree, with one of the two declared files never
  // opened. A scan that did not open a file has no clean verdict to give
  // about it.
  //
  // A SET DIFFERENCE, NEVER A SIZE COMPARISON, and that is not a style
  // preference: a count counts the targets that DID get read, so `n read of n
  // targets` is exactly the arithmetic that hides which ones did not, and it
  // still would not say WHICH. `enumerated` is what the routes declared;
  // `read` holds only paths whose bytes went through `scanTarget`. The refusal
  // prints the difference.
  //
  // WHAT IT COSTS, DECIDED RATHER THAN STUMBLED INTO: `--allow-fixture` can no
  // longer reach exit 0 in any mode: this tier and tier 1 together, and neither
  // alone. Tier 1 judges a bypass that landed on nothing; this one judges a
  // bypass that landed on the target list. The flag, its override log and its
  // rejection gate all stay: they still name the path and still demand a
  // committed audit entry, and the run now ends in a refusal that names it
  // instead of a green line that does not. THE MECHANISM THAT SURVIVES IS THE
  // TOKEN-LEVEL ALLOW-LIST (`scripts/phi-allow-list.txt`), which declares a
  // VALUE synthetic while the file is still read. `phi-scan-overrides.md`
  // already told developers to prefer it. The suite's older case pinning
  // "--allow-fixture with an override-log entry exits 0" is INVERTED rather than
  // deleted, because a subtraction from a scan is still a file the scan proved
  // nothing about.
  //
  // AND IT DOES NOT SURVIVE FOR EVERY DETECTOR, WHICH IS THE REAL COST AND WAS
  // OVERSTATED HERE UNTIL A REVIEWER MEASURED IT. The allow-list has five tags
  // (NAME, DOB, ADDR, ID, EMAILDOMAIN). The dashed-SSN branch of
  // `scanCommonShapes` consults none of them and `checkPhoneField` is not handed
  // the allow-list at all, so for those two categories NO declaration clears a
  // hit: with the file still in scope, the value itself has to change. (Taking
  // the file OUT of scope also reaches exit 0, by renaming it to `.md` or by
  // untracking and gitignoring it. Both are scope changes rather than remedies,
  // and neither is what the footer should send a developer to do.) That is a real narrowing versus the superseded behaviour, where the
  // bypass cleared them, and it is written down rather than left for the next
  // developer to discover from a footer that told them to edit a file that
  // cannot help. Giving those two detectors a tag is a defensible follow-up and
  // is NOT this slice: it widens what can be declared synthetic, which is a
  // change to what the gate permits and deserves its own review.
  //
  // A TOLERATED VANISH IS CARVED OUT BY NAME, AND THE CARVE-OUT CANNOT LAUNDER A
  // BYPASS. `Target.tolerateVanish` is set only in `buildTargetsForAll`, i.e.
  // only in `all` mode and only for a file git does not track; `allowed` is
  // always empty in `all` mode (`parseArgs` never resolves the flag to `all`).
  // So the two sets are disjoint by construction and a withdrawn file can never
  // arrive here dressed as a transient. What the carve-out does admit is exactly
  // what the header's TOCTOU paragraph already admits: an UNTRACKED file the
  // walk listed and that is gone by the time we read it. Its bytes do not exist
  // to be read, nothing commits it, the run is never silent about it (the file
  // is named on stderr and the clean line is qualified), and a file that is back
  // on disk already refused above. Everything else (a tracked file, a
  // non-`ENOENT` failure) throws out of the scan loop and returns 2 there, so
  // it never reaches this line as a quiet gap.
  //
  // IT IS WRITTEN FOR EVERY MODE AND `--allow-fixture` IS THE ONLY WAY TO REACH
  // IT TODAY. That is deliberate: it is a floor on the CONTRACT (a green line
  // means every target's bytes were read), not on one caller's argv.
  const tolerated = new Set<string>(vanished.map((t) => t.path));
  const unread = [...enumerated].filter((p) => !read.has(p) && !tolerated.has(p));
  if (unread.length > 0) {
    // A REFUSAL MUST NOT SWALLOW A REAL HIT: whatever the targets that WERE read
    // turned up is printed first, and the code is still 2, because an incomplete
    // scan is not a verdict whatever it found on the way.
    if (hits.length > 0) report(hits, vanished.length);
    process.stderr.write(
      `[phi-scan] refusing the scan: ${String(unread.length)} target(s) were enumerated and ` +
        `never read:\n${unread.map((p) => `  - ${p}`).join("\n")}\n` +
        `A scan that did not open a file has no clean verdict to give about it, and reading ` +
        `one target says nothing about another. Drop the --allow-fixture flag, or declare the ` +
        `individual value synthetic in scripts/phi-allow-list.txt, which is reviewed per value ` +
        `and leaves the file read.\n`,
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
