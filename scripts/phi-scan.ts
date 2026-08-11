#!/usr/bin/env tsx
/**
 * `@cosyte/hl7` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * ===========================================================================
 * WHAT IS IN THIS FILE, AND WHAT IS NOT.
 *
 * THE MACHINERY IS `@cosyte/script-utils/phi-scan`, A devDependency, AND IT IS
 * A DEPENDENCY RATHER THAN A COPY. Argument parsing, the allow-list and the
 * override log, target enumeration on all three routes, the union of the
 * working-tree walk with the bytes git carries, content deduplication, THE
 * COMPLETENESS RULE, every refusal, and the cross-cutting SSN/email FLOOR all
 * live there. Read that module's docblock for what each rule closes and what it
 * costs; nothing is restated here, because a claim written down twice is a claim
 * that drifts.
 *
 * This file used to carry the whole engine, and `scripts/parser-template/` in
 * `cosyte/config` is a SCAFFOLD rather than a dependency, so every parser repo
 * held its own copy. A newly-found escape therefore cost one pull request and
 * one adversarial review PER REPO. Now it costs one pull request in
 * `cosyte/config` and a version bump here.
 *
 * It is a devDependency and never a runtime one: the zero-dep rule governs what
 * ships, and a dev-time gate does not ship.
 *
 * WHAT STAYS LOCAL is what genuinely differs: THE FIVE PER-REPO AXES below, and
 * the HL7-SPECIFIC FIELD DETECTION in `detect` at the bottom of this file.
 * ===========================================================================
 *
 * ===========================================================================
 * 🛑 THIS ADOPTION IS INCOMPLETE AND THE GATE IS RED ON `@cosyte/script-utils`
 * 0.0.2. IT IS BLOCKED ON ONE ENGINE CHANGE, MEASURED, NOT INFERRED.
 *
 * THE ENGINE DOES NOT PARSE THE `ADDR` ALLOW-LIST TAG. Its `AllowList` models
 * `NAME`, `DOB`, `ID` and `EMAILDOMAIN` and drops every other line, while its
 * own docblock names ADDRESS as one of the five categories a caller's detectors
 * own. `scripts/phi-allow-list.txt` in this repo declares five `ADDR` values,
 * and `checkAddressField` below is the detector that consumes them.
 *
 * MEASURED on this branch with the tag unavailable: `pnpm phi-scan` over the
 * committed corpus reports 17 hits across 14 files and exits 1, every one of
 * them a `PID-11` / `NK1-4` street address that IS declared synthetic in this
 * repo's allow-list. There is no configuration-only remedy: `allowListPath`
 * moves the file, it does not widen the parse.
 *
 * NOTHING LOCAL STANDS IN FOR IT, DELIBERATELY. A repo-local re-parse of that
 * file is exactly the hand-maintained machinery adopting the engine exists to
 * delete, and it is what makes the next escape cost thirteen pull requests
 * instead of one. The remedy is an engine change plus a version bump here.
 * ===========================================================================
 * WHAT ADOPTING THE ENGINE CHANGED IN THIS REPO'S OWN BEHAVIOUR.
 *
 * The port is not free, and the differences are written down here rather than
 * left to be discovered from a red gate. AT LEAST the following changed; no
 * claim is made that the list is complete, because nothing here has measured it
 * to be:
 *
 *   - `Target.tolerateVanish` IS GONE, AND IT IS AN ENGINE GAP RATHER THAN A
 *     LOCAL DECISION. The superseded scanner carried a TOCTOU carve-out: an
 *     UNTRACKED file the walk enumerated itself and that was gone by the time it
 *     was read (a build tool's transient) was reported as SKIPPED, on stderr,
 *     with the clean line qualified, at exit 0. The engine has no equivalent: a
 *     read that fails is a target enumerated and never read, so the sweep
 *     REFUSES (exit 2) and names the path. NO LOCAL TOLERANCE IS REINTRODUCED
 *     HERE, and none should be: the carve-out was bookkeeping over the walk's
 *     own enumeration, which is the engine's half of the split.
 *
 *     WHAT THE REFUSAL COSTS, so the proposal that answers it is grounded: a
 *     flaky sweep when a build writes and removes a transient under a scan root
 *     while the gate runs. The exposure is bounded HERE by measurement rather
 *     than hope: the walk roots are `test/fixtures`, `test` and `src`, and the
 *     known racing transient in this repo (`tsup.config.bundled_<hash>.mjs`,
 *     written and removed by a build that `test/docs-content.test.ts` starts) is
 *     written at the REPO ROOT, which is under no scan root. What is genuinely
 *     newly exposed is an editor / atomic-save transient landing beside a test
 *     or a source file. Widening a scan root, or adding a tool that drops a
 *     transient under one, widens this: `.gitignore` it, or the sweep refuses.
 *
 *     AND THE CARVE-OUT WAS NOT FREE EITHER, WHICH IS WHY REFUSE-BY-DEFAULT IS
 *     THE RIGHT DEFAULT: its re-check was keyed on the PATH the walk enumerated
 *     rather than on content, so content that survived at a path the walk never
 *     enumerated (a rename, a hard link then an unlink) went unscanned under a
 *     clean report.
 *
 *   - THE PER-ROOT OBSERVATION RULE IS GONE, AND IT HAS NO ENGINE EQUIVALENT
 *     EITHER. The superseded scanner refused (exit 2) unless EVERY member of
 *     `SCAN_ROOTS` yielded at least one file the WALK actually read, naming the
 *     starved roots; it was deliberately not satisfied by the index route. The
 *     engine skips a missing root and says so in `walkRoots`.
 *
 *     WHAT STILL COVERS THE PHI QUESTION, and it is not the same question: `all`
 *     mode reads the bytes git carries at every in-scope tracked path as a UNION
 *     with the walk, so a root that is absent, dangling or emptied on disk has
 *     its TRACKED corpus read out of the object store regardless, and a violator
 *     among those bytes still exits 1. WHAT IS NO LONGER SAID is the other
 *     thing: the sweep no longer refuses to give a verdict when a declared root
 *     yielded nothing on disk, so a working tree that is not what its author
 *     thinks it is now reports clean instead of refusing. It is NOT rebuilt
 *     here: that is per-root accounting over the engine's own walk, so if it is
 *     wanted back it belongs in `cosyte/config`.
 *
 *   - THE CROSS-CUTTING DASHED-SSN FLOOR NOW CONSULTS THE ALLOW-LIST, WHICH IT
 *     DID NOT HERE. The superseded `scanCommonShapes` pushed a dashed-SSN hit
 *     unconditionally, so no declaration could clear one and the value itself
 *     had to change. The engine's floor checks the matched value against the
 *     `ID` tag in both its dashed and its digits-only spelling. That is a
 *     WIDENING of what can be declared synthetic. Do not carry the superseded
 *     sentence ("a dashed SSN has NO allow-list tag") forward; it is now false.
 *     `checkPhoneField` below is still handed no allow-list at all, so the
 *     sentence remains true of a non-555 phone.
 *
 *   - REPORTING IS THE ENGINE'S. The qualified clean line ("N untracked file(s)
 *     skipped"), the `(git index; the working tree differs)` origin label and
 *     this repo's own hit footer are gone. The engine prints one unqualified
 *     `OK: no hits`, labels a union hit `(as git carries it)`, and prints its
 *     own footer, which is scoped to what the engine knows rather than to what
 *     the detectors below do.
 * ===========================================================================
 *
 * HL7 v2 carries PHI by design (patient names, dates of birth, SSNs, MRNs /
 * account numbers, addresses, phones / emails, and free-text observations).
 * Unlike a JSON fixture, an HL7 v2 message is byte-strict at the front: the
 * `MSH` (or batch `FHS` / `BHS`) segment must be the first thing in the file, so
 * an inline `# synthetic: true` header is impossible (it would break every
 * parser test). This is the same constraint DICOM hits with binary `.dcm` files
 * and X12 hits with `.edi`, and it is solved the same proven way: a synthetic
 * allow-list (`scripts/phi-allow-list.txt`) is the positive declaration that a
 * fixture's identifiers are fake. Any realistic-PHI-shaped token not covered by
 * the allow-list is a hit. Adding a new synthetic fixture therefore means either
 * reusing known-synthetic tokens or consciously extending the allow-list: a
 * reviewed act, never silent.
 *
 * Detection is HL7-shape-aware, NOT a blind text regex: the detectors parse each
 * message's delimiters (from `MSH-1` / `MSH-2`), split segments into fields,
 * repetitions and components, and inspect only the fields that actually carry
 * each PHI category. That is deliberate: a naive `Family^Given` text scan trips
 * on coded values like `CBC^Complete Blood Count^LN` or `Boston^MA`, giving
 * false confidence. See `phi-scan-overrides.md` for the category-to-field map
 * and the documented limitations.
 *
 * THERE ARE THREE TIERS, AND THE SCOPE A FILE IS IN DECIDES ONLY WHETHER IT IS
 * READ, NEVER HOW WELL. Getting that backwards is the trap this scanner has been
 * bitten by twice, so it is written at the top:
 *   1. the whole-file HL7 parse, for a file that IS a message (`test/fixtures`
 *      and `.hl7`, plus the fixture root's own path);
 *   2. the EMBEDDED-LITERAL pass (`scanEmbeddedHl7`), which pulls `PID|…` runs
 *      out of hand-written source and gives them the same field map. An inline
 *      fixture is a TypeScript string literal, so tier 1 never sees it;
 *   3. the conservative shape floor: a dashed SSN and a non-test email domain,
 *      over every target, always. THAT TIER IS THE ENGINE'S, not this file's.
 * Tier 3 alone is what a scope widening buys. Bringing a directory into scope
 * without bringing the recogniser with it means the gate reads more files for
 * two shapes and calls it coverage.
 *
 * ===========================================================================
 * EXIT CONTRACT, DEFINED HERE AND NOT INHERITED:
 *
 *   0  the scan ran, READ EVERY TARGET IT ENUMERATED, and found nothing.
 *   1  HITS. Reserved for "this corpus contains something that looks like PHI".
 *      It is NOT exclusive: an allow-list, or an override log, that EXISTS but
 *      cannot be READ throws a plain `Error` and takes node's own exit 1, which
 *      a caller reads as "hits found". The engine names that escape rather than
 *      claiming to have closed it.
 *   2  EVERY STATE THE ENGINE RAISES IN WHICH THE SCAN CANNOT ACCOUNT FOR
 *      SOMETHING. The full list is in the engine's `run()` docblock.
 *
 * 1 IS RESERVED BECAUSE CI AND THE PRE-COMMIT HOOK BRANCH ON THE CODE. A caller
 * must be able to tell "PHI was found here" from "this scan is not trustworthy".
 *
 * DO NOT PORT THESE NUMBERS INTO, OR OUT OF, A SIBLING PARSER. The `@cosyte/*`
 * scanners do not agree on them and are not required to: a walk root that is a
 * regular file exits 2 here and 1 in at least one sibling. That is why the
 * engine has no default for them.
 * ===========================================================================
 */

