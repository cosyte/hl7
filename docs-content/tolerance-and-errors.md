---
id: tolerance-and-errors
title: "Tolerance and error handling"
sidebar_label: "Tolerance and errors"
description: "How the parser tolerates real-world deviations in four tiers, and the error and warning types it reports them with."
---

# Tolerance and error handling

## Real-world tolerance

Production HL7 traffic routinely violates the published spec: trailing whitespace, MLLP framing, mixed-case segment names, unknown escape sequences, non-canonical timestamps. A parser that rejects those messages is useless on real integrations. Postel's Law applies: the parser is liberal, the emitter is conservative.

Every deviation the parser encounters is classified into one of four tiers:

| Tier | Behavior       | When                           | Example codes            |
| ---- | -------------- | ------------------------------ | ------------------------ |
| 0    | Silent         | Spec-compliant input           | (none)                   |
| 1    | Auto-handled   | Trivial deviation, no warning  | Trailing whitespace tidy |
| 2    | Warning        | Recoverable deviation          | `MLLP_FRAMING_STRIPPED`  |
| 3    | Fatal (always) | Unrecoverable structural error | `NO_MSH_SEGMENT`         |

Tier-2 warnings are plain data attached to `msg.warnings`. Every warning carries a stable string `code`, a human-readable `message`, and a `position` so you can programmatically react to specific deviations. In `position`, `segmentIndex` counts the message's segments from 0 (MSH is segment 0), while `fieldIndex`, `repetitionIndex`, `componentIndex`, and `subcomponentIndex` are 1-indexed HL7 positions:

```ts runnable
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rZZZ|1");

const [w] = msg.warnings;
w?.code === WARNING_CODES.UNKNOWN_SEGMENT; // => true
w?.position; // => { segmentIndex: 1 }
```

[Warning and fatal codes](./warning-and-fatal-codes.md) lists every Tier-2 code. Compare against
`WARNING_CODES` rather than string literals, so a typo fails to compile.

Need zero tolerance instead? `parseHL7(raw, { strict: true })` escalates every Tier-2 deviation to a thrown `Hl7ParseError` whose `code` is the warning's own code ([When a warning becomes a throw](#when-a-warning-becomes-a-throw)). Use strict in CI validators; leave it off for production ingestion.

The 4 Tier-3 fatal codes (`NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`) always throw regardless of mode. They represent inputs the parser can't meaningfully recover from.

## Error handling

Four kinds of error are thrown, and each is a top-level export or a built-in:

| Error                    | Thrown by                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Hl7ParseError`          | `parseHL7` on one of the four fatal codes, and on any warning under `{ strict: true }`                                |
| `ProfileDefinitionError` | `defineProfile` and `defineConformanceProfile`, for a declaration they refuse                                        |
| `SchemaTargetError`      | `emitMessageSchema`, for a target it does not support                                                                |
| `TypeError`              | a programming error: a malformed dot-path, `setField` on a segment the message lacks, a bad segment name, removing MSH, or a typed builder missing content its message type requires |

`Hl7ParseWarning` is not thrown: it is the data on `msg.warnings`.

### `Hl7ParseError`

Thrown by `parseHL7` when the input hits one of the four Tier-3 fatal codes, or any warning under `{ strict: true }`. Carries positional context plus a short snippet taken from the start of the input (up to 40 characters, plus an ellipsis when truncated).

```ts runnable
import { FATAL_CODES, Hl7ParseError, parseHL7 } from "@cosyte/hl7";

let error: unknown;
try {
  parseHL7("");
} catch (caught) {
  error = caught;
}

