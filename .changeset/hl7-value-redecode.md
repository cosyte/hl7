---
"@cosyte/hl7": patch
---

Fixed — the value-READ surface no longer double-decodes (HL7-VALUE-REDECODE). Behavior change on a
rare, spec-legal input (pre-alpha).

The tokenizer already unescapes every subcomponent once on parse (parser-02), but `Field.value`, the
dot-path `get()` / `resolvePath`, and the composite coercions (`asXpn`/`asCwe`/`asCx`/… via the shared
`readSubcomponent`, plus `asNm`/`asTs`) ran a **second** `unescape` over the already-decoded value. A
value whose own decoded bytes look like an escape was therefore decoded twice: a wire `\E\F\E\` decodes
once to the literal three characters `\F\`, which the second pass silently turned into the field
separator `|` — a wrong read on rare-but-spec-legal input (found by the HL7-ESC conformance-refuter).

Readers now return the stored (once-decoded) subcomponent verbatim, so `parseHL7(...).field(5).value`
of a wire `A\E\F\E\B` is `A\F\B`, not `A|B`. The common single-escape case is unchanged (a wire `\F\`
still reads `|` — the tokenizer expands it once), and emit stays byte-verbatim (the HL7-ESC raw overlay
is a separate path, untouched). The redundant `unescape` was removed from all five reader sites; the
now-vestigial `enc` params are retained (`_enc`) for composite-parser signature uniformity. New
`test/value-redecode.test.ts` pins the fix at the parse level across all five surfaces plus the emit
round-trip.
