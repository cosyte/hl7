# Cookbook: framing, batches, streams and validation

Getting messages out of a feed, telling them apart, and checking them against a published structure or your own profile.

### Stripping MLLP framing

MLLP (Minimum Lower Layer Protocol) wraps HL7 messages in VT / FS / CR bytes for TCP transport. The parser strips them by default and emits a `MLLP_FRAMING_STRIPPED` warning so you know preprocessing happened.

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(mllpFramed);
const framed = msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED);
console.log(framed); // true if input had VT/FS/CR framing

// Disable preprocessing if your input is guaranteed framing-free:
parseHL7(raw, { stripMllpFraming: false });
```

Strip behaviour is idempotent: calling `parseHL7` on already-stripped input is a no-op. The parser does NOT add MLLP framing on `toString()`; if you need it for transport, prepend/append the bytes in your transport layer (a future `@cosyte/hl7-mllp` package will cover network IO end to end).

### Batch files

Real lab / ELR / IIS feeds ship many messages wrapped in the HL7 v2 batch envelope (`[FHS] { [BHS] { MSH… } [BTS] } [FTS]`). `splitBatch()` demarcates the individual messages by `MSH` boundary and hands each one back **already parsed**: a malformed message mid-stream is isolated (returned as a typed failure), never suppressing its siblings, and the declared BTS-1 / FTS-1 counts are reconciled without ever dropping the tail.

```ts
import { splitBatch } from "@cosyte/hl7";

const { messages, warnings } = splitBatch(rawBatchFile);

for (const entry of messages) {
  if (entry.ok) {
    handle(entry.message); // a fully-parsed Hl7Message
  } else {
    quarantine(entry.raw, entry.error.code); // isolated, not dropped
  }
}

// Batch-level warnings carry counts/positions only, never PHI.
for (const w of warnings) {
  // BATCH_COUNT_MISMATCH: declared BTS-1/FTS-1 ≠ actual (tail still returned)
  // BATCH_MISSING_TRAILER: a BHS/FHS header with no matching BTS/FTS
}
```

A **bare single message** (no envelope) passes straight through as a one-message result. `splitBatch` is a splitter, not an enforcer: it warns on a missing trailer but leaves accept/reject to you (a profile such as IIS may mandate the full frame), does not generate batch ACKs, and does not de-batch across transport framing (that is [`@cosyte/mllp`](https://github.com/cosyte/mllp)). The second argument is forwarded to `parseHL7` per message (profile, `strict`, `charset`). See the [batch spec notes](../docs-content/spec-notes-batch.md) for the full traceability + known limitations.

### Streaming large files (`parseStream`)

`splitBatch` needs the whole file in memory. For a feed or file too large to buffer (or a live source) `parseStream()` parses **incrementally**: it consumes a chunked source (a Node `Readable`, an async-iterable, or an iterable of `string`/`Buffer` chunks) and **yields one message per `MSH` boundary as it completes**, holding only **O(one message)** of state. A message split across chunk boundaries (mid-segment, mid-field, even mid-`MSH|^~\&`) is reassembled: feeding the same bytes in 1-byte chunks or one big chunk yields identical messages.

```ts
import { createReadStream } from "node:fs";
import { parseStream, WARNING_CODES } from "@cosyte/hl7";

