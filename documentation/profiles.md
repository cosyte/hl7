# Profiles

Authoring a profile, naming fields on standard segments, extending and merging, and the eight profiles that ship in the box.

### Authoring a profile

`defineProfile({ name, customSegments, segmentOverrides, dateFormats, onWarning, description })` returns a frozen `Profile` object. `customSegments` is a record mapping Z-segment name -> `{ fields: { aliasName: 1-indexedPosition } }`; `segmentOverrides` is the same shape for STANDARD segment names (see [Naming fields on standard segments](#naming-fields-on-standard-segments)).

```ts
import { defineProfile, type CustomSegmentDefinition } from "@cosyte/hl7";

const zdp: CustomSegmentDefinition = {
  fields: { departmentCode: 3, departmentName: 4 },
};

const myhospital = defineProfile({
  name: "myhospital",
  description: "Custom Z-segments for MyHospital ADT feed",
  dateFormats: ["MM/DD/YYYY HH:mm:ss"],
  customSegments: { ZDP: zdp },
});
```

Invalid input (missing name, malformed Z-segment name, unsupported date tokens, unknown option keys) throws `ProfileDefinitionError` with an actionable message. See [Error Handling](./error-handling.md).

### Naming fields on standard segments

`customSegments` names fields on your Z-segments. `segmentOverrides` does the same job for the STANDARD segments, for the case every real integration eventually hits: a site that stuffs its own value into a standard field. A second MRN in PID-19, a local severity code in AL1-4, a site dose qualifier in RXA-6. Give it a name once in the profile and read it by that name everywhere, instead of scattering a hand-typed position through your code.

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";

const site = defineProfile({
  name: "myhospital-adt",
  segmentOverrides: {
    PID: { fields: { siteMrn: 19 } },
    AL1: { fields: { localSeverityCode: 4 } },
    RXA: { fields: { doseQualifier: 6 } },
  },
});

const msg = parseHL7(raw, site);
msg.part("PID")?.get("siteMrn")?.value; // the value at PID-19
msg.part("AL1")?.get("localSeverityCode")?.value; // the value at AL1-4
```

**Positions are 1-indexed HL7 positions**, identical in meaning to the argument of `seg.field(n)`, including the MSH numbering convention: a binding at `1` is MSH-1 (the field separator) and a binding at `3` is MSH-3 (the sending application). `get(name)` and `field(position)` always agree.

**A name that is not declared, and a declared position the message did not carry, both read `undefined`**, never an empty string. A typo surfaces instead of quietly reading blank. The HL7 explicit null (`""`) is a value the sender chose to send, so it still comes back as a `Field`.

**Inheritance follows the same rule as `customSegments`.** Layer profiles with `extends` and, per segment type, the child's binding wins at any POSITION both declare while the parent's bindings at other positions survive:

```ts
const parent = defineProfile({
  name: "parent",
  segmentOverrides: { PID: { fields: { parentAlias: 19, countyCode: 12 } } },
});

const child = defineProfile({
  name: "child",
  extends: parent,
  segmentOverrides: { PID: { fields: { childAlias: 19 } } },
});

// child.segmentOverrides.PID.fields === { childAlias: 19, countyCode: 12 }
```

**What `defineProfile()` refuses, at definition time**, throwing `ProfileDefinitionError` and returning no profile:

| Declaration                                                         | Why it is refused                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a Z-segment key (`ZPI`)                                             | that is a custom segment: the error points you at the `customSegments` option                                                                                            |
| a name that is not a standard HL7 v2 segment (`QQQ`, `pid`, `PIDX`) | keys are matched against `KNOWN_SEGMENTS` in their canonical uppercase spelling, so a key that would never resolve is rejected rather than silently defining a dead name |
| a position that is not a positive integer (`0`, `-1`, `2.5`, `"3"`) | the error names the profile, the segment and the field                                                                                                                   |
| a misspelled option key (`segmentOverride`)                         | reported with `segmentOverrides` as the suggestion                                                                                                                       |

An empty map (`segmentOverrides: {}`), or a declared segment with an empty field map, is accepted and behaves exactly like declaring nothing.

#### Limitations

**Overrides add named reads. They change nothing that already reads.** This is the whole design, and it is deliberate: HL7 v2 traffic is PHI, and an alias that re-pointed an existing accessor would hand a downstream consumer a different clinical value with no warning and nothing to notice. Specifically, a `segmentOverrides` declaration does NOT:

- **re-point the typed clinical accessors.** `msg.patient`, `msg.visit`, `msg.allergies()`, `msg.medications()`, `msg.observations()` and every other typed helper keep reading the positions the HL7 standard assigns. Declaring `siteMrn: 19` does not make `msg.patient?.mrn` read PID-19; it still reads PID-3.
- **add a dot-path.** Dot-paths stay positional: `msg.get("PID.19")` works, `msg.get("PID.siteMrn")` is a syntax error. The named accessor is the one route to a declared name.
- **change serialization.** `toString()` is byte-for-byte what it was, `toJSON()` is unchanged, and the message still round-trips verbatim.
- **change the warning list.** An undeclared Z-segment still emits `UNKNOWN_SEGMENT`, and naming a standard segment in the override map does not suppress or add any warning.
- **touch the write path.** `setField`, `setComposite`, `buildMessage` and the typed builders take positions, not names.

Parse one message with the overrides and again without them and every one of those observables is equal. Only the new names differ.

### Extending profiles

Use `extends` to layer profiles. Single parent or array of parents, both supported.

```ts
import { defineProfile, profiles } from "@cosyte/hl7";

const myEpic = defineProfile({
  name: "my-epic",
  extends: profiles.epic,
  customSegments: {
    ZPR: { fields: { providerId: 1 } },
  },
});

const combined = defineProfile({
  name: "epic-plus-lab",
  extends: [profiles.epic, profiles.genericLab],
});
```

Lineage is recorded on the result (`profile.lineage`) in parent-first order, ending with the profile's own name.

### Merge semantics

When `extends` resolves parents, fields are merged per-key with the following rules:

- **Scalars** (`description`): later layers overwrite earlier ones.
- **Arrays** (`dateFormats`, `lineage`): concatenate + dedupe, preserving first-seen order.
- **`customSegments` map**: deep-merge per key; same-segment-name in two parents reconciles positional fields.
- **`segmentOverrides` map**: the same reducer, on the standard-segment declarations. See [Naming fields on standard segments](#naming-fields-on-standard-segments).
- **`onWarning` handlers**: compose into a chain, invoked in lineage order (parents before children). Errors thrown by one handler do not stop subsequent handlers.
- **`name`**: never inherited, always the profile's own.

The merge is validated post-hoc: duplicate field names across merged segments throw `ProfileDefinitionError` up front, not at parse time.

### Inspecting a profile

Every `defineProfile()` result carries a `.describe()` method and an introspectable `lineage` array: useful for debugging which layers contributed what.

```ts
import { defineProfile, profiles } from "@cosyte/hl7";

const p = defineProfile({
  name: "my-epic",
  extends: profiles.epic,
  customSegments: { ZPR: { fields: { providerId: 1 } } },
});

console.log(p.name); // "my-epic"
console.log(p.lineage); // ["epic", "my-epic"]
console.log(Object.keys(p.customSegments ?? {})); // ["ZDP", "ZRS", "ZPR"]
console.log(p.describe?.()); // multi-line summary
```

### Publishing a profile

The [profile starter kit](../examples/profile-starter-kit/) is a complete publishable npm package template. Copy the subtree, replace placeholders, swap in your Z-segments and fixtures, then `pnpm publish --access public`. See [`examples/profile-starter-kit/CUSTOMIZING.md`](../examples/profile-starter-kit/CUSTOMIZING.md) for the 5-step walkthrough: rename, swap base profile, define Z-segments, write fixtures, publish.

### Built-in profiles

Eight profiles ship in the box, reachable via the `profiles` namespace:

- `profiles.epic`: Epic Bridges Interconnect. Adds `MM/DD/YYYY HH:mm:ss` and `MM/DD/YYYY` date formats; declares `ZDP` (department context) and `ZRS` (result status) Z-segments.
- `profiles.cerner`: Cerner Millennium outbound. Handles Cerner-idiomatic date formats and common Z-segments from Millennium ADT feeds.
- `profiles.meditech`: MEDITECH MAGIC/6.x/Expanse. Adds the `YYYYMMDDHHMM` minute-precision timestamp format and declares the DFT charge Z-segments `ZF1` (provider-encounter copay data) and `ZF2` (encounter-procedure data). Grounded in the public [MEDITECH Ancillary Charges (LAB/PHA/ITS/IDM) Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/ancillary-charges-outbound-21.pdf) (v2.1) spec, with the date format also confirmed by the [MEDITECH Admissions and Registration Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/admissions-registration-outbound-24.pdf) (v2.4) spec.
- `profiles.athena`: athenahealth. Ambulatory-oriented, ISO-leaning date formats.
- `profiles.genericLab`: Generic reference-lab (LabCorp / Quest-style). Adds `YYYYMMDD HHmm` (ASTM-era) and `YYYY-MM-DD` (ISO date-only); declares `ZLB` (lab overrides) and `ZNT` (lab note) Z-segments.
- `profiles.visage`: Visage 7 imaging/PACS RIS feeds. Declares the `ZDS` Z-segment that carries the DICOM **Study Instance UID** (field 1) so an HL7 order correlates to its DICOM study, the IHE Radiology RIS/PACS bridge segment. Grounded in the public [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf) (V23.00, Jun 2026). Dates are HL7-native, so it adds no date formats.
- `profiles.philips`: Philips Vue PACS ("IS Link") imaging feeds. Declares six Vue PACS Z-segments, one per filler role: `ZDS` (DICOM Study Instance UID), `ZLK` (linked studies/orders), `ZAO` (order additional details: modality, body part, transfer/acquisition status, technician + radiologist), `ZEB` (encrypted patient info), `ZAP` (patient additional details), and `ZAV` (visit additional details). Grounded in the public [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf) (Philips, doc HA1669 Rev A, §§5.11-5.16). Dates are HL7-native, so it adds no date formats.
- `profiles.va`: U.S. Department of Veterans Affairs VistA Radiology/Nuclear Medicine feeds (HL7 v2.4). Declares the `ZDS` Z-segment that carries the DICOM **Study Instance UID** (field 1): the same IHE Radiology RIS↔PACS bridge as `visage`/`philips`, grounded here in a distinct **federal** spec and documented on **both ORM and ORU** (result) messages. Grounded in the public [Radiology/Nuclear Medicine 5.0 HL7 Interface Specification](https://www.va.gov/vdl/documents/clinical/radiology_nuclear_med/ra5_0hl7is.pdf) (Version 3.6, Patch RA\*5.0\*203, June 2024). Dates are HL7-native, so it adds no date formats.

Use a built-in directly (`parseHL7(raw, profiles.epic)`) or as a base for your own (`defineProfile({ extends: profiles.epic, ... })`).
