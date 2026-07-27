#!/usr/bin/env bash
# scripts/check-no-internal-refs.sh
#
# Founder directive, 2026-07-27: NO INTERNAL PROJECT BOOKKEEPING ON A PUBLIC SURFACE.
# Anything a consumer reads (a GitHub release body, README.md, docs-content/, the npm
# package description, a site page) describes what the software does and what changed.
# It must never carry our internal bookkeeping: item identifiers (`HL7-N`, `CCDA-P7`),
# "Phase U" / "roadmap Phase K", sweep and programme names, ADR numbers, internal repo
# paths, or process commentary about how the artifact came to exist. Source of truth:
# the meta-repo's `documentation/conventions.md`, "No internal project bookkeeping on a
# public surface". The founder's words: "The releases should also not speak on anything
# regarding phases, etc. That has no relevance to the user consuming it. This goes for
# readmes and documentation as well."
#
# WHY THIS IS A GATE AND NOT A MEMORY NOTE. Founder, same day: "it needs to not just be
# a memory note, but something that is addressed in the workflow accordingly. This needs
# to not happen again." A one-time sweep regresses the first time someone writes
# `(CCDA-P8)` into a README. A documented rule governs whoever reads it; a gate governs
# everyone.
#
# WHERE THE IDENTIFIERS DO BELONG, and therefore what this gate deliberately does NOT
# scan: the changeset, CHANGELOG.md, commit messages, the PR title and body, CLAUDE.md,
# source comments, and the meta-repo. The traceability is real and worth keeping; it just
# belongs on the inside. So this is a translation at the boundary, not a deletion, and the
# boundary is what SCAN SURFACE below defines.
#
# ---------------------------------------------------------------------------
# WHAT IS LIFTED FROM WHERE. Two sources, deliberately, and neither is re-derived here.
#
#   * THE DETECTION RULES are lifted from `cosyte/.github` `scripts/release-notes.mjs`
#     ([#18](https://github.com/cosyte/.github/pull/18), `0a759fe`), which is 915 lines
#     with a test suite and a real `hl7-v0.0.2` fixture asserting byte for byte against
#     the live release body, validated against all 14 published releases across 8 repos.
#     Its CONTENT_RULES are the prefix-keyed set below, transcribed to PCRE. THE REASONING
#     IS KEPT WITH THEM ON PURPOSE. Every one of the four traps recorded here shipped a
#     public defect before it was caught, and a reader who has not hit them will tidy the
#     guard away as over-complication.
#
#   * THE SCAN HARNESS is the shape that already works in this repo for
#     `scripts/check-no-emdash.sh`: its own CI job, a tracked-file scan, a refusal to
#     report green from a scan that did not read all of its input, and every known
#     silent-green route closed and checked RED rather than assumed. Specifically it takes
#     mllp's variant of that shape ([mllp#35](https://github.com/cosyte/mllp/pull/35),
#     `eb8b7de`): the scan list is built in a bash loop and `./`-prefixed there, so the
#     scan stays a SINGLE command with the stderr capture bound to all of it, and there is
#     no `sed -z` stage (GNU-only, and unlike `grep -P` it has no self-test, so on the
#     documented Homebrew `gnubin` setup a `sed`-prefixing copy prints OK over a live
#     violation). ncpdp's `sed -z 's|^|./|'` closes the same hole; this shape closes it
#     without adding a stage the stderr capture cannot see.
#
# ---------------------------------------------------------------------------
# THE FOUR TRAPS THAT BREAK A NAIVE DETECTOR. All four are why this file is not a
# one-line grep. Do not "simplify" past them.
#
#   (1) KEY ON KNOWN PROJECT PREFIXES, NEVER ON THE `WORD-N` SHAPE. This trap is sharpest
#       in THIS repo of all of them. `HL7-N` and `MLLP-10` are ours, but `MSH-2`, `PID-3`,
#       `OBX-5`, `SCH-11`, `TQ1-7` and `NM1-03` are HL7 and X12 segment-field references
#       and are exactly the reference material a consumer of an HL7 parser needs. A shape
#       rule destroys the documentation it was added to protect. The cost of keying on
#       prefixes is that a NEW PROGRAMME MEANS ADDING ITS PREFIX to the list below, and
#       nothing will catch it until someone does. That is the cheaper of the two mistakes.
#
#   (2) DECAPITATION, which is a rule for the person REMEDIATING a hit, not for the
#       scanner. Stripping an identifier off the FRONT leaves the fragment behind:
#       "Phase 7 (thirteenth slice): builder emits X (CCDA-P7)" became "(thirteenth
#       slice): builder emits X" across 17 lines of ccda's published release notes, which
#       is worse than the text it replaced. Repair the head: drop a leading orphan
#       parenthetical, strip leading punctuation, recapitalise. Same mid-sentence: "(of
#       the v2.4 capability arc)" reads worse than no parenthetical at all.
#
#   (3) CASE SENSITIVITY. The identifier rule is case-SENSITIVE and the segment after the
#       hyphen must start uppercase, which is what lets `FHIR-bridge` and `docs-content/`
#       through: they are legitimate content, and a case-insensitive rule calls them
#       violations. Leading digits are fine too: `835`, `271` and `837` open X12 headlines
#       legitimately, so nothing here keys on a leading number.
#
#   (4) PHASE PATTERNS NEED A LETTER SUFFIX (`Phase 5b`) AND A LETTER-ONLY FORM
#       (`Phase W`): a digits-only pattern misses both. Ordinal `slice` and `wave` are
#       ours too ("thirteenth slice", "second wave"): "slice" is our word for a unit of
#       work and a reader does not have it. In prose it should read "change".
#
# ---------------------------------------------------------------------------
# SCAN SURFACE. This gate scans the PUBLIC surface only, which is the one substantive
# difference from check-no-emdash (that one scans every tracked file, because the em-dash
# ban has no inside/outside distinction: it covers commit messages too). Here the same
# identifier is REQUIRED on the inside and BANNED on the outside, so scanning every
# tracked file would red on CHANGELOG.md, `.changeset/`, CLAUDE.md and source comments,
# where the convention explicitly says the identifiers belong. A gate that reds on
# correct content is a gate someone deletes.
#
# In scope:
#   * README.md            the repo's front page, and shipped inside the npm tarball
#   * TRADEMARKS.md        shipped inside the npm tarball (`files` in package.json)
#   * LICENSE              shipped inside the npm tarball
#   * docs-content/        every tracked file, including sidebars.json: this is the
#                          content published to docs.cosyte.com
#   * package.json         the npm-visible metadata ONLY (`description`, `keywords`),
#                          extracted and scanned as text. Named explicitly by the
#                          convention. The rest of package.json is not public prose, and
#                          scanning it whole would red on a future dependency or script
#                          name that happens to match.
#
# Out of scope, each for a stated reason:
#   * CHANGELOG.md         SHIPS INSIDE THE NPM TARBALL, so it is genuinely public surface,
#                          and it currently carries internal identifiers across its
#                          history. It is excluded anyway because the convention names
#                          CHANGELOG.md as one of the places identifiers BELONG, and
#                          because rewriting a released changelog's history destroys the
#                          traceability the same convention preserves. That is a live
#                          contradiction in the standard, it is ECOSYSTEM-WIDE (every
#                          parser has it), and it is not for one repo to settle alone.
#                          Recorded here, and queued on PUBLIC-SURFACE-HYGIENE in the
#                          meta-repo, rather than silently decided in either direction.
#   * CLAUDE.md, .github/, .changeset/, scripts/, src/, test/, examples/, profile/
#                          internal by definition, or code rather than prose. `src/` is
#                          the one to keep an eye on: a JSDoc `@example` block reaches the
#                          consumer through IntelliSense and the generated `.d.ts`. It is
#                          left out here because the identifier rules would fire on
#                          nothing today and the doc-comment surface wants its own rule
#                          set, not this one. Stated so it reads as a known edge rather
#                          than an oversight.
#
# ---------------------------------------------------------------------------
# NO STDIN / PR-TEXT MODE, deliberately, and this is the other difference from
# check-no-emdash. That gate scans the PR title, body and commit messages because the
# brand rule names commit messages explicitly. This rule says the opposite: identifiers
# BELONG in the commit, the PR and the changeset. A PR-text half here would red on correct
# work. If you are looking for the half that keeps identifiers out of a published RELEASE
# BODY, it exists and it is not here: `cosyte/.github` `scripts/release-notes.mjs assert`
# runs inside the shared release pipeline and refuses to publish a violating body.
#
# ---------------------------------------------------------------------------
# DISCLOSED RESIDUALS. Known and stated rather than discovered later.
#
#   (i)   THE PREFIX LIST IS DUPLICATED. It is copied from release-notes.mjs because a
#         bash gate inside a parser repo cannot import from `cosyte/.github`, and vendoring
#         that 915-line Node script into 11 repos is worse. So the two lists can drift: a
#         prefix added there does not appear here. The cross-repo fix is one shared list
#         (published as data by `cosyte/.github`, or as a `@cosyte/*` package), and it is
#         ONE fix across every copy rather than one per repo. Do not patch this copy alone;
#         a divergent variant is worse than a known shared limit.
#   (ii)  The scan reads file CONTENTS, never file NAMES. A tracked path that itself
#         carries an identifier passes green. Shared with check-no-emdash.
#   (iii) An identifier inside a fenced code block, a URL, or a link target is treated
#         exactly like prose. That is deliberate (a reader sees it either way), but it
#         means a legitimate quotation of an internal path in an example would have to be
#         rewritten rather than escaped.
#   (iv)  This gate does not check the em dash. `scripts/check-no-emdash.sh` owns that
#         rule and scans a wider surface; duplicating it here would put the same red in
#         two places with two wordings.
#   (v)   IT CATCHES IDENTIFIERS, NOT PROSE ABOUT OUR PROCESS. The founder's rule bans
#         both. "All confirmed 3-0 (pass 5) against primary Ch. 2A", "Spec facts taken
#         from the roadmap's verified traceability rather than re-researching", and
#         "Assumption logged" were all live on this repo's docs pages and were removed by
#         hand in the same change that added this gate. No pattern would have found them:
#         they are ordinary English sentences whose only fault is that they describe how
#         the artifact came to exist. The gate raises the floor; it does not replace the
#         reviewer's half of the rule.
#   (vi)  `D-NN` INTERNAL DECISION NUMBERS ARE NOT CAUGHT, deliberately. This repo numbers
#         its design decisions `D-01`, `D-02`, `D-18`, they appear across `src/` comments,
#         and two of them reached `docs-content/spec-notes-differential.md` as public
#         section labels. They are left alone because catching them needs a single-letter
#         prefix, and that is trap (1) with a clinical edge: legacy SNOMED RT codes are
#         axis-prefixed in exactly that shape (`D-13000` topography, `T-32000`,
#         `M-80003`), so a `D-\d+` rule in a healthcare parser's docs is one careless
#         widening away from corrupting a code. Retiring the convention, or renaming it to
#         something a reader can use, is a separate deliberate change and is queued on
#         PUBLIC-SURFACE-HYGIENE rather than smuggled in here.
#
# Run it locally with `pnpm check:no-internal-refs`.
set -euo pipefail

