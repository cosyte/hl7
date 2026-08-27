---
id: spec-notes-structure
title: "Spec notes: message-type & structure awareness"
sidebar_label: Message-type & structure awareness
---

# Spec notes: message-type & structure awareness

`@cosyte/hl7` ships a **misroute / truncation safety net**: for the message
types it covers it knows which segments HL7's own published message-structure
definitions give a minimum of one, and tells you when a message does not carry
one of them. `msg.structure` is the read-side view; the parser also emits a
single additive Tier-2 `MISSING_EXPECTED_GROUP` warning per absent segment,
naming that segment.

This is **not** a conformance validator. It checks segment presence, not
ordering, cardinality or content, and it covers twelve message codes rather than
the whole standard. It never throws and never rewrites the message; `strict`
mode may promote the warning per the usual Postel's-Law model.

## Where the expectations come from

Every expectation is **derived**, not transcribed. The package vendors a
byte-for-byte snapshot of HL7's machine-readable message structures and derives
the registry from it offline; there is no leniency list, no suppression list and
no network call at build time or at run time.

The provenance ships with the code, so a warning can be audited without leaving
the package:

```ts runnable
import { STRUCTURE_REGISTRY_PROVENANCE, findMessageStructureDefinition } from "@cosyte/hl7";

STRUCTURE_REGISTRY_PROVENANCE.publication.repository; // => "HL7/v2ig"

// Which published structure is behind an ADT^A01 expectation, and which
// variants of it were read?
const def = findMessageStructureDefinition("ADT", "A01");
def?.structureId; // => "ADT_A01"
def?.structureIds.length; // => 4
def?.requiredSegments.join(","); // => "EVN,MSH,PID,PV1"
```

`STRUCTURE_REGISTRY_PROVENANCE` carries the publication and the exact commit it
was read at, the byte count, sha256 and upstream URL of all 83 vendored files,
the variant family behind each referenced structure, and the structure id behind
each recognized (message code, trigger event) pair.

## The three rules the derivation follows

1. **Effective minimum from the root.** A segment is expected only when its
   minimum is at least one **along the whole path from the structure root**. A
   segment the publication marks required inside a group it marks optional is
   therefore not expected, which is why a conformant `ORU^R01` with no `OBX` and
   no top-level `PID` stays warning-free.
2. **A variant family must agree.** The publication splits some structures into
   single-uppercase-letter variants (`ADT_A01-A` through `ADT_A01-D`) while its
   message list references the unsuffixed name (`ADT_A01`). The family of a
   referenced id is that id plus any id formed by appending a hyphen and exactly
   one uppercase letter, and a segment is expected only when **every** member of
   the family gives it a minimum of one. Where variants disagree the publication
   has not settled the question, and a warning heuristic takes the silent side.
3. **Unrecognized is silent.** A (message code, trigger event) pair with no
   registry entry yields `recognized: false` and emits nothing.

## What ships

`msg.structure.requiredSegments` lists the expectations for the matched type and
`msg.structure.missingSegments` lists the ones the message does not carry.
`missingGroups` is the same list under its older name.

