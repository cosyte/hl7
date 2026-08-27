---
id: spec-notes-identity
title: "Spec notes: patient-identity / merge events"
sidebar_label: Patient-identity & merge events
---

# Spec notes: patient-identity / merge events

`msg.identityEvents()` is the read-side surface for the ADT identity-management
trigger events. It exists for one safety-critical reason: **a mis-applied
patient merge conflates two patients or orphans clinical data under a retired
MRN**, the highest-harm ADT path the library previously left unmodelled. The helper's job
is to hand the consumer both sides of the merge, *labelled by role*, so the
consumer can never accidentally retire the survivor.

## Spec traceability

HL7 v2 Chapter 3 (Patient Administration):

- **A18** (merge patient information, backward-compat): *"The PID segment
  contains the surviving patient ID information. The MRG segment contains the
  non-surviving information."* The merge direction is therefore
  **spec-explicit and constant: MRG (prior) → PID (surviving)**. The helper
  surfaces it as the literal `direction: "MRG_TO_PID"` on every merge/move
  event and **never infers it from message content**.
- **A39/A40** (merge person / merge patient identifier list): the incorrect
  source identifiers travel in MRG and are *"logically never referenced in
  future transactions"* once merged into the target identifiers in PID.
- Recognized triggers and their classification:
  - `merge`: A18, A34, A35, A36 (v2.3-era merges), A39, A40, A41 (account),
    A42 (visit). Two records become one; the prior record is retired.
  - `move`: A43 (patient identifier list), A44 (account), A45 (visit).
    Information moves between identifier lists, accounts or visits that both
    go on existing.
  - `change`: A47 (patient identifier list), A49 (account number), A50 (visit
    number), A51 (alternate visit ID). One identifier is replaced by another
    on the **same** record: the direction is still MRG (prior) to PID
    (surviving), but nothing is being conflated, so a consumer keying on
    `merge` must not act on them.
  - `link` / `unlink`: A24 / A37 (two or more PID groups; the conformant
    shape carries **no MRG**, a nonconforming MRG is still surfaced, see the
    fail-safe section)
  - `add` / `update`: A28 / A31 (person add/update, no MRG)
- **The recognized set is floored by the published structures.** Every ADT
  trigger event whose published structure *requires* MRG is recognized,
  whether or not it is hand-classified above, so the read side can never fall
  behind the structures the parser validates against. An MRG-requiring event
  with no hand-classified kind is surfaced as `change` rather than `merge`:
  the conservative choice, because a consumer keying on `merge` must not begin
  conflating records on an event nobody reviewed.
- **MRG field map (version-scoped, v2.5.1 §3.4.10):** MRG-1 prior patient
  identifier list (CX, repeating) → `prior.identifiers`; MRG-3 prior patient
  account number → `prior.accountNumber`; MRG-4 prior patient ID
  (backward-compat, **withdrawn as of v2.7** in favour of MRG-1) →
  `prior.legacyPatientId`; MRG-5 prior visit number → `prior.visitNumber`;
  MRG-7 prior patient name (XPN) → `prior.name`.
- **Version gate:** on a message whose MSH-12 declares v2.7 or later, the
  withdrawn MRG-4 (and the symmetric withdrawn PID-2 on the surviving side)
  are **not read** as identity fields. An absent or unparseable MSH-12 falls
  back to the pre-v2.7 map (real-world ADT traffic is overwhelmingly
  v2.3–v2.5.1, where those fields are legal).

## The role-labelling invariant

Every party carries `role` **and** `sourceSegment` provenance:

- `surviving` / `subject` / `linked` parties are only ever built from
  **PID (+ the group's PV1)**.
- `prior` parties are only ever built from **MRG**.

A survivor can never be sourced from MRG and a prior can never be sourced from
PID. The invariant is structural (two separate builders) and enforced by a
property test over randomized segment layouts.

## Fail-safe behavior

A merge/move event with an incomplete MRG→PID pair surfaces **what is
present** plus a `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning *on the event*
(read-side helpers never mutate `msg.warnings`):

- PID group with no MRG → warning (`missing: prior`), survivor still surfaced.
- **An orphaned MRG is never dropped**. It yields its own event with the
  prior surfaced and a `missing: survivor` warning.
- A side that is present but carries **no usable identity field** warns too.
  "Usable" means a CX with an actual ID number (an assigning-authority-only
  `^^^HOSP` does not count) in the identifier list, the legacy single-ID
  field, the account number, or the visit number (account/visit count because
  they are the merge keys of A41/A42); a name alone never counts. This
  covers a PID with an empty PID-3, and (deliberately) a v2.7+ MRG whose
  only content was the version-gated MRG-4: the consumer must be able to
  distinguish "nothing to retire" from "prior gated away".
- The direction is **never guessed** on incomplete pairs; consumers should
  treat any warned event as not-safe-to-apply and route it for review.

Warning messages carry only structural facts (trigger code + which role is
missing), never an identifier, name, or any other field value (no PHI).

## Known limitations / non-goals

- The helper **surfaces** the merge; it does **not apply** it. Re-pointing
  stored data to the survivor (and maintaining a link graph for A24/A37) is
  the integration engine's / consumer's responsibility.
- No patient matching or probabilistic linkage, ever.
- **Not modelled** (these triggers return `[]`): **A30** (merge person
  information, the v2.3 backward-compat sibling of A34 to A36), **A46**
  (change patient ID) and **A48** (change alternate patient ID). The published
  structures this library ships do not name them, so there is no structure to
  floor them against; a consumer that needs them can read the raw segments
  meanwhile.
- MRG-2 / MRG-6 (prior *alternate* patient/visit IDs, withdrawn v2.7) are
  deliberately not surfaced. **A51** (change alternate visit ID) is recognized
  and its parties are surfaced, but its own merge key is MRG-6: an A51 whose
  only prior content is an alternate visit ID carries no usable prior
  identity field and therefore warns, exactly as the fail-safe above
  describes.
- `identityEvents()` keys on the trigger event alone (MSH-9.2, falling back
  to EVN-1). It does not require MSH-9.1 to be `ADT` (lenient toward vendor
  quirks).
