---
"@cosyte/hl7": patch
---

`toString()` on a message nothing has read writes each segment straight from the text it was parsed from, so reading a message and writing it back takes a small part of the memory it did. It no longer builds every segment's tree only to write it out: a segment is built only when the written text differs from the text read (an escape sequence, a field the parser trimmed, empty components at the end of a field, or a message whose encoding characters are wider than one UTF-16 code unit). The writer also joins a field's values without an array per repetition, component and subcomponent, which makes writing a built tree cheaper too, and every parse spends less finding the message structure. The text `toString()` returns is what it was for every message; nothing a caller does changes, except that `toString()` on a lazily parsed message no longer leaves every segment built behind it.