| Message | Trigger events | Expected segments | Published structure |
| --- | --- | --- | --- |
| ACK | (message code alone) | `MSA`, `MSH` | `ACK` |
| ADT | A01, A04, A08, A13 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A01` |
| ADT | A02 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A02` |
| ADT | A03 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A03` |
| ADT | A05, A14, A28, A31 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A05` |
| ADT | A06, A07 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A06` |
| ADT | A09, A10, A11 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A09` |
| ADT | A12 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A12` |
| ADT | A15 | `EVN`, `MSH`, `PID`, `PRT`, `PV1` | `ADT_A15` |
| ADT | A16 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A16` |
| ADT | A17 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A17` |
| ADT | A20 | `EVN`, `MSH`, `NPU` | `ADT_A20` |
| ADT | A21, A22, A23, A25, A26, A27, A29, A32, A33 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A21` |
| ADT | A24 | `EVN`, `MSH`, `PID` | `ADT_A24` |
| ADT | A37 | `EVN`, `MSH`, `PID` | `ADT_A37` |
| ADT | A38 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A38` |
| ADT | A40, A41, A42 | `EVN`, `MRG`, `MSH`, `PID` | `ADT_A39` |
| ADT | A43, A49 | `EVN`, `MRG`, `MSH`, `PID` | `ADT_A43` |
| ADT | A44, A47 | `EVN`, `MRG`, `MSH`, `PID` | `ADT_A44` |
| ADT | A45 | `EVN`, `MRG`, `MSH`, `PID`, `PV1` | `ADT_A45` |
| ADT | A50, A51 | `EVN`, `MRG`, `MSH`, `PID`, `PV1` | `ADT_A50` |
| ADT | A52, A53 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A52` |
| ADT | A54, A55 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A54` |
| ADT | A60 | `EVN`, `MSH`, `PID` | `ADT_A60` |
| ADT | A61, A62 | `EVN`, `MSH`, `PID`, `PV1` | `ADT_A61` |
| DFT | P03 | `EVN`, `FT1`, `MSH`, `PID` | `DFT_P03` |
| DFT | P11 | `EVN`, `FT1`, `MSH`, `PID` | `DFT_P11` |
| MDM | T01, T03, T05, T07, T09, T11 | `EVN`, `MSH`, `PID`, `PV1`, `TXA` | `MDM_T01` |
| MDM | T02, T04, T06, T08, T10 | `EVN`, `MSH`, `OBX`, `PID`, `PV1`, `TXA` | `MDM_T02` |
| OMG | O19 | `MSH`, `OBR`, `ORC` | `OMG_O19` |
| OMI | O23 | `IPC`, `MSH`, `OBR`, `ORC` | `OMI_O23` |
| OML | O21 | `MSH`, `ORC` | `OML_O21` |
| OML | O33 | `MSH`, `ORC`, `SPM` | `OML_O33` |
| OML | O35 | `MSH`, `ORC`, `SAC`, `SPM` | `OML_O35` |
| OML | O39 | `MSH`, `ORC` | `OML_O39` |
| OML | O59_A | `MSH`, `ORC` | `OML_O59` |
| OMP | O09 | `MSH`, `ORC`, `RXO`, `RXR` | `OMP_O09` |
| ORM | O01 | `ORC` | (retained transcription) |
| ORU | R01, R40, R42, R43 | `MSH`, `OBR` | `ORU_R01` |
| ORU | R30, R31, R32 | `MSH`, `OBR`, `OBX`, `ORC`, `PID` | `ORU_R30` |
| SIU | S12 to S24, S26, S27 | `MSH`, `RGS`, `SCH` | `SIU_S12` |
| VXU | V04 | `MSH`, `PID` | `VXU_V04` |

`MSH` appears throughout because the publication requires it. It can never
produce this warning in practice: a message with no `MSH` fails earlier, with
the Tier-3 `NO_MSH_SEGMENT` error.

## What changed, difference by difference

The registry used to be a hand transcription of the v2.5.1 chapters covering
twelve message codes, eight ADT trigger events, and a hand-picked "anchor"
segment per group. Every difference between that table and the derived registry
is listed below, with the segment, the published minimum along the path from the
structure root, and an adjudication.

**Nothing here is a bug fix to your messages.** These are expectations that
widened, so a feed that already emitted non-conformant traffic will see warnings
it did not see before. Read the "before you upgrade" section at the end.

### Expectations added to a pair that was already recognized

| Pair | Segment | Published minimum | Adjudication |
| --- | --- | --- | --- |
| ADT^A01, A02, A03, A04, A05, A08, A11, A13 | `EVN` | 1 | Intended correction. The previous table excluded `EVN` deliberately, reasoning that "real senders omit it freely". That is a statement about senders, not about the standard, and it is exactly what stopped the library telling you an `ADT^A01` was missing a segment the standard marks required. All four published `ADT_A01` variants give `EVN` a minimum of one. |
| every recognized pair | `MSH` | 1 | Intended correction. Required in every published structure. Unreachable in practice: an `MSH`-less message is a Tier-3 parse error before this check runs. |
| ORU^R01 | `OBR` | 1 | Intended correction. `OBR` sits inside `ORDER_OBSERVATION`, which the publication gives a minimum of one inside `PATIENT_RESULT`, which it also gives a minimum of one. The previous table accepted `OBR` **or** `OBX`, so a report carrying only `OBX` was silent; it now warns. |
| OMG^O19 | `OBR` | 1 | Intended correction. The previous table excluded `OBR` from every order message on the reasoning that it is optional in some of them. It is optional in `OML_O21`, `OML_O39` and `OML_O59`, and required in `OMG_O19` and `OMI_O23`. Deriving per structure resolves what one hand-picked rule could not. |
| OMI^O23 | `OBR`, `IPC` | 1 | Intended correction. Same reasoning as `OMG^O19`; `IPC` (imaging procedure control) is required in the published imaging order. |
| OMP^O09 | `RXO`, `RXR` | 1 | Intended correction. The published pharmacy order requires the order and route segments. |
| SIU^S12 through S24, S26 | `RGS` | 1 | Intended correction. The published scheduling structure requires at least one resource group. |
| MDM^T02, T06 | `PV1`, `OBX` | 1 | Intended correction. `PV1` is required at the top level of every published `MDM_T02` variant, and the document content group carries a required `OBX`. Note that this repo's own document fixtures carry no `PV1` and so now warn: a true positive against the publication, and the clearest single illustration of the volume change. |
| DFT^P03 | `EVN` | 1 | Intended correction. |
| ACK | `MSH` | 1 | Intended correction. |

### Expectations removed or narrowed

| Pair | Segment | Published minimum | Adjudication |
| --- | --- | --- | --- |
| ORU^R01 | `OBX` | 0 | Intended correction. Every `OBX` in the published `ORU_R01` sits inside a group with a minimum of zero, so a conformant report can carry none. It used to be accepted as a substitute for `OBR`; it is now neither expected nor a substitute. |
| ORU^R01 | `NTE` | 0 (family disagreement) | Intended correction. Variants `ORU_R01-C` and `ORU_R01-D` give the order-observation `NTE` a minimum of one; `ORU_R01-A` and `ORU_R01-B` give it zero. Under the family rule the segment is not expected. |
| ADT^A20 | `PID`, `PV1` | 0 | Intended correction. A bed-status update carries no patient: the published `ADT_A20` requires `NPU` and neither `PID` nor `PV1`. The previous table applied one ADT shape to all eight of its trigger events, which is the failure mode that motivated deriving per structure. |
| ADT^A24, A37, A60 | `PV1` | 0 | Intended correction. These link, unlink and adverse-reaction events carry no visit in the publication. |
| SIU, VXU, ORU^R01 | `PID` | 0 | Unchanged, and re-derived rather than assumed. The previous table excluded `PID` from these on a documented judgement; the publication agrees. |

### Trigger events that became recognized

Nothing lost recognition. The registry recognized 32 explicit (message code,
trigger event) pairs plus `ACK` on the message code alone; it now recognizes 94
plus `ACK` on the message code alone.

| Message | Newly recognized trigger events |
| --- | --- |
| ADT | A06, A07, A09, A10, A12, A14, A15, A16, A17, A20, A21, A22, A23, A24, A25, A26, A27, A28, A29, A31, A32, A33, A37, A38, A40, A41, A42, A43, A44, A45, A47, A49, A50, A51, A52, A53, A54, A55, A60, A61, A62 |
| ORU | R30, R31, R32, R40, R42, R43 |
| OML | O33, O35, O39, O59_A |
| MDM | T01, T03, T04, T05, T07, T08, T09, T10, T11 |
| DFT | P11 |
| SIU | S27 |

### One retained transcription

`ORM^O01` is the only entry that is not derived, and it is marked as such in the
registry:

```ts runnable
import { findMessageStructureDefinition } from "@cosyte/hl7";