import { exemptsMarkdown, runPhiScan, type DetectContext } from "@cosyte/script-utils/phi-scan";

// ===========================================================================
// ██  THE FIVE PER-REPO AXES  ███████████████████████████████████████████████
// ===========================================================================
//
// A PORT IS NOT A COPY. Five things genuinely differ between the sibling
// `@cosyte/*` scanners, and every one of them is a PARAMETER of the shared
// engine rather than a fork of it:
//
//   1. EXIT CODES        `EXIT_CODES`. No default exists, deliberately.
//   2. ROOTS+EXCLUSIONS  `SCAN_ROOTS`, plus the READ filter. This repo declares
//                        no excluded path and does not override the read
//                        filter; both are defaulted by the engine.
//   3. `--staged` SCOPE  `isStagedReadable`.
//   4. GITLINKS          `regularBlobModes`, defaulted by the engine to git's
//                        two regular-blob modes. Nothing to set here.
//   5. EOL NORMALIZATION No parameter: the engine's walk/index deduplication is
//                        BY CONTENT, so a repo whose index carries LF and whose
//                        working tree carries CRLF scans BOTH forms. Checked
//                        here rather than skipped: this repo ships no
//                        `.gitattributes` and CI is Linux, so the two copies of
//                        a path are byte-identical on a clean checkout and the
//                        union adds no reads.
// ===========================================================================

