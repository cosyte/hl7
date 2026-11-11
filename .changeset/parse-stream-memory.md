---
"@cosyte/hl7": patch
---

`parseStream` now holds about one copy of the message it yields, where it held up to four: on a 100 MiB batch whose largest message is 4 MiB, its peak fell under the three times the largest message that `readMessages` is held to. It no longer cuts every segment from one growing buffer that stayed alive while a message was yielded, and a message read from bytes keeps the entry's `raw` string as its text wherever decoding the bytes gives the same characters (ASCII bytes in any charset the parser decodes, and every 8859/1 or verbatim reading) instead of decoding a second copy. A large segment is also no longer copied once for each chunk it spans. Every entry, message, warning and error is what it was; nothing a caller does changes.