for await (const entry of parseStream(createReadStream("elr-feed.hl7"))) {
  if (entry.ok) {
    handle(entry.message); // released before the next is read: bounded memory
  } else {
    quarantine(entry.raw, entry.error.code); // isolated; the tail still streams
  }
  // Stream-level (not per-message) diagnostics, never PHI:
  for (const w of entry.streamWarnings) {
    // UNTERMINATED_STREAM_MESSAGE: the final message had no terminator (truncated feed?)
  }
}
```

Each message is parsed by `parseHL7` (no second grammar; the same second argument is forwarded per message), so a streamed message is byte-for-byte what `splitBatch` would produce for the same bytes. A malformed message mid-stream is an isolated typed failure entry (it **never suppresses** later messages) and an unterminated final message is still yielded in full, flagged (never thrown). Batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) act as boundaries and are never yielded, so the yielded count equals the `MSH` count; envelope **count reconciliation** stays `splitBatch`'s job. Transport framing (MLLP) is out of scope: this consumes an already-de-framed stream; the wire is [`@cosyte/mllp`](https://github.com/cosyte/mllp)'s. See the [streaming spec notes](../docs-content/spec-notes-stream.md).

### Detect message type

`msg.meta` exposes MSH-9 pre-decomposed into its three components: use them instead of parsing the raw string.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.meta.type); // "ADT^A01"
console.log(msg.meta.messageCode); // "ADT"
console.log(msg.meta.triggerEvent); // "A01"
console.log(msg.meta.messageStructure); // "ADT_A01" (if present in MSH-9.3)

if (msg.meta.messageCode === "ORU") {
  // branch for observation results
}
```

Matching on `messageCode` + `triggerEvent` is more robust than string-equals on `type`, because some senders populate MSH-9.3 (`type` includes it) and some don't.

### Narrow a message to its type

`msg.is("ADT^A01")` does the same comparison and tells the **compiler** the answer. Inside the guard the message code and trigger event are literal types rather than `string | undefined`, and `part` / `parts` accept only the segment names that message type's published structure marks required. No cast, and no type to import per message type.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

if (msg.is("ADT^A01")) {
  const code: "ADT" = msg.meta.messageCode; // literal, and no longer optional
  const event: "A01" = msg.meta.triggerEvent;
  console.log(code, event);

  const pid = msg.part("PID"); // Segment | undefined: first PID, or none
  const evn = msg.parts("EVN"); // readonly Segment[]: every EVN, possibly empty
  console.log(pid?.field(3).value, evn.length);

  // msg.part("OBX");                    // does not compile: ADT^A01 does not require OBX
  console.log(msg.segments("OBX").length); // the base accessor still takes any name
}
```

A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a message type the published structure registry matches on message code alone (`"ACK"`, whose MSH-9.2 carries the acknowledged message's trigger event). `SUPPORTED_OVERLAY_MESSAGES` enumerates every key with the segments its structure requires, derived from that registry rather than written down.

The check is on the (MSH-9.1, MSH-9.2) pair the parser extracted, so a message whose MSH-9 carries the three-component `ADT^A01^ADT_A01` still answers `true` to `is("ADT^A01")`. **Any string that is not a key returns `false` and never throws**: an unrecognized type, the three-component form as a string, an empty string, or a value computed at run time (which cannot narrow anything, so it returns a plain `boolean`). For a raw comparison, `msg.meta.type` is the string MSH-9 carried.

Narrowing does not promise presence. The parser is lenient by design, and an `ADT^A01` that arrives without its `PID` still answers `true` here, still warns, and still reports the absence on `msg.structure`: `part` returns `undefined` and `parts` an empty list, exactly as `segments` does.

### Spot a truncated or misrouted message

For the message types it covers, `msg.structure` reports whether the segments HL7's own published message-structure definitions give a **minimum of one** for that trigger event are actually present. It's a **misroute / truncation safety net**, not a conformance validator: an `ORU^R01` that arrives with no `OBR` is almost always truncated or sent to the wrong feed.

```ts
import { parseHL7, WARNING_CODES } from "@cosyte/hl7";

const msg = parseHL7(raw); // ORU^R01 with only MSH + PID

console.log(msg.structure.recognized); // true
console.log(msg.structure.missingSegments); // ["OBR"]
console.log(msg.structure.structureIds); // ["ORU_R01-A", "ORU_R01-B", ...]

