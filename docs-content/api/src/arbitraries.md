# src/arbitraries

fast-check generators for HL7 v2, at `@cosyte/hl7/arbitraries`: encoding characters, escape
sequences, values, components, repetitions, fields, segments, message types, whole messages,
messy message text, hostile input, and an animal patient's species, breed, strain and production
class. We use them to test this library, and you can use them to test code you build on it.

`fast-check` is an optional peer dependency: install it to use this entry point. The main
entry point, `@cosyte/hl7`, never loads it.

Every generated value is synthetic and random. Nothing in one looks like a patient's name,
date of birth, address or identifier.

## Example

```ts
import fc from "fast-check";
import { parseHL7 } from "@cosyte/hl7";
import { message } from "@cosyte/hl7/arbitraries";

fc.assert(
  fc.property(message(), (msg) => parseHL7(msg.toString()).toString() === msg.toString()),
);
```

## Interfaces

### EncodingCharactersOptions

Options for [encodingCharacters](#encodingcharacters-2).

#### Properties

##### delimiters?

> `readonly` `optional` **delimiters?**: `"standard"` \| `"any"`

`"standard"` always gives `|^~\&`; `"any"` (the default) gives the standard set about half
the time and six distinct punctuation characters otherwise.

##### truncation?

> `readonly` `optional` **truncation?**: `boolean`

Whether to declare the v2.7 truncation character (a fifth MSH-2 character). `true` always
declares one, `false` never does, and leaving it out declares one about half the time.

***

### EscapeSequenceOptions

Options for [escapeSequence](#escapesequence).

#### Properties

##### encodingCharacters?

> `readonly` `optional` **encodingCharacters?**: [`EncodingCharacters`](README.md#encodingcharacters-1)

The encoding characters the sequence is written with. Defaults to the standard set, with no
truncation character, so `\P` is never generated.

***

### HostileInputOptions

Options for [hostileInput](#hostileinput).

#### Properties

##### maxLength?

> `readonly` `optional` **maxLength?**: `number`

The longest random string or byte run. Defaults to 200.

***

### MessageOptions

Options for [message](#message) and [messageText](#messagetext).

#### Properties

##### encodingCharacters?

> `readonly` `optional` **encodingCharacters?**: `Arbitrary`\<[`EncodingCharacters`](README.md#encodingcharacters-1)\>

The encoding characters to write with. Defaults to [encodingCharacters](#encodingcharacters-2).

##### escapes?

> `readonly` `optional` **escapes?**: `boolean`

Whether values carry escape sequences beyond the ones their delimiters need: hex, highlight,
formatting, character set and local escapes. Defaults to `true`.

##### maxExtraSegments?

> `readonly` `optional` **maxExtraSegments?**: `number`

The most segments after the ones a message type opens with. Defaults to 4.

##### maxFields?

> `readonly` `optional` **maxFields?**: `number`

The most fields in a body segment. Defaults to 8.

***

### MessageType

A message type: the MSH-9 message code and trigger event.

#### Properties

##### code

> `readonly` **code**: `string`

The message code, MSH-9.1, such as `ADT`.

##### trigger

> `readonly` **trigger**: `string`

The trigger event, MSH-9.2, such as `A01`.

***

### SegmentOptions

Options for [segment](#segment).

#### Extends

- [`TreeOptions`](#treeoptions)

#### Properties

##### maxComponents?

> `readonly` `optional` **maxComponents?**: `number`

The most components in a repetition. Defaults to 4.

###### Inherited from

[`TreeOptions`](#treeoptions).[`maxComponents`](#maxcomponents-1)

##### maxFields?

> `readonly` `optional` **maxFields?**: `number`

The most fields after the name. Defaults to 8.

##### maxRepetitions?

> `readonly` `optional` **maxRepetitions?**: `number`

The most repetitions in a field. Defaults to 3.

###### Inherited from

[`TreeOptions`](#treeoptions).[`maxRepetitions`](#maxrepetitions-1)

##### maxSubcomponents?

> `readonly` `optional` **maxSubcomponents?**: `number`

The most subcomponents in a component. Defaults to 3.

###### Inherited from

[`TreeOptions`](#treeoptions).[`maxSubcomponents`](#maxsubcomponents-1)

##### names?

> `readonly` `optional` **names?**: readonly `string`[]

The names to draw from. Defaults to common segments and site-defined `Z` segments. A name
is three characters; `MSH` and the batch envelope segments are not body segments.

##### nullable?

> `readonly` `optional` **nullable?**: `boolean`

Whether a field may be the explicit null `""`. Defaults to `true`.

###### Inherited from

[`TreeOptions`](#treeoptions).[`nullable`](#nullable-1)

##### values?

> `readonly` `optional` **values?**: `Arbitrary`\<`string`\>

The decoded values at the leaves. Defaults to [value](#value).

###### Inherited from

[`TreeOptions`](#treeoptions).[`values`](#values-1)

***

### TreeOptions

The shape options every level of the tree takes.

#### Extended by

- [`SegmentOptions`](#segmentoptions)

#### Properties

##### maxComponents?

> `readonly` `optional` **maxComponents?**: `number`

The most components in a repetition. Defaults to 4.

##### maxRepetitions?

> `readonly` `optional` **maxRepetitions?**: `number`

The most repetitions in a field. Defaults to 3.

##### maxSubcomponents?

> `readonly` `optional` **maxSubcomponents?**: `number`

The most subcomponents in a component. Defaults to 3.

##### nullable?

> `readonly` `optional` **nullable?**: `boolean`

Whether a field may be the explicit null `""`. Defaults to `true`.

##### values?

> `readonly` `optional` **values?**: `Arbitrary`\<`string`\>

The decoded values at the leaves. Defaults to [value](#value).

***

### ValueOptions

Options for [value](#value).

#### Properties

##### maxLength?

> `readonly` `optional` **maxLength?**: `number`

The longest value, in characters. Defaults to 12.

##### minLength?

> `readonly` `optional` **minLength?**: `number`

The shortest value, at least 1. Defaults to 1.

## Functions

### breed()

> **breed**(): `Arbitrary`\<[`CWE`](README.md#cwe-1)\>

Generate a PID-36 Breed Code: a random coded value, never a real breed code.

#### Returns

`Arbitrary`\<[`CWE`](README.md#cwe-1)\>

An arbitrary of the code, the shape `Patient.breed` reads and `AdtPatient.breed` takes.

#### Example

```ts
import fc from "fast-check";
import { breed } from "@cosyte/hl7/arbitraries";

const [code] = fc.sample(breed(), 1);
// code is a CWE with at least one part
```

***

### component()

> **component**(`options?`): `Arbitrary`\<[`RawComponent`](README.md#rawcomponent)\>

Generate one component: a list of decoded subcomponents, ending on a non-empty one, with empty
subcomponents allowed before it.

#### Parameters

##### options?

[`TreeOptions`](#treeoptions) = `{}`

The tree's bounds and its leaf values.

#### Returns

`Arbitrary`\<[`RawComponent`](README.md#rawcomponent)\>

An arbitrary of a [RawComponent](README.md#rawcomponent).

#### Example

```ts
import fc from "fast-check";
import { component } from "@cosyte/hl7/arbitraries";

const [comp] = fc.sample(component({ maxSubcomponents: 2 }), 1);
// comp is like { subcomponents: ["", "x&y"] }
```

***

### encodingCharacters()

> **encodingCharacters**(`options?`): `Arbitrary`\<[`EncodingCharacters`](README.md#encodingcharacters-1)\>

Generate a set of HL7 encoding characters: the field separator (MSH-1) and the MSH-2
characters, all distinct, optionally with the v2.7 truncation character.

#### Parameters

##### options?

[`EncodingCharactersOptions`](#encodingcharactersoptions) = `{}`

Which delimiters to draw and whether to declare a truncation character.

#### Returns

`Arbitrary`\<[`EncodingCharacters`](README.md#encodingcharacters-1)\>

An arbitrary of [EncodingCharacters](README.md#encodingcharacters-1).

#### Example

```ts
import fc from "fast-check";
import { encodingCharacters } from "@cosyte/hl7/arbitraries";

const [enc] = fc.sample(encodingCharacters({ delimiters: "standard", truncation: false }), 1);
// enc is { field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" }
```

***

### escapeSequence()

> **escapeSequence**(`options?`): `Arbitrary`\<`string`\>

Generate one HL7 escape sequence as it is written on the wire, delimited by the escape
character: a delimiter escape (`\F\`, `\S`, `\T\`, `\R`, `\E\`, and `\P` when a truncation
character is declared), the line break `\.br\`, a hex escape (`\X41`), a highlight, formatting
or character set escape (`\H\`, `\.sp`, `\C2842\`), or a local `\Z..` escape.

#### Parameters

##### options?

[`EscapeSequenceOptions`](#escapesequenceoptions) = `{}`

The encoding characters to write it with.

#### Returns

`Arbitrary`\<`string`\>

An arbitrary of the escape sequence's wire text.

#### Example

```ts
import fc from "fast-check";
import { escapeSequence } from "@cosyte/hl7/arbitraries";

const [token] = fc.sample(escapeSequence(), 1);
// token is one sequence, such as "\\F\\" or "\\X0D\\"
```

***

### field()

> **field**(`options?`): `Arbitrary`\<[`RawField`](README.md#rawfield)\>

Generate one field in the shape the parser builds: repetitions of components of decoded
subcomponents, with empty items allowed anywhere but at the end of each list, or, about one
time in ten unless `nullable` is `false`, the explicit null `""`.

#### Parameters

##### options?

[`TreeOptions`](#treeoptions) = `{}`

The tree's bounds and its leaf values.

#### Returns

`Arbitrary`\<[`RawField`](README.md#rawfield)\>

An arbitrary of a [RawField](README.md#rawfield).

#### Example

```ts
import fc from "fast-check";
import { buildMessage } from "@cosyte/hl7";
import { field } from "@cosyte/hl7/arbitraries";

const [f] = fc.sample(field({ nullable: false }), 1);
const msg = buildMessage({ type: "ADT^A01", controlId: "CTRL1" });
msg.addSegment("ZXX", [f]);
```

***

### hostileInput()

> **hostileInput**(`options?`): `Arbitrary`\<`string` \| `Buffer`\<`ArrayBufferLike`\>\>

Generate hostile input for a lenient parser: random strings, random bytes, messages with
random cuts, deletions and insertions, text that opens like an MSH and then falls apart, and
messages as bytes in UTF-8 or Latin-1. The parser must turn each into a message with warnings,
or refuse it with one of its documented fatal errors, and never throw anything else.

#### Parameters

##### options?

[`HostileInputOptions`](#hostileinputoptions) = `{}`

The longest random run.

#### Returns

`Arbitrary`\<`string` \| `Buffer`\<`ArrayBufferLike`\>\>

An arbitrary of a string or a `Buffer`.

#### Example

```ts
import fc from "fast-check";
import { Hl7ParseError, parseHL7 } from "@cosyte/hl7";
import { hostileInput } from "@cosyte/hl7/arbitraries";

fc.assert(
  fc.property(hostileInput(), (raw) => {
    try {
      parseHL7(raw);
    } catch (err) {
      return err instanceof Hl7ParseError;
    }
    return true;
  }),
);
```

***

### message()

> **message**(`options?`): `Arbitrary`\<[`Hl7Message`](README.md#hl7message)\>

Generate a spec-clean message, parsed: written over generated encoding characters with escape
sequences in its values, and never anything the parser would have to repair, so the message
serializes back to the text it was parsed from. Its MSH carries a common message type and the
body opens with that type's segments, then adds generated segments, `Z` segments included.
Every value is random: nothing in one looks like a name, a date of birth or an identifier.
Each case is a new message, so the code under test may change it.

#### Parameters

##### options?

[`MessageOptions`](#messageoptions) = `{}`

The encoding characters, the size, and whether to add escape sequences.

#### Returns

`Arbitrary`\<[`Hl7Message`](README.md#hl7message)\>

An arbitrary of an [Hl7Message](README.md#hl7message).

#### Example

```ts
import fc from "fast-check";
import { parseHL7 } from "@cosyte/hl7";
import { message } from "@cosyte/hl7/arbitraries";

fc.assert(
  fc.property(message(), (msg) => {
    return parseHL7(msg.toString()).toString() === msg.toString();
  }),
);
```

***

### messageText()

> **messageText**(`options?`): `Arbitrary`\<`string`\>

Generate raw message text the parser accepts, messy on purpose: line endings of any kind,
MLLP framing, a byte order mark, padded fields, trailing delimiters, fields of separators only,
lower-case segment names, unknown and unterminated escapes, unknown segments and a character
set in MSH-18. The parser reads past each one, repairing what it must, and never refuses it,
so this text always parses.

#### Parameters

##### options?

[`MessageOptions`](#messageoptions) = `{}`

The encoding characters, the size, and whether to add escape sequences.

#### Returns

`Arbitrary`\<`string`\>

An arbitrary of the message text.

#### Example

```ts
import fc from "fast-check";
import { parseHL7 } from "@cosyte/hl7";
import { messageText } from "@cosyte/hl7/arbitraries";

fc.assert(
  fc.property(messageText(), (raw) => {
    parseHL7(raw); // never throws for this text
  }),
);
```

***

### messageType()

> **messageType**(): `Arbitrary`\<[`MessageType`](#messagetype)\>

Generate a common message type: ADT (A01, A03, A04, A08), ORU^R01, ORM^O01, OML^O21,
SIU^S12, MDM^T02, DFT^P03, VXU^V04, RDE^O11 or ACK.

#### Returns

`Arbitrary`\<[`MessageType`](#messagetype)\>

An arbitrary of a [MessageType](#messagetype).

#### Example

```ts
import fc from "fast-check";
import { messageType } from "@cosyte/hl7/arbitraries";

const [type] = fc.sample(messageType(), 1);
// type is like { code: "ORU", trigger: "R01" }
```

***

### productionClass()

> **productionClass**(): `Arbitrary`\<[`CWE`](README.md#cwe-1)\>

Generate a PID-38 Production Class Code: a random coded value, never a real class code.

#### Returns

`Arbitrary`\<[`CWE`](README.md#cwe-1)\>

An arbitrary of the code, the shape `Patient.productionClass` reads and
`AdtPatient.productionClass` takes.

#### Example

```ts
import fc from "fast-check";
import { productionClass } from "@cosyte/hl7/arbitraries";

const [code] = fc.sample(productionClass(), 1);
// code is a CWE with at least one part
```

***

### repetition()

> **repetition**(`options?`): `Arbitrary`\<[`RawRepetition`](README.md#rawrepetition)\>

Generate one repetition: a list of components ending on a non-empty one.

#### Parameters

##### options?

[`TreeOptions`](#treeoptions) = `{}`

The tree's bounds and its leaf values.

#### Returns

`Arbitrary`\<[`RawRepetition`](README.md#rawrepetition)\>

An arbitrary of a [RawRepetition](README.md#rawrepetition).

#### Example

```ts
import fc from "fast-check";
import { repetition } from "@cosyte/hl7/arbitraries";

const [rep] = fc.sample(repetition(), 1);
// rep is like { components: [{ subcomponents: ["A1"] }, { subcomponents: ["b"] }] }
```

***

### segment()

> **segment**(`options?`): `Arbitrary`\<[`RawSegment`](README.md#rawsegment)\>

Generate one non-MSH segment in the shape the parser builds: `fields[0]` holds the name, and
fields 1 and up are generated fields, ending on a non-empty one.

#### Parameters

##### options?

[`SegmentOptions`](#segmentoptions) = `{}`

The names, the field count and the tree's bounds.

#### Returns

`Arbitrary`\<[`RawSegment`](README.md#rawsegment)\>

An arbitrary of a [RawSegment](README.md#rawsegment).

#### Example

```ts
import fc from "fast-check";
import { segment } from "@cosyte/hl7/arbitraries";

const [seg] = fc.sample(segment({ names: ["NTE"], maxFields: 3 }), 1);
seg?.name; // "NTE"
```

***

### species()

> **species**(): `Arbitrary`\<[`CWE`](README.md#cwe-1)\>

Generate a PID-35 Species Code: a random coded value, never a real species code.

#### Returns

`Arbitrary`\<[`CWE`](README.md#cwe-1)\>

An arbitrary of the code, the shape `Patient.species` reads and `AdtPatient.species`
takes.

#### Example

```ts
import fc from "fast-check";
import { species } from "@cosyte/hl7/arbitraries";

const [code] = fc.sample(species(), 1);
// code is a CWE with at least one part, such as { identifier: "Q7", text: "a^b" }
```

***

### strain()

> **strain**(): `Arbitrary`\<`string`\>

Generate a PID-37 Strain: one random decoded value, the free text `Patient.strain` reads and
`AdtPatient.strain` takes.

#### Returns

`Arbitrary`\<`string`\>

An arbitrary of the strain text.

#### Example

```ts
import fc from "fast-check";
import { strain } from "@cosyte/hl7/arbitraries";

const [text] = fc.sample(strain(), 1);
// text is a non-empty string, such as "x&Y"
```

***

### value()

> **value**(`options?`): `Arbitrary`\<`string`\>

Generate one decoded value, the text of a subcomponent as a reader sees it: never empty, never
the explicit null `""`, and never starting or ending with a space, so the parser has nothing
to trim. It mixes in the delimiters, the line break and the carriage return, so writing it
needs escape sequences.

#### Parameters

##### options?

[`ValueOptions`](#valueoptions) = `{}`

Its length bounds.

#### Returns

`Arbitrary`\<`string`\>

An arbitrary of the value.

#### Example

```ts
import fc from "fast-check";
import { value } from "@cosyte/hl7/arbitraries";

const [text] = fc.sample(value({ maxLength: 4 }), 1);
// text is up to four characters, such as "a|Z" or "Q"
```
