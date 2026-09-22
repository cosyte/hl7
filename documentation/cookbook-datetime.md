# Cookbook: datetime precision and timezone fidelity

What a fidelity `TS` keeps, how to convert one, and what the parser refuses to guess.

### Datetime precision & timezone fidelity

Every HL7 datetime (TS/DTM) is surfaced as a **fidelity `TS`**: the raw string plus its typed parts,
with the stated **precision** and **timezone** preserved. It is deliberately **not** an eager JS `Date`:
a day-only birth date coerced to a UTC-midnight instant reads as the _previous day_ in a negative-offset
zone. The parser preserves what the sender wrote and lets you decide how to localize.

```ts
import { parseHL7, dtmToDate } from "@cosyte/hl7";

const dob = parseHL7(raw).patient?.dateOfBirth;
console.log(dob?.raw); // "19880705"
console.log(dob?.precision); // "day": never zero-filled to a full timestamp
console.log(dob?.year, dob?.month, dob?.day); // 1988 7 5  (month is 1-based, spec-native)
console.log(dob?.hasTimezone); // false: a missing offset is FLAGGED, never assumed to be UTC

// An absolute instant is opt-in and honest. It refuses to guess a zone:
console.log(dtmToDate(dob!)); // undefined (no offset, no assumption)
console.log(dtmToDate(dob!, { assumeOffsetMinutes: 0 })); // 1988-07-05T00:00:00.000Z (you chose UTC)

// A value that carries its own offset resolves exactly:
const ts = parseHL7(raw).meta.timestamp; // e.g. "20250102153045-0500"
console.log(ts?.offsetMinutes); // -300
console.log(dtmToDate(ts!)?.toISOString()); // "2025-01-02T20:30:45.000Z"
```

hl7 preserves precision + timezone **fidelity**; it does **not** localize, convert, or do arithmetic on
timestamps. A consumer needing an absolute instant applies the sender's zone via `assumeOffsetMinutes`.
Use `parseDtm` / `formatDtm` / `dtmToDate` directly on a raw string when you're outside the message model.

#### Converting a datetime: `toObject`, `toISO`, `toDate`

Three conversion helpers sit on top of the fidelity `TS`. Every `@cosyte` parser exposes these same
three names with the same semantics, so you learn the conversion story once and it holds across the
suite.

| function                  | returns                            | gives you                                              |
| ------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `toObject(value)`         | frozen `DateParts`, or `undefined` | the stated calendar components as a plain object       |
| `toISO(value)`            | `string`, or `undefined`           | ISO-8601, truncated to the stated precision            |
| `toDate(value, options?)` | `Date`, or `undefined`             | an absolute instant, only when the zone is determinate |

```ts
import { parseDtm, toObject, toISO } from "@cosyte/hl7";

toObject(parseDtm("19880705"));
// { year: 1988, month: 7, day: 5 }: exactly the stated components, nothing zero-filled

toISO(parseDtm("19880705")); // "1988-07-05": truncated to the stated precision, no fabricated Z
toISO(parseDtm("20250102153045.5-0500")); // "2025-01-02T15:30:45.5-05:00": digits verbatim
```

`toObject` carries only the components the value stated, so `Object.keys()` recovers its precision and
nothing is invented: no `raw`, no `valid`, no `precision`. `month` is spec-native 1 to 12, which is
exactly what `Temporal.PlainDateTime.from({...})` and luxon's `DateTime.fromObject({...})` accept:
delete `offsetMinutes` and hand the rest over with no key rename and no value adjustment. Neither
library is a dependency here, and neither needs to be. `millisecond` is the first three fractional
digits taken verbatim and right-padded, so `.5` is 500 ms and `.0500` is 50 ms, never a float
multiplication that loses the last digit. `offsetMinutes` appears if and only if the value carried an
explicit offset, and is never synthesised from the host machine's zone.

**`toDate` never guesses a zone.** An offset-less value returns `undefined` unless you say which zone
it was written in:

```ts
import { parseDtm, toDate } from "@cosyte/hl7";

toDate(parseDtm("20250102")); // undefined: no offset stated, and none assumed
toDate(parseDtm("20250102"), { assumeOffsetMinutes: 0 }); // 2025-01-02T00:00:00.000Z: you chose UTC
toDate(parseDtm("20250102"), { assumeOffsetMinutes: -300 }); // 2025-01-02T05:00:00.000Z

// A stated offset always wins, and assumeOffsetMinutes is ignored rather than blended:
toDate(parseDtm("20250102153045-0500")); // 2025-01-02T20:30:45.000Z
toDate(parseDtm("20250102153045-0500"), { assumeOffsetMinutes: 600 }); // the same instant
```

The host machine's timezone is never read and UTC is never assumed, so the answer does not depend on
where your code ran. Components below the stated precision fill to their lowest legal value for the
instant only, leaving the value's own precision untouched, and a four-digit year below 100 stays that
year (`00500101` is year 50, never 1950).

**An offset that is not a finite number is no offset at all.** `assumeOffsetMinutes` is signed
minutes east of UTC, and anything else names no zone, so `toDate` answers `undefined` rather than
coercing it into one. That matters from JavaScript, where the type is not checked for you:

