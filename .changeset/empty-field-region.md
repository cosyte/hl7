---
"@cosyte/hl7": patch
---

A segment whose only field holds nothing but empty components, such as `PV1|^` as received or a segment added with one empty field, now serializes as the bare segment name (`PV1`). It used to serialize as `PV1|`, which reads back as a segment with no fields, so serializing a parsed message a second time changed its text. Segments with two or more fields, empty or not, serialize as before.