# LOCALE PIN, load-bearing, and inherited from check-no-emdash for the same measured
# reason: `grep -P` compiles PCRE in UTF-8 mode only when the locale says so. Under
# LC_CTYPE=POSIX (a bare container, cron, `sh -c`) GNU grep's handling of non-ASCII in the
# input and of `\w` in the pattern changes, and the docs scanned here contain non-ASCII
# (the `·` separator, `§`, curly quotes). A gate whose matching depends on an inherited
# environment is a gate that reports green somewhere and red elsewhere.
export LC_ALL=C.UTF-8

# ---------------------------------------------------------------------------
# THE BANNED SET, transcribed from release-notes.mjs CONTENT_RULES
# ---------------------------------------------------------------------------

# Known project and programme prefixes. THE KEYING IS ON THESE, NEVER ON THE `WORD-N`
# SHAPE: see trap (1) above. Order matters only for readability. Kept in the same order as
# the source list so a diff between the two is legible.
PROJECT_PREFIXES='PARSERS-PUBLIC|DOCS-CONTENT|KNOWLEDGEBASE|TERMINOLOGY|PATHWAYS|TRANSFORM|WEBSITE|STAGING|SUPPLY|NCPDP|ASSETS|EMDASH|README|CONFIG|DICOM|SYNTH|DEID|CCDA|ASTM|MLLP|FHIR|CREW|DOCS|PERF|SYNC|VERSION|PUBLIC|HL7|X12|IAC|CLI|KB|PW|PUB|CI|REAL|TERM|PKG|WF|VERIFY'

