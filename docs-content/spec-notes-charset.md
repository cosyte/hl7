---
id: spec-notes-charset
title: "Spec notes: character-set / encoding decode"
sidebar_label: Character sets (MSH-18)
description: "How the parser resolves the character set declared in MSH-18 and decodes bytes to text before tokenization, and which sets it leaves undecoded."
---

# Spec notes: character-set / encoding decode

`parseHL7` accepts a `Buffer` as well as a `string`. When you hand it bytes, it
resolves the message's declared character set from **MSH-18** and decodes the
byte stream to text **before** delimiter tokenization. So accented and
non-Latin names survive intact instead of turning into mojibake or replacement
characters.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// A message that declares MSH-18 = "UNICODE UTF-8" and carries "Renée". In production the bytes
// usually come from readFileSync or a socket.
const bytes = Buffer.from(
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|ID1|P|2.5||||||UNICODE UTF-8\r" +
    "PID|1||MRN12345^^^HOSP^MR||Renée^Anna",
  "utf8",
);

parseHL7(bytes).get("PID.5.1"); // => "Renée"
bytes.toString("latin1").includes("RenÃ©e"); // => true
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
  These are **recognized** (the escape layer preserves them verbatim:
  no `UNKNOWN_ESCAPE_SEQUENCE`); full stateful ISO-2022 rendering of the switched
  bytes is a documented non-goal (see limitations).

## What is decoded vs preserved

Charset resolution runs through a **frozen Table-0211 registry** (`resolveCharset`),
mirroring `KNOWN_SEGMENTS`, one source of truth for how a code is treated:

| Table-0211 code                                                                     | Treatment                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `8859/1` (and `ISO-8859-1` synonyms)                                                | **decode**: via Node `latin1` (**byte-exact**, never fails)              |
| `ASCII` / blank / `ISO IR6`                                                         | **decode**: strict UTF-8 (a superset; 7-bit is identical)                |
| `UNICODE UTF-8`, `UNICODE`, `UTF-8`                                                 | **decode**: strict UTF-8                                                 |
| `WINDOWS-1252` (and `CP1252`, `X-CP1252`), not a Table-0211 code                    | **decode**: the parser's own windows-1252 table (never fails)            |
| `8859/2` to `8859/8`, `8859/10`, `8859/13` to `8859/16` (and `ISO-8859-N` synonyms) | **decode**: strict `TextDecoder` (C1 range faithful)                     |
| `8859/9`, `8859/11`                                                                 | **preserve verbatim**: no faithful Node decoder (windows-1254/874 alias) |
| `ISO IR14/87/159`, `GB 18030-2000`, `KS X 1001`, `CNS 11643-1992`, `BIG-5`          | **preserve verbatim**: recognized, not decoded                           |
| `UNICODE UTF-16`, `UNICODE UTF-32`                                                  | **preserve verbatim**: recognized, not decoded                           |
| anything else not in Table 0211                                                     | **preserve verbatim**: unrecognized                                      |

`resolveCharset` and `canonicalCharset` are exported for callers that want to
inspect this mapping directly.

**`8859/1` decodes via `latin1`, not `TextDecoder`.** Node's WHATWG
`TextDecoder("iso-8859-1")` is actually **windows-1252**: it remaps the C1 range
(byte `0x80` → `€`, `0x9F` → `Ÿ`), which is _not_ ISO-8859-1. Node's `latin1`
encoding is the true ISO-8859-1 (every byte maps 1:1), so `8859/1` (by far the
most common non-UTF-8 HL7 charset) is decoded byte-exactly.

The same aliasing affects **`8859/9`** (→ windows-1254) and **`8859/11`** (→
windows-874): Node's ICU remaps their C1 range (`0x80` to `0x9F`) to typographic
characters instead of the true ISO code page, and a strict decode does **not**
throw on those bytes: it would silently emit a wrong, non-recoverable character.
Since Node offers no faithful decoder for them, they are **preserved verbatim**
(flagged `UNSUPPORTED_CHARSET`, byte-recoverable) rather than mis-decoded. The
other ISO-8859 sets (`8859/2` to `8859/8`, `10`, `13` to `16`) decode the C1 range
faithfully (audited) and are decoded normally.

## Windows-1252

`WINDOWS-1252` is not in Table 0211, but it is what many senders mean, and some declare it in
MSH-18 or have it configured on the channel. The parser decodes it, apart from `8859/1`: the two
agree on every byte except 0x80 to 0x9F, where `8859/1` keeps the C1 controls and windows-1252 has
typographic characters. Declare it in MSH-18 or ask for it with `options.charset`:

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// Byte 0x80 is the euro sign in windows-1252 and a C1 control in ISO-8859-1. The note ends with
// a placeholder that is then set to that byte.
const bytes = Buffer.from(
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|ID1|P|2.5\r" +
    "PID|1||MRN12345^^^HOSP^MR||Doe^Jane\r" +
    "NTE|1||Copay 10 X",
  "latin1",
);
bytes[bytes.length - 1] = 0x80;

