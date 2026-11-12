---
id: read-and-write-v2-xml
title: Read and write the v2 XML encoding
sidebar_label: Read and write v2 XML
description: "Read an HL7 v2 message in the XML encoding into the same model as the pipe-delimited form with parseHL7Xml, and write one back with toHl7Xml."
---

# Read and write the v2 XML encoding

Some networks exchange HL7 v2 messages in the XML encoding rather than the pipe-delimited one: each
segment is an element, each field an element named for its segment and position (`PID.5`), and
each component an element named for its data type and position (`XPN.1`). `parseHL7Xml` reads such
a message into the same `Hl7Message` that `parseHL7` builds for the pipe-delimited form, so every
helper, dot-path and builder works on it unchanged. `toHl7Xml` writes a message back as XML.

## Read a message

```ts runnable
import { parseHL7Xml } from "@cosyte/hl7";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ORU_R01 xmlns="urn:hl7-org:v2xml">
  <MSH>
    <MSH.1>|</MSH.1>
    <MSH.2>^~\\&amp;</MSH.2>
    <MSH.3><HD.1>TESTLAB</HD.1></MSH.3>
    <MSH.7>20260102101500</MSH.7>
    <MSH.9><MSG.1>ORU</MSG.1><MSG.2>R01</MSG.2><MSG.3>ORU_R01</MSG.3></MSH.9>
    <MSH.10>XMLDOC01</MSH.10>
    <MSH.11><PT.1>P</PT.1></MSH.11>
    <MSH.12><VID.1>2.6</VID.1></MSH.12>
  </MSH>
  <ORU_R01.PATIENT_RESULT>
    <ORU_R01.PATIENT>
      <PID>
        <PID.3><CX.1>TESTID01</CX.1><CX.4><HD.1>TESTLAB</HD.1></CX.4><CX.5>MR</CX.5></PID.3>
        <PID.5><XPN.1><FN.1>Test</FN.1></XPN.1><XPN.2>Patient</XPN.2></PID.5>
      </PID>
    </ORU_R01.PATIENT>
    <ORU_R01.ORDER_OBSERVATION>
      <OBR><OBR.1>1</OBR.1></OBR>
      <ORU_R01.OBSERVATION>
        <OBX>
          <OBX.1>1</OBX.1>
          <OBX.2>NM</OBX.2>
          <OBX.3><CWE.1>TST-1</CWE.1><CWE.2>Test analyte</CWE.2></OBX.3>
          <OBX.5>4.2</OBX.5>
          <OBX.11>F</OBX.11>
        </OBX>
        <NTE><NTE.3>Seen at 1 | 2 &amp; recheck</NTE.3></NTE>
      </ORU_R01.OBSERVATION>
    </ORU_R01.ORDER_OBSERVATION>
  </ORU_R01.PATIENT_RESULT>
</ORU_R01>`;

const msg = parseHL7Xml(xml);

