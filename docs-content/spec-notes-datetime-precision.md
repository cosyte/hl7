---
id: spec-notes-datetime-precision
title: "Spec notes: datetime precision & timezone fidelity"
sidebar_label: Datetime precision & timezone
description: "How a DTM value keeps its precision and timezone instead of collapsing into a Date, and why an order-ambiguous slash date is refused rather than guessed."
---

# Spec notes: datetime precision + timezone fidelity

**Spec:** HL7 v2 Ch. 2A **DTM**: `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`; the number of
characters populated (excluding the offset) sets the precision; a missing offset "defaults to that of
the local time zone of the sender" (NOT UTC, NOT the parser's zone). TS→DTM moved precision from an
explicit degree-of-precision component to the value's length (v2.5/v2.7).

## Why there is no `Date` by default

A JavaScript `Date` is an absolute instant, and most HL7 v2 timestamps are not. `|1970|` is a year,
`|19880705|` is a calendar day, and a value with no offset is the *sender's* local time by the
standard's own words. Materializing either as a `Date` means inventing a zone, and inventing UTC is
how a day-only date of birth `|19880705|` becomes a UTC-midnight instant that reads back as
**July 4** through `.getDate()` in any negative-offset zone. So this library parses DTM into typed
parts, keeps the precision it was given, and builds a `Date` only when the caller explicitly asks
for one.

## The API

### Core: `src/parser/dates.ts`
- `type DtmPrecision = "year"|"month"|"day"|"hour"|"minute"|"second"|"fraction"`.
- `interface DtmParts { raw; valid; precision?; year?; month?(1–12, spec-native); day?; hour?; minute?;
  second?; fractionalSeconds?(verbatim digits, no dot); hasTimezone; offsetMinutes?(signed, iff tz);
  matchedFormat?(cascade only); ambiguity?(order refused, see below) }`.
- `parseDtm(raw): DtmParts`: pure structural parse of the HL7 DTM shape. **No zero-fill, no `Date`, no
  UTC.** Precision from populated length. Calendar-range check (month 1–12, day 1–31, hour 0–23,
  min/sec 0–59, offset hours ≤ 24 with minutes ≤ 59) → on bad shape/range `valid:false`, raw kept, parts omitted, never a
  throw. Empty → `valid:false, hasTimezone:false`.
- `formatDtm(parts): string`: reconstruct the DTM string from parts (proves losslessness; round-trip
  property = `parseDtm(raw)→formatDtm ≡ raw`, exact length, no zero-fill).
- `dtmToDate(parts, opts?: { assumeOffsetMinutes?: number }): Date | undefined`: **explicit, opt-in**
  absolute-instant materialization. `!valid`→undefined. Truncated fields fill to lowest legal value
  **for instant construction only** (precision still tells the truth). `hasTimezone`→exact instant via
  the embedded offset. else `assumeOffsetMinutes`→apply it. else→**undefined** (refuse to guess; never
  silent UTC).
- `parseDtmCascade(raw, opts): DtmParts`: lenient wrapper for non-composite callers (`meta`): try
  `parseDtm`; else user/builtin fallback formats → parts from the matched tokens + `matchedFormat` +
  `TIMESTAMP_FALLBACK_FORMAT` warning. `BUILTIN_DATE_FALLBACKS`/`SUPPORTED_DATE_TOKENS` unchanged.
  One exception, below: an order-ambiguous slash date resolves to nothing.

## Order ambiguity: `05/07/1988` is refused, not guessed

`BUILTIN_DATE_FALLBACKS` carries `MM/DD/YYYY` and not `DD/MM/YYYY`. A day-first sender's
`05/07/1988` therefore used to read as May 7, with no failure and no signal that the field order had
been assumed. In a PHI-bearing library that is the worst shape of wrong: plausible, confident and
invisible.

A slash-separated numeric date whose first two components are **both in 1-12** has two legal
readings. When no declared format has matched, the built-ins now resolve **neither**: the result is
`valid: false` with an `ambiguity` report (`code: AMBIGUOUS_DATE_ORDER`, the raw value, and both
`candidates` as `{ format, month, day, isoDate }`). `msg.meta.timestamp` carries it, so
`ambiguity` distinguishes "refused" from "malformed" (no timestamp at all) and from "resolved via a
fallback" (`valid: true` + `matchedFormat`).

