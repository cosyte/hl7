---
"@cosyte/hl7": minor
---

`msg.medications()` now lets you tell a new pharmacy order from a discontinued, held or cancelled one: every medication carries `orderControl`, the ORC-1 order control of the `ORC` that opened its order group, exactly as the sender wrote it.

Before this release the medication view dropped ORC-1, so a `DC` (discontinue) or `OD` order came back looking exactly like an `NW` (new) one. `msg.orders()` and `msg.immunizations()` already carried the same field under the same name.

- Every `RXO`, `RXE`, `RXD` and `RXA` in one order group (from an `ORC` up to the next `ORC`) carries that `ORC`'s code, so the second medication of an `ORC RXO RXE` group is marked too.
- The code is surfaced as sent: an unlisted code such as `ZZ`, or a lowercase `dc`, is returned unchanged, never normalized, rejected or dropped.
- It is never interpreted into an active, held or ended state. What a code means for the order is left to the receiver.
- The key is absent when no `ORC` precedes the medication or ORC-1 is empty. It is never carried over from an earlier group, and an `ORC` after the last medication lends its code to nothing.
- The `ORC-7` legacy timing is unchanged: it is still read by the first medication of the group only.