# Rule 1: internal project identifier. CASE SENSITIVE, and the segment after the hyphen
# must start with an uppercase letter or a digit, which is what lets `FHIR-bridge` and
# `HL7-defined` through (trap 3). The second alternative is our internal priority label,
# and it matches its own trailing word rather than looking ahead for one: an earlier
# version keyed on `P\d+` followed by end-of-string or a comma, which is the shape rule
# this file exists to avoid. It deleted the ICD-10-CM code in "Map ICD-10 P07, P22 and P29
# to SNOMED CT" and truncated the code range "P00-P96". Corrupting a diagnosis code to
# remove an internal label is not a trade worth making.
#
# THE ONE COLLISION THAT IS REAL IN THIS REPO, and it is not hypothetical: `HL7` is one of
# our prefixes AND the name of the standards body whose TABLES this parser documents. An
# HL7 v2 table reference is a four-digit number (Table 0396 code systems, Table 0003 event
# types, Table 0076 message types), and written with a hyphen (`HL7-0396`) it is
# typographically identical to one of our item identifiers. Our identifiers are letters or
# short letter-words (`HL7-N`, `HL7-ESC`, `HL7-VALUE-REDECODE`), never a bare four-digit
# number, so the lookahead below costs nothing and protects the reference material. The
# docs happen to write "HL7 Table 0396" with a space today, so nothing in this tree relies
# on it; it is here because the next author will not know, and the negative self-test
# asserts it so a later "simplification" cannot quietly drop it.
RULE_NAME[0]='internal project identifier'
RULE_PATTERN[0]='\b(?!HL7-\d{4}\b)(?:'"$PROJECT_PREFIXES"')(?:-[A-Z0-9][A-Z0-9.]*)+\b|\bP\d+ (?:safety|documentation)\b'

