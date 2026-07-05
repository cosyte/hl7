---
"@cosyte/hl7": patch
---

Datetime precision + timezone fidelity — the TS/DTM composite (roadmap Phase N). **Breaking**
(pre-alpha `0.0.x`, unpublished).

HL7 v2 Ch. 2A DTM (`YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]`) sets a value's **precision** by
how many characters are populated, and a missing offset "defaults to that of the local time zone of
the **sender**" — not UTC, not the parser's zone. The prior implementation zero-filled truncations
(`|1970|` → `1970-01-01T00:00:00Z`) and coerced an offset-less value to UTC, an architectural defect
[S-DTM-IMPL]: a day-only birth date `|19880705|` became a UTC-midnight instant that reads as **July 4**
via `.getDate()` in any negative-offset zone — a silently wrong DOB.

The TS composite (`field.asTs()`) is now the fidelity `DtmParts`: `{ raw, valid, precision, year,
month (1–12, spec-native), day, hour, minute, second, fractionalSeconds (verbatim), hasTimezone,
offsetMinutes }`. Precision is preserved (no zero-fill), a missing offset is **flagged**
(`hasTimezone: false`) and never resolved, and no eager `Date` is built. An absolute instant is
materialized **only on explicit request** via `dtmToDate(ts, { assumeOffsetMinutes? })`, which refuses
to guess a zone for an offset-less value (returns `undefined`) rather than silently assuming UTC.
Applies wherever TS/DTM is read: `meta.timestamp`, `patient.dateOfBirth`, `visit.admit/dischargeDateTime`,
`observations.observedDateTime` + `TS`/`DT` observation values, `allergies.onsetDate`,
`diagnoses.dateTime`, `insurance.effective/expirationDate`, `immunizations.administered/expirationDate` —
each now surfaces the fidelity `TS` instead of a flat `Date`.

**Breaking API changes:** `TS` is no longer `{ raw, date }` (the `.date` field is removed — call
`dtmToDate(ts)` instead). The nine helper datetime fields listed above change type `Date → TS`. The
`parseHl7Timestamp` export (Date-returning, UTC-assuming) is **removed**; use `parseDtm` +
`dtmToDate`, or the lenient `parseDtmCascade` for the MSH-7 fallback-format path. New public exports:
`parseDtm`, `formatDtm`, `dtmToDate`, and types `DtmParts` / `DtmPrecision` / `DtmToDateOptions`.
**No warning-code change** — a missing timezone is the structural `hasTimezone: false` flag, not a
warning (which would fire on the overwhelmingly common offset-less feed).

Fidelity only: hl7 does **not** localize, convert, or do arithmetic on timestamps, and never rolls an
`HHMM=0000` value to the previous day — a consumer needing an absolute instant applies the sender's
zone itself. See `docs-content/spec-notes-datetime-precision.md`.
