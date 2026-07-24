---
id: spec-notes-structure
title: "Spec notes: message-type & structure awareness (Phase G)"
sidebar_label: Message-type & structure awareness
---

# Spec notes: message-type & structure awareness (Phase G)

`@cosyte/hl7` ships a conservative **misroute / truncation safety net**: for the
common message types it knows whether the core segment groups the HL7 v2.5.1
abstract message syntax marks **Required (R)** for that trigger event are
actually present. `msg.structure` is the read-side view; the parser also emits a
single additive Tier-2 `MISSING_EXPECTED_GROUP` warning per absent group.

This is **not** a conformance validator. It models only the genuinely-Required
*anchor* segments (never optional groups), so a conformant-but-sparse message
can never trip a false positive. It never throws and never rewrites the message;
`strict` mode may promote the warning per the usual Postel's-Law model.

## Why per trigger event, not per family

The claim that an ADT family shares one shape is false. Trigger events diverge
by version and event. Every entry keys on the **(MSH-9.1 message code, MSH-9.2
trigger event)** pair. An `ACK` carries no trigger event, so its entry matches on
message code alone.

## What ships (the frozen `MESSAGE_STRUCTURE_DEFINITIONS` registry)

A group is **present** if ANY of its anchor segments appears (the conservative
direction, it suppresses a warning rather than inventing one). Only Required
anchors are listed.

| Message | Trigger events | Required group(s) → anchor segment(s) | Chapter (v2.5.1) |
|---|---|---|---|
| ADT | A01, A02, A03, A04, A05, A08, A11, A13 | patient → `PID`; visit → `PV1` | Ch. 3 |
| ORU | R01 | result → `OBR`/`OBX` | Ch. 7 |
| ORM | O01 | order → `ORC` | Ch. 4 |
| OML | O21 | order → `ORC` | Ch. 4 |
| OMG | O19 | order → `ORC` | Ch. 4 |
| OMP | O09 | order → `ORC` | Ch. 4 |
| OMI | O23 | order → `ORC` | Ch. 4 |
| SIU | S12–S24, S26 | schedule → `SCH` | Ch. 10 |
| MDM | T02, T06 | patient → `PID`; document → `TXA` | Ch. 9 |
| DFT | P03 | patient → `PID`; financial → `FT1` | Ch. 6 |
| VXU | V04 | patient → `PID` | CDC IG |
| ACK | (code only) | acknowledgment → `MSA` | Ch. 2 |

## Deliberate exclusions (the false-positive guards)

Each of these is Optional in the relevant abstract syntax, so anchoring on it
would warn on conformant messages. They are excluded **on purpose**:

- **EVN in ADT**: present in the syntax but a weak signal; real senders omit it
  freely, so it is not used as an anchor.
- **PID in ORU^R01**: the patient-result group nests PID, but a result-only
  relay can legitimately top-route without it; the true truncation signal is the
  absence of the `OBR`/`OBX` result segments themselves.
- **OBR in OML/OMG/OMI**: carried inside an Optional observation-request group;
  anchoring only on `ORC` avoids a false positive on an order with no
  observation request.
- **PID in SIU**: the SIU patient group is Optional; only `SCH` is Required.
- **RXA in VXU^V04**: lives in the CDC IG's Optional order group, so a
  query-shaped VXU with no administered vaccine must not warn; only `PID` anchors.

Other trigger events of a recognized message code (e.g. `ADT^A06`, `SIU^S25`) and
entirely unmodelled types (e.g. `QRY^A19`) yield `recognized: false` and emit
nothing.

## PHI

None. The warning message carries only structural facts: the message type, the
group name, and the anchor segment names, never a field value.

## Known limitations after Phase G

- Recognizes the common types' **core Required groups only**. It is a safety
  net, not an abstract-message-syntax or IHE conformance validator (a permanent
  non-goal).
- Presence is checked at the **segment-name** level, not group cardinality or
  ordering: an `ORU` with an `OBR` but a malformed result group still counts the
  result group as present.
- The recognized-type set is intentionally narrow; widening it (more trigger
  events, more message codes) is additive future work.

## References

- **HL7 v2.5.1** abstract message syntax: Ch. 2 (control/ACK), Ch. 3 (ADT),
  Ch. 4 (orders), Ch. 6 (financial), Ch. 7 (observation), Ch. 9 (medical
  records / MDM), Ch. 10 (scheduling).
- **CDC HL7 v2.5.1 Implementation Guide for Immunization Messaging** (VXU^V04).
