---
id: warning-and-fatal-codes
title: Warning and fatal codes
sidebar_label: Warning & fatal codes
description: "Every warning code and every fatal code the parser can emit, what each one means, and what the parser did with the message when it emitted it."
---

# Warning and fatal codes

Every deviation the parser notices lands in one of two places, and the split is the whole tolerance
model:

- A **warning** is data on `msg.warnings`. The parse still succeeded and the value is still there.
  Twenty codes, listed below, exported as `WARNING_CODES`.
- A **fatal** is a thrown `Hl7ParseError`. The input is not recoverable as HL7 at all. Four codes,
  listed below, exported as `FATAL_CODES`.

Both registries are a **public, versioned contract**. A code is never renamed under you without a
breaking release, so `w.code === WARNING_CODES.UNKNOWN_SEGMENT` is safe to branch on and safe to
persist. Prefer logging `w.code` and `w.position` over `w.message`: the codes are stable, and the
messages are bounded but not absolutely content-free (see
[Troubleshooting](./troubleshooting.md#known-limitations)).

```ts runnable
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

// A ZZZ segment is not a standard HL7 segment: tolerated, and surfaced as a warning.
const raw = "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ADT^A01|EX00003|P|2.5\rZZZ|1";

const msg = parseHL7(raw);

msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT); // => true
```

## Warnings

Emitted by the parser unless the row says otherwise. Under `{ strict: true }` every one of them is
promoted to a thrown `Hl7ParseError` instead.

| Code                              | What it means                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MLLP_FRAMING_STRIPPED`           | The input arrived wrapped in MLLP transport framing bytes. They were removed before parsing and the message itself is untouched.                    |
| `FIELD_WHITESPACE_TRIMMED`        | Leading or trailing whitespace was trimmed from a field value. The warning carries only the character counts, never the value.                      |
| `UNKNOWN_ESCAPE_SEQUENCE`         | An escape was not recognisable HL7 escape grammar, or ran to end of input unterminated. It is preserved verbatim in the parsed value.               |
| `TIMESTAMP_FALLBACK_FORMAT`       | A timestamp did not match the strict HL7 shape, but a declared or built-in fallback format resolved it. The matched format is named.                |
| `SEGMENT_CASE`                    | A segment identifier carried a lowercase letter. It resolves as the segment it names, and the spelling that arrived is re-emitted unchanged.        |
| `EXTRA_FIELDS`                    | A segment carries more fields than the active profile declares. The extras are preserved on the raw segment rather than dropped.                    |
| `UNKNOWN_SEGMENT`                 | No standard segment carries that name, compared ignoring case, and no active profile claims it as a custom segment either.                          |
| `DUPLICATE_REQUIRED_SEGMENT`      | A segment the active profile marks as a singleton appears more than once. Both copies are kept for you to reconcile.                                |
| `ENCODING_MISMATCH`               | The encoding characters declared in MSH-2 disagree with the separators the later segments actually used.                                            |
| `MISSING_REQUIRED_FIELD`          | A field the active profile marks as required is absent or empty. Distinct from the fatal raised when MSH itself is missing.                         |
| `MISSING_EXPECTED_GROUP`          | The published structure for this message type gives a minimum of one of some segment or group, and the message carries none of it.                  |
| `OUT_OF_ORDER_SEGMENT`            | A segment appears outside the order the active profile declares for it. Nothing is reordered; the deviation is reported.                            |
| `VERSION_MISMATCH`                | MSH-12 declares an HL7 version that differs from the one a profile or the parse options explicitly expected.                                        |
| `UNKNOWN_CHARSET`                 | MSH-18 or a charset override names a value that HL7 Table 0211 does not contain. Bytes are read as latin1 rather than guessed at.                   |
| `UNSUPPORTED_CHARSET`             | A recognised Table 0211 set was not decoded, either because it is out of scope here or because a strict decode of it failed.                        |
| `ACK_NO_CORRELATION_ID`           | The inbound message carried no MSH-10 control id, so the built acknowledgement leaves MSA-2 empty instead of inventing one.                         |
| `MERGE_MISSING_PRIOR_OR_SURVIVOR` | An identity merge or move event is missing one side of the prior and surviving pair, or that side carries no usable identifier.                     |
| `BATCH_COUNT_MISMATCH`            | A batch or file trailer declares a count that differs from what the splitter found. Nothing is dropped to make the numbers agree.                   |
| `BATCH_MISSING_TRAILER`           | An envelope header opened a scope that no matching trailer segment ever closed. The split still returns every message it found.                     |
| `UNTERMINATED_STREAM_MESSAGE`     | The last message in a stream ended with no segment terminator. It is still yielded in full, but the feed may have been cut off.                     |

Three of these are emitted by a surface other than `parseHL7`, and arrive on that surface's own
result rather than on `msg.warnings`: `ACK_NO_CORRELATION_ID` from the acknowledgement builder,
`MERGE_MISSING_PRIOR_OR_SURVIVOR` from `identityEvents()`, and the two batch codes plus
`UNTERMINATED_STREAM_MESSAGE` from `splitBatch()` and `parseStream()`.

## Fatals

Thrown as `Hl7ParseError` regardless of mode. They mean the bytes are not recoverable as HL7, not
that the sender is quirky.

| Code                          | What it means                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NO_MSH_SEGMENT`              | The input carries no MSH header, so there are no delimiters and no message type to read, and nothing that can be parsed.              |
| `MSH_TOO_SHORT`               | The MSH header is truncated before the fields delimiter discovery needs, so the rest of the message cannot be tokenized.              |
| `INVALID_ENCODING_CHARACTERS` | MSH-1 and MSH-2 do not yield a usable delimiter set, so every field boundary in the message would have to be a guess.                 |
| `EMPTY_INPUT`                 | The input was empty, or held nothing but whitespace, so there is no message present to parse in the first place.                      |

Catch the error and read its `code` to tell them apart:

```ts runnable
import { parseHL7, FATAL_CODES, Hl7ParseError } from "@cosyte/hl7";

let matched = false;
try {
  parseHL7("");
} catch (err) {
  matched = err instanceof Hl7ParseError && err.code === FATAL_CODES.EMPTY_INPUT;
}

matched; // => true
```

`Hl7ParseError.snippet` carries up to 40 characters of the raw input verbatim and the library never
redacts it. It is the field to scrub at your logging edge.
