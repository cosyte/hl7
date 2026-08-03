---
"@cosyte/hl7": patch
---

The PHI commit-gate no longer reads a symbolic link as clean. A link under a scan root pointing at a
PHI-bearing file used to pass the gate on **both** of the scanner's enumerating routes, so it passed
twice over. Reproduced before the fix, in a throwaway repository, with a synthetic name-bearing HL7
message placed outside the walk roots and a link to it at `test/fixtures/leak.hl7`: all-mode printed
`OK: no hits` and exited 0, `--staged` after `git add` did the same, and naming the target file
explicitly exited 1 with seven hits (`PID-5` twice, `PID-7`, `PID-11`, `PID-3`, and the shape
pass's `(ssn)` and `(email)`). The payload was always detectable; the two routes never looked at
it.

Two mechanisms, and both were blind in a way that reads as green.

- The walk enumerates `Dirent.isFile()`, which is an lstat answer, so a link is neither a file nor a
  directory and fell out of the loop silently, whatever it pointed at. `isDirectory()` answers false
  for a **linked directory** too, so a whole subtree left the same way.
- `--staged` reads content with `git show :<path>`, and git stores a link as its **target path**
  under mode `120000`, so that route was handed the path text and never the target's bytes. That
  route is this package's pre-commit hook.

**Neither route is made to follow the link.** Following would read bytes the enumeration does not
control (outside the repository, a loop, a device, a FIFO that blocks the gate forever), and git does
not carry those bytes anyway, so a hit on them would be a claim about something no commit contains.
The enumeration is narrowed instead: an in-scope entry that is not a regular file **refuses the
scan** (exit 2), naming every offender rather than the first, because a developer who has to re-run
the gate once per link learns to distrust it. The `--staged` route now reads
`git diff --cached --raw -z` so the destination mode is visible, and refuses `120000` and `160000`.
An unparseable `--raw` record refuses too, rather than scanning a list that may be short.

**The status filter is `AMT`, and the `T` is load-bearing.** Replacing a *tracked* regular file with
a link is neither an add nor a modify: git raises it as a typechange
(`:100644 120000 <sha> <sha> T`), so the previous `--diff-filter=AM` deleted the record before any
mode could be read, and the mode check would have been unreachable for exactly the files this
repository already tracks. Measured: with `AM` the raw output for that stage is empty. Admitting `T`
also scans the reverse typechange, a link replaced by a real file carrying PHI, as the file it
became.

**A refusal names the entry's own repository-relative path and an engine-owned kind token, never the
link target.** A target path is working-tree text and can itself carry identifying information, so it
is never echoed. The scanner's docblock states the risky target shape in the abstract rather than
showing one, because a diagnostic about a leak is itself a surface for one, and that applies to the
prose explaining it.

**Two behaviour changes fall out of the same narrowing, and both are the intended trade.** A FIFO
under a walk root used to be skipped and now refuses, named as `a FIFO`. And an SSN or email shape
sitting in a link's target *path* used to fire on the shape pass under `test/fixtures/` and now
never runs, because the entry is refused before anything is read. A refusal that names the entry is
a better answer than a hit that only describes a filename.

**Scope, stated so it is not read as wider than it is.** `R` (rename) and `C` (copy) are still not
enumerated by `--staged` at all, so a staged rename that appends PHI passes that route; admitting
them needs the two-path `--raw` record shape handled, which is a separate decision. If such a record
ever reached the parser the field stride would desync and it refuses, which is the safe outcome.
`--staged`'s path scope is unchanged (`test/fixtures/**` and `src/**.ts`), and the walk's gitignore
exemption is unchanged: an ignored link is out of scope by the same rule that already excludes an
ignored file, though an entry already in the index cannot be excused that way. A tracked file absent
from the worktree is still caught at `git add` time only. The enumerate-then-read tolerance and the
rule that refuses a sweep which observed nothing are untouched.

Pinned by 19 cases in `test/scripts/phi-scan.test.ts`, 8 of them red before the fix, every one
against a throwaway git repository so no link and no violator is ever written into the committed
corpus. The payload is name-bearing and the link target's own filename carries a name, so the
"never echo the target" assertions are not vacuous.

No runtime or API change. This is a repository gate only.