```ts
import { parseDtm, toDate } from "@cosyte/hl7";

const dob = parseDtm("20240229"); // day precision, no offset stated

toDate(dob, null); // undefined: no options bag is not a zone, and this does not throw
toDate(dob, {}); // undefined: same answer as passing nothing
toDate(dob, { assumeOffsetMinutes: "0" }); // undefined: a string is not a number of minutes
toDate(dob, { assumeOffsetMinutes: Number.NaN }); // undefined: neither is NaN

toDate(dob, { assumeOffsetMinutes: 0 }); // 2024-02-29T00:00:00.000Z: a real choice, honoured
```

`"0"`, `true` and `[]` all multiply to `0` in JavaScript, so a converter that simply did the
arithmetic would hand back a UTC instant nobody asked for, which is the guess this surface exists to
refuse. An offset large enough to leave the range a `Date` represents is refused the same way, so no
answer is ever an `Invalid Date`. A value that states its own offset is unaffected: its offset wins
outright, so an unusable assumption beside one is ignored rather than fatal.

**`toISO` renders, `formatDtm` round-trips.** A stated zero offset renders as `Z`, including HL7's
`-0000` form, so the two answers differ by design and `formatDtm` remains the byte-exact route back to
the wire:

```ts
import { formatDtm, parseDtm, toISO } from "@cosyte/hl7";

const ts = parseDtm("20250102153045-0000");
toISO(ts); // "2025-01-02T15:30:45Z"
formatDtm(ts); // "20250102153045-0000": byte-exact, sign preserved
```

All three return `undefined` rather than throwing for a value the parser marked invalid, for
`undefined` and for `null`.

**An impossible date converts to nothing, never to the day after it.** A value stating a day its
month does not have is refused by all three, whole, rather than rolled over into the following
month. February really has 28 days, or 29 in a leap year under the full 4/100/400 rule:

```ts
import { parseDtm, toDate, toISO, toObject } from "@cosyte/hl7";

toObject(parseDtm("20240230")); // undefined: February has no 30th
toISO(parseDtm("20230229")); // undefined: 2023 is not a leap year
toDate(parseDtm("21000229"), { assumeOffsetMinutes: 0 }); // undefined: 2100 is not one either

toISO(parseDtm("20240229")); // "2024-02-29": 2024 is, so this one converts
```

`month` is bounded 1 to 12, `day` by the month it is in, `hour` 0 to 23, and `minute` and `second`
0 to 59. The parser itself is unchanged and stays deliberately liberal, so `parseDtm("20240230")`
is still `valid: true` and `formatDtm` still round-trips those bytes: the refusal is in the
conversion, which is where a wrong answer would otherwise look right. Rendering it would be worse
than throwing, because `new Date("2024-02-30")` is 1 March in every JavaScript runtime, so a
consumer reading the string gets a silent one-day shift instead of an error.

**The offset a value states is bounded on the same terms.** When a value claims an explicit offset,
that offset has to be a whole number of minutes within 23 hours 59 minutes of UTC, which is exactly
what `+HH:MM` can state and what an ISO-8601 reader accepts. Anything else names no zone, so the
value converts to `undefined` rather than being reported as an offset, rendered into a string no
reader can read back, or turned into an instant:

```ts
import { parseHL7, toDate, toISO } from "@cosyte/hl7";

// A timestamp on the wire, read by the lenient fallback, stating +99:99:
const ts = parseHL7("MSH|^~\\&|SEND|FAC|RECV|FAC|2024-02-29T12:00:00+99:99||ADT^A01|MSG1|P|2.5\r")
  .meta.timestamp;

toISO(ts); // undefined: 6039 minutes east of UTC is no zone, and "+100:39" is unreadable
toDate(ts); // undefined: an offset that names no zone yields no instant
```

The same bound catches an `offsetMinutes` a JavaScript caller puts on a value by hand, where a
`"0"`, a `true` or an `[]` would otherwise multiply to `0` and answer a confident UTC instant, and
it catches `NaN`, which would otherwise render as `+NaN:NaN`. Every real zone on Earth is far inside
it (the widest in use is 14 hours east), a stated offset still wins outright over any
`assumeOffsetMinutes` beside it, and `parseDtm`, `formatDtm` and `dtmToDate` are unchanged.

**Using two `@cosyte` parsers in one file.** The three names are identical in every `@cosyte` parser,
so importing two of them into one file collides. Alias on import:

```ts
import { parseDtm, toISO as hl7ToISO } from "@cosyte/hl7";
import { toISO as x12ToISO } from "@cosyte/x12";

hl7ToISO(parseDtm("19880705")); // "1988-07-05"
// x12ToISO does the same for an X12 date value: same three names, same semantics.
```

...or namespace-import, which keeps the package of origin visible at every call site:

```ts
import * as hl7 from "@cosyte/hl7";
import * as x12 from "@cosyte/x12";

hl7.toISO(hl7.parseDtm("19880705")); // "1988-07-05"
// x12.toISO(...) is the same call, against an X12 date value.
```

