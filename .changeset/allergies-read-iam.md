---
"@cosyte/hl7": minor
---

`msg.allergies()` now reads `IAM` (Patient Adverse Reaction Information) segments as well as `AL1`, so an ADT^A60, or any message that carries its allergies in `IAM`, no longer returns an empty list that reads as "no allergies recorded".

Before this release the helper walked `AL1` only. A conformant ADT^A60 carries `IAM` inside its adverse reaction groups and no `AL1` at all, so every allergy it sent was absent from `msg.allergies()`, with nothing to say the list was incomplete.

Each `IAM` is now one entry, in document order with any `AL1` entries around it. IAM-2 to IAM-5 fill `type`, `code`, `severity` and `reaction` in the same shapes an `AL1` entry uses. Four keys are new on `Allergy`:

- `source`: `"AL1"` or `"IAM"`, the segment the entry was read from. Always present, so a TypeScript literal typed as `Allergy` now has to set it.
- `actionCode`: IAM-6 component 1 exactly as sent, with no case-folding and no mapping. It is absent when IAM-6 is empty, never assumed to be `A`.
- `deleteRequested`: `true` when the action code is exactly `D`, meaning the sender asks the receiver to delete an allergy it sent earlier. The entry is still returned with every field it carries. A lowercase `d`, an unlisted code or a malformed IAM-6 (repeated, or with subcomponents) is surfaced as it arrived and not marked.
- `uniqueIdentifier`: IAM-7 components 1 and 2 (`entityIdentifier`, `namespaceId`). It is never filled from IAM-3 when IAM-7 is absent.

The helper reports what each segment said and applies none of it: a delete is not carried out, an update does not replace an earlier entry, and an `AL1` and an `IAM` for the same allergen stay two entries. It does not read the `IAR` and `NTE` segments under an `IAM`, IAM-1, or IAM-8 onward; `msg.segments("IAM")` reaches them. `AL1` entries are unchanged apart from `source: "AL1"`.
