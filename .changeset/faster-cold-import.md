---
"@cosyte/hl7": patch
---

Faster import: loading `@cosyte/hl7` in a new Node.js process takes well under half the time it did. The package no longer imports `node:crypto` (a generated message control ID now draws its random suffix from the Web Crypto global, `crypto.getRandomValues`, still uniform over the same 62 characters), no longer sorts with `localeCompare` while it loads (the published lists keep exactly the order they had), reads its generated structure tables as JSON, and builds the published structure schemas, the character set table and each built-in profile on first use rather than at import. No exported name, type or value changes, so no caller has to change anything. Two things a caller could notice: the properties of `profiles` are now getters that build the profile on its first read and return the same frozen object after it, and a runtime without a global `crypto` (every supported Node.js, Bun and Deno has one) could no longer generate a control ID.
