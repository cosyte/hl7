---
"@cosyte/hl7": patch
---

A `Buffer` message declared or read as `WINDOWS-1252` is now decoded to text, so the euro sign, curly quotes and the other characters at bytes 0x80 to 0x9F arrive as themselves instead of as C1 controls.

`WINDOWS-1252` (with `CP1252` and `X-CP1252`) is a newly recognised value for MSH-18, the `charset` parse option and `resolveCharset`, which now answers `{ canonical: "WINDOWS-1252", treatment: "decode", decoder: "windows-1252", recognized: true }` for it. The parser decodes it with its own copy of the WHATWG Encoding table, so every Node.js build gives the same text; the five bytes Windows leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) become the C1 control of the same value. `8859/1` and its synonyms keep their byte-exact latin1 reading, and an `options.charset` that disagrees with MSH-18 still raises `ENCODING_MISMATCH`.

What a caller must change: such a message no longer raises `UNKNOWN_CHARSET`, and its fields are no longer latin1 byte readings. If you re-decoded them yourself with `Buffer.from(value, "latin1")`, drop that step, and stop counting on `UNKNOWN_CHARSET` to flag these feeds.