#### Non-standard timestamp formats

HL7's canonical `YYYYMMDDHHmmss` parses with zero warnings. For everything else (vendor-quirky
`MM/DD/YYYY`, ISO `YYYY-MM-DD`, legacy `YYYYMMDD HHmm`), tell the parser what your sender writes
using the `dateFormats` option. Each format is tried in order, the first match wins, and it
populates the same fidelity `TS`.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw, {
  dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY", "YYYY-MM-DD"],
});

console.log(msg.meta.timestamp?.matchedFormat); // e.g. "MM/DD/YYYY": which declared format won
console.log(msg.patient?.dateOfBirth?.matchedFormat); // the same list reaches PID-7
```

**The formats you declare reach every datetime the library returns**, not just the message header
timestamp: `patient.dateOfBirth`, `visit.admitDateTime` / `dischargeDateTime`, each
`observations()` entry's `observedDateTime` and its `TS`/`DT` typed value, `allergies()`
onset dates, `diagnoses()` date/times, `insurance()` effective and expiration dates,
`immunizations()` administered and expiration dates, `charges()` transaction dates,
`documents()` activity date/times, order and medication `timings` (a `TQ1` segment and the legacy
embedded `TQ` alike), and `appointments()` start and end times.

`matchedFormat` is how you tell which answer you got: it names the declared format that matched,
and is absent when the value was canonical HL7 and parsed strictly. There is no parse warning for
either case.

**Only the formats you declare are tried on those fields.** A date the parser was not told about
stays `valid: false` with its `raw` text intact, rather than being guessed at: guessing is how a
day-first `05/07/1988` becomes a confident May 7 on a date of birth, and a plausible wrong date is
worse than a missing one. `BUILTIN_DATE_FALLBACKS` (ISO-8601 and the US-order slash forms) is a
last resort for `msg.meta.timestamp` alone and never runs on a typed datetime field.

A format is written from a fixed token vocabulary (`SUPPORTED_DATE_TOKENS`) that covers month names (`05-JUL-1988`), a 12-hour clock with AM/PM (`7/5/1988 2:30 PM`), single-digit tolerance (`M`, `D`, `H`) and escaped literals (`YYYY-MM-DD[T]HH:mm:ss`). It carries no two-digit-year token, because resolving one needs a century window and a wrong window moves a date of birth by a hundred years without failing. `defineProfile()` refuses a format the vocabulary cannot honour, at definition time, rather than accepting it and never matching. The whole grammar, with every token, rule and exclusion, is the `Date token grammar` page in the documentation.

Built-in vendor profiles (`profiles.epic`, `profiles.genericLab`, etc.) already carry the date formats common to that vendor, and an option format is tried ahead of a profile's. Reach for a profile instead of hand-listing formats when one fits.

#### Day-first vs month-first: the parser refuses to guess

`05/07/1988` is 5 July to a day-first sender and May 7 to a month-first one. Both are real calendar
dates, and nothing in the message says which was meant. When no format has been declared, the
parser resolves **neither**: `msg.meta.timestamp` comes back `valid: false` carrying an `ambiguity`
report that names the raw value and both readings, so a wrong date never reaches your code silently.

```ts
import { parseHL7, AMBIGUOUS_DATE_ORDER } from "@cosyte/hl7";

const ts = parseHL7(raw).meta.timestamp; // MSH-7 was "05/07/1988"

if (ts?.ambiguity?.code === AMBIGUOUS_DATE_ORDER) {
  console.log(ts.ambiguity.raw); // "05/07/1988"
  console.log(ts.ambiguity.candidates[0]); // { format: "MM/DD/YYYY", month: 5, day: 7, isoDate: "1988-05-07" }
  console.log(ts.ambiguity.candidates[1]); // { format: "DD/MM/YYYY", month: 7, day: 5, isoDate: "1988-07-05" }
}
```

Declaring the sender's order is the fix, and it is one line. A declared format is tried ahead of the
built-ins, so the value resolves and no ambiguity is reported:

```ts
const dayFirst = parseHL7(raw, { dateFormats: ["DD/MM/YYYY"] });
console.log(dayFirst.meta.timestamp?.month); // 7: 5 July 1988

const monthFirst = parseHL7(raw, { dateFormats: ["MM/DD/YYYY"] });
console.log(monthFirst.meta.timestamp?.month); // 5: May 7 1988
```

Only genuinely two-way values are refused. `07/25/1988` has one reading (there is no month 25) and
still resolves as July 25. `05/05/1988` has two readings that agree and still resolves. Strict HL7
timestamps, ISO-8601 values and `YYYY-MM-DD` values are untouched. Ambiguity is also a different fact
from malformed input: a value that is illegal under both readings reports no timestamp and no
ambiguity.

The report belongs to `msg.meta.timestamp`, because it is the built-in list that produces the second
reading and that list runs there and nowhere else. On a typed datetime field, an undeclared
`05/07/1988` is simply `valid: false` with its `raw` intact and no `ambiguity`: nothing tried to read
it, so there was no guess to refuse. Declaring the order resolves it on every field at once.
