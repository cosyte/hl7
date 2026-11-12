---
"@cosyte/hl7": patch
---

The v2 XML reader, the XML writer and `msg.patient` each refuse or flag a value they used to pass on quietly.

- `parseHL7Xml` refuses an element that repeats an attribute (`<NTE a="1" a="2">`) with `NOT_WELL_FORMED`, as XML requires, where it used to keep the last value.
- `toHl7Xml` refuses a hex escape holding a byte Windows-1252 assigns no character (81, 8D, 8F, 90 or 9D) with `ESCAPE_NOT_SUPPORTED`, where it used to write the C1 control of the same number as a character reference.
- `msg.patient.warnings` carries a new `NON_REPEATING_FIELD_REPEATED` warning for each of PID-35 Species Code, PID-36 Breed Code and PID-37 Strain that holds more than one repetition. `species`, `breed` and `strain` still read the first. The warning stays on the patient view and never reaches `msg.warnings`. New exports: the `NON_REPEATING_FIELD_REPEATED` code in `WARNING_CODES` and its factory `nonRepeatingFieldRepeated`.

What a caller must change: a `switch` over `WarningCode` that must cover every code needs a case for `NON_REPEATING_FIELD_REPEATED`. A document with a repeated attribute, or a Windows-1252 message whose hex escape holds one of those five bytes, is now refused rather than read or written.
