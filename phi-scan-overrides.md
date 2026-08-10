# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of
`scripts/phi-scan.ts`. The scanner refuses to honor a `--allow-fixture <path>`
flag UNLESS this file contains an entry referencing the same path. The committed
log is intentionally annoying: it discourages bypass and creates an audit
trail. Prefer extending `scripts/phi-allow-list.txt` (a token-level, reviewed
declaration) over a whole-file bypass.

## How the scanner detects PHI

`scripts/phi-scan.ts` is HL7 v2-shape-aware: it reads the message delimiters from
`MSH-1` / `MSH-2` (defaulting to `|^~\&` for a header-less message), splits
segments → fields → repetitions → components, and inspects only the fields that
actually carry each PHI category. A naive `Family^Given` text regex is
deliberately NOT used: it trips on coded values like `CBC^Complete Blood
Count^LN` or `Boston^MA`, which would be false confidence, not safety.

Two properties keep the structured scan from being silently bypassed (both were
caught by the conformance-refuter and fixed): a **header-less** fixture (the repo
ships `test/fixtures/malformed/no-msh-segment.hl7`, which starts with `EVN`) still
gets the full structured scan: any fixture-like file with a recognizable segment
line is parsed, not just one whose first byte is `MSH`; and segment ids are
matched **case-insensitively** (`pid` is normalized to `PID`), because the lenient
parser accepts lowercase segment ids and the scanner must not go blind where the
parser stays tolerant. `src/` is never parsed as HL7 (even when a file embeds an
`MSH|…` example string): parsing a `.ts` file as a message produces only noise.

**There are three tiers, and scope decides only whether a file is READ, never
how well.** Getting that backwards is this class's recurring trap, so port the
distinction, not just the root list. (1) The whole-file HL7 parse, for a file
that IS a message: `test/fixtures/**`, any `.hl7`, and the fixture root's own
path. (2) The **embedded-literal** pass, which pulls `PID|…` runs out of
hand-written source and hands them the same field map: an inline fixture is a
TypeScript string literal, so tier 1 structurally cannot see it. (3) The
conservative shape floor over every file: a dashed SSN and a non-test email
domain, and **nothing else**. Tier 3 alone is what widening a walk root buys.
Measured here: `test/` holds **115** tracked files the walk did not reach, **55**
of them carrying an inline `PID|` literal, and on tier 3 alone a name, a DOB, an
MRN, an address and a phone in those files are all invisible.

**What the embedded pass deliberately does not do**, so a port does not claim
more than it delivers. All four were measured, and the last two were added after
review refuted the first draft of this paragraph, which is the reason to read
them rather than the summary above.

1. **Default delimiters only.** An embedded run has no reachable `MSH-2`: the
   encoding characters are themselves source-escaped and a run is matched per
   line with no header in hand. A custom-delimiter message written inline is
   covered at the shape floor only.
2. **No unknown-segment backstop.** That backstop flags any adjacent pair of
   name-shaped components in **any** field, which is right for a file known to be
   a message and a noise cannon over program text. So an inline `Z…`
   site-defined segment carrying a name is **not** detected.
3. **A `${…}` interpolation is erased, not read** -- and the residual is bigger
   than "a value that only exists at runtime". Reading the identifier as a name
   invents findings out of program text (`familyName`, `content`, `marker` and
   `pidSurname` were each reported as a patient name), so it is erased. But the
   bound is **any value reached through an interpolation, including one whose
   literal sits in the same file**: measured, `const fam = "<surname>"` followed
   by `` `PID|1||<mrn>^^^HOSP^MR||${fam}^${giv}||<dob>|F` `` exits 1 on the MRN
   and the DOB and is **silent on the name**. This pass reads literals in field
   position; it evaluates nothing. The shape floor still reads the whole file, so
   a dashed SSN or a non-test email in such a constant is caught either way.
