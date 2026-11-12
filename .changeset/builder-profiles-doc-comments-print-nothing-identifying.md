---
"@cosyte/hl7": patch
---

The examples in the doc comments of the message builders (`buildMessage`, `buildAck`) and the vendor profiles no longer print a whole message, a name or a free-text value.

These comments ship in the type declarations your editor shows and in the API reference. Each example now reads such a value into a variable, with its synthetic value in a comment, and prints only what is safe to log. No code changed, and a caller changes nothing.