- **Declared formats still win.** `parseHL7(raw, { dateFormats: ["DD/MM/YYYY"] })` and a profile's
  `dateFormats` are tried ahead of the built-ins, resolve the value, keep the existing
  `TIMESTAMP_FALLBACK_FORMAT` semantics, and never report ambiguity. Options precede profile.
- **One reading still resolves.** `07/25/1988` (no month 25) and `05/05/1988` (both readings agree)
  are unaffected, as are strict DTM, ISO-8601 and `YYYY-MM-DD`.
- **The built-in list did not change.** `DD/MM/YYYY` is used only as a probe for the second reading
  and never resolves a value: an unambiguous day-first value such as `25/07/1988` still fails
  loudly. Declaring the order is the route for a day-first feed.
- **No warning code was added or renamed.** `Hl7Message.warnings` is frozen at construction and
  `msg.meta` is built lazily afterwards, so the report travels on the value rather than the warnings
  collection.

### Conversion surface: `src/parser/date-conversion.ts`

A read layer over `DtmParts`, carrying the three names every `@cosyte` parser exposes. It converts;
it never re-parses, and it changes nothing about how a value was parsed.

- `interface DateParts { year?; month?(1-12, spec-native); day?; hour?; minute?; second?;
  millisecond?; offsetMinutes?(signed, iff an explicit offset was stated) }`. Frozen. Names singular.
- `toObject(value): DateParts | undefined`: only the stated components, so `Object.keys()` recovers
  the precision. A component the value did not state is **absent**, not present-with-undefined. No
  `raw`, `valid`, `precision`, `hasTimezone` or `matchedFormat` key. `millisecond` is the first three
  fractional digits **verbatim**, right-padded (`.5`=500, `.0500`=50), never a float multiplication.
  `-0000` surfaces as `offsetMinutes: 0`. `!valid` or no stated component at all -> undefined.
- `toISO(value): string | undefined`: ISO-8601 **truncated to the stated precision**, fractional
  digits verbatim. Offset appended as `Z` when exactly zero (`-0000` included), else `+HH:MM`/
  `-HH:MM`; **nothing** appended when no offset was stated. So `toISO` is a rendering and
  `formatDtm` remains the byte-exact round trip. No year (which HL7 DTM cannot state) -> undefined.
- `toDate(value, opts?): Date | undefined`: delegates to `dtmToDate`, so the zone rule and the
  sub-100-year handling are the existing ones, unchanged.
- All three accept `undefined` / `null` and return `undefined`. **None ever throws, for any input.**
- The three names are identical across the `@cosyte` parsers, so a consumer importing two of them
  aliases (`import { toISO as hl7ToISO } from "@cosyte/hl7"`) or namespace-imports.

### TS composite: `src/model/types/ts.ts`
- `TS` is the `DtmParts` shape (raw, valid, precision?, parts, hasTimezone, offsetMinutes?). Frozen.
  **No `.date`.** `parseTs(rep, enc)` = unescape → `parseDtm`.
- `field.ts::asTs()` returns it.

### Helpers: `TS`-typed fields (the fidelity reaches the consumer)
`meta.timestamp` (via cascade), `patient.dateOfBirth`, `visit.admit/dischargeDateTime`,
`observations.observedDateTime` + the `TS|DT` `TypedValue.value`, `allergies.onsetDate`,
`diagnoses.dateTime`, `insurance.effectiveDate` / `expirationDate`,
`immunizations.administeredDateTime` / `expirationDate`.

### Non-goals
Fidelity only: **no** localization, timezone conversion, or arithmetic; a missing offset is **flagged
sender-local**, never resolved. `HHMM=0000` is preserved (never rolled to the previous day). No new
warning code. Missing-tz is the structural `hasTimezone:false`, not a warning (avoids noise on the
overwhelmingly common no-offset feed).
