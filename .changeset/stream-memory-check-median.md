---
"@cosyte/hl7": patch
---

The performance notes now say how we check the streaming readers' memory on every change: five readings of each reader, each in a process of its own, judged on their median against a peak of three times the largest item, with memory read after two full collections. The notes give the readings and say why one reading once counted about a message more than the rest. A source comment on how the parser handles a charset label it does not recognize, such as `UTF-16LE`, now says that such content takes the same path as UTF-16 and UTF-32. Nothing a caller does changes.
