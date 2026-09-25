#!/usr/bin/env tsx
/**
 * `@cosyte/hl7` PHI scanner: the CI / pre-commit half of the PHI commit-gate.
 *
 * THE MACHINERY IS NOT IN THIS FILE ANY MORE. Argument parsing and the three
 * modes, the allow-list and override-log readers, target enumeration, the union
 * of the working-tree walk with the bytes git carries at every index path, the
 * completeness rule, every refusal and the cross-cutting SSN / email floor all
 * live in `@cosyte/script-utils/phi-scan` and reach this repo through a version
 * bump. What is here is what is genuinely hl7's: the five per-repo axes below
 * and the HL7 v2 field detector.
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
 * reviewed act, never silent. The allow-list is a LOCAL rule and stays here; the
 * engine reads the same file and hands the parsed declarations to `detect`.
 *
 * Detection is HL7-shape-aware, NOT a blind text regex: the detector parses each
 * message's delimiters (from `MSH-1` / `MSH-2`), splits segments -> fields ->
 * repetitions -> components, and inspects only the fields that actually carry
 * each PHI category. That is deliberate: a naive `Family^Given` text scan trips
 * on coded values like `CBC^Complete Blood Count^LN` or `Boston^MA`, giving
 * false confidence. See `phi-scan-overrides.md` for the category -> field map and
 * the documented limitations.
 *
 * THERE ARE THREE TIERS, AND THE SCOPE A FILE IS IN DECIDES ONLY WHETHER IT IS
 * READ, NEVER HOW WELL. Getting that backwards is the trap this scanner has now
 * been bitten by twice, so it is written at the top:
 *   1. the whole-file HL7 parse, for a file that IS a message (`test/fixtures`
 *      and `.hl7`, plus the fixture root's own path);
 *   2. the EMBEDDED-LITERAL pass (`scanEmbeddedHl7`), which pulls `PID|...` runs
 *      out of hand-written source and gives them the same field map. An inline
 *      fixture is a TypeScript string literal, so tier 1 never sees it;
 *   3. the conservative shape floor: a dashed SSN and a non-test email domain,
 *      over every file, always. TIER 3 IS THE ENGINE'S, not this file's, and it
 *      is not subtractable by anything here.
 * Tiers 1 and 2 are the whole of what a scope widening buys beyond tier 3.
 * Bringing a directory into scope without bringing the recogniser with it means
 * the gate reads 115 more files for two shapes and calls it coverage.
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error or refusal). THESE
 * ARE THIS REPO'S OWN AND THEY DIFFER ACROSS THE SIBLINGS, which is why the
 * engine's `exitCodes` axis has no default: at least one sibling uses 1 where
 * this repo uses 2, so derive them from this file rather than porting a number
 * in. Neither side may give a code a second meaning or add one.
 *
 * ---------------------------------------------------------------------------
 * WHAT STAYS HL7'S, AND WHAT MOVED. The list is here because a reader looking
 * for a refusal message will not find it in this file any more:
 *
 *   - HERE: the three tiers above, the category-to-field map, case-insensitive
 *     segment ids, the header-less-fixture rule, the rule that `src/` is never
 *     parsed as HL7, the four documented limits of the embedded pass, and the
 *     five axes at the bottom of this file.
 *   - THE ENGINE'S: an in-scope entry that is not a regular file refusing on
 *     BOTH enumerating routes (never echoing the link target); the per-root
 *     observation rule; the enumeration TOCTOU window; the completeness rule;
 *     the `--allow-fixture` admission gate and the two tiers that keep a bypass
 *     from ever reaching exit 0; the index union and its content deduplication;
 *     and the rule that every subprocess is `git`, array-form, never shell.
 *
 * `phi-scan-overrides.md` documents both halves and says which is which.
 * ---------------------------------------------------------------------------
 * THE FOUR DOCUMENTED LIMITS OF THE EMBEDDED-LITERAL PASS are on
 * `extractEmbeddedSegments` below, each with the measurement that produced it.
 * They are hl7's, they are unchanged by the consolidation, and they are not
 * answerable by a wider scope: this pass reads LITERALS IN FIELD POSITION and
 * evaluates nothing.
 * ---------------------------------------------------------------------------
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type DetectContext, runPhiScan } from "@cosyte/script-utils/phi-scan";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");

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
// `test` IS A ROOT AND IT NESTS `test/fixtures`, DELIBERATELY, AND BOTH ARE
// LISTED. The walk used to start at `test/fixtures` and `src`, so a TRACKED file
// directly under `test/` was enumerated by NEITHER route: measured on `d8d3be3`,
// **115 tracked files** (none of them markdown), of which **55 carry an inline
// `PID|` literal**. A PHI-bearing `test/<name>.ts` scanned `OK: no hits` at exit
// 0 in all mode and at exit 0 on `--staged`, over the same bytes that give six
// segment-aware hits when they sit at a `.hl7` path.
//
// Collapsing the two into a single `test` root would have been simpler and is
// WRONG: it would let one `test/*.test.ts` vouch for an absent fixture corpus,
// which is exactly the per-root defect this gate already closed. Both roots are
// declared, so `test/fixtures` still has to yield a file of its own. THE ENGINE
// OWNS THE PER-ROOT RULE NOW, and it reads this list.
//
// TWO READERS, NOT THREE, AND ADDING A ROOT HERE DOES NOT REACH EITHER OF THE
// OTHER TWO. `isStagedReadable` below has its own scope predicate and
// `looksLikeHl7` has its own `test/fixtures/` literal, both deliberately. So a
// root added to this list is walked and is required to yield; adding a root
// means visiting all three, not just this one.
const SCAN_ROOTS: readonly string[] = ["test/fixtures", "test", "src"];

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

// Standard HL7 v2 segment ids. A segment id NOT in this set (a `Z...` site-defined
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

interface Delimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
}

/** A finding, before the engine stamps the locus onto it. */
type Raise = (h: { segment: string; value: string; reason: string }) => void;

