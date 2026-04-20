# Customizing this starter kit

This template ships with placeholder identifiers (`{{YOUR_ORG}}`,
`{{PROFILE_NAME}}`, and the TypeScript export identifier `MyProfile`). Work
through the five steps below to turn it into your own profile package.

Each step ends with a **Verify** check you can run from the kit directory.

## 1. Rename

Replace the placeholders with your real values.

**Find/replace across the whole directory:**

- `{{YOUR_ORG}}` → your npm scope (e.g., `acmelab`)
- `{{PROFILE_NAME}}` → your profile name in lowercase-kebab
  (e.g., `acme-adt`)
- `MyProfile` → your PascalCase JS identifier for the exported const
  (e.g., `AcmeAdtProfile`)

**Files touched:** `package.json`, `src/index.ts`, `test/profile.test.ts`,
`README.md`, `LICENSE`, `CUSTOMIZING.md` (this file — leave it alone or
delete after reading).

Also update the `@cosyte/hl7-parser` entry under `devDependencies` in
`package.json`. The starter-kit default is `"file:../.."` so the kit can
build inside the parent `@cosyte/hl7-parser` repo; your downstream package
should pin a published version instead:

```json
"devDependencies": {
  "@cosyte/hl7-parser": "^0.1.0"
}
```

Also fill in `repository`, `homepage`, `bugs`, and `author` in
`package.json` if you intend to publish.

**Verify:**

```bash
grep -r "{{YOUR_ORG}}" src test package.json README.md LICENSE || echo "No placeholders remain"
pnpm install --no-frozen-lockfile
```

## 2. Swap the base profile

The sample extends `profiles.genericLab`. Change that to whichever
built-in best matches your integration — `profiles.epic`,
`profiles.cerner`, `profiles.meditech`, `profiles.athena`, or remove
the `extends` line entirely for a from-scratch profile.

Edit `src/index.ts`:

```ts
export const AcmeAdtProfile = defineProfile({
  // ...
  extends: profiles.epic, // was profiles.genericLab
  // ...
});
```

**Verify:**

```bash
pnpm typecheck
```

## 3. Define your Z-segments

The sample declares one Z-segment `ZAL` with three named fields. Replace
it with the Z-segments your integration emits. Each field maps to a
1-indexed HL7 field position:

```ts
customSegments: {
  ZDP: {
    fields: {
      departmentCode: 3,
      departmentName: 4,
    },
  },
  ZRS: {
    fields: {
      resultStatus: 1,
      statusDateTime: 2,
    },
  },
},
```

**Verify:**

```bash
pnpm typecheck
```

## 4. Write fixtures and tests

Replace `test/fixtures/sample.hl7` with a real (de-identified) message
from your integration. Update `test/profile.test.ts` to assert:

- Your Z-segments no longer emit `UNKNOWN_SEGMENT` warnings with the
  profile applied.
- Named fields are accessible via `segment.get(name)`.
- Total warning count with the profile is ≤ the count without it.

**Verify:**

```bash
pnpm test
```

## 5. Publish

One-shot preflight:

```bash
pnpm install --no-frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm publish --dry-run --access public
```

The `--dry-run` prints the tarball contents (should contain `dist/`,
`README.md`, `LICENSE`, `CUSTOMIZING.md`, `package.json`).

To publish for real:

1. Add `NPM_TOKEN` as a GitHub repository secret (Settings → Secrets →
   Actions → **New repository secret**).
2. Open the **Actions** tab and trigger the **Publish** workflow
   manually (workflow_dispatch).

Or publish from your laptop:

```bash
pnpm publish --access public
```

**Verify:**

```bash
npm view @{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}} version
```

---

Questions or bug reports → open an issue against
[`@cosyte/hl7-parser`](https://github.com/cosyte/hl7-parser/issues).