parseHL7(bytes, { charset: "WINDOWS-1252" }).get("NTE.3")?.codePointAt(9); // => 0x20ac
parseHL7(bytes, { charset: "8859/1" }).get("NTE.3")?.codePointAt(9); // => 0x80
```

The decode uses the parser's own copy of the WHATWG Encoding `index-windows-1252` table, not
`TextDecoder`, so it gives the same text on every Node.js build. Bytes 0x80 to 0x9F map as below;
every other byte maps to the code point of the same value, as `latin1` does.

| Bytes        | Code points                                                    |
| ------------ | -------------------------------------------------------------- |
| 0x80 to 0x87 | U+20AC, U+0081, U+201A, U+0192, U+201E, U+2026, U+2020, U+2021 |
| 0x88 to 0x8F | U+02C6, U+2030, U+0160, U+2039, U+0152, U+008D, U+017D, U+008F |
| 0x90 to 0x97 | U+0090, U+2018, U+2019, U+201C, U+201D, U+2022, U+2013, U+2014 |
| 0x98 to 0x9F | U+02DC, U+2122, U+0161, U+203A, U+0153, U+009D, U+017E, U+0178 |

Windows leaves five of those bytes undefined: 0x81, 0x8D, 0x8F, 0x90 and 0x9D. As the WHATWG table
does, they become the C1 control of the same value, so no byte is lost and none raises a warning.
Every byte decodes, so a windows-1252 message never takes the verbatim fail-safe below.

**What changes for a caller.** Before this release `WINDOWS-1252` was an unrecognized label: the
bytes were read as `latin1` and `UNKNOWN_CHARSET` was raised. Now the message is decoded and no
charset warning is raised; `resolveCharset("WINDOWS-1252")` answers `treatment: "decode"`,
`decoder: "windows-1252"` and `recognized: true`. If you re-decoded such fields yourself with
`Buffer.from(value, "latin1")`, drop that step: the value is already text. To write the
message back as windows-1252 bytes, use `toBytes()` (see [Write bytes back](#write-bytes-back)):
a caller who re-encodes the text with `latin1` instead gets different bytes for the Windows
characters from 0x80 to 0x9F, or a refusal from `toBytes({ charset: "8859/1" })`. An `ENCODING_MISMATCH`
between `options.charset` and MSH-18 is raised as before whenever one of them is `WINDOWS-1252`
and the other is not, and its message now shows an MSH-18 of `WINDOWS-1252` instead of
`<withheld>`.

**Why default to UTF-8 for the ASCII/blank case.** For conformant 7-bit content
an ASCII decode and a UTF-8 decode are byte-identical, so honouring "blank =
ASCII" costs nothing, and decoding the default as UTF-8 additionally rescues the
ubiquitous real-world feed that ships UTF-8 without declaring MSH-18. A genuine
ASCII message is never corrupted, and a **non**-UTF-8 byte under that default does
not become `U+FFFD`: it takes the fail-safe below.

## Fail-safe: never guess, never silently corrupt

Decoding is **strict** (`fatal: true`) for every set except byte-exact `8859/1`
and `WINDOWS-1252`, which decode every byte.
A byte that is invalid or undefined for the declared set does **not** silently
become `U+FFFD` (irreversible loss); instead the raw bytes are read as a `latin1`
1:1 mapping and one warning is raised. The same fail-safe covers a charset the
parser does not decode at all:

- **`UNSUPPORTED_CHARSET`**: a _recognized_ Table-0211 code that was not decoded:
  either one this parser never decodes (the multibyte / ISO-2022 East-Asian sets,
  UTF-16/32) **or** a decodable set whose strict decode failed (a byte invalid for
  it, or an ICU build lacking the label).
- **`UNKNOWN_CHARSET`**: a value that is _not_ an HL7 Table-0211 code at all.

Both read the bytes as `latin1`; the distinction is diagnostic. Neither warning
can carry a decoded field value: a label is echoed **only when the Table-0211
registry recognizes it**, and anything else is replaced with `<withheld>`.

That bound is membership rather than spelling for a reason. `UNKNOWN_CHARSET`
fires precisely _when_ a label is absent from the closed table, so at that moment
there is no spec-defined spelling left to test against, and a shape test cannot
tell `UNICODE UTF-8` from a patient name. It matters because MSH-18 is read as
the 18th `|`-token of the text before the first terminator, so on a message
carrying no segment terminators that token is a data field.

**The cost, stated plainly:** `UNKNOWN_CHARSET` now never reports the label it
rejected, because by definition the registry does not recognize it. A sender
declaring `CP850` (a code page outside Table 0211) yields
`Unrecognized character set "<withheld>"`, and the observed label is on no field
of the warning. To identify it, read MSH-18 off the message yourself. That is a
deliberate trade of one diagnostic for a leak that reached a downstream report.

**Recoverability is exact for single-byte content, best-effort for multibyte.**
The HL7 structural bytes (the segment terminator CR (`0x0D`), LF, and the
`|^~\&` delimiters) are 7-bit and unambiguous, so a _single-byte_ undecoded
field's content bytes survive and re-decode downstream via
`Buffer.from(value, "latin1")`. A _multibyte_ code unit, however, can contain a
byte that equals a structural byte (a UTF-16 `0x0D`, say); the tokenizer then
frames on it. That is precisely why multibyte **decode** is deferred rather than
claimed. See the limitations below.

### `options.charset` override

`parseHL7(buf, { charset })` forces the decode charset regardless of MSH-18. When
both are present and **disagree** (after canonicalization, so `UNICODE UTF-8` and
`UTF-8` are treated as equal), an **`ENCODING_MISMATCH`** warning is raised and
the override wins.

## Write bytes back

`toString()` returns text, and `Buffer.from(msg.toString(), "utf8")` writes it as UTF-8 whatever
MSH-18 says. `msg.toBytes()` writes the same text in the set the message declares (the first
repetition of MSH-18), as the reader reads that set, so a message read from bytes and not changed
is written back as the bytes it arrived as:

| Declared set                                                                 | Written as                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| blank, `ASCII`, `UTF-8` (and their synonyms)                                 | UTF-8, the superset the reader decodes the ASCII default with |
| `8859/1`                                                                     | one byte per character, U+0000 to U+00FF                      |
| `WINDOWS-1252`                                                               | the windows-1252 table the reader decodes with                |
| `8859/2` to `8859/8`, `8859/10`, `8859/13` to `8859/16`                      | the byte the reader's strict decode maps to each character    |
| a set kept verbatim (`UNSUPPORTED_CHARSET` or `UNKNOWN_CHARSET` on the read) | one byte per character: the bytes that were read              |

The last row covers a recognized set the reader does not decode, an unrecognized label, and a
decodable set whose strict decode failed on the read: the reader kept those bytes as a latin1
reading and warned, and `toBytes()` writes that reading back unchanged.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

// Byte 0x80 is the euro sign in windows-1252.
const bytes = Buffer.from(
  "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|ID1|P|2.5||||||WINDOWS-1252\r" + "NTE|1||Copay 10 X\r",
  "latin1",
);
bytes[bytes.length - 2] = 0x80;
const msg = parseHL7(bytes);

msg.toBytes().equals(bytes); // => true
msg.setField("NTE.3", "Copay 12 €");
msg.toBytes().at(-2); // => 0x80
```

