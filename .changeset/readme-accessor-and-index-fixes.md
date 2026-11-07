---
"@cosyte/hl7": patch
---

The README's code examples and indexing notes now match what the library does.

The structural traversal example reads a component through `Field.repetitions` instead of a `component()` method that does not exist, and the `FATAL_CODES` example checks the code inside its `catch` block, so both compile. The dot-path section now says a bracketed index counts from 0, so `OBX[1]` is the second `OBX`; it had said every index was 1-based. The README and the `Hl7Position` documentation comment now say a warning's `segmentIndex` counts from 0, while its field, repetition, component and subcomponent indices are 1-based. MLLP transport now points at `@cosyte/mllp` in place of a package that was never published. No behaviour changes.
