---
id: handle-patient-merges
title: Handle patient merges and identifier changes
sidebar_label: Handle patient merges
description: "Read an ADT merge, move or identifier change with each party labeled by role, and route an incomplete one for review instead of guessing."
---

# Handle patient merges and identifier changes

A merge applied the wrong way round joins two patients' records or leaves data under a retired
number. `msg.identityEvents()` reads the ADT identity-management events with every party labeled
by its role, so your code never has to infer which record survives.

## Read a merge

On a merge, move or identifier change the MRG segment carries the prior identifiers and the PID
carries the surviving ones. The direction is the constant `MRG_TO_PID`, never inferred from the
content.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EHR|MAIN|MPI|REF|20260419101500||ADT^A40^ADT_A39|EX00020|P|2.5",
  "EVN|A40|20260419101500",
  "PID|1||MRN22222^^^HOSP^MR||Smith^Jane^Q",
  "MRG|MRN11111^^^HOSP^MR",
].join("\r");

const [event] = parseHL7(raw).identityEvents();

event?.kind; // => "merge"
event?.direction; // => "MRG_TO_PID"
event?.prior?.identifiers[0]?.idNumber; // => "MRN11111"
event?.surviving?.identifiers[0]?.idNumber; // => "MRN22222"
event?.warnings; // => []
```

## Route an incomplete event for review

When the pair is incomplete (no MRG, an MRG with no PID, or a PID with no surviving identifier),
the event carries what is present and a `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning. Act on an event
only when both sides are there and it carries no warning.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|EHR|MAIN|MPI|REF|20260419101500||ADT^A40^ADT_A39|EX00021|P|2.5",
  "EVN|A40|20260419101500",
  "PID|1||MRN22222^^^HOSP^MR||Smith^Jane^Q",
].join("\r");

const [event] = parseHL7(raw).identityEvents();

event?.prior; // => undefined
event?.warnings.map((w) => w.code); // => ["MERGE_MISSING_PRIOR_OR_SURVIVOR"]

const safeToApply =
  event?.kind === "merge" && event.prior !== undefined && event.surviving !== undefined;
safeToApply; // => false
```

## What counts as an identity event

The recognized events are the merges (A18, A34, A35, A36, A39, A40, A41, A42), the moves (A43, A44,
A45), the identifier changes (A47, A49, A50, A51), link and unlink (A24, A37), and person add and
update (A28, A31). Every ADT trigger event whose published structure requires an MRG segment is
recognized. An identifier change has `kind: "change"` and is never reported as a merge, so code that
acts only on `kind === "merge"` never conflates records on an event it did not expect.

The library reports the event. Moving stored data to the surviving record is your integration
engine's job. [Patient-identity and merge events](./spec-notes-identity.md) has the field map and
the version rules.

## Reference

- [`IdentityEvent`](./api/src/README.md#identityevent),
  [`IdentityParty`](./api/src/README.md#identityparty),
  [`IdentityEventKind`](./api/src/README.md#identityeventkind)
- [`MERGE_MISSING_PRIOR_OR_SURVIVOR`](./warning-and-fatal-codes.md)
