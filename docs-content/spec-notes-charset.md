---
id: spec-notes-charset
title: "Spec notes: character-set / encoding decode (Phase O)"
sidebar_label: Character sets (MSH-18)
---

# Spec notes: character-set / encoding decode (Phase O)

`parseHL7` accepts a `Buffer` as well as a `string`. When you hand it bytes, it
resolves the message's declared character set from **MSH-18** and decodes the
byte stream to text **before** delimiter tokenization. So accented and
non-Latin names survive intact instead of turning into mojibake or replacement
characters.

```ts
import { parseHL7 } from "@cosyte/hl7";
import { readFileSync } from "node:fs";

// A message that declares MSH-18 = "UNICODE UTF-8" and carries "Renée".
const msg = parseHL7(readFileSync("adt.hl7")); // Buffer, not a string
msg.get("PID.5.1"); // "Renée"  ✅ (not "RenÃ©e")
```

Pass a `string` and nothing here runs. The caller already decoded, and the
parser trusts that decision.

## Spec traceability

HL7 v2 Chapter 2:

- **MSH-18 Character Set** (item 00692), value set **Table 0211** (OID
  `2.16.840.1.113883.18.116`). MSH-18 is a **repeating** field: the **first**
  occurrence is the message's default encoding; later occurrences are the
  alternates a message activates mid-stream. A **blank** MSH-18 means **7-bit
  ASCII** (the default repertoire, ISO IR6).
