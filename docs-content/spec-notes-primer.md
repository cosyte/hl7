---
id: spec-notes-primer
title: "Spec notes: HL7 v2.x standard reference (parser-builder's primer)"
sidebar_label: v2.x standard reference
---

# Spec notes: the HL7 v2.x standard, for someone building a parser

The other pages in this section are **implementation notes**: each says what
`@cosyte/hl7` does about one spec area, and why. This page is the **standard
reference** they elaborate: what the HL7 v2.x specification itself says about
encoding, grammar, message typing, acknowledgement, and the composite data types
a parser must decode. It is the "why the parser is shaped this way" companion, not
a description of the parser.

Scope note: this covers the pipe-and-hat v2.x standard only, **not** FHIR and
**not** C-CDA. Lower-layer framing (MLLP) is a separate standard and is touched
here only at its boundary.

> **Provenance.** Every statement below is drawn from the primary HL7 Chapter 2 /
> Chapter 2.A control-and-datatypes text (cross-checked across v2.2, v2.5, v2.5.1,
> v2.7, v2.8.2 and v2.9), corroborated by the NIST v2+ data-type reference, and
> was adversarially fact-checked (each claim independently voted; the few that
> failed are called out inline as *refuted*). The spec text was read from the
> widely-cited `hl7.eu` mirror. For a production conformance system, treat the
> **official HL7-published specification as the authoritative text of record**.
> A mirror is a convenience, not the source.

## 1. The encoding model: how bytes become a tree

A v2.x message is a delimited, hierarchical stream with a fixed depth:

```
message → segment → field → component → subcomponent
```

Subcomponents are terminal: the standard requires that a subcomponent be a
**primitive** type only. Components and subcomponents **do not repeat**: only
**fields** repeat, via the repetition delimiter. So the repetition delimiter is
meaningful at exactly one level of the tree, which bounds the parse.

### The MSH segment bootstraps every delimiter

The parser cannot read anything until it has read `MSH`, because `MSH` declares
the delimiters the rest of the message uses:

| Where | What it is | Canonical value |
|---|---|---|
| **MSH-1**: the 4th character of the message (immediately after `MSH`) | Field separator | `|` |
| **MSH-2**, in fixed order | Component, repetition, escape, subcomponent | `^` `~` `\` `&` |

Whatever values appear in MSH-1/MSH-2 apply **message-wide**. A parser reads
them once and uses them throughout. The four classic delimiters and their order
have never changed across v2.x. v2.5+ adds an optional 5th character in MSH-2, a
**truncation** character (`#`); the four classic delimiters are unaffected.

### The segment terminator is not configurable

Unlike the field/encoding delimiters, the **segment terminator is always ASCII
carriage return (hex `0D`) and cannot be redefined by implementers.** Real feeds
sometimes terminate segments with `LF` (`0A`) or `CRLF`. That is documented
**non-conformance to tolerate on input**, not a redefinition the standard permits.
A conservative serializer emits `CR` only.

## 2. Field population: populated, not-populated, and null are three states

This is the single most common correctness trap, and a parser must not collapse it:

| On the wire | Meaning | Effect on a receiver's stored value |
|---|---|---|
| a value | **populated** | set it |
| nothing between delimiters | **not-populated** (omitted) | leave the existing value unchanged |
| exactly two double-quotes: `""` | **null** | **delete** the existing value |

The null token is literally `|""|`. Using consecutive double-quotes as field
content for any other purpose is prohibited by the standard. The consequence for a
parser: **null must be represented distinctly from empty**: `""` and "absent" are
different instructions (delete vs. leave-as-is), and a data model that maps both to
`""`/`undefined` has silently lost a semantic the sender relied on. Some vendors
mishandle `|""|`; a tolerant parser still keeps the distinction it is given.

Escape sequences and character-set handling are their own topics: see
[Escapes & round-trip](./spec-notes-escapes.md) and
[Character sets (MSH-18)](./spec-notes-charset.md).

## 3. The abstract message grammar, and reconstructing groups from the wire

### The notation

Message definitions in the standard are written in an abstract grammar:

| Notation | Meaning |
|---|---|
| `[ X ]` | optional: 0 or 1 |
| `{ X }` | repeating, required: 1 or more |
| `[{ X }]` | optional **and** repeating: 0 or more |

`[{ … }]` and `{[ … ]}` are **explicitly equivalent**. A **segment group** is
"two or more segments organized as a logical unit," itself optional/required and
repeating/non-repeating; the notation nests to compose groups. The canonical
example from the v2.7 text is `[{ NK1 }]`: Next of Kin, usage `RE`, cardinality
`[0..3]`.

### Two optionality vocabularies: keep them apart

The base segment-definition table and the conformance/profile layer use different
code sets for the *same concept*, and conflating them is a real bug source:

- **Base OPT column:** `R` required · `O` optional · `C` conditional · `X`
  not-used-with-this-trigger · `B` backward-compatibility-only · `W` withdrawn.
