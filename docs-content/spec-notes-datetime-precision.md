---
id: spec-notes-datetime-precision
title: "Spec notes: datetime precision & timezone fidelity (Phase N)"
sidebar_label: Datetime precision & timezone
---

# Phase N: datetime precision + timezone fidelity

**Item:** HL7-N · Parser class · P1. Roadmap `operations/roadmaps/hl7.md` §8a "Phase N".
**Spec:** HL7 v2 Ch. 2A **DTM**: `YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`; the number of
characters populated (excluding the offset) sets the precision; a missing offset "defaults to that of
the local time zone of the sender" (NOT UTC, NOT the parser's zone). TS→DTM moved precision from an
explicit degree-of-precision component to the value's length (v2.5/v2.7). All confirmed 3-0 (pass 5)
against primary Ch. 2A + HAPI `CommonTS`/`DTM`. Eager `Date`+assume-UTC is an architectural defect
[S-DTM-IMPL]. Open-question #12 resolves the direction: expose raw + parsed parts; build a `Date` only
on explicit caller request, never by default.

## The defect being fixed

`parser/dates.ts::parseHl7TsDtm` zero-fills truncations (`|1970|` → `1970-01-01T00:00:00Z`) and coerces
a missing offset to **UTC**. Helpers propagate that `Date` (D-18 "flat Date"): a day-only DOB
`|19880705|` becomes a UTC-midnight instant, which reads as **July 4** via `.getDate()` in any
negative-offset zone, an off-by-a-day DOB. Phase N replaces the coercion with fidelity.

## Design (locked)

### Core: `src/parser/dates.ts`
- `type DtmPrecision = "year"|"month"|"day"|"hour"|"minute"|"second"|"fraction"`.
- `interface DtmParts { raw; valid; precision?; year?; month?(1–12, spec-native); day?; hour?; minute?;
  second?; fractionalSeconds?(verbatim digits, no dot); hasTimezone; offsetMinutes?(signed, iff tz) }`.
- `parseDtm(raw): DtmParts`: pure structural parse of the HL7 DTM shape. **No zero-fill, no `Date`, no
  UTC.** Precision from populated length. Calendar-range check (month 1–12, day 1–31, hour 0–23,
  min/sec 0–59, offset ≤ ±24:00) → on bad shape/range `valid:false`, raw kept, parts omitted, never a
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
- **Remove** the public `parseHl7Timestamp` (Date-returning, UTC-assuming, the defect's public face).
  Breaking; deliberate; changeset + CHANGELOG breaking note.

### TS composite: `src/model/types/ts.ts`
- `TS` = the `DtmParts` shape (raw, valid, precision?, parts, hasTimezone, offsetMinutes?). Frozen.
  **No `.date`.** `parseTs(rep, enc)` = unescape → `parseDtm`.
- `field.ts::asTs()` unchanged signature; JSDoc example updated (parts, not `.date`).

### Helpers: flat `Date` fields → `TS` (fidelity reaches the consumer)
`meta.timestamp` (via cascade), `patient.dateOfBirth`, `visit.admit/dischargeDateTime`,
`observations.observedDateTime` + the `TS|DT` `TypedValue.value`, `allergies.onsetDate`,
`diagnoses.dateTime`, `insurance.effective/expirationDate`, `immunizations.administered/expirationDate`.
Update `helpers/types.ts` defs + each helper test.

### Tests / fixtures
- `datetime/precision-year.hl7` (`|1970|` DOB stays year), `datetime/no-timezone-midnight.hl7`
  (`|198807050000|` must not roll the day), `datetime/tz-offset.hl7`.
- Property: `parseDtm→formatDtm` round-trips to exact input (no zero-fill); no-offset ⇒
  `hasTimezone:false`; TS frozen/immutable.
- Unit: precision levels 4/6/8/14/19; tz presence + signed offset; `dtmToDate` refuses no-tz without
  `assumeOffsetMinutes`; invalid/short → `valid:false`.

### Non-goals (KNOWN-LIMITATIONS + CAPABILITIES)
Fidelity only: **no** localization, timezone conversion, or arithmetic; a missing offset is **flagged
sender-local**, never resolved. `HHMM=0000` is preserved (never rolled to the previous day). No new
warning code. Missing-tz is the structural `hasTimezone:false`, not a warning (avoids noise on the
overwhelmingly common no-offset feed).

### Assumption logged
Spec facts taken from the roadmap's verified (3-0, pass 5) traceability rather than re-researching;
the Step 4.5 `conformance-refuter` independently re-verifies against Ch. 2A.