# Rule 2: phase and wave language. CASE INSENSITIVE via the inline `(?i)`, because the
# rules do not share a case policy and one `grep -i` for all of them would break trap (3).
# `Phase 5b` and `Phase W` are both covered (trap 4). The negative lookahead keeps ordinary
# English off the list, so "in phase with the source system" and "out of phase" survive.
ORDINAL='(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|\d+(?:st|nd|rd|th))'
RULE_NAME[1]='phase or wave language'
RULE_PATTERN[1]='(?i)\b(?:roadmap phase\b[ ]?[A-Za-z0-9]*|phase (?!of\b|with\b|in\b|out\b|the\b|and\b|is\b|for\b|to\b)[A-Za-z0-9]+[a-z]?\b|wave \d+\b|the \w+ and final phase\b|documentation residual\b|'"$ORDINAL"' (?:slice|wave)\b)'

# Rule 3: ADR references. An ADR number is a pointer into a repo the reader cannot open.
RULE_NAME[2]='ADR reference'
RULE_PATTERN[2]='(?i)\bADR[ -]?\d{3,4}\b'

# Rule 4: `slice`, our internal word for a unit of work. It is ALSO real clinical
# vocabulary: a DICOM study has slices, with a slice thickness, a slice location and slice
# spacing, and hl7's docs discuss the FHIR bridge and imaging orders. So this keys on the
# determiner forms that are unambiguously ours ("this slice", "the final slice") and
# excludes the imaging nouns. A bare `slice` is deliberately NOT flagged: across this
# corpus that word is more often the reader's than ours. The imaging-noun list is grounded
# in @cosyte/dicom's generated tag dictionary (SliceThickness, SliceLocation,
# SpacingBetweenSlices, SliceVector, NumberOfSlices, TimeSliceVector,
# SliceProgressionDirection, SliceSensitivityFactor). A modifier may sit between the
# determiner and the noun ("the misfiling-prevention slice") but a preposition may not:
# "the Number of Slices" is a DICOM attribute, not one of our units of work.
IMAGING_NOUNS='thickness|location|spacing|position|interval|order|number|index|gap|count|data|pixel|orientation|plane|direction|width|vector|sensitivity|progression|factor'
RULE_NAME[3]='internal jargon ("slice")'
RULE_PATTERN[3]='(?i)\b(?:this|that|the|each|another|previous|next|final|current)\s+(?:(?!(?:of|in|on|between|per|for|to|with|at)\s)[\w-]+\s+){0,2}slices?\b(?!\s+(?:'"$IMAGING_NOUNS"'))'

