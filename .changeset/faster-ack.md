---
"@cosyte/hl7": patch
---

`buildAck` and the other builders generate their MSH-10 control id faster again, and `buildAck` no longer parses the whole inbound header to answer it.

- The control id's six random characters still come from Web Crypto (`crypto.getRandomValues`), now drawn a kilobyte at a time and handed out one byte at a time, each byte once, rather than with one call for every id. That call, new in 0.1.12, made every ACK slower than in 0.1.11. The id's shape and its uniform alphabet are unchanged.
- `buildAck` reads the three values it echoes (MSH-9.2, MSH-11.1 and MSH-12) straight from the inbound header instead of building its `meta`, which also parses MSH-7's date and MSH-21. An empty value falls back as before. Nothing changes for a caller.
