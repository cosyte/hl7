---
"@cosyte/hl7": patch
---

The examples in the doc comments of the message helpers (`patient`, `visit`, `orders`, `medications` and the rest) no longer print a name, record number, birth date, phone number or a clinical value.

These comments ship in the type declarations your editor shows and in the API reference. Each example now reads such a value into a variable, with its synthetic value in a comment, and prints only what is safe to log: a type, a code, a count or a precision. No code changed, and a caller changes nothing.
