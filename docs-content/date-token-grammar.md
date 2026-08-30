---
id: date-token-grammar
title: "Date token grammar: vendor date formats, written down once"
sidebar_label: Date token grammar
---

# Date token grammar

A vendor feed that writes `05-JUL-1988` or `7/5/1988 2:30 PM` is not writing
HL7. The `dateFormats` option is how you teach the parser to read it anyway,
and this page is the **normative** statement of what a format string may
contain: the token table, how a format is split into tokens, how to write a
literal, which tokens require which other tokens, when two tokens may sit side
by side, how a 12-hour clock becomes a 24-hour value, and the two things this
vocabulary deliberately does not have.

It is written to be citable. Other parsers in this family adopt the same
grammar rather than inventing a second one, and a machine-readable corpus of
cases ships beside it so a parser can prove it agrees.

```ts runnable
import { SUPPORTED_DATE_TOKENS } from "@cosyte/hl7";

SUPPORTED_DATE_TOKENS.length; // => 15
SUPPORTED_DATE_TOKENS.includes("MMM"); // => true
SUPPORTED_DATE_TOKENS.includes("YY"); // => false
```

## The token table

Token spellings are **case-sensitive**: `MM` is month and `mm` is minute.
Alphabetic content in the **input** is compared **case-insensitively**, and
ASCII only, so `JUL`, `Jul` and `jul` are one value and `PM` and `pm` are one
value.

| token  | means                        | matches           | in-range values                                   |
| ------ | ---------------------------- | ----------------- | ------------------------------------------------- |
| `YYYY` | year                         | exactly 4 digits  | 0001 to 9999                                      |
| `MM`   | month                        | exactly 2 digits  | 01 to 12                                          |
| `M`    | month, single-digit tolerant | 1 or 2 digits     | 1 to 12                                           |
| `MMM`  | month, abbreviated name      | exactly 3 letters | `Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec` |
| `MMMM` | month, full name             | letters           | `January` through `December`                      |
| `DD`   | day of month                 | exactly 2 digits  | 01 to 31                                          |
| `D`    | day, single-digit tolerant   | 1 or 2 digits     | 1 to 31                                           |
| `HH`   | hour, 24-hour clock          | exactly 2 digits  | 00 to 23                                          |
| `H`    | hour, 24-hour, tolerant      | 1 or 2 digits     | 0 to 23                                           |
| `hh`   | hour, 12-hour clock          | exactly 2 digits  | 01 to 12                                          |
| `h`    | hour, 12-hour, tolerant      | 1 or 2 digits     | 1 to 12                                           |
| `mm`   | minute                       | exactly 2 digits  | 00 to 59                                          |
| `ss`   | second                       | exactly 2 digits  | 00 to 59                                          |
| `SSSS` | fractional seconds           | 1 to 4 digits     | any                                               |
| `A`    | meridiem                     | exactly 2 letters | `AM` or `PM`, any case                            |

The month names are **English only**. A localized month name is not in this
vocabulary and is not expressible; if you need one, normalize the value before
it reaches the parser.

A value outside a token's range does not match. It is never clamped, wrapped or
substituted: `13` is not December and it is not January, it is no match at all.

## Tokenising a format

1. A format is read left to right and split by **longest match** against the
   table above. `MMMM` wins over `MMM`, which wins over `MM`, which wins over
   `M`.
2. Every remaining character is a **literal**, and a literal matches itself.
3. An unescaped **ASCII letter or digit** that is not part of a token is an
   **error at definition time**. There is no such thing as an accidental
   literal letter: a letter you meant literally must say so.

### Writing a literal letter or digit

Put it in square brackets. The bracketed text matches **verbatim**, including
its case, and nothing inside brackets is read as a token.

```ts runnable
import { defineProfile } from "@cosyte/hl7";

const iso = defineProfile({
  name: "iso-style-vendor",
  dateFormats: ["YYYY-MM-DD[T]HH:mm:ss"],
});

iso.dateFormats; // => ["YYYY-MM-DD[T]HH:mm:ss"]
```

Without the brackets that `T` is a bare letter that forms no token, and the
profile is refused:

```ts runnable throws
import { defineProfile } from "@cosyte/hl7";

defineProfile({ name: "broken", dateFormats: ["YYYY-MM-DDTHH:mm:ss"] });
```

An escape may hold more than one character (`D [of] MMMM YYYY` reads
`5 of July 1988`), and a `[` with no closing `]` is an error at definition
time rather than a silent swallow of the rest of the format.

## Rules a format must satisfy

All five are checked **at profile definition time**, when `defineProfile()`
runs, so a format that cannot be honoured throws where you wrote it instead of
sitting in the list quietly matching nothing.

### 1. Every letter and digit belongs to a token or an escape

`MM/DD/YYYY hrs` is refused, naming the offending character. So is `YYY/MM`,
where three `Y` characters form no token. Punctuation and whitespace need no
escape.

### 2. `h`/`hh` and `A` require each other

A 12-hour reading is not a clock hour until AM or PM is applied, so `h:mm` is
refused. A meridiem beside a 24-hour clock has nothing to convert, so
`HH:mm A` is refused too. Use `H`/`HH` for a 24-hour clock and `h`/`hh` with
`A` for a 12-hour one.

