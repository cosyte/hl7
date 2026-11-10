---
"@cosyte/hl7": patch
---

A trimmed field stays marked as trimmed when an `onWarning` callback changes the warning it receives, so a trimmed OBX-11 or OBR-25 still classifies as undetermined. Three more places now read a caller's value once: `setField` and `setComposite` write to the segment their lookup found, the typed builders write PID-3 and other repeating fields from the member they checked, and `appointments()` keeps a resource whose segment type answers differently on a second read.
