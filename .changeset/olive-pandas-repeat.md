---
"@cosyte/hl7": patch
---

Segment names are matched without regard to case, so a sender shipping `pid` or `obx` no longer loses the segment.

Segment lookup was case-sensitive, and nothing normalized a segment name. A message whose PID arrived as `pid` or `Pid` returned `undefined` from `msg.patient`; a message whose OBX arrived as `obx` returned `[]` from `observations()`, so a haemoglobin of 7.1 g/dL flagged `L` was absent from a parsed result feed. Both cases warned, but the warning said the segment was `UNKNOWN_SEGMENT`: "not in HL7 spec and no profile claim". `PID` and `OBX` are in the standard, so the one diagnostic a reader had pointed away from the cause. The data was still reachable through `allSegments()`, so nothing was lost from the parse itself, but every typed accessor above it read the message as if the segment were not there.

A segment name on the wire is now folded to its canonical uppercase spelling for every lookup that asks which segment it is: `msg.segments()` and `getAll()`, the dot-path resolver, `msg.patient`, `observations()`, `medications()`, `notes()`, `appointments()`, `msg.structure`, profile claims on custom Z-segments, and the `setField` / `setComposite` / `removeSegment` writes, so a write targets the segment a read found. `SEGMENT_CASE` reports the deviation, which is what that code was reserved for and it had no emit site until now. `UNKNOWN_SEGMENT` still fires for a name no folding can recognise, and now says the comparison ignored case. The two are mutually exclusive: `SEGMENT_CASE` claims a segment resolved, so it is never reported for a name that resolved to nothing.

The fold applies to the **wire**, not to the query you write. `msg.segments("obx")` and `msg.get("obx.5")` are unchanged, because a vendor picks the spelling that arrives and you pick the one in your own source.

The fold is **ASCII-only**, and that is the load-bearing part rather than an implementation detail. Uppercasing by the Unicode rules turns a dotless Turkish `ı` into `I`, so `pıd` would become `PID` and the demographics of a segment the sender never sent would read as a real patient. Only `a`-`z` are mapped, so a lookalike stays unrecognised and reports `UNKNOWN_SEGMENT`, which is the honest answer.

The spelling that arrived is preserved, not corrected: it stays on `RawSegment.name` and is what `toString()` re-emits, so the byte-exact round-trip is unchanged. `Segment.type` now reports the canonical spelling, since that is the field every lookup compares and the field a consumer switches on; read `Segment.raw.name` for what the sender actually sent.

Strict mode accepts nothing it rejected before. Every input that threw still throws: a known segment that is merely miscased throws `SEGMENT_CASE`, and an unrecognised segment still throws `UNKNOWN_SEGMENT`, the code it always threw. A lowercase `msh` remains the `NO_MSH_SEGMENT` fatal, deliberately: MSH is what delimiter discovery reads before any segment name exists to fold, so widening it would change what counts as a message at all.