4. **A run is cut at the first source quote, and that cuts HL7 data too.** The
   cut is what stops `" +` and the rest of the source line being read as fields.
   It is not free: the two-character literal `""` is HL7 v2's **explicit-null**
   field value, so an inline fixture exercising null handling loses everything
   after it. **No clause number is quoted**, deliberately: an unverified citation
   in a porting source is the same species as a drifting score, and this one was
   not verified against the primary. The behaviour is grounded in this repo's own
   parser instead (`src/model/field.ts`, whose `isNull` is true iff the field was
   exactly those two characters). Measured
   on the same bytes both ways: `PID|1|""|MRN001||<surname>^<given>||<dob>|F`
   exits **1** with `PID-5` and `PID-7` at a `.hl7` path and exits **0** as an
   inline literal, because the extracted run is `PID|1|`. An apostrophe inside a
   name (`O'Brien`) truncates identically. **Do not "fix" this by teaching the
   cut about quoting**: the enclosing quote style is not knowable from a single
   line, and a wrong guess reads program text as patient data. It is a MISS, and
   the point of writing it down is that the pass is not complete.

| Category                     | Where it looks                                                                                                                                                                                                   | Rule                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patient / person names       | PID-5/-6/-9, NK1-2/-30, GT1-3, IN1-16, MRG-7, STF-3 (XPN comp1-3); PV1-7/-8/-9/-17/-52, PD1-4, ORC-10/-11/-12/-19, OBR-10/-16/-28/-32..35, OBX-16/-25, DG1-16, PR1-11, AIP-3, TXA-9/-10/-11, ROL-4 (XCN comp2-4) | each significant name token must be in the `NAME` allow-list (case-insensitive). Single Latin initials are skipped; single CJK ideographs are kept (Chinese/Korean surnames are one character); HL7 degree/suffix codes (MD, JR, …) are ignored. |
| Date of birth                | PID-7, NK1-16                                                                                                                                                                                                    | the normalized `YYYYMMDD` / `YYYYMM` / `YYYY` (DTM precision) must be in the `DOB` allow-list. A DOB is indistinguishable from a real one by shape, so the allow-list is the only sound gate, the same choice `@cosyte/x12` made.                |
| SSN                          | PID-19 (ST 9-digit); PID-3/-18 CX with identifier-type `SS`/`SSN`; dashed `\d{3}-\d{2}-\d{4}` anywhere                                                                                                           | a 9-digit SSN-shaped value must be in the `ID` allow-list; a dashed SSN anywhere is always a hit.                                                                                                                                                |
| MRN / account                | PID-3, PID-18 (CX comp1)                                                                                                                                                                                         | a bare 6-9 digit identifier is a real-looking MRN/account (or a misfiled SSN) and must be in the `ID` allow-list. Synthetic fixtures use prefixed shapes (`MRN…`, `ACCT…`, `FAKE…`), which pass.                                                 |
| Address                      | PID-11, NK1-4, GT1-5, IN1-19 (XAD comp1)                                                                                                                                                                         | a `<number> <word>` street line must be in the `ADDR` allow-list.                                                                                                                                                                                |
| Phone                        | PID-13/-14, NK1-5/-6/-7, GT1-6/-7 (XTN)                                                                                                                                                                          | a ≥10-digit number lacking the `555` fake-exchange convention is a hit.                                                                                                                                                                          |
| Email                        | anywhere                                                                                                                                                                                                         | an email whose domain is not an `EMAILDOMAIN` (reserved/test) domain is a hit.                                                                                                                                                                   |
| Site-defined (`Z…`) segments | every field                                                                                                                                                                                                      | backstop: an adjacent pair of single-token name-shaped components (`Johnson^Maya`) whose tokens are not allow-listed. Runs ONLY on segments outside the known-segment set, so coded triples in `OBX`/`OBR` are not misread as names.             |

## Documented limitations (propagation notes for ccda / ncpdp / mllp)

