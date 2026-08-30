---
"@cosyte/hl7": minor
---

Added a datetime conversion surface: `toObject`, `toISO` and `toDate`.

Working with a parsed HL7 datetime used to mean either reading `DtmParts` field by field or reaching for `dtmToDate`, which is deliberately narrow: it answers with an absolute instant or with nothing. The two answers a developer reaches for in between, a plain calendar object and an ISO-8601 string, had no route at all. These three functions are that route, and they carry the same names and the same semantics in every `@cosyte` parser, so the conversion story is learned once.

`toObject(value)` returns a frozen plain object holding only the components the value actually stated: no `raw`, no `valid`, no `precision`, nothing zero-filled, so `Object.keys()` recovers the value's precision. `month` is spec-native 1 to 12, so deleting `offsetMinutes` leaves an object `Temporal.PlainDateTime.from({...})` and luxon's `DateTime.fromObject({...})` accept with no key rename and no value adjustment. Neither library is a dependency, and neither needs to be. `millisecond` is the first three fractional digits taken verbatim and right-padded, so `.0500` is 50 ms and `.5` is 500 ms, never a float multiplication that drops the last digit of a value like `.123`.

`toISO(value)` renders ISO-8601 truncated to the stated precision, with the fractional digits verbatim rather than padded to three. Nothing is appended when the value carried no offset: the string is deliberately zone-less rather than carrying a fabricated `Z`. A stated zero offset does render `Z`, including HL7's `-0000` form, so `toISO` is a rendering and not a round trip; `formatDtm` is still the byte-exact route back to the wire and is unchanged.

`toDate(value, options?)` delegates to `dtmToDate`, so the timezone honesty is the one this library has always applied: a stated offset gives the exact instant and ignores `assumeOffsetMinutes`; no offset plus an explicit `assumeOffsetMinutes` applies that offset; no offset and no option returns `undefined`. The host machine's timezone is never read and UTC is never assumed, and a four-digit year below 100 stays that year.

All three return `undefined` rather than throwing for a value the parser marked invalid, for `undefined` and for `null`. That includes a value refused as order-ambiguous: the report on it is bookkeeping and never reaches the converted object.

`ToDateOptions` is added as a second spelling of the existing `DtmToDateOptions`. It is an alias, so the two names denote one type and either may be used; it exists because every parser in the suite spells this options type the same way, and a consumer writing across two of them should not have to spell it differently in each.

The change is additive: no existing export was removed, renamed or changed, and the package still has zero runtime dependencies.
