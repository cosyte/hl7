---
id: property-test-your-code
title: Property-test your own code with generated messages
sidebar_label: Property-test your code
description: "Test your own HL7 code on generated messages, messy text and hostile input with the fast-check generators at @cosyte/hl7/arbitraries."
---

# Property-test your own code with generated messages

A test written by hand checks the messages its author thought of. A property-based test states a
rule, such as "this never throws" or "what I write reads back", and checks it on as many generated
inputs as you ask for. `@cosyte/hl7/arbitraries` exports the generators we use to test this
library, built on [fast-check](https://fast-check.dev), so you can point them at code you build on
it.

Every generated value is synthetic and random: nothing in one looks like a patient's name, date of
birth, address or identifier, so a failing case is safe to paste into an issue.

## Install fast-check

```bash
npm install --save-dev fast-check
```

fast-check is an optional peer dependency of `@cosyte/hl7`. Only `@cosyte/hl7/arbitraries` loads
it; the main entry point never does, so code that only parses messages does not need it.

## Check that your code handles any message

`message()` generates a parsed `Hl7Message`: one of the common message types (ADT, ORU, ORM, OML,
SIU, MDM, DFT, VXU, RDE and ACK), over generated encoding characters, with escape sequences,
repetitions, components and subcomponents in its values, and generated segments after the ones its
type opens with. State the rule your code must keep, and let fast-check look for a message that
breaks it.

```ts runnable
import fc from "fast-check";
import type { Hl7Message } from "@cosyte/hl7";
import { message } from "@cosyte/hl7/arbitraries";

const QUEUES = ["admissions", "results", "orders", "other"];

// Your code: pick a queue for a message by its message code.
function queueFor(msg: Hl7Message): string {
  switch (msg.meta.messageCode) {
    case "ADT":
      return "admissions";
    case "ORU":
      return "results";
    case "ORM":
    case "OML":
      return "orders";
    default:
      return "other";
  }
}

// The rule: every message lands in a known queue.
fc.assert(
  fc.property(message(), (msg) => QUEUES.includes(queueFor(msg))),
  { numRuns: 50 },
);

const [sample] = fc.sample(message(), { numRuns: 1, seed: 1 });
sample?.segments("MSH").length; // => 1
```

Each case is a new message, so your code may change the one it is given.

## Check that what you write reads back

Pair `message()` with `value()`, which generates text a reader would see in one field, including
the delimiters, line breaks and characters outside ASCII that have to be escaped on the wire. The
rule here is the one that matters most for code that writes HL7: what you put in comes back out.

```ts runnable
import fc from "fast-check";
import { parseHL7, type Hl7Message } from "@cosyte/hl7";
import { message, value } from "@cosyte/hl7/arbitraries";

// Your code: add a note to a message before sending it on.
function addNote(msg: Hl7Message, text: string): Hl7Message {
  const count = msg.segments("NTE").length;
  return msg.addSegment("NTE", [String(count + 1), "", text]);
}

fc.assert(
  fc.property(message(), value(), (msg, text) => {
    const sent = addNote(msg, text).toString();
    const notes = parseHL7(sent).segments("NTE");
    return notes[notes.length - 1]?.field(3).value === text;
  }),
  { numRuns: 50 },
);

const msg = parseHL7("MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ORU^R01|EX1|P|2.5");
addNote(msg, "a|b").toString().endsWith("NTE|1||a\\F\\b\r"); // => true
```

## Feed your code messy and hostile input

Two generators produce raw input rather than parsed messages:

- `messageText()` is text a real sender might produce: any line ending, MLLP framing, a byte order
  mark, padded fields, trailing delimiters, lower-case segment names, unknown escapes, an unknown
  segment, a character set in MSH-18. The parser accepts all of it, with a warning for what it
  repaired.
- `hostileInput()` is random strings, random bytes, messages cut short or with text inserted and
  deleted, and messages as bytes. The parser may refuse these, with one of its four documented
  fatal errors, but throws nothing else.

```ts runnable
import fc from "fast-check";
import { Hl7ParseError, parseHL7 } from "@cosyte/hl7";
import { hostileInput, messageText } from "@cosyte/hl7/arbitraries";

// Your code: read a control id off a connection without ever crashing the listener.
function readControlId(raw: string | Buffer): string | undefined {
  try {
    return parseHL7(raw).meta.controlId;
  } catch (err) {
    if (err instanceof Hl7ParseError) return undefined;
    throw err;
  }
}

// Messy text always parses, so its control id is always there.
fc.assert(
  fc.property(messageText(), (raw) => readControlId(raw) !== undefined),
  { numRuns: 50 },
);

// Hostile input may be refused, but never crashes the reader.
fc.assert(
  fc.property(hostileInput(), (raw) => {
    readControlId(raw);
  }),
  { numRuns: 50 },
);

readControlId("not a message"); // => undefined
```

## Pick the generators

| Generator                                   | Generates                                                                                                            | Options                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `message()`                                 | a parsed, spec-clean `Hl7Message` that serializes back to the text it was parsed from                                | `encodingCharacters`, `maxExtraSegments`, `maxFields`, `escapes`            |
| `messageText()`                             | messy message text the parser accepts                                                                                | the same as `message()`                                                     |
| `hostileInput()`                            | a string or a `Buffer` the parser may refuse                                                                         | `maxLength`                                                                 |
| `messageType()`                             | `{ code, trigger }`, such as `{ code: "ORU", trigger: "R01" }`                                                       | none                                                                        |
| `segment()`                                 | a non-MSH `RawSegment`: a common segment or a `Z` segment                                                            | `names`, `maxFields`, and the field options                                 |
| `field()`                                   | a `RawField`: repetitions of components of subcomponents, or the explicit null                                       | `maxRepetitions`, `maxComponents`, `maxSubcomponents`, `nullable`, `values` |
| `repetition()`, `component()`               | one level of a field                                                                                                 | the field options                                                           |
| `value()`                                   | the decoded text of one subcomponent                                                                                 | `minLength`, `maxLength`                                                    |
| `encodingCharacters()`                      | the five delimiters, standard or any distinct punctuation, with or without the truncation character                  | `delimiters`, `truncation`                                                  |
| `escapeSequence()`                          | one escape sequence as written on the wire, such as `\F\` or `\X0D\`                                                 | `encodingCharacters`                                                        |
| `species()`, `breed()`, `productionClass()` | a random `CWE` with at least one of identifier, text, coding system and original text, for PID-35, PID-36 and PID-38 | none                                                                        |
| `strain()`                                  | the random text of PID-37                                                                                            | none                                                                        |

`field()`, `segment()` and the levels below them end every list on a non-empty item, because the
serializer drops a trailing empty one (it writes `a^b`, never `a^b^`). So a generated field or
segment added with `addSegment` reads back exactly as it was generated.

## Replay a failure

When a rule fails, fast-check shrinks the case to a small one and reports the seed and path that
produced it. A failing message prints as the `parseHL7(...)` call that rebuilds it.

```ts runnable
import fc from "fast-check";
import { message } from "@cosyte/hl7/arbitraries";

// A rule that is wrong: an ACK carries no patient.
const everyMessageHasAPatient = fc.property(message(), (msg) => msg.segments("PID").length > 0);

let report = "";
try {
  fc.assert(everyMessageHasAPatient, { seed: 42 });
} catch (err) {
  report = String(err);
}
report.includes("seed: 42"); // => true
report.includes('Counterexample: [parseHL7("MSH'); // => true
```

Pass the reported `seed` and `path` back to `fc.assert` to run that one case again, already shrunk,
while you fix it. A test in CI can run more cases than one on a laptop: set `numRuns` from an
environment variable, as we do with `COSYTE_PROPERTY_RUNS`.

## Reference

- [`parseHL7`](./api/src/README.md#parsehl7), [`Hl7Message`](./api/src/README.md#hl7message),
  [`Hl7ParseError`](./api/src/README.md#hl7parseerror)
- [`@cosyte/hl7/arbitraries`](./api/src/arbitraries.md) lists every generator and its options,
  among them [`message`](./api/src/arbitraries.md#message) and
  [`MessageOptions`](./api/src/arbitraries.md#messageoptions); an editor shows the same text on
  hover.
- [Testing and quality](./testing-and-quality.md) says how we use these generators on this
  library, and [Tolerance and errors](./tolerance-and-errors.md) explains what lenient parsing
  repairs and what it refuses.