# Rule 5: internal repo paths. This is the ONE rule not present in release-notes.mjs, and
# it is added rather than lifted because a release body is prose while a docs page carries
# citations: hl7's spec notes cited `operations/roadmaps/hl7.md` by path, and a reader who
# installs @cosyte/hl7 has no such file and no such repo. Keyed on the known meta-repo
# paths, not on a `dir/file.md` shape, for exactly the reason trap (1) gives.
RULE_NAME[4]='internal repo path'
RULE_PATTERN[4]='\boperations/(?:BACKLOG\.md|roadmaps/|plans/)|\bdocumentation/(?:decisions/|ecosystem-map\.md|conventions\.md)|\bBACKLOG\.md\b'

# Rule 6: internal traceability markers. Also added rather than lifted, and found by
# reading this repo's own docs rather than by design: the spec notes carried bracketed
# spec-trace tags (`[S-DTM-IMPL]`, `[S-NTE]`) that key into the roadmap's traceability
# table, and an "Open-question #12" that points at a decision log the reader cannot open.
# Both are DELIMITER-ANCHORED rather than shape-keyed, which is the only reason they are
# safe: the tag rule requires a literal `[S-` opening bracket and at least two characters
# after it, so a documented character range like `[S-Z]` does not match, and neither does
# a value set written `[SNOMED]`.
RULE_NAME[5]='internal traceability marker'
RULE_PATTERN[5]='\[S-[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\]|(?i:\bopen[- ]question #?\d+\b)'

RULE_COUNT=6

# ---------------------------------------------------------------------------
# SELF-TESTS. A gate is believed only after it has shown it can still see.
# ---------------------------------------------------------------------------
#
# Two halves, and the second is the one that is unusual. POSITIVE samples prove each rule
# still matches what it bans (the check-no-emdash property: refuse to report a clean tree
# from a scanner that cannot see). NEGATIVE samples prove each rule still lets through the
# reference material it was most likely to destroy, which is trap (1) turned into an
# assertion: if someone "simplifies" the identifier rule to a `WORD-N` shape, the negative
# self-test reds here instead of silently deleting `MSH-2` from an HL7 parser's docs on the
# next sweep. Both halves run on every invocation, local and CI, and both refuse rather
# than warn.

self_test_fail() {
  echo "ERROR: check-no-internal-refs - SELF-TEST FAILED: $1" >&2
  echo "       The scanner is not behaving as specified, so no result from it can be" >&2
  echo "       believed. Refusing to report on the tree." >&2
  exit 1
}

# rule index -> text that MUST match
POSITIVE[0]='Item HL7-N is done, and CCDA-P7 with it'
POSITIVE[1]='Phase 5b closes it (Phase W and the thirteenth slice landed earlier, in wave 2)'
POSITIVE[2]='Decided in ADR 0015 and restated in ADR-0021'
POSITIVE[3]='This slice adds the helper; the final slice removes it'
POSITIVE[4]='Roadmap operations/roadmaps/hl7.md and documentation/decisions/0015-x.md'
POSITIVE[5]='Repeating [S-NTE], and Open-question #12 resolves the direction'

# rule index -> text that must NOT match. Every entry is real reference material from an
# HL7, X12, DICOM or FHIR context, or ordinary English that collides with our jargon.
NEGATIVE[0]='MSH-2 encoding characters, PID-3 identifier list, OBX-5 value, SCH-11 timing, TQ1-7 start, NM1-03 name, ICD-10-CM P00-P96, FHIR-bridge stability, docs-content/ layout, HL7-defined tables, HL7-0396 and HL7-0003, 835 remittance'
NEGATIVE[1]='The adapter stays in phase with the source system and is out of phase for the second reconciliation'
NEGATIVE[2]='ADR is not a segment, and 0015 alone is a value'
NEGATIVE[3]='The slice thickness and the number of slices are DICOM attributes, and each slice location is too'
NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'

