---
"@cosyte/hl7": patch
---

Character-set / encoding decode — MSH-18 / Table 0211 (roadmap Phase O). `parseHL7`
resolves a Buffer's declared charset from MSH-18 (repeating, first = default, blank
= ASCII) through a frozen Table-0211 registry and decodes before tokenization:
`8859/1` via Node's byte-exact `latin1` (not the windows-1252 `TextDecoder`
alias), ASCII / UTF-8, and `8859/2`–`8859/16`. Recognized multibyte / ISO-2022
East-Asian sets and UTF-16/32 are preserved verbatim. Fail-safe: decoding is strict
(`fatal: true`) except byte-exact `8859/1`, so a byte invalid for the declared set
is never a silent `U+FFFD` — bytes are read as `latin1` and a warning fires (new
`UNSUPPORTED_CHARSET` for a recognized set not decoded, incl. a strict-decode
failure; `UNKNOWN_CHARSET`, now `latin1`-preserving, for a non-Table-0211 value).
Single-byte content is byte-recoverable; multibyte framing is best-effort
(documented). Exports `resolveCharset` / `canonicalCharset`. New public warning
code `UNSUPPORTED_CHARSET`.
