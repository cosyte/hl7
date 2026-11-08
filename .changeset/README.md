# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **publish**, and the **release section in `CHANGELOG.md`**: a release
writes its own version heading there from the changesets it consumed. So **the changeset summary
is the changelog entry**. Write it there and do not hand-edit `CHANGELOG.md`, whose sections above
`## Released before this file was generated` are generated output.

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

Pick **patch**. On the 0.1 line a minor or major release is a maintainer's decision, taken before
the changeset is written, so a change that ADDS behavior a consumer can call is still a patch, and
its summary says what the consumer gains. `pnpm tsx scripts/release-readiness.ts` reports what the
pending queue resolves to.
