# Cookbook: message recipes

Runnable recipes for reading and rewriting the message types developers hit most often.

### Patient demographics

Reach for the `msg.patient` helper for the name, record-number and date-of-birth trio that covers 95% of demographic extractions.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
const p = msg.patient;

console.log(p?.mrn); // "MRN12345"
console.log(p?.fullName); // "Jane Q. Smith"
console.log(p?.dateOfBirth?.raw); // "19800115" (PID-7: fidelity TS at day precision)
console.log(p?.sex); // "F"
console.log(p?.address?.city); // XAD composite
```

`msg.patient` is `undefined` when the message has no `PID` segment. Use `?.` consistently. The `address` field is an `XAD` composite with `streetAddress`, `city`, `state`, `zip`, `country`. `dateOfBirth` (and every datetime) is a **fidelity `TS`**. See [Datetime precision & timezone fidelity](./cookbook-datetime.md#datetime-precision--timezone-fidelity).

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

The `msg.visit` helper surfaces `PV1` data including the `PL` (Person Location) composite: ward / room / bed / facility in one go.

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

`setField` mutates the positional tree in-place; `toString()` emits spec-clean HL7 (Postel's Law). See [`examples/modify-and-resend.ts`](../examples/modify-and-resend.ts) for the end-to-end script.

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

// SIU, appointments(): SCH id/status/timing + AIS/AIG/AIL/AIP resources
for (const appt of parseHL7(raw).appointments()) {
  console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier); // status verbatim
  const provider = appt.resources.find((r) => r.kind === "personnel");
  console.log(provider?.person?.familyName);
}

// MDM, documents(): completion (TXA-17) and availability (TXA-19) are DISTINCT
for (const doc of parseHL7(raw).documents()) {
  console.log(doc.completionStatus, doc.availabilityStatus); // e.g. "IP" (in progress) + "AV" (available)
  // never conflated: a document can be AVAILABLE before it is AUTHENTICATED;
  // reading a preliminary document as final is the harm this split prevents.
}

// DFT, charges(): FT1 billing fields, amounts kept as canonical wire text (no money-as-float)
for (const charge of parseHL7(raw).charges()) {
  console.log(charge.transactionType, charge.transactionCode?.identifier);
  console.log(charge.amountExtended); // e.g. "150.00^USD": a string, never a number
}
```

These are **breadth** helpers: they surface the common trigger events' core fields, not a scheduling-workflow state machine, signature verification, or a claims/pricing engine (see the known limitations in the docs).

### Order & medication timing

Every `Order` (from `msg.orders()`) and `Medication` (from `msg.medications()`) carries a `timings` array: the `TQ1` segment (HL7 v2.5+) or the legacy embedded TQ in `ORC-7` / `RXE-1` (pre-v2.5).

```ts
import { parseHL7 } from "@cosyte/hl7";

const med = parseHL7(raw).medications()[0];

for (const t of med?.timings ?? []) {
  console.log(t.source); // "TQ1" or "legacy"
  console.log(t.repeatPattern?.code); // "Q6H": VERBATIM, never resolved to a schedule
  console.log(t.repeatPattern?.kind); // "parametric" (provenance only)
  console.log(t.repeatPattern?.interval); // { count: 6, unit: "H" }, the load-bearing integer
  console.log(t.totalOccurrences); // 24, from TQ1-14 (not TQ1-11)
  console.log(t.startDateTime?.raw, t.startDateTime?.precision);
}
```

The repeat pattern (Table 0335) is surfaced **verbatim**: hl7 never normalizes a sig, resolves `Q6H` to clock times, or maps it to a different frequency (reading `Q6H` as "daily", or losing a `BID`, changes the administered dose count). The `kind` flag (`parametric`/`named`/`unknown`) is provenance only and never drives a schedule; a parametric `Q<n><unit>` template's integer is never dropped. See `docs-content/spec-notes-timing.md` for the field map and non-goals.

### Patient merges and identity events

`msg.identityEvents()` recognizes the ADT identity-management trigger events: merges (A18/A34/A35/A36/A39/A40/A41/A42), moves (A43/A44/A45), identifier changes (A47/A49/A50/A51), link/unlink (A24/A37), and person add/update (A28/A31). It surfaces every party **labelled by role**. On a merge, move or change, the MRG segment carries the _prior_ (non-surviving) identifiers and the PID carries the _surviving_ ones; the direction is the spec constant `MRG_TO_PID` and is never inferred from content.

The recognized set is floored by the published message structures: every ADT trigger event whose structure requires an MRG segment is recognized, so the read side cannot fall behind the structures the parser validates against. `kind` stays meaningful across that floor: an identifier change (`"change"`) replaces one identifier on one record and is never reported as a `"merge"`, so a consumer that acts only on `kind === "merge"` never starts conflating records on an event it did not expect.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(rawA40);

for (const ev of msg.identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving && ev.warnings.length === 0) {
    // retire ev.prior.identifiers in favour of ev.surviving.identifiers
    console.log(ev.prior.identifiers[0]?.idNumber, "->", ev.surviving.identifiers[0]?.idNumber);
  } else if (ev.warnings.length > 0) {
    // incomplete MRG->PID pair (MERGE_MISSING_PRIOR_OR_SURVIVOR), route for review
  }
}
```

A mis-applied merge conflates two patients or orphans data under a retired record number, so the helper is deliberately conservative: an incomplete pair (no MRG, an orphaned MRG, or a PID with no surviving identifier) surfaces whatever _is_ present plus a `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on the event: the MRG is never dropped, and the direction is never guessed. The MRG field map is version-scoped: the backward-compat single-ID fields (PID-2 / MRG-4, withdrawn as of HL7 v2.7) are not read when MSH-12 declares v2.7+. Note that `@cosyte/hl7` _surfaces_ the merge. Actually re-pointing stored data to the survivor is your integration engine's job.
