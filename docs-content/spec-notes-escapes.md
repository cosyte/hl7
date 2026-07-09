---
id: spec-notes-escapes
title: Spec notes — escape sequences & round-trip fidelity (HL7-ESC)
sidebar_label: Escapes & round-trip
---

# Spec notes — escape sequences & round-trip fidelity (HL7-ESC)

HL7 v2 reserves the delimiter characters plus a small escape grammar (HL7 v2
Chapter 2 **§2.7**). `@cosyte/hl7` follows Postel's Law: it **decodes** escapes on
parse so field values read naturally, and it **re-emits spec-clean HL7** on
serialize. The guarantee this note pins is that serialize is **byte-verbatim**
for parsed content — a parsed field re-emits the sender's _exact_ escape bytes,
not a canonicalized equivalent.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(
  "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|ID1|P|2.5\r" +
    "OBX|1|TX|C^T^L||Critical \\H\\value\\N\\ and \\X41\\||||||F",
);

const obx5 = msg.segments("OBX")[0]?.field(5);
obx5?.value; // "Critical \H\value\N\ and A"   — decode-on-read
obx5?.text; // "Critical \H\value\N\ and \X41\" — byte-verbatim on emit
```

## The escape families and how each round-trips

| Family               | Sequences                             | On read (`value`)                                        | On emit (`toString`/`text`)                                  |
| -------------------- | ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **Delimiter**        | `\F\ \S\ \T\ \R\ \E\`                 | decoded to the literal char (`\F\`→`\|`)                 | re-escaped from the decoded char — **byte-exact**            |
| **Newline**          | `\.br\`                               | decoded to `\n`                                          | re-escaped to `\.br\` — **byte-exact**                       |
| **Truncation**       | `\P\` (v2.7+)                         | decoded to MSH-2's truncation char (or spec default `#`) | re-escaped to `\P\` only when MSH-2 declared one             |
| **Hex**              | `\X..\`                               | decoded to the raw byte(s) (`\X41\`→`A`)                 | **re-encoded to the sender's exact `\X..\` bytes** (overlay) |
| **Highlight**        | `\H\ \N\`                             | preserved verbatim (no rendering policy)                 | **verbatim** (overlay)                                       |
| **Formatting**       | `\.sp\ \.in\ \.ti\ \.fi\ \.nf\ \.ce\` | preserved verbatim                                       | **verbatim** (overlay)                                       |
| **Charset switch**   | `\Cxxyy\ \Mxxyyzz\`                   | preserved verbatim (§2.7.4)                              | **verbatim** (overlay)                                       |
| **Vendor / unknown** | `\Z..\`, unrecognized bodies          | preserved verbatim + `UNKNOWN_ESCAPE_SEQUENCE`           | **verbatim** (overlay)                                       |

### The `\X..\` hex policy — decode-on-read, re-encode-on-emit

A hex escape is **decoded on read** (its byte value is what a consumer wants)
but **re-encoded to the sender's original bytes on emit** — including the exact
digit **casing** (`\X0d\` is _not_ normalized to `\X0D\`). Decoding away the
`\X..\` shape and re-emitting the raw byte would be lossy at the wire level: a
byte-level correlation (an ACK's MSA-2 echo against the inbound MSH-10, HL7 v2
§2.9.2.2) would no longer match. The one exception is a decoded **CR** (`\X0D\`
→ `\r`): a bare CR is the HL7 segment separator, so any decoded CR re-emits as
`\X0D\` regardless of how it arrived — emitting it raw would corrupt the wire
framing.

## How it works — the fidelity overlay

The raw tree stores **decoded** subcomponent strings (what every reader —
`Field.value`, the composite parsers, dot-path, `toJSON` — sees). `reescape`
can faithfully invert only the delimiter/newline families, because the
preserve-and-hex families decode to ordinary characters that carry no "I was an
escape" marker (`\H\` decodes to the literal three characters `\`,`H`,`\`, which
`reescape` would double-escape to `\E\H\E\`). So the tokenizer additionally
records the **original wire bytes** of exactly those subcomponents in an
internal `RawComponent.rawSubcomponents` overlay, and the serializer emits from
it verbatim. The overlay is populated **only** for a subcomponent whose decoded
form does not re-escape byte-identically — the common, escape-free message
carries no overlay at all, so its raw tree is unchanged.

`Field.value` (and the whole decoded value/coercion surface) is **unchanged** by
this — the overlay is consulted only on emit. Because parse→emit is now
byte-verbatim, `parseHL7(x).toString()` is a fixpoint for spec-clean input across
the entire escape alphabet, and `buildAck` echoes an escape-bearing MSH-10 into
MSA-2 byte-for-byte.

### Cross-encoding emit — the overlay is same-alphabet only

The overlay holds the sender's **raw bytes in the sender's delimiter alphabet**,
so it is only valid when emit uses that same alphabet. `toString()` and
`Field.text` always emit under the message's own encoding characters, so they are
always safe. `buildAck` is the one place that **re-encodes** — it emits the ACK
with the _default_ alphabet. For a **default-delimiter** inbound (the norm) the
overlay applies and MSA-2 is byte-exact; for a **custom-delimiter** inbound the
overlay is **bypassed** and the decoded control id is re-escaped under default
(spec-clean, and it re-parses back to the same decoded id — correlation-correct
per §2.9.2.2). Emitting the sender's raw bytes verbatim under a different
alphabet would corrupt MSA-2's structure, so it is not done.

## Known limitations

- **Constructed (not parsed) fields have no overlay.** A value set by hand via
  `setField` / the builder re-escapes its decoded string on emit (the only
  correct behavior — there are no original wire bytes to preserve). Byte-verbatim
  fidelity is a property of _parsed_ content.
- **Charset-switch bytes are preserved, not rendered.** `\Cxxyy\` / `\Mxxyyzz\`
  round-trip verbatim, but full stateful ISO-2022 decoding of the switched bytes
  remains a documented non-goal — see [Character sets (MSH-18)](./spec-notes-charset.md).
- **Vendor `\Z..\` escapes are preserved, never interpreted.** They round-trip
  byte-verbatim and raise `UNKNOWN_ESCAPE_SEQUENCE`; a future profile hook may
  register vendor handlers.
