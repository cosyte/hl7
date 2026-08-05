---
"@cosyte/hl7": patch
---

Repository PHI commit-gate only, with no runtime impact: the gate no longer reports a clean sweep over a scan root it never opened, where an absent or dangling `test/fixtures` used to print `OK: no hits` and exit 0 on the strength of `src/` alone.

`pnpm phi-scan` with no arguments is what CI runs. It walks two roots, `test/fixtures` and `src`,
and refused a sweep only when it had read **zero files in total**. That global rule is satisfied by
any one surviving file, so a single `src/` module vouched for the entire fixture corpus, and one
fixture vouched for the whole of `src`.

Reproduced before the fix, on this checkout, three ways, each printing `[phi-scan] OK: no hits` and
exiting **0**: with `test/fixtures` moved aside, with `test/fixtures` replaced by a **dangling
symlink**, and with `src` moved aside. The first two leave all 106 non-markdown fixtures unread;
the third leaves all 95 source files unread.

**The dangling case is the sharpest, and nothing else in the scanner can see it.** `existsSync`
**follows** the link and answers false, so `walk()` returns before `readdirSync` and the
not-a-regular-file refusal never fires. That rule only ever classifies entries found INSIDE a root,
and this is the root itself, so absent, dangling and empty are one state to the walk. This reporter
prints no file count either, so unlike the sibling this remedy was ported from there was not even a
suspicious denominator to notice.

**The rule is now per-root.** All-mode refuses (exit 2) unless every declared root yielded at least
one file that was actually READ, and the refusal names the starved roots. Observing nothing at all
is the all-starved case of that one rule rather than a second rule beside it, so the existing
wording carries. Hits found under the roots that DID yield are printed before the refusal, so an
incomplete sweep never swallows a real finding, and the exit code is still 2 regardless.

**Deliberately unchanged, and pinned:** `--staged` and named-path mode make no per-root promise,
because neither enumerates a root. `--staged` legitimately has nothing to scan when a commit
touches only markdown, and named-path mode is bounded by the caller's argv. Widening the rule to
either was run as a mutation rather than argued: widening it to `--staged` reds 7 cases, and
dropping the mode guard altogether reds 29.

**The granularity is the declared root and nothing finer**, which is a real bound and is recorded
rather than glossed. Three states still exit 0, each measured with the rule in place, each now in
the scanner's limits list with the command that produced it, and each pinned by a characterization
test so a change that closed one would have to say so: a directory missing from INSIDE a root
(`mv test/fixtures/canonical ..` still prints `OK: no hits` with 27 fixtures unread); a root that
is ITSELF a symlink, which is followed, so the rule is satisfied by whatever is on the other side
of it; and the rule is a floor of ONE file, whatever the root used to hold.

One shape often listed beside those is NOT open here, and it is written down so it is not ported in
from elsewhere as though it were: a root that is a regular file, or a link to one, refuses at exit
**2**, not the **1** this gate reserves for hits. `walk()` already wraps `readdirSync` and rethrows
the `ENOTDIR` as an invocation error on the scanner's own channel, and an existing test pins it.

Twelve tests added, on a throwaway repository so no starved root, no dangling link and no violator
is ever written into the committed corpus. Five are red against the superseded global rule; the
all-starved case is green on both, because it asserts the new rule SUBSUMES the old one rather than
sitting beside it; three assert the rule did not widen; three are characterizations of the limits
above. The scratch-repo helper now seeds both walk roots, which is load-bearing rather than
tidiness: with an empty `test/fixtures` every case built on it would refuse before reaching what it
meant to assert.
