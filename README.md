# @cosyte/hl7

> Parse real-world, vendor-quirky HL7 v2 messages and extract the fields you need in one line — without reading the spec.

[![npm version](https://img.shields.io/npm/v/@cosyte/hl7.svg)](https://www.npmjs.com/package/@cosyte/hl7)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/hl7/ci.yml?branch=main&label=CI)](https://github.com/cosyte/hl7/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

A developer-focused HL7 v2 parser and utility library for Node.js and TypeScript. Optimised for the 10% of HL7 you actually use — with the other 90% still one accessor away when you need it.

---

## Quickstart

Three lines of useful output after install + parse. No HL7 spec knowledge required.

```bash
# pnpm (recommended) — also works with: npm install @cosyte/hl7  |  yarn add @cosyte/hl7
pnpm add @cosyte/hl7
```

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(rawHL7);
console.log(msg.patient?.fullName); // "John Q. Doe"
console.log(msg.patient?.mrn); // "MRN12345"
console.log(msg.meta.timestamp?.raw); // "20260419101500" (fidelity TS — precision + zone preserved)
```

That's the whole pitch: no config, no schema upload, no spec lookup. The parser accepts vendor-quirky input by default, strips MLLP framing if it's there, normalises casing, and tolerates the dozen-or-so deviations real HL7 traffic routinely carries. You reach for strict mode, dot-paths, or profiles when you want them — not before.

---

## Features

- **One-line extraction** — `msg.patient.mrn`, `msg.meta.timestamp`, `msg.observations()`, and friends. No segment or field numbers to memorise.
- **Three access patterns** — named helpers, dot-paths (`msg.get("PID.5.1")`), or structural traversal (`msg.segments("OBX")[0].field(3)`). Pick the level of ceremony you need.
- **Real-world tolerance, four-tier** — lenient default parses vendor-quirky messages; 18 stable warning codes flag what was tolerated; strict mode escalates every deviation for CI validators; only 4 truly-structural failures are fatal.
- **First-class profile system** — `defineProfile()` API, 7 built-in vendor profiles (Epic, Cerner, Meditech, athenahealth, generic lab, Visage 7 imaging/PACS, Philips Vue PACS), plus a [publishable starter kit](./examples/profile-starter-kit/) you copy-and-ship.
- **Round-trip safe, byte-verbatim escapes** — `parse -> modify -> toString()` emits spec-clean HL7 regardless of input quirks (Postel's Law: liberal parser, conservative emitter), and a parsed field's escape sequences (`\H\`, `\X41\`, charset/vendor escapes) re-emit **byte-for-byte** — see [Escapes & round-trip](./docs-content/spec-notes-escapes.md).
- **Strict TypeScript, zero runtime deps** — ES2022, `noUncheckedIndexedAccess`, dual ESM + CJS, Node 18+. Every public export has JSDoc + `@example` that feeds your editor's IntelliSense.
- **Warnings carry stable codes + positional context** — react programmatically by `w.code`, with `segmentIndex`/`fieldIndex`/etc. attached.

---

## HL7 in 90 seconds

HL7 v2 is a pipe-delimited messaging format used across US healthcare. A message is a sequence of line-oriented **segments** (3-letter names like `MSH`, `PID`, `OBX`). Each segment carries **fields** separated by `|`; fields decompose into **components** (`^`) and **subcomponents** (`&`). Repeating fields use `~`.

A typical ADT message looks like this:

```
Message
 ├── MSH    (header — sender, receiver, type, timestamp)
 ├── EVN    (event details for ADT)
 ├── PID    (patient identification — name, MRN, DOB)
 ├── PV1    (visit — class, location, attending)
 └── OBX×N  (observations — repeats for labs, vitals)

 Each segment   = pipe-delimited (|) fields
 Each field     = caret-delimited (^) components
 Each component = ampersand-delimited (&) subcomponents
```

That's enough HL7 to use this library productively. Everything else is in the spec, but you won't need it.

---

## Access patterns

Three ways to reach into a parsed message, each optimised for a different use case.

### Named helpers

Typed views over the common-case data. Zero HL7 literacy required.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.patient?.mrn); // "MRN12345"
console.log(msg.patient?.fullName); // "Jane Q. Smith"
console.log(msg.patient?.dateOfBirth?.precision); // "day" — a birth date is not a full instant
console.log(msg.meta.type); // "ADT^A01"
console.log(msg.meta.timestamp?.raw); // "20250102153045" (MSH-7 — fidelity TS)
console.log(msg.visit?.location); // PL composite — pointOfCare/room/bed
```

Use these for the 90% case. Helpers return `undefined` (not throws) when the underlying segment is absent, so optional-chaining stays idiomatic.

### Dot-paths

String paths following HL7's own `SEG.field.component.subcomponent` convention. Indices are 1-based to match the spec.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.get("PID.5.1")); // family name  -> "Smith"
console.log(msg.get("PID.5.2")); // given name   -> "Jane"
console.log(msg.get("OBX[2].5")); // 2nd OBX, value field
console.log(msg.getAll("NK1")); // every next-of-kin segment
```

Reach for dot-paths when you want a specific field the helpers don't surface — or when you're scripting quick extractions without introducing typed imports.

### Structural traversal

Walk the segment/field/component/subcomponent tree directly. For advanced extractors, round-trip edits, and anything the other two patterns don't cover.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

for (const obx of msg.segments("OBX")) {
  const id = obx.field(3).component(1).value; // observation identifier
  const val = obx.field(5).value; // observed value
  console.log(`${id} = ${val}`);
}

console.log(msg.allSegments().length); // total segments in the message
```

Every level (segment / field / repetition / component / subcomponent) is addressable and immutable — mutation happens through explicit methods (see the cookbook).

---

## Cookbook

Runnable recipes for the tasks developers hit most often. Every snippet imports from `@cosyte/hl7` and uses APIs exported from [`src/index.ts`](./src/index.ts). Keep them short; lean on the named-helper surface first.

### Patient demographics

Reach for the `msg.patient` helper for the name/MRN/DOB trio that covers 95% of demographic extractions.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
const p = msg.patient;

console.log(p?.mrn); // "MRN12345"
console.log(p?.fullName); // "Jane Q. Smith"
console.log(p?.dateOfBirth?.raw); // "19800115" (PID-7 — fidelity TS at day precision)
console.log(p?.sex); // "F"
console.log(p?.address?.city); // XAD composite
```

`msg.patient` is `undefined` when the message has no `PID` segment — use `?.` consistently. The `address` field is an `XAD` composite with `streetAddress`, `city`, `state`, `zip`, `country`. `dateOfBirth` (and every datetime) is a **fidelity `TS`** — see [Datetime precision & timezone fidelity](#datetime-precision--timezone-fidelity).

### Lab results

Iterate `msg.observations()` for the flat-list view of every `OBX` segment, regardless of whether they're grouped under an `OBR`.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

for (const obs of msg.observations()) {
  console.log(obs.identifier.text, obs.value, obs.units?.identifier);
  // "Glucose" 120 "mg/dL"
}
```

Observations are discriminated by `valueType` (`"NM"` -> number, `"TS"`/`"DT"` -> fidelity `TS`, `"CWE"`/`"CE"` -> composite, everything else -> string). Use `msg.orders()` instead when you need OBR -> OBX grouping for lab order processing.

### Admit location

The `msg.visit` helper surfaces `PV1` data including the `PL` (Person Location) composite — ward / room / bed / facility in one go.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
const loc = msg.visit?.location;

console.log(loc?.pointOfCare); // "ICU"
console.log(loc?.room); // "101"
console.log(loc?.bed); // "A"
console.log(loc?.facility?.namespaceId); // "MAIN"
```

`msg.visit` is `undefined` when the message has no `PV1` segment (most `ORU`/`ORM` messages). The `attendingDoctor` and `referringDoctor` fields are `XCN` composites.

### Modify and reserialize

`setField` mutates the positional tree in-place; `toString()` emits spec-clean HL7 (Postel's Law). See [`examples/modify-and-resend.ts`](./examples/modify-and-resend.ts) for the end-to-end script.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.get("PV1.3.1")); // original ward
msg.setField("PV1.3.1", "NEW-WARD");
console.log(msg.get("PV1.3.1")); // "NEW-WARD"

const outbound = msg.toString(); // spec-clean HL7 wire format
```

`setField` takes the same dot-path syntax as `get`; `addSegment(name, fields)` and `removeSegment(...)` round out the mutation surface. The emitter always uses canonical delimiters (`|`, `^`, `~`, `\`, `&`) regardless of what the input used.

### Allergies

`msg.allergies()` walks every `AL1` segment and returns a typed list.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

for (const al of msg.allergies()) {
  console.log(al.code?.text, al.severity, al.reaction);
  // "Penicillin" "SV" "Hives"
}
```

Fields are parsed into their spec-typed shapes (`code` is a `CWE` composite, `onsetDate` is a fidelity `TS`). The same helper family exists for next-of-kin (`msg.nextOfKin()`), diagnoses (`msg.diagnoses()`), insurance (`msg.insurance()`), medications (`msg.medications()`), and immunizations (`msg.immunizations()`).

### Scheduling, documents & charges (SIU · MDM · DFT)

Three breadth helpers cover the scheduling, medical-record, and financial message families:

```ts
import { parseHL7 } from "@cosyte/hl7";

// SIU — appointments(): SCH id/status/timing + AIS/AIG/AIL/AIP resources
for (const appt of parseHL7(raw).appointments()) {
  console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier); // status verbatim
  const provider = appt.resources.find((r) => r.kind === "personnel");
  console.log(provider?.person?.familyName);
}

// MDM — documents(): completion (TXA-17) and availability (TXA-19) are DISTINCT
for (const doc of parseHL7(raw).documents()) {
  console.log(doc.completionStatus, doc.availabilityStatus); // e.g. "IP" (in progress) + "AV" (available)
  // never conflated — a document can be AVAILABLE before it is AUTHENTICATED;
  // reading a preliminary document as final is the harm this split prevents.
}

// DFT — charges(): FT1 billing fields, amounts kept as canonical wire text (no money-as-float)
for (const charge of parseHL7(raw).charges()) {
  console.log(charge.transactionType, charge.transactionCode?.identifier);
  console.log(charge.amountExtended); // e.g. "150.00^USD" — a string, never a number
}
```

These are **breadth** helpers — they surface the common trigger events' core fields, not a scheduling-workflow state machine, signature verification, or a claims/pricing engine (see the roadmap's known-limitations).

### Order & medication timing

Every `Order` (from `msg.orders()`) and `Medication` (from `msg.medications()`) carries a `timings` array — the `TQ1` segment (HL7 v2.5+) or the legacy embedded TQ in `ORC-7` / `RXE-1` (pre-v2.5).

```ts
import { parseHL7 } from "@cosyte/hl7";

const med = parseHL7(raw).medications()[0];

for (const t of med?.timings ?? []) {
  console.log(t.source); // "TQ1" or "legacy"
  console.log(t.repeatPattern?.code); // "Q6H" — VERBATIM, never resolved to a schedule
  console.log(t.repeatPattern?.kind); // "parametric" (provenance only)
  console.log(t.repeatPattern?.interval); // { count: 6, unit: "H" } — the load-bearing integer
  console.log(t.totalOccurrences); // 24 — from TQ1-14 (not TQ1-11)
  console.log(t.startDateTime?.raw, t.startDateTime?.precision);
}
```

The repeat pattern (Table 0335) is surfaced **verbatim** — hl7 never normalizes a sig, resolves `Q6H` to clock times, or maps it to a different frequency (reading `Q6H` as "daily", or losing a `BID`, changes the administered dose count). The `kind` flag (`parametric`/`named`/`unknown`) is provenance only and never drives a schedule; a parametric `Q<n><unit>` template's integer is never dropped. See `docs-content/spec-notes-timing.md` for the field map and non-goals.

### Patient merges and identity events

`msg.identityEvents()` recognizes the ADT identity-management trigger events — merges (A18/A34/A35/A36/A39/A40/A41/A42), moves (A43/A44), link/unlink (A24/A37), and person add/update (A28/A31) — and surfaces every party **labelled by role**. On a merge, the MRG segment carries the _prior_ (non-surviving) identifiers and the PID carries the _surviving_ ones; the direction is the spec constant `MRG_TO_PID` and is never inferred from content.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(rawA40);

for (const ev of msg.identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving && ev.warnings.length === 0) {
    // retire ev.prior.identifiers in favour of ev.surviving.identifiers
    console.log(ev.prior.identifiers[0]?.idNumber, "->", ev.surviving.identifiers[0]?.idNumber);
  } else if (ev.warnings.length > 0) {
    // incomplete MRG->PID pair (MERGE_MISSING_PRIOR_OR_SURVIVOR) — route for review
  }
}
```

A mis-applied merge conflates two patients or orphans data under a retired MRN, so the helper is deliberately conservative: an incomplete pair (no MRG, an orphaned MRG, or a PID with no surviving identifier) surfaces whatever _is_ present plus a `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on the event — the MRG is never dropped, and the direction is never guessed. The MRG field map is version-scoped: the backward-compat single-ID fields (PID-2 / MRG-4, withdrawn as of HL7 v2.7) are not read when MSH-12 declares v2.7+. Note that `@cosyte/hl7` _surfaces_ the merge — actually re-pointing stored data to the survivor is your integration engine's job.

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

Conflicts on scalar keys (later wins), arrays concatenate+dedupe, `customSegments` maps merge. See [Merge semantics](#merge-semantics) in the Profiles section for the full rules.

### Publishing a profile package

Real production specs live at the integration level — specific EHR instances, reference labs, HIEs. The [profile starter kit](./examples/profile-starter-kit/) is a copy-and-customise template: it ships publishable as-is, with placeholders you replace with your org/profile names.

```bash
cp -r examples/profile-starter-kit my-profile && cd my-profile
# Find/replace {{YOUR_ORG}} and {{PROFILE_NAME}}, then:
pnpm install
pnpm test
pnpm build
pnpm publish --access public
```

See [`examples/profile-starter-kit/CUSTOMIZING.md`](./examples/profile-starter-kit/CUSTOMIZING.md) for the 5-step walkthrough (rename, swap base profile, define Z-segments, write fixtures, publish). The kit includes CI + publish workflows, a sample profile that demonstrates every feature, and zero-threshold Vitest so you ship green-or-red without fighting coverage gates.

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

The default is scoped to the current Node process — not shared across workers, not serialisable. Opt out for a specific parse with `{ profile: null }` in the options bag.

### Datetime precision & timezone fidelity

Every HL7 datetime (TS/DTM) is surfaced as a **fidelity `TS`** — the raw string plus its typed parts,
with the stated **precision** and **timezone** preserved. It is deliberately **not** an eager JS `Date`:
a day-only birth date coerced to a UTC-midnight instant reads as the _previous day_ in a negative-offset
zone. The parser preserves what the sender wrote and lets you decide how to localize.

```ts
import { parseHL7, dtmToDate } from "@cosyte/hl7";

const dob = parseHL7(raw).patient?.dateOfBirth;
console.log(dob?.raw); // "19880705"
console.log(dob?.precision); // "day" — never zero-filled to a full timestamp
console.log(dob?.year, dob?.month, dob?.day); // 1988 7 5  (month is 1-based, spec-native)
console.log(dob?.hasTimezone); // false — a missing offset is FLAGGED, never assumed to be UTC

// An absolute instant is opt-in and honest — it refuses to guess a zone:
console.log(dtmToDate(dob!)); // undefined (no offset, no assumption)
console.log(dtmToDate(dob!, { assumeOffsetMinutes: 0 })); // 1988-07-05T00:00:00.000Z (you chose UTC)

// A value that carries its own offset resolves exactly:
const ts = parseHL7(raw).meta.timestamp; // e.g. "20250102153045-0500"
console.log(ts?.offsetMinutes); // -300
console.log(dtmToDate(ts!)?.toISOString()); // "2025-01-02T20:30:45.000Z"
```

hl7 preserves precision + timezone **fidelity**; it does **not** localize, convert, or do arithmetic on
timestamps — a consumer needing an absolute instant applies the sender's zone via `assumeOffsetMinutes`.
Use `parseDtm` / `formatDtm` / `dtmToDate` directly on a raw string when you're outside the message model.

#### Non-standard timestamp formats

HL7's canonical `YYYYMMDDHHmmss` parses with zero warnings. Everything else — vendor-quirky
`MM/DD/YYYY`, ISO `YYYY-MM-DD`, legacy `YYYYMMDD HHmm` — parses via the `dateFormats` option, which
tries each format in order and populates the same fidelity `TS`.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw, {
  dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY", "YYYY-MM-DD"],
});

console.log(msg.meta.timestamp?.matchedFormat); // e.g. "MM/DD/YYYY" (which fallback won)
```

When a fallback format wins, the parser emits a `TIMESTAMP_FALLBACK_FORMAT` warning with the matched format on `msg.warnings`. Built-in vendor profiles (`profiles.epic`, `profiles.genericLab`, etc.) already carry the date formats common to that vendor — reach for a profile instead of hand-listing formats when one fits.

### Stripping MLLP framing

MLLP (Minimum Lower Layer Protocol) wraps HL7 messages in VT / FS / CR bytes for TCP transport. The parser strips them by default and emits a `MLLP_FRAMING_STRIPPED` warning so you know preprocessing happened.

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(mllpFramed);
const framed = msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED);
console.log(framed); // true if input had VT/FS/CR framing

// Disable preprocessing if your input is guaranteed framing-free:
parseHL7(raw, { stripMllpFraming: false });
```

Strip behaviour is idempotent — calling `parseHL7` on already-stripped input is a no-op. The parser does NOT add MLLP framing on `toString()`; if you need it for transport, prepend/append the bytes in your transport layer (a future `@cosyte/hl7-mllp` package will cover network IO end to end).

### Batch files

Real lab / ELR / IIS feeds ship many messages wrapped in the HL7 v2 batch envelope (`[FHS] { [BHS] { MSH… } [BTS] } [FTS]`). `splitBatch()` demarcates the individual messages by `MSH` boundary and hands each one back **already parsed** — a malformed message mid-stream is isolated (returned as a typed failure), never suppressing its siblings, and the declared BTS-1 / FTS-1 counts are reconciled without ever dropping the tail.

```ts
import { splitBatch } from "@cosyte/hl7";

const { messages, warnings } = splitBatch(rawBatchFile);

for (const entry of messages) {
  if (entry.ok) {
    handle(entry.message); // a fully-parsed Hl7Message
  } else {
    quarantine(entry.raw, entry.error.code); // isolated, not dropped
  }
}

// Batch-level warnings carry counts/positions only — never PHI.
for (const w of warnings) {
  // BATCH_COUNT_MISMATCH — declared BTS-1/FTS-1 ≠ actual (tail still returned)
  // BATCH_MISSING_TRAILER — a BHS/FHS header with no matching BTS/FTS
}
```

A **bare single message** (no envelope) passes straight through as a one-message result. `splitBatch` is a splitter, not an enforcer: it warns on a missing trailer but leaves accept/reject to you (a profile such as IIS may mandate the full frame), does not generate batch ACKs, and does not de-batch across transport framing (that is [`@cosyte/mllp`](https://github.com/cosyte/mllp)). The second argument is forwarded to `parseHL7` per message (profile, `strict`, `charset`). See the [batch spec notes](./docs-content/spec-notes-batch.md) for the full traceability + known limitations.

### Detect message type

`msg.meta` exposes MSH-9 pre-decomposed into its three components — use them instead of parsing the raw string.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.meta.type); // "ADT^A01"
console.log(msg.meta.messageCode); // "ADT"
console.log(msg.meta.triggerEvent); // "A01"
console.log(msg.meta.messageStructure); // "ADT_A01" (if present in MSH-9.3)

if (msg.meta.messageCode === "ORU") {
  // branch for observation results
}
```

Matching on `messageCode` + `triggerEvent` is more robust than string-equals on `type`, because some senders populate MSH-9.3 (`type` includes it) and some don't.

### Spot a truncated or misrouted message

For the common message types, `msg.structure` reports whether the core segment groups the HL7 spec marks **Required** for that trigger event are actually present. It's a **misroute / truncation safety net**, not a conformance validator — an `ORU^R01` that arrives with no `OBR`/`OBX` result group is almost always truncated or sent to the wrong feed.

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(raw); // ORU^R01 with only MSH + PID

console.log(msg.structure.recognized); // true
console.log(msg.structure.missingGroups); // ["result"]  (no OBR/OBX)

// The same finding also surfaces as an additive Tier-2 warning, so a
// channel can route on it without inspecting `structure`:
if (msg.warnings.some((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP)) {
  // quarantine / alert: the message is missing an expected segment group
}
```

The check is **conservative by construction**: it only models groups that are genuinely Required (so a conformant-but-sparse message never warns), it keys on the **trigger event** (not the message family), and a type it doesn't recognize yields `recognized: false` and emits nothing. It never throws and never rewrites the message — `strict` mode may promote the warning to an error per the usual model. Recognized types: ADT (A01/A02/A03/A04/A05/A08/A11/A13), ORU^R01, ORM^O01, OML^O21, OMG^O19, OMP^O09, OMI^O23, SIU (S12–S26), MDM (T02/T06), DFT^P03, VXU^V04, and ACK. See [`docs-content/spec-notes-structure.md`](docs-content/spec-notes-structure.md) for the per-type Required-segment sourcing.

### Pretty-print for logs

`msg.prettyPrint()` returns a multi-line, labeled view of the positional tree — useful for dev-time debugging and log snapshots.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
console.log(msg.prettyPrint());
// MSH-1  (field separator): |
// MSH-2  (encoding chars):  ^~\&
// MSH-3  (sending app):     CLINIC
// ...
// PID-5  (name):
//   .1 = Smith
//   .2 = Jane
// ...
```

Pretty-print is **not** a replacement for `toString()` — it's for humans. Use `toString()` for wire output and `toJSON()` when you need a serialisable structure.

---

## Profiles

Profiles are the growth loop. Built-ins cover the common vendor patterns; real integrations (hospital-specific Epic instances, reference labs, HIEs) publish their own profile packages that extend the built-ins. The `defineProfile()` API treats built-ins and user-authored profiles as equal citizens — there's no second-class path.

### Authoring a profile

`defineProfile({ name, customSegments, dateFormats, onWarning, description })` returns a frozen `Profile` object. `customSegments` is a record mapping segment name -> `{ fields: { aliasName: 1-indexedPosition } }`.

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

Invalid input (missing name, malformed Z-segment name, unsupported date tokens, unknown option keys) throws `ProfileDefinitionError` with an actionable message. See [Error Handling](#error-handling).

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
- **`onWarning` handlers**: compose into a chain, invoked in lineage order (parents before children). Errors thrown by one handler do not stop subsequent handlers.
- **`name`**: never inherited — always the profile's own.

The merge is validated post-hoc: duplicate field names across merged segments throw `ProfileDefinitionError` up front, not at parse time.

### Inspecting a profile

Every `defineProfile()` result carries a `.describe()` method and an introspectable `lineage` array — useful for debugging which layers contributed what.

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

The [profile starter kit](./examples/profile-starter-kit/) is a complete publishable npm package template. Copy the subtree, replace placeholders, swap in your Z-segments and fixtures, then `pnpm publish --access public`. See [`examples/profile-starter-kit/CUSTOMIZING.md`](./examples/profile-starter-kit/CUSTOMIZING.md) for the 5-step walkthrough — rename, swap base profile, define Z-segments, write fixtures, publish.

### Built-in profiles

Seven profiles ship in the box, reachable via the `profiles` namespace:

- `profiles.epic` — Epic Bridges Interconnect. Adds `MM/DD/YYYY HH:mm:ss` and `MM/DD/YYYY` date formats; declares `ZDP` (department context) and `ZRS` (result status) Z-segments.
- `profiles.cerner` — Cerner Millennium outbound. Handles Cerner-idiomatic date formats and common Z-segments from Millennium ADT feeds.
- `profiles.meditech` — MEDITECH MAGIC/6.x/Expanse. Adds the `YYYYMMDDHHMM` minute-precision timestamp format and declares the DFT charge Z-segments `ZF1` (provider-encounter copay data) and `ZF2` (encounter-procedure data). Grounded in the public [MEDITECH Ancillary Charges (LAB/PHA/ITS/IDM) Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/ancillary-charges-outbound-21.pdf) (v2.1) spec, with the date format also confirmed by the [MEDITECH Admissions and Registration Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/admissions-registration-outbound-24.pdf) (v2.4) spec.
- `profiles.athena` — athenahealth. Ambulatory-oriented, ISO-leaning date formats.
- `profiles.genericLab` — Generic reference-lab (LabCorp / Quest-style). Adds `YYYYMMDD HHmm` (ASTM-era) and `YYYY-MM-DD` (ISO date-only); declares `ZLB` (lab overrides) and `ZNT` (lab note) Z-segments.
- `profiles.visage` — Visage 7 imaging/PACS RIS feeds. Declares the `ZDS` Z-segment that carries the DICOM **Study Instance UID** (field 1) so an HL7 order correlates to its DICOM study — the IHE Radiology RIS/PACS bridge segment. Grounded in the public [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf) (V23.00, Jun 2026). Dates are HL7-native, so it adds no date formats.
- `profiles.philips` — Philips Vue PACS ("IS Link") imaging feeds. Declares six Vue PACS Z-segments, one per filler role: `ZDS` (DICOM Study Instance UID), `ZLK` (linked studies/orders), `ZAO` (order additional details — modality, body part, transfer/acquisition status, technician + radiologist), `ZEB` (encrypted patient info), `ZAP` (patient additional details), and `ZAV` (visit additional details). Grounded in the public [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf) (Philips, doc HA1669 Rev A, §§5.11–5.16). Dates are HL7-native, so it adds no date formats.

Use a built-in directly (`parseHL7(raw, profiles.epic)`) or as a base for your own (`defineProfile({ extends: profiles.epic, ... })`).

---

## Real-World Tolerance

Production HL7 traffic routinely violates the published spec — trailing whitespace, MLLP framing, mixed-case segment names, unknown escape sequences, non-canonical timestamps. A parser that rejects those messages is useless on real integrations. Postel's Law applies: the parser is liberal, the emitter is conservative.

Every deviation the parser encounters is classified into one of four tiers:

| Tier | Behavior       | When                           | Example codes            |
| ---- | -------------- | ------------------------------ | ------------------------ |
| 0    | Silent         | Spec-compliant input           | —                        |
| 1    | Auto-handled   | Trivial deviation, no warning  | Trailing whitespace tidy |
| 2    | Warning        | Recoverable deviation          | `MLLP_FRAMING_STRIPPED`  |
| 3    | Fatal (always) | Unrecoverable structural error | `NO_MSH_SEGMENT`         |

Tier-2 warnings are plain data attached to `msg.warnings`. Every warning carries a stable string `code`, a human-readable `message`, and a `position` with 1-indexed `segmentIndex`/`fieldIndex`/etc. so you can programmatically react to specific deviations:

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
for (const w of msg.warnings) {
  console.log(`${w.code} at segment ${w.position.segmentIndex}: ${w.message}`);
}
```

The full list of Tier-2 codes (16 entries — `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`, `UNKNOWN_ESCAPE_SEQUENCE`, `TIMESTAMP_FALLBACK_FORMAT`, `SEGMENT_CASE`, `EXTRA_FIELDS`, `UNKNOWN_SEGMENT`, `DUPLICATE_REQUIRED_SEGMENT`, `ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `MISSING_EXPECTED_GROUP`, `OUT_OF_ORDER_SEGMENT`, `VERSION_MISMATCH`, `UNKNOWN_CHARSET`, `ACK_NO_CORRELATION_ID`, `MERGE_MISSING_PRIOR_OR_SURVIVOR`) lives in [`src/parser/warnings.ts`](./src/parser/warnings.ts). Narrow on `w.code === WARNING_CODES.UNKNOWN_SEGMENT` (and friends) for typo-free comparisons.

Need zero tolerance instead? `parseHL7(raw, { strict: true })` escalates every Tier-2 deviation to a thrown `Hl7ParseError`. Use strict in CI validators; leave it off for production ingestion.

The 4 Tier-3 fatal codes — `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT` — always throw regardless of mode. They represent inputs the parser can't meaningfully recover from.

---

## Error Handling

The library throws exactly three error types, all exported from the package barrel.

### `Hl7ParseError`

Thrown by `parseHL7` when the input hits one of the 4 Tier-3 fatal codes (see above). Carries positional context plus a short snippet of the offending input.

```ts
import { parseHL7, Hl7ParseError, FATAL_CODES } from "@cosyte/hl7";

try {
  parseHL7("");
} catch (err) {
  if (err instanceof Hl7ParseError) {
    console.log(err.code); // "EMPTY_INPUT"
    console.log(err.position); // { segmentIndex: 0 }
    console.log(err.snippet); // "" (first 40 chars of input, for logging)
  }
}

// Narrow exhaustively with the FATAL_CODES registry:
if (err instanceof Hl7ParseError && err.code === FATAL_CODES.NO_MSH_SEGMENT) {
  // ...
}
```

`Hl7ParseError.snippet` may contain PHI when parsing real clinical messages. The library does NOT redact — redact at your call site if compliance demands it.

### `Hl7ParseWarning`

Tier-2 deviations — plain data, not thrown. Accumulated on `msg.warnings` and delivered to any `onWarning` callback in parse order. See the iteration example in [Real-World Tolerance](#real-world-tolerance).

```ts
import type { Hl7ParseWarning, WarningCode } from "@cosyte/hl7";

function label(w: Hl7ParseWarning): string {
  const c: WarningCode = w.code;
  switch (c) {
    case "MLLP_FRAMING_STRIPPED":
      return "framed input";
    case "UNKNOWN_SEGMENT":
      return `unknown: ${w.message}`;
    default:
      return c;
  }
}
```

Use the `WarningCode` union + `switch` for exhaustive handling — the type system catches missing cases if you enable `switch-exhaustiveness-check`.

### `ProfileDefinitionError`

Thrown by `defineProfile()` when the options are structurally invalid. Covers the four failure modes locked by the profile system:

```ts
import { defineProfile, ProfileDefinitionError } from "@cosyte/hl7";

try {
  defineProfile({
    name: "broken",
    customSegments: {
      AB: { fields: { foo: 1 } }, // bad: segment name must match /^Z[A-Z0-9]{2}$/ or similar
    },
  });
} catch (err) {
  if (err instanceof ProfileDefinitionError) {
    console.log(err.profileName); // "broken"
    console.log(err.message); // actionable diagnostic
  }
}
```

The four cases that throw `ProfileDefinitionError`:

1. **Missing or non-string `name`** — every profile must identify itself.
2. **Malformed `customSegments`** — segment name must pass the Z-segment regex; each field entry must map to a positive 1-indexed integer; no duplicate field names across merged segments.
3. **Unsupported `dateFormats` tokens** — tokens must be drawn from `SUPPORTED_DATE_TOKENS` (re-exported from the package barrel for introspection).
4. **Unknown option keys** — the options bag is closed; typos throw with "did you mean" hints.

All three error types (and the `FATAL_CODES` / `WARNING_CODES` registries, and the `SUPPORTED_DATE_TOKENS` set) are top-level exports — no internal reaching required.

---

## Roadmap

Not in v1, but on the roadmap for v2:

- **Typed message overlays** (`msg.is("ADT^A01")` narrows to `AdtA01Message`) — message-type-aware getter narrowing.
- **Schema-aware structure validation** — opt-in structural validator that enforces segment ordering + cardinality against the HL7 spec.
- **Streaming parser for large batch files** — `createHL7Stream()` returning an iterable of messages, for multi-GB batch processing.
- **JSON Schema / Zod emission for `toJSON()` output** — autogenerated schemas from the internal typed model.
- **Type-safe custom-segment field names via conditional types** — `seg.get("departmentCode")` narrows to the profile's declared field alias, not `string | undefined`.

### Out of scope (permanently)

- **MLLP framing / network transport** — a future `@cosyte/hl7-mllp` package will cover network IO; this library is parser-only.
- **HL7 v3 and CDA** — different spec family entirely; not in our plans.
- **FHIR conversion** — a future companion package could bridge, but the conversion is non-trivial and deserves its own repo.
- **Exhaustive coded-value validation** — we validate structure, not every HL7 table. Integrate a domain validator (e.g. your LIS's internal code registry) for that.

---

## Contributing

Vendor-quirk fixtures, profile improvements, and standalone profile packages are all welcome. The more real-world edge cases the test suite covers, the more robust the parser gets — every published profile package is a signal of adoption and a contribution back.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, how to file an issue, and how to submit a PR.

---

## Trademarks

Epic, Cerner, MEDITECH, athenahealth, LabCorp, Quest Diagnostics, Visage (Visage Imaging), and Philips (Vue PACS) are trademarks of their respective owners. cosyte is not affiliated with, endorsed by, or
sponsored by any of them — the names identify the systems whose real-world message quirks the built-in profiles accommodate. See [TRADEMARKS.md](./TRADEMARKS.md).

## License

MIT — see [LICENSE](./LICENSE).

---

_Built by [Cosyte](https://cosyte.com)._