/** AXIS 1: this repo's exit contract, stated in the header block above. */
const EXIT_CODES = { clean: 0, hits: 1, refuse: 2 } as const;

/**
 * AXIS 2: the roots `all` mode walks, repo-relative and forward-slashed.
 *
 * NONE IS `./`-PREFIXED, AND THAT IS CHECKED RATHER THAN ASSUMED. The engine
 * normalises a root the way it normalises every other path, so `./src` and `src`
 * are one root; before it did, `["./src"]` walked correctly while matching no
 * index path, which silently emptied the union and both index refusals.
 * Declaring them bare keeps the two spellings from ever being a question here.
 *
 * `test/fixtures` gets the whole-file HL7 parse; `test` and `src` are
 * hand-written code, not data, so a file under them is never parsed AS a message
 * and gets the shape floor plus the embedded-literal pass instead.
 *
 * `test` IS A ROOT AND IT NESTS `test/fixtures`, DELIBERATELY, AND BOTH ARE
 * LISTED. The walk used to start at `test/fixtures` and `src`, so a TRACKED file
 * directly under `test/` was enumerated by NEITHER route: measured on `d8d3be3`,
 * 115 tracked files (none of them markdown), of which 55 carry an inline `PID|`
 * literal. A PHI-bearing `test/<name>.ts` scanned `OK: no hits` at exit 0 in all
 * mode and at exit 0 on `--staged`, over the same bytes that give six
 * segment-aware hits when they sit at a `.hl7` path. The engine dedupes the
 * nested walk, so a fixture is one target and not two.
 *
 * 🛑 NARROWING THIS IS A SCOPE DECISION AND IT IS THE AXIS MOST LIKELY TO BE
 * WRONG. If you narrow it, measure what the narrowing STOPS reading rather than
 * assuming it stops reading nothing. Adding a root reaches `isStagedReadable`
 * below and `looksLikeHl7`'s own fixture literal too, neither automatically.
 */
