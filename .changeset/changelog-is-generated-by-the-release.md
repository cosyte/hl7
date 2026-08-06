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
replaced by an accurate one, and the `[Unreleased]` heading and its five empty section stubs
removed. Nothing else in the history was reworded or re-sorted: the file never recorded which
release each entry went out in, and the text is already on disk in published copies, so it is
left as it was written.

Pinned by `test/scripts/changelog-generation.test.ts`, which runs the real `changeset version`
against the real `CHANGELOG.md` and the real config in a throwaway package rather than
reimplementing where the tool inserts text. Seven of its nine cases are red against the previous
state. It carries two controls: the same inputs with `"changelog": false` must write no version
heading at all, so the flag is proved load-bearing rather than incidental; and the old file shape
must reproduce the split header, so the one-line rule is demonstrated rather than asserted.

`CONTRIBUTING.md` and `.changeset/README.md` said to add the entry to `CHANGELOG.md` by hand and
now say to write it in the changeset. No runtime code, no public API, no warning code and no
parse behaviour changed.
