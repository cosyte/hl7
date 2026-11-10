---
"@cosyte/hl7": patch
---

`setField` and `setComposite` now treat a hole in a hand-built message's fields, repetitions or components array as an empty position, the way `get` already reads it, instead of throwing an internal-invariant error.
