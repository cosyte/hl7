---
"@cosyte/hl7": patch
---

Generated message control IDs now draw each of their six random characters uniformly from the 62-character alphabet; before, the first eight letters (`A` to `H`) came up about a quarter more often than the rest.

The ID keeps its shape: a 17-digit UTC timestamp followed by six characters from `[A-Za-z0-9]`, 23 characters in all.
