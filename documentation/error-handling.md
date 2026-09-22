# Error Handling

The three error types the library throws, what each carries, and how to narrow on them. The four-tier model the codes come from is in [Real-World Tolerance](./real-world-tolerance.md).

### `Hl7ParseError`

Thrown by `parseHL7` when the input hits one of the 4 Tier-3 fatal codes (see above). Carries positional context plus a short snippet taken from the start of the input (up to 40 characters, plus an ellipsis when truncated).

```ts
import { parseHL7, Hl7ParseError, FATAL_CODES } from "@cosyte/hl7";

try {
  parseHL7("");
} catch (err) {
  if (err instanceof Hl7ParseError) {
    console.log(err.code); // "EMPTY_INPUT"
    console.log(err.position); // { segmentIndex: 0 }
    console.log(err.snippet); // "" (first 40 chars of input, for logging)
  }
}

// Narrow exhaustively with the FATAL_CODES registry:
if (err instanceof Hl7ParseError && err.code === FATAL_CODES.NO_MSH_SEGMENT) {
  // ...
}
```

`Hl7ParseError.snippet` may contain PHI when parsing real clinical messages. The library does NOT redact it. Redact it at your call site if compliance demands it.

**`snippet` is the only field carrying input verbatim and unfiltered** (capped at 40 characters plus an ellipsis, but not shape-checked in any way), so redact it first.

`message` is bounded but not absolutely content-free, which is worth stating because `message` is what a logger prints by default and what `stack` embeds. A token taken from the input is echoed only when it matches the form the spec defines for it: a three-character segment identifier, an MSH-9 type, an MSH-12 version, or a charset label the closed Table 0211 actually contains. Anything else becomes `<withheld>`. So a message cannot carry a field's value, but it can carry a residue of up to three characters when a malformed line happens to look like a segment identifier. The other shapes are narrower in practice than their patterns allow, because the library only ever feeds them registry-matched values; the patterns themselves admit more (a message type up to 26 characters, a version up to 14), which matters only if you construct warnings yourself.

Under `{ strict: true }` an escalated Tier-2 warning is thrown as an `Hl7ParseError` carrying that same bounded message, plus a `snippet` of the first 40 characters of the input rather than of the deviation's own segment.

### `Hl7ParseWarning`

Tier-2 deviations: plain data, not thrown. Accumulated on `msg.warnings` and delivered to any `onWarning` callback in parse order. See the iteration example in [Real-World Tolerance](./real-world-tolerance.md).

```ts
import type { Hl7ParseWarning, WarningCode } from "@cosyte/hl7";

function label(w: Hl7ParseWarning): string {
  const c: WarningCode = w.code;
  switch (c) {
    case "MLLP_FRAMING_STRIPPED":
      return "framed input";
    case "UNKNOWN_SEGMENT":
      return `unknown: ${w.message}`;
    default:
      return c;
  }
}
```

Use the `WarningCode` union + `switch` for exhaustive handling: the type system catches missing cases if you enable `switch-exhaustiveness-check`.

### `ProfileDefinitionError`

Thrown by `defineProfile()` when the options are structurally invalid. Covers the four failure modes locked by the profile system:

```ts
import { defineProfile, ProfileDefinitionError } from "@cosyte/hl7";

try {
  defineProfile({
    name: "broken",
    customSegments: {
      AB: { fields: { foo: 1 } }, // bad: segment name must match /^Z[A-Z0-9]{2}$/ or similar
    },
  });
} catch (err) {
  if (err instanceof ProfileDefinitionError) {
    console.log(err.profileName); // "broken"
    console.log(err.message); // actionable diagnostic
  }
}
```

The four cases that throw `ProfileDefinitionError`:

1. **Missing or non-string `name`**: every profile must identify itself.
2. **Malformed `customSegments`**: segment name must pass the Z-segment regex; each field entry must map to a positive 1-indexed integer; no duplicate field names across merged segments.
3. **Unsupported `dateFormats` tokens**: tokens must be drawn from `SUPPORTED_DATE_TOKENS` (re-exported from the package barrel for introspection).
4. **Unknown option keys**: the options bag is closed; typos throw with "did you mean" hints.

All three error types (and the `FATAL_CODES` / `WARNING_CODES` registries, and the `SUPPORTED_DATE_TOKENS` set) are top-level exports: no internal reaching required.
