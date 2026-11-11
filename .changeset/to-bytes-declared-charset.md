---
"@cosyte/hl7": patch
---

`Hl7Message.toBytes()` writes a message as bytes in the character set its MSH-18 declares, so a message read as Latin-1, windows-1252 or another single-byte set and not changed leaves as the bytes it arrived as instead of as UTF-8.

Each set is written the way `parseHL7` reads it: a blank MSH-18, `ASCII` and `UTF-8` as UTF-8; `8859/1` one byte per character; `WINDOWS-1252` and the other ISO 8859 sets the parser decodes through their tables; and a set the parser keeps as a latin1 byte reading (one it does not decode, an unrecognized label, or a strict decode that failed and raised `UNSUPPORTED_CHARSET`) as the bytes that were read. `toBytes({ charset })` writes in another set, as the `charset` option of `parseHL7` reads in one. A character the set cannot hold is never replaced: `toBytes()` throws the new `Hl7EncodeError` (`code: "UNENCODABLE_CHARACTER"`), whose `position` names the segment and field and whose `charset` names the set, never the character. `ToBytesOptions` and `Hl7EncodeErrorCode` are exported types.

What a caller must change: nothing. A caller that wrote `Buffer.from(msg.toString(), "utf8")` can call `msg.toBytes()` to keep the declared set, and should catch `Hl7EncodeError` where a transform may add a character the set lacks.