### 3. `SSSS` requires `ss`

A fraction is only meaningful at full second precision, which is the same rule
the strict parser applies to an HL7 value.

### 4. Two numeric tokens may not sit adjacent when either is variable width

`M`, `D`, `H`, `h` and `SSSS` are the variable-width tokens. `MDYYYY` is
refused: nothing can decide whether `1231988` starts with month 1 or month 12.
Two **fixed**-width numeric tokens may sit adjacent, because the digit run
splits deterministically, which is why `YYYYMMDDHHmmss` is fine.

`MMM`, `MMMM` and `A` consume letters rather than digits, so a numeric token
beside one of them is never ambiguous.

### 5. A format must carry at least one token

An empty format, or one made only of separators, matches nothing.

## Matching an input

- A **variable-width** numeric token takes the longest digit run that both
  stays in range and leaves the rest of the format matchable. So `M/D/YYYY`
  reads `7/5/1988` and `12/25/1988` with the same format string.
- The **whole** input must be consumed. A value that ends early, or that
  carries trailing characters, is no match.
- No match ever raises. It reports no match, and no parts are produced from it.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|05-JUL-1988||ORU^R01|1|P|2.5\r" +
  "PID|1||MRN001^^^HOSP^MR||Testpatient^Casey||19880705|F";

const msg = parseHL7(raw, { dateFormats: ["DD-MMM-YYYY"] });
msg.meta.timestamp?.year; // => 1988
msg.meta.timestamp?.month; // => 7
msg.meta.timestamp?.day; // => 5
msg.meta.timestamp?.precision; // => "day"
```

### Month names resolve to a month NUMBER

`MMM` and `MMMM` produce the spec-native month **1 to 12** that every parsed
value uses, never a 0-based index. `05-JUL-1988` under `DD-MMM-YYYY` is year
1988, month **7**, day 5, at day precision.

### The meridiem is converted and then discarded

`hh`/`h` plus `A` yields the 24-hour hour, and the meridiem itself never
appears in the result. `12 AM` is hour **0**, `12 PM` is hour **12**, and
`2 PM` is hour **14**.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const at = (stamp: string): number | undefined =>
  parseHL7(`MSH|^~\\&|LAB|MAIN|EHR|REF|${stamp}||ORU^R01|1|P|2.5\r`, {
    dateFormats: ["M/D/YYYY h:mm A"],
  }).meta.timestamp?.hour;

at("7/5/1988 12:00 AM"); // => 0
at("7/5/1988 12:00 PM"); // => 12
at("7/5/1988 2:30 PM"); // => 14
```

### Precision follows the fields the format populates

A value states the precision it was given and no more. `YYYY` is year
precision, `YYYY-MM` is month, `YYYY-MM-DD` is day, and so on through hour,
minute, second and fraction. Nothing is zero-filled to reach a level the
format did not populate.

| the format populates through | stated precision |
| ---------------------------- | ---------------- |
| year                         | `year`           |
| month                        | `month`          |
| day                          | `day`            |
| hour                         | `hour`           |
| minute                       | `minute`         |
| second                       | `second`         |
| fractional seconds           | `fraction`       |

A format that populates no year describes a time of day rather than a date.
The token grammar matches it, but there is no dated value to produce from it,
so it yields no timestamp.

## Two exclusions, with their reasons

### No two-digit year

There is no `YY` token and there will not be one. Resolving a two-digit year
needs a century window, a window is a guess, and a wrong guess moves a date of
birth by a hundred years while producing a date that looks entirely plausible.
Nothing downstream can detect that. So a format containing `YY` is refused, and
the refusal says why:

```ts runnable throws
import { defineProfile } from "@cosyte/hl7";

defineProfile({ name: "legacy-lab", dateFormats: ["MM/DD/YY"] });
```

If a feed really sends two-digit years, widen them to four digits at the
ingest boundary, where the century is a decision somebody made on purpose.

### No timezone token

An offset cannot be captured by a user format. This is not an oversight: the
stance on offsets is that a value carrying none is **flagged** as carrying
none, never resolved to UTC, because assuming UTC turns a day-only date of
birth into the previous day in every negative-offset zone. See
[Datetime precision and timezone fidelity](./spec-notes-datetime-precision.md)
for the whole of that argument. A value matched through `dateFormats` therefore
never carries an offset, and the consumer decides how to localize it.

## The conformance corpus

`test/fixtures/date-tokens/corpus.json` in this repository is the machine-
readable form of everything above: pure JSON, no expression language, no
syntax belonging to any one parser, and no dependency. It carries

- at least one accepted case per token in the table,
- at least one refused-at-definition case per rule above,
- at least one no-match case per range or name violation, and
- at least one accepted case per stated precision level.

Its shape is documented in `test/fixtures/date-tokens/README.md`, beside the
data. Each case declares its own expectation, and a runner that meets a case it
cannot execute must **fail** rather than skip it: a corpus that quietly ignores
what it does not understand proves nothing.

A parser adopting this grammar reads the corpus, runs every case, and asserts
the stated outcome. That is the whole conformance obligation, and it is the
reason the grammar is written here once rather than re-derived per repository.