- **v2.7+ conformance Usage codes:** `R` · `RE` (required-but-may-be-empty) · `O`
  · `C` (conditional: if the predicate holds, follow `R`, else follow `X`) · `CE`
  · `X`. Cardinality is a **separate** `[m..n]` pair (`[n..*]` = unbounded max),
  introduced with the v2.7 conformance model.

**Usage and cardinality are bound, not independent**. A profile engine must
enforce this: `X` ⇒ `[0..0]`; `R` ⇒ minimum ≥ 1; `RE`/`C`/`O` ⇒ minimum 0, with a
documented exception permitting `RE` to carry a non-zero minimum.

### The rule that makes a flat stream reconstructable

The wire is a flat `CR`-delimited list of segments with **no explicit group
markers**. The abstract tree is reconstructed from segment order alone, and one
normative rule is what makes that deterministic:

> If a named segment appears in two individual-or-group locations and **either**
> appearance is optional or repeating, the occurrences **must be separated by at
> least one required segment of a different name.**

That required, differently-named segment is what breaks the ambiguity between
adjacent optional/repeating occurrences of the same segment. A parser relies on
exactly this property to place a wire segment into the correct group.

**Two things to *not* build on** (both were adversarially *refuted*):

1. **There is no universal, hardcoded anchor list.** The intuition that
   `MSH`/`PID`/`ORC`/`OBR`/`OBX` are fixed hierarchy anchors (with `PID` a child
   of `MSH`, etc.) does **not** generalize: reconstruction rests on the
   separator rule plus a grammar, not a fixed segment list. A parser that
   special-cases those names *for general grouping* is relying on a coincidence.
2. When an expected parent segment is simply **absent**, the standard itself
   concedes the hierarchy "cannot be derived from message structure alone." A
   grammar-driven implementation can synthesize an empty placeholder ("ghost")
   segment to preserve structure, an engineering technique, not a normative rule.

This is precisely why this repo's
[Message-type & structure awareness](./spec-notes-structure.md) safety net is
scoped the way it is. It is **not** an abstract-syntax validator and does **not**
claim a universal anchor model: it checks, per specific `(message code, trigger
event)` pair, only whether the segments the v2.5.1 abstract syntax marks
**Required** are present, a deliberately narrow heuristic that can never
false-positive on a conformant-but-sparse message. "Anchor" there means "a
Required segment for *this* trigger," which is a different and legitimate use of
the word from the refuted universal-anchor claim above.

## 4. Message typing: MSH-9 has three components

`MSH-9` (data type `MSG`) carries **three** components:

```
MSH-9  =  message code  ^  trigger event  ^  message structure (abstract message ID)
```

The two-component characterization (message code + trigger only) is a common
belief and was adversarially **refuted**. Do not model MSH-9 as two components;
`MSH-9.3` exists and maps to the abstract message definition.

- **Message type ↔ trigger event is one-to-many:** a trigger maps to exactly one
  message type, but a message type has many triggers. (This is why the structure
  safety net keys on the `(code, trigger)` *pair*, not the family.)
- **`Z` is reserved:** any message code or trigger beginning with `Z` is locally
  defined and is never assigned by the standard. The same reservation applies to
  locally-defined **Z-segments**, which a tolerant parser accepts and surfaces
  rather than rejects.

## 5. Acknowledgement: two modes, two code vocabularies, one admitted ambiguity

Acknowledgement mode is selected by two MSH fields:

- **MSH-15**: accept acknowledgement type.
- **MSH-16**: application acknowledgement type.

**Original mode** applies when both are null/absent; **enhanced mode** when either
is valued. Original mode is exactly equivalent to enhanced mode with `MSH-15 = NE`,
`MSH-16 = AL`. Enhanced mode separates two code vocabularies, and a parser/engine
must know which applies:

| Level | Field | Codes |
|---|---|---|
| **Accept** (transport/commit) | `MSA-1` | `CA` commit accept · `CR` commit reject · `CE` commit error |
| **Application** (business) | `MSA-1` | `AA` accept · `AE` error · `AR` reject |

A positive **accept** acknowledgement means the receiver has committed the message
to **safe storage**, releasing the sender from resending, a stronger guarantee
than "received."

> **The load-bearing real-world caveat, admitted by HL7 itself:** the standards
> body's own Conformance work-group states that Chapter 2 "is unclear in that
> regard and does not provide clear guidance. It allows for interpretations
> leading to different flows and results." Independent multi-system testing has
> found wide variation in ACK behavior. The ambiguity is **in the specification**,
> not only in bad implementations, which is the concrete reason a tolerant engine
> is required, and why ACK behavior is configured, not assumed.

## 6. Composite data types: the layouts a parser must not get wrong

Component counts and types are **version-specific**: the biggest single hazard in
decoding composites. Branch on the message's stated version (`MSH-12`).

