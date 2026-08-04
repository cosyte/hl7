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
`MSH|…` example string): it gets the conservative dashed-SSN + email pass only.

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
lists its roots (`test/fixtures` and `src`) first and reads each file
afterwards, so a file can be deleted inside that window. `tsup` writes
`tsup.config.bundled_<hash>.mjs` and removes it when a build ends, and
`test/docs-content.test.ts` runs a build from inside the suite while this
scanner sweeps from another worker, so the two really do race.

**No CI or publish run in this repo is reachable through that window today, and
the reason is scope, not design.** The transient lands at the repo root, which is
outside both walk roots, so it is never enumerated here. `@cosyte/ccda`, whose
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
no files at all. Pre-commit (`--staged`) reads blobs from the git index, so it
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
`--no-renames --diff-filter=AMTU` so the destination mode is visible; the `T` is
load-bearing, because replacing a **tracked** regular file with a link is neither
an add nor a modify and `AM` deleted the record before any mode could be read.

A refusal names the entry's own repo-relative path and an engine-owned kind
token. **It never reports the link target**, which is working-tree text that can
itself carry PHI.

"In scope" is each route's own pre-existing boundary, not a new one: the walk
still excludes a gitignored entry (the same rule that already excludes a
gitignored file), and `--staged` looks at `test/fixtures/**` and `src/**.ts`
plus each root's own path. That last part IS an addition to the path scope, and
it is the only one: an index entry at exactly `test/fixtures` or exactly `src`
is never a directory, so it is a scan root replaced by a blob, a link or a
gitlink, and the prefix test alone let it through (measured, exit 0 on both).

**Consequences worth knowing before you port this**, both measured here: a FIFO
under a walk root used to be skipped and now refuses, and an SSN or email shape
in a link's target _path_ used to fire on the shape pass under `test/fixtures/`
and now never runs, because the entry is refused before anything is read. Both
are the intended trade: a refusal that names the entry is a better answer than a
hit that describes a filename.

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
