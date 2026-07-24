---
id: spec-notes-fhir-bridge
title: "Spec notes: FHIR-bridge IR-stability contract (Phase V)"
sidebar_label: FHIR-bridge IR contract
---

# Spec notes: FHIR-bridge IR-stability contract (Phase V)

> **IR Contract v1.0.0** · grounds against the HL7 **v2-to-FHIR** Implementation Guide
> **v1.0.0** (FHIR **R4**), commit `873b331b3890c8bc5d62ef9b4dabb41801aac70d`.

`@cosyte/hl7` is a **mapping source**, not a FHIR converter. It does **not** know about FHIR: it
constructs no resource, ships no ConceptMap, evaluates no FHIRPath, and translates no terminology.
That work lives in a separate package, **`@cosyte/transform`**, which maps hl7's parsed model to
FHIR using the public v2-to-FHIR IG.

This document is the **contract between the two**: the set of hl7 access paths `@cosyte/transform`
may build against, and the promise that hl7 will not churn them out from under it. It is **versioned**
so the bridge can be written once, against a pinned surface, without forcing retro-active hl7 changes.

Nothing here adds a v2→FHIR mapping to hl7. It documents and versions the IR hl7 **already** exposes,
and proves (over the IG's public sample corpus) that the source paths the IG references are
reachable from that IR (`test/fhir-bridge-coverage.test.ts`).

## Why a contract, and why versioned

The v2-to-FHIR IG keys every mapping off a v2 **`segment.field[.component]`** source address and a
handful of **datatype maps** (XPN→HumanName, CX→Identifier, CWE→CodeableConcept, DTM→dateTime, …). A
mapper is therefore only as stable as the parser's addressing and its typed-datatype surface. If hl7
renamed an accessor or changed an indexing convention, every `transform` map would silently break.

The contract pins exactly the surface a mapper needs, and puts a **semver posture** on it (below), so
`transform` can pin `@cosyte/hl7` by version and know what a bump can and cannot change.

## The stable mapping surface (the IR)

These are the access paths under contract. All are already-shipped, already-tested public API. This
phase adds no new runtime surface, it **freezes** the relevant existing one.

### 1. Source-path addressing: `msg.get` / `resolvePath` / `parsePath`

The IG's `segment.field[.component][.subcomponent]` addressing maps **one-to-one** onto hl7's
dot-path. The indexing conventions are contractual:

- **Segment occurrence** `SEG[n]`: **0-based** (omitted ⇒ first occurrence).
- **Field** `SEG.N`: **1-based**, HL7 field number. (`MSH.3` is the sending application.)
- **Field repetition** `SEG.N[r]`: **0-based** (omitted ⇒ first repetition).
- **Component** `.C` and **subcomponent** `.S`: **1-based**.
- **MSH offset** is handled internally: `MSH.1` is the field separator, `MSH.2` the encoding
  characters, `MSH.3` the sending application. The caller always uses HL7 field numbers.

`msg.get(path)` returns the decoded leaf (unescaped once at parse) or `undefined` on a missing path:
**never throws** on a missing value. `parsePath` validates the address shape without touching a
message (useful for a mapper that wants to pre-compile its source paths).

### 2. Segment / field wrappers: `msg.segments(type)`, `Segment.field(n)`, `Field`

For anything past a single leaf, the mapper walks wrappers:

- `msg.segments(type)` / `msg.allSegments()`: segment wrappers in document order (stable identity).
- `Segment.field(n)`: the `Field` at HL7 field number `n` (MSH-offset applied); returns a synthetic
  empty `Field` (never throws) on a missing field.
- `Field.value`: first-subcomponent decoded string. `Field.text`: the **whole field** as canonical,
  byte-verbatim wire text (repetitions/components included), for a field that must be carried whole.

### 3. Typed composites: the datatype-map inputs

The IG's datatype maps consume typed HL7 composites; hl7 surfaces all twelve as first-class shapes,
positional and verbatim (it does **not** reorder, default, or invent a component):

| Composite | Accessor                     | IG datatype map (examples)            |
| --------- | ---------------------------- | ------------------------------------- |
| XPN       | `Field.asXpn()` / `parseXpn` | `XPN[HumanName]` (PID-5, NK1-2)       |
| XAD       | `Field.asXad()` / `parseXad` | `XAD[Address]` (PID-11)               |
| CX        | `Field.asCx()` / `parseCx`   | `CX[Identifier]` (PID-3)              |
| CWE       | `Field.asCwe()` / `parseCwe` | `CWE[CodeableConcept]` (OBX-3, DG1-3) |
| CE        | `Field.asCe()` / `parseCe`   | `CE[CodeableConcept]`                 |
| XTN       | `Field.asXtn()` / `parseXtn` | `XTN[ContactPoint]` (PID-13)          |
| PL        | `Field.asPl()` / `parsePl`   | `PL[Location]` (PV1-3)                |
| TS        | `Field.asTs()` / `parseTs`   | timestamp composites                  |
| NM        | `Field.asNm()` / `parseNm`   | `NM[Quantity]` (OBX-5)                |
| SN        | `Field.asSn()` / `parseSn`   | `SN[Quantity]`/`Range`                |
| HD        | `Field.asHd()` / `parseHd`   | `HD[…]` assigning authorities         |
| XCN       | `Field.asXcn()` / `parseXcn` | `XCN[Practitioner]` (OBR-16)          |

### 4. Code-system provenance: the CodeableConcept ingredient

For CWE/CE the mapper needs the **claimed** code system (which becomes `Coding.system`). hl7 surfaces
it verbatim on the composite (`nameOfCodingSystem`, `alternateIdentifier`, `nameOfAlternateCodingSystem`)
and via `codingSystem` / `codingSystemOf` (HL7 Table 0396, read-only). hl7 does **not** validate or
translate the code. That is `@cosyte/transform` / a terminology service.

### 5. Datetime parts: `parseDtm` → `DtmParts`

The IG's DTM→dateTime map needs the **precision** (a `19941201` is a date, not a midnight instant)
and the **timezone**. `parseDtm(value)` returns a `DtmParts` with `precision`
(`year`/`month`/`day`/`hour`/`minute`/`second`/`fraction`), `hasTimezone`, `offsetMinutes`, and the
numeric parts: exactly the inputs the datatype map needs to choose `date` vs `dateTime` and re-format.

### 6. Decoded / rendered text: the narrative input

The IG maps FT/TX narrative (OBX-5, NTE) into `.text` / `DocumentReference`. hl7's text codec
(`decodeText`, `renderText`, `Field.render()` → `RenderedText`) turns §2.7 highlight/formatting
escapes (`\.br\`, `\H\`, …) into a normalized display model. The mapper never has to ship raw
sentinels downstream.

### 7. Message metadata: `msg.meta`, `msg.version`, `msg.encodingCharacters`

`msg.meta` (message type / trigger / control id / timestamp), `msg.version`, and
`msg.encodingCharacters` (the MSH-1 / MSH-2 delimiter inputs) round out the surface. `msg.warnings`
lets a mapper decide how to treat a lenient parse.

## The surface in one example

```ts runnable
import { parseHL7, resolvePath, parseDtm } from "@cosyte/hl7";

const raw = [
  "MSH|^~\\&|HIE|REDDING|||20230814022400||ORU^R01|MSGID|P|2.5.1",
  "PID|||MRN0003223^^^REDDING&1.1.1.1&GUID^MR||DOE^JANE||19800115|F",
  "OBX|1|NM|8867-4^Heart rate^LN||72|/min|||||F",
].join("\r");

const msg = parseHL7(raw);
const pid = msg.segments("PID")[0];
const obx = msg.segments("OBX")[0];

// 1. Source-path addressing: segment.field.component, one-to-one with the IG.
msg.get("PID.3.1"); // => "MRN0003223"
resolvePath("PID.5.1", msg.rawSegments, msg.encodingCharacters); // => "DOE"

// 3. Typed composites: the datatype-map inputs (positional, verbatim).
pid?.field(5).asXpn().familyName; // => "DOE"
pid?.field(3).asCx().identifierTypeCode; // => "MR"

// 4. Code-system provenance: becomes Coding.system downstream.
obx?.field(3).asCwe().nameOfCodingSystem; // => "LN"

// 5. Datetime precision: date vs dateTime is a mapping decision.
parseDtm(msg.get("PID.7") ?? "").precision; // => "day"
```

## Semver posture (the promise)

The mapping surface above follows the package's `0.0.x`-until-first-alpha ladder, and once alpha,
**semver**:

- **Additive** (a new composite accessor, a new optional field on a returned shape, a new helper): a
  **minor** bump. A mapper written against v1 keeps working.
- **Breaking** (renaming or removing a contracted accessor, changing an indexing convention, changing
  a decoded value's meaning, **renaming a warning code**): a **major** bump, announced, with a
  deprecation cycle where feasible. `transform` pins hl7 by major and reviews majors deliberately.
- **Not under contract** (may change without a major): the internal `RawSegment`/`RawField` tree shape
  reachable via `msg.rawSegments` is an **advanced-only** escape hatch, not the mapping surface. Map
  through the accessors above, not the raw tree. Warning _message wording_, `prettyPrint` formatting,
  and helper-view additions are not breaking.

## Coverage proof

`test/fhir-bridge-coverage.test.ts` grounds firsthand against the IG (the vendored raw segment-map
CSVs + the one public sample message, provenance in `test/fixtures/fhir-bridge/PROVENANCE.md`) and
proves three things, gaps recorded honestly:

1. **Addressability.** Every field-level source path the IG references (the `Identifier` column of the
   vendored segment maps) is addressable by hl7's dot-path model. **No hl7-side gap**. hl7 addresses
   every v2 field generically.
2. **Sample-corpus resolution.** Over the IG's public sample corpus, every IG-referenced source path
   the sample **populates** resolves through the IR. hl7 surfaces **100%** of the exercised paths.
3. **Datatype-IR surfacing.** The exact typed shapes the datatype maps consume (XPN, CX with
   assigning authority, CWE provenance, DTM precision + timezone, rendered narrative) surface from the
   sample.

### Coverage table: IG source paths over the public sample

The public sample corpus is, verified firsthand, **one** v2 message (`MDM^T02`), vendored as a
PHI-safe synthetic transcription (field-population, code systems, datetimes, and narrative escapes
preserved verbatim; Safe-Harbor identifiers substituted, see
`test/fixtures/fhir-bridge/PROVENANCE.md`). Per the segments it exercises (one canonical
target-resource map per segment):

| Segment (IG map)          | IG-referenced fields | Exercised by sample | hl7 surfaces |
| ------------------------- | -------------------: | ------------------: | -----------: |
| MSH `[MessageHeader]`     |                   28 |                   9 |        9 / 9 |
| EVN `[Provenance]`        |                    7 |                   1 |        1 / 1 |
| PID `[Patient]`           |                   40 |                   7 |        7 / 7 |
| PV1 `[Encounter]`         |                   54 |                   5 |        5 / 5 |
| ORC `[ServiceRequest]`    |                   38 |                   9 |        9 / 9 |
| TQ1 `[ServiceRequest]`    |                   14 |                   2 |        2 / 2 |
| OBR `[DiagnosticReport]`  |                   54 |                   7 |        7 / 7 |
| TXA `[DocumentReference]` |                   28 |                  16 |      16 / 16 |
| OBX `[Observation]`       |                   33 |                   7 |        7 / 7 |
| **Total**                 |              **296** |              **63** |  **63 / 63** |

### Recorded gaps (honest)

- **233 of 296** IG-referenced field paths are **not exercised** by the single public sample. This is
  a **corpus-coverage gap**, not a hl7 reachability gap. hl7 addresses all 296 generically; the thin
  public sample set simply does not populate them. A richer corpus (a private de-identified feed, or
  the IG adding samples) would raise the _exercised_ number without any hl7 change.
- The denominator counts **one canonical target-resource map per segment**. Other target-resource
  maps exist (e.g. `OBX[DocumentReference]`, `PID[Account]`, `MSH[Bundle]`); including them widens the
  referenced-path set but does not change the finding.
- The IG's machine-readable source addresses (the `Identifier` column) are **field-level** (`SEG-N`).
  Deeper component references appear in the IG's prose/condition columns, not the computable column;
  hl7 addresses those too (`SEG.N.C`), but they are outside this pinned count.

## What this is not

- **Not a FHIR converter.** hl7 builds no resource, no Bundle, no ConceptMap; it evaluates no
  FHIRPath and translates no terminology. That is `@cosyte/transform`.
- **Not a terminology validator.** Code-system provenance is the **claimed** system, verbatim: never
  validated against LOINC/SNOMED/RxNorm/ICD.
- **Not a full-corpus guarantee.** Coverage is proven over the IG's public sample (one message);
  reachability is proven for every IG-referenced field-level source path.
