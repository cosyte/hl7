---
"@cosyte/hl7": patch
---

`parseStream` holds less memory while you hold the message it yields: on a 100 MiB batch whose largest message is 4 MiB, its peak is now under three times that message, the limit `readMessages` is held to, where it was at or over it (the readings are in the performance notes). It no longer cuts every segment from one growing buffer that stayed alive while a message was yielded, and a message read from bytes keeps the entry's `raw` string as its text wherever decoding the bytes gives the same characters (ASCII bytes in any charset the parser decodes, and every 8859/1 or verbatim reading) instead of decoding a second copy. A large segment is also no longer copied once for each chunk it spans. Every entry, message, warning and error is what it was; nothing a caller does changes.
