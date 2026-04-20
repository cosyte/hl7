# vendor-quirks fixtures

One fixture per Tier-2 warning code in
`src/parser/warnings.ts::WARNING_CODES` (13 total). Each fixture parses in
lenient mode and — for warnings the parser currently emits — surfaces the
named code in `msg.warnings` and throws `Hl7ParseError` under
`{ strict: true }`.

## Filename contract (Plan 07-04 D-12)

Each filename is the kebab-case of the UPPER_SNAKE warning code:

```
mllp-framing-stripped.hl7      →  MLLP_FRAMING_STRIPPED
field-whitespace-trimmed.hl7   →  FIELD_WHITESPACE_TRIMMED
```

`test/parser-strict-mode-sweep.test.ts` derives the expected code via
`test/_helpers/fixture-code.ts::fileToCode`.

## Source of truth

`src/parser/warnings.ts::WARNING_CODES` (lines 26–40) is authoritative for
the code list. Adding a fixture for a new code requires (a) adding the code
to `WARNING_CODES` first — a project-level decision (Phase 5 D-27/D-28 and
Phase 6 D-31 carry forward the no-new-codes constraint) — then (b)
authoring the fixture here.

## Fixture inventory

| Filename                           | Code                         | Emits today? | Trigger / profile pairing                                         |
| ---------------------------------- | ---------------------------- | ------------ | ----------------------------------------------------------------- |
| `mllp-framing-stripped.hl7`        | `MLLP_FRAMING_STRIPPED`      | yes          | Wrapped in `0x0B` + body + `0x1C 0x0D` (read as Buffer)           |
| `field-whitespace-trimmed.hl7`     | `FIELD_WHITESPACE_TRIMMED`   | yes          | PID-3 leading/trailing whitespace                                 |
| `unknown-escape-sequence.hl7`      | `UNKNOWN_ESCAPE_SEQUENCE`    | yes          | `\Z99\` in OBX-5                                                  |
| `unknown-segment.hl7`              | `UNKNOWN_SEGMENT`            | yes          | `ZZZ` segment not in KNOWN_SEGMENTS and no profile claim          |
| `encoding-mismatch.hl7`            | `ENCODING_MISMATCH`          | yes*         | MSH-18=`UTF-8`; sweep passes `options.charset="ASCII"` override   |
| `unknown-charset.hl7`              | `UNKNOWN_CHARSET`            | yes          | MSH-18=`ISO IR 999` (unknown); read as Buffer                     |
| `segment-case.hl7`                 | `SEGMENT_CASE`               | **no**       | Lowercase `pid`; parser emits `UNKNOWN_SEGMENT` instead           |
| `extra-fields.hl7`                 | `EXTRA_FIELDS`               | **no**       | EVN padded beyond spec width; no emit site wired                  |
| `duplicate-required-segment.hl7`   | `DUPLICATE_REQUIRED_SEGMENT` | **no**       | Two MSH segments; no emit site wired                              |
| `missing-required-field.hl7`       | `MISSING_REQUIRED_FIELD`     | **no**       | Empty MSH-9; no emit site wired                                   |
| `out-of-order-segment.hl7`         | `OUT_OF_ORDER_SEGMENT`       | **no**       | PID before EVN; no emit site wired                                |
| `version-mismatch.hl7`             | `VERSION_MISMATCH`           | **no**       | MSH-12=`2.9`; no anchored "expected version" in lenient default   |
| `timestamp-fallback-format.hl7`    | `TIMESTAMP_FALLBACK_FORMAT`  | **no**       | MSH-7 ISO-8601; emit site only fires from composite callers       |

\* `ENCODING_MISMATCH` emits only when `options.charset` is supplied and
disagrees with MSH-18 (see `resolveBufferCharset` in
`src/parser/index.ts`). The sweep wires that option for this fixture only.

## Parser emission status (2026-04-19 baseline)

Six codes have active emit sites in the lenient default parser; **seven
codes have factory functions in `src/parser/warnings.ts` but no call site
wired into the parser pipeline** as of the close of Phase 6:

- `SEGMENT_CASE` — `segmentCase()` factory is never called. `splitSegments`
  preserves the lowercase name; the downstream `UNKNOWN_SEGMENT` scan
  surfaces the lowercase identifier instead.
- `EXTRA_FIELDS` — `extraFields()` factory is never called. The tokenizer
  preserves every field; no per-segment spec width is enforced.
- `DUPLICATE_REQUIRED_SEGMENT` — `duplicateRequiredSegment()` factory is
  never called. Duplicate MSH (or other singleton) segments flow through
  unflagged.
- `MISSING_REQUIRED_FIELD` — `missingRequiredField()` factory is never
  called. Empty required fields flow through unflagged.
- `OUT_OF_ORDER_SEGMENT` — `outOfOrderSegment()` factory is never called.
- `VERSION_MISMATCH` — `versionMismatch()` factory is never called from
  `parseHL7`. There is no anchored "expected version" in the lenient
  default path.
- `TIMESTAMP_FALLBACK_FORMAT` — `timestampFallbackFormat()` is emitted
  only by `parseHl7Timestamp` when an `emit` + `position` is supplied.
  The composite `.asTs()` call sites in `src/model/types/ts.ts` use
  `NOOP_EMITTER` (by design, per Phase 3 D-10). The meta builder in
  `src/helpers/meta.ts` calls `parseHl7Timestamp` without `emit`, so the
  warning cannot reach `msg.warnings` through `msg.meta` access either.

These are **latent Tier-2 codes** — reserved in the enum and locked by the
no-new-codes constraint (Phase 5 D-27/D-28), but not yet wired into the
parser. Wiring them is future work; the fixtures are authored now so that
when a future plan lands the emit site, the sweep automatically validates
it with zero test changes.

## Co-trigger policy (Plan 07-04 D-14)

Some fixtures emit additional warnings beyond their target (e.g.
`segment-case.hl7` currently emits `UNKNOWN_SEGMENT` because `pid` is not a
known HL7 segment name). The sweep uses `.toContain(code)` (not
`.toEqual([code])`), so co-triggers do not fail the test.

## Adding a new fixture

1. Confirm the target code exists in `src/parser/warnings.ts::WARNING_CODES`.
2. Author the fixture using `\r` separators, synthetic data, and the minimum
   bytes needed to trigger the target code.
3. Name the file as the kebab-case of the code.
4. The sweep at `test/parser-strict-mode-sweep.test.ts` picks it up
   automatically (`readdirSync` + `describe.each`).
5. Update the inventory table above, including the "Emits today?" column.
6. If the fixture requires `options.charset` or another non-default call
   signature, extend the per-filename option map in the sweep.

## Byte format

All fixtures use `\r` (`0x0D`) segment separators with **no trailing
newline**, except `mllp-framing-stripped.hl7` which additionally has
`0x0B` / `0x1C 0x0D` MLLP framing bytes. Fixtures were authored by
`scripts/write-vendor-quirks.mjs` so the byte content is reproducible.

## Synthetic data

All MRNs follow the `MRN-VQ-###` pattern; patient names are `Doe^John`.
No PHI. Message control IDs are `MSGVQ001`..`MSGVQ013`.
