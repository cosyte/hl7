---
"@cosyte/hl7": patch
---

A malformed conformance profile's error no longer repeats the value you declared: it names the position, the kind of fault and what was expected, so a profile built from message text cannot carry that text into a log.

- `PROFILE_MALFORMED` findings and the `ProfileDefinitionError` that `defineConformanceProfile` throws drop the echoed value from four defects: a usage the grammar does not admit (`segment "PID" field 8 usage is not a usage code this profile may declare. Expected one of R/RE/C/CE/O/X/B, ...`, where it read `usage "RQ" is not ...`), a level outside the three, a coding system this library does not recognize, and a resolution's segment. Before, each showed up to 32 characters of the value.
- A resolution whose `segment` is not a segment name (`[A-Z][A-Z0-9]{2}`) is now refused by its index, `resolutions[0].segment must be a valid segment name`, at the `(profile)` locus. It used to report "matches no rule the profile declares" with the text in both the message and `locus.segment`, and several such members at one text were one finding; now each is its own.
- A number from the profile or the resolutions (a field, component or subcomponent index, a cardinality bound, a declared length) is shown only when it passed its own check and is at most 9999; otherwise the text reads `(a number above 9999)`, in malformed-profile details and in findings alike (`PID-(a number above 9999)`). A cardinality conflict is no longer reported when one of its bounds failed its own check, so `{ min: 3, max: -1 }` gives one defect, not two, and a conflict where either bound is above 9999 reads `cardinality.max is less than min.`
- A message still shows a value it has checked against a fixed set first: a segment name, a usage the grammar admits (as in the implementable-level defect) and a number within that bound. If you matched on the old text to find the offending value, use the position the message names instead.
- The profile's name is the one caller-chosen text handed back, as `result.profileName` and `ProfileDefinitionError.profileName`: it is your own identifier for telling results apart, not diagnostic text, and no message contains it.
