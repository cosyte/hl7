# malformed fixtures

One fixture per Tier-3 fatal code in `src/parser/errors.ts::FATAL_CODES`
(4 total). Each fixture, when passed to `parseHL7`, throws an
`Hl7ParseError` with the named code; the error includes `position` and
`snippet` per the TOL-02 contract.

Tier-3 fatals are mode-independent — they fire in BOTH lenient (default)
and strict mode (they short-circuit before any Tier-2 check).

## Filename contract (D-23)

Each filename is the kebab-case of the UPPER_SNAKE fatal code. Example:
`no-msh-segment.hl7` → `NO_MSH_SEGMENT`.

`test/parser-malformed-sweep.test.ts` derives the expected code via
`test/_helpers/fixture-code.ts::fileToCode` (the same helper used by
the vendor-quirks sweep — pure string transform, no enum awareness).

## Source of truth

`src/parser/errors.ts::FATAL_CODES` (lines 31–36). The 4 codes are LOCKED
by Phase 2 / Phase 5 D-27/D-28 / Phase 6 D-31 — no new fatal codes in v1.

## Fixtures

| Filename                        | Fatal Code                  | Trigger                                                                                  |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| empty-input.hl7                 | EMPTY_INPUT                 | 0-byte file                                                                              |
| no-msh-segment.hl7              | NO_MSH_SEGMENT              | File starts with `EVN` (no MSH anywhere)                                                 |
| msh-too-short.hl7               | MSH_TOO_SHORT               | `MSH\|^~` (6 bytes; `readDelimiters` requires ≥ 8 chars to read MSH-1 + 4 encoding chars) |
| invalid-encoding-characters.hl7 | INVALID_ENCODING_CHARACTERS | MSH-2 has `^~\|S` after MSH-1 — field separator `\|` reappears among the 4 encoding chars |

## Co-trigger policy

Fatals short-circuit parse — once thrown, no further checks run. Fixtures
here cannot co-trigger; each isolates exactly ONE fatal.

## Adding a new fixture

Adding a new fixture requires first adding a new code to `FATAL_CODES`
— but the 4 codes are LOCKED for v1 (Phase 5 D-27 / Phase 6 D-31 carry
forward). If a v2 code lands:

1. Add the code to `FATAL_CODES`.
2. Author the fixture using the kebab-case filename convention.
3. The sweep at `test/parser-malformed-sweep.test.ts` picks it up
   automatically via `readdirSync`.

## Notes on the invalid-encoding fixture

`MSH|^~|SENDAPP|...` — `firstSegment.slice(4, 8)` returns `^~|S` (the
4 chars starting right after the `MSH|` prefix). Because the field
separator `|` appears among those 4 encoding chars, `readDelimiters`
throws `INVALID_ENCODING_CHARACTERS` on the "field separator must not
appear among MSH-2 encoding characters" branch.

Alternative triggers for the same code (not used here; sweep only needs
one fixture per code):

- MSH-1 is whitespace (e.g., `MSH ^~\&...`) — throws on the whitespace check.
- MSH-2 has duplicates (e.g., `MSH|^^^&...`) — throws on the distinct-chars check.
- MSH-2 contains whitespace (e.g., `MSH|^~\ ...`) — throws on the whitespace-in-chars check.
