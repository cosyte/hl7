---
"@cosyte/hl7": patch
---

`parseHL7` holds less than half the memory it did and reads a message of many short segments about twice as fast, with the same result: the same tree, warnings, errors and `toString()` output. A parsed result report of many short OBX lines held about 106 times its text in the heap and now holds about 43 times; a small ADT^A01 allocates under half as much per parse. Every array in the parsed tree is now exactly as long as its content, and empty fields, explicit nulls and the `fields[0]` placeholder of each segment name are shared, frozen nodes, so do not change the raw tree in place (it was always typed readonly, and `setField`, `setComposite`, `addSegment` and `removeSegment` copy what they change). Escape decoding on parse and re-escaping on `toString()` copy text a run at a time, so `toString()` of a message carrying a 1 MiB base64 document takes about a ninth of the time it did.