i=0
while [ "$i" -lt "$RULE_COUNT" ]; do
  if ! printf '%s\n' "${POSITIVE[$i]}" | grep -qP -e "${RULE_PATTERN[$i]}"; then
    self_test_fail "rule '${RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${NEGATIVE[$i]}" | grep -qP -e "${RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${NEGATIVE[$i]}" | grep -oP -e "${RULE_PATTERN[$i]}" | head -1)
    self_test_fail "rule '${RULE_NAME[$i]}' now matches legitimate reference material (matched: '${hit}'). This is the WORD-N trap: it destroys the segment-field references an HL7 parser's docs exist to provide."
  fi
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# Refusals. Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Exit status cannot carry that signal:
# grep exits 1 on "no match", which xargs reports as 123, so "clean" and "died part way
# through the batch" are indistinguishable by code. A match inside input grep classifies
# as binary also arrives on stderr with empty stdout.
# ---------------------------------------------------------------------------
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
SCANLIST=$(mktemp)
NPMBUF=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST" "$SCANLIST" "$NPMBUF"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  # GNU grep >= 3.5 prints "grep: FILE: binary file matches" on STDERR with nothing on
  # stdout, so a match in input it cannot read as text arrives here rather than in the hit
  # list. Name that case, or the run reds blaming an I/O failure that never happened and
  # sends a reader hunting it. This branch only chooses the wording; every path exits 1.
  if grep -qi 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-internal-refs - the input named above MATCHED a banned pattern," >&2
    echo "       but grep classifies it as binary, so the hit has no line number. Treat it" >&2
    echo "       as a real violation, and repair the file's encoding (it should be UTF-8)." >&2
  fi
  if grep -qiv 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-internal-refs - the scan reported errors, so it did not read all" >&2
    echo "       of its input. Refusing to report green from an incomplete scan." >&2
  fi
  exit 1
}

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-internal-refs - internal project bookkeeping found in ${what}." >&2
  echo "       A consumer reads this surface. Item identifiers, phase and wave language," >&2
  echo "       ADR numbers and meta-repo paths belong in the changeset, CHANGELOG.md, the" >&2
  echo "       commit, the PR and the roadmap. Translate at the boundary: say what the" >&2
  echo "       software does and what changed." >&2
  echo "       When you strip an identifier off the FRONT of a line, repair the head too:" >&2
  echo "       drop a leading orphan parenthetical, strip leading punctuation, recapitalise." >&2
  echo "       Leaving the fragment behind is worse than the text it replaced." >&2
  echo "       Rule: documentation/conventions.md, 'No internal project bookkeeping on a" >&2
  echo "       public surface'." >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Build the scan list
# ---------------------------------------------------------------------------
#
# `git ls-files` is relative to the working directory, so from a subdirectory it lists a
# subtree and the scan would report OK having skipped the rest of the surface. Anchor at
# the top level.
cd "$(git rev-parse --show-toplevel)"

# The public surface, as paths. Each is justified in the SCAN SURFACE note at the top.
SURFACE_PATHS=(README.md TRADEMARKS.md LICENSE docs-content)

# Every named surface path must still be tracked. Without this, renaming or deleting
# README.md makes the gate scan less and still print OK, which is the same silent-green
# failure the routes below close, arriving through the file list instead of through grep.
for p in "${SURFACE_PATHS[@]}"; do
  if [ -z "$(git ls-files -- "$p")" ]; then
    echo "ERROR: check-no-internal-refs - the public surface path '$p' is not tracked." >&2
    echo "       Either it was renamed or removed (update SURFACE_PATHS in this script," >&2
    echo "       deliberately), or the scan is about to cover less than it claims." >&2
    echo "       Refusing to report green from a shrunken surface." >&2
    exit 1
  fi
done

