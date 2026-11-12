---
"@cosyte/hl7": patch
---

`parseHL7Xml` reads an HL7 v2 message in the XML encoding into the same model `parseHL7` builds for the pipe-delimited form, and `toHl7Xml` writes a message back as v2 XML.

- `parseHL7Xml(xml, options)` reads fields, repetitions, components and subcomponents by position, walks through group elements, and takes every `parseHL7` option plus `limits`. It refuses a DTD or entity declaration, any entity beyond the five XML predefines, characters XML 1.0 forbids, and a document past 30,000,000 bytes, a depth of 64 or 1,000,000 elements (`DEFAULT_XML_LIMITS`), each with a coded `Hl7XmlError`. A limit that is not a number, NaN included, is refused with `INVALID_OPTIONS`. One document is one message: a second MSH is refused, as are the components of one value named for two data types or for the segment itself.
- `toHl7Xml(message, options)` writes one segment element per line under the message structure's root. The model carries no data types, so the writer takes them in `dataTypes`, and `xmlDataTypes(xml)` reads them from a sample document. It writes no group elements, so its output will not pass a schema that requires them. A segment ending in empty fields keeps its field count with one empty element at its last position.
- Both refuse, with `ESCAPE_NOT_SUPPORTED`, the cases whose encoding rule we have not confirmed: the `escape` element, the escape character in text, and formatting or hex escape sequences.
- New exports: `parseHL7Xml`, `toHl7Xml`, `xmlDataTypes`, `Hl7XmlError`, `XML_ERROR_CODES`, `DEFAULT_XML_LIMITS`, `V2_XML_NAMESPACE` and the types `ParseHl7XmlOptions`, `ToHl7XmlOptions`, `XmlDataTypesOptions`, `XmlLimits` and `XmlErrorCode`.
- A new how-to, "Read and write the v2 XML encoding", lists what is read, written and refused.

What a caller must change: nothing.
