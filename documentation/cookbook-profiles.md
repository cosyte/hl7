# Cookbook: profile recipes

Writing, extending, composing, publishing and registering a profile.

### Write your first profile in 10 minutes

A profile is plain data: a name, optional extra `dateFormats`, and a `customSegments` map of Z-segment declarations. The record shape maps a caller-visible field name to its 1-indexed HL7 position.

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";

const myProfile = defineProfile({
  name: "myhospital",
  description: "Custom Z-segments for our internal integration",
  customSegments: {
    ZAL: { fields: { allergyId: 1, severity: 2, verifiedAt: 3 } },
  },
});

const msg = parseHL7(raw, myProfile);
const zal = msg.allSegments().find((s) => s.type === "ZAL");
console.log(zal?.get("severity")?.value); // "HIGH"
```

Pass the profile as the second argument to `parseHL7`; afterwards, `seg.get("fieldName")` resolves through the profile's field aliases. `UNKNOWN_SEGMENT` warnings for declared Z-segments are suppressed automatically.

### Extending a profile

`extends` layers one profile on top of another. Use it to add hospital-specific Z-segments on top of a vendor baseline.

```ts
import { defineProfile, profiles, parseHL7 } from "@cosyte/hl7";

const myEpic = defineProfile({
  name: "my-epic",
  extends: profiles.epic,
  customSegments: {
    ZPR: { fields: { providerId: 1, specialty: 2 } },
  },
});

const msg = parseHL7(raw, myEpic);
console.log(msg.profile?.lineage); // ["epic", "my-epic"]
```

Date formats concatenate (deduped), `customSegments` deep-merge per key, `onWarning` handlers chain in lineage order. The parent's `describe()` surface is preserved so `myEpic.describe()` lists both layers.

### Composing profiles

Pass an array to `extends` to merge multiple parents. Useful when combining a vendor profile with a market-specific overlay (e.g. Epic + reference-lab conventions).

```ts
import { defineProfile, profiles, parseHL7 } from "@cosyte/hl7";

const combined = defineProfile({
  name: "epic-plus-lab",
  extends: [profiles.epic, profiles.genericLab],
  dateFormats: ["YYYY-MM-DD HH:mm"],
});

const msg = parseHL7(raw, combined);
console.log(msg.profile?.lineage); // ["epic", "genericLab", "epic-plus-lab"]
```

Conflicts on scalar keys (later wins), arrays concatenate+dedupe, `customSegments` maps merge. See [Merge semantics](./profiles.md#merge-semantics) in the Profiles section for the full rules.

### Publishing a profile package

Real production specs live at the integration level: specific EHR instances, reference labs, HIEs. The [profile starter kit](../examples/profile-starter-kit/) is a copy-and-customise template: it ships publishable as-is, with placeholders you replace with your org/profile names.

```bash
cp -r examples/profile-starter-kit my-profile && cd my-profile
# Find/replace {{YOUR_ORG}} and {{PROFILE_NAME}}, then:
pnpm install
pnpm test
pnpm build
pnpm publish --access public
```

See [`examples/profile-starter-kit/CUSTOMIZING.md`](../examples/profile-starter-kit/CUSTOMIZING.md) for the 5-step walkthrough (rename, swap base profile, define Z-segments, write fixtures, publish). The kit includes CI + publish workflows, a sample profile that demonstrates every feature, and zero-threshold Vitest so you ship green-or-red without fighting coverage gates.

### Default profile

`setDefaultProfile` registers a profile for every subsequent `parseHL7(...)` call in the current Node process. Convenient when every message in your pipeline comes from the same sender; explicit per-call passing is usually clearer.

```ts
import { parseHL7, profiles, setDefaultProfile, getDefaultProfile } from "@cosyte/hl7";

setDefaultProfile(profiles.epic);
console.log(getDefaultProfile()?.name); // "epic"

const msg = parseHL7(raw); // uses epic implicitly
const bare = parseHL7(raw, { profile: null }); // opt out for this call

setDefaultProfile(null); // reset
```

The default is scoped to the current Node process: not shared across workers, not serialisable. Opt out for a specific parse with `{ profile: null }` in the options bag.
