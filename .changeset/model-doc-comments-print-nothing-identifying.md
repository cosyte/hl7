---
"@cosyte/hl7": patch
---

The examples in the doc comments of `Hl7Message`, `Segment`, `Field` and the data type parsers no longer print a name, record number, birth date, address or phone number.

These comments ship in the type declarations your editor shows and in the API reference. Each example now reads such a value into a variable, with its synthetic value in a comment, and prints only what is safe to log: a type, a code, a count or a precision. The `toString`, `toJSON` and `prettyPrint` examples keep the whole message in a variable instead of logging it. No code changed, and a caller changes nothing.