msg.version; // => "2.6"
msg.patient?.mrn; // => "TESTID01" /* synthetic */
msg.observations()[0]?.value; // => 4.2
msg.get("PID.5.1"); // => "Test" /* synthetic */
msg.get("NTE.3"); // => "Seen at 1 | 2 & recheck" /* synthetic */
const lines = msg.toString().split("\r").filter((line) => line !== "");
lines.map((line) => line.slice(0, 3)); // => ["MSH", "PID", "OBR", "OBX", "NTE"]
```

What the reader does:

- **It reads by position.** A field element is `SEG.n`, and inside it any element whose name ends
  in `.n` is component `n`, and inside that any `.n` is subcomponent `n`. Which data type the name
  carries does not matter to the reader, so it needs no table of data types for any version. Two
  things about it do: the components of one value must all name the same type, and none may be
  named for a segment, its own or another (`PID.3` or `OBX.1` inside `PID.5`). Either is refused
  with `UNEXPECTED_ELEMENT`.
- **It walks through groups.** An element named `STRUCTURE.GROUP` (`ORU_R01.PATIENT_RESULT`) is a
  group, and its segments are read in document order.
- **Text is the value.** A `|` or `&` in text is that character, and reaches the model as the pipe
  form's `\F\` or `\T\` would. A line break in text is a line break, as `\.br\` is. Empty elements
  and absent positions are empty fields.
- **An `escape` element is a formatting escape.** `<escape V="H"/>` in a value reaches the model as
  the pipe form's `\H\`, and `<escape V=".br"/>` as `\.br\`. Its `V` must be highlighting (`H`,
  `N`) or a formatting command (`.br`, `.sp`, `.in`, `.ti`, `.sk`, `.ce`, `.fi`, `.nf`, with an
  optional signed number); any other, or an `escape` element that holds text or elements, is
  refused with `ESCAPE_NOT_SUPPORTED`.
- **`""` is the explicit null,** as it is in the pipe form.
- **MSH.1 and MSH.2 set the delimiters,** and must be the first two fields of the first segment,
  which must be MSH. A five-character MSH.2 declares the v2.7 truncation character.
- **One document is one message.** A second MSH anywhere in the document is refused with
  `UNEXPECTED_ELEMENT`, so it cannot set new delimiters for the segments after it.
- **It takes `parseHL7`'s options** (`strict`, `onWarning`, `profile`, `lazy` and the rest), and
  reports the same warnings. A message read from XML is lazy by default, as any other is.
- **It reads a string.** Decode the bytes you received (UTF-8 for most senders) before you call
  it. The namespace may be `urn:hl7-org:v2xml`, as the default or through a prefix
  (`<v2:MSH xmlns:v2="urn:hl7-org:v2xml">`), or none; any other is refused.

## Hostile input is refused

The reader builds no DOM and applies the same rules as our C-CDA reader. It refuses, with an
`Hl7XmlError` whose `code` comes from `XML_ERROR_CODES`:

| Code                     | When                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DTD_NOT_ALLOWED`        | The document declares a DTD or an entity (`<!DOCTYPE`, `<!ENTITY`).                                                                    |
| `ENTITY_NOT_ALLOWED`     | It references an entity other than the five XML predefines.                                                                            |
| `FORBIDDEN_CHARACTER`    | It holds a character XML 1.0 does not allow, written or referenced.                                                                    |
| `INPUT_TOO_LARGE`        | It is over `limits.maxInputBytes`, 30,000,000 by default.                                                                              |
| `DEPTH_LIMIT_EXCEEDED`   | Its elements nest deeper than `limits.maxDepth`, 64 by default.                                                                        |
| `ELEMENT_LIMIT_EXCEEDED` | It has more than `limits.maxElements` elements, 1,000,000 by default, each empty position a skipped-over element names counted as one. |
| `NOT_WELL_FORMED`        | It is not well-formed XML, an element that repeats an attribute (`<NTE a="1" a="2">`) among them.                                      |
| `INVALID_OPTIONS`        | A limit is not a number, NaN included. `Infinity` lifts a cap; zero or a negative number refuses every document.                       |

A document that is well-formed XML but not the shape of a v2 message is refused too:

| Code                          | When                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NAMESPACE_NOT_SUPPORTED`     | An element is in a namespace other than `urn:hl7-org:v2xml` or none.                                                                                                                                                  |
| `INVALID_ENCODING_CHARACTERS` | The first segment is not MSH, MSH does not open with one MSH.1 and one MSH.2, or they are not one and four or five characters.                                                                                        |
| `UNEXPECTED_ELEMENT`          | An element is not a segment, group, field, component or subcomponent where it stands: a second MSH, a field of another segment, a component named for a segment, or components of one value named for two data types. |
| `MIXED_CONTENT`               | An element holds both text and child elements, or text stands between segments or fields.                                                                                                                             |
| `OUT_OF_ORDER`                | A field comes before one it should follow, or a component or subcomponent repeats or comes out of order.                                                                                                              |
| `ESCAPE_NOT_SUPPORTED`        | An `escape` element that is not a formatting escape or holds anything, or the escape character in text (see below).                                                                                                   |

Delimiters that `parseHL7` itself refuses, such as two the same, are left to its own
`Hl7ParseError`, as they would be in the pipe form.

The error carries `offset`, where in the document the reader stopped, and `path` when the place
has the shape of an HL7 position (`PID.5`). Neither it nor the message ever holds text from the
document.

```ts runnable
import { Hl7XmlError, parseHL7Xml } from "@cosyte/hl7";

let code: string | undefined;
try {
  parseHL7Xml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>');
} catch (error) {
  if (error instanceof Hl7XmlError) code = error.code;
}

code; // => "DTD_NOT_ALLOWED"
```

## Write a message

The pipe-delimited model does not record data types, and the XML encoding names every component
for one, so `toHl7Xml` takes them in `dataTypes`: a field key (`PID.5`) to its type (`XPN`), and a
component key (`XPN.1`) to the type of its subcomponents (`FN`). The simplest way to get them right
is to read them from a message your partner sent, or from one of their examples, with
`xmlDataTypes`.

The writer also places the segments in the message structure's group elements. It knows the
groups of the structures in `XML_GROUP_TABLES`, ORU_R01 in v2.5, and takes any other from you in
`groups`. An ACK has no groups, so this one is written with `groups: "none"`:

```ts runnable
import { parseHL7, toHl7Xml } from "@cosyte/hl7";