- **Free-text names.** OBX-5 / NTE narrative is scanned for identifier _shapes_
  (dashed SSN, email) but NOT for free-text personal names: a name in prose is
  not reliably separable from clinical vocabulary without NLP. A reviewer still
  owns clinical narrative. Structured name fields (the table above) are the hard
  gate.
- **Single-codepoint CJK below the initial threshold.** A single Latin letter is
  treated as a middle initial and skipped; single CJK ideographs are kept, so
  1-character CJK names ARE gated (via the allow-list). Latin single-letter given
  names (rare) are not.
- **MRN heuristic is shape-based.** A synthetic MRN that happens to be a bare
  6-9 digit number will be flagged until allow-listed: that is intentional
  (bare numeric ids are the real-MRN shape). Prefer a prefixed synthetic shape.
  Conversely, a real but _alphanumeric_ MRN (e.g. `H0034521`) is not
  distinguishable from a synthetic prefixed id and is not flagged: the name /
  DOB / SSN gates are the backstop for a real message committed by mistake.
- **Phone `555` accept rule.** A ≥10-digit number containing `555` anywhere is
  treated as the fictional-exchange convention and accepted, matching
  `@cosyte/x12`. A real DID that happens to contain `555` (e.g. a real
  `212-555-xxxx` line) would pass. The synthetic corpus uses `555` numbers, so
  tightening to the strict `555-01xx` reserved block would flag real fixtures;
  the convention is kept for sibling-parser parity.
- **Name-component positions.** The name detectors read the standard XPN
  (family=comp1) / XCN (family=comp2) component positions across the field map
  above. A name stored in a non-standard component slot, or in a name-bearing
  field not in the map, can be missed: the map covers the realistic patient +
  provider name fields, not every conceivable one.
- **Common-name masking (residual, inherent).** The `NAME` allow-list contains
  common real surnames/givens the synthetic corpus uses (SMITH, JONES, BROWN,
  JOHN, MARY, …). A real patient whose name is entirely common allow-listed
  tokens is therefore invisible to the name detector: a structural consequence
  of a token allow-list, shared by `@cosyte/x12`. The DOB / SSN / MRN / address
  gates remain the backstop. Flag for the ccda/ncpdp/mllp propagation.

## Enumeration, and what a failed read does

**Exit 1 is reserved for HITS, so nothing reaches node's default handler.** A
scan that never ran is not a scan that found PHI, and an uncaught throw exits 1,
which is this gate's code for "PHI found". Two failures used to do exactly that,
with a v8 stack trace in place of the scanner's own diagnostic: a missing or
unreadable `scripts/phi-allow-list.txt` (`loadAllowList()` ran outside every
`try`), and a walk root `readdirSync` could not list. Both now refuse with exit 2
and a named `[phi-scan]` line, and a top-level backstop catches whatever else
throws. Nothing downstream reads the difference today, since both codes are
non-zero and the gate blocks either way; a caller that ever split them would have
read it exactly backwards.

**A scan that could not read what it enumerated REFUSES (exit 2).** All-mode
lists its roots (`test/fixtures`, `test` and `src`) first and reads each file
afterwards, so a file can be deleted inside that window. `tsup` writes
`tsup.config.bundled_<hash>.mjs` and removes it when a build ends, and
`test/docs-content.test.ts` runs a build from inside the suite while this
scanner sweeps from another worker, so the two really do race.

**No CI or publish run in this repo is reachable through that window today, and
the reason is scope, not design.** The transient lands at the repo root, which is
outside every walk root, so it is never enumerated here. `@cosyte/ccda`, whose
walk starts at the repo root, is the sibling that took the hit: an entire
publish-time sweep refused. Nothing gitignores that filename here either, so
**widening a walk root, or any tool that drops a transient under one,
reintroduces it verbatim.** A narrower case is already live on a developer box,
and it is a class rather than one filename: `.gitignore` covers `*.swp` and
`*.swo` and **nothing else of the kind**, so editor and atomic-save transients
create and remove un-ignored files inside a walk root. Verified un-ignored here:
`src/index.ts~`, `src/.index.ts.swn`, `src/#index.ts#`,
`src/index.ts___jb_tmp___`, `src/.goutputstream-abc123`, `src/4913`, and
`.tmp` / `.orig` / `.bak` beside a source file.

