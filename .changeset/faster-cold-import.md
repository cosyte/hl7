---
"@cosyte/hl7": patch
---

Faster import: loading `@cosyte/hl7` in a new Node.js process takes about half the time it did. The package no longer imports `node:crypto` (a generated message control ID now draws its random suffix from the Web Crypto global, `crypto.getRandomValues`, still uniform over the same 62 characters), no longer sorts with `localeCompare` while it loads (the published lists keep exactly the order they had), and reads its generated structure tables as JSON, parsing the published structure schemas on the first `validateMessageStructure` call rather than at import. No exported name, type or value changes, so no caller has to change anything; a runtime without a global `crypto` (every supported Node.js, Bun and Deno has one) could no longer generate a control ID.
