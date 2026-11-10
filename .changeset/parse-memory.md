---
"@cosyte/hl7": patch
---

`parseHL7` uses less than half the memory it did and parses up to three times as fast, with the same result: the same tree, warnings, errors and `toString()` output. Parsing a 1 MiB result report of many short OBX lines peaked at 115 MiB of heap and now peaks at 46 MiB; a small ADT^A01 allocates 17 KiB per parse instead of 49 KiB. Every array in the parsed tree is now exactly as long as its content, and empty fields, explicit nulls and the `fields[0]` placeholder of each segment name are shared, frozen nodes, so do not change the raw tree in place (it was always typed readonly, and `setField`, `setComposite`, `addSegment` and `removeSegment` copy what they change). Escape decoding on parse and re-escaping on `toString()` copy text a run at a time, so `toString()` of a message carrying a 1 MiB base64 document takes about a seventh of the time it did.
