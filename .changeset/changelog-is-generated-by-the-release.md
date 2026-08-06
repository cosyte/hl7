---
"@cosyte/hl7": patch
---

`CHANGELOG.md`, which ships inside the tarball, is now written by the release instead of by hand, so it stops describing already-published code as unreleased.

`.changeset/config.json` set `"changelog": false`, so no release ever wrote a version heading
into `CHANGELOG.md` and nothing ever rolled `[Unreleased]` over. Every published version of this
package therefore carried a changelog with **no version headings at all**: one `[Unreleased]`
heading over the whole history, and a preamble stating that the first pre-alpha release "will
ship" the API surface listed below it, in a tarball that had shipped that surface several
versions earlier. `CHANGELOG.md` is listed in `package.json` `files`, so this was text on the
disk of everyone who installed the package, not internal bookkeeping.

**The flag is what changed, not the prose.** Correcting the sentence by hand would have left the
mechanism that wrote it, and the next release would have drifted the same way. `changelog` now
names the generator that ships with Changesets, so a release writes its own version heading and
its own entry from the changesets it consumed, and **the changeset summary is now the changelog
entry**. Nothing new is depended on: the generator is an entry point of `@changesets/cli`, which
was already a dev dependency.

**The file's shape changed with it, deliberately.** Changesets prepends a release by replacing
the first newline in the file, so exactly one line can sit above generated output. The
hand-written preamble sat on line 3, which means a release would have inserted itself between the
heading and the preamble and split the header in two. The hand-maintained history has therefore
moved under a `## Released before this file was generated` heading, with the false preamble
replaced by an accurate one. Three pieces of hand-workflow scaffolding were dropped and no entry
was reworded: the `[Unreleased]` heading, its link definition at the foot of the file, and the
five empty section stubs waiting for the next hand-written entry. The history itself is left as
it was written rather than re-sorted into version sections, because the file never recorded which
release each entry went out in and the text is already on disk in published copies.

Pinned by `test/scripts/changelog-generation.test.ts`, which runs the real `changeset version`
against the real `CHANGELOG.md` and the real config in a throwaway package rather than
reimplementing where the tool inserts text. Seven of its nine cases are red against the previous
state. **The rule it enforces is that nothing but the H1 sits above the first heading, and it is
asserted on the released document as well as the committed one**: a rule phrased as "the archive
heading comes second" holds only until the first release writes its own version heading there,
which would have redded the first Version PR this configuration ever opened. The archived history
is asserted byte identical across a release, so the run exercises this repo's own Prettier rather
than the one Changesets bundles as a fallback. Two further controls: the same inputs with
`"changelog": false` must write no version heading at all, so the flag is proved load-bearing
rather than incidental; and the old file shape must reproduce the split header, so the rule is
demonstrated rather than asserted.

One upstream behaviour is worth knowing before debugging a release, and is recorded in that
file: Changesets wraps the changelog write in a try/catch that only warns. A tree whose declared
Prettier config cannot be resolved bumps the version, consumes the changeset, and writes no
changelog at all. Reproduced here on this repo's inputs. A release that publishes with an
unchanged changelog is that failure, not a setting that quietly reverted.

`CONTRIBUTING.md` and `.changeset/README.md` said to add the entry to `CHANGELOG.md` by hand and
now say to write it in the changeset. No runtime code, no public API, no warning code and no
parse behaviour changed.
