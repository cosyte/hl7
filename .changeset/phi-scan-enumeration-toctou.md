---
"@cosyte/hl7": patch
---

The PHI scan no longer refuses an entire sweep when a build tool's transient file vanishes before it
can be read; that one file is skipped and reported instead, and everything else still refuses.

Exactly one case is tolerated, and its bounds are exact: a file the scan enumerated itself, that
`git` does not track, whose read then fails with `ENOENT`. It is reported on stderr as skipped,
never dropped silently. The gate did not get weaker, it got narrower.

The scanner lists its roots in all-mode and reads each file afterwards. A file deleted inside that
window made the read throw `ENOENT`, and the whole sweep refused with exit 2. In a sibling package
whose scan starts at the repository root that is exactly what happened: `tsup` writes
`tsup.config.bundled_<hash>.mjs` there and removes it when a build ends, and the refusal failed a
publish.

**No CI or publish run in this package was reachable through that window, so this is hardening
rather than the repair of a live defect here.** Its scan is rooted at `test/fixtures` and `src`, and
the transient lands at the repository root, outside both. That is scope, not design: nothing ignores
that filename here, the test suite already runs a build in one worker while another sweeps the tree,
and widening a scan root for any reason brings the problem back. A narrower case was already live on
a developer machine, and it is a class rather than one filename: the ignore rules cover `*.swp` and
`*.swo` and nothing else of the kind, so editor and atomic-save transients (`*~`, `#file#`,
`.goutputstream-*`, `*.tmp`, `*.orig`, `*.bak`) create and remove un-ignored files inside a scan
root.

**The refusal was correct; the enumeration was unsound.** Refusing a scan it could not complete is
the property that makes this gate worth having, and it is untouched. What changed is that the
enumeration no longer admits a file that may not survive to the read, and the single tolerated case
stated above is the whole of the exception.

The clean line on stdout is qualified to match, reading
`OK: no hits (N untracked file(s) skipped, see stderr)` whenever the sweep skipped a file, so a log
reader watching stdout alone cannot take an unqualified OK from a sweep that did not observe
everything it enumerated. A fully clean sweep still prints the bare line.

Everything else still refuses. Five of the six bounds are pinned by a test, and which five is
measured rather than asserted:

- a **tracked** file that cannot be read, because the committed corpus is what the gate promises to
  have observed (pinned);
- any **non-`ENOENT`** failure, because `EACCES` or `EISDIR` is a scan that failed, not a file that
  went away (pinned);
- a `git` that cannot report the tracked set, which switches the tolerance off rather than guessing
  (pinned);
- a tracked set that comes back **empty**, which would make every file untracked and is the one
  state in which the tracked-file bound stops existing (pinned);
- an all-mode sweep that **observed no files at all**, so the tolerance can never decay into a clean
  report of a tree nothing was read from (pinned);
- a tolerated file that is **back on disk** when the sweep ends, because then the sweep skipped
  something that exists (**unpinned**).

Why that last one is unpinned, stated rather than glossed: the scanner calls `git` only before the
first read, so there is no deterministic hook after the reads, and driving the branch would need a
load-sensitive sleep in a suite guarding a load-dependent race. Losing it would cost the re-check,
never the tolerance's bounds. Unpinned is not unverified, though: an adversarial review drove that
branch by hand against a deliberately slowed sweep and it refused correctly.

The other tests reach that window without a sleep and without a real build. The scanner runs `git`
between the walk and the first read, so a `git` shim placed first on `PATH` is a deterministic hook
into exactly the gap. Each case runs against a throwaway git repository, so no decoy file is ever
written into this one. The pre-commit path (`--staged`) reads blobs from the git index and never
depended on any of this.

One residual is stated rather than hidden: the post-sweep re-check is keyed on the enumerated path,
not on content, so the class is content that survives at a path the walk did not enumerate. An
untracked file **renamed** inside the window is the obvious instance and goes unscanned under a
clean report; a hard link followed by an unlink is the other. It is bounded, since committing such a
file means `git add`, after which it is tracked and untolerable, and pre-commit reports the hit from
the index even with the file deleted from disk. Closing it needs a content-addressed sweep, which is
a different design rather than a wider bound.

Two pre-existing scope limits of the scan are now written down, unchanged, so they are not confused
with the window above. **The pre-commit path is a compensating control for neither, and saying
otherwise would be the more comfortable claim.**

- It enumerates **regular files only**, so a symlink under a scan root pointing at a file carrying
  real-looking data is not scanned.
- Git stores a symlink as its target string, so the pre-commit path reads the path text rather than
  the pointed-to bytes. Both routes report clean.
- It reads the **working tree only**. A tracked file absent from the worktree is never enumerated.
  The pre-commit path catches such a file when it is added, so that coverage is at add time.

Widening the scan to close either is separate work, and neither is a reason to soften the refusal
above.