# DRIFT TRIPWIRE on the npm tarball. `files` in package.json decides what a consumer
# actually receives, so a new prose file added there is new public surface that this gate
# would not know about. Rather than let that pass silently, refuse until someone puts it in
# SURFACE_PATHS or names it here as deliberately excluded. CHANGELOG.md is the one standing
# exclusion; see SCAN SURFACE above for why it is contested rather than settled.
command -v node >/dev/null || {
  echo "ERROR: check-no-internal-refs - node is required (to read package.json) and is not" >&2
  echo "       on PATH. Refusing to skip the npm-surface half of this gate." >&2
  exit 1
}
UNKNOWN_TARBALL_DOCS=$(node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const known = new Set(["README.md", "TRADEMARKS.md", "LICENSE", "CHANGELOG.md"]);
  const docs = (pkg.files ?? []).filter((f) => /\.(md|txt)$/i.test(f) || f === "LICENSE");
  process.stdout.write(docs.filter((f) => !known.has(f)).join(" "));
')
if [ -n "$UNKNOWN_TARBALL_DOCS" ]; then
  echo "ERROR: check-no-internal-refs - package.json 'files' ships prose this gate does not" >&2
  echo "       cover: $UNKNOWN_TARBALL_DOCS" >&2
  echo "       That is public surface a consumer receives in the tarball. Add it to" >&2
  echo "       SURFACE_PATHS, or record it as a deliberate exclusion in this script." >&2
  exit 1
fi

git ls-files -z -- "${SURFACE_PATHS[@]}" > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-internal-refs - no tracked public-surface files to scan. Refusing" >&2
  echo "       to report green from a scan that read nothing." >&2
  exit 1
fi

# THE SILENT-GREEN ROUTES, all closed here and every one of them checked RED against a
# seeded violation before this landed rather than inherited on faith. This list is NOT a
# claim of exhaustiveness: route (8) was found by a refuter against a copy whose own
# comment implied it was already closed.
#
#   (1) THE SCANNER CANNOT SEE. Closed by the locale pin and the positive self-tests
#       above, plus the negative self-tests, which are stronger than the em-dash gate's
#       single sample: they also catch a rule widened into the trap (1) shape.
#   (2) AN EMPTY FILE LIST. `xargs` without `-r` runs grep anyway, and grep with no file
#       operand reads STDIN, finds nothing, and exits 0. Closed by `-r` AND by refusing an
#       empty list outright, above and again after the loop.
#   (3) `git ls-files` FAILS (unreadable or corrupt index) AND ITS STATUS IS ERASED. The
#       list is built as its OWN command, not as the head of the pipeline: piped, its
#       status is swallowed by the `|| true` the no-match case needs, and the scan reports
#       OK over an empty list.
#   (4) A PATH THE SCANNER NEVER RECEIVES. `git ls-files` C-quotes any path holding a
#       space, a quote or a non-ASCII byte, so unseparated, grep is handed a name no file
#       has. Closed by `-z` here and `-0` on xargs.
#   (5) A FILENAME PARSED AS AN OPTION. A tracked file named `-q` would silence the whole
#       batch and the gate would print OK. Closed by `-e` before the pattern and `--`
#       after it.
#   (6) A FILENAME READ AS STANDARD INPUT, which `--` does NOT close and which every
#       earlier copy of this shape still has. `--` stops `-` being parsed as an OPTION;
#       grep then reads the bare operand `-` as STDIN, and xargs points its child's stdin
#       at /dev/null, so a tracked file literally named `-` (a `cmd > -` typo, which
#       `git add -A` stages without complaint) is NEVER OPENED and the gate prints OK and
#       exits 0 over a live violation. Closed by `./`-prefixing every path AS THE LIST IS
#       BUILT, in the loop below rather than through `sed -z`, so the scan stays a single
#       command with the stderr capture bound to all of it and there is no GNU-only stage
#       that has no self-test of its own.
#       BE PRECISE ABOUT REACHABILITY HERE, because inheriting the claim unexamined is how
#       this route survived in five repos. grep treats only a BARE `-` operand as stdin,
#       and every path this gate scans is emitted by `git ls-files` under a listed surface
#       path. None of those is the repo root today, so the worst a file named `-` can
#       produce is `docs-content/-`, which grep opens normally (checked: it reds). The
#       route becomes live the moment SURFACE_PATHS gains a root-level entry (`.`, `*.md`,
#       a new root file). That was checked rather than argued: with `-` added to
#       SURFACE_PATHS and a root file named `-` holding a live identifier, the shipped
#       shape reds naming `./-`, and the same script with the prefix removed prints
#       "check-no-internal-refs: OK" and exits 0. The prefix is therefore kept as the
#       thing that makes widening the surface safe, not as decoration.
#   (7) AN UNREAD ENTRY THAT IS NOT A MISSED MATCH. `-d skip` silently skips a tracked
#       symlink to a directory: no stderr, so nothing refuses, and the gate goes green
#       having never opened it. `-d skip` is NOT used. The loop refuses a tracked entry
#       that is not a regular file BY NAME instead, which is louder. The `! -L` guard
#       matters: `-d` follows symlinks, so a symlink to a directory tests true and would
#       be skipped as if it were a gitlink.
#   (8) A SCAN THAT DIED PART WAY THROUGH AND REPORTED CLEAN. grep's exit status cannot
#       distinguish that from no-match. Closed by capturing stderr and refusing on any of
#       it; see refuse_if_incomplete.
#
# Also, and not a route so much as a standing choice: NO `-I`. `-I` skips anything grep's
# heuristic calls binary, which includes a genuine TEXT file with a broken encoding, so a
# violation inside one would be skipped in silence. This repo's public surface is markdown
# and JSON with no binaries (checked: no tracked file under it holds a NUL byte), so losing
# `-I` makes a future binary a loud red instead of a silent miss. Fail closed, not open.
# `-H` is set so every hit carries its filename: grep omits the name when handed exactly
# one file, which an xargs batch boundary can produce.
: > "$SCANLIST"
gitlinks=0
scanned=0
while IFS= read -r -d '' f; do
  if [ -d "$f" ] && [ ! -L "$f" ]; then
    gitlinks=$((gitlinks + 1))
    continue
  fi
  if [ ! -r "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked file is not readable: $f" >&2
    echo "       Refusing to report green from a scan that could not open its input." >&2
    exit 1
  fi
  if [ ! -f "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked entry is not a regular file: $f" >&2
    echo "       Refusing to report green from a scan that skipped one of its inputs." >&2
    exit 1
  fi
  printf './%s\0' "$f" >> "$SCANLIST"
  scanned=$((scanned + 1))
done < "$FILELIST"

if [ ! -s "$SCANLIST" ]; then
  echo "ERROR: check-no-internal-refs - no public-surface files survived list building." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# The npm metadata is public surface that is not a file of its own. Extract the two fields
# the convention names and scan them as text. Written with a real newline between fields so
# a hit reports a usable line number.
node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const lines = ["description: " + (pkg.description ?? ""), "keywords: " + (pkg.keywords ?? []).join(", ")];
  process.stdout.write(lines.join("\n") + "\n");
' > "$NPMBUF"
if [ ! -s "$NPMBUF" ]; then
  echo "ERROR: check-no-internal-refs - could not read the npm metadata from package.json." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Scan, one rule at a time so a hit can name the rule it broke
# ---------------------------------------------------------------------------
#
# Each rule is its own single command with its own stderr capture, rather than one merged
# pattern: a merged pattern cannot report WHICH rule fired, and "phase language" and
# "internal identifier" want different remediation advice. The cost is N passes over a
# handful of markdown files, which is nothing.
ALL_HITS=""
i=0
while [ "$i" -lt "$RULE_COUNT" ]; do
  : > "$ERRLOG"
  HITS=$(xargs -0 -r grep -H -nP -e "${RULE_PATTERN[$i]}" -- < "$SCANLIST" 2>>"$ERRLOG" || true)
  refuse_if_incomplete

  : > "$ERRLOG"
  NPM_HITS=$(grep -H -nP -e "${RULE_PATTERN[$i]}" -- "$NPMBUF" 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  # Report the npm metadata under a name a reader can act on, not a temp path.
  [ -n "$NPM_HITS" ] && NPM_HITS=$(printf '%s\n' "$NPM_HITS" | sed "s|^${NPMBUF}|package.json (npm metadata)|")

  for block in "$HITS" "$NPM_HITS"; do
    [ -n "$block" ] || continue
    ALL_HITS="${ALL_HITS}[${RULE_NAME[$i]}]"$'\n'"${block}"$'\n'
  done
  i=$((i + 1))
done

[ -n "$ALL_HITS" ] && fail_with_hits "the public surface listed above" "$ALL_HITS"

echo "check-no-internal-refs: OK (${scanned} public-surface file(s) and the npm metadata scanned against ${RULE_COUNT} rules; ${gitlinks} gitlink(s) skipped)"