const msg = parseHL7(
  ["MSH|^~\\&|TESTLAB||||20260102101500||ACK^R01^ACK|XMLACK01|P|2.6", "MSA|AA|XMLDOC01"].join("\r"),
);

const xml = toHl7Xml(msg, {
  dataTypes: { "MSH.3": "HD", "MSH.9": "MSG", "MSH.11": "PT", "MSH.12": "VID" },
  groups: "none",
});

xml.split("\n")[1]; // => '<ACK xmlns="urn:hl7-org:v2xml">'
xml.includes("<MSH.9><MSG.1>ACK</MSG.1><MSG.2>R01</MSG.2><MSG.3>ACK</MSG.3></MSH.9>"); // => true
xml.includes("<MSA><MSA.1>AA</MSA.1><MSA.2>XMLDOC01</MSA.2></MSA>"); // => true
```

```ts runnable
import { parseHL7, toHl7Xml } from "@cosyte/hl7";

const msg = parseHL7(
  [
    "MSH|^~\\&|TESTLAB||||20260102101500||ORU^R01^ORU_R01|XMLORU01|P|2.5",
    "PID|1||TESTID01",
    "OBR|1",
    "OBX|1|NM|TST-1||4.2",
  ].join("\r"),
);

const xml = toHl7Xml(msg, { dataTypes: { "MSH.9": "MSG", "OBX.3": "CWE" } });

xml.split("\n").slice(3, 5); // => ["  <ORU_R01.PATIENT_RESULT>", "    <ORU_R01.PATIENT>"]
xml.split("\n")[5]?.trim().startsWith("<PID>"); // => true
xml.includes("<OBX.3><CWE.1>TST-1</CWE.1></OBX.3>"); // => true
```

```ts runnable
import { parseHL7Xml, toHl7Xml, xmlDataTypes } from "@cosyte/hl7";

const sample = `<ADT_A01>
  <MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.9><MSG.1>ADT</MSG.1><MSG.2>A01</MSG.2></MSH.9><MSH.12><VID.1>2.6</VID.1></MSH.12></MSH>
  <PID><PID.5><XPN.1><FN.1>Test</FN.1></XPN.1><XPN.2>Patient</XPN.2></PID.5></PID>
</ADT_A01>`;

const dataTypes = xmlDataTypes(sample);
dataTypes; // => { "MSH.12": "VID", "MSH.9": "MSG", "PID.5": "XPN", "XPN.1": "FN" }

const xml = toHl7Xml(parseHL7Xml(sample), {
  dataTypes,
  namespace: null,
  groups: { structure: "ADT_A01", items: ["MSH", "PID"] },
});
xml.includes("<PID.5><XPN.1><FN.1>Test</FN.1></XPN.1><XPN.2>Patient</XPN.2></PID.5>"); // => true
```

What the writer does:

- **The root element is the message structure:** the `structure` option, else the structure in
  `groups`, else MSH-9.3, else the structure our message structure registry gives MSH-9.1 and
  MSH-9.2. `ADT^A04` with no MSH-9.3 is written `<ADT_A01>`, since the two events share one
  structure. A code and trigger the registry does not map is refused with `STRUCTURE_UNKNOWN`
  rather than guessed. The namespace is `urn:hl7-org:v2xml`, or none with `namespace: null`.
- **Segments are placed in groups,** each written as an element named for the structure and the
  group (`ORU_R01.PATIENT_RESULT`), nested and repeated as the structure gives them. The structure
  comes from `XML_GROUP_TABLES` for the message's version (MSH-12), or from `groups`. A structure
  the tables do not cover is refused with `GROUPS_UNKNOWN`, which names it; `groups: "none"`
  writes every segment directly under the root. Segments that do not fit the structure (a
  required segment missing, or one with no place in it) are refused with `STRUCTURE_MISMATCH`.
- **A field or component with a composite type in `dataTypes` is written with child elements,**
  even when it holds one value (`<OBX.3><CWE.1>TST-1</CWE.1></OBX.3>`), as the encoding requires.
  One with a primitive type (`ST`, `TX`, `FT`, `NM`, `ID`, `IS`, `SI`, `DT`, `DTM`, `TM`, `GTS`,
  `SNM`) or none is written as text when it holds one value, and refused with `DATA_TYPE_UNKNOWN`
  when it holds more.
- **Formatting escapes are `escape` elements, in `TX` and `FT` values.** In a value typed `TX` or
  `FT`, `\H\` is written `<escape V="H"/>`, `\.br\` and a line break `<escape V=".br"/>`, and
  `\.in+4\` `<escape V=".in+4"/>`. In any other value a formatting escape is refused with
  `ESCAPE_NOT_SUPPORTED`, except a line break, which is written `&#10;`: the schemas allow an
  `escape` element only in those two types, so tell the writer which fields are `TX` or `FT`
  (`"NTE.3": "FT"`).
