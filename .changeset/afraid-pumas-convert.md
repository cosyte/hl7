---
"@cosyte/hl7": minor
---

Added a datetime conversion surface: `toObject`, `toISO` and `toDate`.

Working with a parsed HL7 datetime used to mean either reading `DtmParts` field by field or reaching for `dtmToDate`, which is deliberately narrow: it answers with an absolute instant or with nothing. The two answers a developer reaches for in between, a plain calendar object and an ISO-8601 string, had no route at all. These three functions are that route, and they carry the same names and the same semantics in every `@cosyte` parser, so the conversion story is learned once.

`toObject(value)` returns a frozen plain object holding only the components the value actually stated: no `raw`, no `valid`, no `precision`, nothing zero-filled, so `Object.keys()` recovers the value's precision. `month` is spec-native 1 to 12, so deleting `offsetMinutes` leaves an object `Temporal.PlainDateTime.from({...})` and luxon's `DateTime.fromObject({...})` accept with no key rename and no value adjustment. Neither library is a dependency, and neither needs to be. `millisecond` is the first three fractional digits taken verbatim and right-padded, so `.0500` is 50 ms and `.5` is 500 ms, never a float multiplication that drops the last digit of a value like `.123`.

`toISO(value)` renders ISO-8601 truncated to the stated precision, with the fractional digits verbatim rather than padded to three. Nothing is appended when the value carried no offset: the string is deliberately zone-less rather than carrying a fabricated `Z`. A stated zero offset does render `Z`, including HL7's `-0000` form, so `toISO` is a rendering and not a round trip; `formatDtm` is still the byte-exact route back to the wire and is unchanged.

`toDate(value, options?)` delegates to `dtmToDate`, so the timezone honesty is the one this library has always applied: a stated offset gives the exact instant and ignores `assumeOffsetMinutes`; no offset plus an explicit `assumeOffsetMinutes` applies that offset; no offset and no option returns `undefined`. The host machine's timezone is never read and UTC is never assumed, and a four-digit year below 100 stays that year.

All three return `undefined` rather than throwing for a value the parser marked invalid, for `undefined` and for `null`. That includes a value refused as order-ambiguous: the report on it is bookkeeping and never reaches the converted object.

They also refuse a value whose stated components do not name a real point on the calendar: month 1 to 12, day 1 to the last day that month has under the full 4/100/400 leap rule, hour 0 to 23, minute and second 0 to 59. `20240230` and `20230229` convert to `undefined` rather than rolling over into 1 March, and the whole value is refused rather than an in-range prefix of it converted. Rendering such a date would be worse than refusing it, because `new Date("2024-02-30")` is 1 March in every JavaScript runtime, so a consumer reading the string would get a date of birth a day out with nothing thrown and nothing warned. `parseDtm` itself is unchanged and stays deliberately liberal, so `formatDtm` still round-trips those wire bytes: the bound is part of the conversion, which is the step that would otherwise answer confidently and wrongly.

`ToDateOptions` is added as a second spelling of the existing `DtmToDateOptions`. It is an alias, so the two names denote one type and either may be used; it exists because every parser in the suite spells this options type the same way, and a consumer writing across two of them should not have to spell it differently in each.

The change is additive: no existing export was removed, renamed or changed, and the package still has zero runtime dependencies.
