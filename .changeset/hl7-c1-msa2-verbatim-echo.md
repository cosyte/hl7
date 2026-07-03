---
"@cosyte/hl7": patch
---

`buildAck` echoes the full inbound MSH-10 field into MSA-2 (whole-field canonical re-serialization — never component-1 truncation), `interpretAck` reads MSA-2 whole to match, and `reescape` emits a literal CR in decoded content as `\X0D\` instead of corrupting the emitted message's segment framing. New public surface: `Field.text` (canonical field wire text), `downgradePositiveAck`, and `isPositiveAck`.
