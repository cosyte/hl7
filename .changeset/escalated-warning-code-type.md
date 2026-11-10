---
"@cosyte/hl7": patch
---

`Hl7ParseError.code` is now typed `FatalCode | WarningCode`, because a warning escalated by `{ strict: true }` is thrown with its own warning code.

Strict mode has always thrown an `Hl7ParseError` whose `code` is the escalated warning's code, such as `UNKNOWN_SEGMENT`, but the type declared a member of `FATAL_CODES`, so a `switch` the compiler called exhaustive over the four fatal codes fell through on every escalated warning. The runtime behavior is unchanged. Code that compares `err.code` to a fatal code still compiles; code that assigns `err.code` to a `FatalCode` now needs a check first, such as `err.code in FATAL_CODES`. Treat any code outside `FATAL_CODES` as an escalated warning and give a `switch` over `err.code` a `default` branch.
