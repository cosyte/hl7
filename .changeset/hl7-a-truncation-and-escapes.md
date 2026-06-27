---
"@cosyte/hl7": patch
---

Conformance Phase A — stop rejecting spec-conformant v2.7+ MSH-2 and recognize the standard
escape set so they no longer warn as unknown.

- **5-char MSH-2 (v2.7+ truncation character) parses.** `readDelimiters` previously hard-coded
  MSH-2 length to 4 chars and threw the Tier-3 `INVALID_ENCODING_CHARACTERS` fatal on the v2.7+
  5-char form (`^~\&#` and friends) — rejecting valid input is fail-unsafe. The parser now accepts
  both shapes per HL7 v2 §2.5.5.2. `EncodingCharacters` gains an **optional** `truncation?: string`
  field, set only when MSH-2 actually declared one, so pre-v2.7 messages round-trip a 4-char MSH-2
  unchanged. Serializer + builder emit the 5th char back when present.
- **Standard escape sequences no longer warn as `UNKNOWN_ESCAPE_SEQUENCE`.** `\P\` decodes to
  `enc.truncation ?? "#"` (spec default); `\H\`, `\N\`, the six formatting commands (`\.sp\`,
  `\.in\`, `\.ti\`, `\.fi\`, `\.nf\`, `\.ce\`), and the charset switches (`\Cxxyy\`, `\Mxxyyzz\`)
  are recognized and preserved verbatim so a downstream renderer can decide policy and round-trip
  is byte-exact. `reescape` now emits `\P\` for the truncation char when MSH-2 declared one;
  pre-v2.7 encodings round-trip the character literally. `\Z..\` (vendor-specific) and
  genuinely-malformed bodies still warn + preserve as before.

The `WARNING_CODES` registry is unchanged (snapshot is additions-only). Backward-compatible
patch on the `0.0.x` ladder: a 4-char MSH-2 produces the exact same `EncodingCharacters` shape
as before — `truncation` is omitted (not `undefined`) when not declared.
