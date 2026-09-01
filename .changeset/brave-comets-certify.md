---
"@cosyte/hl7": patch
---

Tooling: the pending release queue and the public export surface are now checked rather than assumed.

The version a release lands on is decided by the strongest bump type in `.changeset/`, and nothing read those frontmatter lines at review time. Every pending declaration in this repository asked for `patch`, because the contributor guidance told every contributor to pick `patch` on the `0.0.x`-until-first-alpha ladder, so a queue that includes five new typed builders, conformance condition predicates, coding-system bindings, profile levels, component rules and a re-sourced message-structure registry could not resolve to anything but another `0.0.x`. A published version number cannot be recalled, which makes "we thought that one was a patch" unrecoverable rather than merely wrong.

`scripts/release-readiness.ts` reads the checkout alone and reports every pending declaration with the bump type it carries, the strongest bump in the queue and the version that resolves to, and it refuses rather than guesses: frontmatter it cannot parse, a declaration for another package, a bump type outside the published three, a file declaring the package twice or not at all, and a file the committed readiness record never classified are each named with their defect instead of skipped. An empty queue is reported as nothing to release rather than as a clean one, and a `major` is never certified, because a first stable release is a decision a human makes deliberately. The arithmetic is cross-checked against the real `changeset version` over a throwaway copy of the checkout, so the check cannot drift from the tool it describes.

`scripts/api-surface.ts` writes down what `dist/index.d.ts` exports, one entry per name with its kind, its printed type and its members, and compares a fresh build against the committed inventory. Nothing else in this repository fails when an export leaves the bundle, changes shape or arrives unannounced. It never rewrites its own baseline on a mismatch, because a check that heals itself always passes and therefore measures nothing, and it never reports an empty surface as a match: absent, empty or export-less declarations are a missing input, not a verdict, which is the same window `scripts/attw.mjs` was built to refuse.

The contributor guidance no longer instructs patch-only changesets. A change that adds behaviour takes a `minor` and a change that corrects behaviour takes a `patch`.
