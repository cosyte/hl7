---
"@cosyte/hl7": minor
---

Observations and orders now say whether a result is current: every observation carries `resultStatus`, its OBX-11 classified by HL7's published Table 0085 to Observation Status map, and every order carries `resultStatus`, its OBR-25 classified by HL7's Table 0123 to Diagnostic Report Status map. A result posted as wrong (`W`), deleted (`D`) or cancelled (`X`) no longer looks like a final one unless you keep your own copy of both tables.

- `resultStatus.classification` is one of `final`, `corrected`, `amended`, `preliminary`, `entered-in-error`, `cancelled`, `registered`, `partial` or `undetermined`.
- `undetermined` is the fail-safe. Codes HL7's maps leave unmapped (OBX-11 `B`, `I`, `N`, `O`, `R`, `S`, `V`, `U`; OBR-25 `A`, `Y`, `Z`, `M`, `N`) are `undetermined`, and so is an absent, empty or `""` field and any value that is not exactly one code: a lowercase `f`, whitespace around the code, a code written as an escape sequence, `FF`, `Q`, or more than one repetition or component such as `F~W`. Only an exact `F` is ever `final`.
- `resultStatus.code` is the raw code, byte-identical to the `status` or `orderStatus` beside it, and absent exactly when those are. `status` and `orderStatus` are unchanged.
- `resultStatus.table` and `resultStatus.map` name the table read (`HL7 Table 0085` or `HL7 Table 0123`, version `3.0.0`) and the map followed, by canonical URL and version `1.0.0`.
- Each OBX classifies from its own OBX-11 and each order from its own OBR-25; nothing is carried across segments. A status is reported, never applied: an `entered-in-error` observation is still returned.
- New exported types: `ResultStatusClass`, `ResultStatusClassification`, `ResultStatusTable` and `ResultStatusMap`. `ObservationBase` and `Order` gain the required `resultStatus` key, so code that builds those objects by hand must now supply it.
