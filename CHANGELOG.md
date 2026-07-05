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

- **`buildAck` now echoes the full inbound MSH-10 field into MSA-2** — the raw
  field structure is carried over whole (delimiters and repetitions included)
  instead of the component-1-only `meta.controlId` scalar. A vendor-quirk
  control id carrying an unescaped delimiter (`ID^X`) was previously truncated
  to `ID` silently, under a confident positive ACK — a sender correlating on
  the raw MSH-10 bytes (as `@cosyte/mllp`'s client does) would never match the
  ACK and resend indefinitely (HL7 v2 §2.9.2.2: an MSA-2 mismatch is a
  correlation failure). The no-correlation fail-safe now keys on the raw field
  carrying any content, so a leading-delimiter id (`^X`) correlates instead of
  being spuriously downgraded. **Known canonicalization limits** (the echo is
  the field's canonical re-serialization, not its original bytes): the ACK
  emits with default encoding characters (custom-delimiter senders are
  re-delimited spec-cleanly); hex escapes decode (`\X41\` → `A`); preserved
  formatting/vendor escapes (`\H\`, `\Z..\`) re-emit as escaped literal
  text; trailing insignificant empties canonicalize (D-02). Plain and
  delimiter-bearing ids — the overwhelmingly common case — echo byte-exact.
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
- **Coverage policy** — `vitest.config.ts` now records a D10 expiry for the global `branches:85`
  relaxation, naming the two events that lift the floor back to 90 (`src/profiles/**` reaches 90,
  or the profile system is replaced) and the re-evaluation cadence (every hl7 phase boundary).

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