const SCAN_ROOTS: readonly string[] = ["test/fixtures", "test", "src"];

/**
 * AXIS 3: the READ half of scope for `--staged`, i.e. which regular blobs a
 * COMMIT is blocked on. This repo's pre-commit hook is `pnpm phi-scan --staged`.
 *
 * IT ADMITS NOTHING OUTSIDE `SCAN_ROOTS`, AND THE ENGINE ENFORCES THAT RATHER
 * THAN ASSUMING IT: a staged path this predicate admits and no scan root covers
 * is REFUSED, naming the path. The containment is checked here as well because
 * it is cheap to read: every clause below is either a scan root's own name or a
 * path under one. It is NOT narrowed silently to the intersection, which would
 * hide a misconfiguration in the one place the gate blocks a commit. The state
 * that makes this matter is measured: a staged mode-120000 entry outside every
 * scan root was enumerated, read, had the LINK'S TARGET PATH handed to the
 * detector as content, and reported `OK: no hits` at exit 0.
 *
 * 🛑 THIS IS STILL NOT THE ROOT HALF OF SCOPE. The engine's non-regular and
 * non-blob refusals key on the ROOT half, never on this read filter: a
 * `.md`-named symbolic link must be refused on both routes even though no route
 * would read a `.md` FILE. A link's name is no evidence about what is on the
 * other side of it. Two sibling ports collapsed the two predicates and both had
 * the routes disagree about the same entry.
 *
 * A SCAN ROOT'S OWN PATH IS IN SCOPE AS WELL AS ITS CONTENTS. An index entry at
 * exactly `test/fixtures`, `test` or `src` is never a directory, so it is a root
 * REPLACED by a blob, a link or a gitlink. The prefix test alone let that
 * through: measured, exit 0 over a staged mode-120000 `test/fixtures`, and again
 * over `src`. The `.ts` suffix rule is deliberately NOT applied to `src`'s own
 * name, for the same reason the markdown exemption is not applied to a link.
 *
 * `test/fixtures/**` KEEPS ITS OWN UNCONDITIONAL CLAUSE, so the markdown the
 * walk skips under the fixture root is still enumerated here. The markdown
 * exclusion on the wider `test/**` clause is copied from the shared read filter
 * rather than invented, so the two routes agree about that root.
 */
