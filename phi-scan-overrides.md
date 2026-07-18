# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of
`scripts/phi-scan.ts`. The scanner refuses to honor a `--allow-fixture <path>`
flag UNLESS this file contains an entry referencing the same path. The committed
log is intentionally annoying — it discourages bypass and creates an audit
trail. Prefer extending `scripts/phi-allow-list.txt` (a token-level, reviewed
declaration) over a whole-file bypass.

## How the scanner detects PHI

`scripts/phi-scan.ts` is HL7 v2-shape-aware: it reads the message delimiters from
`MSH-1` / `MSH-2` (defaulting to `|^~\&` for a header-less message), splits
segments → fields → repetitions → components, and inspects only the fields that
actually carry each PHI category. A naive `Family^Given` text regex is
deliberately NOT used — it trips on coded values like `CBC^Complete Blood
Count^LN` or `Boston^MA`, which would be false confidence, not safety.

Two properties keep the structured scan from being silently bypassed (both were
caught by the conformance-refuter and fixed): a **header-less** fixture (the repo
ships `test/fixtures/malformed/no-msh-segment.hl7`, which starts with `EVN`) still
gets the full structured scan — any fixture-like file with a recognizable segment
line is parsed, not just one whose first byte is `MSH`; and segment ids are
matched **case-insensitively** (`pid` is normalized to `PID`), because the lenient
parser accepts lowercase segment ids and the scanner must not go blind where the
parser stays tolerant. `src/` is never parsed as HL7 (even when a file embeds an
`MSH|…` example string) — it gets the conservative dashed-SSN + email pass only.

| Category                     | Where it looks                                                                                                                                                                                                   | Rule                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patient / person names       | PID-5/-6/-9, NK1-2/-30, GT1-3, IN1-16, MRG-7, STF-3 (XPN comp1-3); PV1-7/-8/-9/-17/-52, PD1-4, ORC-10/-11/-12/-19, OBR-10/-16/-28/-32..35, OBX-16/-25, DG1-16, PR1-11, AIP-3, TXA-9/-10/-11, ROL-4 (XCN comp2-4) | each significant name token must be in the `NAME` allow-list (case-insensitive). Single Latin initials are skipped; single CJK ideographs are kept (Chinese/Korean surnames are one character); HL7 degree/suffix codes (MD, JR, …) are ignored. |
| Date of birth                | PID-7, NK1-16                                                                                                                                                                                                    | the normalized `YYYYMMDD` / `YYYYMM` / `YYYY` (DTM precision) must be in the `DOB` allow-list. A DOB is indistinguishable from a real one by shape, so the allow-list is the only sound gate — the same choice `@cosyte/x12` made.               |
| SSN                          | PID-19 (ST 9-digit); PID-3/-18 CX with identifier-type `SS`/`SSN`; dashed `\d{3}-\d{2}-\d{4}` anywhere                                                                                                           | a 9-digit SSN-shaped value must be in the `ID` allow-list; a dashed SSN anywhere is always a hit.                                                                                                                                                |
| MRN / account                | PID-3, PID-18 (CX comp1)                                                                                                                                                                                         | a bare 6-9 digit identifier is a real-looking MRN/account (or a misfiled SSN) and must be in the `ID` allow-list. Synthetic fixtures use prefixed shapes (`MRN…`, `ACCT…`, `FAKE…`), which pass.                                                 |
| Address                      | PID-11, NK1-4, GT1-5, IN1-19 (XAD comp1)                                                                                                                                                                         | a `<number> <word>` street line must be in the `ADDR` allow-list.                                                                                                                                                                                |
| Phone                        | PID-13/-14, NK1-5/-6/-7, GT1-6/-7 (XTN)                                                                                                                                                                          | a ≥10-digit number lacking the `555` fake-exchange convention is a hit.                                                                                                                                                                          |
| Email                        | anywhere                                                                                                                                                                                                         | an email whose domain is not an `EMAILDOMAIN` (reserved/test) domain is a hit.                                                                                                                                                                   |
| Site-defined (`Z…`) segments | every field                                                                                                                                                                                                      | backstop: an adjacent pair of single-token name-shaped components (`Johnson^Maya`) whose tokens are not allow-listed. Runs ONLY on segments outside the known-segment set, so coded triples in `OBX`/`OBR` are not misread as names.             |

## Documented limitations (propagation notes for ccda / ncpdp / mllp)

- **Free-text names.** OBX-5 / NTE narrative is scanned for identifier _shapes_
  (dashed SSN, email) but NOT for free-text personal names — a name in prose is
  not reliably separable from clinical vocabulary without NLP. A reviewer still
  owns clinical narrative. Structured name fields (the table above) are the hard
  gate.
- **Single-codepoint CJK below the initial threshold.** A single Latin letter is
  treated as a middle initial and skipped; single CJK ideographs are kept, so
  1-character CJK names ARE gated (via the allow-list). Latin single-letter given
  names (rare) are not.
- **MRN heuristic is shape-based.** A synthetic MRN that happens to be a bare
  6-9 digit number will be flagged until allow-listed — that is intentional
  (bare numeric ids are the real-MRN shape). Prefer a prefixed synthetic shape.
  Conversely, a real but _alphanumeric_ MRN (e.g. `H0034521`) is not
  distinguishable from a synthetic prefixed id and is not flagged — the name /
  DOB / SSN gates are the backstop for a real message committed by mistake.
- **Phone `555` accept rule.** A ≥10-digit number containing `555` anywhere is
  treated as the fictional-exchange convention and accepted — matching
  `@cosyte/x12`. A real DID that happens to contain `555` (e.g. a real
  `212-555-xxxx` line) would pass. The synthetic corpus uses `555` numbers, so
  tightening to the strict `555-01xx` reserved block would flag real fixtures;
  the convention is kept for sibling-parser parity.
- **Name-component positions.** The name detectors read the standard XPN
  (family=comp1) / XCN (family=comp2) component positions across the field map
  above. A name stored in a non-standard component slot, or in a name-bearing
  field not in the map, can be missed — the map covers the realistic patient +
  provider name fields, not every conceivable one.
- **Common-name masking (residual, inherent).** The `NAME` allow-list contains
  common real surnames/givens the synthetic corpus uses (SMITH, JONES, BROWN,
  JOHN, MARY, …). A real patient whose name is entirely common allow-listed
  tokens is therefore invisible to the name detector — a structural consequence
  of a token allow-list, shared by `@cosyte/x12`. The DOB / SSN / MRN / address
  gates remain the backstop. Flag for the ccda/ncpdp/mllp propagation.

## Format

Each entry is a markdown subsection:

```
### <path>

- **Date:** <YYYY-MM-DD>
- **Reason:** <one-line justification>
- **Approved by:** <committer name>
- **Expires:** <YYYY-MM-DD or "permanent">
```

## Entries

(none yet)
