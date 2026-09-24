---
"@cosyte/hl7": patch
---

**Repository tooling only. Nothing about the published package changed.** The release step that writes the new version into the exported `VERSION` constant, and the step that builds the two documentation archives the docs site reads, now run the shared implementations published in `@cosyte/process` instead of this repository's own copies of them. Both copies are deleted. The files, the exports, the API and the types are untouched, and `dependencies` stays empty: `@cosyte/process` is a devDependency pinned to an exact version, so nothing here reaches your install. This change reaches the registry only as this changelog entry in the next release.

**What a release writes is unchanged, and that was measured before the swap rather than asserted after it.** Every input of a version-sync corpus (a missing, empty or non-string version, a renamed declaration, a second declaration inside a comment, a declaration with a trailing comment, a version carrying replacement patterns such as `$&`, an already-synced tree, and a plain write) was run through the old script and the shared one before the old one was deleted: the same accept or refuse on every input, and the same resulting bytes on every accept. The two documentation archives built over this tree carry the same files as before; the only difference is that the shared build writes no directory entries.

**`pnpm pack:docs` now needs `pnpm install` first**, because the shared build is reached through an installed package. The release pipeline installs before it runs either step, so a release is unaffected.
