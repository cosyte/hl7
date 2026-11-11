---
id: read-dates-and-times
title: Read dates and times without guessing
sidebar_label: Read dates and times
description: "Read an HL7 datetime with its precision and timezone intact, convert it to an object, an ISO string or a Date, and declare a sender's non-standard formats."
---

# Read dates and times without guessing

Every HL7 datetime (`TS` or `DTM`) comes back as a fidelity `TS`: the raw text plus its parts, with
the precision and the timezone the sender stated. It is not a JavaScript `Date`: a day-only birth
date turned into midnight UTC reads as the previous day in a zone west of UTC.
[Datetime precision and timezone](./spec-notes-datetime-precision.md) explains the design; this
page shows what to call.

## Read a datetime's parts

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045-0500||ADT^A01|EX00030|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||19880705|F";

const msg = parseHL7(raw);
const dob = msg.patient?.dateOfBirth;

dob?.raw; // => "19880705"
dob?.precision; // => "day"
[dob?.year, dob?.month, dob?.day]; // => [1988, 7, 5]
dob?.hasTimezone; // => false

const sent = msg.meta.timestamp;
sent?.precision; // => "second"
sent?.offsetMinutes; // => -300
```

`month` is 1 to 12, as the standard writes it. A value with no offset says so with
`hasTimezone: false`; it is never assumed to be UTC.

## Convert to an object, an ISO string or a Date

Three functions convert a fidelity `TS`. Every Cosyte parser that reads dates exports the same three
names with the same meaning.

| Function                  | Returns                            | What you get                                           |
| ------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `toObject(value)`         | frozen `DateParts`, or `undefined` | the stated calendar parts as a plain object            |
| `toISO(value)`            | `string`, or `undefined`           | ISO 8601, cut to the stated precision                  |
| `toDate(value, options?)` | `Date`, or `undefined`             | an instant, only when the timezone is known            |

```ts runnable
import { parseDtm, toISO, toObject } from "@cosyte/hl7";

toObject(parseDtm("19880705")); // => { year: 1988, month: 7, day: 5 }
toISO(parseDtm("19880705")); // => "1988-07-05"
toISO(parseDtm("20250102153045.5-0500")); // => "2025-01-02T15:30:45.5-05:00"
```

`toObject` carries only the parts the value stated, so its keys show the precision. Its shape is
what `Temporal.PlainDateTime.from()` and Luxon's `DateTime.fromObject()` accept once you delete
`offsetMinutes`. `millisecond` is the first three fractional digits read as written, so `.5` is 500
and `.0500` is 50. `offsetMinutes` is present only when the value stated an offset.

### `toDate` never guesses a timezone

A value with no offset converts to `undefined` unless you say which offset it was written in. A
stated offset always wins.

```ts runnable
import { parseDtm, toDate } from "@cosyte/hl7";

toDate(parseDtm("20250102")); // => undefined
toDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 }); // => new Date("2025-01-02T00:00:00.000Z")
toDate(parseDtm("20250102"), { assumeOffsetMinutes: -300 }); // => new Date("2025-01-02T05:00:00.000Z")

toDate(parseDtm("20250102153045-0500")); // => new Date("2025-01-02T20:30:45.000Z")
toDate(parseDtm("20250102153045-0500"), { assumeOffsetMinutes: 600 }); // => new Date("2025-01-02T20:30:45.000Z")
```

The host's timezone is never read. `assumeOffsetMinutes` is signed minutes east of UTC, and
anything that is not a finite number names no timezone, so the answer is `undefined` rather than a
UTC instant nobody asked for:

```ts runnable
import { parseDtm, toDate } from "@cosyte/hl7";

const dob = parseDtm("20240229");

toDate(dob, null); // => undefined
toDate(dob, {}); // => undefined
// @ts-expect-error: a string is not a number of minutes
toDate(dob, { assumeOffsetMinutes: "0" }); // => undefined
toDate(dob, { assumeOffsetMinutes: Number.NaN }); // => undefined
toDate(dob, { assumeOffsetMinutes: 0 }); // => new Date("2024-02-29T00:00:00.000Z")
```

An offset large enough to leave the range a `Date` can hold is refused the same way, so no answer
is an `Invalid Date`. A four-digit year below 100 stays that year: `00500101` is the year 50.

### An impossible date converts to nothing

A value naming a day its month does not have is refused by all three functions, rather than rolled
into the next month. February has 29 days only in a leap year, under the full 4, 100 and 400 rule.

```ts runnable
import { parseDtm, toDate, toISO, toObject } from "@cosyte/hl7";

toObject(parseDtm("20240230")); // => undefined
toISO(parseDtm("20230229")); // => undefined
toDate(parseDtm("21000229"), { assumeOffsetMinutes: 0 }); // => undefined
toISO(parseDtm("20240229")); // => "2024-02-29"

parseDtm("20240230").valid; // => true
```

The parser stays liberal (`parseDtm("20240230")` is still `valid: true`, and `formatDtm` still
round-trips its bytes); the refusal is in the conversion. `new Date("2024-02-30")` is 1 March in
every JavaScript runtime, so rendering the value would be a silent one-day shift.

A stated offset is held to the same terms: a whole number of minutes within 23 hours 59 minutes of
UTC, which is what `+HH:MM` can state. Anything else names no timezone:

```ts runnable
import { parseHL7, toDate, toISO } from "@cosyte/hl7";

