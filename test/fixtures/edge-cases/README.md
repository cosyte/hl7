# edge-cases fixtures

Tolerance and structural edge-case fixtures supporting TEST-03. Each
fixture isolates ONE scenario; the corresponding test in
`test/parser-edge-cases.test.ts` makes targeted assertions per scenario.

Unlike `vendor-quirks/` (parameterized fs-scan over filename → code),
`edge-cases/` tests are explicit per-scenario `it(...)` blocks because
each scenario has a unique assertion surface (some are Tier-1 silent,
some emit Tier-2 warnings, some affect helper output).

## Fixtures

| File                               | Scenario                                                | REQ-ID(s)         | Expected behavior                                   |
| ---------------------------------- | ------------------------------------------------------- | ----------------- | --------------------------------------------------- |
| lf-line-endings.hl7                | `\n` segment separators                                 | PARSE-08          | Tier-1 silent: no warning                          |
| crlf-line-endings.hl7              | `\r\n` segment separators                               | PARSE-08          | Tier-1 silent: no warning                          |
| mixed-line-endings.hl7             | Alternating `\r` / `\n` / `\r\n` separators             | PARSE-08          | Tier-1 silent: no warning                          |
| trailing-newline.hl7               | Body + trailing `\r`                                    | PARSE-08          | Tier-1 silent: trailing byte absorbed              |
| no-trailing-newline.hl7            | Body verbatim, no trailing byte                         | PARSE-08          | Tier-1 silent: baseline                            |
| empty-fields.hl7                   | `\|\|` runs (empty, NOT null)                           | PARSE-06          | RawField.isNull === false on the empty positions    |
| null-fields.hl7 (migrated)         | `""` markers (HL7 null sentinel)                        | PARSE-06          | RawField.isNull === true on the `""` positions      |
| consecutive-delimiters.hl7         | Multiple adjacent `\|`                                  | PARSE-05          | Field count correct (no fields silently dropped)    |
| unknown-escapes.hl7                | `\Z99\` in OBX-5                                        | TOL-10            | UNKNOWN_ESCAPE_SEQUENCE warning + verbatim preserve |
| custom-msh-delimiters.hl7          | MSH-1=`@`, MSH-2=`~&#\`                                 | PARSE-02          | Custom delimiters honored throughout                |
| truncation-char-msh2.hl7           | v2.7+ 5-char MSH-2 `^~\&#` + `\P\` escape in OBX-5      | Roadmap Phase A   | Parses (was fatal); `enc.truncation === "#"`; `\P\` decodes to `#`; no warnings |
| escape-highlight.hl7               | `\H\value\N\` highlight markers in OBX-5                | Roadmap Phase A   | No UNKNOWN_ESCAPE_SEQUENCE; sequences preserved verbatim for the renderer |
| escape-formatting.hl7              | `\.in\ \.sp\ \.ce\ \.fi\ \.nf\` formatting + `\C2842\` / `\M824041\` charset switches | Roadmap Phase A   | No UNKNOWN_ESCAPE_SEQUENCE on either; preserved verbatim |
| decoded-br.hl7 (migrated)          | `\.br\` multi-line OBX                                  | PARSE-03          | `\.br\` decoded to literal `\n` in raw tree         |
| embedded-delimiters.hl7 (migrated) | All 5 HL7 escape forms in PID-5                         | PARSE-03          | Each escape decoded then re-escaped on emit         |
| unicode-names.hl7                  | UTF-8 accented + CJK chars in PID-5                     | PARSE-09 / TOL-09 | UTF-8 preserved through round-trip                  |
| missing-optional-segments.hl7      | ADT^A01 without PV1                                     | HELPERS-03        | `msg.visit === undefined`                           |

17 fixtures total. Adding a new edge case requires (a) the fixture file
here and (b) a corresponding explicit `it(...)` block in
`test/parser-edge-cases.test.ts` with targeted assertions.