The refusal was right and the enumeration was wrong, so exactly one case is
tolerated: a file the walk enumerated **itself** that git does **not track** and
that fails with `ENOENT`. It is reported on stderr as skipped, never dropped
silently. A **tracked** file (the committed corpus is what the gate promises to
have observed), any non-`ENOENT` failure (`EACCES`, `EISDIR`: a scan that
failed, not a file that went away), a file that is back on disk when the sweep
ends, a `git` that cannot say what is tracked, and a tracked set that comes back
empty all still refuse. All-mode also refuses outright if it ended up observing
no files at all; **that rule is now PER-ROOT and the sentence is kept as the
special case it became, not as the whole rule** (see "The observation rule is
per-root" below). Pre-commit (`--staged`) reads blobs from the git index, so it
never depends on any of this. The clean stdout line is **qualified** whenever a
file was skipped (`OK: no hits (N untracked file(s) skipped, see stderr)`), so a
reader watching stdout alone cannot take an unqualified OK from an incomplete
sweep.

**Residual:** the post-sweep re-check is keyed on the enumerated path, not on
content, so the class is content that survives at a path the walk did not
enumerate: an untracked file _renamed_ inside the window is the obvious
instance, a hard link plus an unlink the other. It is bounded, because
committing such a file means `git add`, after which it is tracked and
untolerable, and `--staged` reports the hit from the index even with the file
deleted from disk. Closing it needs a content-addressed sweep, a different
design rather than a wider bound.

**An in-scope entry that is not a regular file REFUSES the scan (exit 2), on
both routes.** It is never silently skipped, because both enumerating routes
were blind to it in a way that read as clean. The walk enumerates
`Dirent.isFile()`, an lstat answer, so a symbolic link is neither a file nor a
directory and fell out of the loop; `isDirectory()` answers false for a linked
directory too, so a whole subtree left with it. `--staged` reads content with
`git show :path`, and git stores a link as its **target path** under mode
`120000`, so that route was handed the path text and never the target's bytes.
Measured before the fix: a link under a walk root pointing at a PHI-bearing file
scanned clean on **both**.

Neither route is made to follow a link. Following would read bytes the
enumeration does not control (outside the repo, a loop, a device, a FIFO that
blocks the gate forever), and git does not carry those bytes anyway, so a hit on
them would be a claim about something no commit contains. Refusing states the
only true thing available: there is an entry here the scan cannot account for,
so the scan is not clean. `--staged` reads `git diff --cached --raw -z` with
`--no-renames --diff-filter=AMTUB` so the destination mode is visible; the `T` is
load-bearing, because replacing a **tracked** regular file with a link is neither
an add nor a modify and `AM` deleted the record before any mode could be read.

A refusal names the entry's own repo-relative path and an engine-owned kind
token. **It never reports the link target**, which is working-tree text that can
itself carry PHI.

"In scope" is each route's own pre-existing boundary, not a new one: the walk
still excludes a gitignored entry (the same rule that already excludes a
gitignored file), and `--staged` looks at `test/fixtures/**`, `test/**`
(markdown excluded, copying `walk()`'s own rule) and `src/**.ts` plus each root's
own path. The root's-own-path part IS an addition to the path scope: an index
entry at exactly `test/fixtures`, `test` or `src` is never a directory, so it is
a scan root replaced by a blob, a link or a gitlink, and the prefix test alone
let it through (measured, exit 0 on each). The clause list is a **union** and no
clause was narrowed, so markdown under `test/fixtures/` is still enumerated on
this route exactly as it was.

**A regular blob staged at exactly the fixture root got only the shape floor, and
`--staged` is the pre-commit hook.** `looksLikeHl7` keyed on the
`test/fixtures/` prefix or an `.hl7` suffix and the root's own path has neither,
so the scope and the mode check passed the blob through and the **detector gate**
dropped it. Measured twice independently: the same payload gives six
segment-aware hits at `test/fixtures/<name>.hl7` and exit **0** at
`test/fixtures`, over a live `PID-3`/`PID-5`/`PID-7`/`PID-11`/`PID-13`; a dashed
SSN in the same blob exits 1 either way. So the floor held and only the
segment-aware tier was missing, which is why the fix is one clause and not a new
rule. Note the mechanism differs from the sibling shape where the blob was
outside the _read_ set: here it was read and then mis-classified.

**Consequences worth knowing before you port this**, both measured here: a FIFO
under a walk root used to be skipped and now refuses, and an SSN or email shape
in a link's target _path_ used to fire on the shape pass under `test/fixtures/`
and now never runs, because the entry is refused before anything is read. Both
are the intended trade: a refusal that names the entry is a better answer than a
hit that describes a filename.

**`-B` IS NOT INERT, AND THIS FILE'S SOURCE ASSERTED THAT IT WAS.** That was the
permissive half of a "do not add these flags" paragraph, so it told the next
porter that injecting `-B` was safe. The mechanism is sharper than "a `B` record
the filter drops": under `-B` a complete rewrite prints
`:100644 100644 <sha> <sha> M<score> <path>`: status letter **`M`**, one path, a
break score the raw-record regex parses happily. **No digits are quoted, on
purpose** -- the score moves with how much of the old content survives (0 lines
kept reads `M100`, 1 reads `M099`), so a number copied from one repo's fixture is
wrong in the next. The **letter** is the load-bearing part. But `--diff-filter` classifies a
broken pair as **`B`** whatever letter it prints, so `AMTU` deletes the record
before anything sees it. Measured on one index, three ways:
`--diff-filter=AMTU` returns empty, `--diff-filter=B` and `--diff-filter=AMTUB`
each return the record; through the scanner, the shipped argv exits **1** on a
staged dashed SSN in a wholly rewritten in-scope file and the same argv plus
`-B` prints `OK: no hits` and exits **0**. `B` is now in the filter, which costs
the enumeration nothing (git cannot emit a broken pair without `-B`) and stops
the flag being a silent blindfold if it is ever added. **The pin that let the
false claim survive was a pin on a RENAME**, the one shape `-B` really does leave
alone: a case that cannot fail proves nothing.

**A staged RENAME used to bypass `--staged` entirely, and `--no-renames` closes
it with no stride work at all.** Rename detection is on by default and the status
filter returns neither `R` nor `C`, so `git mv <link> test/fixtures/<name>` staged
as `:120000 120000 <sha> <sha> R100` with **two** paths and the filter deleted the
record outright: an ordinary `git mv` put a mode-`120000` entry under a scan root
and the route printed `OK: no hits` (measured, exit 0). A rename that also
**substitutes a real name** into the moved file passed the same way (measured at
`R098`, mode `100644`, a real-looking surname in the staged blob). The earlier
reading of this gap said closing it needed the two-path record shape handled and a
scope decision. **That reading was wrong.** Turning detection off makes the
destination arrive as an ordinary single-path `A` and the source a `D` the filter
drops, which needs no new record shape and no new scope. Verified under
`diff.renames=true|copies|false|1` and `diff.renameLimit=1`: every one yields the
same single-path `A`, so the two-field stride is **structural** rather than
conditional on the caller's git config, and the new enumeration contains the
previous one: equal whenever nothing is renamed or copied, larger only when
something is.

**An UNMERGED path is now refused rather than passed over.** `U` was returned by
neither `AM` nor `AMT`, so a conflicted in-scope path made the route print
`OK: no hits` over an index it structurally cannot read (measured, exit 0, with a
real-looking surname in one of the stages). Such a path is recorded at one or
more of stages 1/2/3 and never at stage 0, so `git show :path` fails outright and
there is no one staged blob to scan. **Which** of the three are present varies by
conflict shape and is not worth asserting: a modify/delete leaves stages 1 and 2,
its mirror leaves 1 and 3, and a rename/rename can leave a single stage. The
`never at stage 0` half is the load-bearing one, and it holds in every shape
measured. Be precise about the bound: **git itself refuses to commit
while a path is unmerged**, so this was never a route to a committed leak. What it
was is the gate attesting clean over a state it never observed, and
`pnpm phi-scan --staged` is run by hand and from scripts as well as from the hook.
`U` carries a single path like `A`/`M`/`T`, so admitting it costs the stride
nothing, and it is refused with its own message: a `U` record's destination mode
is `000000`, and the mode refusal's sentence about `git show` handing back a
target path is false for an unmerged regular file.

**One pre-existing scope limit is UNCHANGED and named so it is not confused with
the refusals above.** It was measured.

- **Working tree only.** A tracked file absent from the worktree is never
  enumerated in all-mode, so it is skipped rather than refused: the tracked-file
  refusal governs a file the walk did list and then could not read, not one it
  never saw. `--staged` catches such a file when it is **added**, so that
  coverage is at add time and past tense: once it is committed and removed from
  the worktree, both routes report clean. Do not read the refusal above as
  closing this one.

Widening the walk to close either one is a separate piece of work, and neither
is a reason to soften anything above.

### The observation rule is per-root

**All-mode refuses (exit 2) unless EVERY declared root yielded at least one file
that was actually READ**, and the refusal names the starved roots. It used to
refuse only on zero files **in total**, which any one surviving file satisfied,
so a single `src/` module vouched for the entire fixture corpus and one fixture
vouched for the whole of `src`. Measured before the change, three ways, each
printing `[phi-scan] OK: no hits` at exit **0**: `test/fixtures` moved aside,
`test/fixtures` replaced by a **dangling symlink**, and `src` moved aside. The
first two leave all 106 non-markdown fixtures unread; the third leaves all 95
source files unread.

**The dangling case is the sharpest, and it is the one to carry when porting
this.** `existsSync` **follows** the link and answers false, so `walk()` returns
before `readdirSync` and the not-a-regular-file refusal never fires: that rule
only ever classifies entries found **inside** a root, and this is the root
itself. Absent, dangling and empty are one state to the walk. This reporter
prints no file count, so there is not even a suspicious denominator to notice;
a sibling that does print one reported a plausible-looking number instead.

**Since `test` became a root, the dangling case is reachable on `src` and `test`
but no longer on `test/fixtures`,** and the reason is worth porting because it is
the general rule: the fixture root is now an **entry inside** a walked root, so a
link there is classified by `Dirent.isSymbolicLink()` and refused by name before
this rule is consulted. Same exit code, a better message, a different rule. A
root whose parent nothing walks (here `src` and `test`, whose parent is the repo
root) is still the case this rule alone covers.

Observing nothing at all is the **all-starved case of this one rule**, not a
second rule beside it. `--staged` and named-path mode enumerate no root, so
neither makes a per-root promise and neither is subject to it.

**Its granularity is the declared root and nothing finer**, which is a real
bound. Three states still exit 0, each measured with the rule in place and each
pinned by a characterization test: a directory missing from **inside** a root
(`mv test/fixtures/canonical ..` still prints `OK: no hits`); a root **with no
walked parent** that is itself a symlink, which is followed, so the rule is
satisfied by whatever is on the other side of it (measured on `src`;
`test/fixtures` now refuses, see above); and the rule is a **floor of one**
file.

**All three are statements about the WALK, and that is now less than all of a
sweep**: the bytes git carries at a tracked path are read whatever state the
working tree is in, so a violator in any of the three exits 1. What each one
still costs is untracked content in that state, and the fact that the sweep
reports 0 rather than refusing. See the next section.

**One shape often listed beside those is NOT open here, and porting it in as
though it were would be wrong.** A root that is a **regular file**, or a link to
one, refuses at exit **2**, not the **1** this gate reserves for hits: `walk()`
already wraps `readdirSync` in a `try` and rethrows the `ENOTDIR` as an
invocation error on the scanner's own channel, and there is a process-level
backstop besides. Measured both ways.

**And one worry that looks real and is not.** Allow-fixturing the last file
under a root cannot starve it: `parseArgs` seeds the positional path set from
the `--allow-fixture` paths when no path is given, so the flag always resolves
to **paths** mode and never to all-mode. Measured on a throwaway repo holding
exactly one violator: exit 0 under this rule and exit 0 under the superseded
one, identically. Do not add a guard for it.

### The sweep reads the bytes git carries, not only the working tree

**All mode reads every path in the git index as well as walking the working
tree.** The two routes are a **union**: no walk root was narrowed, no clause was
dropped, and a file the walk reads is still read from disk with exactly the
tiers it had. The mechanism is written down in exactly one place, at
`buildTargetsForIndex` in `scripts/phi-scan.ts`; what follows is the property,
not a second copy of the mechanism.

**Why: a reconciliation that compares path SETS is satisfied by decoy content.**
A walk root swapped for a directory that mirrors the tracked names, over clean
files, leaves every root yielding and every tracked path accounted for while the
committed corpus goes unopened. Measured before this change, exit **0** with
`OK: no hits`. Reading the index blob is the only answer that does not depend on
the working tree being honest.

**What that closed here: EIGHT states, each one measured on the base commit and
each pinned by a case in `test/scripts/phi-scan.test.ts`.** Every one of the
eight printed `OK: no hits` at exit **0** before this change. The count is
derived from that list and is the same count in the changeset and the commit;
three different censuses of one slice is how a number goes wrong.

1. **A walk root swapped for a decoy directory** mirroring the tracked names
   over clean files. Now exit 1.
2. **A single file replaced by a clean decoy** over PHI-bearing index bytes. Now
   exit 1, and a hit whose bytes are not the bytes on disk says so, because the
   remedy there includes re-staging.
3. **A message under an undeclared top-level directory.** The walk roots are
   three names, so anything outside them was invisible to it, and the
   pre-commit route has its own prefix list. That is how **three real HL7 v2
   messages under `examples/data/` had never been read by either route**: two of
   them carried a date of birth, a street address and person-name tokens that
   were in no allow-list. They are declared in `scripts/phi-allow-list.txt` now,
   which is the reviewed act that gate is for. A new directory's **committed
   bytes** are in scope the moment git tracks something in it, with nobody
   having to remember to declare it. For a file that is not itself a message
   that buys the dashed-SSN and non-test-email floor and nothing else: widening
   the scope and widening the recogniser are two different changes.
4. **A tracked file absent from the working tree**, which the walk records as a
   pre-existing limit. It is read from the index instead of skipped. Now exit 1.
5. **PHI behind a walk root that is itself a symlink.** That root is followed
   and the per-root rule is satisfied by whatever is on the other side of it,
   which is unchanged; the tracked corpus behind it is read anyway. Now exit 1.
6. **A tracked symlink or gitlink outside every walk root.** The walk classifies
   entries _inside_ a root, so such an entry was reached by neither route.
   Refused by mode (exit 2), and the refusal names the entry and never what is
   on the other side of it.
7. **An unmerged index entry**, refused in all mode (exit 2) the way the
   pre-commit route already refused it, with that route's mechanism sentence
   corrected rather than copied: this one reads by object id, not by
   `git show :<path>`.
8. **An empty index**, which is not a clean corpus but no corpus: every check
   against what git carries would pass vacuously, and an empty tracked set is
   also the one state in which the tracked-file bound stops existing. Refused
   (exit 2). This replaces a quieter fail-closed branch that switched one
   tolerance off and let the sweep report a verdict anyway.

**A refusal still prints what the walk already found.** Cases 6, 7 and 8 refuse
the whole sweep, and the walk may have found PHI under a root that yielded
perfectly well; those hits are printed before the refusal, and the exit code is
still 2, because an incomplete sweep is not a verdict whatever it found on the
way. The first draft of this route printed the refusal alone, which was
**worse** than the base commit for that input (exit 1 with five hits on base,
exit 2 and silence here). Pinned by its own cases.

**What it deliberately does not do**, so nobody reads a bigger claim than the
code makes:

- **It does not credit a scan root.** The per-root observation rule stays a
  statement about the walk: a root emptied on disk still refuses, even though
  every file under it was just read out of the index. Letting the second rule
  satisfy the first would retire a trap that is already paid for.
- **It does not widen `--staged`.** What the pre-commit route enumerates decides
  what a commit is **blocked** on, which is a hook decision and a separate one.
  So a violator staged outside the hook's prefix list is caught by all mode and
  not by `--staged`, and that gap is pinned by a case rather than left as a
  claim.
- **It is detective, not preventive**, like every other route here: it fires
  after the write lands. It guarantees PHI is never carried silently, not that
  it never touched the disk.
- **Markdown is excluded**, copied from the walk rather than invented, because a
  README or this log legitimately describes a violator value. It is the one
  reason an index entry goes unread, and it is pinned by a case.
- **Gitignore is not consulted here**, unlike the walk. A tracked file that also
  matches an ignore rule is still content git carries.

**The residual, measured rather than reasoned, because the first draft of this
paragraph was narrower than the code: WORKING-TREE BYTES AT A PATH OUTSIDE EVERY
WALK ROOT ARE READ BY NEITHER ROUTE, whether or not git tracks the path.** The
walk reads three declared roots; this route reads what the index carries; the two
miss the same place from opposite sides. Measured: PHI added to a **tracked**
`examples/data/*.hl7` and left unstaged prints `OK: no hits` at exit 0, while the
identical edit under `test/fixtures/` exits 1 because the walk reads it off disk.
An untracked file out there is not read at all. Both halves are base-identical,
so nothing regressed; what is new is that the claim is written down. Closing it
means enumerating the untracked working tree repo-wide, a third enumeration with
its own refusal semantics, and it is not this.

**Before porting any of this: derive, do not copy.** Each sibling phrases and
exits differently, this repo's exit codes are its own (a walk root that is a
regular file exits **2** here and **1** in at least one sibling), and the
`--staged` scope question is a per-repo hook decision. What ports cleanly is the
shape: read the bytes git carries, compare them against what the walk read, and
refuse rather than report when the index cannot be read at all.

**Two conditions do not fire here and will fire in a sibling**, both found by
review rather than by a run in this repo, which is why they are written down.
**EOL normalization makes every file diverge**: with `.gitattributes` setting
`eol=crlf`, or `core.autocrlf=true`, the blob and the working-tree file differ on
every text file, so the byte comparison skips nothing, every file is scanned
twice, every count doubles, and each hit is repeated with a re-staging remedy for
a file `git status` calls unmodified. It is fail-safe in direction (a duplicate
finding, never a miss), and it must **not** be fixed by normalizing before the
comparison, which would skip a decoy that differs only in line endings. **And a
gitlink refuses the sweep permanently**: a mode-160000 entry anywhere in the
index is refused, so a repo with a real submodule cannot take this route
unmodified. Both are decisions to make on the way in, not lines to copy.

## Format

Each entry is a markdown subsection:

```
### <path>

- **Date:** <YYYY-MM-DD>
- **Reason:** <one-line justification>
- **Approved by:** <committer name>
- **Expires:** <YYYY-MM-DD or "permanent">
```

## Entries

(none yet)
