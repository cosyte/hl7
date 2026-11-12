---
"@cosyte/hl7": patch
---

A malformed conformance profile's error no longer repeats the value you declared: it names the position, the kind of fault and what was expected, so a profile built from message text cannot carry that text into a log.

- `PROFILE_MALFORMED` findings and the `ProfileDefinitionError` that `defineConformanceProfile` throws drop the echoed value from four defects: a usage the grammar does not admit (`segment "PID" field 8 usage is not a usage code this profile may declare. Expected one of R/RE/C/CE/O/X/B, ...`, where it read `usage "RQ" is not ...`), a level outside the three, a coding system this library does not recognize, and a resolution's segment. Before, each showed up to 32 characters of the value.
- A resolution whose `segment` is not a segment name (`[A-Z][A-Z0-9]{2}`) is now refused by its index, `resolutions[0].segment must be a valid segment name`, at the `(profile)` locus. It used to report "matches no rule the profile declares" with the text in both the message and `locus.segment`, and several such members at one text were one finding; now each is its own.
- A message still shows a value it has checked against a fixed set first: a segment name, a usage the grammar admits (as in the implementable-level defect) and cardinality numbers. If you matched on the old text to find the offending value, use the position the message names instead.
