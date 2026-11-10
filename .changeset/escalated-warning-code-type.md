---
"@cosyte/hl7": patch
---

`Hl7ParseError.code` is now typed `FatalCode | WarningCode`, because a warning escalated by `{ strict: true }` is thrown with its own warning code.

Strict mode has always thrown an `Hl7ParseError` whose `code` is the escalated warning's code, such as `UNKNOWN_SEGMENT`, but the type declared a member of `FATAL_CODES`, so a `switch` the compiler called exhaustive over the four fatal codes fell through on every escalated warning. The runtime behavior is unchanged. Code that compares `err.code` to a fatal code still compiles; code that assigns `err.code` to a `FatalCode` now needs to narrow it first, with a `switch` that has a `case` for each fatal code or a type guard such as `(code: string): code is FatalCode => (Object.values(FATAL_CODES) as string[]).includes(code)`. Treat any code outside `FATAL_CODES` as an escalated warning and give a `switch` over `err.code` a `default` branch.
