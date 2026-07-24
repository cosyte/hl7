# @{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}

HL7 profile package for {{YOUR_ORG}} integrations, built as a peer to
[`@cosyte/hl7`](https://github.com/cosyte/hl7-parser).

> This package was generated from the `@cosyte/hl7` profile starter
> kit. Customize by following [CUSTOMIZING.md](./CUSTOMIZING.md).

## Install

```bash
pnpm add @{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}} @cosyte/hl7
```

## Usage

```ts
import { parseHL7 } from "@cosyte/hl7";
import { MyProfile } from "@{{YOUR_ORG}}/hl7-profile-{{PROFILE_NAME}}";

const msg = parseHL7(rawHL7, MyProfile);

console.log(msg.patient.mrn);
const zal = msg.segments("ZAL")[0];
console.log(zal?.get("allergyId")?.value);
```

## What this profile does

- Extends `profiles.genericLab`: inherits ASTM-era + ISO-date fallbacks.
- Declares one custom Z-segment: `ZAL` (allergy detail) with named fields
  `allergyId`, `severity`, `verifiedAt`.
- Adds `YYYY-MM-DD` as a date-format fallback.

## Develop

```bash
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

> **Note on the `@cosyte/hl7` devDependency.** While the starter kit
> sits inside the parent `@cosyte/hl7` repository, its
> `devDependencies` points at the parent via `"file:../.."`. When you copy
> this kit out to your own repo, replace that value with a real published
> version (e.g., `"^0.1.0"`) before running `pnpm install`. CUSTOMIZING.md
> step 1 covers this find/replace.

## Publish

Configure `NPM_TOKEN` as a repository secret, then trigger the **Publish**
workflow from the GitHub Actions UI. See [CUSTOMIZING.md](./CUSTOMIZING.md)
step 5.

## License

MIT. See [LICENSE](./LICENSE).