**Refuse, never replace.** A character the set has no byte for (the euro sign in `8859/1`, `ñ` in
`8859/2`, a lone surrogate in UTF-8, a character above U+00FF in a set kept verbatim) throws an
`Hl7EncodeError` with `code: "UNENCODABLE_CHARACTER"`. Its `position` names the segment and field,
and `charset` the set, by its registry label or `<withheld>` for a label outside the registry; the
character and the field text are never in it. On a Node.js build with no decoder for an ISO 8859
set, a non-ASCII character in that set throws with `code: "UNSUPPORTED_CHARSET"` instead.

```ts runnable throws
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|ID1|P|2.5||||||8859/1\rNTE|1||Copay");
msg.setField("NTE.3", "Copay 12 €");
msg.toBytes(); // throws Hl7EncodeError: segment 1 field 3, character set "8859/1"
```

**`charset` option.** `msg.toBytes({ charset })` writes in that set instead of MSH-18's, as the
same option of `parseHL7` reads in it, and leaves MSH-18 as it is. If you read a message with
`options.charset`, pass the same value to `toBytes` to get its bytes back.

`toBytes()` adds no MLLP framing.

## Known limitations (non-goals)

- **Multibyte / ISO-2022 East-Asian decode.** The JIS (`ISO IR14/87/159`),
  GB 18030, KS X 1001, CNS 11643, and BIG-5 sets are **recognized and preserved
  verbatim**, not decoded. HL7 renders these through stateful `\Mxxyyzz\`
  switches from an ASCII default; stateless whole-buffer decoding would mis-render
  switched content, so correctness is preferred over a lossy guess. Opt-in decode,
  for the case where such a set is the _declared default_, may be added later.
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
  (escape-fidelity work): a preserved `\M…\` decodes losslessly _as text_ but the
  serializer may canonicalize its backslashes.
- **No transliteration** between character sets.

## Warning codes

| Code                  | Meaning                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `UNSUPPORTED_CHARSET` | recognized Table-0211 set not decoded (never-decoded, or a strict-decode failure), bytes read as `latin1` |
| `UNKNOWN_CHARSET`     | value not in Table 0211 (and not `WINDOWS-1252`), bytes read as `latin1`                                  |
| `ENCODING_MISMATCH`   | `options.charset` override disagrees with the declared MSH-18                                             |

## Put it to use

- [Troubleshooting](./troubleshooting.md)
