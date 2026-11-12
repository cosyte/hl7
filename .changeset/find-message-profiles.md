---
"@cosyte/hl7": patch
---

Add `findMessageProfiles(msg, entries)`, which finds the profile or profiles a message names in MSH-21 in a list you supply.

Each entry pairs an EI identifier with a profile (a `ConformanceProfile` by default, or any value). Each MSH-21 repetition matches an entry when the entity identifiers are equal and the assigning authorities agree: the universal ID decides when both carry one (with its type when both carry a type), else the namespace ID, and an identifier with no authority matches only an entry with none. The result's `outcome` is `undeclared`, `none`, `one` or `several`, so an unknown profile is never a silent pass, and `unmatched` lists every repetition nothing matched. No profile XML is read and no network call is made. Nothing existing changes, so a caller changes nothing. A new how-to page, Supply your own codes and profiles, shows binding your own code lists and picking a profile.