- **Hex escapes are character references.** `\Xc9\` in a message whose MSH-18 is `8859/1` is
  written `&#xc9;`. The bytes are decoded in MSH-18's character set: ASCII (MSH-18 blank),
  `UNICODE UTF-8`, `8859/1` or `WINDOWS-1252`. Bytes that are not text in it, or any other
  character set, are refused with `ESCAPE_NOT_SUPPORTED`, as are character set switches
  (`\C..\`, `\M..\`) and vendor escapes (`\Z..\`). In `WINDOWS-1252` that includes the five
  bytes the set assigns no character (81, 8D, 8F, 90 and 9D): decoded, each would be the C1
  control of the same number, which no sender means, so the escape is refused rather than written
  `&#x81;`. In `8859/1` those bytes are the C1 controls the set defines, and are written.
- **The delimiter escapes are the delimiters:** `\F\` is a `|` in the text, as the encoding has
  no use for them.
- Each repetition is its own element, an empty one written `<PID.3/>`. The explicit null is `""`.
- An empty field is left out, except at the end of a segment: a segment ending in empty fields
  (`PID|a||`) gets one empty element at its last position (`<PID.3/>`), so it reads back with the
  same field count. Empty components and subcomponents after the last filled one are not kept:
  `a^` is written and read back as `a`, the same value.
- A data type named for a segment (`"PID.3": "PID"`, `"PID.3": "OBX"`) is refused with
  `INVALID_OPTIONS`, and a message holding a second MSH with `UNEXPECTED_ELEMENT`, since the reader
  refuses both.
- A carriage return in a value is written `&#13;`.
- `parseHL7Xml` reads what it writes back to the same model, for any delimiters.

## The sources we checked

We checked the reader and writer against public copies of the HL7 v2 XML encoding rules, the v2
XML schemas and an implementation guide that uses them. We quote none of their text here.

- HL7 Version 2 XML Encoding Rules, Release 2 (2012), as published on the HL7 Europe site
  (<https://hl7.eu/refactored/encoding02xml.html>, without its code examples) and on NIST's draft
  v2+ demonstration site (<https://usnistgov.github.io/v2plusDemo/xml-encoding-rules.html>, with
  them). They give the group element names, the `escape` element, character references in place
  of hex escapes, the component element kept for a one-component composite, MSH.1 and MSH.2, and
  the namespace.
- A public copy of the v2.5 and v2.4 v2 XML schemas
  (<https://schemas.liquid-technologies.com/HL7/hl7_25_xsd/oru_r01_xsd.html> and the pages beside
  it). The ORU_R01 group table comes from its ORU_R01 message definition, and the rule that only
  `TX` and `FT` take `escape` elements from its data type definitions.
- The NAHLN Order and Response implementation guide and its results schema, published by the
  Virginia Tech veterinary laboratory site
  (<https://vtsl.vetmed.vt.edu/vs/Documents/NAHLN_Order_Resp%20IG%20v2.1.pdf>,
  <https://vtsl.vetmed.vt.edu/vs/Documents/NAHLNMessageSchemas/NAHLNResultBase.xsd>). The network
  writes no namespace (`namespace: null`), and its results message is OPU_R25, whose groups you
  pass in `groups`.

Group names come from the schemas, not from the standard's chapter text, which leaves some groups
unnamed or names them with spaces. We found a public schema for ORU_R01 in v2.5 only, so that is
the one table we ship.

## What the published rules leave open, and we refuse

- **The escape character in text.** No source we found says how a `\` (the third character of
  MSH.2) in a value is written in XML. The reader refuses one in text, and the writer refuses a
  value holding one, both with `ESCAPE_NOT_SUPPORTED`.
- **A composite with no data type.** The rules give no element name for one, so the writer refuses
  it with `DATA_TYPE_UNKNOWN`. We ship no table of each version's data types; the writer takes them
  from you. A field whose type follows another field, such as OBX-5 following OBX-2, gets one type
  per key, so `xmlDataTypes` leaves out a key it saw with two types and the writer then refuses a
  composite there.
- **Groups of other structures and versions.** The writer refuses a structure `XML_GROUP_TABLES`
  does not cover unless you pass it in `groups`.
- **Batches.** A batch (`BHS`, `FHS`) in XML is not read or written.

Three things we wrote by our reading of a positional translation, rather than a rule we read: the
explicit null is the text `""` at field level; an empty repetition is an empty element; and
trailing empty fields are kept as one empty element at the segment's last position.

## Related

- [Tolerance and errors](./tolerance-and-errors.md)
- [Read large messages](./read-large-messages.md)
- [How we compare with other HL7 v2 libraries](./compare-hl7-libraries.md)
