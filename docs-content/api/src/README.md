# src

## Namespaces

- [conformance](namespaces/conformance.md)
- [HL7](namespaces/HL7.md)
- [text](namespaces/text.md)

## Classes

### Field

Wrapper over a `RawField` exposing HL7 null/empty discrimination
(`isNull`), the repetitions tree, and a decoded `value` getter.
`seg.field(3) === seg.field(3)`: Field instances are referentially stable
per segment position.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
const pid5 = msg.segments("PID")[0]?.field(5);
console.log(pid5?.value);              // "Smith": decoded at parse
console.log(pid5?.isNull);             // false: HL7 explicit null is "", absent is not
console.log(pid5?.repetitions.length); // 1
```

#### Constructors

##### Constructor

> **new Field**(`raw`, `enc`, `position`, `dateFormats?`): [`Field`](#field)

**`Internal`**

Construct a new `Field`. Called internally by `Segment.field(n)`; user
code should obtain `Field` instances via `msg.segments(type)[i].field(n)`.

###### Parameters

###### raw

[`RawField`](#rawfield)

###### enc

[`EncodingCharacters`](#encodingcharacters-1)

###### position

[`Hl7Position`](#hl7position)

###### dateFormats?

readonly `string`[]

###### Returns

[`Field`](#field)

#### Properties

##### dateFormats

> `readonly` **dateFormats**: readonly `string`[]

**`Internal`**

The date formats the caller declared for this message
(`ParseOptions.dateFormats` ++ the applied profile's, deduplicated
first-occurrence-wins), threaded down from `Hl7Message.dateFormats` so a
typed `TS` coercion can honour them. Empty when neither route declared
any, which is the strict-only parse. Read by `asTs()` and by the two
helper sites that parse a datetime subcomponent directly.

##### enc

> `readonly` **enc**: [`EncodingCharacters`](#encodingcharacters-1)

**`Internal`**

The 5 encoding characters for this message. Exposed for composite parsers.

##### isNull

> `readonly` **isNull**: `boolean`

HL7 null indicator: `true` iff the underlying field was the two-char literal `""`.

##### position

> `readonly` **position**: [`Hl7Position`](#hl7position)

**`Internal`**

Position of this field in the parent message: used for position-aware error messages.

##### raw

> `readonly` **raw**: [`RawField`](#rawfield)

**`Internal`**

The full `RawField` this wrapper wraps. Exposed for composite parsers.

##### repetitions

> `readonly` **repetitions**: readonly [`RawRepetition`](#rawrepetition)[]

The underlying `RawField.repetitions`, with a hole or `null` that a field
built by hand carries at any depth read as empty. No copy unless it has one.

#### Accessors

##### text

###### Get Signature

> **get** **text**(): `string`

The field's **canonical wire text**: the full field re-serialized with
the active delimiters and re-escaped content (repetitions, components,
and subcomponents included). Contrast with [value](#value), which
returns only the first subcomponent of the first component of the first
repetition (decoded once at parse: never re-unescaped).

Use this when a field must be compared or echoed as a whole: e.g.
correlating an ACK's MSA-2 against the inbound MSH-10, where a
vendor-quirk control id containing an unescaped delimiter (`ID^X`) must
not be truncated to its first component.

**Byte-verbatim for parsed content.** The parse pipeline stores
*decoded* content, but also records the original wire bytes of any escape
whose decode is not byte-faithful (`RawComponent.rawSubcomponents`), so
re-serialization preserves the sender's exact escape bytes: hex escapes
stay hex (`A\X41\B`, casing intact), and recognize-and-preserve sequences
(`\H\`, `\N`, formatting/charset/vendor escapes) re-emit **verbatim**
rather than as escaped literal text. Delimiter/newline escapes and plain
content round-trip byte-exact via the re-escape path. The only remaining
canonicalization is structural: trailing insignificant empties are
stripped, and a field built by hand (not parsed) re-escapes its
decoded value since it has no overlay.

**MSH-1/MSH-2 caveat.** Like [value](#value), calling this on MSH-1 or
MSH-2 (the delimiter-definition fields) re-escapes the encoding
characters themselves and produces garbage: those two fields are only
meaningful through `Hl7Message.encodingCharacters`.

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|ID^X|P|2.5\r");
msg.segments("MSH")[0]?.field(10).value; // "ID"   (first component only)
msg.segments("MSH")[0]?.field(10).text;  // "ID^X" (verbatim wire text)
```

###### Returns

`string`

##### value

###### Get Signature

> **get** **value**(): `string`

First-repetition, first-component, first-subcomponent value as a decoded
string: unescaped ONCE by the tokenizer on parse, returned verbatim here
(never re-unescaped). Returns `""` when the field is
empty or HL7 null. Equivalent to `msg.get('SEG.N')` for a top-level access.

###### Example

```ts
const pid5 = msg.segments("PID")[0]?.field(5);
// wire "Smith\F\Jr" was decoded at parse → the field separator escape:
console.log(pid5?.value); // "Smith|Jr"
```

###### Returns

`string`

#### Methods

##### asCe()

> **asCe**(): [`CE`](#ce)

Coerce this field's first repetition to a typed `CE` (Coded Element).

###### Returns

[`CE`](#ce)

###### Example

```ts
const code = msg.segments("OBX")[0]?.field(3)?.asCe();
console.log(code?.identifier, code?.text);
```

##### asCne()

> **asCne**(): [`CNE`](#cne)

Coerce this field's first repetition to a typed `CNE` (Coded with No
Exceptions): the 22 CWE components under the same names.

###### Returns

[`CNE`](#cne)

###### Example

```ts
const code = msg.segments("OBX")[0]?.field(3)?.asCne();
console.log(code?.identifier, code?.nameOfCodingSystem);
```

##### asCp()

> **asCp**(): [`CP`](#cp-1)

Coerce this field's first repetition to a typed `CP` (Composite Price):
`price` is a nested `MO`, `rangeUnits` a nested coded element.

###### Returns

[`CP`](#cp-1)

###### Example

```ts
const amount = msg.segments("FT1")[0]?.field(11)?.asCp();
console.log(amount?.price?.quantity, amount?.price?.denomination);
```

##### asCq()

> **asCq**(): [`CQ`](#cq-1)

Coerce this field's first repetition to a typed `CQ` (Composite Quantity
with Units): `units` is a nested coded element.

###### Returns

[`CQ`](#cq-1)

###### Example

```ts
const quantity = msg.segments("TQ1")[0]?.field(2)?.asCq();
console.log(quantity?.quantity, quantity?.units?.identifier);
```

##### asCwe()

> **asCwe**(): [`CWE`](#cwe-1)

Coerce this field's first repetition to a typed `CWE` (Coded With
Exceptions).

###### Returns

[`CWE`](#cwe-1)

###### Example

```ts
const code = msg.segments("OBX")[0]?.field(3)?.asCwe();
console.log(code?.identifier, code?.text);
```

##### asCx()

> **asCx**(): [`CX`](#cx-1)

Coerce this field's first repetition to a typed `CX` (Extended Composite
ID). `assigningAuthority` is a nested `HD`.

###### Returns

[`CX`](#cx-1)

###### Example

```ts
const mrn = msg.segments("PID")[0]?.field(3)?.asCx();
console.log(mrn?.idNumber, mrn?.assigningAuthority?.namespaceId);
```

##### asDr()

> **asDr**(): [`DR`](#dr-1)

Coerce this field's first repetition to a typed `DR` (Date/Time Range).
Each endpoint is the raw datetime text.

###### Returns

[`DR`](#dr-1)

###### Example

```ts
// A site-defined segment carrying a coverage window in its first field:
const range = msg.segments("ZCV")[0]?.field(1)?.asDr();
console.log(range?.rangeStartDateTime, range?.rangeEndDateTime);
```

##### asEi()

> **asEi**(): [`EI`](#ei-1)

Coerce this field's first repetition to a typed `EI` (Entity Identifier).
Common on MSH-21 (message profile), OBR-2 and OBR-3, ORC-2 and ORC-3
(placer and filler order numbers). Empty field gives `{}` (never throws).

###### Returns

[`EI`](#ei-1)

###### Example

```ts
const placer = msg.segments("OBR")[0]?.field(2)?.asEi();
console.log(placer?.entityIdentifier, placer?.namespaceId);
```

##### asEip()

> **asEip**(): [`EIP`](#eip-1)

Coerce this field's first repetition to a typed `EIP` (Entity Identifier
Pair): a placer and a filler `EI`, each read from its subcomponents.

###### Returns

[`EIP`](#eip-1)

###### Example

```ts
const parent = msg.segments("OBR")[0]?.field(29)?.asEip();
console.log(parent?.fillerAssignedIdentifier?.entityIdentifier);
```

##### asFc()

> **asFc**(): [`FC`](#fc-1)

Coerce this field's first repetition to a typed `FC` (Financial Class):
`financialClassCode` is a nested coded element.

###### Returns

[`FC`](#fc-1)

###### Example

```ts
const financialClass = msg.segments("PV1")[0]?.field(20)?.asFc();
console.log(financialClass?.financialClassCode?.identifier);
```

##### asHd()

> **asHd**(): [`HD`](#hd-1)

Coerce this field's first repetition to a typed `HD` (Hierarchic
Designator).

###### Returns

[`HD`](#hd-1)

###### Example

```ts
const sending = msg.segments("MSH")[0]?.field(3)?.asHd();
console.log(sending?.namespaceId);
```

##### asMo()

> **asMo**(): [`MO`](#mo-1)

Coerce this field's first repetition to a typed `MO` (Money). The amount
stays the text the sender wrote, never a `number`.

###### Returns

[`MO`](#mo-1)

###### Example

```ts
// A site-defined segment carrying an amount in its first field:
const amount = msg.segments("ZBL")[0]?.field(1)?.asMo();
console.log(amount?.quantity, amount?.denomination);
```

##### asMsg()

> **asMsg**(): [`MSG`](#msg-1)

Coerce this field's first repetition to a typed `MSG` (Message Type).

###### Returns

[`MSG`](#msg-1)

###### Example

```ts
const type = msg.segments("MSH")[0]?.field(9)?.asMsg();
console.log(type?.messageCode, type?.triggerEvent, type?.messageStructure);
```

##### asNm()

> **asNm**(): [`NM`](#nm-1)

Coerce this field's first repetition to a typed `NM` (Numeric).
`{ raw, value }`: `value` is `undefined` on non-numeric input.

###### Returns

[`NM`](#nm-1)

###### Example

```ts
const nm = msg.segments("OBX")[0]?.field(5)?.asNm();
console.log(nm?.value);
```

##### asPl()

> **asPl**(): [`PL`](#pl-1)

Coerce this field's first repetition to a typed `PL` (Person Location).
`facility` is a nested `HD`.

###### Returns

[`PL`](#pl-1)

###### Example

```ts
const loc = msg.segments("PV1")[0]?.field(3)?.asPl();
console.log(loc?.pointOfCare, loc?.room, loc?.facility?.namespaceId);
```

##### asPt()

> **asPt**(): [`PT`](#pt-1)

Coerce this field's first repetition to a typed `PT` (Processing Type).

###### Returns

[`PT`](#pt-1)

###### Example

```ts
const processing = msg.segments("MSH")[0]?.field(11)?.asPt();
console.log(processing?.processingId, processing?.processingMode);
```

##### asSn()

> **asSn**(): [`SN`](#sn) \| `undefined`

Coerce this field's first repetition to a typed `SN` (Structured Numeric),
or `undefined` when the field carries no usable structured-numeric content.
Use for an OBX-5 whose OBX-2 value type is `SN` (a comparator like `>90`,
a range like `100-200`, or a ratio like `1:128`). `num1`/`num2` are
`number | undefined` (never `NaN`); the comparator is surfaced only when
SN.1 is a recognized operator.

###### Returns

[`SN`](#sn) \| `undefined`

###### Example

```ts
const sn = msg.segments("OBX")[0]?.field(5)?.asSn();
console.log(sn?.comparator, sn?.num1); // ">" 90
```

##### asTs()

> **asTs**(): [`DtmParts`](#dtmparts)

Coerce this field's first repetition to a typed `TS` (Time Stamp): the
fidelity `DtmParts` (raw + parts + precision + timezone). `valid` is
`false` on unparseable input (no throw). Build an absolute instant only on
explicit request via `dtmToDate(ts)`.

The canonical HL7 shape is tried first. A value that is not canonical is
then matched against the `dateFormats` the caller declared for this
message, and a match reports which format won on `matchedFormat`. Nothing
beyond those declared formats is tried, so a vendor date the caller has
not described stays `valid: false` rather than becoming a plausible wrong
date.

###### Returns

[`DtmParts`](#dtmparts)

###### Example

```ts
const ts = msg.segments("MSH")[0]?.field(7)?.asTs();
console.log(ts?.raw, ts?.precision, ts?.hasTimezone);

// parseHL7(raw, { dateFormats: ["MM/DD/YYYY"] }) on a PID-7 of "07/05/1988":
const dob = msg.segments("PID")[0]?.field(7)?.asTs();
console.log(dob?.month, dob?.matchedFormat); // 7 "MM/DD/YYYY"
```

##### asVid()

> **asVid**(): [`VID`](#vid-1)

Coerce this field's first repetition to a typed `VID` (Version
Identifier).

###### Returns

[`VID`](#vid-1)

###### Example

```ts
const version = msg.segments("MSH")[0]?.field(12)?.asVid();
console.log(version?.versionId);
```

##### asXad()

> **asXad**(): [`XAD`](#xad-1)

Coerce this field's first repetition to a typed `XAD` (Extended Address).

###### Returns

[`XAD`](#xad-1)

###### Example

```ts
const addr = msg.segments("PID")[0]?.field(11)?.asXad();
console.log(addr?.street, addr?.city, addr?.stateOrProvince);
```

##### asXcn()

> **asXcn**(): [`XCN`](#xcn-1)

Coerce this field's first repetition to a typed `XCN` (Extended Composite
ID Number and Name for Persons). `assigningAuthority` is a nested `HD`.
Common on OBR-16 (ordering provider), PV1-7 (attending doctor), PV1-8
(referring doctor). Empty field → `{}` (never throws).

###### Returns

[`XCN`](#xcn-1)

###### Example

```ts
const orderedBy = msg.segments("OBR")[0]?.field(16)?.asXcn();
console.log(orderedBy?.idNumber, orderedBy?.familyName, orderedBy?.identifierTypeCode);
```

##### asXpn()

> **asXpn**(): [`XPN`](#xpn-1)

Coerce this field's first repetition to a typed `XPN` (Extended Person
Name). Absent components are OMITTED from the result
(`exactOptionalPropertyTypes`). Not memoized: each call re-parses.

###### Returns

[`XPN`](#xpn-1)

###### Example

```ts
const pid5 = msg.segments("PID")[0]?.field(5);
const name = pid5?.asXpn();
console.log(name?.familyName, name?.givenName);
```

##### asXtn()

> **asXtn**(): [`XTN`](#xtn-1)

Coerce this field's first repetition to a typed `XTN` (Extended
Telecommunication Number).

###### Returns

[`XTN`](#xtn-1)

###### Example

```ts
const phone = msg.segments("PID")[0]?.field(13)?.asXtn();
console.log(phone?.telephoneNumber);
```

##### render()

> **render**(`opts?`): [`RenderedText`](#renderedtext)

Render this field's formatted text (HL7 v2 §2.7 highlight + formatting
escapes) into a normalized [RenderedText](#renderedtext) display model: plain text
plus highlight-aware runs. A **read projection** over the field's
byte-verbatim wire [text](#text): it never mutates the raw value, and it
never fabricates (an unrenderable escape is preserved + flagged). Use this
to surface a clinical narrative (an NTE / OBX-5 note) to a human without
the raw `\.br\` / `\H` sentinels.

###### Parameters

###### opts?

[`RenderTextOptions`](#rendertextoptions)

see [RenderTextOptions](#rendertextoptions) (e.g. a custom line-break string).

###### Returns

[`RenderedText`](#renderedtext)

the normalized display model.

###### Example

```ts
const note = msg.segments("OBX")[0]?.field(5);
note?.render().text; // "Specimen received.\nGross exam normal."
```

##### empty()

> `static` **empty**(`_enc`): [`Field`](#field)

**`Internal`**

Return a synthetic empty `Field` sentinel: used by `Segment.field(n)` to
honor its "never throws on missing" contract. The returned Field
has `isNull === false`, `repetitions === []`, and `value === ""`.
Referentially stable across calls (same instance returned each time).

The `enc` argument is accepted for API symmetry but ignored: the
synthetic field carries no content, so unescape would be a no-op
regardless of the active encoding characters. For the same reason the
sentinel carries no declared `dateFormats`: there is no value to match one
against, and `asTs()` on it is the empty invalid `TS` either way.

###### Parameters

###### \_enc

[`EncodingCharacters`](#encodingcharacters-1)

###### Returns

[`Field`](#field)

###### Example

```ts
const empty = Field.empty(msg.encodingCharacters);
console.log(empty.value); // ""
```

***

### Hl7Message

Parsed HL7 v2 message. Produced by `parseHL7`. Exposes the raw positional
tree (`rawSegments`), delimiter metadata, warnings, and a typed traversal
surface: `get(path)` for dot-paths, `getAll(type)` / `segments(type)` /
`allSegments()` for wrapper-level iteration.

#### Remarks

The `warnings` array is frozen at the model boundary so downstream
traversal and helpers cannot mutate parser output. The `profile`
field is populated when a profile is passed, and is `undefined`
otherwise. Segment/Field wrappers are cached per-message and
invalidated wholesale by the mutation methods.

A message parsed lazily (the default; see `ParseOptions.lazy`) builds a
segment's tree the first time something reads that segment, and keeps it.
Every warning was already reported by the parse. `get(path)` builds the
one segment its path reaches; `segments()`, `part()` and `allSegments()`
build a segment when its fields are first read; an edit builds the segment
it changes. `rawSegments`, `toString()`, `toJSON()`, `prettyPrint()` and
the helpers that read every segment of a type (for example
`observations()`) build every segment they reach.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.get("PID.5.1"));         // "Smith"
for (const obx of msg.segments("OBX")) {
  console.log(obx.field(5).value);
}
for (const w of msg.warnings) console.warn(w.code);
```

#### Extended by

- [`ProfiledMessage`](#profiledmessage)
- [`TypedMessage`](#typedmessage)

#### Constructors

##### Constructor

> **new Hl7Message**(`init`): [`Hl7Message`](#hl7message)

**`Internal`**

Construct a new `Hl7Message`. The constructor takes a plain init
object and freezes the warnings array so callers cannot mutate parser
output after handoff.

###### Parameters

###### init

`Hl7MessageInit`

###### Returns

[`Hl7Message`](#hl7message)

#### Properties

##### dateFormats

> `readonly` **dateFormats**: readonly `string`[]

Merged `dateFormats` list: `options.dateFormats ++ profile.dateFormats`
deduped first-occurrence. Empty array when neither source
supplied any formats. This is the list every datetime in the message
honours, from `meta.timestamp` to any `field.asTs()`, in exactly this
order; exposed so a caller can introspect what their options and profile
added up to.

##### encodingCharacters

> `readonly` **encodingCharacters**: [`EncodingCharacters`](#encodingcharacters-1)

##### profile

> `readonly` **profile**: \{ `lineage`: readonly `string`[]; `name`: `string`; \} \| `undefined`

##### rawSegments

> `readonly` **rawSegments**: readonly [`RawSegment`](#rawsegment)[]

Raw positional tree produced by the parser. 1-indexed per HL7 convention
(`fields[0]` is the segment-name / MSH separator placeholder slot). Use
`segments(type)` / `allSegments()` for typed wrapper access: this field
is exposed for advanced callers that need the raw tree directly.

On a lazily parsed message (the default), the first read builds every segment that has not
been read yet, so the whole tree is held from then on. To read a few segments of a long
message, use `segments(type)`, `part(type)` or `get(path)`, which build only what they reach.

##### version

> `readonly` **version**: `string`

HL7 version the model asserts for this message, from MSH-12.1.1, e.g.
`"2.5"` or `"2.5.1"`.

**Bounded, and it is `"<withheld>"` when MSH-12 does not hold a version.**
Same reasoning as [Segment.type](#type): it presents as an identifier and
consumers label with it. `meta.version` keeps MSH-12 exactly as it
arrived, and is what version-scoped field selection reads, so this bound
changes no parsing behaviour.

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

#### Accessors

##### meta

###### Get Signature

> **get** **meta**(): [`Meta`](#meta-1)

MSH-derived message metadata (type, controlId, timestamp, version, etc.).
Plain object. Memoized: `msg.meta === msg.meta` across
reads until mutation invalidates. Always defined (MSH absence
throws `NO_MSH_SEGMENT` at parse time).

###### Example

```ts
console.log(msg.meta.type);                     // "ADT^A01"
console.log(msg.meta.timestamp?.raw);           // fidelity TS
console.log(msg.meta.controlId);                // "MSG001"
```

###### Returns

[`Meta`](#meta-1)

##### patient

###### Get Signature

> **get** **patient**(): [`Patient`](#patient-8) \| `undefined`

PID-derived patient view, or `undefined` when no PID segment exists.
Memoized. Never throws: absent fields
surface as `undefined` on the returned `Patient` object.

###### Example

```ts
console.log(msg.patient?.mrn);
console.log(msg.patient?.fullName);
console.log(msg.patient?.dateOfBirth?.raw); // fidelity TS: e.g. "19800115"
```

###### Returns

[`Patient`](#patient-8) \| `undefined`

##### structure

###### Get Signature

> **get** **structure**(): [`MessageStructure`](#messagestructure)

Structural-conformance summary for the common message types: a
misroute/truncation safety net, NOT a conformance validator.
Reports, per the message's recognized (MSH-9.1, MSH-9.2) type, which
Required segment groups are present and which are entirely absent
(`missingGroups`: the same set the parser flags as
`MISSING_EXPECTED_GROUP` warnings). For an unmodelled type, `recognized`
is `false` and `missingGroups` is empty. Memoized.

###### Example

```ts
console.log(msg.structure.recognized);    // true for ORU^R01, ADT^A01, …
console.log(msg.structure.missingGroups); // e.g. ["result"] if no OBR/OBX
```

###### Returns

[`MessageStructure`](#messagestructure)

##### visit

###### Get Signature

> **get** **visit**(): [`Visit`](#visit-7) \| `undefined`

PV1-derived visit view, or `undefined` when no PV1 segment exists.
Memoized. Never throws.

###### Example

```ts
console.log(msg.visit?.patientClass);                 // "I"
console.log(msg.visit?.admitDateTime?.raw); // fidelity TS
console.log(msg.visit?.attendingDoctor?.familyName);
```

###### Returns

[`Visit`](#visit-7) \| `undefined`

#### Methods

##### addSegment()

> **addSegment**(`name`, `fields`): `this`

Append a new segment to the end of the message. `name` must match
`/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u`: throws `TypeError` otherwise.

`fields` is interpreted in HL7 1-indexed terms: `addSegment("NTE", [a, b, c])`
produces a segment whose `NTE-1 = a`, `NTE-2 = b`, `NTE-3 = c`. The
internal `RawSegment.fields[0]` name/separator placeholder is synthesized
by this method.

Each entry may be a plain string (treated as a single-subcomponent
single-component single-repetition field) or a full `RawField` object
for advanced callers who need structured content.

Invalidates caches on return; warnings untouched.

###### Parameters

###### name

`string`

###### fields

readonly (`string` \| [`RawField`](#rawfield))[]

###### Returns

`this`

###### Example

```ts
msg.addSegment("NTE", ["", "note text"]);
msg.get("NTE.2"); // "note text"
```

##### allergies()

> **allergies**(): readonly [`Allergy`](#allergy)[]

Every AL1 and every IAM as an Allergy, one entry per segment in document
order, each naming the segment it was read from (`source`). An ADT^A60
carries its allergies in IAM, so it is read here too. Returns `[]`
when neither is present.

Limits: the IAR and NTE segments under an IAM are not read, nor IAM-1 or
IAM-8 onward (reach them with `msg.segments("IAM")`). IAM-6 is surfaced as
`actionCode`, and an exact `D` sets `deleteRequested`, but no action is ever
applied: a delete entry is still returned, an update never replaces an
earlier entry, and an AL1 and an IAM for the same allergen are two entries.

###### Returns

readonly [`Allergy`](#allergy)[]

###### Example

```ts
for (const al of msg.allergies()) {
  const kind = al.deleteRequested === true ? "delete request" : "allergy";
  console.log(kind, al.source, al.code?.text, al.severity, al.actionCode);
}
```

##### allSegments()

> **allSegments**(): readonly [`Segment`](#segment)\<`string`\>[]

Iterate every `Segment` in document order (MSH first, then every
subsequent segment). Cached per-message; same array reference and same
Segment instances on repeat calls. Invalidated wholesale by
the mutation methods.

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
for (const seg of msg.allSegments()) {
  console.log(seg.type);
}
```

##### appointments()

> **appointments**(): readonly [`Appointment`](#appointment)[]

Every SCH of an SIU message as a typed `Appointment`, with
the AIS/AIG/AIL/AIP resource segments that follow it grouped positionally
under that SCH. Surfaces the placer/filler appointment ids, SCH-25 filler
status (Table 0278), SCH-11 start/end timing, and the resource groups
(service / general / location / personnel). Returns `[]` when no SCH
is present. Not memoized. Never throws. Not a
scheduling-workflow state machine: see the package known-limitations.

###### Returns

readonly [`Appointment`](#appointment)[]

###### Example

```ts
for (const appt of msg.appointments()) {
  console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier);
  for (const r of appt.resources) console.log(r.kind, r.code?.identifier);
}
```

##### charges()

> **charges**(): readonly [`Charge`](#charge)[]

Every FT1 of a DFT message as a typed `Charge`, one per
FT1 in document order. Surfaces billing-critical fields (FT1-6 transaction
type, FT1-7 code, FT1-11/12 extended/unit amount, FT1-19 diagnosis linkage)
with **no billing logic and no money-as-float**: amounts are the verbatim
CP wire text. Returns `[]` when no FT1 is present. Not memoized.
Never throws.

###### Returns

readonly [`Charge`](#charge)[]

###### Example

```ts
for (const charge of msg.charges()) {
  console.log(charge.transactionType, charge.transactionCode?.identifier);
  console.log(charge.amountExtended); // verbatim, never a number
}
```

##### diagnoses()

> **diagnoses**(): readonly [`Diagnosis`](#diagnosis)[]

Every DG1 as a Diagnosis in document order. Returns `[]` when no
DG1 present.

###### Returns

readonly [`Diagnosis`](#diagnosis)[]

###### Example

```ts
for (const dg of msg.diagnoses()) console.log(dg.code?.identifier);
```

##### documents()

> **documents**(): readonly [`ClinicalDocument`](#clinicaldocument)[]

Every TXA of an MDM message as a typed `ClinicalDocument`,
with the OBX narrative body grouped positionally under that TXA. The
completion status (TXA-17) and availability status (TXA-19) are surfaced as
**distinct** fields and never conflated: a document can be available before
it is authenticated, and reading a preliminary document as final is the
harm. Returns `[]` when no TXA is present. Not memoized. Never
throws.

###### Returns

readonly [`ClinicalDocument`](#clinicaldocument)[]

###### Example

```ts
for (const doc of msg.documents()) {
  console.log(doc.documentType, doc.completionStatus, doc.availabilityStatus);
  for (const obx of doc.observations) console.log(obx.value); // narrative body
}
```

##### get()

> **get**(`path`): `string` \| `undefined`

Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
decoded leaf string (unescaped once at parse: never re-unescaped on
read). Returns `undefined` when the path doesn't
resolve: never throws on missing path. Throws `TypeError`
on malformed path syntax (e.g. `"pid.5"`, empty string).

###### Parameters

###### path

`string`

###### Returns

`string` \| `undefined`

###### Example

```ts
const msg = parseHL7(raw);
msg.get("PID.5.1");  // "Smith"
msg.get("OBX[2].5"); // third OBX's 5th field
msg.get("NOT.9.9");  // undefined
msg.get("MSH.12");   // "2.5": HL7 version string
```

##### getAll()

> **getAll**(`segmentType`): readonly [`Segment`](#segment)\<`string`\>[]

Return every `Segment` of `segmentType` in document order. Returns `[]`
(empty array, NEVER `undefined`) when no segment of that type exists.
Alias for `segments(segmentType)`: shares the same cache, and
matches segment names ignoring case exactly as it does.

###### Parameters

###### segmentType

`string`

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
for (const obx of msg.getAll("OBX")) {
  console.log(obx.field(5).value);
}
```

##### identityEvents()

> **identityEvents**(): readonly [`IdentityEvent`](#identityevent)[]

Every recognized ADT patient-identity event (merge / move / change /
link / unlink / person add/update), with the MRG-sourced
`prior` and PID/PV1-sourced `surviving` parties labelled by role and the
spec-constant `direction: "MRG_TO_PID"` on merge/move/change events.
Returns `[]` when the trigger event is not in the identity family. The
recognized set is floored by the published message structures: every ADT
trigger event whose structure requires MRG is recognized. Not
memoized. Never throws; incomplete merge pairs surface a
`MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on the event.

###### Returns

readonly [`IdentityEvent`](#identityevent)[]

###### Example

```ts
for (const ev of msg.identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving) {
    // retire ev.prior.identifiers in favour of ev.surviving.identifiers
  }
}
```

##### immunizations()

> **immunizations**(): readonly [`Immunization`](#immunization)[]

Every RXA of a VXU^V04 as a typed `Immunization`, with RXR (route/site)
and OBX children grouped positionally under the RXA and `orderControl`
from the preceding ORC of the VXU order group. Returns
`[]` when no RXA present. Not memoized. The vaccine code
carries its own provenance; the action code (RXA-21) is surfaced verbatim
and `recordOrigin` (administered vs historical) is derived only from the
well-known NIP001 RXA-9.1 codes: never guessed.

###### Returns

readonly [`Immunization`](#immunization)[]

###### Example

```ts
for (const imm of msg.immunizations()) {
  console.log(imm.vaccineCode?.identifier, imm.doseAmount, imm.recordOrigin);
  console.log(imm.actionCode, imm.completionStatus);
}
```

##### insurance()

> **insurance**(): readonly [`Insurance`](#insurance-1)[]

Every IN1 as an Insurance entry with positional IN2/IN3 presence flags.
Returns `[]` when no IN1 present.

###### Returns

readonly [`Insurance`](#insurance-1)[]

###### Example

```ts
for (const ins of msg.insurance()) console.log(ins.planId?.text);
```

##### is()

**`Internal`**

Single runtime implementation behind both signatures.

###### Call Signature

> **is**\<`K`\>(`key`): `this is TypedMessage<K>`

Is this message of the type `key` names, and if so, narrow it for the
compiler. The check is on the (MSH-9.1, MSH-9.2) pair the parser already
extracted, so a message whose MSH-9 carries the three-component form
`ADT^A01^ADT_A01` answers `true` to `is("ADT^A01")`.

A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a
message type the published structure registry matches on message code alone
(`"ACK"`, whose MSH-9.2 carries the acknowledged message's trigger event).
`SUPPORTED_OVERLAY_MESSAGES` enumerates every key.

**Any other string is `false`, never a throw**: an unrecognized type, the
three-component form as a string, an empty string, or a value computed at
run time. `is` does not parse its own argument, and a caller who wants a raw
comparison has `msg.meta.type`.

Read-only: it inspects `meta` and mutates nothing.

###### Type Parameters

###### K

`K` *extends* keyof [`OverlayStructures`](#overlaystructures)

###### Parameters

###### key

`K`

###### Returns

`this is TypedMessage<K>`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
if (msg.is("ORU^R01")) {
  const code: "ORU" = msg.meta.messageCode; // literal, no cast
  console.log(msg.part("OBR")?.field(4).value);
}
console.log(msg.is("ZZZ^Z99")); // false: not a published key
```

###### Call Signature

> **is**(`key`): `boolean`

Answer for a key that is not known at compile time. A runtime-computed
string cannot narrow anything, so this form returns a plain `boolean`.

###### Parameters

###### key

`string`

###### Returns

`boolean`

##### medications()

> **medications**(): readonly [`Medication`](#medication)[]

Every RXO/RXE/RXD/RXA as a typed `Medication`, with RXR (route) and RXC
(component) segments grouped positionally under their parent. Returns
`[]` when no RX* parent present. Not memoized. The give
*amount* and give *strength* are surfaced separately and never
reconciled.

Each medication also carries its TQ1 / legacy embedded-TQ (RXE-1) `timings`
(repeat pattern verbatim, never resolved to a schedule).

Each medication also carries `orderControl`: ORC-1 of the ORC that opened
its order group (every RX* up to the next ORC shares it), exactly as sent.
It is never interpreted into an active, held or discontinued state, and it
is omitted when no ORC precedes the RX* or ORC-1 is empty, never carried
over from an earlier group.

###### Returns

readonly [`Medication`](#medication)[]

###### Example

```ts
for (const med of msg.medications()) {
  console.log(med.orderControl); // e.g. "NW" (new) or "DC" (discontinue), verbatim
  console.log(med.context, med.giveCode?.identifier, med.giveCode?.nameOfCodingSystem);
  console.log(med.amount?.minimum, med.strength?.value);
  for (const t of med.timings) console.log(t.repeatPattern?.code, t.totalOccurrences);
}
```

##### nextOfKin()

> **nextOfKin**(): readonly [`NextOfKin`](#nextofkin-1)[]

Every NK1 as a NextOfKin entry in document order. Returns `[]`
when no NK1 present.

###### Returns

readonly [`NextOfKin`](#nextofkin-1)[]

###### Example

```ts
for (const nk of msg.nextOfKin()) {
  console.log(nk.name?.familyName, nk.relationship?.text);
}
```

##### notes()

> **notes**(): readonly `string`[]

Message-level NTE notes: every NTE segment with no recognized
preceding parent (not immediately following a `PID`, `ORC`, `OBR`, or
`OBX`), surfaced verbatim in document order so nothing is dropped. Notes
that DO attach to a specific patient / order / result are exposed on those
helper outputs (`msg.patient?.notes`, `order.notes`, `observation.notes`),
not here. Returns `[]` when there are none. NOT memoized.

###### Returns

readonly `string`[]

###### Example

```ts
for (const note of msg.notes()) console.log(note); // message-level narrative
```

##### observations()

> **observations**(): readonly [`Observation`](#observation)[]

Every OBX segment as a typed Observation in document order. Returns
`[]` when no OBX present. NOT memoized: each call
re-walks `rawSegments`. Value type is discriminated.

###### Returns

readonly [`Observation`](#observation)[]

###### Example

```ts
for (const obs of msg.observations()) {
  if (obs.valueType === "NM") console.log(obs.value); // number | undefined
}
```

##### orders()

> **orders**(): readonly [`Order`](#order-1)[]

Every OBR as an Order with its OBX children grouped positionally and
its TQ1 / legacy embedded-TQ (ORC-7) `timings` (the repeat pattern is
surfaced verbatim, never resolved to a schedule). Returns `[]` when no
OBR present. Not memoized.

###### Returns

readonly [`Order`](#order-1)[]

###### Example

```ts
for (const order of msg.orders()) {
  console.log(order.placerOrderNumber, order.observations.length);
  for (const t of order.timings) console.log(t.repeatPattern?.code); // e.g. "Q6H": verbatim
}
```

##### part()

> **part**(`segmentType`): [`Segment`](#segment)\<`string`\> \| `undefined`

The FIRST `Segment` named `segmentType` in document order, or `undefined`
when the message carries none. Shorthand for `segments(segmentType)[0]`:
same cache, same case-insensitive matching on both sides, same referential
stability.

On a message narrowed by [Hl7Message.is](#is), `segmentType` is scoped at
compile time to the segment names that message type's published structure
marks required. It stays `Segment | undefined` there: the parser tolerates a
message that omits a required segment (and warns), so a required name is
never a presence guarantee.

###### Parameters

###### segmentType

`string`

###### Returns

[`Segment`](#segment)\<`string`\> \| `undefined`

###### Example

```ts
const pid = msg.part("PID");
console.log(pid?.field(5).value);
```

##### parts()

> **parts**(`segmentType`): readonly [`Segment`](#segment)\<`string`\>[]

EVERY `Segment` named `segmentType` in document order, `[]` when there are
none. Alias for `segments(segmentType)`: same cache, same array identity,
same case-insensitive matching.

On a message narrowed by [Hl7Message.is](#is), `segmentType` is scoped at
compile time to the segment names that message type's published structure
marks required; the returned list can still be empty, for the same reason
[Hl7Message.part](#part) can still return `undefined`.

###### Parameters

###### segmentType

`string`

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
for (const obx of msg.parts("OBX")) console.log(obx.field(5).value);
```

##### prettyPrint()

> **prettyPrint**(): `string`

Emit this message as a human-readable multi-line string for logs and
debugging. Single opinionated format (no options):
header line with type / controlId / timestamp / segment count, then
one line per segment with labeled `[N]=value` fields. Composite
values render as their raw HL7 string: depth stops at field level.
Pure: never warns, never throws.

**Field values render as their raw HL7 string representation.**
Embedded delimiters in user data appear as escape sequences: e.g.
a patient family name containing `|` renders as `Smith\F\Jones`
(NOT `Smith|Jones`). This preserves round-trip fidelity: copy-pasting
prettyPrint output into `parseHL7` yields a structurally equivalent
message. For un-escaped human display, parse the composite first via
typed accessors (e.g. `msg.patient?.familyName`): those return
already-decoded strings.

###### Returns

`string`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.prettyPrint());
// HL7 ADT^A01  controlId=MSG001  timestamp=2026-04-19T10:15:00Z  (5 segments)
// MSH  [3]=SENDAPP  [4]=SENDFAC  ...
// PID  [1]=1  [3]=MRN123  [5]=Doe^John
```

##### removeSegment()

> **removeSegment**(`segmentType`, `occurrenceOrOptions?`): `this`

Remove segments by type + occurrence or by type + all. Call shapes:

- `removeSegment("NTE")`: remove the FIRST NTE (occurrence 0).
- `removeSegment("OBX", 1)`: remove the SECOND OBX (0-indexed).
- `removeSegment("OBX", { all: true })`: remove ALL OBX segments.

`MSH` is protected: `removeSegment("MSH")` throws `TypeError` (every
HL7 message must retain its MSH segment). Unknown segment types are a
no-op (idempotent; no throw). Segment name must match the same shape
regex: invalid shapes throw `TypeError` for symmetry with `addSegment`.

Invalidates caches on return; warnings untouched.

###### Parameters

###### segmentType

`string`

###### occurrenceOrOptions?

`number` \| \{ `all?`: `boolean`; \}

###### Returns

`this`

###### Example

```ts
msg.removeSegment("NTE");                // remove first NTE
msg.removeSegment("OBX", 1);             // remove second OBX
msg.removeSegment("OBX", { all: true }); // remove all remaining OBX
```

##### segments()

> **segments**(`segmentType`): readonly [`Segment`](#segment)\<`string`\>[]

Return the cached array of `Segment` wrappers for `segmentType` in
document order. The returned array identity and the individual Segment
instances are both stable across calls. Invalidated wholesale
by the mutation methods.

**Segment names are matched ignoring ASCII case, on both sides.** A sender
that ships `obx` is returned by `segments("OBX")`, and `segments("obx")`
returns the same array (one cache entry, so the instance-identity guarantee
does not split across spellings). A `SEGMENT_CASE` warning records the
sender's deviation; `Segment.raw.name` is the spelling that arrived.

###### Parameters

###### segmentType

`string`

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
const pid = msg.segments("PID")[0];
if (pid !== undefined) console.log(pid.field(5).value);
```

##### setComposite()

> **setComposite**\<`K`\>(`path`, `kind`, `value`): `this`

Set a **typed composite** at a field (or field-repetition) dot-path:
the conservative-emit mirror of the typed read accessors
(`asXpn`/`asCx`/…). The caller passes a structured value (an XPN name, a CX
identifier, a TS timestamp, …) by its [CompositeKind](#compositekind), and the setter
encodes it into a spec-clean field using the encode-safe path: any
delimiter embedded in a component value is **escaped, never injected**, so
a `familyName` of `"Smith^Jr"` re-parses to exactly that string rather than
forging a component boundary. No hand-assembly of `^`/`&`/`~`.

The path must resolve to a **field** (`"PID.5"`) or a specific
**repetition** of a field (`"PID.11[1]"`). A component/subcomponent-level
path (`"PID.5.1"`) is rejected with `TypeError`: a composite occupies a
whole field, not a single component. Like [setField](#setfield), the target
segment must already exist (`addSegment` first); the repetition defaults to
index 0 and other repetitions of the field are preserved.

Never fabricates: an omitted optional composite field encodes to an
empty/absent component, never a defaulted value; an all-empty composite
clears the field. Segment/helper caches are invalidated on success; the
frozen `warnings` array is untouched.

###### Type Parameters

###### K

`K` *extends* [`CompositeKind`](#compositekind)

###### Parameters

###### path

`string`

###### kind

`K`

###### value

[`CompositeValueByKind`](#compositevaluebykind)\[`K`\]

###### Returns

`this`

###### Example

```ts
const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
msg.setComposite("PID.5", "XPN", { familyName: "Smith", givenName: "Ann" });
msg.setComposite("PID.3", "CX", { idNumber: "MRN001", identifierTypeCode: "MR" });
msg.setComposite("PID.7", "TS", "19880705");
msg.get("PID.5.1"); // "Smith"
```

##### setField()

> **setField**(`path`, `value`): `this`

Set the string value at a dot-path. Mutates the underlying tree and
returns `this` for chaining. Auto-creates missing repetitions,
components, and subcomponents WITHIN an existing field, but does NOT
auto-create segments: callers must `addSegment` first (throws
`TypeError` with an actionable message otherwise).

The value is accepted verbatim: unescaped delimiter characters are NOT
rejected on input. Re-escaping is the serializer's concern.

MSH-1 / MSH-2 follow the user-facing HL7 convention: `setField("MSH.3", ...)`
targets MSH-3 (sending application), matching `msg.get("MSH.3")`.

Segment/Field wrapper caches are invalidated wholesale on success.
The frozen `warnings` array is never touched.

###### Parameters

###### path

`string`

###### value

`string`

###### Returns

`this`

###### Example

```ts
msg.setField("PID.8", "F");           // patient sex → F
msg.setField("PID.5.1", "Jones");     // family name
msg.setField("PID.4[2].1", "MRN2");   // create third repetition of PID-4
```

##### toJSON()

> **toJSON**(): [`SerializedMessage`](#serializedmessage)

Emit this message as a structured `SerializedMessage` JSON projection.
Invoked automatically by `JSON.stringify(msg)`.
Re-walks `rawSegments` on every call (no caching), so on a lazily
parsed message it builds every segment not read yet. Mirrors the
raw tree one-for-one, preserves `isNull`, always includes
`warnings: []`, and includes `profile: { name, lineage }` only when
`this.profile` is truthy. Pure: never warns, never throws.

###### Returns

[`SerializedMessage`](#serializedmessage)

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
const snap = msg.toJSON();
console.log(snap.segments[0]?.name); // "MSH"
console.log(JSON.stringify(msg));     // same content, auto-invokes toJSON
```

##### toString()

> **toString**(): `string`

Emit this message as spec-clean HL7. Re-walks `rawSegments`
on every call (no caching), so on a lazily parsed message it builds
every segment not read yet. Segments are joined with `\r`;
MSH-1 and MSH-2 are inlined verbatim from
`this.encodingCharacters`; every field string passes through
`reescape`. `RawField.isNull === true` is preserved as the
HL7 literal `""`. Pure: never warns, never throws.

###### Returns

`string`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.toString()); // spec-clean, CR-separated HL7
```

***

### Hl7ParseError

Thrown by `parseHL7` when the input violates one of the 4 unrecoverable
Tier-3 structural rules (missing MSH, truncated MSH, invalid encoding
characters, or empty input). Carries positional context plus a short
snippet of the offending input so consumers can log actionable errors.

#### Remarks

`snippet` may contain PHI when parsing real clinical messages, and the
library does not redact it: redact at the call site if required by your
compliance posture. **It is the only field carrying input verbatim and
unfiltered** (capped at 40 characters plus an ellipsis, but not shape-checked
in any way), so it is the one to redact first.

`message` is bounded but not absolutely content-free, and the difference is
worth stating because `message` is what a logger prints by default and what
`stack` embeds. A token lifted from the input is echoed only when it matches
the form the spec defines for it: a three-character segment identifier, an
MSH-9 type, an MSH-12 version, or a charset label the closed Table 0211
actually contains. Anything else becomes `<withheld>`. So a message cannot
carry a field's value, but it can carry a residue of up to three characters
when a malformed line happens to look like a segment identifier. The other
shapes are narrower in practice than their patterns allow, because the
library only ever feeds them registry-matched values, but the patterns
themselves admit more (a message type up to 26 characters, a version up to
14), which matters if you construct warnings yourself.

Under `{ strict: true }` an escalated Tier-2 warning is thrown as this
error, carrying the warning's own code (so `code` is a [FatalCode](#fatalcode) or
a [WarningCode](#warningcode)), its bounded message and a `snippet` of the
**first 40 characters of the input**. That snippet is the head of the
message rather than the deviation's own segment, so it is usually the MSH
header; it is deliberately not re-pointed at the offending segment, since
doing so would move more clinical content into the unredacted field.

Test for the fatal codes you handle and treat any other `code` as an
escalated warning: `err.code in FATAL_CODES` tells the two apart, and a
`switch` over `err.code` that lists the four fatal codes needs a `default`
branch for the escalated warnings.

#### Example

```ts
import { parseHL7, Hl7ParseError } from "@cosyte/hl7";
try {
  parseHL7("");
} catch (err) {
  if (err instanceof Hl7ParseError && err.code === "EMPTY_INPUT") {
    // handle empty input: err.position, err.snippet available
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new Hl7ParseError**(`code`, `message`, `position`, `snippet`): [`Hl7ParseError`](#hl7parseerror)

**`Internal`**

Construct a new `Hl7ParseError`. All four fields are required so every
thrower populates full positional context.

###### Parameters

###### code

[`FatalCode`](#fatalcode) \| [`WarningCode`](#warningcode)

###### message

`string`

###### position

[`Hl7Position`](#hl7position)

###### snippet

`string`

###### Returns

[`Hl7ParseError`](#hl7parseerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`FatalCode`](#fatalcode) \| [`WarningCode`](#warningcode)

A [FatalCode](#fatalcode), or the [WarningCode](#warningcode) of a warning escalated by
`{ strict: true }`.

##### position

> `readonly` **position**: [`Hl7Position`](#hl7position)

##### snippet

> `readonly` **snippet**: `string`

***

### ProfileDefinitionError

Thrown by `defineProfile()` and profile-validation code when a
profile definition is structurally invalid: e.g. references an undefined
parent, declares a malformed custom segment, or includes an unsupported
date format. Callers may optionally supply the offending profile name for
better diagnostics.

#### Example

```ts
import { ProfileDefinitionError } from "@cosyte/hl7";
throw new ProfileDefinitionError(
  "Unknown parent profile: epic-v7",
  "my-epic-extension",
);
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new ProfileDefinitionError**(`message`, `profileName?`): [`ProfileDefinitionError`](#profiledefinitionerror)

**`Internal`**

Construct a new `ProfileDefinitionError`. `profileName` is optional so
callers may omit it when the offending profile cannot be named
(e.g. during initial validation before a name is parsed).

###### Parameters

###### message

`string`

###### profileName?

`string`

###### Returns

[`ProfileDefinitionError`](#profiledefinitionerror)

###### Overrides

`Error.constructor`

#### Properties

##### profileName

> `readonly` **profileName**: `string` \| `undefined`

***

### SchemaTargetError

Thrown when emission is requested for a target this library does not support.
Carries the requested name and the supported set as data as well as in the
message, so a caller can react without parsing prose.

#### Example

```ts
import { emitMessageSchema, SchemaTargetError } from "@cosyte/hl7";
try {
  emitMessageSchema("openapi-3.1");
} catch (error) {
  if (error instanceof SchemaTargetError) {
    error.requestedTarget; // "openapi-3.1"
    error.supportedTargets; // ["json-schema-2020-12", "zod"]
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new SchemaTargetError**(`requestedTarget`): [`SchemaTargetError`](#schematargeterror)

Build the error for one unsupported target name.

###### Parameters

###### requestedTarget

`string`

###### Returns

[`SchemaTargetError`](#schematargeterror)

###### Overrides

`Error.constructor`

#### Properties

##### requestedTarget

> `readonly` **requestedTarget**: `string`

The target name the caller asked for, verbatim.

##### supportedTargets

> `readonly` **supportedTargets**: readonly (`"json-schema-2020-12"` \| `"zod"`)[]

Every target this library does support.

***

### Segment

Wrapper over a `RawSegment` exposing typed per-position `Field` instances.
`seg.field(3) === seg.field(3)`: referential stability is guaranteed per
segment instance.

`FieldName` is the set of names [Segment.get](#get-1) accepts. It is `string`
for every segment whose profile-declared field names are not statically
known, which is the default and covers every segment reached without a
statically known profile; a segment obtained for a declared segment type from
a message parsed with one carries that type's declared names instead.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
const pid = msg.segments("PID")[0];
if (pid !== undefined) console.log(pid.field(5).value);
```

#### Type Parameters

##### FieldName

`FieldName` *extends* `string` = `string`

the names `get` accepts; `string` when not known.

#### Constructors

##### Constructor

> **new Segment**\<`FieldName`\>(`raw`, `enc`, `absoluteIndex`, `customFields?`, `dateFormats?`): [`Segment`](#segment)\<`FieldName`\>

**`Internal`**

Construct a new `Segment`. Called internally by `Hl7Message`; user code
should obtain `Segment` instances via `msg.segments(type)` or
`msg.allSegments()`.

The optional `customFields` parameter is the per-segment portion of the
applied profile's merged declarations for this segment type. When
supplied, `get(name)` resolves names against it; otherwise `get(name)`
always returns `undefined`.

The optional `dateFormats` parameter is the message's merged date-format
list; it is passed straight through to each `Field`.

###### Parameters

###### raw

[`RawSegment`](#rawsegment)

###### enc

[`EncodingCharacters`](#encodingcharacters-1)

###### absoluteIndex

`number`

###### customFields?

`Readonly`\<`Record`\<`string`, `number`\>\>

###### dateFormats?

readonly `string`[]

###### Returns

[`Segment`](#segment)\<`FieldName`\>

#### Properties

##### absoluteIndex

> `readonly` **absoluteIndex**: `number`

**`Internal`**

Absolute index of this segment in `Hl7Message.rawSegments[]`. Used for position tracking.

##### customFields

> `readonly` **customFields**: `Readonly`\<`Record`\<`string`, `number`\>\> \| `undefined`

**`Internal`**

Lookup map from profile-declared field name → 1-indexed HL7 position.
Absent when no profile was applied to the parent message, or when the
applied profile declares no field names for this segment's type in either
of its declaration maps (`customSegments` for a Z-segment,
`segmentOverrides` for a standard one). Consumed by `get(name)` to resolve
named-field access.

##### dateFormats

> `readonly` **dateFormats**: readonly `string`[]

**`Internal`**

The message's merged `dateFormats`, handed to every `Field` this
segment builds so a typed `TS` coercion honours what the caller declared.
Empty when neither `ParseOptions.dateFormats` nor the applied profile
declared any.

##### enc

> `readonly` **enc**: [`EncodingCharacters`](#encodingcharacters-1)

**`Internal`**

The 5 encoding characters for this message. Exposed for composite parsers.

##### fields

> `readonly` **fields**: readonly [`RawField`](#rawfield)[]

Reference to the underlying `RawSegment.fields`: 1-indexed per HL7 convention. On a lazily
parsed message, the first read builds this segment's tree (and only this segment's).

##### raw

> `readonly` **raw**: [`RawSegment`](#rawsegment)

**`Internal`**

The full `RawSegment` this wrapper wraps. Exposed for mutation methods. On a lazily parsed
message, the first read builds this segment's tree (and only this segment's).

##### type

> `readonly` **type**: `string`

Segment identifier: three characters with a leading letter, e.g. `"PID"`,
`"OBX"`, `"ZPI"`.

**Canonical ASCII uppercase.** A sender that ships `pid` or `Obx`, which
no segment identifier in the HL7 v2 standard does but which real feeds do,
reports here as `PID` / `OBX`, so `msg.segments("PID")` matches it and a
`SEGMENT_CASE` warning records the deviation. Read
[Segment.raw](#raw-1)`.name` for the spelling that actually arrived.

**Bounded, and it is `"<withheld>"` when the raw name is not that shape.**
A line with no field separator has its whole content read as a segment
name, so an unescaped line break inside a narrative field forges a
"segment" whose name is clinical text. This field presents itself as a
structural identifier and consumers interpolate it into labels, loci and
reports, so it never carries that text. `""` still means absent, which is
a different fact from withheld.

Use [Segment.raw](#raw-1)`.name` when you need the verbatim text: it is the
unbounded value, and it is what serialization emits, so the byte-verbatim
round-trip is unaffected. One consequence worth knowing: a segment whose
raw name fails the shape (a 4-character vendor Z-segment, which HL7 v2
Ch. 2 §2.5 does not permit) is not matched by `msg.segments(name)`.

#### Methods

##### field()

> **field**(`n`): [`Field`](#field)

Return the `Field` wrapper at HL7 position `n`. Indexing follows the HL7
1-indexed convention: `seg.field(5)` on a PID segment maps to PID-5.
MSH segments use the same user-facing convention: `msh.field(1)` returns
the field-separator (MSH-1), `msh.field(2)` returns encoding chars
(MSH-2), `msh.field(3)` returns MSH-3, and so on: the internal
`fields[N-1]` offset for MSH segments is applied here (mirrors the
dot-path resolver in `dot-path.ts`, keeping `msg.segments('MSH')[0].field(3)`
and `msg.get('MSH.3')` in agreement).

Returns a synthetic empty `Field` (`.isNull === false`, `.value === ""`)
when `n` is out of range: never throws. Successive calls with
the same `n` return the same `Field` instance.

###### Parameters

###### n

`number`

###### Returns

[`Field`](#field)

###### Example

```ts
const pid5 = msg.segments("PID")[0]?.field(5);
console.log(pid5?.value); // "Smith"
const msh3 = msg.segments("MSH")[0]?.field(3);
console.log(msh3?.value); // sending application (HL7 MSH-3)
```

##### get()

> **get**(`name`): [`Field`](#field) \| `undefined`

Return the `Field` at the profile-declared position for `name`, or
`undefined` when no custom mapping exists. Unlike `field(n)`,
missing names return `undefined`, NOT a synthetic empty Field, so
typos surface instead of silently resolving to an empty string.

Two declaration maps feed it, and which one a name may come from depends
on the segment: `customSegments` names fields on a Z-segment,
`segmentOverrides` names fields on a standard one. Both are read-side
ALIASES. A name resolves to whatever `field(n)` returns for its declared
position and nothing else moves: the positional accessor, dot-paths, the
typed clinical accessors (`msg.patient`, `msg.allergies()`, ...), the
warning list and both serializations are unaffected by a declaration.

For segments the profile in force declares nothing for (and for every
segment when no profile was applied), this method always returns
`undefined`.

When the declared position is out of range for the underlying
`RawSegment.fields`, `get(name)` returns `undefined` (NOT a
synthetic-empty Field) so callers can distinguish "name not declared"
from "name declared but position missing in the raw message" only at
the presence level (both collapse to `undefined`).

**`name` is checked at compile time when the declaration is statically
known.** On a segment obtained by type from a message parsed with a
statically known profile, `name` is scoped to the names that profile
declares FOR THAT SEGMENT TYPE, so a typo is a type error rather than a
silent `undefined`. Everywhere the declaration is not statically known
(no profile, a value typed as the general `Profile` interface, the
process-wide default profile, an undeclared segment type, an empty field
map, or the undifferentiated `allSegments()` walk) `name` stays `string`.
The return type is unchanged either way: a declared name is not a promise
that the wire message carried it.

###### Parameters

###### name

`FieldName`

###### Returns

[`Field`](#field) \| `undefined`

###### Example

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const profile = defineProfile({
  name: "vendor",
  customSegments: { ZPI: { fields: { encounterId: 3 } } },
});
const msg = parseHL7(raw, profile);
console.log(msg.part("ZPI")?.get("encounterId")?.value); // narrowed, no cast
// msg.part("ZPI")?.get("encounterld"); // does not compile: not declared
const walked = msg.allSegments().find((s) => s.type === "ZPI");
console.log(walked?.get("encounterId")?.value); // a walk takes any name
```

## Interfaces

### AckErrorDetail

One ERR segment's worth of error detail for `buildAck`. Carries **codes and
locations only: never echoed PHI values** (the phi-redaction-review gate
binds this contract).

#### Example

```ts
import { buildAck } from "@cosyte/hl7";
const ack = buildAck(inbound, {
  code: "AE",
  error: { conditionCode: "101", severity: "E", location: "PID^1^5" },
});
```

#### Properties

##### conditionCode?

> `readonly` `optional` **conditionCode?**: `string`

HL7 Table 0357 message error condition code (ERR-3.1). Defaults to `"207"`
(Application internal error). The standard display text is looked up from
Table 0357 and emitted in ERR-3.2; unknown codes emit with empty text
(the code is preserved verbatim: never dropped).

##### location?

> `readonly` `optional` **location?**: `string`

Error location (ERR-2, an HL7 ERL). A structural path such as `"PID^1^5"`
(segment id ^ segment sequence ^ field position). **Must not contain a
patient data value**: locations point at *where*, never *what*.

##### severity?

> `readonly` `optional` **severity?**: [`ErrSeverity`](#errseverity)

HL7 Table 0516 severity (ERR-4). Defaults to `"E"` (Error).

***

### AckErrorEntry

One ERR segment interpreted from an ACK. All fields are surfaced verbatim
(no table lookup) and OMITTED when the underlying component is absent
(exactOptionalPropertyTypes). Codes/locations only: never PHI.

#### Properties

##### conditionCode?

> `readonly` `optional` **conditionCode?**: `string`

ERR-3.1: HL7 Table 0357 condition code.

##### conditionCodeSystem?

> `readonly` `optional` **conditionCodeSystem?**: `string`

ERR-3.3: condition code system name (e.g. `HL70357`).

##### conditionText?

> `readonly` `optional` **conditionText?**: `string`

ERR-3.2: condition code display text.

##### location?

> `readonly` `optional` **location?**: `string`

ERR-2: error location (an HL7 ERL), surfaced verbatim.

##### severity?

> `readonly` `optional` **severity?**: `string`

ERR-4: HL7 Table 0516 severity (`I`/`W`/`E`).

***

### Acknowledgment

Typed view of an inbound ACK. `accepted` / `error` / `rejected` are derived
from MSA-1 against HL7 Table 0008 and are **mutually exclusive**; all three
are `false` when MSA-1 is absent or not a recognized code (fail-safe).

#### Example

```ts
import { interpretAck, parseHL7 } from "@cosyte/hl7";
const ack = interpretAck(parseHL7(rawAck));
if (ack.accepted) {
  // safe to consider the message acknowledged
} else if (ack.rejected) {
  for (const e of ack.errors) console.error(e.conditionCode, e.severity);
}
```

#### Properties

##### accepted

> `readonly` **accepted**: `boolean`

True iff MSA-1 is a positive accept (`AA`/`CA`).

##### code?

> `readonly` `optional` **code?**: `string`

MSA-1 acknowledgment code (HL7 Table 0008), verbatim. Omitted when absent.

##### controlId?

> `readonly` `optional` **controlId?**: `string`

MSA-2 message control id (the correlated inbound MSH-10), surfaced as the
field's **canonical wire text** (`Field.text`): the whole field,
delimiters included, never truncated to the first component. Note this is
the *re-escaped* form: a properly-escaped id arrives as its wire bytes
(`ID\S\X`), and an HL7 explicit-null MSA-2 surfaces as the literal
two-character `""`. Omitted when absent/empty.

##### error

> `readonly` **error**: `boolean`

True iff MSA-1 is an error acknowledgment (`AE`/`CE`).

##### errors

> `readonly` **errors**: readonly [`AckErrorEntry`](#ackerrorentry)[]

Every ERR segment in document order ( `[]` when none ).

##### rejected

> `readonly` **rejected**: `boolean`

True iff MSA-1 is a reject acknowledgment (`AR`/`CR`).

***

### AdtEvent

Typed EVN (event type) content for [buildAdt](#buildadt).

#### Properties

##### eventOccurred?

> `readonly` `optional` **eventOccurred?**: `string` \| [`DtmParts`](#dtmparts)

EVN-6 Event Occurred.

##### recordedDateTime?

> `readonly` `optional` **recordedDateTime?**: `string` \| [`DtmParts`](#dtmparts)

EVN-2 Recorded Date/Time.

***

### AdtPatient

Typed PID (patient identification) content for [buildAdt](#buildadt).

#### Properties

##### accountNumber?

> `readonly` `optional` **accountNumber?**: [`CX`](#cx-1)

PID-18 Patient Account Number.

##### address?

> `readonly` `optional` **address?**: [`XAD`](#xad-1) \| readonly [`XAD`](#xad-1)[]

PID-11 Patient Address: one or more XAD addresses.

##### administrativeSex?

> `readonly` `optional` **administrativeSex?**: `string`

PID-8 Administrative Sex (e.g. `"F"`, `"M"`, `"U"`).

##### birthDateTime?

> `readonly` `optional` **birthDateTime?**: `string` \| [`DtmParts`](#dtmparts)

PID-7 Date/Time of Birth.

##### identifiers?

> `readonly` `optional` **identifiers?**: [`CX`](#cx-1) \| readonly [`CX`](#cx-1)[]

PID-3 Patient Identifier List: one or more CX identifiers (MRN, SSN, …).

##### mothersMaidenName?

> `readonly` `optional` **mothersMaidenName?**: [`XPN`](#xpn-1)

PID-6 Mother's Maiden Name.

##### name?

> `readonly` `optional` **name?**: [`XPN`](#xpn-1) \| readonly [`XPN`](#xpn-1)[]

PID-5 Patient Name.

##### phoneHome?

> `readonly` `optional` **phoneHome?**: [`XTN`](#xtn-1) \| readonly [`XTN`](#xtn-1)[]

PID-13 Phone Number - Home: one or more XTN telecoms.

##### setId?

> `readonly` `optional` **setId?**: `string`

PID-1 Set ID.

***

### AdtPriorIdentity

Typed MRG (merge patient information) content for [buildAdt](#buildadt): the
**prior**, non-surviving identity that a merge or move event retires in
favour of the `patient` identity. The direction is HL7's and is constant:
the identifiers here merge INTO the ones on PID, never the reverse.

#### Example

```ts
import type { AdtPriorIdentity } from "@cosyte/hl7";
const prior: AdtPriorIdentity = {
  identifiers: { idNumber: "MRN-OLD", identifierTypeCode: "MR" },
  accountNumber: { idNumber: "ACCT-OLD" },
};
```

#### Properties

##### accountNumber?

> `readonly` `optional` **accountNumber?**: [`CX`](#cx-1)

MRG-3 Prior Patient Account Number: the merge key of an account merge.

##### identifiers?

> `readonly` `optional` **identifiers?**: [`CX`](#cx-1) \| readonly [`CX`](#cx-1)[]

MRG-1 Prior Patient Identifier List: one or more CX identifiers.

##### legacyPatientId?

> `readonly` `optional` **legacyPatientId?**: [`CX`](#cx-1)

MRG-4 Prior Patient ID. Backward compatibility only: withdrawn as of HL7
v2.7 in favour of MRG-1, and the read side stops reading it on a message
whose MSH-12 declares v2.7 or later.

##### name?

> `readonly` `optional` **name?**: [`XPN`](#xpn-1)

MRG-7 Prior Patient Name.

##### visitNumber?

> `readonly` `optional` **visitNumber?**: [`CX`](#cx-1)

MRG-5 Prior Visit Number: the merge key of a visit merge.

***

### AdtVisit

Typed PV1 (patient visit) content for [buildAdt](#buildadt).

#### Properties

##### admitDateTime?

> `readonly` `optional` **admitDateTime?**: `string` \| [`DtmParts`](#dtmparts)

PV1-44 Admit Date/Time.

##### assignedLocation?

> `readonly` `optional` **assignedLocation?**: [`PL`](#pl-1)

PV1-3 Assigned Patient Location.

##### attendingDoctor?

> `readonly` `optional` **attendingDoctor?**: [`XCN`](#xcn-1) \| readonly [`XCN`](#xcn-1)[]

PV1-7 Attending Doctor.

##### patientClass?

> `readonly` `optional` **patientClass?**: `string`

PV1-2 Patient Class (e.g. `"I"` inpatient, `"O"` outpatient, `"E"` emergency).

##### referringDoctor?

> `readonly` `optional` **referringDoctor?**: [`XCN`](#xcn-1) \| readonly [`XCN`](#xcn-1)[]

PV1-8 Referring Doctor.

##### setId?

> `readonly` `optional` **setId?**: `string`

PV1-1 Set ID.

##### visitNumber?

> `readonly` `optional` **visitNumber?**: [`CX`](#cx-1)

PV1-19 Visit Number.

***

### Allergy

One allergy entry, read from an AL1 or an IAM segment (see `source`). Both
segments fill `type`, `code`, `severity` and `reaction` in the same shapes;
`onsetDate` comes from AL1 only, and `actionCode`, `deleteRequested` and
`uniqueIdentifier` from IAM only. Every key but `source` is OMITTED when the
field it reads is empty: none is defaulted.

An entry is a report of what one segment said, never the result of applying
it. An IAM entry whose action code is `D` is a request to delete an allergy
sent earlier, and it is still returned: it is marked by `deleteRequested`,
and nothing is removed, merged or updated on the caller's behalf.

#### Example

```ts
import type { Allergy } from "@cosyte/hl7";
const al: Allergy = {
  source: "AL1",
  type: "DA",
  code: { identifier: "PEN", text: "Penicillin" },
  severity: "SV",
  reaction: "Hives",
};
```

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

IAM-6 allergy action code (Table 0206), component 1 exactly as sent: no
case-folding, no mapping, and an unlisted code surfaced as it arrived.
OMITTED when IAM-6 is empty, never defaulted to `A`. Absent on AL1 entries.
IAM-6 does not repeat: a malformed repeated IAM-6 surfaces every
repetition's component 1, joined by the message's repetition separator
(`D~A`), rather than its first piece.

###### Example

```ts
for (const al of msg.allergies()) {
  if (al.actionCode === "U") console.log("update to", al.uniqueIdentifier?.entityIdentifier);
}
```

##### code?

> `readonly` `optional` **code?**: [`CWE`](#cwe-1)

AL1-3 or IAM-3 allergen code.

##### deleteRequested?

> `readonly` `optional` **deleteRequested?**: `true`

`true` when `actionCode` is exactly `D`: this entry asks the receiver to
delete an allergy sent earlier, identified by `uniqueIdentifier`. OMITTED on
every other entry, including a lowercase `d`, an unknown or malformed code,
an empty IAM-6 and every AL1 entry. The entry itself is still returned, with
every field it carries; the delete is never applied here.

###### Example

```ts
const current = msg.allergies().filter((al) => al.deleteRequested !== true);
```

##### onsetDate?

> `readonly` `optional` **onsetDate?**: [`DtmParts`](#dtmparts)

AL1-6 onset date as the fidelity `TS`.

##### reaction?

> `readonly` `optional` **reaction?**: `string`

AL1-5 or IAM-5 allergy reaction (first repetition).

##### severity?

> `readonly` `optional` **severity?**: `string`

AL1-4 or IAM-4 severity, component 1 (SV=severe, MO=moderate, MI=mild).

##### source

> `readonly` **source**: [`AllergySource`](#allergysource-1)

The segment this entry was read from. Always present.

###### Example

```ts
const fromIam = msg.allergies().filter((al) => al.source === "IAM");
```

##### type?

> `readonly` `optional` **type?**: `string`

AL1-2 or IAM-2 allergen type, component 1 (DA=drug, FA=food, EA=environmental, ...).

##### uniqueIdentifier?

> `readonly` `optional` **uniqueIdentifier?**: [`AllergyUniqueIdentifier`](#allergyuniqueidentifier-1)

IAM-7 allergy unique identifier, components 1 and 2. OMITTED when IAM-7 is
empty; never filled from IAM-3. Absent on AL1 entries.

###### Example

```ts
msg.allergies()[0]?.uniqueIdentifier?.entityIdentifier; // "ALG-0001"
```

***

### AllergyUniqueIdentifier

IAM-7 allergy unique identifier (EI): the sender's identifier for one
allergy, which an update or delete for that allergy repeats. Components 1
and 2 only; each key is OMITTED when its component is empty. It is never
filled from IAM-3 or any other field when IAM-7 is absent.

#### Example

```ts
import type { AllergyUniqueIdentifier } from "@cosyte/hl7";
const id: AllergyUniqueIdentifier = { entityIdentifier: "ALG-0001", namespaceId: "LAB" };
```

#### Properties

##### entityIdentifier?

> `readonly` `optional` **entityIdentifier?**: `string`

EI-1 entity identifier, verbatim.

###### Example

```ts
msg.allergies()[0]?.uniqueIdentifier?.entityIdentifier; // "ALG-0001"
```

##### namespaceId?

> `readonly` `optional` **namespaceId?**: `string`

EI-2 namespace ID of the application that assigned the identifier, verbatim.

###### Example

```ts
msg.allergies()[0]?.uniqueIdentifier?.namespaceId; // "LAB"
```

***

### Appointment

SCH-derived appointment entry (SIU scheduling breadth). Surfaces the
appointment identifiers, filler status (SCH-25, Table 0278), SCH-11 start/end
timing, and the AI* resource groups. NOT a scheduling-workflow state machine.

#### Example

```ts
import type { Appointment } from "@cosyte/hl7";
const appt: Appointment = {
  fillerAppointmentId: "A1001",
  fillerStatusCode: { identifier: "Booked" },
  resources: [],
};
```

#### Properties

##### endDateTime?

> `readonly` `optional` **endDateTime?**: [`DtmParts`](#dtmparts)

Appointment end date/time: SCH-11 TQ.5 (fidelity `TS`).

##### fillerAppointmentId?

> `readonly` `optional` **fillerAppointmentId?**: `string`

SCH-2 filler appointment ID (EI first component, verbatim).

##### fillerStatusCode?

> `readonly` `optional` **fillerStatusCode?**: [`CWE`](#cwe-1)

SCH-25 filler status code (HL7 Table 0278): the appointment status, verbatim/provenance-only.

##### placerAppointmentId?

> `readonly` `optional` **placerAppointmentId?**: `string`

SCH-1 placer appointment ID (EI first component, verbatim).

##### resources

> `readonly` **resources**: readonly [`AppointmentResource`](#appointmentresource)[]

AIS/AIG/AIL/AIP resources grouped under this SCH. Always present (possibly empty).

##### startDateTime?

> `readonly` `optional` **startDateTime?**: [`DtmParts`](#dtmparts)

Appointment start date/time: SCH-11 TQ.4 (fidelity `TS`).

***

### AppointmentResource

One appointment resource grouped under a `SCH`: an AIS (service),
AIG (general resource), AIL (location), or AIP (personnel / provider) segment.
The resource identifier lives at position 3 of every AI* segment; for the
personnel resource (AIP) it is additionally surfaced as a typed `person`
(XCN), while the coded `code` (first component verbatim) is always available.

#### Example

```ts
import type { AppointmentResource } from "@cosyte/hl7";
const r: AppointmentResource = { kind: "location", code: { identifier: "OR-1" } };
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CWE`](#cwe-1)

The AI*-3 resource identifier surfaced as a coded element: `code.identifier`
is the resource id (first component, verbatim). AIS-3 / AIG-3 are coded
elements, so `code.text` / `code.nameOfCodingSystem` are meaningful there;
AIL-3 is a **PL** (location) rather than a coded element, so only
`code.identifier` (the location id, PL.1) is meaningful and the other CWE
fields are positional provenance, not a coding system. Provenance-only.

##### kind

> `readonly` **kind**: `"service"` \| `"general"` \| `"location"` \| `"personnel"`

Which AI* segment sourced this resource: AIS→service, AIG→general, AIL→location, AIP→personnel.

##### person?

> `readonly` `optional` **person?**: [`XCN`](#xcn-1)

AIP-3 personnel resource as a typed `XCN` (personnel resources only): the appointment provider.

***

### Batch

One batch within a stream: a run of messages delimited by a `BHS` header
and/or a `BTS` trailer (both optional in §2.10.3, so a `BTS` closes a
preceding run into a batch even with no `BHS`). A run of messages with
**neither** a header nor a trailer is *not* a batch: those messages live in
[BatchSplitResult.messages](#messages-1) only, so they never inflate a batch count.
`declaredMessageCount` is BTS-1 when the trailer declared a usable
non-negative integer (it is **optional [0..1]** in the spec, so it may be
absent); `actualMessageCount` is always the real count.

#### Example

```ts
import { splitBatch } from "@cosyte/hl7";
const [batch] = splitBatch(raw).batches;
batch?.header?.name; // "BHS" (or undefined for a headerless BTS-closed run)
batch?.actualMessageCount; // messages actually in the batch
```

#### Type Parameters

##### M

`M` *extends* [`Hl7Message`](#hl7message) = [`Hl7Message`](#hl7message)

the message type an `ok` entry carries.

#### Properties

##### actualMessageCount

> `readonly` **actualMessageCount**: `number`

The actual number of messages split out of this batch.

##### declaredMessageCount?

> `readonly` `optional` **declaredMessageCount?**: `number`

BTS-1 batch message count, when declared as a non-negative integer.

##### header?

> `readonly` `optional` **header?**: [`BatchEnvelopeSegment`](#batchenvelopesegment)

The `BHS` header, when this batch was opened by one.

##### messages

> `readonly` **messages**: readonly [`BatchMessageEntry`](#batchmessageentry)\<`M`\>[]

The messages in this batch, in stream order.

##### trailer?

> `readonly` `optional` **trailer?**: [`BatchEnvelopeSegment`](#batchenvelopesegment)

The `BTS` trailer, when this batch was closed by one.

***

### BatchEnvelopeSegment

A raw batch-envelope segment (`FHS`/`BHS`/`BTS`/`FTS`) surfaced by
[splitBatch](#splitbatch). `fields` is the segment split on its own field separator
with `fields[0]` holding the segment name: deliberately the raw token
array, not a typed model: typed FHS/BHS field helpers beyond the raw
fields are not part of this surface. Note the
HL7 MSH-family indexing quirk: for `FHS`/`BHS`, `fields[1]` is the
encoding-characters field (FHS-2/BHS-2); for `BTS`/`FTS`, `fields[1]` is
field 1 (BTS-1 batch message count / FTS-1 file batch count).

#### Example

```ts
import { splitBatch } from "@cosyte/hl7";
const { fileHeader } = splitBatch("FHS|^~\\&|SENDER\r...");
fileHeader?.name; // "FHS"
fileHeader?.fields[2]; // "SENDER" (FHS-3, the File Sending Application)
```

#### Properties

##### fields

> `readonly` **fields**: readonly `string`[]

Raw field tokens; `fields[0]` is the segment name.

##### name

> `readonly` **name**: [`BatchEnvelopeName`](#batchenvelopename)

##### position

> `readonly` **position**: [`Hl7Position`](#hl7position)

Position of this envelope segment in the split stream.

##### raw

> `readonly` **raw**: `string`

The verbatim segment string (line-ending normalized).

***

### BatchSplitResult

The result of [splitBatch](#splitbatch): the flattened `messages` (every message
across every batch, in stream order: the primary surface), the nested
`batches`, the raw file envelope segments, and the batch-level `warnings`
(count-mismatch / missing-trailer). `hadEnvelope` is `false` for a bare
passthrough (no FHS/BHS/BTS/FTS seen).

#### Example

```ts
import { splitBatch } from "@cosyte/hl7";
const result = splitBatch(rawBatchFile);
result.messages.length; // every message, batched or not
result.batches.length; // === result.actualBatchCount
result.warnings; // BATCH_COUNT_MISMATCH / BATCH_MISSING_TRAILER (counts only)
```

#### Type Parameters

##### M

`M` *extends* [`Hl7Message`](#hl7message) = [`Hl7Message`](#hl7message)

the message type an `ok` entry carries.

#### Properties

##### actualBatchCount

> `readonly` **actualBatchCount**: `number`

The number of explicit batches split out of the stream.

##### batches

> `readonly` **batches**: readonly [`Batch`](#batch)\<`M`\>[]

The explicit (`BHS`-delimited) batches, in stream order.

##### declaredBatchCount?

> `readonly` `optional` **declaredBatchCount?**: `number`

The last `FTS-1` file batch count, when declared as a non-negative integer.

##### fileHeader?

> `readonly` `optional` **fileHeader?**: [`BatchEnvelopeSegment`](#batchenvelopesegment)

The **first** `FHS` file header, when present.

##### fileTrailer?

> `readonly` `optional` **fileTrailer?**: [`BatchEnvelopeSegment`](#batchenvelopesegment)

The **last** `FTS` file trailer, when present.

##### hadEnvelope

> `readonly` **hadEnvelope**: `boolean`

`false` when no envelope segment was seen (bare passthrough).

##### messages

> `readonly` **messages**: readonly [`BatchMessageEntry`](#batchmessageentry)\<`M`\>[]

Every message split out of the stream, in order: the primary surface. This
includes messages that belong to no explicit batch (a bare stream, or
content outside any `BHS`/`BTS`), so it is a superset of the messages
reachable via `batches`.

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

Batch-level warnings (count mismatch, missing trailer); counts/positions only, never PHI.

***

### BuildAckOptions

Options for [buildAck](#buildack).

#### Example

```ts
buildAck(inbound, { code: "AA" });                       // bare accept
buildAck(inbound, { code: "AR", error: { conditionCode: "200" } });
```

#### Properties

##### code

> `readonly` **code**: [`AckCode`](#ackcode)

The acknowledgment disposition to emit in MSA-1 (HL7 Table 0008). One of
`AA`/`AE`/`AR` (original) or `CA`/`CE`/`CR` (enhanced accept-level).
Required: `buildAck` builds the disposition it is told. An unknown code
is a programming error and throws `TypeError`.

##### error?

> `readonly` `optional` **error?**: [`AckErrorDetail`](#ackerrordetail) \| readonly [`AckErrorDetail`](#ackerrordetail)[]

Optional error detail. A single [AckErrorDetail](#ackerrordetail) or an array → one
ERR segment each. Typically supplied for `AE`/`AR`/`CE`/`CR`.

##### mode?

> `readonly` `optional` **mode?**: [`AckMode`](#ackmode)

Optional explicit acknowledgment mode. When omitted it is derived from the
inbound MSH-15/16 via [detectAckMode](#detectackmode). `buildAck` emits `code`
verbatim regardless of mode: this field is advisory metadata for adapters
(e.g. `@cosyte/mllp`'s commit-policy layer) that need the detected mode.

***

### BuildAdtInit

Input for [buildAdt](#buildadt): the MSH envelope plus the typed segment bodies.

#### Extends

- `MessageEnvelope`

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### event?

> `readonly` `optional` **event?**: [`AdtEvent`](#adtevent)

EVN content (EVN-1 is the trigger event; EVN-2/6 optional).

##### patient

> `readonly` **patient**: [`AdtPatient`](#adtpatient)

PID content. **Required**: never fabricated.

##### priorIdentity?

> `readonly` `optional` **priorIdentity?**: [`AdtPriorIdentity`](#adtprioridentity)

MRG content: the prior identity a merge, move or identifier-change event
retires. Optional,
and emitted only when supplied. **Required for a trigger event whose
published structure requires MRG**, where an init without it is a typed
error rather than a message missing the identity it retires.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

##### visit?

> `readonly` `optional` **visit?**: [`AdtVisit`](#adtvisit)

PV1 content. Optional; an (empty) PV1 is emitted regardless so the visit group is present.

***

### BuildDftInit

Input for [buildDft](#builddft): the MSH envelope plus the typed segment bodies.

#### Example

```ts
import type { BuildDftInit } from "@cosyte/hl7";
const init: BuildDftInit = {
  sendingApp: "CLINIC",
  receivingApp: "BILLING",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  charges: [{ transactionType: "CG", amountExtended: { price: "150.00", denomination: "USD" } }],
};
```

#### Extends

- `MessageEnvelope`

#### Properties

##### charges

> `readonly` **charges**: readonly [`DftCharge`](#dftcharge)[]

FT1 content. **Required, non-empty**: a DFT with no transaction is a typed error.

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### event?

> `readonly` `optional` **event?**: [`AdtEvent`](#adtevent)

EVN content (EVN-1 is the trigger event; EVN-2/6 optional).

##### patient

> `readonly` **patient**: [`AdtPatient`](#adtpatient)

PID content. **Required**: never fabricated.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

##### visit?

> `readonly` `optional` **visit?**: [`AdtVisit`](#adtvisit)

PV1 content. Optional; a PV1 is emitted only when supplied.

***

### BuildMdmInit

Input for [buildMdm](#buildmdm): the MSH envelope plus the typed segment bodies.

#### Example

```ts
import type { BuildMdmInit } from "@cosyte/hl7";
const init: BuildMdmInit = {
  sendingApp: "TRANSCRIPTION",
  receivingApp: "EHR",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  document: { documentType: "DS", body: [{ valueType: "TX", value: "Report text." }] },
};
```

#### Extends

- `MessageEnvelope`

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### document

> `readonly` **document**: [`MdmDocument`](#mdmdocument)

TXA content. **Required**: a document notification with no document is a typed error.

##### event?

> `readonly` `optional` **event?**: [`AdtEvent`](#adtevent)

EVN content (EVN-1 is the trigger event; EVN-2/6 optional).

##### patient

> `readonly` **patient**: [`AdtPatient`](#adtpatient)

PID content. **Required**: never fabricated.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

##### visit?

> `readonly` `optional` **visit?**: [`AdtVisit`](#adtvisit)

PV1 content. Optional; an (empty) PV1 is emitted regardless so the visit group is present.

***

### BuildMessageInit

Input shape for `buildMessage`. Mirrors `msg.meta` 1-for-1 so
read and write surfaces share field names (`sendingApp`, `sendingFacility`,
`receivingApp`, `receivingFacility`, `controlId`, `timestamp`, `version`,
`processingId`). `type` is the only required field.

**Empty string vs. undefined semantics:** omitting a field and passing an
empty string produce IDENTICAL wire output (both emit as an absent
positional field). To emit an HL7 explicit null (`""`) at a specific
position in an outbound message, build the message first and then call
`.setField(path, '""')`: the mutation method sets `isNull=true`
on the underlying `RawField`, and the emitter preserves that as the
literal two-char output.

#### Example

```ts
import { buildMessage } from "@cosyte/hl7";
const msg = buildMessage({
  type: "ADT^A01",
  sendingApp: "CLINIC",
  sendingFacility: "MAIN",
  receivingApp: "LAB",
  receivingFacility: "REF",
  timestamp: new Date("2026-04-19T10:15:00Z"),
})
  .addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);
console.log(msg.toString());

// To emit HL7 explicit null ("") instead of absent:
//   msg.setField("PID.2", '""');   // distinct from empty/omitted
```

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` formatted to HL7 `YYYYMMDDHHmmss` (UTC, seconds) when supplied;
pre-formatted HL7 TS string passed through verbatim. Defaults to
`new Date()`.

##### type

> `readonly` **type**: `string`

HL7 message type, e.g. `"ADT^A01"` (code + trigger) or
`"ORU^R01^ORU_R01"` (code + trigger + structure). Required.

The string is split on `^` into MSH-9 components; each component is
emitted verbatim. Literal `^` characters in a component are NOT
representable via this field: splitting is unconditional. Callers
needing that edge case should build the message and then use
`.setField("MSH.9.1", ...)` etc. after construction.

Rejected at runtime:
- empty string `""` or whitespace-only `"   "`;
- strings whose every `^`-split component is empty/whitespace
  (e.g. `"^"`, `"^^"`, `"   ^   "`).

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

***

### BuildOrmInit

Input for [buildOrm](#buildorm): the MSH envelope plus the typed segment bodies.

#### Example

```ts
import type { BuildOrmInit } from "@cosyte/hl7";
const init: BuildOrmInit = {
  sendingApp: "EHR",
  receivingApp: "LAB",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  orders: [{ orderControl: "NW", universalServiceId: { identifier: "CBC" } }],
};
```

#### Extends

- `MessageEnvelope`

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### orders

> `readonly` **orders**: readonly [`OrmOrder`](#ormorder)[]

ORC/OBR content. **Required, non-empty**: an ORM with no order is a typed error.

##### patient

> `readonly` **patient**: [`AdtPatient`](#adtpatient)

PID content. **Required**: never fabricated.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

***

### BuildOruInit

Input for [buildOru](#buildoru): the MSH envelope plus the typed segment bodies.

#### Extends

- `MessageEnvelope`

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### observations

> `readonly` **observations**: readonly [`OruObservation`](#oruobservation)[]

OBX content. **Required, non-empty**: an ORU with no result is a typed error.

##### order?

> `readonly` `optional` **order?**: [`OruOrder`](#oruorder)

OBR content. Optional; an (empty) OBR is emitted regardless so the result group is well-formed.

##### patient

> `readonly` **patient**: [`AdtPatient`](#adtpatient)

PID content. **Required**: never fabricated.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

***

### BuildSiuInit

Input for [buildSiu](#buildsiu): the MSH envelope plus the typed segment bodies.

#### Example

```ts
import type { BuildSiuInit } from "@cosyte/hl7";
const init: BuildSiuInit = {
  sendingApp: "SCHEDULING",
  receivingApp: "EHR",
  appointment: { fillerAppointmentId: "FL-2002", startDateTime: "20260801090000" },
  resourceGroups: [{ setId: "1", resources: [{ kind: "location", code: { identifier: "OR-1" } }] }],
};
```

#### Extends

- `MessageEnvelope`

#### Properties

##### appointment

> `readonly` **appointment**: [`SiuAppointment`](#siuappointment)

SCH content. **Required**: never fabricated.

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### patient?

> `readonly` `optional` **patient?**: [`AdtPatient`](#adtpatient)

PID content. Optional: the patient group of the published SIU structure is
optional, so a PID is emitted only when supplied.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### resourceGroups

> `readonly` **resourceGroups**: readonly [`SiuResourceGroup`](#siuresourcegroup)[]

RGS content. **Required, non-empty**: the published structure needs a resource group.

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

##### visit?

> `readonly` `optional` **visit?**: [`AdtVisit`](#adtvisit)

PV1 content. Optional; emitted only when supplied, and only alongside a patient.

***

### BuildVxuInit

Input for [buildVxu](#buildvxu): the MSH envelope plus the typed segment bodies.

#### Example

```ts
import type { BuildVxuInit } from "@cosyte/hl7";
const init: BuildVxuInit = {
  sendingApp: "CLINIC",
  receivingApp: "IIS",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  immunizations: [{ vaccineCode: { identifier: "115", nameOfCodingSystem: "CVX" } }],
};
```

#### Extends

- `MessageEnvelope`

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

Auto-generated via `generateControlId()` when omitted.

###### Inherited from

`MessageEnvelope.controlId`

##### immunizations

> `readonly` **immunizations**: readonly [`VxuImmunization`](#vxuimmunization)[]

RXA content. **Required, non-empty**: a vaccination update with no dose is a typed error.

##### patient

> `readonly` **patient**: [`AdtPatient`](#adtpatient)

PID content. **Required**: never fabricated.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

Defaults to `"P"` (production).

###### Inherited from

`MessageEnvelope.processingId`

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

###### Inherited from

`MessageEnvelope.receivingApp`

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

###### Inherited from

`MessageEnvelope.receivingFacility`

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

###### Inherited from

`MessageEnvelope.sendingApp`

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

###### Inherited from

`MessageEnvelope.sendingFacility`

##### timestamp?

> `readonly` `optional` **timestamp?**: `string` \| `Date`

`Date` → HL7 `YYYYMMDDHHmmss` (UTC, seconds); a pre-formatted HL7 TS string
passes through verbatim. Defaults to `new Date()`.

###### Inherited from

`MessageEnvelope.timestamp`

##### version?

> `readonly` `optional` **version?**: `string`

Defaults to `"2.5"`.

###### Inherited from

`MessageEnvelope.version`

***

### Cardinality

A repetition-count constraint. `min` / `max` are inclusive bounds on the
number of repetitions (for a field rule) or occurrences (for a segment
rule). `max` may be the literal `"*"` for "unbounded". Omitted bounds are
unconstrained on that side.

**Cardinality `min` is checked only when the element is present.** An absent
**Required** element is reported as [FINDING\_CODES.PROFILE\_REQUIRED\_ABSENT](#profile_required_absent)
(a usage finding), not a cardinality finding: so a missing `R` field with
`cardinality.min = 1` yields exactly one finding, never two.

#### Example

```ts
import type { Cardinality } from "@cosyte/hl7";
const once: Cardinality = { min: 1, max: 1 };
const many: Cardinality = { min: 1, max: "*" };
```

#### Properties

##### max?

> `readonly` `optional` **max?**: `number` \| `"*"`

##### min?

> `readonly` `optional` **min?**: `number`

***

### CE

HL7 v2 Coded Element (CE): coded element per HL7 Chapter 2. All 6
components are optional. Fields are OMITTED when the underlying component
is absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. identifier (e.g. "GLU")
2. text (human-readable, e.g. "Glucose")
3. nameOfCodingSystem (e.g. "LN" for LOINC)
4. alternateIdentifier
5. alternateText
6. nameOfAlternateCodingSystem

Components 7+ (present when a CWE-shaped value is read through the CE
accessor: e.g. version ids, originalText) are surfaced verbatim on
`extraComponents` rather than dropped.

#### Example

```ts
import type { CE } from "@cosyte/hl7";
const code: CE = { identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" };
```

#### Properties

##### alternateIdentifier?

> `readonly` `optional` **alternateIdentifier?**: `string`

##### alternateText?

> `readonly` `optional` **alternateText?**: `string`

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components beyond the modeled 6 (HL7 component 7 onward), preserved
verbatim and in order. Non-empty only when a CWE-shaped value is read
through the CE accessor; OMITTED otherwise. An absent interior component
is preserved as `""` so `extraComponents[i]` maps to HL7 component
`7 + i`.

##### identifier?

> `readonly` `optional` **identifier?**: `string`

##### nameOfAlternateCodingSystem?

> `readonly` `optional` **nameOfAlternateCodingSystem?**: `string`

##### nameOfCodingSystem?

> `readonly` `optional` **nameOfCodingSystem?**: `string`

##### text?

> `readonly` `optional` **text?**: `string`

***

### Charge

FT1-derived charge entry (DFT financial breadth). Billing-critical
fields surfaced with **no billing logic and no money-as-float**: the
extended/unit amounts are the verbatim CP wire text, never parsed to a number.

#### Example

```ts
import type { Charge } from "@cosyte/hl7";
const c: Charge = {
  transactionType: "CG",
  transactionCode: { identifier: "80053", text: "Metabolic panel" },
  amountExtended: "150.00^USD",
  diagnoses: [{ identifier: "E11.9" }],
};
```

#### Properties

##### amountExtended?

> `readonly` `optional` **amountExtended?**: `string`

FT1-11 transaction amount, extended (CP): canonical wire text (e.g. `150.00^USD`, byte-exact for a plain amount); never parsed to a number.

##### amountUnit?

> `readonly` `optional` **amountUnit?**: `string`

FT1-12 transaction amount, unit (CP): canonical wire text; never parsed to a number.

##### diagnoses

> `readonly` **diagnoses**: readonly [`CWE`](#cwe-1)[]

FT1-19 diagnosis code(s) linked to this charge (CE, repeating): billing diagnosis linkage. Always present (possibly empty).

##### quantity?

> `readonly` `optional` **quantity?**: `number`

FT1-10 transaction quantity (NM; strict-parsed, never `NaN`).

##### transactionCode?

> `readonly` `optional` **transactionCode?**: [`CWE`](#cwe-1)

FT1-7 transaction code: the institution charge/procedure code (CWE, provenance-only, never validated).

##### transactionDate?

> `readonly` `optional` **transactionDate?**: [`DtmParts`](#dtmparts)

FT1-4 transaction date (fidelity `TS`).

##### transactionType?

> `readonly` `optional` **transactionType?**: `string`

FT1-6 transaction type (HL7 Table 0017: `CG` charge, `CD` credit, `PY` payment, `AJ` adjustment). Verbatim.

***

### CharsetResolution

The outcome of resolving an MSH-18 label (or `options.charset` override)
against Table 0211.

#### Properties

##### canonical

> `readonly` **canonical**: `string`

The canonical Table-0211 code the label resolved to (e.g. `"UTF-8"`,
`"8859/1"`, `"ISO IR87"`). For an unrecognized label this is the input
trimmed + upper-cased, so it is still a stable key for comparison.

##### decoder

> `readonly` **decoder**: `string`

The WHATWG `TextDecoder` label to decode with when `treatment === "decode"`.
Empty when `treatment === "verbatim"`.

##### recognized

> `readonly` **recognized**: `boolean`

`true` when the label is a recognized HL7 Table-0211 code (whether or not
the parser decodes it); `false` when the label is not in Table 0211.
Drives the warning code on the verbatim path: recognized-but-`verbatim`
→ `UNSUPPORTED_CHARSET`, unrecognized → `UNKNOWN_CHARSET`.

##### treatment

> `readonly` **treatment**: [`CharsetTreatment`](#charsettreatment)

Whether the parser decodes this set or preserves its bytes verbatim.

***

### ClinicalDocument

TXA-derived clinical-document entry (MDM document breadth). The
load-bearing safety property: **completion status (TXA-17) and availability
status (TXA-19) are DISTINCT fields and are never conflated**: a document can
be *available* before it is *authenticated*, and reading a preliminary
document as final is the clinical harm. Both are verbatim / provenance-only.

#### Example

```ts
import type { ClinicalDocument } from "@cosyte/hl7";
const doc: ClinicalDocument = {
  documentType: "DS",
  completionStatus: "IP", // in progress: NOT yet authenticated
  availabilityStatus: "AV", // available: a different axis
  observations: [],
};
```

#### Properties

##### activityDateTime?

> `readonly` `optional` **activityDateTime?**: [`DtmParts`](#dtmparts)

TXA-4 activity date/time (fidelity `TS`).

##### availabilityStatus?

> `readonly` `optional` **availabilityStatus?**: `string`

TXA-19 document **availability** status (HL7 Table 0273: `AV` available,
`CA` cancelled, `OB` obsolete, `UN` unavailable). Surfaced DISTINCT from
[completionStatus](#completionstatus); verbatim, never validated, never merged.

##### completionStatus?

> `readonly` `optional` **completionStatus?**: `string`

TXA-17 document **completion** status (HL7 Table 0271: e.g. `DO` documented,
`IP` in progress, `AU` authenticated, `LA` legally authenticated, `IN`
incomplete). Surfaced DISTINCT from [availabilityStatus](#availabilitystatus); verbatim,
never validated, never merged.

##### documentType?

> `readonly` `optional` **documentType?**: `string`

TXA-2 document type (HL7 Table 0270), verbatim.

##### observations

> `readonly` **observations**: readonly [`Observation`](#observation)[]

OBX narrative body grouped under this TXA. Always present (possibly empty).

##### parentDocumentNumber?

> `readonly` `optional` **parentDocumentNumber?**: `string`

TXA-13 parent document number (EI first component): addendum / replacement link.

##### uniqueDocumentNumber?

> `readonly` `optional` **uniqueDocumentNumber?**: `string`

TXA-12 unique document number (EI first component, verbatim).

***

### CNE

HL7 v2 Coded with No Exceptions (CNE): coded element per HL7 Chapter 2, used
where the value must come from a published table. All 22 components are
optional here; they are the CWE components under the same names.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. identifier
2. text
3. nameOfCodingSystem
4. alternateIdentifier
5. alternateText
6. nameOfAlternateCodingSystem
7. codingSystemVersionId
8. alternateCodingSystemVersionId
9. originalText

Added at v2.7:
10. secondAlternateIdentifier
11. secondAlternateText
12. nameOfSecondAlternateCodingSystem
13. secondAlternateCodingSystemVersionId
14. codingSystemOid
15. valueSetOid
16. valueSetVersionId (a DTM, kept as its raw text)
17. alternateCodingSystemOid
18. alternateValueSetOid
19. alternateValueSetVersionId
20. secondAlternateCodingSystemOid
21. secondAlternateValueSetOid
22. secondAlternateValueSetVersionId

#### Example

```ts
import type { CNE } from "@cosyte/hl7";
const code: CNE = { identifier: "Y", text: "Yes", nameOfCodingSystem: "HL70136" };
```

#### Properties

##### alternateCodingSystemOid?

> `readonly` `optional` **alternateCodingSystemOid?**: `string`

CNE.17 Alternate Coding System OID (v2.7 and later).

##### alternateCodingSystemVersionId?

> `readonly` `optional` **alternateCodingSystemVersionId?**: `string`

CNE.8 Alternate Coding System Version ID.

##### alternateIdentifier?

> `readonly` `optional` **alternateIdentifier?**: `string`

CNE.4 Alternate Identifier.

##### alternateText?

> `readonly` `optional` **alternateText?**: `string`

CNE.5 Alternate Text.

##### alternateValueSetOid?

> `readonly` `optional` **alternateValueSetOid?**: `string`

CNE.18 Alternate Value Set OID (v2.7 and later).

##### alternateValueSetVersionId?

> `readonly` `optional` **alternateValueSetVersionId?**: `string`

CNE.19 Alternate Value Set Version ID, raw DTM text (v2.7 and later).

##### codingSystemOid?

> `readonly` `optional` **codingSystemOid?**: `string`

CNE.14 Coding System OID (v2.7 and later).

##### codingSystemVersionId?

> `readonly` `optional` **codingSystemVersionId?**: `string`

CNE.7 Coding System Version ID.

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 22nd, preserved verbatim and in order. OMITTED when
there are none. An absent interior component is preserved as `""` so
`extraComponents[i]` maps to HL7 component `23 + i`.

##### identifier?

> `readonly` `optional` **identifier?**: `string`

CNE.1 Identifier.

##### nameOfAlternateCodingSystem?

> `readonly` `optional` **nameOfAlternateCodingSystem?**: `string`

CNE.6 Name of Alternate Coding System.

##### nameOfCodingSystem?

> `readonly` `optional` **nameOfCodingSystem?**: `string`

CNE.3 Name of Coding System.

##### nameOfSecondAlternateCodingSystem?

> `readonly` `optional` **nameOfSecondAlternateCodingSystem?**: `string`

CNE.12 Name of Second Alternate Coding System (v2.7 and later).

##### originalText?

> `readonly` `optional` **originalText?**: `string`

CNE.9 Original Text.

##### secondAlternateCodingSystemOid?

> `readonly` `optional` **secondAlternateCodingSystemOid?**: `string`

CNE.20 Second Alternate Coding System OID (v2.7 and later).

##### secondAlternateCodingSystemVersionId?

> `readonly` `optional` **secondAlternateCodingSystemVersionId?**: `string`

CNE.13 Second Alternate Coding System Version ID (v2.7 and later).

##### secondAlternateIdentifier?

> `readonly` `optional` **secondAlternateIdentifier?**: `string`

CNE.10 Second Alternate Identifier (v2.7 and later).

##### secondAlternateText?

> `readonly` `optional` **secondAlternateText?**: `string`

CNE.11 Second Alternate Text (v2.7 and later).

##### secondAlternateValueSetOid?

> `readonly` `optional` **secondAlternateValueSetOid?**: `string`

CNE.21 Second Alternate Value Set OID (v2.7 and later).

##### secondAlternateValueSetVersionId?

> `readonly` `optional` **secondAlternateValueSetVersionId?**: `string`

CNE.22 Second Alternate Value Set Version ID, raw DTM text (v2.7 and later).

##### text?

> `readonly` `optional` **text?**: `string`

CNE.2 Text.

##### valueSetOid?

> `readonly` `optional` **valueSetOid?**: `string`

CNE.15 Value Set OID (v2.7 and later).

##### valueSetVersionId?

> `readonly` `optional` **valueSetVersionId?**: `string`

CNE.16 Value Set Version ID, a DTM kept as its raw text (v2.7 and later).

***

### CodedSystemFields

Structural shape of any coded element that carries a primary + alternate
coding system: both [CWE](#cwe-1) and [CE](#ce) satisfy it. Kept structural
(not a union) so callers can pass a `dg.code` / `obs.code` directly.

#### Properties

##### nameOfAlternateCodingSystem?

> `readonly` `optional` **nameOfAlternateCodingSystem?**: `string`

##### nameOfCodingSystem?

> `readonly` `optional` **nameOfCodingSystem?**: `string`

***

### CodingSystemInfo

A coding-system provenance answer: the system a code CLAIMS, never
validated. `claimed` is always present and verbatim (never dropped); the
resolved `id` / `name` are present only when the claim maps to a registered
Table 0396 entry.

#### Properties

##### claimed

> `readonly` **claimed**: `string`

The coding-system id exactly as it appeared in CWE.3 / CE.3: preserved
verbatim (original case and spelling), never altered, never dropped.

##### id?

> `readonly` `optional` **id?**: `string`

Registered Table 0396 acronym (alias-normalized). Present only when `known`.

##### known

> `readonly` **known**: `boolean`

`true` when `claimed` resolved (directly or via alias) to a registered Table 0396 entry.

##### name?

> `readonly` `optional` **name?**: `string`

Canonical human-readable name. Present only when `known`.

***

### ComparisonPredicate

A comparison statement: does the content at `location` stand in the `verb`
relation to one of the `values`?

The value read at a location is the subcomponent at the coordinate, with an
omitted `component` and `subcomponent` both defaulting to `1` (a coded
element's code), exactly as a field rule's own `component` default does.
`values` must carry at least one entry: a comparison with no value list is
`PROFILE_MALFORMED`, and is a compile error where the author writes
TypeScript.

**A comparison against an element the message does not carry is
unevaluatable**, not false: there is no content to compare. It is reported as
[FINDING\_CODES.PROFILE\_CONDITION\_UNEVALUATABLE](#profile_condition_unevaluatable) rather than silently
deciding the conditional.

**The statement is quantified over repetitions and occurrences.** Where the
location names a repeating field, or a segment that occurs more than once, the
comparison reads one value per repetition per occurrence and is true when ONE
OR MORE of them stands in the verb's relation to the value list. That is the
language's default occurrence semantics, and it covers the negative verbs too:
`is not` is true when SOME value is not a listed one, not when every value is
not. So at a repeating location a verb and its negative can both decide true
against the same value list. [PredicateVerb](#predicateverb) works the case through.

#### Example

```ts
import type { ComparisonPredicate } from "@cosyte/hl7";
// "IF RXA-20 (Completion Status) contains one of the values in the list: {'CP', 'PA'}"
const predicate: ComparisonPredicate = {
  location: { segment: "RXA", field: 20 },
  verb: "contains",
  values: ["CP", "PA"],
};
```

#### Properties

##### location

> `readonly` **location**: [`PredicateLocation`](#predicatelocation)

The element whose content the statement compares.

##### values

> `readonly` **values**: readonly `string`[]

The value list, at least one entry. For `matches` / `does not match` each
entry is a regular-expression source; anything the platform cannot compile
is `PROFILE_MALFORMED`.

##### verb

> `readonly` **verb**: [`PredicateVerb`](#predicateverb)

The relation to test.

***

### ComponentRule

A rule for one **component position** inside a field, declared on a field
rule's [FieldRule.components](#components).

**A component's cardinality is IMPLIED by its usage and may not be
declared.** The HL7 conformance methodology (section 5.2, Cardinality) states
it outright: an explicit cardinality range is required for segment groups,
segments and field elements, while component and sub-component elements do
not explicitly include one, and the range implicitly associated with each
depends on its usage code: `[1..1]` for `R`, `[0..1]` for `RE` and `O`,
`[0..0]` for `X`. A component carries no repetition construct in HL7 v2, so
`[1..1]` reduces to "present with a value exactly once" and `[0..0]` to
"absent or empty": the observable is a presence finding, never a count
finding. Declaring a `cardinality` here is
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed), not a silently-honoured extra
constraint.

**Declaring component rules CLOSES the field's component set.** A field rule
that declares them says what that field's components are, so a present
repetition carrying a non-empty value at an index the rule does not declare
is [FINDING\_CODES.PROFILE\_UNDECLARED\_CONTENT](#profile_undeclared_content). A field rule that
declares NONE declares no depth and is checked exactly as it always was: the
undeclared-content check can never fire for it. "None" means no component
rule reaches the engine, so an EMPTY list says exactly what omitting the
member says; it is never read as a declaration that the field has no
components.

#### Example

```ts
import type { ComponentRule } from "@cosyte/hl7";
const identifier: ComponentRule = { component: 1, usage: "R" };
const checkDigit: ComponentRule = { component: 2, usage: "X" };
```

#### Properties

##### component

> `readonly` **component**: `number`

1-indexed component position within the field (e.g. `4` for `PID-3.4`).

##### name?

> `readonly` `optional` **name?**: `string`

Optional human label for the component (e.g. `"Assigning Authority"`).
Structural documentation for the profile author only: findings identify a
component by its PHI-free structural locus (segment + field + index), never
by this label, so the label is never echoed into a finding message.

##### severity?

> `readonly` `optional` **severity?**: [`FindingSeverity`](#findingseverity)

Severity for findings this component rule produces. Defaults to the
severity of the field rule that carries it (itself `"error"` by default),
so downgrading a field rule downgrades its components with it.

##### usage?

> `readonly` `optional` **usage?**: [`UsageCode`](#usagecode)

Usage constraint for this component, from the same vocabulary a field rule
declares (see [UsageCode](#usagecode)). Its cardinality follows from it and is
never declared beside it.

- **`R`**: a present repetition SHALL carry a non-empty value here.
  Absent ⇒ [FINDING\_CODES.PROFILE\_REQUIRED\_ABSENT](#profile_required_absent).
- **`X`**: a present repetition SHALL NOT carry a value here. Present ⇒
  [FINDING\_CODES.PROFILE\_NOT\_PERMITTED](#profile_not_permitted).
- **`RE`** / **`O`**: no presence constraint.
- **`C`** / **`CE`** / **`B`** / a declared conditional: presence is **not
  evaluated**, on exactly the terms an undecided conditional field rule
  gets. A component rule declares no condition predicate and no caller
  resolution can name one, so nothing ever decides it.

Omitted ⇒ Optional, and an omitted usage is never refused. The component
still counts as DECLARED for the undeclared-content check: declaring the
index is what closes the set, not constraining it.

***

### CompositeValueByKind

Maps each [CompositeKind](#compositekind) to the typed value [encodeComposite](#encodecomposite)
(and `setComposite`) accept for it. `TS` also accepts a pre-formatted HL7
timestamp string; `NM` also accepts a `number` or a raw numeric string,
both are emitted verbatim (the serializer never re-formats a claimed value).

#### Properties

##### CE

> `readonly` **CE**: [`CE`](#ce)

##### CNE

> `readonly` **CNE**: [`CNE`](#cne)

##### CP

> `readonly` **CP**: [`CP`](#cp-1)

##### CQ

> `readonly` **CQ**: [`CQ`](#cq-1)

##### CWE

> `readonly` **CWE**: [`CWE`](#cwe-1)

##### CX

> `readonly` **CX**: [`CX`](#cx-1)

##### DR

> `readonly` **DR**: [`DR`](#dr-1)

##### EI

> `readonly` **EI**: [`EI`](#ei-1)

##### EIP

> `readonly` **EIP**: [`EIP`](#eip-1)

##### FC

> `readonly` **FC**: [`FC`](#fc-1)

##### HD

> `readonly` **HD**: [`HD`](#hd-1)

##### MO

> `readonly` **MO**: [`MO`](#mo-1)

##### MSG

> `readonly` **MSG**: [`MSG`](#msg-1)

##### NM

> `readonly` **NM**: `string` \| `number` \| [`NM`](#nm-1)

##### PL

> `readonly` **PL**: [`PL`](#pl-1)

##### PT

> `readonly` **PT**: [`PT`](#pt-1)

##### TS

> `readonly` **TS**: `string` \| [`DtmParts`](#dtmparts)

##### VID

> `readonly` **VID**: [`VID`](#vid-1)

##### XAD

> `readonly` **XAD**: [`XAD`](#xad-1)

##### XCN

> `readonly` **XCN**: [`XCN`](#xcn-1)

##### XPN

> `readonly` **XPN**: [`XPN`](#xpn-1)

##### XTN

> `readonly` **XTN**: [`XTN`](#xtn-1)

***

### ConformanceFinding

One typed conformance finding. Carries the [FindingCode](#findingcode), a
[FindingSeverity](#findingseverity), the structural [FindingLocus](#findinglocus), and a
human-readable `message` describing the rule that fired.

**The `message` is PHI-safe by construction**: it names the locus, the rule,
and (for a value-set miss) the SIZE of the value set, but **never** the
offending field value.

#### Example

```ts
import type { ConformanceFinding } from "@cosyte/hl7";
const f: ConformanceFinding = {
  code: "PROFILE_VALUE_NOT_IN_SET",
  severity: "error",
  locus: { segment: "PID", field: 8, component: 1 },
  message: 'PID-8 component 1 value is not in the profile value set (3 permitted codes).',
};
```

#### Properties

##### code

> `readonly` **code**: [`FindingCode`](#findingcode)

##### locus

> `readonly` **locus**: [`FindingLocus`](#findinglocus)

##### message

> `readonly` **message**: `string`

##### severity

> `readonly` **severity**: [`FindingSeverity`](#findingseverity)

***

### ConformanceProfile

A **user-authored, declarative** conformance profile. The
consumer supplies this; hl7 ships none. It is a bounded subset of the HL7 v2
Message-Profile model: usage / condition predicate / cardinality / length /
consumer-supplied value set: with **no** bundled code set and **no** network
binding (both deliberate scope boundaries). A condition predicate reads the
message in front of it and nothing else.

#### Example

```ts
import type { ConformanceProfile } from "@cosyte/hl7";

// A minimal ADT profile the CONSUMER authors: example, NOT an attestation.
const profile: ConformanceProfile = {
  name: "example-adt-min",
  segments: [
    { segment: "MSH", usage: "R", fields: [{ field: 10, name: "Control ID", usage: "R" }] },
    { segment: "PID", usage: "R", cardinality: { min: 1, max: 1 }, fields: [
      { field: 3, name: "Patient Identifiers", usage: "R", cardinality: { min: 1, max: 1 } },
      { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
    ] },
    { segment: "ZZZ", usage: "X" },
  ],
};
```

#### Properties

##### level?

> `readonly` `optional` **level?**: [`ProfileLevel`](#profilelevel)

The [ProfileLevel](#profilelevel) this profile CLAIMS, echoed into
[ConformanceResult.level](#level-1).

**Omitting it claims `constrainable`**, the weaker of the two claims a
working profile can make, so a profile that says nothing never reads as an
implementable one. Declaring `standard` or `constrainable` imposes no
level-derived constraint on any element: both levels are defined as leaving
optionality in place, so there is nothing for the engine to check.

**Declaring `implementable` is a claim the engine CHECKS**, because the
level asserts that all optionality and openness have been removed. Every
segment, field and component rule must declare a usage, and that usage must
be `R`, `RE` or `X`, or a declared conditional both of whose outcomes are
drawn from those three. A rule left at `C`, `CE`, `O` or `B`, a conditional
whose outcomes are not, and a rule that declares no usage at all each refuse
the claim as [FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed) rather than being
accepted on the author's word.

The level changes NO message check: it alters which findings can fire for a
given message not at all. It is a declaration plus its gate.

##### name

> `readonly` **name**: `string`

A name for provenance: echoed into [ConformanceResult.profileName](#profilename-1).

##### segments

> `readonly` **segments**: readonly [`SegmentRule`](#segmentrule)[]

The segment rules, evaluated in array order (stable finding order).

***

### ConformanceResult

The result of [validateAgainstProfile](#validateagainstprofile): the profile's `name`, the
[ProfileLevel](#profilelevel) in force, and the ordered list of `findings`.

**`findings.length === 0` is NOT a conformance attestation.** It means every
rule the profile declared was satisfied: nothing about the parts of the
message the profile did not cover, and nothing about clinical correctness.
Read it as "no declared rule was violated," never as "conformant." That holds
at every level, `implementable` included: the level says the profile removed
its own optionality, not that anyone accredited the result.

**What the level DOES tell you** is how to read an empty findings list. At
`implementable` level every element the profile declares was reduced to a
supported / not-supported decision, so the assessment against that profile is
complete. At `standard` or `constrainable` level it is not: elements the
profile left optional were never asserted either way, so an empty list is
consistent with parts of the message having gone unassessed.

#### Properties

##### findings

> `readonly` **findings**: readonly [`ConformanceFinding`](#conformancefinding)[]

##### level

> `readonly` **level**: [`ProfileLevel`](#profilelevel)

The [ProfileLevel](#profilelevel) the assessment was actually made at.

Present on EVERY result, including one for a profile so malformed its name
could not be read. A profile that declares no level is assessed and echoed
as `constrainable`; a profile whose declaration is not one of the three
levels is echoed the same way, alongside the
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed) finding that names it.

**A REFUSED `implementable` claim is never echoed here.** Where the engine
returned `PROFILE_MALFORMED` findings it did not complete the assessment
the claim asserts, so the level in force falls back to `constrainable`
rather than repeating a claim nothing verified.

##### profileName

> `readonly` **profileName**: `string`

***

### ConnectedPredicate

Two statements joined by a connector. Nests: either side may itself be a
connected predicate.

A connected predicate is unevaluatable exactly when its result DEPENDS on an
unevaluatable operand. So `AND` is false as soon as one side is false however
unevaluatable the other is, `OR` is true as soon as one side is true, and
`XOR` needs both sides.

#### Example

```ts
import type { ConnectedPredicate } from "@cosyte/hl7";
// "IF RXA-9.1 contains '00' AND RXA-20 contains one of the values in the list: {'CP','PA'}"
const predicate: ConnectedPredicate = {
  connector: "AND",
  left: { location: { segment: "RXA", field: 9, component: 1 }, verb: "contains", values: ["00"] },
  right: { location: { segment: "RXA", field: 20 }, verb: "contains", values: ["CP", "PA"] },
};
```

#### Properties

##### connector

> `readonly` **connector**: [`PredicateConnector`](#predicateconnector)

Which connector joins the two operands.

##### left

> `readonly` **left**: [`ConditionPredicate`](#conditionpredicate)

The left-hand operand.

##### right

> `readonly` **right**: [`ConditionPredicate`](#conditionpredicate)

The right-hand operand.

***

### CP

HL7 v2 Composite Price (CP): a price, optionally for a range of quantities,
per HL7 Chapter 2. All 6 components are optional. Amounts and range bounds
stay the text the sender wrote, never a JavaScript `number`.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. price (nested MO: quantity and denomination are subcomponents)
2. priceType (HL7 Table 0205, e.g. "UP" unit price)
3. fromValue (an NM, kept as its text)
4. toValue (an NM, kept as its text)
5. rangeUnits (nested coded element: a CE at v2.5, a CWE from v2.6; read as
   a CWE, whose first six parts are the CE's)
6. rangeType (HL7 Table 0298, P pro-rate or F flat-rate)

Used by FT1-11 and FT1-12 (transaction amounts) and PRC-5 (price).

#### Example

```ts
import type { CP } from "@cosyte/hl7";
const amount: CP = { price: { quantity: "150.00", denomination: "USD" }, priceType: "UP" };
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 6th, preserved verbatim (first subcomponent of each)
and in order. OMITTED when there are none.

##### fromValue?

> `readonly` `optional` **fromValue?**: `string`

CP.3 From Value, as written.

##### price?

> `readonly` `optional` **price?**: [`MO`](#mo-1)

CP.1 Price (nested MO).

##### priceType?

> `readonly` `optional` **priceType?**: `string`

CP.2 Price Type.

##### rangeType?

> `readonly` `optional` **rangeType?**: `string`

CP.6 Range Type.

##### rangeUnits?

> `readonly` `optional` **rangeUnits?**: [`CWE`](#cwe-1)

CP.5 Range Units (nested coded element).

##### toValue?

> `readonly` `optional` **toValue?**: `string`

CP.4 To Value, as written.

***

### CQ

HL7 v2 Composite Quantity with Units (CQ): a quantity and its unit, per HL7
Chapter 2. Both components are optional. The quantity stays the text the
sender wrote, never a JavaScript `number`.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. quantity (an NM, kept as its text, e.g. "2")
2. units (nested coded element: a CE at v2.5, a CWE from v2.6; read as a
   CWE, whose first six parts are the CE's)

Used by TQ1-2 (quantity) and other quantity-with-unit fields.

#### Example

```ts
import type { CQ } from "@cosyte/hl7";
const dose: CQ = { quantity: "2", units: { identifier: "TAB", text: "tablet" } };
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 2nd, preserved verbatim (first subcomponent of each)
and in order. OMITTED when there are none.

##### quantity?

> `readonly` `optional` **quantity?**: `string`

CQ.1 Quantity, as written.

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

CQ.2 Units (nested coded element).

***

### CustomSegmentDefinition

Shape of a single segment field-name declaration used by profile authoring
(`defineProfile()`). `fields` maps a caller-visible field NAME to its
1-indexed HL7 position within the segment. Declared here (alongside
`Profile`) to keep the parser's type module the single source of truth;
`src/profiles/define.ts` re-exports this type, so consumers can write
`import type { CustomSegmentDefinition } from "@cosyte/hl7"`.

It is the value shape of BOTH declaration maps, and which map a declaration
sits in is what decides where the name may be used: `customSegments` names
fields on a custom Z-segment, `segmentOverrides` names fields on a standard
HL7 v2 segment. The shape is identical because the meaning of a position is:
a 1-indexed HL7 field position, read exactly as `Segment.field(n)` reads it.

#### Example

```ts
import type { CustomSegmentDefinition } from "@cosyte/hl7";
const zdp: CustomSegmentDefinition = {
  fields: { departmentCode: 3, departmentName: 4 },
};
```

#### Properties

##### fields

> `readonly` **fields**: `Readonly`\<`Record`\<`string`, `number`\>\>

***

### CWE

HL7 v2 Coded with Exceptions (CWE): coded element per HL7 Chapter 2. All 22
components are optional. Fields are OMITTED when the underlying component is
absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. identifier (e.g. "GLU")
2. text (human-readable, e.g. "Glucose")
3. nameOfCodingSystem (e.g. "LN" for LOINC, "SCT" for SNOMED CT)
4. alternateIdentifier
5. alternateText
6. nameOfAlternateCodingSystem
7. codingSystemVersionId
8. alternateCodingSystemVersionId
9. originalText

Added at v2.7:
10. secondAlternateIdentifier
11. secondAlternateText
12. nameOfSecondAlternateCodingSystem
13. secondAlternateCodingSystemVersionId
14. codingSystemOid
15. valueSetOid
16. valueSetVersionId (a DTM, kept as its raw text)
17. alternateCodingSystemOid
18. alternateValueSetOid
19. alternateValueSetVersionId
20. secondAlternateCodingSystemOid
21. secondAlternateValueSetOid
22. secondAlternateValueSetVersionId

Components 10 onward are also surfaced verbatim, in order, on
`extraComponents`.

#### Example

```ts
import type { CWE } from "@cosyte/hl7";
const code: CWE = { identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" };
```

#### Properties

##### alternateCodingSystemOid?

> `readonly` `optional` **alternateCodingSystemOid?**: `string`

CWE.17 Alternate Coding System OID (v2.7 and later).

##### alternateCodingSystemVersionId?

> `readonly` `optional` **alternateCodingSystemVersionId?**: `string`

CWE.8 Alternate Coding System Version ID.

##### alternateIdentifier?

> `readonly` `optional` **alternateIdentifier?**: `string`

CWE.4 Alternate Identifier.

##### alternateText?

> `readonly` `optional` **alternateText?**: `string`

CWE.5 Alternate Text.

##### alternateValueSetOid?

> `readonly` `optional` **alternateValueSetOid?**: `string`

CWE.18 Alternate Value Set OID (v2.7 and later).

##### alternateValueSetVersionId?

> `readonly` `optional` **alternateValueSetVersionId?**: `string`

CWE.19 Alternate Value Set Version ID, raw DTM text (v2.7 and later).

##### codingSystemOid?

> `readonly` `optional` **codingSystemOid?**: `string`

CWE.14 Coding System OID (v2.7 and later).

##### codingSystemVersionId?

> `readonly` `optional` **codingSystemVersionId?**: `string`

CWE.7 Coding System Version ID.

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Every component from the 10th onward (HL7 component 10 on), preserved
verbatim and in order, as it was before components 10 to 22 had names.
OMITTED when the element has no components past the 9th. An absent interior
component is preserved as `""` so `extraComponents[i]` maps to HL7
component `10 + i`. Components 10 to 22 are also on the named fields above;
this array is the only place a component past the 22nd appears.

##### identifier?

> `readonly` `optional` **identifier?**: `string`

CWE.1 Identifier.

##### nameOfAlternateCodingSystem?

> `readonly` `optional` **nameOfAlternateCodingSystem?**: `string`

CWE.6 Name of Alternate Coding System.

##### nameOfCodingSystem?

> `readonly` `optional` **nameOfCodingSystem?**: `string`

CWE.3 Name of Coding System.

##### nameOfSecondAlternateCodingSystem?

> `readonly` `optional` **nameOfSecondAlternateCodingSystem?**: `string`

CWE.12 Name of Second Alternate Coding System (v2.7 and later).

##### originalText?

> `readonly` `optional` **originalText?**: `string`

CWE.9 Original Text.

##### secondAlternateCodingSystemOid?

> `readonly` `optional` **secondAlternateCodingSystemOid?**: `string`

CWE.20 Second Alternate Coding System OID (v2.7 and later).

##### secondAlternateCodingSystemVersionId?

> `readonly` `optional` **secondAlternateCodingSystemVersionId?**: `string`

CWE.13 Second Alternate Coding System Version ID (v2.7 and later).

##### secondAlternateIdentifier?

> `readonly` `optional` **secondAlternateIdentifier?**: `string`

CWE.10 Second Alternate Identifier (v2.7 and later).

##### secondAlternateText?

> `readonly` `optional` **secondAlternateText?**: `string`

CWE.11 Second Alternate Text (v2.7 and later).

##### secondAlternateValueSetOid?

> `readonly` `optional` **secondAlternateValueSetOid?**: `string`

CWE.21 Second Alternate Value Set OID (v2.7 and later).

##### secondAlternateValueSetVersionId?

> `readonly` `optional` **secondAlternateValueSetVersionId?**: `string`

CWE.22 Second Alternate Value Set Version ID, raw DTM text (v2.7 and later).

##### text?

> `readonly` `optional` **text?**: `string`

CWE.2 Text.

##### valueSetOid?

> `readonly` `optional` **valueSetOid?**: `string`

CWE.15 Value Set OID (v2.7 and later).

##### valueSetVersionId?

> `readonly` `optional` **valueSetVersionId?**: `string`

CWE.16 Value Set Version ID, a DTM kept as its raw text (v2.7 and later).

***

### CX

HL7 v2 Extended Composite ID (CX): structured identifier per HL7 Chapter
2. All 10 components are optional. Fields are OMITTED when the underlying
component is absent (exactOptionalPropertyTypes). `assigningAuthority`
uses the nested `HD` shape; `assigningFacility` is flattened to a plain
string in v1.

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. idNumber
2. checkDigit
3. checkDigitScheme (ISO 7064, M10, M11, NPI)
4. assigningAuthority (nested HD: 3 subcomponents form a HD composite)
5. identifierTypeCode (MR, SSN, DL, MC, ...)
6. assigningFacility (v1: flattened to string; spec is HD-shaped)
7. effectiveDate (raw HL7 TS string)
8. expirationDate (raw HL7 TS string)
9. assigningJurisdiction (v1: flattened to string)
10. assigningAgencyOrDepartment (v1: flattened to string)

#### Example

```ts
import type { CX } from "@cosyte/hl7";
const mrn: CX = {
  idNumber: "123456",
  assigningAuthority: { namespaceId: "EPIC", universalId: "1.2.840.114350", universalIdType: "ISO" },
  identifierTypeCode: "MR",
};
```

#### Properties

##### assigningAgencyOrDepartment?

> `readonly` `optional` **assigningAgencyOrDepartment?**: `string`

##### assigningAuthority?

> `readonly` `optional` **assigningAuthority?**: [`HD`](#hd-1)

##### assigningFacility?

> `readonly` `optional` **assigningFacility?**: `string`

##### assigningJurisdiction?

> `readonly` `optional` **assigningJurisdiction?**: `string`

##### checkDigit?

> `readonly` `optional` **checkDigit?**: `string`

##### checkDigitScheme?

> `readonly` `optional` **checkDigitScheme?**: `string`

##### effectiveDate?

> `readonly` `optional` **effectiveDate?**: `string`

##### expirationDate?

> `readonly` `optional` **expirationDate?**: `string`

##### identifierTypeCode?

> `readonly` `optional` **identifierTypeCode?**: `string`

##### idNumber?

> `readonly` `optional` **idNumber?**: `string`

***

### DateParts

The calendar components a datetime actually STATED, as a frozen plain
object. A component the value did not state is ABSENT: the key is not
present at all rather than present with `undefined`, so `Object.keys()` is
exactly the set of stated components and the value's precision is
recoverable from it. There is no `raw`, `valid` or `precision` key here:
that fidelity metadata stays on [DtmParts](#dtmparts).

`month` is SPEC-NATIVE 1 to 12, never the JS `Date` 0 to 11. Delete
`offsetMinutes` and what is left is accepted as-is by
`Temporal.PlainDateTime.from` and luxon's `DateTime.fromObject`, with no key
rename and no value adjustment. That compatibility is the reason for the
shape; neither library is a dependency here, and neither needs to be.

#### Example

```ts
import { parseDtm, toObject } from "@cosyte/hl7";

toObject(parseDtm("19880705"));
// { year: 1988, month: 7, day: 5 }: three keys, no zero-fill

Object.keys(toObject(parseDtm("1970")) ?? {});
// ["year"]: a year-precision value states one component
```

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

Day of month, 1 to 31.

##### hour?

> `readonly` `optional` **hour?**: `number`

Hour, 0 to 23.

##### millisecond?

> `readonly` `optional` **millisecond?**: `number`

Milliseconds, derived from the stated fractional second by taking its
first three digits VERBATIM and right-padding with zeroes (`"5"` is 500,
`"0500"` is 50, `"123456"` is 123). Never computed by multiplying a
floating-point fraction by 1000, which loses the last digit on values such
as 0.123. Absent when the value stated no fraction.

##### minute?

> `readonly` `optional` **minute?**: `number`

Minute, 0 to 59.

##### month?

> `readonly` `optional` **month?**: `number`

Month, 1 to 12 (spec-native, NOT the JS `Date` 0 to 11).

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes east of UTC, present IF AND ONLY IF the value carried an
explicit offset. A stated zero offset (including HL7's `-0000`) is present
as `0`. Never synthesised from the host machine's zone.

##### second?

> `readonly` `optional` **second?**: `number`

Second, 0 to 59.

##### year?

> `readonly` `optional` **year?**: `number`

Four-digit year, exactly as stated. A year below 100 stays below 100.

***

### DefinedProfile

The profile [defineProfile](#defineprofile) produces for one options object: every
member of the general [Profile](#profile-2) interface, with `customSegments` at the
declarations that options object actually carries (its own, merged with every
parent's).

It stays assignable to [Profile](#profile-2) with no cast, so a profile built by
the factory still passes to every API that accepts the general interface, and
a caller who annotates a variable with `Profile` simply gives the narrowing
up rather than hitting a type error.

#### Example

```ts
import { defineProfile, type Profile } from "@cosyte/hl7";
const epic = defineProfile({
  name: "epic",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
const asGeneral: Profile = epic; // no cast: the narrowing is additive
console.log(asGeneral.name); // "epic"
```

#### Extends

- `Omit`\<[`Profile`](#profile-2), `"customSegments"`\>

#### Type Parameters

##### O

`O`

#### Properties

##### customSegments

> `readonly` **customSegments**: `DeclaredSegments`\<`O`\>

The merged declarations, at the literal segment types and field names.

##### dateFormats?

> `readonly` `optional` **dateFormats?**: readonly `string`[]

Date formats this vendor writes. Merged after `ParseOptions.dateFormats`
and honoured on every datetime the library returns, exactly as the option
form is.

###### Inherited from

[`Profile`](#profile-2).[`dateFormats`](#dateformats-6)

##### describe?

> `readonly` `optional` **describe?**: () => `string`

###### Returns

`string`

###### Inherited from

[`Profile`](#profile-2).[`describe`](#describe-1)

##### description?

> `readonly` `optional` **description?**: `string`

###### Inherited from

[`Profile`](#profile-2).[`description`](#description-3)

##### lineage?

> `readonly` `optional` **lineage?**: readonly `string`[]

###### Inherited from

[`Profile`](#profile-2).[`lineage`](#lineage-1)

##### name

> `readonly` **name**: `string`

###### Inherited from

[`Profile`](#profile-2).[`name`](#name-16)

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

###### Inherited from

[`Profile`](#profile-2).[`onWarning`](#onwarning-3)

##### segmentOverrides?

> `readonly` `optional` **segmentOverrides?**: `Readonly`\<`Record`\<`string`, [`CustomSegmentDefinition`](#customsegmentdefinition)\>\>

Site-specific field NAMES bound to positions on STANDARD HL7 v2 segments,
keyed by canonical segment name (`PID`, `AL1`, `MSH`, ...). A separate map
from [Profile.customSegments](#customsegments-2), which stays Z-segment-only: a
standard name appearing there would change which segments the parser
treats as profile-claimed, and an author skimming a profile literal can
see at a glance which declarations touch standard clinical fields.

Read-side aliases, and ADDITIVE ONLY. A declaration here creates a new
name for `Segment.get(name)` to resolve on segments of that type, and
changes no existing read: positional access, dot-paths, the typed clinical
accessors, the warning list and both serializations are what they were
without it.

###### Inherited from

[`Profile`](#profile-2).[`segmentOverrides`](#segmentoverrides-2)

***

### DefineProfileOptions

Options accepted by `defineProfile()`. Mirrors the locked
`Profile` shape plus the `extends` input key. Every field except
`name` is optional.

#### Example

```ts
import { defineProfile, type DefineProfileOptions } from "@cosyte/hl7";
const opts: DefineProfileOptions = {
  name: "my-lab",
  dateFormats: ["MM/DD/YYYY"],
  customSegments: { ZLB: { fields: { noteText: 3 } } },
};
const profile = defineProfile(opts);
```

#### Properties

##### customSegments?

> `readonly` `optional` **customSegments?**: `Readonly`\<`Record`\<`string`, [`CustomSegmentDefinition`](#customsegmentdefinition)\>\>

##### dateFormats?

> `readonly` `optional` **dateFormats?**: readonly `string`[]

##### description?

> `readonly` `optional` **description?**: `string`

##### extends?

> `readonly` `optional` **extends?**: [`Profile`](#profile-2) \| readonly [`Profile`](#profile-2)[]

##### name

> `readonly` **name**: `string`

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

##### segmentOverrides?

> `readonly` `optional` **segmentOverrides?**: `Readonly`\<`Record`\<`string`, [`CustomSegmentDefinition`](#customsegmentdefinition)\>\>

Field names bound to positions on STANDARD HL7 v2 segments, keyed by
canonical segment name. Sibling of `customSegments`, never a relaxation of
it: a Z-segment key here is refused and pointed back at `customSegments`,
and a key that is not a standard segment name is refused outright.

Every binding is a NEW read. Declaring one changes nothing an existing
caller sees; see [Profile.segmentOverrides](#segmentoverrides-2).

***

### DftAmount

A transaction amount (CP, composite price) for [buildDft](#builddft), supplied as
its typed parts. Every part is emitted **verbatim**: the price keeps the
precision the caller wrote, and the denomination is never inferred.

#### Example

```ts
import type { DftAmount } from "@cosyte/hl7";
const amount: DftAmount = { price: "150.00", denomination: "USD" };
```

#### Properties

##### denomination?

> `readonly` `optional` **denomination?**: `string`

CP.1.2 Price denomination, e.g. `"USD"` (ISO 4217). Never inferred.

##### price?

> `readonly` `optional` **price?**: `string`

CP.1.1 Price quantity, e.g. `"150.00"`. Emitted verbatim, never a float.

##### priceType?

> `readonly` `optional` **priceType?**: `string`

CP.2 Price type (HL7 Table 0205, e.g. `"AP"` administrative price).

***

### DftCharge

Typed FT1 (financial transaction) content for [buildDft](#builddft).

#### Example

```ts
import type { DftCharge } from "@cosyte/hl7";
const charge: DftCharge = {
  setId: "1",
  transactionDate: "20260801",
  transactionType: "CG",
  transactionCode: { identifier: "80053", text: "Metabolic panel" },
  quantity: "1",
  amountExtended: { price: "150.00", denomination: "USD" },
  diagnoses: [{ identifier: "E11.9" }],
};
```

#### Properties

##### amountExtended?

> `readonly` `optional` **amountExtended?**: [`DftAmount`](#dftamount)

FT1-11 Transaction Amount, Extended.

##### amountUnit?

> `readonly` `optional` **amountUnit?**: [`DftAmount`](#dftamount)

FT1-12 Transaction Amount, Unit.

##### diagnoses?

> `readonly` `optional` **diagnoses?**: [`CWE`](#cwe-1) \| readonly [`CWE`](#cwe-1)[]

FT1-19 Diagnosis Code(s): the billing diagnosis linkage, repeating.

##### postingDate?

> `readonly` `optional` **postingDate?**: `string` \| [`DtmParts`](#dtmparts)

FT1-5 Transaction Posting Date.

##### quantity?

> `readonly` `optional` **quantity?**: `string` \| `number` \| [`NM`](#nm-1)

FT1-10 Transaction Quantity (emitted verbatim: the caller owns its precision).

##### setId?

> `readonly` `optional` **setId?**: `string`

FT1-1 Set ID.

##### transactionCode?

> `readonly` `optional` **transactionCode?**: [`CWE`](#cwe-1)

FT1-7 Transaction Code: the institution charge or procedure code.

##### transactionDate?

> `readonly` `optional` **transactionDate?**: `string` \| [`DtmParts`](#dtmparts)

FT1-4 Transaction Date.

##### transactionId?

> `readonly` `optional` **transactionId?**: `string`

FT1-2 Transaction ID.

##### transactionType?

> `readonly` `optional` **transactionType?**: `string`

FT1-6 Transaction Type (HL7 Table 0017: `CG`, `CD`, `PY`, `AJ`).

***

### Diagnosis

DG1-derived diagnosis entry. `dateTime` is the fidelity `TS`.

#### Example

```ts
import type { Diagnosis } from "@cosyte/hl7";
const dg: Diagnosis = {
  code: { identifier: "E11.9", text: "Type 2 diabetes" },
  description: "Type 2 diabetes mellitus without complications",
  type: "F",
};
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CWE`](#cwe-1)

DG1-3 diagnosis code.

##### dateTime?

> `readonly` `optional` **dateTime?**: [`DtmParts`](#dtmparts)

DG1-5 diagnosis date/time as the fidelity `TS`.

##### description?

> `readonly` `optional` **description?**: `string`

DG1-4 diagnosis description.

##### type?

> `readonly` `optional` **type?**: `string`

DG1-6 diagnosis type (A=admitting, W=working, F=final).

***

### DotPath

Parsed representation of a dot-path string. Produced by `parsePath`,
consumed by `resolvePath`. All numeric indices are normalized to the
internal convention (segmentIndex = 0-based occurrence, fieldIndex =
1-based HL7 field number, repetitionIndex = 0-based rep, componentIndex
and subcomponentIndex = 1-based HL7 positions).

#### Example

```ts
import { parsePath } from "@cosyte/hl7";
parsePath("OBX[2].5.1");
// { segmentType: "OBX", segmentIndex: 2, fieldIndex: 5,
//   repetitionIndex: 0, componentIndex: 1 }
```

#### Properties

##### componentIndex?

> `readonly` `optional` **componentIndex?**: `number`

1-based HL7 component position (within a repetition).

##### fieldIndex

> `readonly` **fieldIndex**: `number`

1-based HL7 field number; maps to `RawSegment.fields[fieldIndex]`.

##### repetitionIndex?

> `readonly` `optional` **repetitionIndex?**: `number`

0-based repetition index; defaults to 0 when `[N]` is omitted.

##### segmentIndex

> `readonly` **segmentIndex**: `number`

0-based occurrence of this segment type in the message.

##### segmentType

> `readonly` **segmentType**: `string`

3-char segment identifier (e.g. `"PID"`, `"OBX"`, `"ZPI"`).

##### subcomponentIndex?

> `readonly` `optional` **subcomponentIndex?**: `number`

1-based HL7 subcomponent position (within a component).

***

### DR

HL7 v2 Date/Time Range (DR): per HL7 Chapter 2. Both components are
optional, and each is kept as the raw datetime text the sender wrote: read it
with the same care as any HL7 datetime (`parseDtm` keeps its precision and
timezone). A range with only a start is open-ended.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. rangeStartDateTime (a TS at v2.5, a DTM from v2.6; the time itself)
2. rangeEndDateTime

At v2.5 each endpoint is a TS whose second part (degree of precision) is a
subcomponent; that part was deprecated at v2.5 and is not read.

#### Example

```ts
import type { DR } from "@cosyte/hl7";
const range: DR = { rangeStartDateTime: "20260101", rangeEndDateTime: "20261231" };
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 2nd, preserved verbatim and in order. OMITTED when
there are none.

##### rangeEndDateTime?

> `readonly` `optional` **rangeEndDateTime?**: `string`

DR.2 Range End Date/Time, raw datetime text.

##### rangeStartDateTime?

> `readonly` `optional` **rangeStartDateTime?**: `string`

DR.1 Range Start Date/Time, raw datetime text.

***

### DtmAmbiguity

Report attached to a timestamp the parser REFUSED to resolve because the
value is order-ambiguous: a slash-separated numeric date whose first two
components are both in 1-12, so a month-first and a day-first reading are
each a legal calendar date and no evidence chooses between them.

The parser reports the two readings rather than picking one, because picking
one produces a plausible, wrong calendar date and nothing downstream can tell
that it was invented. Supply the vendor's order through
`parseHL7(raw, { dateFormats: ["DD/MM/YYYY"] })` or a profile's
`dateFormats`, which are both tried ahead of the built-ins, and the value
resolves with no report at all.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const ts = parseHL7(raw).meta.timestamp;      // MSH-7 was "05/07/1988"
console.log(ts?.valid);                        // false: nothing was resolved
console.log(ts?.ambiguity?.raw);               // "05/07/1988"
console.log(ts?.ambiguity?.candidates[0]);     // MM/DD/YYYY -> 1988-05-07
console.log(ts?.ambiguity?.candidates[1]);     // DD/MM/YYYY -> 1988-07-05
```

#### Properties

##### candidates

> `readonly` **candidates**: readonly \[[`DtmAmbiguityCandidate`](#dtmambiguitycandidate), [`DtmAmbiguityCandidate`](#dtmambiguitycandidate)\]

Both readings, month-first then day-first. Exactly two, and they always
disagree: a value whose readings coincide is resolved, not refused.

##### code

> `readonly` **code**: `"AMBIGUOUS_DATE_ORDER"`

Always [AMBIGUOUS\_DATE\_ORDER](#ambiguous_date_order): the stable identifier to compare on.

##### message

> `readonly` **message**: `string`

A one-line explanation naming the value, both readings, and the remedy.

##### raw

> `readonly` **raw**: `string`

The value exactly as it arrived, so the report names what was declined.

***

### DtmAmbiguityCandidate

One of the two calendar dates an order-ambiguous slash value could denote:
the format that would produce it, its spec-native `month` (1-12) and `day`,
and the ISO `YYYY-MM-DD` rendering of the date part. Declaring `format`
through `parseHL7(raw, { dateFormats: [...] })` or a profile is what makes
the parser return that reading.

#### Example

```ts
import type { DtmAmbiguityCandidate } from "@cosyte/hl7";
const dayFirst: DtmAmbiguityCandidate = {
  format: "DD/MM/YYYY", month: 7, day: 5, isoDate: "1988-07-05",
};
```

#### Properties

##### day

> `readonly` **day**: `number`

Day of month under this reading, 1-31.

##### format

> `readonly` **format**: `string`

The date format that yields this reading, e.g. `"DD/MM/YYYY"`.

##### isoDate

> `readonly` **isoDate**: `string`

The date part of this reading as ISO `YYYY-MM-DD`, e.g. `"1988-07-05"`.

##### month

> `readonly` **month**: `number`

Month under this reading, 1-12 (spec-native, NOT JS 0-11).

***

### DtmParts

Parsed HL7 v2 TS/DTM value: the raw string plus its structural parts, with
the stated **precision** and **timezone fidelity** preserved. This is the
shape of the `TS` composite (`field.asTs()`) and every helper datetime.

The parts are only populated when `valid` is `true`. `month`/`day`/… are
**spec-native** (`month` is 1 to 12, NOT the JS `Date` 0 to 11). `offsetMinutes`
is present iff `hasTimezone` is `true` and is signed minutes east of UTC
(`+0500` → `300`, `-0430` → `-270`). A missing offset is **flagged**
(`hasTimezone: false`), never resolved to UTC: the consumer decides how to
localize with [dtmToDate](#dtmtodate).

#### Example

```ts
import type { DtmParts } from "@cosyte/hl7";
const dob: DtmParts = {
  raw: "19880705", valid: true, precision: "day",
  year: 1988, month: 7, day: 5, hasTimezone: false,
};
```

#### Properties

##### ambiguity?

> `readonly` `optional` **ambiguity?**: [`DtmAmbiguity`](#dtmambiguity)

Why an order-ambiguous slash date was refused, naming the raw value and
both readings it could have had. Present ONLY when `valid` is `false`
because the field order could not be established; absent on every other
result, including a plain malformed one. See [DtmAmbiguity](#dtmambiguity).

##### day?

> `readonly` `optional` **day?**: `number`

Day of month, 1 to 31.

##### fractionalSeconds?

> `readonly` `optional` **fractionalSeconds?**: `string`

Fractional-second digits exactly as populated (no leading dot), e.g.
`"5"` (0.5 s), `"0500"` (0.05 s). Preserved verbatim: never rounded.

##### hasTimezone

> `readonly` **hasTimezone**: `boolean`

`true` iff an explicit `+/-ZZZZ` offset was present.

##### hour?

> `readonly` `optional` **hour?**: `number`

Hour, 0 to 23.

##### matchedFormat?

> `readonly` `optional` **matchedFormat?**: `string`

The non-canonical format that matched, e.g. `"MM/DD/YYYY"`: normally one
the caller declared in `dateFormats`, or `"ISO-8601"` and the other
[BUILTIN\_DATE\_FALLBACKS](#builtin_date_fallbacks) entries, which only `msg.meta.timestamp`
can reach. Absent for a strict HL7 DTM parse.

##### minute?

> `readonly` `optional` **minute?**: `number`

Minute, 0 to 59.

##### month?

> `readonly` `optional` **month?**: `number`

Month, 1 to 12 (spec-native, NOT JS 0 to 11).

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes east of UTC; present iff `hasTimezone` is `true`.

##### precision?

> `readonly` `optional` **precision?**: [`DtmPrecision`](#dtmprecision)

Stated precision; absent when `valid` is `false`.

##### raw

> `readonly` **raw**: `string`

The original HL7 string, exactly as it appeared (already unescaped).

##### second?

> `readonly` `optional` **second?**: `number`

Second, 0 to 59.

##### valid

> `readonly` **valid**: `boolean`

`true` when `raw` is a well-formed, in-range HL7 DTM (or a matched
fallback format). `false` for empty, malformed, calendar-out-of-range, or
order-ambiguous input: in which case only `raw`, `hasTimezone: false` and
(for the ambiguous case) [DtmParts.ambiguity](#ambiguity) are meaningful.

##### year?

> `readonly` `optional` **year?**: `number`

Four-digit year.

***

### DtmToDateOptions

Options controlling how [dtmToDate](#dtmtodate) resolves a missing timezone.

#### Example

```ts
import { parseDtm, dtmToDate } from "@cosyte/hl7";
// Treat an offset-less value as UTC (an explicit caller choice):
dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 });
// ...or as US Eastern standard time (UTC-05:00):
dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: -300 });
```

#### Properties

##### assumeOffsetMinutes?

> `readonly` `optional` **assumeOffsetMinutes?**: `number`

Offset (signed minutes east of UTC) to assume when the value carries **no**
timezone. Without it, an offset-less value resolves to `undefined`,
[dtmToDate](#dtmtodate) never guesses a zone. Ignored when the value already has
an offset. Pass `0` to explicitly treat a naive value as UTC.

***

### EI

HL7 v2 Entity Identifier (EI): per HL7 Chapter 2. All 4 components are
optional. Fields are OMITTED when the underlying component is absent.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. entityIdentifier: the identifier itself (e.g. a placer order number).
2. namespaceId: the assigning authority's local name.
3. universalId: the assigning authority's universal id (an OID, a UUID).
4. universalIdType: what kind of id `universalId` is (ISO, UUID, DNS, ...).

Components 2 to 4 are the assigning authority, the same three parts as an
`HD`. Used by MSH-21 (message profile identifier), OBR-2 and OBR-3, ORC-2 and
ORC-3 (placer and filler order numbers), among many others.

#### Example

```ts
import type { EI } from "@cosyte/hl7";
const order: EI = { entityIdentifier: "PL-1001", namespaceId: "CLINIC", universalId: "2.16.840.1.113883.19.5", universalIdType: "ISO" };
```

#### Properties

##### entityIdentifier?

> `readonly` `optional` **entityIdentifier?**: `string`

EI.1 Entity Identifier.

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 4th, preserved verbatim and in order. OMITTED when
there are none. `extraComponents[i]` maps to HL7 component `5 + i`.

##### namespaceId?

> `readonly` `optional` **namespaceId?**: `string`

EI.2 Namespace ID.

##### universalId?

> `readonly` `optional` **universalId?**: `string`

EI.3 Universal ID.

##### universalIdType?

> `readonly` `optional` **universalIdType?**: `string`

EI.4 Universal ID Type.

***

### EIP

HL7 v2 Entity Identifier Pair (EIP): the placer's and the filler's
identifier for the same thing, per HL7 Chapter 2. Both components are
optional nested EIs.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. placerAssignedIdentifier (nested EI: its 4 parts are subcomponents)
2. fillerAssignedIdentifier (nested EI)

Used by ORC-8 (parent order), OBR-29 (parent), SPM-2 (specimen identifier)
and others.

#### Example

```ts
import type { EIP } from "@cosyte/hl7";
const parent: EIP = {
  placerAssignedIdentifier: { entityIdentifier: "PL-1001", namespaceId: "CLINIC" },
  fillerAssignedIdentifier: { entityIdentifier: "FL-2002", namespaceId: "LAB" },
};
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 2nd, preserved verbatim (first subcomponent of each)
and in order. OMITTED when there are none.

##### fillerAssignedIdentifier?

> `readonly` `optional` **fillerAssignedIdentifier?**: [`EI`](#ei-1)

EIP.2 Filler Assigned Identifier (EI).

##### placerAssignedIdentifier?

> `readonly` `optional` **placerAssignedIdentifier?**: [`EI`](#ei-1)

EIP.1 Placer Assigned Identifier (EI).

***

### EncodingCharacters

The HL7 delimiter characters discovered from MSH-1 (field separator) and
MSH-2 (encoding characters). The first four: component, repetition,
escape, subcomponent: are mandatory across all HL7 v2 versions. The fifth,
`truncation`, is the v2.7+ truncation character (default `#` per spec
§2.5.5.2): only present when MSH-2 actually carries 5 encoding characters,
so messages that pre-date v2.7 round-trip with a 4-char MSH-2 unchanged.

#### Example

```ts
import type { EncodingCharacters } from "@cosyte/hl7";
const v25: EncodingCharacters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};
const v27: EncodingCharacters = { ...v25, truncation: "#" };
```

#### Properties

##### component

> `readonly` **component**: `string`

##### escape

> `readonly` **escape**: `string`

##### field

> `readonly` **field**: `string`

##### repetition

> `readonly` **repetition**: `string`

##### subcomponent

> `readonly` **subcomponent**: `string`

##### truncation?

> `readonly` `optional` **truncation?**: `string`

***

### ExpectedSegmentGroup

One expected segment for a recognized message type.

The published structure definition gives `requiredSegment` a minimum of one
along the whole path from the structure root, in every variant of the
referenced structure's family, so a structurally conformant message always
carries it. `name` and `anchorSegments` carry the same segment: they are the
long-standing shape of this type and a group is now exactly one required
segment, because the derivation works segment by segment rather than by
hand-picked bundle.

#### Properties

##### anchorSegments

> `readonly` **anchorSegments**: readonly `string`[]

The segment name(s) whose presence satisfies this expectation.

##### name

> `readonly` **name**: `string`

The expectation's label, which is the required segment's name.

##### requiredSegment

> `readonly` **requiredSegment**: `string`

The segment the published structure gives a minimum of one.

***

### FC

HL7 v2 Financial Class (FC): per HL7 Chapter 2. Both components are
optional.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. financialClassCode (User Table 0064). An IS (a bare code) up to v2.6 and a
   CWE from v2.7; read as a nested coded element either way, so a v2.5 code
   arrives as `financialClassCode.identifier` and a v2.7 one keeps its text
   and coding system.
2. effectiveDate (a TS at v2.5, a DTM from v2.6), the raw datetime text.

Used by PV1-20.

#### Example

```ts
import type { FC } from "@cosyte/hl7";
const financialClass: FC = { financialClassCode: { identifier: "SP" }, effectiveDate: "20260101" };
```

#### Properties

##### effectiveDate?

> `readonly` `optional` **effectiveDate?**: `string`

FC.2 Effective Date, raw datetime text.

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 2nd, preserved verbatim (first subcomponent of each)
and in order. OMITTED when there are none.

##### financialClassCode?

> `readonly` `optional` **financialClassCode?**: [`CWE`](#cwe-1)

FC.1 Financial Class Code (nested coded element).

***

### FieldRule

A rule for one **field position** within a segment. Every
constraint is optional; a rule with only a `field` index is a no-op.

#### Remarks

`field` is the 1-indexed HL7 position (MSH offset handled internally, exactly
like `Segment.field(n)`: `{ field: 9 }` on `MSH` targets MSH-9). Length and
value-set checks read the value at `component` (default **1**), so a coded
field's code (`CWE.1` / `CE.1`) is checked by default; set `component` to
check a different component. Both are applied **per present repetition**.

#### Properties

##### cardinality?

> `readonly` `optional` **cardinality?**: [`Cardinality`](#cardinality)

Repetition-count constraint for this field.

##### codingSystem?

> `readonly` `optional` **codingSystem?**: `string`

Bind [valueSet](#valueset) to the coding system its codes must be drawn from: a
coding-system identifier this library recognizes, or any alias it
recognizes for one. Declaring it turns "the code must be one of these"
into "and it must
be drawn from THIS system", so a feed sending a plausible code labelled
with the wrong system stops validating clean.

The message's own coding-system component is compared by RESOLVED
IDENTITY, not by string equality: a feed sending `loinc`, `LOINC` or `LN`
all match a binding of `LN`, because each resolves to the same registered
acronym. A repetition whose coding-system component resolves to anything
else, including nothing at all, is
[FINDING\_CODES.PROFILE\_CODING\_SYSTEM\_MISMATCH](#profile_coding_system_mismatch).

**Opt-in and independent.** Omitting it leaves a `valueSet` rule behaving
exactly as it always has. Declaring it adds a SECOND check rather than
changing the first: a permitted code carried under the wrong system yields
one coding-system finding and no value-set finding, and a code that is
wrong on both counts yields exactly one of each.

**Recognition is this library's own frozen subset, not the whole
registry.** An identifier it does not recognize is refused when the profile
is defined ([FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed)), rather than silently
compared against a system that cannot be resolved: so a local or
site-specific system cannot be bound, and a consumer with one keeps the
bare `valueSet`. A binding declared without a `valueSet` is refused the
same way: there is nothing there for it to bind.

**This checks the sender's CLAIM, never the code.** Nothing here verifies
that the code exists in the system the message names: hl7 still ships no
code set and makes no network call.

##### codingSystemComponent?

> `readonly` `optional` **codingSystemComponent?**: `number`

1-indexed component carrying the coding-system identifier that a declared
[FieldRule.codingSystem](#codingsystem) is compared against.

Defaults to **two positions after [component](#component-2)**, which is the coded
element's own code-to-system relationship: a code at component 1 puts its
system at component 3, and an alternate code at component 4 puts its
alternate system at component 6. So a rule checking the primary triplet
needs neither key, and a rule checking the alternate triplet sets
`component` alone.

Set it explicitly for a field whose layout does not follow that offset.
Checking BOTH triplets from one rule is not supported: declare two rules on
the same field.

##### component?

> `readonly` `optional` **component?**: `number`

1-indexed component whose value the `length` / `valueSet` checks read.
Defaults to `1` (the first component: a coded element's code).

**Not to be confused with [FieldRule.components](#components)** (plural), which
declares per-component RULES and closes the field's component set. This one
(singular) only says which component the length / value-set checks read;
declaring it neither declares a component rule nor closes anything.

##### components?

> `readonly` `optional` **components?**: readonly [`ComponentRule`](#componentrule)[]

Per-component rules for this field: what its components ARE and what each
one's usage is. Applied **per present repetition**.

**Declaring them closes the field's component set**, which is what makes
[FINDING\_CODES.PROFILE\_UNDECLARED\_CONTENT](#profile_undeclared_content) decidable: a present
repetition carrying a non-empty value at an index no rule here declares is
content the profile never specified, and the HL7 conformance methodology
counts that as a conformance violation rather than harmless extra content
(its own worked example is data in a fourth component where the profile
defines three).

**Omitting them changes nothing, and an empty list is omitting them.** A
field rule that declares no component rules declares no depth: it is
checked exactly as it always has been, and the undeclared-content check can
never fire for it. `components: []` carries no component rule, so it says
precisely that and is never read as "this field has no components" (which
would make every component of every repetition undeclared content). This is
additive and opt-in, per field rule.

Each component's cardinality is IMPLIED by its usage and may not be
declared: see [ComponentRule](#componentrule).

##### condition?

> `readonly` `optional` **condition?**: [`ConditionPredicate`](#conditionpredicate)

The [ConditionPredicate](#conditionpredicate) that decides this rule's usage, evaluated
against the message. Only a rule whose `usage` is conditional (`C`, `CE`,
or a declared conditional) may declare one.

##### field

> `readonly` **field**: `number`

1-indexed HL7 field position (e.g. `3` for PID-3, `9` for MSH-9).

##### length?

> `readonly` `optional` **length?**: `number`

Maximum character length of the checked component value (inclusive).

##### name?

> `readonly` `optional` **name?**: `string`

Optional human label for the field (e.g. `"Patient Identifier List"`).
Structural documentation for the profile author only: findings identify a
field by its PHI-free structural locus (segment + index), never by this
label, so the label is never echoed into a finding message.

##### severity?

> `readonly` `optional` **severity?**: [`FindingSeverity`](#findingseverity)

Severity for findings this rule produces. Defaults to `"error"`. A profile
author can downgrade a data-quality rule (e.g. a length or value-set check)
to `"warning"` or `"info"` without changing the check itself.

##### usage?

> `readonly` `optional` **usage?**: [`UsageCode`](#usagecode)

Usage constraint: a simple code, or a declared conditional such as
`C(RE/X)` (see [UsageCode](#usagecode)). Omitted ⇒ Optional, and an omitted
usage is never refused.

##### valueSet?

> `readonly` `optional` **valueSet?**: readonly `string`[]

Consumer-supplied permitted-value list. The checked component value must be
a member (case-sensitive exact match). **hl7 ships no code set**: this is
BYO terminology; membership is a literal string check, never a LOINC /
SNOMED / ICD / RxNorm lookup and never a network call.

***

### FindingLocus

The **structural** locus a finding refers to: segment name plus, where
applicable, the field position, component, repetition, and segment
occurrence. Every member is a name or an index: a locus is **inherently
PHI-free** and never carries a field value.

A finding with no [field](#field-4) is **segment-level** (presence / cardinality
of the segment itself); a finding with a `field` is **field-level**. For a
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed) diagnostic (a defect in the profile,
not the message) `segment` may be the sentinel `"(profile)"`.

#### Properties

##### component?

> `readonly` `optional` **component?**: `number`

1-indexed component, when a component-scoped check fired: length,
value-set, a component rule's own usage, or undeclared content.

##### field?

> `readonly` `optional` **field?**: `number`

1-indexed field position, when the finding is field-level.

##### occurrence?

> `readonly` `optional` **occurrence?**: `number`

0-indexed segment occurrence, when the segment type repeats.

##### repetition?

> `readonly` `optional` **repetition?**: `number`

0-indexed field repetition, when the finding is repetition-scoped.

##### segment

> `readonly` **segment**: `string`

Segment name (e.g. `"PID"`), or `"(profile)"` for a profile-shape defect.

***

### HD

HL7 v2 Hierarchic Designator (HD): per HL7 Chapter 2 data type. All 3
components are optional. Fields are OMITTED when the underlying component
is absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. namespaceId: application- or facility-scoped identifier (e.g. "EPIC").
2. universalId: globally-unique id (e.g. an OID or UUID string).
3. universalIdType: classifier for `universalId` (ISO, GUID, UUID, DNS,
   URI, HL7, HCD, Random, etc.).

#### Example

```ts
import type { HD } from "@cosyte/hl7";
const authority: HD = { namespaceId: "EPIC", universalId: "1.2.840.114350", universalIdType: "ISO" };
```

#### Properties

##### namespaceId?

> `readonly` `optional` **namespaceId?**: `string`

##### universalId?

> `readonly` `optional` **universalId?**: `string`

##### universalIdType?

> `readonly` `optional` **universalIdType?**: `string`

***

### Hl7ParseWarning

Data shape for every Tier-2 warning emitted by the parser. Warnings are
plain data (distinct from `Hl7ParseError`, which is a thrown `Error`
subclass) so they can be safely accumulated into
`Hl7Message.warnings` and passed to `onWarning` callbacks.

#### Example

```ts
import type { Hl7ParseWarning } from "@cosyte/hl7";
const w: Hl7ParseWarning = {
  code: "UNKNOWN_SEGMENT",
  message: "Unknown segment: ZZZ",
  position: { segmentIndex: 4 },
};
```

#### Properties

##### code

> `readonly` **code**: [`WarningCode`](#warningcode)

##### message

> `readonly` **message**: `string`

##### position

> `readonly` **position**: [`Hl7Position`](#hl7position)

***

### Hl7Position

Positional context attached to every warning and fatal error.
`segmentIndex` counts segments from 0, so a parsed message's MSH segment is
0. The other fields are 1-indexed against the HL7 spec convention:
`fieldIndex: 3` on MSH is MSH-3 and `repetitionIndex: 1` is the first
repetition (see `RawSegment.fields` for the index 0 slot convention). All
fields past `segmentIndex` are optional: for a top-level fatal like
`EMPTY_INPUT` only `segmentIndex: 0` is populated; for a tokenizer warning
deep inside a subcomponent all five indices may be set.

#### Remarks

With `exactOptionalPropertyTypes: true`, do not pass `fieldIndex: undefined`
explicitly: omit the key instead.

#### Example

```ts
import type { Hl7Position } from "@cosyte/hl7";
const pos: Hl7Position = { segmentIndex: 2, fieldIndex: 5 };
```

#### Properties

##### componentIndex?

> `readonly` `optional` **componentIndex?**: `number`

##### fieldIndex?

> `readonly` `optional` **fieldIndex?**: `number`

##### repetitionIndex?

> `readonly` `optional` **repetitionIndex?**: `number`

##### segmentIndex

> `readonly` **segmentIndex**: `number`

##### subcomponentIndex?

> `readonly` `optional` **subcomponentIndex?**: `number`

***

### IdentityEvent

One recognized patient-identity event. For `merge` / `move` / `change` kinds
the `surviving` (PID/PV1-sourced) and `prior` (MRG-sourced) parties are also
exposed directly, with the spec-constant `direction: "MRG_TO_PID"`: the
prior identifiers are the ones being retired in favour of the surviving
ones, never the reverse (HL7 v2 Ch. 3, A18/A39/A40).

`parties` is the complete role-labelled surface in document order: nothing
present in the message is dropped, including a nonconforming MRG in a
link/add message (surfaced as a `prior`-role party).

`warnings` carries the event's own fail-safe warnings (currently
`MERGE_MISSING_PRIOR_OR_SURVIVOR`); they are scoped to the event and are
NOT appended to `Hl7Message.warnings` (a read-side helper never mutates
the message).

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
for (const ev of parseHL7(raw).identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving) {
    // retire ev.prior.identifiers in favour of ev.surviving.identifiers
  } else if (ev.warnings.length > 0) {
    // incomplete pair: do NOT apply; route for review
  }
}
```

#### Properties

##### direction?

> `readonly` `optional` **direction?**: `"MRG_TO_PID"`

Spec-constant direction: the MRG (prior) identifiers are retired INTO the
PID (surviving) identifiers. Present on `merge` / `move` / `change` events
only; never inferred from content.

##### eventType

> `readonly` **eventType**: `string`

Trigger event code (MSH-9.2, falling back to EVN-1), e.g. `"A40"`.

##### kind

> `readonly` **kind**: [`IdentityEventKind`](#identityeventkind-1)

Classification of the trigger event.

##### parties

> `readonly` **parties**: readonly [`IdentityParty`](#identityparty)[]

Every party in document order, role-labelled: the complete surface.

##### prior?

> `readonly` `optional` **prior?**: [`IdentityParty`](#identityparty)

The prior (non-surviving) party (merge/move/change): ONLY ever sourced
from MRG.

##### surviving?

> `readonly` `optional` **surviving?**: [`IdentityParty`](#identityparty)

The surviving party (merge/move/change): ONLY ever sourced from PID/PV1.

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

Event-scoped fail-safe warnings (never PHI-bearing).

***

### IdentityParty

One party (one patient identity) in an identity event, labelled by role
with its source segment recorded as provenance. Absent fields are OMITTED
(exactOptionalPropertyTypes). All arrays and the object itself are frozen.

Field sources by `sourceSegment`:
- `"PID"`: `identifiers` = PID-3 repetitions, `legacyPatientId` = PID-2
  (pre-v2.7 only), `accountNumber` = PID-18, `visitNumber` = PV1-19 (from
  the group's PV1, when present), `name` = PID-5 (first repetition).
- `"MRG"`: `identifiers` = MRG-1 repetitions, `legacyPatientId` = MRG-4
  (pre-v2.7 only), `accountNumber` = MRG-3, `visitNumber` = MRG-5,
  `name` = MRG-7 (first repetition).

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const ev = parseHL7(raw).identityEvents()[0];
if (ev?.prior) {
  console.log(ev.prior.role);          // "prior"
  console.log(ev.prior.sourceSegment); // "MRG"
  for (const cx of ev.prior.identifiers) console.log(cx.idNumber);
}
```

#### Properties

##### accountNumber?

> `readonly` `optional` **accountNumber?**: [`CX`](#cx-1)

Patient account number (PID-18 / MRG-3).

##### identifiers

> `readonly` **identifiers**: readonly [`CX`](#cx-1)[]

Identifier list (PID-3 / MRG-1), every non-empty CX repetition.

##### legacyPatientId?

> `readonly` `optional` **legacyPatientId?**: [`CX`](#cx-1)

Legacy single patient ID (PID-2 / MRG-4). Backward-compat only; withdrawn
as of HL7 v2.7: OMITTED (not read) when MSH-12 declares v2.7 or later.

##### name?

> `readonly` `optional` **name?**: [`XPN`](#xpn-1)

Patient name (PID-5 / MRG-7, first repetition).

##### role

> `readonly` **role**: [`IdentityRole`](#identityrole)

Role of this party in the event: the safety-critical label.

##### sourceSegment

> `readonly` **sourceSegment**: `"PID"` \| `"MRG"`

Segment this party was sourced from: provenance for the role label.

##### visitNumber?

> `readonly` `optional` **visitNumber?**: [`CX`](#cx-1)

Visit number (PV1-19 for a PID party / MRG-5 for a prior party).

***

### Immunization

A vaccine dose extracted from one RXA (Pharmacy/Treatment Administration)
segment of a VXU^V04 immunization message, with its RXR
(route/site) and OBX (e.g. VFC eligibility / funding source) children grouped
positionally under the RXA, and `orderControl` from the preceding ORC of the
VXU order group (`ORC`→`RXA`→`[RXR]`→`[{OBX}]`).

**Safety contract.** A wrong vaccine, dose, or mis-keyed action code can harm
a patient or corrupt an IIS (Immunization Information System) registry, so
this view is deliberately conservative:
- `vaccineCode` carries its own coding-system provenance via the CWE
  (`vaccineCode.nameOfCodingSystem`: `CVX` HL7 Table 0292; live IIS feeds
  frequently *dual-code* RXA-5 with an alternate CVX/NDC in CWE.4-6, surfaced
  as `vaccineCode.alternateIdentifier`/`alternateText`/`nameOfAlternateCodingSystem`).
  The helper reports the *claim*; it never validates or looks the code up.
- `actionCode` (RXA-21, `A`/`D`/`U`) is surfaced **verbatim** and never
  defaulted: mis-keying it corrupts a registry's add/delete/update dedup.
- `doseAmount` is strict-`Number()` parsed; the IIS "unknown dose" sentinel
  `999` is surfaced **as the number `999`**, never specially coerced.
- `recordOrigin` (administered vs historical) is derived only from the
  well-known NIP001 RXA-9.1 codes and OMITTED otherwise: see
  [ImmunizationRecordOrigin](#immunizationrecordorigin-1).
- `administrationStatus` tells a dose given (`"completed"`) apart from a
  refused or not-administered record, a CVX `998` "no vaccine administered"
  placeholder and a delete request, and is `"undetermined"` rather than a
  guess: see [ImmunizationAdministrationStatus](#immunizationadministrationstatus-1). Every record is still
  returned, whatever it classifies as.
- Malformed RXA segments never throw: absent fields are omitted keys.

`routes`, `observations` and `administrationStatus` are ALWAYS present
(`routes` and `observations` possibly empty). Deferred (not v1): IIS-specific
state profile constraints; CVX/MVX validity checks; the 2nd+ repetition of the
repeating RXA-15/16/17 lot/expiry/manufacturer fields (only the first
repetition is surfaced).

#### Example

```ts
import type { Immunization } from "@cosyte/hl7";
const imm: Immunization = {
  vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
  doseAmount: 0.5,
  doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
  doseUnitsAreUcum: true,
  recordOrigin: "administered",
  manufacturer: { identifier: "PMC", text: "Sanofi Pasteur", nameOfCodingSystem: "MVX" },
  completionStatus: "CP",
  actionCode: "A",
  administrationStatus: {
    classification: "completed",
    completionStatus: "CP",
    actionCode: "A",
    decidedBy: {
      field: "RXA-20",
      table: { name: "HL7 Table 0322", version: "3.0.0" },
      map: {
        url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status",
        version: "1.0.0",
      },
    },
  },
  routes: [{ route: { identifier: "IM", text: "Intramuscular" } }],
  observations: [],
};
```

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

RXA-21 action code (`A`=add, `D`=delete, `U`=update): preserved verbatim, NEVER defaulted.

##### administeredDateTime?

> `readonly` `optional` **administeredDateTime?**: [`DtmParts`](#dtmparts)

RXA-3 date/time start of administration as the fidelity `TS`.

##### administrationStatus

> `readonly` **administrationStatus**: [`ImmunizationAdministrationStatus`](#immunizationadministrationstatus-1)

The record's administration status, derived from this RXA's own RXA-5,
RXA-20 and RXA-21, with the raw RXA-20 and RXA-21 codes beside it and the
field and table, map or code set that decided it. Always present:
`"undetermined"` when nothing classifies it. See
[ImmunizationAdministrationStatus](#immunizationadministrationstatus-1).

##### completionStatus?

> `readonly` `optional` **completionStatus?**: `string`

RXA-20 completion status (`CP`=complete, `RE`=refused, `NA`=not administered, `PA`=partially administered).

##### doseAmount?

> `readonly` `optional` **doseAmount?**: `number`

RXA-6 administered dose amount (strict-parsed; never `NaN`). `999` = IIS "unknown", surfaced as-is.

##### doseUnits?

> `readonly` `optional` **doseUnits?**: [`CWE`](#cwe-1)

RXA-7 administered dose units (UCUM).

##### doseUnitsAreUcum?

> `readonly` `optional` **doseUnitsAreUcum?**: `boolean`

`true` iff RXA-7's coding system (CWE.3) is exactly `UCUM` (HL7 Table 0396)
: i.e. the dose unit is declared UCUM and safe to interpret as computable.
`false` means a unit IS present but is NOT declared UCUM (surfaced as-is,
never coerced). OMITTED when RXA-7 is absent. A *claim* check only: UCUM
grammar is not validated here.

##### expirationDate?

> `readonly` `optional` **expirationDate?**: [`DtmParts`](#dtmparts)

RXA-16 substance expiration date (first repetition) as the fidelity `TS`.

##### informationSource?

> `readonly` `optional` **informationSource?**: [`CWE`](#cwe-1)

RXA-9 immunization information source (HL7 Table NIP001), preserved verbatim.

##### lotNumber?

> `readonly` `optional` **lotNumber?**: `string`

RXA-15 substance lot number (first repetition).

##### manufacturer?

> `readonly` `optional` **manufacturer?**: [`CWE`](#cwe-1)

RXA-17 substance manufacturer (MVX, HL7 Table 0227; first repetition).

##### observations

> `readonly` **observations**: readonly [`Observation`](#observation)[]

OBX children grouped under this RXA (VFC eligibility, funding source, …). Always present (possibly empty).

##### orderControl?

> `readonly` `optional` **orderControl?**: `string`

ORC-1 order control when an ORC precedes this RXA in the VXU order group.

##### recordOrigin?

> `readonly` `optional` **recordOrigin?**: [`ImmunizationRecordOrigin`](#immunizationrecordorigin-1)

Derived administered-vs-historical classification from RXA-9.1. See [ImmunizationRecordOrigin](#immunizationrecordorigin-1).

##### refusalReason?

> `readonly` `optional` **refusalReason?**: [`CWE`](#cwe-1)

RXA-18 substance/treatment refusal reason (first repetition).

##### routes

> `readonly` **routes**: readonly [`MedicationRoute`](#medicationroute)[]

RXR children grouped under this RXA (Table 0162 route / Table 0163 site). Always present (possibly empty).

##### vaccineCode?

> `readonly` `optional` **vaccineCode?**: [`CWE`](#cwe-1)

RXA-5 administered vaccine code (CVX, HL7 Table 0292) with provenance + any alternate coding.

***

### ImmunizationAdministrationStatus

An immunization record's administration status, derived from that RXA's own
RXA-5, RXA-20 and RXA-21: carried as `administrationStatus` on every
[Immunization](#immunization). It tells a dose given apart from a refused or
not-administered record, a CVX `998` "no vaccine administered" placeholder,
and a request to delete an administration sent earlier.

**Which rule decides.** Exactly one rule decides, the first that applies:
1. RXA-21 exactly `D`: `"delete-requested"`.
2. RXA-21 present but not exactly one of `A`, `D`, `U`, `X` (HL7 Table
   0323): `"undetermined"`. RXA-21 `A`, `U`, `X` or empty change nothing.
3. RXA-5 carries CVX `998` in a triplet whose coding system resolves to
   `CVX` (or, in the primary triplet, that names no coding system):
   `"no-vaccine-administered"`, or `"undetermined"` when the other triplet
   carries a different, non-empty identifier.
4. RXA-20 by HL7's Table 0322 to Event Status map: `CP` and `PA`
   `"completed"`, `RE` and `NA` `"not-done"`, anything else `"undetermined"`.

**Safety contract.** `"completed"` only when RXA-20 is exactly `CP` or `PA`,
RXA-21 is empty or exactly `A`, `U` or `X`, and RXA-5 carries no CVX `998`.
Each RXA classifies from its own fields alone: nothing is carried across
segments. A status is reported, never applied: a `"delete-requested"`
record is still returned, is never matched against an earlier message, and
removes nothing. The object is plain data, not a FHIR element.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
const given = msg
  .immunizations()
  .filter((imm) => imm.administrationStatus.classification === "completed");
for (const imm of msg.immunizations()) {
  const { classification, completionStatus, actionCode, decidedBy } = imm.administrationStatus;
  if (classification === "undetermined") {
    console.log("not classifiable:", decidedBy.field, completionStatus, actionCode);
  }
}
```

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

The raw RXA-21 code, byte-identical to the `actionCode` of the same
immunization: the field's first value, decoded. OMITTED exactly when
`actionCode` is (the field is absent, empty or `""`).

##### classification

> `readonly` **classification**: [`ImmunizationStatusClass`](#immunizationstatusclass)

The classification the deciding rule gives the record.

##### completionStatus?

> `readonly` `optional` **completionStatus?**: `string`

The raw RXA-20 code, byte-identical to the `completionStatus` of the same
immunization: the field's first value, decoded. OMITTED exactly when
`completionStatus` is (the field is absent, empty or `""`).

##### decidedBy

> `readonly` **decidedBy**: [`ImmunizationStatusBasis`](#immunizationstatusbasis)

The field that decided, and the table, map or code set it was read against.

***

### ImmunizationStatusCodeSet

The code set an RXA-5 classification read: the CDC's CVX (Vaccines
Administered) code set, and the one code of it this library reads, `998`
"no vaccine administered". The CVX code set carries no version number of its
own; `version` is the date the CDC last updated the `998` entry, so a later
change to that entry shows up here as a changed `version`.

#### Example

```ts
import type { ImmunizationStatusCodeSet } from "@cosyte/hl7";
const codeSet: ImmunizationStatusCodeSet = {
  name: "CDC CVX",
  code: "998",
  version: "2023-03-09",
};
```

#### Properties

##### code

> `readonly` **code**: `"998"`

The CVX code read: `998`, "no vaccine administered".

##### name

> `readonly` **name**: `"CDC CVX"`

The code set: the CDC's CVX (Vaccines Administered) codes.

##### version

> `readonly` **version**: `"2023-03-09"`

The date the CDC last updated the `998` entry, as `YYYY-MM-DD`.

***

### ImmunizationStatusMap

The published HL7 v2-to-FHIR map an RXA-20 classification followed, by
canonical URL and version. The map comes from the HL7 Version 2 to FHIR
Implementation Guide (STU 1, standards status Informative); a later map
revision shows up here as a changed `version`.

#### Example

```ts
import type { ImmunizationStatusMap } from "@cosyte/hl7";
const map: ImmunizationStatusMap = {
  url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status",
  version: "1.0.0",
};
```

#### Properties

##### url

> `readonly` **url**: `"http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status"`

Canonical URL of the ConceptMap whose rows the classification follows.

##### version

> `readonly` **version**: `"1.0.0"`

The ConceptMap version the classification follows.

***

### ImmunizationStatusTable

The HL7 v2 code table an [ImmunizationAdministrationStatus](#immunizationadministrationstatus-1) read:
Table 0322 (Completion Status, RXA-20) or Table 0323 (Action Code, RXA-21),
each at the code-system version its codes were taken from.

#### Example

```ts
import type { ImmunizationStatusTable } from "@cosyte/hl7";
const table: ImmunizationStatusTable = { name: "HL7 Table 0322", version: "3.0.0" };
```

#### Properties

##### name

> `readonly` **name**: `"HL7 Table 0322"` \| `"HL7 Table 0323"`

`"HL7 Table 0322"` for RXA-20, `"HL7 Table 0323"` for RXA-21.

##### version

> `readonly` **version**: `"3.0.0"`

The code-system version the table's codes were taken from.

***

### Insurance

IN1-derived insurance entry with positional IN2/IN3 presence
flags. `hasIn2` / `hasIn3` are ALWAYS present booleans;
callers who need the full IN2/IN3 surface can walk `msg.segments("IN2")`.

#### Example

```ts
import type { Insurance } from "@cosyte/hl7";
const ins: Insurance = {
  planId: { identifier: "PLAN1", text: "Aetna PPO" },
  policyNumber: "POL123",
  groupNumber: "GRP1",
  hasIn2: false,
  hasIn3: false,
};
```

#### Properties

##### companyId?

> `readonly` `optional` **companyId?**: [`CX`](#cx-1)

IN1-3 insurance company id.

##### companyName?

> `readonly` `optional` **companyName?**: `string`

IN1-4 insurance company name (first repetition, first component).

##### effectiveDate?

> `readonly` `optional` **effectiveDate?**: [`DtmParts`](#dtmparts)

IN1-12 plan effective date as the fidelity `TS`.

##### expirationDate?

> `readonly` `optional` **expirationDate?**: [`DtmParts`](#dtmparts)

IN1-13 plan expiration date as the fidelity `TS`.

##### groupNumber?

> `readonly` `optional` **groupNumber?**: `string`

IN1-8 group number.

##### hasIn2

> `readonly` **hasIn2**: `boolean`

`true` iff an IN2 segment follows this IN1 before the next IN1.

##### hasIn3

> `readonly` **hasIn3**: `boolean`

`true` iff an IN3 segment follows this IN1 before the next IN1.

##### insuredName?

> `readonly` `optional` **insuredName?**: [`XPN`](#xpn-1)

IN1-16 insured's name.

##### planId?

> `readonly` `optional` **planId?**: [`CWE`](#cwe-1)

IN1-2 insurance plan id.

##### policyNumber?

> `readonly` `optional` **policyNumber?**: `string`

IN1-36 policy number.

***

### JsonSchemaDocument

The emitted JSON Schema document: the root node of the projection, plus the
reusable definitions its members reference.

#### Example

```ts
import { messageJsonSchema, type JsonSchemaDocument } from "@cosyte/hl7";
const doc: JsonSchemaDocument = messageJsonSchema();
Object.keys(doc.$defs).includes("SerializedWarning"); // true
```

#### Extends

- [`JsonSchemaNode`](#jsonschemanode)

#### Properties

##### $defs

> `readonly` **$defs**: `Readonly`\<`Record`\<`string`, [`JsonSchemaNode`](#jsonschemanode)\>\>

##### $ref?

> `readonly` `optional` **$ref?**: `string`

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`$ref`](#ref-1)

##### $schema

> `readonly` **$schema**: `string`

##### additionalProperties?

> `readonly` `optional` **additionalProperties?**: `false`

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`additionalProperties`](#additionalproperties-1)

##### enum?

> `readonly` `optional` **enum?**: readonly `string`[]

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`enum`](#enum-1)

##### items?

> `readonly` `optional` **items?**: [`JsonSchemaNode`](#jsonschemanode)

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`items`](#items-1)

##### properties?

> `readonly` `optional` **properties?**: `Readonly`\<`Record`\<`string`, [`JsonSchemaNode`](#jsonschemanode)\>\>

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`properties`](#properties-1)

##### required?

> `readonly` `optional` **required?**: readonly `string`[]

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`required`](#required-1)

##### type?

> `readonly` `optional` **type?**: `"string"` \| `"boolean"` \| `"object"` \| `"array"` \| `"integer"`

###### Inherited from

[`JsonSchemaNode`](#jsonschemanode).[`type`](#type-5)

***

### JsonSchemaNode

One node of the emitted JSON Schema. Every member is optional because a node
carries only the keywords its own shape needs: a reference carries `$ref`
alone, a scalar carries `type`, an object carries `type`, `properties`,
`required` and `additionalProperties`.

#### Example

```ts
import type { JsonSchemaNode } from "@cosyte/hl7";
const subcomponents: JsonSchemaNode = { type: "array", items: { type: "string" } };
```

#### Extended by

- [`JsonSchemaDocument`](#jsonschemadocument)

#### Properties

##### $ref?

> `readonly` `optional` **$ref?**: `string`

##### additionalProperties?

> `readonly` `optional` **additionalProperties?**: `false`

##### enum?

> `readonly` `optional` **enum?**: readonly `string`[]

##### items?

> `readonly` `optional` **items?**: [`JsonSchemaNode`](#jsonschemanode)

##### properties?

> `readonly` `optional` **properties?**: `Readonly`\<`Record`\<`string`, [`JsonSchemaNode`](#jsonschemanode)\>\>

##### required?

> `readonly` `optional` **required?**: readonly `string`[]

##### type?

> `readonly` `optional` **type?**: `"string"` \| `"boolean"` \| `"object"` \| `"array"` \| `"integer"`

***

### KnownCodingSystem

One recognized HL7 Table 0396 coding system: its registered acronym (the
value expected in CWE.3 / CE.3), a canonical human-readable name, and the
widely-used aliases tolerated for it. Aliases are matched case-insensitively.

#### Properties

##### aliases

> `readonly` **aliases**: readonly `string`[]

Widely-used alternative spellings that claim the same system (matched
case-insensitively), e.g. `"LOINC"` for `LN`. The registered `id` itself
is always recognized and need not be repeated here.

##### id

> `readonly` **id**: `string`

Registered Table 0396 acronym, e.g. `"LN"`.

##### name

> `readonly` **name**: `string`

Canonical human-readable name, e.g. `"LOINC"`.

***

### MdmDocument

Typed TXA (transcription document header) content for [buildMdm](#buildmdm).

#### Example

```ts
import type { MdmDocument } from "@cosyte/hl7";
const document: MdmDocument = {
  documentType: "DS",
  uniqueDocumentNumber: "DOC-1001",
  completionStatus: "AU",   // authenticated
  availabilityStatus: "AV", // a different axis: available
  body: [{ setId: "1", valueType: "TX", value: "Discharge summary text." }],
};
```

#### Properties

##### activityDateTime?

> `readonly` `optional` **activityDateTime?**: `string` \| [`DtmParts`](#dtmparts)

TXA-4 Activity Date/Time.

##### availabilityStatus?

> `readonly` `optional` **availabilityStatus?**: `string`

TXA-19 Document **Availability** Status (HL7 Table 0273: `AV`, `CA`, `OB`,
`UN`). A different axis from [completionStatus](#completionstatus-3): never merged, never
defaulted.

##### body?

> `readonly` `optional` **body?**: readonly [`OruObservation`](#oruobservation)[]

The transcribed narrative body, one OBX per entry. **Required for the
content events** (`T02`, `T04`, `T06`, `T08`, `T10`), whose published
structure gives OBX a minimum of one.

##### completionStatus?

> `readonly` `optional` **completionStatus?**: `string`

TXA-17 Document **Completion** Status (HL7 Table 0271: `DO`, `IP`, `AU`,
`LA`, `IN`). A different axis from [availabilityStatus](#availabilitystatus-1): never
merged, never defaulted.

##### documentType?

> `readonly` `optional` **documentType?**: `string`

TXA-2 Document Type (HL7 Table 0270), verbatim.

##### parentDocumentNumber?

> `readonly` `optional` **parentDocumentNumber?**: `string`

TXA-13 Parent Document Number: the addendum or replacement link.

##### setId?

> `readonly` `optional` **setId?**: `string`

TXA-1 Set ID.

##### uniqueDocumentNumber?

> `readonly` `optional` **uniqueDocumentNumber?**: `string`

TXA-12 Unique Document Number.

***

### Medication

A medication extracted from one RXO/RXE/RXD/RXA segment, with its RXR
(route) and RXC (component) children grouped
positionally. `context` records which RX* segment this came from (give
vs dispense vs administered).

**Safety contract.** A wrong drug, strength, or route can harm a real
patient, so this view is deliberately conservative:
- `giveCode` carries its own coding-system provenance via the CWE
  (`giveCode.nameOfCodingSystem`: e.g. `RXN` RxNorm, `NDC`). The helper
  surfaces the *claim*; it never validates or looks the code up.
- `amount` (how much) and `strength` (concentration) are SEPARATE fields and
  are never reconciled: including against any strength a coded drug
  implies. A disagreement is preserved for the consumer to see.
- Malformed RX* segments never throw: absent fields are omitted keys.

`routes` and `components` are ALWAYS present (possibly empty). So is
`timings`: empty when no TQ1 / legacy embedded TQ (RXE-1)
accompanies the medication; the repeat pattern is surfaced **verbatim, never
normalized to a schedule**. Deferred (not v1): sig/frequency *interpretation*,
dose-range or interaction checking, pharmacologic resolution of compounds.

`orderControl` is ORC-1 of the ORC that opened this medication's order group,
surfaced **verbatim** (`NW`, `DC`, `HD`, an unlisted code, any letter case)
and never classified into an active, held or ended state.

#### Example

```ts
import type { Medication } from "@cosyte/hl7";
const med: Medication = {
  orderControl: "NW",
  context: "encoded",
  giveCode: { identifier: "1049630", text: "Acetaminophen 325 MG", nameOfCodingSystem: "RXN" },
  amount: { minimum: 2, units: { identifier: "TAB" } },
  strength: { value: 325, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } },
  routes: [{ route: { identifier: "PO", text: "Oral" } }],
  components: [],
  timings: [{ source: "TQ1", repeatPattern: { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } } }],
};
```

#### Properties

##### amount?

> `readonly` `optional` **amount?**: [`MedicationAmount`](#medicationamount-1)

Give/dispense/administered amount (+ units). See [MedicationAmount](#medicationamount-1).

##### components

> `readonly` **components**: readonly [`MedicationComponent`](#medicationcomponent)[]

RXC children grouped under this RX* (compound components). Always present (possibly empty).

##### context

> `readonly` **context**: [`MedicationContext`](#medicationcontext-1)

Which RX* segment this medication came from (give/dispense/administered).

##### dosageForm?

> `readonly` `optional` **dosageForm?**: [`CWE`](#cwe-1)

RXO-5 requested dosage form (order context).

##### giveCode?

> `readonly` `optional` **giveCode?**: [`CWE`](#cwe-1)

RXO-1 / RXE-2 / RXD-2 / RXA-5 give/dispense/administered drug code, with provenance.

##### orderControl?

> `readonly` `optional` **orderControl?**: `string`

ORC-1 order control of the ORC that opened this medication's order group
(the run of segments from that ORC to the next ORC), exactly as sent: never
trimmed, case-folded, looked up, or classified into an active, held or ended
state. Every RX* segment in one group carries the same value. Omitted when no
ORC precedes the RX* segment in the message or that ORC's ORC-1 is empty; it
is never carried over from an earlier group.

##### routes

> `readonly` **routes**: readonly [`MedicationRoute`](#medicationroute)[]

RXR children grouped under this RX* (Table 0162 route). Always present (possibly empty).

##### strength?

> `readonly` `optional` **strength?**: [`MedicationStrength`](#medicationstrength-1)

RXE-25/26 give strength: ENCODED context only; never reconciled with `giveCode`.

##### timings

> `readonly` **timings**: readonly [`OrderTiming`](#ordertiming)[]

TQ1 / legacy embedded-TQ (RXE-1) timing(s) grouped under this medication.
Always present: empty when the medication carries no timing.
See [OrderTiming](#ordertiming).

***

### MedicationAmount

The give / dispense / administered amount of a `Medication`.
Carries the HL7 min/max amount pair and its units.

- For an **order** (RXO-2/3) or **encoded** order (RXE-3/4) the amount is a
  genuine min..max range: both keys may be present.
- For a **dispense** (RXD-4) or **administration** (RXA-6) there is a SINGLE
  amount; it is surfaced as `minimum` with `maximum` OMITTED. This is a
  single value, not a range: do not read the absent `maximum` as "no upper
  bound on a range".

`minimum`/`maximum` are strict-`Number()` parsed (`undefined`, never `NaN`).
`units` is the give/dispense/administered units CWE (RXO-4 / RXE-5 / RXD-5 /
RXA-7); check `units.nameOfCodingSystem === "UCUM"` for computable units.

#### Example

```ts
import type { MedicationAmount } from "@cosyte/hl7";
const amount: MedicationAmount = { minimum: 250, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } };
```

#### Properties

##### maximum?

> `readonly` `optional` **maximum?**: `number`

RXO-3 / RXE-4 maximum. OMITTED for single-amount (dispense/administration) contexts.

##### minimum?

> `readonly` `optional` **minimum?**: `number`

RXO-2 / RXE-3 minimum, or the single dispense (RXD-4) / administered (RXA-6) amount.

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

RXO-4 / RXE-5 / RXD-5 / RXA-7 give/dispense/administered units.

***

### MedicationComponent

One RXC (Pharmacy/Treatment Component Order) grouped under its parent RX*
segment: a component of a compound/IV. Surfaced STRUCTURALLY
(the component list as authored), NOT pharmacologically resolved.

#### Example

```ts
import type { MedicationComponent } from "@cosyte/hl7";
const c: MedicationComponent = { type: "B", code: { identifier: "D5W", text: "Dextrose 5%" }, amount: 1000 };
```

#### Properties

##### amount?

> `readonly` `optional` **amount?**: `number`

RXC-3 component amount (strict-parsed; never `NaN`).

##### code?

> `readonly` `optional` **code?**: [`CWE`](#cwe-1)

RXC-2 component code.

##### type?

> `readonly` `optional` **type?**: `string`

RXC-1 component type (e.g. "B"=base, "A"=additive: HL7 Table 0166).

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

RXC-4 component units.

***

### MedicationRoute

One RXR (Pharmacy/Treatment Route) grouped under its parent RX* segment.
`route` is HL7 Table 0162 (CWE); `site` is Table 0163 (CWE).
Provenance travels on the CWE (`route.nameOfCodingSystem`): a "PO" route is
only safe to act on when you know the system it was coded against.

#### Example

```ts
import type { MedicationRoute } from "@cosyte/hl7";
const r: MedicationRoute = { route: { identifier: "PO", text: "Oral" } };
```

#### Properties

##### route?

> `readonly` `optional` **route?**: [`CWE`](#cwe-1)

RXR-1 route of administration (HL7 Table 0162).

##### site?

> `readonly` `optional` **site?**: [`CWE`](#cwe-1)

RXR-2 administration site (HL7 Table 0163).

***

### MedicationStrength

The give *strength* of an **encoded** `Medication` (RXE-25 value + RXE-26
units). Strength is the concentration of active ingredient (e.g.
"250 mg"), distinct from the give *amount* (how much is administered, e.g.
"2 tablets"). Only the `"encoded"` (RXE) context carries strength.

**Fail-safe:** strength is surfaced exactly as the explicit
RXE-25/26 fields declare it, and is NEVER reconciled against any strength
*implied* by the give code (e.g. an NDC that encodes "250 mg"). A consumer
that sees both an explicit strength here and a coded drug in `giveCode` must
treat a disagreement as a real signal: the library does not silently pick a
winner. `value` is strict-`Number()` parsed (`undefined`, never `NaN`).

#### Example

```ts
import type { MedicationStrength } from "@cosyte/hl7";
const strength: MedicationStrength = { value: 250, units: { identifier: "mg", nameOfCodingSystem: "UCUM" } };
```

#### Properties

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

RXE-26 give strength units.

##### value?

> `readonly` `optional` **value?**: `number`

RXE-25 give strength numeric value (strict-parsed; never `NaN`).

***

### MessageStructure

The structure summary for a parsed message: the data behind
`Hl7Message.structure`. For an unrecognized type, `recognized` is `false` and
every list is empty (the safety net is deliberately silent on types it does
not model).

#### Properties

##### expectedGroups

> `readonly` **expectedGroups**: readonly [`StructureGroup`](#structuregroup)[]

Per-expected-segment presence verdicts (empty when unrecognized).

##### messageCode

> `readonly` **messageCode**: `string`

MSH-9.1 message code observed on the message. `""` when absent, and
`"<withheld>"` when `recognized` is `false` and the observed value is not
identifier-shaped (MSH-9 can hold a data field on a malformed message).

##### missingGroups

> `readonly` **missingGroups**: readonly `string`[]

Names of the expectations that are absent: the warnings.

##### missingSegments

> `readonly` **missingSegments**: readonly `string`[]

The required segments the message does not carry.

##### recognized

> `readonly` **recognized**: `boolean`

`true` when a `MESSAGE_STRUCTURE_DEFINITIONS` entry matched the type.

##### requiredSegments

> `readonly` **requiredSegments**: readonly `string`[]

Every segment the published structure requires (empty when unrecognized).

##### structureIds

> `readonly` **structureIds**: readonly `string`[]

The published structure ids the verdict was derived from. Empty when the
type is unrecognized or the entry is a retained transcription.

##### triggerEvent

> `readonly` **triggerEvent**: `string`

MSH-9.2 trigger event observed on the message. `""` when absent, and
`"<withheld>"` when `recognized` is `false` and the observed value is not
identifier-shaped. Note that on the `recognized` branch this is echoed
verbatim, which for a definition matching on message code alone (`ACK`)
means an arbitrary MSH-9.2.

***

### MessageStructureDefinition

The expected structure of one recognized message type.

An entry covers one message code and the trigger events the publication maps
to a single structure. An empty `triggerEvents` list means "match on message
code alone" (used for `ACK`, whose MSH-9.2 carries the acknowledged message's
trigger event rather than one of its own).

#### Properties

##### derivation

> `readonly` **derivation**: [`StructureDerivation`](#structurederivation)

Whether the expectations were derived or retained.

##### expectedGroups

> `readonly` **expectedGroups**: readonly [`ExpectedSegmentGroup`](#expectedsegmentgroup)[]

One entry per segment the published structure requires.

##### messageCode

> `readonly` **messageCode**: `string`

MSH-9.1 message code, e.g. `"ORU"`.

##### requiredSegments

> `readonly` **requiredSegments**: readonly `string`[]

The required segment names, sorted: the same set, flattened.

##### retainedReason

> `readonly` **retainedReason**: `string`

Why a retained transcription could not be derived from the publication.
Empty string for a derived entry.

##### structureId

> `readonly` **structureId**: `string`

The published structure id these expectations were derived from, e.g.
`"ADT_A01"`. Empty for a retained transcription.

##### structureIds

> `readonly` **structureIds**: readonly `string`[]

Every member of that structure's variant family that was actually read,
e.g. `["ADT_A01-A", "ADT_A01-B", "ADT_A01-C", "ADT_A01-D"]`. Empty for a
retained transcription.

##### triggerEvents

> `readonly` **triggerEvents**: readonly `string`[]

The MSH-9.2 trigger events this definition applies to, e.g. `["R01"]`.
An empty list means "match on message code alone" (e.g. `ACK`).

***

### Meta

MSH-derived message metadata. Always defined on
`Hl7Message.meta` (MSH absence throws `NO_MSH_SEGMENT` at parse time);
individual fields are optional because vendor-quirky messages routinely
omit pieces of MSH. `timestamp` is the fidelity `TS` (precision +
timezone preserved), not an eager UTC-assuming `Date`.

#### Example

```ts
import type { Meta } from "@cosyte/hl7";
const meta: Meta = {
  type: "ADT^A01",
  messageCode: "ADT",
  triggerEvent: "A01",
  controlId: "MSG001",
  version: "2.5",
};
console.log(meta.timestamp?.raw, meta.timestamp?.precision);
```

#### Properties

##### controlId?

> `readonly` `optional` **controlId?**: `string`

MSH-10 message control ID: unique per message per sender.

##### messageCode?

> `readonly` `optional` **messageCode?**: `string`

MSH-9.1 message code (e.g. "ADT", "ORU").

##### messageProfileIdentifiers?

> `readonly` `optional` **messageProfileIdentifiers?**: readonly [`EI`](#ei-1)[]

MSH-21 message profile identifiers, one `EI` per repetition, in order: the
conformance profiles the sender says the message follows (for example an
immunization implementation guide's profile). OMITTED when MSH-21 is empty.
Named Conformance Statement ID before v2.5.

##### messageStructure?

> `readonly` `optional` **messageStructure?**: `string`

MSH-9.3 message structure (e.g. "ADT_A01").

##### processingId?

> `readonly` `optional` **processingId?**: `string`

MSH-11.1 processing id (P=production, T=test, D=debug).

##### receivingApp?

> `readonly` `optional` **receivingApp?**: `string`

MSH-5.1 receiving application namespace id.

##### receivingFacility?

> `readonly` `optional` **receivingFacility?**: `string`

MSH-6.1 receiving facility namespace id.

##### sendingApp?

> `readonly` `optional` **sendingApp?**: `string`

MSH-3.1 sending application namespace id.

##### sendingFacility?

> `readonly` `optional` **sendingFacility?**: `string`

MSH-4.1 sending facility namespace id.

##### timestamp?

> `readonly` `optional` **timestamp?**: [`DtmParts`](#dtmparts)

MSH-7 message date/time as the fidelity `TS`. Absent when MSH-7 is empty
or unparseable. Present with `valid: false` and an `ambiguity` report when
the value is a slash date whose field order cannot be established: check
`valid` before reading the parts.

##### triggerEvent?

> `readonly` `optional` **triggerEvent?**: `string`

MSH-9.2 trigger event (e.g. "A01", "R01").

##### type?

> `readonly` `optional` **type?**: `string`

MSH-9 full message type string, e.g. "ADT^A01" or "ORU^R01^ORU_R01".

##### version?

> `readonly` `optional` **version?**: `string`

MSH-12 HL7 version string (e.g. "2.5", "2.5.1").

***

### MO

HL7 v2 Money (MO): an amount and its currency, per HL7 Chapter 2. Both
components are optional.

The amount stays the text the sender wrote and is never turned into a
JavaScript `number`: a float cannot hold every decimal amount exactly, and a
price rounded on the way in is a quiet error nobody sees.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. quantity (an NM, kept as its text, e.g. "150.00")
2. denomination (ISO 4217 currency code, e.g. "USD")

#### Example

```ts
import type { MO } from "@cosyte/hl7";
const fee: MO = { quantity: "150.00", denomination: "USD" };
```

#### Properties

##### denomination?

> `readonly` `optional` **denomination?**: `string`

MO.2 Denomination, the currency code.

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 2nd, preserved verbatim and in order. OMITTED when
there are none.

##### quantity?

> `readonly` `optional` **quantity?**: `string`

MO.1 Quantity, the amount as written.

***

### MSG

HL7 v2 Message Type (MSG): per HL7 Chapter 2. All 3 components are
optional.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. messageCode (HL7 Table 0076, e.g. "ADT")
2. triggerEvent (HL7 Table 0003, e.g. "A01")
3. messageStructure (HL7 Table 0354, e.g. "ADT_A01")

Used by MSH-9. `msg.meta` reads the same three parts as flat strings.

#### Example

```ts
import type { MSG } from "@cosyte/hl7";
const type: MSG = { messageCode: "ADT", triggerEvent: "A01", messageStructure: "ADT_A01" };
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 3rd, preserved verbatim and in order. OMITTED when
there are none.

##### messageCode?

> `readonly` `optional` **messageCode?**: `string`

MSG.1 Message Code.

##### messageStructure?

> `readonly` `optional` **messageStructure?**: `string`

MSG.3 Message Structure.

##### triggerEvent?

> `readonly` `optional` **triggerEvent?**: `string`

MSG.2 Trigger Event.

***

### NextOfKin

NK1-derived next-of-kin entry. Lean subset: callers can
reach for `msg.segments("NK1")` when they need the full NK1 surface.

#### Example

```ts
import type { NextOfKin } from "@cosyte/hl7";
const nk: NextOfKin = {
  name: { familyName: "Doe", givenName: "John" },
  relationship: { identifier: "FTH", text: "Father" },
};
```

#### Properties

##### address?

> `readonly` `optional` **address?**: [`XAD`](#xad-1)

NK1-4 address.

##### contactRole?

> `readonly` `optional` **contactRole?**: [`CWE`](#cwe-1)

NK1-7 contact role.

##### name?

> `readonly` `optional` **name?**: [`XPN`](#xpn-1)

NK1-2 next-of-kin name.

##### phone?

> `readonly` `optional` **phone?**: [`XTN`](#xtn-1)

NK1-5 phone (first repetition).

##### relationship?

> `readonly` `optional` **relationship?**: [`CWE`](#cwe-1)

NK1-3 relationship to patient (FTH=father, MTH=mother, SPO=spouse, ...).

***

### NM

HL7 v2 Numeric (NM) composite. Carries both the raw HL7 numeric string
and the parsed JS `number`. `.value` is `undefined` when the raw string
is empty or not fully numeric: NEVER throws.

Unlike most composites in this phase, both `raw` and `value` are
ALWAYS-PRESENT keys (not optional): `value` is explicitly typed as
`number | undefined` so callers can destructure uniformly.

#### Example

```ts
import type { NM } from "@cosyte/hl7";
const glucose: NM = { raw: "120", value: 120 };
const bad: NM = { raw: "N/A", value: undefined };
```

#### Properties

##### raw

> `readonly` **raw**: `string`

##### value

> `readonly` **value**: `number` \| `undefined`

***

### ObservationBase

Fields shared by every `Observation` variant, regardless of the OBX-2
value type. Split from the discriminated union to keep the union
declaration readable.

#### Example

```ts
import type { ObservationBase } from "@cosyte/hl7";
const base: ObservationBase = {
  setId: "1",
  identifier: { identifier: "GLU", text: "Glucose" },
  resultStatus: {
    classification: "undetermined",
    table: { name: "HL7 Table 0085", version: "3.0.0" },
    map: {
      url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
      version: "1.0.0",
    },
  },
};
```

#### Properties

##### abnormalFlags?

> `readonly` `optional` **abnormalFlags?**: `string`

OBX-8 abnormal flags (e.g. "H", "HH", "L", "LL").

##### identifier

> `readonly` **identifier**: [`CWE`](#cwe-1)

OBX-3 observation identifier. Always present (may be `{}` if OBX-3 absent).

##### notes?

> `readonly` `optional` **notes?**: readonly `string`[]

NTE note lines positionally attached to this OBX: each
non-empty NTE-3 (Comment, FT) repetition of every NTE immediately
following this observation, HL7-unescaped, in document order. OMITTED when
the observation carries no notes. High-PHI-risk clinical narrative.

##### observedDateTime?

> `readonly` `optional` **observedDateTime?**: [`DtmParts`](#dtmparts)

OBX-14 date/time of observation as the fidelity `TS`.

##### referenceRange?

> `readonly` `optional` **referenceRange?**: `string`

OBX-7 reference range (e.g. "80-110").

##### resultStatus

> `readonly` **resultStatus**: [`ResultStatusClassification`](#resultstatusclassification)

OBX-11 read against HL7 Table 0085 and classified by HL7's Table 0085 to
Observation Status map. Always present: `"undetermined"` when OBX-11 is
absent, unmapped or not exactly one code. See
[ResultStatusClassification](#resultstatusclassification).

##### setId?

> `readonly` `optional` **setId?**: `string`

OBX-1 set id (string: typically sequential "1", "2", ...).

##### status?

> `readonly` `optional` **status?**: `string`

OBX-11 observation result status (e.g. "F"=final, "P"=preliminary).

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

OBX-6 units.

##### unitsAreUcum?

> `readonly` `optional` **unitsAreUcum?**: `boolean`

`true` iff OBX-6's coding system (CWE.3, "name of coding system") is
exactly `UCUM` (HL7 Table 0396): i.e. the unit is declared UCUM and is
safe to interpret as a computable unit. `false` means a unit IS present
but is NOT declared UCUM (e.g. a local code or free text) and is surfaced
as-is, never coerced. OMITTED when OBX-6 is absent. This is a *claim* check
only: the library does not validate UCUM grammar or check the alternate
coding system (CWE.6).

***

### Order

OBR-derived order with positionally-grouped OBX children.
`observations` is ALWAYS present: empty when no OBX follows this
OBR before the next OBR or end-of-message. `timings` is ALWAYS present,
empty when the order carries no TQ1 / legacy embedded TQ.

#### Example

```ts
import type { Order } from "@cosyte/hl7";
const order: Order = {
  placerOrderNumber: "PLACER1",
  fillerOrderNumber: "FILLER1",
  universalServiceId: { identifier: "GLU", text: "Glucose" },
  orderStatus: "F",
  resultStatus: {
    classification: "final",
    code: "F",
    table: { name: "HL7 Table 0123", version: "3.0.0" },
    map: {
      url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status",
      version: "1.0.0",
    },
  },
  observations: [],
  timings: [],
};
```

#### Properties

##### fillerOrderId?

> `readonly` `optional` **fillerOrderId?**: [`EI`](#ei-1)

OBR-3 filler order number as the whole `EI`. OMITTED when OBR-3 is empty.

##### fillerOrderNumber?

> `readonly` `optional` **fillerOrderNumber?**: `string`

OBR-3 filler order number: its first component (EI.1) alone.

##### notes?

> `readonly` `optional` **notes?**: readonly `string`[]

NTE note lines positionally attached to this order: the
ORC-region notes (before the OBR) followed by the OBR-region notes, in
document order. Several ORCs before one OBR all contribute here; nothing is
dropped. OMITTED when the order carries no notes. A note on a trailing or
dangling ORC that never opens an order is surfaced at message level
(`msg.notes()`), not here: still never dropped. High-PHI-risk clinical
narrative.

##### observations

> `readonly` **observations**: readonly [`Observation`](#observation)[]

OBX children grouped under this OBR (positional grouping). Always present.

##### orcFillerOrderId?

> `readonly` `optional` **orcFillerOrderId?**: [`EI`](#ei-1)

ORC-3 filler order number of the ORC that precedes this OBR, as an `EI`.
OMITTED when there is no such ORC or ORC-3 is empty.

##### orcPlacerOrderId?

> `readonly` `optional` **orcPlacerOrderId?**: [`EI`](#ei-1)

ORC-2 placer order number of the ORC that precedes this OBR, as an `EI`.
The standard expects it to match OBR-2; it is read as sent, never copied
from OBR-2. OMITTED when there is no such ORC or ORC-2 is empty.

##### orderControl?

> `readonly` `optional` **orderControl?**: `string`

ORC-1 order control when an ORC precedes this OBR.

##### orderedBy?

> `readonly` `optional` **orderedBy?**: [`XCN`](#xcn-1)

OBR-16 ordering provider (XCN).

##### orderStatus?

> `readonly` `optional` **orderStatus?**: `string`

OBR-25 result status (HL7 Table 0123, e.g. `"F"` final, `"P"` preliminary).

##### placerOrderId?

> `readonly` `optional` **placerOrderId?**: [`EI`](#ei-1)

OBR-2 placer order number as the whole `EI`: the number and the authority
that assigned it. Two placers can issue the same number, so match orders on
this, not on `placerOrderNumber` alone. OMITTED when OBR-2 is empty.

##### placerOrderNumber?

> `readonly` `optional` **placerOrderNumber?**: `string`

OBR-2 placer order number: its first component (EI.1) alone.

##### resultStatus

> `readonly` **resultStatus**: [`ResultStatusClassification`](#resultstatusclassification)

OBR-25 read against HL7 Table 0123 and classified by HL7's Table 0123 to
Diagnostic Report Status map. Always present: `"undetermined"` when OBR-25
is absent, unmapped or not exactly one code. Classified from OBR-25 alone,
never from the statuses of the order's observations, each of which carries
its own. See [ResultStatusClassification](#resultstatusclassification).

##### timings

> `readonly` **timings**: readonly [`OrderTiming`](#ordertiming)[]

TQ1 / legacy embedded-TQ timing(s) grouped under this order.
Always present: empty when the order carries no timing. See
[OrderTiming](#ordertiming).

##### universalServiceId?

> `readonly` `optional` **universalServiceId?**: [`CWE`](#cwe-1)

OBR-4 universal service identifier (test code + description).

***

### OrderTiming

The order/medication **timing** structure: one TQ1 segment (v2.5+) or the
legacy embedded TQ in ORC-7 / RXE-1 (pre-v2.5). Attached to
[Order.timings](#timings-1) and [Medication.timings](#timings).

**Safety contract.** hl7 surfaces the timing **structure**; it does **not**
compute administration schedules, resolve "institution-specified times" to
clock times, or interpret sig. The load-bearing [repeatPattern](#repeatpattern) and
[totalOccurrences](#totaloccurrences) are preserved verbatim (see [RepeatPattern](#repeatpattern-1));
`startDateTime`/`endDateTime` keep the `TS` precision + timezone
fidelity. A malformed timing never throws: absent pieces are omitted keys.

#### Example

```ts
import type { OrderTiming } from "@cosyte/hl7";
const t: OrderTiming = {
  source: "TQ1",
  quantity: { value: 1 },
  repeatPattern: { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } },
  totalOccurrences: 20,
};
```

#### Properties

##### endDateTime?

> `readonly` `optional` **endDateTime?**: [`DtmParts`](#dtmparts)

TQ1-8 / legacy TQ.5 end date/time as the fidelity `TS`.

##### explicitTime?

> `readonly` `optional` **explicitTime?**: `string`

TQ1-4 / legacy TQ.2 interval RI.2 explicit time(s): surfaced verbatim (first repetition/value).

##### priority?

> `readonly` `optional` **priority?**: [`CWE`](#cwe-1)

TQ1-9 priority (CWE) / legacy TQ.6 priority (surfaced as a CWE `{ identifier }`).

##### quantity?

> `readonly` `optional` **quantity?**: [`TimingQuantity`](#timingquantity)

TQ1-2 / legacy TQ.1 service quantity (CQ).

##### repeatPattern?

> `readonly` `optional` **repeatPattern?**: [`RepeatPattern`](#repeatpattern-1)

TQ1-3 / legacy TQ.2 interval RI.1 repeat pattern (Table 0335): verbatim. See [RepeatPattern](#repeatpattern-1).

##### serviceDuration?

> `readonly` `optional` **serviceDuration?**: `string`

TQ1-6 / legacy TQ.3 service duration: surfaced verbatim.

##### source

> `readonly` **source**: `"TQ1"` \| `"legacy"`

Which structure this timing was read from: the dedicated **TQ1** segment
(v2.5+) or the **legacy** embedded TQ data type in ORC-7 (orders) / RXE-1
(encoded medications, pre-v2.5). The library treats the presence of a TQ1
segment as the v2.5+ signal: the legacy embedded TQ is surfaced only when
no TQ1 accompanies the order, so the same timing is never double-counted
and a legacy-only timing is never dropped.

##### startDateTime?

> `readonly` `optional` **startDateTime?**: [`DtmParts`](#dtmparts)

TQ1-7 / legacy TQ.4 start date/time as the fidelity `TS`.

##### totalOccurrences?

> `readonly` `optional` **totalOccurrences?**: `number`

TQ1-14 / legacy TQ.12 total occurrences (NM): how many times the service
is to be performed (strict-parsed; never `NaN`). **TQ1-14, not TQ1-11**
(TQ1-11 is Text Instruction). Load-bearing: losing it drops the total
administered count.

***

### OrmOrder

Typed order content for [buildOrm](#buildorm): the OBR order detail every typed
builder shares, plus the ORC control information and any OBX children.

#### Example

```ts
import type { OrmOrder } from "@cosyte/hl7";
const order: OrmOrder = {
  orderControl: "NW",
  setId: "1",
  placerOrderNumber: "PL-1001",
  universalServiceId: { identifier: "CBC", text: "Complete Blood Count" },
  orderingProvider: { idNumber: "9990", familyName: "Welby" },
};
```

#### Extends

- [`OruOrder`](#oruorder)

#### Properties

##### fillerOrderNumber?

> `readonly` `optional` **fillerOrderNumber?**: `string`

OBR-3 Filler Order Number.

###### Inherited from

[`OruOrder`](#oruorder).[`fillerOrderNumber`](#fillerordernumber-2)

##### observationDateTime?

> `readonly` `optional` **observationDateTime?**: `string` \| [`DtmParts`](#dtmparts)

OBR-7 Observation Date/Time.

###### Inherited from

[`OruOrder`](#oruorder).[`observationDateTime`](#observationdatetime-2)

##### observations?

> `readonly` `optional` **observations?**: readonly [`OruObservation`](#oruobservation)[]

OBX children of this order, in the order supplied.

##### orcFillerOrderNumber?

> `readonly` `optional` **orcFillerOrderNumber?**: `string`

ORC-3 Filler Order Number. Defaults to nothing: never copied from OBR-3.

##### orcPlacerOrderNumber?

> `readonly` `optional` **orcPlacerOrderNumber?**: `string`

ORC-2 Placer Order Number. Defaults to nothing: never copied from OBR-2.

##### orderControl?

> `readonly` `optional` **orderControl?**: `string`

ORC-1 Order Control (HL7 Table 0119: `NW` new order, `CA` cancel, `XO`
change, …). An ORC is emitted for every order regardless, because the
published expectation for this message type is exactly that segment; this
value fills ORC-1 when supplied and is never defaulted.

##### orderingProvider?

> `readonly` `optional` **orderingProvider?**: [`XCN`](#xcn-1) \| readonly [`XCN`](#xcn-1)[]

OBR-16 Ordering Provider.

###### Inherited from

[`OruOrder`](#oruorder).[`orderingProvider`](#orderingprovider-1)

##### placerOrderNumber?

> `readonly` `optional` **placerOrderNumber?**: `string`

OBR-2 Placer Order Number.

###### Inherited from

[`OruOrder`](#oruorder).[`placerOrderNumber`](#placerordernumber-2)

##### resultStatus?

> `readonly` `optional` **resultStatus?**: `string`

OBR-25 Result Status (e.g. `"F"` final, `"P"` preliminary, `"C"` corrected).

###### Inherited from

[`OruOrder`](#oruorder).[`resultStatus`](#resultstatus-3)

##### setId?

> `readonly` `optional` **setId?**: `string`

OBR-1 Set ID.

###### Inherited from

[`OruOrder`](#oruorder).[`setId`](#setid-7)

##### universalServiceId?

> `readonly` `optional` **universalServiceId?**: [`CWE`](#cwe-1)

OBR-4 Universal Service Identifier.

###### Inherited from

[`OruOrder`](#oruorder).[`universalServiceId`](#universalserviceid-2)

***

### OruObservation

Typed OBX (observation / result) content for [buildOru](#buildoru).

#### Properties

##### abnormalFlags?

> `readonly` `optional` **abnormalFlags?**: `string`

OBX-8 Abnormal Flags (e.g. `"H"`, `"L"`, `"N"`).

##### identifier?

> `readonly` `optional` **identifier?**: [`CWE`](#cwe-1)

OBX-3 Observation Identifier.

##### observationDateTime?

> `readonly` `optional` **observationDateTime?**: `string` \| [`DtmParts`](#dtmparts)

OBX-14 Date/Time of the Observation.

##### observationResultStatus?

> `readonly` `optional` **observationResultStatus?**: `string`

OBX-11 Observation Result Status (e.g. `"F"` final, `"P"` preliminary).

##### referenceRange?

> `readonly` `optional` **referenceRange?**: `string`

OBX-7 References Range.

##### setId?

> `readonly` `optional` **setId?**: `string`

OBX-1 Set ID.

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

OBX-6 Units.

##### value?

> `readonly` `optional` **value?**: `string`

OBX-5 Observation Value (emitted verbatim: the caller owns its formatting).

##### valueType?

> `readonly` `optional` **valueType?**: `string`

OBX-2 Value Type (e.g. `"NM"`, `"ST"`, `"CE"`, `"TX"`).

***

### OruOrder

Typed OBR (observation request / order) content for [buildOru](#buildoru).

#### Extended by

- [`OrmOrder`](#ormorder)

#### Properties

##### fillerOrderNumber?

> `readonly` `optional` **fillerOrderNumber?**: `string`

OBR-3 Filler Order Number.

##### observationDateTime?

> `readonly` `optional` **observationDateTime?**: `string` \| [`DtmParts`](#dtmparts)

OBR-7 Observation Date/Time.

##### orderingProvider?

> `readonly` `optional` **orderingProvider?**: [`XCN`](#xcn-1) \| readonly [`XCN`](#xcn-1)[]

OBR-16 Ordering Provider.

##### placerOrderNumber?

> `readonly` `optional` **placerOrderNumber?**: `string`

OBR-2 Placer Order Number.

##### resultStatus?

> `readonly` `optional` **resultStatus?**: `string`

OBR-25 Result Status (e.g. `"F"` final, `"P"` preliminary, `"C"` corrected).

##### setId?

> `readonly` `optional` **setId?**: `string`

OBR-1 Set ID.

##### universalServiceId?

> `readonly` `optional` **universalServiceId?**: [`CWE`](#cwe-1)

OBR-4 Universal Service Identifier.

***

### OverlayStructures

Every published overlay key, mapped to the segment names the pair's published
structure marks required. This is the compile-time face of the derived
structure registry: the runtime support claim
([SUPPORTED\_OVERLAY\_MESSAGES](#supported_overlay_messages)) is computed from that registry, and a
test compares the two in both directions so this table can never claim a pair
the registry does not recognize.

A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a
registry entry that matches on message code alone (`"ACK"`, whose MSH-9.2
carries the acknowledged message's trigger event rather than one of its own).

#### Example

```ts
import type { OverlayStructures } from "@cosyte/hl7";
// The required segments for one pair, at the type level:
type A01 = OverlayStructures["ADT^A01"]; // readonly ["EVN", "MSH", "PID", "PV1"]
```

#### Properties

##### ACK

> `readonly` **ACK**: readonly \[`"MSA"`, `"MSH"`\]

##### ADT^A01

> `readonly` **ADT^A01**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A02

> `readonly` **ADT^A02**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A03

> `readonly` **ADT^A03**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A04

> `readonly` **ADT^A04**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A05

> `readonly` **ADT^A05**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A06

> `readonly` **ADT^A06**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A07

> `readonly` **ADT^A07**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A08

> `readonly` **ADT^A08**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A09

> `readonly` **ADT^A09**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A10

> `readonly` **ADT^A10**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A11

> `readonly` **ADT^A11**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A12

> `readonly` **ADT^A12**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A13

> `readonly` **ADT^A13**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A14

> `readonly` **ADT^A14**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A15

> `readonly` **ADT^A15**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PRT"`, `"PV1"`\]

##### ADT^A16

> `readonly` **ADT^A16**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A17

> `readonly` **ADT^A17**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A20

> `readonly` **ADT^A20**: readonly \[`"EVN"`, `"MSH"`, `"NPU"`\]

##### ADT^A21

> `readonly` **ADT^A21**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A22

> `readonly` **ADT^A22**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A23

> `readonly` **ADT^A23**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A24

> `readonly` **ADT^A24**: readonly \[`"EVN"`, `"MSH"`, `"PID"`\]

##### ADT^A25

> `readonly` **ADT^A25**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A26

> `readonly` **ADT^A26**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A27

> `readonly` **ADT^A27**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A28

> `readonly` **ADT^A28**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A29

> `readonly` **ADT^A29**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A31

> `readonly` **ADT^A31**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A32

> `readonly` **ADT^A32**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A33

> `readonly` **ADT^A33**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A37

> `readonly` **ADT^A37**: readonly \[`"EVN"`, `"MSH"`, `"PID"`\]

##### ADT^A38

> `readonly` **ADT^A38**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A40

> `readonly` **ADT^A40**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A41

> `readonly` **ADT^A41**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A42

> `readonly` **ADT^A42**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A43

> `readonly` **ADT^A43**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A44

> `readonly` **ADT^A44**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A45

> `readonly` **ADT^A45**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A47

> `readonly` **ADT^A47**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A49

> `readonly` **ADT^A49**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`\]

##### ADT^A50

> `readonly` **ADT^A50**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A51

> `readonly` **ADT^A51**: readonly \[`"EVN"`, `"MRG"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A52

> `readonly` **ADT^A52**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A53

> `readonly` **ADT^A53**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A54

> `readonly` **ADT^A54**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A55

> `readonly` **ADT^A55**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A60

> `readonly` **ADT^A60**: readonly \[`"EVN"`, `"MSH"`, `"PID"`\]

##### ADT^A61

> `readonly` **ADT^A61**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### ADT^A62

> `readonly` **ADT^A62**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`\]

##### DFT^P03

> `readonly` **DFT^P03**: readonly \[`"EVN"`, `"FT1"`, `"MSH"`, `"PID"`\]

##### DFT^P11

> `readonly` **DFT^P11**: readonly \[`"EVN"`, `"FT1"`, `"MSH"`, `"PID"`\]

##### MDM^T01

> `readonly` **MDM^T01**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T02

> `readonly` **MDM^T02**: readonly \[`"EVN"`, `"MSH"`, `"OBX"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T03

> `readonly` **MDM^T03**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T04

> `readonly` **MDM^T04**: readonly \[`"EVN"`, `"MSH"`, `"OBX"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T05

> `readonly` **MDM^T05**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T06

> `readonly` **MDM^T06**: readonly \[`"EVN"`, `"MSH"`, `"OBX"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T07

> `readonly` **MDM^T07**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T08

> `readonly` **MDM^T08**: readonly \[`"EVN"`, `"MSH"`, `"OBX"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T09

> `readonly` **MDM^T09**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T10

> `readonly` **MDM^T10**: readonly \[`"EVN"`, `"MSH"`, `"OBX"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### MDM^T11

> `readonly` **MDM^T11**: readonly \[`"EVN"`, `"MSH"`, `"PID"`, `"PV1"`, `"TXA"`\]

##### OMG^O19

> `readonly` **OMG^O19**: readonly \[`"MSH"`, `"OBR"`, `"ORC"`\]

##### OMI^O23

> `readonly` **OMI^O23**: readonly \[`"IPC"`, `"MSH"`, `"OBR"`, `"ORC"`\]

##### OML^O21

> `readonly` **OML^O21**: readonly \[`"MSH"`, `"ORC"`\]

##### OML^O33

> `readonly` **OML^O33**: readonly \[`"MSH"`, `"ORC"`, `"SPM"`\]

##### OML^O35

> `readonly` **OML^O35**: readonly \[`"MSH"`, `"ORC"`, `"SAC"`, `"SPM"`\]

##### OML^O39

> `readonly` **OML^O39**: readonly \[`"MSH"`, `"ORC"`\]

##### OML^O59\_A

> `readonly` **OML^O59\_A**: readonly \[`"MSH"`, `"ORC"`\]

##### OMP^O09

> `readonly` **OMP^O09**: readonly \[`"MSH"`, `"ORC"`, `"RXO"`, `"RXR"`\]

##### ORL^O22

> `readonly` **ORL^O22**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O34

> `readonly` **ORL^O34**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O36

> `readonly` **ORL^O36**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O40

> `readonly` **ORL^O40**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O53

> `readonly` **ORL^O53**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O54

> `readonly` **ORL^O54**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O55

> `readonly` **ORL^O55**: readonly \[`"MSA"`, `"MSH"`\]

##### ORL^O56

> `readonly` **ORL^O56**: readonly \[`"MSA"`, `"MSH"`\]

##### ORM^O01

> `readonly` **ORM^O01**: readonly \[`"ORC"`\]

##### ORU^R01

> `readonly` **ORU^R01**: readonly \[`"MSH"`, `"OBR"`\]

##### ORU^R30

> `readonly` **ORU^R30**: readonly \[`"MSH"`, `"OBR"`, `"OBX"`, `"ORC"`, `"PID"`\]

##### ORU^R31

> `readonly` **ORU^R31**: readonly \[`"MSH"`, `"OBR"`, `"OBX"`, `"ORC"`, `"PID"`\]

##### ORU^R32

> `readonly` **ORU^R32**: readonly \[`"MSH"`, `"OBR"`, `"OBX"`, `"ORC"`, `"PID"`\]

##### ORU^R40

> `readonly` **ORU^R40**: readonly \[`"MSH"`, `"OBR"`\]

##### ORU^R42

> `readonly` **ORU^R42**: readonly \[`"MSH"`, `"OBR"`\]

##### ORU^R43

> `readonly` **ORU^R43**: readonly \[`"MSH"`, `"OBR"`\]

##### OUL^R22

> `readonly` **OUL^R22**: readonly \[`"MSH"`, `"OBR"`, `"SPM"`\]

##### OUL^R23

> `readonly` **OUL^R23**: readonly \[`"MSH"`, `"OBR"`, `"SAC"`, `"SPM"`\]

##### OUL^R24

> `readonly` **OUL^R24**: readonly \[`"MSH"`, `"OBR"`\]

##### RAS^O17

> `readonly` **RAS^O17**: readonly \[`"MSH"`, `"ORC"`, `"RXA"`, `"RXR"`\]

##### RDE^O11

> `readonly` **RDE^O11**: readonly \[`"MSH"`, `"ORC"`, `"RXE"`, `"RXR"`, `"TQ1"`\]

##### RDE^O25

> `readonly` **RDE^O25**: readonly \[`"MSH"`, `"ORC"`, `"RXE"`, `"RXR"`, `"TQ1"`\]

##### RDE^O49

> `readonly` **RDE^O49**: readonly \[`"MSH"`, `"ORC"`, `"RXE"`, `"RXR"`, `"TQ1"`\]

##### SIU^S12

> `readonly` **SIU^S12**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S13

> `readonly` **SIU^S13**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S14

> `readonly` **SIU^S14**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S15

> `readonly` **SIU^S15**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S16

> `readonly` **SIU^S16**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S17

> `readonly` **SIU^S17**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S18

> `readonly` **SIU^S18**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S19

> `readonly` **SIU^S19**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S20

> `readonly` **SIU^S20**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S21

> `readonly` **SIU^S21**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S22

> `readonly` **SIU^S22**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S23

> `readonly` **SIU^S23**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S24

> `readonly` **SIU^S24**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S26

> `readonly` **SIU^S26**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### SIU^S27

> `readonly` **SIU^S27**: readonly \[`"MSH"`, `"RGS"`, `"SCH"`\]

##### VXU^V04

> `readonly` **VXU^V04**: readonly \[`"MSH"`, `"PID"`\]

***

### ParseOptions

Options accepted by `parseHL7` to tune lenient/strict behaviour, inject a
profile, and configure optional preprocessing steps. Every field is
optional; `parseHL7(raw, {})` is valid and produces the library defaults.

#### Remarks

With `exactOptionalPropertyTypes: true`, callers cannot pass
`{ strict: undefined }`: either omit the key or pass a boolean. The
`profile: null` form is the explicit opt-out from the process-scoped
default profile; `profile` omitted means "use the
default if one is registered".

#### Example

```ts
import { parseHL7, type ParseOptions } from "@cosyte/hl7";
const opts: ParseOptions = {
  strict: true,
  onWarning: (w) => console.warn(w.code),
  dateFormats: ["YYYY-MM-DD"],
};
parseHL7(raw, opts);
```

#### Properties

##### charset?

> `readonly` `optional` **charset?**: `string`

Override the character set used to decode `Buffer` input. When supplied
this wins over MSH-18 auto-discovery. When both are supplied and they
disagree (after alias normalization) the parser emits
`ENCODING_MISMATCH` and honours this override. Ignored for `string`
input.

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
parseHL7(buf, { charset: "ISO-8859-1" });
```

##### dateFormats?

> `readonly` `optional` **dateFormats?**: readonly `string`[]

Date formats your sender writes, tried in order after the canonical HL7
shape fails. They reach **every** datetime the library returns, from
`msg.meta.timestamp` to `patient.dateOfBirth` to an appointment's start
time, and a `TS` that matched one names it on `matchedFormat`.

These are tried ahead of an applied profile's own `dateFormats`, and they
are the ONLY non-canonical formats a typed datetime field accepts: a value
you have not described stays `valid: false` rather than being guessed at.
Tokens come from `SUPPORTED_DATE_TOKENS`; an entry with no supported token
matches nothing rather than throwing.

##### lazy?

> `readonly` `optional` **lazy?**: `boolean`

Build each segment's tree the first time something reads it (the default, `true`), or every
segment's tree during the parse (`false`).

Either way the parse reads the whole message once and reports every warning before it
returns: `warnings`, `strict` and `onWarning` behave the same in both modes, and a problem is
never reported later, on first read. A lazy parse keeps the message text and where each
segment starts, and builds a segment's tree when `segments()`, `part()`, `get()`, a helper or
an edit first reads it, then keeps it on the message. Reading a few segments of a long
message builds those few.

Some reads build every segment: `rawSegments`, `toString()`, `toJSON()`, `prettyPrint()`,
and a helper that reads every segment of a type (such as `observations()`, which reads each
OBX). Pass `false` to build the whole tree during the parse instead, for example to keep the
cost of the build inside the parse call.

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const eager = parseHL7(raw, { lazy: false });
```

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

##### profile?

> `readonly` `optional` **profile?**: [`Profile`](#profile-2) \| `null`

##### strict?

> `readonly` `optional` **strict?**: `boolean`

##### stripMllpFraming?

> `readonly` `optional` **stripMllpFraming?**: `boolean`

##### trimFields?

> `readonly` `optional` **trimFields?**: `boolean`

***

### Patient

PID-derived patient view. `msg.patient` is `undefined`
when no PID segment exists; this interface describes the shape when
present. `identifiers` and `phoneNumbers` are ALWAYS present as arrays,
empty when the underlying field is absent. `name` is
ALWAYS present even if `{}` when PID-5 is empty.

#### Example

```ts
import type { Patient } from "@cosyte/hl7";
const p: Patient = {
  mrn: "MRN123",
  identifiers: [{ idNumber: "MRN123", identifierTypeCode: "MR" }],
  name: { familyName: "Smith", givenName: "Jane" },
  familyName: "Smith",
  givenName: "Jane",
  fullName: "Jane Smith",
  phoneNumbers: [],
};
console.log(p.dateOfBirth?.raw, p.dateOfBirth?.precision);
```

#### Properties

##### address?

> `readonly` `optional` **address?**: [`XAD`](#xad-1)

PID-11 home address parsed as XAD.

##### dateOfBirth?

> `readonly` `optional` **dateOfBirth?**: [`DtmParts`](#dtmparts)

PID-7 date of birth as the fidelity `TS`. A day-only DOB keeps
`precision: "day"`: never coerced to a UTC-midnight instant that would
read as the previous day in a negative-offset zone.

##### ethnicity?

> `readonly` `optional` **ethnicity?**: [`CWE`](#cwe-1)

PID-22 ethnic group.

##### familyName?

> `readonly` `optional` **familyName?**: `string`

PID-5.1 flat family name convenience.

##### fullName?

> `readonly` `optional` **fullName?**: `string`

Composed Western-order name "Given Middle Family, Suffix".

##### givenName?

> `readonly` `optional` **givenName?**: `string`

PID-5.2 flat given name convenience.

##### identifiers

> `readonly` **identifiers**: readonly [`CX`](#cx-1)[]

Full PID-3 identifier list, each parsed as a CX. Always present.

##### language?

> `readonly` `optional` **language?**: [`CE`](#ce)

PID-15 primary language.

##### middleName?

> `readonly` `optional` **middleName?**: `string`

PID-5.3 mapped from `XPN.secondName`.

##### mrn?

> `readonly` `optional` **mrn?**: `string`

Medical record number picked via `pickMrn`.

##### name

> `readonly` **name**: [`XPN`](#xpn-1)

Full PID-5 parsed name (first repetition). Always present as `{}` when empty.

##### notes?

> `readonly` `optional` **notes?**: readonly `string`[]

NTE note lines positionally attached to the (first) PID: notes
immediately following the patient's PID segment, HL7-unescaped, in
document order. OMITTED when the patient carries no notes. High-PHI-risk
clinical narrative.

##### phoneNumbers

> `readonly` **phoneNumbers**: readonly [`XTN`](#xtn-1)[]

PID-13 (home) + PID-14 (business) repetitions concatenated. Always present.

##### race?

> `readonly` `optional` **race?**: [`CWE`](#cwe-1)

PID-10 race.

##### sex?

> `readonly` `optional` **sex?**: `string`

PID-8 administrative sex code.

***

### PL

HL7 v2 Person Location (PL): structured location per HL7 Chapter 2. All
11 v1 components are optional. Fields are OMITTED when the underlying
component is absent (exactOptionalPropertyTypes). `facility` uses the
nested `HD` shape; `assigningAuthorityForLocation` is flattened to a
plain string in v1 (HL7 spec treats it as HD-shaped).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. pointOfCare: e.g. "ICU", "ED"
2. room
3. bed
4. facility: nested HD (3 subcomponents form an HD composite)
5. locationStatus: O=Occupied, U=Unoccupied, K=Contaminated, C=Closed,
   H=Housekeeping, I=Isolated
6. personLocationType: C=Clinic, D=Department, H=Home, N=Nursing Unit,
   O=Office, R=Revenue Location
7. building
8. floor
9. locationDescription: free-text
10. comprehensiveLocationId
11. assigningAuthorityForLocation (v1: flattened to string)

#### Example

```ts
import type { PL } from "@cosyte/hl7";
const bed: PL = {
  pointOfCare: "ICU",
  room: "101",
  bed: "A",
  facility: { namespaceId: "HOSP", universalId: "1.2.3", universalIdType: "UUID" },
};
```

#### Properties

##### assigningAuthorityForLocation?

> `readonly` `optional` **assigningAuthorityForLocation?**: `string`

##### bed?

> `readonly` `optional` **bed?**: `string`

##### building?

> `readonly` `optional` **building?**: `string`

##### comprehensiveLocationId?

> `readonly` `optional` **comprehensiveLocationId?**: `string`

##### facility?

> `readonly` `optional` **facility?**: [`HD`](#hd-1)

##### floor?

> `readonly` `optional` **floor?**: `string`

##### locationDescription?

> `readonly` `optional` **locationDescription?**: `string`

##### locationStatus?

> `readonly` `optional` **locationStatus?**: `string`

##### personLocationType?

> `readonly` `optional` **personLocationType?**: `string`

##### pointOfCare?

> `readonly` `optional` **pointOfCare?**: `string`

##### room?

> `readonly` `optional` **room?**: `string`

***

### PredicateLocation

Where in the message a condition predicate reads: a structural coordinate,
a segment name plus the 1-indexed field, component and subcomponent
positions that narrow it. Every member is a name or an index, so a location
is inherently PHI-free and is safe to name in a finding.

The coordinate narrows from the outside in: a `component` needs a `field`,
and a `subcomponent` needs a `component`. A location that skips a level names
no addressable element and is refused as
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed), as is a location whose `segment` is
not a valid segment name.

**A comparison statement needs a `field`.** A segment on its own has no
single content to compare, so a [ComparisonPredicate](#comparisonpredicate) whose location
stops at the segment is also `PROFILE_MALFORMED`. A
[PresencePredicate](#presencepredicate) may stop there: it asks whether the segment occurs.

#### Example

```ts
import type { PredicateLocation } from "@cosyte/hl7";
const completionStatus: PredicateLocation = { segment: "RXA", field: 20 };
const identifier: PredicateLocation = { segment: "RXA", field: 9, component: 1 };
```

#### Properties

##### component?

> `readonly` `optional` **component?**: `number`

1-indexed component within the field. Requires `field`.

##### field?

> `readonly` `optional` **field?**: `number`

1-indexed HL7 field position (e.g. `20` for RXA-20). Omitted targets the segment itself.

##### segment

> `readonly` **segment**: `string`

Segment name: 3 chars, `[A-Z][A-Z0-9]{2}` (standard or `Z…` segment).

##### subcomponent?

> `readonly` `optional` **subcomponent?**: `number`

1-indexed subcomponent within the component. Requires `component`.

***

### PresencePredicate

A presence statement: does the element at `location` carry content?

Content is read at or below the location, so a field-only location is valued
when any subcomponent of any component of any repetition is non-empty, and a
segment-only location is valued when the segment occurs at all. This is the
same reading of "present" the engine's `R` and `X` checks use.

#### Example

```ts
import type { PresencePredicate } from "@cosyte/hl7";
// "IF RXA-9.1 (Identifier) is valued"
const predicate: PresencePredicate = {
  location: { segment: "RXA", field: 9, component: 1 },
  presence: "is valued",
};
```

#### Properties

##### location

> `readonly` **location**: [`PredicateLocation`](#predicatelocation)

The element the statement asks about.

##### presence

> `readonly` **presence**: [`PredicatePresence`](#predicatepresence)

Which of the two presence statements this is.

***

### Profile

Structural placeholder for HL7 profiles. A profile bundles vendor-specific
tolerances, date formats, custom segment definitions, and optional
callbacks. Profiles are built with the `defineProfile()` factory.

`customSegments` is narrowed to the locked `CustomSegmentDefinition` shape,
and `Profile` carries an optional `describe?` method
so `defineProfile()`-produced profiles can be introspected without
consumers needing to narrow away from the `Profile` type. The `describe`
method is only populated by `defineProfile()`: hand-authored `Profile`
objects may omit it.

#### Example

```ts
import type { Profile } from "@cosyte/hl7";
const epic: Profile = {
  name: "epic",
  description: "Epic-specific quirks and date formats",
  dateFormats: ["YYYYMMDDHHmmss", "YYYYMMDD"],
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
  },
  segmentOverrides: {
    PID: { fields: { siteMrn: 19 } },
  },
};
```

#### Properties

##### customSegments?

> `readonly` `optional` **customSegments?**: `Readonly`\<`Record`\<`string`, [`CustomSegmentDefinition`](#customsegmentdefinition)\>\>

##### dateFormats?

> `readonly` `optional` **dateFormats?**: readonly `string`[]

Date formats this vendor writes. Merged after `ParseOptions.dateFormats`
and honoured on every datetime the library returns, exactly as the option
form is.

##### describe?

> `readonly` `optional` **describe?**: () => `string`

###### Returns

`string`

##### description?

> `readonly` `optional` **description?**: `string`

##### lineage?

> `readonly` `optional` **lineage?**: readonly `string`[]

##### name

> `readonly` **name**: `string`

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

##### segmentOverrides?

> `readonly` `optional` **segmentOverrides?**: `Readonly`\<`Record`\<`string`, [`CustomSegmentDefinition`](#customsegmentdefinition)\>\>

Site-specific field NAMES bound to positions on STANDARD HL7 v2 segments,
keyed by canonical segment name (`PID`, `AL1`, `MSH`, ...). A separate map
from [Profile.customSegments](#customsegments-2), which stays Z-segment-only: a
standard name appearing there would change which segments the parser
treats as profile-claimed, and an author skimming a profile literal can
see at a glance which declarations touch standard clinical fields.

Read-side aliases, and ADDITIVE ONLY. A declaration here creates a new
name for `Segment.get(name)` to resolve on segments of that type, and
changes no existing read: positional access, dot-paths, the typed clinical
accessors, the warning list and both serializations are what they were
without it.

***

### ProfiledMessage

A parsed message whose applied profile is statically known: every
[Hl7Message](#hl7message) member unchanged, with the segment-type-keyed accessors
scoped so a segment of a declared type exposes that type's declared field
names to [Segment.get](#get-1).

It is a view, not a subclass: the parse allocates nothing extra and behaves
identically. Segments reached any other way (the undifferentiated
[Hl7Message.allSegments](#allsegments) walk) keep the `string`-accepting reader,
because the segment type is not knowable from a walk.

#### Example

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const epic = defineProfile({
  name: "epic",
  customSegments: { ZDP: { fields: { departmentCode: 3, departmentName: 4 } } },
});
const msg = parseHL7(raw, epic);
const zdp = msg.part("ZDP");
console.log(zdp?.get("departmentCode")?.value); // narrowed, no cast
// zdp?.get("departmentCod"); // does not compile: not a declared ZDP name
console.log(msg.part("PID")?.field(5).value); // undeclared type: any name compiles
```

#### Extends

- [`Hl7Message`](#hl7message)

#### Type Parameters

##### P

`P`

#### Properties

##### dateFormats

> `readonly` **dateFormats**: readonly `string`[]

Merged `dateFormats` list: `options.dateFormats ++ profile.dateFormats`
deduped first-occurrence. Empty array when neither source
supplied any formats. This is the list every datetime in the message
honours, from `meta.timestamp` to any `field.asTs()`, in exactly this
order; exposed so a caller can introspect what their options and profile
added up to.

###### Inherited from

[`ProfiledMessage`](#profiledmessage).[`dateFormats`](#dateformats-7)

##### encodingCharacters

> `readonly` **encodingCharacters**: [`EncodingCharacters`](#encodingcharacters-1)

###### Inherited from

[`Hl7Message`](#hl7message).[`encodingCharacters`](#encodingcharacters)

##### profile

> `readonly` **profile**: \{ `lineage`: readonly `string`[]; `name`: `string`; \} \| `undefined`

###### Inherited from

[`Hl7Message`](#hl7message).[`profile`](#profile)

##### rawSegments

> `readonly` **rawSegments**: readonly [`RawSegment`](#rawsegment)[]

Raw positional tree produced by the parser. 1-indexed per HL7 convention
(`fields[0]` is the segment-name / MSH separator placeholder slot). Use
`segments(type)` / `allSegments()` for typed wrapper access: this field
is exposed for advanced callers that need the raw tree directly.

On a lazily parsed message (the default), the first read builds every segment that has not
been read yet, so the whole tree is held from then on. To read a few segments of a long
message, use `segments(type)`, `part(type)` or `get(path)`, which build only what they reach.

###### Inherited from

[`ProfiledMessage`](#profiledmessage).[`rawSegments`](#rawsegments-1)

##### version

> `readonly` **version**: `string`

HL7 version the model asserts for this message, from MSH-12.1.1, e.g.
`"2.5"` or `"2.5.1"`.

**Bounded, and it is `"<withheld>"` when MSH-12 does not hold a version.**
Same reasoning as [Segment.type](#type): it presents as an identifier and
consumers label with it. `meta.version` keeps MSH-12 exactly as it
arrived, and is what version-scoped field selection reads, so this bound
changes no parsing behaviour.

###### Inherited from

[`Hl7Message`](#hl7message).[`version`](#version)

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

###### Inherited from

[`ProfiledMessage`](#profiledmessage).[`warnings`](#warnings-3)

#### Accessors

##### meta

###### Get Signature

> **get** **meta**(): [`Meta`](#meta-1)

MSH-derived message metadata (type, controlId, timestamp, version, etc.).
Plain object. Memoized: `msg.meta === msg.meta` across
reads until mutation invalidates. Always defined (MSH absence
throws `NO_MSH_SEGMENT` at parse time).

###### Example

```ts
console.log(msg.meta.type);                     // "ADT^A01"
console.log(msg.meta.timestamp?.raw);           // fidelity TS
console.log(msg.meta.controlId);                // "MSG001"
```

###### Returns

[`Meta`](#meta-1)

###### Inherited from

[`Hl7Message`](#hl7message).[`meta`](#meta)

##### patient

###### Get Signature

> **get** **patient**(): [`Patient`](#patient-8) \| `undefined`

PID-derived patient view, or `undefined` when no PID segment exists.
Memoized. Never throws: absent fields
surface as `undefined` on the returned `Patient` object.

###### Example

```ts
console.log(msg.patient?.mrn);
console.log(msg.patient?.fullName);
console.log(msg.patient?.dateOfBirth?.raw); // fidelity TS: e.g. "19800115"
```

###### Returns

[`Patient`](#patient-8) \| `undefined`

###### Inherited from

[`Hl7Message`](#hl7message).[`patient`](#patient)

##### structure

###### Get Signature

> **get** **structure**(): [`MessageStructure`](#messagestructure)

Structural-conformance summary for the common message types: a
misroute/truncation safety net, NOT a conformance validator.
Reports, per the message's recognized (MSH-9.1, MSH-9.2) type, which
Required segment groups are present and which are entirely absent
(`missingGroups`: the same set the parser flags as
`MISSING_EXPECTED_GROUP` warnings). For an unmodelled type, `recognized`
is `false` and `missingGroups` is empty. Memoized.

###### Example

```ts
console.log(msg.structure.recognized);    // true for ORU^R01, ADT^A01, …
console.log(msg.structure.missingGroups); // e.g. ["result"] if no OBR/OBX
```

###### Returns

[`MessageStructure`](#messagestructure)

###### Inherited from

[`Hl7Message`](#hl7message).[`structure`](#structure)

##### visit

###### Get Signature

> **get** **visit**(): [`Visit`](#visit-7) \| `undefined`

PV1-derived visit view, or `undefined` when no PV1 segment exists.
Memoized. Never throws.

###### Example

```ts
console.log(msg.visit?.patientClass);                 // "I"
console.log(msg.visit?.admitDateTime?.raw); // fidelity TS
console.log(msg.visit?.attendingDoctor?.familyName);
```

###### Returns

[`Visit`](#visit-7) \| `undefined`

###### Inherited from

[`Hl7Message`](#hl7message).[`visit`](#visit)

#### Methods

##### addSegment()

> **addSegment**(`name`, `fields`): `this`

Append a new segment to the end of the message. `name` must match
`/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u`: throws `TypeError` otherwise.

`fields` is interpreted in HL7 1-indexed terms: `addSegment("NTE", [a, b, c])`
produces a segment whose `NTE-1 = a`, `NTE-2 = b`, `NTE-3 = c`. The
internal `RawSegment.fields[0]` name/separator placeholder is synthesized
by this method.

Each entry may be a plain string (treated as a single-subcomponent
single-component single-repetition field) or a full `RawField` object
for advanced callers who need structured content.

Invalidates caches on return; warnings untouched.

###### Parameters

###### name

`string`

###### fields

readonly (`string` \| [`RawField`](#rawfield))[]

###### Returns

`this`

###### Example

```ts
msg.addSegment("NTE", ["", "note text"]);
msg.get("NTE.2"); // "note text"
```

###### Inherited from

[`Hl7Message`](#hl7message).[`addSegment`](#addsegment)

##### allergies()

> **allergies**(): readonly [`Allergy`](#allergy)[]

Every AL1 and every IAM as an Allergy, one entry per segment in document
order, each naming the segment it was read from (`source`). An ADT^A60
carries its allergies in IAM, so it is read here too. Returns `[]`
when neither is present.

Limits: the IAR and NTE segments under an IAM are not read, nor IAM-1 or
IAM-8 onward (reach them with `msg.segments("IAM")`). IAM-6 is surfaced as
`actionCode`, and an exact `D` sets `deleteRequested`, but no action is ever
applied: a delete entry is still returned, an update never replaces an
earlier entry, and an AL1 and an IAM for the same allergen are two entries.

###### Returns

readonly [`Allergy`](#allergy)[]

###### Example

```ts
for (const al of msg.allergies()) {
  const kind = al.deleteRequested === true ? "delete request" : "allergy";
  console.log(kind, al.source, al.code?.text, al.severity, al.actionCode);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`allergies`](#allergies)

##### allSegments()

> **allSegments**(): readonly [`Segment`](#segment)\<`string`\>[]

Iterate every `Segment` in document order (MSH first, then every
subsequent segment). Cached per-message; same array reference and same
Segment instances on repeat calls. Invalidated wholesale by
the mutation methods.

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
for (const seg of msg.allSegments()) {
  console.log(seg.type);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`allSegments`](#allsegments)

##### appointments()

> **appointments**(): readonly [`Appointment`](#appointment)[]

Every SCH of an SIU message as a typed `Appointment`, with
the AIS/AIG/AIL/AIP resource segments that follow it grouped positionally
under that SCH. Surfaces the placer/filler appointment ids, SCH-25 filler
status (Table 0278), SCH-11 start/end timing, and the resource groups
(service / general / location / personnel). Returns `[]` when no SCH
is present. Not memoized. Never throws. Not a
scheduling-workflow state machine: see the package known-limitations.

###### Returns

readonly [`Appointment`](#appointment)[]

###### Example

```ts
for (const appt of msg.appointments()) {
  console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier);
  for (const r of appt.resources) console.log(r.kind, r.code?.identifier);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`appointments`](#appointments)

##### charges()

> **charges**(): readonly [`Charge`](#charge)[]

Every FT1 of a DFT message as a typed `Charge`, one per
FT1 in document order. Surfaces billing-critical fields (FT1-6 transaction
type, FT1-7 code, FT1-11/12 extended/unit amount, FT1-19 diagnosis linkage)
with **no billing logic and no money-as-float**: amounts are the verbatim
CP wire text. Returns `[]` when no FT1 is present. Not memoized.
Never throws.

###### Returns

readonly [`Charge`](#charge)[]

###### Example

```ts
for (const charge of msg.charges()) {
  console.log(charge.transactionType, charge.transactionCode?.identifier);
  console.log(charge.amountExtended); // verbatim, never a number
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`charges`](#charges)

##### diagnoses()

> **diagnoses**(): readonly [`Diagnosis`](#diagnosis)[]

Every DG1 as a Diagnosis in document order. Returns `[]` when no
DG1 present.

###### Returns

readonly [`Diagnosis`](#diagnosis)[]

###### Example

```ts
for (const dg of msg.diagnoses()) console.log(dg.code?.identifier);
```

###### Inherited from

[`Hl7Message`](#hl7message).[`diagnoses`](#diagnoses)

##### documents()

> **documents**(): readonly [`ClinicalDocument`](#clinicaldocument)[]

Every TXA of an MDM message as a typed `ClinicalDocument`,
with the OBX narrative body grouped positionally under that TXA. The
completion status (TXA-17) and availability status (TXA-19) are surfaced as
**distinct** fields and never conflated: a document can be available before
it is authenticated, and reading a preliminary document as final is the
harm. Returns `[]` when no TXA is present. Not memoized. Never
throws.

###### Returns

readonly [`ClinicalDocument`](#clinicaldocument)[]

###### Example

```ts
for (const doc of msg.documents()) {
  console.log(doc.documentType, doc.completionStatus, doc.availabilityStatus);
  for (const obx of doc.observations) console.log(obx.value); // narrative body
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`documents`](#documents)

##### get()

> **get**(`path`): `string` \| `undefined`

Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
decoded leaf string (unescaped once at parse: never re-unescaped on
read). Returns `undefined` when the path doesn't
resolve: never throws on missing path. Throws `TypeError`
on malformed path syntax (e.g. `"pid.5"`, empty string).

###### Parameters

###### path

`string`

###### Returns

`string` \| `undefined`

###### Example

```ts
const msg = parseHL7(raw);
msg.get("PID.5.1");  // "Smith"
msg.get("OBX[2].5"); // third OBX's 5th field
msg.get("NOT.9.9");  // undefined
msg.get("MSH.12");   // "2.5": HL7 version string
```

###### Inherited from

[`Hl7Message`](#hl7message).[`get`](#get)

##### getAll()

> **getAll**\<`S`\>(`segmentType`): readonly [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\>[]

Alias for [ProfiledMessage.segments](#segments-2), with the same narrowing.

###### Type Parameters

###### S

`S` *extends* `string`

###### Parameters

###### segmentType

`S`

###### Returns

readonly [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\>[]

###### Overrides

[`Hl7Message`](#hl7message).[`getAll`](#getall)

##### identityEvents()

> **identityEvents**(): readonly [`IdentityEvent`](#identityevent)[]

Every recognized ADT patient-identity event (merge / move / change /
link / unlink / person add/update), with the MRG-sourced
`prior` and PID/PV1-sourced `surviving` parties labelled by role and the
spec-constant `direction: "MRG_TO_PID"` on merge/move/change events.
Returns `[]` when the trigger event is not in the identity family. The
recognized set is floored by the published message structures: every ADT
trigger event whose structure requires MRG is recognized. Not
memoized. Never throws; incomplete merge pairs surface a
`MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on the event.

###### Returns

readonly [`IdentityEvent`](#identityevent)[]

###### Example

```ts
for (const ev of msg.identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving) {
    // retire ev.prior.identifiers in favour of ev.surviving.identifiers
  }
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`identityEvents`](#identityevents)

##### immunizations()

> **immunizations**(): readonly [`Immunization`](#immunization)[]

Every RXA of a VXU^V04 as a typed `Immunization`, with RXR (route/site)
and OBX children grouped positionally under the RXA and `orderControl`
from the preceding ORC of the VXU order group. Returns
`[]` when no RXA present. Not memoized. The vaccine code
carries its own provenance; the action code (RXA-21) is surfaced verbatim
and `recordOrigin` (administered vs historical) is derived only from the
well-known NIP001 RXA-9.1 codes: never guessed.

###### Returns

readonly [`Immunization`](#immunization)[]

###### Example

```ts
for (const imm of msg.immunizations()) {
  console.log(imm.vaccineCode?.identifier, imm.doseAmount, imm.recordOrigin);
  console.log(imm.actionCode, imm.completionStatus);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`immunizations`](#immunizations)

##### insurance()

> **insurance**(): readonly [`Insurance`](#insurance-1)[]

Every IN1 as an Insurance entry with positional IN2/IN3 presence flags.
Returns `[]` when no IN1 present.

###### Returns

readonly [`Insurance`](#insurance-1)[]

###### Example

```ts
for (const ins of msg.insurance()) console.log(ins.planId?.text);
```

###### Inherited from

[`Hl7Message`](#hl7message).[`insurance`](#insurance)

##### is()

**`Internal`**

Single runtime implementation behind both signatures.

###### Call Signature

> **is**\<`K`\>(`key`): `this is TypedMessage<K>`

Is this message of the type `key` names, and if so, narrow it for the
compiler. The check is on the (MSH-9.1, MSH-9.2) pair the parser already
extracted, so a message whose MSH-9 carries the three-component form
`ADT^A01^ADT_A01` answers `true` to `is("ADT^A01")`.

A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a
message type the published structure registry matches on message code alone
(`"ACK"`, whose MSH-9.2 carries the acknowledged message's trigger event).
`SUPPORTED_OVERLAY_MESSAGES` enumerates every key.

**Any other string is `false`, never a throw**: an unrecognized type, the
three-component form as a string, an empty string, or a value computed at
run time. `is` does not parse its own argument, and a caller who wants a raw
comparison has `msg.meta.type`.

Read-only: it inspects `meta` and mutates nothing.

###### Type Parameters

###### K

`K` *extends* keyof [`OverlayStructures`](#overlaystructures)

###### Parameters

###### key

`K`

###### Returns

`this is TypedMessage<K>`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
if (msg.is("ORU^R01")) {
  const code: "ORU" = msg.meta.messageCode; // literal, no cast
  console.log(msg.part("OBR")?.field(4).value);
}
console.log(msg.is("ZZZ^Z99")); // false: not a published key
```

###### Inherited from

[`Hl7Message`](#hl7message).[`is`](#is)

###### Call Signature

> **is**(`key`): `boolean`

Answer for a key that is not known at compile time. A runtime-computed
string cannot narrow anything, so this form returns a plain `boolean`.

###### Parameters

###### key

`string`

###### Returns

`boolean`

###### Inherited from

[`Hl7Message`](#hl7message).[`is`](#is)

##### medications()

> **medications**(): readonly [`Medication`](#medication)[]

Every RXO/RXE/RXD/RXA as a typed `Medication`, with RXR (route) and RXC
(component) segments grouped positionally under their parent. Returns
`[]` when no RX* parent present. Not memoized. The give
*amount* and give *strength* are surfaced separately and never
reconciled.

Each medication also carries its TQ1 / legacy embedded-TQ (RXE-1) `timings`
(repeat pattern verbatim, never resolved to a schedule).

Each medication also carries `orderControl`: ORC-1 of the ORC that opened
its order group (every RX* up to the next ORC shares it), exactly as sent.
It is never interpreted into an active, held or discontinued state, and it
is omitted when no ORC precedes the RX* or ORC-1 is empty, never carried
over from an earlier group.

###### Returns

readonly [`Medication`](#medication)[]

###### Example

```ts
for (const med of msg.medications()) {
  console.log(med.orderControl); // e.g. "NW" (new) or "DC" (discontinue), verbatim
  console.log(med.context, med.giveCode?.identifier, med.giveCode?.nameOfCodingSystem);
  console.log(med.amount?.minimum, med.strength?.value);
  for (const t of med.timings) console.log(t.repeatPattern?.code, t.totalOccurrences);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`medications`](#medications)

##### nextOfKin()

> **nextOfKin**(): readonly [`NextOfKin`](#nextofkin-1)[]

Every NK1 as a NextOfKin entry in document order. Returns `[]`
when no NK1 present.

###### Returns

readonly [`NextOfKin`](#nextofkin-1)[]

###### Example

```ts
for (const nk of msg.nextOfKin()) {
  console.log(nk.name?.familyName, nk.relationship?.text);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`nextOfKin`](#nextofkin)

##### notes()

> **notes**(): readonly `string`[]

Message-level NTE notes: every NTE segment with no recognized
preceding parent (not immediately following a `PID`, `ORC`, `OBR`, or
`OBX`), surfaced verbatim in document order so nothing is dropped. Notes
that DO attach to a specific patient / order / result are exposed on those
helper outputs (`msg.patient?.notes`, `order.notes`, `observation.notes`),
not here. Returns `[]` when there are none. NOT memoized.

###### Returns

readonly `string`[]

###### Example

```ts
for (const note of msg.notes()) console.log(note); // message-level narrative
```

###### Inherited from

[`Hl7Message`](#hl7message).[`notes`](#notes)

##### observations()

> **observations**(): readonly [`Observation`](#observation)[]

Every OBX segment as a typed Observation in document order. Returns
`[]` when no OBX present. NOT memoized: each call
re-walks `rawSegments`. Value type is discriminated.

###### Returns

readonly [`Observation`](#observation)[]

###### Example

```ts
for (const obs of msg.observations()) {
  if (obs.valueType === "NM") console.log(obs.value); // number | undefined
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`observations`](#observations)

##### orders()

> **orders**(): readonly [`Order`](#order-1)[]

Every OBR as an Order with its OBX children grouped positionally and
its TQ1 / legacy embedded-TQ (ORC-7) `timings` (the repeat pattern is
surfaced verbatim, never resolved to a schedule). Returns `[]` when no
OBR present. Not memoized.

###### Returns

readonly [`Order`](#order-1)[]

###### Example

```ts
for (const order of msg.orders()) {
  console.log(order.placerOrderNumber, order.observations.length);
  for (const t of order.timings) console.log(t.repeatPattern?.code); // e.g. "Q6H": verbatim
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`orders`](#orders)

##### part()

> **part**\<`S`\>(`segmentType`): [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\> \| `undefined`

The first segment of `segmentType`, with that type's declared field names.

###### Type Parameters

###### S

`S` *extends* `string`

###### Parameters

###### segmentType

`S`

###### Returns

[`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\> \| `undefined`

###### Overrides

[`Hl7Message`](#hl7message).[`part`](#part)

##### parts()

> **parts**\<`S`\>(`segmentType`): readonly [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\>[]

Every segment of `segmentType`, with that type's declared field names.

###### Type Parameters

###### S

`S` *extends* `string`

###### Parameters

###### segmentType

`S`

###### Returns

readonly [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\>[]

###### Overrides

[`Hl7Message`](#hl7message).[`parts`](#parts)

##### prettyPrint()

> **prettyPrint**(): `string`

Emit this message as a human-readable multi-line string for logs and
debugging. Single opinionated format (no options):
header line with type / controlId / timestamp / segment count, then
one line per segment with labeled `[N]=value` fields. Composite
values render as their raw HL7 string: depth stops at field level.
Pure: never warns, never throws.

**Field values render as their raw HL7 string representation.**
Embedded delimiters in user data appear as escape sequences: e.g.
a patient family name containing `|` renders as `Smith\F\Jones`
(NOT `Smith|Jones`). This preserves round-trip fidelity: copy-pasting
prettyPrint output into `parseHL7` yields a structurally equivalent
message. For un-escaped human display, parse the composite first via
typed accessors (e.g. `msg.patient?.familyName`): those return
already-decoded strings.

###### Returns

`string`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.prettyPrint());
// HL7 ADT^A01  controlId=MSG001  timestamp=2026-04-19T10:15:00Z  (5 segments)
// MSH  [3]=SENDAPP  [4]=SENDFAC  ...
// PID  [1]=1  [3]=MRN123  [5]=Doe^John
```

###### Inherited from

[`Hl7Message`](#hl7message).[`prettyPrint`](#prettyprint)

##### removeSegment()

> **removeSegment**(`segmentType`, `occurrenceOrOptions?`): `this`

Remove segments by type + occurrence or by type + all. Call shapes:

- `removeSegment("NTE")`: remove the FIRST NTE (occurrence 0).
- `removeSegment("OBX", 1)`: remove the SECOND OBX (0-indexed).
- `removeSegment("OBX", { all: true })`: remove ALL OBX segments.

`MSH` is protected: `removeSegment("MSH")` throws `TypeError` (every
HL7 message must retain its MSH segment). Unknown segment types are a
no-op (idempotent; no throw). Segment name must match the same shape
regex: invalid shapes throw `TypeError` for symmetry with `addSegment`.

Invalidates caches on return; warnings untouched.

###### Parameters

###### segmentType

`string`

###### occurrenceOrOptions?

`number` \| \{ `all?`: `boolean`; \}

###### Returns

`this`

###### Example

```ts
msg.removeSegment("NTE");                // remove first NTE
msg.removeSegment("OBX", 1);             // remove second OBX
msg.removeSegment("OBX", { all: true }); // remove all remaining OBX
```

###### Inherited from

[`Hl7Message`](#hl7message).[`removeSegment`](#removesegment)

##### segments()

> **segments**\<`S`\>(`segmentType`): readonly [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\>[]

Every segment of `segmentType`, with that type's declared field names.

###### Type Parameters

###### S

`S` *extends* `string`

###### Parameters

###### segmentType

`S`

###### Returns

readonly [`Segment`](#segment)\<[`ProfileFieldName`](#profilefieldname)\<`P`, `S`\>\>[]

###### Overrides

[`Hl7Message`](#hl7message).[`segments`](#segments)

##### setComposite()

> **setComposite**\<`K`\>(`path`, `kind`, `value`): `this`

Set a **typed composite** at a field (or field-repetition) dot-path:
the conservative-emit mirror of the typed read accessors
(`asXpn`/`asCx`/…). The caller passes a structured value (an XPN name, a CX
identifier, a TS timestamp, …) by its [CompositeKind](#compositekind), and the setter
encodes it into a spec-clean field using the encode-safe path: any
delimiter embedded in a component value is **escaped, never injected**, so
a `familyName` of `"Smith^Jr"` re-parses to exactly that string rather than
forging a component boundary. No hand-assembly of `^`/`&`/`~`.

The path must resolve to a **field** (`"PID.5"`) or a specific
**repetition** of a field (`"PID.11[1]"`). A component/subcomponent-level
path (`"PID.5.1"`) is rejected with `TypeError`: a composite occupies a
whole field, not a single component. Like [setField](#setfield), the target
segment must already exist (`addSegment` first); the repetition defaults to
index 0 and other repetitions of the field are preserved.

Never fabricates: an omitted optional composite field encodes to an
empty/absent component, never a defaulted value; an all-empty composite
clears the field. Segment/helper caches are invalidated on success; the
frozen `warnings` array is untouched.

###### Type Parameters

###### K

`K` *extends* [`CompositeKind`](#compositekind)

###### Parameters

###### path

`string`

###### kind

`K`

###### value

[`CompositeValueByKind`](#compositevaluebykind)\[`K`\]

###### Returns

`this`

###### Example

```ts
const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
msg.setComposite("PID.5", "XPN", { familyName: "Smith", givenName: "Ann" });
msg.setComposite("PID.3", "CX", { idNumber: "MRN001", identifierTypeCode: "MR" });
msg.setComposite("PID.7", "TS", "19880705");
msg.get("PID.5.1"); // "Smith"
```

###### Inherited from

[`Hl7Message`](#hl7message).[`setComposite`](#setcomposite)

##### setField()

> **setField**(`path`, `value`): `this`

Set the string value at a dot-path. Mutates the underlying tree and
returns `this` for chaining. Auto-creates missing repetitions,
components, and subcomponents WITHIN an existing field, but does NOT
auto-create segments: callers must `addSegment` first (throws
`TypeError` with an actionable message otherwise).

The value is accepted verbatim: unescaped delimiter characters are NOT
rejected on input. Re-escaping is the serializer's concern.

MSH-1 / MSH-2 follow the user-facing HL7 convention: `setField("MSH.3", ...)`
targets MSH-3 (sending application), matching `msg.get("MSH.3")`.

Segment/Field wrapper caches are invalidated wholesale on success.
The frozen `warnings` array is never touched.

###### Parameters

###### path

`string`

###### value

`string`

###### Returns

`this`

###### Example

```ts
msg.setField("PID.8", "F");           // patient sex → F
msg.setField("PID.5.1", "Jones");     // family name
msg.setField("PID.4[2].1", "MRN2");   // create third repetition of PID-4
```

###### Inherited from

[`Hl7Message`](#hl7message).[`setField`](#setfield)

##### toJSON()

> **toJSON**(): [`SerializedMessage`](#serializedmessage)

Emit this message as a structured `SerializedMessage` JSON projection.
Invoked automatically by `JSON.stringify(msg)`.
Re-walks `rawSegments` on every call (no caching), so on a lazily
parsed message it builds every segment not read yet. Mirrors the
raw tree one-for-one, preserves `isNull`, always includes
`warnings: []`, and includes `profile: { name, lineage }` only when
`this.profile` is truthy. Pure: never warns, never throws.

###### Returns

[`SerializedMessage`](#serializedmessage)

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
const snap = msg.toJSON();
console.log(snap.segments[0]?.name); // "MSH"
console.log(JSON.stringify(msg));     // same content, auto-invokes toJSON
```

###### Inherited from

[`Hl7Message`](#hl7message).[`toJSON`](#tojson)

##### toString()

> **toString**(): `string`

Emit this message as spec-clean HL7. Re-walks `rawSegments`
on every call (no caching), so on a lazily parsed message it builds
every segment not read yet. Segments are joined with `\r`;
MSH-1 and MSH-2 are inlined verbatim from
`this.encodingCharacters`; every field string passes through
`reescape`. `RawField.isNull === true` is preserved as the
HL7 literal `""`. Pure: never warns, never throws.

###### Returns

`string`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.toString()); // spec-clean, CR-separated HL7
```

###### Inherited from

[`Hl7Message`](#hl7message).[`toString`](#tostring)

***

### PT

HL7 v2 Processing Type (PT): per HL7 Chapter 2. Both components are
optional.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. processingId (HL7 Table 0103: P production, T training, D debugging)
2. processingMode (HL7 Table 0207: A archive, R restore, I initial load,
   T current processing; empty means current processing)

Used by MSH-11. `msg.meta.processingId` keeps reading MSH-11.1 alone.

#### Example

```ts
import type { PT } from "@cosyte/hl7";
const processing: PT = { processingId: "P", processingMode: "T" };
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 2nd, preserved verbatim and in order. OMITTED when
there are none.

##### processingId?

> `readonly` `optional` **processingId?**: `string`

PT.1 Processing ID.

##### processingMode?

> `readonly` `optional` **processingMode?**: `string`

PT.2 Processing Mode.

***

### RawComponent

A single component inside a repetition: the most deeply nested data
layer in the HL7 positional tree. A component is an ordered list of
subcomponent strings (subcomponent separator `&` by default).

#### Example

```ts
import type { RawComponent } from "@cosyte/hl7";
const comp: RawComponent = { subcomponents: ["Smith", "John"] };
```

#### Properties

##### rawSubcomponents?

> `readonly` `optional` **rawSubcomponents?**: readonly (`string` \| `undefined`)[]

**`Internal`**

Escape-fidelity overlay, positionally aligned with [subcomponents](#subcomponents):
for each index, the subcomponent's **original wire bytes** to emit
verbatim instead of re-escaping the decoded form. An entry is present
(non-`undefined`) only when a subcomponent carried an escape whose decoded
form does not re-escape back to the exact wire bytes: i.e. a recognize-
and-preserve escape (`\H\`, `\Z..`, charset/formatting) or a hex escape
(`\X41\`, or non-canonical hex casing). Delimiter escapes (`\F`→`|`) round-
trip through `reescape` unchanged and get no overlay. The whole field is
absent when no subcomponent needs it (the overwhelming common case), so a
plain message's raw tree is byte-for-byte the shape it was before this
overlay existed.

Consumed only by the serializer ("src/serialize/emit-field.ts");
never read by the value/coercion surface, so it changes no decoded value.

##### subcomponents

> `readonly` **subcomponents**: readonly `string`[]

The component's subcomponents, **HL7-decoded**: the tokenizer expands
escape sequences on parse so consumers read literal values (`Smith|Jones`,
not `Smith\F\Jones`). This is the value surface every reader uses
(`Field.value`, the composite parsers, dot-path, `toJSON`).

***

### RawField

A positional field inside a segment. Carries its repetitions plus an
`isNull` discriminant that distinguishes the HL7 explicit null (`""`, a
two-character literal double quote) from an empty field (no content
between delimiters).

#### Example

```ts
import type { RawField } from "@cosyte/hl7";
const nullField: RawField = { repetitions: [], isNull: true };
const emptyField: RawField = { repetitions: [], isNull: false };
```

#### Properties

##### isNull

> `readonly` **isNull**: `boolean`

##### repetitions

> `readonly` **repetitions**: readonly [`RawRepetition`](#rawrepetition)[]

***

### RawRepetition

A single repetition inside a field: HL7 fields may repeat using the
repetition separator (`~` by default). Each repetition is an ordered list
of components.

#### Example

```ts
import type { RawRepetition } from "@cosyte/hl7";
const rep: RawRepetition = { components: [{ subcomponents: ["Smith"] }] };
```

#### Properties

##### components

> `readonly` **components**: readonly [`RawComponent`](#rawcomponent)[]

***

### RawSegment

A parsed HL7 segment: the top level of the positional tree. The `name`
is the three-character segment identifier (`MSH`, `PID`, `ZPI`, ...) and
`fields` is the 1-indexed positional field array (see the JSDoc on
`fields` for the index 0 slot convention).

#### Example

```ts
import type { RawSegment } from "@cosyte/hl7";
const pid: RawSegment = {
  name: "PID",
  fields: [
    { repetitions: [], isNull: false },
  ],
};
```

#### Properties

##### fields

> `readonly` **fields**: readonly [`RawField`](#rawfield)[]

Positional fields array using HL7 1-indexed convention for ALL segments.

- `fields[0]` is the segment name / separator placeholder slot (never a
  data field).
- `fields[N]` for N \>= 1 is the HL7 N-th field.

Examples:

- MSH: `fields[0]` = field-separator char, `fields[1]` = MSH-2 (encoding
  chars), `fields[2]` = MSH-3, ..., `fields[11]` = MSH-12.
- PID: `fields[0]` = "PID" name placeholder, `fields[1]` = PID-1,
  `fields[2]` = PID-2, ....

##### name

> `readonly` **name**: `string`

***

### ReadSegmentItem

One segment `readSegments()` yields: the segment, its index in the message, and the warnings
`parseHL7` reports about it, in the order it reports them. The first item also carries the
warnings about the message's bytes and framing that `parseHL7` reports before any segment, and
the last item the warnings that need the whole message: a segment its structure requires and
that never came, and framing bytes first seen after the first segment.

#### Example

```ts
import { readSegments } from "@cosyte/hl7";

for await (const { segment, warnings } of readSegments(source)) {
  if (segment.type === "OBX") store(segment.field(5).value);
  for (const w of warnings) log(w.code);
}
```

#### Properties

##### index

> `readonly` **index**: `number`

Its index in the message: 0 is MSH.

##### segment

> `readonly` **segment**: [`Segment`](#segment)

The segment, built in full.

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

The warnings about it, frozen.

***

### RenderedText

The normalized display model produced by [renderText](#rendertext): a flat
plain-text string plus the structured highlight-aware runs, plus an
honesty list of the escape sequences that were preserved rather than
rendered.

#### Properties

##### runs

> `readonly` **runs**: readonly [`TextRun`](#textrun)[]

The structured, highlight-aware form: `{ text, highlighted }` runs in
document order. Empty runs are elided. Use this to preserve emphasis
(bold / reverse-video / etc.) that the flat [text](#text-4) drops.

##### text

> `readonly` **text**: `string`

The full plain-text normalization: formatting commands become
whitespace / line breaks and highlight boundaries are dropped. This is
the string to show a human or feed a downstream `.text`. Equal to the
concatenation of every [runs](#runs) entry's `text`.

##### unrenderedSequences

> `readonly` **unrenderedSequences**: readonly `string`[]

The escape sequences `renderText` **preserved verbatim instead of
rendering**: vendor `\Zdddd…\`, charset switches `\Cxxyy`/`\Mxxyyzz`,
and any malformed / unterminated sequence. Their literal characters ALSO
appear in [text](#text-4)/[runs](#runs) (never silently dropped); this list
exists so a consumer can detect that a non-render decision was made and
surface or route those sequences deliberately. Empty when everything
rendered cleanly.

***

### RenderTextOptions

Options for [renderText](#rendertext).

#### Properties

##### newline?

> `readonly` `optional` **newline?**: `string`

The string emitted for each line break (`\.br\`, `\.sp`, `\.ce\`, and a
raw CR/LF/CRLF in the input). Defaults to `"\n"`. Set `"\r\n"` for
Windows-style display, or `" "` to flatten a note to a single line.

***

### RepeatPattern

An order/medication timing **repeat pattern** (HL7 Table 0335): the
frequency/SIG field (TQ1-3, or the legacy embedded TQ interval RI.1).

**Safety contract.** `code` is the **decoded field value** (HL7 escapes are
unescaped as with every field read) and is **never resolved to clock times,
normalized, or mapped to a different frequency**: reading `Q6H` as "daily"
or silently dropping a `BID` changes the administered dose count, a
transcription-class harm. `kind`/`interval` are convenience provenance ONLY;
`code` is the authoritative value.

#### Example

```ts
import type { RepeatPattern } from "@cosyte/hl7";
const q6h: RepeatPattern = { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } };
const bid: RepeatPattern = { code: "BID", kind: "named" };
```

#### Properties

##### code

> `readonly` **code**: `string`

The Table-0335 repeat-pattern code exactly as authored (e.g. `"Q6H"`, `"BID"`). Never normalized.

##### interval?

> `readonly` `optional` **interval?**: `object`

For a `"parametric"` `Q<integer><unit>` template only: the load-bearing
integer and its unit letter (`S`/`M`/`H`/`D`/`W`/`L`, or `J` for
day-of-week). OMITTED for `"named"`/`"unknown"` patterns. Informational,
`code` remains authoritative.

###### count

> `readonly` **count**: `number`

###### unit

> `readonly` **unit**: `string`

##### kind

> `readonly` **kind**: [`RepeatPatternKind`](#repeatpatternkind-1)

Provenance classification of `code`: never used to resolve a schedule. See [RepeatPatternKind](#repeatpatternkind-1).

***

### ResultStatusClassification

A result status read against its HL7 table and classified by HL7's
published v2-to-FHIR status map: carried as `resultStatus` on every
[Observation](#observation) (from OBX-11) and every [Order](#order-1) (from OBR-25).

**Safety contract.** Each OBX classifies from its own OBX-11 alone and each
order from its own OBR-25 alone: nothing is inherited, propagated or
reconciled across segments. A status is reported, never applied: an
`"entered-in-error"` observation is still returned, and replacing or
deleting an earlier result is the caller's decision. `classification` is
`"final"` only when the field is exactly `F`; every value HL7's map does not
map is `"undetermined"` (see [ResultStatusClass](#resultstatusclass)), never a guess.

The object is plain data, not a FHIR element: no resource is built and no
terminology service is consulted.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
for (const obs of msg.observations()) {
  const { classification, code } = obs.resultStatus;
  if (classification === "entered-in-error") console.log("posted in error:", code);
  else if (classification === "undetermined") console.log("not classifiable:", code);
}
```

#### Properties

##### classification

> `readonly` **classification**: [`ResultStatusClass`](#resultstatusclass)

The classification HL7's map gives the code, or `"undetermined"`.

##### code?

> `readonly` `optional` **code?**: `string`

The raw code, byte-identical to the `status` (OBX-11) or `orderStatus`
(OBR-25) the same observation or order surfaces: the field's first value,
decoded. OMITTED when that field is absent, empty or `""`, exactly when
`status` / `orderStatus` is. When the field carries more than one
repetition, component or subcomponent this is still only the first value,
and `classification` is `"undetermined"`.

##### map

> `readonly` **map**: [`ResultStatusMap`](#resultstatusmap)

The HL7 v2-to-FHIR map the classification followed.

##### table

> `readonly` **table**: [`ResultStatusTable`](#resultstatustable)

The HL7 table the code was read against.

***

### ResultStatusMap

The published HL7 v2-to-FHIR map a [ResultStatusClassification](#resultstatusclassification)
followed, by canonical URL and version. The maps come from the HL7 Version 2
to FHIR Implementation Guide (STU 1, standards status Informative); a later
map revision shows up here as a changed `version`.

#### Example

```ts
import type { ResultStatusMap } from "@cosyte/hl7";
const map: ResultStatusMap = {
  url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
  version: "1.0.0",
};
```

#### Properties

##### url

> `readonly` **url**: `"http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status"` \| `"http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status"`

Canonical URL of the ConceptMap whose rows the classification follows.

##### version

> `readonly` **version**: `"1.0.0"`

The ConceptMap version the classification follows.

***

### ResultStatusTable

The HL7 v2 code table a [ResultStatusClassification](#resultstatusclassification) read: Table 0085
(Observation Result Status, OBX-11) or Table 0123 (Result Status, OBR-25),
each at the code-system version the map was checked against.

#### Example

```ts
import type { ResultStatusTable } from "@cosyte/hl7";
const table: ResultStatusTable = { name: "HL7 Table 0085", version: "3.0.0" };
```

#### Properties

##### name

> `readonly` **name**: `"HL7 Table 0085"` \| `"HL7 Table 0123"`

`"HL7 Table 0085"` for OBX-11, `"HL7 Table 0123"` for OBR-25.

##### version

> `readonly` **version**: `"3.0.0"`

The code-system version the table's codes were taken from.

***

### SegmentRule

A rule for one **segment type**. `usage` constrains whether
the segment must / must not appear; `cardinality` constrains how many times;
`fields` are the per-field rules, applied to **every** occurrence of the
segment.

#### Properties

##### cardinality?

> `readonly` `optional` **cardinality?**: [`Cardinality`](#cardinality)

Occurrence-count constraint for this segment across the message.

##### condition?

> `readonly` `optional` **condition?**: [`ConditionPredicate`](#conditionpredicate)

The [ConditionPredicate](#conditionpredicate) that decides this rule's usage, evaluated
against the message. Only a rule whose `usage` is conditional (`C`, `CE`,
or a declared conditional) may declare one.

##### fields?

> `readonly` `optional` **fields?**: readonly [`FieldRule`](#fieldrule)[]

Per-field rules, applied to each occurrence of this segment.

##### segment

> `readonly` **segment**: `string`

Segment name: 3 chars, `[A-Z][A-Z0-9]{2}` (standard or `Z…` segment).

##### severity?

> `readonly` `optional` **severity?**: [`FindingSeverity`](#findingseverity)

Severity for the segment-level presence / cardinality findings. Default `"error"`.

##### usage?

> `readonly` `optional` **usage?**: [`UsageCode`](#usagecode)

Usage for the segment as a whole. `R` ⇒ at least one occurrence required;
`X` ⇒ none permitted; `RE` / `O` ⇒ no presence constraint; `C` / `CE` /
`B` ⇒ presence not evaluated (no predicate language). A declared
conditional such as `C(R/X)` takes the outcome a caller resolves, and is
evaluated exactly as `C` when nothing resolves it. Omitted ⇒ Optional.

***

### SerializedMessage

Snapshot-stable JSON projection of an `Hl7Message`. Every field
is readonly; segment order is preserved; `isNull` flags are preserved.

Runtime immutability: the top-level object is `Object.freeze`d
(boundary-frozen). Inner arrays are readonly at the TypeScript type
level but mutable at runtime: treat as immutable, do not mutate.

#### Example

```ts
import { parseHL7, type SerializedMessage } from "@cosyte/hl7";
const msg = parseHL7(raw);
const snap: SerializedMessage = msg.toJSON();
console.log(snap.segments[0]?.name);        // "MSH"
console.log(snap.warnings.length);          // 0 when clean
console.log(JSON.stringify(msg) === JSON.stringify(snap)); // true
console.log(Object.isFrozen(snap));         // true (frozen at the boundary)
```

#### Properties

##### encodingCharacters

> `readonly` **encodingCharacters**: [`EncodingCharacters`](#encodingcharacters-1)

##### profile?

> `readonly` `optional` **profile?**: `object`

###### lineage

> `readonly` **lineage**: readonly `string`[]

###### name

> `readonly` **name**: `string`

##### segments

> `readonly` **segments**: readonly `object`[]

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

***

### SiuAppointment

Typed SCH (scheduling activity information) content for [buildSiu](#buildsiu).

#### Example

```ts
import type { SiuAppointment } from "@cosyte/hl7";
const appointment: SiuAppointment = {
  placerAppointmentId: "PL-1001",
  fillerAppointmentId: "FL-2002",
  startDateTime: "20260801090000",
  endDateTime: "20260801093000",
  fillerStatusCode: { identifier: "Booked" },
};
```

#### Properties

##### endDateTime?

> `readonly` `optional` **endDateTime?**: `string` \| [`DtmParts`](#dtmparts)

SCH-11.5 End Date/Time of the appointment timing quantity.

##### fillerAppointmentId?

> `readonly` `optional` **fillerAppointmentId?**: `string`

SCH-2 Filler Appointment ID.

##### fillerStatusCode?

> `readonly` `optional` **fillerStatusCode?**: [`CWE`](#cwe-1)

SCH-25 Filler Status Code (HL7 Table 0278). Verbatim; never defaulted.

##### placerAppointmentId?

> `readonly` `optional` **placerAppointmentId?**: `string`

SCH-1 Placer Appointment ID.

##### startDateTime?

> `readonly` `optional` **startDateTime?**: `string` \| [`DtmParts`](#dtmparts)

SCH-11.4 Start Date/Time of the appointment timing quantity.

***

### SiuResource

Typed AI* (appointment resource) content for [buildSiu](#buildsiu).

#### Example

```ts
import type { SiuResource } from "@cosyte/hl7";
const theatre: SiuResource = { kind: "location", code: { identifier: "OR-1" } };
const surgeon: SiuResource = {
  kind: "personnel",
  person: { idNumber: "9990", familyName: "Welby", identifierTypeCode: "NPI" },
};
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CWE`](#cwe-1)

AI*-3 resource identifier for a service, general resource or location
(AIS-3 / AIG-3 are coded elements; AIL-3 is a location, whose first
component is the location id). Ignored for a `personnel` resource, which
carries [person](#person-1) instead.

##### kind

> `readonly` **kind**: [`SiuResourceKind`](#siuresourcekind-1)

Which resource segment to emit: AIS, AIG, AIL or AIP.

##### person?

> `readonly` `optional` **person?**: [`XCN`](#xcn-1)

AIP-3 personnel resource: the appointment provider. Personnel resources only.

##### setId?

> `readonly` `optional` **setId?**: `string`

AI*-1 Set ID.

***

### SiuResourceGroup

Typed RGS (resource group) content for [buildSiu](#buildsiu).

#### Example

```ts
import type { SiuResourceGroup } from "@cosyte/hl7";
const group: SiuResourceGroup = {
  setId: "1",
  resourceGroupId: { identifier: "RG-1", text: "Theatre" },
  resources: [{ kind: "location", code: { identifier: "OR-1" } }],
};
```

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

RGS-2 Segment Action Code.

##### resourceGroupId?

> `readonly` `optional` **resourceGroupId?**: [`CWE`](#cwe-1)

RGS-3 Resource Group ID.

##### resources?

> `readonly` `optional` **resources?**: readonly [`SiuResource`](#siuresource)[]

The AI* resources belonging to this group, in the order supplied.

##### setId?

> `readonly` `optional` **setId?**: `string`

RGS-1 Set ID.

***

### SN

HL7 v2 Structured Numeric (SN) composite. `num1` and `num2` are
ALWAYS-PRESENT keys (typed `number | undefined`) so callers can destructure
uniformly, mirroring `NM`; `comparator` and `separatorOrSuffix` are OMITTED
when absent (`exactOptionalPropertyTypes`).

An absent `comparator` means the default `=` relation per HL7 Chapter 2A.
This library surfaces the structure only: it does not evaluate the
inequality, validate the unit, or convert values.

#### Example

```ts
import type { SN } from "@cosyte/hl7";
const gfr: SN = { comparator: ">", num1: 90, num2: undefined };       // >90
const range: SN = { num1: 100, separatorOrSuffix: "-", num2: 200 };   // 100-200
```

#### Properties

##### comparator?

> `readonly` `optional` **comparator?**: `string`

SN.1 comparator: one of `>` `<` `>=` `<=` `=` `<>`. Omitted ⇒ default `=`.

##### num1

> `readonly` **num1**: `number` \| `undefined`

SN.2 first numeric value. `undefined` when absent or non-numeric (never `NaN`).

##### num2

> `readonly` **num2**: `number` \| `undefined`

SN.4 second numeric value. `undefined` when absent or non-numeric (never `NaN`).

##### separatorOrSuffix?

> `readonly` `optional` **separatorOrSuffix?**: `string`

SN.3 separator/suffix: `-` (range), `:`/`/` (ratio), `+` (suffix), `.`. Omitted when absent.

***

### StructureFamily

A referenced structure id and the variant family actually read for it.

#### Properties

##### members

> `readonly` **members**: readonly `string`[]

The family members present in the snapshot, sorted.

##### structureId

> `readonly` **structureId**: `string`

The structure id the publication's message list references.

***

### StructureFinding

One typed published-structure finding: the [StructureFindingCode](#structurefindingcode-1), a
severity, the structural [StructureFindingLocus](#structurefindinglocus-1), and a human-readable
`message`.

**The `message` is PHI-safe by construction**: it names the segment, the
occurrence, the published structure and the counts involved, and never a
value read out of the message.

#### Example

```ts
import type { StructureFinding } from "@cosyte/hl7";
const f: StructureFinding = {
  code: "STRUCTURE_SEGMENT_CARDINALITY",
  severity: "error",
  locus: { segment: "EVN", structureId: "ADT_A01-A" },
  message: 'Segment "EVN" occurs 0 times; published structure ADT_A01-A requires at least 1.',
};
```

#### Properties

##### code

> `readonly` **code**: [`StructureFindingCode`](#structurefindingcode-1)

Which check fired.

##### locus

> `readonly` **locus**: [`StructureFindingLocus`](#structurefindinglocus-1)

Where in the message, structurally.

##### message

> `readonly` **message**: `string`

Human-readable description of the rule that fired. Carries no field value.

##### severity

> `readonly` **severity**: [`FindingSeverity`](#findingseverity)

How hard a finding this is.

An ordering or cardinality finding is an `error`: the publication states a
constraint and the message breaks it. An unexpected segment is a `warning`,
because HL7 reserves `Z` segments for exactly this and a site-defined
segment in a live feed is normal traffic rather than a broken message. The
check still fires, under its own code, so a consumer that wants it to be an
error can make it one.

***

### StructureFindingLocus

The **structural** locus a published-structure finding refers to: a segment
name, the 0-indexed occurrence of that segment where one occurrence is
responsible, and the published structure the finding was raised against.

Every member is a name or an index, so a locus is **inherently PHI-free** and
never carries a field value. The occurrence index counts occurrences of that
segment name, the same way a conformance finding's does.

#### Example

```ts
import type { StructureFindingLocus } from "@cosyte/hl7";
const locus: StructureFindingLocus = { segment: "PID", occurrence: 1, structureId: "ADT_A01-A" };
```

#### Properties

##### occurrence?

> `readonly` `optional` **occurrence?**: `number`

0-indexed occurrence of that segment name, present when one occurrence is
responsible. A minimum-cardinality finding names no occurrence: the
responsible occurrence is the one that is not there.

##### segment

> `readonly` **segment**: `string`

Segment name (e.g. `"PID"`), bounded to the shape a segment id may take.

##### structureId

> `readonly` **structureId**: `string`

The published structure variant the finding was raised against.

***

### StructureGroup

The presence verdict for one expected segment of a recognized message type.

#### Properties

##### anchorSegments

> `readonly` **anchorSegments**: readonly `string`[]

The anchor segment name(s) whose presence would satisfy this group.

##### name

> `readonly` **name**: `string`

The expectation's label from its `ExpectedSegmentGroup`, e.g. `"OBR"`.

##### present

> `readonly` **present**: `boolean`

`true` when the required segment is present in the message.

##### requiredSegment

> `readonly` **requiredSegment**: `string`

The segment the published structure gives a minimum of one.

***

### StructurePublicationRef

The publication a snapshot was taken from.

#### Properties

##### commit

> `readonly` **commit**: `string`

The commit the snapshot was taken at.

##### commitDate

> `readonly` **commitDate**: `string`

That commit's date.

##### name

> `readonly` **name**: `string`

Human-readable name of the publication.

##### repository

> `readonly` **repository**: `string`

The publishing repository, e.g. `"HL7/v2ig"`.

##### repositoryUrl

> `readonly` **repositoryUrl**: `string`

Its web URL.

##### tree

> `readonly` **tree**: `string`

The subtree the structure definitions live in.

***

### StructureRegistryProvenance

Everything needed to audit where a structural expectation came from: the
publication, the exact bytes, and the structure behind every recognized pair.

#### Properties

##### families

> `readonly` **families**: readonly [`StructureFamily`](#structurefamily)[]

Each referenced structure id and the variant family read for it.

##### files

> `readonly` **files**: readonly [`StructureSnapshotFile`](#structuresnapshotfile)[]

Every vendored file the registry was derived from, with its sha256.

##### pairs

> `readonly` **pairs**: readonly [`StructureSourcePair`](#structuresourcepair)[]

Each recognized pair and the structure id it came from.

##### publication

> `readonly` **publication**: [`StructurePublicationRef`](#structurepublicationref)

The publication the registry was derived from.

##### snapshotTakenAt

> `readonly` **snapshotTakenAt**: `string`

ISO date the snapshot was taken.

***

### StructureSnapshotFile

One vendored publication file the shipped registry was derived from.

#### Properties

##### bytes

> `readonly` **bytes**: `number`

Byte length of the vendored file.

##### path

> `readonly` **path**: `string`

Path relative to the vendored snapshot directory.

##### sha256

> `readonly` **sha256**: `string`

Lowercase hex sha256 of the vendored bytes.

##### url

> `readonly` **url**: `string`

The upstream URL the bytes were fetched from.

***

### StructureSourcePair

One (message code, trigger event) pair and the structure it came from.
An empty `triggerEvent` marks an entry matched on message code alone, and an
empty `structureId` marks a retained transcription.

#### Properties

##### messageCode

> `readonly` **messageCode**: `string`

MSH-9.1 message code.

##### structureId

> `readonly` **structureId**: `string`

The published structure id, or `""` for a retained transcription.

##### triggerEvent

> `readonly` **triggerEvent**: `string`

MSH-9.2 trigger event, or `""` for a code-alone match.

***

### StructureValidationResult

The result of [validateMessageStructure](#validatemessagestructure).

**Read `validated` first.** `false` means the publication could not answer
for this message and `reason` says why; `findings` is empty and no structure
was selected. It is NOT "the message is fine".

**`validated: true` with `findings.length === 0` is not a conformance
attestation either.** It means the message did not break the published
structure in the three ways checked here: segment order, segment occurrence
counts, and segments the publication does not name. Field content, datatypes,
value sets, tables and clinical correctness are all unchecked, and the
publication itself is vendored at a fixed commit.

#### Example

```ts
import { parseHL7, validateMessageStructure } from "@cosyte/hl7";
const result = validateMessageStructure(parseHL7(raw));
if (result.validated && result.findings.length === 0) {
  // nothing checked here was violated, against result.structureId
}
```

#### Properties

##### findings

> `readonly` **findings**: readonly [`StructureFinding`](#structurefinding)[]

The findings, in a stable order: the ordering finding first, then
cardinality findings by segment name, then unexpected segments in the order
they appear in the message. Always empty when `validated` is `false`.

##### reason

> `readonly` **reason**: `""` \| [`StructureNotValidatedReason`](#structurenotvalidatedreason)

Why validation did not run. Empty string when it did.

##### reasonMessage

> `readonly` **reasonMessage**: `string`

Human-readable form of `reason`. Empty string when validation ran.

##### structureId

> `readonly` **structureId**: `string`

The published structure variant the findings were raised against, e.g.
`"ADT_A01-A"`. Empty string when `validated` is `false`.

##### structureIds

> `readonly` **structureIds**: readonly `string`[]

Every variant of the family that was considered, sorted. Empty when
`validated` is `false`.

##### validated

> `readonly` **validated**: `boolean`

Whether a published structure was actually validated against.

***

### SupportedBuilderMessage

One (message code, trigger event) pair the typed builders can author, with
the builder that authors it and the segments the published structure requires
for it.

`triggerEvent` is the empty string for a pair the registry matches on message
code alone (`ACK`, whose MSH-9.2 carries the acknowledged message's trigger
event); [supportsBuilderMessage](#supportsbuildermessage) treats such an entry as matching any
trigger event for that code.

#### Example

```ts
import { SUPPORTED_BUILDER_MESSAGES } from "@cosyte/hl7";
const vxu = SUPPORTED_BUILDER_MESSAGES.find((m) => m.messageCode === "VXU");
console.log(vxu?.triggerEvent, vxu?.builder); // "V04" "buildVxu"
```

#### Properties

##### builder

> `readonly` **builder**: `string`

The exported builder that authors this pair.

##### messageCode

> `readonly` **messageCode**: `string`

MSH-9.1 message code.

##### requiredSegments

> `readonly` **requiredSegments**: readonly `string`[]

The segments the derived structure registry marks required for this pair.

##### triggerEvent

> `readonly` **triggerEvent**: `string`

MSH-9.2 trigger event; `""` when the registry matches on message code alone.

***

### SupportedOverlayMessage

One published overlay key, with the message type it matches and the segments
the published structure requires for it.

`triggerEvent` is the empty string for a key the registry matches on message
code alone (`ACK`), and [Hl7Message.is](#is) then answers `true` for that key
whatever MSH-9.2 carries, in the same way `supportsBuilderMessage` treats a
code-only registry entry.

#### Example

```ts
import { SUPPORTED_OVERLAY_MESSAGES } from "@cosyte/hl7";
const oru = SUPPORTED_OVERLAY_MESSAGES.find((m) => m.key === "ORU^R01");
console.log(oru?.messageCode, oru?.triggerEvent); // "ORU" "R01"
console.log(oru?.requiredSegments); // ["MSH", "OBR"]
```

#### Properties

##### key

> `readonly` **key**: `string`

The overlay key, e.g. `"ORU^R01"` or the code-only `"ACK"`.

##### messageCode

> `readonly` **messageCode**: `string`

MSH-9.1 message code.

##### requiredSegments

> `readonly` **requiredSegments**: readonly `string`[]

The segments the derived structure registry marks required for this key.

##### triggerEvent

> `readonly` **triggerEvent**: `string`

MSH-9.2 trigger event; `""` when the registry matches on message code alone.

***

### TextRun

One contiguous run of rendered display text, tagged with whether it fell
inside a `\H`…`\N` highlight span. Runs preserve emphasis boundaries that
the flat [RenderedText.text](#text-4) intentionally drops.

#### Properties

##### highlighted

> `readonly` **highlighted**: `boolean`

`true` when this run is inside a `\H\`…`\N` highlight span.

##### text

> `readonly` **text**: `string`

The literal display text of this run: escape sentinels already resolved
(delimiter/hex decoded, formatting → whitespace/line breaks). Never
contains a formatting sentinel; may contain the newline used for breaks.

***

### TimingQuantity

A composite-quantity (CQ) value on an order/medication timing: the TQ1-2
service quantity. `value` is strict-`Number()` parsed (`undefined`,
never `NaN`); `units` carries any CQ.2 units. Both keys OMITTED when absent.

#### Example

```ts
import type { TimingQuantity } from "@cosyte/hl7";
const q: TimingQuantity = { value: 1, units: { identifier: "tablet" } };
```

#### Properties

##### units?

> `readonly` `optional` **units?**: [`CWE`](#cwe-1)

CQ.2 units.

##### value?

> `readonly` `optional` **value?**: `number`

CQ.1 quantity numeric value (strict-parsed; never `NaN`).

***

### TypedBuilderCoverage

One typed builder's emit capability: the message code it authors and the
segment names its typed init can populate. The published support set is the
intersection of this with the derived structure registry.

#### Example

```ts
import { TYPED_BUILDER_COVERAGE } from "@cosyte/hl7";
const adt = TYPED_BUILDER_COVERAGE.find((c) => c.builder === "buildAdt");
console.log(adt?.segments.includes("MRG")); // true: prior identity is supported
```

#### Properties

##### builder

> `readonly` **builder**: `string`

The exported builder function that authors this message code.

##### fixedTriggerEvents

> `readonly` **fixedTriggerEvents**: readonly `string`[]

The trigger events this builder can author, when it authors a fixed set.
Empty when the builder authors every trigger event the registry records for
its message code (the builders that take a trigger-event argument).

##### messageCode

> `readonly` **messageCode**: `string`

MSH-9.1 message code this builder authors.

##### segments

> `readonly` **segments**: readonly `string`[]

Every segment name the builder's typed init can populate.

***

### TypedMessage

A parsed message narrowed to one overlay key: every `Hl7Message` member
unchanged, the message code and trigger event at literal types, and `part` /
`parts` scoped at compile time to the segment names that pair's published
structure marks required.

It is a view, not a subclass: `msg.is(key)` narrows the message you already
have, allocates nothing, and changes no runtime behaviour. Nothing here is
typed as guaranteed-present, because the parser tolerates a message that
omits a required segment (and warns); `part` returns `Segment | undefined`
and `parts` a possibly-empty list, exactly as `segments` does.

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
if (msg.is("ORU^R01")) {
  const obr = msg.part("OBR"); // Segment | undefined, no cast
  console.log(obr?.field(4).value);
  // msg.part("PID"); // does not compile: PID is not required for ORU^R01
  console.log(msg.segments("PID").length); // the base accessor takes any name
}
```

#### Extends

- [`Hl7Message`](#hl7message)

#### Type Parameters

##### K

`K` *extends* [`OverlayKey`](#overlaykey)

#### Properties

##### dateFormats

> `readonly` **dateFormats**: readonly `string`[]

Merged `dateFormats` list: `options.dateFormats ++ profile.dateFormats`
deduped first-occurrence. Empty array when neither source
supplied any formats. This is the list every datetime in the message
honours, from `meta.timestamp` to any `field.asTs()`, in exactly this
order; exposed so a caller can introspect what their options and profile
added up to.

###### Inherited from

[`ProfiledMessage`](#profiledmessage).[`dateFormats`](#dateformats-7)

##### encodingCharacters

> `readonly` **encodingCharacters**: [`EncodingCharacters`](#encodingcharacters-1)

###### Inherited from

[`Hl7Message`](#hl7message).[`encodingCharacters`](#encodingcharacters)

##### meta

> `readonly` **meta**: [`TypedMeta`](#typedmeta)\<`K`\>

MSH-derived metadata, with the message type at the key's literal types.

###### Overrides

[`Hl7Message`](#hl7message).[`meta`](#meta)

##### profile

> `readonly` **profile**: \{ `lineage`: readonly `string`[]; `name`: `string`; \} \| `undefined`

###### Inherited from

[`Hl7Message`](#hl7message).[`profile`](#profile)

##### rawSegments

> `readonly` **rawSegments**: readonly [`RawSegment`](#rawsegment)[]

Raw positional tree produced by the parser. 1-indexed per HL7 convention
(`fields[0]` is the segment-name / MSH separator placeholder slot). Use
`segments(type)` / `allSegments()` for typed wrapper access: this field
is exposed for advanced callers that need the raw tree directly.

On a lazily parsed message (the default), the first read builds every segment that has not
been read yet, so the whole tree is held from then on. To read a few segments of a long
message, use `segments(type)`, `part(type)` or `get(path)`, which build only what they reach.

###### Inherited from

[`ProfiledMessage`](#profiledmessage).[`rawSegments`](#rawsegments-1)

##### version

> `readonly` **version**: `string`

HL7 version the model asserts for this message, from MSH-12.1.1, e.g.
`"2.5"` or `"2.5.1"`.

**Bounded, and it is `"<withheld>"` when MSH-12 does not hold a version.**
Same reasoning as [Segment.type](#type): it presents as an identifier and
consumers label with it. `meta.version` keeps MSH-12 exactly as it
arrived, and is what version-scoped field selection reads, so this bound
changes no parsing behaviour.

###### Inherited from

[`Hl7Message`](#hl7message).[`version`](#version)

##### warnings

> `readonly` **warnings**: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]

###### Inherited from

[`ProfiledMessage`](#profiledmessage).[`warnings`](#warnings-3)

#### Accessors

##### patient

###### Get Signature

> **get** **patient**(): [`Patient`](#patient-8) \| `undefined`

PID-derived patient view, or `undefined` when no PID segment exists.
Memoized. Never throws: absent fields
surface as `undefined` on the returned `Patient` object.

###### Example

```ts
console.log(msg.patient?.mrn);
console.log(msg.patient?.fullName);
console.log(msg.patient?.dateOfBirth?.raw); // fidelity TS: e.g. "19800115"
```

###### Returns

[`Patient`](#patient-8) \| `undefined`

###### Inherited from

[`Hl7Message`](#hl7message).[`patient`](#patient)

##### structure

###### Get Signature

> **get** **structure**(): [`MessageStructure`](#messagestructure)

Structural-conformance summary for the common message types: a
misroute/truncation safety net, NOT a conformance validator.
Reports, per the message's recognized (MSH-9.1, MSH-9.2) type, which
Required segment groups are present and which are entirely absent
(`missingGroups`: the same set the parser flags as
`MISSING_EXPECTED_GROUP` warnings). For an unmodelled type, `recognized`
is `false` and `missingGroups` is empty. Memoized.

###### Example

```ts
console.log(msg.structure.recognized);    // true for ORU^R01, ADT^A01, …
console.log(msg.structure.missingGroups); // e.g. ["result"] if no OBR/OBX
```

###### Returns

[`MessageStructure`](#messagestructure)

###### Inherited from

[`Hl7Message`](#hl7message).[`structure`](#structure)

##### visit

###### Get Signature

> **get** **visit**(): [`Visit`](#visit-7) \| `undefined`

PV1-derived visit view, or `undefined` when no PV1 segment exists.
Memoized. Never throws.

###### Example

```ts
console.log(msg.visit?.patientClass);                 // "I"
console.log(msg.visit?.admitDateTime?.raw); // fidelity TS
console.log(msg.visit?.attendingDoctor?.familyName);
```

###### Returns

[`Visit`](#visit-7) \| `undefined`

###### Inherited from

[`Hl7Message`](#hl7message).[`visit`](#visit)

#### Methods

##### addSegment()

> **addSegment**(`name`, `fields`): `this`

Append a new segment to the end of the message. `name` must match
`/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u`: throws `TypeError` otherwise.

`fields` is interpreted in HL7 1-indexed terms: `addSegment("NTE", [a, b, c])`
produces a segment whose `NTE-1 = a`, `NTE-2 = b`, `NTE-3 = c`. The
internal `RawSegment.fields[0]` name/separator placeholder is synthesized
by this method.

Each entry may be a plain string (treated as a single-subcomponent
single-component single-repetition field) or a full `RawField` object
for advanced callers who need structured content.

Invalidates caches on return; warnings untouched.

###### Parameters

###### name

`string`

###### fields

readonly (`string` \| [`RawField`](#rawfield))[]

###### Returns

`this`

###### Example

```ts
msg.addSegment("NTE", ["", "note text"]);
msg.get("NTE.2"); // "note text"
```

###### Inherited from

[`Hl7Message`](#hl7message).[`addSegment`](#addsegment)

##### allergies()

> **allergies**(): readonly [`Allergy`](#allergy)[]

Every AL1 and every IAM as an Allergy, one entry per segment in document
order, each naming the segment it was read from (`source`). An ADT^A60
carries its allergies in IAM, so it is read here too. Returns `[]`
when neither is present.

Limits: the IAR and NTE segments under an IAM are not read, nor IAM-1 or
IAM-8 onward (reach them with `msg.segments("IAM")`). IAM-6 is surfaced as
`actionCode`, and an exact `D` sets `deleteRequested`, but no action is ever
applied: a delete entry is still returned, an update never replaces an
earlier entry, and an AL1 and an IAM for the same allergen are two entries.

###### Returns

readonly [`Allergy`](#allergy)[]

###### Example

```ts
for (const al of msg.allergies()) {
  const kind = al.deleteRequested === true ? "delete request" : "allergy";
  console.log(kind, al.source, al.code?.text, al.severity, al.actionCode);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`allergies`](#allergies)

##### allSegments()

> **allSegments**(): readonly [`Segment`](#segment)\<`string`\>[]

Iterate every `Segment` in document order (MSH first, then every
subsequent segment). Cached per-message; same array reference and same
Segment instances on repeat calls. Invalidated wholesale by
the mutation methods.

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
for (const seg of msg.allSegments()) {
  console.log(seg.type);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`allSegments`](#allsegments)

##### appointments()

> **appointments**(): readonly [`Appointment`](#appointment)[]

Every SCH of an SIU message as a typed `Appointment`, with
the AIS/AIG/AIL/AIP resource segments that follow it grouped positionally
under that SCH. Surfaces the placer/filler appointment ids, SCH-25 filler
status (Table 0278), SCH-11 start/end timing, and the resource groups
(service / general / location / personnel). Returns `[]` when no SCH
is present. Not memoized. Never throws. Not a
scheduling-workflow state machine: see the package known-limitations.

###### Returns

readonly [`Appointment`](#appointment)[]

###### Example

```ts
for (const appt of msg.appointments()) {
  console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier);
  for (const r of appt.resources) console.log(r.kind, r.code?.identifier);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`appointments`](#appointments)

##### charges()

> **charges**(): readonly [`Charge`](#charge)[]

Every FT1 of a DFT message as a typed `Charge`, one per
FT1 in document order. Surfaces billing-critical fields (FT1-6 transaction
type, FT1-7 code, FT1-11/12 extended/unit amount, FT1-19 diagnosis linkage)
with **no billing logic and no money-as-float**: amounts are the verbatim
CP wire text. Returns `[]` when no FT1 is present. Not memoized.
Never throws.

###### Returns

readonly [`Charge`](#charge)[]

###### Example

```ts
for (const charge of msg.charges()) {
  console.log(charge.transactionType, charge.transactionCode?.identifier);
  console.log(charge.amountExtended); // verbatim, never a number
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`charges`](#charges)

##### diagnoses()

> **diagnoses**(): readonly [`Diagnosis`](#diagnosis)[]

Every DG1 as a Diagnosis in document order. Returns `[]` when no
DG1 present.

###### Returns

readonly [`Diagnosis`](#diagnosis)[]

###### Example

```ts
for (const dg of msg.diagnoses()) console.log(dg.code?.identifier);
```

###### Inherited from

[`Hl7Message`](#hl7message).[`diagnoses`](#diagnoses)

##### documents()

> **documents**(): readonly [`ClinicalDocument`](#clinicaldocument)[]

Every TXA of an MDM message as a typed `ClinicalDocument`,
with the OBX narrative body grouped positionally under that TXA. The
completion status (TXA-17) and availability status (TXA-19) are surfaced as
**distinct** fields and never conflated: a document can be available before
it is authenticated, and reading a preliminary document as final is the
harm. Returns `[]` when no TXA is present. Not memoized. Never
throws.

###### Returns

readonly [`ClinicalDocument`](#clinicaldocument)[]

###### Example

```ts
for (const doc of msg.documents()) {
  console.log(doc.documentType, doc.completionStatus, doc.availabilityStatus);
  for (const obx of doc.observations) console.log(obx.value); // narrative body
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`documents`](#documents)

##### get()

> **get**(`path`): `string` \| `undefined`

Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
decoded leaf string (unescaped once at parse: never re-unescaped on
read). Returns `undefined` when the path doesn't
resolve: never throws on missing path. Throws `TypeError`
on malformed path syntax (e.g. `"pid.5"`, empty string).

###### Parameters

###### path

`string`

###### Returns

`string` \| `undefined`

###### Example

```ts
const msg = parseHL7(raw);
msg.get("PID.5.1");  // "Smith"
msg.get("OBX[2].5"); // third OBX's 5th field
msg.get("NOT.9.9");  // undefined
msg.get("MSH.12");   // "2.5": HL7 version string
```

###### Inherited from

[`Hl7Message`](#hl7message).[`get`](#get)

##### getAll()

> **getAll**(`segmentType`): readonly [`Segment`](#segment)\<`string`\>[]

Return every `Segment` of `segmentType` in document order. Returns `[]`
(empty array, NEVER `undefined`) when no segment of that type exists.
Alias for `segments(segmentType)`: shares the same cache, and
matches segment names ignoring case exactly as it does.

###### Parameters

###### segmentType

`string`

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
for (const obx of msg.getAll("OBX")) {
  console.log(obx.field(5).value);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`getAll`](#getall)

##### identityEvents()

> **identityEvents**(): readonly [`IdentityEvent`](#identityevent)[]

Every recognized ADT patient-identity event (merge / move / change /
link / unlink / person add/update), with the MRG-sourced
`prior` and PID/PV1-sourced `surviving` parties labelled by role and the
spec-constant `direction: "MRG_TO_PID"` on merge/move/change events.
Returns `[]` when the trigger event is not in the identity family. The
recognized set is floored by the published message structures: every ADT
trigger event whose structure requires MRG is recognized. Not
memoized. Never throws; incomplete merge pairs surface a
`MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on the event.

###### Returns

readonly [`IdentityEvent`](#identityevent)[]

###### Example

```ts
for (const ev of msg.identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving) {
    // retire ev.prior.identifiers in favour of ev.surviving.identifiers
  }
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`identityEvents`](#identityevents)

##### immunizations()

> **immunizations**(): readonly [`Immunization`](#immunization)[]

Every RXA of a VXU^V04 as a typed `Immunization`, with RXR (route/site)
and OBX children grouped positionally under the RXA and `orderControl`
from the preceding ORC of the VXU order group. Returns
`[]` when no RXA present. Not memoized. The vaccine code
carries its own provenance; the action code (RXA-21) is surfaced verbatim
and `recordOrigin` (administered vs historical) is derived only from the
well-known NIP001 RXA-9.1 codes: never guessed.

###### Returns

readonly [`Immunization`](#immunization)[]

###### Example

```ts
for (const imm of msg.immunizations()) {
  console.log(imm.vaccineCode?.identifier, imm.doseAmount, imm.recordOrigin);
  console.log(imm.actionCode, imm.completionStatus);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`immunizations`](#immunizations)

##### insurance()

> **insurance**(): readonly [`Insurance`](#insurance-1)[]

Every IN1 as an Insurance entry with positional IN2/IN3 presence flags.
Returns `[]` when no IN1 present.

###### Returns

readonly [`Insurance`](#insurance-1)[]

###### Example

```ts
for (const ins of msg.insurance()) console.log(ins.planId?.text);
```

###### Inherited from

[`Hl7Message`](#hl7message).[`insurance`](#insurance)

##### is()

**`Internal`**

Single runtime implementation behind both signatures.

###### Call Signature

> **is**\<`K`\>(`key`): `this is TypedMessage<K>`

Is this message of the type `key` names, and if so, narrow it for the
compiler. The check is on the (MSH-9.1, MSH-9.2) pair the parser already
extracted, so a message whose MSH-9 carries the three-component form
`ADT^A01^ADT_A01` answers `true` to `is("ADT^A01")`.

A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a
message type the published structure registry matches on message code alone
(`"ACK"`, whose MSH-9.2 carries the acknowledged message's trigger event).
`SUPPORTED_OVERLAY_MESSAGES` enumerates every key.

**Any other string is `false`, never a throw**: an unrecognized type, the
three-component form as a string, an empty string, or a value computed at
run time. `is` does not parse its own argument, and a caller who wants a raw
comparison has `msg.meta.type`.

Read-only: it inspects `meta` and mutates nothing.

###### Type Parameters

###### K

`K` *extends* keyof [`OverlayStructures`](#overlaystructures)

###### Parameters

###### key

`K`

###### Returns

`this is TypedMessage<K>`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
if (msg.is("ORU^R01")) {
  const code: "ORU" = msg.meta.messageCode; // literal, no cast
  console.log(msg.part("OBR")?.field(4).value);
}
console.log(msg.is("ZZZ^Z99")); // false: not a published key
```

###### Inherited from

[`Hl7Message`](#hl7message).[`is`](#is)

###### Call Signature

> **is**(`key`): `boolean`

Answer for a key that is not known at compile time. A runtime-computed
string cannot narrow anything, so this form returns a plain `boolean`.

###### Parameters

###### key

`string`

###### Returns

`boolean`

###### Inherited from

[`Hl7Message`](#hl7message).[`is`](#is)

##### medications()

> **medications**(): readonly [`Medication`](#medication)[]

Every RXO/RXE/RXD/RXA as a typed `Medication`, with RXR (route) and RXC
(component) segments grouped positionally under their parent. Returns
`[]` when no RX* parent present. Not memoized. The give
*amount* and give *strength* are surfaced separately and never
reconciled.

Each medication also carries its TQ1 / legacy embedded-TQ (RXE-1) `timings`
(repeat pattern verbatim, never resolved to a schedule).

Each medication also carries `orderControl`: ORC-1 of the ORC that opened
its order group (every RX* up to the next ORC shares it), exactly as sent.
It is never interpreted into an active, held or discontinued state, and it
is omitted when no ORC precedes the RX* or ORC-1 is empty, never carried
over from an earlier group.

###### Returns

readonly [`Medication`](#medication)[]

###### Example

```ts
for (const med of msg.medications()) {
  console.log(med.orderControl); // e.g. "NW" (new) or "DC" (discontinue), verbatim
  console.log(med.context, med.giveCode?.identifier, med.giveCode?.nameOfCodingSystem);
  console.log(med.amount?.minimum, med.strength?.value);
  for (const t of med.timings) console.log(t.repeatPattern?.code, t.totalOccurrences);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`medications`](#medications)

##### nextOfKin()

> **nextOfKin**(): readonly [`NextOfKin`](#nextofkin-1)[]

Every NK1 as a NextOfKin entry in document order. Returns `[]`
when no NK1 present.

###### Returns

readonly [`NextOfKin`](#nextofkin-1)[]

###### Example

```ts
for (const nk of msg.nextOfKin()) {
  console.log(nk.name?.familyName, nk.relationship?.text);
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`nextOfKin`](#nextofkin)

##### notes()

> **notes**(): readonly `string`[]

Message-level NTE notes: every NTE segment with no recognized
preceding parent (not immediately following a `PID`, `ORC`, `OBR`, or
`OBX`), surfaced verbatim in document order so nothing is dropped. Notes
that DO attach to a specific patient / order / result are exposed on those
helper outputs (`msg.patient?.notes`, `order.notes`, `observation.notes`),
not here. Returns `[]` when there are none. NOT memoized.

###### Returns

readonly `string`[]

###### Example

```ts
for (const note of msg.notes()) console.log(note); // message-level narrative
```

###### Inherited from

[`Hl7Message`](#hl7message).[`notes`](#notes)

##### observations()

> **observations**(): readonly [`Observation`](#observation)[]

Every OBX segment as a typed Observation in document order. Returns
`[]` when no OBX present. NOT memoized: each call
re-walks `rawSegments`. Value type is discriminated.

###### Returns

readonly [`Observation`](#observation)[]

###### Example

```ts
for (const obs of msg.observations()) {
  if (obs.valueType === "NM") console.log(obs.value); // number | undefined
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`observations`](#observations)

##### orders()

> **orders**(): readonly [`Order`](#order-1)[]

Every OBR as an Order with its OBX children grouped positionally and
its TQ1 / legacy embedded-TQ (ORC-7) `timings` (the repeat pattern is
surfaced verbatim, never resolved to a schedule). Returns `[]` when no
OBR present. Not memoized.

###### Returns

readonly [`Order`](#order-1)[]

###### Example

```ts
for (const order of msg.orders()) {
  console.log(order.placerOrderNumber, order.observations.length);
  for (const t of order.timings) console.log(t.repeatPattern?.code); // e.g. "Q6H": verbatim
}
```

###### Inherited from

[`Hl7Message`](#hl7message).[`orders`](#orders)

##### part()

> **part**(`name`): [`Segment`](#segment)\<`string`\> \| `undefined`

The first segment of `name`, or `undefined` when the message carries none.

###### Parameters

###### name

[`OverlayRequiredSegment`](#overlayrequiredsegment)\<`K`\>

###### Returns

[`Segment`](#segment)\<`string`\> \| `undefined`

###### Overrides

[`Hl7Message`](#hl7message).[`part`](#part)

##### parts()

> **parts**(`name`): readonly [`Segment`](#segment)\<`string`\>[]

Every segment of `name` in document order; empty when there are none.

###### Parameters

###### name

[`OverlayRequiredSegment`](#overlayrequiredsegment)\<`K`\>

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Overrides

[`Hl7Message`](#hl7message).[`parts`](#parts)

##### prettyPrint()

> **prettyPrint**(): `string`

Emit this message as a human-readable multi-line string for logs and
debugging. Single opinionated format (no options):
header line with type / controlId / timestamp / segment count, then
one line per segment with labeled `[N]=value` fields. Composite
values render as their raw HL7 string: depth stops at field level.
Pure: never warns, never throws.

**Field values render as their raw HL7 string representation.**
Embedded delimiters in user data appear as escape sequences: e.g.
a patient family name containing `|` renders as `Smith\F\Jones`
(NOT `Smith|Jones`). This preserves round-trip fidelity: copy-pasting
prettyPrint output into `parseHL7` yields a structurally equivalent
message. For un-escaped human display, parse the composite first via
typed accessors (e.g. `msg.patient?.familyName`): those return
already-decoded strings.

###### Returns

`string`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.prettyPrint());
// HL7 ADT^A01  controlId=MSG001  timestamp=2026-04-19T10:15:00Z  (5 segments)
// MSH  [3]=SENDAPP  [4]=SENDFAC  ...
// PID  [1]=1  [3]=MRN123  [5]=Doe^John
```

###### Inherited from

[`Hl7Message`](#hl7message).[`prettyPrint`](#prettyprint)

##### removeSegment()

> **removeSegment**(`segmentType`, `occurrenceOrOptions?`): `this`

Remove segments by type + occurrence or by type + all. Call shapes:

- `removeSegment("NTE")`: remove the FIRST NTE (occurrence 0).
- `removeSegment("OBX", 1)`: remove the SECOND OBX (0-indexed).
- `removeSegment("OBX", { all: true })`: remove ALL OBX segments.

`MSH` is protected: `removeSegment("MSH")` throws `TypeError` (every
HL7 message must retain its MSH segment). Unknown segment types are a
no-op (idempotent; no throw). Segment name must match the same shape
regex: invalid shapes throw `TypeError` for symmetry with `addSegment`.

Invalidates caches on return; warnings untouched.

###### Parameters

###### segmentType

`string`

###### occurrenceOrOptions?

`number` \| \{ `all?`: `boolean`; \}

###### Returns

`this`

###### Example

```ts
msg.removeSegment("NTE");                // remove first NTE
msg.removeSegment("OBX", 1);             // remove second OBX
msg.removeSegment("OBX", { all: true }); // remove all remaining OBX
```

###### Inherited from

[`Hl7Message`](#hl7message).[`removeSegment`](#removesegment)

##### segments()

> **segments**(`segmentType`): readonly [`Segment`](#segment)\<`string`\>[]

Return the cached array of `Segment` wrappers for `segmentType` in
document order. The returned array identity and the individual Segment
instances are both stable across calls. Invalidated wholesale
by the mutation methods.

**Segment names are matched ignoring ASCII case, on both sides.** A sender
that ships `obx` is returned by `segments("OBX")`, and `segments("obx")`
returns the same array (one cache entry, so the instance-identity guarantee
does not split across spellings). A `SEGMENT_CASE` warning records the
sender's deviation; `Segment.raw.name` is the spelling that arrived.

###### Parameters

###### segmentType

`string`

###### Returns

readonly [`Segment`](#segment)\<`string`\>[]

###### Example

```ts
const pid = msg.segments("PID")[0];
if (pid !== undefined) console.log(pid.field(5).value);
```

###### Inherited from

[`Hl7Message`](#hl7message).[`segments`](#segments)

##### setComposite()

> **setComposite**\<`K`\>(`path`, `kind`, `value`): `this`

Set a **typed composite** at a field (or field-repetition) dot-path:
the conservative-emit mirror of the typed read accessors
(`asXpn`/`asCx`/…). The caller passes a structured value (an XPN name, a CX
identifier, a TS timestamp, …) by its [CompositeKind](#compositekind), and the setter
encodes it into a spec-clean field using the encode-safe path: any
delimiter embedded in a component value is **escaped, never injected**, so
a `familyName` of `"Smith^Jr"` re-parses to exactly that string rather than
forging a component boundary. No hand-assembly of `^`/`&`/`~`.

The path must resolve to a **field** (`"PID.5"`) or a specific
**repetition** of a field (`"PID.11[1]"`). A component/subcomponent-level
path (`"PID.5.1"`) is rejected with `TypeError`: a composite occupies a
whole field, not a single component. Like [setField](#setfield), the target
segment must already exist (`addSegment` first); the repetition defaults to
index 0 and other repetitions of the field are preserved.

Never fabricates: an omitted optional composite field encodes to an
empty/absent component, never a defaulted value; an all-empty composite
clears the field. Segment/helper caches are invalidated on success; the
frozen `warnings` array is untouched.

###### Type Parameters

###### K

`K` *extends* [`CompositeKind`](#compositekind)

###### Parameters

###### path

`string`

###### kind

`K`

###### value

[`CompositeValueByKind`](#compositevaluebykind)\[`K`\]

###### Returns

`this`

###### Example

```ts
const msg = buildMessage({ type: "ADT^A01" }).addSegment("PID", [""]);
msg.setComposite("PID.5", "XPN", { familyName: "Smith", givenName: "Ann" });
msg.setComposite("PID.3", "CX", { idNumber: "MRN001", identifierTypeCode: "MR" });
msg.setComposite("PID.7", "TS", "19880705");
msg.get("PID.5.1"); // "Smith"
```

###### Inherited from

[`Hl7Message`](#hl7message).[`setComposite`](#setcomposite)

##### setField()

> **setField**(`path`, `value`): `this`

Set the string value at a dot-path. Mutates the underlying tree and
returns `this` for chaining. Auto-creates missing repetitions,
components, and subcomponents WITHIN an existing field, but does NOT
auto-create segments: callers must `addSegment` first (throws
`TypeError` with an actionable message otherwise).

The value is accepted verbatim: unescaped delimiter characters are NOT
rejected on input. Re-escaping is the serializer's concern.

MSH-1 / MSH-2 follow the user-facing HL7 convention: `setField("MSH.3", ...)`
targets MSH-3 (sending application), matching `msg.get("MSH.3")`.

Segment/Field wrapper caches are invalidated wholesale on success.
The frozen `warnings` array is never touched.

###### Parameters

###### path

`string`

###### value

`string`

###### Returns

`this`

###### Example

```ts
msg.setField("PID.8", "F");           // patient sex → F
msg.setField("PID.5.1", "Jones");     // family name
msg.setField("PID.4[2].1", "MRN2");   // create third repetition of PID-4
```

###### Inherited from

[`Hl7Message`](#hl7message).[`setField`](#setfield)

##### toJSON()

> **toJSON**(): [`SerializedMessage`](#serializedmessage)

Emit this message as a structured `SerializedMessage` JSON projection.
Invoked automatically by `JSON.stringify(msg)`.
Re-walks `rawSegments` on every call (no caching), so on a lazily
parsed message it builds every segment not read yet. Mirrors the
raw tree one-for-one, preserves `isNull`, always includes
`warnings: []`, and includes `profile: { name, lineage }` only when
`this.profile` is truthy. Pure: never warns, never throws.

###### Returns

[`SerializedMessage`](#serializedmessage)

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
const snap = msg.toJSON();
console.log(snap.segments[0]?.name); // "MSH"
console.log(JSON.stringify(msg));     // same content, auto-invokes toJSON
```

###### Inherited from

[`Hl7Message`](#hl7message).[`toJSON`](#tojson)

##### toString()

> **toString**(): `string`

Emit this message as spec-clean HL7. Re-walks `rawSegments`
on every call (no caching), so on a lazily parsed message it builds
every segment not read yet. Segments are joined with `\r`;
MSH-1 and MSH-2 are inlined verbatim from
`this.encodingCharacters`; every field string passes through
`reescape`. `RawField.isNull === true` is preserved as the
HL7 literal `""`. Pure: never warns, never throws.

###### Returns

`string`

###### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
console.log(msg.toString()); // spec-clean, CR-separated HL7
```

###### Inherited from

[`Hl7Message`](#hl7message).[`toString`](#tostring)

***

### UsageOutcomes

The two usage outcomes a [DeclaredConditionalUsage](#declaredconditionalusage) token records: the
usage that applies when the condition is true, and the one that applies when
it is false. Both are simple codes.

#### Example

```ts
import type { UsageOutcomes } from "@cosyte/hl7";
const outcomes: UsageOutcomes = { whenTrue: "RE", whenFalse: "X" };
```

#### Properties

##### whenFalse

> `readonly` **whenFalse**: [`SimpleUsageCode`](#simpleusagecode)

The usage that applies when the condition is resolved false.

##### whenTrue

> `readonly` **whenTrue**: [`SimpleUsageCode`](#simpleusagecode)

The usage that applies when the condition is resolved true.

***

### UsageResolution

A caller-supplied resolution of one declared-conditional rule. The engine
evaluates no condition predicate and reads nothing from the message to decide
an outcome: **the caller decides**, and passes an ordered list of these
alongside the message and the profile.

The `segment` name plus the 1-indexed `field` (absent when the target is a
segment rule) is the LOCUS the resolution applies to. It applies to the RULE
at that locus, hence to every occurrence of the segment and every repetition
of the field: there is no per-occurrence resolution.

A resolution whose locus matches no declared rule, matches more than one, or
matches a rule whose usage is not a declared conditional is a profile defect
([FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed)), never a silent no-op.

#### Example

```ts
import type { UsageResolution } from "@cosyte/hl7";
// "PID-8's condition is true for this message."
const resolution: UsageResolution = { segment: "PID", field: 8, outcome: true };
```

#### Properties

##### field?

> `readonly` `optional` **field?**: `number`

1-indexed field position when the target is a field rule; absent for a segment rule.

##### outcome

> `readonly` **outcome**: `boolean`

`true` applies the token's true outcome, `false` its false outcome.

##### segment

> `readonly` **segment**: `string`

Segment name of the target rule (e.g. `"PID"`).

***

### VID

HL7 v2 Version Identifier (VID): the HL7 version a message claims, per HL7
Chapter 2. All 3 components are optional.

Component positions (HL7 1-indexed), the same names from v2.5 to v2.9:
1. versionId (HL7 Table 0104, e.g. "2.5.1")
2. internationalizationCode (nested coded element: a CE at v2.5, a CWE from
   v2.6; read as a CWE)
3. internationalVersionId (nested coded element, read as a CWE)

Used by MSH-12. `msg.meta.version` keeps reading MSH-12.1 alone.

#### Example

```ts
import type { VID } from "@cosyte/hl7";
const version: VID = { versionId: "2.5.1" };
```

#### Properties

##### extraComponents?

> `readonly` `optional` **extraComponents?**: readonly `string`[]

Components past the 3rd, preserved verbatim (first subcomponent of each)
and in order. OMITTED when there are none.

##### internationalizationCode?

> `readonly` `optional` **internationalizationCode?**: [`CWE`](#cwe-1)

VID.2 Internationalization Code (nested coded element).

##### internationalVersionId?

> `readonly` `optional` **internationalVersionId?**: [`CWE`](#cwe-1)

VID.3 International Version ID (nested coded element).

##### versionId?

> `readonly` `optional` **versionId?**: `string`

VID.1 Version ID.

***

### Visit

PV1-derived visit view. `msg.visit` is `undefined` when no PV1
segment exists; this interface describes the shape when present. The
doctor fields use XCN (not flat strings). Date/time fields are the
fidelity `TS` (precision + timezone preserved).

#### Example

```ts
import type { Visit } from "@cosyte/hl7";
const v: Visit = {
  patientClass: "I",
  location: { pointOfCare: "ICU", room: "101" },
  visitNumber: "VISIT001",
};
console.log(v.attendingDoctor?.familyName);
console.log(v.admitDateTime?.raw);
```

#### Properties

##### admitDateTime?

> `readonly` `optional` **admitDateTime?**: [`DtmParts`](#dtmparts)

PV1-44 admit date/time as the fidelity `TS`.

##### attendingDoctor?

> `readonly` `optional` **attendingDoctor?**: [`XCN`](#xcn-1)

PV1-7 attending doctor (XCN).

##### dischargeDateTime?

> `readonly` `optional` **dischargeDateTime?**: [`DtmParts`](#dtmparts)

PV1-45 discharge date/time as the fidelity `TS`.

##### location?

> `readonly` `optional` **location?**: [`PL`](#pl-1)

PV1-3 assigned patient location (ward / room / bed) as PL.

##### patientClass?

> `readonly` `optional` **patientClass?**: `string`

PV1-2 patient class ("I"=inpatient, "O"=outpatient, "E"=ER, ...).

##### referringDoctor?

> `readonly` `optional` **referringDoctor?**: [`XCN`](#xcn-1)

PV1-8 referring doctor (XCN).

##### visitNumber?

> `readonly` `optional` **visitNumber?**: `string`

PV1-19 visit number.

***

### VxuImmunization

Typed RXA (administered dose) content for [buildVxu](#buildvxu).

#### Example

```ts
import type { VxuImmunization } from "@cosyte/hl7";
const dose: VxuImmunization = {
  orderControl: "RE",
  administeredDateTime: "20260801",
  vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
  doseAmount: "0.5",
  doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
  completionStatus: "CP",
  actionCode: "A",
};
```

#### Properties

##### actionCode?

> `readonly` `optional` **actionCode?**: `string`

RXA-21 Action Code (`A` add, `D` delete, `U` update). Never defaulted.

##### administeredDateTime?

> `readonly` `optional` **administeredDateTime?**: `string` \| [`DtmParts`](#dtmparts)

RXA-3 Date/Time Start of Administration.

##### administrationSubIdCounter?

> `readonly` `optional` **administrationSubIdCounter?**: `string`

RXA-2 Administration Sub-ID Counter.

##### completionStatus?

> `readonly` `optional` **completionStatus?**: `string`

RXA-20 Completion Status (`CP`, `RE`, `NA`, `PA`).

##### doseAmount?

> `readonly` `optional` **doseAmount?**: `string` \| `number` \| [`NM`](#nm-1)

RXA-6 Administered Amount (emitted verbatim: the caller owns its precision).

##### doseUnits?

> `readonly` `optional` **doseUnits?**: [`CWE`](#cwe-1)

RXA-7 Administered Units.

##### expirationDate?

> `readonly` `optional` **expirationDate?**: `string` \| [`DtmParts`](#dtmparts)

RXA-16 Substance Expiration Date.

##### giveSubIdCounter?

> `readonly` `optional` **giveSubIdCounter?**: `string`

RXA-1 Give Sub-ID Counter.

##### informationSource?

> `readonly` `optional` **informationSource?**: [`CWE`](#cwe-1)

RXA-9 Administration Notes: the immunization information source (HL7 Table NIP001).

##### lotNumber?

> `readonly` `optional` **lotNumber?**: `string`

RXA-15 Substance Lot Number.

##### manufacturer?

> `readonly` `optional` **manufacturer?**: [`CWE`](#cwe-1)

RXA-17 Substance Manufacturer Name (MVX, HL7 Table 0227).

##### observations?

> `readonly` `optional` **observations?**: readonly [`OruObservation`](#oruobservation)[]

OBX children of this dose (eligibility, funding source, …).

##### orderControl?

> `readonly` `optional` **orderControl?**: `string`

ORC-1 Order Control of the ORC that opens this dose's order group. An ORC
is emitted only when this is supplied; the read side surfaces it as
`orderControl`.

##### refusalReason?

> `readonly` `optional` **refusalReason?**: [`CWE`](#cwe-1)

RXA-18 Substance/Treatment Refusal Reason: a refused dose carries this.

##### routes?

> `readonly` `optional` **routes?**: readonly [`VxuRoute`](#vxuroute)[]

RXR children of this dose (route / administration site).

##### vaccineCode?

> `readonly` `optional` **vaccineCode?**: [`CWE`](#cwe-1)

RXA-5 Administered Code (CVX, HL7 Table 0292).

***

### VxuRoute

Typed RXR (route/site) content grouped under one [VxuImmunization](#vxuimmunization).

#### Example

```ts
import type { VxuRoute } from "@cosyte/hl7";
const route: VxuRoute = {
  route: { identifier: "IM", text: "Intramuscular" },
  site: { identifier: "LD", text: "Left deltoid" },
};
```

#### Properties

##### route?

> `readonly` `optional` **route?**: [`CWE`](#cwe-1)

RXR-1 Route (HL7 Table 0162).

##### site?

> `readonly` `optional` **site?**: [`CWE`](#cwe-1)

RXR-2 Administration Site (HL7 Table 0163).

***

### XAD

HL7 v2 Extended Address (XAD): structured postal address per HL7 Chapter
2. All 12 components are optional. Fields are OMITTED when the underlying
component is absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. street: street address (house number + street name).
2. otherDesignation: apartment number, suite, floor, etc.
3. city
4. stateOrProvince
5. zipOrPostalCode
6. country (ISO-3166 3-letter, e.g. "USA", "CAN")
7. addressType (H=Home, B=Business, M=Mailing, O=Office, P=Permanent, ...)
8. otherGeographicDesignation
9. countyParishCode
10. censusTract
11. addressRepresentationCode
12. addressValidityRange

#### Example

```ts
import type { XAD } from "@cosyte/hl7";
const addr: XAD = { street: "123 Main St", city: "Boston", stateOrProvince: "MA" };
```

#### Properties

##### addressRepresentationCode?

> `readonly` `optional` **addressRepresentationCode?**: `string`

##### addressType?

> `readonly` `optional` **addressType?**: `string`

##### addressValidityRange?

> `readonly` `optional` **addressValidityRange?**: `string`

##### censusTract?

> `readonly` `optional` **censusTract?**: `string`

##### city?

> `readonly` `optional` **city?**: `string`

##### country?

> `readonly` `optional` **country?**: `string`

##### countyParishCode?

> `readonly` `optional` **countyParishCode?**: `string`

##### otherDesignation?

> `readonly` `optional` **otherDesignation?**: `string`

##### otherGeographicDesignation?

> `readonly` `optional` **otherGeographicDesignation?**: `string`

##### stateOrProvince?

> `readonly` `optional` **stateOrProvince?**: `string`

##### street?

> `readonly` `optional` **street?**: `string`

##### zipOrPostalCode?

> `readonly` `optional` **zipOrPostalCode?**: `string`

***

### XCN

HL7 v2 Extended Composite ID Number and Name for Persons (XCN): per HL7
Chapter 2.A.88. All 13 v1 components are optional. Fields are OMITTED when
the underlying component is absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. idNumber: e.g. employee ID, NPI digits, DEA number (CX-1 analogue)
2. familyName (XPN-1)
3. givenName (XPN-2)
4. secondName: second and further given names (XPN-3)
5. suffix: Jr., III, etc. (XPN-4)
6. prefix: Dr., Mrs., etc. (XPN-5)
7. degree: MD, PhD, etc. (XPN-6)
8. sourceTable
9. assigningAuthority: nested HD (CX-4 analogue)
10. nameTypeCode: L=Legal, M=Maiden, N=Nickname, ... (XPN-7)
11. identifierCheckDigit
12. checkDigitScheme: ISO 7064, M10, M11, NPI
13. identifierTypeCode: "NPI", "DN" (DEA number), ... (CX-5 analogue)

#### Example

```ts
import type { XCN } from "@cosyte/hl7";
const orderingProvider: XCN = {
  idNumber: "1234567890",
  familyName: "Smith",
  givenName: "Jane",
  identifierTypeCode: "NPI",
};
```

#### Properties

##### assigningAuthority?

> `readonly` `optional` **assigningAuthority?**: [`HD`](#hd-1)

##### checkDigitScheme?

> `readonly` `optional` **checkDigitScheme?**: `string`

##### degree?

> `readonly` `optional` **degree?**: `string`

##### familyName?

> `readonly` `optional` **familyName?**: `string`

##### givenName?

> `readonly` `optional` **givenName?**: `string`

##### identifierCheckDigit?

> `readonly` `optional` **identifierCheckDigit?**: `string`

##### identifierTypeCode?

> `readonly` `optional` **identifierTypeCode?**: `string`

##### idNumber?

> `readonly` `optional` **idNumber?**: `string`

##### nameTypeCode?

> `readonly` `optional` **nameTypeCode?**: `string`

##### prefix?

> `readonly` `optional` **prefix?**: `string`

##### secondName?

> `readonly` `optional` **secondName?**: `string`

##### sourceTable?

> `readonly` `optional` **sourceTable?**: `string`

##### suffix?

> `readonly` `optional` **suffix?**: `string`

***

### XPN

HL7 v2 Extended Person Name (XPN): structured name per HL7 Chapter 2. All
14 components are optional. Fields are OMITTED when the underlying
component is absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. familyName
2. givenName
3. secondName (or "second and further given names")
4. suffix (e.g. Jr., III)
5. prefix (e.g. Dr., Mrs.)
6. degree (e.g. MD, PhD)
7. nameTypeCode (L=Legal, M=Maiden, N=Nickname, S=Coded Pseudo-Name, ...)
8. nameRepresentationCode
9. nameContext (flattened to string in v1: CWE nesting is out of scope)
10. nameValidityRange
11. nameAssemblyOrder (F=family first, G=given first)
12. effectiveDate (raw HL7 TS string: caller may parse via parseDtm)
13. expirationDate
14. professionalSuffix

#### Example

```ts
import type { XPN } from "@cosyte/hl7";
const name: XPN = { familyName: "Smith", givenName: "Jane", prefix: "Mrs." };
```

#### Properties

##### degree?

> `readonly` `optional` **degree?**: `string`

##### effectiveDate?

> `readonly` `optional` **effectiveDate?**: `string`

##### expirationDate?

> `readonly` `optional` **expirationDate?**: `string`

##### familyName?

> `readonly` `optional` **familyName?**: `string`

##### givenName?

> `readonly` `optional` **givenName?**: `string`

##### nameAssemblyOrder?

> `readonly` `optional` **nameAssemblyOrder?**: `string`

##### nameContext?

> `readonly` `optional` **nameContext?**: `string`

##### nameRepresentationCode?

> `readonly` `optional` **nameRepresentationCode?**: `string`

##### nameTypeCode?

> `readonly` `optional` **nameTypeCode?**: `string`

##### nameValidityRange?

> `readonly` `optional` **nameValidityRange?**: `string`

##### prefix?

> `readonly` `optional` **prefix?**: `string`

##### professionalSuffix?

> `readonly` `optional` **professionalSuffix?**: `string`

##### secondName?

> `readonly` `optional` **secondName?**: `string`

##### suffix?

> `readonly` `optional` **suffix?**: `string`

***

### XTN

HL7 v2 Extended Telecommunication Number (XTN): structured telecom per
HL7 Chapter 2. All 12 v1 components are optional. Fields are OMITTED when
the underlying component is absent (exactOptionalPropertyTypes).

Component positions (HL7 1-indexed; this interface is 0-indexed by key):
1. telephoneNumber: formatted or unformatted phone number
2. telecommunicationUseCode: PRN=Primary Residence, WPN=Work, NET=Internet,
   ORN=Other Residence, BPN=Beeper, VHN=Vacation Home, ASN=Answering
   Service, EMR=Emergency, ...
3. telecommunicationEquipmentType: PH=Phone, FX=Fax, MD=Modem,
   CP=Cellular Phone, BP=Beeper, Internet, X.400, TDD, TTY
4. emailAddress
5. countryCode (e.g. "+1")
6. areaCityCode
7. localNumber
8. extension
9. anyText: free-text note
10. extensionPrefix (e.g. "x")
11. speedDialCode
12. unformattedTelephoneNumber

#### Example

```ts
import type { XTN } from "@cosyte/hl7";
const phone: XTN = {
  telephoneNumber: "(555) 555-1234",
  telecommunicationUseCode: "WPN",
  telecommunicationEquipmentType: "PH",
};
```

#### Properties

##### anyText?

> `readonly` `optional` **anyText?**: `string`

##### areaCityCode?

> `readonly` `optional` **areaCityCode?**: `string`

##### countryCode?

> `readonly` `optional` **countryCode?**: `string`

##### emailAddress?

> `readonly` `optional` **emailAddress?**: `string`

##### extension?

> `readonly` `optional` **extension?**: `string`

##### extensionPrefix?

> `readonly` `optional` **extensionPrefix?**: `string`

##### localNumber?

> `readonly` `optional` **localNumber?**: `string`

##### speedDialCode?

> `readonly` `optional` **speedDialCode?**: `string`

##### telecommunicationEquipmentType?

> `readonly` `optional` **telecommunicationEquipmentType?**: `string`

##### telecommunicationUseCode?

> `readonly` `optional` **telecommunicationUseCode?**: `string`

##### telephoneNumber?

> `readonly` `optional` **telephoneNumber?**: `string`

##### unformattedTelephoneNumber?

> `readonly` `optional` **unformattedTelephoneNumber?**: `string`

## Type Aliases

### AckCode

> **AckCode** = *typeof* [`ACK_CODES`](#ack_codes)\[keyof *typeof* [`ACK_CODES`](#ack_codes)\]

Acknowledgment code union (HL7 Table 0008). Narrow on this to know whether a
disposition is accept (`AA`/`CA`), error (`AE`/`CE`), or reject (`AR`/`CR`).

***

### AckCondition

> **AckCondition** = *typeof* [`ACK_CONDITIONS`](#ack_conditions)\[keyof *typeof* [`ACK_CONDITIONS`](#ack_conditions)\]

Accept/application acknowledgment condition union (HL7 Table 0155).

***

### AckMode

> **AckMode** = `"original"` \| `"enhanced"`

The two HL7 acknowledgment modes. **original** = both MSH-15 and MSH-16 are
absent/null; **enhanced** = either is present (HL7 v2 Chapter 2 §2.9).

***

### AllergySource

> **AllergySource** = `"AL1"` \| `"IAM"`

The segment an [Allergy](#allergy) entry was read from: `"AL1"` (Patient Allergy
Information) or `"IAM"` (Patient Adverse Reaction Information, the segment an
ADT^A60 carries in place of AL1).

#### Example

```ts
import type { AllergySource } from "@cosyte/hl7";
const source: AllergySource = "IAM";
```

***

### BatchEnvelopeName

> **BatchEnvelopeName** = `"FHS"` \| `"BHS"` \| `"BTS"` \| `"FTS"`

The four HL7 batch-protocol envelope segment names (Ch. 2 §2.10.3).

#### Example

```ts
import type { BatchEnvelopeName } from "@cosyte/hl7";
const trailer: BatchEnvelopeName = "BTS";
```

***

### BatchMessageEntry

> **BatchMessageEntry**\<`M`\> = \{ `message`: `M`; `ok`: `true`; `position`: [`Hl7Position`](#hl7position); `raw`: `string`; \} \| \{ `error`: [`Hl7ParseError`](#hl7parseerror); `ok`: `false`; `position`: [`Hl7Position`](#hl7position); `raw`: `string`; \}

One message extracted from a batch stream. Discriminated on `ok`: a
successful parse carries the `Hl7Message` (whose own `.warnings` hold any
per-message Tier-2 deviations); a message that hit one of the four Tier-3
fatal conditions carries the `Hl7ParseError` instead: **isolated**, so the
rest of the batch still yields. `raw` is the message's verbatim source
(re-parseable by [parseHL7](#parsehl7)); `position` is the message's `MSH` (or,
for pre-`MSH` stray content, its first) segment index in the stream.

`M` is the parsed-message type each `ok` entry carries. It is `Hl7Message`
unless the split was given a statically known profile, in which case it is
that profile's narrowed view and `entry.message.part("ZDP")?.get(name)` is
checked against the names the profile declares for `ZDP`.

#### Type Parameters

##### M

`M` *extends* [`Hl7Message`](#hl7message) = [`Hl7Message`](#hl7message)

the message type an `ok` entry carries.

#### Example

```ts
import { splitBatch } from "@cosyte/hl7";
for (const entry of splitBatch(raw).messages) {
  if (entry.ok) handle(entry.message);
  else quarantine(entry.raw, entry.error.code);
}
```

***

### CharsetTreatment

> **CharsetTreatment** = `"decode"` \| `"verbatim"`

How the parser treats a resolved MSH-18 character set.

- `decode`: decode the byte stream to text with [CharsetResolution.decoder](#decoder).
- `verbatim`: read the raw bytes as a 1:1 `latin1` mapping; do not decode
  (byte-recoverable for single-byte content: see the module header).

***

### CompositeKind

> **CompositeKind** = `"XPN"` \| `"XAD"` \| `"CX"` \| `"CWE"` \| `"CE"` \| `"XTN"` \| `"PL"` \| `"TS"` \| `"NM"` \| `"HD"` \| `"XCN"` \| `"EI"` \| `"EIP"` \| `"CNE"` \| `"DR"` \| `"MO"` \| `"CP"` \| `"CQ"` \| `"VID"` \| `"MSG"` \| `"PT"` \| `"FC"`

The 22 typed composite kinds this module can encode. Mirrors the read-side
composite set (`XPN`, `XAD`, `CX`, `CWE`, `CE`, `XTN`, `PL`, `TS`, `NM`,
`HD`, `XCN`, `EI`, `EIP`, `CNE`, `DR`, `MO`, `CP`, `CQ`, `VID`, `MSG`, `PT`,
`FC`).

***

### ConditionPredicate

> **ConditionPredicate** = [`PresencePredicate`](#presencepredicate) \| [`ComparisonPredicate`](#comparisonpredicate) \| [`ConnectedPredicate`](#connectedpredicate)

A **condition predicate**: the computable test a conditionally-used element's
usage is decided by, expressed in the published condition-predicate language
as a presence statement, a comparison statement, or two of those joined by a
connector.

A rule declares one on its `condition`, and only a rule whose usage is
conditional (`C`, `CE`, or a declared conditional such as `C(RE/X)`) may
carry one: there is nothing for a predicate to decide anywhere else, so a
predicate on any other rule is `PROFILE_MALFORMED` rather than a silent
no-op. A rule may not declare a predicate AND take a caller-supplied
resolution: that too is `PROFILE_MALFORMED`, so neither source is silently
preferred over the other.

**The predicate reads the message only.** It never makes a network call and
never consults a bundled code set: every value it compares against is one the
profile author wrote down.

**Declare exactly one of `presence`, `verb` and `connector`, and OMIT the
others.** A key set to `undefined` still declares it, so a statement
assembled from an options bag has to leave out the keys it does not use
rather than pass them through empty. A statement declaring two of them is
`PROFILE_MALFORMED`: the engine will not guess which question was meant,
because deciding a conditional element's usage from the wrong question turns
a required element into a permitted absence.

#### Example

```ts
import type { ConditionPredicate } from "@cosyte/hl7";
const simple: ConditionPredicate = {
  location: { segment: "PID", field: 7 },
  presence: "is valued",
};
const complex: ConditionPredicate = {
  connector: "OR",
  left: simple,
  right: { location: { segment: "PID", field: 8 }, verb: "is", values: ["M", "F"] },
};
```

***

### DeclaredConditionalUsage

> **DeclaredConditionalUsage** = `` `C(${SimpleUsageCode}/${SimpleUsageCode})` ``

A **declared conditional** usage token: `C(t/f)`, where `t` is the usage that
applies when the condition is true and `f` the usage that applies when it is
false. Both outcomes are [SimpleUsageCode](#simpleusagecode)s; the token is uppercase,
carries no whitespace, and does not nest (`C(C(R/X)/O)` is not one).

A rule declared `C(R/X)` is Required when the condition holds and
Not-permitted when it does not. Two sources can decide that, and a rule uses
exactly one of them: the [ConditionPredicate](#conditionpredicate) on its `condition`, which
the engine evaluates against the message, or a caller-supplied
[UsageResolution](#usageresolution). Declaring both at one locus is
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed), never a silent preference.

With neither supplied, the rule is evaluated exactly as a `C` rule with no
predicate is: presence not evaluated, every other constraint applied as
usual.

#### Example

```ts
import type { DeclaredConditionalUsage } from "@cosyte/hl7";
const usage: DeclaredConditionalUsage = "C(RE/X)";
```

***

### DftPatient

> **DftPatient** = [`AdtPatient`](#adtpatient)

Typed PID content for [buildDft](#builddft): the same shape every family shares.

#### Example

```ts
import type { DftPatient } from "@cosyte/hl7";
const patient: DftPatient = {
  identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
  accountNumber: { idNumber: "ACCT-1", identifierTypeCode: "AN" },
};
```

***

### DtmPrecision

> **DtmPrecision** = `"year"` \| `"month"` \| `"day"` \| `"hour"` \| `"minute"` \| `"second"` \| `"fraction"`

Stated precision of a parsed HL7 DTM value: the number of populated
characters (excluding the timezone offset) determines which level applies.
A value's precision is preserved verbatim: `|1970|` is `"year"`, never
silently promoted to a full timestamp.

#### Example

```ts
import { parseDtm } from "@cosyte/hl7";
console.log(parseDtm("1970").precision);           // "year"
console.log(parseDtm("198807050000").precision);   // "minute"
```

***

### ErrSeverity

> **ErrSeverity** = *typeof* [`ERR_SEVERITIES`](#err_severities)\[keyof *typeof* [`ERR_SEVERITIES`](#err_severities)\]

Error-severity union (HL7 Table 0516, ERR-4).

***

### FatalCode

> **FatalCode** = *typeof* [`FATAL_CODES`](#fatal_codes)\[keyof *typeof* [`FATAL_CODES`](#fatal_codes)\]

The four Tier-3 fatal codes, the type over the `FATAL_CODES` registry.
`FATAL_CODES` is locked at four, so an exhaustive `switch` over a
`FatalCode` value stays exhaustive.

**It is not the whole type of `Hl7ParseError.code`.** Under
`{ strict: true }` a Tier-2 warning is thrown as an `Hl7ParseError` whose
`code` is that warning's [WarningCode](#warningcode), so `Hl7ParseError.code` is
`FatalCode | WarningCode`. A `switch` over a caught error's `code` needs a
`default` branch for the escalated warnings; see [Hl7ParseError](#hl7parseerror).

#### Example

```ts
import type { FatalCode } from "@cosyte/hl7";
function describe(code: FatalCode): string {
  switch (code) {
    case "EMPTY_INPUT":
      return "input was empty";
    case "NO_MSH_SEGMENT":
      return "missing MSH";
    case "MSH_TOO_SHORT":
      return "MSH truncated";
    case "INVALID_ENCODING_CHARACTERS":
      return "bad MSH-1/MSH-2";
  }
}
```

***

### FindingCode

> **FindingCode** = *typeof* [`FINDING_CODES`](#finding_codes)\[keyof *typeof* [`FINDING_CODES`](#finding_codes)\]

Discriminant union of every [ConformanceFinding](#conformancefinding) code. Enables
exhaustive `switch` narrowing (the `switch-exhaustiveness-check` lint rule).

***

### FindingSeverity

> **FindingSeverity** = `"error"` \| `"warning"` \| `"info"`

Severity of a [ConformanceFinding](#conformancefinding). `error` is a constraint violation;
`warning` / `info` are author-downgraded advisories (via a rule's
`severity`). [FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed) is always `error`.

***

### Hl7ReadSource

> **Hl7ReadSource** = `string` \| `Uint8Array` \| `ReadableStream`\<`string` \| `Uint8Array`\> \| `AsyncIterable`\<`string` \| `Uint8Array`\> \| `Iterable`\<`string` \| `Uint8Array`\>

What `readMessages()` and `readSegments()` read: the whole input as one string or one
`Uint8Array` (a Node `Buffer` is one), or its chunks from a web `ReadableStream`, a Node
`Readable`, or any async or plain iterable. Chunks are all strings or all bytes. Bytes are read
as `parseHL7` reads a `Buffer`: in the character set MSH-18 declares, or `options.charset`.

#### Example

```ts
import { createReadStream } from "node:fs";
import type { Hl7ReadSource } from "@cosyte/hl7";

const fromFile: Hl7ReadSource = createReadStream("feed.hl7");
const fromFetch: Hl7ReadSource = (await fetch(url)).body!;
const fromText: Hl7ReadSource = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r";
```

***

### Hl7StreamSource

> **Hl7StreamSource** = `AsyncIterable`\<`string` \| `Buffer` \| `Uint8Array`\> \| `Iterable`\<`string` \| `Buffer` \| `Uint8Array`\>

A chunked source `parseStream` can consume: a Node `Readable`, any
async-iterable, or any plain iterable of chunks. Chunks are `string`
(text stream) or `Buffer`/`Uint8Array` (binary stream). A real Node stream in
binary mode yields `Buffer`s; in text mode it yields `string`s: a source is
expected to be **homogeneous** (all-text or all-binary), which every real
`Readable` is. A binary chunk is decoded 1:1 via `latin1` (a lossless
byte↔codepoint mapping) so each message's own MSH-18 charset resolution runs
on its original bytes, exactly as [splitBatch](#splitbatch) does.

#### Example

```ts
import { createReadStream } from "node:fs";
import { parseStream } from "@cosyte/hl7";

const src: Hl7StreamSource = createReadStream("feed.hl7");
for await (const entry of parseStream(src)) {
  if (entry.ok) handle(entry.message);
  else quarantine(entry.raw, entry.error.code);
}
```

***

### IdentityEventKind

> **IdentityEventKind** = `"merge"` \| `"move"` \| `"change"` \| `"link"` \| `"unlink"` \| `"add"` \| `"update"`

Classification of a recognized identity trigger event.

- `merge`: A18 / A34 / A35 / A36 / A39 / A40 / A41 / A42 (MRG expected).
  Two patient records become one; the prior record is retired.
- `move`: A43 / A44 / A45 (MRG expected). Information moves between
  identifier lists, accounts or visits that both go on existing.
- `change`: A47 / A49 / A50 / A51, the change-identifier family (MRG
  expected). One identifier is replaced by another on the SAME record:
  the direction is still MRG (prior) to PID (surviving), but no records are
  being conflated, so a consumer must not treat it as a patient merge.
- `link` / `unlink`: A24 / A37 (two PID groups, no MRG)
- `add` / `update`: A28 / A31 (person add/update, no MRG)

#### Example

```ts
import type { IdentityEventKind } from "@cosyte/hl7";
const kind: IdentityEventKind = "merge";
```

***

### IdentityRole

> **IdentityRole** = `"surviving"` \| `"prior"` \| `"linked"` \| `"subject"`

Role of one party in an identity event. `surviving` / `subject` / `linked`
parties are ONLY ever sourced from PID (+ PV1); `prior` parties are ONLY
ever sourced from MRG. That is the role-labelling invariant.

#### Example

```ts
import type { IdentityRole } from "@cosyte/hl7";
const role: IdentityRole = "surviving";
```

***

### ImmunizationRecordOrigin

> **ImmunizationRecordOrigin** = `"administered"` \| `"historical"`

Whether an `Immunization` records a dose that was **administered** by the
reporting system or is **historical** information sourced from elsewhere,
derived conservatively from RXA-9.1 against HL7 Table NIP001 (Immunization
Information Source, CDC v2.5.1 Immunization Messaging IG):
- `"administered"`: RXA-9.1 is exactly `"00"` (New immunization record).
- `"historical"`: RXA-9.1 is `"01".."08"` (any "Historical information …"
  source).

**Fail-safe:** this is OMITTED (never guessed) when RXA-9 is absent or carries
a code outside the NIP001 administered/historical set. The raw RXA-9 claim is
always preserved verbatim on `Immunization.informationSource`, so a consumer
can inspect the original code even when `recordOrigin` is undefined. The
distinction matters because an IIS de-duplicates a *historical* report
differently from a dose it believes was *administered*: guessing corrupts
the registry.

***

### ImmunizationStatusBasis

> **ImmunizationStatusBasis** = \{ `field`: `"RXA-20"`; `map`: [`ImmunizationStatusMap`](#immunizationstatusmap); `table`: [`ImmunizationStatusTable`](#immunizationstatustable) & `object`; \} \| \{ `field`: `"RXA-21"`; `table`: [`ImmunizationStatusTable`](#immunizationstatustable) & `object`; \} \| \{ `codeSet`: [`ImmunizationStatusCodeSet`](#immunizationstatuscodeset); `field`: `"RXA-5"`; \}

What decided an [ImmunizationAdministrationStatus](#immunizationadministrationstatus-1): the RXA field the
deciding rule read, and the table, map or code set it read that field
against. Discriminated on `field`.

- `"RXA-21"`: the action code decided (`"delete-requested"`, or
  `"undetermined"` for an RXA-21 outside Table 0323).
- `"RXA-5"`: the vaccine code decided (`"no-vaccine-administered"`, or
  `"undetermined"` for a CVX `998` contradicted by the other triplet).
- `"RXA-20"`: the completion status decided, by the Table 0322 map.

#### Union Members

##### Type Literal

\{ `field`: `"RXA-20"`; `map`: [`ImmunizationStatusMap`](#immunizationstatusmap); `table`: [`ImmunizationStatusTable`](#immunizationstatustable) & `object`; \}

###### field

> `readonly` **field**: `"RXA-20"`

RXA-20 Completion Status decided.

###### map

> `readonly` **map**: [`ImmunizationStatusMap`](#immunizationstatusmap)

The Table 0322 to Event Status map the classification followed.

###### table

> `readonly` **table**: [`ImmunizationStatusTable`](#immunizationstatustable) & `object`

HL7 Table 0322, the table RXA-20 was read against.

###### Type Declaration

###### name

> `readonly` **name**: `"HL7 Table 0322"`

***

##### Type Literal

\{ `field`: `"RXA-21"`; `table`: [`ImmunizationStatusTable`](#immunizationstatustable) & `object`; \}

###### field

> `readonly` **field**: `"RXA-21"`

RXA-21 Action Code decided.

###### table

> `readonly` **table**: [`ImmunizationStatusTable`](#immunizationstatustable) & `object`

HL7 Table 0323, the table RXA-21 was read against.

###### Type Declaration

###### name

> `readonly` **name**: `"HL7 Table 0323"`

***

##### Type Literal

\{ `codeSet`: [`ImmunizationStatusCodeSet`](#immunizationstatuscodeset); `field`: `"RXA-5"`; \}

###### codeSet

> `readonly` **codeSet**: [`ImmunizationStatusCodeSet`](#immunizationstatuscodeset)

The CDC CVX code set, for code `998`.

###### field

> `readonly` **field**: `"RXA-5"`

RXA-5 Administered Code decided.

#### Example

```ts
import type { ImmunizationStatusBasis } from "@cosyte/hl7";
const basis: ImmunizationStatusBasis = {
  field: "RXA-21",
  table: { name: "HL7 Table 0323", version: "3.0.0" },
};
```

***

### ImmunizationStatusClass

> **ImmunizationStatusClass** = `"completed"` \| `"not-done"` \| `"no-vaccine-administered"` \| `"delete-requested"` \| `"undetermined"`

What an immunization record's administration status classifies to.
`"completed"` and `"not-done"` are the target codes of HL7's published
Table 0322 to Event Status map (RXA-20 `CP` and `PA` are `"completed"`,
`RE` and `NA` are `"not-done"`).

- `"no-vaccine-administered"`: RXA-5 carries CDC CVX code `998` ("no
  vaccine administered"), whatever RXA-20 says.
- `"delete-requested"`: RXA-21 is exactly `D`. The record asks the receiver
  to delete an administration sent earlier; it is not a dose.
- `"undetermined"`: this library's fail-safe, not a map target. It covers an
  absent, empty or `""` (null) RXA-20, any RXA-20 or RXA-21 that is not
  exactly one code of its table (a lowercase code, whitespace around it, a
  code written as an escape sequence, a VT or FS byte inside the field, more
  than one repetition, component or subcomponent), and an RXA-5 that codes
  CVX `998` in one triplet and a different identifier in the other.

Only `"completed"` counts as a dose given. An `"undetermined"` record is
never a dose by default: read the raw codes and decide.

#### Example

```ts
import type { ImmunizationStatusClass } from "@cosyte/hl7";
const notADose: readonly ImmunizationStatusClass[] = [
  "not-done",
  "no-vaccine-administered",
  "delete-requested",
  "undetermined",
];
```

***

### MdmObservation

> **MdmObservation** = [`OruObservation`](#oruobservation)

Typed OBX content for [buildMdm](#buildmdm): one line of the transcribed body.

#### Example

```ts
import type { MdmObservation } from "@cosyte/hl7";
const line: MdmObservation = { setId: "1", valueType: "TX", value: "Discharge summary text." };
```

***

### MdmPatient

> **MdmPatient** = [`AdtPatient`](#adtpatient)

Typed PID content for [buildMdm](#buildmdm): the same shape every family shares.

#### Example

```ts
import type { MdmPatient } from "@cosyte/hl7";
const patient: MdmPatient = {
  identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
  name: { familyName: "Test", givenName: "Ann" },
};
```

***

### MedicationContext

> **MedicationContext** = `"order"` \| `"encoded"` \| `"dispense"` \| `"administration"`

Which pharmacy/treatment segment a `Medication` was extracted from: the
clinical "phase" of the medication. Each value maps 1:1 to one RX* parent
segment (Ch. 4A):
- `"order"`: **RXO** (Pharmacy/Treatment Order): the originally *requested*
  give code/amount/dosage-form, before pharmacy encoding.
- `"encoded"`: **RXE** (Encoded Order): the pharmacy-encoded give
  code/amount, plus the give *strength* (RXE-25/26): the only context that
  carries a separate strength.
- `"dispense"`: **RXD** (Dispense): what was actually dispensed.
- `"administration"`: **RXA** (Administration): what was actually given to
  the patient.

The context is preserved verbatim and never collapsed: an RDE order that
carries both an RXO request and an RXE encoded line surfaces as TWO
`Medication` entries with distinct contexts: the helper never reconciles
one against the other.

***

### Observation

> **Observation** = [`ObservationBase`](#observationbase) & (\{ `value`: `number` \| `undefined`; `valueType`: `"NM"`; \} \| \{ `value`: [`SN`](#sn) \| `undefined`; `valueType`: `"SN"`; \} \| \{ `value`: [`TS`](#ts-1) \| `undefined`; `valueType`: `"TS"` \| `"DT"`; \} \| \{ `value`: [`CWE`](#cwe-1) \| [`CE`](#ce) \| `undefined`; `valueType`: `"CWE"` \| `"CE"`; \} \| \{ `value`: `string` \| `undefined`; `valueType`: `string`; \})

One OBX segment as a typed Observation. `value` is discriminated by
`valueType` (OBX-2):
- `"NM"` → `number | undefined`
- `"SN"` → `SN | undefined` (structured numeric: comparator / range / ratio)
- `"TS" | "DT"` → `TS | undefined` (fidelity parts preserved)
- `"CWE" | "CE"` → `CWE | CE | undefined` (the full composite)
- other (`"ST"`, `"TX"`, `"FT"`, `"ID"`, `"IS"`, `"NA"`, unknown) →
  `string | undefined` (decoded)

`value` is `undefined` when OBX-5 is empty OR malformed for its
declared type (never throws, never `NaN`). A `TS`/`DT` value is always the
`TS` structure; check its `.valid` flag rather than expecting a `Date`.

#### Example

```ts
import type { Observation } from "@cosyte/hl7";
const glucose: Observation = {
  setId: "1",
  identifier: { identifier: "GLU", text: "Glucose" },
  valueType: "NM",
  value: 120,
  units: { identifier: "mg/dL" },
  referenceRange: "80-110",
  abnormalFlags: "H",
  status: "F",
  resultStatus: {
    classification: "final",
    code: "F",
    table: { name: "HL7 Table 0085", version: "3.0.0" },
    map: {
      url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
      version: "1.0.0",
    },
  },
};
```

***

### OnWarningCallback

> **OnWarningCallback** = (`warning`) => `void`

Callback invoked inline each time the parser emits a Tier-2 warning.
Always fires BEFORE the warning is appended to `Hl7Message.warnings` so
consumers observe warnings in the same order the parser discovered them.

#### Parameters

##### warning

[`Hl7ParseWarning`](#hl7parsewarning)

#### Returns

`void`

#### Example

```ts
import { parseHL7, type OnWarningCallback } from "@cosyte/hl7";
const onWarning: OnWarningCallback = (w) => {
  console.warn(w.code, w.message);
};
parseHL7(raw, { onWarning });
```

***

### OrmObservation

> **OrmObservation** = [`OruObservation`](#oruobservation)

Typed OBX content for [buildOrm](#buildorm): an observation carried with the order.

#### Example

```ts
import type { OrmObservation } from "@cosyte/hl7";
const note: OrmObservation = { setId: "1", valueType: "ST", value: "Fasting" };
```

***

### OrmPatient

> **OrmPatient** = [`AdtPatient`](#adtpatient)

Typed PID content for [buildOrm](#buildorm): the same shape every family shares.

#### Example

```ts
import type { OrmPatient } from "@cosyte/hl7";
const patient: OrmPatient = { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } };
```

***

### OruPatient

> **OruPatient** = [`AdtPatient`](#adtpatient)

Typed PID content for [buildOru](#buildoru). Reuses [AdtPatient](#adtpatient): the
patient-identification shape is identical across message families.

***

### OverlayKey

> **OverlayKey** = keyof [`OverlayStructures`](#overlaystructures)

Every string [Hl7Message.is](#is) narrows on: one key per (message code,
trigger event) pair the structure registry recognizes, plus a code-only key
for each registry entry that matches on message code alone.

Any other string is a documented `false`, never a throw: the three-component
MSH-9 form (`"ADT^A01^ADT_A01"`) is not a key, because `is` compares the pair
the parser already extracted rather than parsing its own argument, and a
caller who wants a raw comparison has `msg.meta.type`.

#### Example

```ts
import type { OverlayKey } from "@cosyte/hl7";
const key: OverlayKey = "ORU^R01";
// const nope: OverlayKey = "ADT^A01^ADT_A01"; // not a key: does not compile
```

***

### OverlayMessageCode

> **OverlayMessageCode**\<`K`\> = `K` *extends* `` `${infer C}^${string}` `` ? `C` : `K`

The MSH-9.1 message code one overlay key names, as a literal type.

#### Type Parameters

##### K

`K` *extends* [`OverlayKey`](#overlaykey)

#### Example

```ts
import type { OverlayMessageCode } from "@cosyte/hl7";
type Code = OverlayMessageCode<"ORU^R01">; // "ORU"
```

***

### OverlayRequiredSegment

> **OverlayRequiredSegment**\<`K`\> = [`OverlayStructures`](#overlaystructures)\[`K`\]\[`number`\]

The segment names one overlay key's published structure marks required: the
names `part` and `parts` accept on a message narrowed to that key.

#### Type Parameters

##### K

`K` *extends* [`OverlayKey`](#overlaykey)

#### Example

```ts
import type { OverlayRequiredSegment } from "@cosyte/hl7";
type A01Segments = OverlayRequiredSegment<"ADT^A01">; // "EVN" | "MSH" | "PID" | "PV1"
```

***

### OverlayTriggerEvent

> **OverlayTriggerEvent**\<`K`\> = `K` *extends* `` `${string}^${infer E}` `` ? `E` : `never`

The MSH-9.2 trigger event one overlay key names, as a literal type, or
`never` for a code-only key. A code-only key (`"ACK"`) constrains MSH-9.2 to
nothing at all, since it carries the acknowledged message's trigger event, so
a message narrowed to one keeps the base `triggerEvent?: string`.

#### Type Parameters

##### K

`K` *extends* [`OverlayKey`](#overlaykey)

#### Example

```ts
import type { OverlayTriggerEvent } from "@cosyte/hl7";
type Event = OverlayTriggerEvent<"ORU^R01">; // "R01"
type None = OverlayTriggerEvent<"ACK">;      // never: MSH-9.2 is unconstrained
```

***

### PredicateConnector

> **PredicateConnector** = `"AND"` \| `"OR"` \| `"XOR"`

The connectors that join two condition-predicate statements, with the
published semantics: `AND` is true only when both operands are true, `OR`
when at least one is, `XOR` when exactly one is.

#### Example

```ts
import type { PredicateConnector } from "@cosyte/hl7";
const connector: PredicateConnector = "AND";
```

***

### PredicatePresence

> **PredicatePresence** = `"is valued"` \| `"is not valued"`

The two proposition statements that ask whether an element carries content,
from the published condition-predicate language (`IF CWE.1 (Identifier) is
valued`).

**A presence statement is always determinate**: an element the message does
not carry is simply not valued, which is an answer rather than a gap. That is
what separates it from a comparison, which needs content to compare and has
none when the element is absent.

#### Example

```ts
import type { PredicatePresence } from "@cosyte/hl7";
const statement: PredicatePresence = "is valued";
```

***

### PredicateVerb

> **PredicateVerb** = `"is"` \| `"is not"` \| `"contains"` \| `"does not contain"` \| `"matches"` \| `"does not match"`

The closed set of verbs a comparison statement may use, from the published
condition-predicate language's verb table. Each pairs the element's content
against the statement's value list:

- **`is` / `is not`**: the value equals (does not equal) a listed value,
  whole and case-sensitive.
- **`contains` / `does not contain`**: the value carries (does not carry) a
  listed value as a substring, case-sensitive.
- **`matches` / `does not match`**: the value matches (does not match) a
  listed value read as a regular expression, anchored over the whole value.

**A negative verb negates the COMPARISON, not the statement.** Each pair is an
exact complement value by value, and both halves are quantified the same way:
existentially, over every repetition of the field and every occurrence of the
segment the location names (see [ComparisonPredicate](#comparisonpredicate)). Three
consequences, and the second is the one that surprises:

- Where the message carries exactly ONE value at that location, the pair
  behaves as an exact complement: one of the two decides true and the other
  false.
- Where the location REPEATS, both halves can decide true at once, because
  both are existential. `PID-3.1 is 'MRN1'` asks whether SOME identifier is
  `MRN1`, and `PID-3.1 is not 'MRN1'` asks whether SOME identifier is not
  `MRN1`; for `MRN1~MRN2` the answer to both is yes. So a negative verb is
  NOT a way to ask whether no repetition is a listed value: the language
  carries no negation connector, so that question cannot be written at all,
  and `AL1-3.1 is not 'PENICILLIN'` decides true for a patient who has that
  allergy and one other.
- Where the message carries no value at that location, neither half decides.
  The comparison is unevaluatable whichever verb it uses.

#### Example

```ts
import type { PredicateVerb } from "@cosyte/hl7";
const verb: PredicateVerb = "contains";
```

***

### ProfileFieldName

> **ProfileFieldName**\<`P`, `S`\> = `P` *extends* `object` ? `DeclaredFieldName`\<`C`, `S`\> : `string`

The field names profile `P` declares for segment type `S`, as a closed union
of string literals, or `string` when the compiler cannot know them.

`string` is the answer for every case where a declaration is not statically
visible, and there are more of those than there are narrowing ones: a value
typed as the general [Profile](#profile-2) interface, a segment type the profile
does not declare, a segment declared with an empty field map, and a
declaration map typed with an index signature. Narrowing is per segment type,
never a flat union of every name the profile declares.

#### Type Parameters

##### P

`P`

##### S

`S` *extends* `string`

#### Example

```ts
import { defineProfile, type ProfileFieldName } from "@cosyte/hl7";
const epic = defineProfile({
  name: "epic",
  customSegments: { ZDP: { fields: { departmentCode: 3, departmentName: 4 } } },
});
type Zdp = ProfileFieldName<typeof epic, "ZDP">; // "departmentCode" | "departmentName"
type Zzz = ProfileFieldName<typeof epic, "ZZZ">; // string: undeclared segment type
```

***

### ProfileLevel

> **ProfileLevel** = `"standard"` \| `"constrainable"` \| `"implementable"`

The three **profile levels** the HL7 conformance methodology defines, in the
order it defines them: from the least constrained to the most.

- **`standard`**: the base standard definitions and constraints as-is. The
  overall structure is established, but the full declaration of requirements
  has yet to be specified, so considerable openness still exists.
- **`constrainable`**: further constrains a parent profile, but not all
  element attributes are fully constrained: optionality is still in place
  somewhere.
- **`implementable`**: defines all elements such that all optionality and
  openness have been removed. Every element is either supported (`R` or `RE`)
  or it is not (`X`), and a conditional usage's true and false outcomes are
  drawn from those same three codes.

**Why a consumer cares, and it is the only reason this exists.** The
methodology draws the completeness line here: a complete assessment of an
interface declaring conformance to an implementable profile can be
determined, while for standard-level and constrainable-level profiles not all
aspects can be. So an empty [ConformanceResult.findings](#findings) means two
different things at two different levels, and
[ConformanceResult.level](#level-1) is what tells them apart.

**The level is the author's CLAIM, checked for internal consistency.** hl7
verifies that a profile claiming `implementable` has actually removed the
optionality the level asserts is gone, and refuses the claim as
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed) when it has not. Nothing here is an
external or accredited attestation, and zero findings at `implementable`
level is still not one: see [ConformanceResult](#conformanceresult).

#### Example

```ts
import type { ProfileLevel } from "@cosyte/hl7";
const level: ProfileLevel = "implementable";
```

***

### ReadMessageItem

> **ReadMessageItem**\<`M`\> = \{ `byteLength`: `number`; `byteOffset`: `number`; `index`: `number`; `message`: `M`; `ok`: `true`; `position`: [`Hl7Position`](#hl7position); `streamWarnings`: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]; \} \| \{ `byteLength`: `number`; `byteOffset`: `number`; `error`: [`Hl7ParseError`](#hl7parseerror); `index`: `number`; `ok`: `false`; `position`: [`Hl7Position`](#hl7position); `raw`: `string` \| `Uint8Array`; `streamWarnings`: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]; \}

One item `readMessages()` yields: a message, or a message that failed to parse. Both say where
the message sits in the source: `byteOffset` and `byteLength` count bytes (of the UTF-8 text,
for a string source), `index` counts the items yielded before this one, and `position` is the
message's first segment among every segment of the source, blank lines and batch envelope
segments included.

An `ok` item carries the message `parseHL7` gives for its bytes, built a segment at a time on
first read unless `{ lazy: false }` was given. A failed item carries the `Hl7ParseError` that
`parseHL7` threw and the message's text in `raw` (bytes for a byte source), so it can be set
aside: it may hold patient data.

`streamWarnings` is empty but on a last message whose last segment has no terminator, where it
holds `UNTERMINATED_STREAM_MESSAGE`: the source may have been cut off.

#### Type Parameters

##### M

`M` *extends* [`Hl7Message`](#hl7message) = [`Hl7Message`](#hl7message)

the message type an `ok` item carries.

#### Example

```ts
import { readMessages } from "@cosyte/hl7";

for await (const item of readMessages(source)) {
  if (item.ok) handle(item.message);
  else quarantine(item.raw, item.error.code, item.byteOffset);
}
```

***

### RepeatPatternKind

> **RepeatPatternKind** = `"parametric"` \| `"named"` \| `"unknown"`

How an order/medication `RepeatPattern` code (HL7 Table 0335) is classified,
**provenance only, never used to resolve a schedule**. The `code`
is always authoritative and surfaced verbatim; this flag only tells a
consumer *what kind* of pattern it is looking at so it can decide whether a
load-bearing integer is present.

- `"parametric"`: a `Q<integer><unit>` template (`Q6H`, `Q30M`, `Q2D`,
  `Q1W`, `Q3J5`) whose **integer is load-bearing**: `Q6H` (every 6 hours) is
  a different dose count from `Q8H`. The parsed integer + unit ride on
  [RepeatPattern.interval](#interval).
- `"named"`: a recognized fixed Table-0335 mnemonic scheduled at
  institution-specified times (`BID`, `TID`, `QID`, `QOD`, `QHS`, `QAM`,
  `QPM`, `QSHIFT`, `PRN`, `AC`, `PC`, `HS`, `C`). No numeric interval.
- `"unknown"`: anything else (a local code, free text, an unrecognized
  mnemonic). Surfaced **verbatim**, never mapped to a frequency.

***

### ResultStatusClass

> **ResultStatusClass** = `"final"` \| `"corrected"` \| `"amended"` \| `"preliminary"` \| `"entered-in-error"` \| `"cancelled"` \| `"registered"` \| `"partial"` \| `"undetermined"`

What a result status classifies to. The first eight values are the target
codes of HL7's published v2-to-FHIR status maps (Table 0085 to Observation
Status for OBX-11, Table 0123 to Diagnostic Report Status for OBR-25).

`"undetermined"` is this library's fail-safe, not a map target. It covers
every code HL7's map leaves unmapped (OBX-11 `B`, `I`, `N`, `O`, `R`, `S`,
`V`, `U`; OBR-25 `A`, `Y`, `Z`, `M`, `N`), an absent, empty or `""` (null)
field, and any field that is not exactly one code of its table: a lowercase
letter, a code with whitespace around it, a code written as an escape
sequence, a code outside the table, or a field with more than one
repetition, component or subcomponent. An `"undetermined"` value is never a
current result by default: read the raw code and decide.

#### Example

```ts
import type { ResultStatusClass } from "@cosyte/hl7";
const retracted: readonly ResultStatusClass[] = ["entered-in-error", "cancelled"];
```

***

### SchemaEmitTarget

> **SchemaEmitTarget** = *typeof* [`SCHEMA_EMIT_TARGETS`](#schema_emit_targets)\[`number`\]

One of the emission targets this library supports.

#### Example

```ts
import { emitMessageSchema, type SchemaEmitTarget } from "@cosyte/hl7";
const target: SchemaEmitTarget = "json-schema-2020-12";
emitMessageSchema(target).startsWith("{");
```

***

### SimpleUsageCode

> **SimpleUsageCode** = `"R"` \| `"RE"` \| `"C"` \| `"CE"` \| `"O"` \| `"X"` \| `"B"`

The seven **simple** HL7 v2 conformance usage codes (HL7 Conformance
Methodology, Message Profiles; IHE ITI TF Vol.2 Appendix C). They constrain
whether an element must, may, or must not appear:

- **`R`**: Required. The element SHALL be present (with a value). Absent →
  [FINDING\_CODES.PROFILE\_REQUIRED\_ABSENT](#profile_required_absent).
- **`RE`**: Required but may be Empty. The element is supported and SHALL be
  sent when the sender has the data; its **absence is never a violation**
  (this engine cannot know whether the sender had the data).
- **`C`**: Conditional. Presence depends on a condition predicate. A rule
  that declares one on its `condition` is evaluated by it: predicate true is
  Required, predicate false is Not-permitted, which are the outcomes IHE
  specifies for `C`. A rule that declares NO predicate has its **presence
  not evaluated** (treated as optional); its length / value-set /
  cardinality rules still apply when it IS present.
- **`CE`**: Conditional but may be Empty. With a predicate, true is
  Required-but-may-be-Empty and false is Not-permitted, again IHE's
  outcomes. With no predicate, the same non-evaluation as `C`.
- **`O`**: Optional. No presence constraint.
- **`X`**: Not supported / not permitted. The element SHALL NOT be present.
  Present → [FINDING\_CODES.PROFILE\_NOT\_PERMITTED](#profile_not_permitted).
- **`B`**: Backward Compatible. Presence is **not evaluated**, exactly as for
  `C`; the element's length / value-set / cardinality rules still apply when
  it IS present. See the note below on where that behaviour comes from.

**Two bounded decisions this library makes rather than inherits.**

**`B`'s presence behaviour is this library's decision, not a sourced
requirement.** The HL7 conformance methodology's table of usage indicators
allowable in a message profile lists `B` among them and carries no definition
text for it, so no source settles what a validator should do with a `B`
element. This library chooses the reading that imposes no presence obligation
(so `B` behaves as `C` does on presence) while preserving the author's
declared intent in the profile. A later, separate change may revisit it
against a source that defines the code.

**A declared conditional's outcome domain is unrestricted BY THE TYPE, and
narrowed by the level a profile claims.** [DeclaredConditionalUsage](#declaredconditionalusage)
admits any simple code as either outcome, because the full indicator set is
the CONSTRAINABLE level's vocabulary and that is what a profile claims when it
declares no level. The methodology separately restricts an IMPLEMENTABLE
profile to `R`, `RE` or `X` per element, and its conditional outcomes
likewise. A profile that declares [ConformanceProfile.level](#level)
`implementable` is held to exactly that: `C`, `CE`, `O`, `B`, a conditional
whose outcomes are not all drawn from `R` / `RE` / `X`, and a rule that
declares no usage at all are each
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed) there, and none of them is refused at
any other level.

#### Example

```ts
import type { SimpleUsageCode } from "@cosyte/hl7";
const usage: SimpleUsageCode = "R";
```

***

### SiuPatient

> **SiuPatient** = [`AdtPatient`](#adtpatient)

Typed PID content for [buildSiu](#buildsiu): the same shape every family shares.

#### Example

```ts
import type { SiuPatient } from "@cosyte/hl7";
const patient: SiuPatient = { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } };
```

***

### SiuResourceKind

> **SiuResourceKind** = `"service"` \| `"general"` \| `"location"` \| `"personnel"`

Which AI* segment carries one [SiuResource](#siuresource): AIS, AIG, AIL or AIP.

#### Example

```ts
import type { SiuResourceKind } from "@cosyte/hl7";
const kind: SiuResourceKind = "location"; // emitted as AIL
```

***

### StreamMessageEntry

> **StreamMessageEntry**\<`M`\> = \{ `message`: `M`; `ok`: `true`; `position`: [`Hl7Position`](#hl7position); `raw`: `string`; `streamWarnings`: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]; \} \| \{ `error`: [`Hl7ParseError`](#hl7parseerror); `ok`: `false`; `position`: [`Hl7Position`](#hl7position); `raw`: `string`; `streamWarnings`: readonly [`Hl7ParseWarning`](#hl7parsewarning)[]; \}

One message yielded by [parseStream](#parsestream). Discriminated on `ok`, mirroring
[splitBatch](#splitbatch)'s per-message entry: a successful parse carries the
`Hl7Message` (whose own `.warnings` hold per-message Tier-2 deviations); a
message that hit one of the four Tier-3 fatals carries the `Hl7ParseError`
instead: **isolated**, so the rest of the stream still yields.

`raw` is the message's verbatim source (re-parseable by [parseHL7](#parsehl7));
`position.segmentIndex` is the message's `MSH` (or, for stray pre-`MSH`
content, its first) segment index in the overall stream: the streaming
analogue of [splitBatch](#splitbatch)'s message position. `streamWarnings` holds
**stream-level** diagnostics that are not per-message parse warnings: today
only [unterminatedStreamMessage](#unterminatedstreammessage) on a final message that lacked a
terminator. It is kept separate from `message.warnings` (which stays exactly
what a whole-buffer `parseHL7` of the same bytes would produce) and is
**empty** for every message but a possibly-truncated final one. Both the entry
and `streamWarnings` are frozen.

`M` is the parsed-message type each `ok` entry carries. It is `Hl7Message`
unless the stream was given a statically known profile, in which case it is
that profile's narrowed view and `entry.message.part("ZDP")?.get(name)` is
checked against the names the profile declares for `ZDP`.

#### Type Parameters

##### M

`M` *extends* [`Hl7Message`](#hl7message) = [`Hl7Message`](#hl7message)

the message type an `ok` entry carries.

#### Example

```ts
import { parseStream, WARNING_CODES } from "@cosyte/hl7";
for await (const entry of parseStream(source)) {
  for (const w of entry.streamWarnings) {
    if (w.code === WARNING_CODES.UNTERMINATED_STREAM_MESSAGE) {
      // the feed may have been cut off mid-message
    }
  }
}
```

***

### StructureDerivation

> **StructureDerivation** = `"published"` \| `"retained-transcription"`

How one registry entry's expectations were obtained.

`"published"` means every expectation was read off HL7's own machine-readable
structure definitions. `"retained-transcription"` means the publication
carries no structure for the pair at all and the previous hand transcription
was kept rather than dropped; such an entry always carries the reason.

***

### StructureFindingCode

> **StructureFindingCode** = *typeof* [`STRUCTURE_FINDING_CODES`](#structure_finding_codes)\[keyof *typeof* [`STRUCTURE_FINDING_CODES`](#structure_finding_codes)\]

Discriminant union of every [StructureFinding](#structurefinding) code. Enables exhaustive
`switch` narrowing.

#### Example

```ts
import type { StructureFindingCode } from "@cosyte/hl7";
const code: StructureFindingCode = "STRUCTURE_SEGMENT_UNEXPECTED";
```

***

### StructureNotValidatedReason

> **StructureNotValidatedReason** = *typeof* [`STRUCTURE_NOT_VALIDATED_REASONS`](#structure_not_validated_reasons)\[keyof *typeof* [`STRUCTURE_NOT_VALIDATED_REASONS`](#structure_not_validated_reasons)\]

Discriminant union of every reason validation did not run.

#### Example

```ts
import type { StructureNotValidatedReason } from "@cosyte/hl7";
const reason: StructureNotValidatedReason = "RETAINED_TRANSCRIPTION";
```

***

### ToDateOptions

> **ToDateOptions** = [`DtmToDateOptions`](#dtmtodateoptions)

The options bag [toDate](#todate) accepts: `{ assumeOffsetMinutes?: number }`
and nothing else. An ALIAS of the pre-existing [DtmToDateOptions](#dtmtodateoptions),
which is unchanged and still exported, so the two names denote one type and
a caller may use either.

It exists because every `@cosyte` parser spells this options type
`ToDateOptions`, and a consumer writing across two of them should be able to
spell it the same way in both. Adding the alias costs nothing at runtime:
it is erased at compile time and no value changes.

#### Example

```ts
import { parseDtm, toDate } from "@cosyte/hl7";
import type { ToDateOptions } from "@cosyte/hl7";

const assumeUtc: ToDateOptions = { assumeOffsetMinutes: 0 };
toDate(parseDtm("20250102"), assumeUtc)?.toISOString();
// "2025-01-02T00:00:00.000Z"
```

***

### TS

> **TS** = [`DtmParts`](#dtmparts)

HL7 v2 Time Stamp (TS) / Date Time (DTM) composite: the raw HL7 string plus
its parsed parts, preserving the **stated precision** and **timezone
fidelity**. This is a [DtmParts](#dtmparts): `valid` is `false` (with no parts)
for unparseable input: NEVER throws.

There is deliberately **no `date` field**: a day-only value coerced to a JS
`Date` at UTC midnight silently shifts the calendar day in negative-offset
zones. To obtain an absolute instant, call `dtmToDate(ts)` explicitly (and
supply `assumeOffsetMinutes` for an offset-less value).

#### Example

```ts
import type { TS } from "@cosyte/hl7";
import { dtmToDate } from "@cosyte/hl7";
const dob: TS = { raw: "19880705", valid: true, precision: "day",
  year: 1988, month: 7, day: 5, hasTimezone: false };
console.log(dob.precision);          // "day": not a full timestamp
console.log(dtmToDate(dob));         // undefined: refuses to guess the zone
```

***

### TypedMeta

> **TypedMeta**\<`K`\> = `Omit`\<[`Meta`](#meta-1), `"messageCode"` \| `"triggerEvent"`\> & `object` & (\[[`OverlayTriggerEvent`](#overlaytriggerevent)\<`K`\>\] *extends* \[`never`\] ? `Pick`\<[`Meta`](#meta-1), `"triggerEvent"`\> : `object`)

`Meta` with the message code (and, for a key that names one, the trigger
event) at the literal type the key established. Every other member is the
`Meta` member unchanged: narrowing a message type says nothing about whether
the sender populated MSH-10 or MSH-7.

#### Type Parameters

##### K

`K` *extends* [`OverlayKey`](#overlaykey)

#### Type Declaration

##### messageCode

> `readonly` **messageCode**: [`OverlayMessageCode`](#overlaymessagecode)\<`K`\>

#### Example

```ts
import { parseHL7 } from "@cosyte/hl7";
const msg = parseHL7(raw);
if (msg.is("ADT^A01")) {
  const code: "ADT" = msg.meta.messageCode; // no cast, no optional chain
  const event: "A01" = msg.meta.triggerEvent;
  console.log(code, event, msg.meta.controlId); // controlId is still optional
}
```

***

### UsageCode

> **UsageCode** = [`SimpleUsageCode`](#simpleusagecode) \| [`DeclaredConditionalUsage`](#declaredconditionalusage)

Everything a rule's `usage` may be declared as: one of the seven
[SimpleUsageCode](#simpleusagecode)s, or a [DeclaredConditionalUsage](#declaredconditionalusage) token.

**This is not the same type as [UsageCodeRegistryEntry](#usagecoderegistryentry).** The
registry publishes `C(a/b)` as the NOTATION for the declared-conditional
family, and `a` / `b` are placeholders rather than usage codes, so the
literal `"C(a/b)"` is deliberately NOT assignable here. Neither type widens
to a bare `string`: a typo such as `"RQ"` is a compile error, and
[defineConformanceProfile](#defineconformanceprofile) is the runtime backstop rather than the
replacement.

#### Example

```ts
import type { UsageCode } from "@cosyte/hl7";
const simple: UsageCode = "R";
const conditional: UsageCode = "C(RE/X)";
```

***

### UsageCodeRegistryEntry

> **UsageCodeRegistryEntry** = [`SimpleUsageCode`](#simpleusagecode) \| `"C(a/b)"`

One entry of the exported [USAGE\_CODES](#usage_codes) vocabulary listing: a
[SimpleUsageCode](#simpleusagecode), or the literal notation `"C(a/b)"` that stands for
the whole declared-conditional family.

Distinct from [UsageCode](#usagecode) on purpose, so the placeholder can be listed
without ever becoming assignable where a rule's usage is expected.

#### Example

```ts
import type { UsageCodeRegistryEntry } from "@cosyte/hl7";
const entry: UsageCodeRegistryEntry = "C(a/b)";
```

***

### VxuObservation

> **VxuObservation** = [`OruObservation`](#oruobservation)

Typed OBX content for [buildVxu](#buildvxu) (eligibility, funding source, …).

#### Example

```ts
import type { VxuObservation } from "@cosyte/hl7";
const eligibility: VxuObservation = {
  setId: "1",
  valueType: "CE",
  identifier: { identifier: "64994-7", text: "Vaccine funding program eligibility" },
  value: "V02",
};
```

***

### VxuPatient

> **VxuPatient** = [`AdtPatient`](#adtpatient)

Typed PID content for [buildVxu](#buildvxu): the same shape every family shares.

#### Example

```ts
import type { VxuPatient } from "@cosyte/hl7";
const patient: VxuPatient = {
  identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
  name: { familyName: "Test", givenName: "Ann" },
};
```

***

### WarningCode

> **WarningCode** = *typeof* [`WARNING_CODES`](#warning_codes)\[keyof *typeof* [`WARNING_CODES`](#warning_codes)\]

Discriminant type for `Hl7ParseWarning.code`. Narrowing a warning by this
code lets consumers write exhaustive `switch` blocks (enabled by the
`switch-exhaustiveness-check` lint rule) and guarantees a typo-free
comparison against the `WARNING_CODES` registry.

#### Example

```ts
import type { Hl7ParseWarning, WarningCode } from "@cosyte/hl7";
function describe(w: Hl7ParseWarning): string {
  const code: WarningCode = w.code;
  switch (code) {
    case "MLLP_FRAMING_STRIPPED":
      return "stripped MLLP framing";
    default:
      return `warning: ${code}`;
  }
}
```

## Variables

### ACK\_CODES

> `const` **ACK\_CODES**: `object`

HL7 Table 0008: Acknowledgment code (MSA-1). The two acknowledgment
**vocabularies**:
- **original** mode: `AA` Application Accept · `AE` Application Error ·
  `AR` Application Reject.
- **enhanced** mode accept-level: `CA` Commit Accept · `CE` Commit Error ·
  `CR` Commit Reject (the application-level response in enhanced mode reuses
  `AA`/`AE`/`AR`).

#### Type Declaration

##### AA

> `readonly` **AA**: `"AA"` = `"AA"`

##### AE

> `readonly` **AE**: `"AE"` = `"AE"`

##### AR

> `readonly` **AR**: `"AR"` = `"AR"`

##### CA

> `readonly` **CA**: `"CA"` = `"CA"`

##### CE

> `readonly` **CE**: `"CE"` = `"CE"`

##### CR

> `readonly` **CR**: `"CR"` = `"CR"`

#### Example

```ts
import { ACK_CODES } from "@cosyte/hl7";
ACK_CODES.AA; // "AA"
```

***

### ACK\_CONDITIONS

> `const` **ACK\_CONDITIONS**: `object`

HL7 Table 0155: Accept/application acknowledgment conditions (MSH-15 /
MSH-16): `AL` Always · `NE` Never · `ER` Error/reject conditions only ·
`SU` Successful completion only. Exposed read-only for adapters that
surface the inbound sender's stated acknowledgment expectations.

#### Type Declaration

##### AL

> `readonly` **AL**: `"AL"` = `"AL"`

##### ER

> `readonly` **ER**: `"ER"` = `"ER"`

##### NE

> `readonly` **NE**: `"NE"` = `"NE"`

##### SU

> `readonly` **SU**: `"SU"` = `"SU"`

#### Example

```ts
import { ACK_CONDITIONS } from "@cosyte/hl7";
ACK_CONDITIONS.AL; // "AL" (Always)
```

***

### AMBIGUOUS\_DATE\_ORDER

> `const` **AMBIGUOUS\_DATE\_ORDER**: `"AMBIGUOUS_DATE_ORDER"` = `"AMBIGUOUS_DATE_ORDER"`

Stable identifier reported on [DtmParts.ambiguity](#ambiguity) when a slash date's
field order cannot be established. Compare against it to tell "ambiguous,
refused" apart from "malformed" (no timestamp at all) and from "resolved via
a fallback" (`valid: true` with a `matchedFormat`). Distinct from the
`TIMESTAMP_FALLBACK_FORMAT` warning code, which reports the opposite
outcome: a value that DID resolve.

#### Example

```ts
import { parseHL7, AMBIGUOUS_DATE_ORDER } from "@cosyte/hl7";
const ts = parseHL7(raw).meta.timestamp;
if (ts?.ambiguity?.code === AMBIGUOUS_DATE_ORDER) {
  console.log(ts.ambiguity.message);
}
```

***

### BUILTIN\_DATE\_FALLBACKS

> `const` **BUILTIN\_DATE\_FALLBACKS**: readonly `string`[]

Ordered list of built-in timestamp formats parseDtmCascade falls
back to when neither the strict HL7 DTM match nor any user-supplied format
succeeds. ISO-8601 is tried first (most constrained); `MM/DD/YYYY HH:mm:ss`
last (it overlaps the date-only form).

**The two `MM/DD/YYYY` entries resolve only what has a single reading.** A
slash value whose first two components are both in 1-12 (`05/07/1988`) is
also a legal day-first date, and no built-in decides between them: such a
value is REFUSED with a [DtmAmbiguity](#dtmambiguity) report instead of being read as
May 7. `07/25/1988` has one reading and still resolves; `05/05/1988` has two
that agree and still resolves. To read day-first values, declare the order:
`parseHL7(raw, { dateFormats: ["DD/MM/YYYY"] })`, or a profile's
`dateFormats`. Both are tried ahead of this list.

#### Example

```ts
import { BUILTIN_DATE_FALLBACKS } from "@cosyte/hl7";
console.log(BUILTIN_DATE_FALLBACKS);
// ["ISO-8601", "YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YYYY HH:mm:ss"]
```

***

### DEFAULT\_ENCODING\_CHARACTERS

> `const` **DEFAULT\_ENCODING\_CHARACTERS**: [`EncodingCharacters`](#encodingcharacters-1)

The HL7 default 5-tuple of encoding characters used when a message does
not override them via MSH-1 / MSH-2. Re-used by downstream stages (the
escape map, `parseHL7`) as a synthetic-message fallback.

#### Example

```ts
import { DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
DEFAULT_ENCODING_CHARACTERS.field; // "|"
```

***

### ERR\_CONDITION\_CODE\_SYSTEM

> `const` **ERR\_CONDITION\_CODE\_SYSTEM**: `"HL70357"` = `"HL70357"`

Code-system name emitted in ERR-3.3 for Table 0357 condition codes.

***

### ERR\_CONDITION\_CODES

> `const` **ERR\_CONDITION\_CODES**: `Readonly`\<`Record`\<`string`, `string`\>\>

HL7 Table 0357: Message error condition codes (ERR-3.1 → ERR-3.2 text).
Frozen read-only map of `code → standard display text`. The code system
name emitted in ERR-3.3 is [ERR\_CONDITION\_CODE\_SYSTEM](#err_condition_code_system).

Codes `104` (value too long) and `105` (table value not found) are v2.7+
additions; the rest are present from v2.5. `buildAck` emits whatever code it
is told (it never invents a condition) and looks up the display text here.

#### Example

```ts
import { ERR_CONDITION_CODES } from "@cosyte/hl7";
ERR_CONDITION_CODES["101"]; // "Required field missing"
```

***

### ERR\_SEVERITIES

> `const` **ERR\_SEVERITIES**: `object`

HL7 Table 0516: Error severity (ERR-4). A v2.5+ construct (ERR was
structured differently in v2.3.1).

#### Type Declaration

##### E

> `readonly` **E**: `"E"` = `"E"`

Error.

##### I

> `readonly` **I**: `"I"` = `"I"`

Information.

##### W

> `readonly` **W**: `"W"` = `"W"`

Warning.

#### Example

```ts
import { ERR_SEVERITIES } from "@cosyte/hl7";
ERR_SEVERITIES.E; // "E" (Error)
```

***

### FATAL\_CODES

> `const` **FATAL\_CODES**: `object`

Stable string codes for every Tier-3 fatal the parser may throw. Locked
at four codes: anything else MUST be a Tier-2 warning. Consumers narrow
on `err.code` to react to specific structural failures.

#### Type Declaration

##### EMPTY\_INPUT

> `readonly` **EMPTY\_INPUT**: `"EMPTY_INPUT"` = `"EMPTY_INPUT"`

##### INVALID\_ENCODING\_CHARACTERS

> `readonly` **INVALID\_ENCODING\_CHARACTERS**: `"INVALID_ENCODING_CHARACTERS"` = `"INVALID_ENCODING_CHARACTERS"`

##### MSH\_TOO\_SHORT

> `readonly` **MSH\_TOO\_SHORT**: `"MSH_TOO_SHORT"` = `"MSH_TOO_SHORT"`

##### NO\_MSH\_SEGMENT

> `readonly` **NO\_MSH\_SEGMENT**: `"NO_MSH_SEGMENT"` = `"NO_MSH_SEGMENT"`

#### Example

```ts
import { parseHL7, FATAL_CODES, Hl7ParseError } from "@cosyte/hl7";
try {
  parseHL7("");
} catch (err) {
  if (err instanceof Hl7ParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
    // handle empty input
  }
}
```

***

### FINDING\_CODES

> `const` **FINDING\_CODES**: `object`

The frozen registry of finding codes. Stable, additive string codes: a
consumer compares `finding.code === FINDING_CODES.PROFILE_REQUIRED_ABSENT`.
Segment-level vs field-level is disambiguated by whether the finding's
[FindingLocus.field](#field-4) is present, not by separate codes.

#### Type Declaration

##### PROFILE\_CARDINALITY

> `readonly` **PROFILE\_CARDINALITY**: `"PROFILE_CARDINALITY"` = `"PROFILE_CARDINALITY"`

A segment-occurrence or field-repetition count is outside its cardinality.

##### PROFILE\_CODING\_SYSTEM\_MISMATCH

> `readonly` **PROFILE\_CODING\_SYSTEM\_MISMATCH**: `"PROFILE_CODING_SYSTEM_MISMATCH"` = `"PROFILE_CODING_SYSTEM_MISMATCH"`

A present repetition does not carry the coding system the rule binds its
value set to: its coding-system component resolves to a different system,
to none this library recognizes, or is blank or absent altogether.

A distinct code on purpose, because it is a different answer from
[FINDING\_CODES.PROFILE\_VALUE\_NOT\_IN\_SET](#profile_value_not_in_set): "a code we do not accept"
and "a code that looks right but claims the wrong system" are two problems
with two remedies, and one code for both would hide the second inside the
first. A rule that declares no [FieldRule.codingSystem](#codingsystem) never emits
it.

##### PROFILE\_CONDITION\_UNEVALUATABLE

> `readonly` **PROFILE\_CONDITION\_UNEVALUATABLE**: `"PROFILE_CONDITION_UNEVALUATABLE"` = `"PROFILE_CONDITION_UNEVALUATABLE"`

A rule's declared [ConditionPredicate](#conditionpredicate) could not be decided against
this message, so the rule's usage was never selected and the element's
presence was NOT assessed. A distinct code on purpose: an unassessed
conditional is filterable by code, without matching a message string.

##### PROFILE\_LENGTH

> `readonly` **PROFILE\_LENGTH**: `"PROFILE_LENGTH"` = `"PROFILE_LENGTH"`

A checked component value exceeds the declared maximum length.

##### PROFILE\_MALFORMED

> `readonly` **PROFILE\_MALFORMED**: `"PROFILE_MALFORMED"` = `"PROFILE_MALFORMED"`

The profile ITSELF is structurally malformed (a diagnostic, not a message finding).

##### PROFILE\_NOT\_PERMITTED

> `readonly` **PROFILE\_NOT\_PERMITTED**: `"PROFILE_NOT_PERMITTED"` = `"PROFILE_NOT_PERMITTED"`

A Not-permitted (`X`) segment or field is present.

##### PROFILE\_REQUIRED\_ABSENT

> `readonly` **PROFILE\_REQUIRED\_ABSENT**: `"PROFILE_REQUIRED_ABSENT"` = `"PROFILE_REQUIRED_ABSENT"`

A Required (`R`) segment or field is absent (or present-but-empty).

##### PROFILE\_UNDECLARED\_CONTENT

> `readonly` **PROFILE\_UNDECLARED\_CONTENT**: `"PROFILE_UNDECLARED_CONTENT"` = `"PROFILE_UNDECLARED_CONTENT"`

A present repetition carries a non-empty value at a component index the
field rule does not declare.

A distinct code on purpose: "a value we do not accept" and "content in an
element the profile never specified" are two problems with two remedies,
and the second is the one an author cannot see from any other finding. It
fires only for a field rule carrying at least one
[FieldRule.components](#components) entry, because declaring component rules is
what closes the component set; a rule that declares none (the member
omitted, or an empty list) can never emit it.

##### PROFILE\_VALUE\_NOT\_IN\_SET

> `readonly` **PROFILE\_VALUE\_NOT\_IN\_SET**: `"PROFILE_VALUE_NOT_IN_SET"` = `"PROFILE_VALUE_NOT_IN_SET"`

A checked component value is not a member of the consumer-supplied value set.

#### Example

```ts
import { validateAgainstProfile, FINDING_CODES } from "@cosyte/hl7";
const { findings } = validateAgainstProfile(msg, profile);
const missing = findings.filter((f) => f.code === FINDING_CODES.PROFILE_REQUIRED_ABSENT);
```

***

### JSON\_SCHEMA\_DIALECT

> `const` **JSON\_SCHEMA\_DIALECT**: `"https://json-schema.org/draft/2020-12/schema"` = `"https://json-schema.org/draft/2020-12/schema"`

The JSON Schema dialect the emitted document declares, and the only one this
library emits.

#### Example

```ts
import { JSON_SCHEMA_DIALECT, messageJsonSchema } from "@cosyte/hl7";
messageJsonSchema().$schema === JSON_SCHEMA_DIALECT; // true
```

***

### KNOWN\_CODING\_SYSTEMS

> `const` **KNOWN\_CODING\_SYSTEMS**: readonly [`KnownCodingSystem`](#knowncodingsystem)[]

The safety-relevant subset of HL7 Table 0396 this library recognizes for
provenance. Deliberately small and frozen: it is NOT the full Table 0396
registry. Each entry's source is recorded in
`docs-content/spec-notes-coding-system.md`.

Note on `I10`: Table 0396 registers `I10` as **ICD-10** (the WHO base
classification). US v2 feeds frequently send `I10` when they mean
ICD-10-**CM**, but that clinical-modification specificity is the sender's
convention, not what the acronym registers: so this map reports the
registered claim (`"ICD-10"`) and does not silently upgrade it to CM.

#### Example

```ts
import { KNOWN_CODING_SYSTEMS } from "@cosyte/hl7";
console.log(KNOWN_CODING_SYSTEMS.find((s) => s.id === "LN")?.name); // "LOINC"
```

***

### KNOWN\_SEGMENTS

> `const` **KNOWN\_SEGMENTS**: `ReadonlySet`\<`string`\>

Frozen set of every standard HL7 v2 segment name the library recognises.
Consumers parsing any segment whose name is neither in this set nor
declared by the active profile will see `UNKNOWN_SEGMENT` in
`msg.warnings`.

#### Example

```ts
import { KNOWN_SEGMENTS } from "@cosyte/hl7";
console.log(KNOWN_SEGMENTS.has("PID")); // true
console.log(KNOWN_SEGMENTS.has("ZPI")); // false
```

***

### MESSAGE\_STRUCTURE\_DEFINITIONS

> `const` **MESSAGE\_STRUCTURE\_DEFINITIONS**: readonly [`MessageStructureDefinition`](#messagestructuredefinition)[]

The derived expected-segment registry. Generated from HL7's published,
machine-readable message structures (see `STRUCTURE_REGISTRY_PROVENANCE` for
the publication, the commit and the per-file hashes) and frozen: data, not
config. Deliberately narrow in COVERAGE (sixteen message codes) and not narrow
in CONTENT: within those codes it expects exactly what the publication marks
required. It is still a safety net, not a conformance validator.

#### Example

```ts
import { MESSAGE_STRUCTURE_DEFINITIONS } from "@cosyte/hl7";
const adt = MESSAGE_STRUCTURE_DEFINITIONS.find((d) =>
  d.messageCode === "ADT" && d.triggerEvents.includes("A01"),
);
console.log(adt?.requiredSegments); // ["EVN", "MSH", "PID", "PV1"]
```

***

### PREDICATE\_CONNECTORS

> `const` **PREDICATE\_CONNECTORS**: readonly [`PredicateConnector`](#predicateconnector)[]

The frozen, ordered listing of the connectors a condition predicate may use:
`AND`, `OR`, `XOR`. Like [PREDICATE\_VERBS](#predicate_verbs) this listing IS the
accept-set.

#### Example

```ts
import { PREDICATE_CONNECTORS } from "@cosyte/hl7";
PREDICATE_CONNECTORS.length; // 3
PREDICATE_CONNECTORS[2]; // "XOR"
```

***

### PREDICATE\_VERBS

> `const` **PREDICATE\_VERBS**: readonly [`PredicateVerb`](#predicateverb)[]

The frozen, ordered listing of the comparison verbs a condition predicate may
use: `is`, `is not`, `contains`, `does not contain`, `matches`,
`does not match`.

Unlike [USAGE\_CODES](#usage_codes), this listing IS the accept-set: a verb outside it
is `PROFILE_MALFORMED`, and the [PredicateVerb](#predicateverb) type refuses it at
compile time where the author writes TypeScript.

#### Example

```ts
import { PREDICATE_VERBS } from "@cosyte/hl7";
PREDICATE_VERBS.length; // 6
PREDICATE_VERBS[0]; // "is"
```

***

### PROFILE\_LEVELS

> `const` **PROFILE\_LEVELS**: readonly [`ProfileLevel`](#profilelevel)[]

The frozen listing of the three [ProfileLevel](#profilelevel)s, ordered from the least
constrained to the most: `standard`, `constrainable`, `implementable`.

Unlike [USAGE\_CODES](#usage_codes) this listing IS the accept-set: a
[ConformanceProfile.level](#level) outside it is
[FINDING\_CODES.PROFILE\_MALFORMED](#profile_malformed), and the [ProfileLevel](#profilelevel) type
refuses it at compile time where the author writes TypeScript.

#### Example

```ts
import { PROFILE_LEVELS } from "@cosyte/hl7";
PROFILE_LEVELS.length; // 3
PROFILE_LEVELS[0]; // "standard"
```

***

### profiles

> `const` **profiles**: `object`

Namespace object exposing the 8 shipped built-in vendor profiles (epic,
cerner, meditech, athena, genericLab, visage, philips, va). Each is authored
via the public `defineProfile()` API, and built the first time it is read
rather than when the package is imported: a read returns the same frozen
profile every time.

#### Type Declaration

##### athena

> `readonly` **athena**: `ReturnType`\<*typeof* `athena`\>

##### cerner

> `readonly` **cerner**: `ReturnType`\<*typeof* `cerner`\>

##### epic

> `readonly` **epic**: `ReturnType`\<*typeof* `epic`\>

##### genericLab

> `readonly` **genericLab**: `ReturnType`\<*typeof* `genericLab`\>

##### meditech

> `readonly` **meditech**: `ReturnType`\<*typeof* `meditech`\>

##### philips

> `readonly` **philips**: `ReturnType`\<*typeof* `philips`\>

##### va

> `readonly` **va**: `ReturnType`\<*typeof* `va`\>

##### visage

> `readonly` **visage**: `ReturnType`\<*typeof* `visage`\>

#### Example

```ts
import { parseHL7, profiles } from "@cosyte/hl7";
const msg = parseHL7(raw, profiles.epic);
console.log(msg.profile?.name); // "epic"
```

***

### SCHEMA\_EMIT\_TARGETS

> `const` **SCHEMA\_EMIT\_TARGETS**: readonly \[`"json-schema-2020-12"`, `"zod"`\]

Every emission target this library supports, as a caller names it.

#### Example

```ts
import { SCHEMA_EMIT_TARGETS } from "@cosyte/hl7";
SCHEMA_EMIT_TARGETS.includes("zod"); // true
```

***

### STRUCTURE\_FINDING\_CODES

> `const` **STRUCTURE\_FINDING\_CODES**: `object`

The frozen registry of published-structure finding codes. Stable, additive
string codes: a consumer compares
`finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY`.

Deliberately separate from the conformance engine's `FINDING_CODES`. Those
report a violation of a profile the CALLER wrote; these report a divergence
from the publication itself, and a consumer routing the two to the same place
is making a decision rather than inheriting one.

#### Type Declaration

##### STRUCTURE\_SEGMENT\_CARDINALITY

> `readonly` **STRUCTURE\_SEGMENT\_CARDINALITY**: `"STRUCTURE_SEGMENT_CARDINALITY"` = `"STRUCTURE_SEGMENT_CARDINALITY"`

A segment occurs fewer times than the published structure's minimum along
the path from the structure root, or more times than its maximum.

##### STRUCTURE\_SEGMENT\_OUT\_OF\_ORDER

> `readonly` **STRUCTURE\_SEGMENT\_OUT\_OF\_ORDER**: `"STRUCTURE_SEGMENT_OUT_OF_ORDER"` = `"STRUCTURE_SEGMENT_OUT_OF_ORDER"`

A segment appears where the published structure does not allow it: the
message's segment sequence stops being a beginning the published order
allows.

The order is read against the publication's own bounds, at every locus: a
node may occur as few and as many times as the publication says there, so a
group's required leading segment cannot be skipped on one occurrence and
consumed on the next, whether or not that group repeats. The one bound
dropped for a segment name is the one the cardinality check already
reported for it, so that too few or too many occurrences is one finding
rather than two.

Where two segments arrive in an order the publication does not allow, the
finding names the one that arrived late: the segment the published order
puts first and the message delivered second, at the occurrence the message
carries it. That is not always where the reading stopped, because the
publication is often free to skip past the segment a message delayed, so an
adjacent pair whose exchange the publication derives is what identifies the
two. Every adjacent pair is asked, not a shortlist near the stop: in a
message that repeats a group the pair can sit well in front of it. Where
more than one pair would do, the earliest is named. Where no exchange
derives, the defect is not two segments in the wrong order: the finding then
names the segment that belonged where the reading stopped, and failing that
the one that could not be placed.

##### STRUCTURE\_SEGMENT\_UNEXPECTED

> `readonly` **STRUCTURE\_SEGMENT\_UNEXPECTED**: `"STRUCTURE_SEGMENT_UNEXPECTED"` = `"STRUCTURE_SEGMENT_UNEXPECTED"`

A segment the published structure does not name anywhere, a `Z` segment
included. Distinct from the other two on purpose: a segment the publication
never mentions has no position to be out of and no count to exceed.

A line carrying no segment name at all is not one of these. A message
ending with a segment terminator parses as a trailing segment whose type is
the empty string, and the publication names segments rather than blank
lines; the parse reports that line, under `UNKNOWN_SEGMENT`.

#### Example

```ts
import { validateMessageStructure, STRUCTURE_FINDING_CODES } from "@cosyte/hl7";
const { findings } = validateMessageStructure(msg);
const misordered = findings.filter(
  (f) => f.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
);
```

***

### STRUCTURE\_NOT\_VALIDATED\_REASONS

> `const` **STRUCTURE\_NOT\_VALIDATED\_REASONS**: `object`

The frozen registry of reasons validation did not run. Every one of them is a
question the publication cannot answer for this message, never a defect
found in it.

#### Type Declaration

##### EMPTY\_EXPECTATION

> `readonly` **EMPTY\_EXPECTATION**: `"EMPTY_EXPECTATION"` = `"EMPTY_EXPECTATION"`

The registry entry resolves to no ordered expectation at all. A published
structure whose expectation is empty says nothing about the message, and
treating "says nothing" as "allows nothing" would report every segment as
unexpected.

##### NO\_MESSAGE\_TYPE

> `readonly` **NO\_MESSAGE\_TYPE**: `"NO_MESSAGE_TYPE"` = `"NO_MESSAGE_TYPE"`

MSH-9.1 is absent or blank, so there is no message type to resolve.

##### RETAINED\_TRANSCRIPTION

> `readonly` **RETAINED\_TRANSCRIPTION**: `"RETAINED_TRANSCRIPTION"` = `"RETAINED_TRANSCRIPTION"`

The message type is recognized only through a retained transcription: the
publication carries no structure for it, so there is no published order and
no published maximum to check against.

##### UNRECOGNIZED\_MESSAGE\_TYPE

> `readonly` **UNRECOGNIZED\_MESSAGE\_TYPE**: `"UNRECOGNIZED_MESSAGE_TYPE"` = `"UNRECOGNIZED_MESSAGE_TYPE"`

The structure registry models no published structure for this message type.

#### Example

```ts
import { validateMessageStructure, STRUCTURE_NOT_VALIDATED_REASONS } from "@cosyte/hl7";
const result = validateMessageStructure(msg);
const unmodelled =
  result.reason === STRUCTURE_NOT_VALIDATED_REASONS.UNRECOGNIZED_MESSAGE_TYPE;
```

***

### STRUCTURE\_REGISTRY\_PROVENANCE

> `const` **STRUCTURE\_REGISTRY\_PROVENANCE**: `Readonly`\<\{ `families`: readonly `Readonly`\<\{ `members`: readonly `string`[]; `structureId`: `string`; \}\>[]; `files`: readonly `Readonly`\<\{ `bytes`: `number`; `path`: `string`; `sha256`: `string`; `url`: `string`; \}\>[]; `pairs`: readonly `Readonly`\<\{ `messageCode`: `string`; `structureId`: `string`; `triggerEvent`: `string`; \}\>[]; `publication`: `Readonly`\<\{ `commit`: `string`; `commitDate`: `string`; `name`: `string`; `repository`: `string`; `repositoryUrl`: `string`; `tree`: `string`; \}\>; `snapshotTakenAt`: `string`; \}\>

Where every expectation in [MESSAGE\_STRUCTURE\_DEFINITIONS](#message_structure_definitions) came from:
the publication and the commit it was read at, the sha256 and upstream URL of
every vendored file, the variant family behind each referenced structure, and
the structure id behind each recognized (message code, trigger event) pair.

A consumer auditing a warning can answer "says who?" without leaving the
package and without a network call.

#### Example

```ts
import { STRUCTURE_REGISTRY_PROVENANCE } from "@cosyte/hl7";
console.log(STRUCTURE_REGISTRY_PROVENANCE.publication.repository); // "HL7/v2ig"
const a01 = STRUCTURE_REGISTRY_PROVENANCE.pairs.find(
  (p) => p.messageCode === "ADT" && p.triggerEvent === "A01",
);
console.log(a01?.structureId); // "ADT_A01"
```

***

### SUPPORTED\_BUILDER\_MESSAGES

> `const` **SUPPORTED\_BUILDER\_MESSAGES**: readonly [`SupportedBuilderMessage`](#supportedbuildermessage)[]

Every (message code, trigger event) pair the typed builders can author, with
the builder that authors it. Frozen; derived from the structure registry, so
it can never claim a pair the structure net would warn on.

#### Example

```ts
import { SUPPORTED_BUILDER_MESSAGES } from "@cosyte/hl7";
for (const m of SUPPORTED_BUILDER_MESSAGES) {
  console.log(`${m.messageCode}^${m.triggerEvent}`, m.builder);
}
```

***

### SUPPORTED\_DATE\_TOKENS

> `const` **SUPPORTED\_DATE\_TOKENS**: readonly `string`[] = `TOKEN_ORDER`

Every date-format token the library's format matcher and the
`defineProfile()` `dateFormats` validator recognize. Re-exported so profile
authors can introspect the valid token set.

Every token listed here is honoured by the matcher: none is silently
accepted at definition time and then treated as literal characters. The
vocabulary carries **no two-digit-year token** (no century window is
applied, so a two-digit year cannot be resolved) and **no timezone token**
(a value with no offset is flagged, never resolved).

#### Example

```ts
import { SUPPORTED_DATE_TOKENS } from "@cosyte/hl7";
console.log(SUPPORTED_DATE_TOKENS);
// ["YYYY", "MM", "M", "MMM", "MMMM", "DD", "D", "HH", "H", "hh", "h", "mm", "ss", "SSSS", "A"]
```

***

### SUPPORTED\_OVERLAY\_MESSAGES

> `const` **SUPPORTED\_OVERLAY\_MESSAGES**: readonly [`SupportedOverlayMessage`](#supportedoverlaymessage)[]

The published support claim for typed message overlays: every key
[Hl7Message.is](#is) narrows on, with the segments that pair's published
structure requires. Frozen, and derived from the structure registry at module
load rather than hand-listed, so it can never claim a pair the structure net
does not recognize.

#### Example

```ts
import { SUPPORTED_OVERLAY_MESSAGES } from "@cosyte/hl7";
console.log(SUPPORTED_OVERLAY_MESSAGES.length); // one entry per published key
for (const m of SUPPORTED_OVERLAY_MESSAGES) console.log(m.key, m.requiredSegments);
```

***

### TYPED\_BUILDER\_COVERAGE

> `const` **TYPED\_BUILDER\_COVERAGE**: readonly [`TypedBuilderCoverage`](#typedbuildercoverage)[]

What each typed builder can emit. Frozen data, exposed so a consumer can
check the support claim's exclusions for themselves: a registry pair whose
required segments are not a subset of the matching entry's `segments` is
exactly the pair the support set leaves out.

#### Example

```ts
import { TYPED_BUILDER_COVERAGE, findMessageStructureDefinition } from "@cosyte/hl7";
const cov = TYPED_BUILDER_COVERAGE.find((c) => c.messageCode === "ADT");
const a20 = findMessageStructureDefinition("ADT", "A20");
// A20 requires NPU, which no typed init supplies, so A20 is not published:
console.log(a20?.requiredSegments.every((s) => cov?.segments.includes(s))); // false
```

***

### USAGE\_CODES

> `const` **USAGE\_CODES**: readonly [`UsageCodeRegistryEntry`](#usagecoderegistryentry)[]

The frozen, ordered registry of HL7 v2 usage indicators a message profile may
use: `R`, `RE`, `C`, `CE`, `O`, `X`, `C(a/b)`, `B`.

**It is a published vocabulary LISTING, not a membership oracle for what a
rule may declare.** The two questions are different and neither answers the
other:

- `C(a/b)` is listed here and is REFUSED on a rule, because `a` and `b` are
  placeholders for usage codes rather than usage codes.
- `C(RE/X)` is accepted on a rule and is NOT listed here, because the listing
  carries the family's notation once instead of all of its members.

What a rule may declare is answered by [UsageCode](#usagecode) at compile time and
by [defineConformanceProfile](#defineconformanceprofile) / [validateAgainstProfile](#validateagainstprofile) at run
time. Do not re-derive this array as an accept-set.

#### Example

```ts
import { USAGE_CODES } from "@cosyte/hl7";
USAGE_CODES.length; // 8
USAGE_CODES[0]; // "R"
```

***

### VERSION

> `const` **VERSION**: `string` = `"0.1.12"`

Library version string, kept equal to `package.json#version` by each
release.

#### Example

```ts
import { VERSION } from "@cosyte/hl7";
console.log(VERSION);
```

***

### WARNING\_CODES

> `const` **WARNING\_CODES**: `object`

Stable string codes for every Tier-2 warning the parser may emit. The
registry is frozen via `as const` so TypeScript infers the exact string
literal union for `WarningCode`: there is zero runtime cost and no
magic-string comparisons for consumers.

#### Type Declaration

##### ACK\_NO\_CORRELATION\_ID

> `readonly` **ACK\_NO\_CORRELATION\_ID**: `"ACK_NO_CORRELATION_ID"` = `"ACK_NO_CORRELATION_ID"`

##### BATCH\_COUNT\_MISMATCH

> `readonly` **BATCH\_COUNT\_MISMATCH**: `"BATCH_COUNT_MISMATCH"` = `"BATCH_COUNT_MISMATCH"`

##### BATCH\_MISSING\_TRAILER

> `readonly` **BATCH\_MISSING\_TRAILER**: `"BATCH_MISSING_TRAILER"` = `"BATCH_MISSING_TRAILER"`

##### DUPLICATE\_REQUIRED\_SEGMENT

> `readonly` **DUPLICATE\_REQUIRED\_SEGMENT**: `"DUPLICATE_REQUIRED_SEGMENT"` = `"DUPLICATE_REQUIRED_SEGMENT"`

##### ENCODING\_MISMATCH

> `readonly` **ENCODING\_MISMATCH**: `"ENCODING_MISMATCH"` = `"ENCODING_MISMATCH"`

##### EXTRA\_FIELDS

> `readonly` **EXTRA\_FIELDS**: `"EXTRA_FIELDS"` = `"EXTRA_FIELDS"`

##### FIELD\_WHITESPACE\_TRIMMED

> `readonly` **FIELD\_WHITESPACE\_TRIMMED**: `"FIELD_WHITESPACE_TRIMMED"` = `"FIELD_WHITESPACE_TRIMMED"`

##### MERGE\_MISSING\_PRIOR\_OR\_SURVIVOR

> `readonly` **MERGE\_MISSING\_PRIOR\_OR\_SURVIVOR**: `"MERGE_MISSING_PRIOR_OR_SURVIVOR"` = `"MERGE_MISSING_PRIOR_OR_SURVIVOR"`

##### MISSING\_EXPECTED\_GROUP

> `readonly` **MISSING\_EXPECTED\_GROUP**: `"MISSING_EXPECTED_GROUP"` = `"MISSING_EXPECTED_GROUP"`

##### MISSING\_REQUIRED\_FIELD

> `readonly` **MISSING\_REQUIRED\_FIELD**: `"MISSING_REQUIRED_FIELD"` = `"MISSING_REQUIRED_FIELD"`

##### MLLP\_FRAMING\_STRIPPED

> `readonly` **MLLP\_FRAMING\_STRIPPED**: `"MLLP_FRAMING_STRIPPED"` = `"MLLP_FRAMING_STRIPPED"`

##### OUT\_OF\_ORDER\_SEGMENT

> `readonly` **OUT\_OF\_ORDER\_SEGMENT**: `"OUT_OF_ORDER_SEGMENT"` = `"OUT_OF_ORDER_SEGMENT"`

##### SEGMENT\_CASE

> `readonly` **SEGMENT\_CASE**: `"SEGMENT_CASE"` = `"SEGMENT_CASE"`

##### TIMESTAMP\_FALLBACK\_FORMAT

> `readonly` **TIMESTAMP\_FALLBACK\_FORMAT**: `"TIMESTAMP_FALLBACK_FORMAT"` = `"TIMESTAMP_FALLBACK_FORMAT"`

##### UNKNOWN\_CHARSET

> `readonly` **UNKNOWN\_CHARSET**: `"UNKNOWN_CHARSET"` = `"UNKNOWN_CHARSET"`

##### UNKNOWN\_ESCAPE\_SEQUENCE

> `readonly` **UNKNOWN\_ESCAPE\_SEQUENCE**: `"UNKNOWN_ESCAPE_SEQUENCE"` = `"UNKNOWN_ESCAPE_SEQUENCE"`

##### UNKNOWN\_SEGMENT

> `readonly` **UNKNOWN\_SEGMENT**: `"UNKNOWN_SEGMENT"` = `"UNKNOWN_SEGMENT"`

##### UNSUPPORTED\_CHARSET

> `readonly` **UNSUPPORTED\_CHARSET**: `"UNSUPPORTED_CHARSET"` = `"UNSUPPORTED_CHARSET"`

##### UNTERMINATED\_STREAM\_MESSAGE

> `readonly` **UNTERMINATED\_STREAM\_MESSAGE**: `"UNTERMINATED_STREAM_MESSAGE"` = `"UNTERMINATED_STREAM_MESSAGE"`

##### VERSION\_MISMATCH

> `readonly` **VERSION\_MISMATCH**: `"VERSION_MISMATCH"` = `"VERSION_MISMATCH"`

#### Example

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";
const msg = parseHL7(raw);
if (msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED)) {
  // handle MLLP-wrapped input
}
```

## Functions

### ackNoCorrelationId()

> **ackNoCorrelationId**(`position`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `ACK_NO_CORRELATION_ID` warning. Emitted by `buildAck`,
not by the parser: the inbound message carried no MSH-10 message control ID,
so the generated ACK leaves MSA-2 empty and, when a positive accept was
requested, downgrades it to an error code rather than fabricating an
unverifiable `AA`/`CA`. The `position` references the inbound MSH segment.
The message NEVER echoes a PHI value: only the structural fact.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { buildAck, WARNING_CODES } from "@cosyte/hl7";
const ack = buildAck(inbound, { code: "AA" }); // inbound has no MSH-10
ack.warnings.some((w) => w.code === WARNING_CODES.ACK_NO_CORRELATION_ID); // true
```

***

### alternateCodingSystemOf()

> **alternateCodingSystemOf**(`coded`): [`CodingSystemInfo`](#codingsysteminfo) \| `undefined`

Provenance of a coded element's **alternate** coding system (CWE.6 / CE.6).
Returns `undefined` when the element claims no alternate system. Useful for
dual-coded fields (e.g. a problem carrying both SNOMED CT and ICD-10), where
assuming a single coding system would be unsafe.

#### Parameters

##### coded

[`CodedSystemFields`](#codedsystemfields)

#### Returns

[`CodingSystemInfo`](#codingsysteminfo) \| `undefined`

#### Example

```ts
import { alternateCodingSystemOf } from "@cosyte/hl7";
const alt = alternateCodingSystemOf(dg.code);
if (alt) console.log("also coded in", alt.name ?? alt.claimed);
```

***

### analyzeMessageStructure()

> **analyzeMessageStructure**(`messageCode`, `triggerEvent`, `presentSegmentNames`): [`MessageStructure`](#messagestructure)

Analyze a parsed message's structure against the derived expected-segment
registry. Pure: it takes the message code, trigger event, and the set of
segment names actually present, and returns a `MessageStructure` summary. It
decides nothing about whether to warn: the caller (parser) emits one
`MISSING_EXPECTED_GROUP` warning per name in `missingSegments`.

#### Parameters

##### messageCode

`string`

MSH-9.1 (e.g. `"ORU"`); empty string if absent.

##### triggerEvent

`string`

MSH-9.2 (e.g. `"R01"`); empty string if absent.

##### presentSegmentNames

`ReadonlySet`\<`string`\>

the set of segment names present in the message.

#### Returns

[`MessageStructure`](#messagestructure)

#### Example

```ts
import { analyzeMessageStructure } from "@cosyte/hl7";
const s = analyzeMessageStructure("ORU", "R01", new Set(["MSH", "PID"]));
console.log(s.recognized);        // true
console.log(s.missingSegments);   // ["OBR"]  (the published minimum of one)
```

***

### batchCountMismatch()

> **batchCountMismatch**(`position`, `unit`, `declared`, `actual`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `BATCH_COUNT_MISMATCH` warning. Emitted by
`splitBatch()`: attached to the returned `BatchSplitResult.warnings`, never
to `Hl7Message.warnings`: when a declared envelope count does not equal the
count actually split out: a **BTS-1** batch message count that differs from
the messages found in that batch, or an **FTS-1** file batch count that
differs from the batches found in the file (HL7 v2 Ch. 2 §2.10.3; BTS-1 / FTS-1
per the BTS / FTS segment definitions in §2.15).
The splitter **never drops the tail** to make the numbers agree: the
mismatch is surfaced and every message is still returned; the caller decides
whether to reject.

The message carries only the declared-vs-actual **integers** and the unit
(`message` for BTS-1, `batch` for FTS-1): NEVER a field value, facility
identifier, or any other content, so no PHI is exposed. `position` references
the trailer segment (`BTS`/`FTS`) that declared the count.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### unit

`"message"` \| `"batch"`

##### declared

`number`

##### actual

`number`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { batchCountMismatch } from "@cosyte/hl7";
const w = batchCountMismatch({ segmentIndex: 4 }, "message", 3, 2);
```

***

### batchMissingTrailer()

> **batchMissingTrailer**(`position`, `header`, `expectedTrailer`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `BATCH_MISSING_TRAILER` warning. Emitted by
`splitBatch()` (attached to `BatchSplitResult.warnings`) when an envelope
header opens a scope that is never closed: a **BHS** batch header with no
matching **BTS** trailer, or an **FHS** file header with no matching **FTS**
trailer (HL7 v2 Ch. 2 §2.10.3: each envelope segment is optional, but a
profile such as an IIS file-submission spec may mandate the full frame).
`splitBatch` **does not enforce** such a rule: it splits, warns, and leaves
the accept/reject decision to the caller; the parse never throws for this.

The message carries only the header/trailer segment names: NEVER a field
value, so no PHI is exposed. `position` references the unmatched header
segment (`FHS`/`BHS`).

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### header

`"FHS"` \| `"BHS"`

##### expectedTrailer

`"BTS"` \| `"FTS"`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { batchMissingTrailer } from "@cosyte/hl7";
const w = batchMissingTrailer({ segmentIndex: 0 }, "BHS", "BTS");
```

***

### buildAck()

> **buildAck**(`inbound`, `options`): [`Hl7Message`](#hl7message)

Build a spec-clean ACK (`MSH` + `MSA` [+ `ERR`…]) responding to `inbound`.

Behavior:
- **MSH**: sender/receiver are swapped (inbound MSH-5/6 → ACK MSH-3/4;
  inbound MSH-3/4 → ACK MSH-5/6); MSH-7 is the current UTC time; MSH-9 is
  `ACK` (with the inbound trigger event echoed as `ACK^<trigger>^ACK` when
  present); MSH-10 is a freshly generated control id; MSH-11 (processing id)
  and MSH-12 (version) echo the inbound values.
- **MSA**: MSA-1 = `code`; **MSA-2 echoes the full inbound MSH-10 field**
  (the raw field structure is carried over whole: a vendor-quirk id like
  `ID^X` is never truncated to its first component). The echo carries the
  inbound field's escape-fidelity overlay, so an id bearing a hex
  escape (`ID\X41\Q`) or a preserved escape (`\H\`) echoes **byte-verbatim**,
  not canonicalized: exactly the bytes the sender put on the wire, which is
  what MSA-2 correlation compares. The only structural transform is
  trailing-empty canonicalization. (A sender that used *custom*
  encoding characters is **re-delimited spec-cleanly**: the overlay carries
  the sender's raw bytes in the sender's alphabet, so echoing them verbatim
  under the ACK's default alphabet would corrupt the field's structure and
  break correlation: the overlay is therefore bypassed and the decoded id is
  re-escaped under default, which re-parses back to the same control id.
  Default-delimiter senders, the norm, keep the byte-exact overlay echo.)
- **ERR**: one segment per supplied \{@link AckErrorDetail\}: ERR-2 location
  (when given), ERR-3 the Table 0357 condition code as a CWE
  (`code^text^HL70357`), ERR-4 the Table 0516 severity.

**Fail-safe.** If the inbound message has no MSH-10, the
ACK cannot be correlated. `buildAck` then leaves MSA-2 empty and, if a
positive accept (`AA`/`CA`) was requested, **downgrades it** to the matching
error code (`AE`/`CE`): it never fabricates an unverifiable positive ACK.
The returned message carries an `ACK_NO_CORRELATION_ID` warning. (This is the
inbound-side complement to `@cosyte/mllp`'s "no commit ⇒ never AA".)

Pure aside from the generated control id + timestamp; never throws except on
a programming error (`inbound` not an `Hl7Message`, or an unknown `code`).

#### Parameters

##### inbound

[`Hl7Message`](#hl7message)

##### options

[`BuildAckOptions`](#buildackoptions)

#### Returns

[`Hl7Message`](#hl7message)

#### Example

```ts
import { buildAck, parseHL7 } from "@cosyte/hl7";
const inbound = parseHL7(raw);
const ack = buildAck(inbound, { code: "AA" });
console.log(ack.toString());            // MSH|...\rMSA|AA|<inbound MSH-10>
parseHL7(ack.toString()).meta.type;     // "ACK" (round-trips clean)
```

***

### buildAdt()

> **buildAdt**(`event`, `init`): [`Hl7Message`](#hl7message)

Build a spec-clean ADT message for `event` (the MSH-9.2 trigger, e.g.
`"A01"`, `"A04"`, `"A08"`) from typed inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and
`msg.patient` / `msg.visit` read back the values supplied.

#### Parameters

##### event

`string`

the ADT trigger event (MSH-9.2). Required, non-empty.

##### init

[`BuildAdtInit`](#buildadtinit)

the MSH envelope + typed PID/PV1/EVN content (`patient`
  required), plus `priorIdentity` for a merge, move or identifier-change
  event.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `event` is empty, when `init.patient` is absent, or
  when the requested trigger event's published structure requires MRG and no
  prior identity carrying a merge key was supplied.

#### Examples

```ts
import { buildAdt, parseHL7 } from "@cosyte/hl7";
// A merge: the prior identifiers are retired in favour of the surviving ones.
const merge = buildAdt("A40", {
  patient: { identifiers: { idNumber: "MRN-NEW", identifierTypeCode: "MR" } },
  priorIdentity: { identifiers: { idNumber: "MRN-OLD", identifierTypeCode: "MR" } },
});
const ev = parseHL7(merge.toString()).identityEvents()[0];
ev?.prior?.identifiers[0]?.idNumber;     // "MRN-OLD"
ev?.surviving?.identifiers[0]?.idNumber; // "MRN-NEW"
```

```ts
import { buildAdt, parseHL7 } from "@cosyte/hl7";
const msg = buildAdt("A01", {
  sendingApp: "CLINIC",
  receivingApp: "LAB",
  patient: {
    identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
    name: { familyName: "Test", givenName: "Ann" },
    birthDateTime: "19880705",
    administrativeSex: "F",
  },
  visit: { patientClass: "I", assignedLocation: { pointOfCare: "ICU", room: "1", bed: "A" } },
});
const round = parseHL7(msg.toString());
round.warnings.length;          // 0
round.patient?.familyName;      // "Test"
round.structure.missingGroups;  // []
```

***

### buildDft()

> **buildDft**(`event`, `init`): [`Hl7Message`](#hl7message)

Build a spec-clean DFT message for `event` (the MSH-9.2 trigger, e.g.
`"P03"` post detail financial transaction, `"P11"` post detail financial
transactions with a new appointment) from typed inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and
`msg.charges()` reads back the transactions supplied, in the order supplied.

#### Parameters

##### event

`string`

the DFT trigger event (MSH-9.2). Required, non-empty.

##### init

[`BuildDftInit`](#builddftinit)

the MSH envelope + typed PID/FT1 content. `patient` and a
  non-empty `charges` list are required.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `event` is empty, when `init` is not an object, when
  `patient` is absent, or when `charges` is absent or empty.

#### Example

```ts
import { buildDft, parseHL7 } from "@cosyte/hl7";
const msg = buildDft("P03", {
  sendingApp: "CLINIC",
  receivingApp: "BILLING",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  charges: [
    {
      setId: "1",
      transactionDate: "20260801",
      transactionType: "CG",
      transactionCode: { identifier: "80053", text: "Metabolic panel" },
      quantity: "1",
      amountExtended: { price: "150.00", denomination: "USD" },
      diagnoses: [{ identifier: "E11.9" }],
    },
  ],
});
const round = parseHL7(msg.toString());
round.warnings.length;                          // 0
round.charges()[0]?.transactionCode?.identifier; // "80053"
round.charges()[0]?.amountExtended;              // "150.00&USD": wire text, never a number
```

***

### buildMdm()

> **buildMdm**(`event`, `init`): [`Hl7Message`](#hl7message)

Build a spec-clean MDM message for `event` (the MSH-9.2 trigger, e.g.
`"T02"` original document notification and content, `"T06"` document addendum
notification and content) from typed inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and
`msg.documents()` reads back the document header and body supplied.

#### Parameters

##### event

`string`

the MDM trigger event (MSH-9.2). Required, non-empty.

##### init

[`BuildMdmInit`](#buildmdminit)

the MSH envelope + typed PID/PV1/TXA content. `patient` and
  `document` are required; `document.body` is required for the content events.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `event` is empty, when `init` is not an object, when
  `patient` or `document` is absent, or when a content event is asked for
  with no body.

#### Example

```ts
import { buildMdm, parseHL7 } from "@cosyte/hl7";
const msg = buildMdm("T02", {
  sendingApp: "TRANSCRIPTION",
  receivingApp: "EHR",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  document: {
    documentType: "DS",
    uniqueDocumentNumber: "DOC-1001",
    completionStatus: "AU",
    availabilityStatus: "AV",
    body: [{ setId: "1", valueType: "TX", value: "Discharge summary text." }],
  },
});
const round = parseHL7(msg.toString());
round.warnings.length;                       // 0
round.documents()[0]?.completionStatus;      // "AU"
round.documents()[0]?.observations[0]?.value; // "Discharge summary text."
```

***

### buildMessage()

> **buildMessage**(`init`): [`Hl7Message`](#hl7message)

Construct an outbound `Hl7Message` from semantic MSH fields.
Synthesises a complete MSH `RawSegment` and hands it to
`new Hl7Message({...})`. Callers chain `.addSegment(name, fields)`
(mutation method) to append PID, OBX, etc.

Defaults applied when fields are omitted:
- `controlId` → `generateControlId()`
- `timestamp` → `formatHl7Timestamp(new Date())`
- `version` → `"2.5"`
- `processingId` → `"P"`
- `sendingApp`/`sendingFacility`/`receivingApp`/`receivingFacility` → empty

Encoding characters are always `DEFAULT_ENCODING_CHARACTERS`; no
option to customise in v1.

**Empty string vs. omitted field:** at the HL7 wire level, passing
`sendingApp: ""` and omitting `sendingApp` produce IDENTICAL output
(both emit as absent: `||` at the MSH-3 position). If you need to
emit an HL7 explicit null (`""`, the two-char literal) at a specific
position, build the message first, then use `setField`:

```ts
const msg = buildMessage({ type: "ADT^A01" });
msg.setField("MSH.3", '""');  // sets RawField.isNull = true
// msg.toString() now emits MSH-3 as `""` (2 chars), not as absent.
```

`BuildMessageInit` carries the same note on the input shape.

#### Parameters

##### init

[`BuildMessageInit`](#buildmessageinit)

#### Returns

[`Hl7Message`](#hl7message)

#### Example

```ts
import { buildMessage, parseHL7 } from "@cosyte/hl7";
const msg = buildMessage({
  type: "ADT^A01",
  sendingApp: "CLINIC",
  sendingFacility: "MAIN",
  receivingApp: "LAB",
  receivingFacility: "REF",
}).addSegment("PID", ["", "", "MRN123", "", "Doe^John"]);

// Spec-clean HL7 string round-trips through parseHL7:
const round = parseHL7(msg.toString());
console.log(round.meta.type); // "ADT^A01"
```

***

### buildOrm()

> **buildOrm**(`init`): [`Hl7Message`](#hl7message)

Build a spec-clean `ORM^O01` general-order message from typed inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and `msg.orders()`
reads back the orders supplied, in the order supplied.

#### Parameters

##### init

[`BuildOrmInit`](#buildorminit)

the MSH envelope + typed PID/ORC/OBR content. `patient` and a
  non-empty `orders` list are required.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `init` is not an object, when `patient` is absent, or
  when `orders` is absent or empty.

#### Example

```ts
import { buildOrm, parseHL7 } from "@cosyte/hl7";
const msg = buildOrm({
  sendingApp: "EHR",
  receivingApp: "LAB",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
  orders: [
    {
      orderControl: "NW",
      setId: "1",
      placerOrderNumber: "PL-1001",
      universalServiceId: { identifier: "CBC", text: "Complete Blood Count" },
      orderingProvider: { idNumber: "9990", familyName: "Welby" },
    },
  ],
});
const round = parseHL7(msg.toString());
round.warnings.length;                              // 0
round.orders()[0]?.orderControl;                    // "NW"
round.orders()[0]?.universalServiceId?.identifier;  // "CBC"
```

***

### buildOru()

> **buildOru**(`init`): [`Hl7Message`](#hl7message)

Build a spec-clean ORU^R01 observation-result message from typed inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and
`msg.observations()` reads back the results supplied.

#### Parameters

##### init

[`BuildOruInit`](#buildoruinit)

the MSH envelope + typed PID/OBR/OBX content. `patient` and a
  non-empty `observations` list are required.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `patient` is absent or `observations` is empty.

#### Example

```ts
import { buildOru, parseHL7 } from "@cosyte/hl7";
const msg = buildOru({
  sendingApp: "LAB",
  receivingApp: "EHR",
  patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
             name: { familyName: "Test", givenName: "Ann" } },
  order: { universalServiceId: { identifier: "CBC", text: "Complete Blood Count", nameOfCodingSystem: "L" },
           resultStatus: "F" },
  observations: [
    { setId: "1", valueType: "NM",
      identifier: { identifier: "WBC", text: "White Blood Cells", nameOfCodingSystem: "LN" },
      value: "7.2", units: { identifier: "10*3/uL" }, observationResultStatus: "F" },
  ],
});
const round = parseHL7(msg.toString());
round.warnings.length;                  // 0
round.observations()[0]?.value;         // "7.2"
```

***

### buildSiu()

> **buildSiu**(`event`, `init`): [`Hl7Message`](#hl7message)

Build a spec-clean SIU message for `event` (the MSH-9.2 trigger, e.g.
`"S12"` new appointment, `"S14"` appointment modification, `"S15"`
appointment cancellation) from typed inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and
`msg.appointments()` reads back the identifiers, timing and resources
supplied.

#### Parameters

##### event

`string`

the SIU trigger event (MSH-9.2). Required, non-empty.

##### init

[`BuildSiuInit`](#buildsiuinit)

the MSH envelope + typed SCH/RGS/AI* content. `appointment` and
  a non-empty `resourceGroups` list are required.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `event` is empty, when `init` is not an object, when
  `appointment` is absent, or when `resourceGroups` is absent or empty.

#### Example

```ts
import { buildSiu, parseHL7 } from "@cosyte/hl7";
const msg = buildSiu("S12", {
  sendingApp: "SCHEDULING",
  receivingApp: "EHR",
  appointment: {
    placerAppointmentId: "PL-1001",
    fillerAppointmentId: "FL-2002",
    startDateTime: "20260801090000",
    endDateTime: "20260801093000",
    fillerStatusCode: { identifier: "Booked" },
  },
  resourceGroups: [
    {
      setId: "1",
      resources: [
        { kind: "location", code: { identifier: "OR-1" } },
        { kind: "personnel", person: { idNumber: "9990", familyName: "Welby" } },
      ],
    },
  ],
});
const round = parseHL7(msg.toString());
round.warnings.length;                                 // 0
round.appointments()[0]?.fillerAppointmentId;          // "FL-2002"
round.appointments()[0]?.resources.map((r) => r.kind); // ["location", "personnel"]
```

***

### buildVxu()

> **buildVxu**(`init`): [`Hl7Message`](#hl7message)

Build a spec-clean `VXU^V04` vaccination-record-update message from typed
inputs.

The result is a real [Hl7Message](#hl7message): `msg.toString()` serialises it,
`parseHL7(msg.toString())` round-trips with zero warnings, and
`msg.immunizations()` reads back the doses supplied, in the order supplied.

#### Parameters

##### init

[`BuildVxuInit`](#buildvxuinit)

the MSH envelope + typed PID/RXA content. `patient` and a
  non-empty `immunizations` list are required.

#### Returns

[`Hl7Message`](#hl7message)

#### Throws

TypeError when `init` is not an object, when `patient` is absent, or
  when `immunizations` is absent or empty.

#### Example

```ts
import { buildVxu, parseHL7 } from "@cosyte/hl7";
const msg = buildVxu({
  sendingApp: "CLINIC",
  receivingApp: "IIS",
  patient: {
    identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
    name: { familyName: "Test", givenName: "Ann" },
  },
  immunizations: [
    {
      orderControl: "RE",
      administeredDateTime: "20260801",
      vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
      doseAmount: "0.5",
      doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
      completionStatus: "CP",
      actionCode: "A",
      routes: [{ route: { identifier: "IM", text: "Intramuscular" } }],
    },
  ],
});
const round = parseHL7(msg.toString());
round.warnings.length;                              // 0
round.immunizations()[0]?.vaccineCode?.identifier;  // "115"
```

***

### canonicalCharset()

> **canonicalCharset**(`raw`): `string`

The canonical Table-0211 code for a label, for equality comparison (e.g. the
MSH-18-vs-`options.charset` `ENCODING_MISMATCH` check). Synonyms collapse to
one canonical string (`"UNICODE UTF-8"` and `"UTF-8"` → `"UTF-8"`), so a
synonym pair does not raise a false mismatch; an unrecognized label returns
its normalized form so two genuinely different labels still differ.

#### Parameters

##### raw

`string`

#### Returns

`string`

#### Example

```ts
import { canonicalCharset } from "@cosyte/hl7";
canonicalCharset("unicode utf-8") === canonicalCharset("UTF-8"); // true
```

***

### codingSystem()

> **codingSystem**(`id`): [`CodingSystemInfo`](#codingsysteminfo) \| `undefined`

Resolve a raw coding-system id (a CWE.3 / CE.3 "Name of Coding System"
value) to its provenance. Returns `undefined` when there is no claim to
resolve: `id` is `undefined`, empty, or whitespace-only.

Matching is case-insensitive and tolerant of surrounding whitespace, and
normalizes the well-known aliases in [KNOWN\_CODING\_SYSTEMS](#known_coding_systems) (e.g.
`"LOINC"` → `LN`, `"SNOMED"` → `SCT`, `"RxNorm"` → `RXN`). An unrecognized
id is returned verbatim with `known: false`: never guessed.

#### Parameters

##### id

`string` \| `undefined`

#### Returns

[`CodingSystemInfo`](#codingsysteminfo) \| `undefined`

#### Example

```ts
import { codingSystem } from "@cosyte/hl7";
codingSystem("LN");      // { claimed: "LN", known: true, id: "LN", name: "LOINC" }
codingSystem("loinc");   // { claimed: "loinc", known: true, id: "LN", name: "LOINC" }
codingSystem("99zL");    // { claimed: "99zL", known: false }
codingSystem(undefined); // undefined
```

***

### codingSystemOf()

> **codingSystemOf**(`coded`): [`CodingSystemInfo`](#codingsysteminfo) \| `undefined`

Provenance of a coded element's **primary** coding system (CWE.3 / CE.3).
Returns `undefined` when the element claims no primary system.

#### Parameters

##### coded

[`CodedSystemFields`](#codedsystemfields)

#### Returns

[`CodingSystemInfo`](#codingsysteminfo) \| `undefined`

#### Example

```ts
import { parseHL7, codingSystemOf } from "@cosyte/hl7";
const msg = parseHL7(raw);
for (const dg of msg.diagnoses()) {
  const sys = dg.code && codingSystemOf(dg.code);
  console.log(dg.code?.identifier, sys?.name ?? sys?.claimed ?? "(no system)");
}
```

***

### decodeText()

> **decodeText**(`input`, `enc?`): `string`

Decode a field's escape-bearing HL7 text to its human value: the five
delimiter escapes (`\F\ \S\ \T\ \R\ \E\`), the truncation escape (`\P`),
`\.br\` (→ newline), and hex (`\Xdddd…`) are resolved; presentational
escapes (`\H\`/`\N`, formatting, charset, vendor `\Z..`) are **preserved
verbatim** so nothing is lost. Never throws.

This is the one-call inverse of [encodeText](#encodetext) for delimiter-bearing
content. It does **not** interpret formatting/highlight: for a normalized
display string use [renderText](#rendertext).

#### Parameters

##### input

`string`

the field's escape-bearing text.

##### enc?

[`EncodingCharacters`](#encodingcharacters-1) = `DEFAULT_ENCODING_CHARACTERS`

encoding characters; defaults to the HL7 standard `|^~\&`.

#### Returns

`string`

the decoded value string.

#### Example

```ts
import { decodeText } from "@cosyte/hl7";
decodeText("Doe\\S\\John");   // "Doe^John": \S\ → component separator
decodeText("line1\\.br\\line2"); // "line1\nline2"
```

***

### defineConformanceProfile()

> **defineConformanceProfile**(`profile`): [`ConformanceProfile`](#conformanceprofile)

The **fail-fast authoring** gate for a conformance profile: a malformed
profile raises a typed `ProfileDefinitionError` at build time, before any
validation runs. Runs [collectProfileDefects](namespaces/conformance.md#collectprofiledefects); on any defect, throws a
single [ProfileDefinitionError](#profiledefinitionerror) listing every defect. On success,
returns the profile typed as [ConformanceProfile](#conformanceprofile).

This is **optional**: [validateAgainstProfile](#validateagainstprofile) tolerates a raw profile
object and never throws: but it lets an author catch a typo when the profile
is written rather than when it is run.

#### Parameters

##### profile

`unknown`

#### Returns

[`ConformanceProfile`](#conformanceprofile)

#### Throws

when the profile is structurally malformed.

#### Example

```ts
import { defineConformanceProfile } from "@cosyte/hl7";
const profile = defineConformanceProfile({
  name: "example-adt-min",
  segments: [{ segment: "PID", usage: "R" }],
});
// A typo throws at authoring time:
// defineConformanceProfile({ name: "x", segments: [{ segment: "pid" }] });
//   → ProfileDefinitionError: segments[0].segment must be a valid segment name…
```

***

### defineProfile()

> **defineProfile**\<`O`\>(`opts`): [`DefinedProfile`](#definedprofile)\<`O`\>

Build a readonly `Profile` from a validated options object. Invalid
input throws `ProfileDefinitionError` with an actionable message:
bad Z-segment names, malformed date formats,
unknown top-level keys with typo hints, and missing/empty
name.

`opts.extends` accepts a single parent `Profile` or an array of them.
Parents are merged into the result: `lineage` is the parents' lineages
followed by this profile's own name, `dateFormats`, `customSegments` and
`segmentOverrides` are merged, `description` inherits when not supplied, and
`onWarning` handlers are composed. With no parent, `lineage === [opts.name]`.

`segmentOverrides` names fields on STANDARD segments and is ADDITIVE ONLY: a
declaration there gives `seg.get(name)` a new name to resolve and changes no
existing read. Keys must be standard segment names, so a Z-segment key is
refused and pointed back at `customSegments`.

The returned profile CARRIES ITS DECLARED FIELD NAMES IN ITS TYPE: parse
with it and `seg.get(name)` on a declared segment type is checked against
the names declared for that type, a typo failing to compile instead of
silently reading `undefined`. That is additive, and the value stays
assignable to the general `Profile` interface with no cast; a caller who
annotates the variable `Profile` gives the narrowing up rather than hitting
an error, and one who passes an options object typed as
`DefineProfileOptions` never had it in the first place.

#### Type Parameters

##### O

`O` *extends* [`DefineProfileOptions`](#defineprofileoptions)

#### Parameters

##### opts

`O`

#### Returns

[`DefinedProfile`](#definedprofile)\<`O`\>

#### Example

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const epic = defineProfile({
  name: "epic",
  description: "Epic-specific quirks and ADT date formats",
  dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"],
  customSegments: {
    ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
    ZRS: { fields: { resultStatus: 1, statusDateTime: 2 } },
  },
});
console.log(epic.name); // "epic"
console.log(epic.lineage); // ["epic"]
console.log(epic.describe?.());
const msg = parseHL7(raw, epic);
console.log(msg.part("ZDP")?.get("departmentCode")?.value); // narrowed
// msg.part("ZDP")?.get("resultStatus"); // does not compile: that is a ZRS name
```

***

### detectAckMode()

> **detectAckMode**(`inbound`): [`AckMode`](#ackmode)

Detect the HL7 acknowledgment mode of an inbound message from MSH-15 (accept
acknowledgment type) and MSH-16 (application acknowledgment type), per HL7 v2
Chapter 2 §2.9: **original** when *both* are absent/empty; **enhanced** when
*either* is present. This split is spec-exact (unlike the disposition mapping,
which has no single correct model: see the package README).

#### Parameters

##### inbound

[`Hl7Message`](#hl7message)

#### Returns

[`AckMode`](#ackmode)

#### Example

```ts
import { detectAckMode, parseHL7 } from "@cosyte/hl7";
detectAckMode(parseHL7(raw)); // "original" | "enhanced"
```

***

### downgradePositiveAck()

> **downgradePositiveAck**(`code`): [`AckCode`](#ackcode)

Downgrade a positive acknowledgment code to its matching error code,
`AA` → `AE` (original mode), `CA` → `CE` (enhanced mode). Every other code
passes through unchanged.

This is the **single upstream source of truth** for the fail-safe downgrade
pair: `buildAck` applies it when the inbound carries no MSH-10 correlation
id, and `@cosyte/mllp`'s `ack-from-hl7` adapter applies it when the inbound
cannot be parsed at all: neither ever fabricates an unverifiable positive
acknowledgment, and neither carries its own copy of the mapping.

#### Parameters

##### code

[`AckCode`](#ackcode)

#### Returns

[`AckCode`](#ackcode)

#### Example

```ts
import { downgradePositiveAck } from "@cosyte/hl7";
downgradePositiveAck("AA"); // "AE"
downgradePositiveAck("CA"); // "CE"
downgradePositiveAck("AR"); // "AR" (unchanged)
```

***

### dtmToDate()

> **dtmToDate**(`parts`, `options?`): `Date` \| `undefined`

Materialize an absolute-instant JS `Date` from [DtmParts](#dtmparts): **only on
explicit caller request**. Truncated fields fill to their lowest legal value
(month → January, day → 1, time → 0) *for instant construction only*; the
value's stated `precision` still tells the truth.

Timezone resolution is honest:
 - has an offset → the exact instant, using that offset;
 - no offset + `assumeOffsetMinutes` supplied → that offset is applied;
 - no offset + nothing supplied → `undefined` (never a silent UTC guess).

Returns `undefined` for an invalid value or an unresolvable zone; never
throws.

#### Parameters

##### parts

[`DtmParts`](#dtmparts)

##### options?

[`DtmToDateOptions`](#dtmtodateoptions) = `{}`

#### Returns

`Date` \| `undefined`

#### Example

```ts
import { parseDtm, dtmToDate } from "@cosyte/hl7";

dtmToDate(parseDtm("20250102153045-0500"))?.toISOString();
// "2025-01-02T20:30:45.000Z": exact, offset-derived

dtmToDate(parseDtm("20250102"));                       // undefined: refuses to guess the zone
dtmToDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString();
// "2025-01-02T00:00:00.000Z": caller explicitly assumed UTC
```

***

### duplicateRequiredSegment()

> **duplicateRequiredSegment**(`position`, `segmentName`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `DUPLICATE_REQUIRED_SEGMENT` warning. Emitted when a segment the
profile marks as singleton appears more than once (e.g. two `MSH`
segments). The parser keeps both; the warning alerts the consumer to
potential sender bugs.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### segmentName

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { duplicateRequiredSegment } from "@cosyte/hl7";
const w = duplicateRequiredSegment({ segmentIndex: 1 }, "MSH");
```

***

### emitMessageSchema()

> **emitMessageSchema**(`target`): `string`

Emit the named artifact for the serialized message projection, as text.

`json-schema-2020-12` returns the JSON Schema document serialized with
two-space indentation and a trailing newline; `zod` returns the TypeScript
source text. Any other name throws [SchemaTargetError](#schematargeterror) and returns
nothing at all.

Pure and repeatable: no message is read, no network is touched, and two calls
for the same target in one process return the identical string.

#### Parameters

##### target

`string`

#### Returns

`string`

#### Example

```ts
import { emitMessageSchema } from "@cosyte/hl7";
const schema = emitMessageSchema("json-schema-2020-12");
const zod = emitMessageSchema("zod");
schema === emitMessageSchema("json-schema-2020-12"); // true
zod.includes("import { z } from \"zod\";");          // true
```

***

### encodeCe()

> **encodeCe**(`v`): [`RawField`](#rawfield)

Encode a CE (coded element, 6 modelled + preserved `extraComponents`).

#### Parameters

##### v

[`CE`](#ce)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCe } from "@cosyte/hl7";
encodeCe({ identifier: "GLU", text: "Glucose", nameOfCodingSystem: "L" });
```

***

### encodeCne()

> **encodeCne**(`v`): [`RawField`](#rawfield)

Encode a CNE (coded element with no exceptions, 22 named components +
preserved `extraComponents`, which hold component 23 onward).

#### Parameters

##### v

[`CNE`](#cne)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCne } from "@cosyte/hl7";
encodeCne({ identifier: "Y", text: "Yes", nameOfCodingSystem: "HL70136" });
```

***

### encodeComposite()

> **encodeComposite**\<`K`\>(`kind`, `value`): [`RawField`](#rawfield)

Encode any typed composite into a spec-clean `RawField` by its
[CompositeKind](#compositekind). The single dispatcher `setComposite` and the typed
builders (`buildAdt`/`buildOru`) route through.

Encoding takes **no** encoding-characters argument on purpose: the field it
produces carries the **decoded** component values, and the actual
delimiter-escaping happens later in the serializer against the message's own
encoding characters: so a composite is delimiter-independent to encode.

#### Type Parameters

##### K

`K` *extends* [`CompositeKind`](#compositekind)

#### Parameters

##### kind

`K`

##### value

[`CompositeValueByKind`](#compositevaluebykind)\[`K`\]

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeComposite } from "@cosyte/hl7";
// A hostile family name cannot break framing on emit:
const f = encodeComposite("XPN", { familyName: "Smith^Jr", givenName: "Ann" });
```

***

### encodeCompositeReps()

> **encodeCompositeReps**\<`K`\>(`kind`, `values`): [`RawField`](#rawfield)

Encode an array of typed composites into a single repeating `RawField`: one
HL7 repetition (`~`-joined on emit) per array element. Used for repeating
fields such as PID-3 (patient identifier list) and PID-11 (addresses). An
empty array yields an absent field, and an entry that is empty, a hole or
`null` yields no repetition.

#### Type Parameters

##### K

`K` *extends* [`CompositeKind`](#compositekind)

#### Parameters

##### kind

`K`

##### values

readonly [`CompositeValueByKind`](#compositevaluebykind)\[`K`\][]

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCompositeReps } from "@cosyte/hl7";
const ids = encodeCompositeReps("CX", [
  { idNumber: "MRN001", identifierTypeCode: "MR" },
  { idNumber: "9990", identifierTypeCode: "SS" },
]);
```

***

### encodeCp()

> **encodeCp**(`v`): [`RawField`](#rawfield)

Encode a CP (composite price): the price is a nested MO and the range units a
nested coded element, each emitted as subcomponents.

#### Parameters

##### v

[`CP`](#cp-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCp } from "@cosyte/hl7";
encodeCp({ price: { quantity: "150.00", denomination: "USD" }, priceType: "UP" });
```

***

### encodeCq()

> **encodeCq**(`v`): [`RawField`](#rawfield)

Encode a CQ (quantity with units): the units are a nested coded element
emitted as subcomponents.

#### Parameters

##### v

[`CQ`](#cq-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCq } from "@cosyte/hl7";
encodeCq({ quantity: "2", units: { identifier: "TAB", text: "tablet" } });
```

***

### encodeCwe()

> **encodeCwe**(`v`): [`RawField`](#rawfield)

Encode a CWE (coded element, 22 named components + preserved
`extraComponents`).

`extraComponents` holds component 10 onward, as `parseCwe` returns it. For
components 10 to 22 a named field wins over the entry at the same position,
so a value read with `parseCwe`, then edited by name, emits the edit;
entries past the 22nd component are emitted after the named ones.

#### Parameters

##### v

[`CWE`](#cwe-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCwe } from "@cosyte/hl7";
encodeCwe({ identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" });
```

***

### encodeCx()

> **encodeCx**(`v`): [`RawField`](#rawfield)

Encode a CX (identifier): component 4 is a nested HD (assigningAuthority).

#### Parameters

##### v

[`CX`](#cx-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeCx } from "@cosyte/hl7";
encodeCx({ idNumber: "MRN001", assigningAuthority: { namespaceId: "HOSP" }, identifierTypeCode: "MR" });
```

***

### encodeDr()

> **encodeDr**(`v`): [`RawField`](#rawfield)

Encode a DR (date/time range, 2 components) to a spec-clean field. Each
endpoint is emitted as the raw text it carries.

#### Parameters

##### v

[`DR`](#dr-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeDr } from "@cosyte/hl7";
encodeDr({ rangeStartDateTime: "20260101", rangeEndDateTime: "20261231" });
```

***

### encodeEi()

> **encodeEi**(`v`): [`RawField`](#rawfield)

Encode an EI (entity identifier, 4 components) to a spec-clean field.

#### Parameters

##### v

[`EI`](#ei-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeEi } from "@cosyte/hl7";
encodeEi({ entityIdentifier: "PL-1001", namespaceId: "CLINIC" });
```

***

### encodeEip()

> **encodeEip**(`v`): [`RawField`](#rawfield)

Encode an EIP (entity identifier pair): each component is a nested EI whose
parts are emitted as subcomponents.

#### Parameters

##### v

[`EIP`](#eip-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeEip } from "@cosyte/hl7";
encodeEip({
  placerAssignedIdentifier: { entityIdentifier: "PL-1001" },
  fillerAssignedIdentifier: { entityIdentifier: "FL-2002" },
});
```

***

### encodeFc()

> **encodeFc**(`v`): [`RawField`](#rawfield)

Encode an FC (financial class): the class code is a nested coded element
emitted as subcomponents, the effective date its raw text.

#### Parameters

##### v

[`FC`](#fc-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeFc } from "@cosyte/hl7";
encodeFc({ financialClassCode: { identifier: "SP" }, effectiveDate: "20260101" });
```

***

### encodeHd()

> **encodeHd**(`v`): [`RawField`](#rawfield)

Encode an HD (hierarchic designator, 3 components) to a spec-clean field.

#### Parameters

##### v

[`HD`](#hd-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeHd } from "@cosyte/hl7";
encodeHd({ namespaceId: "EPIC", universalId: "1.2.840", universalIdType: "ISO" });
```

***

### encodeMo()

> **encodeMo**(`v`): [`RawField`](#rawfield)

Encode an MO (money, 2 components) to a spec-clean field. The amount is
emitted as the text it carries, never re-formatted.

#### Parameters

##### v

[`MO`](#mo-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeMo } from "@cosyte/hl7";
encodeMo({ quantity: "150.00", denomination: "USD" });
```

***

### encodeMsg()

> **encodeMsg**(`v`): [`RawField`](#rawfield)

Encode an MSG (message type, 3 components) to a spec-clean field.

#### Parameters

##### v

[`MSG`](#msg-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeMsg } from "@cosyte/hl7";
encodeMsg({ messageCode: "ADT", triggerEvent: "A01", messageStructure: "ADT_A01" });
```

***

### encodeNm()

> **encodeNm**(`v`): [`RawField`](#rawfield)

Encode an NM numeric. Accepts the typed [NM](#nm-1) (its `raw` string emitted
verbatim, preserving the sender's precision/formatting), a `number`, or a raw
string. A `number` is stringified with `String(n)`; the value is never
reconciled or rounded.

#### Parameters

##### v

`string` \| `number` \| [`NM`](#nm-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeNm } from "@cosyte/hl7";
encodeNm("120.50"); // precision preserved verbatim
```

***

### encodePl()

> **encodePl**(`v`): [`RawField`](#rawfield)

Encode a PL (person location): component 4 is a nested HD (facility).

#### Parameters

##### v

[`PL`](#pl-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodePl } from "@cosyte/hl7";
encodePl({ pointOfCare: "ICU", room: "101", bed: "A" });
```

***

### encodePt()

> **encodePt**(`v`): [`RawField`](#rawfield)

Encode a PT (processing type, 2 components) to a spec-clean field.

#### Parameters

##### v

[`PT`](#pt-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodePt } from "@cosyte/hl7";
encodePt({ processingId: "P" });
```

***

### encodeText()

> **encodeText**(`input`, `enc?`): `string`

**Encode-safe** direction: escape an arbitrary string so it can be placed in
an HL7 field as data without ever breaking framing. Every reserved character
: the escape char (escaped **first**, so decoding is unambiguous), the field,
component, subcomponent, and repetition separators, the declared truncation
char, and the framing-critical `\n`/`\r`: is replaced by its escape
sequence, so the value **cannot inject a delimiter or forge a component /
subcomponent / repetition boundary**.

The hard invariant, property-tested over arbitrary strings:
`decodeText(encodeText(s, enc), enc) === s`, and a message field carrying
`encodeText(s)` **cannot forge a component / subcomponent / repetition
boundary or break framing**: the value never escapes its field.

Two caveats are inherent to HL7 field encoding, not to this codec, and apply
to *whole-field* re-parse (they do not weaken the no-injection guarantee):
the two-character string `""` is HL7's explicit-null token, so a field whose
entire value is `""` re-parses as null; and the default parser trims field
whitespace, so a value with leading/trailing spaces re-parses trimmed. Encode
such values into a component/subcomponent position, or parse with trimming
off, to preserve them exactly.

#### Parameters

##### input

`string`

the arbitrary string to encode.

##### enc?

[`EncodingCharacters`](#encodingcharacters-1) = `DEFAULT_ENCODING_CHARACTERS`

encoding characters; defaults to the HL7 standard `|^~\&`.

#### Returns

`string`

the spec-clean, delimiter-safe field body.

#### Example

```ts
import { encodeText, parseHL7 } from "@cosyte/hl7";
// A value full of delimiters cannot break out of its field:
const hostile = "a|b^c~d\\e&f";
const body = encodeText(hostile); // "a\\F\\b\\S\\c\\R\\d\\E\\e\\T\\f"
const msg = parseHL7(`MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rNTE|1||${body}`);
msg.segments("NTE")[0]?.field(3).value === hostile; // true: round-trips exactly
```

***

### encodeTs()

> **encodeTs**(`v`): [`RawField`](#rawfield)

Encode a TS/DTM timestamp. Accepts either the typed [TS](#ts-1) (its `raw`
string is emitted verbatim: the serializer never re-derives a timestamp
from parts) or a pre-formatted HL7 timestamp string.

#### Parameters

##### v

`string` \| [`DtmParts`](#dtmparts)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeTs } from "@cosyte/hl7";
encodeTs("20260721101500");
```

***

### encodeVid()

> **encodeVid**(`v`): [`RawField`](#rawfield)

Encode a VID (version identifier): components 2 and 3 are nested coded
elements emitted as subcomponents.

#### Parameters

##### v

[`VID`](#vid-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeVid } from "@cosyte/hl7";
encodeVid({ versionId: "2.5.1" });
```

***

### encodeXad()

> **encodeXad**(`v`): [`RawField`](#rawfield)

Encode an XAD (12 components) to a spec-clean field.

#### Parameters

##### v

[`XAD`](#xad-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeXad } from "@cosyte/hl7";
encodeXad({ street: "123 Main St", city: "Boston", stateOrProvince: "MA" });
```

***

### encodeXcn()

> **encodeXcn**(`v`): [`RawField`](#rawfield)

Encode an XCN: component 9 is a nested HD (assigningAuthority).

#### Parameters

##### v

[`XCN`](#xcn-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeXcn } from "@cosyte/hl7";
encodeXcn({ idNumber: "1234567890", familyName: "Welby", identifierTypeCode: "NPI" });
```

***

### encodeXpn()

> **encodeXpn**(`v`): [`RawField`](#rawfield)

Encode an XPN (14 components) to a spec-clean field.

#### Parameters

##### v

[`XPN`](#xpn-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeXpn } from "@cosyte/hl7";
encodeXpn({ familyName: "Doe", givenName: "Jane", prefix: "Dr" });
```

***

### encodeXtn()

> **encodeXtn**(`v`): [`RawField`](#rawfield)

Encode an XTN (telecom, 12 components) to a spec-clean field.

#### Parameters

##### v

[`XTN`](#xtn-1)

#### Returns

[`RawField`](#rawfield)

#### Example

```ts
import { encodeXtn } from "@cosyte/hl7";
encodeXtn({ telephoneNumber: "555-1234", telecommunicationUseCode: "PRN" });
```

***

### encodingMismatch()

> **encodingMismatch**(`position`, `detail`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `ENCODING_MISMATCH` warning. Emitted when the MSH-2 encoding
characters declared by the sender do not match what the parser observed
downstream (e.g. the sender declares `^~\&` but uses `!@#$` as actual
separators in later segments).

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### detail

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { encodingMismatch } from "@cosyte/hl7";
const w = encodingMismatch({ segmentIndex: 0 }, "MSH-2 declares ^~\\& but segment used !@#$");
```

***

### extraFields()

> **extraFields**(`position`, `segmentName`, `extraCount`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `EXTRA_FIELDS` warning. Emitted when a segment contains more
fields than the profile definition (or HL7 spec) declares: the extras
are preserved on `RawSegment.fields` but flagged for consumers.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### segmentName

`string`

##### extraCount

`number`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { extraFields } from "@cosyte/hl7";
const w = extraFields({ segmentIndex: 4 }, "PID", 3);
```

***

### fieldWhitespaceTrimmed()

> **fieldWhitespaceTrimmed**(`position`, `leadingCount`, `trailingCount`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `FIELD_WHITESPACE_TRIMMED` warning. Emitted when the parser trims
leading or trailing whitespace from a field value (the `trimFields`
option, on by default). The message carries only the leading/trailing
character **counts**: NEVER the field value itself (before or after
trimming): so no PHI is exposed; the trimmed value is still preserved
verbatim in the parsed output.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### leadingCount

`number`

##### trailingCount

`number`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { fieldWhitespaceTrimmed } from "@cosyte/hl7";
const w = fieldWhitespaceTrimmed({ segmentIndex: 1, fieldIndex: 5 }, 2, 1);
```

***

### findMessageStructureDefinition()

> **findMessageStructureDefinition**(`messageCode`, `triggerEvent`): [`MessageStructureDefinition`](#messagestructuredefinition) \| `undefined`

The registry entry behind a recognized (message code, trigger event) pair, or
`undefined` when the pair is not modelled. Exposed so a consumer reading a
structural warning can reach the published structure it came from.

#### Parameters

##### messageCode

`string`

##### triggerEvent

`string`

#### Returns

[`MessageStructureDefinition`](#messagestructuredefinition) \| `undefined`

#### Example

```ts
import { findMessageStructureDefinition } from "@cosyte/hl7";
const def = findMessageStructureDefinition("ORU", "R01");
console.log(def?.structureId); // "ORU_R01"
```

***

### formatDtm()

> **formatDtm**(`parts`): `string`

Reconstruct the HL7 DTM string from [DtmParts](#dtmparts). The inverse of
[parseDtm](#parsedtm) for a strict HL7 parse: `formatDtm(parseDtm(s)) === s` for
any well-formed `s`, including the byte-preserving `-0000` (which HL7, unlike
RFC 3339, treats as UTC but whose sign we retain for exact round-trip).
Returns the raw string unchanged when `parts.valid` is `false`.

Emits exactly the populated precision, no zero-fill, so a year-only value
re-serializes to four characters, never `YYYY0101`.

#### Parameters

##### parts

[`DtmParts`](#dtmparts)

#### Returns

`string`

#### Example

```ts
import { parseDtm, formatDtm } from "@cosyte/hl7";
formatDtm(parseDtm("198807050000")); // "198807050000"
formatDtm(parseDtm("1970"));         // "1970"
```

***

### getDefaultProfile()

> **getDefaultProfile**(): [`Profile`](#profile-2) \| `undefined`

Return the current default profile, or `undefined` if none is
registered. Consistent with `msg.profile` convention: `undefined`
rather than `null`.

#### Returns

[`Profile`](#profile-2) \| `undefined`

#### Example

```ts
import { getDefaultProfile } from "@cosyte/hl7";
const p = getDefaultProfile();
if (p !== undefined) console.log("default profile:", p.name);
```

***

### interpretAck()

> **interpretAck**(`msg`): [`Acknowledgment`](#acknowledgment)

Interpret an `Hl7Message` as an acknowledgment. Never throws; a message with
no MSA segment yields an all-`false`, empty-`errors` view. The result is
deeply frozen.

#### Parameters

##### msg

[`Hl7Message`](#hl7message)

#### Returns

[`Acknowledgment`](#acknowledgment)

#### Example

```ts
import { interpretAck, parseHL7 } from "@cosyte/hl7";
const view = interpretAck(parseHL7("MSH|^~\\&|...\rMSA|AA|MSG001"));
view.accepted;  // true
view.controlId; // "MSG001"
```

***

### isPositiveAck()

> **isPositiveAck**(`code`): `boolean`

True iff `code` is a positive accept (`AA`/`CA`). Unknown/absent → false.

#### Parameters

##### code

`string` \| `undefined`

#### Returns

`boolean`

#### Example

```ts
isPositiveAck("AA"); // true
isPositiveAck("AE"); // false
```

***

### isSchemaEmitTarget()

> **isSchemaEmitTarget**(`name`): name is "json-schema-2020-12" \| "zod"

Whether a name is one of the supported emission targets.

#### Parameters

##### name

`string`

#### Returns

name is "json-schema-2020-12" \| "zod"

#### Example

```ts
import { isSchemaEmitTarget } from "@cosyte/hl7";
isSchemaEmitTarget("zod");         // true
isSchemaEmitTarget("json-schema"); // false
```

***

### mergeMissingPriorOrSurvivor()

> **mergeMissingPriorOrSurvivor**(`position`, `eventType`, `missing`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning. Emitted
by `identityEvents()` (a read-side helper: it attaches to the returned
`IdentityEvent.warnings`, never to `Hl7Message.warnings`) when a merge/move
trigger event (A18/A34/A35/A36/A39/A40/A41/A42/A43/A44) is missing one side
of the spec-mandated MRG (prior) → PID (surviving) pair: or when that side
carries no usable identity field: no MRG segment in the patient group, no
PID for an orphaned MRG, or a PID/MRG whose identifier, account, and visit
fields are all empty or version-gated (a v2.7+ MRG whose only content was
the withdrawn MRG-4 must not read as "nothing to retire"). The helper
surfaces whatever IS present and never
guesses the merge direction: this warning is the signal that the pair is
incomplete.

The message carries only the structural facts (trigger event code + which
role is missing): NEVER an identifier, name, or any other field value, so
no PHI is exposed (HL7 v2 Ch. 3: the PID carries surviving and the MRG
carries non-surviving identity information).

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### eventType

`string`

##### missing

`"prior"` \| `"survivor"`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { mergeMissingPriorOrSurvivor } from "@cosyte/hl7";
const w = mergeMissingPriorOrSurvivor({ segmentIndex: 1 }, "A40", "prior");
```

***

### messageJsonSchema()

> **messageJsonSchema**(): [`JsonSchemaDocument`](#jsonschemadocument)

Build the JSON Schema document for the serialized message projection.

Pure and repeatable: it reads the measured shape and the warning-code
registry, nothing else. It parses no message, reads no network and returns a
fresh document on every call, so two calls in one process produce equal
documents whatever happened between them.

#### Returns

[`JsonSchemaDocument`](#jsonschemadocument)

#### Example

```ts
import { messageJsonSchema } from "@cosyte/hl7";
const schema = messageJsonSchema();
schema.$schema;          // "https://json-schema.org/draft/2020-12/schema"
schema.required;         // ["encodingCharacters", "segments", "warnings"]
schema.$defs["SerializedProfile"]?.additionalProperties; // false
```

***

### messageZodSource()

> **messageZodSource**(): `string`

Render the whole Zod module for the serialized message projection.

Pure and repeatable: it reads the measured shape and the warning-code
registry, nothing else. It parses no message, reads no network, and two calls
in one process return the identical string whatever happened between them.

The output declares exactly one import, whose module specifier is `zod`, one
`const` per named object in an order where a definition always precedes the
definition that references it, and one inferred type alias for the
projection.

#### Returns

`string`

#### Example

```ts
import { messageZodSource } from "@cosyte/hl7";
const source = messageZodSource();
source.startsWith("//");                       // a header comment
source.includes('import { z } from "zod";');   // the single import
source.includes("export const SerializedMessageSchema");
```

***

### missingExpectedGroup()

> **missingExpectedGroup**(`position`, `messageType`, `groupName`, `anchorSegments`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `MISSING_EXPECTED_GROUP` warning. Emitted once per
absent Required segment group when the message's (MSH-9.1, MSH-9.2) type is
one the structure safety net recognizes and an expected group is entirely
missing: e.g. an `ORU^R01` carrying no `OBR`/`OBX` result group, the
signature of a truncated or misrouted feed. Tier-2 and additive: lenient
parse never throws on it, `strict` mode may promote it. The message carries
only the structural fact (message type, group name, anchor segment names),
never a field value: the message type is shape-checked before it is
interpolated, and withheld if it does not match. `position` references MSH-9.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### messageType

`string`

##### groupName

`string`

##### anchorSegments

readonly `string`[]

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { missingExpectedGroup } from "@cosyte/hl7";
const w = missingExpectedGroup(
  { segmentIndex: 0, fieldIndex: 9 },
  "ORU^R01",
  "result",
  ["OBR", "OBX"],
);
```

***

### missingRequiredField()

> **missingRequiredField**(`position`, `segmentName`, `fieldIndex`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `MISSING_REQUIRED_FIELD` warning. Emitted when a field the active
profile marks as required is empty or missing. Distinct from the
`NO_MSH_SEGMENT` fatal, which escalates a missing MSH altogether.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### segmentName

`string`

##### fieldIndex

`number`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { missingRequiredField } from "@cosyte/hl7";
const w = missingRequiredField({ segmentIndex: 0, fieldIndex: 3 }, "MSH", 3);
```

***

### missingRequiredSegment()

> **missingRequiredSegment**(`position`, `messageType`, `segmentName`, `structureId`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `MISSING_EXPECTED_GROUP` warning naming one absent required SEGMENT.

This is what the parser emits: once per segment the published structure
definition gives a minimum of one and the message does not carry, e.g. an
`ADT^A01` with no `EVN`. It shares the code with
[missingExpectedGroup](#missingexpectedgroup) on purpose. The code is public contract that
consumers narrow on, and the change here is which structural fact the
message names, not which class of finding it is.

Tier-2 and additive: lenient parse never throws on it, `strict` mode may
promote it. The message carries only structural identifiers (the message
type, the segment name, the published structure id), never a field value:
the message type is shape-checked before it is interpolated and withheld if
it does not match, and the other two are registry data rather than anything
read off the message. `position` references MSH-9.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### messageType

`string`

##### segmentName

`string`

##### structureId

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { missingRequiredSegment } from "@cosyte/hl7";
const w = missingRequiredSegment(
  { segmentIndex: 0, fieldIndex: 9 },
  "ADT^A01",
  "EVN",
  "ADT_A01",
);
```

***

### mllpFramingStripped()

> **mllpFramingStripped**(`position`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `MLLP_FRAMING_STRIPPED` warning. Emitted once per parse when the
preprocessor detects and removes MLLP framing bytes (`0x0B` / `0x1C` /
trailing `0x0D`) from the input.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { mllpFramingStripped } from "@cosyte/hl7";
const w = mllpFramingStripped({ segmentIndex: 0 });
```

***

### outOfOrderSegment()

> **outOfOrderSegment**(`position`, `segmentName`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `OUT_OF_ORDER_SEGMENT` warning. Emitted when a segment appears
outside the order the active profile declares (e.g. `EVN` appearing
before `MSH` in a typical ADT message).

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### segmentName

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { outOfOrderSegment } from "@cosyte/hl7";
const w = outOfOrderSegment({ segmentIndex: 2 }, "EVN");
```

***

### parseCe()

> **parseCe**(`rep`, `enc`): [`CE`](#ce)

Parse an HL7 v2 CE repetition into a structured `CE` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics).

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`CE`](#ce)

#### Example

```ts
import { parseCe, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["GLU"] },
  { subcomponents: ["Glucose"] },
  { subcomponents: ["LN"] },
] };
const ce = parseCe(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(ce.identifier); // "GLU"
```

***

### parseCne()

> **parseCne**(`rep`, `enc`): [`CNE`](#cne)

Parse an HL7 v2 CNE repetition into a structured `CNE` object. Components
are returned verbatim (already decoded once by the tokenizer). Absent or
empty components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`CNE`](#cne)

#### Example

```ts
import { parseCne, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["Y"] },
  { subcomponents: ["Yes"] },
  { subcomponents: ["HL70136"] },
] };
const cne = parseCne(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(cne.identifier, cne.nameOfCodingSystem); // "Y" "HL70136"
```

***

### parseCp()

> **parseCp**(`rep`, `enc`): [`CP`](#cp-1)

Parse an HL7 v2 CP repetition into a structured `CP` object. Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`CP`](#cp-1)

#### Example

```ts
import { parseCp, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["150.00", "USD"] }, { subcomponents: ["UP"] }] };
const cp = parseCp(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(cp.price?.quantity, cp.price?.denomination, cp.priceType); // "150.00" "USD" "UP"
```

***

### parseCq()

> **parseCq**(`rep`, `enc`): [`CQ`](#cq-1)

Parse an HL7 v2 CQ repetition into a structured `CQ` object. Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`CQ`](#cq-1)

#### Example

```ts
import { parseCq, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["2"] }, { subcomponents: ["TAB", "tablet"] }] };
const cq = parseCq(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(cq.quantity, cq.units?.identifier); // "2" "TAB"
```

***

### parseCwe()

> **parseCwe**(`rep`, `enc`): [`CWE`](#cwe-1)

Parse an HL7 v2 CWE repetition into a structured `CWE` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics).

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`CWE`](#cwe-1)

#### Example

```ts
import { parseCwe, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["GLU"] },
  { subcomponents: ["Glucose"] },
  { subcomponents: ["LN"] },
] };
const cwe = parseCwe(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(cwe.identifier); // "GLU"
```

***

### parseCx()

> **parseCx**(`rep`, `enc`): [`CX`](#cx-1)

Parse an HL7 v2 CX repetition into a structured `CX` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics). Component 4
(`assigningAuthority`) is parsed as a nested `HD`; see component table in
the `CX` interface JSDoc for the v1 simplifications on components 6/9/10.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`CX`](#cx-1)

#### Example

```ts
import { parseCx, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["123"] },
  { subcomponents: [""] },
  { subcomponents: [""] },
  { subcomponents: ["EPIC", "1.2.840.114350", "ISO"] },
  { subcomponents: ["MR"] },
] };
const cx = parseCx(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(cx.idNumber);                       // "123"
console.log(cx.assigningAuthority?.namespaceId); // "EPIC"
```

***

### parseDr()

> **parseDr**(`rep`, `enc`): [`DR`](#dr-1)

Parse an HL7 v2 DR repetition into a structured `DR` object. Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`DR`](#dr-1)

#### Example

```ts
import { parseDr, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["20260101"] }, { subcomponents: ["20261231"] }] };
const dr = parseDr(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(dr.rangeStartDateTime, dr.rangeEndDateTime); // "20260101" "20261231"
```

***

### parseDtm()

> **parseDtm**(`raw`): [`DtmParts`](#dtmparts)

Parse an HL7 v2 TS/DTM string into typed [DtmParts](#dtmparts), **preserving the
stated precision and timezone fidelity**. Never zero-fills a truncation,
never coerces to a `Date`, and never assumes UTC for a missing offset.

Returns `{ raw, valid: false, hasTimezone: false }` (no parts) for empty,
malformed, or calendar-out-of-range input: never throws. A fractional
component is only accepted at full second precision.

#### Parameters

##### raw

`string`

#### Returns

[`DtmParts`](#dtmparts)

#### Example

```ts
import { parseDtm } from "@cosyte/hl7";

parseDtm("1970");
// { raw: "1970", valid: true, precision: "year", year: 1970, hasTimezone: false }

parseDtm("20250102153045.5-0500");
// precision "fraction", fractionalSeconds "5", hasTimezone true, offsetMinutes -300

parseDtm("not-a-date");
// { raw: "not-a-date", valid: false, hasTimezone: false }
```

***

### parseEi()

> **parseEi**(`rep`, `enc`): [`EI`](#ei-1)

Parse an HL7 v2 EI repetition into a structured `EI` object. Components are
returned verbatim (already decoded once by the tokenizer). Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`EI`](#ei-1)

#### Example

```ts
import { parseEi, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["PL-1001"] },
  { subcomponents: ["CLINIC"] },
] };
const ei = parseEi(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(ei.entityIdentifier, ei.namespaceId); // "PL-1001" "CLINIC"
```

***

### parseEip()

> **parseEip**(`rep`, `enc`): [`EIP`](#eip-1)

Parse an HL7 v2 EIP repetition into a structured `EIP` object. Each
component is read as a nested EI from its subcomponents; an empty one is
OMITTED.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`EIP`](#eip-1)

#### Example

```ts
import { parseEip, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["PL-1001", "CLINIC"] },
  { subcomponents: ["FL-2002", "LAB"] },
] };
const eip = parseEip(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(eip.fillerAssignedIdentifier?.entityIdentifier); // "FL-2002"
```

***

### parseFc()

> **parseFc**(`rep`, `enc`): [`FC`](#fc-1)

Parse an HL7 v2 FC repetition into a structured `FC` object. Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`FC`](#fc-1)

#### Example

```ts
import { parseFc, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["SP"] }, { subcomponents: ["20260101"] }] };
const fc = parseFc(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(fc.financialClassCode?.identifier, fc.effectiveDate); // "SP" "20260101"
```

***

### parseHd()

> **parseHd**(`rep`, `enc`): [`HD`](#hd-1)

Parse an HL7 v2 HD repetition into a structured `HD` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics).

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`HD`](#hd-1)

#### Example

```ts
import { parseHd, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["EPIC"] },
  { subcomponents: ["1.2.840.114350"] },
  { subcomponents: ["ISO"] },
] };
const hd = parseHd(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(hd.namespaceId);     // "EPIC"
console.log(hd.universalIdType); // "ISO"
```

***

### parseHL7()

#### Call Signature

> **parseHL7**(`raw`): [`Hl7Message`](#hl7message)

Parse a raw HL7 v2 message (string or `Buffer`) into an `Hl7Message`.
The parser is lenient by default: recoverable deviations from the HL7
spec are reported via `msg.warnings` and (optionally)
`options.onWarning` but do not throw. Four unrecoverable structural
errors throw `Hl7ParseError`: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
`INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Opt into strict mode
with `{ strict: true }` to escalate every Tier-2 warning into an
`Hl7ParseError`.

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

##### Returns

[`Hl7Message`](#hl7message)

##### Examples

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123",
);
console.log(msg.version); // "2.5"
console.log(msg.warnings.length); // 0
for (const w of msg.warnings) {
  if (w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED) {
    // handle MLLP-framed sender
  }
}
```

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// A statically known profile narrows the field-name reader per segment type:
const msg = parseHL7(raw, vendor);
console.log(msg.part("ZDP")?.get("departmentCode")?.value);
// msg.part("ZDP")?.get("departmentCod"); // does not compile: not declared
```

#### Call Signature

> **parseHL7**\<`P`\>(`raw`, `profile`): [`ProfiledMessage`](#profiledmessage)\<`P`\>

Parse a raw HL7 v2 message (string or `Buffer`) into an `Hl7Message`.
The parser is lenient by default: recoverable deviations from the HL7
spec are reported via `msg.warnings` and (optionally)
`options.onWarning` but do not throw. Four unrecoverable structural
errors throw `Hl7ParseError`: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
`INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Opt into strict mode
with `{ strict: true }` to escalate every Tier-2 warning into an
`Hl7ParseError`.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

###### profile

`P`

##### Returns

[`ProfiledMessage`](#profiledmessage)\<`P`\>

##### Examples

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123",
);
console.log(msg.version); // "2.5"
console.log(msg.warnings.length); // 0
for (const w of msg.warnings) {
  if (w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED) {
    // handle MLLP-framed sender
  }
}
```

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// A statically known profile narrows the field-name reader per segment type:
const msg = parseHL7(raw, vendor);
console.log(msg.part("ZDP")?.get("departmentCode")?.value);
// msg.part("ZDP")?.get("departmentCod"); // does not compile: not declared
```

#### Call Signature

> **parseHL7**\<`P`\>(`raw`, `options`): [`ProfiledMessage`](#profiledmessage)\<`P`\>

Parse a raw HL7 v2 message (string or `Buffer`) into an `Hl7Message`.
The parser is lenient by default: recoverable deviations from the HL7
spec are reported via `msg.warnings` and (optionally)
`options.onWarning` but do not throw. Four unrecoverable structural
errors throw `Hl7ParseError`: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
`INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Opt into strict mode
with `{ strict: true }` to escalate every Tier-2 warning into an
`Hl7ParseError`.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

###### options

[`ParseOptions`](#parseoptions) & `object`

##### Returns

[`ProfiledMessage`](#profiledmessage)\<`P`\>

##### Examples

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123",
);
console.log(msg.version); // "2.5"
console.log(msg.warnings.length); // 0
for (const w of msg.warnings) {
  if (w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED) {
    // handle MLLP-framed sender
  }
}
```

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// A statically known profile narrows the field-name reader per segment type:
const msg = parseHL7(raw, vendor);
console.log(msg.part("ZDP")?.get("departmentCode")?.value);
// msg.part("ZDP")?.get("departmentCod"); // does not compile: not declared
```

#### Call Signature

> **parseHL7**(`raw`, `options`): [`Hl7Message`](#hl7message)

Parse a raw HL7 v2 message (string or `Buffer`) into an `Hl7Message`.
The parser is lenient by default: recoverable deviations from the HL7
spec are reported via `msg.warnings` and (optionally)
`options.onWarning` but do not throw. Four unrecoverable structural
errors throw `Hl7ParseError`: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
`INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Opt into strict mode
with `{ strict: true }` to escalate every Tier-2 warning into an
`Hl7ParseError`.

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

###### options

[`ParseOptions`](#parseoptions)

##### Returns

[`Hl7Message`](#hl7message)

##### Examples

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123",
);
console.log(msg.version); // "2.5"
console.log(msg.warnings.length); // 0
for (const w of msg.warnings) {
  if (w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED) {
    // handle MLLP-framed sender
  }
}
```

```ts
import { defineProfile, parseHL7 } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// A statically known profile narrows the field-name reader per segment type:
const msg = parseHL7(raw, vendor);
console.log(msg.part("ZDP")?.get("departmentCode")?.value);
// msg.part("ZDP")?.get("departmentCod"); // does not compile: not declared
```

***

### parseMo()

> **parseMo**(`rep`, `enc`): [`MO`](#mo-1)

Parse an HL7 v2 MO repetition into a structured `MO` object. Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`MO`](#mo-1)

#### Example

```ts
import { parseMo, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["150.00"] }, { subcomponents: ["USD"] }] };
const mo = parseMo(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(mo.quantity, mo.denomination); // "150.00" "USD"
```

***

### parseMsg()

> **parseMsg**(`rep`, `enc`): [`MSG`](#msg-1)

Parse an HL7 v2 MSG repetition into a structured `MSG` object. Absent or
empty components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`MSG`](#msg-1)

#### Example

```ts
import { parseMsg, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["ORU"] }, { subcomponents: ["R01"] }] };
const type = parseMsg(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(type.messageCode, type.triggerEvent); // "ORU" "R01"
```

***

### parseNm()

> **parseNm**(`rep`, `_enc`): [`NM`](#nm-1)

Parse an HL7 v2 NM repetition into `{ raw, value }`. Uses `Number(raw)`
for strict numeric parsing: trailing non-numeric characters produce
`NaN`, normalized to `undefined`. Empty raw also produces `undefined`.

`Number("")` is `0` in JS: which is the wrong answer for an empty HL7
numeric field. The explicit empty-string check below returns
`{ raw: "", value: undefined }` so empty inputs match missing inputs.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### \_enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`NM`](#nm-1)

#### Example

```ts
import { parseNm, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["120.5"] }] };
const nm = parseNm(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(nm.value); // 120.5
```

***

### parsePath()

> **parsePath**(`path`): [`DotPath`](#dotpath)

Parse an HL7 dot-path string into a `DotPath` descriptor. Accepts shapes
like `SEG`, `SEG[n]`, `SEG.N`, `SEG.N[r]`, `SEG.N.C`, `SEG.N.C.S`, and all
combinations up to `SEG[n].N[r].C.S`. Throws `TypeError` with the offending
path string on any malformed input.

#### Parameters

##### path

`string`

#### Returns

[`DotPath`](#dotpath)

#### Example

```ts
import { parsePath } from "@cosyte/hl7";
parsePath("PID.5.1");       // { segmentType: "PID", segmentIndex: 0, fieldIndex: 5, componentIndex: 1 }
parsePath("OBX[2].5");      // { segmentType: "OBX", segmentIndex: 2, fieldIndex: 5 }
parsePath("PID.3[1].1");    // { segmentType: "PID", segmentIndex: 0, fieldIndex: 3, repetitionIndex: 1, componentIndex: 1 }
```

***

### parsePl()

> **parsePl**(`rep`, `enc`): [`PL`](#pl-1)

Parse an HL7 v2 PL repetition into a structured `PL` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics). Component 4
(`facility`) is parsed as a nested `HD`; see component table in the `PL`
interface JSDoc for the v1 simplifications.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`PL`](#pl-1)

#### Example

```ts
import { parsePl, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["ICU"] },
  { subcomponents: ["101"] },
  { subcomponents: ["A"] },
  { subcomponents: ["HOSP", "1.2.3", "UUID"] },
] };
const pl = parsePl(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(pl.pointOfCare);           // "ICU"
console.log(pl.facility?.namespaceId); // "HOSP"
```

***

### parsePt()

> **parsePt**(`rep`, `enc`): [`PT`](#pt-1)

Parse an HL7 v2 PT repetition into a structured `PT` object. Absent or empty
components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`PT`](#pt-1)

#### Example

```ts
import { parsePt, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["P"] }, { subcomponents: ["T"] }] };
const pt = parsePt(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(pt.processingId, pt.processingMode); // "P" "T"
```

***

### parseSn()

> **parseSn**(`rep`, `enc`): [`SN`](#sn) \| `undefined`

Parse an HL7 v2 SN repetition into a structured `SN`, or `undefined` when the
field carries no usable structured-numeric content (empty, or so malformed
that no comparator, number, or separator can be recovered). Components are
returned verbatim (already decoded by the tokenizer); `num1`/`num2` use strict `Number()` parsing.

Fail-safe: a non-operator value in the comparator slot (SN.1) is dropped
rather than surfaced as a relation, and a non-numeric SN.2/SN.4 becomes
`undefined`: the parser never emits a confident wrong comparator or number.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`SN`](#sn) \| `undefined`

#### Example

```ts
import { parseSn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: [">"] },
  { subcomponents: ["90"] },
] };
const sn = parseSn(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(sn?.comparator, sn?.num1); // ">" 90
```

***

### parseStream()

#### Call Signature

> **parseStream**(`source`): `AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

Incrementally parse a chunked HL7 v2 byte / text stream, yielding one
[StreamMessageEntry](#streammessageentry) per `MSH`-delimited message as its boundary
completes, with **O(one-message)** memory: the whole stream is never
retained. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` batch frame (HL7 v2 Ch. 2 §2.10.3):

- a message split across chunk boundaries (mid-segment, mid-field, even
  mid-`MSH|^~\&`) is reassembled correctly: feeding the same bytes in 1-byte
  chunks vs. one chunk yields **identical** messages;
- `\r`, `\r\n`, and `\n` segment terminators are all tolerated (a `\r\n` split
  across a chunk boundary is not mistaken for a bare `\r`);
- each message is parsed by the shipped [parseHL7](#parsehl7) (no second grammar),
  `ok` entries carry the `Hl7Message`, a Tier-3 fatal is an isolated failure
  entry; a **malformed message never suppresses later messages**;
- batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) are treated as boundaries
  and never yielded as messages, so `yielded count == MSH count` (envelope
  count reconciliation is [splitBatch](#splitbatch)'s job);
- a final message with no trailing terminator is still yielded, flagged with a
  stream-level [unterminatedStreamMessage](#unterminatedstreammessage) warning: **never a throw, the
  tail is never dropped**.

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7) for
**each** message (profile, `strict`, `charset`, `dateFormats`, …), exactly as
[splitBatch](#splitbatch) forwards it.

##### Parameters

###### source

[`Hl7StreamSource`](#hl7streamsource)

##### Returns

`AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

##### Examples

```ts
import { parseStream } from "@cosyte/hl7";

async function* chunks() {
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r";
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r";
}

let count = 0;
for await (const entry of parseStream(chunks())) {
  if (entry.ok) count += 1; // 2: one per MSH, streamed, released each time
}
```

```ts
import { defineProfile, parseStream } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for await (const entry of parseStream(source, vendor)) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

#### Call Signature

> **parseStream**\<`P`\>(`source`, `profile`): `AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

Incrementally parse a chunked HL7 v2 byte / text stream, yielding one
[StreamMessageEntry](#streammessageentry) per `MSH`-delimited message as its boundary
completes, with **O(one-message)** memory: the whole stream is never
retained. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` batch frame (HL7 v2 Ch. 2 §2.10.3):

- a message split across chunk boundaries (mid-segment, mid-field, even
  mid-`MSH|^~\&`) is reassembled correctly: feeding the same bytes in 1-byte
  chunks vs. one chunk yields **identical** messages;
- `\r`, `\r\n`, and `\n` segment terminators are all tolerated (a `\r\n` split
  across a chunk boundary is not mistaken for a bare `\r`);
- each message is parsed by the shipped [parseHL7](#parsehl7) (no second grammar),
  `ok` entries carry the `Hl7Message`, a Tier-3 fatal is an isolated failure
  entry; a **malformed message never suppresses later messages**;
- batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) are treated as boundaries
  and never yielded as messages, so `yielded count == MSH count` (envelope
  count reconciliation is [splitBatch](#splitbatch)'s job);
- a final message with no trailing terminator is still yielded, flagged with a
  stream-level [unterminatedStreamMessage](#unterminatedstreammessage) warning: **never a throw, the
  tail is never dropped**.

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7) for
**each** message (profile, `strict`, `charset`, `dateFormats`, …), exactly as
[splitBatch](#splitbatch) forwards it.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### source

[`Hl7StreamSource`](#hl7streamsource)

###### profile

`P`

##### Returns

`AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

##### Examples

```ts
import { parseStream } from "@cosyte/hl7";

async function* chunks() {
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r";
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r";
}

let count = 0;
for await (const entry of parseStream(chunks())) {
  if (entry.ok) count += 1; // 2: one per MSH, streamed, released each time
}
```

```ts
import { defineProfile, parseStream } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for await (const entry of parseStream(source, vendor)) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

#### Call Signature

> **parseStream**\<`P`\>(`source`, `options`): `AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

Incrementally parse a chunked HL7 v2 byte / text stream, yielding one
[StreamMessageEntry](#streammessageentry) per `MSH`-delimited message as its boundary
completes, with **O(one-message)** memory: the whole stream is never
retained. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` batch frame (HL7 v2 Ch. 2 §2.10.3):

- a message split across chunk boundaries (mid-segment, mid-field, even
  mid-`MSH|^~\&`) is reassembled correctly: feeding the same bytes in 1-byte
  chunks vs. one chunk yields **identical** messages;
- `\r`, `\r\n`, and `\n` segment terminators are all tolerated (a `\r\n` split
  across a chunk boundary is not mistaken for a bare `\r`);
- each message is parsed by the shipped [parseHL7](#parsehl7) (no second grammar),
  `ok` entries carry the `Hl7Message`, a Tier-3 fatal is an isolated failure
  entry; a **malformed message never suppresses later messages**;
- batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) are treated as boundaries
  and never yielded as messages, so `yielded count == MSH count` (envelope
  count reconciliation is [splitBatch](#splitbatch)'s job);
- a final message with no trailing terminator is still yielded, flagged with a
  stream-level [unterminatedStreamMessage](#unterminatedstreammessage) warning: **never a throw, the
  tail is never dropped**.

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7) for
**each** message (profile, `strict`, `charset`, `dateFormats`, …), exactly as
[splitBatch](#splitbatch) forwards it.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### source

[`Hl7StreamSource`](#hl7streamsource)

###### options

[`ParseOptions`](#parseoptions) & `object`

##### Returns

`AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

##### Examples

```ts
import { parseStream } from "@cosyte/hl7";

async function* chunks() {
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r";
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r";
}

let count = 0;
for await (const entry of parseStream(chunks())) {
  if (entry.ok) count += 1; // 2: one per MSH, streamed, released each time
}
```

```ts
import { defineProfile, parseStream } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for await (const entry of parseStream(source, vendor)) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

#### Call Signature

> **parseStream**(`source`, `options`): `AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

Incrementally parse a chunked HL7 v2 byte / text stream, yielding one
[StreamMessageEntry](#streammessageentry) per `MSH`-delimited message as its boundary
completes, with **O(one-message)** memory: the whole stream is never
retained. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` batch frame (HL7 v2 Ch. 2 §2.10.3):

- a message split across chunk boundaries (mid-segment, mid-field, even
  mid-`MSH|^~\&`) is reassembled correctly: feeding the same bytes in 1-byte
  chunks vs. one chunk yields **identical** messages;
- `\r`, `\r\n`, and `\n` segment terminators are all tolerated (a `\r\n` split
  across a chunk boundary is not mistaken for a bare `\r`);
- each message is parsed by the shipped [parseHL7](#parsehl7) (no second grammar),
  `ok` entries carry the `Hl7Message`, a Tier-3 fatal is an isolated failure
  entry; a **malformed message never suppresses later messages**;
- batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) are treated as boundaries
  and never yielded as messages, so `yielded count == MSH count` (envelope
  count reconciliation is [splitBatch](#splitbatch)'s job);
- a final message with no trailing terminator is still yielded, flagged with a
  stream-level [unterminatedStreamMessage](#unterminatedstreammessage) warning: **never a throw, the
  tail is never dropped**.

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7) for
**each** message (profile, `strict`, `charset`, `dateFormats`, …), exactly as
[splitBatch](#splitbatch) forwards it.

##### Parameters

###### source

[`Hl7StreamSource`](#hl7streamsource)

###### options

[`ParseOptions`](#parseoptions)

##### Returns

`AsyncGenerator`\<[`StreamMessageEntry`](#streammessageentry)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

##### Examples

```ts
import { parseStream } from "@cosyte/hl7";

async function* chunks() {
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r";
  yield "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r";
}

let count = 0;
for await (const entry of parseStream(chunks())) {
  if (entry.ok) count += 1; // 2: one per MSH, streamed, released each time
}
```

```ts
import { defineProfile, parseStream } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for await (const entry of parseStream(source, vendor)) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

***

### parseTs()

> **parseTs**(`rep`, `_enc`, `dateFormats?`): [`DtmParts`](#dtmparts)

Parse an HL7 v2 TS/DTM repetition into fidelity [TS](#ts-1) parts. The
canonical HL7 shape is tried first; `dateFormats`, when the caller declared
any, is then tried in order and a match reports itself on `matchedFormat`.
Nothing else is tried: the library's built-in fallback list is reserved for
the non-composite `msg.meta.timestamp` path, because guessing `MM/DD/YYYY`
on a date of birth a vendor wrote day-first produces a plausible wrong date
rather than a visible failure.

`dateFormats` reaches this parser from `Hl7Message.dateFormats`, which is
`ParseOptions.dateFormats` followed by the applied profile's, deduplicated
first-occurrence-wins. Omit it (or pass an empty list) and the parse is
exactly the strict HL7 one.

The result is frozen so the immutability guarantee holds for callers that
destructure or retain it.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### \_enc

[`EncodingCharacters`](#encodingcharacters-1)

##### dateFormats?

readonly `string`[]

#### Returns

[`DtmParts`](#dtmparts)

#### Example

```ts
import { parseTs, DEFAULT_ENCODING_CHARACTERS, dtmToDate } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["20250102153045-0500"] }] };
const ts = parseTs(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(ts.raw);                     // "20250102153045-0500"
console.log(ts.precision, ts.hasTimezone); // "second" true
console.log(dtmToDate(ts)?.toISOString()); // "2025-01-02T20:30:45.000Z"

const vendor = { components: [{ subcomponents: ["07/05/1988"] }] };
const dob = parseTs(vendor, DEFAULT_ENCODING_CHARACTERS, ["MM/DD/YYYY"]);
console.log(dob.month, dob.matchedFormat); // 7 "MM/DD/YYYY"
```

***

### parseVid()

> **parseVid**(`rep`, `enc`): [`VID`](#vid-1)

Parse an HL7 v2 VID repetition into a structured `VID` object. Absent or
empty components are OMITTED from the result.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`VID`](#vid-1)

#### Example

```ts
import { parseVid, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [{ subcomponents: ["2.5.1"] }, { subcomponents: ["USA"] }] };
const vid = parseVid(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(vid.versionId, vid.internationalizationCode?.identifier); // "2.5.1" "USA"
```

***

### parseXad()

> **parseXad**(`rep`, `enc`): [`XAD`](#xad-1)

Parse an HL7 v2 XAD repetition into a structured `XAD` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics).

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`XAD`](#xad-1)

#### Example

```ts
import { parseXad, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["123 Main St"] },
  { subcomponents: ["Apt 4"] },
  { subcomponents: ["Boston"] },
  { subcomponents: ["MA"] },
  { subcomponents: ["02101"] },
] };
const addr = parseXad(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(addr.city); // "Boston"
```

***

### parseXcn()

> **parseXcn**(`rep`, `enc`): [`XCN`](#xcn-1)

Parse an HL7 v2 XCN repetition into a structured `XCN` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics). Component 9
(`assigningAuthority`) is parsed as a nested `HD`; see component table in
the `XCN` interface JSDoc for the v1 trimming.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`XCN`](#xcn-1)

#### Example

```ts
import { parseXcn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["1234567890"] },
  { subcomponents: ["Smith"] },
  { subcomponents: ["Jane"] },
  { subcomponents: [""] },
  { subcomponents: [""] },
  { subcomponents: [""] },
  { subcomponents: [""] },
  { subcomponents: [""] },
  { subcomponents: ["HOSP", "1.2.3", "ISO"] },
  { subcomponents: ["L"] },
  { subcomponents: [""] },
  { subcomponents: [""] },
  { subcomponents: ["NPI"] },
] };
const xcn = parseXcn(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(xcn.idNumber);                        // "1234567890"
console.log(xcn.familyName);                      // "Smith"
console.log(xcn.assigningAuthority?.namespaceId); // "HOSP"
console.log(xcn.identifierTypeCode);              // "NPI"
```

***

### parseXpn()

> **parseXpn**(`rep`, `enc`): [`XPN`](#xpn-1)

Parse an HL7 v2 XPN repetition into a structured `XPN` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics).

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`XPN`](#xpn-1)

#### Example

```ts
import { parseXpn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["Smith"] },
  { subcomponents: ["Jane"] },
] };
const xpn = parseXpn(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(xpn.familyName); // "Smith"
console.log(xpn.givenName);  // "Jane"
```

***

### parseXtn()

> **parseXtn**(`rep`, `enc`): [`XTN`](#xtn-1)

Parse an HL7 v2 XTN repetition into a structured `XTN` object. Components
are returned verbatim (already decoded once by the tokenizer: never
re-unescaped). Absent / empty components are OMITTED
from the result (exactOptionalPropertyTypes semantics). Components past
position 12 are silently ignored in v1.

#### Parameters

##### rep

[`RawRepetition`](#rawrepetition)

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

[`XTN`](#xtn-1)

#### Example

```ts
import { parseXtn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const rep = { components: [
  { subcomponents: ["555-1234"] },
  { subcomponents: ["PRN"] },
  { subcomponents: ["PH"] },
] };
const xtn = parseXtn(rep, DEFAULT_ENCODING_CHARACTERS);
console.log(xtn.telephoneNumber); // "555-1234"
```

***

### pickMrn()

> **pickMrn**(`identifiers`): `string` \| `undefined`

Pick the Medical Record Number string from a list of PID-3 CX identifiers.

Prefer the first CX whose `identifierTypeCode === "MR"` (HL7 v2.5+
canonical MRN marker). The match is case-SENSITIVE: lowercase
`"mr"` does NOT match; spec mandates uppercase.

When no MR-typed identifier is found, fall back to the first CX's
`idNumber`. Returns `undefined` when the first CX has no `idNumber` (even
if later CXs do: the fallback is strictly "first CX", not "first CX with
idNumber", because we need a deterministic answer).

No warning emitted. Callers who need strict MR resolution can walk
`patient.identifiers` themselves.

#### Parameters

##### identifiers

readonly [`CX`](#cx-1)[]

#### Returns

`string` \| `undefined`

#### Example

```ts
import { pickMrn } from "@cosyte/hl7";
pickMrn([
  { idNumber: "X1" },
  { idNumber: "MRN001", identifierTypeCode: "MR" },
]);
// → "MRN001"

pickMrn([{ idNumber: "X1" }]);
// → "X1"  (fallback: no MR entry)

pickMrn([]);
// → undefined
```

***

### readMessages()

#### Call Signature

> **readMessages**(`source`): `AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

Read a batch, a file or a stream of HL7 v2 messages, and yield each message as soon as its
last segment has arrived. The source is a string, bytes, a Node `Readable`, a web
`ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is read
only when the next item is asked for. Only the message being read is held, never the source.

Messages are found as `splitBatch` finds them. Each starts at an `MSH` segment and runs to the
next `MSH`, the next batch envelope segment (`FHS`, `BHS`, `BTS`, `FTS`, which are never
yielded), or the end. Blank lines between messages are skipped. Text before the first `MSH` is
not dropped: it is yielded as a failed item. An MLLP frame (`VT`, the message, `FS`, `CR`), as
`@cosyte/mllp` writes it, is a message of its own: it ends at its `FS` and is yielded at once.

Each message is parsed by `parseHL7` with the given options or profile, from exactly its own
text or bytes, so it is the message `parseHL7` gives for them, its warnings included, wherever
the chunks were cut: inside a terminator, an escape sequence or a multi-byte character. A
message that fails to parse is yielded as a failed item with its byte position, and reading goes
on. With `{ strict: true }` every warning fails its message, and the first failed item is the
last item: reading stops there and the source is released.

##### Parameters

###### source

[`Hl7ReadSource`](#hl7readsource)

##### Returns

`AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

##### Examples

```ts
import { createReadStream } from "node:fs";
import { readMessages } from "@cosyte/hl7";

for await (const item of readMessages(createReadStream("feed.hl7"))) {
  if (item.ok) console.log(item.message.meta.controlId);
  else console.error(item.error.code, "at byte", item.byteOffset);
}
```

```ts
import { readMessages } from "@cosyte/hl7";

const batch =
  "BHS|^~\\&|LAB\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|1|P|2.5\rPID|1||MRN1^^^HOSP^MR\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|2|P|2.5\rPID|1||MRN2^^^HOSP^MR\r" +
  "BTS|2\r";
const ids: string[] = [];
for await (const item of readMessages(batch)) {
  if (item.ok) ids.push(item.message.meta.controlId ?? "");
}
// ids: ["1", "2"]
```

#### Call Signature

> **readMessages**\<`P`\>(`source`, `profile`): `AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

Read a batch, a file or a stream of HL7 v2 messages, and yield each message as soon as its
last segment has arrived. The source is a string, bytes, a Node `Readable`, a web
`ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is read
only when the next item is asked for. Only the message being read is held, never the source.

Messages are found as `splitBatch` finds them. Each starts at an `MSH` segment and runs to the
next `MSH`, the next batch envelope segment (`FHS`, `BHS`, `BTS`, `FTS`, which are never
yielded), or the end. Blank lines between messages are skipped. Text before the first `MSH` is
not dropped: it is yielded as a failed item. An MLLP frame (`VT`, the message, `FS`, `CR`), as
`@cosyte/mllp` writes it, is a message of its own: it ends at its `FS` and is yielded at once.

Each message is parsed by `parseHL7` with the given options or profile, from exactly its own
text or bytes, so it is the message `parseHL7` gives for them, its warnings included, wherever
the chunks were cut: inside a terminator, an escape sequence or a multi-byte character. A
message that fails to parse is yielded as a failed item with its byte position, and reading goes
on. With `{ strict: true }` every warning fails its message, and the first failed item is the
last item: reading stops there and the source is released.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### source

[`Hl7ReadSource`](#hl7readsource)

###### profile

`P`

##### Returns

`AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

##### Examples

```ts
import { createReadStream } from "node:fs";
import { readMessages } from "@cosyte/hl7";

for await (const item of readMessages(createReadStream("feed.hl7"))) {
  if (item.ok) console.log(item.message.meta.controlId);
  else console.error(item.error.code, "at byte", item.byteOffset);
}
```

```ts
import { readMessages } from "@cosyte/hl7";

const batch =
  "BHS|^~\\&|LAB\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|1|P|2.5\rPID|1||MRN1^^^HOSP^MR\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|2|P|2.5\rPID|1||MRN2^^^HOSP^MR\r" +
  "BTS|2\r";
const ids: string[] = [];
for await (const item of readMessages(batch)) {
  if (item.ok) ids.push(item.message.meta.controlId ?? "");
}
// ids: ["1", "2"]
```

#### Call Signature

> **readMessages**\<`P`\>(`source`, `options`): `AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

Read a batch, a file or a stream of HL7 v2 messages, and yield each message as soon as its
last segment has arrived. The source is a string, bytes, a Node `Readable`, a web
`ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is read
only when the next item is asked for. Only the message being read is held, never the source.

Messages are found as `splitBatch` finds them. Each starts at an `MSH` segment and runs to the
next `MSH`, the next batch envelope segment (`FHS`, `BHS`, `BTS`, `FTS`, which are never
yielded), or the end. Blank lines between messages are skipped. Text before the first `MSH` is
not dropped: it is yielded as a failed item. An MLLP frame (`VT`, the message, `FS`, `CR`), as
`@cosyte/mllp` writes it, is a message of its own: it ends at its `FS` and is yielded at once.

Each message is parsed by `parseHL7` with the given options or profile, from exactly its own
text or bytes, so it is the message `parseHL7` gives for them, its warnings included, wherever
the chunks were cut: inside a terminator, an escape sequence or a multi-byte character. A
message that fails to parse is yielded as a failed item with its byte position, and reading goes
on. With `{ strict: true }` every warning fails its message, and the first failed item is the
last item: reading stops there and the source is released.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### source

[`Hl7ReadSource`](#hl7readsource)

###### options

[`ParseOptions`](#parseoptions) & `object`

##### Returns

`AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>, `void`, `void`\>

##### Examples

```ts
import { createReadStream } from "node:fs";
import { readMessages } from "@cosyte/hl7";

for await (const item of readMessages(createReadStream("feed.hl7"))) {
  if (item.ok) console.log(item.message.meta.controlId);
  else console.error(item.error.code, "at byte", item.byteOffset);
}
```

```ts
import { readMessages } from "@cosyte/hl7";

const batch =
  "BHS|^~\\&|LAB\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|1|P|2.5\rPID|1||MRN1^^^HOSP^MR\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|2|P|2.5\rPID|1||MRN2^^^HOSP^MR\r" +
  "BTS|2\r";
const ids: string[] = [];
for await (const item of readMessages(batch)) {
  if (item.ok) ids.push(item.message.meta.controlId ?? "");
}
// ids: ["1", "2"]
```

#### Call Signature

> **readMessages**(`source`, `options`): `AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

Read a batch, a file or a stream of HL7 v2 messages, and yield each message as soon as its
last segment has arrived. The source is a string, bytes, a Node `Readable`, a web
`ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is read
only when the next item is asked for. Only the message being read is held, never the source.

Messages are found as `splitBatch` finds them. Each starts at an `MSH` segment and runs to the
next `MSH`, the next batch envelope segment (`FHS`, `BHS`, `BTS`, `FTS`, which are never
yielded), or the end. Blank lines between messages are skipped. Text before the first `MSH` is
not dropped: it is yielded as a failed item. An MLLP frame (`VT`, the message, `FS`, `CR`), as
`@cosyte/mllp` writes it, is a message of its own: it ends at its `FS` and is yielded at once.

Each message is parsed by `parseHL7` with the given options or profile, from exactly its own
text or bytes, so it is the message `parseHL7` gives for them, its warnings included, wherever
the chunks were cut: inside a terminator, an escape sequence or a multi-byte character. A
message that fails to parse is yielded as a failed item with its byte position, and reading goes
on. With `{ strict: true }` every warning fails its message, and the first failed item is the
last item: reading stops there and the source is released.

##### Parameters

###### source

[`Hl7ReadSource`](#hl7readsource)

###### options

[`ParseOptions`](#parseoptions)

##### Returns

`AsyncGenerator`\<[`ReadMessageItem`](#readmessageitem)\<[`Hl7Message`](#hl7message)\>, `void`, `void`\>

##### Examples

```ts
import { createReadStream } from "node:fs";
import { readMessages } from "@cosyte/hl7";

for await (const item of readMessages(createReadStream("feed.hl7"))) {
  if (item.ok) console.log(item.message.meta.controlId);
  else console.error(item.error.code, "at byte", item.byteOffset);
}
```

```ts
import { readMessages } from "@cosyte/hl7";

const batch =
  "BHS|^~\\&|LAB\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|1|P|2.5\rPID|1||MRN1^^^HOSP^MR\r" +
  "MSH|^~\\&|LAB|F|EHR|G|20260101||ADT^A01|2|P|2.5\rPID|1||MRN2^^^HOSP^MR\r" +
  "BTS|2\r";
const ids: string[] = [];
for await (const item of readMessages(batch)) {
  if (item.ok) ids.push(item.message.meta.controlId ?? "");
}
// ids: ["1", "2"]
```

***

### readSegments()

> **readSegments**(`source`, `optionsOrProfile?`): `AsyncGenerator`\<[`ReadSegmentItem`](#readsegmentitem), `void`, `void`\>

Read one HL7 v2 message, however large, and yield each segment as soon as it has arrived, with
the warnings `parseHL7` reports about it. The source is a string, bytes, a Node `Readable`, a
web `ReadableStream`, or an async or plain iterable of string or byte chunks; the next chunk is
read only when the next segment is asked for. Only the segment being read, and the one after
it, are held: never the message.

Each segment and its warnings are the ones `parseHL7` gives for the whole message, wherever the
chunks were cut: the same values, the same warnings, and the same `toString()`. The warnings
about the message's bytes come with the first segment, and those that need the whole message
(a segment its structure requires that never came) with the last. A message `parseHL7` refuses
(`NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`) throws the
same `Hl7ParseError` before the first segment. With `{ strict: true }` the first warning throws,
as `parseHL7` does, though in reading order: the segments before it have been yielded, and when
a message has more than one problem the one thrown can differ from the one `parseHL7`, which
reads the whole message first, would throw. Bytes in a character set the parser decodes strictly
(UTF-8, for one) that turn out not to be valid in it throw `UNSUPPORTED_CHARSET` where they are
met: `parseHL7` reads such a message verbatim instead, which a reader that has handed out
earlier segments cannot do.

#### Parameters

##### source

[`Hl7ReadSource`](#hl7readsource)

##### optionsOrProfile?

[`Profile`](#profile-2) \| [`ParseOptions`](#parseoptions)

#### Returns

`AsyncGenerator`\<[`ReadSegmentItem`](#readsegmentitem), `void`, `void`\>

#### Example

```ts
import { createReadStream } from "node:fs";
import { readSegments } from "@cosyte/hl7";

let results = 0;
for await (const { segment } of readSegments(createReadStream("large-report.hl7"))) {
  if (segment.type === "OBX") results += 1;
}
```

***

### reescape()

> **reescape**(`input`, `enc`): `string`

Re-escape reserved characters back into their `\X\` forms so the serializer
can emit spec-clean HL7. This is the inverse of `unescape` for every
delimiter-bearing character; round-trip cleanliness
(`unescape(reescape(x, enc), enc, emit, pos) === x`) is a documented
property covered by tests.

The characters re-escaped:
  enc.escape        → \E\
  enc.field         → \F\
  enc.component     → \S\
  enc.subcomponent  → \T\
  enc.repetition    → \R\
  enc.truncation    → \P\   (only when MSH-2 declared one, v2.7+)
  "\n" (LF)         → \.br\
  "\r" (CR)         → \X0D\  (a decoded CR is the HL7 segment separator;
                              emitting it raw would corrupt wire framing, so
                              it re-encodes to its hex escape: see below)

**Lossy by construction for the non-delimiter escape families.** `reescape`
only knows about the reserved characters above: it cannot reconstruct a
recognize-and-preserve escape (`\H\`, formatting, charset, `\Z..`) or the
original bytes of a hex escape (`\X41\` decoded to `A`; casing of `\X0d`),
because those decode to ordinary characters that carry no "I was an escape"
marker. Byte-verbatim emit for those families is the serializer's job via
the `RawComponent.rawSubcomponents` overlay (see escapeFidelityRaw);
`reescape` is the fallback for content that has no overlay (constructed
values, `Field`-level re-escapes).

Iteration uses `for..of`, which walks Unicode code points (not UTF-16 code
units), so user-supplied content containing non-BMP characters round-trips
correctly without special surrogate-pair handling.

#### Parameters

##### input

`string`

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

`string`

#### Example

```ts
import { reescape, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
reescape("Smith|John", DEFAULT_ENCODING_CHARACTERS); // "Smith\\F\\John"
reescape("line1\nline2", DEFAULT_ENCODING_CHARACTERS); // "line1\\.br\\line2"
```

***

### renderText()

> **renderText**(`input`, `enc?`, `opts?`): [`RenderedText`](#renderedtext)

Render an HL7 v2 escape/formatting-bearing string into a normalized display
model (plain text + highlight-aware runs). A **read projection**: it never
mutates the underlying field, and it never fabricates: an escape it cannot
render is preserved as literal characters and flagged in
[RenderedText.unrenderedSequences](#unrenderedsequences).

`input` is the field's escape-bearing text. Pass the **wire form** (e.g.
`Field.text`, byte-verbatim for parsed content) for the most faithful
result: a wire `\E\H\E\` (an escaped literal backslash-H-backslash) then
renders as the three literal characters `\H`, never as a highlight. Passing
an already-decoded `Field.value` also works: its `\.br\` is already a
newline (rendered as one line break) and its `\H`/formatting sentinels are
still recognized.

Never throws for any input.

#### Parameters

##### input

`string`

the escape-bearing field text to render.

##### enc?

[`EncodingCharacters`](#encodingcharacters-1) = `DEFAULT_ENCODING_CHARACTERS`

the message's encoding characters (for `\F\`/`\S`/… targets);
  defaults to the HL7 standard `|^~\&`.

##### opts?

[`RenderTextOptions`](#rendertextoptions)

see [RenderTextOptions](#rendertextoptions).

#### Returns

[`RenderedText`](#renderedtext)

the normalized [RenderedText](#renderedtext).

#### Example

```ts
import { renderText } from "@cosyte/hl7";

const r = renderText("Specimen received.\\.br\\Gross exam \\H\\normal\\N\\.");
r.text;
// "Specimen received.\nGross exam normal."
r.runs;
// [ { text: "Specimen received.\nGross exam ", highlighted: false },
//   { text: "normal",                          highlighted: true  },
//   { text: ".",                               highlighted: false } ]
r.unrenderedSequences; // []
```

***

### resolveCharset()

> **resolveCharset**(`raw`): [`CharsetResolution`](#charsetresolution)

Resolve an MSH-18 label (or an `options.charset` override) to a
[CharsetResolution](#charsetresolution). A blank / `undefined` label resolves to the ASCII
default. A recognized Table-0211 code returns its registry entry. An
unrecognized label resolves to a `verbatim`, `recognized: false` outcome so
the caller preserves bytes and emits `UNKNOWN_CHARSET`.

#### Parameters

##### raw

`string` \| `undefined`

#### Returns

[`CharsetResolution`](#charsetresolution)

#### Example

```ts
import { resolveCharset } from "@cosyte/hl7";
resolveCharset("UNICODE UTF-8"); // { canonical: "UTF-8", treatment: "decode", ... }
resolveCharset("ISO IR87");      // { canonical: "ISO IR87", treatment: "verbatim", recognized: true }
resolveCharset("WINDOWS-1252");  // { canonical: "WINDOWS-1252", treatment: "verbatim", recognized: false }
```

***

### resolvePath()

> **resolvePath**(`path`, `segments`, `_enc`): `string` \| `undefined`

Resolve a dot-path string against a raw segment tree to its decoded
leaf value. Returns `undefined` whenever the path does not resolve (missing
segment, out-of-range field/component/subcomponent/repetition), and never
throws on a missing value. Throws `TypeError` only when `path` itself is
malformed: callers relying on "never throws" should pre-validate or wrap
in try/catch.

#### Parameters

##### path

`string`

##### segments

readonly [`RawSegment`](#rawsegment)[]

##### \_enc

[`EncodingCharacters`](#encodingcharacters-1)

#### Returns

`string` \| `undefined`

#### Example

```ts
import { parseHL7, resolvePath } from "@cosyte/hl7";
const msg = parseHL7(raw);
resolvePath("PID.5.1", msg.rawSegments, msg.encodingCharacters); // "Smith"
resolvePath("NOT.9", msg.rawSegments, msg.encodingCharacters);    // undefined
```

***

### segmentCase()

> **segmentCase**(`position`, `observed`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `SEGMENT_CASE` warning. Emitted when a segment identifier carries an
ASCII lowercase letter (e.g. `pid` instead of `PID`, or `Obx` instead of
`OBX`), which no segment identifier in the HL7 v2 standard does. The parser accepts the
segment and resolves it as the segment it names, so `msg.segments("PID")`,
`msg.patient` and `observations()` all see it; the warning is how a consumer
learns the sender is non-conforming.

"Resolved as", not "rewritten to": the original spelling stays on
`RawSegment.name` and is what serialization re-emits, so the byte-verbatim
round-trip is unaffected.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### observed

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { segmentCase } from "@cosyte/hl7";
const w = segmentCase({ segmentIndex: 3 }, "pid");
```

***

### setDefaultProfile()

> **setDefaultProfile**(`profile`): `void`

Register a process-scoped default profile. `parseHL7(raw)` (with no
explicit profile arg) consults `getDefaultProfile()` and applies the
returned profile if any. Pass `null` (or `undefined`) to clear.

Effects are IDENTICAL to passing the profile explicitly as the second
arg of `parseHL7`: customSegments, dateFormats, onWarning chain,
and profile attribution all apply the same way.

Explicit args ALWAYS win: `parseHL7(raw, myProfile)` uses `myProfile`
regardless of the default; `parseHL7(raw, { profile: null })` opts out
of the default for a single call without changing the registered
default.

**Test hygiene:** This is the ONLY mutable module-scoped state in the
library. Tests that call `setDefaultProfile` MUST clean up in
`afterEach` (`setDefaultProfile(null)`) or default-profile bleed will
infect subsequent tests.

#### Parameters

##### profile

[`Profile`](#profile-2) \| `null`

#### Returns

`void`

#### Example

```ts
import { setDefaultProfile, profiles, parseHL7 } from "@cosyte/hl7";

// Set once at app startup
setDefaultProfile(profiles.epic);

// Every parseHL7 call in the app now uses profiles.epic unless
// another profile is passed explicitly.
const msg = parseHL7(raw);
console.log(msg.profile?.name); // "epic"

// Clear when done (or in test teardown):
setDefaultProfile(null);
```

***

### splitBatch()

#### Call Signature

> **splitBatch**(`raw`): [`BatchSplitResult`](#batchsplitresult)

Split a raw HL7 v2 **batch / file** stream into its individual messages plus
the envelope metadata. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` frame (HL7 v2 Ch. 2 §2.10.3):

- handles a file with **multiple batches** and a batch with multiple messages;
- a **bare single message** (no envelope) passes straight through as one entry;
- a **malformed message mid-batch is isolated** (returned as a typed failure
  entry): its siblings are still returned, the tail is never dropped;
- reconciles BTS-1 (batch message count) and FTS-1 (file batch count) and
  emits [batchCountMismatch](#batchcountmismatch) on a mismatch: counts only, never PHI;
- emits [batchMissingTrailer](#batchmissingtrailer) when a `BHS`/`FHS` header opens a scope no
  `BTS`/`FTS` closes: a warning, never a throw (the caller decides to reject).

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7)
for **each** message (profile, `strict`, `charset`, `dateFormats`, …). Under
`strict`, a message that would warn surfaces as a failure entry (still
isolated). `splitBatch` itself never throws: an empty stream yields an empty
result.

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

##### Returns

[`BatchSplitResult`](#batchsplitresult)

##### Examples

```ts
import { splitBatch } from "@cosyte/hl7";

const { messages, warnings } = splitBatch(
  "FHS|^~\\&|SENDER\r" +
    "BHS|^~\\&|SENDER\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r" +
    "BTS|2\rFTS|1\r",
);
console.log(messages.length); // 2
for (const entry of messages) {
  if (entry.ok) console.log(entry.message.version); // "2.5"
}
console.log(warnings.length); // 0: declared counts match
```

```ts
import { defineProfile, splitBatch } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for (const entry of splitBatch(rawBatchFile, vendor).messages) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

#### Call Signature

> **splitBatch**\<`P`\>(`raw`, `profile`): [`BatchSplitResult`](#batchsplitresult)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>

Split a raw HL7 v2 **batch / file** stream into its individual messages plus
the envelope metadata. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` frame (HL7 v2 Ch. 2 §2.10.3):

- handles a file with **multiple batches** and a batch with multiple messages;
- a **bare single message** (no envelope) passes straight through as one entry;
- a **malformed message mid-batch is isolated** (returned as a typed failure
  entry): its siblings are still returned, the tail is never dropped;
- reconciles BTS-1 (batch message count) and FTS-1 (file batch count) and
  emits [batchCountMismatch](#batchcountmismatch) on a mismatch: counts only, never PHI;
- emits [batchMissingTrailer](#batchmissingtrailer) when a `BHS`/`FHS` header opens a scope no
  `BTS`/`FTS` closes: a warning, never a throw (the caller decides to reject).

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7)
for **each** message (profile, `strict`, `charset`, `dateFormats`, …). Under
`strict`, a message that would warn surfaces as a failure entry (still
isolated). `splitBatch` itself never throws: an empty stream yields an empty
result.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

###### profile

`P`

##### Returns

[`BatchSplitResult`](#batchsplitresult)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>

##### Examples

```ts
import { splitBatch } from "@cosyte/hl7";

const { messages, warnings } = splitBatch(
  "FHS|^~\\&|SENDER\r" +
    "BHS|^~\\&|SENDER\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r" +
    "BTS|2\rFTS|1\r",
);
console.log(messages.length); // 2
for (const entry of messages) {
  if (entry.ok) console.log(entry.message.version); // "2.5"
}
console.log(warnings.length); // 0: declared counts match
```

```ts
import { defineProfile, splitBatch } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for (const entry of splitBatch(rawBatchFile, vendor).messages) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

#### Call Signature

> **splitBatch**\<`P`\>(`raw`, `options`): [`BatchSplitResult`](#batchsplitresult)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>

Split a raw HL7 v2 **batch / file** stream into its individual messages plus
the envelope metadata. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` frame (HL7 v2 Ch. 2 §2.10.3):

- handles a file with **multiple batches** and a batch with multiple messages;
- a **bare single message** (no envelope) passes straight through as one entry;
- a **malformed message mid-batch is isolated** (returned as a typed failure
  entry): its siblings are still returned, the tail is never dropped;
- reconciles BTS-1 (batch message count) and FTS-1 (file batch count) and
  emits [batchCountMismatch](#batchcountmismatch) on a mismatch: counts only, never PHI;
- emits [batchMissingTrailer](#batchmissingtrailer) when a `BHS`/`FHS` header opens a scope no
  `BTS`/`FTS` closes: a warning, never a throw (the caller decides to reject).

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7)
for **each** message (profile, `strict`, `charset`, `dateFormats`, …). Under
`strict`, a message that would warn surfaces as a failure entry (still
isolated). `splitBatch` itself never throws: an empty stream yields an empty
result.

##### Type Parameters

###### P

`P` *extends* [`Profile`](#profile-2)

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

###### options

[`ParseOptions`](#parseoptions) & `object`

##### Returns

[`BatchSplitResult`](#batchsplitresult)\<[`ProfiledMessage`](#profiledmessage)\<`P`\>\>

##### Examples

```ts
import { splitBatch } from "@cosyte/hl7";

const { messages, warnings } = splitBatch(
  "FHS|^~\\&|SENDER\r" +
    "BHS|^~\\&|SENDER\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r" +
    "BTS|2\rFTS|1\r",
);
console.log(messages.length); // 2
for (const entry of messages) {
  if (entry.ok) console.log(entry.message.version); // "2.5"
}
console.log(warnings.length); // 0: declared counts match
```

```ts
import { defineProfile, splitBatch } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for (const entry of splitBatch(rawBatchFile, vendor).messages) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

#### Call Signature

> **splitBatch**(`raw`, `options`): [`BatchSplitResult`](#batchsplitresult)

Split a raw HL7 v2 **batch / file** stream into its individual messages plus
the envelope metadata. Demarcates by `MSH` boundaries inside the optional
`[FHS] { [BHS] { MSH… } [BTS] } [FTS]` frame (HL7 v2 Ch. 2 §2.10.3):

- handles a file with **multiple batches** and a batch with multiple messages;
- a **bare single message** (no envelope) passes straight through as one entry;
- a **malformed message mid-batch is isolated** (returned as a typed failure
  entry): its siblings are still returned, the tail is never dropped;
- reconciles BTS-1 (batch message count) and FTS-1 (file batch count) and
  emits [batchCountMismatch](#batchcountmismatch) on a mismatch: counts only, never PHI;
- emits [batchMissingTrailer](#batchmissingtrailer) when a `BHS`/`FHS` header opens a scope no
  `BTS`/`FTS` closes: a warning, never a throw (the caller decides to reject).

The second argument, when given, is forwarded verbatim to [parseHL7](#parsehl7)
for **each** message (profile, `strict`, `charset`, `dateFormats`, …). Under
`strict`, a message that would warn surfaces as a failure entry (still
isolated). `splitBatch` itself never throws: an empty stream yields an empty
result.

##### Parameters

###### raw

`string` \| `Buffer`\<`ArrayBufferLike`\>

###### options

[`ParseOptions`](#parseoptions)

##### Returns

[`BatchSplitResult`](#batchsplitresult)

##### Examples

```ts
import { splitBatch } from "@cosyte/hl7";

const { messages, warnings } = splitBatch(
  "FHS|^~\\&|SENDER\r" +
    "BHS|^~\\&|SENDER\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r" +
    "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r" +
    "BTS|2\rFTS|1\r",
);
console.log(messages.length); // 2
for (const entry of messages) {
  if (entry.ok) console.log(entry.message.version); // "2.5"
}
console.log(warnings.length); // 0: declared counts match
```

```ts
import { defineProfile, splitBatch } from "@cosyte/hl7";
const vendor = defineProfile({
  name: "vendor",
  customSegments: { ZDP: { fields: { departmentCode: 3 } } },
});
// The profile is forwarded to every message, narrowing each one's reader:
for (const entry of splitBatch(rawBatchFile, vendor).messages) {
  if (entry.ok) console.log(entry.message.part("ZDP")?.get("departmentCode")?.value);
}
```

***

### supportsBuilderMessage()

> **supportsBuilderMessage**(`messageCode`, `triggerEvent`): `boolean`

Can a typed builder author this (message code, trigger event) pair as a
spec-clean, zero-warning message? A published entry whose trigger event is
the empty string matches any trigger event for that message code.

A `false` answer does not mean the builder refuses the event: a builder that
takes a trigger event still emits the content supplied. It means the library
does not claim the result is structurally complete.

#### Parameters

##### messageCode

`string`

MSH-9.1, e.g. `"SIU"`.

##### triggerEvent

`string`

MSH-9.2, e.g. `"S12"`.

#### Returns

`boolean`

#### Example

```ts
import { supportsBuilderMessage } from "@cosyte/hl7";
supportsBuilderMessage("SIU", "S12"); // true
supportsBuilderMessage("ADT", "A20"); // false: the structure requires NPU
```

***

### timestampFallbackFormat()

> **timestampFallbackFormat**(`position`, `matchedFormat`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `TIMESTAMP_FALLBACK_FORMAT` warning: a date/time value that did not
parse as strict HL7 but did match a fallback format.

This is the warning's constructor, not its emit site. The only code path
that can raise it is the lenient cascade behind `msg.meta.timestamp`, and
only when a caller hands that cascade an emit callback, so a parse does not
put this warning on `msg.warnings` today. Read `matchedFormat` on the `TS`
to see which format answered a value; a typed datetime field never consults
the built-in fallbacks at all.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### matchedFormat

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { timestampFallbackFormat } from "@cosyte/hl7";
const w = timestampFallbackFormat(
  { segmentIndex: 1, fieldIndex: 7 },
  "YYYY-MM-DD",
);
```

***

### toDate()

> **toDate**(`value`, `options?`): `Date` \| `undefined`

Materialize an absolute-instant JS `Date` from a parsed HL7 datetime, ONLY
when the zone is determinate. Delegates to [dtmToDate](#dtmtodate), so the rule is
the one this parser has always applied:

 - the value carries an explicit offset: the exact instant from THAT offset,
   and `options.assumeOffsetMinutes` is ignored;
 - no offset and `assumeOffsetMinutes` supplied as a finite number: that
   offset is applied, including an explicit `0` meaning "treat this naive
   value as UTC";
 - no offset and no usable option: `undefined`. The host timezone is NEVER
   read and UTC is NEVER assumed.

"Usable" is checked rather than assumed, because a published package is
called from JavaScript as well as from TypeScript. An options bag that is
`null`, or an `assumeOffsetMinutes` that is not a finite number, names no
zone: it answers `undefined` rather than coercing to one. A string `"0"`, a
`true` and an `[]` all multiply to a number in JavaScript, so a converter
that simply arithmetics them hands back an instant the caller never asked
for, and `0` in particular is silent UTC.

The offset the VALUE states is held to the same account, one step earlier:
it wins outright over any assumption, so it is checked to be a zone before
it is allowed to win. A `hasTimezone` value whose `offsetMinutes` is a
string, a boolean, an array, `NaN` or a count of minutes a whole day or
more from UTC states no zone either, and coercing it would fabricate exactly
the confident instant this function exists to refuse.

Components below the stated precision fill to their lowest legal value
(month to 1, day to 1, time to 0) FOR INSTANT CONSTRUCTION ONLY; the value's
stated precision is unchanged, and a later `toObject` or `toISO` on the same
value returns exactly what it returned before. A four-digit year below 100
stays that year: `0050` is year 50, never 1950.

Returns `undefined` for an invalid value, an unresolvable zone, a value
whose stated components do not name a real calendar date or a real zone,
and for `undefined` / `null`. Never throws, for any input, on either
parameter. An impossible day is refused rather than rolled into the
following month, so no instant this returns is a day away from the value the
sender wrote.

#### Parameters

##### value

[`DtmParts`](#dtmparts) \| `null` \| `undefined`

##### options?

[`DtmToDateOptions`](#dtmtodateoptions) \| `null`

#### Returns

`Date` \| `undefined`

#### Example

```ts
import { parseDtm, toDate } from "@cosyte/hl7";

toDate(parseDtm("20250102"));                                  // undefined: refuses to guess
toDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 })?.toISOString();
// "2025-01-02T00:00:00.000Z": the caller chose UTC
toDate(parseDtm("20250102153045-0500"))?.toISOString();
// "2025-01-02T20:30:45.000Z": exact, offset-derived
toDate(parseDtm("20240230"), { assumeOffsetMinutes: 0 });
// undefined: February has no 30th, and 1 March is not what was written
```

***

### toISO()

> **toISO**(`value`): `string` \| `undefined`

Render a parsed HL7 datetime as ISO-8601 TRUNCATED TO ITS STATED PRECISION,
never padded out: a year-precision value renders four characters, a
day-precision value renders ten. Fractional digits are rendered VERBATIM as
stated, neither padded to three nor rounded.

An explicit offset is appended as `Z` when it is exactly zero (including
HL7's `-0000`), otherwise as `+HH:MM` / `-HH:MM`. When the value carried NO
offset, NOTHING is appended: the string is deliberately zone-less and no `Z`
is fabricated. Because a zero offset renders `Z`, this is NOT a byte round
trip of the wire value and is not meant to be; `formatDtm` is the
round-trip route and is unchanged.

Returns `undefined` for a value the parser marked invalid, for a value with
no stated year (the HL7 DTM datatype mandates a leading four-digit year, so
this parser produces no time-only value), for a value whose stated
components do not name a real calendar date or a real zone, and for
`undefined` / `null`. Never throws. A string this returns is always one an
ISO-8601 reader reads back: `"2024-02-30"` is never rendered, because every
reader silently moves it to 1 March, and neither is an offset past
`+23:59`, because every reader answers an Invalid Date for it.

#### Parameters

##### value

[`DtmParts`](#dtmparts) \| `null` \| `undefined`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { parseDtm, toISO } from "@cosyte/hl7";

toISO(parseDtm("1970"));                        // "1970"
toISO(parseDtm("19700705"));                    // "1970-07-05": no fabricated Z
toISO(parseDtm("20250102153045.5-0500"));       // "2025-01-02T15:30:45.5-05:00"
toISO(parseDtm("20250102153045-0000"));         // "2025-01-02T15:30:45Z"
toISO(parseDtm("20230229"));                    // undefined: 2023 is not a leap year
toISO(parseDtm("20250102153045+2400"));         // undefined: no zone is 24 hours east
```

***

### toObject()

> **toObject**(`value`): [`DateParts`](#dateparts) \| `undefined`

Project a parsed HL7 datetime onto the shared [DateParts](#dateparts) shape: a
frozen plain object carrying ONLY the calendar components the value stated.

Returns `undefined` for a value the parser marked invalid, for a value
stating no components at all, for a value whose stated components do not
name a real calendar date (`20240230` names no day: February has no 30th)
or a real zone (an offset has to be a whole number of minutes within a day
of UTC), and for `undefined` / `null`. Never throws. Every value in the
object it returns is therefore a finite number, which is what makes
`offsetMinutes` safe to read as minutes east of UTC.

The value's own stated precision is untouched by the call: this is a
projection, not a conversion of the parsed value.

#### Parameters

##### value

[`DtmParts`](#dtmparts) \| `null` \| `undefined`

#### Returns

[`DateParts`](#dateparts) \| `undefined`

#### Example

```ts
import { parseDtm, toObject } from "@cosyte/hl7";

toObject(parseDtm("19880705"));
// { year: 1988, month: 7, day: 5 }

toObject(parseDtm("20250102153045.0500-0430"));
// { year: 2025, month: 1, day: 2, hour: 15, minute: 30, second: 45,
//   millisecond: 50, offsetMinutes: -270 }

toObject(parseDtm("not-a-date")); // undefined
toObject(parseDtm("20240230"));   // undefined: February has no 30th
toObject(parseDtm("20240229"));   // { year: 2024, month: 2, day: 29 }: 2024 is a leap year
```

***

### unescape()

> **unescape**(`input`, `enc`, `emit`, `position`): `string`

Expand HL7 escape sequences (`\F\`, `\S`, `\T\`, `\R`, `\E\`, `\.br`,
`\X..\`, vendor-specific `\Z..`) inside a field, component, or
subcomponent string. The escape delimiter comes from `enc.escape` (default
``), so senders using a non-default escape character are handled
transparently.

Unknown or malformed sequences are preserved VERBATIM in the output and
emit an `UNKNOWN_ESCAPE_SEQUENCE` warning via `emit`. Unterminated escapes
(an escape character with no closing partner before end-of-input) are also
preserved in full and warn once: the scan is strictly O(n) and cannot
infinite-loop on malformed input.

#### Parameters

##### input

`string`

##### enc

[`EncodingCharacters`](#encodingcharacters-1)

##### emit

(`w`) => `void`

##### position

[`Hl7Position`](#hl7position)

#### Returns

`string`

#### Example

```ts
import { unescape, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
const warnings: Array<unknown> = [];
const out = unescape(
  "patient\\F\\name\\.br\\DOB",
  DEFAULT_ENCODING_CHARACTERS,
  (w) => warnings.push(w),
  { segmentIndex: 1, fieldIndex: 5 },
);
// out === "patient|name\nDOB"
```

***

### unknownCharset()

> **unknownCharset**(`position`, `requested`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `UNKNOWN_CHARSET` warning. Emitted when MSH-18 (or an
`options.charset` override) declares a value that is **not a recognized HL7
Table-0211 character set**. The parser never guesses an encoding: it reads the
raw bytes as `latin1` (a 1:1 byte mapping) so single-byte content stays
recoverable, rather than corrupting it with replacement characters. The
message carries the charset code only, never a decoded field value: the code
is shape-checked before it is interpolated, and withheld if it does not match.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### requested

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { unknownCharset } from "@cosyte/hl7";
const w = unknownCharset({ segmentIndex: 0, fieldIndex: 18 }, "ISO IR 999");
```

***

### unknownEscapeSequence()

> **unknownEscapeSequence**(`position`, `body`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `UNKNOWN_ESCAPE_SEQUENCE` warning for a **terminated** escape
sequence (`\..\`) whose body is not a recognized HL7 escape. The message
NEVER embeds the escape body: only its length and, when the body's first
character is a recognized HL7 escape-identifier letter (structural HL7
grammar, not PHI: e.g. `Z` for a vendor escape, `.` for a formatting
escape), that single letter. A body that doesn't start with a known escape
letter is untrusted field text and names no character at all. The sequence
itself is still preserved verbatim in the parsed output: only the WARNING
message is PHI-safe.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### body

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { unknownEscapeSequence } from "@cosyte/hl7";
const w = unknownEscapeSequence({ segmentIndex: 2, fieldIndex: 3 }, "Z99");
// message: `Unknown HL7 escape sequence of type "Z" (3 chars) preserved verbatim.`
```

***

### unknownSegment()

> **unknownSegment**(`position`, `segmentName`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `UNKNOWN_SEGMENT` warning. Emitted when a segment identifier is
not in the HL7 spec's standard set and not registered in the active
profile's `customSegments`.

The message states that the comparison ignored case, because the parser
folds a segment name to its canonical ASCII-uppercase spelling before
looking it up. An earlier wording read "not in HL7 spec and no profile
claim" while the lookup was case-SENSITIVE, so a sender shipping `obx` was
told its segment was absent from the standard. `OBX` is in the standard;
the real fault was the case, and the message sent the integrator looking
for a missing spec entry that was never missing.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### segmentName

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { unknownSegment } from "@cosyte/hl7";
const w = unknownSegment({ segmentIndex: 7 }, "ZZZ");
```

***

### unsupportedCharset()

> **unsupportedCharset**(`position`, `code`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `UNSUPPORTED_CHARSET` warning. Emitted when a **recognized**
Table-0211 character set is not decoded into text: either because this parser
does not decode it (the multibyte / ISO-2022-switched East-Asian sets: JIS,
GB 18030, KS X 1001, CNS 11643, BIG-5: and the wide Unicode transforms
UTF-16 / UTF-32), or because a strict decode of a decodable set **failed** (a
byte invalid / undefined for the declared set, or an ICU build lacking the
label). In every case the raw bytes are read as `latin1`, never guessed at, so
the parser does not emit replacement-char-corrupted text. Single-byte content
stays byte-recoverable; multibyte content is best-effort (a content byte can
coincide with a structural delimiter: see the parser's known-limitations).
The switch escapes (`\Cxxyy\` / `\Mxxyyzz`) are recognized and preserved by
the escape layer; full stateful decoding is a documented non-goal. The message
carries the charset code only, never a decoded field value: the code is
shape-checked before it is interpolated, and withheld if it does not match.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### code

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { unsupportedCharset } from "@cosyte/hl7";
const w = unsupportedCharset({ segmentIndex: 0, fieldIndex: 18 }, "ISO IR87");
```

***

### unterminatedEscapeSequence()

> **unterminatedEscapeSequence**(`position`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `UNKNOWN_ESCAPE_SEQUENCE` warning for an **unterminated** escape
(an escape character with no closing partner before end-of-input). The
"body" in this case is the entire remainder of the field, so the message
carries NEITHER the body NOR its length (the length of a truncated tail is
itself derivable field-shape information): just the fact that an
unterminated escape was found, and the position. The remainder is still
preserved verbatim in the parsed output.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { unterminatedEscapeSequence } from "@cosyte/hl7";
const w = unterminatedEscapeSequence({ segmentIndex: 2, fieldIndex: 3 });
// message: `Unterminated HL7 escape sequence preserved verbatim.`
```

***

### unterminatedStreamMessage()

> **unterminatedStreamMessage**(`position`): [`Hl7ParseWarning`](#hl7parsewarning)

Build an `UNTERMINATED_STREAM_MESSAGE` warning. Emitted by
`parseStream()`: attached to a [StreamMessageEntry](#streammessageentry)'s `streamWarnings`,
NOT to `Hl7Message.warnings`: when the **final** message in a stream ends
without a segment terminator (its last segment ran to end-of-stream with no
trailing `\r`/`\r\n`/`\n`). The message is still parsed and yielded **in
full**; this is the fail-safe signal that the tail may have been truncated
mid-message (a cut-off feed), never a reason to drop it and never a throw.
Only the last message can be unterminated: every earlier message is closed by
the terminator that precedes the next `MSH`/envelope boundary.

The message carries only the structural fact, NEVER a field value, so no PHI
is exposed. `position` references the message's `MSH` segment index.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { unterminatedStreamMessage } from "@cosyte/hl7";
const w = unterminatedStreamMessage({ segmentIndex: 6 });
```

***

### usageOutcomes()

> **usageOutcomes**(`rule`): [`UsageOutcomes`](#usageoutcomes) \| `undefined`

The true and false usage outcomes a rule's declared conditional records, as
two separate simple codes: for `C(RE/X)`, `{ whenTrue: "RE", whenFalse: "X" }`.

Returns `undefined` when the rule's usage is a simple code or is absent,
which is how it reports "this rule has no outcomes". **It never throws**,
including for a value forced through `any`.

#### Parameters

##### rule

[`FieldRule`](#fieldrule) \| [`SegmentRule`](#segmentrule)

a segment rule or a field rule from a conformance profile.

#### Returns

[`UsageOutcomes`](#usageoutcomes) \| `undefined`

the two outcomes, or `undefined` when the rule declares none.

#### Example

```ts
import { usageOutcomes, type FieldRule } from "@cosyte/hl7";

const conditional: FieldRule = { field: 8, usage: "C(RE/X)" };
usageOutcomes(conditional); // { whenTrue: "RE", whenFalse: "X" }

const simple: FieldRule = { field: 8, usage: "R" };
usageOutcomes(simple); // undefined (a simple usage records no outcomes)
```

***

### validateAgainstProfile()

> **validateAgainstProfile**(`message`, `profile`, `resolutions?`): [`ConformanceResult`](#conformanceresult)

Validate a parsed HL7 v2 message against a **user-authored** declarative
conformance profile and return typed findings.

**Never throws.** A well-formed profile is evaluated rule by rule; a
malformed profile is reported as `PROFILE_MALFORMED` findings (the engine
does not validate against a profile it cannot trust: never a silent pass).
Either way you get a [ConformanceResult](#conformanceresult). For fail-fast authoring, run
[defineConformanceProfile](#defineconformanceprofile) first: it throws on a malformed profile.

**`findings.length === 0` is NOT a conformance attestation.** It means every
rule the profile declared was satisfied: nothing about the parts of the
message the profile did not cover, and nothing about clinical correctness.

**No PHI in findings**: each finding names the structural locus (segment /
field / component / repetition) and the rule, never the offending value.

**Read-only**: the message is never mutated.

**A conditional usage takes its outcome from one source, never two.** A rule
that declares a [ConditionPredicate](#conditionpredicate) on its `condition` has it
evaluated against the message, and the true or false outcome selects the
usage the rest of the rule is checked under: the outcomes a declared
conditional such as `C(R/X)` writes down, or the ones IHE states for the bare
`C` and `CE` codes. A rule that declares none takes the outcome of a matching
[UsageResolution](#usageresolution) in `resolutions` instead. Declaring both at one locus
is `PROFILE_MALFORMED`. With neither, the rule is evaluated exactly as a `C`
rule is: presence not evaluated, every other constraint applied as usual.

**A predicate the message cannot decide is reported, never guessed.** It
yields a `PROFILE_CONDITION_UNEVALUATABLE` finding and the element's presence
is not assessed, so an unassessed conditional can never hide inside an empty
findings list.

**A value set may be bound to the coding system its codes come from.** A rule
that declares [FieldRule.codingSystem](#codingsystem) has the message's own
coding-system component compared against it by resolved identity, per present
repetition, and a mismatch is `PROFILE_CODING_SYSTEM_MISMATCH`: a distinct
code, so "a code we do not accept" and "a code that looks right but claims
the wrong system" stop being one answer. The check is additive and opt-in: a
rule that declares no binding behaves exactly as it always has. Still no code
set and still no network call, because this compares the sender's CLAIM
against the profile and never the code against a terminology.

**A field rule may declare what its COMPONENTS are, and doing so closes the
set.** Each entry of `components` carries a 1-indexed index and an optional
usage code whose cardinality is IMPLIED rather than declared (`R` is
`[1..1]`, `RE` and `O` are `[0..1]`, `X` is `[0..0]`; a component has no
repetition construct, so each reduces to presence). Per present repetition,
`R` with nothing at that component is `PROFILE_REQUIRED_ABSENT` and `X` with
something there is `PROFILE_NOT_PERMITTED`, both at a locus naming the
component. Content at an index the rule does NOT declare is
`PROFILE_UNDECLARED_CONTENT`, one finding per undeclared index per
repetition: the methodology counts content in an element the profile never
specified as a conformance violation rather than harmless extra content. A
field rule that declares no `components` declares no depth and is checked
exactly as it always was, so this is additive and opt-in per rule.

**Every result carries the [ProfileLevel](#profilelevel) in force**, beside the
profile name, because an empty findings list means two different things at
two different levels. A profile may declare
[ConformanceProfile.level](#level); one that declares none is assessed and
echoed as `constrainable`, the weaker claim, so silence never reads as
`implementable`. A profile that DOES claim `implementable` is held to the
level's own terminus at profile-shape time: every segment, field and
component rule must declare a usage, and that usage must be `R`, `RE` or `X`
or a declared conditional whose outcomes are drawn from those three. A claim
that fails is `PROFILE_MALFORMED`, and a refused claim is never the level
echoed on the result. The level changes no message check at all: it decides
which findings the PROFILE is refused for, never which findings a MESSAGE
produces.

Omitting `resolutions` (or passing `undefined`) is the same as passing an
empty list. Any OTHER value that is not a list of well-formed resolutions is
a `PROFILE_MALFORMED` finding, never read as "no resolutions": a mis-typed
argument must not return a clean result for elements nothing checked.

#### Parameters

##### message

[`Hl7Message`](#hl7message)

a parsed message from [parseHL7](#parsehl7).

##### profile

[`ConformanceProfile`](#conformanceprofile)

the consumer's declarative [ConformanceProfile](#conformanceprofile).

##### resolutions?

readonly [`UsageResolution`](#usageresolution)[]

optional caller-supplied outcomes for declared-conditional rules that declare no predicate.

#### Returns

[`ConformanceResult`](#conformanceresult)

the profile name, the level in force, and the ordered findings (empty ⇒ no declared rule violated).

#### Example

```ts
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

const profile: ConformanceProfile = {
  name: "example-adt-min",
  segments: [
    { segment: "PID", usage: "R", fields: [
      { field: 3, name: "Patient Identifiers", usage: "R" },
      {
        field: 8,
        name: "Administrative Sex",
        usage: "C(RE/X)",
        // "Required but may be empty when a birth date was sent, else not permitted."
        condition: { location: { segment: "PID", field: 7 }, presence: "is valued" },
        valueSet: ["M", "F", "U"],
      },
    ] },
  ],
};

const { findings } = validateAgainstProfile(parseHL7(raw), profile);
for (const f of findings) console.log(f.severity, f.code, f.message);
// findings.length === 0 ⇒ no declared rule violated (NOT an attestation)
```

***

### validateMessageStructure()

> **validateMessageStructure**(`message`): [`StructureValidationResult`](#structurevalidationresult)

Validate a parsed message against HL7's own published structure for its
trigger event: segment order, segment occurrence counts, and segments the
published structure does not name.

**Opt-in and read-only.** Nothing calls it for you, it never throws, and it
leaves the message exactly as it found it: same segments, same warnings, same
serialization.

**Check `validated` before you read `findings`.** A message type the registry
does not model, one recognized only through a retained transcription, and one
carrying no readable message type at all each come back with `validated:
false`, a `reason`, and no findings: that is "the publication cannot answer",
not "the message is fine".

**Zero findings is not a conformance attestation.** It means this message did
not break the published structure in the three ways checked here. Field
content, datatypes, value sets and HL7 tables are all unchecked, the covered
message codes are sixteen rather than the whole standard, and the publication
behind it is vendored at a fixed commit.

#### Parameters

##### message

[`Hl7Message`](#hl7message)

a parsed message. Input the parser rejects never reaches
  here: the parse fails first, with the fatal error it always raised.

#### Returns

[`StructureValidationResult`](#structurevalidationresult)

#### Example

```ts
import { parseHL7, validateMessageStructure } from "@cosyte/hl7";
const result = validateMessageStructure(parseHL7(raw));
result.validated; // false for a message type the registry does not model
result.structureId; // e.g. "ADT_A01-A": the variant the findings are against
result.findings.map((f) => f.code);
```

***

### versionMismatch()

> **versionMismatch**(`position`, `declared`, `expected`): [`Hl7ParseWarning`](#hl7parsewarning)

Build a `VERSION_MISMATCH` warning. Emitted when MSH-12 declares an HL7
version that does not match what the active profile or `ParseOptions`
expected.

#### Parameters

##### position

[`Hl7Position`](#hl7position)

##### declared

`string`

##### expected

`string`

#### Returns

[`Hl7ParseWarning`](#hl7parsewarning)

#### Example

```ts
import { versionMismatch } from "@cosyte/hl7";
const w = versionMismatch({ segmentIndex: 0, fieldIndex: 12 }, "2.9", "2.5");
```
