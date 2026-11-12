---
"@cosyte/hl7": patch
---

The README usage example no longer prints a patient's record number, name or birth date.

It reads them into variables, with their synthetic values in comments, and prints only what is safe to log: the message type, a location code, booleans, a count and the precision of the birth date. The documentation gains a "What is safe to log" section on the warning and fatal codes page, which names `Hl7ParseError.snippet` as the field that carries raw input. The README install section now says that below 1.0 a breaking change can ship in a patch release, so a caret range does not protect you, and shows `pnpm add --save-exact @cosyte/hl7`. No code changed, and a caller changes nothing.
