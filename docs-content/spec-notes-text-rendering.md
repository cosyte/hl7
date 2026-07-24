---
id: spec-notes-text-rendering
title: "Spec notes: formatted-text rendering & the text codec (HL7-R)"
sidebar_label: Text rendering & codec
---

# Spec notes: formatted-text rendering & the text codec (HL7-R)

The lenient parser **decodes** delimiter, hex, and `\.br\` escapes on read but
deliberately **preserves** the presentational ones (`\H\`/`\N\` highlight, the
`\.sp\`/`\.in\`/… formatting commands, charset switches, vendor `\Z..\`) as
un-rendered sentinels. See [Escapes & round-trip](./spec-notes-escapes.md).
That is correct for a tolerant parser, but a clinical narrative surfaced to a
human with raw `\.br\` / `\H\` sentinels in it is **misread**. Phase R adds an
opt-in **rendering + encoding layer** on top of the unchanged raw values:

- **`renderText`** turns HL7 v2 §2.7 escape/formatting-bearing content into a
  normalized **display model**: plain text plus highlight-aware runs.
- a first-class **text codec** (`decodeText` / `encodeText`, also bundled as the
  `text` namespace) gets the human string out of a field and, crucially, encodes
  an arbitrary string **in** without ever injecting a delimiter.

Neither changes the raw parse output. Rendering is a **read projection** and the
tolerant extraction is byte-for-byte what it always was (Postel's Law).

## Rendering a formatted note

```ts runnable
import { renderText } from "@cosyte/hl7";

const r = renderText("Specimen received.\\.br\\Result is \\H\\HIGH\\N\\.");

r.text; // => "Specimen received.\nResult is HIGH."
r.runs; // => [{ text: "Specimen received.\nResult is ", highlighted: false }, { text: "HIGH", highlighted: true }, { text: ".", highlighted: false }]
r.unrenderedSequences; // => []
```

`Field.render()` is the one-call form on a parsed field:

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260701100000||ORU^R01|1|P|2.5\r" +
  "OBX|1|TX|N^Narrative^L||Gross exam unremarkable.\\.sp\\Microscopic pending.||||||F";

parseHL7(raw).segments("OBX")[0]?.field(5).render().text; // => "Gross exam unremarkable.\nMicroscopic pending."
```

### Normalization policy (conservative, not a page-layout engine)

Confirmed firsthand against HL7 v2 Chapter 2 §2.7 (v2.5.1 + v2.8.2; section
numbers shift by version):

| Escape                    | §       | Rendered as                                          |
| ------------------------- | ------- | ---------------------------------------------------- |
| `\F\ \S\ \T\ \R\ \E\ \P\` | 2.7.1   | the literal delimiter / escape / truncation char     |
| `\Xdddd…\`                | 2.7.5/6 | the decoded byte(s) (hex digit **pairs**)            |
| `\H\` / `\N\`             | 2.7.1   | dropped from `text`; toggles a `highlighted` run     |
| `\.br\` / `\.ce\`         | 2.7.6/7 | one line break                                       |
| `\.sp\` / `\.sp <n>\`     | 2.7.6/7 | `n` line breaks (default 1)                          |
| `\.sk\` / `\.sk <n>\`     | 2.7.6/7 | `n` spaces (default 1)                               |
| `\.in <n>\` / `\.ti <n>\` | 2.7.6/7 | dropped (indentation, exact column math is a defer) |
| `\.fi\` / `\.nf\`         | 2.7.6/7 | dropped (word-wrap mode toggle, no content)         |

A formatting sentinel is **never** left in the rendered `text`. Pass the wire
form (`Field.text`, byte-verbatim for parsed content) for the most faithful
result; a pre-decoded `Field.value` also renders correctly (its `\.br\` is
already a newline).

## Never fabricates: unrenderable escapes are preserved + flagged

A charset switch, a vendor `\Z..\`, or a malformed / unterminated escape cannot
be rendered without guessing, so `renderText` keeps its **literal characters**
in the output and records it in `unrenderedSequences`. Nothing is ever silently
dropped or replaced with an invented glyph.

```ts runnable
import { renderText } from "@cosyte/hl7";

const r = renderText("interpret \\Z9\\ per site agreement");

r.text; // => "interpret \\Z9\\ per site agreement"
r.unrenderedSequences; // => ["\\Z9\\"]
```

## The text codec: decode, and encode-safe

`decodeText` resolves delimiter/hex/`\.br\` escapes (no warning plumbing to wire
up); `encodeText` is the **encode-safe** direction and the primitive the typed
emit surface builds on. Every reserved character (the escape char first, then
the field / component / subcomponent / repetition separators, the truncation
char, and framing-critical CR/LF) is replaced by its escape sequence, so an
arbitrary value **cannot break out of its field**.

```ts runnable
import { encodeText, decodeText, parseHL7 } from "@cosyte/hl7";

const hostile = "a|b^c~d\\e&f";

encodeText(hostile); // => "a\\F\\b\\S\\c\\R\\d\\E\\e\\T\\f"
decodeText(encodeText(hostile)); // => "a|b^c~d\\e&f"

// Placed in a field, it re-parses to exactly itself, no forged boundary:
const msg = parseHL7(`MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rNTE|1||${encodeText(hostile)}`);
msg.segments("NTE")[0]?.field(3).value; // => "a|b^c~d\\e&f"
```

The invariant `decodeText(encodeText(s)) === s`, and whole-field re-parse with
no delimiter injection, are property-tested over arbitrary strings. Two caveats
are inherent to HL7 field encoding (not the codec): the two-character token `""`
is HL7's explicit null, and the default parser trims field whitespace, so a
value that is exactly `""` or has leading/trailing spaces re-parses null/trimmed
at the **field** level. Encode into a component/subcomponent position (or parse
with trimming off) to preserve those exactly; the no-injection guarantee is
unaffected.

## Known limitations

- **Not a page-layout engine.** Highlight is a boundary marker, not a style;
  indentation is normalized away (exact column math is a defer); no RTF/HTML
  output.
- **Charset switches are preserved, not applied.** `\Cxxyy\` / `\Mxxyyzz\` need
  stateful ISO-2022 decoding that remains a documented non-goal. They render as
  their literal characters and are flagged in `unrenderedSequences`.
- **Rendering is opt-in.** `Field.value` / `toString()` and the whole raw
  extraction surface are unchanged; `renderText` never mutates them.