// ---------------------------------------------------------------------------
// The ADDR half of the allow-list
// ---------------------------------------------------------------------------

/**
 * Synthetic street-address lines (XAD component 1), lower-cased.
 *
 * THE ENGINE PARSES FOUR OF THIS REPO'S FIVE TAGS AND NOT THIS ONE. Its
 * `AllowList` carries `names`, `dobs`, `ids` and `emailDomains`, because those
 * four are what the cross-cutting floor and the shared detectors consult. `ADDR`
 * is read by `checkAddressField` and by nothing else, so it is parsed HERE, off
 * the same file, rather than pushed into the shared type: an address is a rule
 * about a field only this repo's detector inspects.
 *
 * It is a SECOND READ of one file, which is the cost, and it is bounded to the
 * one run. The engine has already refused a missing allow-list before any
 * detector is called, so this reader is never the thing that reports its
 * absence; it returns an empty set rather than inventing a second refusal with a
 * different message for the same state.
 */
function loadAllowedAddresses(): Set<string> {
  const out = new Set<string>();
  if (!existsSync(ALLOW_LIST_PATH)) return out;
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    if (line.slice(0, sp) !== "ADDR") continue;
    const value = line.slice(sp + 1).trim();
    if (value.length > 0) out.add(value.toLowerCase());
  }
  return out;
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
 * The target's own repo-relative path, with the engine's origin label removed.
 *
 * THE DETECTOR IS HANDED THE REPORTED LOCUS, NOT THE PATH, and the two differ on
 * the union half: a target read out of the index arrives as
 * `test/fixtures/x.hl7 (<label>)`. Every scope rule below keys on the PATH (the
 * `.hl7` suffix, the fixture-root prefix), so reading the locus directly would
 * silently drop every index-read fixture off the whole-file HL7 parse and leave
 * it on the floor plus the embedded pass. Measured before it was written: with
 * the locus read verbatim, a PID-5 violator staged and then replaced on disk
 * reports the dashed-SSN floor only.
 *
 * The label is the engine's, from a closed set, and it is always a trailing
 * parenthesised group, so the strip is anchored to the end and is applied ONCE.
 * A repo path that genuinely ends in ` (...)` would be mis-scoped by it; that is
 * the residual, it is narrower than the defect above, and the honest fix is for
 * the engine to hand the detector the bare path beside the locus.
 */
