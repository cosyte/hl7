# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the complete v1 API surface below. An earlier
`0.1.0` tag was prepared but never published, so the package begins its public history at `0.0.x`,
per the cosyte version ladder (`0.0.x` until first alpha).

### Added

- **Formatted-text rendering + a first-class text codec (HL7-R, Phase R — first of the v2.4
  capability arc).** Completes Phase A's explicit defer: the lenient parser preserves the
  presentational escapes (`\H\`/`\N\` highlight, the `\.sp\`/`\.in\`/… formatting commands, charset
  switches, vendor `\Z..\`) as un-rendered sentinels; a note surfaced to a human with those raw
  sentinels in it is **misread**. Two additions close that, as an opt-in **layer** over the unchanged
  raw extraction (Postel's Law — existing parse output is byte-for-byte identical):
  - **`renderText(input, enc?, opts?)`** turns HL7 v2 §2.7 escape/formatting-bearing content into a
    normalized **display model** — a plain-text `text` (formatting commands → whitespace/line breaks
    per a conservative, documented normalization; highlight boundaries dropped) plus highlight-aware
    `runs` (`{ text, highlighted }[]`). It **never fabricates**: a charset switch, a vendor `\Z..\`,
    or a malformed/unterminated escape is preserved as its literal characters and flagged in
    `unrenderedSequences`, never dropped or replaced with a guessed glyph. Grounded firsthand on the
    HL7 v2 Ch. 2 §2.7 escape spec (delimiter §2.7.1, charset §2.7.2/3, hex §2.7.5/6, formatting
    commands §2.7.6/7 [FT], local `\Z..\` §2.7.7/8, truncation §2.5.5.2 — confirmed against the
    v2.5.1 and v2.8.2 chapter text). **`Field.render(opts?)`** is the one-call form on a parsed field.
  - a first-class **text codec** — `decodeText` / `encodeText`, also bundled as the `text` namespace
    (`text.decode` / `text.encode` / `text.render`). The load-bearing invariant is **encode-safety**:
    `encodeText` escapes every reserved character (the escape char first, then the
    field/component/subcomponent/repetition separators, the truncation char, and framing-critical
    CR/LF) so an arbitrary string round-trips (`decodeText(encodeText(s)) === s`) and re-parses to
    exactly itself with **no delimiter injection** — a value can never break framing or forge a
    component boundary. This is the safe-encode primitive Phase T (typed emit) will build on.

    New public exports: `renderText`, `decodeText`, `encodeText`, the `text` namespace,
    `Field.render()`, and the `RenderedText` / `TextRun` / `RenderTextOptions` types. Ships four
    synthetic, PHI-scanned `fixtures/text/*.hl7` fixtures (formatting note, highlight, hex+delimiters,
    inject-on-encode) plus a property layer (encode-safety over arbitrary strings; `renderText` is
    total; a formatting sentinel never survives into the plain-text render). No new warning codes.

- **`profiles.va` — eighth built-in vendor profile (VA VistA Radiology/Nuclear Medicine imaging).**
  Declares the `ZDS` Z-segment that carries the DICOM **Study Instance UID** (field 1, `RP` composite —
  the UID sits in the first component, ZDS-1.1 "Pointer") so a VistA radiology feed parses without an
  `UNKNOWN_SEGMENT` warning and `zds.get("studyInstanceUid")` resolves by name. `ZDS` is the **IHE
  Radiology** RIS↔PACS bridge segment — the same cross-vendor extension `profiles.visage` and
  `profiles.philips` declare, **not** a VA-proprietary quirk; the value this profile adds is a distinct
  **named federal source** and coverage of the shape the VA spec documents that the imaging-vendor
  specs do not: `ZDS` on **ORU** (result) messages (VistA sends `ZDS` in both ORM and ORU). Grounded in
  the **publicly published** [Radiology/Nuclear Medicine 5.0 HL7 Interface Specification](https://www.va.gov/vdl/documents/clinical/radiology_nuclear_med/ra5_0hl7is.pdf)
  (Version 3.6, Patch RA\*5.0\*203, June 2024, U.S. Department of Veterans Affairs), which documents
  "ZDS Segment Fields in ORU and ORM" — not an invented quirk (ADR 0018). The spec's messaging is
  HL7-native v2.4, so the profile declares no custom date formats. Ships one synthetic, PHI-scanned
  `vendor-shapes/va/oru-r01.hl7` (ORU^R01 + ZDS) fixture whose Study Instance UID uses the Medical
  Connections free UID root, not the reserved DICOM arc. Additive: no change to existing profiles,
  warning codes, or the parse/serialize surface.

- **`profiles.philips` — seventh built-in vendor profile (Philips Vue PACS "IS Link" imaging).**
  Declares the six Vue PACS custom Z-segments, one per filler role: `ZDS` (DICOM **Study Instance
  UID**, an RP composite whose first component is the UID), `ZLK` (linked studies / linked orders),
  `ZAO` (order additional details — modality, body part, result-transfer + acquisition status,
  technician and radiologist name/id, and the vendor's custom string/number/date slots), `ZEB`
  (encrypted patient-info blob), `ZAP` (patient additional details), and `ZAV` (visit additional
  details) — so a Vue PACS ORM/ADT feed parses without `UNKNOWN_SEGMENT` warnings and each field
  resolves by name (e.g. `zao.get("acquisitionStatus")`). Field positions are transcribed **verbatim**
  from the spec, including two of its own gaps (`ZAO` has no field 7; `ZAP` has no field 2). Grounded
  in the **publicly published** [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf)
  (Philips, doc HA1669 Rev A, §§5.11–5.16) — not an invented quirk (ADR 0018). Vendor `TS` timestamps
  are HL7-native, so the profile declares no custom date formats. Naming the `ZEB` field is precisely
  how a consumer learns that segment is PHI-bearing and must not be logged; the profile only _names_
  fields — it never decodes, decrypts, or rewrites them. Ships two synthetic, PHI-scanned fixtures
  (`vendor-shapes/philips/orm-o01.hl7` order-filler; `vendor-shapes/philips/adt-a08.hl7`
  patient/visit-filler) with documented provenance. Additive: no change to existing profiles, warning
  codes, or the parse/serialize surface.

- **`profiles.visage` — sixth built-in vendor profile (Visage 7 imaging/PACS).** Declares the `ZDS`
  Z-segment that RIS/PACS order feeds use to carry the DICOM **Study Instance UID** (field 1, first
  component), the IHE Radiology bridge that correlates an HL7 order to its DICOM study — so an
  imaging ORM parses without an `UNKNOWN_SEGMENT` warning and `zds.get("studyInstanceUid")` resolves
  by name. Grounded in the **publicly published** [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf)
  (V23.00, Jun 2026, Visage Imaging GmbH) — its §4.4 ORM^O01 example and ZDS segment table — not an
  invented quirk (ADR 0018: public specs unblock quirk-corpus work; a _specific undocumented_ vendor
  deviation still waits on a private feed). Vendor dates in that spec are HL7-native, so the profile
  declares no custom date formats. Ships with a synthetic `vendor-shapes/visage/orm-o01.hl7` fixture
  (PHI-scanned) and a `test/fixtures/vendor-shapes/README.md` recording per-fixture provenance.
  Additive: no change to existing profiles, warning codes, or the parse/serialize surface.

- **PHI commit-scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`).** A zero-dependency, HL7 v2
  shape-aware scanner that refuses fixtures — and a conservative text pass over `src/` — carrying
  real-looking PHI, so a real patient message can never be committed by accident. It parses each
  message's delimiters (`MSH-1` / `MSH-2`) and inspects only the fields that actually carry each
  category: patient / person names (PID-5/-6/-9, NK1-2, GT1-3, IN1-16, MRG-7 as XPN; PV1-7/-8/-9/-17,
  ORC-12, OBR-16, AIP-3, TXA-9, ROL-4 as XCN, reading the family/given from the correct components),
  dates of birth (PID-7 / NK1-16), SSNs (PID-19, CX identifier-type `SS`, dashed patterns anywhere),
  MRN / account numbers (PID-3 / -18), addresses (PID-11 / NK1-4 / GT1-5 / IN1-19), phones
  (PID-13/-14 / NK1 / GT1 without the `555` fake-exchange convention), non-test emails, and a
  site-defined `Z…`-segment name backstop — deliberately NOT a naive `Family^Given` text regex, which
  would trip on coded values like `CBC^Complete Blood Count^LN` (false confidence). Synthetic
  fixtures are positively declared in `scripts/phi-allow-list.txt` (HL7 v2 is byte-strict at the
  front, so an inline `# synthetic: true` header is impossible — same model as `@cosyte/dicom` /
  `@cosyte/x12`); a whole-file bypass requires `--allow-fixture` **and** an audit entry in
  `phi-scan-overrides.md`. All `git` calls use `execFileSync` array-args (never shell-form). Runs at
  pre-commit (`simple-git-hooks --staged`) and in CI (`run-phi-scan: true`); `scripts/verify.sh` now
  reports `phi-scan ✓`. Dev-tooling only — no change to the published package surface or warning codes.

- **Trademark notice (`TRADEMARKS.md`).** This package names third-party systems to describe what it
  interoperates with; the notice records that cosyte is not affiliated with, endorsed by, or
  sponsored by any of them, that every reference is descriptive, and that the built-in profiles are
  authored from public sources only. Added to `files` so it ships inside the published tarball, not
  just on GitHub. Documentation only — no runtime or API change.

- **Full documentation Diátaxis spine + doc/code-agreement gate (DOCS-CONTENT-P1).** `docs-content/`
  gains **Installation**, **Quickstart**, **Guides**, and **Troubleshooting** (with Known
  Limitations) categories on top of the existing Overview + Core Concepts, authored from the real API
  against synthetic messages — the template of record every other cosyte parser's docs copy. A new
  `test/docs-content.test.ts` runs `@cosyte/vitest-config@^0.0.2`'s `docSnippetSuite()` over the
  pages, so every ` ```ts runnable ` snippet is compiled, executed against the built package, and its
  inline `// =>` assertions checked — a documented example can never silently drift from the code.
  Bumps the `@cosyte/vitest-config` devDependency `^0.0.1 → ^0.0.2`. Documentation + test-tooling
  only — no runtime/API change; the published artifact is unchanged.

### Changed

- **`profiles.meditech` re-grounded to a public MEDITECH spec (HL7-I, ADR 0018).** The profile's
  Z-segment map previously declared a `ZVI` "visit info" segment (`visitReason`/`admitSource`) that
  was a **community-sourced prior with no citable public source**. No public MEDITECH spec documents
  a `ZVI` segment, so — per the "encode a quirk only when a real, publicly-documented spec grounds
  it" mandate — `ZVI` was **removed** and replaced with the DFT charge Z-segments MEDITECH documents
  verbatim in its **publicly downloadable** [Ancillary Charges (LAB/PHA/ITS/IDM) Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/ancillary-charges-outbound-21.pdf)
  spec (Version 2.1, © 2021 Medical Information Technology, Inc.): `ZF1` ("PROVIDER ENCOUNTER COPAY
  DATA" — `providerEncounter`, `misServiceGroup`, `serviceGroupCopay`, `visitCopay`, `copayMinimum`,
  `copayMaximum`) and `ZF2` ("ENCOUNTER PROCEDURE DATA" — `setId`, `providerEncounter`,
  `encounterDate`, `encounterProcedure`, `encounterProcedureQuantity`, `encounterProcedureCharge`,
  `prvProcedureAmountPaid`, `prvProcedureAmountDue`). The profile's `YYYYMMDDHHMM` minute-precision
  timestamp format is **kept and now spec-cited** — confirmed by that spec (MSH-7 length 12; EVN-2 /
  PID-7 "Format is YYYYMMDDHHMM") and by the [Admissions and Registration Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/admissions-registration-outbound-24.pdf)
  spec (Version 2.4, © 2021) — "Date and Time in Admissions. Format is YYYYMMDDHHMM". The vendor-shape
  fixture moved from `vendor-shapes/meditech/adt-a04.hl7` (ADT + `ZVI`) to
  `vendor-shapes/meditech/dft-p03.hl7` (DFT^P03 + `ZF1`/`ZF2`), synthetic and PHI-scanned. Consumers
  who relied on `ZVI` from `profiles.meditech` — an ungrounded mapping — must declare it themselves
  via `defineProfile({ extends: profiles.meditech, customSegments: { ZVI: … } })`. `epic`, `cerner`,
  `athena`, and `genericLab` remain community-sourced priors, tracked for the same treatment.

- **Dropped the "Dogfooded in production" claim from the README feature list.** The bullet asserted
  the package was "used internally on healthcare-integration projects"; no engagement has run it, so
  the claim was not accurate and has been removed ahead of the first public release. `README.md`
  ships inside the published tarball, so this is a user-visible docs change. No runtime/API change.

### Fixed

- **`scripts/sync-version.mjs` hardened against two latent defects, and gated in CI
  (SYNC-VERSION-HARDENING).** Follow-up hardening on the VERSION-SYNC script; ported byte-identically
  across `hl7`, `x12`, and `mllp`. (1) The version was spliced into `src/index.ts` via
  `String.prototype.replace` with a _replacement string_, which interprets `$&`, `$1`, `` $` ``, etc.,
  so a version like `1.2.3-$&x` would inject the matched text and corrupt the `VERSION` constant while
  exiting 0 — the replacement is now a replacer _function_, whose return value is inserted literally.
  (2) The declaration regex was non-global, so `.replace` silently rewrote the _first_ match; a
  column-0 decoy (e.g. inside a comment) ahead of the real declaration could be edited instead — the
  script now matches globally, asserts exactly one declaration, and exits non-zero loudly otherwise.
  Neither defect is reachable through Changesets today and both previously failed loud rather than
  shipping a lying `VERSION`, so this is hardening, not a fix for an observed break. The
  `format`/`format:check` globs now cover `scripts/**/*.mjs` so the script is prettier-gated in CI (it
  was matched by no glob before). Build tooling only — no runtime or public-API change.
- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own — so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only — no runtime or API change.

- **The `VERSION` export now tracks `package.json`, and the missing `version` script is restored
  (VERSION-SYNC).** Two latent release bugs, both of which would have bitten at the first publish.
  (1) `VERSION` was hardcoded `"0.0.0"` in `src/index.ts` while `changeset version` bumps only
  `package.json`, so a published `0.0.1` would have shipped an export reading `"0.0.0"` — every
  consumer asserting on or logging `VERSION` told the wrong version of the parser they were running.
  New `scripts/sync-version.mjs` rewrites the constant from `package.json` (idempotent; exits
  non-zero if the declaration is renamed rather than silently no-op'ing). (2) **No `version` script
  existed at all** — the shared `cosyte/.github` release workflow drives Changesets with
  `version: pnpm run version`, which would have failed with `ERR_PNPM_NO_SCRIPT`, so the "Version
  Packages" PR could never have been opened. `test/sanity.test.ts` now compares `VERSION` against
  `package.json` rather than asserting its shape against a regex — the old test would have stayed
  green through exactly this drift. Ported from `@cosyte/mllp` (MLLP-10); `hl7` is the canonical
  form the siblings mirror. No version bumped, nothing published — still `0.0.0`.

- **Value reads no longer double-decode (HL7-VALUE-REDECODE). Behavior change on a rare, spec-legal
  input (pre-alpha).** The tokenizer already unescapes every subcomponent once on parse, but
  `Field.value`, the dot-path `get()`/`resolvePath`, and the composite coercions (`asXpn`/`asCwe`/`asCx`/…
  via the shared `readSubcomponent`, plus `asNm`/`asTs`) ran a **second** `unescape` over the
  already-decoded value. A value whose own decoded bytes look like an escape was therefore decoded
  twice: a wire `\E\F\E\` decodes once to the literal `\F\`, which the second pass wrongly turned into
  the field separator `|`. Readers now return the once-decoded subcomponent verbatim
  (`field(5).value` of `A\E\F\E\B` is `A\F\B`, not `A|B`); the common single-escape case is unchanged
  (`\F\` → `|`), and emit stays byte-verbatim (the HL7-ESC raw overlay is a separate, untouched path).
  Found by the HL7-ESC conformance-refuter; pinned by `test/value-redecode.test.ts`.

### Changed

- **Datetime precision + timezone fidelity — the TS/DTM composite (roadmap
  Phase N). Breaking (pre-alpha).** `field.asTs()` and every helper datetime now
  return the fidelity `TS` (`DtmParts`: `{ raw, valid, precision, year, month
(1–12, spec-native), day, hour, minute, second, fractionalSeconds (verbatim),
hasTimezone, offsetMinutes }`) instead of the old `{ raw, date }`. HL7 v2
  Ch. 2A DTM sets a value's **precision** by how many characters are populated,
  and a missing offset defaults to the **sender's** local zone — not UTC. The
  prior code zero-filled truncations (`|1970|` → `1970-01-01T00:00:00Z`) and
  coerced an offset-less value to UTC, which silently shifted a day-only birth
  date `|19880705|` to the previous calendar day in any negative-offset zone
  [S-DTM-IMPL]. Now precision is preserved (no zero-fill), a missing offset is
  **flagged** (`hasTimezone: false`) and never resolved, and no eager `Date` is
  built. An absolute instant is materialized **only on explicit request** via
  `dtmToDate(ts, { assumeOffsetMinutes? })`, which returns `undefined` for an
  offset-less value rather than guessing UTC. Applies to `meta.timestamp`,
  `patient.dateOfBirth`, `visit.admit/dischargeDateTime`,
  `observations.observedDateTime` + `TS`/`DT` observation values,
  `allergies.onsetDate`, `diagnoses.dateTime`, `insurance.effective/expirationDate`,
  and `immunizations.administered/expirationDate` — each `Date → TS`. Fidelity
  only: no localization, timezone conversion, or arithmetic; `HHMM=0000` is never
  rolled to the previous day. New public exports: `parseDtm`, `formatDtm`,
  `dtmToDate`, and types `DtmParts` / `DtmPrecision` / `DtmToDateOptions`. **No
  warning-code change** (a missing timezone is the structural `hasTimezone: false`
  flag, not a warning). See `docs-content/spec-notes-datetime-precision.md`.

### Removed

- **`parseHl7Timestamp` (and its `ParseHl7TimestampOptions` type) — removed
  (Phase N, breaking).** The Date-returning, UTC-assuming timestamp helper is
  replaced by the fidelity `parseDtm` + explicit `dtmToDate`, with
  `parseDtmCascade` covering the MSH-7 user-format fallback path.

### Fixed

- **Escape-sequence emit is now byte-verbatim across the full alphabet
  (HL7-ESC).** The decoded tree conflated recognize-and-preserve escapes (`\H\`,
  `\N\`, `\.sp\`/formatting, `\Cxxyy\`/`\Mxxyyzz\` charset switches, vendor
  `\Z..\`) and hex escapes (`\X41\`) with literal backslashes, so serialize
  **double-escaped** the former (`\H\` → `\E\H\E\`) and **decoded** the latter
  (`\X41\` → `A`, and non-canonical hex casing `\X0d\` → `\X0D\`). Emitted output
  was spec-clean and lossless-as-text but **not byte-verbatim** — a byte-level
  MSA-2/MSH-10 correlation (HL7 v2 §2.9.2.2) could fail. The tokenizer now
  records each affected subcomponent's **original wire bytes** in an internal
  `RawComponent.rawSubcomponents` overlay and the serializer emits from it
  verbatim, so `parseHL7(x).toString()` and `Field.text` reproduce the sender's
  exact escape bytes. `buildAck`'s MSA-2 echo is byte-exact for a
  default-delimiter sender; a **custom-delimiter** sender is re-delimited
  spec-cleanly (the overlay is bypassed when the ACK's encoding differs from the
  inbound's — the sender's raw bytes would otherwise corrupt MSA-2's structure
  under default delimiters — and the decoded id re-parses back correlation-correct
  per §2.9.2.2). **The `\X..\` policy is
  decode-on-read, re-encode-on-emit** (the decoded value surface is unchanged;
  the wire bytes — value and casing — are preserved). Delimiter/newline escapes
  are unaffected (they already round-trip through `reescape`); a decoded CR still
  re-emits as `\X0D\` to protect wire framing. **No public-surface break** —
  `Field.value` and every composite/`toJSON` read the same decoded values as
  before; the overlay is `@internal` and absent from escape-free messages. See
  `docs-content/spec-notes-escapes.md`.
- **PHI leak in the warning surface — `fieldWhitespaceTrimmed` and `unknownEscapeSequence` no
  longer embed field-body content (HL7-TOKENIZE-PHI).** Both builders previously interpolated
  slices of the field VALUE directly into `Hl7ParseWarning.message`
  (`fieldWhitespaceTrimmed`'s before/after strings; `unknownEscapeSequence`'s raw escape body, and
  on an unterminated escape the **entire rest of the field**), so a clinical NTE-3/OBX-5 free-text
  value (PHI) carrying a stray `\` or surrounding whitespace could surface a payload fragment in
  `Hl7Message.warnings` — a leak, since every other warning builder is structural-facts-only.
  `fieldWhitespaceTrimmed`'s signature changed to take leading/trailing **counts** instead of the
  original/trimmed strings; `unknownEscapeSequence` now reports only the escape body's **length**
  plus, when the body's first character is a recognized HL7 escape-identifier letter (`F S T R E
X C M Z H N` or a `.`-prefixed formatting escape — structural HL7 grammar, not PHI), that single
  letter — never the body text. A new `unterminatedEscapeSequence` factory (still
  `UNKNOWN_ESCAPE_SEQUENCE`) covers the unterminated-escape case with no content and no
  tail-length. **No change to parse tolerance or round-trip fidelity** — the escape sequence and
  the whitespace are still preserved verbatim in the parsed/emitted output; only the WARNING
  message lost the body. The `FIELD_WHITESPACE_TRIMMED` / `UNKNOWN_ESCAPE_SEQUENCE` codes are
  unchanged and stable (see `test/warning-codes.snapshot.test.ts`) — this is a message-format fix,
  not a breaking change to the code registry.
- **`buildAck` now echoes the full inbound MSH-10 field into MSA-2** — the raw
  field structure is carried over whole (delimiters and repetitions included)
  instead of the component-1-only `meta.controlId` scalar. A vendor-quirk
  control id carrying an unescaped delimiter (`ID^X`) was previously truncated
  to `ID` silently, under a confident positive ACK — a sender correlating on
  the raw MSH-10 bytes (as `@cosyte/mllp`'s client does) would never match the
  ACK and resend indefinitely (HL7 v2 §2.9.2.2: an MSA-2 mismatch is a
  correlation failure). The no-correlation fail-safe now keys on the raw field
  carrying any content, so a leading-delimiter id (`^X`) correlates instead of
  being spuriously downgraded. The echo is now **byte-verbatim** across the full
  escape alphabet (see the escape-fidelity entry below) — the earlier
  canonicalization limits (hex escapes decoding to their byte, preserved escapes
  re-emitting as escaped literal text) are resolved. The only remaining
  transform is structural: the ACK emits with default encoding characters and
  trailing insignificant empties canonicalize (D-02).
- **`reescape` now emits a literal CR in decoded content as its `\X0D\` hex
  escape** instead of passing it through raw. A spec-legal `\X0D\` in any
  inbound field decoded to a bare CR — the HL7 segment separator — and
  re-serializing it corrupted the emitted message's framing (a phantom
  segment split mid-field, silently). Reachable through `buildAck`'s MSA-2
  echo among every other emit path; now structurally safe and round-trip
  stable.
- **`interpretAck` surfaces MSA-2 whole** (read-side symmetry) —
  `Acknowledgment.controlId` is now the field's canonical wire text
  (`Field.text`), not its first component.

### Added

- **Scheduling / document / charge breadth helpers — `appointments()`,
  `documents()`, `charges()` (roadmap Phase Q, P2).** Three new message-family
  helpers on `Hl7Message`, each mirroring the existing extractor pattern (typed,
  frozen, never-throws, not memoized):
  - **`appointments()`** over **SIU** (S12/S13/S14/S15/S26) — projects each
    **SCH** into a typed `Appointment`: placer/filler appointment ids (SCH-1/2),
    **SCH-25 filler status** (Table 0278, verbatim), **SCH-11** start/end timing
    (TQ.4/TQ.5, fidelity `TS`), and the **AIS/AIG/AIL/AIP** resource groups that
    follow it — surfaced as `AppointmentResource`s tagged `service` / `general` /
    `location` / `personnel` (the personnel/provider resource also carries a
    typed `XCN`).
  - **`documents()`** over **MDM** (T02/T04/T06) — projects each **TXA** into a
    typed `ClinicalDocument` with the OBX narrative body grouped positionally
    under it. **Completion status (TXA-17, Table 0271) and availability status
    (TXA-19, Table 0273) are surfaced as DISTINCT fields and NEVER conflated** — a
    document can be _available_ before it is _authenticated_, and reading a
    preliminary document as final is the clinical harm this split prevents. Both
    are verbatim / provenance-only.
  - **`charges()`** over **DFT** (P03) — projects each **FT1** into a typed
    `Charge`: FT1-6 transaction type (Table 0017), FT1-7 transaction code (the
    institution charge code, CWE), FT1-11/12 extended/unit amounts, and the
    repeating FT1-19 diagnosis linkage. **No billing logic and no
    money-as-float** — amounts are surfaced as their **canonical CP wire text**
    (e.g. `"150.00^USD"`), never parsed to a `number`.

  New public types: `Appointment`, `AppointmentResource`, `ClinicalDocument`,
  `Charge`. Breadth helpers only — not a scheduling-workflow state machine,
  signature verification, or a claims/pricing engine (roadmap §9
  known-limitations). Never throws on malformed input (HELPERS-07); missing
  fields → omitted keys.

- **NTE narrative grouping — notes attached to their parent by position (roadmap
  Phase P, P1).** NTE (Notes and Comments) segments are now grouped to their
  parent **by position** and surfaced on the relevant helper output. An NTE
  inherits its meaning entirely from the segment it immediately follows (HL7 v2
  Ch. 2 — no link field), so attachment is positional: in an ORU
  (`{ [ORC] OBR [{NTE}] [{ [OBX] [{NTE}] }] }`, Ch. 7) a note after `OBX` lands on
  **that result** (`observation.notes`), a note after `OBR`/`ORC` on the **order**
  (`order.notes` — ORC notes first, then OBR), and a note after `PID` on the
  **patient** (`msg.patient.notes`). A note with **no recognized preceding
  parent** — after `MSH`, or after an unsupported segment like `PV1`/`AL1` — is
  surfaced at **message level** via the new **`msg.notes()`**. **Fail-safe —
  never mis-attached, never dropped:** the parent is the _nearest preceding
  non-NTE segment_ (consecutive NTEs chain; any intervening non-parent segment
  resets the target). Order-level notes mirror the `orders()` state machine —
  notes after an `ORC` are buffered and flushed onto the OBR that opens the
  order, so **several `ORC`s before one `OBR` all contribute** in document order,
  not just the last. A note whose recognized parent has **no surfaced
  projection** — a **later `PID`** in a multi-patient ORU (patient view is the
  first PID), or a **trailing/dangling `ORC`** whose order never opens — is
  routed to `msg.notes()` rather than vanishing. Each non-empty **NTE-3 (Comment,
  FT, repeating)** repetition is one note line, with the **full** repetition text
  reassembled + HL7-unescaped, so a non-conformant raw `^`/`&` (which tokenizes
  NTE-3 into components) is preserved, not silently truncated. New optional
  `notes?: readonly string[]` on `Observation`, `Order`, and `Patient` (omitted
  when empty, frozen when present). **Additive only — no rename, no removal, no
  new warning code.** Deferred: NTE-2 (source of comment) / NTE-4 (comment type)
  interpretation, FT formatting-command rendering, and first-class
  `patient.notes` on a 2nd+ `PID`'s group. See `docs-content/spec-notes-nte.md`.
- **Character-set / encoding decode — MSH-18 / Table 0211 (roadmap Phase O,
  P1).** `parseHL7` now resolves a `Buffer` input's declared character set from
  **MSH-18** and decodes the byte stream to text **before** tokenization, through
  a frozen HL7 **Table-0211 registry** (`resolveCharset` / `canonicalCharset`,
  exported). MSH-18 is honoured as a **repeating** field — the **first**
  occurrence is the message default, a blank field is 7-bit **ASCII**. Decodes
  **`8859/1`** via Node's true `latin1` (byte-exact; Node's WHATWG
  `TextDecoder("iso-8859-1")` is windows-1252 and remaps the C1 range, so it is
  not used), ASCII / **UTF-8** (`UNICODE UTF-8` / `UNICODE`), and the faithfully
  decoded **ISO-8859** sets (`8859/2`–`8859/8`, `10`, `13`–`16`); `8859/9` and
  `8859/11` are **recognized but preserved verbatim** because Node's ICU aliases
  them to windows-1254/874 (which remap the C1 range — no faithful decoder). The
  multibyte / ISO-2022 East-Asian sets (`ISO IR14/87/159`, GB 18030, KS X 1001,
  CNS 11643, BIG-5) and UTF-16/32 are likewise **recognized and preserved
  verbatim** (full stateful decode is a documented non-goal). The §2.7.4 charset-switch escapes (`\Cxxyy\` / `\Mxxyyzz\`) are
  recognized by the escape layer and preserved. **Fail-safe (never guess, never
  silently corrupt):** decoding is **strict** (`fatal: true`) except byte-exact
  `8859/1`, so a byte invalid/undefined for the declared set does **not** become a
  silent `U+FFFD` — the bytes are read as a `latin1` 1:1 mapping and a warning
  fires: new **`UNSUPPORTED_CHARSET`** for a recognized set that was not decoded
  (never-decoded, or a strict-decode failure), existing `UNKNOWN_CHARSET` for a
  value not in Table 0211. Recoverability is exact for single-byte content;
  multibyte content is best-effort (a code-unit byte can coincide with a structural
  delimiter — documented). **Behaviour change (pre-alpha):** `UNKNOWN_CHARSET` now
  reads bytes as `latin1` instead of falling back to UTF-8. Both warnings carry the
  charset code only — never a field value — so no PHI is exposed. New public warning
  code `UNSUPPORTED_CHARSET` (`WARNING_CODES` 18 → 19). See
  `docs-content/spec-notes-charset.md`.

- **Order / medication timing — `order.timings` + `med.timings` (roadmap
  Phase M).** `orders()` and `medications()` now surface the timing **structure**
  of an order/medication as a typed `OrderTiming[]`, read from the `TQ1` segment
  (HL7 v2.5+, Ch. 4 §4.5.4) or the **legacy embedded TQ** data type in `ORC-7` /
  `RXE-1` (pre-v2.5, Ch. 2A §2.A.81, detail withdrawn as of v2.7). Modelled:
  TQ1-2 quantity (CQ), **TQ1-3 repeat pattern (RPT, Table 0335)**, TQ1-4 explicit
  time, TQ1-6 service duration, TQ1-7/-8 start/end (DTM → the Phase N fidelity
  `TS`), TQ1-9 priority (CWE), and **TQ1-14 total occurrences (NM) — not TQ1-11**
  (the Text Instruction). The repeat pattern is surfaced **verbatim**
  (`repeatPattern.code`) — never normalized, resolved to clock times, or mapped
  to a different frequency (reading `Q6H` as "daily", or losing a `BID`, changes
  the administered dose count). A provenance-only `kind`
  (`parametric`/`named`/`unknown`) never drives a schedule; a `parametric`
  `Q<integer><unit>` template surfaces its **load-bearing integer** on
  `repeatPattern.interval`, never dropped. `TQ1` vs the legacy embedded TQ is
  chosen **by presence** (`source: "TQ1" | "legacy"`) — the legacy field is read
  only when no `TQ1` accompanies the group, so the same timing is never
  double-counted and a legacy-only timing is never dropped (the legacy source is
  `ORC-7` for an order, `RXE-1` or the preceding `ORC`'s `ORC-7` for a
  medication). Timings group positionally — a `TQ1` may sit either side of the
  order detail, an intervening `ORC` re-scopes a following `TQ1` to the next
  order, and multiple `TQ1` segments each surface (a tapering schedule). New
  public types `OrderTiming`, `RepeatPattern`,
  `RepeatPatternKind`, `TimingQuantity`; `Order` / `Medication` gain an
  always-present `timings` array. **Additive only** — no rename, no removal, **no
  new warning code**. hl7 surfaces the timing structure only; it does not compute
  schedules, resolve "institution-specified times", or interpret sig. Non-goals:
  `TQ2` beyond segment recognition, schedule computation, 2nd+ repetitions of
  repeating timing fields. Never throws (HELPERS-07). See
  `docs-content/spec-notes-timing.md`.

- **`splitBatch()` — batch / file envelope splitting (roadmap Phase L).**
  Demarcates the individual `MSH`-led messages inside an HL7 v2 batch/file
  stream (`[FHS] { [BHS] { MSH… } [BTS] } [FTS]`, HL7 v2 Ch. 2 §2.10.3) and
  hands each one back parsed — either `{ ok: true, message }` or, for a message
  that trips a Tier-3 fatal, `{ ok: false, error }`. A **malformed message
  mid-batch is isolated**, never suppressing its siblings; a **bare single
  message** (no envelope) passes straight through. Declared counts are
  reconciled — **BTS-1** (batch message count) against the messages in the
  batch, **FTS-1** (file batch count) against the batches in the file — and a
  mismatch surfaces the new Tier-2 `BATCH_COUNT_MISMATCH` warning **without ever
  dropping the tail**; an absent (`[0..1]`) or non-numeric count tolerantly
  disables reconciliation. A `BHS`/`FHS` header with no matching `BTS`/`FTS`
  raises the new `BATCH_MISSING_TRAILER` warning (`splitBatch` warns, never
  rejects — enforcing a mandatory envelope is the caller's call). Batch-level
  warnings live on the returned `BatchSplitResult.warnings` (never on
  `Hl7Message.warnings`) and carry **counts / segment names / positions only —
  no PHI**. A `Buffer` stream round-trips through `latin1` so each message's own
  MSH-18 charset resolution runs on its original bytes. Kept a **separate
  surface** from `parseHL7` (which rejects non-`MSH`-first input by design).
  New public exports: `splitBatch`, the `batchCountMismatch` /
  `batchMissingTrailer` factories, and types `Batch` / `BatchSplitResult` /
  `BatchMessageEntry` / `BatchEnvelopeSegment` / `BatchEnvelopeName`. **Two
  additive Tier-2 warning codes** (`BATCH_COUNT_MISMATCH`,
  `BATCH_MISSING_TRAILER`) — the stable warning-code contract grows 16 → 18.
  `batches` holds each message run delimited by a `BHS` and/or a `BTS` (a run
  with neither is still yielded in `messages`, wrapped in no batch); FTS-1
  reconciles **per-file** so concatenated files raise no false mismatch. Split-only: no
  batch ACK generation, no envelope enforcement, BTS-3 totals surfaced but not
  reconciled, no transport de-framing (that is `@cosyte/mllp`). Two structural
  limits are documented: reserved envelope names are matched by name (a body
  literally containing `FHS`/`BHS`/`BTS`/`FTS` is mis-split, its tail surfaced
  as a `NO_MSH_SEGMENT` failure — never silently dropped), and one file envelope
  per stream is the modelled case. See `docs-content/spec-notes-batch.md`.
- **`identityEvents()` — patient-identity / merge events (roadmap Phase K, P0
  safety).** `msg.identityEvents()` recognizes the ADT identity-management
  trigger family — merges (A18/A34/A35/A36/A39/A40/A41/A42), moves (A43/A44),
  link/unlink (A24/A37), person add/update (A28/A31) — and surfaces every
  party **labelled by role with segment provenance**: the `surviving` party is
  only ever sourced from PID/PV1, the `prior` (non-surviving) party only ever
  from MRG, and the merge direction is the spec constant `MRG_TO_PID` (HL7 v2
  Ch. 3, A18: PID carries the surviving information, MRG the non-surviving) —
  never inferred from content. Repeating PID+MRG groups yield one event each.
  Fail-safe: an incomplete MRG→PID pair (no MRG, an orphaned MRG — which is
  never dropped — or a PID with no surviving identifier) surfaces what is
  present plus a new event-scoped Tier-2
  **`MERGE_MISSING_PRIOR_OR_SURVIVOR`** warning carrying structural facts
  only (never an identifier or name — no PHI). The MRG field map is
  **version-scoped**: the backward-compat single-ID fields (MRG-4 / PID-2,
  withdrawn as of v2.7) are not read when MSH-12 declares v2.7+. Applying the
  merge (re-pointing data) stays the consumer's job. New public surface:
  `Hl7Message.identityEvents()`, types `IdentityEvent` / `IdentityParty` /
  `IdentityEventKind` / `IdentityRole`, the `mergeMissingPriorOrSurvivor`
  factory, and the `MERGE_MISSING_PRIOR_OR_SURVIVOR` code. Additive only.
- **`MRG` is now a known segment** — parsing a merge message no longer emits
  a spurious `UNKNOWN_SEGMENT` warning for MRG.
- **`Field.text`** — the field's canonical wire text (full repetitions/
  components/subcomponents re-serialized with the active delimiters), the
  whole-field counterpart to the component-1-only `Field.value`.
- **`downgradePositiveAck(code)`** — the single upstream source of truth for
  the fail-safe downgrade pair (`AA`→`AE`, `CA`→`CE`; everything else passes
  through), now exported so `@cosyte/mllp`'s `ack-from-hl7` adapter reuses it
  instead of carrying a divergent copy. **`isPositiveAck`** is exported
  alongside it.

### Documentation

- **Adopted the documentation IA spine in `docs-content/`** (umbrella DOCS-D5; reference
  exemplar for the suite). The three `spec-notes-*.md` files (coding-system provenance,
  message-type & structure awareness, version-sensitivity matrix) are now grouped under a
  canonical **Core Concepts** category on `docs.cosyte.com` — they previously existed in
  `docs-content/` but were not referenced from `sidebars.json` and so were unreachable from
  any rendered route. Each now carries minimal frontmatter (`id` / `title` /
  `sidebar_label`) so the sidebar text stays concise; the prose is unchanged. Also
  converted the two CommonMark autolinks in `spec-notes-coding-system.md`
  (`<https://…>`) to Docusaurus-MDX-safe `[text](url)` form — autolinks parse as JSX in
  MDX 3, which silently broke the link rendering. Doc-only — no runtime/API change.

- **Added a standard-reference primer (`spec-notes-primer.md`), first under Core Concepts.**
  The other `spec-notes-*` pages are implementation notes (what the parser does about one
  spec area); the primer is the spec-grounded companion they elaborate — the v2.x encoding
  model (MSH-1/MSH-2 delimiter bootstrap, the fixed `CR` terminator, the
  field→component→subcomponent hierarchy where only fields repeat), the three field
  population states (populated / not-populated / **null** `|""|`), the abstract message
  grammar (`[ ]` / `{ }` / `[{ }]`, base `OPT` vs. v2.7+ conformance `Usage` codes, and the
  required-different-name-separator rule that makes a flat segment stream reconstructable),
  the **three**-component `MSH-9`, the acknowledgement model (`MSH-15`/`MSH-16`; `CA/CR/CE`
  vs. `AA/AE/AR`), and the `CX`/`XPN`/`XAD`/`HD` composite layouts with their version deltas.
  Cross-links the phase notes for areas they already cover rather than duplicating them, and
  records its provenance (primary Chapter 2 / 2.A text, adversarially fact-checked; the
  official HL7 spec is the text of record). Doc-only — no runtime/API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact — `@cosyte/hl7`
  ships zero runtime dependencies, so the published artifact is unchanged).**
  Added scoped `pnpm.overrides` pinning two transitive **dev/build-time**
  packages to their patched releases: `esbuild` (`>=0.27.3 <0.28.1` →
  `0.28.1`; GHSA dev-server path-traversal — not reachable here: the library
  builds via `tsup`/`vitest` and never runs `esbuild serve`) and the
  `@changesets/parse` copy of `js-yaml` (`>=4.0.0 <4.2.0` → `4.2.0`;
  GHSA-h67p-54hq-rp68 merge-key DoS). The `js-yaml@3.14.2` pulled by
  `read-yaml-file@1.1.0` (via `@manypkg/get-packages` → `@changesets/cli`) is
  **intentionally left**: it calls `yaml.safeLoad`, removed/throwing in
  js-yaml 4, so it cannot be force-upgraded without breaking the release
  tooling, and it only parses trusted local repo YAML at release time. This is
  the shared canonical override block, enforced suite-wide by the
  `@cosyte/config` drift check.