function isStagedReadable(relPath: string): boolean {
  return (
    relPath === "test/fixtures" ||
    relPath === "test" ||
    relPath === "src" ||
    relPath.startsWith("test/fixtures/") ||
    (relPath.startsWith("test/") && exemptsMarkdown(relPath)) ||
    (relPath.startsWith("src/") && relPath.endsWith(".ts"))
  );
}

// ===========================================================================
// ██  THE HL7 FIELD MAP  ████████████████████████████████████████████████████
// ===========================================================================

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
// The address allow-list: the one category the engine does not model
// ---------------------------------------------------------------------------

/** How a detector raises a hit. The engine fills in the locus. */
type Raise = DetectContext["hit"];

/** The declarations the HL7 detectors consult: the engine's, plus `ADDR`. */
interface Hl7Allow {
  names: ReadonlySet<string>;
  dobs: ReadonlySet<string>;
  ids: ReadonlySet<string>;
  addresses: ReadonlySet<string>;
}

/**
 * 🛑 THE `ADDR` DECLARATION HAS NO ENGINE EQUIVALENT, AND NOTHING LOCAL STANDS
 * IN FOR IT. The engine's `AllowList` models `NAME`, `DOB`, `ID` and
 * `EMAILDOMAIN` and drops every other tag, while its own docblock names ADDRESS
 * as one of the five categories a caller's detectors own. So the address
 * detector below is handed an EMPTY set until the engine parses the tag.
 * See the header block: this is an engine gap, not a local design decision, and
 * a repo-local re-implementation of the parse is exactly what adopting the
 * engine exists to delete.
 */
const NO_ADDRESS_DECLARATIONS: ReadonlySet<string> = new Set<string>();

// ---------------------------------------------------------------------------
// HL7 v2 structural helpers
// ---------------------------------------------------------------------------

interface Delimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
}

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
 * A trailing parenthesised group, which is how the engine decorates a REPORTED
 * LOCUS with a target's origin.
 *
 * WHY THIS EXISTS: `DetectContext` hands a detector the LOCUS and never the
 * undecorated path, deliberately, so a hit cannot name a path whose working-tree
 * copy is clean. The tier decision in `looksLikeHl7` is about the PATH, and the
 * engine's union route labels a tracked path `<path> (as git carries it)`, which
 * ends in neither `.hl7` nor a fixture prefix. Left unstripped, every `.hl7`
 * fixture read out of the object store would silently drop from the whole-file
 * parse to the shape floor.
 *
 * THE RESIDUAL, STATED RATHER THAN IMPLIED: this strips ANY trailing
 * parenthesised group, not one label, so a repo-relative path that itself ends
 * in one is treated as though the group were an origin. That direction is safe
 * rather than merely tolerable, and the reason is structural: a path ending in
 * `)` cannot also end in `.hl7`, so stripping can only ever ADD fixture-likeness
 * (tier 1 instead of tier 3) and never remove it.
 */
const LOCUS_ORIGIN_RE = / \([^()]*\)$/;

/**
 * A file gets the full structured HL7 scan only when it is fixture-like (under
 * `test/fixtures/` or a `.hl7` file) AND contains at least one recognizable
 * segment line. The fixture gate is load-bearing in BOTH directions:
 *   - it lets a header-less message (the repo ships `malformed/no-msh-segment`)
 *     still get the full structured scan rather than the text-only pass; and
 *   - it keeps hand-written `src/` and `test/` code off the whole-file parse even
 *     when a file embeds an `MSH|…` example string in a comment or test literal:
 *     parsing a `.ts` file as HL7 segments produces only noise.
 * WHAT SUCH A FILE GETS INSTEAD IS NOT "the conservative pass". It is the shape
 * floor (the engine's) PLUS `scanEmbeddedHl7`, which reads an inline `PID|…`
 * literal with the same field map. This gate decides HOW a file is read, never
 * WHETHER a category is looked for.
 *
 * `test/fixtures` (the root's OWN path) is fixture-like because an index entry
 * at exactly that path is never a directory: it is the fixture root REPLACED by
 * a regular blob, which `isStagedReadable` admits and the mode check passes
 * through as a readable file. Measured twice on `d8d3be3`: the same payload gave
 * six segment-aware hits staged at `test/fixtures/<name>.hl7` and exit 0 staged
 * at `test/fixtures`. `test` and `src` are deliberately NOT here: neither root
 * is an HL7 corpus, so an entry replacing one is judged the way everything else
 * under it is.
 */