// The same finding also surfaces as an additive Tier-2 warning, so a
// channel can route on it without inspecting `structure`:
if (msg.warnings.some((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP)) {
  // quarantine / alert: the message is missing an expected segment
}
```

Expectations are **derived, not hand-picked**: the package vendors a byte-for-byte snapshot of the published structures and derives the registry from it offline, with no network call at build time or run time. `STRUCTURE_REGISTRY_PROVENANCE` carries the publication, its commit, the sha256 of every vendored file and the structure behind every recognized pair, so a warning can be audited without leaving the package.

It stays conservative where the publication is: a segment inside an optional group is not expected (so a conformant `OBX`-free `ORU^R01` never warns), a segment is expected only when every published variant of the structure requires it, and a type it doesn't recognize yields `recognized: false` and emits nothing. It never throws and never rewrites the message. `strict` mode may promote the warning to an error per the usual model. Recognized message codes: ADT, ORU, ORM, OML, OMG, OMP, OMI, SIU, MDM, DFT, VXU and ACK, across 94 trigger-event pairs. See [`docs-content/spec-notes-structure.md`](../docs-content/spec-notes-structure.md) for the full table, the derivation rules, and what changed for consumers.

### Check a message against HL7's published shape (`validateMessageStructure`)

`msg.structure` asks only whether a required segment is **present**. When the question is "does this feed follow the shape the standard publishes for this trigger event?", ask for `validateMessageStructure(msg)`: an **opt-in, read-only** check over the same vendored publication, at segment granularity. Nothing calls it for you and it changes nothing: no new warning code, no change to a parse, and the message is byte-identical afterwards.

```ts
import { parseHL7, validateMessageStructure } from "@cosyte/hl7";

const result = validateMessageStructure(parseHL7(raw)); // ADT^A01 with PV1 before PID

console.log(result.validated); // true
console.log(result.structureId); // "ADT_A01-A": the variant the findings are against
console.log(result.structureIds); // the whole variant family that was considered
for (const f of result.findings) console.log(f.severity, f.code, f.locus.segment, f.message);
// e.g. 'error STRUCTURE_SEGMENT_OUT_OF_ORDER PID  Segment "PID" (occurrence 0) appears where published structure ADT_A01-A does not allow it.'
```

It reports three things: `STRUCTURE_SEGMENT_OUT_OF_ORDER` (the sequence stops being a beginning the published order allows), `STRUCTURE_SEGMENT_CARDINALITY` (fewer occurrences than the published minimum along the path from the structure root, or more than the published maximum), and `STRUCTURE_SEGMENT_UNEXPECTED` (a segment the publication does not name, a `Z` segment included, at `warning` severity). Every finding carries a **PHI-free locus**: a segment name, a 0-indexed occurrence and a published structure id, never a field value.

The order check reads the publication's bounds as written, at every locus: a group it lets repeat may repeat, which is what lets a conformant `ORU^R01` carry `OBR OBX OBR OBX`, a group bounded at one occurrence may not be re-entered, so a `VXU^V04` whose `PV2` arrives before its `PV1` is reported, and no occurrence of a group may begin without the child the publication requires first, so an `ADT^A01` whose `IN2` arrives before its `IN1` is reported as well. The three questions are still kept apart so one defect is reported once: the one bound dropped for a segment name is the one the cardinality check has already reported for it, so a missing or over-repeated segment does not also read as everything after it being out of place. Where two segments arrive in an order the publication does not allow, the finding names **the one that arrived late**: the segment the publication puts first and the message delivered second, which is not always where the reading stopped, because the publication is often free to skip past a segment the message delayed. The pair is found by exchanging adjacent segments and asking whether the publication derives the result, and every adjacent pair is asked rather than a shortlist near the stop: in a message that repeats a group the pair can sit well in front of it, as in an `OML^O21` carrying three orders whose first order's note is delivered after the second order's `ORC`. Where more than one pair would do, the earliest is named.

**Read `validated` before `findings`.** A message type the registry does not model, the one retained transcription (`ORM^O01`), a structure with no ordered expectation and a message with no readable type each come back `validated: false` with a `reason` and no findings: "the publication cannot answer" is a different answer from "nothing was wrong". Where the publication splits a structure into variants, conforming to **one** variant conforms to the family, so findings appear only when every variant is violated and they are exactly one named variant's.

> **Zero findings is not an attestation.** It means this message did not break the published structure in the three ways above. Field content, datatypes, value sets and HL7 tables are unchecked, coverage is twelve message codes, and the publication is vendored at a fixed commit. See [`docs-content/spec-notes-structure.md`](../docs-content/spec-notes-structure.md).

### Validate against your own conformance profile (`validateAgainstProfile`)

`msg.structure` checks the handful of groups the base spec marks Required. When you have a **specific interface spec** ("our ADT feed requires PID-3, sex must be M/F/U, no Z-segments"), bring it as a declarative **conformance profile** and `validateAgainstProfile(msg, profile)` returns typed findings. **You author the profile and every value set; hl7 ships none**: no bundled vendor/IHE profile, no code set, no network call.

```ts
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

// A profile YOU author: an example, NOT an attestation of conformance.
const profile: ConformanceProfile = {
  name: "our-adt-intake",
  segments: [
    {
      segment: "PID",
      usage: "R",
      fields: [
        { field: 3, name: "Patient Identifiers", usage: "R", cardinality: { min: 1, max: 1 } },
        { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
      ],
    },
    { segment: "ZZZ", usage: "X" }, // no local Z-segments permitted
  ],
};

const { findings } = validateAgainstProfile(parseHL7(raw), profile);
for (const f of findings) console.log(f.severity, f.code, f.message);
// e.g. "error PROFILE_VALUE_NOT_IN_SET  PID-8 component 1 value is not in the profile value set (3 permitted codes)."
```

The engine holds four invariants: it **never throws** (a malformed profile yields `PROFILE_MALFORMED` findings, not an exception: use `defineConformanceProfile` for a fail-fast authoring gate that _does_ throw); a **valid message yields zero findings**; **no finding carries PHI**: each names the structural locus (segment / field / component / repetition) and the rule, never the offending value; and validation is **read-only**. Distinct from the parse-profile system (`defineProfile`/`profiles`), which shapes _how a message is parsed_.

A rule's usage is one of `R`/`RE`/`C`/`CE`/`O`/`X`/`B`, or a declared conditional written `C(t/f)`. A conditionally-used rule can carry a **condition predicate** that the engine evaluates against the message to decide which outcome applies: a location in the same message, a verb from the closed set (`is`, `is not`, `contains`, `does not contain`, `matches`, `does not match`) or a presence statement (`is valued`, `is not valued`), a value list _you_ supply, and `AND`/`OR`/`XOR` connectors.

```ts
// "PID-8 is Required when a date of birth was sent, Not-permitted when it was not."
{
  field: 8,
  usage: "C(R/X)",
  condition: { location: { segment: "PID", field: 7 }, presence: "is valued" },
}
```

Still no network call and still no code set: a predicate reads the message in front of it and compares against values you wrote down. A predicate the message cannot decide (a comparison against an element that is not there) yields a `PROFILE_CONDITION_UNEVALUATABLE` finding and the element's presence is **not** assessed, rather than being guessed either way. A rule that declares no predicate can still take its outcome from a caller-supplied resolution, and declaring both at one locus is refused.

> **"No findings" is not an attestation.** An empty result means _nothing this profile checked was violated_: never "this message is conformant." The profile only covers what you declared, and hl7 makes no conformance certification. See [`docs-content/spec-notes-conformance.md`](../docs-content/spec-notes-conformance.md).

### Pretty-print for logs

`msg.prettyPrint()` returns a multi-line, labeled view of the positional tree: useful for dev-time debugging and log snapshots.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);
console.log(msg.prettyPrint());
// MSH-1  (field separator): |
// MSH-2  (encoding chars):  ^~\&
// MSH-3  (sending app):     CLINIC
// ...
// PID-5  (name):
//   .1 = Smith
//   .2 = Jane
// ...
```

Pretty-print is **not** a replacement for `toString()`. It's for humans. Use `toString()` for wire output and `toJSON()` when you need a serialisable structure.
