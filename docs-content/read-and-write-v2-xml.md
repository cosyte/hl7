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
msg.patient?.mrn; // => "TESTID01"
msg.observations()[0]?.value; // => 4.2
msg.get("PID.5.1"); // => "Test"
msg.get("NTE.3"); // => "Seen at 1 | 2 & recheck"
msg.toString().split("\r")[1]; // => "PID|||TESTID01^^^TESTLAB^MR||Test^Patient"
```

What the reader does:

- **It reads by position.** A field element is `SEG.n`, and inside it any element whose name ends
  in `.n` is component `n`, and inside that any `.n` is subcomponent `n`. The data type in the name
  does not matter to the reader, so it needs no table of data types for any version.
- **It walks through groups.** An element named `STRUCTURE.GROUP` (`ORU_R01.PATIENT_RESULT`) is a
  group, and its segments are read in document order.
- **Text is the value.** A `|` or `&` in text is that character, and reaches the model as the pipe
  form's `\F\` or `\T\` would. A line break in text is a line break, as `\.br\` is. Empty elements
  and absent positions are empty fields.
- **`""` is the explicit null,** as it is in the pipe form.
- **MSH.1 and MSH.2 set the delimiters,** and must be the first two fields of the first segment,
  which must be MSH. A five-character MSH.2 declares the v2.7 truncation character.
- **It takes `parseHL7`'s options** (`strict`, `onWarning`, `profile`, `lazy` and the rest), and
  reports the same warnings. A message read from XML is lazy by default, as any other is.
- **It reads a string.** Decode the bytes you received (UTF-8 for most senders) before you call
  it. The namespace may be `urn:hl7-org:v2xml` or none; a namespace prefix on an element is refused.

## Hostile input is refused

The reader builds no DOM and applies the same rules as our C-CDA reader. It refuses, with an
`Hl7XmlError` whose `code` comes from `XML_ERROR_CODES`:

| Code | When |
| --- | --- |
| `DTD_NOT_ALLOWED` | The document declares a DTD or an entity (`<!DOCTYPE`, `<!ENTITY`). |
| `ENTITY_NOT_ALLOWED` | It references an entity other than the five XML predefines. |
| `FORBIDDEN_CHARACTER` | It holds a character XML 1.0 does not allow, written or referenced. |
| `INPUT_TOO_LARGE` | It is over `limits.maxInputBytes`, 30,000,000 by default. |
| `DEPTH_LIMIT_EXCEEDED` | Its elements nest deeper than `limits.maxDepth`, 64 by default. |
| `ELEMENT_LIMIT_EXCEEDED` | It has more than `limits.maxElements` elements, 1,000,000 by default, each empty position a skipped-over element names counted as one. |
| `NOT_WELL_FORMED` | It is not well-formed XML. |

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

```ts runnable
import { parseHL7, toHl7Xml } from "@cosyte/hl7";

const msg = parseHL7(
  [
    "MSH|^~\\&|TESTLAB||||20260102101500||ACK^R01^ACK|XMLACK01|P|2.6",
    "MSA|AA|XMLDOC01",
  ].join("\r"),
);

const xml = toHl7Xml(msg, {
  dataTypes: { "MSH.3": "HD", "MSH.9": "MSG", "MSH.11": "PT", "MSH.12": "VID" },
});

xml.split("\n")[1]; // => '<ACK xmlns="urn:hl7-org:v2xml">'
xml.includes("<MSH.9><MSG.1>ACK</MSG.1><MSG.2>R01</MSG.2><MSG.3>ACK</MSG.3></MSH.9>"); // => true
xml.includes("<MSA><MSA.1>AA</MSA.1><MSA.2>XMLDOC01</MSA.2></MSA>"); // => true
```

```ts runnable
import { parseHL7Xml, toHl7Xml, xmlDataTypes } from "@cosyte/hl7";

const sample = `<ADT_A01>
  <MSH><MSH.1>|</MSH.1><MSH.2>^~\\&amp;</MSH.2><MSH.9><MSG.1>ADT</MSG.1><MSG.2>A01</MSG.2></MSH.9><MSH.12><VID.1>2.6</VID.1></MSH.12></MSH>
  <PID><PID.5><XPN.1><FN.1>Test</FN.1></XPN.1><XPN.2>Patient</XPN.2></PID.5></PID>
</ADT_A01>`;

const dataTypes = xmlDataTypes(sample);
dataTypes; // => { "MSH.12": "VID", "MSH.9": "MSG", "PID.5": "XPN", "XPN.1": "FN" }

const xml = toHl7Xml(parseHL7Xml(sample), { dataTypes, namespace: null });
xml.includes("<PID.5><XPN.1><FN.1>Test</FN.1></XPN.1><XPN.2>Patient</XPN.2></PID.5>"); // => true
```

What the writer does:

- The root element is the message structure: MSH-9.3, else MSH-9.1 and MSH-9.2 joined by `_`, or
  the `structure` option. Its namespace is `urn:hl7-org:v2xml`, or none with `namespace: null`.
- A field or component with a type in `dataTypes` is written with child elements, even when it
  holds one value. One without a type is written as text when it holds one value, and refused with
  `DATA_TYPE_UNKNOWN` when it holds more. List composite types only.
- Each repetition is its own element, an empty one written `<PID.3/>`. The explicit null is `""`.
- A line break in a value is written `&#10;` and a carriage return `&#13;`.
- `parseHL7Xml` reads what it writes back to the same model, for any delimiters.

## What we have not confirmed, and refuse

We built this from the encoding's public description: positional element names, MSH.1 and MSH.2
kept as elements, and a translation that converts to and from the pipe form. We did not have the
specification text or its published examples when we wrote it, and our fixtures are our own
synthetic messages. Where we could not confirm a rule, the reader and writer refuse rather than
guess:

- **The `escape` element.** A document with an `escape` element anywhere is refused with
  `ESCAPE_NOT_SUPPORTED`. So is a value the writer would need one for: one that carries a
  formatting, highlighting, hex or other escape sequence besides the delimiters and the line break.
- **The escape character in text.** A `\` (the third character of MSH.2) in a value may be a
  literal backslash or an escape sequence kept as text, so the reader refuses it, and the writer
  refuses a value holding one, both with `ESCAPE_NOT_SUPPORTED`.
- **Data types.** We ship no table of each version's data types; the writer takes them from you
  and refuses a composite without one. A field whose type follows another field, such as OBX-5
  following OBX-2, gets one type per key, so `xmlDataTypes` leaves out a key it saw with two types
  and the writer then refuses a composite there.
- **Groups.** The writer writes every segment directly under the root and no group elements. A
  receiver that validates against a schema with groups will refuse the document as it stands.
- **Batches.** A batch (`BHS`, `FHS`) in XML is not read or written.

Three things we wrote by our reading of a positional translation, rather than a rule we read: a
line break is written as a character reference, not an `escape` element; the explicit null is the
text `""`; and an empty repetition is an empty element.

## Related

- [Tolerance and errors](./tolerance-and-errors.md)
- [Read large messages](./read-large-messages.md)
- [How we compare with other HL7 v2 libraries](./compare-hl7-libraries.md)