function targetPath(locus: string): string {
  return locus.replace(/ \([^()]*\)$/, "");
}

/**
 * A file gets the full structured HL7 scan only when it is fixture-like (under
 * `test/fixtures/` or a `.hl7` file) AND contains at least one recognizable
 * segment line. The fixture gate is load-bearing in BOTH directions:
 *   - it lets a header-less message (the repo ships `malformed/no-msh-segment`)
 *     still get the full structured scan rather than the text-only pass; and
 *   - it keeps hand-written `src/` and `test/` code off the whole-file parse even
 *     when a file embeds an `MSH|...` example string in a comment or test literal:
 *     parsing a `.ts` file as HL7 segments produces only noise.
 * WHAT SUCH A FILE GETS INSTEAD IS NOT "the conservative pass". It is the
 * engine's shape floor PLUS `scanEmbeddedHl7`, which reads an inline `PID|...`
 * literal with the same field map. This gate decides HOW a file is read, never
 * WHETHER a category is looked for.
 */
function looksLikeHl7(text: string, path: string): boolean {
  // `path === "test/fixtures"` IS THE FIXTURE ROOT'S OWN PATH, and it is here
  // because `--staged` IS THE PRE-COMMIT HOOK. An index entry at exactly
  // `test/fixtures` is never a directory, so it is the fixture root REPLACED by
  // a regular blob; the staged route already enumerates it and the mode check
  // already passes it through as a readable file. It was then the DETECTOR gate
  // that dropped it: the prefix wants a trailing slash and the root's own path
  // has neither that nor an `.hl7` suffix, so the bytes fell to the conservative
  // shape pass. Measured twice on `d8d3be3`: the same payload gives six
  // segment-aware hits staged at `test/fixtures/<name>.hl7` and exit 0 staged at
  // `test/fixtures`, over a live `PID-3`/`PID-5`/`PID-7`/`PID-11`/`PID-13`. A
  // dashed SSN in the same blob still exited 1, so the floor held and only the
  // segment-aware tier was missing: NOT both-routes-blind, and not a silent pass
  // either, which is why it is one clause and not a new rule.
  //
  // `test` and `src`, the other two roots' own paths, are deliberately NOT here.
  // Neither root is an HL7 corpus, so an entry replacing one is judged the way
  // everything else under it is judged: the floor plus the embedded-segment pass
  // in `scanEmbeddedHl7`, which reads an inline `PID|...` wherever it sits.
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
  // Drop HL7 escape sequences (\F\ \S\ \T\ \R\ \E\ \Xhh\ \Zxx\ ...): they are
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
  segId: string,
  fieldNo: number,
  value: string,
  familyIdx: number,
  d: Delimiters,
  names: ReadonlySet<string>,
  hit: Raise,
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
        if (!names.has(tok.toUpperCase())) {
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
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  dobs: ReadonlySet<string>,
  hit: Raise,
): void {
  for (const rep of value.split(d.repetition)) {
    const dob = normalizeDob(rep.split(d.component)[0] ?? rep);
    if (dob === null) continue;
    if (!dobs.has(dob)) {
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: dob,
        reason: "date of birth not in synthetic allow-list",
      });
    }
  }
}

function checkAddressField(
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  addresses: ReadonlySet<string>,
  hit: Raise,
): void {
  for (const rep of value.split(d.repetition)) {
    const street = (rep.split(d.component)[0] ?? "").trim();
    // A street line: house number + at least one word (`123 Main St`).
    if (!/^\d+\s+\p{L}/u.test(street)) continue;
    if (!addresses.has(street.toLowerCase())) {
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: street,
        reason: "street address not in synthetic allow-list",
      });
    }
  }
}

