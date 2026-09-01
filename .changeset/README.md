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

Pick the bump type the change earns: **minor** when it ADDS behaviour a consumer can call, **patch**
when it CORRECTS behaviour. Do not pick **major** without a deliberate decision to declare this API
stable, because below `1.0.0` that is what it resolves to. `pnpm tsx scripts/release-readiness.ts`
reports what the pending queue resolves to.
