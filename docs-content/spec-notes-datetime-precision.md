---
id: spec-notes-datetime-precision
title: "Spec notes: datetime precision & timezone fidelity"
sidebar_label: Datetime precision & timezone
---

# Spec notes: datetime precision + timezone fidelity

**Spec:** HL7 v2 Ch. 2A **DTM**: `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`; the number of
characters populated (excluding the offset) sets the precision; a missing offset "defaults to that of
the local time zone of the sender" (NOT UTC, NOT the parser's zone). TS→DTM moved precision from an
explicit degree-of-precision component to the value's length (v2.5/v2.7).

## Why there is no `Date` by default

A JavaScript `Date` is an absolute instant, and most HL7 v2 timestamps are not. `|1970|` is a year,
`|19880705|` is a calendar day, and a value with no offset is the _sender's_ local time by the
standard's own words. Materializing either as a `Date` means inventing a zone, and inventing UTC is
how a day-only date of birth `|19880705|` becomes a UTC-midnight instant that reads back as
**July 4** through `.getDate()` in any negative-offset zone. So this library parses DTM into typed
parts, keeps the precision it was given, and builds a `Date` only when the caller explicitly asks
for one.

## The API

### Core: `src/parser/dates.ts`

- `type DtmPrecision = "year"|"month"|"day"|"hour"|"minute"|"second"|"fraction"`.
- `interface DtmParts { raw; valid; precision?; year?; month?(1–12, spec-native); day?; hour?; minute?;
second?; fractionalSeconds?(verbatim digits, no dot); hasTimezone; offsetMinutes?(signed, iff tz) }`.
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
- `parseDtmDeclared(raw, formats): DtmParts`: the TS composite path's parse: try `parseDtm`; else
  the formats the CALLER declared, in order → parts from the matched tokens + `matchedFormat`.
  **Stops there.** No built-in fallback, deliberately (see below).
- `parseDtmCascade(raw, opts): DtmParts`: lenient wrapper for non-composite callers (`meta`):
  `parseDtmDeclared` first, else `BUILTIN_DATE_FALLBACKS`.
  `BUILTIN_DATE_FALLBACKS`/`SUPPORTED_DATE_TOKENS` unchanged.

### TS composite: `src/model/types/ts.ts`

- `TS` is the `DtmParts` shape (raw, valid, precision?, parts, hasTimezone, offsetMinutes?). Frozen.
  **No `.date`.** `parseTs(rep, enc, dateFormats?)` = unescape → `parseDtmDeclared`.
- `field.ts::asTs()` returns it, passing the message's merged `dateFormats`.

### Which datetimes honour `dateFormats`

`ParseOptions.dateFormats` ++ the applied profile's, deduped first-occurrence-wins, is
`msg.dateFormats`, and **every** datetime below honours it: `meta.timestamp`,
`patient.dateOfBirth`, `visit.admit/dischargeDateTime`, `observations.observedDateTime` + the
`TS|DT` `TypedValue.value`, `allergies.onsetDate`, `diagnoses.dateTime`,
`insurance.effectiveDate` / `expirationDate`, `immunizations.administeredDateTime` /
`expirationDate`, `charges.transactionDate`, `documents.activityDateTime`, order/medication
`timings.start/endDateTime` (`TQ1` and legacy embedded `TQ`), and
`appointments.start/endDateTime`.

**Built-in fallbacks stop at `meta.timestamp`.** `BUILTIN_DATE_FALLBACKS` carries `MM/DD/YYYY` and
no day-first form, so letting it follow the caller's hook onto a typed datetime would read a
day-first `05/07/1988` date of birth as a confident May 7. A declared format is the caller stating
what their sender means; a built-in fallback is the library guessing, and it does not guess on a
clinical datetime. A value matching no declared format stays `valid: false` with `raw` intact.

**No warning marks a fallback.** `TIMESTAMP_FALLBACK_FORMAT` exists as a code and
`parseDtmCascade` can emit it, but no parse supplies the emit hook it needs, so it does not appear
on `msg.warnings`. `matchedFormat` on the `TS` is the caller-visible signal, and it is a structural
value rather than a warning for the same reason missing-tz is (no noise on the overwhelmingly
common vendor feed).

### Non-goals

Fidelity only: **no** localization, timezone conversion, or arithmetic; a missing offset is **flagged
sender-local**, never resolved. `HHMM=0000` is preserved (never rolled to the previous day). No new
warning code. Missing-tz is the structural `hasTimezone:false`, not a warning (avoids noise on the
overwhelmingly common no-offset feed).
