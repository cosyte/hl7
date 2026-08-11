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
- `parseDtmCascade(raw, opts): DtmParts`: lenient wrapper for non-composite callers (`meta`): try
  `parseDtm`; else user/builtin fallback formats → parts from the matched tokens + `matchedFormat` +
  `TIMESTAMP_FALLBACK_FORMAT` warning. `BUILTIN_DATE_FALLBACKS`/`SUPPORTED_DATE_TOKENS` unchanged.

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
