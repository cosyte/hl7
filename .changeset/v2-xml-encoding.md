---
"@cosyte/hl7": patch
---

`parseHL7Xml` reads an HL7 v2 message in the XML encoding into the same model `parseHL7` builds for the pipe-delimited form, and `toHl7Xml` writes a message back as v2 XML, in the message structure's group elements.

- `parseHL7Xml(xml, options)` reads fields, repetitions, components and subcomponents by position, walks through group elements, and takes every `parseHL7` option plus `limits`. It refuses a DTD or entity declaration, any entity beyond the five XML predefines, characters XML 1.0 forbids, and a document past 30,000,000 bytes, a depth of 64 or 1,000,000 elements (`DEFAULT_XML_LIMITS`), each with a coded `Hl7XmlError`. A limit that is not a number, NaN included, is refused with `INVALID_OPTIONS`. One document is one message: a second MSH is refused, as are the components of one value named for two data types or for a segment.
- `toHl7Xml(message, options)` places the segments in the message structure's groups (`ORU_R01.PATIENT_RESULT`). It knows the groups of ORU_R01 in v2.5 (`XML_GROUP_TABLES`, read from the published v2.5 schema) and takes any other structure in `groups`, refusing one it does not know with `GROUPS_UNKNOWN` and segments that do not fit with `STRUCTURE_MISMATCH`; `groups: "none"` writes every segment under the root. With no MSH-9.3 the root is named for the structure our registry maps the code and trigger to (`ADT^A04` is `ADT_A01`).
- The model carries no data types, so the writer takes them in `dataTypes`, and `xmlDataTypes(xml)` reads them from a sample document. A composite keeps its component element even when it holds one value, and a primitive type (`ST`, `TX`, `FT` and the rest) is written as text.
- Formatting escapes are `escape` elements (`<escape V="H"/>`), read anywhere and written in values typed `TX` or `FT`. Hex escapes are written as character references, decoded in MSH-18's character set. Namespace prefixes bound to `urn:hl7-org:v2xml` are read.
- Both still refuse, with `ESCAPE_NOT_SUPPORTED`, the escape character in text, for which we found no published rule.
- New exports: `parseHL7Xml`, `toHl7Xml`, `xmlDataTypes`, `Hl7XmlError`, `XML_ERROR_CODES`, `XML_GROUP_TABLES`, `DEFAULT_XML_LIMITS`, `V2_XML_NAMESPACE` and the types `ParseHl7XmlOptions`, `ToHl7XmlOptions`, `XmlDataTypesOptions`, `XmlLimits`, `XmlErrorCode`, `XmlMessageStructure`, `XmlGroupDefinition` and `XmlStructureItem`.
- A new how-to, "Read and write the v2 XML encoding", lists what is read, written and refused, and the public sources we checked it against.

What a caller must change: nothing.
