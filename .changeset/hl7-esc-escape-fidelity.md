---
"@cosyte/hl7": patch
---

Escape-fidelity round-trip — serialize now re-emits a parsed field's escapes **byte-verbatim**
across the full HL7 v2 §2.7 alphabet (HL7-ESC).

The decoded tree conflated recognize-and-preserve escapes (`\H\`/`\N\` highlight, `\.sp\`-family
formatting, `\Cxxyy\`/`\Mxxyyzz\` charset switches, vendor `\Z..\`) and hex escapes (`\X41\`) with
literal backslashes, so emit **double-escaped** the former (`\H\` → `\E\H\E\`) and **decoded** the
latter (`\X41\` → `A`; non-canonical casing `\X0d\` → `\X0D\`). Output was spec-clean and
lossless-as-text but not byte-verbatim — enough to break a byte-level MSA-2/MSH-10 correlation
(HL7 v2 §2.9.2.2).

- **Fidelity overlay.** The tokenizer now records the **original wire bytes** of any subcomponent
  whose decoded form does not re-escape byte-identically, in an internal
  `RawComponent.rawSubcomponents` overlay; the serializer emits from it verbatim. Populated only
  for the affected subcomponents — an escape-free message carries no overlay and its raw tree is
  unchanged.
- **`\X..\` policy: decode-on-read, re-encode-on-emit.** The decoded value keeps the byte value;
  the wire form (including digit casing) is preserved on emit. A decoded CR still re-emits as
  `\X0D\` to protect segment framing.
- **`buildAck` MSA-2** echoes an escape-bearing inbound MSH-10 byte-for-byte for a default-delimiter
  sender; a custom-delimiter sender is re-delimited spec-cleanly (the overlay is bypassed when the
  ACK's encoding differs from the inbound's, since the sender's raw bytes would corrupt MSA-2's
  structure under default delimiters — the decoded id re-parses back correlation-correct per
  §2.9.2.2). Delimiter/newline escapes are unaffected (they already round-tripped through `reescape`).
- **No public-surface break.** `Field.value`, the composite parsers, dot-path reads, and `toJSON`
  return the same decoded values as before; the overlay is `@internal` and consulted only on emit.
  `Field.text` and `toString()` are now byte-verbatim for parsed content (a hand-built field with no
  overlay still re-escapes its decoded value). See `docs-content/spec-notes-escapes.md`.
