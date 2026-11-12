---
"@cosyte/hl7": patch
---

The `toBytes()` documentation now states that a message read from bytes comes back with its line-ending bytes normalized: a 0x0A byte is written as 0x0D, and a 0x0D 0x0A pair as 0x0D alone. In a single-byte character set that changes only line endings. The East Asian sets the parser keeps as bytes (ISO-2022, GB 18030, EUC, BIG-5) never put either byte inside a character. In `UNICODE UTF-16` and `UNICODE UTF-32`, which the parser also keeps as a latin1 byte reading, a character that holds either byte is changed and the reader frames a segment on it, so if you round-trip such messages, compare the bytes or reject them. Nothing a caller does changes; the behavior was already so, and tests now pin it.
