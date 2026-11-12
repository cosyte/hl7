---
"@cosyte/hl7": patch
---

The `toBytes()` documentation now states that a message read from bytes comes back with its line-ending bytes normalized: a 0x0A byte is written as 0x0D, and a 0x0D 0x0A pair as 0x0D alone. In a single-byte character set that changes only line endings. In a set the parser keeps as a latin1 byte reading whose characters take more than one byte (`UNICODE UTF-16`, `UNICODE UTF-32`, the East Asian sets), a character that holds either byte is changed and the reader frames a segment on it, so if you round-trip such messages, compare the bytes or reject them. Nothing a caller does changes; the behavior was already so, and tests now pin it.
