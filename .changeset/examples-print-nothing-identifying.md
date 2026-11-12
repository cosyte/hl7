---
"@cosyte/hl7": patch
---

No example in the README or the API documentation prints a value that identifies a person any more.

Every `@example` in the type declarations, the README usage example and the runnable scripts now read a name, a record number, a birth date, an address, a phone number, a free-text note or a whole message into a variable, with its synthetic value in a comment, and print only what is safe to log: message types, codes, counts, positions, the precision of a date, warning and error codes, and booleans. The documentation gains a "What is safe to log" section on the warning and fatal codes page, which names `Hl7ParseError.snippet` as the field that carries raw input. The README install section now says that below 1.0 a breaking change can ship in a patch release, so a caret range does not protect you, and shows `pnpm add --save-exact @cosyte/hl7`. No code changed, and a caller changes nothing.
