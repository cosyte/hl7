# Spec notes — version-sensitivity matrix (Phase H)

`@cosyte/hl7` parses HL7 v2 messages **structurally across v2.1–v2.8**. It does
**not** transform a message between versions, and it is not a version validator
— it reads what the sender sent, tolerantly (Postel's Law), and surfaces a
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
| **MSH-2 encoding chars** | v2.7 allows a 5th char (truncation `#`) → MSH-2 may be 5 chars | Accepted; the standard escape set is recognized (Phase A). |
| **Composite component growth** | Composites gain trailing components across versions (CWE: 9 → 22 at v2.7) | Never assumed fixed; extra components preserved (see below), never truncated, never thrown on. |
| **CE → CWE** | CE deprecated v2.5, **withdrawn v2.6**; CWE is the successor coded element | Read uniformly — `asCe()` and `asCwe()` accept either shape; neither is lossy (see *CE↔CWE interchange*). |
| **CWE version ids** | CWE.7 / CWE.8 (coding-system version id, alternate version id) present from v2.5+ | Surfaced as `codingSystemVersionId` / `alternateCodingSystemVersionId` when present. |
| **CWE second-alternate triplet + OIDs** | CWE.10–CWE.22 added at v2.7 (second-alternate code triplet, coding-system / value-set OIDs) | Preserved verbatim on `extraComponents` — not yet modeled by name (v2 of this library may restore the full shape). |
| **TS → DTM** | TS (with a now-deprecated degree-of-precision component) superseded by DTM at v2.5 | One parse path covers both — only the timestamp component is read; the deprecated degree-of-precision component is ignored. Precision is recoverable from `.raw` (its string length encodes the precision). |
| **MSH-21** | Renamed **Conformance Statement ID → Message Profile Identifier** at v2.5 (datatype became EI) | No semantic change to parsing — MSH-21 is read positionally like any field. The rename is naming only; this note records it so the field is not mistaken for two different things. |

## Composite growth — the no-loss contract

A fixed-shape composite parser has two ways to mishandle a newer, longer value:
it can **throw** (assumed a maximum component count) or **silently truncate**
(modeled only the components it knew about). This library does neither:

- **No throw.** A coded element with any number of trailing components parses
  cleanly — verified by the `version-growth` property test (arbitrary component
  counts up to 25).
- **No loss.** Components past the modeled set are preserved verbatim, in
  order, on the composite's `extraComponents` array:
  - **`CWE.extraComponents`** — HL7 components **10+** (the v2.7 second-alternate
    triplet, coding-system / value-set OIDs).
  - **`CE.extraComponents`** — HL7 components **7+** (only populated when a
    CWE-shaped value is read through the CE accessor).

  An absent interior component is preserved as `""` so `extraComponents[i]`
  maps back to HL7 component `(modeled + 1) + i`. Trailing empty components are
  stripped, and the key is **omitted** entirely when there is nothing past the
  modeled set.

  Each entry is the component's first subcomponent (auto-unescaped) — the same
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

## Known limitations after Phase H

- **Structural parse, not transformation.** The library reads v2.1–v2.8
  messages; it does not up-/down-convert between versions.
- **No full v2.7 CWE model.** CWE.10–22 are preserved (above) but not surfaced
  by name; a consumer that needs the second-alternate triplet reads it
  positionally from `extraComponents`.
- **Not a conformance validator.** `VERSION_MISMATCH` is the only
  version-related warning; the parser does not assert that a message conforms to
  its declared version's segment/field rules.