- **§2.7.4 (charset-switch escapes):** `\Cxxyy\` (single-byte) and
  `\Mxxyyzz\` (multi-byte; `zz` optional) name an alternate repertoire inline.
  These are **recognized** (the escape layer, Phase A, preserves them verbatim:
  no `UNKNOWN_ESCAPE_SEQUENCE`); full stateful ISO-2022 rendering of the switched
  bytes is a documented non-goal (see limitations).

## What is decoded vs preserved

Charset resolution runs through a **frozen Table-0211 registry** (`resolveCharset`),
mirroring `KNOWN_SEGMENTS`, one source of truth for how a code is treated:

| Table-0211 code | Treatment |
| --- | --- |
| `8859/1` (and `ISO-8859-1` synonyms) | **decode**: via Node `latin1` (**byte-exact**, never fails) |
| `ASCII` / blank / `ISO IR6` | **decode**: strict UTF-8 (a superset; 7-bit is identical) |
| `UNICODE UTF-8`, `UNICODE`, `UTF-8` | **decode**: strict UTF-8 |
| `8859/2`–`8859/8`, `8859/10`, `8859/13`–`8859/16` (and `ISO-8859-N` synonyms) | **decode**: strict `TextDecoder` (C1 range faithful) |
| `8859/9`, `8859/11` | **preserve verbatim**: no faithful Node decoder (windows-1254/874 alias) |
| `ISO IR14/87/159`, `GB 18030-2000`, `KS X 1001`, `CNS 11643-1992`, `BIG-5` | **preserve verbatim**: recognized, not decoded |
| `UNICODE UTF-16`, `UNICODE UTF-32` | **preserve verbatim**: recognized, not decoded |
| anything not in Table 0211 | **preserve verbatim**: unrecognized |

`resolveCharset` and `canonicalCharset` are exported for callers that want to
inspect this mapping directly.

**`8859/1` decodes via `latin1`, not `TextDecoder`.** Node's WHATWG
`TextDecoder("iso-8859-1")` is actually **windows-1252**: it remaps the C1 range
(byte `0x80` → `€`, `0x9F` → `Ÿ`), which is *not* ISO-8859-1. Node's `latin1`
encoding is the true ISO-8859-1 (every byte maps 1:1), so `8859/1` (by far the
most common non-UTF-8 HL7 charset) is decoded byte-exactly.

The same aliasing affects **`8859/9`** (→ windows-1254) and **`8859/11`** (→
windows-874): Node's ICU remaps their C1 range (`0x80`–`0x9F`) to typographic
characters instead of the true ISO code page, and a strict decode does **not**
throw on those bytes: it would silently emit a wrong, non-recoverable character.
Since Node offers no faithful decoder for them, they are **preserved verbatim**
(flagged `UNSUPPORTED_CHARSET`, byte-recoverable) rather than mis-decoded. The
other ISO-8859 sets (`8859/2`–`8859/8`, `10`, `13`–`16`) decode the C1 range
faithfully (audited) and are decoded normally.

**Why default to UTF-8 for the ASCII/blank case.** For conformant 7-bit content
an ASCII decode and a UTF-8 decode are byte-identical, so honouring "blank =
ASCII" costs nothing, and decoding the default as UTF-8 additionally rescues the
ubiquitous real-world feed that ships UTF-8 without declaring MSH-18. A genuine
ASCII message is never corrupted, and a **non**-UTF-8 byte under that default does
not become `U+FFFD`: it takes the fail-safe below.

## Fail-safe: never guess, never silently corrupt

Decoding is **strict** (`fatal: true`) for every set except byte-exact `8859/1`.
A byte that is invalid or undefined for the declared set does **not** silently
become `U+FFFD` (irreversible loss); instead the raw bytes are read as a `latin1`
1:1 mapping and one warning is raised. The same fail-safe covers a charset the
parser does not decode at all:

- **`UNSUPPORTED_CHARSET`**: a *recognized* Table-0211 code that was not decoded:
  either one this parser never decodes (the multibyte / ISO-2022 East-Asian sets,
  UTF-16/32) **or** a decodable set whose strict decode failed (a byte invalid for
  it, or an ICU build lacking the label).
- **`UNKNOWN_CHARSET`**: a value that is *not* an HL7 Table-0211 code at all.

Both read the bytes as `latin1`; the distinction is diagnostic. Both warnings
carry the **charset code only**, never a decoded field value, so no PHI is
exposed.

**Recoverability is exact for single-byte content, best-effort for multibyte.**
The HL7 structural bytes (the segment terminator CR (`0x0D`), LF, and the
`|^~\&` delimiters) are 7-bit and unambiguous, so a *single-byte* undecoded
field's content bytes survive and re-decode downstream via
`Buffer.from(value, "latin1")`. A *multibyte* code unit, however, can contain a
byte that equals a structural byte (a UTF-16 `0x0D`, say); the tokenizer then
frames on it. That is precisely why multibyte **decode** is deferred rather than
claimed. See the limitations below.

### `options.charset` override

`parseHL7(buf, { charset })` forces the decode charset regardless of MSH-18. When
both are present and **disagree** (after canonicalization, so `UNICODE UTF-8` and
`UTF-8` are treated as equal), an **`ENCODING_MISMATCH`** warning is raised and
the override wins.

## Known limitations (non-goals of this phase)

- **Multibyte / ISO-2022 East-Asian decode.** The JIS (`ISO IR14/87/159`),
  GB 18030, KS X 1001, CNS 11643, and BIG-5 sets are **recognized and preserved
  verbatim**, not decoded. HL7 renders these through stateful `\Mxxyyzz\`
  switches from an ASCII default; stateless whole-buffer decoding would mis-render
  switched content, so correctness is preferred over a lossy guess. A future phase
  may add opt-in decode when such a set is the *declared default*.
- **Multibyte framing on the verbatim path.** A recognized-but-undecoded set is
  read as `latin1` and still tokenized, so a content byte that equals an HL7
  structural byte (the segment terminator CR (`0x0D`) / LF (`0x0A`), or a
  `|^~\&` delimiter) is framed as structure. This applies to **every** verbatim
  set (UTF-16/32 code units routinely embed `0x0D`/`0x0A`; the East-Asian DBCS
  sets less so) and to the `UNKNOWN_CHARSET` path. Byte-recoverability therefore
  holds for **single-byte** content only; multibyte framing is best-effort, which
  is why decode is deferred. The `UNSUPPORTED_CHARSET` / `UNKNOWN_CHARSET` warning
  flags that the charset was not decoded.
- **Charset switch escapes are recognized, not applied.** `\Cxxyy\` / `\Mxxyyzz\`
  pass through preserved; the switched bytes are not re-rendered into the target
  repertoire.
- **Byte-verbatim re-emit of a preserved charset escape** is tracked separately
  (escape-fidelity work): a preserved `\M…\` decodes losslessly *as text* but the
  serializer may canonicalize its backslashes.
- **No transliteration** between character sets.

## Warning codes

| Code | Meaning |
| --- | --- |
| `UNSUPPORTED_CHARSET` | recognized Table-0211 set not decoded (never-decoded, or a strict-decode failure), bytes read as `latin1` |
| `UNKNOWN_CHARSET` | value not in Table 0211, bytes read as `latin1` |
| `ENCODING_MISMATCH` | `options.charset` override disagrees with the declared MSH-18 |
