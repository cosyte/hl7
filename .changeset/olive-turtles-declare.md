---
"@cosyte/hl7": patch
---

Conformance profiles: a profile can now declare which conformance LEVEL it claims, every result echoes the level in force, and a claim of the implementable level is checked rather than believed.

A zero-finding result was ambiguous in the one way that matters. It could mean "every element of this interface was determined and none was violated", or it could mean "the profile left optionality in place, so parts of the message were never assessed at all", and nothing on the result told the two apart. The HL7 conformance methodology draws exactly that line between profile LEVELS: a complete assessment of an interface declaring conformance to an implementable profile can be determined, while for standard-level and constrainable-level profiles not all aspects can be.

A profile may now declare `level`, one of the three the methodology defines, and `PROFILE_LEVELS` exports them as a frozen listing ordered from the least constrained to the most: `standard`, `constrainable`, `implementable`. The new `ProfileLevel` type makes the declaration a compile-time-checked member of the profile rather than a bare string.

**Every `ConformanceResult` now carries `level`**, beside `profileName`. It is present on every result, including one for a profile so malformed that even its name fell back to a sentinel, so a consumer reading it never has to check whether it is there.

**Declaring no level claims `constrainable`**, the weaker of the two claims a working profile can make. So a profile written before the declaration existed never reads as an implementable one, keeps producing exactly the findings it produced before, and is echoed at the level it was actually assessed at.

**A claim of `implementable` is CHECKED when the profile is defined.** The methodology's terminus is that in an implementable profile ultimately only two possibilities are allowed, either a specific element is supported (`R` or `RE`) or it is not (`X`), and that a conditional usage's true and false outcomes must also be defined only as `R`, `RE` or `X`. Three things refuse the claim, each `PROFILE_MALFORMED` naming the offending rule's structural locus and the offending declaration: a usage the level does not admit (`C`, `CE`, `O` or `B`), a declared conditional carrying an outcome it does not admit (`C(R/O)`), and a rule that declares no usage at all, since an omitted usage means Optional and the level asserts optionality is gone. That last one applies to segment, field and component rules alike, and it is the one place an omitted usage is ever refused: it is refused because the profile asked to be held to it. `C` and `CE` are refused even though the engine knows outcomes for them, because the methodology requires an implementable profile's conditional outcomes to be defined and a bare code defines them nowhere in the profile; an author who means `C` at this level writes `C(R/X)`.

**A refused claim is never the level echoed.** It falls back to `constrainable`, and that holds for any profile defect rather than only a level-derived one, because a run that returned diagnostics instead of assessing the message verified no claim of completeness, and a defect anywhere in a profile can stop the gate from ever reaching the rules below it.

**The level changes no message check.** It alters nothing about which findings fire for a given message, their severity, cardinality behaviour, predicate evaluation, or the value-set and coding-system checks. It decides whether the profile is refused, never what the message is found to be. A level that is not one of the three, including a value of the wrong type reaching the engine through an unchecked cast, is `PROFILE_MALFORMED` from `validateAgainstProfile` and a thrown `ProfileDefinitionError` from `defineConformanceProfile`, on the same terms as every other profile defect; the engine still never throws.

**And zero findings at `implementable` level is still not an attestation.** The level is the author's claim, checked for internal consistency against the profile itself, never an external, third-party or accredited statement.
