---
"@cosyte/hl7": patch
---

`readMessages`, `parseStream` and `splitBatch` now read bytes as they read the same text: a line holding only a byte order mark, a no-break space or other non-ASCII whitespace between messages is skipped from bytes too. Before, from bytes such a line became an extra failed `NO_MSH_SEGMENT` item or entry before the next message, and a last message ending in one was flagged `UNTERMINATED_STREAM_MESSAGE`; from text it was skipped. Messages, offsets and positions from text do not change, and no caller has to change anything.