error instanceof Hl7ParseError; // => true
(error as Hl7ParseError).code === FATAL_CODES.EMPTY_INPUT; // => true
(error as Hl7ParseError).position; // => { segmentIndex: 0 }
(error as Hl7ParseError).snippet; // => ""
```

`Hl7ParseError.snippet` may contain PHI when parsing real clinical messages. The library does NOT redact it. Redact it at your call site if compliance demands it.

**`snippet` is the only field carrying input verbatim and unfiltered** (capped at 40 characters plus an ellipsis, but not shape-checked in any way), so redact it first.

`message` is bounded but not absolutely content-free, which is worth stating because `message` is what a logger prints by default and what `stack` embeds. A token taken from the input is echoed only when it matches the form the spec defines for it: a three-character segment identifier, an MSH-9 type, an MSH-12 version, or a charset label the closed Table 0211 actually contains. Anything else becomes `<withheld>`. So a message cannot carry a field's value, but it can carry a residue of up to three characters when a malformed line happens to look like a segment identifier. The other shapes are narrower in practice than their patterns allow, because the library only ever feeds them registry-matched values; the patterns themselves admit more (a message type up to 26 characters, a version up to 14), which matters only if you construct warnings yourself.

Under `{ strict: true }` an escalated Tier-2 warning is thrown as an `Hl7ParseError` carrying that same bounded message, plus a `snippet` of the first 40 characters of the input rather than of the deviation's own segment.

### When a warning becomes a throw

Under `{ strict: true }` every Tier-2 warning is thrown as an `Hl7ParseError` whose `code` is **the warning's own code**, such as `UNKNOWN_SEGMENT`, not a member of `FATAL_CODES`. The warning is not also added to `msg.warnings`, and `onWarning` does not fire for it.

So `Hl7ParseError.code` is typed `FatalCode | WarningCode`, not `FatalCode` alone. Test for the fatal codes you handle and treat any other `code` as an escalated warning: `err.code in FATAL_CODES` tells the two apart, and a `switch` over `err.code` that lists the four fatal codes needs a `default` branch.

```ts runnable
import { FATAL_CODES, Hl7ParseError, parseHL7 } from "@cosyte/hl7";

let code: string | undefined;
let fatal: boolean | undefined;
try {
  parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rZZZ|1", { strict: true });
} catch (err) {
  if (err instanceof Hl7ParseError) {
    code = err.code;
    fatal = err.code in FATAL_CODES;
  }
}

code; // => "UNKNOWN_SEGMENT"
fatal; // => false
```

### `Hl7ParseWarning`

Tier-2 deviations: plain data, not thrown. Accumulated on `msg.warnings` and delivered to any `onWarning` callback in parse order. See the example in [Real-world tolerance](#real-world-tolerance).

```ts runnable
import { type Hl7ParseWarning, parseHL7, type WarningCode } from "@cosyte/hl7";

function label(w: Hl7ParseWarning): string {
  const c: WarningCode = w.code;
  switch (c) {
    case "MLLP_FRAMING_STRIPPED":
      return "framed input";
    case "UNKNOWN_SEGMENT":
      return "unknown segment";
    default:
      return c;
  }
}

parseHL7("MSH|^~\\&|A|B|C|D|20260101||ACK|1|P|2.5\rMSA|AA|1\rZZZ|1").warnings.map(label); // => ["unknown segment"]
```

Switch on the `WarningCode` union for exhaustive handling: with a `switch-exhaustiveness-check` lint rule, a missing case is reported.

### `ProfileDefinitionError`

Thrown by `defineProfile()` when the options are structurally invalid, and by `defineConformanceProfile()` for a conformance profile with defects:

```ts runnable
import { defineProfile, ProfileDefinitionError } from "@cosyte/hl7";

let error: unknown;
try {
  defineProfile({
    name: "broken",
    customSegments: { AB: { fields: { foo: 1 } } }, // a custom segment must be a Z-segment
  });
} catch (caught) {
  error = caught;
}

error instanceof ProfileDefinitionError; // => true
(error as ProfileDefinitionError).profileName; // => "broken"
```

The cases that make `defineProfile()` throw:

1. **Missing or non-string `name`**: every profile must identify itself.
2. **Malformed `customSegments` or `segmentOverrides`**: a custom segment must be a Z-segment and an override a standard segment; each field must map to a positive 1-indexed integer; no duplicate field names across merged segments.
3. **Unsupported `dateFormats` tokens**: tokens must be drawn from `SUPPORTED_DATE_TOKENS` (re-exported from the package barrel for introspection).
4. **Unknown option keys**: the options bag is closed; typos throw with "did you mean" hints.

The three error classes, the `FATAL_CODES` and `WARNING_CODES` registries and the `SUPPORTED_DATE_TOKENS` set are all top-level exports.

## Put it to use

- [Validate a message's structure and content](./validate-messages.md)
- [Split batches and stream large files](./split-batches-and-streams.md)
- [Troubleshooting](./troubleshooting.md)