function checkPhoneField(
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  hit: Raise,
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
  segId: string,
  fieldNo: number,
  value: string,
  d: Delimiters,
  ids: ReadonlySet<string>,
  hit: Raise,
): void {
  for (const rep of value.split(d.repetition)) {
    const comps = rep.split(d.component);
    const id = (comps[0] ?? "").trim();
    const typeCode = (comps[4] ?? "").trim().toUpperCase();
    if (id.length === 0) continue;
    const idUpper = id.toUpperCase();
    const isSsnType = typeCode === "SS" || typeCode === "SSN";
    if (isSsnType) {
      if (/^\d{9}$/.test(id) && !ids.has(idUpper)) {
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
    // shapes (MRN..., ACCT..., FAKE...), so a bare numeric id is suspect.
    if (/^\d{6,9}$/.test(id) && !ids.has(idUpper)) {
      hit({
        segment: `${segId}-${String(fieldNo)}`,
        value: id,
        reason: "bare-numeric MRN / account identifier not in synthetic allow-list",
      });
    }
  }
}

function checkSsnStField(
  segId: string,
  fieldNo: number,
  value: string,
  ids: ReadonlySet<string>,
  hit: Raise,
): void {
  const digits = value.replace(/\D/g, "");
  if (/^\d{9}$/.test(digits) && !ids.has(digits.toUpperCase())) {
    hit({
      segment: `${segId}-${String(fieldNo)}`,
      value,
      reason: "SSN (9-digit) not in synthetic allow-list",
    });
  }
}

/**
 * Unknown / `Z...` site-defined segments have no known field schema, so a name
 * could hide in any field. Backstop: within each field, flag an adjacent pair of
 * single-token name-shaped components (`Johnson^Maya`) whose tokens are not
 * allow-listed. Only runs on unknown segments: known code-bearing segments
 * (`OBX`, `OBR`, ...) carry `CODE^Description^System` triples that this would
 * misread as names.
 */
function checkUnknownSegment(
  segId: string,
  elems: string[],
  d: Delimiters,
  names: ReadonlySet<string>,
  hit: Raise,
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
          if (!names.has(tok.toUpperCase())) {
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

// ---------------------------------------------------------------------------
// Known-segment field detectors, shared by the whole-file and embedded scans
// ---------------------------------------------------------------------------

/** The allow-list declarations this repo's own detectors consult. */
interface Declared {
  names: ReadonlySet<string>;
  dobs: ReadonlySet<string>;
  ids: ReadonlySet<string>;
  addresses: ReadonlySet<string>;
}

/**
 * Run every category detector this scanner models over ONE segment's fields.
 * Factored out of `scanHl7` so the embedded-literal pass below runs the SAME
 * detectors rather than a second, drifting copy of the field map: a category
 * added to one of the maps above must reach both callers or the inline half
 * quietly stops covering it.
 */
function checkKnownSegmentFields(
  segId: string,
  elems: string[],
  d: Delimiters,
  declared: Declared,
  hit: Raise,
): void {
  for (const f of XPN_NAME_FIELDS[segId] ?? []) {
    checkNameField(segId, f, fieldAt(elems, f), 0, d, declared.names, hit);
  }
  for (const f of XCN_NAME_FIELDS[segId] ?? []) {
    checkNameField(segId, f, fieldAt(elems, f), 1, d, declared.names, hit);
  }
  for (const f of DOB_FIELDS[segId] ?? []) {
    checkDobField(segId, f, fieldAt(elems, f), d, declared.dobs, hit);
  }
  for (const f of ADDRESS_FIELDS[segId] ?? []) {
    checkAddressField(segId, f, fieldAt(elems, f), d, declared.addresses, hit);
  }
  for (const f of PHONE_FIELDS[segId] ?? []) {
    checkPhoneField(segId, f, fieldAt(elems, f), d, hit);
  }
  for (const f of CX_ID_FIELDS[segId] ?? []) {
    checkCxField(segId, f, fieldAt(elems, f), d, declared.ids, hit);
  }
  for (const f of SSN_ST_FIELDS[segId] ?? []) {
    checkSsnStField(segId, f, fieldAt(elems, f), declared.ids, hit);
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
 * (`` `${MSH}\r` + "PID|1||..." ``) and without that the run would be one line and
 * the field offsets would be nonsense. Each physical line is then searched for a
 * segment id from `PHI_FIELD_SEGMENTS` followed by `|`, and the run is taken to
 * the end of the line or to the first source quote after it, whichever comes
 * first: the tail of `"PID|...|F|||" +` is TypeScript, not HL7, and reading it as
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
 *     an inline `Z...` site-defined segment carrying a name is NOT detected here.
 *   - IT IS ADDITIVE TO THE ENGINE'S SHAPE FLOOR, NEVER INSTEAD OF IT. The floor
 *     runs on every target the engine reads, before `detect` is called, and
 *     nothing in this file can subtract it.
 *   - A TEMPLATE-LITERAL INTERPOLATION IS ERASED, NOT READ, AND THE RESIDUAL IS
 *     BIGGER THAN "a runtime-only value". Reading the IDENTIFIER in
 *     `` `PID|...||${x}` `` as a person-name token invents a finding out of
 *     program text (measured: `content`, `marker`, `familyName` and
 *     `pidSurname` were each reported as a patient name), so it is erased.
 *     BE EXACT ABOUT WHAT THAT COSTS, because the loose form of this sentence
 *     was refuted in review: the bound is ANY value reached through an
 *     interpolation, INCLUDING one whose literal sits in the same file.
 *     Measured: `const fam = "<surname>"` followed by
 *     `` `PID|1||<mrn>^^^HOSP^MR||${fam}^${giv}||<dob>|F` `` exits 1 on the
 *     MRN and the DOB and is SILENT ON THE NAME. It is not "the value is not in
 *     the file"; it is that this pass reads LITERALS IN FIELD POSITION and does
 *     not evaluate anything. The engine's floor still reads the whole file, so a
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
  // `${...}` goes first and collapses to nothing, so an interpolated field stays
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

function scanEmbeddedHl7(text: string, declared: Declared, hit: Raise): void {
  const d: Delimiters = { field: "|", component: "^", repetition: "~", escape: "\\" };
  for (const run of extractEmbeddedSegments(text)) {
    const elems = run.split(d.field);
    const segId = (elems[0] ?? "").toUpperCase();
    if (!PHI_FIELD_SEGMENTS.has(segId)) continue;
    checkKnownSegmentFields(segId, elems, d, declared, hit);
  }
}

// ---------------------------------------------------------------------------
// HL7 message scanner
// ---------------------------------------------------------------------------

function scanHl7(text: string, declared: Declared, hit: Raise): void {
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
      checkUnknownSegment(segId, elems, d, declared.names, hit);
      continue;
    }

    checkKnownSegmentFields(segId, elems, d, declared, hit);
  }
}

// ---------------------------------------------------------------------------
// The five per-repo axes
// ---------------------------------------------------------------------------

/**
 * The READ half of `--staged` scope, which is what a COMMIT is blocked on.
 *
 * IT IS NOT THE WALK'S ROOT PREFIX AND MUST NOT BE UNIFIED WITH IT. This one
 * admits `src/**` only at the `.ts` suffix and admits each root's OWN path as an
 * entry that replaced it. Both are deliberate judgements about what git hands
 * back, they do not describe coverage of a walk, and this route makes no
 * per-root promise at all. Folding the two together would silently change what
 * the pre-commit hook enumerates.
 *
 * A SCAN ROOT'S OWN PATH IS IN SCOPE AS WELL AS ITS CONTENTS, on every root. An
 * index entry at exactly `test/fixtures`, exactly `test` or exactly `src` is
 * never a directory, so it is a scan root REPLACED by a blob, a link or a
 * gitlink. The prefix test alone let that through: measured, exit 0 over a
 * staged mode-120000 `test/fixtures`, and again over `src`. The `.ts` suffix
 * rule is deliberately NOT applied to `src`'s own name: that rule is a judgement
 * about bytes this route could have read, and the name of an entry that replaced
 * a walk root is no evidence at all about what is on the other side of it.
 *
 * `test/**` EXCEPT MARKDOWN is purely additive: `test/fixtures/**` keeps its own
 * unconditional clause, so the markdown the walk skips under the fixture root is
 * still enumerated here exactly as it was (there are seven such files). What it
 * changed is a TRACKED file directly under `test/`: 115 of them, previously
 * enumerated by neither route, measured at exit 0 on `--staged` over a live
 * `PID-3`/`PID-5`/`PID-7`/`PID-11`/`PID-13`.
 */
function isStagedReadable(relPath: string): boolean {
  return (
    relPath === "test/fixtures" ||
    relPath === "test" ||
    relPath === "src" ||
    relPath.startsWith("test/fixtures/") ||
    (relPath.startsWith("test/") && !relPath.toLowerCase().endsWith(".md")) ||
    (relPath.startsWith("src/") && relPath.endsWith(".ts"))
  );
}

/**
 * Read once per process rather than per target: the file does not change inside
 * a run, and `detect` is called once per target (2,000-odd in an `all` sweep).
 *
 * LAZY RATHER THAN A MODULE-SCOPE `const`, AND THAT IS THE EXIT CONTRACT RATHER
 * THAN A STYLE CHOICE. Evaluated at import time, a `readFileSync` that throws
 * (an allow-list that exists but is a directory, or mode 000) escapes before the
 * engine has run at all, so the top-level backstop at the bottom of this file
 * cannot catch it and node exits 1, THE CODE THIS GATE RESERVES FOR HITS FOUND.
 * Measured: with the read at module scope, an allow-list replaced by a directory
 * printed node's own `EISDIR` stack and exited 1.
 */
let allowedAddresses: ReadonlySet<string> | null = null;
function allowedAddressesOnce(): ReadonlySet<string> {
  allowedAddresses ??= loadAllowedAddresses();
  return allowedAddresses;
}

/**
 * The HL7 v2 field detector: the per-standard half of the boundary, and the only
 * detection this repo supplies.
 *
 * It raises against the LOCUS the engine chose (`ctx.path`), never a path of its
 * own, so a hit found in the bytes git carries is never reported against a
 * working-tree file that is clean. It never prints and never throws: a throw
 * refuses the whole scan and its message reaches CI logs verbatim, so this
 * detector has no route by which a record's content could leave through one.
 */
function detect(ctx: DetectContext): void {
  const declared: Declared = {
    names: ctx.allow.names,
    dobs: ctx.allow.dobs,
    ids: ctx.allow.ids,
    addresses: allowedAddressesOnce(),
  };
  const path = targetPath(ctx.path);
  if (looksLikeHl7(ctx.text, path)) {
    scanHl7(ctx.text, declared, ctx.hit);
    return;
  }
  // Non-HL7 target (hand-written src, a test module, plain-text notes): the
  // embedded pass reads an inline `PID|...` literal with the same field map a
  // real fixture gets. The engine's shape floor has already run over the whole
  // file and is additive to this, never replaced by it.
  scanEmbeddedHl7(ctx.text, declared, ctx.hit);
}

// EXIT 1 IS RESERVED FOR HITS, so nothing may reach node's default handler: an
// uncaught throw exits 1, and this gate's 1 means "PHI found". The engine turns
// every state it anticipates into a refusal at the `refuse` code; this is the
// backstop for the rest (an `EACCES` or an `EISDIR` on the allow-list, a `git`
// binary that is not there, a `TypeError` from a misconfigured axis), so an
// unexpected failure is reported as the invocation error it is rather than
// impersonating a finding.
let exitCode: number;
try {
  exitCode = runPhiScan({
    // hl7's own exit contract: 0 clean, 1 hits found, 2 refusal or invocation
    // error. Supplied rather than defaulted because THE SIBLINGS DO NOT AGREE ON
    // THESE NUMBERS.
    exitCodes: { clean: 0, hits: 1, refuse: 2 },
    scanRoots: SCAN_ROOTS,
    isStagedReadable,
    detect,
  });
} catch (err) {
  process.stderr.write(
    `[phi-scan] the scan failed and did not complete: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  exitCode = 2;
}
process.exit(exitCode);
