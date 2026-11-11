---
id: spec-notes-version-matrix
title: "Spec notes: version-sensitivity matrix"
description: "How the parser reads HL7 v2.1 through v2.9 structurally without transforming between versions, and when a VERSION_MISMATCH warning is raised."
sidebar_label: Version-sensitivity (v2.1 to v2.9)
---

# Spec notes: version-sensitivity matrix

`@cosyte/hl7` parses HL7 v2 messages **structurally across v2.1 to v2.9**. It does
**not** transform a message between versions, and it is not a version validator.
It reads what the sender sent, tolerantly (Postel's Law), and surfaces a
single `VERSION_MISMATCH` warning only when MSH-12 disagrees with an explicitly
expected version (profile / `ParseOptions`).

The HL7 v2 wire format is deliberately backward-friendly: segments and
composites grow **append-only** (new trailing fields / components), delimiters
and the segment grammar are stable, and a receiver is expected to ignore what
it does not model rather than reject the message. This library leans on that:
the parser never assumes a fixed component count, and never silently truncates
content it does not yet name.

## What is version-sensitive (and how this library handles it)

| Area | Version event | Handling |
|---|---|---|
| **MSH-2 encoding chars** | v2.7 allows a 5th char (truncation `#`) → MSH-2 may be 5 chars | Accepted; the standard escape set is recognized. |
| **Composite component growth** | Composites gain trailing components across versions (CWE: 9 → 22 at v2.7) | Never assumed fixed; extra components preserved (see below), never truncated, never thrown on. |
| **CE → CWE** | CE deprecated v2.5, **withdrawn v2.6**; CWE is the successor coded element | Read uniformly: `asCe()` and `asCwe()` accept either shape; neither is lossy (see *CE↔CWE interchange*). |
| **CWE version ids** | CWE.7 / CWE.8 (coding-system version id, alternate version id) present from v2.5+ | Surfaced as `codingSystemVersionId` / `alternateCodingSystemVersionId` when present. |
| **CWE second-alternate triplet + OIDs** | CWE.10 to CWE.22 added at v2.7 (second-alternate code triplet, coding-system / value-set OIDs) | Read by name (`secondAlternateIdentifier` through `secondAlternateValueSetVersionId`) and also kept verbatim on `extraComponents`, as before they had names. See [Data types by name](./data-types.md). |
| **TS → DTM** | TS (with a now-deprecated degree-of-precision component) superseded by DTM at v2.5 | One parse path covers both: only the timestamp component is read; the deprecated degree-of-precision component is ignored. Precision is recoverable from `.raw` (its string length encodes the precision). |
| **MSH-21** | Renamed **Conformance Statement ID → Message Profile Identifier** at v2.5 (datatype became EI) | No semantic change to parsing. `msg.meta.messageProfileIdentifiers` reads each MSH-21 repetition as an `EI`. The rename is naming only; this note records it so the field is not mistaken for two different things. |
| **New segments** | Each version adds segments: ARV and UAC at v2.6, PRT at v2.7, RXV at v2.8, OH1 to OH4 at v2.9 | Recognized: `KNOWN_SEGMENTS` holds every standard segment name of v2.1 to v2.9, so none of them raises `UNKNOWN_SEGMENT` (see *Which segments are known*). |
| **v2.9 composite growth** | CX gains CX.11 Security Check and CX.12 Security Check Scheme (10 → 12 components); XPN gains XPN.15 Called By (14 → 15); XPN.6 Degree is listed as ST (see the [standard reference](./spec-notes-primer.md)) | Read, never thrown on: `asCx()` and `asXpn()` return the components they model (10 and 14), and the added ones are read by position like any component (`msg.get("PID.3.11")`, `msg.get("PID.5.15")`). |

## Which segments are known

A segment whose name is neither a standard HL7 v2 segment nor declared by the
active profile raises `UNKNOWN_SEGMENT`. The standard names are every segment
any version from v2.1 to v2.9 defines, each with the version that introduced
it, taken from two published lists the repository vendors under
`vendor/segment-names/`: the per-version segment tables of hl7apy for v2.1 to
v2.8.2, and HL7's own v2+ segment list for v2.9. Segments a later version
dropped (EQL, ERQ, SPR and VTQ leave at v2.6) stay known, since a message of
the version that defined them is still valid. A test recomputes the list from
the vendored files and fails if the shipped set differs by one name.

Two limits of the sources, stated rather than hidden: hl7apy carries no v2.7.1,
so a segment first published there is dated v2.8; and the v2.9 names come from
the v2+ publication, which continues v2.9, so a name dated v2.9 may have been
added by a later v2+ ballot.

## Composite growth: the no-loss contract

A fixed-shape composite parser has two ways to mishandle a newer, longer value:
it can **throw** (assumed a maximum component count) or **silently truncate**
(modeled only the components it knew about). This library does neither:

- **No throw.** A coded element with any number of trailing components parses
  cleanly, verified by the `version-growth` property test (arbitrary component
  counts up to 25).
- **No loss.** Components past the modeled set are preserved verbatim, in
  order, on the composite's `extraComponents` array:
  - **`CWE.extraComponents`**: HL7 components **10+** (the v2.7 second-alternate
    triplet, coding-system / value-set OIDs). Components 10 to 22 are also read
    by name; the array keeps starting at component 10 so code that reads it by
    position keeps working.
  - **`CE.extraComponents`**: HL7 components **7+** (only populated when a
    CWE-shaped value is read through the CE accessor).

  An absent interior component is preserved as `""` so `extraComponents[i]`
  maps back to HL7 component `(modeled + 1) + i`. Trailing empty components are
  stripped, and the key is **omitted** entirely when there is nothing past the
  modeled set.

  Each entry is the component's first subcomponent (auto-unescaped), the same
  projection the modeled coded-element components use. Coded-element components
  beyond the modeled set do not carry subcomponents in any HL7 version, so this
  is lossless for CWE/CE; a multi-subcomponent extra component (not expected for
  these datatypes) would surface only its first subcomponent.

## CE↔CWE interchange

CE and CWE share their first six components (identifier / text / coding-system
trio, repeated for the alternate). CE is the older, withdrawn form; CWE is its
superset. Because both accessors preserve everything past the modeled set on
`extraComponents`, **neither accessor is lossy on the other's shape**:

- `asCwe()` on a CE-shaped value → the 6 shared components, no `extraComponents`.
- `asCe()` on a CWE-shaped value → the 6 shared components, with CWE.7+
  (version ids, original text, v2.7 extensions) preserved on `extraComponents`.

So a downstream that picked the "wrong" accessor for the sender's version still
sees all the data; it never silently loses the version-id or alternate-coding
information.

## Known limitations

- **Structural parse, not transformation.** The library reads v2.1 to v2.9
  messages; it does not up-/down-convert between versions.
- **Not a conformance validator.** `VERSION_MISMATCH` is the only
  version-related warning; the parser does not assert that a message conforms to
  its declared version's segment/field rules.

## Put it to use

- [Read patient, visit and message details](./read-patient-and-visit.md)
- [Build a message](./build-messages.md)