const orm = findMessageStructureDefinition("ORM", "O01");
orm?.derivation; // => "retained-transcription"
orm?.structureId; // => ""
orm?.requiredSegments.join(","); // => "ORC"
```

The publication carries no `ORM_O01` at all: it is absent from the 305-entry
message-structure manifest and its raw path answers 404. `ORM^O01` is the
commonest legacy order message and the registry recognized it before, so
dropping it would have been a silent loss of coverage. Its expectation is
unchanged from the transcription (`ORC`), and `retainedReason` on the entry
carries this paragraph's reason in one sentence.

### Pairs the publication leaves unresolved

Eight `ADT` merge and change-identifier messages appear in the publication's
message list with no structure named: A18, A30, A34, A35, A36, A39, A46 and A48.
They are recorded as unresolved by the generator, and the parser stays silent on
them rather than guessing a shape. None of them was recognized before, so
nothing regressed.

## Before you upgrade: the volume change

Three things changed at once, and all three point the same way:

1. **More trigger events are recognized**, so messages that used to be
   `recognized: false` and silent are now checked.
2. **More segments are expected per pair**, most visibly `EVN` across the whole
   ADT family and `PV1` in `MDM`.
3. **The warning names a segment rather than a group label**, so
   `missingGroups` now holds values like `"EVN"` where it used to hold
   `"patient"`.

The net effect is that **warning volume rises on non-conformant traffic**. If
your channel treats a `MISSING_EXPECTED_GROUP` warning as a rejection, sample
your traffic before upgrading: an interface that quietly omits `EVN` has been
accepted until now and will start being rejected. Nothing else changed. The
warning is still Tier-2 and additive, lenient parse still never throws on it,
the message is never rewritten, and an unrecognized type is still silent.

## PHI

None. The warning message carries only structural identifiers: the message type,
the segment name and the published structure id, never a field value. The
message type is shape-checked before it is interpolated and withheld wholesale
if it does not match, rather than truncated.

## Known limitations

- **Coverage is twelve message codes.** Widening it means adding structures to
  the vendored snapshot and re-running the generator.
- **Presence, not cardinality or order.** A message carrying one malformed `OBR`
  satisfies an `OBR` expectation.
- **The publication is a moving target.** It is vendored at a fixed commit and
  its publisher states that the guide is in development and not yet production
  ready. The expectations here are that publication's, and where they differ
  from a given v2 release the difference is not adjudicated.
- **A family disagreement always resolves to silence.** Where variants disagree
  the segment is not expected, so the net is quieter than the strictest variant
  would be.
- **`OML^O59_A` and other underscore-bearing trigger events** are recognized,
  but the message type is withheld from the warning text because it does not
  match the identifier shape the warning layer permits. The segment name and the
  structure id are still named.

## References

- HL7's published, machine-readable v2+ message structures, vendored under
  `vendor/hl7-v2ig/` with per-file hashes and upstream URLs.
- `STRUCTURE_REGISTRY_PROVENANCE`, the same record exported from the package.