### Changed

- Adopted the shared `@cosyte/*` toolchain standard: ES2023, ESLint 10 + type-checked
  `typescript-eslint`, Vitest 4, `@types/node` 22, exact-pinned dev tools, the shared
  `@cosyte/tsup-config` / `@cosyte/vitest-config`, and thin callers of the reusable `cosyte/.github`
  CI/release workflows. No public API change.
- **Test bar** — added executable PHI-safety property tests
  (`test/property/phi-safety.property.test.ts`). Locks two invariants: warning messages never echo
  field VALUES (only positional context + bounded metadata), and `Hl7ParseError.snippet` length
  stays ≤ 41 chars (40 + ellipsis) for adversarially-large inputs. Snippet **content** may carry
  PHI by design (see `parser/errors.ts:70-72` — the documented consumer-redaction boundary); the
  bound is what we lock in. Does **not** use `@cosyte/test-utils`' `assertNoSecretLeak` — that's
  for `Secret<T>` wrappers (the pathways credentials pattern) and is the wrong shape for parser-
  side PHI surfaces.
- **Coverage policy — `src/profiles/**`coverage hole closed, global`branches`floor restored to
90 (roadmap Phase J, supersedes/absorbs the`H-PHI` coverage-policy entry above).** The D10
transient relaxation is now RESOLVED: targeted tests
(`test/profiles-merge-validate-coverage.test.ts`) closed the `mergeCustomSegments`/inheritance
branches in `profiles/merge.ts`and the validator branches in`profiles/validate.ts`+`profiles/describe.ts`that were unreachable via the public`defineProfile()`API alone.`src/profiles/\*\*`now carries its own`>= 90`per-directory coverage gate
(lines/branches/functions/statements) in`vitest.config.ts`, and the global `branches` floor is
back to the canonical 90 — no remaining relaxation. One line
(`validate.ts`'s `validateUniqueFieldNames`throw branch) stays intentionally uncovered and is
documented as provably unreachable by any legally-typed`Record<string, number>`(proven: no
real JS object — literal,`Map`, `Proxy`, or otherwise — can hold two same-named enumerable own
  keys), matching the module's own defense-in-depth JSDoc.
- **Reference test bar — fuzz target, PHI-exec surfaces, and a differential harness (roadmap Phase
  J, "finish the reference test bar").** Three additions, no behavior change:
  - `test/property/fuzz.property.test.ts` — a dedicated high-run-count (1000 runs/property, fixed
    seed) fuzz harness on top of the existing `lenient.property.test.ts` invariant
    ("`parseHL7` either returns an `Hl7Message` or throws an `Hl7ParseError` with one of the 4
    `FATAL_CODES`, never anything else"). Adds two generator families the existing suite didn't
    cover: delimiter-mutation (inject/duplicate/drop the five HL7 delimiters + `\r`) of REAL
    canonical-corpus messages, and truncations of those same messages at every cut point. Also
    snapshots `FATAL_CODES`/`WARNING_CODES` registry membership and asserts a "survivor
    round-trip" property (anything that parses can be `toString()`'d and re-parsed without
    throwing).
  - `test/property/phi-safety-surfaces.property.test.ts` — extends
    `phi-safety.property.test.ts` (which covers the WARNING surface) to the FATAL error-message
    surface: over PHI-shaped field values that trigger each reachable fatal code, asserts
    `Hl7ParseError.message` carries only structural/positional facts, never an echoed field value.
    Separately asserts the documented `errors.ts` snippet contract (bounded length, not
    value-absence — snippets MAY carry PHI by design, redaction is a consumer responsibility) holds
    for BOTH the direct-fatal snippet path and the strict-mode-escalation snippet path
    (`index.ts::buildSnippet`, a distinct call site). Also documents, with a round-trip test, that
    `toString()`/`toJSON()`/`prettyPrint()` legitimately contain field values (content surfaces,
    not diagnostic/log surfaces) so they're never mistaken for a leak path.
  - `test/differential/differential.test.ts` — an oracle-gated differential harness comparing
    `@cosyte/hl7` against the external **python-hl7** parser (BSD license, PyPI package `hl7`) over
    the full canonical corpus (27 fixtures): segment count + per-segment field-text parity. Skips
    gracefully (`it.skip`) when no Python + `hl7` package is available, so `verify.sh`/CI stay green
    without Python. One real, honest divergence was found and documented: `@cosyte/hl7`'s D-02
    trailing-empty-component canonicalization (`Field.text` strips trailing empty
    components/subcomponents; python-hl7's `str()` preserves them verbatim) — see
    `docs-content/spec-notes-differential.md` for the full writeup, licensing bound, and other
    plausible-but-unobserved divergence classes.

### Fixed

- **Conformance — v2.7+ truncation char no longer rejects spec-conformant input** (roadmap Phase A,
  P0 correctness). `readDelimiters` previously hard-coded MSH-2 length to 4 and threw the Tier-3
  fatal `INVALID_ENCODING_CHARACTERS` on a 5-char MSH-2, so a spec-valid v2.7+ message carrying the
  truncation character (`^~\&#` and friends) was rejected outright — a fail-unsafe rejection of
  valid input. The parser now accepts both shapes: 4-char (v2.1–v2.6) and 5-char (v2.7+, spec
  §2.5.5.2 — the 5th char is the truncation character, default `#`). The `EncodingCharacters` type
  gains a new optional `truncation?: string` field that is set ONLY when MSH-2 actually declared
  one, so messages that predate v2.7 round-trip with a 4-char MSH-2 unchanged. The serializer +
  builder emit the 5th char back when present; pre-v2.7 messages are unaffected.
- **Conformance — standard escape sequences no longer warn as `UNKNOWN_ESCAPE_SEQUENCE`** (roadmap
  Phase A). Six spec-defined escape families are now recognized:
  - `\P\` — truncation character. **Decoded** to `enc.truncation ?? "#"` (spec §2.5.5.2). On
    serialize, the truncation character is re-escaped back to `\P\` ONLY when MSH-2 declared one,
    so pre-v2.7 messages round-trip the character literally.
  - `\H\` / `\N\` — highlight on / off (spec §2.7.1). **Recognized but preserved verbatim** — the
    parser does not pick a presentational policy; the markers stay in the decoded string for a
    downstream renderer to consume.
  - `\.sp\`, `\.in\`, `\.ti\`, `\.fi\`, `\.nf\`, `\.ce\` — formatting commands (spec §2.7.6).
    Recognized and preserved verbatim, same rationale as highlight.
  - `\Cxxyy\` (single-byte) and `\Mxxyyzz\` (multi-byte, 4 or 6 hex) — character-set switches
    (spec §2.7.4). Recognized and preserved verbatim because byte-accurate decoding requires
    charset state this module does not own.

  No public surface is removed or renamed; the `WARNING_CODES` registry is unchanged
  (snapshot test asserts additions-only). `\Z..\` (vendor-specific) and genuinely-malformed bodies
  still warn + preserve as before. New fixtures in `test/fixtures/edge-cases/` (`truncation-char-msh2.hl7`,
  `escape-highlight.hl7`, `escape-formatting.hl7`) lock the behavior, including byte-exact
  round-trip through `toString()`.

- **Conformance — SN (Structured Numeric) results no longer silently drop the comparator/range**
  (roadmap Phase B, P0 safety). An `OBX-2 = SN` value (e.g. `<^10`, `>^90`, `^100^-^200`, `^1^:^128`)
  previously fell through the plain-string branch, where `<^10` collapsed to the bare string `"<"` —
  a misread clinical result with a documented patient-harm path (a "less-than 10" result reading as
  the operator alone). `msg.observations()` now dispatches `SN` to a typed `SN` value
  (`comparator` / `num1` / `separatorOrSuffix` / `num2`). Fail-safe by construction: `num1`/`num2` are
  strict-`Number()` parsed (`undefined`, **never `NaN`**), and the comparator is surfaced ONLY when
  SN.1 is a recognized operator (`>` `<` `>=` `<=` `=` `<>`) — a non-operator in the comparator slot
  is never passed off as a real relation. The comparator is preserved byte-for-byte across a
  serialize → parse round-trip. New canonical fixture `test/fixtures/canonical/oru-r01-sn-results.hl7`
  and property tests (`test/property/sn.property.test.ts`) lock the invariant over thousands of
  generated values.

- **Types resolution from CommonJS** — the `exports` map now points the `require` condition's types at
  `dist/index.d.cts` (was `index.d.ts`), fixing a "masquerading as ESM" (`attw` FalseESM) issue for
  CJS consumers.

### Added

- **Version-sensitivity hardening** (roadmap Phase H, P1) — the coded-element
  composites are now robust to **append-only component growth** across HL7
  v2.1–v2.8, with **no silent truncation**. `CWE` and `CE` gained an optional
  `extraComponents: readonly string[]` that preserves any components beyond the
  modeled set verbatim and in order: **CWE component 10+** (the v2.7
  second-alternate triplet + coding-system / value-set OIDs) and **CE component
  7+**. An absent interior component is held as `""` so `extraComponents[i]`
  maps back to its HL7 component number; trailing empties are stripped and the
  key is omitted when there is nothing past the modeled set. This also unifies
  **CE↔CWE** reading — because each accessor preserves the other's extra
  components, reading a CWE-shaped value through `asCe()` is no longer lossy (CE
  was deprecated at v2.5, withdrawn at v2.6 in favor of CWE). Parsing a coded
  element with an arbitrary number of trailing components **never throws**
  (forward-compatibility with future versions). The CWE coding-system version
  ids (CWE.7/CWE.8) were already surfaced. Added a `version-growth` property
  test (no-loss / no-throw / CE↔CWE uniformity) and the supported-version matrix
  in `docs-content/spec-notes-version-matrix.md` (incl. the **TS→DTM**
  supersession and the **MSH-21** Conformance Statement ID → Message Profile
  Identifier rename at v2.5). Additive only — `extraComponents` is a new optional
  field; no rename, no removal, no new warning code.
- **Message-type & structure awareness** (roadmap Phase G, P1) — a conservative
  **misroute / truncation safety net**. `msg.structure` reports, for the common
  message types, whether the core segment groups the HL7 v2.5.1 abstract syntax
  marks **Required** for that trigger event are present; the parser also emits a
  single additive Tier-2 `MISSING_EXPECTED_GROUP` warning per absent group (e.g.
  an `ORU^R01` with no `OBR`/`OBX` result group). Keys on the **trigger event**,
  not the message family, and models **Required anchors only** (EVN in ADT, PID
  in ORU/SIU, OBR in OML/OMG/OMI, RXA in VXU are deliberately excluded) so a
  conformant-but-sparse message never warns — every well-formed canonical
  fixture emits zero structural warnings. Recognized types: ADT
  (A01/A02/A03/A04/A05/A08/A11/A13), ORU^R01, ORM^O01, OML^O21, OMG^O19,
  OMP^O09, OMI^O23, SIU (S12–S26), MDM (T02/T06), DFT^P03, VXU^V04, ACK; an
  unrecognized type yields `recognized: false` and emits nothing. Warning-only
  (Tier-2) — lenient parse never throws, `strict` may promote; the message
  carries only structural facts (type, group, anchor names), never a field
  value (no PHI). New public surface: `Hl7Message.structure`, the
  `missingExpectedGroup` warning factory, the `MISSING_EXPECTED_GROUP` code, the
  read-only `MESSAGE_STRUCTURE_DEFINITIONS` registry, `analyzeMessageStructure`,
  and types `MessageStructure`, `StructureGroup`, `ExpectedSegmentGroup`,
  `MessageStructureDefinition` (see `docs-content/spec-notes-structure.md`).
- **Coding-system provenance** (roadmap Phase F, P1) — `codingSystem(id)`,
  `codingSystemOf(coded)`, and `alternateCodingSystemOf(coded)` answer "what
  system does this code CLAIM?" off a `CWE` / `CE` (CWE.3 / CE.3 primary,
  CWE.6 / CE.6 alternate). Alias-normalized + case-insensitive
  (`LOINC` → `LN`, `SNOMED` → `SCT`, `RxNorm` → `RXN`) with the original
  spelling preserved verbatim in `claimed`; an unregistered / local id is
  surfaced verbatim with `known: false` (never dropped, never guessed); a
  no-claim input returns `undefined`. The recognized subset is the frozen,
  read-only `KNOWN_CODING_SYSTEMS`: `LN`, `SCT`, `I10`, `I10P`, `RXN`, `NDC`,
  `CVX`, `MVX`, `UCUM`. **Provenance only** — no validation, lookup, network,
  or bundled codeset. `I10` reports the registered Table 0396 claim `ICD-10`
  (the WHO base), NOT a guessed `ICD-10-CM` (see
  `docs-content/spec-notes-coding-system.md`). New public types
  `KnownCodingSystem`, `CodingSystemInfo`, `CodedSystemFields`.
- **Parser** — `parseHL7(raw, optionsOrProfile?)` with a lenient default
  parser that handles vendor-quirky HL7 v2.1–v2.8 input, and a
  `{ strict: true }` mode that escalates every Tier-2 deviation to a thrown
  `Hl7ParseError`. Accepts `string` or `Buffer` input; honours MSH-18
  character set with a user `charset` override option.
- **Warning system** — 14 stable Tier-2 warning codes with positional
  context (`segmentIndex`, `fieldIndex`, `repetitionIndex`, `componentIndex`,
  `subcomponentIndex`): `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`,
  `UNKNOWN_ESCAPE_SEQUENCE`, `TIMESTAMP_FALLBACK_FORMAT`, `SEGMENT_CASE`,
  `EXTRA_FIELDS`, `UNKNOWN_SEGMENT`, `DUPLICATE_REQUIRED_SEGMENT`,
  `ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT`,
  `VERSION_MISMATCH`, `UNKNOWN_CHARSET`, `ACK_NO_CORRELATION_ID`. Exposed via
  `msg.warnings` and the `onWarning` callback.
- **Fatal errors** — 4 Tier-3 fatal codes always thrown as `Hl7ParseError`
  (even in lenient mode): `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
  `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Each error carries
  `message`, `position`, and `snippet`.
- **Structural model** — immutable `Hl7Message` with dot-path access
  (`msg.get("PID.5.1")`, `msg.get("OBX[2].5")`), typed `Segment` and
  `Field` wrappers, and `msg.segments("OBX")[0].field(3)` traversal.
  Safe-access semantics (`undefined` / `[]` for missing paths, never
  throws).
- **Composite types** — parsed instances and exported TypeScript
  interfaces for XPN, XAD, CX, CWE, CE, XTN, PL, TS/DTM, NM, SN, HD, and XCN
  (12 types). Also available under the `HL7` namespace:
  `import { HL7 } from "@cosyte/hl7"; type T = HL7.XPN`.
- **`SN` composite + `Field.asSn()`** (roadmap Phase B) — `parseSn` /
  `SN` / `HL7.SN` export the Structured Numeric datatype (comparator,
  num1, separator/suffix, num2), and `field.asSn()` coerces an OBX-5 to it.
  `msg.observations()` returns `{ valueType: "SN", value: SN | undefined }`
  for `OBX-2 = SN`.
- **`observation.unitsAreUcum`** (roadmap Phase B) — a boolean claim-check
  flag, `true` iff OBX-6's coding system (CWE.3) is exactly `UCUM`
  (HL7 Table 0396). `false` when a unit is present but not declared UCUM
  (surfaced as-is, never coerced); omitted entirely when OBX-6 is absent.
  This is a claim check only — the library does not validate UCUM grammar
  or convert units.
- **Named helpers** — one-line extraction for the most common HL7
  fields: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`,
  `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`,
  `msg.insurance()`, `msg.medications()`, `msg.immunizations()`. All helpers
  return `undefined` / empty arrays for missing optional data — they never throw.
- **`msg.medications()`** (roadmap Phase D, P0 safety) — projects every
  RXO / RXE / RXD / RXA segment into a typed `Medication` across the four
  pharmacy contexts (`order` / `encoded` / `dispense` / `administration`),
  grouping the RXR (route, Table 0162 + site Table 0163) and RXC
  (component) segments that follow each parent positionally — the same
  state-machine `orders()` uses for OBR → OBX. The give code carries its
  own coding-system provenance (`giveCode.nameOfCodingSystem`); the give
  **amount** (how much) and the give **strength** (concentration, RXE-25/26)
  are surfaced as **separate fields and are never reconciled** — a strength
  a coded drug (e.g. an NDC) implies never validates or overwrites the
  explicit RXE-25 strength, so a disagreement is preserved for the caller.
  Numerics are strict-`asNm()` parsed (absent/blank → key omitted, never
  `NaN`); output is frozen; not memoized. Never throws (HELPERS-07). New
  public types: `Medication`, `MedicationContext`, `MedicationAmount`,
  `MedicationStrength`, `MedicationRoute`, `MedicationComponent`.
- **`msg.immunizations()`** (roadmap Phase E, P0 safety) — projects every
  RXA segment of a VXU^V04 into a typed `Immunization`, grouping the RXR
  (route, Table 0162 + site Table 0163) and OBX (VFC eligibility / funding
  source) segments that follow each RXA positionally, and carrying
  `orderControl` from the preceding ORC of the `ORC`→`RXA`→`[RXR]`→`[{OBX}]`
  order group — the same state machine `orders()` uses for OBR → OBX. The
  action code (RXA-21, `A`/`D`/`U`) is surfaced **verbatim and never
  defaulted** — a mis-key corrupts an IIS add/delete/update dedup; the
  `recordOrigin` (administered vs historical) is derived **only** from the
  well-known NIP001 RXA-9.1 codes (`00`; `01`-`08`) and omitted otherwise —
  never guessed, with the raw RXA-9 claim always preserved on
  `informationSource`. The vaccine code carries its own provenance
  (`vaccineCode.nameOfCodingSystem`, CVX, + any CVX/NDC alternate);
  `doseAmount` is strict-`asNm()` parsed (the IIS unknown-dose sentinel `999`
  surfaced as the number `999`, never coerced). Output is frozen; not
  memoized. Never throws (HELPERS-07). New public types: `Immunization`,
  `ImmunizationRecordOrigin`.
- **Mutation** — `setField`, `addSegment`, `removeSegment` on
  `Hl7Message`. Direct field mutation on unwrapped objects has no effect
  (immutability by default).
- **Serialization** — `msg.toString()` emits spec-clean HL7 regardless
  of input quirks (Postel's Law); `msg.toJSON()` returns a structured
  JSON tree; `msg.prettyPrint()` returns a human-readable multi-line
  string for logs. Escape sequences are re-encoded on serialize.
- **Message builder** — `buildMessage({...}).addSegment(...).toString()`
  constructs valid outbound HL7 from scratch, with helpers for control
  IDs and HL7 timestamps.
- **ACK generation + interpretation** (roadmap Phase C) — `buildAck(inbound,
{ code, error?, mode? })` produces a spec-clean `MSH`+`MSA`[+`ERR`…]
  acknowledgment: sender/receiver swapped (full multi-component HDs
  preserved), MSH-9 = `ACK^<trigger>^ACK`, MSA-2 echoes the inbound MSH-10,
  and each `ERR` carries an ERL location (ERR-2), a Table 0357 condition code
  as a CWE (ERR-3), and a Table 0516 severity (ERR-4) — **codes and locations
  only, never echoed PHI**. `buildAck` is mechanical (emits the disposition it
  is told) with one safety override: an inbound with no MSH-10 cannot be
  correlated, so a requested positive `AA`/`CA` is downgraded to `AE`/`CE`,
  MSA-2 is left empty, and an `ACK_NO_CORRELATION_ID` warning rides on the
  returned message — it never fabricates an unverifiable positive ACK.
  `interpretAck(msg)` is the read-side: a typed `Acknowledgment` view whose
  `accepted`/`error`/`rejected` flags are derived fail-safe from MSA-1 (all
  three `false` on an absent or unrecognized code). `detectAckMode(inbound)`
  exposes the spec-exact original-vs-enhanced detection (MSH-15/16). Control
  vocabulary (Tables 0008/0357/0516/0155) ships as frozen read-only enums
  (`ACK_CODES`, `ERR_CONDITION_CODES`, `ERR_SEVERITIES`, `ACK_CONDITIONS`).
- **Profile system** — `defineProfile()` API with `extends` composition
  (single parent or array), merge semantics (scalars overwrite, arrays
  concat+dedupe, `customSegments` deep-merge per key, `onWarning` chains),
  `profile.describe()` introspection, `profile.lineage`, and
  `ProfileDefinitionError` with actionable messages on invalid input.
- **Default profile management** — `setDefaultProfile(p)`,
  `getDefaultProfile()`, `setDefaultProfile(null)`. Explicit arguments
  override; `parseHL7(raw, { profile: null })` opts out for a single call.
- **Five built-in vendor profiles** — `profiles.epic`, `profiles.cerner`,
  `profiles.meditech`, `profiles.athena`, `profiles.genericLab`. Each
  authored through the public `defineProfile()` API with date-format
  fallbacks and named Z-segments.
- **Segment.get(name)** — resolve custom-segment fields by declared
  name (e.g., `msg.segments("ZDP")[0].get("departmentCode")`) when a
  matching profile is applied.
- **Three runnable examples** — `examples/extract-patient-info.ts`,
  `examples/read-lab-results.ts`, `examples/modify-and-resend.ts`, each
  runnable via `pnpm tsx examples/<file>.ts` and smoke-tested via
  `pnpm examples` in CI.
- **Profile starter kit** — `examples/profile-starter-kit/`, a
  publishable template with its own CI + publish workflows,
  `CUSTOMIZING.md` walkthrough, and placeholder tokens
  (`{{YOUR_ORG}}` / `{{PROFILE_NAME}}`) that turn into a ready-to-publish
  profile package in minutes.
- **Documentation** — comprehensive README (value prop, quickstart,
  feature list, HL7-in-90-seconds primer, three access patterns, full
  cookbook, Profiles section, Real-World Tolerance table, Error
  Handling, Roadmap), `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`
  (MIT).
- **Tooling** — strict TypeScript (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), dual ESM + CJS build via tsup, Vitest
  with ≥ 90% per-directory branch coverage on `src/parser/`, `src/model/`,
  `src/helpers/`, `src/serialize/`, `src/builder/`. Lint, format, and
  TypeScript settings come from the shared `@cosyte/*` config packages
  (ESLint 9 + `typescript-eslint`). CI across Node 22 / 24.

### Changed

### Deprecated

### Removed

### Fixed

### Security

[Unreleased]: https://github.com/cosyte/hl7/commits/main
