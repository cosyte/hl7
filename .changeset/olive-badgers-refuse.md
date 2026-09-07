---
"@cosyte/hl7": patch
---

Parser: an order-ambiguous slash date is now refused instead of read as US-order.

`BUILTIN_DATE_FALLBACKS` carries `MM/DD/YYYY` and not `DD/MM/YYYY`, so a day-first sender's `05/07/1988` in MSH-7 parsed as May 7 1988. It did not fail, it warned only with the generic `TIMESTAMP_FALLBACK_FORMAT`, and the value it produced was a plausible, wrong calendar date. In a library whose messages carry clinical content, a confident wrong date is the failure nobody notices.

When no declared format has matched, a slash-separated numeric date whose first two components are both in 1-12 now resolves to nothing. `msg.meta.timestamp` comes back `valid: false` with an `ambiguity` report on it: `code: AMBIGUOUS_DATE_ORDER`, the raw value, and both candidate readings as `{ format, month, day, isoDate }`, so a consumer can see exactly what was declined and what to declare. That is a stable identifier of its own, distinct from `TIMESTAMP_FALLBACK_FORMAT`, so "ambiguous, refused" is now distinguishable from "malformed" (no timestamp at all) and from "resolved via a fallback" (`valid: true` with a `matchedFormat`).

**Migration, one line.** If you relied on the previous US-order default, declare it: `parseHL7(raw, { dateFormats: ["MM/DD/YYYY"] })`, or add it to your profile's `dateFormats`. A day-first feed declares `["DD/MM/YYYY"]` and gets 5 July. Declared formats are tried ahead of the built-ins, resolve the value, keep the existing `TIMESTAMP_FALLBACK_FORMAT` semantics, and never report ambiguity; options precede profile in the merged order, so an over-complete declaration listing both orders resolves deterministically on the first.

Only genuinely two-way values are refused, and the change is narrow by construction. `07/25/1988` has one reading (there is no month 25) and still resolves as July 25. `05/05/1988` has two readings that agree and still resolves. Strict HL7 timestamps, ISO-8601 values and `YYYY-MM-DD` values are untouched, with the same precision, timezone fidelity and `matchedFormat` as before. A value illegal under both readings, such as `13/13/1988`, still reports no timestamp and reports no ambiguity: malformed and ambiguous are different facts and are not conflated. An empty MSH-7 behaves exactly as it did.

Two things deliberately did not change. `DD/MM/YYYY` was **not** added to the built-in fallback list: it is consulted only as a probe for the second reading and never resolves a value, so an unambiguous day-first value such as `25/07/1988` still fails loudly rather than newly parsing, and the accepted-input set is not widened. And no warning code was added or renamed: `Hl7Message.warnings` is frozen at construction while `msg.meta` is built lazily afterwards, so a warning raised there could never reach a consumer, and the report travels on the timestamp value instead.
