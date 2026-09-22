# Real-World Tolerance

The four-tier model the parser classifies every deviation into, and how to turn tolerance off.

Production HL7 traffic routinely violates the published spec: trailing whitespace, MLLP framing, mixed-case segment names, unknown escape sequences, non-canonical timestamps. A parser that rejects those messages is useless on real integrations. Postel's Law applies: the parser is liberal, the emitter is conservative.

Every deviation the parser encounters is classified into one of four tiers:

| Tier | Behavior       | When                           | Example codes            |
| ---- | -------------- | ------------------------------ | ------------------------ |
| 0    | Silent         | Spec-compliant input           | (none)                   |
| 1    | Auto-handled   | Trivial deviation, no warning  | Trailing whitespace tidy |
| 2    | Warning        | Recoverable deviation          | `MLLP_FRAMING_STRIPPED`  |
| 3    | Fatal (always) | Unrecoverable structural error | `NO_MSH_SEGMENT`         |

Tier-2 warnings are plain data attached to `msg.warnings`. Every warning carries a stable string `code`, a human-readable `message`, and a `position` with 1-indexed `segmentIndex`/`fieldIndex`/etc. so you can programmatically react to specific deviations:

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
for (const w of msg.warnings) {
  console.log(`${w.code} at segment ${w.position.segmentIndex}: ${w.message}`);
}
```

The full list of Tier-2 codes lives in [`src/parser/warnings.ts`](../src/parser/warnings.ts). Narrow on `w.code === WARNING_CODES.UNKNOWN_SEGMENT` (and friends) for typo-free comparisons.

Need zero tolerance instead? `parseHL7(raw, { strict: true })` escalates every Tier-2 deviation to a thrown `Hl7ParseError`. Use strict in CI validators; leave it off for production ingestion.

The 4 Tier-3 fatal codes (`NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`) always throw regardless of mode. They represent inputs the parser can't meaningfully recover from.