function looksLikeHl7(text: string, locus: string): boolean {
  const path = locus.replace(LOCUS_ORIGIN_RE, "");
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
  return !NAME_NOISE_TOKENS.has(tok.toUpperCase());
}

// ---------------------------------------------------------------------------
// Category detectors (segment + field-position aware)
// ---------------------------------------------------------------------------

function checkNameField(
  hit: Raise,
  segId: string,
  fieldNo: number,
  value: string,
  familyIdx: number,
  d: Delimiters,
  allow: Hl7Allow,
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
          hit({
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
  hit: Raise,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  allow: Hl7Allow,
): void {
  for (const rep of value.split(d.repetition)) {
    const dob = normalizeDob(rep.split(d.component)[0] ?? rep);
    if (dob === null) continue;
    if (!allow.dobs.has(dob)) {
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: dob,
        reason: "date of birth not in synthetic allow-list",
      });
    }
  }
}

function checkAddressField(
  hit: Raise,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  allow: Hl7Allow,
): void {
  for (const rep of value.split(d.repetition)) {
    const street = (rep.split(d.component)[0] ?? "").trim();
    // A street line: house number + at least one word (`123 Main St`).
    if (!/^\d+\s+\p{L}/u.test(street)) continue;
    if (!allow.addresses.has(street.toLowerCase())) {
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: street,
        reason: "street address not in synthetic allow-list",
      });
    }
  }
}

/**
 * 🛑 THIS DETECTOR CONSULTS NO DECLARATION, AND THAT IS WHY IT TAKES NO `allow`.
 * The allow-list has no phone tag, so a hit raised here cannot be declared away:
 * the value itself has to change (the `555-01xx` fake-exchange convention). The
 * engine's hit footer says as much in general terms; it is written here too
 * because a reader of THIS function is the one who needs it.
 */
function checkPhoneField(
  hit: Raise,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
): void {
  for (const rep of value.split(d.repetition)) {
    const digits = rep.replace(/\D/g, "");
    // A real dialable number is >= 10 digits. The `555` fake-exchange
    // convention (555-01xx is reserved for fiction) marks a synthetic number.
    if (digits.length >= 10 && !digits.includes("555")) {
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: rep,
        reason: "phone number without the 555 fake-exchange convention",
      });
    }
  }
}

function checkCxField(
  hit: Raise,
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  allow: Hl7Allow,
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
        hit({
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
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: id,
        reason: "bare-numeric MRN / account identifier not in synthetic allow-list",
      });
    }
  }
}

