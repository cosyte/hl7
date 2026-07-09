---
"@cosyte/hl7": patch
---

PHI-safety fix — warning messages no longer embed field-body content (HL7-TOKENIZE-PHI).

`fieldWhitespaceTrimmed` and `unknownEscapeSequence` embedded slices of the field body directly in
`Hl7ParseWarning.message`, so a clinical NTE-3/OBX-5 free-text value (PHI) carrying a stray `\` or
leading/trailing whitespace could surface a payload fragment in `Hl7Message.warnings` — a surface
every other warning builder in the parser deliberately keeps structural-facts-only.

- **`fieldWhitespaceTrimmed(position, leadingCount, trailingCount)`** (signature changed) now
  reports only the leading/trailing whitespace **counts** trimmed (e.g. `"Field had 2 leading + 1
trailing whitespace character(s) trimmed."`), never the field value before or after trimming.
- **`unknownEscapeSequence(position, body)`** now reports the escape body's **length**, and names
  its **type letter only when the body's first character is a recognized HL7 escape-identifier**
  (`F S T R E X C M Z H N` or a `.`-prefixed formatting escape — structural HL7 grammar, not PHI —
  e.g. `\Zsecret\` → `type "Z" (7 chars)`, never `"secret"`). A body that doesn't start with a
  known escape letter is untrusted field text and names no character at all.
- **New `unterminatedEscapeSequence(position)`** factory (still `UNKNOWN_ESCAPE_SEQUENCE`) for the
  unterminated-escape case, where the "body" is the rest of the field — it reports neither content
  nor a length (a length would itself leak field-shape information), only that an unterminated
  escape was found.

**No behavior change to parsing or round-trip fidelity** — the escape sequence and the
leading/trailing whitespace are still preserved verbatim in the parsed/emitted output; only the
human-readable WARNING **message** changed. The `WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE` /
`FIELD_WHITESPACE_TRIMMED` codes are unchanged and stable — this is a message-format fix, not a
breaking change to the public code registry (confirmed by the unchanged
`test/warning-codes.snapshot.test.ts`).