### CX: Extended Composite ID (identifiers)

**10 components in v2.5 / v2.5.1; 12 in v2.9.**

| # | Component | Type | Notes |
|---|---|---|---|
| CX.1 | ID Number | ST | the identifier, the **only Required** component |
| CX.2 | Check Digit | ST | |
| CX.3 | Check Digit Scheme | ID | |
| **CX.4** | **Assigning Authority** | **HD** | embedded HD, the namespace scoping the identifier |
| CX.5 | Identifier Type Code | ID | |
| **CX.6** | **Assigning Facility** | **HD** | embedded HD |
| CX.7 / CX.8 | Effective / Expiration Date | DT | |
| CX.9 / CX.10 | Assigning Jurisdiction / Agency | CWE | **present already in v2.5** (a common myth dates these to v2.7) |
| CX.11 / CX.12 | Security Check / Scheme | ST / ID | **added in v2.9** |

Load-bearing: `CX.1` (the id), `CX.4` (the assigning-authority HD, an id is
meaningless without the namespace that scopes it), `CX.5` (type code).

### XPN: Extended Person Name

**14 components in v2.5 / v2.5.1; 15 in v2.9** (adds `XPN.15` Called By).

`XPN.1` Family Name is itself the `FN` composite (surname plus own/partner
prefixes). `XPN.2`/`XPN.3` are given / further-given. **`XPN.7` Name Type Code**
(`L` legal, `A` alias, …) is load-bearing: it decides *which* name is
authoritative. Version drift to watch: `XPN.6` Degree is `IS` in v2.5, deprecated
there, withdrawn as of v2.7, and listed as `ST` in v2.9; the date components
(`XPN.12`/`XPN.13`) are `TS` in v2.5 and `DTM` in v2.7+.

### XAD: Extended Address

**14 components.** The trap: **`XAD.1` Street Address is the `SAD` composite (not
plain `ST`) from v2.5 onward**. So a v2.5+ parser must treat street address as
sub-componentized (street-or-mailing / street-name / dwelling-number). Load-bearing
fields: `XAD.1` street, `XAD.3` city, `XAD.4` state/province, `XAD.5` zip/postal,
`XAD.7` Address Type.

### HD: Hierarchic Designator (the reusable namespace type)

**Exactly 3 components:** `HD.1` Namespace ID (`IS`, a local mnemonic), `HD.2`
Universal ID (`ST`), `HD.3` Universal ID Type (`ID`, e.g. ISO OID, UUID, DNS).

HD is both a standalone field type **and** an embedded component: inside `CX.4`
and `CX.6`, and in the MSH sending/receiving facility fields. When HD is nested as
a component, **its own component separator `^` is demoted to a subcomponent
separator `&`**, the classic delimiter demotion a parser must apply when reading
a composite-inside-a-composite. (A variant claim placing the embedded HDs at
`CX.3`/`CX.5` was **refuted**: the correct positions are `CX.4`/`CX.6`.)

### Date / time: precision is signalled by length

The date/time family carries **variable precision determined by how many
characters are populated**, not by a precision flag:

```
DT   = YYYY[MM[DD]]
TM   = HH[MM[SS[.S…]]]
TS   (v2.5)  = YYYY[MM[DD[HH[MM[SS[.S…]]]]]][+/-ZZZZ]
DTM  (v2.7+) = YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]
```

A parser must **not** zero-pad or assume missing components: `20240115` is
day-precision and is not the same value as `202401150000`. The timezone is an
optional `+/-HHMM` offset that, **when absent, defaults to the sender's local
zone**: never UTC, never the parser's zone. `TS` (which carried a deprecated
"degree of precision" component) was superseded by the pure `DTM` type in v2.7+.
This repo's handling (parse to parts without materializing a `Date`, keep the
precision, refuse to guess a missing offset) is detailed in
[Datetime precision & timezone](./spec-notes-datetime-precision.md).

Coded fields (`CWE`/`CNE`/`CE` and coding-system provenance) are their own topic:
see [Coding-system provenance](./spec-notes-coding-system.md). Which of these
composite layouts changed at which version is tracked in the
[Version-sensitivity matrix](./spec-notes-version-matrix.md).

## PHI

None. This page contains only structural facts about the standard (segment,
field, and component names and their spec semantics) and no field values or
realistic message content.

## References

- **HL7 v2.x** Chapter 2 (Control) and Chapter 2.A (Data Types), cross-checked
  across v2.2, v2.5, v2.5.1, v2.7, v2.8.2 and v2.9.
- **NIST v2+** data-type reference (`usnistgov.github.io/v2plusDemo`).
- **HL7 Conformance work-group**, "HL7 V2 ACK Guidance": the standards body's own
  statement that Chapter 2's acknowledgement guidance is ambiguous.
- The official HL7-published specification is the authoritative text of record;
  the sources above are convenience mirrors and companions.