// A timestamp on the wire, read by the lenient fallback, stating +99:99.
const ts = parseHL7(
  "MSH|^~\\&|SEND|FAC|RECV|FAC|2024-02-29T12:00:00+99:99||ADT^A01|MSG1|P|2.5\r",
).meta.timestamp;

toISO(ts); // => undefined
toDate(ts); // => undefined
```

### Render or round-trip

`toISO` renders a stated zero offset as `Z`, HL7's `-0000` included. `formatDtm` is the
byte-exact route back to the wire.

```ts runnable
import { formatDtm, parseDtm, toISO } from "@cosyte/hl7";

const ts = parseDtm("20250102153045-0000");

toISO(ts); // => "2025-01-02T15:30:45Z"
formatDtm(ts); // => "20250102153045-0000"
```

All three conversions return `undefined` rather than throwing for a value the parser marked
invalid, for `undefined` and for `null`. `dtmToDate` is the older form of `toDate` with the same
rule: no offset and no `assumeOffsetMinutes` gives `undefined`.

### Two Cosyte parsers in one file

The three names are the same in each Cosyte parser that reads dates, so importing two packages in
one file collides. Alias the import or use a namespace import:

```ts no-run imports @cosyte/x12, which this package does not depend on
import { parseDtm, toISO as hl7ToISO } from "@cosyte/hl7";
import { toISO as x12ToISO } from "@cosyte/x12";

hl7ToISO(parseDtm("19880705")); // "1988-07-05"
// x12ToISO does the same for an X12 date value.
```

## Declare a sender's date formats

HL7's own `YYYYMMDDHHmmss` parses with no setup. For anything else, tell the parser what your
sender writes with `dateFormats`. The formats are tried in order and the first match wins.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|01/02/2025 15:30:45||ADT^A01|EX00031|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||07/05/1988|F";

const msg = parseHL7(raw, { dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"] });

msg.meta.timestamp?.matchedFormat; // => "MM/DD/YYYY HH:mm:ss"
msg.patient?.dateOfBirth?.matchedFormat; // => "MM/DD/YYYY"
msg.patient?.dateOfBirth?.month; // => 7
```

The declared formats reach every datetime the library returns, not only the header: birth dates,
visit admit and discharge times, observation times and values, allergy onsets, diagnosis times,
insurance dates, immunization dates, charge dates, document times, order and medication timings, and
appointment times. `matchedFormat` names the format that matched, and is absent when the value was
HL7's own form.

Only the formats you declare are tried on those fields. A date the parser was not told about is
not guessed at: the helper leaves it out, and the field itself reads `valid: false` with its `raw`
text intact.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20250102153045||ADT^A01|EX00032|P|2.5\r" +
  "PID|1||MRN12345^^^HOSP^MR||Smith^Jane^Q||07/05/1988|F";

const msg = parseHL7(raw);

msg.patient?.dateOfBirth; // => undefined

const pid7 = msg.part("PID")?.field(7).asTs();
pid7?.valid; // => false
pid7?.raw; // => "07/05/1988"
```

`BUILTIN_DATE_FALLBACKS` (ISO 8601 and the US slash forms) is a last resort for `msg.meta.timestamp`
alone. A format is written from a fixed set of tokens, listed with every rule in the
[date token grammar](./date-token-grammar.md); there is no two-digit year token, because a wrong
century moves a birth date by a hundred years without failing. `defineProfile()` refuses a format
the grammar cannot honor when the profile is defined. A built-in vendor profile already carries
its vendor's formats, and a format passed as an option is tried before a profile's.

## Day first or month first: the parser refuses to guess

`05/07/1988` is 5 July to a day-first sender and 7 May to a month-first one. When no format is
declared, the header timestamp resolves neither: it comes back `valid: false` with an `ambiguity`
report naming both readings.

```ts runnable
import { AMBIGUOUS_DATE_ORDER, parseHL7 } from "@cosyte/hl7";

const raw = "MSH|^~\\&|CLINIC|MAIN|LAB|REF|05/07/1988||ADT^A01|EX00033|P|2.5";

const ts = parseHL7(raw).meta.timestamp;

ts?.valid; // => false
ts?.ambiguity?.code === AMBIGUOUS_DATE_ORDER; // => true
ts?.ambiguity?.candidates.map((c) => c.isoDate); // => ["1988-05-07", "1988-07-05"]

parseHL7(raw, { dateFormats: ["DD/MM/YYYY"] }).meta.timestamp?.month; // => 7
parseHL7(raw, { dateFormats: ["MM/DD/YYYY"] }).meta.timestamp?.month; // => 5
```

Only values with two real readings are refused. `07/25/1988` has one reading (there is no month 25)
and resolves; `05/05/1988` has two that agree and resolves. A value illegal under both readings
reports no timestamp and no ambiguity.

## Reference

- [`TS`](./api/src/README.md#ts), [`DateParts`](./api/src/README.md#dateparts),
  [`DtmAmbiguity`](./api/src/README.md#dtmambiguity)
- [`parseDtm`](./api/src/README.md#parsedtm), [`formatDtm`](./api/src/README.md#formatdtm),
  [`toObject`](./api/src/README.md#toobject), [`toISO`](./api/src/README.md#toiso),
  [`toDate`](./api/src/README.md#todate), [`dtmToDate`](./api/src/README.md#dtmtodate)
- [`BUILTIN_DATE_FALLBACKS`](./api/src/README.md#builtin_date_fallbacks),
  [`AMBIGUOUS_DATE_ORDER`](./api/src/README.md#ambiguous_date_order),
  [Date token grammar](./date-token-grammar.md)