function checkSsnStField(
  hit: Raise,
  segId: string,
  fieldNo: number,
  value: string,
  allow: Hl7Allow,
): void {
  const digits = value.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits) && !allow.ids.has(digits.toUpperCase())) {
    hit({
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
  hit: Raise,
  segId: string,
  elems: string[],
  d: Delimiters,
  allow: Hl7Allow,
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
            hit({
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

/**
 * Run every category detector this scanner models over ONE segment's fields.
 * Factored out so the embedded-literal pass below runs the SAME detectors rather
 * than a second, drifting copy of the field map: a category added to one of the
 * maps above must reach both callers or the inline half quietly stops covering
 * it.
 */
function checkKnownSegmentFields(
  hit: Raise,
  segId: string,
  elems: string[],
  d: Delimiters,
  allow: Hl7Allow,
): void {
  for (const f of XPN_NAME_FIELDS[segId] ?? []) {
    checkNameField(hit, segId, f, fieldAt(elems, f), 0, d, allow);
  }
  for (const f of XCN_NAME_FIELDS[segId] ?? []) {
    checkNameField(hit, segId, f, fieldAt(elems, f), 1, d, allow);
  }
  for (const f of DOB_FIELDS[segId] ?? []) {
    checkDobField(hit, segId, f, fieldAt(elems, f), d, allow);
  }
  for (const f of ADDRESS_FIELDS[segId] ?? []) {
    checkAddressField(hit, segId, f, fieldAt(elems, f), d, allow);
  }
  for (const f of PHONE_FIELDS[segId] ?? []) {
    checkPhoneField(hit, segId, f, fieldAt(elems, f), d);
  }
  for (const f of CX_ID_FIELDS[segId] ?? []) {
    checkCxField(hit, segId, f, fieldAt(elems, f), d, allow);
  }
  for (const f of SSN_ST_FIELDS[segId] ?? []) {
    checkSsnStField(hit, segId, f, fieldAt(elems, f), allow);
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
 * shape floor over 115 more files and nothing else: a dashed SSN and a non-test
 * email domain, with no name, DOB, MRN, address or phone detection at all. 55 of
 * those 115 files carry an inline `PID|` literal (measured on `d8d3be3`).
 * Widening the SCOPE and widening the RECOGNISER are two changes and this is the
 * second one; neither substitutes for the other.
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
 *   - IT IS ADDITIVE TO THE ENGINE'S SHAPE FLOOR, NEVER INSTEAD OF IT. The floor
 *     runs on every target the engine reads, before `detect` is called at all.
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
 *     not evaluate anything. The floor still reads the whole file, so a dashed
 *     SSN or a non-test email in such a constant is caught either way. Erasing
 *     rather than skipping the run keeps the FIELD POSITIONS intact, so a real
 *     literal elsewhere in the same segment is still read at its own field
 *     number.
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

function scanEmbeddedHl7(hit: Raise, text: string, allow: Hl7Allow): void {
  const d: Delimiters = { field: "|", component: "^", repetition: "~", escape: "\\" };
  for (const run of extractEmbeddedSegments(text)) {
    const elems = run.split(d.field);
    const segId = (elems[0] ?? "").toUpperCase();
    if (!PHI_FIELD_SEGMENTS.has(segId)) continue;
    checkKnownSegmentFields(hit, segId, elems, d, allow);
  }
}

function scanHl7Message(hit: Raise, text: string, allow: Hl7Allow): void {
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
      checkUnknownSegment(hit, segId, elems, d, allow);
      continue;
    }

    checkKnownSegmentFields(hit, segId, elems, d, allow);
  }
}

/**
 * THE HL7-SPECIFIC FIELD DETECTION: the half the shared engine deliberately does
 * not own, because it differs per healthcare standard.
 *
 * The engine has already run the cross-cutting floor (SSN + email shapes) over
 * `ctx.text` and reported any hits against the correct locus. Everything here is
 * this repo's.
 *
 * Hits are raised through `ctx.hit`, never by building a path: the sweep reads
 * the bytes git carries as a union with the working-tree walk, so a path a
 * detector invented could name a file a developer opens and finds clean.
 *
 * @param ctx The target's text and bytes, the parsed allow-list, and `hit`.
 */
function detect(ctx: DetectContext): void {
  const allow: Hl7Allow = {
    names: ctx.allow.names,
    dobs: ctx.allow.dobs,
    ids: ctx.allow.ids,
    addresses: NO_ADDRESS_DECLARATIONS,
  };
  if (looksLikeHl7(ctx.text, ctx.path)) {
    scanHl7Message(ctx.hit, ctx.text, allow);
    return;
  }
  // A non-HL7 target (hand-written src, a test module, plain-text notes) gets
  // the embedded pass, which reads an inline `PID|…` literal with the same field
  // map a real fixture gets. The engine's shape floor has already run over it.
  scanEmbeddedHl7(ctx.hit, ctx.text, allow);
}

process.exit(
  runPhiScan({
    exitCodes: EXIT_CODES,
    scanRoots: SCAN_ROOTS,
    isStagedReadable,
    detect,
    // `excludedPaths` is deliberately NOT set: this repo declares no path that
    // no route reads. Its own scanner test carries violator-SHAPED values, and
    // it stays in the corpus because it builds every one of them from parts, so
    // no literal violator-shaped string lives in that source. Keep that
    // discipline rather than adding an exclusion: an excluded path is a file the
    // scan has no verdict about.
    //
    // `isWalkReadable` is deliberately NOT set: the engine's default is the
    // shared Markdown exemption, which is exactly what this repo's walk applied
    // by hand, so if that boundary ever moves it moves for every repo at once
    // through a version bump.
    //
    // `regularBlobModes` is deliberately NOT set: the engine's default is git's
    // two regular-blob modes, which is what this repo declared by hand.
  }),
);
