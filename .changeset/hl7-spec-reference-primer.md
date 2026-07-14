---
"@cosyte/hl7": patch
---

Add a **standard-reference primer** to `docs-content/` (`spec-notes-primer.md`), the
first item under **Core Concepts**. The existing `spec-notes-*` pages are
implementation notes — what the parser does about one spec area. The primer is the
spec-grounded companion they elaborate: the HL7 v2.x encoding model (MSH-1/MSH-2
delimiter bootstrap, the fixed `CR` segment terminator, the
field→component→subcomponent hierarchy in which only fields repeat), the three
field population states (populated / not-populated / **null** `|""|`), the abstract
message grammar (`[ ]` / `{ }` / `[{ }]`, the base `OPT` column vs. the v2.7+
conformance `Usage` codes, and the required-different-name-separator rule that makes
a flat segment stream reconstructable into the group tree), message typing (the
**three**-component `MSH-9`), the acknowledgement model (original vs. enhanced via
`MSH-15`/`MSH-16`, `CA/CR/CE` vs. `AA/AE/AR`), and the composite data-type layouts a
parser must decode (`CX`, `XPN`, `XAD`, `HD`) with their version deltas. It
cross-links the phase notes for the areas they already cover (datetime, escapes,
coding-system, version matrix, structure) rather than duplicating them, and records
its provenance: the content is drawn from the primary Chapter 2 / 2.A text and was
adversarially fact-checked, with the official HL7 spec named as the text of record.

Documentation-only patch — no runtime or API change; `@cosyte/hl7` ships zero
runtime dependencies and the published artifact is unchanged.
