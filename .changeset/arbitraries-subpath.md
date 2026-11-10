---
"@cosyte/hl7": patch
---

New `@cosyte/hl7/arbitraries` entry point: fast-check generators for HL7 v2, so you can property-test your own code on generated messages. `message()` gives parsed, spec-clean messages of the common types over generated encoding characters, with escape sequences, repetitions, components and subcomponents; `messageText()` gives messy text a real sender might produce, which the parser always accepts; `hostileInput()` gives random strings and bytes and broken messages; and `encodingCharacters()`, `escapeSequence()`, `value()`, `component()`, `repetition()`, `field()`, `segment()` and `messageType()` give the parts. Every generated value is synthetic and random. `fast-check` (4.x) is an optional peer dependency: install it to use this entry point. The main entry point never loads it, so nothing changes for code that only imports `@cosyte/hl7`.
