---
"@cosyte/hl7": patch
---

Test bar — added executable PHI-safety property tests + documented the D10 coverage-relaxation
expiry.

A new `test/property/phi-safety.property.test.ts` locks two invariants: warning messages never
echo the VALUE of a field (only positional context + bounded metadata), and `Hl7ParseError.snippet`
length stays ≤ 41 chars even for adversarially-large inputs. Snippet **content** may carry PHI by
design — that's the documented consumer-redaction boundary at `parser/errors.ts:70-72` — so the
bound is what we lock, not the content.

The `vitest.config.ts` JSDoc now records a D10 expiry for the global `branches:85` relaxation,
naming the two events that lift the floor back to 90 (`src/profiles/**` coverage gets to 90, or
the profile system is replaced) and the re-evaluation cadence (every hl7 phase boundary).

No public-API change.
